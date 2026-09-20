// Дані не доїхали — що людина бачить і що може зробити.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Збій завантаження був у семи місцях, і в шести з них показувався
// один червоний рядок:
//
//     <p class="error">Помилка завантаження кошика.</p>
//
// І все. Ні пояснення, ні кнопки. Далі людина або сама здогадається
// перезавантажити сторінку, або піде — а найдорожчі з цих шести
// саме кошик і оформлення, де товар уже обрано.
//
// Причина майже завжди та сама й не в сайті: кількадесят кілобайт
// даних не доїхали по поганому звʼязку. Тобто повторна спроба
// СПРАВДІ допомагає — і саме її треба запропонувати.
//
// Кнопка була рівно в одному місці — у каталозі, де її додали
// раніше й окремо. Тепер розмітку збирає loadErrorHtml() у
// common.js, і каталог теж переведено туди: інакше лишилось би
// «майже однаково», а це найкоротший шлях до розходження.
//
// ЩО СТЕРЕЖЕ ЦЕЙ НАБІР
// ---------------------
// 1. Жоден обробник помилки не малює голий рядок повз помічника.
// 2. Помічник дає і пояснення, і кнопку, і кнопка справді перезавантажує.
// 3. common.js під'єднаний РАНІШЕ за сторінковий скрипт — інакше
//    виклик упаде з ReferenceError саме тоді, коли все й так погано.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (name, ok, extra) => {
    if (ok) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Коментарі геть: пояснення вище й у самих файлах містять і
// «Помилка завантаження», і назву класу. Без очищення набір ловив би
// власні слова.
const code = rel => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const common = code("assets/js/common.js");

console.log("\n[1] Помічник один на всіх");
{
    check("loadErrorHtml() є в common.js", /function loadErrorHtml\(/.test(common));

    check("у ньому пояснення, а не лише констатація",
        /Схоже на проблему зі звʼязком/.test(common));

    check("і кнопка", /data-reload/.test(common) && /Спробувати ще раз/.test(common));

    // Обробник делегований: розмітка вставляється рядком через
    // innerHTML, тож навішувати щось на кнопку в момент збирання
    // немає на що.
    check("кнопку слухає делегований обробник",
        /closest\("\[data-reload\]"\)/.test(common) && /location\.reload\(\)/.test(common));
}

console.log("\n[2] Жодного глухого кута не лишилось");
{
    // Усі сторінкові скрипти, які щось вантажать.
    const scripts = ["app.js", "catalog.js", "cart.js", "favorites.js",
        "checkout.js", "product.js", "account.js"];

    const expected = {
        "app.js": ["товари"],
        "catalog.js": ["каталог"],
        "cart.js": ["кошик"],
        "favorites.js": ["обране"],
        "checkout.js": ["замовлення"],
        "product.js": ["товар"],
        "account.js": ["історію замовлень", "адреси доставки"]
    };

    scripts.forEach(name => {

        const src = code("assets/js/" + name);

        expected[name].forEach(what => {
            check(`${name}: «${what}» через помічника`,
                new RegExp(`loadErrorHtml\\("${what}"\\)`).test(src));
        });

        // Головне: ніде не лишилось власної розмітки збою в обхід
        // помічника. Саме так ці шість місць і жили.
        const bare = src.match(/innerHTML\s*=\s*`?\s*<p class="error">[^`;]*завантаж/g) || [];

        check(`${name}: власної розмітки збою немає`, bare.length === 0,
            bare.join(" | "));

    });
}

console.log("\n[3] common.js під'єднаний раніше за сторінковий скрипт");
{
    // Якщо порядок зламають, виклик упаде з ReferenceError — і саме
    // тоді, коли сторінка вже й так не змогла завантажити дані.
    const pages = {
        "index.html": "app.js",
        "catalog.html": "catalog.js",
        "cart.html": "cart.js",
        "favorites.html": "favorites.js",
        "checkout.html": "checkout.js",
        "product.html": "product.js",
        "account.html": "account.js"
    };

    Object.entries(pages).forEach(([page, script]) => {

        const html = read(page);

        // Шукаємо саме тег <script src=...>, а не будь-яку згадку
        // імені файлу: в account.html шлях до account.js стоїть ще й
        // у коментарі, на 800 рядків вище за сам скрипт, — і
        // перевірка «хто раніше» через indexOf порівнювала коментар
        // із тегом.
        const at = file => html.indexOf(`src="assets/js/${file}`);

        const commonAt = at("common.js");
        const scriptAt = at(script);

        check(`${page}: common.js раніше за ${script}`,
            commonAt > -1 && scriptAt > -1 && commonAt < scriptAt,
            `common=${commonAt}, ${script}=${scriptAt}`);

    });
}

console.log("\n[4] Екран збою на справжньому DOM");
{
    const fn = common.match(/function loadErrorHtml\([\s\S]*?\n}\n/);

    check("помічник знайдено", Boolean(fn));

    const dom = new JSDOM(`<!doctype html><body><div id="box"></div></body>`,
        { runScripts: "outside-only" });

    const { window } = dom;
    const doc = window.document;

    window.eval(fn[0]);
    window.eval('document.getElementById("box").innerHTML = loadErrorHtml("кошик");');

    const box = doc.getElementById("box");

    check("названо саме те, що не доїхало",
        /Не вдалося завантажити кошик\./.test(box.textContent), box.textContent.trim());

    check("кнопка справді кнопка, а не посилання",
        box.querySelector("button[data-reload]") !== null);

    check("кнопка не сабмітить форму, якщо блок опиниться всередині неї",
        box.querySelector("button").getAttribute("type") === "button");

    // Той самий клас, що й у стилях: без нього блок був би без
    // відступів і вирівнювання, тобто виглядав би як недороблений.
    check("блок має спільний клас", box.querySelector(".load-error") !== null);

    const css = read("assets/css/style.css");

    check("клас описаний у стилях", /^\.load-error\{/m.test(css));
    check("і підказка теж", /^\.load-error-hint\{/m.test(css));

    // У каталозі блок стоїть усередині сітки карток і мусить займати
    // всю ширину; там, де сітки немає, властивість просто не діє.
    check("у сітці каталогу займає весь рядок",
        /\.load-error\{[^}]*grid-column:1\/-1/.test(css));

    // Старого імені більше немає ніде: два імені для одного —
    // найкоротший шлях до того, що поправлять одне.
    const stale = ["assets/css/style.css", "assets/js/catalog.js"]
        .filter(rel => /catalog-error/.test(code(rel)));

    check("старого .catalog-error не лишилось", stale.length === 0, stale.join(", "));
}

console.log(failures === 0
    ? "\n✅ Дані не доїхали — людині є що натиснути"
    : `\n❌ Провалено перевірок: ${failures}`);

process.exit(failures === 0 ? 0 : 1);
