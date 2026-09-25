// Кнопки, яких на сторінці десятки, мусять називати товар — і казати
// правду про свій стан.
//
// ЗАМІРЯНО НА ПРОДІ 25.09.2026, сторінка /catalog
// -----------------------------------------------
// 1. КНОПКИ БЕЗ ІМЕНІ. На сторінці 64 кнопки покупки і рівно ДВІ різні
//    назви на всіх: «Купити» і «Замовити». Хто ходить сторінкою не
//    очима, а списком кнопок, отримує 64 однакові рядки й не може
//    вибрати товар. WCAG 2.4.6 «Заголовки та підписи», рівень AA.
//
// 2. СЕРДЕЧКО БРЕХАЛО. Стан «уже в обраному» ніс лише клас .active —
//    тобто колір іконки. У розмітці не було нічого: ні aria-pressed,
//    ні зміни підпису. Перевірено кліком на живому сайті:
//
//        до кліку:   class="favorite"         title="Додати в обране"
//        після:      class="favorite active"  title="Додати в обране"
//
//    Тобто кнопка обіцяла ДОДАТИ навіть тоді, коли клац прибирав
//    товар зі списку. WCAG 4.1.2 «Ім'я, роль, значення», рівень A —
//    і це стосується не лише читачів екрана: підказку title бачить
//    кожен, хто підвів мишу.
//
// ЧОМУ ТЕСТ ТАКИЙ
// ---------------
// Перевіряємо не наявність рядка «aria-label» у коді, а ПОВЕДІНКУ:
// малюємо дві різні картки й дивимось, чи відрізняються назви кнопок.
// Пошук по тексту пройшов би й на порожньому aria-label="".
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Стенд для картки — той самий, що в test-card-price-badges.js:
// ui.js малює розмітку, а рахує ціну й екранує текст common.js.
function card(product) {

    const dom = new JSDOM("<!doctype html><body><div id='r'></div></body>",
        { runScripts: "outside-only", pretendToBeVisual: true });

    const { window } = dom;
    const cs = read("assets/js/common.js");

    ["escapeHtml", "escapeAttrSingleQuoted", "getProductColors", "getVariantSizes",
        "getAllProductSizes", "getProductGenders", "getProductGenderLabel", "productUrl",
        "colorOverrides", "applyColorOverrides", "baseProduct",
        "saleActive", "priceNow", "oldPriceNow", "discountPercent"]
        .forEach(fn => window.eval(cs.match(new RegExp("function " + fn + "[\\s\\S]*?\\n}\\n"))[0]));

    window.eval(read("assets/js/ui.js").replace(
        "function createProductCard(",
        "window.PRODUCT_SIZES=['S','M'];\nfunction createProductCard("));

    window.document.getElementById("r").innerHTML = window.createProductCard(product);

    return window.document;

}

// Те, що прочитає читач екрана: aria-label важить більше за текст.
const nameOf = el =>
    (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "")
        .replace(/\s+/g, " ").trim();

const bag = {
    id: 1, title: "Сумка крос-боді Marc Jacobs The Snapshot", brand: "Marc Jacobs",
    price: 8600, variants: [{ color: "Чорний", hex: "#000", images: ["a.jpg"] }]
};

const watch = {
    id: 2, title: "Чоловічий годинник Michael Kors Billie", brand: "Michael Kors",
    price: 6600, variants: [{ color: "Сталевий", hex: "#ccc", images: ["b.jpg"] }]
};

console.log("\n[1] Кнопка покупки називає товар");
{
    const buys = d => [...d.querySelectorAll(".buy-btn")].map(nameOf);

    const a = buys(card(bag));
    const b = buys(card(watch));

    check("кнопки покупки в картці є", a.length > 0, `знайдено ${a.length}`);

    check("назва містить назву товару",
        a.every(n => n.includes("Snapshot")), a.join(" | "));

    // Головне: ДВА РІЗНІ товари не дають однакової назви. Саме це й
    // було на проді — 64 кнопки, дві назви.
    const shared = a.filter(n => b.includes(n));

    check("різні товари — різні назви кнопок",
        shared.length === 0, "однакові: " + shared.join(" | "));

    // ОДИН товар у двох кольорах — дві картки з ОДНАКОВОЮ назвою.
    // Саме цей випадок лишався зламаним після першої правки: підпис
    // узяли з product.title, а він у всіх чотирьох картках Coach
    // Tabby той самий.
    const black = buys(card({ ...bag, cardColor: "Чорний" }));
    const beige = buys(card({ ...bag, cardColor: "Бежевий" }));

    check("той самий товар у різних кольорах — теж різні назви",
        black.filter(n => beige.includes(n)).length === 0,
        black.concat(beige).join(" | "));

    check("колір названий словом, а не лише кружечком",
        black.every(n => n.includes("Чорний")), black.join(" | "));
}

