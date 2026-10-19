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
// власній тимчасовій. Перевірка [11] у кінці стежить, що справжні теки
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

    // КЛЮЧ У ЧЕРЗІ — ШЛЯХ, А НЕ НАЗВА.
    //
    // Поки тека була одна, назви вистачало. Медіатек стало дві
    // (products/uploads і banners), а однойменні файли в них справді
    // є — 043_small_card_1200x1500.jpg лежить в обох. За голою назвою
    // черга склеїла б різні файли, і архівація одного обнуляла б
    // відлік другого.
    check("файл узятий на облік у списку очікування",
        !!pending[`${BOX_MEDIA}/${name}`], Object.keys(pending).join(", "));
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

}


console.log("\n[9] Прибираємо ВСІ медіатеки адмінки, а не одну");
{
    // ЩО БУЛО НЕ ТАК І СКІЛЬКИ ЦЕ КОШТУВАЛО.
    //
    // Скрипт читав один-єдиний media_folder із кореня admin/config.yml
    // — assets/images/products/uploads. Але в Decap медіатека задається
    // ще й ПОЛЯМ: банери акцій, добірок і плиток пошуку лежать в
    // assets/images/banners, і туди скрипт не заглядав жодного разу.
    //
    // Заміряно 19.10.2026: із 76 файлів у banners на 35 (18,9 МБ) не
    // посилається нічого. З них 11 (13,7 МБ) — важкі PNG і JPEG, які
    // shrink-heavy-images.js уже замінив на webp тієї самої назви. У
    // коментарі того скрипта написано «прибрати такі осиротілі файли
    // вміє npm run images:archive» — а прибрати їх було нічим.
    const { readMediaFolders, MEDIA_DIRS } = require("../scripts/archive-unused-images");

    const теки = readMediaFolders();

    check(`медіатек знайдено: ${теки.length}`, теки.length >= 2, теки.join(", "));

    check("серед них головна", теки.includes(MEDIA_DIR_REL), теки.join(", "));

    check("і тека банерів", теки.includes("assets/images/banners"), теки.join(", "));

    // ПЕРЕЛІК БЕРЕТЬСЯ З КОНФІГУ, А НЕ ЗІ СПИСКУ В КОДІ.
    // Список у коді застаріває мовчки: нове поле з власною медіатекою
    // просто не потрапляє в прибирання, і сміття копичиться роками —
    // рівно так і сталось із банерами.
    const config = fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8");

    const зКонфігу = [...config.matchAll(/^\s*media_folder:\s*"([^"]+)"/gm)]
        .map(m => m[1].replace(/^\/+/, "").replace(/\/+$/, ""));

    check("кожна тека з конфігу врахована",
        [...new Set(зКонфігу)]
            .filter(rel => fs.existsSync(path.join(ROOT, rel)))
            .every(rel => теки.includes(rel)),
        [...new Set(зКонфігу)].join(", "));

    // Шлях у полі пишеться від кореня САЙТУ («/assets/images/banners»),
    // у корені конфігу — від кореня репозиторію. Без зведення та сама
    // тека потрапляла б у перелік двічі й оброблялась би двічі.
    check("провідна скісна в шляху поля зведена",
        теки.every(rel => !rel.startsWith("/")), теки.join(", "));

    check("повторів у переліку немає", new Set(теки).size === теки.length, теки.join(", "));

    check("у звичайному запуску працюємо саме цим переліком",
        MEDIA_DIRS.length === теки.length);

    // --- І найголовніше: однойменні файли з різних тек не склеюються.
    const ДВІ = fs.mkdtempSync(path.join(os.tmpdir(), "archive-two-"));

    const А = path.join(ДВІ, "a");
    const Б = path.join(ДВІ, "b");
    const АРХ = path.join(ДВІ, "arch");

    [А, Б, АРХ].forEach(d => fs.mkdirSync(d, { recursive: true }));

    const спільне = "однакова-назва.png";

    fs.writeFileSync(path.join(А, спільне), "а");
    fs.writeFileSync(path.join(Б, спільне), "б");

    const прогін = args => execFileSync("node", [SCRIPT, ...args], {
        cwd: ROOT,
        encoding: "utf8",
        env: {
            ...process.env,
            ARCHIVE_MEDIA_DIRS: `${А},${Б}`,
            ARCHIVE_TARGET_DIR: АРХ
        }
    });

    const звіт = прогін([]);

    check("звіт бачить обидва файли",
        звіт.includes(`${А}/${спільне}`) && звіт.includes(`${Б}/${спільне}`),
        звіт.split("\n").filter(l => l.includes(спільне)).join(" | "));

    прогін(["--apply", "--now"]);

    check("обидва перенесено, жоден не лишився",
        !fs.existsSync(path.join(А, спільне)) && !fs.existsSync(path.join(Б, спільне)));

    const вАрхіві = fs.readdirSync(АРХ).filter(f => f.includes("однакова-назва"));

    check(`в архіві два різні файли, а не один: ${вАрхіві.length}`,
        вАрхіві.length === 2, вАрхіві.join(", "));

    const manifest = JSON.parse(fs.readFileSync(path.join(АРХ, "manifest.json"), "utf8"));

    const звідки = manifest.map(i => i.from).sort();

    // Саме звідки взяли — за цим шляхом --restore кладе файл назад.
    // Один шлях на обидва означав би, що банер повернеться в теку
    // фотографій товарів, а другий файл не повернеться нікуди.
    check("маніфест памʼятає РІЗНІ теки походження",
        звідки.length === 2 && звідки[0] !== звідки[1],
        звідки.join(" | "));

    check("і це справді ті теки",
        звідки.includes(`${А}/${спільне}`) && звідки.includes(`${Б}/${спільне}`),
        звідки.join(" | "));

    fs.rmSync(ДВІ, { recursive: true, force: true });
}


