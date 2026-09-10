// Лист «дякуємо за покупку» з персональним промокодом.
//
// НАВІЩО
// -------
// Найдешевший покупець — той, що вже один раз заплатив: він знає
// магазин, отримав річ і переконався, що вона справжня. Після
// «Виконано» магазин із ним більше не говорив ніколи.
//
// ГОЛОВНІ НЕБЕЗПЕКИ, ЯКІ ТУТ СТЕРЕЖУТЬСЯ
// ---------------------------------------
// 1. КОД, ЯКОГО НЕ ІСНУЄ. Якщо спершу надіслати лист, а потім
//    створити код, збій на пів дороги залишить покупця з кодом, який
//    не працює. Це гірше, ніж не надіслати нічого.
// 2. ДРУГИЙ ЛИСТ ЗА ТЕ САМЕ ЗАМОВЛЕННЯ. Позначка мусить ставитись
//    ЛИШЕ після успішної відправки — і саме про замовлення, а не про
//    пошту: одна людина робить кілька замовлень.
// 3. ЛИСТ, ЯКИЙ ПІШОВ САМ СОБОЮ. За замовчуванням вимкнено: інакше
//    після перенесення в main розсилка почалася б без відома власника.
// 4. ЗНИЖКА ЗА ВІДГУК. Прохання про відгук іде на сьомий день. Знижка
//    в тому самому листі виглядала б як плата за відгук.
// 5. ВІЧНИЙ «ПЕРСОНАЛЬНИЙ» КОД. Без межі використань і дати він за
//    тиждень опиниться в чаті «промокоди всіх магазинів».
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const script = read("scripts/send-thankyou.js");
const migration = read("supabase/migrations/026-thank-you.sql");
const workflow = read(".github/workflows/thank-you.yml");
const admin = read("admin/config.yml");

const { thankYouLetter } = require("../supabase/functions/telegram-order-bot/mail.js");

