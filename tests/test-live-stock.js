// Живий залишок: наявність із бази, а не з десятихвилинної збірки.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. САЙТ НЕ ЛАМАЄТЬСЯ БЕЗ БАЗИ. Живий залишок — уточнення, а не
//    умова роботи. Недоступна база означає наявність зі збірки (як
//    було досі), а не порожній каталог.
//
// 2. ЧИСЛА НЕ ВИХОДЯТЬ НАЗОВНІ. База віддає «так/ні»: скільки саме
//    одиниць на полиці — відомості про оберти магазину, і сайт їх
//    ніде не показує.
//
// 3. «ПІД ЗАМОВЛЕННЯ ЗАВЖДИ» НЕ СКАСОВУЄТЬСЯ. Перемикач з адмінки
//    сильніший за будь-який залишок — інакше товар, який возять під
//    замовлення принципово, раптом став би наявним.
//
// 4. ТОВАР, ЯКИЙ ЗНОВУ З'ЯВИВСЯ, ПЕРЕСТАЄ БУТИ «ПІД ЗАМОВЛЕННЯ».
//    Саме для цього збірка тримає перемикач окремим полем: у
//    зібраному preOrder лежить уже результат, і розрізнити причини
//    без окремого поля неможливо.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const sql = read("supabase/migrations/012-live-stock.sql");

// Модуль читає window.Stock — у Node обидва лягають у globalThis.
require("../assets/js/stock.js");
const LiveStock = require("../assets/js/live-stock.js");

console.log("\n[1] База віддає наявність, а не кількості");
{
    check("функція є", /create or replace function public\.stock_live\(\)/.test(sql));

    check("повертає «так/ні», а не число",
        /available\s+boolean/.test(sql) && !/qty\s+integer\s*\n?\s*\)/.test(sql));

    // Таблиця залишків закрита від клієнта — саме тому потрібна
    // функція з правами власника.
    check("security definer", /security definer/.test(sql));

    // Без піна search_path виклик security-definer-функції можна
    // збити підміною схеми.
    check("search_path закріплений", /set search_path = public/.test(sql));

    check("читати може відвідувач",
        /grant execute on function public\.stock_live\(\) to anon, authenticated/.test(sql));

    // Підрахунок зайнятих одиниць — той самий, що в перевірці при
    // створенні замовлення. Друга копія розійшлася б із першою.
    check("користується тим самим підрахунком",
        /public\.stock_reserved\(s\.product_id, s\.color, s\.size\)/.test(sql));

    check("сказано, що спершу треба 011",
        /011-stock-reservation\.sql/.test(sql));

    // Назви полів у відповіді й у читанні мусять збігатися.
    //
    // Це найтихіша з можливих поломок: перейменують колонку — модуль
    // не знайде поля, наявність тихо лишиться зі збірки, і ніде
    // жодної помилки. Тому звіряємо обидва боки.
    const code = read("assets/js/live-stock.js");

    const declared = (sql.match(/returns table \(([\s\S]*?)\)/) || [])[1] || "";

    ["product_id", "color", "size", "available"].forEach(field => {

        check(`поле ${field} є і в базі, і в модулі`,
            new RegExp(`\\b${field}\\b`).test(declared)
            && new RegExp(`row\\.${field}`).test(code));

    });

    // Клієнт Supabase оголошений як top-level const, тобто НЕ лежить у
    // window. Читання лише через window давало undefined завжди —
    // живий залишок мовчки не працював.
    check("клієнт шукається не тільки у window",
        /typeof supabaseClient !== "undefined"/.test(code));
}

