// Тести прибирають за собою.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Три набори перевіряють збірку так, як вона працює насправді:
// запускають scripts/*.js із cwd у корені репозиторію. Це правильно —
// інакше перевірялась би копія логіки, а не сама логіка. Але скрипти
// пишуть у робоче дерево, і після `npm test` там лишалось 171 змінений
// файл.
//
// Чим це було погано, крім шуму в git status:
//
//   * ШТАМП ВЕРСІЇ ЛИШАВСЯ НЕВІРНИМ. test-cache-busting запускає
//     apply-cache-version.js окремо, без попередніх кроків збірки, тож у
//     сторінках осідало посилання на версію data/products.json, якої в
//     комітi немає (спостережено: 8fe55d4b → b1951887). Хто закомітить
//     після прогону тестів — закомітить зламане кешування.
//
//   * СУДИТИ «ЧИ ЧИСТА ЗБІРКА» СТАВАЛО НЕМОЖЛИВО. Щоб отримати
//     осмислене «0 змін», доводилось збирати ПІСЛЯ тестів, а не до, — і
//     через це двічі здавалось, ніби збірка не ідемпотентна.
//
//   * НАБОРИ ВПЛИВАЛИ ОДИН НА ОДНОГО. Це вже було видно в коментарях
//     самих тестів: «стан дерева міг зачепити сусідній набір».
//
// ГОЛОВНА ВИМОГА, ЯКУ СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// --------------------------------------------
// Тест, який пише в робоче дерево, зобовʼязаний повернути його як було.
// Спосіб на вибір: спільна охорона (helpers/workspace) або власне
// прибирання — але не «ніяк».
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const workspace = require("./helpers/workspace");

console.log("\n[1] Помічник справді повертає все на місце");
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ws-guard-"));

    fs.writeFileSync(path.join(tmp, "keep.txt"), "було");
    fs.writeFileSync(path.join(tmp, "gone.txt"), "зникне");
    fs.mkdirSync(path.join(tmp, "sub"));
    fs.writeFileSync(path.join(tmp, "sub", "deep.txt"), "глибоко");

    const snap = workspace.take(tmp, ["keep.txt", "gone.txt", "sub"]);

    // Робимо все, що може зробити збірочний скрипт.
    fs.writeFileSync(path.join(tmp, "keep.txt"), "зіпсовано");
    fs.unlinkSync(path.join(tmp, "gone.txt"));
    fs.writeFileSync(path.join(tmp, "sub", "новий.txt"), "зайвий");
    fs.mkdirSync(path.join(tmp, "sub", "нова-тека"));
    fs.writeFileSync(path.join(tmp, "sub", "нова-тека", "щось.txt"), "і тут");

    workspace.restore(snap);

    check("змінений файл повернуто байт у байт",
        fs.readFileSync(path.join(tmp, "keep.txt"), "utf8") === "було");

    check("видалений файл відновлено",
        fs.existsSync(path.join(tmp, "gone.txt"))
        && fs.readFileSync(path.join(tmp, "gone.txt"), "utf8") === "зникне");

    check("створений файл прибрано",
        !fs.existsSync(path.join(tmp, "sub", "новий.txt")));

    check("створену теку прибрано",
        !fs.existsSync(path.join(tmp, "sub", "нова-тека")));

    check("те, що було, лишилось на місці",
        fs.readFileSync(path.join(tmp, "sub", "deep.txt"), "utf8") === "глибоко");

    // Повторне відновлення нічого не ламає: обробник виходу може
    // спрацювати після власного прибирання тесту.
    workspace.restore(snap);
    check("повторне відновлення безпечне",
        fs.readFileSync(path.join(tmp, "keep.txt"), "utf8") === "було");

    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("\n[2] Охорона стоїть там, де пишуть у дерево");
{
    // Ці три запускають збірочні скрипти в корені й без охорони лишали
    // хвіст. Перелік точний: якщо охорону приберуть, тут стане видно.
    const ПИШУТЬ = [
        "test-cache-busting.js",
        "test-site-environments.js",
        "test-static-product-pages.js"
    ];

    const без = ПИШУТЬ.filter(name =>
        !fs.readFileSync(path.join(__dirname, name), "utf8").includes("guardBuildOutputs"));

    check("усі три оголошують охорону", без.length === 0, без.join(", "));

    // Охорона мусить стояти ДО запуску скриптів, інакше знімок зафіксує
    // вже зіпсоване дерево.
    const запізно = ПИШУТЬ.filter(name => {
        const src = fs.readFileSync(path.join(__dirname, name), "utf8");
        const guard = src.indexOf("guardBuildOutputs");
        const run = src.indexOf("execFileSync(");
        return guard < 0 || (run >= 0 && guard > run);
    });
    check("охорона оголошена до першого запуску скрипта", запізно.length === 0, запізно.join(", "));
}

console.log("\n[3] Новий тест не зможе тихо забруднити дерево");
{
    // Ознака «тест запускає щось у корені репозиторію» — cwd: ROOT.
    // Такий тест мусить або взяти спільну охорону, або прибирати сам.
    //
    // Винятки перелічені поіменно, з причиною: інакше рядок у списку
    // згодом стане прикриттям для справжньої недбалості.
    const ВИНЯТКИ = {
        "test-image-archive.js":
            "пише свої тимчасові файли й прибирає їх сам (rmSync у кінці кожного блоку), "
            + "а manifest і pending повертає в попередній стан",
        "test-indexnow.js":
            "копіює скрипти в окрему тимчасову теку й запускає їх ТАМ; "
            + "виклики з cwd: ROOT лише читають"
    };

    const усі = fs.readdirSync(__dirname)
        .filter(f => f.startsWith("test-") && f.endsWith(".js"));

    const пишутьУКорінь = усі.filter(f =>
        /cwd:\s*ROOT/.test(fs.readFileSync(path.join(__dirname, f), "utf8")));

    const беззахисні = пишутьУКорінь.filter(f =>
        !fs.readFileSync(path.join(__dirname, f), "utf8").includes("guardBuildOutputs")
        && !ВИНЯТКИ[f]);

    check("кожен тест із cwd: ROOT або під охороною, або в переліку винятків",
        беззахисні.length === 0, беззахисні.join(", "));

    // Виняток мусить лишатись реальним: файл перейменували — запис тихо
    // перестає діяти, і перевірка вище це проґавить.
    const мертві = Object.keys(ВИНЯТКИ).filter(f => !пишутьУКорінь.includes(f));
    check("усі записані винятки ще існують і ще запускають щось у корені",
        мертві.length === 0, мертві.join(", "));
}

console.log("\n[4] Перелік того, що знімається, покриває вихід збірки");
{
    const цілі = workspace.BUILD_OUTPUTS;

    // Куди пише збірка — видно з самого воркфлоу: там ці шляхи
    // перелічені в git add.
    const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/build-dev.yml"), "utf8");

    ["data", "p", "sitemap.xml", "robots.txt", "admin/config.yml"].forEach(шлях => {
        check(`«${шлях}» під знімком`, цілі.includes(шлях));
        check(`«${шлях}» справді вихід збірки (є в git add воркфлоу)`,
            workflow.includes(шлях));
    });

    // Сторінки в корені перелічувати поіменно не варто — зʼявиться
    // нова, і про неї забудуть.
    check("сторінки в корені беруться маскою, а не списком", цілі.includes("*.html"));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");
process.exit(failures ? 1 : 0);
