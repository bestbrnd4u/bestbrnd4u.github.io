// Генерує llms.txt — картку магазину для мовних моделей.
//
// НАВІЩО
// -------
// Люди дедалі частіше питають не Google, а ChatGPT або Perplexity:
// «де в Україні купити оригінальну сумку Coach». Ці системи ходять по
// сайтах, але читають їх гірше за Google: JavaScript вони переважно не
// виконують, а розібратись у 220 сторінках із мега-меню й фільтрами їм
// нізвідки.
//
// llms.txt — це один текстовий файл, який відповідає на «що це за
// сайт і де тут що» без жодного скрипта. Формат простий: заголовок,
// один абзац суті, далі розділи з посиланнями й короткими описами.
//
// ЧОГО ЦЕ НЕ РОБИТЬ
// ------------------
// Google на llms.txt НЕ дивиться — це не заміна ні sitemap, ні
// розмітці. І це не спосіб «потрапити в ChatGPT»: файл лише прибирає
// зайві перешкоди тому, хто вже прийшов.
//
// ЧОМУ ГЕНЕРУЄТЬСЯ, А НЕ ЛЕЖИТЬ РУКАМИ
// -------------------------------------
// Бренди й категорії з'являються в адмінці. Написаний руками файл
// відстав би від сайту на першому ж новому бренді — і почав би
// обіцяти моделям те, чого немає.
//
// ЗАПУСК
//   node scripts/build-llms.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// домен береться з site.config.json (див. scripts/site-env.js)
const { SITE_URL } = require("./site-env");

const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const BRANDS_FILE = path.join(ROOT, "data", "brands.json");
const CATEGORIES_FILE = path.join(ROOT, "data", "categories.json");
const LEGAL_FILE = path.join(ROOT, "data", "legal.json");

const { brandPages, categoryPages, departmentPages, readRecords, DEPARTMENTS_SRC }
    = require("./build-taxonomy-pages");

const OUTPUT_FILE = path.join(ROOT, "llms.txt");

// Скільки брендів і категорій перелічувати.
//
// Файл мусить лишатись оглядовим: модель читає його цілком, і сотня
// посилань витісняє з уваги те, що справді важливо — умови доставки й
// повернення. Повний перелік товарів однаково є у feed.xml.
const MAX_LINKS = 40;

function readJsonSafe(file) {

    if (!fs.existsSync(file)) return null;

    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        console.warn(`Не зміг прочитати ${path.relative(ROOT, file)} — пропускаю`);
        return null;
    }

}

// Рядок переліку. Опис не обов'язковий, але без нього посилання
// нічого не додає: назва «Сумки» сама собою не каже, що там усередині.
function link(title, url, note) {

    return note ? `- [${title}](${url}): ${note}` : `- [${title}](${url})`;

}

