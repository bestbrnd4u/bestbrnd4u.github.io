// Останній екземпляр не продається двічі.
//
// СИМПТОМ, ЯКИЙ ЦЕ ЗАКРИВАЄ
// --------------------------
// Залишки лежать у репозиторії, а списує їх крок за розкладом — раз
// на десять хвилин. Тобто після продажу останньої сумки сайт ще десять
// хвилин показував її як наявну, і двоє покупців отримували однакове
// підтвердження на один товар.
//
// Тепер перевірка живе в самій базі, у транзакції створення
// замовлення: друге замовлення чекає на першому (блокування рядка
// залишку) і позначає свій рядок як «під замовлення».
//
// ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ
// ---------------------
// 1. Знімок залишків у базі описує ТЕ САМЕ, що бачить покупець на
//    сайті: id, колір і розмір мусять збігатися символ у символ,
//    інакше база шукає рядок, якого немає, і мовчки нічого не
//    перевіряє.
// 2. Правила підрахунку зайнятих одиниць збігаються з тими, за якими
//    списує крон, — включно з датою відліку.
// 3. Порядок кроків у workflow: знімок ПІСЛЯ списання й ДО позначки.
// 4. Позначку видно там, де власник дивиться замовлення.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const sql = read("supabase/migrations/011-stock-reservation.sql");
const pushStock = require("../scripts/push-stock.js");

console.log("\n[1] Знімок описує те саме, що бачить покупець");
{
    // Головна пастка: у джерелі колір написаний по-своєму
    // («Green Glow — яскравий зелений»), а сайт і замовлення знають
    // його зведеним («Зелений»). Рядок із джерельним написанням база
    // ніколи не знайде — і перевірка мовчки не спрацює.
    const products = JSON.parse(read("data/products.json"));
    const sources = pushStock.readProducts(path.join(ROOT, "data", "products"));

    const rows = sources.flatMap(pushStock.rowsFor);

    check(`рядків у знімку — ${rows.length}`, rows.length > 0);

    const onSite = new Map();

    products.forEach(product => {
        (product.variants || []).forEach(variant => {
            Object.entries(variant.stock || {}).forEach(([size, qty]) => {
                onSite.set(`${product.id}|${variant.color}|${size}`, qty);
            });
        });
    });

    const mismatched = rows.filter(row => {

        const key = `${row.product_id}|${row.color}|${row.size}`;

        return !onSite.has(key) || onSite.get(key) !== row.qty;

    });

    check("кожен рядок збігається з тим, що показує сайт",
        mismatched.length === 0,
        mismatched.slice(0, 3).map(r => `${r.product_id} ${r.color}/${r.size}`).join(", "));

    check("нічого не загубилось", rows.length === onSite.size,
        `${rows.length} проти ${onSite.size}`);

    // Порожня клітинка — це «не рахуємо», а не нуль: товар без
    // залишків рядка не отримує, і база на нього нічого не перевіряє.
    const untracked = pushStock.rowsFor({
        id: 999,
        variants: [{ color: "Чорний", sizes: ["ONESIZE"] }]
    });

    check("товар без залишків рядків не дає", untracked.length === 0);

    const tracked = pushStock.rowsFor({
        id: 999,
        stock: { "Чорний": { ONESIZE: 0 } },
        variants: [{ color: "Чорний", sizes: ["ONESIZE"] }]
    });

    check("явний нуль рядок дає", tracked.length === 1 && tracked[0].qty === 0,
        JSON.stringify(tracked));

    // Розпроданий товар зник із сайту — рядок у базі лише заважав би.
    const sold = pushStock.rowsFor({
        id: 999,
        soldOut: true,
        stock: { "Чорний": { ONESIZE: 5 } },
        variants: [{ color: "Чорний", sizes: ["ONESIZE"] }]
    });

    check("розпроданий товар у знімок не йде", sold.length === 0);
}

