// ======================================
// Каталог для віджетів адмінки: товари й дерево «розділ → категорія»
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Цим користуються два віджети:
//
//   admin/product-picker.js   вибір товарів акції (і добірки) —
//                             пошук плюс «додати цілим розділом»;
//   admin/section-picker.js   розділи, які акція підхоплює сама.
//
// Друга копія завантаження й підрахунків розійшлася б із першою на
// першій же правці, а розходження тут означає, що в одному місці
// «Сумки 45», а в іншому «Сумки 47».
//
// ЗВІДКИ ДАНІ
// ------------
// Зі зібраних data/products.json і data/categories.json — тих самих
// файлів, якими живе сам сайт. Тобто в списку рівно те, що зараз
// опубліковано. Свіжо доданий товар зʼявиться тут після того, як
// відпрацює збірка (кілька хвилин), — так само, як він зʼявляється в
// каталозі.
// ======================================

(function (root) {

    "use strict";

    var productsCache = null;
    var categoriesCache = null;

    function loadProducts() {

        if (productsCache) return productsCache;

        productsCache = fetch("../data/products.json")
            .then(function (r) { return r.ok ? r.json() : []; })
            .then(function (list) { return Array.isArray(list) ? list : []; })
            .catch(function () { return []; });

        return productsCache;

    }

    function loadCategories() {

        if (categoriesCache) return categoriesCache;

        categoriesCache = fetch("../data/categories.json")
            .then(function (r) { return r.ok ? r.json() : []; })
            .then(function (list) { return Array.isArray(list) ? list : []; })
            .catch(function () { return []; });

        return categoriesCache;

    }

    // Дерево розділів із кількостями.
    //
    // Належність категорії до розділу беремо з довідника, а КІЛЬКОСТІ
    // рахуємо по самих товарах: у довіднику може бути записано що
    // завгодно, а в акцію піде рівно те, що справді є в каталозі.
    function buildGroups(products, categories) {

        var deptOf = {};

        (categories || []).forEach(function (c) {
            if (c && c.name) deptOf[c.name] = c.department || "Інше";
        });

        var byDept = {};

        (products || []).forEach(function (p) {

            var cat = p && p.category;

            if (!cat) return;

            var dept = deptOf[cat] || "Інше";

            if (!byDept[dept]) byDept[dept] = { ids: [], cats: {} };
            if (!byDept[dept].cats[cat]) byDept[dept].cats[cat] = [];

            byDept[dept].ids.push(Number(p.id));
            byDept[dept].cats[cat].push(Number(p.id));

        });

        // Найбільші розділи вгорі: саме їх беруть цілком найчастіше.
        return Object.keys(byDept)
            .sort(function (a, b) { return byDept[b].ids.length - byDept[a].ids.length; })
            .map(function (dept) {

                var cats = byDept[dept].cats;

                return {
                    name: dept,
                    ids: byDept[dept].ids,
                    cats: Object.keys(cats)
                        .sort(function (a, b) { return cats[b].length - cats[a].length; })
                        .map(function (cat) { return { name: cat, ids: cats[cat] }; })
                };

            });

    }

    // Готове дерево одним викликом — обидва віджети починають з нього.
    function loadGroups() {

        return Promise.all([loadProducts(), loadCategories()])
            .then(function (both) {
                return { products: both[0], groups: buildGroups(both[0], both[1]) };
            });

    }

    root.CatalogTree = {
        loadProducts: loadProducts,
        loadCategories: loadCategories,
        buildGroups: buildGroups,
        loadGroups: loadGroups
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).CatalogTree;
}
