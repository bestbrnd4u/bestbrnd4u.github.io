// Каталог: посилання, яке відкривається таким, яким його скопіювали,
// і повернення на те саме місце кнопкою «Назад».
//
// ДВА СИМПТОМИ, ЯКІ ЦЕ ЗАКРИВАЄ
//
// 1. Скопійоване посилання відкривалось із порожніми фільтрами. В адресу
//    писались лише section, gender і page; колір, розмір, ціна й
//    сортування не писались зовсім, а бренд і категорія читались, але
//    по ОДНОМУ значенню. Людина надсилала добірку — інша людина бачила
//    весь каталог.
//
// 2. «Назад» зі сторінки товару відкривав каталог спочатку: фільтри
//    скидались, і треба було гортати заново. Тепер стан лежить в
//    адресі, а картка, з якої пішли, запамʼятовується окремо.
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
const css = read("assets/css/style.css");

console.log("\n[1] В адресу потрапляє ВЕСЬ стан каталогу");
{
    // те, чого раніше в адресі не було взагалі
    [
        ["категорія", "category"],
        ["бренд", "brand"],
        ["колір", "color"],
        ["розмір", "size"],
        ["сортування", "sort"],
        ["ціна від", "priceMin"],
        ["ціна до", "priceMax"]
    ].forEach(([label, key]) => {
        check(`${label} зберігається в адресі`,
            new RegExp(`${key}:\\s*"${key}"`).test(catalog));
    });

    check("усе пишеться одним місцем (syncStateToUrl)",
        /function syncStateToUrl\(\)/.test(catalog));

    // Кожне клацання по чекбоксу не має додавати запис в історію:
    // інакше «Назад» довелось би тиснути стільки разів, скільки було
    // змін фільтра, замість одного разу — щоб вийти з каталогу.
    check("replaceState, а не pushState",
        /history\.replaceState/.test(catalog) && !/history\.pushState/.test(catalog));

    check("порожні значення прибираються з адреси",
        /function setOrDelete/.test(catalog) && /params\.delete\(key\)/.test(catalog));
}

console.log("\n[2] Стан із адреси читається назад");
{
    check("множинні значення читаються списком", /function readSetParam/.test(catalog));
    check("бренди читаються списком, а не одним значенням",
        /readSetParam\(new URLSearchParams\(location\.search\), "brand"\)/.test(catalog));
    check("категорії теж (це ж і бічне меню каталогу)",
        /readSetParam\(new URLSearchParams\(location\.search\), "category"\)/.test(catalog));

    check("колір і розмір читаються з адреси",
        /selectedColors = readSetParam\(params, "color"\)/.test(catalog)
        && /selectedSizes = readSetParam\(params, "size"\)/.test(catalog));
    check("сортування читається з адреси", /const sort = params\.get\("sort"\)/.test(catalog));
    check("ціна читається з адреси", /readNumberParam\(params, "priceMin"\)/.test(catalog));

    // Стан застосувати мало — його треба ще показати. Списки кольорів і
    // розмірів будуються пізніше за читання адреси, тож без цього кроку
    // товари відфільтровані, а фільтри виглядають незайманими.
    check("прочитане відображається в інтерфейсі",
        /function applyUiFromUrlState/.test(catalog));
    check("виклик стоїть після заповнення фільтрів",
        catalog.indexOf("applyUiFromUrlState()") > catalog.indexOf("fillSizeGroups()"));

    // Підроблена або застаріла адреса не повинна давати порожній
    // каталог без жодного видимого фільтра.
    check("невідомі значення відкидаються", /known\.has\(value\)/.test(catalog));
    check("невідоме сортування скидається",
        /currentSort = "";\s*\/\/ невідоме сортування/.test(catalog));
}

console.log("\n[3] Ціна пишеться тільки якщо її справді рухали");
{
    // Інакше посилання тягло б за собою межі СЬОГОДНІШНЬОГО асортименту,
    // і завтра, коли зʼявиться дорожчий товар, воно б його ховало.
    check("порівнюється з межами асортименту",
        /priceRange\.min !== priceBounds\.min/.test(catalog)
        && /priceRange\.max !== priceBounds\.max/.test(catalog));
}

