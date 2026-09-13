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

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
