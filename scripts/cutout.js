// ======================================
// Вирізання товару й перенесення на біле
//
// НАВІЩО ЦЕ ОКРЕМО ВІД ЗАЛИВКИ
// -----------------------------
// scripts/whiten-backgrounds.js замінює фон, який УЖЕ однотонний:
// іде від країв кадру й зупиняється на першому пікселі товару. Це
// точно до пікселя — ланцюжок, тонкий ремінець і бахрома лишаються
// такими, як були, — але працює лише там, де фон рівний. Знімок на
// дерев'яному столі, на мармурі чи з градієнтом вона чесно пропускає.
//
// Тут інший інструмент: нейромережа U²-Net розмічає, де товар, а де
// все інше. Їй байдуже, що саме позаду.
//
// ЧИМ ЗА ЦЕ ПЛАТИМО
// ------------------
// 1. Зникає ТІНЬ. Для мережі тінь — не товар, і сумка починає «висіти
//    в повітрі». На предметних фото з рівним фоном заливка дає кращий
//    результат саме тому, що тінь лишає.
// 2. Тонкі деталі тримаються гірше. На перевірених фото ланцюжок і
//    ремінець уціліли, але гарантії пікселя, як у заливці, тут немає.
//
// Тому вирізання НЕ автоматичне: його вмикають на конкретне фото
// кнопкою в адмінці («Вирізати товар»). Автоматика, як і раніше, або
// вирівнює однотонний фон, або не чіпає нічого.
//
// ЧОМУ МОДЕЛЬ ЛЕЖИТЬ У РЕПОЗИТОРІЇ
// ---------------------------------
// u2netp.onnx — 4,5 МБ, полегшена версія U²-Net (Apache-2.0). Качати
// її під час збірки означало б залежати від чужого сервера в момент,
// коли магазин публікує товар. Файл у репозиторії робить збірку
// самодостатньою.
//
// onnxruntime важкий (близько 300 МБ разом із бінарниками), тому
// підключається ЛИШЕ коли є що вирізати — див. lazy-require нижче.
// ======================================

const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const MODEL = path.join(__dirname, "models", "u2netp.onnx");

// Розмір входу мережі. Фіксований: модель навчена саме на 320×320.
const SIZE = 320;

// Нормалізація, з якою навчали U²-Net (ImageNet). Інші числа дадуть
// іншу — гіршу — маску.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let session = null;
let unavailable = null;

// Модель вантажимо один раз на весь запуск: ініціалізація коштує
// секунди, а фото зазвичай кілька.
async function getSession() {

    if (session) return session;
    if (unavailable) throw new Error(unavailable);

    if (!fs.existsSync(MODEL)) {
        unavailable = `немає файлу моделі ${path.relative(process.cwd(), MODEL)}`;
        throw new Error(unavailable);
    }

    let ort;

    try {
        ort = require("onnxruntime-node");
    } catch (error) {
        unavailable = "не встановлено onnxruntime-node (npm install)";
        throw new Error(unavailable);
    }

    session = await ort.InferenceSession.create(MODEL);
    session.__ort = ort;

    return session;

}

/**
 * Маска товару: 0 — фон, 255 — товар. Розмір як в оригіналу.
 */
async function productMask(file, width, height) {

    const s = await getSession();
    const ort = s.__ort;

    const small = await sharp(file)
        .resize(SIZE, SIZE, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer();

    const input = new Float32Array(3 * SIZE * SIZE);

    for (let p = 0; p < SIZE * SIZE; p++) {
        for (let c = 0; c < 3; c++) {
            input[c * SIZE * SIZE + p] = (small[p * 3 + c] / 255 - MEAN[c]) / STD[c];
        }
    }

    const out = await s.run({
        [s.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE])
    });

    // У U²-Net сім виходів — це проміжні рівні. Робочий перший.
    const raw = out[s.outputNames[0]].data;

    let min = Infinity;
    let max = -Infinity;

    for (const v of raw) {
        if (v < min) min = v;
        if (v > max) max = v;
    }

    const mask = Buffer.alloc(SIZE * SIZE);

    for (let i = 0; i < SIZE * SIZE; i++) {
        mask[i] = Math.round(((raw[i] - min) / (max - min || 1)) * 255);
    }

    // Розтягуємо маску до розміру фото й трохи розмиваємо: без цього
    // край товару виходить сходинками 320-піксельної сітки.
    //
    // Читаємо з урахуванням каналів: sharp після resize/blur віддає
    // сіру маску трьома каналами, і наївне mask[p] брало б кожен третій
    // байт — тобто зовсім не те. На цьому прототип спершу й видав
    // порожній білий кадр.
    const grown = await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: 1 } })
        .resize(width, height, { fit: "fill" })
        .blur(1.2)
        .raw()
        .toBuffer({ resolveWithObject: true });

    return { data: grown.data, stride: grown.info.channels };

}

/**
 * Вирізає товар і кладе на біле.
 *
 * @returns {Promise<{data: Buffer, width: number, height: number, share: number}>}
 *          share — яку частку кадру займає товар.
 */
async function cutoutToWhite(file) {

    const meta = await sharp(file).metadata();

    const width = meta.width;
    const height = meta.height;

    const mask = await productMask(file, width, height);

    const rgb = await sharp(file).removeAlpha().raw().toBuffer();

    const out = Buffer.alloc(width * height * 3);

    let sum = 0;

    for (let p = 0; p < width * height; p++) {

        const a = mask.data[p * mask.stride] / 255;

        sum += a;

        for (let c = 0; c < 3; c++) {
            out[p * 3 + c] = Math.round(rgb[p * 3 + c] * a + 255 * (1 - a));
        }

    }

    return { data: out, width: width, height: height, share: sum / (width * height) };

}

module.exports = { cutoutToWhite, productMask, MODEL };
