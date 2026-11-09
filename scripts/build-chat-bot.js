// Довідка для бота в чаті: data/chat-bot.json.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Бот відповідає з Edge Function (supabase/functions/telegram-order-bot/
// chat-bot.js) — без мовної моделі, за ключовими словами (рішення
// власника 09.11.2026: безкоштовно). Йому потрібні дві речі:
//
//   • ЧАСТІ ПИТАННЯ — ті самі, що на сторінках «Оплата і доставка»,
//     «Оригінальність», «Байєр-сервіс», «Повернення». Беремо їх із
//     розмітки FAQPage зібраних сторінок (її, своєю чергою, будує
//     build-faq-schema.js з видимого акордеона). Тобто відповідь бота —
//     дослівно те, що написано на сайті, і розійтись з ним вона не може.
//     Для /en/ і /ru/ — з мовних копій тих самих сторінок.
//
//   • КАТАЛОГ — стисло: назва трьома мовами, бренд, категорія, стать,
//     кольори, ціна, знижка, наявність, перше фото. 103 товари в
//     products.json важать сотні кілобайт; боту з них треба кілька
//     полів.
//
// ЗАПУСК: після build-locales (потрібні мовні копії й словники) і до
// apply-cache-version.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const Core = require("../assets/js/i18n-core.js");

const OUT = path.join(ROOT, "data", "chat-bot.json");
const LANGS = ["uk", "en", "ru"];

// Сторінки з частими питаннями. Порядок — пріоритет: на питання «скільки
// коштує доставка» відповідає сторінка доставки, а не байєр-сервісу,
// де теж є слово «доставка».
const FAQ_PAGES = ["delivery-payment", "authenticity", "return-warranty", "bayer-service"];

// Юридичні сторінки на /en/ і /ru/ лишаються українськими (рішення
// власника). Їхні відповіді іншою мовою бот не віддає — дивись
// chat-bot.js, TOPICS.returns.
const LEGAL = new Set(["return-warranty"]);

function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; }
}

function pageFile(page, lang) {
    const rel = `${page}.html`;
    return path.join(ROOT, lang === "uk" ? rel : path.join(lang, rel));
}

function faqOf(page, lang) {

    const file = pageFile(page, lang);

    if (!fs.existsSync(file)) return [];

    const html = fs.readFileSync(file, "utf8");

    const out = [];

    for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
        let data;
        try { data = JSON.parse(m[1]); } catch (error) { continue; }
        if (!data || data["@type"] !== "FAQPage" || !Array.isArray(data.mainEntity)) continue;
        data.mainEntity.forEach(item => {
            const q = String(item && item.name || "").trim();
            const a = String(item && item.acceptedAnswer && item.acceptedAnswer.text || "").trim();
            if (q && a) out.push({ q, a, page: "/" + page });
        });
    }

    return out;

}

// Чи лишився в перекладі український текст — тоді такої відповіді
// цією мовою немає.
function stillUkrainian(text, lang) {
    if (lang === "uk") return false;
    return lang === "en" ? /[а-яіїєґ]/i.test(text) : /[іїєґ]/i.test(text);
}

function buildFaq() {

    const faq = {};

    LANGS.forEach(lang => {
        faq[lang] = [];
        FAQ_PAGES.forEach(page => {
            if (lang !== "uk" && LEGAL.has(page)) return;
            faqOf(page, lang).forEach(item => {
                if (stillUkrainian(item.q + item.a, lang)) return;
                faq[lang].push(item);
            });
        });
    });

    return faq;

}

function translators() {
    const out = { uk: text => text };
    ["en", "ru"].forEach(lang => {
        const dict = readJson(path.join(ROOT, "data", `i18n-${lang}.json`), null);
        out[lang] = dict ? Core.createTranslator(dict, lang) : (text => text);
    });
    return out;
}

function buildProducts() {

    const products = readJson(path.join(ROOT, "data", "products.json"), []);
    const categories = readJson(path.join(ROOT, "data", "categories.json"), []);
    const department = new Map(categories.map(c => [c.name, c.department || ""]));
    const t = translators();

    return products.filter(p => p && p.slug && p.title).map(p => {

        const title = {};
        LANGS.forEach(lang => {
            const local = t[lang](String(p.title));
            // Переклад, у якому лишилась українська, — гірший за
            // український оригінал: бот покаже оригінал.
            title[lang] = stillUkrainian(local, lang) ? String(p.title) : local;
        });

        const colors = [...new Set([p.color, ...(p.variants || []).map(v => v && v.color)]
            .filter(Boolean).map(String))];

        const image = String((p.images || [])[0] || ((p.variants || [])[0] || {}).images?.[0] || "")
            .split("?")[0].replace(/^\/?/, "/");

        return {
            slug: p.slug,
            title,
            brand: String(p.brand || ""),
            category: String(p.category || ""),
            department: department.get(p.category) || "",
            gender: [].concat(p.gender || []),
            colors,
            price: Number(p.price) || 0,
            ...(p.oldPrice ? { oldPrice: Number(p.oldPrice) } : {}),
            ...(p.sale && p.sale.price ? { sale: { price: Number(p.sale.price), from: p.sale.from || null, to: p.sale.to || null } } : {}),
            inStock: p.inStock !== false,
            preOrder: Boolean(p.preOrder),
            isNew: Boolean(p.isNew),
            keywords: String(p.searchKeywords || "").slice(0, 300),
            image: image === "/" ? "" : image
        };

    });

}

function main() {

    const notifications = readJson(path.join(ROOT, "data", "notifications.json"), {});

    const data = {
        // Вимикач в адмінці («Бот у чаті»). Немає поля — увімкнено.
        enabled: notifications.chatBot !== false,
        faq: buildFaq(),
        products: buildProducts()
    };

    fs.writeFileSync(OUT, JSON.stringify(data) + "\n", "utf8");

    const size = Math.round(fs.statSync(OUT).size / 1024);

    console.log(`Бот у чаті: ${data.products.length} товарів, питань ` +
        LANGS.map(l => `${l} ${data.faq[l].length}`).join(" / ") + ` → data/chat-bot.json (${size} КБ)` +
        (data.enabled ? "" : " — ВИМКНЕНО в адмінці"));

}

if (require.main === module) main();

module.exports = { buildFaq, buildProducts, faqOf, FAQ_PAGES };
