// Пошук: слова, а не суцільний рядок.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ПОРЯДОК СЛІВ НЕ ВАЖИТЬ. Збіг перевірявся одним includes(), тобто
//    слова мусили стояти в даних поруч і в тому самому порядку.
//    Заміряно: «гаманець coach» знаходило 2 товари, «coach гаманець» —
//    нуль. Вісім із двадцяти одного реального запиту давали нуль.
//
// 2. ОДИН МАТЧЕР НА ВЕСЬ САЙТ. Той самий перелік полів і той самий
//    includes() лежали ДВІЧІ — у пошуковій панелі й у фільтрі каталогу.
//    Дві копії однієї логіки неминуче розходяться.
//
// 3. КОРОТКІ СЛОВА — ЦІЛИМ СЛОВОМ. «мк» знаходилось усередині «марк»,
//    і запит із двох літер давав 47 товарів сміття.
//
// 4. КОРІНЬ НЕ РІЖЕТЬСЯ НАДТО ГЛИБОКО. Перша версія вкорочувала будь-
//    яке слово на два символи, і «лакост» ставало «лако» — запит
//    знаходив 35 товарів, першим із яких ішов Marc Jacobs зі словом
//    «Лаконічна» в описі.
//
// 5. КИРИЛИЦЯ БРЕНДІВ ЖИВЕ БІЛЯ БРЕНДА. «сумка коач», «мішель корс» —
//    саме так половина покупців набирає назви. Раніше написання
//    вписували руками в кожен товар, і виходило нерівно: Coach 4 із
//    17, Lacoste 0 із 10.

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
const catalogJs = read("assets/js/catalog.js");

// Витягуємо матчер із common.js: увесь файл тут не запустити (він чекає
// DOM), а сам збіг — звичайні функції.
const matcher = (() => {

    const from = common.indexOf("function searchTokens");
    const to = common.indexOf("async function runGlobalSearch");

    if (from < 0 || to < 0) throw new Error("не знайшов блок пошуку в common.js");

    const block = common.slice(from, to);

    return {
        matches: new Function("product", "q", block + "; return matchesQuery(product, q);"),
        tokens: new Function("q", block + "; return searchTokens(q);"),
        hasWord: new Function("h", "w", block + "; return hasSearchWord(h, w);"),
    };

})();

// Товари беремо з ЗІБРАНОГО каталогу: саме його читає сайт, і саме там
// лежать написання брендів, які додає збірка.
const catalog = (() => {

    const raw = JSON.parse(read("data/catalog.json"));

    return Array.isArray(raw) ? raw : (raw.products || []);

})();

const found = query => catalog.filter(product => matcher.matches(product, query));

console.log("\n[1] Розбір запиту на слова");
{
    check("пробіли розділяють", matcher.tokens("сумка coach").join("|") === "сумка|coach");

    // Дефіс мусить розділяти так само, як пробіл: інакше «окуляри ray
    // ban» і «ray-ban окуляри» поводяться по-різному.
    check("дефіс розділяє так само", matcher.tokens("ray-ban").join("|") === "ray|ban");

    check("розділові знаки не стають словами",
        matcher.tokens("  сумка,  coach!  ").join("|") === "сумка|coach");

    check("цифри лишаються словом", matcher.tokens("mk9154").join("|") === "mk9154");

    check("порожній запит не дає слів", matcher.tokens("   ").length === 0);

    check("порожній запит нічого не фільтрує",
        matcher.matches(catalog[0], "") === true);
}

console.log("\n[2] Порядок слів більше не важить");
{
    // Регресія в обидві сторони: обидва порядки мусять давати ОДНЕ
    // число, інакше пошук залежить від того, як людина думає.
    const pairs = [
        ["гаманець coach", "coach гаманець"],
        ["окуляри ray ban", "ray-ban окуляри"],
        ["сумочка marc jacobs", "marc jacobs сумочка"],
        ["годинник michael kors", "michael kors годинник"],
    ];

    pairs.forEach(([a, b]) => {

        const na = found(a).length;
        const nb = found(b).length;

        check(`«${a}» = «${b}»`, na === nb && na > 0, `${na} проти ${nb}`);

    });
}

