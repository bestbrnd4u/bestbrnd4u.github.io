// Вирівнювання тла фото до білого.
//
// НАВІЩО
// -------
// Фото приходять від різних постачальників: у більшості тло біле, у
// частини — світло-сіре (240) чи бежеве. У каталозі картки стоять
// поруч, і різниця помітна одразу.
//
// ЧОМУ ЦЕ НЕБЕЗПЕЧНА ОПЕРАЦІЯ
// ----------------------------
// Замір на реальних фото: у 122 знімках товар САМ світлий. Проста
// заміна «всіх пікселів кольору тла» вигризла б у нього дірки —
// біла пряжка, світла підошва, металева фурнітура. Оригінал при цьому
// вже перезаписаний, і повернути нічого.
//
// Тому перевірки нижче стежать саме за запобіжниками, а не за тим,
// «чи щось пофарбувалось».
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const script = read("scripts/whiten-backgrounds.js");

console.log("\n[1] Три запобіжники на місці");
{
    // 1. Тільки НЕбіле тло: 270 фото з 303 не треба чіпати взагалі.
    check("біле тло пропускається", /ALREADY_WHITE = 250/.test(script));
    // Умову доповнено: адмін МОЖЕ примусово вирівняти навіть біле тло
    // (буває, що воно 250 і виглядає сірим поруч із чисто білою
    // карткою). Автоматика без такого рішення біле не чіпає.
    // «Уже білий» тепер означає «ВСІ знайдені кольори периметра білі».
    // Одного кольору мало: після приведення до 4:5 у кадрі їх два —
    // біла добивка й фон самого знімка.
    check("перевірка перед обробкою",
        /allWhite && decided !== "white"/.test(script)
        && /colors\.every/.test(script));

    // 2. Тільки однорідне тло: градієнт чи зйомка в інтерʼєрі — не наш
    //    випадок, там межі товару по кольору не знайти.
    // Однорідність міряємо покриттям периметра, а не розкидом кутів:
    // кути після приведення до 4:5 показують добивку, а не фон знімка.
    check("неоднорідне тло пропускається",
        /coverage < 0\.9\) return/.test(script));

    // 3. Заливка ВІД КРАЮ, а не по всьому кадру. Це головне: світла
    //    пряжка в центрі сумки лишається пряжкою, бо шлях до неї
    //    перекритий самим товаром.
    check("заливка від країв", /function fillFromEdges/.test(script));
    check("старт саме з рамки кадру",
        /push\(x, 0\); push\(x, h - 1\)/.test(script)
        && /push\(0, y\); push\(w - 1, y\)/.test(script));

    // Якщо «тлом» виявилось майже все фото — щось не так, зберігати
    // такий результат небезпечно.
    check("залито майже весь кадр — відмова",
        /share > 0\.97\) return/.test(script));
}

console.log("\n[2] Оригінали можна повернути");
{
    check("копія перед зміною", /fs\.copyFileSync\(full, backup\)/.test(script));

    // Копію робимо ЛИШЕ раз: повторний запуск не має затирати
    // справжній оригінал уже обробленою версією.
    check("копія не перезаписується",
        /if \(!fs\.existsSync\(backup\)\) fs\.copyFileSync/.test(script));

    const backupDir = path.join(ROOT, "assets/images/_originals");

    if (fs.existsSync(backupDir)) {

        const saved = fs.readdirSync(backupDir);

        check(`збережено оригіналів — ${saved.length}`, saved.length > 0);

        // Кожна копія мусить відповідати наявному фото.
        const uploads = new Set(fs.readdirSync(
            path.join(ROOT, "assets/images/products/uploads")));

        const orphans = saved.filter(f => !uploads.has(f));

        check("немає копій без фото", orphans.length === 0,
            orphans.slice(0, 3).join(", "));

    }
}

