// Генерує статичну сторінку p/<slug>/index.html на кожен товар.
//
// НАВІЩО ЦЕ ПОТРІБНО
// -------------------
// Сайт статичний, а сторінка товару жила за адресою /product?id=<число>.
// GitHub Pages не вміє віддавати різний файл на різний query-параметр,
// тож усі товари віддавали ОДИН product.html:
//
//     <title>Товар | BestBrnd4u</title>
//
// Googlebot обробляє сторінку у два проходи — спершу сирий HTML, і лише
// потім, окремою чергою (на нових сайтах це тижні), відрендерений JS.
// На першому проході всі 30+ товарів виглядали як копії однієї сторінки
// без опису й без назви товару. Плюс у каталозі перехід на товар робив
// JS-обробник кліку, а не <a href> — тобто вхідних посилань на сторінки
// товарів не було взагалі, і в індекс вони могли потрапити лише через
// sitemap.
//
// Тепер кожен товар — окремий файл із готовими <title>, description,
// canonical, Open Graph, Twitter Card і JSON-LD Product просто в
// розмітці, плюс видимий текстовий блок (назва, бренд, ціна, опис,
// характеристики, фото з alt). Тобто сторінка повноцінна ще ДО того,
// як виконався хоч один рядок JS.
//
// ЯК ЦЕ ПРАЦЮЄ РАЗОМ З JS
// ------------------------
// Шаблон — той самий product.html. Статичний блок кладеться всередину
// <div id="productPage">, а product.js при завантаженні перезаписує цей
// блок інтерактивною версією (галерея, вибір кольору/розміру, кошик).
// Тобто дублювання логіки немає: статика потрібна лише роботу і тому,
// у кого не виконався JS.
//
// ПРО <base href="/">
// -------------------
// Шаблон писався для сторінки в корені, тож усередині повно відносних
// шляхів — і в розмітці (assets/css/style.css), і в самому JS
// (fetch("data/products.json"), src="assets/images/…" у згенерованих
// картках). Зі сторінки /p/<slug>/ вони вели б у /p/<slug>/assets/…
// Статичні атрибути ми переписуємо на кореневі нижче, але дотягтись до
// шляхів, які JS будує в рантаймі, можна тільки через <base href="/"> —
// саме для цього тег і існує. Обидва механізми навмисно лишені разом:
// розмітка коректна сама по собі, <base> закриває динаміку.
//
// ЗАПУСК: node scripts/build-product-pages.js
// В CI викликається з .github/workflows/build-products.yml одразу після
// build-products.js, бо читає вже зібраний data/products.json.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TEMPLATE_FILE = path.join(ROOT, "product.html");
const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const OUTPUT_DIR = path.join(ROOT, "p");
// домен береться з site.config.json (див. scripts/site-env.js)
const { SITE_URL } = require("./site-env");

const { slugProblem } = require("./slug-safety");

// Кадрування фото — той самий файл, що виконується в браузері й в
// адмінці (assets/js/image-framing.js). Статична розмітка мусить
// показувати той самий кадр, що й JS-версія сторінки, інакше при
// гідратації фото стрибне.
const ImageFraming = require("../assets/js/image-framing.js");

// Хлібні крихти — той самий будівник, що виконується в браузері.
// Доріжка потрібна і в розмітці сторінки, і в BreadcrumbList для
// Google; збирати їх окремо означало б рано чи пізно показати роботу
// шлях, якого на сторінці немає.
const Breadcrumbs = require("../assets/js/breadcrumbs.js");

const CATEGORIES_FILE = path.join(ROOT, "data", "categories.json");

