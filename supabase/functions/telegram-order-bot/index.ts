// ⚠️ ЦЕЙ ФАЙЛ ЗГЕНЕРОВАНО АВТОМАТИЧНО — НЕ РЕДАГУЙТЕ ВРУЧНУ.
//
// Джерела:
//   supabase/functions/telegram-order-bot/format.js      (картка замовлення)
//   supabase/functions/telegram-order-bot/order-flow.js  (діалог оформлення)
//   supabase/functions/telegram-order-bot/admin-api.js   (панель замовлень в адмінці)
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
function itemLine(item) {

  const details = [item.color, item.size].filter(Boolean).join(" / ");

  return [
    `• <b>${escapeHtml(item.title)}</b>`,
    item.brand ? ` (${escapeHtml(item.brand)})` : "",
    details ? `\n   ${escapeHtml(details)}` : "",
    `\n   ${item.qty ?? 1} × ${money(item.price)}`,
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
        "Access-Control-Allow-Headers": `Content-Type, ${ADMIN_TOKEN_HEADER}`,
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

    await notifyCustomer(order, "shipped");

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

    await telegram("sendMessage", {
      chat_id: chatId,
      text: updated?.telegram_chat_id
        ? `✅ Накладну <code>${escapeHtml(command.tracking)}</code> збережено для замовлення ` +
          `<b>${escapeHtml(command.orderNumber)}</b> і надіслано клієнту.`
        : `✅ Накладну збережено для замовлення <b>${escapeHtml(command.orderNumber)}</b>. ` +
          `Клієнт замовляв на сайті — передайте номер телефоном.`,
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
    text: order.telegram_chat_id
      ? `✅ Накладну <code>${escapeHtml(check.value)}</code> збережено для замовлення ` +
        `<b>${escapeHtml(order.order_number ?? "")}</b> і надіслано клієнту.`
      : `✅ Накладну збережено для замовлення <b>${escapeHtml(order.order_number ?? "")}</b>. ` +
        `Клієнт замовляв на сайті, тож у Telegram його не сповістити — передайте номер телефоном.`,
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
