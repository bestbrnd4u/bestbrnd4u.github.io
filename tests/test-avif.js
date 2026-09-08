// AVIF: те саме фото на третину легше.
//
// ЩО ЗАМІРЯНО на 24 справжніх файлах каталогу:
//   webp 399 КБ → avif 256 КБ  (на 36% менше)
//   300 мс на файл конвертації
//
// Фото — дві третини ваги сторінки каталогу, тож 36% тут коштують
// більше за решту правок разом.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. AVIF існує для КОЖНОГО фото з переліку копій. Це головне: верстка
//    не має окремого переліку для avif — вона вважає, що «є в
//    data/image-variants.json» означає й «має avif». Розійдеться —
//    браузер попросить файл, якого немає, і картка лишиться порожньою.
//
// 2. AVIF справді легший. Копія, важча за webp, означала б, що
//    налаштування стиснення зіпсували, і сайт став би важчим.
//
// 3. Широкий кадр (1200) у avif НЕ переводиться навмисно: він у
//    статичній розмітці й вантажиться до будь-якого JS.
//
// 4. Формат обирається за здатністю браузера ДЕКОДУВАТИ, а не за
//    canvas.toDataURL (той показує вміння записувати — інша річ).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const DIR = path.join(ROOT, "assets/images/products/uploads");

const manifest = JSON.parse(read("data/image-variants.json"));
const images = require("../scripts/normalize-product-images.js");

console.log("\n[1] Для кожного фото з переліку є avif обох ширин");
{
    check(`фото в переліку: ${manifest.length}`, manifest.length > 100);

    check("формати оголошені в збірці",
        JSON.stringify(images.VARIANT_FORMATS) === JSON.stringify(["webp", "avif"]),
        JSON.stringify(images.VARIANT_FORMATS));

    const missing = [];

    manifest.forEach(name => {

        const stem = name.replace(/\.webp$/, "");

        images.VARIANT_WIDTHS.forEach(width => {

            if (!fs.existsSync(path.join(DIR, `${stem}-${width}.avif`))) {
                missing.push(`${stem}-${width}.avif`);
            }

        });

    });

    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ: фото зареєстроване в переліку, але
    // avif для нього не зробили — браузер попросить файл, якого немає.
    check(`avif є для всіх (${manifest.length * images.VARIANT_WIDTHS.length} файлів)`,
        missing.length === 0, `бракує ${missing.length}: ${missing.slice(0, 3).join(", ")}`);
}

console.log("\n[2] AVIF справді легший за webp");
{
    const pairs = manifest.map(name => {

        const stem = name.replace(/\.webp$/, "");

        return images.VARIANT_WIDTHS.map(width => ({
            webp: path.join(DIR, `${stem}-${width}.webp`),
            avif: path.join(DIR, `${stem}-${width}.avif`)
        }));

    }).flat().filter(p => fs.existsSync(p.webp) && fs.existsSync(p.avif));

    check(`пар для порівняння: ${pairs.length}`, pairs.length > 100);

    const webpBytes = pairs.reduce((s, p) => s + fs.statSync(p.webp).size, 0);
    const avifBytes = pairs.reduce((s, p) => s + fs.statSync(p.avif).size, 0);

    const share = Math.round((avifBytes / webpBytes) * 100);

    check(`avif важить ${share}% від webp (${Math.round(webpBytes / 1024 / 1024)} → ${Math.round(avifBytes / 1024 / 1024)} МБ)`,
        share < 85, `${share}%`);

    // Окремий файл, ІСТОТНО важчий за свій webp, означає зіпсовані
    // налаштування стиснення саме на ньому.
    //
    // Поріг у кілобайт, а не «жодного байта»: заміряно, що на майже
    // білих мініатюрах (товар на білому тлі, 300px) avif буває важчим
    // на 4-65 байтів — це накладні витрати контейнера, а webp там уже
    // стиснутий майже до межі. Таких файлів три з 900, разом 107
    // байтів. Червоніти через це означало б вимкнути перевірку зовсім.
    const heavier = pairs.filter(p =>
        fs.statSync(p.avif).size - fs.statSync(p.webp).size > 1024);

    check("жоден avif не важчий за свій webp більш як на кілобайт",
        heavier.length === 0,
        `${heavier.length}: ${heavier.slice(0, 2).map(p => path.basename(p.avif)).join(", ")}`);

    // І скільком узагалі не пощастило — для розуміння масштабу.
    const anyHeavier = pairs.filter(p =>
        fs.statSync(p.avif).size >= fs.statSync(p.webp).size);

    check(`важчих узагалі: ${anyHeavier.length} з ${pairs.length}`,
        anyHeavier.length < pairs.length * 0.02, anyHeavier.length);
}

