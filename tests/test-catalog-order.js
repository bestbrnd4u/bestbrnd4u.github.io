// Порядок товарів у каталозі за замовчуванням.
//
// СИМПТОМ
// --------
// Кожен доданий в адмінці товар опинявся в самому кінці каталогу — на
// останній сторінці, де його ніхто не побачить. Причина: сортування за
// замовчуванням не було ЗОВСІМ. Список лишався таким, яким приходив з
// products.json, а той упорядкований за зростанням id — тобто від
// найстарішого до найновішого. Заразом категорії йшли впереміш:
// сумка, окуляри, кросівки, знову сумка.
//
// ТЕПЕР три рівні, саме в цьому порядку:
//   1) категорія — як у бічному меню;
//   2) наявність — під замовлення в кінець свого розділу;
//   3) новизна — більший id (пізніше додано) вище.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const catalog = read("assets/js/catalog.js");

console.log("\n[1] Правило описане в коді");
{
    check("порядок застосовується лише без явного сортування",
        /if \(!currentSort\) \{/.test(catalog));

    check("категорії ранжуються за меню", /categoryOrder\.has\(product\.category\)/.test(catalog));
    check("під замовлення нижче", /product\.preOrder \? 1 : 0/.test(catalog));
    check("новіші вище", /\(Number\(b\.id\) \|\| 0\) - \(Number\(a\.id\) \|\| 0\)/.test(catalog));

    // Категорія, якої ще немає в меню, не має витісняти згори весь
    // каталог — тому в кінець, а не на початок.
    check("невідома категорія йде в кінець",
        /Number\.MAX_SAFE_INTEGER/.test(catalog));

    check("порядок меню будується разом із розділами",
        /categoryOrder\.set\(name, categoryOrder\.size\)/.test(catalog));
}

console.log("\n[2] Порядок на справжніх даних каталогу");
{
    // Відтворюємо ту саму логіку й перевіряємо результат, а не текст.
    const products = JSON.parse(read("data/products.json"));
    const categories = JSON.parse(read("data/categories.json"));

    const byDepartment = new Map();

    categories.forEach(c => {
        if (!byDepartment.has(c.department)) byDepartment.set(c.department, []);
        byDepartment.get(c.department).push(c.name);
    });

    const order = new Map();

    byDepartment.forEach(list => list.forEach(name => {
        if (!order.has(name)) order.set(name, order.size);
    }));

    const rank = p => order.has(p.category) ? order.get(p.category) : Number.MAX_SAFE_INTEGER;
    const later = p => (p.preOrder ? 1 : 0);

    const sorted = [...products].sort((a, b) =>
        rank(a) - rank(b) || later(a) - later(b) || b.id - a.id);

    // 1. категорії не перемішані: кожна зустрічається одним суцільним
    //    блоком, а не вроздріб
    const seen = new Set();
    const broken = [];
    let current = null;

    sorted.forEach(p => {

        if (p.category === current) return;

        if (seen.has(p.category)) broken.push(p.category);

        seen.add(p.category);
        current = p.category;

    });

    check("кожна категорія йде суцільним блоком", broken.length === 0,
        [...new Set(broken)].join(", "));

    // 2. блоки йдуть у порядку меню
    const blockOrder = [...seen].map(name => order.get(name) ?? Number.MAX_SAFE_INTEGER);
    const ascending = blockOrder.every((v, i) => i === 0 || blockOrder[i - 1] <= v);

    check("блоки в порядку бічного меню", ascending, [...seen].join(" → "));

    // 3. усередині кожної категорії: спершу наявні, потім під замовлення,
    //    і всередині кожної групи — новіші вище
    const problems = [];

    seen.forEach(category => {

        const inCategory = sorted.filter(p => p.category === category);

        // під замовлення не може стояти перед наявним
        const firstPreOrder = inCategory.findIndex(p => p.preOrder);
        const lastInStock = inCategory.map(p => !p.preOrder).lastIndexOf(true);

        if (firstPreOrder !== -1 && firstPreOrder < lastInStock) {
            problems.push(`${category}: під замовлення вище наявного`);
        }

        // id спадає всередині кожної з двох груп
        [false, true].forEach(pre => {

            const group = inCategory.filter(p => !!p.preOrder === pre).map(p => p.id);

            if (!group.every((v, i) => i === 0 || group[i - 1] > v)) {
                problems.push(`${category}: id не спадає (${pre ? "під замовлення" : "наявні"})`);
            }

        });

    });

    check("у кожній категорії: наявні → під замовлення, новіші вище",
        problems.length === 0, problems.slice(0, 3).join("; "));

    // 4. головне, заради чого все це: найновіший товар не в кінці
    const newest = products.reduce((a, b) => (a.id > b.id ? a : b));
    const position = sorted.findIndex(p => p.id === newest.id);

    check("найновіший товар не опиняється в кінці каталогу",
        position < products.length / 2,
        `позиція ${position + 1} з ${products.length}`);

    // і він перший у своїй категорії
    const inHisCategory = sorted.filter(p => p.category === newest.category);

    check("найновіший — перший у своїй категорії",
        inHisCategory[0].id === newest.id,
        `${inHisCategory[0].id} замість ${newest.id}`);
}

console.log("\n[3] Явне сортування не зачіпається");
{
    // Порядок за замовчуванням не має втручатись, коли людина сама
    // обрала «спочатку дешевші» — інакше вибір нічого не змінював би.
    const block = catalog.slice(catalog.indexOf("if (!currentSort) {"));

    check("умова стоїть перед switch",
        block.indexOf("switch (currentSort)") > 0);
    check("switch із явними сортуваннями лишився",
        /case "priceAsc"/.test(catalog) && /case "priceDesc"/.test(catalog));
}

console.log("\n[4] Товари під замовлення — на підставних даних");
{
    // У каталозі зараз НЕМАЄ жодного товару під замовлення, тож на
    // справжніх даних це правило не перевіриш: перевірка вище пройшла б
    // і при повністю зламаній логіці. Тому окремо, на вигаданому наборі.
    const order = new Map([["Сумки", 0], ["Кросівки", 1]]);

    const rank = p => order.has(p.category) ? order.get(p.category) : Number.MAX_SAFE_INTEGER;
    const later = p => (p.preOrder ? 1 : 0);
    const sort = list => [...list].sort((a, b) =>
        rank(a) - rank(b) || later(a) - later(b) || b.id - a.id);

    const sample = [
        { id: 10, category: "Сумки", preOrder: true },    // найновіший, але під замовлення
        { id: 9, category: "Сумки", preOrder: false },
        { id: 3, category: "Сумки", preOrder: false },
        { id: 8, category: "Кросівки", preOrder: false },
        { id: 7, category: "Сумки", preOrder: true },
        { id: 5, category: "Невідома", preOrder: false }
    ];

    const result = sort(sample).map(p => p.id);

    // Сумки: наявні 9, 3 → потім під замовлення 10, 7.
    // Кросівки: 8. Невідома категорія — в кінець.
    check("порядок саме такий, як задумано",
        JSON.stringify(result) === JSON.stringify([9, 3, 10, 7, 8, 5]),
        result.join(", "));

    // Головне: новіший товар під замовлення НЕ витісняє наявний.
    const bags = sort(sample).filter(p => p.category === "Сумки");

    check("новіший товар під замовлення не стає першим",
        bags[0].id === 9 && bags[0].preOrder === false,
        `перший id=${bags[0].id}, preOrder=${bags[0].preOrder}`);

    check("під замовлення в кінці свого розділу",
        bags.slice(-2).every(p => p.preOrder));

    // Усередині групи «під замовлення» новизна теж працює
    check("серед товарів під замовлення новіші вище",
        bags[2].id === 10 && bags[3].id === 7);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
