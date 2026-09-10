// Промокоди: строки, обмеження, облік.
//
// ЧОГО БРАКУВАЛО
// ---------------
// Промокоди були списком «код → відсоток», який можна змінити лише
// запитом у SQL Editor. Не було ні тимчасових кодів, ні кодів на
// певні товари, ні одноразових, ні видимості — хто скористався.
//
// І коди зберігались ЛИШЕ хешем. Хеш ховає код від того, хто дивиться
// таблицю, але й від власника теж: список у панелі показати
// неможливо, бо з хеша код не дістати.
//
// ГОЛОВНІ НЕБЕЗПЕКИ, ЯКІ ТУТ СТЕРЕЖУТЬСЯ
// ---------------------------------------
// 1. ДВА РІЗНИХ РОЗРАХУНКИ ЗНИЖКИ. Сторінка показує суму, база її
//    підтверджує. Розійдуться — покупець побачить одне, а в
//    замовленні буде інше, і кожне таке замовлення позначиться як
//    «сума не збіглася».
// 2. ОДНОРАЗОВИЙ КОД, ЯКИЙ РАХУЄ САМ СЕБЕ. Тригер спрацьовує і при
//    зміні статусу, коли замовлення вже в таблиці. Без виключення
//    поточного замовлення бездоганне замовлення при першій же зміні
//    статусу ставало б «сума не збіглася».
// 3. ФАЙЛ ІЗ КОДАМИ В ПУБЛІЧНОМУ РЕПОЗИТОРІЇ. Тримати коди в даних
//    сайту означало б опублікувати їх разом із ним.
// 4. РІЗНІ ВІДПОВІДІ НА «ЧОМУ НЕ СПРАЦЮВАВ». «Цей скінчився» означає
//    «цей існує» — і форма стає способом перебирати чужі коди.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const migration = read("supabase/migrations/025-promo-codes.sql");
const checkout = read("assets/js/checkout.js");
const panel = read("admin/promo.js");
const bundle = read("supabase/functions/telegram-order-bot/index.ts");

// Виконуємо САМ модуль функції, а не його переказ.
const promo = (() => {

    const src = read("supabase/functions/telegram-order-bot/promo-admin.js")
        .replace(/^export /gm, "");

    return new Function(src + "; return {"
        + " PROMO_ADMIN_ACTIONS, isPromoAction, PROMO_STATES, PROMO_CODE_RE,"
        + " normalizePromoCode, promoPercentToFraction, promoFractionToPercent,"
        + " promoMoment, promoProductIds, parsePromoRequest, promoView,"
        + " promoListResponse, promoUsesResponse, promoRandomCode };")();

})();

console.log("\n[1] Коди живуть у базі, а не в репозиторії");
{
    // Репозиторій публічний. Файл із кодами був би опублікований
    // разом із сайтом — тобто кожен читав би всі коди, включно з
    // персональними.
    const dataFiles = fs.readdirSync(path.join(ROOT, "data"))
        .filter(name => name.endsWith(".json"));

    const leaked = dataFiles.filter(name =>
        /promo_?code|промокод/i.test(read(`data/${name}`))
        && !/promoPopup|promotions/i.test(name));

    check("у даних сайту кодів немає", leaked.length === 0, leaked.join(", "));

    check("таблиця закрита від браузера",
        /alter table public\.promo_codes enable row level security/.test(
            read("supabase/migrations/014-order-pricing.sql")));

    // Панель ходить через функцію Edge з правом запису в репозиторій —
    // тим самим, що в панелях замовлень і відгуків.
    check("панель ходить через функцію, а не в базу", /x-admin-token/.test(panel));

    check("прямих запитів до таблиці з панелі немає",
        !/rest\/v1\/promo_codes/.test(panel));
}

