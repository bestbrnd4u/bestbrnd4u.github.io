// Прибирає з медіатеки адмінки файли, на які ніхто не посилається:
// старі фото, які замінили новими, картинки з видалених товарів,
// випадкові завантаження.
//
// НАВІЩО
// -------
// Decap CMS показує в діалозі "Images" ВСЕ, що лежить у media_folder.
// За кілька місяців роботи туди набивається сотні файлів, і серед них
// уже не знайти потрібний: у списку впереміш живі фото товарів,
// їхні зменшені копії й сміття від давніх імпортів. Видаляти вручну
// небезпечно — легко зачепити фото, яке десь використовується.
//
// Скрипт робить це передбачувано: рахує, на що є посилання, а решту
// ПЕРЕНОСИТЬ (не видаляє) в assets/images/_archive/. Ця тека лежить
// поза media_folder, тож в адмінці її не видно, але файли нікуди не
// зникли — їх можна повернути однією командою.
//
// ЯК РАХУЄТЬСЯ "ВИКОРИСТОВУЄТЬСЯ"
// --------------------------------
// Пошук іде ВІД ФАЙЛУ ДО ТЕКСТУ, а не навпаки. Тобто ми не виловлюємо
// з даних усе схоже на шлях до картинки регуляркою, а беремо кожен
// реальний файл із теки і шукаємо його ім'я в даних. Це принципово:
// перша версія цього скрипта шукала регуляркою по списку розширень і
// вирішила, що video360_…_1022p.mp4 не використовується — просто тому,
// що .mp4 не було в списку. Насправді це відео товару. При пошуку від
// файлу таких промахів не буває за побудовою: список розширень узагалі
// не потрібен.
//
// Додатково враховано:
//   • зменшені копії. Фото лежить у трьох ширинах (x.webp, x-300.webp,
//     x-600.webp), а в даних записана лише повна. Варіант вважається
//     потрібним, поки потрібна його основа;
//   • кирилиця в іменах. У даних шлях може бути закодований
//     (%D0%…%D0%… замість літер), тож звіряємось і з кодованою формою;
//   • тека p/ у пошуку НЕ бере участі: вона повністю генерується з
//     data/, і посилання в ній — не самостійне джерело правди.
//
// ВІДСТРОЧКА
// ----------
// Файл не їде в архів одразу, як став непотрібним. Спершу він
// потрапляє в список очікування (pending.json) і лежить там
// ARCHIVE_AFTER_DAYS днів. Це захищає найчастіший сценарій: фото
// завантажили через медіатеку, а до товару прикріпили пізніше —
// між цими двома діями воно формально нікому не потрібне.
//
// КОМАНДИ
// -------
//   node scripts/archive-unused-images.js            звіт, нічого не міняє
//   node scripts/archive-unused-images.js --apply    перенести в архів
//   node scripts/archive-unused-images.js --apply --now   без відстрочки
//   node scripts/archive-unused-images.js --restore <ім'я|all>   повернути

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// media_folder беремо з конфіга адмінки, щоб теки не розійшлись,
// якщо його колись перенесуть
function readMediaFolder() {

    const config = fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8");
    const match = config.match(/^media_folder:\s*"([^"]+)"/m);

    if (!match) throw new Error("У admin/config.yml не знайдено media_folder");

    return match[1];

}

const MEDIA_DIR_REL = readMediaFolder();
const MEDIA_DIR = path.join(ROOT, MEDIA_DIR_REL);

// Архів навмисно ЗА МЕЖАМИ media_folder — інакше Decap показував би
// його вміст у тому самому діалозі, і сенс прибирання зникає.
const ARCHIVE_DIR_REL = "assets/images/_archive";
const ARCHIVE_DIR = path.join(ROOT, ARCHIVE_DIR_REL);
const MANIFEST_FILE = path.join(ARCHIVE_DIR, "manifest.json");
const PENDING_FILE = path.join(ARCHIVE_DIR, "pending.json");

const ARCHIVE_AFTER_DAYS = 30;

const VARIANT_RE = /^(.*)-(300|600|1200)(\.[a-z0-9]+)$/i;

// ---------------------------------------------------------------

