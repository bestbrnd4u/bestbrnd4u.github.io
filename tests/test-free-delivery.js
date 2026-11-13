// Безкоштовна доставка від суми (data/delivery.json, адмінка →
// Налаштування → «Безкоштовна доставка»). Рішення власника 13.11.2026:
// від 30 000 грн відправку оплачує магазин.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ОДИН ПОРІГ — СКРІЗЬ. Кошик, оформлення, «Оплата і доставка»,
//    оферта, llms.txt, картка власника в Telegram і лист покупцеві
//    беруть число з одного файлу. Поріг, вписаний руками в одну зі
//    сторінок, розійшовся б зі зміною в адмінці — і в оферті лишилась
//    би інша обіцянка, ніж у кошику.
//
// 2. МЕЖА — ВКЛЮЧНО, І ПІСЛЯ ЗНИЖОК. Рівно 30 000 — безкоштовно;
//    29 999 — ні. Порівнюється сума ДО СПЛАТИ: промокод, що опустив
//    замовлення нижче порогу, прибирає й безкоштовну доставку.
//
// 3. СУМА ЗАМОВЛЕННЯ НЕ ЗМІНЮЄТЬСЯ. Магазин доставку не бере ніколи
//    (tests/test-delivery.js); від порогу він її ОПЛАЧУЄ. delivery_price
//    лишається нулем.
//
// 4. ПОРІГ 0 — ПРОПОЗИЦІЇ НЕМАЄ НІДЕ: ні підказки в кошику, ні абзацу
//    на сторінках, ні позначки в картці.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Поріг, який зараз в адмінці. 0 — законний стан (власник вимкнув
// пропозицію), і тест від нього падати не мусить: інакше вимкнення в
// адмінці зупинило б викладку. Де потрібне якесь число — SAMPLE.
const FROM = JSON.parse(read("data/delivery.json")).freeFrom;
const SAMPLE = FROM || 30000;

const build = require("../scripts/build-free-delivery.js");

console.log("\n[1] Поріг у даних і в адмінці");
{
    check(`data/delivery.json: freeFrom — ціле, не від'ємне (${FROM}; 0 — вимкнено)`, Number.isInteger(FROM) && FROM >= 0, FROM);

    const admin = read("admin/config.yml");
    const entry = admin.match(/- name: "delivery"[\s\S]*?file: "data\/delivery\.json"[\s\S]*?name: "freeFrom"/);

    check("в адмінці є поле порогу для data/delivery.json", Boolean(entry));

    check("readThreshold() у збірці читає той самий файл", build.readThreshold() === FROM, build.readThreshold());
}

console.log("\n[2] Сайт: спільне правило (FreeDelivery у common.js)");
{
    // Беремо сам блок із common.js, а не копію логіки: перевірка має
    // ламатись, коли ламається код.
    const common = read("assets/js/common.js");
    const block = common.match(/const FreeDelivery = \(\(\) => \{[\s\S]*?\n\}\)\(\);/);

    check("блок FreeDelivery знайдено", Boolean(block));

    const ctx = {
        window: {},
        Intl,
        dataUrl: url => url,
        fetch: async url => ({ ok: url === "data/delivery.json", json: async () => ({ freeFrom: 30000 }) }),
        out: null
    };

    vm.createContext(ctx);
    vm.runInContext(block[0] + "\nout = FreeDelivery;", ctx);

    const FD = ctx.out;
    const money = v => `${v} грн`;

    check("рівно на порозі — безкоштовно", FD.applies(30000, 30000));
    check("на гривню менше — ні", !FD.applies(29999, 30000));
    check("поріг 0 — ніколи", !FD.applies(1e9, 0));

    check("лишилось = поріг − сума", FD.left(26000, 30000) === 4000, FD.left(26000, 30000));

    check("набрано — «Доставка безкоштовна…»", /^Доставка безкоштовна/.test(FD.hint(30000, 30000, money)));
    check("понад половину — «лишилось 4000 грн»", FD.hint(26000, 30000, money) === "До безкоштовної доставки лишилось 4000 грн", FD.hint(26000, 30000, money));
    check("менше половини — «від 30000 грн», без «лишилось»", FD.hint(3000, 30000, money) === "Безкоштовна доставка — від 30000 грн", FD.hint(3000, 30000, money));
    check("поріг 0 — підказки немає", FD.hint(50000, 0, money) === "");

    check("кривий поріг (рядок, мінус) — 0", FD.normalize("abc") === 0 && FD.normalize(-5) === 0 && FD.normalize("30000") === 30000);

    FD.threshold().then(v => check("threshold() читає data/delivery.json", v === 30000, v));
}

