// Кожен колір — окрема картка в каталозі.
//
// НАВІЩО
// -------
// Товар у двох кольорах займав ОДНУ картку: колір перемикався свотчами
// при наведенні. Каталог виглядав порожнішим, ніж є, — 56 карток там,
// де насправді 67 доступних варіантів.
//
// ЧОМУ РОЗГОРТАННЯ, А НЕ КОПІЮВАННЯ ТОВАРІВ
// ------------------------------------------
// Була ідея кнопки «роздвоїти товар» в адмінці. Копіювання дало б той
// самий вигляд, але з трьома наслідками: дані дублюються (змінили ціну
// — треба пам'ятати про копію), описи стають майже однаковими
// сторінками (для Google це duplicate content), артикул один на дві
// копії. Розгортання дає вигляд без жодного з них.
//
// Перевірки нижче стежать за двома речами: що кольори не перепутались
// і що ЖОДЕН не втратився — інакше товар просто зникне з каталогу в
// якомусь кольорі, і помітити це буде важко.
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
const ui = read("assets/js/ui.js");

// Сама функція живе в common.js, а не в catalog.js: те саме
// розгортання потрібне акціям, а головна catalog.js не підключає
// (див. tests/test-promo-color-cards.js).
const commonSource = read("assets/js/common.js");

// беремо саму функцію з коду, а не її копію
const split = new Function(
    commonSource.match(/function splitProductsByColor[\s\S]*?\n\}/)[0]
    + "; return splitProductsByColor;")();

console.log("\n[1] Правило описане в коді");
{
    check("розгортання застосовується при завантаженні",
        /products = splitProductsByColor\(await response\.json\(\)\)/.test(catalog));

    // Копії в catalog.js лишитись не мусить: вона вже один раз
    // розійшлась із двійником (promotionProducts) і кожна сторінка
    // мала свою поведінку.
    check("у catalog.js лишився тільки виклик",
        !/function splitProductsByColor/.test(catalog));

    // Прапорець за замовчуванням увімкнений: у більшості товарів
    // кольори справді різні.
    check("вимикається прапорцем", /product\.splitByColor !== false/.test(commonSource));

    // Товар з одним кольором розгортати нічого.
    check("один колір не розгортається", /variants\.length < 2/.test(commonSource));

    // Копіювання товарів свідомо НЕ робимо — причина зафіксована в коді,
    // щоб її не довелося з'ясовувати заново.
    check("причина відмови від копіювання записана",
        /duplicate content|дані задублюються/.test(commonSource));
}

console.log("\n[2] Кольори не перепутались");
{
    const sample = [{
        id: 1,
        title: "Сумка",
        variants: [
            { color: "Чорний", images: ["/a/black.webp"] },
            { color: "Білий", images: ["/a/white.webp"] },
            { color: "Синій", images: ["/a/blue.webp"] }
        ]
    }];

    const out = split(sample);

    check("три кольори → три картки", out.length === 3, out.length);

    // Картка й сторінка товару беруть variants[0] як активний, тож
    // потрібний колір мусить стояти першим.
    check("активний варіант = колір картки",
        out.every(c => c.variants[0].color === c.cardColor),
        out.map(c => `${c.cardColor}/${c.variants[0].color}`).join(", "));

    // Решта кольорів мусить лишитися: інакше на картці не буде чого
    // перемикати, і покупець не побачить інших варіантів.
    check("решта кольорів на місці",
        out.every(c => c.variants.length === 3));

    // Фото верхнього рівня йдуть за активним кольором — інакше картка
    // показала б знімок іншого варіанта.
    check("фото відповідають кольору",
        out.every(c => c.images[0].includes(
            { "Чорний": "black", "Білий": "white", "Синій": "blue" }[c.cardColor])),
        out.map(c => `${c.cardColor}: ${c.images[0]}`).join(", "));

    // Прапорець вимкнений — одна картка, як було.
    const off = split([{ ...sample[0], splitByColor: false }]);

    check("з вимкненим прапорцем — одна картка", off.length === 1, off.length);
    check("і кольори всі на місці", off[0].variants.length === 3);
}

