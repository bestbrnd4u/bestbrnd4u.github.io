// Генерує feed.xml — товарний фід для Google Merchant Center і
// каталогу Meta (Facebook/Instagram).
//
// НАВІЩО
// -------
// Сайт знаходять ті, хто вже знає його назву. Решта шукає ТОВАР — у
// Google Покупках, у вкладці Shopping, у стрічці Instagram. Туди
// потрапляють не сторінки, а фід: машинний список товарів із ціною,
// наявністю, фото й посиланням. Без нього магазину в цих місцях
// просто немає — жодна сторінка сама туди не приїде.
//
// ЧОМУ ОДИН ФАЙЛ НА ДВІ ПЛАТФОРМИ
// --------------------------------
// Meta приймає той самий формат, що й Google — RSS 2.0 з полями g:.
// Тому цей один feed.xml підключають і в Merchant Center, і в каталозі
// Meta. Prom і Rozetka хочуть інший формат (YML) — його варто робити
// тоді, коли справді буде потреба там продавати, а не «про запас».
//
// ОДИН РЯДОК ФІДА = ОДИН КОЛІР І РОЗМІР
// --------------------------------------
// Google і Meta вимагають окремий рядок на кожен варіант, який можна
// купити, і зв'язують їх через item_group_id. Це не формальність:
// саме тому в Покупках показується конкретна біла 38-ма, а не «є
// щось із цієї моделі».
//
// У нас наявність теж рахується по кольору й розміру (див.
// assets/js/stock.js), тож поділ природний: 100 товарів дають 130
// рядків. Наявність кожного рядка бере ТОЙ САМИЙ модуль, що сайт і
// адмінка — інакше фід обіцяв би те, чого на сайті вже немає.
//
// ЩО НЕ ПОТРАПЛЯЄ У ФІД
// ----------------------
// - розпродані товари: їх немає і в products.json (див. build-products.js);
// - товари без опису, фото чи ціни: Google такий рядок все одно
//   відхилить, і краще знати про це з логу збірки, ніж з листа
//   Merchant Center через тиждень;
// - службові сторінки — у фіді взагалі лише товари.
//
// ПРО ЦІНУ ЗІ ЗНИЖКОЮ
// --------------------
// У Google price — це звичайна ціна, sale_price — знижена. Якщо
// віддати одну знижену як price, платформа не покаже перекреслену
// стару, тобто знижка втратить половину сенсу. Тому при наявності
// oldPrice ціни їдуть парою.

const fs = require("fs");
const path = require("path");

// домен береться з site.config.json (див. scripts/site-env.js)
const { SITE_URL } = require("./site-env");
// кирилиця в адресі кольору → латиниця, як на самому сайті
const { toSlug } = require("./translit");
// правила залишків — той самий модуль, що працює на сайті й в адмінці
const Stock = require("../assets/js/stock.js");

const ROOT = path.join(__dirname, "..");
const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const CATEGORIES_FILE = path.join(ROOT, "data", "categories.json");
const OUTPUT_FILE = path.join(ROOT, "feed.xml");

// Типовий тариф перевізника (грн) — ТЕ САМЕ число, що в розмітці
// сторінки товару (SHIPPING_RATE_UAH у assets/js/product.js).
//
// НАВІЩО ЦЕ У ФІДІ. Без g:shipping Merchant Center бере доставку з
// налаштувань акаунта. Якщо вони не збігаються з розміткою
// сторінки, Google скаржиться на розходження й може притримати
// товари в Покупках — а розмітка в нас 60 ₴.
//
// Нуль тут ставити не можна: магазин за доставку не бере, але
// покупець її платить перевізнику. «Безкоштовна доставка» в
// Покупках показала б нижчу підсумкову ціну, ніж людина заплатить.
const SHIPPING_RATE_UAH = 60;

// Магазин возить лише по Україні.
const SHIPPING_COUNTRY = "UA";

// Поля, які колір може перебити.
//
// Дзеркало переліку з colorOverrides() у assets/js/common.js — там
// живе те саме правило для сайту. Спільним модулем не зробити: той
// файл читають тести, витягуючи з нього функції регуляркою, і
// переїзд зламав би їх. Замість цього за збігом переліків стежить
// tests/test-feed.js — розійтись вони не можуть непомітно.
const COLOR_FIELDS = ["title", "description", "price", "oldPrice"];

// ONESIZE — наша заглушка для товарів без розмірів (сумки, годинники,
// окуляри). У фіді її не показуємо: Google очікує в size справжній
// розмір, а «ONESIZE» у картці виглядає як помилка даних.
const NO_SIZE = "ONESIZE";

function xmlEscape(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}

