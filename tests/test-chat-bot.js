// Бот-помічник у чаті на сайті.
//
// Рішення власника 09.11.2026: відповідає одразу, без платної моделі,
// власник бачить усе в Telegram і може втрутитись — тоді бот замовкає.
//
// Тут перевіряємо на СПРАВЖНІЙ довідці (data/chat-bot.json) і
// справжньому коді клієнта:
//   [1] довідка: увесь каталог, часті питання — дослівно з сайту;
//   [2] підбір товару: тип, стать, бренд, колір, бюджет, уточнення;
//   [3] часті питання й службові відповіді;
//   [4] коли бот мовчить;
//   [5] формат: те, що пише сервер, клієнт розбирає на картки й кнопки;
//   [6] кнопки-підказки ведуть туди, куди обіцяють, трьома мовами;
//   [7] підключення: функція, збірка, сайт, адмінка.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const bot = require("../supabase/functions/telegram-order-bot/chat-bot.js");
const Core = require("../assets/js/i18n-core.js");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const DATA_FILE = path.join(ROOT, "data/chat-bot.json");
if (!fs.existsSync(DATA_FILE)) require("../scripts/build-chat-bot.js");
const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
const bySlug = new Map(data.products.map(p => [p.slug, p]));
const NOW = Date.parse("2026-11-09T12:00:00Z");

// Розмова: кожне повідомлення — відповідь бота з усією попередньою історією.
function talk(lang, messages, extraHistory) {
    const history = (extraHistory || []).slice();
    let last = null;
    messages.forEach(m => {
        last = bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com" });
        history.push({ author: "visitor", body: m });
        if (last) history.push({ author: "bot", body: bot.serializeBotReply(last, lang) });
    });
    return last;
}
const items = r => (r && r.products || []).map(p => bySlug.get(p.slug));

console.log("\n[1] Довідка для бота");
{
    const products = JSON.parse(read("data/products.json")).filter(p => p && p.slug);
    check(`увесь каталог (${data.products.length} з ${products.length})`, data.products.length === products.length);
    check("у кожного товару назва трьома мовами", data.products.every(p => p.title.uk && p.title.en && p.title.ru));
    check("англійські назви без української", data.products.every(p => !/[а-яіїєґ]/i.test(p.title.en) || p.title.en === p.title.uk),
        (data.products.find(p => /[а-яіїєґ]/i.test(p.title.en) && p.title.en !== p.title.uk) || {}).slug);
    check(`часті питання: uk ${data.faq.uk.length}, en ${data.faq.en.length}, ru ${data.faq.ru.length}`,
        data.faq.uk.length >= 20 && data.faq.en.length >= 15 && data.faq.ru.length >= 15);

    // Дослівно з видимого акордеона сторінки — тієї самої, з якої
    // build-faq-schema.js будує розмітку для Google.
    const page = read("delivery-payment.html").replace(/\s+/g, " ");
    const fromPage = data.faq.uk.filter(f => f.page === "/delivery-payment");
    check("відповіді — дослівно ті, що на сторінці", fromPage.length > 3 && fromPage.every(f => page.includes(f.a.replace(/\s+/g, " ").slice(0, 60))),
        (fromPage.find(f => !page.includes(f.a.replace(/\s+/g, " ").slice(0, 60))) || {}).q);
    check("юридичні відповіді лише українською (переклад не чинний)",
        data.faq.uk.some(f => f.page === "/return-warranty") && !data.faq.en.some(f => f.page === "/return-warranty"));
    // Мініатюра в чаті — 56 px: копія на 300 px (3–5 КБ), а не оригінал
    // (55–145 КБ). На проді 09.11.2026 дві з чотирьох оригінальних
    // мініатюр не встигали зʼявитись. І кожна мусить існувати.
    const missingImg = data.products.filter(p => p.image && !fs.existsSync(path.join(ROOT, decodeURI(p.image))));
    check("кожна мініатюра — справжній файл", missingImg.length === 0, missingImg.slice(0, 2).map(p => p.image).join(", "));
    const variants = new Set(JSON.parse(read("data/image-variants.json")));
    const heavy = data.products.filter(p => {
        const orig = p.image.replace(/-300\.webp$/, ".webp").split("/").pop();
        return variants.has(orig) && !/-300\.webp$/.test(p.image);
    });
    check("де є копія на 300 px — бот бере її", heavy.length === 0, heavy.slice(0, 2).map(p => p.image).join(", "));
    check("мініатюри в чаті без lazy (у прокручуваній панелі він підводив)", !/chat-product-img[\s\S]{0,400}loading = "lazy"/.test(read("assets/js/contact-buttons.js")));
    const notif = JSON.parse(read("data/notifications.json"));
    check("вимикач з адмінки доходить до довідки", data.enabled === (notif.chatBot !== false));
}

