// Дзеркало цін у базі: скільки насправді коштує кожен товар.
//
// НАВІЩО
// -------
// Суму замовлення рахує браузер, а база записує те, що він прислав.
// Щоб перевірити цю суму, базі потрібен власний еталон цін — інакше
// звіряти нема з чим (supabase/migrations/014-order-pricing.sql).
//
// Той самий підхід, що й у scripts/push-stock.js: репозиторій — це
// джерело правди, база лише тримає знімок і нічого в ньому не змінює.
//
// ЧОМУ ІЗ ЗІБРАНОГО КАТАЛОГУ, А НЕ З ДЖЕРЕЛ
// ------------------------------------------
// Тому що звіряти треба з тим, що БАЧИТЬ ПОКУПЕЦЬ. У джерелах ціна
// може бути без знижки, без округлення, без правил акцій; на сайт іде
// те, що зібрав build-products.js. Саме воно й потрапляє в базу.
//
// КОЛИ ЗАПУСКАЄТЬСЯ
//   - після кожної збірки прод-гілки (build-products.yml).
//
// ЗАПУСК
//   node scripts/push-prices.js              знімок у базу
//   node scripts/push-prices.js --dry-run    показати й нічого не слати
//   node scripts/push-prices.js --file=…     з іншого файлу каталогу

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function arg(name) {

    const found = process.argv.find(a => a.startsWith(`--${name}=`));

    return found ? found.split("=").slice(1).join("=") : "";

}

// Адреса проєкту лежить у коді сайту — вона й так відкрита (той самий
// підхід, що в scripts/push-stock.js).
function supabaseUrl() {

    if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/+$/, "");

    const client = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-client.js"), "utf8");

    const match = client.match(/https:\/\/[a-z0-9]+\.supabase\.co/i);

    if (!match) throw new Error("Не знайшов адресу Supabase у assets/js/supabase-client.js");

    return match[0];

}

function rows(products) {

    return products
        .map(product => {

            const id = Number(product.id);
            const price = Number(product.price);

            if (!id || !(price > 0)) return null;

            const old = Number(product.oldPrice);

            // Ціна дня їде ВІКНОМ, а не готовою ціною: знімок приїжджає
            // раз на збірку, і вже порахована ціна почала б діяти не о
            // 18:00, а під час наступної збірки. Момент рахує база — так
            // само, як priceNow() у браузері.
            const sale = product.sale || {};
            const salePrice = Number(sale.price);
            const hasSale = salePrice > 0;

            return {
                product_id: id,
                price: price,
                // Стара ціна потрібна, щоб сервер міг порахувати ту
                // саму «знижку», яку показує картка. Немає — null.
                old_price: old > price ? old : null,
                // Усі три поля є ЗАВЖДИ, навіть порожні: PostgREST
                // вимагає однакового набору ключів у пакеті, і рядок
                // без них завалив би весь знімок.
                sale_price: hasSale ? salePrice : null,
                sale_from: hasSale && sale.from ? sale.from : null,
                sale_to: hasSale && sale.to ? sale.to : null
            };

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

    const file = arg("file") || path.join(ROOT, "data", "catalog.json");

    if (!fs.existsSync(file)) {
        console.error(`Немає ${path.relative(ROOT, file)} — спершу зберіть каталог`);
        process.exit(1);
    }

    const products = JSON.parse(fs.readFileSync(file, "utf8"));

    const payload = rows(products);

    if (process.argv.includes("--dry-run")) {

        console.log(`Знімок цін: ${payload.length} товарів`);
        payload.slice(0, 10).forEach(row =>
            console.log(`   ${row.product_id} → ${row.price}${row.old_price ? ` (було ${row.old_price})` : ""}`));

        const deals = payload.filter(row => row.sale_price);

        deals.forEach(row =>
            console.log(`   ціна дня: ${row.product_id} → ${row.sale_price} (${row.sale_from || "завжди"} … ${row.sale_to || "без кінця"})`));

        return;

    }

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {
        console.error("Немає SUPABASE_SERVICE_ROLE_KEY — знімок цін не надіслано");
        process.exit(1);
    }

    const url = supabaseUrl();

    // Мітка запуску: рядки, яких він не торкнувся, — ціни товарів, що
    // зникли з каталогу. Їх прибираємо, інакше перевірка колись
    // звірятиметься з ціною позаторішнього товару.
    const stamp = new Date().toISOString();

    const CHUNK = 500;

    const stamped = payload.map(row => ({ ...row, updated_at: stamp }));

    for (let i = 0; i < stamped.length; i += CHUNK) {

        await send(url, key, "POST", "prices", stamped.slice(i, i + CHUNK), {
            Prefer: "resolution=merge-duplicates,return=minimal"
        });

    }

    await send(url, key, "DELETE", `prices?updated_at=lt.${encodeURIComponent(stamp)}`);

    console.log(`Готово: ${stamped.length} цін → база`);

}

// Тільки при прямому запуску: тести підключають цей файл заради
// rows(), і запускати мережу вони не мають.
if (require.main === module) {

    main().catch(error => {
        console.error("Знімок цін не надіслано:", error.message);
        process.exit(1);
    });

}

module.exports = { rows };
