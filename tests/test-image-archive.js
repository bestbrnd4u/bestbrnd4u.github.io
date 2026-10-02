// Архів невикористаних картинок.
//
// Ціна помилки тут несиметрична: якщо скрипт не помітить сміття —
// в медіатеці просто лишиться зайвий файл; якщо ж він помилково
// вирішить, що потрібне фото нікому не потрібне, — на сайті зникне
// картинка товару. Тому більшість перевірок нижче — саме про
// ХИБНІ СПРАСПРАЦЮВАННЯ: що живі файли не потрапляють у список.
//
// Реальний промах, який ловить [2]: перша версія скрипта шукала
// посилання регуляркою за списком розширень і оголосила невживаним
// відео товару, бо .mp4 у тому списку не було. Тепер пошук іде від
// файлу до тексту, і список розширень узагалі не потрібен.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { findUnused, MEDIA_DIR_REL, ARCHIVE_DIR_REL, ARCHIVE_AFTER_DAYS } =
    require("../scripts/archive-unused-images");

const MEDIA_DIR = path.join(ROOT, MEDIA_DIR_REL);
const { execFileSync } = require("child_process");
const SCRIPT = path.join(ROOT, "scripts/archive-unused-images.js");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const run = args => execFileSync("node", [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8" });

// ПЕРЕНЕСЕННЯ ПЕРЕВІРЯЄМО В ПІСОЧНИЦІ, А НЕ В МЕДІАТЕЦІ ПРОЄКТУ.
//
// Скрипт не читає файли, а ПЕРЕСУВАЄ їх. Поки --apply запускався по
// справжніх теках, кожен `npm test` робив справжню архівацію: усе
// невживане, що відлежало 30 днів, їхало в архів насправді.
//
// Далі гірше. Прибираючи за прогоном, ми відкочуємо manifest.json —
// а перенесений файл лишається в архіві вже без запису про себе, і
// повернути його скриптом стає неможливо (--restore шукає в
// маніфесті). Наступний прогін переносить копію з медіатеки знову,
// тепер із суфіксом «-2». Так у репозиторії й накопичилось шість
// пар однакових файлів (4,26 МБ) і один запис в архіві поза
// маніфестом.
//
// Теперь теки задаються змінними оточення, і прогін працює у
// власній тимчасовій. Перевірка [8] стежить, що справжні теки
// лишились недоторканими.
const os = require("os");
const crypto = require("crypto");

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "archive-test-"));
const BOX_MEDIA = path.join(SANDBOX, "media");
const BOX_ARCHIVE = path.join(SANDBOX, "archive");

fs.mkdirSync(BOX_MEDIA, { recursive: true });
fs.mkdirSync(BOX_ARCHIVE, { recursive: true });

const runBox = args => execFileSync("node", [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ARCHIVE_MEDIA_DIR: BOX_MEDIA, ARCHIVE_TARGET_DIR: BOX_ARCHIVE }
});

const boxFile = (name, content) => {
    fs.writeFileSync(path.join(BOX_MEDIA, name), content);
    return name;
};

// Знімок теки: імена з розмірами, плюс вміст двох журналів — вони
// маленькі, а саме їх прогін і переписував.
const знімок = dir => {
    if (!fs.existsSync(dir)) return "(теки немає)";
    return fs.readdirSync(dir).sort().map(name => {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (name.endsWith(".json")) {
            return name + ":" + crypto.createHash("sha1")
                .update(fs.readFileSync(full)).digest("hex").slice(0, 12);
        }
        return name + ":" + st.size;
    }).join("\n");
};

let БУЛО_МЕДІА = "";
let БУЛО_АРХІВ = "";

// прибираємо за собою навіть якщо перевірка впала
const cleanup = [];
const tempFile = (rel, content) => {
    const full = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    cleanup.push(full);
    return full;
};


// Фікстури, залишені УБИТИМ прогоном.
//
// Прибирання нижче живе у finally, а вбитий процес до finally не
// доходить. Залишений tmp-archive-ref-check.html згадує тестове фото —
// і наступний прогон падає на перевірці «незгаданий файл потрапляє у
// список», хоча код справний. Імена перелічені поштучно: маска
// «test-*» зачепила б самі файли тестів.
const FIXTURES = [
    "tmp-archive-ref-check.html",
    MEDIA_DIR_REL + "/test-orphan-fresh.png",
    MEDIA_DIR_REL + "/test-orphan-move.png",
    MEDIA_DIR_REL + "/тест-архів-перевірка.png",
    MEDIA_DIR_REL + "/тест-самопосилання.png"
];

