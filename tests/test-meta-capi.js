// Серверні конверсії Meta (Conversions API).
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ПОКУПКА НЕ РАХУЄТЬСЯ ДВІЧІ. Ту саму покупку надсилають браузер і
//    сервер. Meta зводить їх в одну лише за однаковим event_id — а він
//    будується у ДВОХ місцях, у браузері й на сервері. Якщо ці два
//    рядки колись розійдуться, конверсія подвоїться, і магазин
//    вважатиме залучення вдвічі дешевшим, ніж воно є.
//
// 2. ГРОШІ БЕРУТЬСЯ З БАЗИ, А НЕ З БРАУЗЕРА. Інакше сторонній запит
//    міг би записати Meta покупку на мільйон.
//
// 3. ПОРОЖНІЙ ТОКЕН = ВИМКНЕНО. Жодного запиту в Meta без ключа.
//
// 4. НОРМАЛІЗАЦІЯ ЗА ПРАВИЛАМИ META. Один і той самий телефон люди
//    пишуть чотирма способами. Meta хешує СВОЮ нормалізовану форму;
//    якщо ми нормалізуємо інакше — хеші не зійдуться, і подія
//    припишеться нікому.
//
// 5. ХЕШ ВІД ПОРОЖНЬОГО НЕ НАДСИЛАЄТЬСЯ. Хеш "" однаковий у всіх
//    покупців — Meta склеїла б їх в одну людину.
//
// 6. ЗГОДА ДІЄ Й НА СЕРВЕРІ. Браузерний піксель питає згоду; серверна
//    подія не може бути винятком.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Модуль на ES-модулях — у CommonJS-тесті читаємо джерело й
// виконуємо. Так само робить решта тестів для модулів функції.
function loadModule(rel) {

    const src = read(rel)
        .replace(/^export\s+/gm, "")
        .concat("\nmodule.exports = { " + [
            "GRAPH_VERSION", "MAX_EVENT_AGE_MS", "normalizeEmail", "normalizePhone",
            "normalizeName", "normalizeCity", "COUNTRY_CODE", "userDataSources",
            "hasIdentity", "metaContentId", "customData", "purchaseEventId",
            "buildEvent", "capiRequest", "capiVerdict", "cleanBrowserIds", "cleanSourceUrl",
        ].join(", ") + " };");

    const module = { exports: {} };

    new Function("module", "exports", src)(module, module.exports);

    return module.exports;

}

const capi = loadModule("supabase/functions/telegram-order-bot/meta-capi.js");

const analytics = read("assets/js/analytics.js");
const checkout = read("assets/js/checkout.js");
const indexTs = read("supabase/functions/telegram-order-bot/index.ts");

console.log("\n[1] Покупка не рахується двічі");
{
    // Ключ склеювання будується в двох місцях. Обидва мусять давати
    // РІВНО той самий рядок — це і є весь механізм дедуплікації.
    check("сервер: purchase.<номер>",
        capi.purchaseEventId("4821507392") === "purchase.4821507392",
        capi.purchaseEventId("4821507392"));

    check("порожній номер не дає ключа", capi.purchaseEventId("") === "");

    // Браузер: eventID у виклику пікселя.
    const browserKey = analytics.match(/eventID:\s*"purchase\." \+ params\.transaction_id/);

    check("браузер будує той самий ключ", Boolean(browserKey),
        "у analytics.js немає eventID: \"purchase.\" + params.transaction_id");

    check("eventID їде третім аргументом fbq",
        /fb\("track", event, payload, options\)/.test(analytics));

    // Другий, незалежний спосіб — order_id у custom_data.
    check("order_id у браузерній події",
        /payload\.order_id = params\.transaction_id/.test(analytics));

    check("order_id у серверній події",
        capi.customData({ order_number: "4821507392" }).order_id === "4821507392");

    // Найважливіше в цьому наборі: два рядки будуються в РІЗНИХ
    // файлах, і ніщо, крім цієї перевірки, не тримає їх разом.
    // Зміниться префікс в одному місці — конверсія почне рахуватись
    // двічі, і жодна помилка про це не скаже.
    const serverPrefix = read("supabase/functions/telegram-order-bot/meta-capi.js")
        .match(/`purchase\.\$\{clean\}`/);

    check("префікс на сервері і в браузері один",
        Boolean(serverPrefix) && /"purchase\." \+ params\.transaction_id/.test(analytics),
        serverPrefix ? "ок" : "у meta-capi.js змінився шаблон ключа");
}

