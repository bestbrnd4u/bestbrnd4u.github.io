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

    // Колір читається через сім'ї: фільтр зберігає в адресі сім'ю
    // («?color=Чорний»), а старі посилання несуть назву з даних
    // («?color=Black»). Без перетворення старе посилання відкривало б
    // каталог із порожнім фільтром — keepKnown() викинув би невідоме
    // значення, і людина не зрозуміла б, чому фільтр не застосувався.
    check("колір і розмір читаються з адреси",
        /readSetParam\(params, "color"\)/.test(catalog)
        && /selectedSizes = readSetParam\(params, "size"\)/.test(catalog));

    // Зведення до сімʼї переїхало з readUrlState() у resolveUrlTokens():
    // в адресі тепер латиниця («?color=chornyi»), і зводити до сімʼї є
    // сенс лише для того, чого не впізнали за slug-ом, — тобто для
    // старих посилань на кшталт ?color=Black.
    check("колір з адреси зводиться до сім'ї",
        /families\.has\(value\) \? value : colorFamily\(value\)/.test(catalog));
    check("сортування читається з адреси", /const sort = params\.get\("sort"\)/.test(catalog));
    check("ціна читається з адреси", /readNumberParam\(params, "priceMin"\)/.test(catalog));

    // Стан застосувати мало — його треба ще показати. Списки кольорів і
    // розмірів будуються пізніше за читання адреси, тож без цього кроку
    // товари відфільтровані, а фільтри виглядають незайманими.
    check("прочитане відображається в інтерфейсі",
        /function applyUiFromUrlState/.test(catalog));
    // Порядок звіряємо ВСЕРЕДИНІ initCatalog, а не по всьому файлу:
    // indexOf по файлу знаходив оголошення функції, а не її виклик, і
    // перевірка залежала від того, у якому місці файлу лежить код.
    const init = catalog.slice(catalog.indexOf("async function initCatalog"));

    const порядок = name => init.indexOf(name);

    check("виклик стоїть після заповнення фільтрів",
        порядок("applyUiFromUrlState()") > порядок("fillSizeGroups()"),
        `applyUiFromUrlState ${порядок("applyUiFromUrlState()")}, `
        + `fillSizeGroups ${порядок("fillSizeGroups()")}`);

    // Переклад латиниці з адреси мусить стояти ДО будь-якого
    // фільтрування й до розкладки фільтрів: далі каталог порівнює
    // значення як є («Чорний»), а не токен із адреси («chornyi»).
    check("переклад адреси — одразу після завантаження товарів",
        порядок("resolveUrlTokens()") > 0
        && порядок("resolveUrlTokens()") < порядок("fillColors()"),
        `resolveUrlTokens ${порядок("resolveUrlTokens()")}, `
        + `fillColors ${порядок("fillColors()")}`);

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
    // Кожна ланка НАКОПИЧУВАЛЬНА: несе все, що лівіше.
    //
    // Спершу «Balenciaga» відкривала catalog?brand=Balenciaga — і від
    // шляху лишався один бренд: ні статі, ні відділу, ні категорії в
    // фільтрах не було. Людина клацала бренд усередині «Окуляри і
    // оправи», а бачила всі товари бренду.
    const q = href => new URLSearchParams(String(href).split("?")[1] || "");

    check("відділ несе стать",
        q(trail[3].href).get("gender") === "Жінкам"
        && q(trail[3].href).get("department") === "Аксесуари", trail[3].href);

    // Відділ зникає, щойно зʼявилась категорія — вона лежить усередині
    // нього, тож разом вони зайві. Ба більше: у каталозі відділ і
    // категорія додаються як АБО, і посилання «Аксесуари + Окуляри»
    // розкрило б увесь відділ замість самих окулярів.
    check("категорія несе стать, але не відділ",
        q(trail[4].href).get("category") === "Окуляри і оправи"
        && q(trail[4].href).get("gender") === "Жінкам"
        && !q(trail[4].href).get("department"),
        trail[4].href);

    check("бренд несе шлях без зайвого відділу",
        ["gender", "category", "brand"].every(k => q(trail[5].href).get(k))
        && !q(trail[5].href).get("department"),
        trail[5].href);

    // Відділ має власний короткий параметр: спершу він вів у каталог із
    // перелічуванням усіх своїх категорій через кому — виходило
    // посилання на 700 символів, яке ще й мінялось щоразу, коли в
    // адмінці додавали категорію.
    check("у посиланні відділу не перелік категорій",
        !q(trail[3].href).get("department").includes(","),
        q(trail[3].href).get("department"));

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

