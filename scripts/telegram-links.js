// Готує посилання для Instagram: t.me/ваш_бот?start=product_<id>
//
// Такі посилання відкривають бота ОДРАЗУ на потрібному товарі — з
// фото, ціною, розмірами і кнопкою «Замовити». Їх ставлять у шапку
// профілю, у сторіс (стікер «Посилання») і під Reels.
//
// Запуск:
//   node scripts/telegram-links.js <логін_бота>
//
// Приклад:
//   node scripts/telegram-links.js bagvero_orders_bot
//
// Прапорці:
//   --csv    вивести таблицею через кому (зручно вставити в Excel)
//   --new    лише новинки
//   --sale   лише товари зі знижкою

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Джерело — окремі файли товарів, а не згенерований data/products.json:
// у свіжому клоні агрегат може бути ще не перезібраний.
function loadProducts() {

    const dir = path.join(ROOT, "data", "products");

    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
        .filter((p) => typeof p.id === "number")
        .sort((a, b) => a.id - b.id);

}

function discountOf(product) {

    if (!product.oldPrice || !product.price) return 0;
    if (Number(product.oldPrice) <= Number(product.price)) return 0;

    return Math.round((1 - Number(product.price) / Number(product.oldPrice)) * 100);

}

function main() {

    const args = process.argv.slice(2);
    const bot = args.find((a) => !a.startsWith("--"));

    if (!bot) {

        console.error("Вкажіть логін бота, напр.:");
        console.error("  node scripts/telegram-links.js bagvero_orders_bot");
        process.exit(1);

    }

    const username = bot.replace(/^@/, "");

    const asCsv = args.includes("--csv");
    const onlyNew = args.includes("--new");
    const onlySale = args.includes("--sale");

    let products = loadProducts();

    if (onlyNew) products = products.filter((p) => p.isNew);
    if (onlySale) products = products.filter((p) => discountOf(p) > 0);

    if (!products.length) {

        console.error("Товарів не знайдено (перевірте data/products/).");
        process.exit(1);

    }

    if (asCsv) {

        console.log("id,бренд,назва,ціна,посилання");

        products.forEach((p) => {
            const title = String(p.title ?? "").replace(/"/g, '""');
            console.log(`${p.id},"${p.brand ?? ""}","${title}",${p.price ?? ""},https://t.me/${username}?start=product_${p.id}`);
        });

        return;

    }

    console.log(`\nПосилання для Instagram — бот @${username}\n`);

    products.forEach((p) => {

        const discount = discountOf(p);

        const tags = [
            p.isNew ? "NEW" : "",
            discount > 0 ? `-${discount}%` : "",
            p.preOrder ? "під замовлення" : "",
        ].filter(Boolean).join(" · ");

        console.log(`${p.brand ?? ""} — ${p.title}${tags ? `  (${tags})` : ""}`);
        console.log(`  https://t.me/${username}?start=product_${p.id}\n`);

    });

    console.log(`Усього товарів: ${products.length}\n`);
    console.log("Куди вставляти:");
    console.log("  • шапка профілю — одне посилання на найактуальніший товар;");
    console.log("  • сторіс — стікер «Посилання» на товар з кадру;");
    console.log("  • Reels — посилання в описі;");
    console.log("  • директ — у відповідь на питання «скільки коштує?».\n");

}

if (require.main === module) main();

module.exports = { loadProducts, discountOf };
