// Незавершене оформлення: перевірка того, що прийшло з браузера.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Тут немає ні мережі, ні бази — чисті функції, які можна прогнати
// тестами в Node (той самий підхід, що в order-flow.js і subscribe.js).
//
// ЩО САМЕ ЗБЕРІГАЄМО
// -------------------
// Пошту й посилання на товари: [{product_id, color, size, qty}].
// Ні імені, ні телефону, ні адреси доставки — для листа «ви не
// завершили замовлення» вони не потрібні, а зберігати те, що не
// потрібне, не варто.
//
// ЧОМУ МЕЖІ ТАКІ ЖОРСТКІ
// -----------------------
// Це відкритий маршрут: викликати його може будь-хто з публічним
// ключем. Він мусить приймати рівно те, що надсилає наша сторінка
// оформлення, і нічого крім.

// Кошик із 40 позицій — це вже не кошик, а спроба щось зламати.
export const MAX_DRAFT_ITEMS = 40;

// Стільки ж, скільки дозволяє сторінка товару (MAX_QTY у order-flow.js).
export const MAX_DRAFT_QTY = 10;

const EMAIL_LIMIT = 160;
const TEXT_LIMIT = 60;

export function draftEmail(value) {

    const email = String(value ?? "").trim().toLowerCase();

    if (!email || email.length > EMAIL_LIMIT) return "";

    // Та сама перевірка, що на сторінці оформлення: щось@щось.щось.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";

    return email;

}

function draftText(value) {

    return String(value ?? "").trim().slice(0, TEXT_LIMIT);

}

// Позиція кошика → те, що ляже в базу.
//
// id приймаємо і як product_id, і як id: у кошику на сайті поле
// зветься id, а в базі — product_id (так само в cart_items).
export function draftItem(row) {

    if (!row || typeof row !== "object") return null;

    const id = Number(row.product_id ?? row.id);

    if (!Number.isFinite(id) || id <= 0) return null;

    const qty = Math.min(Math.max(Math.round(Number(row.qty) || 1), 1), MAX_DRAFT_QTY);

    return {
        product_id: id,
        color: draftText(row.color),
        size: draftText(row.size),
        qty,
    };

}

// Уся посилка → { ok, draft } або { ok: false, reason }.
export function cleanDraft(body) {

    const email = draftEmail(body && body.email);

    if (!email) return { ok: false, reason: "пошта не схожа на пошту" };

    const rows = Array.isArray(body && body.items) ? body.items : [];

    if (!rows.length) return { ok: false, reason: "порожній кошик" };

    if (rows.length > MAX_DRAFT_ITEMS) return { ok: false, reason: "надто багато позицій" };

    const items = rows.map(draftItem).filter(Boolean);

    if (!items.length) return { ok: false, reason: "жодної придатної позиції" };

    return { ok: true, draft: { email, items } };

}
