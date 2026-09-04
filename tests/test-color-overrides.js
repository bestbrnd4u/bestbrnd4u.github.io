// Перевизначення полів для окремого кольору.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Прапорець «Кожен колір — окрема картка в каталозі» розгортає товар у
// стільку карток, скільки кольорів. Але дані до цього лишались одні на
// всі картки: дві картки одного товару мали однакові назву, опис, ціну,
// стару ціну й позначку. Коли відтінки справді відрізняються — інша
// шкіра, лімітований колір дорожчий, новинка лише одна з трьох, — це
// доводилось або терпіти, або копіювати товар цілком.
//
// Тепер у кожного кольору є власні поля: назва, опис, ціна, стара ціна,
// позначка й Reels. Плюс адмінка показує окреме посилання на кожен
// колір — для поста саме про цей відтінок.
//
// ГОЛОВНІ ВИМОГИ, ЯКІ СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// --------------------------------------------
// 1. ПОРОЖНЄ ПОЛЕ = ВЗЯТИ ЗНАЧЕННЯ ТОВАРУ. Інакше сто вже заведених
//    товарів, у яких ці поля порожні, показали б порожню назву й нульову
//    ціну — тобто нова можливість зламала б увесь каталог.
//
// 2. ПРИ ВИМКНЕНОМУ ПРАПОРЦІ ПЕРЕВИЗНАЧЕНЬ НЕМАЄ. Картка одна на товар,
//    і вона мусить мати одну назву й одну ціну.
//
// 3. КОЛЬОРИ НЕ ЗМІШУЮТЬСЯ. Найтонше місце. Картка розділеного товару
//    вже несе значення СВОГО кольору. Якщо накласти на неї інший колір
//    просто так, поля, яких новий колір не задає, лишились би від
//    попереднього — і покупець побачив би чорну сумку за ціною бежевої.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const yaml = require("js-yaml");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const commonSrc = read("assets/js/common.js");
const uiSrc = read("assets/js/ui.js");
const productSrc = read("assets/js/product.js");
const widgetSrc = read("admin/order-link-widget.js");
const adminIndex = read("admin/index.html");

// Копія common.js БЕЗ комментарів.
//
// Потрібна там, де перевірка стежить за ВІДСУТНІСТЮ рядка: у коді
// навмисно лишився коментар про те, що раніше опис адресувався як
// «перший .spec-plain», — і перевірка спрацювала б на самому
// коментарі. У цьому репозиторії на це вже наступали двічі.
const commonCode = commonSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// Беремо САМІ функції з коду, а не їхні копії (правило цього репозиторію).
const env = new Function(
    commonSrc.match(/function colorOverrides[\s\S]*?\n\}/)[0]
    + commonSrc.match(/function applyColorOverrides[\s\S]*?\n\}/)[0]
    + commonSrc.match(/function baseProduct[\s\S]*?\n\}/)[0]
    + commonSrc.match(/function splitProductsByColor[\s\S]*?\n\}/)[0]
    + "; return { colorOverrides, applyColorOverrides, baseProduct, splitProductsByColor };"
)();

const ПОЛЯ = ["title", "description", "price", "oldPrice", "badge", "instagramReels"];

console.log("\n[1] Поля є в адмінці й жодне не обовʼязкове");
{
    const doc = yaml.load(read("admin/config.yml"));
    const products = doc.collections.find(c => c.name === "products");
    const variants = products.fields.find(f => f.name === "variants");
    const byName = Object.fromEntries(variants.fields.map(f => [f.name, f]));

    ПОЛЯ.forEach(name => {
        check(`«${name}» є у варіанті кольору`, !!byName[name]);
    });

    // Обовʼязкове поле у варіанті зробило б неможливим збереження ста
    // вже заведених товарів — редактор просто не дав би зберегти.
    const обовʼязкові = ПОЛЯ.filter(n => byName[n] && byName[n].required !== false);
    check("усі перевизначення необовʼязкові", обовʼязкові.length === 0, обовʼязкові.join(", "));

    // default у Decap разом із required:true — відома пастка цього
    // репозиторію (див. test-entries-savable.js).
    const зDefault = ПОЛЯ.filter(n => byName[n] && byName[n].default !== undefined);
    check("у перевизначень немає default", зDefault.length === 0, зDefault.join(", "));

    // Ціна — ціле число, як і в товарі: копійок у гривневих цінах немає.
    check("ціна кольору — ціле число",
        byName.price && byName.price.value_type === "int", byName.price && byName.price.value_type);

    // Позначка мусить пропонувати ТІ САМІ варіанти, що в товарі, —
    // інакше в кольорі можна було б завести позначку, для якої немає
    // стилю на картці.
    const товарнаПозначка = products.fields.find(f => f.name === "badge");
    check("позначка кольору має ті самі варіанти, що в товару",
        JSON.stringify(byName.badge.options) === JSON.stringify(товарнаПозначка.options),
        JSON.stringify(byName.badge.options));
}

