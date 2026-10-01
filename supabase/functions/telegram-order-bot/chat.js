// Чат на сайті: покупець пише в панелі, власник відповідає з Telegram.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі й бази. Лише чисті функції — щоб перевірялись тестами в Node.

// Скільки знаків беремо. Не обмеження для людини, а стеля здорового
// глузду: Telegram усе одно ріже повідомлення на 4096, а все, що
// довше за тисячу, — це не питання до магазину.
export const CHAT_LIMITS = {
    body: 1000,
    page: 200,
    agent: 300,
    // Скільки повідомлень віддаємо сайту за раз. Довша розмова
    // догортається запитом зі since.
    batch: 50
};

// Хто написав. Третього учасника тут не планується, але перевіряти
// треба: значення приходить із тіла запиту.
export const CHAT_AUTHORS = ["visitor", "owner"];

// Текст повідомлення від відвідувача.
//
// Порожнє (і «самі пробіли») відкидаємо: такі надсилає не людина, а
// випадковий Enter, і в Telegram вони виглядають як збій бота.
export function cleanChatBody(raw) {

    const value = String(raw ?? "")
        // Невидимі керівні символи прибираємо всі, крім переносу
        // рядка: вставлене з месенджера часто тягне їх за собою, а в
        // Telegram вони ламають розмітку.
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .replace(/\r\n?/g, "\n")
        .trim();

    if (!value) return null;

    return value.slice(0, CHAT_LIMITS.body);

}

// Токен нитки. Приймаємо тільки те, що справді схоже на uuid: усе
// інше пішло б у запит до бази як є.
export function cleanThreadId(raw) {

    const value = String(raw ?? "").trim().toLowerCase();

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
        ? value
        : null;

}

// Сторінка, з якої написали. Те саме правило, що в зворотному
// дзвінку: тільки свій відносний шлях, бо це поле приходить від
// клієнта, а потрапляє в повідомлення власнику.
export function cleanChatPage(raw) {

    const value = String(raw ?? "");

    if (!value.startsWith("/")) return "";

    if (value.startsWith("//")) return "";

    if (value.length > CHAT_LIMITS.page) return "";

    return /^\/[\w\-./?&=%+]*$/.test(value) ? value : "";

}

// Картка для власника в Telegram.
//
// escape — функція екранування, яку передає викликач (у зібраному
// файлі це escapeHtml). Тягнути її сюди імпортом означало б другу
// копію того самого.
export function formatChatMessage(message, thread, escape) {

    const esc = typeof escape === "function" ? escape : (v) => String(v ?? "");

    const перше = thread && thread.first === true;

    return [
        перше ? "💬 <b>Нове питання з сайту</b>" : "💬 <b>Питання з сайту</b>",
        "",
        esc(message),
        "",
        thread && thread.page ? `Сторінка: ${esc(thread.page)}` : "",
        "↩️ Відповідайте <b>реплаєм на це повідомлення</b> — відповідь зʼявиться в людини на сайті."
    ].filter(Boolean).join("\n");

}

// ЧИ ЗАРАЗ РОБОЧИЙ ЧАС.
//
// Потрібно не боту, а сайту: панель має сказати правду одразу.
// «Відповімо за хвилину» о другій ночі — це обіцянка, якої ніхто не
// виконає, і людина піде ображеною замість того, щоб спокійно
// дочекатись ранку.
//
// Години ті самі, що на сторінці контактів: Пн–Нд 09:00–20:00.
export const CHAT_HOURS = { from: 9, to: 20 };

// kyivHour — година за Києвом (0..23). Передається ззовні, бо
// рахується вона по-різному: у браузері через Intl, на сервері
// через timestamptz. Тут — лише саме правило.
export function withinWorkingHours(kyivHour) {

    const h = Number(kyivHour);

    if (!Number.isFinite(h)) return true;

    return h >= CHAT_HOURS.from && h < CHAT_HOURS.to;

}

// Що сайт показує під полем вводу.
export function chatGreeting(kyivHour) {

    return withinWorkingHours(kyivHour)
        ? "Зазвичай відповідаємо за кілька хвилин."
        : "Зараз неробочий час — відповімо зранку, з 9:00.";

}
