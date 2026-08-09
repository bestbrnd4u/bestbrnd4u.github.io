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

export const STATUSES = {
  new:       { label: "Нове",           emoji: "🆕" },
  taken:     { label: "Взято в роботу", emoji: "👌" },
  confirmed: { label: "Підтверджено",   emoji: "✅" },
  shipped:   { label: "Відправлено",    emoji: "📦" },
  cancelled: { label: "Скасовано",      emoji: "❌" },
};

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

  const status = STATUSES[order.status] ?? STATUSES.new;

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

  const next =
    current === "new"       ? ["taken", "cancelled"] :
    current === "taken"     ? ["confirmed", "cancelled"] :
    current === "confirmed" ? ["shipped", "cancelled"] :
    [];

  if (!next.length) return undefined;

  return {
    inline_keyboard: [
      next.map((key) => ({
        text: `${STATUSES[key].emoji} ${STATUSES[key].label}`,
        callback_data: `st:${key}:${orderId}`,
      })),
    ],
  };

}