function readJson(file, fallback) {

    if (!fs.existsSync(file)) return fallback;

    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        console.error(`Не вдалося прочитати ${path.relative(ROOT, file)}: ${error.message}`);
        return fallback;
    }

}

function writeJson(file, data) {

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");

}

// Увесь текст проєкту одним рядком — по ньому шукаємо імена файлів.
function collectHaystack() {

    // tests/ у пошуку не бере участі свідомо. Джерелом правди про
    // "використовується" є ПРОДАКШН — дані, розмітка, скрипти сайту.
    // Згадка імені файлу в тесті — це не використання: інакше будь-який
    // тест, який просто перелічує імена, назавжди утримував би сміття
    // в медіатеці.
    const SKIP_DIRS = new Set(["node_modules", ".git", "p", "_archive", "tests"]);

    // Цей файл у пошуку не бере участі. Він про медіа, але сам медіа не
    // споживає, зате містить у коментарях приклади імен файлів — і при
    // першому запуску вирішив, що кирилична картинка використовується,
    // бо натрапив на власний коментар з її закодованим іменем.
    const SELF = path.join(ROOT, "scripts", "archive-unused-images.js");
    const TEXT_EXT = new Set([".json", ".js", ".html", ".css", ".yml", ".yaml", ".xml", ".md", ".ts"]);

    const chunks = [];

    (function walk(dir) {

        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

            if (SKIP_DIRS.has(entry.name)) return;

            const full = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                // саму теку з картинками читати нема сенсу
                if (full === MEDIA_DIR) return;
                walk(full);
                return;
            }

            if (full === SELF) return;

            if (!TEXT_EXT.has(path.extname(entry.name).toLowerCase())) return;

            chunks.push(fs.readFileSync(full, "utf8"));

        });

    })(ROOT);

    const raw = chunks.join("\n");

    // друга копія з розкодованою кирилицею: у даних шлях може бути
    // записаний у відсотковому кодуванні
    let decoded = raw;

    try {
        decoded = decodeURIComponent(raw.replace(/%(?![0-9a-fA-F]{2})/g, "%25"));
    } catch (error) {
        // якщо в тексті трапилась некоректна escape-послідовність —
        // працюємо лише з сирою формою, це безпечніше за падіння
    }

    return raw + "\n" + decoded;

}

function isReferenced(name, haystack) {

    if (haystack.includes(name)) return true;

    // кирилиця в даних може лежати закодованою
    if (haystack.includes(encodeURIComponent(name))) return true;

    return false;

}

function findUnused() {

    if (!fs.existsSync(MEDIA_DIR)) return [];

    const haystack = collectHaystack();

    const files = fs.readdirSync(MEDIA_DIR, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => entry.name);

    const referenced = new Set(files.filter(name => isReferenced(name, haystack)));

    return files.filter(name => {

        if (referenced.has(name)) return false;

        // зменшена копія живе, поки живе її основа
        const variant = name.match(VARIANT_RE);

        if (variant) {

            const base = variant[1] + variant[3];

            if (referenced.has(base) || isReferenced(base, haystack)) return false;

        }

        return true;

    }).sort();

}

// ---------------------------------------------------------------

function daysBetween(fromIso, toDate) {

    return Math.floor((toDate - new Date(fromIso)) / 86400000);

}

function report(unused, pending, today) {

    if (unused.length === 0) {
        console.log("Невикористаних файлів немає — медіатека чиста");
        return;
    }

    console.log(`\nНе використовується: ${unused.length} файлів\n`);

    unused.forEach(name => {

        const since = pending[name];
        const age = since ? daysBetween(since, today) : 0;

        const status = !since
            ? `помічено сьогодні, у архів через ${ARCHIVE_AFTER_DAYS} дн.`
            : age >= ARCHIVE_AFTER_DAYS
                ? "ГОТОВИЙ до архівації"
                : `чекає ще ${ARCHIVE_AFTER_DAYS - age} дн.`;

        console.log(`  ${name}\n      ${status}`);

    });

}

