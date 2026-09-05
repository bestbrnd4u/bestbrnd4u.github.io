// ======================================
// Списання залишків за замовленнями
//
// НАВІЩО
// -------
// Залишки ставить людина (поле «Залишки на складі» в адмінці), але
// зменшувати їх руками після кожного замовлення — робота, яку
// неминуче забудуть. Цей крок робить це сам: бере замовлення, яких ще
// не врахував, і зменшує залишок того кольору й розміру, який
// замовили. Коли лишається нуль, товар САМ стає «під замовлення»
// (assets/js/stock.js).
//
// ЧОМУ ОКРЕМИЙ КРОК, А НЕ ТРИГЕР У БАЗІ
// --------------------------------------
// Залишки живуть не в базі, а в репозиторії: там їх редагує адмінка,
// звідти їх бере збірка сайту. База про них не знає й знати не може —
// вона не вміє комітити у git.
//
// ЩО ЦЕЙ КРОК ПАМʼЯТАЄ
// ---------------------
// Нічого. Уся памʼять — прапорець orders.stock_applied (міграція 010):
// «чи зайняті зараз ці одиниці товару цим замовленням». Тому крок
// самовідновлюється: пропустив запуск, упав посеред роботи, замовлення
// приїхало із запізненням — наступний запуск усе одно зробить рівно
// те, чого бракує.
//
// СКАСУВАННЯ ПОВЕРТАЄ ТОВАР
// --------------------------
// Клієнт передумав — річ повертається на полицю. Крок бачить
// «замовлення скасоване, а залишок списаний» і додає його назад. Якщо
// скасування скасують (у панелі адмінки таке можна), товар спишеться
// знову.
//
// ЗАПУСК
//   node scripts/apply-order-stock.js                     звіт, нічого не пише
//   node scripts/apply-order-stock.js --apply             змінює data/products/*.json
//   node scripts/apply-order-stock.js --plan-out=<файл>   зберігає план
//   node scripts/apply-order-stock.js --plan-in=<файл> --apply
//   node scripts/apply-order-stock.js --plan-in=<файл> --mark
//
// План через файл потрібен тому, що залишки лежать у ДВОХ гілках (dev
// і main), а база питається один раз: інакше замовлення, яке приїхало
// між двома запитами, потрапило б в одну гілку й не потрапило в іншу.
// Так це й робить .github/workflows/apply-stock.yml.
//
// Потрібні змінні середовища SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY.
// Без них крок нічого не робить і завершується успішно — щоб розклад
// не червонів, поки секрети не додали.
// ======================================

const fs = require("fs");
const path = require("path");

const { normalizeProductColors } = require("./normalize-colors");

const ROOT = path.join(__dirname, "..");
// Тека з товарами. Її можна перевизначити (--dir=…), і це не примха:
// списувати треба у ДВОХ гілках, а сам скрипт лежить лише в одній.
// Workflow викачує другу гілку поруч і показує на неї цим аргументом.
function productsDir() {

    const found = process.argv.find(item => item.startsWith("--dir="));

    return found ? path.resolve(found.slice("--dir=".length)) : path.join(ROOT, "data", "products");

}

// Скасоване замовлення нічого не займає. Ключі статусів — ті самі, що
// в боті й у кабінеті (supabase/functions/telegram-order-bot/format.js).
const CANCELLED = new Set(["cancelled"]);

// -------------------------
// Чиста частина: що саме змінити
//
// Без мережі й без диска — сюди приходять уже прочитані замовлення й
// товари, звідси виходить перелік змін. Саме на ній працюють тести.
// -------------------------

// Назви кольорів у замовленні — ті, що бачив покупець на сайті, тобто
// ЗВЕДЕНІ до єдиного вигляду («Black чорний» → «Чорний»). У джерелі
// товару лишається те, що написав постачальник. Тому для кожного
// товару будуємо міст: зведена назва → назва в джерелі.
function colorBridge(data) {

    const clone = JSON.parse(JSON.stringify(data));

    normalizeProductColors(clone);

    const bridge = new Map();

    (data.variants || []).forEach((variant, index) => {

        const normalized = clone.variants[index] && clone.variants[index].color;

        if (variant && variant.color) {
            bridge.set(String(normalized || variant.color), variant.color);
        }

    });

    return bridge;

}

// Розміри цього кольору — так само, як їх бачить сайт.
function sizesOf(data, variant) {

    if (variant && Array.isArray(variant.sizes) && variant.sizes.length) return variant.sizes;

    return Array.isArray(data.sizes) ? data.sizes : [];

}

