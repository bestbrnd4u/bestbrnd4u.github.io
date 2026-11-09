// Мовні версії, етап 5: листи покупцю мовою замовлення.
//
// Покупець з /en/ оформлював англійською, а листи «прийнято»,
// «відправлено», прохання про відгук, подяка зі знижкою й підтвердження
// підписки приходили б українською. Мову тепер пам'ятає замовлення
// (orders.lang, міграція 044), а назву й колір товару — знімок
// замовлення (title_local, color_local).
//
// Окремо стережемо найдорожче: замовлення не мусить загубитись, якщо
// функцію чи сайт оновили раніше, ніж застосували міграцію.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "supabase/functions/telegram-order-bot");
const mail = require(path.join(DIR, "mail.js"));
const place = require(path.join(DIR, "place-order.js"));
const subscribe = require(path.join(DIR, "subscribe.js"));

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const payload = extra => Object.assign({
    order_number: "1234567890",
    phone: "+380501234567",
    items: [{ id: 1, title: "Сумка Coach Tabby", title_local: "Coach Tabby bag", color: "Чорний", color_local: "Black", price: 6500, qty: 1 }]
}, extra);

console.log("\n[1] Чистка замовлення: мова й переклад назви");
{
    check("en зберігається", place.cleanOrder(payload({ lang: "en" })).row.lang === "en");
    check("ru зберігається", place.cleanOrder(payload({ lang: "RU" })).row.lang === "ru");
    check("українська — без поля (рядок як досі)", !("lang" in place.cleanOrder(payload({ lang: "uk" })).row)
        && !("lang" in place.cleanOrder(payload({})).row));
    check("чужа мова — без поля", !("lang" in place.cleanOrder(payload({ lang: "de" })).row));
    const it = place.cleanOrder(payload({ lang: "en" })).row.items[0];
    check("назва й колір мовою покупця — у знімку, українські поряд",
        it.title_local === "Coach Tabby bag" && it.color_local === "Black" && it.title === "Сумка Coach Tabby" && it.color === "Чорний");
    const bare = place.cleanOrder(payload({ items: [{ id: 1, title: "Сумка", price: 1 }] })).row.items[0];
    check("без перекладу — полів немає зовсім", !("title_local" in bare) && !("color_local" in bare));
}

console.log("\n[2] Без міграції 044 замовлення не губиться");
{
    const M = place.orderLangColumnMissing;
    check("PostgREST: немає колонки lang", M(`{"code":"PGRST204","message":"Could not find the 'lang' column of 'orders' in the schema cache"}`));
    check("Postgres: немає колонки lang", M(`column "lang" of relation "orders" does not exist`));
    check("інша відмова (заблокована пошта) — не повтор", !M(`{"message":"blocked email"}`));
    check("відмова через іншу колонку — не повтор", !M(`Could not find the 'phone_key' column`));

    const src = read("supabase/functions/telegram-order-bot/_index.src.ts");
    check("функція повторює запис без мови саме на цю відмову",
        /orderLangColumnMissing\(detail\)[\s\S]{0,300}withoutLang[\s\S]{0,80}save\(withoutLang\)/.test(src));
    const checkout = read("assets/js/checkout.js");
    check("сторінка (прямий запис) так само",
        /error && order\.lang && \/'lang' column\|column "lang"\/i[\s\S]{0,200}withoutLang/.test(checkout));
    check("сторінка шле мову лише не для української",
        /if \(orderLang\(\)\) order\.lang = orderLang\(\);/.test(checkout)
        && /lang === "en" \|\| lang === "ru" \? lang : null/.test(checkout));
}

