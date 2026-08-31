// Кожен колір — окрема картка в АКЦІЯХ.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Каталог розкладає товар у двох кольорах на дві картки вже давно
// (splitProductsByColor). Акції — ні: сторінка акції й ряд під банером
// на головній показували той самий товар РІВНО один раз. Через це
// акція з 45 товарів виглядала помітно порожнішою за каталог, у якому
// ті самі товари займали 68 карток.
//
// ЧОМУ ПЕРЕВІРКИ САМЕ ТАКІ
// -------------------------
// 1. ДВА МІСЦЯ ПОКАЗУ. Товари акції видно і в сітці на promo.html, і в
//    ряду під великим банером на index.html. Це різні файли (promo.js
//    та app.js), і саме на цій парі проєкт уже мав розходження: набір
//    товарів жив окремо в кожному, і на головній порядок з адмінки
//    зберігався, а на сторінці акції — ні. Тому перевіряємо не «є
//    розгортання в коді», а що ОБА місця кличуть один виклик.
//
// 2. ДВА ПРАПОРЦІ, І ОБИДВА МУСЯТЬ ДОЗВОЛИТИ. В акції — «Кожен колір
//    окрема картка», у товарі — такий самий у каталозі. Товарний
//    сильніший: там кольори бувають відтінками одного й того самого,
//    і дві майже однакові чорні картки поспіль виглядають як брак.
//
// 3. ВИМКНЕНО ≠ КОЛІР НЕ ВИБРАТИ. Прапорець вимикає РОЗГОРТАННЯ, а не
//    вибір кольору: картка лишається одна, але кружечки кольорів на
//    ній ті самі. Без цієї перевірки «одна картка» легко перетворилась
//    би на «один колір».
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const common = read("assets/js/common.js");
const app = read("assets/js/app.js");
const promoJs = read("assets/js/promo.js");
const ui = read("assets/js/ui.js");

// Витягуємо справжні функції з файла, а не переписуємо їх поруч: саме
// розбіжність копії й оригіналу пропустила падіння пошуку в адмінці
// (див. tests/test-product-picker.js).
const { promotionCards, promotionProducts, splitProductsByColor } = new Function(
    common.slice(common.indexOf("function promotionProducts"),
        common.indexOf("function getDiscountPercent"))
    + "; return { promotionCards, promotionProducts, splitProductsByColor };"
)();

// Вихідні файли товарів, а не згенерований агрегат (правило з
// tests/test-migration-types.js): агрегат — результат збірки, і тест
// на ньому перевіряв би збірку, а не дані.
const products = fs.readdirSync(path.join(ROOT, "data/products"))
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(read(`data/products/${f}`)))
    .filter(p => typeof p.id === "number");

const multiColor = products.filter(p =>
    (p.variants || []).length > 1 && p.splitByColor !== false);


console.log("\n[1] Обидва місця показу розгортають, і через один виклик");
{
    // promo.js — сітка на сторінці акції, app.js — ряд під банером на
    // головній. Один виклик на два файли: сторінка не може забути
    // другий крок.
    check("сторінка акції кличе promotionCards",
        /promotionCards\(promo, allProducts, departmentOf\)/.test(promoJs));

    check("ряд під банером на головній — теж",
        /return promotionCards\(promo, allProducts, departmentOf\)/.test(app));

    // Порядок кроків усередині: спершу набір, потім розгортання.
    // Навпаки не працює — promotionProducts прибирає дублі за
    // product.id, а після розгортання id у всіх карток товару один.
    const body = common.slice(common.indexOf("function promotionCards"),
        common.indexOf("function splitProductsByColor"));

    check("набір іде перед розгортанням",
        body.indexOf("promotionProducts(") < body.indexOf("splitProductsByColor("),
        body.replace(/\s+/g, " ").slice(0, 80));

    // Функція мусить лежати в common.js: index.html не підключає
    // catalog.js взагалі, тож із catalog.js ряд на головній її не
    // побачив би.
    check("розгортання живе в common.js",
        /function splitProductsByColor/.test(common));

    check("у catalog.js копії немає",
        !/function splitProductsByColor/.test(read("assets/js/catalog.js")));

    ["index.html", "promo.html"].forEach(page => {

        check(`${page} підключає common.js`,
            /assets\/js\/common\.js/.test(read(page)));

    });
}

