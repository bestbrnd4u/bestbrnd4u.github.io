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

// Відбиток вмісту в імені файлу.
//
// ПРОБЛЕМА, ЯКУ ЦЕ ЗАКРИВАЄ
// --------------------------
// Браузер і Cloudflare кешують картинку ЗА АДРЕСОЮ. Якщо через адмінку
// завантажити нове фото під тим самим імʼям, адреса не зміниться — і
// люди ще довго бачитимуть старе. Саме так плитки пошуку показували
// попередні картинки, поки їх не перейменували вручну.
//
// Для JS і CSS це вирішено інакше — версією в адресі
// (scripts/apply-cache-version.js додає ?v=відбиток). Для картинок так
// не вийде: більшість із них приходить із data/*.json у рантаймі, і
// щоб підставити версію, довелося б вкласти в кожну сторінку список
// відбитків. Він важить 23 КБ, сторінок 66 — півтора мегабайта дублів
// заради задачі, яку можна вирішити безкоштовно.
//
// Тому відбиток іде в саме імʼя: photo.webp → photo.a1b2c3d4.webp.
// Змінився вміст — змінилось імʼя — змінилась адреса. Працює скрізь
// однаково: і в JSON, і в розмітці, і в CSS, і в srcset — бо це
// звичайне перейменування, а посилання скрипт переписує сам.
//
// ЧОМУ НЕ ПЕРЕЙМЕНОВУЄМО ВСЕ ОДРАЗУ
// ----------------------------------
// У теці 667 файлів. Разове перейменування всіх дало б величезний
// коміт і, головне, ризик: досить одного місця, де посилання не
// переписалось, — і картинка зникає з сайту. Тому відбиток
// проставляється лише НОВИМ файлам, а ті, що вже лежать, лишаються як
// є. Стара картинка й далі кешується за старою адресою — але вона й не
// змінюється, тож це не шкодить. А кожне нове завантаження вже
// захищене.
const CONTENT_HASH_RE = /\.[0-9a-f]{8}$/;

function contentHash(file) {

    return crypto.createHash("sha1")
        .update(fs.readFileSync(file))
        .digest("hex")
        .slice(0, 8);

}

