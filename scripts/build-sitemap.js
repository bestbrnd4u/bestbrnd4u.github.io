// Генерує sitemap.xml на основі:
//   - фіксованого списку статичних сторінок (головна, каталог, контакти);
//   - усіх товарів з data/products.json (product?id=<id>);
//   - усіх акцій з data/promotions.json (promo?id=<slug>).
//
// Сторінки кошика/чекауту/акаунту/обраного/подяки свідомо НЕ включені —
// вони позначені <meta name="robots" content="noindex"> в самих
// сторінках, і в sitemap їм не місце.
//
// Запускається автоматично через GitHub Actions після build-products.js
// і build-promotions.js — тож sitemap.xml завжди актуальний і не
// вимагає ручного оновлення при додаванні товару через адмінку.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
// домен береться з site.config.json (див. scripts/site-env.js)
const { SITE_URL } = require("./site-env");

const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const PROMOTIONS_FILE = path.join(ROOT, "data", "promotions.json");
const BRANDS_FILE = path.join(ROOT, "data", "brands.json");
const CATEGORIES_FILE = path.join(ROOT, "data", "categories.json");

// Перелік сторінок брендів і категорій беремо в того ж модуля, що їх
// і будує. Свій список тут означав би, що sitemap колись почне
// обіцяти сторінки, яких немає, — або мовчки не показувати наявні.
const { brandPages, categoryPages, departmentPages, readRecords, DEPARTMENTS_SRC }
    = require("./build-taxonomy-pages");
const OUTPUT_FILE = path.join(ROOT, "sitemap.xml");

const STATIC_PAGES = [
    { loc: "/", changefreq: "daily", priority: "1.0" },
    { loc: "/catalog", changefreq: "daily", priority: "0.9" },
    { loc: "/bayer-service", changefreq: "monthly", priority: "0.7" },
    { loc: "/delivery-payment", changefreq: "monthly", priority: "0.5" },
    { loc: "/return-warranty", changefreq: "monthly", priority: "0.5" },
    { loc: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
    { loc: "/contacts", changefreq: "monthly", priority: "0.3" }
];

function readJsonSafe(filePath) {

    if (!fs.existsSync(filePath)) {
        console.warn(`Не знайдено ${path.relative(ROOT, filePath)} — пропускаю цю групу URL`);
        return [];
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));

}

function xmlEscape(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

function urlEntry(loc, changefreq, priority) {

    return [
        "  <url>",
        `    <loc>${xmlEscape(loc)}</loc>`,
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        "  </url>"
    ].join("\n");

}

function main() {

    const products = readJsonSafe(PRODUCTS_FILE);
    const promotions = readJsonSafe(PROMOTIONS_FILE);

    const entries = [];

    STATIC_PAGES.forEach(page => {
        entries.push(urlEntry(`${SITE_URL}${page.loc}`, page.changefreq, page.priority));
    });

    products.forEach(product => {

        // У sitemap іде КАНОНІЧНА адреса — статична сторінка
        // p/<slug>/, яку генерує build-product-pages.js. Стара
        // /product?id= сюди більше не потрапляє: вона лишається
        // робочою для вже проіндексованих посилань, але сама
        // перекидає на канонічну, і тримати її в sitemap означало б
        // просити Google індексувати редірект.
        if (!product || !product.slug) return;

        entries.push(
            urlEntry(`${SITE_URL}/p/${encodeURIComponent(product.slug)}/`, "weekly", "0.8")
        );

    });

    // Хаби й сторінки таксономії. Пріоритет вищий за товар: саме вони
    // виграють запити на кшталт «сумки Coach купити», і саме через них
    // робот знаходить решту.
    const categoryData = readJsonSafe(CATEGORIES_FILE);

    const brands = brandPages(products, readJsonSafe(BRANDS_FILE));
    const categories = categoryPages(products, categoryData);
    const departments = departmentPages(products, categoryData, readRecords(DEPARTMENTS_SRC));

    if (brands.length) entries.push(urlEntry(`${SITE_URL}/brands/`, "weekly", "0.7"));
    if (categories.length) entries.push(urlEntry(`${SITE_URL}/categories/`, "weekly", "0.7"));
    if (departments.length) entries.push(urlEntry(`${SITE_URL}/departments/`, "weekly", "0.7"));

    // Розділ ширший за категорію й за бренд — і пріоритет у нього
    // найвищий після головної: саме на такі запити («сумки купити»)
    // припадає найбільший попит.
    departments.forEach(page => entries.push(urlEntry(page.url, "weekly", "0.95")));

    [...brands, ...categories].forEach(page => {
        entries.push(urlEntry(page.url, "weekly", "0.9"));
    });

    promotions.forEach(promo => {

        if (!promo || !promo.slug) return;

        entries.push(
            urlEntry(`${SITE_URL}/promo?id=${encodeURIComponent(promo.slug)}`, "weekly", "0.6")
        );

    });

    const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `${entries.join("\n")}\n` +
        `</urlset>\n`;

    fs.writeFileSync(OUTPUT_FILE, xml, "utf8");

    console.log(
        `Готово: ${STATIC_PAGES.length} статичних + ${products.length} товарів + ` +
        `${brands.length} брендів + ${categories.length} категорій + ` +
        `${departments.length} розділів + ` +
        `${promotions.length} акцій → ${path.relative(ROOT, OUTPUT_FILE)}`
    );

}

main();
