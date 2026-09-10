// Захист замовлень: щоб їх надсилали покупці, а не скрипти.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. МАГАЗИН НЕ ПЕРЕСТАЄ ПРОДАВАТИ. Кожна лінія захисту тут стоїть на
//    шляху КОЖНОГО замовлення. Помилка в ній не має права коштувати
//    продажу — тому і межа в базі, і перевірка «ви людина» падають у
//    бік «пропустити».
//
// 2. ПОРОЖНІЙ КЛЮЧ = НІЧОГО НЕ ЗМІНЮЄТЬСЯ. Поки Turnstile не
//    налаштований, сторінка не вантажить сторонніх скриптів і
//    поводиться точно як раніше.
//
// 3. ФУНКЦІЯ ПИШЕ СЛУЖБОВИМ КЛЮЧЕМ — тобто обмеження бази на неї не
//    діють. Тому поля перебираються за БІЛИМ списком, статус завжди
//    «new», а чиє це замовлення — вирішує підтверджений токен, а не
//    те, що прислали.
//
// 4. АДРЕСА ПОКУПЦЯ НЕ ЗБЕРІГАЄТЬСЯ. Для підрахунку досить хеша.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const sql = read("supabase/migrations/015-order-flood.sql");
const widget = read("assets/js/turnstile.js");
const checkout = read("assets/js/checkout.js");
const built = read("supabase/functions/telegram-order-bot/index.ts");

console.log("\n[1] Межа замовлень у базі");
{
    check("тригер перед вставкою",
        /create trigger orders_rate_limit\s+before insert on public\.orders/.test(sql));

    check("межа на адресу", /v_mine >= 15/.test(sql));
    check("і загальна", /v_all >= 150/.test(sql));

    // Адреса не потрібна — потрібно лише розрізняти «той самий чи
    // інший». Зберігати IP означало б завести базу персональних даних
    // там, де без неї можна обійтись.
    check("зберігається хеш, а не адреса",
        /ip_hash\s+text/.test(sql) && !/inet/.test(sql));

    check("сіль своя на проєкт",
        /throttle_salt/.test(sql) && /gen_random_bytes/.test(sql));

    check("старі записи прибираються самі",
        /delete from public\.order_throttle where created_at </.test(sql));

    // Бот пише службовим ключем — тобто з однієї адреси на всіх.
    check("бота межа не стосується",
        /service_role/.test(sql) && /return new/.test(sql));

    // Перевищена межа мусить дійти до клієнта, а будь-яка інша
    // несподіванка — ні.
    check("перевищення має власний код", /errcode = 'P0429'/.test(sql));

    check("і не губиться в обробнику",
        /when sqlstate 'P0429' then[\s\S]{0,60}raise;/.test(sql));

    check("інша помилка не зупиняє продажі",
        /when others then[\s\S]{0,400}raise warning[\s\S]{0,120}return new/.test(sql));

    check("таблиці закриті від клієнта",
        (sql.match(/enable row level security/g) || []).length >= 2
        && !/create policy/.test(sql));
}

