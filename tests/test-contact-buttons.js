// ДВІ ПЛАВАЮЧІ КНОПКИ: ЗВОРОТНИЙ ДЗВІНОК І ЗВ'ЯЗОК
//
// ЩО ТУТ СТЕРЕЖЕТЬСЯ
// -------------------
// Розмітка кнопок народжується в JS, а не лежить у вісімнадцяти
// файлах. Це свідомий розмін: джерело одне й розійтись не може, зате
// сторінка без цього скрипта мовчки лишається без кнопок — і ніхто
// цього не помітить, бо решта сторінки ціла.
//
// Тому [1] перевіряє не «чи є файл», а чи підключений він НА КОЖНІЙ
// сторінці — і чи стоїть після common.js, звідки бере showToast().
//
// Решта — поведінка на справжньому DOM, а не збіг рядків у файлі.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

// Модулі Edge Function написані з export — Node їх так не підхопить.
// Знімаємо export і дописуємо module.exports, як це вже роблять
// інші набори.
function loadModule(rel, names) {

    const src = read(rel)
        .replace(/^export\s+/gm, "")
        .concat("\nmodule.exports = { " + names.join(", ") + " };");

    const module = { exports: {} };

    new Function("module", "exports", src)(module, module.exports);

    return module.exports;

}

const СЕРВЕР = loadModule("supabase/functions/telegram-order-bot/call-back.js",
    ["normalizeCallBackPhone", "cleanCallBackPage", "formatCallBack"]);

const МОДУЛЬ = read("assets/js/contact-buttons.js");
const CSS = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, " ");

const сторінки = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

// Викидає всі @media-блоки разом із вмістом — лишається те, що діє
// на будь-якій ширині. Рахуємо дужки, бо всередині медіа лежать
// звичайні правила зі своїми.
function безМедіа(css) {

    let out = "";
    let i = 0;

    while (i < css.length) {

        const далі = css.indexOf("@media", i);

        if (далі === -1) { out += css.slice(i); break; }

        out += css.slice(i, далі);

        let j = css.indexOf("{", далі);

        if (j === -1) break;

        let глибина = 1;

        j++;

        while (j < css.length && глибина > 0) {
            if (css[j] === "{") глибина++;
            else if (css[j] === "}") глибина--;
            j++;
        }

        i = j;

    }

    return out;

}


console.log("\n[1] Скрипт підключено на кожній сторінці");
{
    const без = [];
    const доCommon = [];
    const двічі = [];

    сторінки.forEach(file => {

        const html = read(file);

        const скільки = (html.match(/assets\/js\/contact-buttons\.js/g) || []).length;

        if (скільки === 0) { без.push(file); return; }
        if (скільки > 1) двічі.push(`${file} (${скільки})`);

        // showToast() оголошений у common.js. Обидва теги з defer,
        // тож порядок тегів = порядок виконання: стояти ПЕРЕД
        // common.js означає кликати функцію, якої ще немає.
        const тут = html.indexOf("assets/js/contact-buttons.js");
        const там = html.indexOf("assets/js/common.js");

        if (там === -1 || тут < там) доCommon.push(file);

    });

    check(`кнопки є на всіх ${сторінки.length} сторінках`, без.length === 0, без.join(", "));
    check("ніде не підключено двічі", двічі.length === 0, двічі.join(", "));
    check("скрипт іде після common.js", доCommon.length === 0, доCommon.join(", "));
}


console.log("\n[2] Кнопки й панелі з'являються на сторінці");

// Піднімаємо модуль на порожньому DOM — рівно як у браузері.
function підняти() {

    const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });

    const { window } = dom;

    // requestAnimationFrame у jsdom є не завжди, а модуль на ньому
    // показує панель.
    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = cb => window.setTimeout(cb, 0);
    }

    window.eval(МОДУЛЬ);

    return window;

}

