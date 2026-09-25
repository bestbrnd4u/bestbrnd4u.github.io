// Обіцянка про розмір каталогу мусить бути правдою.
//
// ІСТОРІЯ (заміряно на проді 25.09.2026)
// --------------------------------------
// На сторінці /catalog під заголовком стояло «Понад 500 моделей від
// світових брендів», а рівно двома рядками нижче каталог сам писав:
//
//     131 товар
//
// Те саме число обіцяла й головна («Понад 500 оригінальних моделей»)
// і data/home.json, з якого головна бере текст. Насправді в каталозі
// 103 товари, або 131 картка з урахуванням кольорів — тобто число
// завищене вчетверо, і сторінка спростовує саму себе на тому ж екрані.
//
// Для покупця це не дрібниця: перше, що він читає про магазин, —
// неправда, яку видно одразу. Для нас — ще й недостовірна реклама.
//
// ЧОМУ ТЕСТ, А НЕ ПРОСТО ПРАВКА
// -----------------------------
// Правку я зробив («Понад 100»), але число само собою протухне знову:
// каталог живе, товари додають і прибирають, а текст лежить у трьох
// місцях і жодне з них не пов'язане з каталогом. Тест ловить обидва
// напрямки — і завищення, і розбіжність між копіями.
//
// Прив'язка НЕ до конкретного числа: тест не знає, що там має бути
// «100». Він знає правило — обіцяне не більше за наявне. Захоче
// власник написати «Понад 130» і додасть товарів — тест мовчатиме.
const fs = require("fs");
const path = require("path");
const { loadProducts } = require("./helpers/products");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// Скільки товарів насправді. Джерело — data/products/*.json, а не
// згенерований products.json: у свіжому клоні агрегат відстає.
const products = loadProducts().length;

// Де може лежати обіцянка. Теку p/ і таксономії не скануємо: там
// підзаголовок підставляє генератор із власного intro сторінки.
const SOURCES = fs.readdirSync(ROOT)
    .filter(f => f.endsWith(".html"))
    .concat(["data/home.json"])
    .filter(f => fs.existsSync(path.join(ROOT, f)));

// «Понад 500 моделей», «Понад 100 оригінальних моделей», «Понад
// 1 000 товарів».
//
// Між числом і словом може стояти означення — саме на ньому перша
// версія цього тесту й спіткнулась: вона бачила лише catalog.html і
// мовчки проходила повз головну, де стоїть «оригінальних». Тому
// пропускаємо до двох слів, а всередині числа — нерозривний пробіл,
// бо так пишуть тисячі.
const CLAIM_RE = /Понад\s+(\d[\d   ]*)\s*(?:[\p{L}]+\s+){0,2}?(модел|товар|найменув|позиц)/giu;

const claims = [];

SOURCES.forEach(rel => {

    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");

    let m;
    CLAIM_RE.lastIndex = 0;

    while ((m = CLAIM_RE.exec(text)) !== null) {
        claims.push({
            file: rel,
            number: Number(m[1].replace(/[  \s]/g, "")),
            text: m[0].replace(/\s+/g, " ")
        });
    }

});

console.log("\n[1] Обіцянка не більша за каталог");
{
    check("у каталозі є товари", products > 0, `знайдено ${products}`);

    // Нуль обіцянок — теж нормально: значить, ніхто нічого не обіцяв.
    console.log(`  · обіцянок знайдено: ${claims.length}, товарів у каталозі: ${products}`);

    const inflated = claims.filter(c => c.number > products);

    check("жодна обіцянка не завищена",
        inflated.length === 0,
        inflated.map(c => `${c.file}: «${c.text}» проти ${products}`).join("; "));
}

console.log("\n[2] Копії обіцянки не розходяться");
{
    // Той самий текст лежить у трьох місцях: catalog.html, index.html
    // і data/home.json (звідки головна бере його через адмінку).
    // Якщо власник поправить одне — решта мусить не відстати.
    const numbers = [...new Set(claims.map(c => c.number))];

    check("усі копії називають одне число",
        numbers.length <= 1,
        claims.map(c => `${c.file}: ${c.number}`).join("; "));
}

console.log("\n[3] Головна і data/home.json кажуть однаково");
{
    // Текст героя на index.html — статична копія того, що лежить у
    // home.json: JS підміняє його вже після завантаження. Розбіжність
    // означає, що пошуковик проіндексує одне, а покупець побачить інше.
    const home = JSON.parse(fs.readFileSync(path.join(ROOT, "data/home.json"), "utf8"));
    const promised = (home.hero && home.hero.text) || "";

    const claimInJson = (promised.match(/Понад\s+(\d[\d   ]*)/) || [])[1];

    const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const heroBlock = (index.match(/<p id="heroText">([\s\S]*?)<\/p>/) || [])[1] || "";
    const claimInHtml = (heroBlock.match(/Понад\s+(\d[\d   ]*)/) || [])[1];

    if (claimInJson === undefined && claimInHtml === undefined) {
        check("у героя немає числа — звіряти нічого", true);
    } else {
        check("число в героя збігається з home.json",
            String(claimInJson).trim() === String(claimInHtml).trim(),
            `home.json: ${claimInJson}, index.html: ${claimInHtml}`);
    }
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
