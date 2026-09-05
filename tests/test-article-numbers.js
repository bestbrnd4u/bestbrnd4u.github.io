// Артикул каталогу: номер ставить система.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Поле «Артикул» заповнювали руками. Рано чи пізно його забували: у
// годинника Michael Kors MK7558 (id=95) не було ні загального артикула,
// ні артикула кольору. Наслідки:
//
//   • у розмітці сторінки не було sku, і Search Console писав
//     «Invalid value in field "sku"» у розділі Merchant listings;
//   • tests/test-merchant-listings.js падав і блокував випуск на прод
//     — тобто одне незаповнене поле в адмінці зупиняло весь реліз.
//
// ЩО ТЕПЕР
// ---------
// Артикул вичислюється зі id товару при збірці: товар — «95», його
// кольори — «95-1», «95-2». id видається один раз (maxId+1), більше не
// змінюється й не перевикористовується після видалення — рівно те, що
// потрібно артикулу.
//
// Заводський код постачальника («BB0096S-001-51») НЕ зник: він
// лишається в полі sku, їде в розмітку як mpn і далі служить ключем
// розпізнавання при імпорті (admin/import.js). Плутати їх не можна —
// саме тому в адмінці вони називаються по-різному.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const built = JSON.parse(read("data/products.json"));

const sources = fs.readdirSync(path.join(ROOT, "data/products"))
    .filter(f => f.endsWith(".json"))
    .map(f => ({ file: f, data: JSON.parse(read(`data/products/${f}`)) }));


console.log("\n[1] Кожен товар має номер, і він дорівнює id");
{
    check(`товарів у каталозі — ${built.length}`, built.length > 0);

    const без = built.filter(p => !p.article || !String(p.article).trim());

    check("порожнього артикула немає ні в кого", без.length === 0,
        без.map(p => p.id).join(", "));

    check("артикул — це id",
        built.every(p => String(p.article) === String(p.id)),
        built.filter(p => String(p.article) !== String(p.id))
            .slice(0, 3).map(p => `${p.id} ≠ ${p.article}`).join(", "));

    check("артикули не повторюються",
        new Set(built.map(p => p.article)).size === built.length);

    // Номер від 1 і далі. Пропуски — нормально: видалений товар свій
    // номер не віддає, інакше артикул почав би вказувати на інший
    // товар.
    check("номери починаються з 1",
        Math.min(...built.map(p => Number(p.article))) >= 1);
}

console.log("\n[2] Колір — суфікс: «95-1», «95-2»");
{
    const variants = built.flatMap(p =>
        (p.variants || []).map((v, i) => ({ p, v, i })));

    check(`кольорів усього — ${variants.length}`, variants.length > 0);

    check("у кожного кольору є артикул",
        variants.every(({ v }) => v.article && String(v.article).trim()),
        variants.filter(({ v }) => !v.article).slice(0, 3)
            .map(({ p, v }) => `${p.id}/${v.color}`).join(", "));

    check("суфікс — порядковий номер кольору",
        variants.every(({ p, v, i }) => v.article === `${p.id}-${i + 1}`),
        variants.filter(({ p, v, i }) => v.article !== `${p.id}-${i + 1}`)
            .slice(0, 3).map(({ p, v, i }) => `${p.id}: ${v.article} ≠ ${p.id}-${i + 1}`).join(", "));

    check("артикули кольорів не повторюються",
        new Set(variants.map(({ v }) => v.article)).size === variants.length);

    // ГОЛОВНЕ, ЗАРАДИ ЧОГО СУФІКС: за номером до дефіса знаходиться той
    // самий товар у будь-якому кольорі.
    const багатоколірний = built.find(p => (p.variants || []).length > 1);

    check("товар із кількома кольорами в каталозі є", !!багатоколірний);

    if (багатоколірний) {

        const префікси = багатоколірний.variants.map(v => String(v.article).split("-")[0]);

        check(`у «${багатоколірний.title.slice(0, 30)}» усі кольори з одним префіксом`,
            new Set(префікси).size === 1 && префікси[0] === String(багатоколірний.id),
            префікси.join(", "));

    }
}