FIXTURES.forEach(rel => {
    try { fs.rmSync(path.join(ROOT, rel), { force: true }); } catch (e) { /* байдуже */ }
});

// Знімок беремо САМЕ ТУТ — після прибирання залишків від убитого
// прогону, інакше вони зарахувались би в різницю.
БУЛО_МЕДІА = знімок(path.join(ROOT, MEDIA_DIR_REL));
БУЛО_АРХІВ = знімок(path.join(ROOT, ARCHIVE_DIR_REL));

try {

console.log("\n[1] Архів лежить поза медіатекою адмінки");
{
    // інакше Decap показував би заархівоване в тому самому діалозі
    // "Images", і сенс прибирання зникає
    check("тека архіву не всередині media_folder",
        !ARCHIVE_DIR_REL.startsWith(MEDIA_DIR_REL), `${ARCHIVE_DIR_REL} vs ${MEDIA_DIR_REL}`);

    const config = fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8");
    check("media_folder у конфізі збігається з тим, що читає скрипт",
        config.includes(`media_folder: "${MEDIA_DIR_REL}"`));

    check("відстрочка ненульова (фото могли завантажити наперед)",
        ARCHIVE_AFTER_DAYS > 0, ARCHIVE_AFTER_DAYS);
}

console.log("\n[1b] Архів і маніфест описують одне й те саме");
{
    // Архів має сенс, лише поки по ньому можна ПОВЕРНУТИ файл, а
    // повернення шукає запис у маніфесті. Файл без запису звідти вже
    // не дістати: для скрипта його не існує.
    //
    // Саме так і сталось. Прогін тестів робив справжнє перенесення,
    // ми відкочували manifest.json, щоб дерево лишилось чистим, —
    // і файл осідав в архіві сиротою. Наступний прогін ніс туди нову
    // копію з суфіксом «-2». Коли це помітили, в репозиторії лежало
    // шість пар однакових файлів, один із них — поза маніфестом.
    //
    // Перевірка двобічна: запис без файлу так само поганий, бо
    // --restore на ньому мовчки нічого не поверне.
    const dir = path.join(ROOT, ARCHIVE_DIR_REL);
    const файли = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => !f.endsWith(".json")) : [];
    const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    const вМаніфесті = new Set(manifest.map(r => r.file));

    const сироти = файли.filter(f => !вМаніфесті.has(f));
    check("кожен файл в архіві має запис у маніфесті",
        сироти.length === 0, сироти.slice(0, 4).map(f => JSON.stringify(f)).join(", "));

    const мертві = manifest.filter(r => !файли.includes(r.file));
    check("кожен запис маніфесту вказує на наявний файл",
        мертві.length === 0, мертві.slice(0, 4).map(r => r.file).join(", "));

    // Дві копії одного й того самого займають місце й збивають з
    // пантелику при поверненні: незрозуміло, котру брати.
    //
    // Звіряємо ВМІСТ, а не ім'я. Два записи з однаковим originalName —
    // випадок цілком законний: фото замінили новим під тим самим
    // іменем, і згодом обидва стали непотрібні. А ось два АБСОЛЮТНО
    // однакових файли означають, що той самий файл заархівували
    // двічі — тобто між архівацією його хтось повернув у медіатеку.
    // Так і було: шість пар, 4,5 МБ дублів у публічному репозиторії.
    const за́змістом = new Map();

    файли.forEach(f => {
        const хеш = crypto.createHash("sha1")
            .update(fs.readFileSync(path.join(dir, f))).digest("hex");
        if (!за́змістом.has(хеш)) за́змістом.set(хеш, []);
        за́змістом.get(хеш).push(f);
    });

    const дублі = [...за́змістом.values()].filter(список => список.length > 1);

    check("в архіві немає двох однакових файлів",
        дублі.length === 0,
        дублі.slice(0, 3).map(список => список.join(" = ")).join(" | "));
}

