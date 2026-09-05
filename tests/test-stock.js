// Залишки товару.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// «Під замовлення» був перемикачем: хтось мусив згадати, що сумка
// скінчилась, і піти в адмінку його ввімкнути. Поки не згадав — сайт
// обіцяв доставку за 1–3 дні того, чого немає.
//
// Тепер у товару є залишки по кожному кольору й розміру, а «під
// замовлення» вмикається САМО, коли лишився нуль.
//
// ГОЛОВНІ ВИМОГИ, ЯКІ СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// --------------------------------------------
// 1. ПОРОЖНЯ КЛІТИНКА — ЦЕ НЕ НУЛЬ. Товар вважається закінченим, лише
//    коли по КОЖНОМУ розміру кольору стоїть явний 0. Інакше менеджер,
//    заповнивши залишки одного кольору з трьох, мовчки відправив би
//    два інші в «під замовлення».
// 2. СТО ТОВАРІВ БЕЗ ЗАЛИШКІВ ПОВОДЯТЬСЯ ЯК РАНІШЕ. Нова можливість
//    не має нічого змінити тим, хто нею не користується.
// 3. ОДНЕ ПРАВИЛО НА ТРИ СТОРОНИ — збірку, сайт і адмінку. Своя копія
//    арифметики в прев'ю означала б, що адмінка показує одне, а
//    опублікований товар — інше.
// 4. КОЛІР І РОЗМІР — РІЗНІ РІВНІ. Бежевої сумки може не бути, коли
//    чорна є; 39-го розміру може не бути, коли 40-й лежить на складі.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

// Прибирання за собою: нижче запускається СПРАВЖНЯ збірка з cwd у
// корені репозиторію, і вона пише в data/. Знімок повернеться на
// місце сам, коли процес завершиться.
require("./helpers/workspace").guardBuildOutputs(ROOT);

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const Stock = require(path.join(ROOT, "assets/js/stock.js"));

console.log("\n[1] Порожня клітинка — це не нуль");
{
    // Найважливіше правило. Якби порожнє означало нуль, достатньо було
    // б заповнити залишки одного кольору — і решта товару зникла б з
    // продажу без жодного повідомлення.
    const частково = {
        sizes: ["39", "40", "41"],
        variants: [{ color: "Білий", stock: { "39": 0, "40": 2 } }]
    };

    check("розміру з нулем немає", Stock.sizePreOrder(частково, частково.variants[0], "39"));
    check("розмір із залишком є", !Stock.sizePreOrder(частково, частково.variants[0], "40"));
    check("розмір, якого не рахують, лишається доступним",
        !Stock.sizePreOrder(частково, частково.variants[0], "41"));

    check("колір НЕ закінчився, поки хоч один розмір не порахований",
        !Stock.colorPreOrder(частково, частково.variants[0]));

    частково.variants[0].stock = { "39": 0, "40": 0, "41": 0 };

    check("нуль по ВСІХ розмірах — колір закінчився",
        Stock.colorPreOrder(частково, частково.variants[0]));
}

console.log("\n[2] Колір і товар — різні рівні");
{
    const товар = {
        sizes: ["ONESIZE"],
        variants: [
            { color: "Бежевий", stock: { ONESIZE: 0 } },
            { color: "Чорний", stock: { ONESIZE: 4 } }
        ]
    };

    check("бежевого немає", Stock.colorPreOrder(товар, товар.variants[0]));
    check("чорний є", !Stock.colorPreOrder(товар, товар.variants[1]));
    check("товар загалом продається", !Stock.isPreOrder(товар));
    check("разом на складі 4", Stock.productTotal(товар) === 4, Stock.productTotal(товар));

    товар.variants[1].stock = { ONESIZE: 0 };

    check("нуль по всіх кольорах — товар під замовлення", Stock.isPreOrder(товар));

    // Колір, по якому нічого не рахують, вважається наявним: інакше
    // заповнення одного кольору ховало б решту.
    const змішаний = {
        sizes: ["ONESIZE"],
        variants: [
            { color: "Бежевий", stock: { ONESIZE: 0 } },
            { color: "Чорний" }
        ]
    };

    check("непорахований колір не робить товар «під замовлення»",
        !Stock.isPreOrder(змішаний));
}

