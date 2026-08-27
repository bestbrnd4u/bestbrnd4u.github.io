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
window.matchMedia = window.matchMedia || (() => ({ matches:false, addEventListener(){}, addListener(){} }));
window.fetch = () => Promise.resolve({ ok:false });
window.requestAnimationFrame = cb => cb();

let scrollCalls = [];
window.scrollTo = opts => { scrollCalls.push(opts.top); };

window.eval(fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8").match(/function escapeHtml[\s\S]*?\n}\n/)[0]);
// availableFacets() використовує getProductColors з common.js —
// на сайті цей файл підключений повністю, у тесті підвантажуємо явно
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getProductColors[\s\S]*?\n}\n/)[0]);
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

let code = fs.readFileSync(path.join(ROOT, "assets/js/catalog.js"), "utf8");
code += `
window.__t = {
  setProducts(l){ products = l; },
  getResultsScrollTop: () => getResultsScrollTop(),
  guardActive: () => isAutoScrollGuardActive()
};`;
window.eval(code);

let failures = 0;
const check = (n,c,e) => { if(c) console.log("  ✓",n); else { console.log("  ✗",n, e!==undefined?"→ "+e:""); failures++; } };

window.__t.setProducts([
  { title:"Furla Metropolis", price:100, category:"Жіночі сумки", brand:"Furla", variants:[] },
  { title:"Guess Noelle",     price:200, category:"Жіночі сумки", brand:"Guess", variants:[] },
  { title:"Nike Air",         price:300, category:"Кросівки",     brand:"Nike",  variants:[] }
]);
window.render();

// Імітуємо реальну розкладку. Важливо: getBoundingClientRect().top
// відлічується ВІД ВЬЮПОРТА, тобто зменшується у міру скролу вниз —
// повертати константу було б нереалістично (і давало б хибний
// результат перевірки). Абсолютна позиція блоку результатів — 640px.
const CATALOG_TOP_ABS = 640;
document.querySelector(".catalog-top").getBoundingClientRect =
    () => ({ top: CATALOG_TOP_ABS - window.scrollY });

const search = document.getElementById("searchInput");
function type(value) {
  search.value = value;
  search.dispatchEvent(new window.Event("input", { bubbles:true }));
}
function setScrollY(v){ Object.defineProperty(window,"scrollY",{value:v,configurable:true}); }

// Захисне вікно (900ms) — це проміжок ЧАСУ, а не стан, що скидається
// ззовні: спроба обнулити autoScrollGuardUntil окремим window.eval()
// ненадійна (у jsdom окремі виклики eval не гарантовано пишуть у те
// саме прив'язання, яке читає вже визначена функція). Тому між
// сценаріями чесно чекаємо, поки вікно мине — як це й буває в
// реальному використанні між діями користувача.
function waitGuardExpiry(){
    const deadline = Date.now() + 950;
    while (Date.now() < deadline) { /* навмисне блокуюче очікування */ }
}

console.log("\n[1] Набір у середині каталогу піднімає до результатів");
setScrollY(1500);
scrollCalls = [];
type("fur");
check("скрол угору спрацював", scrollCalls.length === 1, JSON.stringify(scrollCalls));
check("ціль — початок результатів, а не самий верх сторінки", scrollCalls[0] > 0, scrollCalls[0]);
check("результати відфільтровано", document.getElementById("productsCount").textContent === "1",
      document.getElementById("productsCount").textContent);

console.log("\n[2] Наступні символи вже не смикають сторінку");
scrollCalls = [];
type("furl");
type("furla");
check("повторного скролу немає (захист після першого символу)", scrollCalls.length === 0, JSON.stringify(scrollCalls));

console.log("\n[3] Якщо вже вгорі — не скролимо взагалі");
waitGuardExpiry();
setScrollY(0);
scrollCalls = [];
type("gue");
check("скрол не викликано", scrollCalls.length === 0, JSON.stringify(scrollCalls));
check("але результати оновились", document.getElementById("productsCount").textContent === "1");

console.log("\n[4] У мобільній шторці фільтрів скролу немає");
waitGuardExpiry();
setScrollY(1500);
document.body.classList.add("mobile-filters-open");
scrollCalls = [];
type("nike");
check("скрол не викликано під шторкою", scrollCalls.length === 0, JSON.stringify(scrollCalls));
document.body.classList.remove("mobile-filters-open");

console.log("\n[5] Очищення поля теж піднімає, якщо ми внизу");
waitGuardExpiry();
setScrollY(1500);
scrollCalls = [];
type("");
check("скрол спрацював", scrollCalls.length === 1);
check("показані всі 3 товари", document.getElementById("productsCount").textContent === "3");

console.log(failures===0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
