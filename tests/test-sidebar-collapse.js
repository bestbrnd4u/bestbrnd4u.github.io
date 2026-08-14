const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
const dom=new JSDOM(fs.readFileSync(path.join(ROOT,"catalog.html"),"utf8"),
  {runScripts:"outside-only",pretendToBeVisual:true,url:"https://x.test/catalog"});
const {window}=dom;
global.window=window; global.document=window.document;
window.CATALOG_SKIP_AUTO_INIT=true;
window.createProductCard=p=>`<div class="product-card">${p.title}</div>`;
window.initProductCarousels=()=>{};window.updateFavoriteButtons=()=>{};
window.renderRecentlyViewed=()=>{};window.scrollTo=()=>{};
window.matchMedia=window.matchMedia||(()=>({matches:false,addEventListener(){},addListener(){}}));
window.fetch=()=>Promise.resolve({ok:false});
window.requestAnimationFrame=cb=>cb();
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function escapeHtml[\s\S]*?\n}\n/)[0]);
// availableFacets() використовує getProductColors з common.js —
// на сайті цей файл підключений повністю, у тесті підвантажуємо явно
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getProductColors[\s\S]*?\n}\n/)[0]);
// getVariantSizes/getAllProductSizes теж живуть у common.js —
// на сайті файл підключений повністю, у тесті додаємо явно
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getVariantSizes[\s\S]*?\n}\n/)[0]);
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getAllProductSizes[\s\S]*?\n}\n/)[0]);
// catalog.js тепер стартує з FALLBACK_SIZE_GROUPS з common.js
// (групи розмірів приходять з адмінки), плюс хелпери груп
const _cs = fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
// const з окремого window.eval не видно наступним викликам
// (jsdom не ділить прив'язання) — привласнюємо прямо у window
window.eval("window.FALLBACK_SIZE_GROUPS = " +
    _cs.match(/const FALLBACK_SIZE_GROUPS = (\[[\s\S]*?\n\]);\n/)[1] + ";");
window.eval(_cs.match(/function resolveGroupCategories[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function findSizeGroupForCategory[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function getProductGenders[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function getProductGenderLabel[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/let sizeGroupsPromise[\s\S]*?\n}\n/)[0]);
let code=fs.readFileSync(path.join(ROOT,"assets/js/catalog.js"),"utf8");
code+=`
window.__t={ setProducts(l){products=l;}, fillCatalogSidebar:d=>fillCatalogSidebar(d),
  toggleCategory:n=>toggleCategory(n), get selectedCategories(){return selectedCategories;} };`;
window.eval(code);

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const departments=[
  {title:"Сумки",categories:["Жіночі сумки","Рюкзаки"]},
  {title:"Взуття",categories:["Кросівки"]},
  {title:"Аксесуари",categories:["Годинники"]}
];
const PRODUCTS=[
  {title:"A",price:100,category:"Жіночі сумки",brand:"X",variants:[]},
  {title:"B",price:200,category:"Рюкзаки",brand:"X",variants:[]},
  {title:"C",price:300,category:"Кросівки",brand:"Y",variants:[]},
  {title:"D",price:400,category:"Годинники",brand:"Z",variants:[]}
];

function rebuild(){
  window.__t.setProducts(PRODUCTS.map(p=>({...p})));
  document.getElementById("catalogSidebar").innerHTML="";
  window.__t.fillCatalogSidebar(departments);
  window.render();
}
const group=t=>document.querySelector(`[data-sidebar-group="${t}"]`);
const toggleOf=t=>group(t).querySelector("[data-sidebar-group-toggle]");

console.log("\n[1] Структура: заголовок став кнопкою зі значком");
rebuild();
check("3 групи побудовано", document.querySelectorAll(".sidebar-group").length===3);
check("заголовок — кнопка", toggleOf("Сумки").tagName==="BUTTON");
check("є значок +/−", !!group("Сумки").querySelector(".sidebar-group-icon"));
check("категорії в окремому тілі групи", group("Сумки").querySelectorAll(".sidebar-group-body [data-sidebar-category]").length===2);
check("за замовчуванням ЗГОРНУТО (показує +)", group("Сумки").classList.contains("collapsed"));
check("aria-expanded=false", toggleOf("Сумки").getAttribute("aria-expanded")==="false");
check("усі групи згорнуті", [...document.querySelectorAll(".sidebar-group")].every(g=>g.classList.contains("collapsed")));

console.log("\n[2] Клік розгортає і згортає назад");
toggleOf("Сумки").dispatchEvent(new window.Event("click",{bubbles:true}));
check("група розгорнулась", !group("Сумки").classList.contains("collapsed"));
check("aria-expanded=true", toggleOf("Сумки").getAttribute("aria-expanded")==="true");
check("сусідні групи лишились згорнутими", group("Взуття").classList.contains("collapsed"));
toggleOf("Сумки").dispatchEvent(new window.Event("click",{bubbles:true}));
check("повторний клік згортає", group("Сумки").classList.contains("collapsed"));

console.log("\n[3] Стан переживає перебудову меню");
toggleOf("Взуття").dispatchEvent(new window.Event("click",{bubbles:true}));
check("збережено як розгорнуту",
      JSON.parse(window.localStorage.getItem("bagvero:sidebar-expanded")).includes("Взуття"),
      window.localStorage.getItem("bagvero:sidebar-expanded"));
rebuild();
check("після перебудови «Взуття» лишилось розгорнутим", !group("Взуття").classList.contains("collapsed"));
check("інші лишились згорнутими", group("Сумки").classList.contains("collapsed"));

console.log("\n[4] Група з обраною категорією розгортається примусово");
toggleOf("Взуття").dispatchEvent(new window.Event("click",{bubbles:true})); // згортаємо назад
check("«Взуття» знову згорнуто", group("Взуття").classList.contains("collapsed"));
window.__t.toggleCategory("Кросівки");   // всередині згорнутої групи «Взуття»
check("категорію обрано", window.__t.selectedCategories.has("Кросівки"));
check("група розгорнулась автоматично", !group("Взуття").classList.contains("collapsed"));
check("aria-expanded оновлено", toggleOf("Взуття").getAttribute("aria-expanded")==="true");
rebuild();
check("і після перебудови лишається розгорнутою", !group("Взуття").classList.contains("collapsed"));

console.log("\n[5] Згортання не ламає вибір категорії");
const before=document.getElementById("productsCount").textContent;
toggleOf("Сумки").dispatchEvent(new window.Event("click",{bubbles:true}));
check("кількість товарів не змінилась", document.getElementById("productsCount").textContent===before,
      `${before} → ${document.getElementById("productsCount").textContent}`);
check("фільтр категорії лишився", window.__t.selectedCategories.has("Кросівки"));

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
