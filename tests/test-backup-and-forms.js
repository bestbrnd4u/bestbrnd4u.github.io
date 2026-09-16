// Резервні копії, автозаповнення, підписка, доставка у фіді, ONESIZE.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. КОПІЯ Є І ВОНА ЗАШИФРОВАНА. Supabase на безкоштовному тарифі не
//    робить резервних копій узагалі — їхня власна документація радить
//    експортувати дані самостійно. А репозиторій публічний, тож
//    артефакт із іменами й телефонами покупців не може лежати
//    відкритим: без пароля крок НЕ вивантажує нічого.
//
// 2. БРАУЗЕР ПІДСТАВЛЯЄ КОНТАКТИ. Заміряно: із 17 полів оформлення
//    шість були без autocomplete, і це саме ім'я, пошта й телефон.
//    Це останній крок воронки, де кожне набране руками поле коштує
//    замовлення.
//
// 3. ПІДПИСКА БЕЗ ЗГОДИ НЕ ПРАЦЮЄ. Додати людину в розсилку без явної
//    згоди — те саме, що спам.
//
// 4. ДОСТАВКА У ФІДІ = ДОСТАВЦІ В РОЗМІТЦІ. Сторінка товару заявляє
//    60 ₴; без g:shipping Merchant Center бере тариф з налаштувань
//    акаунта, і Google скаржиться на розходження.
//
// 5. ONESIZE НЕ ВИДНО, АЛЕ КНОПКА ЛИШАЄТЬСЯ. Саме з неї сайт бере
//    розмір для кошика — приберемо, і той самий товар із картки й зі
//    сторінки дасть різні рядки кошика.

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
        .concat("\nmodule.exports = { " + names.join(", ") + " };");

    const module = { exports: {} };

    new Function("module", "exports", src)(module, module.exports);

    return module.exports;

}

console.log("\n[1] Резервна копія бази");
{
    const script = read("scripts/backup-data.js");
    const workflow = read(".github/workflows/backup.yml");

    const backup = require("../scripts/backup-data.js");

    check("скрипт є", fs.existsSync(path.join(ROOT, "scripts/backup-data.js")));

    // Копіюємо саме те, чого немає в репозиторії.
    ["orders", "order_refusals", "reviews", "profiles", "addresses", "cart_items"]
        .forEach(table => check(`копіює ${table}`, backup.TABLES.includes(table)));

    // Знімки з репозиторію копіювати ні до чого — вони перезбираються.
    check("не копіює залишки й ціни",
        !backup.TABLES.includes("stock") && !backup.TABLES.includes("prices"));

    check("не копіює лічильники",
        !backup.TABLES.some(t => /throttle/.test(t)));

    check("вивантажує сторінками", backup.PAGE > 0 && /offset=/.test(script));

    // ГОЛОВНЕ: без пароля артефакт не вивантажується.
    //
    // Репозиторій публічний, а в архіві імена, телефони й адреси
    // покупців. Відкритий артефакт тут гірший за відсутність копії.
    check("шифрування обов'язкове", /gpg --batch/.test(workflow));

    check("без пароля артефакт не йде",
        /if \[ -z "\$BACKUP_PASSPHRASE" \]/.test(workflow)
        && /sealed=false/.test(workflow));

    check("вивантаження залежить від шифрування",
        /if: steps\.seal\.outputs\.sealed == 'true'/.test(workflow));

    // Відкриті файли не мусять доїхати в артефакт.
    check("незашифроване прибирається",
        /rm -f "\$RUNNER_TEMP\/backup\.tar\.gz"/.test(workflow)
        && /rm -rf "\$RUNNER_TEMP\/backup"/.test(workflow));

    check("gpg не питає пароль інтерактивно", /--passphrase-fd 0/.test(workflow));

    check("шифр названий явно", /--cipher-algo AES256/.test(workflow));

    check("розклад щотижневий", /cron: "0 3 \* \* 0"/.test(workflow));

    check("можна запустити руками", /workflow_dispatch/.test(workflow));

    // Без ключа крок не падає: розклад не має червоніти через
    // ненастроєний секрет.
    check("без ключа бази нічого не робить",
        /SUPABASE_SERVICE_ROLE_KEY не заданий/.test(script));

    // Честь щодо того, чого копія НЕ покриває.
    // Копія покриває ДАНІ магазину, а не входи в кабінет: пошта й
    // пароль покупця лежать у схемі auth, а PostgREST віддає лише
    // public. Про це мусить бути сказано прямо — і в коді, і в описі
    // всередині архіву: інакше при відновленні виявиться, що люди не
    // можуть увійти, і це буде несподіванкою.
    check("сказано, що акаунтів у копії немає", /схем[іи] auth/.test(script));

    check("і в описі всередині архіву",
        /акаунтів покупців/.test(script) && /README\.txt/.test(script));

    check("до архіву кладеться опис", /README\.txt/.test(script));
}