console.log("\n[3] Кошик і оформлення");
{
    const cartHtml = read("cart.html");
    const cartJs = read("assets/js/cart.js");
    const checkoutHtml = read("checkout.html");
    const checkoutJs = read("assets/js/checkout.js");

    check("у кошику є рядок доставки й підказка", /id="cartDeliveryNote"/.test(cartHtml) && /id="cartFreeDeliveryHint"[^>]*hidden/.test(cartHtml));
    check("кошик рахує від суми до сплати (subtotal зі знижками товарів)", /renderFreeDelivery\(subtotal\)/.test(cartJs));

    check("на оформленні є підказка", /id="orderFreeDeliveryHint"[^>]*hidden/.test(checkoutHtml));

    // Сума до сплати — після промокоду: total = priceTotal − promoDiscount.
    const update = checkoutJs.match(/function updateTotals\(\) \{[\s\S]*?\n\}/)[0];

    check("оформлення: поріг від total (після промокоду)", /const total = priceTotal - promoDiscount;[\s\S]*freeDeliveryFor\(Math\.max\(total, 0\)\)/.test(update));
    check("оформлення: «безкоштовно» в рядку доставки", /free\s*\?\s*"безкоштовно"/.test(update));

    // Сума замовлення від порогу не змінюється — доставка лишається 0.
    check("deliveryPrice лишається нулем", /const deliveryPrice = 0;/.test(checkoutJs));

    check("лист через EmailJS теж каже «безкоштовно»", /order_delivery_price: freeDeliveryFor\(total\)/.test(checkoutJs));
}

console.log("\n[4] Сторінки: текст пише збірка");
{
    for (const file of ["delivery-payment.html", "offer.html"]) {

        const html = read(file);
        const marks = html.match(/data-free-delivery="[a-z]+"/g) || [];

        check(`${file}: є позначка порогу`, marks.length > 0);

        // Повторна збірка нічого не змінює — тобто на сторінці саме
        // той поріг, що в даних.
        check(`${file}: текст відповідає порогу з даних`, build.apply(html, FROM, file).out === html);

        if (FROM) check(`${file}: у тексті саме ${build.money(FROM)}`, html.includes(build.money(FROM)));
        else check(`${file}: поріг вимкнено — абзаци сховано`, !/data-free-delivery="[a-z]+">/.test(html));
    }

    const page = read("delivery-payment.html");

    // Вимкнено — абзаци порожні й сховані, жодного числа.
    const on = build.apply(page, SAMPLE, "delivery-payment.html").out;
    const off = build.apply(on, 0, "delivery-payment.html").out;

    check("поріг 0 — абзаци сховано й випорожнено",
        (off.match(/data-free-delivery="[a-z]+" hidden><\/p>/g) || []).length === (on.match(/data-free-delivery=/g) || []).length);
    // Розмітку питань перезбирає наступний крок (build-faq-schema.js) —
    // тут дивимось лише на видимий текст.
    const visible = off.replace(/<script[\s\S]*?<\/script>/g, "");

    check("поріг 0 — числа порогу у видимому тексті немає", !visible.includes(build.money(SAMPLE)));

    // Увімкнули знову з іншим числом — абзаци повернулись.
    const back = build.apply(off, 45000, "delivery-payment.html").out;

    check("поріг 45 000 після вимкнення — абзаци знову видно", back.includes("45 000 грн") && !/data-free-delivery="[a-z]+" hidden/.test(back));

    // FAQ-розмітку збирає build-faq-schema.js з видимого тексту.
    const ld = page.match(/"@type": "FAQPage"[\s\S]*?<\/script>/)[0];

    if (FROM) check("розмітка питань (FAQPage) знає про поріг", ld.includes(build.money(FROM)));

    check("невідомий вид позначки зупиняє збірку", (() => {
        try { build.apply('<p data-free-delivery="nope">x</p>', SAMPLE, "x.html"); return false; } catch (e) { return true; }
    })());

    const pkg = JSON.parse(read("package.json")).scripts.build;
    const at = name => pkg.indexOf(name);

    check("крок стоїть у збірці перед FAQ-розміткою, перекладом і ботом",
        at("build-free-delivery.js") > 0
        && at("build-free-delivery.js") < at("build-faq-schema.js")
        && at("build-free-delivery.js") < at("build-locales.js")
        && at("build-free-delivery.js") < at("build-chat-bot.js")
        && at("build-free-delivery.js") < at("build-llms.js"));

    const llms = read("llms.txt");

    if (FROM) check("llms.txt: поріг є, «безкоштовної доставки немає» — немає",
        llms.includes(build.money(FROM)) && !/Безкоштовної доставки від певної суми немає/.test(llms));
    else check("llms.txt: поріг вимкнено — «безкоштовної доставки немає»",
        /Безкоштовної доставки від певної суми немає/.test(llms));
}

