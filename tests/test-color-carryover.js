// Регресія: обраний у каталозі колір має відкриватись на сторінці
// товару, а не скидатись на перший.
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

console.log("\n[1] Каталог кладе колір у посилання");
{
  // jsdom не дає підмінити window.location (спроба присвоїти href
  // викликає справжню навігацію), тож перевіряємо дві речі окремо:
  // що обробник додає color у запит, і що getSelectedVariant справді
  // повертає ОБРАНИЙ колір, а не перший.
  const cs=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  check("обробник картки кладе color у запит", /if \(color\) query\.set\("color", color\);/.test(cs));
  check("розмір теж лишився", /if \(size\) query\.set\("size", size\);/.test(cs));

  const dom=new JSDOM(`<!doctype html><body>
    <div class="product-card" data-id="7">
      <div class="product-options">
        <button class="mini-color" data-color="Чорний"></button>
        <button class="mini-color active" data-color="Білий"></button>
        <button class="mini-size active">M</button>
      </div>
    </div></body>`,{runScripts:"outside-only"});
  const {window}=dom;
  window.eval(cs.match(/function getSelectedVariant[\s\S]*?\n}\n/)[0]);
  const picked=window.getSelectedVariant(window.document.querySelector(".product-card"));
  check("береться саме обраний колір, а не перший", picked.color==="Білий", picked.color);
  check("і обраний розмір", picked.size==="M", picked.size);
}

console.log("\n[2] Сторінка товару відкриває саме цей колір");
{
  const js=fs.readFileSync(path.join(ROOT,"assets/js/product.js"),"utf8");
  check("читає ?color з URL", js.includes('get("color")'));
  check("активний варіант шукається за кольором", js.includes("variants.findIndex(variant => variant.color === requestedColor)"));
  check("якщо кольору немає в URL — перший (Math.max з 0)",
        /Math\.max\(\s*\n?\s*variants\.findIndex[\s\S]{0,80}?,\s*0\s*\n?\s*\)/.test(js));
  check("свотч підсвічується за activeIndex", js.includes('index === activeIndex ? "active"'));
  check("галерея бере фото активного кольору", js.includes("activeVariant.images"));
  check("артикул — активного кольору", js.includes("getVariantSku(product, activeVariant)"));
  check("розміри — активного кольору", js.includes("getVariantSizes(product, activeVariant)"));
}

console.log("\n[3] Логіка вибору індексу");
{
  const dom=new JSDOM("",{runScripts:"outside-only"});
  const {window}=dom;
  window.eval(`window.pick = (variants, requestedColor) => Math.max(
      variants.findIndex(v => v.color === requestedColor), 0);`);
  const v=[{color:"Чорний"},{color:"Білий"},{color:"Бежевий"}];
  check("другий колір → індекс 1", window.pick(v,"Білий")===1);
  check("третій → 2", window.pick(v,"Бежевий")===2);
  check("невідомий колір → перший (0), а не -1", window.pick(v,"Рожевий")===0);
  check("порожній параметр → перший", window.pick(v,null)===0);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
