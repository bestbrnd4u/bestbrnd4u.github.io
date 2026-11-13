// Мова за країною при вході (рішення власника 13.11.2026).
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. З України — українська. З-за кордону — за мовою браузера:
//    українська → українська, російська → російська, решта → англійська.
// 2. Обране перемикачем — сильніше за країну, і пам'ятається (і в
//    localStorage, і в cookie для правила Cloudflare).
// 3. Лише при вході ззовні; ботів не перекидаємо (Google заходить зі США).
// 4. Без миті української: правило вписане в <head> кожної сторінки
//    (scripts/build-lang-early.js), ховаємо прозорістю кореня, а
//    запобіжник, що показує сторінку, вимикається, щойно почався перехід.
// 5. Правило Cloudflare в документації — те саме правило.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

require("../assets/js/lang-rule.js");
const R = globalThis.LangRule;
const Core = require("../assets/js/i18n-core.js");
const early = require("../scripts/build-lang-early.js");

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const base = {
    current: "uk", saved: null, country: "PL", languages: ["pl-PL", "en"],
    agent: CHROME, external: true, alternates: ["uk", "en", "ru", "x-default"]
};

const t = patch => R.target({ ...base, ...patch });

console.log("\n[1] Правило");
{
    check("Польща, польський браузер → англійська", t({}) === "en");
    check("США → англійська", t({ country: "US", languages: ["en-US"] }) === "en");
    check("Україна → українська", t({ country: "UA" }) === null);
    check("Україна з англійським браузером → українська", t({ country: "UA", languages: ["en-US"] }) === null);
    check("Україна з російським браузером → українська", t({ country: "UA", languages: ["ru-RU"] }) === null);
    check("Польща, браузер українською → українська", t({ languages: ["uk-UA", "en"] }) === null);
    check("Німеччина, браузер російською → російська", t({ country: "DE", languages: ["ru-RU", "de"] }) === "ru");
    check("російська другою мовою браузера теж рахується", t({ languages: ["pl-PL", "ru"] }) === "ru");
    check("і українська, і російська → українська", t({ languages: ["ru-RU", "uk"] }) === null);
    check("«rue», «kru» — не російська", t({ languages: ["rue", "kru"] }) === "en");
    check("країна невідома (XX, Tor, немає) → нічого", [t({ country: "XX" }), t({ country: "T1" }), t({ country: null }), t({ country: "?" })].every(x => x === null));
}

console.log("\n[2] Обране перемикачем сильніше");
{
    check("обрала українську, зайшла з Польщі → українська", t({ saved: "uk" }) === null);
    check("обрала англійську, зайшла з України → англійська", t({ saved: "en", country: "UA" }) === "en");
    check("обрала російську → російська", t({ saved: "ru", country: "UA" }) === "ru");
    check("обрала українську, зайшла на /en/ ззовні → українська", t({ saved: "uk", current: "en" }) === "uk");
    check("кривий збережений вибір не діє", t({ saved: "de", country: "UA" }) === null);
}

console.log("\n[3] Коли не чіпаємо");
{
    check("перехід усередині сайту", t({ external: false }) === null && t({ external: false, saved: "en", country: "UA" }) === null);
    check("відкрили /en/ — лишаємо", t({ current: "en", country: "UA" }) === null);
    check("відкрили /ru/ з Польщі — лишаємо", t({ current: "ru" }) === null);
    check("сторінки потрібною мовою немає — лишаємо", t({ alternates: ["uk"] }) === null && t({ alternates: ["uk", "en"], languages: ["ru"], country: "DE" }) === null);

    const bots = [
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Mozilla/5.0 (compatible; bingbot/2.0)",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130 Safari/537.36",
        "Mozilla/5.0 Chrome-Lighthouse",
        "facebookexternalhit/1.1"
    ];

    check("боти й Lighthouse — ніколи", bots.every(agent => t({ agent }) === null && t({ agent, saved: "en", country: "UA" }) === null));
}

console.log("\n[4] Запит країни — лише коли потрібен");
{
    const needs = patch => R.needsCountry({ ...base, country: null, ...patch });

    check("іноземний браузер, країна невідома — питаємо", needs({}));
    check("російський браузер — питаємо (в Україні він лишається українським)", needs({ languages: ["ru-RU"] }));
    check("український браузер — не питаємо (більшість покупців)", !needs({ languages: ["uk-UA"] }));
    check("країна вже в кеші — не питаємо", !needs({ country: "PL" }));
    check("обрала сама, внутрішній перехід, бот, /en/ — не питаємо",
        !needs({ saved: "uk" }) && !needs({ external: false }) && !needs({ agent: "Googlebot" }) && !needs({ current: "en" }));
}

console.log("\n[5] Адреси — ті самі, що в перекладі сайту");
{
    const paths = ["/", "/catalog", "/p/krosivky-lacoste-l003/", "/en/", "/en/catalog", "/ru/p/x/", "/brands/coach/"];

    check("LangRule.path = I18nCore.localizePath", paths.every(p => ["uk", "en", "ru"].every(l => R.path(p, l) === Core.localizePath(p, l))));
    check("LangRule.current = I18nCore.langFromPath", paths.every(p => R.current(p) === Core.langFromPath(p)));
}

