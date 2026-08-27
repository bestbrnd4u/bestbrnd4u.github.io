// ======================================
// Вирівнювання тла фото до білого
//
// НАВІЩО
// -------
// Фото приходять від різних постачальників. У більшості тло біле, але
// в частини — світло-сіре (240) чи бежеве. У каталозі картки стоять
// поруч, і різниця тла помітна одразу: одні фото ніби «в рамці»,
// інші — ні.
//
// ЩО САМЕ РОБИМО
// ---------------
// Замінюємо тло на біле. Не «видаляємо фон» — саме вирівнюємо колір
// того, що вже є тлом.
//
// ЧОГО НЕ РОБИМО І ЧОМУ
// ----------------------
// Не намагаємось відокремити товар від складного тла. Це задача
// сегментації, і на предметних фото вона зайва: тло й так однотонне.
// А головне — помилка тут коштує дорого: з'їдений край сумки не
// повернеш, оригінал уже перезаписаний.
//
// Тому три запобіжники:
//
//   1. Тільки НЕбіле тло. Якщо тло вже 250+, чіпати нічого — 270 фото
//      з 303 просто пропускаються.
//
//   2. Тільки ОДНОРІДНЕ тло. Кути кадру мусять бути схожі між собою:
//      градієнт чи зйомка в інтер'єрі — не наш випадок.
//
//   3. Заливка ВІД КРАЮ, а не по всьому кадру. Йдемо від рамки
//      всередину й зупиняємось на першому пікселі товару. Світла
//      пряжка в центрі сумки лишиться пряжкою, навіть якщо її колір
//      збігається з тлом.
//
// Третій запобіжник найважливіший: у 122 фото товар сам світлий, і
// проста заміна «всіх пікселів кольору тла» вигризла б у нього дірки.
//
// ОРИГІНАЛ ЗБЕРІГАЄМО
// --------------------
// Перед зміною кладемо копію в assets/images/_originals/. Якщо
// результат не сподобається — файл можна повернути.
// ======================================

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "assets/images/products/uploads");
const BACKUP = path.join(ROOT, "assets/images/_originals");

// Тло, світліше за це, вважаємо вже білим — не чіпаємо.
const ALREADY_WHITE = 250;

// Наскільки схожими мусять бути кути, щоб тло вважалось однорідним.
const MAX_SPREAD = 24;

// Допуск навколо кольору тла. Той самий, що у віджеті кадрування:
// тіні й компресія дають відхилення на кілька одиниць.
const TOLERANCE = 14;

function isBackground(data, i, bg) {

    return Math.abs(data[i] - bg[0]) <= TOLERANCE
        && Math.abs(data[i + 1] - bg[1]) <= TOLERANCE
        && Math.abs(data[i + 2] - bg[2]) <= TOLERANCE;

}

// Заливка від країв усередину.
//
// Класичний обхід у ширину зі стартом на рамці кадру. Пікселі товару
// не зачіпаються, навіть якщо їхній колір збігається з тлом: до них
// просто не дійде черга, бо шлях перекритий самим товаром.
function fillFromEdges(data, w, h, bg) {

    const visited = new Uint8Array(w * h);
    const queue = [];

    const push = (x, y) => {

        if (x < 0 || y < 0 || x >= w || y >= h) return;

        const p = y * w + x;

        if (visited[p]) return;

        const i = p * 4;

        if (data[i + 3] < 16) { visited[p] = 1; return; }   // прозорий — уже тло

        if (!isBackground(data, i, bg)) return;

        visited[p] = 1;
        queue.push(p);

    };

    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

    let painted = 0;

    while (queue.length) {

        const p = queue.pop();
        const i = p * 4;

        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;

        painted++;

        const x = p % w;
        const y = (p - x) / w;

        push(x - 1, y);
        push(x + 1, y);
        push(x, y - 1);
        push(x, y + 1);

    }

    return painted;

}

// Рішення з адмінки: "white" — примусово, "keep" — не чіпати.
//
// Зберігається в кадрі фото (framing), бо стосується конкретного
// файлу — а кадр уже саме такий запис «на файл». Друге поле означало
// б два місця, які легко розсинхронити.
function adminChoice() {

    const dir = path.join(ROOT, "data", "products");

    const choice = {};

    if (!fs.existsSync(dir)) return choice;

    fs.readdirSync(dir).filter(f => f.endsWith(".json")).forEach(file => {

        let data;

        try {
            data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
        } catch (error) {
            return;
        }

        const framing = data.framing;

        if (!framing || typeof framing !== "object") return;

        Object.keys(framing).forEach(name => {

            const bg = framing[name] && framing[name].bg;

            if (bg === "white" || bg === "keep") choice[name] = bg;

        });

    });

    return choice;

}

