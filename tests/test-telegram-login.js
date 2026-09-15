// Вхід на сайт через Telegram.
//
// ЧОМУ ЦЕЙ НАБІР ПРИСКІПЛИВІШИЙ ЗА ІНШІ
// --------------------------------------
// Google і Facebook перевіряє Supabase — ми лише натискаємо кнопку.
// Telegram він не вміє, тож рішення «це справді та людина» приймає
// наш код. Помилка тут не псує верстку й не гальмує сторінку: вона
// пускає чужого в чужий кабінет, де лежать адреси й історія
// замовлень.
//
// ТРИ РЕЧІ, ЯКІ ТУТ ЗАКРІПЛЕНІ НАЗАВЖДИ
// --------------------------------------
// 1. БОТ НЕ ВХОДИТЬ МОВЧКИ. Токен їде через Telegram, отже його може
//    надіслати хтось інший: зловмисник відкриває вхід у себе, кидає
//    жертві своє посилання, жертва тисне «Старт» — і зловмисник у її
//    кабінеті. Тому бот питає підтвердження й називає код, який
//    видно лише тому, хто вхід почав.
//
// 2. СПРОБА ОДНОРАЗОВА, І ЗАЙМАЄТЬСЯ ВОНА ДО ВИДАЧІ СЕСІЇ. Інакше
//    два запити, що прийшли разом, обидва побачили б «підтверджено».
//
// 3. СЕСІЮ ВИДАЄ SUPABASE, А НЕ МИ. Своїх токенів не підписуємо:
//    просимо одноразовий у нього й передаємо сторінці.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

function loadModule(rel, names) {

    const src = read(rel)
        .replace(/^export\s+/gm, "")
        .replace(/^import\s*\{[\s\S]*?\}\s*from\s*["']\.\/[^"']+["'];?\s*$/gm, "")
        .concat("\nmodule.exports = { " + names.join(", ") + " };");

    const module = { exports: {} };

    new Function("module", "exports", src)(module, module.exports);

    return module.exports;

}

const tg = loadModule("supabase/functions/telegram-order-bot/telegram-login.js", [
    "cleanLoginToken", "loginCode", "loginDeepLink", "loginVerdict", "loginStatus",
    "telegramEmail", "telegramName", "LOGIN_TTL_MINUTES", "LOGIN_PREFIX",
]);

const fmt = loadModule("supabase/functions/telegram-order-bot/format.js", [
    "parseStartPayload",
]);

const built = read("supabase/functions/telegram-order-bot/index.ts");
const accountJs = read("assets/js/account.js");
const accountHtml = read("account.html");

console.log("\n[1] Діплінк замість віджета Telegram");
{
    // Login Widget вимагає зареєструвати домен у BotFather, і домен
    // там один. У нас їх три: прод, дев і localhost — тобто
    // перевірити вхід можна було б лише зламавши його на бойовому
    // сайті. Діплінк такого обмеження не має.
    check("бот упізнає /start login_<токен>",
        JSON.stringify(fmt.parseStartPayload("/start login_11111111-2222-3333-4444-555555555555"))
            === JSON.stringify({ type: "login", token: "11111111-2222-3333-4444-555555555555" }));

    check("і те саме з іменем бота",
        fmt.parseStartPayload("/start@BestBrnd4uBot login_11111111-2222-3333-4444-555555555555").type
            === "login");

    // Два види посилань не мусять плутатись між собою. Перевірено
    // й зворотне: перенесення гілки входу після товарної нічого не
    // ламає — збігу між ними немає в принципі, бо товар це самі
    // цифри, а вхід має префікс і дефіси uuid.
    check("товарні посилання не зламані",
        fmt.parseStartPayload("/start product_15").type === "product"
        && fmt.parseStartPayload("/start 15").id === 15);

    check("порожній /start лишився вітанням",
        fmt.parseStartPayload("/start").type === "welcome");

    check("сміття не стає входом",
        fmt.parseStartPayload("/start login_не-uuid").type === "unknown");

    check("посилання складається з імені бота",
        tg.loginDeepLink("@BestBrnd4uBot", "abc")
            === "https://t.me/BestBrnd4uBot?start=login_abc");

    check("без імені бота посилання немає", tg.loginDeepLink("", "abc") === "");
}

