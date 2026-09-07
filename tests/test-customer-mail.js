// Покупець із сайту дізнається про своє замовлення.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Сповіщення про статус ішли в telegram_chat_id, а він є ЛИШЕ в
// замовлень із бота. Покупець із сайту не отримував нічого: ні
// «прийнято в роботу», ні «відправлено, накладна така-то», ні
// «скасовано». Це половина всіх покупців.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ОДИН КАНАЛ НА ПОКУПЦЯ. Є чат — пишемо в чат, немає — листом.
//    Двох повідомлень про одне й те саме бути не повинно.
// 2. БЕЗ КЛЮЧА НІЧОГО НЕ ЛАМАЄТЬСЯ. Немає розсилки — немає листів, і
//    все інше працює як раніше.
// 3. ЛИСТ НЕ ЗУПИНЯЄ ТЕ, ЧЕРЕЗ ЩО ВИНИК: ні зміну статусу, ні
//    створення замовлення.
// 4. ТЕКСТ ЛИСТА Й ТЕКСТ У TELEGRAM РОЗПОВІДАЮТЬ ОДНЕ Й ТЕ САМЕ.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const src = read("supabase/functions/telegram-order-bot/_index.src.ts");
const built = read("supabase/functions/telegram-order-bot/index.ts");
const checkout = read("assets/js/checkout.js");

const mail = require("../supabase/functions/telegram-order-bot/mail.js");

const ORDER = {
    order_number: "0708553442",
    email: "buyer@example.com",
    total: 11000,
    subtotal: 12000,
    discount: 1000,
    delivery_price: 90,
    delivery_method: "Нова пошта, відділення",
    delivery_city: "Київ",
    tracking_number: "20450000000000",
    items: [{ title: "Сумка Coach Tabby 26", brand: "Coach", price: 11000, qty: 1, color: "Чорний", size: "ONESIZE" }]
};

console.log("\n[1] Лист про замовлення");
{
    const letter = mail.orderLetter(ORDER, "https://bestbrnd4u.com");

    check("є тема з номером", /0708553442/.test(letter.subject), letter.subject);

    check("у листі є склад замовлення", /Coach Tabby 26/.test(letter.html));

    check("є сума", /11\s?000/.test(letter.html.replace(/&nbsp;| /g, " ")));

    check("є знижка й доставка",
        /Знижка/.test(letter.html) && /Нова пошта/.test(letter.html));

    check("є контакти магазину",
        /t\.me\/bestbrnd4u/.test(letter.html) && /proton\.me/.test(letter.html));

    // Пошта вирізає <style> і не знає сучасного CSS: усе оформлення
    // мусить бути в атрибутах.
    check("оформлення inline, без <style>", !/<style/.test(letter.html));

    // Дані замовлення пише покупець.
    const evil = mail.orderLetter({
        ...ORDER,
        items: [{ title: '<img src=x onerror=alert(1)>', price: 1, qty: 1 }]
    }, "");

    check("розмітка з даних екранується",
        !/<img src=x/.test(evil.html) && /&lt;img/.test(evil.html));
}

