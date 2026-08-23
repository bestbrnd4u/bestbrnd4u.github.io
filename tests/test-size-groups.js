const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
const { loadYaml } = require("./helpers/yaml");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const RAW=JSON.parse(fs.readFileSync(path.join(ROOT,"data/size-groups.json"),"utf8"));
// Decap зберігає file-колекцію як {"<імʼя поля>": [...]}, а не голим
// масивом — інакше розділ в адмінці відкривається порожнім
const GROUPS=Array.isArray(RAW)?RAW:RAW.groups;
// джерела, а не згенерований data/categories.json (див. helpers/products.js)
const CATS=require("./helpers/products").loadCategories();

console.log("\n[1] Налаштування в адмінці");
{
  const _cfg = loadYaml("admin/config.yml");
  const _sg = _cfg.collections.find(c => c.name === "sizeGroups");
  const _g = _sg.files[0].fields[0];
  const yaml = JSON.stringify({
    file: _sg.files[0].file,
    fields: _g.fields.map(f => f.name),
    sizes_widget: _g.fields.find(f => f.name === "sizes").widget,
    sizes_field: (_g.fields.find(f => f.name === "sizes").field || {}).widget,
    sizes_collapsed: _g.fields.find(f => f.name === "sizes").collapsed,
    collections: _cfg.collections.map(c => c.name)
  });
  const info=JSON.parse(yaml);
  check("колекція «Розміри» додана", info.collections.includes("sizeGroups"), info.collections.join(","));
  check("редагує саме data/size-groups.json", info.file==="data/size-groups.json");
  check("є всі потрібні поля",
        ["key","title","department","categories","sizes","guideNote","guideColumns","guideRows"]
          .every(f=>info.fields.includes(f)), info.fields.join(","));
  // Регресія: раніше розміри були select із закритим переліком, і
  // додати власний (напр. ONESIZE чи 39.5) було неможливо. Тепер це
  // вільний список — вписується будь-яке значення.
  check("розміри — вільний список, а не закритий перелік",
        info.sizes_widget === "list", info.sizes_widget);
  check("елемент списку — звичайний рядок", info.sizes_field === "string", info.sizes_field);
  check("значення видно без розгортання", info.sizes_collapsed === false, info.sizes_collapsed);
}

console.log("\n[2] Файл налаштувань коректний");
{
  check("корінь файлу — об'єкт з ключем groups (формат Decap)",
        !Array.isArray(RAW) && Array.isArray(RAW.groups), Array.isArray(RAW)?"array":typeof RAW);
  // Груп три: сумки виведені окремо — усі вони мають ONESIZE, тож
  // фільтр за розміром для них нічого не звужував би (так само, як
  // в окулярів і годинників, у яких групи теж немає).
  check("3 групи", GROUPS.length===3, GROUPS.length);
  GROUPS.forEach(g=>{
    check(`«${g.title}»: є розміри`, Array.isArray(g.sizes)&&g.sizes.length>0);
    if (g.guideNote) {
      check(`«${g.title}»: у кожному рядку значень = стовпців`,
            g.guideRows.every(r=>(r.values||[]).length===g.guideColumns.length),
            g.guideRows.map(r=>(r.values||[]).length).join(","));
      check(`«${g.title}»: рядки таблиці лише з дозволених розмірів`,
            g.guideRows.every(r=>g.sizes.includes(r.size)),
            g.guideRows.filter(r=>!g.sizes.includes(r.size)).map(r=>r.size).join(","));
    }
  });
}

console.log("\n[3] Розв'язання категорій (вручну + через розділ)");
{
  const dom=new JSDOM("",{runScripts:"outside-only"});
  const {window}=dom;
  const common=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  ["resolveGroupCategories","findSizeGroupForCategory"].forEach(fn=>
    window.eval(common.match(new RegExp("function "+fn+"[\\s\\S]*?\\n}\\n"))[0]));

  const tree=Object.values(CATS.reduce((acc,c)=>{
    (acc[c.department]=acc[c.department]||{title:c.department,categories:[]}).categories.push(c.name);
    return acc;},{}));

  const backpacks=GROUPS.find(g=>g.key==="backpacks");
  const shoes=GROUPS.find(g=>g.key==="shoes");

  // «Рюкзаки» перелічують категорії вручну, «Взуття» — через розділ:
  // перевіряємо обидва способи (раніше тут для цього була група сумок).
  check("група з переліком категорій — беруться вони",
        window.resolveGroupCategories(backpacks,tree).includes("Рюкзаки"));
  check("група через розділ підхоплює ВСІ категорії розділу",
        window.resolveGroupCategories(shoes,tree).includes("Босоніжки")
        && window.resolveGroupCategories(shoes,tree).includes("Кросівки"),
        window.resolveGroupCategories(shoes,tree).length+" категорій");
  check("нова категорія розділу підхопиться сама (це і є «динамічно»)",
        window.resolveGroupCategories(shoes,tree).length===
          tree.find(d=>d.title==="Взуття").categories.length);

  check("за категорією знаходиться група: Кросівки → Взуття",
        window.findSizeGroupForCategory(GROUPS,"Кросівки",tree)?.key==="shoes");
  // Сумки тепер без групи — як окуляри й годинники: розмір у них один,
  // таблиці розмірів показувати нема чого.
  check("Жіночі сумки → групи немає (усі сумки ONESIZE)",
        window.findSizeGroupForCategory(GROUPS,"Жіночі сумки",tree)===null);
  check("Годинники (аксесуар) → групи немає, таблиця не показується",
        window.findSizeGroupForCategory(GROUPS,"Годинники",tree)===null);
}

console.log("\n[4] Модалка таблиці розмірів стала динамічною");
{
  const html=fs.readFileSync(path.join(ROOT,"product.html"),"utf8");
  check("контейнер під таблицю є", html.includes('id="sizeGuideBody"'));
  check("статична таблиця сумок прибрана з розмітки", !html.includes("18–22 см"));
  const js=fs.readFileSync(path.join(ROOT,"assets/js/product.js"),"utf8");
  check("є рендер таблиці", js.includes("async function renderSizeGuide"));
  check("викликається для товару", js.includes("renderSizeGuide(product)"));
  check("посилання ховається, якщо таблиці немає", js.includes("openBtn.hidden = true"));
}

console.log("\n[5] Каталог більше не має зашитих груп");
{
  const js=fs.readFileSync(path.join(ROOT,"assets/js/catalog.js"),"utf8");
  check("SIZE_GROUPS не константа з даними", !js.includes('const SIZE_GROUPS = ['));
  check("групи вантажаться з адмінки", js.includes("await loadSizeGroups()"));
  check("є запасний набір на випадок недоступності файлу",
        fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").includes("FALLBACK_SIZE_GROUPS"));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
