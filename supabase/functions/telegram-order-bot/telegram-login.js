// Вхід на сайт через Telegram.
//
// НАВІЩО ВЗАГАЛІ
// ---------------
// Google і Facebook Supabase вміє сам, Telegram — ні. А саме він тут
// найпоширеніший: бот магазину вже приймає замовлення, і людина в
// ньому вже є.
//
// ЧОМУ ЧЕРЕЗ БОТА, А НЕ ЧЕРЕЗ LOGIN WIDGET
// -----------------------------------------
// Віджет вимагає зареєструвати домен у BotFather, і домен там один.
// У нас їх три: прод, дев і localhost — тобто перевірити вхід можна
// було б лише зламавши його на бойовому сайті. Діплінк у бота такого
// обмеження не має: бот один, а прийшли на нього хоч звідки.
//
// ЯК ЦЕ ВИГЛЯДАЄ
// ---------------
//   1. Сайт просить нову спробу входу й отримує токен, код і адресу
//      t.me/<bot>?start=login_<token>.
//   2. Людина тисне «Старт» у боті. Бот НЕ входить мовчки: він пише,
//      на який сайт іде вхід, і називає код.
//   3. Код на сайті й у боті збігається — людина тисне «Підтвердити».
//   4. Сайт, який весь цей час чекає, отримує сесію.
//
// НАВІЩО КРОК З КОДОМ
// --------------------
// Токен їде через Telegram, отже його може надіслати хтось інший.
// Класична атака: зловмисник відкриває вхід у себе, надсилає жертві
// СВОЄ посилання, жертва тисне «Старт» — і зловмисник заходить у
// кабінет як жертва.
//
// Код це ламає: він видно тільки тому, хто вхід почав. Жертва бачить
// у боті чужий код, свого на екрані не має — і не підтверджує.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі й бази. Лише чисті функції — щоб перевірялись тестами в
// Node, а не тільки на живому боті.

// Скільки живе спроба входу.
//
// П'ять хвилин: людина переходить у Telegram і повертається — це
// десятки секунд. Довше означало б, що забуте посилання лишається
// дійсним, коли за комп'ютер сів хтось інший.
export const LOGIN_TTL_MINUTES = 5;

// Префікс у діплінку. Telegram дозволяє в /start лише латиницю,
// цифри, підкреслення й дефіс — uuid під це підходить.
export const LOGIN_PREFIX = "login_";

// Токен спроби: uuid і нічого крім.
export function cleanLoginToken(value) {

    const clean = String(value ?? "").trim().toLowerCase();

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(clean)
        ? clean
        : "";

}

// Код підтвердження — дві цифри.
//
// ЧОМУ ЛИШЕ ДВІ. Його не вводять, а ПОРІВНЮЮТЬ очима: на екрані й у
// повідомленні бота. Довгий код тут нічого не додає — його просто
// перестануть звіряти. Дві цифри дають 1 шанс зі 100, що підсунутий
// чужий вхід випадково збіжиться, і при цьому читаються з одного
// погляду.
//
// Це не пароль: угадувати його нема де. Спроба живе п'ять хвилин, і
// підтвердити її можна лише з того Telegram-акаунта, якому прийшло
// посилання.
export function loginCode(random) {

    const value = Math.floor(Number(random) * 100);

    return String(Math.min(Math.max(value, 0), 99)).padStart(2, "0");

}

// Адреса, яку відкриває кнопка.
export function loginDeepLink(botUsername, token) {

    const bot = String(botUsername ?? "").trim().replace(/^@/, "");

    if (!bot || !token) return "";

    return `https://t.me/${bot}?start=${LOGIN_PREFIX}${token}`;

}

// Чи можна ще підтвердити цю спробу.
//
// state:
//   ok       — можна;
//   used     — за нею вже входили;
//   expired  — минуло більше за LOGIN_TTL_MINUTES;
//   unknown  — такої спроби немає.
export function loginVerdict(row, now) {

    if (!row || !row.token) return { ok: false, state: "unknown" };

    if (row.used_at) return { ok: false, state: "used" };

    const created = Date.parse(row.created_at ?? "");

    if (Number.isFinite(created)) {

        const minutes = (Number(now) - created) / 60000;

        if (minutes > LOGIN_TTL_MINUTES) return { ok: false, state: "expired" };

    }

    return { ok: true, state: "ok" };

}

