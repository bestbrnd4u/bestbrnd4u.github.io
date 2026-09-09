// ======================================
// Панель «Відгуки» в адмінці — чиста логіка.
//
// НАВІЩО ЦЕ ВЗАГАЛІ
// ------------------
// Відгуки модерувались лише кнопками під карткою в Telegram. Це
// працює першого дня й перестає далі:
//
//   • відгук прийшов, коли телефон був не під рукою — картка з
//     кнопками поїхала вгору чату й губиться серед замовлень;
//   • подивитись усі нові = гортати чат назад;
//   • подивитись, що вже опубліковано = ніяк, такого списку не було
//     ніде;
//   • відповісти покупцеві під відгуком (колонка reply, яку сайт
//     показує) = ніяк, у бота такої кнопки немає;
//   • передати модерацію колезі = дати доступ до свого чату з ботом.
//
// Бот НЕ прибирається: сповіщення про новий відгук так само приходить
// у Telegram і кнопки під карткою так само працюють. Це другий
// спосіб, а не заміна — рівно як із замовленнями (admin-api.js).
//
// ЧОМУ ЦЕ НЕ РОБИТЬ САМА АДМІНКА (Decap)
// ---------------------------------------
// Decap працює з файлами репозиторію, а відгуки лежать у Supabase —
// колекцією CMS їх не зробити. Плюс таблиця закрита RLS без політик:
// прочитати невідмодеровані може лише service-ключ, а такий є в одного
// коду — цієї Edge Function.
//
// ЧОМУ РІШЕННЯ СИНХРОНІЗУЄТЬСЯ З ЧАТОМ
// -------------------------------------
// Відхиливши відгук у панелі, власник лишив би в чаті картку з живими
// кнопками. Натиснувши котрусь через тиждень, він МОВЧКИ скасував би
// своє ж рішення. Тому бот запам'ятовує повідомлення з карткою
// (міграція 022), а панель його перемальовує — так само, як це робить
// натискання кнопки.
//
// ЩО В ЦЬОМУ ФАЙЛІ
// -----------------
// Тільки чиста логіка: розбір і перевірка запиту, побудова запиту до
// PostgREST, проєкція рядка бази у те, що бачить браузер. Без мережі
// й без бази — щоб усе це ганяли тести в Node.
// ======================================

// Статуси відгуку. Ті самі три, що в check-обмеженні таблиці
// (019-reviews.sql): розійдуться — база відкине запис, а панель
// покаже незрозумілу помилку.
// label — підпис ВКЛАДКИ (про кілька відгуків), badge — підпис
// значка на картці (про один). Спершу значок показував label, і над
// одним відгуком стояло «Опубліковані».
export const REVIEW_STATUSES = {
    new: { label: "Нові", badge: "Новий", verb: "На модерацію" },
    published: { label: "Опубліковані", badge: "Опублікований", verb: "Показати на сайті" },
    rejected: { label: "Відхилені", badge: "Відхилений", verb: "Відхилити" },
};

// Порядок вкладок у панелі. Тримається тут, а не в браузері, щоб не
// правити у двох місцях.
export const REVIEW_STATUS_ORDER = ["new", "published", "rejected"];

export const REVIEW_ADMIN_ACTIONS = [
    "reviews-list",
    "review-status",
    "review-reply",
];

export const REVIEW_LIMIT_DEFAULT = 25;
export const REVIEW_LIMIT_MAX = 100;

// Скільки знаків приймаємо у відповіді магазину. Не обмеження, а
// стеля здорового глузду: відповідь під відгуком — це кілька рядків.
export const REPLY_MAX_LENGTH = 1000;

// Чи це запит панелі відгуків, а не замовлень. Обидві живуть в одному
// полі admin_action, і розібрати їх треба ДО перевірки на «невідома
// дія» — інакше панель замовлень відкидала б запити відгуків.
export function isReviewAction(action) {

    return REVIEW_ADMIN_ACTIONS.includes(String(action ?? "").trim());

}

// Колонки, які панель бачить.
//
// Тут НЕ білий список для покупця, а перелік для власника: до нього
// навмисно входить order_number — за ним видно, про яку покупку йде
// мова, коли відгук виглядає дивно.
//
// Телефона тут немає й бути не повинно: у відгуку він не зберігається
// зовсім (див. add_review), його звіряють на льоту з замовленням.
export const REVIEW_COLUMNS = [
    "id",
    "product_id",
    "order_number",
    "author",
    "rating",
    "body",
    "reply",
    // Фото у відгуку: панель показує їх поруч із текстом — модерувати
    // знімок наосліп неможливо, а саме знімок і буває причиною
    // відхилити.
    "photos",
    "status",
    "created_at",
    "moderated_at",
    "moderated_by",
];

// НАЗВИ ТУТ ВЛАСНІ, А НЕ ЗАГАЛЬНІ.
//
// Збірка зливає всі модули в ОДИН файл, тож clampLimit і listFilters
// перекрили б однойменні з admin-api.js. Перший раз саме так і
// сталось: мій listFilters не знав про params.refusal, і кількість
// замовлень із заявкою на відмову стала кількістю всіх замовлень.
// Зловив це тест панелі замовлень, а не збірка — вона таке
// перекриття вважає нормальним JS.
function clampReviewLimit(value) {

    const number = Math.trunc(Number(value));

    if (!Number.isFinite(number) || number < 1) return REVIEW_LIMIT_DEFAULT;

    return Math.min(number, REVIEW_LIMIT_MAX);
}

