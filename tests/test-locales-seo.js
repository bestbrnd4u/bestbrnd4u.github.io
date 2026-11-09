// Мовні версії, етап 4: що бачить пошук.
//
// ЗНАЙДЕНО 09.11.2026 на dev. Сторінка /en/p/… приходила з правильним
// canonical на себе, а після завантаження product.js ставив його заново
// — від SITE_URL, без мови. Тобто англійська сторінка сама оголошувала
// себе копією української, і Google (він виконує JS) мав би викинути її
// з видачі. Те саме з og:url і каталогом із фільтром за брендом.
// Розмітка schema.org на мовних копіях була цілком українською, з
// адресами українських сторінок.
//
// Тут перевіряємо:
//   [1] ядро: абсолютна адреса потрібною мовою;
//   [2] ядро: розмітка JSON-LD мовою сторінки;
//   [3] браузер: i18n.js виправляє те, що скрипти ставлять ПІСЛЯ
//       завантаження (canonical, og:url, JSON-LD);
//   [4] зібрані копії: canonical, JSON-LD, юридичні сторінки;
//   [5] sitemap: мовні адреси з hreflang, без юридичних копій.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const Core = require("../assets/js/i18n-core.js");
const Locales = require("../scripts/build-locales.js");
const Sitemap = require("../scripts/build-sitemap.js");
const { SITE_URL } = require("../scripts/site-env");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

console.log("\n[1] Абсолютна адреса мовою сторінки");
{
    const A = Core.localizeAbsolute;
    check("сторінка товару → /en/", A("https://bestbrnd4u.com/p/x/", "en") === "https://bestbrnd4u.com/en/p/x/");
    check("головна → /ru/", A("https://dev.bestbrnd4u.com/", "ru") === "https://dev.bestbrnd4u.com/ru/");
    check("із запитом", A("https://bestbrnd4u.com/catalog?brand=coach", "en") === "https://bestbrnd4u.com/en/catalog?brand=coach");
    check("уже з мовою — не подвоюється", A("https://bestbrnd4u.com/en/p/x/", "en") === "https://bestbrnd4u.com/en/p/x/");
    check("картинка — як є", A("https://bestbrnd4u.com/assets/images/a.webp", "en") === "https://bestbrnd4u.com/assets/images/a.webp");
    check("чужий сайт — як є", A("https://instagram.com/x", "en") === "https://instagram.com/x");
    check("українська — як є", A("https://bestbrnd4u.com/p/x/", "uk") === "https://bestbrnd4u.com/p/x/");
    check("localhost — лише коли це власне походження",
        A("http://localhost:8080/p/x/", "en", "http://localhost:8080") === "http://localhost:8080/en/p/x/"
        && A("http://localhost:8080/p/x/", "en") === "http://localhost:8080/p/x/");
}

console.log("\n[2] JSON-LD мовою сторінки");
{
    const t = Core.createTranslator({
        "Сумка Coach Tabby": { en: "Coach Tabby bag" },
        "Головна": { en: "Home" },
        "Чорний": { en: "Black" }
    }, "en");
    const out = Core.localizeJsonLd({
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": "https://bestbrnd4u.com/#org",
        name: "Сумка Coach Tabby",
        color: "Чорний",
        sku: "Артикул-1",
        image: ["https://bestbrnd4u.com/assets/images/a.webp"],
        offers: { "@type": "Offer", url: "https://bestbrnd4u.com/p/x/", priceCurrency: "UAH" },
        inLanguage: "uk-UA",
        breadcrumb: [{ name: "Головна", item: "https://bestbrnd4u.com/" }]
    }, t, "en");
    check("назва й колір перекладені", out.name === "Coach Tabby bag" && out.color === "Black", out.name);
    check("адреса пропозиції — /en/", out.offers.url === "https://bestbrnd4u.com/en/p/x/", out.offers.url);
    check("вкладені списки теж", out.breadcrumb[0].name === "Home" && out.breadcrumb[0].item === "https://bestbrnd4u.com/en/");
    check("@id, sku, картинки, @type — без змін",
        out["@id"] === "https://bestbrnd4u.com/#org" && out.sku === "Артикул-1"
        && out.image[0] === "https://bestbrnd4u.com/assets/images/a.webp" && out["@type"] === "Product");
    check("inLanguage — мова сторінки", out.inLanguage === "en", out.inLanguage);
}

