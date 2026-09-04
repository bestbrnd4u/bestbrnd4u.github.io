// Панель «Замовлення» в адмінці.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Замовленнями керували лише з Telegram. Кнопок вистачало, поки
// замовлень одне-два на день: далі «знайти замовлення тижневої
// давнини» = гортати чат, «побачити всі нові» = /orders з десятьма
// останніми, «працювати з компʼютера» = чат на телефоні.
//
// Тепер тим самим можна керувати зі сторінки адмінки. Бот лишається
// як був — це другий спосіб, а не заміна.
//
// ГОЛОВНІ ВИМОГИ, ЯКІ СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// --------------------------------------------
// 1. БЕЗ ПРАВ — ЖОДНОГО БАЙТА. Замовлення це телефони, адреси й суми
//    живих людей. Запит без підтверджених прав не має доходити до
//    бази взагалі.
// 2. ОДИН ЛАНЦЮЖОК СТАТУСІВ на два способи керування. Інакше статус
//    залежав би від того, звідки його змінили.
// 3. ЗМІНА З ПАНЕЛІ = НАТИСКАННЯ КНОПКИ В ЧАТІ: те саме сповіщення
//    клієнту й та сама перемальована картка власника.
// 4. ДАНІ КЛІЄНТА ЕКРАНУЮТЬСЯ. Імʼя й місто пише покупець, а
//    показуються вони в браузері менеджера.
//
// ЯК ЦЕ ПЕРЕВІРЯЄТЬСЯ
// --------------------
// Не читанням коду очима: зібрана Edge Function піднімається просто
// тут (Node вміє прибирати типи TypeScript), а замість Deno, мережі
// й бази підставлені заглушки. Сторінка панелі так само піднімається
// в JSDOM і відповідає на кліки. Тобто перевіряється те, що
// поїде на сервер і в браузер, а не його опис.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const FN_DIR = path.join(ROOT, "supabase/functions/telegram-order-bot");

const SRC = fs.readFileSync(path.join(FN_DIR, "_index.src.ts"), "utf8");
const BUNDLE = fs.readFileSync(path.join(FN_DIR, "index.ts"), "utf8");
const PAGE = fs.readFileSync(path.join(ROOT, "admin/orders.html"), "utf8");
const PANEL = fs.readFileSync(path.join(ROOT, "admin/orders.js"), "utf8");

// ======================================
// Стенд: зібрана функція, піднята в Node
// ======================================

// Замовлення-заглушки. Перше — гостьове з бота (є чат клієнта й
// збережена картка), друге — з кабінету, із ТТН і заявкою на відмову.
function sampleOrders() {

    return [
        {
            id: 41, order_number: "0708553442", created_at: "2026-09-01T10:12:00Z",
            status: "new",
            items: [{ title: "Сумка кросбоді", brand: "Coach", price: 4359, qty: 1, color: "Бежевий", size: "M" }],
            subtotal: 4359, discount: 0, delivery_price: 60, total: 4419,
            first_name: "Іван", last_name: "Петренко", phone: "+380501234567", email: null,
            delivery_method: "На відділення «Нова пошта»", delivery_city: "Київ", delivery_detail: "12",
            payment_method: "Оплата при отриманні", promo_code: null,
            tracking_number: null, refusal_requested_at: null,
            user_id: null, telegram_chat_id: 555, bot_message_id: 9001,
        },
        {
            id: 42, order_number: "0708553443", created_at: "2026-09-02T11:00:00Z",
            status: "shipped",
            items: [{ title: "Ремінь", price: 1200, qty: 2 }],
            subtotal: 2400, discount: 0, delivery_price: 0, total: 2400,
            first_name: "Оля", last_name: null, phone: "+380671112233", email: "olya@example.com",
            tracking_number: "20450912345678", refusal_requested_at: "2026-09-03T08:00:00Z",
            user_id: "u-1", telegram_chat_id: 999, bot_message_id: null,
        },
    ];
}

