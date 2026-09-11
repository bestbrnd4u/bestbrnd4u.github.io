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

// Тариф перевізника — зі спільного модуля assets/js/product-offer.js,
// того самого, з якого його бере розмітка сторінки товару.
//
// НАВІЩО ЦЕ У ФІДІ. Без g:shipping Merchant Center бере доставку з
// налаштувань акаунта. Якщо вони не збігаються з розміткою сторінки,
// Google скаржиться на розходження й може притримати товари в
// Покупках. Доти число було написане тут окремо від розмітки — тобто
// розійтись вони могли будь-якої миті, і ловив це лише тест.
const { SHIPPING_RATE_UAH } = require("../assets/js/product-offer.js");

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

// Скільки робочих днів чекати. Беремо БІЛЬШЕ число з «10-14 робочих
// днів»: обіцяти покупцеві коротший строк, ніж буває, — найгірший вид
// точності.
//
// Пробіли в полі стоять як завгодно («10- 14», «10 -14»), бо його
// заповнюють руками в адмінці, тож числа виловлюємо регуляркою, а не
// розбором за дефісом.
function preOrderWorkDays(product) {

    const numbers = String(product && product.preOrderDays || "").match(/\d+/g);

    if (!numbers || !numbers.length) return 0;

    return Math.max(...numbers.map(Number));

}

