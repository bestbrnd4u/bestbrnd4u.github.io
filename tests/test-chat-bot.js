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

console.log("\n[18] Оригінальність без «Ні», кілька питань, розмова про одну річ");
{
    // ЗНАЙДЕНО 09.11.2026. Відповідь із сайту — на «Чи продаєте ви
    // репліки?» — починається з «Ні.». На «це оригінал?» вона читалась
    // як «ні, не оригінал». Бот так відповідав від першого дня.
    [["uk", "це оригінал?"], ["uk", "це оригінал чи репліка?"], ["uk", "у вас оригінальні речі?"], ["en", "is it original?"], ["ru", "это оригинал?"], ["en", "are they authentic?"]]
        .forEach(([lang, q]) => {
            const r = talk(lang, [q]);
            // Не \b: у JavaScript він бачить межу слова лише для латиниці.
            check(`«${q}» — «так», а не «ні»`, !/^(Ні|No|Нет)[,.\s]/.test(r.text) && /^(Так|Yes|Да)[,.\s]/.test(r.text), r.text.slice(0, 50));
        });
    check("«ви продаєте підробки?» — «Ні»", /^Ні\./.test(talk("uk", ["ви продаєте підробки?"]).text));
    check("en «do you sell replicas?» — «No»", /^No\./.test(talk("en", ["do you sell replicas?"]).text));

    // Кілька питань в одному повідомленні.
    const two = talk("uk", ["скільки коштує доставка і чи можна оплатити при отриманні?"]);
    const dCost = data.faq.uk.find(f => /Скільки коштує доставка/.test(f.q)).a;
    const pay = data.faq.uk.find(f => /оплатити карткою/.test(f.q)).a;
    check("два питання — дві відповіді з сайту", two.text.includes(dCost) && two.text.includes(pay), two.text.slice(0, 80));
    check("посилання на ту саму сторінку — один раз", (two.text.match(/delivery-payment/g) || []).length === 1);
    const order = talk("uk", ["це оригінал? і як швидко відправите?"]);
    check("відповіді — у порядку питань", order.text.indexOf("оригінальні") < order.text.indexOf("1–2 робочих днів") && order.text.indexOf("оригінальні") >= 0, order.text.slice(0, 60));
    check("одне питання — як і раніше, одна відповідь", talk("uk", ["скільки коштує доставка?"]).text.split("\n\n").length === 1);

    // Розмова про одну річ.
    const chain = ["кросівки", "розкажіть про другу", "а розміри?", "з чого вони?"];
    const shoes = talk("uk", ["кросівки"]);
    const second = bySlug.get(shoes.products[1].slug);
    const sizes = talk("uk", chain.slice(0, 3));
    const mat2 = talk("uk", chain);
    check("«розкажіть про другу» → «а розміри?» — розміри саме її", sizes.intent === "product" && sizes.text.includes(second.title.uk), sizes.text.slice(0, 70));
    check("→ «з чого вони?» — матеріал тієї ж речі", mat2.text.includes(second.details.material.uk.slice(0, 20)), mat2.text.slice(0, 70));
    const reset = talk("uk", ["кросівки", "розкажіть про другу", "годинник", "а розміри?"]);
    check("після нової підбірки «а розміри?» вже не про ту річ — «про яку з них?»", reset.intent === "ask" && /Про яку з них/.test(reset.text), reset.text.slice(0, 50));
    const which = talk("uk", ["сумка Coach", "а розміри?"]);
    check("«про яку з них?» — кнопки «Розкажіть про першу…»", which.chips.length === 4 && /першу/.test(which.chips[0]));
    const picked = talk("uk", ["сумка Coach", "а розміри?", which.chips[1]]);
    check("кнопка «Розкажіть про другу» — друга картка", picked.intent === "product" && picked.text.includes(talk("uk", ["сумка Coach"]).products[1].url));
    check("«а чорна є?» після підбірки — уточнення підбірки, а не «про яку»", talk("uk", ["сумка Coach", "а чорна є?"]).intent === "products");

    // Підказка власнику.
    const unknownBody = bot.serializeBotReply(talk("uk", ["яка погода"]), "uk");
    check("не зрозумів — власнику підказка «навчіть бота»", /Автовідповіді бота в чаті/.test(bot.botTelegramText(unknownBody, 1, s => s)));
    check("звичайна відповідь — без підказки", !/Автовідповіді/.test(bot.botTelegramText(bot.serializeBotReply(talk("uk", ["сумка"]), "uk"), 1, s => s)));
}

console.log("\n[19] «Так/ні» лише на «чи…?», «?», знижка на цю річ, порада");
{
    // 10 відповідей кожною мовою з сайту починаються з «Так.»/«Ні.» —
    // доречно лише на питання «так чи ні».
    const starts = (lang, q) => talk(lang, [q]).text.slice(0, 6);
    [["uk", "як оплатити?"], ["uk", "які способи оплати?"], ["uk", "оплата"], ["en", "how can I pay?"], ["ru", "как оплатить?"]]
        .forEach(([lang, q]) => check(`«${q}» — без «Так.» на початку`, !/^(Так|Yes|Да)[.,]/.test(starts(lang, q)), starts(lang, q)));
    [["uk", "чи можна оплатити карткою?"], ["uk", "можна оплатити карткою?"], ["en", "can I pay by card?"], ["ru", "можно оплатить картой?"]]
        .forEach(([lang, q]) => check(`«${q}» — з «Так»`, /^(Так|Yes|Да)[.,]/.test(starts(lang, q)), starts(lang, q)));
    check("«ви продаєте підробки?» (без «чи», але зі знаком питання) — «Ні»", /^Ні\./.test(talk("uk", ["ви продаєте підробки?"]).text));
    const mixed = talk("uk", ["скільки коштує доставка і чи можна оплатити при отриманні?"]).text;
    check("у двох питаннях «так/ні» — окремо для кожного: друге з «Так.»", /\n\nТак\./.test(mixed) && !/^Так/.test(mixed), mixed.slice(0, 40));

    // «?» сам по собі.
    check("«?» — «Так, я тут!», а не «Добре»", /^Так, я тут/.test(talk("uk", ["?"]).text));
    check("«👍» — як і раніше, «Добре»", /^Добре/.test(talk("uk", ["👍"]).text));

    // Знижка на річ зі сторінки.
    const onSale = data.products.find(p => (p.oldPrice || 0) > bot.botPriceNow(p, NOW));
    const noSale = data.products.find(p => !p.oldPrice && !p.sale);
    const ask = (p, q, lang) => bot.botReply(q, [], data, { lang: lang || "uk", now: NOW, page: `${lang && lang !== "uk" ? "/" + lang : ""}/p/${p.slug}/` });
    if (onSale) {
        const r = ask(onSale, "є знижка?");
        const pct = Math.round((1 - bot.botPriceNow(onSale, NOW) / onSale.oldPrice) * 100);
        check("«є знижка?» на сторінці товару зі знижкою — відсоток і стара ціна", r.intent === "product" && r.text.includes(`${pct} %`) && /замість/.test(r.text), r.text);
        check("en «is it on sale?»", /% off right now/.test(ask(onSale, "is it on sale?", "en").text));
    }
    if (noSale) check("без знижки — «знижки немає», ціна й посилання на акції", /знижки немає[\s\S]*aktsii/.test(ask(noSale, "є знижка?").text));
    check("поза сторінкою «а знижки є?» — як і раніше, товари зі знижкою", talk("uk", ["а знижки є?"]).intent === "products");

    // Порада.
    const rec = talk("uk", ["що порадите?"]);
    const hot = data.products.filter(p => p.badge === "HOT");
    check("«що порадите?» — заголовок поради", /^Ось що радимо зараз — хіти, новинки й знижки/.test(rec.text), rec.text);
    if (hot.length) check("…і першою — річ із позначкою HOT", bySlug.get(rec.products[0].slug).badge === "HOT");
    const recW = talk("uk", ["що популярне з годинників?"]);
    check("«що популярне з годинників?» — «Годинники: ось що радимо…», лише годинники",
        /^Годинники: ось що радимо/.test(recW.text) && items(recW).every(p => p.category === "Годинники"), recW.text);
    check("порада без вигаданого «найпопулярніше»", !/найпопулярніш|бестселер|хіт продажів/i.test(rec.text));
    check("«порадьте сумку до 8000» — українською (спільне слово «сумку» не робить її російською)",
        talk("uk", ["порадьте сумку до 8000"]).lang === "uk" && bot.detectLang("порадьте сумку", "uk") === "uk");
    check("довідка знає позначку товару", data.products.every(p => typeof p.badge === "string"));
}

console.log("\n[20] Проба з 40 живих повідомлень (10.11.2026)");
{
    // Розстрочки на сайті немає — «так» з відповіді про картку було б
    // неправдою. Бот відповідав саме так, бо зачепився за «оплатити».
    const inst = talk("uk", ["А можна оплатити частинами?"]);
    check("«оплатити частинами?» — не «так», а менеджеру", inst.handoff && !/^Так/.test(inst.text) && /частинами/.test(inst.text), inst.text.slice(0, 50));
    check("«Can I pay by credit card?» — оплата карткою, не розстрочка", /^Yes\./.test(talk("en", ["Can I pay by credit card?"]).text));
    check("ваша автовідповідь про розстрочку — важливіша за вбудовану", (() => {
        const taught = Object.assign({}, data, { answers: [{ keywords: ["розстроч", "частинами"], answer: { uk: "Є розстрочка від банку.", en: "", ru: "" }, link: "" }] });
        return bot.botReply("можна оплатити частинами?", [], taught, { lang: "uk", now: NOW }).text === "Є розстрочка від банку.";
    })());

    // «Посилка» сама по собі — не «де моя посилка».
    check("«Як довго йде посилка до Харкова?» — строки доставки, а не стан замовлення",
        (r => r.intent === "faq" && /1–2 робочих днів/.test(r.text) && !r.handoff)(talk("uk", ["Як довго йде посилка до Харкова?"])));
    check("«де моя посилка?» — як і раніше, стан замовлення", talk("uk", ["де моя посилка?"]).intent === "status");
    check("en «How long does delivery take?» — одна відповідь, без зайвої про вартість", talk("en", ["How long does delivery take?"]).text.split("\n\n").length === 1);

    check("«Що у вас з новинок?» — новинки", (r => r.products.length > 0 && items(r).every(p => p.isNew))(talk("uk", ["Що у вас з новинок?"])));
    check("«скільки чекати під замовлення?» — строк на сторінці кожної речі", /Строк під замовлення/.test(talk("uk", ["Скільки часу займає доставка під замовлення?"]).text));
    check("«де подивитися відгуки?» — на сторінці товару", /Відгуки — внизу сторінки/.test(talk("uk", ["А де у вас можна подивитися відгуки?"]).text));
    check("«питання щодо замовлення» — що надіслати", /номер замовлення й телефон/.test(talk("uk", ["А в мене питання щодо замовлення"]).text));
    check("«коли зателефонуєте?» — менеджер звʼяжеться, передано", (r => r.handoff && /звʼяжеться/.test(r.text))(talk("uk", ["Я оформила замовлення, коли зателефонуєте?"])));
    check("«ці годинники водонепроникні?» — не підбірка, а менеджеру", (r => r.handoff && r.products.length === 0)(talk("uk", ["Скажіть будь ласка, ці годинники водонепроникні?"])));
    check("«Дуже гарні сумки у вас!» — подяка, а не підбірка", talk("uk", ["Дуже гарні сумки у вас!"]).intent === "ack");
    check("«Гарного дня!» — прощання, а не комплімент", talk("uk", ["Гарного дня!"]).intent === "bye");
    check("en «real leather» — «leather bags», не «bags leather»", /the leather bags/.test(talk("en", ["Is this bag real leather?"]).text));
}

