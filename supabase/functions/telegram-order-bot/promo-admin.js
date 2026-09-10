// Панель промокодів: чиста логіка.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Тут немає ні мережі, ні бази — лише розбір запиту, перевірки й
// проєкція рядка бази у те, що бачить панель. Завдяки цьому все нижче
// перевіряється звичайними тестами в Node, без Supabase.
//
// ЧОМУ ПАНЕЛЬ, А НЕ ФАЙЛ В АДМІНЦІ
// ---------------------------------
// Промокоди не можна тримати у файлі репозиторію: репозиторій
// публічний, і кожен код був би опублікований разом із ним. Тому вони
// живуть у базі, а панель ходить до них через цю функцію — з тим
// самим правом, що й панель замовлень (запис у репозиторій сайту).
//
// ІМЕНА
// ------
// Усі функції з префіксом promo: у зібраному index.ts усі модулі
// лежать поруч, і дві функції з однією назвою тихо перекривають одна
// одну (див. tests/test-no-function-collisions.js — та сама пастка
// вже коштувала цін у каталозі).

export const PROMO_ADMIN_ACTIONS = [
    "promo-list",
    "promo-save",
    "promo-delete",
    "promo-uses",
];

export function isPromoAction(action) {

    return PROMO_ADMIN_ACTIONS.includes(String(action ?? ""));

}

// Стани коду. Ключ приходить із бази (promo_admin_list), тут — як їх
// називати людині.
//
// «Вимкнений» і «вичерпаний» навмисно різні: у першому випадку код
// вимкнув власник, у другому він скінчився сам, і це не помилка, а
// нормальне життя одноразового коду.
export const PROMO_STATES = {
    live:    { label: "Діє",          badge: "діє" },
    early:   { label: "Ще не почався", badge: "чекає" },
    expired: { label: "Скінчився",    badge: "минув" },
    used_up: { label: "Вичерпаний",   badge: "вичерпано" },
    off:     { label: "Вимкнений",    badge: "вимк." },
};

export const PROMO_STATE_ORDER = ["live", "early", "expired", "used_up", "off"];

// Межі коду. Латиниця й цифри — щоб код можна було продиктувати по
// телефону й набрати без перемикання розкладки.
export const PROMO_CODE_RE = /^[A-Z0-9-]{3,32}$/;

export function normalizePromoCode(value) {

    return String(value ?? "").trim().toUpperCase();

}

// Відсоток: панель показує 10, база тримає 0.1.
//
// Ділення на 100 робимо тут, в одному місці. Коли воно жило на двох
// боках, рано чи пізно один із них починав слати 10 замість 0.1 — і
// перевірка «менше одиниці» відхиляла збереження без пояснень.
export function promoPercentToFraction(value) {

    const percent = Number(value);

    if (!Number.isFinite(percent)) return null;

    // Округлення до сотих відсотка: 12.345% — це вже не знижка, а
    // помилка вводу.
    const fraction = Math.round(percent * 100) / 10000;

    if (fraction <= 0 || fraction >= 1) return null;

    return fraction;

}

export function promoFractionToPercent(value) {

    const fraction = Number(value);

    if (!Number.isFinite(fraction)) return 0;

    return Math.round(fraction * 10000) / 100;

}

// Дата з панелі → мить для бази.
//
// Панель шле або порожньо (немає межі), або «2026-12-31» чи
// «2026-12-31T23:59». Порожнє мусить стати саме null, а не «сьогодні»:
// null означає «без межі», і сплутати ці два значення — значить
// вимкнути всі безстрокові коди.
export function promoMoment(value) {

    const text = String(value ?? "").trim();

    if (!text) return null;

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString();

}

// Перелік товарів, на які діє код.
//
// Порожній перелік і відсутність переліку — це те саме «на всі
// товари». Порожній масив у базі поводився б так само, але тримати
// два способи сказати одне й те саме означає рано чи пізно перевірити
// лише один із них.
export function promoProductIds(value) {

    if (!Array.isArray(value)) return null;

    const ids = [...new Set(value
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0))];

    return ids.length ? ids : null;

}

// Ціле додатне або null. Спільне для «скільки разів» і «від якої суми».
function promoPositive(value, { integer } = {}) {

    if (value === null || value === undefined || String(value).trim() === "") return null;

    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) return null;

    return integer ? Math.round(number) : number;

}

