// Сторінки брендів і категорій: /brands/coach/, /categories/zhinochi-sumky/
//
// НАВІЩО
// -------
// Каталог бренду був адресою-фільтром: /catalog?brand=coach. Для
// пошуку це та сама сторінка «Каталог» — canonical у ній жорстко
// вказував на /catalog, у sitemap її не було, заголовок був спільний.
// Тобто ми самі казали Google: «дивитись нема на що, це дубль».
//
// Через це магазин міг вигравати лише запит «bestbrnd4u» — тобто
// приходили ті, хто вже знає назву. Запит «сумки Coach купити» такою
// сторінкою не виграється в принципі: у неї немає ні власної адреси,
// ні власного заголовка, ні власного тексту.
//
// Тепер у кожного бренду й кожної категорії є справжня сторінка:
// свій шлях, свій canonical, свій <title>, свої хлібні крихти, свій
// перелік товарів у розмітці — і місце в sitemap.
//
// ЧОМУ /categories/, А НЕ /catalog/<slug>/
// -----------------------------------------
// Спокуса зробити красиве /catalog/zhinochi-sumky/ коштувала б надто
// дорого: поруч лежить catalog.html, і статичний хостинг, побачивши
// теку catalog/, почав би перенаправляти /catalog на /catalog/ —
// тобто ВСІ наявні посилання на каталог (а їх повно і в меню, і в
// розісланих постах) поїхали б у 404. Тека categories/ такого сусіда
// не має.
//
// ЯК ЦЕ ПРАЦЮЄ
// -------------
// Сторінка — це той самий каталог: та сама розмітка, ті самі фільтри,
// той самий catalog.js. Відмінність одна: замість читання фільтра з
// адреси сторінка КАЖЕ йому фільтр сама — через window.CATALOG_PRESET.
// Тому нічого не довелось робити вдруге: сортування, пагінація,
// поділ карток за кольором працюють як у каталозі.
//
// Робот же бачить сторінку ще до JS: заголовок, вступ і перелік
// товарів уже лежать у розмітці (їх потім замінює той самий JS).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TEMPLATE_FILE = path.join(ROOT, "catalog.html");
const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const BRANDS_FILE = path.join(ROOT, "data", "brands.json");
const CATEGORIES_FILE = path.join(ROOT, "data", "categories.json");

const BRANDS_DIR = path.join(ROOT, "brands");
const CATEGORIES_DIR = path.join(ROOT, "categories");

const { SITE_URL } = require("./site-env");
const { toSlug } = require("./translit");
const { slugProblem } = require("./slug-safety");
const Breadcrumbs = require("../assets/js/breadcrumbs.js");

// Скільки товарів перелічувати в розмітці до JS.
//
// Не всі: сторінка бренду з 36 товарами дала б 36 карток тексту, які
// людина однаково не побачить (їх замінить каталог), зате вага
// сторінки зросла б утричі. Двадцяти достатньо, щоб робот побачив
// асортимент і знайшов шлях до кожного товару — решту він дійде
// пагінацією каталогу.
const STATIC_LIMIT = 20;

function escapeHtml(value) {

    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}

function formatPrice(price) {
    return `${Number(price).toLocaleString("uk-UA").replace(/ /g, " ")} ₴`;
}

function truncateForMeta(text, maxLength = 155) {

    const clean = String(text || "").replace(/\s+/g, " ").trim();

    if (clean.length <= maxLength) return clean;

    return clean.slice(0, maxLength - 1).replace(/\s+\S*$/, "") + "…";

}

function jsonLdScript(id, data) {

    return `<script type="application/ld+json" id="${id}">\n`
        + JSON.stringify(data, null, 2).replace(/</g, "\\u003c")
        + `\n</script>`;

}

// ---------------------------------------------------------------
// Шаблон: той самий каталог, але з місцем під свої теги
// ---------------------------------------------------------------

function rootRelativeLinks(html) {

    return html.replace(
        /(\s(?:href|src))="(?!https?:|\/\/|\/|#|mailto:|tel:|data:|javascript:)([^"]*)"/g,
        (_, attr, value) => `${attr}="/${value}"`
    );

}

