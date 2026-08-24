// Оформлення текстових блоків — спільний модуль для сайту й адмінки.
//
// НАВІЩО
// -------
// Заголовки, підписи й кнопки на головній, в акціях і добірках були
// зашиті в CSS. Змінити колір тексту чи кнопки під конкретну акцію
// можна було лише правкою коду, тобто через розробника.
//
// Тепер кожен такий блок має необовʼязковий набір «style», який
// редагується в адмінці. Порожній набір = поточний вигляд сайту:
// нічого не задали — нічого й не змінилось.
//
// ЯК ЦЕ ПРАЦЮЄ
// -------------
// Модуль перетворює набір на CSS-змінні, які проставляються на корінь
// блока. Самі правила лежать у style.css і читають ці змінні зі
// значеннями за замовчуванням:
//
//     color: var(--blk-text, inherit);
//
// Тому «скинути» оформлення = прибрати значення: змінна зникає,
// спрацьовує запасне значення, блок виглядає як завжди.
//
// ЧОМУ ФАЙЛ ОДИН НА САЙТ І АДМІНКУ
// ---------------------------------
// Прев'ю в адмінці мусить показувати те саме, що побачить покупець.
// Дві копії правил розійшлися б — той самий підхід, що в
// assets/js/image-framing.js і assets/js/breadcrumbs.js.

(function (root) {

    "use strict";

    // ШРИФТИ
    //
    // Усі — безкоштовні, ліцензія SIL Open Font License, роздаються
    // через Google Fonts. Це знімає питання ліцензії наперед: їх можна
    // використовувати на комерційній вітрині без окремої покупки.
    //
    // Кожен обраний навмисно з підтримкою КИРИЛИЦІ, бо сайт
    // україномовний. Але українська має власні літери — і, ї, є, ґ, —
    // яких немає в російській кирилиці, і трапляється, що шрифт
    // «підтримує кирилицю», а цих чотирьох у ньому немає.
    //
    // Страховка на цей випадок вбудована: у stack завжди другим іде
    // Inter. Браузер підставляє запасний шрифт ПОГЛИФНО, тож навіть
    // якщо в основному шрифті бракує «ї», сторінка не зламається —
    // конкретна літера намалюється Inter. Виглядатиме неідеально, тому
    // в підказці до поля просимо перевірити українські літери очима.
    var FONTS = [
        {
            key: "inter",
            label: "Inter — як зараз (без засічок)",
            family: "Inter",
            weights: "300;400;500;600;700;800"
        },
        {
            key: "montserrat",
            label: "Montserrat — геометричний, добре для заголовків",
            family: "Montserrat",
            weights: "300;400;500;600;700;800"
        },
        {
            key: "playfair",
            label: "Playfair Display — із засічками, класика для моди",
            family: "Playfair Display",
            weights: "400;500;600;700;800"
        },
        {
            key: "lora",
            label: "Lora — із засічками, спокійний для довгого тексту",
            family: "Lora",
            weights: "400;500;600;700"
        },
        {
            key: "oswald",
            label: "Oswald — вузький, помітні короткі заголовки",
            family: "Oswald",
            weights: "300;400;500;600;700"
        },
        {
            key: "manrope",
            label: "Manrope — мʼякий без засічок",
            family: "Manrope",
            weights: "400;500;600;700;800"
        }
    ];

    var TITLE_SIZES = {
        s: "0.8",
        m: "1",
        l: "1.25",
        xl: "1.5"
    };

    var ALIGNS = { left: "left", center: "center", right: "right" };

    function fontByKey(key) {

        for (var i = 0; i < FONTS.length; i++) {
            if (FONTS[i].key === key) return FONTS[i];
        }

        return null;

    }

    // Inter другим — саме він рятує, якщо в основному шрифті бракує
    // якоїсь української літери (див. пояснення вище).
    function fontStack(key) {

        var font = fontByKey(key);

        if (!font || font.key === "inter") return null;

        return "'" + font.family + "', 'Inter', sans-serif";

    }

    function isColor(value) {
        return typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
    }

    function toPlain(value) {

        if (!value) return {};
        if (typeof value.toJS === "function") return value.toJS();

        return value;

    }

    // Набір → CSS-змінні. Порожні й некоректні значення просто
    // пропускаються: у розмітку не потрапляє нічого зайвого, і блок
    // лишається таким, яким був.
    function styleVars(style) {

        var s = toPlain(style);
        var out = {};

        var stack = fontStack(s.font);

        if (stack) out["--blk-font"] = stack;

        if (isColor(s.textColor)) out["--blk-text"] = s.textColor.trim();
        if (isColor(s.accentColor)) out["--blk-accent"] = s.accentColor.trim();
        if (isColor(s.buttonBg)) out["--blk-btn-bg"] = s.buttonBg.trim();
        if (isColor(s.buttonText)) out["--blk-btn-text"] = s.buttonText.trim();

        if (TITLE_SIZES[s.titleSize]) out["--blk-title-scale"] = TITLE_SIZES[s.titleSize];
        if (ALIGNS[s.align]) out["--blk-align"] = ALIGNS[s.align];

        if (s.uppercase) out["--blk-transform"] = "uppercase";

        // Розрядка задається в сотих em: 0 — як є, 20 — помітно
        // розріджено. Обмежуємо згори, бо надто велика розрядка
        // розриває слова й ламає верстку на телефоні.
        var tracking = Number(s.letterSpacing);

        if (isFinite(tracking) && tracking !== 0) {
            out["--blk-tracking"] = (Math.max(-5, Math.min(30, tracking)) / 100) + "em";
        }

        return out;

    }

    function styleAttr(style) {

        var vars = styleVars(style);

        return Object.keys(vars).map(function (k) { return k + ":" + vars[k]; }).join(";");

    }

    // Вантажимо ТІЛЬКИ ті шрифти, які справді десь обрані.
    //
    // Підключати всі шість завжди — це кілька сотень кілобайтів на
    // кожне відкриття сторінки заради шрифту, яким, можливо, ніхто не
    // користується. Inter уже підключений у розмітці, тож його
    // пропускаємо.
    function ensureFonts(styles) {

        var wanted = {};

        (styles || []).forEach(function (style) {

            var key = toPlain(style).font;
            var font = fontByKey(key);

            if (font && font.key !== "inter") wanted[font.key] = font;

        });

        Object.keys(wanted).forEach(function (key) {

            var id = "blk-font-" + key;

            if (document.getElementById(id)) return;

            var font = wanted[key];

            var link = document.createElement("link");

            link.id = id;
            link.rel = "stylesheet";
            link.href = "https://fonts.googleapis.com/css2?family="
                + font.family.replace(/ /g, "+")
                + ":wght@" + font.weights
                + "&display=swap";

            document.head.appendChild(link);

        });

    }

    root.TextStyles = {
        FONTS: FONTS,
        TITLE_SIZES: TITLE_SIZES,
        fontByKey: fontByKey,
        fontStack: fontStack,
        styleVars: styleVars,
        styleAttr: styleAttr,
        ensureFonts: ensureFonts
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).TextStyles;
}