console.log("\n[2] Сердечко називає товар");
{
    const hearts = d => [...d.querySelectorAll(".favorite")].map(nameOf);

    const a = hearts(card(bag));
    const b = hearts(card(watch));

    check("сердечко в картці є", a.length > 0);

    check("назва містить назву товару",
        a.every(n => n.includes("Snapshot")), a.join(" | "));

    check("різні товари — різні назви",
        a.filter(n => b.includes(n)).length === 0, a.join(" | "));
}

console.log("\n[3] Стан обраного видно в розмітці, а не лише в кольорі");
{
    // Виконуємо справжню updateFavoriteButtons — ту саму функцію, що
    // працює на сайті, — над підставленим DOM.
    const dom = new JSDOM(`<!doctype html><body>
        <div class="product-card"><button class="favorite" data-id="7"></button></div>
        <div class="product-card"><button class="favorite" data-id="8"></button></div>
        <div class="favorite-row"><button class="favorite-row-remove favorite active" data-id="7"></button></div>
    </body>`, { runScripts: "outside-only" });

    const { window } = dom;

    // У списку обраного лежить лише товар 7.
    window.isFavorite = id => Number(id) === 7;
    window.getSelectedVariant = () => ({ color: null, size: null });

    const src = read("assets/js/common.js");
    const fn = src.match(/function updateFavoriteButtons\(\)[\s\S]*?\n}\n/);

    check("updateFavoriteButtons знайдено в common.js", !!fn);

    if (fn) {

        window.eval(fn[0]);
        window.eval("updateFavoriteButtons()");

        const on = window.document.querySelector('.product-card .favorite[data-id="7"]');
        const off = window.document.querySelector('.product-card .favorite[data-id="8"]');
        const remove = window.document.querySelector(".favorite-row-remove");

        check("колір іконки, як і раніше, перемикається",
            on.classList.contains("active") && !off.classList.contains("active"));

        check("товар у обраному позначений aria-pressed=\"true\"",
            on.getAttribute("aria-pressed") === "true", String(on.getAttribute("aria-pressed")));

        check("товар поза обраним — aria-pressed=\"false\"",
            off.getAttribute("aria-pressed") === "false", String(off.getAttribute("aria-pressed")));

        // Саме тут кнопка й брехала: підказка обіцяла «Додати»,
        // а клац прибирав.
        check("підказка йде за станом, а не стоїть на місці",
            on.getAttribute("title") !== off.getAttribute("title"),
            `у обраному: «${on.getAttribute("title")}», поза: «${off.getAttribute("title")}»`);

        check("підказка у обраного говорить про прибирання",
            /Прибрати|Видалити/i.test(on.getAttribute("title") || ""),
            String(on.getAttribute("title")));

        // «✕ Видалити з обраного» — не перемикач, а одна дія.
        check("кнопку видалення не перетворили на перемикач",
            remove.getAttribute("aria-pressed") === null,
            String(remove.getAttribute("aria-pressed")));

    }
}

console.log("\n[4] Правило діє в усіх шаблонах, де кнопка повторюється");
{
    // Картка каталогу (ui.js), картка добірки (app.js) і рядок
    // обраного (favorites.js) малюють ті самі дії десятками. Новий
    // шаблон без підпису має спіткнутись об цю перевірку одразу.
    //
    // Шукаємо не конкретну змінну, а ПІДСТАВЛЕНЕ значення: ім'я має
    // залежати від товару, а не бути сталим рядком. Інакше перевірка
    // ламалась би від кожного перейменування — вона вже це зробила,
    // коли product.title поступився cardName із кольором картки.
    const DYNAMIC_LABEL = /aria-label="[^"]*\$\{escapeHtml\(/;

    const templates = [
        ["assets/js/ui.js", DYNAMIC_LABEL],
        ["assets/js/app.js", DYNAMIC_LABEL],
        ["assets/js/favorites.js", DYNAMIC_LABEL]
    ];

    templates.forEach(([rel, re]) => {
        // Коментарі прибираємо: пояснення теж називає aria-label.
        const code = read(rel).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
        check(`${path.basename(rel)} підписує кнопку назвою товару`, re.test(code));
    });
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
