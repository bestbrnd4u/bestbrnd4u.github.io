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

// Розбір відповіді.
//
// MailerLite віддає 200 або 201 на успіх. 422 — «уже підписаний» або
// «пошта не пройшла їхню перевірку»; для покупця це не помилка, він
// однаково в списку.
export function subscribeVerdict(status, data) {

    if (status === 200 || status === 201) return { ok: true };

    if (status === 422) {

        // Уже в списку — це успіх з погляду людини, яка натиснула
        // кнопку. Казати їй «помилка» було б неправдою.
        const message = JSON.stringify(data ?? "").toLowerCase();

        if (message.includes("already") || message.includes("taken")) return { ok: true, already: true };

        return { ok: false, reason: "пошту не прийнято" };

    }

    if (status === 401 || status === 403) return { ok: false, reason: "ключ MailerLite недійсний" };

    if (status === 429) return { ok: false, reason: "забагато запитів до MailerLite" };

    return { ok: false, reason: `HTTP ${status}` };

}