console.log("\n[10a] Імʼя в коментарі — документація, а не використання");
{
    // ЗВІДКИ ВЗЯЛОСЬ. 19.10.2026 прибирання перенесло 58 файлів, а
    // mob009.png (2,4 МБ) і 1am.png (1,4 МБ) лишились на сайті. Пошук
    // натрапив на рядок у scripts/shrink-heavy-images.js —
    //
    //     //   mob009.png     2468 КБ  1122×1402  банер SUMMER SALE
    //
    // де вони перелічені як приклад того, що колись було важким. Файл
    // тримався на сайті рядком документації про те, що його час
    // прибрати.
    //
    // Сам скрипт прибирання від того ж уже був захищений — він
    // виключає СЕБЕ, бо «містить у коментарях приклади імен». Захист
    // не поширився на сусідні скрипти, які про медіа й написані.
    const КОД = fs.readFileSync(SCRIPT, "utf8");

    check("правило описане в коді", /function безКоментарів/.test(КОД));

    check("діє лише на js і ts",
        /if \(ext !== "\.js" && ext !== "\.ts"\) return text;/.test(КОД));

    // ЧОМУ НЕ ВИКЛЮЧИТИ ВСЮ ТЕКУ scripts/.
    // Бо частина скриптів посилається на картинки В КОДІ:
    // build-banners.js знає home-hero.webp, build-brand-logos.js —
    // логотипи, mega-tiles.js — плитки меню. Виключи теку цілком, і ці
    // живі файли поїдуть в архів, а на сайті зʼявляться порожні місця.
    check("тека scripts/ цілком не виключена",
        !/SKIP_DIRS = new Set\(\[[^\]]*"scripts"/.test(КОД));

    // --- І головне: проганяємо саме правило.
    const ПІСОЧНИЦЯ = fs.mkdtempSync(path.join(os.tmpdir(), "archive-comment-"));

    const М = path.join(ПІСОЧНИЦЯ, "media");
    const А2 = path.join(ПІСОЧНИЦЯ, "arch");

    [М, А2].forEach(d => fs.mkdirSync(d, { recursive: true }));

    fs.writeFileSync(path.join(М, "лише-в-коментарі.png"), "x");
    fs.writeFileSync(path.join(М, "у-коді.png"), "y");

    // Файл-джерело, де одне імʼя стоїть у коментарі, а друге — в коді.
    // Кладемо його в теку, яку збирач сіна справді читає.
    const ДЖЕРЕЛО = path.join(ROOT, "scripts", "_comment-rule-probe.js");

    fs.writeFileSync(ДЖЕРЕЛО, [
        "// приклад важкого файлу: лише-в-коментарі.png  1234 КБ",
        "const банер = \"у-коді.png\";",
        "module.exports = { банер };",
        ""
    ].join("\n"), "utf8");

    try {

        const звіт = execFileSync("node", [SCRIPT], {
            cwd: ROOT,
            encoding: "utf8",
            env: { ...process.env, ARCHIVE_MEDIA_DIRS: М, ARCHIVE_TARGET_DIR: А2 }
        });

        check("файл, згаданий лише в коментарі, вважається непотрібним",
            звіт.includes("лише-в-коментарі.png"),
            звіт.split("\n").filter(l => l.includes(".png")).join(" | "));

        // ОСЬ ЧОГО НЕ МОЖНА ЗЛАМАТИ. Якщо правило стане грубішим і
        // почне різати рядки з кодом, живі картинки поїдуть в архів.
        check("а згаданий у коді — лишається потрібним",
            !звіт.includes("у-коді.png"),
            звіт.split("\n").filter(l => l.includes(".png")).join(" | "));

    } finally {

        fs.rmSync(ДЖЕРЕЛО, { force: true });
        fs.rmSync(ПІСОЧНИЦЯ, { recursive: true, force: true });

    }
}


console.log("\n[10] Та сама картинка не лягає в архів двічі");
{
    // ЗВІДКИ ВЗЯЛОСЬ. Коли прибирання дійшло до другої медіатеки,
    // перевірка [1b] почервоніла: в архіві опинились пари байт у байт.
    //
    // Два різні випадки, і обидва справжні:
    //   • ОДНА НАЗВА, дві теки — власник завантажив те саме фото і в
    //     товари, і в банери (043_small_card_1200x1500.jpg);
    //   • РІЗНІ НАЗВИ, один вміст — кирилиця в іменах пройшла крізь
    //     конвеєр по-різному, і той самий банер лежав як
    //     «…мобильная_страница…», «…моби#U-…», «…#U043c#U043e…» і
    //     «…mobile-…»: чотири файли по 498 КБ.
    //
    // Архів лежить у git, тож зайва копія — це вага назавжди.
    const ТРИ = fs.mkdtempSync(path.join(os.tmpdir(), "archive-dup-"));

    const П = path.join(ТРИ, "p");
    const Р = path.join(ТРИ, "r");
    const АРХ = path.join(ТРИ, "arch");

    [П, Р, АРХ].forEach(d => fs.mkdirSync(d, { recursive: true }));

    // Той самий вміст під трьома різними назвами у двох теках.
    fs.writeFileSync(path.join(П, "однакова.png"), "той самий вміст");
    fs.writeFileSync(path.join(Р, "однакова.png"), "той самий вміст");
    fs.writeFileSync(path.join(Р, "інша-назва.png"), "той самий вміст");

    // І один справді інший файл — щоб було видно, що склеюємо не все.
    fs.writeFileSync(path.join(Р, "окремий.png"), "інший вміст");

    const прогін2 = args => execFileSync("node", [SCRIPT, ...args], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, ARCHIVE_MEDIA_DIRS: `${П},${Р}`, ARCHIVE_TARGET_DIR: АРХ }
    });

    прогін2(["--apply", "--now"]);

    const вАрхіві = fs.readdirSync(АРХ).filter(f => !f.endsWith(".json"));

    check(`в архіві два файли, а не чотири: ${вАрхіві.length}`,
        вАрхіві.length === 2, вАрхіві.join(", "));

    const manifest2 = JSON.parse(fs.readFileSync(path.join(АРХ, "manifest.json"), "utf8"));

    // Записів стільки ж, скільки файлів прибрали: кожен мусить знати
    // СВОЄ походження, інакше повернути його нікуди.
    check(`записів у маніфесті чотири: ${manifest2.length}`, manifest2.length === 4,
        manifest2.map(i => i.from).join(" | "));

    check("усі чотири походження різні",
        new Set(manifest2.map(i => i.from)).size === 4);

    const спільний = manifest2.filter(i => i.file === manifest2[0].file);

    check("три однакові посилаються на ОДИН файл в архіві",
        спільний.length === 3, String(спільний.length));

    check("а відмінний — на власний",
        new Set(manifest2.map(i => i.file)).size === 2,
        [...new Set(manifest2.map(i => i.file))].join(", "));

    // ПОВЕРНЕННЯ МУСИТЬ ВІДДАТИ ВСІ ТРИ.
    //
    // Файл в архіві один, а origin-ів три. Якби restore просто
    // переносив його, перший же виклик забрав би файл, і два інші
    // місця лишились би ні з чим — мовчки.
    прогін2(["--restore", "all"]);

    const повернулись = [
        path.join(П, "однакова.png"),
        path.join(Р, "однакова.png"),
        path.join(Р, "інша-назва.png"),
        path.join(Р, "окремий.png")
    ].filter(p => fs.existsSync(p));

    check(`повернулись усі чотири: ${повернулись.length}`, повернулись.length === 4,
        повернулись.map(p => path.basename(p)).join(", "));

    check("і архів спорожнів",
        fs.readdirSync(АРХ).filter(f => !f.endsWith(".json")).length === 0,
        fs.readdirSync(АРХ).join(", "));

    const післяПовернення = JSON.parse(fs.readFileSync(path.join(АРХ, "manifest.json"), "utf8"));

    // Записи прибираються ПООДИНЦІ. Фільтр за іменем файлу стер би
    // разом із своїм і чужі записи — файл лишився б в архіві без
    // жодної згадки про те, звідки він.
    check("маніфест спорожнів теж", післяПовернення.length === 0,
        JSON.stringify(післяПовернення));

    fs.rmSync(ТРИ, { recursive: true, force: true });
}


{
    // [11] ПРОГІН НЕ ЗАЛИШАЄ СЛІДІВ У СПРАВЖНІХ ТЕКАХ
    //
    // СТОЇТЬ ОСТАННІМ, І ЦЕ ВАЖЛИВО. Доки він був восьмим, знімок
    // робився ДО блоків [9] і [10] — і те, що лишали по собі вони,
    // сторож побачити не міг за побудовою. Саме так у теку товарів і
    // в корінь репозиторію потрапило шість тестових файлів, і жодна
    // перевірка про це не сказала.
    //
    // Будь-який новий блок додавати ВИЩЕ за цей.
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
    console.log("\n[11] Прогін нічого не змінив у справжніх теках");

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
