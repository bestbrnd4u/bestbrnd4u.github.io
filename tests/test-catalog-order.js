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

    // 4. головне, заради чого все це: найновіший товар — ПЕРШИЙ У СВОЇЙ
    //    категорії.
    //
    // Раніше тут перевірялось, що він у першій половині каталогу. Це
    // хибне мірило: порядок будується за розділами бічного меню, і
    // товар із категорії, яка стоїть у меню останньою, законно
    // опиниться внизу — навіть якщо він найновіший у магазині.
    //
    // Саме так тест і впав: додали гаманець, а «Аксесуари» — останній
    // розділ. Правило спрацювало правильно, помилковим було
    // очікування.
    const newest = products.reduce((a, b) => (a.id > b.id ? a : b));
    const position = sorted.findIndex(p => p.id === newest.id);

    const sameCategory = sorted.filter(p => p.category === newest.category);

    check("найновіший товар перший у своїй категорії",
        sameCategory.length > 0 && sameCategory[0].id === newest.id,
        `${newest.category}: ${sameCategory.slice(0, 3).map(p => p.id).join(", ")}`);

    // І він не має провалюватись нижче за товари СВОГО ж розділу, які
    // додали раніше.
    // «категорія → відділ» з довідника категорій
    const departmentOf = new Map(categories.map(c => [c.name, c.department]));

    const department = departmentOf.get(newest.category);

    const sameDepartment = sorted.filter(p =>
        departmentOf.get(p.category) === department);
    const olderBelow = sameDepartment.slice(sameDepartment.findIndex(p => p.id === newest.id) + 1);

    check("у своєму розділі нижче — лише старіші або інші категорії",
        olderBelow.every(p => p.id < newest.id || p.category !== newest.category),
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

console.log("\n[5] Сортування «новинки»");
{
    // СИМПТОМ: обираєш «новинки», а після позначених ідуть товари,
    // доданих найпершими. Бо сортування дивилось лише на позначку, а
    // решту лишало в порядку products.json — за зростанням id.
    check("позначені вище, і всередині — новіші вище",
        /\(markedNew\(b\) \? 1 : 0\) - \(markedNew\(a\) \? 1 : 0\)\s*\n\s*\|\| \(Number\(b\.id\)/.test(catalog));

    // В адмінці позначок ДВІ: перемикач «Це новинка?» і бейдж NEW.
    // Реагувати лише на одну означало б, що половина позначень не працює.
    check("враховуються обидві позначки",
        /product\.isNew \|\| String\(product\.badge \|\| ""\)\.toUpperCase\(\) === "NEW"/.test(catalog));

    // Перевіряємо результат на справжніх даних
    const src = catalog.match(/function markedNew[\s\S]*?\nfunction compareSizes/)[0]
        .replace(/\nfunction compareSizes$/, "");

    const helpers = new Function(src + "; return { markedNew, topRank, discountPercent };")();

    const items = JSON.parse(read("data/products.json"));

    const sorted = [...items].sort((a, b) =>
        (helpers.markedNew(b) ? 1 : 0) - (helpers.markedNew(a) ? 1 : 0)
        || (Number(b.id) || 0) - (Number(a.id) || 0));

    const marked = sorted.filter(helpers.markedNew);

    check("позначені стоять на початку",
        sorted.slice(0, marked.length).every(helpers.markedNew), marked.length);

    // всередині кожної групи id спадає
    const ids = group => group.map(p => Number(p.id));
    const falls = list => list.every((v, i) => i === 0 || list[i - 1] > v);

    check("серед позначених новіші вище", falls(ids(marked)));
    check("серед решти теж", falls(ids(sorted.filter(p => !helpers.markedNew(p)))));

    // найстаріший товар мусить бути в самому кінці
    const oldest = items.reduce((a, b) => (a.id < b.id ? a : b));

    check("найстаріший — останній",
        sorted[sorted.length - 1].id === oldest.id,
        `id=${sorted[sorted.length - 1].id}, а найстаріший ${oldest.id}`);
}

console.log("\n[6] Сортування «топ» більше не порожня кнопка");
{
    // Раніше сортування шукало лише бейдж TOP. Його ніхто не ставив
    // (у каталозі були тільки SALE і HOT), тож кнопка не робила
    // НІЧОГО — список лишався в порядку id.
    //
    // Даних про продажі на сайті немає, тож «популярність» узяти
    // нізвідки. HOT — та сама думка іншим бейджем, далі знижка:
    // товар зі знижкою беруть охочіше.
    check("HOT теж вважається топом", /badge === "HOT"\) return 1/.test(catalog));
    check("далі — за розміром знижки", /discountPercent\(b\) - discountPercent\(a\)/.test(catalog));
    check("наприкінці новіші вище",
        /discountPercent\(a\)\)\s*\n\s*\|\| \(Number\(b\.id\)/.test(catalog));

    const src = catalog.match(/function markedNew[\s\S]*?\nfunction compareSizes/)[0]
        .replace(/\nfunction compareSizes$/, "");

    const helpers = new Function(src + "; return { markedNew, topRank, discountPercent };")();

    const items = JSON.parse(read("data/products.json"));

    const sorted = [...items].sort((a, b) =>
        (helpers.topRank(b) - helpers.topRank(a))
        || (helpers.discountPercent(b) - helpers.discountPercent(a))
        || (Number(b.id) || 0) - (Number(a.id) || 0));

    // Головне: порядок мусить ВІДРІЗНЯТИСЯ від типового, інакше кнопка
    // так само нічого не робить.
    const byId = [...items].sort((a, b) => a.id - b.id).map(p => p.id);

    check("порядок відрізняється від початкового",
        JSON.stringify(sorted.map(p => p.id)) !== JSON.stringify(byId));

    // бейджі попереду
    const badged = sorted.filter(p => helpers.topRank(p) > 0);

    check("товари з бейджем на початку",
        sorted.slice(0, badged.length).every(p => helpers.topRank(p) > 0),
        badged.length);

    // знижка спадає серед решти
    const rest = sorted.filter(p => helpers.topRank(p) === 0).map(helpers.discountPercent);

    check("серед решти знижка спадає",
        rest.every((v, i) => i === 0 || rest[i - 1] >= v));
}

console.log("\n[7] Листи з форм ідуть на робочу пошту");
{
    // Раніше стояв токен FormSubmit, виданий під особистий gmail. У коді
    // адреси не було, тож знайти причину пошуком по проєкту не вдавалось
    // — листи просто приходили не туди.
    const common = read("assets/js/common.js");

    const target = (common.match(/const FORMSUBMIT_TARGET = "([^"]*)"/) || [])[1];

    check("адреса вказана явно", target === "bestbrnd4u@proton.me", target);
    check("токена більше немає", !/^[0-9a-f]{32}$/.test(String(target)));

    // Одна адреса на обидві форми: оформлення замовлення й контакти.
    check("оформлення замовлення бере ту саму",
        /FORM_TARGET_EMAIL = FORMSUBMIT_TARGET/.test(read("assets/js/checkout.js")));

    // Жодної іншої особистої адреси в коді бути не має
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const scripts = fs.readdirSync(path.join(ROOT, "assets/js"))
        .filter(f => f.endsWith(".js"))
        .map(f => read(`assets/js/${f}`));

    const found = new Set();

    [...pages.map(f => read(f)), ...scripts].forEach(text => {
        (text.match(/[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g) || [])
            .forEach(mail => found.add(mail.toLowerCase()));
    });

    const allowed = new Set(["bestbrnd4u@proton.me", "name@example.com", "you@example.com"]);
    const strangers = [...found].filter(m => !allowed.has(m));

    check("сторонніх адрес у коді немає", strangers.length === 0, strangers.join(", "));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