console.log("\n[3] Широкий кадр лишається webp");
{
    // 1200 у avif не переводимо навмисно: герой сторінки товару лежить
    // у статичній розмітці й починає вантажитись на 238-й мілісекунді,
    // ще до JS. Підмінити його потім означало б завантажити фото двічі.
    const wide = manifest.slice(0, 20)
        .map(name => path.join(DIR, name.replace(/\.webp$/, ".avif")))
        .filter(file => fs.existsSync(file));

    check("avif на всю ширину не робимо", wide.length === 0,
        wide.slice(0, 2).map(f => path.basename(f)).join(", "));

    const ui = read("assets/js/ui.js");

    check("у переліку avif немає 1200",
        /format === "avif"[\s\S]{0,400}-600\.avif\$\{v\} 600w`/.test(ui));

    check("у webp 1200 лишився", /\$\{pathPart\}\$\{v\} 1200w/.test(ui));
}

console.log("\n[4] Формат обирається за здатністю ДЕКОДУВАТИ");
{
    const ui = read("assets/js/ui.js");

    check("є перевірка підтримки", /function avifSupported\(\)/.test(ui));

    // canvas.toDataURL показує, чи браузер умієте avif ЗАПИСУВАТИ —
    // Safari довго вмів читати й не вмів писати.
    check("не через canvas.toDataURL", !/toDataURL\(["']image\/avif/.test(ui));

    check("через декодування 1×1", /probe\.src = "data:image\/avif;base64,/.test(ui));

    check("перевіряємо один раз на сторінку", /if \(avifReady\) return avifReady;/.test(ui));

    check("не вийшло — просто webp", /probe\.onerror = \(\) => resolve\(false\)/.test(ui));

    check("формат передається в buildSrcSet", /buildSrcSet\(src, format\)/.test(ui));
}

console.log("\n[5] Збірка не переробляє те, що вже є");
{
    const script = read("scripts/normalize-product-images.js");

    // 300 мс на файл × 900 копій — це чотири з половиною хвилини.
    // Робити це щоразу означало б платити їх на кожній збірці.
    check("копія перезбирається лише коли її немає або вона застаріла",
        /function stale\(name\)/.test(script) && /mtimeMs < baseTime - 1000/.test(script));

    check("формати перевіряються окремо",
        /VARIANT_FORMATS\.forEach\(format/.test(script));

    check("avif робиться з оригіналу, а не з webp-копії",
        /AVIF робимо з ОРИГІНАЛУ/.test(script));

    check("якість avif своя (55 ≈ 82 у webp)",
        images.AVIF_QUALITY === 55, images.AVIF_QUALITY);

    // «Копії вже є» мусить враховувати ОБА формати, інакше фото
    // зареєструється в переліку без avif.
    check("реєстрація вимагає обох форматів",
        /hasCopies = VARIANT_FORMATS\.every/.test(script));
}

console.log(failures ? `\n❌ Провалено: ${failures}` : "\n✅ AVIF: те саме фото на третину легше");

process.exit(failures ? 1 : 0);