console.log("\n[4] Повернення на ту саму картку");
{
    check("картка запамʼятовується при переході", /function rememberCatalogPosition/.test(catalog));
    check("і відновлюється після рендера", /function restoreCatalogPosition/.test(catalog));
    check("відновлення викликається після render()",
        catalog.indexOf("restoreCatalogPosition()") > catalog.indexOf("bindCatalogReturnTracking()"));

    // Запамʼятовуємо КАРТКУ, а не пікселі: пікселі брешуть, щойно
    // зміниться кількість товарів у рядку (інший екран, поворот).
    check("запамʼятовується id товару, а не позиція скролу",
        /id: String\(productId\)/.test(catalog) && !/scrollY.*sessionStorage/.test(catalog));

    // Якщо людина повернулась у каталог з ІНШИМИ фільтрами, стрибати
    // на стару картку не можна — її там може не бути.
    check("адреса звіряється перед стрибком",
        /saved\.search !== location\.search/.test(catalog));

    // Одноразово: інакше кожен наступний вхід у каталог смикав би
    // сторінку до давно переглянутого товару.
    check("позиція зчитується одноразово",
        /sessionStorage\.removeItem\(RETURN_KEY\)/.test(catalog));

    check("сесія, а не назавжди",
        /sessionStorage\.setItem\(RETURN_KEY/.test(catalog)
        && !/localStorage\.setItem\(RETURN_KEY/.test(catalog));

    // клац по «серденьку» — це не перехід у товар
    check("кнопки в картці не рахуються переходом",
        /event\.target\.closest\("button"\)/.test(catalog));

    check("картку видно після повернення", /just-returned/.test(catalog));
    check("є підсвітка", /\.product-card\.just-returned\{/.test(css));
    check("підсвітка вимикається при prefers-reduced-motion",
        /prefers-reduced-motion:reduce\)\{\s*\.product-card\.just-returned/.test(css));
}

console.log("\n[5] Хлібні крихти читаються як доріжка");
{
    // Роздільник «→» з відступом 8px зливав сусідні пункти в один рядок
    // тексту — де закінчується одна ланка й починається наступна, на око
    // не читалось.
    check("роздільник має повітря з боків", /\.breadcrumbs \.crumb-sep\{[\s\S]{0,220}margin:0 12px/.test(css));
    check("роздільник — риска, а не стрілка",
        /\.breadcrumbs \.crumb-sep::before\{[\s\S]{0,120}content:"–"/.test(css));

    check("поточна сторінка виділена", /\.breadcrumbs \.crumb-current\{/.test(css));
    check("на сторінці товару теж", /id="breadTitle" class="crumb-current"/.test(read("product.html")));
    check("у каталозі теж", /crumb-current/.test(catalog));
}

console.log("\n[6] Повний шлях у крихтах товару");
{
    const Breadcrumbs = require("../assets/js/breadcrumbs.js");

    const product = {
        title: "Сонцезахисні окуляри Jimmy Choo",
        brand: "Jimmy Choo",
        category: "Окуляри і оправи",
        gender: ["Жінкам"]
    };

    const trail = Breadcrumbs.buildTrail(product, {
        departmentOf: name => name === "Окуляри і оправи" ? "Аксесуари" : ""
    });

    check("шлях повний, а не «Головна – Каталог – Назва»",
        trail.map(c => c.label).join(" – ")
            === "Головна – Каталог – Жінкам – Аксесуари – Окуляри і оправи – Jimmy Choo – "
            + product.title,
        trail.map(c => c.label).join(" – "));

    check("товар — остання ланка й без посилання",
        trail[trail.length - 1].current === true && trail[trail.length - 1].href === null);

    // Ланки стали робочими лише тому, що каталог навчився читати
    // фільтри з адреси. Без цього доріжка була б декоративною.
    check("стать веде у каталог із фільтром",
        trail[2].href === "catalog?gender=" + encodeURIComponent("Жінкам"), trail[2].href);
    check("бренд теж", /^catalog\?brand=/.test(trail[5].href));

    // Спершу відділ вів у каталог з перелічуванням усіх своїх категорій —
    // виходило посилання на 700 символів, яке ще й мінялось щоразу, коли
    // в адмінці додавали категорію.
    check("відділ має короткий власний параметр",
        trail[3].href === "catalog?department=" + encodeURIComponent("Аксесуари"), trail[3].href);
    // Головна ознака — у посиланні ОДНА назва, а не перелік категорій:
    // кирилиця в percent-encoding і так роздуває довжину втричі, тож
    // міряти самі символи було б крихко.
    check("у посиланні відділу не перелік категорій",
        !trail[3].href.includes("%2C") && !trail[3].href.includes(","), trail[3].href);
    check("посилання відділу лишається коротким",
        trail[3].href.length < 120, trail[3].href.length);

    check("каталог знає фільтр department",
        /department: "department"/.test(catalog) && /selectedDepartments/.test(catalog));
    check("невідомий відділ з адреси відкидається",
        /selectedDepartments\.delete\(name\)/.test(catalog));

    // Без переліку категорій ланка відділу просто пропускається,
    // а доріжка лишається коректною.
    const noDept = Breadcrumbs.buildTrail(product, {});
    check("без даних про відділ доріжка не ламається",
        noDept.map(c => c.label).indexOf("Аксесуари") === -1 && noDept.length === 6);

    // товар може бути і жіночий, і чоловічий — доріжка описує ОДИН шлях
    check("з кількох статей береться одна",
        Breadcrumbs.buildTrail({ title: "X", gender: ["Жінкам", "Чоловікам"] }, {})
            .filter(c => c.label === "Чоловікам").length === 0);

    // розмітка для Google мусить збігатися з тим, що видно на сторінці
    const ld = Breadcrumbs.toJsonLd(trail, "https://bestbrnd4u.com", "https://bestbrnd4u.com/p/x/");
    check("BreadcrumbList будується з тієї самої доріжки",
        ld.itemListElement.length === trail.length);
    check("позиції поспіль з 1",
        ld.itemListElement.every((c, i) => c.position === i + 1));
    check("останній пункт — канонічна адреса товару",
        ld.itemListElement[ld.itemListElement.length - 1].item === "https://bestbrnd4u.com/p/x/");

    // один будівник на всі три місця — інакше Google показував би шлях,
    // якого на сторінці немає
    const generator = read("scripts/build-product-pages.js");
    check("генератор бере доріжку зі спільного файлу",
        /require\("\.\.\/assets\/js\/breadcrumbs\.js"\)/.test(generator));
    check("розмітка сторінки й BreadcrumbList з одного джерела",
        /Breadcrumbs\.toJsonLd\(trailFor\(product\)/.test(generator)
        && /trailFor\(product\)\.map/.test(generator));
    check("сторінка товару теж", /window\.Breadcrumbs\.buildTrail/.test(read("assets/js/product.js")));

    check("довга доріжка прокручується на телефоні",
        /\.breadcrumbs \.container\{[\s\S]{0,200}overflow-x:auto/.test(css));
}

console.log("\n[7] Фільтр ціни не вмикається сам");
{
    // СИМПТОМ: каталог, новинки й акції відкривались із «Знайдено 0
    // товарів», в активних фільтрах висіло «4 000 – 0 грн», а в адресі
    // зʼявлявся ?priceMax=0 — на чистому посиланні, без жодного кліку.
    //
    // ПРИЧИНА: readNumberParam робив Number(params.get(key)) — а коли
    // параметра немає, get() повертає null, і Number(null) — це 0.
    // Перевірка isFinite && >= 0 нуль пропускала, тож priceRange.max
    // ставав 0 на кожному відкритті. setupPriceRange() потім затискав
    // діапазон межами асортименту й отримував min 4000 / max 0.
    const src = catalog.match(/function readNumberParam\(params, key\) \{[\s\S]*?\n\}/)[0];

    const readNumberParam = new Function("params", "key",
        src.replace(/^function readNumberParam\(params, key\) \{/, "") .replace(/\}$/, ""));

    const at = query => new URLSearchParams(query);

    check("без параметра — null, а не 0",
        readNumberParam(at(""), "priceMax") === null,
        String(readNumberParam(at(""), "priceMax")));

    check("порожнє значення — теж null",
        readNumberParam(at("priceMax="), "priceMax") === null);

    check("справжній нуль читається як нуль",
        readNumberParam(at("priceMax=0"), "priceMax") === 0);

    check("нормальне число читається", readNumberParam(at("priceMax=5000"), "priceMax") === 5000);
    check("сміття відкидається", readNumberParam(at("priceMax=abc"), "priceMax") === null);
    check("відʼємне відкидається", readNumberParam(at("priceMax=-5"), "priceMax") === null);

    // null означає «межі не чіпали» — і setupPriceRange розтягує
    // діапазон на весь асортимент, тобто в полі «до» стоїть ціна
    // найдорожчого товару
    check("null означає «не чіпали» і діапазон стає повним",
        /if \(priceRange\.max === null\) priceRange\.max = priceBounds\.max/.test(catalog));

    check("фільтр вважається активним, лише якщо діапазон звужено",
        /priceRange\.min > priceBounds\.min \|\| priceRange\.max < priceBounds\.max/.test(catalog));

    // і тоді syncStateToUrl нічого не пише — адреса лишається чистою
    check("незмінена ціна не потрапляє в адресу",
        /priceRange\.max !== priceBounds\.max/.test(catalog));

    // та сама пастка не має жити поруч у другій копії
    check("сторінка теж читається безпечно",
        /readNumberParam\(new URLSearchParams\(location\.search\), "page"\)/.test(catalog));
    // дивимось на КОД, а не на пояснення: у коментарі до
    // readNumberParam ця пастка згадується навмисно
    const code = catalog.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

    check("прямого Number(params.get(…)) у каталозі не лишилось",
        !/Number\(params\.get\(/.test(code) && !/Number\(new URLSearchParams/.test(code));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
