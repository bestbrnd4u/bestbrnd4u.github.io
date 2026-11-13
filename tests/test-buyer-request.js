// Заявка на байєр-сервіс (сторінка /bayer-service, блок #bayerContact).
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. СЕРВЕР НЕ ВІРИТЬ СТОРІНЦІ. Запит до функції можна надіслати й без
//    форми: номер, посилання, текст перевіряються там
//    (buyer-request.js), а все, що йде в Telegram, екранується.
// 2. ЛИШЕ ПОСИЛАННЯ http(s) НА СПРАВЖНІЙ ДОМЕН. javascript:, data:,
//    http://localhost у повідомлення власнику не потрапляють.
// 3. МЕЖІ Й ПАСТКА. Своя межа «buyer» (не спільна з дзвінком і чатом);
//    заповнене поле-пастка — «готово» без повідомлення.
// 4. ФОРМА ГОВОРИТЬ, ЩО НЕ ТАК. Порожня — не надсилається, а під
//    кожним полем пояснення; відмова сервера — під тим полем, про яке
//    вона; успіх — картка «Заявку отримали» замість форми.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const br = require("../supabase/functions/telegram-order-bot/buyer-request.js");
const { normalizeCallBackPhone } = require("../supabase/functions/telegram-order-bot/call-back.js");

const VALID = {
    links: "https://www.coach.com/products/tabby-26.html",
    details: "чорна",
    delivery: "sea",
    budget: "25 000",
    name: "Олена",
    phone: "067 123 45 67",
    contact: "viber",
    consent: true,
    lang: "uk"
};

console.log("\n[1] Перевірка заявки на сервері");
{
    const ok = br.normalizeBuyerRequest(VALID);

    check("правильна заявка приймається", ok.ok, ok.error);
    check("номер зведено до +380…", ok.request.phone === "+380671234567", ok.request.phone);
    check("бюджет — число", ok.request.budget === 25000, ok.request.budget);

    const err = patch => br.normalizeBuyerRequest({ ...VALID, ...patch }).error;

    check("кривий номер — bad_phone", err({ phone: "12345" }) === "bad_phone");
    check("порожнє ім'я — no_name", err({ name: "   " }) === "no_name");
    check("ні посилання, ні опису — no_item", err({ links: "", details: "" }) === "no_item");
    check("опис без посилання годиться", br.normalizeBuyerRequest({ ...VALID, links: "", details: "Coach Tabby 26" }).ok);
    check("посилання без опису годиться", br.normalizeBuyerRequest({ ...VALID, details: "" }).ok);
    check("«не javascript» замість посилання — no_item", err({ links: "javascript:alert(1)", details: "" }) === "no_item");

    // Згода — саме true: рядок "false" теж «правдивий», і так її не
    // підробити зі сторінки, яка шле щось інше.
    check("без згоди — no_consent", err({ consent: false }) === "no_consent" && err({ consent: "false" }) === "no_consent");

    check("невідома доставка — «порадьте»", br.normalizeBuyerRequest({ ...VALID, delivery: "<script>" }).request.delivery === "advise");
    check("невідомий канал — дзвінок", br.normalizeBuyerRequest({ ...VALID, contact: "pigeon" }).request.contact === "call");
    check("бюджет має стелю", br.normalizeBuyerRequest({ ...VALID, budget: "9".repeat(20) }).request.budget === br.BUYER_LIMITS.budget);
    check("довгий опис обрізано", br.normalizeBuyerRequest({ ...VALID, details: "а".repeat(5000) }).request.details.length === br.BUYER_LIMITS.details);
    check("мова лише uk/en/ru", br.normalizeBuyerRequest({ ...VALID, lang: "de" }).request.lang === "uk");
}

console.log("\n[2] Посилання");
{
    const links = br.buyerLinks;

    check("посилання посеред тексту, хвостова кома — без неї",
        JSON.stringify(links("Ось ця: https://www.coach.com/p/1.html, дякую")) === JSON.stringify(["https://www.coach.com/p/1.html"]));
    check("через пробіл і з нового рядка — обидва",
        links("https://a.com/1 https://b.com/2\nhttps://c.com/3").length === 3);
    check("однакові — один раз", links("https://a.com/1 https://a.com/1").length === 1);
    check("не більше п'яти", links(Array.from({ length: 9 }, (_, i) => `https://a.com/${i}`).join(" ")).length === br.BUYER_LIMITS.links);
    check("http://localhost — ні", links("http://localhost:8080/x").length === 0);
    check("javascript:/data: — ні", links("javascript:alert(1) data:text/html,x").length === 0);
    check("задовге — пропущено", links("https://a.com/" + "x".repeat(600)).length === 0);
}

