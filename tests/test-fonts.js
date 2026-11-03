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
const fetch = require("../scripts/fetch-fonts.js");

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

console.log("\n[2] Варіативний шрифт покриває всі ваги, які вживає CSS");
{
    // ЧОМУ ВАРІАТИВНИЙ.
    //
    // Доти шрифт замовлявся шістьма окремими накресленнями, і кожне
    // було окремим файлом на кожну абетку. Заміряно 03.11.2026:
    // «wght@400;500;600;700;800;900» — це 42 файли й 1280 КБ, а
    // «wght@100..900» — 7 файлів і 213 КБ. Один файл на абетку
    // покриває всі ваги одразу.
    //
    // Тому перевіряємо не «список ваг збігається», а «кожна вжита
    // вага потрапляє в діапазон, який оголошує @font-face».
    const блок = (css.match(fetch.БЛОК_RE) || [])[0] || "";

    check("блок @font-face знайдено в style.css", Boolean(блок));

    // Ваги сайту беремо з ПРАВИЛ САЙТУ, а не з самого блоку: у ньому
    // стоїть «font-weight:100 900», і воно потрапило б у вибірку.
    const свої = new Set((css.replace(блок, "").match(/font-weight:\s*(\d+)/g) || [])
        .map(row => Number(row.replace(/\D/g, ""))));

    check(`CSS вживає ваги: ${[...свої].sort((a, b) => a - b).join(", ")}`, свої.size > 0);

    const діапазон = (блок.match(/font-weight:(\d+)\s+(\d+)/) || []).slice(1).map(Number);

    check(`шрифт оголошує діапазон ${діапазон.join("–") || "?"}`, діапазон.length === 2);

    const поза = [...свої].filter(w => w < діапазон[0] || w > діапазон[1]);

    check("усі вживані ваги в діапазоні шрифту", поза.length === 0, поза.join(", "));

    // swap — щоб текст було видно одразу, ще до приходу шрифту.
    const правил = (блок.match(/@font-face\{/g) || []).length;
    const зSwap = (блок.match(/font-display:swap/g) || []).length;

    check(`swap у всіх ${правил} правилах`, правил > 0 && зSwap === правил,
        `${зSwap} із ${правил}`);
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

    const керовані = withStyle.filter(file =>
        /<link\b[^>]*assets\/css\/style\.css/.test(fs.readFileSync(file, "utf8")));

    керовані.forEach(file => {

        const html = fs.readFileSync(file, "utf8");

        const font = html.indexOf("rel=\"preload\" as=\"font\"");
        const style = html.indexOf("assets/css/style.css");

        if (font < 0) { missing.push(path.relative(ROOT, file)); return; }

        // Блок мусить стояти ПЕРЕД стилями: інакше браузер дізнається
        // про шрифт аж із розібраного CSS, тобто на цілий запит пізніше.
        if (font > style) late.push(path.relative(ROOT, file));

        // Двічі — це два запити за тим самим.
        if ((html.match(/rel="preload" as="font"[^>]*inter-[^>]*latin\.woff2/g) || []).length > 1) {
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

    // ЖОДНОЇ ЗГАДКИ GOOGLE FONTS НА САЙТІ.
    //
    // Це і є суть переїзду: шрифт більше не вимагає двох чужих
    // доменів і render-blocking запиту перед показом тексту.
    const зGoogle = pages.filter(file =>
        /fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(file, "utf8")));

    check("жодна сторінка не ходить по шрифт до Google", зGoogle.length === 0,
        `${зGoogle.length}: ${зGoogle.slice(0, 3).map(f => path.relative(ROOT, f)).join(", ")}`);

    // ПРОГРІВАННЯ ДО SUPABASE — У ЦЬОМУ Ж БЛОЦІ.
    //
    // До jsdelivr браузер з'єднується сам: тег <script> стоїть у
    // <head>, і передсканер бачить його одразу. А до Supabase
    // звертається вже ЗАВАНТАЖЕНИЙ звідти клієнт — рукостискання
    // починається аж після виконання чужого скрипта й лягає чистою
    // затримкою перед першим запитом залишків, від яких залежить
    // кнопка купівлі.
    //
    // Заміряно 03.11.2026, медіана з п'яти холодних з'єднань:
    // TLS 42 мс, перший байт 77 мс.
    const supabaseOrigin = new URL(
        read("assets/js/supabase-client.js").match(/const SUPABASE_URL = "([^"]+)"/)[1]).origin;

    check(`сторінок під кроком: ${керовані.length}`, керовані.length > 100);

    const noSupabase = керовані.filter(file =>
        !fs.readFileSync(file, "utf8").includes(`preconnect" href="${supabaseOrigin}"`));

    check("preconnect до Supabase скрізь", noSupabase.length === 0,
        `${noSupabase.length}: ${noSupabase.slice(0, 3).join(", ")}`);

    // crossorigin ОБОВ'ЯЗКОВИЙ: запити до Supabase — CORS-fetch без
    // кук, і без цього прапорця браузер прогріте з'єднання для них не
    // використає. Тобто підказка лишилась би, а користі з неї — нуль.
    const безПрапорця = керовані.filter(file => {
        const html = fs.readFileSync(file, "utf8");
        const тег = (html.match(new RegExp(`<link[^>]*${supabaseOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^>]*>`)) || [])[0] || "";
        return !/crossorigin/.test(тег);
    });

    check("і саме з crossorigin", безПрапорця.length === 0,
        `${безПрапорця.length}: ${безПрапорця.slice(0, 3).join(", ")}`);

    // ХОСТ — З КОДУ, А НЕ ДРУГОЮ КОПІЄЮ.
    //
    // Копія в кроці збірки розійшлася б із оригіналом рівно тоді,
    // коли проєкт переїде, — і прогрівання тихо гріло б чужу адресу.
    check("крок читає хост із supabase-client.js",
        /supabase-client\.js/.test(read("scripts/sync-fonts.js")),
        "крок не звертається до джерела адреси");

    check("і сам хост у кроці не записаний",
        !read("scripts/sync-fonts.js").includes(supabaseOrigin),
        "у sync-fonts.js лежить друга копія адреси");
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

console.log("\n[4b] Файли шрифту свої, на місці й без зайвих");
{
    const блок = (css.match(fetch.БЛОК_RE) || [])[0] || "";

    // Запит ?v= відрізаємо: він не частина імені файлу, а умова, за
    // якою спрацьовує правило кешу Cloudflare (див. нижче).
    const згадані = [...блок.matchAll(/url\(\.\.\/fonts\/([^)?]+)[^)]*\)/g)].map(m => m[1]);

    check(`у правилах згадано ${згадані.length} файлів`, згадані.length > 0);

    // ШЛЯХ ВІДНОСНО CSS, А НЕ СТОРІНКИ.
    //
    // «../fonts/…» рахується від самого style.css, тож однаково
    // працює і на /index.html, і на /p/slug/index.html. Абсолютний
    // шлях тут теж спрацював би, але відносний переживе переїзд
    // сайту в підтеку.
    check("шляхи відносні до таблиці стилів",
        згадані.length === (блок.match(/url\(\.\.\/fonts\//g) || []).length);

    const тека = path.join(ROOT, "assets", "fonts");

    const немає = згадані.filter(f => !fs.existsSync(path.join(тека, f)));

    check("кожен згаданий файл лежить у assets/fonts", немає.length === 0, немає.join(", "));

    const наДиску = fs.existsSync(тека)
        ? fs.readdirSync(тека).filter(f => f.endsWith(".woff2")) : [];

    const зайві = наДиску.filter(f => !згадані.includes(f));

    check("зайвих файлів у теці немає", зайві.length === 0, зайві.join(", "));

    // Те, що підказуємо в <head>, теж мусить існувати.
    const підказані = fonts.fontFiles();

    check(`підказуємо ${підказані.length} підмножини`, підказані.length === 2,
        підказані.join(", "));

    check("підказані файли існують",
        підказані.every(f => fs.existsSync(path.join(тека, f))), підказані.join(", "));

    // CYRILLIC-EXT МУСИТЬ СТОЯТИ ПІСЛЯ LATIN-EXT.
    //
    // Символ гривні U+20B4 лежить у ДВОХ підмножинах: явно в
    // cyrillic-ext і всередині U+20AD-20C4 в latin-ext. Коли
    // діапазони перекриваються, браузер бере правило, що НИЖЧЕ.
    //
    // ЗАМІРЯНО 03.11.2026 на /aktsii/: у порядку Google нижче стоїть
    // latin-ext, і сторінка тягнула 83 КБ замість 26 — заради одного
    // гліфа в підзаголовку «Ціни від 6 500 ₴ до 13 000 ₴». Таких
    // сторінок 48. Після перестановки: 91,6 КБ замість 149,4.
    const порядок = згадані.map(f => (f.match(/inter-v\d+-(.+)\.woff2/) || [])[1]);

    check("cyrillic-ext оголошений після latin-ext",
        порядок.indexOf("cyrillic-ext") > порядок.indexOf("latin-ext"),
        порядок.join(" → "));

    // РІЧНИЙ КЕШ: АДРЕСА МУСИТЬ МАТИ ?v=
    //
    // Правило Cloudflare вмикає max-age=31536000 за УМОВОЮ «в адресі
    // є v=» (docs/КЕШ.md). Заміряно 03.11.2026 на проді:
    // /assets/css/style.css без запиту — max-age=14400, із «?v=…» —
    // 31536000.
    //
    // Версія в імені файлу цього правила не вмикає, тож без запиту
    // повторний відвідувач перезавантажував би 65 КБ шрифтів кожні
    // чотири години.
    check("адреси шрифтів мають ?v= для річного кешу",
        (блок.match(/url\(\.\.\/fonts\/[^)]*\?v=[^)]*\)/g) || []).length === згадані.length,
        "без запиту правило кешу не спрацює");

    // І ГОЛОВНЕ: PRELOAD І ПРАВИЛО СТИЛІВ — ОДНА Й ТА САМА АДРЕСА.
    //
    // Розійдуться хоч на символ — браузер завантажить шрифт ДВІЧІ:
    // окремо за підказкою, окремо за правилом. Підказка обернулася б
    // витратою замість виграшу, і помітити це можна лише в мережі.
    //
    // Тому обидва місця будує один помічник у fetch-fonts.js.
    const зГолови = [...read("index.html").matchAll(/href="\/assets\/fonts\/([^"]+)"/g)]
        .map(m => m[1]);

    const розбіжні = зГолови.filter(адреса => !блок.includes(`url(../fonts/${адреса})`));

    check(`preload і @font-face збігаються (${зГолови.length})`,
        зГолови.length > 0 && розбіжні.length === 0,
        "розійшлись: " + розбіжні.join(", "));

    // ЗБІРКА НЕ ЗАЛЕЖИТЬ ВІД GOOGLE.
    //
    // fetch-fonts.js ходить у мережу, тож у npm run build йому не
    // місце: їхній збій або зміна умов зупиняли б виливку. Файли
    // лежать у репозиторії, скрипт потрібен лише для оновлення.
    check("fetch-fonts не стоїть у npm run build",
        !/fetch-fonts\.js/.test(JSON.parse(read("package.json")).scripts.build || ""));
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
