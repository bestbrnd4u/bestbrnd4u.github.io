// Відмінювання після числа: «1 товар», а не «1 товарів».
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Слово стояло в розмітці окремим текстом і не мінялось ніколи:
//
//     <span id="productsCount">0</span>
//     товарів
//
// JS підставляв число, слово лишалось множинним. У каталозі акції з
// єдиною сумкою це читалось як «У цій акції 1 товарів».
//
// ЧОМУ ПРАВИЛО ОКРЕМО, А НЕ В КОЖНОМУ ЛІЧИЛЬНИКУ
// -----------------------------------------------
// Лічильників на сайті кілька: каталог, сторінка акції, кнопка
// мобільних фільтрів, кількість самих фільтрів. Копія правила вже
// існувала — pluralizeFilters() у catalog.js — і саме те, що вона
// була одна на «фільтри» й жодної на «товари», і дало помилку.
//
// НАЙКРИХКІШЕ ТУТ — СОТНІ
// ------------------------
// Українське правило дивиться на ДВІ останні цифри, і 11-14 —
// виняток із правила про останню цифру. Найчастіша помилка в таких
// помічниках — перевірити mod 10 перед mod 100 і отримати «11 товар».
// Тому нижче перевіряються саме ці числа.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const common = read("assets/js/common.js");

// Жива функція з common.js — перевіряємо поведінку, а не текст.
const api = (() => {

    const parts = [
        /function plural\(count[\s\S]*?\n}\n/,
        /function pluralProducts[\s\S]*?\n}\n/
    ].map(pattern => {

        const found = common.match(pattern);

        if (!found) throw new Error("не знайшов у common.js: " + pattern);

        return found[0];

    });

    return new Function(parts.join("\n") + "return { plural, pluralProducts };")();

})();

console.log("\n[1] Число й слово узгоджені");
{
    const expect = {
        0: "товарів",
        1: "товар",
        2: "товари",
        3: "товари",
        4: "товари",
        5: "товарів",
        // Виняток, заради якого все й пишеться окремою функцією.
        11: "товарів",
        12: "товарів",
        13: "товарів",
        14: "товарів",
        15: "товарів",
        21: "товар",
        22: "товари",
        25: "товарів",
        101: "товар",
        // 111 — та сама пастка, що й 11, але за сотнею.
        111: "товарів",
        112: "товарів",
        1001: "товар"
    };

    const wrong = Object.keys(expect)
        .filter(n => api.pluralProducts(Number(n)) !== expect[n])
        .map(n => `${n}: «${api.pluralProducts(Number(n))}» замість «${expect[n]}»`);

    check(`перевірено чисел — ${Object.keys(expect).length}`, wrong.length === 0,
        wrong.join("; "));
}

