// ⚠️ ЦЕЙ ФАЙЛ ЗГЕНЕРОВАНО АВТОМАТИЧНО — НЕ РЕДАГУЙТЕ ВРУЧНУ.
//
// Джерела:
//   supabase/functions/telegram-order-bot/format.js      (картка замовлення)
//   supabase/functions/telegram-order-bot/order-flow.js  (діалог оформлення)
//   supabase/functions/telegram-order-bot/admin-api.js   (панель замовлень в адмінці)
//   supabase/functions/telegram-order-bot/place-order.js (замовлення з сайту)
//   supabase/functions/telegram-order-bot/mail.js         (листи покупцеві)
//   supabase/functions/telegram-order-bot/nova-poshta.js  (довідник міст і відділень)
//   supabase/functions/telegram-order-bot/meta-capi.js    (серверні конверсії Meta)
//   supabase/functions/telegram-order-bot/order-lookup.js (перевірка замовлення гостем)
//   supabase/functions/telegram-order-bot/reviews.js      (відгуки й модерація)
//   supabase/functions/telegram-order-bot/subscribe.js    (підписка на листи)
//   supabase/functions/telegram-order-bot/_index.src.ts  (мережа й база)
//
// Перезібрати:  node scripts/build-edge-function.js
//
// Саме цей файл вставляють у панель Supabase — він
// самодостатній, нічого доливати не треба.

// ======================================
// Чиста логіка бота: форматування картки замовлення і побудова
// кнопок статусів. Без мережі й без бази — тільки дані на вході,
// текст на виході.
//
// Навмисно винесено в окремий файл і написано звичайним
// JavaScript (без анотацій типів): так цей код можна запускати й
// тестувати напряму в Node, не імітуючи середовище Deno і не
// вирізаючи типи регулярками. index.ts імпортує його як є.
// ======================================

// Статуси ЗАМОВЛЕННЯ.
//
// ⚠️ Ключі мусять точно збігатися з тими, які розуміє сайт —
// orderStatusLabel() в assets/js/account.js і класи .order-status-*
// у style.css. Спершу бот мав власні вигадані ключі (taken,
// confirmed): у Telegram усе виглядало правильно, але «Історія
// замовлень» у кабінеті таких значень не знала і показувала їх як
// «Нове» — статус наче не змінювався. Список тут — єдине джерело
// правди для обох сторін.
const STATUSES = {
  new:        { label: "Нове",      emoji: "🆕" },
  processing: { label: "В обробці", emoji: "👌" },
  shipped:    { label: "Відправлено", emoji: "📦" },
  completed:  { label: "Виконано",  emoji: "🎉" },
  cancelled:  { label: "Скасовано", emoji: "❌" },
};

// Значення, що лишились від першої версії бота. Щоб такі замовлення
// не виглядали зламаними в Telegram, показуємо їх як «В обробці», а
// кнопки повертають їх у нормальний ланцюжок.
const LEGACY_STATUSES = {
  taken: "processing",
  confirmed: "processing",
};

function normalizeStatus(status) {
  return LEGACY_STATUSES[status] ?? status;
}

// Дані замовлення приходять від клієнта (імʼя, місто, коментар),
// а повідомлення надсилається з parse_mode:"HTML" — без екранування
// хтось міг би підсунути розмітку у власне імʼя й зламати картку.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString("uk-UA")} грн` : "—";
}

// items приходить або масивом, або JSON-рядком — залежно від того, як
// драйвер віддав jsonb-колонку. Те саме стосується переліку в заявці
// на відмову, тож розбір спільний.
function parseItems(value) {

  try {
    const items = typeof value === "string" ? JSON.parse(value) : (value ?? []);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }

}

// Рядок складу: назва, варіант, кількість × ціна.
//
// stockShort проставляє база в мить створення замовлення: цієї одиниці
// на полиці вже не було — її щойно замовив хтось інший (див.
// supabase/migrations/011-stock-reservation.sql).
//
// Рядок навмисно різкий і стоїть одразу під товаром: це єдине місце,
// де власник дізнається про це вчасно — до того, як пообіцяє покупцю
// доставку за три дні.
function itemLine(item) {

  const details = [item.color, item.size].filter(Boolean).join(" / ");

  return [
    `• <b>${escapeHtml(item.title)}</b>`,
    item.brand ? ` (${escapeHtml(item.brand)})` : "",
    details ? `\n   ${escapeHtml(details)}` : "",
    `\n   ${item.qty ?? 1} × ${money(item.price)}`,
    item.stockShort ? "\n   ⚠️ <b>залишку не було</b> — під замовлення" : "",
  ].join("");

}

function formatOrder(order) {

  const status = STATUSES[normalizeStatus(order.status)] ?? STATUSES.new;

  const items = parseItems(order.items);

  const lines = items.map(itemLine).join("\n");

  const customer = [order.first_name, order.last_name].filter(Boolean).join(" ");

  const rows = [
    `${status.emoji} <b>Замовлення ${escapeHtml(order.order_number ?? order.id)}</b>`,
    `Статус: <b>${escapeHtml(status.label)}</b>`,
    "",
    lines || "<i>склад замовлення порожній</i>",
    "",
    `Сума товарів: ${money(order.subtotal)}`,
    Number(order.discount) > 0 ? `Знижка: −${money(order.discount)}` : "",
    Number(order.delivery_price) > 0 ? `Доставка: ${money(order.delivery_price)}` : "",
    `<b>Разом: ${money(order.total)}</b>`,
    // Суму рахує браузер, а перевіряє база — своїми цінами
    // (supabase/migrations/014-order-pricing.sql). Розбіжність означає
    // або підроблене замовлення, або ціну, що змінилась між
    // відкриттям сторінки й натисканням кнопки. Обидва випадки варті
    // погляду ДО того, як товар поїде.
    order.price_check === "mismatch"
      ? `⚠️ <b>сума не збігається</b> — за цінами бази ${money(order.total_expected)}`
      : "",
    "",
    customer ? `👤 ${escapeHtml(customer)}` : "",
    order.phone ? `📞 <a href="tel:${escapeHtml(order.phone)}">${escapeHtml(order.phone)}</a>` : "",
    order.email ? `✉️ ${escapeHtml(order.email)}` : "",
    order.delivery_method ? `🚚 ${escapeHtml(order.delivery_method)}` : "",
    order.delivery_city ? `📍 ${escapeHtml(order.delivery_city)}` : "",
    order.delivery_detail ? `   ${escapeHtml(order.delivery_detail)}` : "",
    order.payment_method ? `💳 ${escapeHtml(order.payment_method)}` : "",
    order.promo_code ? `🎟 Промокод: ${escapeHtml(order.promo_code)}` : "",
    order.user_id ? "" : "👥 <i>Гість (без реєстрації)</i>",
    order.refusal_requested_at ? "❗️ <b>Клієнт просив відмову</b>" : "",
    order.tracking_number ? `📦 ТТН: <code>${escapeHtml(order.tracking_number)}</code>` : "",
  ];

  return rows.filter((r) => r !== "").join("\n");

}

// Повідомлення про заявку на відмову.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Тут стояли лише номер замовлення, сума й телефон. Менеджер бачив
// «клієнт просить відмову» — і не знав, ЩО саме забирати. У замовленні
// з двох сумок доводилось відкривати пошту, шукати лист і звіряти.
//
// Перелік у заявці був увесь цей час: тригер шле record.items, база їх
// зберігає. Просто повідомлення їх не читало.
//
// ЩО ТУТ Є І ЧОМУ САМЕ ЦЕ
// ------------------------
// Менеджеру треба вирішити одне: приймати повернення чи ні, — і для
// цього знати, що повертають, скільки віддавати грошей і чи їде решта
// замовлення далі. Звідси перелік, сума до повернення й рядок «N з M
// позицій»: часткова відмова й повна — це дві різні дії на складі.
//
// ТТН тут же, бо від нього залежить розмова: посилка ще в дорозі — її
// можна завернути, вже отримана — це повернення з оглядом товару.
function formatRefusal(record, order) {

  const refused = parseItems(record && record.items);
  const all = parseItems(order && order.items);

  const refund = refused.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1),
    0,
  );

  // Заявки, створені до появи переліку (і ті, що лягли без нього, коли
  // база ще не знала колонки items), означали відмову від усього
  // замовлення. Так їх і показуємо — але чесно кажемо, що складу немає.
  const noList = refused.length === 0;

  const whole = !noList && all.length > 0 && refused.length >= all.length;

  const scope = noList
    ? `Перелік не вказано — заявка на все замовлення${order && order.total ? ` на ${money(order.total)}` : ""}`
    : whole
      ? `Відмова від усього замовлення · до повернення <b>${money(refund)}</b>`
      : `Відмова від ${refused.length} з ${all.length} позицій · до повернення <b>${money(refund)}</b>`;

  const rows = [
    "❗️ <b>Клієнт просить відмову</b>",
    "",
    `Замовлення: <b>${escapeHtml((order && order.order_number) || "")}</b>`,
    scope,
    !noList && !whole && order && order.total
      ? `Сума всього замовлення: ${money(order.total)}`
      : null,
    noList ? null : "",
    noList ? null : refused.map(itemLine).join("\n"),
    "",
    record && record.note
      ? `Причина: ${escapeHtml(record.note)}`
      : "Причину не вказано",
    "",
    order && order.phone
      ? `📞 <a href="tel:${escapeHtml(order.phone)}">${escapeHtml(order.phone)}</a>`
      : null,
    order && order.tracking_number
      ? `📦 ТТН: <code>${escapeHtml(order.tracking_number)}</code>`
      : null,
    "",
    "Зателефонуйте клієнту й вирішіть, чи приймати повернення.",
  ];

  // Відсіюємо тільки null: порожній рядок тут — це навмисний відступ
  // між блоками, і саме він робить повідомлення читабельним.
  return rows.filter((row) => row !== null).join("\n");

}

// У які статуси має сенс переходити з поточного.
//
// ЄДИНЕ ДЖЕРЕЛО ПРАВДИ для обох способів керування: кнопки в Telegram
// (buildKeyboard нижче) і панель «Замовлення» в адмінці (admin-api.js)
// беруть ланцюжок звідси. Якби кожна сторона мала свій список, одна з
// них рано чи пізно дозволила б перехід, якого інша не знає, — і
// статус залежав би від того, звідки його змінили.
function allowedTransitions(current) {

  const status = normalizeStatus(current);

  // Ланцюжок повторює той, що вже закладений у сайті:
  // Нове → В обробці → Відправлено → Виконано, і скасувати можна
  // на будь-якому кроці до відправлення.
  const next =
    status === "new"        ? ["processing", "cancelled"] :
    status === "processing" ? ["shipped", "cancelled"] :
    status === "shipped"    ? ["completed", "cancelled"] :
    [];

  // Відкидаємо статуси, яких немає в STATUSES. Раніше неузгодженість
  // ланцюжка зі списком статусів валила функцію з TypeError уже під
  // час формування кнопок — тобто через друкарську помилку в одному
  // рядку бот перестав би відповідати взагалі. Тепер у гіршому разі
  // зникне одна кнопка, а решта працює.
  return next.filter((key) => STATUSES[key]);

}

// Показуємо лише ті статуси, у які має сенс переходити з поточного —
// щоб не тицьнути «Відправлено» на скасованому замовленні.
function buildKeyboard(orderId, current, options = {}) {

  const status = normalizeStatus(current);

  const valid = allowedTransitions(status);

  const rows = [];

  if (valid.length) {

    rows.push(valid.map((key) => ({
      text: `${STATUSES[key].emoji} ${STATUSES[key].label}`,
      callback_data: `st:${key}:${orderId}`,
    })));

  }

  // Окрема кнопка для накладної.
  //
  // Потрібна саме тому, що після «Відправлено» цієї кнопки в списку
  // вже немає (наступні статуси — «Виконано» і «Скасовано»), і якщо
  // ТТН пропустили через /skip, додати його не було б чим.
  if (status === "shipped" && !options.hasTracking) {

    rows.push([{ text: "📦 Додати ТТН", callback_data: `ttn:${orderId}` }]);

  }

  return rows.length ? { inline_keyboard: rows } : undefined;

}

// ======================================
// Глибокі посилання з Instagram на конкретний товар
//
// Посилання виду t.me/ваш_бот?start=product_15 Telegram передає боту
// як звичайне повідомлення "/start product_15". Розбираємо його й
// показуємо саме цей товар.
// ======================================

// Що саме відкрити. Приймаємо кілька написань, бо посилання
// вставляють руками в шапку профілю та сторіс, і зайва вимогливість
// до формату означала б «мертві» посилання:
//   product_15 · product-15 · p15 · 15
function parseStartPayload(text) {

  const raw = String(text ?? "").trim();

  if (!raw.startsWith("/start")) return null;

  // "/start product_15" → "product_15"; "/start@MyBot product_15" теж
  const payload = raw.replace(/^\/start(@\S+)?/, "").trim();

  if (!payload) return { type: "welcome" };

  const match = payload.match(/^(?:product[_-]?|p)?(\d+)$/i);

  if (match) return { type: "product", id: Number(match[1]) };

  return { type: "unknown", payload };

}

// Фото товару може бути і зовнішнім посиланням, і шляхом на сайті
// (/assets/...). Telegram потрібен абсолютний URL.
function absoluteImageUrl(src, siteUrl) {

  const value = String(src ?? "").trim();

  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  return `${String(siteUrl).replace(/\/$/, "")}/${value.replace(/^\//, "")}`;

}

// Підпис під фото товару. Ліміт Telegram на caption — 1024 символи,
// тож опис підрізаємо: інакше повідомлення не надішлеться взагалі.
function formatProductCard(product, siteUrl) {

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const first = variants[0] ?? {};

  const colors = variants.map((v) => v.color).filter(Boolean);

  const sizes = (first.sizes && first.sizes.length)
    ? first.sizes
    : (Array.isArray(product.sizes) ? product.sizes : []);

  const discount = (product.oldPrice && product.price && Number(product.oldPrice) > Number(product.price))
    ? Math.round((1 - Number(product.price) / Number(product.oldPrice)) * 100)
    : 0;

  const priceLine = discount > 0
    ? `<b>${money(product.price)}</b>  <s>${money(product.oldPrice)}</s>  −${discount}%`
    : `<b>${money(product.price)}</b>`;

  const description = String(product.description ?? "").trim();
  const shortDescription = description.length > 320
    ? description.slice(0, 317).trimEnd() + "…"
    : description;

  const rows = [
    product.brand ? escapeHtml(String(product.brand).toUpperCase()) : "",
    `<b>${escapeHtml(product.title)}</b>`,
    "",
    priceLine,
    "",
    colors.length ? `Кольори: ${escapeHtml(colors.join(", "))}` : "",
    sizes.length ? `Розміри: ${escapeHtml(sizes.join(", "))}` : "",
    product.preOrder ? "📦 Під замовлення" : "",
    "",
    shortDescription ? escapeHtml(shortDescription) : "",
  ];

  return rows.filter((r) => r !== "").join("\n");

}

function buildProductKeyboard(product, siteUrl) {

  const base = String(siteUrl).replace(/\/$/, "");
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const color = variants[0]?.color;

  // переносимо колір у посилання — так само, як це робить каталог,
  // щоб сторінка відкрилась саме на тому кольорі, що на фото
  const query = new URLSearchParams({ id: String(product.id) });

  if (color) query.set("color", color);

  return {
    inline_keyboard: [
      [{ text: "🛒 Замовити на сайті", url: `${base}/product?${query.toString()}` }],
      [{ text: "📚 Весь каталог", url: `${base}/catalog` }],
    ],
  };

}

// ======================================
// Сповіщення КЛІЄНТУ про зміну статусу
//
// Надсилаються лише тим, хто замовляв у боті — у таких замовлень
// збережений telegram_chat_id. Замовлення з сайту цього поля не
// мають, і для них сповіщення просто не надсилаються.
// ======================================

// Посилання на відстеження Нової пошти. Клієнту зручніше натиснути
// кнопку, ніж копіювати номер і шукати сайт.
function trackingUrl(ttn) {

  const digits = String(ttn ?? "").replace(/\D/g, "");

  if (!digits) return "";

  return `https://novaposhta.ua/tracking/?cargo_number=${digits}`;

}

// ТТН Нової пошти — 14 цифр. Перевіряємо, щоб не надіслати клієнту
// випадковий текст замість номера.
//
// Разом із текстом помилки повертаємо reason — коротку причину
// відмови. Тексти тут написані для чату з ботом («надішліть»,
// «/skip»), а той самий номер тепер вводять і в панелі адмінки, де
// про /skip не знають. Правило перевірки при цьому мусить лишатись
// одне: два окремі списки «скільки цифр у ТТН» неминуче розійшлися б.
function validateTracking(text) {

  const raw = String(text ?? "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) return { ok: false, reason: "empty", error: "Це не схоже на номер накладної. Надішліть 14 цифр або /skip." };
  if (digits.length < 10) return { ok: false, reason: "short", error: `Замало цифр (${digits.length}). ТТН Нової пошти — 14 цифр. Або /skip.` };
  if (digits.length > 20) return { ok: false, reason: "long", error: "Забагато цифр для номера накладної. Або /skip." };

  return { ok: true, value: digits };

}

// Текст для клієнта під конкретний статус. Повертає null, якщо про
// цей статус клієнта повідомляти не треба (напр. «Нове» — він щойно
// сам оформив замовлення й уже отримав підтвердження).
function customerStatusMessage(order, status) {

  const number = escapeHtml(order?.order_number ?? "");
  const ttn = order?.tracking_number;

  switch (normalizeStatus(status)) {

    case "processing":
      return `👌 Ваше замовлення <b>${number}</b> прийнято в роботу.\n\n` +
             `Ми зв'яжемось із вами найближчим часом, щоб підтвердити деталі.`;

    case "shipped":
      return ttn
        ? `📦 Замовлення <b>${number}</b> відправлено!\n\n` +
          `Номер накладної: <code>${escapeHtml(ttn)}</code>`
        : `📦 Замовлення <b>${number}</b> відправлено!\n\n` +
          `Номер накладної надішлемо окремо.`;

    case "completed":
      return `🎉 Замовлення <b>${number}</b> виконано.\n\n` +
             `Дякуємо за покупку! Будемо раді бачити вас знову.`;

    case "cancelled":
      return `❌ Замовлення <b>${number}</b> скасовано.\n\n` +
             `Якщо це помилка — напишіть нам, ми все виправимо.`;

    default:
      return null;

  }

}

// Кнопка відстеження — лише коли є ТТН
function customerStatusKeyboard(order, status) {

  if (normalizeStatus(status) !== "shipped") return undefined;

  const url = trackingUrl(order?.tracking_number);

  if (!url) return undefined;

  return { inline_keyboard: [[{ text: "🔍 Відстежити посилку", url }]] };

}

// Явна команда для накладної: /ttn <номер замовлення> <ТТН>
//
// Потрібна, коли замовлень кілька: кнопка «Додати ТТН» прив'язується
// до останнього натискання, і якщо натиснути під двома замовленнями
// поспіль, легко переплутати, якому саме належить наступна відповідь.
// Команда не залежить від стану — у ній прямо вказано, куди писати.
function parseTtnCommand(text) {

  const raw = String(text ?? "").trim();

  if (!/^\/ttn(@\S+)?\b/i.test(raw)) return null;

  const rest = raw.replace(/^\/ttn(@\S+)?/i, "").trim();

  // очікуємо два числа: номер замовлення (10 цифр) і ТТН
  const parts = rest.split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    return { error: "Формат: /ttn <номер замовлення> <номер накладної>\nНаприклад: /ttn 0708553442 20450912345678" };
  }

  const orderNumber = parts[0].replace(/\D/g, "");
  const tracking = parts.slice(1).join("").replace(/\D/g, "");

  if (!orderNumber) return { error: "Не розпізнав номер замовлення." };
  if (!tracking) return { error: "Не розпізнав номер накладної." };

  return { orderNumber, tracking };

}


// ======================================
// Список замовлень для власника (/orders)
// ======================================

// Короткий рядок замовлення для списку: номер, сума, статус, позначки.
function orderListLine(order) {

  const status = STATUSES[normalizeStatus(order.status)] ?? STATUSES.new;

  const marks = [
    order.tracking_number ? "" : "без ТТН",
    order.refusal_requested_at ? "❗відмова" : "",
  ].filter(Boolean).join(", ");

  return `${status.emoji} <b>${escapeHtml(order.order_number ?? "")}</b> — ` +
         `${money(order.total)}${marks ? ` · <i>${escapeHtml(marks)}</i>` : ""}`;

}

// Кнопки списку: по одній на замовлення, щоб відкрити картку.
function orderListKeyboard(orders) {

  const rows = (orders || []).map((order) => ([{
    text: `${(STATUSES[normalizeStatus(order.status)] ?? STATUSES.new).emoji} ` +
          `${order.order_number ?? ""} · ${money(order.total)}` +
          (order.tracking_number ? "" : " · без ТТН"),
    callback_data: `open:${order.id}`,
  }]));

  if (!rows.length) return undefined;

  return { inline_keyboard: rows };

}


// ======================================
// Логіка оформлення замовлення в боті.
//
// Тут немає ні мережі, ні бази — тільки «поточна чернетка + що
// натиснули» → «наступний крок, текст, кнопки». Завдяки цьому весь
// сценарій можна проганяти тестами в Node, без Telegram і Supabase.
//
// Кроки: color → size → qty → delivery → city → detail → phone → confirm
// Кольори й розміри пропускаються автоматично, якщо вибору немає
// (один колір / один розмір) — щоб не змушувати тиснути кнопку там,
// де альтернатив немає.
// ======================================


// Способи доставки — ті самі назви й ціни, що в checkout.html.
// ⚠️ Мусять збігатися з сайтом: назва їде в orders.delivery_method,
// і якщо тексти розійдуться, у вашій Telegram-картці й в «Історії
// замовлень» будуть різні формулювання для того самого способу.
// price: 0 у всіх — і це не заготовка «допишемо потім».
//
// Магазин за доставку не бере: покупець платить перевізнику при
// отриманні, за його тарифом. Поле лишається, бо його читає
// buildOrderRow (delivery_price у замовленні), і нуль там означає рівно
// те, що є.
//
// ЧОМУ ЦЕ ВАЖЛИВО САМЕ ТУТ. Сайт перестав додавати доставку в суму — і
// якби бот далі додавав, та сама сумка коштувала б у Telegram на 60 грн
// більше. Дві ціни на один товар — найгірше, що можна показати
// покупцеві, який дивиться і сайт, і бот.
const DELIVERY_OPTIONS = [
  { id: "np_office",  label: "На відділення «Нова пошта»", price: 0, needsDetail: "Номер відділення" },
  { id: "np_box",     label: "Поштомат «Нова пошта»",      price: 0, needsDetail: "Номер поштомата" },
  { id: "np_courier", label: "Кур'єром «Нова пошта»",      price: 0, needsDetail: "Вулиця, будинок, квартира" },

  // Інший перевізник — четвертим, як і на сайті.
  //
  // НАВІЩО. Сторінка «Оплата і доставка» обіцяє й Укрпошту, на сайті
  // цей спосіб з'явився, а в боті лишались три кнопки — усі «Нова
  // пошта». Тобто те саме замовлення через бот оформити було
  // неможливо, і людину доводилось вести на сайт.
  //
  // Довідника Укрпошти чи Meest у нас немає (пошук по точках працює
  // лише для НП), тому перевізника й адресу покупець пише сам одним
  // рядком — так само, як у полі на checkout.html. Крок «місто»
  // лишається: Укрпошті воно теж потрібне.
  //
  // button — текст ЛИШЕ на кнопці. label їде в orders.delivery_method
  // і мусить збігатися з сайтом до символу, а на кнопці «Інша пошта»
  // саме по собі нічого не пояснює: на сайті поруч написано, які це
  // перевізники, і в боті це видно теж.
  {
    id: "other",
    label: "Інша пошта",
    button: "Інша пошта (Укрпошта, Meest)",
    price: 0,
    needsDetail: "Перевізник, відділення або адреса",
  },
];

const MAX_QTY = 10;

function deliveryById(id) {
  return DELIVERY_OPTIONS.find((o) => o.id === id) ?? null;
}

// За назвою, яка вже лежить у чернетці (delivery_method).
// Навмисно НЕ зберігаємо окремо delivery_id: зайве поле в чернетці
// означало б ще одну колонку в таблиці, яку легко забути додати —
// саме на цьому діалог і зупинявся.
function deliveryByLabel(label) {
  return DELIVERY_OPTIONS.find((o) => o.label === label) ?? null;
}

// -------------------------
// Доступні варіанти товару
// -------------------------

function colorsOf(product) {
  return (product?.variants ?? []).map((v) => v.color).filter(Boolean);
}

function sizesOf(product, color) {

  const variants = product?.variants ?? [];
  const variant = color ? variants.find((v) => v.color === color) : variants[0];

  // розміри кольору мають пріоритет над загальними — так само,
  // як це працює на сайті
  if (variant?.sizes?.length) return variant.sizes;

  return Array.isArray(product?.sizes) ? product.sizes : [];

}

// -------------------------
// Суми
//
// Рахуємо так само, як checkout.js: сума товарів мінус знижка плюс
// доставка. Знижка в боті береться зі старої ціни товару (промокодів
// у боті поки немає — їх вводять на сайті).
// -------------------------

function computeTotals(product, qty, deliveryPrice) {

  const price = Number(product?.price) || 0;
  const oldPrice = Number(product?.oldPrice) || 0;
  const count = Math.max(1, Number(qty) || 1);

  const subtotal = (oldPrice > price ? oldPrice : price) * count;
  const discount = oldPrice > price ? (oldPrice - price) * count : 0;
  const delivery = Number(deliveryPrice) || 0;

  return {
    subtotal,
    discount,
    delivery,
    total: subtotal - discount + delivery,
  };

}

// -------------------------
// Наступний крок
//
// Пропускаємо вибір там, де альтернативи немає.
// -------------------------

function nextStep(step, product, session) {

  const order = ["color", "size", "qty", "delivery", "city", "detail", "phone", "confirm"];

  let index = order.indexOf(step);

  if (index === -1) index = -1;

  for (let i = index + 1; i < order.length; i++) {

    const candidate = order[i];

    if (candidate === "color" && colorsOf(product).length <= 1) continue;
    if (candidate === "size" && sizesOf(product, session?.color).length <= 1) continue;

    return candidate;

  }

  return "confirm";

}

// Значення, які проставляються самі, коли вибору немає
function autoFill(product, session) {

  const result = { ...session };

  const colors = colorsOf(product);

  if (!result.color && colors.length === 1) result.color = colors[0];

  const sizes = sizesOf(product, result.color);

  if (!result.size && sizes.length === 1) result.size = sizes[0];

  return result;

}

// -------------------------
// Клавіатури
// -------------------------

function rows(items, perRow) {

  const out = [];

  for (let i = 0; i < items.length; i += perRow) {
    out.push(items.slice(i, i + perRow));
  }

  return out;

}

const CANCEL_ROW = [{ text: "✖️ Скасувати", callback_data: "o:cancel" }];

function colorKeyboard(product) {

  const buttons = colorsOf(product).map((color, i) => ({
    text: color,
    // у callback_data кладемо ІНДЕКС, а не назву: ліміт Telegram —
    // 64 байти, а українська назва в UTF-8 з'їдає їх швидко
    callback_data: `o:color:${i}`,
  }));

  return { inline_keyboard: [...rows(buttons, 2), CANCEL_ROW] };

}

