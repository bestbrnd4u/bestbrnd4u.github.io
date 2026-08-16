const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

console.log("\n[1] Схема адмінки");
{
  const yaml=fs.readFileSync(path.join(ROOT,"admin/config.yml"),"utf8");
  const pre=yaml.slice(yaml.indexOf('name: "preOrder"'), yaml.indexOf('name: "preOrder"')+300);
  check("preOrder більше не обов'язкове", /required:\s*false/.test(pre), pre.split("\n").slice(0,6).join(" | "));
  const vIdx=yaml.indexOf('name: "variants"');
  const variants=yaml.slice(vIdx, yaml.indexOf('name: "features"', vIdx)>-1?yaml.indexOf('name: "features"',vIdx):vIdx+4000);
  check("у варіанті кольору з'явились розміри", /name:\s*"sizes"/.test(variants));
  check("вони необов'язкові", /name:\s*"sizes"[\s\S]{0,200}?required:\s*false/.test(variants));
}

console.log("\n[2] Шаблон імпорту: колонки не з'їхали");
{
  const src=fs.readFileSync(path.join(ROOT,"admin/import.js"),"utf8");
  const dom=new JSDOM("",{runScripts:"outside-only"});
  const {window}=dom;
  // виконуємо лише верхню частину з HEADERS
  // const HEADERS не видно через окремий window.eval (jsdom не ділить
  // прив'язання між викликами) — експортуємо в тому ж виклику
  window.eval(src.slice(0, src.indexOf("let categoriesCache")) + "\nwindow.__HEADERS = HEADERS;");
  const H=window.__HEADERS;
  check("колонка розмірів кольору є", H.includes("Колір 1 (розміри, через кому)"));
  check("на кожен колір по 6 колонок (додався артикул)",
        H.filter(h=>/^Колір \d/.test(h)).length===18, H.filter(h=>/^Колір \d/.test(h)).length);

  // приклади мають рівно збігатися за довжиною з HEADERS,
  // інакше значення поїдуть у сусідні колонки
  const ex=[...src.matchAll(/buildExampleRow\(\[([\s\S]*?)\]\)/g)];
  check("знайдено 2 приклади", ex.length===2, ex.length);
  ex.forEach((m,i)=>{
    // прибираємо ЛИШЕ рядки-коментарі цілком: наївне вирізання "//"
    // ламало б "https://…" усередині рядків з посиланнями
    const body=m[1].split("\n").filter(l=>!l.trim().startsWith("//")).join("\n");
    const count=window.eval("["+body+"].length");
    check(`приклад ${i+1}: кількість значень = кількості колонок (${H.length})`,
          count===H.length, count);
  });
}

console.log("\n[3] Розміри по кольорах: логіка");
{
  const dom=new JSDOM("",{runScripts:"outside-only"});
  const {window}=dom;
  const common=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  window.eval(common.match(/function getVariantSizes[\s\S]*?\n}\n/)[0]);
  window.eval(common.match(/function getAllProductSizes[\s\S]*?\n}\n/)[0]);

  const perColor={sizes:[],variants:[
    {color:"Чорний",sizes:["40","41","42"]},
    {color:"Білий",sizes:["36","37"]}
  ]};
  check("чорний → свої розміри",
        window.getVariantSizes(perColor,perColor.variants[0]).join(",")==="40,41,42");
  check("білий → свої розміри",
        window.getVariantSizes(perColor,perColor.variants[1]).join(",")==="36,37");
  check("об'єднання для фільтра каталогу",
        window.getAllProductSizes(perColor).sort().join(",")==="36,37,40,41,42",
        window.getAllProductSizes(perColor).join(","));

  // зворотна сумісність: старі товари без розмірів у кольорах
  const legacy={sizes:["S","M","L"],variants:[{color:"Чорний"},{color:"Білий"}]};
  check("старий товар: колір успадковує загальні розміри",
        window.getVariantSizes(legacy,legacy.variants[0]).join(",")==="S,M,L");
  check("старий товар: об'єднання = загальні",
        window.getAllProductSizes(legacy).join(",")==="S,M,L");

  // змішаний випадок
  const mixed={sizes:["S","M"],variants:[
    {color:"Чорний",sizes:["L"]},
    {color:"Білий"}
  ]};
  check("колір зі своїми — свої", window.getVariantSizes(mixed,mixed.variants[0]).join(",")==="L");
  check("колір без своїх — загальні", window.getVariantSizes(mixed,mixed.variants[1]).join(",")==="S,M");
  // РЕГРЕСІЯ: раніше об'єднання брало variant.sizes напряму і в
  // змішаному випадку губило успадковані розміри — товар не
  // знаходився фільтром за розміром, який є лише в кольору
  // без власного списку
  check("об'єднання враховує і свої, і успадковані",
        window.getAllProductSizes(mixed).sort().join(",")==="L,M,S",
        window.getAllProductSizes(mixed).join(","));
}

console.log("\n[4] Картка: розміри активного кольору + data-sizes");
{
  const dom=new JSDOM("<!doctype html><body><div id='root'></div></body>",{runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom;
  const common=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  ["escapeHtml","escapeAttrSingleQuoted","getProductColors","getVariantSizes","getAllProductSizes","getProductGenders","getProductGenderLabel","productUrl"]
    .forEach(fn=>window.eval(common.match(new RegExp("function "+fn+"[\\s\\S]*?\\n}\\n"))[0]));
  window.eval(fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8").replace(
    "function createProductCard(product) {",
    "window.PRODUCT_SIZES=['S','M','L'];window.formatPrice=v=>v+' грн';\nfunction createProductCard(product) {"));

  const p={id:1,title:"Sneakers",brand:"Nike",price:100,sizes:[],variants:[
    {color:"Чорний",hex:"#000",images:["a.jpg"],sizes:["40","41"]},
    {color:"Білий",hex:"#fff",images:["b.jpg"],sizes:["36"]}
  ]};
  window.document.getElementById("root").innerHTML=window.createProductCard(p);
  const d=window.document;
  const shown=[...d.querySelectorAll(".product-sizes-wrap")][0]
      .querySelectorAll(".mini-size");
  check("показані розміри ПЕРШОГО кольору",
        [...shown].map(b=>b.textContent.trim()).join(",")==="40,41",
        [...shown].map(b=>b.textContent.trim()).join(","));
  const swatches=[...d.querySelectorAll(".mini-color")];
  check("на свотчах є data-sizes", swatches.every(sw=>sw.dataset.sizes));
  check("у білого свої розміри в data-sizes",
        JSON.parse(swatches[1].dataset.sizes).join(",")==="36",
        swatches[1].dataset.sizes);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
