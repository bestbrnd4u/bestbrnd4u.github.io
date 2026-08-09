const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
const { loadYaml } = require("./helpers/yaml");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

console.log("\n[1] Налаштування в адмінці");
{
  const _cfg = loadYaml("admin/config.yml");
  const _p = _cfg.collections.find(c => c.name === "products");
  const _f = _p.fields.find(x => x.name === "instagramBlock");
  const _r = _p.fields.find(x => x.name === "instagramReels");
  const out = JSON.stringify({
    values: _f.options.map(o => o.value),
    default: _f.default ?? null,
    req: _f.required !== undefined ? _f.required : true,
    reels_req: _r.required !== undefined ? _r.required : true
  });
  const i=JSON.parse(out);
  check("три варіанти", i.values.join(",")==="general,reels,none", i.values.join(","));
  check("за замовчуванням — реклама акаунту", i.default==="general");
  check("поле необов'язкове (старі товари не ламаються)", i.req===false);
  check("посилання на Reels необов'язкове", i.reels_req===false);
}

async function render(product, homeOk=true){
  const html=fs.readFileSync(path.join(ROOT,"product.html"),"utf8");
  const dom=new JSDOM(html,{runScripts:"outside-only",url:"https://x.test/product"});
  const {window}=dom;
  window.fetch=()=>homeOk
    ? Promise.resolve({ok:true,json:()=>Promise.resolve({instagram:{
        title:"Стежте за нами в Instagram",text:"Нові колекції…",
        buttonText:"Підписатися · @bestbrnd4u",link:"https://instagram.com/bestbrnd4u"}})})
    : Promise.reject(new Error("offline"));
  const js=fs.readFileSync(path.join(ROOT,"assets/js/product.js"),"utf8");
  window.eval(js.match(/async function renderProductInstagram[\s\S]*?\n}\n/)[0]);
  await window.renderProductInstagram(product);
  const d=window.document;
  return {
    hidden:d.getElementById("productInstagram").hidden,
    title:d.getElementById("productInstagramTitle").textContent,
    href:d.getElementById("productInstagramBtn").getAttribute("href"),
    btn:d.getElementById("productInstagramBtn").textContent
  };
}

(async()=>{

console.log("\n[2] Три режими");
{
  const none=await render({instagramBlock:"none"});
  check("«не показувати» → блок прихований, порожнього місця немає", none.hidden===true);

  const gen=await render({instagramBlock:"general"});
  check("«реклама» → блок видимий", gen.hidden===false);
  check("бере текст з головної (не дублюємо налаштування)",
        gen.title==="Стежте за нами в Instagram", gen.title);
  check("веде на акаунт", gen.href==="https://instagram.com/bestbrnd4u", gen.href);

  const reels=await render({instagramBlock:"reels",instagramReels:"https://www.instagram.com/reel/XYZ/"});
  check("«reels» → блок видимий", reels.hidden===false);
  check("заголовок про Reels", reels.title==="Цей товар у Reels", reels.title);
  check("веде на Reels товару", reels.href==="https://www.instagram.com/reel/XYZ/", reels.href);
  check("кнопка «Дивитися Reels»", reels.btn.trim()==="Дивитися Reels", reels.btn);
}

console.log("\n[3] Крайні випадки");
{
  const noLink=await render({instagramBlock:"reels"});
  check("обрали Reels, але посилання немає → показуємо рекламу, а не биту кнопку",
        noLink.hidden===false && noLink.href==="https://instagram.com/bestbrnd4u", noLink.href);

  const legacy=await render({});
  check("старий товар без поля → реклама акаунту (як було)", legacy.hidden===false);

  const blank=await render({instagramBlock:"reels",instagramReels:"   "});
  check("порожні пробіли в посиланні = немає посилання", blank.href==="https://instagram.com/bestbrnd4u");

  const offline=await render({instagramBlock:"general"},false);
  check("немає data/home.json → запасні тексти, блок не ламається",
        offline.hidden===false && offline.title.includes("Instagram"), offline.title);
}

console.log("\n[4] Імпорт розуміє налаштування");
{
  const src=fs.readFileSync(path.join(ROOT,"admin/import.js"),"utf8");
  const dom=new JSDOM("",{runScripts:"outside-only"});
  const {window}=dom;
  window.eval(src.slice(0,src.indexOf("let categoriesCache"))+"\nwindow.__HEADERS=HEADERS;");
  const H=window.__HEADERS;
  check("колонка режиму є", H.includes("Instagram блок (реклама/reels/немає)"));
  check("колонка посилання є", H.includes("Посилання на Reels"));
  const ex=[...src.matchAll(/buildExampleRow\(\[([\s\S]*?)\]\)/g)];
  ex.forEach((m,i)=>{
    const body=m[1].split("\n").filter(l=>!l.trim().startsWith("//")).join("\n");
    check(`приклад ${i+1}: значень = колонок (${H.length})`,
          window.eval("["+body+"].length")===H.length, window.eval("["+body+"].length"));
  });
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

})();