function sizeKeyboard(product, color) {

  const buttons = sizesOf(product, color).map((size, i) => ({
    text: size,
    callback_data: `o:size:${i}`,
  }));

  return { inline_keyboard: [...rows(buttons, 4), CANCEL_ROW] };

}

function qtyKeyboard() {

  const buttons = [];

  for (let n = 1; n <= 5; n++) {
    buttons.push({ text: String(n), callback_data: `o:qty:${n}` });
  }

  return { inline_keyboard: [buttons, CANCEL_ROW] };

}

function deliveryKeyboard() {

  const buttons = DELIVERY_OPTIONS.map((option) => ([{
    text: `${option.button ?? option.label} — оплата при отриманні`,
    callback_data: `o:dlv:${option.id}`,
  }]));

  return { inline_keyboard: [...buttons, CANCEL_ROW] };

}

// Телефон просимо кнопкою «поділитися контактом»: клієнт не набирає
// номер руками, а Telegram віддає його з профілю разом з ім'ям.
// Це звичайна (не inline) клавіатура — інакше request_contact
// не працює.
function phoneKeyboard() {

  return {
    keyboard: [
      [{ text: "📱 Поділитися номером", request_contact: true }],
      [{ text: "✖️ Скасувати" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };

}

function confirmKeyboard() {

  return {
    inline_keyboard: [
      [{ text: "✅ Підтвердити замовлення", callback_data: "o:submit" }],
      [{ text: "✖️ Скасувати", callback_data: "o:cancel" }],
    ],
  };

}

// -------------------------
// Текст питання на кожному кроці
// -------------------------

function stepPrompt(step, product, session) {

  const delivery = deliveryByLabel(session?.delivery_method);

  switch (step) {

    case "color":
      return "Оберіть колір:";

    case "size":
      return session?.color
        ? `Колір: <b>${escapeHtml(session.color)}</b>\n\nОберіть розмір:`
        : "Оберіть розмір:";

    case "qty":
      return "Скільки одиниць?";

    case "delivery":
      return "Спосіб доставки:";

    case "city":
      return "У яке місто доставити? Напишіть назву міста.";

    case "detail":
      return delivery
        ? `${escapeHtml(delivery.needsDetail)} — напишіть у відповідь.`
        : "Уточніть адресу доставки.";

    case "phone":
      return "Залишилось лише номер телефону — натисніть кнопку нижче.";

    default:
      return "";

  }

}

// -------------------------
// Підсумок перед підтвердженням
// -------------------------

function summaryText(product, session) {

  const totals = computeTotals(product, session.qty, session.delivery_price);

  const rowsOut = [
    "<b>Перевірте замовлення</b>",
    "",
    `${escapeHtml(product.brand ?? "")} ${escapeHtml(product.title ?? "")}`.trim(),
    session.color ? `Колір: ${escapeHtml(session.color)}` : "",
    session.size ? `Розмір: ${escapeHtml(session.size)}` : "",
    `Кількість: ${session.qty}`,
    "",
    session.delivery_method ? `🚚 ${escapeHtml(session.delivery_method)}` : "",
    session.city ? `📍 ${escapeHtml(session.city)}` : "",
    session.delivery_detail ? `   ${escapeHtml(session.delivery_detail)}` : "",
    session.phone ? `📞 ${escapeHtml(session.phone)}` : "",
    "",
    `Сума товарів: ${money(totals.subtotal)}`,
    totals.discount > 0 ? `Знижка: −${money(totals.discount)}` : "",
    // Нуля не показуємо: рядок «Доставка: 0 грн» читається як
    // «безкоштовно», а насправді її оплачують перевізнику.
    totals.delivery > 0
      ? `Доставка: ${money(totals.delivery)}`
      : "Доставка: за тарифом перевізника",
    `<b>Разом: ${money(totals.total)}</b>`,
  ];

  return rowsOut.filter((r) => r !== "").join("\n");

}

// -------------------------
// Валідація введеного тексту
// -------------------------

function validateCity(text) {

  const value = String(text ?? "").trim();

  if (value.length < 2) return { ok: false, error: "Назва міста надто коротка — напишіть повністю." };
  if (value.length > 80) return { ok: false, error: "Назва міста надто довга." };

  return { ok: true, value };

}

function validateDetail(text) {

  const value = String(text ?? "").trim();

  if (value.length < 1) return { ok: false, error: "Напишіть, будь ласка, деталі доставки." };
  if (value.length > 200) return { ok: false, error: "Надто довго — вкажіть коротше." };

  return { ok: true, value };

}

// Номер може прийти і кнопкою (contact), і текстом — приймаємо обидва,
// але перевіряємо, що це справді схоже на телефон.
function validatePhone(text) {

  const digits = String(text ?? "").replace(/[^\d+]/g, "");
  const onlyDigits = digits.replace(/\D/g, "");

  if (onlyDigits.length < 10) return { ok: false, error: "Схоже, номер неповний. Напишіть у форматі +380XXXXXXXXX." };
  if (onlyDigits.length > 15) return { ok: false, error: "Надто багато цифр для номера телефону." };

  return { ok: true, value: digits.startsWith("+") ? digits : `+${onlyDigits}` };

}

// -------------------------
// Номер замовлення
//
// Той самий формат, що generateOrderId() у checkout.js — щоб
// замовлення з бота й з сайту не відрізнялись на вигляд.
// -------------------------

function generateOrderNumber(now = Date.now(), random = Math.random) {

  // Точно та сама формула, що generateOrderId() у checkout.js:
  // останні 7 цифр мітки часу + 3 випадкові. Формат навмисно
  // суто цифровий — такий номер легко продиктувати телефоном,
  // і замовлення з бота не відрізняється на вигляд від сайтового.
  const timePart = String(now).slice(-7);
  const randomPart = Math.floor(100 + random() * 900);

  return `${timePart}${randomPart}`;

}

// -------------------------
// Готовий рядок для таблиці orders
//
// Формуємо РІВНО ті самі поля, що пише сайт (assets/js/checkout.js),
// щоб і сповіщення в Telegram, і «Історія замовлень» працювали з
// замовленнями з бота без жодних змін.
// -------------------------

function buildOrderRow(product, session, orderNumber) {

  const totals = computeTotals(product, session.qty, session.delivery_price);

  return {
    user_id: null,                 // замовлення з бота — завжди гість
    // Куди писати клієнту про зміну статусу. Саме завдяки цьому полю
    // сповіщення працюють без окремої «прив'язки Telegram»: людина
    // замовила в боті — отже, чат уже відомий.
    telegram_chat_id: session.chat_id ?? null,
    order_number: orderNumber,
    status: "new",
    items: [{
      id: product.id,
      title: product.title,
      brand: product.brand ?? null,
      price: Number(product.price) || 0,
      oldPrice: Number(product.oldPrice) || null,
      qty: Math.max(1, Number(session.qty) || 1),
      color: session.color ?? null,
      size: session.size ?? null,
    }],
    subtotal: totals.subtotal,
    discount: totals.discount,
    delivery_price: totals.delivery,
    total: totals.total,
    delivery_method: session.delivery_method ?? null,
    delivery_city: session.city ?? null,
    delivery_detail: session.delivery_detail ?? null,
    payment_method: "Оплата при отриманні",
    promo_code: null,
    first_name: session.first_name ?? null,
    last_name: session.last_name ?? null,
    phone: session.phone ?? null,
    email: null,
  };

}


// ======================================
// Панель «Замовлення» в адмінці — чиста логіка.
//
// НАВІЩО ЦЕ ВЗАГАЛІ
// ------------------
// Замовленнями можна було керувати лише з Telegram: статуси —
// кнопками під карткою, ТТН — відповіддю боту. Це працює, поки
// замовлення одне-два на день і поки телефон під рукою. Далі
// починаються незручності, яких кнопками не вирішити:
//
//   • знайти замовлення тижневої давнини = гортати чат;
//   • подивитись усі «Нові» = /orders показує останні десять;
//   • працювати з компʼютера = чат на телефоні;
//   • передати роботу колезі = дати доступ до свого чату з ботом.
//
// Тому в адмінці зʼявилась своя сторінка. Бот НЕ прибирається:
// сповіщення про нове замовлення так і приходять у Telegram, кнопки
// так і працюють. Це другий спосіб, а не заміна.
//
// ЧОМУ ЦЕ НЕ РОБИТЬ САМА АДМІНКА
// -------------------------------
// Замовлення лежать у Supabase під RLS: клієнт бачить лише свої, а
// гостьових (user_id is null) з браузера не видно взагалі — і так має
// бути, інакше публічний ключ сайту відкривав би чужі телефони й
// адреси. Прочитати всі замовлення може лише серверний код із
// service-ключем, а такий тут один — ця Edge Function.
//
// ЩО В ЦЬОМУ ФАЙЛІ
// -----------------
// Тільки чиста логіка: розбір і перевірка запиту, побудова запиту до
// PostgREST, проєкція рядка бази у те, що бачить браузер. Без мережі
// й без бази — щоб усе це ганяли тести в Node, як і решту логіки
// бота (format.js, order-flow.js).
// ======================================


// -------------------------
// Звідки можна звертатись
//
// Адмінка живе на домені сайту, функція — на supabase.co, тобто це
// завжди міждоменний запит. Браузер спершу питає дозволу (preflight),
// і без цього переліку панель не отримає ані байта.
//
// Перелік — не заміна перевірці доступу (її обходить будь-який curl),
// а гігієна: сторонній сторінці в браузері власника нема чого
// звертатись до цього API.
// -------------------------

const ADMIN_ORIGINS = [
    "https://bestbrnd4u.com",
    "https://www.bestbrnd4u.com",
    "https://dev.bestbrnd4u.com",
    "https://bestbrnd4u.github.io",
];

function isAllowedOrigin(origin) {

    const value = String(origin ?? "").trim();

    if (!value) return false;

    if (ADMIN_ORIGINS.includes(value)) return true;

    // Локальний перегляд адмінки (python -m http.server тощо).
    // Тільки http і тільки петля — жодних сторонніх адрес.
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(value);

}

// Заголовок, яким браузер надсилає доказ доступу. НЕ Authorization:
// його на шляху до функції розбирає сам Supabase (шукає там свій JWT),
// а тут їде токен GitHub — інша річ.
const ADMIN_TOKEN_HEADER = "x-admin-token";

function corsHeaders(origin) {

    const headers = {
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        // Authorization — для замовлення з сайту: клієнт Supabase
        // кладе туди токен покупця (або публічний ключ у гостя).
        // apikey — той самий клієнт додає його поруч.
        "Access-Control-Allow-Headers": `Content-Type, Authorization, apikey, x-client-info, ${ADMIN_TOKEN_HEADER}`,
        "Access-Control-Max-Age": "600",
    };

    // Дозволяємо конкретний домен, а не «*»: із зіркою браузер не
    // пропустив би власний заголовок з токеном.
    if (isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;

    return headers;

}

// -------------------------
// Дії
// -------------------------

const ADMIN_ACTIONS = ["list", "get", "status", "tracking"];

const LIST_LIMIT_DEFAULT = 25;
const LIST_LIMIT_MAX = 100;

// Порядок вкладок у панелі. Тримається тут, а не в браузері, щоб
// новий статус не довелося додавати у двох місцях.
const STATUS_ORDER = ["new", "processing", "shipped", "completed", "cancelled"];

// Куди дозволено переходити з панелі.
//
// Основний ланцюжок — спільний із ботом (allowedTransitions), тож
// «Відправлено» на скасованому замовленні не натиснути ні там, ні тут.
//
// РІЗНИЦЯ ОДНА, І ВОНА НАВМИСНА: із «Скасовано» та «Виконано» панель
// дозволяє повернути замовлення в роботу. У боті такої кнопки немає —
// і там це не проблема, бо статус міняють, дивлячись на картку. У
// панелі ж поруч стоять кнопки й список: один зайвий клік по
// «Скасувати» — і замовлення застигло б назавжди, без жодного способу
// це виправити, крім Table editor у Supabase.
function adminTransitions(current) {

    const status = normalizeStatus(current);

    if (status === "cancelled" || status === "completed") return ["processing"];

    return allowedTransitions(status);

}

// -------------------------
// Пошук
//
// Значення їде в параметр or=(...) PostgREST, де кома, дужки й лапки —
// частина синтаксису. Замість екранування прибираємо все, що не
// схоже на текст запиту: так рядок не може зламати фільтр незалежно
// від того, що ввели в поле.
// -------------------------

const SEARCH_FIELDS = [
    "order_number",
    "first_name",
    "last_name",
    "phone",
    "email",
    "tracking_number",
];

// Поля, у яких має сенс шукати «просто цифри»: номер замовлення,
// телефон, накладна.
const DIGIT_FIELDS = ["order_number", "phone", "tracking_number"];

function sanitizeSearch(text) {

    return String(text ?? "")
        .replace(/[^\p{L}\p{N}\s@._+-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);

}

function searchClause(text) {

    const term = sanitizeSearch(text);

    if (!term) return "";

    // Пробіл стає зіркою: «Іван Петренко» знайдеться і як «Іван
    // Петренко», і як «Іван Б. Петренко». Заодно в адресу не
    // потрапляють пробіли.
    const pattern = `*${term.replace(/\s+/g, "*")}*`;

    const parts = SEARCH_FIELDS.map((field) => `${field}.ilike.${pattern}`);

    // Телефон у базі лежить як +380…, а диктують його по-різному:
    // «050 123 45 67». Тому для номерів шукаємо ще й самі цифри.
    const digits = term.replace(/\D/g, "");

    if (digits.length >= 4 && digits !== term) {

        DIGIT_FIELDS.forEach((field) => parts.push(`${field}.ilike.*${digits}*`));

    }

    return `or=(${parts.join(",")})`;

}

// -------------------------
// Запити до PostgREST
// -------------------------

// Колонки для списку. Перелічені навмисно: select=* тягнув би все,
// включно з полями, яким у браузері нема чого робити.
const LIST_COLUMNS = [
    "id",
    "order_number",
    "created_at",
    "status",
    "items",
    "total",
    "first_name",
    "last_name",
    "phone",
    "delivery_method",
    "delivery_city",
    "tracking_number",
    "refusal_requested_at",
    "user_id",
    "telegram_chat_id",
    // Щоб позначку «сума не збігається» було видно вже в списку, а не
    // тільки в картці замовлення.
    "price_check",
];

function listFilters(params) {

    const parts = [];

    if (params.status) parts.push(`status=eq.${params.status}`);

    if (params.refusal) parts.push("refusal_requested_at=not.is.null");

    const search = searchClause(params.query);

    if (search) parts.push(search);

    return parts;

}

function buildListQuery(params = {}) {

    const parts = [
        `select=${LIST_COLUMNS.join(",")}`,
        "order=created_at.desc",
        ...listFilters(params),
        `limit=${clampLimit(params.limit)}`,
        `offset=${Math.max(0, Math.trunc(Number(params.offset) || 0))}`,
    ];

    return `orders?${parts.join("&")}`;

}

// Скільки всього замовлень у кожній вкладці. Рядки не потрібні —
// лише число з Content-Range, тож просимо одну колонку й один рядок.
function buildCountQuery(params = {}) {

    return `orders?${["select=id", ...listFilters(params), "limit=1"].join("&")}`;

}

// Заявки на відмову цього замовлення — щоб у картці було видно, від
// чого саме відмовляються, а не лише позначку «клієнт просив відмову».
function buildRefusalsQuery(id) {

    return `order_refusals?select=*&order_id=eq.${id}&order=created_at.desc`;

}

// Загальна кількість рядків із заголовка Content-Range: «0-24/137».
function parseTotal(contentRange) {

    const match = /\/(\d+|\*)\s*$/.exec(String(contentRange ?? ""));

    if (!match || match[1] === "*") return null;

    return Number(match[1]);

}

// -------------------------
// Розбір і перевірка запиту
// -------------------------

function clampLimit(value) {

    const number = Math.trunc(Number(value));

    if (!Number.isFinite(number) || number < 1) return LIST_LIMIT_DEFAULT;

    return Math.min(number, LIST_LIMIT_MAX);

}

// id замовлення — bigint identity, тобто самі цифри. Перевіряємо це
// не «для порядку»: id підставляється в адресу запиту до бази, і
// довільний рядок там означав би можливість дописати свій фільтр.
function parseOrderId(value) {

    const raw = String(value ?? "").trim();

    return /^\d{1,18}$/.test(raw) ? raw : null;

}

// Те саме правило, що в боті (validateTracking), але словами панелі:
// у полі введення немає ні «надішліть», ні команди /skip.
function trackingError(checked) {

    if (checked?.reason === "short") return "Замало цифр — ТТН Нової пошти складається з 14.";
    if (checked?.reason === "long") return "Завелика кількість цифр для номера накладної.";

    return "Це не схоже на номер накладної — потрібні 14 цифр.";

}

function parseAdminRequest(body) {

    const action = String(body?.admin_action ?? "").trim();

    if (!ADMIN_ACTIONS.includes(action)) {
        return { ok: false, error: `Невідома дія: ${action || "(порожня)"}` };
    }

    if (action === "list") {

        const status = String(body.status ?? "").trim();

        if (status && !STATUSES[status]) {
            return { ok: false, error: `Невідомий статус: ${status}` };
        }

        return {
            ok: true,
            action,
            params: {
                status,
                refusal: Boolean(body.refusal),
                query: sanitizeSearch(body.query),
                limit: clampLimit(body.limit),
                offset: Math.max(0, Math.trunc(Number(body.offset) || 0)),
            },
        };

    }

    const id = parseOrderId(body.id);

    if (!id) return { ok: false, error: "Не вказано замовлення" };

    if (action === "get") return { ok: true, action, params: { id } };

    if (action === "status") {

        const status = String(body.status ?? "").trim();

        if (!STATUSES[status]) {
            return { ok: false, error: `Невідомий статус: ${status || "(порожній)"}` };
        }

        return { ok: true, action, params: { id, status } };

    }

    // tracking
    const raw = String(body.tracking ?? "").trim();

    // Порожнє значення — це «прибрати накладну». Потрібно, коли номер
    // вписали не в те замовлення: інакше помилковий ТТН лишався б у
    // картці клієнта назавжди.
    if (!raw) return { ok: true, action, params: { id, tracking: null } };

    const checked = validateTracking(raw);

    if (!checked.ok) return { ok: false, error: trackingError(checked) };

    return { ok: true, action, params: { id, tracking: checked.value } };

}

// -------------------------
// Що бачить браузер
//
// Не сам рядок бази, а проєкція. Дві причини:
//
//   • у рядку є те, чому в браузері не місце: user_id клієнта,
//     telegram_chat_id, id повідомлення бота. Замість них — ознаки
//     «гість» і «замовляв у боті», яких достатньо менеджеру;
//
//   • назви полів стають контрактом. Колонку в базі можна
//     перейменувати, не переписуючи сторінку.
// -------------------------

function orderView(order) {

    const status = normalizeStatus(order?.status) || "new";
    const meta = STATUSES[status] ?? STATUSES.new;

    return {
        id: String(order?.id ?? ""),
        orderNumber: order?.order_number ?? "",
        createdAt: order?.created_at ?? null,

        status,
        statusLabel: meta.label,
        statusEmoji: meta.emoji,
        transitions: adminTransitions(status),

        items: parseItems(order?.items),

        subtotal: Number(order?.subtotal) || 0,
        discount: Number(order?.discount) || 0,
        deliveryPrice: Number(order?.delivery_price) || 0,
        total: Number(order?.total) || 0,

        // Що сказала база, коли перерахувала суму своїми цінами
        // (supabase/migrations/014-order-pricing.sql): ok, mismatch,
        // unknown або порожньо для замовлень до тієї міграції.
        priceCheck: order?.price_check ?? "",
        totalExpected: Number(order?.total_expected) || 0,

        firstName: order?.first_name ?? "",
        lastName: order?.last_name ?? "",
        phone: order?.phone ?? "",
        email: order?.email ?? "",

        deliveryMethod: order?.delivery_method ?? "",
        deliveryCity: order?.delivery_city ?? "",
        deliveryDetail: order?.delivery_detail ?? "",
        paymentMethod: order?.payment_method ?? "",
        promoCode: order?.promo_code ?? "",

        trackingNumber: order?.tracking_number ?? "",
        trackingUrl: trackingUrl(order?.tracking_number),

        // Гість — це замовлення без реєстрації. Важливо для менеджера:
        // такому клієнту не видно історії в кабінеті, і всі уточнення
        // йдуть телефоном.
        guest: !order?.user_id,

        // Замовляв у боті — отже, про зміну статусу він отримає
        // повідомлення в Telegram. Для замовлень із сайту сповіщень
        // немає, і про відправлення доводиться казати телефоном.
        fromBot: Boolean(order?.telegram_chat_id),

        refusalRequestedAt: order?.refusal_requested_at ?? null,
    };

}

function refusalView(record) {

    return {
        id: String(record?.id ?? ""),
        createdAt: record?.created_at ?? null,
        note: record?.note ?? "",
        items: parseItems(record?.items),
    };

}

// Відповідь на list: усе, що потрібно панелі для першої ж
// відмальовки — рядки, підписи статусів і кількості для вкладок.
function listResponse({ orders, total, counts }) {

    return {
        ok: true,
        statuses: STATUSES,
        statusOrder: STATUS_ORDER,
        counts: counts ?? {},
        total: typeof total === "number" ? total : null,
        orders: (orders ?? []).map(orderView),
    };

}


// Замовлення з сайту, яке проходить через функцію.
//
// НАВІЩО
// -------
// Досі браузер клав замовлення в базу сам — публічним ключем, який
// лежить у коді сайту. Так і має бути: інакше гість не зміг би
// замовити. Але це означає, що надіслати замовлення може будь-хто, не
// відкриваючи сайту взагалі: сотня підроблених рядків це сотня
// повідомлень у Telegram і — найгірше — зайняті залишки, бо перевірка
// «останній екземпляр» вважає кожне відкрите замовлення зайнятою
// одиницею.
//
// Тепер між браузером і базою може стояти перевірка «ви людина»
// (Cloudflare Turnstile). Підтвердити її можна лише на сервері — у
// браузері будь-яка така перевірка нічого не варта.
//
// ЩО В ЦЬОМУ ФАЙЛІ
// -----------------
// Тільки чиста логіка: перевірка й чистка того, що прислали. Мережа й
// база — у _index.src.ts. Так це можна ганяти тестами в Node.
//
// ГОЛОВНЕ ПРАВИЛО: ФУНКЦІЯ ПИШЕ СЛУЖБОВИМ КЛЮЧЕМ
// -----------------------------------------------
// Тобто обмеження бази на неї не діють — вона може записати будь-що в
// будь-яку колонку. Саме тому нижче не «прибрати зайве», а БІЛИЙ
// СПИСОК: у рядок потрапляють рівно ті поля, які надсилає сторінка
// оформлення, і нічого більше. Статус завжди «new»; чиє це замовлення
// — вирішує не payload, а підтверджений токен.

// Скільки позицій може бути в замовленні. Не обмеження магазину, а
// стеля здорового глузду: більше — це вже не покупка.
const MAX_ITEMS = 50;

// Стеля суми (₴). Захищає від «замовлення» на мільярд, яке зіпсує
// звіти й підсумки.
const MAX_MONEY = 10000000;

const TEXT_LIMITS = {
    order_number: 40,
    delivery_method: 120,
    delivery_city: 120,
    delivery_detail: 300,
    payment_method: 120,
    promo_code: 40,
    first_name: 80,
    last_name: 80,
    phone: 40,
    email: 160,
};

function text(value, limit) {

    const clean = String(value ?? "").trim();

    return clean ? clean.slice(0, limit) : null;

}

// Число грошей: не менше нуля, не більше стелі, дві цифри після коми.
//
// Назва навмисно не money(): у зібраному файлі всі модулі лежать
// поруч, а money() там уже зайнята — це форматування суми для
// Telegram. Дві функції з однією назвою тихо перекрили б одна одну.
function amount(value) {

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0 || number > MAX_MONEY) return 0;

    return Math.round(number * 100) / 100;

}

// Позиція замовлення. Склад той самий, що кладе сторінка оформлення
// (buildOrderItemsSnapshot у assets/js/checkout.js): назва, бренд,
// ціна, фото, кількість, колір, розмір.
function item(raw) {

    if (!raw || typeof raw !== "object") return null;

    const title = text(raw.title, 200);

    if (!title) return null;

    const id = Number(raw.id);

    return {
        id: Number.isFinite(id) && id > 0 ? Math.trunc(id) : null,
        title,
        brand: text(raw.brand, 100),
        price: amount(raw.price),
        image: text(raw.image, 500),
        qty: Math.min(Math.max(Math.trunc(Number(raw.qty) || 1), 1), 100),
        color: text(raw.color, 100),
        size: text(raw.size, 50),
    };

}

// Перевірка й чистка замовлення.
//
// Повертає { ok: true, row } або { ok: false, reason } — reason іде в
// логи функції, а не покупцеві: йому досить «не вдалося оформити».
function cleanOrder(payload) {

    if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "порожній запит" };
    }

    const orderNumber = text(payload.order_number, TEXT_LIMITS.order_number);

    if (!orderNumber || !/^[0-9A-Za-z-]{4,40}$/.test(orderNumber)) {
        return { ok: false, reason: "номер замовлення не схожий на номер" };
    }

    const rawItems = Array.isArray(payload.items) ? payload.items : [];

    if (!rawItems.length) {
        return { ok: false, reason: "порожній склад замовлення" };
    }

    if (rawItems.length > MAX_ITEMS) {
        return { ok: false, reason: `позицій більше за ${MAX_ITEMS}` };
    }

    const items = rawItems.map(item).filter(Boolean);

    if (!items.length) {
        return { ok: false, reason: "жодної придатної позиції" };
    }

    // Хоч якісь контакти: замовлення, за яким неможливо зателефонувати
    // чи написати, — це не замовлення.
    const phone = text(payload.phone, TEXT_LIMITS.phone);
    const email = text(payload.email, TEXT_LIMITS.email);

    if (!phone && !email) {
        return { ok: false, reason: "немає ні телефону, ні пошти" };
    }

    return {
        ok: true,
        row: {
            order_number: orderNumber,

            // Статус НЕ з payload: нове замовлення завжди нове.
            // Інакше підроблений запит міг би одразу прикинутись
            // відправленим і проскочити повз перевірку менеджера.
            status: "new",

            items,

            subtotal: amount(payload.subtotal),
            discount: amount(payload.discount),
            delivery_price: amount(payload.delivery_price),
            total: amount(payload.total),

            delivery_method: text(payload.delivery_method, TEXT_LIMITS.delivery_method),
            delivery_city: text(payload.delivery_city, TEXT_LIMITS.delivery_city),
            delivery_detail: text(payload.delivery_detail, TEXT_LIMITS.delivery_detail),
            payment_method: text(payload.payment_method, TEXT_LIMITS.payment_method),
            promo_code: text(payload.promo_code, TEXT_LIMITS.promo_code),

            first_name: text(payload.first_name, TEXT_LIMITS.first_name),
            last_name: text(payload.last_name, TEXT_LIMITS.last_name),
            phone,
            email,
        },
    };

}

// Відповідь Cloudflare на перевірку токена.
//
// Виносимо в чисту функцію, щоб розбір відповіді перевірявся тестом:
// сам мережевий виклик у Deno не протестуєш.
function turnstileVerdict(data) {

    if (!data || typeof data !== "object") return { ok: false, reason: "порожня відповідь" };

    if (data.success === true) return { ok: true };

    const codes = Array.isArray(data["error-codes"]) ? data["error-codes"].join(", ") : "";

    return { ok: false, reason: codes || "перевірку не пройдено" };

}


// Листи покупцеві: підтвердження замовлення й зміна статусу.
//
// НАВІЩО
// -------
// Покупець із сайту досі не отримував НІ ОДНОГО повідомлення після
// листа «замовлення прийнято» (його шле сама сторінка через EmailJS).
// Замовлення поїхало, номер накладної є, статус змінився — людина про
// це не знає. Сповіщення в 003-customer-notifications.sql ідуть у
// telegram_chat_id, а він є лише в замовлень із бота.
//
// Тобто половина покупців — ті, хто замовляв на сайті, — після
// оформлення лишалась наодинці: або дзвони сам, або чекай.
//
// ОДИН КАНАЛ НА ПОКУПЦЯ
// ----------------------
// Замовлення з бота мають telegram_chat_id і не мають пошти;
// замовлення з сайту — навпаки. Тому правило просте: є чат — пишемо в
// чат, немає — пишемо листом. Двох повідомлень про одне й те саме не
// буває за побудовою.
//
// ЧОМУ ЛИСТ ЗБИРАЄТЬСЯ ТУТ, А НЕ В СЕРВІСІ РОЗСИЛОК
// --------------------------------------------------
// Щоб текст листа лежав у репозиторії поруч із текстом повідомлення в
// Telegram — і правився разом із ним. Шаблон у чужій панелі рано чи
// пізно розходиться з тим, що каже бот.
//
// ЧОМУ ДВА ПРОВАЙДЕРИ
// --------------------
// Resend і Brevo — обидва мають безкоштовний тариф, якого магазину
// вистачає з великим запасом, але вимагають різного: Resend хоче
// підтверджений домен (DNS-записи), Brevo дозволяє почати з однієї
// підтвердженої адреси. Хай власник обирає, що йому простіше; код
// однаково готовий до обох.


// Куда приходить відповідь покупця.
//
// НАВІЩО ОКРЕМО ВІД «ВІД КОГО». Слати листи найкраще з адреси на
// підтвердженому домені — noreply@bestbrnd4u.com. Але скриньки за
// такою адресою немає й не буде: домен налаштований лише на
// ВІДПРАВКУ. Тобто покупець, який натисне «Відповісти» (а він
// натисне — це найприродніша реакція на лист про своє замовлення),
// написав би в нікуди.
//
// Тому в кожному листі стоїть Reply-To з живою скринькою. Та сама
// адреса, що в підвалі листа, — одна на файл, щоб вони не розійшлися.
const SHOP_EMAIL = "bestbrnd4u@proton.me";

// Загальний вигляд листа.
//
// Верстка навмисно проста й inline: клієнти пошти вирізають <style>,
// не знають flex і по-різному розуміють майже все інше. Лист, який
// зламався в Outlook, гірший за лист без оформлення.
function letterShell(title, bodyHtml, siteUrl) {

    const site = String(siteUrl || "").replace(/\/+$/, "");

    return [
        '<div style="margin:0;padding:24px;background:#f3f4f6;',
        'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">',
        '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">',
        `<div style="font-size:20px;font-weight:700;letter-spacing:-.01em;margin-bottom:18px">${escapeHtml(title)}</div>`,
        bodyHtml,
        '<div style="margin-top:26px;padding-top:18px;border-top:1px solid #e5e7eb;',
        'font-size:13px;line-height:1.6;color:#6b7280">',
        site ? `<a href="${escapeHtml(site)}" style="color:#111827">BestBrnd4u</a> · ` : "BestBrnd4u · ",
        '<a href="https://t.me/bestbrnd4u" style="color:#111827">Telegram</a> · ',
        `<a href="mailto:${SHOP_EMAIL}" style="color:#111827">${SHOP_EMAIL}</a>`,
        '<br>Пн–Нд 09:00–20:00',
        "</div>",
        "</div>",
        "</div>"
    ].join("");

}

// Рядок «підпис — значення».
//
// Підпис екранується, бо це текст; значення приходить уже готовою
// розміткою (сума, посилання) — тому екранувати його треба ТАМ, де
// воно збирається. Виділення підсумку — окремим прапорцем, а не
// тегом у підписі: тег там перетворився б на видимий «<b>Разом</b>»
// (саме так і вийшло з першого разу).
function row(label, value, strong) {

    const labelStyle = strong
        ? "padding:8px 0 0;font-size:14px;font-weight:700"
        : "padding:4px 0;color:#6b7280;font-size:14px";

    const valueStyle = strong
        ? "padding:8px 0 0;text-align:right;font-size:14px;font-weight:700"
        : "padding:4px 0;text-align:right;font-size:14px";

    return `<tr>`
        + `<td style="${labelStyle}">${escapeHtml(label)}</td>`
        + `<td style="${valueStyle}">${value}</td>`
        + `</tr>`;

}

// Склад замовлення з фотографіями.
//
// ЧОМУ ФОТО ВАЖЛИВІ САМЕ ТУТ. Лист про замовлення читають через
// тиждень, коли назва «Сумка крос-боді жіноча шкіряна Marc Jacobs The
// Snapshot» уже нічого не нагадує. Фото відповідає на питання «що це
// було» швидше за будь-який текст.
//
// АДРЕСА ФОТО МУСИТЬ БУТИ АБСОЛЮТНОЮ — і вона така: знімок замовлення
// складає assets/js/checkout.js, і там уже стоїть absoluteUrl(). У
// листі відносний шлях нема від чого відкладати, і почтовик показав би
// заглушку. Тому тут ми адресу НЕ чіпаємо, лише екрануємо.
//
// ВИСОТУ НЕ ЗАДАЄМО. Outlook не знає object-fit, тож фіксована висота
// перетворила б фото на розтягнуте. Ширина 64 + height:auto виглядає
// однаково всюди.
function itemsTable(items) {

    const list = Array.isArray(items) ? items : [];

    if (!list.length) return "";

    const cell = "padding:10px 0;border-top:1px solid #e5e7eb";

    const rows = list.map(item => {

        // ONESIZE — внутрішня заглушка для товарів без розмірів. У
        // листі вона читалась би як помилка в даних; решта проєкту її
        // так само ховає (фід, ідентифікатор для Meta).
        const size = String(item.size ?? "").trim();

        const variant = [item.color, size.toUpperCase() === "ONESIZE" ? "" : size]
            .filter(Boolean).join(" / ");

        const title = escapeHtml(item.title || "");

        // alt на випадок, коли фото не показали: Gmail за
        // замовчуванням не вантажить картинки, а Outlook не розуміє
        // webp. Рядок мусить читатись і без них.
        const photo = item.image
            ? `<img src="${escapeHtml(item.image)}" width="64" alt="${title}"`
                + ` style="display:block;border:0;border-radius:8px;max-width:64px;height:auto">`
            : "";

        return `<tr>`
            + `<td width="64" valign="top" style="${cell};padding-right:12px;width:64px">${photo}</td>`
            + `<td valign="top" style="${cell};font-size:14px">`
            + title
            + (item.brand ? `<br><span style="color:#6b7280">${escapeHtml(item.brand)}</span>` : "")
            + (variant ? `<br><span style="color:#6b7280">${escapeHtml(variant)}</span>` : "")
            + `</td>`
            + `<td valign="top" style="${cell};text-align:right;font-size:14px;white-space:nowrap">`
            + `${item.qty ?? 1} × ${escapeHtml(money(item.price))}`
            + `</td></tr>`;

    }).join("");

    return `<table style="width:100%;border-collapse:collapse;margin:14px 0">${rows}</table>`;

}

// Короткий склад для листів про статус: товари й підсумок.
//
// НАВІЩО. Лист «замовлення відправлено» без складу відповідає на
// питання «коли», але не на «що». Через тиждень після покупки це
// різні питання, і другого покупець не пам'ятає.
//
// Повного розкладу (знижка, доставка, спосіб оплати) тут навмисно
// немає: він уже був у листі-підтвердженні, а тут важливо не
// повторити рахунок, а нагадати товар.
function summaryBlock(order) {

    const items = itemsTable(order?.items);

    if (!items) return "";

    return `<div style="margin-top:24px;padding-top:6px;border-top:1px solid #e5e7eb">`
        + `<div style="font-weight:600;font-size:14px;margin-top:14px">Ваше замовлення</div>`
        + items
        + `<table style="width:100%;border-collapse:collapse">`
        + row("Разом", escapeHtml(money(order?.total)), true)
        + `</table></div>`;

}

// Лист «замовлення прийнято».
// Посилання «перевірити стан замовлення».
//
// Номер підставлений в адресу, тож на сторінці лишається ввести лише
// телефон. Переписувати десять цифр із листа руками — рівно те, чого
// люди не роблять: вони пишуть у Telegram.
//
// Стилі вбудовані в атрибути: пошта не читає <style>, і будь-який
// клас тут просто нічого не робив би.
function lookupLine(orderNumber, siteUrl) {

    const number = String(orderNumber ?? "").trim();

    if (!number) return "";

    const base = String(siteUrl ?? "").replace(/\/$/, "");

    const url = `${base}/order-status?order=${encodeURIComponent(number)}`;

    return `<div style="margin-top:18px;font-size:13px;line-height:1.6;color:#6b7280">`
        + `Стан замовлення можна перевірити будь-коли: `
        + `<a href="${escapeHtml(url)}" style="color:#111827;font-weight:600">Де моє замовлення</a>`
        + ` — потрібні номер ${escapeHtml(number)} і ваш телефон.`
        + `</div>`;

}

function orderLetter(order, siteUrl) {

    const number = String(order?.order_number ?? "");

    const totals = [
        Number(order?.subtotal) > 0 ? row("Сума товарів", escapeHtml(money(order.subtotal))) : "",
        Number(order?.discount) > 0 ? row("Знижка", "−" + escapeHtml(money(order.discount))) : "",
        Number(order?.delivery_price) > 0 ? row("Доставка", escapeHtml(money(order.delivery_price))) : "",
        row("Разом", escapeHtml(money(order?.total)), true)
    ].join("");

    const delivery = [
        // Не «Доставка»: цей блок і так називається «Доставка», а
        // рядок «Доставка / Доставка: Нова пошта» читається як помилка.
        order?.delivery_method ? row("Спосіб", escapeHtml(order.delivery_method)) : "",
        order?.delivery_city ? row("Місто", escapeHtml(order.delivery_city)) : "",
        order?.delivery_detail ? row("Відділення", escapeHtml(order.delivery_detail)) : "",
        order?.payment_method ? row("Оплата", escapeHtml(order.payment_method)) : ""
    ].join("");

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        `Дякуємо за замовлення <b>${escapeHtml(number)}</b>! Ми вже його бачимо `,
        `й найближчим часом зв'яжемось, щоб підтвердити деталі.`,
        `</div>`,
        itemsTable(order?.items),
        `<table style="width:100%;border-collapse:collapse">${totals}</table>`,
        delivery
            ? `<div style="margin-top:18px;font-weight:600;font-size:14px">Доставка</div>`
                + `<table style="width:100%;border-collapse:collapse">${delivery}</table>`
            : "",
        lookupLine(number, siteUrl)
    ].join("");

    return {
        subject: `Замовлення ${number} прийнято`,
        html: letterShell("Замовлення прийнято 🎉", body, siteUrl)
    };

}

// Лист про зміну статусу. Текст той самий, що бачить покупець із бота
// (customerStatusMessage у format.js) — інакше два канали розповідали
// б різне.
function statusLetter(order, status, siteUrl) {

    const number = String(order?.order_number ?? "");
    const ttn = order?.tracking_number;

    const url = trackingUrl(ttn);

    const button = url
        ? `<div style="margin-top:20px"><a href="${escapeHtml(url)}" `
            + `style="display:inline-block;background:#111827;color:#fff;text-decoration:none;`
            + `padding:12px 20px;border-radius:8px;font-size:14px">Відстежити посилку</a></div>`
        : "";

    switch (String(status || "").toLowerCase()) {

        case "processing":
            return {
                subject: `Замовлення ${number} прийнято в роботу`,
                html: letterShell("Замовлення в роботі 👌",
                    `<div style="font-size:15px;line-height:1.6">Ваше замовлення <b>${escapeHtml(number)}</b> `
                    + `прийнято в роботу. Ми зв'яжемось із вами найближчим часом, щоб підтвердити деталі.</div>`
                    + summaryBlock(order),
                    siteUrl)
            };

        case "shipped":
            return {
                subject: `Замовлення ${number} відправлено`,
                html: letterShell("Замовлення відправлено 📦",
                    `<div style="font-size:15px;line-height:1.6">Замовлення <b>${escapeHtml(number)}</b> вже в дорозі.`
                    + (ttn
                        ? `<br><br>Номер накладної: <b>${escapeHtml(ttn)}</b>`
                        : `<br><br>Номер накладної надішлемо окремо.`)
                    // Порядок тут не косметика.
                    //
                    // Gmail ховає «обрізаний вміст» — те, що повторює
                    // попередній лист у тій самій темі (а власник може
                    // виправити накладну й надіслати лист удруге). Ріже
                    // він ХВІСТ. Тому найважливіше стоїть вище: номер
                    // накладної, потім склад, і лише потім кнопка з
                    // підвалом — те, що можна втратити без шкоди.
                    + `</div>` + summaryBlock(order) + button,
                    siteUrl)
            };

        case "completed":
            return {
                subject: `Замовлення ${number} виконано`,
                html: letterShell("Замовлення виконано 🎉",
                    `<div style="font-size:15px;line-height:1.6">Замовлення <b>${escapeHtml(number)}</b> виконано. `
                    + `Дякуємо за покупку — будемо раді бачити вас знову!</div>`
                    + summaryBlock(order),
                    siteUrl)
            };

        case "cancelled":
            return {
                subject: `Замовлення ${number} скасовано`,
                html: letterShell("Замовлення скасовано",
                    `<div style="font-size:15px;line-height:1.6">Замовлення <b>${escapeHtml(number)}</b> скасовано. `
                    + `Якщо це помилка — просто напишіть нам, ми все виправимо.</div>`
                    + summaryBlock(order),
                    siteUrl)
            };

        default:
            // «Нове» покупцеві не повідомляють: він щойно оформив
            // замовлення й уже отримав лист-підтвердження.
            return null;

    }

}

// Лист «ви залишили щось у кошику».
//
// НАВІЩО. Кошик авторизованого покупця вже лежить у базі — сайт
// синхронізує його, щоб людина бачила ті самі товари на телефоні й на
// комп'ютері. Але далі з ним не відбувалось нічого: наповнив кошик,
// закрив вкладку — і все.
//
// Це найдешевший спосіб повернути людину, яка вже все обрала: вона
// прийшла сама, товар обрала сама, лишилось нагадати.
//
// ЧОМУ ЛИСТ ОДИН. Другий лист про ті самі три товари це вже не
// нагадування, а надокучання — і найкоротший шлях у спам. Тому в
// тексті прямо сказано, що він один.
function cartLetter(items, siteUrl) {

    const list = Array.isArray(items) ? items : [];

    if (!list.length) return null;

    const site = String(siteUrl || "").replace(/\/+$/, "");

    const total = list.reduce(function (sum, item) {
        return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
    }, 0);

    const button = site
        ? `<div style="margin-top:22px"><a href="${escapeHtml(site)}/cart" `
            + `style="display:inline-block;background:#111827;color:#fff;text-decoration:none;`
            + `padding:12px 22px;border-radius:8px;font-size:14px">Повернутись до кошика</a></div>`
        : "";

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        list.length === 1
            ? "У вашому кошику лишився товар — ми його зберегли."
            : "У вашому кошику лишились товари — ми їх зберегли.",
        `</div>`,
        itemsTable(list),
        `<table style="width:100%;border-collapse:collapse">`,
        row("Разом", escapeHtml(money(total)), true),
        `</table>`,
        button,
        `<div style="margin-top:20px;font-size:13px;line-height:1.6;color:#6b7280">`,
        "Це єдине нагадування — більше про цей кошик ми не напишемо.",
        " Якщо ви передумали, просто не звертайте уваги.",
        `</div>`
    ].join("");

    return {
        subject: list.length === 1 ? "Ви залишили товар у кошику" : "Ви залишили товари у кошику",
        html: letterShell("Ваш кошик чекає 🛍", body, siteUrl)
    };

}

