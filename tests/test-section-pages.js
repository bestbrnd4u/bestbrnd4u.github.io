// Розділи каталогу «Новинки» й «Акції» мають власні сторінки.
//
// Сусідній tests/test-sections.js — про інше: він перевіряє, що
// каталог ФІЛЬТРУЄ за розділом правильно. Тут — що в розділу є
// сторінка, і що та сторінка показує рівно той самий набір.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Це пункти головного меню на кожній сторінці сайту — і вели вони на
// адресу-фільтр:
//
//     catalog?section=sale
//
// А така адреса сама заявляє, що окремою сторінкою не є: canonical у
// ній вказує на /catalog. Тобто власним меню ми зганяли вагу на
// /catalog і водночас казали Google, що дивитись на знижки нема де.
//
// Заміряно 08.10.2026 на всіх 170 сторінках: посилань на catalog із
// фільтром — 2832, 27% усіх внутрішніх. З них 1360 — рівно ці два
// розділи (по 4 на сторінку кожен: пункт меню, три плитки за статтю і
// підвал).
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. Сторінки /novynky/ і /aktsii/ існують і описують самі себе.
// 2. Набір товарів на сторінці — ТОЙ САМИЙ, що показав би каталог.
//    Правило живе у двох місцях (scripts/sections.js і
//    assets/js/catalog.js), і тут обидві реалізації проганяються на
//    тих самих товарах.
// 3. Жодне посилання на сайті більше не веде на catalog?section=.
// 4. Порожній розділ не потрапляє в sitemap, але адреса лишається.

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

const Sections = require("../scripts/sections.js");
const taxonomy = require("../scripts/build-taxonomy-pages.js");

const products = JSON.parse(read("data/products.json"));

const pages = taxonomy.sectionPages(products);


console.log("\n[1] Сторінка є в кожного розділу й описує себе");
{
    check(`розділів: ${pages.length}`, pages.length === 2, pages.map(p => p.slug).join(", "));

    const проблеми = [];

    pages.forEach(page => {

        const rel = `${page.slug}/index.html`;

        if (!exists(rel)) { проблеми.push(`${page.name}: немає файлу`); return; }

        const html = read(rel);

        const свій = re => ((html.match(re) || [])[1] || "").trim();

        if (свій(/<link rel="canonical" href="([^"]+)"/) !== page.url) {
            проблеми.push(`${page.name}: canonical ${свій(/<link rel="canonical" href="([^"]+)"/)}`);
        }

        if (свій(/<title>([^<]*)<\/title>/) !== page.title) {
            проблеми.push(`${page.name}: title ${свій(/<title>([^<]*)<\/title>/)}`);
        }

        if (свій(/id="catalogTitle">([^<]*)</) !== page.heading) {
            проблеми.push(`${page.name}: h1 ${свій(/id="catalogTitle">([^<]*)</)}`);
        }

        if (свій(/<meta property="og:url" content="([^"]+)"/) !== page.url) {
            проблеми.push(`${page.name}: og:url не свій`);
        }

        // Робот, що не виконує JavaScript, мусить побачити товари.
        const скільки = (html.match(/<a href="\/p\//g) || []).length;

        const треба = Math.min(page.products.length, taxonomy.STATIC_LIMIT);

        if (скільки !== треба) {
            проблеми.push(`${page.name}: товарів у розмітці ${скільки}, а треба ${треба}`);
        }

        // Розділ сторінка заявляє сама: в адресі ?section= більше
        // немає, і catalog.js бере його звідси.
        const preset = (html.match(/window\.CATALOG_PRESET = (\{[^\n]*\});/) || [])[1];

        if (preset !== JSON.stringify({ section: page.section })) {
            проблеми.push(`${page.name}: фільтр сторінки ${preset}`);
        }

    });

    check("canonical, заголовок, h1, перелік і фільтр — свої в кожної",
        проблеми.length === 0, проблеми.slice(0, 3).join(" | "));

    check("адреси — від кореня й транслітеровані",
        pages.every(p => p.url === `${SITE_URL}/${p.slug}/` && /^[a-z]+$/.test(p.slug)),
        pages.map(p => p.url).join(", "));
}