console.log("\n[3] Товари без залишків поводяться як раніше");
{
    const старий = { preOrder: false, sizes: ["ONESIZE"], variants: [{ color: "Сірий" }] };

    check("залишки не рахуються", !Stock.productTracked(старий));
    check("товар не «під замовлення»", !Stock.isPreOrder(старий));
    check("жоден розмір не позначений", !Stock.sizePreOrder(старий, старий.variants[0], "ONESIZE"));

    // Перемикач нікуди не дівся: ним позначають те, що возять під
    // замовлення завжди, скільки б його не було на складі.
    const завжди = { preOrder: true, sizes: ["ONESIZE"], variants: [{ color: "Сірий", stock: { ONESIZE: 5 } }] };

    check("перемикач сильніший за залишок", Stock.isPreOrder(завжди));
    check("і за кольором теж", Stock.colorPreOrder(завжди, завжди.variants[0]));
}

console.log("\n[4] Сміття в числах не ламає рахунок");
{
    const clean = Stock.normalizeStock({ A: "", B: "2", C: -1, D: "три", E: 0, F: 2.7, G: null });

    check("порожнє відкидається", !("A" in clean));
    check("рядок із числом читається", clean.B === 2);
    check("відʼємне відкидається", !("C" in clean), JSON.stringify(clean));
    check("текст відкидається", !("D" in clean));
    check("нуль зберігається — це відповідь", clean.E === 0);
    check("дробове зводиться до цілого", clean.F === 2);
    check("null відкидається", !("G" in clean));
}

console.log("\n[5] Збірка: залишки їдуть у варіанти, а «під замовлення» — у товар");
{
    // Перевірка на СПРАВЖНІЙ збірці, а не на її описі: беремо товар із
    // каталогу, вписуємо йому залишки, запускаємо scripts/build-products.js
    // і дивимось, що вийшло. Дерево повертає на місце охорона зверху.
    const dir = path.join(ROOT, "data/products");

    // Товар із двома кольорами і БЕЗ перемикача «завжди під
    // замовлення»: з ним перевірка нічого б не показала — усі кольори
    // були б «під замовлення» незалежно від залишків.
    const file = fs.readdirSync(dir).filter(f => f.endsWith(".json")).find(f => {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        return !data.preOrder && (data.variants || []).filter(v => v && v.color).length >= 2;
    });

    check("знайшовся товар із двома кольорами для перевірки", Boolean(file), file);

    if (file) {

        const full = path.join(dir, file);
        const data = JSON.parse(fs.readFileSync(full, "utf8"));

        const colors = data.variants.map(v => v.color);
        const sizes = data.sizes && data.sizes.length ? data.sizes : ["ONESIZE"];

        const zero = {};
        sizes.forEach(size => { zero[size] = 0; });

        data.stock = {
            [colors[0]]: zero,
            [colors[1]]: Object.fromEntries(sizes.map(size => [size, 3])),
            // Колір, якого в товарі немає: збірка мусить його прибрати,
            // інакше «Неіснуючий: 0» тягнув би товар у «під замовлення».
            "Кольору-привида": { [sizes[0]]: 0 }
        };

        fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");

        execFileSync("node", [path.join(ROOT, "scripts/build-products.js")], {
            cwd: ROOT, encoding: "utf8"
        });

        const built = JSON.parse(read("data/products.json"));
        const product = built.find(p => p.slug === data.slug);

        check("товар лишився в каталозі", Boolean(product), data.slug);

        if (product) {

            const first = product.variants[0];
            const second = product.variants[1];

            check("залишок переїхав у варіант", JSON.stringify(first.stock) === JSON.stringify(zero),
                JSON.stringify(first.stock));
            check("другий колір теж", second.inStock === 3 * sizes.length, second.inStock);

            check("порожній колір позначений «під замовлення»", first.preOrder === true);
            check("колір із залишком — ні", second.preOrder === undefined, second.preOrder);

            check("товар загалом продається (є другий колір)", product.preOrder === false);
            check("підсумок по товару порахований", product.inStock === 3 * sizes.length, product.inStock);

            // Словник за кольорами далі не потрібен: усе, що з нього
            // випливає, лежить у варіантах. Дві копії розійшлися б.
            check("словник за кольорами в products.json не потрапив", !("stock" in product));

        }

        const source = JSON.parse(fs.readFileSync(full, "utf8"));

        check("неіснуючий колір прибрано з джерела",
            source.stock && !("Кольору-привида" in source.stock),
            JSON.stringify(source.stock));

        // Другий прогін нічого не міняє — інакше кожна збірка
        // перезаписувала б товари й смітила в гілці.
        const before = read("data/products.json");

        execFileSync("node", [path.join(ROOT, "scripts/build-products.js")], {
            cwd: ROOT, encoding: "utf8"
        });

        check("повторна збірка нічого не міняє", read("data/products.json") === before);

    }
}

