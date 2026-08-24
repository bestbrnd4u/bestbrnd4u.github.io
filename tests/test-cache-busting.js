// Кеш має оновлюватись сам.
//
// СИМПТОМ
// --------
// Після викладки на прод люди бачили стару версію сайту й мусили
// чистити кеш вручну.
//
// ПРИЧИНА
// --------
// Жоден файл не версіонувався. Браузер (а перед ним ще й Cloudflare)
// кешує ЗА АДРЕСОЮ, а адреса при оновленні лишалась тією самою:
// assets/js/app.js як був, так і лишився. Для кеша це «той самий
// файл» — він і віддавав старий.
//
// Найгірше було не «стара версія», а СУМІШ: свіжий HTML разом зі
// старим JS. Сторінка ламалась способом, який неможливо відтворити в
// розробника — у нього кеш порожній.
//
// РІШЕННЯ: відбиток вмісту в адресі. Змінився файл — змінилась адреса —
// кеш зобовʼязаний піти по нову копію. Не змінився — адреса та сама, і
// файл береться з кеша, як і має бути.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const index = read("index.html");

console.log("\n[1] Файли коду мають версію в адресі");
{
    const versioned = (index.match(/(?:src|href)="assets\/(?:js|css)\/[^"]*\?v=[a-f0-9]+"/g) || []);
    const bare = (index.match(/(?:src|href)="assets\/(?:js|css)\/[^"?]*"/g) || []);

    check(`посилань з версією — ${versioned.length}`, versioned.length > 0);
    check("посилань без версії не лишилось", bare.length === 0, bare.slice(0, 3).join(" | "));

    // Відбиток рахується від ВМІСТУ, а не від часу збірки: інакше кожна
    // збірка змушувала б усіх перекачувати весь сайт, навіть коли в
    // ньому нічого не змінилось.
    const hash = crypto.createHash("sha1")
        .update(fs.readFileSync(path.join(ROOT, "assets/css/style.css")))
        .digest("hex").slice(0, 8);

    check("відбиток збігається з вмістом файлу",
        index.includes(`assets/css/style.css?v=${hash}`), hash);
}

console.log("\n[2] Дані теж не залипають у кеші");
{
    // data/*.json тягне fetch, і кеш зберігає їх за адресою так само,
    // як скрипти. Через це після викладки новий товар міг не зʼявитись.
    check("список версій вкладений у сторінку", /window\.ASSET_VERSIONS = \{/.test(index));
    check("у ньому є products.json", /"data\/products\.json":"[a-f0-9]+"/.test(index));

    // Рядок мусить іти раніше за скрипти, які ним користуються.
    check("список стоїть до підключення коду",
        index.indexOf("window.ASSET_VERSIONS") < index.indexOf('src="assets/js/'));

    const common = read("assets/js/common.js");

    check("є помічник підстановки версії", /function dataUrl\(url\)/.test(common));

    // Без версій сторінка має працювати, просто без переваги — гірше,
    // ніж могло б бути, але точно не зламано.
    check("без версій повертає адресу як є",
        /return version \? `\$\{url\}\?v=\$\{version\}` : url/.test(common));

    // Жодного прямого fetch повз помічника: один пропущений виклик — і
    // саме той файл лишиться протухати в кеші.
    const direct = [];

    fs.readdirSync(path.join(ROOT, "assets/js"))
        .filter(f => f.endsWith(".js"))
        .forEach(f => {
            const src = read(`assets/js/${f}`);
            if (/fetch\("data\//.test(src)) direct.push(f);
        });

    check("усі запити даних ідуть через помічника", direct.length === 0, direct.join(", "));
}

console.log("\n[3] Повторна збірка нічого не ламає");
{
    // Крок має бути ідемпотентним: інакше друга збірка дала б
    // ?v=старе?v=нове, і адреса перестала б відповідати файлу.
    const run = () => execFileSync("node",
        [path.join(ROOT, "scripts/apply-cache-version.js")],
        { cwd: ROOT, encoding: "utf8" });

    // Перший запуск може щось змінити законно: дерево могло бути не
    // вирівняне після інших тестів, які перезбирають дані чи сторінки.
    // Ідемпотентність — це коли ДРУГИЙ запуск поспіль уже нічого не
    // змінює. Порівнювати «до першого / після першого» означало б
    // перевіряти стан дерева, а не поведінку скрипта.
    run();

    const before = read("index.html");

    run();

    const after = read("index.html");

    check("другий запуск поспіль нічого не змінює", before === after);
    check("подвійних версій немає", !/\?v=[a-f0-9]+\?v=/.test(after));
}

console.log("\n[4] Крок вбудований у збірку");
{
    const pkg = JSON.parse(read("package.json"));

    check("виконується під час build", /apply-cache-version\.js/.test(pkg.scripts.build));

    // Має бути ОСТАННІМ: сторінки товарів генеруються раніше, і якби
    // версії проставлялись до них, згенеровані сторінки лишились би
    // без версій.
    const steps = pkg.scripts.build.split("&&").map(s => s.trim());

    check("іде після генерації сторінок",
        steps.indexOf(steps.find(s => s.includes("apply-cache-version")))
            > steps.indexOf(steps.find(s => s.includes("build-product-pages"))));

    check("це останній крок",
        steps[steps.length - 1].includes("apply-cache-version"), steps[steps.length - 1]);

    // Згенеровані сторінки товарів теж мусять бути покриті.
    //
    // Стан дерева міг зачепити сусідній набір (test-static-product-pages
    // перезбирає сторінки для перевірки ідемпотентності), тож спершу
    // вирівнюємо його самі — інакше перевірка залежала б від порядку
    // виконання тестів, а не від коду.
    execFileSync("node", [path.join(ROOT, "scripts/apply-cache-version.js")],
        { cwd: ROOT, encoding: "utf8" });

    const pages = fs.readdirSync(path.join(ROOT, "p"));
    const sample = read(`p/${pages[0]}/index.html`);

    check("сторінки товарів теж версіоновані",
        /\/assets\/js\/product\.js\?v=[a-f0-9]+/.test(sample));
    check("і мають список версій даних", /window\.ASSET_VERSIONS/.test(sample));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
