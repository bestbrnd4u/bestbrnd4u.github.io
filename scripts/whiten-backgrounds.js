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
// ЧОГО НЕ РОБИТЬ АВТОМАТИКА
// --------------------------
// Сама вона не намагається відокремити товар від складного фону.
// Помилка тут коштує дорого: з'їдений край сумки не повернеш, оригінал
// уже перезаписаний.
//
// Для таких знімків є ОКРЕМИЙ інструмент — вирізання нейромережею
// (scripts/cutout.js). Він вмикається вручну, кнопкою «Вирізати товар»
// в адмінці, і ніколи не спрацьовує сам.
//
// Тому три запобіжники:
//
//   1. Тільки НЕбіле тло. Якщо тло вже 250+, чіпати нічого — 275 фото
//      з 368 просто пропускаються.
//
//   2. Тільки ОДНОРІДНИЙ фон. Периметр кадру мусить складатись із
//      кількох рівних кольорів; градієнт чи зйомка в інтерʼєрі — не
//      наш випадок.
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
// вирізання товару нейромережею — підключається лише за потреби
// (див. коментар у файлі: onnxruntime важкий)
const cutout = require("./cutout");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "assets/images/products/uploads");
const BACKUP = path.join(ROOT, "assets/images/_originals");

// Тло, світліше за це, вважаємо вже білим — не чіпаємо.
const ALREADY_WHITE = 250;

// Допуск навколо кольору тла. Той самий, що у віджеті кадрування:
// тіні й компресія дають відхилення на кілька одиниць.
const TOLERANCE = 14;

// Наскільки рівною має бути замкнена область, щоб вважатись фоном.
// Фон однорідний; шкіра, тканина й підкладка мають фактуру.
const MAX_VARIANCE = 3;

// Темніше за це — не фон, а предмет, який торкнувся краю кадру.
// Пояснення й замір — у borderColors нижче.
const DARK_BACKGROUND = 140;

// Яку частку сторони кадру може займати товар, щоб фото ще вважалось
// предметним. Більше — знімок обрізаний рамкою (модель, макро).
const EDGE_SHARE = 0.05;

// Скільки темного заливці дозволено зафарбувати. Понад це — вона
// вийшла за межі фону: світлий фон не буває темним.
const MAX_DARK_PAINTED = 0.005;

function isBackground(data, i, colors) {

    for (const bg of colors) {

        if (Math.abs(data[i] - bg[0]) <= TOLERANCE
            && Math.abs(data[i + 1] - bg[1]) <= TOLERANCE
            && Math.abs(data[i + 2] - bg[2]) <= TOLERANCE) return true;

    }

    return false;

}