{
    const window = підняти();
    const d = window.document;

    const док = d.querySelector(".contact-dock");

    check("док створено", !!док);

    check("у доці рівно дві кнопки",
        d.querySelectorAll(".contact-dock .dock-btn").length === 2,
        String(d.querySelectorAll(".contact-dock .dock-btn").length));

    check("панель каналів створена", !!d.getElementById("dockChatPanel"));
    check("панель дзвінка створена", !!d.getElementById("dockCallback"));

    // Поки не натиснули — панелей у дереві доступності немає.
    check("обидві панелі спочатку сховані",
        d.getElementById("dockChatPanel").hidden && d.getElementById("dockCallback").hidden);

    // Кнопка мусить САМА казати, що вона розкриває і в якому стані.
    ["dockChat", "dockCall"].forEach(id => {

        const b = d.getElementById(id);

        check(`${id}: aria-expanded спочатку false`,
            b.getAttribute("aria-expanded") === "false");

        const керує = b.getAttribute("aria-controls");

        check(`${id}: aria-controls вказує на наявну панель`,
            !!керує && !!d.getElementById(керує), керує);

    });
}


console.log("\n[3] Канали ті самі, що на сторінці контактів");
{
    const window = підняти();
    const d = window.document;

    const посилання = [...d.querySelectorAll(".dock-channel-mini")].map(a => a.getAttribute("href"));

    check("каналів чотири", посилання.length === 4, посилання.join(", "));

    // Розходження тут — не косметика: у панелі висітиме номер, якого
    // вже немає, і людина не додзвониться.
    const контакти = read("contacts.html");

    посилання.forEach(href => {

        check(`${href} є й на сторінці контактів`,
            контакти.includes(href), "у contacts.html такого посилання немає");

    });

    // Зовнішні — у нову вкладку й без передачі реферера вікну.
    [...d.querySelectorAll(".dock-channel-mini")].forEach(a => {

        const href = a.getAttribute("href");

        if (!/^https?:/.test(href)) return;

        check(`${href}: rel="noopener"`,
            (a.getAttribute("rel") || "").includes("noopener"));

    });
}


console.log("\n[4] Відкриття, закриття і взаємне виключення");
{
    const window = підняти();
    const d = window.document;

    const чат = d.getElementById("dockChat");
    const дзвінок = d.getElementById("dockCall");
    const пЧат = d.getElementById("dockChatPanel");
    const пДзв = d.getElementById("dockCallback");

    чат.dispatchEvent(new window.Event("click", { bubbles: true }));

    check("клік відкриває панель", !пЧат.hidden && пДзв.hidden,
        `чат hidden=${пЧат.hidden}, дзвінок hidden=${пДзв.hidden}`);

    check("aria-expanded став true", чат.getAttribute("aria-expanded") === "true");

    // ДВІ ПАНЕЛІ В ОДНОМУ КУТКУ НАЛІЗЛИ Б ОДНА НА ОДНУ.
    дзвінок.dispatchEvent(new window.Event("click", { bubbles: true }));

    check("друга кнопка закриває першу",
        !пДзв.hidden && !пЧат.classList.contains("is-open"),
        "класи панелі чату: " + пЧат.className);

    check("у першої кнопки aria-expanded повернувся в false",
        чат.getAttribute("aria-expanded") === "false");

    // Esc мусить і закрити, і повернути фокус: інакше фокус лишається
    // на елементі, якого вже не видно, і наступний Tab починає зі
    // стрибка на початок сторінки.
    const esc = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true });

    d.dispatchEvent(esc);

    check("Esc закриває панель", !пДзв.classList.contains("is-open"));

    check("Esc повертає фокус на кнопку", d.activeElement === дзвінок,
        d.activeElement ? d.activeElement.id || d.activeElement.tagName : "нічого");

    // ДВА ШВИДКІ НАТИСКАННЯ ПІДРЯД.
    //
    // hidden знімається з панелі через 200мс, щоб вона доїхала
    // анімацію. Поки обробник дивився на hidden, друге натискання
    // бачило «відкрита» і закривало вже закрите — тобто подвійний
    // клік не відкривав панель, а лишав її закритою.
    //
    // Та сама пастка, що вже була в обробнику чату. Там я її
    // поправив, а тут лишив — і вона вилізла знову, тільки тихіше.
    чат.dispatchEvent(new window.Event("click", { bubbles: true }));   // відкрили
    чат.dispatchEvent(new window.Event("click", { bubbles: true }));   // закрили
    чат.dispatchEvent(new window.Event("click", { bubbles: true }));   // знову відкрили

    check("три натискання підряд лишають панель відкритою",
        чат.getAttribute("aria-expanded") === "true",
        `aria-expanded=${чат.getAttribute("aria-expanded")}, hidden=${пЧат.hidden}`);
}


