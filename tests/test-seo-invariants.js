// Сторожі SEO: sitemap, robots.txt і canonical.
//
// НАВІЩО ЦЕЙ ФАЙЛ
// ----------------
// Питання «а всі товари потрапили в sitemap?» має перевірятись САМО, а
// не очима раз на місяць. Кожна перевірка нижче — правило, яке легко
// порушити випадково, і яке ніяк не проявиться до листа з Search
// Console через два тижні.
//
// ГОЛОВНЕ ПРАВИЛО: sitemap і noindex — взаємовиключні. Сторінка або
// запрошена в індекс, або закрита від нього. Не одночасно, інакше в
// Search Console з'являється «Submitted URL marked noindex».
//
// ПРАВИЛО ЗАЛЕЖИТЬ ВІД СЕРЕДОВИЩА, і це головна пастка цього файлу.
// На проді сторінка з sitemap МАЄ бути відкритою; на dev — навпаки,
// apply-site-env.js свідомо закриває всі, щоб тестова копія не
// конкурувала з продом за ті самі запити. Тому перевірка дзеркальна, а
// не одностороння: на кожному середовищі своє очікування.
//
// Через це ж тут перевіряється й сам перемикач ([3b]): уся різниця
// між двома середовищами тримається на одному кроці збірки.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const sitemap = read("sitemap.xml");
const robots = read("robots.txt");
const config = JSON.parse(read("site.config.json"));

const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

// Середовище визначаємо за самим sitemap, а не за гілкою: тест
// однаково має працювати і локально, і в CI на dev, і на main.
const env = locs[0] && locs[0].startsWith(config.development.url)
    ? config.development
    : config.production;

const SITE = env.url;

console.log(`\n[0] Середовище: ${env.branch} (${SITE})`);