console.log("\n[2] Перевірка «ви людина» вимкнена, поки немає ключа");
{
    const config = JSON.parse(read("data/security.json"));

    check("ключ сайту є в налаштуваннях", "turnstileSiteKey" in config);

    // ТУТ СТОЯЛО «за замовчуванням порожній».
    //
    // Це було вірно рівно доти, доки перевірку не ввімкнули: поки
    // ключа немає, модуль не вантажить нічого й магазин працює як
    // раніше. Але тепер ключ заданий — і та перевірка вимагала б
    // тримати його порожнім назавжди, тобто забороняла б саму
    // можливість, заради якої поле й зроблене.
    //
    // Правило, яке справді треба стерегти, інше: у цьому файлі може
    // лежати ЛИШЕ відкритий ключ сайту. Він і має бути в коді
    // сторінки — його бачить кожен відвідувач. Секретний ключ
    // виглядає інакше (0x…, але помітно довший) і живе тільки в
    // секретах функції.
    const key = String(config.turnstileSiteKey || "");

    check("ключ або порожній, або схожий на ключ САЙТУ",
        key === "" || /^0x[A-Za-z0-9_-]{10,30}$/.test(key),
        key ? `${key.slice(0, 6)}… (${key.length} символів)` : "порожній");

    // Секретний ключ Cloudflare починається з 0x і має ~35+ символів.
    // Якщо в це поле вставили саме його — це витік, і мовчати не можна.
    check("це не секретний ключ", key.length < 32, `${key.length} символів`);

    // Найважливіше: без ключа не має бути ЖОДНОГО звернення до
    // Cloudflare — ні скрипта, ні кадру.
    check("без ключа сторонній скрипт не вантажиться",
        /if \(!siteKey\) return;/.test(widget));

    check("блок схований у розмітці",
        /<div id="turnstileBox" class="turnstile-box" hidden>/.test(read("checkout.html")));

    check("недоступний Cloudflare не ламає оформлення",
        /catch/.test(widget) && /Перевірка «ви людина» недоступна/.test(widget));

    // ВІДЖЕТ, ЯКИЙ НЕ З'ЯВИВСЯ, БЛОКУВАВ ПРОДАЖІ.
    //
    // enabled() означало «ключ заданий», а сторінка оформлення на це
    // покладалась як на «віджет працює»: коментар там прямо обіцяв,
    // що при незʼявленому віджеті оформлення піде як завжди.
    //
    // Насправді ні. Заміряно на живому деві в день, коли ключ уперше
    // поставили: домену dev.bestbrnd4u.com не було в списку хостів
    // віджета, Cloudflare лишив порожній блок 0×0 — і сторінка
    // вимагала токен, якого нізвідки взятись. Замовлення не можна
    // було оформити взагалі.
    check("перевірка вважається ввімкненою, лише якщо віджет намалювався",
        /return Boolean\(siteKey\) && !failed && widgetId !== null;/.test(widget));

    check("провал показу вимикає перевірку, а не продажі",
        /"error-callback"/.test(widget) && /failed = true/.test(widget));

    // Токен живе близько п'яти хвилин, а форму заповнюють довше.
    check("прострочений токен оновлюється сам", /"expired-callback"/.test(widget));

    check("токен одноразовий — віджет скидається",
        /function reset\(\)/.test(widget) && /Turnstile\.reset\(\)/.test(checkout));

    check("скрипт підключено на сторінці оформлення",
        /assets\/js\/turnstile\.js/.test(read("checkout.html")));

    check("ключ сайту редагується в адмінці",
        /data\/security\.json/.test(read("admin/config.yml")));

    // Секретний ключ у коді сайту — найгірше, що тут може статись.
    check("секретного ключа в коді немає",
        !/TURNSTILE_SECRET/.test(widget) && !/TURNSTILE_SECRET/.test(checkout));
}

