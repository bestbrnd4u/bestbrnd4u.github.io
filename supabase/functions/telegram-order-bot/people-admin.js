// Панель «Покупці й підписники»: чиста логіка.
//
// ЧОГО БРАКУВАЛО
// ---------------
// Списку людей не було ніде. Хто зареєструвався в кабінеті — видно
// лише в консолі Supabase; хто підписався на розсилку — лише в
// кабінеті MailerLite. Тобто щоб відповісти на «скільки в нас
// покупців», доводилось відкривати два чужих кабінети, а зіставити
// одне з одним було нічим.
//
// ЧОМУ ДВА СПИСКИ, А НЕ ОДИН
// ---------------------------
// Це різні люди й різні згоди. Зареєстрований дав нам обліковий
// запис — і не давав згоди на розсилку. Підписник дав саме згоду на
// листи — і може взагалі не мати кабінету. Зліпити їх в один список
// означало б рано чи пізно написати листа тому, хто на це не
// погоджувався.
//
// ЩО ТУТ Є І ЧОГО НЕМАЄ
// ----------------------
// Тут немає мережі — лише розбір запиту й проєкція чужих відповідей у
// те, що показує панель. Завдяки цьому все нижче перевіряється
// звичайними тестами в Node.
//
// ІМЕНА з префіксом people: у зібраному index.ts усі модулі лежать
// поруч, і дві функції з однією назвою тихо перекривають одна одну.

export const PEOPLE_ADMIN_ACTIONS = ["people-buyers", "people-subscribers"];

export function isPeopleAction(action) {

    return PEOPLE_ADMIN_ACTIONS.includes(String(action ?? ""));

}

// Скільки віддавати за раз. Сто — стільки, скільки має сенс гортати
// очима; більше однаково ніхто не читає, а відповідь важчає.
export const PEOPLE_PAGE = 100;

export function parsePeopleRequest(body) {

    const action = String(body?.admin_action ?? "");

    if (!isPeopleAction(action)) {
        return { ok: false, error: "Невідома дія панелі людей." };
    }

    const page = Math.max(1, Math.trunc(Number(body?.page) || 1));

    const search = String(body?.search ?? "").trim().slice(0, 120);

    return { ok: true, action, params: { page, search } };

}

// Один рядок списку покупців із відповіді Supabase Auth.
//
// Беремо рівно те, що потрібно на екрані. Ні токенів, ні метаданих
// провайдера, ні пароля (його там і немає) — усе це не має покидати
// сервер навіть до адмінки.
export function buyerView(user, ordersByEmail) {

    if (!user) return null;

    const email = String(user.email ?? "").toLowerCase();

    const stats = (ordersByEmail && ordersByEmail[email]) || null;

    return {
        id: String(user.id ?? ""),
        email: email,
        // Ім'я людина вказує при оформленні, а не при реєстрації, тож
        // беремо його із замовлень: у метаданих облікового запису
        // здебільшого порожньо.
        name: (stats && stats.name) || String(user.user_metadata?.full_name ?? ""),
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        // Підтверджена пошта означає, що людина справді нею володіє.
        confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
        orders: stats ? stats.count : 0,
        spent: stats ? stats.spent : 0,
        lastOrderAt: stats ? stats.lastAt : null,
    };

}

// Замовлення → зведення за поштою.
//
// Рахуємо ТУТ, а не окремим запитом на кожного покупця: сто запитів
// замість одного зробили б сторінку повільною рівно тоді, коли
// покупців стане багато.
//
// Скасовані не рахуємо в суму: «витратив 40 000» на трьох скасованих
// замовленнях — це неправда, з якої власник зробить хибний висновок.
export function ordersByEmail(rows) {

    const map = {};

    (Array.isArray(rows) ? rows : []).forEach(row => {

        const email = String(row?.email ?? "").trim().toLowerCase();

        if (!email) return;

        if (!map[email]) map[email] = { count: 0, spent: 0, lastAt: null, name: "" };

        const entry = map[email];

        const cancelled = String(row?.status ?? "") === "cancelled";

        entry.count += 1;

        if (!cancelled) entry.spent += Number(row?.total) || 0;

        const at = row?.created_at ?? null;

        if (at && (!entry.lastAt || at > entry.lastAt)) entry.lastAt = at;

        if (!entry.name) {
            entry.name = [row?.first_name, row?.last_name]
                .map(part => String(part ?? "").trim())
                .filter(Boolean)
                .join(" ");
        }

    });

    return map;

}