// Куди саме списувати: колір і розмір у назвах джерела.
//
// Замовлення старих часів можуть не мати ні кольору, ні розміру — тоді
// беремо єдиний варіант, якщо він єдиний. Вгадувати з кількох не
// станемо: списати не той колір гірше, ніж не списати нічого.
function locate(data, item) {

    const variants = (data.variants || []).filter(v => v && v.color);

    if (!variants.length) return { error: "у товарі немає кольорів" };

    let variant;

    if (item.color) {

        const bridge = colorBridge(data);
        const raw = bridge.get(String(item.color)) || String(item.color);

        variant = variants.find(v => v.color === raw);

        if (!variant) return { error: `кольору «${item.color}» більше немає в товарі` };

    } else if (variants.length === 1) {

        variant = variants[0];

    } else {

        return { error: "у замовленні не вказано колір, а їх кілька" };

    }

    const sizes = sizesOf(data, variant).map(String);

    let size;

    if (item.size) {

        size = String(item.size);

        if (sizes.length && !sizes.includes(size)) {
            return { error: `розміру «${size}» більше немає в кольорі «${variant.color}»` };
        }

    } else if (sizes.length === 1) {

        size = sizes[0];

    } else if (!sizes.length) {

        return { error: "у товарі немає розмірів" };

    } else {

        return { error: "у замовленні не вказано розмір, а їх кілька" };

    }

    return { color: variant.color, size };

}

// Що зробити з кожним замовленням.
//
//   ще не враховане й не скасоване → списати
//   враховане й скасоване          → повернути
//   решта                          → нічого
function orderDirection(order) {

    const cancelled = CANCELLED.has(String(order.status || "").trim());
    const applied = Boolean(order.stock_applied);

    if (!applied && !cancelled) return { sign: -1, mark: true };
    if (applied && cancelled) return { sign: 1, mark: false };

    return null;

}

function parseItems(value) {

    try {
        const items = typeof value === "string" ? JSON.parse(value) : (value || []);
        return Array.isArray(items) ? items : [];
    } catch (error) {
        return [];
    }

}

/**
 * @param {Array} orders   рядки з таблиці orders
 * @param {Map}   products id товару → { file, data }
 * @returns {{ changes: Array, marks: Array, notes: Array }}
 */
function planChanges(orders, products) {

    const changes = [];   // { file, color, size, delta, order, title }
    const marks = [];     // { id, stock_applied }
    const notes = [];

    (orders || []).forEach(order => {

        const direction = orderDirection(order);

        if (!direction) return;

        const items = parseItems(order.items);

        if (!items.length) {

            notes.push(`замовлення ${order.order_number || order.id}: склад порожній`);

            // Позначаємо все одно: інакше воно висітиме в черзі вічно.
            marks.push({ id: order.id, stock_applied: direction.mark });

            return;

        }

        items.forEach(item => {

            const entry = products.get(Number(item.id));

            if (!entry) {

                notes.push(`замовлення ${order.order_number || order.id}: товару ${item.id} `
                    + `(${item.title || "без назви"}) уже немає в каталозі`);

                return;

            }

            const where = locate(entry.data, item);

            if (where.error) {

                notes.push(`замовлення ${order.order_number || order.id}, `
                    + `${item.title || item.id}: ${where.error}`);

                return;

            }

            const qty = Math.max(1, Math.floor(Number(item.qty) || 1));

            changes.push({
                file: entry.file,
                color: where.color,
                size: where.size,
                delta: direction.sign * qty,
                order: order.order_number || String(order.id),
                title: item.title || ""
            });

        });

        marks.push({ id: order.id, stock_applied: direction.mark });

    });

    return { changes, marks, notes };

}

// Застосувати зміни до даних товарів.
//
// Клітинку, якої немає, НЕ створюємо: порожньо означає «не рахуємо»
// (див. assets/js/stock.js). Ми не знаємо, скільки там було, і
// вигаданий нуль відправив би товар у «під замовлення» без підстав.
function applyChanges(changes, products) {

    const touched = new Map();   // file → data
    const notes = [];

    changes.forEach(change => {

        const entry = [...products.values()].find(p => p.file === change.file);

        if (!entry) return;

        const stock = entry.data.stock;

        if (!stock || !stock[change.color] || typeof stock[change.color][change.size] !== "number") {

            notes.push(`${change.file}: залишки для «${change.color} / ${change.size}» не ведуться `
                + `— замовлення ${change.order} не списано`);

            return;

        }

        const before = stock[change.color][change.size];

        // Нижче нуля не опускаємось: від'ємний залишок нічого не
        // означає, а «замовили більше, ніж було» — привід подивитись
        // очима, а не зупиняти крок.
        const after = Math.max(0, before + change.delta);

        if (after === before && change.delta < 0) {

            notes.push(`${change.file}: «${change.color} / ${change.size}» уже нуль `
                + `— замовлення ${change.order} нічого не змінює`);

        }

        stock[change.color][change.size] = after;

        touched.set(change.file, entry.data);

    });

    return { touched, notes };

}

