// «Орієнтовно у відділенні 11–14 вересня» замість «Доставка 1–3 дні».
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// На сторінці товару стояв рядок «🚚 Доставка по Україні 1–3 дні», а в
// розмітці Offer на ТІЙ САМІЙ сторінці — handlingTime 1–2 плюс
// transitTime 1–3, тобто 2–5 днів. Дві різні обіцянки в одному файлі,
// і видима з них применшена: днів на збірку в ній не було.
//
// Плюс «1–3 дні» не каже, від чого рахувати — від замовлення чи від
// відправки. Дата знімає це питання й прибирає найчастіше запитання в
// дірект.
//
// ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ
// ---------------------
// 1. Числа лежать в ОДНОМУ місці й керують водночас текстом і
//    розміткою — розійтися їм ніде.
// 2. Збірка рахується в робочих днях, дорога — в календарних (Нова
//    пошта працює в суботу).
// 3. Дата рахується в браузері, а не при збірці: інакше сто сторінок
//    змінювались би щодня й гілки конфліктували б на порожньому місці.
// 4. Формулювання й самі числа редагуються з адмінки.
// 5. Помилка в адмінці не ламає сторінку.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const offer = require("../assets/js/product-offer.js");
const productJs = read("assets/js/product.js");
const builder = read("scripts/build-product-pages.js");
const admin = read("admin/config.yml");
const texts = JSON.parse(read("data/product-texts.json"));

console.log("\n[1] Строки — один набір чисел на весь сайт");
{
    check("модуль тримає запасні значення", Boolean(offer.DELIVERY));

    check("вони ті самі, що на сторінці «Оплата і доставка»",
        offer.DELIVERY.handlingMin === 1 && offer.DELIVERY.handlingMax === 2
        && offer.DELIVERY.transitMin === 1 && offer.DELIVERY.transitMax === 3,
        JSON.stringify(offer.DELIVERY));

    // Сторінка «Оплата і доставка» — це те, що покупець прочитає
    // окремо від товару. Розійдуться — і магазин обіцяє різне в двох
    // місцях.
    const dp = read("delivery-payment.html");

    check("сторінка «Оплата і доставка» каже те саме про збірку",
        /Відправляємо замовлення протягом 1[–-]2 днів/.test(dp));

    check("…і те саме про дорогу",
        /за 1[–-]3 дні/.test(dp));

    // Ті самі числа йдуть у розмітку — не окрема копія.
    const details = offer.shippingDetails(texts);
    const time = details.deliveryTime;

    check("розмітка бере збірку з тих самих чисел",
        time.handlingTime.minValue === texts.handlingMin
        && time.handlingTime.maxValue === texts.handlingMax);

    check("і дорогу теж",
        time.transitTime.minValue === texts.transitMin
        && time.transitTime.maxValue === texts.transitMax);
}

console.log("\n[2] Збірка — робочі дні, дорога — календарні");
{
    // Нова пошта працює й у суботу, тож викидати вихідні з ДОРОГИ
    // означало б називати дату пізнішу за справжню. А от пакує магазин
    // з понеділка по п'ятницю.
    const terms = { handlingMin: 1, handlingMax: 1, transitMin: 1, transitMax: 1 };

    // Середа 09.09.2026 → збірка четвер → відділення п'ятниця.
    const midweek = offer.deliveryWindow(terms, new Date(2026, 8, 9, 12));

    check("серед тижня: +1 робочий +1 календарний",
        midweek.from.getDate() === 11 && midweek.from.getMonth() === 8,
        midweek.from.toDateString());

    // П'ятниця 11.09 → збірка понеділок 14.09 → відділення вівторок.
    const friday = offer.deliveryWindow(terms, new Date(2026, 8, 11, 12));

    check("у п'ятницю збірка переїжджає на понеділок",
        friday.from.getDate() === 15,
        friday.from.toDateString());

    // Субота й неділя дають те саме, що п'ятниця: пакувати нікому.
    const saturday = offer.deliveryWindow(terms, new Date(2026, 8, 12, 12));
    const sunday = offer.deliveryWindow(terms, new Date(2026, 8, 13, 12));

    check("вихідні не додають зайвого дня",
        saturday.from.getTime() === friday.from.getTime()
        && sunday.from.getTime() === friday.from.getTime());

    // Дорога — календарна: три дні через вихідні лишаються трьома.
    const transit = offer.deliveryWindow(
        { handlingMin: 1, handlingMax: 1, transitMin: 3, transitMax: 3 },
        new Date(2026, 8, 9, 12));

    check("дорога рахується календарними днями",
        transit.from.getDate() === 13,
        transit.from.toDateString());
}

