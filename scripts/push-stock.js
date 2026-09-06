// Дзеркало залишків у базі: скільки чого лежить на полиці.
//
// НАВІЩО
// -------
// Залишки живуть у репозиторії — там їх редагує адмінка, звідти їх
// бере збірка сайту. Але база мусить знати їх у мить створення
// замовлення: саме там вирішується, чи не продали останню сумку двічі
// (див. supabase/migrations/011-stock-reservation.sql).
//
// Цей крок і кладе туди знімок. База його ніколи не редагує — тільки
// читає: скільки одиниць уже зайнято, вона рахує сама по замовленнях.
//
// ЩО САМЕ КЛАДЕМО
// ----------------
// Ключ рядка — рівно те, що приходить у замовленні: id товару, назва
// кольору й розмір у тому вигляді, у якому їх бачить САЙТ. Тому
// кольори проганяємо через normalize-colors: у джерелах лежить
// «Green Glow — яскравий зелений», а покупець замовляє «Зелений», і
// зійтись вони мусять до одного рядка.
//
// ПОРОЖНЯ КЛІТИНКА — НЕ НУЛЬ
// ---------------------------
// Товар без залишків рядка не отримує зовсім. Це не те саме, що нуль:
// нуль означає «закінчився», а порожньо — «не рахуємо». База на такий
// товар нічого не перевіряє, бо ми нічого й не обіцяли.
//
// КОЛИ ЗАПУСКАЄТЬСЯ
// ------------------
//   - після кожної збірки прод-гілки (build-products.yml) — щоб зміни
//     залишків з адмінки доїжджали в базу;
//   - усередині apply-stock.yml, ОДРАЗУ після списання в гілку й ДО
//     позначки «враховано». Порядок важливий: інакше є мить, коли
//     залишок у гілці вже зменшено, замовлення вже позначені як
//     враховані, а база ще має старий знімок — і одиниця «оживає».
//
// ЗАПУСК
//   node scripts/push-stock.js                 знімок із data/products
//   node scripts/push-stock.js --dir=<тека>    з іншої теки (гілка main)
//   node scripts/push-stock.js --dry-run       показати й нічого не слати

const fs = require("fs");
const path = require("path");

const { normalizeProductColors } = require("./normalize-colors");
const Stock = require("../assets/js/stock.js");

const ROOT = path.join(__dirname, "..");

function arg(name) {

    const hit = process.argv.find(value => value.startsWith(`--${name}=`));

    return hit ? hit.slice(name.length + 3) : "";

}

function productsDir() {

    const dir = arg("dir");

    return dir ? path.resolve(dir) : path.join(ROOT, "data", "products");

}

// Адреса проєкту лежить у коді сайту — вона й так відкрита, інакше
// браузер не зміг би до неї звертатись. Тому окремого секрета під неї
// немає: див. той самий підхід у scripts/apply-order-stock.js.
function supabaseUrl() {

    if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/+$/, "");

    const client = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-client.js"), "utf8");

    const match = client.match(/https:\/\/[a-z0-9]+\.supabase\.co/i);

    if (!match) throw new Error("Не знайшов адресу Supabase у assets/js/supabase-client.js");

    return match[0];

}

// Назва кольору так, як її бачить сайт (і як вона приходить у
// замовленні). У джерелі лежить своє написання — зводимо тим самим
// модулем, що й збірка.
function siteColors(data) {

    const clone = JSON.parse(JSON.stringify(data));

    normalizeProductColors(clone);

    return (data.variants || []).map((variant, index) => {

        const normalized = clone.variants[index] && clone.variants[index].color;

        return String(normalized || (variant && variant.color) || "");

    });

}

function rowsFor(data) {

    const rows = [];

    const id = Number(data.id);

    if (!Number.isFinite(id)) return rows;

    // Розпроданий товар зник із сайту — замовити його не можна, і
    // рядок у базі лише заважав би.
    if (data.soldOut) return rows;

    const colors = siteColors(data);

    (data.variants || []).forEach((variant, index) => {

        const stock = Stock.variantStock(data, variant);

        if (!Stock.tracked(stock)) return;

        const sizes = Stock.sizesOf(data, variant);

        (sizes.length ? sizes : Object.keys(stock)).forEach(size => {

            const qty = Stock.sizeQty(stock, size);

            // null — клітинка порожня, тобто «не рахуємо».
            if (qty === null) return;

            rows.push({
                product_id: id,
                color: colors[index] || "",
                size: String(size),
                qty
            });

        });

    });

    return rows;

}

function readProducts(dir) {

    if (!fs.existsSync(dir)) {
        throw new Error(`Немає теки ${dir}`);
    }

    return fs.readdirSync(dir)
        .filter(file => file.endsWith(".json"))
        .map(file => {

            try {
                return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
            } catch (error) {
                console.warn(`⚠  ${file}: не читається як JSON — пропущено`);
                return null;
            }

        })
        .filter(Boolean);

}

async function send(url, key, method, pathname, body, extraHeaders) {

    const response = await fetch(`${url}/rest/v1/${pathname}`, {
        method,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
            ...(extraHeaders || {})
        },
        body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {

        const text = await response.text();

        throw new Error(`${method} ${pathname} → ${response.status}: ${text.slice(0, 300)}`);

    }

}

async function main() {

    const dir = productsDir();
    const products = readProducts(dir);

    const rows = products.flatMap(rowsFor);

    if (arg("dry-run") !== "" || process.argv.includes("--dry-run")) {

        console.log(`Знімок: ${rows.length} рядків із ${products.length} товарів`);
        rows.slice(0, 10).forEach(row =>
            console.log(`   ${row.product_id} · ${row.color} / ${row.size} → ${row.qty}`));

        return;

    }

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {
        console.error("Немає SUPABASE_SERVICE_ROLE_KEY — знімок не надіслано");
        process.exit(1);
    }

    const url = supabaseUrl();

    // Мітка цього запуску. Рядки, яких він не торкнувся, — залишки
    // товарів, що зникли або перестали рахуватись; їх прибираємо.
    const stamp = new Date().toISOString();

    const payload = rows.map(row => ({ ...row, updated_at: stamp }));

    // Порціями: один запит на кілька тисяч рядків PostgREST приймає,
    // але діагностика помилки в такому запиті — суцільне вгадування.
    const CHUNK = 500;

    for (let i = 0; i < payload.length; i += CHUNK) {

        await send(url, key, "POST", "stock", payload.slice(i, i + CHUNK), {
            Prefer: "resolution=merge-duplicates,return=minimal"
        });

    }

    await send(url, key, "DELETE", `stock?updated_at=lt.${encodeURIComponent(stamp)}`);

    console.log(`Готово: ${rows.length} рядків залишків → база`
        + ` (з ${products.length} товарів у ${path.relative(ROOT, dir) || "."})`);

}

if (require.main === module) {

    main().catch(error => {
        console.error(`::error::push-stock: ${error.message}`);
        process.exit(1);
    });

}

module.exports = { rowsFor, siteColors, readProducts };
