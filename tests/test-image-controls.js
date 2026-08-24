// Фото як елемент керування: акції та добірки.
//
// ДВА СИМПТОМИ
//
// 1. У слайдера акцій («Обери сумочку для себе») фото при наведенні
//    трохи наближується — видно, що на нього можна натиснути. Двом
//    іншим способам показу цього бракувало: у SUMMER SALE
//    (banner_products) не було ні overflow, ні transition, ні правила
//    на :hover, а в компактного тизера (banner_compact — «Колекція
//    Coach», «Колекція Marc Jacobs») фото взагалі не було посиланням:
//    курсор лишався стрілкою, клац нічого не робив.
//
// 2. У добірці фото нічим не керувало. Тепер клац по ньому гортає
//    товари — і по колу: з останньої сторінки повертає на першу.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const app = read("assets/js/app.js");
const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[1] Фото акції показує, що на нього можна натиснути");
{
    // Слайдер акцій — зразок, який працював і раніше.
    const blocks = [
        [".promo-hero-slide-image", "слайдер акцій"],
        [".brand-campaign-image", "SUMMER SALE (banner_products)"],
        [".brand-teaser-image", "Колекція Coach / Marc Jacobs (banner_compact)"]
    ];

    blocks.forEach(([sel, label]) => {

        const rule = (css.match(new RegExp(`\\${sel}\\{[\\s\\S]*?\\}`)) || [""])[0];
        const imgRule = (css.match(new RegExp(`\\${sel} img\\{[\\s\\S]*?\\}`)) || [""])[0];

        // без overflow збільшене фото вилазить за межі блока
        check(`${label}: фото не вилазить за межі`, /overflow:hidden/.test(rule), rule.slice(0, 80));

        // без transition замість руху виходить стрибок
        check(`${label}: збільшення плавне`, /transition:/.test(imgRule), imgRule.slice(0, 90));

        // селектори можуть бути згруповані через кому, тож після
        // "img" допускаємо і "{", і ","
        const hoverRule = css.match(
            new RegExp(`\\${sel}:hover img\\s*[,{][\\s\\S]{0,160}?transform:scale`));

        check(`${label}: збільшується при наведенні`, !!hoverRule);

    });

    // :hover на тачскріні «залипає» після дотику — фото лишалося б
    // збільшеним, доки не торкнешся чогось іншого.
    check("збільшення лише для миші",
        /@media \(hover:hover\) and \(pointer:fine\)\{[\s\S]{0,400}\.brand-teaser-image:hover img/
            .test(css));

    // у тизера фото було <div> — курсор стрілкою, клац у нікуди
    check("фото тизера — посилання, а не div",
        /<a href="promo\?id=\$\{encodeURIComponent\(promo\.slug\)\}"\s*\n\s*class="brand-teaser-image"/
            .test(app));
    check("посилання підписане для зчитувача",
        /class="brand-teaser-image"[\s\S]{0,90}aria-label=/.test(app));

    check("фокус із клавіатури видно",
        /\.brand-teaser-image:focus-visible/.test(css)
        && /\.brand-campaign-image:focus-visible/.test(css));
}

console.log("\n[2] Фото добірки гортає сторінки по колу");
{
    check("клас ставиться лише коли сторінок більше однієї",
        /if \(image && pageCount > 1\) \{[\s\S]{0,120}classList\.add\("is-pager"\)/.test(app));

    // Стрілки поруч зупиняються на краях — у кнопки видно стан
    // (вимкнена). Фото стану не показує: якби воно на останній
    // сторінці перестало реагувати, це виглядало б як поломка.
    check("гортання по колу, а не до останньої сторінки",
        /\(page \+ 1\) % pageCount/.test(app));

    // Кнопка, а не посилання: перехід нікуди не веде.
    check("фото оголошене кнопкою для зчитувача",
        /image\.setAttribute\("role", "button"\)/.test(app));
    check("фото доступне з клавіатури",
        /image\.setAttribute\("tabindex", "0"\)/.test(app));
    check("Enter і пробіл працюють",
        /event\.key !== "Enter" && event\.key !== " "/.test(app));
    check("пробіл не прокручує сторінку", /event\.preventDefault\(\)/.test(app));

    check("підпис оновлюється разом зі сторінкою",
        /Показати товари \$\{\(\(page \+ 1\) % pageCount\) \+ 1\}/.test(app));

    check("є курсор і збільшення", /\.collection-image\.is-pager\{[\s\S]{0,60}cursor:pointer/.test(css));
}

console.log("\n[3] Гортання по колу — на живому DOM");
{
    // Перевіряємо саму поведінку, а не текст коду: важливо, що після
    // останньої сторінки повертає на першу, і що стрілки при цьому
    // лишаються з попередньою логікою (гаснуть на краях).
    const { JSDOM } = require("jsdom");

    const dom = new JSDOM(`<!doctype html><body>
        <div class="collection-widget" data-page-size="2" data-page-count="3" data-page="0">
            <div class="collection-image"><img></div>
            <span class="collection-page-indicator"><span class="collection-page-current">01</span>/03</span>
            <button class="collection-prev"></button>
            <button class="collection-next"></button>
            <div class="product-card"></div><div class="product-card"></div>
            <div class="product-card"></div><div class="product-card"></div>
            <div class="product-card"></div><div class="product-card"></div>
        </div></body>`, { pretendToBeVisual: true });

    global.window = dom.window;
    global.document = dom.window.document;

    // getCollectionPageSize залежить від ширини вікна — підміняємо,
    // щоб тест не залежав від розміру вікна jsdom
    // оголошення через function не стає властивістю window у jsdom-eval,
    // тож привʼязуємо явно
    dom.window.eval("window.getCollectionPageSize=function(){return 2;};");
    dom.window.eval(app.match(/function setupCollectionPagination\(widget\) \{[\s\S]*?\n\}/)[0]
        .replace("function setupCollectionPagination(widget) {",
                 "window.setupCollectionPagination = function (widget) {")
        .replace(/\n\}$/, "\n};"));

    const widget = document.querySelector(".collection-widget");

    dom.window.setupCollectionPagination(widget);

    const image = widget.querySelector(".collection-image");
    const page = () => widget.dataset.page;
    const clickImage = () => image.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

    check("починаємо з першої сторінки", page() === "0", page());

    clickImage();
    check("клац → друга сторінка", page() === "1", page());

    clickImage();
    check("клац → третя сторінка", page() === "2", page());

    clickImage();
    check("з останньої повертає на першу", page() === "0", page());

    // видимі товари справді змінюються, а не лише число в data-page
    const visible = () => [...widget.querySelectorAll(".product-card")]
        .filter(c => !c.hidden).length;

    check("на сторінці видно рівно свою порцію", visible() === 2, visible());

    clickImage();
    check("після гортання порція теж правильна", visible() === 2, visible());

    // Стрілки лишаються з попередньою поведінкою: вони гаснуть на
    // краях. Саме через це фото й гортає по колу — у кнопки видно
    // стан, у фото ні.
    widget.dataset.page = "0";
    widget.querySelector(".collection-next").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }));

    check("стрілка «далі» лишилась некруговою", page() === "1", page());

    widget.querySelector(".collection-next").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }));
    widget.querySelector(".collection-next").dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }));

    check("стрілка зупиняється на останній сторінці", page() === "2", page());
}