// Розбір запиту панелі. Повертає { ok, action, params } або { ok:false, error }.
//
// Повідомлення про помилку читає власник, а не програміст, — тож вони
// написані як підказки, а не як коди.
export function parsePromoRequest(body) {

    const action = String(body?.admin_action ?? "");

    if (!isPromoAction(action)) {
        return { ok: false, error: "Невідома дія панелі промокодів." };
    }

    if (action === "promo-list") {
        return { ok: true, action, params: {} };
    }

    if (action === "promo-delete") {

        const hash = String(body?.hash ?? "").trim().toLowerCase();

        if (!/^[a-f0-9]{64}$/.test(hash)) {
            return { ok: false, error: "Не зрозуміло, який код видаляти." };
        }

        return { ok: true, action, params: { hash } };

    }

    if (action === "promo-uses") {

        const code = normalizePromoCode(body?.code);

        if (!code) return { ok: false, error: "Не вказано код." };

        return { ok: true, action, params: { code } };

    }

    // promo-save
    const code = normalizePromoCode(body?.code);

    if (!PROMO_CODE_RE.test(code)) {
        return {
            ok: false,
            error: "Код: від 3 до 32 символів, лише латинські літери, цифри й дефіс.",
        };
    }

    const percent = promoPercentToFraction(body?.percent);

    if (percent === null) {
        return { ok: false, error: "Відсоток знижки має бути більший за 0 і менший за 100." };
    }

    const startsAt = promoMoment(body?.starts_at);
    const expiresAt = promoMoment(body?.expires_at);

    if (startsAt && expiresAt && expiresAt <= startsAt) {
        return { ok: false, error: "Кінець дії має бути пізніше за початок." };
    }

    // Код, який закінчився ще до створення, — майже завжди описка в
    // даті. Мовчки зберегти його означає, що власник дізнається про
    // помилку від покупця.
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        return { ok: false, error: "Дата закінчення вже минула — код не працюватиме." };
    }

    return {
        ok: true,
        action,
        params: {
            code,
            percent,
            active: body?.active !== false,
            startsAt,
            expiresAt,
            maxUses: promoPositive(body?.max_uses, { integer: true }),
            productIds: promoProductIds(body?.product_ids),
            minTotal: promoPositive(body?.min_total),
            note: String(body?.note ?? "").trim().slice(0, 200) || null,
        },
    };

}

// Рядок бази → те, що показує панель.
export function promoView(row) {

    if (!row) return null;

    const state = PROMO_STATES[row.state] ? row.state : "live";

    return {
        hash: String(row.code_hash ?? ""),
        // Коди, перенесені зі старого списку, лежать лише хешем —
        // плейнтексту в нас немає й узяти нізвідки. Кажемо це прямо,
        // а не показуємо порожнє місце.
        code: String(row.code ?? "").trim(),
        legacy: !String(row.code ?? "").trim(),
        percent: promoFractionToPercent(row.percent),
        active: row.active !== false,
        state,
        stateLabel: PROMO_STATES[state].label,
        stateBadge: PROMO_STATES[state].badge,
        startsAt: row.starts_at ?? null,
        expiresAt: row.expires_at ?? null,
        maxUses: row.max_uses === null || row.max_uses === undefined
            ? null
            : Number(row.max_uses),
        used: Number(row.used) || 0,
        productIds: Array.isArray(row.product_ids) ? row.product_ids.map(Number) : [],
        minTotal: row.min_total === null || row.min_total === undefined
            ? null
            : Number(row.min_total),
        note: String(row.note ?? ""),
        createdAt: row.created_at ?? null,
    };

}

export function promoListResponse(rows) {

    const list = (Array.isArray(rows) ? rows : []).map(promoView).filter(Boolean);

    return {
        ok: true,
        promos: list,
        // Скільки в якому стані — щоб панель могла показати це поруч
        // із фільтром, не рахуючи вдруге.
        counts: PROMO_STATE_ORDER.reduce((acc, key) => {
            acc[key] = list.filter(item => item.state === key).length;
            return acc;
        }, {}),
        states: PROMO_STATE_ORDER.map(key => ({ key, label: PROMO_STATES[key].label })),
    };

}

// Замовлення, у яких код спрацював.
export function promoUsesResponse(rows) {

    return {
        ok: true,
        uses: (Array.isArray(rows) ? rows : []).map(row => ({
            orderNumber: String(row.order_number ?? ""),
            createdAt: row.created_at ?? null,
            customer: String(row.customer ?? "").trim(),
            email: String(row.email ?? ""),
            total: Number(row.total) || 0,
            discount: Number(row.discount) || 0,
            status: String(row.status ?? ""),
        })),
    };

}

// Код для персонального листа.
//
// Читабельний набір: без 0/O та 1/I — саме на них люди помиляються,
// переписуючи код із листа руками.
export const PROMO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function promoRandomCode(prefix, randomBytes) {

    const clean = normalizePromoCode(prefix).replace(/[^A-Z0-9]/g, "").slice(0, 8);

    const tail = Array.from(randomBytes || [])
        .map(byte => PROMO_ALPHABET[byte % PROMO_ALPHABET.length])
        .join("");

    return `${clean || "BB"}-${tail}`;

}