console.log("\n[2] Порожнє поле означає «взяти значення товару»");
{
    const product = {
        splitByColor: true,
        title: "Сумка", description: "Опис товару", price: 5000, oldPrice: 6000,
        badge: "TOP", instagramReels: "https://insta/товар"
    };

    check("порожній варіант нічого не перевизначає",
        Object.keys(env.colorOverrides(product, { color: "Чорний" })).length === 0);

    // Порожній РЯДОК у CMS — це «не заповнено», а не «напиши пусто».
    check("порожні рядки не перебивають",
        Object.keys(env.colorOverrides(product, { color: "Чорний", title: "", description: "   " })).length === 0);

    // Числове поле, з якого стерли значення, приходить нулем або NaN.
    check("нуль і NaN — не ціна",
        Object.keys(env.colorOverrides(product, { color: "Чорний", price: 0, oldPrice: NaN })).length === 0);

    const виглядБезЗмін = env.applyColorOverrides(product, { color: "Чорний" });
    check("товар без перевизначень — ТОЙ САМИЙ обʼєкт, а не копія",
        виглядБезЗмін === product);
}

console.log("\n[3] Заповнене поле перебиває, решта успадковується");
{
    const product = {
        splitByColor: true,
        title: "Сумка", description: "Опис товару", price: 5000, oldPrice: 6000,
        badge: "TOP", instagramReels: "https://insta/товар", brand: "Furla"
    };

    const вигляд = env.applyColorOverrides(product, {
        color: "Бежевий", price: 7500, badge: "NEW", title: "Сумка Cream"
    });

    check("ціна кольору перебила", вигляд.price === 7500, вигляд.price);
    check("позначка кольору перебила", вигляд.badge === "NEW", вигляд.badge);
    check("назва кольору перебила", вигляд.title === "Сумка Cream", вигляд.title);
    check("опис успадкований", вигляд.description === "Опис товару", вигляд.description);
    check("стара ціна успадкована", вигляд.oldPrice === 6000, вигляд.oldPrice);
    check("Reels успадкований", вигляд.instagramReels === "https://insta/товар");
    check("поля, яких перевизначення не торкається, на місці", вигляд.brand === "Furla");

    // Товар не мутуємо: та сама сторінка може показати інший колір.
    check("вихідний товар не змінився", product.price === 5000 && product.badge === "TOP");

    check("рядки обрізаються",
        env.applyColorOverrides(product, { color: "х", title: "  Cream  " }).title === "Cream");
}

console.log("\n[4] Прапорець вимкнено — перевизначень немає");
{
    const product = { splitByColor: false, title: "Сумка", price: 5000 };

    check("splitByColor:false вимикає перевизначення",
        Object.keys(env.colorOverrides(product, { color: "Бежевий", price: 9999 })).length === 0);

    check("ціна лишається товарною",
        env.applyColorOverrides(product, { color: "Бежевий", price: 9999 }).price === 5000);
}