// Абсолютна адреса. У даних трапляються обидві форми — «/assets/…» і
// «assets/…» (див. products.json), а фід приймає лише повні адреси.
function absolute(url, siteUrl) {

    const clean = String(url || "").trim();

    if (!clean) return "";

    if (/^https?:\/\//i.test(clean)) return clean;

    return `${siteUrl || SITE_URL}/${clean.replace(/^\/+/, "")}`;

}

// Значення полів для конкретного кольору: своє, якщо заповнене,
// інакше товарне. Порожній рядок у CMS означає «не заповнено».
function colorView(product, variant) {

    const view = {};

    COLOR_FIELDS.forEach(field => {

        const own = variant ? variant[field] : undefined;

        if (own === undefined || own === null || (typeof own === "string" && !own.trim())) {
            view[field] = product[field];
            return;
        }

        view[field] = typeof own === "string" ? own.trim() : own;

    });

    return view;

}

// Наявність. «Під замовлення» — це backorder: замовити можна, поїде
// пізніше. preorder у Google означає інше — товар ще не вийшов і має
// дату появи; для нас це неправда.
function availabilityOf(product, variant, size) {

    const preOrder = size
        ? Stock.sizePreOrder(product, variant, size)
        : Stock.colorPreOrder(product, variant);

    return preOrder ? "backorder" : "in_stock";

}

// Стать у термінах Google. Кілька значень або «Унісекс» → unisex:
// це не втрата, а правда — товар справді для всіх.
function genderOf(product) {

    const list = Array.isArray(product.gender)
        ? product.gender
        : (product.gender ? [product.gender] : []);

    const clean = list.filter(g => g && g !== "Дітям");

    if (clean.length !== 1) return clean.length ? "unisex" : "";

    if (clean[0] === "Жінкам") return "female";
    if (clean[0] === "Чоловікам") return "male";

    return "unisex";

}

function ageGroupOf(product) {

    const list = Array.isArray(product.gender) ? product.gender : [product.gender];

    return list.includes("Дітям") ? "kids" : "adult";

}

// product_type — НАША категорія, а не таксономія Google.
//
// google_product_category свідомо не заповнюємо: вгадувати за нас
// рядки чужої таксономії — найкращий спосіб отримати товар не в тому
// розділі. Google визначає розділ сам, а product_type допомагає йому
// і водночас лишається зрозумілим у звітах.
function productType(product, departmentByCategory) {

    const category = product.category;

    if (!category) return "";

    const department = departmentByCategory.get(category);

    return department ? `${department} > ${category}` : category;

}

// Ідентифікатор рядка. Артикул варіанту («7-1») будується від id
// товару, а id збірка присвоює раз і назавжди — тобто ідентифікатор
// стабільний. Merchant Center за ним зшиває статистику, і зміна id
// означає для нього новий товар без історії.
function itemId(product, variant, index, size) {

    const base = variant && variant.article
        ? String(variant.article)
        : `${product.id}-${index + 1}`;

    return size ? `${base}-${size}` : base;

}

// Назва з кольором у кінці — коли кольорів більше одного.
//
// Без цього в Покупках стоїть п'ять однакових назв поруч, і людина не
// розуміє, чим вони відрізняються. Дублювати колір, який уже є в
// назві, теж не будемо.
function titleOf(view, product, variant) {

    const title = String(view.title || "").trim();

    const color = variant && variant.color ? String(variant.color).trim() : "";

    if (!color || (product.variants || []).length < 2) return title;

    if (title.toLowerCase().includes(color.toLowerCase())) return title;

    return `${title} — ${color}`;

}

// Опис одним абзацом: переноси рядків у фіді нічого не дають, а
// частина платформ показує їх як «\n».
function descriptionOf(view) {

    return String(view.description || "")
        .replace(/\s*\n\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 4900);

}

function priceTag(value) {
    return `${Number(value).toFixed(2)} UAH`;
}

function feedItems(products, departmentByCategory, siteUrl) {

    const items = [];
    const skipped = [];

    (products || []).forEach(product => {

        const variants = Array.isArray(product.variants) ? product.variants : [];

        if (!variants.length) {
            skipped.push(`${product.slug || product.id}: немає варіантів`);
            return;
        }

        variants.forEach((variant, index) => {

            const view = colorView(product, variant);

            const images = (variant.images || [])
                .map(src => absolute(src, siteUrl))
                .filter(Boolean);

            const price = Number(view.price);

            // Рядок без опису, фото чи ціни Google відхилить сам —
            // краще побачити це в логу збірки.
            if (!images.length || !Number.isFinite(price) || price <= 0 || !view.description) {

                skipped.push(`${product.slug}${variant.color ? ` (${variant.color})` : ""}: `
                    + [!images.length && "немає фото", !view.description && "немає опису",
                        (!Number.isFinite(price) || price <= 0) && "немає ціни"]
                        .filter(Boolean).join(", "));

                return;

            }

            const sizes = Stock.sizesOf(product, variant);

            // Товар без розмірів — один рядок; із розмірами — по рядку
            // на розмір, бо наявність у нас саме по розміру.
            const realSizes = sizes.filter(size => size && size !== NO_SIZE);
            const rows = realSizes.length ? realSizes : [null];

            rows.forEach(size => {

                const params = [];

                if (variant.color && variants.length > 1) {
                    params.push(`color=${encodeURIComponent(toSlug(variant.color))}`);
                }

                if (size) params.push(`size=${encodeURIComponent(size)}`);

                const link = `${siteUrl}/p/${encodeURIComponent(product.slug)}/`
                    + (params.length ? `?${params.join("&")}` : "");

                const oldPrice = Number(view.oldPrice);
                const onSale = Number.isFinite(oldPrice) && oldPrice > price;

                items.push({
                    id: itemId(product, variant, index, size),
                    title: titleOf(view, product, variant),
                    description: descriptionOf(view),
                    link,
                    image_link: images[0],
                    additional_image_link: images.slice(1, 11),
                    availability: availabilityOf(product, variant, size),
                    // Знижка парою: price — звичайна, sale_price — акційна.
                    price: priceTag(onSale ? oldPrice : price),
                    sale_price: onSale ? priceTag(price) : "",
                    brand: product.brand || "",
                    condition: "new",
                    mpn: variant.sku || product.sku || "",
                    // Штрихкодів (GTIN) у нас немає, і про це треба сказати
                    // прямо: інакше Merchant Center чекає їх і обмежує показ.
                    identifier_exists: (variant.sku || product.sku) ? "" : "no",
                    item_group_id: String(product.id),
                    color: variants.length > 1 ? (variant.color || "") : "",
                    size: size || "",
                    gender: genderOf(product),
                    age_group: ageGroupOf(product),
                    product_type: productType(product, departmentByCategory),
                    // Мітка для кампаній: за нею в рекламі можна окремо
                    // піднімати акції й новинки.
                    custom_label_0: onSale ? "акція" : (product.isNew ? "новинка" : "")
                });

            });

        });

    });

    return { items, skipped };

}

function itemXml(item) {

    const tag = (name, value) => value === "" || value === undefined || value === null
        ? null
        : `      <g:${name}>${xmlEscape(value)}</g:${name}>`;

    // Доставка. Складений тег: усередині країна й ціна, тому не через
    // tag(), який віддає простий рядок.
    //
    // Один і той самий тариф на всі товари — від ціни товару він не
    // залежить: платить покупець перевізнику при отриманні.
    const shipping = [
        "      <g:shipping>",
        `        <g:country>${SHIPPING_COUNTRY}</g:country>`,
        `        <g:price>${SHIPPING_RATE_UAH}.00 UAH</g:price>`,
        "      </g:shipping>"
    ].join("\n");

    const lines = [
        "    <item>",
        tag("id", item.id),
        `      <title>${xmlEscape(item.title)}</title>`,
        `      <description>${xmlEscape(item.description)}</description>`,
        `      <link>${xmlEscape(item.link)}</link>`,
        tag("image_link", item.image_link),
        ...item.additional_image_link.map(src => tag("additional_image_link", src)),
        tag("availability", item.availability),
        tag("price", item.price),
        tag("sale_price", item.sale_price),
        tag("brand", item.brand),
        tag("condition", item.condition),
        tag("mpn", item.mpn),
        tag("identifier_exists", item.identifier_exists),
        tag("item_group_id", item.item_group_id),
        tag("color", item.color),
        tag("size", item.size),
        tag("gender", item.gender),
        tag("age_group", item.age_group),
        tag("product_type", item.product_type),
        shipping,
        tag("custom_label_0", item.custom_label_0),
        "    </item>"
    ];

    return lines.filter(Boolean).join("\n");

}

function buildFeed(items, siteUrl) {

    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">`,
        `  <channel>`,
        `    <title>BestBrnd4u — сумки, одяг, взуття та аксесуари</title>`,
        `    <link>${xmlEscape(siteUrl)}</link>`,
        `    <description>Товари інтернет-магазину BestBrnd4u з цінами та наявністю</description>`,
        items.map(itemXml).join("\n"),
        `  </channel>`,
        `</rss>`,
        ""
    ].join("\n");

}

