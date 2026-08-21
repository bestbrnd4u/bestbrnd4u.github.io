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

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
