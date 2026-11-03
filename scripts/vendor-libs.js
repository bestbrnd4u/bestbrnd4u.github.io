// Кладе чужі бібліотеки до себе, щоб магазин не залежав від CDN.
//
//   node scripts/vendor-libs.js           оновити файли
//   node scripts/vendor-libs.js --check   перевірити, чи все на місці
//
// ЗАПУСКАЄТЬСЯ РУКАМИ, А НЕ В npm run build — з тієї ж причини, що й
// scripts/fetch-fonts.js: збірка не сміє залежати ні від мережі, ні
// від того, чи поставлені devDependencies.
//
// ЧОМУ НЕ З CDN
// --------------
// 1. ВІДТВОРЮВАНІСТЬ. Версія вже закріплена точно — і закріпили її не
//    від добра: колись supabase-js підключався як «@2», CDN віддав
//    свіжішу збірку, у ній змінився склад подій авторизації, і кошик
//    подвоювався на кожному поновленні токена (2^17 = 131072 одиниці
//    одного товару). Див. tests/test-pinned-libs.js.
//
//    Але точна версія в адресі — це обіцянка CDN, а не факт. Заміряно
//    03.11.2026: те, що віддає jsdelivr за @2.112.3, НЕ збігається
//    байт-у-байт із тим, що лежить у npm-пакеті тієї ж версії (207,2
//    проти 206,9 КБ). Тобто артефакт там свій, і ніщо не заважає йому
//    змінитись.
//
//    Саме через це сюди не підходить і SRI: контрольна сума зламалася
//    б від будь-якої їхньої переобробки, і магазин лишився б без
//    клієнта.
//
// 2. ЩЕ ОДИН ДОМЕН НА КРИТИЧНОМУ ШЛЯХУ. Заміряно 03.11.2026, медіана
//    з п'яти холодних з'єднань: cdn.jsdelivr.net — TCP 44 мс, TLS
//    90 мс, перший байт 129 мс. Поки клієнт не приїде, не почнеться
//    ні запит залишків, ні відгуки, ні оформлення.
//
// ЩО З ВАГОЮ. По дроту вона та сама: 53 КБ gzip і там, і там. Виграш
// не в байтах, а в тому, що їх віддає той самий сервер, що й решту
// сайту, і що вони незмінні.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const CHECK = process.argv.includes("--check");

const VENDOR_DIR = path.join(ROOT, "assets", "js", "vendor");

// Версію беремо з package.json — там вона одна на весь проєкт, і саме
// її бачить Dependabot. Другої копії тут не заводимо.
const БІБЛІОТЕКИ = [
    {
        пакет: "@supabase/supabase-js",
        звідки: "dist/umd/supabase.js",
        імʼя: версія => `supabase-js-${версія}.js`,
        // Чим цей тег був раніше й чим він є тепер. За цим крок
        // знаходить його на сторінках і переписує — хоч із CDN, хоч
        // зі старою версією.
        теГ: /<script\s+src="(?:https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js[^"]*|\/assets\/js\/vendor\/supabase-js-[^"]*)"([^>]*)><\/script>/g
    },
    {
        // Запасний шлях замовлення. Коли база недоступна, лист
        // власнику — єдине, що лишається між покупцем і продажем
        // (див. tests/test-order-survives-mail.js), тож залежати від
        // чужого домену йому тим паче не варто.
        пакет: "@emailjs/browser",
        звідки: "dist/email.min.js",
        імʼя: версія => `emailjs-browser-${версія}.js`,
        теГ: /<script\s+src="(?:https:\/\/cdn\.jsdelivr\.net\/npm\/@emailjs\/browser[^"]*|\/assets\/js\/vendor\/emailjs-browser-[^"]*)"([^>]*)><\/script>/g
    }
];

function htmlFiles(dir, out) {

    fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {

        if (["node_modules", ".git", ".claude", ".playwright-mcp", "archive"].includes(e.name)) return;

        const full = path.join(dir, e.name);

        if (e.isDirectory()) htmlFiles(full, out);
        else if (e.name.endsWith(".html")) out.push(full);

    });

    return out;

}

