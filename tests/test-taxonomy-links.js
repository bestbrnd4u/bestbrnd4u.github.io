// Крихти ведуть на власні сторінки, а не у фільтр каталогу.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Доріжка на сторінці товару вела так:
//
//   Жіночі сумки → /catalog?gender=Жінкам&category=Жіночі%20сумки
//
// А ця адреса сама заявляє, що окремою сторінкою не є:
//
//   canonical: https://bestbrnd4u.com/catalog
//
// Тобто вага з крихт усіх 100 сторінок товарів стікалась в один
// /catalog. Тоді як сторінки, зроблені саме щоб ранжуватись
// (/categories/zhinochi-sumky/ — «Жіночі сумки — купити в Україні»),
// не отримували з товарів ЖОДНОГО посилання: заміряно на проді —
// 0 на /categories/, 0 на /departments/.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. Крихти категорії, розділу й бренду ведуть на їхні сторінки.
// 2. КОЖНЕ таке посилання веде на сторінку, яка існує. Це головна
//    перевірка файлу: правило «яким назвам належить сторінка» живе у
//    двох місцях (scripts/taxonomy-links.js і build-taxonomy-pages.js),
//    і якщо вони розійдуться, покупець побачить 404. Тест ловить це
//    до того, як зміна доїде на прод.
// 3. Розмітка BreadcrumbList збігається з видимою доріжкою.
//
// 4. Розмітка «хто ми» (Organization) називає соцпрофілі: без sameAs
//    сайт, Instagram і Telegram для Google — три непов'язані речі.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const Breadcrumbs = require("../assets/js/breadcrumbs.js");
const { taxonomyLinks, pageFor } = require("../scripts/taxonomy-links.js");

console.log("\n[1] Будівник доріжки віддає власні сторінки, коли вони є");
{
    const product = {
        title: "Сумочка Coach Tabby",
        gender: ["Жінкам"],
        category: "Жіночі сумки",
        brand: "Coach"
    };

    const links = {
        category: { "Жіночі сумки": "categories/zhinochi-sumky/" },
        department: { "Сумки": "departments/sumky/" },
        brand: { "Coach": "brands/coach/" }
    };

    const trail = Breadcrumbs.buildTrail(product, {
        departmentOf: () => "Сумки",
        pageFor: pageFor(links)
    });

    const href = label => (trail.find(c => c.label === label) || {}).href;

    check("категорія → своя сторінка", href("Жіночі сумки") === "categories/zhinochi-sumky/",
        href("Жіночі сумки"));

    check("розділ → своя сторінка", href("Сумки") === "departments/sumky/", href("Сумки"));

    check("бренд → своя сторінка", href("Coach") === "brands/coach/", href("Coach"));

    // Стать власної сторінки не має — там лишається фільтр, і це
    // правильно: /catalog?gender=… показує саме те, що обіцяє крихта.
    check("стать лишається фільтром", /^catalog\?gender=/.test(href("Жінкам")), href("Жінкам"));

    // ЗАПАСНИЙ ШЛЯХ. Стара адреса /product?id=… вбудованої мапи не
    // має, і доріжка мусить лишитись робочою.
    const plain = Breadcrumbs.buildTrail(product, { departmentOf: () => "Сумки" });

    const plainHref = label => (plain.find(c => c.label === label) || {}).href;

    check("без мапи крихти лишаються посиланнями на фільтр",
        /^catalog\?/.test(plainHref("Жіночі сумки")), plainHref("Жіночі сумки"));

    check("накопичення фільтрів у запасному шляху не зламалось",
        /gender=/.test(plainHref("Coach")) && /category=/.test(plainHref("Coach")),
        plainHref("Coach"));

    // КРИХТА БРЕНДУ МУСИТЬ ПАМʼЯТАТИ КАТЕГОРІЮ.
    //
    // Доріжка накопичувальна: «Coach» усередині «Жіночих сумок»
    // означає жіночі сумки Coach, і запасне посилання на фільтр це й
    // давало — catalog?gender=…&category=…&brand=…
    //
    // А власна сторінка бренду, яку ланка дістала разом із /brands/,
    // категорію мовчки загубила: клац по «Coach» усередині жіночих
    // сумок відкривав усі 18 товарів бренду разом із гаманцями. Тобто
    // перехід на справжню адресу покращив SEO й зіпсував саме те,
    // заради чого доріжка накопичувальна.
    const зПарою = Breadcrumbs.buildTrail(product, {
        departmentOf: () => "Сумки",
        pageFor: pageFor({
            ...links,
            pair: { "Жіночі сумки Coach": "brands/coach/zhinochi-sumky/" }
        })
    });

    const парнийHref = label => (зПарою.find(c => c.label === label) || {}).href;

    check("є пара «бренд × тип» — крихта бренду веде на неї",
        парнийHref("Coach") === "brands/coach/zhinochi-sumky/", парнийHref("Coach"));

    check("підпис крихти лишається назвою бренду",
        зПарою.filter(c => c.label === "Coach").length === 1,
        зПарою.map(c => c.label).join(" → "));

    check("рівнів у доріжці не побільшало", зПарою.length === trail.length,
        `${зПарою.length} проти ${trail.length}`);

    // Пари немає — лишається сторінка бренду. У брендів з одним типом
    // товару вона й ПОКАЗУЄ рівно цей тип, тож нічого не губиться.
    check("немає пари — лишається сторінка бренду",
        href("Coach") === "brands/coach/", href("Coach"));

    // Поза категорією пара не має сенсу: немає тієї ланки, повз яку
    // людина щойно пройшла.
    const безКатегорії = Breadcrumbs.buildTrail(
        { title: "Щось", brand: "Coach" },
        { pageFor: pageFor({ ...links, pair: { " Coach": "brands/coach/zhinochi-sumky/" } }) });

    check("без категорії пара не підставляється",
        (безКатегорії.find(c => c.label === "Coach") || {}).href === "brands/coach/",
        (безКатегорії.find(c => c.label === "Coach") || {}).href);
}

