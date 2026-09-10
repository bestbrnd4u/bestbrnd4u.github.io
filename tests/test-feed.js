// Товарний фід (feed.xml) для Google Merchant Center і каталогу Meta.
//
// ЧОМУ ЦЕ ВАРТО ПЕРЕВІРЯТИ САМЕ ТЕСТОМ
// -------------------------------------
// Фід — єдиний файл у проєкті, який читає МАШИНА чужої компанії й
// відповідає на помилки не одразу. Зламаний рядок не «виглядає
// криво»: товар просто зникає з Покупок, а лист із Merchant Center
// приходить через кілька днів і пише «Invalid value» без номера
// рядка. Тому кожне правило фіда закріплене тут.
//
// ЩО ПЕРЕВІРЯЄМО
// ---------------
// 1. XML справді розбирається (не пошуком підрядків, а парсером).
// 2. Обов'язкові поля Google є в КОЖНІЙ позиції.
// 3. Наявність у фіді збігається з правилами залишків сайту — фід не
//    сміє обіцяти те, чого на сайті вже немає.
// 4. Знижка йде парою price/sale_price, а не однією зниженою ціною.
// 5. Ідентифікатори унікальні й стабільні, кольори зшиті в групу.
// 6. Адреси абсолютні й ведуть на потрібний колір і розмір.
// 7. Фід збирається в ланцюжку npm run build і комітиться в CI.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const feed = require("../scripts/build-feed.js");
const Stock = require("../assets/js/stock.js");

const products = JSON.parse(read("data/products.json"));
const categories = JSON.parse(read("data/categories.json"));

const SITE = "https://bestbrnd4u.com";

const { items, skipped } = feed.feedItems(products, feed.departmentIndex(categories), SITE);
const xml = feed.buildFeed(items, SITE);

