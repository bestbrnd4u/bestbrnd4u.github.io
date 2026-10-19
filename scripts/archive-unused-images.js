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

// УСІ медіатеки адмінки, а не лише головна.
//
// ЩО БУЛО НЕ ТАК І СКІЛЬКИ ЦЕ КОШТУВАЛО
// --------------------------------------
// Скрипт читав один-єдиний `media_folder` із кореня config.yml —
// assets/images/products/uploads. Але в Decap медіатека задається ще
// й ПОЛЯМ: банери акцій, добірок і плиток пошуку лежать в
// assets/images/banners, і туди скрипт не заглядав жодного разу.
//
// Заміряно 19.10.2026: із 76 файлів у banners на 35 (18,9 МБ) не
// посилається нічого. З них 11 (13,7 МБ) — важкі PNG і JPEG, які
// shrink-heavy-images.js уже замінив на webp тієї самої назви й
// переписав посилання. У коментарі того скрипта так і написано:
// «Прибрати такі осиротілі файли вміє npm run images:archive» — а
// прибрати їх було нічим, бо теку ніхто не сканував.
//
// Беремо теки З КОНФІГУ, а не списком у коді: перелік у коді
// застаріває мовчки — нове поле з власною медіатекою просто не
// потрапить у перевірку (так уже було з переліком тек у
// apply-cache-version.js).
function readMediaFolders() {

    const config = fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8");

    const усі = [...config.matchAll(/^\s*media_folder:\s*"([^"]+)"/gm)].map(m => m[1]);

    if (!усі.length) throw new Error("У admin/config.yml не знайдено жодного media_folder");

    // У полях шлях пишеться від кореня сайту («/assets/images/banners»),
    // у корені конфігу — від кореня репозиторію. Зводимо до одного
    // вигляду, інакше та сама тека рахувалась би двічі.
    const зведені = усі.map(шлях => шлях.replace(/^\/+/, "").replace(/\/+$/, ""));

    return [...new Set(зведені)].filter(rel => fs.existsSync(path.resolve(ROOT, rel)));

}

// ПІСОЧНИЦЯ ДЛЯ ТЕСТІВ — І ЧОМУ ВОНА ТУТ ПОТРІБНА.
//
// Скрипт ПЕРЕНОСИТЬ файли. Поки тест ганяв його по справжніх теках
// проєкту, кожен `npm test` робив справжню архівацію: будь-яке
// невживане фото, що відлежало свої 30 днів, їхало в архів НАСПРАВДІ.
//
// Далі ставало гірше. Прибираючи за прогоном, я відкочував
// manifest.json і pending.json — а перенесений файл лишався в архіві
// вже без запису про себе. Повернути його скриптом (--restore) після
// цього неможливо: restore шукає саме в маніфесті. Наступний прогін
// переносив копію з медіатеки знову, тепер уже з суфіксом «-2».
//
// Так у репозиторії й опинилось ШІСТЬ ПАР однакових файлів (4,26 МБ)
// і один запис в архіві, якого немає в маніфесті.
//
// Тому теки задаються ззовні: тест працює у своїй тимчасовій, і
// справжньої медіатеки прогін не торкається взагалі. Шлях може бути
// і абсолютним, тому resolve, а не join.
const MEDIA_DIR_REL = process.env.ARCHIVE_MEDIA_DIR || readMediaFolder();
const MEDIA_DIR = path.resolve(ROOT, MEDIA_DIR_REL);

// Повний перелік тек, які прибираємо.
//
// ARCHIVE_MEDIA_DIRS (через кому) — пісочниця для перевірки саме
// кількох тек: тест кладе однойменні файли у дві свої тимчасові й
// дивиться, що вони не склеїлись. ARCHIVE_MEDIA_DIR лишається для
// старих перевірок однієї теки.
//
// У обох випадках справжніх медіатек прогін не торкається взагалі.
const MEDIA_DIRS = process.env.ARCHIVE_MEDIA_DIRS
    ? process.env.ARCHIVE_MEDIA_DIRS.split(",").map(s => s.trim()).filter(Boolean)
    : process.env.ARCHIVE_MEDIA_DIR
        ? [MEDIA_DIR_REL]
        : readMediaFolders();

// Архів навмисно ЗА МЕЖАМИ media_folder — інакше Decap показував би
// його вміст у тому самому діалозі, і сенс прибирання зникає.
const ARCHIVE_DIR_REL = process.env.ARCHIVE_TARGET_DIR || "assets/images/_archive";
const ARCHIVE_DIR = path.resolve(ROOT, ARCHIVE_DIR_REL);
const MANIFEST_FILE = path.join(ARCHIVE_DIR, "manifest.json");
const PENDING_FILE = path.join(ARCHIVE_DIR, "pending.json");

const ARCHIVE_AFTER_DAYS = 30;

