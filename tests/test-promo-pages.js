// У кожної акції своя сторінка — бо картку посилання малює павук,
// який не виконує JavaScript.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Акція жила за адресою /promo?id=<slug>: один файл promo.html на
// всі, а назву, опис і картинку дописував скрипт у браузері.
//
// Для Google це працювало — він рендерить. А павук месенджера ні.
// Власник кидає посилання на акцію в Instagram чи Telegram, і в
// картці стоїть загальне «Акції | BestBrnd4u». Заміряно 07.10.2026
// curl-ом на проді, усі чотири адреси з sitemap:
//
//     og:title        Акції | BestBrnd4u
//     og:description  Акції та знижки BestBrnd4u
//     og:url          немає зовсім
//     h1              порожній
//
// І це найгірше місце з усіх: посилання на акцію живе саме в
// соцмережах.
//
// ЩО СТЕРЕЖЕМО ТУТ
// -----------------
// Не «скрипт існує», а те, що в кожної акції РІЗНІ теги й що старі
// посилання не впали. Друге не теорія: після першої ж збірки
// /promo?id=… почав віддавати 404, бо поруч з'явилась тека promo/ і
// хостинг пішов шукати в ній index.html.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const PromoMeta = require("../assets/js/promo-meta.js");
const { activePromos } = require("../scripts/build-promo-pages.js");

const PROMO_DIR = path.join(ROOT, "promo");

const читати = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const голова = html => {
    const d = new JSDOM(html).window.document;
    const prop = p => {
        const m = d.querySelector(`meta[property="${p}"]`);
        return m ? (m.getAttribute("content") || "").trim() : "";
    };
    return {
        title: ((d.querySelector("title") || {}).textContent || "").trim(),
        titleId: d.querySelector("title") ? d.querySelector("title").id : "",
        description: (() => {
            const m = d.querySelector('meta[name="description"]');
            return m ? (m.getAttribute("content") || "").trim() : "";
        })(),
        canonical: (() => {
            const l = d.querySelector('link[rel="canonical"]');
            return l ? (l.getAttribute("href") || "").trim() : "";
        })(),
        ogTitle: prop("og:title"),
        ogDescription: prop("og:description"),
        ogImage: prop("og:image"),
        ogUrl: prop("og:url"),
        twitter: (() => {
            const m = d.querySelector('meta[name="twitter:card"]');
            return m ? (m.getAttribute("content") || "").trim() : "";
        })(),
        h1: ((d.querySelector("h1") || {}).textContent || "").trim(),
        base: (() => {
            const b = d.querySelector("base");
            return b ? b.getAttribute("href") : "";
        })()
    };
};


console.log("\n[1] Сторінка є в кожної живої акції");
{
    const акції = activePromos();

    check("акції знайдено", акції.length > 0, String(акції.length));

    const без = акції.filter(p =>
        !fs.existsSync(path.join(PROMO_DIR, p.slug, "index.html")));

    check(`сторінка є в усіх ${акції.length}`, без.length === 0,
        без.map(p => p.slug).join(", "));

    // Акція, що скінчилась, сторінки не отримує: посилання вело б у
    // нікуди, а в індексі лишалась би обіцянка знижки, якої немає.
    const живі = new Set(акції.map(p => p.slug));

    const зайві = fs.readdirSync(PROMO_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory() && !живі.has(e.name))
        .map(e => e.name);

    check("сторінок скінчених акцій не лишилось", зайві.length === 0, зайві.join(", "));
}