console.log("\n[2] Що приймається як код");
{
    check("латиниця, цифри, дефіс", promo.PROMO_CODE_RE.test("OSIN-2026"));

    // Кирилиця виглядає так само, а набирається інакше: код, який
    // диктують по телефону, мусить набиратись без перемикання
    // розкладки.
    check("кирилиця не проходить", !promo.PROMO_CODE_RE.test("ОСІНЬ"));

    check("пробіли не проходять", !promo.PROMO_CODE_RE.test("OSIN 26"));
    check("надто короткий не проходить", !promo.PROMO_CODE_RE.test("AB"));

    check("регістр не має значення",
        promo.normalizePromoCode(" osin2026 ") === "OSIN2026");

    // Панель показує 10, база тримає 0.1. Ділення в одному місці:
    // коли воно жило на двох боках, один із них починав слати 10.
    check("10% → 0.1", promo.promoPercentToFraction(10) === 0.1);
    check("7.5% → 0.075", promo.promoPercentToFraction(7.5) === 0.075);
    check("0.1 → 10%", promo.promoFractionToPercent(0.1) === 10);

    check("сто відсотків і більше не приймається",
        promo.promoPercentToFraction(100) === null
        && promo.promoPercentToFraction(150) === null);

    check("нуль і мінус не приймаються",
        promo.promoPercentToFraction(0) === null
        && promo.promoPercentToFraction(-5) === null);
}

console.log("\n[3] Строки");
{
    // Порожнє мусить стати саме null: null означає «без межі», і
    // сплутати ці два значення — значить вимкнути всі безстрокові коди.
    check("порожня дата — це «без межі», а не «сьогодні»",
        promo.promoMoment("") === null && promo.promoMoment(null) === null);

    check("сміття замість дати теж null", promo.promoMoment("завтра") === null);

    check("дата перетворюється на мить",
        typeof promo.promoMoment("2026-12-31T23:59") === "string");

    const swapped = promo.parsePromoRequest({
        admin_action: "promo-save",
        code: "TEST1",
        percent: 10,
        starts_at: "2026-12-31T00:00",
        expires_at: "2026-01-01T00:00",
    });

    check("кінець раніше за початок не приймається",
        swapped.ok === false && /пізніше/.test(swapped.error), swapped.error);

    // Код, що скінчився ще до створення, — майже завжди описка в
    // даті. Зберегти його мовчки означає, що власник дізнається про
    // помилку від покупця.
    const past = promo.parsePromoRequest({
        admin_action: "promo-save",
        code: "TEST2",
        percent: 10,
        expires_at: "2020-01-01T00:00",
    });

    check("дата в минулому не приймається",
        past.ok === false && /минула/.test(past.error), past.error);
}

console.log("\n[4] На які товари й від якої суми");
{
    check("перелік товарів чиститься від сміття",
        JSON.stringify(promo.promoProductIds([1, "2", 0, -3, "три", 2]))
            === JSON.stringify([1, 2]));

    // Порожній перелік і його відсутність — це те саме «на всі
    // товари». Два способи сказати одне й те саме означають, що
    // перевірять лише один із них.
    check("порожній перелік — це «на всі»",
        promo.promoProductIds([]) === null && promo.promoProductIds(null) === null);

    const parsed = promo.parsePromoRequest({
        admin_action: "promo-save",
        code: "AUTUMN",
        percent: 15,
        max_uses: "3",
        min_total: "2500",
        product_ids: [7, 9],
        note: "  осіння розсилка  ",
    });

    check("повний запит розбирається", parsed.ok === true, parsed.error);

    if (parsed.ok) {
        check("відсоток у частках", parsed.params.percent === 0.15);
        check("кількість — ціле", parsed.params.maxUses === 3);
        check("поріг — число", parsed.params.minTotal === 2500);
        check("товари збережені", JSON.stringify(parsed.params.productIds) === "[7,9]");
        check("нотатка обрізана", parsed.params.note === "осіння розсилка");
    }

    // Порожні поля не мусять ставати нулями: нуль у «від суми»
    // означав би «від 0 ₴», а це не те, що людина мала на увазі.
    const empty = promo.parsePromoRequest({
        admin_action: "promo-save", code: "EMPTY1", percent: 5,
        max_uses: "", min_total: "",
    });

    check("порожні межі — це null, а не нуль",
        empty.ok && empty.params.maxUses === null && empty.params.minTotal === null);
}