// Що відповісти сайту, який чекає.
//
// state:
//   waiting   — людина ще не підтвердила;
//   confirmed — підтвердила, можна видавати сесію;
//   expired / used / unknown — те саме, що вище.
export function loginStatus(row, now) {

    const verdict = loginVerdict(row, now);

    if (!verdict.ok) return verdict;

    return row.confirmed_at
        ? { ok: true, state: "confirmed" }
        : { ok: true, state: "waiting" };

}

// ПОШТА, ЯКУ НЕМОЖЛИВО ЗАЙНЯТИ ЗАЗДАЛЕГІДЬ.
//
// Supabase тримає користувача за поштою, а Telegram її не дає. Тому
// адресу доводиться вигадувати з id — і тут ховається дірка, якщо
// зробити це прямо.
//
// Нехай адреса була б tg123456@telegram.bestbrnd4u.com. Тоді будь-хто
// реєструється з ТАКОЮ поштою й паролем заздалегідь — і власник
// Telegram-акаунта 123456, увійшовши через бота, потрапляє в чужий
// акаунт. Id в Telegram не таємниця.
//
// Тому в адресу підмішується підпис, який можна порахувати лише з
// секретом функції. Вгадати таку адресу, щоб зайняти її наперед,
// неможливо — а порахувати повторно для того самого id ми можемо
// завжди.
//
// Сам підпис рахується в index.ts (тут немає мережі й крипто), а ця
// функція лише складає адресу з готових частин.
// Домен службових адрес. Живе окремою сталою, бо його звіряє ще й
// сайт (realEmail у assets/js/supabase-client.js): одна сторона таку
// адресу складає, друга мусить її впізнати. Розійдуться — і службова
// пошта поїде в замовлення як справжня.
export const TELEGRAM_EMAIL_DOMAIN = "@telegram.bestbrnd4u.com";

