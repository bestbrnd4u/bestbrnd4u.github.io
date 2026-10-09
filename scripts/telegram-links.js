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
//   node scripts/telegram-links.js bestbrnd4u_orders_bot
//
// Прапорці:
//   --csv    вивести таблицею через кому (зручно вставити в Excel)
//   --new    лише новинки
//   --sale   лише товари зі знижкою

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Куди збірка кладе готовий перелік. Його читає сторінка адмінки
// admin/instagram.html — там у кожного товару кнопка «Копіювати».
const OUT_FILE = path.join(ROOT, "data", "instagram-links.json");

// Логін бота живе в адмінці (data/telegram.json), а не в аргументі:
// збірка запускається без рук, і спитати в неї нікого.
function botFromData() {

    try {

        const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "telegram.json"), "utf8"));

        return String(data.botUsername || "").replace(/^@/, "").trim();

    } catch (error) {

        return "";

    }

}

// САМЕ ТУТ ЖИВЕ ФОРМАТ ПОСИЛАННЯ.
//
// Бот приймає кілька написань (product_15, p15, просто 15 — див.
// supabase/functions/telegram-order-bot/format.js), бо посилання
// вставляють руками. Але СКЛАДАЄ їх одне місце — це, — інакше
// сторінка адмінки й цей скрипт колись почали б давати різні.
function linkFor(username, id) {

    return `https://t.me/${username}?start=product_${id}`;

}

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

// Перелік для сторінки адмінки.
//
// Пишемо файл, а не будуємо посилання в самій сторінці: формат
// посилання тоді опинився б іще й у браузерному коді, третьою копією
// поруч із цим скриптом і ботом.
function writeList() {

    const username = botFromData();

    if (!username) {
        console.warn("Логін бота не заданий у data/telegram.json — перелік для Instagram пропускаю");
        return;
    }

    const products = loadProducts();

    // Спершу новинки, далі — від найновіших до найстаріших. Постять
    // те, що щойно приїхало, і шукати його в кінці списку незручно.
    const rows = [...products]
        .sort((a, b) => (Number(Boolean(b.isNew)) - Number(Boolean(a.isNew))) || (b.id - a.id))
        .map((p) => ({
            id: p.id,
            brand: p.brand || "",
            title: p.title || "",
            price: Number(p.price) || 0,
            image: (Array.isArray(p.images) && p.images[0]) || "",
            isNew: Boolean(p.isNew),
            discount: discountOf(p),
            preOrder: Boolean(p.preOrder),
            link: linkFor(username, p.id)
        }));

    const out = { bot: username, updated: new Date().toISOString(), products: rows };

    const текст = JSON.stringify(out, null, 2) + "\n";

    // Дата оновлення міняється щоразу, тож порівнюємо без неї:
    // інакше кожна збірка давала б коміт на порожньому місці.
    const безДати = (s) => s.replace(/"updated": "[^"]*",?\n?/, "");

    const було = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, "utf8") : "";

    if (безДати(було) === безДати(текст)) {
        console.log(`Готово: перелік для Instagram уже збігається (${rows.length} товарів)`);
        return;
    }

    fs.writeFileSync(OUT_FILE, текст, "utf8");

    console.log(`Готово: ${rows.length} посилань для Instagram → data/instagram-links.json`);

}

function main() {

    const args = process.argv.slice(2);

    // Без аргументів — режим збірки: пишемо файл для адмінки.
    if (args.includes("--write") || !args.length) {
        writeList();
        return;
    }

    const bot = args.find((a) => !a.startsWith("--")) || botFromData();

    if (!bot) {

        console.error("Вкажіть логін бота, напр.:");
        console.error("  node scripts/telegram-links.js bestbrnd4u_orders_bot");
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
            console.log(`${p.id},"${p.brand ?? ""}","${title}",${p.price ?? ""},${linkFor(username, p.id)}`);
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

module.exports = { loadProducts, discountOf, linkFor, writeList, OUT_FILE };
