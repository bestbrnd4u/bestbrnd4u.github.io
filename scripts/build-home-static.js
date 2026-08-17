// Тримає СТАТИЧНУ розмітку index.html у згоді з data/home.json.
//
// НАВІЩО
// -------
// index.html містить готову розмітку головної, а app.js після
// завантаження перемальовує її з data/home.json. Поки скрипт не
// відпрацював, браузер показує (і встигає докачати) те, що зашите в
// HTML. Якщо там лежить стара картинка — вона блимає на частку секунди
// при кожному оновленні сторінки.
//
// Так уже було двічі:
//   • головний банер — у CSS стояла запасна картинка з pexels;
//   • «Популярні категорії» — у розмітці лишались чотири старі фото
//     з pexels, хоча в даних давно свої.
//
// Просто вписати актуальні шляхи руками — тимчасове рішення: блимання
// повернеться першого ж разу, коли фото поміняють в адмінці. Тому
// розмітка тепер ПЕРЕГЕНЕРОВУЄТЬСЯ з тих самих даних, що читає app.js.
// Тобто перший кадр і те, що домалює скрипт, збігаються завжди.
//
// ЗАПУСК: node scripts/build-home-static.js
// В CI — після інших збірок, бо читає готовий data/home.json.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");
const HOME = path.join(ROOT, "data", "home.json");
// домен береться з site.config.json (див. scripts/site-env.js)
const { SITE_URL } = require("./site-env");

function escapeAttr(value) {

    return String(value === undefined || value === null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

// Замінює вміст елемента з відомим id, лишаючи сам тег недоторканим.
function replaceInner(html, id, inner) {

    const open = new RegExp(`(<[a-z]+[^>]*\\bid="${id}"[^>]*>)`, "i");
    const match = html.match(open);

    if (!match) throw new Error(`У index.html не знайдено елемент з id="${id}"`);

    const start = match.index + match[0].length;

    // шукаємо парний закривальний тег з урахуванням вкладеності
    const tag = match[0].match(/^<([a-z]+)/i)[1];
    const re = new RegExp(`</?${tag}\\b`, "gi");

    re.lastIndex = start;

    let depth = 1;
    let end = -1;
    let m;

    while ((m = re.exec(html))) {
        depth += m[0][1] === "/" ? -1 : 1;
        if (depth === 0) { end = m.index; break; }
    }

    if (end === -1) throw new Error(`Не знайдено закривальний тег для id="${id}"`);

    return html.slice(0, start) + inner + html.slice(end);

}

// Підставляє значення CSS-змінної у style="" потрібного елемента.
function setStyleVar(html, id, varName, value) {

    const re = new RegExp(`(<[a-z]+[^>]*\\bid="${id}"[^>]*?\\bstyle=")([^"]*)(")`, "i");

    if (!re.test(html)) throw new Error(`У index.html немає style="" в елемента id="${id}"`);

    return html.replace(re, (all, before, style, after) => {

        const cleaned = style
            .split(";")
            .map(s => s.trim())
            .filter(s => s && !s.startsWith(varName + ":"))
            .concat(`${varName}:url('${value}')`)
            .join(";");

        return before + cleaned + after;

    });

}

function main() {

    if (!fs.existsSync(HOME)) {
        console.error(`Не знайдено ${path.relative(ROOT, HOME)}`);
        process.exit(1);
    }

    const home = JSON.parse(fs.readFileSync(HOME, "utf8"));

    let html = fs.readFileSync(INDEX, "utf8");
    const before = html;

    // 1. фон головного банера
    if (home.hero && home.hero.image) {
        html = setStyleVar(html, "heroSection", "--hero-bg", home.hero.image);
    }

    // 2. «Популярні категорії» — саме тут блимали старі фото.
    // Розмітка один в один як у renderCategories() в app.js.
    if (home.categories && Array.isArray(home.categories.items)) {

        const cards = home.categories.items.map(item => `
            <a href="${escapeAttr(item.link || "catalog")}" class="category">
                <img
                    src="${escapeAttr(item.image || "assets/images/no-image.png")}"
                    alt="${escapeAttr(item.label || "")}"
                    onerror="this.src='assets/images/no-image.png'">
                <h3>${escapeAttr(item.label || "")}</h3>
            </a>`).join("\n");

        html = replaceInner(html, "categoriesGrid", `\n${cards}\n\n        `);

    }

    // 3. фон банера «Нова колекція»
    if (home.promo && home.promo.image) {
        html = setStyleVar(html, "promoBanner", "--promo-bg", home.promo.image);
    }

    // 4. плитки брендів
    if (home.brands && Array.isArray(home.brands.items)) {

        const tiles = home.brands.items.map(b => `
            <a href="${escapeAttr(b.link || "catalog")}" class="brand-card">${escapeAttr(b.name || "")}</a>`)
            .join("\n");

        html = replaceInner(html, "brandsGrid", `\n${tiles}\n\n        `);

    }

    // 5. Випадаюче меню (Каталог / Новинки / Акції).
    // Ті самі статі, ті самі фото — але прописані окремо й давно
    // застаріли: там лишались зовнішні картинки з pexels. JS їх не
    // чіпає, тож у меню роками показувались чужі фото. Беремо картинку
    // за статтю з тих самих даних, що й плитки категорій.
    if (home.categories && Array.isArray(home.categories.items)) {

        const byGender = {};

        home.categories.items.forEach(item => {
            const m = String(item.link || "").match(/gender=([^&]+)/);
            if (m && item.image) byGender[decodeURIComponent(m[1])] = item.image;
        });

        html = html.replace(
            /(<a class="mega-item" href="[^"]*gender=([^"&]+)"><img src=")([^"]*)(")/g,
            (all, head, gender, oldSrc, tail) => {
                const img = byGender[decodeURIComponent(gender)];
                return img ? head + escapeAttr(img) + tail : all;
            }
        );

    }

    // 6. Картинка для прев'ю посилань (og:image) — теж лишалась чужою
    if (home.hero && home.hero.image) {
        html = html.replace(
            /(<meta property="og:image" content=")([^"]*)(")/,
            (all, head, oldSrc, tail) => head + SITE_URL + escapeAttr(home.hero.image) + tail
        );
    }

    if (html === before) {
        console.log("Готово: статична розмітка головної вже збігається з data/home.json");
        return;
    }

    fs.writeFileSync(INDEX, html, "utf8");

    console.log("Готово: статичну розмітку index.html оновлено з data/home.json");

}

module.exports = { replaceInner, setStyleVar };

if (require.main === module) main();
