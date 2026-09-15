// Підписка на листи магазину.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// На кожній сторінці вантажився universal.js MailerLite — 52 КБ і
// з'єднання зі стороннім доменом. І не було ЖОДНОЇ форми підписки:
// акаунт підключений, скрипт їде, користі нуль. У CSS навіть лежав
// мертвий клас newsletter-form — колись збирались.
//
// ЧОМУ БЕЗ ЇХНЬОГО СКРИПТА
// -------------------------
// Бо він не потрібен. Додати людину в список можна одним запитом до
// їхнього API — а це означає:
//
//   • мінус 52 КБ і мінус одне стороннє з'єднання на КОЖНІЙ сторінці;
//   • ключ живе в секретах, а не в коді сайту;
//   • MailerLite не бачить відвідувачів, які нічого не підписували.
//
// ЧОМУ ЧЕРЕЗ НАШУ ФУНКЦІЮ, А НЕ З БРАУЗЕРА
// -----------------------------------------
// Ключ API MailerLite дає право читати й правити весь список
// підписників. У коді сайту йому місця немає — так само, як ключу
// Нової пошти й токену Meta.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі. Лише чисті функції — щоб перевірялись тестами в Node.

// Скільки знаків приймаємо. Не обмеження, а стеля здорового глузду.
export const SUBSCRIBE_LIMITS = {
    email: 160,
    name: 80,
};


// -------------------------
// Що прислала сторінка
// -------------------------

// Пошта в тому вигляді, у якому її приймає MailerLite: обрізана, у
// нижньому регістрі.
//
// Перевірка навмисно проста. Складна регулярка для пошти — класична
// пастка: вона відкидає справжні адреси (з апострофом, з новими
// доменами) і все одно не доводить, що скринька існує. Це доводить
// лист підтвердження, а не регулярка.
export function cleanEmail(value) {

    const clean = String(value ?? "").trim().toLowerCase().slice(0, SUBSCRIBE_LIMITS.email);

    return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(clean) ? clean : "";

}

export function cleanSubscriber(payload) {

    if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "порожній запит" };
    }

    const email = cleanEmail(payload.email);

    if (!email) {
        return { ok: false, reason: "не схоже на пошту" };
    }

    // ЗГОДА ОБОВ'ЯЗКОВА. Це не формальність: додати людину в
    // рекламну розсилку без її згоди — те саме, що спам, і за це
    // MailerLite блокує акаунти.
    if (payload.consent !== true) {
        return { ok: false, reason: "немає згоди" };
    }

    const name = String(payload.name ?? "").trim().slice(0, SUBSCRIBE_LIMITS.name);

    return { ok: true, subscriber: { email, name } };

}


// -------------------------
// Запит до MailerLite
// -------------------------

