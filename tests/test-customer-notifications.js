// Сповіщення клієнту про зміну статусу + номер накладної.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const SRC = fs.readFileSync(path.join(ROOT,"supabase/functions/telegram-order-bot/_index.src.ts"),"utf8");

(async () => {

const M = await import(require("url").pathToFileURL(
  path.join(ROOT,"supabase/functions/telegram-order-bot/format.js")).href);
const F = await import(require("url").pathToFileURL(
  path.join(ROOT,"supabase/functions/telegram-order-bot/order-flow.js")).href);

const ORDER = { id:"uuid-1", order_number:"1234567890", telegram_chat_id: 555 };

console.log("\n[1] Тексти під кожен статус");
{
  const m = (st, extra={}) => M.customerStatusMessage({ ...ORDER, ...extra }, st);

  check("«В обробці» — повідомляємо", (m("processing") || "").includes("прийнято в роботу"));
  check("«Відправлено» — повідомляємо", (m("shipped") || "").includes("відправлено"));
  check("«Виконано» — дякуємо", (m("completed") || "").includes("Дякуємо"));
  check("«Скасовано» — пояснюємо", (m("cancelled") || "").includes("скасовано"));

  // клієнт щойно сам оформив — вітати його з цим не треба
  check("про «Нове» клієнта НЕ турбуємо", m("new") === null);
  check("невідомий статус нічого не шле", m("щось") === null);

  check("номер замовлення в кожному тексті",
        ["processing","shipped","completed","cancelled"].every(st => (m(st)||"").includes("1234567890")));
}

console.log("\n[2] Накладна");
{
  const withTtn = M.customerStatusMessage({ ...ORDER, tracking_number:"20450912345678" }, "shipped");
  check("ТТН показано клієнту", withTtn.includes("20450912345678"));

  const withoutTtn = M.customerStatusMessage(ORDER, "shipped");
  check("без ТТН — не мовчимо, а обіцяємо надіслати",
        withoutTtn.includes("надішлемо окремо"), withoutTtn);

  const kb = M.customerStatusKeyboard({ ...ORDER, tracking_number:"20450912345678" }, "shipped");
  check("є кнопка відстеження", !!kb, JSON.stringify(kb));
  check("веде на Нову пошту з номером",
        kb.inline_keyboard[0][0].url.includes("cargo_number=20450912345678"));

  check("без ТТН кнопки немає", M.customerStatusKeyboard(ORDER,"shipped") === undefined);
  check("на інших статусах кнопки немає",
        M.customerStatusKeyboard({...ORDER,tracking_number:"20450912345678"},"processing") === undefined);
}

console.log("\n[3] Перевірка введеного ТТН");
{
  const v = M.validateTracking;
  check("порожнє відхиляється", v("").ok === false);
  check("текст замість номера відхиляється", v("завтра відправлю").ok === false);
  check("закороткий номер відхиляється", v("12345").ok === false);
  check("14 цифр приймається", v("20450912345678").value === "20450912345678");
  check("пробіли й дефіси прибираються",
        v("2045-0912 345678").value === "20450912345678");
  check("надто довгий відхиляється", v("1".repeat(25)).ok === false);
  check("у підказці згадано /skip", v("").error.includes("/skip"));
}

console.log("\n[4] Замовлення з БОТА знає чат клієнта");
{
  const row = F.buildOrderRow({id:1,title:"X",price:100}, { qty:1, chat_id: 777 }, "1234567890");
  check("telegram_chat_id зберігається", row.telegram_chat_id === 777, row.telegram_chat_id);

  const noChat = F.buildOrderRow({id:1,title:"X",price:100}, { qty:1 }, "1234567890");
  check("без чату — null, а не помилка", noChat.telegram_chat_id === null);
}

console.log("\n[5] Замовлення з САЙТУ не ламають сповіщення");
{
  // Найважливіший випадок: у замовлень із сайту чату немає взагалі.
  // Бот мусить мовчки їх пропускати, а не падати й не слати нікуди.
  check("сповіщення шлеться лише за наявності чату",
        /const chatId = order\?\.telegram_chat_id;[\s\S]{0,200}if \(!chatId\) return;/.test(SRC));

  check("власнику пояснюється, що клієнта з сайту не сповістити",
        SRC.includes("замовляв на сайті"));

  const checkout = fs.readFileSync(path.join(ROOT,"assets/js/checkout.js"),"utf8");
  check("сайт не пише telegram_chat_id (і не повинен)",
        !checkout.includes("telegram_chat_id"));
}

console.log("\n[6] Збір ТТН у власника");
{
  check("після «Відправлено» бот просить накладну",
        SRC.includes('status === "shipped" && !updated.tracking_number'));
  check("запам'ятовує, до якого замовлення стосується відповідь",
        SRC.includes("awaiting_ttn_for: updated.id"));
  check("є /skip, якщо ТТН ще немає", SRC.includes('text.trim() === "/skip"'));
  check("ТТН обробляється ДО кроків оформлення клієнта",
        SRC.indexOf("handleTrackingInput(message)") < SRC.indexOf("handleOrderText(message)"));
  check("після збереження стан скидається",
        /awaiting_ttn_for: null/.test(SRC));
  check("клієнту шлеться повторно вже з номером",
        /notifyCustomer\(order, "shipped"\)/.test(SRC));
}

console.log("\n[7] Міграція");
{
  const sql = fs.readFileSync(path.join(ROOT,"supabase/migrations/003-customer-notifications.sql"),"utf8");
  check("додається telegram_chat_id", /add column if not exists telegram_chat_id/i.test(sql));
  check("додається tracking_number", /add column if not exists tracking_number/i.test(sql));
  check("додається awaiting_ttn_for", /add column if not exists awaiting_ttn_for/i.test(sql));
  check("повторний запуск безпечний (if not exists усюди)",
        (sql.match(/add column if not exists/gi) || []).length === 3);
}

console.log("\n[8] ТТН можна дослати після /skip");
{
  // Регресія: після «Відправлено» кнопка «Відправлено» зникає
  // (далі йдуть «Виконано» і «Скасовано»), тож порада «натисніть
  // ще раз» не працювала — накладну не було чим додати взагалі.
  const kbNoTtn = M.buildKeyboard("id1", "shipped", { hasTracking: false });
  const flat = kbNoTtn.inline_keyboard.flat().map(b => b.callback_data);

  check("під відправленим без ТТН є кнопка «Додати ТТН»",
        flat.includes("ttn:id1"), flat.join(", "));

  const kbWithTtn = M.buildKeyboard("id1", "shipped", { hasTracking: true });
  check("коли ТТН вже є — кнопки немає",
        !JSON.stringify(kbWithTtn).includes("ttn:"), JSON.stringify(kbWithTtn));

  check("на інших статусах кнопки ТТН немає",
        !JSON.stringify(M.buildKeyboard("id1","new",{}) ?? {}).includes("ttn:"));

  check("статусні кнопки лишились на місці",
        flat.includes("st:completed:id1") && flat.includes("st:cancelled:id1"));

  check("обробник кнопки є у функції", SRC.includes('data.startsWith("ttn:")'));
  check("кнопка ставить очікування саме цього замовлення",
        /awaiting_ttn_for: orderId/.test(SRC));
  check("картка перемальовується з урахуванням наявності ТТН",
        SRC.includes("hasTracking: Boolean(updated.tracking_number)"));
}

console.log("\n[9] Діалог не засмічує чат (редагування замість нових повідомлень)");
{
  // Клієнт скаржився, що доводиться прокручувати чат вручну, щоб
  // побачити наступне питання. Кожен крок надсилався окремим
  // повідомленням; тепер редагуємо одне.
  check("кроки редагують повідомлення", SRC.includes('telegram("editMessageText"'));
  check("id повідомлення зберігається в чернетці", SRC.includes("message_id"));
  check("якщо редагування не вдалось — надсилаємо нове",
        /if \(edited\?\.ok\) return;/.test(SRC));
  check("крок з телефоном лишається окремим повідомленням (потрібна звичайна клавіатура)",
        /if \(step === "phone"\)[\s\S]{0,400}phoneKeyboard\(\)/.test(SRC));
  check("нове оформлення починає нове повідомлення",
        /message_id: null/.test(SRC));

  const sql = fs.readFileSync(path.join(ROOT,"supabase/migrations/004-bot-message-id.sql"),"utf8");
  check("колонка message_id додається міграцією",
        /add column if not exists message_id/i.test(sql));
}

console.log("\n[10] Кілька замовлень: ТТН потрапляє в потрібне");
{
  // Проблема: awaiting_ttn_for один на чат. Натиснули «Додати ТТН»
  // під замовленням A, потім під B — очікування перезаписалось.
  // Якщо в тексті запиту не названо замовлення, власник бачить два
  // однакових повідомлення й не знає, на яке відповідає.

  check("запит по кнопці називає конкретне замовлення",
        /Надішліть номер накладної для замовлення <b>\$\{escapeHtml\(order\?\.order_number/.test(SRC),
        "у тексті має бути номер замовлення");

  check("для цього замовлення підвантажується з бази",
        SRC.includes("await findOrderById(orderId)"));

  check("підтвердження теж називає замовлення",
        /збережено для замовлення[\s\S]{0,120}order\.order_number/.test(SRC));

  check("у підтвердженні видно сам номер накладної",
        /escapeHtml\(check\.value\)/.test(SRC));
}

console.log("\n[11] Команда /ttn — не залежить від натиснутих кнопок");
{
  const p = M.parseTtnCommand;

  check("розбирає номер замовлення і накладну",
        JSON.stringify(p("/ttn 0708553442 20450912345678")) ===
        JSON.stringify({ orderNumber:"0708553442", tracking:"20450912345678" }));

  check("накладна з пробілами склеюється",
        p("/ttn 0708553442 2045 0912 345678").tracking === "20450912345678");

  check("накладна з дефісами теж",
        p("/ttn 0708553442 2045-0912-345678").tracking === "20450912345678");

  check("команда з @іменем бота працює (важливо для груп)",
        p("/ttn@bagvero_bot 0708553442 20450912345678")?.orderNumber === "0708553442");

  check("без аргументів — підказка формату", !!p("/ttn")?.error);
  check("з одним аргументом — теж підказка", !!p("/ttn 0708553442")?.error);
  check("звичайний текст не сприймається за команду", p("привіт") === null);
  check("схожий текст без слеша ігнорується", p("ttn 123 456") === null);

  check("обробник шукає замовлення за номером",
        SRC.includes("findOrderByNumber(command.orderNumber)"));
  check("неіснуючий номер — зрозуміла відповідь",
        SRC.includes("не знайдено. Перевірте номер"));
  check("команда обробляється незалежно від awaiting_ttn_for",
        SRC.indexOf("parseTtnCommand(message.text)") < SRC.indexOf("session?.awaiting_ttn_for"));
  check("підказка про команду є в /id", SRC.includes("/ttn 0708553442"));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

})();