// Незавершене ОФОРМЛЕННЯ — не те саме, що брошений кошик.
//
// ЧОМУ ОКРЕМИЙ ЛИСТ, А НЕ cartLetter
// -----------------------------------
// Людина не просто поклала товар у кошик — вона відкрила оформлення й
// заповнила пошту. Тобто дійшла на крок далі, ніж «подивлюсь потім»,
// і лист має говорити саме про це: не «ваш кошик чекає», а «ви не
// завершили замовлення». Кнопка веде на оформлення, а не в кошик.
//
// ЧОМУ ТУТ ВЗАГАЛІ Є ПРО РОЗСИЛКУ
// --------------------------------
// Це єдиний лист магазину, який приходить людині, що НЕ реєструвалась
// і НЕ підписувалась. Тому в ньому прямо сказано, чому він прийшов і
// що адресу не додали в розсилку: людина має розуміти це з листа, а
// не здогадуватись (умови — у міграції 020).
function checkoutLetter(items, siteUrl) {

    const list = Array.isArray(items) ? items : [];

    if (!list.length) return null;

    const site = String(siteUrl || "").replace(/\/+$/, "");

    const total = list.reduce(function (sum, item) {
        return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
    }, 0);

    const button = site
        ? `<div style="margin-top:22px"><a href="${escapeHtml(site)}/checkout" `
            + `style="display:inline-block;background:#111827;color:#fff;text-decoration:none;`
            + `padding:12px 22px;border-radius:8px;font-size:14px">Завершити замовлення</a></div>`
        : "";

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        "Ви почали оформлювати замовлення й не завершили — ",
        list.length === 1 ? "товар ми зберегли." : "товари ми зберегли.",
        " Якщо щось не вийшло, просто відповідайте на цей лист: допоможемо оформити.",
        `</div>`,
        itemsTable(list),
        `<table style="width:100%;border-collapse:collapse">`,
        row("Разом", escapeHtml(money(total)), true),
        `</table>`,
        button,
        `<div style="margin-top:20px;font-size:13px;line-height:1.6;color:#6b7280">`,
        "Ви отримали цей лист, бо залишили свою пошту на сторінці оформлення",
        " замовлення. Це єдине нагадування, і до розсилки магазину ваша",
        " адреса не додана. Якщо ви передумали — просто не звертайте уваги.",
        `</div>`
    ].join("");

    return {
        subject: "Ви не завершили замовлення",
        html: letterShell("Завершити замовлення?", body, siteUrl)
    };

}

// Запит до сервісу розсилки.
//
// Повертає null, якщо надсилати нічим або нікуди — тоді функція просто
// не шле листа. Магазин без листів працює; магазин, який падає через
// недоступну пошту, — ні.
// Прохання написати відгук.
//
// items — склад замовлення (той самий знімок, що в базі). Показуємо
// його з фото: людина мусить згадати, про що йдеться, не відкриваючи
// сайт.
//
// ПОСИЛАННЯ ВЕДЕ НА СТОРІНКУ ТОВАРУ, А НЕ НА ЯКУСЬ ФОРМУ. Форма живе
// там же, під відгуками, і просить номер замовлення — тому кладемо
// його в адресу, щоб людині лишилось ввести телефон.
function reviewLetter(order, siteUrl) {

    const number = String(order?.order_number ?? "");

    const base = String(siteUrl ?? "").replace(/\/$/, "");

    const items = Array.isArray(order?.items) ? order.items.slice(0, 6) : [];

    const rows = items.map((item) => {

        const title = escapeHtml(item?.title ?? "");

        // Посилання на конкретний товар: у нього ж і треба написати
        // відгук. Без slug лишається просто рядок — це нормально,
        // знімок замовлення міг бути зроблений до появи slug.
        const url = item?.slug
            ? `${base}/p/${encodeURIComponent(item.slug)}/?order=${encodeURIComponent(number)}#productReviews`
            : "";

        const photo = item?.image
            ? `<img src="${escapeHtml(item.image)}" width="64" alt="${title}"`
                + ` style="display:block;border:0;border-radius:8px;max-width:64px;height:auto">`
            : "";

        const cell = "padding:10px 0;border-top:1px solid #e5e7eb";

        return `<tr>`
            + `<td style="${cell};width:76px">${photo}</td>`
            + `<td style="${cell}">`
            + (url
                ? `<a href="${escapeHtml(url)}" style="color:#111827;font-weight:600;text-decoration:none">${title}</a>`
                : `<b>${title}</b>`)
            + (url
                ? `<div style="margin-top:6px"><a href="${escapeHtml(url)}" style="color:#2f6fb3">Написати відгук →</a></div>`
                : "")
            + `</td>`
            + `</tr>`;

    }).join("");

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        `Дякуємо за замовлення <b>${escapeHtml(number)}</b>! Сподіваємось, усе підійшло.`,
        `</div>`,
        `<div style="margin-top:14px;font-size:15px;line-height:1.6">`,
        `Якщо у вас є хвилина — напишіть кілька слів про покупку. `,
        `Це найкорисніше, що можна зробити для наступного покупця: він `,
        `бачить ту саму річ, але не може її потримати.`,
        `</div>`,
        rows ? `<table style="width:100%;border-collapse:collapse;margin-top:18px">${rows}</table>` : "",
        `<div style="margin-top:18px;font-size:13px;line-height:1.6;color:#6b7280">`,
        `Знадобиться номер замовлення <b>${escapeHtml(number)}</b> і ваш телефон — `,
        `так ми відрізняємо відгуки покупців від чужих. Відгук з'явиться `,
        `на сайті після того, як ми його прочитаємо.`,
        `</div>`,
    ].join("");

    return {
        subject: `Як вам покупка? Замовлення ${number}`,
        html: letterShell("Дякуємо за покупку 💬", body, siteUrl)
    };

}

