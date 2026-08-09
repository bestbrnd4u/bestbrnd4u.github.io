// Регресія: у панелі наведення на картку в сітці (перший тип
// перегляду) колір мав flex:0 0 auto — ніколи не стискався й не
// прокручувався. При 15 кольорах рядок просто ріс без обмежень.
const fs=require("fs"),path=require("path");
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

console.log("\n[1] Колір у панелі наведення на всю ширину і прокручується");
{
  // Раніше колір і розмір ділили один рядок (колір мав max-width:45%,
  // розмір flex:1 1 auto). Тепер вони у СТОВПЧИК — кожен на всю
  // ширину панелі, бо стрілки прокрутки (по 8px назовні з кожного
  // боку) не вміщались у зазор 14px між ними й накладались.
  check("обидві обгортки на всю ширину панелі",
        /\.product-hover-panel \.product-sizes-wrap,\s*\n\s*\.product-hover-panel \.product-colors-wrap\{[^}]*width\s*:\s*100%/.test(css));
  check("стара max-width:45% на кольорі прибрана",
        !/\.product-hover-panel \.product-colors-wrap\{[^}]*max-width\s*:\s*45%/.test(css));

  const opts = rule(".product-hover-panel .product-options");
  check("рядок опцій став стовпчиком", /flex-direction\s*:\s*column/.test(opts), opts);

  // сам скрол — у спільному правилі .product-sizes, .product-colors
  check("overflow-x:auto заданий спільно для розміру й кольору",
        /\.product-sizes,\s*\n\s*\.product-colors\{[^}]*overflow-x\s*:\s*auto/.test(css));
  check("стара безумовна flex:0 0 auto на .product-colors прибрана",
        rule(".product-hover-panel .product-colors") === null);
}

console.log("\n[2] Кружечки кольору не стискаються при прокрутці");
{
  check("flex-shrink:0 заданий у десктопному блоці",
        /\.product-colors \.mini-color\{[^}]*flex-shrink\s*:\s*0/.test(css));
}

console.log("\n[3] Розмір теж на всю ширину і не зламаний");
{
  check("розмір ділить те саме правило width:100% з кольором",
        /\.product-hover-panel \.product-sizes-wrap,\s*\n\s*\.product-hover-panel \.product-colors-wrap\{/.test(css));
  check("стрілки розміру показуються при переповненні",
        /\.product-sizes-wrap\.has-overflow \.sizes-arrow\s*,/.test(css));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
