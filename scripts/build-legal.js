// Тримає реквізити в оферті у згоді з data/legal.json.
//
// НАВІЩО ОКРЕМИЙ КРОК
// --------------------
// Оферта — єдина сторінка сайту, де юридично важливо, ЩО САМЕ там
// написано: хто продавець, за якою адресою, з якого числа діє ця
// редакція. Такі речі змінюються не тоді, коли хтось редагує код, а
// коли власник зареєстрував ФОП або переїхав.
//
// Тому реквізити лежать у data/legal.json (адмінка → Сторінки →
// «Продавець і оферта»), а цей крок переносить їх у розмітку. Той
// самий підхід, що й у scripts/build-home-static.js: у HTML лежить
// готовий текст (він потрібен пошуковикам і людям без JS), але
// джерело правди — файл даних.
//
// ЩЕ ЦЕЙ КРОК ЛАГОДИТЬ ТЕЛЕФОН НА ВСЬОМУ САЙТІ
// -----------------------------------------------
// У розмітці підвалу стояло href="tel:+380000000000" — заглушка,
// поруч зі справжнім номером у видимому тексті. Працювало тому,
// що syncPhoneLinks() у assets/js/common.js будує href із тексту
// при завантаженні сторінки.
//
// Для людини з JS це непомітно. Але HTML читають і без JS:
// довідники, парсери, Google Business, лист, у який скопіювали
// підвал. Вони бачили мертвий номер.
//
// Гірше інше: номер жив У РОЗМІТЦІ 149 сторінок, а поле «телефон»
// в адмінці керувало лише реквізитами оферти. Змінивши його,
// власник змінив би номер на одній сторінці з 149.
//
// Тепер цей крок пише з data/legal.json і посилання, і видимий
// текст. Джерело правди одне.

// ПОРОЖНЄ ПОЛЕ = РЯДКА НЕМАЄ
// ---------------------------
// Поки ФОП не зареєстрований, у документі не повинно бути ні
// «ФОП —», ні порожнього місця після двокрапки: недописані реквізити
// в договорі виглядають гірше, ніж їх відсутність. Заповнили поле —
// рядок з'явився сам.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const SRC = path.join(ROOT, "data", "legal.json");
const PAGE = path.join(ROOT, "offer.html");

const MONTHS = [
    "січня", "лютого", "березня", "квітня", "травня", "червня",
    "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"
];

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// «2026-09-06» → «6 вересня 2026 р.»
function formatDate(iso) {

    const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return "";

    const month = MONTHS[Number(match[2]) - 1];

    if (!month) return "";

    return `${Number(match[3])} ${month} ${match[1]} р.`;

}

// Телефон для tel: — без пробілів і дужок, інакше частина телефонів
// на Android не набирається.
function telHref(phone) {
    return String(phone).replace(/[^\d+]/g, "");
}

// Телефон у розмітці: і посилання, і видимий текст.
//
// Повертає новий HTML. Чиста функція — щоб перевірялась тестом
// без файлів на диску.
//
// ПОРОЖНЄ ПОЛЕ НІЧОГО НЕ ЧІПАЄ. Якщо номер в адмінці стерли, ми не
// стираємо його з усіх сторінок: порожній підвал гірший за
// підстаркуватий номер, а власник, який випадково зберіг порожнє
// поле, дізнався б про це від покупця.
function syncPhoneLinks(html, phone) {

    const clean = String(phone || "").trim();

    // Менше десяти цифр — це не номер, а недописане поле. Та сама
    // межа, що в assets/js/common.js.
    if (clean.replace(/\D/g, "").length < 10) return html;

    const href = telHref(clean);

    // Розмітка однотипна на всьому сайті (перевірено: два варіанти,
    // обидва з однаковим порядком атрибутів). Тому регулярка, а не
    // розбір HTML: остання тут була б важчою за задачу.
    return html.replace(
        /<a class="phone-link" href="tel:[^"]*">[^<]*<\/a>/g,
        `<a class="phone-link" href="tel:${escapeHtml(href)}">${escapeHtml(clean)}</a>`
    );

}

