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

    function clamp(value, min, max) {
        value = Number(value);
        if (!isFinite(value)) return min;
        return value < min ? min : (value > max ? max : value);
    }

    // "/assets/images/products/uploads/a.webp" → "a.webp"
    function imageKey(src) {
        return String(src || "").split("?")[0].split("#")[0].split("/").pop();
    }

    // Рамка з довільного (можливо, кривого) значення → завжди валідна.
    function normalizeFrame(frame) {

        if (!frame || typeof frame !== "object") return null;

        var zoom = clamp(frame.zoom === undefined ? 1 : frame.zoom, MIN_ZOOM, MAX_ZOOM);

        // zoom = 1 нічого не змінює, тож і зберігати нема чого
        if (zoom === MIN_ZOOM) return null;

        return {
            zoom: zoom,
            x: clamp(frame.x === undefined ? 50 : frame.x, 0, 100),
            y: clamp(frame.y === undefined ? 50 : frame.y, 0, 100)
        };

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

    root.ImageFraming = {
        MIN_ZOOM: MIN_ZOOM,
        MAX_ZOOM: MAX_ZOOM,
        imageKey: imageKey,
        normalizeFrame: normalizeFrame,
        frameFor: frameFor,
        frameStyleObject: frameStyleObject,
        frameStyleAttr: frameStyleAttr
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).ImageFraming;
}
