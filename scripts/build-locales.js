// Мовні версії сайту: /en/… і /ru/….
//
// РІШЕННЯ ВЛАСНИКА (2026-11-06)
// ------------------------------
//   • окремі адреси /en/ і /ru/ — щоб кожну мову індексував Google;
//   • українська лишається основною й відкривається за замовчуванням
//     (закон про мову, ст. 27: інтернет-магазин мусить мати українську
//     версію, що вантажиться першою; інші мови — додатково);
//   • юридичні сторінки (оферта, політика, повернення) не
//     перекладаються: український текст і помітка, що чинний саме він.
//
// ЩО РОБИТЬ
// ----------
// Для кожної опублікованої сторінки пише копію в en/<шлях> і
// ru/<шлях>:
//   - <html lang>, <base href="/"> (ресурси — від кореня, як у
//     згенерованих сторінках товарів);
//   - статичний текст і атрибути (alt, title, placeholder, aria-label,
//     опис для пошуку й соцмереж) — за словником data/i18n/strings.json;
//   - посилання на сторінки сайту — з мовним префіксом;
//   - canonical і og:url — на свою мовну адресу; hreflang — на всі три.
// Українські сторінки правляться ТОЧКОВО (hreflang, перемикач, скрипти)
// — текстовими вставками, а не перезаписом через розбір: розбір і
// серіалізація переформатували б кожну сторінку цілком.
//
// Те, що JS малює вже в браузері (картки, кошик), перекладає
// assets/js/i18n.js тим самим ядром (assets/js/i18n-core.js) — правило
// одне, і розійтись нема чому.
//
// ЗАПОБІЖНИК ВІД НАПІВПЕРЕКЛАДЕНОГО ПРОДУКТУ
// --------------------------------------------
// Поки в data/i18n/config.json не стоїть "publish": true, мовні версії
// і перемикач живуть лише на dev (SITE_ENV=development). Прод-збірка
// стирає en/ і ru/ та прибирає вставки з українських сторінок — тож
// незакінчений переклад не потрапить ні до людей, ні в пошук.
//
// ЗАПУСК: node scripts/build-locales.js (у npm run build — перед
// apply-cache-version, щоб і мовні сторінки отримали версії файлів).
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const { SITE_URL, ENV_NAME } = require("./site-env");
const Core = require("../assets/js/i18n-core.js");

const ROOT = path.join(__dirname, "..");
const LOCALES = ["en", "ru"];

const STRINGS_FILE = path.join(ROOT, "data/i18n/strings.json");
const CONFIG_FILE = path.join(ROOT, "data/i18n/config.json");

// Юридичні сторінки — український текст, лише помітка зверху.
const LEGAL = new Set(["offer.html", "privacy-policy.html", "return-warranty.html"]);

const LEGAL_NOTE = {
    en: "This document is provided in Ukrainian only. The Ukrainian version is the legally binding one.",
    ru: "Этот документ доступен только на украинском языке. Юридически действующей является украинская версия."
};

const SKIP = new Set(["node_modules", ".git", ".claude", ".playwright-mcp", "admin", "tests", "docs",
    "supabase", "assets", "data", "scripts", "archive", "en", "ru"]);

const ATTRS = ["alt", "title", "placeholder", "aria-label"];
const META = /^(description|og:title|og:description|twitter:title|twitter:description|og:image:alt)$/;

// Позначки для вставок в українські сторінки: за ними вставку легко
// знайти, замінити або прибрати — і збірка лишається ідемпотентною.
const MARK_START = "<!-- i18n:begin -->";
const MARK_END = "<!-- i18n:end -->";

function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; }
}

function enabled() {
    const config = readJson(CONFIG_FILE, {});
    return Boolean(config.publish) || ENV_NAME === "development";
}

// Опубліковані сторінки: шлях від кореня → файл.
function pages() {

    const out = [];

    const walk = (dir, rel) => {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            if (SKIP.has(entry.name) || entry.name.startsWith(".")) return;
            const full = path.join(dir, entry.name);
            const next = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(full, next);
            else if (entry.name.endsWith(".html")) out.push(next);
        });
    };

    walk(ROOT, "");

    return out.filter(rel => {
        const head = fs.readFileSync(path.join(ROOT, rel), "utf8").slice(0, 4000);
        // Сторінки-перенаправлення (старі адреси товарів) не дублюємо.
        return !/http-equiv=["']refresh["']/i.test(head);
    });

}

// Файл → публічна адреса: «cart.html» → «/cart», «p/x/index.html» → «/p/x/».
function urlPath(rel) {
    if (rel === "index.html") return "/";
    if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
    return "/" + rel.replace(/\.html$/, "");
}

function hreflangBlock(rel) {
    const p = urlPath(rel);
    const lines = ["uk", ...LOCALES].map(lang =>
        `<link rel="alternate" hreflang="${lang}" href="${SITE_URL}${Core.localizePath(p, lang)}">`);
    lines.push(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}${p}">`);
    return lines.join("\n");
}