// Кольори фону — з УСІЄЇ рамки кадру, а не з чотирьох кутів.
//
// ЩО БУЛО НЕ ТАК (знайдено на живому каталозі)
// ---------------------------------------------
// Кути брались як єдине джерело правди. Але перед цим кроком фото
// проходить normalize-product-images.js, який вписує знімок у полотно
// 4:5 і добиває поля БІЛИМ. У кадрі 1200×1500 виходить так:
//
//   кути                255,255,255   ← добивка, якої в оригіналі не було
//   фон самого знімка   240,240,240   ← справжнє тло, 63% кадру
//
// Далі все складалось одне до одного:
//
//   1. «Тло вже біле» — 255 у кутах, отже чіпати нічого. Фото
//      пропускалось, хоча дві третини кадру сірі;
//   2. навіть примусово («Зробити білим» в адмінці) заливка стартувала
//      в білій добивці, розтікалась по ній і зупинялась на межі
//      255→240: різниця 15, а допуск 14. Рівно на одиницю.
//
// Тобто кнопка була, натискалась — і не робила нічого. Тепер кольори
// збираємо по всьому периметру: там і біла добивка, і сірий фон.
//
// Випадкові кольори (товар торкнувся краю кадру) відсіюємо за часткою
// периметра: фон займає його помітну частину, край сумки — ні.
function borderColors(data, w, h) {

    const groups = [];

    const add = (x, y) => {

        const i = (y * w + x) * 4;

        if (data[i + 3] < 16) return;   // прозорий — не колір

        for (const g of groups) {

            if (Math.abs(g.c[0] - data[i]) <= TOLERANCE
                && Math.abs(g.c[1] - data[i + 1]) <= TOLERANCE
                && Math.abs(g.c[2] - data[i + 2]) <= TOLERANCE) { g.n++; return; }

        }

        groups.push({ c: [data[i], data[i + 1], data[i + 2]], n: 1 });

    };

    const step = Math.max(1, Math.round(Math.min(w, h) / 100));

    for (let x = 0; x < w; x += step) { add(x, 0); add(x, h - 1); }
    for (let y = 0; y < h; y += step) { add(0, y); add(w - 1, y); }

    const total = groups.reduce((sum, g) => sum + g.n, 0) || 1;

    const kept = groups
        .filter(g => g.n / total >= 0.05)
        .sort((a, b) => b.n - a.n);

    // ТЕМНЕ НА ПЕРИМЕТРІ — ЦЕ НЕ ФОН
    //
    // ЩО БУЛО НЕ ТАК. Модель у чорній сукні стоїть так, що сукня
    // торкається краю кадру. Її колір набирає більше за 5% периметра,
    // потрапляє в цей список — і заливка, яка приймає БУДЬ-ЯКИЙ колір
    // зі списку, спокійно розтікається по всій сукні. Замір на
    // бойовому файлі:
    //
    //     rtlafd950301_33526729_9_v1_2x.webp
    //       255,255,255 (67%)   біла добивка до 4:5
    //       234,234,234 (29%)   справжній фон знімка
    //        21,22,26   (5%)    ЧОРНА СУКНЯ ← і її залило білим
    //
    // Від моделі лишилась половина. Те саме сталося ще з чотирма фото.
    //
    // Тому темні кольори з фону викидаємо. Це не евристика, а зміст
    // самої задачі: скрипт ВИРІВНЮЄ світлий фон до білого. Темний
    // колір не можна «дорівняти» до білого — його можна тільки стерти,
    // а стирати ми нічого не збирались.
    const light = kept.filter(g => Math.min(g.c[0], g.c[1], g.c[2]) >= DARK_BACKGROUND);

    // Покриття рахуємо ПО СВІТЛИХ. Інакше темна пляма на периметрі ще
    // й підвищувала б однорідність — тобто сама себе пропускала.
    return {
        colors: light.map(g => g.c),
        coverage: light.reduce((sum, g) => sum + g.n, 0) / total
    };

}

// Чи впирається товар у межу кадру.
//
// НАВІЩО. Предметне фото — це товар УСЕРЕДИНІ кадру, з фоном навколо.
// Якщо ж кадр обрізає знімок (модель по пояс, макрозйомка нутрощів
// сумки), то товар виходить за межу, а заливка йде вздовж нього
// всередину й з'їдає його.
//
// Замір по 125 оброблених фото: серед тих, де товар займає більше 5%
// якоїсь сторони кадру, зіпсованими виявились фото на моделях
// (ch857_*, 1117wx*-model4, 25077124~black_3) і макрозйомка
// (p00545136_d1) — тобто саме ті, які ця перевірка й відкидає.
//
// Ціна помилки несиметрична: пропущене фото просто лишається з тим
// фоном, який мало досі, а зіпсоване — це стерта модель.
function subjectRunsOffFrame(data, w, h, colors) {

    const isBg = i => colors.some(c =>
        Math.abs(data[i] - c[0]) <= TOLERANCE
        && Math.abs(data[i + 1] - c[1]) <= TOLERANCE
        && Math.abs(data[i + 2] - c[2]) <= TOLERANCE);

    // Смуга в 1% від меншої сторони, а не один піксель: край знімка
    // майже завжди має шум компресії.
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.01));

    let top = 0, bottom = 0, left = 0, right = 0;

    for (let x = 0; x < w; x++) {
        for (let d = 0; d < band; d++) {
            if (!isBg((d * w + x) * 4)) top++;
            if (!isBg(((h - 1 - d) * w + x) * 4)) bottom++;
        }
    }

    for (let y = 0; y < h; y++) {
        for (let d = 0; d < band; d++) {
            if (!isBg((y * w + d) * 4)) left++;
            if (!isBg((y * w + (w - 1 - d)) * 4)) right++;
        }
    }

    return Math.max(top / (w * band), bottom / (w * band),
        left / (h * band), right / (h * band)) > EDGE_SHARE;

}

