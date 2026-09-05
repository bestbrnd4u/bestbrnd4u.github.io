// Списання залишків за замовленнями.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Залишки ставить людина, але зменшувати їх руками після кожного
// замовлення — робота, яку неминуче забудуть. Крок робить це сам:
// бере замовлення, яких ще не врахував, і зменшує залишок того
// кольору й розміру, який замовили.
//
// ГОЛОВНІ ВИМОГИ, ЯКІ СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// --------------------------------------------
// 1. ОДНЕ ЗАМОВЛЕННЯ — ОДНЕ СПИСАННЯ. Повторний запуск не має списати
//    вдруге: залишок — це не лічильник запусків.
// 2. СКАСУВАННЯ ПОВЕРТАЄ ТОВАР. Клієнт передумав — річ на полиці.
// 3. НАЗВА КОЛЬОРУ В ЗАМОВЛЕННІ Й У ТОВАРІ — РІЗНІ. Покупець бачив
//    зведену («Чорний»), у джерелі лежить те, що написав постачальник
//    («Black чорний»). Без мосту між ними не списалось би нічого.
// 4. ЧОГО НЕ РОЗУМІЄМО — НЕ ЧІПАЄМО. Немає товару, немає кольору,
//    залишки не ведуться — пишемо в лог і йдемо далі. Списати не той
//    колір гірше, ніж не списати нічого.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const Stock = require(path.join(ROOT, "scripts/apply-order-stock.js"));

// Товар-заглушка у вигляді джерела (data/products/*.json).
function product(extra) {

    return Object.assign({
        id: 42,
        title: "Сумка",
        sizes: ["ONESIZE"],
        variants: [
            { color: "Бежевий", hex: "#eee" },
            { color: "Чорний", hex: "#111" }
        ],
        stock: {
            "Бежевий": { ONESIZE: 2 },
            "Чорний": { ONESIZE: 1 }
        }
    }, extra || {});

}

function catalog(data) {
    return new Map([[data.id, { file: "sumka.json", data }]]);
}

function order(extra) {

    return Object.assign({
        id: 7,
        order_number: "0708553442",
        status: "new",
        stock_applied: false,
        items: [{ id: 42, title: "Сумка", qty: 1, color: "Бежевий", size: "ONESIZE" }]
    }, extra || {});

}

console.log("\n[1] Одне замовлення — одне списання");
{
    const data = product();
    const products = catalog(data);

    const plan = Stock.planChanges([order()], products);

    check("списується рівно одна одиниця", plan.changes.length === 1 && plan.changes[0].delta === -1,
        JSON.stringify(plan.changes));
    check("саме того кольору й розміру",
        plan.changes[0].color === "Бежевий" && plan.changes[0].size === "ONESIZE");
    check("замовлення позначається врахованим",
        plan.marks.length === 1 && plan.marks[0].stock_applied === true);

    Stock.applyChanges(plan.changes, products);

    check("залишок зменшився", data.stock["Бежевий"].ONESIZE === 1, data.stock["Бежевий"].ONESIZE);
    check("сусідній колір не зачеплено", data.stock["Чорний"].ONESIZE === 1);

    // Повторний запуск бачить те саме замовлення вже позначеним.
    const again = Stock.planChanges([order({ stock_applied: true })], products);

    check("врахованого замовлення більше не чіпаємо", again.changes.length === 0);

    // Кілька одиниць одного товару.
    const three = Stock.planChanges([order({
        items: [{ id: 42, title: "Сумка", qty: 3, color: "Бежевий", size: "ONESIZE" }]
    })], products);

    check("кількість із замовлення враховується", three.changes[0].delta === -3, three.changes[0].delta);
}

