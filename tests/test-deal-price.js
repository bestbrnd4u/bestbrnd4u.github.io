// Ціна дня: акція, яка на певний час справді міняє ціну товару.
//
// НАВІЩО ЦЕ ЗРОБЛЕНО
// -------------------
// «Тільки сьогодні ця сумка за 8 600» — не банер зі знижкою, а нова
// ціна. Покупець мусить бачити її скрізь, де взагалі бачить ціну, і
// мати змогу купити просто з головної.
//
// ЩО ТУТ ЗАКРІПЛЕНО
// ------------------
// 1. ЦІНУ ЧИТАЄ ОДНА ФУНКЦІЯ. priceNow() — і картка, і кошик, і
//    оформлення, і статистика. Це не охайність: суму замовлення
//    ПЕРЕРАХОВУЄ БАЗА за власною копією цін (тригер із 014/029). Одне
//    місце, яке порахує стару ціну, — і чесне замовлення отримає
//    позначку «сума не збігається», ту саму, якою ловлять підміну
//    ціни в консолі.
//
// 2. САЙТ І БАЗА РАХУЮТЬ ОДНАКОВО. Три реалізації одного правила —
//    saleActive() у браузері, dealActive() у збірці, умова в SQL —
//    звіряються тут на тих самих межах.
//
// 3. ВІКНО ЇДЕ В БАЗУ, А НЕ ГОТОВА ЦІНА. Знімок цін приїжджає раз на
//    збірку; готова ціна почала б діяти не о 18:00, а будь-коли.
//
// 4. БІЛЯ МЕЖІ ВІКНА ЧЕСНЕ ЗАМОВЛЕННЯ НЕ ПОЗНАЧАЄТЬСЯ. Сторінку
//    відкрили о 17:58, кнопку натиснули о 18:01 — браузер надішле те,
//    що людина бачила.
//
// 5. БЛОК НА ГОЛОВНІЙ ПОКАЗУЄ ЛИШЕ ТЕ, ЩО СПРАВДІ ПОДЕШЕВШАЛО.
//
// 6. ФІД ЗНАЄ ПРО ВІКНО. Інакше Google показував би акційну ціну з
//    моменту збірки й ще добу після кінця — це розбіжність зі
//    сторінкою товару, за яку Merchant Center знімає товари з показу.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const common = read("assets/js/common.js");

// Живі функції з common.js — перевіряємо поведінку, а не текст файлу.
const api = (() => {

    const parts = [
        /function saleActive[\s\S]*?\n}\n/,
        /function priceNow[\s\S]*?\n}\n/,
        /function oldPriceNow[\s\S]*?\n}\n/,
        /function discountPercent[\s\S]*?\n}\n/
    ].map(pattern => {

        const found = common.match(pattern);

        if (!found) throw new Error("не знайшов у common.js: " + pattern);

        return found[0];

    });

    return new Function(parts.join("\n")
        + "return { saleActive, priceNow, oldPriceNow, discountPercent };")();

})();

const FROM = "2026-09-11T18:00:00Z";
const TO = "2026-09-12T03:00:00Z";

const deal = { price: 8600, from: FROM, to: TO };

const bag = { id: 57, price: 9000, sale: deal };

const at = text => Date.parse(text);


console.log("\n[1] Ціна залежить від годинника, а не від збірки");
{
    check("до початку — звичайна",
        api.priceNow(bag, at("2026-09-11T17:59:59Z")) === 9000);

    check("рівно на початку — вже акційна",
        api.priceNow(bag, at(FROM)) === 8600);

    check("посеред вікна — акційна",
        api.priceNow(bag, at("2026-09-11T23:00:00Z")) === 8600);

    // Кінець НЕ включно: «до 03:00» читається як «о 03:00 вже ні».
    check("рівно в кінці — знову звичайна",
        api.priceNow(bag, at(TO)) === 9000);

    check("після кінця — звичайна",
        api.priceNow(bag, at("2026-09-12T09:00:00Z")) === 9000);

    check("товар без ціни дня не змінився",
        api.priceNow({ price: 5000 }) === 5000
        && api.oldPriceNow({ price: 5000 }) === 0);

    check("нуль або відсутня ціна дня — не ціна",
        api.priceNow({ price: 5000, sale: { price: 0 } }) === 5000
        && api.priceNow({ price: 5000, sale: {} }) === 5000);

    // «Ціна дня без дат» — знижена ціна, поки акцію не приберуть.
    check("без дат діє завжди",
        api.priceNow({ price: 9000, sale: { price: 8600 } }, at("2030-01-01T00:00:00Z")) === 8600);
}


