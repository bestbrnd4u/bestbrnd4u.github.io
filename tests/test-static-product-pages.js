// Статичні сторінки товарів p/<slug>/index.html.
//
// Це те, що Googlebot читає на ПЕРШОМУ проході — до того, як дійде
// черга рендерити JS (на нових сайтах це тижні). Тому набір перевіряє
// не «чи є розмітка взагалі», а чи сторінка самодостатня без жодного
// рядка JS: свій заголовок, свій опис, свій canonical, назва товару
// в тексті, фото з alt, ціна.
//
// Окремо стережемо дві речі, які ламаються найтихіше:
//   • відносні шляхи. Шаблон product.html писався для сторінки в
//     корені, а тут вона на два рівні глибше — без переписування
//     шляхів і <base href="/"> сторінка лишиться без стилів і без
//     даних, і зовні це буде видно тільки на самій /p/… адресі;
//   • розсинхрон посилань. Якщо каталог веде на /product?id=, а
//     canonical каже /p/<slug>/, Google бачить дві адреси одного
//     товару і ділить між ними сигнали.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

// Прибирання за собою.
//
// Цей набір запускає СПРАВЖНІ збірочні скрипти в корені репозиторію —
// інакше перевірялась би копія логіки, а не сама логіка. Але скрипти
// пишуть у робоче дерево, і без цього рядка після `npm test` там
// лишався хвіст змінених файлів: шум у git status, невірний штамп
// версії в сторінках і вплив на сусідні набори.
//
// Знімок повернеться на місце сам, коли процес завершиться, —
// байт у байт, навіть якщо тест упаде.
require("./helpers/workspace").guardBuildOutputs(ROOT);
const PAGES_DIR = path.join(ROOT, "p");
// домен береться з site.config.json — інакше тест ламається
// при кожній зміні домену (див. scripts/site-env.js)
// Беремо адресу того середовища, у якому дерево ЗІБРАНЕ, а не з
// SITE_ENV: без змінної site-env.js віддає production, і на гілці
// dev перевірки canonical падали завжди (див. tests/helpers/tree-env.js).
const { treeSiteEnv, childEnv } = require("./helpers/tree-env");
const { SITE_URL } = treeSiteEnv();

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// вихідні файли товарів, а не згенерований агрегат
// (правило з tests/test-migration-types.js)
const products = fs.readdirSync(path.join(ROOT, "data/products"))
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "data/products", f), "utf8")))
    .filter(p => typeof p.id === "number" && p.slug)
    .sort((a, b) => a.id - b.id);

const pageFor = slug => path.join(PAGES_DIR, slug, "index.html");
const readPage = slug => fs.readFileSync(pageFor(slug), "utf8");

console.log("\n[1] Сторінка є в кожного товару і зайвих немає");
{
    check("тека p/ існує", fs.existsSync(PAGES_DIR));

    const missing = products.filter(p => !fs.existsSync(pageFor(p.slug)));
    check(`усі ${products.length} товарів мають сторінку`, missing.length === 0,
        missing.map(p => p.slug).join(", "));

    // Крім самих товарів, у p/ лежать перенаправлення зі старих
    // кириличних адрес (legacySlugs — див. scripts/translit.js). Це не
    // сироти: адреси вже пішли в пости й у пошуковий індекс, і кожна
    // мусить приводити на нову.
    const knownSlugs = new Set(products.map(p => p.slug));
    const legacySlugs = new Set(products.flatMap(p => p.legacySlugs || []));

    const orphans = fs.readdirSync(PAGES_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory() && !knownSlugs.has(e.name) && !legacySlugs.has(e.name))
        .map(e => e.name);

    // сторінка видаленого товару = вічний 200 OK на неіснуючий товар
    check("немає сторінок товарів, яких уже немає в каталозі",
        orphans.length === 0, orphans.join(", "));

    const безСторінки = [...legacySlugs].filter(slug => !fs.existsSync(pageFor(slug)));

    check("кожна стара адреса має перенаправлення",
        безСторінки.length === 0, безСторінки.slice(0, 3).join(", "));
}