console.log("\n[21] Цілі розмови (10.11.2026)");
{
    // Розмова з історією так, як її бачить функція: після кожної відповіді
    // перевіряє botShouldStay — бот, що «замовк», далі не відповідає.
    const chat = (lang, messages) => {
        const history = [];
        return messages.map(m => {
            const r = bot.botShouldStay(history) ? bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com" }) : null;
            history.push({ author: "visitor", body: m });
            if (r) history.push({ author: "bot", body: bot.serializeBotReply(r, r.lang || lang) });
            return r;
        });
    };

    // Покликати власника ≠ замовкнути. Раніше після «не зрозумів» бот
    // мовчав до відповіді власника, і наступне питання лишалось без відповіді.
    // Старий бот на цих розмовах повертає null — перевірка має дати ✗, а не впасти.
    const none = { text: "", products: [], intent: null };
    const say = (lang, msgs) => talk(lang, msgs) || none;
    const [unk0, after] = chat("uk", ["фывапролд жэ", "скільки коштує доставка?"]);
    const unk = unk0 || none;
    check("незрозуміле — власника покликано, але бот не замовк", unk.handoff && unk.pause === false
        && bot.serializeBotReply(unk, "uk").includes("[[notify]]") && !bot.serializeBotReply(unk, "uk").includes("[[handoff]]"));
    check("…і на наступне питання відповідає", after && after.intent === "faq", after && after.intent);
    check("Telegram: «Потрібна ваша відповідь — бот і далі відповідає»",
        /Потрібна ваша відповідь/.test(bot.botTelegramText(bot.serializeBotReply(unk, "uk"), 1)));
    const [human0, silent] = chat("uk", ["покличте менеджера", "а доставка скільки?"]);
    const human = human0 || none;
    check("«покличте менеджера» — передано, далі бот мовчить", human.handoff && bot.serializeBotReply(human, "uk").includes("[[handoff]]") && silent === null);
    check("скарга — теж мовчить після", chat("uk", ["жахливо, мене обманули", "ну?"])[1] === null);
    check("«в кредит?» — кличе власника, але бот і далі відповідає", chat("uk", ["можна оплатити частинами?", "а доставка?"])[1] !== null);

    const metal = say("uk", ["хочу годинник чоловіку", "а з металевим браслетом?"]);
    check("«а з металевим браслетом?» — лише годинники на браслеті",
        metal.products.length > 0 && items(metal).every(p => p.category === "Годинники")
        && /металевому браслеті/.test(metal.text), metal.text.slice(0, 80));

    const fresh = say("uk", ["що нового?"]);
    check("«що нового?» — новинки", fresh.products.length > 0 && items(fresh).every(p => p.isNew), fresh.text.slice(0, 60));
    const saleNew = say("uk", ["що нового?", "а зі знижкою?"]);
    check("«а зі знижкою?» після новинок — новинки зі знижкою",
        /новинки зі знижкою/.test(saleNew.text) && saleNew.products.length > 0, saleNew.text.slice(0, 70));
    const cheapNew = say("uk", ["що нового?", "а зі знижкою?", "найдешевші"]);
    check("«найдешевші» далі — та сама підбірка, відсортована", /найдоступніші новинки зі знижкою/.test(cheapNew.text), cheapNew.text.slice(0, 70));

    // Показано одну — «друга» це вона ж; показано дві — «четверта» перепитує.
    const one = data.products.find(p => p.slug);
    const shownOne = [{ author: "visitor", body: "покажи" }, { author: "bot", body: `Ось 👇\n• ${one.title.uk} — 1 000 ₴ https://bestbrnd4u.com/p/${one.slug}/` }];
    const second = bot.botReply("скільки коштує друга?", shownOne, data, { lang: "uk", now: NOW }) || none;
    check("«друга», а показано одну — про неї", second.intent === "product" && second.text.includes(`/p/${one.slug}/`), second.text.slice(0, 60));

    const prada = say("uk", ["є сумки Prada?", "а що є від Prada?"]);
    check("«а що є від Prada?» — усе від Prada, не лише сумки", prada.products.length > 0
        && items(prada).every(p => /prada/i.test(p.brand)) && !/сумк|сумок/i.test(prada.text.split("\n")[0]), prada.text.slice(0, 70));

    // «Покажіть ще», коли більше немає: чесно «це всі», а не те саме вдруге.
    const few = (() => {
        const counts = {};
        data.products.forEach(p => { counts[p.brand] = (counts[p.brand] || 0) + 1; });
        return Object.keys(counts).find(b => counts[b] >= 2 && counts[b] <= 4);
    })();
    if (few) {
        const more = say("uk", [few, "покажіть ще"]);
        check(`«покажіть ще» після всіх ${few} — «Це всі», без повтору`, /^Це всі/.test(more.text) && more.products.length === 0, more.text.slice(0, 70));
    } else check("є бренд із 2–4 речами для перевірки «ще»", false);
}