console.log("\n[3] Знаходить те, що раніше давало нуль");
{
    // Кожен із цих запитів до правки повертав ПОРОЖНЬО.
    [
        "coach гаманець",
        "окуляри ray ban",
        "marc jacobs сумочка",
        "сумки чорні",
        "кросівки лакост",
        "сумка коач",
        "мішель корс",
    ].forEach(query => {
        check(`«${query}»`, found(query).length > 0, "нічого не знайдено");
    });
}

console.log("\n[4] Короткі слова — цілим словом");
{
    // «мк» усередині «марк» давало 47 товарів сміття.
    check("двобуквене не збігається всередині слова",
        matcher.hasWord("марк джейкобс", "мк") === false);

    check("але збігається окремим словом",
        matcher.hasWord("michael kors мк годинник", "мк") === true);

    check("на початку рядка теж", matcher.hasWord("мк годинник", "мк") === true);
    check("у кінці рядка теж", matcher.hasWord("годинник мк", "мк") === true);

    // На справжніх даних «мк» мусить дати саме Michael Kors.
    const mk = found("мк");

    check(`«мк» → ${mk.length} товарів, усі Michael Kors`,
        mk.length > 0 && mk.every(p => p.brand === "Michael Kors"),
        [...new Set(mk.map(p => p.brand))].join(", "));
}

console.log("\n[5] Корінь не ріжеться надто глибоко");
{
    // Закінчення відкидається — інакше «сумки чорні» не знаходило
    // «чорний».
    check("«чорні» знаходить «чорний»",
        matcher.hasWord("сумка чорний", "чорні") === true);

    check("«окуляри» знаходить «окуляр»",
        matcher.hasWord("сонцезахисний окуляр", "окуляри") === true);

    // РЕГРЕСІЯ. Два символи з шестибуквеного слова різали корінь:
    // «лакост» → «лако» знаходилось у «Лаконічна».
    check("«лакост» не знаходить «лаконічна»",
        matcher.hasWord("лаконічна сумка", "лакост") === false);

    check("правило про сім літер записане",
        /word\.length >= 7 \? 2 : 1/.test(common));

    check("є найкоротший корінь", /const MIN_STEM = 4;/.test(common));

    // І на справжніх даних: «лакост» мусить давати Lacoste, а не
    // випадкові описи.
    const lacoste = found("лакост");

    check(`«лакост» → ${lacoste.length}, перший Lacoste`,
        lacoste.length > 0 && lacoste[0].brand === "Lacoste",
        lacoste.length ? lacoste[0].brand : "нічого");

    check("серед них немає чужих брендів",
        lacoste.every(p => p.brand === "Lacoste"),
        [...new Set(lacoste.map(p => p.brand))].join(", "));
}

console.log("\n[6] Один матчер на весь сайт");
{
    // Копія логіки в каталозі — саме те, через що правка в одному
    // місці не діяла в іншому.
    //
    // ПРАВИЛО ПРО РЕЗУЛЬТАТ, А НЕ ПРО НАЗВУ. Тут стояло «каталог
    // кличе matchesQuery» — і перевірка почервоніла, щойно пошук
    // навчився шукати за артикулом: спільним входом став
    // searchProducts(), який пробує спершу код, а потім слова. Логіка
    // при цьому лишилась одна, тобто правило не порушено — а тест
    // стеріг МЕХАНІЗМ, не результат.
    //
    // Тепер перевіряємо те, що справді важливе: каталог кличе відбір,
    // і той відбір оголошений у common.js, а не тут.
    const entry = (catalogJs.match(/list = (\w+)\(list, text\);/) || [])[1];

    check("каталог кличе спільний відбір", Boolean(entry), entry || "не знайшов виклику");

    check(`«${entry}» оголошений у common.js`,
        Boolean(entry) && new RegExp("function " + entry + "\\(").test(common));

    check("і власної копії відбору в каталозі немає",
        Boolean(entry) && !new RegExp("function " + entry + "\\(").test(catalogJs));

    check("своєї копії в каталозі немає",
        !/haystack\.includes\(text\)/.test(catalogJs));

    // Перелік полів мусить бути ОДИН.
    const haystacks = (common.match(/product\.searchKeywords \|\| \[\]/g) || []).length
        + (catalogJs.match(/product\.searchKeywords \|\| \[\]/g) || []).length;

    check("перелік полів оголошений один раз", haystacks === 1, `знайдено ${haystacks}`);

    check("він винесений в окрему функцію",
        /function searchHaystack\(product\)/.test(common));
}

