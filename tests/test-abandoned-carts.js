// Брошений кошик: лист людині, яка вже все обрала — і пішла.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. НЕ НАГАДУЄМО ПРО КУПЛЕНЕ. Замовлення після останньої зміни
//    кошика означає, що людина дійшла до кінця. Лист «ви залишили
//    товар» після покупки — найгірший можливий лист.
//
// 2. ОДИН ЛИСТ НА КОШИК. Другий про ті самі товари це надокучання й
//    найкоротший шлях у спам.
//
// 3. ПОШТИ ПОКУПЦІВ НЕ ВИДНО КЛІЄНТУ. Відбір читає auth.users, тому
//    доступ до нього має лише службовий ключ.
//
// 4. БЕЗ НАЛАШТУВАНЬ КРОК МОВЧИТЬ. Немає ключа розсилки — немає
//    листів, і розклад не червоніє.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const sql = read("supabase/migrations/016-abandoned-carts.sql");
const script = read("scripts/remind-carts.js");
const workflow = read(".github/workflows/remind-carts.yml");

const mail = require("../supabase/functions/telegram-order-bot/mail.js");
const { buildItems } = require("../scripts/remind-carts.js");

console.log("\n[1] Кого база вважає брошеним кошиком");
{
    check("є функція відбору",
        /create or replace function public\.abandoned_carts/.test(sql));

    check("кошик мусить полежати", /carts\.touched < now\(\) - p_idle/.test(sql));

    // Кошик місячної давнини це не «забув», а «передумав».
    check("але не місяцями", /carts\.touched > now\(\) - interval '30 days'/.test(sql));

    // Найважливіша умова: не нагадувати про те, що вже куплено.
    check("замовлення після кошика скасовує нагадування",
        /not exists \([\s\S]{0,200}from public\.orders o[\s\S]{0,200}o\.created_at > carts\.touched/.test(sql));

    check("порожні кошики не рахуються", /from public\.cart_items/.test(sql)
        && /group by c\.user_id/.test(sql));

    check("без пошти нагадувати нікуди", /u\.email is not null/.test(sql));

    check("одне нагадування на склад кошика",
        /r\.fingerprint <> carts\.fingerprint/.test(sql));

    check("відбиток складу стабільний",
        /order by c\.product_id, c\.color, c\.size/.test(sql));

    // Час зміни кошика беремо з рядків: сайт синхронізує кошик
    // видаленням і вставкою, тож окремий тригер не потрібен.
    check("час зміни кошика зберігається",
        /add column if not exists updated_at/.test(sql));

    check("таблиця «кому писали» є",
        /create table if not exists public\.cart_reminders/.test(sql));

    // Кошик уже існує — його створювали разом із кабінетом, і в нього
    // свої політики. Спершу тут стояв «create table if not exists» як
    // запобіжник; редактор Supabase справедливо попередив, що в такому
    // створенні немає RLS, а кнопка «Run and enable RLS» дописала б
    // увімкнення RLS до чужої таблиці. Якби політик не виявилось,
    // кошик перестав би відкриватись у всіх, хто увійшов.
    check("міграція не створює таблицю кошика",
        !/create table if not exists public\.cart_items/.test(sql));

    check("кожна створена тут таблиця одразу закривається",
        (sql.match(/create table if not exists/g) || []).length
        === (sql.match(/enable row level security/g) || []).length);
}

console.log("\n[2] Пошти покупців закриті від клієнта");
{
    // Функція читає auth.users. Дати до неї доступ anon означало б
    // віддати список пошт усіх покупців будь-кому з відкритим ключем.
    check("доступ лише службовому ключу",
        /grant execute on function public\.abandoned_carts\(interval, integer\) to service_role/.test(sql));

    check("у anon доступ відібрано",
        /revoke all on function public\.abandoned_carts\(interval, integer\) from anon, authenticated/.test(sql));

    check("таблиця нагадувань закрита",
        /alter table public\.cart_reminders enable row level security/.test(sql));

    check("функція з правами власника", /security definer/.test(sql));

    check("search_path закріплений", /set search_path = public, auth/.test(sql));
}

console.log("\n[3] Лист збирається з каталогу");
{
    const products = new Map([[4, {
        id: 4, title: "Сумка Coach Tabby 26", brand: "Coach", price: 11000,
        variants: [
            { color: "Чорний", images: ["assets/images/black.webp"] },
            { color: "Білий", images: ["assets/images/white.webp"] }
        ]
    }]]);

    const items = buildItems(
        [{ product_id: 4, color: "Білий", size: "ONESIZE", qty: 2 }],
        products, "https://bestbrnd4u.com");

    check("назва й ціна з каталогу",
        items[0].title === "Сумка Coach Tabby 26" && items[0].price === 11000);

    // У листі про «Білий» має бути біла сумка, а не перша з каталогу.
    check("фото того кольору, який у кошику",
        items[0].image === "https://bestbrnd4u.com/assets/images/white.webp",
        items[0].image);

    check("адреса фото абсолютна", /^https:\/\//.test(items[0].image));

    check("кількість зберігається", items[0].qty === 2);

    // Товар могли зняти з продажу, поки кошик лежав.
    check("зниклий товар не потрапляє в лист",
        buildItems([{ product_id: 999, qty: 1 }], products, "x").length === 0);

    const letter = mail.cartLetter(items, "https://bestbrnd4u.com");

    check("є тема", /кошик/i.test(letter.subject), letter.subject);

    check("є фото й склад",
        /<img src="https:/.test(letter.html) && /Coach Tabby 26/.test(letter.html));

    check("є сума", /22\s?000/.test(letter.html.replace(/&nbsp;| /g, " ")));

    check("є кнопка назад у кошик",
        /Повернутись до кошика/.test(letter.html) && /\/cart/.test(letter.html));

    // Другий лист про ті самі товари — надокучання. Обіцянку «лист
    // один» треба тримати не лише в коді, а й перед покупцем.
    check("сказано, що лист один", /єдине нагадування/.test(letter.html));

    check("порожній кошик листа не дає", mail.cartLetter([], "x") === null);

    check("однина й множина розрізняються",
        mail.cartLetter([items[0]], "").subject !== mail.cartLetter([items[0], items[0]], "").subject);
}

console.log("\n[4] Крок обережний");
{
    check("без ключа бази — тиша",
        /Немає SUPABASE_SERVICE_ROLE_KEY/.test(script));

    check("без ключа розсилки — тиша",
        /Немає ключа розсилки/.test(script));

    // Немає міграції — це «ще не налаштовано», а не поломка.
    //
    // Повідомлення тепер збирає спільний помічник: крок забирає ДВА
    // переліки — кошики авторизованих (016) і незавершені оформлення
    // гостей (020), і кожен може бути ще не застосований окремо.
    check("без міграції не падає",
        /notConfigured\(`Функції \$\{rpc\} ще немає/.test(script));

    check("названо і сам перелік, і номер міграції",
        /fetchList\(url, key, "abandoned_carts", "016"\)/.test(script));

    // Невдала розсилка НЕ позначається як надіслана: наступний запуск
    // спробує ще. А кошик без товарів позначається — інакше він
    // перебирався б щогодини вічно.
    check("невдалий лист не позначається надісланим",
        /if \(ok \|\| !letter\)/.test(script));

    check("є суха прогонка", /--dry-run/.test(script));

    check("строк «тиші» можна змінити", /--idle=/.test(script));

    check("одночасних запусків немає",
        /group: remind-carts/.test(workflow) && /cancel-in-progress: false/.test(workflow));

    check("розклад щогодини", /cron: "0 \* \* \* \*"/.test(workflow));

    check("каталог викачується з main",
        /ref: main/.test(workflow));

    check("сказано, що розклад працює лише з main",
        /ЛИШЕ ПІСЛЯ ПЕРЕНЕСЕННЯ В MAIN/.test(workflow));

    check("є покрокова документація",
        fs.existsSync(path.join(ROOT, "docs/БРОШЕНИЙ-КОШИК.md")));

    // Обіцянки в документації мусять збігатися з кодом.
    const doc = read("docs/БРОШЕНИЙ-КОШИК.md");

    check("документація називає ті самі строки",
        /4 години/.test(doc) && /30 днів/.test(doc));

    // Раніше тут стояло «Не пише гостям» — і це перестало бути
    // правдою: гостю, який залишив пошту на сторінці оформлення,
    // нагадування тепер приходить (міграція 020). Тому перевіряємо не
    // старе твердження, а те, що документація описує МЕЖУ.
    check("сказано, кому саме не пишемо",
        /Не пише тому, хто не залишив пошти/.test(doc));

    check("описано незавершене оформлення гостя",
        /abandoned_checkouts/.test(doc) && /7 днів/.test(doc));

    check("сказано, що це не розсилка",
        /не додали в розсилку|не потрапляє ні в MailerLite/.test(doc));
}

console.log("\n[5] Про це сказано покупцю");
{
    const policy = read("privacy-policy.html");

    check("нагадування описане в політиці",
        /кошик/i.test(policy) && /нагадув/i.test(policy));
}

console.log(failures === 0
    ? "\n✅ Брошений кошик: одне нагадування тому, хто вже все обрав\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