// Куди і що надсилати. null означає «вимкнено».
//
// groupId необов'язковий: без нього людина йде в загальний список.
// З ним — в окрему групу, і тоді можна відрізнити тих, хто підписався
// на сайті, від тих, кого додали інакше.
export function subscribeRequest(apiKey, subscriber, groupId) {

    const key = String(apiKey ?? "").trim();

    // Порожній ключ = функція вимкнена. Той самий принцип, що з
    // ключами пошти, Нової пошти й Meta.
    if (!key || !subscriber || !subscriber.email) return null;

    const body = {
        email: subscriber.email,
        // MailerLite сам надсилає лист підтвердження, якщо в акаунті
        // увімкнено double opt-in. Статус «unconfirmed» — саме те, що
        // потрібно: людина мусить підтвердити, і аж тоді потрапляє в
        // розсилку.
        status: "unconfirmed",
    };

    if (subscriber.name) body.fields = { name: subscriber.name };

    const group = String(groupId ?? "").trim();

    if (group) body.groups = [group];

    return {
        url: "https://connect.mailerlite.com/api/subscribers",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${key}`,
        },
        body,
    };

}

// Стан підписки з тіла відповіді.
//
// MailerLite кладе запис у data.data, але буває віддає й плоско —
// тому дивимось в обидва місця. Можливі значення: active,
// unsubscribed, unconfirmed, bounced, junk.
export function subscriberStatus(data) {

    const row = (data && typeof data === "object")
        ? (data.data && typeof data.data === "object" ? data.data : data)
        : null;

    return String((row && row.status) || "").trim().toLowerCase();

}

// Розбір відповіді.
//
// РІЗНИЦЯ МІЖ 200 І 201 — ГОЛОВНЕ ТУТ.
//
// Документація MailerLite (POST /api/subscribers) каже прямо:
//
//   201 Created — підписника СТВОРЕНО;
//   200 OK      — пошта ВЖЕ БУЛА в списку.
//
// Раніше обидва коди вважались просто успіхом, і той, хто
// підписався пів року тому, знову читав «перевірте пошту, там
// лист» — листа при цьому не було. Тепер стан повертається окремим
// полем, і сторінка каже правду.
//
// state:
//   new         — щойно додали, лист підтвердження в дорозі;
//   active      — уже підписаний і підтверджений, листи отримує;
//   unconfirmed — у списку є, але підтвердження не натиснуто, і
//                 саме тому листів немає (найчастіша причина
//                 «я ж підписувався»);
//   again       — був у списку, але листів не отримував
//                 (відписався / пошта відбивала); наш запит просить
//                 status:"unconfirmed", тож підтвердження піде знову;
//   already     — пошта в списку, стан невідомий.
export function subscribeVerdict(status, data) {

    if (status === 201) return { ok: true, state: "new" };

    if (status === 200) {

        const state = subscriberStatus(data);

        if (state === "active") return { ok: true, already: true, state: "active" };

        if (state === "unconfirmed") return { ok: true, already: true, state: "unconfirmed" };

        if (state) return { ok: true, already: true, state: "again" };

        return { ok: true, already: true, state: "already" };

    }

    if (status === 422) {

        // 422 приходить, коли пошта не пройшла їхню перевірку. Деякі
        // відповіді при цьому кажуть «already»/«taken» — для людини,
        // яка натиснула кнопку, це не помилка: вона в списку.
        // Стану підписки тут немає, тож і не вигадуємо його.
        const message = JSON.stringify(data ?? "").toLowerCase();

        if (message.includes("already") || message.includes("taken")) {
            return { ok: true, already: true, state: "already" };
        }

        return { ok: false, reason: "пошту не прийнято" };

    }

    if (status === 401 || status === 403) return { ok: false, reason: "ключ MailerLite недійсний" };

    if (status === 429) return { ok: false, reason: "забагато запитів до MailerLite" };

    return { ok: false, reason: `HTTP ${status}` };

}


// -------------------------
// Підтвердження підписки НАШИМ листом
//
// ЧОМУ НЕ ЛИСТОМ MAILERLITE
// --------------------------
// Він приходив англійською — «Confirm your email address», — а
// відредагувати його на безкоштовному тарифі не можна: у панелі
// кнопка «Редагувати» закрита підказкою «доступно лише в платних
// тарифах». Людина щойно залишила пошту українському магазину й
// отримує лист чужою мовою від назви, яку бачила вперше. Такі не
// відкривають, а без відкриття підписка назавжди лишається
// «unconfirmed»: у списку є, листів не отримує.
//
// Решта листів магазину збирається в mail.js і йде через Resend або
// Brevo. Цей був єдиним винятком.
// -------------------------

// Скільки живе посилання з листа.
//
// Тиждень, а не година: лист про підписку не терміновий, його
// відкривають тоді, коли дійдуть руки. Година означала б, що людина,
// яка прочитала пошту ввечері, отримує «посилання застаріло» — і
// вдруге вже не підписується.
export const CONFIRM_TTL_HOURS = 168;

// Скільки чекати між двома листами на ту саму адресу.
//
// Форма відкрита всім, і без цього її можна перетворити на спосіб
// завалити чужу скриньку: вписуй чужу пошту й тисни кнопку. Межа за
// IP уже є, але вона не рятує, коли натискають з різних мереж.
//
// П'ять хвилин — компроміс: людина, яка не отримала листа й тисне
// ще раз, чекає недовго, а надіслати сотню листів поспіль не
// вийде.
export const CONFIRM_COOLDOWN_MINUTES = 5;

// Токен із посилання. uuid і нічого крім — усе інше навіть не
// шукаємо в базі.
export function cleanToken(value) {

    const clean = String(value ?? "").trim().toLowerCase();

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(clean)
        ? clean
        : "";

}

// Адреса, яку кладемо в лист.
//
// Веде на САЙТ, а не на функцію: у листі має стояти домен, який
// людина впізнає. Чужий домен у посиланні — перше, на що дивляться
// і поштові фільтри, і самі люди.
export function confirmUrl(siteUrl, token) {

    const base = String(siteUrl ?? "").replace(/\/+$/, "");

    if (!base || !token) return "";

    return `${base}/newsletter-confirm?token=${encodeURIComponent(token)}`;

}

// Чи можна підтвердити за цим записом.
//
// Чиста функція: усе, що вирішується без мережі, вирішується тут —
// і перевіряється тестами.
//
// state:
//   ok       — підтверджуємо;
//   used     — за посиланням уже переходили (лист відкрили двічі,
//              або поштовий фільтр сам «клікнув» — таке буває);
//   expired  — посилання старіше за CONFIRM_TTL_HOURS;
//   unknown  — такого токена немає.
export function confirmVerdict(row, now) {

    if (!row || !row.email) return { ok: false, state: "unknown" };

    // Уже підтверджено — це не помилка. Людина мусить побачити «усе
    // гаразд, ви підписані», а не «посилання недійсне»: вона зробила
    // все правильно, просто двічі.
    if (row.confirmed_at) return { ok: false, state: "used", email: row.email };

    const created = Date.parse(row.created_at ?? "");

    if (Number.isFinite(created)) {

        const age = (Number(now) - created) / 36e5;

        if (age > CONFIRM_TTL_HOURS) return { ok: false, state: "expired", email: row.email };

    }

    return { ok: true, state: "ok", email: row.email };

}

// Зробити підписку діючою.
//
// POST на той самий шлях, що й створення: MailerLite оновлює
// існуючого підписника за поштою й віддає 200 (саме на цьому
// побудований subscribeVerdict вище). Окремий ендпоінт із id тут не
// потрібен — id ми не зберігаємо, а пошта є.
export function activateRequest(apiKey, email) {

    const key = String(apiKey ?? "").trim();
    const clean = cleanEmail(email);

    if (!key || !clean) return null;

    return {
        url: "https://connect.mailerlite.com/api/subscribers",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${key}`,
        },
        body: {
            email: clean,
            status: "active",
        },
    };

}
