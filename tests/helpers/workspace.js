// Знімок робочого дерева для тестів, які запускають СПРАВЖНІ збірочні
// скрипти.
//
// НАВІЩО
// -------
// Три набори перевіряють збірку так, як вона працює насправді: запускають
// scripts/*.js із cwd у корені репозиторію. Це правильно — інакше
// перевірялась би копія логіки, а не сама логіка. Але скрипти пишуть у
// робоче дерево, і після `npm test` там лишалось 171 змінений файл.
//
// Чим це погано, крім шуму:
//
//   * штамп версії лишався НЕВІРНИМ. Тест запускає apply-cache-version.js
//     окремо, без попередніх кроків збірки, тож у сторінках осідало
//     посилання на версію data/products.json, якої в комітi немає. Хто
//     закомітить після прогону тестів — закомітить зламане кешування;
//
//   * судити «чи чиста збірка» ставало неможливо: щоб отримати
//     осмислене «0 змін», доводилось збирати ПІСЛЯ тестів, а не до;
//
//   * набори впливали один на одного. Це вже видно в коментарях самих
//     тестів: «стан дерева міг зачепити сусідній набір».
//
// ЯК КОРИСТУВАТИСЬ
// -----------------
//     const { guardBuildOutputs } = require("./helpers/workspace");
//     guardBuildOutputs(ROOT);
//
// Один рядок на початку тесту. Далі можна запускати що завгодно: знімок
// повернеться на місце САМ, коли процес завершиться, — байт у байт,
// незалежно від того, чи тест пройшов, упав з винятком, чи покликав
// process.exit(). Кожен тест раннер запускає окремим процесом, тож
// обробник "exit" тут — найнадійніше місце.
const fs = require("fs");
const path = require("path");

// Куди пишуть збірочні скрипти. Тека означає «і все, що всередині».
//
// Список навмисно ширший за потреби кожного окремого тесту: дешевше
// зняти на 3 МБ більше, ніж потім шукати, чому після одного набору
// лишився хвіст.
const BUILD_OUTPUTS = [
    "data",
    "p",
    "sitemap.xml",
    "robots.txt",
    "CNAME",
    "admin/index.html",
    "admin/config.yml",
    // Сторінки в корені: перелічувати їх поіменно не варто — зʼявиться
    // нова, і про неї забудуть.
    "*.html"
];

function expand(root, target) {

    if (target !== "*.html") return [target];

    return fs.readdirSync(root).filter(function (name) {
        return name.endsWith(".html");
    });

}

function collect(root, rel, files, dirs) {

    var abs = path.join(root, rel);
    var st;

    try { st = fs.statSync(abs); } catch (error) { return; }

    if (st.isDirectory()) {

        dirs.add(rel);

        fs.readdirSync(abs).forEach(function (name) {
            collect(root, path.join(rel, name), files, dirs);
        });

        return;

    }

    files.set(rel, fs.readFileSync(abs));

}

function take(root, targets) {

    var files = new Map();
    var dirs = new Set();

    targets.forEach(function (target) {
        expand(root, target).forEach(function (rel) {
            collect(root, rel, files, dirs);
        });
    });

    return { root: root, targets: targets, files: files, dirs: dirs };

}

function restore(snap) {

    // 1. Те, що було, повертаємо байт у байт. Файл, який не змінився,
    //    не чіпаємо — щоб не переставляти час зміни без потреби.
    snap.files.forEach(function (buf, rel) {

        var abs = path.join(snap.root, rel);

        try {

            if (fs.existsSync(abs) && fs.readFileSync(abs).equals(buf)) return;

            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, buf);

        } catch (error) {

            // Відновлення — прибирання за собою, а не мета тесту.
            // Якщо не вдалося, краще лишити як є, ніж упасти в
            // обробнику виходу й приховати справжній результат.

        }

    });

    // 2. Те, чого не було, прибираємо.
    var now = take(snap.root, snap.targets);

    now.files.forEach(function (_buf, rel) {

        if (snap.files.has(rel)) return;

        try { fs.unlinkSync(path.join(snap.root, rel)); } catch (error) { /* див. вище */ }

    });

    // 3. Теки, що зʼявились, — теж. Знизу вгору, інакше батьківська
    //    ще не порожня. rmdirSync сам відмовиться видаляти непорожню.
    Array.from(now.dirs)
        .filter(function (rel) { return !snap.dirs.has(rel); })
        .sort(function (a, b) { return b.length - a.length; })
        .forEach(function (rel) {
            try { fs.rmdirSync(path.join(snap.root, rel)); } catch (error) { /* не порожня — і добре */ }
        });

}

function guard(root, targets) {

    var snap = take(root, targets);

    process.on("exit", function () { restore(snap); });

    return snap;

}

function guardBuildOutputs(root) {
    return guard(root, BUILD_OUTPUTS);
}

module.exports = { take: take, restore: restore, guard: guard, guardBuildOutputs: guardBuildOutputs, BUILD_OUTPUTS: BUILD_OUTPUTS };