console.log("\n[3] У файлах-джерелах артикула немає");
{
    // Артикул вичислюється зі id. Якби він лежав і в джерелі,
    // з'явилась би друга копія номера, яка може розійтись з id — а
    // розходження такого поля помітити найважче.
    const зПолем = sources.filter(({ data }) => data.article !== undefined);

    check("data/products/*.json не зберігають article", зПолем.length === 0,
        зПолем.slice(0, 3).map(x => x.file).join(", "));

    const варіантиЗПолем = sources.filter(({ data }) =>
        (data.variants || []).some(v => v && v.article !== undefined));

    check("і в кольорах теж", варіантиЗПолем.length === 0,
        варіантиЗПолем.slice(0, 3).map(x => x.file).join(", "));

    const build = read("scripts/build-products.js");

    check("номер ставить збірка", /data\.article = String\(data\.id\)/.test(build));

    check("колір отримує суфікс",
        /variant\.article = `\$\{data\.id\}-\$\{index \+ 1\}`/.test(build));
}

console.log("\n[4] Заводський код не втрачено");
{
    const зКодом = sources.filter(({ data }) =>
        data.sku || (data.variants || []).some(v => v && v.sku));

    check(`товарів із кодом постачальника — ${зКодом.length}`, зКодом.length > 0);

    // Поле лишилось на місці: за ним замовляють модель і за ним імпорт
    // розпізнає, що товар уже є.
    check("поле sku нікуди не зникло з даних",
        зКодом.every(({ data }) => data.sku || (data.variants || []).some(v => v && v.sku)));

    const importJs = read("admin/import.js");

    check("імпорт і далі розпізнає товари за кодом",
        /if \(product\.sku\) keys\.add\(normalizeKey\(product\.sku\)\)/.test(importJs));

    // В адмінці вони мусять називатись ПО-РІЗНОМУ: два поля з підписом
    // «Артикул» — найкоротший шлях знову заповнити не те.
    const { loadYaml } = require("./helpers/yaml");

    const fields = loadYaml("admin/config.yml").collections
        .find(c => c.name === "products").fields;

    const article = fields.find(f => f.name === "id");
    const supplier = fields.find(f => f.name === "sku");

    check("артикул каталогу підписаний як артикул каталогу",
        article && /Артикул каталогу/.test(article.label), article && article.label);

    check("код постачальника підписаний інакше",
        supplier && /Код виробника/.test(supplier.label), supplier && supplier.label);

    check("підказка попереджає не плутати їх",
        /НЕ ПЛУТАТИ/.test(String(supplier && supplier.hint)));
}

