// Кадрування фото товару — спільна математика для сайту й адмінки.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Адмінка має показувати фото рівно так, як його побачить покупець.
// Якщо ці обчислення продублювати в assets/js (сайт) і в admin/ (прев'ю),
// вони рано чи пізно розійдуться — і прев'ю почне брехати. Тому файл
// один, і його підключають обидві сторони:
//
//   product.html / catalog.html …  → <script src="/assets/js/image-framing.js">
//   admin/index.html               → <script src="../assets/js/image-framing.js">
//
// ЩО САМЕ ЗБЕРІГАЄТЬСЯ
// ---------------------
// У товарі лежить поле framing — словник «ім'я файлу → рамка»:
//
//   "framing": {
//     "jimmy-choo-nena-s-807.webp": { "zoom": 1.35, "x": 50, "y": 42 }
//   }
//
//   zoom — у скільки разів наблизити (1 = усе фото цілком);
//   x, y — точка кадру у відсотках, яка лишається на місці при
//          наближенні (та сама ідея, що «фокусна точка»).
//
// Оригінал не чіпається: це ЛИШЕ опис того, як його показувати.
// Прибрали рамку — фото знову видно повністю. Саме тому підхід
// названий неруйнівним: жоден піксель не втрачається, і кадрування
// можна переграти будь-коли, зокрема після заміни фото.
//
// ЧОМУ РАМКА НАКЛАДАЄТЬСЯ НА ВЖЕ НОРМАЛІЗОВАНЕ ФОТО
// --------------------------------------------------
// scripts/normalize-product-images.js вписує (fit: contain) знімок у
// холст 1200×1500. «Вписує» означає, що на холсті лежить ВЕСЬ вихідний
// кадр, лише зменшений і з полями. Тобто обрізати холст — те саме, що
// обрізати оригінал, і окремо зберігати оригінали не потрібно.
//
// Ключ словника — ім'я файлу без теки. Так рамка живе разом із фото, а
// не з позицією в списку: переставили фото місцями або перенесли його
// в інший колір — кадрування їде за ним.

(function (root) {

    "use strict";

    // Межі навмисно вузькі. Понад 3× холст 1200×1500 дає менш ніж
    // 400px по ширині — у картці на retina це вже помітна каша.
    var MIN_ZOOM = 1;
    var MAX_ZOOM = 3;

    // Число в межах або значення за замовчуванням.
    //
    // fallback, а не min: для точки фокуса «не задано» означає центр
    // (50), а не лівий край. Раніше тут стояв Number(value) без
    // перевірки на null — а Number(null) це 0, тож рамка з x: null
    // мовчки зсувала кадр до лівого краю замість того, щоб лишити
    // його по центру.
    function clamp(value, min, max, fallback) {

        if (value === null || value === undefined || value === "") {
            return fallback === undefined ? min : fallback;
        }

        var num = Number(value);

        if (!isFinite(num)) return fallback === undefined ? min : fallback;

        return num < min ? min : (num > max ? max : num);

    }

    // "/assets/images/products/uploads/a.webp" → "a.webp"
    function imageKey(src) {
        return String(src || "").split("?")[0].split("#")[0].split("/").pop();
    }

    // Рамка з довільного (можливо, кривого) значення → завжди валідна.
    function normalizeFrame(frame) {

        if (!frame || typeof frame !== "object") return null;

        var zoom = clamp(frame.zoom, MIN_ZOOM, MAX_ZOOM, MIN_ZOOM);
        var x = clamp(frame.x, 0, 100, 50);
        var y = clamp(frame.y, 0, 100, 50);

        // Порожня рамка — це 1× І центр. Раніше вистачало самого 1×,
        // бо кадрування було лише для товару: там фото 4:5 лежить у
        // контейнері 4:5, нічого не обрізається, і точка фокуса без
        // наближення справді нічого не міняла.
        //
        // Для банера й акції це не так: контейнер має ІНШУ пропорцію,
        // кадр обрізається завжди, і точка фокуса вирішує, що саме
        // лишиться видимим — навіть при 1×. Тому тепер зберігаємо і її.
        if (zoom === MIN_ZOOM && x === 50 && y === 50) return null;

        return { zoom: zoom, x: x, y: y };

    }

    function frameFor(framing, src) {

        if (!framing) return null;

        // приймаємо і звичайний обʼєкт, і Immutable Map з адмінки
        var raw = typeof framing.get === "function"
            ? framing.get(imageKey(src))
            : framing[imageKey(src)];

        if (raw && typeof raw.toJS === "function") raw = raw.toJS();

        return normalizeFrame(raw);

    }

    // CSS-змінні для <img>. Саме змінні, а не готовий transform:
    // у картці каталогу вже є свій transform на :hover (збільшення на
    // 8%), і якби ми писали transform напряму, одне перебивало б інше.
    // Правила в style.css перемножують наближення з ховером.
    function frameStyleObject(framing, src) {

        var frame = frameFor(framing, src);

        if (!frame) return {};

        // Три змінні на всі випадки — стилі беруть те, що їм підходить:
        //
        //   товар   transform: scale(--frame-zoom) з transform-origin —
        //           фото і контейнер однієї пропорції, обрізати нічого,
        //           треба наблизити;
        //   акція   object-position: --frame-x --frame-y при object-fit:
        //           cover — пропорції різні, кадр ріжеться, і точка
        //           вирішує, що лишиться;
        //   банер   background-position з тими самими числами.
        return {
            "--frame-zoom": String(frame.zoom),
            "--frame-x": frame.x + "%",
            "--frame-y": frame.y + "%"
        };

    }

    // те саме, але рядком — для шаблонів, які клеять HTML
    function frameStyleAttr(framing, src) {

        var style = frameStyleObject(framing, src);
        var out = [];

        Object.keys(style).forEach(function (key) {
            out.push(key + ":" + style[key]);
        });

        return out.join(";");

    }

    // Кадр для ФОНОВОГО зображення (background-image).
    //
    // Свотч кольору й мініатюри показують фото через background, а не
    // <img>, тож transform до них не застосуєш. Але математика та сама:
    // «наблизити в N разів» для фону — це background-size у N×100%, а
    // точка фокуса — background-position.
    //
    // Тримати це тут, а не дублювати на місці, важливо: інакше свотч і
    // велике фото показували б різні кадри одного знімка.
    function frameBackgroundStyle(framing, src) {

        var frame = frameFor(framing, src);

        if (!frame) return "";

        return "background-size:" + Math.round(frame.zoom * 100) + "%"
            + ";background-position:" + frame.x + "% " + frame.y + "%";

    }

    root.ImageFraming = {
        MIN_ZOOM: MIN_ZOOM,
        MAX_ZOOM: MAX_ZOOM,
        imageKey: imageKey,
        normalizeFrame: normalizeFrame,
        frameFor: frameFor,
        frameStyleObject: frameStyleObject,
        frameStyleAttr: frameStyleAttr,
        frameBackgroundStyle: frameBackgroundStyle
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).ImageFraming;
}
