// Живий залишок: наявність не з каталогу, а з бази.
//
// НАВІЩО
// -------
// Наявність на сайті бралась із зібраного data/products.json, а він
// перезбирається раз на десять хвилин. Тобто картка могла обіцяти
// «в наявності» товар, якого вже немає — і покупець дізнавався про це
// не на сайті, а від власника.
//
// Захист від подвійного продажу (supabase/migrations/011) цього не
// закривав: він не дає ДВОМ замовленням зайняти одну одиницю, але
// нічого не змінює на сторінці, яку людина зараз читає.
//
// ЩО ЦЕЙ МОДУЛЬ РОБИТЬ
// ---------------------
// Питає базу один раз на завантаження сторінки — «що з цього ще є» —
// і переносить відповідь у ті самі поля, з яких сайт уже читає
// наявність (variant.stock). Далі працюють ті самі правила
// (assets/js/stock.js): жодне місце, яке показує «під замовлення», не
// довелось переписувати.
//
// ЧОМУ «ТАК/НІ», А НЕ ЧИСЛО
// --------------------------
// База віддає лише наявність, без кількостей: скільки саме одиниць на
// полиці — відомості про оберти магазину, і сайт їх ніде не показує.
// Для «під замовлення» досить «так/ні».
//
// ЩО БУДЕ, ЯКЩО БАЗА НЕ ВІДПОВІСТЬ
// ---------------------------------
// Нічого. Сайт покаже наявність із каталогу — як робив досі. Живий
// залишок тут уточнення, а не умова роботи: магазин, який не
// відкривається через недоступну базу, гірший за магазин із
// десятихвилинною похибкою в наявності.

(function (root) {

    "use strict";

    // Скільки чекаємо на базу.
    //
    // Запит іде паралельно з каталогом, тож зазвичай устигає раніше.
    // Але сторінка не має чекати на нього: 1,2 с — межа, після якої
    // краще показати каталог із трохи застарілою наявністю, ніж
    // тримати людину перед порожнім екраном.
    var TIMEOUT = 1200;

    var pending = null;

    function cell(id, color, size) {
        return String(id) + "|" + String(color || "") + "|" + String(size || "");
    }

    // Один запит на завантаження сторінки. Повторні виклики отримують
    // ту саму обіцянку: каталог і сторінка товару можуть спитати
    // незалежно, а запит буде один.
    function load() {

        if (pending) return pending;

        pending = fetchLive();

        return pending;

    }

    // Клієнт Supabase — через typeof, а не через root.
    //
    // ЧОМУ. У assets/js/supabase-client.js він оголошений як
    // `const supabaseClient`, а top-level const у звичайному скрипті
    // НЕ стає властивістю window: інші файли звертаються до нього
    // просто по імені. Читання root.supabaseClient давало undefined
    // завжди — тобто живий залишок мовчки не працював, і жоден тест
    // цього не бачив, бо в Node клієнта немає й так.
    function supabase() {

        if (typeof supabaseClient !== "undefined" && supabaseClient) return supabaseClient;

        return root.supabaseClient || null;

    }

    function fetchLive() {

        var client = supabase();

        if (!client || !client.rpc) return Promise.resolve(null);

        var timer;

        var timeout = new Promise(function (resolve) {
            timer = setTimeout(function () { resolve(null); }, TIMEOUT);
        });

        var request = client.rpc("stock_live")
            .then(function (result) {

                if (result.error) {
                    console.warn("Живий залишок недоступний:", result.error.message);
                    return null;
                }

                var map = new Map();

                (result.data || []).forEach(function (row) {
                    map.set(cell(row.product_id, row.color, row.size), row.available === true);
                });

                return map;

            })
            .catch(function (error) {

                console.warn("Живий залишок недоступний:", error && error.message);

                return null;

            })
            .finally(function () { clearTimeout(timer); });

        return Promise.race([request, timeout]);

    }

    // Переносимо відповідь бази в товари.
    //
    // Правило одне: там, де база каже «немає», ставимо явний 0 —
    // саме так «закінчився» позначається в даних. Клітинок, про які
    // база не знає (залишки не рахуються), не чіпаємо: порожнє — це
    // «не рахуємо», а не нуль.
    function apply(products, live) {

        if (!live || !live.size || !Array.isArray(products)) return 0;

        var Stock = root.Stock;

        var changed = 0;

        products.forEach(function (product) {

            if (!product || !Array.isArray(product.variants)) return;

            var touched = false;

            product.variants.forEach(function (variant) {

                var stock = variant && variant.stock;

                if (!stock || typeof stock !== "object") return;

                Object.keys(stock).forEach(function (size) {

                    var known = live.get(cell(product.id, variant.color, size));

                    if (known === undefined) return;

                    var was = stock[size];
                    var now = known ? Math.max(Number(was) || 0, 1) : 0;

                    if (was === now) return;

                    stock[size] = now;

                    touched = true;
                    changed++;

                });

            });

            if (!touched || !Stock) return;

            // Перерахунок «під замовлення».
            //
            // У зібраному каталозі це вже ГОТОВА відповідь, а не
            // перемикач з адмінки: build-products.js пише в preOrder
            // результат. Тому перемикач їде окремим полем
            // (preOrderAlways) — без нього товар, який колись
            // закінчився, лишався б «під замовлення» назавжди, навіть
            // коли база каже, що він знову є.
            product.preOrder = product.preOrderAlways === true
                || Stock.productSoldOut(product);

            product.variants.forEach(function (variant) {
                variant.preOrder = product.preOrderAlways === true
                    || Stock.colorSoldOut(
                        Stock.variantStock(product, variant),
                        Stock.sizesOf(product, variant)
                    );
            });

        });

        return changed;

    }

    // Каталог і сторінка товару кличуть це одним рядком: дочекатись
    // бази (але не довше TIMEOUT) і перенести відповідь у товари.
    function refresh(products) {

        return load().then(function (live) {
            return apply(products, live);
        });

    }

    root.LiveStock = {
        load: load,
        apply: apply,
        refresh: refresh,
        cell: cell,
        TIMEOUT: TIMEOUT
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).LiveStock;
}