console.log("\n[6] Каталог: картка кольору знає СВОЮ наявність");
{
    // Товар розгортається в каталозі по кольорах (splitByColor). Без
    // цього картка бежевої сумки, якої не лишилось, обіцяла б доставку
    // за 1–3 дні — бо чорна ще є, і товар загалом не «під замовлення».
    const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });
    const { window } = dom;

    const common = read("assets/js/common.js");

    ["colorOverrides", "applyColorOverrides", "baseProduct", "splitProductsByColor"]
        .forEach(fn => window.eval(common.match(new RegExp("function " + fn + "[\\s\\S]*?\\n}\\n"))[0]));

    window.eval("window.__split = splitProductsByColor;");

    const cards = window.__split([{
        id: 1, title: "Сумка", price: 100, preOrder: false, sizes: ["ONESIZE"],
        variants: [
            { color: "Бежевий", hex: "#eee", images: ["a.webp"], preOrder: true },
            { color: "Чорний", hex: "#000", images: ["b.webp"] }
        ]
    }]);

    check("товар розгорнувся у дві картки", cards.length === 2, cards.length);
    check("картка бежевого — «під замовлення»", cards[0].preOrder === true);
    check("картка чорного — ні", cards[1].preOrder === false, cards[1].preOrder);
}

console.log("\n[7] Сторінка товару: розмір, якого немає");
{
    const src = read("assets/js/product.js");

    // Розмір НЕ ховаємо й не вимикаємо: покупець шукає свій розмір і
    // має побачити, що він існує, — просто під замовлення. Схований
    // розмір читається як «такого не буває».
    check("відсутній розмір позначається класом", /size-out/.test(src));
    check("і лишається кнопкою, яку можна натиснути",
        !/disabled/.test(src.slice(src.indexOf("const sizeButtons"), src.indexOf("}).join(\"\");", src.indexOf("const sizeButtons")))));
    check("у стилях описано, чому не ховаємо",
        /НЕ ХОВАЄМО/.test(read("assets/css/style.css")));

    // Обидва блоки — умови замовлення й доставка — завжди в розмітці:
    // інакше перемикання кольору чи розміру означало б збирати блок
    // наново рядком у common.js, тобто другу копію шаблону.
    check("блок умов завжди в розмітці", /class="preorder-box" \$\{product\.preOrder \? "" : "hidden"\}/.test(src));
    check("блок доставки теж", /class="delivery-box" \$\{product\.preOrder \? "hidden" : ""\}/.test(src));

    // Сама функція — на справжньому DOM.
    const dom = new JSDOM(`<!doctype html><body>
        <div id="productPage" data-color-preorder="0">
            <div class="preorder-tag" hidden>📦 Під замовлення</div>
            <div class="sizes">
                <button class="size active" data-size="39" data-out="1">39</button>
                <button class="size" data-size="40">40</button>
            </div>
            <button class="buy-btn">🛒 Купити</button>
            <div class="preorder-box" hidden>умови</div>
            <div class="delivery-box">доставка</div>
        </div></body>`, { runScripts: "outside-only" });

    const { window } = dom;

    window.eval(src.match(/function refreshAvailability[\s\S]*?\n}\n/)[0]);
    window.eval("window.__refresh = refreshAvailability;");

    const doc = window.document;

    window.__refresh();

    check("обраний розмір без залишку → «під замовлення»",
        doc.querySelector(".preorder-tag").hidden === false);
    check("кнопка міняє текст", doc.querySelector(".buy-btn").textContent === "📦 Замовити");
    check("умови замовлення показані", doc.querySelector(".preorder-box").hidden === false);
    check("блок доставки прибраний", doc.querySelector(".delivery-box").hidden === true);

    // Обрали розмір, який є — сторінка повертається до звичайного стану.
    doc.querySelector('[data-size="39"]').classList.remove("active");
    doc.querySelector('[data-size="40"]').classList.add("active");

    window.__refresh();

    check("розмір у наявності → звичайний стан",
        doc.querySelector(".preorder-tag").hidden === true
        && doc.querySelector(".buy-btn").textContent === "🛒 Купити"
        && doc.querySelector(".delivery-box").hidden === false);

    // Колір під замовлення перебиває розмір: якщо цього кольору немає
    // взагалі, немає й жодного його розміру.
    doc.getElementById("productPage").dataset.colorPreorder = "1";

    window.__refresh();

    check("колір без залишку → «під замовлення» попри наявний розмір",
        doc.querySelector(".preorder-tag").hidden === false);
}