console.log("\n[5] Кожна картка розділеного товару — зі своїми значеннями");
{
    const [чорна, бежева] = env.splitProductsByColor([{
        id: 1, title: "Сумка", price: 5000, badge: "TOP",
        variants: [
            { color: "Чорний", images: ["/b.webp"] },
            { color: "Бежевий", images: ["/c.webp"], price: 7500, badge: "NEW", title: "Сумка Cream" }
        ]
    }]);

    check("дві картки", !!чорна && !!бежева);
    check("чорна — значення товару", чорна.price === 5000 && чорна.badge === "TOP" && чорна.title === "Сумка",
        `${чорна.price} / ${чорна.badge} / ${чорна.title}`);
    check("бежева — свої значення", бежева.price === 7500 && бежева.badge === "NEW" && бежева.title === "Сумка Cream",
        `${бежева.price} / ${бежева.badge} / ${бежева.title}`);

    // Найтонше місце: перемикач кольору на картці мусить мати від чого
    // відштовхнутись, інакше поля змішаються (див. вимогу 3 у шапці).
    check("картка несе значення товару до перевизначень",
        бежева.colorBase && бежева.colorBase.price === 5000 && бежева.colorBase.badge === "TOP",
        JSON.stringify(бежева.colorBase));

    check("baseProduct повертає товарні значення",
        env.baseProduct(бежева).price === 5000 && env.baseProduct(бежева).title === "Сумка");

    // Перемикання з бежевого (своя ціна) на чорний (без своєї) мусить
    // ПОВЕРНУТИ ціну товару, а не лишити бежеву.
    const наЧорний = env.applyColorOverrides(env.baseProduct(бежева), { color: "Чорний" });
    check("перемикання на колір без перевизначень повертає ціну товару",
        наЧорний.price === 5000 && наЧорний.title === "Сумка",
        `${наЧорний.price} / ${наЧорний.title}`);

    // colorBase зберігає РІВНО перебиті поля — решти колір не торкався.
    check("у colorBase лише перебиті поля",
        Object.keys(бежева.colorBase).sort().join(",") === "badge,price,title",
        Object.keys(бежева.colorBase).join(","));
}

console.log("\n[6] Картка каталогу: свотч несе готовий вигляд свого кольору");
{
    const card = product => {
        const dom = new JSDOM("<!doctype html><body><div id='r'></div></body>",
            { runScripts: "outside-only", pretendToBeVisual: true });
        const { window } = dom;
        ["escapeHtml", "escapeAttrSingleQuoted", "getProductColors", "getVariantSizes",
            "getAllProductSizes", "getProductGenders", "getProductGenderLabel", "productUrl",
            "colorOverrides", "applyColorOverrides", "baseProduct"]
            .forEach(fn => window.eval(commonSrc.match(new RegExp("function " + fn + "[\\s\\S]*?\\n}\\n"))[0]));
        require(path.join(__dirname, "helpers/color-families")).installColorFamilies(window);
        window.eval(uiSrc.replace("function createProductCard(product) {",
            "window.PRODUCT_SIZES=['S','M'];window.formatPrice=v=>v+' грн';\nfunction createProductCard(product) {"));
        window.document.getElementById("r").innerHTML = window.createProductCard(product);
        return window.document;
    };

    const без = card({
        id: 1, title: "Сумка", brand: "Furla", price: 5000,
        variants: [{ color: "Чорний", hex: "#000", images: ["a.jpg"] },
                   { color: "Бежевий", hex: "#eee", images: ["b.jpg"] }]
    });
    check("без перевизначень атрибута немає",
        [...без.querySelectorAll(".mini-color")].every(b => !b.getAttribute("data-view")));

    const з = card({
        id: 2, title: "Сумка", brand: "Furla", price: 5000, badge: "TOP",
        variants: [{ color: "Чорний", hex: "#000", images: ["a.jpg"] },
                   { color: "Бежевий", hex: "#eee", images: ["b.jpg"], price: 7500, badge: "NEW" }]
    });

    const свотчі = [...з.querySelectorAll(".mini-color")];
    // Свотчів на картці ЧОТИРИ, а не два: createProductCard малює два
    // набори — звичайний під фото і дубль у hover-панелі поверх фото
    // (на десктопі). Обробник синхронізує їх у межах картки.
    check("атрибут є на ВСІХ свотчах, а не лише на перебитих",
        свотчі.length === 4 && свотчі.every(b => b.getAttribute("data-view")),
        свотчі.length + " свотчів: " + свотчі.map(b => !!b.getAttribute("data-view")).join(","));

    const бежевий = JSON.parse(свотчі[1].getAttribute("data-view"));
    check("вигляд бежевого несе свою ціну", /7500/.test(бежевий.price), бежевий.price);
    check("вигляд бежевого несе свою позначку", /NEW/.test(бежевий.badges), бежевий.badges);

    // Посилання несе колір — інакше клац по назві після перемикання
    // відкрив би не той відтінок.
    check("вигляд несе посилання з кольором", /color=/.test(бежевий.href), бежевий.href);

    const чорний = JSON.parse(свотчі[0].getAttribute("data-view"));
    check("вигляд чорного — значення товару, а не бежевого",
        /5000/.test(чорний.price) && /TOP/.test(чорний.badges),
        `${чорний.price} | ${чорний.badges}`);
}