console.log("\n[2] Бот не входить мовчки");
{
    // Головний захист від підсунутого чужого посилання.
    check("бот питає підтвердження кнопкою",
        /callback_data: `tglogin:\$\{clean\}`/.test(built));

    check("і називає код у повідомленні",
        /Код на сайті: <b>\$\{row\.code\}<\/b>/.test(built));

    check("каже, на який саме сайт іде вхід",
        /Вхід у <b>особистий кабінет<\/b> на bestbrnd4u\.com/.test(built));

    // Людина мусить знати, що робити, якщо код не її.
    check("пояснює, коли підтверджувати не треба",
        /якщо ви нічого не починали або код інший/i.test(built));

    // Той самий код видно на сайті — інакше звіряти нема з чим.
    check("сайт показує код", /id="telegramCode"/.test(accountHtml));

    check("і попереджає про чужий код",
        /Якщо код у боті інший — не підтверджуйте/.test(accountHtml));

    // Код читають очима між двома програмами: дрібний не звірятимуть.
    const codeStyle = read("assets/css/style.css")
        .match(/\.auth-telegram-code\{([^}]*)\}/);

    check("код показано великим", Boolean(codeStyle) && /font:800 32px/.test(codeStyle[1]));
}

console.log("\n[3] Код підтвердження");
{
    check("завжди дві цифри",
        [0, 0.01, 0.5, 0.999999].every(r => /^\d{2}$/.test(tg.loginCode(r))),
        [0, 0.5, 0.999999].map(tg.loginCode).join(" "));

    check("нуль спереду не губиться", tg.loginCode(0.03) === "03");

    check("за межі не виходить",
        tg.loginCode(1) === "99" && tg.loginCode(-1) === "00");
}

console.log("\n[4] Спроба входу живе недовго й один раз");
{
    const now = Date.parse("2026-09-15T12:00:00Z");
    const fresh = { token: "t", created_at: "2026-09-15T11:59:00Z" };

    check("свіжа спроба дійсна", tg.loginVerdict(fresh, now).state === "ok");

    check("використана — ні",
        tg.loginVerdict({ ...fresh, used_at: "2026-09-15T11:59:30Z" }, now).state === "used");

    check("стара — ні",
        tg.loginVerdict(
            { token: "t", created_at: new Date(now - (tg.LOGIN_TTL_MINUTES + 1) * 60000).toISOString() },
            now
        ).state === "expired");

    check("неіснуюча — ні", tg.loginVerdict(null, now).state === "unknown");

    // Строк короткий навмисно: забуте посилання не мусить лишатись
    // дійсним, коли за комп'ютер сів хтось інший.
    check("живе не довше за 15 хвилин", tg.LOGIN_TTL_MINUTES <= 15, tg.LOGIN_TTL_MINUTES);

    check("сайт чекає, поки не підтвердили",
        tg.loginStatus(fresh, now).state === "waiting");

    check("і бачить підтвердження",
        tg.loginStatus({ ...fresh, confirmed_at: "2026-09-15T11:59:30Z" }, now).state === "confirmed");
}

console.log("\n[5] Пошту не можна зайняти заздалегідь");
{
    // ЯКБИ ПІДПИСУ НЕ БУЛО. Адреса tg123456@… рахується з самого id,
    // а id в Telegram не таємниця. Будь-хто реєструється з такою
    // поштою й паролем наперед — і власник Telegram-акаунта 123456,
    // увійшовши через бота, потрапляє в ЧУЖИЙ акаунт.
    const sign = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

    const email = tg.telegramEmail(123456, sign);

    check("адреса містить підпис", email.includes(sign.slice(0, 32)), email);

    check("і сам id", email.startsWith("tg123456."), email);

    check("домен наш", email.endsWith("@telegram.bestbrnd4u.com"), email);

    // Короткий підпис вгадується перебором — краще не видати адреси
    // взагалі, ніж видати передбачувану.
    check("без підпису адреси немає",
        tg.telegramEmail(123456, "") === ""
        && tg.telegramEmail(123456, "abc") === "");

    check("без id теж", tg.telegramEmail("", sign) === "");

    // Підпис рахується з токена бота, який ніколи не залишає функцію.
    check("підпис рахується з секрету бота",
        /new TextEncoder\(\)\.encode\(TELEGRAM_BOT_TOKEN\)/.test(built)
        && /telegram-login:\$\{telegramId\}/.test(built));

    check("ім'я складається з двох полів",
        tg.telegramName({ first_name: "Ілля", last_name: "Півень" }) === "Ілля Півень"
        && tg.telegramName({ first_name: "Ілля" }) === "Ілля"
        && tg.telegramName(null) === "");
}

