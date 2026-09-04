// ======================================
// Панель «Замовлення» в адмінці — чиста логіка.
//
// НАВІЩО ЦЕ ВЗАГАЛІ
// ------------------
// Замовленнями можна було керувати лише з Telegram: статуси —
// кнопками під карткою, ТТН — відповіддю боту. Це працює, поки
// замовлення одне-два на день і поки телефон під рукою. Далі
// починаються незручності, яких кнопками не вирішити:
//
//   • знайти замовлення тижневої давнини = гортати чат;
//   • подивитись усі «Нові» = /orders показує останні десять;
//   • працювати з компʼютера = чат на телефоні;
//   • передати роботу колезі = дати доступ до свого чату з ботом.
//
// Тому в адмінці зʼявилась своя сторінка. Бот НЕ прибирається:
// сповіщення про нове замовлення так і приходять у Telegram, кнопки
// так і працюють. Це другий спосіб, а не заміна.
//
// ЧОМУ ЦЕ НЕ РОБИТЬ САМА АДМІНКА
// -------------------------------
// Замовлення лежать у Supabase під RLS: клієнт бачить лише свої, а
// гостьових (user_id is null) з браузера не видно взагалі — і так має
// бути, інакше публічний ключ сайту відкривав би чужі телефони й
// адреси. Прочитати всі замовлення може лише серверний код із
// service-ключем, а такий тут один — ця Edge Function.
//
// ЩО В ЦЬОМУ ФАЙЛІ
// -----------------
// Тільки чиста логіка: розбір і перевірка запиту, побудова запиту до
// PostgREST, проєкція рядка бази у те, що бачить браузер. Без мережі
// й без бази — щоб усе це ганяли тести в Node, як і решту логіки
// бота (format.js, order-flow.js).
// ======================================

import { STATUSES, normalizeStatus, allowedTransitions, validateTracking, parseItems, trackingUrl } from "./format.js";

// -------------------------
// Звідки можна звертатись
//
// Адмінка живе на домені сайту, функція — на supabase.co, тобто це
// завжди міждоменний запит. Браузер спершу питає дозволу (preflight),
// і без цього переліку панель не отримає ані байта.
//
// Перелік — не заміна перевірці доступу (її обходить будь-який curl),
// а гігієна: сторонній сторінці в браузері власника нема чого
// звертатись до цього API.
// -------------------------

export const ADMIN_ORIGINS = [
    "https://bestbrnd4u.com",
    "https://www.bestbrnd4u.com",
    "https://dev.bestbrnd4u.com",
    "https://bestbrnd4u.github.io",
];

export function isAllowedOrigin(origin) {

    const value = String(origin ?? "").trim();

    if (!value) return false;

    if (ADMIN_ORIGINS.includes(value)) return true;

    // Локальний перегляд адмінки (python -m http.server тощо).
    // Тільки http і тільки петля — жодних сторонніх адрес.
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(value);

}

// Заголовок, яким браузер надсилає доказ доступу. НЕ Authorization:
// його на шляху до функції розбирає сам Supabase (шукає там свій JWT),
// а тут їде токен GitHub — інша річ.
export const ADMIN_TOKEN_HEADER = "x-admin-token";

