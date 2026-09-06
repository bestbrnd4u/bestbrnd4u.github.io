// Сторінки брендів і категорій: /brands/coach/, /categories/zhinochi-sumky/
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// Раніше каталог бренду був адресою-фільтром (/catalog?brand=coach) з
// canonical на /catalog — тобто ми самі казали пошуку «це дубль
// каталогу». Тепер у кожного бренду й категорії власна сторінка.
//
// Найдорожча помилка тут — мовчазна: сторінка існує, віддається,
// виглядає правильно, але canonical у ній вказує кудись інде, або
// <title> у двадцяти сторінок однаковий, або в sitemap їх немає. Усе
// це не видно оком і не проявляється місяцями.
//
// ОКРЕМО ПРО ТЕКУ catalog/
// -------------------------
// Її не має бути НІКОЛИ: поруч лежить catalog.html, і статичний
// хостинг, побачивши теку, почав би перенаправляти /catalog на
// /catalog/ — тобто всі наявні посилання на каталог поїхали б у 404.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = rel => fs.existsSync(path.join(ROOT, rel));

const { treeSiteEnv } = require("./helpers/tree-env");
const { SITE_URL } = treeSiteEnv();

const taxonomy = require("../scripts/build-taxonomy-pages.js");
const { toSlug } = require("../scripts/translit.js");

const products = JSON.parse(read("data/products.json"));
const brands = taxonomy.brandPages(products, JSON.parse(read("data/brands.json")));
const categories = taxonomy.categoryPages(products, JSON.parse(read("data/categories.json")));

const pages = [...brands, ...categories];

console.log("\n[1] Сторінка є в кожного бренду й кожної категорії з товарами");
{
    const brandNames = new Set(products.map(p => String(p.brand || "").trim()).filter(Boolean));
    const categoryNames = new Set(products.map(p => String(p.category || "").trim()).filter(Boolean));

    check(`брендів із товарами — ${brandNames.size}, сторінок — ${brands.length}`,
        brands.length === brandNames.size);

    check(`категорій із товарами — ${categoryNames.size}, сторінок — ${categories.length}`,
        categories.length === categoryNames.size);

    const missing = pages.filter(page => !exists(
        page.kind === "brand" ? `brands/${page.slug}/index.html` : `categories/${page.slug}/index.html`));

    check("усі сторінки згенеровані", missing.length === 0,
        missing.map(p => p.name).join(", "));

    check("хаб брендів на місці", exists("brands/index.html"));
    check("хаб категорій на місці", exists("categories/index.html"));

    // Сторінка бренду, який більше не має товарів, мусить зникати —
    // інакше вона назавжди лишиться в індексі порожньою.
    check("генератор прибирає зайві теки",
        /function pruneStale/.test(read("scripts/build-taxonomy-pages.js")));

    // Категорія без товарів сторінки не отримує: порожня сторінка в
    // індексі шкодить більше, ніж її відсутність.
    const allCategories = JSON.parse(read("data/categories.json"));

    check("категорії без товарів сторінок не мають",
        allCategories.length > categories.length
        && !exists(`categories/${toSlug(allCategories.find(c => !categoryNames.has(c.name)).name)}/index.html`));
}

console.log("\n[2] Теки catalog/ не існує");
{
    // Найдорожча можлива помилка цього набору правок.
    check("catalog/ немає — /catalog не зламано", !exists("catalog"));
    check("catalog.html на місці", exists("catalog.html"));
}

console.log("\n[3] У кожної сторінки власна адреса, заголовок і canonical");
{
    const titles = new Map();
    const canonicals = new Map();
    const problems = [];

    pages.forEach(page => {

        const file = page.kind === "brand"
            ? `brands/${page.slug}/index.html`
            : `categories/${page.slug}/index.html`;

        const html = read(file);

        const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
        const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || "";
        const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
        const h1 = (html.match(/<span id="catalogTitle">([^<]*)<\/span>/) || [])[1] || "";

        if (!title) problems.push(`${page.name}: немає <title>`);
        if (canonical !== page.url) problems.push(`${page.name}: canonical ${canonical}`);
        if (!description) problems.push(`${page.name}: немає опису`);
        if (h1 !== page.heading) problems.push(`${page.name}: h1 «${h1}»`);
        if (!html.includes('<base href="/">')) problems.push(`${page.name}: немає <base>`);

        titles.set(title, (titles.get(title) || 0) + 1);
        canonicals.set(canonical, (canonicals.get(canonical) || 0) + 1);

    });

    check("теги на місці й canonical вказує сам на себе", problems.length === 0,
        problems.slice(0, 3).join(" | "));

    const dupTitles = [...titles.entries()].filter(([, n]) => n > 1);
    const dupCanonicals = [...canonicals.entries()].filter(([, n]) => n > 1);

    check("заголовки унікальні", dupTitles.length === 0, dupTitles.map(x => x[0]).join(", "));
    check("canonical унікальні", dupCanonicals.length === 0, dupCanonicals.map(x => x[0]).join(", "));

    // Адреса — з домену середовища: на dev не має бути бойових адрес.
    check("адреси з поточного середовища",
        pages.every(page => page.url.startsWith(SITE_URL)), pages[0] && pages[0].url);
}

