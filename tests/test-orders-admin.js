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

console.log("\n[7] Статус доставки в кабінеті — не прочерк");
{
  // Регресія: показувалось order.delivery_status, а цю колонку ніхто
  // не заповнює — тож у клієнта завжди стояв «—», навіть коли
  // замовлення вже відправлене й накладна є.
  check("прочерк за замовчуванням прибрано",
        !/delivery_status \|\| "—"/.test(ACC));
  check("є окремі формулювання про доставку",
        /function deliveryStatusLabel/.test(ACC));
  check("значення екрановане", /escapeHtml\(deliveryStatusLabel\(order\)\)/.test(ACC));

  const fn = new Function(
    ACC.match(/function deliveryStatusLabel[\s\S]*?\n\}/)[0] +
    "; return deliveryStatusLabel;"
  )();

  check("нове → очікує обробки", fn({ status:"new" }) === "Очікує обробки");
  check("в обробці → готується", fn({ status:"processing" }).includes("Готується"));
  check("відправлено → передано в доставку", fn({ status:"shipped" }).includes("доставку"));
  check("виконано → доставлено", fn({ status:"completed" }) === "Доставлено");
  check("скасовано → скасовано", fn({ status:"cancelled" }) === "Скасовано");

  check("невідомий статус не дає порожнечі", !!fn({ status:"хтозна" }));
  check("жоден стан не повертає прочерк",
        ["new","processing","shipped","completed","cancelled"]
          .every(st => fn({ status: st }) !== "—"));

  // якщо колонку колись почнуть заповнювати — вона має пріоритет
  check("заповнена колонка має перевагу",
        fn({ status:"shipped", delivery_status:"У відділенні" }) === "У відділенні");

  // формулювання мусять відрізнятись від статусу замовлення,
  // інакше рядок просто дублює бейдж угорі картки
  const orderLabels = new Function(
    ACC.match(/function orderStatusLabel[\s\S]*?\n\}/)[0] + "; return orderStatusLabel;"
  )();
  const different = ["new","processing"].filter(st => fn({status:st}) !== orderLabels(st));
  check("не дублює бейдж статусу замовлення", different.length === 2,
        `однакові формулювання у ${2 - different.length} станах`);
}

console.log("\n[N] Строк відмови — 14 днів від доставки");
{
    // Закон про захист прав споживачів: товар належної якості можна
    // повернути протягом 14 днів. Строк рахується від ОТРИМАННЯ, а не
    // від оформлення — замовлення могло тиждень чекати у відділенні,
    // і рахунок від оформлення забрав би півстроку.
    check("строк заданий одним числом", /const REFUSAL_DAYS = 14/.test(ACC));

    // Ознака доставки — з тієї самої функції, що показує статус
    // клієнту. Колонку delivery_status ніхто не заповнює: перевірка по
    // ній ніколи не спрацювала б, і строк не закінчувався б НІКОЛИ.
    check("ознака доставки — з deliveryStatusLabel",
        /const delivered = \/доставлен\/i\.test\(deliveryStatusLabel\(order\)\)/.test(ACC));

    // Строк минув — кажемо прямо, а не ховаємо кнопку. Схована кнопка
    // виглядає як поломка: покупець пам'ятає, що вона була.
    check("минулий строк пояснюється",
        /Строк відмови \(\$\{REFUSAL_DAYS\} днів\) минув/.test(ACC));
    check("останні дні показуються",
        /лишилось \$\{window\.daysLeft\} дн\./.test(ACC));

    const win = new Function(
        ACC.match(/function deliveryStatusLabel[\s\S]*?\n\}/)[0] + "\n"
        + ACC.match(/const REFUSAL_DAYS = 14;[\s\S]*?\n\}\n/)[0]
        + "; return refusalWindow;")();

    const ago = n => new Date(Date.now() - n * 86400000).toISOString();

    check("доставлено 5 днів тому — можна",
        win({ status: "completed", created_at: ago(5) }).allowed === true);
    check("доставлено 13 днів тому — ще можна",
        win({ status: "completed", created_at: ago(13) }).allowed === true);
    check("14-й день — уже не можна",
        win({ status: "completed", created_at: ago(14) }).allowed === false);
    check("30 днів — не можна",
        win({ status: "completed", created_at: ago(30) }).allowed === false);

    // Поки не доставлено, строк не починався.
    check("не доставлено — можна попри давність",
        win({ status: "shipped", created_at: ago(60) }).allowed === true);

    // Без дати не блокуємо: краще дати відмовитись зайвий раз, ніж
    // відмовити людині через відсутні дані.
    check("без дати — можна", win({ status: "completed" }).allowed === true);

    check("залишок після 12 днів — 2",
        win({ status: "completed", created_at: ago(12) }).daysLeft === 2);
}