export function corsHeaders(origin) {

    const headers = {
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": `Content-Type, ${ADMIN_TOKEN_HEADER}`,
        "Access-Control-Max-Age": "600",
    };

    // Дозволяємо конкретний домен, а не «*»: із зіркою браузер не
    // пропустив би власний заголовок з токеном.
    if (isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;

    return headers;

}

// -------------------------
// Дії
// -------------------------

export const ADMIN_ACTIONS = ["list", "get", "status", "tracking"];

export const LIST_LIMIT_DEFAULT = 25;
export const LIST_LIMIT_MAX = 100;

// Порядок вкладок у панелі. Тримається тут, а не в браузері, щоб
// новий статус не довелося додавати у двох місцях.
export const STATUS_ORDER = ["new", "processing", "shipped", "completed", "cancelled"];

// Куди дозволено переходити з панелі.
//
// Основний ланцюжок — спільний із ботом (allowedTransitions), тож
// «Відправлено» на скасованому замовленні не натиснути ні там, ні тут.
//
// РІЗНИЦЯ ОДНА, І ВОНА НАВМИСНА: із «Скасовано» та «Виконано» панель
// дозволяє повернути замовлення в роботу. У боті такої кнопки немає —
// і там це не проблема, бо статус міняють, дивлячись на картку. У
// панелі ж поруч стоять кнопки й список: один зайвий клік по
// «Скасувати» — і замовлення застигло б назавжди, без жодного способу
// це виправити, крім Table editor у Supabase.
export function adminTransitions(current) {

    const status = normalizeStatus(current);

    if (status === "cancelled" || status === "completed") return ["processing"];

    return allowedTransitions(status);

}

// -------------------------
// Пошук
//
// Значення їде в параметр or=(...) PostgREST, де кома, дужки й лапки —
// частина синтаксису. Замість екранування прибираємо все, що не
// схоже на текст запиту: так рядок не може зламати фільтр незалежно
// від того, що ввели в поле.
// -------------------------

export const SEARCH_FIELDS = [
    "order_number",
    "first_name",
    "last_name",
    "phone",
    "email",
    "tracking_number",
];

// Поля, у яких має сенс шукати «просто цифри»: номер замовлення,
// телефон, накладна.
const DIGIT_FIELDS = ["order_number", "phone", "tracking_number"];

export function sanitizeSearch(text) {

    return String(text ?? "")
        .replace(/[^\p{L}\p{N}\s@._+-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);

}

export function searchClause(text) {

    const term = sanitizeSearch(text);

    if (!term) return "";

    // Пробіл стає зіркою: «Іван Петренко» знайдеться і як «Іван
    // Петренко», і як «Іван Б. Петренко». Заодно в адресу не
    // потрапляють пробіли.
    const pattern = `*${term.replace(/\s+/g, "*")}*`;

    const parts = SEARCH_FIELDS.map((field) => `${field}.ilike.${pattern}`);

    // Телефон у базі лежить як +380…, а диктують його по-різному:
    // «050 123 45 67». Тому для номерів шукаємо ще й самі цифри.
    const digits = term.replace(/\D/g, "");

    if (digits.length >= 4 && digits !== term) {

        DIGIT_FIELDS.forEach((field) => parts.push(`${field}.ilike.*${digits}*`));

    }

    return `or=(${parts.join(",")})`;

}

// -------------------------
// Запити до PostgREST
// -------------------------

// Колонки для списку. Перелічені навмисно: select=* тягнув би все,
// включно з полями, яким у браузері нема чого робити.
export const LIST_COLUMNS = [
    "id",
    "order_number",
    "created_at",
    "status",
    "items",
    "total",
    "first_name",
    "last_name",
    "phone",
    "delivery_method",
    "delivery_city",
    "tracking_number",
    "refusal_requested_at",
    "user_id",
    "telegram_chat_id",
];

function listFilters(params) {

    const parts = [];

    if (params.status) parts.push(`status=eq.${params.status}`);

    if (params.refusal) parts.push("refusal_requested_at=not.is.null");

    const search = searchClause(params.query);

    if (search) parts.push(search);

    return parts;

}

export function buildListQuery(params = {}) {

    const parts = [
        `select=${LIST_COLUMNS.join(",")}`,
        "order=created_at.desc",
        ...listFilters(params),
        `limit=${clampLimit(params.limit)}`,
        `offset=${Math.max(0, Math.trunc(Number(params.offset) || 0))}`,
    ];

    return `orders?${parts.join("&")}`;

}

// Скільки всього замовлень у кожній вкладці. Рядки не потрібні —
// лише число з Content-Range, тож просимо одну колонку й один рядок.
export function buildCountQuery(params = {}) {

    return `orders?${["select=id", ...listFilters(params), "limit=1"].join("&")}`;

}

// Заявки на відмову цього замовлення — щоб у картці було видно, від
// чого саме відмовляються, а не лише позначку «клієнт просив відмову».
export function buildRefusalsQuery(id) {

    return `order_refusals?select=*&order_id=eq.${id}&order=created_at.desc`;

}

// Загальна кількість рядків із заголовка Content-Range: «0-24/137».
export function parseTotal(contentRange) {

    const match = /\/(\d+|\*)\s*$/.exec(String(contentRange ?? ""));

    if (!match || match[1] === "*") return null;

    return Number(match[1]);

}

// -------------------------
// Розбір і перевірка запиту
// -------------------------

function clampLimit(value) {

    const number = Math.trunc(Number(value));

    if (!Number.isFinite(number) || number < 1) return LIST_LIMIT_DEFAULT;

    return Math.min(number, LIST_LIMIT_MAX);

}

// id замовлення — bigint identity, тобто самі цифри. Перевіряємо це
// не «для порядку»: id підставляється в адресу запиту до бази, і
// довільний рядок там означав би можливість дописати свій фільтр.
export function parseOrderId(value) {

    const raw = String(value ?? "").trim();

    return /^\d{1,18}$/.test(raw) ? raw : null;

}

// Те саме правило, що в боті (validateTracking), але словами панелі:
// у полі введення немає ні «надішліть», ні команди /skip.
export function trackingError(checked) {

    if (checked?.reason === "short") return "Замало цифр — ТТН Нової пошти складається з 14.";
    if (checked?.reason === "long") return "Завелика кількість цифр для номера накладної.";

    return "Це не схоже на номер накладної — потрібні 14 цифр.";

}

export function parseAdminRequest(body) {

    const action = String(body?.admin_action ?? "").trim();

    if (!ADMIN_ACTIONS.includes(action)) {
        return { ok: false, error: `Невідома дія: ${action || "(порожня)"}` };
    }

    if (action === "list") {

        const status = String(body.status ?? "").trim();

        if (status && !STATUSES[status]) {
            return { ok: false, error: `Невідомий статус: ${status}` };
        }

        return {
            ok: true,
            action,
            params: {
                status,
                refusal: Boolean(body.refusal),
                query: sanitizeSearch(body.query),
                limit: clampLimit(body.limit),
                offset: Math.max(0, Math.trunc(Number(body.offset) || 0)),
            },
        };

    }

    const id = parseOrderId(body.id);

    if (!id) return { ok: false, error: "Не вказано замовлення" };

    if (action === "get") return { ok: true, action, params: { id } };

    if (action === "status") {

        const status = String(body.status ?? "").trim();

        if (!STATUSES[status]) {
            return { ok: false, error: `Невідомий статус: ${status || "(порожній)"}` };
        }

        return { ok: true, action, params: { id, status } };

    }

    // tracking
    const raw = String(body.tracking ?? "").trim();

    // Порожнє значення — це «прибрати накладну». Потрібно, коли номер
    // вписали не в те замовлення: інакше помилковий ТТН лишався б у
    // картці клієнта назавжди.
    if (!raw) return { ok: true, action, params: { id, tracking: null } };

    const checked = validateTracking(raw);

    if (!checked.ok) return { ok: false, error: trackingError(checked) };

    return { ok: true, action, params: { id, tracking: checked.value } };

}

// -------------------------
// Що бачить браузер
//
// Не сам рядок бази, а проєкція. Дві причини:
//
//   • у рядку є те, чому в браузері не місце: user_id клієнта,
//     telegram_chat_id, id повідомлення бота. Замість них — ознаки
//     «гість» і «замовляв у боті», яких достатньо менеджеру;
//
//   • назви полів стають контрактом. Колонку в базі можна
//     перейменувати, не переписуючи сторінку.
// -------------------------

export function orderView(order) {

    const status = normalizeStatus(order?.status) || "new";
    const meta = STATUSES[status] ?? STATUSES.new;

    return {
        id: String(order?.id ?? ""),
        orderNumber: order?.order_number ?? "",
        createdAt: order?.created_at ?? null,

        status,
        statusLabel: meta.label,
        statusEmoji: meta.emoji,
        transitions: adminTransitions(status),

        items: parseItems(order?.items),

        subtotal: Number(order?.subtotal) || 0,
        discount: Number(order?.discount) || 0,
        deliveryPrice: Number(order?.delivery_price) || 0,
        total: Number(order?.total) || 0,

        firstName: order?.first_name ?? "",
        lastName: order?.last_name ?? "",
        phone: order?.phone ?? "",
        email: order?.email ?? "",

        deliveryMethod: order?.delivery_method ?? "",
        deliveryCity: order?.delivery_city ?? "",
        deliveryDetail: order?.delivery_detail ?? "",
        paymentMethod: order?.payment_method ?? "",
        promoCode: order?.promo_code ?? "",

        trackingNumber: order?.tracking_number ?? "",
        trackingUrl: trackingUrl(order?.tracking_number),

        // Гість — це замовлення без реєстрації. Важливо для менеджера:
        // такому клієнту не видно історії в кабінеті, і всі уточнення
        // йдуть телефоном.
        guest: !order?.user_id,

        // Замовляв у боті — отже, про зміну статусу він отримає
        // повідомлення в Telegram. Для замовлень із сайту сповіщень
        // немає, і про відправлення доводиться казати телефоном.
        fromBot: Boolean(order?.telegram_chat_id),

        refusalRequestedAt: order?.refusal_requested_at ?? null,
    };

}

export function refusalView(record) {

    return {
        id: String(record?.id ?? ""),
        createdAt: record?.created_at ?? null,
        note: record?.note ?? "",
        items: parseItems(record?.items),
    };

}

// Відповідь на list: усе, що потрібно панелі для першої ж
// відмальовки — рядки, підписи статусів і кількості для вкладок.
export function listResponse({ orders, total, counts }) {

    return {
        ok: true,
        statuses: STATUSES,
        statusOrder: STATUS_ORDER,
        counts: counts ?? {},
        total: typeof total === "number" ? total : null,
        orders: (orders ?? []).map(orderView),
    };

}
