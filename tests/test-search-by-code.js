// Пошук за артикулом.
//
// СИМПТОМ, ЯКИЙ ЦЕ ЗАКРИВАЄ
// --------------------------
// Артикул каталогу («95», «28-1») бачить покупець: він стоїть на
// сторінці товару, ним відповідає підтримка, і саме його підставляє
// форма контактів — «Питання про товар: … (артикул 28-1)». А пошук
// по ньому не працював: у searchHaystack полів з кодом немає.
//
// Заміряно на справжньому каталозі: із 231 артикулу (товари плюс
// кольори) свій товар не знаходив НІ ОДИН. 198 давали нуль
// результатів, а 33 — лише ЧУЖІ товари: запит «5» повертав 7
// сторонніх, бо числа трапляються в габаритах і назвах моделей.
// Тобто людина отримувала або порожнечу, або впевнену неправильну
// відповідь — і йшла з думкою «у них цього немає».
//
// Коди виробника: із 157 сто не знаходились узагалі.
//
// ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ
// ---------------------
// 1. Кожен артикул каталогу веде рівно на свій товар — на всіх
//    товарах, а не на одному прикладі.
// 2. Код виробника теж знаходиться, як завгодно записаний.
// 3. Звичайний пошук словами не зіпсувався ні на одному запиті з
//    docs/ПОШУК.md.
// 4. Код НЕ змішаний зі словами: у haystack його немає, інакше цифри
//    почали б збігатися всередині чужих описів, а вкорочування
//    закінчень поїхало б по кодах.
// 5. Пошукова панель і каталог кличуть ОДИН відбір.
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

// Артикули каталогу існують ЛИШЕ в зібраному файлі: їх вичисляє
// scripts/build-products.js з id товару, у джерельних data/products/*.json
// такого поля немає. Тому саме тут — на відміну від решти тестів —
// беремо агрегат, а не джерело.
const products = JSON.parse(read("data/products.json"));

// Виконуємо САМ код із common.js, а не його переписану копію: копія
// розійшлася б із оригіналом, і тест почав би стерегти не те, що на
// сайті. Спосіб той самий, що в tests/helpers/color-families.js.
const api = (() => {

    const parts = [
        /const MIN_STEM = \d+;/,
        /function searchTokens[\s\S]*?\n}\n/,
        /function hasSearchWord[\s\S]*?\n}\n/,
        /function searchHaystack[\s\S]*?\n}\n/,
        /function matchesQuery[\s\S]*?\n}\n/,
        /function normalizeCode[\s\S]*?\n}\n/,
        /function squashCode[\s\S]*?\n}\n/,
        /function productCodes[\s\S]*?\n}\n/,
        /function looksLikeCode[\s\S]*?\n}\n/,
        /function matchesCode[\s\S]*?\n}\n/,
        /function searchProducts[\s\S]*?\n}\n/
    ].map(pattern => {

        const found = common.match(pattern);

        if (!found) throw new Error("не знайшов у common.js: " + pattern);

        return found[0];

    });

    return new Function(parts.join("\n")
        + "\nreturn { matchesQuery, searchProducts, searchHaystack, matchesCode };")();

})();

console.log("\n[1] Артикул каталогу веде на свій товар");
{
    // Сам симптом, названий числом: до правки цей запит давав 5
    // товарів і потрібного серед них не було.
    const target = products.find(p => String(p.article) === "95");

    check("у каталозі є товар з артикулом 95", Boolean(target));

    if (target) {

        const found = api.searchProducts(products, "95");

        check("запит «95» дає рівно один товар", found.length === 1, found.length);

        check("і це саме він", found.length === 1 && found[0].id === target.id,
            found.map(p => p.title).join(" | "));

        // Словами цей запит не знаходив нічого. Тримаємо замір у
        // тесті, щоб було видно, від чого відходимо, — і щоб хтось,
        // хто захоче «просто дописати артикул у haystack», побачив,
        // що словами це не працює.
        const byWords = products.filter(p => api.matchesQuery(p, "95"));

        check("словами той самий запит не знаходив свій товар",
            !byWords.some(p => p.id === target.id),
            byWords.length + " шт");

    }

    check("пробіли навколо запиту не мають значення",
        api.searchProducts(products, "  95  ").length === 1);

    // Артикул кольору — «28-1». Дефіс не викидаємо: інакше «28-1»
    // зрівнялося б з артикулом «281».
    const withVariants = products.find(p =>
        (p.variants || []).filter(v => v.article).length > 1);

    if (withVariants) {

        const codes = withVariants.variants.map(v => v.article).filter(Boolean);

        const allHit = codes.every(code => {

            const found = api.searchProducts(products, code);

            return found.length === 1 && found[0].id === withVariants.id;

        });

        check("артикул кожного кольору веде на той самий товар (" + codes.join(", ") + ")",
            allHit);

    }
}

