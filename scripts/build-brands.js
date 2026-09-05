// Збирає data/brands/*.json (окремі файли брендів, якими керує
// адмінка) в один data/brands.json, який вантажить каталог.
//
// НАВІЩО ЦЕ ВЗАГАЛІ
// ------------------
// Бренд у товарі — це просто рядок («Marc Jacobs»). Його досить, щоб
// зібрати фільтр і посилання «усі товари бренду», але не досить, щоб
// показати логотип на сторінці товару й розповісти про бренд угорі
// каталогу. Ці три речі — логотип, банер, опис — і живуть тут.
//
// ЗАПИС НЕОБОВʼЯЗКОВИЙ
// ---------------------
// Товар із брендом працює й без нього: буде текстова назва замість
// логотипа й каталог без вступного блоку. Тобто це доповнення до
// наявних 20 брендів, а не умова їхньої роботи.
//
// ЗВʼЯЗОК — ЗА НАЗВОЮ
// --------------------
// Ключем служить сама назва бренду, бо іншого спільного поля між
// товаром і брендом немає. Тому збірка попереджає, якщо назва не
// збіглася з жодним товаром: мовчазне «нічого не показується» —
// найгірший спосіб про це дізнатись.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// не даємо файлам зі зламаним ім'ям потрапити в зібраний JSON
// (див. коментар у scripts/slug-safety.js)
const { filterSafeEntryFiles } = require("./slug-safety");
const { toSlug } = require("./translit");

// Корінь, з яким працюємо. Прапорець --root= ставить лише тест: без
// нього він або писав би у справжні data/brands, або перевіряв би
// самий лише текст скрипта — тобто не перевіряв нічого.
function rootDir() {

    const flag = process.argv.find(arg => arg.startsWith("--root="));

    return flag ? path.resolve(flag.slice("--root=".length)) : path.join(__dirname, "..");

}

const ROOT = rootDir();
const BRANDS_DIR = path.join(ROOT, "data", "brands");
const PRODUCTS_DIR = path.join(ROOT, "data", "products");
const OUTPUT_FILE = path.join(ROOT, "data", "brands.json");

// Назви брендів у товарах бувають із зайвими пробілами («Invicta ») —
// це видно в даних. Порівнюємо без них і без різниці регістру, а
// показуємо те, що написав власник.
function key(name) {
    return String(name || "").trim().toLowerCase();
}

// Рахуємо по ДЖЕРЕЛАХ (data/products/*.json), а не по зібраному
// products.json. Дві причини: цей крок іде ДО збірки товарів (вона
// бере звідси логотипи), і джерела не залежать від того, чи встиг
// хтось перезібрати агрегат.
function productBrands() {

    const counts = new Map();

    if (!fs.existsSync(PRODUCTS_DIR)) return counts;

    fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith(".json")).forEach(file => {

        let data;

        try {
            data = JSON.parse(fs.readFileSync(path.join(PRODUCTS_DIR, file), "utf8"));
        } catch (error) {
            return;
        }

        const k = key(data.brand);

        if (!k) return;

        counts.set(k, (counts.get(k) || 0) + 1);

    });

    return counts;

}

// Версія в адресі картинки: logo.png?v=a1b2c3d4
//
// Логотип і банер живуть за постійною адресою, і замінити їх в адмінці
// означає покласти новий файл під тим самим імʼям. Без версії браузер
// (і Cloudflare) ще довго віддавав би старий — той самий механізм і з
// тієї ж причини, що у фото товарів (див. stampImageVersions у
// scripts/build-products.js). Саме імʼя файлу не змінюється, тож
// зникнути картинка не може: найгірше — приїде з кеша.
function stamp(src) {

    const clean = String(src || "").split("?")[0];

    if (!clean) return "";

    const file = path.join(ROOT, clean.replace(/^\//, ""));

    if (!fs.existsSync(file)) return clean;

    const version = crypto.createHash("sha1")
        .update(fs.readFileSync(file))
        .digest("hex")
        .slice(0, 8);

    return `${clean}?v=${version}`;

}

function main() {

    const brands = [];

    // Теки може не бути зовсім: бренди — річ необовʼязкова, і поки
    // жодного не завели, це нормальний стан, а не помилка.
    if (fs.existsSync(BRANDS_DIR)) {

        const files = filterSafeEntryFiles(
            fs.readdirSync(BRANDS_DIR).filter(f => f.endsWith(".json")),
            "data/brands"
        ).safe;

        const counts = productBrands();

        files.forEach(file => {

            let data;

            try {
                data = JSON.parse(fs.readFileSync(path.join(BRANDS_DIR, file), "utf8"));
            } catch (error) {
                console.log(`⚠  ${file}: не читається як JSON — пропущено`);
                return;
            }

            const name = String(data.name || "").trim();

            if (!name) {
                console.log(`⏭  ${file}: не заповнена назва бренду — пропущено`);
                return;
            }

            const found = counts.get(key(name)) || 0;

            if (!found) {

                console.log(`⚠  «${name}» (${file}): жодного товару з таким брендом. `
                    + "Перевірте написання — воно має збігатися з полем «Бренд» у товарі.");

            }

            brands.push({
                name,
                // slug потрібен адресі каталогу бренду: кирилиця в
                // ?brand= перетворюється на нечитабельний відсотковий
                // код, а посилання з нього люди копіюють у пости.
                slug: toSlug(name),
                logo: stamp(data.logo),
                banner: stamp(data.banner),
                title: data.title || "",
                description: data.description || "",
                products: found
            });

        });

    }

    brands.sort((a, b) => a.name.localeCompare(b.name, "uk"));

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(brands, null, 2) + "\n", "utf8");

    console.log(`Готово: ${brands.length} брендів → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

if (require.main === module) main();

module.exports = { key };