console.log("\n[2] Підбір товару");
{
    const r1 = talk("uk", ["Шукаю жіночу сумку до 8000"]);
    check("«жіноча сумка до 8000» — лише жіночі сумки не дорожчі 8000",
        r1.products.length > 0 && items(r1).every(p => p.department === "Сумки" && (p.gender.includes("Жінкам") || p.gender.includes("Унісекс")) && bot.botPriceNow(p, NOW) <= 8000),
        items(r1).map(p => `${p.category} ${p.price}`).join(", "));

    const r2 = talk("uk", ["хочу сумку", "До 5 000 ₴"]);
    check("уточнення «До 5 000 ₴» доповнює «сумку», а не шукає все дешевше",
        r2.products.length > 0 && items(r2).every(p => p.department === "Сумки" && bot.botPriceNow(p, NOW) <= 5000));

    const r3 = talk("uk", ["хочу сумку", "годинник"]);
    check("новий тип скидає попередній", items(r3).every(p => p.category === "Годинники"));

    const r4 = talk("ru", ["часы мужу в подарок до 10 тыс"]);
    check("ru: «часы мужу до 10 тыс» — чоловічі годинники до 10 000",
        r4.products.length > 0 && items(r4).every(p => p.category === "Годинники" && !p.gender.every(g => g === "Жінкам") && bot.botPriceNow(p, NOW) <= 10000));

    const r5 = talk("en", ["looking for a women's bag under 8,000"]);
    check("en: «under 8,000» розпізнано", r5.products.length > 0 && items(r5).every(p => bot.botPriceNow(p, NOW) <= 8000));
    check("en: назви англійською, посилання на /en/", r5.products.every(p => !/[а-яіїєґ]/i.test(p.title) && /\/en\/p\//.test(p.url)));

    const r6 = talk("ru", ["женская сумка Marc Jacobs черная"]);
    check("бренд і колір", r6.products.length > 0 && items(r6).every(p => p.brand === "Marc Jacobs" && p.colors.some(c => /^Чорн/i.test(c) || /чорн/i.test(c))));

    const r7 = talk("uk", ["окуляри Ray-Ban"]);
    check("бренд латиницею з дефісом", r7.products.length > 0 && items(r7).every(p => p.brand === "Ray-Ban"));

    const r8 = talk("uk", ["сумка коуч"]);
    check("бренд кирилицею («коуч» → Coach)", r8.products.length > 0 && items(r8).every(p => p.brand === "Coach"));

    // «Інші варіанти» гортають, а не повторюють.
    const first = talk("uk", ["Жіночі сумки"]);
    const second = talk("uk", ["Жіночі сумки", "Інші варіанти"]);
    const third = talk("uk", ["Жіночі сумки", "Інші варіанти", "Інші варіанти"]);
    const seen = [first, second, third].flatMap(r => r.products.map(p => p.slug));
    check("«Інші варіанти» тричі — 12 різних товарів", seen.length === 12 && new Set(seen).size === 12, seen.length + " / " + new Set(seen).size);

    // Чого немає — чесно, і передає людині; тип не підмінює.
    const none = talk("uk", ["гаманець Rolex"]);
    check("нема такого — не підсовує інший тип і передає менеджеру",
        none && (none.products.length === 0 ? none.handoff : items(none).every(p => p.category === "Гаманці")));

    // Знижка зі строком: після завершення ціна звичайна.
    const p = { price: 9000, sale: { price: 7000, from: "2026-11-01T00:00:00Z", to: "2026-11-05T00:00:00Z" } };
    check("ціна зі знижкою — лише у вікні знижки", bot.botPriceNow(p, Date.parse("2026-11-03T00:00:00Z")) === 7000 && bot.botPriceNow(p, NOW) === 9000);
}

console.log("\n[3] Часті питання й службові відповіді");
{
    const faqAnswer = (lang, q, re) => { const r = talk(lang, [q]); return r && re.test(r.text) && r.products.length === 0; };
    const dp = data.faq.uk.find(f => /Скільки коштує доставка/.test(f.q));
    check("«Скільки коштує доставка?» — відповідь із сайту", talk("uk", ["Скільки коштує доставка?"]).text.startsWith(dp.a));
    check("«коли відправите» — термін відправки", faqAnswer("uk", "коли відправите замовлення", /1–2 робочих днів/));
    check("«можна оплатити карткою?»", faqAnswer("uk", "можна оплатити карткою?", /Visa\/Mastercard/));
    check("«це оригінал чи репліка?»", faqAnswer("uk", "це оригінал чи репліка?", /реплік/));
    check("«чи можна приїхати подивитись» — фізичного магазину немає", faqAnswer("uk", "чи можна приїхати подивитись", /тільки з доставкою|самовивозу/));
    check("en: «how much does delivery cost»", faqAnswer("en", "how much does delivery cost", /carrier/));
    check("ru: «сколько стоит доставка»", faqAnswer("ru", "сколько стоит доставка", /перевозчик/));
    check("en: повернення — посилання на чинний український текст",
        /return-warranty/.test(talk("en", ["can I return it?"]).text) && /Ukrainian/.test(talk("en", ["can I return it?"]).text));
    check("у відповіді — посилання на сторінку мовою чату", /https:\/\/bestbrnd4u\.com\/en\/delivery-payment/.test(talk("en", ["how much does delivery cost"]).text));

    const status = talk("uk", ["де моє замовлення 8689484479"]);
    check("стан замовлення — посилання на сторінку перевірки", /\/order-status/.test(status.text));
    check("«покличте менеджера» — передає розмову", talk("uk", ["покличте менеджера"]).handoff === true);
    check("незрозуміле — чесно каже й передає менеджеру", talk("uk", ["яка погода у Києві"]).handoff === true);
    check("привітання — меню-підказки", talk("uk", ["Привіт"]).chips.length >= 4);
}

console.log("\n[4] Коли бот мовчить");
{
    check("власник уже відповів — мовчить",
        talk("uk", ["а чорна є?"], [{ author: "visitor", body: "сумка" }, { author: "owner", body: "Добрий день!" }]) === null);
    check("бот сам передав розмову — далі мовчить",
        talk("uk", ["покличте менеджера", "сумка до 5000"]) === null);
    const off = Object.assign({}, data, { enabled: false });
    check("вимкнений в адмінці — мовчить", bot.botReply("Привіт", [], off, { lang: "uk" }) === null);
}

console.log("\n[5] Формат: сервер пише — клієнт розбирає");
{
    const client = read("assets/js/contact-buttons.js");
    const reSrc = (client.match(/var РЯДОК_ТОВАРУ = (\/.*\/);/) || [])[1];
    const RE = reSrc && new Function(`return ${reSrc}`)();
    check("у клієнті є розбір рядка товару", Boolean(RE));

    ["uk", "en", "ru"].forEach(lang => {
        const r = talk(lang, [lang === "en" ? "women's bag" : lang === "ru" ? "женская сумка" : "жіноча сумка"]);
        const body = bot.serializeBotReply(r, lang);
        const lines = body.split("\n");
        const parsed = lines.map(l => l.match(RE)).filter(Boolean);
        check(`${lang}: кожен товар стає карткою (${parsed.length}/${r.products.length})`, parsed.length === r.products.length && r.products.length > 0);
        check(`${lang}: назва й адреса з картки — ті самі`, parsed.every((m, i) => m[1] === r.products[i].title && m[4] === r.products[i].url));
        check(`${lang}: кнопки — службовим рядком`, /^\[\[chips: .+\]\]$/.test(lines[lines.length - 1]));
    });

    // Товар під замовлення: позначка в дужках не ламає розбір.
    const pre = bot.serializeBotReply({ text: "x", products: [{ title: "Сумка (міні)", price: 5000, url: "https://bestbrnd4u.com/p/a/", preOrder: true }], chips: [] }, "uk");
    const m = pre.split("\n")[1].match(RE);
    check("«під замовлення» і дужки в назві", m && m[1] === "Сумка (міні)" && m[3] === "під замовлення", pre);

    const tg = bot.botTelegramText(bot.serializeBotReply(talk("uk", ["покличте менеджера"]), "uk"), 7, s => s);
    check("у Telegram — без службових рядків, з попередженням про передачу",
        !/\[\[/.test(tg) && /розмова #7/.test(tg) && /передав розмову вам/.test(tg));
    const quiet = bot.botTelegramText(bot.serializeBotReply(talk("uk", ["сумка"]), "uk"), 7, s => s);
    check("звичайна відповідь — без попередження", !/передав розмову/.test(quiet) && !/\[\[/.test(quiet));
}

console.log("\n[6] Кнопки-підказки ведуть туди, куди обіцяють");
{
    // Кнопки порожнього чату — українською в коді; на /en/ і /ru/ їх
    // перекладає i18n.js словником, і бот отримує вже переклад.
    const client = read("assets/js/contact-buttons.js");
    const start = (client.match(/chat-chips-start[\s\S]*?<\/div>/) || [""])[0];
    const labels = [...start.matchAll(/class="chat-chip">([^<]+)</g)].map(m => m[1]);
    check(`у порожньому чаті кнопки є (${labels.length})`, labels.length >= 3);

    const dicts = {};
    ["en", "ru"].forEach(lang => {
        const f = path.join(ROOT, `data/i18n-${lang}.json`);
        if (fs.existsSync(f)) dicts[lang] = Core.createTranslator(JSON.parse(fs.readFileSync(f, "utf8")), lang);
    });
    const expect = { "Підібрати річ": r => /\?|What|Что/.test(r.text) && r.chips.length >= 4, "Доставка": r => /перевізник|carrier|перевозчик/i.test(r.text), "Оплата": r => /Visa/.test(r.text), "Оригінальність": r => /реплік|replica|реплик/i.test(r.text) };
    ["uk", "en", "ru"].forEach(lang => {
        if (lang !== "uk" && !dicts[lang]) return;
        const bad = labels.filter(l => {
            const text = lang === "uk" ? l : dicts[lang](l);
            if (lang !== "uk" && text === l && !["Доставка", "Оплата"].includes(l)) return true;
            const r = bot.botReply(text, [], data, { lang, now: NOW });
            return !r || !(expect[l] ? expect[l](r) : true);
        });
        check(`${lang}: кожна кнопка порожнього чату дає свою відповідь`, bad.length === 0, bad.join(", "));
    });

    // Кнопки, які пропонує сам бот, — теж розпізнаються.
    ["uk", "en", "ru"].forEach(lang => {
        const after = talk(lang, [lang === "en" ? "Pick an item" : lang === "ru" ? "Подобрать вещь" : "Підібрати річ"]);
        const bad = after.chips.filter(chip => { const r = talk(lang, [chip]); return !r || !r.products.length; });
        check(`${lang}: кнопки типів показують товари`, bad.length === 0, bad.join(", "));
        const bag = talk(lang, [after.chips[0]]);
        const budgets = bag.chips.filter(c => /\d/.test(c));
        const badBudget = budgets.filter(chip => { const r = talk(lang, [after.chips[0], chip]); return !r || !r.products.length || !items(r).every(p => p.department === "Сумки"); });
        check(`${lang}: кнопки бюджету уточнюють, а не скидають`, budgets.length >= 2 && badBudget.length === 0, badBudget.join(", "));
    });
}

console.log("\n[7] Підключення");
{
    const src = read("supabase/functions/telegram-order-bot/_index.src.ts");
    check("функція відповідає ботом після збереження й пересилання",
        /const saved = await insertChatMessage\(thread\.id, "visitor"[\s\S]*telegram\("sendMessage"[\s\S]*answerWithBot\(thread, saved, text, body\.lang, cleanChatPage\(body\.page\), clientIp\(request\)\)/.test(src));
    check("бот знає сторінку, з якої написали (а не лише першу в нитці)", /botReply\(text, history, data, \{[^}]*page \}/.test(src));
    check("помилка бота не ламає відповідь сайту", /answerWithBot\(thread, saved, text, body\.lang, cleanChatPage\(body\.page\), clientIp\(request\)\)\.catch\(/.test(src));
    check("відповідь бота повертається сайту в тому ж запиті", /\.\.\.\(bot \? \{ bot \} : \{\}\)/.test(src));
    check("власнику — тихо, гучно лише при передачі", /disable_notification: !reply\.handoff/.test(src));
    check("зібрана функція містить бота", /function botReply/.test(read("supabase/functions/telegram-order-bot/index.ts"))
        && /"chat-bot\.js"/.test(read("scripts/build-edge-function.js")));
    const steps = JSON.parse(read("package.json")).scripts.build.split("&&").map(s => s.trim());
    const at = n => steps.findIndex(s => s.includes(n));
    check("довідка збирається після мовних версій і до версій файлів", at("build-chat-bot") > at("build-locales") && at("build-chat-bot") < at("apply-cache-version"));
    const client = read("assets/js/contact-buttons.js");
    check("сайт надсилає мову сторінки", /site_action: "chat-send",[\s\S]{0,200}lang: \(window\.I18N && window\.I18N\.lang\)/.test(client));
    check("сайт показує відповідь бота одразу", /дані\.bot && дані\.bot\.id[\s\S]{0,80}домалювати\(дані\.bot\)/.test(client));
    check("в адмінці є вимикач", /name: "chatBot"[\s\S]{0,60}widget: "boolean"/.test(read("admin/config.yml")));
}

console.log("\n[8] Питання про товар, на сторінці якого пише людина");
{
    const ask = (lang, product, q, now) => bot.botReply(q, [], data, { lang, now: now || NOW, page: (lang === "uk" ? "" : "/" + lang) + "/p/" + product.slug + "/" });

    const sneaker = data.products.find(p => p.category === "Кросівки" && p.details.variants.some(v => v.sizes.length > 1));
    const sizesInStock = sneaker.details.variants.flatMap(v => v.sizes.filter(s => !s.preOrder).map(s => s.size));
    const r1 = ask("uk", sneaker, "який розмір є?");
    check("«який розмір є?» — саме розміри цього товару в наявності",
        r1 && r1.products.length === 0 && sizesInStock.every(s => r1.text.includes(s)), r1 && r1.text);
    check("en: «what sizes do you have»", /Sizes in stock/.test(ask("en", sneaker, "what sizes do you have").text));

    const bag = data.products.find(p => p.department === "Сумки" && p.details.dimensions.uk && p.details.variants.length > 2);
    const r2 = ask("uk", bag, "які розміри сумки?");
    check("«які розміри сумки?» на сторінці сумки — габарити, а не пошук сумок",
        r2.products.length === 0 && r2.text.includes(bag.details.dimensions.uk), r2.text.slice(0, 80));

    const black = bag.details.variants.filter(v => /чорн/i.test(v.colorUk));
    const r3 = ask("uk", bag, "а чорний є?");
    check("«а чорний є?» — пряма відповідь «так» або «немає»",
        black.length ? /Так, є/.test(r3.text) : /немає/.test(r3.text), r3.text);
    const noRed = data.products.find(p => p.details.variants.length > 1 && !p.details.variants.some(v => /червон/i.test(v.colorUk)));
    check("кольору немає — так і каже й перелічує наявні", /Такого кольору в цієї моделі немає/.test(ask("uk", noRed, "а червоний є?").text));

    const r4 = ask("uk", bag, "з чого зроблена?");
    check("матеріал — з картки", r4.text.includes(bag.details.material.uk), r4.text);

    const sale = data.products.find(p => p.sale && bot.botPriceNow(p, NOW) < p.price) || data.products.find(p => p.oldPrice > p.price);
    if (sale) check("ціна зі знижкою — разом зі старою", /було/.test(ask("uk", sale, "скільки коштує?").text));

    const pre = data.products.find(p => p.preOrder && p.details.preOrderDays.uk);
    if (pre) check("під замовлення — строк із картки", ask("uk", pre, "коли отримаю?").text.includes(pre.details.preOrderDays.uk));
    const inStock = data.products.find(p => !p.preOrder && p.details.variants.every(v => !v.preOrder));
    check("в наявності — строки відправки й доставки", /Відправляємо за 1–2 робочі дні/.test(ask("uk", inStock, "чи є в наявності?").text));

    check("ru: «это оригинал?» — так, з посиланням", /оригинал[\s\S]*\/ru\/authenticity/.test(ask("ru", bag, "это оригинал?").text));

    const watch = data.products.find(p => p.category === "Годинники");
    const r5 = ask("uk", watch, "а сумки Coach є?");
    check("інший тип на сторінці товару — це вже підбір", r5.products.length > 0 && items(r5).every(p => p.department === "Сумки"));

    // Штучний товар без матеріалу: у справжньому каталозі зараз він у
    // всіх є, а перевірка без такого випадку нічого не стереже.
    const blank = Object.assign({}, bag, { slug: "test-no-material",
        details: Object.assign({}, bag.details, { material: { uk: "", en: "", ru: "" } }) });
    const withBlank = Object.assign({}, data, { products: data.products.concat(blank) });
    const r6 = bot.botReply("з якого матеріалу?", [], withBlank, { lang: "uk", now: NOW, page: "/p/test-no-material/" });
    check("чого в картці немає — не вигадує, передає менеджеру", r6 && r6.handoff && /не вказано/.test(r6.text), r6 && r6.text);
}

console.log("\n[9] Автовідповіді власника з адмінки");
{
    const taught = Object.assign({}, data, { answers: [
        { keywords: ["розстроч", "частинами", "рассроч", "installment"], answer: { uk: "Розстрочки поки немає.", en: "", ru: "Рассрочки пока нет." }, link: "" },
        { keywords: ["доставк"], answer: { uk: "Своя відповідь про доставку.", en: "Own delivery answer.", ru: "" }, link: "https://bestbrnd4u.com/delivery-payment" }
    ] });
    const say = (lang, q) => bot.botReply(q, [], taught, { lang, now: NOW });
    check("ключове слово — за початком («розстрочку»)", say("uk", "а можна в розстрочку?").text === "Розстрочки поки немає.");
    check("ru-відповідь для /ru/", say("ru", "есть рассрочка?").text === "Рассрочки пока нет.");
    check("немає відповіді англійською — не українською, а менеджеру",
        say("en", "installment possible?").handoff === true && !/[а-яіїєґ]/i.test(say("en", "installment possible?").text));
    check("відповідь власника перемагає вбудовану (FAQ)", say("uk", "скільки коштує доставка").text.startsWith("Своя відповідь про доставку."));
    check("посилання — окремим рядком", /\nhttps:\/\/bestbrnd4u\.com\/delivery-payment$/.test(say("uk", "доставка").text));

    // Збірка: адмінка пише поля answer/answer_en/answer_ru — довідка їх читає.
    const Build = require("../scripts/build-chat-bot.js");
    const file = path.join(ROOT, "data/chat-answers.json");
    const before = fs.readFileSync(file, "utf8");
    try {
        fs.writeFileSync(file, JSON.stringify({ answers: [{ keywords: "Розстроч, частинами", answer: "Так", answer_en: "Yes", answer_ru: "" }, { keywords: "", answer: "без слів" }] }));
        const built = Build.buildAnswers();
        check("із файлу адмінки: ключові слова через кому, мови окремо, порожні відкинуто",
            built.length === 1 && built[0].keywords.join("|") === "розстроч|частинами" && built[0].answer.en === "Yes" && built[0].answer.ru === "");
    } finally { fs.writeFileSync(file, before); }

    const admin = read("admin/config.yml");
    check("в адмінці є розділ автовідповідей з полями мов",
        /file: "data\/chat-answers\.json"[\s\S]{0,2500}name: "keywords"[\s\S]{0,1200}name: "answer_en"[\s\S]{0,600}name: "answer_ru"/.test(admin));
}

console.log("\n[10] Контакти, промокод, неробочий час, опечатки");
{
    const page = read("contacts.html");
    const c = data.contacts;
    check("контакти — зі сторінки «Контакти»",
        c.phone && page.includes(`tel:${c.phone}`) && c.telegram && page.includes(c.telegram) && c.email && page.includes(`mailto:${c.email}`));
    const r = talk("uk", ["який у вас телефон?"]);
    check("«який у вас телефон?» — усі контакти й графік", r.text.includes(c.phone) && r.text.includes(c.telegram) && /09:00–20:00/.test(r.text));
    check("«можна вам зателефонувати?» — контакти, а не передача", /Телефон:/.test(talk("uk", ["можна вам зателефонувати?"]).text));
    check("промокод — де ввести, без вигаданих кодів", /Маєте промокод/.test(talk("uk", ["де ввести промокод"]).text));

    const night = Date.parse("2026-11-09T23:30:00Z"), day = Date.parse("2026-11-09T10:00:00Z");
    check("Київ: 01:30 — неробочий, 12:00 — робочий", bot.offHours(night) && !bot.offHours(day));
    check("уночі, передаючи розмову, каже «після 09:00»",
        /після 09:00/.test(bot.botReply("покличте менеджера", [], data, { lang: "uk", now: night }).text)
        && !/після 09:00/.test(bot.botReply("покличте менеджера", [], data, { lang: "uk", now: day }).text));

    check("опечатка в бренді: «prda» → Prada", bot.fuzzyBrand("prda bag", data) === "Prada");
    check("«лакосте» → Lacoste", bot.fuzzyBrand("кросівки лакосте", data) === "Lacoste" || (bot.parseWish("кросівки лакосте", data) || {}).brand === "Lacoste");
    check("звичайні слова — не бренди («I love it», «mark», «coat»)",
        !bot.fuzzyBrand("I love it", data) && !bot.fuzzyBrand("mark my words", data) && !bot.fuzzyBrand("a warm coat", data));

    const prada = talk("en", ["prada bag"]);
    const pradaBags = data.products.filter(p => p.brand === "Prada" && p.department === "Сумки");
    if (!pradaBags.length) {
        check("бренду немає в цьому типі — каже прямо й показує інші речі бренду",
            /No bags from Prada/.test(prada.text) && prada.products.length > 0 && items(prada).every(p => p.brand === "Prada"), prada.text);
    }
}

console.log("\n[11] Базові діалоги: живі фрази");
{
    // Корпус живих фраз. До цих правок бот влучав у 17 із 76: «ок»,
    // «👍», «до побачення», «ти бот?» він передавав менеджеру — кожне
    // «дякую» будило власника. Друга половина (з позначкою fresh) —
    // фрази, на яких бот НЕ налаштовувався: перевірка, що він розуміє, а
    // не завчив.
    const intentOf = r => !r ? "silent" : r.intent === "cheaper" ? "cheaper"
        : (r.products && r.products.length) ? "products" : (r.intent || "other");
    const CORPUS = [
        ["uk", "ок", "ack"], ["uk", "добре", "ack"], ["uk", "зрозуміло, дякую", "ack"], ["uk", "👍", "ack"], ["uk", "ясно", "ack"],
        ["ru", "понятно", "ack"], ["ru", "хорошо", "ack"], ["en", "ok thanks", "ack"], ["en", "got it", "ack"],
        ["uk", "дякую за допомогу", "ack"], ["ru", "спасибо большое", "ack"], ["en", "thank you!", "ack"],
        ["uk", "так", "ack"], ["uk", "ні", "ack"], ["en", "no thanks", "ack"], ["uk", "сервіс у вас класний", "ack"],
        ["uk", "до побачення", "bye"], ["uk", "бувайте", "bye"], ["ru", "до свидания", "bye"], ["en", "bye", "bye"], ["uk", "Гарного дня!", "bye"],
        ["uk", "як справи?", "smalltalk"], ["ru", "как дела", "smalltalk"], ["en", "how are you", "smalltalk"],
        ["uk", "ти бот?", "about-bot"], ["uk", "з ким я говорю", "about-bot"], ["ru", "ты робот?", "about-bot"], ["en", "are you a bot?", "about-bot"],
        ["uk", "що ти вмієш?", "about-bot"], ["en", "what can you do", "about-bot"], ["ru", "чем можешь помочь", "about-bot"],
        ["uk", "допоможіть", "about-bot"], ["en", "help", "about-bot"], ["uk", "ти справжня людина?", "about-bot"], ["uk", "з чим ти можеш допомогти?", "about-bot"],
        ["uk", "добрий вечір", "hello"], ["ru", "добрый день", "hello"], ["en", "good morning", "hello"], ["uk", "Вітаю", "hello"],
        ["uk", "як оформити замовлення?", "how-to-order"], ["uk", "як купити?", "how-to-order"], ["ru", "как сделать заказ", "how-to-order"],
        ["en", "how do I order", "how-to-order"], ["uk", "можна без реєстрації?", "how-to-order"], ["uk", "чи треба реєструватись щоб купити", "how-to-order"],
        ["uk", "дорого", "cheaper"], ["uk", "а дешевше є?", "cheaper"], ["ru", "есть дешевле?", "cheaper"], ["en", "anything cheaper?", "cheaper"],
        ["uk", "сайт не працює", "handoff"], ["uk", "не можу оформити замовлення", "handoff"], ["en", "checkout doesn't work", "handoff"],
        ["uk", "я хочу скасувати замовлення", "handoff"], ["en", "I want to cancel my order", "handoff"], ["uk", "передзвоніть мені будь ласка", "handoff"],
        ["uk", "доставляєте за кордон?", "handoff"], ["en", "do you ship to Poland?", "handoff"],
        ["uk", "мені не прийшло замовлення", "status"], ["ru", "где моя посылка", "status"], ["en", "my order hasn't arrived yet", "status"],
        ["uk", "жахливий сервіс", "sorry"], ["uk", "ви мене обманули", "sorry"], ["en", "this is terrible", "sorry"],
        ["uk", "у вас є сумки?", "products"], ["ru", "что есть из сумок", "products"], ["uk", "щось на подарунок дівчині", "products"],
        ["uk", "Доброго ранку! Підкажіть, будь ласка, чи є у вас рюкзаки?", "products"], ["uk", "мені потрібен годинник до 7 тисяч", "products"],
        ["ru", "Привет, есть мужские кошельки?", "products"], ["en", "hello, I'm looking for sunglasses", "products"], ["en", "are your bags real?", "products"],
        ["uk", "Ви є в інстаграмі?", "contacts"], ["uk", "Номер телефону підкажіть", "contacts"]
    ];
    const FAQ_LIKE = [
        ["uk", "скільки днів доставка?"], ["uk", "оплата при отриманні можлива?"], ["uk", "у вас оригінальні речі?"], ["uk", "а можна обміняти?"],
        ["uk", "а що з гарантією?"], ["uk", "дякую, а скільки коштує доставка?"], ["ru", "а это не подделка?"], ["en", "can I pay cash on delivery?"]
    ];
    const missed = CORPUS.filter(([lang, q, want]) => intentOf(bot.botReply(q, [], data, { lang, now: NOW })) !== want)
        .map(([lang, q, want]) => `[${lang}] «${q}» → ${intentOf(bot.botReply(q, [], data, { lang, now: NOW }))} (чекали ${want})`);
    check(`${CORPUS.length} фраз — кожна дає свій намір`, missed.length === 0, missed.slice(0, 4).join(" | "));
    const faqMissed = FAQ_LIKE.filter(([lang, q]) => !/Докладніше|More details|Подробнее/.test((bot.botReply(q, [], data, { lang, now: NOW }) || {}).text || ""));
    check(`${FAQ_LIKE.length} питань — відповідь із сайту з посиланням`, faqMissed.length === 0, faqMissed.map(x => x[1]).join(" | "));

    const pinged = ["ок", "👍", "дякую", "до побачення", "як справи?", "ти бот?", "сервіс у вас класний"].filter(q => bot.botReply(q, [], data, { lang: "uk", now: NOW }).handoff);
    check("«ок», «👍», «дякую»… — не будять власника", pinged.length === 0, pinged.join(", "));
}

console.log("\n[12] Хибні збіги слів");
{
    const w = q => bot.parseWish(q, data) || {};
    check("«жахливий сервіс» — не сірий колір", !w("жахливий сервіс").color);
    check("«більше» — не білий колір", !w("покажіть більше сумок").color);
    check("«синя сумка» — колір, а не «для сина»", w("синя сумка").color === "Син" && !w("синя сумка").gender);
    check("«сумка для сина» — чоловікам", w("сумка для сина").gender === "Чоловікам");
    check("«I'm ready» — не червоний", !w("I'm ready to buy a bag").color);
    check("«manager», «mention» — не «чоловікам»", !w("bag for the manager").gender && !w("bag, as I mention").gender);
    check("«men's watch» — чоловікам", w("men's watch").gender === "Чоловікам");
    check("«high quality bag» — не привітання", talk("en", ["high quality bag"]).intent === "products");
    check("«сумка зі справжньої шкіри» — пошук, а не «оригінальність»", talk("uk", ["сумка зі справжньої шкіри"]).products.length > 0);
    check("«сумка з оригінальної шкіри» — теж пошук, без «так, оригінал»",
        (r => r.products.length > 0 && !/оригінальні — без реплік/.test(r.text))(talk("uk", ["сумка з оригінальної шкіри"])));
    check("«а оригінальні сумки Coach є?» — «так, оригінал» і самі сумки",
        (r => /оригінальні/.test(r.text) && !/^Ні/.test(r.text) && items(r).every(p => p.brand === "Coach"))(talk("uk", ["а оригінальні сумки Coach є?"])));
    check("«дякую, а чорна є?» — питання, а не лише «будь ласка»", talk("uk", ["хочу сумку", "дякую, а чорна є?"]).intent === "products");
}

console.log("\n[13] «Дешевше» в розмові");
{
    const first = talk("uk", ["хочу жіночу сумку"]);
    const cheap = talk("uk", ["хочу жіночу сумку", "дорого"]);
    const minShown = Math.min(...first.products.map(p => p.price));
    check("«дорого» — той самий тип, дешевше за найдешевше показане",
        cheap.intent === "cheaper" && cheap.products.length > 0 && items(cheap).every(p => p.department === "Сумки")
        && cheap.products.every(p => p.price < minShown), cheap.products.map(p => p.price).join(","));
    const floor = talk("uk", ["годинник чоловічий", "а дешевше?", "ще дешевше", "ще дешевше"]);
    check("дешевшого немає — чесно каже, а не показує дорожче", floor.products.length === 0 && /нічого немає/.test(floor.text), floor.text.slice(0, 60));
}

console.log("\n[14] Живі відповіді (побажання власника 09.11.2026)");
{
    // «Привіт» — у відповідь «Привіт», а не абзац про бота.
    check("«привіт» → «Привіт! 👋 Чим можу допомогти?»", /^Привіт! 👋 Чим можу допомогти/.test(talk("uk", ["привіт"]).text), talk("uk", ["привіт"]).text.slice(0, 40));
    check("«Добрий день» → «Добрий день!»", talk("uk", ["Добрий день"]).text.startsWith("Добрий день!"));
    check("«Доброго ранку» → «Доброго ранку!»", talk("uk", ["Доброго ранку"]).text.startsWith("Доброго ранку!"));
    check("ru «Привет» → «Привет!»", talk("ru", ["Привет"]).text.startsWith("Привет!"));
    check("en «hi» → «Hi!»", talk("en", ["hi"]).text.startsWith("Hi!"));
    check("привітання коротке — без абзацу про бота", talk("uk", ["привіт"]).text.length < 220);
    const greetAsk = talk("uk", ["Привіт, хочу чорну сумку"]);
    check("«Привіт, хочу чорну сумку» — «Привіт!» і самі сумки", greetAsk.text.startsWith("Привіт! ") && greetAsk.products.length > 0);

    // «Хочу чорну сумку» — список чорних сумок, заголовок словами людини.
    const black = talk("uk", ["хочу чорну сумку купити, які є"]);
    check("«хочу чорну сумку, які є» — чорні сумки з картками",
        black.products.length > 0 && items(black).every(p => p.department === "Сумки" && p.colors.some(c => /чорн/i.test(c))));
    check("заголовок — «Ось чорні сумки … 👇», а не «Ось що підходить»", /^Ось чорні сумки/.test(black.text) && /👇/.test(black.text), black.text);
    check("правильна форма числа: «22 варіанти», «5 варіантів», «1 варіант»",
        bot.plural(22, ["варіант", "варіанти", "варіантів"], "uk") === "варіанти" && bot.plural(5, ["варіант", "варіанти", "варіантів"], "uk") === "варіантів"
        && bot.plural(11, ["варіант", "варіанти", "варіантів"], "uk") === "варіантів" && bot.plural(21, ["варіант", "варіанти", "варіантів"], "uk") === "варіант");
    check("опис запиту трьома мовами", bot.describeWish({ color: "Чорн", gender: "Жінкам", type: "bags", brand: "Coach", budget: { max: 8000 } }, "uk") === "чорні жіночі сумки Coach до 8 000 ₴"
        && bot.describeWish({ color: "Чорн", gender: "Жінкам", type: "bags", brand: "Coach" }, "en") === "black women's Coach bags"
        && bot.describeWish({ color: "Чорн", type: "bags" }, "ru") === "черные сумки");
    const page2 = talk("uk", ["Жіночі сумки", "Інші варіанти"]);
    check("«Інші варіанти» — «Ще жіночі сумки — 5–8 з …»", /^Ще жіночі сумки — 5–8 з \d+/.test(page2.text), page2.text);

    // Чого в магазині немає — чесно, і що є натомість.
    [["uk", "хочу штани", /^На жаль, штанів у нас зараз немає/], ["ru", "есть брюки?", /^К сожалению, брюк/], ["uk", "шукаю сукню", /суконь/],
        ["en", "do you have jeans?", /^Sorry, we don't have jeans/], ["uk", "парфуми є?", /парфумів/], ["uk", "хочу куртку", /верхнього одягу/], ["uk", "сережки", /прикрас/]]
        .forEach(([lang, q, re]) => {
            const r = talk(lang, [q]);
            check(`«${q}» — немає, і пропонує, що є`, r.intent === "missing" && re.test(r.text) && r.chips.length >= 4 && !r.handoff, r.text.slice(0, 60));
        });
    const heels = talk("uk", ["туфлі на підборах"]);
    check("«туфлі» — «такого взуття немає, але є кросівки» з картками",
        /^Такого взуття у нас зараз немає, але є кросівки/.test(heels.text) && heels.products.length > 0 && items(heels).every(p => p.category === "Кросівки"));
    check("«сумка на довгому ремені» — сумка, а не «ременів немає»", talk("uk", ["сумка на довгому ремені"]).intent === "products");
    check("«поясна сумка» — сумка, а не «поясів немає»", talk("uk", ["поясна сумка"]).intent === "products");
    check("«майкл корс» — бренд, а не «майок немає»", talk("uk", ["годинник майкл корс"]).products.every(p => bySlug.get(p.slug).brand === "Michael Kors") && talk("uk", ["годинник майкл корс"]).products.length > 0);

    // Без типу в запиті словник «чого немає» вже діє — «майкл» не «майка».
    const mk = talk("uk", ["майкл корс"]);
    check("«майкл корс» без типу — товари бренду, а не «майок немає»", mk.intent === "products" && items(mk).every(p => p.brand === "Michael Kors"), mk.text.slice(0, 50));
    const few = talk("uk", ["окуляри Ray-Ban"]);
    const fewTotal = data.products.filter(p => p.brand === "Ray-Ban" && p.category === "Окуляри і оправи").length;
    if (fewTotal <= 4) check("невелика підбірка — «Ось окуляри Ray-Ban, які є зараз 👇»", few.text === "Ось окуляри Ray-Ban, які є зараз 👇", few.text);

    // Ремінь на сторінці сумки.
    const withStrap = data.products.find(p => p.details.strap && p.details.strap.uk);
    const strap = bot.botReply("яка довжина ременя?", [], data, { lang: "uk", now: NOW, page: `/p/${withStrap.slug}/` });
    check("«яка довжина ременя?» на сторінці сумки — з картки", strap.text.includes(withStrap.details.strap.uk), strap.text);
    const strapEn = bot.botReply("how long is the strap?", [], data, { lang: "en", now: NOW, page: `/en/p/${withStrap.slug}/` });
    check("en «how long is the strap?» — лише про ремінь, без «коли отримаю»", /Strap/.test(strapEn.text) && !/We ship/.test(strapEn.text), strapEn.text);
}

console.log("\n[15] Моделі, розміри, сортування, «друга», мова повідомлення");
{
    // Назва моделі.
    const tabby = talk("uk", ["Tabby є?"]);
    check("«Tabby є?» — моделі Tabby", tabby.products.length > 0 && tabby.products.every(p => /tabby/i.test(p.title)) && /^Ось моделі Tabby/.test(tabby.text), tabby.text);
    const snap = talk("en", ["do you have the Marc Jacobs Snapshot"]);
    check("en «Marc Jacobs Snapshot» — саме Snapshot", snap.products.length > 0 && snap.products.every(p => /snapshot/i.test(p.title)));
    check("код моделі «gg0516s»", talk("uk", ["gg0516s"]).products.some(p => /GG0516S/i.test(p.title)));
    const generic = ["gift", "soft", "heart", "lady", "strap", "camera", "denim", "set"].filter(w => bot.findModels(w, data));
    check("звичайні слова з назв — не моделі", generic.length === 0, generic.join(", "));
    check("«a gift» — не модель, а уточнення «для кого»", talk("en", ["a gift"]).intent === "ask");

    // Розмір взуття.
    const s38 = talk("uk", ["кросівки 38 розміру"]);
    const has = (p, size) => p.details.variants.some(v => v.sizes.some(x => x.size === size));
    check("«кросівки 38 розміру» — лише моделі з 38-м", s38.products.length > 0 && items(s38).every(p => has(p, "38")) && /38 розміру/.test(s38.text), s38.text);
    check("«сумка до 38 000» — бюджет, а не розмір", !talk("uk", ["сумка до 38 000"]).text.includes("розміру"));
    const absent = ["46", "45", "44", "43", "42", "41", "40"].find(sz => !data.products.some(p => p.category === "Кросівки" && has(p, sz)));
    if (absent) {
        const no = talk("uk", ["кросівки", `а ${absent}-й є?`]);
        check(`«кросівки» → «а ${absent}-й є?» — немає, і які розміри є (кнопками)`,
            new RegExp(`^${absent}-го розміру зараз немає`).test(no.text) && no.chips.some(c => /розмір/.test(c)), no.text);
    }

    // Помилки в назвах типів.
    [["uk", "кросовки білі", "Кросівки"], ["uk", "годиники чоловічі", "Годинники"], ["uk", "окулари", "Окуляри і оправи"], ["uk", "гаманец", "Гаманці"]]
        .forEach(([lang, q, cat]) => check(`помилка в назві: «${q}»`, (r => r.products.length > 0 && items(r).every(p => p.category === cat)
            // Тип має бути саме ВПІЗНАНИЙ (видно в заголовку), а не
            // випадково збігтися: перші чотири білі речі — і так кросівки.
            && /кросівки|годинники|окуляри|гаманці/.test(r.text))(talk(lang, [q]))));

    // Сортування.
    const cheap = talk("uk", ["найдешевші сумки"]);
    const bagPrices = data.products.filter(p => p.department === "Сумки").map(p => bot.botPriceNow(p, NOW)).sort((a, b) => a - b);
    check("«найдешевші сумки» — від найдешевшої, заголовок «найдоступніші»",
        cheap.products[0].price === bagPrices[0] && /найдоступніші сумки/.test(cheap.text));
    const pricey = talk("uk", ["найдорожчі годинники"]);
    const watchMax = Math.max(...data.products.filter(p => p.category === "Годинники").map(p => bot.botPriceNow(p, NOW)));
    check("«найдорожчі годинники» — від найдорожчого", pricey.products[0].price === watchMax);

    // Діапазон цін і кількість.
    const range = talk("uk", ["скільки коштують годинники?"]);
    const wp = data.products.filter(p => p.category === "Годинники").map(p => bot.botPriceNow(p, NOW)).sort((a, b) => a - b);
    check("«скільки коштують годинники?» — від найдешевшого до найдорожчого",
        range.text.includes(bot.botPriceNow({ price: wp[0] }).toLocaleString("uk-UA").replace(/ | /g, " ")) && /до .*₴/.test(range.text) && range.products.length > 0, range.text);
    const count = talk("uk", ["скільки у вас сумок?"]);
    check("«скільки у вас сумок?» — число", count.text.includes(String(data.products.filter(p => p.department === "Сумки").length)), count.text);
    check("«скільки коштує доставка?» — як і раніше, доставка", talk("uk", ["скільки коштує доставка?"]).intent === "faq");

    // Широкий запит — уточнення «для кого».
    check("«сумка» (48 варіантів) — кнопки «Жіночі / Чоловічі сумки»", (r => r.chips.includes("Жіночі сумки") && r.chips.includes("Чоловічі сумки"))(talk("uk", ["сумка"])));

    // Схожі на сторінці товару.
    const bag = data.products.find(p => p.department === "Сумки");
    const sim = bot.botReply("покажи схожі", [], data, { lang: "uk", now: NOW, page: `/p/${bag.slug}/` });
    check("«покажи схожі» — той самий розділ, без самого товару, ціна ±35 %",
        sim.products.length > 0 && items(sim).every(p => p.category === bag.category && p.slug !== bag.slug
            && Math.abs(bot.botPriceNow(p, NOW) - bot.botPriceNow(bag, NOW)) <= bot.botPriceNow(bag, NOW) * 0.35));

    // «Друга», «перша» — товар з останньої підбірки.
    const list0 = talk("uk", ["жіноча сумка до 9000"]);
    const second = talk("uk", ["жіноча сумка до 9000", "скільки коштує друга?"]);
    check("«скільки коштує друга?» — ціна саме другої картки й посилання на неї",
        second.intent === "product" && second.text.includes(list0.products[1].url) && second.text.includes(list0.products[1].price.toLocaleString("uk-UA").replace(/ | /g, " ")), second.text);
    check("«подарунок другу» — це не «другий товар», а подарунок чоловікові", talk("uk", ["жіноча сумка", "подарунок другу"]).intent === "products"
        && bot.parseWish("подарунок другу", data).gender === "Чоловікам");
    check("ru «есть другой цвет?» — не «другий товар»", bot.ordinalOf("есть другой цвет?") === null);
    check("«додайте в кошик» — як це зробити самому", /«Купити»/.test(talk("uk", ["додайте в кошик"]).text));
    check("«відкладіть для мене» — передає менеджеру", talk("uk", ["відкладіть для мене"]).handoff === true);
    check("«подарунок» без деталей — уточнення, а не 103 речі", (r => r.intent === "ask" && r.products.length === 0 && r.chips.length >= 4)(talk("uk", ["подарунок"])));

    // Мова повідомлення важливіша за мову сторінки.
    const ruOnUk = bot.botReply("хочу черную сумку", [], data, { lang: "uk", now: NOW });
    check("російською на українській сторінці — відповідь російською, посилання на /ru/",
        /^Вот черные сумки/.test(ruOnUk.text) && ruOnUk.products.every(p => /\/ru\/p\//.test(p.url)), ruOnUk.text);
    const enOnUk = bot.botReply("do you have black bags?", [], data, { lang: "uk", now: NOW });
    check("англійською на українській — англійською", /^Here are the black bags/.test(enOnUk.text));
    check("назва бренду латиницею — не англійська мова", bot.detectLang("Coach", "uk") === "uk" && bot.detectLang("Michael Kors", "ru") === "ru");
    check("«привіт» на /ru/ — українською", bot.detectLang("привіт, є чорні сумки?", "ru") === "uk");
}

console.log("\n[16] Матеріал, фасон, порівняння, «є хтось», телефон, торг");
{
    // Матеріал: шкіра — основний матеріал, а не оздоблення канвасу.
    const leather = talk("uk", ["сумка з натуральної шкіри"]);
    const mat = p => p.details.material.uk;
    check("«з натуральної шкіри» — лише шкіряні, без канвасу й екошкіри",
        leather.products.length > 0 && items(leather).every(p => /шкір/i.test(mat(p)) && !/веган|еко|поліуретан|штучн/i.test(mat(p)) && !/^(фірмов|монограмн)/i.test(mat(p))),
        items(leather).map(mat).join(" | "));
    // Уся підбірка, а не перші чотири: вони й так шкіряні за сортуванням,
    // і канвас із шкіряним оздобленням ховався б далі.
    const lw = bot.parseWish("сумка з натуральної шкіри", data);
    const allLeather = [];
    for (let o = 0; o < 200; o += 4) {
        const page = bot.pickProducts(lw, data, NOW, o);
        if (page.start !== o) break;
        allLeather.push(...page.items);
    }
    const fake = allLeather.filter(p => /^(фірмов|монограмн)/i.test(mat(p)) || /веган|еко|поліуретан/i.test(mat(p)));
    check(`уся підбірка «з натуральної шкіри» (${allLeather.length}) — без канвасу й екошкіри`, allLeather.length > 4 && fake.length === 0, fake.map(mat).join(" | "));
    const vegan = talk("uk", ["веганська сумка"]);
    check("«веганська сумка» — екошкіра", vegan.products.length > 0 && items(vegan).every(p => /веган|еко|поліуретан/i.test(mat(p))));

    // Фасон.
    const cross = talk("uk", ["крос-боді чорна"]);
    check("«крос-боді чорна» — «Ось чорні сумки крос-боді», лише крос-боді",
        /^Ось чорні сумки крос-боді/.test(cross.text) && items(cross).every(p => /crossbody|cross-body|крос-боді|кросбоді/i.test([p.title.uk, p.title.en, p.keywords].join(" "))), cross.text);
    check("«шопер» — «Ось шопери»", /^Ось шопери/.test(talk("uk", ["шопер"]).text));
    const noBackpack = !data.products.some(p => /backpack|рюкзак/i.test(p.title.uk + p.title.en + p.keywords));
    if (noBackpack) check("«рюкзак» — «Рюкзаків зараз немає» і інші сумки", (r => /^Рюкзаків зараз немає/.test(r.text) && r.products.length > 0)(talk("uk", ["рюкзак"])));

    // Порівняння двох брендів.
    const cmp = talk("uk", ["що краще Coach чи Michael Kors?"]);
    check("«Coach чи Michael Kors?» — обидва бренди, сумки, без «кращий»",
        cmp.products.length === 4 && items(cmp).filter(p => p.brand === "Coach").length === 2 && items(cmp).filter(p => p.brand === "Michael Kors").length === 2
        && items(cmp).every(p => p.department === "Сумки") && /вибір за смаком/.test(cmp.text));

    // Короткі репліки.
    check("«є хтось?» — «Так, я тут!»", /^Так, я тут/.test(talk("uk", ["є хтось?"]).text));
    check("«ти мене не розумієш» — вибачитись і передати людині", (r => r.handoff && /Вибачте/.test(r.text))(talk("uk", ["ти мене не розумієш"])));

    // Телефон — дзвінок, а не номер замовлення.
    const phone = talk("uk", ["мій номер 067 123 45 67, передзвоніть"]);
    check("телефон у повідомленні — «менеджер передзвонить»", phone.handoff && /передзвонить/.test(phone.text), phone.text);
    check("«+380501234567» — теж телефон", /передзвонить/.test(talk("uk", ["+380501234567"]).text));
    check("номер замовлення (з 8, а не 0) — як і раніше, стан замовлення", talk("uk", ["де моє замовлення 8689484479"]).intent === "status");

    // Що вирішує лише людина.
    [["uk", "дайте знижку", /Персональну знижку/], ["uk", "можна більше фото цієї сумки?", /фото/], ["uk", "оптом можна?", /опт/], ["uk", "коли буде поповнення?", /поповнення/]]
        .forEach(([lang, q, re]) => check(`«${q}» — менеджеру з поясненням`, (r => r.handoff && re.test(r.text))(talk(lang, [q]))));
    check("«а знижки є?» — як і раніше, товари зі знижкою (не торг)", talk("uk", ["а знижки є?"]).intent === "products");
    check("«фото з відгуків» — не прохання надіслати фото", !/Додаткові фото/.test(talk("uk", ["фото з відгуків"]).text));
    check("«працюєте в неділю?» — так, щодня", /без вихідних/.test(talk("uk", ["ви працюєте у неділю?"]).text));

    // Примірка, «де ви», таблиця розмірів.
    check("«можна приміряти?» — з розділу про огляд", talk("uk", ["можна приміряти?"]).intent === "faq");
    check("ru «можно примерить?»", talk("ru", ["можно примерить?"]).intent === "faq");
    check("«де ви знаходитесь?» — без «Ні,» на початку", (r => r.intent === "faq" && !/^Ні/.test(r.text))(talk("uk", ["де ви знаходитесь?"])));
    check("«як підібрати розмір?» — про «Таблицю розмірів»", /Таблиця розмірів/.test(talk("uk", ["як підібрати розмір?"]).text));
}

console.log("\n[17] Стан замовлення в чаті; кнопки під сторінку товару; «бот друкує»");
{
    // Номер І телефон — бот перевіряє сам.
    const both = bot.extractLookup("замовлення 8689484479, телефон 067 123 45 67");
    check("номер і телефон з одного повідомлення", both && both.orderNumber === "8689484479" && both.phone === "0671234567", JSON.stringify(both));
    check("+380 теж телефон", (bot.extractLookup("8689484479 +380671234567") || {}).phone === "+380671234567");
    check("лише телефон — не перевірка, а дзвінок", bot.extractLookup("мій номер 067 123 45 67") === null && talk("uk", ["мій номер 067 123 45 67"]).intent === "handoff");
    check("лише номер — посилання на сторінку перевірки", bot.extractLookup("де моє замовлення 8689484479") === null && talk("uk", ["де моє замовлення 8689484479"]).intent === "status");
    check("номер і телефон — позначка для функції", talk("uk", ["замовлення 8689484479, телефон 0671234567"]).intent === "lookup");

    const OL = require("../supabase/functions/telegram-order-bot/order-lookup.js");
    const view = OL.publicOrderView({ order_number: "8689484479", status: "shipped", tracking_number: "20450000000000", phone: "+380671234567", items: [] });
    const uk = bot.lookupReplyText(view, "uk");
    check("стан — тими самими словами, що на сторінці «Де моє замовлення»", uk.includes(OL.LOOKUP_STATUS.shipped.label) && uk.includes(OL.LOOKUP_STATUS.shipped.note), uk);
    check("номер накладної — у відповіді", uk.includes("20450000000000"));
    check("en і ru — перекладено", /Handed over for delivery/.test(bot.lookupReplyText(view, "en")) && /Передан в доставку/.test(bot.lookupReplyText(view, "ru")));
    check("для кожного стану є переклад", Object.keys(OL.LOOKUP_STATUS).every(k => !/[іїєґ]/i.test(bot.lookupReplyText(OL.publicOrderView({ order_number: "1", status: k, items: [] }), "ru"))));
    check("не знайдено — підказка, де взяти номер і телефон", /Не знайшов/.test(bot.lookupReplyText(null, "uk")));

    const src = read("supabase/functions/telegram-order-bot/_index.src.ts");
    check("функція перевіряє ТІЄЮ САМОЮ дорогою: ліміт, номер + телефон",
        /reply\.lookup[\s\S]{0,400}cleanLookup\([\s\S]{0,200}lookupAllowed\(ip\)[\s\S]{0,200}findOrderByNumber\([\s\S]{0,200}phoneMatches\(order\.phone, clean\.phone\)/.test(src));
    check("IP для ліміту передається з запиту", /answerWithBot\(thread, saved, text, body\.lang, cleanChatPage\(body\.page\), clientIp\(request\)\)/.test(src));
    check("відповідь записується мовою відповіді, а не сторінки", /serializeBotReply\(reply, reply\.lang \|\| botLang\(lang\)\)/.test(src));
    check("мова відповіді — у самій відповіді", bot.botReply("хочу черную сумку", [], data, { lang: "uk" }).lang === "ru");

    // Кнопки під сторінку товару й «бот друкує».
    const client = read("assets/js/contact-buttons.js");
    check("на сторінці товару — кнопки про цей товар", /\/p\\\/\[\^\/\]\+\\\/\?\$\/\.test\(location\.pathname\)[\s\S]{0,200}Є в наявності\?[\s\S]{0,200}Які кольори\?[\s\S]{0,200}Покажи схожі/.test(client));
    check("«бот друкує» — показ до запиту й прибирання після", /chat-typing[\s\S]{0,900}site_action: "chat-send"[\s\S]{0,600}друкує\.remove\(\)/.test(client));
    const strings = JSON.parse(read("data/i18n/strings.json"));
    check("кнопки сторінки товару перекладені (інакше бот відповів би українською)",
        ["Є в наявності?", "Які кольори?", "Покажи схожі", "Бот друкує…"].every(k => strings[k] && strings[k].en && strings[k].ru));
    const p = data.products.find(x => x.department === "Сумки" && x.details.variants.length > 1);
    [["uk", ["Є в наявності?", "Які кольори?"]], ["en", [strings["Є в наявності?"].en, strings["Які кольори?"].en]], ["ru", [strings["Є в наявності?"].ru, strings["Які кольори?"].ru]]]
        .forEach(([lang, qs]) => qs.forEach(q => {
            const r = bot.botReply(q, [], data, { lang, now: NOW, page: (lang === "uk" ? "" : "/" + lang) + "/p/" + p.slug + "/" });
            check(`${lang}: кнопка «${q}» — відповідь про товар його мовою`, r.intent === "product" && r.lang === lang, r.text.slice(0, 50));
        }));
    const sim = bot.botReply(strings["Покажи схожі"].en, [], data, { lang: "en", now: NOW, page: "/en/p/" + p.slug + "/" });
    check("en: «Show similar» — схожі товари англійською", sim.products.length > 0 && sim.lang === "en");
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
