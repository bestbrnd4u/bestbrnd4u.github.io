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
    const all = JSON.parse(read("data/promotions.json"));

    // «АКТИВНА» — ЦЕ НЕ «БУДЬ-ЯКА З ФАЙЛУ».
    //
    // Заголовок набору казав «активна», а порівнювався весь файл
    // підряд. Збірка ж викидає з sitemap ті, у яких минув endsAt
    // (ended() у scripts/build-sitemap.js) — і це правильно: віддавати
    // пошуку сторінку акції, якої вже немає, означає вести людей на
    // «пропозиція завершилась».
    //
    // Тобто набір червонів не через поломку, а через календар: акція
    // «Ціна до пʼятниці» закінчилась, збірка її прибрала, а перевірка
    // й далі шукала. Умова тут мусить бути та сама, що у збірці.
    const now = Date.now();

    const ended = promo => {

        const endsAt = Date.parse(promo && promo.endsAt);

        return Number.isFinite(endsAt) && now >= endsAt;

    };

    const promos = all.filter(p => !ended(p));

    const inMap = new Set(locs.filter(l => l.includes("/promo?id="))
        .map(l => decodeURIComponent(l.replace(/.*\/promo\?id=/, ""))));

    const missing = promos.filter(p => !inMap.has(p.slug));

    check(`усі ${promos.length} активних акцій на місці`
        + (all.length > promos.length ? ` (${all.length - promos.length} завершених пропущено)` : ""),
        missing.length === 0, missing.map(p => p.slug).join(", "));

    // І навпаки: завершеної акції в sitemap бути не повинно.
    const stale = all.filter(p => ended(p) && inMap.has(p.slug));

    check("завершених акцій у sitemap немає",
        stale.length === 0, stale.map(p => p.slug).join(", "));
}

