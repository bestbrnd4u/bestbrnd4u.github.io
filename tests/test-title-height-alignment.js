// Регресія: .product-title обрізає назву до 2 рядків, але не
// резервує під них ПОСТІЙНУ висоту — короткий заголовок займає
// один рядок, довгий два, і все нижче (ціна, кнопка) зʼїжджає
// на різну висоту в сусідніх картках одного ряду.
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const css=fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");

function rule(selector){
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...css.matchAll(new RegExp("^\\s*" + esc + "\\{([^}]*)\\}", "mg"))];
  if (!matches.length) return null;
  return matches.map(m => m[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
}

console.log("\n[1] Десктопна картка резервує 2 рядки під назву");
{
  const base = rule(".product-title");
  check("правило знайдено", base !== null);
  check("min-height:2.6em (2 рядки при line-height:1.3)", /min-height\s*:\s*2\.6em/.test(base), base);
  check("min-height:0 більше немає в базовому правилі", !/min-height\s*:\s*0\b/.test(base));
  check("обрізання до 2 рядків лишилось", /-webkit-line-clamp\s*:\s*2/.test(base));
}

console.log("\n[2] Мобільна картка (2 колонки) — той самий резерв");
{
  const mobile = rule(".product-card .product-title");
  check("правило знайдено", mobile !== null);
  check("min-height:2.6em і тут", /min-height\s*:\s*2\.6em/.test(mobile), mobile);
}

console.log("\n[3] list-view НЕ чіпали — там картки не стоять поруч одна з одною");
{
  const listView = rule(".products-grid.list-view .product-title");
  check("список лишився без примусового резерву (не потрібен: рядки не вирівнюються між собою)",
        listView !== null && /min-height\s*:\s*0/.test(listView));
}

console.log("\n[4] DOM: назва йде ПЕРЕД рядком ціни — резерв справді штовхає вниз усе під собою");
{
  const dom=new JSDOM("<!doctype html><body><div id='r'></div></body>",{runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom;
  const cs=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  ["escapeHtml","escapeAttrSingleQuoted","getProductColors","getVariantSizes","getAllProductSizes"]
    .forEach(fn=>window.eval(cs.match(new RegExp("function "+fn+"[\\s\\S]*?\\n}\\n"))[0]));
  window.eval(fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8").replace(
    "function createProductCard(product) {",
    "window.PRODUCT_SIZES=['S','M'];\nfunction createProductCard(product) {"));

  const short={id:1,title:"Bag",brand:"X",price:100,variants:[{color:"Чорний",hex:"#000",images:["a.jpg"]}]};
  const long={id:2,title:"Guess Noelle Black Guess Noelle Black Guess Noelle Black Guess Noelle Black",
              brand:"Guess",price:100,variants:[{color:"Чорний",hex:"#000",images:["b.jpg"]}]};

  [short,long].forEach(p=>{
    window.document.getElementById("r").innerHTML=window.createProductCard(p);
    const d=window.document;
    const info=d.querySelector(".product-info");
    const children=[...info.children].map(c=>c.className.split(" ")[0]);
    const titleIdx=children.indexOf("product-title");
    const metaIdx=children.indexOf("product-meta-row");
    check(`(${p.title.length>20?"довга":"коротка"} назва) заголовок стоїть перед рядком ціни в DOM`,
          titleIdx!==-1 && metaIdx!==-1 && titleIdx<metaIdx, children.join(","));
  });
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
