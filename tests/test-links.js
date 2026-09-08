// Чи всі внутрішні посилання й ресурси сайту ведуть кудись.
//
// НАВІЩО ЦЕЙ НАБІР
// -----------------
// Моніторинг перевіряє, що неіснуюча адреса віддає 404 — але не те, чи
// є на сайті посилання на такі адреси. А бите посилання ЗСЕРЕДИНИ гірше
// за зовнішнє: людина йде за ним, довіряючи магазину, і потрапляє в
// нікуди. Google теж витрачає на них обхід і бачить сайт неохайним.
//
// Сторінок на сайті 220+, і майже всі вони згенеровані — руками таке не
// перевіряють. Одна помилка в шаблоні генератора ламає сотню сторінок
// одночасно, і саме такий випадок цей набір і має ловити.
//
// ЧОГО ТУТ НЕМАЄ
// ---------------
// Зовнішніх посилань. Вони живуть своїм життям: чужий сайт може
// переїхати будь-коли, і тест, який від нього залежить, червонів би без
// нашої вини. Плюс тести не мусять ходити в мережу.
//
// ТРИ ПАСТКИ, ЧЕРЕЗ ЯКІ НАЇВНИЙ СКАНЕР БРЕШЕ
// -------------------------------------------
//   1. <base href="/"> — сторінки в /p/<slug>/ і /brands/<slug>/ мають
//      його, тож відносний "catalog" веде в корінь, а не в теку
//      сторінки. Без урахування base сотні цілих посилань виглядали б
//      битими.
//   2. Шаблонні рядки JS — у розмітці трапляється href="${url}" усередині
//      <script>. Це не адреса, а код, який виконається в браузері.
//   3ю. Адреси з відсотковим кодуванням (кирилиця в назвах фото) і з
//      ?v=<хеш> від scripts/apply-cache-version.js.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const SKIP_DIRS = new Set([
    "node_modules", ".git", ".github", ".claude", "_archive", "tests"
]);

let failures = 0;

const check = (name, ok, extra) => {
    if (ok) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

function htmlFiles(dir, out) {

    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

        if (SKIP_DIRS.has(entry.name)) return;

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) htmlFiles(full, out);
        // tmp-* лишають після себя перервані запуски інших наборів
        else if (entry.name.endsWith(".html") && !entry.name.startsWith("tmp-")) out.push(full);

    });

    return out;

}

// Адреси, які не є нашими файлами на диску.
function isExternal(href) {
    return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href) || href.startsWith("#");
}

// Код, а не адреса: href="${…}" або href="' + url + '" усередині скрипта.
//
// Лапка всередині значення означає, що ми дивимось на JS-рядок, а не на
// атрибут: у самому атрибуті вона не могла б стояти неекранованою.
// Плюс сюди НЕ входить: він буває в законних адресах.
function isTemplate(href) {
    return href.includes("${") || href.includes("<%") || /['"]/.test(href);
}

// Куди насправді вказує адреса з цієї сторінки.
function resolve(href, file, hasBase) {

    const clean = href.split("#")[0].split("?")[0];

    if (!clean) return "";

    // кореневу адресу base не чіпає
    if (clean.startsWith("/")) return clean.replace(/^\/+/, "");

    // <base href="/"> робить відносну адресу кореневою
    if (hasBase) return clean;

    const dir = path.relative(ROOT, path.dirname(file)).split(path.sep).join("/");

    return path.posix.normalize((dir ? dir + "/" : "") + clean);

}

// Чи існує на диску те, на що вказує адреса.
function exists(target) {

    if (!target || target === "/") return true;

    // Кирилиця в назвах фото приїжджає у розмітці закодованою.
    let decoded = target;

    try { decoded = decodeURIComponent(target); } catch (error) { /* лишаємо як є */ }

    return [target, decoded].some(name => [
        name,
        name + ".html",
        name + "/index.html"
    ].some(candidate => fs.existsSync(path.join(ROOT, candidate))));

}

const pages = htmlFiles(ROOT, []);

console.log(`\n[1] Сторінки знайдено`);
check(`сторінок для перевірки: ${pages.length}`, pages.length > 150, pages.length);

// ---------------------------------------------------------------

const broken = new Map();
const brokenAssets = new Map();

let links = 0;
let assets = 0;

pages.forEach(file => {

    const html = fs.readFileSync(file, "utf8");

    const hasBase = /<base\s+href="\/"/i.test(html);

    const note = (bag, target, href) => {

        const key = href.split("#")[0];

        if (!bag.has(key)) bag.set(key, []);

        bag.get(key).push(path.relative(ROOT, file).split(path.sep).join("/"));

    };

    // href — посилання, куди піде людина
    [...html.matchAll(/href="([^"]*)"/g)].forEach(match => {

        const href = match[1];

        if (!href || isExternal(href) || isTemplate(href)) return;

        links++;

        if (!exists(resolve(href, file, hasBase))) note(broken, null, href);

    });

    // src — ресурс, без якого сторінка виглядає зламаною
    [...html.matchAll(/\bsrc="([^"]*)"/g)].forEach(match => {

        const src = match[1];

        if (!src || isExternal(src) || isTemplate(src)) return;

        assets++;

        if (!exists(resolve(src, file, hasBase))) note(brokenAssets, null, src);

    });

});

