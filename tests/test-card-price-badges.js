const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

function card(product){
  const dom=new JSDOM("<!doctype html><body><div id='r'></div></body>",{runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom;
  const cs=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  ["escapeHtml","escapeAttrSingleQuoted","getProductColors","getVariantSizes","getAllProductSizes","getProductGenders","getProductGenderLabel","productUrl"]
    .forEach(fn=>window.eval(cs.match(new RegExp("function "+fn+"[\\s\\S]*?\\n}\\n"))[0]));
  window.eval(fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8").replace(
    "function createProductCard(product) {",
    "window.PRODUCT_SIZES=['S','M'];\nfunction createProductCard(product) {"));
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

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