console.log("\n[3] Браузер: те, що скрипти ставлять після завантаження");
(async () => {
    const dom = new JSDOM(`<!DOCTYPE html><html lang="en"><head>
        <link rel="canonical" href="https://dev.bestbrnd4u.com/en/p/x/">
        <meta property="og:url" content="https://dev.bestbrnd4u.com/en/p/x/">
        </head><body><h1>Coach Tabby bag</h1></body></html>`,
        { url: "https://dev.bestbrnd4u.com/en/p/x/", runScripts: "outside-only" });
    const w = dom.window;
    w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
        "Сумка Coach Tabby": { en: "Coach Tabby bag" }, "Головна": { en: "Home" }
    }) });
    w.eval(read("assets/js/i18n-core.js"));
    w.eval(read("assets/js/i18n.js"));
    const tick = () => new Promise(r => setTimeout(r, 20));
    await tick();

    // Так роблять product.js (setCanonical, setMetaByProperty, setJsonLd)
    // і catalog.js (link.href = …).
    const d = w.document;
    d.querySelector('link[rel="canonical"]').setAttribute("href", "https://dev.bestbrnd4u.com/p/x/");
    d.querySelector('meta[property="og:url"]').setAttribute("content", "https://dev.bestbrnd4u.com/p/x/");
    const ld = d.createElement("script");
    ld.type = "application/ld+json";
    ld.id = "productSchema";
    d.head.appendChild(ld);
    ld.textContent = JSON.stringify({ "@type": "Product", name: "Сумка Coach Tabby",
        offers: { url: "https://dev.bestbrnd4u.com/p/x/" } });
    await tick();

    check("canonical після скрипта — знову на себе",
        d.querySelector('link[rel="canonical"]').getAttribute("href") === "https://dev.bestbrnd4u.com/en/p/x/",
        d.querySelector('link[rel="canonical"]').getAttribute("href"));
    check("og:url після скрипта — на себе",
        d.querySelector('meta[property="og:url"]').getAttribute("content") === "https://dev.bestbrnd4u.com/en/p/x/");
    const data = JSON.parse(d.getElementById("productSchema").textContent);
    check("JSON-LD, поставлений скриптом, перекладено", data.name === "Coach Tabby bag", data.name);
    check("і адреса в ньому — /en/", data.offers.url === "https://dev.bestbrnd4u.com/en/p/x/", data.offers.url);

    // Повторний запис (зміна кольору перемальовує розмітку) — теж.
    ld.textContent = JSON.stringify({ "@type": "Product", name: "Сумка Coach Tabby" });
    await tick();
    check("повторний запис теж перекладено", JSON.parse(ld.textContent).name === "Coach Tabby bag", ld.textContent);

    // Новий canonical-елемент (setCanonical створює, якщо нема).
    d.querySelector('link[rel="canonical"]').remove();
    const link = d.createElement("link");
    link.rel = "canonical";
    link.href = "https://dev.bestbrnd4u.com/catalog";
    d.head.appendChild(link);
    await tick();
    check("новостворений canonical теж", link.getAttribute("href") === "https://dev.bestbrnd4u.com/en/catalog", link.getAttribute("href"));
    w.close();

    // Сервер на будь-яку неіснуючу адресу віддає одну українську 404
    // (lang="uk"). На /en/… мова документа мусить стати англійською.
    {
        const nf = new JSDOM(`<!DOCTYPE html><html lang="uk"><head></head><body><h1>Такої сторінки немає</h1></body></html>`,
            { url: "https://bestbrnd4u.com/en/nope", runScripts: "outside-only" });
        nf.window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        nf.window.eval(read("assets/js/i18n-core.js"));
        nf.window.eval(read("assets/js/i18n.js"));
        await tick();
        check("404 на /en/: lang документа — en", nf.window.document.documentElement.lang === "en", nf.window.document.documentElement.lang);
        nf.window.close();
    }

    // Юридична копія: canonical і og:url навмисно на український
    // оригінал. ЗНАЙДЕНО НА ПРОДІ 09.11.2026: зібраний файл був
    // правильний, а i18n.js після завантаження переписував /offer на
    // /en/offer. Тому — справжня зібрана сторінка, справжній скрипт.
    if (fs.existsSync(path.join(ROOT, "en/offer.html"))) {
        const legal = new JSDOM(read("en/offer.html").replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, ""),
            { url: "https://bestbrnd4u.com/en/offer", runScripts: "outside-only" });
        const lw = legal.window;
        lw.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        lw.eval(read("assets/js/i18n-core.js"));
        lw.eval(read("assets/js/i18n.js"));
        await tick();
        const canon = lw.document.querySelector('link[rel="canonical"]').getAttribute("href");
        const og = (lw.document.querySelector('meta[property="og:url"]') || { getAttribute: () => "https://bestbrnd4u.com/offer" }).getAttribute("content");
        check("en/offer після скрипта: canonical і og:url — на український оригінал",
            /\/offer$/.test(canon) && !/\/en\//.test(canon) && /\/offer$/.test(og) && !/\/en\//.test(og), `${canon} | ${og}`);
        lw.close();
    }

    builtCopies();
})();

