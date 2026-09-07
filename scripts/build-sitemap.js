// Генерує sitemap.xml на основі:
//   - фіксованого списку статичних сторінок (головна, каталог, контакти);
//   - усіх товарів з data/products.json (product?id=<id>);
//   - усіх акцій з data/promotions.json (promo?id=<slug>).
//
// Сторінки кошика/чекауту/акаунту/обраного/подяки свідомо НЕ включені —
// вони позначені <meta name="robots" content="noindex"> в самих
// сторінках, і в sitemap їм не місце.
//
// У сторінок товару йдуть ще й ФОТО (розширення image sitemap).
// Галерея малюється скриптом, тож у статичній розмітці немає ані
// одного <img> із фото товару — sitemap лишається єдиним надійним
// шляхом, яким Google Images про них дізнається.
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
// Абсолютні адреси картинок будує той самий помічник, що й фід:
// у даних трапляються обидві форми («/assets/…» і «assets/…»), і
// друга реалізація цього правила колись розійшлася б із першою.
const { absolute } = require("./build-feed");

// Коли товар останній раз змінювався. Журнал веде
// build-products.js — у самих товарах поля з датою немає, а ні
// git log, ні mtime у CI не годяться (поверхневий клон і час
// викачування відповідно).
const UPDATED_FILE = path.join(ROOT, "data", "products-updated.json");

const OUTPUT_FILE = path.join(ROOT, "sitemap.xml");

const STATIC_PAGES = [
    { loc: "/", changefreq: "daily", priority: "1.0" },
    { loc: "/catalog", changefreq: "daily", priority: "0.9" },
    { loc: "/bayer-service", changefreq: "monthly", priority: "0.7" },
    { loc: "/delivery-payment", changefreq: "monthly", priority: "0.5" },
    { loc: "/return-warranty", changefreq: "monthly", priority: "0.5" },
    { loc: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
    { loc: "/offer", changefreq: "yearly", priority: "0.3" },
    { loc: "/contacts", changefreq: "monthly", priority: "0.3" },
    { loc: "/order-status", changefreq: "monthly", priority: "0.4" }
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

// Скільки фото віддаємо на товар.
//
// Google приймає до 1000 на адресу, але сенсу в такій кількості
// немає: після кількох ракурсів однієї речі решта не ранжується, а
// sitemap росте. Шість — це три ракурси двох кольорів, тобто
// типовий товар цілком.
const MAX_IMAGES = 6;

// Фото сторінки товару: власні фото товару плюс фото кожного
// кольору.
//
// ЧОМУ ВСІ КОЛЬОРИ, А НЕ ЛИШЕ АКТИВНИЙ. Вони на ТІЙ САМІЙ сторінці:
// перемикач кольору не веде нікуди, він перемальовує галерею. Тож
// це фото цієї адреси, і саме так їх треба заявити.
function productImages(product, siteUrl) {

    const raw = [
        ...(Array.isArray(product.images) ? product.images : []),
        ...(Array.isArray(product.variants) ? product.variants : [])
            .flatMap(variant => Array.isArray(variant && variant.images) ? variant.images : [])
    ];

    const seen = new Set();
    const list = [];

    raw.forEach(src => {

        // Відбиток кеша прибираємо: у JSON-LD сторінки адреси без
        // нього, і дві форми однієї картинки Google вважав би
        // різними файлами.
        const url = absolute(String(src || "").split("?")[0], siteUrl);

        if (!url || seen.has(url)) return;

        seen.add(url);
        list.push(url);

    });

    return list.slice(0, MAX_IMAGES);

}

// Один запис sitemap. images — необов'язкові: їх мають лише
// сторінки товару.
function urlEntry(loc, changefreq, priority, images, lastmod) {

    const photos = (images || []).map(image => [
        "    <image:image>",
        `      <image:loc>${xmlEscape(image.loc)}</image:loc>`,
        // Підпис допомагає Google зрозуміти, що на фото. Порожнього
        // тега не лишаємо: він гірший за відсутній.
        image.title ? `      <image:title>${xmlEscape(image.title)}</image:title>` : "",
        "    </image:image>"
    ].filter(Boolean).join("\n"));

    return [
        "  <url>",
        `    <loc>${xmlEscape(loc)}</loc>`,
        // Порожньої дати не буває: Google сам пише, що
        // ігнорує lastmod, якому не довіряє, — а неточна дата
        // гірша за відсутню.
        lastmod ? `    <lastmod>${xmlEscape(lastmod)}</lastmod>` : "",
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        ...photos,
        "  </url>"
    ].filter(Boolean).join("\n");

}

function main() {

    const products = readJsonSafe(PRODUCTS_FILE);

    // Журнал може ще не існувати (перший запуск, свіжий клон) —
    // тоді дат просто не буде, і це нормально.
    const updated = (() => {

        if (!fs.existsSync(UPDATED_FILE)) return {};

        try {
            return JSON.parse(fs.readFileSync(UPDATED_FILE, "utf8")) || {};
        } catch (error) {
            return {};
        }

    })();
    const promotions = readJsonSafe(PROMOTIONS_FILE);

    const entries = [];

    let photos = 0;

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

        // Назва в підписі — та сама, що в заголовку сторінки: бренд
        // плюс модель. Саме за нею картинку й шукають.
        const title = [product.brand, product.title]
            .map(part => String(part || "").trim())
            .filter(Boolean)
            .join(" ");

        const images = productImages(product, SITE_URL)
            .map(loc => ({ loc, title }));

        photos += images.length;

        entries.push(
            urlEntry(`${SITE_URL}/p/${encodeURIComponent(product.slug)}/`, "weekly", "0.8",
                images, (updated[product.slug] || {}).date)
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
        // Без цього простору імен теги image:* — просто невідома
        // розмітка, і Google мовчки пропустить усі фото.
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
        `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
        `${entries.join("\n")}\n` +
        `</urlset>\n`;

    fs.writeFileSync(OUTPUT_FILE, xml, "utf8");

    console.log(
        `Готово: ${STATIC_PAGES.length} статичних + ${products.length} товарів + ` +
        `${brands.length} брендів + ${categories.length} категорій + ` +
        `${departments.length} розділів + ` +
        `${promotions.length} акцій + ${photos} фото → ${path.relative(ROOT, OUTPUT_FILE)}`
    );

}

// Охорона обов'язкова саме тому, що нижче з'явився module.exports:
// без неї require() із тесту перезаписував би sitemap.xml.
if (require.main === module) main();

// Експортуємо, щоб тест перевіряв складання записів, а не
// готовий файл: файл перезбирає CI, і в свіжому клоні він
// відстає від джерел.
module.exports = { urlEntry, productImages, MAX_IMAGES };
