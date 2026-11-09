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

    // Чи лишилась частина неперекладеною. Однієї перевірки літер для
    // російської мало: «що нещодавно зʼявились» не має жодної з і ї є ґ,
    // і шаблон підставляв його в російське речення як є. Тож ще й так:
    // повернулось без змін і в словнику такого немає — не перекладено.
    // («Сумки» → «Сумки» законно однакові: вони в словнику є.)
    function leftUntranslated(text, next, translate, lang) {
        if (!/[а-яіїєґ]/i.test(text)) return false;
        if (stillUkrainian(next, lang)) return true;
        if (next !== text) return false;
        var bare = String(text).replace(/[\s:.,;!?…]+$/, "");
        return !(translate.has && translate.has(bare));
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
            if (cap !== undefined && leftUntranslated(cap, translate(cap), translate, lang)) return null;
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

            // Те саме для шаблонів і чисел: «Ціни від 4 000 ₴ до 8 600 ₴.»
            // наприкінці речення. Коротший рядок — рекурсія скінченна.
            if (punct) {
                var bare = translate(punct[1]);
                if (bare !== punct[1] && !stillUkrainian(bare, lang)) return lead + bare + punct[2] + tail;
            }

            // «🚚 Орієнтовно у відділенні…», «↩ Відмова»: значок чи стрілка
            // перед текстом. Шаблони прив'язані до початку рядка й на ньому
            // не збігались — перекладаємо без значка й повертаємо його.
            var icon = norm.match(/^([^\p{L}\p{N}«"(]+)(\S.*)$/u);

            if (icon) {
                var rest = translate(icon[2]);
                if (rest !== icon[2]) return lead + icon[1] + rest + tail;
            }

            // «Дивитись усі товари →» — те саме, коли стрілка в кінці.
            var trailing = norm.match(/^(.*[\p{L}\p{N}»")])(\s*[^\p{L}\p{N}\s«»"()]+)$/u);

            if (trailing) {
                var head = translate(trailing[1]);
                if (head !== trailing[1] && !stillUkrainian(head, lang)) return lead + head + trailing[2] + tail;
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
                    if (leftUntranslated(parts[i], next, translate, lang)) mixed = true;
                    if (next !== parts[i]) { parts[i] = next; changed = true; }
                }
                // Як і з підстановками: частина лишилась українською —
                // цілий рядок, а не «Чоловіча сумка … — 6 000 UAH».
                if (changed && !mixed) return lead + parts.join(" ") + tail;
            }

            // «Чоловічі сумки, Жіночі сумки, Гаманці», «Унісекс, Жінкам»:
            // перелік значень через кому. Перекладаємо, лише якщо
            // перекладено кожне — інакше це звичайне речення з комою.
            var list = eachPart(norm.split(/(,\s*)/));
            if (list !== null) return lead + list + tail;

            // «Чорний / жовтий» — складений колір.
            var slashed = eachPart(norm.split(/(\s\/\s)/));
            if (slashed !== null) return lead + slashed + tail;

            // «Чорний: Чорний, Чорний / жовтий, Хакі» — підказка групи
            // кольорів: підпис і перелік, кожне перекладаємо окремо.
            var labelled = norm.match(/^([^:]+)(:\s+)(.+)$/);
            if (labelled) {
                var both = eachPart([labelled[1], labelled[2], labelled[3]]);
                if (both !== null) return lead + both + tail;
            }

            // «9 моделей у наявності… Ціни від… Бренди: Coach, JW PEI.» —
            // підсумок сторінки складено з речень у різних поєднаннях.
            // Так само: лише якщо перекладено кожне речення.
            // «Стильні кросівки Lacoste L003 … натхненним тенісною…» —
            // опис товару, обрізаний для meta description (і збіркою, і
            // product.js, кожен по-своєму). Цілим рядком такого ключа
            // немає, але є повний опис, що з нього починається: беремо
            // його переклад і ріжемо до тієї ж довжини. Початок довгий —
            // випадковий збіг з іншим текстом неможливий.
            var cut = truncated(norm);
            if (cut !== null) return lead + cut + tail;

            // Без lookbehind: старий Safari на ньому не розбирає весь файл.
            var found = norm.match(/[^.!?…]+(?:[.!?…]+|$)/g) || [];
            if (found.length > 1) {
                var joined = [];
                found.forEach(function (s) { joined.push(s.trim(), " "); });
                joined.pop();
                var sentences = eachPart(joined);
                if (sentences !== null) return lead + sentences + tail;
            }

            return raw;

        }

        var MIN_TRUNCATED_PREFIX = 60;
        var exactKeys = null;

        function truncated(norm) {
            if (norm.slice(-1) !== "…") return null;
            var prefix = norm.slice(0, -1).trim();
            if (prefix.length < MIN_TRUNCATED_PREFIX) return null;
            if (!exactKeys) exactKeys = Object.keys(exact);
            for (var k = 0; k < exactKeys.length; k++) {
                var key = exactKeys[k];
                if (key.length <= prefix.length || key.indexOf(prefix) !== 0) continue;
                var full = normalize(exact[key]);
                if (full.length <= norm.length) return full;
                var piece = full.slice(0, norm.length);
                var space = piece.lastIndexOf(" ");
                return (space > 0 ? piece.slice(0, space) : piece).replace(/[\s,;:—–-]+$/, "") + "…";
            }
            return null;
        }

        // Частини через роздільник (парні — текст, непарні — роздільник).
        // null, якщо частина одна або хоч одна лишилась неперекладеною.
        function eachPart(pieces) {
            if (pieces.length < 3) return null;
            for (var j = 0; j < pieces.length; j += 2) {
                if (!/[а-яіїєґ]/i.test(pieces[j])) continue;
                var next = translate(pieces[j]);
                if (leftUntranslated(pieces[j], next, translate, lang)) return null;
                pieces[j] = next;
            }
            return pieces.join("");

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

    // Абсолютна адреса сторінки сайту → та сама мовою lang, теж абсолютна.
    //
    // Для canonical і og:url. product.js і catalog.js ставлять їх уже в
    // браузері — від SITE_URL або location.origin, без мови. На /en/p/…
    // canonical після завантаження вказував на українську сторінку: тобто
    // англійська сама оголошувала себе копією, і Google мав би її
    // викинути з видачі. extraOrigin — location.origin у браузері
    // (localhost, превʼю), бо isPageHref знає лише бойові домени.
    function localizeAbsolute(url, lang, extraOrigin) {
        var m = String(url || "").match(/^(https?:\/\/[^\/?#]+)(.*)$/i);
        if (!m || lang === DEFAULT_LANG) return url;
        var own = /^https?:\/\/(dev\.)?bestbrnd4u\.com$/i.test(m[1]) || (extraOrigin && m[1] === extraOrigin);
        var rest = m[2] || "/";
        if (!own || !isPageHref(rest)) return url;
        return m[1] + localizeHref(rest, lang);
    }

    // Розмітка schema.org (JSON-LD) мовою lang.
    //
    // Текст — тим самим перекладачем, що й сторінка: назва товару в
    // розмітці мусить збігатися з видимою, інакше Google бачить дві
    // різні речі на одній адресі. Адреси сторінок — з мовним префіксом.
    //
    // НЕ ЧІПАЄМО: @id (це імʼя сутності — організація одна на всі мови),
    // ідентифікатори (sku, mpn, gtin), картинки й лого (isPageHref і так
    // їх пропускає), sameAs (зовнішні профілі).
    var LD_KEEP = /^(@id|@context|@type|sku|mpn|gtin\d*|sameAs|email|telephone|priceCurrency|postalCode)$/;
    var LD_LANG = { uk: "uk-UA", en: "en", ru: "ru" };

    function localizeJsonLd(data, translate, lang, extraOrigin) {
        if (lang === DEFAULT_LANG) return data;
        var visit = function (value, key) {
            if (Array.isArray(value)) return value.map(function (v) { return visit(v, key); });
            if (value && typeof value === "object") {
                var out = {};
                Object.keys(value).forEach(function (k) { out[k] = visit(value[k], k); });
                return out;
            }
            if (typeof value !== "string" || (key && LD_KEEP.test(key))) return value;
            if (key === "inLanguage") return LD_LANG[lang] || lang;
            if (/^https?:\/\//i.test(value)) return localizeAbsolute(value, lang, extraOrigin);
            if (/[а-яіїєґ]/i.test(value)) return translate(value);
            return value;
        };
        return visit(data, null);
    }

    var api = {
        localizeAbsolute: localizeAbsolute,
        localizeJsonLd: localizeJsonLd,
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
