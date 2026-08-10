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

import { escapeHtml, money } from "./format.js";

// Способи доставки — ті самі назви й ціни, що в checkout.html.
// ⚠️ Мусять збігатися з сайтом: назва їде в orders.delivery_method,
// і якщо тексти розійдуться, у вашій Telegram-картці й в «Історії
// замовлень» будуть різні формулювання для того самого способу.
export const DELIVERY_OPTIONS = [
  { id: "np_office",  label: "На відділення «Нова пошта»", price: 60, needsDetail: "Номер відділення" },
  { id: "np_box",     label: "Поштомат «Нова пошта»",      price: 60, needsDetail: "Номер поштомата" },
  { id: "np_courier", label: "Кур'єром «Нова пошта»",      price: 95, needsDetail: "Вулиця, будинок, квартира" },
];

export const MAX_QTY = 10;

export function deliveryById(id) {
  return DELIVERY_OPTIONS.find((o) => o.id === id) ?? null;
}

// За назвою, яка вже лежить у чернетці (delivery_method).
// Навмисно НЕ зберігаємо окремо delivery_id: зайве поле в чернетці
// означало б ще одну колонку в таблиці, яку легко забути додати —
// саме на цьому діалог і зупинявся.
export function deliveryByLabel(label) {
  return DELIVERY_OPTIONS.find((o) => o.label === label) ?? null;
}

// -------------------------
// Доступні варіанти товару
// -------------------------

export function colorsOf(product) {
  return (product?.variants ?? []).map((v) => v.color).filter(Boolean);
}

export function sizesOf(product, color) {

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

export function computeTotals(product, qty, deliveryPrice) {

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

export function nextStep(step, product, session) {

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
export function autoFill(product, session) {

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

export function colorKeyboard(product) {

  const buttons = colorsOf(product).map((color, i) => ({
    text: color,
    // у callback_data кладемо ІНДЕКС, а не назву: ліміт Telegram —
    // 64 байти, а українська назва в UTF-8 з'їдає їх швидко
    callback_data: `o:color:${i}`,
  }));

  return { inline_keyboard: [...rows(buttons, 2), CANCEL_ROW] };

}

export function sizeKeyboard(product, color) {

  const buttons = sizesOf(product, color).map((size, i) => ({
    text: size,
    callback_data: `o:size:${i}`,
  }));

  return { inline_keyboard: [...rows(buttons, 4), CANCEL_ROW] };

}

export function qtyKeyboard() {

  const buttons = [];

  for (let n = 1; n <= 5; n++) {
    buttons.push({ text: String(n), callback_data: `o:qty:${n}` });
  }

  return { inline_keyboard: [buttons, CANCEL_ROW] };

}

export function deliveryKeyboard() {

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
export function phoneKeyboard() {

  return {
    keyboard: [
      [{ text: "📱 Поділитися номером", request_contact: true }],
      [{ text: "✖️ Скасувати" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };

}

export function confirmKeyboard() {

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

export function stepPrompt(step, product, session) {

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

export function summaryText(product, session) {

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

export function validateCity(text) {

  const value = String(text ?? "").trim();

  if (value.length < 2) return { ok: false, error: "Назва міста надто коротка — напишіть повністю." };
  if (value.length > 80) return { ok: false, error: "Назва міста надто довга." };

  return { ok: true, value };

}

export function validateDetail(text) {

  const value = String(text ?? "").trim();

  if (value.length < 1) return { ok: false, error: "Напишіть, будь ласка, деталі доставки." };
  if (value.length > 200) return { ok: false, error: "Надто довго — вкажіть коротше." };

  return { ok: true, value };

}

// Номер може прийти і кнопкою (contact), і текстом — приймаємо обидва,
// але перевіряємо, що це справді схоже на телефон.
export function validatePhone(text) {

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

export function generateOrderNumber(now = Date.now(), random = Math.random) {

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

export function buildOrderRow(product, session, orderNumber) {

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