console.log("\n[2] База рахує так само, як крон");
{
    const cron = read("scripts/apply-order-stock.js");

    const cronSince = (cron.match(/STOCK_SINCE = process\.env\.STOCK_SINCE \|\| "([^"]+)"/) || [])[1];
    const sqlSince = (sql.match(/o\.created_at >= timestamptz '([^']+)'/) || [])[1];

    check("дата відліку знайдена в обох", Boolean(cronSince) && Boolean(sqlSince),
        `${cronSince} / ${sqlSince}`);

    // Розійдуться — база й крон рахуватимуть різні набори замовлень, і
    // залишок поїде в один бік. Мовчки.
    check("дата відліку однакова", cronSince === sqlSince, `${cronSince} ≠ ${sqlSince}`);

    check("не рахуємо вже списані", /o\.stock_applied = false/.test(sql));

    check("не рахуємо скасовані",
        /coalesce\(o\.status, 'new'\) <> 'cancelled'/.test(sql));

    // Той самий набір ознак, що в крона.
    check("крон дивиться на ті самі поля",
        /stock_applied/.test(cron) && /CANCELLED/.test(cron));
}

console.log("\n[3] Гонку вирішує блокування, а не сподівання");
{
    check("перевірка стоїть ДО вставки",
        /create trigger orders_flag_stock_shortfall\s*\n\s*before insert on public\.orders/.test(sql));

    // Без «for update» обидві транзакції прочитали б «лишилась 1»
    // одночасно — саме те, що лікуємо.
    check("рядок залишку блокується",
        /select qty into v_have[\s\S]{0,200}for update;/.test(sql));

    check("порівнюємо з урахуванням зайнятих",
        /v_have - public\.stock_reserved\(v_id, v_color, v_size\) < v_qty/.test(sql));

    // Магазин торгує під замовлення — це нормальний стан товару.
    // Відмова коштувала б продажу там, де досить чесної позначки.
    check("замовлення не відхиляється", !/raise exception/i.test(sql));

    check("позначка лягає в сам рядок кошика",
        /jsonb_build_object\('stockShort', true\)/.test(sql));

    // Товар, залишки якого не ведуться, рядка не має — і перевіряти
    // на ньому нічого.
    check("немає рядка — немає перевірки", /if not found then[\s\S]{0,120}continue;/.test(sql));

    check("таблиця закрита від клієнта",
        /alter table public\.stock enable row level security/.test(sql)
        && !/create policy[^\n]*on public\.stock/.test(sql));

    check("є індекс під підрахунок",
        /create index if not exists orders_stock_pending_idx/.test(sql));
}

console.log("\n[4] Знімок оновлюється вчасно");
{
    const cronYml = read(".github/workflows/apply-stock.yml");
    const buildYml = read(".github/workflows/build-products.yml");

    check("крон оновлює знімок", /node scripts\/push-stock\.js --dir=/.test(cronYml));

    // ПОРЯДОК. Між «списали в гілку» і «позначили враховані» база ще
    // рахує ці замовлення. Якщо оновити знімок після позначки, у цю
    // мить залишок буде старий, а замовлення вже не рахуються — і
    // одиниця «оживе».
    const pushAt = cronYml.indexOf("push-stock.js");
    const applyAt = cronYml.indexOf("Списати в main");
    const markAt = cronYml.indexOf("Позначити замовлення врахованими");

    check("знімок — після списання й до позначки",
        applyAt < pushAt && pushAt < markAt,
        `списання ${applyAt}, знімок ${pushAt}, позначка ${markAt}`);

    check("збірка прода теж оновлює знімок",
        /run: node scripts\/push-stock\.js/.test(buildYml));

    // Недоступна база не має робити виливку сайту червоною.
    check("збій знімка не валить виливку",
        /continue-on-error: true\s*\n\s*env:\s*\n\s*SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,120}push-stock\.js/.test(buildYml));

    check("знімок бере гілку магазину",
        /push-stock\.js --dir="\$GITHUB_WORKSPACE\/main-tree\/data\/products"/.test(cronYml));
}

console.log("\n[5] Позначку видно там, де дивляться замовлення");
{
    const format = read("supabase/functions/telegram-order-bot/format.js");
    const bundle = read("supabase/functions/telegram-order-bot/index.ts");
    const admin = read("admin/orders.js");

    check("у картці Telegram", /item\.stockShort \? "\\n   ⚠️ <b>залишку не було<\/b>/.test(format));

    // Бот працює зі зібраного index.ts — правка в format.js без
    // перезбірки нікуди не доїде.
    check("зібрана функція оновлена", bundle.includes("stockShort"));

    check("у панелі замовлень", /item\.stockShort/.test(admin));

    check("позначка стоїть біля свого товару, а не окремим блоком",
        /const short = item\.stockShort[\s\S]{0,200}item-variant/.test(admin));
}

console.log(failures === 0
    ? "\n✅ Останній екземпляр двічі не продасться\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