console.log("\n[2] У кожної сторінки свої теги, а не спільні");
{
    const акції = activePromos();

    const сторінки = акції.map(p => ({
        slug: p.slug,
        promo: p,
        head: голова(читати(path.join("promo", p.slug, "index.html")))
    }));

    // ГОЛОВНЕ. Саме через це все й затівалось.
    const назви = new Set(сторінки.map(s => s.head.ogTitle));

    check("og:title різний у кожної акції",
        назви.size === сторінки.length,
        [...назви].join(" | "));

    const описи = new Set(сторінки.map(s => s.head.ogDescription));

    check("og:description теж різний", описи.size === сторінки.length,
        String(описи.size) + " різних на " + сторінки.length);

    сторінки.forEach(({ slug, promo, head }) => {

        const очікуваний = PromoMeta.promoTitle(promo);

        check(`${slug}: title — назва акції`, head.title === очікуваний,
            head.title + "  ≠  " + очікуваний);

        // id="pageTitle" зберігаємо: promo.js пише в нього назву,
        // коли сторінку відкрили старою адресою. Без нього сторінка
        // падала з «Cannot set properties of null» — заміряно.
        check(`${slug}: у <title> лишився id`, head.titleId === "pageTitle", head.titleId);

        check(`${slug}: og:url і canonical — власна адреса`,
            head.ogUrl.endsWith(PromoMeta.promoPath(slug))
            && head.canonical === head.ogUrl,
            head.canonical + " / " + head.ogUrl);

        check(`${slug}: h1 не порожній`, head.h1.length > 0, JSON.stringify(head.h1));

        check(`${slug}: картинка абсолютна`,
            /^https?:\/\//.test(head.ogImage), head.ogImage);

        // Без цього Twitter і Slack показують дрібну картинку збоку
        // замість широкої зверху.
        check(`${slug}: картка широка`,
            head.twitter === "summary_large_image", head.twitter);

        // Сторінка лежить у /promo/<slug>/, а скрипти будують шляхи
        // від кореня.
        check(`${slug}: <base href="/"> на місці`, head.base === "/", head.base);

        // Один og:title, а не два: шаблонні теги мусять бути вирізані.
        const html = читати(path.join("promo", slug, "index.html"));

        check(`${slug}: og:title рівно один`,
            (html.match(/property="og:title"/g) || []).length === 1,
            String((html.match(/property="og:title"/g) || []).length));

    });
}


console.log("\n[3] Старі посилання /promo?id= не впали");
{
    // ЦЕ НЕ ТЕОРІЯ. Після першої ж збірки /promo?id=<slug> почав
    // віддавати 404: поруч з'явилась тека promo/, і статичний хостинг
    // пішов шукати в ній index.html, якого не було.
    const файл = path.join(PROMO_DIR, "index.html");

    check("promo/index.html існує", fs.existsSync(файл));

    if (fs.existsSync(файл)) {

        const html = fs.readFileSync(файл, "utf8");

        check("він підключає promo.js", /assets\/js\/promo\.js/.test(html));

        // Своїх тегів у нього бути не може: яка саме акція — відомо
        // лише з ?id=. Тому й noindex: нова адреса має свою сторінку.
        const head = голова(html);

        check("не йде в індекс", /name="robots"[^>]*noindex/.test(html),
            (html.match(/<meta name="robots"[^>]*>/g) || []).join(" "));

        check("og:url чужої акції не обіцяє", head.ogUrl === "", head.ogUrl);

    }

    // Скрипт читає обидва джерела: window.PROMO_SLUG на новій адресі
    // й ?id= на старій.
    const promoJs = читати("assets/js/promo.js");

    check("скрипт читає і PROMO_SLUG, і ?id=",
        /window\.PROMO_SLUG \|\| params\.get\("id"\)/.test(promoJs));

    check("і переписує адресу на власну",
        /PromoMeta\.promoPath\(promo\.slug\)/.test(promoJs)
        && /replaceState/.test(promoJs));
}


console.log("\n[4] Правило адреси оголошене один раз");
{
    // Адресу акції будують чотири місця: сторінки, sitemap, посилання
    // на сайті й сам promo.js. Чотири копії розійшлись би на першій
    // зміні схеми — тож усі беруть її в PromoMeta.
    const споживачі = [
        "assets/js/app.js",
        "assets/js/promo-popup.js",
        "assets/js/promo.js",
        "scripts/build-sitemap.js",
        "scripts/build-promo-pages.js"
    ];

    споживачі.forEach(rel => {

        const src = читати(rel);

        check(`${rel}: бере адресу в PromoMeta`,
            /PromoMeta\.promoPath|promoPath\(/.test(src));

        // Своїх «promo?id=» більше бути не повинно — тобто ніхто не
        // БУДУЄ стару адресу.
        //
        // Один виняток, і він навмисний: обробник кліку в app.js
        // ловить селектором і стару форму — a[href^="promo?id="]. Він
        // її ЧИТАЄ, а не створює: посилання з давніх сторіс мають так
        // само потрапляти в статистику. Тому відкидаємо входження
        // всередині селектора.
        const будує = (src.replace(/a\[href\^="promo\?id="\]/g, "")
            .match(/["'`]promo\?id=/g) || []).length;

        check(`${rel}: стару адресу ніхто не будує`, будує === 0, String(будує));

    });

    // А на сторінках, де ці скрипти працюють, модуль мусить бути
    // підключений — інакше PromoMeta не існує й посилання не
    // намалюються зовсім.
    const сторінкиЗіСкриптами = fs.readdirSync(ROOT)
        .filter(f => f.endsWith(".html"))
        .filter(f => {
            const html = fs.readFileSync(path.join(ROOT, f), "utf8");
            return /assets\/js\/(app|promo-popup|promo)\.js/.test(html);
        });

    const без = сторінкиЗіСкриптами.filter(f => {
        const html = fs.readFileSync(path.join(ROOT, f), "utf8");
        return !html.includes("assets/js/promo-meta.js");
    });

    check(`модуль підключено на всіх ${сторінкиЗіСкриптами.length} сторінках`,
        без.length === 0, без.join(", "));

    // І ПЕРЕД тими, хто ним користується: скрипти з defer виконуються
    // у порядку тегів.
    const пізно = сторінкиЗіСкриптами.filter(f => {
        const html = fs.readFileSync(path.join(ROOT, f), "utf8");
        const свій = html.indexOf('src="assets/js/promo-meta.js');
        const перший = ["app", "promo-popup", "promo"]
            .map(n => html.indexOf('src="assets/js/' + n + '.js'))
            .filter(i => i >= 0)
            .sort((a, b) => a - b)[0];
        return свій >= 0 && перший >= 0 && свій > перший;
    });

    check("і стоїть перед ними", пізно.length === 0, пізно.join(", "));
}


console.log("\n[5] Sitemap показує нову адресу, а не стару");
{
    const xml = читати("sitemap.xml");

    const акції = activePromos();

    const старих = (xml.match(/promo\?id=/g) || []).length;

    check("старих адрес у sitemap немає", старих === 0, String(старих));

    const без = акції.filter(p => !xml.includes(PromoMeta.promoPath(p.slug)));

    check(`нові адреси є в усіх ${акції.length}`, без.length === 0,
        без.map(p => p.slug).join(", "));
}


console.log(failures === 0
    ? "\n✅ У кожної акції своя сторінка, і старі посилання живі\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
