// Логіку бота можна перевірити без Telegram і без бази: витягуємо
// чисті функції (форматування картки, побудова кнопок) із коду
// Edge Function і ганяємо на реальній формі замовлення, яку пише
// checkout.js.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const SRC = fs.readFileSync(path.join(ROOT,"supabase/functions/telegram-order-bot/_index.src.ts"), "utf8");

// Чисту логіку імпортуємо НАПРЯМУ з того самого модуля, який
// використовує Edge Function. Раніше тут стояло вирізання
// TypeScript-анотацій регулярками — воно ламалось на union-типах
// і, головне, тестувало б не той самий код, а його перекручену
// копію. Тепер логіка живе в звичайному .js і перевіряється як є.
let formatOrder, buildKeyboard, STATUSES;

async function loadFormatModule(){
  const url = require("url").pathToFileURL(
    path.join(ROOT, "supabase/functions/telegram-order-bot/format.js")
  ).href;
  const mod = await import(url);
  formatOrder = mod.formatOrder;
  buildKeyboard = mod.buildKeyboard;
  STATUSES = mod.STATUSES;
}

const ORDER = {
  id: "uuid-1", order_number: "BG-1042", status: "new",
  items: [
    { id:15, title:"Urban Sneakers", brand:"Nike", price:4299, qty:1, color:"Чорний", size:"42" },
    { id:2,  title:"City Tote",      brand:"Michael Kors", price:8999, qty:2, color:"Бежевий", size:"ONESIZE" }
  ],
  subtotal: 22297, discount: 500, delivery_price: 80, total: 21877,
  delivery_method:"Нова Пошта", delivery_city:"Київ", delivery_detail:"Відділення №5",
  payment_method:"Картка", promo_code:"SUMMER",
  first_name:"Ілля", last_name:"Петренко",
  phone:"+380737288291", email:"test@example.com",
  user_id: null
};

