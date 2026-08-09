// Регресія: у кольору не було кнопок-стрілок прокрутки — на відміну
// від розміру, який їх уже мав. У режимі "список" стрілок не було
// взагалі ні в кольору, ні в розміру.
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const css=fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");
const ui=fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8");

function rule(selector){
  const esc=selector.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const m=[...css.matchAll(new RegExp("^\\s*"+esc+"\\{([^}]*)\\}","mg"))];
  return m.length ? m.map(x=>x[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g,"") : null;
}

console.log("\n[1] Розмітка: кольори загорнуті й мають стрілки");
{
  check("обгортка .product-colors-wrap є", ui.includes('class="product-colors-wrap"'));
  check("ліва стрілка кольору", ui.includes('colors-arrow colors-arrow-left'));
  check("права стрілка кольору", ui.includes('colors-arrow colors-arrow-right'));
  const wraps=(ui.match(/class="product-colors-wrap"/g)||[]).length;
  check("обидва місця картки (панель наведення + рядок метаданих)", wraps===2, wraps);
  check("стрілки не потрапляють у таб-обхід", /colors-arrow-left[^>]*tabindex="-1"/.test(ui));
}

console.log("\n[2] Стилі стрілок спільні для розміру й кольору");
{
  check("базовий стиль охоплює .colors-arrow", /\.sizes-arrow,\s*\n\.colors-arrow\{/.test(css));
  check("позиція зліва/справа теж", /\.colors-arrow-left\{/.test(css) && /\.colors-arrow-right\{/.test(css));
  check("вимкнений стан", /\.colors-arrow:disabled\{/.test(css) || /\.sizes-arrow:disabled,\s*\n\.colors-arrow:disabled\{/.test(css));
  check("показ лише при переповненні (has-overflow)",
        /\.product-colors-wrap\.has-overflow \.colors-arrow\{/.test(css));
  check(".product-colors отримав overflow-x у десктопному блоці",
        /\.product-sizes,\s*\n\s*\.product-colors\{[^}]*overflow-x\s*:\s*auto/.test(css));
}

console.log("\n[3] Обгортка обмежує ширину (щоб стрілки стали по краях видимого)");
{
  // у панелі наведення колір і розмір тепер у стовпчик — кожен на
  // всю ширину панелі (раніше ділили рядок, і стрілки стикались)
  check("панель наведення: обгортка кольору на всю ширину",
        /\.product-hover-panel \.product-sizes-wrap,\s*\n\s*\.product-hover-panel \.product-colors-wrap\{[^}]*width\s*:\s*100%/.test(css));
  const list=rule(".products-grid.list-view .product-colors-wrap");
  check("список: обгортка на весь рядок", list!==null && /width\s*:\s*100%/.test(list), list);
}

console.log("\n[4] Мобільна картка: обгортки не стискаються замість прокрутки");
{
  const r=rule(".product-card .product-colors,\n    .product-card .product-sizes,\n    .product-card .product-colors-wrap,\n    .product-card .product-sizes-wrap");
  check("обгортки додані в правило flex-shrink:0",
        css.includes(".product-card .product-colors-wrap") && css.includes(".product-card .product-sizes-wrap"));
}

console.log("\n[5] Поведінка: стрілки кольору реально працюють");
{
  const dom=new JSDOM(`<!doctype html><body>
    <div class="product-card">
      <div class="product-colors-wrap">
        <button class="colors-arrow colors-arrow-left"></button>
        <div class="product-colors"></div>
        <button class="colors-arrow colors-arrow-right"></button>
      </div>
    </div></body>`,{runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom, d=window.document;
  window.eval(ui.match(/\(function initHorizontalScrollers\(\)[\s\S]*?\n\}\)\(\);/)[0]);

  const wrap=d.querySelector(".product-colors-wrap");
  const list=d.querySelector(".product-colors");
  const left=d.querySelector(".colors-arrow-left");
  const right=d.querySelector(".colors-arrow-right");

  function setSize(scrollWidth, clientWidth, scrollLeft=0){
    Object.defineProperty(list,"scrollWidth",{value:scrollWidth,configurable:true});
    Object.defineProperty(list,"clientWidth",{value:clientWidth,configurable:true});
    Object.defineProperty(list,"scrollLeft",{value:scrollLeft,writable:true,configurable:true});
  }

  setSize(200,200);
  d.querySelector(".product-card").dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true}));
  check("усе влазить → стрілок немає", !wrap.classList.contains("has-overflow"));

  setSize(600,200,0);
  d.querySelector(".product-card").dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true}));
  check("не влазить → стрілки увімкнено", wrap.classList.contains("has-overflow"));
  check("на початку ліва вимкнена", left.disabled===true);
  check("права активна", right.disabled===false);

  setSize(600,200,400);
  d.querySelector(".product-card").dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true}));
  check("у кінці права вимкнена", right.disabled===true);

  setSize(600,200,0);
  let scrolled=null;
  list.scrollBy=o=>{scrolled=o;};
  const evt=new window.MouseEvent("click",{bubbles:true,cancelable:true});
  right.dispatchEvent(evt);
  check("клік по правій стрілці прокручує вперед", scrolled && scrolled.left>0, JSON.stringify(scrolled));
  check("плавно", scrolled?.behavior==="smooth");
  check("подію скасовано (картка не відкриється)", evt.defaultPrevented===true);

  scrolled=null;
  left.dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}));
  check("ліва прокручує назад", scrolled && scrolled.left<0, JSON.stringify(scrolled));
}

console.log("\n[6] Стрілки розміру не зламані спільним механізмом");
{
  const dom=new JSDOM(`<!doctype html><body>
    <div class="product-card">
      <div class="product-sizes-wrap">
        <button class="sizes-arrow sizes-arrow-left"></button>
        <div class="product-sizes"></div>
        <button class="sizes-arrow sizes-arrow-right"></button>
      </div>
    </div></body>`,{runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom, d=window.document;
  window.eval(ui.match(/\(function initHorizontalScrollers\(\)[\s\S]*?\n\}\)\(\);/)[0]);

  const wrap=d.querySelector(".product-sizes-wrap");
  const list=d.querySelector(".product-sizes");
  Object.defineProperty(list,"scrollWidth",{value:900,configurable:true});
  Object.defineProperty(list,"clientWidth",{value:300,configurable:true});
  Object.defineProperty(list,"scrollLeft",{value:0,writable:true,configurable:true});

  d.querySelector(".product-card").dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true}));
  check("розмір і далі отримує has-overflow", wrap.classList.contains("has-overflow"));

  let scrolled=null;
  list.scrollBy=o=>{scrolled=o;};
  d.querySelector(".sizes-arrow-right").dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}));
  check("стрілка розміру прокручує", scrolled && scrolled.left>0);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