console.log("\n[1a] Ключ пари складається однаково в усіх трьох місцях");
{
    // «Жіночі сумки Marc Jacobs» будують троє: сам генератор сторінок
    // (як назву), довідник адрес (як ключ) і будівник доріжки (щоб у
    // довіднику знайти). Розійдуться — крихта мовчки впаде назад на
    // сторінку бренду, і ніхто цього не помітить.
    const products = JSON.parse(read("data/products.json"));
    const categories = JSON.parse(read("data/categories.json"));
    const brands = JSON.parse(read("data/brands.json"));

    const taxonomy = require("../scripts/build-taxonomy-pages.js");

    const pairs = taxonomy.pairPages(products, categories, brands)
        .filter(page => page.level === "category");

    const links = taxonomyLinks(products, categories, brands);

    check(`категорійних пар: ${pairs.length}`, pairs.length > 0);

    const загублені = pairs.filter(page => links.pair[page.name] !== page.href.replace(/^\//, ""));

    check("довідник знає кожну під її власною назвою", загублені.length === 0,
        загублені.map(p => p.name).join(", "));

    // І лише категорійні. Крихта бренду стоїть одразу після крихти
    // категорії, тож означає саме категорію цього бренду; пара з
    // розділом («Сумки Coach») була б ширшою за ту ланку, повз яку
    // людина щойно пройшла.
    const зайві = taxonomy.pairPages(products, categories, brands)
        .filter(page => page.level === "department" && links.pair[page.name]);

    check("пар із розділом у довіднику немає", зайві.length === 0,
        зайві.map(p => p.name).join(", "));

    // А тепер те саме, але очима будівника: він складає ключ сам, з
    // полів товару.
    const знайдені = products.filter(product => {

        const trail = Breadcrumbs.buildTrail(product, { pageFor: pageFor(links) });

        const crumb = trail.find(c => c.label === product.brand);

        return crumb && /^brands\/[^/]+\/[^/]+\//.test(crumb.href);

    });

    const очікувані = products.filter(product => pairs.some(page =>
        page.brand === String(product.brand || "").trim()
        && page.type === String(product.category || "").trim()));

    check(`товарів із парою: ${очікувані.length} — стільки ж дістали посилання`,
        знайдені.length === очікувані.length,
        `${знайдені.length} проти ${очікувані.length}`);
}

console.log("\n[2] Правило «кому належить сторінка» — те саме, що в генератора");
{
    const products = JSON.parse(read("data/products.json"));
    const categories = JSON.parse(read("data/categories.json"));
    const brands = JSON.parse(read("data/brands.json"));

    const links = taxonomyLinks(products, categories, brands);

    // Сторінку отримує кожна категорія / розділ / бренд із товарами.
    const used = new Set(products.map(p => String(p.category || "").trim()).filter(Boolean));

    check(`категорій із товарами: ${used.size} — усі мають адресу`,
        [...used].every(name => links.category[name]),
        [...used].filter(name => !links.category[name]).join(", "));

    check("бренд зі власним slug в адмінці бере саме його",
        Object.values(links.brand).every(href => /^brands\/[a-z0-9-]+\/$/.test(href)),
        Object.values(links.brand).filter(h => !/^brands\/[a-z0-9-]+\/$/.test(h)).join(", "));

    check("категорії без товарів адреси не отримують (сторінки для них немає)",
        !links.category["Дитячі рюкзаки"] || used.has("Дитячі рюкзаки"));
}

console.log("\n[3] КОЖНЕ посилання з крихт веде на існуючу сторінку");
{
    const dir = path.join(ROOT, "p");

    if (!fs.existsSync(dir)) {

        check("сторінки товарів згенеровані (npm run build)", false, "теки p/ немає");

    } else {

        const broken = new Set();
        let pages = 0, links = 0, pairLinks = 0;

        fs.readdirSync(dir).forEach(slug => {

            const file = path.join(dir, slug, "index.html");

            if (!fs.existsSync(file)) return;

            const html = fs.readFileSync(file, "utf8");

            // Сторінки-переспрямування зі старих адрес доріжки не мають
            // навмисно: вони живуть частку секунди.
            if (/http-equiv="refresh"/.test(html)) return;

            pages++;

            const block = html.match(/<div class="container" id="breadcrumbsList">[\s\S]*?<\/div>/);

            if (!block) { broken.add(`${slug}: немає доріжки`); return; }

            [...block[0].matchAll(/href="([^"]+)"/g)].forEach(match => {

                const href = match[1].replace(/^https?:\/\/[^/]+/, "");

                if (!/^\/(categories|departments|brands)\//.test(href)) return;

                links++;

                // /brands/coach/zhinochi-sumky/ — два рівні, тобто
                // пара «бренд × тип».
                if (/^\/brands\/[^/]+\/[^/]+\/$/.test(href)) pairLinks++;

                if (!fs.existsSync(path.join(ROOT, href, "index.html"))) broken.add(href);

            });

        });

        check(`сторінок товарів перевірено: ${pages}`, pages > 0);

        check(`посилань на власні сторінки: ${links} (було 0)`, links > 0);

        check("жодного битого посилання", broken.size === 0, [...broken].join(", "));

        // І саме на пари — на ГОТОВИХ сторінках, а не лише в памʼяті
        // будівника. Між ними стоїть ще й window.PRODUCT_TAXONOMY, яку
        // кладе генератор; забуде він туди покласти пару — крихта
        // мовчки відкотиться на сторінку бренду.
        const продукти = JSON.parse(read("data/products.json"));

        const пари = require("../scripts/build-taxonomy-pages.js")
            .pairPages(продукти, JSON.parse(read("data/categories.json")),
                JSON.parse(read("data/brands.json")))
            .filter(page => page.level === "category");

        const зПарою = продукти.filter(product => пари.some(page =>
            page.brand === String(product.brand || "").trim()
            && page.type === String(product.category || "").trim())).length;

        check(`на сторінки «бренд × тип» — ${pairLinks} крихт із ${зПарою} можливих`,
            pairLinks === зПарою, `${pairLinks} проти ${зПарою}`);

        // Рантайм перемальовує доріжку після завантаження. Без мапи в
        // самій сторінці він зібрав би її по-своєму й стер би пару.
        const зразок = fs.readdirSync(dir)
            .map(slug => path.join(dir, slug, "index.html"))
            .filter(file => fs.existsSync(file))
            .map(file => fs.readFileSync(file, "utf8"))
            .filter(html => /window\.PRODUCT_TAXONOMY = \{[^\n]*"pair"/.test(html));

        check(`мапа з парою доїхала в рантайм ${зразок.length} сторінок`,
            зразок.length === зПарою, `${зразок.length} проти ${зПарою}`);
    }
}

console.log("\n[4] Розмітка для Google збігається з видимою доріжкою");
{
    const productSrc = read("assets/js/product.js");

    // Раніше тут стояли три ланки вручну — і вони ЗАТИРАЛИ повну
    // доріжку, яку кладе генератор. Google виконує JS, тож бачив
    // коротку.
    check("рантайм не пише свій BreadcrumbList вручну",
        !/position: 3, name: product\.title/.test(productSrc),
        "розмітку доріжки мусить збирати Breadcrumbs.toJsonLd");

    check("розмітка збирається тим самим будівником",
        /setJsonLd\("breadcrumbSchema", window\.Breadcrumbs\.toJsonLd\(trail/.test(productSrc));

    check("і видима доріжка, і розмітка знають про власні сторінки",
        (productSrc.match(/pageFor: taxonomyPageFor/g) || []).length >= 2,
        (productSrc.match(/pageFor: taxonomyPageFor/g) || []).length);

    check("мапу адрес кладе в сторінку генератор",
        /window\.PRODUCT_TAXONOMY = \$\{productTaxonomy\(product\)\}/.test(read("scripts/build-product-pages.js")));

    // Перевіряємо на справжній згенерованій сторінці: у розмітці й у
    // JSON-LD мусить бути та сама адреса категорії.
    const dir = path.join(ROOT, "p");

    const sample = fs.existsSync(dir) && fs.readdirSync(dir).find(slug => {
        const file = path.join(dir, slug, "index.html");
        return fs.existsSync(file) && /id="organizationSchema"|categories\//.test(fs.readFileSync(file, "utf8"));
    });

    if (sample) {

        const html = read(`p/${sample}/index.html`);

        const inMarkup = (html.match(/href="[^"]*\/categories\/([a-z0-9-]+)\//) || [])[1];
        const inSchema = (html.match(/"item": "[^"]*\/categories\/([a-z0-9-]+)\//) || [])[1];

        check(`доріжка й розмітка вказують на ту саму категорію (${sample})`,
            inMarkup && inMarkup === inSchema, `${inMarkup} / ${inSchema}`);

    }
}

console.log("\n[5] Розмітка «хто ми» називає соцпрофілі");
{
    const home = read("index.html");

    const block = (home.match(/<script type="application\/ld\+json" id="organizationSchema">([\s\S]*?)<\/script>/) || [])[1];

    check("блок Organization на місці", !!block);

    if (block) {

        const schema = JSON.parse(block);

        check("є sameAs", Array.isArray(schema.sameAs) && schema.sameAs.length > 0);

        check("Instagram названий", (schema.sameAs || []).some(u => /instagram\.com/.test(u)),
            JSON.stringify(schema.sameAs));

        check("Telegram названий", (schema.sameAs || []).some(u => /t\.me/.test(u)));

        check("є телефон", !!schema.telephone, schema.telephone);

        // Номер у розмітці мусить бути ТОЙ САМИЙ, що на сайті:
        // розбіжність із видимим текстом Google вважає помилкою.
        const legal = JSON.parse(read("data/legal.json"));

        check("телефон збігається з data/legal.json", schema.telephone === legal.phone,
            `${schema.telephone} / ${legal.phone}`);

        check("пошта збігається з data/legal.json", schema.email === legal.email);

        // Профіль Instagram лежить у data/home.json (адмінка → Головна).
        const homeData = JSON.parse(read("data/home.json"));

        check("Instagram узятий із даних, а не зашитий",
            (schema.sameAs || []).includes(homeData.instagram.link),
            homeData.instagram && homeData.instagram.link);
    }

    check("розмітку наповнює збірка, а не рука",
        /function organizationSchema\(legal, home\)/.test(read("scripts/build-legal.js")));

    check("порожнє поле = ключа немає, а не порожній рядок",
        /if \(email\) schema\.email = email;/.test(read("scripts/build-legal.js")));
}

console.log(failures ? `\n❌ Провалено: ${failures}` : "\n✅ Крихти й розмітка ведуть туди, куди треба");

process.exit(failures ? 1 : 0);