function buildRequisites(legal) {

    const lines = [];

    const add = (label, value) => {
        if (value) lines.push(`                <li><strong>${label}:</strong> ${value}</li>`);
    };

    add("Продавець", escapeHtml(legal.sellerName || ""));
    add("Юридична назва", escapeHtml(legal.legalName || ""));
    add("Реєстраційний номер", escapeHtml(legal.registrationNumber || ""));
    add("Адреса", escapeHtml(legal.address || ""));

    if (legal.email) {
        add("Email", `<a class="mail-link" href="mailto:${escapeHtml(legal.email)}">${escapeHtml(legal.email)}</a>`);
    }

    if (legal.phone) {
        add("Телефон", `<a class="phone-link" href="tel:${escapeHtml(telHref(legal.phone))}">${escapeHtml(legal.phone)}</a>`);
    }

    if (legal.telegram) {
        const login = String(legal.telegram).replace(/^@/, "");
        add("Telegram", `<a class="tg-link" href="https://t.me/${escapeHtml(login)}" target="_blank" rel="noopener">@${escapeHtml(login)}</a>`);
    }

    return lines.join("\n");

}

// Усі сторінки сайту: корінь плюс згенеровані теки.
//
// node_modules і .git пропускаємо очевидно, а .claude — це робочі
// копії репозиторію (git worktree), тобто ті самі файли вдруге.
function htmlPages(dir, found) {

    const list = found || [];

    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

        if (entry.name === "node_modules" || entry.name === ".git"
            || entry.name === ".claude") return;

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) htmlPages(full, list);
        else if (entry.name.endsWith(".html")) list.push(full);

    });

    return list;

}

function main() {

    if (!fs.existsSync(SRC)) {
        console.warn("Немає data/legal.json — реквізити в оферті лишаю як є");
        return;
    }

    if (!fs.existsSync(PAGE)) {
        console.warn("Немає offer.html — пропускаю");
        return;
    }

    const legal = JSON.parse(fs.readFileSync(SRC, "utf8"));

    let html = fs.readFileSync(PAGE, "utf8");

    const before = html;

    // 1. Реквізити
    const listRe = /(<ul id="offerRequisites">)([\s\S]*?)(<\/ul>)/;

    if (!listRe.test(html)) {
        throw new Error('У offer.html не знайдено <ul id="offerRequisites">');
    }

    html = html.replace(listRe, (all, open, body, close) =>
        `${open}\n${buildRequisites(legal)}\n            ${close}`);

    // 2. Дата редакції
    const revisionRe = /(<p class="legal-updated" id="offerRevision">)([^<]*)(<\/p>)/;

    if (!revisionRe.test(html)) {
        throw new Error('У offer.html не знайдено <p id="offerRevision">');
    }

    const date = formatDate(legal.revision);

    if (date) {
        html = html.replace(revisionRe, (all, open, body, close) =>
            `${open}Редакція від ${date}${close}`);
    }

    if (html === before) {
        console.log("Готово: реквізити в оферті вже збігаються з data/legal.json");
    } else {
        fs.writeFileSync(PAGE, html, "utf8");
        console.log("Готово: реквізити в offer.html оновлено з data/legal.json");
    }

    // 3. Телефон на всіх сторінках
    //
    // Крок стоїть у npm run build ПІСЛЯ генераторів сторінок товару
    // й таксономії, тож їхні 220 сторінок теж проходять через нього.
    const pages = htmlPages(ROOT);

    let fixed = 0;

    pages.forEach(file => {

        const source = fs.readFileSync(file, "utf8");

        if (!source.includes("phone-link")) return;

        const next = syncPhoneLinks(source, legal.phone);

        if (next === source) return;

        fs.writeFileSync(file, next, "utf8");

        fixed++;

    });

    console.log(fixed
        ? `Готово: телефон оновлено на ${fixed} сторінках`
        : "Готово: телефон на сторінках уже збігається з data/legal.json");

}

if (require.main === module) main();

module.exports = { buildRequisites, formatDate, telHref, syncPhoneLinks, htmlPages };
