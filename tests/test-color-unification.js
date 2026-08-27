// Зведення кольорів: назви в даних і сім'ї у фільтрі.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Колір заповнюється руками, і кожен постачальник називає той самий
// колір по-своєму. На 71 товар зібралось 83 різні написання:
//
//     Чорний · Black · Black чорний · Nero · Neo
//     Білий · White · Білий White 21G · Білий Wht-Dk Grn 286
//     Бежевий · Бежевий 1R5 · Beige — бежевий · Camel — карамельний…
//
// Видно це було в трьох місцях: у фільтрі «Колір» — 83 пункти (щоб
// знайти чорну сумку, треба відмітити п'ять), у картці під назвою —
// артикул відтінку замість кольору, у кошику й листі — те саме.
//
// ЧОМУ ДВА РІВНІ, А НЕ ОДИН
// --------------------------
// Одного зведення написань мало: «Темно-сірий», «Світло-сірий» і
// «Сіро-бежевий» — це справді різні відтінки, у картці вони мусять
// відрізнятись. Але у фільтрі це три пункти на один сірий.
//
// Тому:
//   1. Написання зводить збірка (scripts/normalize-colors.js) — у
//      даних лишається чиста назва.
//   2. Фільтр групує назви в СІМ'Ї (colorFamily у common.js) — пунктів
//      стільки, скільки кольорів розрізняє покупець.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const common = read("assets/js/common.js");
const catalog = read("assets/js/catalog.js");
const build = read("scripts/build-products.js");

const { normalizeColorName, normalizeProductColors } = require("../scripts/normalize-colors");

// Сім'ї беремо з САМОГО common.js, а не копіюємо: копія розійшлася б із
// оригіналом, і тест перевіряв би не те, що на сайті.
const { colorFamily, COLOR_FAMILY_ORDER } = new Function(
    common.match(/function getProductColors[\s\S]*?\n\}/)[0]
    + common.slice(common.indexOf("const COLOR_FAMILIES"), common.indexOf("function getDiscountPercent"))
    + "; return { colorFamily, COLOR_FAMILY_ORDER, getProductColorFamilies };"
)();

console.log("\n[1] Зведення назв");
{
    // Найчастіший випадок: англійська й українська назви того самого
    // кольору поруч.
    check("англо-український дубль → українська назва",
        normalizeColorName("Black чорний") === "Чорний",
        normalizeColorName("Black чорний"));

    check("англійська назва перекладається",
        normalizeColorName("White") === "Білий" && normalizeColorName("Navy") === "Темно-синій",
        `${normalizeColorName("White")} / ${normalizeColorName("Navy")}`);

    // Артикул відтінку не інформація, а дубль поля sku варіанта.
    check("артикул відтінку прибирається",
        normalizeColorName("Бежевий  1R5") === "Бежевий"
        && normalizeColorName("Білий White 21G") === "Білий",
        `${normalizeColorName("Бежевий  1R5")} / ${normalizeColorName("Білий White 21G")}`);

    // «Neo» — назва моделі кросівок Lacoste L003 Neo, а не колір.
    // Механічно цього не вгадати, тому вона у словнику.
    check("назва моделі не приймається за колір",
        normalizeColorName("Neo") === "Чорний", normalizeColorName("Neo"));

    // Фурнітура ≠ колір речі: «Brass/Ivory» — золота фурнітура на
    // айворі, а не золотий колір.
    check("слова про фурнітуру не стають кольором",
        normalizeColorName("Brass/Ivory") === "Айворі"
        && normalizeColorName("Brass/Chalk — айворі / золотистий") === "Айворі",
        normalizeColorName("Brass/Chalk — айворі / золотистий"));

    // Чиста назва мусить лишатись недоторканою.
    ["Чорний", "Темно-сірий", "Світло-сірий", "Карамельний", "Коричневий"].forEach(name =>
        check(`«${name}» не змінюється`, normalizeColorName(name) === name,
            normalizeColorName(name)));

    // ІДЕМПОТЕНТНІСТЬ. Зведення відбувається на КОЖНІЙ збірці. Якби
    // друге застосування щось міняло, назва поволі «дочищалась» би до
    // чогось іншого, і зловити це було б важко.
    const products = JSON.parse(read("data/products.json"));

    const names = new Set();

    products.forEach(p => (p.variants || []).forEach(v => names.add(v.color)));

    const drifting = [...names].filter(n => normalizeColorName(n) !== n);

    check("повторне зведення нічого не міняє", drifting.length === 0,
        drifting.slice(0, 3).join(" | "));
}

