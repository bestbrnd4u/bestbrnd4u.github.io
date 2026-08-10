// ⚠️ ЦЕЙ ФАЙЛ ЗГЕНЕРОВАНО АВТОМАТИЧНО — НЕ РЕДАГУЙТЕ ВРУЧНУ.
//
// Джерела:
//   supabase/functions/telegram-order-bot/format.js      (картка замовлення)
//   supabase/functions/telegram-order-bot/order-flow.js  (діалог оформлення)
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

function formatOrder(order) {

  const status = STATUSES[normalizeStatus(order.status)] ?? STATUSES.new;

  // items приходить або масивом, або JSON-рядком — залежно від того,
  // як драйвер віддав jsonb-колонку
  let items = [];

  try {
    items = typeof order.items === "string" ? JSON.parse(order.items) : (order.items ?? []);
  } catch {
    items = [];
  }

  const lines = items.map((item) => {

    const details = [item.color, item.size].filter(Boolean).join(" / ");

    return [
      `• <b>${escapeHtml(item.title)}</b>`,
      item.brand ? ` (${escapeHtml(item.brand)})` : "",
      details ? `\n   ${escapeHtml(details)}` : "",
      `\n   ${item.qty ?? 1} × ${money(item.price)}`,
    ].join("");

  }).join("\n");

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
  ];

  return rows.filter((r) => r !== "").join("\n");

}

// Показуємо лише ті статуси, у які має сенс переходити з поточного —
// щоб не тицьнути «Відправлено» на скасованому замовленні.
function buildKeyboard(orderId, current) {

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
  const valid = next.filter((key) => STATUSES[key]);

  if (!valid.length) return undefined;

  return {
    inline_keyboard: [
      valid.map((key) => ({
        text: `${STATUSES[key].emoji} ${STATUSES[key].label}`,
        callback_data: `st:${key}:${orderId}`,
      })),
    ],
  };

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
function validateTracking(text) {

  const raw = String(text ?? "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) return { ok: false, error: "Це не схоже на номер накладної. Надішліть 14 цифр або /skip." };
  if (digits.length < 10) return { ok: false, error: `Замало цифр (${digits.length}). ТТН Нової пошти — 14 цифр. Або /skip.` };
  if (digits.length > 20) return { ok: false, error: "Забагато цифр для номера накладної. Або /skip." };

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
const DELIVERY_OPTIONS = [
  { id: "np_office",  label: "На відділення «Нова пошта»", price: 60, needsDetail: "Номер відділення" },
  { id: "np_box",     label: "Поштомат «Нова пошта»",      price: 60, needsDetail: "Номер поштомата" },
  { id: "np_courier", label: "Кур'єром «Нова пошта»",      price: 95, needsDetail: "Вулиця, будинок, квартира" },
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
    text: `${option.label} — ${option.price} грн`,
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
    `Доставка: ${money(totals.delivery)}`,
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
// Telegram-бот для заявок Bagvero
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
  "first_name", "last_name", "phone", "awaiting_ttn_for",
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

  if (step === "confirm") {

    await telegram("sendMessage", {
      chat_id: chatId,
      text: summaryText(product, session),
      parse_mode: "HTML",
      reply_markup: confirmKeyboard(),
    });

    return;

  }

  const keyboards: Record<string, unknown> = {
    color: colorKeyboard(product),
    size: sizeKeyboard(product, session.color),
    qty: qtyKeyboard(),
    delivery: deliveryKeyboard(),
    phone: phoneKeyboard(),
  };

  await telegram("sendMessage", {
    chat_id: chatId,
    text: stepPrompt(step, product, session),
    parse_mode: "HTML",
    reply_markup: keyboards[step] ?? { remove_keyboard: true },
  });

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

  await telegram("sendMessage", {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buildKeyboard(record.id, record.status ?? "new"),
  });

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
    reply_markup: buildKeyboard(updated.id, status),
  });

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
  if (String(message.text ?? "").startsWith("/id")) {

    await telegram("sendMessage", {
      chat_id: chatId,
      text: `ID цього чату: <code>${chatId}</code>`,
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
      "Вітаємо в <b>Bagvero</b> 👋\n\n" +
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
// Сповіщення клієнту
// -------------------------

async function notifyCustomer(order: Record<string, any>, status: string) {

  const chatId = order?.telegram_chat_id;

  // замовлення з сайту — чату немає, це нормально
  if (!chatId) return;

  const text = customerStatusMessage(order, status);

  if (!text) return;

  await telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: customerStatusKeyboard(order, status),
  });

}

// -------------------------
// Введення номера накладної власником
//
// Повертає true, якщо повідомлення було номером ТТН — тоді решта
// обробників його не чіпає.
// -------------------------

async function handleTrackingInput(message: Record<string, any>): Promise<boolean> {

  const chatId = message.chat.id;

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

  // зберігаємо ТТН і одразу шлемо клієнту
  const response = await supabaseRest(
    `orders?id=eq.${encodeURIComponent(session.awaiting_ttn_for)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ tracking_number: check.value }),
    },
  );

  const rows = response.ok ? await response.json() : [];
  const order = Array.isArray(rows) ? rows[0] : null;

  await saveSession(chatId, { awaiting_ttn_for: null });

  if (!order) {

    await telegram("sendMessage", { chat_id: chatId, text: "Не вдалося зберегти накладну." });

    return true;

  }

  await notifyCustomer(order, "shipped");

  await telegram("sendMessage", {
    chat_id: chatId,
    text: order.telegram_chat_id
      ? `✅ Накладну збережено і надіслано клієнту.`
      : `✅ Накладну збережено. Клієнт замовляв на сайті, тож у Telegram його не сповістити — передайте номер телефоном.`,
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

    await advance(chatId, "phone", product, {
      ...session,
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

  // GET — проста перевірка «чи жива функція»: відкрийте URL функції
  // в браузері, має показати ok. Якщо висить — функція не стартує.
  if (request.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN не заданий");
    return new Response("misconfigured", { status: 500 });
  }

  let body: Record<string, any>;

  try {
    body = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
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
