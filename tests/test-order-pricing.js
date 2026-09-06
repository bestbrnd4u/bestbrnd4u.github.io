// Сума замовлення перераховується на сервері.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. БАЗА МАЄ ВЛАСНИЙ ЕТАЛОН ЦІН. Без нього перевіряти нема з чим:
//    сума, ціна й знижка приходять із браузера, тобто ззовні.
//
// 2. ПЕРЕВІРКА НЕ ПЕРЕПИСУЄ СУМУ Й НЕ ВІДМОВЛЯЄ У ВСТАВЦІ. Покупець
//    погодився на те, що бачив, а лист йому вже пішов. Позначка —
//    так; тиха зміна ціни або зникле замовлення — ні.
//
// 3. ПОМИЛКА В ПЕРЕВІРЦІ НЕ ЗУПИНЯЄ ПРОДАЖІ. Тригер стоїть на шляху
//    кожного замовлення.
//
// 4. ВЛАСНИК ЦЕ ПОБАЧИТЬ. Позначка марна, якщо вона лежить у колонці,
//    яку ніхто не відкриває, — тому вона є і в Telegram, і в панелі.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const sql = read("supabase/migrations/014-order-pricing.sql");
const push = read("scripts/push-prices.js");
const checkout = read("assets/js/checkout.js");

console.log("\n[1] У базі є з чим звіряти");
{
    check("таблиця цін", /create table if not exists public\.prices/.test(sql));

    check("стара ціна теж — інакше не порахувати знижку",
        /old_price\s+numeric/.test(sql));

    // Ціни й так відкриті на сайті, але тут вони ЕТАЛОН: давати до
    // нього доступ звідти ж, звідки приходить підробка, безглуздо.
    check("клієнт таблицю не бачить",
        /alter table public\.prices enable row level security/.test(sql)
        && !/create policy[\s\S]*public\.prices/.test(sql));

    check("знімок цін кладе окремий крок", push.length > 0);

    check("знімок береться зі зібраного каталогу",
        /data", "catalog\.json/.test(push));

    check("зниклі товари прибираються з еталону",
        /DELETE.*prices\?updated_at=lt/.test(push));

    // Ціна з каталогу — це те, що БАЧИТЬ покупець. Саме її й треба
    // звіряти.
    const { rows } = require("../scripts/push-prices.js");

    const sample = rows([
        { id: 7, price: 1000, oldPrice: 1500 },
        { id: 8, price: 500 },
        { id: 9, price: 0 },
        { id: 10, price: 700, oldPrice: 700 }
    ]);

    check("товар без ціни в еталон не потрапляє", sample.length === 3);

    check("стара ціна лишається, коли вона більша",
        sample[0].old_price === 1500);

    check("однакова стара ціна не вважається знижкою",
        sample[2].old_price === null, String(sample[2].old_price));

    check("крок є у збірці прод-гілки",
        /push-prices\.js/.test(read(".github/workflows/build-products.yml")));

    check("і не валить виливку, якщо база недоступна",
        /continue-on-error: true[\s\S]{0,400}push-prices\.js/.test(read(".github/workflows/build-products.yml")));
}

console.log("\n[2] Промокод підтверджує база, а не браузер");
{
    check("таблиця кодів", /create table if not exists public\.promo_codes/.test(sql));

    check("зберігається хеш, а не сам код", /code_hash\s+text\s+primary key/.test(sql));

    check("чинні коди перенесено", (sql.match(/'[0-9a-f]{64}', 0\.\d/g) || []).length >= 10);

    check("відсоток у розумних межах",
        /check \(percent > 0 and percent < 1\)/.test(sql));

    check("сторінка питає базу", /rpc\("promo_check", \{ p_hash: hash \}\)/.test(checkout));

    check("у базу йде хеш, а не код", !/p_code/.test(checkout));

    // Поки міграції немає, знижка має працювати як раніше: мовчки
    // відмовити в чинному промокоді гірше, ніж дати його за старим
    // списком — суму все одно перевірить сервер.
    check("без міграції промокоди працюють як раніше",
        /PROMO_CODE_HASHES\[hash\] \|\| 0/.test(checkout));

    check("список у коді названо запасним", /ЗАПАСНИЙ ВАРІАНТ/.test(checkout));

    check("функція перевірки доступна відвідувачу",
        /grant execute on function public\.promo_check\(text\) to anon, authenticated/.test(sql));

    check("права власника + закріплений search_path",
        /security definer[\s\S]{0,120}set search_path = public/.test(sql));
}

console.log("\n[3] Перевірка суми");
{
    check("тригер перед вставкою замовлення",
        /create trigger orders_check_pricing\s+before insert on public\.orders/.test(sql));

    check("рахує товари за цінами бази",
        /v_goods\s*:?=\s*v_goods \+ v_price \* v_qty/.test(sql));

    check("знижку рахує сама, з власного відсотка",
        /v_promo := round\(v_goods \* coalesce\(v_percent, 0\)\)/.test(sql));

    check("додає доставку", /v_delivery/.test(sql));

    // Найголовніше: сума ЗАМОВЛЕННЯ лишається такою, яку бачив
    // покупець. Тихо виставити людині більше — гірше за будь-яку
    // підробку.
    check("не переписує суму замовлення",
        !/new\.total\s*:=/.test(sql) && /new\.total_expected := v_total/.test(sql));

    check("не відмовляє у вставці",
        !/raise exception/.test(sql) && /return new/.test(sql));

    check("допуск у гривню — на округлення",
        /> 1\b/.test(sql));

    check("від'ємна доставка теж помітна",
        /delivery_price, 0\) < 0/.test(sql));

    // Товар щойно додали, а знімок цін ще не приїхав — це не
    // підробка. Плутати ці випадки означає навчити ігнорувати
    // позначку.
    check("невідомі ціни не називаються розбіжністю",
        /'unknown'/.test(sql) && /v_unknown := true/.test(sql));

    check("неіснуючий промокод помітний", /new\.price_check := 'mismatch'/.test(sql));

    check("id товару розбирається регуляркою, а не приведенням типу",
        /~ '\^\[0-9\]\{1,18\}\$'/.test(sql));

    // Той самий принцип, що в перевірці залишків: замовлення важливіше
    // за позначку.
    check("будь-яка помилка не зупиняє замовлення",
        /exception[\s\S]{0,400}when others[\s\S]{0,200}return new/.test(sql));

    check("сказано, що спершу треба 011", /011-stock-reservation\.sql/.test(sql));
}

console.log("\n[4] Власник це побачить");
{
    const format = read("supabase/functions/telegram-order-bot/format.js");
    const built = read("supabase/functions/telegram-order-bot/index.ts");
    const api = read("supabase/functions/telegram-order-bot/admin-api.js");
    const panel = read("admin/orders.js");

    check("у Telegram — рядок під сумою",
        /price_check === "mismatch"/.test(format) && /сума не збігається/.test(format));

    check("з числом, яке порахувала база", /total_expected/.test(format));

    check("зібрана функція не застаріла", built.includes("сума не збігається"));

    check("панель отримує поле", /priceCheck: order\?\.price_check/.test(api));

    check("і очікувану суму", /totalExpected: Number\(order\?\.total_expected\)/.test(api));

    check("позначка видно вже в списку", /price_check/.test(api)
        && /priceCheck === "mismatch"/.test(panel));

    check("у картці замовлення — окремий рядок",
        /Сума не збігається/.test(panel));
}

console.log(failures === 0
    ? "\n✅ Ціни: суму замовлення підтверджує база, а не браузер\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