console.log("\n[2] Жоден артикул не втрачено — на всьому каталозі");
{
    const wrong = [];

    products.forEach(product => {

        const codes = [product.article]
            .concat((product.variants || []).map(v => v.article))
            .filter(Boolean);

        codes.forEach(code => {

            const found = api.searchProducts(products, String(code));

            if (found.length !== 1 || found[0].id !== product.id) {

                wrong.push(code + " → " + found.length + " шт");

            }

        });

    });

    check("усі артикули каталогу ведуть рівно на свій товар",
        wrong.length === 0,
        wrong.slice(0, 6).join("; "));
}

console.log("\n[3] Код виробника");
{
    // Його показує сторінка товару рядком «Код виробника», і саме він
    // приходить у листі від постачальника.
    const withSku = products.filter(p => p.sku);

    check("у каталозі є коди виробника", withSku.length > 0, withSku.length);

    const dashed = withSku.find(p => p.sku.includes("-"));

    if (dashed) {

        const asIs = api.searchProducts(products, dashed.sku);
        const squashed = api.searchProducts(products, dashed.sku.replace(/[^a-zA-Z0-9]/g, ""));
        const lower = api.searchProducts(products, dashed.sku.toLowerCase());

        check("як написано — знаходить", asIs.some(p => p.id === dashed.id));

        // Той самий код переписують і без розділових знаків, і малими:
        // вимагати від людини точного написання означало б нуль
        // результатів на правильному коді.
        check("без розділових знаків — теж", squashed.some(p => p.id === dashed.id));
        check("малими літерами — теж", lower.some(p => p.id === dashed.id));

    }
}

console.log("\n[4] Звичайний пошук словами не зіпсувався");
{
    // Запити з docs/ПОШУК.md — ті, на яких пошук уже ламався раніше.
    // Відбір за кодом не має права змінити на них НІ ОДНОГО числа.
    const QUERIES = [
        "гаманець coach", "coach гаманець",
        "ray-ban окуляри", "окуляри ray ban",
        "сумочка marc jacobs", "marc jacobs сумочка",
        "сумки чорні", "сумка коач", "мішель корс",
        "кросівки лакост", "мк",
        // І запити з цифрами, які НЕ артикули: вони мусять шукатись
        // словами, інакше цифра в запиті ламала б звичайний пошук.
        "michael kors mk7558", "сумка 2024", "ray-ban 3025"
    ];

    const differ = QUERIES.filter(q =>
        api.searchProducts(products, q).length
        !== products.filter(p => api.matchesQuery(p, q)).length);

    check("усі " + QUERIES.length + " запитів дають те саме, що й раніше",
        differ.length === 0,
        differ.join("; "));
}

console.log("\n[5] Код не змішаний зі словами");
{
    // Спокуса була зсипати артикули в той самий haystack. Так робити
    // не можна: hasSearchWord відкидає закінчення (для «чорні» →
    // «чорн»), і на кодах це різало б їх навпіл, а короткі числа
    // збігалися б усередині чужих габаритів.
    const haystackSrc = common.match(/function searchHaystack[\s\S]*?\n}\n/)[0];

    check("haystack без артикулів", !/article/.test(haystackSrc));
    check("haystack без кодів виробника", !/\bsku\b/.test(haystackSrc));

    // Перевіряємо не текст, а поведінку: артикул не має вважатись
    // словом товару.
    const sample = products.find(p => p.article);

    check("артикул не знаходиться як слово",
        !api.matchesQuery(sample, String(sample.article))
        || api.searchHaystack(sample).includes(String(sample.article)) === false,
        String(sample.article));

    // Порівняння ТОЧНЕ, а не «починається з». Частковий збіг повертав
    // би чужий товар з упевненим виглядом — найгірший різновид
    // помилки в пошуку.
    const codes = new Set();

    products.forEach(p => {
        if (p.article) codes.add(String(p.article));
        (p.variants || []).forEach(v => { if (v.article) codes.add(String(v.article)); });
    });

    // Беремо справжній артикул і дописуємо до нього символи, поки не
    // отримаємо рядок, якого в каталозі немає. За кодом він знайтись
    // не має права.
    const anyCode = [...codes].find(c => !codes.has(c + "0")) || [...codes][0];
    const notACode = anyCode + "0";

    check("артикула «" + notACode + "» в каталозі немає", !codes.has(notACode));

    const own = products.find(p => String(p.article) === anyCode
        || (p.variants || []).some(v => String(v.article) === anyCode));

    check("дописаний символ не веде на товар з артикулом «" + anyCode + "»",
        !api.searchProducts(products, notACode).some(p => p.id === own.id));
}

console.log("\n[6] Відбір один на весь сайт");
{
    // Раніше пошукова панель і каталог кожен сам звав matchesQuery —
    // і додати щось в одному місці означало б забути про друге.
    check("пошукова панель кличе searchProducts",
        /const matches = searchProducts\(/.test(common));

    check("каталог кличе той самий searchProducts",
        /list = searchProducts\(list, text\);/.test(catalog));

    check("власної копії відбору в каталозі немає",
        !/matchesQuery\(/.test(catalog));

    // Посилання «показати все» веде в каталог тим самим запитом —
    // інакше код, знайдений у панелі, у каталозі знову нічого не дав би.
    check("«показати все» несе запит у каталог",
        /catalog\?search=\$\{encodeURIComponent/.test(common));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
