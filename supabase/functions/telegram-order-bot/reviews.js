// Відгуки: перевірка й картка для модерації.
//
// НАВІЩО ПЕРЕВІРКА ПОКУПКИ
// -------------------------
// Форма відгуку без перевірки — запрошення для конкурентів і ботів.
// Тому відгук приймається лише разом із номером замовлення й
// телефоном, і сервер звіряє три речі:
//
//   1. замовлення з таким номером існує;
//   2. телефон збігається з тим, що в замовленні;
//   3. цей товар справді є в його складі.
//
// Третя перевірка не менш важлива за другу: без неї той, хто купив
// гаманець, міг би написати відгук про будь-яку сумку з каталогу.
//
// ЧОМУ НА СЕРВЕРІ
// ----------------
// У браузері будь-яка така перевірка нічого не варта: код сторінки
// відкритий, і запит можна надіслати без сторінки взагалі. Тому
// таблиця відгуків закрита від браузера повністю (RLS без політик), а
// пише в неї функція службовим ключем — після перевірки.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі й бази. Лише чисті функції — щоб перевірялись тестами в Node.

// Межі тексту. Не обмеження магазину, а стеля здорового глузду: відгук
// на дві тисячі знаків читає лише той, хто його написав.
export const REVIEW_LIMITS = {
    author: 80,
    body: 2000,
    orderNumber: 40,
};

// Скільки знаків тексту досить, щоб це був відгук, а не «ок».
//
// Не заборона, а фільтр очевидного сміття: «+», «норм», «1» не кажуть
// нічого ні наступному покупцеві, ні Google.
export const MIN_BODY = 10;


// -------------------------
// Телефон
// -------------------------

// Ключ порівняння — останні 9 цифр.
//
// Те саме правило, що на сторінці «Де моє замовлення»
// (phoneKey в order-lookup.js), і з тієї самої причини: у базі лежить
// те, що людина набрала при оформленні, а тут вона набере те, що
// згадає.
//
// Назва інша навмисно: у зібраному файлі всі модули лежать поруч, і
// дві функції з однією назвою тихо перекрили б одна одну.
export function reviewPhoneKey(value) {

    const digits = String(value ?? "").replace(/\D/g, "");

    return digits.length >= 9 ? digits.slice(-9) : "";

}

export function reviewPhoneMatches(stored, typed) {

    const a = reviewPhoneKey(stored);
    const b = reviewPhoneKey(typed);

    return Boolean(a) && a === b;

}


// -------------------------
// Що прислала сторінка
// -------------------------

// Розбір і чистка. Повертає { ok: true, review } або { ok: false, reason }.
//
// reason іде в логи функції, а не покупцеві: йому досить «не вдалося
// зберегти відгук».
export function cleanReview(payload) {

    if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "порожній запит" };
    }

    const productId = Number(payload.product_id);

    if (!Number.isFinite(productId) || productId <= 0) {
        return { ok: false, reason: "немає товару" };
    }

    const orderNumber = String(payload.order_number ?? "").trim();

    // Те саме правило, що при оформленні (place-order.js) і при
    // перевірці замовлення: цифри й латиниця, 4-40 символів.
    if (!/^[0-9A-Za-z-]{4,40}$/.test(orderNumber)) {
        return { ok: false, reason: "номер не схожий на номер" };
    }

    const phone = String(payload.phone ?? "").trim();

    if (!reviewPhoneKey(phone)) {
        return { ok: false, reason: "телефон коротший за 9 цифр" };
    }

    const rating = Number(payload.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return { ok: false, reason: "оцінка поза межами 1-5" };
    }

    const author = String(payload.author ?? "").trim().slice(0, REVIEW_LIMITS.author);

    if (!author) {
        return { ok: false, reason: "немає імені" };
    }

    const body = String(payload.body ?? "").trim().slice(0, REVIEW_LIMITS.body);

    if (body.length < MIN_BODY) {
        return { ok: false, reason: "текст коротший за мінімум" };
    }

    return {
        ok: true,
        review: { productId, orderNumber, phone, rating, author, body },
    };

}

// Чи є цей товар у складі замовлення.
//
// БЕЗ ЦІЄЇ ПЕРЕВІРКИ той, хто купив гаманець за 3 800, міг би написати
// відгук про сумку за 15 000 — номер і телефон у нього справжні.
//
// Порівнюємо за id. У складі замовлення він може лежати числом або
// рядком (знімок кладе браузер), тож зводимо обидва до числа.
export function orderHasProduct(order, productId) {

    const items = Array.isArray(order?.items) ? order.items : [];

    const want = Number(productId);

    return items.some(item => Number(item?.id) === want);

}


// -------------------------
// Картка для модерації
// -------------------------

// Зірки словом і значком: у Telegram «4/5» читається гірше за «★★★★☆».
export function stars(rating) {

    const value = Math.min(Math.max(Math.trunc(Number(rating) || 0), 0), 5);

    return "★".repeat(value) + "☆".repeat(5 - value);

}

// Назва навмисно не escapeHtml(): у зібраному файлі всі модулі лежать
// поруч, і така функція там уже є (format.js). Дві функції з однією
// назвою тихо перекрили б одна одну — саме це й ловить
// tests/test-no-function-collisions.js.
function escapeReview(text) {

    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

// Повідомлення власнику про новий відгук.
//
// Показуємо все, що потрібно для рішення: товар, оцінку, текст і те,
// за яким замовленням він написаний. Останнє важливе: якщо відгук
// виглядає дивно, номер дає змогу подивитись саму покупку.
export function reviewCard(review, productTitle) {

    const lines = [
        `💬 <b>Новий відгук</b> ${stars(review.rating)}`,
        "",
        productTitle ? `<b>${escapeReview(productTitle)}</b>` : `Товар #${review.productId}`,
        "",
        escapeReview(review.body),
        "",
        `👤 ${escapeReview(review.author)}`,
        `🧾 замовлення <code>${escapeReview(review.orderNumber)}</code>`,
    ];

    return lines.join("\n");

}

// Кнопки під карткою.
//
// Дві дії й нічого більше: показати або відхилити. Відгук лежить
// невідмодерованим, поки власник не натиснув, — і це навмисно: відгук,
// який з'являється на сайті сам, рано чи пізно принесе або спам, або
// чужу лайку.
export function reviewKeyboard(id) {

    return {
        inline_keyboard: [[
            { text: "✅ Показати на сайті", callback_data: `rev:${id}:pub` },
            { text: "🚫 Відхилити", callback_data: `rev:${id}:rej` },
        ]],
    };

}

// Розбір натискання. Повертає { id, status } або null.
export function parseReviewAction(data) {

    const match = String(data ?? "").match(/^rev:(\d+):(pub|rej)$/);

    if (!match) return null;

    return {
        id: Number(match[1]),
        status: match[2] === "pub" ? "published" : "rejected",
    };

}

// Що показати власнику після натискання — замість кнопок.
export function reviewVerdictLine(status) {

    return status === "published"
        ? "✅ Відгук показано на сайті"
        : "🚫 Відгук відхилено";

}
