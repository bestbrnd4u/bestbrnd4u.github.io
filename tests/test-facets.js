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
const common=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
window.eval(common.match(/function escapeHtml[\s\S]*?\n}\n/)[0]);
window.eval(common.match(/function getProductColors[\s\S]*?\n}\n/)[0]);
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
window.eval(_cs.match(/let sizeGroupsPromise[\s\S]*?\n}\n/)[0]);

let code=fs.readFileSync(path.join(ROOT,"assets/js/catalog.js"),"utf8");
code+=`
window.__t={
  setProducts(l){products=l;},
  fillBrands:()=>fillBrands(), fillColors:()=>fillColors(),
  fillSizeGroups:()=>fillSizeGroups(), fillCategories:d=>fillCategories(d),
  fillCatalogSidebar:d=>fillCatalogSidebar(d),
  toggleCategory:n=>toggleCategory(n), toggleBrand:n=>toggleBrand(n),
  toggleColor:n=>toggleColor(n), setGender:g=>{selectedGenders.clear();if(g)selectedGenders.add(g);},
  resetAll:()=>resetAllFilters(),
  facets:()=>availableFacets()
};`;
window.eval(code);

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const departments=[{title:"Сумки",categories:["Жіночі сумки"]},{title:"Взуття",categories:["Кросівки"]}];

// Кросівки: Nike, чорні, розміри взуття. Сумки: Furla, рожеві, без розмірів взуття
const PRODUCTS=[
 {title:"Sneaker1",price:3000,category:"Кросівки",brand:"Nike",gender:"Чоловікам",
  sizes:["40","41"],variants:[{color:"Чорний",hex:"#000"}]},
 {title:"Sneaker2",price:4000,category:"Кросівки",brand:"Nike",gender:"Жінкам",
  sizes:["38"],variants:[{color:"Білий",hex:"#fff"}]},
 {title:"Bag1",price:8000,category:"Жіночі сумки",brand:"Furla",gender:"Жінкам",
  sizes:[],variants:[{color:"Рожевий",hex:"#f0f"}]},
 {title:"Bag2",price:9000,category:"Жіночі сумки",brand:"Michael Kors",gender:"Жінкам",
  sizes:[],variants:[{color:"Рожевий",hex:"#f0f"}]}
];

function setup(){
  window.__t.resetAll();
  window.__t.setProducts(PRODUCTS.map(p=>({...p})));
  document.getElementById("brandOptionsList").innerHTML="";
  document.getElementById("colorOptionsList").innerHTML="";
  document.getElementById("categoryOptionsList").innerHTML="";
  document.getElementById("catalogSidebar").innerHTML="";
  window.__t.fillBrands(); window.__t.fillColors();
  window.__t.fillSizeGroups(); window.__t.fillCategories(departments);
  window.__t.fillCatalogSidebar(departments);
  window.render();
}
const visible=sel=>[...document.querySelectorAll(sel)]
  .filter(el=>!el.classList.contains("unavailable"));
const brands=()=>visible("#brandOptionsList .filter-option").map(o=>o.dataset.brand);
const colors=()=>visible("#colorOptionsList .filter-option").map(o=>o.dataset.color);
const genders=()=>[...document.querySelectorAll(".gender-pill")]
  .filter(b=>!b.classList.contains("disabled")&&b.dataset.gender!=="").map(b=>b.dataset.gender);

console.log("\n[1] Без фільтрів доступно все");
setup();
check("усі 3 бренди", brands().sort().join(",")==="Furla,Michael Kors,Nike", brands().join(","));
check("усі 3 кольори", colors().length===3, colors().join(","));
check("обидві статі", genders().sort().join(",")==="Жінкам,Чоловікам", genders().join(","));

console.log("\n[2] Обрали категорію «Кросівки» — решта звузилась");
setup();
window.__t.toggleCategory("Кросівки");
check("лишився лише Nike", brands().join(",")==="Nike", brands().join(","));
check("сумкові бренди зникли", !brands().includes("Furla"));
check("рожевий (лише в сумках) зник", !colors().includes("Рожевий"), colors().join(","));
check("кольори кросівок лишились", colors().sort().join(",")==="Білий,Чорний", colors().join(","));
check("обидві статі доступні", genders().sort().join(",")==="Жінкам,Чоловікам", genders().join(","));

console.log("\n[3] Обрали бренд Furla — звузились категорії й розміри");
setup();
window.__t.toggleBrand("Furla");
const cats=visible("#categoryOptionsList .filter-option").map(o=>o.dataset.category);
check("лишились тільки «Жіночі сумки»", cats.join(",")==="Жіночі сумки", cats.join(","));
check("«Чоловікам» вимкнено (у Furla немає)", !genders().includes("Чоловікам"), genders().join(","));
const sizeChips=visible(".filter-size-chip");
check("розміри взуття зникли", sizeChips.length===0, sizeChips.map(c=>c.dataset.size).join(","));

