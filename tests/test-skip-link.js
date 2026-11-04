// «Перейти до вмісту» і фокус після якірного посилання.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ПОСИЛАННЯ ПРОПУСКУ Є СКРІЗЬ, ДЕ Є ШАПКА. Заміряно 04.11.2026 на
//    проді, головна, 1280px, людський темп: до першого посилання вмісту
//    — 34 натискання Tab, із них 33 у шапці (мегаменю розкривається від
//    фокусу, і Tab іде по кожному пункту). WCAG 2.4.1, рівень A.
//
// 2. ЯКІРНЕ ПОСИЛАННЯ ПЕРЕНОСИТЬ ФОКУС, А НЕ ЛИШЕ ПОГЛЯД. Загальний
//    обробник якорів у common.js скасовує рідну навігацію
//    (preventDefault) і прокручує сам — а разом із рідною навігацією
//    зникав і перенос фокусу. Enter на «Популярні товари» прокручував
//    сторінку, фокус лишався на кнопці героя, і наступний Tab ішов на
//    її сусіда — сторінку смикало назад угору. Перевірено в двох
//    браузерах: після активації якоря фокус на самому посиланні.
//
//    Без цього пункту пункт 1 був би декорацією: посилання пропуску
//    теж якірне.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const { розставити, ПОСИЛАННЯ, ЦІЛЬ, ПРОПУСК } = require("../scripts/build-skip-link.js");

const скільки = (текст, що) => текст.split(що).length - 1;


console.log("\n[1] Крок ставить обидві речі на свої місця");
{
    const зразок = "<!doctype html><html><body class=\"x\">\n<header>шапка</header>\n<div class=\"hero\">вміст</div>\n</body></html>";
    const раз = розставити(зразок);

    check("посилання одразу після <body>",
        /<body class="x">\n<a class="skip-link" href="#content">/.test(раз), раз.slice(0, 120));

    check("ціль одразу після </header>",
        раз.includes("</header>\n" + ЦІЛЬ));

    check("по одному й тому, й тому",
        скільки(раз, ПОСИЛАННЯ) === 1 && скільки(раз, ЦІЛЬ) === 1);

    // product.html і catalog.html — шаблони для 136 згенерованих: усе,
    // що крок впише в шаблон, генератор скопіює, а наступна збірка
    // прожене крок і по копії. Будь-яка кількість прогонів мусить
    // давати той самий файл.
    const двічі = розставити(раз);
    const пять = [1, 2, 3, 4].reduce(h => розставити(h), раз);

    check("повторний прогін нічого не змінює", двічі === раз);
    check("і п'ятий теж", пять === раз);

    // Ціль переносить, якщо шапка змінилась і вставка опинилась не там.
    const зсунуто = раз.replace("\n" + ЦІЛЬ, "").replace("</div>", "</div>\n" + ЦІЛЬ);
    check("зсунуту ціль повертає на місце",
        розставити(зсунуто) === раз);

    // Переадресації зі старих кириличних адрес — без шапки й без
    // вмісту, який треба пропускати.
    const заглушка = "<!doctype html><html><head><meta http-equiv=\"refresh\" content=\"0; url=/p/x/\"></head><body><p>Сторінка переїхала</p></body></html>";
    check("сторінку без шапки не чіпає", розставити(заглушка) === заглушка);
}


console.log("\n[2] Розставлено на всіх справжніх сторінках");
{
    const усі = [];
    (function обхід(d) {
        fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
            if (ПРОПУСК.includes(e.name)) return;
            const f = path.join(d, e.name);
            if (e.isDirectory()) обхід(f);
            else if (e.name.endsWith(".html")) усі.push(f);
        });
    })(ROOT);

    const зШапкою = усі.filter(f => /<header[\s>]/.test(fs.readFileSync(f, "utf8")));

    // Якщо сторінок із шапкою раптом нуль, усі перевірки нижче
    // зелені ні про що.
    check(`сторінок із шапкою знайдено: ${зШапкою.length}`, зШапкою.length > 100);

    const неТак = зШапкою.filter(f => {
        const h = fs.readFileSync(f, "utf8");
        return розставити(h) !== h;
    }).map(f => path.relative(ROOT, f));

    check("на кожній посилання й ціль уже на місці",
        неТак.length === 0, неТак.slice(0, 5).join(", "));

    check("крок стоїть у npm run build",
        JSON.parse(read("package.json")).scripts.build.includes("build-skip-link.js"));
}