console.log("\n[3] Як це читається");
{
    const one = { handlingMin: 1, handlingMax: 1, transitMin: 1, transitMax: 1 };

    check("один день — одна дата, без діапазону",
        offer.formatDeliveryRange(offer.deliveryWindow(one, new Date(2026, 8, 9, 12)))
            === "11 вересня");

    check("у межах місяця назва один раз",
        offer.formatDeliveryRange(offer.deliveryWindow(texts, new Date(2026, 8, 9, 12)))
            === "11–14 вересня",
        offer.formatDeliveryRange(offer.deliveryWindow(texts, new Date(2026, 8, 9, 12))));

    // «30 вересня–2 жовтня» без пробілів злипається в «вересня–2».
    const across = offer.formatDeliveryRange(
        offer.deliveryWindow(texts, new Date(2026, 8, 28, 12)));

    check("через межу місяця — обидві назви, з пробілами",
        across === "30 вересня – 3 жовтня", across);

    // Місяць у родовому відмінку: «11 вересень» — не українською.
    check("місяць у родовому відмінку",
        /вересня|жовтня|січня/.test(across + offer.formatDeliveryRange(
            offer.deliveryWindow(one, new Date(2026, 0, 5, 12)))));
}

console.log("\n[4] Дата рахується в браузері, а не при збірці");
{
    // Сторінки p/<slug>/index.html лежать у git. Дата в них
    // змінювалась би щодня, і гілки dev та main, які збираються в
    // різні моменти, конфліктували б на порожньому місці — рівно те,
    // що вже сталося з availability_date у фіді.
    check("генератор дати в сторінку не пише",
        !/deliveryWindow|formatDeliveryRange/.test(builder));

    const page = read("p/michael-kors-rose-small-top-handle-quilted-crossbody-bag/index.html");

    check("у готовій сторінці дати немає",
        !/у відділенні \d/.test(page));

    check("рядок збирає рантайм", /function deliveryDateLine/.test(productJs));

    check("і ставить його в блок доставки",
        /class="delivery-date">🚚 \$\{escapeHtml\(deliveryDateLine\(\)\)\}/.test(productJs));

    // Старий загальний рядок лишається запасним: модуль не
    // завантажився — краще без дати, ніж порожнє місце там, де людина
    // шукає строк.
    check("є запасний рядок без дати", /const DELIVERY_FALLBACK/.test(productJs));

    check("і він спрацьовує без модуля",
        /if \(!offer \|\| !offer\.deliveryWindow\) return DELIVERY_FALLBACK;/.test(productJs));
}

console.log("\n[5] Редагується з адмінки");
{
    check("файл несе формулювання", typeof texts.deliveryDate === "string");

    check("і всі чотири числа",
        ["handlingMin", "handlingMax", "transitMin", "transitMax"]
            .every(k => Number.isFinite(texts[k])));

    ["deliveryDate", "handlingMin", "handlingMax", "transitMin", "transitMax"]
        .forEach(name => {
            check(`«${name}» є в адмінці`, new RegExp(`name: "${name}"`).test(admin));
        });

    // {дата} — місце для діапазону. Забули його — дописуємо в кінці:
    // без дати весь рядок втрачає сенс.
    check("формулювання має {дата}", texts.deliveryDate.includes("{дата}"));

    check("без {дата} діапазон дописується в кінці",
        /template\.includes\("\{дата\}"\)/.test(productJs)
        && /\$\{template\} \$\{range\}/.test(productJs));

    // Слово «орієнтовно» — не прикраса: свят у розрахунку немає, і
    // обіцяти точний день магазин не може.
    check("сказано «орієнтовно», а не точний день",
        /орієнтовн/i.test(texts.deliveryDate));
}

console.log("\n[6] Помилка в адмінці не ламає сторінку");
{
    // Порожнє поле не має обнуляти строк.
    const empty = offer.deliveryTerms({ handlingMin: "", transitMax: null, handlingMax: 0 });

    check("порожні поля не обнуляють строк",
        empty.handlingMin === 1 && empty.transitMax === 3 && empty.handlingMax === 2,
        JSON.stringify(empty));

    // Переплутані місцями «від» і «до» дали б «13–11 вересня».
    const swapped = offer.deliveryTerms({ handlingMin: 3, handlingMax: 1 });

    check("переплутані «від» і «до» не дають діапазон навпаки",
        swapped.handlingMax >= swapped.handlingMin,
        JSON.stringify(swapped));

    check("дробові числа округлюються",
        offer.deliveryTerms({ transitMin: 2.4 }).transitMin === 2);

    // Модуль без аргументу мусить давати запасний набір: на
    // product.html?id=… (не статична сторінка) PRODUCT_TEXTS немає.
    check("без аргументу — запасні значення",
        JSON.stringify(offer.deliveryTerms()) === JSON.stringify(offer.DELIVERY));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