console.log("\n[N2] Сповіщення про відмову не залежить від бази");
{
    // Сповіщення в Telegram надсилає тригер у Supabase. Якщо він не
    // розгорнутий чи зламався — заявка тихо лягає в таблицю, магазин
    // не дізнається, а покупець бачить «менеджер зв'яжеться» і чекає.
    //
    // Тому другий, незалежний канал: лист тим самим шляхом, що й
    // замовлення.
    check("є лист магазину", /async function notifyRefusal/.test(ACC));

    // Два шляхи: без фото — звичайним JSON, з фото — multipart, бо
    // FormSubmit приймає файли лише так.
    check("лист без фото — звичайним шляхом",
        /if \(!files\.length\)[\s\S]{0,200}sendViaFormSubmit\(payload\)/.test(ACC));
    check("лист із фото — multipart",
        /const form = new FormData\(\)/.test(ACC)
        && /formsubmit\.co\/ajax\/\$\{FORMSUBMIT_TARGET\}/.test(ACC));

    // Content-Type не ставимо вручну: браузер додає його разом із
    // межею multipart, а виставлений руками ламає розбір — файли не
    // доходять.
    check("Content-Type не виставляється вручну",
        !/"Content-Type": "multipart/.test(ACC));

    const sendAt = ACC.indexOf("notifyRefusal(order, orderNumber, choice)");
    const errAt = ACC.indexOf('console.error("Заявка на відмову:"');

    check("лист надсилається до перевірки помилки бази",
        sendAt > 0 && errAt > 0 && sendAt < errAt);

    check("при помилці бази клієнту не кажуть «не вдалося»",
        /Запит надіслано менеджеру/.test(ACC));

    ["Замовлення", "Дата замовлення", "Клієнт", "Телефон", "Пошта",
     "Доставка", "Статус доставки", "ТТН", "Оплата",
     "Причина відмови", "Товари, від яких відмова",
     "Сума до повернення", "Сума всього замовлення", "Фото додано"]
        .forEach(field =>
            check(`у листі є «${field}»`, new RegExp(`"${field}":`).test(ACC)));

    // ГОЛОВНЕ: дані мусять бути НЕ ПОРОЖНІ.
    //
    // Лист приходив із прочерками в кожному рядку, крім номера. Причина
    // не в шаблоні листа: запит до бази брав .select("id") — цього
    // досить, щоб створити заявку, але в об'єкті не було нічого
    // іншого. Менеджер отримував таблицю прочерків.
    //
    // Такий лист гірший за відсутність листа: створює відчуття, що все
    // працює.
    check("запит бере всі поля замовлення",
        /from\("orders"\)[\s\S]{0,400}\.select\("\*"\)[\s\S]{0,120}order_number/.test(ACC));
    check("старий select(\"id\") прибрано",
        !/\.select\("id"\)\s*\n\s*\.eq\("order_number"/.test(ACC));

    // ГОЛОВНЕ: у листі сума ЛИШЕ обраних товарів.
    //
    // Раніше йшов order.total: людина відмовлялась від однієї пари
    // кросівок, а магазин бачив повну суму на дві речі й не розумів,
    // скільки повертати.
    check("сума до повернення рахується з обраного",
        /const refundSum = chosen\.reduce/.test(ACC));
    check("повна сума замовлення теж показана, окремо",
        /"Сума всього замовлення": order\.total \? formatPrice/.test(ACC));

    // Причину вимагаємо у вікні: без неї магазин не знає, що робити з
    // товаром і чи можна продати його далі.
    const dialog = fs.readFileSync(
        path.join(ROOT, "assets/js/refusal-dialog.js"), "utf8");

    check("вікно відмови існує", /function askRefusal/.test(dialog));
    check("товар під кнопкою відмічений одразу",
        /index === preselectedIndex/.test(dialog));
    check("причина обовʼязкова", /reason\.length < 5/.test(dialog));
    check("порожній вибір не пропускається",
        /if \(!checked\.length\)/.test(dialog));

    // Ліміт перевіряємо ДО надсилання: інакше лист піде й тихо не
    // дійде, а людина побачить «надіслано».
    check("розмір фото перевіряється до надсилання",
        /totalBytes > MAX_TOTAL_BYTES/.test(dialog));
    check("ліміт із запасом під текст листа",
        /MAX_TOTAL_BYTES = 8 \* 1024 \* 1024/.test(dialog));

    // Спосіб оплати вирішує, що робити далі: карткою — повертати
    // гроші, на пошті — просто скасувати відправлення.
    check("спосіб оплати в листі", /"Оплата": order\.payment_method/.test(ACC));

    // ТТН і статус — з полів, які справді заповнюються.
    check("ТТН береться з tracking_number",
        /"ТТН": order\.tracking_number/.test(ACC));
    check("статус доставки — обчислений",
        /"Статус доставки": deliveryStatusLabel\(order\)/.test(ACC));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

})();