console.log("\n[5] Розмітка для Google: sku — номер, mpn — код виробника");
{
    const product = read("assets/js/product.js");
    const pages = read("scripts/build-product-pages.js");

    ["assets/js/product.js", "scripts/build-product-pages.js"].forEach(file => {

        const src = read(file);

        check(`${file}: sku бере артикул каталогу`,
            /const article = String\(product\.article \|\| ""\)\.trim\(\)/.test(src));

    });

    check("сторінка товару віддає mpn", /mpn: sanitizeSku\(product\.sku\)/.test(product));

    check("генератор сторінок теж", /mpn: sanitizeSku\(product\.sku,/.test(pages));

    // Порожній рядок Google теж вважає невалідним, тож обидва поля
    // мусять зникати, а не ставати "".
    check("порожні значення не потрапляють у розмітку",
        /sku: schemaSku\(product\) \|\| undefined/.test(product)
        && /sku: firstSku\(product\) \|\| undefined/.test(pages));
}

console.log("\n[6] На сайті видно номер, а не порожнє місце");
{
    const common = read("assets/js/common.js");
    const product = read("assets/js/product.js");
    const pages = read("scripts/build-product-pages.js");

    check("є окремий доступ до артикула каталогу",
        /function getVariantArticle\(product, variant\)/.test(common));

    check("сторінка товару показує саме його",
        /const activeSku = getVariantArticle\(product, activeVariant\)/.test(product));

    // РЯДОК ПІД НАЗВОЮ — «Артикул: 20-1», а не «Marc Jacobs · 20-1».
    //
    // Бренд у цьому рядку був зайвий: він уже є вище окремим
    // посиланням <a class="brand"> над заголовком, тобто читався двічі
    // підряд. А сам номер без підпису нічого не казав.
    check("під назвою — підписаний артикул, без бренду",
        /<span data-product-sku>\$\{activeSku \? `Артикул: \$\{escapeHtml\(activeSku\)\}`/.test(product));

    check("бренду в цьому рядку більше немає",
        !/product-meta-line">\s*\$\{escapeHtml\(product\.brand\)\}/.test(product));

    // Бренд мусить лишитись вище — прибрали дубль, а не бренд.
    // Клас тепер обчислюваний: із логотипом бренду додається
    // brand-has-logo (див. tests/test-brand-pages.js). Перевіряємо те
    // саме, що й було, — посилання на бренд над заголовком є.
    check("посилання на бренд над заголовком лишилось",
        /<a class="brand\$\{[^}]*\}" href="catalog\?brand=/.test(product));

    // Підпис пише й обробник свотча: інакше при перемиканні кольору
    // «Артикул:» зникав, і лишався голий номер.
    check("при перемиканні кольору підпис не зникає",
        /inlineSku\.textContent = sku \? `Артикул: \$\{sku\}` : ""/.test(common));

    check("заводський код — окремий рядок",
        /const supplierSku = getVariantSku\(product, activeVariant\)/.test(product)
        && /data-spec-supplier-sku/.test(product));

    check("свотч кольору несе обидва",
        /data-sku="\$\{escapeHtml\(getVariantArticle\(product, variant\)\)\}"/.test(product)
        && /data-supplier-sku=/.test(product));

    check("перемикання кольору оновлює і код виробника",
        /colorBtn\.dataset\.supplierSku !== undefined/.test(common));

    // Порожній код не має лишати на екрані код попереднього кольору.
    check("порожній код ховає рядок, а не лишає старий",
        /row\.hidden = !supplier/.test(common));

    check("у характеристиках статичної сторінки — обидва рядки",
        /\["Артикул", product\.article \|\| product\.sku\]/.test(pages)
        && /\["Код виробника", product\.article \? product\.sku : ""\]/.test(pages));

    // Живий приклад: саме той годинник, через який усе почалось.
    const mk = built.find(p => p.id === 95);

    if (mk) {

        const html = read(`p/${mk.slug}/index.html`);

        check("у MK7558 в характеристиках є артикул",
            /<strong>Артикул:<\/strong> 95</.test(html));

        const ld = JSON.parse((html.match(/id="productSchema">([\s\S]*?)<\/script>/) || [])[1]);

        check("і в розмітці sku тепер є", ld.sku === "95", JSON.stringify(ld.sku));

    }
}

console.log("\n[7] Пошук в адмінці знаходить за номером");
{
    const { loadYaml } = require("./helpers/yaml");

    const collection = loadYaml("admin/config.yml").collections
        .find(c => c.name === "products");

    // Без search_fields Decap шукає лише по identifier_field, тобто по
    // назві, — і «95» не знаходило нічого.
    check("список товарів шукає за номером і кодом",
        Array.isArray(collection.search_fields)
        && collection.search_fields.includes("id")
        && collection.search_fields.includes("sku"),
        JSON.stringify(collection.search_fields));

    check("номер видно в підписі запису", /\{\{id\}\}/.test(String(collection.summary)),
        collection.summary);

    // Вибір товарів для акцій і добірок — свій пошук.
    const picker = read("admin/product-picker.js");

    check("вибір товарів шукає за артикулом кольору",
        /variant && variant\.article/.test(picker));

    check("і за артикулом товару", /product\.article/.test(picker));

    // Перевіряємо ПОВЕДІНКУ, а не наявність рядків: витягуємо
    // справжній matches() з віджета.
    const env = new Function("return (function(){"
        + picker.slice(picker.indexOf("var LOOKALIKE"), picker.indexOf("function toIds"))
        + "return { matches: matches };})();")();

    const товар = built.find(p => (p.variants || []).length > 1);

    check("за номером товару знаходиться",
        env.matches(товар, String(товар.article)), String(товар.article));

    check("за артикулом кольору — теж",
        env.matches(товар, товар.variants[1].article), товар.variants[1].article);

    const зКодом = built.find(p => p.sku);

    check("за заводським кодом теж знаходиться",
        env.matches(зКодом, зКодом.sku), `${зКодом.id}: ${зКодом.sku}`);

    check("чужий номер не знаходить товар",
        !env.matches(товар, "999999"));
}

console.log("\n[8] Поле в адмінці показує номер і не дає його правити");
{
    const { loadYaml } = require("./helpers/yaml");

    const fields = loadYaml("admin/config.yml").collections
        .find(c => c.name === "products").fields;

    const field = fields.find(f => f.name === "id");

    // Було widget: hidden — номер не було видно взагалі. Тепер видно,
    // але не редаговано: Decap не вміє «показати, але не давати
    // правити», тож це власний віджет.
    check("поле більше не приховане", field && field.widget === "articleNumber",
        field && field.widget);

    check("лишається необовʼязковим (у нового товару номера ще немає)",
        field && field.required === false);

    check("віджет підключений в адмінці",
        /article-widget\.js/.test(read("admin/index.html")));

    const widget = read("admin/article-widget.js");

    check("віджет зареєстрований під тим самим іменем",
        /CMS\.registerWidget\("articleNumber"/.test(widget));

    // Віджет НЕ МАЄ кликати onChange: інакше він переписував би id —
    // тобто сам артикул, який показує.
    check("віджет не змінює значення", !/onChange/.test(widget));

    // Каталог для «наступного вільного номера» беремо спільним
    // завантажувачем, а не своїм fetch — інакше та сама сторінка
    // просила б products.json двічі.
    check("каталог тягне спільним завантажувачем",
        /tree\.loadProducts\(\)/.test(widget) && !/fetch\(/.test(widget));

    // ПОВЕДІНКА: піднімаємо віджет на заглушках замість React.
    const tree = [];

    const h = (tag, props, ...children) => {
        const node = { tag, props, children: children.flat(Infinity).filter(x => x != null) };
        return node;
    };

    const text = node => (typeof node === "object" && node)
        ? (node.children || []).map(text).join(" ")
        : String(node);

    const createClass = spec => {

        function Control(props) {
            this.props = props;
            this.state = spec.getInitialState ? spec.getInitialState.call(this) : {};
            this.setState = patch => { Object.assign(this.state, patch); };
        }

        Object.assign(Control.prototype, spec);

        return Control;

    };

    const CMS = { registerWidget: (name, control) => tree.push({ name, control }) };

    new Function("CMS", "window", widget)(CMS, { h, createClass, React: null });

    check("віджет зареєструвався", tree.length === 1 && tree[0].name === "articleNumber");

    const Control = tree[0].control;

    // 1. Новий товар: номера ще немає.
    const новий = new Control({ value: null, entry: null });

    check("новому товару обіцяє номер після збереження",
        /Буде призначено після збереження/.test(text(новий.render())),
        text(новий.render()).slice(0, 60));

    // 2. Збережений товар з двома кольорами.
    const entry = {
        getIn: keys => keys.join(".") === "data.variants"
            ? [{ color: "Чорний" }, { color: "Бежевий" }]
            : null
    };

    const збережений = new Control({ value: 95, entry });

    const вивід = text(збережений.render());

    check("показує сам номер", /\b95\b/.test(вивід), вивід.slice(0, 80));

    check("і артикули кольорів", /95-1 — Чорний/.test(вивід) && /95-2 — Бежевий/.test(вивід),
        вивід.slice(0, 140));

    check("пояснює, як шукати той самий товар в іншому кольорі",
        /до дефіса/.test(вивід));

    // 3. Один колір — суфікс усе одно є.
    const одноколірний = new Control({
        value: 7,
        entry: { getIn: () => [{ color: "Чорний" }] }
    });

    check("товару з одним кольором показує 7-1",
        /7-1/.test(text(одноколірний.render())), text(одноколірний.render()).slice(0, 80));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
