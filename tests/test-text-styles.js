// Оформлення текстових блоків з адмінки.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Кольори тексту, кнопок і шрифт були зашиті в CSS. Змінити їх під
// конкретну акцію чи добірку можна було лише правкою коду.
//
// ГОЛОВНА ВИМОГА, ЯКУ СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// -------------------------------------------
// Порожні налаштування не змінюють НІЧОГО. Блок, який ніхто не
// налаштовував, мусить виглядати точно як раніше — інакше одна нова
// можливість зіпсувала б усю головну сторінку одразу.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const Styles = require("../assets/js/text-styles.js");
const app = read("assets/js/app.js");
const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[1] Порожні налаштування нічого не змінюють");
{
    check("порожній набір не дає жодної змінної",
        Object.keys(Styles.styleVars({})).length === 0);
    check("відсутній набір теж",
        Styles.styleAttr(undefined) === "" && Styles.styleAttr(null) === "");

    // Inter — типовий шрифт сайту, підключений у розмітці. Писати його
    // ще й у style означало б додавати правило, яке нічого не робить.
    check("вибір Inter не додає font-family",
        Styles.styleVars({ font: "inter" })["--blk-font"] === undefined);

    // Клас чіпляється лише коли є що застосовувати — без нього правила
    // .has-style взагалі не спрацьовують.
    check("клас ставиться тільки за наявності налаштувань",
        /function blockStyleClass[\s\S]{0,200}blockStyleAttr\(style\) \? " has-style" : ""/.test(app));
    check("на готовий елемент клас теж знімається, якщо порожньо",
        /classList\.toggle\("has-style", keys\.length > 0\)/.test(app));
}

console.log("\n[2] Значення перевіряються, сміття відкидається");
{
    check("невідомий шрифт ігнорується",
        Styles.styleVars({ font: "comic-sans-3000" })["--blk-font"] === undefined);
    check("не-колір ігнорується",
        Styles.styleVars({ textColor: "червоний" })["--blk-text"] === undefined);
    check("нормальний колір проходить",
        Styles.styleVars({ textColor: "#f59e0b" })["--blk-text"] === "#f59e0b");
    check("короткий запис кольору теж",
        Styles.styleVars({ buttonBg: "#000" })["--blk-btn-bg"] === "#000");

    // Завелика розрядка розриває слова на телефоні
    const wide = Styles.styleVars({ letterSpacing: 999 })["--blk-tracking"];
    check("розрядка обмежена згори", wide === "0.3em", wide);

    const narrow = Styles.styleVars({ letterSpacing: -99 })["--blk-tracking"];
    check("і знизу", narrow === "-0.05em", narrow);

    check("нульова розрядка не пишеться",
        Styles.styleVars({ letterSpacing: 0 })["--blk-tracking"] === undefined);
}

console.log("\n[3] Шрифти безкоштовні і з запасним варіантом");
{
    check("список не порожній", Styles.FONTS.length >= 5);

    // Українська має власні літери — і, ї, є, ґ, — яких немає в
    // російській кирилиці. Трапляється, що шрифт «підтримує кирилицю»,
    // а цих чотирьох у ньому бракує. Inter другим у stack означає, що
    // браузер підставить його ПОГЛИФНО: сторінка не зламається, лише
    // конкретна літера намалюється іншим шрифтом.
    Styles.FONTS.filter(f => f.key !== "inter").forEach(font => {

        const stack = Styles.fontStack(font.key);

        check(`${font.family}: є запасний Inter`, /'Inter'/.test(stack), stack);
        check(`${font.family}: є родове завершення`, /sans-serif$/.test(stack));

    });

    // Про це має бути сказано адміністратору прямо: автоматично
    // перевірити наявність гліфів ми не можемо.
    const config = read("admin/config.yml");
    check("підказка просить перевірити українські літери",
        /«і», «ї», «є», «ґ»/.test(config));
    check("підказка згадує безкоштовність шрифтів",
        /SIL Open Font License/.test(config));
}

