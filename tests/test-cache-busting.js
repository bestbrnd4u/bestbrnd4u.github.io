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

// Прибирання за собою.
//
// Цей набір запускає СПРАВЖНІ збірочні скрипти в корені репозиторію —
// інакше перевірялась би копія логіки, а не сама логіка. Але скрипти
// пишуть у робоче дерево, і без цього рядка після `npm test` там
// лишався хвіст змінених файлів: шум у git status, невірний штамп
// версії в сторінках і вплив на сусідні набори.
//
// Знімок повернеться на місце сам, коли процес завершиться, —
// байт у байт, навіть якщо тест упаде.
require("./helpers/workspace").guardBuildOutputs(ROOT);

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

console.log("\n[5] Заміна картинки під тим самим імʼям");
{
    // Браузер і Cloudflare кешують картинку ЗА АДРЕСОЮ. Замінили фото
    // через адмінку, лишивши імʼя, — адреса та сама, і люди ще довго
    // бачать старе.
    //
    // ЧОМУ НЕ ПЕРЕЙМЕНУВАННЯМ ФАЙЛУ
    // ------------------------------
    // Спершу це робилось саме так: у імʼя дописувався відбиток вмісту.
    // Механізм зламався на першому бойовому запуску — файл переїхав, а
    // посилання лишились на старому імені, і фото зникло з товару.
    //
    // Ціна помилки несиметрична: застарілий кеш — це «попередня
    // картинка кілька годин», розʼїхане посилання — «товар без фото».
    // Тому версія тепер живе в АДРЕСІ, а імʼя файлу не змінюється:
    // розійтися нічому за побудовою.
    const builder = read("scripts/build-products.js");

    check("версію проставляє збірка", /function stampImageVersions/.test(builder));
    check("відбиток від вмісту файлу",
        /createHash\("sha1"\)\s*\n?\s*\.update\(fs\.readFileSync\(file\)\)/.test(builder));

    // Перейменування за вмістом прибрано — і в самому перейменовувачі
    // про це сказано, щоб ніхто не повернув його наосліп.
    const renamer = read("scripts/normalize-media-names.js");

    // Дивимось на КОД, а не на пояснення: у комментарі механізм названий
    // своїм імʼям навмисно, щоб його не повернули наосліп.
    const renamerCode = renamer
        .replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

    check("перейменування за вмістом прибрано",
        !/image-fingerprints/.test(renamerCode) && !/contentHash/.test(renamerCode));
    check("причину зафіксовано в коді",
        /ЧОМУ ТУТ БІЛЬШЕ НЕМА ПЕРЕЙМЕНУВАННЯ ЗА ВМІСТОМ/.test(renamer));
    check("реєстра відбитків більше немає",
        !fs.existsSync(path.join(ROOT, "data/image-fingerprints.json")));

    // Перейменування задовгих імен лишається: воно потрібне через
    // обмеження файлової системи й спрацьовує при завантаженні.
    check("обмеження довжини імені лишилось", /MAX_NAME/.test(renamer));
}

console.log("\n[5b] Версії у згенерованих даних відповідають файлам");
{
    const crypto = require("crypto");

    const products = JSON.parse(read("data/products.json"));

    const images = products.flatMap(p =>
        (p.variants || []).flatMap(v => v.images || []));

    check("фото знайдено", images.length > 0, images.length);

    // У кожного фото мусить бути версія, інакше заміна лишиться
    // непоміченою браузером.
    const noVersion = images.filter(src => !/\?v=[0-9a-f]{8}$/.test(src));

    check("у всіх фото є версія", noVersion.length === 0,
        noVersion.slice(0, 3).join(", "));

    // І вона мусить збігатися з реальним вмістом: розбіжність означала
    // б, що версія застаріла й заміну знову не побачать.
    const wrong = [...new Set(images)].filter(src => {

        const [clean, query] = src.split("?");
        const file = path.join(ROOT, clean.replace(/^\//, ""));

        if (!fs.existsSync(file)) return true;

        const hash = crypto.createHash("sha1")
            .update(fs.readFileSync(file)).digest("hex").slice(0, 8);

        return query !== `v=${hash}`;

    });

    check("версії збігаються з вмістом файлів", wrong.length === 0,
        wrong.slice(0, 3).join(", "));

    // Джерельні файли адмінки лишаються чистими: версія — справа
    // збірки, і в редакторі шляхи мають бути звичайними.
    const sources = fs.readdirSync(path.join(ROOT, "data/products"))
        .filter(f => f.endsWith(".json"))
        .filter(f => /\?v=/.test(read(`data/products/${f}`)));

    check("у джерелах версій немає", sources.length === 0, sources.slice(0, 3).join(", "));
}

console.log("\n[5c] srcset розуміє адресу з версією");
{
    // «Відрізання .webp» від хвоста з версією дало б безглузду адресу
    // на кшталт photo.webp?v=abc-600.webp.
    const ui = read("assets/js/ui.js");
    const fn = new Function(
        ui.match(/function buildSrcSet[\s\S]*?\n\}/)[0] + "; return buildSrcSet;")();

    const plain = fn("a/photo.webp");

    check("без версії працює як раніше",
        plain === "a/photo-300.webp 300w, a/photo-600.webp 600w, a/photo.webp 1200w", plain);

    const versioned = fn("a/photo.webp?v=abc12345");

    check("версія переходить на всі розміри",
        versioned === "a/photo-300.webp?v=abc12345 300w, "
            + "a/photo-600.webp?v=abc12345 600w, "
            + "a/photo.webp?v=abc12345 1200w", versioned);

    check("не-webp і далі без srcset", fn("a/photo.jpg") === null);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
