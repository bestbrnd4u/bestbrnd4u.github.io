// Яку мову сайту відкрити при вході (рішення власника 13.11.2026).
//
// ПРАВИЛО
//   з України                              → українська;
//   з-за кордону, у браузері є українська  → українська;
//   з-за кордону, є російська (без укр.)   → російська;
//   з-за кордону, решта                    → англійська;
//   обране перемикачем                     → саме воно, звідки б не зайшли.
//
// ЦЕЙ ФАЙЛ НЕ ПІДКЛЮЧАЄТЬСЯ ЯК <script src>. Крок збірки
// scripts/build-lang-early.js вписує його текст прямо в <head> кожної
// сторінки — щоб рішення ухвалювалось ДО того, як браузер намалює хоч
// щось. Інакше іноземець бачив би мить української сторінки, а потім
// стрибок на англійську. Тому тут — лише ES5 і нічого зайвого: цей текст
// їде в кожну сторінку.
//
// Те саме правило стоїть у Cloudflare (docs/МОВА-ЗА-КРАЇНОЮ.md) — там
// воно спрацьовує ще раніше, на сервері. Тут — запасний шлях і все, чого
// сервер не бачить (вибір у localStorage, кешована країна).
//
// ЧОМУ ЛИШЕ ПРИ ВХОДІ ЗЗОВНІ. Усередині сайту посилання вже ведуть тією
// мовою, якою людина читає; перекидати посеред перегляду — сперечатися з
// її власним кліком.
//
// ЧОМУ НЕ ДЛЯ БОТІВ. Google заходить із США: перекинутий на /en/, він не
// побачив би української версії взагалі.
(function (root) {

    "use strict";

    var LANGS = ["uk", "en", "ru"];

    var BOT = /bot|crawl|spider|slurp|lighthouse|pagespeed|headless|facebookexternalhit|preview|google|bing|yandex|baidu|duckduck|semrush|ahrefs/i;

    function has(languages, code) {
        for (var i = 0; i < (languages || []).length; i++) {
            var tag = String(languages[i] || "").toLowerCase();
            if (tag === code || tag.indexOf(code + "-") === 0) return true;
        }
        return false;
    }

    function valid(lang) {
        return LANGS.indexOf(lang) >= 0;
    }

    function common(o) {
        return Boolean(o && o.external && !BOT.test(String(o.agent || "")));
    }

    // Чи потрібна країна, щоб вирішити. Українці з українським браузером —
    // більшість покупців — на неї не чекають.
    function needsCountry(o) {
        return common(o) && !valid(o.saved) && o.current === "uk"
            && !has(o.languages, "uk") && !o.country;
    }

    // Мова, на яку перейти, або null — лишитись.
    //
    //   o.current    — мова сторінки (з адреси)
    //   o.saved      — обране перемикачем або null
    //   o.country    — країна (Cloudflare) або null
    //   o.languages  — navigator.languages
    //   o.agent      — navigator.userAgent
    //   o.external   — чи прийшли ззовні
    //   o.alternates — мови, якими сторінка існує (hreflang)
    function target(o) {

        if (!common(o)) return null;

        var want;

        if (valid(o.saved)) {

            want = o.saved;

        } else {

            // Відкрили /en/ чи /ru/ — свідомо (посилання, пошук): не чіпаємо.
            if (o.current !== "uk") return null;

            if (has(o.languages, "uk")) return null;

            var country = String(o.country || "").toUpperCase();

            // XX — Cloudflare не знає, T1 — Tor: краще нічого, ніж навмання.
            if (!/^[A-Z]{2}$/.test(country) || country === "XX" || country === "T1" || country === "UA") return null;

            want = has(o.languages, "ru") ? "ru" : "en";

        }

        if (want === o.current) return null;

        if ((o.alternates || []).indexOf(want) < 0) return null;

        return want;

    }

    // Та сама сторінка іншою мовою (як I18nCore.localizePath — тест
    // звіряє, що вони однакові).
    function path(pathname, lang) {
        var bare = String(pathname || "/").replace(/^\/(en|ru)(?=\/|$)/, "") || "/";
        if (bare.charAt(0) !== "/") bare = "/" + bare;
        return lang === "uk" ? bare : "/" + lang + (bare === "/" ? "/" : bare);
    }

    function current(pathname) {
        var m = String(pathname || "/").match(/^\/(en|ru)(?:\/|$)/);
        return m ? m[1] : "uk";
    }

    root.LangRule = { target: target, needsCountry: needsCountry, path: path, current: current, BOT: BOT, LANGS: LANGS };

}(typeof window !== "undefined" ? window : globalThis));

// ---- Рішення до першого кадру (лише в браузері) ----
//
// Вибір, кешована країна й мови браузера відомі синхронно: якщо з них
// уже ясно, куди переходити, — переходимо одразу, сторінка не
// малюється. Якщо треба спитати країну (assets/js/i18n.js, /cdn-cgi/trace),
// ховаємо сторінку до відповіді — не довше 1,5 с, навіть якщо i18n.js не
// завантажився.
//
// Ховаємо прозорістю <html>, а НЕ visibility: у style.css п'ять елементів
// мають явне visibility:visible — воно перекриває сховане батьківське, і
// на головній вони встигали намалюватись (заміряно 13.11.2026: паінт
// first-contentful-paint на «/» перед переходом на /ru/). Прозорість
// кореня не обійде жоден нащадок.
(function () {

    if (typeof document === "undefined" || !window.LangRule) return;

    var R = window.LangRule;
    var html = document.documentElement;

    try {

        var store = function (key) { try { return localStorage.getItem(key); } catch (e) { return null; } };
        var geo = null;
        try { geo = JSON.parse(store("bb-geo") || "null"); } catch (e) { geo = null; }

        var referrer = "";
        try { referrer = document.referrer ? new URL(document.referrer).origin : ""; } catch (e) { referrer = ""; }

        var links = document.querySelectorAll('link[rel="alternate"][hreflang]');
        var alternates = [];
        for (var i = 0; i < links.length; i++) alternates.push(links[i].getAttribute("hreflang"));

        var input = {
            current: R.current(location.pathname),
            saved: store("bb-lang"),
            country: geo && geo.c && Date.now() - geo.t < 86400000 ? geo.c : null,
            languages: navigator.languages || [navigator.language],
            agent: navigator.userAgent,
            external: referrer !== location.origin,
            alternates: alternates
        };

        // Для i18n.js: не збирати те саме вдруге.
        window.LangRuleInput = input;

        var go = R.target(input);

        if (go) {
            html.style.opacity = "0";
            location.replace(R.path(location.pathname, go) + location.search + location.hash);
            return;
        }

        if (R.needsCountry(input)) {
            html.style.opacity = "0";
            window.LangRulePending = true;
            // Запобіжник: i18n.js не завантажився чи завис — показуємо
            // сторінку як є. Перехід, що вже почався, його вимикає
            // (clearTimeout у i18n.js): інакше при повільній новій сторінці
            // стара українська проступала б саме перед стрибком.
            window.LangRuleTimer = setTimeout(function () { html.style.opacity = ""; }, 1500);
        }

    } catch (e) {
        html.style.opacity = "";
    }

}());
