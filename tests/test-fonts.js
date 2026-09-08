// Шрифт: один блок на кожній сторінці й жодного @import у CSS.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Inter підключався двома різними способами одночасно:
//
//   1. <link> у <head> — на 48 сторінках зі 149;
//   2. @import у першому рядку assets/css/style.css — на всіх.
//
// @import усередині CSS браузер бачить лише ПІСЛЯ того, як завантажить
// і розбере саму таблицю стилів. Виходить ланцюжок із трьох
// послідовних запитів, і текст чекає на всі три:
//
//   HTML → style.css → fonts.googleapis.com/css2 → woff2
//
// Заміряно: без <link> лишались 101 сторінка — усі сторінки товарів,
// тобто саме ті, куди люди приходять із пошуку Google.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. @import не повернувся в CSS (найлегша регресія: додати шрифт
//    «як усі роблять» — рядком у стилях).
// 2. Блок є на КОЖНІЙ сторінці, яка вантажить style.css.
// 3. Ваги в посиланні = ваги, які справді вживає CSS.
// 4. Збірка сходиться за ОДИН прохід: другий запуск не має нічого
//    змінювати, інакше `--check` після збірки падав би.
// 5. Прев'ю в адмінці шрифт теж отримує — iframe Decap будує голову
//    сам, і <link> зі сторінки в нього не потрапляє.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const fonts = require("../scripts/sync-fonts.js");

const css = read("assets/css/style.css");

// Правила без комментарів: у самому файлі слово @import згадується в
// поясненні, чому його там немає, — і перевірка нижче спіткнулась би
// про власний коментар.
const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[1] У CSS немає @import на шрифт");
{
    check("жодного @import на Google Fonts",
        !/@import[^;]*fonts\.googleapis/i.test(cssRules),
        (cssRules.match(/@import[^;]*/) || [])[0]);

    // Взагалі жодного @import: будь-який із них — це ще один
    // послідовний запит після завантаження стилів.
    check("взагалі жодного @import у стилях",
        !/@import/i.test(cssRules),
        (cssRules.match(/@import[^;]*/) || [])[0]);

    check("натомість у файлі написано, де шрифт", /Шрифт підключається в <head>/.test(css));
}

console.log("\n[2] Ваги в посиланні = ваги, які вживає CSS");
{
    // Кожна зайва вага — це окремий файл на кожен потрібний набір
    // символів (латиниця + кирилиця). Ваги 300 у стилях немає ніде,
    // а замовлялась вона обома способами.
    const used = new Set((css.match(/font-weight:\s*(\d+)/g) || [])
        .map(row => Number(row.replace(/\D/g, ""))));

    const asked = new Set(fonts.WEIGHTS);

    const missing = [...used].filter(w => !asked.has(w));
    const extra = [...asked].filter(w => !used.has(w));

    check(`CSS вживає ваги: ${[...used].sort((a, b) => a - b).join(", ")}`, used.size > 0);

    check("усі вживані ваги замовлені", missing.length === 0, missing.join(", "));

    check("зайвих ваг не замовляємо", extra.length === 0, extra.join(", "));

    check("посилання просить swap (текст видно одразу)",
        /display=swap/.test(fonts.FONT_URL));
}

console.log("\n[3] Блок є на кожній сторінці зі стилями");
{
    function htmlFiles(dir, out) {

        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

            if (entry.name === "node_modules" || entry.name === ".git"
                || entry.name === ".claude") return;

            const full = path.join(dir, entry.name);

            if (entry.isDirectory()) htmlFiles(full, out);
            else if (entry.name.endsWith(".html")) out.push(full);

        });

        return out;

    }

    const pages = htmlFiles(ROOT, []);

    const withStyle = pages.filter(file => /assets\/css\/style\.css/.test(fs.readFileSync(file, "utf8")));

    const missing = [];
    const late = [];
    const twice = [];

    withStyle.forEach(file => {

        const html = fs.readFileSync(file, "utf8");

        const font = html.indexOf("fonts.googleapis.com/css2");
        const style = html.indexOf("assets/css/style.css");

        if (font < 0) { missing.push(path.relative(ROOT, file)); return; }

        // Блок мусить стояти ПЕРЕД стилями: інакше браузер бачить
        // шрифт пізніше, ніж міг би.
        if (font > style) late.push(path.relative(ROOT, file));

        // Двічі — це два запити за тим самим.
        if ((html.match(/fonts\.googleapis\.com\/css2/g) || []).length > 1) {
            twice.push(path.relative(ROOT, file));
        }

    });

    check(`сторінок зі стилями: ${withStyle.length}`, withStyle.length > 100);

    check("шрифт є на всіх", missing.length === 0,
        `${missing.length}: ${missing.slice(0, 3).join(", ")}`);

    check("і стоїть перед стилями", late.length === 0,
        `${late.length}: ${late.slice(0, 3).join(", ")}`);

    check("і жодного разу не замовлений двічі", twice.length === 0,
        `${twice.length}: ${twice.slice(0, 3).join(", ")}`);

    // preconnect до gstatic: самі файли шрифту лежать там, і без
    // нього з'єднання з ним починається вже після розбору CSS.
    const noPreconnect = withStyle.filter(file =>
        !/preconnect[^>]*fonts\.gstatic\.com/.test(fs.readFileSync(file, "utf8")));

    check("preconnect до gstatic скрізь", noPreconnect.length === 0,
        `${noPreconnect.length}: ${noPreconnect.slice(0, 3).join(", ")}`);
}

console.log("\n[4] Збірка сходиться за один прохід");
{
    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ. Спершу крок прибирав шрифт по тегах, і
    // після кожного проходу перед блоком лишався ще один порожній
    // рядок. Другий запуск давав інший файл, ніж перший, — тобто
    // `npm run build` двічі підряд робив різні сторінки, а
    // `sync-fonts --check` після збірки падав.
    const page = read("index.html");

    const once = fonts.syncPage(page);
    const twice = fonts.syncPage(once);

    check("другий прохід нічого не змінює", once === twice,
        once === twice ? "" : "перший і другий проходи дають різне");

    // На сторінці без стилів сайту (адмінка) не чіпаємо нічого.
    const plain = "<html><head><title>x</title></head><body></body></html>";

    check("сторінку без стилів сайту не чіпаємо", fonts.syncPage(plain) === plain);

    check("крок є в npm run build",
        /sync-fonts\.js/.test(read("package.json")));
}

console.log("\n[5] Прев'ю в адмінці теж має шрифт");
{
    // iframe Decap будує голову сам: жодного <link> зі сторінки в ньому
    // немає. Без окремої реєстрації картка в адмінці малювалась би
    // системним шрифтом, а на сайті — Inter, і прев'ю перестало б
    // показувати те саме, що покупець.
    const preview = read("admin/preview-templates.js");

    check("шрифт зареєстрований як стиль прев'ю",
        /registerPreviewStyle\(\s*"https:\/\/fonts\.googleapis\.com\/css2/.test(preview));

    check("і саме ті самі ваги, що на сайті",
        preview.includes(`wght@${fonts.WEIGHTS.join(";")}`),
        (preview.match(/wght@[\d;]+/) || [])[0]);

    check("сторінка стилів сайту в прев'ю лишилась",
        /registerPreviewStyle\("\.\.\/assets\/css\/style\.css/.test(preview));
}

console.log(failures ? `\n❌ Провалено: ${failures}` : "\n✅ Шрифт: один блок, паралельний запит, жодного @import");

process.exit(failures ? 1 : 0);
