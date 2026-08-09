// Перевіряє факт, а не лише розмітку: initCarousel() САМ ховає
// стрілки, коли всі товари влазять без прокрутки (рівно 4 чи
// менше — саме цей випадок просив НЕ показувати карусель), і
// вмикає їх, тільки коли товарів справді більше.
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const dom=new JSDOM(`<!doctype html><body>
  <div class="carousel brand-campaign-carousel">
    <button class="carousel-arrow carousel-prev"></button>
    <div class="carousel-track"><div class="product-card"></div></div>
    <button class="carousel-arrow carousel-next"></button>
  </div>
</body>`,{runScripts:"outside-only",pretendToBeVisual:true});
const {window}=dom; const d=window.document;
window.requestAnimationFrame=cb=>cb();
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8").match(/function initCarousel[\s\S]*?\n}\n\n\/\//)[0].replace(/\n\/\/$/,""));

const track=d.querySelector(".carousel-track");
const prev=d.querySelector(".carousel-prev");
const next=d.querySelector(".carousel-next");

console.log("\n[1] Рівно 4 (усе влазить, без переповнення) — стрілки ховаються");
Object.defineProperty(track,"scrollWidth",{value:1000,configurable:true});
Object.defineProperty(track,"clientWidth",{value:1000,configurable:true});
window.initCarousel(d.querySelector(".carousel"));
check("prev прихована", prev.style.display==="none", prev.style.display);
check("next прихована", next.style.display==="none", next.style.display);

console.log("\n[2] Товарів більше, ніж влазить — стрілки з'являються");
Object.defineProperty(track,"scrollWidth",{value:1600,configurable:true});
Object.defineProperty(track,"clientWidth",{value:1000,configurable:true});
Object.defineProperty(track,"scrollLeft",{value:0,writable:true,configurable:true});
track.dispatchEvent(new window.Event("scroll"));
check("prev видима", prev.style.display==="", prev.style.display);
check("next видима", next.style.display==="", next.style.display);
check("на початку prev вимкнена", prev.disabled===true);
check("next активна (є куди гортати)", next.disabled===false);

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
