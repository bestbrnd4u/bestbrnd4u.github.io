// Каталог і сторінка товару на телефоні: три речі, які видно лише з
// телефона в руках, і які легко зламати назад.
//
// 1. ШЛЯХ ДО ПЕРШОГО ТОВАРУ
//    Від хлібних крихт до сітки проходило 377px на екрані 812px —
//    майже пів екрана порожнього. Складалось із чотирьох відступів у
//    різних місцях файлу плюс рядок «Знайдено N товарів», який ламався
//    на два: число окремо, перемикач вигляду окремо. Стало 393px до
//    сітки замість 511px.
//
// 2. НИЗ СТОРІНКИ ТОВАРУ
//    Смуга «Додати в кошик» прибита до низу вікна й лежить ПОВЕРХ
//    сторінки. Рядок з копірайтом опинявся під нею повністю — і
//    догортати до нього було нікуди.
//
// 3. КНОПКА «НАЗАД»
//    Вона запнута на left:0, але це «нуль» контейнера, у якого є бічне
//    поле. У цю щілину було видно пункти шляху, що проїжджають повз
//    кнопку: на скріні з телефона з-за неї виглядало «ам» від
//    «Жінкам».
//
// Перевіряємо текстом стилів і розмітки, а не через jsdom: обчислений
// display він віддає з власними правилами (див. коментар у
// tests/test-hidden-attribute.js), а медіазапити не застосовує зовсім.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const css = read("assets/css/style.css");
const catalogHtml = read("catalog.html");
const promoHtml = read("promo.html");

// без коментарів: у них згадуються ті самі селектори й числа
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

// Правило з блоку @media(max-width:768px). Просте indexOf по селектору
// брало б і десктопне правило, тож шукаємо в межах мобільних блоків.
function mobileRule(selector) {

    const blocks = [];
    let from = 0;

    while (true) {

        const start = code.indexOf("@media(max-width:768px)", from);
        if (start === -1) break;

        // кінець блоку — по балансу дужок
        let depth = 0, i = code.indexOf("{", start);
        const open = i;

        for (; i < code.length; i++) {
            if (code[i] === "{") depth++;
            else if (code[i] === "}") { depth--; if (!depth) break; }
        }

        blocks.push(code.slice(open, i));
        from = i;

    }

    for (const block of blocks) {

        const at = block.indexOf(selector + "{");

        if (at === -1) continue;

        return block.slice(at + selector.length + 1, block.indexOf("}", at));

    }

    return null;

}

