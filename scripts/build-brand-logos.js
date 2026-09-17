// Перезбирає всі логотипи БЕЗ прозорого поля навколо.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Логотипи вписувались у полотно 400×80 по центру. Для широких написів
// (Coach, Balenciaga) це нормально — вони займають полотно повністю.
// Але вузькі знаки (Ray-Ban, adidas × Stella, Tory Burch) опинялись
// посеред прозорого поля.
//
// У верстці картинка обмежена шириною (max-width:190px на сторінці
// товару), і браузер стискає ПОЛОТНО ЦІЛКОМ. Тобто разом зі знаком
// зменшується й порожнеча навколо нього — а виглядає це як великий
// відступ зліва, ніби логотип з'їхав від краю колонки. Власник це й
// побачив на сторінці Ray-Ban.
//
// ЯК ТЕПЕР
// ---------
// Поля немає зовсім: картинка обрізається по самому знаку. Висота
// зводиться до 80px — саме вона й вирівнює логотипи між собою, бо в
// рядку око порівнює висоту, а не ширину. Ширина виходить своя в
// кожного: напис ширший, круглий знак вужчий, і це правильно.
//
// Виняток — написи ширші за 5:1 (Coach — 9:1). Їм ширина впирається в
// 400px, і висота виходить менша за 80. Інакше файл був би 720px
// завширшки заради тієї самої картинки на екрані.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const HERE = path.join(ROOT, "data/brand-logo-sources");
const OUT = path.join(ROOT, "assets/images/brands");

const HEIGHT = 80;
const MAX_WIDTH = 400;

// Джерело для кожного бренду. Перелічено поіменно, а не вгадано за
// назвою файлу: у теці лежать і забраковані варіанти (invicta-logo.svg
// — це INVICTA RACING жовтим, ray-ban-logo.svg — сторінка «Access
// Denied», яку віддав сайт замість картинки).
const SOURCES = {
    "adidas-by-stella-mccartney": "adidas-by-stella-mccartney-logo.png",
    "alain-mikli": "alain-mikli-logo.png",
    "armani-exchange": "armani-exchange-logo.png",
    "balenciaga": "balenciaga-logo.svg",
    "burberry": "burberry-logo.svg",
    "coach": "coach-logo.svg",
    "gucci": "gucci-logo.svg",
    "invicta": "invicta-logo.png",
    "jacquemus": "jacquemus-logo.svg",
    "jimmy-choo": "jimmy-choo-logo.svg",
    "jw-pei": "jw-pei-logo.png",
    "lacoste": "lacoste-logo.svg",
    "love-moschino": "love-moschino-logo.png",
    "marc-jacobs": "marc-jacobs-logo.svg",
    "mathey-tissot": "mathey-tissot-logo.png",
    "michael-kors": "michael-kors-logo.svg",
    "prada": "prada-logo.svg",
    "ray-ban": "ray-ban-logo.png",
    "saint-laurent": "saint-laurent-logo.svg",
    "tissot": "tissot-logo.svg",
    "tory-burch": "tory-burch-logo.png",
};

async function build(slug, file) {

    const input = path.join(HERE, file);

    if (!fs.existsSync(input)) return `${slug}: НЕМАЄ ДЖЕРЕЛА ${file}`;

    // density — щоб SVG растеризувався з запасом, а не розмито.
    let image = sharp(input, { density: 600 });

    // Поле навколо знаку прибираємо ДО масштабування: інакше воно
    // з'їло б частину відведеної висоти.
    const trimmed = await image.trim({ threshold: 2 }).png().toBuffer();

    const meta = await sharp(trimmed).metadata();

    const ratio = meta.width / meta.height;

    const height = ratio > MAX_WIDTH / HEIGHT ? Math.round(MAX_WIDTH / ratio) : HEIGHT;

    // Округлення вгору могло дати 404px замість 400 — притискаємо до межі.
    const width = Math.min(MAX_WIDTH, Math.round(height * ratio));

    await sharp(trimmed)
        .resize(width, height, { fit: "fill" })
        .png({ compressionLevel: 9 })
        .toFile(path.join(OUT, `${slug}-logo.png`));

    const size = fs.statSync(path.join(OUT, `${slug}-logo.png`)).size;

    return `${slug}: ${width}×${height}  (${(size / 1024).toFixed(0)} КБ)`;

}

(async () => {

    for (const [slug, file] of Object.entries(SOURCES)) {
        console.log("  " + await build(slug, file));
    }

})();
