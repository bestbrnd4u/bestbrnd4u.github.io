// Сторінка «Дякуємо»: склад замовлення.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// 1. У рядку «Товарів» стояв прочерк. Кількість рахувалась так:
//      getCart().reduce((sum, line) => sum + line.qty, 0)
//    Але getCart() віддає ОКРЕМИЙ запис на кожну одиницю товару, і
//    поля qty в них немає. Сума виходила NaN, а JSON.stringify
//    перетворює NaN на null — на сторінці з'являлось «—».
//
// 2. Навіть із правильним числом сторінка показувала лише кількість.
//    Покупець не міг перевірити, ЩО саме замовив, — а це останній
//    момент, коли помилку ще легко виправити телефоном.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const checkout = read("assets/js/checkout.js");
const thanks = read("thanks.html");

console.log("\n[1] Кількість більше не NaN");
{
    // Джерело мусить бути те саме, яким користується сам кошик:
    // getGroupedCartLines() групує записи й рахує qty.
    check("кількість рахується з групованих рядків",
        /const lines = getGroupedCartLines\(\)/.test(checkout));
    check("сума по qty", /lines\.reduce\(\(sum, line\) => sum \+ line\.qty, 0\)/.test(checkout));

    // Старий спосіб не має повернутись: getCart() без групування.
    const code = checkout.replace(/\/\/[^\n]*/g, "");

    check("getCart().reduce більше не використовується",
        !/getCart\(\)\.reduce/.test(code));
}

