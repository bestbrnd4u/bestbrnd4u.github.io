// Панель «Покупці й підписники».
//
// ЧОГО БРАКУВАЛО
// ---------------
// Списку людей не було ніде. Хто зареєструвався — видно лише в
// консолі Supabase; хто підписався на листи — лише в кабінеті
// MailerLite. Щоб відповісти на «скільки в нас покупців», доводилось
// відкривати два чужих кабінети.
//
// ГОЛОВНЕ, ЩО ТУТ СТЕРЕЖЕТЬСЯ
// ----------------------------
// 1. ДВА СПИСКИ, А НЕ ОДИН. Зареєстрований дав нам обліковий запис і
//    НЕ давав згоди на розсилку. Підписник дав саме згоду на листи.
//    Зліпити їх разом — значить рано чи пізно написати тому, хто на
//    це не погоджувався.
// 2. КЛЮЧІ ЛИШАЮТЬСЯ НА СЕРВЕРІ. Ні службовий ключ Supabase, ні ключ
//    MailerLite не мають опинитись у коді панелі.
// 3. СУМА НЕ БРЕШЕ. Скасовані замовлення не входять у «витратив»:
//    інакше на трьох скасованих вийде «витратив 40 000», і власник
//    зробить із цього хибний висновок.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const panel = read("admin/people.js");
const page = read("admin/people.html");
const source = read("supabase/functions/telegram-order-bot/_index.src.ts");

const people = (() => {

    const src = read("supabase/functions/telegram-order-bot/people-admin.js")
        .replace(/^export /gm, "");

    return new Function(src + "; return {"
        + " PEOPLE_ADMIN_ACTIONS, isPeopleAction, PEOPLE_PAGE, parsePeopleRequest,"
        + " buyerView, ordersByEmail, filterPeople, buyersResponse,"
        + " subscriberView, subscribersResponse, subscribersRequest, SUBSCRIBER_STATES,"
        + " unsubscribeRequest, deleteSubscriberRequest, deleteBuyerRequest, peopleActionResult };")();

})();

console.log("\n[1] Два списки, а не один");
{
    check("дві окремі дії",
        people.PEOPLE_ADMIN_ACTIONS.includes("people-buyers")
        && people.PEOPLE_ADMIN_ACTIONS.includes("people-subscribers"));

    check("панель має дві вкладки",
        /data-kind="buyers"/.test(page) && /data-kind="subscribers"/.test(page));

    // Різні згоди — різні колонки. У покупця немає «підписався», у
    // підписника немає «замовлень».
    check("у покупців свої колонки", /function buyersTable/.test(panel));
    check("у підписників свої", /function subscribersTable/.test(panel));

    check("сторінка каже, чим вони різні",
        /згоди на розсилку він не давав|згоди/i.test(page));
}

console.log("\n[2] Ключі лишаються на сервері");
{
    // Дивимось на КОД, а не на коментарі: у коментарях назви сервісів
    // згадуються навмисно, і перевірка по всьому файлу червоніла б на
    // поясненні, а не на витоку.
    const code = panel
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

    check("у панелі немає службового ключа",
        !/service_role|SERVICE_ROLE|eyJ[A-Za-z0-9_-]{20,}/.test(code));

    check("у панелі немає ключа розсилки", !/mailerlite/i.test(code));

    check("панель ходить через функцію", /x-admin-token/.test(panel));

    // Список кабінетів читається Admin API самого Supabase: PostgREST
    // до auth.users не пускає взагалі.
    check("кабінети читаються Admin API",
        /auth\/v1\/admin\/users/.test(source));

    check("і саме службовим ключем",
        /auth\/v1\/admin\/users[\s\S]{0,200}SERVICE_ROLE_KEY/.test(source));

    const request = people.subscribersRequest("secret-key", { page: 2, groupId: "42" });

    check("ключ розсилки йде заголовком, а не в адресі",
        request.headers.Authorization === "Bearer secret-key"
        && !request.url.includes("secret-key"));

    check("без ключа запит не будується",
        people.subscribersRequest("") === null);

    // Група та сама, у яку кладе підписки форма: інакше в списку
    // з'явились би люди з інших розсилок цього ж акаунта.
    check("береться саме наша група", /filter%5Bgroup%5D=42/.test(request.url), request.url);
}