function archive({ apply, now }) {

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    const unused = findUnused();
    const unusedSet = new Set(unused);

    let pending = readJson(PENDING_FILE, {});

    // файл знову знадобився — прибираємо зі списку очікування
    Object.keys(pending).forEach(name => {
        if (!unusedSet.has(name)) delete pending[name];
    });

    unused.forEach(name => {
        if (!pending[name]) pending[name] = todayIso;
    });

    const ready = unused.filter(name => now || daysBetween(pending[name], today) >= ARCHIVE_AFTER_DAYS);

    if (!apply) {
        report(unused, pending, today);
        console.log(`\nГотових до перенесення зараз: ${ready.length}`);
        console.log("Це лише звіт. Щоб перенести — додайте --apply");
        return;
    }

    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

    const manifest = readJson(MANIFEST_FILE, []);
    const moved = [];

    ready.forEach(name => {

        const from = path.join(MEDIA_DIR, name);
        let target = name;

        // якщо в архіві вже є файл з таким іменем — не затираємо
        let i = 2;

        while (fs.existsSync(path.join(ARCHIVE_DIR, target))) {
            const ext = path.extname(name);
            target = `${path.basename(name, ext)}-${i}${ext}`;
            i++;
        }

        fs.renameSync(from, path.join(ARCHIVE_DIR, target));

        manifest.push({
            file: target,
            originalName: name,
            from: `${MEDIA_DIR_REL}/${name}`,
            archivedAt: todayIso,
            unusedSince: pending[name]
        });

        delete pending[name];
        moved.push(name);

        console.log(`  → архів: ${name}`);

    });

    writeJson(MANIFEST_FILE, manifest);
    writeJson(PENDING_FILE, pending);

    pruneImageVariants(moved);

    console.log(`\nГотово: перенесено ${moved.length}, у списку очікування ${Object.keys(pending).length}`);

}

// Прибираємо з data/image-variants.json згадки про заархівовані фото,
// щоб фронт не намагався підставити srcset на файли, яких уже немає
// за старою адресою.
function pruneImageVariants(movedNames) {

    if (movedNames.length === 0) return;

    const file = path.join(ROOT, "data/image-variants.json");
    const list = readJson(file, null);

    if (!Array.isArray(list)) return;

    const gone = new Set(movedNames);
    const kept = list.filter(name => !gone.has(name));

    if (kept.length !== list.length) {
        writeJson(file, kept);
        console.log(`  data/image-variants.json: прибрано ${list.length - kept.length} записів`);
    }

}

function restore(target) {

    const manifest = readJson(MANIFEST_FILE, []);

    if (manifest.length === 0) {
        console.log("Архів порожній");
        return;
    }

    const picked = target === "all"
        ? manifest
        : manifest.filter(item => item.file === target || item.originalName === target);

    if (picked.length === 0) {
        console.log(`У архіві немає "${target}". Доступні:`);
        manifest.forEach(item => console.log(`  ${item.file}`));
        return;
    }

    const restored = new Set();

    picked.forEach(item => {

        const from = path.join(ARCHIVE_DIR, item.file);

        if (!fs.existsSync(from)) {
            console.error(`  пропущено (немає у архіві): ${item.file}`);
            return;
        }

        const to = path.join(ROOT, item.from);

        if (fs.existsSync(to)) {
            console.error(`  пропущено (у медіатеці вже є): ${item.from}`);
            return;
        }

        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.renameSync(from, to);

        restored.add(item.file);

        console.log(`  ← повернуто: ${item.from}`);

    });

    writeJson(MANIFEST_FILE, manifest.filter(item => !restored.has(item.file)));

    console.log(`\nГотово: повернуто ${restored.size}`);

}

// ---------------------------------------------------------------

function main() {

    const args = process.argv.slice(2);

    const restoreIndex = args.indexOf("--restore");

    if (restoreIndex !== -1) {

        const target = args[restoreIndex + 1];

        if (!target) {
            console.error("Вкажіть ім'я файлу або all: --restore <ім'я|all>");
            process.exit(1);
        }

        restore(target);
        return;

    }

    archive({ apply: args.includes("--apply"), now: args.includes("--now") });

}

module.exports = { findUnused, MEDIA_DIR_REL, ARCHIVE_DIR_REL, ARCHIVE_AFTER_DAYS };

if (require.main === module) main();