console.log("\n[2] Без бази сайт працює як раніше");
{
    const products = [{
        id: 1,
        preOrder: false,
        variants: [{ color: "Чорний", sizes: ["ONESIZE"], stock: { ONESIZE: 1 } }]
    }];

    const before = JSON.stringify(products);

    check("порожня відповідь нічого не змінює",
        LiveStock.apply(products, null) === 0 && JSON.stringify(products) === before);

    check("порожня мапа нічого не змінює",
        LiveStock.apply(products, new Map()) === 0 && JSON.stringify(products) === before);

    // supabaseClient у Node немає — модуль мусить це пережити.
    return LiveStock.load().then(live => {

        check("без клієнта запит не падає", live === null, String(live));

        check("є межа очікування", typeof LiveStock.TIMEOUT === "number" && LiveStock.TIMEOUT <= 2000,
            LiveStock.TIMEOUT);

        const code = read("assets/js/live-stock.js");

        check("сторінка не чекає довше за межу",
            /Promise\.race\(\[request, timeout\]\)/.test(code));

        check("один запит на завантаження сторінки",
            /if \(pending\) return pending;/.test(code));

        rest();

    });
}

function rest() {

console.log("\n[3] Наявність із бази переноситься в товари");
{
    const product = () => ({
        id: 7,
        preOrder: false,
        variants: [
            { color: "Чорний", sizes: ["ONESIZE"], stock: { ONESIZE: 1 } },
            { color: "Білий", sizes: ["ONESIZE"], stock: { ONESIZE: 1 } }
        ]
    });

    // Немає в базі → явний 0. Саме так «закінчився» позначається в
    // даних, і далі працюють ті самі правила (assets/js/stock.js).
    const gone = [product()];

    LiveStock.apply(gone, new Map([[LiveStock.cell(7, "Чорний", "ONESIZE"), false]]));

    check("«немає» стає нулем", gone[0].variants[0].stock.ONESIZE === 0,
        gone[0].variants[0].stock.ONESIZE);

    check("колір позначається «під замовлення»", gone[0].variants[0].preOrder === true);

    // Другий колір є — товар загалом ще продається.
    check("сусідній колір не зачеплений",
        gone[0].variants[1].stock.ONESIZE === 1 && gone[0].variants[1].preOrder === false);

    check("товар не став «під замовлення» через один колір",
        gone[0].preOrder === false, String(gone[0].preOrder));

    // Обидва кольори закінчились → уже весь товар.
    const all = [product()];

    LiveStock.apply(all, new Map([
        [LiveStock.cell(7, "Чорний", "ONESIZE"), false],
        [LiveStock.cell(7, "Білий", "ONESIZE"), false]
    ]));

    check("немає жодного кольору — товар «під замовлення»", all[0].preOrder === true);

    // Товар знову з'явився: у зібраному каталозі він ще «під
    // замовлення», база каже, що є. Без окремого поля preOrderAlways
    // розрізнити «закінчився» і «возимо під замовлення» було б
    // неможливо, і товар лишався б під замовлення назавжди.
    const back = [{
        id: 8,
        preOrder: true,
        variants: [{ color: "Чорний", sizes: ["ONESIZE"], stock: { ONESIZE: 0 }, preOrder: true }]
    }];

    LiveStock.apply(back, new Map([[LiveStock.cell(8, "Чорний", "ONESIZE"), true]]));

    check("товар, що знову з'явився, стає наявним",
        back[0].preOrder === false && back[0].variants[0].preOrder === false,
        `${back[0].preOrder} / ${back[0].variants[0].preOrder}`);

    // А перемикач з адмінки живий залишок не скасовує.
    const always = [{
        id: 9,
        preOrder: true,
        preOrderAlways: true,
        variants: [{ color: "Чорний", sizes: ["ONESIZE"], stock: { ONESIZE: 0 } }]
    }];

    LiveStock.apply(always, new Map([[LiveStock.cell(9, "Чорний", "ONESIZE"), true]]));

    check("«під замовлення ЗАВЖДИ» лишається",
        always[0].preOrder === true && always[0].variants[0].preOrder === true);

    // Клітинка, про яку база не знає, — «не рахуємо», а не нуль.
    const untracked = [{
        id: 10,
        preOrder: false,
        variants: [{ color: "Чорний", sizes: ["ONESIZE"] }]
    }];

    check("товар без залишків не чіпаємо",
        LiveStock.apply(untracked, new Map([[LiveStock.cell(10, "Чорний", "ONESIZE"), false]])) === 0
        && untracked[0].preOrder === false);
}

console.log("\n[4] Збірка розділяє перемикач і результат");
{
    const build = read("scripts/build-products.js");

    check("перемикач їде окремим полем",
        /if \(data\.preOrder\) data\.preOrderAlways = true;/.test(build));

    check("і прибирається, коли його вимкнули",
        /else delete data\.preOrderAlways;/.test(build));

    // Поле мусить стояти ДО перезапису preOrder результатом, інакше
    // воно збереже результат, а не перемикач.
    check("поле пишеться до перезапису preOrder",
        build.indexOf("data.preOrderAlways = true") < build.indexOf("data.preOrder = productPreOrder"));

    const products = JSON.parse(read("data/products.json"));

    const toggled = products.filter(p => p.preOrderAlways);
    const preorder = products.filter(p => p.preOrder);

    check(`перемикач стоїть у ${toggled.length} товарах`, toggled.length > 0);

    // Кожен товар із перемикачем — під замовлення. Зворотне неправда:
    // товар може бути під замовлення через нульові залишки.
    check("усі вони «під замовлення»",
        toggled.every(p => p.preOrder === true),
        toggled.filter(p => !p.preOrder).map(p => p.slug).join(", "));

    check("поля немає там, де перемикач вимкнений",
        products.filter(p => p.preOrderAlways === false).length === 0);

    check(`під замовлення — ${preorder.length}`, preorder.length >= toggled.length);
}

console.log("\n[5] Сторінки питають базу паралельно з каталогом");
{
    const pages = ["catalog.html", "product.html", "cart.html", "promo.html"];

    pages.forEach(page => {

        const html = read(page);

        check(`${page}: модуль підключено`, /assets\/js\/live-stock\.js/.test(html));

        // Живий залишок рахує «під замовлення» правилами stock.js —
        // без нього перерахунок мовчки не відбувся б.
        check(`${page}: stock.js теж`, /assets\/js\/stock\.js/.test(html));

        // Модуль мусить бути ДО того, хто його кличе.
        //
        // Шукаємо саме тег, а не назву файлу: у сторінках вона
        // трапляється і в коментарях («JS у product.js замінює їх»),
        // і перша ж така згадка ламала б порівняння позицій.
        const consumer = page === "product.html" ? "product.js"
            : page === "cart.html" ? "cart.js" : "catalog.js";

        const tag = name => html.indexOf(`<script src="assets/js/${name}`);

        check(`${page}: підключено раніше за ${consumer}`,
            tag("live-stock.js") > 0 && tag("live-stock.js") < tag(consumer),
            `${tag("live-stock.js")} проти ${tag(consumer)}`);

    });

    [["assets/js/catalog.js", "catalogData"], ["assets/js/product.js", "products"],
        ["assets/js/cart.js", "allProducts"]].forEach(([file, target]) => {

        const code = read(file);

        // Правило, а не точний рядок: наявність питається В ОДНОМУ
        // Promise.all із товарами. Звідки саме беруться товари —
        // полегшений каталог, повний файл чи спільний кеш — тут
        // неважливо; важливо, що сторінка не чекає двічі.
        const parallel = (code.match(/Promise\.all\(\[[\s\S]{0,600}?\]\)/g) || [])
            .some(block => /window\.LiveStock/.test(block)
                && /loadCatalog\(\)|catalogUrl\(\)|products\.json|getAllProductsCached/.test(block));

        check(`${path.basename(file)}: запит паралельно з каталогом`, parallel);

        check(`${path.basename(file)}: наявність переноситься в товари`,
            new RegExp(`window\\.LiveStock\\.apply\\(${target}, live\\)`).test(code));

    });

    // У каталозі порядок критичний: splitProductsByColor копіює «під
    // замовлення» в кожну картку, і виправляти товар після поділу
    // означало б лишити картки зі старим значенням.
    const catalog = read("assets/js/catalog.js");

    check("каталог переносить наявність ДО поділу за кольорами",
        catalog.indexOf("LiveStock.apply(catalogData, live)")
        < catalog.indexOf("products = splitProductsByColor(catalogData)"));
}

console.log(failures === 0
    ? "\n✅ Живий залишок: наявність із бази, сайт без неї працює\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);

}
