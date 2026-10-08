// Розділи каталогу — у підвал кожної сторінки.
//
// НАВІЩО
// -------
// Сторінки розділів (/departments/sumky/ і сусідні) і категорій —
// це те, чим магазин має ранжуватись за запитами на кшталт «сумки
// купити» чи «гаманці Coach». Сторінки є, у sitemap вони є, вміст у
// них є.
//
// А посилань на них на самому сайті майже немає. Заміряно 08.10.2026
// у браузері, головна після рендеру:
//
//     на /categories/<slug>/   10 посилань (мега-меню)
//     на /departments/<slug>/   2
//     на /catalog?<фільтри>    39
//
// У підвалі — колонка «Каталог» із чотирьох посилань, і всі чотири
// ведуть або на фільтр, або на хаб брендів. Жодного на розділ.
//
// Підвал тут важить більше, ніж здається: він статичний (його бачить
// робот, що не виконує JavaScript, — на відміну від мега-меню, яке
// малює скрипт) і він на кожній із 154 сторінок.
//
// Розділ веде далі в свої категорії (сторінки розділів носять їхній
// перелік), тож одне посилання з підвалу тягне за собою весь рівень.
//
// ЧОМУ ЗБІРКОЮ, А НЕ РУКАМИ
// --------------------------
// Розділи заводяться в адмінці. Вписаний руками підвал перестав би
// збігатися з дійсністю мовчки — рівно так, як це вже бувало з
// телефоном і реквізитами (див. scripts/build-legal.js).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const { departmentPages, categoryPages, readRecords, DEPARTMENTS_SRC }
    = require("./build-taxonomy-pages");

const PRODUCTS_FILE = path.join(ROOT, "data", "products.json");
const CATEGORIES_FILE = path.join(ROOT, "data", "categories.json");

const START = "<!--SECTIONS_START-->";
const END = "<!--SECTIONS_END-->";

const SLOT_RE = new RegExp(START + "[\\s\\S]*?" + END);

const escapeHtml = text => String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function readJsonSafe(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (error) { return fallback; }
}

function htmlPages(dir, found) {

    const list = found || [];

    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

        // supabase — це шаблони листів, а не сторінки сайту: підвалу
        // в них немає й не має бути.
        if (["node_modules", ".git", ".claude", "archive", "admin",
            ".playwright-mcp", "supabase"].includes(entry.name)) return;

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) htmlPages(full, list);
        else if (entry.name.endsWith(".html")) list.push(full);

    });

    return list;

}

// Що саме кладемо. РОЗДІЛИ, а не категорії: їх троє, вони верхній
// рівень, і кожен веде далі в свої категорії. Шість категорій у
// підвалі зробили б колонку з тринадцяти пунктів — людині це вже не
// навігація, а перелік.
function sectionsMarkup(departments) {

    return departments.map(page =>
        `<a href="/departments/${encodeURIComponent(page.slug)}/">${escapeHtml(page.name)}</a>`
    ).join("\n");

}

function build() {

    const products = readJsonSafe(PRODUCTS_FILE, []);

    if (!Array.isArray(products) || !products.length) {
        console.warn("Немає data/products.json — розділи в підвал не пишу");
        return;
    }

    const categoryData = readJsonSafe(CATEGORIES_FILE, []);

    const departments = departmentPages(products, categoryData, readRecords(DEPARTMENTS_SRC));

    if (!departments.length) {
        console.warn("Розділів немає — підвал лишаю як є");
        return;
    }

    const pages = htmlPages(ROOT, []);

    let змінено = 0;
    const без = [];

    pages.forEach(file => {

        const html = fs.readFileSync(file, "utf8");

        // Заглушки-переадресації підвалу не мають — і не треба.
        if (/http-equiv="refresh"/.test(html)) return;

        if (!SLOT_RE.test(html)) { без.push(path.relative(ROOT, file)); return; }

        // Відступ беремо той, що в самої мітки: підвал у шаблонах
        // відформатований інакше, ніж у звичайних сторінках.
        const рядок = (html.match(new RegExp("^([ \\t]*)" + START, "m")) || [])[1] || "";

        const блок = START + "\n"
            + sectionsMarkup(departments).split("\n").map(l => рядок + l).join("\n")
            + "\n" + рядок + END;

        const next = html.replace(SLOT_RE, () => блок);

        if (next === html) return;

        fs.writeFileSync(file, next, "utf8");
        змінено++;

    });

    if (без.length) {
        throw new Error("У цих сторінках немає мітки " + START + " — "
            + "розділи в підвал нема куди вставити: " + без.slice(0, 5).join(", ")
            + (без.length > 5 ? ` (і ще ${без.length - 5})` : ""));
    }

    console.log(змінено
        ? `Готово: ${departments.length} розділів у підвал → ${змінено} сторінок`
        : "Готово: розділи в підвалі вже на місці");

}

if (require.main === module) build();

module.exports = { build, sectionsMarkup, START, END };
