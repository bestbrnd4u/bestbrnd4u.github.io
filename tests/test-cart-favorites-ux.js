// Кошик і обране: колір, посилання, підтвердження видалення.
//
// ЧОТИРИ СИМПТОМИ
//
// 1. Кружечки кольорів не підписані — у кошику доводилось згадувати
//    по памʼяті, який саме це відтінок.
// 2. Клац по товару в кошику відкривав ПЕРШИЙ колір, а не той, що
//    лежить у кошику: людина клацала коричневу сумку, а бачила
//    світло-сіру. Колір при цьому зберігався — його просто не
//    передавали в посилання.
// 3. Видалити можна було одним випадковим дотиком: «✕» стоїть поруч
//    із кількістю, а повернути видалене нічим.
// 4. Опис товару виводився двічі — угорі й у розділі «Опис» нижче.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Порівнюємо з КОДОМ, а не з поясненнями: у коментарях обидві
// колишні помилки названі своїми іменами — productUrl(product) і
// confirm(), — і наївний пошук по тексту знаходив би саме їх.
const strip = text => text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const cart = strip(read("assets/js/cart.js"));
const favorites = strip(read("assets/js/favorites.js"));
const common = strip(read("assets/js/common.js"));
const product = strip(read("assets/js/product.js"));
const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[1] Назва кольору видима");
{
    check("у кошику є підпис кольору", /class="cart-item-color"/.test(cart));
    check("в обраному теж", /class="favorite-row-color"/.test(favorites));

    check("назва екранується", /escapeHtml\(line\.color\)/.test(cart)
        && /escapeHtml\(activeColor\)/.test(favorites));

    // без кольору підпис не показуємо — порожній рядок «Колір:»
    // виглядав би як недороблене
    check("без кольору підпису немає",
        /line\.color\s*\n?\s*\?/.test(cart) && /activeColor\s*\n?\s*\?/.test(favorites));

    check("є стилі підпису", /\.cart-item-color,[\s\S]{0,120}\.favorite-row-color\{/.test(css));
}

console.log("\n[2] Посилання веде на обраний колір");
{
    // productUrl уміє приймати параметри — їх просто не передавали
    check("productUrl приймає параметри", /function productUrl\(product, params\)/.test(common));

    check("кошик рахує адресу з кольором і розміром",
        /productUrl\(product, \{ color: line\.color, size: line\.size \}\)/.test(cart));
    check("обране теж",
        /productUrl\(product, \{ color: activeColor, size: activeSize \}\)/.test(favorites));

    // обидва посилання рядка — і фото, і назва — мусять вести туди само
    check("у кошику обидва посилання оновлені",
        (cart.match(/href="\$\{lineUrl\}"/g) || []).length === 2,
        (cart.match(/href="\$\{lineUrl\}"/g) || []).length);
    check("в обраному обидва посилання оновлені",
        (favorites.match(/href="\$\{rowUrl\}"/g) || []).length === 2,
        (favorites.match(/href="\$\{rowUrl\}"/g) || []).length);

    check("старих посилань без параметрів не лишилось",
        !/productUrl\(product\)/.test(cart) && !/productUrl\(product\)/.test(favorites));
}

console.log("\n[3] Підтвердження перед видаленням");
{
    check("є спільний діалог", /function askConfirm/.test(common));

    // Вбудований confirm() на телефоні показує системне вікно з
    // адресою сайту, ламає стиль і на iOS блокує сторінку цілком.
    check("не використовується вбудований confirm()",
        !/\bwindow\.confirm\(|[^.\w]confirm\(/.test(common.replace(/askConfirm/g, "")));

    check("кошик питає перед видаленням",
        /askConfirm\(\{[\s\S]{0,160}кошика\?/.test(cart));
    check("обране питає перед видаленням",
        /askConfirm\(\{[\s\S]{0,160}обраного\?/.test(common));

    // На картці й сторінці товару те саме сердечко просто перемикає —
    // питати там означало б заважати.
    check("питаємо тільки на сторінці обраного",
        /classList\.contains\("favorite-row-remove"\)/.test(common));

    // Випадковий Enter одразу після відкриття не має нічого стирати.
    check("фокус на «Скасувати», а не на «Видалити»",
        /querySelector\('\[data-confirm="no"\]'\)\?\.focus\(\)/.test(common));
    check("Escape закриває", /event\.key === "Escape"/.test(common));
    check("клац повз вікно скасовує", /event\.target === overlay/.test(common));
    check("Tab не тікає під діалог", /event\.key === "Tab"/.test(common));
    check("фокус повертається туди, звідки прийшли", /returnTo\.focus\(\)/.test(common));

    check("сторінка під діалогом не гортається",
        /body\.confirm-open\{[\s\S]{0,60}overflow:hidden/.test(css));
    check("небезпечна кнопка виділена кольором", /\.confirm-danger\{/.test(css));
}

console.log("\n[4] Опис товару не дублюється");
{
    const renders = (product.match(/product\.description \|\| "Стильна сумка/g) || []).length;

    check("опис виводиться один раз", renders === 1, renders);
    check("лишився саме розгортайний блок",
        /class="spec-plain">\$\{product\.description/.test(product));
    check("верхнього дубля немає", !/class="product-short"/.test(product));
}

console.log("\n[5] Відступ під мобільною кнопкою «Купити»");
{
    const rule = (css.match(/\.mobile-sticky-cart\{[\s\S]*?\}/g) || []).join("\n");

    check("відступ знизу дорівнює верхньому плюс безпечна зона",
        /padding:12px 16px calc\(12px \+ env\(safe-area-inset-bottom, 0px\)\)/.test(css));

    // Жорсткий поріг у 20px додавався навіть там, де вирізу немає, —
    // і смуга виглядала помітно нижчою знизу, ніж зверху.
    check("жорсткого порога 20px більше немає",
        !/max\(20px, calc\(12px \+ env\(safe-area-inset-bottom/.test(css));

    // Безпечну зону прибирати не можна: на iPhone із жестовою смугою
    // кнопка опиниться просто під нею.
    check("безпечна зона врахована", /env\(safe-area-inset-bottom, 0px\)/.test(css));
}

console.log("\n[6] Dependabot цілиться в dev");
{
    const yaml = read(".github/dependabot.yml");

    // sync-branches мержить із -X theirs: при розходженні перемагає
    // гілка-джерело. Тож апдейт, влитий у main, найближчий Sync
    // dev → main просто відкотив би.
    const blocks = (yaml.match(/target-branch:\s*"dev"/g) || []).length;

    check("обидва блоки цілять у dev", blocks === 2, blocks);

    check("причина зафіксована в конфізі", /-X theirs/.test(yaml));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