console.log("\n[3] Листи мовою замовлення");
const order = lang => ({
    lang, order_number: "1234567890", first_name: "Ann",
    subtotal: 6500, discount: 500, total: 6000,
    delivery_method: "На відділення «Нова пошта»", payment_method: "Готівкою при отриманні на пошті",
    tracking_number: "20450000000000",
    items: [{ title: "Сумка Coach Tabby", title_local: lang === "en" ? "Coach Tabby bag" : "Сумка Coach Tabby",
        color: "Чорний", color_local: lang === "en" ? "Black" : "Черный", size: "ONESIZE", qty: 1, price: 6500, slug: "coach-tabby" }]
});
const site = "https://bestbrnd4u.com";
const letters = o => ({
    order: mail.orderLetter(o, site),
    processing: mail.statusLetter(o, "processing", site),
    shipped: mail.statusLetter(o, "shipped", site),
    shippedNoTtn: mail.statusLetter({ ...o, tracking_number: null }, "shipped", site),
    completed: mail.statusLetter(o, "completed", site),
    cancelled: mail.statusLetter(o, "cancelled", site),
    review: mail.reviewLetter(o, site),
    thanks: mail.thankYouLetter(o, { code: "T5", percent: 5, expiresAt: "2026-12-01T00:00:00Z" }, site),
    subscribe: mail.subscribeConfirmLetter("https://x.test/c", site, o.lang)
});
const plain = letter => (letter.subject + " " + letter.html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
{
    ["en", "ru"].forEach(lang => {
        const all = letters(order(lang));
        const ukrainian = lang === "en" ? /[а-яіїєґ]/i : /[іїєґ]/i;
        const left = Object.entries(all).filter(([, l]) => ukrainian.test(plain(l))).map(([n, l]) => `${n}: «${plain(l).match(new RegExp(".{0,20}" + ukrainian.source + ".{0,20}", "i"))[0]}»`);
        check(`${lang}: у дев'яти листах жодного українського слова`, left.length === 0, left.join(" | "));
        const links = Object.values(all).flatMap(l => [...l.html.matchAll(/href="(https:\/\/bestbrnd4u\.com[^"]*)"/g)].map(m => m[1]));
        const bad = links.filter(h => !h.startsWith(`${site}/${lang}/`));
        check(`${lang}: посилання на сайт — мовною версією (${links.length})`, links.length > 8 && bad.length === 0, bad.slice(0, 3).join(" "));
    });
    const en = plain(mail.orderLetter(order("en"), site));
    check("en: назва й колір із замовлення", /Coach Tabby bag/.test(en) && /Black/.test(en), en.slice(0, 200));
    check("en: доставка й оплата перекладені", /Nova Poshta branch/.test(en) && /Cash on delivery/.test(en));
    check("en: сума в гривнях знаком ₴", /6 000 ₴/.test(en.replace(/ | /g, " ")), en.match(/Total[^A-Z]{0,20}/));
    check("en: дата знижки — по-англійськи", /valid until December 1/.test(plain(letters(order("en")).thanks)));
    check("ru: дата знижки — «1 декабря»", /1 декабря/.test(plain(letters(order("ru")).thanks)));
    check("ru: тема листа про відправлення", letters(order("ru")).shipped.subject === "Заказ 1234567890 отправлен");

    // Українська — як досі, у тому числі для замовлень без мови й з
    // невідомою мовою (старі замовлення, бот).
    [undefined, null, "uk", "de"].forEach(lang => {
        const o = order(lang);
        o.items[0].title_local = "Coach Tabby bag";
        const all = letters(o);
        const text = Object.values(all).map(plain).join(" ");
        const links = Object.values(all).flatMap(l => [...l.html.matchAll(/href="(https:\/\/bestbrnd4u\.com[^"]*)"/g)].map(m => m[1]));
        check(`мова ${String(lang)}: українською, без перекладених назв і мовних адрес`,
            all.order.subject === "Замовлення 1234567890 прийнято" && !/Coach Tabby bag/.test(text)
            && /Сумка Coach Tabby/.test(text) && !links.some(h => /\/(en|ru)\//.test(h)));
    });
}

console.log("\n[4] Підписка: лист і посилання мовою сторінки");
{
    const c = subscribe.cleanSubscriber({ email: "a@b.com", consent: true, lang: "en" });
    check("мова з форми", c.lang === "en" && !("lang" in c.subscriber), JSON.stringify(c));
    check("без мови — українська", subscribe.cleanSubscriber({ email: "a@b.com", consent: true }).lang === "uk");
    check("посилання підтвердження — /en/", subscribe.confirmUrl(site, "tok", "en") === `${site}/en/newsletter-confirm?token=tok`);
    check("українське — як досі", subscribe.confirmUrl(site, "tok") === `${site}/newsletter-confirm?token=tok`);
    const src = read("supabase/functions/telegram-order-bot/_index.src.ts");
    check("функція передає мову в лист і посилання",
        /sendSubscribeConfirmation\(clean\.subscriber\.email, clean\.lang\)/.test(src)
        && /confirmUrl\(SITE_URL, row\?\.token, lang\)/.test(src)
        && /subscribeConfirmLetter\(link, SITE_URL, lang\)/.test(src));
    check("форма на сайті шле мову сторінки", /site_action: "subscribe",[\s\S]{0,200}lang: \(window\.I18N && window\.I18N\.lang\)/.test(read("assets/js/subscribe.js")));
}

console.log("\n[5] Міграція 044");
{
    const sql = read("supabase/migrations/044-order-lang.sql");
    check("колонка lang і обмеження на три мови",
        /add column if not exists lang text/.test(sql) && /check \(lang is null or lang in \('uk', 'en', 'ru'\)\)/.test(sql));
    ["review_candidates", "thankyou_candidates"].forEach(fn => {
        const body = (sql.match(new RegExp(`create function public\\.${fn}[\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$`)) || [""])[0];
        check(`${fn} віддає lang (інакше листи з розкладу йдуть українською)`,
            /lang\s+text\s*\)/.test(body) && /o\.lang/.test(body));
        check(`${fn}: drop перед create (змінюється тип результату)`, new RegExp(`drop function if exists public\\.${fn}\\(integer, integer\\)`).test(sql));
        check(`${fn}: права лише service_role`, new RegExp(`grant execute on function public\\.${fn}\\(integer, integer\\) to service_role`).test(sql)
            && new RegExp(`revoke all on function public\\.${fn}\\(integer, integer\\) from anon, authenticated`).test(sql));
    });
    const bundle = read("supabase/functions/telegram-order-bot/index.ts");
    check("зібрана функція (index.ts) містить зміни", /orderLangColumnMissing/.test(bundle) && /mailLang/.test(bundle));
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