console.log("\n[2] Товари зберігаються для сторінки");
{
    check("склад замовлення записується", /items,/.test(checkout));

    // Список беремо з ГОТОВОГО знімка замовлення, а не збираємо вдруге.
    //
    // Спершу я збирав його тут же: getGroupedCartLines() плюс
    // findCachedProduct(). Виявилось, що на сторінці оформлення товари
    // шукаються ІНШОЮ функцією — findProductById(), а кеш каталогу тут
    // порожній. findCachedProduct повертала undefined: у списку стояло
    // «Товар», «0 грн» і порожні картинки.
    //
    // buildOrderItemsSnapshot() робить це правильно й тим самим шляхом,
    // яким склад іде в базу та в лист. Дві незалежні збірки того самого
    // списку рано чи пізно розійшлися б.
    check("список — із знімка замовлення",
        /const items = buildOrderItemsSnapshot\(\)\.map/.test(checkout));

    // Кеш каталогу на цій сторінці не використовується взагалі.
    const code = checkout.replace(/\/\/[^\n]*/g, "");

    check("findCachedProduct тут не використовується",
        !/findCachedProduct\(/.test(code));

    // Кожне поле, потрібне покупцеві, щоб упізнати товар.
    ["title", "brand", "image", "color", "size", "qty", "sum"].forEach(field =>
        check(`зберігається «${field}»`, new RegExp(`${field}:`).test(checkout)));

    // Сума рядка — ціна × кількість, а не просто ціна: інакше при двох
    // однакових товарах цифра брехала б.
    check("сума рядка враховує кількість",
        /sum: \(Number\(item\.price\) \|\| 0\) \* \(Number\(item\.qty\) \|\| 1\)/.test(checkout));

    // Адреса фото — абсолютна: у листі відносний шлях нема від чого
    // відкладати, і почтовик показує заглушку.
    check("адреса фото абсолютна",
        /image: absoluteUrl\(product\.images\?\.\[0\]\)/.test(checkout));
}

console.log("\n[3] Сторінка показує список");
{
    check("є місце під список", /id="thanksItems"/.test(thanks));
    check("сховане, поки даних немає", /id="thanksItems"[^>]*hidden/.test(thanks));

    check("показується фото", /order-confirm-item[\s\S]{0,300}<img/.test(thanks));
    check("є запас на битий шлях фото", /onerror=/.test(thanks));
    check("показується сума рядка", /order-confirm-item-sum/.test(thanks));

    // Кількість показуємо лише коли її більше однієї: «× 1» нічого
    // не додає, а рядок захаращує.
    check("кількість лише при qty > 1",
        /item\.qty > 1 \? `\$\{item\.qty\} шт\.` : ""/.test(thanks));
}

console.log("\n[4] Поведінка на живому DOM");
{
    const { JSDOM } = require("jsdom");

    const dom = new JSDOM(thanks, {
        runScripts: "outside-only",
        url: "https://dev.bestbrnd4u.com/thanks"
    });

    const w = dom.window;

    // помічники з common.js, якого тут немає
    w.saveCart = () => {};
    w.updateCartCount = () => {};
    w.showToast = () => {};

    const items = [
        {
            title: "Сумка Coach", brand: "COACH", image: "/a/one.webp",
            color: "Чорний", size: "ONESIZE", qty: 1, sum: 6800
        },
        {
            title: "Гаманець Marc Jacobs", brand: "MARC JACOBS", image: "",
            color: "Білий", size: "ONESIZE", qty: 2, sum: 7600
        }
    ];

    w.sessionStorage.setItem("bestbrnd4uLastOrder", JSON.stringify({
        orderId: "3098816532",
        orderDate: "27.08.2026, 12:31",
        itemsCount: 3,
        items: items,
        total: "14 400 грн",
        firstName: "Ілля"
    }));

    const code = [...thanks.matchAll(/<script>([\s\S]*?)<\/script>/g)]
        .map(m => m[1]).join("\n");

    try { w.eval(code); } catch (error) { /* частина потребує common.js */ }

    const d = w.document;

    check("кількість показана", d.getElementById("thanksItemsCount").textContent === "3",
        d.getElementById("thanksItemsCount").textContent);

    const box = d.getElementById("thanksItems");

    check("список показано", box.hidden === false);

    const rows = [...box.querySelectorAll(".order-confirm-item")];

    check("рядків стільки ж, скільки товарів", rows.length === 2, rows.length);

    check("назва на місці",
        rows[0].querySelector(".order-confirm-item-title").textContent === "Сумка Coach");

    // Пробіл у сумі НЕРОЗРИВНИЙ: toLocaleString("uk-UA") ставить саме
    // його, і звичайний пробіл у перевірці не збігається. Прибираємо
    // усі пробільні символи перед порівнянням.
    const sumText = rows[0].querySelector(".order-confirm-item-sum")
        .textContent.replace(/\s/g, "");

    check("сума на місці", sumText === "6800грн", sumText);

    // Кількість — лише в другого товару (qty = 2).
    check("«шт.» лише де кількість > 1",
        !/шт\./.test(rows[0].querySelector(".order-confirm-item-meta").textContent)
        && /2 шт\./.test(rows[1].querySelector(".order-confirm-item-meta").textContent));

    // Порожній шлях фото не має давати битої картинки.
    check("без фото підставляється заглушка",
        rows[1].querySelector("img").getAttribute("src").includes("no-image"),
        rows[1].querySelector("img").getAttribute("src"));

    // Без товарів список лишається схованим — стара сторінка не
    // ламається.
    const dom2 = new JSDOM(thanks, { runScripts: "outside-only", url: "https://x.test/thanks" });

    dom2.window.saveCart = () => {};
    dom2.window.updateCartCount = () => {};
    dom2.window.showToast = () => {};

    dom2.window.sessionStorage.setItem("bestbrnd4uLastOrder", JSON.stringify({
        orderId: "1", orderDate: "—", itemsCount: 1, total: "1 грн"
    }));

    try { dom2.window.eval(code); } catch (error) { /* те саме */ }

    check("без товарів список схований",
        dom2.window.document.getElementById("thanksItems").hidden === true);
}

console.log("\n[5] Фото в листі — абсолютна адреса");
{
    // СИМПТОМ
    // --------
    // У листі «дякуємо за замовлення» замість фото товару стояла
    // заглушка.
    //
    // ПРИЧИНА
    // --------
    // Знімок замовлення зберігав відносний шлях
    // /assets/images/products/… Він працює лише на сторінці сайту: у
    // листі його нема від чого відкладати, і почтовик не знаходить
    // картинку.
    check("адреса фото робиться абсолютною",
        /image: absoluteUrl\(product\.images\?\.\[0\]\)/.test(checkout));

    // Старий спосіб не має повернутись.
    const code = checkout.replace(/\/\/[^\n]*/g, "");

    check("відносний шлях більше не зберігається",
        !/image: product\.images\?\.\[0\] \|\| null/.test(code));

    // Помічник мусить лишати вже повні адреси як є: частина фото може
    // приходити з зовнішніх джерел.
    const common = read("assets/js/common.js");

    check("повна адреса лишається як є",
        /if \(\/\^https\?:\\\/\\\/\/i\.test\(url\)\) return url/.test(common));
}

console.log("\n[6] Лист покупцеві: склад із фото");
{
    // ЩО БУЛО НЕ ТАК
    // ---------------
    // У лист ішов один рядок тексту на товар: «Бренд — Назва, колір: …,
    // розмір: …, кількість: 1, ціна за од.: … , сума: …». Усе правда,
    // але читати важко: суцільний абзац і немає головного — фото.
    // Людина щойно вибирала річ очима, а в підтвердженні бачить опис
    // словами.
    check("є збірка HTML-складу", /function buildOrderCompositionHtml/.test(checkout));

    // Текстовий варіант ЛИШАЄТЬСЯ: поки шаблон EmailJS не оновлено,
    // лист приходить як раніше, а не порожнім.
    check("текстовий варіант не прибрано",
        /function buildOrderCompositionText/.test(checkout));
    check("у шаблон ідуть обидва",
        /order_items_html: buildOrderCompositionHtml\(\)/.test(checkout)
        && /order_items: buildOrderCompositionText\(\)/.test(checkout));

    // ПОШТА — НЕ БРАУЗЕР
    // -------------------
    // Gmail вирізає теги <style> цілком, Outlook рендерить через Word і
    // не розуміє flexbox та grid. Працює лише таблична розкладка зі
    // стилями в атрибутах.
    const html = (checkout.match(/function buildOrderCompositionHtml[\s\S]*?\n\}/) || [""])[0];

    check("розкладка на таблиці", /<table/.test(html) && /<tr>/.test(html));
    check("стилі в атрибутах", /style="/.test(html));
    check("окремого <style> немає", !/<style/.test(html));
    check("flexbox і grid не використовуються",
        !/display:\s*(flex|grid)/.test(html));

    // Outlook додає власні відступи між клітинками, якщо не сказати
    // інакше атрибутами.
    check("відступи таблиці задані атрибутами",
        /cellpadding="0" cellspacing="0"/.test(html));

    // Розміри фото — в атрибутах width/height, а не лише в CSS:
    // частина клієнтів не застосовує стилі до зображень до їх
    // завантаження, і лист «стрибає».
    check("розміри фото в атрибутах", /width="64" height="80"/.test(html));

    // Дані покупця й товару екрануємо: назва може містити лапки або <.
    check("значення екрануються",
        /escapeHtml\(item\.title\)/.test(html) && /escapeHtml\(item\.brand\)/.test(html));

    // Кількість — лише коли більше однієї.
    check("кількість лише при qty > 1", /Number\(item\.qty\) > 1/.test(html));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