function startFunction(orders) {

    const { stripTypeScriptTypes } = require("node:module");

    const js = stripTypeScriptTypes(BUNDLE, { mode: "strip" });

    const calls = [];
    let handler = null;

    const fakeDeno = {
        env: {
            get: (name) => ({
                TELEGRAM_BOT_TOKEN: "bot-token",
                TELEGRAM_CHAT_ID: "777",
                HOOK_SECRET: "hook",
                TELEGRAM_WEBHOOK_SECRET: "tg",
                SUPABASE_URL: "https://db.example",
                SUPABASE_SERVICE_ROLE_KEY: "service-key",
            })[name],
        },
        serve: (fn) => { handler = fn; },
    };

    const fakeFetch = async (url, init = {}) => {

        const address = String(url);
        const method = init.method || "GET";

        calls.push({ url: address, method, body: init.body, headers: init.headers || {} });

        // --- GitHub: чи має токен право запису ---
        if (address.startsWith("https://api.github.com/repos/")) {

            const token = String(init.headers?.Authorization || "");

            if (token === "token owner") {
                return new Response(JSON.stringify({ permissions: { push: true, admin: true } }), { status: 200 });
            }

            // Публічний репозиторій видно всім — але без права запису.
            if (token === "token stranger") {
                return new Response(JSON.stringify({ permissions: { push: false, pull: true } }), { status: 200 });
            }

            return new Response("Bad credentials", { status: 401 });

        }

        if (address.startsWith("https://api.telegram.org/")) {
            return new Response(JSON.stringify({ ok: true, result: { message_id: 12345 } }), { status: 200 });
        }

        if (address.startsWith("https://db.example/rest/v1/order_refusals")) {
            return new Response(JSON.stringify([{
                id: 3, created_at: "2026-09-03T08:00:00Z",
                note: "не підійшов розмір",
                items: [{ title: "Ремінь", price: 1200, qty: 1 }],
            }]), { status: 200 });
        }

        if (address.startsWith("https://db.example/rest/v1/orders")) {

            const query = address.slice("https://db.example/rest/v1/".length);
            const id = /id=eq\.(\d+)/.exec(query)?.[1];

            if (method === "PATCH") {

                const order = orders.find((o) => String(o.id) === id);

                if (order) Object.assign(order, JSON.parse(init.body));

                return new Response(JSON.stringify(order ? [order] : []), { status: 200 });

            }

            if (id) {
                const order = orders.find((o) => String(o.id) === id);
                return new Response(JSON.stringify(order ? [order] : []), { status: 200 });
            }

            const status = /status=eq\.(\w+)/.exec(query)?.[1];

            let rows = orders.filter((o) => !status || o.status === status);

            if (/refusal_requested_at=not\.is\.null/.test(query)) {
                rows = rows.filter((o) => o.refusal_requested_at);
            }

            return new Response(JSON.stringify(rows), {
                status: 200,
                headers: { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
            });

        }

        throw new Error("несподіваний запит: " + address);

    };

    // console заглушуємо: функція навмисно пише в логи про відмови в
    // доступі, і в звіті тестів це виглядало б як помилка.
    const quiet = { log() {}, error() {}, warn() {} };

    new Function("Deno", "fetch", "EdgeRuntime", "console", js)(fakeDeno, fakeFetch, undefined, quiet);

    const request = (body, headers = {}) => new Request("https://fn.example/telegram-order-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    });

    return {
        calls,
        orders,
        options: (origin) => handler(new Request("https://fn.example/telegram-order-bot", {
            method: "OPTIONS",
            headers: origin ? { origin } : {},
        })),
        post: (body, headers) => handler(request(body, headers)),
        admin: (body, token = "owner") => handler(request(body, {
            origin: "https://dev.bestbrnd4u.com",
            "x-admin-token": token,
        })),
        dbCalls: () => calls.filter((c) => c.url.includes("db.example")),
        telegramCalls: () => calls.filter((c) => c.url.includes("api.telegram.org"))
            .map((c) => ({ method: c.url.split("/").pop(), body: JSON.parse(c.body) })),
        clear: () => { calls.length = 0; },
    };

}

const canRunFunction = typeof require("node:module").stripTypeScriptTypes === "function";

if (!canRunFunction) {
    console.log("\n⚠️  Node без stripTypeScriptTypes — блоки з живою функцією пропущено");
}

(async () => {

const A = await import(require("url").pathToFileURL(path.join(FN_DIR, "admin-api.js")).href);
const M = await import(require("url").pathToFileURL(path.join(FN_DIR, "format.js")).href);

console.log("\n[1] КРИТИЧНО: без прав — жодного байта даних");
{
    // Панель не заводить власного пароля: вона надсилає токен GitHub,
    // під яким людина вже зайшла в адмінку, а функція питає в GitHub,
    // чи має цей токен право ЗАПИСУ в репозиторій сайту. Право
    // писати в репозиторій = право змінити будь-яку сторінку сайту;
    // хто його має, той і веде замовлення.
    check("є перевірка прав", /async function verifyAdmin\(/.test(SRC));
    check("права питаються в GitHub, а не в списку логінів у коді",
        /api\.github\.com\/repos\/\$\{ADMIN_REPO\}/.test(SRC));
    check("потрібне саме право запису (push)",
        /repo\?\.permissions\?\.push/.test(SRC));
    check("репозиторій можна перевизначити секретом",
        /Deno\.env\.get\("ADMIN_REPO"\)/.test(SRC));
    check("токен не тримається в памʼяті — лише його відпечаток",
        /fingerprint\(token\)/.test(SRC) && /SHA-256/.test(SRC));

    if (canRunFunction) {

        const fn = startFunction(sampleOrders());

        for (const [name, token] of [["без токена", ""], ["чужий токен", "nonsense"], ["без права запису", "stranger"]]) {

            fn.clear();

            const response = await fn.admin({ admin_action: "list" }, token);
            const payload = await response.json();

            check(`${name}: 403`, response.status === 403, response.status);
            check(`${name}: до бази не дійшло`, fn.dbCalls().length === 0, fn.dbCalls().length);
            check(`${name}: у відповіді немає замовлень`,
                !payload.orders && !JSON.stringify(payload).includes("0708553442"));

        }

        // Перевірка стоїть ПЕРЕД розбором запиту: інакше сторонній
        // дізнавався б із текстів помилок, які дії взагалі бувають.
        fn.clear();
        const response = await fn.admin({ admin_action: "неіснуюча" }, "stranger");
        check("невідома дія від стороннього — теж 403, а не «невідома дія»",
            response.status === 403, response.status);

    }
}

console.log("\n[2] Дозвіл браузера (CORS): без нього панель не отримає нічого");
{
    // Панель живе на домені сайту, функція — на supabase.co. Це
    // завжди міждоменний запит, і браузер спершу питає дозволу
    // окремим запитом OPTIONS. Найпідступніше тут те, що без
    // відповіді на нього в логах функції не буде жодного слідy.
    check("дозволені бойовий і тестовий домени",
        A.ADMIN_ORIGINS.includes("https://bestbrnd4u.com")
        && A.ADMIN_ORIGINS.includes("https://dev.bestbrnd4u.com"));
    check("сторонній домен не дозволений", A.isAllowedOrigin("https://evil.example") === false);
    check("порожній origin не дозволений", A.isAllowedOrigin("") === false);
    check("піддомен-підробка не проходить",
        A.isAllowedOrigin("https://bestbrnd4u.com.evil.example") === false);
    check("локальний перегляд дозволений", A.isAllowedOrigin("http://localhost:8080") === true);

    const headers = A.corsHeaders("https://dev.bestbrnd4u.com");

    check("дозвіл виданий конкретному домену, а не «*»",
        headers["Access-Control-Allow-Origin"] === "https://dev.bestbrnd4u.com");
    check("власний заголовок з токеном дозволений",
        headers["Access-Control-Allow-Headers"].includes(A.ADMIN_TOKEN_HEADER));
    check("є Vary: Origin — інакше відповідь одного домену закешується для іншого",
        headers.Vary === "Origin");
    check("сторонньому домену дозвіл не видається",
        A.corsHeaders("https://evil.example")["Access-Control-Allow-Origin"] === undefined);

    // Токен їде ВЛАСНИМ заголовком, а не Authorization: останній на
    // шляху до функції розбирає сам Supabase, шукаючи там свій JWT.
    check("токен їде не в Authorization", A.ADMIN_TOKEN_HEADER === "x-admin-token");
    check("панель шле саме цей заголовок", PANEL.includes('"x-admin-token"'));

    if (canRunFunction) {

        const fn = startFunction(sampleOrders());

        let response = await fn.options("https://dev.bestbrnd4u.com");
        check("preflight зі свого домену — дозвіл", response.status === 204, response.status);
        check("preflight повертає дозволений домен",
            response.headers.get("access-control-allow-origin") === "https://dev.bestbrnd4u.com");

        response = await fn.options("https://evil.example");
        check("preflight з чужого домену — відмова", response.status === 403, response.status);
        check("чужому домену дозвіл не виданий",
            response.headers.get("access-control-allow-origin") === null);

        // Помилка теж мусить приходити з дозволом — інакше браузер
        // покаже панелі невиразну помилку мережі замість причини.
        response = await fn.admin({ admin_action: "list" }, "");
        check("відповідь-відмова теж має заголовок дозволу",
            response.headers.get("access-control-allow-origin") === "https://dev.bestbrnd4u.com");

    }
}

console.log("\n[3] Один ланцюжок статусів на два способи керування");
{
    // Регресія, яка вже була в цьому боті: спершу він мав власні
    // вигадані статуси (taken, confirmed) — у Telegram усе
    // виглядало правильно, а кабінет клієнта таких значень не знав
    // і показував їх як «Нове». Два списки переходів розійшлися б
    // так само.
    check("ланцюжок винесений в одну функцію", typeof M.allowedTransitions === "function");
    check("кнопки бота беруть його, а не свій список",
        /const valid = allowedTransitions\(status\);/.test(
            fs.readFileSync(path.join(FN_DIR, "format.js"), "utf8")));

    ["new", "processing", "shipped"].forEach((status) => {
        check(`«${M.STATUSES[status].label}»: панель і бот пропонують те саме`,
            A.adminTransitions(status).join() === M.allowedTransitions(status).join(),
            `${A.adminTransitions(status)} ≠ ${M.allowedTransitions(status)}`);
    });

    check("через крок не перескочити", !A.adminTransitions("new").includes("completed"));
    check("відправлене не «скасувати в нове»", !A.adminTransitions("shipped").includes("new"));

    // Єдина навмисна різниця: помилковий клік по «Скасувати» не
    // мусить заморожувати замовлення назавжди.
    check("зі «Скасовано» панель повертає в роботу",
        A.adminTransitions("cancelled").join() === "processing");
    check("з «Виконано» панель повертає в роботу",
        A.adminTransitions("completed").join() === "processing");
    check("у боті таких кнопок як не було, так і немає",
        M.allowedTransitions("cancelled").length === 0 && M.allowedTransitions("completed").length === 0);

    // Ключі статусів мусять лишатись тими, які розуміє сайт.
    const account = fs.readFileSync(path.join(ROOT, "assets/js/account.js"), "utf8");

    Object.keys(M.STATUSES).forEach((key) => {
        check(`статус «${key}» знає й кабінет клієнта`,
            new RegExp(`^\\s+${key}:`, "m").test(account));
    });

    check("порядок вкладок покриває всі статуси",
        A.STATUS_ORDER.length === Object.keys(M.STATUSES).length
        && A.STATUS_ORDER.every((key) => M.STATUSES[key]));

    if (canRunFunction) {

        const fn = startFunction(sampleOrders());

        // Звіряємось із базою, а не з тим, що показує сторінка:
        // статус могли змінити кнопкою в Telegram хвилину тому.
        let response = await fn.admin({ admin_action: "status", id: 41, status: "completed" });
        let payload = await response.json();

        check("стрибок через крок відхилено", response.status === 409, response.status);
        check("у відмові сказано, який статус зараз", /Нове/.test(payload.error), payload.error);
        check("разом із відмовою прийшло свіже замовлення",
            payload.order && payload.order.status === "new");
        check("статус у базі не змінився", fn.orders[0].status === "new");

        response = await fn.admin({ admin_action: "status", id: 41, status: "processing" });
        payload = await response.json();

        check("дозволений перехід виконується", response.status === 200 && payload.order.status === "processing");
        check("панель одразу отримує нові доступні переходи",
            payload.order.transitions.join() === "shipped,cancelled", payload.order.transitions);
    }
}

console.log("\n[4] Зміна з панелі = натискання кнопки в чаті");
{
    // Інакше два способи керування розійшлися б у найгіршому
    // місці: клієнт отримував би сповіщення лише тоді, коли статус
    // змінили в Telegram.
    check("панель шле те саме сповіщення клієнту",
        /await notifyCustomer\(updated, params\.status\);/.test(SRC));
    check("панель перемальовує картку власника",
        /await refreshOwnerCard\(updated\);/.test(SRC));

    // Картка в чаті — звичайне повідомлення, саме воно не
    // оновлюється. Тому бот запам'ятовує його номер.
    check("бот запам'ятовує картку нового замовлення",
        /rememberCardMessage\(record\.id, sent\?\.result\?\.message_id\)/.test(SRC));
    check("картку, відкриту зі списку, теж запам'ятовує",
        /rememberCardMessage\(order\.id, sent\?\.result\?\.message_id\)/.test(SRC));
    check("і ту, під якою натиснули кнопку",
        /rememberCardMessage\(updated\.id, callback\.message\.message_id\)/.test(SRC));

    const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/009-admin-orders.sql"), "utf8");

    check("міграція додає колонку для номера картки",
        /add column if not exists bot_message_id bigint/i.test(sql));
    check("міграція додає індекс для списку за датою",
        /create index if not exists orders_created_at_idx/i.test(sql));
    check("повторний запуск міграції безпечний",
        (sql.match(/if not exists/gi) || []).length >= 3 && !/<PROJECT_REF>|<HOOK_SECRET>/.test(sql));

    // Без міграції панель мусить лишатись робочою — просто без
    // перемальовки картки.
    check("невдача запису номера картки не валить бота",
        /catch \(error\) \{[\s\S]{0,200}Не вдалося запам'ятати картку/.test(SRC));

    if (canRunFunction) {

        const fn = startFunction(sampleOrders());

        fn.clear();
        await fn.admin({ admin_action: "status", id: 41, status: "processing" });

        const telegram = fn.telegramCalls();
        const notify = telegram.find((c) => c.method === "sendMessage");
        const edit = telegram.find((c) => c.method === "editMessageText");

        check("клієнту надіслано сповіщення", Boolean(notify));
        check("сповіщення пішло в чат клієнта, а не власника",
            notify && notify.body.chat_id === 555, notify && notify.body.chat_id);
        check("картку власника перемальовано", Boolean(edit));
        check("перемальовано саме збережену картку",
            edit && edit.body.message_id === 9001, edit && edit.body.message_id);
        check("у перемальованій картці новий статус",
            edit && /В обробці/.test(edit.body.text));
        check("кнопки картки теж від нового статусу",
            edit && JSON.stringify(edit.body.reply_markup).includes("st:shipped:41"));

        // Замовлення з сайту не має чату клієнта — сповіщення просто
        // не надсилається, і це не помилка.
        const site = startFunction([Object.assign(sampleOrders()[0], { telegram_chat_id: null })]);

        site.clear();
        const response = await site.admin({ admin_action: "status", id: 41, status: "processing" });

        check("замовлення з сайту: статус міняється без сповіщення",
            response.status === 200
            && site.telegramCalls().filter((c) => c.method === "sendMessage").length === 0);

        // Вебхук нового замовлення мусить працювати як раніше.
        const bot = startFunction(sampleOrders());

        bot.clear();
        const hook = await bot.post(
            { type: "INSERT", table: "orders", record: bot.orders[0] },
            { "x-hook-secret": "hook" },
        );

        check("сповіщення про нове замовлення працює як раніше", hook.status === 200);
        check("і картка одразу запам'ятовується",
            bot.dbCalls().some((c) => c.method === "PATCH" && /"bot_message_id":12345/.test(c.body)));
    }
}

console.log("\n[5] Список: пошук, вкладки, сторінки");
{
    const query = A.buildListQuery({ status: "new", limit: 25, offset: 50 });

    check("сортування від найновіших", query.includes("order=created_at.desc"));
    check("фільтр за статусом", query.includes("status=eq.new"));
    check("сторінка", query.includes("limit=25") && query.includes("offset=50"));
    check("колонки перелічені, а не select=*", query.includes("select=id,order_number"));

    check("вкладка відмов фільтрує за позначкою",
        A.buildListQuery({ refusal: true }).includes("refusal_requested_at=not.is.null"));

    // Пошук їде в параметр or=(...), де кома, дужки й лапки — це
    // синтаксис. Тому все, що не схоже на текст запиту, прибирається,
    // і введене лишається ЗНАЧЕННЯМ: PostgREST ділить умову на
    // «колонка.оператор.значення» за першими двома точками, тож усе
    // після ilike. — це шаблон пошуку, а не новий фільтр.
    const nasty = A.searchClause('20"),(status.eq.new');
    const inside = nasty.slice("or=(".length, -1);

    check("лапки, дужки й коми в пошуку не виживають",
        !/["'()]/.test(inside), inside);

    const conditions = inside.split(",");

    check("своїх умов через пошук не додати — їх рівно стільько, скільки полів",
        conditions.length === A.SEARCH_FIELDS.length, conditions.length);
    check("кожна умова лишається пошуком по своєму полю",
        conditions.every((condition, index) =>
            new RegExp(`^${A.SEARCH_FIELDS[index]}\.ilike\.[^,()"']*$`).test(condition)),
        conditions.find((condition, index) =>
            !new RegExp(`^${A.SEARCH_FIELDS[index]}\.ilike\.[^,()"']*$`).test(condition)));

    check("пошук іде по номеру, телефону, імені й ТТН",
        ["order_number", "phone", "first_name", "last_name", "tracking_number"]
            .every((field) => A.searchClause("20").includes(field)));

    // Телефон у базі лежить як +380…, а диктують його як «050 …».
    const byPhone = A.searchClause("050 123 45 67");

    check("телефон знаходиться за цифрами без пробілів",
        byPhone.includes("phone.ilike.*0501234567*"), byPhone);

    check("імʼя з прізвищем шукається разом",
        A.searchClause("Іван Петренко").includes("*Іван*Петренко*"));

    check("порожній пошук не додає фільтра", A.searchClause("   ") === "");
    check("довгий запит підрізається", A.sanitizeSearch("я".repeat(300)).length === 60);

    check("кількість рядків читається з Content-Range",
        A.parseTotal("0-24/137") === 137 && A.parseTotal("*/*") === null);

    if (canRunFunction) {

        const fn = startFunction(sampleOrders());

        const response = await fn.admin({ admin_action: "list" });
        const payload = await response.json();

        check("список приходить", response.status === 200 && payload.orders.length === 2);
        check("разом із підписами статусів (панель не вигадує своїх)",
            payload.statuses.new.label === "Нове");
        check("і з кількостями для вкладок",
            payload.counts.new === 1 && payload.counts.shipped === 1);
        check("вкладка відмов має свою кількість", payload.counts.refusal === 1);
        check("загальна кількість для сторінок", payload.total === 2);
    }
}

console.log("\n[6] Накладна");
{
    // Правило одне з ботом — два списки «скільки цифр у ТТН»
    // неминуче розійшлися б. А формулювання різні: у панелі немає
    // ні «надішліть», ні команди /skip.
    check("правило перевірки спільне з ботом",
        /validateTracking\(raw\)/.test(fs.readFileSync(path.join(FN_DIR, "admin-api.js"), "utf8")));

    const short = A.parseAdminRequest({ admin_action: "tracking", id: "7", tracking: "12345" });

    check("закороткий номер відхиляється", short.ok === false);
    check("у тексті помилки немає команди бота", !/skip/.test(short.error), short.error);
    check("текст помилки говорить, скільки цифр треба", /14/.test(short.error), short.error);

    check("номер із пробілами приймається",
        A.parseAdminRequest({ admin_action: "tracking", id: "7", tracking: "2045 0912 345 678" })
            .params.tracking === "20450912345678");

    // Порожнє значення — «прибрати накладну». Потрібно, коли номер
    // вписали не в те замовлення.
    check("порожнє значення прибирає накладну",
        A.parseAdminRequest({ admin_action: "tracking", id: "7", tracking: "" }).params.tracking === null);

    check("сповіщення про відправлення — лише для відправленого",
        /normalizeStatus\(order\.status\) === "shipped"/.test(SRC));

    if (canRunFunction) {

        const fn = startFunction(sampleOrders());

        // Замовлення 41 — «Нове». Накладну вписати можна, а от
        // «Замовлення відправлено!» клієнту — ні.
        fn.clear();
        let response = await fn.admin({ admin_action: "tracking", id: 41, tracking: "20450912345678" });
        let payload = await response.json();

        check("накладна зберігається", response.status === 200
            && payload.order.trackingNumber === "20450912345678");
        check("клієнту НЕ сказано «відправлено», поки замовлення не відправлене",
            fn.telegramCalls().filter((c) => c.method === "sendMessage").length === 0);
        check("посилання на відстеження готове",
            payload.order.trackingUrl.includes("cargo_number=20450912345678"));

        // Замовлення 42 — «Відправлено», чат клієнта відомий.
        fn.clear();
        response = await fn.admin({ admin_action: "tracking", id: 42, tracking: "20450999999999" });

        const sent = fn.telegramCalls().filter((c) => c.method === "sendMessage");

        check("для відправленого клієнт дізнається номер",
            sent.length === 1 && /20450999999999/.test(sent[0].body.text), sent.length);
        check("із кнопкою відстеження",
            sent.length === 1 && JSON.stringify(sent[0].body.reply_markup).includes("novaposhta"));

        fn.clear();
        response = await fn.admin({ admin_action: "tracking", id: 42, tracking: "" });
        payload = await response.json();

        check("накладну можна прибрати", response.status === 200 && payload.order.trackingNumber === "");
        check("прибирання не шле клієнту сповіщення",
            fn.telegramCalls().filter((c) => c.method === "sendMessage").length === 0);

        response = await fn.admin({ admin_action: "tracking", id: 42, tracking: "завтра відправлю" });

        check("текст замість номера відхиляється з 400", response.status === 400, response.status);
    }
}

console.log("\n[7] У браузер не їде зайвого");
{
    // Сторінка отримує не рядок бази, а проєкцію: ідентифікатори
    // клієнта й службові поля бота залишаються на сервері.
    const view = A.orderView(sampleOrders()[0]);
    const json = JSON.stringify(view);

    ["user_id", "telegram_chat_id", "bot_message_id"].forEach((field) => {
        check(`«${field}» не потрапляє в браузер`, !json.includes(field));
    });

    check("замість user_id — ознака «гість»", view.guest === true);
    check("замість telegram_chat_id — ознака «замовляв у боті»", view.fromBot === true);

    // Обидві ознаки менеджеру потрібні: гостю не видно історії в
    // кабінеті, а замовленню з сайту не приходять сповіщення.
    check("панель попереджає, що клієнту з сайту сповіщень не буде",
        /сповіщень у Telegram клієнт не отримує/.test(PANEL));

    check("склад замовлення розібраний, а не рядком", Array.isArray(view.items));
    check("суми — числа", typeof view.total === "number" && typeof view.subtotal === "number");
    check("підпис статусу приходить готовим", view.statusLabel === "Нове");

    const empty = A.orderView({});

    check("порожнє замовлення не валить проєкцію", empty.status === "new" && empty.total === 0);
}

console.log("\n[8] Сторінка панелі: піднімаємо в браузері");
{
    // Найважливіше тут — екранування. Імʼя, місто й коментар пише
    // покупець, а показуються вони в браузері менеджера.
    const ORDERS = [
        Object.assign(A.orderView(sampleOrders()[0]), {
            firstName: '<img src=x onerror="window.ХАКНУТО=1">',
            lastName: "Петренко",
        }),
        A.orderView(sampleOrders()[1]),
        // Відправлене, але без накладної: рівно той випадок, коли
        // менеджеру треба щось зробити, і його має бути видно зі списку.
        Object.assign(A.orderView(sampleOrders()[1]), {
            id: "43", orderNumber: "0708553444", trackingNumber: "", trackingUrl: "",
        }),
    ];

    // Піднімаємо сторінку двічі — на тестовому й бойовому домені:
    // на тестовому вона мусить попереджати, що замовлення справжні.
    function mount(url) {

        const dom = new JSDOM(PAGE, { runScripts: "outside-only", url });

        return dom.window;

    }

    const window = mount("https://dev.bestbrnd4u.com/admin/orders.html");

    const requests = [];

    window.GitHubPublisher = {
        getToken: async () => "owner-token",
        preopenAuthWindow: () => {},
        hasStoredToken: () => true,
    };

    window.confirm = () => true;

    window.fetch = async (url, init) => {

        const body = JSON.parse(init.body);

        requests.push(body);

        if (body.admin_action === "list") {
            return {
                ok: true, status: 200,
                json: async () => ({
                    ok: true,
                    statuses: M.STATUSES,
                    statusOrder: A.STATUS_ORDER,
                    counts: { new: 1, processing: 0, shipped: 1, completed: 0, cancelled: 0, refusal: 1 },
                    total: 2,
                    orders: ORDERS,
                }),
            };
        }

        if (body.admin_action === "get") {
            return {
                ok: true, status: 200,
                json: async () => ({
                    ok: true,
                    order: ORDERS.find((o) => o.id === String(body.id)) || ORDERS[0],
                    refusals: [{ id: "3", createdAt: "2026-09-03T08:00:00Z", note: "мале", items: [] }],
                }),
            };
        }

        // status / tracking
        return {
            ok: true, status: 200,
            json: async () => ({ ok: true, order: Object.assign({}, ORDERS[0], { status: "processing", transitions: ["shipped", "cancelled"] }) }),
        };

    };

    window.eval(PANEL);

    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    await flush(); await flush(); await flush();

    const doc = window.document;

    check("панель показалась", doc.getElementById("panel").hidden === false);
    check("вхід не питається, бо токен уже є", doc.getElementById("gate").hidden === true);

    const rows = doc.querySelectorAll(".row");

    check("рядки списку намальовані", rows.length === 3, rows.length);
    check("номер замовлення видно", /0708553442/.test(doc.getElementById("list").innerHTML));

    check("КРИТИЧНО: розмітка з імені клієнта не виконалась",
        window.ХАКНУТО === undefined);
    check("КРИТИЧНО: тег з імені клієнта екранований",
        !/<img src=x/.test(doc.getElementById("list").innerHTML)
        && /&lt;img/.test(doc.getElementById("list").innerHTML));

    const tabs = doc.querySelectorAll(".tab");

    check("вкладки за статусами намальовані", tabs.length === A.STATUS_ORDER.length + 2, tabs.length);
    check("кількість показана на вкладці", /<span class="count">1<\/span>/.test(doc.getElementById("tabs").innerHTML));
    check("вкладка «Усі» вибрана за замовчуванням",
        tabs[0].getAttribute("aria-selected") === "true");
    check("є вкладка відмов", /Відмови/.test(doc.getElementById("tabs").textContent));

    // Позначки в рядку: без них у списку з тридцяти замовлень
    // неможливо побачити, де чекають на дію.
    const listHtml = doc.getElementById("list").innerHTML;

    check("замовлення без ТТН позначене", /без ТТН/.test(listHtml));
    check("заявка на відмову позначена", /просить відмову/.test(listHtml));

    // Позначка мусить означати «тут потрібна дія». Якби вона стояла
    // майже на кожному рядку («гість», «з бота» — це більшість
    // замовлень), око перестало б її помічати. Тому такі ознаки
    // живуть у картці, а не в списку.
    check("рядок без справ лишається без позначок",
        !/pill-warn|pill-alarm/.test(rows[0].innerHTML), rows[0].innerHTML);
    check("дата в рядку — звичайний текст, а не позначка",
        /class="row-date"/.test(listHtml) && !/class="pill">\d\d\./.test(listHtml));

    // --- відкриваємо картку ---
    rows[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    await flush(); await flush();

    const detail = doc.getElementById("detail");

    check("картка запитана з сервера", requests.some((r) => r.admin_action === "get"));
    check("склад замовлення показано", /Сумка кросбоді/.test(detail.innerHTML));
    check("варіант товару показано", /Бежевий \/ M/.test(detail.innerHTML));
    check("телефон — посилання для дзвінка", /href="tel:\+380501234567"/.test(detail.innerHTML));
    check("сума показана", /4 419|4419/.test(detail.textContent.replace(/ /g, " ")));
    check("КРИТИЧНО: у картці імʼя теж екранується",
        window.ХАКНУТО === undefined && !/<img src=x/.test(detail.innerHTML));

    const statusButtons = [...detail.querySelectorAll("[data-status]")].map((b) => b.dataset.status);

    check("кнопки статусів — рівно ті, що дозволені",
        statusButtons.join() === "processing,cancelled", statusButtons.join());
    check("поле накладної є", Boolean(doc.getElementById("ttnInput")));
    check("у картці видно, що клієнт без кабінету", /гість, без кабінету/.test(detail.innerHTML));

    // --- міняємо статус ---
    detail.querySelector('[data-status="processing"]')
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    await flush(); await flush(); await flush();

    const change = requests.find((r) => r.admin_action === "status");

    check("зміна статусу надіслана", Boolean(change) && change.status === "processing");
    check("із номером замовлення", change && String(change.id) === "41");
    check("список перезапитано — кількості на вкладках оновлюються",
        requests.filter((r) => r.admin_action === "list").length >= 2);

    // --- накладна ---
    doc.getElementById("ttnInput").value = "20450912345678";
    detail.querySelector('[data-ttn="save"]')
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    await flush(); await flush();

    const ttn = requests.find((r) => r.admin_action === "tracking");

    check("накладна надіслана", Boolean(ttn) && ttn.tracking === "20450912345678");

    // --- пошук ---
    const search = doc.getElementById("search");

    search.value = "0708553442";
    search.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    await flush(); await flush();

    check("пошук надсилається як є",
        requests.some((r) => r.admin_action === "list" && r.query === "0708553442"));

    // Адмінок дві, а проєкт Supabase один: замовлення в них ті самі.
    // Кнопка «Скасовано» в тестовій адмінці скасує справжнє
    // замовлення й надішле клієнту справжнє сповіщення.
    check("на тестовому домені сказано, що замовлення справжні",
        /тестова адмінка, але замовлення справжні/.test(doc.body.innerHTML));

    const production = mount("https://bestbrnd4u.com/admin/orders.html");

    production.GitHubPublisher = window.GitHubPublisher;
    production.fetch = window.fetch;
    production.eval(PANEL);

    await flush(); await flush();

    check("на бойовому домені попередження немає",
        !/тестова адмінка/.test(production.document.body.innerHTML));

    production.close();
    window.close();
}

console.log("\n[9] Сторінка на місці й до неї можна дійти");
{
    check("панель у меню адмінки",
        /href: "orders\.html"/.test(fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8")));
    check("сторінка не потрапляє в пошуковики", /name="robots" content="noindex"/.test(PAGE));
    check("є посилання назад в адмінку", /href="index\.html"/.test(PAGE));

    // github-publish.js дає токен — без нього панель не звернеться
    // нікуди, тож порядок підключення важливий.
    check("github-publish.js підключений ДО orders.js",
        PAGE.indexOf("github-publish.js") < PAGE.indexOf("orders.js")
        && PAGE.includes("github-publish.js"));

    // Адреса проєкту Supabase лежить у двох місцях: у клієнті сайту
    // й у панелі (адмінка не підключає скриптів сайту). Копії мусять
    // збігатись.
    const client = fs.readFileSync(path.join(ROOT, "assets/js/supabase-client.js"), "utf8");

    const inClient = /SUPABASE_URL\s*=\s*"([^"]+)"/.exec(client);
    const inPanel = /SUPABASE_URL\s*=\s*"([^"]+)"/.exec(PANEL);

    check("адреса Supabase збігається з клієнтом сайту",
        inClient && inPanel && inClient[1] === inPanel[1],
        inPanel && inClient ? `${inPanel[1]} ≠ ${inClient[1]}` : "не знайдено");

    check("панель звертається до тієї самої функції, що й бот",
        /functions\/v1\/telegram-order-bot/.test(PANEL));

    // Ключа Supabase на сторінці бути не має: панель ходить лише в
    // функцію, і жодного ключа бази їй не потрібно.
    check("публікований ключ Supabase у панель не потрапив",
        !/sb_publishable/.test(PANEL) && !/sb_publishable/.test(PAGE));
}

console.log("\n[10] Деплой: один файл, і він не застарів");
{
    check("новий модуль вклеєний у файл для деплою",
        BUNDLE.includes("function parseAdminRequest") && BUNDLE.includes("ADMIN_ORIGINS"));
    check("у файлі для деплою немає локальних імпортів", !/from\s+["']\.\//.test(BUNDLE));
    check("немає export — усе локальне в одному файлі", !/^export\s/m.test(BUNDLE));

    const { build } = require(path.join(ROOT, "scripts/build-edge-function.js"));

    check("index.ts перезібраний з актуальних джерел",
        build() === BUNDLE, "запустіть: node scripts/build-edge-function.js");

    // Модулі зливаються в один файл, тож однакова назва у двох із
    // них МОВЧКИ перезаписала б одну з функцій.
    const names = (BUNDLE.match(/^(?:async )?function ([A-Za-z_$][\w$]*)/gm) || [])
        .map((line) => line.replace(/^(?:async )?function /, ""));

    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    check("у зібраному файлі немає двох функцій з однаковою назвою",
        duplicates.length === 0, duplicates.join(", "));

    const consts = (BUNDLE.match(/^const ([A-Za-z_$][\w$]*)/gm) || [])
        .map((line) => line.replace("const ", ""));

    check("і двох однакових const теж",
        consts.filter((name, index) => consts.indexOf(name) !== index).length === 0);

    if (canRunFunction) {
        // Найпростіша, але найдорожча помилка: файл із синтаксичною
        // помилкою деплоїться, а падає вже на сервері.
        const { stripTypeScriptTypes } = require("node:module");
        const vm = require("vm");

        let error = null;

        try {
            new vm.Script(stripTypeScriptTypes(BUNDLE, { mode: "strip" }), { filename: "index.ts" });
        } catch (problem) {
            error = problem.message;
        }

        check("файл для деплою — синтаксично коректний", error === null, error);
    }

    const readme = fs.readFileSync(path.join(ROOT, "supabase/README-telegram-bot.md"), "utf8");

    check("інструкція описує панель замовлень",
        /## Керування замовленнями з адмінки/.test(readme));
    check("інструкція каже, хто має доступ",
        /право \*\*записувати\*\* в репозиторій|право запису/.test(readme));
    check("інструкція згадує міграцію 009", /009-admin-orders\.sql/.test(readme));
    check("інструкція каже, що деплой треба повторити", /Deploy|розгорн/i.test(readme));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");
process.exit(failures ? 1 : 0);

})().catch((error) => { console.error(error); process.exit(1); });