export function telegramEmail(telegramId, signature) {

    const id = String(telegramId ?? "").replace(/\D/g, "");
    const sign = String(signature ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();

    if (!id || sign.length < 16) return "";

    return `tg${id}.${sign.slice(0, 32)}${TELEGRAM_EMAIL_DOMAIN}`;

}

// Чи це службова адреса, а не пошта людини.
export function isServiceEmail(email) {

    return String(email ?? "").trim().toLowerCase().endsWith(TELEGRAM_EMAIL_DOMAIN);

}

// Telegram-id, захований у службовій адресі.
//
// Потрібен в одному місці й на один раз: перед тим як міняти пошту,
// треба переконатись, що зв'язок «цей Telegram — цей акаунт» уже
// записаний. Інакше після зміни адреси вхід через бота не знайде
// акаунт і створить другий (див. userForTelegramId в index.ts).
export function telegramIdFromEmail(email) {

    const clean = String(email ?? "").trim().toLowerCase();

    if (!isServiceEmail(clean)) return "";

    const found = clean.match(/^tg(\d+)\./);

    return found ? found[1] : "";

}

// Ім'я для профілю. Telegram дає окремі поля, але прізвища може й не
// бути — тоді лишається одне ім'я, і це нормально.
export function telegramName(row) {

    const first = String(row?.first_name ?? "").trim();
    const last = String(row?.last_name ?? "").trim();

    return [first, last].filter(Boolean).join(" ");

}


// -------------------------
// Телефон із Telegram
//
// НАВІЩО ЦЕ ВЗАГАЛІ ТУТ
// ----------------------
// Надіслати код на довільний номер безкоштовно не можна ні в кого:
// платне саме телеком-плече — і SMS, і flash-дзвінок, і Viber через
// партнера, і Telegram Gateway.
//
// Тому напрямок перевернуто. Не ми стукаємо на номер, а людина сама
// віддає його кнопкою «Поділитися номером»: номер надсилає клієнт
// Telegram, а не рука на клавіатурі.
// -------------------------

// ЧУЖИЙ КОНТАКТ — ОСЬ ЧОГО ТУТ ТРЕБА БОЯТИСЬ.
//
// Кнопка «Поділитися номером» надсилає власний номер. Але в той
// самий чат можна ПЕРЕСЛАТИ картку будь-якого зі своїх контактів —
// і боту прийде таке саме повідомлення з полем contact. Без
// перевірки в базу ліг би номер друга й виглядав би підтвердженим.
//
// Відрізняє їх одне поле: у власному контакті user_id дорівнює id
// того, хто надіслав. У чужому — або чужий id, або його немає
// взагалі (у контакта без Telegram).
export function sharedPhone(message) {

    const contact = message && message.contact;

    if (!contact || !contact.phone_number) return { ok: false, reason: "немає контакту" };

    const from = (message.from && message.from.id) ?? null;

    if (!from || contact.user_id !== from) {
        return { ok: false, reason: "контакт не свій" };
    }

    const phone = formatPhone(contact.phone_number);

    if (!phone) return { ok: false, reason: "номер не схожий на номер" };

    return { ok: true, phone: phone };

}

// Номер у тому вигляді, у якому його показує сайт.
//
// Telegram віддає самі цифри («380737288291»), а в кабінеті телефон
// виглядає як «+380 73 728 82 91» — так його й пишуть руками. Два
// різні написання того самого номера в одній таблиці означали б, що
// за ним не знайти замовлення.
//
// Чужі коди країн не розбираємо: там своя розрядність, і вгадувати
// її означало б псувати номер. Лишаємо «+» і цифри.
export function formatPhone(value) {

    const digits = String(value ?? "").replace(/\D/g, "");

    if (digits.length < 9) return "";

    if (digits.length === 12 && digits.startsWith("380")) {

        return "+380 " + digits.slice(3, 5)
            + " " + digits.slice(5, 8)
            + " " + digits.slice(8, 10)
            + " " + digits.slice(10, 12);

    }

    return "+" + digits;

}


// -------------------------
// Додавання пошти до акаунту, який увійшов через Telegram
//
// ЧОМУ ЦЕ НЕ РОБИТЬ САМ SUPABASE
// -------------------------------
// Робить, але не для нас. Supabase має увімкненим Secure email change:
// лист іде і на НОВУ адресу, і на СТАРУ, і пошта міняється лише після
// переходу за обома.
//
// Для звичайного акаунту це правильно: так власник старої адреси
// дізнається, що акаунт у нього забирають. Для входу через Telegram
// стара адреса — службова, скриньки за нею не існує. Тобто другий
// лист іде в нікуди, і зміна НЕ ВІДБУВАЄТЬСЯ НІКОЛИ.
//
// Саме це й сталось: людина додала пошту, отримала лист, перейшла за
// посиланням — і в базі лишилась службова адреса.
//
// ЧОМУ НЕ ВИМКНУТИ ПЕРЕМИКАЧ
// ---------------------------
// Бо він захищає й тих, хто входить паролем: без нього будь-хто, хто
// дістався до відкритої сесії, переводить акаунт на свою пошту без
// жодного підтвердження зі старої. Вимикати захист для всіх заради
// тих, кому він не потрібен, — погана угода.
//
// ЩО РОБИМО НАТОМІСТЬ
// --------------------
// Для акаунтів БЕЗ справжньої пошти підтверджуємо самі. Захист тут
// потрібен рівно один: довести, що нова адреса твоя. Старої, яку
// треба було б захищати, просто немає.
//
// ЧОМУ БЕЗ ТАБЛИЦІ
// -----------------
// Посилання несе в собі і дані, і підпис. Підробити не можна — ключ
// не залишає функції; підставити чужий акаунт теж, бо id у підписі.
// Повторний перехід за тим самим посиланням лише вдруге запише ту
// саму адресу, тобто не робить нічого.
//
// Підпис рахується в index.ts (тут немає крипто), а ці функції лише
// складають і розбирають те, що підписують.
// -------------------------

// Скільки живе посилання з листа.
//
// Доба, а не п'ять хвилин як у входу: лист може полежати в теці
// «Спам», і людина знайде його не одразу — а другої спроби тут немає
// сенсу вимагати, бо вона нічим не безпечніша за першу.
//
// Спершу тут стояла година — «бо посилання дає право перевести акаунт
// на іншу пошту». Міркування слабке: щоб цим правом скористатись,
// треба мати доступ до тієї самої скриньки, куди лист і прийшов.
// Година лише додавала шансу, що людина не встигне, а безпеки не
// додавала.
//
// Те саме число — у межі, за якою чужа незавершена заявка перестає
// вважатись зайнятою адресою (claims() в index.ts): посилання вмерло,
// отже й заявка вже нікому не належить.
export const EMAIL_ADD_TTL_MINUTES = 24 * 60;

// Адреса, яку вписали в кабінеті.
//
// Перевірка навмисно проста — вона відсіює описки, а не доводить, що
// скринька існує. Це доводить сам лист: не дійшов — не підтвердили.
export function cleanNewEmail(value) {

    const clean = String(value ?? "").trim().toLowerCase();

    if (clean.length > 254) return "";

    if (!/^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/.test(clean)) return "";

    // Службову адресу як «нову пошту» не приймаємо: це не пошта.
    if (isServiceEmail(clean)) return "";

    return clean;

}

// Те, що підписуємо: кому і яку адресу ставимо, і до якої миті.
export function emailAddPayload(userId, email, now) {

    const id = String(userId ?? "").trim();
    const mail = cleanNewEmail(email);

    if (!/^[0-9a-f-]{36}$/i.test(id) || !mail) return "";

    const data = JSON.stringify({
        u: id.toLowerCase(),
        e: mail,
        x: Number(now) + EMAIL_ADD_TTL_MINUTES * 60000,
    });

    return base64url(data);

}

// Розбір того самого. Зіпсований рядок — це null, а не виняток:
// посилання з листа могло приїхати обрізаним поштовим клієнтом.
export function readEmailAddPayload(payload) {

    try {

        const data = JSON.parse(fromBase64url(String(payload ?? "")));

        const id = String(data?.u ?? "");
        const mail = cleanNewEmail(data?.e);
        const expires = Number(data?.x);

        if (!/^[0-9a-f-]{36}$/i.test(id) || !mail || !Number.isFinite(expires)) return null;

        return { userId: id, email: mail, expiresAt: expires };

    } catch {

        return null;

    }

}

// Чи ще діє посилання.
//
// state:
//   ok       — можна ставити пошту;
//   expired  — минула година;
//   unknown  — посилання зіпсоване або підроблене.
export function emailAddVerdict(data, now) {

    if (!data) return { ok: false, state: "unknown" };

    if (Number(now) > data.expiresAt) return { ok: false, state: "expired" };

    return { ok: true, state: "ok" };

}

// Токен = дані.підпис. Крапка тут безпечна: base64url її не містить.
export function packEmailAddToken(payload, signature) {

    const sign = String(signature ?? "").replace(/[^a-f0-9]/gi, "").toLowerCase();

    if (!payload || sign.length < 32) return "";

    return `${payload}.${sign}`;

}

export function unpackEmailAddToken(token) {

    const parts = String(token ?? "").trim().split(".");

    if (parts.length !== 2) return null;

    const [payload, signature] = parts;

    if (!/^[A-Za-z0-9_-]+$/.test(payload)) return null;
    if (!/^[a-f0-9]{32,}$/i.test(signature)) return null;

    return { payload: payload, signature: signature.toLowerCase() };

}

// Куди веде кнопка в листі. Підтверджує сам кабінет — туди ж людина
// й потрапляє, уже зі своєю поштою на екрані.
export function emailAddUrl(siteUrl, token) {

    const base = String(siteUrl ?? "").trim().replace(/\/+$/, "");

    if (!base || !token) return "";

    return `${base}/account?email-token=${encodeURIComponent(token)}`;

}

// base64url без підкладок: такий рядок переживає і адресу, і поштовий
// клієнт, який любить ламати «+» і «/».
function base64url(text) {

    return btoa(unescape(encodeURIComponent(text)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

}

function fromBase64url(text) {

    const padded = text.replace(/-/g, "+").replace(/_/g, "/")
        + "=".repeat((4 - (text.length % 4)) % 4);

    return decodeURIComponent(escape(atob(padded)));

}
