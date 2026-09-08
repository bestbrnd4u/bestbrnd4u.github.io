// Назва категорії / розділу / бренду → адреса ЇЇ ВЛАСНОЇ сторінки.
//
// НАВІЩО
// -------
// У магазині є два способи показати «Жіночі сумки»:
//
//   /catalog?gender=Жінкам&category=Жіночі%20сумки   фільтр каталогу
//   /categories/zhinochi-sumky/                      власна сторінка
//
// Виглядають однаково, для пошуку — ні. Адреса з фільтром має
// canonical на /catalog, тобто сама заявляє: «я не окрема сторінка,
// вага належить каталогу». Тож кожне посилання на неї нікуди не
// веде — а сторінки, зроблені саме щоб ранжуватись, не отримували з
// товарів жодного посилання.
//
// Заміряно на проді (сторінка товару): посилань на /categories/ — 0,
// на /departments/ — 0.
//
// ПРАВИЛО ІСНУВАННЯ СТОРІНКИ
// ---------------------------
// Просте й те саме, що в scripts/build-taxonomy-pages.js: сторінку
// отримує кожна категорія, кожен розділ і кожен бренд, у яких є хоч
// один товар. Порогів немає.
//
// Слух за тим, щоб правила не розійшлись, несе тест
// tests/test-taxonomy-links.js: він перевіряє КОЖНЕ посилання в
// крихтах усіх згенерованих сторінок товару — чи є така сторінка на
// диску. Розійдуться правила — тест впаде до того, як покупець
// побачить 404.

const { toSlug } = require("./translit");

function clean(value) {

    return String(value ?? "").trim();

}

// { category: {назва: href}, department: {...}, brand: {...} }
function taxonomyLinks(products, categories, brands) {

    const departmentOf = new Map();

    (categories || []).forEach(category => {

        const name = clean(category && category.name);

        if (name) departmentOf.set(name, clean(category.department));

    });

    // Бренд може мати свій slug в адмінці — тоді сторінка лежить саме
    // за ним, а не за транслітерацією назви.
    const brandSlug = new Map();

    (brands || []).forEach(brand => {

        const name = clean(brand && brand.name);

        if (name) brandSlug.set(name.toLowerCase(), clean(brand.slug));

    });

    const links = { category: {}, department: {}, brand: {} };

    (products || []).forEach(product => {

        const category = clean(product && product.category);

        if (category) {

            links.category[category] = `categories/${toSlug(category)}/`;

            const department = departmentOf.get(category);

            if (department) links.department[department] = `departments/${toSlug(department)}/`;

        }

        const brand = clean(product && product.brand);

        if (brand) {

            links.brand[brand] = `brands/${brandSlug.get(brand.toLowerCase()) || toSlug(brand)}/`;

        }

    });

    return links;

}

// Готовий pageFor для Breadcrumbs.buildTrail.
//
// Повертає порожній рядок, коли власної сторінки немає — тоді крихта
// лишається посиланням на фільтр каталогу, як була.
function pageFor(links) {

    return (kind, name) => (links && links[kind] && links[kind][name]) || "";

}

module.exports = { taxonomyLinks, pageFor };
