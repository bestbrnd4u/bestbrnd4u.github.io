// ======================================
// Автоматичний кадр для фото з завеликими полями
//
// ЩО ЦЕ ВИРІШУЄ
// --------------
// Предметні фото приходять від різних постачальників, і товар займає в
// кадрі хто скільки: у більшості 80–90%, а в частини — 27–35%. У
// каталозі це видно одразу: сусідні картки виглядають нерівно, ніби
// одну сумку зняли впритул, а іншу з іншого кінця кімнати.
//
// Замір на момент написання: із 232 базових фото 131 заповнює понад
// 80% кадру, 75 — від 60 до 80%, і 26 — менше 60%. Саме ці 26 і
// виглядають «дрібними».
//
// ЧОМУ НЕ ОБРІЗАЄМО САМІ ФАЙЛИ
// -----------------------------
// Обрізання оригіналу необоротне: якщо поріг колись виявиться
// невдалим або постачальник надішле фото з іншою композицією, назад
// уже не повернути. Тому рахуємо КАДР — ті самі zoom/x/y, які ставить
// віджет кадрування в адмінці. Файли лишаються недоторканими, а
// адміністратор може будь-коли поправити або скинути.
//
// ЧОГО ЦЕЙ СКРИПТ НЕ РОБИТЬ
// --------------------------
// Не чіпає кадр, виставлений руками. Якщо для фото вже є запис у
// framing — значить хтось так вирішив, і автоматика не має це
// перебивати. Свій вибір завжди важливіший за розрахунок.
// ======================================

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const PRODUCTS_DIR = path.join(ROOT, "data", "products");

// Скільки кадру має займати товар після кадрування.
//
// 82%, а не 100%: невелике поле навколо виглядає навмисним, а зріз по
// самому краю — недбалим. Це те саме значення, з яким працює кнопка
// «Підігнати по товару» в адмінці, щоб автоматика й ручна дія давали
// схожий результат.
const TARGET = 0.82;

// Нижче цього порога вважаємо, що поля справді завеликі. Фото, яке
// заповнює 70%, кадрувати не варто — різниця буде непомітна, а зайвий
// запис у даних лишиться.
const NEEDS_FIT = 0.6;

// Стільник із віджета: за 3× показується надто малий шматок
// оригіналу, і картинка стає мʼякою.
const MAX_ZOOM = 3;

// Межі товару на фото — частки від розміру кадру.
//
// Логіка та сама, що в admin/image-framing-widget.js → contentBounds:
// шукаємо межі НЕбілих і непрозорих пікселів. Тримати два різні
// визначення «де тут товар» означало б, що автоматика й кнопка в
// адмінці дають різні кадри для одного знімка.
async function contentBounds(file) {

    const meta = await sharp(file).metadata();

    // 200px по довшій стороні досить, щоб знайти межі, і в рази
    // швидше за повний розмір
    const max = 200;
    const scale = Math.min(1, max / Math.max(meta.width, meta.height));

    const w = Math.max(1, Math.round(meta.width * scale));
    const h = Math.max(1, Math.round(meta.height * scale));

    const data = await sharp(file).resize(w, h).ensureAlpha().raw().toBuffer();

    // Колір тла беремо З КУТІВ, а не з зашитого числа.
    //
    // Тут стояв поріг 244 — «світліше значить біле тло». Але предметні
    // фото знімають не тільки на білому: у частини товарів тло
    // 240/240/240, світло-сіре. Поріг його не визнавав, «не-фоном»
    // виявлявся весь кадр, і підгонка відмовлялась працювати.
    //
    // Логіка мусить бути та сама, що у віджеті адмінки
    // (admin/image-framing-widget.js): інакше кнопка «Підігнати» й
    // автоматика дадуть різні кадри для одного знімка.
    const at = (x, y) => {

        const i = (y * w + x) * 4;

        return [data[i], data[i + 1], data[i + 2]];

    };

    const corners = [at(1, 1), at(w - 2, 1), at(1, h - 2), at(w - 2, h - 2)];

    const bg = [0, 1, 2].map(c =>
        Math.round(corners.reduce((sum, p) => sum + p[c], 0) / corners.length));

    // Кути мусять бути схожі: інакше тло неоднорідне, і межі товару
    // по кольору не знайти.
    const spread = Math.max(...corners.map(p =>
        Math.max(...[0, 1, 2].map(c => Math.abs(p[c] - bg[c])))));

    if (spread > 24) return null;

    const TOLERANCE = 12;

    const isBackground = (x, y) => {

        const i = (y * w + x) * 4;

        if (data[i + 3] < 16) return true;   // прозорий — теж тло

        return Math.abs(data[i] - bg[0]) <= TOLERANCE
            && Math.abs(data[i + 1] - bg[1]) <= TOLERANCE
            && Math.abs(data[i + 2] - bg[2]) <= TOLERANCE;

    };

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < h; y++) {

        for (let x = 0; x < w; x++) {

            if (isBackground(x, y)) continue;

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

        }

    }

    if (maxX < 0) return null;   // фото цілком біле

    return {
        w: (maxX - minX + 1) / w,
        h: (maxY - minY + 1) / h,
        cx: (minX + maxX + 1) / 2 / w,
        cy: (minY + maxY + 1) / 2 / h
    };

}