// Замкнені кишені фону.
//
// Заливка від країв не дістає туди, куди немає шляху ззовні: усередині
// петлі ремня, під ручкою, у прорізі. На білій картці такий сірий
// острівець помітний одразу — саме його й видно було на сумці Coach.
//
// Тому другим кроком беремо зв'язні області, які лишились: якщо
// область збігається з фоном за кольором І однорідна, це фон, до якого
// просто не було ходу.
//
// Однорідність — той самий запобіжник, що й скрізь у цьому файлі: без
// нього світла підкладка всередині сумки, яка випадково збіглась із
// фоном, стала б білою дірою. Фон рівний, підкладка має фактуру.
function fillPockets(data, w, h, colors, visited) {

    let painted = 0;

    for (let start = 0; start < w * h; start++) {

        if (visited[start] || !isBackground(data, start * 4, colors)) continue;

        const cells = [];
        const queue = [start];

        visited[start] = 1;

        let sum = 0;
        let sum2 = 0;

        while (queue.length) {

            const p = queue.pop();
            const i = p * 4;

            cells.push(p);

            const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;

            sum += lum;
            sum2 += lum * lum;

            const x = p % w;
            const y = (p - x) / w;

            [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {

                if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;

                const q = ny * w + nx;

                if (visited[q] || !isBackground(data, q * 4, colors)) return;

                visited[q] = 1;
                queue.push(q);

            });

        }

        const mean = sum / cells.length;
        const variance = Math.sqrt(Math.max(0, sum2 / cells.length - mean * mean));

        if (variance > MAX_VARIANCE) continue;

        cells.forEach(p => {
            const i = p * 4;
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
        });

        painted += cells.length;

    }

    return painted;

}

// Заливка від країв усередину.
//
// Класичний обхід у ширину зі стартом на рамці кадру. Пікселі товару
// не зачіпаються, навіть якщо їхній колір збігається з тлом: до них
// просто не дійде черга, бо шлях перекритий самим товаром.
function fillFromEdges(data, w, h, colors, visited) {

    const queue = [];

    const push = (x, y) => {

        if (x < 0 || y < 0 || x >= w || y >= h) return;

        const p = y * w + x;

        if (visited[p]) return;

        const i = p * 4;

        if (data[i + 3] < 16) { visited[p] = 1; return; }   // прозорий — уже тло

        if (!isBackground(data, i, colors)) return;

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

            if (bg === "white" || bg === "keep" || bg === "cutout") choice[name] = bg;

        });

    });

    return choice;

}

