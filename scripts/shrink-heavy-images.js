// Фотографії, збережені як PNG, і що це коштує відвідувачу.
//
// ЩО БУЛО ЗМІРЯНО
// ----------------
// Головна сторінка, performance.getEntriesByType("resource"),
// 19 картинок разом на 13,7 МБ. З них шість файлів:
//
//   mob009.png                 2468 КБ  1122×1402  банер SUMMER SALE
//   4a5d4b88….png              2296 КБ  1381×1139  плитка «Жінкам»
//   bea2c056….png              2257 КБ  1381×1139  плитка «Чоловікам»
//   5cdd14ae….png              2012 КБ  1381×1139  плитка «Унісекс»
//   188c0bdd….png              1888 КБ
//   1am.png                    1450 КБ
//
// Поруч фотографії товарів важать 22–27 КБ. Різниця не в розмірі
// кадру — він тут якраз помірний, 1100–2200 px, — а у ФОРМАТІ.
// PNG стискає без утрат: для скриншота чи логотипа це правильно, для
// знімка з піском, тінями й градієнтами — ні. Той самий кадр у webp
// важить у 10–20 разів менше, і на око відрізнити неможливо.
//
// ЧОМУ ЦЕ ДОЖИЛО ДО СЬОГОДНІ
// ---------------------------
// Конвеєр фотографій товару (normalize-product-images.js) бере ЛИШЕ
// .webp — інші формати він просто не бачить. Тобто все, що власник
// завантажив через адмінку як PNG, лишалось таким, як було. У теці
// uploads таких файлів 13 на 26,7 МБ.
//
// ЩО РОБИТЬ ЦЕЙ СКРИПТ
// ---------------------
// Знаходить важкі PNG і JPEG, кладе поруч webp того ж розміру й
// переписує посилання. Розмір кадру не чіпає: зменшувати ширину —
// це вже рішення про вигляд, а переупакувати той самий кадр — ні.
//
// ОРИГІНАЛ ЛИШАЄТЬСЯ НА ДИСКУ. Він більше нікуди не веде, тож
// відвідувач його не качає, але й не зникає: якщо колись знадобиться
// вихідний файл, він тут. Прибрати такі осиротілі файли вміє
// npm run images:archive.
//
// ЗАПУСК
// -------
//   node scripts/shrink-heavy-images.js           — лише показати
//   node scripts/shrink-heavy-images.js --apply   — зробити
//
// У CI викликається з npm run build:media (build-dev.yml), тобто
// новий важкий PNG з адмінки полегшується сам, без нагадувань.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const { collectTextFiles } = require("./normalize-media-names");

const ROOT = path.join(__dirname, "..");

// Де шукаємо. Теки з оригіналами й архівом навмисно не чіпаємо: там
// лежить те, до чого повертаються, і його вага нікого не стосується —
// у сайт воно не потрапляє.
const DIRS = ["assets/images"];

// products/uploads ОБХОДИМО, і це не обережність заради обережності.
//
// whiten-backgrounds.js бере з цієї теки КОЖЕН .webp (крім зменшених
// копій) і вибілює йому тло. Для фотографії товару на світлому фоні
// це і є його робота. Але в тій же теці лежать банери й плитки
// розділів — вони потрапили туди просто тому, що адмінка складає
// все завантажене в одне місце.
//
// Доки банер лишається PNG, вибілювач його не бачить: він дивиться
// лише на .webp. Варто нам його переупакувати — і наступний
// npm run build:media візьметься заливати білим небо чи пісок на
// знімку з моделлю. Помилка була б дуже помітною і дуже дивною.
//
// Тому важкі PNG у products/uploads лишаються як є. Правильний вихід
// для них інший: або перенести банери з теки товарів, або навчити
// вибілювач брати тільки ті файли, на які посилається хоч один
// товар. Обидва — окрема робота, і робити її мимохідь не варто.
const SKIP_DIRS = ["_originals", "_archive", "uploads"];

// Поріг. Нижче цього переупаковка дає одиниці кілобайтів, а зайвий
// файл у теці й зайвий рядок у git — щоразу.
const MIN_BYTES = 300 * 1024;

// Якість. 88, а не 82: це банери на пів екрана, і саме на них
// помітні смуги в градієнтах. Різниця у вазі між 82 і 88 — близько
// 40%, але 2468 КБ → 247 КБ проти 173 КБ однаково лишається
// десятикратним виграшем, а сумніви щодо вигляду зникають.
const QUALITY = 88;

// PNG із прозорістю може бути логотипом чи іконкою, де «фотографічна»
// логіка не діє. Webp прозорість тримає, тож переводимо і їх, але
// без утрат — інакше на різкій межі логотипа з'явиться бахрома.
const LOSSLESS_IF_ALPHA = true;

// НАСКІЛЬКИ МАЄ ПОЛЕГШАТИ, ЩОБ МІНЯТИ.
//
// Перший же прогін у режимі показу спіймав себе самого: частина
// файлів ставала БІЛЬШОЮ.
//
//   pexels-christian-heitz-842711.jpg  1893 КБ → 3288 КБ
//   pexels-pixabay-33045.jpg           1278 КБ → 1635 КБ
//   pexels-lalesh-aldarwish-168938.jpg 1202 КБ → 1328 КБ
//
// Це JPEG, тобто вже стиснуті з утратами. Перекодувати їх у webp з
// високою якістю означає чесно зберегти всі артефакти попереднього
// стиснення — а на це потрібно більше місця, ніж на сам кадр.
// Виграш дає саме PNG, де стиснення було без утрат.
//
// Тому правило не «формат», а «результат»: лишаємо тільки те, що
// справді полегшало хоча б на чверть.
const MIN_GAIN = 0.25;