console.log("\n[2] Варіанти лишаються досяжними");
{
    // За назвою кольору знаходиться варіант — його фото, розміри й
    // артикул. Два однакових імені в одному товарі означали б, що
    // другий варіант недосяжний узагалі.
    const products = JSON.parse(read("data/products.json"));

    const clashes = products.filter(p => {

        const colors = (p.variants || []).map(v => v.color);

        return new Set(colors).size !== colors.length;

    });

    check("у межах товару назви кольорів різні", clashes.length === 0,
        clashes.map(p => p.slug).join(", "));

    // Зіткнення розводяться словами про світлість, а не цифрою:
    // «Темно-коричневий» читається як колір, «Коричневий 2» — ні.
    const sample = {
        color: "Коричневий",
        variants: [
            { color: "Коричневий", hex: "#b66813" },
            { color: "Brown — коричневий", hex: "#3b1f10" }
        ]
    };

    normalizeProductColors(sample);

    check("зіткнення розводиться світлістю",
        sample.variants[1].color === "Темно-коричневий",
        sample.variants.map(v => v.color).join(" | "));

    // Поле color верхнього рівня — це колір першого варіанта; якби вони
    // розійшлись, картка й сторінка товару показували б різні назви
    // того самого кольору.
    check("поле color узгоджене з першим варіантом",
        products.every(p => !p.color || !p.variants?.length || p.color === p.variants[0].color),
        products.filter(p => p.color && p.variants?.length && p.color !== p.variants[0].color)
            .map(p => `${p.slug}: ${p.color} ≠ ${p.variants[0].color}`).slice(0, 3).join("; "));
}

console.log("\n[3] Зведення живе у збірці, а не в разовій правці даних");
{
    // Виправити 83 назви руками — робота, яка розвалиться на першому ж
    // новому товарі: наступного разу знову приїде «Blush Beige», бо
    // саме так написано в постачальника.
    check("build-products підключає нормалізацію",
        /require\("\.\/normalize-colors"\)/.test(build));

    check("нормалізація застосовується до всіх товарів",
        /normalizeProductColors\(product\)/.test(build));

    // Файли-джерела не змінюються: в адмінці лишається те, що написали,
    // разом з артикулом постачальника.
    check("причина «чому у збірці» записана в коді",
        /Виправляти дані руками означало б робити це заново/.test(build));
}

