// Група перемикачів мусить мати спільну назву.
//
// ЗАМІРЯНО НА ПРОДІ 25.09.2026, сторінка /checkout
// ------------------------------------------------
// Три групи перемикачів, десять штук разом:
//
//     deliveryMethod   4   спосіб доставки
//     paymentMethod    2   спосіб оплати
//     contactChannel   4   спосіб зв'язку
//
// Жодного <fieldset>, жодного role="radiogroup" — нуль на всю
// сторінку. Читач екрана озвучує «Telegram, перемикач, 3 з 4», і
// людина не знає, на яке з трьох питань це відповідь. Найгірше саме
// зі зв'язком: «Viber», «Telegram», «Email» самі по собі не кажуть
// нічого. WCAG 1.3.1 «Інформація та взаємозв'язки», рівень A.
//
// Причому взірець у проєкті вже був: оцінка відгуку на сторінці
// товару має role="radiogroup" aria-label="Оцінка". Оформлення
// просто відстало — тобто це неузгодженість, а не нова вимога.
//
// ЧОМУ ПЕРЕВІРКА ЧИТАЄ DOM, А НЕ ШУКАЄ ПІДРЯДОК
// ---------------------------------------------
// Пошук по тексту сказав би лише «role="radiogroup" десь є». Питання
// інше: чи має КОЖНА група обгортку, і чи має та обгортка НАЗВУ —
// aria-labelledby мусить ще й влучити в наявний id. Це перевіряється
// тільки розбором сторінки.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// Кореневі сторінки — це і самостійні сторінки, і шаблони. Плюс по
// одному зразку згенерованого: групи мусять пережити генератор.
const PAGES = fs.readdirSync(ROOT)
    .filter(f => f.endsWith(".html"))
    .concat(["p", "brands", "categories"].flatMap(dir => {
        const full = path.join(ROOT, dir);
        if (!fs.existsSync(full)) return [];
        const first = fs.readdirSync(full).find(d =>
            fs.existsSync(path.join(full, d, "index.html")));
        return first ? [`${dir}/${first}/index.html`] : [];
    }))
    .filter(f => fs.existsSync(path.join(ROOT, f)));

// Назва обгортки так, як її обчислює браузер.
function groupName(doc, box) {

    const label = box.getAttribute("aria-label");
    if (label && label.trim()) return label.trim();

    const by = box.getAttribute("aria-labelledby");

    if (by) {
        const parts = by.split(/\s+/)
            .map(id => doc.getElementById(id))
            .filter(Boolean)
            .map(el => el.textContent.trim());
        if (parts.length) return parts.join(" ");
    }

    if (box.tagName === "FIELDSET") {
        const legend = box.querySelector("legend");
        if (legend && legend.textContent.trim()) return legend.textContent.trim();
    }

    return "";

}

const безГрупи = [];
const безНазви = [];
const чужіДіти = [];
let груп = 0;

PAGES.forEach(rel => {

    const doc = new JSDOM(fs.readFileSync(path.join(ROOT, rel), "utf8")).window.document;

    const byName = new Map();

    doc.querySelectorAll("input[type=radio]").forEach(r => {
        const n = r.getAttribute("name") || "";
        if (!byName.has(n)) byName.set(n, []);
        byName.get(n).push(r);
    });

    byName.forEach((radios, name) => {

        // Один перемикач — не група: питання в його власному підписі.
        if (radios.length < 2) return;

        груп++;

        const box = radios[0].closest("fieldset, [role=radiogroup], [role=group]");

        if (!box) { безГрупи.push(`${rel}: ${name} (${radios.length})`); return; }

        if (!groupName(doc, box)) безНазви.push(`${rel}: ${name}`);

        // role="radiogroup" обіцяє, що всередині САМІ перемикачі.
        // Якщо там ще й текстові поля — обіцянка неправдива, і читач
        // екрана озвучить вміст неправильно. Для мішаного вмісту є
        // role="group".
        if (box.getAttribute("role") === "radiogroup") {

            const чужі = [...box.querySelectorAll("input, select, textarea")]
                .filter(el => el.getAttribute("type") !== "radio");

            if (чужі.length) {
                чужіДіти.push(`${rel}: ${name} → ${чужі.map(e => e.id || e.type).join(", ")}`);
            }

        }

    });

});

console.log("\n[1] Кожна група перемикачів має обгортку");
{
    console.log(`  · груп знайдено: ${груп} на ${PAGES.length} сторінках`);

    check("групи взагалі є, інакше перевіряти нічого", груп > 0);

    check("жодна група не лишилась без обгортки",
        безГрупи.length === 0, безГрупи.join("; "));
}

console.log("\n[2] Обгортка має назву");
{
    check("кожна обгортка названа",
        безНазви.length === 0, безНазви.join("; "));
}

console.log("\n[3] radiogroup не містить чужих полів");
{
    // Саме сюди я мало не вступив: у блоці доставки поруч із
    // перемикачами лежать «номер відділення» й «адреса кур'єру», тож
    // там може бути лише role="group".
    check("у radiogroup самі перемикачі",
        чужіДіти.length === 0, чужіДіти.join("; "));
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
