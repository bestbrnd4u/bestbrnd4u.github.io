const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
const { loadYaml } = require("./helpers/yaml");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

console.log("\n[1] Схема адмінки");
{
  const _cfg = loadYaml("admin/config.yml");
  const _p = _cfg.collections.find(c => c.name === "products");
  const _v = _p.fields.find(f => f.name === "variants");
  const _sku = _v.fields.find(f => f.name === "sku");
  const out = JSON.stringify({
    fields: _v.fields.map(f => f.name),
    required: _sku.required !== undefined ? _sku.required : true
  });
  const info=JSON.parse(out);
  check("артикул є у варіанті кольору", info.fields.includes("sku"), info.fields.join(","));
  check("він необов'язковий (успадковується загальний)", info.required===false);
}

console.log("\n[2] Шаблон імпорту не з'їхав");
{
  const src=fs.readFileSync(path.join(ROOT,"admin/import.js"),"utf8");
  const dom=new JSDOM("",{runScripts:"outside-only"});
  const {window}=dom;
  window.eval(src.slice(0,src.indexOf("let categoriesCache"))+"\nwindow.__HEADERS=HEADERS;");
  const H=window.__HEADERS;
  check("колонка артикула кольору є", H.includes("Колір 1 (артикул)"));
  check("на кожен колір по 6 колонок", H.filter(h=>/^Колір \d/.test(h)).length===18,
        H.filter(h=>/^Колір \d/.test(h)).length);
  const ex=[...src.matchAll(/buildExampleRow\(\[([\s\S]*?)\]\)/g)];
  ex.forEach((m,i)=>{
    const body=m[1].split("\n").filter(l=>!l.trim().startsWith("//")).join("\n");
    check(`приклад ${i+1}: значень = колонок (${H.length})`,
          window.eval("["+body+"].length")===H.length, window.eval("["+body+"].length"));
  });
}

console.log("\n[3] Успадкування артикула");
{
  const dom=new JSDOM("",{runScripts:"outside-only"});
  const {window}=dom;
  const cs=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  window.eval(cs.match(/function getVariantSku[\s\S]*?\n}\n/)[0]);

  const perColor={sku:"GEN-1",variants:[{color:"Чорний",sku:"BLK-9"},{color:"Білий"}]};
  check("колір зі своїм артикулом — свій",
        window.getVariantSku(perColor,perColor.variants[0])==="BLK-9");
  check("колір без свого — загальний",
        window.getVariantSku(perColor,perColor.variants[1])==="GEN-1");
  check("порожній рядок трактується як «немає»",
        window.getVariantSku({sku:"GEN-1",variants:[{sku:"   "}]},{sku:"   "})==="GEN-1");
  check("немає жодного — порожньо", window.getVariantSku({variants:[{}]},{})==="");
}

console.log("\n[4] Сторінка товару показує артикул кольору");
{
  const js=fs.readFileSync(path.join(ROOT,"assets/js/product.js"),"utf8");
  check("свотчі несуть data-sku", js.includes('data-sku="${escapeHtml(getVariantSku'));
  check("підпис під назвою має маркер", js.includes("data-product-sku"));
  check("рядок характеристик має маркер", js.includes("data-spec-sku"));
  // У розмітку артикул іде НЕ через getVariantSku: той віддає значення
  // як є і може повернути порожній рядок — і те, і те Search Console
  // позначає як «Invalid value in field "sku"». Для JSON-LD є окремий
  // schemaSku(): він чистить значення і перебирає товар → кольори в
  // тому самому порядку, що й firstSku() у scripts/build-product-pages.js.
  // Порядок мусить збігатися, інакше та сама адреса покаже Google різний
  // артикул до і після виконання JS.
  //
  // На видимій частині сторінки getVariantSku лишається: там артикул
  // показується як є і перемикається разом з кольором (перевірки вище).
  check("JSON-LD бере артикул через schemaSku", js.includes("sku: schemaSku(product) || undefined"));
  check("порожній артикул у розмітку не потрапляє", js.includes("|| undefined"));
  check("schemaSku починає з артикула товару, як і генератор сторінок",
        /function schemaSku\(product\) \{\s*\n\s*const own = sanitizeSku\(product\.sku\);/.test(js));
  const cs=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  check("перемикання кольору оновлює артикул", cs.includes("[data-product-sku]") && cs.includes("[data-spec-sku]"));
}

console.log("\n[5] Дублі при імпорті бачать артикули кольорів");
{
  const src=fs.readFileSync(path.join(ROOT,"admin/import.js"),"utf8");
  const dom=new JSDOM("",{runScripts:"outside-only",url:"https://x.test/admin/import.html"});
  const {window}=dom;
  let EXISTING=[];
  window.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve(EXISTING)});
  const pick=n=>src.match(new RegExp(`(?:async )?function ${n}\\([\\s\\S]*?\\n}\\n`))[0];
  window.eval(`
let existingProductsCache=null;
${pick("loadExistingProducts")}${pick("normalizeKey")}${pick("skuKeys")}${pick("nameKey")}${pick("detectDuplicates")}
window.__t={detectDuplicates,reset(){existingProductsCache=null;}};`);

  const R=(row,product)=>({row,title:product.title,product});

  (async()=>{
    // на сайті товар з артикулом лише в кольорі
    EXISTING=[{title:"Metropolis",brand:"Furla",variants:[{color:"Чорний",sku:"FR-BLK"}]}];
    window.__t.reset();
    let batch=[R(2,{title:"Зовсім інша назва",brand:"Інший бренд",
                    variants:[{color:"Чорний",sku:"fr-blk"}]})];
    await window.__t.detectDuplicates(batch);
    check("дубль ловиться за артикулом КОЛЬОРУ, попри іншу назву",
          batch[0].duplicate?.by==="артикулом", JSON.stringify(batch[0].duplicate));

    // різні кольори з різними артикулами — не дублі
    EXISTING=[]; window.__t.reset();
    batch=[R(2,{title:"A",brand:"X",variants:[{sku:"S-1"},{sku:"S-2"}]}),
           R(3,{title:"B",brand:"Y",variants:[{sku:"S-3"}]})];
    await window.__t.detectDuplicates(batch);
    check("різні артикули — не дублі", batch[1].duplicate===null);

    // повтор артикула кольору всередині файлу
    EXISTING=[]; window.__t.reset();
    batch=[R(2,{title:"A",brand:"X",variants:[{sku:"DUP"}]}),
           R(3,{title:"B",brand:"Y",variants:[{sku:"DUP"}]})];
    await window.__t.detectDuplicates(batch);
    check("повтор артикула в межах файлу ловиться",
          batch[1].duplicate?.scope==="file", JSON.stringify(batch[1].duplicate));

    console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
    process.exit(failures===0?0:1);
  })();
}