console.log("\n[4a] Фокус потрапляє туди, де є що робити");
{
    // У розмітці хрестик іде ПЕРЕД вмістом, тож «перший, на кого можна
    // стати» — це він. Людина відкриває «замовити дзвінок», стоїть на
    // «закрити», тисне Enter і згортає те, що щойно відкрила.
    const window = підняти();
    const d = window.document;

    d.getElementById("dockCall").dispatchEvent(new window.Event("click", { bubbles: true }));

    check("у формі дзвінка фокус на полі телефону",
        d.activeElement && d.activeElement.id === "dockPhone",
        d.activeElement ? (d.activeElement.id || d.activeElement.className) : "нічого");

    d.getElementById("dockChat").dispatchEvent(new window.Event("click", { bubbles: true }));

    // У чаті це поле повідомлення, а не перший значок каналу внизу:
    // панель відкривають, щоб написати.
    check("у чаті фокус на полі повідомлення",
        d.activeElement && d.activeElement.id === "chatInput",
        d.activeElement ? (d.activeElement.id || d.activeElement.className) : "нічого");
}


console.log("\n[5] Номер телефону зводиться до одного вигляду");
{
    // Та сама перевірка живе на сервері (call-back.js), бо браузерну
    // можна обійти. Але й браузерна мусить приймати те саме — інакше
    // форма відкидає номер, який сервер прийняв би.
    const window = підняти();

    // Дістаємо функцію з модуля: вона всередині IIFE, тож простого
    // доступу немає.
    const шматок = МОДУЛЬ.match(/function нормалізувати\(сире\)\s*\{[\s\S]*?\n    \}/);

    check("функцію знайдено в модулі", !!шматок);

    window.eval((шматок || [""])[0] + "\nwindow.__norm = нормалізувати;");

    const norm = window.__norm;

    const { normalizeCallBackPhone } = СЕРВЕР;

    const випадки = [
        ["0737288291", "+380737288291"],
        ["+380737288291", "+380737288291"],
        ["380737288291", "+380737288291"],
        ["737288291", "+380737288291"],
        ["+38 (073) 728 82 91", "+380737288291"],
        ["073-728-82-91", "+380737288291"],
        ["12345", null],
        ["", null],
        ["телефон", null]
    ];

    випадки.forEach(([вхід, очікуємо]) => {

        check(`браузер: "${вхід}" → ${очікуємо}`, norm(вхід) === очікуємо, String(norm(вхід)));

        check(`сервер:  "${вхід}" → ${очікуємо}`,
            normalizeCallBackPhone(вхід) === очікуємо, String(normalizeCallBackPhone(вхід)));

    });
}


console.log("\n[6] Сторінка в повідомленні власнику — тільки своя");
{
    const { cleanCallBackPage, formatCallBack } = СЕРВЕР;

    check("свій шлях проходить", cleanCallBackPage("/catalog?section=new") === "/catalog?section=new");
    check("шлях товару проходить", cleanCallBackPage("/p/gucci-sumka/") === "/p/gucci-sumka/");

    // Поле приходить від клієнта, а повідомлення йде з parse_mode
    // HTML. Чужа адреса в ньому — це посилання від імені магазину.
    check("чужа адреса відкидається", cleanCallBackPage("https://evil.example/x") === "");
    check("протокол-відносна відкидається", cleanCallBackPage("//evil.example") === "");
    check("розмітка відкидається", cleanCallBackPage('/x"><b>') === "");
    check("порожнє відкидається", cleanCallBackPage("") === "");

    // Екранування — не косметика: без нього номер із кутовою дужкою
    // ламає картку в Telegram.
    const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const текст = formatCallBack("+380737288291", "/x<script>", esc);

    check("розмітку в тексті екрановано", !/<script>/.test(текст), текст);
    check("номер клікабельний", текст.includes('<a href="tel:+380737288291">'));
}