console.log("\n[2] Перекреслюємо те, що було вчора");
{
    // Товар міг продаватись за 9 000 при «старій» 12 000. Але вчора
    // він коштував саме 9 000 — і саме це правда.
    const both = { price: 9000, oldPrice: 12000, sale: deal };

    check("поки йде ціна дня — перекреслена звичайна",
        api.oldPriceNow(both, at("2026-09-11T20:00:00Z")) === 9000);

    check("поза вікном — власна стара ціна товару",
        api.oldPriceNow(both, at("2026-09-12T20:00:00Z")) === 12000);

    check("відсоток знижки враховує ціну дня",
        api.discountPercent(bag, at("2026-09-11T20:00:00Z")) === 4,
        api.discountPercent(bag, at("2026-09-11T20:00:00Z")));

    check("поза вікном знижки немає",
        api.discountPercent(bag, at("2026-09-12T20:00:00Z")) === 0);
}


console.log("\n[3] Браузер, збірка й бот рахують вікно однаково");
{
    const { dealActive } = require("../scripts/promo-deals.js");

    const moments = [
        "2026-09-11T17:59:59Z",
        FROM,
        "2026-09-11T23:00:00Z",
        TO,
        "2026-09-12T09:00:00Z"
    ];

    const same = moments.every(moment =>
        api.saleActive(bag, at(moment)) === dealActive(deal, at(moment)));

    check("saleActive() і dealActive() згодні на всіх межах", same,
        moments.map(m => `${m}: ${api.saleActive(bag, at(m))}/${dealActive(deal, at(m))}`).join(", "));

    // Бот — окремий рантайм зі своєю копією правила. Дані він бере з
    // того самого data/products.json, тобто ціна дня до нього
    // приїжджає; питання лише в тому, чи він її читає. Поки не читав,
    // КОЖНЕ замовлення з бота під час сейлу отримувало б позначку
    // «сума не збігається».
    const bot = read("supabase/functions/telegram-order-bot/format.js");

    check("у бота теж є це правило",
        /function saleActive/.test(bot) && /function priceNow/.test(bot)
        && /function oldPriceNow/.test(bot));

    const flow = read("supabase/functions/telegram-order-bot/order-flow.js");

    check("суму замовлення бот рахує з ціни дня",
        /const price = priceNow\(product\);/.test(flow)
        && /const oldPrice = oldPriceNow\(product\);/.test(flow));

    check("і в рядок замовлення кладе її саму",
        /price: priceNow\(product\),/.test(flow));

    check("картка товару в боті показує ту саму ціну",
        /const shown = priceNow\(product\);/.test(bot));

    // index.ts деплоять — якщо він застарів, у Supabase поїде
    // попередня версія, і бот далі продаватиме за старою ціною.
    check("зібрана функція не застаріла",
        /function priceNow/.test(read("supabase/functions/telegram-order-bot/index.ts")));
}