const HEAD_SLOT = "<!--SEO_HEAD-->";
const BREADCRUMB_SLOT_RE = /<div class="container" id="breadcrumbsList">[\s\S]*?<\/div>/;
const GRID_SLOT_RE = /<div\s*\n?\s*id="catalogGrid"\s*\n?\s*class="products-grid">\s*<\/div>/;
const TITLE_SLOT = '<span id="catalogTitle">Каталог товарів</span>';
const ABOUT_SLOT = '<div class="brand-about" id="brandAbout" hidden></div>';
const SUBTITLE_RE = /<p id="catalogSubtitle">[\s\S]*?<\/p>/;

function buildTemplate() {

    let html = fs.readFileSync(TEMPLATE_FILE, "utf8");

    html = rootRelativeLinks(html);

    // <base> одразу після <head>, ДО будь-яких href/src: сторінка
    // лежить у /brands/<slug>/, а скрипти будують шляхи від кореня.
    html = html.replace(
        /<head>/i,
        '<head>\n\n<!-- Сторінка лежить у /brands/<slug>/ або /categories/<slug>/,\n'
        + '     а скрипти будують шляхи як з кореня ("data/products.json").\n'
        + '     Без <base> вони перетворились би на /brands/<slug>/data/…\n'
        + '     Файл згенеровано: scripts/build-taxonomy-pages.js -->\n'
        + '<base href="/">'
    );

    html = html.replace(/<title>[\s\S]*?<\/title>/i, HEAD_SLOT);
    html = html.replace(/\n?<meta name="description"[^>]*>/i, "");
    html = html.replace(/\n?<link rel="canonical"[^>]*>/i, "");

    if (!html.includes(HEAD_SLOT)) {
        throw new Error("У catalog.html не знайдено <title> — шаблон змінився");
    }

    if (!GRID_SLOT_RE.test(html)) {
        throw new Error('У catalog.html не знайдено порожній <div id="catalogGrid"> — '
            + "перелік товарів нема куди вставити");
    }

    if (!html.includes(TITLE_SLOT)) {
        throw new Error("У catalog.html не знайдено заголовок #catalogTitle");
    }

    return html;

}

// ---------------------------------------------------------------
// Дані сторінки
// ---------------------------------------------------------------

// Опис асортименту фактами, а не словами.
//
// Спокуса написати «широкий вибір стильних товарів» велика, але такий
// текст однаковий на всіх 26 сторінках — для пошуку це ознака
// порожньої сторінки-дубля. Числа ж у кожної свої й оновлюються самі.
function factsLine(products) {

    const prices = products.map(p => Number(p.price)).filter(n => Number.isFinite(n) && n > 0);

    if (!prices.length) return "";

    const min = Math.min(...prices);
    const max = Math.max(...prices);

    const count = products.length;

    // «36 моделей» / «4 моделі» / «1 модель» — українська рахує інакше
    // за англійську, і «4 моделей» ріже око одразу.
    const last = count % 10;
    const teen = count % 100 >= 11 && count % 100 <= 14;

    const word = teen || last === 0 || last >= 5 ? "моделей"
        : last === 1 ? "модель"
            : "моделі";

    const priceText = min === max
        ? `Ціна — ${formatPrice(min)}`
        : `Ціни від ${formatPrice(min)} до ${formatPrice(max)}`;

    return `${count} ${word} у наявності та під замовлення. ${priceText}.`;

}

function listLine(label, values) {

    const clean = [...new Set(values.filter(Boolean))];

    if (!clean.length) return "";

    const shown = clean.slice(0, 6);

    return `${label}: ${shown.join(", ")}${clean.length > shown.length ? " та інші" : ""}.`;

}

function brandPages(products, brands) {

    const byBrand = new Map();

    products.forEach(product => {

        const name = String(product.brand || "").trim();

        if (!name) return;

        if (!byBrand.has(name)) byBrand.set(name, []);

        byBrand.get(name).push(product);

    });

    // Запис в адмінці НЕ обов'язковий: сторінку отримує кожен бренд із
    // товарами, а запис лише додає банер, свій заголовок і опис.
    const records = new Map();

    (brands || []).forEach(brand => {
        if (brand && brand.name) records.set(String(brand.name).trim().toLowerCase(), brand);
    });

    return [...byBrand.entries()].map(([name, items]) => {

        const record = records.get(name.toLowerCase()) || {};

        const slug = record.slug || toSlug(name);

        return {
            kind: "brand",
            name,
            slug,
            dir: path.join(BRANDS_DIR, slug),
            url: `${SITE_URL}/brands/${slug}/`,
            heading: record.title || `Товари ${name}`,
            title: `${name} — купити в Україні | BestBrnd4u`,
            intro: [
                factsLine(items),
                listLine("Категорії", items.map(p => p.category))
            ].filter(Boolean).join(" "),
            description: record.description || "",
            preset: { brand: name },
            crumbs: [
                { label: "Головна", href: "/" },
                { label: "Каталог", href: "catalog" },
                { label: "Бренди", href: "brands/" },
                { label: name, href: null, current: true }
            ],
            products: items
        };

    }).sort((a, b) => a.name.localeCompare(b.name, "uk"));

}

