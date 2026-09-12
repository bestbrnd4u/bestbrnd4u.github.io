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

    // МНОЖНИКИ, А НЕ ПІКСЕЛІ.
    //
    // Розмір задається відносно ВЛАСНОГО розміру блока: на банері
    // сторінки акції заголовок 42px, у блоці «Ціна дня» — 30px, у
    // картці — 19px. Один список пікселів на всіх зробив би «Більший»
    // велетенським в одному місці й непомітним в іншому, а на телефоні
    // ще й поламав би верстку — там у кожного блока свій розмір.
    //
    // Самі «власні розміри» блоки називають самі, змінною
    // --blk-title-base у style.css. Поки її не було, множили на 1em:
    // заголовок акції падав із 42px до 16px від самого лише факту, що
    // в блоці щось налаштували. Власник це й побачив — «розмір став
    // маленьким, а поле нічого не збільшує».
    var TITLE_SIZES = {
        s: "0.8",
        m: "1",
        l: "1.25",
        xl: "1.5"
    };

    // Опис — свій множник. Той самий набір значень, але окреме поле:
    // великий заголовок із дрібним описом під ним цілком доречний, а
    // одне поле на двох такого не дозволяло б.
    var TEXT_SIZES = TITLE_SIZES;

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

        // Бейдж і таймер — окремі кольори, а не «колір кнопки».
        //
        // Обидва за замовчуванням червоні (--danger), бо мають кричати.
        // Але акція буває й спокійною: на пастельному банері червона
        // пляма — єдине, що видно. Тепер це вирішує власник.
        if (isColor(s.badgeBg)) out["--blk-badge-bg"] = s.badgeBg.trim();
        if (isColor(s.badgeText)) out["--blk-badge-text"] = s.badgeText.trim();
        if (isColor(s.timerBg)) out["--blk-timer-bg"] = s.timerBg.trim();
        if (isColor(s.timerText)) out["--blk-timer-text"] = s.timerText.trim();

        if (TITLE_SIZES[s.titleSize]) out["--blk-title-scale"] = TITLE_SIZES[s.titleSize];
        if (TEXT_SIZES[s.textSize]) out["--blk-text-scale"] = TEXT_SIZES[s.textSize];
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

    // ТУТ БУВ mergeStyles() — ЗЛИТТЯ ДВОХ НАБОРІВ В ОДИН.
    //
    // Банер акції й блок на головній стоять на різному тлі: на банері
    // текст лежить на фото й мусить бути світлим, на головній — на
    // світлій сторінці й мусить бути темним. Задум був такий: набір у
    // акції спільний, а «на головній» перекриває лише те, що в ньому
    // справді заповнене.
    //
    // Вийшло навпаки. Кольори підбирають під ФОТО банера, і на світлу
    // головну вони приїжджали цілком: червоний заголовок банера робив
    // червоним і заголовок на головній. Щоб цього НЕ сталося, набір
    // «на головній» доводилось заповнювати — тобто його заповнювали
    // не щоб змінити вигляд, а щоб зберегти звичайний.
    //
    // Тепер набори незалежні, і зливати нема чого. Пояснення цілком —
    // у promoHomeStyle() в assets/js/app.js.

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
