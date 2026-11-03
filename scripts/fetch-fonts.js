// Забирає Inter у себе: файли шрифту в assets/fonts, правила
// @font-face — у assets/css/style.css.
//
// ЗАПУСКАЄТЬСЯ РУКАМИ, А НЕ В npm run build.
//
// Збірка не сміє залежати від доступності Google: інакше їхній збій
// або зміна умов зупиняє виливку. Файли лежать у репозиторії, а цей
// скрипт потрібен лише тоді, коли треба оновити версію шрифту.
//
//   node scripts/fetch-fonts.js           оновити файли й правила
//   node scripts/fetch-fonts.js --check   лише перевірити, чи все на місці
//
// ЧОМУ ВАРІАТИВНИЙ, А НЕ ШІСТЬ НАКРЕСЛЕНЬ
// ----------------------------------------
// Заміряно 03.11.2026. Google на запит «wght@400;500;600;700;800;900»
// віддає 42 окремих файли (6 накреслень × 7 підмножин), разом 1280 КБ;
// лише latin+cyrillic — 393 КБ. На запит «wght@100..900» — 7 файлів,
// 213 КБ; latin+cyrillic — 65 КБ.
//
// Тобто варіативний виграє і в репозиторії, і в покупця: одна
// підмножина — один файл на всі шість накреслень, які вживає сайт.
//
// ЧОМУ ВСІ СІМ ПІДМНОЖИН, А НЕ ДВІ ПОТРІБНІ
// ------------------------------------------
// Браузер бере файл лише тоді, коли на сторінці є символ із його
// unicode-range. Тож зайві підмножини в репозиторії нічого не
// коштують покупцеві — і роблять заміну ТОТОЖНОЮ тому, що віддавав
// Google.
//
// Спокуса обрізати шрифт рівно під наявні символи сильна (вийшло б
// ~65 КБ одним файлом), але це пастка: новий товар із діакритикою в
// назві тихо втратив би гліф, і помітили б це нескоро.
//
// Заміряно 03.11.2026: поза latin+cyrillic на сайті лише емодзі,
// яких в Inter немає взагалі, і ₴ (843 рази, у видимому підзаголовку
// каталогу на 48 сторінках) — вона живе саме в latin-ext.

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");

const FONTS_DIR = path.join(ROOT, "assets", "fonts");
const STYLE_FILE = path.join(ROOT, "assets", "css", "style.css");

const CHECK = process.argv.includes("--check");

// Ваги сайту лежать у sync-fonts.js — там же, де й посилання. Тут
// потрібен лише діапазон, бо файл один на всі ваги.
const CSS_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap";

// Сучасний браузер — інакше Google віддасть ttf замість woff2.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    + " (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const МІТКА = "Inter — свої файли";

function взяти(url) {

    return new Promise((resolve, reject) => {

        https.get(url, { headers: { "user-agent": UA } }, res => {

            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return взяти(res.headers.location).then(resolve, reject);
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`${url} → HTTP ${res.statusCode}`));
            }

            const куски = [];
            res.on("data", c => куски.push(c));
            res.on("end", () => resolve(Buffer.concat(куски)));

        }).on("error", reject);

    });

}