// назва категорії → відділ, і відділ → усі його категорії
function loadCategoryIndex() {

    if (!fs.existsSync(CATEGORIES_FILE)) return { departmentOf: () => "", categoriesOfDepartment: () => [] };

    const list = JSON.parse(fs.readFileSync(CATEGORIES_FILE, "utf8"));
    const rows = Array.isArray(list) ? list : (list.categories || []);

    const byCategory = new Map();
    const byDepartment = new Map();

    rows.forEach(row => {

        const name = row && (row.name || row.title);
        const department = row && row.department;

        if (!name || !department) return;

        byCategory.set(name, department);

        if (!byDepartment.has(department)) byDepartment.set(department, []);
        byDepartment.get(department).push(name);

    });

    return {
        departmentOf: name => byCategory.get(name) || "",
        categoriesOfDepartment: department => byDepartment.get(department) || []
    };

}

const categoryIndex = loadCategoryIndex();

function trailFor(product) {
    return Breadcrumbs.buildTrail(product, categoryIndex);
}

// Умови повернення й доставки для розмітки товару.
//
// Search Console просив додати hasMerchantReturnPolicy і shippingDetails
// у offers (розділ Merchant listings). Значення нижче — НЕ вигадані:
// узяті зі сторінок return-warranty і delivery-payment, тож розмітка
// збігається з тим, що покупець реально прочитає на сайті.
//
// • 14 днів на повернення — строк із Закону України «Про захист прав
//   споживачів», саме він зазначений в умовах;
// • пересилку назад при «не підійшов розмір/колір» оплачує покупець —
//   для цього в schema.org є значення ReturnFeesCustomerResponsibility,
//   воно не вимагає вказувати суму (а сума й залежить від відправлення);
// • 1–2 дні на збірку + 1–3 дні доставки Новою поштою по Україні;
// • доставка безкоштовна від 3 500 грн. Найдешевший товар каталогу —
//   4 000 грн, тобто для будь-якого окремого товару доставка справді
//   нульова. Якщо колись з'явиться товар дешевше за поріг, ставка не
//   вказується: краще неповна розмітка, ніж неправдива обіцянка.
const RETURN_POLICY = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "UA",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility"
};

const FREE_SHIPPING_FROM = 3500;

// Артикул для розмітки: перевірений і почищений.
//
// НАВІЩО ПЕРЕВІРКА
// -----------------
// Search Console прислав «Invalid value in field "sku"» (Merchant
// listings). Причина була в даних: при імпорті з Amazon в поле артикула
// потрапила НАЗВА товару разом з ASIN —
//
//     "Gabbi Ruched Hobo Handbag - Grass Green  B094QT219C"
//
// 51 символ, подвійний пробіл усередині. Для Google sku — це коротка
// позначка товару, а не речення, і таке значення він відкидає.
//
// Порожній рядок теж «invalid»: JSON.stringify прибирає лише undefined,
// тож "sku": "" спокійно потрапляє в розмітку.
//
// МЕЖІ НИЖЧЕ
// -----------
// • не довше 50 символів;
// • не більше 3 пробілів — цього вистачає справжнім артикулам
//   ("BE4361F 300187 51", "coach ethan cv918 qbnrx", "MJ 1010/S 0807/9O 54"),
//   але відсікає назву товару, яка випадково опинилась у полі.
//
// Слеші НЕ чіпаємо: "NENA/S 807 51" і "MJ 1010/S 0807/9O 54" — це
// справжні моделі Jimmy Choo і Marc Jacobs, а не сміття.
//
// Невдале значення не підставляємо «як є» і не мовчимо: краще випустити
// необов'язкове поле, ніж віддати Google завідомо биті дані, — і одразу
// написати в лог збірки, щоб дані виправили в адмінці.
const SKU_MAX_LENGTH = 50;

// Скільки слів ще схоже на артикул.
//
// Пробіли в артикулі Google забороняє повністю, тож ми їх замінюємо на
// дефіс. Але заміна не має перетворювати назву товару на «артикул»:
// «Gabbi-Ruched-Hobo-Handbag-Grass-Green» формально без пробілів, а
// артикулом не є. Тому довгі багатослівні значення так само
// відкидаємо — просто рахуємо слова до заміни.
const SKU_MAX_WORDS = 4;

const skuWarnings = [];

