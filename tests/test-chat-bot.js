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
        /const saved = await insertChatMessage\(thread\.id, "visitor"[\s\S]*telegram\("sendMessage"[\s\S]*answerWithBot\(thread, saved, text, body\.lang\)/.test(src));
    check("помилка бота не ламає відповідь сайту", /answerWithBot\([^)]*\)\.catch\(/.test(src));
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

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