const px = (rule, prop) => {

    if (!rule) return null;

    const hit = rule.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`));

    if (!hit) return null;

    const value = hit[1].trim();

    const num = value.match(/(-?\d+(?:\.\d+)?)px/);

    if (num) return Number(num[1]);

    // «min-width:0» — без одиниць, але це теж число, і порівнювати
    // його треба з числом, а не з рядком.
    return /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;

};

console.log("\n[1] Рядок «N товарів» і перемикач вигляду — в один рядок");
{
    // Слово «Знайдено» прибрано: воно нічого не додавало, а рядок від
    // нього не вміщувався в один.
    const countBlock = catalogHtml.slice(
        catalogHtml.indexOf('<div class="catalog-top">'),
        catalogHtml.indexOf('<div class="catalog-actions">'));

    check("слова «Знайдено» більше немає", !/Знайдено/.test(countBlock), countBlock.trim().slice(0, 60));
    check("число товарів лишилось", /id="productsCount"/.test(countBlock) && /товарів/.test(countBlock));

    // Підпис «Показати:» — в окремому span, щоб на телефоні ховати
    // саме його, а не кнопки разом із ним.
    [["catalog.html", catalogHtml], ["promo.html", promoHtml]].forEach(([name, html]) => {

        check(`${name}: підпис «Показати:» окремим span`,
            /<span class="catalog-view-label">\s*Показати:\s*<\/span>/.test(html));

        check(`${name}: перемикач має свій клас`,
            /<div class="catalog-view-switch">/.test(html));

    });

    check("на телефоні підпис прибрано",
        px(mobileRule(".catalog-view-label"), "display") === "none");

    check("рядок не переноситься",
        px(mobileRule(".catalog-top"), "flex-wrap") === "nowrap");

    // Кнопки лишаються з aria-label — для незрячих підпис не зник.
    check("кнопки вигляду підписані для незрячих",
        /id="gridViewBtn" aria-label="Сітка товарів"/.test(catalogHtml)
        && /id="listViewBtn" aria-label="Список товарів"/.test(catalogHtml));
}

console.log("\n[2] Відступи до першого товару стиснуті");
{
    // Десктопні значення лишаються як були — правимо лише телефон.
    check("на десктопі заголовок і далі має 36px",
        /\.catalog-header\{[^}]*margin-bottom:36px/.test(code));

    const cases = [
        ["сторінка", ".catalog-page", "padding-top", 20],
        ["заголовок", ".catalog-header", "margin-bottom", 36],
        ["рядок товарів", ".catalog-top", "margin-bottom", 24],
        ["крихти", ".breadcrumbs", "padding", 14]
    ];

    cases.forEach(([label, selector, prop, was]) => {

        const now = px(mobileRule(selector), prop);

        check(`${label}: ${prop} менше за ${was}px`,
            typeof now === "number" && now < was, now);

    });

    // Смуга «Фільтри/Сортувати» живе у власному мобільному блоці.
    const bar = mobileRule(".mobile-filter-bar");

    check("смуга фільтрів: відступи зменшені",
        px(bar, "padding") === 8 && /margin:0 -20px 12px/.test(bar || ""),
        px(bar, "padding"));
}

console.log("\n[3] Низ сторінки товару не під кнопкою");
{
    // Висоту смуги беремо з самих стилів: підправлять кнопку — тест
    // одразу скаже, що зарезервованого місця вже не досить.
    const barRule = mobileRule(".mobile-sticky-cart");
    const btnRule = mobileRule(".mobile-sticky-cart .buy-btn");

    const barPadding = px(barRule, "padding");
    const btnHeight = px(btnRule, "height");

    check("смуга: висота читається зі стилів",
        typeof barPadding === "number" && typeof btnHeight === "number",
        `${barPadding} / ${btnHeight}`);

    const need = barPadding * 2 + btnHeight;

    const reserved = px(mobileRule("body:has(.mobile-sticky-cart) .copyright"), "padding-bottom");

    check(`місця під смугу зарезервовано (треба ≥ ${need}px)`,
        typeof reserved === "number" && reserved >= need, reserved);

    // Резервуємо ЗАВЖДИ, а не лише при видимій смузі: інакше поява
    // смуги подовжувала б сторінку, а зникнення вкорочувало — і
    // людину, що стоїть у самому низу, підкидало б.
    check("резерв не залежить від .show",
        !/body:has\(\.mobile-sticky-cart\.show\) \.copyright/.test(code));

    // Копірайт лежить ПІСЛЯ </footer>, тому відступ саме на ньому.
    check("копірайт — останній блок сторінки товару",
        read("product.html").indexOf("</footer>")
        < read("product.html").indexOf('<div class="copyright">'));
}

console.log("\n[4] Під кнопкою «Назад» не просвічує шлях");
{
    const back = code.slice(code.indexOf(".crumb-back{"));

    check("кнопка запнута до лівого краю",
        /\.crumb-back\{[^}]*position:sticky/.test(code) && /\.crumb-back\{[^}]*left:0/.test(code));

    const shield = back.slice(back.indexOf(".crumb-back::before{"),
        back.indexOf("}", back.indexOf(".crumb-back::before{")));

    check("є заслінка ліворуч від кнопки", shield.length > 0);

    check("заслінка стоїть саме ліворуч", /right:100%/.test(shield));

    // Ширина заслінки мусить перекривати бічне поле контейнера — інакше
    // на широкому екрані щілина відкриється знову.
    const containerPadding = px(code.slice(code.indexOf(".container{")), "padding");

    check(`заслінка ширша за поле контейнера (${containerPadding}px)`,
        px(shield, "width") >= containerPadding, px(shield, "width"));

    // Тло — те саме, що в смуги крихт, інакше замість тексту з-під
    // кнопки виглядала б смужка чужого кольору.
    const strip = code.slice(code.indexOf(".breadcrumbs{"), code.indexOf("}", code.indexOf(".breadcrumbs{")));

    const stripBg = (strip.match(/background:\s*([^;]+)/) || [])[1];
    const shieldBg = (shield.match(/background:\s*([^;]+)/) || [])[1];

    check("тло заслінки — тло смуги крихт", stripBg && stripBg === shieldBg,
        `${stripBg} проти ${shieldBg}`);
}

console.log("\n[5] Смуга «Фільтри / Сортувати»");
{
    const catalogJs = read("assets/js/catalog.js");

    // Значок «скільки фільтрів обрано» показував стан на крок назад:
    // рахувався лише при відкритті шторки «Всі фільтри», тобто ще до
    // того, як людина в ній щось обрала. Через це він з'являвся з
    // ДРУГОГО фільтра, лишався висіти після «Скинути фільтри» й не
    // з'являвся зовсім, коли фільтри приїхали з адреси.
    check("значок оновлює render(), а не відкриття шторки",
        /renderActiveFilters\(\);\s*\n\s*updateMobileFilterCount\(\);/.test(catalogJs));

    check("рахунок фільтрів — один на весь файл",
        (catalogJs.match(/function activeFilterCount\(\)/g) || []).length === 1);

    check("шторка кличе ту саму функцію",
        /function refreshRowLabels\(\)[\s\S]{0,700}?updateMobileFilterCount\(\);/.test(catalogJs));

    // Значок додає до кнопки «Фільтри» ~27px, і сортування переставало
    // вміщатись: текст із nowrap виїжджав ЗА кнопку, а смуга
    // отримувала горизонтальну прокрутку.
    const sort = mobileRule(".mobile-filter-bar .sort-toggle");

    check("кнопка сортування вміє стискатись",
        px(sort, "min-width") === 0 && px(sort, "overflow") === "hidden",
        `${px(sort, "min-width")} / ${px(sort, "overflow")}`);

    check("на телефоні слово «Сортувати:» прибрано",
        px(mobileRule(".mobile-filter-bar .sort-toggle-label"), "display") === "none");

    check("замість нього значок",
        /content:"↕"/.test(mobileRule(".mobile-filter-bar .sort-toggle::before") || ""));

    // Запобіжник для довгого значення («за зменшенням ціни») і
    // трицифрового значка.
    const label = mobileRule(".mobile-filter-bar #sortLabel");

    check("довге значення ховається трикрапкою",
        px(label, "text-overflow") === "ellipsis" && px(label, "min-width") === 0);

    // Підпис текстовим вузлом не приховати — тому він у span.
    [["catalog.html", catalogHtml], ["promo.html", promoHtml]].forEach(([name, html]) => {
        check(`${name}: підпис «Сортувати:» окремим span`,
            /<span class="sort-toggle-label">Сортувати:<\/span>/.test(html));
    });

    check("на десктопі підпис лишається",
        !/\.sort-toggle-label\{[^}]*display:none/.test(
            code.slice(0, code.indexOf("@media(max-width:768px)"))));
}

console.log(failures === 0
    ? "\n✅ Мобільний каталог і сторінка товару в порядку\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
