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

    function catalogHref(param, value) {
        return "catalog?" + param + "=" + encodeURIComponent(value);
    }

    // options.departmentOf — функція «назва категорії → назва відділу».
    // Необовʼязкова: якщо перелік категорій ще не завантажений, ланка
    // відділу просто пропускається, а доріжка лишається коректною.
    function buildTrail(product, options) {

        var opts = options || {};
        var trail = [{ label: "Головна", href: "/" }, { label: "Каталог", href: "catalog" }];

        if (!product) return trail;

        var gender = firstGender(product);

        if (gender) trail.push({ label: gender, href: catalogHref("gender", gender) });

        var category = product.category || "";

        if (category) {

            var department = typeof opts.departmentOf === "function"
                ? opts.departmentOf(category)
                : "";

            // Відділ має власний параметр. Спершу тут стояло перелічення
            // всіх його категорій через кому — виходило посилання на
            // 700 символів, яке ще й мінялось щоразу, коли в адмінці
            // додавали категорію. Тепер це коротке ?department=Аксесуари.
            if (department) {
                trail.push({ label: department, href: catalogHref("department", department) });
            }

            trail.push({ label: category, href: catalogHref("category", category) });

        }

        if (product.brand) {
            trail.push({ label: product.brand, href: catalogHref("brand", product.brand) });
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

    root.Breadcrumbs = {
        firstGender: firstGender,
        buildTrail: buildTrail,
        toJsonLd: toJsonLd
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).Breadcrumbs;
}
