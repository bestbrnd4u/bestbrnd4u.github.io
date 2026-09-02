// Латиниця в адресі товару.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Фільтр каталогу латиницю вже клав, а посилання НА САМ ТОВАР — ні:
//
//   /p/marc-jacobs-sumka-…/?color=%D0%91%D0%B5%D0%B6%D0%B5%D0%B2%D0%B8%D0%B9&size=ONESIZE
//
// Вісім літер «Бежевий» перетворювались на 42 символи. Таку адресу не
// вставиш у пост, а в месенджері вона ще й переноситься навпіл.
//
// Причина була не в товарі: productUrl() у common.js — ЄДИНЕ місце, де
// адреса товару збирається (каталог, кошик, обране, пошук, редірект зі
// старого ?id=). Кирилиця йшла звідти в усі п'ять.
//
// ЧОМУ ПЕРЕВІРКИ САМЕ ТАКІ
// -------------------------
// Головне не «у коді є toSlug», а ЗАМКНЕНЕ КОЛО: колір пішов в адресу
// латиницею — і сторінка товару відкрилась саме на ньому. Тому ганяємо
// круговий обхід на справжніх кольорах каталогу.
//
// І окремо — ПІДКЛЮЧЕННЯ. productUrl живе в common.js, а перетворювач
// у translit.js. Сторінка з common.js без translit.js мовчки писала б
// кирилицю: половина сайту віддавала б одну адресу, половина іншу — на
// ту саму сторінку. Тому перевіряємо кожну сторінку, а не одну.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const { toSlug } = require("../assets/js/translit.js");

const common = read("assets/js/common.js");
const product = read("assets/js/product.js");

// Витягуємо справжні функції з файлів, а не переписуємо їх поруч:
// саме розбіжність копії й оригіналу пропустила падіння пошуку в
// адмінці (див. tests/test-product-picker.js).
const { productUrl } = new Function("window",
    common.slice(common.indexOf("function productUrl"),
        common.indexOf("function absoluteUrl"))
    + "; return { productUrl };")({ Translit: { toSlug } });

const { findVariantByColor } = new Function("window",
    product.slice(product.indexOf("function findVariantByColor"),
        product.indexOf("function renderProduct(product) {"))
    + "; return { findVariantByColor };")({ Translit: { toSlug } });

const products = JSON.parse(read("data/products.json"));


console.log("\n[1] Колір в адресі — латиницею");
{
    const url = productUrl({ slug: "sumka-test" }, { color: "Бежевий", size: "ONESIZE" });

    check("кирилиці в адресі не лишилось", !/[а-яіїєґ]/i.test(url), url);

    check("і жодного відсоткового кодування", !/%[0-9A-F]{2}/i.test(url), url);

    check("колір читається очима", url.includes("color=bezhevyi"), url);

    // Саме той приклад, який приніс власник.
    const real = productUrl(
        { slug: "marc-jacobs-sumka-kros-bodi-zhinocha-shkiriana-marc-jacobs-t" },
        { color: "Бежевий", size: "ONESIZE" });

    check("адреса з листа стала короткою",
        real === "/p/marc-jacobs-sumka-kros-bodi-zhinocha-shkiriana-marc-jacobs-t/?color=bezhevyi&size=ONESIZE",
        real);
}

console.log("\n[2] Решту адреси не зачепило");
{
    check("розмір лишається як є",
        productUrl({ slug: "x" }, { color: "Чорний", size: "ONESIZE" }).includes("size=ONESIZE"));

    check("латинський колір не псується",
        productUrl({ slug: "x" }, { color: "Nero" }).includes("color=nero"));

    check("без кольору адреса чиста",
        productUrl({ slug: "x" }) === "/p/x/",
        productUrl({ slug: "x" }));

    check("порожній колір не плодить ?color=",
        productUrl({ slug: "x" }, { color: "", size: "M" }) === "/p/x/?size=M",
        productUrl({ slug: "x" }, { color: "", size: "M" }));

    // Запасна адреса для товару без slug — там уже є ?id=
    check("запасний ?id= склеюється через &",
        productUrl({ id: 7 }, { color: "Синій" }) === "/product?id=7&color=synii",
        productUrl({ id: 7 }, { color: "Синій" }));
}

