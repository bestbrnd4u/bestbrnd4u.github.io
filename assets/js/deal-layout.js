// Розкладка блока «Ціна дня» — спільний модуль для сайту, збірки й адмінки.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// У блоку чотири рухомі частини: банер, ряд товарів, напис і таймер.
// Кожну можна поставити ліворуч або праворуч, і деякі поєднання
// неможливі — два елементи не стануть в одне місце.
//
// Це правило потрібне ТРЬОМ сторонам одразу:
//
//   сайт     малює блок за ним;
//   збірка   попереджає власника в журналі;
//   адмінка  показує конфлікт прямо в прев'ю, поки його правлять.
//
// Три копії розійшлися б — і адмінка обіцяла б одне, а сайт малював
// інше. Той самий підхід, що в assets/js/image-framing.js і
// assets/js/text-styles.js: один файл, троє читачів.
//
// ЧОМУ КОНФЛІКТ НЕ ЗАБОРОНЯЄТЬСЯ, А РОЗВ'ЯЗУЄТЬСЯ
// ------------------------------------------------
// Decap не вміє перевіряти поля одне проти одного — у ньому немає
// умовної валідації. Заборонити збереження нічим.
//
// Тому робимо інакше: блок ЗАВЖДИ малюється осмислено, а про
// суперечність кажемо вголос — і в журналі збірки, і в прев'ю. Мовчки
// намальований поламаний блок був би гіршим за обидва.

(function (root, factory) {

    var api = factory();

    if (typeof module === "object" && module.exports) module.exports = api;

    root.DealLayout = api;

}(typeof self !== "undefined" ? self : this, function () {

    "use strict";

    var SIDES = ["left", "right"];
    var ALIGNS = ["left", "center", "right"];

    function pick(value, allowed, fallback) {
        return allowed.indexOf(value) !== -1 ? value : fallback;
    }

    function other(side) {
        return side === "left" ? "right" : "left";
    }

    // Що де стоїть у блоці — і що з цим не так.
    //
    // Повертає ГОТОВІ позиції: сайт малює саме їх, нічого більше не
    // вирішуючи. conflicts — людські фрази для журналу й прев'ю.
    function resolve(promo) {

        var p = promo || {};

        var banner = pick(p.dealBanner, SIDES, "none");
        var products = pick(p.dealAlign, ALIGNS, "left");
        var text = pick(p.dealTextAlign, ALIGNS, "left");
        var timer = pick(p.dealTimer, SIDES, "right");

        var conflicts = [];

        // 1. БАНЕР ЗАЙМАЄ ПОЛОВИНУ — товарам лишається друга.
        //
        // «По центру» поруч із банером не існує: центр блока вже під
        // фото. І на тому самому боці, що банер, товари теж не
        // стануть.
        if (banner !== "none") {

            var free = other(banner);

            if (products !== free) {

                conflicts.push("банер " + word(banner) + " — товари можуть стояти тільки "
                    + word(free) + "; «" + word(products) + "» не застосовано");

                products = free;

            }

        }

        // 2. ТАЙМЕР І НАПИС В ОДНОМУ РЯДКУ — на різних боках.
        //
        // Напис по центру нікому не заважає: таймер стає з краю.
        if (text !== "center" && timer === text) {

            conflicts.push("напис і таймер обидва " + word(text)
                + " — таймер перенесено " + word(other(text)));

            timer = other(text);

        }

        return {
            banner: banner,
            products: products,
            text: text,
            timer: timer,
            conflicts: conflicts
        };

    }

    function word(side) {

        if (side === "left") return "ліворуч";
        if (side === "right") return "праворуч";

        return "по центру";

    }

    return {
        resolve: resolve,
        SIDES: SIDES,
        ALIGNS: ALIGNS,
        word: word
    };

}));