console.log("\n[22] Друга й третя проба розмовами (10.11.2026)");
{
    const none = { text: "", products: [], intent: null };
    const say = (lang, msgs, page) => {
        const history = [];
        let last = null;
        msgs.forEach(m => {
            last = bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com", page: page || "" });
            history.push({ author: "visitor", body: m });
            if (last) history.push({ author: "bot", body: bot.serializeBotReply(last, last.lang || lang) });
        });
        return last || none;
    };
    const brands = new Set(data.products.map(p => p.brand.toLowerCase()));

    // Бренди поза каталогом: чесно «немає» + байєр-сервіс, власник покликаний,
    // бот не замовкає. Раніше — «Що саме шукаєте?» або чужі гаманці мовчки.
    if (!brands.has("louis vuitton")) {
        const lv = say("uk", ["у вас є Louis Vuitton?"]);
        check("«є Louis Vuitton?» — «немає», байєр-сервіс, бренди в наявності, бот не замовк",
            lv.intent === "other-brand" && /^Louis Vuitton у нас зараз немає/.test(lv.text) && /bayer-service/.test(lv.text)
            && lv.handoff && lv.pause === false && data.products.some(p => lv.text.includes(p.brand)), lv.text.slice(0, 60));
    }
    if (!brands.has("guess")) {
        const gw = say("uk", ["шукаю щось від Guess", "а гаманці Guess?"]);
        check("«а гаманці Guess?» — гаманці інших брендів і прямо «Guess немає»",
            /^Guess у нас зараз немає/.test(gw.text) && gw.products.length > 0 && items(gw).every(p => p.category === "Гаманці"), gw.text.slice(0, 60));
    }
    check("«найкращий годинник» — не Nike; «що є зараз зі знижкою?» — не Zara; «I guess the black one» — не Guess",
        say("uk", ["найкращий годинник"]).intent === "products" && say("uk", ["що є зараз зі знижкою?"]).intent === "products"
        && say("en", ["black Coach bag", "I guess the black one"]).intent !== "other-brand");
    check("«а що є з люксу?» — перелік брендів у наявності", (r => r.intent === "brands" && data.products.every(p => r.text.includes(p.brand)))(say("uk", ["а що є з люксу?"])));

    // Стать, якої в розділі немає зовсім.
    const menSneakers = data.products.some(p => p.category === "Кросівки" && (p.gender || []).includes("Чоловікам"));
    if (!menSneakers) {
        const ms = say("ru", ["есть мужские кроссовки 43?"]);
        check("ru «мужские кроссовки 43?» — «есть только женские — мужских кроссовок нет»", /только женские — мужских кроссовок нет/.test(ms.text), ms.text.slice(0, 70));
    }
    const s44 = say("uk", ["кросівки 39 розміру", "а 40?"]);
    check("«а 40?» після кросівок — розмір, а не «не зрозумів»", s44.intent !== "unknown" && /40/.test(s44.text), s44.text.slice(0, 60));

    // Сумка під ноутбук — за габаритами картки, не вигадкою.
    const lap = say("uk", ["мені потрібна сумка на роботу", "щоб влазив ноутбук"]);
    const fits = p => { const d = String(p.details.dimensions.uk || "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g).map(Number).sort((a, b) => b - a); return d[0] >= 31 && d[1] >= 22; };
    check("«щоб влазив ноутбук» — лише сумки від 31 × 22 см", lap.products.length > 0 && items(lap).every(fits) && /31 × 22/.test(lap.text), lap.text.slice(0, 70));
    const opt = say("uk", ["окуляри", "а оправи для зору?"]);
    check("«оправи для зору?» — «Окулярів для зору зараз немає» і сонцезахисні", /^Окулярів для зору зараз немає/.test(opt.text) && items(opt).every(p => /Окуляри/.test(p.category)), opt.text.slice(0, 60));

    // Довге уточнення: годинник згадано чотири репліки тому.
    const strap = say("uk", ["хочу годинник", "жіночий", "золотий", "а сріблястий?", "а на шкіряному ремінці?"]);
    check("«а на шкіряному ремінці?» через 4 репліки — годинники на ремінці, не «ременів немає»",
        strap.intent === "products" && strap.products.length > 0 && items(strap).every(p => p.category === "Годинники" && /шкір/i.test(p.details.material.uk))
        && /на шкіряному ремінці/.test(strap.text), strap.text.slice(0, 70));
    check("«ремінців немає?» без годинника — як і раніше, «ременів немає»", say("uk", ["ремінців немає?"]).intent === "missing");
    check("металевий браслет — без годинників на шкіряному ремінці",
        items(say("uk", ["годинник з металевим браслетом"])).every(p => !/ремін/i.test(p.details.material.uk)));

    // Пом'якшений запит: що саме не знайшлося і від дешевшого.
    const relaxed = say("uk", ["а сумки зі знижкою?", "до 1000"]);
    const rp = relaxed.products.map(p => p.price);
    check("«до 1000» без збігів — «За запитом «сумки зі знижкою до 1 000 ₴» нічого немає», від найдешевшої",
        /^За запитом «сумки зі знижкою до 1 000 ₴» зараз нічого немає/.test(relaxed.text) && rp.length > 1 && rp.every((x, i) => !i || rp[i - 1] <= x), relaxed.text.slice(0, 80));
    check("«що у вас на розпродажі?» — речі зі знижкою", (r => r.products.length > 0 && items(r).every(p => bot.botPriceNow(p, NOW) < (p.oldPrice || p.price)))(say("uk", ["що у вас на розпродажі?"])));

    // Оплата.
    const pre = say("uk", ["а передоплата потрібна?"]);
    check("«передоплата потрібна?» — «не обовʼязкова», без «Так.» на початку", /^Передоплата не обовʼязкова/.test(pre.text), pre.text.slice(0, 40));
    check("«а накладений платіж?» — «Так, можна оплатити при отриманні»", /^Так, можна оплатити при отриманні/.test(say("uk", ["а накладений платіж?"]).text));

    // Неправильні відповіді третьої проби.
    check("«чому у вас так дешево?» — звідки речі, а не «Добре!»", (r => r.intent === "faq" && /офіційних/.test(r.text))(say("uk", ["чому у вас так дешево?"])));
    check("«так» саме — і далі згода", say("uk", ["так"]).intent === "ack");
    check("«якщо замовлю сьогодні, коли прийде?» — строки доставки, а не «де замовлення»",
        (r => r.intent === "faq" && /1–2 робочих днів/.test(r.text) && !r.handoff)(say("uk", ["якщо замовлю сьогодні, коли прийде?"])));
    check("«коли прийде моя посилка?» — як і раніше, стан замовлення", say("uk", ["коли прийде моя посилка?"]).intent === "status");
    check("«можна доставку на завтра?» — строки, а не ціна доставки", /1–2 робочих днів/.test(say("uk", ["можна доставку на завтра?"]).text));
    check("«а гарантія на годинник є?» — гарантія, а не підбірка", (r => r.intent === "faq" && /return-warranty/.test(r.text) && !r.products.length)(say("uk", ["а гарантія на годинник є?"])));
    const loyal = say("uk", ["є знижка для постійних клієнтів?"]);
    check("«знижка для постійних?» — менеджеру, без підбірки знижок", loyal.handoff && loyal.pause === false && !loyal.products.length && /постійних/.test(loyal.text));
    check("«які знижки є?» — як і раніше, речі зі знижкою", say("uk", ["які знижки є?"]).products.length > 0);
    const wrap = say("uk", ["подарункове пакування є?"]);
    check("«подарункове пакування є?» — менеджеру, а не «для кого подарунок?»", wrap.handoff && /пакування/.test(wrap.text) && wrap.intent !== "ask");
    check("«подарунок мамі» — як і раніше, жіночі речі", items(say("uk", ["подарунок мамі"])).every(p => (p.gender || []).includes("Жінкам") || !(p.gender || []).length));
    const watchPage = "/p/" + data.products.find(p => p.category === "Годинники").slug + "/";
    check("«який механізм?» на сторінці годинника — менеджеру", (r => r.handoff && /подробиць/.test(r.text))(say("uk", ["який механізм?"], watchPage)));
    check("«хочу кварцовий годинник» поза сторінкою — підбірка, а не «подробиць немає»", say("uk", ["хочу кварцовий годинник"]).products.length > 0);
    check("ru «а подешевле» — «дешевле», а не «не понял»", say("ru", ["сумка коач черная", "а подешевле"]).intent === "cheaper");
    const howMuch = say("uk", ["Сумочка мішель корс", "скільки?"]);
    check("«скільки?» після підбірки — «від … до …» і «про яку розповісти?»", /^Ціни — на картках вище: від .+ до .+\. Про яку/.test(howMuch.text), howMuch.text.slice(0, 60));
    const b5 = say("uk", ["що подарувати мамі?", "бюджет 3000", "а 5000?"]);
    check("«а 5000?» після бюджету — новий бюджет, жіночі речі до 5 000 ₴", /до 5 000 ₴/.test(b5.text) && b5.products.every(p => p.price <= 5000), b5.text.slice(0, 60));
    check("«для себе, я хлопець» — чоловічі речі", /чоловічі/.test(say("uk", ["хочу щось стильне на кожен день", "для себе, я хлопець"]).text));
    check("«працюєте сьогодні?» — графік", say("uk", ["працюєте сьогодні?"]).intent === "contacts");
    check("«замовила вчора, ще не подзвонили» — менеджер звʼяжеться, передано", (r => r.handoff && /звʼяжеться/.test(r.text))(say("uk", ["замовила вчора, ще не подзвонили"])));
    const match = say("ru", ["сумка коач черная", "а кошелек к ней?"]);
    check("ru «а кошелек к ней?» — кошельки того ж бренду", match.products.length > 0 && items(match).every(p => p.brand === "Coach" && p.category === "Гаманці"), match.text.slice(0, 50));
    check("«😍» — подяка за комплімент", /приємно/.test(say("uk", ["😍"]).text));
}

console.log("\n[23] Четверта проба: заперечення, дві речі, порівняння (10.11.2026)");
{
    const none = { text: "", products: [], intent: null };
    const say = (lang, msgs) => {
        const history = [];
        let last = null;
        msgs.forEach(m => {
            last = bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com" });
            history.push({ author: "visitor", body: m });
            if (last) history.push({ author: "bot", body: bot.serializeBotReply(last, last.lang || lang) });
        });
        return last || none;
    };
    const allCol = (p, stem) => (p.colors || []).length && p.colors.every(c => String(c).toLowerCase().startsWith(stem));

    // Раніше «тільки не чорну» → «Ось чорні сумки».
    const notBlack = say("uk", ["хочу сумку, тільки не чорну"]);
    check("«тільки не чорну» — «сумки, крім чорних», жодної суто чорної",
        /сумки, крім чорних/.test(notBlack.text) && notBlack.products.length > 0 && items(notBlack).every(p => !allCol(p, "чорн")), notBlack.text.slice(0, 50));
    const notBrown = say("uk", ["хочу сумку, тільки не чорну", "і не коричневу"]);
    check("«і не коричневу» — виключення накопичуються", /крім коричневих і чорних/.test(notBrown.text)
        && items(notBrown).every(p => !allCol(p, "чорн") && !allCol(p, "коричн")), notBrown.text.slice(0, 60));
    check("en «a bag, not black» — без суто чорних", items(say("en", ["a bag, not black"])).every(p => !allCol(p, "чорн")));
    check("«чорна сумка» — як і раніше, чорні", /^Ось чорні сумки/.test(say("uk", ["чорна сумка"]).text));

    const pair = say("uk", ["шукаю сумку і гаманець в комплект"]);
    check("«сумку і гаманець» — по дві кожного", /^Ось сумки і гаманці/.test(pair.text)
        && items(pair).filter(p => p.department === "Сумки").length === 2 && items(pair).filter(p => p.category === "Гаманці").length === 2, pair.text.slice(0, 40));
    const pairCoach = say("uk", ["шукаю сумку і гаманець в комплект", "Coach"]);
    check("…«Coach» далі — сумки й гаманці Coach", pairCoach.products.length === 4 && items(pairCoach).every(p => p.brand === "Coach")
        && items(pairCoach).some(p => p.category === "Гаманці") && items(pairCoach).some(p => p.department === "Сумки"), pairCoach.text.slice(0, 40));

    const cmp2 = say("uk", ["сумка коуч", "яка різниця між першою і другою?"]);
    check("«яка різниця між першою і другою?» — дві картки поруч із ціною", /^Порівняння/.test(cmp2.text) && /\n1\. «/.test(cmp2.text) && /\n2\. «/.test(cmp2.text) && /₴/.test(cmp2.text), cmp2.text.slice(0, 60));
    const big = say("uk", ["сумка коуч", "а яка більша?"]);
    const coachShown = items(say("uk", ["сумка коуч"]));
    const area = p => { const d = String(p.details.dimensions.uk || "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) || []; const [a, b] = d.map(Number).sort((x, y) => y - x); return (a || 0) * (b || 0); };
    const biggest = coachShown.slice().sort((a, b) => area(b) - area(a))[0];
    check("«а яка більша?» — найбільша з показаних за габаритами", biggest && big.text.includes(biggest.details.dimensions.uk), big.text.slice(0, 60));
    check("«покажіть більше варіантів» — не «яка більша»", say("uk", ["сумка коуч", "покажіть більше варіантів"]).intent !== "product");

    const calm = say("ru", ["нужна сумка для мамы", "без яркого цвета"]);
    check("ru «без яркого цвета» — «спокойных цветов», а не «о какой из них?»", /спокойных цветов/.test(calm.text) && calm.products.length > 0, calm.text.slice(0, 50));
    const plain = say("uk", ["сумка без логотипу"]);
    // Перші чотири сумки й так бувають без логотипу — тож і заголовок має
    // назвати фільтр, інакше перевірка зелена й без нього.
    check("«без логотипу» — без Signature, монограми й фірмового канвасу", plain.products.length > 0 && /без фірмового принту/.test(plain.text)
        && items(plain).every(p => !/signature|monogram/i.test(p.title.en) && !/^фірмов/i.test(p.details.material.uk)), plain.text.slice(0, 40));
    const sport = say("en", ["men's watch under 10000", "something sporty"]);
    check("en «something sporty» після годинників — спортивні моделі", /sporty watches/.test(sport.text) && items(sport).every(p => p.category === "Годинники"), sport.text.slice(0, 50));
    check("«є хронограф?» — лише хронографи", (r => r.products.length > 0 && items(r).every(p => /chronograph|хронограф/i.test(p.title.en + " " + p.title.uk)))(say("uk", ["є хронограф?"])));

    const gift = say("uk", ["подарунок чоловіку до 2000"]);
    check("«подарунок чоловіку до 2000», а до 2000 нічого — чоловіче дорожче, а не жіноче",
        gift.products.length > 0 && items(gift).every(p => !(p.gender || []).length || (p.gender || []).some(g => g === "Чоловікам" || g === "Унісекс")), gift.text.slice(0, 70));
    check("«від 5000 до 8000» — так і в заголовку", /від 5 000 ₴ до 8 000 ₴/.test(say("uk", ["сумка Michael Kors від 5000 до 8000"]).text));
    check("«годиннник жиночий» (зайва буква, «и») — жіночі годинники", /^Ось жіночі годинники/.test(say("uk", ["годиннник жиночий"]).text));
    const tabby = say("en", ["Do you have the Coach Tabby?", "in black?"]);
    check("en «Tabby» → «in black?» — чорні Tabby, а не все чорне Coach", /Tabby/.test(tabby.text) && items(tabby).every(p => /tabby/i.test(p.title.en)), tabby.text.slice(0, 50));
    const howMuch = say("en", ["Do you have the Coach Tabby?", "how much?"]);
    check("en «how much?» після підбірки — діапазон цін", /^Prices are on the cards above: from/.test(howMuch.text), howMuch.text.slice(0, 40));
    check("en «can I pay on delivery?» — «Yes, you can pay on delivery»", /^Yes, you can pay on delivery/.test(say("en", ["can I pay on delivery?"]).text));
    check("«скільки доставка і чи можна оплатити при отриманні?» — і далі дві відповіді",
        say("uk", ["скільки доставка і чи можна оплатити при отриманні?"]).text.split("\n\n").length >= 2);
    const stock = say("uk", ["є сумки в наявності, щоб сьогодні відправили?"]);
    check("«в наявності, щоб сьогодні відправили» — без речей під замовлення", stock.products.length > 0 && items(stock).every(p => p.inStock && !p.preOrder) && /сумки в наявності/.test(stock.text), stock.text.slice(0, 40));
    const bb = say("uk", ["покажи всі бренди сумок"]);
    const bagBrands = [...new Set(data.products.filter(p => p.department === "Сумки").map(p => p.brand))];
    check("«всі бренди сумок» — саме бренди сумок", /^Сумки: у наявності такі бренди/.test(bb.text) && bagBrands.every(b => bb.text.includes(b))
        && data.products.filter(p => !bagBrands.includes(p.brand)).every(p => !bb.text.includes(p.brand)), bb.text.slice(0, 50));
    check("«щось універсальне» після сумок — порада серед сумок", (r => /^Сумки: ось що радимо/.test(r.text))(say("uk", ["сумку хочу але не знаю яку", "щось універсальне"])));
    const cheaperMen = say("uk", ["а гаманці чоловічі є?", "а дешевше?"]);
    check("«а дешевше?» після чоловічих гаманців — без жіночих", items(cheaperMen).every(p => !(p.gender || []).length || !(p.gender || []).every(g => g === "Жінкам")));
}

console.log("\n[24] П'ята проба: купити показане, ціни словами, розміри (10.11.2026)");
{
    const none = { text: "", products: [], intent: null };
    const say = (lang, msgs, page) => {
        const history = [];
        let last = null;
        msgs.forEach(m => {
            last = bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com", page: page || "" });
            history.push({ author: "visitor", body: m });
            if (last) history.push({ author: "bot", body: bot.serializeBotReply(last, last.lang || lang) });
        });
        return last || none;
    };
    const coach = items(say("uk", ["сумка coach"]));

    // Раніше «беру другу» — опис товару, а людина вже вирішила.
    const buy = say("uk", ["сумка coach", "беру другу"]);
    check("«беру другу» — як оформити саме її, з посиланням", buy.intent === "buy" && /^Чудовий вибір/.test(buy.text)
        && buy.text.includes(`/p/${coach[1].slug}/`) && /Купити/.test(buy.text), buy.text.slice(0, 50));
    check("«хочу купити першу» — те саме про першу", (r => r.intent === "buy" && r.text.includes(`/p/${coach[0].slug}/`))(say("uk", ["сумка coach", "хочу купити першу"])));
    const watchPage = "/p/" + data.products.find(p => p.category === "Годинники").slug + "/";
    check("«беру» на сторінці товару — про цей товар", (r => r.intent === "buy" && r.text.includes(watchPage))(say("uk", ["беру"], watchPage)));
    check("«хочу купити сумку» — і далі підбір, а не «чудовий вибір»", say("uk", ["хочу купити сумку"]).intent === "products");
    check("«беру, як замовити?» після кількох — інструкція оформлення", say("uk", ["сумка coach", "беру, як замовити?"]).intent === "how-to-order");
    check("«беру» після однієї показаної — як оформити саме її", say("uk", ["а гаманці чоловічі є?", "до 5000", "беру"]).intent === (say("uk", ["а гаманці чоловічі є?", "до 5000"]).products.length === 1 ? "buy" : "ask"));
    const hold = say("uk", ["сумка coach", "відкладіть першу до завтра"]);
    check("«відкладіть першу» — власнику, з назвою речі, бот не замовк",
        hold.handoff && hold.pause === false && hold.text.includes(`/p/${coach[0].slug}/`), hold.text.slice(0, 50));

    // Ціни словами й валюта.
    const range = say("uk", ["годинник за 10-12 тисяч"]);
    check("«за 10-12 тисяч» — від 10 000 до 12 000 ₴ (а не «від 10 ₴»)", /від 10 000 ₴ до 12 000 ₴/.test(range.text)
        && range.products.every(p => p.price >= 10000 && p.price <= 12000), range.text.slice(0, 50));
    check("«до 200 доларів» — ціни в гривнях, курс не вигадує", (r => /^Ціни в нас у гривнях/.test(r.text) && !/\$|курс/.test(r.text.split("\n")[0].replace("(₴)", "")))(say("uk", ["сумка до 200 доларів"])));
    check("en «bag under $300» — prices are in hryvnias", /^Our prices are in hryvnias/.test(say("en", ["bag under $300"]).text));
    check("«сумка до 8к» — як і раніше, до 8 000 ₴", /до 8 000 ₴/.test(say("uk", ["сумка до 8к"]).text));

    // Розміри.
    const sizes = [...new Set(data.products.filter(p => p.category === "Кросівки").flatMap(p => (p.details.variants || []).flatMap(v => (v.sizes || []).map(x => String(x.size)))))];
    if (!sizes.some(x => /\.5$/.test(x))) {
        const half = say("uk", ["кросівки 38.5"]);
        check("«кросівки 38.5» — «Розміру 38,5 немає», а не мовчки 38-й", /^Розміру 38,5 зараз немає/.test(half.text) && !half.products.length, half.text.slice(0, 50));
    }
    check("«маломірять?» після кросівок — таблиця розмірів, а не «про яку з них?»", /Таблиця розмірів/.test(say("uk", ["кросівки 37", "маломірять?"]).text));
    const us = say("en", ["sneakers size 8 US"]);
    check("en «size 8 US» — розміри EU лише кросівок", /European \(EU\): 3\d/.test(us.text) && !/5[0-9]/.test(us.text.split("\n")[0]), us.text.slice(0, 70));

    // Довге повідомлення з кількома побажаннями.
    const long = say("uk", ["Добрий день! Хотіла б придбати сумочку для себе, щось не дуже велике, бажано світле, до 7 тисяч. Дякую!"]);
    check("довге повідомлення — жіночі, маленькі, світлі, до 7 000 ₴", /жіночі маленькі сумки світлих кольорів до 7 000 ₴/.test(long.text)
        && long.products.every(p => p.price <= 7000), long.text.slice(0, 80));

    // Неправильні відповіді.
    const olx = say("uk", ["а у вас реально оригінал? бо на олх такі самі дешевше"]);
    check("«оригінал? на олх дешевше» — про оригінальність, а не «дешевше»", olx.intent === "faq" && /оригінальні/.test(olx.text) && !olx.products.length, olx.text.slice(0, 40));
    check("«а дешевше є?» — як і раніше, дешевше", say("uk", ["сумка coach", "а дешевше є?"]).intent === "cheaper");
    check("ru «сколько стоит доставка и сколько ехать?» — обидві відповіді", say("ru", ["сколько стоит доставка в Киев и сколько ехать?"]).text.split("\n\n").length >= 2);
    check("«не сподобається колір?» — повернення", /14 днів/.test(say("uk", ["а якщо мені не сподобається колір в житті?"]).text));
    check("«скинь фото на вайбер 067…» — фото на цей номер", /надішле фото/.test(say("uk", ["скинь фото на вайбер 0671234567"]).text));
    check("«передзвоніть 067…» — як і раніше, передзвонить", /передзвонить/.test(say("uk", ["передзвоніть мені 0671234567"]).text));

    // Посилання на товар у повідомленні — як зі сторінки товару.
    const linked = data.products.find(p => p.inStock && !p.preOrder);
    const viaLink = say("uk", [`https://bestbrnd4u.com/p/${linked.slug}/ ця є?`]);
    check("посилання на товар + «ця є?» — наявність саме цієї", viaLink.intent === "product" && /Є в наявності/.test(viaLink.text), viaLink.text.slice(0, 50));
    check("на сторінці товару «розкажіть про цю» — коротко все з картки", (r => r.intent === "product" && /Ціна/.test(r.text) && !/не вказано/.test(r.text))(say("uk", ["розкажіть про цю"], "/p/" + linked.slug + "/")));
}

console.log("\n[25] Шоста проба: суржик, повтори, моделі, доставка по Україні (10.11.2026)");
{
    const none = { text: "", products: [], intent: null };
    const say = (lang, msgs) => {
        const history = [];
        let last = null;
        msgs.forEach(m => {
            last = bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com" });
            history.push({ author: "visitor", body: m });
            if (last) history.push({ author: "bot", body: bot.serializeBotReply(last, last.lang || lang) });
        });
        return last || none;
    };

    check("«шо є по сумках?» — як «що є по сумках»", (r => r.products.length > 0 && items(r).every(p => p.department === "Сумки"))(say("uk", ["шо є по сумках?"])));
    check("«а шо по ціні?» після підбірки — діапазон цін", /^Ціни — на картках вище/.test(say("uk", ["шо є по сумках?", "а по годинниках?", "а шо по ціні?"]).text));
    // Раніше «скільки коштує» без речі — відповідь про ціну ДОСТАВКИ.
    const price0 = say("uk", ["скільки коштує"]);
    check("«скільки коштує» без речі — «яка річ цікавить?», а не про доставку", price0.intent === "ask" && !/доставк|перевізник/i.test(price0.text), price0.text.slice(0, 50));
    check("«скільки коштує доставка?» — як і раніше, про доставку", say("uk", ["скільки коштує доставка?"]).intent === "faq");
    check("«мені б щось гарненьке» — «що саме шукаєте?», а не «не зрозумів»", say("uk", ["мені б щось гарненьке"]).intent === "ask");
    check("«Що у вас найпопулярніше?» — порада", /радимо/.test(say("uk", ["Що у вас найпопулярніше?"]).text));

    // Той самий запит удруге й утретє — далі, а не те саме.
    const b1 = say("uk", ["сумка"]), b2 = say("uk", ["сумка", "сумка"]), b3 = say("uk", ["сумка", "сумка", "сумка"]);
    const slugs = r => r.products.map(p => p.slug).join();
    check("«сумка» тричі — три різні четвірки", slugs(b1) !== slugs(b2) && slugs(b2) !== slugs(b3) && /^Ще сумки — 5–8/.test(b2.text) && /^Ще сумки — 9–12/.test(b3.text), b3.text.slice(0, 30));
    const hi2 = say("uk", ["привіт", "привіт"]);
    check("друге «привіт» — не те саме вітання вдруге", /^Я тут/.test(hi2.text), hi2.text.slice(0, 30));
    check("«привіт» після підбірки — знову вітання", /^Привіт!/.test(say("uk", ["сумка", "привіт"]).text));

    // З картки: камені, автоматичні, поляризація.
    const stones = say("ru", ["ищу женские часы до 15 тысяч", "а с камнями?"]);
    check("ru «а с камнями?» після годинників — годинники з кристалами (pavé)", stones.products.length > 0
        && items(stones).every(p => p.category === "Годинники" && /pav[eé]|кристал/i.test(p.title.en + " " + p.details.material.uk)), stones.text.slice(0, 60));
    check("«автоматичний» після годинників — Automatic / Swissmatic",
        (r => r.products.length > 0 && items(r).every(p => /automatic|swissmatic/i.test(p.title.en)))(say("uk", ["годинник", "автоматичний"])));
    const polar = say("uk", ["окуляри з поляризацією?"]);
    check("«окуляри з поляризацією?» — лише ті, де це в картці, і так і сказано",
        polar.products.length > 0 && items(polar).every(p => /polari|поляриз/i.test(p.title.uk + p.title.en + JSON.stringify(p.keywords))) && /як зазначено в картці/.test(polar.text), polar.text.slice(0, 60));

    // Модель, якої немає.
    const way = say("uk", ["Ray-Ban Aviator є?", "а Wayfarer?"]);
    check("«Ray-Ban» → «а Wayfarer?» — «моделі немає», і Ray-Ban, що є", /^Моделі «Wayfarer» зараз у каталозі немає/.test(way.text) && items(way).every(p => p.brand === "Ray-Ban"), way.text.slice(0, 50));
    check("«а Tabby?» після Coach — як і раніше, Tabby", items(say("uk", ["сумка coach", "а Tabby?"])).every(p => /tabby/i.test(p.title.en)));

    const city = say("uk", ["а якщо я з Харкова, доставите?"]);
    check("«з Харкова, доставите?» — так, по Україні Новою поштою", /^Так, відправляємо Новою поштою в будь-яке місто України/.test(city.text), city.text.slice(0, 50));
    check("«доставляєте в Польщу?» — як і раніше, менеджеру", say("uk", ["доставляєте в Польщу?"]).handoff === true);
}

console.log("\n[26] Підсумок для власника в Telegram (10.11.2026)");
{
    const run = (lang, msgs, page) => {
        const history = [];
        let last = null;
        msgs.forEach(m => {
            last = bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com", page: page || "" });
            history.push({ author: "visitor", body: m });
            if (last) history.push({ author: "bot", body: bot.serializeBotReply(last, last.lang || lang) });
        });
        return last;
    };
    const tg = r => bot.botTelegramText(bot.serializeBotReply(r, r.lang), 5, s => s);

    // Бот кличе власника — у Telegram одразу видно, що людина шукала.
    const bargain = tg(run("uk", ["чорна жіноча сумка Coach до 8000", "дайте знижку"]));
    check("торг після підбірки — «🔎 Шукає: чорні жіночі сумки Coach до 8 000 ₴»", /🔎 Шукає: чорні жіночі сумки Coach до 8 000 ₴/.test(bargain), bargain.split("\n").pop());
    check("«дайте знижку» — не «зі знижкою» в підсумку", !/Шукає:[^\n]*зі знижкою/.test(bargain));
    const en = tg(run("en", ["men's watch under 10000", "do you ship to Poland?"]));
    check("англійською — підсумок українською й «Пише англійською»", /🔎 Шукає: чоловічі годинники до 10 000 ₴/.test(en) && /🌐 Пише англійською/.test(en), en.split("\n").pop());
    const page = "/p/" + data.products[0].slug + "/";
    const onPage = tg(run("uk", ["є знижка для постійних?"], page));
    check("зі сторінки товару — «👀 Дивиться: «назва» — ціна»", onPage.includes("👀 Дивиться: «" + data.products[0].title.uk + "»"), onPage.split("\n").pop());
    const hold = tg(run("uk", ["сумка coach", "відкладіть першу"]));
    check("«відкладіть першу» — у підсумку саме ця річ", /👀 Дивиться: «/.test(hold) && hold.includes(items(talk("uk", ["сумка coach"]))[0].title.uk), hold.split("\n").pop());

    // Звичайна відповідь — без підсумку, у чаті службового рядка не видно.
    const plain = run("uk", ["сумка"]);
    check("звичайна підбірка — без підсумку", !/Шукає|Дивиться/.test(tg(plain)) && !/\[\[summary/.test(bot.serializeBotReply(plain, "uk")));
    const body = bot.serializeBotReply(run("uk", ["чорна сумка", "дайте знижку"]), "uk");
    check("підсумок — службовим рядком [[summary: …]], який чат не показує", /^\[\[summary: .+\]\]$/m.test(body)
        && /else if \(!\/\^\\\[\\\[\.\*\\\]\\\]\$\/\.test\(l\.trim\(\)\)\) текст\.push\(l\)/.test(read("assets/js/contact-buttons.js")));
    check("рядок товару не плутається з підсумком (картки — лише «• … ₴ url»)", !/\/p\//.test((body.match(/^\[\[summary: (.*)\]\]$/m) || [])[1] || ""));
}

console.log("\n[27] Сьома проба: акції, сертифікати, догляд, сторінка товару (10.11.2026)");
{
    const none = { text: "", products: [], intent: null };
    const say = (lang, msgs, page) => {
        const history = [];
        let last = null;
        msgs.forEach(m => {
            last = bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com", page: page || "" });
            history.push({ author: "visitor", body: m });
            if (last) history.push({ author: "bot", body: bot.serializeBotReply(last, last.lang || lang) });
        });
        return last || none;
    };
    const askOwner = r => r.handoff && r.pause === false && !r.products.length;

    // Раніше «чорна п'ятниця» — «Ось чорні речі».
    const bf = say("uk", ["коли буде чорна п'ятниця?"]);
    check("«коли буде чорна п'ятниця?» — плани акцій у менеджера, а не чорні речі", askOwner(bf) && /aktsii/.test(bf.text), bf.text.slice(0, 40));
    check("«а знижки будуть?» — теж про плани акцій", /Плани акцій/.test(say("uk", ["а знижки будуть?"]).text));
    check("«чорна сумка» — як і раніше, чорні", /^Ось чорні сумки/.test(say("uk", ["чорна сумка"]).text));
    check("«є подарункові сертифікати?» — менеджеру, а не «для кого подарунок?»", askOwner(say("uk", ["є подарункові сертифікати?"])));
    check("«як доглядати за шкіряною сумкою?» — менеджеру, а не підбірка", askOwner(say("uk", ["як доглядати за шкіряною сумкою?"])));
    check("«скільки часу ви на ринку?» — менеджеру, а не «14 днів на повернення»",
        (r => askOwner(r) && !/14 днів/.test(r.text))(say("uk", ["скільки часу ви працюєте на ринку?"])));
    const face = say("uk", ["які окуляри підійдуть до круглого обличчя?"]);
    check("«окуляри до круглого обличчя» — порада менеджера й окуляри одразу", face.handoff && face.products.length > 0 && items(face).every(p => /Окуляри/.test(p.category)));
    check("«а якщо зняла бирку?» — умови повернення з сайту (бирки, пакування)", /бирками/.test(say("uk", ["а якщо зняла бирку?"]).text));

    // Сторінка товару.
    const watchPage = "/p/" + data.products.find(p => p.category === "Годинники").slug + "/";
    check("«батарейка є?» на сторінці годинника — менеджеру, а не «є в наявності»", (r => r.handoff && !/в наявності/.test(r.text))(say("uk", ["батарейка є?"], watchPage)));
    check("«скільки важить?» — менеджеру", say("uk", ["скільки важить?"], watchPage).handoff);
    const bagP = data.products.find(p => p.department === "Сумки" && p.inStock);
    check("en «does it come with a dust bag?» — менеджеру, а не підбірка сумок", askOwner(say("en", ["does it come with a dust bag?"], "/en/p/" + bagP.slug + "/")));
    check("en «can I get it by Friday?» — строки доставки", /1–2 business days/.test(say("en", ["can I get it by Friday?"], "/en/p/" + bagP.slug + "/").text));
    const cheap = say("ru", ["а можно дешевле?"], "/ru/p/" + bagP.slug + "/");
    check("ru «а можно дешевле?» на сторінці сумки — сумки, дешевші за цю", cheap.products.length > 0
        && items(cheap).every(p => p.department === "Сумки" && bot.botPriceNow(p, NOW) < bot.botPriceNow(bagP, NOW)), cheap.text.slice(0, 30));

    // «Чому», «скільки чекати» після «під замовлення».
    const why = say("uk", ["а чому деякі товари під замовлення?"]);
    check("«а чому … під замовлення?» — пояснення, без «Так.» на початку", /^«Під замовлення»/.test(why.text), why.text.slice(0, 30));
    check("«скільки чекати?» після «під замовлення» — строк під замовлення", /Строк під замовлення/.test(say("uk", ["а чому деякі товари під замовлення?", "скільки чекати?"]).text));
    check("«скільки?» саме — як і раніше, «яка річ?»", say("uk", ["скільки?"]).intent === "ask");
    check("«я замовляла у вас, хочу ще» — «Раді, що повертаєтесь»", /^Раді, що повертаєтесь/.test(say("uk", ["я замовляла у вас минулого місяця, хочу ще"]).text));
    check("«що краще для подарунка дівчині?» — порада серед жіночого", /^Жіночі речі: ось що радимо/.test(say("uk", ["що краще для подарунка дівчині 20 років?"]).text));
}

console.log("\n[28] Восьма проба: трансліт, бюджет словами, річ + питання (10.11.2026)");
{
    const one = (m, lang) => bot.botReply(m, [], data, { lang: lang || "uk", now: NOW, siteUrl: "https://bestbrnd4u.com" }) || { text: "", products: [], intent: null };
    const prices = r => r.products.map(p => p.price);

    // Трансліт — раніше «не зрозумів».
    const tr = one("sumka chorna");
    check("«sumka chorna» — чорні сумки", /^Ось чорні сумки/.test(tr.text), tr.text.slice(0, 30));
    check("«godynnyk cholovichyi» — чоловічі годинники", /^Ось чоловічі годинники/.test(one("godynnyk cholovichyi").text));
    check("«okuliary rayban» — окуляри Ray-Ban (і тип, і бренд)", /^Ось окуляри Ray-Ban/.test(one("okuliary rayban").text));
    check("англійська не транслітерується: «black bag» — black bags", /black bags/.test(one("black bag", "en").text));
    check("«hello» — як і раніше, вітання", one("hello", "en").intent === "hello");

    // Бюджет словами.
    const notMore = one("сумка не дорожче 6 тис");
    check("«не дорожче 6 тис» — до 6 000 ₴ (раніше «від 6 000 до 6 000»)", /до 6 000 ₴/.test(notMore.text) && !/від 6 000/.test(notMore.text) && prices(notMore).every(x => x <= 6000), notMore.text.slice(0, 40));
    check("«дорожче 10000 годинник» — як і раніше, від 10 000", /від 10 000 ₴/.test(one("годинник дорожче 10000").text));
    check("«в межах 7000 сумка» — до 7 000 ₴", (r => /до 7 000 ₴/.test(r.text) && prices(r).every(x => x <= 7000))(one("в межах 7000 сумка")));
    check("«сумка 8.000» — до 8 000 ₴", /до 8 000 ₴/.test(one("сумка 8.000").text));
    check("«бюджет тисяч 8-10» — від 8 000 до 10 000 ₴", /від 8 000 ₴ до 10 000 ₴/.test(one("подарунок мамі, бюджет тисяч 8-10").text));
    check("«сумка дешевше 5000» — до 5 000 ₴, а не «найдоступніші»", (r => /^Ось сумки до 5 000 ₴/.test(r.text) && prices(r).every(x => x <= 5000))(one("сумка дешевше 5000")));
    check("«Tabby 26» — не бюджет 26", !/до 26 ₴/.test(one("скільки коштує сумка Coach Tabby 26?").text));
    check("«окуляри RB3498» — не бюджет 3498", !/3 498 ₴/.test(one("окуляри RB3498").text.split("\n")[0]));

    // Річ і питання в одному повідомленні.
    const mix = one("чорна сумка і скільки доставка?");
    check("«чорна сумка і скільки доставка?» — і відповідь про доставку, і чорні сумки",
        /перевізник/.test(mix.text) && /Ось чорні сумки/.test(mix.text) && mix.products.length > 0, mix.text.slice(0, 50));
    check("«покажіть годинники і як оплатити?» — і оплата, і годинники", (r => /оплат/.test(r.text) && items(r).every(p => p.category === "Годинники") && r.products.length > 0)(one("покажіть годинники і як оплатити?")));
    check("«чорна сумка» — без зайвої відповіді з частих питань", /^Ось чорні сумки/.test(one("чорна сумка").text));
    check("«шопер … а4 і ноут» — сумки під ноутбук", /ноутбук 13″/.test(one("сумка шопер велика для роботи щоб вміщався а4 і ноут").text));
}

console.log("\n[29] Ті самі ходи англійською й російською; «біл» ≠ «більше» (10.11.2026)");
{
    const none = { text: "", products: [], intent: null };
    const say = (lang, msgs) => {
        const history = [];
        let last = null;
        msgs.forEach(m => {
            last = bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com" });
            history.push({ author: "visitor", body: m });
            if (last) history.push({ author: "bot", body: bot.serializeBotReply(last, last.lang || lang) });
        });
        return last || none;
    };
    const coach = items(say("uk", ["сумка coach"]));

    check("en «bag no more than 6000» — under 6 000 ₴ (раніше «from 6 000»)", (r => /under 6 000 ₴/.test(r.text) && r.products.every(p => p.price <= 6000))(say("en", ["bag no more than 6000"])));
    check("en «more than 6000» — як і раніше, from 6 000", /from 6 000 ₴/.test(say("en", ["bag more than 6000"]).text));
    check("ru «а какая больше?» — найбільша з показаних", /^Самая большая из показанных/.test(say("ru", ["сумка коуч", "а какая больше?"]).text));
    check("ru «а какая меньше?» — найменша з показаних", /^Самая маленькая из показанных/.test(say("ru", ["сумка коуч", "а какая меньше?"]).text));

    // «Біл» (білий) збігалося з «більше» — «покажіть більше» ставало
    // питанням про колір і отримувало «Про яку з них?».
    const more = say("uk", ["сумка coach", "покажіть більше"]);
    check("«покажіть більше» — наступні варіанти, а не «про яку з них?» чи «яка більша»",
        /^Ще сумки Coach — 5–8/.test(more.text) && more.products.length > 0 && more.products.every(p => !coach.some(c => c.slug === p.slug)), more.text.slice(0, 40));
    check("«а біла є?» про показані — як і раніше, питання про колір", say("uk", ["сумка coach", "а біла є?"]).products.length > 0 || /біл/i.test(say("uk", ["сумка coach", "а біла є?"]).text));
    check("«більше фото» — як і раніше, менеджеру", say("uk", ["сумка coach", "більше фото"]).handoff);

    // Мова повідомлення.
    check("«покажите больше вариантов» на укр. сторінці — відповідь російською", bot.detectLang("покажите больше вариантов", "uk") === "ru");
    check("«мужские часы», «кошелек женский» — російською", bot.detectLang("мужские часы", "uk") === "ru" && bot.detectLang("кошелек женский", "uk") === "ru");
    check("«чорна сумка», «годинник чоловічий» — як і раніше, українською", bot.detectLang("чорна сумка", "uk") === "uk" && bot.detectLang("годинник чоловічий", "uk") === "uk");

    // Ходи, перевірені українською, — і двома іншими мовами.
    check("en «a bag, but not black» → «and not brown» — except brown and black", /except brown and black/.test(say("en", ["I want a bag, but not black", "and not brown"]).text));
    check("ru «беру вторую» — як оформити саме її", say("ru", ["сумка коуч", "беру вторую"]).intent === "buy");
    check("ru «когда черная пятница?» — плани акцій", /Планы акций/.test(say("ru", ["когда черная пятница?"]).text));
    check("en «do you deliver to Lviv?» — any city in Ukraine", /any city in Ukraine/.test(say("en", ["do you deliver to Lviv?"]).text));
}

console.log("\n[30] «Про першу» без списку; сторож на 80 фразах (10.11.2026)");
{
    const say = (lang, msgs) => {
        const history = [];
        let last = null;
        msgs.forEach(m => {
            last = bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com" });
            history.push({ author: "visitor", body: m });
            if (last) history.push({ author: "bot", body: bot.serializeBotReply(last, last.lang || lang) });
        });
        return last;
    };

    // Раніше — «не зрозумів» і дзвінок власнику.
    for (const [m, lang] of [["розкажіть про першу", "uk"], ["the second one, is it in stock?", "en"], ["беру вторую", "ru"], ["а яка більша?", "uk"], ["яка різниця між першою і другою?", "uk"]]) {
        const r = say(lang, [m]);
        check(`«${m}» без підбірки — «я ще нічого не показував», власника не будить`, r.intent === "ask" && !r.handoff && /нічого не показував|haven't shown anything|ничего не показывал/.test(r.text), r.text.slice(0, 40));
    }
    check("«друга сумка чорна» без підбірки — це запит: чорні сумки", /^Ось чорні сумки/.test(say("uk", ["друга сумка чорна"]).text));
    check("«подарунок другу» — як і раніше, чоловічі речі", /чоловічі/.test(say("uk", ["подарунок другу"]).text));
    check("«розкажіть про першу» після підбірки — як і раніше, про неї", say("uk", ["сумка coach", "розкажіть про першу"]).intent === "product");

    // Сторож: 80 різних фраз з усіх проб — окремо трьома мовами і
    // ланцюжками по п'ять. Ловить системне: виняток, порожній текст,
    // «{desc}», undefined/NaN, той самий товар двічі, порожню кнопку.
    // Перевірено поломкою: шаблон, undefined і виняток — усі червоні.
    const POOL = [
        "Привіт",
        "а чорна є?",
        "дякую",
        "а щось дешевше?",
        "кросівки",
        "скільки коштує друга?",
        "мне нужны очки",
        "спасибо",
        "a bag",
        "Coach",
        "покажіть ще",
        "а Gucci?",
        "а якщо брак?",
        "через плече",
        "а зі знижкою?",
        "хочу сумку, тільки не чорну",
        "шукаю сумку і гаманець в комплект",
        "яка різниця між першою і другою?",
        "хочу сумочку червону під сукню",
        "сумка Michael Kors від 5000 до 8000",
        "тисот",
        "Hi, I'm looking for a men's watch under 10000",
        "Do you have the Coach Tabby?",
        "can I pay on delivery?",
        "щось універсальне",
        "є сумки в наявності, щоб сьогодні відправили?",
        "для підлітка дівчинки 14 років",
        "годинник за 10-12 тисяч",
        "сумка coach",
        "як оплатити?",
        "кросівки 37",
        "оформіть мені замовлення на першу, Київ, відділення 5, 0671234567",
        "скільки сумок Coach у вас є і скільки коштує найдешевша?",
        "а якщо мені не сподобається колір в житті?",
        "шо є по сумках?",
        "мені б щось гарненьке",
        "а серебряные?",
        "any in brown?",
        "привіт",
        "сумка Jacquemus є?",
        "а Wayfarer?",
        "автоматичний",
        "а Prada?",
        "а для чоловіків?",
        "а якщо я з Харкова, доставите?",
        "sumka chorna",
        "ЧОРНА СУМКА COACH",
        "сумочку 👜 чорну 🖤 хочу",
        "сумка не дорожче 6 тис",
        "сумка дешевше 5000",
        "чорна сумка і скільки доставка?",
        "Сумка?)",
        "Подскажите пожалуйста есть ли у вас мужской кошелек кожаный коричневого цвета недорого",
        "I want a bag, but not black",
        "и не коричневую",
        "беру вторую",
        "сумка не дороже 6 тысяч",
        "what brands do you have?",
        "what's the difference between the first and the second?",
        "а какая больше?",
        "сколько?",
        "men's sneakers 43?",
        "что нового?",
        "без логотипа сумка",
        "доставите в Одессу?",
        "добре",
        "понятно",
        "got it",
        "thank you!",
        "як справи?",
        "ти бот?",
        "are you a bot?",
        "чем можешь помочь",
        "добрий вечір",
        "good morning",
        "як купити?",
        "можна без реєстрації?",
        "а дешевше є?",
        "сайт не працює",
        "мені не прийшло замовлення"
    ];
    const bad = [];
    const inspect = (r, ctx) => {
        if (!r) return;
        if (!r.text || !r.text.trim()) bad.push("порожньо: " + ctx);
        else if (/\{[a-zA-Z]+\}/.test(r.text)) bad.push("шаблон: " + ctx);
        else if (/undefined|NaN|\[object|\bnull\b/.test(r.text)) bad.push("undefined: " + ctx);
        const slugs = r.products.map(p => p.slug);
        if (new Set(slugs).size !== slugs.length) bad.push("двічі: " + ctx);
        if ((r.chips || []).some(c => !c || !String(c).trim())) bad.push("кнопка: " + ctx);
        if (r.products.length > 4) bad.push(">4: " + ctx);
    };
    for (const lang of ["uk", "en", "ru"]) {
        for (const m of POOL) {
            try { inspect(bot.botReply(m, [], data, { lang, now: NOW }), `«${m}» ${lang}`); } catch (e) { bad.push(`виняток ${e.message}: «${m}» ${lang}`); }
        }
        for (let i = 0; i + 5 <= POOL.length; i += 5) {
            const seq = POOL.slice(i, i + 5);
            const history = [];
            for (const m of seq) {
                let r;
                try { r = bot.botShouldStay(history) ? bot.botReply(m, history, data, { lang, now: NOW }) : null; } catch (e) { bad.push(`виняток ${e.message}: ${seq.join(" → ")}`); break; }
                inspect(r, seq.join(" → ") + " " + lang);
                history.push({ author: "visitor", body: m });
                if (r) history.push({ author: "bot", body: bot.serializeBotReply(r, r.lang || lang) });
            }
        }
    }
    check(`сторож: ${POOL.length} фраз × 3 мови окремо й ланцюжками — без системних вад`, POOL.length >= 60 && bad.length === 0, bad.slice(0, 3).join(" | "));
}

console.log("\n[31] Замовлення по кроках, «не та сумка», брак (10.11.2026)");
{
    const run = (lang, msgs) => {
        const history = [];
        const out = [];
        msgs.forEach(m => {
            const r = bot.botShouldStay(history) ? bot.botReply(m, history, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com" }) : null;
            history.push({ author: "visitor", body: m });
            if (r) history.push({ author: "bot", body: bot.serializeBotReply(r, r.lang || lang) });
            out.push(r);
        });
        return out;
    };

    // Бот просить номер і телефон — людина шле їх по черзі. Раніше:
    // номер → та сама підказка вдруге, телефон → «менеджер передзвонить».
    const [, num, phone] = run("uk", ["де моє замовлення?", "8689484479", "0671234567"]);
    check("номер окремо після «де замовлення?» — «тепер напишіть телефон»", /^Дякую! Тепер напишіть, будь ласка, телефон/.test(num.text), num.text.slice(0, 40));
    check("…телефон далі — перевірка замовлення з обома", phone && phone.lookup && phone.lookup.orderNumber === "8689484479" && phone.lookup.phone === "0671234567" && !phone.handoff, phone && phone.intent);
    const [, ph, ord] = run("ru", ["где мой заказ", "0671234567", "8689484479"]);
    check("ru телефон, потім номер — «а номер заказа?» і перевірка", /^Спасибо! А номер заказа/.test(ph.text) && ord.lookup && ord.lookup.orderNumber === "8689484479", ph.text.slice(0, 30));
    check("«передзвоніть 067…» без розмови про замовлення — як і раніше, дзвінок", run("uk", ["передзвоніть мені 0671234567"])[0].handoff === true);
    check("номер і телефон одним повідомленням — як і раніше, перевірка", run("uk", ["замовлення 8689484479 телефон 0671234567"])[0].intent === "lookup");
    check("«мій номер замовлення 12345» — підказка про перевірку, а не «не зрозумів»", run("uk", ["мій номер замовлення 12345"])[0].intent === "status");
    check("про номер замовлення бот не обіцяє SMS — магазин шле лише лист і Telegram",
        !/SMS/.test(read("supabase/functions/telegram-order-bot/chat-bot.js").replace(/\/\/.*$/gm, "")));

    const wrong = run("uk", ["прийшла не та сумка"])[0];
    check("«прийшла не та сумка» — вибачення й власнику, а не підбірка сумок", wrong.handoff && !wrong.products.length && /шкода/.test(wrong.text), wrong.text.slice(0, 40));
    check("en «you sent the wrong item» — теж власнику", (r => r.handoff && !r.products.length)(run("en", ["you sent the wrong item"])[0]));
    const defect = run("uk", ["товар прийшов з дефектом"])[0];
    check("«прийшов з дефектом» — умови гарантії й власник покликаний, бот не замовк", defect.handoff && defect.pause === false && /return-warranty/.test(defect.text));
    check("«а що з гарантією?» — як і раніше, довідка без дзвінка", run("uk", ["а що з гарантією?"])[0].handoff === false);
}

console.log("\n[32] Кнопки-підказки: мова розмови, «Інші варіанти» після повтору (10.11.2026)");
{
    const send = (h, m, lang) => {
        const r = bot.botShouldStay(h) ? bot.botReply(m, h, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com" }) : null;
        const h2 = h.concat([{ author: "visitor", body: m }]);
        if (r) h2.push({ author: "bot", body: bot.serializeBotReply(r, r.lang || lang) });
        return [r, h2];
    };
    const chat = (lang, msgs) => { let h = [], r = null; for (const m of msgs) [r, h] = send(h, m, lang); return [r, h]; };

    // Українською на /ru/ — бот відповідає українською й кнопки українські.
    // Раніше натиск «Покликати менеджера» перемикав розмову на російську:
    // з самої кнопки мови не видно, і бралась мова сторінки.
    const [r1, h1] = chat("ru", ["шукаю сумку і гаманець в комплект"]);
    check("українською на /ru/ — відповідь і кнопки українською", r1.lang === "uk" && r1.chips.length > 0 && r1.chips.every(c => !/[ыэъё]/.test(c)), r1.lang + " " + r1.chips.join("|"));
    check("після відповіді про доставку — без кнопки «Доставка» (дала б те саме)", !chat("uk", ["скільки коштує доставка?"])[0].chips.includes("Доставка"));
    const [human] = send(h1, "Покликати менеджера", "ru");
    check("кнопка «Покликати менеджера» там же — відповідь українською", human.lang === "uk" && /менеджер/.test(human.text), human.lang);
    const [, h2] = chat("uk", ["a bag"]);
    const [women] = send(h2, "Women's bags", "uk");
    check("англійською на укр. сторінці → кнопка «Women's bags» — англійською", women.lang === "en", women.lang);
    check("на /ru/ без попередніх реплік «Coach» — як і раніше, мовою сторінки", chat("ru", ["Coach"])[0].lang === "ru");
    check("перейшла на іншу мову сама — бот за нею", chat("uk", ["чорна сумка", "а подешевле есть?"])[0].lang === "ru");

    // «Сумка» → «сумка» (друга четвірка) → «Інші варіанти» — третя, а не друга ще раз.
    const [p2, hp] = chat("uk", ["сумка не дорожче 6 тис", "сумка не дорожче 6 тис"]);
    const [p3] = send(hp, "Інші варіанти", "uk");
    check("повтор запиту, потім «Інші варіанти» — наступна четвірка, а не та сама",
        p3.products.length > 0 && p3.products.every(p => !p2.products.some(q => q.slug === p.slug)), p3.text.slice(0, 40));
    const [m3] = chat("uk", ["сумка", "Інші варіанти", "Інші варіанти"]);
    check("«ще» двічі після запиту — як і раніше, 9–12", /9–12/.test(m3.text), m3.text.slice(0, 30));

    // Сторож кнопок: кожна кнопка з типових розмов, натиснута там, де її
    // показали, — не «не зрозумів», не та сама відповідь, не інша мова.
    const starts = [["uk", ["сумка"]], ["uk", ["Привіт"]], ["uk", ["подарунок"]], ["uk", ["сумка coach"]], ["uk", ["що нового?"]], ["uk", ["скільки коштує доставка?"]],
        ["en", ["bag"]], ["en", ["hi"]], ["ru", ["часы"]], ["ru", ["привет"]], ["uk", ["у вас є Louis Vuitton?"]], ["uk", ["хочу штани"]], ["uk", ["фывапролд"]]];
    const bad = [];
    for (const [lang, msgs] of starts) {
        const [r, h] = chat(lang, msgs);
        for (const chip of (r && r.chips) || []) {
            const [c] = send(h, chip, lang);
            if (!c) { bad.push(`${msgs} → «${chip}»: мовчить`); continue; }
            if (c.intent === "unknown") bad.push(`${msgs} → «${chip}»: не зрозумів`);
            if (c.text === r.text && JSON.stringify(c.products) === JSON.stringify(r.products)) bad.push(`${msgs} → «${chip}»: те саме`);
            if (c.lang !== r.lang) bad.push(`${msgs} → «${chip}»: ${r.lang}→${c.lang}`);
        }
    }
    check("сторож кнопок: усі кнопки з 13 типових розмов ведуть далі тією ж мовою", bad.length === 0, bad.slice(0, 3).join(" | "));
}

console.log("\n[33] Бренд ≠ тема («Armani Exchange»), ім'я, «я з Києва» (10.11.2026)");
{
    // Через запобіжник: на старій версії бота цих функцій немає, і без нього
    // розділ обривався б винятком замість чесних ✗.
    const introOf = m => typeof bot.introOf === "function" ? bot.introOf(m) : null;
    const withoutBrands = (t, d) => typeof bot.withoutBrands === "function" ? bot.withoutBrands(t, d) : t;
    const one = (m, lang, h) => bot.botReply(m, h || [], data, { lang: lang || "uk", now: NOW, siteUrl: "https://bestbrnd4u.com" });

    // «Exchange» у назві бренду = «exchange» (обмін): раніше до підбірки
    // дописувалась відповідь про повернення, а «Armani Exchange» саме —
    // ставало питанням про обмін.
    if (data.products.some(p => p.brand === "Armani Exchange")) {
        const ax = one("Armani Exchange");
        check("«Armani Exchange» — речі бренду, а не умови повернення", /Armani Exchange/.test(ax.text.split("\n")[0]) && ax.products.length > 0 && !/Поверніть/.test(ax.text), ax.text.slice(0, 50));
        const beige = one("бежевий сумку Armani Exchange");
        check("«бежевий сумку Armani Exchange» — чесне «нічого немає», без відповіді про повернення", /^За запитом «бежеві сумки Armani Exchange»/.test(beige.text) && !/Поверніть/.test(beige.text), beige.text.slice(0, 50));
    }
    check("«хочу обміняти» — як і раніше, повернення й обмін", /Поверніть/.test(one("хочу обміняти").text));
    check("withoutBrands прибирає назви брендів каталогу", !/Coach|Armani/i.test(withoutBrands("сумка Coach і Armani Exchange", data)));

    // Ім'я. Раніше «мене звати Оля» — «не зрозумів» і дзвінок власнику.
    const ola = one("мене звати Оля");
    check("«мене звати Оля» — «Приємно познайомитись!», власника не будить", /^Приємно познайомитись/.test(ola.text) && !ola.handoff, ola.text.slice(0, 40));
    check("українською ім'я не підставляємо (кличного відмінка бот не вгадає)", !/Оля/.test(ola.text));
    check("ru «меня зовут Марина» — «Приятно познакомиться, Марина!»", /^Приятно познакомиться, Марина!/.test(one("меня зовут Марина", "ru").text));
    check("en «Hi, I am Kate» — «Nice to meet you, Kate!»", /^Nice to meet you, Kate!/.test(one("Hi, I am Kate", "en").text));
    const andriy = one("Привіт, я Андрій, шукаю годинник");
    check("«я Андрій, шукаю годинник» — і знайомство, і годинники", /Приємно познайомитись/.test(andriy.text) && items(andriy).every(p => p.category === "Годинники") && andriy.products.length > 0);
    check("«I am looking for a bag» — не ім'я, а запит", !introOf("I am looking for a bag") && one("I am looking for a bag", "en").products.length > 0);
    check("«я Київ», «я тут», «я дівчина» — не імена", !introOf("я Київ") && !introOf("я тут") && !introOf("я дівчина"));

    // Ім'я — у підсумку для власника, коли бот його кличе пізніше.
    const h = [];
    let last = null;
    for (const m of ["мене звати Оля", "чорна сумка Coach до 8000", "дайте знижку"]) {
        last = one(m, "uk", h);
        h.push({ author: "visitor", body: m });
        if (last) h.push({ author: "bot", body: bot.serializeBotReply(last, "uk") });
    }
    const tg = bot.botTelegramText(bot.serializeBotReply(last, "uk"), 3, s => s);
    check("у Telegram — «👤 Оля · 🔎 Шукає: …»", /👤 Оля · 🔎 Шукає: чорні сумки Coach до 8 000 ₴/.test(tg), tg.split("\n").pop());

    check("«я з Києва» — доставка в будь-яке місто, а не «не зрозумів»", /в будь-яке місто України/.test(one("я з Києва").text));
    check("«я з Польщі» — не «в будь-яке місто України»", !/в будь-яке місто України/.test(one("я з Польщі").text));
}

console.log("\n[34] Сорок свіжих повідомлень: рік ≠ бюджет, тренди, барсетка, країна, каталог (10.11.2026)");
{
    const one = (m, lang) => bot.botReply(m, [], data, { lang: lang || "uk", now: NOW, siteUrl: "https://bestbrnd4u.com" }) || { text: "", products: [], intent: null };
    // Не «не зрозумів»: той теж кличе власника, і перевірка була б зелена й на старому боті.
    const askOwner = r => r.handoff && r.pause === false && !r.products.length && r.intent !== "unknown";

    // Неправильні відповіді.
    check("«трендові сумки 2026» — рік, а не бюджет «до 2 026 ₴»", !/2 026/.test(one("трендові сумки 2026").text));
    check("«бюджет до 2026 грн» — з «грн» це бюджет", /2 026 ₴/.test(one("бюджет до 2026 грн").text));
    const colleague = one("шукаю щось у подарунок колезі, бюджет невеликий");
    check("«бюджет невеликий» — найдоступніше, а не маленькі сумки", /найдоступніш/.test(colleague.text) && !/маленьк/.test(colleague.text), colleague.text.slice(0, 50));
    check("«маленька сумка» — як і раніше, маленькі", /маленькі сумки/.test(one("маленька сумка").text));
    check("«є щось під джинси?» — порада, а не «джинсів немає»", (r => r.products.length > 0 && !/джинсів/.test(r.text))(one("є щось під джинси?")));
    check("«хочу джинси» — як і раніше, «джинсів немає»", /джинсів/.test(one("хочу джинси").text));
    const kids = one("є дитячі окуляри?");
    check("«є дитячі окуляри?» — «дитячих окулярів немає», а не дорослі мовчки", /^Дитячих окулярів зараз немає/.test(kids.text) && !kids.products.length, kids.text.slice(0, 40));
    const vs = one("чим відрізняється Coach від Michael Kors?");
    check("«чим відрізняється Coach від Michael Kors?» — по дві кожного", /по дві моделі Coach і Michael Kors/.test(vs.text) && items(vs).some(p => p.brand === "Coach") && items(vs).some(p => p.brand === "Michael Kors"));
    check("ru «скидка студентам?» — менеджеру, а не підбірка знижок", askOwner(one("есть ли скидка студентам?", "ru")));

    // Нове розуміння.
    check("«що зараз модно?», ru «в тренде», «щоб пасувала до всього» — порада",
        ["що зараз модно?", "щоб пасувала до всього"].every(m => /радимо/.test(one(m).text)) && /советуем/.test(one("что сейчас в тренде?", "ru").text));
    check("«сумка на пляж» — шопери", /^Ось шопери/.test(one("мені треба сумка на пляж").text));
    check("«годинник для бігу» — спортивні", /^Ось спортивні годинники/.test(one("потрібен годинник для бігу").text));
    check("«хочу клатч на весілля», ru «на свадьбу», en «for a wedding» — клатчі",
        /клатчі/.test(one("хочу клатч на весілля").text) && /клатчи/.test(one("нужна сумка на свадьбу", "ru").text) && /clutches/.test(one("something for a wedding", "en").text));
    check("«годинник на весілля» — годинники, а не клатчі", /^Ось годинники/.test(one("годинник на весілля").text));
    const bars = one("барсетка");
    check("«барсетка» — чоловічі сумки", /^Ось чоловічі сумки/.test(bars.text) && items(bars).every(p => p.department === "Сумки"), bars.text.slice(0, 30));
    check("«портфель для документів» — сумки під ноутбук (за габаритами)", /ноутбук 13″/.test(one("портфель для документів").text));
    check("«сумка-конверт» — «немає» і інші сумки", /^Сумок-конвертів зараз немає/.test(one("сумка-конверт").text));
    check("«візитниця є?» — «немає, але є гаманці»", (r => /^Візитниць у нас зараз немає/.test(r.text) && items(r).every(p => p.category === "Гаманці"))(one("візитниця є?")));
    check("«сумки з Італії?», «якої країни виробництва?» — менеджеру, з тим, що відомо (США)",
        ["сумки з Італії є?", "а якої країни виробництва?"].every(m => (r => askOwner(r) && /США/.test(r.text))(one(m))));
    check("«ви на OLX є?», «на Rozetka?» — менеджеру", askOwner(one("ви на OLX є?")) && askOwner(one("а на Rozetka продаєте?")));
    check("«оригінал? на олх дешевше» — як і раніше, про оригінальність", /оригінальні/.test(one("а у вас реально оригінал? бо на олх такі самі дешевше").text));
    check("ru «работаете с юрлицами?» — менеджеру", askOwner(one("работаете с юрлицами?", "ru")));
    check("«дайте посилання на каталог» — посилання", /\/catalog/.test(one("дайте посилання на каталог").text));
    check("«сайт англійською?» — три мовні версії з посиланнями", (r => /\/en\//.test(r.text) && /\/ru\//.test(r.text))(one("у вас є сайт англійською?")));
    check("en «are prices in dollars?» — у гривнях", /^Prices on the website are in hryvnias/.test(one("are prices in dollars?", "en").text));
}

console.log("\n[35] Людина вагається: «не можу вибрати», «яка краща?», якість (10.11.2026)");
{
    const chat = (lang, msgs, page) => {
        const h = [];
        let r = null;
        for (const m of msgs) {
            r = bot.botReply(m, h, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com", page: page || "" });
            h.push({ author: "visitor", body: m });
            if (r) h.push({ author: "bot", body: bot.serializeBotReply(r, r.lang || lang) });
        }
        return r || { text: "", products: [], intent: null };
    };
    const coach = items(chat("uk", ["сумка coach"]));

    // Раніше — «не зрозумів» і дзвінок власнику.
    for (const [lang, m] of [["uk", "не можу вибрати"], ["uk", "яка з них краща?"], ["uk", "що б ви взяли?"], ["ru", "какая из них лучше?"], ["en", "I can't decide"]]) {
        const r = chat(lang, [lang === "en" ? "coach bag" : lang === "ru" ? "сумка коуч" : "сумка coach", m]);
        check(`«${m}» після підбірки — показані поруч (ціна, матеріал, габарити), без дзвінка`,
            r.intent === "product" && !r.handoff && /\n1\. «/.test(r.text) && /\n2\. «/.test(r.text) && /₴/.test(r.text), r.text.slice(0, 40));
    }
    check("ru «какая лучше?» — не «самые дорогие»", !/самые дорогие/.test(chat("ru", ["сумка коуч", "какая из них лучше?"]).text));
    check("«найдорожчі сумки» — як і раніше, найдорожчі", /найдорожчі/.test(chat("uk", ["найдорожчі сумки"]).text));
    const between = chat("uk", ["сумка coach", "допоможіть вибрати між першою і третьою"]);
    check("«вибрати між першою і третьою» — саме ці дві поруч (а не «я бот-помічник»)", /^Порівняння/.test(between.text)
        && between.text.includes(coach[0].title.uk) && between.text.includes(coach[2].title.uk), between.text.slice(0, 40));
    check("en «I can't decide» — не «моделі немає»", !/There's no “I can't decide”/.test(chat("en", ["coach bag", "I can't decide"]).text));

    // «Брат» — лише брат.
    const bagP = data.products.find(p => p.department === "Сумки" && p.inStock);
    const worth = chat("uk", ["варто брати?"], "/p/" + bagP.slug + "/");
    check("«варто брати?» на сторінці сумки — не «чоловічі речі»", !/чоловічі/.test(worth.text) && /оригінал/.test(worth.text), worth.text.slice(0, 40));
    check("«подарунок брату» — як і раніше, чоловічі речі", /чоловічі/.test(chat("uk", ["подарунок брату"]).text));
    check("«а вона якісна?», «довго прослужить?» — оригінал, гарантія, 14 днів",
        ["а вона якісна?", "довго прослужить?"].every(m => (r => /оригінал/.test(r.text) && /14 днів/.test(r.text) && !r.handoff)(chat("uk", [m]))));
    check("«я ще подумаю» — «звісно, подумайте», без дзвінка", (r => /^Звісно, подумайте/.test(r.text) && !r.handoff)(chat("uk", ["я ще подумаю"])));
    check("«мені всі подобаються 😅» — подяка, а не «не зрозумів»", /приємно/.test(chat("uk", ["мені всі подобаються 😅"]).text));
    check("«хочу щось незвичайне» — порада", /радимо/.test(chat("uk", ["хочу щось незвичайне"]).text));
    const sim = chat("uk", ["сумка coach", "а є ще щось схоже на другу?"]);
    check("«схоже на другу?» — схожі на неї (а не опис другої)", /^Схожі на «/.test(sim.text) && sim.products.length > 0 && sim.products.every(p => p.slug !== coach[1].slug), sim.text.slice(0, 40));
}

console.log("\n[36] Подарунок кому: стать за словом (10.11.2026)");
{
    const g = m => (bot.parseWish(m, data) || {}).gender || null;
    // Раніше «подарунок бабусі / тещі / дочці / дідусю» — «для кого?»,
    // хоч сказано прямо.
    const female = ["подарунок тещі", "подарунок свекрусі", "подарунок бабусі", "подарунок дочці", "подарунок нареченій", "подарунок коханій", "подарунок начальниці", "подарунок вчительці", "подарунок хрещеній", "подарок теще", "подарок свекрови", "подарок бабушке", "подарок любимой", "gift for grandma", "gift for my daughter"];
    const male = ["подарунок дідусю", "подарунок нареченому", "подарунок коханому", "подарунок начальнику", "подарунок синові", "подарок дедушке", "подарок жениху", "gift for my son", "gift for grandpa"];
    const missF = female.filter(m => g(m) !== "Жінкам"), missM = male.filter(m => g(m) !== "Чоловікам");
    check(`${female.length} «жіночих» адресатів — жінкам`, !missF.length, missF.join(", "));
    check(`${male.length} «чоловічих» адресатів — чоловікам`, !missM.length, missM.join(", "));
    // Двозначні — свідомо без статі: бот перепитає, а не вгадає.
    check("«колезі», «gift for my boss» — стать не вгадуємо", g("подарунок колезі") === null && g("gift for my boss") === null);
    check("«синя сумка», «сусідка порадила вас» — не стать", g("синя сумка") === null && g("сусідка порадила вас") === null);
    check("«варто брати?» — не «брат»", g("варто брати?") === null);
    const gran = bot.botReply("подарунок бабусі", [], data, { lang: "uk", now: NOW });
    check("«подарунок бабусі» — жіночі речі одразу, а не «для кого?»", gran.intent === "products" && /жіночі/.test(gran.text), gran.text.slice(0, 40));
}

console.log("\n[37] Розмір і місткість зі сторінки товару (10.11.2026)");
{
    const on = (m, page, lang) => bot.botReply(m, [], data, { lang: lang || "uk", now: NOW, siteUrl: "https://bestbrnd4u.com", page }) || { text: "" };
    const sizesOf = p => [...new Set(((p.details && p.details.variants) || []).flatMap(v => (v.sizes || []).map(x => String(x.size))))];
    // Товар із розмірами-літерами, де бракує розміру, що є в іншої моделі того ж бренду й розділу.
    const letter = data.products.find(p => sizesOf(p).length === 1 && /^[SML]$/.test(sizesOf(p)[0])
        && data.products.some(q => q !== p && q.brand === p.brand && q.category === p.category && sizesOf(q).some(x => /^[SML]$/.test(x) && x !== sizesOf(p)[0])));
    if (letter) {
        const mine = sizesOf(letter)[0];
        const other = data.products.find(q => q !== letter && q.brand === letter.brand && q.category === letter.category && sizesOf(q).some(x => /^[SML]$/.test(x) && x !== mine));
        const want = sizesOf(other).find(x => /^[SML]$/.test(x) && x !== mine);
        const r = on(`а розмір ${want} є?`, `/p/${letter.slug}/`);
        check(`«а розмір ${want} є?» (є лише ${mine}) — прямо «немає» і де він є`,
            new RegExp(`Розміру ${want} у цієї моделі немає — є: ${mine}`).test(r.text) && r.text.includes(`/p/${other.slug}/`), r.text.replace(/\n/g, " ").slice(0, 90));
        check(`«а розмір ${mine} є?» — «так»`, new RegExp(`Так, розмір ${mine} є`).test(on(`а розмір ${mine} є?`, `/p/${letter.slug}/`).text));
    }
    const sneaker = data.products.find(p => p.category === "Кросівки" && sizesOf(p).length > 1);
    const bare = on("а 45 є?", `/p/${sneaker.slug}/`);
    check("«а 45 є?» на сторінці кросівок — про розмір (раніше «є в наявності»), розміри по порядку",
        /^Розміру 45 у цієї моделі немає — є: /m.test(bare.text) && (l => l.join() === l.slice().sort((a, b) => a - b).join())((bare.text.match(/є: ([\d, ]+)/) || [, ""])[1].split(", ").map(Number)), bare.text.replace(/\n/g, " ").slice(0, 80));
    check("«є?» саме — як і раніше, наявність", /в наявності|під замовлення/i.test(on("є?", `/p/${sneaker.slug}/`).text));

    // «А4 влізе?» — з габаритів картки, а не просто габарити.
    const dimsOf = p => (String((p.details && p.details.dimensions && p.details.dimensions.uk) || "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) || []).map(Number).sort((a, b) => b - a);
    const small = data.products.find(p => p.department === "Сумки" && dimsOf(p).length >= 2 && dimsOf(p)[0] < 30);
    const big = data.products.find(p => p.department === "Сумки" && dimsOf(p).length >= 2 && dimsOf(p)[0] >= 31 && dimsOf(p)[1] >= 22);
    check("«а А4 влізе?» у маленькій — «не влізе»", /аркуш А4 \(29,7 × 21 см\) не влізе/.test(on("а А4 влізе?", `/p/${small.slug}/`).text));
    check("«ноутбук влізе?» у великій — «має влізти», з застереженням", /ноутбук 13″[^.]*має влізти\. Точно/.test(on("ноутбук влізе?", `/p/${big.slug}/`).text));
    check("«скільки влазить?» — габарити, а не «не зрозумів»", /Розміри: /.test(on("скільки влазить?", `/p/${small.slug}/`).text));

    check("«шопер розмір S» у пошуку — лише з розміром S", (r => r.products.length > 0 && items(r).every(p => sizesOf(p).includes("S")))(bot.botReply("шопер розмір S", [], data, { lang: "uk", now: NOW })));
    check("«підійдуть на широке обличчя?» — порада менеджера й окуляри", (r => r.handoff && r.products.length > 0)(on("підійдуть на широке обличчя?", "/p/" + data.products.find(p => /Окуляри/.test(p.category)).slug + "/")));
}

console.log("\n[38] Після оформлення: «що далі?», «оплатила, а статус не змінився» (10.11.2026)");
{
    const one = (m, lang) => bot.botReply(m, [], data, { lang: lang || "uk", now: NOW, siteUrl: "https://bestbrnd4u.com" }) || { text: "" };
    // Раніше — «не зрозумів» і дзвінок власнику.
    for (const [m, lang, re] of [["оформила, що далі?", "uk", /^Дякуємо за замовлення!/], ["оформила замовлення", "uk", /^Дякуємо за замовлення!/], ["оформила заказ, что дальше?", "ru", /^Спасибо за заказ!/], ["I placed an order, what happens next?", "en", /^Thank you for your order!/]]) {
        const r = one(m, lang);
        check(`«${m}» — що буде далі (підтвердження, 1–2 дні, Нова пошта), без дзвінка`, re.test(r.text) && /order-status/.test(r.text) && !r.handoff, r.text.slice(0, 40));
    }
    const paid = one("оплатила карткою, а статус не змінився");
    check("«оплатила, а статус не змінився» — власнику (раніше — довідка про оплату карткою)", paid.handoff && /Оплату перевіряє менеджер/.test(paid.text), paid.text.slice(0, 40));
    check("«замовила чорну сумку, де вона?» — про замовлення, а не підбірка чорних сумок", (r => r.intent === "status" && !r.products.length)(one("замовила чорну сумку, де вона?")));
    // Що вже працювало — так і лишилось.
    check("«оформила, коли зателефонуєте?» — як і раніше, «менеджер звʼяжеться»", /звʼяжеться/.test(one("Я оформила замовлення, коли зателефонуєте?").text));
    check("«хочу скасувати, оформила вчора» — як і раніше, скасування", /Скасувати/.test(one("хочу скасувати, оформила вчора").text));
    check("номер і телефон після «оформила» — як і раніше, перевірка", one("оформила замовлення 8689484479 телефон 0671234567").intent === "lookup");
    check("«підтвердження не прийшло» — як і раніше, перевірка стану й власник", (r => r.intent === "status" && r.handoff)(one("я оформив замовлення, а підтвердження не прийшло")));
}

console.log("\n[39] Не зрозумів — власнику готові ключові слова; «примірочна» (10.11.2026)");
{
    const tg = (m, lang) => {
        const r = bot.botReply(m, [], data, { lang: lang || "uk", now: NOW, siteUrl: "https://bestbrnd4u.com" });
        return [r, bot.botTelegramText(bot.serializeBotReply(r, lang || "uk"), 1, s => s)];
    };
    const [r1, t1] = tg("а можна зробити гравіювання ініціалів?");
    check("не зрозумів — у Telegram «🔑 Ключові слова для автовідповіді: «гравіюван», «ініціал»»",
        r1.intent === "unknown" && /🔑 Ключові слова для автовідповіді: «гравіюван», «ініціал»/.test(t1), t1.split("\n").pop());
    check("службові слова й дієслова («можна», «зробити») — не ключові", !/«можна»|«зроби/.test(t1));
    const [, t2] = tg("do you offer engraving?", "en");
    check("англійською — «engravi», без «offer»", /«engravi»/.test(t2) && !/«offer»/.test(t2), t2.split("\n").pop());
    // Ключові слова — саме ті основи, які адмінка розуміє: автовідповідь із
    // ними справді спрацьовує на те саме питання.
    const keys = (t1.match(/🔑[^:]*: (.+)$/m) || [, ""])[1].split(", ").map(k => k.replace(/[«»]/g, ""));
    const taught = Object.assign({}, data, { answers: [{ keywords: keys, answer: { uk: "Гравіювання не робимо.", en: "", ru: "" }, link: "" }] });
    check("автовідповідь із запропонованими словами відповідає на те саме питання",
        bot.botReply("а можна зробити гравіювання ініціалів?", [], taught, { lang: "uk", now: NOW }).text === "Гравіювання не робимо.");
    const [r3, t3] = tg("сумка");
    check("звичайна відповідь — без ключових слів", !/🔑/.test(t3) && !/\[\[keys/.test(bot.serializeBotReply(r3, "uk")));
    check("«чи є у вас примірочна?» — «магазин працює тільки з доставкою», а не «що шукаєте?»", /тільки з доставкою/.test(tg("чи є у вас примірочна?")[0].text));
}

console.log("\n[40] Довгі розмови: знижка раніше за стать, «краща за Coach», номер у підбірці (10.11.2026)");
{
    const chat = (lang, msgs) => {
        const h = [];
        let r = null;
        for (const m of msgs) {
            r = bot.botReply(m, h, data, { lang, now: NOW, siteUrl: "https://bestbrnd4u.com" });
            h.push({ author: "visitor", body: m });
            if (r) h.push({ author: "bot", body: bot.serializeBotReply(r, r.lang || lang) });
        }
        return r || { text: "", products: [] };
    };

    // «Подарунок мужу» → годинники → «а со скидкой?», а чоловічих зі знижкою
    // немає: раніше — жіночі зі знижкою, тепер — чоловічі без знижки.
    const menSale = data.products.some(p => p.category === "Годинники" && (p.gender || []).includes("Чоловікам") && bot.botPriceNow(p, NOW) < (p.oldPrice || p.price));
    if (!menSale) {
        const r = chat("ru", ["нужен подарок мужу", "часы", "а со скидкой?"]);
        check("«мужские часы со скидкой», а таких немає — чоловічі без знижки, а не жіночі", r.products.length > 0
            && items(r).every(p => !(p.gender || []).length || (p.gender || []).some(g => g !== "Жінкам")) && /Вот ближайшее — мужские часы/.test(r.text), r.text.slice(0, 80));
    }
    const vs = chat("uk", ["Jacquemus", "а чим вона краща за Coach?"]);
    check("«Jacquemus» → «чим вона краща за Coach?» — по дві обох", /Jacquemus і Coach/.test(vs.text) && items(vs).some(p => p.brand === "Jacquemus") && items(vs).some(p => p.brand === "Coach"), vs.text.slice(0, 60));

    // Номер у підбірці — лише серед карток: відповідь про одну річ із
    // посиланням раніше ставала «новою підбіркою», і «перша» була нею.
    const rb = items(chat("uk", ["Ray-Ban"]));
    const after = chat("uk", ["Ray-Ban", "а четверта поляризована?", "розкажіть про першу"]);
    check("після питання про четверту «розкажіть про першу» — саме перша з підбірки", rb.length >= 4 && after.text.includes(rb[0].title.uk), after.text.slice(0, 60));
    const polar = rb.find(p => /polari|поляриз/i.test(p.title.uk + p.title.en + JSON.stringify(p.keywords)));
    const notPolar = rb.find(p => !/polari|поляриз/i.test(p.title.uk + p.title.en + JSON.stringify(p.keywords)));
    if (polar) check("«а N-та поляризована?» — «так, у картці зазначено»", /у картці зазначено поляризовані/.test(chat("uk", ["Ray-Ban", `а ${["перша", "друга", "третя", "четверта"][rb.indexOf(polar)]} поляризована?`]).text));
    if (notPolar) check("не вказано в картці — «не вказано», власнику, а не загальний опис", (r => r.handoff && /не вказано/.test(r.text) && !/Ціна —/.test(r.text))(chat("uk", ["Ray-Ban", `а ${["перша", "друга", "третя", "четверта"][rb.indexOf(notPolar)]} поляризована?`])));

    check("«маломірять?» після розмови про кросівки — таблиця розмірів, а не список розмірів",
        /Таблиця розмірів/.test(chat("uk", ["кросівки", "скільки коштує перша?", "маломірять?"]).text));
    const colors = chat("uk", ["жіночі гаманці", "а які є кольори?"]);
    check("«а які є кольори?» після підбірки — кольори кожної, а не «про яку з них?»", /^Кольори показаних/.test(colors.text) && /\n1\. /.test(colors.text), colors.text.slice(0, 40));
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