// Артикул для розмітки Google.
//
// ВИМОГА, ЯКУ Я РАНІШЕ ПРОЧИТАВ НЕУВАЖНО
// ---------------------------------------
// Документація merchant listings каже прямо: «The sku value must not
// contain any whitespace characters». Тут стояв поріг SKU_MAX_SPACES=3,
// тобто до трьох пробілів вважались нормою — і Search Console справедливо
// показувала помилку на 16 товарах із 56.
//
// Пробіли замінюємо на дефіс, а не прибираємо: «A05042 0037354» →
// «A05042-0037354» лишається схожим на код постачальника, і пошук по
// артикулу на сайті чи в листі його впізнає. Склеювання в
// «A050420037354» зробило б із двох частин одну незрозумілу.
function sanitizeSku(value, context) {

    const raw = String(value === undefined || value === null ? "" : value)
        .replace(/\s+/g, " ")
        .trim();

    if (!raw) return "";

    const words = raw.split(" ").length;

    const reason = raw.length > SKU_MAX_LENGTH
        ? `довший за ${SKU_MAX_LENGTH} символів (${raw.length})`
        : words > SKU_MAX_WORDS
            ? `${words} слів — схоже на назву, а не на артикул`
            : "";

    if (reason) {
        if (context) skuWarnings.push(`${context}: «${raw}» — ${reason}`);
        return "";
    }

    // Пробіли → дефіси. Подвійні дефіси стягуємо: «A05042 - 0037354» не
    // має ставати «A05042---0037354».
    return raw.replace(/ /g, "-").replace(/-{2,}/g, "-");

}

// Артикул: спершу власний, далі — першого варіанта з придатним.
function firstSku(product) {

    const context = product.slug || product.title || "товар без slug";

    const own = sanitizeSku(product.sku, product.sku ? context : "");

    if (own) return own;

    for (const variant of product.variants || []) {

        const fromVariant = sanitizeSku(variant && variant.sku,
            variant && variant.sku
                ? `${context} → варіант «${variant.color || variant.name || "?"}»`
                : "");

        if (fromVariant) return fromVariant;

    }

    return "";

}

function shippingDetailsFor(price) {

    const details = {
        "@type": "OfferShippingDetails",
        shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: "UA"
        },
        deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: {
                "@type": "QuantitativeValue",
                minValue: 1,
                maxValue: 2,
                unitCode: "DAY"
            },
            transitTime: {
                "@type": "QuantitativeValue",
                minValue: 1,
                maxValue: 3,
                unitCode: "DAY"
            }
        }
    };

    if (Number(price) >= FREE_SHIPPING_FROM) {
        details.shippingRate = {
            "@type": "MonetaryAmount",
            value: 0,
            currency: "UAH"
        };
    }

    return details;

}


// ---------------------------------------------------------------
// дрібні помічники
// ---------------------------------------------------------------

function escapeHtml(value) {

    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

}

// абсолютна адреса: OG і schema.org відносних шляхів не приймають
function absoluteUrl(url) {

    if (!url) return "";

    if (/^https?:\/\//i.test(url)) return url;

    return `${SITE_URL}/${String(url).replace(/^\/+/, "")}`;

}

function truncateForMeta(text, maxLength = 155) {

    const value = String(text || "").replace(/\s+/g, " ").trim();

    if (value.length <= maxLength) return value;

    const cut = value.slice(0, maxLength);

    return cut.slice(0, cut.lastIndexOf(" ")).trim() + "…";

}

function formatPrice(price) {

    return new Intl.NumberFormat("uk-UA").format(price) + " грн";

}

// JSON-LD всередині <script> — щоб "</script>" в описі товару не
// закрив тег передчасно
function jsonLdScript(id, data) {

    const json = JSON.stringify(data, null, 2).replace(/</g, "\\u003c");

    return `<script type="application/ld+json" id="${id}">\n${json}\n</script>`;

}

// ---------------------------------------------------------------
// підготовка шаблону
// ---------------------------------------------------------------

// Відносні href/src → кореневі. Не чіпаємо абсолютні адреси,
// протоколи (mailto:, tel:, data:) і якорі.
function rootRelativeLinks(html) {

    return html.replace(
        /(\s(?:href|src))="(?!https?:|\/\/|\/|#|mailto:|tel:|data:|javascript:)([^"]*)"/g,
        (_, attr, value) => `${attr}="/${value}"`
    );

}

