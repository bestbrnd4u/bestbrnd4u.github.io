// SEO-розмітка сторінки товару.
//
// Контент product.html будується на клієнті (product.js), тож усе, що
// бачить Google, з'являється лише після рендеру. Тому важливо, щоб
// жодне поле не було зіпсоване — переробити це «на живому сайті»
// й перевірити руками неможливо, індексація йде тижнями.
//
// Найбільша пастка, яку ловить цей набір: відносні шляхи до фото.
// У data/products.json вони лежать як "assets/images/…", а Open Graph
// і schema.org приймають лише абсолютні URL — з відносним Google
// просто викидає картинку з rich-результату товару, і зовні це
// виглядає як «розмітка є, а сніпета немає».
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
// домен — з site.config.json, щоб тест не ламався при переїзді
const { SITE_URL } = require("../scripts/site-env");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const commonJs = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8");
const productJs = fs.readFileSync(path.join(ROOT, "assets/js/product.js"), "utf8");
// читаємо ВИХІДНІ файли товарів, а не згенерований data/products.json:
// агрегат перезбирається в CI, і тест, прив'язаний до нього, падав би
// на порожньому чекауті (це правило стереже tests/test-migration-types.js)
const PRODUCTS_DIR = path.join(ROOT, "data/products");

const products = fs.readdirSync(PRODUCTS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, f), "utf8")))
    .filter(p => typeof p.id === "number")
    .sort((a, b) => a.id - b.id);

// піднімаємо в jsdom тільки SEO-частину common.js + product.js —
// решта сторінки для цих перевірок не потрібна
function seoSandbox() {

    const dom = new JSDOM(
        `<!DOCTYPE html><html><head><title>Товар | BestBrnd4u</title></head>
         <body><div id="productPage"></div><span id="breadTitle"></span></body></html>`,
        { runScripts: "outside-only", url: `${SITE_URL}/product?id=1` });

    const { window } = dom;

    const grab = re => {
        const m = commonJs.match(re);
        if (!m) throw new Error("не знайдено фрагмент " + re);
        return m[0];
    };

    window.SITE_URL = SITE_URL;
    window.eval(grab(/function productUrl\(product, params\) \{[\s\S]*?\n\}\n/));
    window.eval(grab(/function absoluteUrl\(url\) \{[\s\S]*?\n\}\n/));
    window.eval(grab(/function setMetaByName\(name, content\) \{[\s\S]*?\n\}\n/));
    window.eval(grab(/function setMetaByProperty\(property, content\) \{[\s\S]*?\n\}\n/));
    window.eval(grab(/function setCanonical\(url\) \{[\s\S]*?\n\}\n/));
    window.eval(grab(/function setJsonLd\(id, data\) \{[\s\S]*?\n\}\n/));
    window.eval(grab(/function truncateForMeta\(text, maxLength = 155\) \{[\s\S]*?\n\}\n/));

    window.getVariantSku = (p, v) => (v && v.sku) || p.sku || undefined;
    // умови повернення й доставки для offers — updateProductSeoMetadata
    // тепер посилається на них (додано на запит Search Console)
    // Через window.*, а не const: у jsdom оголошення const всередині
    // window.eval лишається в межах того ж виклику і глобальним не стає
    // (та сама пастка, що колись була з SITE_URL).
    window.eval(productJs.match(/const RETURN_POLICY = \{[\s\S]*?\n\};\n/)[0]
        .replace("const RETURN_POLICY =", "window.RETURN_POLICY ="));
    window.eval(productJs.match(/const FREE_SHIPPING_FROM = \d+;/)[0]
        .replace("const FREE_SHIPPING_FROM =", "window.FREE_SHIPPING_FROM ="));
    window.eval(productJs.match(/function shippingDetailsFor\(price\) \{[\s\S]*?\n\}\n/)[0]
        .replace("function shippingDetailsFor(price) {", "window.shippingDetailsFor = function (price) {"));

    // Артикул для розмітки чиститься окремо: Search Console відкидав
    // і надто довге значення, і порожній рядок (див. test-merchant-listings).
    window.eval(productJs.match(/const SKU_MAX_LENGTH = \d+;/)[0]
        .replace("const SKU_MAX_LENGTH =", "window.SKU_MAX_LENGTH ="));
    window.eval(productJs.match(/const SKU_MAX_SPACES = \d+;/)[0]
        .replace("const SKU_MAX_SPACES =", "window.SKU_MAX_SPACES ="));
    window.eval(productJs.match(/function sanitizeSku\(value\) \{[\s\S]*?\n\}\n/)[0]
        .replace("function sanitizeSku(value) {", "window.sanitizeSku = function (value) {"));
    window.eval(productJs.match(/function schemaSku\(product\) \{[\s\S]*?\n\}\n/)[0]
        .replace("function schemaSku(product) {", "window.schemaSku = function (product) {"));
    window.eval(productJs.match(/function markProductPageNotFound\(\) \{[\s\S]*?\n\}\n/)[0]);
    window.eval(productJs.match(/function updateProductSeoMetadata\(product\) \{[\s\S]*?\n\n\}\n/)[0]);

    return window;
}

const meta = (w, sel) => {
    const el = w.document.querySelector(sel);
    return el ? el.getAttribute("content") : null;
};

