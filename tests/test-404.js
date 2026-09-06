// Сторінка «404»: єдина сторінка, яку відкривають випадково.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ІМ'Я ФАЙЛУ. І GitHub Pages, і Cloudflare Pages шукають рівно
//    404.html у корені. Перейменували — і замість магазину людина
//    бачить типову заглушку хостингу без шапки й каталогу.
//
// 2. <base href="/">. Сторінка віддається під БУДЬ-ЯКОЮ адресою,
//    зокрема глибокою (/p/<slug>/). Відносні шляхи від такої адреси
//    ведуть у нікуди — сторінка помилки приїхала б без стилів.
//
// 3. 404 ЛИШАЄТЬСЯ 404. Ніяких автоматичних переходів на «схожий»
//    товар: це брехня і покупцеві, і пошуковику.
//
// 4. СТОРІНКА НЕ КЛИЧЕ В ІНДЕКС. Її немає ні в sitemap, ні у фіді.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const html = read("404.html");
const code = read("assets/js/not-found.js");

console.log("\n[1] Файл там, де його шукає хостинг");
{
    check("404.html лежить у корені", fs.existsSync(path.join(ROOT, "404.html")));

    check("це повноцінна сторінка магазину, а не заглушка",
        /<header/.test(html) && /<footer/.test(html) && /mega-menu/.test(html));

    check("шапка веде в каталог", /href="catalog"/.test(html));

    check("є кошик і обране", /id="cartCount"/.test(html) && /id="favCount"/.test(html));
}

console.log("\n[2] Сторінка працює з будь-якої глибини");
{
    check("є <base href=\"/\">", /<base href="\/">/.test(html));

    // Порядок важливий: <base> мусить стояти ДО першого відносного
    // шляху, інакше браузер устигне порахувати його по-старому.
    const base = html.indexOf("<base href=\"/\">");
    const firstAsset = html.indexOf("href=\"assets/");

    check("<base> стоїть до першого відносного шляху",
        base > 0 && base < firstAsset, `${base} проти ${firstAsset}`);

    // Кодування оголошується першим — далі в розмітці кирилиця.
    check("<meta charset> перед <base>",
        html.indexOf("<meta charset") < base);
}

console.log("\n[3] Сторінка помилки не кличе в індекс");
{
    check("noindex у розмітці",
        /<meta name="robots" content="noindex">/.test(html));

    check("немає canonical", !/rel="canonical"/.test(html));

    const sitemap = read("sitemap.xml");

    check("немає в sitemap", !/404/.test(sitemap));

    if (fs.existsSync(path.join(ROOT, "feed.xml"))) {
        check("немає у фіді", !/404\.html/.test(read("feed.xml")));
    }
}

console.log("\n[4] Замість глухого кута — товари");
{
    check("модуль підключено", /assets\/js\/not-found\.js/.test(html));

    // Він малює картки тим самим кодом, що й каталог (ui.js), і бере
    // товари тим самим кешем (common.js). Обидва мусять бути раніше.
    const tag = name => html.indexOf(`<script src="assets/js/${name}`);

    check("ui.js підключено раніше", tag("ui.js") > 0 && tag("ui.js") < tag("not-found.js"));
    check("common.js підключено раніше", tag("common.js") > 0 && tag("common.js") < tag("not-found.js"));

    check("є місце для схожих товарів",
        /id="notFoundGrid"/.test(html) && /id="notFoundSuggestions"/.test(html));

    check("блок схований, поки товарів немає",
        /<section class="similar" id="notFoundSuggestions" hidden>/.test(html));

    check("є переглянуті товари",
        /id="recentlyViewedGrid"/.test(html) && /id="recentlyViewedSection"/.test(html));

    check("пошук відкриває ту саму панель, що й лупа в шапці",
        /openSearchOverlay/.test(code) && /id="notFoundSearchBtn"/.test(html));

    // Автоматичного переходу бути не повинно: 404 має лишитись 404.
    check("немає автоматичного перенаправлення",
        !/location\.replace\(/.test(code) && !/location\.assign\(/.test(code));
}

console.log("\n[5] Підбір товару за адресою");
{
    const NotFound = require("../assets/js/not-found.js");

    check("адреса товару розібрана",
        NotFound.slugFrom("/p/coach-sumka-tabby-26/") === "coach-sumka-tabby-26",
        NotFound.slugFrom("/p/coach-sumka-tabby-26/"));

    check("зі звичайної сторінки нічого не беремо",
        NotFound.slugFrom("/delivery-payment") === "");

    check("побита адреса не валить розбір",
        NotFound.slugFrom("/p/%E0%A4%A/") === "%E0%A4%A");

    // Слова, спільні для половини каталогу, збіг не рахують.
    check("службові слова відкинуті",
        NotFound.words("zhinocha-sumka-coach-tabby").join(",") === "coach,tabby",
        NotFound.words("zhinocha-sumka-coach-tabby").join(","));

    const needles = NotFound.words("coach-tabby-26");

    const sameBrand = { brand: "Coach", title: "Сумка Willow", slug: "coach-sumka-willow" };
    const sameWord = { brand: "Guess", title: "Сумка Tabby", slug: "guess-sumka-tabby" };

    check("той самий бренд важить більше за схоже слово",
        NotFound.score(sameBrand, needles) > NotFound.score(sameWord, needles),
        `${NotFound.score(sameBrand, needles)} проти ${NotFound.score(sameWord, needles)}`);

    check("чужий товар не потрапляє в добірку",
        NotFound.score({ brand: "Nike", title: "Кросівки Air", slug: "nike-krosivky-air" }, needles) === 0);

    const ranked = NotFound.rank([sameWord, sameBrand], needles);

    check("найближчий — першим", ranked[0] === sameBrand);

    check("більше восьми карток не показуємо", NotFound.LIMIT <= 8);
}

console.log(failures === 0
    ? "\n✅ 404: сторінка магазину з товарами, а не заглушка хостингу\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
