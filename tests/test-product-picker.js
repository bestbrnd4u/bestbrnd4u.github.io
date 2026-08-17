// Поле вибору товарів в адмінці (admin/product-picker.js).
//
// Стандартний relation у Decap шукає ПІДПОСЛІДОВНІСТЮ: збігом
// вважається будь-який рядок, де літери запиту трапляються в
// потрібному порядку, хай і врозкид. Через це запит «coach» видавав
// Armani Exchange, Marc Jacobs і Michael Kors — у
// «Чоловіча сумка Armani Exchange Crossbody Bag Black» справді є
// c…o…a…c…h. Налаштуванням це не лікується, тому поле своє.
//
// Найважливіша перевірка тут — [2]: коли збігів немає, список має
// бути ПОРОЖНІЙ, а не «весь каталог».
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "admin/product-picker.js"), "utf8");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// Логіка пошуку — дзеркало тієї, що у віджеті. Тримається поруч
// свідомо: віджет виконується у браузері адмінки, імпортувати його
// в node не можна (він одразу чіпає CMS і window).
const LOOKALIKE = { "а": "a", "с": "c", "е": "e", "о": "o", "р": "p", "х": "x", "і": "i", "у": "y" };
const norm = v => String(v === undefined || v === null ? "" : v)
    .toLowerCase().replace(/[асеорхіу]/g, c => LOOKALIKE[c] || c);
const hay = p => norm([p.title, p.brand, p.category, p.sku, p.id].filter(Boolean).join(" "));
const matches = (p, q) => {
    const w = norm(q).split(/\s+/).filter(Boolean);
    return w.length > 0 && w.every(x => hay(p).indexOf(x) !== -1);
};

const products = fs.readdirSync(path.join(ROOT, "data/products"))
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "data/products", f), "utf8")))
    .filter(p => typeof p.id === "number");

const find = q => products.filter(p => matches(p, q));

console.log("\n[1] Пошук знаходить те, що треба");
{
    check(`каталог прочитано (${products.length})`, products.length > 20);

    const coach = find("coach");
    check("«coach» → лише товари Coach",
        coach.length > 0 && coach.every(p => p.brand === "Coach"),
        coach.filter(p => p.brand !== "Coach").map(p => p.brand + " " + p.title).join(" | "));

    check("«coach tabby» — два слова звужують пошук",
        find("coach tabby").length > 0 && find("coach tabby").length < coach.length,
        `${find("coach tabby").length} з ${coach.length}`);

    check("пошук за категорією («годинник»)", find("годинник").length >= 4, find("годинник").length);
    check("пошук за брендом («marc»)",
        find("marc").length > 0 && find("marc").every(p => p.brand === "Marc Jacobs"));
    check("регістр не має значення",
        find("COACH").length === coach.length);

    const withSku = products.find(p => p.sku);
    if (withSku) {
        check("пошук за артикулом", find(withSku.sku).some(p => p.id === withSku.id), withSku.sku);
    }

    check("пошук за id", find(String(products[0].id)).some(p => p.id === products[0].id));
}

console.log("\n[2] Немає збігів — немає й списку (той самий баг)");
{
    check("вигадане слово нічого не знаходить", find("zzzqqq").length === 0);
    check("порожній запит нічого не показує", find("").length === 0 && find("   ").length === 0);

    // саме це виглядало як «поганий пошук»: у видачі були чужі бренди
    ["Armani Exchange", "Marc Jacobs", "Michael Kors"].forEach(brand => {
        check(`«coach» не тягне ${brand}`,
            !find("coach").some(p => p.brand === brand));
    });

    check("слова, яких немає разом, дають порожньо",
        find("coach balenciaga").length === 0);
}

console.log("\n[3] Схожі на вигляд літери не заважають");
{
    // у назвах товарів кирилична «о» і латинська «o» трапляються впереміш
    check("кирилична «о» в запиті знаходить латинську",
        find("сoach").length === find("coach").length,
        `${find("сoach").length} проти ${find("coach").length}`);
}

console.log("\n[4] Віджет підключений і поля переведені на нього");
{
    const indexHtml = fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8");
    check("product-picker.js підключений в адмінці", indexHtml.includes("product-picker.js"));
    check("підключений ПІСЛЯ самої CMS (інакше CMS ще не існує)",
        indexHtml.indexOf("decap-cms.js") < indexHtml.indexOf("product-picker.js"));

    check("віджет зареєстрований", /CMS\.registerWidget\("productPicker"/.test(SRC));
    check("порожній результат обробляється окремим повідомленням",
        SRC.includes("Нічого не знайдено"));
    check("список обмежений, щоб не малювати сотні рядків", /slice\(0,\s*\d+\)/.test(SRC));

    const config = fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8");
    const pickerFields = (config.match(/widget: "productPicker"/g) || []).length;
    check("обидва поля товарів переведені на нове поле", pickerFields === 2, pickerFields);

    check("relation для товарів більше не використовується",
        !/collection: "products"[\s\S]{0,200}?value_field: "id"/.test(config));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
