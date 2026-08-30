// Як акція набирає товари.
//
// ТРИ ДЖЕРЕЛА, ОДНЕ ПРАВИЛО
// --------------------------
//   1. обрані вручну — ЗНІМОК: перелік id, який поклали в адмінці;
//   2. бренд акції — ПРАВИЛО: усі товари бренду, і завтрашні теж;
//   3. розділи й категорії — теж ПРАВИЛО.
//
// Знімок і правило поруч не випадково: обраний вручну товар має
// лишатись в акції, навіть якщо завтра йому змінять категорію, а
// правило працює й на те, чого ще немає в каталозі.
//
// ЩО ТУТ ГОЛОВНЕ
// ---------------
// Правило жило У ДВОХ місцях — assets/js/app.js (головна) і
// assets/js/promo.js (сторінка акції) — і вже встигло розійтись:
// головна зберігала порядок, у якому адмін перетягнув товари, а
// сторінка акції віддавала їх у порядку каталогу. Тобто той самий
// набір виглядав по-різному залежно від того, звідки подивитись.
//
// Тому перевіряємо не лише поведінку, а й те, що копія одна.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const common = read("assets/js/common.js");

const { promotionProducts } = new Function(
    common.slice(common.indexOf("function promotionProducts"),
        common.indexOf("function getDiscountPercent"))
    + "; return { promotionProducts };"
)();

// Вихідні файли, а не згенеровані агрегати
// (правило з tests/test-migration-types.js).
const products = fs.readdirSync(path.join(ROOT, "data/products"))
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "data/products", f), "utf8")))
    .filter(p => typeof p.id === "number");

const categories = fs.readdirSync(path.join(ROOT, "data/categories"))
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "data/categories", f), "utf8")))
    .filter(c => c.name && c.department);

const departmentOf = new Map(categories.map(c => [c.name, c.department]));


console.log("\n[1] Правило одне на весь сайт");
{
    const app = read("assets/js/app.js");
    const promo = read("assets/js/promo.js");

    check("головна кличе спільну функцію",
        /return promotionProducts\(promo, allProducts, departmentOf\)/.test(app));

    check("сторінка акції — теж",
        /promotionProducts\(promo, allProducts, departmentOf\)/.test(promo));

    // Саме ці два шматки й розійшлись, поки жили окремо.
    check("власної копії на головній не лишилось",
        !/const byBrand = promo\.brand/.test(app));

    check("і на сторінці акції",
        !/productIds\.has\(product\.id\) \|\|/.test(promo));
}

console.log("\n[2] Вручну обрані — знімок, у порядку адмінки");
{
    const трійка = products.slice(0, 3).map(p => p.id);

    const out = promotionProducts({ productIds: [трійка[2], трійка[0], трійка[1]] },
        products, departmentOf);

    check("беруться всі обрані", out.length === 3, String(out.length));

    // Порядок адмінки має доїжджати до сайту — інакше перетягування в
    // списку не має сенсу. Саме через це на головній колись зникав
    // пʼятий товар: filter не зберігав порядок, а slice(0,4) різав.
    check("порядок збережено",
        out.map(p => p.id).join(",") === [трійка[2], трійка[0], трійка[1]].join(","),
        out.map(p => p.id).join(","));

    check("неіснуючий id не ламає набір",
        promotionProducts({ productIds: [999999] }, products, departmentOf).length === 0);
}

console.log("\n[3] Бренд — правило, і його можна вимкнути");
{
    const brand = products.find(p => p.brand && products.filter(x => x.brand === p.brand).length > 2).brand;

    const усього = products.filter(p => p.brand === brand).length;

    check("бренд підхоплюється сам",
        promotionProducts({ brand }, products, departmentOf).length === усього,
        `${promotionProducts({ brand }, products, departmentOf).length} з ${усього}`);

    // Так поводились обидві сторінки ДО появи прапорця, тож уже
    // опубліковані акції не мають нічого помітити.
    check("без прапорця поводиться як раніше",
        promotionProducts({ brand, autoBrand: undefined }, products, departmentOf).length === усього);

    check("вимикається прапорцем",
        promotionProducts({ brand, autoBrand: false }, products, departmentOf).length === 0);

    // Вимкнений бренд не має чіпати вручну обране.
    const один = products.find(p => p.brand !== brand).id;

    check("вимкнений бренд не чіпає обране вручну",
        promotionProducts({ brand, autoBrand: false, productIds: [один] },
            products, departmentOf).length === 1);
}