function mailRequest(config, letter) {

    const to = String(config?.to || "").trim();
    const from = String(config?.from || "").trim();

    if (!to || !from || !letter || !letter.subject) return null;

    // Відповідь покупця мусить дійти до людини, а не в noreply.
    const replyTo = String(config?.replyTo || "").trim() || SHOP_EMAIL;

    if (config?.resendKey) {

        return {
            provider: "resend",
            url: "https://api.resend.com/emails",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.resendKey}`
            },
            body: {
                from,
                to: [to],
                reply_to: replyTo,
                subject: letter.subject,
                html: letter.html
            }
        };

    }

    if (config?.brevoKey) {

        // Brevo хоче ім'я та адресу окремо. Приймаємо і «Магазин
        // <shop@example.com>», і просту адресу.
        const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);

        return {
            provider: "brevo",
            url: "https://api.brevo.com/v3/smtp/email",
            headers: {
                "Content-Type": "application/json",
                "api-key": config.brevoKey
            },
            body: {
                sender: match
                    ? { name: match[1] || "BestBrnd4u", email: match[2] }
                    : { name: "BestBrnd4u", email: from },
                to: [{ email: to }],
                replyTo: { email: replyTo },
                subject: letter.subject,
                htmlContent: letter.html
            }
        };

    }

    return null;

}


// Довідник Нової пошти: міста й відділення.
//
// НАВІЩО
// -------
// Місто й номер відділення покупець вписував руками. Наслідки видно на
// кожному замовленні: «Відділення №45» замість «№145», «Кийв», «НП 12»
// — і власник перед відправкою мусить вгадувати, що саме мали на увазі,
// або дзвонити й перепитувати.
//
// ЧОМУ ЧЕРЕЗ ФУНКЦІЮ, А НЕ ПРЯМО З БРАУЗЕРА
// ------------------------------------------
// Ключ API Нової пошти дає право не лише читати довідник, а й
// СТВОРЮВАТИ накладні на вашому рахунку. У коді сайту він лежати не
// може — тому браузер питає нашу функцію, а вона вже ходить у НП зі
// секретним ключем.
//
// ЩО В ЦЬОМУ ФАЙЛІ
// -----------------
// Тільки чиста логіка: зібрати запит і обрізати відповідь до того, що
// потрібно сторінці. Мережа — у _index.src.ts, тому це можна ганяти
// тестами в Node.
//
// ЧОМУ ВІДПОВІДЬ ОБРІЗАЄТЬСЯ
// ---------------------------
// НП на один запит віддає десятки полів на кожне відділення (графік,
// координати, обмеження ваги, номери телефонів). Сторінці потрібні
// назва й номер. Решта — це кілобайти, які поїхали б у браузер
// кожного покупця й нічого йому не дали.

// Обидва методи — тільки читання довідника. Жодного створення
// накладних: перелік навмисно закритий, щоб через проксі не можна
// було зробити нічого, крім пошуку адреси.
const NP_METHODS = {

    settlements: {
        modelName: "Address",
        calledMethod: "searchSettlements"
    },

    warehouses: {
        modelName: "AddressGeneral",
        calledMethod: "getWarehouses"
    },

    // Типи точок: «Відділення», «Поштомат», «Пункт приймання-видачі».
    // Потрібні, щоб просити в НП саме потрібний тип, а не відсіювати
    // його в себе — див. коментар про 500 рядків нижче.
    types: {
        modelName: "Address",
        calledMethod: "getWarehouseTypes"
    }

};

// Скільки міст показувати в підказці. Більше нікому не потрібно: якщо
// потрібного немає в перших десяти, людина допише ще літеру.
const SETTLEMENT_LIMIT = 12;

function npRequest(apiKey, action) {

    const spec = NP_METHODS[action?.method];

    if (!spec || !apiKey) return null;

    if (action.method === "settlements") {

        const query = String(action.query || "").trim();

        // Одна літера дає півтисячі міст і жодної користі.
        if (query.length < 2) return null;

        return {
            apiKey,
            modelName: spec.modelName,
            calledMethod: spec.calledMethod,
            // Limit і Page — ЧИСЛАМИ.
            //
            // Тут стояло String(SETTLEMENT_LIMIT), і searchSettlements
            // відмовляв, тоді як getWarehouseTypes на тій самій моделі
            // Address працював. Опис методу в SDK називає обидва
            // параметри числами; getWarehouses рядок приймає, але
            // поблажливість одного методу нічого не обіцяє про інший.
            //
            // ЦЕ ГІПОТЕЗА, не доведена причина: точну скаже рядок
            // «Нова пошта відмовила» — він тепер іде і в щоденний звіт
            // (різновид np_directory).
            methodProperties: {
                CityName: query.slice(0, 60),
                Limit: SETTLEMENT_LIMIT,
                Page: 1
            }
        };

    }

    if (action.method === "types") {

        return {
            apiKey,
            modelName: spec.modelName,
            calledMethod: spec.calledMethod,
            methodProperties: {}
        };

    }

    const cityRef = String(action.cityRef || "").trim();

    // Ref міста — це UUID від НП. Перевіряємо форму, щоб проксі не
    // перетворився на спосіб передавати в НП що завгодно.
    if (!/^[0-9a-f-]{36}$/i.test(cityRef)) return null;

    const query = String(action.query || "").trim();
    const typeRef = String(action.typeRef || "").trim();

    // ЧОМУ ПОШУК ВІДДАЄМО НОВІЙ ПОШТІ
    //
    // Спершу тут стояв простий запит «усі точки міста, Limit 500», а
    // фільтрував уже браузер. На Києві це не працювало: точок там
    // кілька тисяч, у перші 500 потрапляють відділення (номери 1-500),
    // а поштомати мають номери на 4xxxx — тобто в список вони не
    // входили ніколи. Відділення знаходились, поштомати — ні.
    //
    // FindByString шукає по номеру й адресі на боці НП, тому «40964» і
    // «Хрещатик» знаходяться незалежно від кількості точок у місті.
    const properties = {
        CityRef: cityRef,
        Limit: query ? "50" : "500",
        Page: "1"
    };

    if (query) properties.FindByString = query.slice(0, 60);

    // Тип точки теж просимо в НП, а не відсіюємо в себе: інакше з 50
    // знайдених могли б прийти лише відділення, і поштоматів у списку
    // знову не було б.
    if (/^[0-9a-f-]{36}$/i.test(typeRef)) properties.TypeOfWarehouseRef = typeRef;

    return {
        apiKey,
        modelName: spec.modelName,
        calledMethod: spec.calledMethod,
        methodProperties: properties
    };

}

// Типи точок НП: {ref, name}. Нам потрібен лише той, у назві якого є
// «поштомат» — решту просимо як «усе інше».
function parseTypes(payload) {

    const list = payload && Array.isArray(payload.data) ? payload.data : [];

    return list.map(item => ({
        ref: String(item?.Ref || "").trim(),
        name: String(item?.Description || "").trim()
    })).filter(item => item.ref && item.name);

}

// Ref типу «Поштомат» із довідника типів.
function postomatTypeRef(types) {

    const list = (Array.isArray(types) ? types : [])
        .filter(item => /поштомат/i.test(String(item?.name || "")));

    if (!list.length) return "";

    // ЧОМУ НЕ ПРОСТО ПЕРШИЙ ЗБІГ.
    //
    // У довіднику НП «поштоматів» ДВА, і чужий стоїть раніше:
    //
    //     Поштомат ПриватБанку
    //     Поштомат
    //
    // find() брав перший — тобто пошук поштоматів Нової пошти
    // фільтрувався за типом ПриватБанку й повертав порожній список
    // ЗАВЖДИ. Ззовні це виглядало як «не знаходить поштомат за
    // номером», і жодної помилки при цьому не було: НП чесно
    // відповідала «нічого не знайдено».
    const exact = list.find(item =>
        String(item.name).trim().toLowerCase() === "поштомат");

    if (exact) return exact.ref || "";

    // Точного немає — беремо НАЙКОРОТШУ назву: чужі бренди додають
    // слова («ПриватБанку»), а власний тип НП зветься одним словом.
    // Це запас на випадок, якщо НП колись перейменує тип.
    const shortest = list.slice().sort((a, b) =>
        String(a.name).length - String(b.name).length)[0];

    return shortest ? (shortest.ref || "") : "";

}

// Міста з відповіді НП.
//
// Структура в них незвична: data — масив з ОДНОГО елемента, у якому
// лежить Addresses. Пишемо обережно: зміниться формат — отримаємо
// порожній список, а не помилку на сторінці оформлення.
function parseSettlements(payload) {

    const first = payload && Array.isArray(payload.data) ? payload.data[0] : null;

    const list = first && Array.isArray(first.Addresses) ? first.Addresses : [];

    return list.map(item => ({

        // «Київ, Київська обл.» — саме те, що варто показати людині:
        // однойменних сіл в Україні десятки.
        name: String(item?.Present || item?.MainDescription || "").trim(),

        // Ref, за яким далі просять відділення. У НП це окреме поле:
        // Ref — це населений пункт, DeliveryCity — місто доставки.
        ref: String(item?.DeliveryCity || "").trim()

    })).filter(item => item.name && item.ref);

}

// Відділення міста, розділені на звичайні та поштомати.
function parseWarehouses(payload) {

    const list = payload && Array.isArray(payload.data) ? payload.data : [];

    return list.map(item => ({

        name: String(item?.Description || "").trim(),

        number: String(item?.Number || "").trim(),

        // Поштомат і відділення — різні способи доставки на сторінці,
        // і мішати їх в одному списку означало б показувати людині
        // те, чого вона не обирала.
        postomat: String(item?.CategoryOfWarehouse || "") === "Postomat"

    })).filter(item => item.name);

}

// Що з відповіді НП вважати помилкою.
//
// НП відповідає HTTP 200 навіть на невдалий запит — успіх лежить у
// полі success, а причина в errors. Без цього «немає такого міста» і
// «ключ недійсний» виглядали б однаково: порожній список.
function npError(payload) {

    if (!payload) return "порожня відповідь";

    if (payload.success === true) return null;

    const errors = Array.isArray(payload.errors) ? payload.errors.filter(Boolean) : [];

    return errors.length ? errors.join("; ") : "запит не пройшов";

}


// Серверні конверсії Meta (Conversions API).
//
// НАВІЩО
// -------
// Досі про покупку Meta дізнавалась ЛИШЕ з браузера: піксель на
// сторінці подяки надсилав Purchase. Проблема в тому, що цей піксель
// доїжджає не завжди:
//
//   • блокувальники рекламних скриптів вирізають connect.facebook.net цілком;
//   • Safari й iOS обмежують сторонні скрипти та куки;
//   • людина закриває вкладку швидше, ніж скрипт устигає надіслати.
//
// Це не «трохи менше статистики». Meta оптимізує показ реклами за
// конверсіями: якщо вона бачить половину покупок, вона й навчається на
// половині — і шукає схожих людей за неповною картиною. Тобто гроші за
// рекламу витрачаються гірше, ніж могли б.
//
// Conversions API — той самий Purchase, але надісланий СЕРВЕРОМ. Його
// не блокує ніщо в браузері: запит іде з нашої функції в Meta.
//
// ЧОМУ НЕ ДУБЛЮЄТЬСЯ
// -------------------
// Meta склеює браузерну й серверну подію, якщо в них однакові
// event_name і event_id. Тому event_id тут будується з НОМЕРА
// ЗАМОВЛЕННЯ — те саме значення, що браузер кладе в eventID пікселя
// (див. assets/js/analytics.js). Одне замовлення = один event_id, хоч
// скільки разів його надішли.
//
// Додатково кладемо order_id: для Purchase Meta вміє склеювати ще й за
// ним. Два незалежні способи — бо порахувати покупку двічі гірше, ніж
// не порахувати взагалі: подвоєна конверсія бреше про ціну залучення.
//
// ЧОМУ ТІЛЬКИ PURCHASE
// ---------------------
// ViewContent і AddToCart — це подія на кожен перегляд товару, тобто
// запит до Meta з сервера на кожен клік. Оптимізація ж будується на
// покупці. Тож серверна тут одна, найдорожча подія; решта лишається
// браузерною.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі й хешування. У цьому файлі лише чисті функції — щоб їх можна
// було ганяти тестами в Node, без Deno й без справжніх запитів у Meta.
// Хешує й надсилає _index.src.ts.

// Версія Graph API. Пін навмисний: Meta ламає сумісність між версіями,
// і «остання» колись стане несумісною сама собою.
const GRAPH_VERSION = "v21.0";

// Скільки живе подія. Meta відкидає старші за 7 днів, і немає сенсу
// намагатись надіслати вчорашнє замовлення повторно.
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;


// -------------------------
// Нормалізація перед хешуванням
//
// Meta хешує не те, що ви прислали, а те, що ЇЇ нормалізатор зробив із
// даних користувача на її боці. Якщо ми нормалізуємо інакше — хеші не
// зійдуться, і збіг не знайдеться: подія долетить, але припишеться
// нікому. Тому правила нижче — дослівно за документацією Meta.
// -------------------------

// Пошта: обрізати, у нижній регістр. Усе.
function normalizeEmail(value) {

    const clean = String(value ?? "").trim().toLowerCase();

    // Без «@» це не пошта, а описка. Хеш від описки — сміття, яке
    // тільки псує показник якості збігів у Events Manager.
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) ? clean : "";

}

// Телефон: лише цифри, обов'язково з кодом країни, без «+».
//
// ЧОМУ ЦЕ НЕ ОДИН replace. Той самий український номер люди пишуть
// щонайменше чотирма способами, і всі чотири мусять дати ОДИН хеш —
// інакше та сама людина виглядає для Meta як чотири різні:
//
//   +380 73 728 82 91  →  380737288291
//   0737288291         →  380737288291
//   80737288291        →  380737288291
//   737288291          →  380737288291
function normalizePhone(value) {

    let digits = String(value ?? "").replace(/\D/g, "");

    if (!digits) return "";

    // «80…» — старий міжміський формат, який досі пишуть у візитках.
    if (digits.length === 11 && digits.startsWith("80")) {
        digits = "3" + digits;
    }

    // «0…» — місцевий запис: прибираємо нуль, ставимо код країни.
    if (digits.length === 10 && digits.startsWith("0")) {
        digits = "38" + digits;
    }

    // Дев'ять цифр — номер без жодного префікса.
    if (digits.length === 9) {
        digits = "380" + digits;
    }

    // Довжина поза межами телефонного номера — швидше описка або
    // вставлений не той рядок. Порожнє краще за неправильний хеш.
    if (digits.length < 11 || digits.length > 15) return "";

    return digits;

}

// Ім'я, прізвище: нижній регістр, без пробілів, цифр і пунктуації.
function normalizeName(value) {

    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}]/gu, "");

}

// Місто: те саме, що ім'я. «м. Київ» і «Київ» мусять дати один хеш.
function normalizeCity(value) {

    return normalizeName(value);

}

// Країна: дволітерний код у нижньому регістрі.
const COUNTRY_CODE = "ua";


// -------------------------
// Що саме хешувати
// -------------------------

// Ключі Meta для даних людини і значення з замовлення.
//
// Повертає ЩЕ НЕ ХЕШОВАНІ значення: хешує виклик у Deno, бо
// crypto.subtle асинхронний, а цей файл має лишатись чистим.
//
// Порожні поля не потрапляють у результат зовсім. Хеш від порожнього
// рядка — це не «немає даних», а конкретний хеш, однаковий у всіх
// покупців: Meta склеїла б їх в одну людину.
function userDataSources(order) {

    const source = {
        em: normalizeEmail(order?.email),
        ph: normalizePhone(order?.phone),
        fn: normalizeName(order?.first_name),
        ln: normalizeName(order?.last_name),
        ct: normalizeCity(order?.delivery_city),
        country: COUNTRY_CODE,
    };

    const result = {};

    Object.keys(source).forEach((key) => {
        if (source[key]) result[key] = source[key];
    });

    return result;

}

// Чи є взагалі за чим шукати людину.
//
// Meta відхиляє подію без жодного ідентифікатора. Пошта або телефон —
// найсильніші; fbp/fbc теж рахуються, але їх немає саме тоді, коли
// піксель заблокований, тобто рівно в тих випадках, для яких усе це й
// робиться.
function hasIdentity(sources, browser) {

    if (sources && (sources.em || sources.ph)) return true;

    return Boolean(browser && (browser.fbp || browser.fbc));

}


// -------------------------
// Склад покупки
// -------------------------

// Ідентифікатор товару для Meta.
//
// МУСИТЬ збігатися з тим, що надсилає піксель і що стоїть у фіді
// (scripts/build-feed.js) — інакше динамічна реклама показує «товар не
// знайдено», а конверсія не приписується жодному товару. Формат один
// на три місця: числовий id товару рядком.
function metaContentId(item) {

    const id = Number(item?.id);

    return Number.isFinite(id) && id > 0 ? String(Math.trunc(id)) : "";

}

// custom_data події: гроші й склад.
//
// Суму беремо з РЯДКА В БАЗІ, а не з того, що прислав браузер. Це той
// самий принцип, що в перевірці ціни (міграція 014): числа, які
// прийшли з браузера, — заявка, а не факт. Тут це ще й захист від
// накрутки: інакше сторонній запит міг би записати Meta покупку на
// мільйон і зіпсувати оптимізацію реклами.
function customData(order) {

    const items = Array.isArray(order?.items) ? order.items : [];

    const contents = items
        .map((item) => {

            const id = metaContentId(item);

            if (!id) return null;

            const qty = Math.max(Math.trunc(Number(item.qty) || 1), 1);

            return {
                id,
                quantity: qty,
                item_price: Math.round((Number(item.price) || 0) * 100) / 100,
            };

        })
        .filter(Boolean);

    const data = {
        currency: "UAH",
        value: Math.round((Number(order?.total) || 0) * 100) / 100,
        content_type: "product",
        content_ids: contents.map((row) => row.id),
        contents,
        num_items: contents.reduce((sum, row) => sum + row.quantity, 0),
    };

    // Другий спосіб склеювання з браузерною подією.
    if (order?.order_number) data.order_id = String(order.order_number);

    return data;

}


// -------------------------
// Сама подія
// -------------------------

// Ключ склеювання. Той самий рядок будує браузер — див.
// Analytics.purchase у assets/js/analytics.js.
function purchaseEventId(orderNumber) {

    const clean = String(orderNumber ?? "").trim();

    return clean ? `purchase.${clean}` : "";

}

// Готова подія для Meta.
//
// hashed — уже похешовані значення з userDataSources (SHA-256, hex).
// Кладемо їх масивами: Meta приймає і рядок, і масив, але масив — це
// документована форма, і саме її показує їхній же приклад.
function buildEvent({ order, hashed, browser, sourceUrl, ip, userAgent, now }) {

    const when = Number(now) || Date.now();

    const created = Date.parse(order?.created_at ?? "");

    // Час події — коли покупка сталась, а не коли ми про неї
    // розповіли. Але якщо рядок у базі старший за межу Meta, вона
    // відкине подію цілком, тож не вигадуємо: беремо поточний час.
    const eventTime = Number.isFinite(created) && when - created < MAX_EVENT_AGE_MS
        ? created
        : when;

    const userData = {};

    Object.keys(hashed || {}).forEach((key) => {
        if (hashed[key]) userData[key] = [hashed[key]];
    });

    // Ці три — НЕ хешуються. Meta вимагає їх у відкритому вигляді:
    // адреса й браузер потрібні саме для того, щоб зіставити серверну
    // подію з браузерною сесією.
    if (ip) userData.client_ip_address = ip;
    if (userAgent) userData.client_user_agent = userAgent;

    if (browser?.fbp) userData.fbp = browser.fbp;
    if (browser?.fbc) userData.fbc = browser.fbc;

    return {
        event_name: "Purchase",
        event_time: Math.floor(eventTime / 1000),
        event_id: purchaseEventId(order?.order_number),
        action_source: "website",
        ...(sourceUrl ? { event_source_url: sourceUrl } : {}),
        user_data: userData,
        custom_data: customData(order),
    };

}

// Куди і що надсилати.
//
// Токен іде в ТІЛІ запиту, а не в адресі: адреси лишаються в логах
// проксі, у метриках, у повідомленнях про помилки. Токен CAPI дає
// право писати конверсії від імені рекламного акаунта — йому там не
// місце.
function capiRequest(pixelId, token, events, testCode) {

    const pixel = String(pixelId ?? "").trim();

    // Порожній піксель або токен = вимкнено. Жодного запиту в Meta не
    // буде — той самий принцип, що з ключами пошти й Нової пошти.
    if (!pixel || !/^\d{5,}$/.test(pixel) || !String(token ?? "").trim()) return null;

    const list = (events || []).filter((event) => event && event.event_id);

    if (!list.length) return null;

    const body = {
        data: list,
        access_token: String(token).trim(),
    };

    // Код перевірки. Поки він заданий, події видно у вкладці
    // Test Events в Events Manager і вони НЕ йдуть у звіти — саме тим
    // і перевіряють, що інтеграція жива. Після перевірки секрет
    // прибирають, інакше жодна покупка не дійде до оптимізації.
    const test = String(testCode ?? "").trim();

    if (test) body.test_event_code = test;

    return {
        url: `https://graph.facebook.com/${GRAPH_VERSION}/${pixel}/events`,
        body,
    };

}

// Розбір відповіді Meta.
//
// HTTP-код сам по собі нічого не каже: Meta відповідає 200 і на
// «прийнято 0 подій». Успіх — це events_received > 0.
function capiVerdict(status, data) {

    if (data && data.error) {

        const error = data.error;

        return {
            ok: false,
            reason: `${error.type || "error"} ${error.code || ""}: ${error.message || "без опису"}`.trim(),
        };

    }

    if (status < 200 || status >= 300) {
        return { ok: false, reason: `HTTP ${status}` };
    }

    const received = Number(data?.events_received);

    if (!Number.isFinite(received) || received <= 0) {
        return { ok: false, reason: "Meta не прийняла жодної події" };
    }

    return { ok: true, received };

}


// -------------------------
// Що прислав браузер
// -------------------------

// Куки пікселя, які браузер передає нам сам.
//
// _fbp ставить піксель, _fbc — це збережений fbclid із рекламного
// переходу. Обидві різко піднімають якість збігів, і обидві — рівно
// ті рядки, які піксель уже надіслав би сам. Ми їх не вигадуємо: якщо
// піксель заблокований, їх просто немає.
//
// Формат жорсткий (fb.1.<час>.<число>), тому перевіряємо: у цьому
// полі не має проїхати нічого, крім куки Meta.
function cleanBrowserIds(payload) {

    const pick = (value) => {

        const clean = String(value ?? "").trim();

        return /^fb\.[12]\.\d{10,16}\.[\w-]{1,120}$/.test(clean) ? clean : "";

    };

    return {
        fbp: pick(payload?.fbp),
        fbc: pick(payload?.fbc),
    };

}

// Адреса сторінки, з якої прийшла подія.
//
// Приймаємо тільки власні домени: event_source_url із чужого сайту в
// звітах Meta виглядав би так, ніби магазин продає деінде.
function cleanSourceUrl(value, allowedOrigins) {

    const clean = String(value ?? "").trim();

    if (!clean) return "";

    let url;

    try {
        url = new URL(clean);
    } catch {
        return "";
    }

    const list = Array.isArray(allowedOrigins) ? allowedOrigins : [];

    return list.includes(url.origin) ? url.origin + url.pathname : "";

}


// Перевірка замовлення за номером і телефоном.
//
// НАВІЩО
// -------
// Замовити на сайті можна без реєстрації — і більшість так і робить.
// Але кабінет шукає замовлення тільки за user_id (assets/js/account.js),
// тобто гість не побачить свого замовлення НІКОЛИ. Єдине, що в нього
// лишається, — лист і Telegram магазину.
//
// Листи це закривають лише частково: пошта могла піти в спам, людина
// могла ввести її з опискою, а «де моє замовлення?» питають через
// тиждень, коли лист уже загубився. Кожне таке питання приїжджає в
// Telegram і забирає час власника на те, що сторінка може відповісти
// сама.
//
// ЧОМУ САМЕ НОМЕР + ТЕЛЕФОН
// --------------------------
// Номер замовлення сам по собі не таємниця: він у листі, у смс, його
// диктують уголос. Тому одного номера НЕ ДОСИТЬ — інакше будь-хто,
// хто підгляне номер, побачить ім'я, адресу відділення й склад
// покупки. Телефон — це те, що знає замовник і чого немає в номері.
//
// ЧОМУ ВІДПОВІДЬ ОДНАКОВА НА «НЕ ЗНАЙДЕНО» І «НЕ ТОЙ ТЕЛЕФОН»
// ------------------------------------------------------------
// Якби сторінка відповідала «замовлення є, але телефон не той», вона
// стала б перевіркою існування номерів: перебором можна було б
// дізнатись, які номери замовлень справжні, а потім підбирати до них
// телефони. Одна відповідь на два випадки нічого не підказує.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі й бази. Лише чисті функції — щоб перевірялись тестами в Node.

// Скільки позицій показуємо. Замовлення на 50 рядків буває тільки
// підроблене, але сторінка не має падати й на ньому.
const MAX_VIEW_ITEMS = 50;

// Заглушка для товарів без розмірів: сумки, годинники, окуляри,
// гаманці — тобто майже весь каталог.
//
// Це ВНУТРІШНЄ значення, і решта проєкту його ховає: у фід воно не
// потрапляє (scripts/build-feed.js), в ідентифікатор для Meta теж
// (assets/js/analytics.js). «Чорний, ONESIZE» у картці замовлення
// покупець читає як помилку в даних — і має рацію.
const NO_SIZE = "ONESIZE";

// Розмір, який видно покупцеві. Порожній, якщо розміру насправді немає.
function viewSize(value) {

    const clean = String(value ?? "").trim();

    // Регістр різний навмисно: у даних свого часу співіснували
    // ONESIZE і Onesize (див. scripts/build-products.js).
    return clean.toUpperCase() === NO_SIZE ? "" : clean;

}


// -------------------------
// Телефон
// -------------------------

// Ключ порівняння: останні 9 цифр.
//
// ЧОМУ НЕ ПОВНИЙ НОМЕР. У базі лежить те, що людина набрала в
// оформленні, а на сторінці перевірки вона набере те, що згадає —
// і це майже ніколи не той самий рядок:
//
//   +380 73 728 82 91   0737288291   380737288291   73 728 82 91
//
// Останні 9 цифр однакові в усіх чотирьох: це номер абонента без
// коду країни й міжміського нуля. Коротше брати не можна — 6-7 цифр
// почали б випадково збігатися в різних людей.
function phoneKey(value) {

    const digits = String(value ?? "").replace(/\D/g, "");

    return digits.length >= 9 ? digits.slice(-9) : "";

}

// Чи це той самий телефон.
//
// Порожній ключ не збігається ні з чим — включно з іншим порожнім.
// Інакше замовлення без телефону відкривалось би будь-кому, хто
// надіслав порожнє поле.
function phoneMatches(stored, typed) {

    const a = phoneKey(stored);
    const b = phoneKey(typed);

    return Boolean(a) && a === b;

}


// -------------------------
// Що прислала сторінка
// -------------------------

// Розбір запиту. Повертає { ok, orderNumber, phone } або { ok: false }.
//
// Номер перевіряємо тим самим правилом, що при оформленні
// (place-order.js): 4-40 символів, цифри й латиниця. Так у базу не
// поїде запит із дужками, лапками й крапками — і ми не витратимо
// звернення до бази на те, що номером бути не може.
function cleanLookup(payload) {

    const orderNumber = String(payload?.order_number ?? "").trim();

    if (!/^[0-9A-Za-z-]{4,40}$/.test(orderNumber)) {
        return { ok: false, reason: "номер не схожий на номер" };
    }

    const phone = String(payload?.phone ?? "").trim();

    if (!phoneKey(phone)) {
        return { ok: false, reason: "телефон коротший за 9 цифр" };
    }

    return { ok: true, orderNumber, phone };

}


// -------------------------
// Що показуємо покупцеві
// -------------------------

// Стан замовлення словами покупця, а не менеджера.
//
// У панелі статус «Нове» означає «менеджер ще не брав» — покупцеві це
// нічого не каже й навіть трохи ображає. Формулювання тут ті самі, що
// в кабінеті (deliveryStatusLabel у assets/js/account.js): дві різні
// назви одного стану — гірше, ніж будь-яка з них.
const LOOKUP_STATUS = {
    new: {
        label: "Очікує обробки",
        note: "Замовлення отримано. Ми зв'яжемось із вами, щоб підтвердити деталі.",
    },
    processing: {
        label: "Готується до відправлення",
        note: "Замовлення прийнято в роботу й пакується.",
    },
    shipped: {
        label: "Передано в доставку",
        note: "Замовлення в дорозі. Відстежити його можна за номером накладної.",
    },
    completed: {
        label: "Доставлено",
        note: "Замовлення виконано. Дякуємо за покупку!",
    },
    cancelled: {
        label: "Скасовано",
        note: "Замовлення скасовано. Якщо це помилка — напишіть нам, ми все виправимо.",
    },
};

// Статуси першої версії бота — щоб старе замовлення не виглядало
// зламаним. Той самий перелік, що LEGACY_STATUSES у format.js.
const LOOKUP_LEGACY = {
    taken: "processing",
    confirmed: "processing",
};

function lookupStatus(status) {

    const key = String(status ?? "").trim().toLowerCase();

    const real = LOOKUP_LEGACY[key] || key;

    return LOOKUP_STATUS[real] ? { key: real, ...LOOKUP_STATUS[real] } : { key: "new", ...LOOKUP_STATUS.new };

}

// Рядок доставки: спосіб, місто, відділення — одним текстом.
function deliveryLine(order) {

    return [order?.delivery_method, order?.delivery_city, order?.delivery_detail]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .join(", ");

}

// БІЛИЙ СПИСОК того, що віддаємо сторінці.
//
// ЧОМУ САМЕ БІЛИЙ СПИСОК, А НЕ «ПРИБРАТИ ЗАЙВЕ». Функція читає
// замовлення службовим ключем, тобто бачить рядок цілком: пошту,
// user_id, службові позначки перевірки ціни, дату відмови. Якби тут
// стояло «віддати все, крім кількох полів», то будь-яка НОВА колонка
// в таблиці автоматично поїхала б у браузер — і ніхто б цього не
// помітив, бо сторінка її просто не показала б.
//
// Телефон і пошту не віддаємо навмисно: той, хто відкриває сторінку,
// їх і так знає (без телефону він сюди не потрапив), а от підказувати
// пошту на випадок, якщо телефон вгадали, — ні до чого.
function publicOrderView(order) {

    if (!order) return null;

    const state = lookupStatus(order.status);

    const items = (Array.isArray(order.items) ? order.items : [])
        .slice(0, MAX_VIEW_ITEMS)
        .map((item) => ({
            title: String(item?.title ?? ""),
            brand: String(item?.brand ?? ""),
            image: String(item?.image ?? ""),
            color: item?.color ? String(item.color) : null,
            size: viewSize(item?.size) || null,
            qty: Math.max(Math.trunc(Number(item?.qty) || 1), 1),
            price: Number(item?.price) || 0,
        }));

    return {
        order_number: String(order.order_number ?? ""),
        created_at: order.created_at ?? null,

        status: state.key,
        status_label: state.label,
        status_note: state.note,

        items,

        subtotal: Number(order.subtotal) || 0,
        discount: Number(order.discount) || 0,
        total: Number(order.total) || 0,

        // Доставку магазин не бере — покупець платить перевізнику при
        // отриманні (див. tests/test-delivery.js). Тому суми доставки
        // тут немає взагалі: нуль читався б як «безкоштовно».
        delivery: deliveryLine(order),
        payment_method: String(order.payment_method ?? ""),

        tracking_number: order.tracking_number ? String(order.tracking_number) : null,

        // Позначка «є заявка на відмову» — щоб людина не надсилала її
        // вдруге, не дочекавшись відповіді.
        refusal_requested: Boolean(order.refusal_requested_at),
    };

}


// Відгуки: перевірка й картка для модерації.
//
// НАВІЩО ПЕРЕВІРКА ПОКУПКИ
// -------------------------
// Форма відгуку без перевірки — запрошення для конкурентів і ботів.
// Тому відгук приймається лише разом із номером замовлення й
// телефоном, і сервер звіряє три речі:
//
//   1. замовлення з таким номером існує;
//   2. телефон збігається з тим, що в замовленні;
//   3. цей товар справді є в його складі.
//
// Третя перевірка не менш важлива за другу: без неї той, хто купив
// гаманець, міг би написати відгук про будь-яку сумку з каталогу.
//
// ЧОМУ НА СЕРВЕРІ
// ----------------
// У браузері будь-яка така перевірка нічого не варта: код сторінки
// відкритий, і запит можна надіслати без сторінки взагалі. Тому
// таблиця відгуків закрита від браузера повністю (RLS без політик), а
// пише в неї функція службовим ключем — після перевірки.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі й бази. Лише чисті функції — щоб перевірялись тестами в Node.

