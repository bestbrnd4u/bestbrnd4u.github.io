// Оформлення замовлення в боті: перевіряємо весь сценарій на чистій
// логіці — від вибору кольору до рядка, який піде в таблицю orders.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
const { findProductById } = require("./helpers/products");

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const SRC = fs.readFileSync(path.join(ROOT,"supabase/functions/telegram-order-bot/_index.src.ts"),"utf8");

(async () => {

const F = await import(require("url").pathToFileURL(
  path.join(ROOT,"supabase/functions/telegram-order-bot/order-flow.js")).href);

// товар з двома кольорами й різними наборами розмірів
const P = { id:15, title:"Urban Sneakers", brand:"Nike", price:4299, oldPrice:4799,
  sizes:["40","41","42"],
  variants:[ {color:"Білий"}, {color:"Чорний", sizes:["35","36"]} ] };

console.log("\n[1] Доставка збігається з сайтом");
{
  const checkout = fs.readFileSync(path.join(ROOT,"checkout.html"),"utf8");

  F.DELIVERY_OPTIONS.forEach(o => {
    check(`«${o.label}» є на сайті`, checkout.includes(o.label), o.label);
    check(`ціна ${o.price} грн збігається`,
          new RegExp(`value="${o.label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}"\\s+data-price="${o.price}"`).test(checkout));
  });
}

console.log("\n[2] Варіанти товару");
{
  check("кольори зчитані", F.colorsOf(P).join(",")==="Білий,Чорний");
  check("у «Чорний» власні розміри", F.sizesOf(P,"Чорний").join(",")==="35,36");
  check("у «Білий» — загальні (своїх немає)", F.sizesOf(P,"Білий").join(",")==="40,41,42");
}

console.log("\n[3] Кроки: зайві питання пропускаються");
{
  check("є вибір кольору → крок color", F.nextStep("start",P,{})==="color");
  check("після кольору → розмір", F.nextStep("color",P,{color:"Чорний"})==="size");
  check("після розміру → кількість", F.nextStep("size",P,{})==="qty");
  check("далі доставка → місто → деталі → телефон → підсумок",
        ["delivery","city","detail","phone","confirm"]
          .every((s,i) => F.nextStep(["qty","delivery","city","detail","phone"][i],P,{})===s));

  // товар з одним кольором і одним розміром — питати нема про що
  const simple = { id:1, price:100, sizes:["ONESIZE"], variants:[{color:"Чорний"}] };
  check("один колір і один розмір → одразу кількість",
        F.nextStep("start",simple,{})==="qty", F.nextStep("start",simple,{}));

  const filled = F.autoFill(simple,{});
  check("єдиний колір проставився сам", filled.color==="Чорний");
  check("єдиний розмір проставився сам", filled.size==="ONESIZE");
}

console.log("\n[4] Суми рахуються як на сайті");
{
  const t = F.computeTotals(P, 2, 60);
  check("сума товарів зі старої ціни", t.subtotal === 4799*2, t.subtotal);
  check("знижка = різниця цін × кількість", t.discount === (4799-4299)*2, t.discount);
  check("доставка додається", t.delivery === 60);
  check("разом сходиться", t.total === 4799*2 - (4799-4299)*2 + 60, t.total);

  const noDiscount = F.computeTotals({price:1000}, 1, 0);
  check("без старої ціни знижки немає", noDiscount.discount === 0 && noDiscount.total === 1000);
  check("кількість менше 1 трактується як 1", F.computeTotals({price:100}, 0, 0).total === 100);
}

console.log("\n[5] Кнопки вкладаються в ліміт Telegram (64 байти на callback_data)");
{
  const all = [
    ...F.colorKeyboard(P).inline_keyboard.flat(),
    ...F.sizeKeyboard(P,"Чорний").inline_keyboard.flat(),
    ...F.qtyKeyboard().inline_keyboard.flat(),
    ...F.deliveryKeyboard().inline_keyboard.flat(),
    ...F.confirmKeyboard().inline_keyboard.flat(),
  ].filter(b => b.callback_data);

  const longest = all.reduce((a,b) =>
    Buffer.byteLength(b.callback_data,"utf8") > Buffer.byteLength(a.callback_data,"utf8") ? b : a);

  check(`найдовший callback_data вкладається (${Buffer.byteLength(longest.callback_data,"utf8")} ≤ 64)`,
        Buffer.byteLength(longest.callback_data,"utf8") <= 64, longest.callback_data);

  check("колір передається індексом, а не назвою (кирилиця з'їдає ліміт)",
        F.colorKeyboard(P).inline_keyboard[0][0].callback_data === "o:color:0");

  check("на кожному кроці є «Скасувати»",
        [F.colorKeyboard(P), F.sizeKeyboard(P), F.qtyKeyboard(), F.deliveryKeyboard(), F.confirmKeyboard()]
          .every(kb => JSON.stringify(kb).includes("o:cancel")));

  check("телефон просимо кнопкою contact, а не набором вручну",
        F.phoneKeyboard().keyboard[0][0].request_contact === true);
}

console.log("\n[6] Перевірка введеного тексту");
{
  check("порожнє місто відхиляється", F.validateCity("").ok === false);
  check("одна літера відхиляється", F.validateCity("К").ok === false);
  check("нормальне місто приймається", F.validateCity(" Київ ").value === "Київ");
  check("надто довге відхиляється", F.validateCity("а".repeat(200)).ok === false);

  check("короткий номер відхиляється", F.validatePhone("12345").ok === false);
  check("номер із пробілами нормалізується",
        F.validatePhone("+380 73 728 82 91").value === "+380737288291");
  check("номер без плюса отримує плюс", F.validatePhone("380737288291").value === "+380737288291");
  check("забагато цифр відхиляється", F.validatePhone("1".repeat(20)).ok === false);
}

console.log("\n[7] Рядок для таблиці orders — ті самі поля, що пише сайт");
{
  const session = { color:"Чорний", size:"36", qty:2, delivery_method:"Кур'єром «Нова пошта»",
    delivery_price:95, city:"Київ", delivery_detail:"вул. Хрещатик, 1",
    first_name:"Ілля", last_name:"Петренко", phone:"+380737288291" };

  const row = F.buildOrderRow(P, session, "1234567890");

  const checkout = fs.readFileSync(path.join(ROOT,"assets/js/checkout.js"),"utf8");
  const insertBlock = checkout.slice(checkout.indexOf('from("orders").insert({'));
  const siteFields = [...insertBlock.slice(0, insertBlock.indexOf("});"))
      .matchAll(/^\s*(\w+):/gm)].map(m => m[1]);

  siteFields.forEach(f => {
    check(`поле «${f}» присутнє (як на сайті)`, f in row, Object.keys(row).join(", "));
  });

  check("замовлення з бота — гостьове", row.user_id === null);
  check("статус new", row.status === "new");
  check("товар у складі з кольором і розміром",
        row.items[0].color === "Чорний" && row.items[0].size === "36" && row.items[0].qty === 2);
  check("суми пораховані", row.total === 4799*2 - (4799-4299)*2 + 95, row.total);
}

console.log("\n[8] Номер замовлення — того самого формату, що на сайті");
{
  const n = F.generateOrderNumber();
  check("10 цифр без літер", /^\d{10}$/.test(n), n);

  const checkout = fs.readFileSync(path.join(ROOT,"assets/js/checkout.js"),"utf8");
  check("сайт генерує так само (7 цифр часу + 3 випадкові)",
        checkout.includes("Date.now().toString().slice(-7)") &&
        checkout.includes("Math.floor(100 + Math.random() * 900)"));
}

console.log("\n[9] Обробники у функції");
{
  check("кнопка «Замовити в боті» на картці товару", SRC.includes('callback_data: "o:buy"'));
  check("кнопки замовлення відокремлені від кнопок статусу",
        SRC.includes('data.startsWith("o:")'));
  check("стан діалогу зберігається в базі", SRC.includes("bot_sessions"));
  check("текстові кроки обробляються до команд", SRC.includes("handleOrderText(message)"));
  check("телефон приймається і кнопкою contact", SRC.includes("message.contact"));
  check("зміна кольору скидає розмір (у кольору свої розміри)",
        /color, size: null/.test(SRC));
  check("після оформлення чернетка видаляється", SRC.includes("clearSession(chatId)"));
  check("якщо товар зник — діалог не зависає", SRC.includes("Товар більше не доступний"));
  check("помилка створення замовлення повідомляється клієнту",
        SRC.includes("Не вдалося оформити замовлення"));
}

console.log("\n[10] Міграція таблиці чернеток");
{
  const sql = fs.readFileSync(path.join(ROOT,"supabase/migrations/002-bot-order-sessions.sql"),"utf8");
  check("таблиця створюється", /create table if not exists public\.bot_sessions/i.test(sql));
  check("один чат — одна чернетка", /chat_id\s+bigint primary key/i.test(sql));
  check("RLS увімкнено (з клієнта доступу бути не має)",
        /alter table public\.bot_sessions enable row level security/i.test(sql));
  check("жодної політики доступу — пише лише функція сервісним ключем",
        !/create policy[\s\S]*bot_sessions/i.test(sql));
  check("є прибирання покинутих чернеток", /cleanup_bot_sessions/i.test(sql));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

})();
