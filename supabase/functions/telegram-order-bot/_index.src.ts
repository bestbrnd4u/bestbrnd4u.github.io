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
import { STATUSES, normalizeStatus, formatOrder, buildKeyboard } from "./format.js";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

// секрет, яким Supabase підписує Database Webhook (заголовок x-hook-secret)
const HOOK_SECRET = Deno.env.get("HOOK_SECRET") ?? "";

// секрет, яким Telegram підписує свої запити (задається в setWebhook)
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

// ці дві змінні Supabase підставляє в Edge Functions автоматично
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

  const text: string = message.text ?? "";

  if (text.startsWith("/start") || text.startsWith("/id")) {

    await telegram("sendMessage", {
      chat_id: message.chat.id,
      text:
        `Бот заявок Bagvero.\n\n` +
        `ID цього чату: <code>${message.chat.id}</code>\n\n` +
        `Впишіть його в секрет <b>TELEGRAM_CHAT_ID</b>, ` +
        `щоб сюди приходили нові замовлення.`,
      parse_mode: "HTML",
    });

  }

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