console.log("\n[2] Кожна сторінка самодостатня без JS");
{
    const sample = products[0];
    const dom = new JSDOM(readPage(sample.slug));
    const { document } = dom.window;

    const title = document.title;
    check("title містить назву товару", title.includes(sample.title), title);
    check("title не шаблонний", title !== "Товар | BestBrnd4u");

    const desc = document.querySelector('meta[name="description"]');
    check("є meta description", !!desc && desc.content.length > 20);
    check("description не довший за 160 символів", (desc.content || "").length <= 160,
        (desc.content || "").length);

    const canonical = document.querySelector('link[rel="canonical"]');
    check("canonical веде на цю ж адресу",
        canonical && canonical.href === `${SITE_URL}/p/${encodeURIComponent(sample.slug)}/`,
        canonical && canonical.href);

    check("рівно один canonical",
        document.querySelectorAll('link[rel="canonical"]').length === 1);
    check("рівно один <title>",
        document.querySelectorAll("title").length === 1);

    check("є <h1> з назвою товару",
        document.querySelector("h1") && document.querySelector("h1").textContent.trim() === sample.title,
        document.querySelector("h1") && document.querySelector("h1").textContent.trim());

    check("рівно один <h1>", document.querySelectorAll("h1").length === 1);

    check("опис товару є в тексті сторінки",
        !sample.description || document.body.textContent.includes(sample.description.slice(0, 40)));

    check("ціна є в тексті сторінки",
        /\d/.test(document.querySelector(".product-static-price").textContent));

    const imgs = [...document.querySelectorAll(".product-static-gallery img")];
    check("фото товару в розмітці", imgs.length > 0, imgs.length);
    check("у кожного фото є alt", imgs.every(i => (i.getAttribute("alt") || "").length > 3));
    check("перше фото не lazy (це LCP-картинка)",
        imgs[0].getAttribute("loading") === "eager", imgs[0].getAttribute("loading"));
}