console.log("\n[1] absoluteUrl розгортає обидві форми шляху");
{
    const w = seoSandbox();
    check('"assets/…" → повна адреса',
        w.absoluteUrl("assets/images/a.webp") === `${SITE_URL}/assets/images/a.webp`,
        w.absoluteUrl("assets/images/a.webp"));
    check('"/assets/…" → без подвійного слеша',
        w.absoluteUrl("/assets/images/a.webp") === `${SITE_URL}/assets/images/a.webp`,
        w.absoluteUrl("/assets/images/a.webp"));
    check("зовнішнє посилання не чіпаємо",
        w.absoluteUrl("https://images.pexels.com/x.jpg") === "https://images.pexels.com/x.jpg");
    check("порожнє значення → порожній рядок", w.absoluteUrl("") === "" && w.absoluteUrl(null) === "");
}

console.log("\n[2] Реальний товар id=1 отримує власні теги");
{
    const w = seoSandbox();
    const product = products.find(p => p.id === 1);

    check("товар id=1 є в каталозі", !!product);

    w.updateProductSeoMetadata(product);

    check("title містить назву товару", w.document.title.includes(product.title), w.document.title);
    check("title не лишився шаблонним", w.document.title !== "Товар | BestBrnd4u");
    check("title містить ціну", /6\s?500/.test(w.document.title.replace(/\u00a0/g, " ")), w.document.title);

    const desc = meta(w, 'meta[name="description"]');
    check("description заповнено", !!desc && desc.length > 20, desc);
    check("description не довший за 155 символів", (desc || "").length <= 155, (desc || "").length);

    const canonical = w.document.querySelector('link[rel="canonical"]');
    check("canonical вказує на канонічну статичну адресу товару",
        canonical && canonical.getAttribute("href")
            === `${SITE_URL}/p/${encodeURIComponent(product.slug)}/`,
        canonical && canonical.getAttribute("href"));

    check("og:type = product", meta(w, 'meta[property="og:type"]') === "product");
    check("og:url абсолютний", /^https:\/\//.test(meta(w, 'meta[property="og:url"]') || ""));

    const ogImage = meta(w, 'meta[property="og:image"]');
    check("og:image абсолютний (головна пастка)", /^https?:\/\//.test(ogImage || ""), ogImage);
}

console.log("\n[3] Структуровані дані Product");
{
    const w = seoSandbox();
    const product = products.find(p => p.id === 1);
    w.updateProductSeoMetadata(product);

    const ld = JSON.parse(w.document.getElementById("productSchema").textContent);

    check("@type = Product", ld["@type"] === "Product");
    check("name = назва товару", ld.name === product.title);
    check("усі image[] абсолютні",
        Array.isArray(ld.image) && ld.image.length > 0 && ld.image.every(u => /^https?:\/\//.test(u)),
        JSON.stringify(ld.image));
    check("brand заповнено", ld.brand && ld.brand.name === product.brand);
    check("sku заповнено", !!ld.sku, ld.sku);
    check("offers.priceCurrency = UAH", ld.offers.priceCurrency === "UAH");
    check("offers.price — число, а не рядок", typeof ld.offers.price === "number", typeof ld.offers.price);
    check("offers.itemCondition проставлено", !!ld.offers.itemCondition, ld.offers.itemCondition);

    const bread = JSON.parse(w.document.getElementById("breadcrumbSchema").textContent);
    check("хлібні крихти — 3 рівні", bread.itemListElement.length === 3);
    check("останній рівень — сам товар", bread.itemListElement[2].name === product.title);
}

console.log("\n[4] availability відповідає реальному стану");
{
    const w = seoSandbox();
    const base = products.find(p => p.id === 1);

    w.updateProductSeoMetadata({ ...base, preOrder: false });
    let ld = JSON.parse(w.document.getElementById("productSchema").textContent);
    check("звичайний товар → InStock", /InStock$/.test(ld.offers.availability), ld.offers.availability);

    w.updateProductSeoMetadata({ ...base, preOrder: true });
    ld = JSON.parse(w.document.getElementById("productSchema").textContent);
    check("товар під замовлення → PreOrder", /PreOrder$/.test(ld.offers.availability), ld.offers.availability);
}

console.log("\n[5] Сторінка без товару не йде в індекс (м'який 404)");
{
    const w = seoSandbox();
    w.markProductPageNotFound();

    check("robots = noindex", /noindex/.test(meta(w, 'meta[name="robots"]') || ""),
        meta(w, 'meta[name="robots"]'));
    check("title змінено на «не знайдено»", /не знайдено/.test(w.document.title), w.document.title);
    check("виклик є в гілці «товар не знайдено»",
        /markProductPageNotFound\(\);[\s\S]{0,200}Товар не знайдено/.test(productJs));
}

console.log("\n[6] Запасні теги в сирому HTML (перший прохід Googlebot)");
{
    const html = fs.readFileSync(path.join(ROOT, "product.html"), "utf8");

    check("є meta description за замовчуванням",
        /<meta name="description"/.test(html));
    check("немає статичного canonical (він у кожного товару свій)",
        !/rel="canonical"/.test(html));
    check("robots дозволяє індексацію", /content="index,follow"/.test(html));
    check("product.js підключено", /assets\/js\/product\.js/.test(html));
}

console.log("\n[7] Кожен товар із каталогу є в sitemap.xml");
{
    // від серпня 2026 в sitemap іде канонічна адреса p/<slug>/,
    // а не стара /product?id= (детальніше — tests/test-static-product-pages.js)
    const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
    const missing = products.filter(
        p => !sitemap.includes(`/p/${encodeURIComponent(p.slug)}/<`));

    check(`усі ${products.length} товарів у sitemap`, missing.length === 0,
        missing.map(p => p.id).join(", "));
    check("сторінки з robots.txt Disallow у sitemap не потрапили",
        !/\/(cart|checkout|account|favorites|thanks)</.test(sitemap));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