console.log("\n[2b] Керування з адмінки");
{
    // Адмінка не може перезаписати файл фото — Decap не дає віджетам
    // такого доступу. Тому вона зберігає РІШЕННЯ, а файл змінює
    // збірка. Так само влаштоване кадрування.
    const widget = read("admin/image-framing-widget.js");
    const lib = read("assets/js/image-framing.js");

    // Рішення живе в кадрі фото: воно стосується конкретного файлу, а
    // кадр — уже саме такий запис «на файл». Окреме поле означало б два
    // місця, які легко розсинхронити.
    check("значення тла зберігається в кадрі",
        /frame\.bg === "white" \|\| frame\.bg === "keep"/.test(lib));
    check("сміття не зберігається",
        /: null;[\s\S]{0,200}if \(bg\) out\.bg = bg/.test(lib));

    // Рішення без кадру теж має зберігатись: інакше «зробити білим»
    // на фото з наближенням 1× тихо зникало б.
    const framing = require("../assets/js/image-framing.js");

    check("рішення без кадру не губиться",
        (framing.normalizeFrame({ bg: "white" }) || {}).bg === "white");
    check("порожній кадр без рішення — усе ще порожній",
        framing.normalizeFrame({ zoom: 1, x: 50, y: 50 }) === null);

    // В адмінці: визначення кольору й показ результату ДО публікації.
    //
    // Заливка живе в admin/white-preview.js, бо той самий результат
    // потрібен двом місцям — рядку кадрування ліворуч і картці
    // праворуч. Доки вона була всередині віджета, картка показувала
    // файл як є: ліворуч фон білий, праворуч сірий.
    const біле = read("admin/white-preview.js");
    const preview = read("admin/preview-templates.js");

    check("колір фону визначається", /detectBackground: function/.test(widget));
    check("є попередній перегляд", /ensureWhitePreview: function/.test(widget));

    // Умови «якщо натиснуто біле» тут бути не має: збірка вирівнює фон
    // і сама, тож найчастіший випадок («нічого не натискав») показувався
    // б неправдиво.
    check("перегляд показується замість оригіналу",
        /src: this\.state\.whitePreview \|\| url/.test(widget));

    check("картка праворуч показує те саме",
        /window\.WhitePreview/.test(preview)
        && /src: this\.state\.white \|\| this\.state\.url/.test(preview));

    // Алгоритм в адмінці мусить бути ТОЙ САМИЙ, що в збірці — інакше
    // показане не збігатиметься з результатом.
    check("заливка від країв і в адмінці",
        /push\(x, 0\); push\(x, h - 1\)/.test(біле));
    check("допуск однаковий",
        /TOLERANCE = 14/.test(біле) && /TOLERANCE = 14/.test(script));

    // Неоднорідне тло не пропонуємо чіпати навіть кнопкою.
    check("для фото на моделі вибору немає",
        /this\.state\.bgUniform\s*\n\s*\? h\("div", \{ className: "framing-bg-actions"/.test(widget));

    // Збірка мусить слухати рішення.
    check("збірка читає рішення", /function adminChoice/.test(script));
    check("«не чіпати» сильніше за автоматику",
        /decided === "keep"\) return \{ skip: "адмін лишив як є" \}/.test(script));
    check("«зробити білим» обходить перевірку на біле",
        /allWhite && decided !== "white"/.test(script));

    // А от неоднорідне тло не обходиться навіть примусово: там заливка
    // зʼїла б половину кадру.
    const uniformCheck = script.indexOf("coverage < 0.9");
    const whiteCheck = script.indexOf("allWhite && decided");

    check("неоднорідність перевіряється до примусу",
        uniformCheck > 0 && uniformCheck < whiteCheck);
}

console.log("\n[2c] Обробка робиться РАЗ, а не на кожній збірці");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    // ---------------
    // Рішення з адмінки («зробити білим», «вирізати товар») — це вибір
    // на ОДИН раз. А працювали вони як постійні: кожна збірка бралась
    // обробляти те саме фото знову.
    //
    // Заміри на цьому репозиторії:
    //
    //   • 6 фото перезаписувались у КОЖНІЙ збірці — 73 коміти підряд;
    //
    //   • заливка крутилась по колу: вона робить тло рівно білим, запис
    //     у webp (quality 88) повертає в цю площину шум ±TOLERANCE,
    //     наступна збірка зафарбовує його знову. ~20 000 пікселів за
    //     прогін, і кількість не спадала;
    //
    //   • вирізання щоразу різало ВЖЕ ВИРІЗАНЕ: за 20 збірок 12% кадру
    //     змінилось у середньому на 50 рівнів — від фото моделі лишився
    //     обгризений силует без обличчя, рук і ніг.
    //
    // Плюс постійний шум у гілці: перезаписане фото — це новий ?v= у
    // data/products.json, а за ним штампи кеша в усіх сторінках.

    // Ознака «робота вже зроблена»: периметр РІВНО білий. І заливка, і
    // вирізання лишають по краях чисті 255, тож інших ознак не треба.
    check("є перевірка «тло вже рівно біле»",
        /const pureWhite = coverage >= 0\.9/.test(script)
        && /c\[0\] === 255 && c\[1\] === 255 && c\[2\] === 255/.test(script));

    // Порожній перелік кольорів — це НЕ «біле»: [].every() дає true, і
    // без перевірки довжини скрипт пропускав би все підряд.
    check("порожній перелік кольорів не вважається білим",
        /colors\.length > 0/.test(script));

    const pureAt = script.indexOf("const pureWhite");
    const cutAt = script.indexOf('decided === "cutout"');
    const forcedAt = script.indexOf('allWhite && decided !== "white"');

    check("перевірка стоїть ДО вирізання", pureAt > 0 && pureAt < cutAt, pureAt + " / " + cutAt);
    check("і до примусової заливки", pureAt < forcedAt, pureAt + " / " + forcedAt);

    // Запис ПОВЕРХ джерела: у Linux проходить, у Windows ні — libvips
    // не може відкрити на запис файл, який ще тримає читач. Через це
    // вирізання не працювало локально взагалі, а в CI відпрацьовувало
    // й з кожною збіркою обгризало фото далі. Таке помітити складно:
    // на машині розробника «нічого не відбувається».
    check("вирізане пишеться через тимчасовий файл",
        /webp\(\{ quality: 88 \}\)\.toFile\(full \+ "\.tmp"\)/.test(script));
    check("і перейменовується на місце",
        (script.match(/renameSync\(full \+ "\.tmp", full\)/g) || []).length === 2);
    // Дивимось на КОД без коментарів: у поясненні вище згадано
    // «.toFile(full)» як те, що тут стояло раніше, — і перевірка
    // спіймала б власний текст.
    const code = script.replace(/^\s*\/\/.*$/gm, "");

    check("поверх джерела не пишемо", !/\.toFile\(full\)/.test(code));

    // Те саме з іншого боку: sharp тримає відкритий дескриптор, поки
    // живий кеш операцій, і перейменування падає з EPERM.
    const cutSrc = read("scripts/cutout.js");

    check("вирізальник читає байти сам, а не дає шлях у sharp",
        /Buffer\.isBuffer\(file\) \? file : fs\.readFileSync\(file\)/.test(cutSrc));
    check("далі працює з буфером",
        /sharp\(input\)/.test(cutSrc) && !/sharp\(file\)/.test(cutSrc));
}

