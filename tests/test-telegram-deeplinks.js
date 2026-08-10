// Глибокі посилання з Instagram: t.me/бот?start=product_15 має
// відкривати бота одразу на потрібному товарі.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
const { findProductById } = require("./helpers/products");

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const SRC = fs.readFileSync(path.join(ROOT,"supabase/functions/telegram-order-bot/_index.src.ts"),"utf8");
const SITE = "https://bestbrnd4u.github.io";

let M;

(async () => {

M = await import(require("url").pathToFileURL(
  path.join(ROOT, "supabase/functions/telegram-order-bot/format.js")
).href);

console.log("\n[1] Розбір посилання — усі написання, які реально вставляють руками");
{
  const p = M.parseStartPayload;

  [["/start product_15", 15], ["/start product-15", 15], ["/start p15", 15], ["/start 15", 15]]
    .forEach(([text, id]) => {
      const r = p(text);
      check(`${JSON.stringify(text)} → товар ${id}`,
            r && r.type === "product" && r.id === id, JSON.stringify(r));
    });

  // Telegram у групах додає @ім'я_бота до команди
  const withBot = p("/start@bagvero_bot product_15");
  check("команда з @іменем бота теж працює",
        withBot?.type === "product" && withBot.id === 15, JSON.stringify(withBot));

  check("порожній /start → привітання", p("/start")?.type === "welcome");
  check("зайві пробіли не ламають", p("  /start   product_15 ")?.id === 15);
  check("сміття в параметрі не видає за товар", p("/start hello")?.type === "unknown");
  check("не /start — ігноруємо", p("привіт") === null);
}

console.log("\n[2] Абсолютні URL картинок (Telegram відносні не приймає)");
{
  const a = M.absoluteImageUrl;
  check("шлях на сайті → абсолютний",
        a("/assets/images/a.webp", SITE) === `${SITE}/assets/images/a.webp`,
        a("/assets/images/a.webp", SITE));
  check("зовнішнє посилання лишається як є",
        a("https://example.com/a.jpg", SITE) === "https://example.com/a.jpg");
  check("шлях без початкового слеша теж",
        a("assets/a.webp", SITE) === `${SITE}/assets/a.webp`);
  check("порожнє значення → порожньо", a("", SITE) === "" && a(undefined, SITE) === "");
  check("подвійного слеша не виникає", !a("/a.webp", SITE + "/").includes("//a.webp"));
}

console.log("\n[3] Картка товару на РЕАЛЬНИХ даних");
{
  const p15 = findProductById(15);
  check("товар 15 знайдено", !!p15);

  const card = M.formatProductCard(p15, SITE);

  check("бренд великими літерами", card.includes("NIKE"), card.split("\n")[0]);
  check("назва товару", card.includes(p15.title));
  check("ціна з грн", /грн/.test(card));
  check("стара ціна зачеркнута", card.includes("<s>"), card.match(/<s>[^<]*<\/s>/)?.[0]);
  check("відсоток знижки", /−\d+%/.test(card), card.match(/−\d+%/)?.[0]);
  check("перелічені кольори", card.includes("Кольори:"));
  check("перелічені розміри", card.includes("Розміри:"));

  // ліміт Telegram на caption — 1024 символи
  check(`підпис вміщається в ліміт Telegram (${card.length} ≤ 1024)`, card.length <= 1024, card.length);
}

console.log("\n[4] Довгий опис підрізається, а не ламає надсилання");
{
  const long = { id:1, title:"Тест", brand:"X", price:100,
                 description:"а".repeat(2000), variants:[{color:"Чорний"}] };
  const card = M.formatProductCard(long, SITE);
  check("підпис у межах ліміту", card.length <= 1024, card.length);
  check("є ознака обрізання", card.includes("…"));
}

console.log("\n[5] Кнопки під товаром ведуть куди треба");
{
  const p15 = findProductById(15);
  const kb = M.buildProductKeyboard(p15, SITE);
  const urls = kb.inline_keyboard.flat().map(b => b.url);

  check("є кнопка на сторінку товару", urls[0].includes("/product?id=15"), urls[0]);
  check("колір переноситься в посилання (сторінка відкриється на тому ж кольорі)",
        urls[0].includes("color="), urls[0]);
  check("колір коректно закодований", !/[А-Яа-яІіЇїЄє]/.test(urls[0]), urls[0]);
  check("є кнопка на каталог", urls.some(u => u.endsWith("/catalog")), urls.join(" | "));
  check("усі кнопки — абсолютні https-посилання",
        urls.every(u => u.startsWith("https://")), urls.join(" | "));
}

console.log("\n[6] Обробник у функції");
{
  check("розбирає /start через parseStartPayload", SRC.includes("parseStartPayload(message.text)"));
  check("шукає товар у каталозі", /catalog\.find\(/.test(SRC));
  check("каталог береться з того самого data/products.json, що й сайт",
        SRC.includes("/data/products.json"));
  check("є кеш каталогу, щоб не тягнути його на кожен клік", SRC.includes("catalogCache"));
  check("товар не знайдено — відповідає, а не молчить",
        SRC.includes("Не знайшли цей товар"));
  check("якщо sendPhoto не вдався — надсилає текстом",
        /result\?\.ok/.test(SRC) && SRC.includes("sendMessage"));
  check("звичайний /start вітає й веде в каталог", SRC.includes("Вітаємо в <b>Bagvero</b>"));
  check("/id лишився для налаштування", SRC.includes('startsWith("/id")'));
  check("адресу сайту можна перевизначити секретом", SRC.includes('Deno.env.get("SITE_URL")'));
}

console.log("\n[7] Генератор посилань");
{
  const gen = require(path.join(ROOT, "scripts/telegram-links.js"));
  const products = gen.loadProducts();

  check("товари завантажені з джерельних файлів", products.length > 0, products.length);
  check("усі мають числовий id", products.every(p => typeof p.id === "number"));
  check("відсортовані за id", products.every((p,i) => i===0 || products[i-1].id <= p.id));
  check("знижка рахується", gen.discountOf({ price:900, oldPrice:1000 }) === 10);
  check("без старої ціни знижки немає", gen.discountOf({ price:900 }) === 0);
  check("стара ціна нижча за нову — не мінусова знижка",
        gen.discountOf({ price:1000, oldPrice:900 }) === 0);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

})();