function categoryPages(products, categories) {

    const byCategory = new Map();

    products.forEach(product => {

        const name = String(product.category || "").trim();

        if (!name) return;

        if (!byCategory.has(name)) byCategory.set(name, []);

        byCategory.get(name).push(product);

    });

    const departments = new Map();

    (categories || []).forEach(category => {
        if (category && category.name) departments.set(category.name, category.department || "");
    });

    return [...byCategory.entries()].map(([name, items]) => {

        const slug = toSlug(name);
        const department = departments.get(name) || "";

        const crumbs = [
            { label: "Головна", href: "/" },
            { label: "Каталог", href: "catalog" }
        ];

        if (department) {
            crumbs.push({ label: department, href: `catalog?department=${toSlug(department)}` });
        }

        crumbs.push({ label: name, href: null, current: true });

        return {
            kind: "category",
            name,
            slug,
            department,
            dir: path.join(CATEGORIES_DIR, slug),
            url: `${SITE_URL}/categories/${slug}/`,
            heading: name,
            title: `${name} — купити в Україні | BestBrnd4u`,
            intro: [
                factsLine(items),
                listLine("Бренди", items.map(p => p.brand))
            ].filter(Boolean).join(" "),
            description: "",
            preset: { category: name },
            crumbs,
            products: items
        };

    }).sort((a, b) => a.name.localeCompare(b.name, "uk"));

}

// ---------------------------------------------------------------
// Розмітка
// ---------------------------------------------------------------

function crumbsMarkup(crumbs) {

    const inner = crumbs.map((crumb, index) => {

        const node = crumb.current || !crumb.href
            ? `<span class="crumb-current">${escapeHtml(crumb.label)}</span>`
            : `<a href="${escapeHtml(crumb.href)}">${escapeHtml(crumb.label)}</a>`;

        return index === 0 ? node : `<span class="crumb-sep">→</span>\n${node}`;

    }).join("\n");

    return `<div class="container" id="breadcrumbsList">\n${inner}\n</div>`;

}

// Перелік товарів у розмітці — те, що бачить робот до JS.
//
// Це не картки каталогу: їх намалює catalog.js, і повторювати його
// розмітку означало б підтримувати її у двох місцях. Тут простий
// перелік із посиланням, назвою й ціною — рівно те, задля чого він і
// потрібен: щоб сторінка не була порожньою і щоб від неї був шлях до
// кожного товару.
function productsMarkup(products) {

    const items = products.slice(0, STATIC_LIMIT).map(product => {

        const href = `/p/${encodeURIComponent(product.slug)}/`;

        const price = Number(product.price) > 0 ? formatPrice(product.price) : "";

        return `        <li>
            <a href="${escapeHtml(href)}">${escapeHtml(product.title)}</a>
            ${product.brand ? `<span class="taxonomy-brand">${escapeHtml(product.brand)}</span>` : ""}
            ${price ? `<span class="taxonomy-price">${escapeHtml(price)}</span>` : ""}
        </li>`;

    }).join("\n");

    return `<div id="catalogGrid" class="products-grid">
    <ul class="taxonomy-static-list">
${items}
    </ul>
</div>`;

}