console.log("\n[1] XML розбирається парсером");
{
    const dom = new JSDOM(xml, { contentType: "text/xml" });
    const doc = dom.window.document;

    check("немає помилок розбору",
        !doc.querySelector("parsererror"),
        doc.querySelector("parsererror") && doc.querySelector("parsererror").textContent.slice(0, 120));

    check("це RSS 2.0 з простором імен Google",
        doc.documentElement.nodeName === "rss"
        && doc.documentElement.getAttribute("xmlns:g") === "http://base.google.com/ns/1.0");

    const parsed = [...doc.querySelectorAll("item")];

    check(`позицій у файлі — ${parsed.length}`, parsed.length === items.length, parsed.length);

    check("амперсандів без екранування немає",
        !/&(?!amp;|lt;|gt;|quot;|#)/.test(xml));

    dom.window.close();
}

console.log("\n[1b] Небезпечні символи в даних не ламають фід");
{
    // «Dolce & Gabbana» — питання часу, а один неекранований амперсанд
    // валить УВЕСЬ файл: Merchant Center відповідає «feed could not be
    // parsed» і не вантажить жодного товару. У живих даних такого
    // бренду поки немає, тож перевіряємо на вигаданому.
    const nasty = [{
        id: 999,
        slug: "test-amp",
        title: 'Сумка Dolce & Gabbana <b>"нова"</b>',
        description: "Опис із & і <тегом> та лапками \"так\".",
        brand: "Dolce & Gabbana",
        price: 1000,
        category: "Сумки",
        gender: ["Жінкам"],
        variants: [{
            color: "Чорний & білий",
            sku: "A&B-1",
            article: "999-1",
            images: ["/assets/images/products/uploads/x.webp?v=1&crop=2"],
            sizes: ["ONESIZE"]
        }]
    }];

    const built = feed.buildFeed(feed.feedItems(nasty, new Map(), SITE).items, SITE);

    const dom = new JSDOM(built, { contentType: "text/xml" });
    const doc = dom.window.document;

    check("файл із «&», «<» і лапками розбирається",
        !doc.querySelector("parsererror"),
        doc.querySelector("parsererror") && doc.querySelector("parsererror").textContent.slice(0, 100));

    const item = doc.querySelector("item");

    check("назва доїхала без спотворень",
        item && item.querySelector("title").textContent === 'Сумка Dolce & Gabbana <b>"нова"</b>',
        item && item.querySelector("title").textContent);

    check("адреса фото з двома параметрами ціла",
        built.includes("x.webp?v=1&amp;crop=2"));

    dom.window.close();
}

console.log("\n[2] Обов'язкові поля Google — у кожній позиції");
{
    const required = ["id", "title", "description", "link", "image_link",
        "availability", "price", "brand", "condition"];

    const broken = [];

    items.forEach(item => {
        required.forEach(field => {
            if (!item[field]) broken.push(`${item.id}: ${field}`);
        });
    });

    check("жодного порожнього обов'язкового поля", broken.length === 0, broken.slice(0, 5).join(", "));

    check("ціна у форматі «1234.00 UAH»",
        items.every(item => /^\d+\.\d{2} UAH$/.test(item.price)),
        items.find(item => !/^\d+\.\d{2} UAH$/.test(item.price))?.price);

    check("умова товару — завжди new", items.every(item => item.condition === "new"));

    // Без штрихкоду Merchant Center чекає його й обмежує показ. Або
    // код виробника, або пряме «ідентифікатора немає» — третього
    // варіанту бути не має.
    const noId = items.filter(item => !item.mpn && item.identifier_exists !== "no");

    check("без mpn стоїть identifier_exists: no", noId.length === 0, noId.length);

    check("опис в один абзац", items.every(item => !/\n/.test(item.description)));

    check("опис у межах ліміту Google (5000)",
        items.every(item => item.description.length <= 5000));
}

console.log("\n[3] Наявність збігається з правилами сайту");
{
    // Той самий модуль, що на сайті: якщо колір закінчився, у фіді
    // мусить бути backorder, а не in_stock.
    const wrong = [];

    products.forEach(product => {
        (product.variants || []).forEach((variant, index) => {

            const sizes = Stock.sizesOf(product, variant).filter(s => s && s !== "ONESIZE");
            const rows = sizes.length ? sizes : [null];

            rows.forEach(size => {

                const id = feed.itemId(product, variant, index, size);
                const item = items.find(x => x.id === id);

                if (!item) return;

                const expected = feed.availabilityOf(product, variant, size);

                if (item.availability !== expected) {
                    wrong.push(`${id}: ${item.availability} замість ${expected}`);
                }

            });
        });
    });

    check("наявність кожної позиції — за модулем залишків",
        wrong.length === 0, wrong.slice(0, 3).join(", "));

    check("значення наявності лише з дозволених",
        items.every(item => ["in_stock", "backorder", "out_of_stock"].includes(item.availability)));

    // «Під замовлення» — це backorder. preorder у Google означає
    // «товар ще не вийшов» і вимагає дати появи, якої в нас немає.
    check("під замовлення = backorder, не preorder",
        !items.some(item => item.availability === "preorder")
        && items.some(item => item.availability === "backorder"));

    // Розпродані товари не доходять навіть до products.json — ловимо
    // регрес у build-products.js.
    check("розпроданих товарів у фіді немає",
        !products.some(product => product.soldOut));
}

console.log("\n[4] Знижка — парою цін");
{
    const sale = items.filter(item => item.sale_price);

    check(`позицій зі знижкою — ${sale.length}`, sale.length > 0, sale.length);

    const num = tag => Number(String(tag).replace(" UAH", ""));

    check("sale_price завжди менша за price",
        sale.every(item => num(item.sale_price) < num(item.price)),
        sale.find(item => num(item.sale_price) >= num(item.price))?.id);

    // Найпідліша можлива помилка: віддати знижену ціну як price. Фід
    // тоді формально правильний, але перекресленої старої ціни в
    // Покупках не буде — тобто знижка не працює як знижка.
    const withOld = products.filter(p => p.oldPrice && p.oldPrice > p.price);

    check("товар зі старою ціною має price = стара ціна",
        withOld.every(product => {
            const item = items.find(x => x.item_group_id === String(product.id));
            return !item || num(item.price) === product.oldPrice;
        }),
        withOld.map(p => p.id).slice(0, 3).join(", "));
}

console.log("\n[5] Ідентифікатори та групи");
{
    const ids = items.map(item => item.id);

    check("усі id унікальні", new Set(ids).size === ids.length,
        ids.length - new Set(ids).size + " дублів");

    check("id у межах ліміту Google (50 символів)",
        ids.every(id => id.length <= 50), ids.find(id => id.length > 50));

    // Кольори одного товару мусять бути зшиті: інакше Google вважає
    // їх різними товарами й показує п'ять однакових карток поруч.
    const multi = products.find(p => (p.variants || []).length > 2);

    const group = items.filter(item => item.item_group_id === String(multi.id));

    check(`кольори одного товару в одній групі (${group.length} шт.)`,
        group.length >= 3 && new Set(group.map(i => i.item_group_id)).size === 1);

    check("у кожного кольору свій колір у полі color",
        new Set(group.map(i => i.color)).size === group.length,
        group.map(i => i.color).join(" | "));

    check("назва розрізняє кольори",
        new Set(group.map(i => i.title)).size === group.length);

    // Товар одного кольору не потребує підпису кольору В НАЗВІ — і не
    // має його отримувати, інакше назва подовжується без користі.
    //
    // Саме в назві: поле color тепер є в кожної позиції, бо це фільтр
    // у Shopping, а не частина заголовка. Раніше перевірка мішала
    // одне з одним і падала на цьому.
    const single = products.find(p => (p.variants || []).length === 1);
    const singleItem = items.find(i => i.item_group_id === String(single.id));

    check("товар з одним кольором — назва без кольору",
        singleItem && !/ — /.test(singleItem.title),
        singleItem && singleItem.title);

    check("але саме поле color у нього заповнене",
        singleItem && !!singleItem.color,
        singleItem && singleItem.color);
}

console.log("\n[6] Адреси");
{
    check("посилання абсолютні й на наш домен",
        items.every(item => item.link.startsWith(`${SITE}/p/`)),
        items.find(item => !item.link.startsWith(`${SITE}/p/`))?.link);

    check("фото абсолютні",
        items.every(item => item.image_link.startsWith("https://")
            && item.additional_image_link.every(src => src.startsWith("https://"))));

    // У даних трапляються обидві форми — «/assets/…» і «assets/…».
    check("подвійного слеша в адресах немає",
        !items.some(item => /[^:]\/\//.test(item.image_link)),
        items.find(item => /[^:]\/\//.test(item.image_link))?.image_link);

    check("додаткових фото не більше 10 (ліміт Google)",
        items.every(item => item.additional_image_link.length <= 10));

    // Колір в адресі — латиницею, як і на сайті: інакше посилання з
    // фіда відкриє товар, але не той колір, що на картинці.
    //
    // Ознака «кольорів кілька» — це група, а НЕ наявність поля color:
    // воно тепер заповнене в кожної позиції. Одноколірному товару
    // ?color= не потрібен — відкривати нічого не треба.
    const byGroup = new Map();

    items.forEach(item => {
        if (!byGroup.has(item.item_group_id)) byGroup.set(item.item_group_id, new Set());
        byGroup.get(item.item_group_id).add(item.color);
    });

    const colored = items.filter(item => byGroup.get(item.item_group_id).size > 1);

    check(`адреса веде на потрібний колір (${colored.length} позицій)`,
        colored.every(item => /\?color=[a-z0-9-]+/.test(item.link)),
        colored.find(item => !/\?color=[a-z0-9-]+/.test(item.link))?.link);

    const sized = items.filter(item => item.size);

    check(`адреса веде на потрібний розмір (${sized.length} позицій)`,
        sized.every(item => item.link.includes(`size=${encodeURIComponent(item.size)}`)));

    check("ONESIZE у розмір не потрапляє",
        !items.some(item => item.size === "ONESIZE"));
}

console.log("\n[7] Перебивання полів кольором не розійшлось із сайтом");
{
    // Перелік полів, які колір може перебити, живе у двох місцях:
    // colorOverrides() у assets/js/common.js (сайт) і COLOR_FIELDS у
    // scripts/build-feed.js (фід). Спільним модулем не зробити — той
    // файл читають тести, витягуючи функції регуляркою. Тому стежимо
    // за збігом тут: розійдуться — фід почне показувати ціну, якої
    // на сторінці немає.
    const common = read("assets/js/common.js");

    const list = common.slice(common.indexOf("function colorOverrides"));
    const declared = (list.match(/\[([^\]]+)\]\.forEach\(field/) || [])[1];

    const siteFields = (declared || "").split(",")
        .map(s => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);

    check("перелік полів у common.js знайдено", siteFields.length > 0, declared);

    const missing = feed.COLOR_FIELDS.filter(field => !siteFields.includes(field));

    check("фід не перебиває полів, яких не перебиває сайт",
        missing.length === 0, missing.join(", "));

    // Ціна кольору — найважливіше з них: рівно через це поле фід може
    // почати брехати про ціну.
    check("ціна кольору врахована", feed.COLOR_FIELDS.includes("price")
        && feed.COLOR_FIELDS.includes("oldPrice"));

    // І перевіряємо не лише перелік, а й дію: колір зі своєю ціною
    // мусить приїхати у фід із нею, а не з товарною.
    const own = [{
        id: 998, slug: "test-price", title: "Тест", description: "Опис",
        brand: "Test", price: 1000, category: "Сумки", gender: ["Жінкам"],
        variants: [
            { color: "Чорний", article: "998-1", images: ["/a.webp"], sizes: ["ONESIZE"] },
            { color: "Білий", article: "998-2", images: ["/b.webp"], sizes: ["ONESIZE"], price: 1500 }
        ]
    }];

    const built = feed.feedItems(own, new Map(), SITE).items;

    check("колір зі своєю ціною їде зі своєю",
        built[0].price === "1000.00 UAH" && built[1].price === "1500.00 UAH",
        built.map(i => i.price).join(" | "));
}

console.log("\n[8] Фід збирається і доїжджає");
{
    const scripts = JSON.parse(read("package.json")).scripts.build;

    check("build-feed.js у ланцюжку збірки", scripts.includes("build-feed.js"));

    check("фід збирається ПІСЛЯ товарів",
        scripts.indexOf("build-products.js") < scripts.indexOf("build-feed.js"));

    // Пуш робить CI: не додасть файл — Merchant Center щодня буде
    // вантажити те, що лежало в гілці до цього.
    ["build-dev.yml", "build-products.yml"].forEach(name => {

        const yml = read(`.github/workflows/${name}`);

        check(`${name}: feed.xml комітиться`, /git add[^\n]*feed\.xml/.test(yml));

    });

    check("feed.xml лежить у корені", fs.existsSync(path.join(ROOT, "feed.xml")));

    // Домен у фіді — з site.config.json, тобто dev-копія не покаже
    // Google адреси прода й навпаки.
    const built = read("feed.xml");
    const config = JSON.parse(read("site.config.json"));

    const isDev = built.includes(config.development.url);
    const isProd = built.includes(config.production.url);

    check("адреси у зібраному фіді — одного середовища", isDev !== isProd,
        `dev: ${isDev}, prod: ${isProd}`);
}

console.log("\n[9] Дата очікуваної наявності для «під замовлення»");
{
    const back = items.filter(item => item.availability === "backorder");
    const inStock = items.filter(item => item.availability === "in_stock");

    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ. Для backorder Google ВИМАГАЄ дату
    // очікуваної наявності. Заміряно у фіді на проді: 39 позицій
    // backorder і жодного availability_date — Merchant Center
    // позначає такі попередженням і може обмежувати показ.
    check(`позицій під замовлення: ${back.length}`, back.length > 0);

    check("у кожної є дата очікування",
        back.every(item => item.availability_date),
        back.filter(item => !item.availability_date).length + " без дати");

    // У наявного товару дата безглузда — він уже є.
    check("у наявних позицій дати немає",
        inStock.every(item => !item.availability_date));

    const sample = back[0] && back[0].availability_date;

    // ISO 8601 із зоною — саме такий формат просить Google.
    check(`формат ISO 8601 (${sample})`,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/.test(sample || ""));

    const when = new Date(sample).getTime();

    check("дата в майбутньому", when > Date.now());

    check("і не через півроку", when < Date.now() + 200 * 24 * 3600 * 1000);

    // ДАТА З ТОЧНІСТЮ ДО ДНЯ, а не до секунди.
    //
    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ. Спершу дата рахувалась із секундами,
    // і кожна перезбірка давала інший feed.xml, хоч у товарах нічого
    // не змінювалось. Перезбірка з CI і локальна розійшлись на
    // 13 секунд — git видав конфлікт у ЗГЕНЕРОВАНОМУ файлі, а в
    // кожному коміті перезбірки лежав би діф на 39 рядків ні про що.
    check("дата — початок дня", /T00:00:00\+00:00$/.test(sample || ""), sample);

    // Два виклики поспіль мусять дати те саме: інакше фід «змінюється»
    // сам від себе.
    const again = feed.feedItems(products, feed.departmentIndex(categories), SITE);

    check("дві збірки поспіль дають однакові дати",
        JSON.stringify(again.items.map(i => i.availability_date))
            === JSON.stringify(items.map(i => i.availability_date)));

    check("обрізання до дня в коді", /setUTCHours\(0, 0, 0, 0\)/.test(read("scripts/build-feed.js")));

    const feedSrc = read("scripts/build-feed.js");

    // Строк беремо з товару, а не з константи: інакше фід обіцяв би
    // те, чого магазин не казав.
    check("строк — із поля товару", /preOrderDays/.test(feedSrc));

    // «10-14 робочих днів» → 14. Обіцяти коротший строк, ніж буває,
    // гірше, ніж не обіцяти нічого.
    check("з діапазону береться довший строк", /Math\.max\(\.\.\.numbers/.test(feedSrc));

    check("робочі дні перераховані в календарні", /work \* 7 \/ 5/.test(feedSrc));
}

console.log("\n[10] Колір, матеріал і характеристики");
{
    const feedSrc = read("scripts/build-feed.js");

    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ. Колір писався лише коли у товару
    // БІЛЬШЕ одного варіанта — це правило для НАЗВИ (щоб не
    // дублювати колір у заголовку), і воно помилково діяло на g:color.
    // Заміряно: колір мали 39 позицій зі 130, хоч відомий він у всіх.
    const withColor = items.filter(item => item.color);

    check(`колір у ${withColor.length} позиціях зі ${items.length}`,
        withColor.length === items.length,
        items.filter(item => !item.color).length + " без кольору");

    check("колір не залежить від кількості варіантів",
        !/variants\.length > 1 \? \(variant\.color/.test(feedSrc));

    const withMaterial = items.filter(item => item.material);

    check(`матеріал у ${withMaterial.length} позиціях`, withMaterial.length > 0);

    const withHighlights = items.filter(item => item.product_highlight.length);

    check(`характеристики у ${withHighlights.length} позиціях`, withHighlights.length > 0);

    // Google просить короткі рядки — до 150 символів.
    check("кожна характеристика коротка",
        items.every(item => item.product_highlight.every(text => text.length <= 150)));

    // Матеріал має власний тег: той самий текст двічі в одній картці
    // нічого не додає.
    check("матеріал не дублюється в характеристиках",
        items.every(item => item.product_highlight.every(text => !/^Матеріал:/.test(text))));

    // «Розміри: Ширина лінзи: 53 мм» — підпис двічі. Ставимо його
    // лише там, де значення без нього незрозуміле.
    check("підпис не дублює власний підпис значення",
        items.every(item => item.product_highlight.every(
            text => !/^(Розміри|Склад|Застібка): [^:]*:/.test(text))));

    check("нічого не вигадуємо: немає поля — немає рядка",
        items.every(item => item.product_highlight.every(text => text.trim().length > 0)));

    // І все це доїжджає в розмітку.
    check("у XML є availability_date", /<g:availability_date>/.test(xml));
    check("у XML є material", /<g:material>/.test(xml));
    check("у XML є product_highlight", /<g:product_highlight>/.test(xml));
}

console.log("\n[11] Розділ таксономії Google");
{
    // Розділ віддаємо ЧИСЛОВИМ ID з офіційного переліку Google.
    // Раніше поле не заповнювалось узагалі, і розділ вибирав сам
    // Merchant Center — сумку за назвою легко покласти в «Багаж».
    //
    // Правило тут не «поле є», а «поле є в КОЖНОЇ позиції, і це
    // число»: рядок замість числа Google мусить розпізнавати сам, і
    // може розпізнати не так.
    const tags = xml.match(/<g:google_product_category>([^<]*)</g) || [];

    check(`розділ у всіх ${items.length} позиціях`, tags.length === items.length,
        `тегів: ${tags.length}`);

    const values = tags.map(t => t.replace(/^.*>/, "").replace(/<$/, ""));

    check("усі значення — числові ID", values.every(v => /^[0-9]+$/.test(v)),
        values.filter(v => !/^[0-9]+$/.test(v)).slice(0, 3).join(", "));

    // Кожен ID мусить бути в мапі — тобто звірений з переліком, а не
    // вписаний навмання.
    const feedSource = read("scripts/build-feed.js");

    const mapped = new Set((feedSource.match(/^\s+"[^"]+": (\d+),?$/gm) || [])
        .map(line => line.replace(/^.*: /, "").replace(/,$/, "")));

    check("жодного ID поза мапою GOOGLE_CATEGORY",
        values.every(v => mapped.has(v)),
        values.filter(v => !mapped.has(v)).join(", "));

    // Посилання на джерело мусить лишитись у коді: без нього
    // наступний ID знову додадуть з пам'яті.
    check("у коді є посилання на офіційний перелік",
        feedSource.includes("taxonomy-with-ids"));

    // Нова категорія без ID — не помилка збірки, але про неї мусить
    // бути попередження, інакше про порожній розділ ніхто не дізнається.
    check("категорія без ID дає попередження в журналі збірки",
        /::warning::/.test(feedSource)
        && /categoriesWithoutGoogleId/.test(feedSource));

    // Розділ і НАША категорія — різні поля: product_type лишається
    // зрозумілим у звітах Merchant Center.
    check("product_type нікуди не зник", /<g:product_type>/.test(xml));
}

if (skipped.length) {
    console.log(`\n  ⓘ  не потрапили у фід (${skipped.length}): ${skipped.slice(0, 3).join("; ")}`);
}

console.log("\n[12] Той самий фід приймає Meta");
{
    // Каталог в Instagram і Facebook живиться ТИМ САМИМ фідом, що
    // Google Shopping (docs/КАТАЛОГ-В-INSTAGRAM.md). Тобто окремої
    // роботи це не потребує — але й ламати його не можна: зникне
    // одне поле, і разом із Google відвалиться позначка товарів у
    // сторіс.
    //
    // Перелік — обов'язкові поля Meta Commerce Manager.
    const REQUIRED = [
        "id", "title", "description", "availability",
        "condition", "price", "link", "image_link", "brand",
    ];

    // Розбираємо ГОТОВИЙ XML, а не проміжні об'єкти: Meta читає саме
    // те, що ми віддаємо.
    const blocks = xml.split("<item>").slice(1);

    const missing = {};

    blocks.forEach(block => {

        REQUIRED.forEach(field => {

            if (!new RegExp(`<(g:)?${field}>`).test(block)) {
                missing[field] = (missing[field] || 0) + 1;
            }

        });

    });

    check(`усі ${REQUIRED.length} обов'язкових полів Meta на місці в ${blocks.length} позиціях`,
        Object.keys(missing).length === 0,
        JSON.stringify(missing));

    // Duplicate id — найчастіша причина, з якої Meta відхиляє частину
    // каталогу, і побачити її можна лише в їхньому кабінеті.
    const ids = [...xml.matchAll(/<g:id>([^<]*)<\/g:id>/g)].map(m => m[1]);

    check("жодного повторюваного id", new Set(ids).size === ids.length,
        `${new Set(ids).size} унікальних із ${ids.length}`);

    // Ціна без валюти — друга найчастіша причина.
    const badPrice = [...xml.matchAll(/<g:price>([^<]*)<\/g:price>/g)]
        .map(m => m[1])
        .filter(price => !/^\d+\.\d{2} [A-Z]{3}$/.test(price));

    check("ціна скрізь із валютою", badPrice.length === 0, badPrice.slice(0, 3).join(", "));
}

console.log(failures === 0
    ? `\n✅ Фід: ${items.length} позицій, усе на місці\n`
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
