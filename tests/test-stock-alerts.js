// «Повідомити, коли з'явиться» — від кнопки на сторінці товару до листа.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ПІДПИСКА — ЛИШЕ НА ТЕ, ЩО Є. Колір і розмір беруться з каталогу:
//    вигаданий розмір не потрапить ні в базу, ні в повідомлення.
// 2. «З'ЯВИВСЯ» — ТИМИ САМИМИ ПРАВИЛАМИ, ЩО НА САЙТІ (stock.js +
//    живий залишок). Без живого залишку лист не йде: каталог міг би
//    сказати «є», коли останню одиницю щойно зайняли.
// 3. ОДИН ЛИСТ. Після нього підписка закрита — і позначається одразу
//    після кожного листа, а не наприкінці прогону.
// 4. ЧУЖІ АДРЕСИ НЕ ВИДНО. Таблиця закрита RLS, функція додавання —
//    лише для службового ключа, власнику в Telegram адреса не йде.
// 5. «ПІД ЗАМОВЛЕННЯ ЗАВЖДИ» не «з'являється» — поля там немає.

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

const sa = require("../supabase/functions/telegram-order-bot/stock-alert.js");
const mail = require("../supabase/functions/telegram-order-bot/mail.js");
const sender = require("../scripts/stock-alerts.js");
const LiveStock = require("../assets/js/live-stock.js");

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Зразок: кросівки, два кольори, три розміри; у білих 38-го немає.
const sample = () => ({
    id: 34, slug: "krosivky-test", title: "Кросівки Test", brand: "Lacoste", price: 5900,
    sizes: ["37", "38", "39"],
    variants: [
        { color: "Білий", sizes: ["37", "38", "39"], stock: { "37": 1, "38": 0, "39": 1 }, images: ["/assets/images/a.webp"] },
        { color: "Чорний", sizes: ["37", "38", "39"], stock: { "37": 0, "38": 0, "39": 0 }, images: ["assets/images/b.webp"] }
    ]
});

console.log("\n[1] Підписка: перевірка на сервері");
{
    const ok = sa.normalizeStockAlert({ email: " Olena@Example.COM ", product_id: "34", color: "Білий", size: "38", lang: "en" });

    check("правильна приймається, пошта — малими", ok.ok && ok.alert.email === "olena@example.com", JSON.stringify(ok));
    check("номер товару — число", ok.alert.product_id === 34);
    check("мова лише en/ru, решта — українська (null)", sa.normalizeStockAlert({ email: "a@b.co", product_id: 1, lang: "de" }).alert.lang === null);

    check("крива пошта — bad_email", ["", "a@b", "a b@c.d", "@b.co", "x".repeat(300) + "@a.co"].every(e => sa.normalizeStockAlert({ email: e, product_id: 1 }).error === "bad_email"));
    check("без товару — bad_product", sa.normalizeStockAlert({ email: "a@b.co", product_id: "abc" }).error === "bad_product"
        && sa.normalizeStockAlert({ email: "a@b.co", product_id: -1 }).error === "bad_product");
    check("ONESIZE лишається як є — це ключ залишку", sa.normalizeStockAlert({ email: "a@b.co", product_id: 1, size: "ONESIZE" }).alert.size === "ONESIZE");
}

console.log("\n[2] Колір і розмір — лише з каталогу");
{
    const p = sample();

    check("наявні колір і розмір", JSON.stringify(sa.stockAlertVariant(p, "Білий", "38")) === JSON.stringify({ color: "Білий", size: "38" }));
    check("вигаданий колір — ні", sa.stockAlertVariant(p, "<b>Зелений</b>", "38") === null);
    check("вигаданий розмір — ні", sa.stockAlertVariant(p, "Білий", "99") === null);
    check("без кольору — дозволено (товар з одним кольором)", sa.stockAlertVariant(p, "", "") !== null);
}

console.log("\n[3] Повідомлення власнику");
{
    const text = sa.formatStockAlert({ brand: "Lacoste", title: "<i>Кросівки</i>" }, { email: "olena@example.com", color: "Білий", size: "38" }, esc);

    check("видно товар і варіант", /Lacoste &lt;i&gt;Кросівки/.test(text) && /Варіант: Білий \/ 38/.test(text));
    check("пошти людини в повідомленні немає", !/olena@example\.com/.test(text));
    check("ONESIZE не показуємо", !/ONESIZE/.test(sa.formatStockAlert({ brand: "A", title: "B" }, { color: "Чорний", size: "ONESIZE" }, esc)));
}

