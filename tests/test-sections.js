const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = require("path").join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "catalog.html"), "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://x.test/catalog" });
const { window } = dom;
global.window = window; global.document = window.document;

window.CATALOG_SKIP_AUTO_INIT = true;
window.createProductCard = p => `<div class="product-card">${p.title}</div>`;
window.initProductCarousels = () => {};
window.updateFavoriteButtons = () => {};
window.renderRecentlyViewed = () => {};
window.scrollTo = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches:false, addEventListener(){}, addListener(){} }));
window.fetch = () => Promise.resolve({ ok:false });
window.requestAnimationFrame = cb => cb();
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

let code = fs.readFileSync(path.join(ROOT, "assets/js/catalog.js"), "utf8");
code += `
window.__t = {
  setProducts(l){ products = l; },
  setSection(s){ currentSection = s; },
  sectionProducts: () => sectionProducts(),
  fillCategories: d => fillCategories(d),
  fillCatalogSidebar: d => fillCatalogSidebar(d),
  getProducts: () => products
};`;
window.eval(code);

let failures = 0;
const check = (n,c,e) => { if(c) console.log("  ✓",n); else { console.log("  ✗",n,e!==undefined?"→ "+e:""); failures++; } };

const departments = [
  { title:"Сумки",  categories:["Жіночі сумки","Рюкзаки"] },
  { title:"Взуття", categories:["Кросівки"] },
  { title:"Аксесуари", categories:["Годинники"] }
];

// 6 товарів: 2 новинки, 2 акційні (знижка >=30%), решта звичайні
const ALL = [
  { title:"A", price:100, category:"Жіночі сумки", brand:"X", isNew:true,  variants:[] },
  { title:"B", price:200, category:"Кросівки",     brand:"Y", isNew:true,  variants:[] },
  { title:"C", price:300, category:"Рюкзаки",      brand:"Z", variants:[] },
  { title:"D", price:700, oldPrice:1000, category:"Жіночі сумки", brand:"X", variants:[] }, // -30% ✓
  { title:"E", price:500, oldPrice:1000, category:"Годинники",    brand:"W", variants:[] }, // -50% ✓
  { title:"F", price:950, oldPrice:1000, category:"Рюкзаки",      brand:"Z", variants:[] }  // -5%  ✗
];

function build(section) {
  window.__t.setProducts(ALL.map(p => ({ ...p })));
  window.__t.setSection(section);
  document.getElementById("catalogSidebar").innerHTML = "";
  document.getElementById("categoryOptionsList").innerHTML = "";
  window.__t.fillCatalogSidebar(departments);
  window.__t.fillCategories(departments);
  window.render();
}
const sidebarCats = () => [...document.querySelectorAll("[data-sidebar-category]")].map(b => b.dataset.sidebarCategory);
const sidebarTotal = () => document.querySelector("[data-sidebar-all]").textContent.replace(/\D+/g," ").trim();
const dropdownCats = () => [...document.querySelectorAll("#categoryOptionsList .filter-option")].map(o => o.dataset.category);
const gridCount = () => document.getElementById("productsCount").textContent;

console.log("\n[1] ?section=new — тільки новинки");
build("new");
check("у сітці 2 новинки", gridCount() === "2", gridCount());
check("«Всі товари» показує 2, а не 6", sidebarTotal() === "2", sidebarTotal());
check("у сайдбарі лише категорії новинок",
      sidebarCats().slice().sort().join(",") === ["Жіночі сумки","Кросівки"].sort().join(","),
      sidebarCats().join(","));
check("категорії без новинок відсутні", !sidebarCats().includes("Рюкзаки") && !sidebarCats().includes("Годинники"), sidebarCats().join(","));
check("дропдаун «Категорія» теж звужено", !dropdownCats().includes("Рюкзаки"), dropdownCats().join(","));

console.log("\n[2] ?section=sale — лише знижки від 30%");
build("sale");
check("у сітці 2 акційні товари", gridCount() === "2", gridCount());
check("«Всі товари» показує 2", sidebarTotal() === "2", sidebarTotal());
check("товар зі знижкою 5% не потрапив", !sidebarCats().includes("Рюкзаки"), sidebarCats().join(","));
check("є «Годинники» (знижка 50%)", sidebarCats().includes("Годинники"), sidebarCats().join(","));

console.log("\n[3] Звичайний каталог — усі товари");
build("");
check("у сітці всі 6", gridCount() === "6", gridCount());
check("«Всі товари» показує 6", sidebarTotal() === "6", sidebarTotal());
check("усі 4 категорії присутні", sidebarCats().length === 4, sidebarCats().join(","));

console.log("\n[4] Лічильники сайдбара рахують у межах розділу");
build("new");
const html2 = document.getElementById("catalogSidebar").innerHTML;
check("«Жіночі сумки» = 1 (а не 2 як у всьому каталозі)",
      /Жіночі сумки[\s\S]{0,80}?>1</.test(html2), "не знайдено лічильник 1");

console.log("\n[5] Сітка і сайдбар не розходяться");
["", "new", "sale"].forEach(sec => {
  build(sec);
  check(`section="${sec}": підсумок сайдбара = кількість у сітці`,
        sidebarTotal() === gridCount(), `${sidebarTotal()} vs ${gridCount()}`);
});

console.log("\n[6] Сортування не псує вихідний масив products");
build("");
const before = window.__t.getProducts().map(p => p.title).join(",");
window.eval('currentSort = "price-asc";');
window.render();
const after = window.__t.getProducts().map(p => p.title).join(",");
check("порядок products не змінився після сортування", before === after, `${before} → ${after}`);

console.log(failures===0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
