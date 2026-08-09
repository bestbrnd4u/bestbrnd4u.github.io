// Регресія: у режимі "список" на десктопі колір і розмір ділили один
// рядок навпіл — при великій кількості кольорів (15) і розмірів (20)
// одночасно обидва тіснились і впирались один в одного, а колір
// узагалі не мав власного обмеження ширини й розпирав рядок за межі
// колонки "meta", наїжджаючи на опис. Тепер — окремими рядками, і в
// кожного власна прокрутка.
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

console.log("\n[1] .product-meta-row у list-view може стиснутись до своєї колонки");
{
  const r = rule(".products-grid.list-view .product-meta-row");
  check("правило знайдено", r !== null);
  check("min-width:0", /min-width\s*:\s*0/.test(r), r);
}

console.log("\n[2] Колір і розмір — ОКРЕМИМИ рядками (стек), а не поруч");
{
  const r = rule(".products-grid.list-view .product-meta-row .product-options");
  check("правило знайдено", r !== null);
  check("flex-direction:column — рядки один під одним", /flex-direction\s*:\s*column/.test(r), r);
  check("є відступ між рядками", /gap\s*:\s*10px/.test(r));
}

console.log("\n[3] Колір — повний рядок, обгортка на всю ширину");
{
  // обмеження ширини живе на обгортці (.product-colors-wrap), бо
  // саме відносно неї позиціонуються стрілки прокрутки
  const wrap = rule(".products-grid.list-view .product-colors-wrap");
  check("правило обгортки знайдено", wrap !== null);
  check("ширина 100% (весь рядок собі)", /width\s*:\s*100%/.test(wrap), wrap);
  check("min-width:0 — може стиснутись", /min-width\s*:\s*0/.test(wrap), wrap);
  check("overflow-x заданий спільно для розміру й кольору",
        /\.product-sizes,\s*\n\s*\.product-colors\{[^}]*overflow-x\s*:\s*auto/.test(css));
}

console.log("\n[4] Розмір — теж повний окремий рядок");
{
  const r = rule(".products-grid.list-view .product-sizes-wrap");
  check("правило знайдено", r !== null);
  check("ширина 100% (більше не ділить рядок з кольором)", /width\s*:\s*100%/.test(r), r);
  check("min-width:0 лишився", /min-width\s*:\s*0/.test(r));
}

console.log("\n[4b] Стрілки доступні в режимі списку");
{
  check("стрілки кольору показуються при переповненні",
        /\.product-colors-wrap\.has-overflow \.colors-arrow\{/.test(css));
  // обидва селектори в ОДНІЙ групі правил — тому шукаємо через кому,
  // а не як окремий блок з власною фігурною дужкою
  check("стрілки розміру теж",
        /\.product-sizes-wrap\.has-overflow \.sizes-arrow\s*,/.test(css));
  // list-view існує на десктопі, а стрілки — у @media(min-width:769px):
  // діапазони збігаються, тож у списку вони справді доступні
  check("правило стрілок лежить у десктопному медіа-блоці",
        /@media\(min-width:769px\)\{[\s\S]*?\.product-colors-wrap\.has-overflow/.test(css));
}

console.log("\n[5] Дані товару id=15: 15 кольорів для стрес-тесту");
{
  // джерело, а не згенерований агрегат (див. helpers/products.js)
  const p15 = require("./helpers/products").findProductById(15);
  check("товар знайдено", !!p15);
  check("рівно 15 варіантів кольору", p15.variants.length === 15, p15.variants.length);
  check("кольори унікальні", new Set(p15.variants.map(v=>v.color)).size === 15);
  check("id і slug не змінились", p15.id === 15 && p15.slug === "import-1786031983644-4");
  check("загальні 20 розмірів товару лишились на місці", p15.sizes.length === 20);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