console.log("\n[2] Гроші й склад — з бази, не з браузера");
{
    const order = {
        order_number: "1",
        total: 6500,
        items: [
            { id: 12, title: "Сумка", price: 6000, qty: 1 },
            { id: 34, title: "Гаманець", price: 250, qty: 2 },
        ],
    };

    const data = capi.customData(order);

    check("сума з рядка замовлення", data.value === 6500, data.value);
    check("валюта завжди гривня", data.currency === "UAH");
    check("кількість позицій рахується по qty", data.num_items === 3, data.num_items);
    check("content_ids — рядки", data.content_ids.every(id => typeof id === "string"),
        JSON.stringify(data.content_ids));

    check("contents несе ціну й кількість",
        data.contents[1].quantity === 2 && data.contents[1].item_price === 250,
        JSON.stringify(data.contents[1]));

    // Позиція без числового id не потрапляє: інакше в динамічній
    // рекламі був би товар, якого немає у фіді.
    check("позиція без id відкидається",
        capi.customData({ items: [{ id: "х", title: "X", price: 1 }] }).contents.length === 0);

    // Найважливіше: браузер НЕ надсилає суму на сервер.
    const call = checkout.match(/site_action: "meta-purchase"[\s\S]{0,400}?\}\)/);

    check("браузер надсилає лише номер, згоду й куки", Boolean(call)
        && !/total|subtotal|items|price/.test(call[0]),
        call ? call[0].replace(/\s+/g, " ").slice(0, 200) : "виклику не знайдено");

    // І сервер читає замовлення з бази.
    check("сервер бере замовлення з бази",
        /handleMetaPurchase[\s\S]{0,3000}?findOrderByNumber\(orderNumber\)/.test(indexTs));
}

console.log("\n[3] Порожній токен = вимкнено");
{
    check("немає токена — немає запиту",
        capi.capiRequest("1837932737651247", "", [{ event_id: "x" }]) === null);

    check("немає пікселя — немає запиту",
        capi.capiRequest("", "TOKEN", [{ event_id: "x" }]) === null);

    check("піксель не з цифр — немає запиту",
        capi.capiRequest("не-піксель", "TOKEN", [{ event_id: "x" }]) === null);

    check("немає подій — немає запиту",
        capi.capiRequest("1837932737651247", "TOKEN", []) === null);

    // Подія без ключа склеювання не має сенсу: її неможливо звести з
    // браузерною, тобто вона гарантовано подвоїть конверсію.
    check("подія без event_id відкидається",
        capi.capiRequest("1837932737651247", "TOKEN", [{ event_name: "Purchase" }]) === null);

    const plan = capi.capiRequest("1837932737651247", "TOKEN", [{ event_id: "x" }]);

    check("адреса з пінованою версією",
        plan.url === `https://graph.facebook.com/${capi.GRAPH_VERSION}/1837932737651247/events`,
        plan.url);

    // Токен у ТІЛІ, не в адресі: адреси лишаються в логах проксі й у
    // повідомленнях про помилки.
    check("токен не в адресі", !plan.url.includes("TOKEN"));
    check("токен у тілі", plan.body.access_token === "TOKEN");

    check("код перевірки додається лише коли заданий",
        !("test_event_code" in plan.body)
        && capi.capiRequest("1837932737651247", "TOKEN", [{ event_id: "x" }], "TEST1")
            .body.test_event_code === "TEST1");

    // Функція мусить читати обидва секрети.
    check("функція читає META_CAPI_TOKEN",
        /Deno\.env\.get\("META_CAPI_TOKEN"\)/.test(indexTs));

    check("функція читає META_CAPI_TEST_CODE",
        /Deno\.env\.get\("META_CAPI_TEST_CODE"\)/.test(indexTs));

    // Ідентифікатор пікселя публічний і живе в даних сайту — щоб не
    // було двох джерел правди.
    check("піксель береться з data/analytics.json",
        /analytics\.json/.test(indexTs) && !/Deno\.env\.get\("META_PIXEL_ID"\)/.test(indexTs));
}