function builtCopies() {

    console.log("\n[4] Зібрані мовні копії");

    if (!fs.existsSync(path.join(ROOT, "en/index.html"))) {
        console.log("  (мовні теки не зібрано — прод без publish; пропускаю)");
        return sitemap();
    }

    const pages = Locales.pages();
    const badCanonical = [];
    const badLd = [];

    ["en", "ru"].forEach(lang => {
        pages.forEach(rel => {
            const file = path.join(ROOT, lang, rel);
            if (!fs.existsSync(file)) return;
            const html = fs.readFileSync(file, "utf8");
            // Домен — того середовища, для якого зібрано (dev чи прод), тож
            // порівнюємо шлях.
            const canonical = ((html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || "").replace(/^https?:\/\/[^/]+/, "");
            const want = (Locales.LEGAL.has(rel) ? Locales.urlPath(rel) : Core.localizePath(Locales.urlPath(rel), lang));
            if (canonical && canonical !== want) badCanonical.push(`${lang}/${rel}: ${canonical}`);

            if (Locales.LEGAL.has(rel)) return;
            for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
                const visit = (v, k) => {
                    if (Array.isArray(v)) return v.forEach(x => visit(x, k));
                    if (v && typeof v === "object") return Object.keys(v).forEach(kk => visit(v[kk], kk));
                    if (typeof v !== "string" || k === "@id") return;
                    const own = v.match(/^https?:\/\/(?:dev\.)?bestbrnd4u\.com(\/.*)?$/);
                    if (own && Core.isPageHref(own[1] || "/")
                        && !(own[1] || "/").startsWith(`/${lang}/`)) badLd.push(`${lang}/${rel}: ${k} → ${v}`);
                    if (lang === "en" && k !== "image" && /[а-яіїєґ]/i.test(v)) badLd.push(`${lang}/${rel}: ${k} «${v.slice(0, 50)}»`);
                };
                visit(JSON.parse(m[1]), null);
            }
        });
    });

    check("canonical кожної копії — на себе (юридичні — на оригінал)", badCanonical.length === 0, badCanonical.slice(0, 3).join(" | "));
    check("JSON-LD копій: адреси з мовою, на /en/ без української", badLd.length === 0,
        `${badLd.length}: ` + badLd.slice(0, 4).join(" | "));

    // Назва товару в розмітці — та сама, що в заголовку сторінки.
    const product = pages.find(rel => rel.startsWith("p/"));
    const en = read("en/" + product);
    const h1 = (en.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1];
    const ldName = (en.match(/"@type": "Product",\s*"name": "([^"]+)"/) || [])[1];
    check(`en/${product}: назва в розмітці = заголовок`, h1 && ldName && h1.trim() === ldName, `${h1} ≠ ${ldName}`);

    const legal = read("en/offer.html");
    check("юридична копія без hreflang (canonical на оригінал)", !/<link rel="alternate" hreflang=/.test(legal));

    sitemap();
}

function sitemap() {

    console.log("\n[5] sitemap");

    const entry = args => Sitemap.withLanguages(args, true).join("\n");
    const one = entry([`${SITE_URL}/p/x/`, "weekly", "0.8", [{ loc: `${SITE_URL}/assets/a.webp` }], "2026-11-01"]);
    check("одна адреса → три записи", (one.match(/<url>/g) || []).length === 3);
    check("у кожного hreflang на всі мови й x-default",
        (one.match(/hreflang="(uk|en|ru|x-default)"/g) || []).length === 12);
    check("мовні записи — з префіксом", one.includes(`<loc>${SITE_URL}/en/p/x/</loc>`) && one.includes(`<loc>${SITE_URL}/ru/p/x/</loc>`));
    check("фото лише в українського запису", (one.match(/<image:image>/g) || []).length === 1);
    check("дата зміни — в усіх трьох", (one.match(/<lastmod>2026-11-01<\/lastmod>/g) || []).length === 3);

    const offer = entry([`${SITE_URL}/offer`, "yearly", "0.3"]);
    check("юридична — один запис без hreflang", (offer.match(/<url>/g) || []).length === 1 && !/hreflang/.test(offer));

    const off = Sitemap.withLanguages([`${SITE_URL}/p/x/`, "weekly", "0.8"], false).join("\n");
    check("мови вимкнено — як раніше", (off.match(/<url>/g) || []).length === 1 && !/hreflang/.test(off));

    // Зібраний файл: кожна мовна адреса — справжня сторінка.
    if (fs.existsSync(path.join(ROOT, "en/index.html"))) {
        const xml = read("sitemap.xml");
        const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
            .filter(loc => /\/(en|ru)\//.test(loc));
        const missing = locs.filter(loc => {
            const p = decodeURIComponent(new URL(loc).pathname);
            const rel = p.endsWith("/") ? p.slice(1) + "index.html" : p.slice(1) + ".html";
            return !fs.existsSync(path.join(ROOT, rel));
        });
        check(`мовних адрес у sitemap — ${locs.length}, кожна має файл`, locs.length > 100 && missing.length === 0, missing.slice(0, 3).join(" | "));
        check("xmlns:xhtml оголошено", /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/.test(xml));
    }

    console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
    process.exit(failures ? 1 : 0);
}
