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
    "TELEGRAM_EMAIL_DOMAIN", "isServiceEmail", "EMAIL_ADD_TTL_MINUTES", "cleanNewEmail",
    "emailAddPayload", "readEmailAddPayload", "emailAddVerdict",
    "packEmailAddToken", "unpackEmailAddToken", "emailAddUrl", "telegramIdFromEmail",
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

console.log("\n[10] Додавання пошти до акаунту без пошти");
{
    const src = read("supabase/functions/telegram-order-bot/_index.src.ts");
    const mail = read("supabase/functions/telegram-order-bot/mail.js");

    // ЩО БУЛО. Власник увійшов через Telegram, додав свою адресу,
    // отримав лист, перейшов за посиланням — і в базі лишилась
    // службова адреса. Причина: Supabase вимагає підтвердження ще й
    // зі СТАРОЇ адреси, а вона службова й не існує. Тобто додати
    // пошту було неможливо в принципі.
    check("для акаунтів без пошти лист надсилає наша функція",
        /site_action === "email-add-start"/.test(src)
        && /site_action === "email-add-confirm"/.test(src));

    check("лист має власний текст, а не «зміна email»",
        /export function addEmailLetter/.test(mail)
        && /Підтвердіть email для кабінету/.test(mail));

    // ЗВИЧАЙНИХ АКАУНТІВ ЦЕ НЕ ТОРКАЄТЬСЯ.
    //
    // Там подвійне підтвердження працює як задумано й захищає власника
    // старої адреси. Підміняти його своїм — послаблювати захист усім
    // заради тих, кому він не потрібен.
    check("акаунт зі справжньою поштою йде звичайним шляхом Supabase",
        /if \(!isServiceEmail\(user\.email\)\) \{[\s\S]{0,160}not_service/.test(src));

    const js = read("assets/js/account.js");

    check("сайт теж розводить два шляхи",
        /realEmail\(user\)\s*\n?\s*\? \(await supabaseClient\.auth\.updateUser\(\{ email \}\)\)\.error/.test(js)
        && /: await addEmailThroughFunction\(email\)/.test(js));

    // ХТО ПРОСИТЬ — ПИТАЄМО В SUPABASE. Полю з тіла запиту вірити не
    // можна: його вписав би будь-хто й додав пошту до чужого акаунту.
    check("функція не вірить сайту на слово, хто саме просить",
        /userFromAccessToken\(body\?\.accessToken\)/.test(src)
        && /auth\/v1\/user`, \{[\s\S]{0,200}Bearer \$\{clean\}/.test(src));

    check("сайт надсилає саме токен сесії",
        /auth\.getSession\(\)/.test(js) && /accessToken: accessToken/.test(js));

    const id = "11111111-2222-3333-4444-555555555555";
    const now = Date.now();

    const payload = tg.emailAddPayload(id, "Olena@Gmail.COM", now);
    const back = tg.readEmailAddPayload(payload);

    check("посилання несе в собі кому й яку адресу ставити",
        back && back.userId === id && back.email === "olena@gmail.com",
        JSON.stringify(back));

    check("адреса зводиться до нижнього регістру",
        back && back.email === back.email.toLowerCase());

    check("година — і посилання мертве",
        tg.emailAddVerdict(back, now).state === "ok"
        && tg.emailAddVerdict(back, now + tg.EMAIL_ADD_TTL_MINUTES * 60000 + 1).state === "expired");

    check("зіпсоване посилання не кидає винятку, а стає unknown",
        tg.readEmailAddPayload("це не base64") === null
        && tg.emailAddVerdict(tg.readEmailAddPayload("+++"), now).state === "unknown");

    // Службову адресу як «нову пошту» приймати нема сенсу: це не
    // пошта, і людина опинилась би там само, звідки почала.
    check("службову адресу за нову пошту не беремо",
        tg.cleanNewEmail("tg1.aaaaaaaaaaaaaaaa@telegram.bestbrnd4u.com") === ""
        && tg.isServiceEmail("tg1.aaaaaaaaaaaaaaaa@telegram.bestbrnd4u.com") === true);

    check("описки в адресі відсіюються",
        ["a@b", "a b@c.com", "@b.com", "a@.com", ""].every(v => tg.cleanNewEmail(v) === ""));

    check("домен службових адрес — одна стала на обидві функції",
        tg.telegramEmail(42, "a".repeat(32)).endsWith(tg.TELEGRAM_EMAIL_DOMAIN));

    // ПІДПИС — ЄДИНЕ, ЩО ТУТ ЗАХИЩАЄ. Таблиці немає, тож підробка
    // payload означала б право переписати пошту будь-кому.
    check("токен розбирається лише разом із підписом",
        tg.unpackEmailAddToken(payload) === null
        && tg.unpackEmailAddToken(tg.packEmailAddToken(payload, "a".repeat(64))) !== null);

    check("підпис звіряється за сталий час",
        /function sameSignature/.test(src)
        && /diff \|= a\.charCodeAt\(i\) \^ b\.charCodeAt\(i\)/.test(src)
        && /sameSignature\(expected, parts\.signature\)/.test(src));

    // ОДИН КЛЮЧ, РІЗНІ ЦІЛІ — КЛАСИЧНА ДІРКА. Без простору імен
    // підпис, виданий для адреси входу, підійшов би для зміни пошти.
    check("підписи різних цілей не взаємозамінні",
        /signWithBotToken\(`telegram-login:/.test(src)
        && /signWithBotToken\(`email-add:/.test(src));

    check("посилання веде в кабінет, а не в порожню сторінку",
        tg.emailAddUrl("https://bestbrnd4u.com/", "abc.def")
        === "https://bestbrnd4u.com/account?email-token=abc.def");

    check("кабінет підхоплює токен із адреси й чистить її",
        /get\("email-token"\)/.test(js) && /history\.replaceState/.test(js));

    // Пошту помінялa функція, а не браузер: у токені, що лежить у
    // вкладці, і далі стоїть службова адреса.
    check("після підтвердження сесія оновлюється",
        /refreshSession\(\)/.test(js)
        && /refreshSession\(\)[\s\S]{0,200}loadProfile\(user\)/.test(js));

    // Посилання могли відкрити в іншому браузері, де сесії немає.
    // Підтвердженню вона й не потрібна — доводить підпис. Пропустити
    // його там означало б мовчки спалити робоче посилання.
    check("посилання спрацьовує і без відкритої сесії",
        /accountDashboard\.hidden = true;\s*\n\s*\}\n[\s\S]{0,900}await confirmAddedEmail\(\);/.test(js));
}

console.log("\n[11] Вхід через Telegram знаходить акаунт за telegram_id");
{
    const src = read("supabase/functions/telegram-order-bot/_index.src.ts");

    // РАДИ ЧОГО ЦЕ ВЗАГАЛІ.
    //
    // Користувач шукався за службовою адресою tg<id>.<підпис>@… Доки
    // пошта не мінялась, це працювало. А щойно людина додавала свою —
    // службової адреси в базі не лишалось, і наступний вхід через
    // Telegram створював ДРУГИЙ, порожній акаунт. Замовлення, адреси
    // й обране лишались у першому, невидимі.
    check("спершу шукаємо, чи входила ця людина раніше",
        /const known = await userForTelegramId\(row\.telegram_id\)/.test(src));

    check("беремо її ПОТОЧНУ пошту, а не службову",
        /const email = known\?\.email \|\| telegramEmail\(row\.telegram_id, signature\)/.test(src));

    // Саме тут і виникав дублікат: POST зі службовою адресою для
    // людини, чия пошта вже інша.
    check("відомому користувачеві акаунт не створюємо вдруге",
        /if \(!known\) \{[\s\S]{0,600}supabaseAuthAdmin\("users", \{/.test(src));

    check("зв'язок беремо з рядка спроби, без окремої таблиці",
        /telegram_logins\?telegram_id=eq\.\$\{id\}&user_id=not\.is\.null/.test(src));

    // Акаунт могли видалити — тоді це вже не «той самий користувач»,
    // і вхід має піти першим шляхом.
    check("видалений акаунт не рахується за знайдений",
        /if \(!response\.ok\) return null;[\s\S]{0,260}user\?\.id && user\?\.email \? user : null/.test(src));

    // ПОРЯДОК ДІЙ ВЛАСНИКА МІГ БИ ВСЕ ЗІПСУВАТИ.
    //
    // Зв'язок пишеться при вході. Якби людина додала пошту РАНІШЕ, ніж
    // відбувся перший вхід після міграції 034, службової адреси вже не
    // було б, а зв'язку ще не було б — і наступний вхід створив би
    // другий кабінет. Тому без зв'язку не починаємо взагалі.
    check("без зв'язку з Telegram пошту додавати не починаємо",
        /if \(!await linkedToTelegram\(user\)\) \{[\s\S]{0,320}not_ready/.test(src));

    check("зв'язок дописується, якщо входили ще до міграції",
        /if \(row\.user_id\) return String\(row\.user_id\) === String\(user\.id\)/.test(src)
        && /method: "PATCH", body: JSON\.stringify\(\{ user_id: user\.id \}\)/.test(src));

    check("telegram_id дістаємо зі службової адреси",
        tg.telegramIdFromEmail("tg279041622." + "a".repeat(32) + "@telegram.bestbrnd4u.com") === "279041622"
        && tg.telegramIdFromEmail("olena@gmail.com") === "");

    check("сайт має що сказати, коли функція не почала",
        /not_ready:/.test(read("assets/js/account.js")));

    // ЗАЙНЯТА — ЦЕ НЕ ЛИШЕ «ВЖЕ Є ЧИЯЯСЬ ПОШТА».
    //
    // Хтось міг попросити зміну на цю саму адресу годину тому й ще не
    // перейти за посиланням. Тоді в Supabase вона лежить окремим
    // полем і стане адресою акаунту тієї миті, коли лист відкриють.
    // Без цієї гілки двоє змагались би за одну пошту: виграє той, хто
    // швидше натисне, а другий бачить «лист надіслано» й не отримує
    // нічого.
    check("запитана, але не підтверджена адреса теж рахується зайнятою",
        /\["new_email", "email_change"\]/.test(src)
        && /if \(String\(user\?\.email \?\? ""\)\.trim\(\)\.toLowerCase\(\) === email\) return "taken";/.test(src));

    // КИНУТА НА ПІВДОРОЗІ ЗАЯВКА НІКОГО НЕ ТРИМАЄ.
    //
    // Без межі вона блокувала б адресу назавжди: попросив зміну, не
    // перейшов за посиланням — і ніхто інший цю пошту вже не займе,
    // причому без способу дізнатись чому. Посилання мертве — заявка
    // разом із ним.
    check("протухла заявка перестає рахуватись",
        /email_change_sent_at/.test(src)
        && /Date\.now\(\) - sentAt > EMAIL_CHANGE_CLAIM_MINUTES \* 60000/.test(src));

    // ЦЕ НЕ НАШЕ ЧИСЛО, І САМЕ ТОМУ ВОНО ОКРЕМЕ.
    //
    // Заявку створює Supabase, і живе вона стільки, скільки його
    // посилання — Authentication → Emails → Email OTP Expiration.
    // Плутати з нашим листом (EMAIL_ADD_TTL_MINUTES) не можна: то
    // інший лист і інший строк.
    check("строк чужої заявки — окрема стала",
        /const EMAIL_CHANGE_CLAIM_MINUTES = 60;/.test(src)
        && /Date\.now\(\) - sentAt > EMAIL_CHANGE_CLAIM_MINUTES \* 60000/.test(src));

    check("наше посилання живе своїм строком",
        /EMAIL_ADD_TTL_MINUTES = 24 \* 60/.test(read("supabase/functions/telegram-order-bot/telegram-login.js")));

    // «Зайнята» остаточна, «щойно запросили» минає сама. Сказати одне
    // замість іншого означало б відправити людину шукати іншу пошту
    // там, де досить зачекати.
    const accountJs = read("assets/js/account.js");

    check("дві різні відмови, а не одна",
        /busy\.taken \? "taken" : "pending"/.test(src)
        && /Цю адресу щойно запросив інший кабінет/.test(accountJs));

    // Строк у тексті береться з відповіді функції, а не написаний
    // словами поруч: розійшовшись із кодом, він брехав би мовчки.
    check("скільки чекати — з коду, а не з розмітки",
        /freeInMinutes: EMAIL_CHANGE_CLAIM_MINUTES/.test(src)
        && /waitWords\(busy\.freeInMinutes\)/.test(accountJs));

    // «за 21 годин» — проста межа «менше п'яти» саме так і ламається.
    //
    // Функцію дістаємо з файлу цілком: від оголошення до першої «}» на
    // початку рядка. Прив'язуватись до тексту всередині не можна — на
    // ньому цей тест уже раз упав стеком замість чесного ✗, коли той
    // текст змінився.
    const waitWords = (() => {

        try {

            const from = accountJs.indexOf("function waitWords(minutes) {");

            if (from < 0) return null;

            const to = accountJs.indexOf("\n}\n", from);

            if (to < 0) return null;

            return new Function(accountJs.slice(from, to + 3) + "; return waitWords;")();

        } catch (error) {

            return null;

        }

    })();

    check("функція строку знайшлась у файлі", typeof waitWords === "function");

    check("години рахуються за останньою цифрою",
        typeof waitWords === "function"
        && waitWords(60) === "за годину"
        && waitWords(180) === "за 3 години"
        && waitWords(660) === "за 11 годин"
        && waitWords(1260) === "за 21 годину"
        && waitWords(1440) === "за добу",
        typeof waitWords === "function"
            ? [60, 180, 660, 1260, 1440].map(waitWords).join(" | ")
            : "функції немає");

    // ЧОМУ ПЕРЕБІР, А НЕ ?filter=. filter у GoTrue шукає по полю
    // email — користувача із ЗАПИТАНОЮ адресою він просто не поверне,
    // і дірка лишилась би непомітною.
    check("шукаємо перебором, а не відфільтрованим запитом",
        /admin\/users\?page=\$\{page\}&per_page=200/.test(src)
        && !/admin\/users\?filter=/.test(src));

    // Мовчазне «вільна» після обриву перебору було б неправдою.
    check("обрив перебору не видається за «вільна»",
        /перебрано 1000 кабінетів/.test(src));

    // «НЕ ЗАЙНЯТА» І «НЕ ЗМОГЛИ ПОДИВИТИСЬ» — РІЗНІ РЕЧІ.
    //
    // Поверталось на них однакове false, і зламана перевірка виглядала
    // точнісінько як вільна адреса: лист ішов, зміна мовчки не
    // відбувалась, і зрозуміти причину було нізвідки — ні власнику,
    // ні в журналі.
    check("перевірка каже, чи вона взагалі дивилась",
        /Promise<\{ checked: boolean; taken: boolean; pending: boolean \}>/.test(src)
        && (src.match(/return \{ checked: false, taken: false, pending: false \};/g) || []).length >= 3);

    check("маршрут передає це сайту",
        /taken: verdict\.taken,\s*\n\s*pending: verdict\.pending,\s*\n\s*checked: verdict\.checked,/.test(src));

    // Зупиняти зміну пошти через ЧУЖИЙ збій не можна — людина
    // опинилась би в глухому куті. Але й мовчати не годиться.
    check("сайт не мовчить, коли перевірка не спрацювала",
        /data\.checked === false/.test(read("assets/js/account.js")));
}

console.log(failures === 0
    ? "\n✅ Telegram-вхід: підтвердження в боті, одноразова спроба, сесія від Supabase\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
