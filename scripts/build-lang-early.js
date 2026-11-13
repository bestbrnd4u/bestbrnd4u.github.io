// Вписує правило вибору мови (assets/js/lang-rule.js) прямо в <head>
// кожної сторінки сайту.
//
// НАВІЩО ВПИСУВАТИ, А НЕ ПІДКЛЮЧАТИ ФАЙЛОМ
// -----------------------------------------
// Іноземець, що зайшов на українську сторінку, мусить одразу опинитись
// на англійській — без миті української. Скрипт із defer виконується
// ПІСЛЯ розбору сторінки, коли браузер уже міг її намалювати. Звичайний
// <script src> у <head> — це ще один запит на шляху до першого кадру для
// КОЖНОГО відвідувача, включно з українцями, яким нікуди переходити.
// Вписаний текст не коштує запиту й виконується до <body>.
//
// Джерело одне — assets/js/lang-rule.js (його ж ганяє тест). Цей крок
// лише копіює текст без рядків-коментарів між позначками:
//
//     <script id="lang-early">…</script>
//
// Стоїть ПЕРЕД </head>: правилу потрібні <link rel="alternate" hreflang>,
// а вони в <head> вище. Тому крок іде після build-locales.js — так
// /en/ і /ru/ отримують той самий текст.
//
// Які сторінки: усі, де є assets/js/i18n.js (він доробляє випадок «треба
// спитати країну»). Теки обходимо цілком, а не за переліком: перелік
// відстає від сайту.

const fs = require("fs");
const path = require("path");
const safe = require("./fs-retry");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "assets", "js", "lang-rule.js");

const SKIP = new Set(["node_modules", ".git", "admin", "supabase", "tests", "docs", "scripts", ".claude", ".playwright-mcp"]);

const BLOCK_RE = /<script id="lang-early">[\s\S]*?<\/script>\n?/;

function snippet() {

    const code = safe.readFileSync(SRC, "utf8")
        .split("\n")
        // Рядки-коментарі не їдуть у кожну сторінку: пояснення — у файлі.
        .filter(line => !/^\s*\/\//.test(line))
        .map(line => line.trim())
        .filter(line => line !== "")
        .join("\n");

    // У вписаному скрипті не має бути «</script» — він закрив би тег.
    if (/<\/script/i.test(code)) throw new Error("lang-rule.js містить </script — вписати не можна");

    return `<script id="lang-early">\n${code}\n</script>\n`;

}

function pages(dir, out) {

    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

        if (SKIP.has(entry.name)) return;

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) pages(full, out);
        else if (entry.name.endsWith(".html") && !entry.name.startsWith("tmp-")) out.push(full);

    });

    return out;

}

function apply(html, block) {

    if (!html.includes("assets/js/i18n.js")) return html;

    const clean = html.replace(BLOCK_RE, "");

    const at = clean.indexOf("</head>");

    if (at < 0) return html;

    return clean.slice(0, at) + block + clean.slice(at);

}

function main() {

    const block = snippet();

    let changed = 0;
    let total = 0;

    pages(ROOT, []).forEach(file => {

        const html = safe.readFileSync(file, "utf8");

        const out = apply(html, block);

        if (out.includes('id="lang-early"')) total++;

        if (out !== html) {
            safe.writeFileSync(file, out);
            changed++;
        }

    });

    console.log(`✓ Мова за країною: правило в <head> ${total} сторінок (оновлено ${changed})`);

}

if (require.main === module) main();

module.exports = { apply, snippet, pages };
