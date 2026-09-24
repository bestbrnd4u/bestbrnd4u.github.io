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

// Спільний перелік файлів, де можуть стояти посилання на медіа.
// Той самий, яким користуються shrink-heavy-images.js і
// normalize-media-names.js: один перелік на всіх означає, що
// нову теку не забуде ніхто з трьох.
const { collectTextFiles } = require("./normalize-media-names");

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

// Формати зменшених копій. Порядок важливий лише для читабельності
// логу; верстка обирає формат сама (див. applyImageVariants у ui.js).
const VARIANT_FORMATS = ["webp", "avif"];

// Якість AVIF.
//
// 55 у AVIF візуально відповідає 82 у WebP — формат стискає інакше, і
// однакові числа означали б різну картинку. Заміряно на 24 файлах
// каталогу: 399 КБ webp → 256 КБ avif, тобто на 36% менше при тій
// самій деталізації.
//
// effort:4 — компроміс зі часом збірки: 300 мс на файл. Вище (6-9)
// дає ще 3-5% розміру, але вчетверо довше, а конвертувати доводиться
// лише нові фото.
const AVIF_QUALITY = 55;
const AVIF_EFFORT = 4;

// поля добираються білим — під фон картки товару в каталозі
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };

const VARIANT_RE = /-(300|600|1200)\.webp$/;

// ФОТО ТОВАРУ, ЗАЛИТЕ ЯК JPG АБО PNG, НЕ ОБСЛУГОВУЄ НІХТО.
//
// Дірка між двома скриптами, і кожен із них по-своєму має рацію:
//
//   • shrink-heavy-images.js бачить png і jpeg, але фото товарів у
//     теці uploads навмисно НЕ чіпає — «у них свій конвеєр». До того
//     ж у нього поріг 300 КБ, тож дрібніші він не розглядає взагалі;
//   • цей скрипт — і є той «свій конвеєр», — досі брав лише .webp.
//
// Отже, знімок, залитий з адмінки як JPG, не отримував ні webp, ні
// avif, ні зменшених копій, ні рядка в image-variants.json. Верстка
// просить srcset лише для зареєстрованих фото, тож у мобільну сітку
// їхав повнорозмірний оригінал.
//
// ЗАМІРЯНО 24.09.2026 на живому сайті: 21 знімок із 387 лишився в
// JPG, разом 2929 КБ. Найгірший випадок — гаманець Marc Jacobs: три
// фото на 1468 КБ, тобто сторінка товару коштувала покупцеві вчетверо
// більше за типову. Для порівняння, медіана нормального webp — 60 КБ,
// а зменшеної копії -300, яку й тягне телефон, — 5 КБ.
//
// Тому беремо такі файли на себе: переводимо в .webp тим самим
// холстом, що й решту, прибираємо оригінал і правимо посилання. Далі
// знімок іде звичайним шляхом — копії, avif, реєстрація, — бо стає
// неотличним від будь-якого іншого.
const RASTER_RE = /\.(jpe?g|png)$/i;