console.log("\n[2] Набір товарів — той самий, що показав би каталог");
{
    // Правило живе у двох місцях: scripts/sections.js (для збірки) і
    // assets/js/catalog.js (для браузера). Друге нічого не експортує,
    // тож витягаємо його з вихідника й ЗАПУСКАЄМО — порівнювати
    // регуляркою означало б закріпити форму запису, а не поведінку.
    const catalog = read("assets/js/catalog.js");
    const common = read("assets/js/common.js");

    const тіло = (src, назва) =>
        (src.match(new RegExp("function " + назва + "\\([^)]*\\)[\\s\\S]*?\\n}")) || [])[0];

    const частини = [
        тіло(common, "saleActive"),
        тіло(common, "priceNow"),
        тіло(common, "oldPriceNow"),
        тіло(common, "discountPercent"),
        тіло(catalog, "sectionProducts")
    ];

    check("правило каталогу знайшлось у вихідниках",
        частини.every(Boolean),
        частини.map((ч, i) => (ч ? "" : i)).filter(x => x !== "").join(", "));

    const зКаталогу = (section, список) => new Function(
        "currentSection", "products", "SALE_MIN_DISCOUNT",
        частини.join("\n") + "\nreturn sectionProducts();"
    )(section, список, Sections.SALE_MIN_DISCOUNT);

    const поріг = (catalog.match(/const SALE_MIN_DISCOUNT = (\d+);/) || [])[1];

    check(`поріг знижки однаковий: ${Sections.SALE_MIN_DISCOUNT}%`,
        Number(поріг) === Sections.SALE_MIN_DISCOUNT, `у catalog.js ${поріг}`);

    ["new", "sale"].forEach(section => {

        const наш = Sections.sectionProducts(section, products).map(p => p.slug).sort();
        const їхній = зКаталогу(section, products).map(p => p.slug).sort();

        check(`«${Sections.SECTIONS[section].heading}»: ${наш.length} товарів, і в каталозі стільки ж`,
            наш.join("|") === їхній.join("|"),
            `збірка ${наш.length}, каталог ${їхній.length}`);

    });

    // Ціна дня — найтонше місце копії: товар зі знижкою 40%, у якого
    // сьогодні діє ціна дня, знижку втрачає, бо перекреслюється вже
    // звичайна ціна. Обидві реалізації мають падати однаково.
    const вигадані = [
        { slug: "звичайна-знижка", price: 600, oldPrice: 1000 },
        { slug: "мала-знижка", price: 900, oldPrice: 1000 },
        { slug: "ціна-дня-йде", price: 1000, oldPrice: 2000,
            sale: { price: 950, from: "2000-01-01", to: "2100-01-01" } },
        { slug: "ціна-дня-минула", price: 600, oldPrice: 1000,
            sale: { price: 100, from: "2000-01-01", to: "2001-01-01" } },
        { slug: "без-старої", price: 500 }
    ];

    const наш = Sections.sectionProducts("sale", вигадані).map(p => p.slug);
    const їхній = зКаталогу("sale", вигадані).map(p => p.slug);

    check("і на вигаданих випадках із ціною дня теж",
        наш.join("|") === їхній.join("|"), `збірка [${наш}], каталог [${їхній}]`);
}


console.log("\n[3] Жодне посилання більше не веде на catalog?section=");
{
    const пропустити = new Set(["node_modules", ".git", ".claude", "archive",
        "admin", ".playwright-mcp", "supabase"]);

    function файли(dir, список) {
        список = список || [];
        fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
            if (пропустити.has(e.name)) return;
            const f = path.join(dir, e.name);
            if (e.isDirectory()) файли(f, список);
            else if (/\.(html|js|json)$/.test(e.name)) список.push(f);
        });
        return список;
    }

    const старі = [];

    файли(ROOT, []).forEach(f => {

        const текст = fs.readFileSync(f, "utf8");

        // Шукаємо саме АДРЕСУ, а не згадку в коментарі: пояснення, чому
        // ми від неї пішли, мають право лишитись у коді.
        const скільки = (текст.match(/href="[^"]*catalog\?section=/g) || []).length;

        if (скільки) старі.push(`${path.relative(ROOT, f)} (${скільки})`);

    });

    check("старої адреси в посиланнях немає", старі.length === 0,
        старі.slice(0, 5).join(", "));

    // А нові — на місці, і саме стільки, скільки пунктів меню.
    const зразок = read("contacts.html");

    ["new", "sale"].forEach(section => {

        const шлях = Sections.sectionPath(section);

        const скільки = (зразок.match(new RegExp(`href="${шлях}`, "g")) || []).length;

        // пункт меню + 4 плитки за статтю + підвал
        check(`${шлях} у шапці й підвалі звичайної сторінки: ${скільки}`, скільки === 6,
            String(скільки));

    });
}