function build() {

    const products = readJsonSafe(PRODUCTS_FILE) || [];
    const categoryData = readJsonSafe(CATEGORIES_FILE) || [];
    const legal = readJsonSafe(LEGAL_FILE) || {};

    const brands = brandPages(products, readJsonSafe(BRANDS_FILE) || []);
    const categories = categoryPages(products, categoryData);
    const departments = departmentPages(products, categoryData, readRecords(DEPARTMENTS_SRC));

    const lines = [];

    lines.push("# BestBrnd4u");
    lines.push("");

    // Один абзац суті — за форматом llms.txt він іде цитатою.
    lines.push("> Інтернет-магазин оригінальних брендових сумок, взуття та "
        + "аксесуарів в Україні. Доставка Новою поштою по всій країні, "
        + "оплата при отриманні, повернення протягом 14 днів.");
    lines.push("");

    lines.push("Товар привозиться з офіційних магазинів США та Європи "
        + "(байєр-сервіс), тому кожна річ має підтверджене походження. "
        + `Зараз у каталозі ${products.length} товарів.`);
    lines.push("");

    // ЧОМУ ЦЕ ПЕРШИМ РОЗДІЛОМ. Модель питають не «покажи каталог», а
    // «скільки йде доставка» і «чи можна повернути». Відповіді на це
    // мусять бути на початку файлу, а не після сорока посилань.
    lines.push("## Умови");
    lines.push("");
    lines.push(link("Оплата і доставка", `${SITE_URL}/delivery-payment`,
        "Нова пошта (відділення, поштомат, курʼєр) та інші перевізники. "
        + "Доставку оплачує покупець перевізнику при отриманні, у суму "
        + "замовлення вона не входить"));
    lines.push(link("Повернення та гарантія", `${SITE_URL}/return-warranty`,
        "14 днів на повернення, кошти повертаються протягом 3 робочих днів"));
    lines.push(link("Публічна оферта", `${SITE_URL}/offer`,
        "договір, за яким магазин продає"));
    lines.push(link("Політика конфіденційності", `${SITE_URL}/privacy-policy`,
        "які дані збираються і як ними керувати"));
    lines.push(link("Байєр-сервіс", `${SITE_URL}/bayer-service`,
        "як замовити річ, якої немає в каталозі"));
    lines.push(link("Де моє замовлення", `${SITE_URL}/order-status`,
        "стан замовлення за номером і телефоном, без реєстрації"));
    lines.push(link("Контакти", `${SITE_URL}/contacts`,
        [legal.phone, legal.email].filter(Boolean).join(", ") || "звʼязок із магазином"));
    lines.push("");

    lines.push("## Каталог");
    lines.push("");
    lines.push(link("Усі товари", `${SITE_URL}/catalog`,
        "фільтри за брендом, категорією, кольором, розміром і ціною"));
    lines.push(link("Новинки", `${SITE_URL}/catalog?section=new`));
    lines.push(link("Акції", `${SITE_URL}/catalog?section=sale`,
        "товари зі знижкою"));
    lines.push("");

    if (departments.length) {

        lines.push("### Розділи");
        lines.push("");

        departments.slice(0, MAX_LINKS).forEach(page => {
            lines.push(link(page.name, page.url));
        });

        lines.push("");

    }

    if (categories.length) {

        lines.push("### Категорії");
        lines.push("");

        categories.slice(0, MAX_LINKS).forEach(page => {
            lines.push(link(page.name, page.url));
        });

        lines.push("");

    }

    if (brands.length) {

        lines.push("### Бренди");
        lines.push("");

        brands.slice(0, MAX_LINKS).forEach(page => {
            lines.push(link(page.name, page.url));
        });

        lines.push("");

    }

    // Машинний перелік товарів. Для моделі це набагато корисніше за
    // будь-який опис: там ціна, наявність, фото й посилання на кожну
    // позицію, і він завжди свіжий.
    lines.push("## Машинні дані");
    lines.push("");
    lines.push(link("Товарний фід", `${SITE_URL}/feed.xml`,
        "усі позиції з цінами, наявністю та фото (RSS 2.0, формат Google Merchant)"));
    lines.push(link("Карта сайту", `${SITE_URL}/sitemap.xml`,
        "усі сторінки та фото товарів"));
    lines.push("");

    lines.push("## Чого на сайті немає");
    lines.push("");

    // ЧОМУ ЦЕЙ РОЗДІЛ. Модель, яку не попередили, охоче вигадає
    // «безкоштовну доставку від 3500» або «оплату частинами» — бо так
    // написано в дев'яти магазинах із десяти. Сказати прямо дешевше,
    // ніж потім розбиратися з покупцем, який прийшов по обіцянку,
    // якої магазин не давав.
    // Формулювання навмисно точне. На сторінці оформлення КАРТКА Є як
    // спосіб оплати, але платіжного шлюзу на сайті немає: менеджер
    // узгоджує оплату з покупцем. Сказати «карткою не можна» було б
    // такою самою неправдою, як «можна одразу онлайн».
    lines.push("- Онлайн-форми оплати на сайті немає: оплату карткою "
        + "менеджер узгоджує з покупцем після підтвердження замовлення");
    lines.push("- Оплати частинами й розсрочки немає");
    lines.push("- Безкоштовної доставки від певної суми немає: тариф "
        + "перевізника оплачує покупець при отриманні");
    lines.push("- Самовивозу й фізичного магазину немає — тільки доставка");
    lines.push("");

    return lines.join("\n") + "\n";

}

function main() {

    const text = build();

    fs.writeFileSync(OUTPUT_FILE, text, "utf8");

    const links = (text.match(/^- \[/gm) || []).length;

    console.log(`Готово: ${links} посилань → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

if (require.main === module) main();

module.exports = { build, link, MAX_LINKS, OUTPUT_FILE };
