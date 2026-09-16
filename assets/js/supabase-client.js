// ======================================
// supabase-client.js
// Підключення до Supabase: авторизація клієнтів
// та історія їхніх замовлень.
//
// Публікований (publishable) ключ нижче — безпечний
// для показу в клієнтському коді за задумом Supabase:
// він не дає прав в обхід RLS-політик бази даних.
// ======================================

const SUPABASE_URL = "https://hyfodsznpeeecgtgffub.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_imbIdZ0a4I14x1rftMKRLQ_nn9FJmy6";

// ЛИСТ МОЖЕ ПРИВЕСТИ НЕ ТУДИ — І ТОДІ ВІДНОВЛЕННЯ ПАРОЛЯ ПРОПАДАЄ.
//
// Куди саме повернути людину, вирішує Supabase, а не ми. Наш
// redirectTo діє лише тоді, коли ця адреса є в списку дозволених у
// панелі проєкту. Якщо її там немає, Supabase мовчки підставляє
// Site URL — тобто головну сторінку. Саме це й сталось: у листі
// стояло redirect_to=https://bestbrnd4u.github.io, і людина
// опинилась на головній.
//
// Далі гірше. Токен при цьому ЖИВИЙ і лежить у #-частині адреси.
// Клієнт, що створюється нижче, підхоплює його, відкриває сесію й
// ЧИСТИТЬ адресу. Людина стоїть на головній, мовчки ввійшла, екрана
// «новий пароль» не бачила — і більше не побачить: посилання
// одноразове, другий перехід за ним уже нічого не дасть.
//
// Тому перед створенням клієнта: якщо в адресі лежить службовий
// токен, а ми не в кабінеті — переносимо його в кабінет разом із
// #-частиною. Там на нього чекають. Це страхує від чужої
// настройки, але не замінює її: правильний Site URL і список
// дозволених адрес у панелі потрібні все одно.
(function carryAuthTokenToAccount() {

    const marker = window.location.hash + window.location.search;

    if (!/type=(recovery|email_change)/.test(marker)) return;

    // «/account», «/account/» і «/account.html» — та сама сторінка.
    const here = window.location.pathname.replace(/\/+$/, "").replace(/\.html$/, "");

    // Без цієї перевірки вийшло б перенаправлення само на себе.
    if (here.endsWith("/account")) return;

    // ТІЛЬКИ ТОЙ САМИЙ ORIGIN. Сесію Supabase тримає в localStorage, а
    // він прив'язаний до домену: перекинути людину з
    // bestbrnd4u.github.io на bestbrnd4u.com означало б викинути щойно
    // відкриту сесію разом із токеном. Тому origin беремо поточний,
    // хоч би яким він був.
    //
    // replace, а не href: інакше «назад» повертало б на адресу з уже
    // використаним токеном.
    window.location.replace(
        window.location.origin + "/account" + window.location.search + window.location.hash
    );

})();

const supabaseClient = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

if (!supabaseClient) {
    console.error("Supabase SDK не завантажився — перевірте підключення скрипта в <head>.");
}

// -------------------------
// Поточний користувач
// -------------------------

async function getCurrentUser() {

    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient.auth.getUser();

    if (error) return null;

    return data?.user || null;

}

// -------------------------
// Пошта, якої насправді немає
// -------------------------

// ЗВІДКИ ВОНА БЕРЕТЬСЯ
//
// Supabase тримає користувача за поштою, а Telegram її не дає. Тому
// для входу через бота адреса вигадується з id і підпису — див.
// supabase/functions/telegram-order-bot/telegram-login.js,
// telegramEmail(). Складається вона за зразком
//
//   tg<id у Telegram>.<підпис>@telegram.bestbrnd4u.com
//
// і зразком лишається навмисно: тест test-catalog-order.js стежить,
// щоб у коді не з'являлось сторонніх поштових адрес, і справжній
// приклад тут був би саме такою адресою.
//
// Скриньки за нею не існує: домен нікуди не веде, лист нікому не
// дійде. Це технічний ідентифікатор, а не спосіб зв'язку.
//
// ЧОМУ ЦЕ НЕ КОСМЕТИКА
//
// Показати таку адресу в кабінеті — півбіди: негарно й незрозуміло.
// Гірше, що вона підставлялась у форму замовлення й у підписку. Тобто
// покупець бачив заповнене поле «Email», вважав, що пошту вказав, — а
// лист про відправлення, подяка й прохання про відгук їхали в нікуди.
//
// Тому там, де пошта потрібна ЯК ПОШТА, питають не user.email, а цю
// функцію: для службової адреси вона повертає порожньо, і поле
// лишається незаповненим — тобто людина його заповнить сама.
const TELEGRAM_EMAIL_DOMAIN = "@telegram.bestbrnd4u.com";

function realEmail(user) {

    const email = String(user?.email ?? "").trim();

    return email.toLowerCase().endsWith(TELEGRAM_EMAIL_DOMAIN) ? "" : email;

}

// -------------------------
// Іконка "Кабінет" у шапці сайту —
// присутня на всіх сторінках однаково
// -------------------------

async function updateAccountIcon() {

    const link = document.getElementById("accountLink");

    if (!link) return;

    const user = await getCurrentUser();

    link.classList.toggle("logged-in", Boolean(user));

    // Підказка називає, ким саме ти увійшов. Для входу через Telegram
    // адреса службова (див. realEmail вище) — називати нею людину те
    // саме, що назвати номером рядка в базі.
    link.title = user
        ? (realEmail(user) || "Особистий кабінет")
        : "Увійти або зареєструватися";

}

updateAccountIcon();

supabaseClient?.auth.onAuthStateChange(() => {

    updateAccountIcon();

});