function walk(dir, onFile) {

    if (!fs.existsSync(dir)) return;

    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {

            if (SKIP_DIRS.includes(entry.name)) return;

            walk(full, onFile);

            return;

        }

        onFile(full);

    });

}

// На що взагалі хтось посилається.
//
// НАВІЩО ЦЕ ТУТ. У теках лежить чимало осиротілих файлів — залишки
// старих банерів і перезаливок. Переупаковувати їх немає сенсу:
// відвідувач їх не качає, бо вони нікуди не підключені, а в репозиторії
// від цього стало б удвічі більше файлів. Прибирати сиріт уміє
// окремий npm run images:archive, і це його робота, не наша.
function referencedNames() {

    const names = new Set();

    const texts = collectTextFiles().map(file => fs.readFileSync(file, "utf8"));

    const haystack = texts.join("\n");

    return {
        has: name => haystack.includes(name),
        names
    };

}

function heavyImages() {

    const found = [];

    DIRS.forEach(rel => walk(path.join(ROOT, rel), full => {

        if (!/\.(png|jpe?g)$/i.test(full)) return;

        const size = fs.statSync(full).size;

        if (size < MIN_BYTES) return;

        found.push({ full, size });

    }));

    return found.sort((a, b) => b.size - a.size);

}

async function convert(file, apply) {

    const target = file.full.replace(/\.(png|jpe?g)$/i, ".webp");

    const meta = await sharp(file.full).metadata();

    // Уже є webp із таким іменем — не чіпаємо нічого. Це може бути
    // і результат минулого запуску, і окремий файл, який просто так
    // назвали: переписати чужий webp гірше, ніж лишити важкий PNG.
    if (fs.existsSync(target)) {

        return { skipped: "поруч уже є webp", target };

    }

    const options = (LOSSLESS_IF_ALPHA && meta.hasAlpha)
        ? { lossless: true }
        : { quality: QUALITY };

    if (!apply) {

        const probe = await sharp(file.full).webp(options).toBuffer();

        return { after: probe.length, target, alpha: Boolean(meta.hasAlpha) };

    }

    await sharp(file.full).webp(options).toFile(target);

    return { after: fs.statSync(target).size, target, alpha: Boolean(meta.hasAlpha) };

}

async function main() {

    const apply = process.argv.includes("--apply");

    const files = heavyImages();

    if (!files.length) {

        console.log("Готово: важких PNG і JPEG немає");

        return;

    }

    const refs = referencedNames();

    const nameMap = new Map();

    let before = 0;
    let after = 0;
    let orphans = 0;
    let noGain = 0;

    for (const file of files) {

        const name = path.basename(file.full);

        if (!refs.has(name)) {

            orphans++;

            continue;

        }

        const result = await convert(file, apply);

        if (result.skipped) {

            console.log(`  ${name}: ${result.skipped}`);

            continue;

        }

        // Полегшало замало (або взагалі поважчало) — лишаємо як є.
        if (result.after > file.size * (1 - MIN_GAIN)) {

            noGain++;

            if (apply && fs.existsSync(result.target)) fs.unlinkSync(result.target);

            console.log(`  ${name}: без виграшу`
                + ` (${Math.round(file.size / 1024)} → ${Math.round(result.after / 1024)} КБ)`);

            continue;

        }

        before += file.size;
        after += result.after;

        // Ключ — ШЛЯХ, а не саме ім'я файлу.
        //
        // Перейменування довгих імен може дозволити собі basename: там
        // імена — довгі хеші, випадково збігтись їм ніде. Тут інакше:
        // серед банерів лежить файл «2.png», і заміна по імені
        // потрапила б у будь-яке «photo2.png» чи «img-12.png». Сьогодні
        // таких сусідів немає, але скрипт крутиться в CI на кожному
        // завантаженні з адмінки — тобто рано чи пізно з'являться.
        nameMap.set(
            path.relative(ROOT, file.full).split(path.sep).join("/"),
            path.relative(ROOT, result.target).split(path.sep).join("/")
        );

        console.log(`  ${Math.round(file.size / 1024)} КБ → ${Math.round(result.after / 1024)} КБ`
            + `  ${name}${result.alpha ? " (з прозорістю, без утрат)" : ""}`);

    }

    if (orphans) console.log(`  (пропущено ${orphans} — на них ніхто не посилається)`);
    if (noGain) console.log(`  (пропущено ${noGain} — переупаковка не дає виграшу)`);

    if (!nameMap.size) {

        console.log("Готово: нічого переупаковувати");

        return;

    }

    console.log(`Разом: ${Math.round(before / 1024)} КБ → ${Math.round(after / 1024)} КБ`);

    if (!apply) {

        console.log("Це був показ. Щоб зробити: node scripts/shrink-heavy-images.js --apply");

        return;

    }

    // Посилання правимо тим самим переліком файлів, що й
    // перейменування довгих імен, — щоб один зі скриптів колись не
    // забув теку й частина фото не відвалилась мовчки.
    let touched = 0;

    collectTextFiles().forEach(file => {

        const text = fs.readFileSync(file, "utf8");

        let next = text;

        nameMap.forEach((to, from) => {
            if (next.includes(from)) next = next.split(from).join(to);
        });

        if (next !== text) {

            fs.writeFileSync(file, next, "utf8");

            touched++;

        }

    });

    console.log(`Готово: переупаковано ${nameMap.size} файлів, посилання оновлено в ${touched}`);

}

module.exports = { heavyImages, MIN_BYTES, QUALITY };

if (require.main === module) {

    main().catch(error => {
        console.error("::error::Не вдалося переупакувати картинки:", error.message);
        process.exit(1);
    });

}