console.log("\n[1a] Фото товарів у листі");
{
    const withPhoto = mail.orderLetter({
        ...ORDER,
        items: [{ ...ORDER.items[0], image: "https://bestbrnd4u.com/assets/images/x.webp?v=1" }]
    }, "");

    check("фото вставляється", /<img src="https:\/\/bestbrnd4u\.com\/assets\/images\/x\.webp\?v=1"/.test(withPhoto.html));

    // Gmail за замовчуванням не вантажить картинки, а Outlook не знає
    // webp — рядок мусить читатись і без фото.
    check("є alt із назвою товару",
        /alt="Сумка Coach Tabby 26"/.test(withPhoto.html));

    // Фіксована висота + object-fit, якого Outlook не знає, дали б
    // розтягнуте фото. Тому тільки ширина.
    check("висота не задана", !/height="\d/.test(withPhoto.html)
        && !/object-fit/.test(withPhoto.html));

    check("ширина обмежена", /width="64"/.test(withPhoto.html));

    // Відносний шлях у листі веде в нікуди: знімок замовлення робить
    // адреси абсолютними ще на сайті (absoluteUrl у checkout.js).
    check("сайт кладе в знімок абсолютну адресу",
        /image: absoluteUrl\(product\.images/.test(read("assets/js/checkout.js")));

    // Товар без фото не має ламати рядок.
    const noPhoto = mail.orderLetter(ORDER, "");

    check("без фото рядок цілий",
        !/<img/.test(noPhoto.html) && /Coach Tabby 26/.test(noPhoto.html));
}

console.log("\n[2] Лист про статус");
{
    const shipped = mail.statusLetter(ORDER, "shipped", "https://bestbrnd4u.com");

    check("відправлення: є тема", /відправлено/i.test(shipped.subject));

    check("відправлення: є накладна", /20450000000000/.test(shipped.html));

    check("відправлення: є кнопка відстеження",
        /Відстежити посилку/.test(shipped.html) && /novaposhta/i.test(shipped.html));

    check("без накладної лист усе одно осмислений",
        /надішлемо окремо/.test(mail.statusLetter({ order_number: "1" }, "shipped", "").html));

    ["processing", "completed", "cancelled"].forEach(status => {
        check(`статус ${status} має свій лист`, Boolean(mail.statusLetter(ORDER, status, "")));
    });

    // «Нове» покупцеві не повідомляють: він щойно оформив замовлення
    // й уже отримав підтвердження.
    check("про статус «нове» листа немає", mail.statusLetter(ORDER, "new", "") === null);

    check("невідомий статус не вигадує листа", mail.statusLetter(ORDER, "щось", "") === null);

    // Лист «відправлено» без складу відповідає на «коли», але не на
    // «що». Через тиждень після покупки це різні питання, і другого
    // покупець не пам'ятає.
    ["processing", "shipped", "completed", "cancelled"].forEach(status => {

        const letter = mail.statusLetter({
            ...ORDER,
            items: [{ ...ORDER.items[0], image: "https://bestbrnd4u.com/assets/images/x.webp" }]
        }, status, "");

        check(`${status}: є склад замовлення`,
            /Ваше замовлення/.test(letter.html) && /Coach Tabby 26/.test(letter.html));

        check(`${status}: є фото товару`, /<img src="https:/.test(letter.html));

        check(`${status}: є підсумок`, /Разом/.test(letter.html));

    });

    // Повного рахунку в листах про статус бути не повинно: знижка й
    // доставка вже були в підтвердженні, а тут важливо нагадати товар,
    // а не переписати рахунок.
    check("рахунок не дублюється",
        !/Знижка/.test(mail.statusLetter(ORDER, "shipped", "").html));

    // Замовлення без складу (таке буває в бота) не має лишати
    // порожній блок із заголовком.
    check("порожній склад не малює блока",
        !/Ваше замовлення/.test(mail.statusLetter({ order_number: "1", items: [] }, "shipped", "").html));

    // Текст листа й текст у Telegram мусять говорити одне й те саме.
    const format = read("supabase/functions/telegram-order-bot/format.js");

    ["processing", "shipped", "completed", "cancelled"].forEach(status => {
        check(`${status} є і в чаті, і в листі`,
            new RegExp(`case "${status}"`).test(format)
            && new RegExp(`case "${status}"`).test(read("supabase/functions/telegram-order-bot/mail.js")));
    });
}

console.log("\n[3] Куди й чим надсилати");
{
    const config = {
        to: "buyer@example.com",
        from: "BestBrnd4u <noreply@bestbrnd4u.com>",
        resendKey: "re_test"
    };

    const resend = mail.mailRequest(config, mail.orderLetter(ORDER, ""));

    check("Resend: адреса сервісу", resend.url === "https://api.resend.com/emails");
    check("Resend: ключ у заголовку", /Bearer re_test/.test(resend.headers.Authorization));
    check("Resend: одержувач у тілі", resend.body.to[0] === "buyer@example.com");

    const brevo = mail.mailRequest({ ...config, resendKey: "", brevoKey: "xkeysib" },
        mail.orderLetter(ORDER, ""));

    check("Brevo: адреса сервісу", brevo.url === "https://api.brevo.com/v3/smtp/email");
    check("Brevo: ключ у своєму заголовку", brevo.headers["api-key"] === "xkeysib");

    // Brevo хоче ім'я й адресу окремо — розбір «Ім'я <адреса>».
    check("Brevo: ім'я й адреса розділені",
        brevo.body.sender.name === "BestBrnd4u"
        && brevo.body.sender.email === "noreply@bestbrnd4u.com",
        JSON.stringify(brevo.body.sender));

    check("проста адреса теж приймається",
        mail.mailRequest({ to: "a@b.c", from: "shop@bestbrnd4u.com", brevoKey: "k" },
            mail.orderLetter(ORDER, "")).body.sender.email === "shop@bestbrnd4u.com");

    // Найважливіше: без налаштувань нічого не надсилається.
    check("без ключа — жодного запиту",
        mail.mailRequest({ to: "a@b.c", from: "s@b.c" }, mail.orderLetter(ORDER, "")) === null);

    check("без пошти покупця — жодного запиту",
        mail.mailRequest({ from: "s@b.c", resendKey: "k" }, mail.orderLetter(ORDER, "")) === null);

    check("без адреси відправника — жодного запиту",
        mail.mailRequest({ to: "a@b.c", resendKey: "k" }, mail.orderLetter(ORDER, "")) === null);

    check("без листа — жодного запиту",
        mail.mailRequest({ to: "a@b.c", from: "s@b.c", resendKey: "k" }, null) === null);

    // Слати з noreply@ і не дати куди відповісти — гірше, ніж не слати
    // зовсім: «Відповісти» на лист про своє замовлення це найприродніша
    // реакція, а скриньки за такою адресою немає.
    check("Resend: є куди відповісти",
        resend.body.reply_to === mail.SHOP_EMAIL, resend.body.reply_to);

    check("Brevo: є куди відповісти",
        brevo.body.replyTo.email === mail.SHOP_EMAIL, JSON.stringify(brevo.body.replyTo));

    check("адресу для відповіді можна перевизначити",
        mail.mailRequest({ to: "a@b.c", from: "s@b.c", resendKey: "k", replyTo: "inbox@shop.ua" },
            mail.orderLetter(ORDER, "")).body.reply_to === "inbox@shop.ua");

    check("та сама адреса стоїть у підвалі листа",
        mail.orderLetter(ORDER, "").html.includes(mail.SHOP_EMAIL));

    check("секрет прокинутий у функції",
        /replyTo: MAIL_REPLY_TO/.test(read("supabase/functions/telegram-order-bot/_index.src.ts")));
}

console.log("\n[4] Один канал на покупця");
{
    check("немає чату — йде лист",
        /if \(!chatId\) \{[\s\S]{0,600}sendCustomerMail\(order, statusLetter/.test(src));

    // Гілка з листом мусить ЗАВЕРШИТИСЬ раніше, ніж почнеться
    // надсилання в чат: інакше покупець із бота, у якого колись
    // з'явиться пошта, отримає і те, і те.
    const mailAt = src.indexOf("sendCustomerMail(order, statusLetter");
    const chatAt = src.indexOf("const text = customerStatusMessage");

    check("є чат — лист не йде",
        mailAt > 0 && chatAt > mailAt && /\breturn\b/.test(src.slice(mailAt, chatAt)));

    check("підтвердження — лише для замовлень із сайту",
        /if \(!record\?\.telegram_chat_id\) \{[\s\S]{0,200}orderLetter\(record/.test(src));

    // Усі три місця, де змінюється статус (кнопка в Telegram, збереження
    // ТТН, панель адмінки), ходять через notifyCustomer — тому лист
    // додався одразу всім.
    check("усі шляхи зміни статусу проходять через одну функцію",
        (src.match(/await notifyCustomer\(/g) || []).length >= 3);
}

console.log("\n[5] Нічого не ламається без налаштувань");
{
    check("лист не кидає винятків",
        /async function sendCustomerMail[\s\S]{0,900}try \{[\s\S]{0,600}catch \(error\)/.test(src));

    check("немає ключа — просто нічого не робимо",
        /if \(!request\) return false;/.test(src));

    check("ключі читаються з секретів",
        /RESEND_API_KEY = Deno\.env\.get\("RESEND_API_KEY"\)/.test(src)
        && /BREVO_API_KEY = Deno\.env\.get\("BREVO_API_KEY"\)/.test(src)
        && /MAIL_FROM = Deno\.env\.get\("MAIL_FROM"\)/.test(src));

    check("зібрана функція не застаріла",
        built.includes("api.resend.com/emails") && built.includes("sendCustomerMail"));

    check("секрети описані в інструкції",
        /RESEND_API_KEY/.test(read("supabase/README-telegram-bot.md"))
        && /MAIL_FROM/.test(read("supabase/README-telegram-bot.md")));
}

console.log("\n[6] Два листи про одне замовлення неможливі");
{
    const config = JSON.parse(read("data/notifications.json"));

    check("галочка є", "serverEmail" in config);

    // Значення НЕ закріплюємо.
    //
    // Спершу тут стояло «мусить бути false» — на час, поки розсилка не
    // працювала: увімкнена галочка тоді означала б, що сторінка вже не
    // шле підтвердження, а сервер ще не почав. Розсилку налаштовано й
    // перевірено на живих листах, тож тепер це просто вибір власника, і
    // тест не має права його забороняти.
    //
    // Лишається те, що справді важливо: це або так, або ні — жодного
    // третього стану, який код зрозумів би як «увімкнено».
    check("значення — так або ні", typeof config.serverEmail === "boolean",
        typeof config.serverEmail);

    check("сторінка не шле свій лист, коли шле сервер",
        /config\.serverEmail === true\) return \{ skipped: true \}/.test(checkout));

    // Налаштування читаються обіцянкою: якщо людина натисне кнопку
    // раніше, ніж приїде файл, вибір мусить бути вже відомий.
    check("вибір відомий до надсилання",
        /notificationsConfig\(\)\.then\(config =>/.test(checkout));

    check("галочка редагується в адмінці",
        /data\/notifications\.json/.test(read("admin/config.yml")));

    check("є покрокова документація",
        fs.existsSync(path.join(ROOT, "docs/ЛИСТИ-ПОКУПЦЮ.md")));

    // Друга половина тієї самої проблеми: листи входу в кабінет ідуть
    // через вбудований SMTP Supabase з лімітом кілька листів на годину.
    const doc = read("docs/ЛИСТИ-ПОКУПЦЮ.md");

    check("сказано, як полагодити листи кабінету",
        /smtp\.resend\.com/.test(doc) && /smtp-relay\.brevo\.com/.test(doc));

    // Панель Supabase перенесла SMTP із Project Settings у розділ
    // Authentication. Інструкція, яка веде не туди, коштує часу —
    // тому тут закріплено саме актуальний шлях.
    check("шлях до SMTP — актуальний",
        /auth\/smtp/.test(doc) && /Не в Project Settings/.test(doc));

    // Свій SMTP без підняття ліміту — робота наполовину: вбудований
    // відправник дає 2 листи на годину, і саме через це все й почалось.
    check("сказано про ліміт листів",
        /auth\/rate-limits/.test(doc) && /2 листи на годину/.test(doc));
}

console.log(failures === 0
    ? "\n✅ Листи: покупець із сайту дізнається про замовлення так само, як із бота\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
