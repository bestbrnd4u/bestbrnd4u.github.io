// Банери сайту — з власних фото магазину.
//
// Збирає два набори:
//   • панель пошуку — плитки «Чоловікам» / «Жінкам», 2:1;
//   • мега-меню — квадратні іконки статей, 1:1.
//
// НАВІЩО ЦЕ, А НЕ КАРТИНКА З ІНТЕРНЕТУ
// -------------------------------------
// Раніше плитки «Чоловікам» і «Жінкам» тягнули два знімки з
// images.pexels.com прямо в стилі елемента. Три причини це змінити:
//
//   1. Чужі фото на комерційній вітрині — питання ліцензії. Магазин
//      продає товар, а не веде блог, і безкоштовність стоку не робить
//      використання автоматично дозволеним.
//   2. Головна сторінка вже очищена від зовнішніх фото — у наборі
//      tests/test-home-static-sync.js для цього є окрема перевірка
//      «немає pexels». Панель пошуку лишалась винятком, про який
//      перевірка не знала.
//   3. Зовнішній хост — це запит до чужого сервера щоразу, коли хтось
//      відкриває пошук, і чужа доступність замість своєї.
//
// Тому банер збирається з фотографій, які вже лежать у каталозі: вони
// зняті для цього магазину, показують справжній товар і нікому більше
// не належать.
//
// ЩО НА ВИХОДІ
// -------------
// 800×400 (2:1) — рівно та пропорція, у якій плитка малюється тепер
// (.search-promo-banner, aspect-ratio: 2/1). З запасом на retina:
// найширша плитка на десктопі — 348 CSS-пікселів.
//
// Поверх фото — темний градієнт: без нього білий підпис «Чоловікам»
// губиться на світлих знімках.

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "images", "banners");

// Розміри рахуються від того, як елемент реально малюється, ×2 на retina.
//
//   .search-promo-banner — aspect-ratio 2/1, найширша плитка 348 CSS-px
//   .mega-item img       — 88×88 фіксовано
//
// Окремий файл під телефон потрібен не через пропорцію (вона тепер
// однакова), а через РОЗМІР: на 161 CSS-піксель смуга з трьох товарів
// перетворюється на кашу, тож там показуємо один великий предмет.
const JOBS = [
    {
        key: "searchDesktop",
        width: 800, height: 400, tiles: 3,
        files: { "Чоловікам": "search-men.webp", "Жінкам": "search-women.webp" }
    },
    {
        key: "searchMobile",
        width: 400, height: 200, tiles: 1,
        files: { "Чоловікам": "search-men-sm.webp", "Жінкам": "search-women-sm.webp" }
    },
    {
        key: "megaMenu",
        width: 200, height: 200, tiles: 1,
        files: {
            "Чоловікам": "mega-men.webp",
            "Жінкам": "mega-women.webp",
            "Унісекс": "mega-unisex.webp",
            "Дітям": "mega-kids.webp"
        }
    }
];