console.log("\n[3] Повідомлення власнику");
{
    const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const text = br.formatBuyerRequest(br.normalizeBuyerRequest(VALID).request, esc);

    check("заголовок", /🛍 <b>Заявка на байєр-сервіс<\/b>/.test(text));
    check("номер — клікабельний tel:", /<a href="tel:\+380671234567">\+380671234567<\/a>/.test(text));
    check("де відповісти", /відповісти: <b>Viber<\/b>/.test(text));
    check("посилання пронумеровано", /1\. https:\/\/www\.coach\.com\/products\/tabby-26\.html/.test(text));
    check("доставка українською", /Доставка: Морем із США/.test(text));
    check("бюджет із пробілом", /Бюджет: до 25 000 грн/.test(text));
    check("порожніх рядків поспіль немає", !/\n\n\n/.test(text));

    const evil = br.formatBuyerRequest(br.normalizeBuyerRequest({
        ...VALID, name: "<b>Бос</b>", details: "<a href=\"x\">клік</a> & ще", links: "https://a.com/?q=<i>"
    }).request, esc);

    check("ім'я, опис і посилання екрановано", !/<b>Бос|<a href="x"|<i>/.test(evil) && /&lt;b&gt;Бос/.test(evil) && /&amp; ще/.test(evil));

    const en = br.formatBuyerRequest(br.normalizeBuyerRequest({ ...VALID, lang: "en", budget: "" }).request, esc);

    check("англійська — підказка відповідати тією ж мовою", /англійською/.test(en));
    check("без бюджету — рядка бюджету немає", !/Бюджет/.test(en));
}

console.log("\n[4] Функція: маршрут, межа, пастка");
{
    const src = read("supabase/functions/telegram-order-bot/_index.src.ts");
    const built = read("supabase/functions/telegram-order-bot/index.ts");

    check("site_action «buyer-request» веде в обробник", /body\.site_action === "buyer-request"[\s\S]{0,80}handleBuyerRequest\(request, body\)/.test(src));

    const handler = src.match(/async function handleBuyerRequest[\s\S]*?\n\}\n/)[0];

    check("пастка — до перевірки й межі", handler.indexOf("body.website") < handler.indexOf("normalizeBuyerRequest") && handler.indexOf("body.website") < handler.indexOf("contactAllowed"));
    check("своя межа «buyer»", /contactAllowed\(request, "buyer"\)/.test(handler) && /buyer: \{ perIp: \d+, global: \d+ \}/.test(src));
    check("Telegram не прийняв — не «ок»", /if \(!sent\?\.ok\)[\s\S]*?ok: false/.test(handler));
    check("без бота — не «ок»", /not_configured/.test(handler));
    check("посилання без прев'ю (інакше картка магазину забиває повідомлення)", /disable_web_page_preview: true/.test(handler));

    check("модуль у збірці функції", /"buyer-request\.js"/.test(read("scripts/build-edge-function.js")));
    check("index.ts перезібрано", /function normalizeBuyerRequest/.test(built) && /async function handleBuyerRequest/.test(built));
}

console.log("\n[5] Сторінка");
{
    const html = read("bayer-service.html");

    for (const id of ["buyerRequestForm", "buyerLinks", "buyerDetails", "buyerDelivery", "buyerBudget", "buyerName", "buyerPhone", "buyerConsent", "buyerWebsite", "buyerSubmit", "buyerDone"]) {
        check(`є #${id}`, html.includes(`id="${id}"`));
    }

    check("варіанти доставки — ті самі ключі, що на сервері",
        [...html.matchAll(/<option value="([a-z]+)"/g)].map(m => m[1]).every(v => v in br.BUYER_DELIVERY));
    check("канали — ті самі ключі", [...html.matchAll(/name="contact" value="([a-z]+)"/g)].map(m => m[1]).every(v => v in br.BUYER_CONTACT));

    check("скрипт форми підключено", /<script src="assets\/js\/buyer-request\.js[^"]*" defer><\/script>/.test(html));
    check("кнопка вгорі веде до форми", /href="#bayerContact"/.test(html));
    check("згода — з посиланням на політику", /bayer-request-consent[\s\S]{0,300}href="privacy-policy"/.test(html));

    for (const lang of ["en", "ru"]) {
        const file = path.join(ROOT, lang, "bayer-service.html");
        if (!fs.existsSync(file)) { console.log(`  · ${lang}/ не збудовано — пропущено`); continue; }
        const copy = fs.readFileSync(file, "utf8");
        check(`${lang}/: форма є і перекладена`, copy.includes('id="buyerRequestForm"') && !/Надіслати заявку|Посилання на товар/.test(copy));
    }
}