// Пошук по вже отриманому списку.
//
// Supabase Auth Admin API фільтрувати за підрядком не вміє, тож
// відбираємо на своєму боці. Це чесно працює на списку, який ми
// однаково цілком прочитали, і не вдає можливості, якої немає.
export function filterPeople(list, search) {

    const query = String(search ?? "").trim().toLowerCase();

    if (!query) return list;

    return list.filter(item =>
        String(item.email ?? "").toLowerCase().includes(query)
        || String(item.name ?? "").toLowerCase().includes(query));

}

export function buyersResponse({ users, orders, search, page }) {

    const stats = ordersByEmail(orders);

    const all = (Array.isArray(users) ? users : [])
        .map(user => buyerView(user, stats))
        .filter(Boolean)
        // Найновіші першими: саме їх і хочеться бачити.
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

    const found = filterPeople(all, search);

    const from = (Math.max(1, page || 1) - 1) * PEOPLE_PAGE;

    return {
        ok: true,
        people: found.slice(from, from + PEOPLE_PAGE),
        total: found.length,
        page: Math.max(1, page || 1),
        perPage: PEOPLE_PAGE,
        // Скільки з них справді щось купували — найкорисніше число на
        // цій сторінці.
        withOrders: all.filter(person => person.orders > 0).length,
    };

}

// Стан підписника в MailerLite. Ключі — їхні, назви — наші.
export const SUBSCRIBER_STATES = {
    active:       "Підписаний",
    unconfirmed:  "Не підтвердив",
    unsubscribed: "Відписався",
    bounced:      "Пошта не існує",
    junk:         "Позначив спамом",
};

export function subscriberView(row) {

    if (!row) return null;

    const status = String(row.status ?? "");

    return {
        id: String(row.id ?? ""),
        email: String(row.email ?? "").toLowerCase(),
        status: status,
        statusLabel: SUBSCRIBER_STATES[status] || status || "—",
        createdAt: row.created_at ?? null,
        subscribedAt: row.subscribed_at ?? null,
        // Скільки листів людина відкрила — єдине число, за яким видно,
        // жива підписка чи ні.
        opens: Number(row.opens_count) || 0,
        clicks: Number(row.clicks_count) || 0,
    };

}

export function subscribersResponse({ rows, total, page, search }) {

    const all = (Array.isArray(rows) ? rows : []).map(subscriberView).filter(Boolean);

    const found = filterPeople(all, search);

    return {
        ok: true,
        people: found,
        total: typeof total === "number" ? total : found.length,
        page: Math.max(1, page || 1),
        perPage: PEOPLE_PAGE,
        active: all.filter(person => person.status === "active").length,
    };

}

// Запит до MailerLite: адреса й заголовки.
//
// Окремою функцією, щоб тест міг перевірити її, не ходячи в мережу, —
// і щоб ключ не розповзався по коду.
export function subscribersRequest(apiKey, { page, groupId } = {}) {

    if (!apiKey) return null;

    const params = new URLSearchParams();

    params.set("limit", String(PEOPLE_PAGE));
    params.set("page", String(Math.max(1, page || 1)));

    // Група та сама, у яку кладе підписки сама форма: інакше в списку
    // з'явились би люди з інших розсилок цього ж акаунта.
    if (groupId) params.set("filter[group]", String(groupId));

    return {
        url: `https://connect.mailerlite.com/api/subscribers?${params.toString()}`,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
        },
    };

}
