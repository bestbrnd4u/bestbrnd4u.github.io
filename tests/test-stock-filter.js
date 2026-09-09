// Фільтр «Тільки в наявності».
//
// ЧОГО БРАКУВАЛО
// ---------------
// Майже кожен четвертий товар магазин привозить під замовлення (29 зі
// 102 на 09.09.2026), і в каталозі вони стоять поруч із тим, що лежить
// на складі. Бейдж «Під замовлення» на картці був, а звузити список до
// готового до відправки — нічим: людині, якій річ потрібна на цих
// вихідних, доводилось перебирати всі картки очима.
//
// Точні числа тут — знімок, а не константа: каталог росте. Тому
// перевірка [6] нижче рахує їх заново й дивиться на частку, а не на
// число.
//
// ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ
// ---------------------
// 1. Наявність визначена ОДИН раз і тим самим полем, що малює бейдж
//    на картці. Друге визначення неминуче розійшлося б із першим — і
//    фільтр показував би картки з написом «Під замовлення».
// 2. Керування є в обох місцях: рядок фільтрів (десктоп) і шторка
//    (мобільний). Рядок фільтрів на вузьких екранах приховано, тож
//    одного вузла не досить.
// 3. Мобільний рядок не веде в підменю — інакше людина відкривала б
//    порожній екран.
// 4. Стан живе в адресі, повертається з неї й скидається разом з
//    рештою фільтрів.
// 5. Кількість у написі рахується БЕЗ самого себе — інакше при
//    ввімкненому фільтрі вона показувала б довжину вже звуженого
//    списку, тобто завжди «усі».
// 6. Фільтр справді звужує — заміряно на справжніх даних.
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

const catalogJs = read("assets/js/catalog.js");
const catalogHtml = read("catalog.html");
const ui = read("assets/js/ui.js");
const css = read("assets/css/style.css");
const products = JSON.parse(read("data/products.json"));

console.log("\n[1] Наявність визначена один раз — тим самим полем, що бейдж");
{
    check("є окрема функція", /function inStockNow\(product\) \{/.test(catalogJs));

    const src = catalogJs.match(/function inStockNow[\s\S]*?\n}\n/)[0];

    // Саме product.preOrder, а не власний обхід залишків: у
    // зібраному каталозі там уже ГОТОВА відповідь, і живий залишок
    // (assets/js/live-stock.js) її перераховує.
    check("читає product.preOrder", /return !product\.preOrder;/.test(src));

    // Тіло — без назви функції: у самій назві є «Stock», і перевірка
    // на текст спрацювала б на ній, а не на вмісті.
    const body = src.slice(src.indexOf("{") + 1);

    check("не заводить власного розбору залишків",
        !/stock|variants|qty/i.test(body),
        body.replace(/\s+/g, " ").slice(0, 120));

    // Бейдж на картці читає те саме поле. Якби вони розійшлись, у
    // відфільтрованому списку з'явились би картки «Під замовлення».
    const badge = ui.match(/const preOrderBadge = [\s\S]*?;\n/)[0];

    check("бейдж на картці читає те саме поле",
        /product\.preOrder/.test(badge));

    // Живий залишок мусить це поле переписувати — інакше фільтр
    // працював би за станом на момент збірки.
    check("живий залишок перераховує саме його",
        /product\.preOrder = product\.preOrderAlways === true/
            .test(read("assets/js/live-stock.js")));
}

