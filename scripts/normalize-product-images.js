// Приводить фото товарів до єдиних пропорцій 4:5 і генерує три ширини
// кожного знімка.
//
// НАВІЩО
// -------
// Картка каталогу і галерея товару — контейнери 4:5. Якщо фото має інші
// пропорції, контейнер його ріже: широкий знімок окулярів 800×286
// втрачав майже половину кадру, квадратний 900×900 — верх і низ.
// Колись фото привели до спільного холста разово, руками, і в тестах
// лишилась перевірка «усі базові .webp мають співвідношення 0.8».
//
// Але фото, завантажені пізніше через адмінку, повз ту нормалізацію
// проходили. На момент написання скрипта таких набралось 18 зі 121 —
// пропорції розповзлись від 0.667 до 1.481, і тест червонів місяцями.
// Причина не в тесті: він ловив справжню проблему, просто полагодити
// її одноразово недостатньо — потрібен крок у збірці.
//
// ЩО САМЕ РОБИТЬСЯ
// -----------------
// Фото ВПИСУЄТЬСЯ (fit: contain) у холст 1200×1500 — рівно такий, як у
// вже нормалізованих 103 знімків. Саме вписується, а не обрізається:
// обрізка знищила б частину товару безповоротно, а порожні поля з боків
// у картці не видно, бо фон холста збігається з фоном картки.
//
// Далі з кожного базового фото робляться дві зменшені копії — -600
// (картка на retina) і -300 (мініатюри, мобільна сітка), — і ім'я
// базового файлу дописується в data/image-variants.json. Фронт
// підставляє srcset тільки для тих фото, які є в цьому переліку
// (див. buildSrcSet у assets/js/ui.js), тож без цього кроку браузер
// тягнув би повнорозмірний знімок навіть у мобільну сітку.
//
// ЗАПУСК
//   node scripts/normalize-product-images.js          звіт
//   node scripts/normalize-product-images.js --apply  переробити

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
// ТІЛЬКИ фото товарів. Банери сюди навмисно не входять: у них своя,
// широка геометрія, і приведення до 4:5 їх нищить. Так уже сталось —
// банер 1635×1104 після першого прогону цього скрипта перетворився на
// 1200×1500 з великими білими полями зверху й знизу. Тому банери
// живуть в assets/images/banners/ (див. tests/test-image-canvas.js).
const DIR = path.join(ROOT, "assets/images/products/uploads");
const BANNERS_DIR = path.join(ROOT, "assets/images/banners");
const VARIANTS_FILE = path.join(ROOT, "data/image-variants.json");

// холст і ширини — такі самі, як у першої, ручної нормалізації,
// щоб уже оброблені фото лишились байт у байт
const CANVAS = { width: 1200, height: 1500 };
const TARGET_RATIO = 0.8;
const VARIANT_WIDTHS = [600, 300];

// поля добираються білим — під фон картки товару в каталозі
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

const VARIANT_RE = /-(300|600|1200)\.webp$/;

function baseWebpFiles() {

    return fs.readdirSync(DIR)
        .filter(f => f.endsWith(".webp") && !VARIANT_RE.test(f))
        .sort();

}

async function inspect(file) {

    const meta = await sharp(path.join(DIR, file)).metadata();

    return { file, width: meta.width, height: meta.height, ratio: +(meta.width / meta.height).toFixed(3) };

}

async function findOffCanvas() {

    const results = await Promise.all(baseWebpFiles().map(inspect));

    return results.filter(info => info.ratio !== TARGET_RATIO);

}

async function normalize(file) {

    const full = path.join(DIR, file);

    // sharp не пише в той самий файл, з якого читає — тримаємо в пам'яті
    const source = fs.readFileSync(full);

    const canvas = await sharp(source)
        .resize({ ...CANVAS, fit: "contain", background: BACKGROUND })
        .webp({ quality: 90 })
        .toBuffer();

    fs.writeFileSync(full, canvas);

    const stem = file.slice(0, -".webp".length);

    for (const width of VARIANT_WIDTHS) {

        const variant = await sharp(canvas)
            .resize({ width })
            .webp({ quality: 82 })
            .toBuffer();

        fs.writeFileSync(path.join(DIR, `${stem}-${width}.webp`), variant);

    }

}

