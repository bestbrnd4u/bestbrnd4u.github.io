// Мова за країною при вході (рішення власника 13.11.2026).
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. З України — українська, з-за кордону — англійська. Російська сама
//    не вмикається НІКОЛИ.
// 2. Обране перемикачем — сильніше за країну, і пам'ятається.
// 3. Лише при вході ззовні: перехід по сайту не перекидає.
// 4. Ботів не перекидаємо: Google заходить із США і мусить бачити
//    українську версію.
// 5. Українська чи російська мова браузера за кордоном — лишаємо
//    українську (українці в Європі).
// 6. Сторінку без англійської версії не чіпаємо.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const Core = require("../assets/js/i18n-core.js");

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const base = {
    current: "uk", saved: null, country: "PL", languages: ["pl-PL", "en"],
    agent: CHROME, external: true, alternates: ["uk", "en", "ru", "x-default"]
};

const t = patch => Core.autoLangTarget({ ...base, ...patch });

console.log("\n[1] Правило");
{
    check("Польща, польський браузер → англійська", t({}) === "en");
    check("США → англійська", t({ country: "US", languages: ["en-US"] }) === "en");
    check("Україна → лишаємо українську", t({ country: "UA" }) === null);
    check("Україна з англійським браузером → українська", t({ country: "UA", languages: ["en-US"] }) === null);
    check("за кордоном, браузер українською → українська", t({ languages: ["uk-UA", "en"] }) === null);
    check("за кордоном, браузер російською → українська, а не російська", t({ languages: ["ru-RU"] }) === null);
    check("російська автоматично — ніколи", [
        t({ country: "RU", languages: ["ru-RU"] }), t({ country: "KZ", languages: ["ru"] }), t({ country: "DE", languages: ["de"] })
    ].every(x => x !== "ru"));
    check("країна невідома (XX, Tor, немає) → нічого", [t({ country: "XX" }), t({ country: "T1" }), t({ country: null }), t({ country: "?" })].every(x => x === null));
}

console.log("\n[2] Обране перемикачем сильніше");
{
    check("обрала українську, зайшла з Польщі → українська", t({ saved: "uk" }) === null);
    check("обрала англійську, зайшла з України на українську сторінку → англійська", t({ saved: "en", country: "UA" }) === "en");
    check("обрала російську → російська (бо сама)", t({ saved: "ru", country: "UA" }) === "ru");
    check("обрала українську, зайшла на /en/ ззовні → українська", t({ saved: "uk", current: "en" }) === "uk");
    check("кривий збережений вибір не діє", t({ saved: "de", country: "UA" }) === null);
}

console.log("\n[3] Коли не чіпаємо взагалі");
{
    check("перехід усередині сайту", t({ external: false }) === null && t({ external: false, saved: "en", country: "UA" }) === null);
    check("відкрили /en/ — лишаємо", t({ current: "en", country: "UA" }) === null);
    check("відкрили /ru/ з Польщі — лишаємо, не на англійську", t({ current: "ru" }) === null);
    check("сторінки англійською немає — лишаємо", t({ alternates: ["uk"] }) === null);

    const bots = [
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Mozilla/5.0 (Linux; Android 6.0.1) Chrome/130 Mobile Safari/537.36 (compatible; Googlebot/2.1)",
        "Mozilla/5.0 (compatible; bingbot/2.0)",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/130 Safari/537.36",
        "Mozilla/5.0 Chrome-Lighthouse",
        "facebookexternalhit/1.1"
    ];

    check("боти й Lighthouse — ніколи", bots.every(agent => t({ agent }) === null && t({ agent, saved: "en", country: "UA" }) === null));
}

console.log("\n[4] Запит країни — лише коли потрібен");
{
    const needs = patch => Core.autoLangNeedsCountry({ ...base, ...patch });

    check("іноземний браузер на українській сторінці — питаємо", needs({}));
    check("український браузер — не питаємо (більшість покупців)", !needs({ languages: ["uk-UA"] }));
    check("уже обрала — не питаємо", !needs({ saved: "uk" }));
    check("внутрішній перехід, бот, /en/ — не питаємо", !needs({ external: false }) && !needs({ agent: "Googlebot" }) && !needs({ current: "en" }));
}

console.log("\n[5] Сторінка");
{
    const js = read("assets/js/i18n.js");

    check("країна — з /cdn-cgi/trace на нашому домені", /fetch\("\/cdn-cgi\/trace"/.test(js));
    check("чекаємо не довше секунди", /setTimeout\(function \(\) \{ resolve\(null\); \}, 1000\)/.test(js));
    check("перехід — replace (кнопка «назад» не зациклюється) і з тим самим запитом", /location\.replace\(Core\.localizePath\(location\.pathname, target\) \+ location\.search \+ location\.hash\)/.test(js));
    check("вибір перемикачем запам'ятовується", /closest\("\.lang-switch a\[hreflang\]"\)[\s\S]{0,200}storageSet\(CHOICE_KEY/.test(js));
    check("автовибір працює і на українських сторінках (до раннього return)", js.indexOf("autoLanguage") < js.indexOf("if (lang === Core.DEFAULT_LANG) return;"));
    check("сховище — у try/catch (приватне вікно)", /function storageGet[\s\S]*?try \{ return localStorage\.getItem/.test(js));

    // /cdn-cgi/ — той самий домен, тож CSP пускає без змін.
    // Політика живе в правилі Cloudflare; копія — у docs/МОНІТОРИНГ.md
    // (її стереже tests/test-csp-sources.js).
    const csp = (read("docs/МОНІТОРИНГ.md").match(/connect-src ([^;]+)/) || [])[1] || "";

    check("CSP: connect-src 'self' пускає /cdn-cgi/trace", /'self'/.test(csp));

    // На кожній сторінці з перемикачем є hreflang-альтернативи — інакше
    // правило не знайде англійської версії й мовчатиме.
    const pages = ["index.html", "catalog.html", "cart.html", "bayer-service.html"];
    check("на сторінках є hreflang en і перемикач", pages.every(p => /hreflang="en"/.test(read(p)) && /class="lang-switch"/.test(read(p))));
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Мова за країною: усе гаразд");
process.exit(failures ? 1 : 0);