const SCRIPTS = [
    '<script src="/assets/js/i18n-core.js" defer></script>',
    '<script src="/assets/js/i18n.js" defer></script>'
].join("\n");

// Перемикач — випадний список (побажання власника).
//
// <details>, а не кнопка з власним JS: розкривається й закривається
// без жодного скрипта, клавіатура й читалка знають його з коробки.
// JS (i18n.js) лише закриває список кліком поза ним і Escape.
//
// Закритим видно коротку назву поточної мови («УКР»), у списку — повні
// назви кожна своєю мовою: людина, що не читає українською, впізнає
// «English» чи «Русский», а не «Англійська». Поточна мова в списку —
// aria-current, без посилання на саму себе.
function switcher(rel, current) {
    const p = urlPath(rel);
    const short = { uk: "УКР", en: "EN", ru: "RU" };
    const names = { uk: "Українська", en: "English", ru: "Русский" };
    const aria = { uk: "Мова сайту", en: "Site language", ru: "Язык сайта" }[current];
    const items = ["uk", ...LOCALES].map(lang => lang === current
        ? `<li><span class="lang-switch-option" aria-current="true" lang="${lang}">${names[lang]}</span></li>`
        : `<li><a class="lang-switch-option" href="${Core.localizePath(p, lang)}" hreflang="${lang}" lang="${lang}">${names[lang]}</a></li>`);
    return `<nav class="lang-switch" aria-label="${aria}" translate="no">`
        + `<details class="lang-switch-menu">`
        + `<summary class="lang-switch-current" aria-label="${aria}: ${names[current]}"><span>${short[current]}</span></summary>`
        + `<ul class="lang-switch-list">${items.join("")}</ul>`
        + `</details></nav>`;
}

// ── Українські сторінки: точкові вставки ────────────────────────────

function stripInserts(html) {
    return html
        .replace(new RegExp(`\\n?${MARK_START}[\\s\\S]*?${MARK_END}`, "g"), "")
        // Разом із переносом і відступом, які ставить decorateUk: інакше
        // кожна збірка дописувала б до сторінки ще один порожній рядок.
        .replace(/\n[ \t]*<nav class="lang-switch"[\s\S]*?<\/nav>/g, "")
        .replace(/<nav class="lang-switch"[\s\S]*?<\/nav>/g, "");
}

function decorateUk(rel, html, on) {

    let out = stripInserts(html);

    if (!on) return out;

    // hreflang і скрипти — у <head>.
    out = out.replace(/<\/head>/i, `${MARK_START}\n${hreflangBlock(rel)}\n${SCRIPTS}\n${MARK_END}\n</head>`);

    // Перемикач — першим у групі значків шапки: окремим елементом
    // шапки він ділив би з лого й меню вільне місце, якого на межі
    // мобільного вигляду майже немає.
    out = out.replace(/<div class="header-icons">/, m => `${m}\n            ${switcher(rel, "uk")}`);

    return out;

}

// ── Мовні копії: повний розбір ─────────────────────────────────────

function translateDocument(document, t, lang) {

    const skip = el => el.closest("script, style, noscript, [translate='no'], [data-no-i18n], .lang-switch");

    const walker = document.createTreeWalker(document.documentElement, 4);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);

    let total = 0, done = 0;
    const missing = new Map();

    nodes.forEach(node => {
        if (!node.parentElement || skip(node.parentElement)) return;
        const before = node.textContent;
        if (!/[а-яіїєґ]/i.test(before)) return;
        total += 1;
        const after = t(before);
        if (after !== before) { node.textContent = after; done += 1; }
        else missing.set(Core.normalize(before), (missing.get(Core.normalize(before)) || 0) + 1);
    });

    document.querySelectorAll("*").forEach(el => {
        if (skip(el) && !el.matches("meta")) return;
        ATTRS.forEach(attr => {
            const v = el.getAttribute(attr);
            if (v && /[а-яіїєґ]/i.test(v)) {
                total += 1;
                const after = t(v);
                if (after !== v) { el.setAttribute(attr, after); done += 1; }
                else missing.set(Core.normalize(v), (missing.get(Core.normalize(v)) || 0) + 1);
            }
        });
    });

    document.querySelectorAll("meta[name], meta[property]").forEach(meta => {
        const key = meta.getAttribute("name") || meta.getAttribute("property");
        if (!META.test(key)) return;
        const v = meta.getAttribute("content");
        if (v && /[а-яіїєґ]/i.test(v)) {
            total += 1;
            const after = t(v);
            if (after !== v) { meta.setAttribute("content", after); done += 1; }
            else missing.set(Core.normalize(v), (missing.get(Core.normalize(v)) || 0) + 1);
        }
    });

    return { total, done, missing };

}

