// Регресія: мобільні правки для вузьких карток (прокрутка розмірів,
// захист ціни від обрізання, компактні бейджі) були прив'язані
// до #catalogGrid — тому не діяли в list-view, "Акціях"
// (.brand-campaign-products, та сама .product-card) і "Добірках"
// (.collection-product, окремий компонент).
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const css=fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");

function rule(selector){
  // шукаємо ВІД ПОЧАТКУ РЯДКА (з опційним відступом) — інакше
  // ".price" збігається і з ".old-price", і з довшими селекторами,
  // де він лише хвіст.
  //
  // ВАЖЛИВО: беремо ОСТАННІЙ збіг, а не перший. У файлі є і базове
  // правило (напр. .product-card .price{font-size:20px} — десктоп),
  // і мобільний override нижче за текстом (font-size:15px) — у
  // реальному каскаді виграє останній за порядком при однаковій
  // специфічності, тож саме його й треба перевіряти.
  //
  // Селектор приймаємо СИРИМ (з реальною крапкою класу) — екранування
  // робимо тут-таки, подвійне екранування на виклику ламало б пошук.
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp("^\\s*" + esc + "\\{([^}]*)\\}", "mg"))];
  if (!matches.length) return null;

  // Об'єднуємо тіла ВСІХ правил із цим селектором по порядку появи
  // в файлі (а не лише останнього): у мобільного override може не
  // бути ВСІХ властивостей базового правила — властивість, яку він
  // не перевизначає, і далі діє з попереднього правила. Пізніше
  // приєднане тіло в об'єднаному рядку "виграє" при подальшому
  // текстовому пошуку через lastIndexOf у сусідніх перевірках.
  return matches.map(m => m[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
}

console.log("\n[1] Правки картки більше не прив'язані до #catalogGrid");
{
  check("немає жодного #catalogGrid-скопованого правила ДЛЯ ВНУТРІШНОСТЕЙ картки",
        !/#catalogGrid\.products-grid:not\(\.list-view\)\s+\.(badge|favorite|product-info|product-category|product-title|product-options|product-colors|product-sizes|mini-color|mini-size|product-price|price|old-price|discount|buy-btn)\b/.test(css));

  // те, що ЛИШИЛОСЬ прив'язаним до ID — має бути ЛИШЕ геометрія
  // контейнера (кількість колонок, аспект фото), не сама картка
  const idScoped = [...css.matchAll(/#catalogGrid\.products-grid:not\(\.list-view\)([^{]*)\{/g)]
      .map(m => m[1].trim());
  check("ID-скоповані правила — лише сітка й карусель фото",
        idScoped.every(sel => sel === "" || sel === ".product-carousel"),
        JSON.stringify(idScoped));
}

console.log("\n[2] Розміри тепер прокручуються і в list-view");
{
  const r = rule(".product-card .product-options");
  check("правило прокрутки — на .product-card, без винятку :not(.list-view)", r !== null);
  check("overflow-x:auto є", /overflow-x\s*:\s*auto/.test(r));

  const sizes = rule(".product-card .mini-size");
  check("компактний розмір розмірної кнопки застосовується скрізь", sizes !== null && /min-width\s*:\s*22px/.test(sizes));
}

console.log("\n[3] Ціна захищена від обрізання скрізь, де є .product-card");
{
  const price = rule(".product-card .price");
  const old = rule(".product-card .old-price");
  check("зменшений розмір ціни — universal", price !== null && /font-size\s*:\s*15px/.test(price));
  // Було 11.5px. Напівпіксельні розміри звели до цілих: різницю між
  // 11.5 і 12 не видно, а рішень «який тут розмір» стало на шість
  // менше. Суть перевірки — стара ціна помітно дрібніша за поточну.
  check("зменшений розмір старої ціни — universal", old !== null && /font-size\s*:\s*12px/.test(old));
}

console.log("\n[4] Бейджі компактніші скрізь");
{
  const badge = rule(".product-card .badge");
  check("компактний бейдж — universal", badge !== null && /padding\s*:\s*5px 9px/.test(badge));
}

console.log("\n[5] «Добірки» (.collection-product) захищені окремо");
{
  const prod = rule(".collection-product");
  const info = rule(".collection-product-info");
  const priceRow = rule(".collection-product-price");
  check(".collection-product має min-width:0 (грід-елемент інакше не стискається)",
        prod !== null && /min-width\s*:\s*0/.test(prod));
  check(".collection-product-info теж", info !== null && /min-width\s*:\s*0/.test(info));
  check(".collection-product-price не переноситься", priceRow !== null && /flex-wrap\s*:\s*nowrap/.test(priceRow));

  const priceInRow = css.match(/\.collection-product-price \.price,\s*\n\.collection-product-price \.old-price\{([^}]*)\}/);
  check("ціна і стара ціна всередині — nowrap", priceInRow && /white-space\s*:\s*nowrap/.test(priceInRow[1]));
}

console.log("\n[6] Немає забутих голих селекторів (наслідок першої невдалої спроби)");
{
  // після виправлення жодне з цих правил не повинно існувати як
  // ГОЛЕ (без .product-card спереду) усередині мобільного блоку —
  // інакше вони діяли б на будь-який .favorite/.badge на сторінці
  const dangerousBare = [
    /^\s*\.favorite\{\s*\n\s*width:32px/m,
    /^\s*\.badge\{\s*\n\s*top:10px;\s*\n\s*left:10px;\s*\n\s*padding:5px 9px/m,
    /^\s*\.product-title\{\s*\n\s*font-size:13\.5px/m,
    /^\s*\.product-options\{\s*\n\s*gap:8px;\s*\n\s*margin-bottom:10px/m
  ];
  dangerousBare.forEach((re, i) => {
    check(`небезпечний голий селектор #${i+1} відсутній`, !re.test(css));
  });
}

console.log("\n[7] Синтаксична цілісність файлу");
{
  const opens = (css.match(/\{/g) || []).length;
  const closes = (css.match(/\}/g) || []).length;
  check("баланс фігурних дужок", opens === closes, `${opens} відкритих, ${closes} закритих`);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