function buildTemplate() {

    let html = fs.readFileSync(TEMPLATE_FILE, "utf8");

    html = rootRelativeLinks(html);

    // <base> одразу після <head>, ДО будь-яких href/src
    html = html.replace(
        /<head>/i,
        '<head>\n\n<!-- Сторінка лежить у /p/<slug>/, а скрипти будують шляхи як\n'
        + '     з кореня ("data/products.json", "assets/images/…").\n'
        + '     Без <base> вони перетворились би на /p/<slug>/data/…\n'
        + '     Файл згенеровано: scripts/build-product-pages.js -->\n'
        + '<base href="/">'
    );

    // блок мета-тегів шаблону вирізаємо — для кожного товару свій
    html = html.replace(/<title>[\s\S]*?<\/title>/i, "<!--SEO_HEAD-->");
    html = html.replace(/\n?<meta name="description"[^>]*>/i, "");

    // прибираємо коментар-пояснення про запасні теги: у згенерованій
    // сторінці теги вже справжні, коментар вводив би в оману
    html = html.replace(/<!--\s*Заголовок і опис нижче[\s\S]*?-->\s*/i, "");

    if (!html.includes("<!--SEO_HEAD-->")) {
        throw new Error("У product.html не знайдено <title> — шаблон змінився");
    }

    if (!/<div id="productPage">\s*<\/div>/.test(html)) {
        throw new Error('У product.html не знайдено порожній <div id="productPage">');
    }

    return html;

}

// ---------------------------------------------------------------
// <head> конкретного товару
// ---------------------------------------------------------------

function buildHead(product) {

    const url = `${SITE_URL}/p/${encodeURIComponent(product.slug)}/`;

    const priceText = formatPrice(product.price);

    const title = `${product.title} — купити за ${priceText} | BestBrnd4u`;

    const description = truncateForMeta(
        product.description
        || `${product.title} від ${product.brand} — купити в інтернет-магазині BestBrnd4u. Ціна ${priceText}.`
    );

    const images = (product.images || []).map(absoluteUrl).filter(Boolean);

    const availability = product.preOrder
        ? "https://schema.org/PreOrder"
        : "https://schema.org/InStock";

    const productLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        image: images,
        description,
        // Артикул може бути не в товара, а у варіанта (колір/розмір).
        // Раніше тут стояло лише product.sku, і в одного товару поле
        // взагалі не потрапляло в розмітку — Search Console скаржився
        // на sku в розділі Merchant listings.
        sku: firstSku(product) || undefined,
        brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
        category: product.category || undefined,
        offers: {
            "@type": "Offer",
            url,
            priceCurrency: "UAH",
            price: product.price,
            itemCondition: "https://schema.org/NewCondition",
            hasMerchantReturnPolicy: RETURN_POLICY,
            shippingDetails: shippingDetailsFor(product.price),
            availability
        }
    };

    // рейтинг додаємо ЛИШЕ якщо він реальний: вигадана розмітка
    // aggregateRating — пряма причина ручних санкцій Google
    if (product.rating && product.reviews) {
        productLd.aggregateRating = {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviews
        };
    }

    // Раніше тут було жорстко три ланки — Головна / Каталог / Назва, —
    // і вони не збігались із тим, що показує сайт. Тепер обидва місця
    // беруть доріжку з одного будівника.
    const breadcrumbLd = Breadcrumbs.toJsonLd(trailFor(product), SITE_URL, url);

    return [
        `<title>${escapeHtml(title)}</title>`,
        ``,
        `<meta name="description" content="${escapeHtml(description)}">`,
        `<link rel="canonical" href="${escapeHtml(url)}">`,
        ``,
        `<meta property="og:type" content="product">`,
        `<meta property="og:site_name" content="BestBrnd4u">`,
        `<meta property="og:locale" content="uk_UA">`,
        `<meta property="og:title" content="${escapeHtml(title)}">`,
        `<meta property="og:description" content="${escapeHtml(description)}">`,
        `<meta property="og:url" content="${escapeHtml(url)}">`,
        `<meta property="og:image" content="${escapeHtml(images[0] || "")}">`,
        `<meta property="product:price:amount" content="${escapeHtml(product.price)}">`,
        `<meta property="product:price:currency" content="UAH">`,
        ``,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${escapeHtml(title)}">`,
        `<meta name="twitter:description" content="${escapeHtml(description)}">`,
        `<meta name="twitter:image" content="${escapeHtml(images[0] || "")}">`,
        ``,
        jsonLdScript("productSchema", productLd),
        jsonLdScript("breadcrumbSchema", breadcrumbLd),
        ``,
        `<script>`,
        `// який саме товар на цій сторінці — щоб product.js не мусив`,
        `// вгадувати його з адреси`,
        `window.PRODUCT_SLUG = ${JSON.stringify(product.slug)};`,
        `window.PRODUCT_ID = ${JSON.stringify(product.id)};`,
        `</script>`
    ].join("\n");

}

