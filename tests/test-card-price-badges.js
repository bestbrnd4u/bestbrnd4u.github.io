const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

function card(product){
  const dom=new JSDOM("<!doctype html><body><div id='r'></div></body>",{runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom;
  const cs=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  ["escapeHtml","escapeAttrSingleQuoted","getProductColors","getVariantSizes","getAllProductSizes","getProductGenders","getProductGenderLabel","productUrl",
     // Перевизначення полів кольором: без них createProductCard падає з
     // ReferenceError, бо свотчі несуть готовий вигляд кожного кольору.
     "colorOverrides","applyColorOverrides","baseProduct",
     // Ціна дня: картку малює ui.js, а ціну рахує common.js.
     "saleActive", "priceNow", "oldPriceNow", "discountPercent"].forEach(fn=>window.eval(cs.match(new RegExp("function "+fn+"[\\s\\S]*?\\n}\\n"))[0]));
  window.eval(fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8").replace(
    "function createProductCard(",
    "window.PRODUCT_SIZES=['S','M'];\nfunction createProductCard("));
  window.document.getElementById("r").innerHTML=window.createProductCard(product);
  return window.document;
}

const sale={id:1,title:"Metropolis Mini",brand:"Furla",price:10999,oldPrice:11999,badge:"TOP",
            variants:[{color:"Бежевий",hex:"#d9c7a1",images:["a.jpg"]}]};
const plain={id:2,title:"Bag",brand:"Guess",price:4599,badge:"NEW",
             variants:[{color:"Чорний",hex:"#000",images:["b.jpg"]}]};

console.log("\n[1] Бейдж знижки у стовпчику бейджів");
{
  const d=card(sale);
  const stack=[...d.querySelectorAll(".badge-stack .badge")].map(b=>b.textContent.trim());
  check("бейджі в одному стовпчику", d.querySelectorAll(".badge-stack").length===1);
  check("TOP зверху, знижка під ним", stack[0]==="TOP" && stack[1]==="-8%", stack.join(" | "));
  check("бейдж знижки має свій клас", !!d.querySelector(".badge-discount"));

  const noSale=card(plain);
  check("без знижки бейджа немає", noSale.querySelector(".badge-discount")===null);
  check("а звичайний бейдж лишився",
        noSale.querySelector(".badge-stack .badge")?.textContent.trim()==="NEW");
}

console.log("\n[2] Унизу картки — лише закреслена ціна, без відсотка");
{
  const d=card(sale);
  const priceBlock=d.querySelector(".product-price");
  check("відсотка в блоці ціни немає", priceBlock.querySelector(".discount")===null);
  check("закреслена стара ціна є", !!priceBlock.querySelector(".old-price"));
  check("подвійного відсотка в панелі наведення теж немає",
        d.querySelectorAll(".product-hover-panel .discount").length===0);
}

console.log("\n[3] Гривня на місці і ціна одним рядком");
{
  const d=card(sale);
  check("є «грн» у поточній ціні", d.querySelector(".price").textContent.includes("грн"),
        d.querySelector(".price").textContent.trim());
  check("є «грн» у старій ціні", d.querySelector(".old-price").textContent.includes("грн"));
  check("нерозривний пробіл перед грн (не переноситься)",
        d.querySelector(".price").textContent.includes("\u00A0грн"));
  check("ціна і стара ціна — прямі діти одного рядка",
        [...d.querySelector(".product-price").children].map(c=>c.className).join(",")==="price,old-price",
        [...d.querySelector(".product-price").children].map(c=>c.className).join(","));
  check("проміжного блоку price-meta більше немає", d.querySelector(".price-meta")===null);
}

console.log("\n[4] CSS: один рядок і захист від обрізання");
{
  const css=fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");
  // Селектор шукаємо ВІД ПОЧАТКУ РЯДКА: інакше ".product-price"
  // збігається і з ".product-meta-row .product-price" вище у файлі,
  // і перевірка читає геть інше правило.
  const rule=sel=>{const m=css.match(new RegExp("^"+sel.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\{([^}]*)\\}","m"));
                   return m?m[1].replace(/\/\*[\s\S]*?\*\//g,""):"";};
  check(".product-price у рядок", /flex-direction\s*:\s*row/.test(rule(".product-price")));
  check("без переносу", /flex-wrap\s*:\s*nowrap/.test(rule(".product-price")));
  check(".product-info має min-width:0 (інакше «грн» зрізає overflow:hidden)",
        /min-width\s*:\s*0/.test(rule(".product-card .product-info")));
  check("бейджі щільніше в кут", /top\s*:\s*10px/.test(rule(".badge-stack")));
  check("віджет кошика теж одним рядком", /nowrap/.test(rule(".cart-item-price")));
}

console.log("\n[5] Але на найвужчих екранах рядок усе ж переноситься");
{
  // ЩО ЦЕ ЗАКРИВАЄ
  // ---------------
  // Коментар біля .product-price каже «рядок став коротшим і
  // вміщається». Від 375px — правда. Нижче ні, а перевіряли саме там.
  //
  // ЗАМІРЯНО 03.11.2026 на /aktsii/, dev. Картка має overflow:hidden,
  // тож зайве не висить за краєм, а ЗНИКАЄ:
  //   320px — стару ціну зрізано на 19-29px: «14 300 грн» видно як
  //           «14 300», валюти немає зовсім
  //   360px — зрізано на 1-9px, гине кінець «грн»
  //   390px — вміщається повністю
  //
  // Сусідній коментар у CSS пояснює, що стара ціна — ДОКАЗ знижки:
  // без неї «-30%» нічим не підтверджене. Обрізане «грн» псує саме
  // той доказ.
  const css=fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");

  const вузькі=[...css.matchAll(/@media\(max-width:(\d+)px\)\{([\s\S]*?)\n\}/g)]
    .map(m=>({ширина:Number(m[1]),текст:m[2]}))
    .filter(b=>/\.product-price\{[^}]*flex-wrap\s*:\s*wrap/.test(b.текст));

  check("блок із переносом ціни знайдено рівно один",вузькі.length===1,String(вузькі.length));

  const блок=вузькі[0]||{ширина:0,текст:""};

  // Заміряно 09.11.2026: на 375–380 стару ціну ще зрізає на 1–3px, на
  // 390 вона вміщається. Поповзе поріг угору (≥390) — кожна картка зі
  // знижкою виросте на 21px без причини; поповзе вниз (<380) —
  // обрізання повернеться.
  check("поріг між виміряним зрізанням і шириною, де все влазить",
        блок.ширина>=380 && блок.ширина<=389,String(блок.ширина));

  // Без власного row-gap перенесена стара ціна відсунулась би на
  // цілих 8px від поточної — у ряду цей зазор доречний, між рядами ні.
  check("зазор між рядами заданий окремо",/row-gap\s*:/.test(блок.текст),
        блок.текст.replace(/\s+/g," ").slice(0,90));

  // min-height лишається від базового правила: коли знижки немає,
  // переносити нічого, і висота рядка та сама, що була.
  check("min-height у вузькому блоці не перевизначають",
        !/\.product-price\{[^}]*min-height/.test(блок.текст));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
