// «Де моє замовлення» — перевірка за номером і телефоном.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. НОМЕРА САМОГО НЕ ДОСИТЬ. Номер замовлення не таємниця: він у
//    листі, у смс, його диктують уголос. Якби сторінка відкривалась за
//    одним номером, будь-хто, хто його побачив, дізнався б ім'я,
//    відділення й склад покупки.
//
// 2. ВІДПОВІДЬ ОДНАКОВА НА «НЕМАЄ» І «НЕ ТОЙ ТЕЛЕФОН». Інакше сторінка
//    стала б перевіркою існування номерів: перебором можна знайти
//    справжні, а тоді підбирати телефони.
//
// 3. ТЕЛЕФОН ЗБІГАЄТЬСЯ В БУДЬ-ЯКОМУ ЗАПИСІ. У базі лежить те, що
//    людина набрала при оформленні, а тут вона набере те, що згадає, —
//    і це майже ніколи не той самий рядок.
//
// 4. НАЗАД ЙДЕ БІЛИЙ СПИСОК. Функція читає замовлення службовим
//    ключем, тобто бачить рядок цілком: пошту, user_id, службові
//    позначки. У браузер має поїхати рівно те, що можна показати.
//
// 5. ЗАМОВЛЕННЯ З АКАУНТОМ НЕ СТАЮТЬ ГОСТЬОВИМИ. Регресія, знайдена
//    тут же: регулярка /^Bearers+/i (без зворотного слеша) не
//    збігалась ніколи, і в перевірку користувача їхав рядок разом зі
//    словом Bearer — тобто КОЖНЕ замовлення через функцію ставало
//    гостьовим, і покупець із акаунтом не бачив його в кабінеті.

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

const look = loadModule("supabase/functions/telegram-order-bot/order-lookup.js", [
    "MAX_VIEW_ITEMS", "viewSize", "phoneKey", "phoneMatches", "cleanLookup",
    "LOOKUP_STATUS", "lookupStatus", "deliveryLine", "publicOrderView",
]);

const page = read("order-status.html");
const script = read("assets/js/order-status.js");
const indexTs = read("supabase/functions/telegram-order-bot/index.ts");
const migration = read("supabase/migrations/017-order-lookup.sql");

console.log("\n[1] Номера самого не досить");
{
    check("без телефону запит не проходить",
        look.cleanLookup({ order_number: "4821507392" }).ok === false);

    check("короткий телефон не проходить",
        look.cleanLookup({ order_number: "4821507392", phone: "1234" }).ok === false);

    check("номер не схожий на номер — не проходить",
        look.cleanLookup({ order_number: "ab", phone: "0737288291" }).ok === false);

    check("лапки й дужки в номері — не проходить",
        look.cleanLookup({ order_number: "48215'073", phone: "0737288291" }).ok === false);

    check("правильна пара проходить",
        look.cleanLookup({ order_number: "4821507392", phone: "+380 73 728 82 91" }).ok === true);

    // Сторінка теж перевіряє це до запиту — щоб не витрачати
    // звернення на описку.
    check("сторінка перевіряє номер до запиту",
        /\/\^\[0-9A-Za-z-\]\{4,40\}\$\/\.test\(orderNumber\)/.test(script));

    check("сторінка перевіряє довжину телефону",
        /MIN_PHONE_DIGITS/.test(script) && /const MIN_PHONE_DIGITS = 9;/.test(script));

    // Найважливіше: сервер зіставляє телефон із замовленням.
    check("сервер зіставляє телефон",
        /phoneMatches\(order\.phone, clean\.phone\)/.test(indexTs));
}