console.log("\n[4] Нормалізація за правилами Meta");
{
    // Один номер, чотири записи, один хеш.
    const forms = ["+380 73 728 82 91", "0737288291", "80737288291", "737288291", "380737288291"];

    const results = new Set(forms.map(capi.normalizePhone));

    check("усі записи українського номера дають одне значення",
        results.size === 1 && results.has("380737288291"),
        [...results].join(", "));

    check("сміття замість номера не хешується",
        capi.normalizePhone("123") === "" && capi.normalizePhone("") === "");

    check("пошта у нижньому регістрі без пробілів",
        capi.normalizeEmail("  Ivan@Example.COM ") === "ivan@example.com");

    check("рядок без @ не пошта", capi.normalizeEmail("не пошта") === "");

    check("ім'я без пунктуації й цифр",
        capi.normalizeName(" Іван-Петро 2 ") === "іванпетро",
        capi.normalizeName(" Іван-Петро 2 "));

    // Місто нормалізується так само, як ім'я: нижній регістр, без
    // пробілів і пунктуації. Саме це робить нормалізатор Meta, тож
    // правило тут не наше, а їхнє.
    //
    // Побічний наслідок, і про нього краще знати: «м. Київ» дає
    // «мкиїв», а «Київ» — «київ», тобто це РІЗНІ хеші. Місто —
    // найслабший із ключів збігу (Meta шукає передусім за поштою й
    // телефоном), тож нормалізувати «м.» окремо не варто: правило
    // мусить збігатися з їхнім дослівно, а не бути розумнішим.
    check("місто нормалізується як ім'я",
        capi.normalizeCity("м. Київ") === "мкиїв" && capi.normalizeCity("Київ") === "київ",
        capi.normalizeCity("м. Київ") + " / " + capi.normalizeCity("Київ"));

    check("регістр і пробіли не створюють різних хешів",
        capi.normalizeCity(" КИЇВ ") === capi.normalizeCity("київ"));

    check("країна — дволітерний код у нижньому регістрі",
        capi.COUNTRY_CODE === "ua");
}

console.log("\n[5] Хеш від порожнього не надсилається");
{
    const sources = capi.userDataSources({
        email: "", phone: "", first_name: "Іван", last_name: "", delivery_city: "",
    });

    check("порожні поля не потрапляють у перелік",
        !("em" in sources) && !("ph" in sources) && !("ln" in sources) && !("ct" in sources),
        JSON.stringify(sources));

    check("заповнені — потрапляють", sources.fn === "іван");

    check("країна є завжди", sources.country === "ua");

    // buildEvent теж не має класти порожнього.
    const event = capi.buildEvent({
        order: { order_number: "1", total: 100, items: [] },
        hashed: { em: "a".repeat(64), ph: "" },
        browser: {},
        sourceUrl: "",
        ip: "",
        userAgent: "",
        now: Date.now(),
    });

    check("порожній хеш не їде в user_data",
        "em" in event.user_data && !("ph" in event.user_data),
        JSON.stringify(Object.keys(event.user_data)));

    check("хеші кладуться масивами", Array.isArray(event.user_data.em));

    // Подія без жодного ідентифікатора нічого не додає.
    check("немає за чим шукати — немає події",
        capi.hasIdentity({ country: "ua" }, {}) === false);

    check("пошта — досить", capi.hasIdentity({ em: "x" }, {}) === true);
    check("телефон — досить", capi.hasIdentity({ ph: "x" }, {}) === true);
    check("сама кука пікселя — теж досить",
        capi.hasIdentity({}, { fbp: "fb.1.1700000000000.1" }) === true);

    check("сервер перевіряє це перед запитом",
        /hasIdentity\(sources, browser\)/.test(indexTs));
}

console.log("\n[6] Згода діє й на сервері");
{
    check("браузер не надсилає без згоди на рекламу",
        /if \(!window\.Analytics \|\| !window\.Analytics\.adsAllowed\(\)\) return;/.test(checkout));

    check("Analytics віддає стан згоди", /adsAllowed: function \(\)/.test(analytics));

    check("сервер відмовляє без прапорця згоди",
        /body\.consent !== true/.test(indexTs));

    // Політика конфіденційності мусить казати правду: там прямо
    // написано, що передається в Meta.
    const privacy = read("privacy-policy.html");

    check("політика описує серверну подію",
        /з нашого сервера/i.test(privacy) && /SHA-256/.test(privacy));

    check("політика більше не обіцяє, що в Meta не йде нічого особистого",
        !/Персональних даних ми в піксель не передаємо/.test(privacy));

    check("політика каже, що без згоди події немає",
        /без вашої згоди на рекламу цього\s*\n?\s*повідомлення немає/i.test(privacy)
        || /без вашої згоди[\s\S]{0,80}немає взагалі/i.test(privacy));
}

