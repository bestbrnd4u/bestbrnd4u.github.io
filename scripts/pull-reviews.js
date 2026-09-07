// Зведення відгуків із бази в дані товарів — для зірок у пошуку.
//
// НАВІЩО ОКРЕМИЙ КРОК
// --------------------
// Розмітка товару (aggregateRating) мусить лежати в HTML на момент,
// коли сторінку читає Google, — а не з'являтись після запиту в базу.
// Тому числа треба перенести в дані ДО збірки сторінок.
//
// Відгуки живуть у Supabase (їх пишуть покупці), а товари — у
// репозиторії. Цей крок і зводить одне з одним: читає review_stats()
// службовим ключем і кладе результат у data/reviews.json, звідки його
// забирає build-products.js.
//
// ЧОМУ РОЗМІТКА ЗАРАЗ ХОВАЄ ЗІРКИ
// --------------------------------
// У 73 товарах зі 100 стоїть рейтинг, а відгуків немає ні в одного.
// aggregateRating без жодного відгуку — пряма причина ручних санкцій
// Google, тож product.js його свідомо не виводить, поки reviews не
// більше нуля (див. tests/test-merchant-listings.js).
//
// Тобто зірки увімкнуться САМІ, як тільки з'явиться перший
// опублікований відгук. Нічого перемикати не треба.
//
// ЩО БУДЕ БЕЗ КЛЮЧА
// ------------------
// Нічого. Крок скаже про це в логу й вийде з нулем: збірка сайту не
// має падати через те, що зведення відгуків недоступне.
//
// ЗАПУСК
//   node scripts/pull-reviews.js
//   node scripts/pull-reviews.js --dry-run

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const OUTPUT_FILE = path.join(ROOT, "data", "reviews.json");

const DRY = process.argv.includes("--dry-run");

// Адреса проєкту лежить у коді сайту — вона й так відкрита (той самий
// підхід, що в scripts/push-stock.js і scripts/report-issues.js).
function supabaseUrl() {

    if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/+$/, "");

    const client = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-client.js"), "utf8");

    const match = client.match(/https:\/\/[a-z0-9]+\.supabase\.co/i);

    return match ? match[0] : "";

}

// Зведення в тому вигляді, у якому його чекає build-products.js:
// { "<id товару>": { rating: 4.8, reviews: 12 } }
//
// Ключ рядком, а не числом: JSON однаково зробить із нього рядок, і
// краще, щоб це було видно в самому файлі.
function shape(rows) {

    const out = {};

    (Array.isArray(rows) ? rows : []).forEach(row => {

        const id = Number(row && row.product_id);
        const reviews = Number(row && row.reviews);
        const rating = Number(row && row.rating);

        if (!Number.isFinite(id) || id <= 0) return;

        // Нуль відгуків у зведення не потрапляє: саме на це й дивиться
        // розмітка, вирішуючи, показувати зірки чи ні.
        if (!Number.isFinite(reviews) || reviews <= 0) return;

        if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;

        out[String(id)] = {
            rating: Math.round(rating * 10) / 10,
            reviews: Math.trunc(reviews),
        };

    });

    return out;

}

async function main() {

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {

        console.log("SUPABASE_SERVICE_ROLE_KEY не заданий — зведення відгуків пропускаю");

        return;

    }

    const url = supabaseUrl();

    if (!url) {

        console.log("Не знайшов адресу Supabase — зведення відгуків пропускаю");

        return;

    }

    let rows;

    try {

        const response = await fetch(`${url}/rest/v1/rpc/review_stats`, {
            method: "POST",
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: "{}",
        });

        if (response.status === 404) {

            // Міграцію 019 ще не застосували. Це не помилка збірки.
            console.log("Функції review_stats немає — застосуйте міграцію 019-reviews.sql");

            return;

        }

        if (!response.ok) {

            console.log(`Зведення відгуків недоступне: HTTP ${response.status}`);

            return;

        }

        rows = await response.json();

    } catch (error) {

        console.log("Зведення відгуків недоступне:", error.message);

        return;

    }

    const stats = shape(rows);

    const text = JSON.stringify(stats, null, 1) + "\n";

    if (DRY) {

        console.log(text);

        return;

    }

    const before = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, "utf8") : "";

    if (before === text) {

        console.log(`Готово: зведення відгуків уже актуальне (${Object.keys(stats).length} товарів)`);

        return;

    }

    fs.writeFileSync(OUTPUT_FILE, text, "utf8");

    console.log(`Готово: відгуки в ${Object.keys(stats).length} товарів → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

if (require.main === module) {

    main().catch(error => {

        // Збірка сайту не має падати через відгуки.
        console.log("Зведення відгуків не відпрацювало:", error.message);

    });

}

module.exports = { shape, OUTPUT_FILE };
