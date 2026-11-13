// «Повідомити, коли з'явиться»: підписка на наявність товару.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі. Лише чисті функції — щоб перевірялись тестами в Node.
// Обробник — handleStockAlert() у _index.src.ts, таблиця — міграція
// 046, розсилка — scripts/stock-alerts.js.

export const STOCK_ALERT_LIMITS = {
    email: 254,
    color: 80,
    size: 40
};

// Та сама проста перевірка, що в базі (stock_alert_add): «щось@щось.щось»
// без пробілів. Точніше пошту перевіряє лише лист, який до неї дійде.
export function normalizeStockAlertEmail(raw) {
    const email = String(raw ?? "").trim().toLowerCase();
    if (email.length < 5 || email.length > STOCK_ALERT_LIMITS.email) return null;
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function stockAlertClean(value, max) {
    return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// Повертає { ok: true, alert } або { ok: false, error }:
//   bad_email   — пошта не схожа на пошту;
//   bad_product — немає номера товару.
// Чи існує такий товар і такий колір, вирішує обробник за каталогом.
export function normalizeStockAlert(body) {

    const b = body || {};

    const email = normalizeStockAlertEmail(b.email);

    if (!email) return { ok: false, error: "bad_email" };

    const productId = Number(b.product_id);

    if (!Number.isInteger(productId) || productId <= 0) return { ok: false, error: "bad_product" };

    return {
        ok: true,
        alert: {
            email,
            product_id: productId,
            color: stockAlertClean(b.color, STOCK_ALERT_LIMITS.color),
            // Розмір — як у залишках, навіть ONESIZE: саме за цим
            // ключем scripts/stock-alerts.js шукає комірку. Ховаємо
            // заглушку лише там, де її читає людина (лист, Telegram).
            size: stockAlertClean(b.size, STOCK_ALERT_LIMITS.size),
            lang: b.lang === "en" || b.lang === "ru" ? b.lang : null
        }
    };

}

// Колір і розмір — лише ті, що є в товарі (каталог). Чужий текст сюди
// не пишемо: він потім іде в лист і в повідомлення власнику, а комірку
// залишку з вигаданим розміром розсилка не знайшла б ніколи.
//
// Повертає { color, size } або null.
export function stockAlertVariant(product, color, size) {
    const variants = Array.isArray(product && product.variants) ? product.variants : [];
    const variant = color ? variants.find(v => v && v.color === color) : variants[0];
    if (color && !variant) return null;
    const sizes = (variant && Array.isArray(variant.sizes) && variant.sizes.length)
        ? variant.sizes
        : (Array.isArray(product && product.sizes) ? product.sizes : []);
    if (size && !sizes.includes(size)) return null;
    return { color: color || '', size: size || '' };
}

// Повідомлення власнику: хто й чого чекає. Не адреса — вона власнику
// ні до чого, а в переписці Telegram зайва; досить знати, на що попит.
export function formatStockAlert(product, alert, escape) {

    const esc = typeof escape === "function" ? escape : (v) => String(v ?? "");

    const size = /^onesize$/i.test(alert.size || "") ? "" : alert.size;
    const variant = [alert.color, size].filter(Boolean).join(" / ");

    return [
        "🔔 <b>Чекають на наявність</b>",
        "",
        `${esc([product.brand, product.title].filter(Boolean).join(" "))}`,
        variant ? `Варіант: ${esc(variant)}` : "",
        "",
        "Людина залишила пошту — щойно цей варіант буде в наявності, лист піде сам (scripts/stock-alerts.js).",
    ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");

}