console.log("\n[4] Обраний варіант ніколи не ховається");
setup();
window.__t.toggleColor("Рожевий");          // лише сумки
window.__t.toggleCategory("Кросівки");      // конфліктний вибір → 0 товарів
check("нуль товарів", document.getElementById("productsCount").textContent==="0");
check("обраний колір лишився видимим (щоб зняти)", colors().includes("Рожевий"), colors().join(","));
check("обрана категорія лишилась видимою",
      visible("#categoryOptionsList .filter-option").map(o=>o.dataset.category).includes("Кросівки"));

console.log("\n[5] Зняття фільтра повертає варіанти");
setup();
window.__t.toggleCategory("Кросівки");
check("до зняття Furla прихована", !brands().includes("Furla"));
window.__t.toggleCategory("Кросівки");      // знімаємо
check("після зняття Furla повернулась", brands().includes("Furla"), brands().join(","));
check("усі кольори повернулись", colors().length===3);

console.log("\n[6] Фільтр за статтю звужує решту");
setup();
window.__t.setGender("Чоловікам");
window.render();
check("лишився лише Nike", brands().join(",")==="Nike", brands().join(","));
check("лишився лише чорний", colors().join(",")==="Чорний", colors().join(","));

console.log("\n[7] Група розмірів ховається цілком, якщо порожня");
setup();
window.__t.toggleCategory("Жіночі сумки");
const groups=[...document.querySelectorAll("[data-size-group]")];
check("групи розмірів є в розмітці", groups.length>0);
check("порожня група прихована",
      groups.every(g=>g.classList.contains("unavailable")), 
      groups.map(g=>g.dataset.sizeGroup+":"+g.className).join(" | "));

console.log("\n[8] Бокове меню слухається активних фільтрів");
{
  setup();
  const sb=document.getElementById("catalogSidebar");
  const visCats=()=>[...sb.querySelectorAll("[data-sidebar-category]")]
      .filter(b=>!b.classList.contains("unavailable"))
      .map(b=>b.dataset.sidebarCategory);
  const total=()=>sb.querySelector("[data-sidebar-all] .sidebar-count").textContent;
  const countOf=n=>sb.querySelector(`[data-sidebar-category="${n}"] .sidebar-count`).textContent;

  check("без фільтрів усього 4", total()==="4", total());
  check("видно обидві категорії", visCats().sort().join(",")==="Жіночі сумки,Кросівки", visCats().join(","));

  // сценарій зі скріна: обрали стать
  window.__t.setGender("Чоловікам");
  window.render();
  check("«Всі товари» = 1 (а не 4)", total()==="1", total());
  check("лишились лише «Кросівки»", visCats().join(",")==="Кросівки", visCats().join(","));
  check("жіночі категорії приховані", !visCats().includes("Жіночі сумки"));
  check("лічильник категорії теж звузився", countOf("Кросівки")==="1", countOf("Кросівки"));
  check("порожня група прихована",
        sb.querySelector('[data-sidebar-group="Сумки"]').classList.contains("unavailable"));

  // зняли стать — усе повертається
  window.__t.setGender(null);
  window.render();
  check("після зняття знову 4", total()==="4", total());
  check("категорії повернулись", visCats().length===2, visCats().join(","));
}

console.log("\n[9] Вибір категорії НЕ схлопує бокове меню");
{
  setup();
  window.__t.toggleCategory("Кросівки");
  const sb=document.getElementById("catalogSidebar");
  const visCats=[...sb.querySelectorAll("[data-sidebar-category]")]
      .filter(b=>!b.classList.contains("unavailable"))
      .map(b=>b.dataset.sidebarCategory);
  check("обидві категорії лишились видимими (є куди перемкнутись)",
        visCats.sort().join(",")==="Жіночі сумки,Кросівки", visCats.join(","));
}

console.log("\n[10] Регресія: скидання фільтрів ДО завантаження товарів");
{
  // Раніше resetAllFilters() при невідомих межах ставив діапазон
  // ціни 0–0; priceFilterActive() вважав його звуженим і відкидав
  // геть усі товари — каталог показував порожньо.
  window.__t.resetAll();                    // товарів ще немає
  window.__t.setProducts(PRODUCTS.map(p=>({...p})));
  window.render();
  check("каталог не порожній", document.getElementById("productsCount").textContent==="4",
        document.getElementById("productsCount").textContent);
  check("фільтри не порожні", brands().length===3, brands().join(","));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