// Межі тексту. Не обмеження магазину, а стеля здорового глузду: відгук
// на дві тисячі знаків читає лише той, хто його написав.
const REVIEW_LIMITS = {
    author: 80,
    body: 2000,
    orderNumber: 40,
};

// Скільки знаків тексту досить, щоб це був відгук, а не «ок».
//
// Не заборона, а фільтр очевидного сміття: «+», «норм», «1» не кажуть
// нічого ні наступному покупцеві, ні Google.
const MIN_BODY = 10;


// -------------------------
// Телефон
// -------------------------

// Ключ порівняння — останні 9 цифр.
//
// Те саме правило, що на сторінці «Де моє замовлення»
// (phoneKey в order-lookup.js), і з тієї самої причини: у базі лежить
// те, що людина набрала при оформленні, а тут вона набере те, що
// згадає.
//
// Назва інша навмисно: у зібраному файлі всі модули лежать поруч, і
// дві функції з однією назвою тихо перекрили б одна одну.
function reviewPhoneKey(value) {

    const digits = String(value ?? "").replace(/\D/g, "");

    return digits.length >= 9 ? digits.slice(-9) : "";

}

function reviewPhoneMatches(stored, typed) {

    const a = reviewPhoneKey(stored);
    const b = reviewPhoneKey(typed);

    return Boolean(a) && a === b;

}


// -------------------------
// Що прислала сторінка
// -------------------------

// Розбір і чистка. Повертає { ok: true, review } або { ok: false, reason }.
//
// reason іде в логи функції, а не покупцеві: йому досить «не вдалося
// зберегти відгук».
function cleanReview(payload) {

    if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "порожній запит" };
    }

    const productId = Number(payload.product_id);

    if (!Number.isFinite(productId) || productId <= 0) {
        return { ok: false, reason: "немає товару" };
    }

    const orderNumber = String(payload.order_number ?? "").trim();

    // Те саме правило, що при оформленні (place-order.js) і при
    // перевірці замовлення: цифри й латиниця, 4-40 символів.
    if (!/^[0-9A-Za-z-]{4,40}$/.test(orderNumber)) {
        return { ok: false, reason: "номер не схожий на номер" };
    }

    const phone = String(payload.phone ?? "").trim();

    if (!reviewPhoneKey(phone)) {
        return { ok: false, reason: "телефон коротший за 9 цифр" };
    }

    const rating = Number(payload.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return { ok: false, reason: "оцінка поза межами 1-5" };
    }

    const author = String(payload.author ?? "").trim().slice(0, REVIEW_LIMITS.author);

    if (!author) {
        return { ok: false, reason: "немає імені" };
    }

    const body = String(payload.body ?? "").trim().slice(0, REVIEW_LIMITS.body);

    if (body.length < MIN_BODY) {
        return { ok: false, reason: "текст коротший за мінімум" };
    }

    return {
        ok: true,
        review: { productId, orderNumber, phone, rating, author, body },
    };

}

// Чи є цей товар у складі замовлення.
//
// БЕЗ ЦІЄЇ ПЕРЕВІРКИ той, хто купив гаманець за 3 800, міг би написати
// відгук про сумку за 15 000 — номер і телефон у нього справжні.
//
// Порівнюємо за id. У складі замовлення він може лежати числом або
// рядком (знімок кладе браузер), тож зводимо обидва до числа.
function orderHasProduct(order, productId) {

    const items = Array.isArray(order?.items) ? order.items : [];

    const want = Number(productId);

    return items.some(item => Number(item?.id) === want);

}


// -------------------------
// Картка для модерації
// -------------------------

// Зірки словом і значком: у Telegram «4/5» читається гірше за «★★★★☆».
function stars(rating) {

    const value = Math.min(Math.max(Math.trunc(Number(rating) || 0), 0), 5);

    return "★".repeat(value) + "☆".repeat(5 - value);

}

// Назва навмисно не escapeHtml(): у зібраному файлі всі модулі лежать
// поруч, і така функція там уже є (format.js). Дві функції з однією
// назвою тихо перекрили б одна одну — саме це й ловить
// tests/test-no-function-collisions.js.
function escapeReview(text) {

    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

// Повідомлення власнику про новий відгук.
//
// Показуємо все, що потрібно для рішення: товар, оцінку, текст і те,
// за яким замовленням він написаний. Останнє важливе: якщо відгук
// виглядає дивно, номер дає змогу подивитись саму покупку.
function reviewCard(review, productTitle) {

    const lines = [
        `💬 <b>Новий відгук</b> ${stars(review.rating)}`,
        "",
        productTitle ? `<b>${escapeReview(productTitle)}</b>` : `Товар #${review.productId}`,
        "",
        escapeReview(review.body),
        "",
        `👤 ${escapeReview(review.author)}`,
        `🧾 замовлення <code>${escapeReview(review.orderNumber)}</code>`,
    ];

    return lines.join("\n");

}

// Кнопки під карткою.
//
// Дві дії й нічого більше: показати або відхилити. Відгук лежить
// невідмодерованим, поки власник не натиснув, — і це навмисно: відгук,
// який з'являється на сайті сам, рано чи пізно принесе або спам, або
// чужу лайку.
function reviewKeyboard(id) {

    return {
        inline_keyboard: [[
            { text: "✅ Показати на сайті", callback_data: `rev:${id}:pub` },
            { text: "🚫 Відхилити", callback_data: `rev:${id}:rej` },
        ]],
    };

}

// Розбір натискання. Повертає { id, status } або null.
function parseReviewAction(data) {

    const match = String(data ?? "").match(/^rev:(\d+):(pub|rej)$/);

    if (!match) return null;

    return {
        id: Number(match[1]),
        status: match[2] === "pub" ? "published" : "rejected",
    };

}

// Що показати власнику після натискання — замість кнопок.
function reviewVerdictLine(status) {

    return status === "published"
        ? "✅ Відгук показано на сайті"
        : "🚫 Відгук відхилено";

}


// Підписка на листи магазину.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// На кожній сторінці вантажився universal.js MailerLite — 52 КБ і
// з'єднання зі стороннім доменом. І не було ЖОДНОЇ форми підписки:
// акаунт підключений, скрипт їде, користі нуль. У CSS навіть лежав
// мертвий клас newsletter-form — колись збирались.
//
// ЧОМУ БЕЗ ЇХНЬОГО СКРИПТА
// -------------------------
// Бо він не потрібен. Додати людину в список можна одним запитом до
// їхнього API — а це означає:
//
//   • мінус 52 КБ і мінус одне стороннє з'єднання на КОЖНІЙ сторінці;
//   • ключ живе в секретах, а не в коді сайту;
//   • MailerLite не бачить відвідувачів, які нічого не підписували.
//
// ЧОМУ ЧЕРЕЗ НАШУ ФУНКЦІЮ, А НЕ З БРАУЗЕРА
// -----------------------------------------
// Ключ API MailerLite дає право читати й правити весь список
// підписників. У коді сайту йому місця немає — так само, як ключу
// Нової пошти й токену Meta.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі. Лише чисті функції — щоб перевірялись тестами в Node.

// Скільки знаків приймаємо. Не обмеження, а стеля здорового глузду.
const SUBSCRIBE_LIMITS = {
    email: 160,
    name: 80,
};


// -------------------------
// Що прислала сторінка
// -------------------------

// Пошта в тому вигляді, у якому її приймає MailerLite: обрізана, у
// нижньому регістрі.
//
// Перевірка навмисно проста. Складна регулярка для пошти — класична
// пастка: вона відкидає справжні адреси (з апострофом, з новими
// доменами) і все одно не доводить, що скринька існує. Це доводить
// лист підтвердження, а не регулярка.
function cleanEmail(value) {

    const clean = String(value ?? "").trim().toLowerCase().slice(0, SUBSCRIBE_LIMITS.email);

    return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(clean) ? clean : "";

}

function cleanSubscriber(payload) {

    if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "порожній запит" };
    }

    const email = cleanEmail(payload.email);

    if (!email) {
        return { ok: false, reason: "не схоже на пошту" };
    }

    // ЗГОДА ОБОВ'ЯЗКОВА. Це не формальність: додати людину в
    // рекламну розсилку без її згоди — те саме, що спам, і за це
    // MailerLite блокує акаунти.
    if (payload.consent !== true) {
        return { ok: false, reason: "немає згоди" };
    }

    const name = String(payload.name ?? "").trim().slice(0, SUBSCRIBE_LIMITS.name);

    return { ok: true, subscriber: { email, name } };

}


// -------------------------
// Запит до MailerLite
// -------------------------

