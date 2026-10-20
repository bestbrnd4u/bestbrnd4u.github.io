// Сезонне оформлення: проставляє сторінкам data-season.
//
// ЩО ЦЕ ТАКЕ
// -----------
// У адмінці є один перемикач — «Оформлення сайту». Вибрали «Зима» →
// коміт у data/season.json → збірка проставляє <html data-season="winter">
// кожній сторінці → у style.css оживає блок :root[data-season="winter"],
// який перевизначає кілька кольорових змінних. Повернули «Звичайне» —
// атрибут стає "standard", блока для нього немає, і сайт виглядає
// рівно як зараз.
//
// ЧОМУ АТРИБУТ СТАВИТЬ ЗБІРКА, А НЕ СКРИПТ У БРАУЗЕРІ
// ----------------------------------------------------
// Бо інакше сторінка спершу намалювалась би у звичайних кольорах і
// лише потім перефарбувалась — на повільному звʼязку це помітне
// блимання, і саме про нього власник уже писав. Плюс data/*.json край
// Cloudflare не кешує (перевірено, усі 12 — DYNAMIC), тобто довелось
// би додати ще один блокувальний запит до кожного показу сторінки.
//
// Атрибут у розмітці не коштує нічого: ні запиту, ні кадру, ні рядка
// JavaScript. І працює навіть там, де скрипти не виконуються.
//
// ЧОМУ "standard" ПИШЕТЬСЯ ЯВНО
// ------------------------------
// Можна було б не ставити атрибут узагалі, поки сезон звичайний. Але
// тоді «сторінка без атрибута» означає одночасно і «звичайне
// оформлення», і «крок забув цю сторінку» — а це рівно та помилка,
// через яку тут уже тричі зникали штампи версій. Явне значення робить
// забування видимим: tests/test-season.js перевіряє, що атрибут несе
// КОЖНА сторінка.
const fs = require("fs");
const path = require("path");

// Обхід сторінок — спільний із apply-cache-version.js. Другий власний
// обхід означав би другу копію знання «де лежать сторінки», і вона
// розійшлася б із першою на новій теці.
const { htmlFiles } = require("./apply-cache-version.js");

const ROOT = path.join(__dirname, "..");

const FILE = path.join(ROOT, "data", "season.json");

// Перелік сезонів живе ТУТ, і admin/config.yml мусить пропонувати
// рівно їх. Розійдуться — власник обере в адмінці сезон, якого збірка
// не знає, і сайт лишиться у звичайному вигляді без жодної скарги.
// За збігом стежить tests/test-season.js.
const SEASONS = ["standard", "winter", "spring", "summer", "autumn"];

function readSeason() {

    try {

        const data = JSON.parse(fs.readFileSync(FILE, "utf8"));

        const season = String(data.season || "").trim();

        if (SEASONS.includes(season)) return season;

        if (season) {
            console.warn(`::warning::Невідоме оформлення «${season}» у data/season.json — `
                + `лишаю звичайне. Відомі: ${SEASONS.join(", ")}`);
        }

        return "standard";

    } catch (error) {

        // Файлу ще немає (свіжий клон, перший запуск) — це не помилка.
        return "standard";

    }

}

// Тег <html> у всіх сторінок однаковий: <html lang="uk">. Міняємо саме
// його атрибут, а не додаємо клас на body: змінні перевизначаються на
// :root, і body для цього запізно — частина значень читається вище.
const TAG = /<html\b([^>]*)>/i;

function stamp(html, season) {

    const match = html.match(TAG);

    if (!match) return null;

    const attrs = match[1];

    const already = attrs.match(/\sdata-season="([^"]*)"/);

    if (already) {

        if (already[1] === season) return html;

        return html.replace(TAG, () =>
            `<html${attrs.replace(/\sdata-season="[^"]*"/, ` data-season="${season}"`)}>`);

    }

    return html.replace(TAG, () => `<html${attrs} data-season="${season}">`);

}

function main() {

    const season = readSeason();

    const pages = htmlFiles();

    let touched = 0;
    let already = 0;

    const без = [];

    pages.forEach(file => {

        const before = fs.readFileSync(file, "utf8");

        const after = stamp(before, season);

        if (after === null) { без.push(path.relative(ROOT, file)); return; }

        if (after === before) { already++; return; }

        fs.writeFileSync(file, after, "utf8");

        touched++;

    });

    if (без.length) {
        console.warn(`::warning::без тега <html>: ${без.length} (${без.slice(0, 3).join(", ")})`);
    }

    console.log(`Оформлення «${season}»: проставлено ${touched}, `
        + `вже стояло ${already} → ${pages.length} сторінок`);

}

if (require.main === module) main();

module.exports = { readSeason, stamp, SEASONS, FILE };