console.log("\n[5] Знижка рахується однаково на сторінці й у базі");
{
    // Сторінка
    check("сторінка має ОДИН розрахунок", /function promoDiscountFor/.test(checkout));

    const helper = checkout.match(/function promoDiscountFor[\s\S]*?\n}/)[0];

    check("поріг — по всьому кошику",
        /appliedPromo\.minTotal && priceTotal < appliedPromo\.minTotal/.test(helper));

    check("знижка — лише на товари коду",
        /only\.includes\(Number\(product\.id\)\)/.test(helper));

    check("копій розрахунку не лишилось",
        (checkout.match(/Math\.round\(priceTotal \* appliedPromo\.percent\)/g) || []).length === 0);

    // Місць, де потрібна знижка, три: підсумок праворуч, прихована
    // сума у формі й повідомлення під полем коду. Число тут не
    // фіксуємо — важливо, що ЖОДНЕ з них не рахує само (це вже
    // перевірено вище), а всі кличуть спільну функцію.
    const calls = (checkout.match(/promoDiscountFor\(lines, priceTotal\)/g) || []).length;

    check(`спільний розрахунок кличуть з усіх місць (${calls})`, calls >= 3, calls);

    // База
    check("тригер рахує знижку на ті самі товари",
        /v_eligible := v_eligible \+ v_price \* v_qty/.test(migration));

    check("і перевіряє поріг по всьому кошику",
        /if v_min is not null and v_goods < v_min then/.test(migration));

    check("знижка від eligible, а не від усього кошика",
        /v_promo := round\(v_eligible \* coalesce\(v_percent, 0\)\)/.test(migration));
}