console.log("\n[2] Прапорець акції керує розгортанням");
{
    const трикольоровий = {
        id: 1,
        title: "Сумка",
        variants: [{ color: "Чорний" }, { color: "Білий" }, { color: "Синій" }]
    };

    const каталог = [трикольоровий];
    const acція = { productIds: [1] };

    check("без поля — розгортає (так виглядає заповнено)",
        promotionCards(acція, каталог, new Map()).length === 3,
        String(promotionCards(acція, каталог, new Map()).length));

    check("увімкнено явно — розгортає",
        promotionCards({ ...acція, splitByColor: true }, каталог, new Map()).length === 3);

    check("вимкнено — рівно одна картка",
        promotionCards({ ...acція, splitByColor: false }, каталог, new Map()).length === 1);

    // Порожня акція мусить лишитись порожньою: сторінка акції за цим
    // показує «акцію не знайдено», і розгортання не має вигадувати
    // картки з нічого.
    check("порожня акція лишається порожньою",
        promotionCards({ productIds: [] }, каталог, new Map()).length === 0);

    check("невідомий id не створює картку",
        promotionCards({ productIds: [999] }, каталог, new Map()).length === 0);
}

console.log("\n[3] Прапорець товару сильніший за прапорець акції");
{
    // У товарі кольори бувають відтінками одного й того самого — дві
    // майже однакові чорні картки поспіль виглядають як помилка. Тому
    // вимкнений прапорець ТОВАРУ переважає ввімкнений в акції.
    const відтінки = {
        id: 2,
        title: "Дві чорні",
        splitByColor: false,
        variants: [{ color: "Чорний" }, { color: "Чорний графіт" }]
    };

    const out = promotionCards({ productIds: [2], splitByColor: true }, [відтінки], new Map());

    check("товар з вимкненим прапорцем не розгортається", out.length === 1, String(out.length));

    check("і кольори при цьому всі на місці", out[0].variants.length === 2);

    // Один колір розгортати нічого — ні в акції, ні в каталозі.
    const один = { id: 3, title: "Один колір", variants: [{ color: "Чорний" }] };

    check("товар з одним кольором лишається однією карткою",
        promotionCards({ productIds: [3] }, [один], new Map()).length === 1);
}

console.log("\n[4] Порядок з адмінки не поплив");
{
    // Перетягування в списку «Товари цієї акції» має сенс лише якщо
    // порядок доїжджає до сайту (через це на головній колись зникав
    // пʼятий товар). Розгортання не має права цей порядок перемішати:
    // картки одного товару стоять на його місці, поспіль.
    const каталог = [
        { id: 10, title: "A", variants: [{ color: "Чорний" }, { color: "Білий" }] },
        { id: 11, title: "B", variants: [{ color: "Синій" }] },
        { id: 12, title: "C", variants: [{ color: "Беж" }, { color: "Хакі" }] }
    ];

    const cards = promotionCards({ productIds: [12, 11, 10] }, каталог, new Map());

    check("порядок товарів збережено",
        cards.map(c => c.id).join(",") === "12,12,11,10,10",
        cards.map(c => c.id).join(","));

    check("картки одного товару стоять поспіль",
        cards.map(c => c.id).join(",") === "12,12,11,10,10");

    // Активний варіант мусить бути першим: і картка, і сторінка товару
    // беруть variants[0] як активний.
    check("активний варіант = колір картки",
        cards.every(c => !c.cardColor || c.variants[0].color === c.cardColor),
        cards.map(c => `${c.cardColor}/${c.variants[0].color}`).join(", "));

    // id лишається один на всі картки товару — на ньому тримаються
    // кошик, обране й кнопка «Купити» (колір вони беруть з активного
    // свотча картки, а не з id).
    check("id товару не підмінюється",
        cards.filter(c => c.id === 10).length === 2
        && cards.filter(c => c.id === 10).every(c => c.id === 10));
}

console.log("\n[5] Справжні акції справді стали заповненішими");
{
    // Тут беремо ЗІБРАНІ дані: саме цю пару файлів браузер і читає
    // разом (data/promotions.json + data/products.json), і поле
    // productIds існує лише після збірки.
    const promotions = JSON.parse(read("data/promotions.json"));
    const built = JSON.parse(read("data/products.json"));
    const categories = JSON.parse(read("data/categories.json"));

    const departmentOf = new Map((categories || [])
        .filter(c => c && c.name).map(c => [c.name, c.department]));

    check("акції в даних є", promotions.length > 0, String(promotions.length));

    let зросло = 0;

    promotions.forEach(promo => {

        const набір = promotionProducts(promo, built, departmentOf);
        const картки = promotionCards(promo, built, departmentOf);

        if (картки.length > набір.length) зросло++;

        // ГОЛОВНЕ: жоден колір не втратився. Якби розгортання загубило
        // варіант, товар просто зник би з акції в цьому кольорі.
        const lost = [];

        набір.forEach(product => {

            if ((product.variants || []).length < 2 || product.splitByColor === false) return;

            const got = new Set(картки.filter(c => c.id === product.id).map(c => c.cardColor));

            (product.variants || []).forEach(v => {
                if (!got.has(v.color)) lost.push(`${promo.slug}/${product.slug}/${v.color}`);
            });

        });

        check(`${promo.slug}: ${набір.length} → ${картки.length} карток, жоден колір не втрачено`,
            lost.length === 0, lost.slice(0, 3).join(", "));

        // І навпаки — нічого лишнього не з'явилось.
        const extra = картки.filter(c => c.cardColor
            && !(набір.find(p => p.id === c.id).variants || [])
                .some(v => v.color === c.cardColor));

        check(`${promo.slug}: зайвих карток немає`, extra.length === 0, String(extra.length));

    });

    check("хоч в одній акції карток побільшало", зросло > 0,
        "жодна акція не змінилась — перевірте, чи є в них багатоколірні товари");

    check(`у каталозі є на чому це показати (${multiColor.length} багатоколірних товарів)`,
        multiColor.length > 0);
}

