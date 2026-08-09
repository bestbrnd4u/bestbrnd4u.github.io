// Перевірка на РЕАЛЬНИХ даних товару id=15 з нового архіву:
// 20 загальних розмірів, у "Білий" своїх немає, у "Чорний" — 35,36
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const product=JSON.parse(fs.readFileSync(path.join(ROOT,"data/products.json"),"utf8"))
    .find(p=>p.id===15);

const dom=new JSDOM("<!doctype html><body><div id='root'></div></body>",{runScripts:"outside-only",pretendToBeVisual:true});
const {window}=dom;
const common=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
["escapeHtml","escapeAttrSingleQuoted","getProductColors","getVariantSizes","getAllProductSizes"]
  .forEach(fn=>window.eval(common.match(new RegExp("function "+fn+"[\\s\\S]*?\\n}\\n"))[0]));
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8").replace(
  "function createProductCard(product) {",
  "window.PRODUCT_SIZES=['S','M','L'];window.formatPrice=v=>v+' грн';\nfunction createProductCard(product) {"));

console.log("\n[1] Дані товару id=15");
check("20 загальних розмірів", product.sizes.length===20, product.sizes.length);
check("«Білий» без власних розмірів", !product.variants[0].sizes);
check("«Чорний» має 35,36", product.variants[1].sizes.join(",")==="35,36", String(product.variants[1].sizes));

console.log("\n[2] Успадкування і об'єднання");
check("«Білий» успадковує всі 20",
      window.getVariantSizes(product,product.variants[0]).length===20);
check("«Чорний» показує лише свої 2",
      window.getVariantSizes(product,product.variants[1]).join(",")==="35,36");
check("для фільтра каталогу — об'єднання (усі 20, бо 35/36 уже входять)",
      window.getAllProductSizes(product).sort().join(",")===product.sizes.slice().sort().join(","),
      window.getAllProductSizes(product).length);

console.log("\n[3] Картка: 20 розмірів не обрізаються, а прокручуються");
window.document.getElementById("root").innerHTML=window.createProductCard(product);
const d=window.document;
const wrap=d.querySelectorAll(".product-sizes-wrap")[0];
const chips=wrap.querySelectorAll(".mini-size");
check("виведено всі 20 розмірів активного кольору", chips.length===20, chips.length);

// імітуємо реальну розкладку: рядок ширший за панель
const list=wrap.querySelector(".product-sizes");
Object.defineProperty(list,"scrollWidth",{value:900,configurable:true});
Object.defineProperty(list,"clientWidth",{value:260,configurable:true});
Object.defineProperty(list,"scrollLeft",{value:0,writable:true,configurable:true});

d.querySelector(".product-card").dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true}));
check("наведення на КАРТКУ (а не на розміри) вмикає стрілки",
      wrap.classList.contains("has-overflow"));
check("права стрілка активна", wrap.querySelector(".sizes-arrow-right").disabled===false);
check("ліва вимкнена на початку", wrap.querySelector(".sizes-arrow-left").disabled===true);

console.log("\n[4] Перемикання кольору звужує список");
const swatches=[...d.querySelectorAll(".mini-color")];
check("у «Чорний» в data-sizes лише 35,36",
      JSON.parse(swatches[1].dataset.sizes).join(",")==="35,36", swatches[1].dataset.sizes);
check("у «Білий» в data-sizes усі 20",
      JSON.parse(swatches[0].dataset.sizes).length===20);

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