console.log("\n[3] Зведення по замовленнях");
{
    const stats = people.ordersByEmail([
        { email: "A@b.c", total: 1000, status: "completed", created_at: "2026-01-01", first_name: "Іван", last_name: "П" },
        { email: "a@B.c", total: 2000, status: "completed", created_at: "2026-03-01" },
        { email: "a@b.c", total: 5000, status: "cancelled", created_at: "2026-05-01" },
        { email: "", total: 900, status: "completed", created_at: "2026-02-01" },
    ]);

    const one = stats["a@b.c"];

    check("пошта зводиться незалежно від регістру", Boolean(one), Object.keys(stats).join(", "));

    if (one) {

        check("замовлення рахуються всі", one.count === 3, one.count);

        // Скасоване не входить у суму: «витратив 8 000» на трьох
        // замовленнях, одне з яких скасоване, — неправда.
        check("скасоване не входить у суму", one.spent === 3000, one.spent);

        check("остання дата — найпізніша", one.lastAt === "2026-05-01", one.lastAt);

        check("ім'я береться із замовлення", one.name === "Іван П", one.name);

    }

    check("замовлення без пошти не створює порожнього запису",
        !Object.prototype.hasOwnProperty.call(stats, ""));
}

console.log("\n[4] Список покупців");
{
    const payload = people.buyersResponse({
        users: [
            { id: "1", email: "new@b.c", created_at: "2026-05-01", last_sign_in_at: "2026-05-02", email_confirmed_at: "2026-05-01" },
            { id: "2", email: "old@b.c", created_at: "2026-01-01" },
        ],
        orders: [{ email: "old@b.c", total: 4200, status: "completed", created_at: "2026-02-02", first_name: "Оля" }],
        search: "",
        page: 1,
    });

    check("найновіші першими", payload.people[0].email === "new@b.c");

    check("замовлення підтягнулись", payload.people[1].orders === 1);
    check("і сума теж", payload.people[1].spent === 4200);

    // Непідтверджена пошта — це не покупець, а спроба реєстрації.
    check("підтвердження пошти видно",
        payload.people[0].confirmed === true && payload.people[1].confirmed === false);

    check("рахується, скільки з них справді купували", payload.withOrders === 1);

    // У відповідь не мусить потрапити нічого зайвого з auth.users.
    const keys = Object.keys(payload.people[0]);

    check("у проєкції немає нічого, крім потрібного на екрані",
        !keys.some(key => /token|password|provider|identit|metadata/i.test(key)),
        keys.join(", "));

    const found = people.buyersResponse({
        users: [{ id: "1", email: "anna@b.c", created_at: "2026-05-01" },
                { id: "2", email: "boris@b.c", created_at: "2026-04-01" }],
        orders: [],
        search: "ANN",
        page: 1,
    });

    check("пошук не зважає на регістр", found.total === 1 && found.people[0].email === "anna@b.c");
}

console.log("\n[5] Список підписників");
{
    const payload = people.subscribersResponse({
        rows: [
            { id: "1", email: "a@b.c", status: "active", subscribed_at: "2026-05-01", opens_count: 3, clicks_count: 1 },
            { id: "2", email: "d@e.f", status: "unconfirmed", created_at: "2026-05-02" },
            { id: "3", email: "g@h.i", status: "unsubscribed" },
        ],
        total: 3,
        page: 1,
        search: "",
    });

    check("стани перекладені",
        payload.people[0].statusLabel === "Підписаний"
        && payload.people[1].statusLabel === "Не підтвердив");

    check("рахуються саме підписані", payload.active === 1);

    // Невідомий стан MailerLite не має ламати сторінку.
    const odd = people.subscriberView({ email: "x@y.z", status: "заморожений" });

    check("невідомий стан показується як є", odd.statusLabel === "заморожений");
}

