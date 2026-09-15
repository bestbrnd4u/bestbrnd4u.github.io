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
export function telegramEmail(telegramId, signature) {

    const id = String(telegramId ?? "").replace(/\D/g, "");
    const sign = String(signature ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();

    if (!id || sign.length < 16) return "";

    return `tg${id}.${sign.slice(0, 32)}@telegram.bestbrnd4u.com`;

}

// Ім'я для профілю. Telegram дає окремі поля, але прізвища може й не
// бути — тоді лишається одне ім'я, і це нормально.
export function telegramName(row) {

    const first = String(row?.first_name ?? "").trim();
    const last = String(row?.last_name ?? "").trim();

    return [first, last].filter(Boolean).join(" ");

}
