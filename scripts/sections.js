// Розділи каталогу «Новинки» і «Акції»: адреси, назви й набір товарів.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// «Новинки» і «Акції» — пункти головного меню на кожній сторінці
// сайту, і ведуть вони на адресу-фільтр:
//
//     catalog?section=sale
//
// А така адреса сама заявляє, що окремою сторінкою не є: canonical у
// ній вказує на /catalog (assets/js/catalog.js → syncCanonical). Тобто
// ми власним меню зганяли вагу на /catalog і водночас казали Google,
// що дивитись на знижки нема де.
//
// Заміряно 08.10.2026 на всіх 170 сторінках: посилань на catalog із
// фільтром — 2832, тобто 27% усіх внутрішніх. З них 1360 — рівно ці
// два розділи (по 4 на сторінку кожен: пункт меню, три плитки за
// статтю та підвал).
//
// Це той самий випадок, що вже був із брендами й категоріями, і
// відповідь та сама: дати розділу власний шлях.
//
//     /novynky/   і   /aktsii/
//
// ЧОМУ НАБІР ТОВАРІВ ТУТ, А НЕ В ГЕНЕРАТОРІ
// ------------------------------------------
// Сторінка мусить нести перелік товарів у розмітці — для робота, що
// не виконує JavaScript. А в браузері той самий перелік рахує
// catalog.js (sectionProducts). Дві копії правила розійшлися б
// мовчки: сторінка показувала б одне, каталог за тією ж адресою —
// інше.
//
// Разом їх тримає tests/test-sections.js: він ВИТЯГАЄ правило з
// catalog.js і common.js і проганяє обидві реалізації на тих самих
// товарах. Це той самий підхід, що в scripts/plural.js — браузерні
// файли нічого не експортують, і вимагати від них модульність
// означало б переписати порядок завантаження на 18 сторінках.

// % — з якої знижки товар потрапляє в «Акції».
//
// Та сама константа стоїть у catalog.js (SALE_MIN_DISCOUNT), і
// звіряє їх той самий тест.
const SALE_MIN_DISCOUNT = 30;

const SECTIONS = {

    "new": {
        key: "new",
        slug: "novynky",
        heading: "Новинки",
        title: "Новинки — свіжі надходження | BestBrnd4u",
        subtitle: "Останні надходження до каталогу BestBrnd4u",
        // Опис для пошуку: числа дописує генератор, це лише початок.
        intro: "Товари, що нещодавно зʼявились у каталозі BestBrnd4u."
    },

    "sale": {
        key: "sale",
        slug: "aktsii",
        heading: "Акції",
        title: "Акції та знижки на брендові речі | BestBrnd4u",
        subtitle: `Знижки від ${SALE_MIN_DISCOUNT}% на сумки, рюкзаки та аксесуари`,
        intro: `Оригінальні речі зі знижкою від ${SALE_MIN_DISCOUNT}%.`
    }

};

// ---------------------------------------------------------------
// Ціна. Копія правила з assets/js/common.js — звіряє test-sections.js
// ---------------------------------------------------------------
//
// Переписувати це сюди не хотілось: ціна — найнебезпечніше місце для
// другої копії, бо суму замовлення рахує ще й база, і будь-яка
// розбіжність перетворює чесну покупку на «розбіжність ціни».
//
// Але вибір був між копією під наглядом тесту й копією БЕЗ нагляду:
// генератор має знати, у кого знижка, а common.js у node не
// завантажується зовсім (там document у тілі файлу).

function saleActive(product, now) {

    const sale = product && product.sale;

    if (!sale || !(Number(sale.price) > 0)) return false;

    const moment = Number.isFinite(now) ? now : Date.now();

    if (sale.from) {
        const starts = new Date(sale.from).getTime();
        if (Number.isFinite(starts) && moment < starts) return false;
    }

    if (sale.to) {
        const ends = new Date(sale.to).getTime();
        if (Number.isFinite(ends) && moment >= ends) return false;
    }

    return true;

}

function priceNow(product, now) {

    if (saleActive(product, now)) return Number(product.sale.price);

    return Number(product && product.price) || 0;

}

function oldPriceNow(product, now) {

    if (saleActive(product, now)) return Number(product.price) || 0;

    return Number(product && product.oldPrice) || 0;

}

function discountPercent(product, now) {

    const price = priceNow(product, now);
    const old = oldPriceNow(product, now);

    if (!old || old <= price) return 0;

    return Math.round((1 - price / old) * 100);

}

// ---------------------------------------------------------------

// Товари розділу — те саме, що показує catalog.js за цією адресою.
function sectionProducts(section, products, now) {

    const list = Array.isArray(products) ? products : [];

    if (section === "new") return list.filter(product => Boolean(product && product.isNew));

    if (section === "sale") {
        return list.filter(product => discountPercent(product, now) >= SALE_MIN_DISCOUNT);
    }

    return list;

}

// Адреса розділу від кореня. Порожній рядок — не розділ.
function sectionPath(section) {

    return SECTIONS[section] ? `/${SECTIONS[section].slug}/` : "";

}

// Зворотний бік: яка адреса — який розділ.
//
// Потрібен і мега-меню (воно визначає розділ із href пункту), і
// перевіркам, які стежать, щоб меню та сторінки не розійшлись.
function sectionOfPath(href) {

    const path = String(href || "")
        .replace(/^https?:\/\/[^/]+/, "")
        .split("?")[0]
        .replace(/^\/?/, "/");

    return Object.keys(SECTIONS).find(key => path === `/${SECTIONS[key].slug}/`) || "";

}

module.exports = {
    SALE_MIN_DISCOUNT,
    SECTIONS,
    saleActive,
    priceNow,
    oldPriceNow,
    discountPercent,
    sectionProducts,
    sectionPath,
    sectionOfPath
};