console.log("\n[2] Правило одне на весь сайт");
{
    const catalog = read("assets/js/catalog.js");

    check("помічник живе в common.js", /function plural\(count/.test(common));

    // Копія правила в catalog.js і була причиною: вона знала про
    // фільтри й нічого не знала про товари.
    check("у catalog.js більше немає власної копії правила",
        !/mod10 === 1 && mod100 !== 11/.test(catalog)
        && !/mod100 >= 12 && mod100 <= 14/.test(catalog),
        "правило знову продубльоване");

    check("відмінювання фільтрів теж через спільне правило",
        /return plural\(n, "фільтр"/.test(catalog));
}

console.log("\n[3] Слово в розмітці — окремий вузол, який можна змінити");
{
    // Поки слово лежало звичайним текстом поруч зі <span>, JS не мав
    // до чого дотягнутись — саме тому воно й не мінялось.
    [["catalog.html", "каталог"], ["promo.html", "сторінка акції"]].forEach(([file, name]) => {

        const html = read(file);

        check(`${name}: лічильник товарів має вузол для слова`,
            /<span id="productsCountWord">/.test(html));

        check(`${name}: кнопка мобільних фільтрів теж`,
            /<span id="mfCountWord">/.test(html) && /<span id="mfSubCountWord">/.test(html));

        // Голого «товарів» поруч із числом лишитись не мало.
        check(`${name}: не лишилось зашитого слова біля числа`,
            !/<\/span>\s*товарів/.test(html));

    });

    const catalog = read("assets/js/catalog.js");

    check("каталог підписує число", /productsCountWord[\s\S]{0,200}pluralProducts/.test(catalog));

    check("кнопка фільтрів теж", /mfCountWord[\s\S]{0,200}=\s*word|word[\s\S]{0,200}mfCountWord/.test(catalog));
}

console.log("\n[4] Сторінки брендів і категорій успадкують те саме");
{
    // Їх збирає scripts/build-taxonomy-pages.js із catalog.html, тож
    // окремо правити не треба — але варто переконатись, що шаблон
    // саме цей: інакше правка тут мовчки їх омине.
    const script = read("scripts/build-taxonomy-pages.js");

    check("шаблон таксономії — catalog.html",
        /TEMPLATE_FILE = path\.join\(ROOT, "catalog\.html"\)/.test(script));

    // Якщо сторінки вже зібрані — слово має бути й там.
    const built = path.join(ROOT, "brands/marc-jacobs/index.html");

    if (fs.existsSync(built)) {
        check("зібрана сторінка бренду вже має вузол",
            /<span id="productsCountWord">/.test(fs.readFileSync(built, "utf8")),
            "перезберіть: npm run build");
    }
}

console.log("\n[5] Копія правила на боці збірки не розійшлася з оригіналом");
{
    // ЧОМУ КОПІЯ ВЗАГАЛІ Є
    // ---------------------
    // Оригінал у common.js — браузерний файл, підключений тегом
    // <script>; він нічого не експортує, і Node його не підтягне.
    // Переписувати common.js у модуль заради трьох рядків означало б
    // зачепити кожну сторінку сайту.
    //
    // Тому scripts/plural.js повторює правило — так само, як
    // dealActive() у scripts/promo-deals.js повторює promoTiming().
    // І так само розійтись їм не дає перевірка нижче: обидві
    // проганяються на тих самих числах.
    const build = require("../scripts/plural");

    // Не вибіркові числа, а суцільний проміжок плюс сотні: помилка в
    // такому помічнику майже завжди сидить на межі 11-14 або на
    // переході через сотню.
    const numbers = [];
    for (let n = 0; n <= 130; n++) numbers.push(n);

    const diff = numbers.filter(n =>
        build.plural(n, "товар", "товари", "товарів")
        !== api.plural(n, "товар", "товари", "товарів"));

    check(`обидві копії згодні на ${numbers.length} числах`,
        diff.length === 0,
        diff.slice(0, 6).map(n => `${n}: збірка «${build.plural(n, "товар", "товари", "товарів")}»`
            + ` проти сайту «${api.plural(n, "товар", "товари", "товарів")}»`).join("; "));

    check("withCount ставить число перед словом",
        build.withCount(21, "бренд", "бренди", "брендів") === "21 бренд",
        build.withCount(21, "бренд", "бренди", "брендів"));
}

console.log("\n[6] Хаби каталогу підписані правильно");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    // ---------------
    // Слово в HUB_TITLES стояло одне, в родовому відмінку множини, і
    // від числа не залежало. На 24.09.2026 два хаби з трьох читались
    // неправильно: «21 брендів» і «3 розділів».
    //
    // Це не журнал збірки: той самий рядок іде і в видимий текст
    // сторінки, і в опис для Google. Тобто помилку бачив кожен, хто
    // відкривав /brands/ або знаходив сторінку в пошуку.
    const script = read("scripts/build-taxonomy-pages.js");

    check("хаби беруть слово через відмінювання",
        /withCount\(pages\.length/.test(script));

    check("слово задано трьома формами, а не одним",
        /word: \["бренд", "бренди", "брендів"\]/.test(script));

    // І сам результат — на зібраних сторінках.
    [
        ["brands/index.html", ["бренд", "бренди", "брендів"]],
        ["categories/index.html", ["категорія", "категорії", "категорій"]],
        ["departments/index.html", ["розділ", "розділи", "розділів"]]
    ].forEach(([rel, forms]) => {

        const full = path.join(ROOT, rel);

        if (!fs.existsSync(full)) return;

        const html = fs.readFileSync(full, "utf8");
        const hit = html.match(/<meta[^>]*name="description"[^>]*content="(\d+) ([^ ]+) у каталозі/);

        if (!hit) {
            check(`${rel}: підпис знайдено`, false, "не знайшов опис");
            return;
        }

        const [, count, word] = hit;

        const { plural } = require("../scripts/plural");

        check(`${rel}: «${count} ${word}»`,
            word === plural(+count, ...forms),
            `мало б бути «${count} ${plural(+count, ...forms)}»`);

    });
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