console.log("\n[7] Док не накриває того, що вже стоїть унизу");
{
    // Правий кут зайнятий утрьох, тому док пішов у лівий. Якщо
    // колись переставлять — тест скаже, бо кнопки накриють стрілку
    // «нагору» і банер акції.
    const правило = CSS.match(/\.contact-dock\{([^}]*)\}/);

    check("док має власне правило", !!правило);

    const тіло = правило ? правило[1] : "";

    check("док тримається ЛІВОГО краю", /left\s*:/.test(тіло) && !/right\s*:/.test(тіло), тіло.replace(/\s+/g, " "));

    // Банер згоди і мобільна кнопка «Купити» лежать на всю ширину
    // низу. Док мусить підніматись над ними — так само, як уже
    // підіймається стрілка «нагору».
    //
    // ПЕРЕВІРЯЄМО ОКРЕМО БАЗУ Й МОБІЛЬНЕ.
    //
    // Проста перевірка «чи є таке правило десь у файлі» тут зелена
    // й тоді, коли базове зникло, а лишилось тільки те, що в
    // @media(max-width:768px). Тобто на ноутбуці кнопки знову під
    // банером, а тест мовчить. Сам на це й натрапив.
    // ПІДЙОМ ЗАДАЄТЬСЯ ЗМІННОЮ, А НЕ ВЛАСНИМ bottom У КОЖНОГО СТАНУ.
    //
    // Раніше кожен стан мав свій bottom, і це вийшло боком: правило
    // для клавіатури на айфоні програвало їм вагою :has() і док не
    // рухався. Тепер bottom один, а стани міняють --dock-lift на body.
    check("підйом над банером згоди задано (базове правило)",
        /body:has\(\.consent-banner\)\{[^}]*--dock-lift/.test(безМедіа(CSS)));

    check("підйом над банером згоди є й на вузькому екрані",
        (CSS.match(/body:has\(\.consent-banner\)\{[^}]*--dock-lift/g) || []).length >= 2,
        String((CSS.match(/body:has\(\.consent-banner\)\{[^}]*--dock-lift/g) || []).length));

    check("підйом над мобільною кнопкою «Купити»",
        /body:has\(\.mobile-sticky-cart\.show\)\{[^}]*--dock-lift/.test(CSS));

    // Шторка фільтрів має власний футер на всю ширину.
    check("ховається під шторкою фільтрів",
        /body\.mobile-filters-open\s*\.contact-dock\{/.test(CSS));

    // hidden мусить перемагати власний display панелі — те саме вже
    // ловили на .loader, де спінер крутився вічно.
    check("hidden справді ховає панель", /\.dock-panel\[hidden\]\{[^}]*display\s*:\s*none/.test(CSS));

    // БАНЕР І КОШИК УНИЗУ ОДНОЧАСНО — це перший перегляд товару з
    // телефона, тобто випадок типовий. І він БУВ ЗЛАМАНИЙ: кнопка
    // стояла на 113px усередині банера.
    //
    // Виграло не те правило, що нижче в файлі, а те, у якого важчий
    // селектор: :has(.mobile-sticky-cart.show) — два класи проти
    // одного в :has(.consent-banner). Медіазапит ваги не додає.
    //
    // Тому перевіряємо не «чи є правило», а ВАГУ: спільний випадок
    // мусить перемагати обидва поодинокі.
    check("спільний випадок «банер + кошик» описаний окремо",
        /body:has\(\.consent-banner\):has\(\.mobile-sticky-cart\.show\)\{[^}]*--dock-lift/.test(CSS));

    // Рахуємо класи в селекторі — для таких простих це і є вага.
    const вага = сел => (сел.match(/\.[\w-]+/g) || []).length;

    const спільний = вага("body:has(.consent-banner):has(.mobile-sticky-cart.show)");
    const кошикОдин = вага("body:has(.mobile-sticky-cart.show)");
    const банерОдин = вага("body:has(.consent-banner)");

    check("спільне правило важче за «тільки кошик»", спільний > кошикОдин,
        `${спільний} проти ${кошикОдин}`);

    check("спільне правило важче за «тільки банер»", спільний > банерОдин,
        `${спільний} проти ${банерОдин}`);

    // Банер не просто вищий за кошик — він СТАЄ НА нього (правило
    // «body:has(.mobile-sticky-cart.show) .consent-banner{bottom:76px}»
    // вже є в проєкті). Отже підніматись треба над СУМОЮ, і 76 у
    // нашому calc — та сама висота кошика. Якщо її колись змінять
    // там, тут мусить змінитись теж.
    check("банер справді стає на кошик (припущення ще дійсне)",
        /body:has\(\.mobile-sticky-cart\.show\)\s*\.consent-banner\{[^}]*bottom\s*:\s*76px/.test(CSS));

    const спільніПравила = CSS.match(
        /body:has\(\.consent-banner\):has\(\.mobile-sticky-cart\.show\)\{([^}]*)\}/g) || [];

    check("підйом рахує й кошик, і банер",
        спільніПравила.length >= 2 && спільніПравила.every(r => /76px/.test(r)),
        спільніПравила.map(r => r.replace(/\s+/g, " ")).join(" | "));

    // І ВСІ, ХТО СТОЇТЬ УНИЗУ, БЕРУТЬ ЦЕЙ ПІДЙОМ ІЗ ТОГО САМОГО МІСЦЯ.
    //
    // ЩО БУЛО НЕ ТАК. Док полагодили, а стрілку «нагору» — ні. У неї
    // лишалось два правила: базове 30px і окреме на мобільну кнопку
    // «Купити». Про банер згоди не згадувалось зовсім.
    //
    // І це не «трохи налазила»: у банера z-index 2500 проти 999 у
    // стрілки, тож він накривав її ЦІЛКОМ. Заміряно на 390×750 — 121
    // піксель усередині, elementFromPoint у центрі стрілки повертає
    // кнопку банера. Кнопка видима (opacity:1), а натиснути
    // неможливо — і це найперший екран нового відвідувача з телефона.
    //
    // Класичне «правило є, але застосоване нерівно»: лікували одного,
    // сусід лишився зі старою бідою. Тому перевіряємо не окремо дока,
    // а ВСІХ разом.
    const унизу = [".contact-dock", ".scroll-top"];

    const рахуватиBottom = сел => (CSS.match(
        new RegExp("[^{}]*\\" + сел + "(?![\\w-])[^{}]*\\{[^}]*\\}", "g")) || [])
        .filter(r => /(^|[{;\s])bottom\s*:/.test(r));

    унизу.forEach(сел => {

        const правила = рахуватиBottom(сел);

        check(`${сел}: bottom заданий рівно один раз`,
            правила.length === 1,
            правила.map(r => r.replace(/\s+/g, " ").slice(0, 70)).join(" | "));

        check(`${сел}: і бере підйом зі спільної змінної`,
            правила.length === 1 && /bottom\s*:\s*var\(--dock-bottom/.test(правила[0]),
            правила.length === 1 ? (правила[0].match(/bottom\s*:[^;]*/) || [""])[0] : "");

    });
}


console.log("\n[8] Обіцянка на кнопці збігається з графіком на сайті");
{
    // «Передзвонимо протягом робочого дня» має сенс лише разом із
    // годинами. Якщо графік на сторінці контактів зміниться, а тут
    // лишиться старий — обіцянка стане неправдою.
    const контакти = read("contacts.html");

    const графік = (МОДУЛЬ.match(/var ГРАФІК = "([^"]+)"/) || [])[1];

    check("графік у модулі заданий", !!графік, графік);

    check("той самий графік є на сторінці контактів",
        !!графік && контакти.includes(графік), графік);

    // БЕЗ КОМЕНТАРІВ: перевірка про те, що ЛЮДИНА ЧИТАЄ на екрані.
    //
    // Шукала вона по всьому файлу — і впала на коментарі, у якому
    // слова «за хвилину» стояли в зовсім іншому значенні («власник міг
    // за хвилину згадати ще щось»). Код при цьому був правильний.
    // Та сама слабкість, що вже ловилась із lookup_throttle.
    const безКоментарів = МОДУЛЬ
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/[^\n]*$/gm, " ");

    check("обіцяємо робочий день, а не хвилину",
        /протягом робочого дня/.test(безКоментарів)
        && !/протягом 1 хвилини|за хвилину/.test(безКоментарів));
}


console.log("\n[9] Підпис кнопки читається однаково оком і голосом");
{
    const window = підняти();
    const d = window.document;

    // WCAG 2.5.3: те, що написано на кнопці, мусить бути всередині
    // її доступного імені — інакше голосове керування не знайде її
    // за видимим написом.
    [...d.querySelectorAll(".dock-btn")].forEach(b => {

        const видно = (b.querySelector(".dock-hint") || {}).textContent || "";
        const імʼя = b.getAttribute("aria-label") || "";

        check(`«${видно.trim()}» міститься в доступному імені`,
            !!видно.trim() && імʼя.includes(видно.trim()), `aria-label="${імʼя}"`);

    });

    // Підказка — для ока. Читалці вона зайва: ім'я кнопка вже має.
    check("підказка схована від читалки",
        [...d.querySelectorAll(".dock-hint")].every(h => h.getAttribute("aria-hidden") === "true"));
}


console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