console.log("\n[3] Замовлення через функцію");
{
    const { cleanOrder, turnstileVerdict, MAX_ITEMS } =
        require("../supabase/functions/telegram-order-bot/place-order.js");

    const good = {
        order_number: "0708553442",
        items: [{ id: 7, title: "Сумка", price: 1000, qty: 1, color: "Чорний", size: "ONESIZE" }],
        total: 1000,
        phone: "+380731112233"
    };

    check("нормальне замовлення проходить", cleanOrder(good).ok);

    // Функція пише службовим ключем: усе, чого немає в білому списку,
    // мусить зникнути.
    const sneaky = cleanOrder({
        ...good,
        status: "delivered",
        user_id: "00000000-0000-0000-0000-000000000000",
        price_check: "ok",
        stock_applied: true
    });

    check("статус завжди «new»", sneaky.row.status === "new");
    check("чужі поля не проходять",
        !("user_id" in sneaky.row) && !("price_check" in sneaky.row)
        && !("stock_applied" in sneaky.row));

    check("замовлення без контактів відхиляється",
        !cleanOrder({ ...good, phone: "", email: "" }).ok);

    check("порожній склад відхиляється",
        !cleanOrder({ ...good, items: [] }).ok);

    check("дивний номер відхиляється",
        !cleanOrder({ ...good, order_number: "<script>" }).ok);

    check("надто довгий список відхиляється",
        !cleanOrder({ ...good, items: new Array(MAX_ITEMS + 1).fill(good.items[0]) }).ok);

    check("від'ємна сума стає нулем",
        cleanOrder({ ...good, total: -5000 }).row.total === 0);

    check("захмарна сума теж",
        cleanOrder({ ...good, total: 9e12 }).row.total === 0);

    check("довгий текст обрізається",
        cleanOrder({ ...good, delivery_city: "х".repeat(500) }).row.delivery_city.length === 120);

    check("кількість не буває нульовою чи від'ємною",
        cleanOrder({ ...good, items: [{ ...good.items[0], qty: -3 }] }).row.items[0].qty === 1);

    check("відповідь Cloudflare розбирається",
        turnstileVerdict({ success: true }).ok
        && !turnstileVerdict({ success: false, "error-codes": ["timeout-or-duplicate"] }).ok);

    check("порожня відповідь — не успіх", !turnstileVerdict(null).ok);

    // ТОКЕН, ВИДАНИЙ НЕ НА НАШОМУ САЙТІ.
    //
    // У налаштуваннях віджета серед дозволених хостів стоять localhost
    // і 127.0.0.1 — вони потрібні, щоб перевірку можна було полагодити
    // на своїй машині. Але ключ сайту відкритий (він і має бути в коді
    // сторінки), тож будь-хто може підняти сторінку з нашим ключем у
    // себе на localhost, отримати ТАМ справжній токен і надіслати його
    // нашій функції. Cloudflare підтвердить: токен чинний.
    //
    // Тому success сам по собі — не привід приймати замовлення.
    check("токен із чужого хоста не приймається",
        !turnstileVerdict({ success: true, hostname: "localhost" }).ok
        && !turnstileVerdict({ success: true, hostname: "evil.example" }).ok);

    check("токен із магазину приймається",
        turnstileVerdict({ success: true, hostname: "bestbrnd4u.com" }).ok
        && turnstileVerdict({ success: true, hostname: "dev.bestbrnd4u.com" }).ok);

    // «bestbrnd4u.com.evil.net» закінчується на нашу назву, але нашим
    // не є. Перевірка мусить дивитись на межу піддомену.
    check("схожий чужий домен не проходить",
        !turnstileVerdict({ success: true, hostname: "bestbrnd4u.com.evil.net" }).ok);

    // Старий формат відповіді або тестовий ключ Cloudflare хоста не
    // повертає — відмовляти нема підстав.
    check("відповідь без хоста не ламає перевірку",
        turnstileVerdict({ success: true }).ok);
}

console.log("\n[4] Функція зібрана й обережна");
{
    check("маршрут є в зібраному файлі", /site_action === "place-order"/.test(built));

    check("без секрета відповідає «не налаштовано»",
        /turnstile_not_configured/.test(built));

    check("токен звіряється з Cloudflare",
        /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/.test(built));

    check("непройдена перевірка — відмова", /turnstile_failed/.test(built));

    // Чиє це замовлення, вирішує підтверджений токен, а не payload.
    check("користувач береться із заголовка",
        /request\.headers\.get\("authorization"\)/.test(built) && /verifyUser/.test(built));

    check("склад замовлення проходить білий список",
        /cleanOrder\(body\.order\)/.test(built));

    check("сторінка відкочується на прямий запис",
        /placeOrderThroughFunction/.test(checkout)
        && /if \(await placeOrderThroughFunction\(order\)\) return;/.test(checkout));

    check("секрет описаний в інструкції",
        /TURNSTILE_SECRET/.test(read("supabase/README-telegram-bot.md")));

    check("є покрокова документація",
        fs.existsSync(path.join(ROOT, "docs/ЗАХИСТ-ЗАМОВЛЕНЬ.md")));

    // Останній крок — і він мусить бути ЯВНО останнім: поки прямий
    // запис відкритий, Turnstile це ввічливе прохання.
    const doc = read("docs/ЗАХИСТ-ЗАМОВЛЕНЬ.md");

    check("сказано, що без закриття політики це не захист",
        /ввічливе прохання/.test(doc) && /drop policy if exists "orders_insert_any"/.test(doc));

    check("і як повернути назад",
        /create policy "orders_insert_any"/.test(doc));
}

console.log(failures === 0
    ? "\n✅ Замовлення: потік зупиняє база, людину підтверджує сервер\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