console.log("\n[3] Замкнене коло на справжніх кольорах каталогу");
{
    const variants = [];

    products.forEach(p => (p.variants || []).forEach(v => v.color && variants.push(v.color)));

    const unique = [...new Set(variants)];

    const broken = unique.filter(color => {

        const url = productUrl({ slug: "x" }, { color });

        const token = new URLSearchParams(url.split("?")[1]).get("color");

        // сторінка має знайти саме цей колір серед варіантів
        return findVariantByColor([{ color: "Інший" }, { color }], token) !== 1;

    });

    check(`усі ${unique.length} кольорів каталогу вертаються собою`,
        broken.length === 0, broken.slice(0, 5).join(", "));

    const cyr = unique.filter(c => /[а-яіїєґ]/i.test(c));

    check(`з них кирилицею — ${cyr.length}, і всі стають латиницею`,
        cyr.every(c => !/[а-яіїєґ]/i.test(productUrl({ slug: "x" }, { color: c }))));
}

console.log("\n[4] Старі посилання не ламаються");
{
    const variants = [{ color: "Чорний" }, { color: "Бежевий" }];

    check("кирилиця зі старого посилання ще працює",
        findVariantByColor(variants, "Бежевий") === 1);

    check("нова латиниця працює",
        findVariantByColor(variants, "bezhevyi") === 1);

    check("регістр не заважає",
        findVariantByColor(variants, "БЕЖЕВИЙ") === 1);

    check("невідомий колір → -1, і сторінка відкриє перший",
        findVariantByColor(variants, "zzz") === -1);

    check("порожній параметр → -1",
        findVariantByColor(variants, null) === -1);

    // Без перетворювача лишається точний збіг: сторінка відкриється на
    // першому кольорі, але НЕ впаде.
    const noTranslit = new Function("window",
        product.slice(product.indexOf("function findVariantByColor"),
            product.indexOf("function renderProduct(product) {"))
        + "; return { findVariantByColor };")({});

    check("без Translit не падає, а відкатується на точний збіг",
        noTranslit.findVariantByColor(variants, "Бежевий") === 1
        && noTranslit.findVariantByColor(variants, "bezhevyi") === -1);
}

console.log("\n[4b] Перемикання кольору на сторінці товару теж пише латиницю");
{
    // Це було останнє місце, яке повертало кирилицю в адресний рядок:
    // перемкнув колір — і «?color=Коричнево-чорний» у скопійованому
    // посиланні знову перетворювався на «?color=%D0%9A%D0%BE%D1%80…».
    //
    // Адреси товарів, акцій і фільтрів каталогу латиницею вже були, і
    // саме цю невідповідність найлегше не помітити: у власному
    // адресному рядку кирилиця видна нормальним текстом.
    const common = read("assets/js/common.js");

    const блок = common.slice(common.indexOf('if (document.getElementById("productPage"))'),
        common.indexOf('if (document.getElementById("productPage"))') + 1400);

    check("колір перед записом переганяється в латиницю",
        /window\.Translit\.toSlug\(colorBtn\.dataset\.color\)/.test(блок), блок.slice(0, 80));

    check("кирилиця як є більше не пишеться",
        !/url\.searchParams\.set\("color", colorBtn\.dataset\.color\)/.test(common));

    // Без перетворювача (не підключився) лишаємо як було: адресний
    // рядок — не причина ламати сторінку.
    check("без Translit відкат на старе значення",
        /latin \|\| colorBtn\.dataset\.color/.test(блок));
}

console.log("\n[5] Перетворювач підключено скрізь, де збирається адреса");
{
    // productUrl живе в common.js. Сторінка з common.js, але без
    // translit.js, мовчки писала б кирилицю — і та сама картка вела б
    // на дві різні адреси залежно від того, звідки на неї натиснули.
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const missing = pages.filter(f => {

        const html = read(f);

        return html.includes("assets/js/common.js")
            && !html.includes("assets/js/translit.js");

    });

    check("жодна сторінка не лишилась без translit.js",
        missing.length === 0, missing.join(", "));

    // Порядок важливий: перший же рендер картки кличе productUrl, і
    // якщо translit.js ще не виконався, в адресу піде кирилиця.
    const html = read("product.html");

    check("translit.js підключений ДО common.js",
        html.indexOf("assets/js/translit.js") < html.indexOf("assets/js/common.js"));
}

console.log("\n[6] Згенеровані сторінки товарів успадкували підключення");
{
    const dir = path.join(ROOT, "p");

    const dirs = fs.readdirSync(dir).filter(d => fs.statSync(path.join(dir, d)).isDirectory());

    // Кириличні теки — це редіректи-заглушки на латинську адресу, у
    // них взагалі немає скриптів (див. build-product-pages.js).
    const real = dirs.filter(d =>
        fs.readFileSync(path.join(dir, d, "index.html"), "utf8").includes("assets/js/common.js"));

    const missing = real.filter(d =>
        !fs.readFileSync(path.join(dir, d, "index.html"), "utf8").includes("assets/js/translit.js"));

    check(`усі ${real.length} сторінок товарів мають translit.js`,
        missing.length === 0, missing.slice(0, 3).join(", "));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
