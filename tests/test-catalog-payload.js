// Скільки важить каталог, який вантажить кожен відвідувач.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. СПИСКИ БЕРУТЬ ПОЛЕГШЕНИЙ ФАЙЛ. Каталог, головна, кошик, обране,
//    пошук і меню показують КАРТКИ — характеристики зі сторінки
//    товару їм не потрібні. Варто комусь випадково повернутись на
//    повний products.json — і кожен відвідувач знову качає зайве.
//
// 2. ПОЛЕГШЕНИЙ ФАЙЛ ПОВНИЙ ЗА СКЛАДОМ. Ті самі товари, той самий
//    порядок, ті самі id. Розбіжність тут означала б, що каталог і
//    сторінка товару показують різні речі.
//
// 3. ВИКИНУТІ ПОЛЯ СПРАВДІ НІКОМУ НЕ ПОТРІБНІ. Перелік перевіряється
//    по коду списків, а не на віру.
//
// 4. СТОРІНКА ТОВАРУ НЕ ВАНТАЖИТЬ КАТАЛОГ ЗАРАДИ ОДНОГО ЗАПИСУ.
//    Повний запис лежить у самій сторінці.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const { PRODUCT_PAGE_ONLY, serialize } = require("../scripts/build-products.js");

const products = JSON.parse(read("data/products.json"));
const catalog = JSON.parse(read("data/catalog.json"));

console.log("\n[1] Два файли з одного джерела");
{
    check("data/catalog.json існує", fs.existsSync(path.join(ROOT, "data/catalog.json")));

    check(`та сама кількість товарів: ${catalog.length}`, catalog.length === products.length,
        `${catalog.length} проти ${products.length}`);

    check("той самий порядок і ті самі id",
        catalog.every((item, index) => Number(item.id) === Number(products[index].id)));

    check("картка несе все, що малюється",
        catalog.every(p => p.title && p.slug && p.brand && Number(p.price) > 0
            && Array.isArray(p.variants) && p.variants.length));

    // Опис видно в режимі «список» на десктопі — обрізати його тут не
    // можна, інакше картка покаже обірване речення.
    check("опис лишається в каталозі",
        catalog.every((p, i) => (p.description || "") === (products[i].description || "")));
}

console.log("\n[2] Викинуто тільки те, що показує сторінка товару");
{
    check("перелік не порожній", PRODUCT_PAGE_ONLY.length > 0);

    PRODUCT_PAGE_ONLY.forEach(field => {

        check(`${field}: немає в полегшеному каталозі`,
            catalog.every(p => !(field in p)));

    });

    // Головна перевірка: жоден зі скриптів, що працюють зі списками,
    // не читає викинутих полів. Інакше картка мовчки втратила б
    // частину вигляду.
    const listScripts = ["catalog.js", "app.js", "cart.js", "checkout.js", "favorites.js",
        "promo.js", "mega-menu.js", "ui.js", "common.js"];

    // Одне й те саме слово трапляється в різних сутностей: promo.js
    // читає legacySlugs АКЦІЇ (data/promotions.json), а не товару.
    // Виняток названий поіменно, щоб перевірка лишалась перевіркою.
    const KNOWN = { legacySlugs: ["promo.js"] };

    PRODUCT_PAGE_ONLY.forEach(field => {

        const allowed = KNOWN[field] || [];

        const used = listScripts.filter(name => {

            if (allowed.includes(name)) return false;

            const code = read(`assets/js/${name}`);

            // Шукаємо звертання до поля, а не згадку в коментарі.
            return new RegExp(`\\.${field}\\b|\\["${field}"\\]|${field}:`).test(code);

        });

        check(`${field}: списки його не читають`, used.length === 0, used.join(", "));

    });
}

