// Переносить поріг безкоштовної доставки з data/delivery.json у тексти
// сторінок.
//
// НАВІЩО ОКРЕМИЙ КРОК
// --------------------
// Поріг міняє власник в адмінці (Налаштування → «Безкоштовна
// доставка»), а говорять про нього статичні сторінки: «Оплата і
// доставка», відповідь у питаннях, оферта. Якби
// число було вписане в них руками, зміна в адмінці дійшла б до кошика,
// а на сторінці доставки й в оферті лишився б старий поріг — тобто
// дві різні обіцянки, і юридично чинна з них та, що в оферті.
//
// Тому текст цих абзаців пише ЦЕЙ КРОК, а в розмітці лише позначка:
//
//     <p data-free-delivery="page">…</p>
//
// Значення атрибута — котрий текст (TEMPLATES нижче). Поріг 0 чи
// порожньо — абзац стає порожнім і схованим (hidden): пропозиції
// немає, і жодна сторінка про неї не пише. Розмітку питань (FAQPage)
// збирає з видимого тексту scripts/build-faq-schema.js — тому цей крок
// стоїть ПЕРЕД ним, і перед build-locales.js та build-chat-bot.js, які
// беруть той самий текст.
//
// Переклад: у data/i18n/strings.json ці речення лежать шаблонами з
// {#} — число в них міняється, а переклад лишається.

const fs = require("fs");
const path = require("path");
const safe = require("./fs-retry");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "data", "delivery.json");

// «Де моє замовлення» порогу в тексті не має: там видно суму
// конкретного замовлення, і assets/js/order-status.js сам міняє
// речення про доставку, коли воно безкоштовне.
const PAGES = ["delivery-payment.html", "offer.html"];

// Пробіл між тисячами — звичайний: у тексті сторінки, у FAQ-розмітці й
// у відповіді бота однаково, і шаблон перекладу ловить обидва.
function money(value) {
    return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} грн`;
}

const TEMPLATES = {

    // Сторінка «Оплата і доставка» — під таблицею способів.
    page: from => `Замовлення від ${money(from)} доставляємо безкоштовно: відправку будь-яким способом оплачує магазин. Для решти замовлень діє тариф перевізника.`,

    // Відповідь на «Скільки коштує доставка?» — ПІСЛЯ пояснення тарифу:
    // так відповідь повна і з порогом, і без нього (абзац схований).
    // Ту саму відповідь бере бот у чаті (scripts/build-chat-bot.js).
    faq: from => `Замовлення від ${money(from)} доставляємо безкоштовно — відправку оплачує магазин.`,

    // Оферта, розділ про доставку — одразу після «доставку оплачує
    // Покупець». «Виняток» — щоб абзац читався як уточнення до
    // попереднього, а коли поріг вимкнено і абзацу немає, попередній
    // лишався повним і правдивим сам по собі.
    offer: from => `Виняток: замовлення на суму від ${money(from)} (з урахуванням знижок) Продавець доставляє за власний рахунок — вартість доставки оплачує Продавець, і Покупець перевізнику за неї не платить.`

};

function readThreshold() {

    if (!fs.existsSync(SRC)) return 0;

    const data = JSON.parse(safe.readFileSync(SRC, "utf8"));

    const n = Math.round(Number(data && data.freeFrom));

    return Number.isFinite(n) && n > 0 ? n : 0;

}

// <p data-free-delivery="page" …>текст</p> — і тільки абзаци без
// вкладених тегів: текст цілком наш.
const MARK_RE = /<p([^>]*?)\sdata-free-delivery="([a-z]+)"([^>]*)>([^<]*)<\/p>/g;

function apply(html, from, file) {

    let found = 0;

    const out = html.replace(MARK_RE, (all, before, kind, after, text) => {

        const template = TEMPLATES[kind];

        if (!template) throw new Error(`${file}: невідомий data-free-delivery="${kind}"`);

        found++;

        const attrs = (before + after).replace(/\shidden(?:="[^"]*")?/g, "");

        // Відступ перед текстом зберігаємо: діфф після збірки — лише
        // число, а не переформатований абзац.
        const indent = (text.match(/^\s*/) || [""])[0];
        const tail = (text.match(/\s*$/) || [""])[0];

        return from
            ? `<p${attrs} data-free-delivery="${kind}">${indent}${template(from)}${tail}</p>`
            : `<p${attrs} data-free-delivery="${kind}" hidden></p>`;

    });

    return { out, found };

}

function main() {

    const from = readThreshold();

    PAGES.forEach(file => {

        const full = path.join(ROOT, file);

        const html = safe.readFileSync(full, "utf8");

        const { out, found } = apply(html, from, file);

        // Сторожа: позначку прибрали правкою сторінки — збірка мусить
        // про це сказати, а не мовчки лишити сторінку без порогу.
        if (!found) throw new Error(`${file}: не знайшлось жодного data-free-delivery — поріг туди не дійде`);

        if (out !== html) safe.writeFileSync(full, out);

    });

    console.log(from
        ? `✓ Безкоштовна доставка від ${money(from)} — у ${PAGES.length} сторінках`
        : "✓ Безкоштовної доставки немає — абзаци про неї сховано");

}

if (require.main === module) main();

module.exports = { apply, readThreshold, money, TEMPLATES };