// Добудувати зменшені копії для фото, яке переробляти не треба.
//
// НАВІЩО ОКРЕМО ВІД normalize()
// ------------------------------
// Копії 600/300 робилися ЛИШЕ всередині normalize(), тобто тільки для
// знімків, які скрипт сам переводив у 4:5. Фото, що прийшло вже в
// потрібній пропорції, копій не отримувало ніколи й не потрапляло в
// image-variants.json — а верстка все одно просить у нього srcset.
// Браузер на мобільному тягнув повний розмір, а тест цілісності
// (test-image-canvas) падав на «копії 600/300 існують для всіх».
//
// Саме так і вийшло після завантаження кросівок Lacoste: частина
// знімків приїхала з адмінки вже 1200×1500.
async function buildMissingVariants(file) {

    const full = path.join(DIR, file);
    const stem = file.slice(0, -".webp".length);

    const source = fs.readFileSync(full);

    // Копію перезбираємо, якщо її НЕМАЄ або якщо вона застаріла.
    //
    // ЩО БУЛО НЕ ТАК
    // ---------------
    // Тут перевірялась тільки наявність файлу. Замінили фото товару в
    // адмінці під тим самим імʼям — база оновилась, а -300 і -600
    // лишились від попереднього знімка. Далі найгірше: каталог бере
    // саме зменшені копії через srcset, тож у картці й далі висіло
    // СТАРЕ фото, хоча на сторінці товару вже було нове. Ззовні це
    // виглядало як «кеш не скидається», а насправді файли справді
    // різні.
    //
    // Порівнюємо за часом зміни: копія, старша за базу, зроблена не з
    // неї. Це дешевше за порівняння вмісту й для цієї задачі досить —
    // збірка перезаписує базу лише коли та справді змінилась.
    const baseTime = fs.statSync(full).mtimeMs;

    const missing = VARIANT_WIDTHS.filter(width => {

        const variant = path.join(DIR, `${stem}-${width}.webp`);

        if (!fs.existsSync(variant)) return true;

        return fs.statSync(variant).mtimeMs < baseTime - 1000;

    });

    if (!missing.length) return false;

    for (const width of missing) {

        const variant = await sharp(source)
            .resize({ width })
            .webp({ quality: 82 })
            .toBuffer();

        fs.writeFileSync(path.join(DIR, `${stem}-${width}.webp`), variant);

    }

    return true;

}

function registerVariants(files) {

    let list = [];

    try {
        const parsed = JSON.parse(fs.readFileSync(VARIANTS_FILE, "utf8"));
        if (Array.isArray(parsed)) list = parsed;
    } catch (error) {
        console.error(`Не вдалося прочитати ${path.relative(ROOT, VARIANTS_FILE)}: ${error.message}`);
    }

    // Прибираємо записи, для яких файлу вже немає.
    //
    // ЧОМУ ЦЕ ПОТРІБНО
    // -----------------
    // Раніше реєстр лише ДОПОВНЮВАВСЯ: [...list, ...files]. Видалили
    // фото — запис лишався назавжди. Наслідок не косметичний:
    //
    //   • верстка бачить запис і просить srcset для файлу, якого нема;
    //   • перевірка цілісності падає на «фото є в реєстрі, а на диску
    //     немає» — і щоб її пройти, доводиться чистити руками;
    //   • у git-історії щоразу зʼявляється рядок «+ ...webp», і
    //     здається, ніби збірка живе своїм життям.
    //
    // Реєстр — це опис того, що є НА ДИСКУ. Значить він мусить і
    // втрачати записи, а не тільки набирати.
    const exists = new Set(fs.readdirSync(DIR));

    const merged = [...new Set([...list, ...files])]
        .filter(name => exists.has(name))
        .sort();

    fs.writeFileSync(VARIANTS_FILE, JSON.stringify(merged, null, 2) + "\n", "utf8");

    const dropped = list.filter(name => !exists.has(name));

    if (dropped.length) {
        console.log(`   з реєстру прибрано записів без файлу: ${dropped.length}`);
    }

    return merged.length - list.length;

}

async function main() {

    const apply = process.argv.includes("--apply");

    if (!fs.existsSync(DIR)) {
        console.error(`Не знайдено теку ${path.relative(ROOT, DIR)}`);
        process.exit(1);
    }

    const off = await findOffCanvas();

    // Копії добудовуємо ЗАВЖДИ, а не лише для перероблених знімків:
    // фото могло приїхати з адмінки вже в потрібній пропорції.
    const patched = [];

    if (apply) {

        for (const file of baseWebpFiles()) {
            const built = await buildMissingVariants(file);

            // Реєструємо фото, навіть якщо копії вже були.
            //
            // Раніше сюди потрапляли лише ті, кому копії ЩОЙНО зробили.
            // Фото, яке прийшло вже у форматі 4:5 і з готовими копіями,
            // не реєструвалось узагалі — і верстка не знала, що для
            // нього є srcset. На нових товарах це давало шість
            // незареєстрованих знімків.
            const hasCopies = VARIANT_WIDTHS.every(width =>
                fs.existsSync(path.join(DIR, file.replace(/\.webp$/, `-${width}.webp`))));

            if (built || hasCopies) patched.push(file);
        }

        if (patched.length) {

            const addedNow = registerVariants(patched);

            console.log(`Добудовано копії 600/300: ${patched.length} фото`
                + (addedNow ? `, у image-variants.json додано ${addedNow}` : ""));

        }

    }

    if (off.length === 0) {

        console.log(`Готово: усі ${baseWebpFiles().length} базових фото вже 4:5`);

        return;

    }

    console.log(`Не в пропорціях 4:5: ${off.length} фото\n`);

    off.forEach(info => console.log(`  ${info.width}×${info.height} (${info.ratio})  ${info.file}`));

    if (!apply) {
        console.log("\nЦе лише звіт. Щоб переробити — додайте --apply");
        return;
    }

    console.log("");

    for (const info of off) {
        await normalize(info.file);
        console.log(`  → 1200×1500 + копії 600/300: ${info.file}`);
    }

    const added = registerVariants(off.map(info => info.file));

    console.log(`\nГотово: нормалізовано ${off.length}, у image-variants.json додано ${added}`);

}

module.exports = { baseWebpFiles, findOffCanvas, TARGET_RATIO, CANVAS, VARIANT_WIDTHS };

if (require.main === module) {
    main().catch(error => { console.error(error); process.exit(1); });
}