console.log("\n[4] Розділ і категорія");
{
    const категорія = categories.find(c => products.filter(p => p.category === c.name).length > 1);

    const розділ = категорія.department;

    const уКатегорії = products.filter(p => p.category === категорія.name).length;

    const уРозділі = products.filter(p => departmentOf.get(p.category) === розділ).length;

    check(`категорія «${категорія.name}» підхоплюється`,
        promotionProducts({ autoSections: [категорія.name] }, products, departmentOf).length === уКатегорії,
        String(уКатегорії));

    // Розділ мусить розгортатись у свої категорії — інакше він не
    // збігся б із жодним товаром: у товара записана категорія, а не
    // розділ.
    check(`розділ «${розділ}» розгортається в категорії`,
        promotionProducts({ autoSections: [розділ] }, products, departmentOf).length === уРозділі,
        `${promotionProducts({ autoSections: [розділ] }, products, departmentOf).length} проти ${уРозділі}`);

    check("розділ ширший за свою категорію", уРозділі >= уКатегорії);

    // Без довідника розділ розгорнути нема з чого — тоді працюють лише
    // точні назви категорій. Тихо віддавати порожнечу теж не можна.
    check("без довідника категорія все одно працює",
        promotionProducts({ autoSections: [категорія.name] }, products, null).length === уКатегорії);

    // Дублікатів бути не має: товар підходить і під розділ, і під
    // категорію, і під ручний вибір.
    const разом = promotionProducts({
        autoSections: [розділ, категорія.name],
        productIds: products.filter(p => p.category === категорія.name).map(p => p.id)
    }, products, departmentOf);

    check("товар не дублюється трьома джерелами",
        разом.length === уРозділі && new Set(разом.map(p => p.id)).size === разом.length,
        `${разом.length} проти ${уРозділі}`);
}

console.log("\n[5] Правило доїжджає з адмінки в дані");
{
    const config = read("admin/config.yml");
    const build = read("scripts/build-promotions.js");

    check("прапорець бренду є в адмінці",
        /name: "autoBrand"[\s\S]{0,120}widget: "boolean"/.test(config));

    check("увімкнений за замовчуванням",
        /name: "autoBrand"[\s\S]{0,200}default: true/.test(config));

    check("поле розділів є в адмінці",
        /name: "autoSections"[\s\S]{0,120}widget: "sectionPicker"/.test(config));

    check("збірка переносить прапорець",
        /data\.autoBrand === false \? \{ autoBrand: false \}/.test(build));

    // «true» у даних не пишемо: інакше в кожній акції з'явився б рядок
    // про поведінку, яка й так за замовчуванням.
    check("увімкнене не засмічує дані",
        !/autoBrand: true/.test(build));

    check("збірка переносить розділи",
        /autoSections: data\.autoSections\.map\(String\)/.test(build));
}

console.log("\n[6] Віджет розділів піднімається");
{
    // Незареєстрований віджет Decap підміняє контролом "unknown", і
    // акція після цього НЕ ЗБЕРІГАЄТЬСЯ (докладно — у коментарі до
    // admin/image-framing-widget.js).
    const src = read("admin/section-picker.js");

    const registered = {};

    const stubH = (tag, props, ...kids) => ({
        tag, props: props || {}, kids: kids.flat().filter(x => x != null)
    });

    const stubWindow = {
        h: stubH,
        createClass: spec => spec,
        CatalogTree: { loadGroups: () => Promise.resolve({ products: [], groups: [] }) }
    };

    new Function("CMS", "window", "createClass", "h", "console", src)(
        { registerWidget: (name, control) => { registered[name] = control; } },
        stubWindow, stubWindow.createClass, stubH, console
    );

    check("віджет зареєстрований", !!registered.sectionPicker);

    const control = registered.sectionPicker;

    check("не блокує збереження акції", control.isValid.call({}) === true);

    const змінили = [];

    const instance = Object.assign(Object.create(control), {
        state: control.getInitialState(),
        props: { value: [], onChange: v => змінили.push(v) }
    });

    control.toggle.call(instance, "Сумки", ["Жіночі сумки", "Чоловічі сумки"]);

    check("розділ додається", змінили[0] && змінили[0][0] === "Сумки",
        JSON.stringify(змінили[0]));

    // Обрали розділ — його категорії прибираються: вони вже всередині,
    // а два записи про те саме лише плутають.
    instance.props.value = ["Жіночі сумки"];

    control.toggle.call(instance, "Сумки", ["Жіночі сумки", "Чоловічі сумки"]);

    check("категорії всередині розділу прибираються",
        JSON.stringify(змінили[1]) === JSON.stringify(["Сумки"]),
        JSON.stringify(змінили[1]));

    // Порожній список — це undefined, а не []: інакше вимкнене правило
    // виглядало б у даних як зроблений вибір.
    instance.props.value = ["Сумки"];

    control.toggle.call(instance, "Сумки", []);

    check("порожній вибір прибирає поле", змінили[2] === undefined,
        JSON.stringify(змінили[2]));

    // Дерево спільне з вибором товарів — інакше «Сумки 45» в одному
    // місці й «Сумки 47» в іншому.
    check("дерево спільне з вибором товарів",
        /window\.CatalogTree/.test(src)
        && /window\.CatalogTree/.test(read("admin/product-picker.js")));

    check("обидва віджети підключені в адмінці",
        /catalog-tree\.js/.test(read("admin/index.html"))
        && /section-picker\.js/.test(read("admin/index.html")));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
