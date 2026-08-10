// Регресія: у кошику ряд кольору/розміру не прокручувався, а
// РОЗПИРАВ картку. .cart-item-info — грід-елемент у колонці 1fr, а в
// таких типовий min-width:auto: колонка не може стиснутись вужче за
// вміст. Рядок із 20 розмірів робив картку ширшою за екран і
// виштовхував панель «Разом» за край. Переповнення всередині обгорток
// при цьому не виникало — тому й стрілки не з'являлись.
const fs=require("fs"), path=require("path"), {JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const css = fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");

function rule(selector){
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = [...css.matchAll(new RegExp("^\\s*"+esc+"\\{([^}]*)\\}","mg"))];
  return m.length ? m.map(x=>x[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g,"") : null;
}

console.log("\n[1] Ланцюг ширини в кошику цілий (розрив = розпирання картки)");
{
  const info = rule(".cart-item-info");
  check(".cart-item-info знайдено", info !== null);
  check("min-width:0 — грід-колонка може стиснутись", /min-width\s*:\s*0/.test(info), info);

  const options = rule(".cart-item-options,\n.favorite-row .product-options");
  check("рядок опцій має min-width:0",
        css.includes(".cart-item-options,") && /\.cart-item-options,[\s\S]{0,200}min-width\s*:\s*0/.test(css));

  check("обгортки в кошику на всю ширину",
        /\.cart-item \.product-colors-wrap,[\s\S]{0,300}width\s*:\s*100%/.test(css));
}

console.log("\n[2] Обране: та сама захист");
{
  const info = rule(".favorite-row-info");
  check(".favorite-row-info має min-width:0", info !== null && /min-width\s*:\s*0/.test(info), info);
}

console.log("\n[3] Розмітка кошика й обраного містить обгортки зі стрілками");
{
  const cart = fs.readFileSync(path.join(ROOT,"assets/js/cart.js"),"utf8");
  const fav  = fs.readFileSync(path.join(ROOT,"assets/js/favorites.js"),"utf8");

  [["cart.js", cart], ["favorites.js", fav]].forEach(([name, src]) => {
    check(`${name}: обгортка кольору`, src.includes('class="product-colors-wrap"'));
    check(`${name}: обгортка розміру`, src.includes('class="product-sizes-wrap"'));
    check(`${name}: стрілки кольору`, src.includes("colors-arrow-left") && src.includes("colors-arrow-right"));
    check(`${name}: стрілки розміру`, src.includes("sizes-arrow-left") && src.includes("sizes-arrow-right"));
  });
}

console.log("\n[4] Механізм прокрутки бачить кошик і обране");
{
  const ui = fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8");
  check("область пошуку включає .cart-item", ui.includes(".cart-item"));
  check("область пошуку включає .favorite-row", ui.includes(".favorite-row"));
}

console.log("\n[5] Поведінка: стрілки вмикаються саме при переповненні");
{
  const dom = new JSDOM('<!doctype html><body><div id=r></div></body>',
                        {runScripts:"outside-only", pretendToBeVisual:true});
  const {window}=dom, d=window.document;

  d.getElementById("r").innerHTML = `
    <div class="cart-item"><div class="cart-item-info">
      <div class="product-options cart-item-options">
        <div class="product-colors-wrap">
          <button class="colors-arrow colors-arrow-left"></button>
          <div class="product-colors"></div>
          <button class="colors-arrow colors-arrow-right"></button>
        </div>
        <div class="product-sizes-wrap">
          <button class="sizes-arrow sizes-arrow-left"></button>
          <div class="product-sizes"></div>
          <button class="sizes-arrow sizes-arrow-right"></button>
        </div>
      </div>
    </div></div>`;

  window.eval(ui_src());
  function ui_src(){
    return fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8")
      .match(/\(function initHorizontalScrollers\(\)[\s\S]*?\n\}\)\(\);/)[0];
  }

  const sizes = d.querySelector(".product-sizes");
  const wrap  = d.querySelector(".product-sizes-wrap");

  function setW(sw, cw, sl=0){
    Object.defineProperty(sizes,"scrollWidth",{value:sw,configurable:true});
    Object.defineProperty(sizes,"clientWidth",{value:cw,configurable:true});
    Object.defineProperty(sizes,"scrollLeft",{value:sl,writable:true,configurable:true});
  }
  const hover = () => d.querySelector(".cart-item")
      .dispatchEvent(new window.MouseEvent("mouseover",{bubbles:true}));

  setW(800, 900); hover();
  check("широкий кошик, усе вміщається → стрілок немає",
        !wrap.classList.contains("has-overflow"));

  setW(1200, 300); hover();
  check("вузький кошик, не вміщається → стрілки увімкнено",
        wrap.classList.contains("has-overflow"));
  check("ліва вимкнена на початку", d.querySelector(".sizes-arrow-left").disabled === true);
  check("права активна", d.querySelector(".sizes-arrow-right").disabled === false);

  let scrolled = null;
  sizes.scrollBy = o => { scrolled = o; };
  const evt = new window.MouseEvent("click",{bubbles:true,cancelable:true});
  d.querySelector(".sizes-arrow-right").dispatchEvent(evt);
  check("клік по стрілці прокручує", scrolled && scrolled.left > 0, JSON.stringify(scrolled));
  check("клік не спливає до картки", evt.defaultPrevented === true);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