console.log("\n[6] Сесію видає Supabase, а не ми");
{
    // Своїх токенів не підписуємо: просимо одноразовий у Supabase і
    // передаємо сторінці. Усе, що ми вирішуємо, — чи людина та сама.
    check("просимо одноразове посилання",
        /admin\/generate_link/.test(built) && /type: "magiclink"/.test(built));

    check("сторінка лише відкриває сесію за ним",
        /auth\.verifyOtp\(\{\s*\n\s*token_hash: data\.tokenHash/.test(accountJs));

    check("service_role лишається у функції",
        !/SERVICE_ROLE/i.test(accountJs) && !/service_role/i.test(accountHtml));

    // ЗАЙМАЄМО ДО ВИДАЧІ. Два запити, що прийшли разом, інакше обидва
    // отримали б вхід.
    const handler = (built.match(/async function handleTelegramLoginStatus[\s\S]*?\n\}/) || [""])[0];

    check("маршрут статусу є", Boolean(handler));

    check("спроба займається ДО видачі сесії",
        handler.indexOf("used_at=is.null") < handler.indexOf("generate_link"),
        `${handler.indexOf("used_at=is.null")} < ${handler.indexOf("generate_link")}`);

    check("умова «ще не використана» стоїть у самому запиті",
        /used_at=is\.null/.test(handler));

    check("порожня відповідь означає «вже входили»",
        /!claimedRows\.length[\s\S]{0,120}state: "used"/.test(handler));
}

console.log("\n[7] Сторінка переживає недоступну функцію");
{
    // Спершу тут стояв голий fetch — і коли функція недоступна,
    // обробник кліку тихо вмирав: ні екрана очікування, ні
    // повідомлення. Зовні «кнопка не працює». Перевірено кліком.
    check("виклик функції не кидає винятків",
        /async function callFunction[\s\S]{0,800}?catch \(error\)[\s\S]{0,200}?status: 0/.test(accountJs));

    check("і людина бачить, що сталось",
        /Вхід через Telegram зараз недоступний/.test(accountJs));

    // Порада мусить вказувати на те, що на екрані справді є: Google
    // може бути не увімкнений, а пошта з паролем є завжди.
    check("порада не посилається на приховану кнопку",
        !/Скористайтесь поштою або Google/.test(accountJs));

    // Кнопка Telegram має спільний клас із Google і Facebook, але
    // провайдером Supabase не є. З широким селектором натискання на
    // неї йшло в signInWithOAuth, provider ставав undefined, і
    // браузер їхав на сторінку з машинною помилкою. Перевірено
    // кліком.
    check("OAuth-обробник не чіпає Telegram",
        /querySelectorAll\("\.auth-social-btn\[data-provider\]"\)/.test(accountJs));

    check("опитування зупиняється", /clearInterval\(telegramPoll\)/.test(accountJs));

    check("і не чекає вічно", /5 \* 60 \* 1000/.test(accountJs));

    // Ця сторінка мусить лишитись живою: саме вона чекає
    // підтвердження й відкриває кабінет.
    check("бот відкривається в новій вкладці",
        /window\.open\(data\.link, "_blank", "noopener"\)/.test(accountJs));
}

console.log("\n[8] Таблиця спроб закрита від браузера");
{
    const migration = read("supabase/migrations/033-telegram-login.sql");

    check("міграція є", migration.length > 0);

    // RLS без політик = «нікому, крім service_role». Чужий рядок
    // звідси — це чужий вхід у кабінет.
    check("RLS увімкнено й політик немає",
        /enable row level security/.test(migration) && !/create policy/.test(migration));

    check("код зберігається окремо від токена",
        /code\s+text not null/.test(migration));

    check("є позначка використання", /used_at\s+timestamptz/.test(migration));

    check("модуль потрапляє в зібрану функцію",
        /telegram-login\.js/.test(read("scripts/build-edge-function.js"))
        && built.includes("function cleanLoginToken"));
}

console.log("\n[9] Телефон із Telegram — безкоштовно й свій власний");
{
    // ЧОМУ ВЗАГАЛІ ТАК, А НЕ КОДОМ НА НОМЕР.
    //
    // Надіслати код на довільний номер безкоштовно не можна ні в
    // кого: платне саме телеком-плече — і SMS, і flash-дзвінок, і
    // Viber через партнера, і Telegram Gateway. Тому напрямок
    // перевернуто: людина сама віддає номер кнопкою, і надсилає його
    // клієнт Telegram, а не рука на клавіатурі.
    const phone = loadModule("supabase/functions/telegram-order-bot/telegram-login.js", [
        "sharedPhone", "formatPhone",
    ]);

    // ГОЛОВНА ПЕРЕВІРКА ВСЬОГО ЦЬОГО РОЗДІЛУ.
    //
    // Боту можна ПЕРЕСЛАТИ картку будь-якого свого контакту — прийде
    // таке саме повідомлення з полем contact. Без порівняння
    // user_id з from.id у базу ліг би номер друга й виглядав би
    // підтвердженим.
    check("власний контакт приймається",
        phone.sharedPhone({ from: { id: 42 }, contact: { user_id: 42, phone_number: "380737288291" } }).ok === true);

    check("чужа переслана картка — ні",
        phone.sharedPhone({ from: { id: 42 }, contact: { user_id: 77, phone_number: "380731112233" } }).ok === false);

    // У контакта без Telegram user_id немає взагалі — такий теж не
    // доводить нічого.
    check("контакт без user_id — ні",
        phone.sharedPhone({ from: { id: 42 }, contact: { phone_number: "380731112233" } }).ok === false);

    check("порожнє повідомлення нічого не ламає",
        phone.sharedPhone({}).ok === false && phone.sharedPhone(null).ok === false);

    // ОДИН НОМЕР — ОДНЕ НАПИСАННЯ. Telegram віддає самі цифри, а в
    // кабінеті телефон виглядає інакше; два написання того самого
    // номера в одній таблиці означали б, що за ним не знайти
    // замовлення.
    check("номер приводиться до вигляду з кабінету",
        phone.formatPhone("380737288291") === "+380 73 728 82 91"
        && phone.formatPhone("+380737288291") === "+380 73 728 82 91",
        phone.formatPhone("380737288291"));

    check("підказка в кабінеті того ж вигляду",
        /placeholder="\+380 73 728 82 91"/.test(accountHtml));

    // Чужу розрядність не вгадуємо — зіпсований номер гірший за
    // незвично записаний.
    check("чужа країна не спотворюється",
        phone.formatPhone("491701234567") === "+491701234567");

    check("сміття не стає номером", phone.formatPhone("12") === "");

    // Просимо ПІСЛЯ входу: відмова тут нічого не ламає.
    check("кнопку пропонують після підтвердження входу",
        built.indexOf("Вхід підтверджено")
            < built.indexOf("Хочете, щоб на оформленні замовлення телефон"));

    check("і прямо сказано, що це не обов'язково",
        /Це не обов'язково: без нього все працює як раніше/.test(built));

    // Контакт не текст — жоден текстовий обробник його не впізнав би.
    check("контакт розбирається окремо від тексту",
        /if \(message\.contact\) \{\s*\n\s*await handleSharedContact\(message\)/.test(built));

    // ОФОРМЛЕННЯ ЗАМОВЛЕННЯ ТЕЖ ПИТАЄ ТЕЛЕФОН ТАКОЮ САМОЮ КНОПКОЮ
    // (крок "phone"). Зі зворотним порядком контакт покупця забирав
    // би обробник профілю — і замовлення зависало б на кроці
    // телефону назавжди. Мало не відправлено саме так.
    check("оформлення замовлення бере контакт першим",
        built.indexOf("if (await handleOrderText(message)) return;")
            < built.indexOf("await handleSharedContact(message)"));

    // upsert: профіль створюється при першому збереженні, і в того,
    // хто щойно увійшов через Telegram, рядка може ще не бути.
    check("телефон пишеться навіть у порожній профіль",
        /profiles\?on_conflict=id/.test(built)
        && /resolution=merge-duplicates/.test(built));

    // ПОРЯДОК ДІЙ ЛЮДИНИ НЕПЕРЕДБАЧУВАНИЙ. Поділитися номером можна
    // і до того, як сайт відкрив сесію, і після. Обидва шляхи мусять
    // сходитись.
    check("номер до входу чекає в рядку спроби",
        /JSON\.stringify\(\{ phone: shared\.phone \}\)/.test(built));

    check("і записується, коли сесія відкриється",
        /if \(row\.phone\) await saveProfilePhone\(userId, row\.phone\)/.test(built));

    check("кому записати — запам'ятовується при видачі сесії",
        /user_id: userId/.test(built));

    check("міграція на стовпці є",
        fs.existsSync(path.join(ROOT, "supabase/migrations/034-telegram-phone.sql")));
}

console.log(failures === 0
    ? "\n✅ Telegram-вхід: підтвердження в боті, одноразова спроба, сесія від Supabase\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