console.log("\n[2] Скасування повертає товар на полицю");
{
    const data = product();
    const products = catalog(data);

    // Спершу списали.
    Stock.applyChanges(Stock.planChanges([order()], products).changes, products);

    check("після замовлення лишилось 1", data.stock["Бежевий"].ONESIZE === 1);

    const back = Stock.planChanges([order({ status: "cancelled", stock_applied: true })], products);

    check("скасування повертає одиницю", back.changes[0].delta === 1, back.changes[0].delta);
    check("прапорець знімається", back.marks[0].stock_applied === false);

    Stock.applyChanges(back.changes, products);

    check("залишок повернувся", data.stock["Бежевий"].ONESIZE === 2);

    // Скасоване й уже не враховане — нічого не робимо, інакше залишок
    // ріс би з кожним запуском.
    const twice = Stock.planChanges([order({ status: "cancelled", stock_applied: false })], products);

    check("двічі не повертаємо", twice.changes.length === 0 && twice.marks.length === 0);

    // Скасування скасували — товар знову зайнятий.
    const restored = Stock.planChanges([order({ status: "processing", stock_applied: false })], products);

    check("повернуте в роботу списується знову", restored.changes[0].delta === -1);
}

console.log("\n[3] Назва кольору в замовленні й у товарі — різні");
{
    // Це не крайній випадок, а щоденність: збірка зводить написання
    // кольорів до єдиного вигляду («Black чорний» → «Чорний»), покупець
    // бачить зведене, а в джерелі лишається постачальницьке.
    const data = product({
        variants: [{ color: "Black чорний", hex: "#111" }],
        stock: { "Black чорний": { ONESIZE: 1 } }
    });

    const bridge = Stock.colorBridge(data);

    check("міст назв побудований", bridge.size === 1, [...bridge.entries()].join());
    check("веде від зведеної назви до джерельної",
        bridge.get("Чорний") === "Black чорний", [...bridge.entries()].join());

    const where = Stock.locate(data, { color: "Чорний", size: "ONESIZE" });

    check("списуємо в джерельний колір", where.color === "Black чорний", JSON.stringify(where));

    const products = catalog(data);

    Stock.applyChanges(Stock.planChanges([order({
        items: [{ id: 42, title: "Сумка", qty: 1, color: "Чорний", size: "ONESIZE" }]
    })], products).changes, products);

    check("залишок списано", data.stock["Black чорний"].ONESIZE === 0);
}

console.log("\n[4] Чого не розуміємо — не чіпаємо");
{
    const data = product();
    const products = catalog(data);

    // Товар видалили з каталогу.
    let plan = Stock.planChanges([order({
        items: [{ id: 999, title: "Зниклий", qty: 1, color: "Бежевий", size: "ONESIZE" }]
    })], products);

    check("зниклий товар не валить крок", plan.changes.length === 0);
    check("але лишає слід у логу", plan.notes.some(n => /уже немає в каталозі/.test(n)), plan.notes.join());
    check("замовлення все одно позначається", plan.marks.length === 1);

    // Колір перейменували.
    plan = Stock.planChanges([order({
        items: [{ id: 42, title: "Сумка", qty: 1, color: "Морквяний", size: "ONESIZE" }]
    })], products);

    check("невідомий колір не списується", plan.changes.length === 0);
    check("і теж лишає слід", plan.notes.some(n => /кольору/.test(n)), plan.notes.join());

    // Кілька кольорів, а в замовленні кольору немає (старі замовлення).
    check("без кольору при кількох варіантах — не вгадуємо",
        Boolean(Stock.locate(data, { size: "ONESIZE" }).error));

    // Один варіант — вгадувати нічого, беремо його.
    const single = product({
        variants: [{ color: "Бежевий", hex: "#eee" }],
        stock: { "Бежевий": { ONESIZE: 1 } }
    });

    check("з одним кольором працює й без нього",
        Stock.locate(single, { size: "ONESIZE" }).color === "Бежевий");
    check("і без розміру, коли він один",
        Stock.locate(single, {}).size === "ONESIZE");

    // Залишки не ведуться — вигадувати нуль не можна.
    const untracked = product({ stock: undefined });
    const untrackedCatalog = catalog(untracked);

    const untrackedPlan = Stock.planChanges([order()], untrackedCatalog);
    const applied = Stock.applyChanges(untrackedPlan.changes, untrackedCatalog);

    check("товар без залишків не отримує вигаданого нуля",
        !untracked.stock || untracked.stock["Бежевий"] === undefined);
    check("про це сказано в логу",
        applied.notes.some(n => /не ведуться/.test(n)), applied.notes.join());
}