console.log("\n[3] Результат на справжніх даних");
{
    const products = JSON.parse(read("data/products.json"));
    const cards = split(products);

    check(`карток більше, ніж товарів (${products.length} → ${cards.length})`,
        cards.length > products.length);

    // ГОЛОВНЕ: жоден колір не втратився. Якби розгортання загубило
    // варіант, товар просто зник би з каталогу в цьому кольорі.
    const lost = [];

    products.forEach(p => {

        if ((p.variants || []).length < 2 || p.splitByColor === false) return;

        const got = new Set(cards.filter(c => c.id === p.id).map(c => c.cardColor));

        (p.variants || []).forEach(v => {
            if (!got.has(v.color)) lost.push(`${p.slug}/${v.color}`);
        });

    });

    check("жоден колір не втрачено", lost.length === 0, lost.slice(0, 3).join(", "));

    // І навпаки: не з'явилось нічого лишнього
    const extra = cards.filter(c =>
        c.cardColor && !(products.find(p => p.id === c.id).variants || [])
            .some(v => v.color === c.cardColor));

    check("зайвих карток немає", extra.length === 0, extra.length);

    // Товар з одним кольором лишається однією карткою
    const single = products.filter(p => (p.variants || []).length < 2);
    const singleCards = cards.filter(c => single.some(p => p.id === c.id));

    check("товари з одним кольором не роздвоїлись",
        singleCards.length === single.length,
        `${singleCards.length} проти ${single.length}`);
}