function frameFor(bounds) {

    const fill = Math.max(bounds.w, bounds.h);

    if (fill >= NEEDS_FIT) return null;

    const zoom = Math.min(MAX_ZOOM, Math.round(TARGET / fill * 100) / 100);

    if (zoom <= 1.05) return null;

    return {
        zoom: zoom,
        x: Math.round(bounds.cx * 100),
        y: Math.round(bounds.cy * 100)
    };

}

function imageKey(src) {
    return String(src || "").split("?")[0].split("#")[0].split("/").pop();
}

async function main() {

    const apply = process.argv.includes("--apply");

    const files = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith(".json"));

    let touched = 0;
    let framed = 0;
    const report = [];

    for (const file of files) {

        const full = path.join(PRODUCTS_DIR, file);
        const data = JSON.parse(fs.readFileSync(full, "utf8"));

        const framing = data.framing && typeof data.framing === "object"
            ? data.framing
            : {};

        let changed = false;

        const sources = [
            ...(data.images || []),
            ...(data.variants || []).flatMap(v => (v && v.images) || [])
        ];

        for (const src of [...new Set(sources)]) {

            const key = imageKey(src);

            // Кадр уже є — не перебиваємо: свій вибір важливіший.
            if (framing[key]) continue;

            const onDisk = path.join(ROOT, String(src).split("?")[0].replace(/^\//, ""));

            if (!fs.existsSync(onDisk)) continue;

            let bounds;

            try {
                bounds = await contentBounds(onDisk);
            } catch (error) {
                continue;   // не зчиталось — просто лишаємо без кадру
            }

            if (!bounds) continue;

            const frame = frameFor(bounds);

            if (!frame) continue;

            framing[key] = frame;
            changed = true;
            framed++;

            report.push(`${key}: ${Math.round(Math.max(bounds.w, bounds.h) * 100)}%`
                + ` → ${frame.zoom}×`);

        }

        if (!changed) continue;

        touched++;

        if (apply) {
            data.framing = framing;
            fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
        }

    }

    report.slice(0, 12).forEach(line => console.log("   " + line));

    if (report.length > 12) console.log(`   … і ще ${report.length - 12}`);

    console.log(apply
        ? `Готово: кадр розраховано для ${framed} фото у ${touched} товарах`
        : `Знайдено ${framed} фото з завеликими полями у ${touched} товарах`
          + " (запуск без --apply нічого не змінив)");

}

main().catch(error => {
    console.error("Не вдалося розрахувати кадри:", error);
    process.exit(1);
});