console.log(`\n[2] Посилання ведуть кудись`);

check(`перевірено внутрішніх посилань: ${links}`, links > 1000, links);

check("битих посилань немає", broken.size === 0,
    [...broken.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 8)
        .map(([href, from]) => `${href} ← ${from.length} стор. (${from[0]})`)
        .join("; "));

console.log(`\n[3] Ресурси на місці`);

check(`перевірено ресурсів: ${assets}`, assets > 100, assets);

check("битих src немає", brokenAssets.size === 0,
    [...brokenAssets.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 8)
        .map(([src, from]) => `${src} ← ${from.length} стор. (${from[0]})`)
        .join("; "));

// ---------------------------------------------------------------
// Сторінки-переспрямування: їх у p/ сімдесят, і кожна мусить вести
// на існуючий товар. Пусте переспрямування — це 404 із затримкою.
console.log(`\n[4] Переспрямування зі старих адрес`);
{
    const redirects = pages.filter(f => /http-equiv="refresh"/i.test(fs.readFileSync(f, "utf8")));

    const dead = [];

    redirects.forEach(file => {

        const html = fs.readFileSync(file, "utf8");

        const target = (html.match(/content="\d+;\s*url=([^"]+)"/i) || [])[1];

        if (!target) { dead.push(path.relative(ROOT, file) + " (без адреси)"); return; }

        if (isExternal(target)) return;

        if (!exists(resolve(target, file, /<base\s+href="\/"/i.test(html)))) {
            dead.push(path.relative(ROOT, file).split(path.sep).join("/") + " → " + target);
        }

    });

    check(`переспрямувань: ${redirects.length}`, redirects.length > 0, redirects.length);

    check("усі ведуть на існуючу сторінку", dead.length === 0, dead.slice(0, 5).join("; "));
}

// ---------------------------------------------------------------
// Сам сканер мусить ловити биті адреси — інакше зелений результат
// нічого не означає. Раніше через це тихо проходили цілі набори.
console.log(`\n[5] Сканер справді щось перевіряє`);
{
    check("неіснуюча адреса вважається битою",
        !exists("catalog-yakogo-nemaye"));

    check("існуюча адреса вважається цілою",
        exists("catalog") && exists("index.html"));

    check("<base href> робить відносну адресу кореневою",
        resolve("catalog", path.join(ROOT, "p", "test", "index.html"), true) === "catalog");

    check("без <base> адреса рахується від теки сторінки",
        resolve("index.html", path.join(ROOT, "brands", "coach", "index.html"), false)
            === "brands/coach/index.html");

    check("шаблонний рядок JS адресою не вважається",
        isTemplate("${url}") && isTemplate('" + href + "'));

    check("зовнішні адреси пропускаються",
        isExternal("https://example.com") && isExternal("mailto:a@b.c")
        && isExternal("tel:+380") && isExternal("//cdn.example.com")
        && isExternal("#top"));
}

console.log(failures === 0
    ? `\n✅ Посилання: ${links} перевірено, битих немає\n`
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
