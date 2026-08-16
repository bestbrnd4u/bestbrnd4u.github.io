// Скорочує задовгі імена файлів у assets/images і переписує всі
// посилання на них.
//
// НАВІЩО (реальна поломка, серпень 2026)
// ---------------------------------------
// `git pull` на робочій машині падав так:
//
//   error: cannot stat 'assets/images/products/uploads/gi9qwcglkga7…_42.jpg':
//   Filename too long
//
// У теці лежали 5 файлів з іменами по 196 символів — типовий слід
// вставки зображення з буфера чи з чужої CDN, коли ім'ям стає весь
// хеш-рядок. Разом з префіксом шляху це 227 символів, а Windows за
// замовчуванням не дає створити шлях довший за 260 символів (MAX_PATH)
// з урахуванням шляху до самої теки репозиторію. Тобто файли в
// репозиторії є, GitHub Pages їх віддає, а локально викачати
// репозиторій уже неможливо — і разом з ними не викачуються ВСІ
// наступні файли з того ж коміту.
//
// Видаляти такі картинки не потрібно: достатньо дати їм коротке ім'я.
// Скрипт робить це автоматично і одразу править посилання в data/,
// html і js, щоб жодне фото не відвалилось.
//
// ЯК БУДУЄТЬСЯ НОВЕ ІМ'Я
// ----------------------
//   <перші 40 символів старого імені>-<8 символів sha1>[-300|-600|-1200].<ext>
//
// Хеш рахується від ПОВНОГО старого імені, тож:
//   • два різні файли з однаковим початком не зіллються в один;
//   • повторний запуск нічого не міняє (скрипт ідемпотентний);
//   • варіанти одного фото (-300/-600/-1200, які генерує ресайзер)
//     отримують спільний префікс і не розсинхронізуються.
//
// ЗАПУСК: node scripts/normalize-media-names.js
// В CI викликається з build-products.yml ДО збірки даних, щоб довге
// ім'я було виправлене ще до того, як хтось спробує зробити pull.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const MEDIA_DIRS = ["assets/images"];

// Межа на ім'я файлу. 80 символів — із запасом: навіть з найдовшим
// префіксом теки (assets/images/products/uploads/ = 31) і суфіксом
// варіанта повний шлях лишається коротшим за 120 символів, тобто
// вміщується в MAX_PATH навіть якщо репозиторій лежить глибоко.
const MAX_NAME = 80;

// Де шукати посилання на файли. Теку p/ не чіпаємо — вона повністю
// перегенеровується build-product-pages.js із свіжих даних.
const TEXT_DIRS = ["data", "assets/js", "assets/css", "admin", "scripts"];
const TEXT_ROOT_FILES = ["sitemap.xml"];
const TEXT_EXT = [".json", ".js", ".html", ".css", ".xml", ".yml", ".md"];

const VARIANT_RE = /-(300|600|1200)$/;

function shortName(fileName) {

    const ext = path.extname(fileName);
    let stem = path.basename(fileName, ext);

    // суфікс розміру відриваємо і повертаємо на місце в кінці, щоб
    // ресайзер і далі впізнавав свої варіанти
    const variantMatch = stem.match(VARIANT_RE);
    const variant = variantMatch ? variantMatch[0] : "";

    if (variant) stem = stem.slice(0, -variant.length);

    const hash = crypto.createHash("sha1").update(stem).digest("hex").slice(0, 8);

    return `${stem.slice(0, 40)}-${hash}${variant}${ext}`;

}

function walk(dir, onFile) {

    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) walk(full, onFile);
        else onFile(full, entry.name);

    });

}

function collectTextFiles() {

    const files = [];

    TEXT_DIRS.forEach(rel => walk(path.join(ROOT, rel), full => {
        if (TEXT_EXT.includes(path.extname(full))) files.push(full);
    }));

    TEXT_ROOT_FILES.forEach(rel => {
        const full = path.join(ROOT, rel);
        if (fs.existsSync(full)) files.push(full);
    });

    fs.readdirSync(ROOT)
        .filter(f => f.endsWith(".html"))
        .forEach(f => files.push(path.join(ROOT, f)));

    return files;

}

function main() {

    const renames = new Map();

    MEDIA_DIRS.forEach(rel => walk(path.join(ROOT, rel), (full, name) => {

        if (name.length <= MAX_NAME) return;

        renames.set(full, path.join(path.dirname(full), shortName(name)));

    }));

    if (renames.size === 0) {
        console.log(`Готово: задовгих імен немає (межа ${MAX_NAME} символів)`);
        return;
    }

    // 1. перейменовуємо файли
    const nameMap = new Map();

    renames.forEach((to, from) => {

        if (fs.existsSync(to)) {
            console.error(`::error::${path.relative(ROOT, to)} вже існує — пропущено`);
            return;
        }

        fs.renameSync(from, to);

        nameMap.set(path.basename(from), path.basename(to));

        console.log(`  ${path.basename(from).length} → ${path.basename(to).length}  ${path.basename(to)}`);

    });

    // 2. переписуємо посилання
    let touched = 0;

    collectTextFiles().forEach(file => {

        const before = fs.readFileSync(file, "utf8");
        let after = before;

        nameMap.forEach((to, from) => {
            if (after.includes(from)) after = after.split(from).join(to);
        });

        if (after !== before) {
            fs.writeFileSync(file, after, "utf8");
            touched++;
            console.log(`  посилання оновлено: ${path.relative(ROOT, file)}`);
        }

    });

    console.log(`Готово: перейменовано ${nameMap.size} файлів, змінено ${touched} файлів з посиланнями`);

}

module.exports = { shortName, MAX_NAME };

if (require.main === module) main();