console.log("\n[6] Розсилку могли не під'єднати");
{
    // Це не помилка, а «ще не налаштовано» — і сказати треба саме так,
    // інакше власник шукатиме поломку там, де її немає.
    check("функція відповідає поясненням, а не помилкою",
        /Розсилку ще не під'єднано/.test(source));

    check("і робить це успішною відповіддю",
        /disabled: "Розсилку ще не під'єднано[\s\S]{0,80}\}, 200, origin\)/.test(source));

    check("панель показує це як довідку, а не як збій",
        /showMessage\(payload\.disabled \|\| "", "info"\)/.test(panel));
}

console.log("\n[7] Дія доступна лише тому, хто має право");
{
    check("гілка стоїть ПІСЛЯ перевірки доступу",
        source.indexOf("if (!await verifyAdmin(token))")
            < source.indexOf("if (isPeopleAction(body.admin_action))"));

    const bad = people.parsePeopleRequest({ admin_action: "people-everything" });

    check("невідома дія відхиляється", bad.ok === false);

    // Сторінка не має права попросити всю базу одним запитом.
    const parsed = people.parsePeopleRequest({ admin_action: "people-buyers", page: "-5" });

    check("від'ємна сторінка зводиться до першої", parsed.params.page === 1);

    check("довжина пошуку обмежена",
        people.parsePeopleRequest({
            admin_action: "people-buyers",
            search: "я".repeat(500),
        }).params.search.length === 120);
}

console.log("\n[N] Відписати й видалити — з панелі, а не з чужих кабінетів");
{
    // ЧОМУ ЦЕ ТУТ. Відписати можна було й у MailerLite, видалити — у
    // Supabase. Але це два чужі кабінети з різними списками: щоб
    // виконати одне прохання, людину доводилось шукати двічі.

    check("обидві дії оголошені",
        people.PEOPLE_ADMIN_ACTIONS.includes("people-unsubscribe")
        && people.PEOPLE_ADMIN_ACTIONS.includes("people-delete"));

    // ЗА ІДЕНТИФІКАТОРОМ, А НЕ ЗА ПОШТОЮ. Пошта змінна: людина може
    // змінити її між тим, як панель намалювала список, і натисканням
    // кнопки. Ідентифікатор прийшов у тому ж рядку, що перед очима.
    check("без id дія не проходить",
        people.parsePeopleRequest({ admin_action: "people-unsubscribe" }).ok === false);

    check("пошта нормалізується до нижнього регістру",
        people.parsePeopleRequest({
            admin_action: "people-unsubscribe", id: "7", email: "  A@B.COM ",
        }).params.email === "a@b.com");

    // Покупець і підписник живуть у різних системах. Вгадувати за
    // виглядом ідентифікатора — найкоротший шлях видалити не того.
    check("видалення без «кого саме» відхиляється",
        people.parsePeopleRequest({ admin_action: "people-delete", id: "7" }).ok === false);

    check("чужий kind теж відхиляється",
        people.parsePeopleRequest({
            admin_action: "people-delete", id: "7", kind: "все",
        }).ok === false);

    ["buyer", "subscriber"].forEach(kind =>
        check(`kind ${kind} приймається`,
            people.parsePeopleRequest({ admin_action: "people-delete", id: "7", kind }).ok === true));

    // ВІДПИСКА — ЗМІНА СТАНУ, А НЕ ВИДАЛЕННЯ.
    //
    // Відписаний лишається в списку зі станом "unsubscribed", і
    // MailerLite більше не надішле йому листа навіть після повторного
    // імпорту. Видалений — надішле. Тобто саме відписка виконує
    // прохання «не пишіть мені більше».
    const off = people.unsubscribeRequest("secret", "42");

    check("відписка — PUT, а не DELETE", off.method === "PUT");

    check("  і саме зміна стану", off.body && off.body.status === "unsubscribed");

    // POST /api/subscribers створив би підписника, якби id не знайшовся:
    // одруківка додала б у список нову людину замість відписати стару.
    check("  адресуємось за id, а не поштою",
        off.url === "https://connect.mailerlite.com/api/subscribers/42");

    check("без ключа запиту немає", people.unsubscribeRequest("", "42") === null);

    check("без id теж", people.unsubscribeRequest("secret", "") === null);

    const del = people.deleteSubscriberRequest("secret", "4 2");

    check("видалення підписника — DELETE", del.method === "DELETE");

    check("  id екранується", del.url.endsWith("/4%202"));

    // Ключ service_role живе ЛИШЕ в секретах функції — саме тому
    // видалення акаунту можливе тільки тут, а не в кабінеті покупця.
    const buyer = people.deleteBuyerRequest("https://x.supabase.co/", "srv", "u1");

    check("видалення акаунту йде в Admin API",
        buyer.url === "https://x.supabase.co/auth/v1/admin/users/u1");

    check("  зі службовим ключем", buyer.headers.apikey === "srv");

    check("без ключа не будується", people.deleteBuyerRequest("https://x.co", "", "u1") === null);

    // ЗАМОВЛЕННЯ НЕ ЧІПАЄМО: вони потрібні для обліку, і за їхнім
    // номером людину знайдуть навіть без кабінету.
    check("замовлення при видаленні акаунту лишаються",
        !/orders\?[^`"']*method: "DELETE"/.test(source)
        && /profiles\?id=eq\.\$\{encodeURIComponent\(params\.id\)\}`, \{ method: "DELETE" \}/.test(source));

    check("профіль, адреси й обране прибираються",
        /favorites\?user_id=eq/.test(source)
        && /addresses\?user_id=eq/.test(source));

    // Мети досягнуто — отже, не помилка.
    check("вже видаленого не вважаємо помилкою",
        /response\.status !== 404/.test(source));

    // ПАНЕЛЬ: кнопки, підтвердження, чесний текст.
    check("кнопки є в обох таблицях",
        /actionButton\("buyer", person, "people-delete"/.test(panel)
        && /actionButton\("subscriber", person, "people-unsubscribe"/.test(panel));

    check("вже відписаному «Відписати» не показуємо",
        /person\.status === "unsubscribed"/.test(panel));

    check("перед дією питаємо", /window\.confirm\(confirmText\(/.test(panel));

    // Найважливіше в тексті підтвердження: «відписати» звучить
    // м'якше, ніж є, а «видалити» — жорсткіше, хоча насправді
    // навпаки. Про це сказано прямо.
    check("сказано, що видаленого імпорт підпише знову",
        /видаленого повторний імпорт/.test(panel));

    check("сказано, що замовлення лишаються",
        /Замовлення лишаться/.test(panel));
}

console.log("\n[N+1] Блокування адреси: ні замовлень, ні листів");
{
    const sql = read("supabase/migrations/035-blocked-emails.sql");

    // ЩО САМЕ ЗУПИНЯЄ БЛОКУВАННЯ. Форма замовлення відкрита всім — і
    // це правильно, покупцю не треба реєструватись. Але з тієї ж
    // причини її бере й бот, і спинити конкретного відправника досі
    // не було чим.
    check("дія є в панелі",
        people.PEOPLE_ADMIN_ACTIONS.includes("people-block")
        && people.PEOPLE_ADMIN_ACTIONS.includes("people-unblock"));

    // ЗА ПОШТОЮ, А НЕ ЗА АКАУНТОМ. Замовлення прив'язане до пошти:
    // гість купує без реєстрації взагалі. Блокувати обліковий запис
    // означало б спинити лише тих, хто входить, — тобто не тих.
    const guest = people.parsePeopleRequest({
        admin_action: "people-block", email: "bot@example.com",
    });

    check("блокує й того, у кого кабінету немає",
        guest.ok && guest.params.email === "bot@example.com" && guest.params.id === "",
        JSON.stringify(guest));

    check("без адреси блокувати нема що",
        people.parsePeopleRequest({ admin_action: "people-block", id: "3f2a" }).ok === false);

    // ТРИГЕР, А НЕ ПЕРЕВІРКА У ФУНКЦІЇ. Шляхів запису замовлення два:
    // через функцію і — коли не заданий ключ Turnstile — прямо в базу.
    // Тригер стоїть під обома.
    check("заборона живе в базі, під усіма шляхами",
        /create trigger orders_reject_blocked/.test(sql)
        && /before insert on public\.orders/.test(sql));

    check("незавершене оформлення теж не збираємо",
        /create trigger checkout_drafts_reject_blocked/.test(sql));

    // Без SECURITY DEFINER тригер не побачив би жодного рядка:
    // таблиця закрита RLS, а вставляє замовлення анонімна роль.
    check("тригер бачить закриту таблицю",
        /security definer/.test(sql) && /set search_path = public/.test(sql));

    check("список заблокованих закритий від браузера",
        /alter table public\.blocked_emails enable row level security/.test(sql)
        && !/create policy[\s\S]*blocked_emails/.test(sql));

    // Покупець мусить бачити зрозумілу відмову, а не «insert_failed».
    check("функція відмовляє словами, а не збоєм бази",
        /if \(await emailBlocked\(clean\.row\.email\)\)/.test(source)
        && /error: "blocked"/.test(source));

    check("заблокованого не підписуємо на листи",
        /if \(await emailBlocked\(clean\.subscriber\.email\)\)/.test(source));

    // Три дії, і жодної з них не досить окремо.
    check("блокування закриває ще й вхід у кабінет",
        /ban_duration: blocking \? "876000h" : "none"/.test(source));

    check("і відписує від розсилки",
        /if \(blocking\) await unsubscribeFromMailingList\(params\.email\)/.test(source));

    // Згоду на листи людина дає сама — повертати її за неї не можна.
    check("розблокування НЕ підписує назад",
        /Підписку на листи не повернуто/.test(read("supabase/functions/telegram-order-bot/people-admin.js")));

    // Панель мусить показувати, кого вже спинили: інакше блокування
    // невидиме, і другий раз тиснути будуть навмання.
    check("у списку видно, хто заблокований",
        /pill-blocked/.test(panel) && /pill-blocked\{/.test(page));

    check("кнопка міняється на зворотну",
        /person\.blocked[\s\S]{0,200}"people-unblock", "Розблокувати"/.test(panel)
        && /"people-block", "Заблокувати"/.test(panel));

    check("панель попереджає, що саме станеться",
        /не оформить замовлення, не отримає листів/.test(panel));

    const blocked = people.buyerView(
        { id: "1", email: "Bot@Example.com" }, {}, { "bot@example.com": true });

    check("позначка рахується за поштою в нижньому регістрі", blocked.blocked === true);

    check("решта лишається непозначеною",
        people.buyerView({ id: "2", email: "ok@example.com" }, {}, {}).blocked === false);

    // ЛИСТИ ЗА СТАРИМИ СЛІДАМИ. Тригер не дає заблокованому залишити
    // НОВЕ замовлення, але старі нікуди не діваються — і саме за ними
    // три розсильники й пишуть.
    const helper = read("scripts/blocked.js");

    check("є спільна перевірка для розсилок",
        /function blockedEmails/.test(helper) && /function allowedToWrite/.test(helper));

    check("немає таблиці — розсилка не падає, а йде без блокувань",
        /if \(!response\.ok\) \{[\s\S]{0,200}return new Set\(\);/.test(helper));

    for (const [file, name] of [
        ["scripts/remind-carts.js", "нагадування про кошик"],
        ["scripts/send-thankyou.js", "подяка за покупку"],
        ["scripts/request-reviews.js", "прохання про відгук"],
    ]) {

        const text = read(file);

        check(`${name} обходить заблокованих`,
            /require\("\.\/blocked"\)/.test(text)
            && /allowedToWrite\(blocked, row(?: && row\.email|\.email)\)|allowedToWrite\(blocked, row && row\.email\)/.test(text),
            file);

    }
}

console.log("\n[N+2] Підписаному не пропонуємо підписатись");
{
    const client = read("assets/js/subscribe.js");
    const subscribeJs = read("supabase/functions/telegram-order-bot/subscribe.js");

    // Блок «Новинки й акції на пошту» стоїть на шести сторінках, а
    // форма у футері — на вісімнадцяти. Підписаний бачив пропозицію
    // підписатись на кожній.
    check("є маршрут, який каже стан підписки",
        /site_action === "subscribe-status"/.test(source)
        && /async function handleSubscribeStatus/.test(source));

    // ГОЛОВНЕ ТУТ — ЧОГО МАРШРУТ НЕ РОБИТЬ. Якби він відповідав про
    // довільну пошту, це був би спосіб перевірити, чи є конкретна
    // людина в нашому списку.
    check("питає лише про власника сесії, не про довільну адресу",
        /const user = await userFromAccessToken\(body\?\.accessToken\)/.test(source)
        && !/handleSubscribeStatus[\s\S]{0,900}cleanEmail\(body/.test(source));

    check("службова адреса входу через Telegram за пошту не рахується",
        /function realEmailOf/.test(source) && /!isServiceEmail\(email\)/.test(source));

    check("стан читається з MailerLite",
        /export function subscriberLookup/.test(subscribeJs)
        && /export function lookupState/.test(subscribeJs));

    // «Не підтвердив» — це стан, у якому людині ЩЕ ТРЕБА щось
    // зробити, і форма для неї корисна.
    const src = subscribeJs.replace(/^export /gm, "");

    const mod = new Function(src + "; return { lookupState };")();

    check("ховаємо лише підтвердженим",
        mod.lookupState(200, { data: { status: "active" } }) === "active"
        && mod.lookupState(200, { data: { status: "unconfirmed" } }) === "unconfirmed"
        && mod.lookupState(404, null) === "none");

    check("збій мережі не вважається станом людини",
        mod.lookupState(502, null) === "unknown"
        && /if \(data\.state !== "unknown"\) remember/.test(client));

    // Форма в кабінеті — місце, де підпискою КЕРУЮТЬ. Сховати її
    // означало б забрати єдиний спосіб підписатись у того, хто
    // передумав.
    check("форму в кабінеті не чіпаємо",
        /!form\.classList\.contains\("subscribe-account"\)/.test(client));

    check("ховаємо весь блок, а не саме поле",
        /form\.closest\("section\.newsletter"\) \|\| form/.test(client));

    check("відповідь не питаємо на кожній сторінці",
        /localStorage/.test(client) && /REMEMBER_HOURS/.test(client));

    // БЛОК НЕ МУСИТЬ БЛИМНУТИ. Відповідь іде мережею, сесію Supabase
    // теж віддає не одразу — тобто підписаний побачив би
    // «Підпишіться!» частку секунди на КОЖНІЙ сторінці. Рівно те, від
    // чого ми його позбавляємо, тільки блимаюче.
    check("ховаємо одразу, не чекаючи відповіді",
        /var guessed = false;/.test(client)
        && /guessed = true;\s*\n\s*hideOffers\(\);/.test(client));

    // Здогадку треба вміти забрати назад: у цьому браузері могла
    // ввійти інша людина.
    check("хибну здогадку повертаємо назад",
        /if \(guessed\) showOffers\(\);/.test(client)
        && /else if \(guessed\) showOffers\(\);/.test(client));

    check("сторінка без Supabase не ламається",
        /typeof supabaseClient === "undefined"/.test(client)
        && /typeof SUPABASE_URL === "undefined"/.test(client));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
