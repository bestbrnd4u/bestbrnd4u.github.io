// Перелік українських рядків інтерфейсу, які треба перекласти.
//
// НАВІЩО
// -------
// Сайт отримує англійську й російську версії (/en/, /ru/). Тексти
// інтерфейсу живуть у двох місцях:
//   1. у розмітці сторінок, написаних руками (кнопки, меню, підписи);
//   2. у рядках JavaScript, які малюють кошик, каталог, оформлення.
// Скрипт збирає обидва джерела в один перелік — з нього складається
// словник data/i18n/strings.json, а потім той самий перелік показує,
// що з'явилось нового й ще не перекладено.
//
// Тексти ТОВАРІВ, брендів і категорій сюди не входять: вони
// перекладаються в самих даних (поля перекладу в адмінці).
//
// ЗАПУСК
//   node scripts/i18n-inventory.js            — підсумок
//   node scripts/i18n-inventory.js --json     — повний перелік у stdout
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

const CYR = /[а-яіїєґ]/i;

// Сторінки, які генеруються з шаблонів (їхні тексти — у шаблонах або в
// даних), і службові — не беремо.
const SKIP_DIRS = new Set(["node_modules", ".git", "admin", "tests", "supabase", "p", "brands", "categories",
    "departments", "promo", "en", "ru", "docs", "scripts", "assets", "data", "aktsii", "novynky"]);

// Юридичні сторінки лишаються українськими (рішення власника).
const LEGAL = new Set(["offer.html", "privacy-policy.html", "return-warranty.html"]);

const ATTRS = ["alt", "title", "placeholder", "aria-label", "content", "value"];

function normalize(text) {
    return text.replace(/\s+/g, " ").trim();
}

function fromHtml(rel, out) {

    const html = fs.readFileSync(path.join(ROOT, rel), "utf8")
        // Код у <script> — окремим шляхом, як і JS-файли.
        .replace(/<script\b(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/gi, "");

    const { document } = new JSDOM(html).window;

    const walker = document.createTreeWalker(document.documentElement, 4 /* TEXT */);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement && /^(STYLE|SCRIPT|NOSCRIPT)$/.test(node.parentElement.tagName)) continue;
        const text = normalize(node.textContent);
        if (CYR.test(text)) add(out, text, rel);
    }

    document.querySelectorAll("*").forEach(el => {
        ATTRS.forEach(attr => {
            const value = el.getAttribute(attr);
            if (value && CYR.test(value)) add(out, normalize(value), rel + "@" + attr);
        });
    });

}

function fromJs(rel, out) {

    const src = fs.readFileSync(path.join(ROOT, rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n").filter(line => !/^\s*\/\//.test(line)).join("\n");

    // Звичайні рядки й шаблони. У шаблонах ${…} лишаємо як місце для
    // підстановки: «Знайдено ${n} ${word}» — один запис словника.
    const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

    for (const m of src.matchAll(re)) {
        const raw = m[1] ?? m[2] ?? m[3] ?? "";
        if (!CYR.test(raw)) continue;
        // Шаблон із розміткою — беремо тексти між тегами окремо.
        const parts = raw.includes("<")
            ? raw.split(/<[^>]*>/).map(normalize).filter(t => CYR.test(t))
            : [normalize(raw)];
        parts.forEach(text => add(out, text, rel));
    }

}

function add(out, text, where) {
    if (!out.has(text)) out.set(text, new Set());
    out.get(text).add(where);
}

function collect() {

    const out = new Map();

    fs.readdirSync(ROOT).filter(f => f.endsWith(".html") && !LEGAL.has(f)).forEach(f => fromHtml(f, out));

    // Шаблони згенерованих сторінок — їхні власні тексти теж інтерфейс.
    ["product.html", "catalog.html", "promo.html"].forEach(f => fromHtml(f, out));

    fs.readdirSync(path.join(ROOT, "assets/js"))
        .filter(f => f.endsWith(".js") && !/^(vendor|translit)/.test(f))
        .forEach(f => fromJs("assets/js/" + f, out));

    return out;

}

if (require.main === module) {

    const out = collect();
    const strings = [...out.keys()];

    if (process.argv.includes("--json")) {
        process.stdout.write(JSON.stringify(Object.fromEntries([...out].map(([k, v]) => [k, [...v].slice(0, 3)])), null, 1));
    } else {
        const chars = strings.reduce((n, s) => n + s.length, 0);
        console.log(`унікальних рядків: ${strings.length}, символів: ${chars}`);
        const byFile = {};
        out.forEach(where => where.forEach(w => { const f = w.split("@")[0]; byFile[f] = (byFile[f] || 0) + 1; }));
        Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([f, n]) => console.log("  " + String(n).padStart(5) + "  " + f));
    }

}

module.exports = { collect };