function localPath(src) {
    return path.join(ROOT, String(src).replace(/^\//, ""));
}

// Вибір товарів для банера.
//
// Перші три підряд не годяться: у «Жінкам» на початку списку стоять
// три пари окулярів, і банер виходив з трьох темних предметів, які
// під затемненням майже не читались.
//
// Тому дві умови:
//   • різні категорії — сумка, окуляри, годинник виглядають як
//     добірка, а три однакові речі — як помилка;
//   • світліший і контрастніший кадр виграє: банер темний, і чорна
//     річ на ньому просто зникає.
async function pickPhotos(products, gender, tiles) {

    const candidates = products
        .filter(p => !gender || (p.gender || []).includes(gender))
        .map(p => ({ product: p, file: localPath((p.images || [])[0] || "") }))
        .filter(c => c.file && fs.existsSync(c.file));

    // контраст кадру: stdev яскравості. Порожній білий фон дає низький,
    // виразний товар на тлі — високий.
    const scored = await Promise.all(candidates.map(async c => {

        try {

            const stats = await sharp(c.file).greyscale().stats();

            return { ...c, score: stats.channels[0].stdev };

        } catch (error) {

            return { ...c, score: 0 };

        }

    }));

    scored.sort((a, b) => b.score - a.score);

    const picked = [];
    const usedCategories = new Set();

    // перший прохід — по одному товару з категорії
    scored.forEach(c => {

        if (picked.length >= tiles) return;

        const category = c.product.category || "";

        if (usedCategories.has(category)) return;

        usedCategories.add(category);
        picked.push(c.file);

    });

    // якщо категорій менше, ніж плиток, добираємо найконтрастнішими
    scored.forEach(c => {
        if (picked.length < tiles && !picked.includes(c.file)) picked.push(c.file);
    });

    return picked;

}

async function buildBanner(photos, outFile, W, H) {

    const slice = Math.ceil(W / photos.length);

    // Фото товарів зняті на різних тлах — біле, сіре, тепле. Складені
    // впритул вони читаються як три випадкові кадри, а не як один
    // банер. Тому кожен трохи приглушуємо за насиченістю й яскравістю:
    // тло зближується, а сам товар лишається впізнаваним.
    const parts = await Promise.all(photos.map(async (file, index) => ({
        input: await sharp(file)
            .resize(slice, H, { fit: "cover", position: "attention" })
            .modulate({ brightness: 0.98, saturation: 0.92 })
            .toBuffer(),
        left: index * slice,
        top: 0
    })));

    // Градієнт зліва направо: підпис стоїть у лівому нижньому куті,
    // тож найтемніше має бути саме там.
    // Два шари: рівний тон по всьому кадру склеює три знімки в один
    // банер і ховає стики, а вертикальний градієнт гарантує, що низ —
    // де стоїть білий підпис — темний незалежно від того, яке фото
    // випало крайнім лівим.
    const overlay = Buffer.from(
        `<svg width="${W}" height="${H}">
            <defs>
                <linearGradient id="down" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#0f1729" stop-opacity="0.10"/>
                    <stop offset="55%" stop-color="#0f1729" stop-opacity="0.32"/>
                    <stop offset="100%" stop-color="#0f1729" stop-opacity="0.86"/>
                </linearGradient>
            </defs>
            <rect width="${W}" height="${H}" fill="#0f1729" opacity="0.10"/>
            <rect width="${W}" height="${H}" fill="url(#down)"/>
        </svg>`
    );

    await sharp({
        create: {
            width: W, height: H, channels: 3,
            background: { r: 15, g: 23, b: 41 }
        }
    })
        .composite([...parts, { input: overlay, left: 0, top: 0 }])
        .webp({ quality: 82 })
        .toFile(outFile);

}

// ФОНИ ГОЛОВНОЇ (банер і промо-блок)
//
// ЧОМУ ЇХ ТРЕБА ГЕНЕРУВАТИ ОКРЕМО
// --------------------------------
// Раніше фоном стояла звичайна викладка товарів на всю ширину, а
// поверх неї — білий текст. Текст лягав просто на сумки: читався
// погано, товар теж було не роздивитись. Рятував лише суцільний
// затемнювальний шар на 55%, від якого фото ставало каламутним.
//
// Тут кадр будується під верстку: товари займають ТІЛЬКИ ту частину
// кадру, де тексту немає, а зона тексту лишається темною й чистою.
//
//   десктоп — текст ліворуч, тож товари праворуч;
//   телефон — текст по центру (.hero на ≤768px: text-align:center,
//             margin:auto), тож товари внизу.
//
// Окремий мобільний файл потрібен саме тому, що це РІЗНІ композиції, а
// не той самий кадр іншого розміру: обрізати широку смугу 2400×1080 у
// вертикальні 750×1000 означає лишити від неї вузьку середину.
const BACKDROPS = [
    { file: "home-hero.webp", width: 1600, height: 720, zone: "right", tiles: 2 },
    { file: "home-hero-sm.webp", width: 750, height: 1000, zone: "bottom", tiles: 1 },
    { file: "home-promo.webp", width: 1600, height: 640, zone: "right", tiles: 2 },
    { file: "home-promo-sm.webp", width: 750, height: 900, zone: "bottom", tiles: 1 }
];

async function buildBackdrop(job, photos) {

    const horizontal = job.zone === "right";

    // Фото займають ВЕСЬ кадр, а чисту зону під текст робить градієнт.
    //
    // Спершу товари клали лише в частину кадру, а решту лишали темною.
    // Виходила різка межа: світлий фон знімків упирався в темний холст,
    // і банер читався як вклеєний прямокутник. Спроба розчинити краї
    // маскою теж не допомогла — librsvg не тримає вкладені режими
    // накладання всередині <mask>.
    //
    // Так простіше й надійніше: суцільна смуга знімків, поверх —
    // напрямлений градієнт. Там, де текст, він майже непрозорий, тож
    // товар під написом не проглядає (саме на це й була скарга), а з
    // протилежного боку фото лишається видимим. Швів немає взагалі.
    const slotW = Math.ceil(job.width / photos.length);

    const parts = await Promise.all(photos.map(async (file, index) => ({
        input: await sharp(file)
            .resize(slotW, job.height, { fit: "cover", position: "attention" })
            .modulate({ brightness: 0.98, saturation: 0.95 })
            .toBuffer(),
        left: index * slotW,
        top: 0
    })));

    // Напрямок: на десктопі текст ліворуч, на телефоні — по центру
    // (.hero на ≤768px має text-align:center і margin:auto), тож там
    // темним робимо верх, а товари лишаємо внизу.
    const dir = horizontal
        ? 'x1="0" y1="0" x2="1" y2="0"'
        : 'x1="0" y1="0" x2="0" y2="1"';

    const overlay = Buffer.from(
        `<svg width="${job.width}" height="${job.height}">
            <defs>
                <linearGradient id="g" ${dir}>
                    <stop offset="0%" stop-color="#0f1729" stop-opacity="1"/>
                    <stop offset="${horizontal ? 46 : 48}%" stop-color="#0f1729" stop-opacity="0.97"/>
                    <stop offset="${horizontal ? 72 : 74}%" stop-color="#0f1729" stop-opacity="0.45"/>
                    <stop offset="100%" stop-color="#0f1729" stop-opacity="0.20"/>
                </linearGradient>
            </defs>
            <rect width="${job.width}" height="${job.height}" fill="url(#g)"/>
        </svg>`
    );

    await sharp({
        create: {
            width: job.width, height: job.height, channels: 3,
            background: { r: 15, g: 23, b: 41 }
        }
    })
        .composite([...parts, { input: overlay, left: 0, top: 0 }])
        .webp({ quality: 84 })
        .toFile(path.join(OUT_DIR, job.file));

}

async function main() {

    const products = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "products.json"), "utf8"));

    fs.mkdirSync(OUT_DIR, { recursive: true });

    for (const job of JOBS) {

        for (const [gender, file] of Object.entries(job.files)) {

            const photos = await pickPhotos(products, gender, job.tiles);

            const outFile = path.join(OUT_DIR, file);

            if (!photos.length) {

                // «Дітям» поки не має жодного товару. Малюємо рівну
                // плитку у фірмовому тоні: порожній <img> у мега-меню
                // виглядав би як зламана верстка, а плитка — просто як
                // розділ, куди ще не завезли асортимент.
                await sharp({
                    create: {
                        width: job.width, height: job.height, channels: 3,
                        background: { r: 22, g: 32, b: 56 }
                    }
                }).webp({ quality: 82 }).toFile(outFile);

                console.log(`${file}: ${job.width}×${job.height} — без фото (немає товарів «${gender}»)`);

                continue;

            }

            await buildBanner(photos, outFile, job.width, job.height);

            console.log(`${file}: ${job.width}×${job.height} з ${photos.length} фото`);

        }

    }

    // фони головної — з товарів будь-якої статі, беремо найконтрастніші
    for (const job of BACKDROPS) {

        const photos = await pickPhotos(products, null, job.tiles);

        if (!photos.length) {
            console.warn(`::warning::Немає фото для ${job.file}`);
            continue;
        }

        await buildBackdrop(job, photos);

        console.log(`${job.file}: ${job.width}×${job.height}, текст ${job.zone === "right" ? "ліворуч" : "зверху"}`);

    }

}

main().catch(error => {
    console.error("::error::Не вдалося зібрати банери:", error.message);
    process.exit(1);
});