console.log("\n[6] Номер: сторінка й сервер згодні");
{
    const client = read("assets/js/buyer-request.js");
    const fn = client.match(/function phoneOk\(value\) \{[\s\S]*?\n    \}/)[0];
    const phoneOk = new Function(fn + "\nreturn phoneOk;")();

    const samples = ["067 123 45 67", "+380671234567", "380671234567", "671234567", "0671234567", "12345", "+1 202 555 0100", "", "067-123-45-6"];
    const differ = samples.filter(s => phoneOk(s) !== Boolean(normalizeCallBackPhone(s)));

    check("для всіх зразків відповідь однакова", differ.length === 0, differ.join(" | "));
}

console.log("\n[7] Форма в браузері (JSDOM)");
(async () => {

    const html = read("bayer-service.html")
        .replace(/<script\b[\s\S]*?<\/script>/gi, "");

    const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://bestbrnd4u.com/bayer-service" });
    const w = dom.window;

    const calls = [];
    let reply = { status: 200, body: { ok: true } };

    w.SUPABASE_URL = "https://example.supabase.co";
    w.SUPABASE_PUBLISHABLE_KEY = "pk";
    w.fetch = async (url, opts) => {
        calls.push({ url, body: JSON.parse(opts.body) });
        return { status: reply.status, json: async () => reply.body };
    };

    w.eval(read("assets/js/buyer-request.js"));

    const $ = id => w.document.getElementById(id);
    const submit = async () => {
        $("buyerRequestForm").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 20));
    };

    await submit();

    check("порожня форма не надсилається", calls.length === 0, calls.length);
    check("під полями — пояснення", ["buyerItemError", "buyerNameError", "buyerPhoneError", "buyerConsentError"].every(id => $(id).textContent.length > 5));
    check("фокус — на першому полі з помилкою", w.document.activeElement === $("buyerLinks"));

    $("buyerLinks").value = "https://www.coach.com/p/1.html";
    $("buyerName").value = "Олена";
    $("buyerPhone").value = "067 123 45 67";
    $("buyerConsent").checked = true;
    $("buyerPhone").dispatchEvent(new w.Event("input"));

    check("виправлене — помилки зникають одразу", !$("buyerPhoneError").textContent && !$("buyerItemError").textContent);

    $("buyerBudget").value = "20000грн";
    $("buyerBudget").dispatchEvent(new w.Event("input"));

    check("бюджет — лише цифри з пробілами", $("buyerBudget").value === "20 000", $("buyerBudget").value);

    reply = { status: 400, body: { ok: false, error: "bad_phone" } };
    await submit();

    check("відмова сервера про номер — під полем номера", calls.length === 1 && /\+380/.test($("buyerPhoneError").textContent));
    check("форма лишилась на місці", !$("buyerRequestForm").hidden);

    reply = { status: 429, body: { ok: false, error: "too_many" } };
    await submit();

    check("429 — «забагато заявок»", /Забагато заявок/.test($("buyerStatus").textContent) && !$("buyerStatus").hidden);
    check("кнопку знову можна натиснути", !$("buyerSubmit").disabled);

    reply = { status: 200, body: { ok: true } };
    await submit();

    const body = calls[calls.length - 1].body;

    check("надіслано в telegram-order-bot з site_action", /\/functions\/v1\/telegram-order-bot$/.test(calls[calls.length - 1].url) && body.site_action === "buyer-request");
    check("у запиті всі поля", body.links && body.name === "Олена" && body.phone && body.consent === true && body.delivery === "advise" && body.contact === "telegram" && body.website === "" && body.lang === "uk",
        JSON.stringify(body));
    check("сервер прийняв би саме цей запит", br.normalizeBuyerRequest(body).ok, br.normalizeBuyerRequest(body).error);
    check("успіх — картка «Заявку отримали» замість форми", $("buyerRequestForm").hidden && !$("buyerDone").hidden);

    $("buyerAgain").click();

    check("«Надіслати ще одну» — порожня форма знову", !$("buyerRequestForm").hidden && $("buyerDone").hidden && $("buyerLinks").value === "");

    dom.window.close();

    console.log(failures ? `\n✗ Помилок: ${failures}` : "\n✓ Заявка на байєр-сервіс: усе гаразд");
    process.exit(failures ? 1 : 0);

})();
