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
export const STATUSES = {
  new:        { label: "Нове",      emoji: "🆕" },
  processing: { label: "В обробці", emoji: "👌" },
  shipped:    { label: "Відправлено", emoji: "📦" },
  completed:  { label: "Виконано",  emoji: "🎉" },
  cancelled:  { label: "Скасовано", emoji: "❌" },
};

// Значення, що лишились від першої версії бота. Щоб такі замовлення
// не виглядали зламаними в Telegram, показуємо їх як «В обробці», а
// кнопки повертають їх у нормальний ланцюжок.
export const LEGACY_STATUSES = {
  taken: "processing",
  confirmed: "processing",
};

export function normalizeStatus(status) {
  return LEGACY_STATUSES[status] ?? status;
}

// Дані замовлення приходять від клієнта (імʼя, місто, коментар),
// а повідомлення надсилається з parse_mode:"HTML" — без екранування
// хтось міг би підсунути розмітку у власне імʼя й зламати картку.
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString("uk-UA")} грн` : "—";
}

export function formatOrder(order) {

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
export function buildKeyboard(orderId, current) {

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