// Імʼя з відбитком вмісту. Якщо відбиток уже стоїть і збігається —
// повертаємо як є, щоб повторна збірка нічого не чіпала.
function contentName(fileName, fullPath) {

    const ext = path.extname(fileName);
    let stem = path.basename(fileName, ext);

    // суфікс розміру тримаємо в кінці — ресайзер упізнає свої варіанти
    // саме за ним
    const variantMatch = stem.match(VARIANT_RE);
    const variant = variantMatch ? variantMatch[0] : "";

    if (variant) stem = stem.slice(0, -variant.length);

    const hash = contentHash(fullPath);

    // Уже підписаний тим самим відбитком — нічого не робимо.
    if (CONTENT_HASH_RE.test(stem) && stem.endsWith("." + hash)) return fileName;

    // Підписаний іншим (вміст змінився) — стару позначку прибираємо,
    // інакше імʼя обростало б хвостом .aaaa.bbbb.cccc
    const clean = stem.replace(CONTENT_HASH_RE, "");

    return `${clean}.${hash}${variant}${ext}`;

}

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

    // Рішення приймається по ГРУПІ, а не по окремому файлу.
    //
    // Фото живе в теці не саме: поруч лежать зменшені копії
    // -300 / -600 / -1200. Ім'я копії на 4 символи довше за базове,
    // і саме через це раніше виходила ось така пара:
    //
    //   ...0000303494858-1-.webp       77 символів → НЕ перейменовано
    //   ...0000303494858-1--300.webp   81 символ   → перейменовано
    //
    // Копія їхала під новим хешованим ім'ям, база лишалася під старим —
    // і srcset рвався: браузер просив зменшену копію, якої за очікуваною
    // адресою вже не було. Саме так і сталося на гілці dev після
    // завантаження кросівок Lacoste.
    //
    // Хеш рахується від основи БЕЗ суфікса розміру, тож уся група
    // отримує однакове нове ім'я — треба лише вирішувати про неї разом.
    const groups = new Map();

    MEDIA_DIRS.forEach(rel => walk(path.join(ROOT, rel), (full, name) => {

        const ext = path.extname(name);
        const stem = path.basename(name, ext);
        const variant = (stem.match(VARIANT_RE) || [""])[0];
        const base = variant ? stem.slice(0, -variant.length) : stem;

        const key = path.join(path.dirname(full), base + ext);

        if (!groups.has(key)) groups.set(key, []);

        groups.get(key).push({ full, name });

    }));

    // Найдовший суфікс, який ресайзер додасть до базового імені.
    // Дивимось на нього НАПЕРЕД: якщо база вміщається в межу, а її
    // майбутня копія — ні, то без цього переймeнування відклалося б до
    // наступного запуску, і між ними в теці знову лежала б копія без
    // пари. Саме так і виглядала поломка: база 77 символів пройшла,
    // копія 81 — ні.
    const LONGEST_VARIANT = "-1200".length;

    groups.forEach(files => {

        const tooLong = files.some(f =>
            f.name.length > MAX_NAME
            || (!VARIANT_RE.test(path.basename(f.name, path.extname(f.name)))
                && f.name.length + LONGEST_VARIANT > MAX_NAME));

        if (!tooLong) return;

        files.forEach(({ full, name }) => {
            renames.set(full, path.join(path.dirname(full), shortName(name)));
        });

    });

    // Заміна картинки під тим самим імʼям.
    //
    // ЯК МИ ПРО НЕЇ ДІЗНАЄМОСЬ
    // -------------------------
    // Тримаємо реєстр відбитків: data/image-fingerprints.json, «імʼя →
    // відбиток вмісту». Файл, якого в реєстрі немає, — новий: просто
    // записуємо. Файл, який у реєстрі є, але вміст інший, — саме той
    // випадок: картинку замінили, лишивши імʼя. Тоді додаємо до імені
    // відбиток, адреса стає новою, і кеш зобовʼязаний піти по свіже.
    //
    // ЧОМУ САМЕ ТАК, А НЕ ПІДПИСАТИ ВСЕ ОДРАЗУ
    // -----------------------------------------
    // У теці 667 файлів. Разове перейменування дало б величезний коміт
    // і ризик: досить одного місця, де посилання не переписалось, — і
    // картинка зникає з сайту. А користі нуль: ті файли не змінюються,
    // тож їхній кеш і не протухає. Захист потрібен рівно там, де вміст
    // МІНЯЄТЬСЯ, — і саме там він тепер і є.
    //
    // Перший запуск лише заповнює реєстр і нічого не чіпає.
    const fingerprintFile = path.join(ROOT, "data", "image-fingerprints.json");

    let fingerprints = {};

    if (fs.existsSync(fingerprintFile)) {

        try {
            fingerprints = JSON.parse(fs.readFileSync(fingerprintFile, "utf8"));
        } catch (error) {
            fingerprints = {};   // побитий реєстр = починаємо заново
        }

    }

    const nextFingerprints = {};

    // Відбитки — лише для СПРАВЖНІХ картинок.
    //
    // walk() обходить усю теку assets/images, а там лежить і службове:
    // manifest.json та pending.json архіватора, іконки сайту. Записувати
    // їх у реєстр безглуздо (їх ніхто не замінює через адмінку) і шкідливо
    // — перевірка цілісності реєстру червоніла б на порожньому місці.
    const PHOTO_EXT = [".webp", ".jpg", ".jpeg", ".png", ".avif", ".gif"];

    groups.forEach(files => {

        const baseFile = files.find(f =>
            !VARIANT_RE.test(path.basename(f.name, path.extname(f.name))));

        if (!baseFile) return;

        if (!PHOTO_EXT.includes(path.extname(baseFile.name).toLowerCase())) return;

        // службові теки архіватора
        if (baseFile.full.includes(`${path.sep}_archive${path.sep}`)) return;

        const hash = contentHash(baseFile.full);
        const known = fingerprints[baseFile.name];

        // Уже перейменовується з іншої причини (задовге імʼя) — не
        // втручаємось, реєстр допишеться наступного запуску.
        if (files.some(f => renames.has(f.full))) return;

        if (known === undefined || known === hash) {

            nextFingerprints[baseFile.name] = hash;

            return;

        }

        // Вміст змінився. Перейменовуємо ВСЮ групу: база й копії
        // -300/-600 мусять мати однакову позначку, інакше srcset
        // проситиме адресу, якої немає.
        const wanted = contentName(baseFile.name, baseFile.full);
        const newStem = path.basename(wanted, path.extname(wanted));

        files.forEach(({ full, name }) => {

            const ext = path.extname(name);
            const variant = (path.basename(name, ext).match(VARIANT_RE) || [""])[0];

            renames.set(full, path.join(path.dirname(full), newStem + variant + ext));

        });

        nextFingerprints[path.basename(wanted)] = hash;

        console.log(`  вміст змінився: ${baseFile.name} → ${path.basename(wanted)}`);

    });

    // Реєстр пишемо завжди: інакше видалені картинки лишались би в
    // ньому назавжди, а нові не потрапляли б до першої заміни.
    fs.mkdirSync(path.dirname(fingerprintFile), { recursive: true });
    fs.writeFileSync(fingerprintFile,
        JSON.stringify(nextFingerprints, null, 0) + "\n", "utf8");

    if (renames.size === 0) {
        console.log(`Готово: задовгих імен немає (межа ${MAX_NAME} символів)`);
        return;
    }

    // 1. перейменовуємо файли
    const nameMap = new Map();

    renames.forEach((to, from) => {

        // Файл із коротким іменем уже є. Це типова ситуація після
        // накладання архіву поверх робочої копії: розпакування ДОДАЄ
        // короткий варіант, але не видаляє довгий, і в теці лежать два
        // однакових знімки. Раніше скрипт тут просто здавався, і ті
        // самі 4 файли поверталися з кожним новим архівом.
        if (fs.existsSync(to)) {

            const same = fs.readFileSync(from).equals(fs.readFileSync(to));

            if (!same) {
                // різний вміст — самі вирішуйте, який лишити
                console.error(`::error::${path.relative(ROOT, to)} вже існує, і вміст РІЗНИЙ — пропущено`);
                return;
            }

            fs.rmSync(from);

            // ім'я все одно мапимо: посилання на довгий варіант, якщо
            // десь лишились, треба перевести на короткий
            nameMap.set(path.basename(from), path.basename(to));

            console.log(`  дубль прибрано (вміст той самий): ${path.basename(from).slice(0, 46)}…`);

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