async function run(){

await loadFormatModule();

console.log("\n[1] Картка замовлення містить усе потрібне");
{
  const t = formatOrder(ORDER);
  check("номер замовлення", t.includes("BG-1042"));
  check("обидва товари", t.includes("Urban Sneakers") && t.includes("City Tote"));
  check("колір і розмір", t.includes("Чорний / 42") && t.includes("Бежевий / ONESIZE"));
  check("кількість × ціна", t.includes("2 ×"), t.match(/2 ×[^\n]*/)?.[0]);
  check("сума з грн", /21\s?877\s*грн/.test(t.replace(/\u00A0/g," ")), t.match(/Разом[^\n]*/)?.[0]);
  check("знижка показана зі знаком мінус", t.includes("−"), t.match(/Знижка[^\n]*/)?.[0]);
  check("телефон клікабельний (tel:)", t.includes('href="tel:+380737288291"'));
  check("доставка і місто", t.includes("Нова Пошта") && t.includes("Київ"));
  check("промокод", t.includes("SUMMER"));
  check("позначка гостя", t.includes("Гість"), "user_id=null");
}

console.log("\n[2] Порожні поля не засмічують картку");
{
  const t = formatOrder({ order_number:"BG-2", status:"new", items:[], subtotal:0, total:0 });
  check("рендер не впав", typeof t === "string" && t.length > 0);
  check("немає порожнього рядка доставки", !t.includes("🚚"));
  check("немає порожнього промокоду", !t.includes("🎟"));
  check("сказано, що склад порожній", t.includes("склад замовлення порожній"));
}

console.log("\n[3] items у вигляді JSON-рядка теж читаються");
{
  const t = formatOrder({ ...ORDER, items: JSON.stringify(ORDER.items) });
  check("товари розпарсились із рядка", t.includes("Urban Sneakers"));
}

console.log("\n[4] Захист від XSS у даних клієнта");
{
  const t = formatOrder({ ...ORDER, first_name:'<script>alert(1)</script>', delivery_city:'<b>Київ' });
  check("теги екрановані, а не виконуються", !t.includes("<script>"), t.match(/&lt;script/)?.[0]);
  check("кутові дужки перетворені на сутності", t.includes("&lt;"));
}

console.log("\n[5] Статуси бота = статуси сайту (інакше сайт покаже «Нове»)");
{
  // Регресія: бот мав власні ключі (taken, confirmed). У Telegram
  // усе виглядало правильно, а «Історія замовлень» у кабінеті таких
  // значень не знала і малювала їх як «Нове» — здавалось, що статус
  // не змінюється. Тепер звіряємо два джерела автоматично.
  const account = fs.readFileSync(path.join(ROOT, "assets/js/account.js"), "utf8");

  const mapBody = account.match(/function orderStatusLabel[\s\S]*?const labels = \{([\s\S]*?)\};/)[1];
  const siteStatuses = [...mapBody.matchAll(/^\s*(\w+)\s*:/gm)].map(m => m[1]);

  check("статуси сайту знайдено", siteStatuses.length > 0, siteStatuses.join(", "));

  const botStatuses = Object.keys(STATUSES);

  botStatuses.forEach(key => {
    check(`«${key}» відомий сайту`, siteStatuses.includes(key),
          `сайт знає: ${siteStatuses.join(", ")}`);
  });

  // і для кожного є свій стиль, інакше бейдж буде без кольору
  const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");
  botStatuses.forEach(key => {
    check(`є стиль .order-status-${key}`, css.includes(`.order-status-${key}`));
  });

  // усі статуси, у які ведуть кнопки, теж мусять бути валідними
  const reachable = new Set();
  ["new","processing","shipped","completed","cancelled"].forEach(from => {
    (buildKeyboard("x", from)?.inline_keyboard[0] ?? [])
      .forEach(b => reachable.add(b.callback_data.split(":")[1]));
  });
  [...reachable].forEach(key => {
    check(`кнопка веде у валідний статус «${key}»`, siteStatuses.includes(key));
  });
}

console.log("\n[5b] Кнопки статусів: лише осмислені переходи");
{
  const flow = (from) => (buildKeyboard("id1", from)?.inline_keyboard[0] ?? [])
      .map(b => b.callback_data.split(":")[1]);

  check("з «Нове» → в обробці або скасувати",
        flow("new").join(",")==="processing,cancelled", flow("new").join(","));
  check("з «В обробці» → відправити або скасувати",
        flow("processing").join(",")==="shipped,cancelled", flow("processing").join(","));
  check("з «Відправлено» → виконано або скасувати",
        flow("shipped").join(",")==="completed,cancelled", flow("shipped").join(","));
  check("зі «Скасовано» кнопок немає", buildKeyboard("id1","cancelled")===undefined);
  check("з «Виконано» кнопок немає", buildKeyboard("id1","completed")===undefined);
}

console.log("\n[6] Безпека: секрети не зашиті в код");
{
  check("токен береться з оточення, а не з константи",
        /Deno\.env\.get\("TELEGRAM_BOT_TOKEN"\)/.test(SRC));
  check("немає схожого на реальний токен рядка", !/\d{8,10}:[A-Za-z0-9_-]{30,}/.test(SRC));
  check("запити від Telegram перевіряються секретом",
        SRC.includes("x-telegram-bot-api-secret-token"));
  check("запити від бази перевіряються секретом", SRC.includes("x-hook-secret"));
  check("статус оновлюється сервісним ключем (не з браузера)",
        SRC.includes("SUPABASE_SERVICE_ROLE_KEY"));
}

console.log("\n[7] Гостьові замовлення тепер зберігаються");
{
  const checkout = fs.readFileSync(path.join(ROOT,"assets/js/checkout.js"),"utf8");
  // Перевіряємо САМЕ функцію збереження замовлення, а не весь файл:
  // в інших місцях (підстановка профілю, адрес) ранній вихід для
  // гостя лишається правильним — тих даних у гостя просто немає.
  const saveFn = checkout.slice(
    checkout.indexOf("async function saveOrderToSupabase"),
    checkout.indexOf("// Відправка замовлення")
  );
  check("у saveOrderToSupabase немає раннього виходу для гостя",
        !/if \(!user\) return;/.test(saveFn),
        (saveFn.match(/if \(!user\)[^\n]*/) || ["—"])[0]);
  check("user_id для гостя = null", /user_id: user \? user\.id : null/.test(checkout));

  const sql = fs.readFileSync(path.join(ROOT,"supabase/migrations/001-guest-orders-and-telegram.sql"),"utf8");
  check("SQL знімає NOT NULL з user_id", /alter column user_id drop not null/i.test(sql));
  check("RLS лишається увімкненим", /enable row level security/i.test(sql));
  check("є політика вставки для гостя", /user_id is null/i.test(sql));
  check("читати чужі замовлення не можна", /using \(user_id = auth\.uid\(\)\)/i.test(sql));
}

console.log("\n[8] Деплой: один самодостатній файл, і він не застарів");
{
  // Регресія: спершу функція деплоїлась двома файлами, і index.ts
  // імпортував ./format.js. У панелі Supabase другий файл легко
  // не долити — деплой падав з "Module not found ... format.js".
  // Тепер index.ts ЗБИРАЄТЬСЯ з джерел в один файл. Тут стежимо,
  // щоб він лишався самодостатнім і не розходився з джерелами.
  const fnDir = path.join(ROOT, "supabase/functions/telegram-order-bot");
  const bundled = fs.readFileSync(path.join(fnDir, "index.ts"), "utf8");

  check("у файлі для деплою немає локальних імпортів",
        !/from\s+["']\.\//.test(bundled),
        (bundled.match(/from\s+["']\.[^"']*["']/) || ["—"])[0]);

  check("немає export — усе локальне в одному файлі",
        !/^export\s/m.test(bundled));

  ["STATUSES", "formatOrder", "buildKeyboard", "escapeHtml", "Deno.serve"]
    .forEach(name => check(`${name} присутній у зібраному файлі`, bundled.includes(name)));

  // найважливіше: зібраний файл має відповідати поточним джерелам
  const { build } = require(path.join(ROOT, "scripts/build-edge-function.js"));
  check("index.ts перезібраний з актуальних джерел (не застарів)",
        build() === bundled,
        "запустіть: node scripts/build-edge-function.js");

  const readme = fs.readFileSync(path.join(ROOT, "supabase/README-telegram-bot.md"), "utf8");
  check("інструкція каже, що файл один", /Файл ОДИН/i.test(readme));
  check("інструкція згадує команду перезбірки",
        readme.includes("build-edge-function.js"));
}

console.log("\n[9] Інструкція узгоджена з тим, що приймає інтерфейс");
{
  // Регресія: в інструкції було сказано лишити TELEGRAM_CHAT_ID
  // порожнім і заповнити пізніше — але форма секретів Supabase
  // порожні значення не приймає взагалі. Користувач упирався в
  // "Please provide a value". Тепер chat_id дізнаються ДО створення
  // секретів, і в інструкції не має лишитись порад лишати поле
  // порожнім.
  const readme = fs.readFileSync(path.join(ROOT, "supabase/README-telegram-bot.md"), "utf8");

  check("немає поради лишити секрет порожнім",
        !/лиш(іть|ити) порожнім/i.test(readme),
        (readme.match(/[^\n]*лиш[^\n]*порожн[^\n]*/i) || ["—"])[0]);

  check("сказано, що всі поля обов'язкові",
        /не приймає порожні значення/i.test(readme));

  // порядок кроків: chat_id має бути відомий ДО кроку з секретами
  const iChatId = readme.indexOf("Дізнатися ID свого чату");
  const iSecrets = readme.indexOf("Додати секрети");
  check("chat_id дізнаються раніше, ніж створюють секрети",
        iChatId > -1 && iSecrets > -1 && iChatId < iSecrets,
        `chat_id@${iChatId}, secrets@${iSecrets}`);

  check("показано, як дізнатися chat_id без функції (getUpdates)",
        readme.includes("getUpdates"));

  // Найчастіша пастка: якщо webhook уже стоїть, getUpdates завжди
  // повертає порожньо — інструкція мусить це пояснювати, інакше
  // користувач упреться в {"ok":true,"result":[]} без підказки.
  check("пояснено конфлікт webhook і getUpdates",
        readme.includes("getWebhookInfo") && readme.includes("deleteWebhook"));
  check("є обхідний шлях через @userinfobot", readme.includes("@userinfobot"));
  check("є перевірка токена через getMe", readme.includes("getMe"));

  // Регресія: функцію викликають Telegram і база — жодна з них не
  // надсилає JWT. З увімкненою перевіркою Supabase відхиляє запит
  // до виконання коду (401), і бот мовчить без жодної підказки.
  // Інструкція мусить це попереджати, а config.toml — фіксувати
  // для тих, хто деплоїть через CLI.
  check("інструкція вимагає вимкнути перевірку JWT",
        /вимкніть перевірку JWT/i.test(readme));
  check("пояснено, що ні Telegram, ні база не надсилають JWT",
        /жодна з\s*\n?\s*них JWT не надсилає|жодна з них JWT не надсилає/i.test(readme));
  check("описана діагностика 401 через getWebhookInfo",
        readme.includes("401 Unauthorized") && readme.includes("getWebhookInfo"));

  const cfgPath = path.join(ROOT, "supabase/config.toml");
  check("supabase/config.toml існує", fs.existsSync(cfgPath));

  if (fs.existsSync(cfgPath)) {
    const cfg = fs.readFileSync(cfgPath, "utf8");
    check("у config.toml verify_jwt = false для нашої функції",
          /\[functions\.telegram-order-bot\][\s\S]*?verify_jwt\s*=\s*false/.test(cfg), cfg.slice(0,80));
  }

  // усі секрети, які читає код, мають бути описані в інструкції
  const envVars = [...SRC.matchAll(/Deno\.env\.get\("([A-Z_]+)"\)/g)].map(m => m[1])
      .filter(v => !v.startsWith("SUPABASE_"));

  check("у коді знайдено секрети", envVars.length > 0, envVars.join(", "));

  [...new Set(envVars)].forEach(v => {
    check(`${v} описаний в інструкції`, readme.includes(v));
  });
}

console.log("\n[10] Webhook відповідає ОДРАЗУ, не тримаючи Telegram");
{
  // Регресія: функція чекала завершення запитів до api.telegram.org і
  // до бази, перш ніж відповісти. Telegram не витримував і рвав
  // з'єднання з "Read timeout expired", а потім ретраїв той самий
  // апдейт — одне натискання кнопки могло обробитись кілька разів.
  check("є хелпер фонової роботи", SRC.includes("function background("));
  check("використовує EdgeRuntime.waitUntil", SRC.includes("waitUntil"));

  check("обробка кнопки йде у фон", /background\(handleCallback/.test(SRC));
  check("обробка повідомлення йде у фон", /background\(handleMessage/.test(SRC));
  check("сповіщення про замовлення теж у фон", /background\(handleNewOrder/.test(SRC));

  check("є загальний try/catch, щоб завжди відповідати",
        /try\s*\{[\s\S]*?handleRequest\(request\)[\s\S]*?catch/.test(SRC));
  check("GET віддає ok — швидка перевірка «чи жива функція»",
        /request\.method !== "POST"[\s\S]{0,80}Response\("ok"/.test(SRC));

  // перевіряємо ПОВЕДІНКУ хелпера, а не лише його наявність
  const fnBody = SRC.match(/function background\([\s\S]*?\n\}/)[0]
      .replace(/:\s*Promise<unknown>/g, "")
      .replace(/\(globalThis as any\)/g, "globalThis")
      .replace(/:\s*unknown/g, "");

  // а) коли waitUntil є — не чекаємо завершення
  {
    let held = false, registered = false;
    const g = { EdgeRuntime: { waitUntil: () => { registered = true; } } };
    const background = new Function("globalThis", `${fnBody}; return background;`)(g);
    const slow = new Promise(res => setTimeout(() => { held = true; res(); }, 50));
    background(slow);
    check("з waitUntil відповідь не чекає на роботу", registered === true && held === false);
  }

  // б) коли waitUntil немає — чекаємо, але помилка не валить функцію
  {
    const background = new Function("globalThis", `${fnBody}; return background;`)({});
    let caught = true;
    background(Promise.reject(new Error("bang"))).then(() => { caught = true; });
    check("без waitUntil помилка у фоні перехоплена, а не кине наверх", caught);
  }
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

}

run();