console.log("\n[5] Нижче нуля не опускаємось");
{
    const data = product({ stock: { "Бежевий": { ONESIZE: 1 }, "Чорний": { ONESIZE: 0 } } });
    const products = catalog(data);

    // Замовили більше, ніж рахували.
    const plan = Stock.planChanges([order({
        items: [{ id: 42, title: "Сумка", qty: 5, color: "Бежевий", size: "ONESIZE" }]
    })], products);

    Stock.applyChanges(plan.changes, products);

    check("залишок став нулем, а не відʼємним", data.stock["Бежевий"].ONESIZE === 0);

    // Уже нуль — списувати нічого, але це варто побачити в логу.
    const zero = Stock.planChanges([order({
        id: 8, items: [{ id: 42, title: "Сумка", qty: 1, color: "Чорний", size: "ONESIZE" }]
    })], products);

    const applied = Stock.applyChanges(zero.changes, products);

    check("нуль лишається нулем", data.stock["Чорний"].ONESIZE === 0);
    check("і про це сказано", applied.notes.some(n => /уже нуль/.test(n)), applied.notes.join());
}

console.log("\n[6] Памʼять кроку — прапорець у базі");
{
    const sql = read("supabase/migrations/010-stock-applied.sql");

    check("міграція додає прапорець",
        /add column if not exists stock_applied boolean not null default false/i.test(sql));
    check("повторний запуск безпечний", /if not exists/i.test(sql) && !/<PROJECT_REF>/.test(sql));
    check("є індекс для вибірки", /create index if not exists orders_stock_applied_idx/i.test(sql));

    const script = read("scripts/apply-order-stock.js");

    // Вибірка мусить брати обидва випадки: неврaховані замовлення й
    // скасовані, які ще числяться врахованими.
    check("питаємо базу про обидва випадки",
        /stock_applied\.is\.false/.test(script) && /status\.eq\.cancelled/.test(script));

    // Позначка ставиться ПІСЛЯ запису файлів: якщо крок упаде
    // посередині, наступний запуск повторить роботу, а не втратить її.
    check("позначаємо після запису, а не до",
        script.indexOf("if (apply)") < script.indexOf("if (mark)"));

    check("без секрету крок мовчки завершується",
        /не заданий — крок пропущено/.test(script));

    // Адреса проєкту — не секрет: вона відкрито лежить у коді сайту.
    // Другий секрет означав би вибір «Secrets чи Variables» там, де
    // вибирати нема чого.
    check("адреса береться з коду сайту, а не з секрету",
        /assets", "js", "supabase-client\.js"/.test(script));
    check("і збігається з тією, яку вантажить сайт",
        Stock.supabaseUrl()
        === /SUPABASE_URL\s*=\s*"([^"]+)"/.exec(read("assets/js/supabase-client.js"))[1],
        Stock.supabaseUrl());
}

console.log("\n[6б] Рахуємо тільки з дня, коли з'явились залишки");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    //
    // У таблиці замовлень лежить уся історія магазину — включно з
    // тестами часів демо-каталогу. Перший запуск взявся списувати їх
    // усі, і 12 товарів пішли в нуль за продажі, яких сьогодні вже
    // немає: у проставлених числах вони давно враховані.
    const script = read("scripts/apply-order-stock.js");

    check("межа за датою є", /const STOCK_SINCE = process\.env\.STOCK_SINCE \|\| "20/.test(script));
    check("вона діє в запиті до бази", /created_at=gte\.\$\{encodeURIComponent\(STOCK_SINCE\)\}/.test(script));
    check("її можна змінити змінною середовища", /process\.env\.STOCK_SINCE/.test(script));

    // Дата замовлення в логу: без неї не видно, чи це сьогоднішній
    // продаж, чи торішній тест.
    check("дата замовлення потрапляє в план", /date: \(order\.created_at \|\| ""\)/.test(script));
    check("і в рядок логу", /" від " \+ change\.date/.test(script));

    check("пояснено, звідки взялась межа", /12 товарів пішли в нуль/.test(script));
}