console.log("\n[4] Сім'ї кольорів");
{
    // Найважливіше: сильне слово-колір виграє в того, що стоїть далі.
    // Так само читає назву людина.
    check("перше слово-колір визначає сім'ю",
        colorFamily("Коричнево-чорний") === "Коричневий"
        && colorFamily("Чорно-бежевий") === "Чорний",
        `${colorFamily("Коричнево-чорний")} / ${colorFamily("Чорно-бежевий")}`);

    check("відтінки зводяться до базового кольору",
        ["Темно-сірий", "Світло-сірий", "Сіро-бежевий"]
            .every(n => colorFamily(n) === "Сірий"));

    // Свотч надійніший за слова про обробку: «Brass» — це фурнітура, а
    // сама річ #e9e4e4, тобто майже біла.
    check("без слова-кольору вирішує hex",
        colorFamily("Brass", "#e9e4e4") === "Білий",
        colorFamily("Brass", "#e9e4e4"));

    // «Айворі» — усталена назва теплого неконтрастного відтінку, і
    // покупець шукає його разом з бежевими, а не з білими.
    check("айворі — бежевий",
        colorFamily("Айворі", "#e4ddda") === "Бежевий",
        colorFamily("Айворі", "#e4ddda"));

    // ПАСТКА, НА ЯКІЙ СПІТКНУВСЯ ПЕРШИЙ ВАРІАНТ: насиченість у HSL
    // ділиться на світлість і роздувається в майже білих кольорах.
    // #e9e4e4 — це білий (канали різняться на 5 з 255), але s виходить
    // 0.10, а відтінок обчислюється як 0° — і колір ставав ЧЕРВОНИМ.
    // Хрома (max-min) такого не робить.
    check("майже білий не стає червоним",
        colorFamily("", "#e9e4e4") === "Білий", colorFamily("", "#e9e4e4"));

    check("майже чорний не стає сірим",
        colorFamily("", "#161616") === "Чорний", colorFamily("", "#161616"));

    // Тепла пастель — бежевий, а не жовтий чи помаранчевий: без цього
    // правила пісок, крем і карамель розлітались би по трьох сім'ях.
    check("тепла пастель — бежевий",
        colorFamily("", "#d6c3a5") === "Бежевий", colorFamily("", "#d6c3a5"));

    // МЕЖА ПРАВИЛА, названа вголос. #ccc2b8 — теплий, але майже
    // безбарвний сірий (канали різняться на 20 з 255). За свотчем це
    // сірий, і саме так він і класифікується; бежевим його робить лише
    // назва («Хакі», «Тауп»). Тримати межу десь треба, і краще там, де
    // її видно з тесту.
    check("майже безбарвний теплий сірий лишається сірим",
        colorFamily("", "#ccc2b8") === "Сірий", colorFamily("", "#ccc2b8"));

    check("але назва перемагає свотч",
        colorFamily("Хакі", "#ccc2b8") === "Бежевий", colorFamily("Хакі", "#ccc2b8"));

    check("порядок сімей не алфавітний",
        COLOR_FAMILY_ORDER[0] === "Чорний" && COLOR_FAMILY_ORDER.includes("Мультиколір"),
        COLOR_FAMILY_ORDER.slice(0, 3).join(", "));
}

console.log("\n[5] Скільки пунктів у фільтрі насправді");
{
    const products = JSON.parse(read("data/products.json"));

    const names = new Set();
    const families = new Set();

    products.forEach(p => (p.variants || []).forEach(v => {
        names.add(v.color);
        families.add(colorFamily(v.color, v.hex));
    }));

    // Головна цифра всієї роботи: було 83 пункти на 71 товар.
    check(`пунктів у фільтрі помітно менше, ніж назв (${names.size} → ${families.size})`,
        families.size <= 12 && families.size < names.size,
        `${families.size} сімей`);

    // Сміттєвої сім'ї «Інші» в живому каталозі бути не мусить: вона
    // означає, що колір не розпізнано ні за назвою, ні за свотчем.
    check("немає нерозпізнаних кольорів", !families.has("Інші"),
        [...products.flatMap(p => (p.variants || [])
            .filter(v => colorFamily(v.color, v.hex) === "Інші")
            .map(v => `${p.slug}: ${v.color}`))].slice(0, 3).join("; "));
}

console.log("\n[6] Фільтр працює сім'ями");
{
    check("пункти будуються з сімей",
        /getProductColorFamilies\(product\)\.forEach\(\(info, family\)/.test(catalog));

    check("порядок пунктів — з COLOR_FAMILY_ORDER",
        /COLOR_FAMILY_ORDER\.filter\(family => families\.has\(family\)\)/.test(catalog));

    check("фільтрація теж сім'ями",
        /const productFamilies = new Set\(getProductColorFamilies\(product\)\.keys\(\)\)/.test(catalog));

    // Доступність пунктів мусить рахуватись так само, інакше «Бежевий»
    // позначався б недоступним через те, що в даних лежить «Тауп».
    check("доступність пунктів рахується сім'ями",
        /getProductColorFamilies\(product\)\.forEach\(\(info, family\) => colors\.add\(family\)\)/.test(catalog));

    // Підказка мусить називати, які відтінки зведені в пункт — інакше
    // незрозуміло, чому за фільтром «Бежевий» знайшовся «Тауп».
    check("підказка перелічує зведені відтінки",
        /option\.title = names\.length > 1/.test(catalog));

    // Старі посилання (?color=Black) мусять і далі відкривати фільтр.
    check("старі посилання не ламаються",
        /\.map\(value => colorFamily\(value\)\)/.test(catalog));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
