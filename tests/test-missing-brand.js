// Старе посилання catalog?brand=… на бренд, якого вже немає.
//
// ЩО БУЛО
// --------
// Невідомий бренд з адреси каталог відкидав мовчки: людина з посилання
// в Instagram чи закладках бачила «Каталог товарів» і всі 131 позицію,
// без жодного слова, куди подівся бренд, по який вона прийшла.
//
// Тепер над товарами — «Бренду «…» зараз немає в магазині» і посилання
// на всі бренди. Тут — справжні applyBrandFromUrl і showMissingBrands
// з catalog.js у JSDOM.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const catalog = fs.readFileSync(path.join(ROOT, "assets/js/catalog.js"), "utf8");
const translit = fs.readFileSync(path.join(ROOT, "assets/js/translit.js"), "utf8");

const fn = name => (catalog.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`)) || [""])[0];

const NAMES = ["readSetParam", "latinParam", "slugIndex", "applyBrandFromUrl", "showMissingBrands"];

console.log("\n[1] Функції на місці");
NAMES.forEach(name => check(name, fn(name).length > 0));

function open(search) {

    const dom = new JSDOM(`<!doctype html><body>
        <div class="catalog-header"><h1>Каталог товарів</h1><p>Підзаголовок</p></div>
        <div class="brand-about" id="brandAbout" hidden></div>
        <div id="brandOptions">
            <button class="filter-option" data-brand="Coach"></button>
            <button class="filter-option" data-brand="Marc Jacobs"></button>
        </div>
        <div id="catalogGrid"></div>
    </body>`, { url: "http://localhost/catalog" + search, runScripts: "outside-only" });

    const { window } = dom;

    window.eval(translit);
    window.eval(`
        var selectedBrands = new Set();
        var brandOptionsList = document.getElementById("brandOptions");
        var uiUpdated = 0;
        function updateBrandUI() { uiUpdated++; }
    `);
    NAMES.forEach(name => window.eval(fn(name)));
    window.eval("applyBrandFromUrl(); window.__state = { selected: () => [...selectedBrands], ui: () => uiUpdated };");

    const notice = window.document.getElementById("missingBrandNotice");

    return { window, notice, selected: window.__state.selected(), ui: window.__state.ui() };

}

console.log("\n[2] Невідомий бренд — пояснення й шлях далі");
{
    const r = open("?brand=old-brand-name");

    check("плашка є", Boolean(r.notice));
    if (r.notice) {
        check("називає бренд по-людськи: «Old Brand Name»", /«Old Brand Name»/.test(r.notice.textContent), r.notice.textContent);
        check("каже, що його немає", /зараз немає в магазині/.test(r.notice.textContent));
        check("і що нижче весь каталог", /Нижче — увесь каталог/.test(r.notice.textContent));
        const link = r.notice.querySelector("a");
        check("посилання на всі бренди", link && link.getAttribute("href") === "/brands/", link && link.getAttribute("href"));
        check("читалка чує (role=status)", r.notice.getAttribute("role") === "status");
        // Стоїть під заголовком (після опису бренду), а не будь-де.
        check("стоїть одразу після опису бренду", r.notice.previousElementSibling && r.notice.previousElementSibling.id === "brandAbout");
    }
    check("фільтр не ввімкнено (немає чого)", r.selected.length === 0, r.selected.join(","));
    check("бічне меню не чіпали", r.ui === 0);
}

console.log("\n[3] Відомий і невідомий разом");
{
    const r = open("?brand=coach,nonexistent");

    check("Coach вибрано", r.selected.join(",") === "Coach", r.selected.join(","));
    check("плашка про невідомий є", r.notice && /«Nonexistent»/.test(r.notice.textContent));
    check("каже «показуємо решту», а не «увесь каталог»",
        r.notice && /Показуємо решту вибраних/.test(r.notice.textContent) && !/увесь каталог/.test(r.notice.textContent));
    check("а про Coach — ні слова", r.notice && !/Coach/.test(r.notice.textContent));
}

console.log("\n[4] Кілька невідомих — однина/множина");
{
    const r = open("?brand=aaa,bbb");
    check("«Брендів «Aaa», «Bbb»»", r.notice && /^Брендів «Aaa», «Bbb» зараз немає/.test(r.notice.textContent), r.notice && r.notice.textContent);
}

console.log("\n[5] Де плашки бути не повинно");
{
    check("відомий бренд — без плашки", !open("?brand=coach").notice);
    check("кирилицею зі старих посилань — теж відомий", !open("?brand=" + encodeURIComponent("Marc Jacobs")).notice);
    check("без бренду в адресі — без плашки", !open("").notice);
}

console.log("\n[6] Назва з адреси — лише текст");
{
    // Посилання може скласти будь-хто — і вкласти в «бренд» розмітку.
    const r = open("?brand=" + encodeURIComponent('<img src=x onerror="window.__pwned=1">'));
    check("плашка є", Boolean(r.notice));
    check("розмітка не стала розміткою", r.notice && !r.notice.querySelector("img"), r.notice && r.notice.innerHTML.slice(0, 120));
    check("і скрипт не виконався", r.window.__pwned !== 1);
    check("у коді — textContent, а не innerHTML",
        /text\.textContent =/.test(fn("showMissingBrands")) && !/innerHTML/.test(fn("showMissingBrands")));
}

console.log("\n[7] Повторний виклик не плодить плашок");
{
    const r = open("?brand=old");
    r.window.eval("applyBrandFromUrl();");
    check("плашка одна", r.window.document.querySelectorAll("#missingBrandNotice").length === 1);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