console.log("\n[3] sitemap і noindex не перетинаються");
{
    // ТІЛЬКИ НА ПРОДІ. У тестовому середовищі apply-site-env.js
    // свідомо закриває noindex-ом УСІ сторінки — dev-копія не має
    // конкурувати з продом за ті самі запити. Там це не конфлікт, а
    // задум, тож правило перевіряємо на індексованому середовищі.
    // Читаємо КОЖЕН файл, на який вказує sitemap, а не заздалегідь
    // складений перелік кореневих сторінок.
    //
    // ЩО БУЛО НЕ ТАК. Перелік будувався з readdirSync(ROOT), тобто
    // бачив лише *.html у корені. Сторінки товарів сюди не потрапляли
    // взагалі (served() віддавав для них null), а щойно з'явились
    // /brands/coach/ і /categories/…/ — перевірка почала вважати їх
    // «відкритими» просто тому, що не знайшла файлів. Тобто мовчки
    // перевіряла не те.
    const noindexFile = file => {

        const full = path.join(ROOT, file);

        return fs.existsSync(full)
            && /name="robots"[^>]*content="[^"]*noindex/.test(fs.readFileSync(full, "utf8"));

    };

    // Адреса в sitemap → який файл її віддає.
    const served = loc => {

        const url = loc.replace(SITE, "").split("?")[0];

        if (url === "/") return "index.html";

        // Згенеровані сторінки — теж файли, і теж мусять слухатись
        // середовища: саме через них dev-копія найлегше потрапляє в
        // індекс (їх сотні, і на кожну є посилання з sitemap).
        if (url.startsWith("/p/")) return url.replace(/^\//, "") + "index.html";

        if (url === "/promo") return "promo.html";

        // Сторінки брендів і категорій — теж теки з index.html
        // (/brands/coach/), а не файли поруч із коренем. Без цього
        // рядка тест шукав би «brands/coach/.html» і не знаходив
        // нічого — тобто мовчки перевіряв би порожнечу.
        if (url.endsWith("/")) return url.replace(/^\//, "") + "index.html";

        return url.replace(/^\//, "") + ".html";

    };

    const conflict = locs
        .map(loc => ({ loc, file: served(loc) }))
        .filter(x => x.file && noindexFile(x.file));

    if (env.indexable !== false) {

        check("жодна адреса з sitemap не віддається noindex-сторінкою",
            conflict.length === 0,
            [...new Set(conflict.map(c => c.file))].join(", "));

    } else {

        // Дзеркальна перевірка для dev: закрите МАЄ бути закритим.
        // Відкрита тестова копія — це дублікат усього каталогу в
        // індексі, і зводиться він місяцями.
        const open = locs.map(loc => ({ loc, file: served(loc) }))
            .filter(x => x.file && !noindexFile(x.file));

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

console.log("\n[4b] Картка посилання є в кожної сторінки з sitemap");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    // ---------------
    // Коли покупець кидає посилання в Telegram, Viber чи Instagram,
    // розгортається картка з og:title, og:description і og:image.
    // Немає картинки — буде голий рядок тексту, і посилання виглядає
    // як спам.
    //
    // Заміряно 24.09.2026: із 147 індексованих сторінок картки не мали
    // сім. Серед них — каталог, контакти й три хаби, але найгірший
    // випадок був зі СТОРІНКОЮ АКЦІЇ.
    //
    // Акція малюється з JS, і теги їй ставив promo.js. У браузері все
    // виглядало правильно, тому й не помічалось. Але павуки
    // месенджерів JS НЕ ВИКОНУЮТЬ — вони беруть те, що віддав сервер,
    // а сервер віддавав нуль тегів. Тобто саме ті посилання, які
    // магазин розсилає покупцям, розгортались порожніми.
    //
    // Тому перевірка дивиться на РОЗМІТКУ ФАЙЛУ, а не на те, що
    // вийшло б у браузері.
    const ogOf = (html, prop) => {
        const hit = html.match(
            new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i"));
        return hit ? hit[1] : "";
    };

    const rootPages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    // Адреса з sitemap → файл на диску.
    const fileFor = loc => {
        const url = loc.replace(SITE, "").split("?")[0];
        if (url === "/") return "index.html";
        if (url.endsWith("/")) return url.replace(/^\//, "") + "index.html";
        const flat = url.replace(/^\//, "") + ".html";
        return rootPages.includes(flat) ? flat : null;
    };

    const targets = [...new Set(locs.map(fileFor))]
        .filter(Boolean)
        .filter(f => fs.existsSync(path.join(ROOT, f)));

    const noImage = [];
    const noTitle = [];
    const brokenImage = [];

    targets.forEach(f => {

        const html = read(f);

        const image = ogOf(html, "og:image");
        const title = ogOf(html, "og:title");

        if (!title) noTitle.push(f);

        if (!image) { noImage.push(f); return; }

        // Картинка мусить існувати: месенджер по ній ходить сам, і
        // 404 для нього те саме, що її відсутність.
        const local = image.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0];
        const onDisk = path.join(ROOT, decodeURIComponent(local).replace(/^\//, ""));

        if (!fs.existsSync(onDisk)) brokenImage.push(`${f} → ${local}`);

    });

    check(`сторінок із sitemap знайдено — ${targets.length}`, targets.length > 10, targets.length);

    check("у кожної є og:title", noTitle.length === 0, noTitle.slice(0, 4).join(", "));

    check("у кожної є og:image", noImage.length === 0, noImage.slice(0, 4).join(", "));

    check("і кожна картинка справді лежить на місці",
        brokenImage.length === 0, brokenImage.slice(0, 3).join("; "));

    // СТОРІНКА АКЦІЇ — ОКРЕМО.
    //
    // У sitemap вона стоїть як /promo?id=<slug>, тобто всі акції
    // ведуть на ОДИН файл. Перевіряємо саме той файл: у ньому мусить
    // лежати запасна картка на випадок, коли JS не виконали.
    const promo = read("promo.html");

    check("promo.html має запасну картку в самій розмітці",
        Boolean(ogOf(promo, "og:image")) && Boolean(ogOf(promo, "og:title")),
        "павук месенджера JS не виконує");

    // …а og:url у ній навмисно немає: файл один на всі акції, і
    // статична адреса «/promo» показала б у картці посилання не на ту
    // акцію, яку надіслали. Правильну ставить promo.js.
    check("і не називає адресу однієї акції за всі",
        !ogOf(promo, "og:url"), ogOf(promo, "og:url"));

    check("а конкретну акцію підписує вже promo.js",
        /setMetaByProperty\("og:title"/.test(read("assets/js/promo.js"))
        && /setMetaByProperty\("og:image"/.test(read("assets/js/promo.js")));
}

console.log("\n[4c] Доріжку бачить не лише людина, а й Google");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    // ---------------
    // З розмітки BreadcrumbList Google малює шлях у результатах
    // пошуку замість голої адреси. Заміряно 25.09.2026: 130+
    // згенерованих сторінок її мали — товари, бренди, категорії,
    // розділи, — а з десяти індексованих сторінок у корені не мала
    // ЖОДНА. Доріжка на них була, але тільки для ока.
    //
    // Діра рівно там, де сторінку пише людина, а не скрипт: обидва
    // генератори кличуть Breadcrumbs.toJsonLd(), а руками про це
    // забували.
    //
    // ЧОМУ ЗВІРЯЄМО З ВИДИМОЮ ДОРІЖКОЮ, А НЕ ПРОСТО «ЧИ Є».
    // Другий перелік ланок розійшовся б із тим, що на сторінці, і
    // Google показував би шлях, якого немає. Тому джерело одне — та
    // сама розмітка, і тест бере її тим самим кодом, що й збірка.
    const { trailOf } = require("../scripts/build-breadcrumb-schema.js");

    const pages = fs.readdirSync(ROOT).filter(file => file.endsWith(".html"));

    const без = [];
    const розбіжні = [];
    let перевірено = 0;

    pages.forEach(file => {

        const html = read(file);

        // Власний robots — ОСТАННІЙ: перший додає dev-збірка.
        const robots = [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map(m => m[1]);
        const свій = robots.length ? robots[robots.length - 1] : "index,follow";

        if (/noindex/.test(свій)) return;

        const trail = trailOf(html);

        if (!trail) return;          // доріжки немає — нічого й вимагати

        перевірено += 1;

        const hit = html.match(/id="breadcrumbSchema">([\s\S]*?)<\/script>/);

        if (!hit) { без.push(file); return; }

        let назви;
        try {
            назви = JSON.parse(hit[1]).itemListElement.map(item => item.name);
        } catch (error) {
            розбіжні.push(`${file}: розмітка не розбирається — ${error.message}`);
            return;
        }

        const видимі = trail.map(crumb => crumb.label);

        if (JSON.stringify(назви) !== JSON.stringify(видимі)) {
            розбіжні.push(`${file}: розмітка «${назви.join(" / ")}» проти видимої «${видимі.join(" / ")}»`);
        }

    });

    check(`сторінок із доріжкою — ${перевірено}`, перевірено >= 8, перевірено);

    check("у кожної є BreadcrumbList", без.length === 0, без.join(", "));

    check("і він слово в слово повторює видиму доріжку",
        розбіжні.length === 0, розбіжні.slice(0, 3).join("; "));

    // Кнопка «Назад» — навігація, а не ланка шляху. Її текст —
    // «&lsaquo; Назад», і порівняння з голим «Назад» її не ловило:
    // стрілка потрапляла в розмітку першою ланкою.
    const builder = read("scripts/build-breadcrumb-schema.js");

    check("кнопка «Назад» у доріжку не потрапляє",
        /\/Назад\/i\.test\(label\)/.test(builder)
        && /&\[a-z\]\+;/.test(builder));

    // Крок мусить бути в збірці, інакше нова сторінка знову лишиться
    // без розмітки.
    check("крок вбудований у npm run build",
        /build-breadcrumb-schema\.js/.test(read("package.json")));

    // ЖОДНОГО ЗАДВОЄННЯ, І ЦЕ ОКРЕМА БІДА.
    //
    // catalog.html і product.html — водночас сторінки Й ШАБЛОНИ.
    // Відколи розмітку доріжки будує окремий крок, шаблон приходить
    // до генератора вже з нею — і кожна згенерована сторінка діставала
    // ДВА блоки: чужий із шаблону й свій, правильний.
    //
    // Для Google два BreadcrumbList на сторінці — суперечність: він
    // або ігнорує обидва, або бере не той. Заміряно 25.09.2026:
    // задвоєння на всіх 103 сторінках товарів і 33 таксономії, і воно
    // встигло потрапити в гілку. Лікує вирізання успадкованої розмітки
    // в buildTemplate() обох генераторів.
    const усі = [];

    const обхід = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
        .forEach(entry => {
            if (["node_modules", ".git", "supabase", "admin"].includes(entry.name)) return;
            const next = dir === "." ? entry.name : `${dir}/${entry.name}`;
            if (entry.isDirectory()) обхід(next);
            else if (entry.name.endsWith(".html")) усі.push(next);
        });

    обхід(".");

    const задвоєні = [];

    усі.forEach(file => {

        const html = fs.readFileSync(path.join(ROOT, file), "utf8");

        const ids = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*id="([^"]+)"/g)]
            .map(m => m[1]);

        const повтори = ids.filter((id, i) => ids.indexOf(id) !== i);

        if (повтори.length) задвоєні.push(`${file}: ${[...new Set(повтори)].join(", ")}`);

    });

    check(`сторінок перевірено на задвоєння — ${усі.length}`, усі.length > 100, усі.length);

    check("жодна сторінка не має двох однакових блоків розмітки",
        задвоєні.length === 0, задвоєні.slice(0, 4).join("; "));

    // І причина, чому задвоєння взагалі можливе: шаблон несе розмітку.
    // Обидва генератори мусять її вирізати.
    ["scripts/build-product-pages.js", "scripts/build-taxonomy-pages.js"].forEach(rel => {
        check(`${path.basename(rel)} вирізає розмітку шаблону`,
            /breadcrumbSchema\|productSchema\|collectionSchema/.test(read(rel)),
            "інакше згенерована сторінка успадкує чужий BreadcrumbList");
    });
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

console.log("\n[6a] Закрита сторінка закрита сама, а не лише в robots.txt");
{
    // ДВІ РІЗНІ ЗАБОРОНИ, І ОДНА З НИХ ЗНИКАЄ НА ПРОДІ.
    //
    // scripts/apply-site-env.js додає <meta robots="noindex,nofollow">
    // УСЬОМУ дев-середовищу — і прибирає його під час продової
    // збірки. Тому сторінка, у якої свого тега немає, на деві
    // виглядає закритою, а на бойовому сайті відкрита.
    //
    // robots.txt це не рятує: Disallow забороняє ОБХІД, а не показ.
    // Якщо на адресу десь поставлять посилання, Google має право
    // показати її в результатах — без опису, самим рядком адреси.
    // Для /thanks це номер замовлення, для /newsletter-confirm —
    // токен чужої підписки.
    //
    // Саме на цьому впав синк 14.09.2026: сторінка підтвердження
    // підписки пройшла тести локально (дев-збірка) і провалилась у
    // CI (прод-збірка).
    //
    // СПИСОК БЕРЕМО ЗІ СКРИПТА, А НЕ ПИШЕМО РУКАМИ. Інакше наступна
    // закрита сторінка додасться в robots.txt, а сюди — ні, і
    // перевірка мовчки перестане її стерегти.
    const envScript = read("scripts/apply-site-env.js");

    const closed = [...envScript.matchAll(/"Disallow: (\/[^"]*)"/g)]
        .map(m => m[1])
        // /admin/ — тека, а не сторінка; її власні noindex стережуть
        // окремі набори (test-admin-orders-panel, -reviews-panel).
        .filter(p => !p.endsWith("/"))
        .map(p => p.replace(/^\//, "") + ".html");

    check(`закритих сторінок у списку: ${closed.length}`, closed.length >= 5, closed.join(" "));

    closed.forEach(file => {

        const full = path.join(ROOT, file);

        if (!fs.existsSync(full)) {
            check(`${file} існує`, false);
            return;
        }

        // Саме «noindex,follow» — тег, який переживає обидві збірки.
        // «noindex,nofollow» тут не рахується: його ставить і знімає
        // сама збірка.
        check(`${file} має власний noindex`,
            /<meta name="robots" content="noindex,follow">/.test(read(file)),
            (read(file).match(/<meta name="robots"[^>]*>/g) || ["немає жодного"]).join(" | "));

    });
}

console.log("\n[6b] Пошуковики дізнаються про новину самі");
{
    // sitemap відповідає на «що є на сайті», але не на «коли про це
    // дізнаються». Друге — IndexNow, і в нього своя тиха точка збою:
    // файл із ключем. Немає його в корені — пошуковик відповідає 403,
    // і видно це лише в логах через тиждень.
    const key = config.indexNowKey;

    check("ключ IndexNow заданий", !!key && /^[a-zA-Z0-9-]{8,128}$/.test(key), key);

    check(`файл ${key}.txt на місці`, fs.existsSync(path.join(ROOT, `${key}.txt`)));

    check("у файлі рівно ключ",
        fs.existsSync(path.join(ROOT, `${key}.txt`))
        && read(`${key}.txt`).trim() === key);

    // Крок є в обох збірках, які випускають прод. Товар з адмінки їде
    // dev -> main перенесенням, тож без другого кроку про нього не
    // дізнався б ніхто.
    check("прод-збірка повідомляє пошуковики",
        /ping-indexnow\.js/.test(read(".github/workflows/build-products.yml")));

    check("перенесення dev -> main теж",
        /ping-indexnow\.js/.test(read(".github/workflows/sync-branches.yml")));

    // Подробиці протоколу — у tests/test-indexnow.js.
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