function reviewFilters(params) {

    const parts = [];

    if (params.status) parts.push(`status=eq.${params.status}`);

    return parts;

}

export function buildReviewListQuery(params = {}) {

    const parts = [
        `select=${REVIEW_COLUMNS.join(",")}`,
        // Найновіші першими: модерують саме їх.
        "order=created_at.desc",
        ...reviewFilters(params),
        `limit=${clampReviewLimit(params.limit)}`,
        `offset=${Math.max(0, Math.trunc(Number(params.offset) || 0))}`,
    ];

    return `reviews?${parts.join("&")}`;

}

// Скільки відгуків у кожній вкладці. Рядки не потрібні — лише число з
// Content-Range, тож просимо одну колонку й один рядок.
export function buildReviewCountQuery(status) {

    const parts = ["select=id", "limit=1"];

    if (status) parts.splice(1, 0, `status=eq.${status}`);

    return `reviews?${parts.join("&")}`;

}

// id відгуку — bigserial, тобто самі цифри. Перевіряємо не «для
// порядку»: id підставляється в адресу запиту до бази, і довільний
// рядок там означав би можливість дописати свій фільтр.
export function parseReviewId(value) {

    const raw = String(value ?? "").trim();

    return /^\d{1,18}$/.test(raw) ? raw : null;

}

// Відповідь магазину. Порожній рядок — це «прибрати відповідь», тож
// він допустимий і означає null у базі.
export function cleanReply(value) {

    const raw = String(value ?? "")
        // Керівні символи прибираємо, переноси рядків лишаємо: у
        // відповіді на кілька абзаців вони доречні.
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .trim();

    if (!raw) return { ok: true, reply: null };

    if (raw.length > REPLY_MAX_LENGTH) {
        return { ok: false, error: `Відповідь довша за ${REPLY_MAX_LENGTH} знаків.` };
    }

    return { ok: true, reply: raw };

}

export function parseReviewAdminRequest(body) {

    const action = String(body?.admin_action ?? "").trim();

    if (!REVIEW_ADMIN_ACTIONS.includes(action)) {
        return { ok: false, error: `Невідома дія: ${action || "(порожня)"}` };
    }

    if (action === "reviews-list") {

        const status = String(body.status ?? "").trim();

        if (status && !REVIEW_STATUSES[status]) {
            return { ok: false, error: `Невідомий статус: ${status}` };
        }

        return {
            ok: true,
            action,
            params: {
                status,
                limit: clampReviewLimit(body.limit),
                offset: Math.max(0, Math.trunc(Number(body.offset) || 0)),
            },
        };

    }

    const id = parseReviewId(body.id);

    if (!id) return { ok: false, error: "Не вказано відгук" };

    if (action === "review-status") {

        const status = String(body.status ?? "").trim();

        if (!REVIEW_STATUSES[status]) {
            return { ok: false, error: `Невідомий статус: ${status || "(порожній)"}` };
        }

        // «Повернути на модерацію» сенсу не має: покупець уже побачив
        // рішення (опублікований відгук видно на сторінці), а зірки
        // порахувала збірка. Дозволяємо лише два справжні рішення.
        if (status === "new") {
            return { ok: false, error: "Повернути відгук на модерацію не можна — виберіть «Показати» або «Відхилити»." };
        }

        return { ok: true, action, params: { id, status } };

    }

    // review-reply
    const checked = cleanReply(body.reply);

    if (!checked.ok) return { ok: false, error: checked.error };

    return { ok: true, action, params: { id, reply: checked.reply } };

}

// Рядок бази → те, що бачить браузер.
//
// Проєкція окрема від REVIEW_COLUMNS навмисно: колонки можуть
// додаватись у базу (owner_message_id із міграції 022), а в панель
// їхати не мусять.
export function reviewView(row) {

    if (!row) return null;

    const status = REVIEW_STATUSES[row.status] ? row.status : "new";

    return {
        id: String(row.id),
        productId: row.product_id === null || row.product_id === undefined
            ? null
            : Number(row.product_id),
        orderNumber: String(row.order_number ?? ""),
        author: String(row.author ?? ""),
        rating: Number(row.rating) || 0,
        body: String(row.body ?? ""),
        reply: row.reply ? String(row.reply) : "",
        photos: Array.isArray(row.photos) ? row.photos.map(String) : [],
        status,
        statusLabel: REVIEW_STATUSES[status].label,
        statusBadge: REVIEW_STATUSES[status].badge,
        createdAt: row.created_at ?? null,
        moderatedAt: row.moderated_at ?? null,
        moderatedBy: row.moderated_by ? String(row.moderated_by) : "",
    };

}

export function reviewListResponse({ reviews, total, counts }) {

    return {
        ok: true,
        reviews: (Array.isArray(reviews) ? reviews : []).map(reviewView),
        total: typeof total === "number" ? total : null,
        counts: counts ?? {},
        statuses: REVIEW_STATUS_ORDER.map(key => ({
            key,
            label: REVIEW_STATUSES[key].label,
        })),
    };

}