// ---------------------------------------------------------------
// видимий текст сторінки (те, що бачить робот до рендеру JS)
// ---------------------------------------------------------------

// Доріжка в розмітці сторінки.
//
// У шаблоні product.html лежить заготовка з трьох ланок
// (Головна / Каталог / назва). Замінюємо її цілком: інакше статична
// сторінка показувала б коротку доріжку, а після виконання JS вона
// стрибком ставала б довгою.
const BREADCRUMB_SLOT_RE = /<div class="container" id="breadcrumbsList">[\s\S]*?<\/div>/;

function breadcrumbsMarkup(product) {

    // Адреси абсолютні, як і решта посилань у згенерованій розмітці:
    // сторінка лежить у /p/<slug>/, і хоч <base href="/"> відносний
    // шлях і врятує, у розмітці для робота краще не залежати від нього.
    const nodes = trailFor(product).map(crumb => crumb.current
        ? `<span class="crumb-current">${escapeHtml(crumb.label)}</span>`
        : `<a href="${escapeHtml(absoluteUrl(crumb.href))}">${escapeHtml(crumb.label)}</a>`);

    const html = nodes.join('\n<span class="crumb-sep">–</span>\n');

    // Кнопка «Назад» — та сама розмітка, що в рантаймі
    // (assets/js/breadcrumbs.js → BACK_HTML), щоб статична сторінка й
    // сторінка після виконання JS не відрізнялись.
    // href кнопки робимо абсолютним, як і решта посилань у згенерованій
    // розмітці: сторінка лежить у /p/<slug>/, і хоч <base href="/">
    // відносний шлях і врятує, у статиці краще на нього не покладатись.
    const back = Breadcrumbs.BACK_HTML
        .replace('href="catalog"', `href="${escapeHtml(absoluteUrl("catalog"))}"`);

    return `<div class="container" id="breadcrumbsList">\n`
        + `${back}\n${html}\n</div>`;

}