console.log("\n[4] Над фото немає світлої смуги");
{
    // Фото загорнуте в посилання, і в розмітці між <a> і <picture> є
    // перенос рядка. Це пробільний текстовий вузол: у блоковому
    // контейнері він утворює власний рядок висотою line-height —
    // світлу смугу НАД картинкою на всю ширину блока. На десктопі її
    // не видно (блок високий), на телефоні вона одразу впадає в око.
    //
    // Прибирати перенос у шаблоні було б крихко: будь-яке
    // переформатування коду повернуло б смугу.
    const rule = (css.match(/\.promo-hero-slide-image,[\s\S]*?\}/) || [""])[0];

    check("рядок від переносу схлопнутий", /line-height:0/.test(rule), rule.slice(0, 120));
    check("і розмір шрифта теж", /font-size:0/.test(rule));

    [".promo-hero-slide-image", ".brand-campaign-image", ".brand-teaser-image", ".collection-image"]
        .forEach(sel => check(`${sel} у списку`, rule.includes(sel)));

    // сам текст усередині картинки не постраждає — його там немає,
    // а підписи лежать у сусідньому блоці
    check("текстові блоки не зачеплені",
        !/\.brand-campaign-content[\s\S]{0,80}font-size:0/.test(css));
}

console.log("\n[5] Кути банера не темні");
{
    const heroCss = read("assets/css/style.css");

    // Позаду hero стояла темна підкладка #111827 — щоб у вирізі
    // скругленого нижнього кута був темний колір. Читалось це не як
    // задум, а як два чорні кути, наче щось не домалювалось.
    check("підкладка позаду банера прозора",
        /\.hero-backdrop\{[\s\S]{0,80}background:transparent/.test(heroCss));
    check("темного кольору в підкладці не лишилось",
        !/\.hero-backdrop\{[\s\S]{0,80}#111827/.test(heroCss));

    // сам банер лишається темним зсередини — це його фон під фото,
    // і він потрібен, якщо фото не завантажиться
    check("захисний фон самого банера на місці",
        /\.hero\{[\s\S]{0,400}background-color:#111827/.test(heroCss));
}

console.log("\n[6] Окреме фото банера для телефона");
{
    // buildCroppedImageUrl ріже кадр лише для абсолютних адрес із
    // параметрами (так колись працювали фото з Pexels). Усі наші фото
    // локальні, тож для них вона повертає адресу БЕЗ ЗМІН — і
    // «десктопний», «планшетний» та «мобільний» варіанти були одним
    // файлом. На телефоні з широкої смуги 1600×720 лишалась вузька
    // середина, текст лягав просто на товар.
    check("банер приймає окреме мобільне фото",
        /function setResponsiveBanner\(el, cssVarName, imageUrl, crops, framing, mobileImage\)/
            .test(app));
    check("без нього береться десктопне", /mobileImage \|\| imageUrl/.test(app));

    check("головний банер передає своє", /framing, hero\.imageMobile\)/.test(app));
    check("промо-банер теж", /framing, promo\.imageMobile\)/.test(app));

    // Рамка кадрування привʼязана до ІМЕНІ ФАЙЛУ, а на телефоні файл
    // інший — інакше на мобільному застосувалась би рамка від
    // десктопного знімка.
    check("рамка перечитується разом зі зміною картинки",
        /applyFraming\(el, framing, source\)/.test(app));

    const { loadYaml } = require("./helpers/yaml");
    const home = loadYaml("admin/config.yml").collections
        .find(c => c.name === "pages").files.find(f => f.name === "home");

    ["hero", "promo"].forEach(name => {

        const block_ = (home.fields || []).find(f => f.name === name);
        const field = ((block_ || {}).fields || []).find(f => f.name === "imageMobile");

        check(`${name}: поле для телефона є`, !!field);
        check(`${name}: поле необовʼязкове`, field && field.required === false);
        check(`${name}: у підказці є розмір`, field && /750×1000/.test(String(field.hint)));

    });

    // файли, на які вказують дані, мусять існувати
    const home_ = JSON.parse(read("data/home.json"));

    [home_.hero.image, home_.hero.imageMobile, home_.promo.image, home_.promo.imageMobile]
        .forEach(p => check(`${String(p).split("/").pop()} існує`,
            fs.existsSync(path.join(ROOT, String(p).replace(/^\//, ""))), p));

    // Кадр для телефона мусить бути ІНШОЮ композицією, а не тим самим
    // файлом: інакше сенсу в окремому полі немає.
    check("мобільний кадр — окремий файл, а не той самий",
        home_.hero.image !== home_.hero.imageMobile
        && home_.promo.image !== home_.promo.imageMobile);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