// Опис бренду з адмінки — у той самий блок, який потім намалює
// catalog.js.
//
// ЧОМУ САМЕ В НЬОГО, А НЕ В ОКРЕМИЙ
// ----------------------------------
// Робот мусить побачити авторський текст без JS: інакше єдиний
// неавтоматичний абзац сторінки для пошуку не існує. Але окремий блок
// означав би, що після виконання JS той самий текст стоїть на
// сторінці двічі. Тож пишемо рівно ту розмітку, яку catalog.js
// збудує сам, — він її просто перебудує тією самою.
function aboutMarkup(page) {

    if (!page.description) return "";

    const paragraphs = page.description.split(/\n\s*\n/)
        .map(block => block.trim())
        .filter(Boolean)
        .map(block => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
        .join("");

    return `<div class="brand-about" id="brandAbout">`
        + `<div class="brand-about-text">${paragraphs}</div>`
        + `<button type="button" class="brand-about-toggle" hidden>Детальніше</button>`
        + `</div>`;

}

function headMarkup(page) {

    const description = truncateForMeta(
        page.description || page.intro || `${page.heading} у каталозі BestBrnd4u.`
    );

    const image = (page.products[0] && page.products[0].images && page.products[0].images[0]) || "";

    const absoluteImage = image
        ? (/^https?:/i.test(image) ? image : `${SITE_URL}/${String(image).replace(/^\/+/, "")}`)
        : "";

    const collectionLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: page.heading,
        description,
        url: page.url,
        isPartOf: { "@type": "WebSite", name: "BestBrnd4u", url: `${SITE_URL}/` },
        mainEntity: {
            "@type": "ItemList",
            numberOfItems: page.products.length,
            itemListElement: page.products.slice(0, STATIC_LIMIT).map((product, index) => ({
                "@type": "ListItem",
                position: index + 1,
                url: `${SITE_URL}/p/${encodeURIComponent(product.slug)}/`,
                name: product.title
            }))
        }
    };

    const breadcrumbLd = Breadcrumbs.toJsonLd(page.crumbs, SITE_URL, page.url);

    return [
        `<title>${escapeHtml(page.title)}</title>`,
        ``,
        `<meta name="description" content="${escapeHtml(description)}">`,
        `<link rel="canonical" href="${escapeHtml(page.url)}">`,
        ``,
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="BestBrnd4u">`,
        `<meta property="og:locale" content="uk_UA">`,
        `<meta property="og:title" content="${escapeHtml(page.title)}">`,
        `<meta property="og:description" content="${escapeHtml(description)}">`,
        `<meta property="og:url" content="${escapeHtml(page.url)}">`,
        absoluteImage ? `<meta property="og:image" content="${escapeHtml(absoluteImage)}">` : "",
        ``,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${escapeHtml(page.title)}">`,
        `<meta name="twitter:description" content="${escapeHtml(description)}">`,
        ``,
        jsonLdScript("collectionSchema", collectionLd),
        jsonLdScript("breadcrumbSchema", breadcrumbLd),
        ``,
        `<script>`,
        `// Фільтр цієї сторінки. catalog.js бере його звідси, а не з`,
        `// адреси: адреса тут — шлях, а не ?brand=.`,
        `window.CATALOG_PRESET = ${JSON.stringify(page.preset)};`,
        `</script>`
    ].filter(line => line !== "").join("\n");

}

function buildPage(template, page) {

    let html = template
        .replace(HEAD_SLOT, () => headMarkup(page))
        .replace(BREADCRUMB_SLOT_RE, () => crumbsMarkup(page.crumbs))
        .replace(TITLE_SLOT, () => `<span id="catalogTitle">${escapeHtml(page.heading)}</span>`)
        .replace(SUBTITLE_RE, () => `<p id="catalogSubtitle">${escapeHtml(page.intro || "")}</p>`)
        .replace(GRID_SLOT_RE, () => productsMarkup(page.products));

    const about = aboutMarkup(page);

    if (about) html = html.replace(ABOUT_SLOT, () => about);

    return html;

}

// ---------------------------------------------------------------
// Хаби: /brands/ і /categories/
// ---------------------------------------------------------------

function hubPage(kind, pages) {

    const isBrands = kind === "brand";

    const heading = isBrands ? "Бренди" : "Категорії";
    const slugDir = isBrands ? "brands" : "categories";

    const url = `${SITE_URL}/${slugDir}/`;

    const intro = isBrands
        ? `${pages.length} брендів у каталозі BestBrnd4u.`
        : `${pages.length} категорій у каталозі BestBrnd4u.`;

    return {
        kind: `${kind}-hub`,
        name: heading,
        slug: "",
        dir: isBrands ? BRANDS_DIR : CATEGORIES_DIR,
        url,
        heading,
        title: `${heading} — BestBrnd4u`,
        intro,
        description: "",
        // Хаб — це не фільтр: preset тут порожній, і catalog.js
        // показує повний каталог. Сам перелік посилань лежить у
        // розмітці й нікуди не зникає.
        preset: {},
        crumbs: [
            { label: "Головна", href: "/" },
            { label: "Каталог", href: "catalog" },
            { label: heading, href: null, current: true }
        ],
        products: [],
        links: pages
    };

}