console.log("\n[7] Сторінка товару");
{
    // Перевизначення мусять застосуватись ДО крихт і SEO: інакше
    // заголовок вкладки й og:title лишились би зі значеннями товару, а
    // сама сторінка показувала б значення кольору.
    // Шукаємо ВСЕРЕДИНІ renderProduct: назва updateProductSeoMetadata
    // уперше зустрічається як обʼява функції набагато вище, і порівняння
     // з нею нічого не означало б.
    const render = productSrc.slice(productSrc.indexOf("function renderProduct(product) {"));

    const порядок = [
        render.indexOf("product = applyColorOverrides(product, activeVariant)"),
        render.indexOf("updateProductSeoMetadata(product)")
    ];
    check("колір застосований до SEO", порядок[0] > 0 && порядок[0] < порядок[1], порядок.join(" / "));

    check("сторінка запамʼятовує товар до перевизначень",
        /const productBase = product;/.test(productSrc));

    check("вигляд кольору збирається від productBase, а не від перебитого",
        /pageColorView\(productBase, variant\)/.test(productSrc));

    check("атрибут ставиться лише коли є що перевизначати",
        /hasColorViews \? .*data-page-view/.test(productSrc));
}

console.log("\n[8] Перемикання кольору оновлює показане");
{
    // Обробник ОДИН на весь сайт (common.js) — і для картки каталогу,
    // і для сторінки товару.
    check("картка: назва, посилання, ціна, позначки, опис",
        /titleLink\.textContent = view\.title/.test(commonSrc)
        && /titleLink\.setAttribute\("href", view\.href\)/.test(commonSrc)
        && /priceBox\.innerHTML = view\.price/.test(commonSrc)
        && /badges\.innerHTML = view\.badges/.test(commonSrc)
        && /desc\.textContent = view\.description/.test(commonSrc));

    check("сторінка товару: заголовок, ціна, позначка, опис",
        /heading\.textContent = view\.title/.test(commonSrc)
        && /priceBox\.innerHTML = view\.priceBox/.test(commonSrc)
        && /badge\.textContent = view\.badge/.test(commonSrc)
        && /pageDesc\.textContent = view\.description/.test(commonSrc));

    // Опис мусить адресуватись ПОЗНАЧКОЮ, а не «першим .spec-plain».
    //
     // Так було спершу — і перемикання кольору затирало АРТИКУЛ описом:
    // у характеристиках чотири абзаци .spec-plain, і перший з них саме
    // артикул, а не опис.
    // Перевірка підрядком, а не регуляркою: селектор містить дужки й
    // дефіс, і в регулярці вони перетворювались на діапазон у класі
    // символів — вираз ставав недійсним, і тест падав на розборі.
    check("опис на сторінці адресується позначкою",
        commonSrc.includes('querySelector("[data-product-description]")')
        && productSrc.includes("data-product-description"));

    check("обробник не бере «перший .spec-plain»",
        !commonCode.includes('querySelector(".spec-plain")'));

    // Позначки могло не бути ні там, ні там — елемент і створюється, і ховається.
    check("позначка на сторінці створюється й ховається за потреби",
        /createElement\("span"\)/.test(commonSrc) && /badge\.hidden = !view\.badge/.test(commonSrc));

    // Розмітку збирають ui.js і product.js — кожен свою. Обробник лише
    // підставляє: друга копія правил про знижку розійшлася б із першою.
    check("обробник не рахує знижку сам",
        !/1 - .*price.*oldPrice/.test(commonSrc.slice(
            commonSrc.indexOf("colorBtn.dataset.view"),
            commonSrc.indexOf("Артикул свій у кожного кольору"))));
}

console.log("\n[9] Адмінка показує посилання на кожен колір");
{
    check("віджет рахує посилання по варіантах", /variants\.forEach/.test(widgetSrc));
    check("посилання несе ?color=", /\?color=/.test(widgetSrc));
    check("тільки при ввімкненому прапорці",
        /splitByColor && variants && variants\.size > 1/.test(widgetSrc));

    // Slug кольору мусить робити ТОЙ САМИЙ перетворювач, що й сайт —
    // своя копія транслітерації повела б посилання в нікуди.
    check("slug кольору — спільний перетворювач", /window\.Translit\.toSlug/.test(widgetSrc));
    check("translit.js підключений в адмінці", /assets\/js\/translit\.js/.test(adminIndex));
    check("підключений ДО віджета посилань",
        adminIndex.indexOf("translit.js") < adminIndex.indexOf("order-link-widget.js"));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");
process.exit(failures ? 1 : 0);