console.log("\n[2] Керування є і на десктопі, і в шторці");
{
    const dom = new JSDOM(catalogHtml);
    const doc = dom.window.document;

    const desktop = doc.getElementById("stockToggle");
    const mobile = doc.getElementById("mfStockRow");

    check("кнопка в рядку фільтрів", Boolean(desktop));
    check("рядок у мобільній шторці", Boolean(mobile));

    // Рядок фільтрів на вузьких екранах прихований — саме тому
    // потрібні два вузли, а не один перенесений.
    check("рядок фільтрів на мобільному приховано",
        /@media\(max-width:768px\)\{[\s\S]{0,200}\.catalog-filters-bar\{\s*display:none;/
            .test(css.replace(/\r\n/g, "\n")));

    if (desktop) {

        check("кнопка каже стан голосом читача",
            desktop.getAttribute("aria-pressed") === "false");

        check("є місце для кількості",
            Boolean(doc.getElementById("stockCount")));

    }

    if (mobile) {

        check("рядок шторки теж каже стан",
            mobile.getAttribute("aria-pressed") === "false");

        // Рядок нікуди не веде: він переключається на місці. Із
        // data-target відкривався б порожній екран підменю, бо
        // targets[] такого ключа не має.
        check("рядок шторки не веде в підменю",
            !mobile.hasAttribute("data-target"));

        check("замість стрілки — перемикач",
            Boolean(mobile.querySelector(".mobile-filter-switch"))
            && !mobile.querySelector(".mobile-filter-row-arrow"));

    }

    // Обидва малюються з одного місця, тож розійтися не можуть.
    check("обидва оновлює одна функція",
        /function updateStockUI/.test(catalogJs)
        && /getElementById\("mfStockRow"\)/.test(catalogJs)
        && /stockToggle\.classList\.toggle\("active", onlyInStock\)/.test(catalogJs));

    check("обидва клацання ведуть в одну дію",
        (catalogJs.match(/addEventListener\("click", toggleOnlyInStock\)/g) || []).length === 2);
}

console.log("\n[3] Видимий стан");
{
    // Активний вигляд мусить існувати в стилях: без нього перемикач
    // клацав би, а виглядав однаково.
    check("кнопка має активний вигляд", /\.stock-toggle\.active\{/.test(css));
    check("галочка з'являється", /\.stock-toggle\.active \.stock-toggle-box\{/.test(css));
    check("перемикач у шторці має активний вигляд",
        /\.mobile-filter-row-switch\.active \.mobile-filter-switch\{/.test(css));

    // «(0)» поруч із назвою фільтра читається як помилка сторінки.
    check("нуль не показується",
        /available\.inStock \? available\.inStock : ""/.test(catalogJs));

    // Нема чого показувати — перемикач вимкнений, а не просто дає
    // порожній список (так само поводяться пили статі).
    check("порожню вибірку перемикач не пропонує",
        /const nothingInStock = available\.inStock === 0 && !onlyInStock;/.test(catalogJs));

    check("уже ввімкнений не блокується — інакше його не зняти",
        /available\.inStock === 0 && !onlyInStock/.test(catalogJs));

    check("вимкнений вигляд є в стилях",
        /\.stock-toggle\.disabled,/.test(css)
        && /\.mobile-filter-row-switch\.disabled\{/.test(css));
}

console.log("\n[4] Стан живе в адресі");
{
    check("ключ описаний разом з рештою", /stock: "stock"/.test(catalogJs));

    check("пишеться в адресу",
        /setOrDelete\(p, URL_KEYS\.stock, onlyInStock \? "1" : ""\)/.test(catalogJs));

    // Вимкнений прапорець в адресу не пишемо: «?stock=0» нічого не
    // означає, крім зайвих символів у скопійованому посиланні.
    check("вимкнений не залишає сміття в посиланні",
        !/URL_KEYS\.stock, onlyInStock \? "1" : "0"/.test(catalogJs));

    check("читається з адреси",
        /onlyInStock = params\.get\("stock"\) === "1";/.test(catalogJs));

    check("є чіп активного фільтра",
        /type: "stock", value: "", label: "Тільки в наявності"/.test(catalogJs));

    check("чіп знімається хрестиком",
        /type === "stock"\) \{\n\n        onlyInStock = false;/.test(catalogJs.replace(/\r\n/g, "\n")));

    check("«Скинути фільтри» скидає і його",
        /onlyInStock = false;\n    updateStockUI\(\);\n\n    currentSort = "";/
            .test(catalogJs.replace(/\r\n/g, "\n")));

    check("значок «скільки фільтрів» його рахує",
        /\+ \(onlyInStock \? 1 : 0\);/.test(catalogJs));
}

console.log("\n[5] Кількість рахується без самого себе");
{
    check("фільтр пропускається на запит «stock»",
        /if \(onlyInStock && skip !== "stock"\)/.test(catalogJs));

    check("кількість беруть саме таким проходом",
        /inStock: filterProducts\("stock"\)\.filter\(inStockNow\)\.length/.test(catalogJs));

    // Порядок за замовчуванням уже спирався на це поле — тримаємо
    // разом, щоб фільтр і сортування не почали розуміти наявність
    // по-різному.
    check("порядок за замовчуванням спирається на те саме поле",
        /const later = product => \(product\.preOrder \? 1 : 0\);/.test(catalogJs));
}

console.log("\n[6] Фільтр справді звужує — на справжніх даних");
{
    const inStock = products.filter(p => !p.preOrder).length;
    const preOrder = products.length - inStock;

    check(`під замовлення ${preOrder} зі ${products.length} — фільтр не порожній жест`,
        preOrder > 0 && inStock > 0 && preOrder / products.length > 0.1,
        `в наявності ${inStock}`);

    // Фільтр, який нічого не відсікає, тільки займає місце в рядку —
    // саме тому в каталозі немає групи розмірів для сумок.
    check("вибірка звужується щонайменше на десяту частину",
        (products.length - inStock) / products.length >= 0.1);
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