console.log("\n[2] Браузер підставляє контакти в оформленні");
{
    const page = read("checkout.html");

    const want = {
        firstName: "given-name",
        lastName: "family-name",
        middleName: "additional-name",
        email: "email",
        phone: "tel",
    };

    Object.entries(want).forEach(([id, value]) => {

        const tag = (page.match(new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`)) || [""])[0];

        check(`${id} → ${value}`, new RegExp(`autocomplete="${value}"`).test(tag),
            tag.replace(/\s+/g, " ").slice(0, 110));

    });

    // Промокод — навпаки: браузер не має його пам'ятати й підставляти
    // в наступне замовлення.
    const promo = (page.match(/<input[^>]*\bid="promoInput"[^>]*>/) || [""])[0];

    check("промокод не запам'ятовується", /autocomplete="off"/.test(promo));

    check("і має підпис для програм читання екрана",
        /aria-label="Промокод"/.test(promo));

    // Розмітка не побита: атрибути дописані, а не вставлені всередину
    // інших.
    const { JSDOM } = require("jsdom");

    const doc = new JSDOM(page).window.document;

    check("розмітка розбирається",
        Object.keys(want).every(id => doc.getElementById(id)));

    check("обов'язковість полів не збилась",
        doc.getElementById("firstName").required
        && doc.getElementById("email").required
        && !doc.getElementById("middleName").required);

    check("підказки в полях лишились",
        Object.keys(want).every(id => doc.getElementById(id).getAttribute("placeholder")));
}

console.log("\n[3] Підписка на листи");
{
    const sub = loadModule("supabase/functions/telegram-order-bot/subscribe.js", [
        "SUBSCRIBE_LIMITS", "cleanEmail", "cleanSubscriber",
        "subscribeRequest", "subscribeVerdict", "subscriberStatus",
    ]);

    const pageJs = read("assets/js/subscribe.js");
    const indexTs = read("supabase/functions/telegram-order-bot/index.ts");

    // ЗГОДА ОБОВ'ЯЗКОВА.
    check("без згоди не приймається",
        sub.cleanSubscriber({ email: "a@b.co" }).ok === false);

    check("зі згодою приймається",
        sub.cleanSubscriber({ email: "a@b.co", consent: true }).ok === true);

    check("сервер теж вимагає згоди", /payload\.consent !== true/.test(
        read("supabase/functions/telegram-order-bot/subscribe.js")));

    check("сторінка не надсилає без галочки",
        /if \(!consentEl\.checked\)/.test(pageJs));

    check("галочка не проставлена заздалегідь",
        !/id="subscribeConsent"[^>]*checked/.test(read("index.html")));

    // ВЕРСТКА ЗГОДИ. Прапорець мусить бути обмежений явно.
    //
    // Угорі style.css є загальне правило для полів форми:
    //
    //     input, textarea, select{ width:100%; padding:14px 16px; … }
    //
    // Воно писалось під текстові поля, але типу не розрізняє — і
    // прапорець згоди отримував ширину всього блока підписки, а
    // flex-shrink:0 не давав йому стиснутись. Текст згоди
    // видавлювався у смужку близько 70px і ламався по одному слову
    // в рядок; точка після посилання лишалась на власному рядку.
    // Виглядало як зламана форма — і було нею.
    //
    // Той самий капкан уже описаний для .refusal-item; прапорець
    // підписки просто випав із того переліку.
    //
    // Заміряно після правки: прапорець 16×16, текст 250px на 1440,
    // 311px на телефоні, переповнення немає на жодній ширині.
    const css = read("assets/css/style.css");

    // ПРИВ'ЯЗКА ДО ПОЧАТКУ РЯДКА ОБОВ'ЯЗКОВА.
    //
    // Без неї пошук знаходив перше-ліпше правило, чий селектор
    // МІСТИТЬ цей рядок, — а таким стало
    // «.subscribe-account .subscribe-consent input[type="checkbox"]»,
    // яке перефарбовує галочку в кабінеті й розміру не задає. Тест
    // читав тіло чужого правила й повідомляв про поломку, якої немає.
    const consentRule = (css.match(
        /(?:^|\n)\.subscribe-consent input\[type="checkbox"\]\{[^}]*\}/) || [])[0] || "";

    check("прапорець згоди має власний розмір", /width:16px/.test(consentRule)
        && /height:16px/.test(consentRule), consentRule.slice(0, 60));

    check("і не тягне padding текстового поля", /padding:0/.test(consentRule));

    check("розмір не залежить від вільного місця", /flex:0 0 auto/.test(consentRule));

    // Правило мусить лишитись саме для checkbox: якщо повернути
    // загальний .subscribe-consent input без типу, під нього
    // потрапить і поле пошти, коли форму колись перебудують.
    check("правило адресує саме прапорець",
        !/\.subscribe-consent input\{/.test(css));

    // ТОЧКА В КІНЦІ ЗГОДИ — усередині посилання, а не після нього.
    //
    // Заміряно в Playwright (dev, вікно 1440): текст посилання
    // заповнював рядок ДО ПІКСЕЛЯ — вільного місця після нього рівно
    // нуль, — і точка падала на власний рядок. На скріншоті підвалу
    // вона стояла окремо під посиланням і виглядала як смітинка.
    //
    // Доки точка стоїть після </a>, вона окремий елемент рядка й
    // може відірватись на будь-якій ширині, де посилання
    // закінчується близько до краю. Усередині посилання вона
    // частина тексту, що переноситься лише по пробілах — у гіршому
    // разі поїде разом зі словом «даними».
    {
        const pages = [];

        (function walk(dir) {

            fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

                if (entry.name === "node_modules" || entry.name === ".git"
                    || entry.name === ".claude") return;

                const full = path.join(dir, entry.name);

                if (entry.isDirectory()) walk(full);
                else if (entry.name.endsWith(".html")) pages.push(full);

            });

        })(ROOT);

        const withConsent = pages.filter(file =>
            fs.readFileSync(file, "utf8").includes("subscribeConsent"));

        const orphan = withConsent.filter(file =>
            /даними<\/a>\./.test(fs.readFileSync(file, "utf8")));

        const fixed = withConsent.filter(file =>
            /даними\.<\/a>/.test(fs.readFileSync(file, "utf8")));

        check(`сторінок із формою підписки: ${withConsent.length}`, withConsent.length > 100);

        check("точка всередині посилання на всіх",
            fixed.length === withConsent.length,
            `${withConsent.length - fixed.length} без цього`);

        check("ніде не лишилась після посилання", orphan.length === 0,
            orphan.slice(0, 3).map(f => path.relative(ROOT, f)).join(", "));
    }



    // Пошта.
    check("пошта в нижньому регістрі без пробілів",
        sub.cleanEmail("  A@B.CO ") === "a@b.co");

    check("не пошта — не приймається",
        sub.cleanEmail("не пошта") === "" && sub.cleanEmail("a@b") === "");

    check("довга адреса обрізається",
        sub.cleanEmail("a".repeat(300) + "@b.co") === "");

    // Ключ = вимикач.
    check("без ключа запиту не буде",
        sub.subscribeRequest("", { email: "a@b.co" }) === null);

    const plan = sub.subscribeRequest("KEY", { email: "a@b.co" }, "42");

    check("ключ у заголовку, не в адресі",
        plan.headers.Authorization === "Bearer KEY" && !plan.url.includes("KEY"));

    // Подвійне підтвердження: людина мусить підтвердити пошту.
    check("статус unconfirmed", plan.body.status === "unconfirmed");

    check("група додається, коли задана", plan.body.groups[0] === "42");

    check("без групи поля немає",
        !("groups" in sub.subscribeRequest("KEY", { email: "a@b.co" }).body));

    // РІЗНИЦЯ МІЖ 200 І 201 — головне в цьому розборі.
    //
    // Документація MailerLite (POST /api/subscribers): 201 — підписника
    // створено, 200 — пошта вже була в списку. Раніше обидва коди
    // вважались просто успіхом, тож людина, підписана давно, читала
    // «перевірте пошту, там лист із підтвердженням» — а листа їй не
    // надсилали. Прапорець «уже в списку» ставився лише на 422, якого
    // MailerLite у цьому випадку не віддає.
    check("201 — нова пошта",
        sub.subscribeVerdict(201, { data: { status: "unconfirmed" } }).state === "new");

    check("200 — уже в списку, а не нова",
        sub.subscribeVerdict(200, { data: { status: "active" } }).already === true);

    check("200 + active — підтверджений",
        sub.subscribeVerdict(200, { data: { status: "active" } }).state === "active");

    // Найважливіший стан: у списку є, але підтвердження не натиснуто,
    // і саме тому листів немає. Без цього людина не знає, що робити.
    check("200 + unconfirmed — підписку не підтверджено",
        sub.subscribeVerdict(200, { data: { status: "unconfirmed" } }).state === "unconfirmed");

    check("200 + unsubscribed — підтвердження піде заново",
        sub.subscribeVerdict(200, { data: { status: "unsubscribed" } }).state === "again");

    check("200 без стану — просто «вже в списку»",
        sub.subscribeVerdict(200, {}).state === "already");

    // Стан читається і з плоскої відповіді, і з вкладеної в data.
    check("стан читається з обох виглядів відповіді",
        sub.subscriberStatus({ status: "active" }) === "active"
        && sub.subscriberStatus({ data: { status: "ACTIVE" } }) === "active"
        && sub.subscriberStatus(null) === "");

    // 422 лишається успіхом для людини, але стану ми там не знаємо —
    // і не вигадуємо його.
    check("уже в списку — це успіх",
        sub.subscribeVerdict(422, { message: "already exists" }).ok === true);

    check("422 не вдає підтверджену підписку",
        sub.subscribeVerdict(422, { message: "already exists" }).state === "already");

    check("погана пошта — не успіх",
        sub.subscribeVerdict(422, { message: "invalid email" }).ok === false);

    // Стан мусить доїхати до сторінки, інакше вона знову казатиме
    // одне й те саме всім.
    check("маршрут віддає стан сторінці", /state: verdict\.state/.test(indexTs));

    check("сторінка розрізняє стани",
        /function subscribeMessage/.test(pageJs)
        && /state === "unconfirmed"/.test(pageJs)
        && /state === "active"/.test(pageJs));

    check("про непідтверджену підписку сказано прямо",
        /не підтверджено/.test(pageJs) && /Спам/.test(pageJs));

    check("недійсний ключ розпізнається",
        /недійсний/.test(sub.subscribeVerdict(401, {}).reason));

    check("маршрут є у функції", /site_action === "subscribe"/.test(indexTs));

    check("ключ читається з секретів",
        /Deno\.env\.get\("MAILERLITE_API_KEY"\)/.test(indexTs));

    // ЧОМУ НЕ «У МЕЖАХ N СИМВОЛІВ». Так тут і було — і перевірка
    // почервоніла від того, що в handleSubscribe додали ще одну
    // перевірку перед межею звернень. Тобто тест ловив не відсутність
    // межі, а довжину функції: рівно та поломка, якої не було.
    //
    // Дивимось у тіло функції: воно й є відповіддю на питання «чи
    // застосовує підписка межу звернень».
    const subscribeBody = (() => {

        const at = indexTs.indexOf("async function handleSubscribe(");

        return at < 0 ? "" : indexTs.slice(at, indexTs.indexOf("\n}\n", at));

    })();

    check("є межа звернень", subscribeBody.includes("lookupAllowed"),
        subscribeBody ? "межі немає в тілі функції" : "функції не знайдено");

    // Недійсний ключ мусить бути видним: інакше форма мовчки не
    // працює, а список не росте.
    check("недійсний ключ пишеться в журнал",
        /reportServerIssue\("mail_list"/.test(indexTs)
        && /'mail_list'/.test(read("supabase/migrations/018-issue-kinds.sql")));

    // Людина мусить знати про лист підтвердження.
    check("сказано про лист підтвердження",
        /лист із підтвердженням/.test(pageJs));
}

console.log("\n[3a] Лист підтвердження підписки — наш, а не MailerLite");
{
    // ЩО БУЛО НЕ ТАК.
    //
    // Лист надсилав MailerLite, і приходив він АНГЛІЙСЬКОЮ:
    // «Confirm your email address». Відредагувати його на
    // безкоштовному тарифі не можна — у панелі кнопка «Редагувати»
    // закрита підказкою «доступно лише в платних тарифах».
    //
    // Людина щойно залишила пошту українському магазину й отримує
    // лист чужою мовою від назви, яку бачила вперше. Такі не
    // відкривають. А без відкриття підписка назавжди лишається
    // «unconfirmed»: у списку є, листів не отримує — тобто форма
    // працює, а розсилки немає.
    //
    // Решта листів магазину збирається в mail.js і йде через Resend
    // або Brevo. Цей був єдиним винятком.
    const sub = loadModule("supabase/functions/telegram-order-bot/subscribe.js", [
        "cleanToken", "confirmUrl", "confirmVerdict", "activateRequest",
        "CONFIRM_TTL_HOURS", "CONFIRM_COOLDOWN_MINUTES",
    ]);

    // require, а не loadModule: mail.js імпортує format.js, а
    // loadModule збирає модуль через new Function — там import
    // просто синтаксична помилка. Так само його бере
    // test-customer-mail.js.
    const mail = require("../supabase/functions/telegram-order-bot/mail.js");

    const indexTs = read("supabase/functions/telegram-order-bot/index.ts");

    const letter = mail.subscribeConfirmLetter(
        "https://bestbrnd4u.com/newsletter-confirm?token=8f14e45f-ceea-467a-9f2c-6a1b3c4d5e6f",
        "https://bestbrnd4u.com"
    );

    check("лист збирається в нас", Boolean(letter && letter.html));

    // Головне, заради чого все й робилось.
    check("лист українською",
        /[Ѐ-ӿ]/.test(letter.subject)
        && !/Confirm your email/i.test(letter.html),
        letter.subject);

    check("у листі є посилання підтвердження",
        letter.html.includes("newsletter-confirm?token="));

    // Поштові клієнти ріжуть розмітку кнопок — адреса мусить бути ще
    // й текстом, інакше лист стає глухим кутом.
    check("адреса продубльована текстом",
        (letter.html.match(/newsletter-confirm\?token=/g) || []).length >= 2);

    // Лист, що прийшов на чужу адресу, без цього рядка виглядає як
    // спам від магазину — і саме так його й відмітять.
    check("сказано, що робити, якщо це були не ви",
        /не ви/.test(letter.html));

    check("сказано, як відписатись", /відписатись/i.test(letter.html));

    // ТОКЕН. Усе, що не uuid, до бази не доходить узагалі.
    check("токен перевіряється за формою",
        sub.cleanToken("8F14E45F-CEEA-467A-9F2C-6A1B3C4D5E6F")
            === "8f14e45f-ceea-467a-9f2c-6a1b3c4d5e6f"
        && sub.cleanToken("' or 1=1--") === ""
        && sub.cleanToken("") === "");

    // Посилання веде на САЙТ, а не на функцію: у листі має стояти
    // домен, який людина впізнає.
    check("посилання веде на сайт",
        sub.confirmUrl("https://bestbrnd4u.com/", "abc")
            === "https://bestbrnd4u.com/newsletter-confirm?token=abc");

    // ЧОТИРИ СТАНИ, А НЕ ДВА. «Ви вже підписані» замість «недійсне
    // посилання» — різниця між спокоєм і другою спробою підписатись.
    const hour = 36e5;
    const now = Date.parse("2026-09-14T12:00:00Z");

    check("свіже посилання підтверджується",
        sub.confirmVerdict(
            { email: "a@b.co", created_at: "2026-09-14T11:00:00Z" }, now
        ).state === "ok");

    check("повторний перехід — «вже підписані», а не помилка",
        sub.confirmVerdict(
            { email: "a@b.co", created_at: "2026-09-14T11:00:00Z",
                confirmed_at: "2026-09-14T11:30:00Z" }, now
        ).state === "used");

    check("протухле посилання розпізнається",
        sub.confirmVerdict(
            { email: "a@b.co", created_at: new Date(now - (sub.CONFIRM_TTL_HOURS + 1) * hour).toISOString() },
            now
        ).state === "expired");

    check("невідомий токен не підтверджує нічого",
        sub.confirmVerdict(null, now).state === "unknown"
        && sub.confirmVerdict(null, now).ok === false);

    // Строк такий, щоб лист устигли відкрити ввечері наступного дня.
    check("посилання живе не менше доби", sub.CONFIRM_TTL_HOURS >= 24,
        sub.CONFIRM_TTL_HOURS);

    // АКТИВАЦІЯ. Ключ MailerLite — лише на сервері.
    check("активація йде в MailerLite",
        sub.activateRequest("key", "a@b.co").body.status === "active");

    check("без ключа активації немає",
        sub.activateRequest("", "a@b.co") === null);

    check("ключ у заголовку, а не в адресі",
        /Bearer key/.test(sub.activateRequest("key", "a@b.co").headers.Authorization));

    // ПОРЯДОК ДІЙ. Спершу MailerLite, потім позначка: інакше при
    // відмові MailerLite лишилась би підтверджена підписка, якої в
    // списку немає, а посилання вже вважалося б використаним.
    const handler = (indexTs.match(/async function handleSubscribeConfirm[\s\S]*?\n\}/) || [""])[0];

    check("маршрут підтвердження є", Boolean(handler));

    check("спершу MailerLite, потім позначка",
        handler.indexOf("activateRequest") < handler.indexOf("confirmed_at"));

    check("маршрут під'єднано", /site_action === "subscribe-confirm"/.test(indexTs));

    // Підтвердженим лист не потрібен: вони й так отримують розсилку.
    check("вже підтвердженим лист не шлемо",
        /verdict\.state !== "active"[\s\S]{0,120}sendSubscribeConfirmation/.test(indexTs));

    // Форма відкрита всім: без паузи її можна перетворити на спосіб
    // завалити чужу скриньку листами.
    check("на одну адресу лист не шлеться щоразу",
        /CONFIRM_COOLDOWN_MINUTES/.test(indexTs) && sub.CONFIRM_COOLDOWN_MINUTES >= 1);

    // Без таблиці підтвердити підписку неможливо взагалі — про це
    // мусить знати власник, а не покупець.
    check("про незастосовану міграцію повідомляємо власнику",
        /reportServerIssue\("mail_list", "Підтвердження підписки/.test(indexTs));

    check("міграція на таблицю є",
        fs.existsSync(path.join(ROOT, "supabase/migrations/032-newsletter-confirm.sql")));

    // RLS без політик = «нікому, крім service_role». Список чужих
    // токенів — це список чужих підписок, які можна підтвердити за
    // людину.
    const migration = read("supabase/migrations/032-newsletter-confirm.sql");

    check("таблиця закрита від браузера",
        /enable row level security/.test(migration)
        && !/create policy/.test(migration));

    // СТОРІНКА, на яку веде лист.
    const page = read("newsletter-confirm.html");
    const pageScript = read("assets/js/newsletter-confirm.js");

    check("сторінка підтвердження є", /id="confirmHeading"/.test(page));

    // САМЕ ВЛАСНИЙ noindex, А НЕ ТОЙ, ЩО СТАВИТЬ ЗБІРКА.
    //
    // scripts/apply-site-env.js додає <meta robots="noindex,nofollow">
    // усьому дев-середовищу — і ПРИБИРАЄ його на проді. Перевірка на
    // «є слово noindex» тому проходила локально й падала в CI, де
    // збирається бойова версія: саме на цьому й спіткнувся синк
    // 14.09.2026.
    //
    // Сторінці в індексі не місце: в адресі лежить одноразовий токен
    // чужої підписки, а без нього вона порожня. Тож перевіряємо
    // постійний тег — той, що переживає обидві збірки.
    check("вона не індексується на проді, а не лише на деві",
        /name="robots" content="noindex,follow"/.test(page),
        (page.match(/name="robots"[^>]*/g) || []).join(" | "));

    check("і закрита в robots",
        /Disallow: \/newsletter-confirm/.test(read("scripts/apply-site-env.js")));

    check("сторінка розрізняє всі чотири стани",
        ["confirmed", "used", "expired", "unknown"]
            .every(state => new RegExp(state + ":").test(pageScript)));

    // Ключ MailerLite дає право правити ВЕСЬ список підписників — у
    // коді сайту йому місця немає. Тому сторінка лише передає токен
    // своїй функції, а до MailerLite не звертається взагалі.
    //
    // Перевіряємо звернення, а не згадку: слово «MailerLite» у
    // поясненні нічого не розкриває, і забороняти його означало б
    // забороняти писати коментарі.
    check("сторінка лише передає токен своїй функції",
        /site_action: "subscribe-confirm"/.test(pageScript)
        && !/connect\.mailerlite\.com/.test(pageScript)
        && !/Bearer\s+["'`]?ml_/i.test(pageScript));
}

console.log("\n[3b] Форма підписки — у смузі, а не в порожньому тримачі");
{
    // ЩО БУЛО НЕ ТАК. У <section class="newsletter"> лежав
    // <div class="ml-embedded" data-form="…"> — тримач вбудованої
    // форми MailerLite, чий скрипт із сайту прибрали. Виходило:
    //
    //   • на головній — порожня смуга кольору бренду на пів екрана;
    //   • на решті — самотній підпис «Жодного спаму» без форми;
    //   • сама форма тулилась четвертою колонкою футера, під
    //     годинами роботи, де її майже не видно.
    //
    // Тобто найпомітніше місце займав порожній div.
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const dead = pages.filter(f => /data-form=/.test(read(f)));

    check("порожнього тримача MailerLite більше немає", dead.length === 0,
        dead.join(", "));

    const withBand = pages.filter(f => /<section class="newsletter">/.test(read(f)));

    check(`сторінок зі смугою: ${withBand.length}`, withBand.length >= 6);

    // У смузі мусить бути САМА форма, інакше смуга знову порожня.
    const emptyBand = withBand.filter(f => {
        const band = (read(f).match(/<section class="newsletter">[\s\S]*?<\/section>/) || [""])[0];
        return !band.includes("id=\"subscribeForm\"");
    });

    check("жодна смуга не порожня", emptyBand.length === 0, emptyBand.join(", "));

    // Рівно одна форма на сторінку: subscribe.js бере її через
    // getElementById, тож друга була б мертвою.
    const doubled = pages.filter(f => (read(f).match(/id="subscribeForm"/g) || []).length > 1);

    check("форма на сторінці одна", doubled.length === 0, doubled.join(", "));

    // Заголовок смуги замінює видимий підпис поля, але сам підпис
    // лишається в розмітці — інакше читалка екрана не скаже, що це
    // за поле. Тому він ховається через clip, а не display:none:
    // прихований display читалки теж не читають.
    const css = read("assets/css/style.css");

    check("підпис поля лишився в розмітці",
        withBand.every(f => read(f).includes("class=\"subscribe-label\"")));

    check("у смузі підпис прихований, але доступний",
        /\.newsletter \.subscribe-label\{[^}]*clip-path:inset\(50%\)/.test(css)
        && !/\.newsletter \.subscribe-label\{[^}]*display:none/.test(css));

    // Мертвий клас .newsletter-form: стилі форми, якої на сайті не
    // було ні на одній сторінці.
    check("мертвий .newsletter-form прибрано", !css.includes("newsletter-form"));

    // На сторінках без смуги форма лишається у футері — велика
    // рекламна смуга посеред оформлення замовлення відвертає від
    // покупки. Але форма мусить бути ХОЧ ДЕСЬ.
    const withoutForm = pages.filter(f => !read(f).includes("id=\"subscribeForm\""));

    check("форма є на кожній сторінці", withoutForm.length === 0,
        withoutForm.join(", "));

    // Заголовок 44px писався під широку смугу десктопа; на телефоні
    // він розповзався на два рядки й забирав пів висоти.
    check("на телефоні заголовок смуги менший",
        /@media\(max-width:600px\)\{[\s\S]{0,600}?\.newsletter h2\{[^}]*font-size:26px/.test(css));
}

console.log("\n[4] Скрипт MailerLite більше не вантажиться");
{
    const walk = (dir, found = []) => {

        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

            if (["node_modules", ".git", ".claude"].includes(entry.name)) return;

            const full = path.join(dir, entry.name);

            if (entry.isDirectory()) walk(full, found);
            else if (entry.name.endsWith(".html")) found.push(full);

        });

        return found;

    };

    const all = walk(ROOT);

    // 52 КБ і з'єднання зі стороннім доменом на КОЖНІЙ сторінці — за
    // нуль користі: форми підписки не було жодної.
    const loading = all.filter(file =>
        /assets\.mailerlite\.com|ml\('account'/.test(fs.readFileSync(file, "utf8")));

    check(`жодна з ${all.length} сторінок не вантажить MailerLite`,
        loading.length === 0,
        loading.slice(0, 3).map(f => path.relative(ROOT, f)).join(", "));

    const withForm = all.filter(file =>
        fs.readFileSync(file, "utf8").includes("subscribeForm"));

    check(`форма є на ${withForm.length} сторінках`, withForm.length > 100);

    const noScript = withForm.filter(file =>
        !/assets\/js\/subscribe\.js/.test(fs.readFileSync(file, "utf8")));

    check("і всюди підключений скрипт", noScript.length === 0,
        noScript.slice(0, 3).map(f => path.relative(ROOT, f)).join(", "));

    // Політика мусить описувати те, що справді відбувається. До цієї
    // зміни там було написано про форму підписки, якої не існувало.
    const privacy = read("privacy-policy.html");

    check("політика каже, що скрипт не вантажиться",
        /не завантажується взагалі/.test(privacy) && /MailerLite/.test(privacy));

    check("і що передається лише адреса",
        /тільки адресу пошти/.test(privacy));

    check("і про подвійне підтвердження", /підтвердженням/.test(privacy));
}

console.log("\n[5] «Не налаштовано» видно, а не приймається за «зроблено»");
{
    const env = require("../scripts/site-env.js");

    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ.
    //
    // Кроки за розкладом, яким бракує ключа, виходять УСПІШНО —
    // розклад не має червоніти через ненастроєну можливість. Але тоді
    // в списку запусків стоїть галочка, а зроблено нічого.
    //
    // Заміряно в логу справжнього запуску Remind carts:
    //   MAIL_FROM:
    //   Немає ключа розсилки — нагадування пропускаю
    //   → success
    //
    // Ключів пошти в GitHub Actions не було взагалі: вони лежали в
    // секретах Supabase, а це ІНШЕ сховище. Тобто нагадування про
    // брошений кошик не надіслали жодного листа з дня появи.
    check("є помічник", typeof env.notConfigured === "function");

    ["scripts/remind-carts.js", "scripts/request-reviews.js"].forEach(rel => {

        const src = read(rel);

        check(`${rel}: попереджає про відсутній ключ розсилки`,
            /notConfigured\("Немає ключа розсилки/.test(src));

        check(`${rel}: і про відсутній MAIL_FROM`,
            /notConfigured\("Немає MAIL_FROM/.test(src));

        // Крок і далі НЕ падає: інакше розклад червонів би через
        // можливість, якої ще не налаштували.
        check(`${rel}: але не падає через це`,
            !/MAIL_FROM[\s\S]{0,120}process\.exit\(1\)/.test(src));

    });

    // ::warning:: лише в Actions — локально це був би шум.
    check("формат Actions лише в Actions",
        /process\.env\.GITHUB_ACTIONS/.test(read("scripts/site-env.js")));

    // Копія веде себе так само: без пароля попереджає, а не мовчить.
    check("копія теж попереджає",
        /::warning::Немає секрету BACKUP_PASSPHRASE/.test(read(".github/workflows/backup.yml")));
}

console.log("\n[6] Доставка у фіді = доставці в розмітці");
{
    const feedJs = read("scripts/build-feed.js");
    const productJs = read("assets/js/product.js");

    // Тариф написаний РАЗ — у assets/js/product-offer.js. Раніше тут
    // звірялись два окремі рядки «const SHIPPING_RATE_UAH = 60» — у
    // фіді й на сторінці; тест ловив розходження вже після того, як
    // воно з'явилось. Тепер розійтись нема чому, і перевіряємо саме
    // це: обидва читають модуль.
    const offer = require("../assets/js/product-offer.js");

    check(`тариф із модуля: ${offer.SHIPPING_RATE_UAH}`,
        offer.SHIPPING_RATE_UAH === 60);

    check("нуля тут бути не може", offer.SHIPPING_RATE_UAH !== 0);

    check("фід і сторінка беруть тариф з модуля",
        /product-offer/.test(feedJs) && /product-offer/.test(productJs));

    check("власних копій числа не лишилось",
        !/SHIPPING_RATE_UAH = /.test(feedJs) && !/SHIPPING_RATE_UAH = /.test(productJs));

    const feed = read("feed.xml");

    const items = (feed.match(/<item>/g) || []).length;
    const shipping = (feed.match(/<g:shipping>/g) || []).length;

    check(`доставка в усіх ${items} позиціях`, items > 0 && shipping === items,
        `${shipping} із ${items}`);

    const prices = [...feed.matchAll(/<g:shipping>[\s\S]*?<g:price>([^<]*)<\/g:price>/g)]
        .map(m => m[1]);

    check("тариф один на всі товари", new Set(prices).size === 1, [...new Set(prices)].join(", "));

    check("країна вказана", /<g:country>UA<\/g:country>/.test(feed));

    // XML не побитий: битий фід гірший за відсутній.
    check("теги закриті",
        (feed.match(/<g:shipping>/g) || []).length === (feed.match(/<\/g:shipping>/g) || []).length);
}

console.log("\n[7] ONESIZE: у сітці ховається, на сторінці товару видно");
{
    const common = read("assets/js/common.js");

    check("є помічник", /function isPlaceholderSize\(size\)/.test(common));

    check("регістр не важить", /toUpperCase\(\) === NO_SIZE_LABEL/.test(common));

    check("рядок ховається лише коли в ньому НІЧОГО, крім заглушки",
        /list\.length > 0 && list\.every\(isPlaceholderSize\)/.test(common));

    // КОМПАКТНІ ВИДИ — ховають. Там немає підпису «Розмір», тож і
    // порожнечі не виникає, а «ONESIZE» під кожною сумкою в сітці
    // читається як помилка в даних.
    [
        ["assets/js/ui.js", "картка каталогу"],
        ["assets/js/cart.js", "кошик"],
        ["assets/js/favorites.js", "обране"],
    ].forEach(([rel, where]) => {
        check(`${where} — ховає`, /sizes-placeholder/.test(read(rel)));
    });

    // ДЕТАЛЬНИЙ ВИД — показує.
    //
    // Тут теж стояло ховання, і виходила поломка: рядок кнопок
    // зникав, а підпис «Розмір» над ним лишався. Заміряно на сумці
    // Marc Jacobs: .size-row-head видно (698×38), .sizes має
    // display:none. Тобто заголовок без значення — виглядає рівно
    // як «розмір зник».
    //
    // Плюс саме на цій сторінці покупець підтверджує, що кладе в
    // кошик, і бачити розмір там доречно навіть коли він один.
    const productJs = read("assets/js/product.js");

    check("сторінка товару — показує", !/sizes-placeholder/.test(productJs));

    check("і причина записана в коді",
        /показується ЗАВЖДИ, зокрема з ONESIZE/.test(productJs));

    // Підпис «Розмір» лишається на місці — саме він і робив
    // порожнечу помітною, і саме під ним тепер є значення.
    check("підпис «Розмір» на сторінці товару лишився",
        /<label>Розмір<\/label>/.test(productJs));

    check("стиль ховає рядок", /\.sizes-placeholder\{[\s\S]{0,60}display:none/.test(
        read("assets/css/style.css")));

    // ГОЛОВНЕ: кнопку НЕ прибрано. Саме з неї сайт бере розмір для
    // кошика (getCardSelection читає .mini-size.active). Прибрати —
    // означає, що той самий товар із картки дасть size: null, а зі
    // сторінки "ONESIZE": два різні рядки кошика замість одного.
    check("кнопка розміру далі малюється",
        /class="mini-size \$\{sizes\.length === 1 \? "active" : ""\}"/.test(read("assets/js/ui.js")));

    check("вибір розміру читається з активної кнопки",
        /\.mini-size\.active"\)\?\.textContent/.test(common));

    check("причина описана в коді",
        /різні рядки кошика|роздвоїться/.test(read("assets/js/common.js"))
        || /різні рядки кошика/.test(read("assets/css/style.css")));
}

console.log(failures === 0
    ? "\n✅ Копія зашифрована, контакти підставляються, ONESIZE не видно\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
