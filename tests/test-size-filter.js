// Фільтр «Розмір»: групи будуються з даних, а не лише з довідника.
//
// СИМПТОМ
// --------
// У фільтрі лишилося саме взуття. Причина не в одній забутій групі, а
// в тому, що довідник data/size-groups.json описував НЕ ТЕ, ЩО Є:
//
//   • «Сумки» я прибрав раніше, коли всі вони мали ONESIZE — але потім
//     зʼявились сумки з реальними S і M, а група не повернулась;
//   • в окулярів є 51 і 54 (ширина лінзи), і групи для них не було
//     ніколи;
//   • «Одяг» і «Рюкзаки» описані, а таких товарів у каталозі немає.
//
// Кожна нова категорія вимагала б ручної правки — і фільтр знову
// відставав би від каталогу. Тому недостаючі групи тепер добудовуються
// з даних, а довідник лишається джерелом порядку й таблиць розмірів.
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
const products = JSON.parse(read("data/products.json"));
const categories = JSON.parse(read("data/categories.json"));

console.log("\n[1] Правило описане в коді");
{
    check("недостаючі групи добудовуються", /function addMissingSizeGroups/.test(catalog));
    check("викликається разом із рештою підготовки",
        /addMissingSizeGroups\(categoryDepartments\)/.test(catalog));

    // «Один розмір» — не вибір: чип, що збігається з половиною
    // каталогу, нічого не звужує.
    check("«один розмір» не потрапляє у фільтр", /function isRealSize/.test(catalog));
    check("регістр не має значення", /\^one\\s\*size\$\/i/.test(catalog));

    // Окремі блоки «Жіночі сумки», «Чоловічі сумки» з тими самими
    // розмірами виглядали б як помилка.
    check("категорії одного розділу зводяться в одну групу",
        /byDepartment/.test(catalog));
}

console.log("\n[2] Порядок розмірів");
{
    // Абетка не годиться: за нею «M» стає перед «S».
    check("є окреме порівняння", /function compareSizes/.test(catalog));
    check("літерні розміри мають свій порядок", /LETTER_SIZES/.test(catalog));

    const src = catalog.match(/const LETTER_SIZES[\s\S]*?\n\}/)[0];
    const compare = new Function(src + "; return compareSizes;")();

    check("одяг: XS → S → M → L → XL",
        ["M", "S", "XL", "XS", "L"].sort(compare).join(",") === "XS,S,M,L,XL",
        ["M", "S", "XL", "XS", "L"].sort(compare).join(","));

    check("числа як числа, а не як текст",
        ["54", "51"].sort(compare).join(",") === "51,54");
    check("взуття за зростанням",
        ["39", "36", "38", "37"].sort(compare).join(",") === "36,37,38,39");
}

console.log("\n[3] Результат на справжніх даних");
{
    // Відтворюємо логіку й дивимось, що з'явиться у фільтрі.
    const byDepartment = new Map();

    categories.forEach(c => {
        if (!byDepartment.has(c.department)) byDepartment.set(c.department, []);
        byDepartment.get(c.department).push(c.name);
    });

    const groups = JSON.parse(read("data/size-groups.json")).groups
        .map(g => ({
            ...g,
            categories: g.department ? (byDepartment.get(g.department) || []) : (g.categories || [])
        }));

    const covered = new Set(groups.flatMap(g => g.categories));
    const isReal = v => !!v && !/^one\s*size$/i.test(String(v).trim());

    const departmentOf = new Map();

    byDepartment.forEach((list, dep) => list.forEach(name => departmentOf.set(name, dep)));

    const extra = new Map();

    products.forEach(p => {

        if (!p.category || covered.has(p.category)) return;

        const sizes = [...(p.sizes || []), ...(p.variants || []).flatMap(v => v.sizes || [])]
            .filter(isReal);

        if (!sizes.length) return;

        const title = departmentOf.get(p.category) || p.category;

        if (!extra.has(title)) extra.set(title, new Set());

        sizes.forEach(s => extra.get(title).add(String(s).trim()));

    });

    // Головне: у фільтрі має бути не лише взуття.
    const visible = groups
        .filter(g => g.categories.some(c => products.some(p => p.category === c)))
        .map(g => g.title)
        .concat([...extra.keys()]);

    check("у фільтрі більше однієї групи", visible.length > 1, visible.join(", "));
    check("взуття лишилось", visible.includes("Взуття"), visible.join(", "));

    // Саме те, чого бракувало
    check("зʼявились розміри окулярів",
        [...(extra.get("Аксесуари") || [])].includes("51"),
        [...(extra.get("Аксесуари") || [])].join(","));
    check("зʼявились розміри сумок",
        [...(extra.get("Сумки") || [])].some(s => ["S", "M"].includes(s)),
        [...(extra.get("Сумки") || [])].join(","));

    // Категорії, де насправді нічого фільтрувати, групи не отримують
    check("годинники без розмірів групи не отримали",
        ![...extra.keys()].includes("Годинники"));
}

console.log("\n[4] Написання «один розмір» одне");
{
    // Розмір порівнюється рядком, тож ONESIZE і Onesize — РІЗНІ
    // значення: той самий товар у кошику й на сторінці міг не збігтися.
    const spellings = new Set();

    products.forEach(p => [...(p.sizes || []), ...(p.variants || []).flatMap(v => v.sizes || [])]
        .forEach(s => { if (/one\s*size/i.test(s)) spellings.add(s); }));

    check("у каталозі одне написання", spellings.size <= 1,
        [...spellings].join(", "));

    // зводиться при збірці, а не тримається на памʼяті адміністратора
    check("нормалізація вбудована в збірку",
        /CANON_ONESIZE/.test(read("scripts/build-products.js")));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
