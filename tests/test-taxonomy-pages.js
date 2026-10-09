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

    // Поза розділом «Усі бренди» ведуть на хаб — це головне внутрішнє
    // посилання на нього. У розділі хаба немає (там той самий каталог),
    // тож пункт просить смугу позначкою brands=1: без неї розділ
    // відкривається без переліку брендів над товарами.
    check("мега-меню: «Усі бренди» веде на хаб, а в розділі просить смугу",
        /section \? buildQuery\(section, \[\["brands", "1"\]\]\) : "\/brands\/"/
            .test(read("assets/js/mega-menu.js")));

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

console.log("\n[9] Розділи — рівень над категорією");
{
    const categoryData = JSON.parse(read("data/categories.json"));

    const departments = taxonomy.departmentPages(
        products, categoryData, taxonomy.readRecords(taxonomy.DEPARTMENTS_SRC));

    // Найширші запити («сумки купити») йдуть саме сюди: ні категорія
    // (вона вужча), ні каталог (він про все одразу) їх не виграють.
    const expected = new Set(categoryData
        .filter(c => products.some(p => p.category === c.name))
        .map(c => c.department));

    check(`розділів із товарами — ${expected.size}, сторінок — ${departments.length}`,
        departments.length === expected.size);

    const problems = [];

    departments.forEach(page => {

        const file = `departments/${page.slug}/index.html`;

        if (!exists(file)) { problems.push(`${page.name}: сторінки немає`); return; }

        const html = read(file);

        const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];

        if (canonical !== page.url) problems.push(`${page.name}: canonical ${canonical}`);

        if (!new RegExp(`CATALOG_PRESET = \\{"department":${JSON.stringify(page.name)}\\}`).test(html)) {
            problems.push(`${page.name}: не той preset`);
        }

        // Від широкої сторінки мусить бути шлях до вужчих — інакше
        // категорії досяжні хіба що з sitemap.
        if (!/href="\/categories\/[a-z0-9-]+\//.test(html)) {
            problems.push(`${page.name}: немає посилань на категорії`);
        }

    });

    check("сторінки розділів на місці й правильні", problems.length === 0,
        problems.slice(0, 3).join(" | "));

    check("хаб розділів", exists("departments/index.html"));

    const catalog = read("assets/js/catalog.js");

    check("каталог знає розділ як фільтр сторінки",
        /if \(PRESET\.department\) selectedDepartments\.add\(PRESET\.department\)/.test(catalog));

    check("розділ не дублюється в запиті",
        /const skipDepartment = !keepPreset && presetActive\(\) && Boolean\(PRESET\.department\)/.test(catalog));

    // ПОВЕДІНКУ, А НЕ ТЕКСТ ФУНКЦІЇ.
    //
    // Тут стояла регулярка на тіло presetHolds — «if (PRESET.department)
    // { return selectedDepartments.size === 1…». Вона трималась за
    // ранні return, а саме ранні return і були помилкою: сторінка
    // /brands/coach/zhinochi-sumky/ заявляє ДВА фільтри, і перевірка
    // першого-ліпшого лишала її на місці, коли знімали другий.
    //
    // Тобто перевірка закріплювала за собою ту форму запису, через яку
    // баг і став можливим. Тепер вона ЗАПУСКАЄ обидві функції з
    // підставленим станом — і ламається від зміни поведінки, а не від
    // переписаного рядка.
    const вихідник = назва =>
        catalog.match(new RegExp("function " + назва + "\\(\\)[\\s\\S]*?\\n}"))[0];

    const тримається = (preset, стан) => new Function(
        "PRESET", "selectedBrands", "selectedDepartments", "selectedCategories",
        вихідник("presetActive") + "\n" + вихідник("presetHolds") + "\nreturn presetHolds();"
    )(
        preset,
        new Set(стан.brands || []),
        new Set(стан.departments || []),
        new Set(стан.categories || [])
    );

    check("без фільтра сторінки нічого не перевіряємо",
        тримається(null, {}) === true);

    check("бренд на місці — лишаємось",
        тримається({ brand: "Coach" }, { brands: ["Coach"] }) === true);

    check("додали другий бренд — виходимо",
        тримається({ brand: "Coach" }, { brands: ["Coach", "Prada"] }) === false);

    check("зняли розділ — виходимо зі сторінки",
        тримається({ department: "Сумки" }, { departments: [] }) === false);

    check("зняли категорію — виходимо зі сторінки",
        тримається({ category: "Гаманці" }, { categories: [] }) === false);

    // Сторінка «бренд × тип» заявляє два фільтри, і доти, доки тут
    // стояли ранні return, зняття другого лишалось непоміченим:
    // адреса обіцяла жіночі сумки Coach, а в сітці був увесь Coach.
    const пара = { brand: "Coach", category: "Жіночі сумки" };

    check("пара ціла — лишаємось",
        тримається(пара, { brands: ["Coach"], categories: ["Жіночі сумки"] }) === true);

    check("у парі зняли тип — виходимо",
        тримається(пара, { brands: ["Coach"], categories: [] }) === false);

    check("у парі зняли бренд — виходимо",
        тримається(пара, { brands: [], categories: ["Жіночі сумки"] }) === false);

    check("у парі додали другий тип — виходимо",
        тримається(пара, { brands: ["Coach"], categories: ["Жіночі сумки", "Гаманці"] }) === false);

    check("один розділ → canonical на його сторінку",
        /link\.href = `\$\{base\}\/departments\/\$\{latinParam\(\[\.\.\.selectedDepartments\]\[0\]\)\}\/`/.test(catalog));

    const home = JSON.parse(read("data/home.json"));

    check("картки розділів на головній ведуть на сторінки",
        (home.categories.items || []).every(item =>
            !/department=/.test(item.link || "")),
        (home.categories.items || []).map(i => i.link).join(" "));

    const sitemap = read("sitemap.xml");

    check("розділи в sitemap",
        departments.every(page => sitemap.includes(`<loc>${page.url}</loc>`))
        && sitemap.includes(`<loc>${SITE_URL}/departments/</loc>`));
}

