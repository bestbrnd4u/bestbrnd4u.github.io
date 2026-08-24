// Хлібні крихти товару — спільний будівник для сайту, генератора і Google.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Доріжка потрібна в трьох місцях одночасно:
//
//   1. статична розмітка p/<slug>/index.html (її бачить робот і
//      людина до того, як виконається JS);
//   2. сторінка product.html?id=… у рантаймі;
//   3. розмітка BreadcrumbList — з неї Google малює доріжку в
//      результатах пошуку.
//
// Якщо зібрати її трьома окремими шматками коду, вони розійдуться, і
// Google почне показувати шлях, якого на сторінці немає. Тому файл
// один, і його підключають усі три сторони (той самий підхід, що в
// assets/js/image-framing.js).
//
// ЩО ВИХОДИТЬ
// ------------
//   Головна → Каталог → Жінкам → Аксесуари → Окуляри і оправи
//           → Jimmy Choo → Сонцезахисні окуляри Jimmy Choo NENA/S 807 51
//
// Кожна проміжна ланка — робоче посилання у каталог із відповідним
// фільтром. Це стало можливим лише після того, як каталог навчився
// читати фільтри з адреси: раніше таке посилання відкривало б повний
// каталог і доріжка була б декоративною.
//
// ЧОГО ТУТ НЕМАЄ
// ---------------
// Підкатегорій рівня «Низькі кросівки». У даних є тільки два рівні —
// відділ (department) і категорія (name), тож глибше будувати нема з
// чого. Зʼявиться третій рівень у категоріях — додається сюди одним
// пунктом, і всі три місця підхоплять його разом.

(function (root) {

    "use strict";

    // Стать у товарі — список: товар може бути і жіночий, і чоловічий.
    // У доріжці показуємо перший: доріжка описує ОДИН шлях до товару,
    // а не всі можливі. Два «Жінкам → Чоловікам» поспіль виглядали б
    // як помилка.
    function firstGender(product) {

        var gender = product && product.gender;

        if (Array.isArray(gender)) return gender[0] || "";

        return gender || "";

    }

    // Посилання крихти НАКОПИЧУВАЛЬНЕ: несе всі фільтри лівіше себе.
    //
    // Спершу кожна ланка вела лише за собою — «Balenciaga» відкривала
    // catalog?brand=Balenciaga, і від шляху лишався один бренд:
    // ні статі, ні відділу, ні категорії в фільтрах не було. Людина
    // клацала «Balenciaga» всередині «Окуляри і оправи», а бачила всі
    // товари бренду.
    //
    // Тепер кожна ланка додає себе до попередніх — так само, як на
    // великих магазинах: клац по «Under Armour» лишає і «Спорт», і
    // «Кросівки для тренувань», і «Чоловікам».
    function catalogHref(parts) {

        var query = Object.keys(parts)
            .filter(function (key) { return parts[key]; })
            .map(function (key) { return key + "=" + encodeURIComponent(parts[key]); })
            .join("&");

        return query ? "catalog?" + query : "catalog";

    }

    // options.departmentOf — функція «назва категорії → назва відділу».
    // Необовʼязкова: якщо перелік категорій ще не завантажений, ланка
    // відділу просто пропускається, а доріжка лишається коректною.
    function buildTrail(product, options) {

        var opts = options || {};
        var trail = [{ label: "Головна", href: "/" }, { label: "Каталог", href: "catalog" }];

        if (!product) return trail;

        // накопичувач: кожна наступна ланка бачить усе, що було лівіше
        var so_far = {};

        var gender = firstGender(product);

        if (gender) {
            so_far.gender = gender;
            trail.push({ label: gender, href: catalogHref(so_far) });
        }

        var category = product.category || "";

        if (category) {

            var department = typeof opts.departmentOf === "function"
                ? opts.departmentOf(category)
                : "";

            // Відділ має власний короткий параметр. Спершу тут стояло
            // перелічення всіх його категорій через кому — виходило
            // посилання на 700 символів, яке ще й мінялось щоразу, коли
            // в адмінці додавали категорію.
            if (department) {
                so_far.department = department;
                trail.push({ label: department, href: catalogHref(so_far) });
            }

            // Відділ прибираємо, щойно зʼявилась категорія.
            //
            // Категорія лежить УСЕРЕДИНІ відділу, тож разом вони зайві.
            // Ба більше — шкідливі: у каталозі відділ і категорія
            // додаються як АБО, і посилання «Аксесуари + Окуляри»
            // розкрило б увесь відділ замість самих окулярів.
            delete so_far.department;

            so_far.category = category;
            trail.push({ label: category, href: catalogHref(so_far) });

        }

        if (product.brand) {
            so_far.brand = product.brand;
            trail.push({ label: product.brand, href: catalogHref(so_far) });
        }

        // остання ланка — сам товар, без посилання
        trail.push({ label: product.title || "Товар", href: null, current: true });

        return trail;

    }

    // Розмітка для Google. Позиції нумеруються з 1 і мусять збігатися з
    // тим, що видно на сторінці, — інакше Search Console позначає це як
    // невідповідність розмітки вмісту.
    function toJsonLd(trail, siteUrl, currentUrl) {

        var base = String(siteUrl || "").replace(/\/+$/, "");

        return {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: trail.map(function (crumb, index) {

                var item = crumb.current
                    ? currentUrl
                    : (crumb.href === "/" ? base + "/" : base + "/" + crumb.href);

                return {
                    "@type": "ListItem",
                    position: index + 1,
                    name: crumb.label,
                    item: item
                };

            })
        };

    }

    // Кнопка «Назад» на початку доріжки.
    //
    // Робить те саме, що кнопка «назад» у браузері: повертає в каталог
    // саме туди, де людина спинилась — з тими самими фільтрами і на ту
    // саму картку (assets/js/catalog.js → restoreCatalogPosition).
    //
    // ЧОМУ ЦЕ ПОСИЛАННЯ, А НЕ ПРОСТО КНОПКА
    // --------------------------------------
    // У розмітці це звичайний <a href="catalog">. Так воно працює ще до
    // виконання JS і на сторінках, відкритих напряму з пошуку Google:
    // там історії немає, і history.back() виніс би людину із сайту.
    // JS «підвищує» посилання до справжнього «назад» лише тоді, коли
    // попередня сторінка була нашою (див. product.js).
    var BACK_HTML =
        '<a href="catalog" class="crumb-back" data-crumb-back>'
        + '<span aria-hidden="true">\u2039</span> Назад'
        + '</a>';

    root.Breadcrumbs = {
        BACK_HTML: BACK_HTML,
        firstGender: firstGender,
        buildTrail: buildTrail,
        toJsonLd: toJsonLd
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).Breadcrumbs;
}