// Дата, до якої товар очікується — для g:availability_date.
//
// НАВІЩО. Для backorder Google вимагає дату; без неї позиція йде з
// попередженням у Merchant Center. Заміряно у фіді: 39 позицій
// backorder і жодної дати.
//
// Робочі дні → календарні: п'ять робочих на сім календарних. Округляємо
// вгору — знову ж, щоб не обіцяти раніше, ніж буде.
//
// Формат ISO 8601 з зоною, як просить Google. Дата рахується від дня
// збірки, тож із кожною перезбіркою вона зсувається вперед — це і є
// «очікуємо через два тижні», а не фіксований день у минулому.
function availabilityDate(product, from) {

    const work = preOrderWorkDays(product);

    if (!work) return "";

    const days = Math.ceil(work * 7 / 5);

    const date = new Date((from || new Date()).getTime() + days * 24 * 60 * 60 * 1000);

    // Обрізаємо до ПОЧАТКУ дня.
    //
    // НАВІЩО. З точністю до секунди кожна перезбірка давала інший
    // feed.xml, хоч у товарах нічого не змінювалось: перезбірка з CI і
    // локальна розійшлись на 13 секунд — git видав конфлікт у
    // згенерованому файлі, а в кожному коміті перезбірки лежав би діф
    // на 39 рядків ні про що.
    //
    // Точність до дня — це рівно те, що означає це поле («очікуємо
    // 28 вересня»), тож нічого не втрачаємо.
    date.setUTCHours(0, 0, 0, 0);

    return date.toISOString().replace(/\.\d{3}Z$/, "+00:00");

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

// Розділ таксономії Google — ЧИСЛОВИМ ID.
//
// ЩО БУЛО НЕ ТАК. Поле лишалось порожнім, і в коді стояло
// пояснення: «вгадувати за нас рядки чужої таксономії — найкращий
// спосіб отримати товар не в тому розділі». Заперечення правильне,
// але воно про ВГАДУВАННЯ. Кожен ID нижче звірено з офіційним
// переліком Google:
//
//     https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
//
// Числовий ID однозначний — на відміну від рядка, який Google
// мусить розпізнати й може розпізнати не так. Без цього поля розділ
// визначає сам Merchant Center, і саме він помиляється: сумку за
// назвою легко покласти у «Багаж», а не в «Сумки».
//
// ЧОГО ТУТ НЕМАЄ. Категорій, яких немає в переліку нижче. Для них
// поле лишається порожнім — тобто повертаємось до старого поводження
// (Google визначає сам), а не підставляємо приблизний розділ. Нова
// категорія засвітиться попередженням у журналі збірки: рівно там,
// де її побачить той, хто цю категорію щойно додав.
const GOOGLE_CATEGORY = {
    // Handbags, Wallets & Cases > Handbags. Чоловічі сумки магазину —
    // це crossbody/camera/belt, тобто та сама «сумка через плече», а
    // не Luggage & Bags > Messenger Bags (106): той розділ про
    // портфелі для документів і ноутбуків.
    "Жіночі сумки": 3032,
    "Чоловічі сумки": 3032,
    // Handbags, Wallets & Cases > Wallets & Money Clips
    "Гаманці": 2668,
    // Jewelry > Watches
    "Годинники": 201,
    // Clothing Accessories > Sunglasses. Усі позиції розділу —
    // сонцезахисні; з'являться оправи для зору, їм потрібен інший ID
    // (Vision Care), і мапа тут стане не за категорією, а за товаром.
    "Окуляри і оправи": 178,
    // Apparel & Accessories > Shoes
    "Кросівки": 187
};

// Категорії без розділу — збираємо, щоб сказати про них один раз у
// кінці збірки, а не по разу на кожен варіант товару.
const categoriesWithoutGoogleId = new Set();

function googleCategory(product) {

    const category = String(product.category || "").trim();

    if (!category) return "";

    const id = GOOGLE_CATEGORY[category];

    if (id) return String(id);

    categoriesWithoutGoogleId.add(category);

    return "";

}

// product_type — НАША категорія, а не таксономія Google: вона
// лишається зрозумілою у звітах Merchant Center і допомагає Google
// навіть там, де розділу ми не дали.
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

// Вікно ціни дня у форматі Google: два моменти через похилу риску.
//
// НАВІЩО ВІДДАВАТИ ВІКНО, А НЕ ГОТОВУ ЦІНУ. Фід збирається раз на
// збірку, а сейл починається о 18:00. Якби ми просто поклали в
// sale_price акційну ціну, Google показував би її з моменту збірки —
// тобто раніше за сайт, — а після кінця сейлу ще добу тримав би
// ціну, якої вже немає. Обидва випадки це розбіжність між фідом і
// сторінкою товару, і саме за неї Merchant Center знімає товари з
// показу.
//
// Порожньо, якщо дат немає: «ціна дня без дат» діє, поки її не
// приберуть, — і в Google так само.
function saleWindow(sale) {

    if (!sale || !sale.from || !sale.to) return "";

    const from = new Date(sale.from);
    const to = new Date(sale.to);

    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return "";

    return `${googleMoment(from)}/${googleMoment(to)}`;

}

// 2026-09-11T18:00:00+0000 — Google не приймає ні «Z», ні двокрапку
// в зсуві, тож ISO-рядок доводиться трохи підрізати.
function googleMoment(date) {

    return date.toISOString().replace(/\.\d+Z$/, "+0000");

}

// Короткі характеристики для g:product_highlight.
//
// Google показує їх у картці товару списком і просить від двох до
// десяти, кожна — коротка й без реклами. Беремо рівно те, що вже
// заповнено в адмінці: розміри (63 товари), ремінь (46), матеріал
// (62), застібку (5), склад (1).
//
// Порядок — від найчастішого питання покупця: «який розмір», «з чого
// зроблено», «як носити».
const HIGHLIGHT_LIMIT = 150;

function highlightsOf(product) {

    // Матеріалу тут немає навмисно: у нього власний тег g:material,
    // і той самий текст двічі в одній картці нічого не додає.
    const rows = [
        ["Розміри", product.dimensions],
        ["Склад", product.composition],
        ["", product.strapInfo],
        ["Застібка", product.closure]
    ];

    return rows
        .map(([label, value]) => {

            const text = String(value || "").trim().replace(/\s+/g, " ");

            if (!text) return "";

            // Готову фразу («Ремінь знімний, регульований») не
            // переписуємо — підпис потрібен лише там, де саме значення
            // без нього незрозуміле («26 × 14 × 10 см»).
            //
            // І не додаємо підпис, якщо значення вже має свій: у
            // окулярів dimensions — це «Ширина лінзи: 53 мм Місток:
            // 16 мм», і «Розміри: Ширина лінзи: …» читалось би як
            // помилка.
            const full = label && !text.includes(":") ? `${label}: ${text}` : text;

            return full.length > HIGHLIGHT_LIMIT
                ? `${full.slice(0, HIGHLIGHT_LIMIT - 1).trimEnd()}…`
                : full;

        })
        .filter(Boolean);

}

// Час збірки один на весь фід: інакше позиції, зібрані на межі
// секунди, отримали б різні дати очікування.
const BUILD_TIME = new Date();

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

                // Ціна дня. У Google рівнів лише два — звичайна ціна й
                // акційна, — тож коли в товару є і стара ціна, і ціна
                // дня, перекресленою стає найбільша з них, а акційною —
                // та, за якою справді продаємо.
                const deal = product.sale && Number(product.sale.price) > 0
                    ? Number(product.sale.price)
                    : 0;

                const listPrice = Number.isFinite(oldPrice) && oldPrice > price ? oldPrice : price;

                const onSale = deal > 0
                    ? deal < listPrice
                    : Number.isFinite(oldPrice) && oldPrice > price;

                const salePrice = deal > 0 ? deal : price;

                items.push({
                    id: itemId(product, variant, index, size),
                    title: titleOf(view, product, variant),
                    description: descriptionOf(view),
                    link,
                    image_link: images[0],
                    additional_image_link: images.slice(1, 11),
                    availability: availabilityOf(product, variant, size),
                    // Знижка парою: price — звичайна, sale_price — акційна.
                    price: priceTag(onSale ? listPrice : price),
                    sale_price: onSale ? priceTag(salePrice) : "",
                    // Вікно ставимо лише для ціни дня: у звичайної
                    // знижки (стара ціна в картці товару) кінця немає,
                    // і вигадувати його Google не можна.
                    sale_price_effective_date: deal > 0 && onSale
                        ? saleWindow(product.sale)
                        : "",
                    brand: product.brand || "",
                    condition: "new",
                    mpn: variant.sku || product.sku || "",
                    // Штрихкодів (GTIN) у нас немає, і про це треба сказати
                    // прямо: інакше Merchant Center чекає їх і обмежує показ.
                    identifier_exists: (variant.sku || product.sku) ? "" : "no",
                    item_group_id: String(product.id),
                    // Колір пишемо ЗАВЖДИ, коли він відомий.
                    //
                    // Раніше умовою було «більше одного кольору» — це
                    // правило для НАЗВИ (щоб не дублювати колір у
                    // заголовку), а тут воно лише губило дані: g:color —
                    // фільтр у Shopping, і для одноколірного товару він
                    // такий самий корисний.
                    color: variant.color || "",
                    size: size || "",
                    // Матеріал і характеристики — з полів товару, як їх
                    // заповнили в адмінці. Нічого не вигадуємо: немає
                    // поля — немає тега.
                    material: product.material || "",
                    product_highlight: highlightsOf(product),
                    availability_date: availabilityOf(product, variant, size) === "backorder"
                        ? availabilityDate(product, BUILD_TIME)
                        : "",
                    gender: genderOf(product),
                    age_group: ageGroupOf(product),
                    google_product_category: googleCategory(product),
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
        tag("availability_date", item.availability_date),
        tag("price", item.price),
        tag("sale_price", item.sale_price),
        tag("sale_price_effective_date", item.sale_price_effective_date),
        tag("brand", item.brand),
        tag("condition", item.condition),
        tag("mpn", item.mpn),
        tag("identifier_exists", item.identifier_exists),
        tag("item_group_id", item.item_group_id),
        tag("color", item.color),
        tag("size", item.size),
        tag("material", item.material),
        ...item.product_highlight.map(text => tag("product_highlight", text)),
        tag("gender", item.gender),
        tag("age_group", item.age_group),
        tag("google_product_category", item.google_product_category),
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

    // Нова категорія без розділу Google — не помилка збірки, але про
    // неї треба знати: без розділу Merchant Center вибирає його сам.
    categoriesWithoutGoogleId.forEach(name => {
        console.warn(`::warning::категорія «${name}» без google_product_category`
            + " — додайте ID у GOOGLE_CATEGORY у scripts/build-feed.js");
    });

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
