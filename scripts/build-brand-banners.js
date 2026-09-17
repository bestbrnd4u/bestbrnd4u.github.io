// ======================================
// Банери брендів — із фото власних товарів
//
// НАВІЩО НЕ БРАТИ КАРТИНКИ БРЕНДІВ
// ---------------------------------
// Банер у нас широкий (1600×400), а кампанійні знімки брендів
// вертикальні: на coach.com найбільші зображення 480×763 — людина на
// повний зріст. Вирізати з такого смугу 4:1 означає різати по голові.
//
// Фото товарів для цього годяться краще за будь-яку чужу зйомку: вони
// вже приведені до одного вигляду (1200×1500 на білому тлі), їх багато,
// і вони показують саме те, що можна купити.
//
// ЧОМУ ДВА РОЗМІРИ
// -----------------
// Смуга 4:1 на телефоні шириною 375px перетворюється на стрічку 94px
// заввишки: товари в ній не роздивитись. Тому окремий файл 800×450 (16:9) —
// та сама добірка, але в пропорції, придатній для вузького екрана.
// Поле для нього є і в адмінці, щоб менеджер міг замінити картинку
// руками й не гадав, чому на телефоні видно інше.
//
// ЩО СКРИПТ НЕ ЧІПАЄ
// -------------------
// Банер, завантажений руками. Поле перезаписується лише тоді, коли
// воно порожнє або вказує на файл, який цей же скрипт і зробив.
// ======================================

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "assets/images/brands");
const BRANDS_DIR = path.join(ROOT, "data/brands");

// Розміри — ті самі, що в підказках адмінки. Числа лежать тут поруч,
// бо саме цей скрипт їх і забезпечує.
const SIZES = {
    banner: { file: "banner", width: 1600, height: 400, max: 5 },
    mobile: { file: "banner-mobile", width: 800, height: 450, max: 3 },
};

// Поле навколо фото — не для краси. У верстці банер має стелю по
// висоті (.brand-hero-banner, max-height), і на широкому контейнері
// object-fit:cover зрізає йому верх і низ. Поле — це запас, який
// з'їдається замість самих товарів: зрізається біле, а не сумка.
const PAD = 40;
const GAP = 20;

// Прибираємо ?v=… — версію дописує apply-cache-version.js, а на диску
// файл лежить без неї.
const clean = (src) => String(src || "").split("?")[0];

function photosOf(products) {

    const seen = new Set();
    const photos = [];

    // Порядок за id: щоб та сама збірка давала той самий банер, а не
    // новий щоразу через випадковий порядок у JSON.
    [...products].sort((a, b) => (a.id || 0) - (b.id || 0)).forEach((product) => {

        const first = ((product.variants || [])[0] || {}).images
            || product.images
            || [];

        const src = clean(first[0]);

        if (!src || seen.has(src)) return;

        const file = path.join(ROOT, src);

        if (!fs.existsSync(file)) return;

        seen.add(src);
        photos.push(file);

    });

    return photos;

}

async function compose(photos, size) {

    const count = Math.min(photos.length, size.max);

    if (!count) return null;

    const maxHeight = size.height - PAD * 2;
    const maxRow = size.width - PAD * 2;

    // Пропорція фото товару — 4:5. Беремо з першого знімка, а не
    // вписуємо числом: якщо колись формат зміниться, банер не поїде.
    const meta = await sharp(photos[0]).metadata();
    const ratio = meta.width / meta.height;

    let photoHeight = maxHeight;
    let photoWidth = Math.round(photoHeight * ratio);

    if (photoWidth * count + GAP * (count - 1) > maxRow) {
        photoWidth = Math.floor((maxRow - GAP * (count - 1)) / count);
        photoHeight = Math.round(photoWidth / ratio);
    }

    const rowWidth = photoWidth * count + GAP * (count - 1);

    const left = Math.round((size.width - rowWidth) / 2);
    const top = Math.round((size.height - photoHeight) / 2);

    const tiles = await Promise.all(photos.slice(0, count).map(async (file, index) => ({
        input: await sharp(file)
            .resize(photoWidth, photoHeight, { fit: "cover", position: "centre" })
            .toBuffer(),
        left: left + index * (photoWidth + GAP),
        top,
    })));

    return sharp({
        create: {
            width: size.width,
            height: size.height,
            channels: 3,
            // Фото товарів уже на білому — так шви між ними не видно.
            background: { r: 255, g: 255, b: 255 },
        },
    }).composite(tiles).webp({ quality: 82 }).toBuffer();

}

async function main() {

    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data/catalog.json"), "utf8"));

    const products = Array.isArray(catalog) ? catalog : (catalog.products || []);

    const byBrand = new Map();

    products.forEach((product) => {

        const name = String(product.brand || "").trim();

        if (!name) return;

        if (!byBrand.has(name)) byBrand.set(name, []);

        byBrand.get(name).push(product);

    });

    fs.mkdirSync(OUT, { recursive: true });

    const files = fs.readdirSync(BRANDS_DIR).filter((file) => file.endsWith(".json"));

    let made = 0;
    let skipped = 0;

    for (const file of files) {

        const recordPath = path.join(BRANDS_DIR, file);
        const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));

        const slug = file.replace(/\.json$/, "");
        const photos = photosOf(byBrand.get(String(record.name || "").trim()) || []);

        if (!photos.length) {
            console.log(`   ⏭  ${slug}: немає фото товарів`);
            continue;
        }

        const report = [];

        for (const [key, size] of Object.entries(SIZES)) {

            const field = key === "banner" ? "banner" : "bannerMobile";
            const name = `${slug}-${size.file}.webp`;
            const target = `/assets/images/brands/${name}`;

            // Своє не чіпаємо: менеджер міг завантажити власну картинку.
            const current = clean(record[field]);

            if (current && current !== target) {
                skipped += 1;
                report.push(`${key}: своя картинка, не чіпаємо`);
                continue;
            }

            const buffer = await compose(photos, size);

            if (!buffer) continue;

            fs.writeFileSync(path.join(OUT, name), buffer);

            record[field] = target;

            report.push(`${key} ${size.width}×${size.height} `
                + `(${Math.min(photos.length, size.max)} фото, ${(buffer.length / 1024).toFixed(0)} КБ)`);

            made += 1;

        }

        const ordered = {
            name: record.name,
            aliases: record.aliases,
            logo: record.logo,
            banner: record.banner,
            bannerMobile: record.bannerMobile,
            title: record.title,
            description: record.description,
        };

        Object.keys(ordered).forEach((key) => {
            if (ordered[key] === undefined) delete ordered[key];
        });

        fs.writeFileSync(recordPath, JSON.stringify(ordered, null, 2) + "\n", "utf8");

        console.log(`   ✓ ${slug}: ${report.join("; ")}`);

    }

    console.log(`Готово: ${made} банерів${skipped ? `, пропущено своїх: ${skipped}` : ""}`);

}

main().catch((error) => { console.error(error); process.exit(1); });
