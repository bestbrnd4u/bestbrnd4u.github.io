const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
const dom=new JSDOM("<!doctype html><body><div id='root'></div></body>",
  {runScripts:"outside-only",pretendToBeVisual:true});
const {window}=dom;
const common=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
window.eval(common.match(/function escapeHtml[\s\S]*?\n}\n/)[0]);
window.eval(common.match(/function getProductColors[\s\S]*?\n}\n/)[0]);
// сім'ї кольорів — фільтр «Колір» працює ними (див. хелпер)
require(require("path").join(__dirname,"helpers/color-families")).installColorFamilies(window);
window.eval(common.match(/function escapeAttrSingleQuoted[\s\S]*?\n}\n/)[0]);
// getVariantSizes/getAllProductSizes теж живуть у common.js —
// на сайті файл підключений повністю, у тесті додаємо явно
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getVariantSizes[\s\S]*?\n}\n/)[0]);
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getAllProductSizes[\s\S]*?\n}\n/)[0]);
// назва в картці тепер посилання — createProductCard кличе productUrl
window.eval(common.match(/function productUrl[\s\S]*?\n}\n/)[0]);
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8").replace(
  "function createProductCard(product) {",
  "window.PRODUCT_SIZES=window.PRODUCT_SIZES||['S','M','L'];\nwindow.formatPrice=window.formatPrice||(v=>v+' грн');\nfunction createProductCard(product) {"));

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};
const d=window.document;

const product={id:1,title:"Sneakers",brand:"Nike",price:4299,
  sizes:["36","37","38","39","40","41"],
  variants:[{color:"Білий",hex:"#fff",images:["a.jpg"]},{color:"Чорний",hex:"#000",images:["b.jpg"]}]};

d.getElementById("root").innerHTML=window.createProductCard(product);

console.log("\n[1] Розмітка: обгортка і стрілки");
const wraps=[...d.querySelectorAll(".product-sizes-wrap")];
check("обгортки створено для обох блоків (панель + рядок)", wraps.length===2, wraps.length);
check("у кожній є ліва і права стрілки",
      wraps.every(w=>w.querySelector(".sizes-arrow-left")&&w.querySelector(".sizes-arrow-right")));
check("усі 6 розмірів виведено, нічого не обрізано",
      [...wraps[0].querySelectorAll(".mini-size")].map(b=>b.textContent.trim()).join(",")==="36,37,38,39,40,41",
      [...wraps[0].querySelectorAll(".mini-size")].map(b=>b.textContent.trim()).join(","));
check("стрілки не у фокусі під час табуляції (tabindex=-1)",
      wraps[0].querySelector(".sizes-arrow-left").getAttribute("tabindex")==="-1");

console.log("\n[2] Стрілки з'являються лише при переповненні");
const wrap=wraps[0], list=wrap.querySelector(".product-sizes");
function setSizes(scrollWidth, clientWidth, scrollLeft=0){
  Object.defineProperty(list,"scrollWidth",{value:scrollWidth,configurable:true});
  Object.defineProperty(list,"clientWidth",{value:clientWidth,configurable:true});
  Object.defineProperty(list,"scrollLeft",{value:scrollLeft,writable:true,configurable:true});
}
setSizes(120,200);                       // все вміщається
d.querySelector(".product-card").dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true}));
check("вміщається → стрілок немає", !wrap.classList.contains("has-overflow"));

setSizes(300,150,0);                     // не вміщається
d.querySelector(".product-card").dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true}));
check("не вміщається → стрілки увімкнено", wrap.classList.contains("has-overflow"));
check("ліва стрілка вимкнена на початку", wrap.querySelector(".sizes-arrow-left").disabled===true);
check("права активна", wrap.querySelector(".sizes-arrow-right").disabled===false);

setSizes(300,150,150);                   // прокрутили в кінець
d.querySelector(".product-card").dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true}));
check("у кінці права вимкнена", wrap.querySelector(".sizes-arrow-right").disabled===true);
check("ліва активна", wrap.querySelector(".sizes-arrow-left").disabled===false);

console.log("\n[3] Клік по стрілці прокручує і не чіпає картку");
setSizes(300,150,0);
let scrolled=null;
list.scrollBy=opts=>{scrolled=opts;};
let cardClicked=false;
d.querySelector(".product-card").addEventListener("click",()=>{cardClicked=true;});
const evt=new window.MouseEvent("click",{bubbles:true,cancelable:true});
wrap.querySelector(".sizes-arrow-right").dispatchEvent(evt);
check("прокрутка викликана", scrolled!==null && scrolled.left>0, JSON.stringify(scrolled));
check("плавна", scrolled.behavior==="smooth");
check("клік не дійшов до картки (не відкриє товар)", cardClicked===false);
check("подію скасовано", evt.defaultPrevented===true);

scrolled=null;
wrap.querySelector(".sizes-arrow-left").dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}));
check("ліва стрілка прокручує назад", scrolled.left<0, JSON.stringify(scrolled));

console.log("\n[4] Товар без розмірів не ламається");
const noSizes={id:2,title:"Bag",brand:"Furla",price:100,sizes:[],variants:[{color:"Рожевий",hex:"#f0f"}]};
d.getElementById("root").innerHTML=window.createProductCard(noSizes);
check("картка згенерувалась", d.querySelector(".product-card")!==null);
const w2=d.querySelector(".product-sizes-wrap");
d.querySelector(".product-card").dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true}));
check("без розмірів стрілки не вмикаються", !w2.classList.contains("has-overflow"));

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
