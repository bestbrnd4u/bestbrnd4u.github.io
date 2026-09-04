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

// items приходить або масивом, або JSON-рядком — залежно від того, як
// драйвер віддав jsonb-колонку. Те саме стосується переліку в заявці
// на відмову, тож розбір спільний.
export function parseItems(value) {

  try {
    const items = typeof value === "string" ? JSON.parse(value) : (value ?? []);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }

}

// Рядок складу: назва, варіант, кількість × ціна.
function itemLine(item) {

  const details = [item.color, item.size].filter(Boolean).join(" / ");

  return [
    `• <b>${escapeHtml(item.title)}</b>`,
    item.brand ? ` (${escapeHtml(item.brand)})` : "",
    details ? `\n   ${escapeHtml(details)}` : "",
    `\n   ${item.qty ?? 1} × ${money(item.price)}`,
  ].join("");

}

export function formatOrder(order) {

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
export function formatRefusal(record, order) {

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
export function allowedTransitions(current) {

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
export function buildKeyboard(orderId, current, options = {}) {

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
export function parseStartPayload(text) {

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
export function absoluteImageUrl(src, siteUrl) {

  const value = String(src ?? "").trim();

  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  return `${String(siteUrl).replace(/\/$/, "")}/${value.replace(/^\//, "")}`;

}

// Підпис під фото товару. Ліміт Telegram на caption — 1024 символи,
// тож опис підрізаємо: інакше повідомлення не надішлеться взагалі.
export function formatProductCard(product, siteUrl) {

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

export function buildProductKeyboard(product, siteUrl) {

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
export function trackingUrl(ttn) {

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
export function validateTracking(text) {

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
export function customerStatusMessage(order, status) {

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
export function customerStatusKeyboard(order, status) {

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
export function parseTtnCommand(text) {

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
export function orderListLine(order) {

  const status = STATUSES[normalizeStatus(order.status)] ?? STATUSES.new;

  const marks = [
    order.tracking_number ? "" : "без ТТН",
    order.refusal_requested_at ? "❗відмова" : "",
  ].filter(Boolean).join(", ");

  return `${status.emoji} <b>${escapeHtml(order.order_number ?? "")}</b> — ` +
         `${money(order.total)}${marks ? ` · <i>${escapeHtml(marks)}</i>` : ""}`;

}

// Кнопки списку: по одній на замовлення, щоб відкрити картку.
export function orderListKeyboard(orders) {

  const rows = (orders || []).map((order) => ([{
    text: `${(STATUSES[normalizeStatus(order.status)] ?? STATUSES.new).emoji} ` +
          `${order.order_number ?? ""} · ${money(order.total)}` +
          (order.tracking_number ? "" : " · без ТТН"),
    callback_data: `open:${order.id}`,
  }]));

  if (!rows.length) return undefined;

  return { inline_keyboard: rows };

}
