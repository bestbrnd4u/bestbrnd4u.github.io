// Успадкування розмірів між товаром і кольорами.
//
// Раніше цей тест був прив'язаний до демо-товару id=15 («Urban
// Sneakers»: 20 загальних розмірів, у «Чорного» власні 35,36). Щойно
// каталог замінили справжнім, тест упав — хоча код сайту не мінявся.
// Прив'язка до конкретного товару була помилкою: перевіряти треба
// ЛОГІКУ, а не вміст каталогу.
//
// Тому: сама логіка — на власному наборі даних із потрібною формою,
// плюс перевірка, що на РЕАЛЬНИХ товарах ці функції не падають.
const fs=require("fs"), path=require("path"), {JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
const { loadProducts } = require("./helpers/products");

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const dom=new JSDOM("<!doctype html><body><div id='r'></div></body>",{runScripts:"outside-only"});
const {window}=dom;
const common=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
["escapeHtml","escapeAttrSingleQuoted","getProductColors","getVariantSizes","getAllProductSizes","getProductGenders","getProductGenderLabel"]
  .forEach(fn=>window.eval(common.match(new RegExp("function "+fn+"[\\s\\S]*?\\n}\\n"))[0]));
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8").replace(
  "function createProductCard(product) {",
  "window.PRODUCT_SIZES=['S','M','L'];window.formatPrice=v=>v+' грн';\nfunction createProductCard(product) {"));

// Найцікавіший випадок: один колір успадковує загальні розміри,
// другий має власні, вужчі.
const MIXED = {
  id: 999, title: "Тестовий товар", brand: "Test", price: 1000,
  sizes: ["36","37","38","39","40"],
  variants: [
    { color: "Білий", hex: "#ffffff", images: ["a.webp"] },
    { color: "Чорний", hex: "#000000", images: ["b.webp"], sizes: ["36","37"] },
  ],
};

console.log("\n[1] Успадкування розмірів кольором");
{
  check("колір без власних — бере загальні",
        window.getVariantSizes(MIXED, MIXED.variants[0]).join(",") === "36,37,38,39,40");
  check("колір із власними — показує лише свої",
        window.getVariantSizes(MIXED, MIXED.variants[1]).join(",") === "36,37");
}

console.log("\n[2] Об'єднання для фільтра каталогу");
{
  const all = window.getAllProductSizes(MIXED).slice().sort();
  check("усі розміри товару, без дублів",
        all.join(",") === "36,37,38,39,40", all.join(","));

  // якщо у КОЖНОГО кольору свої розміри — беремо їх об'єднання
  const own = { sizes: [], variants: [
    { color:"A", sizes:["S"] }, { color:"B", sizes:["M","L"] } ] };
  check("об'єднання власних розмірів кольорів",
        window.getAllProductSizes(own).slice().sort().join(",") === "L,M,S");
}

console.log("\n[3] Картка малюється з розмірами активного кольору");
{
  window.document.getElementById("r").innerHTML = window.createProductCard(MIXED);
  const d = window.document;
  check("картка створена", !!d.querySelector(".product-card"));
  // У картці ДВА набори опцій: панель при наведенні (десктоп) і рядок
  // під фото (мобільний). Тому рахуємо в межах одного контейнера.
  const row = d.querySelector(".product-meta-row");
  const sizes = [...row.querySelectorAll(".mini-size")].map(b=>b.textContent.trim());
  check("показані розміри першого кольору", sizes.join(",") === "36,37,38,39,40", sizes.join(","));
  check("кольори виведені", row.querySelectorAll(".mini-color").length === 2,
        row.querySelectorAll(".mini-color").length);
}

console.log("\n[4] На РЕАЛЬНОМУ каталозі функції не падають");
{
  const products = loadProducts();
  check("каталог не порожній", products.length > 0, products.length);

  let crashed = null;
  for (const p of products) {
    try {
      window.getAllProductSizes(p);
      (p.variants || []).forEach(v => window.getVariantSizes(p, v));
      window.createProductCard(p);
    } catch (e) { crashed = `${p.title}: ${e.message}`; break; }
  }
  check("жоден товар не викликає помилку", crashed === null, crashed);

  const noVariants = products.filter(p => !p.variants || !p.variants.length).map(p=>p.title);
  check("у кожного товару є хоча б один колір", noVariants.length === 0, noVariants.join(", "));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
