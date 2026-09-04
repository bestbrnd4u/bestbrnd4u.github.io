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
import {
  STATUSES, normalizeStatus, formatOrder, formatRefusal, buildKeyboard,
  parseStartPayload, formatProductCard, buildProductKeyboard, absoluteImageUrl,
  customerStatusMessage, customerStatusKeyboard, validateTracking, parseTtnCommand,
  orderListLine, orderListKeyboard,
} from "./format.js";
import {
  ADMIN_TOKEN_HEADER, corsHeaders, isAllowedOrigin, parseAdminRequest,
  adminTransitions, buildListQuery, buildCountQuery, buildRefusalsQuery,
  parseTotal, orderView, refusalView, listResponse, STATUS_ORDER,
} from "./admin-api.js";
import {
  DELIVERY_OPTIONS, deliveryById, colorsOf, sizesOf, autoFill, nextStep,
  colorKeyboard, sizeKeyboard, qtyKeyboard, deliveryKeyboard, phoneKeyboard,
  confirmKeyboard, stepPrompt, summaryText, computeTotals,
  validateCity, validateDetail, validatePhone,
  generateOrderNumber, buildOrderRow,
} from "./order-flow.js";

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