console.log("\n[5] Переклад");
{
    const Core = require("../assets/js/i18n-core.js");
    const dict = JSON.parse(read("data/i18n/strings.json"));

    const texts = [
        build.TEMPLATES.page(SAMPLE),
        build.TEMPLATES.faq(SAMPLE),
        "безкоштовно",
        "Доставка безкоштовна — відправку оплачує магазин",
        "До безкоштовної доставки лишилось 4 500 грн",
        `Безкоштовна доставка — від 30 000 грн`,
        "Доставку цього замовлення оплачує магазин — на пошті за неї платити не потрібно."
    ];

    for (const lang of ["en", "ru"]) {

        const t = Core.createTranslator(dict, lang);

        const left = texts.filter(s => /[іїєґ]/i.test(t(s)) || (lang === "en" && /[а-я]/i.test(t(s))));

        check(`${lang}: усі нові рядки перекладено`, left.length === 0, left.join(" | "));
    }

    check("en: число лишається в перекладі", /30 000/.test(Core.createTranslator(dict, "en")(build.TEMPLATES.faq(30000))));
}

console.log("\n[6] Функція: картка власника, лист, бот");
{
    const format = require("../supabase/functions/telegram-order-bot/format.js");
    const mail = require("../supabase/functions/telegram-order-bot/mail.js");
    const flow = require("../supabase/functions/telegram-order-bot/order-flow.js");

    const order = total => ({
        id: 1, order_number: "1311000001", status: "new",
        subtotal: total, discount: 0, total, delivery_price: 0,
        first_name: "Тест", items: [{ title: "Сумка", price: total, qty: 1 }]
    });

    format.setFreeDeliveryFrom(0);

    check("поріг невідомий (0) — картка мовчить", !/Безкоштовна доставка/.test(format.formatOrder(order(50000))));

    format.setFreeDeliveryFrom(30000);

    check("30 000 — у картці «🎁 Безкоштовна доставка»", /🎁 <b>Безкоштовна доставка<\/b>/.test(format.formatOrder(order(30000))));
    check("29 999 — позначки немає", !/Безкоштовна доставка/.test(format.formatOrder(order(29999))));

    check("знижка опустила нижче порогу — позначки немає (рахуємо total)",
        !/Безкоштовна доставка/.test(format.formatOrder({ ...order(28000), subtotal: 32000, discount: 4000 })));

    const uk = mail.orderLetter({ ...order(35000), email: "a@example.com" }, "https://bestbrnd4u.com");
    const en = mail.orderLetter({ ...order(35000), email: "a@example.com", lang: "en" }, "https://bestbrnd4u.com");
    const small = mail.orderLetter({ ...order(20000), email: "a@example.com" }, "https://bestbrnd4u.com");

    check("лист: «Доставка — безкоштовно»", /Доставка[\s\S]{0,300}безкоштовно/.test(uk.html));
    check("лист англійською: «free»", /Delivery[\s\S]{0,300}>free</.test(en.html));
    check("лист нижче порогу — без «безкоштовно»", !/безкоштовно/.test(small.html));

    const product = price => ({ id: "x", brand: "Coach", title: "Tabby", price });

    check("бот у Telegram: підсумок від порогу — «безкоштовно»",
        /Доставка: безкоштовно/.test(flow.summaryText(product(30000), { qty: 1 })));
    check("бот у Telegram: нижче — «за тарифом перевізника»",
        /Доставка: за тарифом перевізника/.test(flow.summaryText(product(10000), { qty: 1 })));

    format.setFreeDeliveryFrom("кривий");

    check("кривий поріг — 0, позначки немає", format.getFreeDeliveryFrom() === 0 && !/Безкоштовна/.test(format.formatOrder(order(90000))));

    format.setFreeDeliveryFrom(0);

    // Поріг ставить loadFreeDelivery() — перед КОЖНОЮ карткою й підсумком.
    const src = read("supabase/functions/telegram-order-bot/_index.src.ts");

    const sites = [...src.matchAll(/formatOrder\(|summaryText\(product, session\)/g)];
    const missed = sites.filter(m => !src.slice(Math.max(0, m.index - 700), m.index).includes("await loadFreeDelivery()"));

    check(`перед усіма ${sites.length} картками/підсумками поріг підвантажено`, sites.length >= 5 && missed.length === 0,
        missed.map(m => src.slice(0, m.index).split("\n").length).join(", "));

    check("функція читає той самий файл, що сайт", /\/data\/delivery\.json/.test(src));

    const built = read("supabase/functions/telegram-order-bot/index.ts");

    check("index.ts перезібрано з порогом", /async function loadFreeDelivery/.test(built) && /freeDeliveryApplies/.test(built));
}

console.log("\n[7] Сторінка «Де моє замовлення»");
{
    const html = read("order-status.html");
    const js = read("assets/js/order-status.js");

    check("речення про доставку має id", /id="lookupDeliveryNote"/.test(html));
    check("order-status.js міняє його за сумою замовлення", /renderDeliveryNote\(order\.total\)/.test(js) && /FreeDelivery\.applies\(total, from\)/.test(js));
}

setTimeout(() => {
    console.log(failures ? `\n✗ Помилок: ${failures}` : "\n✓ Безкоштовна доставка: усе гаразд");
    process.exit(failures ? 1 : 0);
}, 50);