console.log("\n[3] Списки справді беруть полегшений файл");
{
    const listScripts = ["catalog.js", "app.js", "cart.js", "checkout.js", "favorites.js",
        "promo.js", "mega-menu.js", "common.js"];

    listScripts.forEach(name => {

        const code = read(`assets/js/${name}`);

        check(`${name}: не просить повний products.json`,
            !/fetch\(\s*dataUrl\("\/?data\/products\.json"\)/.test(code));

    });

    check("адреса каталогу задана в одному місці",
        /function catalogUrl\(\)/.test(read("assets/js/common.js")));

    check("спільний кеш бере саме її",
        /fetch\(catalogUrl\(\)\)/.test(read("assets/js/common.js")));
}

console.log("\n[4] Сторінка товару несе свій запис");
{
    const builder = read("scripts/build-product-pages.js");

    check("збірка кладе повний запис у сторінку",
        /window\.PRODUCT_DATA = \$\{productData\(product\)\}/.test(builder));

    check("«<» екрановано, щоб опис не закрив тег",
        /replace\(\/<\/g, "\\\\u003c"\)/.test(builder));

    // Тільки справжні сторінки товарів. У теці p лежать ще й
    // сторінки-перенаправлення зі старих кириличних адрес — там немає
    // нічого, крім location.replace(), і бути не повинно.
    const pages = (fs.existsSync(path.join(ROOT, "p"))
        ? fs.readdirSync(path.join(ROOT, "p"), { withFileTypes: true })
            .filter(e => e.isDirectory()).map(e => `p/${e.name}/index.html`)
        : []).filter(page => read(page).includes('id="productPage"'));

    const without = pages.filter(page => !read(page).includes("window.PRODUCT_DATA"));

    check(`запис є на всіх ${pages.length} сторінках товарів`, pages.length > 0 && without.length === 0,
        without.slice(0, 3).join(", "));

    if (pages.length) {

        const html = read(pages[0]);

        const raw = (html.match(/window\.PRODUCT_DATA = ([\s\S]*?);\n/) || [])[1];

        let embedded = null;

        try {
            embedded = JSON.parse(raw.replace(/\\u003c/g, "<"));
        } catch (error) {
            embedded = null;
        }

        check("запис розбирається", Boolean(embedded && embedded.id));

        if (embedded) {

            const source = products.find(p => Number(p.id) === Number(embedded.id));

            check("це той самий товар, що в каталозі",
                Boolean(source) && source.slug === embedded.slug);

            // Саме заради них сторінка й тримає повний запис.
            check("у ньому є характеристики, яких немає в каталозі",
                PRODUCT_PAGE_ONLY.some(field => field in embedded),
                Object.keys(embedded).join(", "));

        }

    }

    const product = read("assets/js/product.js");

    check("сторінка товару використовує вбудований запис",
        /window\.PRODUCT_DATA/.test(product));

    check("а каталог бере полегшений",
        /getAllProductsCached\(\)/.test(product));

    // Стара адреса /product?id=… вбудованого запису не має — там має
    // лишитись повний файл, інакше характеристики зникнуть.
    check("стара адреса далі бере повний файл",
        /dataUrl\("\/data\/products\.json"\)/.test(product));
}

console.log("\n[5] Вага");
{
    const gz = rel => zlib.gzipSync(fs.readFileSync(path.join(ROOT, rel)), { level: 9 }).length;

    const full = gz("data/products.json");
    const light = gz("data/catalog.json");

    check(`каталог легший за повний файл: ${(light / 1024).toFixed(1)} КБ проти ${(full / 1024).toFixed(1)} КБ (стиснуто)`,
        light < full);

    // Відступи в зібраних файлах — третина ваги. Джерело правди
    // лежить у data/products/*.json, і читають очима саме його.
    check("зібрані файли без зайвих відступів",
        !/^\s{2,}"/m.test(read("data/products.json")));

    check("але товар лишається на своєму рядку — щоб git diff читався",
        read("data/products.json").split("\n").length >= products.length);

    check("серіалізація спільна для обох файлів",
        typeof serialize === "function" && serialize([{ a: 1 }]) === '[\n{"a":1}\n]\n');
}

console.log(failures === 0
    ? "\n✅ Каталог: списки качають картки, подробиці лишаються сторінці товару\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