console.log("\n[10] Свій текст для категорій і розділів");
{
    const admin = read("admin/config.yml");

    // У бренда такі поля були від початку; тепер вони є і в двох
    // інших видів сторінок — без них сторінка має лише автоматичний
    // рядок про кількість і ціни, однаковий за формою в усіх.
    check("колекція «Розділи» заведена", /- name: "departments"/.test(admin));

    ["title", "description"].forEach(field => {
        check(`поле ${field} є у розділів і категорій`,
            (admin.match(new RegExp(`name: "${field}"`, "g")) || []).length >= 3);
    });

    check("тексти категорії доїжджають у зібраний файл",
        /if \(data\.title && String\(data\.title\)\.trim\(\)\) category\.title/.test(
            read("scripts/build-categories.js")));

    // Перевіряємо не текст коду, а результат: заголовок і опис із
    // запису мусять опинитись на сторінці.
    const withText = taxonomy.categoryPages(
        [{ slug: "x", title: "Товар", price: 100, category: "Тест", brand: "B" }],
        [{ name: "Тест", department: "Сумки", title: "Свій заголовок", description: "Свій опис." }]
    )[0];

    check("категорія бере заголовок із адмінки", withText.heading === "Свій заголовок", withText.heading);
    check("категорія бере опис із адмінки", withText.description === "Свій опис.", withText.description);

    const noText = taxonomy.categoryPages(
        [{ slug: "x", title: "Товар", price: 100, category: "Тест", brand: "B" }],
        [{ name: "Тест", department: "Сумки" }]
    )[0];

    check("без запису — назва категорії як заголовок", noText.heading === "Тест");
    check("без запису — опису немає", noText.description === "");

    const dept = taxonomy.departmentPages(
        [{ slug: "x", title: "Товар", price: 100, category: "Тест", brand: "B" }],
        [{ name: "Тест", department: "Сумки" }],
        new Map([["сумки", { name: "Сумки", title: "Сумки на кожен день", description: "Текст." }]])
    )[0];

    check("розділ бере заголовок із адмінки", dept.heading === "Сумки на кожен день", dept.heading);
    check("розділ бере опис із адмінки", dept.description === "Текст.");

    // Опис лежить у тому ж блоці, який на звичайному каталозі малює
    // JS. На згенерованій сторінці JS мусить його НЕ чіпати — інакше
    // єдиний авторський текст сторінки зникає одразу після рендеру.
    const catalog = read("assets/js/catalog.js");

    check("на згенерованій сторінці опис не перемальовується",
        /if \(PRESET\) \{\s*\n\s*hydrateAbout\(\);/.test(catalog));

    check("кнопка «Детальніше» все одно оживає",
        /function hydrateAbout\(\)/.test(catalog)
        && /aboutHydrated = false;\s*\n\s*hydrateAbout\(\);/.test(catalog));
}

console.log("\n[10a] Текст категорій і розділів не бреше про каталог");
{
    // ЩО БУЛО НЕ ТАК. Поля для тексту існували, але в категорій і
    // розділів лишались порожні: 0 із 22 проти 21 із 21 у брендів.
    // Сторінка з найбільшим попитом (/departments/sumky/, 48 товарів)
    // мала лише автоматичний рядок про кількість і ціни — за формою
    // однаковий з усіма іншими.
    //
    // ЩО ТУТ СТЕРЕЖЕМО. Не наявність тексту — його пише людина, і
    // вимагати його від кожної нової категорії означало б ламати
    // збірку через ненаписаний абзац.
    //
    // Стережемо ПРАВДИВІСТЬ: текст живе в даних і не оновлюється сам,
    // а каталог змінюється щодня. Названий у ньому бренд, який
    // поїхав із категорії, перетворює опис на неправду — тихо й
    // надовго.
    const products = JSON.parse(read("data/products.json"));
    const categoryData = JSON.parse(read("data/categories.json"));

    const cats = taxonomy.categoryPages(products, categoryData);
    const deps = taxonomy.departmentPages(products, categoryData,
        taxonomy.readRecords(taxonomy.DEPARTMENTS_SRC));
    const brs = taxonomy.brandPages(products, JSON.parse(read("data/brands.json")));

    const зТекстом = [...cats, ...deps].filter(p => (p.description || "").trim());

    check(`категорій і розділів із власним текстом: ${зТекстом.length} із ${cats.length + deps.length}`,
        зТекстом.length > 0);

    // Усі бренди, які взагалі є в магазині, — щоб відрізнити згадку
    // бренду від звичайного слова.
    const усіБренди = brs.map(b => b.name);

    const брехня = [];

    зТекстом.forEach(page => {

        const свої = new Set(page.products.map(p => String(p.brand || "").trim()));

        усіБренди.forEach(brand => {

            // Згадка саме назви, а не частини іншого слова.
            const re = new RegExp("(^|[^\\p{L}])" + brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                + "($|[^\\p{L}])", "iu");

            if (re.test(page.description) && !свої.has(brand)) {
                брехня.push(`${page.name}: згадано «${brand}», а в категорії його немає`);
            }

        });

    });

    check("жоден названий бренд не поїхав із категорії", брехня.length === 0,
        брехня.slice(0, 3).join(" | "));

    // Числа в тексті застаріють мовчки: кількість і ціни вже є в
    // автоматичному рядку поруч, і саме він оновлюється зі складом.
    const зЧислами = зТекстом.filter(page =>
        /\d+\s*(модел|товар|позиці|бренд)/iu.test(page.description));

    check("у тексті немає зашитих кількостей", зЧислами.length === 0,
        зЧислами.map(p => p.name).join(", "));

    // Два однакові описи — ознака копіпасти, і для пошуку це та сама
    // «порожня сторінка-дубль», якої ми уникали автоматичним рядком.
    const тексти = зТекстом.map(p => p.description.replace(/\s+/g, " ").trim());

    const повтори = тексти.filter((t, i) => тексти.indexOf(t) !== i);

    check("усі тексти різні", повтори.length === 0,
        [...new Set(повтори)].map(t => t.slice(0, 40)).join(" | "));

    // І текст мусить доїхати на сторінку абзацами, а не одним рядком:
    // aboutMarkup ділить його по порожньому рядку.
    const зразок = зТекстом.find(p => /\n\s*\n/.test(p.description));

    check("є текст із кількох абзаців", Boolean(зразок),
        зТекстом.map(p => p.name).join(", "));

    if (зразок) {

        const rel = зразок.kind === "department"
            ? `departments/${зразок.slug}/index.html`
            : `categories/${зразок.slug}/index.html`;

        const блок = (read(rel).match(/id="brandAbout">([\s\S]*?)<button/) || [])[1] || "";

        const абзаців = (блок.match(/<p>/g) || []).length;

        check(`на сторінці /${зразок.slug}/ абзаців: ${абзаців}`,
            абзаців === зразок.description.split(/\n\s*\n/).length,
            `${абзаців} проти ${зразок.description.split(/\n\s*\n/).length}`);

    }
}

console.log("\n[10b] Тексти сторінок без власного запису в адмінці");
{
    // ЩО ЦЕ ЗАКРИВАЄ. У бренда, категорії й розділу опис лежить у
    // їхньому записі. А сторінки «бренд × тип» і розділи каталогу
    // («Новинки», «Акції») генеруються — запису в них немає, і текст
    // їм узяти було нізвідки: 13 сторінок із самим лише автоматичним
    // рядком про кількість і ціни.
    //
    // Заводити колекцію під кожну пару означало б просити власника
    // створювати запис для сторінки, яка зʼявилась сама й так само
    // зникне, коли закінчиться товар. Тому один файл на всі такі
    // сторінки, ключ — видима назва.
    const products = JSON.parse(read("data/products.json"));
    const categoryData = JSON.parse(read("data/categories.json"));
    const brandData = JSON.parse(read("data/brands.json"));

    const pairs = taxonomy.pairPages(products, categoryData, brandData);
    const sections = taxonomy.sectionPages(products);

    const файл = JSON.parse(read("data/page-texts.json"));

    check("файл текстів читається й має список",
        Array.isArray(файл.texts) && файл.texts.length > 0,
        String((файл.texts || []).length));

    const безТексту = [...pairs, ...sections].filter(p => !(p.description || "").trim());

    check(`сторінок без власного запису: ${pairs.length + sections.length}, із них без тексту: ${безТексту.length}`,
        безТексту.length === 0, безТексту.map(p => p.name).join(", "));

    // Ключ — ВИДИМА назва сторінки. Розійдеться з тим, що в заголовку,
    // — і текст мовчки не зʼявиться: ні помилки, ні порожньої сторінки.
    const назви = new Set([...pairs, ...sections].map(p => p.name));

    const зайві = файл.texts.map(r => String(r.page || "").trim())
        .filter(name => name && !назви.has(name));

    check("кожен запис знаходить свою сторінку", зайві.length === 0, зайві.join(", "));

    // Числа в тексті застаріють мовчки — кількість і ціни вже є в
    // автоматичному рядку поруч.
    const зЧислами = файл.texts.filter(r =>
        /\d+\s*(модел|товар|позиці|бренд|відсот|%)/iu.test(r.description || ""));

    check("у текстах немає зашитих кількостей і порогів", зЧислами.length === 0,
        зЧислами.map(r => r.page).join(", "));

    // Два однакові описи — та сама «порожня сторінка-дубль».
    const тексти = файл.texts.map(r => String(r.description || "").replace(/\s+/g, " ").trim());

    const повтори = тексти.filter((t, i) => t && тексти.indexOf(t) !== i);

    check("усі тексти різні", повтори.length === 0,
        [...new Set(повтори)].map(t => t.slice(0, 40)).join(" | "));

    // Названий бренд мусить справді бути на цій сторінці.
    const усіБренди = taxonomy.brandPages(products, brandData).map(b => b.name);

    const брехня = [];

    pairs.filter(p => p.description).forEach(page => {

        усіБренди.forEach(brand => {

            if (brand === page.brand) return;

            const re = new RegExp("(^|[^\\p{L}])" + brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
                + "($|[^\\p{L}])", "iu");

            if (re.test(page.description)) {
                брехня.push(`${page.name}: згадано чужий бренд «${brand}»`);
            }

        });

    });

    check("у тексті пари не згадано чужих брендів", брехня.length === 0,
        брехня.slice(0, 3).join(" | "));

    // І текст доїжджає на сторінку абзацами.
    const зразок = pairs.find(p => /\n\s*\n/.test(p.description || ""));

    check("є текст із кількох абзаців", Boolean(зразок));

    if (зразок) {

        const блок = (read(`brands/${зразок.brandSlug}/${зразок.slug}/index.html`)
            .match(/id="brandAbout">([\s\S]*?)<button/) || [])[1] || "";

        const абзаців = (блок.match(/<p>/g) || []).length;

        check(`на сторінці «${зразок.name}» абзаців: ${абзаців}`,
            абзаців === зразок.description.split(/\n\s*\n/).length,
            `${абзаців} проти ${зразок.description.split(/\n\s*\n/).length}`);

    }

    // Поле заведене в адмінці — інакше правити текст зміг би лише той,
    // хто вміє редагувати JSON у репозиторії.
    const admin = read("admin/config.yml");

    check("файл заведено в адмінці", /file: "data\/page-texts\.json"/.test(admin));
}

console.log("\n[12] Картка бренду заповнена, і банер не ріжеться на телефоні");
{
    // ЩО ТУТ ЗАКРІПЛЕНО
    //
    // 1. У кожного бренду є заголовок і опис. Порожня картка — це
    //    сторінка з машинним «Товари X» і без жодного авторського
    //    рядка: для покупця порожньо, для пошуку нічого індексувати.
    //
    // 2. Банери однакові за розміром. Різнобій помітний одразу, щойно
    //    людина перейде з бренду на бренд: смуга стрибає у висоті.
    //
    // 3. На телефоні банер НЕ ОБРІЗАНИЙ. Смуга 4:1 на екрані 375px
    //    стискається до стрічки 94px заввишки — товарів у ній не
    //    роздивитись. Тому для телефона окрема картинка 16:9, і
    //    підставляє її <picture>, а не JS: робот і людина з вимкненим
    //    JS мусять бачити те саме.
    // Розмір WebP читаємо з заголовка самі. sharp тут був би зручніший,
    // але його metadata() асинхронний, а весь цей набір — ні: заради
    // двох чисел переписувати його на async не варто.
    //
    // Формат простий: RIFF, далі чанк. Для лоссі («VP8 ») ширина й
    // висота лежать у 14 бітах на початку кадру, для «VP8L» — у 14
    // бітах після сигнатури, для «VP8X» — трьома байтами кожна.
    const webpSize = (file) => {

        const buffer = fs.readFileSync(file);

        if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;

        const kind = buffer.toString("ascii", 12, 16);

        if (kind === "VP8 ") {
            return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
        }

        if (kind === "VP8L") {
            const bits = buffer.readUInt32LE(21);
            return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
        }

        if (kind === "VP8X") {
            const read24 = (at) => buffer[at] | (buffer[at + 1] << 8) | (buffer[at + 2] << 16);
            return [read24(24) + 1, read24(27) + 1];
        }

        return null;

    };

    const records = fs.readdirSync(path.join(ROOT, "data/brands"))
        .filter(file => file.endsWith(".json"))
        .map(file => ({
            slug: file.replace(/\.json$/, ""),
            data: JSON.parse(read("data/brands/" + file)),
        }));

    check("записи брендів знайшлись", records.length >= 20, records.length);

    const noText = records.filter(r => !r.data.title || !r.data.description);

    check("у кожного бренду є заголовок і опис",
        noText.length === 0,
        noText.map(r => r.slug).join(", "));

    // Заголовок мусить читатись разом зі статтю, яку дописує сайт:
    // «Сумки й аксесуари Coach» + «для жінок» (brandPageTitle).
    const shouty = records.filter(r => /[.!?]$/.test(String(r.data.title).trim()));

    check("заголовок не закінчується крапкою — до нього дописують стать",
        shouty.length === 0,
        shouty.map(r => r.slug).join(", "));

    const SIZES = { banner: [1600, 400], bannerMobile: [800, 450] };

    const wrong = [];

    records.forEach(({ slug, data }) => {

        Object.entries(SIZES).forEach(([field, [width, height]]) => {

            const src = String(data[field] || "").split("?")[0];

            if (!src) { wrong.push(`${slug}: немає ${field}`); return; }

            const file = path.join(ROOT, src.replace(/^\//, ""));

            if (!fs.existsSync(file)) { wrong.push(`${slug}: файл ${field} не знайдено`); return; }

            const size = webpSize(file);

            if (!size) { wrong.push(`${slug}: ${field} — не WebP`); return; }

            if (size[0] !== width || size[1] !== height) {
                wrong.push(`${slug}: ${field} ${size[0]}×${size[1]}, а має бути ${width}×${height}`);
            }

        });

    });

    check("у кожного бренду є обидва банери, і всі одного розміру",
        wrong.length === 0,
        wrong.slice(0, 3).join(" | "));

    // --- розмітка ---
    const hero = read("scripts/build-taxonomy-pages.js")
        .slice(read("scripts/build-taxonomy-pages.js").indexOf("function heroMarkup"));

    // Коментарі прибираємо: у поясненні над функцією слово <picture>
    // теж згадане, і перевірка проходила б навіть тоді, коли з
    // розмітки його прибрали. Цю саму пастку вже ловили в цьому
    // наборі — коментар виглядає як код доти, доки не зламаєш код.
    const heroBody = hero.slice(0, hero.indexOf("\nfunction "))
        .split("\n").filter(line => !/^\s*\/\//.test(line)).join("\n");

    check("збірка малює <picture> з окремим джерелом для телефона",
        /<picture>/.test(heroBody)
        && /<source media="\(max-width:768px\)" srcset=/.test(heroBody));

    check("мобільне джерело додається лише разом із банером",
        /page\.banner && page\.bannerMobile/.test(heroBody));

    // Згенерована сторінка вже містить розмітку для робота, і JS мусить
    // перебудувати ТЕ САМЕ. Інакше той самий блок стоятиме двічі або
    // на телефоні після рендеру підставиться широкий банер.
    const catalogJs = read("assets/js/catalog.js");

    check("каталог перебудовує таку саму розмітку",
        /<picture>\$\{mobile\}<img class=/.test(catalogJs)
        && /brand\.banner && brand\.bannerMobile/.test(catalogJs));

    check("поле є в адмінці", /name: "bannerMobile"/.test(read("admin/config.yml"))
        || /name: "bannerMobile"/.test(read("admin/config.yml").replace(/'/g, '"')));

    check("і доїжджає в зібраний довідник",
        /bannerMobile: stamp\(data\.bannerMobile\)/.test(read("scripts/build-brands.js")));

    // --- стеля висоти ---
    //
    // Числа звірені заміром у браузері, а не взяті на око:
    //   1440px → контейнер 1366 → смуга 4:1 виходить 341px;
    //   390px  → банер 16:9 виходить 219px.
    // Стеля нижча за ці числа означала б обрізання.
    const css = read("assets/css/style.css");

    const wide = /\.brand-hero \.brand-hero-banner\{[^}]*max-height:(\d+)px/.exec(css);

    check("стеля широкого банера не ріже смугу 4:1",
        wide && Number(wide[1]) >= 340, wide && wide[1]);

    const narrow = css.slice(css.indexOf("@media(max-width:768px){", css.indexOf(".brand-hero .brand-hero-banner")));

    const small = /\.brand-hero \.brand-hero-banner\{[^}]*max-height:(\d+)px/.exec(narrow);

    check("а стеля на телефоні не ріже картинку 16:9",
        small && Number(small[1]) >= 250, small && small[1]);
}

console.log("\n[N] У переліку видно ціну, а не лише назву");
{
    // ЩО БУЛО НЕ ТАК. У ListItem стояли тільки url і name. Для Google
    // цього досить на карусель — а ШІ-пошук, який читає сторінку
    // категорії, щоб відповісти «скільки коштують жіночі сумки
    // Coach», не бачив із неї ЖОДНОЇ ціни. Довелось би заходити в
    // кожен товар, чого жоден із них не робить.
    //
    // Заміряно 08.10.2026: 46 сторінок таксономії, 20 позицій на
    // кожній, нуль цін у розмітці.
    const сторінки = [
        "categories/zhinochi-sumky/index.html",
        "brands/coach/index.html",
        "departments/sumky/index.html",
        "aktsii/index.html"
    ].filter(exists);

    check(`сторінок із переліком: ${сторінки.length}`, сторінки.length >= 3);

    const проблеми = [];

    сторінки.forEach(rel => {

        const блок = (read(rel).match(/id="collectionSchema">([\s\S]*?)<\/script>/) || [])[1];

        let d = null;

        try { d = JSON.parse(блок); } catch (error) { проблеми.push(`${rel}: не читається`); return; }

        const список = (d.mainEntity && d.mainEntity.itemListElement) || [];

        if (!список.length) { проблеми.push(`${rel}: перелік порожній`); return; }

        const безЦіни = список.filter(x => !(x.item && x.item.offers && x.item.offers.price > 0));

        if (безЦіни.length) проблеми.push(`${rel}: без ціни ${безЦіни.length} із ${список.length}`);

        const безВалюти = список.filter(x => x.item && x.item.offers
            && x.item.offers.priceCurrency !== "UAH");

        if (безВалюти.length) проблеми.push(`${rel}: валюта не UAH у ${безВалюти.length}`);

        const безНаявності = список.filter(x => x.item && x.item.offers
            && !/schema\.org\/(InStock|BackOrder)/.test(x.item.offers.availability || ""));

        if (безНаявності.length) проблеми.push(`${rel}: наявність не вказана у ${безНаявності.length}`);

    });

    check("у кожної позиції є ціна, валюта й наявність", проблеми.length === 0,
        проблеми.slice(0, 3).join(" | "));

    // Наявність бере той самий модуль, що й сторінка товару та фід:
    // «під замовлення» вже одного разу розійшлося між ними (BackOrder
    // проти PreOrder).
    const джерело = read("scripts/build-taxonomy-pages.js");

    check("наявність — зі спільного модуля, а не своя копія",
        /ProductOffer\.availabilityOf\(product\)/.test(джерело));

    // Ціна в розмітці мусить збігатися з видимою на сторінці:
    // розбіжність Search Console називає невідповідністю розмітки
    // вмісту.
    const html = read("categories/zhinochi-sumky/index.html");

    // Через try: зіпсована розмітка має давати червону перевірку, а не
    // виняток посеред набору — інакше решта перевірок просто не
    // виконається, і причину доведеться шукати в стеку.
    let d = null;

    try { d = JSON.parse(html.match(/id="collectionSchema">([\s\S]*?)<\/script>/)[1]); }
    catch (error) { /* нижче */ }

    const перший = (d && d.mainEntity && d.mainEntity.itemListElement[0]
        && d.mainEntity.itemListElement[0].item) || null;

    check("розмітку переліку вдалося прочитати, і ціна в ній є",
        Boolean(перший && перший.offers && перший.offers.price > 0));

    const екран = перший ? перший.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";

    const видима = екран
        ? (html.match(new RegExp(екран + '"[\\s\\S]*?taxonomy-price">([^<]*)<')) || [])[1] || ""
        : "";

    const число = Number(видима.replace(/[^0-9]/g, ""));

    check("ціна в розмітці збігається з видимою",
        Boolean(перший && перший.offers) && число === перший.offers.price,
        `${число} проти ${перший && перший.offers ? перший.offers.price : "—"}`);
}

console.log("\n[11] Назва бренду в хабі й у товарі — той самий рядок");
{
    // ЩО БУЛО. У двох товарів поле «Бренд» містило хвіст пробілу:
    // «Invicta » і «Adidas by Stella Mccartney ». Для JavaScript це
    // ІНШІ рядки, ніж «Invicta» і «Adidas by Stella Mccartney».
    //
    // Видно було на /brands/: плашка показувала «Invicta 0», хоча в
    // каталозі той самий бренд рахувався як 1. Причина — два джерела
    // назви. Хаб бере її з ГРУПУВАННЯ товарів (а там .trim()), а
    // catalog.js перераховує плашки за СИРИМ product.brand. Два
    // написання не сходились, і рівно два товари зі 131 не потрапляли
    // в жодну плашку: сума плашок давала 129.
    //
    // Не ловилось нічим: сторінка є, число є, виглядає буденно. Нуль
    // помічають лише тоді, коли поруч те саме число не нульове.
    //
    // Пробіли тепер зрізає build-products.js — у ДЖЕРЕЛІ, а не в
    // кожного споживача. Обхідні .trim().toLowerCase() по коду вже
    // стояли (логотипи, аліаси), але кожен новий споживач мусив би про
    // них згадати, і перший же не згадав.
    const dirty = products.filter(product => {

        const raw = String(product.brand || "");

        return raw !== raw.replace(/\s+/g, " ").trim();

    });

    check("у товарах немає назв бренду із зайвими пробілами",
        dirty.length === 0,
        dirty.map(product => JSON.stringify(product.brand)).join(", "));

    // ГОЛОВНЕ. Плашка рахує товари за ТОЧНИМ збігом рядка — отже кожна
    // назва в розмітці мусить існувати в товарах саме так, як
    // написана. Не існує — плашка показує нуль і гасне.
    const names = new Set(products.map(product => String(product.brand || "")));

    const hub = read("brands/index.html");

    const chips = [...hub.matchAll(/data-brand-chip="([^"]*)"/g)]
        .map(match => match[1]
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&"));

    check("плашки в хабі знайшлись",
        chips.length === brands.length,
        chips.length + " з " + brands.length);

    const orphans = chips.filter(name => !names.has(name));

    check("кожна назва з хаба є в товарах рівно так, як написана",
        orphans.length === 0,
        orphans.map(name => JSON.stringify(name)).join(" | "));

    // І назад: бренд без плашки означав би, що в хаб він не потрапив,
    // — тобто перелік брендів неповний.
    const missing = [...names].filter(name => name && !chips.includes(name));

    check("і кожен бренд із товарів має плашку",
        missing.length === 0,
        missing.map(name => JSON.stringify(name)).join(" | "));
}

console.log("\n[N] Сам каталог теж не порожній без JS");
{
    // ЩО БУЛО НЕ ТАК. Сторінки брендів і категорій давно носять
    // перелік товарів у розмітці — рівно заради робота, який не
    // виконує JavaScript. А /catalog, головна сторінка каталогу,
    // лишалась порожньою.
    //
    // Заміряно 07.10.2026 на проді: нуль посилань на /p/ у сирому
    // HTML. Усе, що бачив такий робот, — підписи фільтрів. Для Google
    // не біда (він рендерить), але ШІ-краулери переважно ні, і для
    // них каталог магазину не містив жодного товару.
    //
    // Правило було, але застосоване двом типам сторінок із трьох.
    const html = read("catalog.html");

    const links = (html.match(/href="\/p\/[^"]+"/g) || []).length;

    // У САМОМУ КАТАЛОЗІ — ВЕСЬ АСОРТИМЕНТ, А НЕ ДВАДЦЯТЬ.
    //
    // Стеля в 20 має сенс на сторінці бренду: решту його товарів робот
    // дійде з /catalog. Але сам /catalog так само показував 20 зі 103,
    // і для робота без JavaScript магазин складався з двадцяти позицій.
    const products = JSON.parse(read("data/products.json"));

    check(`перелік товарів у розмітці каталогу (${links} із ${products.length})`,
        links === Math.min(products.length, taxonomy.CATALOG_STATIC_LIMIT),
        `${links}, а треба ${Math.min(products.length, taxonomy.CATALOG_STATIC_LIMIT)}`);

    // Дві стелі існують із різних причин і не мусять зрівнятись:
    // мала — щоб сторінка бренду не везла два екрани тексту, якого
    // людина не побачить; велика — щоб каталог показав увесь
    // асортимент роботові без JavaScript.
    check(`стеля таксономії (${taxonomy.STATIC_LIMIT}) менша за каталожну (${taxonomy.CATALOG_STATIC_LIMIT})`,
        taxonomy.STATIC_LIMIT < taxonomy.CATALOG_STATIC_LIMIT);

    check("а на сторінках таксономії стеля лишилась",
        (read("departments/sumky/index.html").match(/href="\/p\/[^"]+"/g) || []).length
            <= taxonomy.STATIC_LIMIT);

    check("той самий перелік, що й на сторінках таксономії",
        /class="taxonomy-static-list"/.test(html));

    // І РОЗМІТКА ПЕРЕЛІКУ — ТЕЖ.
    //
    // У сторінок бренду й категорії CollectionPage була, а в самого
    // /catalog ні: він не генерується, а живе як звичайна сторінка.
    // Найбільший перелік магазину лишався єдиним, із якого машина не
    // могла взяти ні назв, ні цін.
    const ld = (html.match(/id="collectionSchema">([\s\S]*?)<\/script>/) || [])[1];

    let колекція = null;

    try { колекція = JSON.parse(ld); } catch (error) { /* нижче */ }

    check("у каталозі є CollectionPage",
        Boolean(колекція && колекція["@type"] === "CollectionPage"));

    check("вона заявляє весь асортимент",
        колекція && колекція.mainEntity.numberOfItems === products.length,
        колекція && String(колекція.mainEntity.numberOfItems));

    check("і не задвоюється на другому прогоні",
        (html.match(/id="collectionSchema"/g) || []).length === 1);

    // Каркас прибрано: він тримав форму сітки, поки немає даних, а
    // тепер там одразу справжній перелік. Два екрани заглушок перед
    // готовим вмістом — те саме, чого уникають сторінки брендів.
    check("каркаса-заглушки в каталозі більше немає",
        !/class="catalog-skeleton"/.test(html));

    // ЗБІРКА МУСИТЬ ПЕРЕЖИВАТИ ДРУГИЙ ПРОГІН ПІДРЯД.
    //
    // catalog.html — і сторінка, і шаблон для 30 сторінок таксономії.
    // Відколи збірка пише перелік у нього самого, файл буває у двох
    // станах, і обидва мусять годитись. Регулярки, що вимагали
    // ПОРОЖНЬОЇ сітки й наявного каркаса, на другому прогоні впали б.
    const джерело = read("scripts/build-taxonomy-pages.js");

    check("сітка в шаблоні шукається і наповненою",
        /id="catalogGrid"[^/]*class="products-grid">\[\\s\\S\]\*\?<\\\/div>/.test(джерело)
        || /products-grid">\[\\s\\S\]\*\?/.test(джерело),
        "GRID_SLOT_RE усе ще вимагає порожньої сітки");

    check("каркас прибирається, а не вимагається",
        !/не знайдено каркас \.catalog-skeleton/.test(джерело));
}


console.log(failures === 0
    ? `\n✅ Таксономія: ${brands.length} брендів + ${categories.length} категорій + розділи мають власні адреси\n`
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