// Розбір css2. Google пише назву підмножини коментарем ПЕРЕД правилом,
// тож ріжемо по «/*» і беремо пару «назва → правило».
function розібрати(css) {

    const out = [];

    css.split("/*").forEach(кусок => {

        const назва = (кусок.match(/^\s*([a-z-]+)\s*\*\//) || [])[1];

        if (!назва) return;

        const тіло = кусок.slice(кусок.indexOf("*/") + 2);
        const правило = (тіло.match(/@font-face\s*\{([\s\S]*?)\}/) || [])[1];

        if (!правило) return;

        out.push({
            підмножина: назва,
            url: (правило.match(/url\(([^)]+)\)/) || [])[1],
            range: (правило.match(/unicode-range:\s*([^;]+);/) || [])[1],
            ваги: (правило.match(/font-weight:\s*([^;]+);/) || [])[1],
            стиль: (правило.match(/font-style:\s*([^;]+);/) || [])[1]
        });

    });

    return out;

}

// «…/s/inter/v20/abc.woff2» → «v20»
function версія(url) {
    return (url.match(/\/s\/inter\/(v\d+)\//) || [])[1] || "v0";
}

function імʼяФайлу(правило) {
    return `inter-${версія(правило.url)}-${правило.підмножина}.woff2`;
}

// Блок @font-face для style.css.
function блок(правила) {

    const рядки = [
        `/* ${МІТКА}, а не Google Fonts.`,
        " *",
        " * Доти шрифт тягнувся з fonts.googleapis.com: спершу таблиця",
        " * стилів (вона блокує показ), і лише після неї — самі файли з",
        " * fonts.gstatic.com. Заміряно 03.11.2026, медіана з п'яти",
        " * холодних з'єднань: до першого байта CSS 107 мс, далі ще 100 мс",
        " * до файлу шрифту, і все це з двох чужих доменів.",
        " *",
        " * Тепер файли лежать поруч із сайтом і їдуть тим самим",
        " * з'єднанням, що й решта. Підмножини й unicode-range —",
        " * ТОЧНО ті, що віддавав Google, тож браузер бере рівно стільки",
        " * файлів, скільки брав: по одному на абетку, яка є на сторінці.",
        " *",
        " * Розкладає scripts/fetch-fonts.js — правити руками не треба.",
        " */"
    ];

    // ПОРЯДОК ПРАВИЛ ВИРІШУЄ, ЯКИЙ ФАЙЛ ПІДЕ ПО ₴.
    //
    // Символ гривні (U+20B4) лежить у ДВОХ підмножинах Google:
    // явно в cyrillic-ext і всередині діапазону U+20AD-20C4 в
    // latin-ext. Коли діапазони перекриваються, браузер бере те
    // правило, що НИЖЧЕ.
    //
    // У порядку Google нижче стоїть latin-ext — і сторінка з ₴ тягне
    // 83 КБ замість 26. Заміряно 03.11.2026 на /aktsii/: латиниця
    // 47 КБ і кирилиця 19 КБ прилітають за preload на 27 мс, а слідом
    // на 117 мс починається latin-ext на 83 КБ — виключно заради
    // одного гліфа в підзаголовку «Ціни від 6 500 ₴ до 13 000 ₴».
    //
    // Таких сторінок 48. Тому cyrillic-ext переставляємо в кінець:
    // решта символів лежить рівно в одній підмножині, тож порядок на
    // них не впливає взагалі.
    const впорядковані = [
        ...правила.filter(п => п.підмножина !== "cyrillic-ext"),
        ...правила.filter(п => п.підмножина === "cyrillic-ext")
    ];

    впорядковані.forEach(п => {
        рядки.push(
            "@font-face{font-family:'Inter';font-style:" + (п.стиль || "normal").trim()
            + ";font-weight:" + (п.ваги || "100 900").trim()
            + ";font-display:swap;src:url(../fonts/" + імʼяФайлу(п)
            + ") format('woff2');unicode-range:" + (п.range || "").trim() + "}"
        );
    });

    return рядки.join("\n");

}

const БЛОК_RE = new RegExp(`\\/\\* ${МІТКА}[\\s\\S]*?\\*\\/\\n(?:@font-face\\{[^}]*\\}\\n?)+`, "");

async function main() {

    const css = (await взяти(CSS_URL)).toString();

    const правила = розібрати(css);

    if (!правила.length) throw new Error("у відповіді Google немає жодного @font-face");

    if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });

    let завантажено = 0, байтів = 0;

    for (const п of правила) {

        const файл = path.join(FONTS_DIR, імʼяФайлу(п));

        if (fs.existsSync(файл)) { байтів += fs.statSync(файл).size; continue; }

        if (CHECK) {
            console.error(`Немає файлу шрифту: ${path.relative(ROOT, файл)}`);
            process.exit(1);
        }

        const дані = await взяти(п.url);

        fs.writeFileSync(файл, дані);

        завантажено++;
        байтів += дані.length;

    }

    // Прибираємо файли старих версій: інакше вони лишаються в
    // репозиторії назавжди й їдуть на Pages ні для кого.
    const потрібні = new Set(правила.map(імʼяФайлу));

    const зайві = fs.readdirSync(FONTS_DIR)
        .filter(f => f.endsWith(".woff2") && !потрібні.has(f));

    if (зайві.length && !CHECK) зайві.forEach(f => fs.unlinkSync(path.join(FONTS_DIR, f)));

    const style = fs.readFileSync(STYLE_FILE, "utf8");

    const новий = БЛОК_RE.test(style)
        ? style.replace(БЛОК_RE, блок(правила) + "\n")
        : блок(правила) + "\n\n" + style;

    if (CHECK) {

        if (новий !== style) {
            console.error("Правила @font-face у style.css застаріли — запустіть node scripts/fetch-fonts.js");
            process.exit(1);
        }

        console.log(`Готово: шрифт на місці — ${правила.length} підмножин,`
            + ` ${Math.round(байтів / 1024)} КБ`);

        return;

    }

    fs.writeFileSync(STYLE_FILE, новий, "utf8");

    console.log(`Готово: ${правила.length} підмножин Inter ${версія(правила[0].url)},`
        + ` ${Math.round(байтів / 1024)} КБ`
        + (завантажено ? `, завантажено нових: ${завантажено}` : ", усі файли вже були")
        + (зайві.length ? `, прибрано старих: ${зайві.length}` : ""));

}

module.exports = { розібрати, блок, імʼяФайлу, версія, БЛОК_RE, МІТКА };

if (require.main === module) {
    main().catch(error => { console.error(error.message); process.exit(1); });
}