console.log("\n[4] Функція: маршрут, межа, каталог");
{
    const src = read("supabase/functions/telegram-order-bot/_index.src.ts");
    const built = read("supabase/functions/telegram-order-bot/index.ts");

    check("site_action «stock-alert» веде в обробник", /body\.site_action === "stock-alert"[\s\S]{0,80}handleStockAlert\(request, body\)/.test(src));

    const h = src.match(/async function handleStockAlert[\s\S]*?\n\}\n/)[0];

    const at = s => h.indexOf(s);

    check("пастка — перша", at("body.website") > 0 && at("body.website") < at("normalizeStockAlert"));
    check("межа — до каталогу й бази", at('contactAllowed(request, "stock-alert")') > 0 && at('contactAllowed(request, "stock-alert")') < at("loadSiteCatalog") && /"stock-alert": \{ perIp: \d+, global: \d+ \}/.test(src));
    check("колір і розмір звіряються з каталогом до запису", at("stockAlertVariant") > 0 && at("stockAlertVariant") < at("rpc/stock_alert_add"));
    check("у базу йде варіант із каталогу, а не з запиту", /p_color: variant\.color/.test(h) && /p_size: variant\.size/.test(h));
    check("«вже чекаєте» — це ok, а не помилка", /result === "exists"\) return adminJson\(\{ ok: true, already: true \}/.test(h));
    check("база не прийняла (немає міграції) — не «ок»", /if \(!added\.ok\)[\s\S]*?ok: false/.test(h));
    check("модуль у збірці функції", /"stock-alert\.js"/.test(read("scripts/build-edge-function.js")));
    check("index.ts перезібрано", /async function handleStockAlert/.test(built) && /function stockAlertVariant/.test(built));
}

console.log("\n[5] Міграція 046");
{
    const sql = read("supabase/migrations/046-stock-alerts.sql");

    check("таблиця закрита RLS без політик", /alter table public\.stock_alerts enable row level security/.test(sql) && !/create policy/i.test(sql));
    check("клієнту — нічого", /revoke all on public\.stock_alerts from anon, authenticated/.test(sql));
    check("одна підписка, що чекає, на той самий варіант", /create unique index[\s\S]*?lower\(email\), product_id, color, size\)[\s\S]*?where notified_at is null/.test(sql));
    check("функція додавання — security definer з search_path", /function public\.stock_alert_add[\s\S]*?security definer\s+set search_path = public/.test(sql));
    check("виконувати може лише службовий ключ",
        /revoke execute on function public\.stock_alert_add[\s\S]*?from public, anon, authenticated/.test(sql)
        && /grant execute on function public\.stock_alert_add[\s\S]*?to service_role/.test(sql));
    check("межа підписок на одну адресу", />= 20 then\s+return 'limit'/.test(sql));
}

