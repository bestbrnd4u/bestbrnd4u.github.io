// Останній екземпляр не продається двічі.
//
// СИМПТОМ, ЯКИЙ ЦЕ ЗАКРИВАЄ
// --------------------------
// Залишки лежать у репозиторії, а списує їх крок за розкладом — раз
// на десять хвилин. Тобто після продажу останньої сумки сайт ще десять
// хвилин показував її як наявну, і двоє покупців отримували однакове
// підтвердження на один товар.
//
// Тепер перевірка живе в самій базі, у транзакції створення
// замовлення: друге замовлення чекає на першому (блокування рядка
// залишку) і позначає свій рядок як «під замовлення».
//
// ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ
// ---------------------
// 1. Знімок залишків у базі описує ТЕ САМЕ, що бачить покупець на
//    сайті: id, колір і розмір мусять збігатися символ у символ,
//    інакше база шукає рядок, якого немає, і мовчки нічого не
//    перевіряє.
// 2. Правила підрахунку зайнятих одиниць збігаються з тими, за якими
//    списує крон, — включно з датою відліку.
// 3. Порядок кроків у workflow: знімок ПІСЛЯ списання й ДО позначки.
// 4. Позначку видно там, де власник дивиться замовлення.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const sql = read("supabase/migrations/011-stock-reservation.sql");
const pushStock = require("../scripts/push-stock.js");

console.log("\n[1] Знімок описує те саме, що бачить покупець");
{
    // Головна пастка: у джерелі колір написаний по-своєму
    // («Green Glow — яскравий зелений»), а сайт і замовлення знають
    // його зведеним («Зелений»). Рядок із джерельним написанням база
    // ніколи не знайде — і перевірка мовчки не спрацює.
    const products = JSON.parse(read("data/products.json"));
    const sources = pushStock.readProducts(path.join(ROOT, "data", "products"));

    const rows = sources.flatMap(pushStock.rowsFor);

    check(`рядків у знімку — ${rows.length}`, rows.length > 0);

    const onSite = new Map();

    products.forEach(product => {
        (product.variants || []).forEach(variant => {
            Object.entries(variant.stock || {}).forEach(([size, qty]) => {
                onSite.set(`${product.id}|${variant.color}|${size}`, qty);
            });
        });
    });

    const mismatched = rows.filter(row => {

        const key = `${row.product_id}|${row.color}|${row.size}`;

        return !onSite.has(key) || onSite.get(key) !== row.qty;

    });

    check("кожен рядок збігається з тим, що показує сайт",
        mismatched.length === 0,
        mismatched.slice(0, 3).map(r => `${r.product_id} ${r.color}/${r.size}`).join(", "));

    check("нічого не загубилось", rows.length === onSite.size,
        `${rows.length} проти ${onSite.size}`);

    // Порожня клітинка — це «не рахуємо», а не нуль: товар без
    // залишків рядка не отримує, і база на нього нічого не перевіряє.
    const untracked = pushStock.rowsFor({
        id: 999,
        variants: [{ color: "Чорний", sizes: ["ONESIZE"] }]
    });

    check("товар без залишків рядків не дає", untracked.length === 0);

    const tracked = pushStock.rowsFor({
        id: 999,
        stock: { "Чорний": { ONESIZE: 0 } },
        variants: [{ color: "Чорний", sizes: ["ONESIZE"] }]
    });

    check("явний нуль рядок дає", tracked.length === 1 && tracked[0].qty === 0,
        JSON.stringify(tracked));

    // Розпроданий товар зник із сайту — рядок у базі лише заважав би.
    const sold = pushStock.rowsFor({
        id: 999,
        soldOut: true,
        stock: { "Чорний": { ONESIZE: 5 } },
        variants: [{ color: "Чорний", sizes: ["ONESIZE"] }]
    });

    check("розпроданий товар у знімок не йде", sold.length === 0);
}