console.log("\n[8] Перемикання кольору оновлює наявність");
{
    const src = read("assets/js/common.js");
    const page = read("assets/js/product.js");

    check("свотч несе перелік відсутніх розмірів", /data-out-sizes=/.test(page));
    check("перемикач читає його", /dataset\.outSizes/.test(src));
    check("і ставить позначки на кнопки розмірів", /classList\.toggle\("size-out", isOut\)/.test(src));

    check("стан кольору лягає на контейнер сторінки",
        /page\.dataset\.colorPreorder = view\.preOrder \? "1" : "0"/.test(src));
    check("після цього сторінку просять оновити наявність",
        /window\.refreshAvailability === "function"/.test(src));

    // Картка каталогу навмисно без позначок: у неї свій рівень
    // відповіді («цього КОЛЬОРУ немає»), і кнопка на ній одна на всі
    // розміри.
    check("картка каталогу позначок розмірів не отримує",
        !/mini-size-out/.test(src) && !/mini-size-out/.test(read("assets/js/ui.js")));
}

console.log("\n[9] Адмінка: де це редагують");
{
    const yaml = read("admin/config.yml");

    check("поле залишків є", /name: "stock"\s*\n\s*widget: "stockGrid"/.test(yaml));
    check("воно необовʼязкове",
        /name: "stock"[\s\S]{0,120}required: false/.test(yaml));
    check("підказка пояснює головне правило",
        /ПОРОЖНЯ КЛІТИНКА — це не нуль/.test(yaml));
    check("підказка чесно каже, що списання не автоматичне",
        /не зменшується сам/.test(yaml));

    // Перемикач лишається — але тепер він про інше.
    check("перемикач переназваний у «завжди»", /"📦 Товар під замовлення ЗАВЖДИ"/.test(yaml));
    check("і пояснює, коли його НЕ треба чіпати",
        /поставте 0 у залишках/.test(yaml));

    const widget = read("admin/stock-widget.js");

    check("віджет зареєстрований", /registerWidget\("stockGrid"/.test(widget));
    check("читає кольори з самого запису", /entry.*\.get\("data"\)/.test(widget));
    check("розміри кольору мають перевагу над загальними",
        /variant\.sizes\) && variant\.sizes\.length\) return variant\.sizes/.test(widget));
    check("є кнопка «усе продано»", /Усе продано/.test(widget));
    check("і «не рахувати» — щоб можна було припинити облік", /Не рахувати/.test(widget));
    check("поле ніколи не блокує збереження", /isValid: function \(\) \{ return true; \}/.test(widget));

    const index = read("admin/index.html");

    check("правила підключені в адмінці", /assets\/js\/stock\.js/.test(index));
    check("віджет теж", /stock-widget\.js/.test(index));
    // Порівнюємо саме теги, і БЕЗ закритої лапки: назва віджета
    // згадується ще й у коментарі вище (наївний indexOf знайшов би
    // його раніше за підключення), а збірка дописує в адресу ?v=.
    const tagAt = name => index.indexOf('src="' + name);

    check("правила йдуть ДО віджета",
        tagAt("../assets/js/stock.js") > 0
        && tagAt("../assets/js/stock.js") < tagAt("stock-widget.js"));

    const preview = read("admin/preview-templates.js");

    check("прев'ю рахує наявність тим самим модулем", /window\.Stock\.isPreOrder\(entryData\)/.test(preview));
    check("і показує, ЧОМУ товар під замовлення", /нульові залишки/.test(preview));
    check("у характеристиках видно самі залишки", /\["Залишки", stockSummary\(entryData\)\]/.test(preview));
}