// -------------------------
// Робота з диском і базою
// -------------------------

function readProducts() {

    const products = new Map();

    const dir = productsDir();

    if (!fs.existsSync(dir)) return products;

    fs.readdirSync(dir).filter(f => f.endsWith(".json")).forEach(file => {

        let data;

        try {
            data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
        } catch (error) {
            return;
        }

        if (typeof data.id === "number") products.set(data.id, { file, data });

    });

    return products;

}

async function supabase(url, key, path_, init = {}) {

    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path_}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            apikey: key,
            Authorization: `Bearer ${key}`,
            ...(init.headers || {})
        }
    });

    if (!response.ok) {
        throw new Error(`Supabase ${response.status}: ${await response.text()}`);
    }

    return response;

}

// Аргумент виду --plan-out=шлях
function arg(name) {

    const found = process.argv.find(item => item.startsWith("--" + name + "="));

    return found ? found.slice(name.length + 3) : null;

}

async function main() {

    const apply = process.argv.includes("--apply");
    const mark = process.argv.includes("--mark");

    // ЧОМУ ПЛАН ЗБЕРІГАЄТЬСЯ У ФАЙЛ
    //
    // Залишки лежать у двох гілках: dev (де їх редагує адмінка) і main
    // (звідки працює магазин). Списати треба в обох, інакше наступне
    // перенесення dev → main поверне старе число.
    //
    // Якби кожна гілка питала базу окремо, між запитами могло б
    // приїхати нове замовлення — і воно потрапило б в одну гілку, але
    // не в іншу. Тому база питається ОДИН раз, план кладеться у файл, і
    // далі той самий план застосовується до кожної гілки. Позначка в
    // базі ставиться в самому кінці, коли обидві гілки вже збережені.
    const planOut = arg("plan-out");
    const planIn = arg("plan-in");

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    let plan;

    if (planIn) {

        plan = JSON.parse(fs.readFileSync(planIn, "utf8"));

    } else {

        if (!url || !key) {

            // Не помилка: секрети могли ще не додати. Червоний розклад
            // щодесять хвилин нічого не пояснює, а лякає.
            console.log("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не задані — крок пропущено");

            if (planOut) fs.writeFileSync(planOut, JSON.stringify({ changes: [], marks: [], notes: [] }), "utf8");

            return;

        }

        // Беремо тільки те, що може щось змінити: неврaховані
        // замовлення й скасовані, які ще числяться врахованими.
        const query = "orders?select=id,order_number,status,items,stock_applied"
            + "&or=(stock_applied.is.false,and(stock_applied.is.true,status.eq.cancelled))"
            + "&order=created_at.asc&limit=500";

        const response = await supabase(url, key, query);
        const orders = await response.json();

        console.log(`Замовлень до обробки: ${orders.length}`);

        plan = planChanges(orders, readProducts());

    }

    (plan.notes || []).forEach(note => console.log(`   ⚠ ${note}`));

    if (planOut) fs.writeFileSync(planOut, JSON.stringify(plan, null, 2), "utf8");

    if (!plan.changes.length && !plan.marks.length) {
        console.log("Нічого змінювати");
        return;
    }

    plan.changes.forEach(change => {
        console.log(`   ${change.delta < 0 ? "−" : "+"}${Math.abs(change.delta)} `
            + `${change.file} · ${change.color} / ${change.size} `
            + `(замовлення ${change.order})`);
    });

    if (apply) {

        const { touched, notes } = applyChanges(plan.changes, readProducts());

        notes.forEach(note => console.log(`   ⚠ ${note}`));

        touched.forEach((data, file) => {
            fs.writeFileSync(path.join(productsDir(), file), JSON.stringify(data, null, 2) + "\n", "utf8");
        });

        console.log(`Оновлено товарів: ${touched.size}`);

    }

    if (mark) {

        if (!url || !key) throw new Error("для --mark потрібні SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY");

        // Позначаємо В САМОМУ КІНЦІ: якщо крок упаде раніше, наступний
        // запуск повторить роботу, а не втратить її.
        for (const item of plan.marks) {

            await supabase(url, key, `orders?id=eq.${encodeURIComponent(item.id)}`, {
                method: "PATCH",
                body: JSON.stringify({ stock_applied: item.stock_applied })
            });

        }

        console.log(`Позначено замовлень: ${plan.marks.length}`);

    }

    if (!apply && !mark) {
        console.log(`Це був звіт: змін ${plan.changes.length}, позначок ${plan.marks.length}. `
            + "Для запису додайте --apply");
    }

}

module.exports = { planChanges, applyChanges, locate, orderDirection, colorBridge };

if (require.main === module) {

    main().catch(error => {
        console.error("Не вдалося списати залишки:", error.message);
        process.exit(1);
    });

}