console.log("\n[7] Дані з браузера перевіряються");
{
    // fbp/fbc мають жорсткий формат. У це поле не має проїхати нічого
    // іншого: воно йде в Meta як є.
    const ids = capi.cleanBrowserIds({
        fbp: "fb.1.1700000000000.1234567890",
        fbc: "<script>alert(1)</script>",
    });

    check("правильна кука проходить", ids.fbp === "fb.1.1700000000000.1234567890");
    check("сміття не проходить", ids.fbc === "");

    // event_source_url — лише власні домени.
    check("своя адреса проходить",
        capi.cleanSourceUrl("https://bestbrnd4u.com/thanks?x=1", ["https://bestbrnd4u.com"])
            === "https://bestbrnd4u.com/thanks");

    check("чужа — ні",
        capi.cleanSourceUrl("https://evil.example/thanks", ["https://bestbrnd4u.com"]) === "");

    check("не адреса — ні", capi.cleanSourceUrl("не адреса", ["https://bestbrnd4u.com"]) === "");

    // Запит перевіряється проти того самого переліку доменів, що CORS.
    check("перелік доменів один на функцію",
        /cleanSourceUrl\(body\.source_url, ADMIN_ORIGINS\)/.test(indexTs));
}

console.log("\n[8] Час події й старі замовлення");
{
    const now = Date.parse("2026-09-07T12:00:00Z");

    const fresh = capi.buildEvent({
        order: { order_number: "1", created_at: "2026-09-07T11:00:00Z", total: 1, items: [] },
        hashed: {}, browser: {}, sourceUrl: "", ip: "", userAgent: "", now,
    });

    check("час події — коли покупка сталась",
        fresh.event_time === Math.floor(Date.parse("2026-09-07T11:00:00Z") / 1000),
        fresh.event_time);

    // Meta відкидає події старші за 7 днів. Замість того щоб надіслати
    // й отримати відмову, ставимо поточний час.
    const old = capi.buildEvent({
        order: { order_number: "1", created_at: "2026-01-01T00:00:00Z", total: 1, items: [] },
        hashed: {}, browser: {}, sourceUrl: "", ip: "", userAgent: "", now,
    });

    check("надто старе замовлення не отримує минулого часу",
        old.event_time === Math.floor(now / 1000), old.event_time);

    check("межа — 7 днів", capi.MAX_EVENT_AGE_MS === 7 * 24 * 60 * 60 * 1000);

    check("сервер узагалі не надсилає надто старе",
        /Date\.now\(\) - created > MAX_EVENT_AGE_MS/.test(indexTs));

    check("подія помічена як з сайту", fresh.action_source === "website");
    check("назва події стандартна", fresh.event_name === "Purchase");
}

console.log("\n[9] Відповідь Meta розбирається правильно");
{
    // Meta відповідає 200 навіть коли не прийняла нічого — код HTTP
    // сам по собі нічого не каже.
    check("прийнято", capi.capiVerdict(200, { events_received: 1 }).ok === true);

    check("нуль подій — це відмова",
        capi.capiVerdict(200, { events_received: 0 }).ok === false);

    check("порожня відповідь — відмова", capi.capiVerdict(200, null).ok === false);

    const bad = capi.capiVerdict(400, {
        error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 },
    });

    check("помилка з описом", bad.ok === false && /OAuthException 190/.test(bad.reason), bad.reason);

    check("HTTP-помилка без тіла", capi.capiVerdict(500, {}).ok === false);

    // Тиха відмова тут найгірша: реклама далі оптимізується за
    // половиною покупок, і дізнатись про це нізвідки.
    check("відмова пишеться в журнал помилок",
        /reportServerIssue\("meta_capi"/.test(indexTs));
}

console.log("\n[10] Замовлення важливіше за статистику");
{
    // Жоден збій Meta не має чіпати покупця: замовлення вже збережене.
    check("серверна подія йде лише після збереження в базу",
        /if \(saved\) requestServerPurchase\(orderId\)/.test(checkout));

    check("помилка запиту ковтається",
        /requestServerPurchase[\s\S]{0,1600}?\.catch\(\(\) => \{/.test(checkout));

    check("keepalive — щоб перехід на «Дякуємо» не обірвав запит",
        /keepalive: true/.test(checkout));

    // Функція теж мусить відповідати спокійно, а не 500: сторінка на
    // це не реагує ніяк, але 500 у логах виглядав би як аварія.
    check("недоступна Meta — не аварія функції",
        /error: "capi_unavailable"/.test(indexTs));

    check("зібрана функція не застаріла",
        indexTs.includes("async function handleMetaPurchase")
        && indexTs.includes("function capiRequest"));
}

console.log(failures === 0
    ? "\n✅ Meta CAPI: покупка рахується один раз, гроші з бази, без згоди — тиша\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
