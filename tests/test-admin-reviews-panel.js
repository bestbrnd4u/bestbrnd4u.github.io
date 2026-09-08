// Панель «Відгуки» в адмінці.
//
// ЩО САМЕ ТУТ ПЕРЕВІРЯЄТЬСЯ
// --------------------------
// Модерація тепер із ДВОХ місць: кнопки під карткою в Telegram і ця
// панель. Головна небезпека такої пари — не поломка, а тихе
// розходження: власник відхиляє відгук у панелі, а в чаті лишається
// картка з живими кнопками. Натиснувши котрусь через тиждень, він
// МОВЧКИ скасовує своє ж рішення, і в чаті все виглядає правильно.
//
// Тому перевірок про це дві, з обох боків:
//
//   • рішення з панелі прибирає кнопки в чаті (editMessageText);
//   • кнопка в чаті не переписує вже ухвалене рішення (умова
//     status=eq.new стоїть у самому запиті до бази).
//
// І окремо — доступ. Відгуки лежать під RLS без політик: із браузера
// не видно НІЧОГО, зокрема невідмодерованого. Панель бачить їх лише
// через функцію, і лише з підтвердженим правом запису в репозиторій.
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
const PAGE = fs.readFileSync(path.join(ROOT, "admin/reviews.html"), "utf8");
const PANEL = fs.readFileSync(path.join(ROOT, "admin/reviews.js"), "utf8");

// Зразок відгуків: один новий, один опублікований.
function sampleReviews() {
    return [
        {
            id: 1,
            product_id: 26,
            order_number: "4821507392",
            author: "Ірина",
            rating: 5,
            body: "Сумка саме така, як на фото.",
            reply: null,
            status: "new",
            created_at: "2026-09-01T10:00:00Z",
            moderated_at: null,
            moderated_by: null,
            owner_chat_id: 777,
            owner_message_id: 4242,
        },
        {
            id: 2,
            product_id: 26,
            order_number: "4821507393",
            author: "Олег",
            rating: 4,
            body: "Колір трохи темніший.",
            reply: null,
            status: "published",
            created_at: "2026-08-20T10:00:00Z",
            moderated_at: "2026-08-21T09:00:00Z",
            moderated_by: "telegram",
            owner_chat_id: 777,
            owner_message_id: 4200,
        },
    ];
}

