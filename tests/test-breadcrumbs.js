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
// сім'ї кольорів — фільтр «Колір» працює ними (див. хелпер)
require(require("path").join(__dirname,"helpers/color-families")).installColorFamilies(window);
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
window.__t={
  setProducts(l){products=l;},
  setSection(s){currentSection=s;},
  setGender(g){selectedGenders.clear();if(g)selectedGenders.add(g);},
  render:()=>renderBreadcrumbsAndTitle()
};`;
window.eval(code);

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

function crumbs(){ return [...document.querySelectorAll("#breadcrumbsList a, #breadcrumbsList > span:not(.crumb-sep)")]; }
function last(){ const c=crumbs(); return c[c.length-1]; }

console.log("\n[1] Скрин: голий /catalog без фільтрів");
window.__t.setSection(""); window.__t.setGender(null); window.__t.render();
check("остання крихта — «Каталог»", last().textContent.trim()==="Каталог");
check("останню НЕ можна клікнути (span, не <a>)", last().tagName==="SPAN", last().tagName);
check("«Головна» лишається посиланням", crumbs()[0].tagName==="A");

console.log("\n[2] /catalog?section=new без фільтрів");
window.__t.setSection("new"); window.__t.render();
check("остання — «Новинки», не посилання", last().textContent.trim()==="Новинки" && last().tagName==="SPAN",
      last().outerHTML);

console.log("\n[3] /catalog?section=sale без фільтрів");
window.__t.setSection("sale"); window.__t.render();
check("остання — «Акції», не посилання", last().textContent.trim()==="Акції" && last().tagName==="SPAN");
check("зберігся клас sale-text", last().classList.contains("sale-text"));

console.log("\n[4] Референс: gender+category у прикладі користувача");
window.__t.setSection(""); window.__t.setGender("Чоловікам"); window.__t.render();
check("«Каталог» усередині — тепер посилання (не останній)",
      crumbs().find(c=>c.textContent.trim()==="Каталог")?.tagName==="A");
check("«Чоловікам» останній і не клікабельний", last().textContent.trim()==="Чоловікам" && last().tagName==="SPAN");

console.log("\n[5] Новинки + стать — стать остання, «Новинки» посилання");
window.__t.setSection("new"); window.__t.setGender("Жінкам"); window.__t.render();
check("«Новинки» стало посиланням", crumbs().find(c=>c.textContent.trim()==="Новинки")?.tagName==="A");
check("«Жінкам» останній і не клікабельний", last().textContent.trim()==="Жінкам" && last().tagName==="SPAN");

console.log("\n[6] Хлібні крихти не ламають заголовок сторінки");
window.__t.setSection("sale"); window.__t.setGender(null); window.__t.render();
check("заголовок «Акції» на місці", document.getElementById("catalogTitle").innerHTML.includes("Акції"));

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