function buildCopy(rel, html, lang, t) {

    const dom = new JSDOM(html);
    const { document } = dom.window;

    document.documentElement.setAttribute("lang", lang);

    // Ресурси — від кореня. У сторінок /p/… <base> уже є; кореневим
    // (cart.html тощо) він потрібен саме тут, бо копія лежить у /en/.
    if (!document.querySelector("base")) {
        const base = document.createElement("base");
        base.setAttribute("href", "/");
        document.head.insertBefore(base, document.head.firstChild);
    }

    const stats = LEGAL.has(rel) ? { total: 0, done: 0, missing: new Map() } : translateDocument(document, t, lang);

    if (LEGAL.has(rel)) {
        // Помітка зверху основного вмісту; заголовок і текст — українські.
        const note = document.createElement("p");
        note.className = "legal-lang-note";
        note.setAttribute("role", "note");
        note.textContent = LEGAL_NOTE[lang];
        const host = document.querySelector("main") || document.querySelector(".breadcrumbs") || document.body;
        if (host.tagName === "MAIN") host.insertBefore(note, host.firstChild);
        else host.parentNode.insertBefore(note, host.nextSibling);
        // Назви меню й шапки все одно перекладаємо — документ лишається
        // українським, а навігація сайту — ні.
        const walker = document.createTreeWalker(document.body, 4);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.parentElement || !n.parentElement.closest("header, footer, .breadcrumbs")) continue;
            const after = t(n.textContent);
            if (after !== n.textContent) n.textContent = after;
        }
    }

    // Посилання на сторінки — з префіксом мови.
    document.querySelectorAll("a[href]").forEach(a => {
        if (a.closest(".lang-switch")) return;
        a.setAttribute("href", Core.localizeHref(a.getAttribute("href"), lang));
    });

    document.querySelectorAll("form[action]").forEach(form => {
        form.setAttribute("action", Core.localizeHref(form.getAttribute("action"), lang));
    });

    // canonical, og:url — на свою мовну адресу.
    const own = SITE_URL + Core.localizePath(urlPath(rel), lang);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", own);
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", own);
    const ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) ogLocale.setAttribute("content", lang === "en" ? "en_US" : "ru_UA");

    // Українські вставки (hreflang, скрипти, перемикач) у копію не
    // переносимо як є — ставимо свої.
    let out = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
    out = stripInserts(out);
    out = out.replace(/<\/head>/i, `${MARK_START}\n${hreflangBlock(rel)}\n` +
        `<link rel="preload" href="/data/i18n-${lang}.json" as="fetch" crossorigin>\n${SCRIPTS}\n${MARK_END}\n</head>`);
    out = out.replace(/<div class="header-icons">/, m => `${m}\n            ${switcher(rel, lang)}`);

    return { html: out, stats };

}

// Словник для браузера — лише своя мова, щоб не тягнути зайве.
function writeRuntimeDictionaries(dict) {
    LOCALES.forEach(lang => {
        const one = {};
        Object.keys(dict).forEach(key => {
            if (dict[key] && dict[key][lang]) one[key] = { [lang]: dict[key][lang] };
        });
        fs.writeFileSync(path.join(ROOT, "data", `i18n-${lang}.json`), JSON.stringify(one) + "\n", "utf8");
    });
}

function main() {

    const on = enabled();
    const dict = readJson(STRINGS_FILE, {});

    // Українські сторінки — вставки (або їх прибирання).
    const list = pages();

    list.forEach(rel => {
        const full = path.join(ROOT, rel);
        const html = fs.readFileSync(full, "utf8");
        const next = decorateUk(rel, html, on);
        if (next !== html) fs.writeFileSync(full, next, "utf8");
    });

    // Мовні теки щоразу будуються наново: інакше сторінка, яку видалили
    // з сайту, лишилась би жити в /en/.
    LOCALES.forEach(lang => fs.rmSync(path.join(ROOT, lang), { recursive: true, force: true }));

    if (!on) {
        LOCALES.forEach(lang => { try { fs.unlinkSync(path.join(ROOT, "data", `i18n-${lang}.json`)); } catch (e) { /* не було */ } });
        console.log("Мовні версії: вимкнено (прод без publish) — en/ і ru/ прибрано.");
        return;
    }

    writeRuntimeDictionaries(dict);

    LOCALES.forEach(lang => {

        const t = Core.createTranslator(dict, lang);
        let total = 0, done = 0;
        const missing = new Map();

        list.forEach(rel => {
            const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
            const { html: out, stats } = buildCopy(rel, html, lang, t);
            const target = path.join(ROOT, lang, rel);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, out, "utf8");
            total += stats.total; done += stats.done;
            stats.missing.forEach((n, k) => missing.set(k, (missing.get(k) || 0) + n));
        });

        const share = total ? Math.round(done / total * 100) : 100;
        console.log(`/${lang}/: ${list.length} сторінок, перекладено ${done} з ${total} текстів (${share}%), без перекладу — ${missing.size} різних рядків.`);

    });

}

if (require.main === module) main();

module.exports = { urlPath, hreflangBlock, switcher, decorateUk, stripInserts, buildCopy, pages, LEGAL, MARK_START, MARK_END };