async function whiten(file, apply, choice) {

    const full = path.join(DIR, file);

    const image = sharp(full);
    const meta = await image.metadata();

    const { data, info } = await image.ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;

    const at = (x, y) => {
        const i = (y * w + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
    };

    const corners = [at(1, 1), at(w - 2, 1), at(1, h - 2), at(w - 2, h - 2)];

    const bg = [0, 1, 2].map(c =>
        Math.round(corners.reduce((sum, p) => sum + p[c], 0) / corners.length));

    const spread = Math.max(...corners.map(p =>
        Math.max(...[0, 1, 2].map(c => Math.abs(p[c] - bg[c])))));

    const decided = choice ? choice[file] : null;

    // «Не чіпати» з адмінки сильніше за автоматику.
    if (decided === "keep") return { skip: "адмін лишив як є" };

    // Запобіжник 2: тло неоднорідне.
    //
    // Цей запобіжник не обходиться навіть примусово: на фото в
    // інтерʼєрі чи на моделі «тлом» слугує сам знімок, і заливка
    // зʼїла б половину кадру.
    if (spread > MAX_SPREAD) return { skip: "тло неоднорідне" };

    // Запобіжник 1: тло вже біле. Його адмін МОЖЕ обійти — буває, що
    // тло 250 і виглядає сірим поруч із чисто білою карткою.
    if (Math.min(...bg) >= ALREADY_WHITE && decided !== "white") {
        return { skip: "тло вже біле" };
    }

    // Запобіжник 3: заливка від країв.
    const painted = fillFromEdges(data, w, h, bg);

    const share = painted / (w * h);

    // Якщо «тлом» виявилось майже все фото — щось не так із
    // визначенням, і зберігати такий результат небезпечно.
    if (share > 0.97) return { skip: "залито майже весь кадр" };

    if (!apply) return { would: Math.round(share * 100), bg: bg[0] };

    fs.mkdirSync(BACKUP, { recursive: true });

    const backup = path.join(BACKUP, file);

    // Копію робимо лише раз: повторний запуск не має затирати
    // справжній оригінал уже обробленою версією.
    if (!fs.existsSync(backup)) fs.copyFileSync(full, backup);

    await sharp(data, { raw: { width: w, height: h, channels: 4 } })
        .webp({ quality: 88 })
        .toFile(full + ".tmp");

    fs.renameSync(full + ".tmp", full);

    return { done: Math.round(share * 100), bg: bg[0] };

}

async function main() {

    const apply = process.argv.includes("--apply");

    if (!fs.existsSync(DIR)) {
        console.log("Теки з фото немає — нічого робити");
        return;
    }

    const files = fs.readdirSync(DIR)
        .filter(f => /\.webp$/i.test(f) && !/-(300|600|1200)\.webp$/i.test(f));

    const choice = adminChoice();

    const forced = Object.values(choice).filter(v => v === "white").length;
    const kept = Object.values(choice).filter(v => v === "keep").length;

    if (forced || kept) {
        console.log(`   рішення з адмінки: примусово ${forced}, лишити як є ${kept}`);
    }

    let touched = 0;
    const skipped = {};

    for (const file of files) {

        let result;

        try {
            result = await whiten(file, apply, choice);
        } catch (error) {
            skipped["не зчиталось"] = (skipped["не зчиталось"] || 0) + 1;
            continue;
        }

        if (result.skip) {
            skipped[result.skip] = (skipped[result.skip] || 0) + 1;
            continue;
        }

        touched++;

        if (touched <= 10) {
            console.log(`   ${file}: тло ${result.bg} → біле`
                + ` (${result.done || result.would}% кадру)`);
        }

    }

    if (touched > 10) console.log(`   … і ще ${touched - 10}`);

    Object.entries(skipped).forEach(([reason, n]) =>
        console.log(`   пропущено (${reason}): ${n}`));

    console.log(apply
        ? `Готово: тло вирівняно у ${touched} фото`
        : `Знайдено ${touched} фото з небілим тлом (запуск без --apply нічого не змінив)`);

}

main().catch(error => {
    console.error("Не вдалося вирівняти тло:", error);
    process.exit(1);
});
