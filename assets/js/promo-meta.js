// Як зветься акція і що про неї пишуть у <head> — спільне правило.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Назву й опис акції треба знати у ДВОХ місцях, і вони працюють у
// різний час:
//
//   1. scripts/build-promo-pages.js — збирає promo/<slug>/index.html
//      ДО викладки. Саме цей текст бачить павук месенджера, коли
//      власник кидає посилання в Instagram чи Telegram: JavaScript
//      той павук не виконує;
//
//   2. assets/js/promo.js — малює сторінку в браузері й оновлює
//      <head> уже в рантаймі (сторінку можна відкрити й старою
//      адресою /promo?id=<slug>).
//
// Поки правило жило лише в promo.js, у статичній розмітці стояло
// безлике «Акції | BestBrnd4u» для всіх акцій одразу, а og:url не
// було зовсім. Власник: «коли кидаю посилання на акцію, картка
// показує загальну назву». Див. scripts/build-promo-pages.js.
//
// Дві копії правила розійшлись би на першій же акції без title.

(function (root) {

    "use strict";

    // НАЗВА АКЦІЇ СЛОВАМИ — НЕ ТЕ САМЕ, ЩО НАПИС НА БАНЕРІ.
    //
    // Напис для ГОЛОВНОЇ теж у переліку, і стоїть одразу за банерним.
    // Саме заради випадку, коли на банері напису немає (він уже на
    // фото), а на головній є: без цього рядка вкладка браузера й
    // рядок у видачі діставали б безлике «Акція», хоча назва акції в
    // записі є.
    function promoHeading(promo) {

        return [
            promo && promo.title,
            promo && promo.homeTitle,
            promo && promo.text,
            promo && promo.homeText,
            promo && promo.brand
        ]
            .map(function (value) { return String(value || "").trim(); })
            .find(Boolean) || "Акція";

    }

    function promoTitle(promo) {

        return promoHeading(promo) + " | BestBrnd4u";

    }

    // Обрізаємо так само, як truncateForMeta у common.js: по слову, а
    // не посеред нього. Копія тут навмисна — common.js у збірці не
    // піднімеш, а тягти його заради шести рядків дорожче, ніж
    // повторити. Межа та сама, і її стереже перевірка.
    function promoDescription(promo, maxLength) {

        var limit = maxLength || 155;

        var text = String((promo && promo.text)
            || (promoHeading(promo) + " в інтернет-магазині BestBrnd4u")).trim();

        if (text.length <= limit) return text;

        return text.slice(0, limit).replace(/\s+\S*$/, "") + "…";

    }

    // ВЛАСНА АДРЕСА АКЦІЇ.
    //
    // Слеш у кінці — як у товарів, брендів і категорій: тека з
    // index.html. Старе /promo?id=<slug> лишається робочим (посилання
    // вже розійшлись по сторіс), але canonical веде сюди.
    function promoPath(slug) {

        return "/promo/" + encodeURIComponent(String(slug || "")) + "/";

    }

    root.PromoMeta = {
        promoHeading: promoHeading,
        promoTitle: promoTitle,
        promoDescription: promoDescription,
        promoPath: promoPath
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).PromoMeta;
}