console.log("\n[6] Розсилка: коли «з'явився»");
{
    const p = sample();

    check("білий 37 — є", sender.available(p, "Білий", "37"));
    check("білий 38 — ні (залишок 0)", !sender.available(p, "Білий", "38"));
    check("чорний без розміру — ні (усі нулі)", !sender.available(p, "Чорний", ""));
    check("вигаданий колір — ні", !sender.available(p, "Зелений", "37"));
    check("товару немає (розпродано) — ні", !sender.available(undefined, "Білий", "37"));
    check("«під замовлення завжди» — ніколи", !sender.available({ ...sample(), preOrderAlways: true }, "Білий", "37"));

    // Живий залишок: 38-й повернувся, 37-й зайняло замовлення. Саме
    // due() — те, що кличе скрипт, — а не окремі кроки.
    const pending = [
        { id: 1, product_id: 34, color: "Білий", size: "38" },
        { id: 2, product_id: 34, color: "Білий", size: "37" },
        { id: 3, product_id: 999, color: "Білий", size: "37" }
    ];
    const ready = sender.due(pending, [sample()], [
        { product_id: 34, color: "Білий", size: "38", available: true },
        { product_id: 34, color: "Білий", size: "37", available: false }
    ]).map(x => x.alert.id);

    check("живий залишок «є» — лист піде", ready.includes(1), ready.join(","));
    check("живий залишок «немає» — лист не піде, хоч у каталозі 1", !ready.includes(2), ready.join(","));
    check("товару немає в каталозі — не піде", !ready.includes(3));
    check("без живого залишку — рішення не ухвалюємо", (() => { try { sender.due(pending, [sample()], null); return false; } catch (e) { return true; } })());

    const item = sender.letterItem(sample(), { color: "Чорний", size: "38", lang: "en" }, "https://bestbrnd4u.com");

    check("посилання мовою підписки й з кольором", item.url === "https://bestbrnd4u.com/en/p/krosivky-test/?color=%D0%A7%D0%BE%D1%80%D0%BD%D0%B8%D0%B9", item.url);
    check("фото — того кольору й абсолютне", item.image === "https://bestbrnd4u.com/assets/images/b.webp", item.image);
    check("українська — без префікса", sender.letterItem(sample(), { color: "Білий", lang: null }, "https://x.com").url.startsWith("https://x.com/p/"));

    const script = read("scripts/stock-alerts.js");
    const loop = script.match(/for \(const \{ alert, product \} of ready\) \{[\s\S]*?\n    \}\n/)[0];

    check("без живого залишку — збій, а не розсилка з каталогу", /if \(!liveResponse\.ok\) \{\s*throw/.test(script));
    check("позначка «надіслано» — одразу після листа, у циклі", /await send\(letter, alert\.email\)[\s\S]*?PATCH[\s\S]*?notified_at/.test(loop));
    check("--dry-run нічого не позначає й не видаляє", /if \(DRY\) \{[\s\S]*?continue;\s*\}/.test(loop) && /if \(!DRY\) \{[\s\S]*?DELETE/.test(script));
    check("заблоковані адреси — пропускаємо", /allowedToWrite\(blocked, alert\.email\)/.test(loop));
    check("стеля листів за прогін", sender.MAX_LETTERS > 0 && sender.MAX_LETTERS <= 200 && /sent >= MAX_LETTERS/.test(loop));
    check("немає таблиці — «не налаштовано», не червоне", /notConfigured\("Немає таблиці stock_alerts/.test(script));
}

console.log("\n[7] Лист");
{
    const item = { title: "Кросівки <b>Test</b>", brand: "Lacoste", price: 5900, color: "Білий", size: "38", image: "https://x.com/a.webp", url: "https://x.com/p/t/?a=1&b=2" };

    const uk = mail.stockAlertLetter(item, "https://x.com", null);
    const en = mail.stockAlertLetter({ ...item, title_local: "Test sneakers" }, "https://x.com", "en");
    const ru = mail.stockAlertLetter(item, "https://x.com", "ru");

    check("тема з назвою", uk.subject === "Знову в наявності: Lacoste Кросівки <b>Test</b>", uk.subject);
    check("англійською — назва перекладена", en.subject === "Back in stock: Lacoste Test sneakers", en.subject);
    check("російською", /^Снова в наличии/.test(ru.subject));
    check("кнопка веде на товар (адреса екранована)", /href="https:\/\/x\.com\/p\/t\/\?a=1&amp;b=2"/.test(uk.html));
    check("назва в листі екранована", !/<b>Test<\/b>/.test(uk.html));
    check("сказано, що лист один", /єдиний лист/i.test(uk.html) && /only email/i.test(en.html));
    check("без адреси товару — листа немає", mail.stockAlertLetter({ ...item, url: "" }, "https://x.com") === null);
}

console.log("\n[8] Розклад");
{
    const yml = read(".github/workflows/stock-alerts.yml");

    check("щогодини", /cron: "\d+ \* \* \* \*"/.test(yml));
    check("дані — з main (те, що на сайті)", /ref: main/.test(yml));
    check("два запуски не перетинаються", /concurrency:[\s\S]*?cancel-in-progress: false/.test(yml));
    check("ті самі секрети, що в «Remind carts»", ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "BREVO_API_KEY", "MAIL_FROM"].every(k => yml.includes(`secrets.${k}`)));
    check("запускає scripts/stock-alerts.js", /run: node scripts\/stock-alerts\.js/.test(yml));
}

console.log("\n[9] Сторінка товару");
{
    const js = read("assets/js/product.js");
    const tpl = read("product.html");

    check("форма — у блоці «під замовлення»", /<div class="preorder-box"[\s\S]*?<form class="stock-alert"[\s\S]*?<\/form>\s*<\/div>/.test(js));
    check("«під замовлення завжди» — форма схована", /product\.preOrderAlways === true \? "hidden" : ""/.test(js));
    check("посилання на політику — від кореня (сторінки лежать у /p/…/)", /stock-alert-note[\s\S]{0,200}href="\/privacy-policy"/.test(js));
    check("скрипт у шаблоні сторінки товару", /<script src="assets\/js\/stock-alert\.js[^"]*" defer><\/script>/.test(tpl));

    // Лише справжні сторінки товару: решта тек у p/ — переадресації зі
    // старих адрес (legacySlugs), у них немає жодного скрипту.
    const pages = fs.readdirSync(path.join(ROOT, "p"))
        .filter(d => fs.existsSync(path.join(ROOT, "p", d, "index.html")))
        .filter(d => read(`p/${d}/index.html`).includes("assets/js/product.js"));
    const without = pages.filter(d => !read(`p/${d}/index.html`).includes("stock-alert.js"));

    check(`скрипт успадкували всі ${pages.length} сторінок товарів`, pages.length > 50 && without.length === 0, without.slice(0, 3).join(", "));
}

console.log("\n[10] Переклад");
{
    const Core = require("../assets/js/i18n-core.js");
    const dict = JSON.parse(read("data/i18n/strings.json"));

    const texts = [
        "Не хочете чекати? Напишемо, щойно ця річ з'явиться в наявності.",
        "Повідомити мене",
        "Ваша пошта",
        "Один лист — коли саме цей колір і розмір буде в наявності.",
        "Введіть пошту, на яку прийде лист",
        "Готово! Напишемо на a@b.co, щойно цей варіант з'явиться в наявності.",
        "Ви вже чекаєте саме цей варіант — лист прийде, щойно він з'явиться.",
        "Не вдалося підписатися. Напишіть нам у Telegram — @bestbrnd4u."
    ];

    for (const lang of ["en", "ru"]) {
        const t = Core.createTranslator(dict, lang);
        const left = texts.filter(s => /[іїєґ]/i.test(t(s)) || (lang === "en" && /[а-я]/i.test(t(s))));
        check(`${lang}: усі рядки перекладено`, left.length === 0, left.join(" | "));
    }
}

console.log("\n[11] Форма в браузері (JSDOM)");
(async () => {

    const html = `<!doctype html><div id="productPage">
        <button class="color active" data-color="Білий"></button>
        <button class="size" data-size="37"></button>
        <button class="size active" data-size="38" data-out="1"></button>
        <div class="preorder-box">
            <form class="stock-alert" novalidate data-product-id="34" data-color="Білий" data-size="">
                <div class="stock-alert-row">
                    <input type="email" name="email">
                    <button type="submit" class="btn stock-alert-submit">Повідомити мене</button>
                </div>
                <input type="text" name="website" class="stock-alert-trap">
                <p class="stock-alert-status" hidden></p>
            </form>
        </div></div>`;

    const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://bestbrnd4u.com/p/krosivky-test/" });
    const w = dom.window;
    const calls = [];
    let reply = { status: 200, body: { ok: true } };

    w.SUPABASE_URL = "https://example.supabase.co";
    w.SUPABASE_PUBLISHABLE_KEY = "pk";
    w.fetch = async (url, opts) => { calls.push(JSON.parse(opts.body)); return { status: reply.status, json: async () => reply.body }; };

    w.eval(read("assets/js/stock-alert.js"));

    const $ = s => w.document.querySelector(s);
    const submit = async () => {
        $("form.stock-alert").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
        await new Promise(r => setTimeout(r, 20));
    };

    await submit();

    check("без пошти — не надсилається, пояснення під полем", calls.length === 0 && /пошту/.test($(".stock-alert-status").textContent));

    $('input[name="email"]').value = "olena@example.com";
    await submit();

    const body = calls[0] || {};

    check("надіслано обраний ЗАРАЗ розмір і колір", body.site_action === "stock-alert" && body.product_id === 34 && body.color === "Білий" && body.size === "38", JSON.stringify(body));
    check("сервер прийняв би цей запит", sa.normalizeStockAlert(body).ok);
    check("успіх — поле сховане, видно «Готово» з адресою", $(".stock-alert-row").hidden && /olena@example\.com/.test($(".stock-alert-status").textContent));

    $('.size[data-size="37"]').click();

    check("інший розмір — форма знову готова", !$(".stock-alert-row").hidden && $(".stock-alert-status").hidden);

    reply = { status: 200, body: { ok: true, already: true } };
    await submit();

    check("повторна підписка — «вже чекаєте», не помилка", /вже чекаєте/.test($(".stock-alert-status").textContent));

    $('.size[data-size="37"]').click();
    reply = { status: 429, body: { ok: false, error: "too_many" } };
    await submit();

    check("429 — «забагато спроб», кнопка знову активна", /Забагато спроб/.test($(".stock-alert-status").textContent) && !$(".stock-alert-submit").disabled);

    dom.window.close();

    console.log(failures ? `\n✗ Помилок: ${failures}` : "\n✓ «Повідомити, коли з'явиться»: усе гаразд");
    process.exit(failures ? 1 : 0);

})();