// Перевірка на СПРАВЖНІХ файлах: повторна збірка не має псувати фото,
// для яких адміністратор щось вибрав.
//
// ЩО ТУТ СТОЯЛО РАНІШЕ Й ЧОМУ ЦЬОГО НЕ ВИСТАЧИЛО
// -----------------------------------------------
// Вимагалось, щоб периметр кадру був рівно білий: тоді наступна
// збірка визнає роботу зробленою й пропустить фото.
//
// На крупному плані сумка ВПИРАЄТЬСЯ в край кадру — після вирізання
// периметр там не може стати білим у принципі. Тобто для такого фото
// умова не виконається ніколи, і збірка різала його знову й знову.
// На сумці Jacquemus так і сталось: файл переписано в трьох комітах
// «перезбірка» підряд, темна шкіра вицвіла, навколо лишились сірі
// клапті, на фото з моделлю зникла частина сукні.
//
// Тепер вирізання завжди бере ОРИГІНАЛ із _originals, а не те, що вже
// лежить у uploads. Мережа детермінована, отже повторний прогін дає
// той самий файл — псуватись нічому.
//
// Тому й перевіряємо тепер саме це: опублікований файл мусить
// збігатися з тим, що дає вирізання ОРИГІНАЛУ. Розійдуться — значить
// його зробили з уже обробленого знімка.
//
// Перелік беремо з каталогу, а не вписуємо руками: рішень стане
// більше, і жорсткий список тут швидко застаріє.
function decidedPhotosStayPut() {

    const sharp = require("sharp");

    const dir = path.join(ROOT, "data/products");
    const uploads = path.join(ROOT, "assets/images/products/uploads");

    const decided = [];

    fs.readdirSync(dir).filter(f => f.endsWith(".json")).forEach(file => {

        let data;

        try { data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")); }
        catch (error) { return; }

        Object.entries(data.framing || {}).forEach(([name, frame]) => {
            const bg = frame && frame.bg;
            if (bg === "white" || bg === "cutout") decided.push({ name: name, bg: bg });
        });

    });

    console.log("\n[2d] Повторна збірка не псує фото з рішенням адмінки");

    check("рішення в каталозі є (інакше перевіряти нічого)", decided.length > 0, decided.length);

    const originals = path.join(ROOT, "assets/images/_originals");

    // Джерело вирізання — оригінал. Це головне, що тримає всю
    // конструкцію: без нього кожна збірка різатиме вже вирізане.
    const script = read("scripts/whiten-backgrounds.js")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n").filter(line => !/^\s*\/\//.test(line)).join("\n");

    check("вирізання бере оригінал, а не те, що вже лежить у uploads",
        /const source = fs\.existsSync\(backup\) \? backup : full;/.test(script)
        && /cutout\.cutoutToWhite\(source\)/.test(script));

    // Маска йде через поріг — інакше там, де мережа вагається, від
    // товару лишається половина, змішана з білим.
    const cut = read("scripts/cutout.js")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n").filter(line => !/^\s*\/\//.test(line)).join("\n");

    check("маска береться з порогом, а не як є",
        /const a = alpha\(mask\.data\[p \* mask\.stride\] \/ 255\)/.test(cut)
        && /function alpha\(a\)/.test(cut));

    // І головне — наслідок, а не текст: беремо кілька вирізаних фото і
    // ріжемо їхні оригінали заново. Збіглось — значить опубліковане
    // зроблено з оригіналу.
    const cutouts = decided.filter(d => d.bg === "cutout"
        && fs.existsSync(path.join(originals, d.name))
        && fs.existsSync(path.join(uploads, d.name)));

    check("вирізані фото з копією оригіналу є", cutouts.length > 0, cutouts.length);

    // Трьох досить: кожне — окремий прогін нейромережі, а перевіряємо
    // спільний для всіх механізм.
    const sample = cutouts.slice(0, 3);

    const sameAsFreshCut = async ({ name }) => {

        let fresh;

        try {
            const cutout = require("../scripts/cutout.js");
            fresh = await cutout.cutoutToWhite(path.join(originals, name));
        } catch (error) {
            // Немає onnxruntime — перевіряти нічим, але й мовчати не
            // варто: хай видно, що цей шматок не відпрацював.
            check(name + ": вирізання доступне", false, error.message.slice(0, 60));
            return;
        }

        const now = await sharp(fs.readFileSync(path.join(uploads, name)))
            .removeAlpha().raw().toBuffer({ resolveWithObject: true });

        if (now.info.width !== fresh.width || now.info.height !== fresh.height) {
            check(name + ": розмір збігається", false,
                `${now.info.width}x${now.info.height} проти ${fresh.width}x${fresh.height}`);
            return;
        }

        // Рахуємо ЧАСТКУ помітно різних каналів, а не середнє по кадру.
        //
        // Середнє розмивається розміром: варто зіпсуватись самому
        // товару в кутку кадру — і воно лишається біля нуля. Заміряно
        // на цих же файлах: коли поріг маски зсунули так, що товар
        // знову підмішується до білого, середнє трималось у межах
        // допуску, а частка помітних розбіжностей злітала.
        let big = 0;

        for (let i = 0; i < fresh.data.length; i++) {
            if (Math.abs(now.data[i] - fresh.data[i]) > 8) big++;
        }

        const share = big / fresh.data.length;

        // Допуск на webp: файл проходить стиснення (quality 88), а
        // fresh — ще сирі пікселі. На цілих файлах це 0.02–0.04%.
        check(name + ": опубліковане = вирізане з оригіналу",
            share < 0.01, "помітно різних каналів: " + (share * 100).toFixed(2) + "%");

    };

    return sample.reduce((chain, item) => chain.then(() => sameAsFreshCut(item)), Promise.resolve());

}

console.log("\n[3] Результат на справжніх фото");
{
    const sharp = require("sharp");

    const dir = path.join(ROOT, "assets/images/products/uploads");

    const files = fs.readdirSync(dir)
        .filter(f => /\.webp$/i.test(f) && !/-(300|600|1200)\.webp$/i.test(f))
        .slice(0, 40);

    const cornerColour = async file => {

        const { data, info } = await sharp(path.join(dir, file))
            .resize(80, 100, { fit: "inside" })
            .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        const w = info.width;
        const h = info.height;

        const at = (x, y) => {
            const i = (y * w + x) * 4;
            return [data[i], data[i + 1], data[i + 2]];
        };

        const corners = [at(1, 1), at(w - 2, 1), at(1, h - 2), at(w - 2, h - 2)];

        const bg = [0, 1, 2].map(c =>
            Math.round(corners.reduce((s, p) => s + p[c], 0) / corners.length));

        const spread = Math.max(...corners.map(p =>
            Math.max(...[0, 1, 2].map(c => Math.abs(p[c] - bg[c])))));

        return { bg: bg[0], uniform: spread <= 24 };

    };

    return decidedPhotosStayPut()
        .then(() => Promise.all(files.map(f => cornerColour(f).then(r => ({ f, ...r })))))
        .then(results => {

            check(`перевірено фото — ${results.length}`, results.length > 0);

            // Після обробки тло мусить бути світлим — але ЛИШЕ там, де
            // воно однорідне.
            //
            // Спершу перевірка вимагала білого від усіх, і впала на
            // фото товару НА МОДЕЛІ: там «тлом» слугує сама одежа,
            // розкид кутів 141. Запобіжник спрацював правильно, хибним
            // було очікування — такі знімки чіпати й не можна.
            const dark = results.filter(r => r.bg < 235 && r.uniform);

            check("на однорідних фото темного тла не лишилось",
                dark.length === 0,
                dark.slice(0, 3).map(r => `${r.f}: ${r.bg}`).join(", "));

            const skipped = results.filter(r => !r.uniform);

            check(`фото з неоднорідним тлом пропущено — ${skipped.length}`,
                skipped.every(r => true));

            // І сам крок вбудований у збірку, а не разова ручна дія.
            const pkg = JSON.parse(read("package.json"));

            check("крок у build:media",
                /whiten-backgrounds\.js --apply/.test(pkg.scripts["build:media"]));

            // Тло вирівнюємо ДО приведення до 4:5: інакше поля, якими
            // доповнюють кадр, лишились би старого кольору.
            const media = pkg.scripts["build:media"];

            check("тло вирівнюється до нормалізації 4:5",
                media.indexOf("whiten-backgrounds") < media.indexOf("normalize-product-images"));

            console.log(failures === 0
                ? "\n✅ Усі перевірки пройдено"
                : `\n❌ Провалено: ${failures}`);

            process.exit(failures === 0 ? 0 : 1);

        });
}