console.log("\n[6] Вписано в <head> кожної сторінки");
{
    const block = early.snippet();

    check("у вписаному тексті немає </script", !/<\/script[\s\S]*<\/script/i.test(block.replace(/<\/script>\n$/, "")));

    const files = early.pages(ROOT, []).filter(f => fs.readFileSync(f, "utf8").includes("assets/js/i18n.js"));

    const bad = files.filter(f => {
        const html = fs.readFileSync(f, "utf8");
        const at = html.indexOf('<script id="lang-early">');
        return at < 0
            || !html.includes(block)                                  // текст актуальний
            || at > html.indexOf("</head>")                           // до </head>
            || at < html.lastIndexOf('rel="alternate" hreflang', html.indexOf("</head>"));  // після hreflang
    });

    check(`усі ${files.length} сторінок: актуальне правило, у <head>, після hreflang`, files.length > 400 && bad.length === 0,
        bad.slice(0, 3).map(f => path.relative(ROOT, f)).join(", "));

    check("повторна збірка нічого не змінює", early.apply(read("index.html"), block) === read("index.html"));

    const pkg = JSON.parse(read("package.json")).scripts.build;

    check("крок — після build-locales (щоб /en/ і /ru/ мали той самий текст)",
        pkg.indexOf("build-lang-early.js") > pkg.indexOf("build-locales.js") && pkg.indexOf("build-lang-early.js") < pkg.indexOf("apply-cache-version.js"));
}

console.log("\n[7] Без миті української");
{
    const rule = read("assets/js/lang-rule.js");
    const js = read("assets/js/i18n.js");

    check("ховаємо прозорістю кореня, а не visibility (її перекривають нащадки)", /html\.style\.opacity = "0"/.test(rule) && !/style\.visibility = "hidden"/.test(rule));
    check("запобіжник показує сторінку не пізніше ніж за 1,5 с", /window\.LangRuleTimer = setTimeout\(function \(\) \{ html\.style\.opacity = ""; \}, 1500\)/.test(rule));
    check("перехід вимикає запобіжник", /clearTimeout\(window\.LangRuleTimer\);\s*location\.replace/.test(js));
    check("країну чекаємо не довше секунди", /setTimeout\(function \(\) \{ resolve\(null\); \}, 1000\)/.test(js) && /fetch\("\/cdn-cgi\/trace"/.test(js));
    check("перехід — replace, з тим самим запитом", /location\.replace\(R\.path\(location\.pathname, go\) \+ location\.search \+ location\.hash\)/.test(rule));
    check("вибір перемикачем — у localStorage і в cookie", /storageSet\(CHOICE_KEY, chosen\)/.test(js) && /document\.cookie = CHOICE_KEY \+ "=" \+ chosen \+ "; path=\/; max-age=31536000; SameSite=Lax"/.test(js));
}

console.log("\n[8] Правило Cloudflare у документації");
{
    const doc = read("docs/МОВА-ЗА-КРАЇНОЮ.md");

    // Cloudflare Free відмовив саме в цьому полі (13.11.2026) — у правилі
    // його бути не повинно, інакше власник отримає «Invalid expression».
    const rules = (doc.match(/```\n\(ip\.src\.country[\s\S]*?```/g) || []).join("\n");
    check("у правилі немає cf.client.bot (заборонене на Free)", rules.length > 0 && !/cf\.client\.bot/.test(rules));
    check("тимчасове перенаправлення (302), не 301", /302/.test(doc) && /не 301/i.test(doc));
    check("зберігати запит (Preserve query string)", /Preserve query string/.test(doc));
    check("Україна, боти, cookie вибору, свої переходи — винятки", ["ip.src.country ne \"UA\"", "contains \"bot\"", "contains \"google\"", "http.cookie contains \"bb-lang=\"", "http.referer contains \"bestbrnd4u.com\""].every(s => doc.includes(s)));
    check("українська мова браузера — без переходу; російська — /ru", /contains "uk"/.test(doc) && /concat\("\/ru", http\.request\.uri\.path\)/.test(doc) && /concat\("\/en", http\.request\.uri\.path\)/.test(doc));
}

console.log("\n[9] Рядок перемикача натискається на всю ширину");
{
    // Перемикач стоїть у .header-icons, а «.header-icons a» робить кожне
    // посилання круглою кнопкою 46×46. 13.11.2026 так і було: рядок мови
    // 148 px, натискався лише квадрат посередині. Правило перемикача
    // мусить скидати розмір, тінь і тло, які той селектор нав'язує.
    const css = read("assets/css/style.css");
    const icons = (css.match(/\.header-icons a,\s*\.header-icons button\{([^}]*)\}/) || [])[1] || "";
    const option = (css.match(/\.lang-switch \.lang-switch-option\{([^}]*)\}/) || [])[1] || "";

    check("правило іконок шапки знайдено (воно й нав'язує 46×46)", /width:46px/.test(icons));
    check("перемикач скидає ширину, висоту, тінь і тло", /width:auto/.test(option) && /height:auto/.test(option) && /box-shadow:none/.test(option) && /background:transparent/.test(option));
    check("і має display:block (на всю ширину списку)", /display:block/.test(option));
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Мова за країною: усе гаразд");
process.exit(failures ? 1 : 0);