// Куди і що надсилати. null означає «вимкнено».
//
// groupId необов'язковий: без нього людина йде в загальний список.
// З ним — в окрему групу, і тоді можна відрізнити тих, хто підписався
// на сайті, від тих, кого додали інакше.
function subscribeRequest(apiKey, subscriber, groupId) {

    const key = String(apiKey ?? "").trim();

    // Порожній ключ = функція вимкнена. Той самий принцип, що з
    // ключами пошти, Нової пошти й Meta.
    if (!key || !subscriber || !subscriber.email) return null;

    const body = {
        email: subscriber.email,
        // MailerLite сам надсилає лист підтвердження, якщо в акаунті
        // увімкнено double opt-in. Статус «unconfirmed» — саме те, що
        // потрібно: людина мусить підтвердити, і аж тоді потрапляє в
        // розсилку.
        status: "unconfirmed",
    };

    if (subscriber.name) body.fields = { name: subscriber.name };

    const group = String(groupId ?? "").trim();

    if (group) body.groups = [group];

    return {
        url: "https://connect.mailerlite.com/api/subscribers",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${key}`,
        },
        body,
    };

}

// Стан підписки з тіла відповіді.
//
// MailerLite кладе запис у data.data, але буває віддає й плоско —
// тому дивимось в обидва місця. Можливі значення: active,
// unsubscribed, unconfirmed, bounced, junk.
function subscriberStatus(data) {

    const row = (data && typeof data === "object")
        ? (data.data && typeof data.data === "object" ? data.data : data)
        : null;

    return String((row && row.status) || "").trim().toLowerCase();

}

// Розбір відповіді.
//
// РІЗНИЦЯ МІЖ 200 І 201 — ГОЛОВНЕ ТУТ.
//
// Документація MailerLite (POST /api/subscribers) каже прямо:
//
//   201 Created — підписника СТВОРЕНО;
//   200 OK      — пошта ВЖЕ БУЛА в списку.
//
// Раніше обидва коди вважались просто успіхом, і той, хто
// підписався пів року тому, знову читав «перевірте пошту, там
// лист» — листа при цьому не було. Тепер стан повертається окремим
// полем, і сторінка каже правду.
//
// state:
//   new         — щойно додали, лист підтвердження в дорозі;
//   active      — уже підписаний і підтверджений, листи отримує;
//   unconfirmed — у списку є, але підтвердження не натиснуто, і
//                 саме тому листів немає (найчастіша причина
//                 «я ж підписувався»);
//   again       — був у списку, але листів не отримував
//                 (відписався / пошта відбивала); наш запит просить
//                 status:"unconfirmed", тож підтвердження піде знову;
//   already     — пошта в списку, стан невідомий.
function subscribeVerdict(status, data) {

    if (status === 201) return { ok: true, state: "new" };

    if (status === 200) {

        const state = subscriberStatus(data);

        if (state === "active") return { ok: true, already: true, state: "active" };

        if (state === "unconfirmed") return { ok: true, already: true, state: "unconfirmed" };

        if (state) return { ok: true, already: true, state: "again" };

        return { ok: true, already: true, state: "already" };

    }

    if (status === 422) {

        // 422 приходить, коли пошта не пройшла їхню перевірку. Деякі
        // відповіді при цьому кажуть «already»/«taken» — для людини,
        // яка натиснула кнопку, це не помилка: вона в списку.
        // Стану підписки тут немає, тож і не вигадуємо його.
        const message = JSON.stringify(data ?? "").toLowerCase();

        if (message.includes("already") || message.includes("taken")) {
            return { ok: true, already: true, state: "already" };
        }

        return { ok: false, reason: "пошту не прийнято" };

    }

    if (status === 401 || status === 403) return { ok: false, reason: "ключ MailerLite недійсний" };

    if (status === 429) return { ok: false, reason: "забагато запитів до MailerLite" };

    return { ok: false, reason: `HTTP ${status}` };

}


// Незавершене оформлення: перевірка того, що прийшло з браузера.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Тут немає ні мережі, ні бази — чисті функції, які можна прогнати
// тестами в Node (той самий підхід, що в order-flow.js і subscribe.js).
//
// ЩО САМЕ ЗБЕРІГАЄМО
// -------------------
// Пошту й посилання на товари: [{product_id, color, size, qty}].
// Ні імені, ні телефону, ні адреси доставки — для листа «ви не
// завершили замовлення» вони не потрібні, а зберігати те, що не
// потрібне, не варто.
//
// ЧОМУ МЕЖІ ТАКІ ЖОРСТКІ
// -----------------------
// Це відкритий маршрут: викликати його може будь-хто з публічним
// ключем. Він мусить приймати рівно те, що надсилає наша сторінка
// оформлення, і нічого крім.

// Кошик із 40 позицій — це вже не кошик, а спроба щось зламати.
const MAX_DRAFT_ITEMS = 40;

// Стільки ж, скільки дозволяє сторінка товару (MAX_QTY у order-flow.js).
const MAX_DRAFT_QTY = 10;

const EMAIL_LIMIT = 160;
const TEXT_LIMIT = 60;

function draftEmail(value) {

    const email = String(value ?? "").trim().toLowerCase();

    if (!email || email.length > EMAIL_LIMIT) return "";

    // Та сама перевірка, що на сторінці оформлення: щось@щось.щось.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";

    return email;

}

function draftText(value) {

    return String(value ?? "").trim().slice(0, TEXT_LIMIT);

}

// Позиція кошика → те, що ляже в базу.
//
// id приймаємо і як product_id, і як id: у кошику на сайті поле
// зветься id, а в базі — product_id (так само в cart_items).
function draftItem(row) {

    if (!row || typeof row !== "object") return null;

    const id = Number(row.product_id ?? row.id);

    if (!Number.isFinite(id) || id <= 0) return null;

    const qty = Math.min(Math.max(Math.round(Number(row.qty) || 1), 1), MAX_DRAFT_QTY);

    return {
        product_id: id,
        color: draftText(row.color),
        size: draftText(row.size),
        qty,
    };

}

// Уся посилка → { ok, draft } або { ok: false, reason }.
function cleanDraft(body) {

    const email = draftEmail(body && body.email);

    if (!email) return { ok: false, reason: "пошта не схожа на пошту" };

    const rows = Array.isArray(body && body.items) ? body.items : [];

    if (!rows.length) return { ok: false, reason: "порожній кошик" };

    if (rows.length > MAX_DRAFT_ITEMS) return { ok: false, reason: "надто багато позицій" };

    const items = rows.map(draftItem).filter(Boolean);

    if (!items.length) return { ok: false, reason: "жодної придатної позиції" };

    return { ok: true, draft: { email, items } };

}


// ======================================
// Панель «Відгуки» в адмінці — чиста логіка.
//
// НАВІЩО ЦЕ ВЗАГАЛІ
// ------------------
// Відгуки модерувались лише кнопками під карткою в Telegram. Це
// працює першого дня й перестає далі:
//
//   • відгук прийшов, коли телефон був не під рукою — картка з
//     кнопками поїхала вгору чату й губиться серед замовлень;
//   • подивитись усі нові = гортати чат назад;
//   • подивитись, що вже опубліковано = ніяк, такого списку не було
//     ніде;
//   • відповісти покупцеві під відгуком (колонка reply, яку сайт
//     показує) = ніяк, у бота такої кнопки немає;
//   • передати модерацію колезі = дати доступ до свого чату з ботом.
//
// Бот НЕ прибирається: сповіщення про новий відгук так само приходить
// у Telegram і кнопки під карткою так само працюють. Це другий
// спосіб, а не заміна — рівно як із замовленнями (admin-api.js).
//
// ЧОМУ ЦЕ НЕ РОБИТЬ САМА АДМІНКА (Decap)
// ---------------------------------------
// Decap працює з файлами репозиторію, а відгуки лежать у Supabase —
// колекцією CMS їх не зробити. Плюс таблиця закрита RLS без політик:
// прочитати невідмодеровані може лише service-ключ, а такий є в одного
// коду — цієї Edge Function.
//
// ЧОМУ РІШЕННЯ СИНХРОНІЗУЄТЬСЯ З ЧАТОМ
// -------------------------------------
// Відхиливши відгук у панелі, власник лишив би в чаті картку з живими
// кнопками. Натиснувши котрусь через тиждень, він МОВЧКИ скасував би
// своє ж рішення. Тому бот запам'ятовує повідомлення з карткою
// (міграція 022), а панель його перемальовує — так само, як це робить
// натискання кнопки.
//
// ЩО В ЦЬОМУ ФАЙЛІ
// -----------------
// Тільки чиста логіка: розбір і перевірка запиту, побудова запиту до
// PostgREST, проєкція рядка бази у те, що бачить браузер. Без мережі
// й без бази — щоб усе це ганяли тести в Node.
// ======================================

// Статуси відгуку. Ті самі три, що в check-обмеженні таблиці
// (019-reviews.sql): розійдуться — база відкине запис, а панель
// покаже незрозумілу помилку.
// label — підпис ВКЛАДКИ (про кілька відгуків), badge — підпис
// значка на картці (про один). Спершу значок показував label, і над
// одним відгуком стояло «Опубліковані».
const REVIEW_STATUSES = {
    new: { label: "Нові", badge: "Новий", verb: "На модерацію" },
    published: { label: "Опубліковані", badge: "Опублікований", verb: "Показати на сайті" },
    rejected: { label: "Відхилені", badge: "Відхилений", verb: "Відхилити" },
};

// Порядок вкладок у панелі. Тримається тут, а не в браузері, щоб не
// правити у двох місцях.
const REVIEW_STATUS_ORDER = ["new", "published", "rejected"];

const REVIEW_ADMIN_ACTIONS = [
    "reviews-list",
    "review-status",
    "review-reply",
];

const REVIEW_LIMIT_DEFAULT = 25;
const REVIEW_LIMIT_MAX = 100;

// Скільки знаків приймаємо у відповіді магазину. Не обмеження, а
// стеля здорового глузду: відповідь під відгуком — це кілька рядків.
const REPLY_MAX_LENGTH = 1000;

// Чи це запит панелі відгуків, а не замовлень. Обидві живуть в одному
// полі admin_action, і розібрати їх треба ДО перевірки на «невідома
// дія» — інакше панель замовлень відкидала б запити відгуків.
function isReviewAction(action) {

    return REVIEW_ADMIN_ACTIONS.includes(String(action ?? "").trim());

}

// Колонки, які панель бачить.
//
// Тут НЕ білий список для покупця, а перелік для власника: до нього
// навмисно входить order_number — за ним видно, про яку покупку йде
// мова, коли відгук виглядає дивно.
//
// Телефона тут немає й бути не повинно: у відгуку він не зберігається
// зовсім (див. add_review), його звіряють на льоту з замовленням.
const REVIEW_COLUMNS = [
    "id",
    "product_id",
    "order_number",
    "author",
    "rating",
    "body",
    "reply",
    "status",
    "created_at",
    "moderated_at",
    "moderated_by",
];

// НАЗВИ ТУТ ВЛАСНІ, А НЕ ЗАГАЛЬНІ.
//
// Збірка зливає всі модули в ОДИН файл, тож clampLimit і listFilters
// перекрили б однойменні з admin-api.js. Перший раз саме так і
// сталось: мій listFilters не знав про params.refusal, і кількість
// замовлень із заявкою на відмову стала кількістю всіх замовлень.
// Зловив це тест панелі замовлень, а не збірка — вона таке
// перекриття вважає нормальним JS.
function clampReviewLimit(value) {

    const number = Math.trunc(Number(value));

    if (!Number.isFinite(number) || number < 1) return REVIEW_LIMIT_DEFAULT;

    return Math.min(number, REVIEW_LIMIT_MAX);
}

function reviewFilters(params) {

    const parts = [];

    if (params.status) parts.push(`status=eq.${params.status}`);

    return parts;

}

function buildReviewListQuery(params = {}) {

    const parts = [
        `select=${REVIEW_COLUMNS.join(",")}`,
        // Найновіші першими: модерують саме їх.
        "order=created_at.desc",
        ...reviewFilters(params),
        `limit=${clampReviewLimit(params.limit)}`,
        `offset=${Math.max(0, Math.trunc(Number(params.offset) || 0))}`,
    ];

    return `reviews?${parts.join("&")}`;

}

// Скільки відгуків у кожній вкладці. Рядки не потрібні — лише число з
// Content-Range, тож просимо одну колонку й один рядок.
function buildReviewCountQuery(status) {

    const parts = ["select=id", "limit=1"];

    if (status) parts.splice(1, 0, `status=eq.${status}`);

    return `reviews?${parts.join("&")}`;

}

// id відгуку — bigserial, тобто самі цифри. Перевіряємо не «для
// порядку»: id підставляється в адресу запиту до бази, і довільний
// рядок там означав би можливість дописати свій фільтр.
function parseReviewId(value) {

    const raw = String(value ?? "").trim();

    return /^\d{1,18}$/.test(raw) ? raw : null;

}

// Відповідь магазину. Порожній рядок — це «прибрати відповідь», тож
// він допустимий і означає null у базі.
function cleanReply(value) {

    const raw = String(value ?? "")
        // Керівні символи прибираємо, переноси рядків лишаємо: у
        // відповіді на кілька абзаців вони доречні.
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .trim();

    if (!raw) return { ok: true, reply: null };

    if (raw.length > REPLY_MAX_LENGTH) {
        return { ok: false, error: `Відповідь довша за ${REPLY_MAX_LENGTH} знаків.` };
    }

    return { ok: true, reply: raw };

}

function parseReviewAdminRequest(body) {

    const action = String(body?.admin_action ?? "").trim();

    if (!REVIEW_ADMIN_ACTIONS.includes(action)) {
        return { ok: false, error: `Невідома дія: ${action || "(порожня)"}` };
    }

    if (action === "reviews-list") {

        const status = String(body.status ?? "").trim();

        if (status && !REVIEW_STATUSES[status]) {
            return { ok: false, error: `Невідомий статус: ${status}` };
        }

        return {
            ok: true,
            action,
            params: {
                status,
                limit: clampReviewLimit(body.limit),
                offset: Math.max(0, Math.trunc(Number(body.offset) || 0)),
            },
        };

    }

    const id = parseReviewId(body.id);

    if (!id) return { ok: false, error: "Не вказано відгук" };

    if (action === "review-status") {

        const status = String(body.status ?? "").trim();

        if (!REVIEW_STATUSES[status]) {
            return { ok: false, error: `Невідомий статус: ${status || "(порожній)"}` };
        }

        // «Повернути на модерацію» сенсу не має: покупець уже побачив
        // рішення (опублікований відгук видно на сторінці), а зірки
        // порахувала збірка. Дозволяємо лише два справжні рішення.
        if (status === "new") {
            return { ok: false, error: "Повернути відгук на модерацію не можна — виберіть «Показати» або «Відхилити»." };
        }

        return { ok: true, action, params: { id, status } };

    }

    // review-reply
    const checked = cleanReply(body.reply);

    if (!checked.ok) return { ok: false, error: checked.error };

    return { ok: true, action, params: { id, reply: checked.reply } };

}

// Рядок бази → те, що бачить браузер.
//
// Проєкція окрема від REVIEW_COLUMNS навмисно: колонки можуть
// додаватись у базу (owner_message_id із міграції 022), а в панель
// їхати не мусять.
function reviewView(row) {

    if (!row) return null;

    const status = REVIEW_STATUSES[row.status] ? row.status : "new";

    return {
        id: String(row.id),
        productId: row.product_id === null || row.product_id === undefined
            ? null
            : Number(row.product_id),
        orderNumber: String(row.order_number ?? ""),
        author: String(row.author ?? ""),
        rating: Number(row.rating) || 0,
        body: String(row.body ?? ""),
        reply: row.reply ? String(row.reply) : "",
        status,
        statusLabel: REVIEW_STATUSES[status].label,
        statusBadge: REVIEW_STATUSES[status].badge,
        createdAt: row.created_at ?? null,
        moderatedAt: row.moderated_at ?? null,
        moderatedBy: row.moderated_by ? String(row.moderated_by) : "",
    };

}

function reviewListResponse({ reviews, total, counts }) {

    return {
        ok: true,
        reviews: (Array.isArray(reviews) ? reviews : []).map(reviewView),
        total: typeof total === "number" ? total : null,
        counts: counts ?? {},
        statuses: REVIEW_STATUS_ORDER.map(key => ({
            key,
            label: REVIEW_STATUSES[key].label,
        })),
    };

}

// ======================================
// Telegram-бот для заявок BestBrnd4u
//
// Одна функція обробляє ДВА види запитів:
//
//   1. Database Webhook від Supabase — коли в таблицю orders
//      додається новий рядок. Надсилає власнику картку замовлення
//      в Telegram з кнопками зміни статусу.
//
//   2. Webhook від самого Telegram — коли власник тиснe кнопку
//      під повідомленням. Оновлює статус замовлення в базі й
//      перемальовує повідомлення.
//
// Чому одна функція, а не дві: менше рухомих частин при
// розгортанні — один деплой, один набір секретів, один URL.
// Тип запиту визначається за формою тіла (див. нижче).
//
// ВАЖЛИВО ПРО БЕЗПЕКУ: токен бота живе ЛИШЕ в секретах Supabase
// (Edge Function secrets), ніколи — у коді сайту. Якби він
// потрапив у фронтенд, будь-хто зміг би писати від імені бота
// й читати листування.
// ======================================

// Чиста логіка (форматування картки, кнопки) винесена окремо —
// щоб її можна було запускати й тестувати в Node без Deno.









// Панель «Відгуки» в адмінці — другий спосіб модерації поруч із
// кнопками в Telegram (пояснення — у review-admin.js).



const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

// секрет, яким Supabase підписує Database Webhook (заголовок x-hook-secret)
const HOOK_SECRET = Deno.env.get("HOOK_SECRET") ?? "";

// секрет, яким Telegram підписує свої запити (задається в setWebhook)
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

// ці дві змінні Supabase підставляє в Edge Functions автоматично
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Адреса сайту — з неї бот бере каталог і будує посилання на товар.
// Можна перевизначити секретом SITE_URL, якщо домен зміниться.
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://bestbrnd4u.github.io").replace(/\/$/, "");

// Репозиторій сайту — за правами на нього визначається, кому можна
// керувати замовленнями з панелі адмінки (див. verifyAdmin).
// Перевизначається секретом ADMIN_REPO, якщо репозиторій переїде.
const ADMIN_REPO = Deno.env.get("ADMIN_REPO") ?? "bestbrnd4u/bestbrnd4u.github.io";

// Секретний ключ Cloudflare Turnstile — ним підтверджується, що
// перевірку «ви людина» справді пройшли. Порожній = перевірки немає, і
// маршрут замовлення з сайту відповідає «не налаштовано»: сторінка
// тоді кладе замовлення в базу сама, як робила досі.
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") ?? "";

// Листи покупцеві. Порожні ключі = листів немає, і функція про це
// мовчить: магазин без листів працює, як працював досі.
//
// Обидва сервіси безкоштовні в обсягах, яких магазину вистачає з
// запасом; різниця в тому, що Resend вимагає підтвердженого домену, а
// Brevo дозволяє почати з однієї підтвердженої адреси. Достатньо
// одного ключа — який знайдеться, той і використовується.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";

// Від кого. Приймає і «BestBrnd4u <noreply@bestbrnd4u.com>», і просту
// адресу. Адреса мусить бути підтверджена в сервісі — інакше лист не
// піде, і це не полагодиш кодом.
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "";

// Куди приходить відповідь покупця. Не задано — беремо адресу
// магазину з mail.js (та сама, що в підвалі листа): слати з noreply@,
// на яку ніхто не читає, і не дати куди відповісти — гірше, ніж не
// слати зовсім.
const MAIL_REPLY_TO = Deno.env.get("MAIL_REPLY_TO") ?? "";

// Ключ API Нової пошти — для довідника міст і відділень на сторінці
// оформлення. Порожній = підказок немає, поля лишаються звичайними
// текстовими, як були.
//
// ⚠️ Цей ключ дає право створювати накладні на вашому рахунку, тому
// він і живе тут, а не в коді сайту.
const NOVAPOSHTA_API_KEY = Deno.env.get("NOVAPOSHTA_API_KEY") ?? "";

// Токен Conversions API — серверні конверсії Meta.
//
// ЦЕ СЕКРЕТ. Він дає право писати конверсії в рекламний акаунт
// магазину: чужими руками туди можна залити вигадані покупки й
// зіпсувати оптимізацію реклами. У коді сайту йому місця немає — на
// відміну від ідентифікатора пікселя, який публічний за задумом.
//
// Порожній = вимкнено. Жодного запиту в Meta не буде.
const META_CAPI_TOKEN = Deno.env.get("META_CAPI_TOKEN") ?? "";

// Код перевірки з Events Manager → Test Events.
//
// Поки він заданий, події видно у вкладці перевірки й вони НЕ йдуть у
// звіти — саме так переконуються, що інтеграція жива. Після перевірки
// секрет прибирають, інакше жодна покупка не дійде до оптимізації.
const META_CAPI_TEST_CODE = Deno.env.get("META_CAPI_TEST_CODE") ?? "";

// Ключ MailerLite — для підписки на листи магазину.
//
// ЦЕ СЕКРЕТ. Він дає право читати й правити ВЕСЬ список підписників,
// тому в коді сайту йому місця немає — так само, як ключу Нової пошти
// й токену Meta.
//
// Порожній = форма підписки відповідає, що зараз не працює, і нічого
// не надсилає.
const MAILERLITE_API_KEY = Deno.env.get("MAILERLITE_API_KEY") ?? "";

// Група, у яку складати тих, хто підписався на сайті.
//
// Необов'язкова. Без неї люди йдуть у загальний список; із нею видно,
// хто прийшов саме з сайту, а не з іншого джерела.
const MAILERLITE_GROUP_ID = Deno.env.get("MAILERLITE_GROUP_ID") ?? "";

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// -------------------------
// Фонова робота
//
// Telegram чекає від webhook лише швидкий 200 — сам результат йому не
// потрібен. Якщо тримати його з'єднання, поки ми ходимо в api.telegram.org
// і в базу, він рано чи пізно відвалиться з "Read timeout expired" і почне
// ретраїти той самий апдейт — тобто одне натискання кнопки може
// оброблятись кілька разів.
//
// Тому відповідаємо одразу, а роботу доробляємо у фоні. EdgeRuntime
// .waitUntil() тримає ізолят живим до завершення обіцянки; якщо його
// немає (локальний запуск, інша версія рантайму) — просто чекаємо, це
// теж коректно, лише повільніше.
// -------------------------

function background(work: Promise<unknown>) {

  const runtime = (globalThis as any).EdgeRuntime;

  if (runtime && typeof runtime.waitUntil === "function") {

    runtime.waitUntil(work.catch((error: unknown) => console.error(error)));

    return Promise.resolve();

  }

  return work.catch((error: unknown) => console.error(error));

}

// -------------------------
// Telegram API
// -------------------------

async function telegram(method: string, payload: unknown) {

  const response = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!data.ok) {
    console.error(`Telegram ${method} error:`, data.description);
  }

  return data;

}

// -------------------------
// Supabase (service role — оминає RLS, бо це серверний код)
// -------------------------

async function updateOrderStatus(orderId: string, status: string) {

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status }),
    },
  );

  if (!response.ok) {
    console.error("Не вдалося оновити статус:", await response.text());
    return null;
  }

  const rows = await response.json();

  return Array.isArray(rows) ? rows[0] ?? null : null;

}

// -------------------------
// Каталог товарів
//
// Беремо той самий data/products.json, що й сайт — окремої копії
// товарів для бота не існує, тож розійтися вони не можуть.
//
// Кеш у пам'яті на 5 хвилин: за одне натискання посилання з
// Instagram може прийти кілька апдейтів, і тягнути весь каталог
// щоразу — марно. Ізолят живе недовго, тож кеш сам собою свіжий.
// -------------------------

let catalogCache: { at: number; items: Record<string, any>[] } | null = null;

const CATALOG_TTL_MS = 5 * 60 * 1000;

async function loadCatalog(): Promise<Record<string, any>[]> {

  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.items;
  }

  try {

    const response = await fetch(`${SITE_URL}/data/products.json`);

    if (!response.ok) return catalogCache?.items ?? [];

    const items = await response.json();

    if (!Array.isArray(items)) return catalogCache?.items ?? [];

    catalogCache = { at: Date.now(), items };

    return items;

  } catch (error) {

    console.error("Не вдалося завантажити каталог:", error);

    // якщо мережа підвела — краще віддати підстаркуватий кеш,
    // ніж сказати клієнтові «товар не знайдено»
    return catalogCache?.items ?? [];

  }

}

// -------------------------
// Чернетка замовлення (таблиця bot_sessions)
//
// Між натисканнями кнопок бот має пам'ятати вибір клієнта. У самій
// кнопці це не збережеш (Telegram обмежує callback_data 64 байтами),
// а Edge Function між запитами нічого не тримає — тож стан живе в базі.
// -------------------------

async function supabaseRest(path: string, init: RequestInit = {}) {

  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...(init.headers ?? {}),
    },
  });

}

async function getSession(chatId: number) {

  const response = await supabaseRest(`bot_sessions?chat_id=eq.${chatId}&select=*`);

  if (!response.ok) return null;

  const rows = await response.json();

  return Array.isArray(rows) ? rows[0] ?? null : null;

}

// Колонки таблиці bot_sessions. Пишемо СУВОРО їх.
//
// Раніше сюди потрапляло будь-яке поле з чернетки — і варто було
// додати в об'єкт щось службове (як delivery_id), як запит падав з
// «column does not exist». Помилка була мовчазною: діалог просто
// зупинявся посеред оформлення, бо крок не встигав зберегтися.
const SESSION_COLUMNS = [
  "step", "product_id", "color", "size", "qty",
  "delivery_method", "delivery_price", "city", "delivery_detail",
  "first_name", "last_name", "phone", "awaiting_ttn_for", "message_id",
];

async function saveSession(chatId: number, patch: Record<string, any>) {

  const clean: Record<string, any> = {};

  for (const key of SESSION_COLUMNS) {
    if (key in patch) clean[key] = patch[key];
  }

  const row = { chat_id: chatId, ...clean, updated_at: new Date().toISOString() };

  const response = await supabaseRest("bot_sessions?on_conflict=chat_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    console.error("Не вдалося зберегти чернетку:", await response.text());
    return null;
  }

  const rows = await response.json();

  return Array.isArray(rows) ? rows[0] ?? null : null;

}

async function clearSession(chatId: number) {

  await supabaseRest(`bot_sessions?chat_id=eq.${chatId}`, { method: "DELETE" });

}

async function createOrder(row: Record<string, any>) {

  const response = await supabaseRest("orders", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    console.error("Не вдалося створити замовлення:", await response.text());
    return null;
  }

  const rows = await response.json();

  return Array.isArray(rows) ? rows[0] ?? null : null;

}

// -------------------------
// Крок діалогу: показати питання або підсумок
// -------------------------

async function askStep(chatId: number, step: string, product: Record<string, any>, session: Record<string, any>) {

  const text = step === "confirm"
    ? summaryText(product, session)
    : stepPrompt(step, product, session);

  const keyboards: Record<string, unknown> = {
    color: colorKeyboard(product),
    size: sizeKeyboard(product, session.color),
    qty: qtyKeyboard(),
    delivery: deliveryKeyboard(),
    confirm: confirmKeyboard(),
  };

  // Крок з телефоном — єдиний, де потрібна ЗВИЧАЙНА клавіатура
  // (кнопка «поділитися контактом» працює тільки з нею), а таку
  // не можна причепити до відредагованого повідомлення. Тому тут
  // завжди надсилаємо нове.
  if (step === "phone") {

    await telegram("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: phoneKeyboard(),
    });

    return;

  }

  const reply_markup = keyboards[step];

  // РЕДАГУЄМО одне й те саме повідомлення замість надсилання нового
  // на кожен крок. Інакше чат швидко виростає, і клієнту доводиться
  // прокручувати його вручну, щоб побачити наступне питання —
  // Telegram не завжди догортає сам, коли з'являється клавіатура.
  if (session.message_id) {

    const edited = await telegram("editMessageText", {
      chat_id: chatId,
      message_id: session.message_id,
      text,
      parse_mode: "HTML",
      reply_markup,
    });

    if (edited?.ok) return;

    // Повідомлення могло стати надто старим для редагування або
    // бути видаленим — тоді просто надсилаємо нове нижче.

  }

  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup,
  });

  if (sent?.result?.message_id) {

    await saveSession(chatId, { message_id: sent.result.message_id });

  }

}

// Просуваємо діалог: рахуємо наступний крок, зберігаємо і питаємо
async function advance(chatId: number, fromStep: string, product: Record<string, any>, session: Record<string, any>) {

  const filled = autoFill(product, session);
  const step = nextStep(fromStep, product, filled);

  const saved = await saveSession(chatId, { ...filled, step });

  // Якщо крок не зберігся, продовжувати не можна: бот поставить
  // питання, але наступну відповідь клієнта вже не впізнає — діалог
  // мовчки обірветься. Краще чесно сказати й не морочити людину.
  if (!saved) {

    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Щось пішло не так під час оформлення. Спробуйте ще раз або зателефонуйте нам.",
      reply_markup: { remove_keyboard: true },
    });

    return;

  }

  await askStep(chatId, step, product, saved);

}

// -------------------------
// Обробники
// -------------------------

// 1. Нове замовлення з бази → повідомлення власнику
async function handleNewOrder(record: Record<string, any>) {

  const text = formatOrder(record);

  const sent = await telegram("sendMessage", {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buildKeyboard(record.id, record.status ?? "new", { hasTracking: Boolean(record.tracking_number) }),
  });

  // Щоб панель адмінки могла перемалювати саме цю картку, коли
  // статус зміниться там (див. refreshOwnerCard).
  await rememberCardMessage(record.id, sent?.result?.message_id);

  // Підтвердження покупцеві — тільки для замовлень із сайту.
  //
  // У бота підтвердження вже є: там людина бачить картку замовлення в
  // тому самому чаті, де його й оформила.
  //
  // Поки ключа розсилки немає, лист не йде, і підтвердження шле сама
  // сторінка (EmailJS). Коли ключ з'явиться — вимкніть той шлях
  // галочкою в адмінці, інакше покупець отримає два листи про одне
  // замовлення. Див. docs/ЛИСТИ-ПОКУПЦЮ.md
  if (!record?.telegram_chat_id) {

    await sendCustomerMail(record, orderLetter(record, SITE_URL));

  }

}

// 2. Натискання кнопки статусу
async function handleCallback(callback: Record<string, any>) {

  const data: string = callback.data ?? "";

  // Кнопки оформлення замовлення клієнтом (префікс "o:") —
  // окремий сценарій, не плутати з кнопками статусу для власника
  if (data.startsWith("o:")) {

    await handleOrderCallback(callback, data);

    return;

  }

  // Модерація відгуку (префікс "rev:")
  if (data.startsWith("rev:")) {

    await handleReviewCallback(callback, data);

    return;

  }

  // Кнопка «Додати ТТН» під відправленим замовленням — щоб можна
  // було дослати накладну, якщо раніше натиснули /skip
  // Відкрити картку замовлення зі списку /orders
  if (data.startsWith("open:")) {

    if (!isOwner(callback.message.chat.id)) {

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Ця дія доступна лише магазину",
      });

      return;

    }

    const order = await findOrderById(data.slice(5));

    await telegram("answerCallbackQuery", { callback_query_id: callback.id });

    if (!order) {

      await telegram("sendMessage", { chat_id: callback.message.chat.id, text: "Замовлення не знайдено." });

      return;

    }

    const sent = await telegram("sendMessage", {
      chat_id: callback.message.chat.id,
      text: formatOrder(order),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: buildKeyboard(order.id, order.status ?? "new", {
        hasTracking: Boolean(order.tracking_number),
      }),
    });

    // Відкрита зі списку картка стає поточною: саме її власник бачить
    // перед собою, і саме її має перемальовувати панель адмінки.
    await rememberCardMessage(order.id, sent?.result?.message_id);

    return;

  }

  if (data.startsWith("ttn:")) {

    if (!isOwner(callback.message.chat.id)) {

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: "Ця дія доступна лише магазину",
      });

      return;

    }

    const orderId = data.slice(4);

    await saveSession(callback.message.chat.id, { awaiting_ttn_for: orderId });

    await telegram("answerCallbackQuery", { callback_query_id: callback.id });

    // Обов'язково називаємо замовлення. Якщо натиснути «Додати ТТН»
    // під двома замовленнями поспіль, без номера в тексті було б
    // видно два однакових запити — і незрозуміло, якому з них
    // належить наступна відповідь.
    const order = await findOrderById(orderId);

    await telegram("sendMessage", {
      chat_id: callback.message.chat.id,
      text:
        `Надішліть номер накладної для замовлення <b>${escapeHtml(order?.order_number ?? "")}</b> ` +
        `— я перешлю його клієнту.\n\n` +
        `Передумали — /skip`,
      parse_mode: "HTML",
    });

    return;

  }

  // зміна статусу — теж лише власнику
  if (data.startsWith("st:") && !isOwner(callback.message.chat.id)) {

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Ця дія доступна лише магазину",
    });

    return;

  }

  const [prefix, status, orderId] = data.split(":");

  if (prefix !== "st" || !STATUSES[status] || !orderId) {

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Невідома дія",
    });

    return;

  }

  const updated = await updateOrderStatus(orderId, status);

  if (!updated) {

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Не вдалося оновити статус",
      show_alert: true,
    });

    return;

  }

  // --- сповіщення клієнту ---
  // Тільки для замовлень із бота: у них є telegram_chat_id. Для
  // замовлень із сайту поле порожнє, і ми мовчки нічого не шлемо.
  await notifyCustomer(updated, status);

  // Якщо позначили «Відправлено» — просимо номер накладної, щоб
  // одразу переслати його клієнту з посиланням на відстеження
  if (status === "shipped" && !updated.tracking_number) {

    await saveSession(callback.message.chat.id, { awaiting_ttn_for: updated.id });

    await telegram("sendMessage", {
      chat_id: callback.message.chat.id,
      text:
        `Надішліть номер накладної для замовлення <b>${escapeHtml(updated.order_number ?? "")}</b> ` +
        `— я перешлю його клієнту.\n\nЯкщо ТТН поки немає — /skip`,
      parse_mode: "HTML",
    });

  }

  // перемальовуємо те саме повідомлення — щоб історія в чаті не
  // засмічувалась дублями, а поточний статус завжди був актуальним
  await telegram("editMessageText", {
    chat_id: callback.message.chat.id,
    message_id: callback.message.message_id,
    text: formatOrder(updated),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buildKeyboard(updated.id, status, { hasTracking: Boolean(updated.tracking_number) }),
  });

  // Власник щойно натиснув кнопку саме під цією карткою — отже, це
  // вона в нього перед очима. Панель адмінки має міняти статус у ній,
  // а не в старшому дублі з історії чату.
  await rememberCardMessage(updated.id, callback.message.message_id);

  await telegram("answerCallbackQuery", {
    callback_query_id: callback.id,
    text: `${STATUSES[status].emoji} ${STATUSES[status].label}`,
  });

}

// 3. Команди в чаті
async function handleMessage(message: Record<string, any>) {

  const chatId = message.chat.id;
  const command = parseStartPayload(message.text);

  // /id — службова команда: підказує chat_id під час налаштування
  if (String(message.text ?? "").startsWith("/id") && isOwner(chatId)) {

    await telegram("sendMessage", {
      chat_id: chatId,
      text:
        `ID цього чату: <code>${chatId}</code>\n\n` +
        `Накладну можна додати командою:\n` +
        `<code>/ttn 0708553442 20450912345678</code>`,
      parse_mode: "HTML",
    });

    return;

  }

  // --- відповіді на кроках, де клієнт пише текстом ---
  // Робимо це ДО перевірки команд: людина відповідає на питання
  // бота звичайним повідомленням, а не командою.
  // спершу ТТН від власника, потім кроки оформлення клієнтом
  if (await handleTrackingInput(message)) return;
  if (await handleOrderText(message)) return;

  if (!command) return;

  // --- посилання на конкретний товар ---
  if (command.type === "product") {

    const catalog = await loadCatalog();
    const product = catalog.find((item) => Number(item.id) === command.id);

    if (!product) {

      await telegram("sendMessage", {
        chat_id: chatId,
        text:
          "Не знайшли цей товар — можливо, його вже продали або прибрали з каталогу.\n\n" +
          `Подивіться інші: ${SITE_URL}/catalog`,
      });

      return;

    }

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const photo = absoluteImageUrl(variants[0]?.images?.[0] ?? product.images?.[0], SITE_URL);

    // Запам'ятовуємо, який товар дивиться клієнт — щоб кнопка
    // «Замовити в боті» знала, з чим працювати
    await saveSession(chatId, {
      product_id: product.id, step: "idle",
      color: null, size: null, qty: 1,
      delivery_method: null, delivery_price: 0,
      city: null, delivery_detail: null,
      // нове оформлення — нове повідомлення для кроків
      message_id: null,
    });

    const caption = formatProductCard(product, SITE_URL);

    const base = buildProductKeyboard(product, SITE_URL);

    // Кнопка оформлення просто в боті — першою, бо саме заради неї
    // людина прийшла з Instagram
    const reply_markup = {
      inline_keyboard: [
        [{ text: "🛍 Замовити в боті", callback_data: "o:buy" }],
        ...base.inline_keyboard,
      ],
    };

    // Фото надсилаємо, лише якщо воно є. sendPhoto без валідного
    // URL повертає помилку, і клієнт не побачив би нічого — тому
    // за відсутності фото відправляємо просто текст.
    if (photo) {

      const result = await telegram("sendPhoto", {
        chat_id: chatId,
        photo,
        caption,
        parse_mode: "HTML",
        reply_markup,
      });

      // Telegram може відмовитись тягнути картинку (недоступний
      // хост, надто великий файл) — тоді все одно показуємо товар
      // текстом, а не лишаємо клієнта ні з чим
      if (result?.ok) return;

    }

    await telegram("sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup,
    });

    return;

  }

  // --- звичайний /start або незрозумілий параметр ---
  await telegram("sendMessage", {
    chat_id: chatId,
    text:
      "Вітаємо в <b>BestBrnd4u</b> 👋\n\n" +
      "Сумки, взуття та аксесуари світових брендів.\n\n" +
      "Тисніть кнопку нижче, щоб подивитися каталог.",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📚 Каталог", url: `${SITE_URL}/catalog` }],
        [{ text: "🔥 Акції", url: `${SITE_URL}/catalog?section=sale` }],
      ],
    },
  });

}

// -------------------------
// Чи це власник магазину
//
// КРИТИЧНО. Бот відкритий: написати йому може будь-хто, хто знає
// логін. Команди керування замовленнями (ТТН, статуси, список
// замовлень) мусять слухатись ЛИШЕ вас — інакше сторонній міг би
// підставити накладну в чуже замовлення й від імені магазину
// надіслати її клієнту.
//
// Порівнюємо з TELEGRAM_CHAT_ID — тим самим чатом, куди приходять
// заявки. Якщо ви ведете замовлення в групі, це id групи, і команди
// з неї теж працюють.
// -------------------------

function isOwner(chatId: unknown): boolean {

  if (!TELEGRAM_CHAT_ID) return false;

  return String(chatId) === String(TELEGRAM_CHAT_ID);

}

// -------------------------
// Пошук замовлення
// -------------------------

async function findOrderById(id: string) {

  const response = await supabaseRest(`orders?id=eq.${encodeURIComponent(id)}&select=*`);

  if (!response.ok) return null;

  const rows = await response.json();

  return Array.isArray(rows) ? rows[0] ?? null : null;

}

async function listRecentOrders(limit = 10) {

  const response = await supabaseRest(
    `orders?select=*&order=created_at.desc&limit=${limit}`,
  );

  if (!response.ok) {
    console.error("Не вдалося отримати список замовлень:", await response.text());
    return [];
  }

  const rows = await response.json();

  return Array.isArray(rows) ? rows : [];

}

async function findOrderByNumber(orderNumber: string) {

  const response = await supabaseRest(
    `orders?order_number=eq.${encodeURIComponent(orderNumber)}&select=*`,
  );

  if (!response.ok) return null;

  const rows = await response.json();

  return Array.isArray(rows) ? rows[0] ?? null : null;

}

// Зберігає накладну і повідомляє клієнта. Повертає оновлене
// замовлення або null.
async function applyTracking(orderId: string, tracking: string | null) {

  const response = await supabaseRest(`orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ tracking_number: tracking }),
  });

  const rows = response.ok ? await response.json() : [];
  const order = Array.isArray(rows) ? rows[0] ?? null : null;

  // Повідомляємо ЛИШЕ про відправлене замовлення.
  //
  // У боті інакше й не буває: номер просять одразу після
  // «Відправлено». Але той самий шлях тепер має панель адмінки, де
  // накладну можна вписати завчасно — і клієнту прилетіло б
  // «Замовлення відправлено!» про посилку, яка ще на столі.
  if (order && tracking && normalizeStatus(order.status) === "shipped") {

    // Канал кладемо на сам об'єкт: підтвердження власнику мусить
    // сказати правду («надіслано листом» / «не вдалося»), а не
    // вгадувати за наявністю чату. Поле службове й у базу не йде.
    order.notifiedVia = await notifyCustomer(order, "shipped");

  }

  return order;

}

// -------------------------
// Картка замовлення в Telegram
//
// Замовленнями керують із двох місць: кнопками в чаті й панеллю
// адмінки. Якщо панель змінить статус, картка в чаті так і показувала
// б старий — і, що гірше, її кнопки лишились би від старого статусу:
// натиснувши «В обробці» під уже відправленим замовленням, власник
// молча відкотив би зміну назад.
//
// Тому id повідомлення з карткою зберігається в замовленні
// (orders.bot_message_id), і панель перемальовує ту саму картку — так
// само, як це робить натискання кнопки.
// -------------------------

async function rememberCardMessage(orderId: unknown, messageId: unknown) {

  if (!orderId || !messageId) return;

  try {

    const response = await supabaseRest(`orders?id=eq.${encodeURIComponent(String(orderId))}`, {
      method: "PATCH",
      body: JSON.stringify({ bot_message_id: messageId }),
    });

    // Найімовірніша причина — не виконана міграція 009 (немає
    // колонки). Бот від цього не ламається: просто картку не вийде
    // перемалювати з панелі.
    if (!response.ok) {
      console.error("Не вдалося запам'ятати картку замовлення:", await response.text());
    }

  } catch (error) {

    console.error("Не вдалося запам'ятати картку замовлення:", error);

  }

}

async function refreshOwnerCard(order: Record<string, any> | null) {

  if (!order || !order.bot_message_id || !TELEGRAM_CHAT_ID) return;

  await telegram("editMessageText", {
    chat_id: TELEGRAM_CHAT_ID,
    message_id: order.bot_message_id,
    text: formatOrder(order),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buildKeyboard(order.id, order.status ?? "new", {
      hasTracking: Boolean(order.tracking_number),
    }),
  });

}

// -------------------------
// Відмова від товару
//
// Клієнт натиснув «Відмова» в кабінеті. Раніше це нічого не робило —
// лише показувало напис. Тепер створюється заявка, а ви одразу
// бачите її тут із кнопками, щоб не шукати замовлення вручну.
// -------------------------

async function handleRefusal(record: Record<string, any>, order: Record<string, any> | null) {

  // Замовлення тягнемо з бази, якщо тригер його не доклав: без складу
  // замовлення не порахувати ні «N з M позицій», ні суму до повернення.
  const ord = order ?? await findOrderById(record.order_id);

  await telegram("sendMessage", {
    chat_id: TELEGRAM_CHAT_ID,
    text: formatRefusal(record, ord),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: ord
      ? buildKeyboard(ord.id, ord.status ?? "new", {
          hasTracking: Boolean(ord.tracking_number),
        })
      : undefined,
  });

}

// -------------------------
// Сповіщення клієнту
// -------------------------

// Лист покупцеві.
//
// Ніколи не кидає винятків: сповіщення не має права зупинити те, через
// що воно виникло, — ні зміну статусу, ні створення замовлення.
async function sendCustomerMail(order: Record<string, any>, letter: any) {

  const request = mailRequest({
    to: order?.email,
    from: MAIL_FROM,
    replyTo: MAIL_REPLY_TO,
    resendKey: RESEND_API_KEY,
    brevoKey: BREVO_API_KEY,
  }, letter);

  // Немає ключа, немає адреси відправника або немає пошти покупця —
  // просто нічого не робимо.
  if (!request) return false;

  try {

    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
    });

    if (!response.ok) {
      console.error(`Лист покупцеві не пішов (${request.provider}):`, await response.text());
      return false;
    }

    return true;

  } catch (error) {

    console.error("Сервіс розсилки недоступний:", error);

    return false;

  }

}

// Повертає канал, яким повідомили покупця: "telegram", "email" або
// null. Це не косметика: підтвердження власнику залежить від того, чи
// дійшло до людини хоч щось, — раніше він читав «передайте номер
// телефоном» навіть тоді, коли лист уже пішов.
async function notifyCustomer(order: Record<string, any>, status: string): Promise<string | null> {

  const chatId = order?.telegram_chat_id;

  // ОДИН КАНАЛ НА ПОКУПЦЯ.
  //
  // Замовлення з бота мають chat_id і не мають пошти, із сайту —
  // навпаки. Тому чат і лист не конкурують: людина отримує
  // повідомлення там, де замовляла.
  //
  // Раніше тут стояло «немає чату — виходимо», і покупець із сайту не
  // дізнавався ні про відправлення, ні про накладну, ні про
  // скасування. Це була половина всіх покупців.
  if (!chatId) {

    const mailed = await sendCustomerMail(order, statusLetter(order, status, SITE_URL));

    return mailed ? "email" : null;

  }

  const text = customerStatusMessage(order, status);

  if (!text) return null;

  await telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: customerStatusKeyboard(order, status),
  });

  return "telegram";

}

