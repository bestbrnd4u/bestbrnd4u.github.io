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

    // ЗАГАЛЬНІ ПІДСТАНОВКИ {*}.
    //
    // Рядки в коді складені з частин: «Товар додано в кошик: ${назва}.
    // Сума замовлення ${сума}». Точним збігом такий рядок не знайти, а
    // числом підстановка буває не завжди. У ключі {*} — будь-який текст,
    // {#} — число; у перекладі {1}, {2}… — підстановки за номером
    // (англійська часто ставить їх в іншому порядку), {#:…} — форма
    // слова за першим числом серед підстановок.
    //
    // Запобіжник: у ключі мусить бути щонайменше чотири власні літери.
    // Інакше «{*} {*}» «перекладав» би будь-який рядок із пробілом.
    var MIN_LITERAL_LETTERS = 4;

    function escapeRe(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function compilePattern(key) {
        var literal = key.replace(/\{\*\}|\{#\}/g, "");
        var letters = (literal.match(/[a-zа-яіїєґ]/gi) || []).length;
        if (letters < MIN_LITERAL_LETTERS) return null;
        var source = key.split(/(\{\*\}|\{#\})/).map(function (part) {
            if (part === "{*}") return "(.+?)";
            if (part === "{#}") return "(" + NUMBER.source + ")";
            return escapeRe(part);
        }).join("");
        return { re: new RegExp("^" + source + "$", "i"), literal: literal.length };
    }

    // Чи лишилось у перекладеній підстановці українське. Для англійської —
    // будь-яка кирилиця, для російської — суто українські літери (і ї є ґ):
    // спільні слова на кшталт «Каталог» там законно однакові.
    function stillUkrainian(text, lang) {
        return lang === "ru" ? /[іїєґ]/i.test(text) : /[а-яіїєґ]/i.test(text);
    }

    // Повертає null, якщо хоч одна підстановка лишилась українською.
    //
    // Шаблон «Знижка {*}» інакше спрацьовував на довгому реченні:
    // «Знижка стосується самої речі…» ставало «Discount стосується самої
    // речі…» — одне слово перекладене, решта ні. Мішанина мов в одному
    // реченні гірша за цілий український рядок: його хоча б можна
    // прочитати перекладачем браузера.
    function fillIndexed(template, captures, lang, translate) {
        var firstNumber = null;
        for (var k = 0; k < captures.length; k++) {
            if (/^\s*\d/.test(captures[k])) { firstNumber = captures[k]; break; }
        }
        var used = template.match(/\{(\d+)\}/g) || [];
        for (var u = 0; u < used.length; u++) {
            var cap = captures[Number(used[u].slice(1, -1)) - 1];
            if (cap !== undefined && stillUkrainian(translate(cap), lang)) return null;
        }
        return template
            .replace(/\{#:([^}]*)\}/g, function (m, forms) {
                var n = Number(String(firstNumber || "0").replace(/[^\d.,]/g, "").replace(",", "."));
                var list = forms.split("|");
                return lang === "ru" ? pluralRu(n, list) : pluralEn(n, list);
            })
            .replace(/\{(\d+)\}/g, function (m, i) {
                var value = captures[Number(i) - 1];
                // Підставлене — теж текст сайту (назва категорії, кольору):
                // перекладаємо й його.
                return value === undefined ? "" : translate(value);
            });
    }

    // Перекладач для однієї мови. Повертає функцію text → text; що не
    // знайшов — повертає без змін (українською), а не порожнім.
    function createTranslator(dict, lang) {

        var exact = Object.create(null);
        var withNumbers = Object.create(null);
        var patterns = [];

        Object.keys(dict || {}).forEach(function (key) {
            var entry = dict[key];
            var value = entry && entry[lang];
            if (!value) return;
            var norm = normalize(key);
            if (norm.indexOf("{*}") !== -1 || /\{\d+\}/.test(value)) {
                var compiled = compilePattern(norm);
                if (compiled) patterns.push({ re: compiled.re, literal: compiled.literal, value: value });
            } else if (norm.indexOf("{#") !== -1) withNumbers[norm] = value;
            else exact[norm] = value;
        });

        // Довший незмінний текст — точніший збіг: «Знайдено {*} у {*}»
        // має йти раніше за «Знайдено {*}».
        patterns.sort(function (a, b) { return b.literal - a.literal; });

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

            for (var p = 0; p < patterns.length; p++) {
                var m = norm.match(patterns[p].re);
                if (!m) continue;
                var filled = fillIndexed(patterns[p].value, m.slice(1), lang, translate);
                // Підстановка лишилась українською — пробуємо наступний
                // шаблон, а не віддаємо мішанину.
                if (filled !== null) return lead + filled + tail;
            }

            // «Бренд:», «Розміри:», «Далі…» — той самий підпис, що й у
            // словнику, лише з розділовим знаком у кінці (у розмітці його
            // дописує генератор сторінок). Перекладаємо без нього й
            // повертаємо знак на місце.
            var punct = norm.match(/^(.*[^\s:.,;!?…])(\s*[:.,;!?…]+)$/);

            if (punct && exact[punct[1]] !== undefined) return lead + exact[punct[1]] + punct[2] + tail;

            // «🚚 Орієнтовно у відділенні…», «↩ Відмова»: значок чи стрілка
            // перед текстом. Шаблони прив'язані до початку рядка й на ньому
            // не збігались — перекладаємо без значка й повертаємо його.
            var icon = norm.match(/^([^\p{L}\p{N}«"(]+)(\S.*)$/u);

            if (icon) {
                var rest = translate(icon[2]);
                if (rest !== icon[2]) return lead + icon[1] + rest + tail;
            }

            // «Кошик | BestBrnd4u», «Сумки Coach — купити в Україні»:
            // заголовки вкладок складені з частин. Цілим рядком їх у
            // словнику немає — перекладаємо кожну частину окремо.
            var SEP = / (\||—|·) /;

            if (SEP.test(norm)) {
                var parts = norm.split(/ (\||—|·) /);
                var changed = false;
                var mixed = false;
                for (var i = 0; i < parts.length; i += 2) {
                    var next = translate(parts[i]);
                    if (next !== parts[i]) { parts[i] = next; changed = true; }
                    if (stillUkrainian(parts[i], lang)) mixed = true;
                }
                // Як і з підстановками: частина лишилась українською —
                // цілий рядок, а не «Чоловіча сумка … — 6 000 UAH».
                if (changed && !mixed) return lead + parts.join(" ") + tail;
            }

            return raw;

        }

        // Слово, що стоїть окремим вузлом після числа: <span>131</span>
        // <span>товар</span> (лічильник каталогу, «Показати 92 товари»).
        // Саме по собі «товар» — однина, а англійською 131 — множина;
        // форму вирішує число. Перекладаємо пару разом і беремо слово.
        translate.counted = function (number, word) {
            var n = normalize(number);
            var whole = translate(n + " " + normalize(word));
            if (whole.indexOf(n) !== 0) return null;
            var rest = whole.slice(n.length).trim();
            if (!rest || stillUkrainian(rest, lang)) return null;
            return rest;
        };

        translate.lang = lang;
        translate.has = function (text) {
            var norm = normalize(text);
            if (exact[norm] !== undefined) return true;
            var numbers = norm.match(NUMBER);
            if (numbers && withNumbers[norm.replace(NUMBER, "{#}")] !== undefined) return true;
            return patterns.some(function (p) { return p.re.test(norm); });
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

    // Число, що стоїть одразу перед текстовим вузлом окремим елементом:
    // <span>131</span> <span>товар</span>. Пробіли й коментарі між ними
    // пропускаємо. Немає — null.
    function numberBefore(textNode) {
        var host = textNode.parentNode;
        // Слово — єдиний вміст свого елемента (<span>товар</span>) —
        // тоді сусіда шукаємо в елемента; інакше — в самого вузла.
        var from = host && host.childNodes.length === 1 ? host : textNode;
        var prev = from.previousSibling;
        while (prev && (prev.nodeType === 8 || (prev.nodeType === 3 && !prev.nodeValue.trim()))) prev = prev.previousSibling;
        if (!prev) return null;
        var text = (prev.textContent || "").trim();
        return /^\d[\d   ]*$/.test(text) ? text : null;
    }

    var api = {
        numberBefore: numberBefore,
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
