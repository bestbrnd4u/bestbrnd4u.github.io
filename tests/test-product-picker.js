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

console.log("\n[N] Розділ додається цілком");
{
    // НАВІЩО. Акція «на всі сумки» — це кілька десятків товарів.
    // Шукати їх по одному негуманно, а пропустити один при цьому
    // легше легкого.
    //
    // Піднімаємо віджет ПО-СПРАВЖНЬОМУ, із заглушками CMS і React:
    // незареєстрований віджет Decap підміняє контролом "unknown", і
    // запис після цього не зберігається (див. коментар у
    // admin/image-framing-widget.js).
    const src = fs.readFileSync(path.join(ROOT, "admin/product-picker.js"), "utf8");

    // Вихідні файли товарів, а не згенерований агрегат (правило з
    // tests/test-migration-types.js). Сам віджет в адмінці читає саме
    // агрегат — там це доречно, він показує опубліковане, — але тесту
    // потрібні дані, а не результат збірки.
    const products = fs.readdirSync(path.join(ROOT, "data/products"))
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "data/products", f), "utf8")))
        .filter(p => typeof p.id === "number");

    // Категорії — теж із вихідних файлів (data/categories/*.json), а не
    // з агрегату. Віджет отримує їх у тому самому вигляді {name,
    // department}, тож заглушка нічим не відрізняється від бойового
    // data/categories.json.
    const categories = fs.readdirSync(path.join(ROOT, "data/categories"))
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "data/categories", f), "utf8")))
        .filter(c => c.name && c.department)
        .map(c => ({ name: c.name, department: c.department }));

    const registered = {};

    const stubH = (tag, props, ...kids) => ({
        tag, props: props || {}, kids: kids.flat().filter(x => x != null)
    });

    const stubWindow = { h: stubH, createClass: spec => spec };

    const stubFetch = url => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(/categories/.test(url) ? categories : products)
    });

    // Каталог і дерево розділів живуть в admin/catalog-tree.js — тим
    // самим користується admin/section-picker.js. Піднімаємо його
    // ПЕРШИМ: без window.CatalogTree віджет мовчки лишається з
    // порожнім деревом, і перевірки нижче падатимуть не на тому.
    new Function("window", "fetch",
        fs.readFileSync(path.join(ROOT, "admin/catalog-tree.js"), "utf8"))(stubWindow, stubFetch);

    check("дерево каталогу піднялось", !!stubWindow.CatalogTree);

    new Function("CMS", "window", "createClass", "h", "fetch", "console", src)(
        { registerWidget: (name, control) => { registered[name] = control; } },
        stubWindow, stubWindow.createClass, stubH, stubFetch, console
    );

    const control = registered.productPicker;

    check("віджет піднявся", !!control);

    const instance = Object.assign(Object.create(control), {
        state: control.getInitialState(),
        props: { value: [], onChange(next) { instance.props.value = next; } },
        setState(patch) { Object.assign(instance.state, patch); }
    });

    control.componentDidMount.call(instance);

    // Дерево збирається з двох джерел, і обидва асинхронні.
    return new Promise(resolve => setTimeout(resolve, 300)).then(() => {

        const groups = instance.state.groups;

        check("розділи зібрані", groups.length > 0, String(groups.length));

        // КІЛЬКОСТІ рахуються по товарах, а не беруться з категорій:
        // у довіднику може бути записано що завгодно, а в акцію піде
        // рівно те, що є в каталозі.
        const сумки = groups.find(g => g.name === "Сумки");

        check("у розділі є підрозділи", сумки && сумки.cats.length > 1,
            сумки ? сумки.cats.map(c => c.name).join(", ") : "розділу немає");

        check("розділ = сума підрозділів",
            сумки && сумки.ids.length === сумки.cats.reduce((s, c) => s + c.ids.length, 0),
            сумки ? `${сумки.ids.length} проти ${сумки.cats.reduce((s, c) => s + c.ids.length, 0)}` : "");

        // Найбільший розділ угорі: саме його додають цілком найчастіше.
        check("розділи впорядковані за розміром",
            groups.every((g, i) => i === 0 || groups[i - 1].ids.length >= g.ids.length),
            groups.map(g => `${g.name}:${g.ids.length}`).join(" "));

        control.addMany.call(instance, сумки.ids);

        check("«Додати» кладе весь розділ",
            instance.props.value.length === сумки.ids.length,
            `${instance.props.value.length} з ${сумки.ids.length}`);

        // Повторний клік по підрозділу не має плодити дублікатів:
        // сайт малює перелік як є.
        control.addMany.call(instance, сумки.cats[0].ids);

        check("повторне додавання не дублює",
            instance.props.value.length === сумки.ids.length,
            String(instance.props.value.length));

        control.removeMany.call(instance, сумки.ids);

        check("«Прибрати» знімає весь розділ",
            instance.props.value.length === 0, String(instance.props.value.length));

        // Мертва кнопка гірша за відсутню: коли додано все, вона
        // мусить прибирати, а не нічого не робити.
        check("кнопка перемикається на «Прибрати»",
            /all \? "Прибрати" : "Додати"/.test(src));

        // Знімок, а не правило — про це має бути сказано і в коді, і в
        // підказці адмінки.
        check("про знімок сказано в коді", /це ЗНІМОК/.test(src));

        const config = fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8");

        check("і в підказці адмінки", /Це знімок на зараз/.test(config));

        console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
        process.exit(failures === 0 ? 0 : 1);

    });
}