// Відбиток вмісту файлу. Потрібен, щоб відрізнити «в архіві вже
// лежить ЦЕЙ САМИЙ файл» від «лежить інший файл із таким іменем».
function hashFile(file) {
    return require("crypto").createHash("sha1")
        .update(fs.readFileSync(file)).digest("hex");
}

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
                // самі теки з картинками читати нема сенсу
                if (MEDIA_DIRS.some(rel => full === path.resolve(ROOT, rel))) return;
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

function findUnused(dirRel = MEDIA_DIR_REL, haystackCache) {

    const dir = path.resolve(ROOT, dirRel);

    if (!fs.existsSync(dir)) return [];

    // Сіно збирається обходом усього репозиторію — для кожної теки
    // заново це та сама робота вдруге. Викликач, який проходить
    // кілька тек, передає його один раз.
    const haystack = haystackCache || collectHaystack();

    const files = fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => entry.name);

    const referenced = new Set(files.filter(name => isReferenced(name, haystack)));

    return files.filter(name => {

        if (referenced.has(name)) return false;

        // зменшена копія живе, поки живе її основа
        const variant = name.match(VARIANT_RE);

        if (variant) {

            // Основа може бути в ІНШОМУ форматі, ніж копія.
            //
            // ЩО БУЛО НЕ ТАК. Тут перевірялась лише основа з тим самим
            // розширенням: для «x-300.avif» шукався «x.avif», якого не
            // існує — базове фото лежить у webp, а avif робиться з
            // нього як зменшена копія (scripts/normalize-product-images.js).
            //
            // Основа не знаходилась, копія вважалась нікому не
            // потрібною, і всі 900 файлів AVIF одним запуском поїхали
            // в чергу на архівацію. Через 30 днів вони зникли б, а
            // перелік data/image-variants.json і далі обіцяв би
            // верстці, що копії є — картки просили б «-600.avif» і
            // отримували 404.
            const bases = [variant[1] + variant[3], variant[1] + ".webp"];

            if (bases.some(base => referenced.has(base) || isReferenced(base, haystack))) {
                return false;
            }

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

    // Сіно збираємо один раз на всі теки: це обхід усього репозиторію.
    const haystack = collectHaystack();

    // КЛЮЧ — ШЛЯХ, А НЕ НАЗВА.
    //
    // Одна й та сама назва трапляється в різних медіатеках: файл
    // 043_small_card_1200x1500.jpg лежить і в products/uploads, і в
    // banners. Поки тека була одна, назви вистачало; з двома вона
    // склеїла б різні файли — і в черзі очікування, і в маніфесті.
    const знайдені = MEDIA_DIRS.flatMap(dirRel =>
        findUnused(dirRel, haystack).map(name => ({ dirRel, name, key: `${dirRel}/${name}` })));

    const unused = знайдені.map(f => f.key);
    const unusedSet = new Set(unused);

    let pending = readJson(PENDING_FILE, {});

    // ПЕРЕНОСИМО СТАРІ ЗАПИСИ НА НОВІ КЛЮЧІ.
    //
    // До появи другої теки черга велась за голими назвами. Якби ми
    // просто почали писати шляхи, усі накопичені дні очікування
    // згоріли б, і прибирання відклалось би ще на тридцять днів — без
    // жодної причини, помітної з боку.
    Object.keys(pending).forEach(старий => {

        if (старий.includes("/")) return;

        const новий = `${MEDIA_DIR_REL}/${старий}`;

        if (unusedSet.has(новий) && !pending[новий]) pending[новий] = pending[старий];

        delete pending[старий];

    });

    // файл знову знадобився — прибираємо зі списку очікування
    Object.keys(pending).forEach(key => {
        if (!unusedSet.has(key)) delete pending[key];
    });

    unused.forEach(key => {
        if (!pending[key]) pending[key] = todayIso;
    });

    const readyKeys = new Set(unused.filter(key =>
        now || daysBetween(pending[key], today) >= ARCHIVE_AFTER_DAYS));

    const ready = знайдені.filter(f => readyKeys.has(f.key));

    if (!apply) {
        report(unused, pending, today);
        console.log(`\nГотових до перенесення зараз: ${ready.length}`);
        console.log("Це лише звіт. Щоб перенести — додайте --apply");
        return;
    }

    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

    const manifest = readJson(MANIFEST_FILE, []);
    const moved = [];

    // Що вже лежить в архіві, за вмістом. Рахуємо один раз: далі
    // кожен новий файл шукає себе тут, а не перечитує всю теку.
    const вАрхіві = new Map(
        fs.readdirSync(ARCHIVE_DIR)
            .filter(f => !f.endsWith(".json"))
            .filter(f => fs.statSync(path.join(ARCHIVE_DIR, f)).isFile())
            .map(f => [f, hashFile(path.join(ARCHIVE_DIR, f))]));

    ready.forEach(({ dirRel, name, key }) => {

        const from = path.resolve(ROOT, dirRel, name);
        let target = name;

        // ТОЙ САМИЙ ФАЙЛ ІЗ ДВОХ МЕДІАТЕК — ОДНА КОПІЯ В АРХІВІ.
        //
        // Власник завантажує одне фото і в теку товарів, і в теку
        // банерів — так у репозиторії й зʼявились пари на кшталт
        // 043_small_card_1200x1500.jpg. Коли прибирання дійшло до обох
        // тек, другий файл лягав поруч як «…-2.jpg», і в архіві
        // ставало два однакових байт у байт. Архів лежить у git, тож
        // це вага назавжди — саме це й ловить перевірка «в архіві
        // немає двох однакових файлів».
        //
        // Тому: збігся зміст — другу копію не пишемо, а лише додаємо
        // запис у маніфест. Повернути можна обидва: restore() бачить,
        // що на файл посилається ще хтось, і тоді копіює, а не
        // переносить.
        const зміст = hashFile(from);

        // Та сама картинка під ІНШОЮ назвою — теж одна копія.
        //
        // Кирилиця в іменах пройшла крізь конвеєр по-різному, і той
        // самий банер лежить як «…мобильная_страница…», «…моби#U-…»,
        // «…#U043c#U043e…» і «…mobile-…» — чотири файли по 498 КБ
        // байт у байт. Назви різні, вміст один, і в архіві їм робити
        // нема чого вчотирьох. Шукаємо за ВМІСТОМ, а не за іменем.
        const вжеЄ = [...вАрхіві.entries()].find(([, h]) => h === зміст);

        if (вжеЄ) {

            target = вжеЄ[0];

            fs.rmSync(from);

        } else {

            // В архіві є ІНШИЙ файл із таким іменем — не затираємо.
            let i = 2;

            while (fs.existsSync(path.join(ARCHIVE_DIR, target))) {
                const ext = path.extname(name);
                target = `${path.basename(name, ext)}-${i}${ext}`;
                i++;
            }

            fs.renameSync(from, path.join(ARCHIVE_DIR, target));

            вАрхіві.set(target, зміст);

        }

        manifest.push({
            file: target,
            originalName: name,
            // Саме звідки взяли — за цим шляхом --restore кладе файл
            // назад. Тека тут різна, тож брати MEDIA_DIR_REL більше не
            // можна: банер повернувся б у теку фотографій товарів.
            from: key,
            archivedAt: todayIso,
            unusedSince: pending[key]
        });

        delete pending[key];
        moved.push(name);

        console.log(`  → архів: ${key}`);

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

        // НА ОДИН ФАЙЛ В АРХІВІ МОЖЕ ПОСИЛАТИСЬ КІЛЬКА ЗАПИСІВ.
        //
        // Так буває, коли те саме фото лежало і в теці товарів, і в
        // теці банерів: копія в архіві одна, а повернути його треба в
        // обидві. Якщо решта записів іще чекає — КОПІЮЄМО, інакше
        // перший же restore забрав би файл, і другий origin лишився б
        // ні з чим.
        // Питання одне: чи лишився ХОЧ ХТОСЬ, кому цей файл іще не
        // віддали. Умова «і він не серед обраних» тут була помилкою:
        // при `--restore all` обрані ВСІ, тож вона завжди хибна —
        // перший запис забирав файл переносом, а два інші місця
        // лишались ні з чим. Спіймано перевіркою [10].
        const ще = manifest.some(other =>
            other !== item && other.file === item.file && !restored.has(other));

        // resolve, а не join: у маніфесті шлях зазвичай відносний, але
        // коли теку задано ззовні (ARCHIVE_MEDIA_DIR), він абсолютний —
        // join тоді склеїв би корінь проєкту з «C:\…» і файл нікуди
        // не повернувся б.
        const to = path.resolve(ROOT, item.from);

        if (fs.existsSync(to)) {
            console.error(`  пропущено (у медіатеці вже є): ${item.from}`);
            return;
        }

        fs.mkdirSync(path.dirname(to), { recursive: true });

        if (ще) fs.copyFileSync(from, to);
        else fs.renameSync(from, to);

        restored.add(item);

        console.log(`  ← повернуто: ${item.from}${ще ? " (копією — файл потрібен ще комусь)" : ""}`);

    });

    // Прибираємо САМІ ЗАПИСИ, а не всі з таким іменем файлу: на один
    // файл в архіві може посилатись кілька записів (те саме фото з
    // двох медіатек), і фільтр за іменем стер би чужий запис разом зі
    // своїм — файл лишився б в архіві назавжди, без жодної згадки.
    writeJson(MANIFEST_FILE, manifest.filter(item => !restored.has(item)));

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

module.exports = {
    findUnused, readMediaFolders,
    MEDIA_DIR_REL, MEDIA_DIRS, ARCHIVE_DIR_REL, ARCHIVE_AFTER_DAYS
};

if (require.main === module) main();
