// Регресія: ui.js і catalog.js — звичайні <script>, не модулі,
// тож усі function-оголошення верхнього рівня потрапляють в один
// спільний window. Одна назва в двох файлах = друге оголошення
// МОВЧКИ перезаписує перше (те, що завантажилось пізніше, виграє).
//
// Саме так catalog.js's власний formatPrice() (без "грн", для
// підписів повзунка ціни) перезаписав formatPrice() з ui.js
// (з "грн", для карток товару) — і всі ціни в каталозі лишились
// без валюти, хоча в розмітці все виглядало правильно.
//
// Перевіряємо системно: для КОЖНОЇ сторінки — свій набір <script>,
// і жодне ім'я функції верхнього рівня не повинно повторюватись
// серед файлів, підключених РАЗОМ на одній сторінці.
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

function scriptsOn(page){
  const html=fs.readFileSync(path.join(ROOT,page),"utf8");
  return [...html.matchAll(/<script src="assets\/js\/([\w-]+\.js)"><\/script>/g)].map(m=>m[1]);
}

function topLevelFunctions(file){
  const p=path.join(ROOT,"assets/js",file);
  if (!fs.existsSync(p)) return [];
  const src=fs.readFileSync(p,"utf8");
  return [...src.matchAll(/^function ([a-zA-Z_][a-zA-Z0-9_]*)/gm)].map(m=>m[1]);
}

const pages=["index.html","catalog.html","product.html"];

console.log("\n[1] Немає колізій імен функцій серед скриптів, підключених РАЗОМ");
pages.forEach(page=>{

  const scripts=scriptsOn(page);
  const byFunc=new Map();

  scripts.forEach(file=>{
    topLevelFunctions(file).forEach(fn=>{
      if (!byFunc.has(fn)) byFunc.set(fn,[]);
      byFunc.get(fn).push(file);
    });
  });

  const collisions=[...byFunc.entries()].filter(([,files])=>files.length>1);

  check(`${page}: жодна функція не оголошена у двох підключених файлах одразу`,
        collisions.length===0,
        collisions.map(([fn,files])=>`${fn} у ${files.join(" і ")}`).join("; "));

});

console.log("\n[2] Регресія: саме formatPrice більше не дублюється");
{
  const uiHas = topLevelFunctions("ui.js").includes("formatPrice");
  const catalogHas = topLevelFunctions("catalog.js").includes("formatPrice");
  check("formatPrice є в ui.js (правильна версія — з «грн»)", uiHas);
  check("formatPrice відсутня в catalog.js (перейменована на formatPriceShort)", !catalogHas);
  check("formatPriceShort з'явилась замість неї", topLevelFunctions("catalog.js").includes("formatPriceShort"));
}

console.log("\n[3] Ціна картки товару справді містить «грн» — перевірка по факту, не по CSS");
{
  const dom=new JSDOM("<!doctype html><body><div id='r'></div></body>",{runScripts:"outside-only"});
  const {window}=dom;
  window.eval(fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8").match(/function formatPrice[\s\S]*?\n\}\n/)[0]);
  const price=window.formatPrice(4599);
  check("formatPrice(4599) містить «грн»", price.includes("грн"), price);
  check("формат з нерозривним пробілом перед грн", price.includes("\u00A0грн"), JSON.stringify(price));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