function departmentIndex(categories) {

    const byCategory = new Map();

    (categories || []).forEach(category => {

        if (category && category.name && category.department) {
            byCategory.set(category.name, category.department);
        }

    });

    return byCategory;

}

function readJsonSafe(file) {

    if (!fs.existsSync(file)) {
        console.warn(`Не знайдено ${path.relative(ROOT, file)} — пропускаю`);
        return [];
    }

    return JSON.parse(fs.readFileSync(file, "utf8"));

}

function main() {

    const products = readJsonSafe(PRODUCTS_FILE);
    const categories = readJsonSafe(CATEGORIES_FILE);

    const { items, skipped } = feedItems(products, departmentIndex(categories), SITE_URL);

    fs.writeFileSync(OUTPUT_FILE, buildFeed(items, SITE_URL), "utf8");

    skipped.forEach(reason => console.log(`⏭  не у фіді — ${reason}`));

    const backorder = items.filter(item => item.availability === "backorder").length;

    console.log(`Готово: ${items.length} позицій (з них під замовлення: ${backorder})`
        + ` → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

if (require.main === module) main();

module.exports = {
    feedItems,
    buildFeed,
    itemXml,
    availabilityOf,
    colorView,
    absolute,
    titleOf,
    itemId,
    genderOf,
    departmentIndex,
    COLOR_FIELDS
};