console.log("\n[7] Кириличні написання брендів");
{
    const brands = JSON.parse(read("data/brands.json"));

    const withAliases = brands.filter(b => Array.isArray(b.aliases) && b.aliases.length);

    check(`написання є в ${withAliases.length} із ${brands.length} брендів`,
        withAliases.length === brands.length,
        brands.filter(b => !(b.aliases || []).length).map(b => b.name).join(", "));

    // Написання лежать біля БРЕНДА — одне місце на всі його товари.
    // Раніше їх вписували руками в кожен товар, і Lacoste не мав ні
    // одного з десяти.
    check("джерело — файл бренду, а не товару",
        fs.existsSync(path.join(ROOT, "data/brands/coach.json"))
        && (JSON.parse(read("data/brands/coach.json")).aliases || []).length > 0);

    check("build-brands переносить їх в агрегат",
        /aliases:/.test(read("scripts/build-brands.js")));

    check("build-products розкладає по товарах",
        /function brandAliases\(\)/.test(read("scripts/build-products.js")));

    // Порожні рядки в списку адмінки не мусять ставати словом: порожнє
    // слово збігається з будь-чим.
    check("порожні рядки відкидаються",
        /\.filter\(Boolean\)/.test(read("scripts/build-brands.js")));

    // І головне — вони справді доїхали в каталог.
    const coach = catalog.filter(p => p.brand === "Coach");

    const withCyr = coach.filter(p =>
        (p.searchKeywords || []).some(w => /коуч|коач/i.test(String(w))));

    check(`у всіх ${coach.length} товарів Coach є «коуч/коач»`,
        withCyr.length === coach.length, `${withCyr.length} із ${coach.length}`);

    // Написання дописуються, а не замінюють свої ключові слова.
    check("власні ключові слова не затерті",
        coach.some(p => (p.searchKeywords || []).some(w => /кросбоді|клатч|через плече/i.test(String(w)))));

    check("поле є в адмінці",
        /Написання кирилицею/.test(read("admin/config.yml")));
}

console.log("\n[8] Точність не зламалась");
{
    // Пошук мусить лишатись пошуком, а не показувати пів каталогу на
    // будь-який запит.
    const cases = [
        ["окуляри", p => /окуляр/i.test(String(p.category))],
        ["гаманці", p => /гаман/i.test(String(p.category))],
        ["годинник", p => /годинник/i.test(String(p.category))],
    ];

    cases.forEach(([query, ok]) => {

        const list = found(query);

        const wrong = list.filter(p => !ok(p));

        check(`«${query}» → ${list.length}, чужих ${wrong.length}`,
            list.length > 0 && wrong.length <= 1,
            wrong.map(p => `${p.brand}/${p.category}`).slice(0, 3).join(", "));

    });

    // Запит, якого в каталозі немає, мусить давати нуль — інакше пошук
    // просто нічого не фільтрує.
    check("вигаданий запит не знаходить нічого",
        found("вертоліт").length === 0);

    check("і два слова, з яких одне чуже, теж",
        found("сумка вертоліт").length === 0);
}

console.log(failures === 0
    ? "\n✅ Пошук: порядок слів не важить, кирилиця брендів працює, сміття немає\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