console.log("\n[4] Збірка ставить ціну дня рівно на обрані товари");
{
    const { readDeals } = require("../scripts/promo-deals.js");

    const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "deals-"));

    const write = (name, data) =>
        fs.writeFileSync(path.join(dir, name), JSON.stringify(data), "utf8");

    write("a.json", { dealPrice: 8600, products: [57], startsAt: FROM, endsAt: TO, title: "A" });
    write("b.json", { dealPrice: 7000, products: [57], title: "B" });
    write("c.json", { dealPrice: 5000, products: [], title: "C" });
    write("d.json", { dealPrice: 4000, products: [12], active: false, title: "D" });
    write("e.json", { products: [13], title: "E" });

    const { deals, warnings } = readDeals(dir);

    check("ціна дня потрапила на обраний товар", deals[57] && deals[57].price === 8600);

    check("вимкнена акція ціни не міняє", !deals[12]);

    check("акція без ціни дня нічого не ставить", !deals[13]);

    check("один товар — одна ціна дня, перша за іменем файлу",
        deals[57].price === 8600);

    check("про дві ціни на товар сказано вголос",
        warnings.some(text => /товар 57/.test(text) && /двох акціях/.test(text)),
        warnings.join(" | "));

    check("про ціну дня без товарів теж",
        warnings.some(text => /c\.json/.test(text) && /не вибрано/.test(text)),
        warnings.join(" | "));

    fs.rmSync(dir, { recursive: true, force: true });

    // Ціну дня ставить АКЦІЯ, а не правка товару, і живе вона кілька
    // годин. Якби вона входила у відбиток, товар ставав би
    // «оновленим сьогодні» двічі за добу — коли сейл почався і коли
    // скінчився, — а дата ця йде в sitemap як lastmod.
    const build = read("scripts/build-products.js");

    check("початок сейлу не вважається правкою товару",
        /if \(key === "sale"\) return undefined;/.test(
            build.slice(build.indexOf("function contentHash"),
                build.indexOf("function stampUpdated"))));
}


console.log("\n[5] Вікно доїжджає в базу");
{
    const { rows } = require("../scripts/push-prices.js");

    const sample = rows([
        { id: 57, price: 9000, sale: { price: 8600, from: FROM, to: TO } },
        { id: 58, price: 5000 }
    ]);

    check("ціна дня їде окремим полем", sample[0].sale_price === 8600);

    check("разом із вікном",
        sample[0].sale_from === FROM && sample[0].sale_to === TO);

    // PostgREST вимагає однакового набору ключів у пакеті: рядок без
    // цих полів завалив би весь знімок цін.
    check("у товару без ціни дня поля теж є, порожні",
        "sale_price" in sample[1] && sample[1].sale_price === null
        && sample[1].sale_from === null && sample[1].sale_to === null);

    check("звичайна ціна лишається звичайною — базі потрібні обидві",
        sample[0].price === 9000);
}


console.log("\n[6] База рахує ту саму ціну");
{
    const sql = read("supabase/migrations/029-deal-price.sql");

    check("у знімку цін є місце для вікна",
        /add column if not exists sale_price/.test(sql)
        && /sale_from\s+timestamptz/.test(sql)
        && /sale_to\s+timestamptz/.test(sql));

    check("тригер читає вікно",
        /select price, old_price, sale_price, sale_from, sale_to/.test(sql));

    // Те саме правило, що saleActive(): задана ціна, момент не раніше
    // за початок і СТРОГО раніше за кінець.
    check("правило те саме, що в браузері",
        /v_sale, 0\) > 0/.test(sql)
        && /v_from is null or v_now >= v_from/.test(sql)
        && /v_to\s+is null or v_now <\s+v_to/.test(sql));

    check("момент — час замовлення, а не час збірки",
        /v_now\s+timestamptz := coalesce\(new\.created_at, now\(\)\)/.test(sql));

    check("сума рахується за чинною ціною",
        /v_goods\s*:=\s*v_goods\s*\+\s*v_unit\s*\* v_qty/.test(sql));

    // Сторінку відкрили о 17:58, кнопку натиснули о 18:01.
    check("біля межі вікна приймається і попередня ціна",
        /c_grace/.test(sql)
        && /v_goods_alt/.test(sql)
        && /abs\(coalesce\(new\.total, 0\) - v_total_alt\) > 1/.test(sql));

    check("у панель іде сума за ЧИННОЮ ціною",
        /new\.total_expected := v_total;/.test(sql)
        && !/new\.total_expected := v_total_alt/.test(sql));

    // Той самий принцип, що в 014: тригер стоїть на шляху кожного
    // замовлення. 025 цей блок загубила — без нього будь-яка
    // несподіванка в перевірці означала б, що магазин перестає
    // приймати замовлення.
    check("будь-яка помилка не зупиняє замовлення",
        /exception[\s\S]{0,500}when others[\s\S]{0,200}return new/.test(sql));

    check("суму замовлення не переписує",
        !/new\.total\s*:=\s*[^=]/.test(sql));

    check("сказано, які міграції потрібні раніше",
        /014-order-pricing\.sql/.test(sql) && /025-promo-codes\.sql/.test(sql));
}