console.log("\n[6] Вимкнений прапорець НЕ забирає вибір кольору");
{
    // Прапорець вимикає розгортання, а не колір: одна картка — але
    // кружечки кольорів на ній ті самі. Саме це й просили: «залишити
    // в одному екземплярі, але з можливістю змінити колір».
    const свотчі = ui.slice(ui.indexOf("const colorButtons"),
        ui.indexOf("const sizeButtons"));

    check("свотчі малюються з УСІХ варіантів, а не з кольору картки",
        /variants\.map\(\(variant, index\)/.test(свотчі) && !/cardColor/.test(свотчі),
        свотчі.replace(/\s+/g, " ").slice(0, 70));

    check("кожен свотч несе свої фото й розміри",
        /data-images=/.test(свотчі) && /data-sizes=/.test(свотчі));

    // Перемикання — делегований обробник у common.js, тобто спільний
    // для каталогу, акції й головної. Якби він жив у catalog.js,
    // кружечки під банером на головній не працювали б.
    check("перемикання кольору живе в common.js",
        /event\.target\.closest\("\.mini-color, \.color"\)/.test(common));

    // Звуження «картка відповідає за один колір» спрацьовує ЛИШЕ для
    // розгорнутих карток. Нерозгорнута мусить лишатись з усіма
    // кольорами — інакше вимкнений прапорець ховав би товар з-під
    // фільтра кольору.
    check("звуження кольорів тільки для розгорнутих карток",
        /if \(product\.cardColor\)/.test(common));

    const getColors = new Function("product",
        common.match(/function getProductColors[\s\S]*?\n\}/)[0]
        + "; return getProductColors(product);");

    const нерозгорнутий = {
        variants: [{ color: "Чорний" }, { color: "Білий" }, { color: "Синій" }]
    };

    check("нерозгорнута картка знаходиться під усіма своїми кольорами",
        getColors(нерозгорнутий).size === 3, String(getColors(нерозгорнутий).size));

    check("розгорнута — лише під своїм",
        getColors({ ...нерозгорнутий, cardColor: "Білий" }).size === 1);
}

console.log("\n[7] Керування з адмінки й доїзд у дані");
{
    const { loadYaml } = require("./helpers/yaml");

    const promotions = loadYaml("admin/config.yml").collections
        .find(c => c.name === "promotions");

    const field = (promotions.fields || []).find(f => f.name === "splitByColor");

    check("поле є в акціях", !!field);
    check("це перемикач", field && field.widget === "boolean");

    // Сенс прапорця — щоб акції не виглядали напівпорожніми, тож
    // замовчування має давати саме той вигляд.
    check("увімкнено за замовчуванням", field && field.default === true);

    // default без явного required — пастка Decap: старі записи
    // перестають зберігатись (див. tests/test-entries-savable.js).
    check("поле необовʼязкове", field && field.required === false,
        field ? String(field.required) : "поля немає");

    const hint = String(field && field.hint);

    check("підказка каже, що дає вимкнення",
        /перемикається кружечками|один раз/.test(hint), hint.slice(0, 60));

    check("і що товарний прапорець сильніший",
        /не розгортаються тут/.test(hint));

    // Без цього рядка в збірці поле лишалось би в data/promotions/*,
    // але ніколи не доїжджало б у data/promotions.json, який читає
    // сайт, — і прапорець просто нічого не робив би.
    const build = read("scripts/build-promotions.js");

    check("збірка переносить прапорець у дані",
        /data\.splitByColor === false \? \{ splitByColor: false \} : \{\}/.test(build));

    // Пишемо лише коли ВИМКНЕНО — інакше в даних з'явилось би сто
    // рядків "splitByColor": true, які нічого не означають.
    const built = JSON.parse(read("data/promotions.json"));

    check("у даних немає зайвих splitByColor: true",
        built.every(p => p.splitByColor !== true),
        built.filter(p => p.splitByColor === true).map(p => p.slug).join(", "));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