console.log("\n[9б] Віджет справді редагує залишки");
{
    // Не «зареєстрований і містить потрібні рядки», а працює: піднімаємо
    // його з підробленими CMS, h і createClass — так само, як тест
    // прев'ю адмінки піднімає AssetImage.
    const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });
    const { window } = dom;

    // Найпростіший «React»: h() збирає дерево обʼєктів, createClass
    // повертає опис як є. Розмітка нам не потрібна — потрібні виклики
    // onChange і те, скільки клітинок намалювалось.
    let Control = null;

    window.h = function (type, props) {

        const children = Array.prototype.slice.call(arguments, 2);

        return { type: type, props: props || {}, children: children };

    };

    window.createClass = function (spec) { return spec; };

    window.CMS = {
        registerWidget: function (name, control) { if (name === "stockGrid") Control = control; }
    };

    window.eval(read("admin/stock-widget.js"));

    check("віджет піднявся", Boolean(Control));

    // Запис товару в тому вигляді, у якому його дає Decap: Immutable-
    // подібний обʼєкт із get() і toJS().
    const entry = {
        data: {
            sizes: ["39", "40"],
            preOrder: false,
            variants: [
                { color: "Білий", hex: "#fff", sizes: ["39", "40"] },
                { color: "Чорний", hex: "#000" }
            ]
        }
    };

    // Decap віддає запис Immutable-мапою: entry.get("data") — теж мапа,
    // а не звичайний обʼєкт. Віджет саме на це й розраховує.
    const dataMap = {
        get: function (key) {

            const value = entry.data[key];

            return Array.isArray(value)
                ? { toJS: function () { return value; } }
                : value;

        }
    };

    const immutable = {
        get: function (key) { return key === "data" ? dataMap : entry.data[key]; },
        getIn: function (keys) { return entry.data[keys[1]]; }
    };

    let saved = null;

    const instance = Object.create(Control);

    instance.props = {
        entry: immutable,
        value: { "Білий": { "39": 2 } },
        onChange: function (next) { saved = next; }
    };

    // Скільки клітинок намалювалось: у білого свої два розміри,
    // чорний успадковує загальні — теж два.
    function countInputs(node) {

        if (!node || typeof node !== "object") return 0;

        if (Array.isArray(node)) return node.reduce((sum, item) => sum + countInputs(item), 0);

        return (node.type === "input" ? 1 : 0) + countInputs(node.children);

    }

    const tree = instance.render();

    check("клітинка на кожен розмір кожного кольору", countInputs(tree) === 4, countInputs(tree));

    // Читання: те, що вже стоїть у товарі, показується в полі.
    check("наявне значення показується", instance.valueOf("Білий", "39") === "2");
    check("порожня клітинка лишається порожньою", instance.valueOf("Білий", "40") === "");

    // Запис.
    instance.setCell("Білий", "40", "5");
    check("нове число зберігається", saved && saved["Білий"]["40"] === 5, JSON.stringify(saved));

    instance.props.value = saved;
    instance.setCell("Білий", "40", "");
    check("очищена клітинка зникає із запису",
        saved && !("40" in saved["Білий"]), JSON.stringify(saved));

    // Нуль — це відповідь, а не порожньо.
    instance.props.value = saved;
    instance.setCell("Білий", "40", "0");
    check("нуль зберігається", saved["Білий"]["40"] === 0, JSON.stringify(saved));

    // Відʼємне не має перетворюватись на нуль: «мінус три сумки» не
    // існує, а нуль відправив би колір у «під замовлення».
    instance.props.value = saved;
    instance.setCell("Білий", "39", "-3");
    check("відʼємне не стає нулем", !("39" in saved["Білий"]), JSON.stringify(saved));

    // Кнопка «усе продано»: нуль по всіх розмірах кольору.
    instance.props.value = {};
    instance.setColor("Чорний", ["39", "40"], 0);
    check("«усе продано» ставить нуль скрізь",
        saved["Чорний"]["39"] === 0 && saved["Чорний"]["40"] === 0, JSON.stringify(saved));

    // Кнопка «не рахувати»: колір зникає із запису цілком.
    instance.props.value = saved;
    instance.setColor("Чорний", ["39", "40"], null);
    check("«не рахувати» прибирає колір із запису", !("Чорний" in saved), JSON.stringify(saved));

    // Той самий висновок, що й у Stock: нуль по всіх розмірах = немає.
    instance.props.value = { "Білий": { "39": 0, "40": 0 } };
    check("віджет називає колір закінченим так само, як сайт",
        instance.colorSoldOut("Білий", ["39", "40"]) === true
        && Stock.colorSoldOut({ "39": 0, "40": 0 }, ["39", "40"]) === true);

    instance.props.value = { "Білий": { "39": 0 } };
    check("і не називає, поки другий розмір не порахований",
        instance.colorSoldOut("Білий", ["39", "40"]) === false
        && Stock.colorSoldOut({ "39": 0 }, ["39", "40"]) === false);
}