// Тільки те, на що справді посилається товар.
//
// У теці uploads інколи опиняються банери, які адмінка поклала не
// туди (їх переселяє shrink-heavy-images.js). Приводити банер до 4:5
// не можна — це його нищить, і саме так уже сталось одного разу з
// банером 1635×1104. Ознака та сама, що й у сусіднього скрипта:
// фотографія товару — це та, яку згадує data/products.
function referencedPhotos() {

    const dir = path.join(ROOT, "data", "products");
    const texts = [];

    if (fs.existsSync(dir)) {
        fs.readdirSync(dir)
            .filter(f => f.endsWith(".json"))
            .forEach(f => texts.push(fs.readFileSync(path.join(dir, f), "utf8")));
    }

    const names = new Set();

    (texts.join(" ").match(/[\w.#-]+\.(?:png|jpe?g|webp)/gi) || [])
        .forEach(name => names.add(name));

    return names;

}

function rasterPhotos() {

    const referenced = referencedPhotos();

    return fs.readdirSync(DIR)
        .filter(f => RASTER_RE.test(f) && referenced.has(f))
        .sort();

}

async function toWebp(file) {

    const full = path.join(DIR, file);

    // Той самий холст і та сама якість, що в normalize(): інакше
    // переведений знімок відрізнявся б від сусідніх на око.
    const canvas = await sharp(fs.readFileSync(full))
        .resize({ ...CANVAS, fit: "contain", background: BACKGROUND })
        .webp({ quality: 90 })
        .toBuffer();

    const target = file.replace(RASTER_RE, ".webp");

    fs.writeFileSync(path.join(DIR, target), canvas);

    // Оригінал прибираємо: лишити його означало б тримати в репозиторії
    // мегабайти, на які ніхто вже не посилається, і щоразу бачити їх у
    // звіті про невикористані файли.
    fs.unlinkSync(full);

    return target;

}

function baseWebpFiles() {

    return fs.readdirSync(DIR)
        .filter(f => f.endsWith(".webp") && !VARIANT_RE.test(f))
        .sort();

}

async function inspect(file) {

    const image = sharp(path.join(DIR, file));

    const meta = await image.metadata();

    // Закриваємо файл ОДРАЗУ.
    //
    // ЩО БУЛО НЕ ТАК. findOffCanvas() проганяє inspect по всіх 368
    // знімках через Promise.all — тобто відкриває їх усі й тримає
    // відкритими, поки не завершиться обхід. Далі normalize() пише в
    // ті самі файли, і на Windows це падає:
    //
    //   Error: UNKNOWN: unknown error, open '…/ch857_b4mpl_a62.webp'
    //
    // Обробка зупинялась на першому ж такому файлі, а решта черги
    // лишалась незачепленою. У CI (Linux) запис поверх відкритого
    // файлу проходить, тож помилка чекала на того, хто запустить
    // `npm run build:media` у себе.
    if (typeof image.destroy === "function") image.destroy();

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
    //
    // ЧОГО ЦЬОГО ВИЯВИЛОСЬ МАЛО
    // --------------------------
    // Час — не властивість картинки, а властивість файлу на диску.
    // Будь-який checkout ставить УСІМ файлам той самий час, тож у CI
    // ця перевірка мовчить завжди: копія ніколи не «старша за базу»,
    // і перезбірка відбувається лише коли копії немає зовсім.
    //
    // Наслідок заміряний на живому сайті: у 16 фото avif-копії
    // лишились від широкого оригіналу (1.51), тоді як сам файл давно
    // приведений до 1200×1500 (0.80). Браузер бере саме avif — і
    // сумка на сторінці товару виявлялась обрізаною, бо широку
    // картинку вписували в вертикальну рамку через object-fit: cover.
    // webp-копії при цьому були правильні, тобто помилка була ще й
    // невидимою на око в частині браузерів.
    //
    // Тому додаємо перевірку, яку не збиває жоден checkout: ФОРМА.
    // Копія, зроблена з цієї бази, мусить мати її співвідношення
    // сторін і задану ширину. Не збігається — вона зроблена з іншого
    // зображення, хоч би що казав час файлу.
    const baseTime = fs.statSync(full).mtimeMs;

    const baseMeta = await sharp(source).metadata();

    const baseRatio = baseMeta.width / baseMeta.height;

    async function stale(name, width) {

        const variant = path.join(DIR, name);

        if (!fs.existsSync(variant)) return true;

        // Форма — головне. Її перевіряємо першою й завжди.
        try {

            // Читаємо байти В ПАМʼЯТЬ, а не даємо sharp шлях.
            //
            // sharp(шлях) тримає файл відкритим, поки живе конвеєр, а
            // через кілька рядків ми пишемо writeFileSync РІВНО В ЦЕЙ
            // САМИЙ файл. На Windows це падає:
            //
            //   Error: UNKNOWN: unknown error, open
            //     '…/2s3hcr500h03-134-1-600.webp'
            //
            // і збірка зупиняється на першому ж фото, якому треба
            // перезібрати копії. У CI (Linux) запис поверх відкритого
            // файлу проходить, тож помилки там не видно взагалі — вона
            // чекає на того, хто замінить фото в себе на машині.
            //
            // Той самий прийом і з тієї самої причини вже стоїть у
            // whiten-backgrounds.js і в normalize() вище.
            const meta = await sharp(fs.readFileSync(variant)).metadata();

            if (meta.width !== width) return true;

            // Два відсотки допуску: масштабування округлює висоту до
            // цілого пікселя, і 300×375 проти 300×374 — це та сама
            // картинка, а не інша.
            if (Math.abs(meta.width / meta.height - baseRatio) / baseRatio > 0.02) return true;

        } catch (error) {

            // Не читається — точно треба перезібрати.
            return true;

        }

        // Форма збіглась. Лишається випадок, коли базу підмінили
        // зображенням тих самих пропорцій — його ловить лише час.
        return fs.statSync(variant).mtimeMs < baseTime - 1000;

    }

    // Чого бракує — по кожному формату окремо: webp може бути свіжим, а
    // avif ще не існувати (перший запуск після появи цього формату).
    // Послідовно, а не forEach: перевірка форми читає заголовок
    // файлу, тобто вона асинхронна. У forEach обіцянка нікого не
    // чекала б, і перелік лишався б порожнім.
    const missing = [];

    for (const format of VARIANT_FORMATS) {

        for (const width of VARIANT_WIDTHS) {

            if (await stale(`${stem}-${width}.${format}`, width)) {
                missing.push({ width, format });
            }

        }

    }

    if (!missing.length) return false;

    for (const { width, format } of missing) {

        // AVIF робимо з ОРИГІНАЛУ, а не з webp-копії: стискати вже
        // стиснуте означало б зберегти артефакти першого стиснення й
        // додати свої.
        const pipeline = sharp(source).resize({ width });

        const variant = format === "avif"
            ? await pipeline.avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT }).toBuffer()
            : await pipeline.webp({ quality: 82 }).toBuffer();

        fs.writeFileSync(path.join(DIR, `${stem}-${width}.${format}`), variant);

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

    // ПЕРЕВОДИМО JPG/PNG ДО ТОГО, ЯК ШУКАТИ ПРОПОРЦІЇ.
    //
    // findOffCanvas() дивиться лише на .webp, тож нещодавно переведений
    // знімок мусить існувати вже на цей момент — інакше він дочекався б
    // копій тільки наступного прогону, а між двома збірками сайт стояв
    // би з фото без srcset.
    const raster = rasterPhotos();

    if (raster.length) {

        console.log(`Фото товарів у JPG/PNG: ${raster.length}\n`);

        raster.forEach(f => console.log(
            `  ${Math.round(fs.statSync(path.join(DIR, f)).size / 1024)
                .toString().padStart(5)} КБ  ${f}`));

        console.log("");

        if (apply) {

            const renamed = new Map();

            for (const file of raster) {

                const to = await toWebp(file);

                renamed.set(
                    path.relative(ROOT, path.join(DIR, file)).split(path.sep).join("/"),
                    path.relative(ROOT, path.join(DIR, to)).split(path.sep).join("/")
                );

                console.log(`  → ${to}`);

            }

            // Посилання правимо тим самим переліком файлів, що й сусідні
            // скрипти, — щоб жоден із них колись не забув теку й частина
            // фото не відвалилась мовчки.
            //
            // Ключ — ШЛЯХ, а не саме ім'я: у даних товару фото записані
            // повними адресами, а серед коротких імен трапляються такі,
            // як «2.png», і заміна по імені потрапила б куди завгодно.
            let touched = 0;

            collectTextFiles().forEach(file => {

                const text = fs.readFileSync(file, "utf8");

                let next = text;

                renamed.forEach((to, from) => {
                    if (next.includes(from)) next = next.split(from).join(to);
                });

                if (next !== text) {
                    fs.writeFileSync(file, next, "utf8");
                    touched++;
                }

            });

            console.log(`\n  переведено ${renamed.size}, посилання оновлено у ${touched} файлах\n`);

        }

    }

    const off = await findOffCanvas();

    // СПОЧАТКУ ПРИВОДИМО ДО 4:5, АЖ ПОТІМ РОБИМО КОПІЇ
    //
    // Порядок був зворотний, і саме він давав ту поломку, що описана
    // вище в stale() — «avif-копії лишились від широкого оригіналу».
    //
    // ЯК ЦЕ ВИГЛЯДАЛО. Нове фото 1900×1900 лягало в теку. За один
    // прогін збірка робила так:
    //
    //   1. buildMissingVariants брав ЩЕ КВАДРАТНУ базу і робив із неї
    //      600×600 та 300×300 — і webp, і avif;
    //   2. normalize() після цього приводив базу до 1200×1500 і
    //      перероблював webp-копії — але avif він не робить.
    //
    // У теці лишались квадратні avif при вертикальній базі, а браузер
    // бере саме avif. У рамці 4:5 це object-fit: cover, тобто сумка на
    // сторінці товару обрізана з боків.
    //
    // Перевірка форми в stale() лагодила це НАСТУПНИМ прогоном — але
    // між двома збірками сайт стоїть із обрізаними фото. Дешевше не
    // створювати хибні копії взагалі.
    if (apply && off.length) {

        console.log(`Не в пропорціях 4:5: ${off.length} фото\n`);

        off.forEach(info => console.log(`  ${info.width}×${info.height} (${info.ratio})  ${info.file}`));

        console.log("");

        for (const info of off) {
            await normalize(info.file);
            console.log(`  → 1200×1500 + копії 600/300: ${info.file}`);
        }

        console.log("");

    }

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
            // Копії вважаються повними, лише коли є ОБА формати:
            // інакше фото зареєструвалось би в переліку, а верстка,
            // побачивши його там, попросила б avif, якого немає.
            const hasCopies = VARIANT_FORMATS.every(format =>
                VARIANT_WIDTHS.every(width =>
                    fs.existsSync(path.join(DIR, file.replace(/\.webp$/, `-${width}.${format}`)))));

            if (built || hasCopies) patched.push(file);
        }

        if (patched.length) {

            const addedNow = registerVariants(patched);

            console.log(`Добудовано копії 600/300 (webp + avif): ${patched.length} фото`
                + (addedNow ? `, у image-variants.json додано ${addedNow}` : ""));

        }

    }

    if (off.length === 0) {

        console.log(`Готово: усі ${baseWebpFiles().length} базових фото вже 4:5`);

        return;

    }

    if (!apply) {

        console.log(`Не в пропорціях 4:5: ${off.length} фото\n`);

        off.forEach(info => console.log(`  ${info.width}×${info.height} (${info.ratio})  ${info.file}`));

        console.log("\nЦе лише звіт. Щоб переробити — додайте --apply");

        return;

    }

    const added = registerVariants(off.map(info => info.file));

    console.log(`Готово: нормалізовано ${off.length}, у image-variants.json додано ${added}`);

}

module.exports = {
    baseWebpFiles, findOffCanvas, TARGET_RATIO, CANVAS, VARIANT_WIDTHS,
    VARIANT_FORMATS, AVIF_QUALITY, AVIF_EFFORT
};

if (require.main === module) {
    main().catch(error => { console.error(error); process.exit(1); });
}