console.log("\n[3] Шляхи не ламаються на глибині /p/<slug>/");
{
    const html = readPage(products[0].slug);
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const base = document.querySelector("base");
    check('є <base href="/"> — інакше fetch("data/…") з JS піде в /p/<slug>/data/…',
        base && base.getAttribute("href") === "/", base && base.getAttribute("href"));

    check("<base> стоїть перед першим href/src у документі",
        html.indexOf("<base") < html.search(/<(?:link|script|img|a)\b[^>]*(?:href|src)=/i),
        `${html.indexOf("<base")} vs ${html.search(/<(?:link|script|img|a)\b[^>]*(?:href|src)=/i)}`);

    // навіть якби <base> прибрали, статична розмітка має лишитись робочою
    const relative = (html.match(/\s(?:href|src)="(?!https?:|\/\/|\/|#|mailto:|tel:|data:|javascript:)[^"]*"/g) || []);
    check("у розмітці не лишилось відносних href/src", relative.length === 0,
        relative.slice(0, 3).join(" | "));

    // ?v=<відбиток> у кінці — це версія файлу, яку проставляє
    // scripts/apply-cache-version.js. Без неї браузер віддавав би
    // стару копію після викладки, і людям доводилось чистити кеш.
    check("стилі підключені з кореня",
        /href="\/assets\/css\/style\.css(\?v=[a-f0-9]+)?"/.test(html));
    check("product.js підключений з кореня",
        /src="\/assets\/js\/product\.js(\?v=[a-f0-9]+)?"/.test(html));

    // Наявність самої версії тут НЕ перевіряємо навмисно.
    //
    // Цей набір далі перезбирає сторінки товарів (перевірка
    // ідемпотентності), а версії проставляє окремий крок збірки, який
    // виконується після. Тобто стан сторінок тут залежить від порядку
    // тестів — і перевірка червоніла б через сусідів, а не через
    // помилку. Версії перевіряє tests/test-cache-busting.js, який сам
    // керує своїм станом.
}

console.log("\n[4] Структуровані дані Product");
{
    const sample = products.find(p => p.sku) || products[0];
    const dom = new JSDOM(readPage(sample.slug));
    const ld = JSON.parse(dom.window.document.getElementById("productSchema").textContent);

    check("@type = Product", ld["@type"] === "Product");
    check("name = назва товару", ld.name === sample.title);
    check("усі image[] абсолютні",
        ld.image.length > 0 && ld.image.every(u => /^https?:\/\//.test(u)));
    check("offers.url = канонічна адреса",
        ld.offers.url === `${SITE_URL}/p/${encodeURIComponent(sample.slug)}/`, ld.offers.url);
    check("offers.price — число", typeof ld.offers.price === "number");
    check("offers.priceCurrency = UAH", ld.offers.priceCurrency === "UAH");
    check("itemCondition проставлено", !!ld.offers.itemCondition);

    const bread = JSON.parse(dom.window.document.getElementById("breadcrumbSchema").textContent);

    // Доріжка тепер повна: Головна → Каталог → Стать → Відділ →
    // Категорія → Бренд → Товар. Товар — завжди ОСТАННЯ ланка, а не
    // третя, як було в короткому варіанті.
    const last = bread.itemListElement[bread.itemListElement.length - 1];

    check("хлібні крихти ведуть на канонічну адресу",
        last.item === `${SITE_URL}/p/${encodeURIComponent(sample.slug)}/`, last.item);
    check("товар — остання ланка доріжки", last.name === sample.title);
    check("позиції нумеруються поспіль з 1",
        bread.itemListElement.every((c, i) => c.position === i + 1));
    check("доріжка глибша за короткий варіант",
        bread.itemListElement.length > 3, bread.itemListElement.length);
}

console.log("\n[5] aggregateRating — лише там, де рейтинг справжній");
{
    // вигадана розмітка рейтингу — пряма причина ручних санкцій Google
    const offenders = [];

    products.forEach(p => {
        const ld = JSON.parse(new JSDOM(readPage(p.slug))
            .window.document.getElementById("productSchema").textContent);

        const hasMarkup = !!ld.aggregateRating;
        const hasData = !!(p.rating && p.reviews);

        if (hasMarkup && !hasData) offenders.push(p.slug);
    });

    check("жодного рейтингу без реальних відгуків у даних",
        offenders.length === 0, offenders.join(", "));
}

console.log("\n[6] Одна адреса на товар — без розсинхрону");
{
    const jsFiles = ["app.js", "cart.js", "checkout.js", "common.js", "favorites.js", "ui.js"];

    jsFiles.forEach(f => {
        const src = fs.readFileSync(path.join(ROOT, "assets/js", f), "utf8");
        check(`${f} не будує /product?id= напряму`,
            !/href="product\?id=|location\.href\s*=\s*`product\?/.test(src));
    });

    const ui = fs.readFileSync(path.join(ROOT, "assets/js/ui.js"), "utf8");
    // Суть перевірки — що назва це справжнє <a href> з адресою товару,
    // а не onclick. Точний вигляд виклику productUrl() змінюється:
    // тепер він несе ще й колір картки, бо в каталозі кожен колір
    // показується окремою карткою.
    check("назва в картці каталогу — справжнє <a href> (робот має по чому пройти)",
        /<a href="\$\{productUrl\(product[\s\S]*?\}"\s*\n?\s*class="product-title-link"/.test(ui));

    // І колір мусить бути в адресі: без нього клац по назві відкривав би
    // перший колір товару, а не той, що на картці.
    check("посилання несе колір картки",
        /productUrl\(product, product\.cardColor \? \{ color: product\.cardColor \} : null\)/.test(ui));

    const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
    check("у sitemap немає старих /product?id=", !sitemap.includes("/product?id="));

    const missingInSitemap = products.filter(
        p => !sitemap.includes(`${SITE_URL}/p/${encodeURIComponent(p.slug)}/`));
    check(`усі ${products.length} товарів у sitemap за канонічною адресою`,
        missingInSitemap.length === 0, missingInSitemap.map(p => p.slug).join(", "));
}

console.log("\n[7] Стара адреса ?id= не ламається, а веде на канонічну");
{
    const productJs = fs.readFileSync(path.join(ROOT, "assets/js/product.js"), "utf8");

    check("є ознака старої адреси", /const isLegacyUrl\s*=/.test(productJs));
    // між ознакою старої адреси й самим переходом тепер стоїть ще й
    // блок розмітки з коментарем, тож вікно пошуку більше за колишні 200
    check("зі старої адреси йде location.replace (без зайвого кроку в історії)",
        /isLegacyUrl[\s\S]{0,1400}location\.replace\(/.test(productJs));
    check("товар шукається і за slug, і за id",
        /find\(p => p\.slug === productSlug\)/.test(productJs)
        && /find\(p => p\.id === productId\)/.test(productJs));
    // Search Console перевіряє виправлення саме за старою адресою —
    // вона лишається в індексі. Робот не виконує location.replace, тож
    // якщо перекинути його раніше за розмітку, він побачить порожню
    // оболонку без canonical і без JSON-LD, і перевірка зупиниться з
    // «Affected pages were found». Порядок тут критичний.
    const legacyBlock = productJs.slice(
        productJs.indexOf("if (isLegacyUrl && product.slug)"),
        productJs.indexOf("if (isLegacyUrl && product.slug)") + 1400);

    check("розмітка проставляється ДО переходу зі старої адреси",
        legacyBlock.indexOf("updateProductSeoMetadata(product)") !== -1
        && legacyBlock.indexOf("updateProductSeoMetadata(product)")
           < legacyBlock.indexOf("location.replace("),
        "updateProductSeoMetadata має стояти перед location.replace");

    check("колір і розмір переносяться на нову адресу",
        /location\.replace\(productUrl\(product, \{[\s\S]{0,120}color[\s\S]{0,120}size/.test(productJs));
    // Через dataUrl(), щоб адреса несла версію файлу — інакше після
    // викладки сторінка товару тягла б старий каталог із кеша.
    check("product.js тягне каталог з кореня, а не відносно теки",
        /fetch\(dataUrl\("\/data\/products\.json"\)\)/.test(productJs));
}

console.log("\n[8] Генератор переживає повторний запуск і зміни каталогу");
{
    const { execFileSync } = require("child_process");
    const script = path.join(ROOT, "scripts/build-product-pages.js");

    const before = readPage(products[0].slug);
    execFileSync("node", [script], { cwd: ROOT, encoding: "utf8", env: childEnv() });
    const after = readPage(products[0].slug);

    // Порівнюємо БЕЗ версій файлів.
    //
    // Генератор створює сторінки без ?v= — версії проставляє окремий
    // крок збірки (scripts/apply-cache-version.js), який іде після.
    // Тому «до» тут версіоноване, а «після» — ні, і пряме порівняння
    // перевіряло б порядок кроків, а не ідемпотентність генератора.
    const stripVersions = html => html
        .replace(/\?v=[a-f0-9]+/g, "")
        .replace(/\s*<script>window\.ASSET_VERSIONS[\s\S]*?<\/script>/, "");

    check("повторний запуск не змінює сторінку (ідемпотентність)",
        stripVersions(before) === stripVersions(after));

    // сторінка-сирота має зникати сама, інакше видалений товар
    // назавжди лишиться в індексі
    const ghost = path.join(PAGES_DIR, "test-ghost-product");
    fs.mkdirSync(ghost, { recursive: true });
    fs.writeFileSync(path.join(ghost, "index.html"), "<html></html>");

    execFileSync("node", [script], { cwd: ROOT, encoding: "utf8", env: childEnv() });

    check("сторінка неіснуючого товару прибирається автоматично",
        !fs.existsSync(ghost));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