console.log("\n[2] База рахує так само, як крон");
{
    const cron = read("scripts/apply-order-stock.js");

    const cronSince = (cron.match(/STOCK_SINCE = process\.env\.STOCK_SINCE \|\| "([^"]+)"/) || [])[1];
    const sqlSince = (sql.match(/o\.created_at >= timestamptz '([^']+)'/) || [])[1];

    check("дата відліку знайдена в обох", Boolean(cronSince) && Boolean(sqlSince),
        `${cronSince} / ${sqlSince}`);

    // Розійдуться — база й крон рахуватимуть різні набори замовлень, і
    // залишок поїде в один бік. Мовчки.
    check("дата відліку однакова", cronSince === sqlSince, `${cronSince} ≠ ${sqlSince}`);

    // І ТЕ САМЕ В УСІХ ІНШИХ МІГРАЦІЯХ.
    //
    // Довгий час перевірка дивилась рівно в один файл — 011. Поки
    // дата жила тільки там, цього вистачало. Але 043 переписала
    // stock_live() одним проходом і неминуче взяла дату собі: у SQL
    // немає констант, які можна розділити між файлами.
    //
    // Тобто копій стало дві, і мовчазна розбіжність знову можлива —
    // база рахуватиме один набір замовлень, крон інший. Тому питаємо
    // не «чи правильна дата в 011», а «чи однакова вона скрізь, де
    // взагалі згадана».
    const каталог = path.join(ROOT, "supabase", "migrations");

    const зДатою = fs.readdirSync(каталог)
        .filter(f => f.endsWith(".sql"))
        .map(f => ({
            файл: f,
            дати: [...read(path.join("supabase", "migrations", f))
                .matchAll(/o\.created_at >= timestamptz '([^']+)'/g)].map(m => m[1])
        }))
        .filter(з => з.дати.length);

    check(`міграцій із датою відліку: ${зДатою.length}`, зДатою.length >= 1,
        зДатою.map(з => з.файл).join(", "));

    const чужі = зДатою.filter(з => з.дати.some(d => d !== cronSince));

    check("у кожній із них дата та сама, що в крона", чужі.length === 0,
        чужі.map(з => `${з.файл}: ${з.дати.join("/")}`).join("; "));

    check("не рахуємо вже списані", /o\.stock_applied = false/.test(sql));

    check("не рахуємо скасовані",
        /coalesce\(o\.status, 'new'\) <> 'cancelled'/.test(sql));

    // Той самий набір ознак, що в крона.
    check("крон дивиться на ті самі поля",
        /stock_applied/.test(cron) && /CANCELLED/.test(cron));
}

console.log("\n[3] Гонку вирішує блокування, а не сподівання");
{
    check("перевірка стоїть ДО вставки",
        /create trigger orders_flag_stock_shortfall\s*\n\s*before insert on public\.orders/.test(sql));

    // Без «for update» обидві транзакції прочитали б «лишилась 1»
    // одночасно — саме те, що лікуємо.
    check("рядок залишку блокується",
        /select qty into v_have[\s\S]{0,200}for update;/.test(sql));

    check("порівнюємо з урахуванням зайнятих",
        /v_have - public\.stock_reserved\(v_id, v_color, v_size\) < v_qty/.test(sql));

    // Магазин торгує під замовлення — це нормальний стан товару.
    // Відмова коштувала б продажу там, де досить чесної позначки.
    check("замовлення не відхиляється", !/raise exception/i.test(sql));

    // Тригер стоїть на шляху КОЖНОГО замовлення — і з сайту, і з бота.
    // Будь-яка несподіванка в ньому без цього блоку означала б, що
    // магазин перестає приймати замовлення взагалі.
    check("будь-яка помилка всередині не блокує замовлення",
        /exception[\s\S]{0,600}when others then[\s\S]{0,200}return new;/.test(sql));

    // Один товар із нечисловим id завалив би приведення типу — разом
    // із вставкою замовлення.
    check("нечисловий id не валить вставку",
        /~ '\^\[0-9\]\{1,18\}\$'/.test(sql) && !/nullif\(v_item->>'id', ''\)::bigint/.test(sql));

    check("позначка лягає в сам рядок кошика",
        /jsonb_build_object\('stockShort', true\)/.test(sql));

    // Товар, залишки якого не ведуться, рядка не має — і перевіряти
    // на ньому нічого.
    check("немає рядка — немає перевірки", /if not found then[\s\S]{0,120}continue;/.test(sql));

    check("таблиця закрита від клієнта",
        /alter table public\.stock enable row level security/.test(sql)
        && !/create policy[^\n]*on public\.stock/.test(sql));

    check("є індекс під підрахунок",
        /create index if not exists orders_stock_pending_idx/.test(sql));
}

console.log("\n[4] Знімок оновлюється вчасно");
{
    const cronYml = read(".github/workflows/apply-stock.yml");
    const buildYml = read(".github/workflows/build-products.yml");

    check("крон оновлює знімок", /node scripts\/push-stock\.js --dir=/.test(cronYml));

    // ПОРЯДОК. Між «списали в гілку» і «позначили враховані» база ще
    // рахує ці замовлення. Якщо оновити знімок після позначки, у цю
    // мить залишок буде старий, а замовлення вже не рахуються — і
    // одиниця «оживе».
    const pushAt = cronYml.indexOf("push-stock.js");
    const applyAt = cronYml.indexOf("Списати в main");
    const markAt = cronYml.indexOf("Позначити замовлення врахованими");

    check("знімок — після списання й до позначки",
        applyAt < pushAt && pushAt < markAt,
        `списання ${applyAt}, знімок ${pushAt}, позначка ${markAt}`);

    check("збірка прода теж оновлює знімок",
        /run: node scripts\/push-stock\.js/.test(buildYml));

    // Недоступна база не має робити виливку сайту червоною.
    check("збій знімка не валить виливку",
        /continue-on-error: true\s*\n\s*env:\s*\n\s*SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,120}push-stock\.js/.test(buildYml));

    check("знімок бере гілку магазину",
        /push-stock\.js --dir="\$GITHUB_WORKSPACE\/main-tree\/data\/products"/.test(cronYml));
}

