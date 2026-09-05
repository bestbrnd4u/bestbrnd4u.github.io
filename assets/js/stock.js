// ======================================
// Залишки товару
//
// НАВІЩО
// -------
// «Під замовлення» досі був перемикачем: хтось мусив згадати, що
// сумка скінчилась, і піти в адмінку його ввімкнути. Поки не згадав —
// сайт обіцяв доставку за 1–3 дні те, чого немає на складі.
//
// Тепер у товару є залишки: скільки чого лишилось, по кожному кольору
// й розміру. Коли лишилось нуль — товар САМ показується як «під
// замовлення», без окремої дії.
//
// ЩО ЦЕ НЕ РОБИТЬ
// ----------------
// Залишок не зменшується сам після замовлення. Замовлення живуть у
// Supabase, товари — у репозиторії, і автоматичне списання означало б
// зовсім іншу систему. Тут число ставить людина: подивилась
// «Замовлення» в адмінці, порахувала, вписала.
//
// ГОЛОВНЕ ПРАВИЛО
// ----------------
// Порожня клітинка — це НЕ нуль, а «не рахуємо». Товар вважається
// закінченим, лише коли по КОЖНОМУ розміру кольору стоїть явний 0.
//
// Інакше було б так: менеджер заповнив залишки одного кольору з
// трьох — і два інші мовчки поїхали в «під замовлення». Помилка
// тиха, а коштує продажів.
//
// ДЕ ЦЕ ЗАСТОСОВУЄТЬСЯ
// ---------------------
// Один модуль на три сторони, щоб правило не розійшлося:
//   • scripts/build-products.js — рахує підсумок при збірці й кладе
//     готовий preOrder у data/products.json, тож картка, сторінка
//     товару, статичні сторінки, бот і кошик працюють як раніше;
//   • assets/js/product.js — позначає розміри, яких немає;
//   • admin/stock-widget.js і admin/preview-templates.js — та сама
//     арифметика в адмінці, ще до публікації.
// ======================================

(function (root) {

    // Скільки лишилось — завжди ціле й невід'ємне. Усе інше (порожній
    // рядок, текст, від'ємне) означає «не рахуємо».
    function qty(value) {

        if (value === null || value === undefined || value === "") return null;

        var number = Number(value);

        if (!Number.isFinite(number)) return null;

        number = Math.floor(number);

        return number >= 0 ? number : null;

    }

    // Словник «розмір → скільки», очищений від сміття.
    function normalizeStock(value) {

        var out = {};

        if (!value || typeof value !== "object") return out;

        Object.keys(value).forEach(function (size) {

            var n = qty(value[size]);

            if (n !== null) out[String(size)] = n;

        });

        return out;

    }

    // Залишки конкретного кольору.
    //
    // Після збірки вони лежать у самому варіанті (variant.stock) — так
    // їх бачить сайт. У джерелі з адмінки вони лежать одним словником
    // на товар, за назвою кольору (product.stock["Бежевий"]) — так їх
    // редагують. Читаємо обидві форми: інакше прев'ю в адмінці
    // показувало б не те, що сайт.
    function variantStock(product, variant) {

        if (variant && variant.stock) return normalizeStock(variant.stock);

        var byColor = product && product.stock;

        if (byColor && typeof byColor === "object" && variant && variant.color) {

            return normalizeStock(byColor[variant.color]);

        }

        return {};

    }

    // Чи взагалі рахуємо залишки цього кольору.
    function tracked(stock) {
        return Object.keys(stock || {}).length > 0;
    }

    function total(stock) {

        return Object.keys(stock || {}).reduce(function (sum, size) {
            return sum + stock[size];
        }, 0);

    }

    // Скільки лишилось конкретного розміру: число або null, якщо не
    // рахуємо.
    function sizeQty(stock, size) {

        if (!stock) return null;

        var value = stock[String(size)];

        return typeof value === "number" ? value : null;

    }

    // Розміру немає в наявності — саме ЦЬОГО розміру.
    //
    // Не плутати з «товар закінчився»: у кросівок 39-го може не бути, а
    // 40-й лежить на складі.
    function sizeSoldOut(stock, size) {
        return sizeQty(stock, size) === 0;
    }

    // Колір закінчився — коли по кожному його розміру стоїть явний 0.
    //
    // sizes — перелік розмірів саме цього кольору (getVariantSizes на
    // сайті). Якщо переліку немає, дивимось на те, що є у словнику.
    function colorSoldOut(stock, sizes) {

        if (!tracked(stock)) return false;

        var list = (sizes && sizes.length) ? sizes : Object.keys(stock);

        return list.every(function (size) { return sizeQty(stock, size) === 0; });

    }

    // Розміри кольору. Своя копія getVariantSizes із common.js:
    // модуль читають і збірка, і адмінка, де common.js немає.
    function sizesOf(product, variant) {

        if (variant && Array.isArray(variant.sizes) && variant.sizes.length) return variant.sizes;

        return (product && Array.isArray(product.sizes)) ? product.sizes : [];

    }

    // -------------------------
    // Підсумок по товару
    // -------------------------

    function variants(product) {

        var list = product && product.variants;

        return Array.isArray(list) && list.length ? list : [null];

    }

    function productTracked(product) {

        return variants(product).some(function (variant) {
            return tracked(variantStock(product, variant));
        });

    }

    function productTotal(product) {

        return variants(product).reduce(function (sum, variant) {
            return sum + total(variantStock(product, variant));
        }, 0);

    }

    // Товар закінчився — коли закінчився КОЖЕН колір.
    //
    // Один колір із трьох на нулі товар не ховає: у каталозі він
    // окремою карткою (splitByColor) або вибором на сторінці, і решта
    // кольорів продається як раніше.
    function productSoldOut(product) {

        if (!productTracked(product)) return false;

        return variants(product).every(function (variant) {

            var stock = variantStock(product, variant);

            // Колір, по якому нічого не рахують, вважається наявним —
            // інакше заповнення одного кольору ховало б решту.
            if (!tracked(stock)) return false;

            return colorSoldOut(stock, sizesOf(product, variant));

        });

    }

    // -------------------------
    // «Під замовлення»
    //
    // Перемикач в адмінці нікуди не дівся: ним позначають товар, який
    // возять під замовлення завжди, скільки б його не було на складі.
    // Залишки додають друге джерело тієї самої відповіді.
    // -------------------------

    function isPreOrder(product) {
        return Boolean(product && product.preOrder) || productSoldOut(product);
    }

    function colorPreOrder(product, variant) {

        if (product && product.preOrder) return true;

        return colorSoldOut(variantStock(product, variant), sizesOf(product, variant));

    }

    function sizePreOrder(product, variant, size) {

        if (product && product.preOrder) return true;

        return sizeSoldOut(variantStock(product, variant), size);

    }

    root.Stock = {
        qty: qty,
        normalizeStock: normalizeStock,
        variantStock: variantStock,
        tracked: tracked,
        total: total,
        sizeQty: sizeQty,
        sizeSoldOut: sizeSoldOut,
        colorSoldOut: colorSoldOut,
        sizesOf: sizesOf,
        productTracked: productTracked,
        productTotal: productTotal,
        productSoldOut: productSoldOut,
        isPreOrder: isPreOrder,
        colorPreOrder: colorPreOrder,
        sizePreOrder: sizePreOrder
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).Stock;
}
