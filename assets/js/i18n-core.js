// Ядро перекладу інтерфейсу — спільне для збірки й браузера.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Перекладати доводиться у двох місцях:
//   1. на збірці (scripts/build-locales.js) — статичний текст сторінок
//      /en/… і /ru/…, щоб Google і людина бачили перекладене ще до JS;
//   2. у браузері (assets/js/i18n.js) — те, що JS домальовує пізніше:
//      кошик, картки, повідомлення.
// Правило зіставлення мусить бути ОДНЕ: інакше рядок, перекладений на
// збірці, у браузері лишився б українським — або навпаки. Той самий
// підхід, що в assets/js/breadcrumbs.js.
//
// СЛОВНИК
// --------
// data/i18n/strings.json: { "Кошик": { "en": "Cart", "ru": "Корзина" } }
// Ключ — український рядок як є (пробіли нормалізуються).
//
// ЧИСЛА. «Знайдено 92 товари» в словнику записано як «Знайдено {#}
// товари»: числа в ключі замінено на {#}. У перекладі {#} підставляє
// числа в тому самому порядку; {#:item|items} (англ.) і
// {#:товар|товара|товаров} (рос.) обирають форму за першим числом.
//
// ЗНАЧЕННЯ-КЛЮЧІ НЕ ПЕРЕКЛАДАЮТЬСЯ В ДАНИХ. Стать, категорії, кольори в
// адресах фільтрів (catalog?gender=Жінкам) лишаються українськими: за
// ними код зіставляє товари. Перекладається лише їхній показ — тут.
(function (root) {

    "use strict";

    var LANGS = ["uk", "en", "ru"];
    var DEFAULT_LANG = "uk";

    function normalize(text) {
        return String(text).replace(/\s+/g, " ").trim();
    }

    // Число — цифри з можливими пробілами-розділювачами тисяч («6 000»),
    // крапкою чи комою всередині. Нерозривний пробіл (U+00A0, U+202F)
    // теж розділювач: formatPrice ставить саме його.
    var NUMBER = /\d(?:[\d   ]*\d)?(?:[.,]\d+)?/g;

    function pluralRu(n, forms) {
        var a = Math.abs(n) % 100, b = a % 10;
        if (a > 10 && a < 20) return forms[2] || forms[0];
        if (b > 1 && b < 5) return forms[1] || forms[0];
        if (b === 1) return forms[0];
        return forms[2] || forms[0];
    }

    function pluralEn(n, forms) {
        return n === 1 ? forms[0] : (forms[1] || forms[0]);
    }

    function fill(template, numbers, lang) {
        var i = 0;
        return template.replace(/\{#(?::([^}]*))?\}/g, function (m, forms) {
            if (forms) {
                var n = Number(String(numbers[0] || "0").replace(/[^\d.,]/g, "").replace(",", "."));
                var list = forms.split("|");
                return lang === "ru" ? pluralRu(n, list) : pluralEn(n, list);
            }
            var value = numbers[i];
            i += 1;
            return value === undefined ? "" : value;
        });
    }

    // Перекладач для однієї мови. Повертає функцію text → text; що не
    // знайшов — повертає без змін (українською), а не порожнім.
    function createTranslator(dict, lang) {

        var exact = Object.create(null);
        var withNumbers = Object.create(null);

        Object.keys(dict || {}).forEach(function (key) {
            var entry = dict[key];
            var value = entry && entry[lang];
            if (!value) return;
            var norm = normalize(key);
            if (norm.indexOf("{#") !== -1) withNumbers[norm] = value;
            else exact[norm] = value;
        });

        function translate(text) {

            if (lang === DEFAULT_LANG || text == null) return text;

            var raw = String(text);
            var norm = normalize(raw);

            if (!norm || !/[а-яіїєґ]/i.test(norm)) return raw;

            // Пробіли довкола зберігаємо: у розмітці текст часто стоїть
            // між тегами з відступами, і «Кошик » ≠ «Кошик» на вигляд.
            var lead = raw.match(/^\s*/)[0];
            var tail = raw.match(/\s*$/)[0];

            if (exact[norm] !== undefined) return lead + exact[norm] + tail;

            var numbers = norm.match(NUMBER);

            if (numbers) {
                var key = norm.replace(NUMBER, "{#}");
                if (withNumbers[key] !== undefined) return lead + fill(withNumbers[key], numbers, lang) + tail;
            }

            // «Кошик | BestBrnd4u», «Сумки Coach — купити в Україні»:
            // заголовки вкладок складені з частин. Цілим рядком їх у
            // словнику немає — перекладаємо кожну частину окремо.
            var SEP = / (\||—|·) /;

            if (SEP.test(norm)) {
                var parts = norm.split(/ (\||—|·) /);
                var changed = false;
                for (var i = 0; i < parts.length; i += 2) {
                    var next = translate(parts[i]);
                    if (next !== parts[i]) { parts[i] = next; changed = true; }
                }
                if (changed) return lead + parts.join(" ") + tail;
            }

            return raw;

        }

        translate.lang = lang;
        translate.has = function (text) {
            var norm = normalize(text);
            if (exact[norm] !== undefined) return true;
            var numbers = norm.match(NUMBER);
            return Boolean(numbers && withNumbers[norm.replace(NUMBER, "{#}")] !== undefined);
        };

        return translate;

    }

    // Мова з адреси: /en/… → en, /ru/… → ru, решта — українська.
    function langFromPath(pathname) {
        var m = String(pathname || "/").match(/^\/(en|ru)(?:\/|$)/);
        return m ? m[1] : DEFAULT_LANG;
    }

    // Та сама сторінка іншою мовою. Шлях — від кореня сайту.
    function localizePath(pathname, lang) {
        var bare = String(pathname || "/").replace(/^\/(en|ru)(?=\/|$)/, "") || "/";
        if (bare.charAt(0) !== "/") bare = "/" + bare;
        return lang === DEFAULT_LANG ? bare : "/" + lang + (bare === "/" ? "/" : bare);
    }

    // Чи це посилання на сторінку сайту (а не файл, не зовнішнє, не якір).
    // Відповідає лише на питання «чи варто додати мовний префікс».
    function isPageHref(href) {
        if (!href) return false;
        var h = String(href).trim();
        if (/^(#|mailto:|tel:|javascript:|data:|blob:|sms:|viber:|tg:|https?:\/\/(?!bestbrnd4u\.com|dev\.bestbrnd4u\.com))/i.test(h)) return false;
        h = h.replace(/^https?:\/\/(dev\.)?bestbrnd4u\.com/i, "");
        var pathOnly = h.split(/[?#]/)[0];
        if (/^\/?(assets|data|admin|api|feed\.xml|sitemap\.xml|robots\.txt|llms\.txt)(\/|$)/i.test(pathOnly)) return false;
        if (/\.(?!html?$)[a-z0-9]{2,5}$/i.test(pathOnly)) return false;
        return true;
    }

    // Посилання на сторінку → те саме мовою lang. Зовнішні й файли — як є.
    function localizeHref(href, lang) {
        if (lang === DEFAULT_LANG || !isPageHref(href)) return href;
        var h = String(href).trim().replace(/^https?:\/\/(dev\.)?bestbrnd4u\.com/i, "");
        if (/^\/(en|ru)(\/|$)/.test(h)) return h;
        var m = h.match(/^([^?#]*)(.*)$/);
        var p = m[1];
        var rest = m[2];
        if (p === "" || p === ".") p = "/";
        if (p.charAt(0) !== "/") p = "/" + p;
        return localizePath(p, lang) + rest;
    }

    var api = {
        LANGS: LANGS,
        DEFAULT_LANG: DEFAULT_LANG,
        normalize: normalize,
        createTranslator: createTranslator,
        langFromPath: langFromPath,
        localizePath: localizePath,
        localizeHref: localizeHref,
        isPageHref: isPageHref
    };

    root.I18nCore = api;

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).I18nCore;
}
