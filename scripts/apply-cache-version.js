// Версії файлів, щоб кеш оновлювався сам.
//
// ПРОБЛЕМА
// ---------
// Після викладки на прод люди бачили стару версію сайту й мусили
// чистити кеш вручну. Причина проста: жоден файл не версіонувався.
// Браузер (а перед ним ще й Cloudflare) кешує ЗА АДРЕСОЮ, а адреса
// при оновленні лишалась тією самою — assets/js/app.js як був, так і
// лишився. Для кеша це «той самий файл», і він віддавав старий.
//
// Гірше за просто стару версію — СУМІШ версій: свіжий HTML разом зі
// старим JS. Сторінка не просто відстає, вона ламається способом,
// який неможливо відтворити в розробника: у нього кеш порожній.
//
// РІШЕННЯ
// --------
// Додаємо до адреси відбиток вмісту:
//
//     assets/js/app.js  →  assets/js/app.js?v=3f8a1c
//
// Змінився файл — змінився відбиток — змінилась адреса — кеш
// зобовʼязаний піти по нову версію. Не змінився — адреса та сама, і
// файл береться з кеша, як і має бути. Тобто це не «вимкнути кеш», а
// «зробити кеш чесним».
//
// Відбиток рахується від ВМІСТУ, а не від часу збірки: інакше кожна
// збірка змушувала б усіх перекачувати весь сайт, навіть якщо в ньому
// нічого не змінилось.
//
// ДАНІ (data/*.json) — ОКРЕМА ІСТОРІЯ
// ------------------------------------
// Їх тягне JS через fetch("data/products.json"), і переписати ці
// рядки в коді не можна: файл коду один, а версія змінюється щозбірки.
// Тому список версій кладеться прямо в HTML окремим рядком:
//
//     window.ASSET_VERSIONS = { "data/products.json": "9b2e01", ... };
//
// а common.js додає версію під час запиту. HTML — єдине, що мусить
// приходити свіжим; усе інше він приносить із собою.
//
// ЩО ЦЕЙ КРОК НЕ ВИРІШУЄ
// -----------------------
// Сам HTML. GitHub Pages віддає його з Cache-Control: max-age=600 —
// заголовки там не налаштовуються. Тобто до 10 хвилин після викладки
// частина людей ще побачить стару сторінку. Але це вікно скінченне й
// минає само: чистити кеш руками більше не треба, і — головне —
// сторінка й її файли завжди будуть однієї версії, бо адреси файлів
// приходять разом із HTML.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

// Файли, адреси яких переписуємо прямо в розмітці.
const ASSET_DIRS = ["assets/js", "assets/css"];

// Дані, які тягне JS. Версії для них ідуть у window.ASSET_VERSIONS.
const DATA_DIR = "data";

const MARKER = "window.ASSET_VERSIONS";

function shortHash(file) {

    const buffer = fs.readFileSync(file);

    return crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 8);

}

function collect(dir, filter) {

    const full = path.join(ROOT, dir);

    if (!fs.existsSync(full)) return [];

    return fs.readdirSync(full)
        .filter(filter)
        .map(name => ({ rel: `${dir}/${name}`, hash: shortHash(path.join(full, name)) }));

}

function htmlFiles() {

    const out = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"))
        .map(f => path.join(ROOT, f));

    // згенеровані сторінки товарів
    const pages = path.join(ROOT, "p");

    if (fs.existsSync(pages)) {

        fs.readdirSync(pages).forEach(slug => {

            const file = path.join(pages, slug, "index.html");

            if (fs.existsSync(file)) out.push(file);

        });

    }

    return out;

}

function main() {

    const assets = [
        ...collect("assets/js", f => f.endsWith(".js")),
        ...collect("assets/css", f => f.endsWith(".css"))
    ];

    const data = collect(DATA_DIR, f => f.endsWith(".json"));

    const versions = {};

    data.forEach(item => { versions[item.rel] = item.hash; });

    const inline = `<script>${MARKER} = ${JSON.stringify(versions)};</script>`;

    let touched = 0;

    htmlFiles().forEach(file => {

        let html = fs.readFileSync(file, "utf8");
        const before = html;

        assets.forEach(({ rel, hash }) => {

            // І відносні адреси (assets/js/app.js), і абсолютні
            // (https://bestbrnd4u.com/assets/js/app.js) — на згенерованих
            // сторінках товарів вони абсолютні.
            //
            // Стару версію спершу прибираємо: без цього повторна збірка
            // дала б ?v=старе?v=нове.
            const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            html = html.replace(
                new RegExp(`(["'])((?:[^"']*\\/)?${escaped})(?:\\?v=[a-f0-9]+)?\\1`, "g"),
                `$1$2?v=${hash}$1`
            );

        });

        // Рядок із версіями даних — одразу після <head>, щоб він був
        // раніше за будь-який скрипт, який ним користується.
        html = html.replace(new RegExp(`\\s*<script>${MARKER}[\\s\\S]*?<\\/script>`), "");

        html = html.replace(/<head([^>]*)>/i, `<head$1>\n${inline}`);

        if (html !== before) {

            fs.writeFileSync(file, html, "utf8");

            touched += 1;

        }

    });

    console.log(`Версії проставлено: ${assets.length} файлів коду, `
        + `${data.length} файлів даних → ${touched} сторінок`);

}

main();