console.log("\n[4] Клац відкриває саме цей колір");
{
    // Без кольору в адресі клац по назві відкривав би перший колір
    // товару, а не той, що на картці.
    check("посилання назви несе колір",
        /productUrl\(product, product\.cardColor \? \{ color: product\.cardColor \} : null\)/.test(ui));

    // Клац по самій картці переносить обраний колір давно — свотч
    // активного варіанта перший, тож саме він і поїде.
    check("активний свотч — перший", /index === 0 \? "active" : ""/.test(ui));

    const common = read("assets/js/common.js");

    check("клац по картці переносить колір",
        /getSelectedVariant\(card\)/.test(common)
        && /productUrl\(\s*\n?\s*findCachedProduct/.test(common));
}

console.log("\n[5] Керування з адмінки");
{
    const { loadYaml } = require("./helpers/yaml");

    const products = loadYaml("admin/config.yml").collections
        .find(c => c.name === "products");

    const field = (products.fields || []).find(f => f.name === "splitByColor");

    check("поле є", !!field);
    check("це перемикач", field && field.widget === "boolean");
    check("увімкнено за замовчуванням", field && field.default === true);
    check("поле необовʼязкове", field && field.required === false);

    // Підказка мусить казати, КОЛИ вимикати — інакше прапорець
    // виглядає як щось, чого краще не чіпати.
    check("підказка пояснює, коли вимикати",
        /відтінки одного/.test(String(field && field.hint)));
}

console.log("\n[6] Підпису кольору в картці немає — і це рішення");
{
    // ЧОМУ ПРИБРАЛИ
    // --------------
    // Тут був рядок «Бежевий» / «Чорний» під назвою: кожен колір —
    // окрема картка, і дві картки одного товару мають однакові бренд,
    // назву й ціну. Власник попросив прибрати: фото вже відповідає на
    // це питання (кремова сумка й чорна поруч не схожі), а рядок з'їдав
    // 20 px висоти в КОЖНІЙ картці й розганяв текстовий блок.
    //
    // Перевірки нижче стежать за двома речами:
    //   1. підпис справді прибраний — з розмітки, зі стилів і з
    //      обробника свотча, а не лишився десь наполовину;
    //   2. назва кольору не зникла з сайту НАСОВСІМ: вона є в підказці
    //      свотча і в адресі, куди веде картка.
    // Дивимось на КОД, а не на коментарі: на місці прибраної функції
    // лишилось пояснення, чому її немає, — і воно згадує її назву.
    const uiCode = ui.split("\n").filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");

    check("розмітка картки більше не малює підпис",
        !/class="product-color-name"/.test(uiCode) && !/cardColorLabel\(/.test(uiCode),
        (uiCode.match(/.*cardColorLabel.*/) || [""])[0].trim());

    const commonSrc = read("assets/js/common.js");

    check("обробник свотча його не оновлює",
        !/scope\.querySelector\("\.product-color-name"\)/.test(commonSrc));

    const css = read("assets/css/style.css");

    check("стилів підпису теж не лишилось",
        !/\.product-color-name\{/.test(css));

    // НАЗВА КОЛЬОРУ МУСИТЬ ЛИШИТИСЬ ДОСЯЖНОЮ.
    //
    // Прибрали рядок, а не інформацію: інакше на питання «якого воно
    // кольору» відповіді не було б ніде.
    check("свотч підказує колір при наведенні",
        /title="\$\{escapeHtml\(variant\.color\)\}"/.test(ui));

    check("посилання картки несе колір",
        /productUrl\(product, product\.cardColor \? \{ color: product\.cardColor \} : null\)/.test(ui));

    // Свотчі малюються з УСІХ варіантів — тобто вибір кольору на
    // картці лишився на місці (див. tests/test-promo-color-cards.js).
    const swatches = ui.slice(ui.indexOf("const colorButtons"), ui.indexOf("const sizeButtons"));

    check("свотчі на картці не зникли", /variants\.map\(\(variant, index\)/.test(swatches));
}

console.log("\n[6b] Під ціною в сітці немає порожнього відступу");
{
    // ЩО БУЛО НЕ ТАК
    // ---------------
    // .product-meta-row має margin-bottom:14px — він відділяє ціну від
    // кнопки «Купити». Але в сітці на десктопі цієї кнопки в текстовому
    // блоці немає: вона в hover-панелі поверх фото. Тобто 14 px висіли
    // просто так, під ними вже нічого не було, і разом із
    // padding-bottom:20px це давало 34 px порожнечі внизу кожної
    // картки — саме на неї показав власник стрілкою.
    const css = read("assets/css/style.css");

    // Правило мусить бути САМЕ для сітки й САМЕ на десктопі: у режимі
    // «список» кнопка й опис під ціною на місці, і там відступ потрібен.
    check("у сітці відступ під ціною знято",
        /\.products-grid:not\(\.list-view\) \.product-card \.product-meta-row\{\s*margin-bottom:0;\s*\}/.test(css));

    // Кнопку в текстовому блоці ховає сусіднє правило — саме через це
    // відступ і став зайвим. Якщо кнопку колись повернуть, обидва
    // правила лежать поруч і зміну буде видно.
    check("поруч правило, яке ховає кнопку в сітці",
        /\.products-grid:not\(\.list-view\) \.product-card > \.product-info > \.buy-btn\{[\s\S]{0,40}display:none/.test(css));

    // Обидва — тільки в десктопному медіазапиті. На телефоні кнопка в
    // картці показується, тож відступ там потрібен — і його там ніколи
    // й не було: margin-bottom оголошений лише в цьому ж медіазапиті.
    const desktop = css.slice(css.indexOf("@media(min-width:769px)"));

    check("правило живе в десктопному медіазапиті",
        desktop.includes(".products-grid:not(.list-view) .product-card .product-meta-row{"));

    check("на телефоні відступу під ціною і не було",
        !/^\.product-meta-row\{[^}]*margin-bottom/m.test(css));

    // Висота назви лишається зарезервованою під два рядки: без цього
    // ціна в сусідніх картках стояла б на різній висоті (див.
    // tests/test-title-height-alignment.js).
    check("резерв висоти назви не зачеплений",
        /\.product-title\{[\s\S]{0,700}min-height:2\.6em/.test(css));
}

console.log("\n[N] Розгорнута по кольору картка відповідає за ОДИН колір");
{
    // ЩО БУЛО НЕ ТАК
    // ---------------
    // Каталог розкладає товар на кілька карток, по одній на колір. Але
    // кожна картка носить УСІ варіанти (потрібний просто стоїть
    // першим), і getProductColorFamilies() бачив їх усі. Тобто картка
    // «Карамельний» відповідала й за зелений, і за чорний.
    //
    // Власник помітив обидва наслідки:
    //
    //   • фільтр «Помаранчевий» видавав ту саму сумку двічі —
    //     карамельну й зелену: підходила одна, а лишались обидві;
    //   • число поруч із кольором не збігалося з «Знайдено N товарів»:
    //     кожна картка додавала до лічильника всі свої кольори.
    const catalogSrc = fs.readFileSync(path.join(ROOT, "assets/js/catalog.js"), "utf8");
    const commonSrc = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8");

    const env = new Function(
        commonSrc.match(/function getProductColors[\s\S]*?\n\}/)[0]
        + commonSrc.slice(commonSrc.indexOf("const COLOR_FAMILIES"),
            commonSrc.indexOf("function getDiscountPercent"))
        + "; return { splitProductsByColor, getProductColorFamilies };"
    )();

    // Вихідні файли товарів, а не згенерований агрегат
    // (правило з tests/test-migration-types.js): агрегат — результат
    // збірки, і тест на ньому перевіряв би збірку, а не дані.
    const source = fs.readdirSync(path.join(ROOT, "data/products"))
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "data/products", f), "utf8")))
        .filter(p => typeof p.id === "number");

    const cards = env.splitProductsByColor(source);

    const familiesOf = card => new Set(env.getProductColorFamilies(card).keys());

    check("каталог справді розкладає товари по кольорах",
        cards.length > 0 && cards.some(c => c.cardColor), String(cards.length));

    // ГОЛОВНЕ ПРАВИЛО. Розгорнута картка — це один колір, тож і сімʼя
    // в неї рівно одна. Інакше вона знайдеться під двома фільтрами
    // одразу, і покупець побачить той самий товар двічі.
    const багатоколірні = cards.filter(c => c.cardColor && familiesOf(c).size > 1);

    check("у розгорнутої картки рівно одна сімʼя кольору",
        багатоколірні.length === 0,
        багатоколірні.slice(0, 3).map(c => `${c.title} (${c.cardColor})`).join("; "));

    // Наслідок, який видно у фільтрі: сума по сімʼях мусить дорівнювати
    // кількості карток. Розійдеться — значить, якась картка рахується
    // двічі, і число поруч із кольором знову збреше.
    const families = new Set();

    cards.forEach(card => familiesOf(card).forEach(f => families.add(f)));

    const сума = [...families]
        .reduce((total, f) => total + cards.filter(c => familiesOf(c).has(f)).length, 0);

    check("сума по сімʼях дорівнює кількості карток",
        сума === cards.length, `${сума} проти ${cards.length}`);

    // Живий випадок від власника: помаранчевий фільтр видавав
    // карамельну сумку І її ж зелений варіант.
    const помаранчеві = cards.filter(c => familiesOf(c).has("Помаранчевий"));

    check("під «Помаранчевий» немає зайвих кольорів",
        помаранчеві.every(c => !c.cardColor || familiesOf(c).has("Помаранчевий")),
        помаранчеві.map(c => c.cardColor).join(", "));

    check("той самий товар не потрапляє двічі",
        new Set(помаранчеві.map(c => c.id)).size === помаранчеві.length,
        помаранчеві.map(c => `${c.id}/${c.cardColor}`).join(", "));

    // І сам механізм: без cardColor картка й далі відповідає за всі
    // свої кольори — це нерозгорнутий товар, там так і треба.
    check("нерозгорнутий товар лишається з усіма кольорами",
        cards.filter(c => !c.cardColor).every(c => familiesOf(c).size >= 1));

    check("правило живе в getProductColors, а не в каталозі",
        /if \(product\.cardColor\)/.test(commonSrc));
}

console.log("\n[N+1] Число поруч із кольором — це товари");
{
    // Тут стояло names.length — кількість відтінків, зведених у сімʼю.
    // Тобто «Синій 3» означало «сюди зведено три назви», а не «три
    // товари»: натискаєш — і каталог пише «Знайдено 14 товарів».
    const catalogSrc = fs.readFileSync(path.join(ROOT, "assets/js/catalog.js"), "utf8");

    check("лічильник рахує картки, а не назви відтінків",
        /counts\.set\(family, \(counts\.get\(family\) \|\| 0\) \+ 1\)/.test(catalogSrc));

    check("у розмітку йде саме він",
        /const count = counts\.get\(family\) \|\| 0;/.test(catalogSrc)
        && /filter-option-note">\$\{count\}/.test(catalogSrc));

    check("старого names.length у розмітці немає",
        !/filter-option-note">\$\{names\.length\}/.test(catalogSrc));

    // Скільки назв злилось — усе ще корисно, але це підказка при
    // наведенні, а не число поруч.
    check("перелік відтінків лишився в підказці",
        /option\.title = names\.length > 1/.test(catalogSrc));

    // ЧИСЛО МУСИТЬ БУТИ ВИДНО
    //
    // .filter-option — це flex, і підпис ішов у нього ГОЛИМ ТЕКСТОМ:
    // такий вузол стає анонімним елементом флексу й стискатись не
    // вміє. Довга назва («Помаранчевий», «Adidas by Stella McCartney»)
    // виштовхувала число за межу меню, а меню з overflow:hidden просто
    // його ховало. Коротка ж лишала число там, де закінчився текст, —
    // колонка «їхала».
    const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");

    ["filter-option-label\">\\$\\{escapeHtml\\(family\\)\\}",
        "filter-option-label\">\\$\\{item\\}",
        "filter-option-label\">\\$\\{escapeHtml\\(name\\)\\}"].forEach(pattern => {

        check(`підпис обгорнутий (${pattern.slice(21, 40)}…)`,
            new RegExp(pattern).test(catalogSrc));

    });

    // min-width:0 тут обовʼязковий: без нього елемент флексу не
    // стискається менше за свій вміст, і обгортка нічого не рятує.
    const label = css.slice(css.indexOf(".filter-option-label{"),
        css.indexOf(".filter-option-label{") + 260);

    check("підпис стискається й обрізається трикрапкою",
        /min-width:0/.test(label) && /text-overflow:ellipsis/.test(label),
        label.replace(/\s+/g, " ").slice(0, 120));

    const note = css.slice(css.indexOf(".filter-option-note{"),
        css.indexOf(".filter-option-note{") + 320);

    check("число не стискається", /flex:0 0 auto/.test(note));

    check("число притиснуте праворуч", /margin-left:auto/.test(note));

    // Кнопки «Колір» і «Бренд» вузькі — меню за замовчуванням
    // розтягується рівно на них, і довге просто не влазило.
    check("меню кольору ширше за кнопку",
        /\.filter-menu\.filter-menu-colors\{[^}]*width:280px/.test(css));

    check("меню брендів ширше за кнопку",
        /#brandDropdown \.filter-menu\{[^}]*width:300px/.test(css));

    // На телефоні дропдаун і так на всю ширину — фіксована ширина там
    // зламала б розкладку.
    check("на телефоні ширина не фіксується",
        /@media\(max-width:768px\)\{[\s\S]{0,200}#brandDropdown \.filter-menu\{[^}]*width:auto/.test(css));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
