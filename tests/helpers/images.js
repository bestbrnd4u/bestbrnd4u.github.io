// Розміри базових фото товарів — для перевірок пропорцій.
//
// НАВІЩО ВЛАСНИЙ ЧИТАЧ ЗАГОЛОВКА, А НЕ БІБЛІОТЕКА
// ------------------------------------------------
// Раніше кожен такий тест запускав python3 з Pillow через execSync.
// Локально працювало, але на раннері GitHub Actions Pillow не стоїть
// за замовчуванням: тест не «падав з поясненням», а валився винятком
// ще до першої перевірки — і причина розходження локального й CI
// результату була неочевидна.
//
// Розміри WebP лежать у перших 30 байтах файлу, декодувати картинку
// для цього не треба. Тож замість зовнішньої залежності — короткий
// розбір заголовка. Він синхронний, тож тести лишаються звичайними
// послідовними скриптами (sharp асинхронний і вимагав би переписувати
// їхню структуру).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const UPLOADS = path.join(ROOT, "assets/images/products/uploads");

// -300/-600/-1200 — зменшені копії зі своїми розмірами;
// пропорції перевіряємо на оригіналах
const VARIANT_RE = /-(300|600|1200)\.webp$/;

// Формат WebP — контейнер RIFF із одним із трьох видів вмісту.
// Розміри в кожного лежать по-своєму.
function webpSize(buffer) {

    if (buffer.toString("ascii", 0, 4) !== "RIFF"
        || buffer.toString("ascii", 8, 12) !== "WEBP") {
        throw new Error("не WebP");
    }

    const kind = buffer.toString("ascii", 12, 16);

    // VP8  — звичайне стиснення з втратами
    if (kind === "VP8 ") {
        return {
            width: buffer.readUInt16LE(26) & 0x3fff,
            height: buffer.readUInt16LE(28) & 0x3fff
        };
    }

    // VP8L — без втрат; розміри спаковані в 14 біт кожен
    if (kind === "VP8L") {
        const b = buffer.readUInt32LE(21);
        return {
            width: (b & 0x3fff) + 1,
            height: ((b >> 14) & 0x3fff) + 1
        };
    }

    // VP8X — розширений (анімація, прозорість); розміри як 24-бітні
    if (kind === "VP8X") {
        return {
            width: buffer.readUIntLE(24, 3) + 1,
            height: buffer.readUIntLE(27, 3) + 1
        };
    }

    throw new Error(`невідомий вид WebP: ${kind}`);

}

function baseImageSizes() {

    return fs.readdirSync(UPLOADS)
        .filter(f => f.endsWith(".webp") && !VARIANT_RE.test(f))
        .sort()
        .map(file => {

            const { width, height } = webpSize(fs.readFileSync(path.join(UPLOADS, file)));

            return { file, width, height, ratio: +(width / height).toFixed(3) };

        });

}

module.exports = { baseImageSizes, webpSize, UPLOADS };