console.log("\n[2] Відповідь однакова на «немає» і «не той телефон»");
{
    // На сервері це один if — і саме так і має бути.
    const branch = indexTs.match(/if \(!order \|\| !phoneMatches\(order\.phone, clean\.phone\)\) \{[\s\S]{0,200}?\}/);

    check("одна гілка на два випадки", Boolean(branch),
        "у функції мусить бути один if на «немає» і «не збігся»");

    check("і одна відповідь", Boolean(branch) && /error: "not_found"/.test(branch[0]),
        branch ? branch[0].replace(/\s+/g, " ") : "");

    // І сторінка не має вигадувати різних текстів.
    const messages = script.match(/showError\("Замовлення[^"]*"/g) || [];

    check("сторінка показує один текст", messages.length === 1,
        messages.join(" | "));

    check("причина такої відповіді описана",
        /перевіркою існування номерів/.test(script)
        && /перевіркою існування номерів/.test(read("supabase/functions/telegram-order-bot/order-lookup.js")));
}

console.log("\n[3] Телефон збігається в будь-якому записі");
{
    const stored = "+380 73 728 82 91";

    ["0737288291", "380737288291", "80737288291", "737288291", "+380737288291", "+380 73 728-82-91"]
        .forEach(typed => {
            check(`«${typed}» збігається`, look.phoneMatches(stored, typed));
        });

    check("інший номер не збігається", look.phoneMatches(stored, "0501112233") === false);

    // Порожній ключ не збігається ні з чим — включно з іншим порожнім.
    // Інакше замовлення без телефону відкривалось би будь-кому.
    check("порожній проти порожнього — не збіг", look.phoneMatches("", "") === false);
    check("порожній у базі — не збіг", look.phoneMatches("", "0737288291") === false);
    check("порожній у запиті — не збіг", look.phoneMatches(stored, "") === false);

    // Ключ — останні 9 цифр. Коротше почало б випадково збігатися.
    check("ключ — 9 цифр", look.phoneKey(stored) === "737288291", look.phoneKey(stored));
    check("8 цифр ключа не дають", look.phoneKey("12345678") === "");
}

console.log("\n[4] Назад іде білий список");
{
    const order = {
        id: 42,
        order_number: "4821507392",
        created_at: "2026-09-07T10:00:00Z",
        status: "shipped",
        items: [{ id: 1, title: "Сумка", brand: "Coach", price: 6500, qty: 1, color: "Чорний", size: "M" }],
        subtotal: 6500,
        discount: 200,
        delivery_price: 0,
        total: 6300,
        delivery_method: "Нова пошта, відділення",
        delivery_city: "Київ",
        delivery_detail: "№ 42",
        payment_method: "Готівкою при отриманні на пошті",
        tracking_number: "20450123456789",

        // Те, що НЕ має поїхати в браузер.
        user_id: "3f0c-секрет",
        email: "ivan@example.com",
        phone: "+380737288291",
        price_check: "mismatch",
        total_expected: 9999,
        telegram_chat_id: 123456,
    };

    const view = look.publicOrderView(order);

    const forbidden = ["user_id", "email", "phone", "price_check", "total_expected",
        "telegram_chat_id", "id"];

    const leaked = forbidden.filter(key => key in view);

    check("нічого службового не поїхало", leaked.length === 0, leaked.join(", "));

    // Телефон і пошту не віддаємо навмисно: той, хто відкрив сторінку,
    // телефон і так знає, а підказувати пошту на випадок, якщо телефон
    // вгадали, — ні до чого.
    check("телефон не повертається", !("phone" in view));
    check("пошта не повертається", !("email" in view));

    check("номер, дата, статус є",
        view.order_number === "4821507392" && view.created_at && view.status === "shipped");

    check("статус словами покупця", view.status_label === "Передано в доставку", view.status_label);
    check("і з поясненням", /Відстежити/.test(view.status_note), view.status_note);

    check("склад є", view.items.length === 1 && view.items[0].title === "Сумка");
    check("сума є", view.total === 6300);
    check("знижка є", view.discount === 200);
    check("накладна є", view.tracking_number === "20450123456789");

    check("доставка одним рядком",
        view.delivery === "Нова пошта, відділення, Київ, № 42", view.delivery);

    // Доставку магазин не бере — суми доставки в перегляді немає
    // взагалі: нуль читався б як «безкоштовно».
    check("суми доставки в перегляді немає", !("delivery_price" in view));

    check("порожнє замовлення не ламає перегляд", look.publicOrderView(null) === null);

    check("склад обрізається межею", look.MAX_VIEW_ITEMS === 50);

    // ONESIZE — внутрішня заглушка для товарів без розмірів, тобто
    // майже для всього каталогу (сумки, годинники, окуляри, гаманці).
    // Знайдено в браузері: у картці стояло «Бежевий, ONESIZE · 2 шт.»,
    // і покупець читає це як помилку в даних. Решта проєкту маркер
    // ховає — фід (scripts/build-feed.js) і ідентифікатор для Meta.
    check("ONESIZE покупцеві не показується", look.viewSize("ONESIZE") === "");
    check("і в іншому регістрі теж", look.viewSize("Onesize") === "");
    check("справжній розмір лишається", look.viewSize("38") === "38");

    const oneSize = look.publicOrderView({
        order_number: "1", status: "new",
        items: [{ title: "Сумка", size: "ONESIZE", qty: 1, price: 1 }],
    });

    check("у складі замовлення теж прибирається", oneSize.items[0].size === null,
        JSON.stringify(oneSize.items[0].size));

    // Лист про замовлення показує той самий склад — і той самий
    // маркер там виглядав би так само.
    const mail = read("supabase/functions/telegram-order-bot/mail.js");

    check("лист теж не показує ONESIZE",
        /size\.toUpperCase\(\) === "ONESIZE" \? "" : size/.test(mail));

    // Функція повертає саме цей перегляд, а не рядок цілком.
    check("сервер віддає перегляд, а не рядок",
        /publicOrderView\(order\)/.test(indexTs) && !/order: order \}/.test(indexTs));
}

