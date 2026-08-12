// Керування замовленнями з боку магазину: захист від сторонніх,
// список /orders, ТТН, відмова від товару.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const SRC = fs.readFileSync(path.join(ROOT,"supabase/functions/telegram-order-bot/_index.src.ts"),"utf8");
const ACC = fs.readFileSync(path.join(ROOT,"assets/js/account.js"),"utf8");

(async () => {

const M = await import(require("url").pathToFileURL(
  path.join(ROOT,"supabase/functions/telegram-order-bot/format.js")).href);

console.log("\n[1] КРИТИЧНО: керування доступне лише магазину");
{
  // Бот відкритий — написати може будь-хто, хто знає логін. Раніше
  // TELEGRAM_CHAT_ID використовувався тільки для НАДСИЛАННЯ, і
  // сторонній міг командою /ttn підставити накладну в чуже
  // замовлення та від імені магазину надіслати її клієнту.
  check("є перевірка власника", /function isOwner\(/.test(SRC));
  check("порівнює з TELEGRAM_CHAT_ID", /String\(chatId\) === String\(TELEGRAM_CHAT_ID\)/.test(SRC));
  check("без заданого чату нікому не довіряє",
        /if \(!TELEGRAM_CHAT_ID\) return false;/.test(SRC));

  check("команда /ttn закрита", /if \(command\) \{\s*\n\s*\n?\s*if \(!isOwner\(chatId\)\)/.test(SRC));
  check("введення ТТН закрите", /if \(!isOwner\(chatId\)\) return false;/.test(SRC));
  check("кнопки статусів закриті", /data\.startsWith\("st:"\) && !isOwner/.test(SRC));
  check("кнопка ТТН закрита", /startsWith\("ttn:"\)[\s\S]{0,200}!isOwner/.test(SRC));
  check("список /orders закритий", /\/orders[\s\S]{0,300}if \(!isOwner\(chatId\)\) return true;/.test(SRC));
  check("службова /id закрита", /startsWith\("\/id"\) && isOwner/.test(SRC));
}

console.log("\n[2] Список замовлень /orders");
{
  check("вибірка останніх замовлень", /order=created_at\.desc/.test(SRC));
  check("кнопка відкриття картки", /data\.startsWith\("open:"\)/.test(SRC));

  const orders = [
    { id:"a", order_number:"1000000001", status:"new", total:4359 },
    { id:"b", order_number:"1000000002", status:"shipped", total:8999, tracking_number:"20450912345678" },
    { id:"c", order_number:"1000000003", status:"new", total:1200, refusal_requested_at:"2026-08-12" },
  ];

  const lines = orders.map(M.orderListLine);
  check("замовлення без ТТН позначене", lines[0].includes("без ТТН"), lines[0]);
  check("замовлення з ТТН не позначене", !lines[1].includes("без ТТН"), lines[1]);
  check("відмова видна в списку", lines[2].includes("відмова"), lines[2]);
  check("сума показана", lines.every(l => /грн/.test(l)));

  const kb = M.orderListKeyboard(orders);
  check("по кнопці на замовлення", kb.inline_keyboard.length === 3);
  check("кнопка веде на конкретне замовлення",
        kb.inline_keyboard[0][0].callback_data === "open:a");
  check("порожній список — без клавіатури", M.orderListKeyboard([]) === undefined);

  const longest = kb.inline_keyboard.flat()
    .reduce((a,b) => Buffer.byteLength(b.callback_data) > Buffer.byteLength(a.callback_data) ? b : a);
  check(`callback_data в межах 64 байт (${Buffer.byteLength(longest.callback_data)})`,
        Buffer.byteLength(longest.callback_data) <= 64);
}

console.log("\n[3] Картка замовлення показує ТТН і відмову");
{
  const card = M.formatOrder({
    order_number:"1000000001", status:"shipped", items:[], total:4359,
    tracking_number:"20450912345678", refusal_requested_at:"2026-08-12",
  });
  check("ТТН видно", card.includes("20450912345678"));
  check("відмову видно", /Клієнт просив відмову/.test(card));

  const plain = M.formatOrder({ order_number:"x", status:"new", items:[], total:100 });
  check("без ТТН рядка немає", !plain.includes("ТТН"));
  check("без відмови рядка немає", !plain.includes("відмову"));
}

console.log("\n[4] Відмова: справжня заявка замість напису");
{
  check("фальшивий тост прибрано",
        !/showToast\("Запит на відмову від товару надіслано/.test(ACC));
  check("створюється запис у order_refusals", ACC.includes('from("order_refusals")'));
  check("прив'язується до користувача", /user_id: user\.id/.test(ACC));
  check("замовлення шукається за номером", /eq\("order_number", orderNumber\)/.test(ACC));
  check("захист від подвійного натискання", /dataset\.sending/.test(ACC));
  check("неавторизованому пояснюється", /Увійдіть в акаунт, щоб оформити відмову/.test(ACC));
  check("помилка не ховається від клієнта",
        /Не вдалося надіслати запит/.test(ACC));
  check("результат видно на кнопці, а не лише тостом",
        /button\.textContent = "✓ Відмову надіслано"/.test(ACC));

  check("бот сповіщає про відмову", /table === "order_refusals"/.test(SRC));
  check("сповіщення підписане секретом",
        /table === "order_refusals"[\s\S]{0,300}x-hook-secret/.test(SRC));
  check("у сповіщенні є телефон клієнта", /handleRefusal[\s\S]{0,900}tel:/.test(SRC));
}

console.log("\n[5] Кабінет: ТТН тепер справді видно");
{
  // Регресія: кабінет читав order.ttn, а бот пише tracking_number —
  // тому в клієнта завжди був прочерк, хоч накладна й збереглась.
  check("кабінет читає tracking_number", ACC.includes("order.tracking_number"));
  check("старе поле order.ttn більше не використовується", !/order\.ttn\b/.test(ACC));
  check("ТТН — посилання на відстеження", /novaposhta\.ua\/tracking/.test(ACC));
  check("номер екранований", /escapeHtml\(order\.tracking_number\)/.test(ACC));
  check("відмова видна клієнту", /order\.refusal_requested_at/.test(ACC));
}

console.log("\n[6] Міграція відмов");
{
  const sql = fs.readFileSync(path.join(ROOT,"supabase/migrations/005-order-refusals.sql"),"utf8");

  check("таблиця заявок створюється", /create table if not exists public\.order_refusals/i.test(sql));
  check("позначка на замовленні додається", /add column if not exists refusal_requested_at/i.test(sql));
  check("RLS увімкнено", /alter table public\.order_refusals enable row level security/i.test(sql));

  // найважливіше: клієнт НЕ отримує права правити саме замовлення
  check("клієнту не дано update на orders",
        !/on public\.orders\s+for update/i.test(sql));
  check("заявку можна створити лише на СВОЄ замовлення",
        /o\.user_id = auth\.uid\(\)/.test(sql));
  check("є тригер сповіщення", /trg_notify_telegram_refusal/.test(sql));
  check("тригер ставить дату відмови", /set refusal_requested_at = now\(\)/.test(sql));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

})();