function startFunction(reviews) {

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

        if (address.startsWith("https://api.github.com/repos/")) {

            const token = String(init.headers?.Authorization || "");

            if (token === "token owner") {
                return new Response(JSON.stringify({ permissions: { push: true, admin: true } }), { status: 200 });
            }

            if (token === "token stranger") {
                return new Response(JSON.stringify({ permissions: { push: false, pull: true } }), { status: 200 });
            }

            return new Response("Bad credentials", { status: 401 });

        }

        if (address.startsWith("https://api.telegram.org/")) {
            return new Response(JSON.stringify({ ok: true, result: { message_id: 4242, chat: { id: 777 } } }), { status: 200 });
        }

        // Назви товарів функція бере з каталогу сайту, а не з бази:
        // товари живуть у репозиторії.
        if (address.includes("/data/products.json")) {
            return new Response(JSON.stringify([
                { id: 26, title: "Шкіряна сумочка Coach Tabby 26" },
            ]), { status: 200 });
        }

        if (address.startsWith("https://db.example/rest/v1/reviews")) {

            const query = address.slice("https://db.example/rest/v1/".length);
            const id = /id=eq\.(\d+)/.exec(query)?.[1];
            const wantsNew = /status=eq\.new/.test(query);
            const statusFilter = /status=eq\.(\w+)/.exec(query)?.[1];

            if (method === "PATCH") {

                const row = reviews.find((r) => String(r.id) === id);

                // Умова status=eq.new у запиті: PostgREST не оновлює
                // рядок, який їй не відповідає, і віддає порожній масив.
                if (!row || (wantsNew && row.status !== "new")) {
                    return new Response("[]", { status: 200 });
                }

                Object.assign(row, JSON.parse(init.body));

                return new Response(JSON.stringify([row]), { status: 200 });

            }

            if (id) {
                const row = reviews.find((r) => String(r.id) === id);
                return new Response(JSON.stringify(row ? [row] : []), { status: 200 });
            }

            // Список або підрахунок.
            const rows = statusFilter
                ? reviews.filter((r) => r.status === statusFilter)
                : reviews;

            return new Response(JSON.stringify(rows), {
                status: 200,
                headers: { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
            });

        }

        return new Response("{}", { status: 200 });

    };

    const scope = {
        Deno: fakeDeno,
        fetch: fakeFetch,
        Response,
        Request,
        Headers,
        URL,
        console,
        crypto,
        TextEncoder,
        setTimeout,
        clearTimeout,
        JSON,
        Math,
        Date,
        Number,
        String,
        Boolean,
        Array,
        Object,
        Promise,
        Error,
        RegExp,
        globalThis: {},
    };

    // eslint-disable-next-line no-new-func
    new Function(...Object.keys(scope), js)(...Object.values(scope));

    const request = (body, headers = {}) => new Request("https://fn.example/", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
    });

    return {
        admin: (body, token = "owner") => handler(request(body, {
            origin: "https://dev.bestbrnd4u.com",
            "x-admin-token": token,
        })),
        callback: (body) => handler(request(body, {
            "x-telegram-bot-api-secret-token": "tg",
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

const R = await import(require("url").pathToFileURL(path.join(FN_DIR, "review-admin.js")).href);

console.log("\n[1] Без прав — жодного байта даних");
{
    check("панель ходить через функцію, а не в базу",
        /functions\/v1\/telegram-order-bot/.test(PANEL)
        && !/rest\/v1/.test(PANEL));

    check("доказ доступу — токен GitHub з адмінки",
        /x-admin-token/.test(PANEL) && /GitHubPublisher\.getToken/.test(PANEL));

    if (canRunFunction) {

        const fn = startFunction(sampleReviews());

        for (const [name, token] of [["без токена", ""], ["чужий токен", "nonsense"], ["без права запису", "stranger"]]) {

            fn.clear();

            const response = await fn.admin({ admin_action: "reviews-list" }, token);
            const payload = await response.json();

            check(`${name}: 403`, response.status === 403, response.status);
            check(`${name}: до бази не дійшло`, fn.dbCalls().length === 0, fn.dbCalls().length);
            check(`${name}: у відповіді немає відгуків`,
                !payload.reviews && !JSON.stringify(payload).includes("Ірина"));

        }

    }
}

console.log("\n[2] Розбір запиту: підстановка в адресу неможлива");
{
    // id підставляється в адресу запиту до PostgREST. Довільний рядок
    // там означав би можливість дописати свій фільтр.
    check("id лише з цифр",
        R.parseReviewId("12") === "12"
        && R.parseReviewId("12;drop") === null
        && R.parseReviewId("") === null);

    check("невідома дія відкидається",
        R.parseReviewAdminRequest({ admin_action: "reviews-delete" }).ok === false);

    check("невідомий статус відкидається",
        R.parseReviewAdminRequest({ admin_action: "review-status", id: "1", status: "вигадка" }).ok === false);

    // «Повернути на модерацію» сенсу не має: покупець уже побачив
    // рішення, а зірки порахувала збірка.
    check("повернути на модерацію не можна",
        R.parseReviewAdminRequest({ admin_action: "review-status", id: "1", status: "new" }).ok === false);

    check("статус із бази — той самий перелік, що в міграції",
        Object.keys(R.REVIEW_STATUSES).join(",") === "new,published,rejected");
}

console.log("\n[3] Відповідь магазину");
{
    check("порожнє поле прибирає відповідь",
        R.cleanReply("").reply === null && R.cleanReply("   ").reply === null);

    check("переноси рядків лишаються",
        R.cleanReply("Дякуємо!\nПисали вам").reply === "Дякуємо!\nПисали вам");

    // Керівні символи з буфера обміну не мусять доїжджати до сайту.
    check("керівні символи прибираються",
        R.cleanReply("Дя\u0007кує\u0000мо").reply === "Дякуємо");

    check("надто довга відповідь не приймається",
        R.cleanReply("я".repeat(R.REPLY_MAX_LENGTH + 1)).ok === false);
}

console.log("\n[4] У браузер не їде зайвого");
{
    // Телефон у відгуку не зберігається ЗОВСІМ: його звіряють на льоту
    // з замовленням (див. add_review). Тобто з панелі він і не може
    // поїхати — але перелік колонок мусить це підтверджувати.
    check("телефона немає в переліку колонок",
        !R.REVIEW_COLUMNS.includes("phone"));

    // А номер замовлення — навпаки, потрібен: за ним видно, про яку
    // покупку йдеться, коли відгук виглядає дивно.
    check("номер замовлення є", R.REVIEW_COLUMNS.includes("order_number"));

    const view = R.reviewView({
        id: 7, product_id: 26, order_number: "48", author: "Ірина",
        rating: 5, body: "текст", reply: null, status: "new",
        created_at: "2026-09-01T10:00:00Z",
        owner_chat_id: 777, owner_message_id: 4242,
    });

    // owner_message_id — внутрішня річ бота. У панелі їй нема чого
    // робити, і проєкція мусить її відрізати.
    check("id повідомлення в Telegram у браузер не їде",
        !("ownerMessageId" in view) && !JSON.stringify(view).includes("4242"));

    check("статус приходить із підписом", view.statusLabel === "Нові");
}

if (canRunFunction) {

console.log("\n[5] Список: вкладки, кількості, назви товарів");
{
    const fn = startFunction(sampleReviews());

    const response = await fn.admin({ admin_action: "reviews-list", status: "new" });
    const payload = await response.json();

    check("список приходить", response.status === 200 && payload.reviews.length === 1,
        payload.reviews && payload.reviews.length);

    check("це саме новий відгук", payload.reviews[0].status === "new");

    check("кількості для вкладок є",
        payload.counts.new === 1 && payload.counts.published === 1);

    check("підписи вкладок приходять від функції (панель не вигадує своїх)",
        Array.isArray(payload.statuses) && payload.statuses[0].label === "Нові");

    // Без назви панель показувала б «Товар #26», і зрозуміти, про що
    // відгук, можна було б лише відкривши сайт.
    check("назва товару підставлена",
        payload.titles["26"] === "Шкіряна сумочка Coach Tabby 26",
        JSON.stringify(payload.titles));
}

console.log("\n[6] Рішення з панелі прибирає кнопки в чаті");
{
    const reviews = sampleReviews();
    const fn = startFunction(reviews);

    fn.clear();

    const response = await fn.admin({ admin_action: "review-status", id: "1", status: "published" });
    const payload = await response.json();

    check("рішення збережено", response.status === 200 && payload.ok === true,
        JSON.stringify(payload).slice(0, 120));

    check("у базі новий статус", reviews[0].status === "published");

    check("записано, хто вирішив", reviews[0].moderated_by === "admin"
        && !!reviews[0].moderated_at);

    // ГОЛОВНЕ. Без цього в чаті лишилась би картка з живими кнопками,
    // і натискання через тиждень скасувало б це рішення.
    const edits = fn.telegramCalls().filter((c) => c.method === "editMessageText");

    check("картку в чаті перемальовано", edits.length === 1, edits.length);

    check("саме те повідомлення",
        edits[0] && edits[0].body.message_id === 4242 && String(edits[0].body.chat_id) === "777");

    check("у картці написано рішення",
        edits[0] && /Показано|опубліковано|сайті/i.test(edits[0].body.text),
        edits[0] && edits[0].body.text);

    check("і сказано, що це з адмінки",
        edits[0] && edits[0].body.text.includes("з адмінки"));
}

console.log("\n[7] Повторне рішення не переписує перше");
{
    const reviews = sampleReviews();
    const fn = startFunction(reviews);

    // Відгук №2 уже опублікований (рішення ухвалили в Telegram).
    const response = await fn.admin({ admin_action: "review-status", id: "2", status: "rejected" });
    const payload = await response.json();

    check("панель відповідає 409, а не тихо переписує", response.status === 409, response.status);

    check("статус у базі не змінився", reviews[1].status === "published");

    // Разом із помилкою приходить свіжий стан, щоб панель показала
    // фактичне, а не своє застаріле.
    check("у відповіді свіжий стан відгуку",
        payload.review && payload.review.status === "published");

    check("панель це враховує", /error\.review/.test(PANEL));
}

console.log("\n[8] Кнопка в чаті не скасовує рішення панелі");
{
    const reviews = sampleReviews();

    // Уявімо: власник щойно відхилив відгук №1 у панелі.
    reviews[0].status = "rejected";
    reviews[0].moderated_by = "admin";

    const fn = startFunction(reviews);

    fn.clear();

    // update_id обовʼязковий: за ним функція розпізнає, що це
    // апдейт Telegram, а не запит панелі.
    await fn.callback({
        update_id: 1,
        callback_query: {
            id: "cb1",
            // Формат саме такий, як його розбирає parseReviewAction:
            // rev:<id>:pub | rev:<id>:rej.
            data: "rev:1:pub",
            message: { message_id: 4242, chat: { id: 777 }, text: "💬 Новий відгук" },
            from: { id: 777 },
        },
    });

    check("статус лишився таким, як вирішили в панелі",
        reviews[0].status === "rejected", reviews[0].status);

    const patches = fn.dbCalls().filter((c) => c.method === "PATCH");

    // Умова стоїть у самому запиті: між перевіркою й записом нічого не
    // встигне змінитись.
    check("умова «лише поки новий» — у запиті до бази",
        patches.length === 0 || patches.every((c) => /status=eq\.new/.test(c.url)),
        patches.map((c) => c.url).join(" "));

    const answers = fn.telegramCalls().filter((c) => c.method === "answerCallbackQuery");

    check("боту сказано, що відгук уже відмодерований",
        answers.some((c) => /уже відмодерований/i.test(c.body.text || "")),
        answers.map((c) => c.body.text).join(" | "));

    // Застарілі кнопки треба прибрати, інакше власник тиснутиме їх і далі.
    check("застарілі кнопки прибрано",
        fn.telegramCalls().some((c) => c.method === "editMessageReplyMarkup"));
}

console.log("\n[9] Нова картка запам'ятовує своє повідомлення");
{
    // Без цього панель не знає, ЯКЕ повідомлення перемальовувати, —
    // саме тому колонки owner_* і з'явились (міграція 022).
    check("id повідомлення зберігається в базу",
        /owner_message_id: message\.message_id/.test(SRC));

    check("і чат теж", /owner_chat_id: message\.chat\?\.id/.test(SRC));

    check("міграція є", fs.existsSync(path.join(ROOT, "supabase/migrations/022-reviews-admin.sql")));

    const migration = fs.readFileSync(path.join(ROOT, "supabase/migrations/022-reviews-admin.sql"), "utf8");

    check("міграція додає обидві колонки",
        /add column if not exists owner_chat_id/.test(migration)
        && /add column if not exists owner_message_id/.test(migration));

    check("і поля «хто вирішив»",
        /moderated_at/.test(migration) && /moderated_by/.test(migration));

    check("повторний запуск міграції безпечний",
        (migration.match(/if not exists/g) || []).length >= 6);
}

}

console.log("\n[10] Сторінка панелі: піднімаємо в браузері");
{
    const dom = new JSDOM(PAGE, { runScripts: "outside-only" });
    const { document } = dom.window;

    ["boot", "gate", "gateTitle", "gateText", "gateBtn", "panel", "tabs", "list", "listMsg", "pager", "refreshBtn"]
        .forEach(id => {
            check(`є #${id}`, !!document.getElementById(id));
        });

    check("панель і блок входу приховані до відповіді",
        document.getElementById("panel").hasAttribute("hidden")
        && document.getElementById("gate").hasAttribute("hidden"));

    check("сторінка не йде в індекс",
        /name="robots" content="noindex"/.test(PAGE));

    check("підключено github-publish.js ДО reviews.js",
        PAGE.indexOf("github-publish.js") < PAGE.indexOf("reviews.js"));
}

console.log("\n[11] Сторінка на місці й до неї можна дійти");
{
    check("файл сторінки є", fs.existsSync(path.join(ROOT, "admin/reviews.html")));
    check("файл панелі є", fs.existsSync(path.join(ROOT, "admin/reviews.js")));

    const index = fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8");

    check("посилання є в меню адмінки", /href: "reviews\.html"/.test(index));

    check("і воно підписане зрозуміло", /Відгуки/.test(index));

    // Адреса Supabase скопійована в адмінку навмисно (вона не підключає
    // скриптів сайту) — але копії не мають розходитись.
    const orders = fs.readFileSync(path.join(ROOT, "admin/orders.js"), "utf8");

    const url = t => (t.match(/SUPABASE_URL = "([^"]+)"/) || [])[1];

    check("адреса Supabase та сама, що в панелі замовлень",
        url(PANEL) === url(orders), `${url(PANEL)} vs ${url(orders)}`);
}

console.log("\n[12] Деплой: один файл, і він не застарів");
{
    // Збираємо в ТОМУ Ж процесі, а не підпроцесом: build() лише
    // повертає рядок, запис робить `if (require.main === module)`.
    // Підпроцес із cwd: ROOT тут не потрібен і лише створював би ризик
    // зачепити робоче дерево (за цим стежить test-workspace-guard.js).
    const { build } = require(path.join(ROOT, "scripts/build-edge-function.js"));

    check("index.ts перезібраний з актуальних джерел", build() === BUNDLE,
        "запустіть: node scripts/build-edge-function.js");

    check("модуль у переліку збірки",
        /review-admin\.js/.test(fs.readFileSync(path.join(ROOT, "scripts/build-edge-function.js"), "utf8")));

    // Збірка зливає модулі в ОДИН файл, тож однакові назви тихо
    // перекривають одна одну. Перший раз саме так і сталось:
    // clampLimit і listFilters із цього модуля перекрили однойменні з
    // admin-api.js, і кількість замовлень із заявкою на відмову стала
    // кількістю всіх замовлень.
    const mine = fs.readFileSync(path.join(FN_DIR, "review-admin.js"), "utf8");
    const orders = fs.readFileSync(path.join(FN_DIR, "admin-api.js"), "utf8");

    const names = text => (text.match(/^(?:export\s+)?function\s+([A-Za-z_$][\w$]*)/gm) || [])
        .map(line => line.replace(/^(?:export\s+)?function\s+/, ""));

    const shared = names(mine).filter(name => names(orders).includes(name));

    check("немає назв, спільних із панеллю замовлень", shared.length === 0,
        shared.join(", "));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);

})();
