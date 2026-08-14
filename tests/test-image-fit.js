// Підгонка фото під картку + прибирання старих демо-товарів.
const fs=require("fs"), path=require("path"), {JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const ui = fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8");
const css = fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");

console.log("\n[1] Широке фото показується повністю, а не обрізається");
{
  check("є режим fit-contain у CSS", /\.product-image img\.fit-contain\{[^}]*object-fit\s*:\s*contain/.test(css));
  check("є відступ, щоб товар не впирався в край", /\.fit-contain\{[^}]*padding/.test(css));
  check("рішення за пропорціями фото, а не за категорією",
        ui.includes("naturalWidth / img.naturalHeight"));
  check("подія load слухається у фазі перехоплення (вона не спливає)",
        /addEventListener\("load"[\s\S]{0,300}\}, true\)/.test(ui));
  check("перераховується при перемальовуванні карток", /MutationObserver\(\(\) => fitAll/.test(ui));
  check("і при зміні розміру вікна", /addEventListener\("resize"/.test(ui));
}

console.log("\n[2] Поведінка на справжніх пропорціях");
{
  const dom=new JSDOM("<!doctype html><body></body>",{runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom, d=window.document;
  window.eval(ui.match(/\(function initImageFit\(\)[\s\S]*?\n\}\)\(\);/)[0]);

  function fit(iw, ih, boxW=283, boxH=354){
    d.body.innerHTML='<div class="product-image"><img></div>';
    const box=d.querySelector(".product-image"), img=d.querySelector("img");
    Object.defineProperty(box,"clientWidth",{value:boxW,configurable:true});
    Object.defineProperty(box,"clientHeight",{value:boxH,configurable:true});
    Object.defineProperty(img,"naturalWidth",{value:iw,configurable:true});
    Object.defineProperty(img,"naturalHeight",{value:ih,configurable:true});
    img.dispatchEvent(new window.Event("load"));
    return img.classList.contains("fit-contain");
  }

  check("окуляри 800x800 — повністю (саме тут зрізало дужки)", fit(800,800) === true);
  check("годинник 800x800 — повністю", fit(800,800) === true);
  check("вертикальне 1000x1500 — заповнення, як було", fit(1000,1500) === false);
  check("точно 4:5 — заповнення", fit(800,1000) === false);
  check("дуже широке 1500x1000 — повністю", fit(1500,1000) === true);
  check("майже 4:5 (820x1000) не смикається", fit(820,1000) === false);
  check("без розмірів фото нічого не ламає", fit(0,0) === false);
  check("без розмірів картки нічого не ламає", fit(800,800,0,0) === false);
}

console.log("\n[3] Скрипт прибирання старих демо-товарів");
{
  const { OLD_DEMO_FILES } = require(path.join(ROOT,"scripts/clean-old-products.js"));
  const src = fs.readFileSync(path.join(ROOT,"scripts/clean-old-products.js"),"utf8");

  check("список старих файлів закритий", Array.isArray(OLD_DEMO_FILES) && OLD_DEMO_FILES.length === 21,
        OLD_DEMO_FILES.length);
  check("без шаблонів «усе, крім…» — неможливо знести свої товари",
        !/readdirSync[\s\S]{0,200}filter\([^)]*!/.test(src) || src.includes("OLD_DEMO_FILES.includes"));
  check("за замовчуванням лише показує, видаляє з --apply", src.includes('includes("--apply")'));

  // жоден зі старих файлів не збігається з нинішнім каталогом
  const now = fs.readdirSync(path.join(ROOT,"data/products")).filter(f=>f.endsWith(".json"));
  const clash = OLD_DEMO_FILES.filter(f => now.includes(f));
  check("список не перетинається з вашим каталогом", clash.length === 0, clash.join(", "));
  check("у каталозі рівно 27 товарів", now.length === 27, now.length);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