console.log("\n[7] Дві гілки, один план");
{
    // Залишки лежать і в dev (там їх редагує адмінка), і в main
    // (звідти працює магазин). Списати треба в обох: інакше наступний
    // Sync branches поверне старе число, бо він віддає перевагу
    // гілці-джерелу.
    const flow = read(".github/workflows/apply-stock.yml");

    check("є розклад", /cron: "\*\/10 \* \* \* \*"/.test(flow));
    check("і кнопка «запустити зараз»", /workflow_dispatch/.test(flow));
    check("два одночасні запуски неможливі", /concurrency:[\s\S]{0,80}group: apply-stock/.test(flow));

    check("план рахується один раз у файл", /--plan-out="\$RUNNER_TEMP\/plan\.json"/.test(flow));
    check("dev бере готовий план", /--plan-in="\$RUNNER_TEMP\/plan\.json" --apply/.test(flow));
    check("main теж, зі своєю текою",
        /--dir="\$GITHUB_WORKSPACE\/main-tree\/data\/products"/.test(flow));

    // Гілка викачується поруч, а не перемиканням: після git checkout
    // main у робочій теці не було б самого скрипта.
    check("main викачується окремою текою", /path: main-tree/.test(flow));
    check("а не перемиканням гілки", !/git checkout main/.test(flow));

    // Позначка — в самому кінці, коли обидві гілки збережені.
    check("позначка після обох гілок",
        flow.indexOf("Списати в main") < flow.indexOf("Позначити замовлення врахованими"));

    // Пуш вбудованим токеном не породжує події push — збірку треба
    // покликати вручну, інакше залишки лежать у гілці, а сайт про них
    // не знає.
    check("збірка dev викликається явно", /gh workflow run build-dev\.yml --ref dev/.test(flow));
    check("збірка main теж", /gh workflow run build-products\.yml --ref main/.test(flow));
    check("для цього є права", /actions: write/.test(flow));
}

console.log("\n[8] Інструкція");
{
    const doc = read("docs/ЗАЛИШКИ.md");

    check("описано, який секрет додати",
        /SUPABASE_SERVICE_ROLE_KEY/.test(doc) && /New repository secret/.test(doc));
    check("сказано, чому саме repository, а не environment",
        /не оголошує середовища/.test(doc));
    check("і чому не Variables", /видно в логах/.test(doc));
    check("сказано про міграцію", /010-stock-applied\.sql/.test(doc));
    check("попереджено про ключ service_role", /обходить усі обмеження/.test(doc));
    check("пояснено головне правило", /Порожня клітинка — це не нуль/.test(doc));
    check("сказано, чого крок НЕ робить", /Не бронює товар у кошику/.test(doc));
    check("описано «Розпродано»", /## Розпродано/.test(doc));
    check("сказано, з якої дати рахуємо", /Рахуємо з 5 вересня/.test(doc));

    // Розклад і кнопка «Run workflow» працюють ЛИШЕ з головної гілки.
    // Поки workflow лежить тільки в dev, списання мовчить — і це
    // мовчання неможливо відрізнити від «нічого не змінилось».
    check("попереджено, що спершу треба перенести в main",
        /тільки з головної гілки/.test(doc) && /Sync branches/.test(doc));
    check("те саме сказано в самому workflow",
        /ТІЛЬКИ з головної гілки/.test(read(".github/workflows/apply-stock.yml")));
    check("і чесно попереджено про 404", /404/.test(doc));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");
process.exit(failures ? 1 : 0);