// Переписуємо тег на сторінках.
//
// ЧОМУ ЦЕ ТУТ, А НЕ РУКАМИ. Версія в імені файлу, тож оновлення
// бібліотеки міняє й адресу. Якби сторінки правили окремо, після
// першого ж оновлення вони вказували б на файл, якого вже немає, — і
// магазин лишився б без клієнта Supabase.
//
// Запит ?v= зберігаємо: його ставить apply-cache-version.js, і
// стирати його тут означало б переписувати 173 сторінки щоразу.
function переписатиТеги(файл, тег) {

    const сторінки = htmlFiles(ROOT, []);

    let змінено = 0;

    сторінки.forEach(шлях => {

        const було = fs.readFileSync(шлях, "utf8");

        const стало = було.replace(тег, (весь, решта) => {

            const запит = (весь.match(/\?v=[0-9a-f]+/) || [""])[0];

            return `<script src="/assets/js/vendor/${файл}${запит}"${решта}></script>`;

        });

        if (стало === було) return;

        змінено++;

        if (!CHECK) fs.writeFileSync(шлях, стало, "utf8");

    });

    return змінено;

}

// ВЕРСІЮ БЕРЕМО ВСТАНОВЛЕНУ, А НЕ ОГОЛОШЕНУ.
//
// У package.json стоїть діапазон («^2.112.3»), і це нормально: що
// саме поставлено, вирішує package-lock.json, а оновлення приносить
// Dependabot разом із перевірками.
//
// Але в імені файлу має бути ТА САМА версія, байти якої ми скопіювали
// — інакше адреса обіцяла б одне, а віддавала інше. Тому питаємо сам
// пакет.
function версіяПакета(пакет) {

    const свій = path.join(ROOT, "node_modules", пакет, "package.json");

    if (fs.existsSync(свій)) {
        return JSON.parse(fs.readFileSync(свій, "utf8")).version;
    }

    // Пакет не поставлено — для --check беремо те, що вже лежить у
    // vendor, щоб перевірка працювала й без node_modules.
    const оголошено = (() => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
        return (pkg.devDependencies || {})[пакет] || (pkg.dependencies || {})[пакет];
    })();

    if (!оголошено) throw new Error(`${пакет} не оголошений у package.json`);

    return String(оголошено).replace(/^[^\d]*/, "");

}

function main() {

    if (!fs.existsSync(VENDOR_DIR)) fs.mkdirSync(VENDOR_DIR, { recursive: true });

    const потрібні = new Set();

    let змінено = 0;

    let сторінок = 0;

    БІБЛІОТЕКИ.forEach(({ пакет, звідки, імʼя, теГ }) => {

        const версія = версіяПакета(пакет);

        const файл = імʼя(версія);

        потрібні.add(файл);

        const джерело = path.join(ROOT, "node_modules", пакет, звідки);
        const ціль = path.join(VENDOR_DIR, файл);

        if (!fs.existsSync(джерело)) {

            if (CHECK && fs.existsSync(ціль)) return;   // файл є, пакет не поставлений

            throw new Error(`немає ${path.relative(ROOT, джерело)} —`
                + " виконайте npm install");

        }

        const нове = fs.readFileSync(джерело);

        const різні = !fs.existsSync(ціль) || !fs.readFileSync(ціль).equals(нове);

        if (різні) {

            if (CHECK) {
                console.error(`${файл} розійшовся з пакетом — виконайте node scripts/vendor-libs.js`);
                process.exit(1);
            }

            fs.writeFileSync(ціль, нове);

            змінено++;

            console.log(`   ${пакет}@${версія} → assets/js/vendor/${файл}`
                + ` (${Math.round(нове.length / 1024)} КБ)`);

        }

        const переписано = переписатиТеги(файл, теГ);

        if (переписано && CHECK) {
            console.error(`тег ${пакет} розійшовся на ${переписано} сторінках`
                + " — виконайте node scripts/vendor-libs.js");
            process.exit(1);
        }

        сторінок += переписано;

    });

    // Файли старих версій прибираємо: інакше вони лишаються назавжди
    // й їдуть на Pages ні для кого.
    const зайві = fs.readdirSync(VENDOR_DIR)
        .filter(f => f.endsWith(".js") && !потрібні.has(f));

    if (зайві.length) {

        if (CHECK) {
            console.error(`зайві файли у vendor: ${зайві.join(", ")}`);
            process.exit(1);
        }

        зайві.forEach(f => fs.unlinkSync(path.join(VENDOR_DIR, f)));

    }

    if (CHECK) {
        console.log(`Готово: бібліотеки на місці (${потрібні.size})`);
        return;
    }

    console.log(`Готово: бібліотек ${потрібні.size}`
        + (змінено ? `, оновлено ${змінено}` : ", усі вже були")
        + (сторінок ? `, тег переписано на ${сторінок} сторінках` : "")
        + (зайві.length ? `, прибрано старих ${зайві.length}` : ""));

}

module.exports = { БІБЛІОТЕКИ, версіяПакета };

if (require.main === module) {
    try { main(); }
    catch (error) { console.error(error.message); process.exit(1); }
}
