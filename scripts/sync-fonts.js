// Тримає підключення шрифту однаковим на всіх сторінках.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Шрифт підключався ДВІЧІ й по-різному:
//
//   1. <link> у <head> — на 48 сторінках, ваги 300-800;
//   2. @import у першому рядку assets/css/style.css — на всіх.
//
// @import усередині CSS — найгірше місце для шрифту. Браузер не бачить
// його, поки не завантажить і не розбере саму таблицю стилів, тож
// виходить ланцюжок із трьох послідовних запитів:
//
//   HTML → style.css → fonts.googleapis.com/css2 → woff2
//
// А <link> у розмітці браузер бачить одразу й тягне паралельно зі
// стилями. Заміряно: <link> був лише на 48 сторінках зі 149, які
// вантажать style.css. Решта 101 — це УСІ сторінки товарів, тобто
// саме ті, куди люди приходять із пошуку.
//
// Плюс на тих 48 шрифт замовлявся двічі: 91 оголошене начертання
// замість ~45, і два запити замість одного.
//
// ЩО ТЕПЕР
// ---------
// Один блок, той самий на кожній сторінці, ПЕРЕД style.css. @import
// із CSS прибрано (за цим стежить tests/test-fonts.js).
//
// ВАГИ. Рівно ті, що вживає CSS: 400, 500, 600, 700, 800, 900.
// Ваги 300 у стилях немає ніде — вона замовлялась і не
// використовувалась. Кожна зайва вага це окремий файл на кожен
// потрібний набір символів (латиниця + кирилиця).
//
// ЗАПУСК
//   node scripts/sync-fonts.js              розкласти по сторінках
//   node scripts/sync-fonts.js --check      лише перевірити, не писати

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const CHECK = process.argv.includes("--check");

// Ваги, які справді вживаються в assets/css/style.css.
const WEIGHTS = [400, 500, 600, 700, 800, 900];

const FONT_URL = "https://fonts.googleapis.com/css2?family=Inter:wght@"
    + WEIGHTS.join(";") + "&display=swap";

// Позначка, за якою знаходимо власний блок при повторному запуску.
const MARK = "Шрифт. Тут, а не @import";

// preconnect до обох хостів: css2 віддає googleapis, а самі файли
// шрифту — gstatic. Без другого браузер витрачає час на з'єднання
// з ним уже після розбору CSS.
function block(indent) {

    return [
        `${indent}<!-- ${MARK} у CSS: @import видно лише після`,
        `${indent}     завантаження таблиці стилів, і текст чекає на три запити`,
        `${indent}     поспіль. Розкладає scripts/sync-fonts.js — правити руками`,
        `${indent}     не треба. -->`,
        `${indent}<link rel="preconnect" href="https://fonts.googleapis.com">`,
        `${indent}<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
        `${indent}<link rel="stylesheet" href="${FONT_URL}">`
    ].join("\n");

}

function htmlFiles(dir, found) {

    const list = found || [];

    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

        if (entry.name === "node_modules" || entry.name === ".git"
            || entry.name === ".claude") return;

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) htmlFiles(full, list);
        else if (entry.name.endsWith(".html")) list.push(full);

    });

    return list;

}

// Усі теги <link> сторінки. [^>] ловить і переноси рядків: у розмітці
// трапляється тег, розтягнутий на два рядки.
const LINK_RE = /<link\b[^>]*>/g;

const FONT_HOST_RE = /fonts\.(googleapis|gstatic)\.com/;

// Тег, який підключає стилі сайту. Шлях буває і відносним
// (assets/css/…), і абсолютним (/assets/css/…) — сторінки в теках
// генеруються з <base href="/">.
const STYLE_RE = /([ \t]*)<link\b[^>]*assets\/css\/style\.css[^>]*>/;

// Наш блок цілком: від коментаря до посилання на css2 включно.
//
// Прибираємо його ОДНИМ куском, а не по тегах: інакше після видалення
// трьох окремих <link> лишається різна кількість порожніх рядків, і
// другий прохід дає інший файл, ніж перший.
//
// Переносів прибираємо стільки ж, скільки ставимо при вставці (два):
// інакше кожен прохід додавав би перед блоком ще один порожній рядок.
const OWN_BLOCK_RE = new RegExp(
    `[ \\t]*<!-- ${MARK}[\\s\\S]*?fonts\\.googleapis\\.com\\/css2[^>]*>[ \\t]*(?:\\r?\\n){0,2}`,
    "g"
);

// Літерал → безпечний для регулярки шматок.
//
// Заміну робимо ФУНКЦІЄЮ: у тегах трапляється $, а String.replace
// читає його як посилання на групу збігу й тихо підставляє не те.
function escapeForRegExp(text) {

    return text.replace(/[.*+?^${}()|[\]\\]/g, match => `\\${match}`);

}

function syncPage(html) {

    // Сторінка не вантажить стилі сайту (адмінка, службові) — шрифт
    // їй теж не потрібен.
    if (!STYLE_RE.test(html)) return html;

    // 1. Свій блок — одним куском.
    let out = html.replace(OWN_BLOCK_RE, "");

    // 2. Чужі теги шрифту, поставлені руками де завгодно.
    //
    // Прибираємо тег РАЗОМ із відступом і переносом, тобто цілим
    // рядком. Інакше після нього лишається порожній рядок, який
    // довелось би «схлопувати» — а порожні рядки ставить і генератор
    // сторінок товару, тож крок почав би переписувати сторінку одразу
    // після її генерації (це ловить перевірка ідемпотентності в
    // tests/test-static-product-pages.js).
    //
    // Чуже форматування не чіпаємо взагалі.
    (out.match(LINK_RE) || [])
        .filter(tag => FONT_HOST_RE.test(tag))
        .forEach(tag => {

            const re = new RegExp(`[ \\t]*${escapeForRegExp(tag)}[ \\t]*\\r?\\n?`, "g");

            out = out.replace(re, "");

        });

    // 3. Ставимо блок ПЕРЕД стилями.
    const style = out.match(STYLE_RE);

    if (!style) return html;

    const indent = style[1] || "";

    return out.replace(STYLE_RE, () => `${block(indent)}\n\n${style[0]}`);

}

function main() {

    const pages = htmlFiles(ROOT);

    let changed = 0;
    let touched = 0;
    const pending = [];

    pages.forEach(file => {

        const source = fs.readFileSync(file, "utf8");

        if (!STYLE_RE.test(source)) return;

        touched++;

        const next = syncPage(source);

        if (next === source) return;

        changed++;
        pending.push(path.relative(ROOT, file));

        if (!CHECK) fs.writeFileSync(file, next, "utf8");

    });

    if (CHECK) {

        if (changed) {
            console.log(`Шрифт розійшовся на ${changed} сторінках із ${touched}:`);
            pending.slice(0, 10).forEach(rel => console.log(`   • ${rel}`));
            process.exit(1);
        }

        console.log(`Готово: шрифт однаковий на всіх ${touched} сторінках`);

        return;

    }

    console.log(changed
        ? `Готово: шрифт проставлено на ${changed} сторінках (усього зі стилями: ${touched})`
        : `Готово: шрифт уже однаковий на всіх ${touched} сторінках`);

}

if (require.main === module) main();

module.exports = { FONT_URL, WEIGHTS, MARK, block, syncPage };