// Перелік на хабі кладемо НЕ в сітку товарів.
//
// #catalogGrid належить каталогу: catalog.js перемальовує його при
// кожному фільтрі, і перелік брендів зник би з очей одразу після
// завантаження — робот бачив би одне, людина інше. Тому перелік
// живе окремим блоком над каталогом і лишається назавжди, а сітка
// під ним показує весь асортимент.
function hubMarkup(hub) {

    const items = hub.links.map(page => {

        const href = page.kind === "brand" ? `/brands/${page.slug}/` : `/categories/${page.slug}/`;

        return `        <li>
            <a href="${escapeHtml(href)}">${escapeHtml(page.name)}</a>
            <span class="taxonomy-count">${page.products.length}</span>
        </li>`;

    }).join("\n");

    return `<nav class="taxonomy-hub" aria-label="${escapeHtml(hub.heading)}">
    <ul class="taxonomy-hub-list">
${items}
    </ul>
</nav>`;

}

function buildHub(template, hub) {

    return template
        .replace(HEAD_SLOT, () => headMarkup(hub))
        .replace(BREADCRUMB_SLOT_RE, () => crumbsMarkup(hub.crumbs))
        .replace(TITLE_SLOT, () => `<span id="catalogTitle">${escapeHtml(hub.heading)}</span>`)
        .replace(SUBTITLE_RE, () => `<p id="catalogSubtitle">${escapeHtml(hub.intro)}</p>`)
        .replace(ABOUT_SLOT, () => `${ABOUT_SLOT}\n\n${hubMarkup(hub)}`);

}

// ---------------------------------------------------------------

function readJsonSafe(file, fallback) {

    if (!fs.existsSync(file)) return fallback;

    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        console.warn(`Не читається ${path.relative(ROOT, file)} — беру порожній список`);
        return fallback;
    }

}

// Прибираємо теки, яких уже немає серед сторінок: бренд, останній
// товар якого видалили, інакше назавжди лишався б в індексі Google —
// та сама причина, що й у сторінок товарів.
function pruneStale(dir, keep) {

    if (!fs.existsSync(dir)) return 0;

    let removed = 0;

    fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .forEach(entry => {

            if (keep.has(entry.name)) return;

            fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });

            console.log(`🗑  прибрано сторінку: ${path.relative(ROOT, dir)}/${entry.name}/`);

            removed++;

        });

    return removed;

}

function main() {

    const products = readJsonSafe(PRODUCTS_FILE, []);

    if (!products.length) {
        console.error(`Не знайдено ${path.relative(ROOT, PRODUCTS_FILE)} — спершу build-products.js`);
        process.exit(1);
    }

    const template = buildTemplate();

    const brands = brandPages(products, readJsonSafe(BRANDS_FILE, []));
    const categories = categoryPages(products, readJsonSafe(CATEGORIES_FILE, []));

    let written = 0;
    const skipped = [];

    [...brands, ...categories].forEach(page => {

        const problem = slugProblem(page.slug);

        if (problem) {
            skipped.push(`${page.name}: ${problem}`);
            return;
        }

        fs.mkdirSync(page.dir, { recursive: true });
        fs.writeFileSync(path.join(page.dir, "index.html"), buildPage(template, page), "utf8");

        written++;

    });

    // Хаби: з них починається обхід роботом, і саме вони роблять
    // сторінки брендів досяжними не лише з sitemap.
    [hubPage("brand", brands), hubPage("category", categories)].forEach(hub => {
        fs.mkdirSync(hub.dir, { recursive: true });
        fs.writeFileSync(path.join(hub.dir, "index.html"), buildHub(template, hub), "utf8");
    });

    const removed = pruneStale(BRANDS_DIR, new Set(brands.map(p => p.slug)))
        + pruneStale(CATEGORIES_DIR, new Set(categories.map(p => p.slug)));

    skipped.forEach(line => console.warn(`⚠  ${line}`));

    console.log(`Готово: ${brands.length} брендів + ${categories.length} категорій`
        + ` (+2 хаби) → brands/<slug>/, categories/<slug>/`
        + (removed ? `, прибрано зайвих: ${removed}` : ""));

}

if (require.main === module) main();

module.exports = { brandPages, categoryPages, factsLine, listLine, STATIC_LIMIT };