// -------------------------
// Введення номера накладної власником
//
// Повертає true, якщо повідомлення було номером ТТН — тоді решта
// обробників його не чіпає.
// -------------------------

async function handleTrackingInput(message: Record<string, any>): Promise<boolean> {

  const chatId = message.chat.id;

  // --- /orders: останні замовлення списком ---
  //
  // Замінює окрему сторінку адмінки: замовлення живуть у Supabase, а
  // адмінка сайту (Decap) працює з файлами в репозиторії й до бази не
  // має доступу. Окрема веб-сторінка вимагала б ще одного входу й
  // політик доступу до чужих замовлень. У боті ви вже впізнані —
  // тому список тут.
  if (/^\/orders(@\S+)?$/i.test(String(message.text ?? "").trim())) {

    if (!isOwner(chatId)) return true;

    const orders = await listRecentOrders(10);

    if (!orders.length) {

      await telegram("sendMessage", { chat_id: chatId, text: "Замовлень поки немає." });

      return true;

    }

    await telegram("sendMessage", {
      chat_id: chatId,
      text:
        `<b>Останні ${orders.length} замовлень</b>\n\n` +
        orders.map(orderListLine).join("\n") +
        `\n\nНатисніть замовлення, щоб відкрити картку з кнопками.`,
      parse_mode: "HTML",
      reply_markup: orderListKeyboard(orders),
    });

    return true;

  }

  // --- явна команда: /ttn <номер замовлення> <ТТН> ---
  // Не залежить від того, яку кнопку натиснули останньою, тож
  // працює навіть коли замовлень багато або картка вже загубилась
  // у переписці.
  const command = parseTtnCommand(message.text);

  if (command) {

    if (!isOwner(chatId)) {

      // сторонньому просто не відповідаємо по суті — не підказуємо,
      // що така команда взагалі існує
      return true;

    }


    if (command.error) {

      await telegram("sendMessage", { chat_id: chatId, text: command.error });

      return true;

    }

    const order = await findOrderByNumber(command.orderNumber);

    if (!order) {

      await telegram("sendMessage", {
        chat_id: chatId,
        text: `Замовлення ${command.orderNumber} не знайдено. Перевірте номер.`,
      });

      return true;

    }

    const updated = await applyTracking(order.id, command.tracking);

    // Сповіщення вже надіслав applyTracking — тут лише читаємо, чим
    // саме воно пішло. Другий виклик означав би два повідомлення
    // покупцеві про одну накладну.
    const channel = updated?.notifiedVia ?? null;

    await telegram("sendMessage", {
      chat_id: chatId,
      text: channel
        ? `✅ Накладну <code>${escapeHtml(command.tracking)}</code> збережено для замовлення ` +
          `<b>${escapeHtml(command.orderNumber)}</b> і надіслано клієнту` +
          (channel === "email" ? " листом." : ".")
        : `✅ Накладну збережено для замовлення <b>${escapeHtml(command.orderNumber)}</b>. ` +
          `Повідомити клієнта не вдалося — передайте номер телефоном.`,
      parse_mode: "HTML",
    });

    return true;

  }

  if (!isOwner(chatId)) return false;

  const session = await getSession(chatId);

  if (!session?.awaiting_ttn_for) return false;

  const text: string = message.text ?? "";

  // передумали або ТТН ще немає
  if (text.trim() === "/skip") {

    await saveSession(chatId, { awaiting_ttn_for: null });

    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Гаразд, без накладної. Надішлете пізніше — просто натисніть «Відправлено» ще раз.",
    });

    return true;

  }

  const check = validateTracking(text);

  if (!check.ok) {

    await telegram("sendMessage", { chat_id: chatId, text: check.error });

    return true;

  }

  const order = await applyTracking(session.awaiting_ttn_for, check.value);

  await saveSession(chatId, { awaiting_ttn_for: null });

  if (!order) {

    await telegram("sendMessage", { chat_id: chatId, text: "Не вдалося зберегти накладну." });

    return true;

  }

  // У підтвердженні теж називаємо замовлення — щоб було видно, куди
  // саме пішов номер, а не просто «збережено»
  await telegram("sendMessage", {
    chat_id: chatId,
    text: order.notifiedVia
      ? `✅ Накладну <code>${escapeHtml(check.value)}</code> збережено для замовлення ` +
        `<b>${escapeHtml(order.order_number ?? "")}</b> і надіслано клієнту` +
        (order.notifiedVia === "email" ? " листом." : ".")
      : `✅ Накладну збережено для замовлення <b>${escapeHtml(order.order_number ?? "")}</b>. ` +
        `Повідомити клієнта не вдалося — передайте номер телефоном.`,
    parse_mode: "HTML",
  });

  return true;

}

// -------------------------
// Текстові відповіді під час оформлення (місто, адреса, телефон)
//
// Повертає true, якщо повідомлення було відповіддю на крок діалогу —
// тоді решта обробників його не чіпає.
// -------------------------

async function handleOrderText(message: Record<string, any>): Promise<boolean> {

  const chatId = message.chat.id;
  const text: string = message.text ?? "";

  // «Скасувати» зі звичайної клавіатури (вона з'являється на кроці телефону)
  if (text.trim() === "✖️ Скасувати") {

    await clearSession(chatId);

    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Замовлення скасовано.",
      reply_markup: { remove_keyboard: true },
    });

    return true;

  }

  const session = await getSession(chatId);

  if (!session || !["city", "detail", "phone"].includes(session.step)) return false;

  const catalog = await loadCatalog();
  const product = catalog.find((item) => Number(item.id) === Number(session.product_id));

  if (!product) {

    await clearSession(chatId);

    return false;

  }

  // Телефон може прийти кнопкою «поділитися контактом» — тоді Telegram
  // передає його в message.contact разом з ім'ям, і набирати нічого
  // не треба. Текстом теж приймаємо.
  if (session.step === "phone") {

    const contact = message.contact;
    const raw = contact?.phone_number ?? text;
    const result = validatePhone(raw);

    if (!result.ok) {

      await telegram("sendMessage", { chat_id: chatId, text: result.error });

      return true;

    }

    // після звичайної клавіатури повертаємось до редагованого
    // повідомлення — скидаємо id, щоб підсумок прийшов новим
    await advance(chatId, "phone", product, {
      ...session,
      message_id: null,
      phone: result.value,
      first_name: contact?.first_name ?? session.first_name ?? message.from?.first_name ?? null,
      last_name: contact?.last_name ?? session.last_name ?? message.from?.last_name ?? null,
    });

    return true;

  }

  const check = session.step === "city" ? validateCity(text) : validateDetail(text);

  if (!check.ok) {

    await telegram("sendMessage", { chat_id: chatId, text: check.error });

    return true;

  }

  const patch = session.step === "city"
    ? { city: check.value }
    : { delivery_detail: check.value };

  await advance(chatId, session.step, product, { ...session, ...patch });

  return true;

}

// -------------------------
// Кнопки оформлення замовлення (клієнт)
// -------------------------

async function handleOrderCallback(callback: Record<string, any>, data: string) {

  const chatId = callback.message.chat.id;
  const [, action, value] = data.split(":");

  const ack = (text?: string) =>
    telegram("answerCallbackQuery", { callback_query_id: callback.id, text });

  if (action === "cancel") {

    await clearSession(chatId);
    await ack("Скасовано");

    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Замовлення скасовано. Якщо передумаєте — просто відкрийте товар знову.",
      reply_markup: { remove_keyboard: true },
    });

    return;

  }

  const session = await getSession(chatId);

  if (!session?.product_id) {

    await ack("Почніть з вибору товару");

    return;

  }

  const catalog = await loadCatalog();
  const product = catalog.find((item) => Number(item.id) === Number(session.product_id));

  if (!product) {

    await clearSession(chatId);
    await ack("Товар більше не доступний");

    return;

  }

  // --- старт оформлення ---
  if (action === "buy") {

    await ack();
    await advance(chatId, "start", product, session);

    return;

  }

  // --- вибір кольору (передаємо індекс: у callback_data 64 байти) ---
  if (action === "color") {

    const color = colorsOf(product)[Number(value)];

    await ack(color);
    // розмір скидаємо: у нового кольору свій набір розмірів
    await advance(chatId, "color", product, { ...session, color, size: null });

    return;

  }

  if (action === "size") {

    const size = sizesOf(product, session.color)[Number(value)];

    await ack(size);
    await advance(chatId, "size", product, { ...session, size });

    return;

  }

  if (action === "qty") {

    await ack(`${value} шт.`);
    await advance(chatId, "qty", product, { ...session, qty: Number(value) });

    return;

  }

  if (action === "dlv") {

    const option = deliveryById(value);

    if (!option) {
      await ack("Невідомий спосіб доставки");
      return;
    }

    await ack(option.label);
    await advance(chatId, "delivery", product, {
      ...session,
      delivery_method: option.label,
      delivery_price: option.price,
    });

    return;

  }

  // --- підтвердження ---
  if (action === "submit") {

    const orderNumber = generateOrderNumber();
    const row = buildOrderRow(product, { ...session, chat_id: chatId }, orderNumber);

    const created = await createOrder(row);

    if (!created) {

      await ack("Не вдалося оформити, спробуйте ще раз", true);

      await telegram("sendMessage", {
        chat_id: chatId,
        text: "Не вдалося оформити замовлення. Спробуйте ще раз або зателефонуйте нам.",
      });

      return;

    }

    await clearSession(chatId);
    await ack("Замовлення прийнято");

    const totals = computeTotals(product, session.qty, session.delivery_price);

    await telegram("sendMessage", {
      chat_id: chatId,
      text:
        `✅ <b>Замовлення ${escapeHtml(orderNumber)} прийнято</b>\n\n` +
        `${escapeHtml(product.title)}\n` +
        `Разом: <b>${money(totals.total)}</b>\n\n` +
        `Ми зателефонуємо на ${escapeHtml(session.phone ?? "")} найближчим часом, ` +
        `щоб підтвердити деталі.`,
      parse_mode: "HTML",
      reply_markup: { remove_keyboard: true },
    });

    return;

  }

  await ack();

}

// ======================================
// Панель «Замовлення» в адмінці
//
// ХТО МАЄ ПРАВО
// --------------
// Замовлення — це телефони, адреси й суми, тож питання «хто це
// питає» тут головне. Своїх паролів панель не заводить: вона
// надсилає токен GitHub, під яким людина вже зайшла в адмінку, а
// функція питає в GitHub, чи має цей токен право ЗАПИСУ в
// репозиторій сайту.
//
// Чому саме так:
//
//   • право писати в репозиторій = право змінити будь-яку сторінку
//     сайту. Хто його має — уже має все; окремий пароль до
//     замовлень нічого не додав би, зате був би ще одним секретом,
//     який можна забути й загубити;
//
//   • нікого не треба заводити окремо. Дали колезі доступ до
//     репозиторію (admin/access.html) — він одразу бачить і
//     замовлення. Забрали — доступ зникає сам;
//
//   • у браузері не лежить нічого нового. Токен там уже є — його
//     зберігає сама Decap CMS, інакше вона не змогла б комітити.
//
// Права перевіряються в GitHub, а не тут: підробити відповідь
// api.github.com неможливо, а «список дозволених логінів» у коді
// функції розійшовся б із реальними доступами до репозиторію.
// ======================================

// Відповідь GitHub кешуємо на кілька хвилин: інакше кожен клік у
// панелі — це зайвий похід в api.github.com.
//
// Ключ — не сам токен, а його відпечаток: тримати в довгоживучій
// структурі значення, яким можна писати в репозиторій, не варто.
const ADMIN_TOKEN_TTL_MS = 5 * 60 * 1000;
const adminTokens = new Map<string, number>();

async function fingerprint(token: string): Promise<string> {

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

}

async function verifyAdmin(token: string): Promise<boolean> {

  if (!token) return false;

  const key = await fingerprint(token);
  const until = adminTokens.get(key);

  if (until && until > Date.now()) return true;

  // Прибираємо протерміноване, щоб карта не росла без межі —
  // ізолят функції живе довго.
  if (adminTokens.size > 50) {

    for (const [entry, expires] of adminTokens) {
      if (expires <= Date.now()) adminTokens.delete(entry);
    }

  }

  const response = await fetch(`https://api.github.com/repos/${ADMIN_REPO}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bestbrnd4u-admin-orders",
    },
  });

  if (!response.ok) {

    console.error("GitHub не підтвердив доступ:", response.status);

    return false;

  }

  const repo = await response.json();

  // push — це саме право записувати. Одного лише доступу на читання
  // (публічний репозиторій видно всім) недостатньо: інакше будь-хто
  // з токеном GitHub читав би замовлення.
  const allowed = Boolean(repo?.permissions?.push);

  if (allowed) adminTokens.set(key, Date.now() + ADMIN_TOKEN_TTL_MS);

  return allowed;

}

function adminJson(payload: unknown, status: number, origin: string | null) {

  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });

}

// Скільки замовлень у кожній вкладці. Рядки не потрібні — лише
// число з Content-Range, тож просимо один рядок і читаємо заголовок.
async function countOrders(params: Record<string, unknown>): Promise<number | null> {

  const response = await supabaseRest(buildCountQuery(params), {
    headers: { Prefer: "count=exact" },
  });

  if (!response.ok) return null;

  // тіло треба прочитати, інакше зʼєднання лишиться відкритим
  await response.text();

  return parseTotal(response.headers.get("content-range"));

}

async function adminCounts(): Promise<Record<string, number | null>> {

  const keys = [...STATUS_ORDER, "refusal"];

  const values = await Promise.all([
    ...STATUS_ORDER.map((status: string) => countOrders({ status })),
    countOrders({ refusal: true }),
  ]);

  const counts: Record<string, number | null> = {};

  keys.forEach((key: string, index: number) => { counts[key] = values[index]; });

  return counts;

}

// -------------------------
// Замовлення з сайту
//
// ЧОМУ ЧЕРЕЗ ФУНКЦІЮ, А НЕ ПРЯМО В БАЗУ
//
// Перевірку «ви людина» неможливо підтвердити в браузері: токен
// Turnstile має значення лише тоді, коли його звірили з Cloudflare
// секретним ключем. Секрет у коді сайту лежати не може — отже,
// звіряти мусить сервер.
//
// ЩО ТУТ ГОЛОВНЕ
//
// Функція пише СЛУЖБОВИМ ключем, тобто обмеження бази на неї не
// діють. Тому payload не «чиститься», а перебирається за білим
// списком (place-order.js), а чиє це замовлення — вирішує
// підтверджений токен користувача, а не те, що прислали.
// -------------------------

async function verifyUser(token: string): Promise<string | null> {

  if (!token) return null;

  try {

    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return null;

    const user = await response.json();

    return typeof user?.id === "string" ? user.id : null;

  } catch (error) {

    console.error("Не вдалося перевірити користувача:", error);

    return null;

  }

}

// -------------------------
// Довідник Нової пошти
//
// Браузер не може питати НП сам: ключ дає право створювати накладні на
// рахунку магазину. Тому питає нас, а ми — НП, і віддаємо назад лише
// назви й номери (див. nova-poshta.js).
// -------------------------

// Один запит до НП. Повертає розібрані дані або null.
async function npCall(action: Record<string, any>): Promise<any> {

  const payload = npRequest(NOVAPOSHTA_API_KEY, action);

  if (!payload) return null;

  const response = await fetch("https://api.novaposhta.ua/v2.0/json/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  const failure = npError(data);

  if (failure) {

    console.error("Нова пошта відмовила:", failure);

    // Причина йде ще й у щоденний звіт: журнал Edge Functions ніхто
    // не читає, і саме тому «не знаходить поштомат за номером»
    // з'ясувалось лише зі скарги покупця.
    //
    // Метод у сторінці — щоб було видно, що саме відмовило: пошук
    // міста чи пошук точок.
    await reportServerIssue("np_directory", `${action.method}: ${failure}`);

    return null;

  }

  return data;

}

// Ref типу «Поштомат». Довідник типів у НП не змінюється роками, тож
// питаємо його раз на життя інстансу функції.
let postomatRef: string | null = null;

async function typeRefFor(postomat: boolean): Promise<string> {

  if (!postomatRef) {

    const data = await npCall({ method: "types" });

    // ЩО БУЛО НЕ ТАК. Умовою було `postomatRef === null`, а при
    // невдачі сюди писався порожній рядок — тобто НАЗАВЖДИ, на весь
    // час життя інстансу. Далі кожен пошук поштоматів ішов без
    // фільтра типу й мовчки шукав не те: у списку були відділення.
    //
    // Тепер порожнє значення означає «спробуємо наступного разу».
    postomatRef = data ? postomatTypeRef(parseTypes(data)) : "";

  }

  // Для відділень типу не передаємо: їх у НП кілька («Відділення»,
  // «Пункт приймання-видачі»), і обмежувати одним означало б ховати
  // від покупця половину точок. Достатньо прибрати поштомати —
  // це робиться при розборі відповіді.
  return postomat ? (postomatRef || "") : "";

}

async function handleNovaPoshta(request: Request, body: Record<string, any>): Promise<Response> {

  const origin = request.headers.get("origin");

  const action = body.method === "warehouses"
    ? { ...body, typeRef: await typeRefFor(body.postomat === true) }
    : body;

  const payload = npRequest(NOVAPOSHTA_API_KEY, action);

  // Немає ключа або запит не схожий на пошук адреси — відповідаємо
  // чесно. Сторінка на це лишає звичайне текстове поле.
  if (!payload) {
    return adminJson({ ok: false, error: "novaposhta_unavailable", items: [] }, 200, origin);
  }

  try {

    const data = await npCall(action);

    if (!data) {
      return adminJson({ ok: false, error: "novaposhta_failed", items: [] }, 200, origin);
    }

    const items = body.method === "settlements"
      ? parseSettlements(data)
      : parseWarehouses(data);

    return adminJson({ ok: true, items }, 200, origin);

  } catch (error) {

    console.error("Нова пошта недоступна:", error);

    // Недоступний довідник не має ламати оформлення: сторінка
    // повернеться до текстового поля.
    return adminJson({ ok: false, error: "novaposhta_unavailable", items: [] }, 200, origin);

  }

}

async function handlePlaceOrder(request: Request, body: Record<string, any>): Promise<Response> {

  const origin = request.headers.get("origin");

  // Без секрета перевіряти нічого. Відповідаємо чесно, а не «ок»:
  // сторінка на це відкотиться на прямий запис у базу — тобто на те,
  // як магазин працював досі.
  if (!TURNSTILE_SECRET) {
    return adminJson({ ok: false, error: "turnstile_not_configured" }, 501, origin);
  }

  const token = String(body.turnstile_token ?? "");

  if (!token) {
    return adminJson({ ok: false, error: "no_token" }, 400, origin);
  }

  let verdict;

  try {

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: TURNSTILE_SECRET,
        response: token,
        // Адреса допомагає Cloudflare відрізняти живу людину від
        // перевикористаного токена.
        remoteip: request.headers.get("cf-connecting-ip")
          ?? (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
          ?? undefined,
      }),
    });

    verdict = turnstileVerdict(await response.json());

  } catch (error) {

    console.error("Turnstile недоступний:", error);

    // Cloudflare не відповів — це наша проблема, а не покупця.
    // Відповідаємо так само, як без налаштування: сторінка збереже
    // замовлення сама.
    return adminJson({ ok: false, error: "turnstile_unavailable" }, 503, origin);

  }

  if (!verdict.ok) {

    console.warn("Turnstile не пройдено:", verdict.reason);

    return adminJson({ ok: false, error: "turnstile_failed" }, 403, origin);

  }

  const clean = cleanOrder(body.order);

  if (!clean.ok) {

    console.warn("Замовлення відхилено:", clean.reason);

    return adminJson({ ok: false, error: "bad_order" }, 400, origin);

  }

  // Кабінет: замовлення прив'язується до людини лише за підтвердженим
  // токеном із заголовка Authorization — його кладе туди сам клієнт
  // Supabase. Те, що прислали в тілі запиту, тут не має ваги взагалі:
  // інакше будь-хто міг би записати замовлення на чужий акаунт.
  //
  // Гість надсилає публічний ключ проєкту — на нього /auth/v1/user
  // відповість відмовою, і замовлення лишиться гостьовим.
  //
  // ЩО БУЛО НЕ ТАК. Тут стояло /^Bearers+/i — регулярка без
  // зворотного слеша перед s. Замість «Bearer і пробіли» вона шукала
  // «Bearer» і одну-кілька літер s, тобто не збігалась ніколи, і в
  // verifyUser їхав рядок разом зі словом Bearer. Той будував
  // «Bearer Bearer eyJ…», Supabase відповідав відмовою — і кожне
  // замовлення через функцію ставало ГОСТЬОВИМ. Покупець із
  // акаунтом не бачив свого замовлення в кабінеті.
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

  const userId = await verifyUser(bearer);

  const response = await supabaseRest("orders", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...clean.row, user_id: userId }),
  });

  if (!response.ok) {

    const detail = await response.text();

    console.error("Не вдалося зберегти замовлення:", detail);

    return adminJson({ ok: false, error: "insert_failed" }, 502, origin);

  }

  return adminJson({ ok: true }, 200, origin);

}

// -------------------------
// Адреса відвідувача
//
// За Cloudflare і проксі Supabase справжня адреса лежить у
// заголовках, а не в самому з'єднанні. cf-connecting-ip надійніший:
// x-forwarded-for клієнт може підробити, дописавши свій рядок, тому з
// нього беремо ПЕРШУ адресу — її ставить найближчий до клієнта проксі.
// -------------------------

function clientIp(request: Request): string {

  const direct = request.headers.get("cf-connecting-ip");

  if (direct) return direct.trim();

  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();

}

// -------------------------
// Скарга на саму функцію
//
// Помилка серверної інтеграції нікому не видна: у браузері нічого не
// ламається, покупець нічого не помічає, а в логах функції ніхто не
// сидить. Тому пишемо в той самий журнал, що й помилки сторінок
// (міграція 013) — його раз на добу надсилає scripts/report-issues.js.
// -------------------------

async function reportServerIssue(kind: string, message: string) {

  try {

    const response = await supabaseRest("rpc/report_issue", {
      method: "POST",
      body: JSON.stringify({
        p_kind: kind,
        p_page: "edge-function",
        p_message: message.slice(0, 500),
        p_source: "",
        p_agent: "",
      }),
    });

    await response.text();

  } catch (error) {

    // Журнал помилок не має права ламати те, що його покликало.
    console.error("Не вдалося записати скаргу:", error);

  }

}

// -------------------------
// Серверні конверсії Meta (Conversions API)
//
// Навіщо це взагалі й чому подія не дублюється — у meta-capi.js.
// Тут лише мережа: ідентифікатор пікселя, хешування, запит.
// -------------------------

// Ідентифікатор пікселя беремо з САЙТУ, а не з окремого секрету.
//
// Він публічний за задумом (лежить у data/analytics.json і в коді
// кожної сторінки) і його правлять в адмінці. Другий екземпляр у
// секретах означав би два джерела правди: власник міняє піксель в
// адмінці, а функція ще пів року надсилає конверсії в старий.
let pixelCache: { at: number; id: string } | null = null;

const PIXEL_TTL_MS = 10 * 60 * 1000;

async function loadPixelId(): Promise<string> {

  if (pixelCache && Date.now() - pixelCache.at < PIXEL_TTL_MS) {
    return pixelCache.id;
  }

  try {

    const response = await fetch(`${SITE_URL}/data/analytics.json`);

    if (!response.ok) return pixelCache?.id ?? "";

    const data = await response.json();

    const id = String(data?.metaPixelId ?? "").trim();

    pixelCache = { at: Date.now(), id };

    return id;

  } catch (error) {

    console.error("Не вдалося прочитати налаштування статистики:", error);

    return pixelCache?.id ?? "";

  }

}

async function handleMetaPurchase(request: Request, body: Record<string, any>): Promise<Response> {

  const origin = request.headers.get("origin");

  // Немає токена — нічого не робимо і кажемо про це чесно. Сторінка на
  // це не реагує ніяк: браузерний піксель працює сам по собі.
  if (!META_CAPI_TOKEN) {
    return adminJson({ ok: false, error: "capi_not_configured" }, 200, origin);
  }

  // ЗГОДА. Браузерний піксель питає її сам (assets/js/consent.js), і
  // серверна подія не може бути винятком: інакше магазин надсилав би
  // у Meta дані саме тих людей, які рекламу відхилили.
  //
  // Прапорець ставить сторінка. Підробити його з чужого запиту можна,
  // але це не дає нічого, чого не дає власна відкрита сторінка.
  if (body.consent !== true) {
    return adminJson({ ok: false, error: "no_consent" }, 200, origin);
  }

  const orderNumber = String(body.order_number ?? "").trim();

  if (!/^[0-9A-Za-z-]{4,40}$/.test(orderNumber)) {
    return adminJson({ ok: false, error: "bad_order" }, 400, origin);
  }

  const pixelId = await loadPixelId();

  if (!pixelId) {
    return adminJson({ ok: false, error: "no_pixel" }, 200, origin);
  }

  // Замовлення читаємо з БАЗИ. Усе, що прислав браузер, — це номер
  // замовлення й куки пікселя; гроші, склад і контакти беруться з
  // рядка. Інакше сторонній запит міг би записати Meta покупку на
  // будь-яку суму.
  const order = await findOrderByNumber(orderNumber);

  if (!order) {
    return adminJson({ ok: false, error: "order_not_found" }, 200, origin);
  }

  const created = Date.parse(order.created_at ?? "");

  if (Number.isFinite(created) && Date.now() - created > MAX_EVENT_AGE_MS) {
    return adminJson({ ok: false, error: "too_old" }, 200, origin);
  }

  const browser = cleanBrowserIds(body);
  const sources = userDataSources(order);

  // Подія без жодного ідентифікатора людини нічого не додає: Meta не
  // має до кого її приписати.
  if (!hasIdentity(sources, browser)) {
    return adminJson({ ok: false, error: "no_identity" }, 200, origin);
  }

  const hashed: Record<string, string> = {};

  for (const key of Object.keys(sources)) {
    hashed[key] = await fingerprint(sources[key]);
  }

  const event = buildEvent({
    order,
    hashed,
    browser,
    sourceUrl: cleanSourceUrl(body.source_url, ADMIN_ORIGINS),
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent") ?? "",
    now: Date.now(),
  });

  const plan = capiRequest(pixelId, META_CAPI_TOKEN, [event], META_CAPI_TEST_CODE);

  if (!plan) {
    return adminJson({ ok: false, error: "capi_not_configured" }, 200, origin);
  }

  try {

    const response = await fetch(plan.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(plan.body),
    });

    const data = await response.json().catch(() => null);

    const verdict = capiVerdict(response.status, data);

    if (!verdict.ok) {

      console.error("Meta не прийняла подію:", verdict.reason);

      // Тихий збій тут найгірший: реклама далі оптимізується за
      // половиною покупок, і дізнатись про це нізвідки.
      await reportServerIssue("meta_capi",
        `Meta не прийняла Purchase ${orderNumber}: ${verdict.reason}`);

      return adminJson({ ok: false, error: "capi_rejected" }, 200, origin);

    }

    return adminJson({ ok: true }, 200, origin);

  } catch (error) {

    console.error("Meta недоступна:", error);

    // Недоступна Meta не має жодного стосунку до замовлення: воно вже
    // збережене. Відповідаємо спокійно.
    return adminJson({ ok: false, error: "capi_unavailable" }, 200, origin);

  }

}

// -------------------------
// «Де моє замовлення» для гостя
//
// Чому потрібен телефон і чому відповідь однакова на «немає» та «не
// той телефон» — у order-lookup.js.
// -------------------------

async function lookupAllowed(ip: string): Promise<boolean> {

  try {

    const response = await supabaseRest("rpc/order_lookup_allowed", {
      method: "POST",
      body: JSON.stringify({ p_ip: ip }),
    });

    if (!response.ok) {

      // Міграцію ще не застосували — межі немає. Пропускаємо: справжня
      // перевірка тут збіг телефону, а не лічильник.
      await response.text();

      return true;

    }

    return (await response.json()) !== false;

  } catch (error) {

    console.error("Лічильник звернень недоступний:", error);

    return true;

  }

}

async function handleOrderStatus(request: Request, body: Record<string, any>): Promise<Response> {

  const origin = request.headers.get("origin");

  const clean = cleanLookup(body);

  if (!clean.ok) {
    return adminJson({ ok: false, error: "bad_request" }, 400, origin);
  }

  // Лічильник ПЕРЕД зверненням до бази: сенс межі саме в тому, щоб
  // перебір не доходив до таблиці замовлень.
  if (!(await lookupAllowed(clientIp(request)))) {
    return adminJson({ ok: false, error: "too_many" }, 429, origin);
  }

  const order = await findOrderByNumber(clean.orderNumber);

  // ОДНА відповідь на два випадки — навмисно.
  if (!order || !phoneMatches(order.phone, clean.phone)) {
    return adminJson({ ok: false, error: "not_found" }, 200, origin);
  }

  return adminJson({ ok: true, order: publicOrderView(order) }, 200, origin);

}

// -------------------------
// Відгуки
//
// Навіщо перевірка покупки й чому вона на сервері — у reviews.js.
// Тут мережа: звірка з замовленням, запис і картка власнику.
// -------------------------

// Назва товару для картки модерації.
//
// Беремо з каталогу сайту (той самий loadCatalog, що для бота): у базі
// товарів немає, вони живуть у репозиторії. Не знайшли — не страшно,
// картка покаже номер.
async function productTitle(productId: number): Promise<string> {

  try {

    const items = await loadCatalog();

    const found = items.find((item) => Number(item?.id) === Number(productId));

    return found ? String(found.title ?? "") : "";

  } catch (error) {

    return "";

  }

}

async function handleAddReview(request: Request, body: Record<string, any>): Promise<Response> {

  const origin = request.headers.get("origin");

  const clean = cleanReview(body);

  if (!clean.ok) {

    console.warn("Відгук відхилено:", clean.reason);

    return adminJson({ ok: false, error: "bad_review" }, 400, origin);

  }

  const review = clean.review;

  // Межа звернень — та сама, що на сторінці «Де моє замовлення»
  // (міграція 017). Причина теж та сама: інакше номери замовлень можна
  // перебирати, тільки тепер ще й з написанням відгуку.
  if (!(await lookupAllowed(clientIp(request)))) {
    return adminJson({ ok: false, error: "too_many" }, 429, origin);
  }

  const order = await findOrderByNumber(review.orderNumber);

  // ОДНА відповідь на всі випадки «не зійшлось»: немає замовлення, не
  // той телефон, немає цього товару в складі. Інакше форма стала б
  // способом дізнатись, що саме людина купувала.
  if (!order
    || !reviewPhoneMatches(order.phone, review.phone)
    || !orderHasProduct(order, review.productId)) {

    return adminJson({ ok: false, error: "not_verified" }, 200, origin);

  }

  const response = await supabaseRest("rpc/add_review", {
    method: "POST",
    body: JSON.stringify({
      p_product_id: review.productId,
      p_order_number: review.orderNumber,
      p_author: review.author,
      p_rating: review.rating,
      p_body: review.body,
    }),
  });

  if (!response.ok) {

    const detail = await response.text();

    console.error("Не вдалося зберегти відгук:", detail);

    return adminJson({ ok: false, error: "save_failed" }, 502, origin);

  }

  const id = await response.json();

  if (!id) {

    // База відхилила: міграцію 019 ще не застосували або дані не
    // пройшли її власну перевірку.
    return adminJson({ ok: false, error: "save_failed" }, 502, origin);

  }

  // Картка власнику з кнопками. У фон: покупець не має чекати на
  // Telegram, щоб побачити «дякуємо».
  await background((async () => {

    const title = await productTitle(review.productId);

    const sent = await telegram("sendMessage", {
      chat_id: TELEGRAM_CHAT_ID,
      text: reviewCard(review, title),
      parse_mode: "HTML",
      reply_markup: reviewKeyboard(id),
    });

    // Запам'ятовуємо, ЯКЕ повідомлення показує цей відгук.
    //
    // Без цього панель в адмінці не могла б прибрати кнопки під
    // карткою після свого рішення — і власник, натиснувши їх через
    // тиждень, МОВЧКИ скасував би те, що сам же й ухвалив. Та сама
    // пастка, яку для замовлень закрив bot_message_id.
    const message = sent?.result;

    if (message?.message_id) {
      await supabaseRest(`reviews?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          owner_chat_id: message.chat?.id ?? null,
          owner_message_id: message.message_id,
        }),
      }).then(response => response.text()).catch(() => {});
    }

  })());

  return adminJson({ ok: true }, 200, origin);

}