console.log("\n[9в] Кошик рахує наявність по рядку, а не по товару");
{
    // У товару «під замовлення» — одна відповідь на всіх, а в кошику
    // лежить конкретний колір і конкретний розмір. Без цього кошик
    // обіцяв би доставку за 1–3 дні того, що сторінка товару вже
    // показала як «під замовлення».
    const cart = read("assets/js/cart.js");

    check("рядок питає власну наявність", /const linePreOrder = \(product, line\)/.test(cart));
    check("враховує колір рядка", /v\.color === line\.color/.test(cart));
    check("і розмір рядка", /stock\.sizePreOrder\(product, variant, line\.size\)/.test(cart));
    check("позначка в рядку — за цією ж відповіддю",
        /\$\{preOrder \? /.test(cart) && !/product\.preOrder \? /.test(cart));
    check("підсумок «є товари під замовлення» — теж",
        /if \(preOrder\) hasPreOrder = true;/.test(cart));

    const page = read("cart.html");

    check("кошик підключає правила", /src="assets\/js\/stock\.js/.test(page));
    check("і робить це ДО cart.js",
        page.indexOf('src="assets/js/stock.js') < page.indexOf('src="assets/js/cart.js'));
}

console.log("\n[10] Одне правило на три сторони");
{
    // Своя копія арифметики в збірці, на сайті чи в прев'ю означала б,
    // що адмінка показує одне, а опублікований товар — інше.
    check("збірка бере правила з модуля",
        /require\("\.\.\/assets\/js\/stock\.js"\)/.test(read("scripts/build-products.js")));
    check("сторінка товару теж", /window\.Stock/.test(read("assets/js/product.js")));
    check("і прев'ю адмінки", /window\.Stock/.test(read("admin/preview-templates.js")));

    // Модуль мусить працювати і в браузері, і в Node.
    check("модуль віддається обом середовищам",
        /module\.exports/.test(read("assets/js/stock.js"))
        && /typeof window !== "undefined" \? window : globalThis/.test(read("assets/js/stock.js")));

    // Сторінка товару вантажить його — інакше soldOutSizes мовчки
    // повертав би порожньо, і жоден розмір не був би позначений.
    check("сторінка товару підключає модуль", /assets\/js\/stock\.js/.test(read("product.html")));
    check("і робить це ДО product.js",
        read("product.html").indexOf("assets/js/stock.js")
        < read("product.html").indexOf("assets/js/product.js"));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");
process.exit(failures ? 1 : 0);