console.log("\n[6] Одноразовий код не рахує сам себе");
{
    // Тригер спрацьовує і при зміні статусу, коли замовлення вже в
    // таблиці. Без виключення поточного замовлення бездоганне
    // замовлення при першій зміні статусу ставало б «сума не збіглася».
    check("межа кількості перевіряється окремо від умов",
        /function public\.promo_terms/.test(migration)
        && /function public\.promo_available/.test(migration));

    check("тригер бере умови без межі кількості",
        /from public\.promo_terms\(/.test(migration));

    check("і рахує використання з виключенням цього замовлення",
        /o\.order_number is distinct from new\.order_number/.test(migration));

    check("сторінка бере варіант ІЗ межею",
        /select \* from public\.promo_available/.test(migration));

    // Скасовані замовлення не «з'їдають» код.
    check("скасовані не рахуються як використання",
        /coalesce\(status, ''\) <> 'cancelled'/.test(migration));
}

console.log("\n[7] Стан коду рахує база, а не панель");
{
    // Друга копія правила «чи діє код» розійшлася б із тією, за якою
    // знижку підтверджує тригер, — і панель показувала б «діє» на
    // коді, який уже не спрацьовує.
    // Перевіряємо ПОВЕДІНКУ: що дали, те й повернулось. Модуль не має
    // права вирішувати сам — інакше з'явиться друга копія правила.
    check("стан проходить наскрізь, без власного рішення",
        promo.promoView({ code_hash: "c".repeat(64), percent: 0.1, state: "expired" }).state
            === "expired");

    check("невідомий стан не вигадується, а зводиться до відомого",
        promo.promoView({ code_hash: "d".repeat(64), percent: 0.1, state: "хтозна" }).state
            === "live");

    check("панель не рахує строки сама",
        !/new Date\(\)\s*[<>]/.test(panel), "панель порівнює дати сама");

    check("база знає всі п'ять станів",
        ["off", "early", "expired", "used_up", "live"]
            .every(key => migration.includes(`'${key}'`)));

    check("панель уміє назвати кожен",
        ["off", "early", "expired", "used_up", "live"]
            .every(key => Boolean(promo.PROMO_STATES[key])));

    const view = promo.promoView({
        code_hash: "a".repeat(64), code: "TEST", percent: 0.1, active: true,
        state: "live", used: 2, max_uses: 5, product_ids: [1, 2],
        min_total: 1000, note: "n", created_at: "2026-09-01T00:00:00Z",
    });

    check("проєкція віддає відсотки, а не частки", view.percent === 10);
    check("і не вигадує стану", view.stateLabel === "Діє");

    // Коди, перенесені зі старого списку, лежать лише хешем. Кажемо
    // це прямо, а не показуємо порожнє місце.
    const legacy = promo.promoView({ code_hash: "b".repeat(64), percent: 0.05, state: "live" });

    check("старий код позначений як невідомий", legacy.legacy === true);
    check("панель це показує", /код невідомий/.test(panel));
}

console.log("\n[8] Форма не перетворюється на перебирання кодів");
{
    // Різні відповіді розкривають існування коду: «цей скінчився»
    // означає «цей існує».
    const messages = checkout.match(/promoMessageEl\.textContent = [^;]+;/g) || [];

    const revealing = messages.filter(line =>
        /скінчився|вичерпан|вимкнен|ще не поч/i.test(line));

    check("сторінка не каже, ЧОМУ саме код не спрацював",
        revealing.length === 0, revealing.join(" | "));

    check("одна відповідь на всі випадки",
        /Такого промокоду не існує або він уже не діє/.test(checkout));

    // А от «діє, але на цей кошик нічого не дає» сказати треба:
    // мовчазний нуль у підсумку — найгірше, що тут можна показати.
    check("порожня знижка пояснюється",
        /діє від \$\{formatPrice\(terms\.minTotal\)\}/.test(checkout)
        && /діє лише на окремі товари/.test(checkout));
}

console.log("\n[9] Персональний код для листа");
{
    const code = promo.promoRandomCode("BB", [0, 5, 10, 20, 31, 7]);

    check("код має префікс і хвіст", /^BB-[A-Z0-9]{6}$/.test(code), code);

    // Читабельний набір: без 0/O та 1/I — саме на них помиляються,
    // переписуючи код із листа руками.
    check("без символів, які плутають",
        !/[01OI]/.test(code.split("-")[1]), code);

    check("проходить власну перевірку", promo.PROMO_CODE_RE.test(code));
}

console.log("\n[10] Зібраний файл функції не відстає");
{
    const { build } = require(path.join(ROOT, "scripts/build-edge-function.js"));

    check("index.ts перезібраний з актуальних джерел", build() === bundle,
        "запустіть: node scripts/build-edge-function.js");

    check("модуль у переліку збірки",
        /promo-admin\.js/.test(read("scripts/build-edge-function.js")));

    // Збірка зливає модулі в ОДИН файл, тож однакові назви тихо
    // перекривають одна одну. Раніше саме так clampLimit із панелі
    // відгуків перекрив однойменну з панелі замовлень.
    const dir = "supabase/functions/telegram-order-bot";

    const modules = (read("scripts/build-edge-function.js")
        .match(/const MODULES = \[([^\]]*)\]/) || [, ""])[1]
        .split(",").map(s => s.trim().replace(/"/g, "")).filter(Boolean);

    const seen = new Map();

    modules.forEach(name => {

        const src = read(`${dir}/${name}`);

        [...src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)]
            .concat([...src.matchAll(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/gm)])
            .forEach(m => {
                if (!seen.has(m[1])) seen.set(m[1], []);
                seen.get(m[1]).push(name);
            });

    });

    const clashing = [...seen.entries()].filter(([, files]) => files.length > 1);

    check(`жодне імʼя не повторюється серед ${modules.length} модулів`,
        clashing.length === 0,
        clashing.map(([name, files]) => `${name} у ${files.join(" і ")}`).join("; "));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
