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
        /const saved = await insertChatMessage\(thread\.id, "visitor"[\s\S]*telegram\("sendMessage"[\s\S]*answerWithBot\(thread, saved, text, body\.lang, cleanChatPage\(body\.page\)\)/.test(src));
    check("бот знає сторінку, з якої написали (а не лише першу в нитці)", /botReply\(text, history, data, \{[^}]*page \}/.test(src));
    check("помилка бота не ламає відповідь сайту", /answerWithBot\(thread, saved, text, body\.lang, cleanChatPage\(body\.page\)\)\.catch\(/.test(src));
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

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
