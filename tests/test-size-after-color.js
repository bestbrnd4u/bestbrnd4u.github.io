// Регресія: після зміни кольору список розмірів перемальовується
// (у різних кольорів вони різні), і прив'язані напряму обробники
// губились — розмір переставав вибиратись до перезавантаження.
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const dom=new JSDOM(`<!doctype html><body>
  <div id="productPage">
    <div class="colors">
      <button class="color active" data-color="Чорний" data-sizes='["S","M"]' data-sku="A-1"></button>
      <button class="color" data-color="Білий" data-sizes='["L","XL"]' data-sku="A-2"></button>
    </div>
    <div class="sizes">
      <button class="size">S</button><button class="size">M</button>
    </div>
    <span data-product-sku></span><p data-spec-sku></p>
  </div></body>`,{runScripts:"outside-only",pretendToBeVisual:true});
const {window}=dom; const d=window.document;
window.updateFavoriteButtons=()=>{};
window.getSelectedVariant=()=>({color:"",size:""});
window.addToCart=()=>{};

const cs=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
window.eval(cs.match(/function escapeHtml[\s\S]*?\n}\n/)[0]);
// обробник кліків з common.js (перемикання кольору перемальовує розміри)
window.eval(cs.match(/const colorBtn = event\.target\.closest[\s\S]*?\n    \}\n/)[0]
  .replace(/^/,'document.addEventListener("click", event => {\n')+"\n});");
// делегований обробник розмірів зі сторінки товару
const pj=fs.readFileSync(path.join(ROOT,"assets/js/product.js"),"utf8");
window.eval(pj.match(/if \(!document\.body\.dataset\.sizeClickBound\)[\s\S]*?\n    \}\n/)[0]);

const click=el=>el.dispatchEvent(new window.MouseEvent("click",{bubbles:true}));

console.log("\n[1] До зміни кольору розмір вибирається");
click(d.querySelectorAll(".size")[1]);
check("M став активним", d.querySelectorAll(".size")[1].classList.contains("active"));

console.log("\n[2] Після зміни кольору список оновився");
click(d.querySelectorAll(".color")[1]);
const after=[...d.querySelectorAll(".size")].map(b=>b.textContent.trim());
check("розміри стали від нового кольору", after.join(",")==="L,XL", after.join(","));
check("артикул оновився", d.querySelector("[data-spec-sku]").textContent==="A-2");

console.log("\n[3] ГОЛОВНЕ: розмір вибирається і після зміни кольору");
const fresh=d.querySelectorAll(".size")[1];
click(fresh);
check("XL став активним (раніше клік не працював)", fresh.classList.contains("active"));
check("активний лише один", d.querySelectorAll(".size.active").length===1);

console.log("\n[4] Повторна зміна кольору теж не ламає");
click(d.querySelectorAll(".color")[0]);
const back=d.querySelectorAll(".size")[0];
click(back);
check("після повернення до першого кольору розмір обирається",
      back.classList.contains("active"));

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