console.log("\n[4] Вантажаться лише обрані шрифти");
{
    // Шість родин на кожне відкриття сторінки — це сотні кілобайтів
    // заради шрифту, яким може ніхто не користуватись.
    const module_ = read("assets/js/text-styles.js");

    check("є функція довантаження", /function ensureFonts/.test(module_));
    check("Inter не вантажиться повторно (він уже в розмітці)",
        /font\.key !== "inter"/.test(module_));
    check("один тег на шрифт, без дублів", /getElementById\(id\)\) return/.test(module_));

    check("шрифти головної довантажуються", /ensureFonts\(\[data\.hero\?\.style/.test(app));
    check("шрифти акцій теж", /ensureFonts\(promotions\.map/.test(app));
    check("шрифти добірок теж", /ensureFonts\(collections\.map/.test(app));
}

console.log("\n[5] Набір полів однаковий у всіх блоках");
{
    // Набір той самий у пʼяти місцях. Скопійований руками, він рано чи
    // пізно розійшовся б: десь забули шрифт, десь інший список
    // кольорів — і адміністратор бачив би різні можливості в схожих
    // блоках. Тому вставляє його scripts/add-style-fields.js, а ця
    // перевірка стежить, щоб однаковість не зникла після ручної правки.
    const { loadYaml } = require("./helpers/yaml");
    const config = loadYaml("admin/config.yml");

    const found = [];

    const walk = (fields, where) => (fields || []).forEach(f => {
        if (f.name === "style") found.push({ where, field: f });
        if (f.fields) walk(f.fields, `${where}.${f.name}`);
    });

    config.collections.forEach(col => {
        walk(col.fields, col.name);
        (col.files || []).forEach(file => walk(file.fields, `${col.name}/${file.name}`));
    });

    check(`набір є в усіх блоках з текстом (${found.length})`, found.length === 5,
        found.map(f => f.where).join(", "));

    const signature = entry => JSON.stringify((entry.field.fields || [])
        .map(f => [f.name, f.widget, (f.options || []).map(o => o.value)]));

    const first = found.length ? signature(found[0]) : "";

    check("усі набори ідентичні",
        found.every(f => signature(f) === first),
        found.filter(f => signature(f) !== first).map(f => f.where).join(", "));

    // перелік шрифтів в адмінці мусить збігатися з тим, що вміє сайт
    const fontField = found.length
        && (found[0].field.fields || []).find(f => f.name === "font");

    check("перелік шрифтів збігається зі спільним модулем",
        fontField
        && JSON.stringify(fontField.options.map(o => o.value))
            === JSON.stringify(Styles.FONTS.map(f => f.key)),
        fontField ? fontField.options.map(o => o.value).join(",") : "поля немає");

    check("усі поля необовʼязкові",
        found.every(f => (f.field.fields || []).every(sub => sub.required === false
            || sub.widget === "boolean")),
        "");
}

console.log("\n[6] Стилі мають запасні значення");
{
    // Кожне правило мусить мати fallback — те, що діяло досі. Інакше
    // блок без налаштувань втратив би колір або шрифт.
    const rules = css.match(/\.has-style[\s\S]*?$/);

    check("правила .has-style є", !!rules);

    const vars = (rules ? rules[0] : "").match(/var\(--blk-[a-z-]+(,[^)]*)?\)/g) || [];

    const noFallback = vars.filter(v => !v.includes(","));

    check(`у кожної змінної є запасне значення (${vars.length})`,
        noFallback.length === 0, noFallback.join(" "));

    // Прозора кнопка має лишатись прозорою: інакше «Дивитись каталог»
    // поруч з основною кнопкою перетворювалась би на її копію.
    check("прозора кнопка не отримує заливку",
        /\.has-style \.btn-outline\{[\s\S]{0,160}background:transparent/.test(css));

    // Заголовок масштабується множником, а не фіксованим розміром:
    // на телефоні свій розмір, і жорстке значення ламало б верстку.
    check("розмір заголовка — множник, а не фіксоване значення",
        /font-size:calc\(var\(--blk-title-base, 1em\) \* var\(--blk-title-scale, 1\)\)/.test(css));
}

console.log("\n[7] Оформлення доходить до всіх блоків головної");
{
    [
        ["головний банер", /applyBlockStyle\(heroSection, hero\.style\)/],
        ["промо-банер", /applyBlockStyle\(bannerEl, promo\.style\)/],
        ["добірка", /collection-widget\$\{blockStyleClass\(collection\.style\)\}/],
        ["картка акції", /promo-card\$\{blockStyleClass\(promo\.style\)\}/],
        ["слайдер акцій", /promo-hero-slide\$\{blockStyleClass\(promo\.style\)\}/],
        ["банер бренду", /brand-campaign-banner\$\{blockStyleClass\(promo\.style\)\}/]
    ].forEach(([label, re]) => check(label, re.test(app)));

    // один модуль на сайт і адмінку — інакше прев'ю почне брехати
    check("сайт підключає модуль", /assets\/js\/text-styles\.js/.test(read("index.html")));
    check("адмінка підключає той самий файл",
        /\.\.\/assets\/js\/text-styles\.js/.test(read("admin/index.html")));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