console.log("\n[2] Живі файли не потрапляють у список");
{
    const unused = new Set(findUnused());

    // відео товару — саме на ньому спіткнулась перша версія
    // вихідні файли товарів, а не згенерований агрегат
    // (правило з tests/test-migration-types.js)
    const productsDir = path.join(ROOT, "data/products");
    const products = fs.readdirSync(productsDir)
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(productsDir, f), "utf8")));
    const videos = products
        .flatMap(p => (p.variants || []).map(v => v && v.video))
        .filter(Boolean)
        .map(v => path.basename(v));

    check(`відео товарів не вважається сміттям (${videos.length} шт.)`,
        videos.every(v => !unused.has(v)), videos.filter(v => unused.has(v)).join(", "));

    // усі фото з даних
    const images = products
        .flatMap(p => [...(p.images || []), ...(p.variants || []).flatMap(v => (v && v.images) || [])])
        .filter(Boolean)
        .map(i => decodeURIComponent(path.basename(i)));

    const wronglyFlagged = [...new Set(images)].filter(i => unused.has(i));
    check(`жодне фото товару не позначене невживаним (${new Set(images).size} шт.)`,
        wronglyFlagged.length === 0, wronglyFlagged.slice(0, 3).join(", "));

    // зменшені копії: у даних записана лише повна ширина
    const variants = fs.readdirSync(MEDIA_DIR).filter(f => /-(300|600)\.webp$/.test(f));
    const liveVariants = variants.filter(v => {
        const base = v.replace(/-(300|600)\.webp$/, ".webp");
        return images.includes(base);
    });

    check(`зменшені копії живих фото збережено (${liveVariants.length} шт.)`,
        liveVariants.every(v => !unused.has(v)),
        liveVariants.filter(v => unused.has(v)).slice(0, 3).join(", "));

    // акції, добірки, попапи, головна
    ["data/promotions.json", "data/collections.json", "data/promo-popups.json", "data/home.json"]
        .filter(f => fs.existsSync(path.join(ROOT, f)))
        .forEach(rel => {
            const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
            const refs = [...new Set(text.match(/uploads\/[^"]+/g) || [])]
                .map(r => decodeURIComponent(path.basename(r)));
            const bad = refs.filter(r => unused.has(r));
            check(`${rel}: картинки не позначені невживаними`, bad.length === 0, bad.join(", "));
        });
}

console.log("\n[3] Кирилиця в імені й відсоткове кодування");
{
    const name = "тест-архів-перевірка.png";
    tempFile(`${MEDIA_DIR_REL}/${name}`, "x");

    check("незгаданий кириличний файл потрапляє у список",
        findUnused().includes(name));

    // тепер посилаємось на нього ЗАКОДОВАНО, як це робить браузер
    tempFile("tmp-archive-ref-check.html",
        `<img src="/${MEDIA_DIR_REL}/${encodeURIComponent(name)}">`);

    check("закодоване посилання рахується як використання",
        !findUnused().includes(name));
}

console.log("\n[4] Скрипт не рахує власні коментарі за посилання");
{
    // перша версія знайшла в собі приклад закодованого імені
    // й вирішила, що та картинка використовується
    const self = fs.readFileSync(SCRIPT, "utf8");
    check("сам себе виключає з пошуку", /full === SELF/.test(self));

    const name = "тест-самопосилання.png";
    tempFile(`${MEDIA_DIR_REL}/${name}`, "x");
    check("файл, згаданий лише в самому скрипті, не вважається живим",
        findUnused().includes(name));
}

console.log("\n[5] Відстрочка: свіже сміття не їде в архів одразу");
{
    const name = boxFile("test-orphan-fresh.png", "x");

    const report = runBox([]);
    check("звіт бачить новий невживаний файл", report.includes(name));
    check("звіт нічого не переносить", fs.existsSync(path.join(BOX_MEDIA, name)));
    check("вказано, скільки чекати", /чекає ще|у архів через/.test(report));

    runBox(["--apply"]);
    check("--apply без --now не чіпає свіжий файл (він міг бути завантажений наперед)",
        fs.existsSync(path.join(BOX_MEDIA, name)));

    const pending = JSON.parse(fs.readFileSync(path.join(BOX_ARCHIVE, "pending.json"), "utf8"));
    check("файл узятий на облік у списку очікування", !!pending[name], Object.keys(pending).length);
}

console.log("\n[6] Перенесення і повернення");
{
    const name = boxFile("test-orphan-move.png", "x");

    // НЕ використовуємо --now: перевіряємо саме те, що відстрочка
    // відлічується від дати у списку очікування. Тому "старимо" там
    // рівно один файл і дивимось, що поїде лише він.
    const сусід = boxFile("test-orphan-neighbour.png", "x");

    runBox([]);

    const pendingFile = path.join(BOX_ARCHIVE, "pending.json");
    const pending = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
    const old = new Date(Date.now() - (ARCHIVE_AFTER_DAYS + 1) * 86400000);
    pending[name] = old.toISOString().slice(0, 10);
    fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2) + "\n");

    runBox(["--apply"]);

    check("файл зник з медіатеки", !fs.existsSync(path.join(BOX_MEDIA, name)));
    check("файл з'явився в архіві", fs.existsSync(path.join(BOX_ARCHIVE, name)));

    // Свіжий сусід лишається на місці: інакше «відстрочка працює»
    // означало б лише те, що ми самі нікого не постарили.
    check("свіжий сусід лишився в медіатеці", fs.existsSync(path.join(BOX_MEDIA, сусід)));

    const manifest = JSON.parse(fs.readFileSync(path.join(BOX_ARCHIVE, "manifest.json"), "utf8"));
    const record = manifest.find(item => item.originalName === name);

    check("у маніфесті записано, звідки файл",
        record && record.from === `${BOX_MEDIA}/${name}`, record && record.from);
    check("у маніфесті є дата", record && /^\d{4}-\d{2}-\d{2}$/.test(record.archivedAt));

    runBox(["--restore", name]);

    check("файл повернувся на своє місце", fs.existsSync(path.join(BOX_MEDIA, name)));
    check("з архіву зник", !fs.existsSync(path.join(BOX_ARCHIVE, name)));

    const after = JSON.parse(fs.readFileSync(path.join(BOX_ARCHIVE, "manifest.json"), "utf8"));
    check("запис прибрано з маніфесту", !after.some(item => item.originalName === name));
}

console.log("\n[7] Запуск за розкладом налаштований");
{
    const wf = path.join(ROOT, ".github/workflows/archive-unused-images.yml");
    check("є окремий workflow", fs.existsSync(wf));

    if (fs.existsSync(wf)) {
        const text = fs.readFileSync(wf, "utf8");
        check("за розкладом, а не на кожен пуш (щоб не чіпати файли під час редагування)",
            text.includes("schedule:") && !/^on:[\s\S]*?\n  push:/m.test(text));
        check("можна запустити руками", text.includes("workflow_dispatch"));
        check("запускається з --apply", text.includes("--apply"));
        // важливо перевіряти саме командний рядок: у коментарях
        // угорі workflow слово --now згадується як пояснення
        const runLines = (text.match(/^\s*run:.*$/gm) || []).join("\n");
        check("без --now у командному рядку — відстрочка лишається в силі",
            !runLines.includes("--now"), runLines);
    }
}

} finally {

    cleanup.reverse().forEach(f => { try { fs.rmSync(f, { force: true }); } catch (e) {} });

    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) { /* байдуже */ }

    // [8] ПРОГІН НЕ ЗАЛИШАЄ СЛІДІВ У СПРАВЖНІХ ТЕКАХ
    //
    // Перевірка стоїть тут, а не вище, бо порівнювати можна лише
    // ПІСЛЯ прибирання фікстур: розділи [2]–[4] навмисно кладуть
    // тимчасові файли в справжню медіатеку, щоб перевірити пошук
    // посилань по справжніх даних.
    //
    // ЩО ВОНА ЛОВИТЬ. Раніше --apply запускався по справжніх теках, і
    // кожен прогін робив справжнє перенесення: файл їхав у архів,
    // manifest.json і pending.json переписувались, і все це лишалось
    // у робочому дереві. Відкотиш журнали — перенесений файл осиротіє
    // й більше не повернеться скриптом; не відкотиш — поїде в коміт.
    // За кілька місяців у репозиторії накопичилось шість пар
    // однакових файлів, один з яких лежав в архіві без запису.
    //
    // Нічого з цього не було видно: усі перевірки лишались зеленими,
    // бо жодна не питала, що прогін по собі лишив.
    console.log("\n[8] Прогін нічого не змінив у справжніх теках");

    const сталоМедіа = знімок(path.join(ROOT, MEDIA_DIR_REL));
    const сталоАрхів = знімок(path.join(ROOT, ARCHIVE_DIR_REL));

    const різниця = (було, стало) => {
        const b = new Set(було.split("\n"));
        const s = new Set(стало.split("\n"));
        return [
            ...[...b].filter(x => !s.has(x)).map(x => "− " + x),
            ...[...s].filter(x => !b.has(x)).map(x => "+ " + x)
        ].slice(0, 6).join(" | ");
    };

    check("медіатека адмінки лишилась така сама",
        сталоМедіа === БУЛО_МЕДІА, різниця(БУЛО_МЕДІА, сталоМедіа));

    check("архів і його журнали лишились такі самі",
        сталоАрхів === БУЛО_АРХІВ, різниця(БУЛО_АРХІВ, сталоАрхів));

}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