console.log("\n[5] Позначку видно там, де дивляться замовлення");
{
    const format = read("supabase/functions/telegram-order-bot/format.js");
    const bundle = read("supabase/functions/telegram-order-bot/index.ts");
    const admin = read("admin/orders.js");

    check("у картці Telegram", /item\.stockShort \? "\\n   ⚠️ <b>залишку не було<\/b>/.test(format));

    // Бот працює зі зібраного index.ts — правка в format.js без
    // перезбірки нікуди не доїде.
    check("зібрана функція оновлена", bundle.includes("stockShort"));

    check("у панелі замовлень", /item\.stockShort/.test(admin));

    check("позначка стоїть біля свого товару, а не окремим блоком",
        /const short = item\.stockShort[\s\S]{0,200}item-variant/.test(admin));
}

console.log("\n[6] Найгарячіший запит магазину не множить роботу");
{
    // stock_live() — ЄДИНИЙ запит до бази, який робить кожен
    // відвідувач: наявність показана на 158 сторінках, і знімок
    // оновлюється раз на хвилину перегляду (CACHE_MS у live-stock.js).
    //
    // Написана вона була через stock_reserved() у списку колонок —
    // тобто база заново перебирала всі незакриті замовлення НА КОЖЕН
    // рядок залишку. 91 рядок = 91 перебір на один виклик, заміряно
    // 96/136/725 мс. Вартість = (рядків у stock) × (позицій у роботі),
    // і обидва множники ростуть разом з асортиментом.
    //
    // Перевірка дивиться на ФОРМУ запиту, бо саме форма задає
    // складність: ціна помилки тут не «трохи повільніше», а «сайт
    // ліг, щойно додали товарів».
    const каталог = path.join(ROOT, "supabase", "migrations");

    const файли = fs.readdirSync(каталог).filter(f => f.endsWith(".sql")).sort();

    // Остання міграція, яка переоголошує функцію, — вона й діє.
    //
    // ДУЖКА В ВИРАЗІ ОБОВʼЯЗКОВА. Без неї «public.stock_live»
    // збігається і з «public.stock_live_disabled»: перейменована
    // функція вважалась би чинною, перевірка читала б її тіло й
    // світила зеленим, а в базі далі працював би старий перебір із
    // міграції 012. Показано зламом.
    const оголошує = файл => /create or replace function public\.stock_live\s*\(/
        .test(read(path.join("supabase", "migrations", файл)));

    const остання = файли.filter(оголошує).pop();

    check("знайдено міграцію, яка задає stock_live", Boolean(остання), остання);

    const живий = остання
        ? read(path.join("supabase", "migrations", остання))
        : "";

    const тіло = (живий.match(/create or replace function public\.stock_live[\s\S]*?\n\$\$;/) || [""])[0];

    check("виклику на кожен рядок більше немає",
        !/stock_reserved\(s\.product_id/.test(тіло),
        остання);

    // Саме «left join reserved», а не просто «left join»: інакше вираз
    // ловиться на згадці в коментарі, і запит, у якому приєднання
    // замінили чимось іншим, лишається зеленим.
    check("замовлення розкладаються один раз і згортаються",
        /jsonb_array_elements/.test(тіло) && /group by/.test(тіло)
        && /left join reserved/.test(тіло));

    // Приведення JSON-значення до числа в один прохід небезпечніше,
    // ніж було: раніше воно рахувалось лише для комірки, що збіглася,
    // тепер — для всіх позицій. Один нечисловий qty поклав би живий
    // залишок одразу на всьому сайті.
    check("нечисловий qty не кладе функцію",
        /case when \(i->>'qty'\) ~ '\^\[0-9\]\+\$'/.test(тіло));

    check("id лишається текстом, без приведення до bigint",
        !/\(i->>'id'\)::bigint/.test(тіло));

    // А сама stock_reserved лишається: її викликає тригер на кожне
    // замовлення, і там вона рахує ОДНУ комірку — те, для чого
    // годиться. Прибрати її означало б зламати захист від подвійного
    // продажу (блок [3] вище).
    check("stock_reserved лишилась для тригера",
        /create or replace function public\.stock_reserved\s*\(/.test(sql)
        && /v_have - public\.stock_reserved\(/.test(sql));
}

console.log(failures === 0
    ? "\n✅ Останній екземпляр двічі не продасться\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