// Натискання «Показати» / «Відхилити» під карткою відгуку.
async function handleReviewCallback(callback: Record<string, any>, data: string) {

  const action = parseReviewAction(data);

  if (!action) return;

  if (!isOwner(callback.message?.chat?.id)) {

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Ця дія доступна лише магазину",
    });

    return;

  }

  // Рішення могли вже ухвалити — у панелі адмінки. Тоді кнопки під
  // цією карткою застаріли, і натискання означало б тихе скасування
  // чужого (або свого ж) рішення. Тому пишемо ЛИШЕ поки статус
  // «new»: умова стоїть у самому запиті, тож між перевіркою й
  // записом нічого не встигне змінитись.
  const response = await supabaseRest(`reviews?id=eq.${action.id}&status=eq.new`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: action.status,
      moderated_at: new Date().toISOString(),
      moderated_by: "telegram",
    }),
  });

  if (!response.ok) {

    const detail = await response.text();

    console.error("Не вдалося змінити статус відгуку:", detail);

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Не вдалося зберегти",
    });

    return;

  }

  const changed = await response.json().catch(() => []);

  // Порожня відповідь = відгук уже не «new», тобто рішення ухвалили
  // в панелі. Кажемо про це прямо й прибираємо застарілі кнопки,
  // а не вдаємо, що натискання щось зробило.
  if (!Array.isArray(changed) || !changed.length) {

    await telegram("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Цей відгук уже відмодерований — дивіться панель в адмінці",
    });

    await telegram("editMessageReplyMarkup", {
      chat_id: callback.message.chat.id,
      message_id: callback.message.message_id,
    });

    return;

  }

  await telegram("answerCallbackQuery", {
    callback_query_id: callback.id,
    text: action.status === "published" ? "Показано" : "Відхилено",
  });

  // Кнопки прибираємо й дописуємо рішення в саме повідомлення: інакше
  // через тиждень незрозуміло, що з цим відгуком зробили.
  //
  // ЧОМУ editMessageText, А НЕ editMessageReplyMarkup. Друге лишило б
  // картку без жодного слова про рішення — і власник тиснув би вдруге.
  await telegram("editMessageText", {
    chat_id: callback.message.chat.id,
    message_id: callback.message.message_id,
    text: `${callback.message.text ?? ""}\n\n${reviewVerdictLine(action.status)}`,
    parse_mode: "HTML",
  });

  // Зірки в розмітці оновить наступна збірка: pull-reviews.js читає
  // review_stats() і кладе числа в дані товару. Просити перезбірку
  // звідси не варто — власник модерує кілька відгуків підряд, і кожен
  // тягнув би повну збірку сайту.

}

// -------------------------
// Підписка на листи магазину
//
// Чому без скрипта MailerLite і чому через нас — у subscribe.js.
// -------------------------

async function handleSubscribe(request: Request, body: Record<string, any>): Promise<Response> {

  const origin = request.headers.get("origin");

  const clean = cleanSubscriber(body);

  if (!clean.ok) {

    console.warn("Підписку відхилено:", clean.reason);

    return adminJson({ ok: false, error: "bad_email" }, 400, origin);

  }

  const plan = subscribeRequest(MAILERLITE_API_KEY, clean.subscriber, MAILERLITE_GROUP_ID);

  if (!plan) {

    // Ключа немає — форма про це й скаже. Не «ок»: інакше людина
    // вважала б себе підписаною, а в списку її немає.
    return adminJson({ ok: false, error: "not_configured" }, 501, origin);

  }

  // Межа звернень — та сама, що на сторінці «Де моє замовлення»
  // (міграція 017). Без неї форму можна перетворити на спосіб
  // завалити чужу скриньку листами підтвердження.
  if (!(await lookupAllowed(clientIp(request)))) {
    return adminJson({ ok: false, error: "too_many" }, 429, origin);
  }

  try {

    const response = await fetch(plan.url, {
      method: "POST",
      headers: plan.headers,
      body: JSON.stringify(plan.body),
    });

    const data = await response.json().catch(() => null);

    const verdict = subscribeVerdict(response.status, data);

    if (!verdict.ok) {

      console.error("MailerLite відмовив:", verdict.reason);

      // Недійсний ключ — це наша проблема, і про неї треба знати:
      // форма при цьому мовчки перестає працювати, а людина бачить
      // «спробуйте пізніше» й іде.
      if (/недійсний/.test(verdict.reason ?? "")) {
        await reportServerIssue("mail_list", `MailerLite: ${verdict.reason}`);
      }

      return adminJson({ ok: false, error: "rejected" }, 200, origin);

    }

    // state каже, ЩО саме сталося: нову пошту додали, чи вона вже
    // була в списку, і чи підтверджена підписка. Без цього сторінка
    // обіцяла лист підтвердження навіть тому, хто підписався давно
    // (див. пояснення в subscribe.js).
    return adminJson({
      ok: true,
      already: verdict.already === true,
      state: verdict.state ?? "new",
    }, 200, origin);

  } catch (error) {

    console.error("MailerLite недоступний:", error);

    return adminJson({ ok: false, error: "unavailable" }, 200, origin);

  }

}

// Незавершене оформлення замовлення.
//
// НАВІЩО ЦЕЙ МАРШРУТ
// -------------------
// Кошик гостя живе в localStorage — у базі його немає, і нагадування
// про брошений кошик (scripts/remind-carts.js) до гостя не доходить
// НІКОЛИ. А гості — більшість покупців.
//
// Пошта гостя вперше з'являється на сторінці оформлення. Якщо людина
// її заповнила й не дійшла до кнопки — це найгарячіша втрата, яка в
// магазині буває, і адреса при цьому вже в нас.
//
// ЩО САМЕ ТУТ ВІДБУВАЄТЬСЯ
// -------------------------
// Один рядок на адресу: пошта + посилання на товари. Ні імені, ні
// телефону, ні адреси доставки — для листа «ви не завершили
// замовлення» вони не потрібні.
//
// Це НЕ підписка. Адреса не потрапляє ні в MailerLite, ні в жоден
// список; лист — один, і не частіше разу на 30 днів (умови в
// міграції 020, функція abandoned_checkouts).
//
// ВІДПОВІДЬ ЗАВЖДИ 200 і ok:true — навіть коли нічого не збереглось.
// Сторінка оформлення не має чого робити з цією помилкою: людина
// зараз купує, і остання річ, яка їй потрібна, — червоне повідомлення
// про допоміжну можливість магазину.
async function handleCheckoutDraft(request: Request, body: Record<string, any>): Promise<Response> {

  const origin = request.headers.get("origin");

  const clean = cleanDraft(body);

  if (!clean.ok) {

    console.warn("Чернетку оформлення відхилено:", clean.reason);

    return adminJson({ ok: true, saved: false }, 200, origin);

  }

  // Межа звернень — та сама, що на сторінці «Де моє замовлення»
  // (міграція 017). Без неї маршрут став би способом наповнити нам
  // базу вигаданими адресами.
  if (!(await lookupAllowed(clientIp(request)))) {
    return adminJson({ ok: true, saved: false }, 200, origin);
  }

  try {

    const response = await supabaseRest("rpc/save_checkout_draft", {
      method: "POST",
      body: JSON.stringify({
        p_email: clean.draft.email,
        p_items: clean.draft.items,
      }),
    });

    if (!response.ok) {

      const text = await response.text();

      // Міграції ще немає — це «не налаштовано», а не збій. Кажемо в
      // журнал і живемо далі: оформлення від цього не залежить.
      console.warn("Чернетку не збережено:", response.status, text.slice(0, 160));

      return adminJson({ ok: true, saved: false }, 200, origin);

    }

    await response.text();

    return adminJson({ ok: true, saved: true }, 200, origin);

  } catch (error) {

    console.error("Чернетка оформлення недоступна:", error);

    return adminJson({ ok: true, saved: false }, 200, origin);

  }

}

// -------------------------
// Панель «Відгуки» в адмінці
//
// Другий спосіб модерації поруч із кнопками в Telegram. Навіщо він
// і чому це не колекція Decap — у review-admin.js.
//
// Доступ перевіряє handleAdmin вище: право те саме, що для
// замовлень — запис у репозиторій сайту.
// -------------------------

async function reviewCounts() {

  const counts: Record<string, number | null> = {};

  // По одному запиту на вкладку. Рядки не потрібні — лише число з
  // Content-Range, тож просимо одну колонку й один рядок.
  for (const status of REVIEW_STATUS_ORDER) {

    const response = await supabaseRest(buildReviewCountQuery(status), {
      headers: { Prefer: "count=exact" },
    });

    counts[status] = response.ok
      ? parseTotal(response.headers.get("content-range"))
      : null;

    if (response.ok) await response.text();

  }

  return counts;

}

// Назви товарів для списку відгуків.
//
// У відгуку лежить лише product_id: товари живуть у репозиторії, а
// не в базі. Без назви панель показувала б «Товар #57», і зрозуміти,
// про що відгук, можна було б лише відкривши сайт.
async function reviewTitles(ids: number[]) {

  const titles: Record<string, string> = {};

  for (const id of [...new Set(ids)].slice(0, 100)) {

    if (!Number.isFinite(id)) continue;

    const title = await productTitle(id);

    if (title) titles[String(id)] = title;

  }

  return titles;

}

async function handleReviewAdmin(body: Record<string, any>, origin: string | null): Promise<Response> {

  const parsed = parseReviewAdminRequest(body);

  if (!parsed.ok) return adminJson({ ok: false, error: parsed.error }, 400, origin);

  const { action, params } = parsed;

  if (action === "reviews-list") {

    const response = await supabaseRest(buildReviewListQuery(params), {
      headers: { Prefer: "count=exact" },
    });

    if (!response.ok) {

      console.error("Не вдалося отримати відгуки:", await response.text());

      return adminJson({ ok: false, error: "База не віддала відгуки." }, 502, origin);

    }

    const rows = await response.json();
    const list = Array.isArray(rows) ? rows : [];

    const payload = reviewListResponse({
      reviews: list,
      total: parseTotal(response.headers.get("content-range")),
      counts: await reviewCounts(),
    });

    return adminJson({
      ...payload,
      titles: await reviewTitles(list.map(row => Number(row.product_id))),
    }, 200, origin);

  }

  // Далі — дії над одним відгуком. Обидві мусять знати, що було до
  // зміни: рішення могли вже ухвалити кнопкою в Telegram.
  const before = await supabaseRest(`reviews?select=*&id=eq.${params.id}&limit=1`);

  const found = before.ok ? await before.json() : [];
  const current = Array.isArray(found) ? found[0] : null;

  if (!current) return adminJson({ ok: false, error: "Відгук не знайдено." }, 404, origin);

  if (action === "review-reply") {

    const saved = await supabaseRest(`reviews?id=eq.${params.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ reply: params.reply }),
    });

    if (!saved.ok) {

      console.error("Не вдалося зберегти відповідь:", await saved.text());

      return adminJson({ ok: false, error: "Не вдалося зберегти відповідь." }, 502, origin);

    }

    const rows = await saved.json();

    return adminJson({
      ok: true,
      review: reviewView(Array.isArray(rows) ? rows[0] : null),
    }, 200, origin);

  }

  // review-status
  //
  // Повторне рішення — не помилка бази, а помилка людини: відгук уже
  // або показаний, або відхилений, і панель просто застаріла (рішення
  // ухвалили кнопкою в чаті). Кажемо про це й вертаємо свіжий стан,
  // щоб сторінка перемалювалась правильно.
  if (current.status !== "new") {

    return adminJson({
      ok: false,
      error: `Цей відгук уже «${reviewView(current)?.statusLabel}» — рішення ухвалили раніше.`,
      review: reviewView(current),
    }, 409, origin);

  }

  const saved = await supabaseRest(`reviews?id=eq.${params.id}&status=eq.new`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: params.status,
      moderated_at: new Date().toISOString(),
      moderated_by: "admin",
    }),
  });

  if (!saved.ok) {

    console.error("Не вдалося змінити статус відгуку:", await saved.text());

    return adminJson({ ok: false, error: "Не вдалося зберегти рішення." }, 502, origin);

  }

  const rows = await saved.json();
  const updated = Array.isArray(rows) ? rows[0] : null;

  if (!updated) {

    // Між читанням і записом статус змінили кнопкою в чаті.
    return adminJson({
      ok: false,
      error: "Рішення щойно ухвалили в Telegram — оновіть список.",
    }, 409, origin);

  }

  // Картка в чаті мусить показати те саме рішення. Інакше під нею
  // лишаться живі кнопки, і натискання через тиждень означало б тихе
  // скасування — рівно те, що для замовлень закриває refreshOwnerCard.
  await background(refreshReviewCard(updated));

  return adminJson({ ok: true, review: reviewView(updated) }, 200, origin);

}

// Прибрати кнопки під карткою відгуку й дописати рішення.
//
// Старим відгукам owner_message_id лишився порожнім (колонка
// з'явилась у міграції 022) — для них просто нічого не робимо: усе
// інше працює.
async function refreshReviewCard(review: Record<string, any>) {

  if (!review?.owner_chat_id || !review?.owner_message_id) return;

  const title = await productTitle(review.product_id);

  const card = reviewCard({
    productId: review.product_id,
    orderNumber: review.order_number,
    rating: review.rating,
    author: review.author,
    body: review.body,
  }, title);

  await telegram("editMessageText", {
    chat_id: review.owner_chat_id,
    message_id: review.owner_message_id,
    text: `${card}\n\n${reviewVerdictLine(review.status)} (з адмінки)`,
    parse_mode: "HTML",
  });

}

async function handleAdmin(request: Request, body: Record<string, any>): Promise<Response> {

  const origin = request.headers.get("origin");

  // Перевірка доступу — ПЕРЕД усім іншим. Жоден запит без
  // підтверджених прав не доходить до бази.
  const token = request.headers.get(ADMIN_TOKEN_HEADER) ?? "";

  if (!await verifyAdmin(token)) {

    return adminJson({
      ok: false,
      error: "Немає доступу до замовлень. Потрібне право запису в репозиторій сайту.",
    }, 403, origin);

  }

  // Панель відгуків живе в тому самому полі admin_action, тож
  // розводимо ДО parseAdminRequest: він знає лише дії замовлень і
  // відкинув би «reviews-list» як невідому.
  //
  // Перевірка доступу вище — спільна: право те саме (запис у
  // репозиторій сайту), і дублювати її не треба.
  if (isReviewAction(body.admin_action)) {
    return await handleReviewAdmin(body, origin);
  }

  const parsed = parseAdminRequest(body);

  if (!parsed.ok) return adminJson({ ok: false, error: parsed.error }, 400, origin);

  const { action, params } = parsed;

  if (action === "list") {

    const response = await supabaseRest(buildListQuery(params), {
      headers: { Prefer: "count=exact" },
    });

    if (!response.ok) {

      console.error("Не вдалося отримати замовлення:", await response.text());

      return adminJson({ ok: false, error: "База не віддала замовлення." }, 502, origin);

    }

    const rows = await response.json();

    return adminJson(listResponse({
      orders: Array.isArray(rows) ? rows : [],
      total: parseTotal(response.headers.get("content-range")),
      counts: await adminCounts(),
    }), 200, origin);

  }

  if (action === "get") {

    const order = await findOrderById(params.id);

    if (!order) return adminJson({ ok: false, error: "Замовлення не знайдено." }, 404, origin);

    const refusals = await supabaseRest(buildRefusalsQuery(params.id));

    const rows = refusals.ok ? await refusals.json() : [];

    return adminJson({
      ok: true,
      order: orderView(order),
      refusals: (Array.isArray(rows) ? rows : []).map(refusalView),
    }, 200, origin);

  }

  if (action === "status") {

    const current = await findOrderById(params.id);

    if (!current) return adminJson({ ok: false, error: "Замовлення не знайдено." }, 404, origin);

    // Звіряємось із базою, а не з тим, що показує сторінка. Статус
    // могли змінити кнопкою в Telegram хвилину тому — тоді відкритий
    // список уже застарілий, і його кнопка означала б перехід, якого
    // з поточного статусу робити не можна.
    if (!adminTransitions(current.status).includes(params.status)) {

      return adminJson({
        ok: false,
        error: `Замовлення вже «${(STATUSES[normalizeStatus(current.status)] ?? STATUSES.new).label}» — цей перехід недоступний.`,
        order: orderView(current),
      }, 409, origin);

    }

    const updated = await updateOrderStatus(params.id, params.status);

    if (!updated) {
      return adminJson({ ok: false, error: "Не вдалося оновити статус." }, 502, origin);
    }

    // Далі — рівно те саме, що робить кнопка в Telegram: сповіщення
    // клієнту й перемальовка картки власника. Керування з панелі не
    // має відрізнятись від керування з чату нічим, крім місця
    // натискання.
    await notifyCustomer(updated, params.status);

    await refreshOwnerCard(updated);

    return adminJson({ ok: true, order: orderView(updated) }, 200, origin);

  }

  // tracking
  const updated = await applyTracking(params.id, params.tracking);

  if (!updated) {
    return adminJson({ ok: false, error: "Не вдалося зберегти накладну." }, 502, origin);
  }

  await refreshOwnerCard(updated);

  return adminJson({ ok: true, order: orderView(updated) }, 200, origin);

}

// -------------------------
// Точка входу
// -------------------------

Deno.serve(async (request) => {

  try {
    return await handleRequest(request);
  } catch (error) {
    // Будь-яка неперехоплена помилка раніше могла лишити Telegram
    // без відповіді — і той ретраїв апдейт по колу. Тепер завжди
    // відповідаємо, а причину пишемо в логи функції.
    console.error("Необроблена помилка:", error);
    return new Response("error", { status: 200 });
  }

});

async function handleRequest(request: Request): Promise<Response> {

  const origin = request.headers.get("origin");

  // Запит-дозвіл від браузера (CORS preflight). Панель адмінки живе
  // на домені сайту, функція — на supabase.co, тож браузер спершу
  // питає, чи можна взагалі звертатись. Без цієї відповіді панель не
  // отримає ані байта — і, що підступніше, у логах функції не буде
  // жодного сліду: preflight до коду просто не дійшов би.
  if (request.method === "OPTIONS") {

    return new Response(null, {
      status: isAllowedOrigin(origin) ? 204 : 403,
      headers: corsHeaders(origin),
    });

  }

  // GET — проста перевірка «чи жива функція»: відкрийте URL функції
  // в браузері, має показати ok. Якщо висить — функція не стартує.
  if (request.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  let body: Record<string, any>;

  try {
    body = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  // --- запит від панелі «Замовлення» в адмінці ---
  //
  // Розпізнаємо за власним полем admin_action. Ні Telegram, ні
  // Database Webhook такого не надсилають, тож переплутати не можна.
  //
  // Стоїть ПЕРШИМ: далі йдуть перевірки секретів, які до панелі не
  // стосуються — вона підтверджує права своїм способом (verifyAdmin).
  if (typeof body.admin_action !== "undefined") {

    return await handleAdmin(request, body);

  }

  // --- довідник Нової пошти для сторінки оформлення ---
  if (body.site_action === "nova-poshta") {

    return await handleNovaPoshta(request, body);

  }

  // --- замовлення з сайту (перевірка «ви людина») ---
  //
  // Розпізнаємо за власним полем site_action. Ні Telegram, ні
  // Database Webhook такого не надсилають.
  if (body.site_action === "place-order") {

    return await handlePlaceOrder(request, body);

  }

  // --- серверна конверсія Meta після оформлення ---
  if (body.site_action === "meta-purchase") {

    return await handleMetaPurchase(request, body);

  }

  // --- «Де моє замовлення» для гостя ---
  if (body.site_action === "order-status") {

    return await handleOrderStatus(request, body);

  }

  // --- відгук про товар ---
  if (body.site_action === "add-review") {

    return await handleAddReview(request, body);

  }

  // --- підписка на листи магазину ---
  if (body.site_action === "subscribe") {

    return await handleSubscribe(request, body);

  }

  // --- незавершене оформлення (щоб нагадати гостю) ---
  if (body.site_action === "checkout-draft") {

    return await handleCheckoutDraft(request, body);

  }

  // Перевірка нижче — саме для Telegram. Панель до неї не доходить
  // навмисно: без токена бота вона все одно вміє показувати
  // замовлення й міняти статуси, просто не надішле сповіщень. А ще
  // ця відповідь пішла б без заголовків CORS — і замість зрозумілого
  // «не заданий токен» браузер показав би панелі невиразну помилку
  // мережі.
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN не заданий");
    return new Response("misconfigured", { status: 500 });
  }

  // --- запит від Telegram ---
  // Розпізнаємо за наявністю update_id (є в кожному апдейті Telegram)
  if (typeof body.update_id !== "undefined") {

    // Telegram надсилає секрет, заданий у setWebhook. Без перевірки
    // будь-хто, хто дізнався URL функції, міг би підробляти
    // натискання кнопок і міняти статуси замовлень.
    const secret = request.headers.get("x-telegram-bot-api-secret-token");

    if (TELEGRAM_WEBHOOK_SECRET && secret !== TELEGRAM_WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    if (body.callback_query) {
      await background(handleCallback(body.callback_query));
    } else if (body.message) {
      await background(handleMessage(body.message));
    }

    return new Response("ok", { status: 200 });

  }

  // --- Відмова від товару (заявка клієнта) ---
  if (body.type === "INSERT" && body.table === "order_refusals" && body.record) {

    const secret = request.headers.get("x-hook-secret");

    if (HOOK_SECRET && secret !== HOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    await background(handleRefusal(body.record, body.order));

    return new Response("ok", { status: 200 });

  }

  // --- Database Webhook від Supabase ---
  if (body.type === "INSERT" && body.table === "orders" && body.record) {

    const secret = request.headers.get("x-hook-secret");

    if (HOOK_SECRET && secret !== HOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    await background(handleNewOrder(body.record));

    return new Response("ok", { status: 200 });

  }

  return new Response("ignored", { status: 200 });

}
