// Заявка на байєр-сервіс: людина лишає посилання на річ, якої немає в
// каталозі, — власнику прилітає Telegram із усім, що треба для
// розрахунку.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі. Лише чисті функції — щоб перевірялись тестами в Node (так
// само, як call-back.js). Обробник із межами й відправкою — у
// _index.src.ts, handleBuyerRequest().
//
// ЧОМУ ПЕРЕВІРЯЄМО ТУТ, ХОЧ СТОРІНКА ВЖЕ ПЕРЕВІРИЛА
// ---------------------------------------------------
// Запит до функції можна надіслати й без сторінки. Перевірка в
// браузері — зручність для людини, ця — єдина справжня. А текст
// потрапляє в повідомлення з parse_mode HTML: усе, що прийшло від
// клієнта, екранується, а посилання беремо лише http(s).

import { normalizeCallBackPhone } from "./call-back.js";

export const BUYER_LIMITS = {
    links: 5,        // посилань в одній заявці
    link: 500,       // знаків в одному посиланні
    name: 80,
    details: 1000,   // «розмір, колір, побажання»
    budget: 10000000 // грн — стеля здорового глузду
};

// Варіанти доставки — ті самі, що в таблиці на сторінці. Ключ, а не
// текст: сторінка буває англійською й російською, а власник читає
// українською.
export const BUYER_DELIVERY = {
    advise: "Порадьте найвигідніший",
    europe: "З Європи",
    sea: "Морем із США",
    air: "Авіа із США"
};

export const BUYER_CONTACT = {
    telegram: "Telegram",
    viber: "Viber",
    call: "Дзвінок"
};

function buyerClean(value, max) {
    return String(value ?? "")
        // Керівні символи (окрім переносу рядка) — геть: у Telegram
        // вони ламають розмітку, а людині не потрібні.
        .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, max);
}

// Посилання — з поля, де людина пише «одне в рядку», але насправді
// вставляє через пробіл, кому чи взагалі разом із текстом. Тому шукаємо
// самі адреси, а не ділимо за рядками.
export function buyerLinks(raw) {

    const found = String(raw ?? "").match(/https?:\/\/[^\s<>"'«»]+/gi) || [];

    const out = [];

    for (const candidate of found) {

        // Хвостова пунктуація з речення — не частина адреси.
        const link = candidate.replace(/[.,;:!?)\]]+$/, "");

        if (link.length > BUYER_LIMITS.link) continue;

        let url;
        try { url = new URL(link); } catch (_) { continue; }

        // Протокол окремо не перевіряємо: регулярка вище бере лише
        // http:// і https://, тож javascript: чи data: сюди не доходять.

        // Адреса без крапки в імені вузла (http://localhost, http://1) —
        // не магазин.
        if (!url.hostname.includes(".")) continue;

        if (!out.includes(link)) out.push(link);

        if (out.length >= BUYER_LIMITS.links) break;
    }

    return out;

}

// Повертає { ok: true, request } або { ok: false, error }.
//
// Коди помилок — ті, на які сторінка показує людині зрозуміле:
//   bad_phone   — номер не схожий на український;
//   no_item     — немає ні посилання, ні опису речі;
//   no_name     — ім'я порожнє;
//   no_consent  — не погодився на обробку даних.
export function normalizeBuyerRequest(body) {

    const b = body || {};

    const phone = normalizeCallBackPhone(b.phone);

    if (!phone) return { ok: false, error: "bad_phone" };

    const name = buyerClean(b.name, BUYER_LIMITS.name);

    if (!name) return { ok: false, error: "no_name" };

    const links = buyerLinks(b.links);

    // Опис без посилань теж годиться: «Coach Tabby 26, чорна» — цього
    // власнику досить, щоб знайти. А от зовсім порожня заявка — ні.
    const details = buyerClean(b.details, BUYER_LIMITS.details);

    if (!links.length && details.replace(/\s/g, "").length < 3) return { ok: false, error: "no_item" };

    if (b.consent !== true) return { ok: false, error: "no_consent" };

    const delivery = Object.prototype.hasOwnProperty.call(BUYER_DELIVERY, b.delivery) ? b.delivery : "advise";
    const contact = Object.prototype.hasOwnProperty.call(BUYER_CONTACT, b.contact) ? b.contact : "call";

    const budgetDigits = String(b.budget ?? "").replace(/\D/g, "");
    const budget = budgetDigits ? Math.min(Number(budgetDigits), BUYER_LIMITS.budget) : 0;

    const lang = b.lang === "en" || b.lang === "ru" ? b.lang : "uk";

    return { ok: true, request: { name, phone, links, details, delivery, contact, budget, lang } };

}

function buyerGrn(value) {
    return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} грн`;
}

const BUYER_LANG_NAME = { uk: "", en: "англійською", ru: "російською" };

export function formatBuyerRequest(req, escape) {

    const esc = typeof escape === "function" ? escape : (v) => String(v ?? "");

    return [
        "🛍 <b>Заявка на байєр-сервіс</b>",
        "",
        `👤 ${esc(req.name)}`,
        `📞 <a href="tel:${esc(req.phone)}">${esc(req.phone)}</a> — відповісти: <b>${esc(BUYER_CONTACT[req.contact])}</b>`,
        req.lang !== "uk" ? `🌐 Заявку заповнено ${BUYER_LANG_NAME[req.lang]} — відповідайте тією ж мовою` : "",
        "",
        req.links.length ? "🔗 <b>Що викупити:</b>" : "",
        ...req.links.map((link, i) => `${i + 1}. ${esc(link)}`),
        req.details ? `📝 ${esc(req.details)}` : "",
        "",
        `🚚 Доставка: ${esc(BUYER_DELIVERY[req.delivery])}`,
        req.budget ? `💰 Бюджет: до ${buyerGrn(req.budget)}` : "",
        "",
        "Обіцяли повний розрахунок протягом робочого дня.",
    ].filter((line, i, all) => line !== "" || (all[i - 1] !== "" && i > 0)).join("\n").trim();

}