console.log("\n[3] Видно лише у фокусі — і поверх шапки");
{
    const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const правило = sel => (css.match(new RegExp(
        "^" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}", "m")) || [])[1] || "";

    const звичайне = правило(".skip-link");
    const уФокусі = правило(".skip-link:focus");

    check("правила знайдено", Boolean(звичайне) && Boolean(уФокусі));

    // Ховаємо зсувом, а НЕ display:none і не visibility:hidden: інакше
    // посилання випадає з порядку Tab і з дерева доступності — тобто
    // зникає саме для тих, кому воно потрібне.
    check("сховане зсувом, а не вимкнене",
        /transform\s*:/.test(звичайне)
        && !/display\s*:\s*none/.test(звичайне)
        && !/visibility\s*:\s*hidden/.test(звичайне),
        звичайне.replace(/\s+/g, " ").trim());

    check("у фокусі зсув знято", /transform\s*:\s*none/.test(уФокусі));

    // Шапка фіксована й має z-index 9999. Нижче за неї посилання
    // з'явилось би ПІД шапкою — у фокусі, але невидиме.
    const шапка = Number((правило("header").match(/z-index\s*:\s*(\d+)/) || [])[1] || 0);
    const пропуск = Number((звичайне.match(/z-index\s*:\s*(\d+)/) || [])[1] || 0);

    check("поверх фіксованої шапки",
        шапка > 0 && пропуск > шапка, `посилання ${пропуск}, шапка ${шапка}`);
}


console.log("\n[4] Якірне посилання переносить фокус на ціль");
{
    // Беремо САМ обробник із common.js, а не шукаємо в тексті слово
    // focus: перевірка за формою пропустила б і focus() не на тому
    // елементі, і focus() до того, як ціль стала фокусованою.
    const common = read("assets/js/common.js");
    const початок = common.indexOf("document.addEventListener(\"click\", event => {\n\n    const link = event.target.closest?.('a[href^=\"#\"]');");
    const кінець = common.indexOf("\n});\n", початок);

    check("обробник знайдено", початок !== -1 && кінець !== -1);

    const код = common.slice(початок, кінець + 4);

    const dom = new JSDOM(`<!doctype html><body>
        <a class="skip-link" href="#content">Перейти до вмісту</a>
        <header style="height:82px">шапка</header>
        <span id="content" class="skip-target" tabindex="-1"></span>
        <a id="hero" href="#products">Популярні товари</a>
        <section id="products"><h2>Популярні</h2><a href="/p/1">товар</a></section>
    </body>`, { runScripts: "outside-only" });

    const { window } = dom;

    // У jsdom прокрутки немає — і вона тут не предмет перевірки.
    window.Element.prototype.scrollIntoView = function () {};
    window.scrollBy = function () {};

    window.eval(код);

    const клік = id => {
        const л = window.document.getElementById(id) || window.document.querySelector(id);
        л.focus();
        л.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
        return window.document.activeElement;
    };

    const секція = window.document.getElementById("products");

    check("після «Популярні товари» фокус у секції",
        клік("hero") === секція,
        window.document.activeElement.outerHTML.slice(0, 60));

    // tabindex=-1, а не 0: секцію можна сфокусувати з коду, але Tab на
    // ній не зупиняється — інакше на кожній такій секції з'явилась би
    // зайва порожня зупинка.
    check("ціль фокусована з коду, але не стала зупинкою Tab",
        секція.getAttribute("tabindex") === "-1");

    const ціль = window.document.getElementById("content");

    check("посилання пропуску переносить фокус на ціль",
        клік(".skip-link") === ціль,
        window.document.activeElement.outerHTML.slice(0, 60));

    // Власний tabindex цілі обробник не переписує.
    check("наявний tabindex лишається як був", ціль.getAttribute("tabindex") === "-1");
}

console.log(failures === 0
    ? "\n✅ Пропуск шапки і фокус після якоря на місці\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
