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

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

})();
