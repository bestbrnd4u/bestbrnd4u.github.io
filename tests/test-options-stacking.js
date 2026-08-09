// Дві регресії:
// 1) У панелі наведення колір і розмір стояли ПОРУЧ із gap:14px, а
//    стрілки виступають на 8px назовні з кожного боку — 8+8=16 > 14,
//    тож права стрілка кольору й ліва стрілка розміру накладались
//    одна на одну та на сусідній блок.
// 2) У режимі "список" предки мали align-items:flex-start — діти
//    сідали по ширині вмісту, обмеження ширини колонки до них не
//    доходило, переповнення не виникало, і стрілки прокрутки
//    розмірів не з'являлись узагалі.
const fs=require("fs"),path=require("path");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const css=fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");
function rule(selector){
  const esc=selector.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const m=[...css.matchAll(new RegExp("^\\s*"+esc+"\\{([^}]*)\\}","mg"))];
  return m.length ? m.map(x=>x[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g,"") : null;
}

console.log("\n[1] Панель наведення: колір і розмір у стовпчик");
{
  const r=rule(".product-hover-panel .product-options");
  check("правило знайдено", r!==null);
  check("flex-direction:column — більше не поруч", /flex-direction\s*:\s*column/.test(r), r);
  check("align-items:stretch — обидва на всю ширину панелі", /align-items\s*:\s*stretch/.test(r), r);
  check("стрілки більше не діляться зазором 14px (він тепер вертикальний)",
        /gap\s*:\s*10px/.test(r), r);
}

console.log("\n[2] Панель наведення: обидві обгортки на всю ширину");
{
  const r=rule(".product-hover-panel .product-sizes-wrap,\n    .product-hover-panel .product-colors-wrap");
  const combined = r !== null ? r
    : (css.includes(".product-hover-panel .product-sizes-wrap,") &&
       css.includes(".product-hover-panel .product-colors-wrap{") ? "combined" : null);
  check("правило обгорток знайдено", combined!==null);
  check("width:100% для обох",
        /\.product-hover-panel \.product-sizes-wrap,\s*\n\s*\.product-hover-panel \.product-colors-wrap\{[^}]*width\s*:\s*100%/.test(css));
  check("стара max-width:45% на кольорі прибрана (більше не ділять рядок)",
        !/\.product-hover-panel \.product-colors-wrap\{[^}]*max-width\s*:\s*45%/.test(css));
  check("старий flex:1 1 auto на розмірі теж прибраний",
        !/\.product-hover-panel \.product-sizes-wrap\{[^}]*flex\s*:\s*1 1 auto/.test(css));
}

console.log("\n[3] Список: обмеження ширини тепер доходить до вкладених блоків");
{
  const meta=rule(".products-grid.list-view .product-meta-row");
  check("meta-row знайдено", meta!==null);
  check("align-items:stretch (було flex-start — і ламало прокрутку)",
        /align-items\s*:\s*stretch/.test(meta), meta);
  check("flex-start більше немає", !/align-items\s*:\s*flex-start/.test(meta), meta);

  const opts=rule(".products-grid.list-view .product-meta-row .product-options");
  check("options знайдено", opts!==null);
  check("align-items:stretch і тут", /align-items\s*:\s*stretch/.test(opts), opts);
  check("width:100% — ширина колонки доходить донизу", /width\s*:\s*100%/.test(opts), opts);
  check("min-width:0 лишився", /min-width\s*:\s*0/.test(opts));
}

console.log("\n[4] Ланцюг ширини цілий: колонка → options → обгортка → список");
{
  // саме розрив у цьому ланцюгу і не давав з'явитись стрілкам:
  // якщо хоч одна ланка сідає по вмісту, переповнення не виникає
  const colorsWrap=rule(".products-grid.list-view .product-colors-wrap");
  const sizesWrap=rule(".products-grid.list-view .product-sizes-wrap");
  check("обгортка кольору на всю ширину", colorsWrap!==null && /width\s*:\s*100%/.test(colorsWrap));
  check("обгортка розміру на всю ширину", sizesWrap!==null && /width\s*:\s*100%/.test(sizesWrap));
  check("сам список має overflow-x (спільне правило)",
        /\.product-sizes,\s*\n\s*\.product-colors\{[^}]*overflow-x\s*:\s*auto/.test(css));
  check("стрілки показуються при переповненні",
        /\.product-sizes-wrap\.has-overflow \.sizes-arrow\s*,/.test(css) &&
        /\.product-colors-wrap\.has-overflow \.colors-arrow\{/.test(css));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