console.log("\n[8] Відділ у бічному меню — фільтр, а не лише розгортання");
{
    // Заголовок відділу був однією кнопкою, яка тільки розгортала
    // список: відфільтрувати на «Аксесуари» було нічим, хоча в хлібних
    // крихтах це повноцінна ланка. Тепер назва фільтрує, а «+/−»
    // лишається окремою кнопкою-перемикачем.
    check("назва відділу — окрема кнопка-фільтр",
        /data-sidebar-department=/.test(catalog));
    check("«+/−» лишився окремим перемикачем",
        /class="sidebar-group-toggle"[\s\S]{0,140}data-sidebar-group-toggle/.test(catalog));
    check("у перемикача є підпис для зчитувача",
        /aria-label="\$\{isCollapsed \? "Розгорнути" : "Згорнути"\}/.test(catalog));

    check("клік по відділу фільтрує", /function toggleDepartment/.test(catalog));
    check("стан відділу оновлюється при перемальовці",
        /aria-pressed", isActive \? "true" : "false"/.test(catalog));

    // Відділ могли обрати хлібною крихтою — тоді група має розгорнутись,
    // інакше фільтр застосований, а звідки він узявся, у меню не видно.
    check("група розгортається, якщо відділ обрано ззовні",
        /Відділ могли обрати не тут/.test(catalog));

    check("відділ показується серед активних фільтрів",
        /type: "department", value: department/.test(catalog));
    check("чіп відділу знімається", /type === "department"/.test(catalog));
    check("«Скинути фільтри» скидає й відділ", /selectedDepartments\.clear\(\)/.test(catalog));
    check("відділ рахується у лічильнику фільтрів",
        /\+ selectedDepartments\.size/.test(catalog));

    check("є стилі роздільного заголовка",
        /\.sidebar-group-head\{/.test(css) && /\.sidebar-group-toggle\{/.test(css));
    check("обраний відділ підсвічений", /\.sidebar-group-title\.active\{/.test(css));
}

console.log("\n[9] Кнопка «Назад» у хлібних крихтах");
{
    const product = read("assets/js/product.js");
    const breadcrumbs = read("assets/js/breadcrumbs.js");
    const cssText = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");

    // Розмітка одна на всі три місця: шаблон, генератор статичних
    // сторінок і рантайм. Три копії розійшлися б.
    check("кнопка описана в спільному модулі", /BACK_HTML/.test(breadcrumbs));
    check("рантайм бере її звідти", /window\.Breadcrumbs\.BACK_HTML/.test(product));
    check("генератор теж", /Breadcrumbs\.BACK_HTML/.test(read("scripts/build-product-pages.js")));
    check("є в шаблоні сторінки товару", /data-crumb-back/.test(read("product.html")));

    // Прилипає до лівого краю: доріжку на телефоні прокручено вправо,
    // і без sticky кнопка виїхала б за кадр.
    check("кнопка прилипає до краю",
        /\.crumb-back\{[\s\S]{0,400}position:sticky/.test(cssText));
    check("під нею є тло",
        /\.crumb-back\{[\s\S]{0,500}background:#f7f7f7/.test(cssText));

    // На телефоні показуємо кінець доріжки — назву товару.
    check("доріжка прокручується до кінця", /function scrollBreadcrumbsToEnd/.test(product));
    check("тільки якщо не влазить",
        /host\.scrollWidth <= host\.clientWidth\) return/.test(product));
}

console.log("\n[9b] Поведінка кнопки — на живому DOM");
{
    const { JSDOM } = require("jsdom");

    const handler = read("assets/js/product.js")
        .match(/document\.addEventListener\("click", event => \{\s*\n\s*const back[\s\S]*?\n\}\);/)[0];

    const run = options => {

        const dom = new JSDOM(
            '<a href="catalog" class="crumb-back" data-crumb-back>Назад</a>',
            Object.assign({
                url: "https://dev.bestbrnd4u.com/p/x/",
                runScripts: "outside-only",
                pretendToBeVisual: true
            }, options));

        const w = dom.window;
        let wentBack = false;

        w.history.back = () => { wentBack = true; };
        w.eval(handler);

        const event = new w.MouseEvent("click", { bubbles: true, cancelable: true });

        w.document.querySelector("a").dispatchEvent(event);

        return { wentBack, prevented: event.defaultPrevented };

    };

    // Прийшли з каталогу — це справжнє «назад»: браузер поверне і
    // фільтри, і позицію картки (restoreCatalogPosition).
    const fromCatalog = run({ referrer: "https://dev.bestbrnd4u.com/catalog?brand=Coach" });

    check("з каталогу — повертає назад по історії", fromCatalog.wentBack);
    check("і не переходить за href", fromCatalog.prevented);

    // Прийшли з пошуку — історії сайту немає, і history.back() виніс би
    // людину ЗІ САЙТУ. Має спрацювати звичайне посилання на каталог.
    const fromGoogle = run({ referrer: "https://www.google.com/" });

    check("з Google — не смикає історію", !fromGoogle.wentBack);
    check("працює як звичайне посилання", !fromGoogle.prevented);

    // Відкрили напряму (месенджер, збережене посилання) — так само.
    const direct = run({});

    check("прямий вхід — не смикає історію", !direct.wentBack);
    check("теж працює як посилання", !direct.prevented);
}

console.log("\n[10] Відділ і категорія — один фільтр (АБО)");
{
    // СИМПТОМ: у бічному меню відмітили «Взуття», «Аксесуари» і три
    // категорії сумок — каталог показав нуль товарів. Бо відділ і
    // категорія працювали як І: товар мусив бути одночасно взуттям і
    // сумкою, а таких не буває.
    //
    // Правильно як у решті фільтрів: кілька значень ОДНОГО фільтра
    // розширюють вибірку, і лише різні фільтри звужують її разом.
    check("відділ і категорія складаються, а не перетинаються",
        /selectedCategories\.has\(product\.category\)\s*\n\s*\|\| selectedDepartments\.has/.test(catalog));

    check("умова спрацьовує, якщо обрано хоч щось одне",
        /\(selectedCategories\.size \|\| selectedDepartments\.size\)/.test(catalog));

    // Перевіряємо на справжніх даних той самий випадок із репорту
    const products = JSON.parse(read("data/products.json"));
    const categories = JSON.parse(read("data/categories.json"));

    const departmentOf = new Map();

    categories.forEach(c => departmentOf.set(c.name, c.department));

    const match = (departments, cats) => {

        const D = new Set(departments);
        const C = new Set(cats);

        return products.filter(p =>
            C.has(p.category) || D.has(departmentOf.get(p.category))).length;

    };

    const reported = match(["Взуття", "Аксесуари"],
        ["Унісекс сумки", "Чоловічі сумки", "Жіночі сумки"]);

    check("випадок із репорту більше не порожній", reported > 0, reported);

    // і сума збігається: обрано все, що є
    check("обрано всі розділи — видно весь каталог",
        match(["Сумки", "Взуття", "Аксесуари"], []) === products.length,
        `${match(["Сумки", "Взуття", "Аксесуари"], [])} з ${products.length}`);

    // одна категорія лишається однією категорією, а не цілим відділом
    const onlyWomen = match([], ["Жіночі сумки"]);
    const wholeBags = match(["Сумки"], []);

    check("одна категорія не розкриває весь відділ",
        onlyWomen < wholeBags, `${onlyWomen} проти ${wholeBags}`);
}

console.log("\n[11] Автоскрол показує застосовані фільтри");
{
    // Скрол цілив у рядок «Знайдено N товарів», а панель із чипами
    // стоїть ВИЩЕ — після застосування фільтра вона опинялась за
    // верхнім краєм екрана. Людина щойно щось відмітила, а результату
    // своєї дії не бачить: ні що обрано, ні кнопки «Скинути фільтри».
    check("ціль скролу — панель активних фільтрів",
        /getElementById\("activeFiltersBar"\)/.test(catalog));

    check("панель має бути справді видимою",
        /!filtersBar\.hidden[\s\S]{0,120}display !== "none"/.test(catalog));

    // Коли фільтрів немає, панель схована — тоді, як і раніше,
    // цілимось у рядок із кількістю знайденого.
    check("без фільтрів працює як раніше",
        /visibleFiltersBar \|\| catalogTop \|\| firstCard \|\| grid/.test(catalog));
}

console.log("\n[N] Пагінація: рахунок і «Показати ще»");
{
    // НАВІЩО
    // -------
    // Нумерація не каже, скільки товарів усього й скільки вже видно.
    // А кнопка без рахунку — навмання: незрозуміло, там ще два товари
    // чи двісті.
    //
    // Тому обидва разом: кнопка для «мало, дай ще», номери — для
    // «хочу стрибнути далеко». Вони не конкурують.
    check("є рахунок показаного", /class="pagination-counter"/.test(catalog));
    check("рахунок називає обидва числа",
        /\$\{seen\} з \$\{count\} товарів/.test(catalog));

    // Рахунок мусить називати те, що ВИДНО НА ЕКРАНІ.
    //
    // Раніше туди йшло from + shown.length — «скільком товарам від
    // початку списку дійшла черга». На другій сторінці видно 24 картки,
    // а рахунок писав «48 з 85»: число не сходилось ні з чим, що видно.
    check("рахунок = карток на екрані",
        /renderPagination\(list\.length, shown\.length, from \+ shown\.length\)/.test(catalog));

    // На другій і далі сторінках — діапазон: «25–48 з 85» одразу знімає
    // питання, чому товарів 24, а не 48.
    check("на не-першій сторінці показується діапазон",
        /firstShownIndex > 1/.test(catalog)
        && /\$\{firstShownIndex\}–\$\{lastShownIndex\} з \$\{count\} товарів/.test(catalog));

    check("є кнопка «Показати ще»", /class="pagination-more"/.test(catalog));

    // Кнопка мусить зникати, коли показано все — інакше вона обіцяє
    // те, чого немає.
    // «Ще» рахується від КІНЦЯ показаного відрізка, а не від кількості
    // карток на екрані: на другій сторінці видно 24 товари, але позаду
    // вже 24 інших — кнопка стосується лише того, що попереду.
    check("кнопка лише коли є що показувати",
        /const hasMore = lastShownIndex < count/.test(catalog)
        && /hasMore\s*\n?\s*\? `<button[^`]*pagination-more/.test(catalog));

    // Кнопка ДОПИСУЄ, номер — ПЕРЕХОДИТЬ. Різні задачі.
    check("кнопка додає порцію", /extraPages \+= 1/.test(catalog));
    check("номер сторінки скидає дописане",
        /\/\/ Номер сторінки[\s\S]{0,200}extraPages = 0;[\s\S]{0,80}currentPage = Number/.test(catalog));

    // Після «Показати ще» прокручувати НЕ треба: людина стоїть біля
    // кнопки й дивиться, що зʼявилось.
    check("після додавання сторінка не стрибає",
        /if \(moreBtn\) \{[\s\S]{0,200}render\(\);\s*\n\s*return;/.test(catalog));

    // Зміна фільтра теж скидає: інакше лишалось би «показано 72 з 5».
    check("зміна фільтра скидає дописане",
        /currentPage = 1;[\s\S]{0,300}extraPages = 0;/.test(catalog));

    // Зріз мусить враховувати дописані порції.
    check("показується (1 + додані) сторінок",
        /PER_PAGE \* \(1 \+ extraPages\)/.test(catalog));

    // Арифметика на числах: 85 товарів по 24 на сторінку.
    const PER = 24;

    const state = (total, page, extra) => {

        const from = (page - 1) * PER;
        const shown = Math.min(from + PER * (1 + extra), total) - from;
        const seen = Math.min(from + shown, total);

        return { seen, hasMore: seen < total };

    };

    check("перша сторінка — 24 з 85", state(85, 1, 0).seen === 24);
    check("після одного «ще» — 48", state(85, 1, 1).seen === 48);
    check("після трьох — усі 85", state(85, 1, 3).seen === 85);
    check("коли все показано, кнопки немає", state(85, 1, 3).hasMore === false);
    check("зайве натискання не ламає рахунок", state(85, 1, 9).seen === 85);

    // Остання сторінка неповна — рахунок не має її перебільшувати.
    check("остання сторінка: 85 з 85", state(85, 4, 0).seen === 85);
    check("і кнопки там немає", state(85, 4, 0).hasMore === false);

    // Підсвічена — ОСТАННЯ завантажена сторінка, а не перша.
    //
    // ЧОМУ. «Показати ще» дописує порцію знизу, і на екрані сторінки
    // 1–2. Якщо підсвічена лишається перша, номери брешуть: людина вже
    // прогорнула другу, а каталог показує, що вона на першій. І стрілка
    // «далі» веде на другу — ту, що вже видно.
    check("активна = поточна + дописані",
        /const activePage = Math\.min\(currentPage \+ extraPages, total\)/.test(catalog));
    check("підсвітка по activePage",
        /n === activePage \? " active" : ""/.test(catalog));

    // Проміжні сторінки позначені тихо: якщо натиснути «ще» тричі, на
    // екрані 1–4, і без позначки незрозуміло, чому під активною
    // четвіркою стоять товари з першої.
    check("показані раніше позначені",
        /n >= currentPage && n < activePage \? " is-loaded" : ""/.test(catalog));

    // Стрілки рахуються від активної: «далі» веде на наступну ЩЕ НЕ
    // показану.
    check("стрілки від активної сторінки",
        /data-page="\$\{activePage - 1\}"/.test(catalog)
        && /data-page="\$\{activePage \+ 1\}"/.test(catalog));
    check("стрілки вимикаються по краях",
        /activePage === 1 \? "disabled"/.test(catalog)
        && /activePage === total \? "disabled"/.test(catalog));

    // Арифметика на числах: 85 товарів по 24 = 4 сторінки.
    const pageState = (page, extra, total = 4) => {

        const active = Math.min(page + extra, total);

        const loaded = [];

        for (let n = page; n < active; n++) loaded.push(n);

        return { active, loaded };

    };

    check("без додавань активна — перша", pageState(1, 0).active === 1);
    check("після одного «ще» активна — друга", pageState(1, 1).active === 2);
    check("і перша позначена як показана",
        pageState(1, 1).loaded.join(",") === "1");
    check("після трьох активна — четверта", pageState(1, 3).active === 4);
    check("позначені 1,2,3", pageState(1, 3).loaded.join(",") === "1,2,3");

    // Зайві натискання не виводять активну за межі.
    check("більше сторінок не буває", pageState(1, 9).active === 4);

    // Клац по номеру скидає дописане — активна саме та, куди пішли.
    check("перехід на сторінку 3 нічого не позначає",
        pageState(3, 0).loaded.length === 0 && pageState(3, 0).active === 3);

    // Стилі: номери лишаються в рядок під кнопкою.
    const css = read("assets/css/style.css");

    check("є стиль показаних сторінок",
        /\.pagination-page\.is-loaded\{/.test(css));

    check("номери окремою групою", /\.pagination-pages\{[^}]*display:flex/.test(css));
    check("блок став вертикальним",
        /\.pagination\{[^}]*flex-direction:column/.test(css));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