console.log("\n[4] Робот бачить вміст ще до JS");
{
    const sample = brands.find(p => p.products.length > 3) || brands[0];
    const html = read(`brands/${sample.slug}/index.html`);

    const links = (html.match(/href="\/p\/[^"]+"/g) || []).length;

    check(`перелік товарів у розмітці (${links})`,
        links > 0 && links <= taxonomy.STATIC_LIMIT, links);

    check("перелік — не більший за ліміт", links <= taxonomy.STATIC_LIMIT);

    check("хлібні крихти в розмітці",
        /id="breadcrumbsList"[\s\S]{0,400}crumb-current/.test(html));

    check("розмітка CollectionPage", /"@type": "CollectionPage"/.test(html));
    check("розмітка BreadcrumbList", /"@type": "BreadcrumbList"/.test(html));

    // Текст сторінки — числа, а не слова: однакове «широкий вибір» на
    // 26 сторінках для пошуку виглядає як 26 дублів.
    check("вступ описує асортимент фактами",
        /\d+ модел\S* у наявності та під замовлення/.test(html));

    const facts = taxonomy.factsLine(products.slice(0, 1));

    check("одна модель — «1 модель», а не «1 моделей»",
        /^1 модель /.test(taxonomy.factsLine([{ price: 100 }])), taxonomy.factsLine([{ price: 100 }]));

    check("чотири — «4 моделі»",
        /^4 моделі /.test(taxonomy.factsLine([1, 2, 3, 4].map(() => ({ price: 100 })))));

    check("п'ять — «5 моделей»",
        /^5 моделей /.test(taxonomy.factsLine([1, 2, 3, 4, 5].map(() => ({ price: 100 })))));

    check("рядок фактів будується", Boolean(facts));
}

console.log("\n[5] Сторінка каже каталогу свій фільтр");
{
    const brandHtml = read(`brands/${brands[0].slug}/index.html`);
    const categoryHtml = read(`categories/${categories[0].slug}/index.html`);

    check("бренд: CATALOG_PRESET із назвою",
        new RegExp(`window.CATALOG_PRESET = \\{"brand":${JSON.stringify(brands[0].name)}\\}`)
            .test(brandHtml));

    check("категорія: CATALOG_PRESET із назвою",
        new RegExp(`window.CATALOG_PRESET = \\{"category":${JSON.stringify(categories[0].name)}\\}`)
            .test(categoryHtml));

    const catalog = read("assets/js/catalog.js");

    check("каталог читає preset", /window\.CATALOG_PRESET && typeof window\.CATALOG_PRESET === "object"/.test(catalog));
    check("preset застосовується як фільтр", /function applyPreset\(\)[\s\S]{0,200}selectedBrands\.add\(PRESET\.brand\)/.test(catalog));

    // Бренд уже в шляху — у запиті він був би вдруге.
    check("вимір сторінки в запит не дублюється",
        /const skipBrand = !keepPreset && presetActive\(\) && Boolean\(PRESET\.brand\)/.test(catalog));

    // Зняли бренд — сторінка більше не про нього.
    check("зняття фільтра виводить у загальний каталог",
        /if \(!presetHolds\(\)\) \{\s*\n\s*leavePreset\(\);/.test(catalog));

    check("при виході фільтр не губиться",
        /writeState\(params, \{ includePreset: true \}\)/.test(catalog));

    // Заголовок сторінки — з розмітки, не зі стану фільтрів.
    check("згенерована сторінка сама відповідає за заголовок",
        /function renderBreadcrumbsAndTitle\(\)[\s\S]{0,700}if \(PRESET\) return;/.test(catalog));
}

console.log("\n[6] Адреси-фільтри вказують на справжню сторінку");
{
    const catalog = read("assets/js/catalog.js");

    check("є синхронізація canonical", /function syncCanonical\(\)/.test(catalog));

    check("один бренд → /brands/<slug>/",
        /link\.href = `\$\{base\}\/brands\/\$\{latinParam\(\[\.\.\.selectedBrands\]\[0\]\)\}\/`/.test(catalog));

    check("одна категорія → /categories/<slug>/",
        /link\.href = `\$\{base\}\/categories\/\$\{latinParam\(\[\.\.\.selectedCategories\]\[0\]\)\}\/`/.test(catalog));

    // Кілька фільтрів разом — це вже не сторінка бренду, і відправляти
    // на неї означало б показати людині не те, що обіцяв пошук.
    check("лише коли фільтр один",
        /const onlyBrand = selectedBrands\.size === 1[\s\S]{0,220}currentPage === 1;/.test(catalog));

    check("на згенерованій сторінці canonical не чіпаємо",
        /if \(!link \|\| PRESET\) return;/.test(catalog));
}

console.log("\n[7] На сторінки ведуть внутрішні посилання");
{
    check("сторінка товару: бренд веде на /brands/",
        /\? `\/brands\/\$\{window\.Translit\.toSlug\(name\)\}\/`/.test(read("assets/js/product.js"))
        && /href="\$\{brandHref\(product\.brand\)\}"/.test(read("assets/js/product.js")));

    check("статична сторінка товару теж",
        /`<a href="\/brands\/\$\{toSlug\(product\.brand\)\}\/">/.test(read("scripts/build-product-pages.js")));

    check("мега-меню: бренд без розділу веде на сторінку",
        /return `\/brands\/\$\{window\.Translit\.toSlug\(brand\)\}\/`/.test(read("assets/js/mega-menu.js")));

    check("мега-меню: «Усі бренди» веде на хаб",
        /section \? buildQuery\(section, \[\]\) : "\/brands\/"/.test(read("assets/js/mega-menu.js")));

    const home = JSON.parse(read("data/home.json"));

    check("головна: картки брендів ведуть на сторінки",
        (home.brands.items || []).every(item => /^\/brands\/[a-z0-9-]+\/$/.test(item.link || "")),
        (home.brands.items || []).map(i => i.link).join(" "));

    // Кожне посилання мусить вести на сторінку, яка існує.
    const slugs = new Set(brands.map(p => p.slug));

    check("усі посилання з головної ведуть на наявні сторінки",
        (home.brands.items || []).every(item => slugs.has(String(item.link).replace(/\/brands\/|\//g, ""))),
        (home.brands.items || []).map(i => i.link).join(" "));
}

console.log("\n[8] Сторінки в sitemap і з версіями файлів");
{
    const sitemap = read("sitemap.xml");

    const missing = pages.filter(page => !sitemap.includes(`<loc>${page.url}</loc>`));

    check(`усі ${pages.length} сторінок у sitemap`, missing.length === 0,
        missing.slice(0, 3).map(p => p.name).join(", "));

    check("хаби в sitemap",
        sitemap.includes(`<loc>${SITE_URL}/brands/</loc>`)
        && sitemap.includes(`<loc>${SITE_URL}/categories/</loc>`));

    check("sitemap бере перелік у того ж модуля, що будує сторінки",
        /require\("\.\/build-taxonomy-pages"\)/.test(read("scripts/build-sitemap.js")));

    // Сторінка будується з catalog.html, тобто несе версії ПОПЕРЕДНЬОЇ
    // збірки. Без цього кроку після виливки браузер тягнув би з кеша
    // старий catalog.js саме там, де він найпотрібніший.
    const version = html => (html.match(/catalog\.js\?v=([a-f0-9]+)/) || [])[1];

    const inCatalog = version(read("catalog.html"));

    const stale = pages.filter(page => {
        const file = page.kind === "brand"
            ? `brands/${page.slug}/index.html`
            : `categories/${page.slug}/index.html`;
        return version(read(file)) !== inCatalog;
    });

    check("версії скриптів свіжі на всіх сторінках", stale.length === 0,
        stale.slice(0, 3).map(p => p.name).join(", "));

    check("генератор у ланцюжку збірки",
        JSON.parse(read("package.json")).scripts.build.includes("build-taxonomy-pages.js"));

    ["build-dev.yml", "build-products.yml"].forEach(name => {
        check(`${name}: теки комітяться`,
            /git add[^\n]*brands categories/.test(read(`.github/workflows/${name}`)));
    });
}

console.log(failures === 0
    ? `\n✅ Таксономія: ${brands.length} брендів + ${categories.length} категорій мають власні адреси\n`
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