function buildBody(product) {

    const priceText = formatPrice(product.price);

    const oldPrice = product.oldPrice && product.oldPrice > product.price
        ? `<span class="old-price">${escapeHtml(formatPrice(product.oldPrice))}</span>`
        : "";

    const gallery = (product.images || []).slice(0, 5).map((img, i) => {

        const frame = ImageFraming.frameStyleAttr(product.framing, img);

        return `
                <img
                    src="${escapeHtml(absoluteUrl(img))}"${frame ? `
                    style="${escapeHtml(frame)}"` : ""}
                    alt="${escapeHtml(product.title)}${i ? ` — фото ${i + 1}` : ""}"
                    width="600"
                    height="600"
                    loading="${i ? "lazy" : "eager"}">`;

    }).join("");

    const colors = [...new Set((product.variants || [])
        .map(v => v && v.color)
        .filter(Boolean))];

    const sizes = [...new Set([
        ...(product.sizes || []),
        ...(product.variants || []).flatMap(v => (v && v.sizes) || [])
    ].filter(Boolean))];

    const specs = [
        ["Бренд", product.brand],
        ["Категорія", product.category],
        ["Стать", product.gender],
        ["Артикул", product.sku],
        ["Кольори", colors.join(", ")],
        ["Розміри", sizes.join(", ")]
    ]
        .filter(([, value]) => value)
        .map(([label, value]) => `
                <li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
        .join("");

    // Блок повністю замінюється інтерактивною версією з product.js —
    // тут лише те, що має прочитати пошуковий робот.
    return `
<div class="product-static-seo">

    <h1>${escapeHtml(product.title)}</h1>

    <p class="product-static-brand">${escapeHtml(product.brand || "")}</p>

    <p class="product-static-price">
        <span class="price">${escapeHtml(priceText)}</span>
        ${oldPrice}
    </p>

    <div class="product-static-gallery">${gallery}
    </div>

    <p class="product-static-desc">${escapeHtml(product.description || "")}</p>

    <ul class="product-static-specs">${specs}
    </ul>

    <p class="product-static-status">${product.preOrder ? "Під замовлення" : "В наявності"}</p>

</div>
`;

}

// ---------------------------------------------------------------

function main() {

    if (!fs.existsSync(PRODUCTS_FILE)) {
        console.error(`Не знайдено ${PRODUCTS_FILE} — спершу запустіть build-products.js`);
        process.exit(1);
    }

    const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf8"));

    const template = buildTemplate();

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const written = new Set();

    products.forEach(product => {

        if (!product.slug) {
            console.error(`::error::Товар id=${product.id} без slug — сторінку не згенеровано`);
            return;
        }

        // та сама перевірка, що й для файлів у data/: slug зі службовими
        // символами зламав би і шлях до теки, і адресу
        const problem = slugProblem(product.slug);

        if (problem) {
            console.error(`::error::Товар id=${product.id}: ${problem}. Сторінку не згенеровано.`);
            return;
        }

        const html = template
            .replace("<!--SEO_HEAD-->", buildHead(product))
            .replace(BREADCRUMB_SLOT_RE, breadcrumbsMarkup(product))
            .replace('<div id="productPage">\n\n</div>',
                `<div id="productPage">${buildBody(product)}</div>`)
            .replace('<div id="productPage"></div>',
                `<div id="productPage">${buildBody(product)}</div>`);

        const dir = path.join(OUTPUT_DIR, product.slug);

        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");

        written.add(product.slug);

    });

    // Прибираємо теки товарів, яких уже немає в каталозі. Без цього
    // видалений через адмінку товар назавжди лишався б доступним за
    // старою адресою — і в індексі Google теж.
    let removed = 0;

    fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .forEach(entry => {

            if (written.has(entry.name)) return;

            fs.rmSync(path.join(OUTPUT_DIR, entry.name), { recursive: true, force: true });

            console.log(`🗑  прибрано сторінку видаленого товару: p/${entry.name}/`);

            removed++;

        });

    // Артикули, які не пройшли перевірку, у розмітку не пішли. Мовчазне
    // зникнення поля — це той самий баг, тільки непомітний, тож пишемо
    // прямо в лог збірки: видно і локально, і в Actions.
    if (skuWarnings.length) {

        console.warn(`::warning::Артикулів відкинуто: ${skuWarnings.length} `
            + "— у розмітку товару вони не потрапили. Виправте поле «Артикул» в адмінці.");

        skuWarnings.forEach(line => console.warn(`   ⚠ ${line}`));

    }

    console.log(`Готово: ${written.size} сторінок товарів → p/<slug>/index.html`
        + (removed ? `, прибрано зайвих: ${removed}` : ""));

}

main();