async function whiten(file, apply, choice) {

    const full = path.join(DIR, file);

    // Читаємо файл У ПАМʼЯТЬ, а не даємо sharp шлях.
    //
    // ЧОМУ. sharp(шлях) тримає файл відкритим, поки не завершиться
    // конвеєр. На Windows це означає, що перейменувати новий файл
    // поверх старого не можна: rename падає, поруч лишається .webp.tmp,
    // а сам знімок так і не оновлюється. Саме так з 103 фото
    // обробилось 17, а 86 .tmp осіли в теці.
    //
    // У CI (Linux) rename поверх відкритого файлу проходить, тож
    // помилки там не видно взагалі — вона чекала б на першого, хто
    // запустить `npm run build:media` у себе.
    const image = sharp(fs.readFileSync(full));
    const meta = await image.metadata();

    const { data, info } = await image.ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;

    const { colors, coverage } = borderColors(data, w, h);

    const decided = choice ? choice[file] : null;

    // «Не чіпати» з адмінки сильніше за автоматику.
    if (decided === "keep") return { skip: "адмін лишив як є" };

    // «Вирізати» — інший інструмент, не заливка.
    //
    // Заливка вміє лише однотонний фон: іде від країв і зупиняється на
    // товарі. Знімок на столі чи з градієнтом вона чесно пропускає, і
    // саме для таких випадків тут нейромережа (див. scripts/cutout.js).
    //
    // Вмикається ЛИШЕ вручну: тінь вона з'їдає, а на предметних фото з
    // рівним фоном заливка дає кращий результат.
    if (decided === "cutout") {

        try {

            const cut = await cutout.cutoutToWhite(full);

            // Той самий запобіжник, що й для заливки, тільки навпаки:
            // якщо «товару» лишилось менше відсотка, маска порожня —
            // зберігати такий кадр означало б стерти фото.
            if (cut.share < 0.01) return { skip: "маска порожня — товар не знайдено" };

            if (!apply) return { would: Math.round(cut.share * 100), bg: null, cut: true };

            fs.mkdirSync(BACKUP, { recursive: true });

            const backup = path.join(BACKUP, file);

            if (!fs.existsSync(backup)) fs.copyFileSync(full, backup);

            await sharp(cut.data, {
                raw: { width: cut.width, height: cut.height, channels: 3 }
            }).webp({ quality: 88 }).toFile(full);

            return { done: Math.round(cut.share * 100), bg: null, cut: true };

        } catch (error) {

            // Немає onnxruntime чи моделі — фото просто лишається як є.
            // Валити всю збірку через один знімок не варто.
            return { skip: `вирізання недоступне: ${error.message}` };

        }

    }

    // Запобіжник 2: фон неоднорідний.
    //
    // Раніше це перевірялось за розкидом чотирьох кутів. Кути виявились
    // ненадійним джерелом: після приведення до 4:5 вони показують білу
    // добивку, а не фон знімка (див. borderColors вище).
    //
    // Тепер питаємо інакше: чи складається периметр із кількох рівних
    // кольорів? На предметному фото так — фон і, можливо, добивка. На
    // фото в інтерʼєрі чи на моделі периметр строкатий, жоден колір не
    // набирає помітної частки, і покриття виходить низьким.
    //
    // Цей запобіжник не обходиться навіть примусово: там «фоном»
    // слугує сам знімок, і заливка зʼїла б половину кадру.
    if (!colors.length || coverage < 0.9) return { skip: "фон неоднорідний" };

    // Запобіжник 1: фон уже білий. Його адмін МОЖЕ обійти — буває, що
    // фон 250 і виглядає сірим поруч із чисто білою карткою.
    const allWhite = colors.every(c => Math.min(c[0], c[1], c[2]) >= ALREADY_WHITE);

    if (allWhite && decided !== "white") {
        return { skip: "фон уже білий" };
    }

    // Запобіжник 3: кадр обрізає товар — це не предметне фото.
    //
    // Модель по пояс або макрозйомка нутрощів сумки: товар виходить за
    // межу кадру, заливка йде вздовж нього всередину й з'їдає його.
    // Цей запобіжник теж не обходиться примусово — саме він рятує
    // фото на моделях.
    if (subjectRunsOffFrame(data, w, h, colors)) {
        return { skip: "кадр обрізає товар — не предметне фото" };
    }

    // Запобіжник 4: заливка від країв.
    //
    // Копію робимо, щоб потім спитати, ЯКИМИ були зафарбовані пікселі:
    // заливка міняє data на місці, і без копії відповіді вже не буде.
    const before = Buffer.from(data);

    const visited = new Uint8Array(w * h);

    const painted = fillFromEdges(data, w, h, colors, visited)
        + fillPockets(data, w, h, colors, visited);

    const share = painted / (w * h);

    // Якщо «тлом» виявилось майже все фото — щось не так із
    // визначенням, і зберігати такий результат небезпечно.
    if (share > 0.97) return { skip: "залито майже весь кадр" };

    // Запобіжник 5: перевірка постфактум — що саме залилось.
    //
    // Попередні запобіжники дивляться на фото ДО заливки й можуть
    // помилитись. Цей питає про результат: світлий фон не буває
    // темним, тож якщо серед зафарбованого є помітно темні пікселі —
    // заливка вийшла за межі фону й з'їла товар.
    //
    // Замір по 125 фото: цей поріг перетнули рівно ті шість, де
    // видимо постраждав знімок.
    let dark = 0;

    for (let p = 0; p < w * h; p++) {

        const i = p * 4;

        // зафарбоване — те, що стало білим, а таким не було
        if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) continue;
        if (before[i] === 255 && before[i + 1] === 255 && before[i + 2] === 255) continue;

        if (Math.min(before[i], before[i + 1], before[i + 2]) < DARK_BACKGROUND + 10) dark++;

    }

    if (painted && dark / painted > MAX_DARK_PAINTED) {
        return { skip: `заливка зачепила товар (${(dark / painted * 100).toFixed(1)}% темного)` };
    }

    if (!apply) return { would: Math.round(share * 100), bg: (colors.find(c => Math.min(c[0], c[1], c[2]) < ALREADY_WHITE) || colors[0])[0] };

    fs.mkdirSync(BACKUP, { recursive: true });

    const backup = path.join(BACKUP, file);

    // Копію робимо лише раз: повторний запуск не має затирати
    // справжній оригінал уже обробленою версією.
    if (!fs.existsSync(backup)) fs.copyFileSync(full, backup);

    await sharp(data, { raw: { width: w, height: h, channels: 4 } })
        .webp({ quality: 88 })
        .toFile(full + ".tmp");

    fs.renameSync(full + ".tmp", full);

    return { done: Math.round(share * 100), bg: (colors.find(c => Math.min(c[0], c[1], c[2]) < ALREADY_WHITE) || colors[0])[0] };

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
