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
const SITE_URL = "https://bestbrnd4u.github.io";

const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const PROMOTIONS_FILE = path.join(ROOT, "data", "promotions.json");
const OUTPUT_FILE = path.join(ROOT, "sitemap.xml");

const STATIC_PAGES = [
    { loc: "/", changefreq: "daily", priority: "1.0" },
    { loc: "/catalog", changefreq: "daily", priority: "0.9" },
    { loc: "/bayer-service", changefreq: "monthly", priority: "0.7" },
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

        if (!product || typeof product.id === "undefined") return;

        entries.push(
            urlEntry(`${SITE_URL}/product?id=${product.id}`, "weekly", "0.8")
        );

    });

    promotions.forEach(promo => {

        if (!promo || !promo.slug) return;

        entries.push(
            urlEntry(`${SITE_URL}/promo?id=${promo.slug}`, "weekly", "0.6")
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
        `${promotions.length} акцій → ${path.relative(ROOT, OUTPUT_FILE)}`
    );

}

main();