console.log("\n[1] Кожен товар у sitemap");
{
    const products = JSON.parse(read("data/products.json"));

    const inMap = new Set(locs.filter(l => l.includes("/p/"))
        .map(l => l.replace(/.*\/p\//, "").replace(/\/$/, "")));

    const missing = products.filter(p => !inMap.has(p.slug));

    check(`усі ${products.length} товарів на місці`,
        missing.length === 0, missing.map(p => p.slug).slice(0, 5).join(", "));

    const slugs = new Set(products.map(p => p.slug));

    // Видалили товар — його адреса має піти з sitemap, інакше робот
    // ходить на 404 і псує оцінку сайту.
    check("зайвих адрес немає",
        [...inMap].every(s => slugs.has(s)),
        [...inMap].filter(s => !slugs.has(s)).slice(0, 5).join(", "));

    // Сторінка справді існує на диску, а не лише в переліку.
    const noPage = products.filter(p =>
        !fs.existsSync(path.join(ROOT, "p", p.slug, "index.html")));

    check("у кожного товару є згенерована сторінка",
        noPage.length === 0, noPage.map(p => p.slug).slice(0, 3).join(", "));
}

console.log("\n[2] Кожна активна акція у sitemap");
{
    const promos = JSON.parse(read("data/promotions.json"));

    const inMap = new Set(locs.filter(l => l.includes("/promo?id="))
        .map(l => decodeURIComponent(l.replace(/.*\/promo\?id=/, ""))));

    const missing = promos.filter(p => !inMap.has(p.slug));

    check(`усі ${promos.length} акцій на місці`,
        missing.length === 0, missing.map(p => p.slug).join(", "));
}

console.log("\n[3] sitemap і noindex не перетинаються");
{
    // ТІЛЬКИ НА ПРОДІ. У тестовому середовищі apply-site-env.js
    // свідомо закриває noindex-ом УСІ сторінки — dev-копія не має
    // конкурувати з продом за ті самі запити. Там це не конфлікт, а
    // задум, тож правило перевіряємо на індексованому середовищі.
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const noindex = pages.filter(f => /name="robots"[^>]*content="[^"]*noindex/.test(read(f)));

    // Адреса в sitemap → який файл її віддає.
    const served = loc => {

        const url = loc.replace(SITE, "").split("?")[0];

        if (url === "/") return "index.html";

        if (url.startsWith("/p/")) return null;      // згенерована сторінка товару

        if (url === "/promo") return "promo.html";

        return url.replace(/^\//, "") + ".html";

    };

    const conflict = locs
        .map(loc => ({ loc, file: served(loc) }))
        .filter(x => x.file && noindex.includes(x.file));

    if (env.indexable !== false) {

        check("жодна адреса з sitemap не віддається noindex-сторінкою",
            conflict.length === 0,
            [...new Set(conflict.map(c => c.file))].join(", "));

    } else {

        // Дзеркальна перевірка для dev: закрите МАЄ бути закритим.
        // Відкрита тестова копія — це дублікат усього каталогу в
        // індексі, і зводиться він місяцями.
        const open = locs.map(loc => ({ loc, file: served(loc) }))
            .filter(x => x.file && !noindex.includes(x.file));

        check("на тестовому середовищі закриті всі сторінки з sitemap",
            open.length === 0,
            [...new Set(open.map(c => c.file))].join(", "));

    }

    // І дзеркально: службові сторінки в sitemap не потрапляють.
    const service = ["cart", "checkout", "favorites", "thanks", "account"];

    check("службові сторінки в sitemap не потрапили",
        !locs.some(l => service.some(s => l.includes("/" + s))),
        locs.filter(l => service.some(s => l.includes("/" + s))).join(", "));
}

console.log("\n[3b] Перемикач середовища живий");
{
    // Уся різниця між dev і продом тримається на одному кроці збірки.
    // Зламається він — або тестова копія піде в індекс, або прод
    // закриється від пошуку, і обидва випадки тихі.
    const applier = read("scripts/apply-site-env.js");

    check("noindex ставиться саме за INDEXABLE",
        /if \(INDEXABLE\) return stripped/.test(applier));

    // Порядок саме такий: спершу noindex знімається З УСІХ сторінок, і
    // лише потім повертається, якщо середовище закрите. Інакше
    // перемикання dev → прод лишало б мітку там, де вона вже стояла.
    const flat = applier.replace(/\s+/g, " ");

    check("на проді noindex знімається з розмітки",
        /\.replace\(.{0,80}?robots.{0,40}?noindex,nofollow.{0,10}?\/g, ""\)/.test(flat));

    check("на закритому середовищі мітка повертається",
        /return stripped\.replace\(\/<head>\/i/.test(flat));

    check("середовища описані в site.config.json",
        config.production.indexable === true && config.development.indexable === false);

    check("прод і тест — різні домени",
        config.production.url !== config.development.url);
}

console.log("\n[4] Canonical є там, куди кличе sitemap");
{
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    // Статичні сторінки з sitemap — canonical просто в розмітці.
    const statics = locs
        .filter(l => !l.includes("/p/") && !l.includes("?"))
        .map(l => {
            const url = l.replace(SITE, "");
            return url === "/" ? "index.html" : url.replace(/^\//, "") + ".html";
        })
        .filter(f => pages.includes(f));

    const noCanonical = statics.filter(f => !/<link rel="canonical"/.test(read(f)));

    check(`усі ${statics.length} статичних сторінок мають canonical`,
        noCanonical.length === 0, noCanonical.join(", "));

    // Сторінки товарів — генеруються, тож перевіряємо всі.
    const dir = path.join(ROOT, "p");

    const dirs = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory());

    const badProduct = dirs.filter(d =>
        !/<link rel="canonical"/.test(fs.readFileSync(path.join(dir, d, "index.html"), "utf8")));

    check(`усі ${dirs.length} сторінок товарів мають canonical (разом із редіректами)`,
        badProduct.length === 0, badProduct.slice(0, 3).join(", "));

    // Акція малюється з JS — canonical ставить updatePromoSeoMetadata.
    check("акція ставить canonical з promo.js",
        /setCanonical\(pageUrl\)/.test(read("assets/js/promo.js")));

    check("товар за старою адресою ?id= теж ставить canonical",
        /setCanonical\(/.test(read("assets/js/product.js")));
}

console.log("\n[5] Canonical вказує на себе, а не кудись");
{
    const dir = path.join(ROOT, "p");

    const dirs = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory());

    const products = new Set(JSON.parse(read("data/products.json")).map(p => p.slug));

    const wrong = [];

    dirs.forEach(d => {

        const html = fs.readFileSync(path.join(dir, d, "index.html"), "utf8");

        const href = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || "";

        // Справжня сторінка вказує на себе; кирилична заглушка — на
        // латинську адресу, куди й перекидає.
        const expected = products.has(d) ? `${SITE}/p/${d}/` : null;

        if (expected && href !== expected) wrong.push(`${d}: ${href}`);

        if (!expected && !href.startsWith(`${SITE}/p/`)) wrong.push(`${d}: ${href}`);

    });

    check("canonical кожної сторінки товару вказує на правильну адресу",
        wrong.length === 0, wrong.slice(0, 3).join(" | "));
}

console.log("\n[6] robots.txt відповідає середовищу");
{
    const indexable = env.indexable !== false;

    check(`sitemap оголошено (${SITE}/sitemap.xml)`,
        robots.includes(`Sitemap: ${SITE}/sitemap.xml`), robots.split("\n").pop());

    if (indexable) {

        check("прод відкритий для пошуку", /^\s*Allow:\s*\/\s*$/m.test(robots));

        check("повного Disallow: / на проді немає", !/^\s*Disallow:\s*\/\s*$/m.test(robots));

        // Службові сторінки закриті — вміст у них особистий.
        ["/admin/", "/account", "/cart", "/checkout", "/favorites", "/thanks"]
            .forEach(p => check(`закрито ${p}`, robots.includes(`Disallow: ${p}`)));

    } else {

        // Тестове середовище має бути закрите ПОВНІСТЮ: інакше dev-копія
        // конкурує з продом за ті самі запити.
        check("тестове середовище закрите повністю", /^\s*Disallow:\s*\/\s*$/m.test(robots));

        check("і не відкрите випадково", !/^\s*Allow:\s*\/\s*$/m.test(robots));

    }
}

console.log("\n[7] Адреси в sitemap коректні");
{
    check("усі адреси на домені середовища",
        locs.every(l => l.startsWith(SITE)),
        locs.find(l => !l.startsWith(SITE)));

    check("кирилиці в адресах немає",
        !locs.some(l => /[а-яіїєґ]/i.test(l)),
        locs.find(l => /[а-яіїєґ]/i.test(l)));

    check("дублів немає", new Set(locs).size === locs.length,
        locs.length - new Set(locs).size);

    check("XML валідний за структурою",
        sitemap.trim().startsWith("<?xml") && sitemap.includes("</urlset>")
        && (sitemap.match(/<url>/g) || []).length === locs.length);

    // Ліміт Google — 50 000 адрес на файл. Далеко, але мовчазне
    // перевищення означало б, що половина каталогу просто не в індексі.
    check(`адрес ${locs.length}, ліміт 50 000 не перевищено`, locs.length <= 50000);
}

console.log("\n[8] Збірка sitemap запускається сама");
{
    // Товар додають в адмінці — вона комітить у data/products/**.
    // Якщо workflow не слухає цей шлях, sitemap лишиться вчорашнім, і
    // новий товар не потрапить в індекс, доки хтось не збере руками.
    const dev = read(".github/workflows/build-dev.yml");
    const prod = read(".github/workflows/build-products.yml");

    check("dev перезбирається на зміни в data/**", /- "data\/\*\*"/.test(dev));

    check("прод перезбирається на зміни в data/**", /- "data\/\*\*"/.test(prod));

    check("dev-збірка кличе повний npm run build", /npm run build\b/.test(dev));

    check("прод-збірка будує sitemap",
        /build-sitemap\.js/.test(prod) || /npm run build\b/.test(prod));

    // build-sitemap.js має лишатись у ланцюжку npm run build — інакше
    // локальна збірка мовчки лишить sitemap старим.
    check("sitemap у ланцюжку npm run build",
        /build-sitemap\.js/.test(read("package.json")));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