console.log("\n[1] Спершу код, потім лист");
{
    const savePos = script.indexOf("rpc/promo_admin_save");
    const sendPos = script.indexOf("await send(letter");

    check("код створюється раніше за відправку", savePos > 0 && savePos < sendPos,
        `код ${savePos}, лист ${sendPos}`);

    check("невдале створення коду зупиняє лист",
        /if \(!saved\.ok\) \{[\s\S]{0,200}continue;/.test(script));
}

console.log("\n[2] Другого листа за те саме замовлення не буде");
{
    check("є таблиця пам'яті", /create table if not exists public\.thankyou_sent/.test(migration));

    // Ключ — номер замовлення, а не пошта: одна людина робить кілька
    // замовлень, і кожне заслуговує на своє «дякуємо».
    check("ключ — номер замовлення",
        /order_number text\s+primary key/.test(migration));

    check("перелік виключає тих, кому вже писали",
        /not exists \(\s*select 1 from public\.thankyou_sent/.test(migration));

    const markPos = script.indexOf("thankyou_sent");
    const sendPos = script.indexOf("const ok = await send(letter");

    check("позначка ставиться ПІСЛЯ відправки", markPos > sendPos,
        `лист ${sendPos}, позначка ${markPos}`);

    check("невдала відправка не позначає",
        /if \(!ok\) continue;/.test(script));

    // Два одночасні запуски взяли б той самий перелік.
    check("одночасні запуски заборонені", /concurrency:\s*\n\s*group: thank-you/.test(workflow));
}

console.log("\n[3] Сам собою лист не піде");
{
    const settings = JSON.parse(read("data/notifications.json"));

    check("за замовчуванням вимкнено", settings.thankYou === false);

    check("скрипт мовчки виходить, поки вимкнено",
        /if \(!config\.enabled\)/.test(script));

    check("вмикається в адмінці", /name: "thankYou"/.test(admin));

    // Без ключів і без міграції теж мовчить — розклад не має
    // червоніти через ненастроєне.
    check("без ключа бази виходить спокійно",
        /SUPABASE_SERVICE_ROLE_KEY не заданий/.test(script));

    check("без розсилки теж", /Немає ключа розсилки/.test(script));

    check("без міграції теж",
        /Функції thankyou_candidates немає/.test(script));
}

console.log("\n[4] Знижка окремо від прохання про відгук");
{
    const reviews = read(".github/workflows/request-reviews.yml");

    const at = text => (text.match(/cron: "(\d+) (\d+)/) || [])[2];

    check("це два різні кроки", at(workflow) !== at(reviews),
        `${at(reviews)} проти ${at(workflow)}`);

    const settings = JSON.parse(read("data/notifications.json"));

    // На сьомий день іде прохання про відгук. Два листи поспіль — це
    // вже розсилка, а не увага.
    check("«дякуємо» приходить пізніше за прохання про відгук",
        settings.thankYouDays >= 14, settings.thankYouDays);

    check("в адмінці про це сказано",
        /на сьомий день уже йде прохання про відгук/i.test(admin));

    // Найголовніше: у листі не має бути жодного натяку на обмін.
    const letter = thankYouLetter(
        { order_number: "1", first_name: "Оля" },
        { code: "BB-ABCDEF", percent: 10, expiresAt: "2026-10-12T00:00:00Z" },
        "https://bestbrnd4u.com");

    check("у листі немає слова про відгук",
        !/відгук|відгуки|оцін/i.test(letter.html), "лист згадує відгук");
}

console.log("\n[5] Код персональний, а не вічний");
{
    check("одноразовий", /p_max_uses: 1/.test(script));

    check("зі строком", /p_expires_at: promo\.expiresAt/.test(script));

    check("строк рахується з налаштування",
        /config\.life \* 24 \* 60 \* 60 \* 1000/.test(script));

    // Номер замовлення в самому коді видавав би чуже замовлення
    // кожному, кому код перешлють.
    check("номер замовлення не потрапляє в код",
        /promoRandomCode\("BB", crypto\.randomBytes\(6\)\)/.test(script));

    // Але в нотатці — потрапляє: у панелі промокодів має бути видно,
    // звідки цей код узявся.
    check("у нотатці видно, за що код",
        /p_note: `дякуємо за замовлення \$\{row\.order_number\}`/.test(script));

    check("відсоток переводиться в частки",
        /p_percent: config\.percent \/ 100/.test(script));
}

console.log("\n[6] Сам лист");
{
    const letter = thankYouLetter(
        { order_number: "3098816532", first_name: "Олена" },
        { code: "BB-K7M2QX", percent: 10, expiresAt: "2026-10-12T00:00:00Z" },
        "https://bestbrnd4u.com");

    check("код у темі — його видно ще у списку листів",
        /BB-K7M2QX/.test(letter.subject), letter.subject);

    check("код у самому листі", /BB-K7M2QX/.test(letter.html));

    check("ім'я підставляється", /Олена/.test(letter.html));

    // Дату пишемо словами: «до 12.10.2026» читається як реквізит.
    check("дата словами", /до 12 жовтня/.test(letter.html),
        (letter.html.match(/діє до [^<]*/) || ["—"])[0]);

    check("кнопка веде в каталог", /bestbrnd4u\.com\/catalog/.test(letter.html));

    check("сказано, куди вводити код", /Маєте промокод/.test(letter.html));

    // Строк тут потрібен, щоб код не жив вічно, а не щоб квапити.
    check("без зворотного відліку й тиску",
        !/поспіш|терміново|встигн|залишилось \d|лише сьогодні/i.test(letter.html));

    // Без імені лист теж мусить читатись.
    const noName = thankYouLetter({ order_number: "1" },
        { code: "BB-A", percent: 5 }, "https://bestbrnd4u.com");

    check("без імені лист не ламається",
        /Дякуємо за покупку/.test(noName.html) && !/undefined/.test(noName.html));

    // Ім'я приходить від покупця — у ньому може бути що завгодно.
    const evil = thankYouLetter({ order_number: "1", first_name: '<img src=x onerror=alert(1)>' },
        { code: "BB-B", percent: 5 }, "https://bestbrnd4u.com");

    check("ім'я екранується", !/<img/.test(evil.html));
}

console.log("\n[7] Розклад бере налаштування з адмінки, а не з YAML");
{
    // Міняти строк і відсоток мусить власник, а не той, хто вміє
    // правити YAML.
    check("у workflow немає чисел строку", !/--days=|--percent=/.test(workflow));

    check("скрипт читає налаштування", /data.*notifications\.json/.test(script));

    ["thankYouDays", "thankYouPercent", "thankYouLife"].forEach(name => {
        check(`«${name}» є в адмінці`, new RegExp(`name: "${name}"`).test(admin));
    });

    // Аргументи командного рядка лишаються — для перевірок і разових
    // запусків.
    check("разовий запуск можна переозброїти аргументами",
        /arg\("days"/.test(script) && /arg\("percent"/.test(script));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