console.log("\n[4] Порожній розділ не кличе робота, але адреса лишається");
{
    const sitemap = read("sitemap.xml");

    pages.forEach(page => {

        const є = sitemap.includes(`<loc>${page.url}</loc>`);

        check(`«${page.name}» (${page.products.length} товарів) у sitemap: ${є ? "так" : "ні"}`,
            є === page.products.length > 0);

    });

    // Сама сторінка існує завжди: вона в меню на кожній сторінці
    // сайту, і прибрана адреса дала б 404 замість порожнього переліку.
    check("файли на диску є в обох розділів",
        pages.every(p => exists(`${p.slug}/index.html`)),
        pages.filter(p => !exists(`${p.slug}/index.html`)).map(p => p.slug).join(", "));

    const llms = read("llms.txt");

    check("обидва розділи в llms.txt",
        pages.every(p => llms.includes(p.url)),
        pages.filter(p => !llms.includes(p.url)).map(p => p.slug).join(", "));
}


console.log("\n[5] Меню знає ті самі адреси, що й збірка");
{
    // Мега-меню визначає розділ із href пункту й будує посилання
    // всередині панелі. Свою копію адрес воно має з потреби — у
    // браузерних файлах модулів немає, — і розійтись їм не можна.
    const menu = read("assets/js/mega-menu.js");

    const свої = {};

    [...menu.matchAll(/"(new|sale)":\s*"([^"]+)"/g)].forEach(m => { свої[m[1]] = m[2]; });

    check("мега-меню знає обидва розділи", Object.keys(свої).length === 2,
        JSON.stringify(свої));

    const розбіжні = Object.keys(свої).filter(k => свої[k] !== Sections.sectionPath(k));

    check("і адреси ті самі, що в scripts/sections.js", розбіжні.length === 0,
        розбіжні.map(k => `${k}: ${свої[k]} ≠ ${Sections.sectionPath(k)}`).join(", "));

    // Зворотний бік: меню мусить упізнати власну адресу, інакше
    // панель «Акції» наповнилась би як панель «Каталог».
    check("розділ упізнається зі свого шляху",
        Sections.sectionOfPath("/aktsii/") === "sale"
        && Sections.sectionOfPath("/novynky/") === "new"
        && Sections.sectionOfPath("/catalog") === "",
        [Sections.sectionOfPath("/aktsii/"), Sections.sectionOfPath("/novynky/")].join(", "));
}


console.log("\n[6] Каталог приймає розділ як фільтр сторінки");
{
    const catalog = read("assets/js/catalog.js");

    check("розділ рахується фільтром сторінки",
        /PRESET\.department \|\| PRESET\.section/.test(catalog));

    check("і застосовується при завантаженні",
        /if \(PRESET\.section\) currentSection = PRESET\.section;/.test(catalog));

    check("в адресу він удруге не пишеться",
        /const skipSection = !keepPreset && presetActive\(\) && Boolean\(PRESET\.section\)/.test(catalog));

    // Пішов зі свого розділу — пішов зі сторінки. Перевіряємо
    // поведінкою: запускаємо обидві функції з підставленим станом.
    const вихідник = назва =>
        catalog.match(new RegExp("function " + назва + "\\(\\)[\\s\\S]*?\\n}"))[0];

    const тримається = (preset, стан) => new Function(
        "PRESET", "selectedBrands", "selectedDepartments", "selectedCategories", "currentSection",
        вихідник("presetActive") + "\n" + вихідник("presetHolds") + "\nreturn presetHolds();"
    )(preset, new Set(стан.brands || []), new Set(стан.departments || []),
        new Set(стан.categories || []), стан.section || "");

    check("розділ на місці — лишаємось",
        тримається({ section: "sale" }, { section: "sale" }) === true);

    check("розділ змінився — виходимо",
        тримається({ section: "sale" }, { section: "new" }) === false);

    check("розділ зняли — виходимо",
        тримається({ section: "sale" }, { section: "" }) === false);
}


console.log(failures === 0
    ? `\n✅ ${pages.map(p => p.name + " " + p.products.length).join(", ")} — власні сторінки\n`
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
