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

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