console.log("\n[7] Блок «ціна дня» на головній");
{
    const app = read("assets/js/app.js");
    const build = read("scripts/build-promotions.js");
    const admin = read("admin/config.yml");
    const index = read("index.html");

    check("збірка знає новий спосіб показу", /"deal_of_day"/.test(build));

    check("адмінка пропонує його власнику",
        /value: "deal_of_day"/.test(admin));

    check("на головній є місце під блок",
        /id="dealPromotionsSection"/.test(index));

    check("порядок блоків теж можна змінити",
        /value: "deal-of-day"/.test(admin)
        && /data-section="deal-of-day"/.test(index));

    check("блок малюється", /function renderDealPromotions/.test(app));

    // Акція може підхоплювати цілий бренд, а ціну дня збірка ставить
    // рівно на обраний список. Блок із двадцяти шести карток, де
    // знижена одна, обіцяв би те, чого немає.
    check("показує лише обрані товари",
        /chosen\.includes\(Number\(product\.id\)\)/.test(app));

    // Кнопка «Купити» вже є у звичайній картці — разом із вибором
    // кольору, розміру й ціною через priceNow().
    check("купити можна просто звідси",
        /createProductCard\(product\)/.test(
            app.slice(app.indexOf("function renderDealPromotions"))));

    check("відлік той самий, що на банерах",
        /promoTimerTag\(promo\)/.test(
            app.slice(app.indexOf("function renderDealPromotions"))));

    // promoTimerTag жила всередині initPromotions — і слайдер із
    // великим банером падали на ReferenceError, мовчки лишаючи
    // головну без цих блоків.
    check("таймер видно всім, хто малює банери",
        /^function promoTimerTag/m.test(app) && /^function tickPromoTimers/m.test(app));
}


console.log("\n[8] Картка показує ціну дня");
{
    const ui = read("assets/js/ui.js");

    const card = (() => {

        const parts = [
            /function saleActive[\s\S]*?\n}\n/,
            /function priceNow[\s\S]*?\n}\n/,
            /function oldPriceNow[\s\S]*?\n}\n/,
            /function discountPercent[\s\S]*?\n}\n/
        ].map(p => common.match(p)[0]);

        const fromUi = [
            /function cardPriceHtml[\s\S]*?\n}\n/,
            /function cardBadgeStack[\s\S]*?\n}\n/
        ].map(p => ui.match(p)[0]);

        return new Function(
            "formatPrice",
            parts.concat(fromUi).join("\n")
            + "return { cardPriceHtml, cardBadgeStack };")(v => `${v} грн`);

    })();

    const html = card.cardPriceHtml(bag);

    check("нову ціну показано", /8600 грн/.test(html), html);

    check("стару перекреслено", /old-price[^>]*>9000 грн/.test(html), html);

    check("позначка знижки теж рахується з ціни дня",
        /-4%/.test(card.cardBadgeStack(bag)), card.cardBadgeStack(bag));
}


console.log("\n[9] Фід не розходиться зі сторінкою товару");
{
    const feed = read("scripts/build-feed.js");

    check("акційною стає ціна дня", /const salePrice = deal > 0 \? deal : price/.test(feed));

    check("перекресленою — найбільша з відомих",
        /const listPrice = /.test(feed) && /oldPrice > price \? oldPrice : price/.test(feed));

    check("Google отримує вікно, а не лише ціну",
        /sale_price_effective_date/.test(feed) && /function saleWindow/.test(feed));

    check("тег справді потрапляє в XML",
        /tag\("sale_price_effective_date", item\.sale_price_effective_date\)/.test(feed));

    // Звичайна знижка (стара ціна в картці) кінця не має — вигадувати
    // його для Google не можна.
    check("у звичайної знижки вікна немає",
        /deal > 0 && onSale[\s\S]{0,60}saleWindow/.test(feed));
}


console.log(failures === 0
    ? "\n✅ Ціна дня: сайт, збірка й база рахують одну ціну\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