console.log("\n[5] Статуси");
{
    check("усі п'ять станів названі",
        ["new", "processing", "shipped", "completed", "cancelled"]
            .every(key => look.LOOKUP_STATUS[key] && look.LOOKUP_STATUS[key].label),
        Object.keys(look.LOOKUP_STATUS).join(", "));

    // «Нове» в панелі означає «менеджер ще не брав» — покупцеві це
    // нічого не каже. Формулювання ті самі, що в кабінеті.
    check("«new» показується як очікування",
        look.lookupStatus("new").label === "Очікує обробки");

    const account = read("assets/js/account.js");

    ["Очікує обробки", "Готується до відправлення", "Передано в доставку", "Доставлено"]
        .forEach(label => {
            check(`«${label}» так само в кабінеті`, account.includes(label));
        });

    // Статуси першої версії бота — щоб старе замовлення не виглядало
    // зламаним.
    check("старий статус taken показується як обробка",
        look.lookupStatus("taken").key === "processing");

    check("невідомий статус не ламає сторінку",
        look.lookupStatus("щось").key === "new" && look.lookupStatus(null).key === "new");
}

console.log("\n[6] Межа звернень");
{
    check("міграція є", fs.existsSync(path.join(ROOT, "supabase/migrations/017-order-lookup.sql")));

    check("функція межі оголошена",
        /create or replace function public\.order_lookup_allowed\(p_ip text\)/.test(migration));

    check("від адреси лишається хеш", /digest\(salt \|\| btrim\(p_ip\)/.test(migration));

    check("сіль спільна з міграцією 015", /throttle_salt/.test(migration));

    check("викликати може лише службовий ключ",
        /grant execute on function public\.order_lookup_allowed\(text\) to service_role/.test(migration)
        && /revoke all on function public\.order_lookup_allowed\(text\) from anon, authenticated/.test(migration));

    check("таблиця закрита RLS",
        /alter table public\.lookup_throttle enable row level security/.test(migration));

    check("стара статистика чиститься сама",
        /delete from public\.lookup_throttle where created_at </.test(migration));

    // Лічильник ПЕРЕД зверненням до бази: сенс межі саме в тому, щоб
    // перебір не доходив до таблиці замовлень.
    const order = indexTs.indexOf("if (!(await lookupAllowed(clientIp(request))))");
    const fetchOrder = indexTs.indexOf("const order = await findOrderByNumber(clean.orderNumber);");

    check("межа перевіряється до запиту в базу",
        order > 0 && fetchOrder > order, `${order} проти ${fetchOrder}`);

    check("сторінка окремо повідомляє про перевищення",
        /response\.status === 429/.test(script) && /Забагато спроб/.test(script));

    // Зламаний лічильник не має перекривати сторінку всім покупцям:
    // справжня перевірка тут — збіг телефону.
    check("зламаний лічильник пропускає", /return true;\s*\n\s*end;/.test(migration));

    check("і причина цього описана",
        /справжня перевірка — це збіг\s*\n?\s*--\s*телефону/.test(migration)
        || /справжня перевірка[\s\S]{0,120}телефону/.test(migration));
}

console.log("\n[7] Сторінка на місці й досяжна");
{
    check("order-status.html лежить у корені",
        fs.existsSync(path.join(ROOT, "order-status.html")));

    check("заголовок сторінки", /<title>Де моє замовлення \| BestBrnd4u<\/title>/.test(page));

    check("шапка й підвал", /<header/.test(page) && /<footer/.test(page) && /mega-menu/.test(page));

    check("хлібні крошки", /class="breadcrumbs"/.test(page));

    ["lookupForm", "lookupOrder", "lookupPhone", "lookupSubmit", "lookupError", "lookupResult"]
        .forEach(id => check(`id ${id}`, page.includes(`id="${id}"`)));

    check("скрипт сторінки підключений", /assets\/js\/order-status\.js/.test(page));

    // Посилання в підвалі КОЖНОЇ сторінки: гість не знає, що така
    // сторінка є, якщо на неї нізвідки не ведуть.
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const withoutLink = pages.filter(f => !/href="order-status"/.test(read(f)));

    check(`посилання в підвалі всіх ${pages.length} сторінок`,
        withoutLink.length === 0, withoutLink.join(", "));

    // Шаблони згенерованих сторінок теж мусять його нести — інакше на
    // 220 сторінках товарів і таксономії посилання не буде.
    check("шаблон сторінок товару несе посилання",
        /href="order-status"/.test(read("product.html")));

    check("шаблон сторінок каталогу теж",
        /href="order-status"/.test(read("catalog.html")));

    check("сторінка в sitemap",
        /\{ loc: "\/order-status"/.test(read("scripts/build-sitemap.js")));

    check("сторінка відкрита для пошуку",
        /<meta name="robots" content="index,follow">/.test(page));
}

console.log("\n[8] Номер підставляється сам");
{
    // Переписувати десять цифр із листа руками — рівно те, чого люди
    // не роблять: вони пишуть у Telegram.
    check("сторінка читає номер із адреси",
        /URLSearchParams\(window\.location\.search\)\.get\("order"\)/.test(script));

    check("і одразу ставить курсор у телефон",
        /orderInput\.value = fromLink\.trim\(\);[\s\S]{0,120}phoneInput\.focus\(\)/.test(script));

    check("сторінка подяки веде сюди з номером",
        /order-status\?order=/.test(read("thanks.html")));

    check("лист покупцеві теж",
        /order-status\?order=/.test(read("supabase/functions/telegram-order-bot/mail.js")));

    check("посилання в листі є в зібраній функції",
        indexTs.includes("function lookupLine") && indexTs.includes("order-status?order="));
}

console.log("\n[9] Замовлення з акаунтом не стають гостьовими");
{
    // Регресія: /^Bearers+/i шукала «Bearer» і літери s, тобто не
    // збігалась ніколи. У verifyUser їхав рядок разом зі словом
    // Bearer, той будував «Bearer Bearer eyJ…», Supabase відмовляв —
    // і КОЖНЕ замовлення через функцію ставало гостьовим.
    const src = read("supabase/functions/telegram-order-bot/_index.src.ts");

    // Без коментарів: у них зіпсована регулярка згадується навмисно —
    // там написано, чим вона була погана. Правило про КОД, а не про
    // розповідь про код (той самий прийом, що в test-delivery.js).
    const code = text => text.replace(/\/\/.*$/gm, "");

    check("зіпсованої регулярки більше немає в коді",
        !/\/\^Bearers\+\/i/.test(code(src)) && !/\/\^Bearers\+\/i/.test(code(indexTs)),
        (code(src).match(/\/\^Bearer[^/]*\//) || ["—"])[0]);

    check("слово Bearer відрізається правильно",
        /replace\(\/\^Bearer\\s\+\/i, ""\)/.test(src),
        (src.match(/replace\(\/\^Bearer[^)]*\)/) || ["не знайдено"])[0]);

    // Сама поведінка: після заміни лишається чистий токен.
    const strip = value => String(value).replace(/^Bearer\s+/i, "");

    check("«Bearer eyJ…» → «eyJ…»", strip("Bearer eyJhbGciOi") === "eyJhbGciOi");
    check("«bearer eyJ…» теж", strip("bearer eyJhbGciOi") === "eyJhbGciOi");
    check("без префікса лишається як є", strip("eyJhbGciOi") === "eyJhbGciOi");

    check("причина зафіксована в коді",
        /ставало ГОСТЬОВИМ/.test(src));
}

console.log("\n[10] Сторінка не обіцяє того, чого немає");
{
    // Доставку магазин не бере — і на цій сторінці теж мусить бути
    // написано, хто платить.
    check("написано, хто платить за доставку",
        /оплачуєте перевізнику при отриманні/.test(page));

    check("і що в сумі її немає", /У суму замовлення вона не входить/.test(page));

    check("немає слова «безкоштовн»", !/безкоштовн/i.test(page));

    // Куда писати, якщо не знайшлось.
    check("є куди звернутись", /t\.me\/bestbrnd4u/.test(page) && /mailto:/.test(page));

    check("є посилання в кабінет для тих, хто з акаунтом",
        /href="account"/.test(page) && /кабінет/.test(page));

    check("сказано, що заявку на відмову вже бачимо",
        /id="lookupRefusal"/.test(page) && /refusal_requested/.test(script));
}

console.log(failures === 0
    ? "\n✅ «Де моє замовлення»: номера мало, відповідь одна, назад — білий список\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
