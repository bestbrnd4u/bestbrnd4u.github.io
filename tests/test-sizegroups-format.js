(async()=>{
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const { installBrowserStubs } = require("./helpers/browser-stubs");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

console.log("\n[1] Формат файлу відповідає тому, що чекає Decap");
{
  const raw=JSON.parse(fs.readFileSync(path.join(ROOT,"data/size-groups.json"),"utf8"));
  check("корінь — об'єкт, а не масив (інакше розділ порожній)",
        !Array.isArray(raw) && typeof raw==="object", Array.isArray(raw)?"array":typeof raw);
  check("ключ збігається з іменем поля в конфізі — groups", Array.isArray(raw.groups));
  // Скільки саме груп — вирішують дані, а не тест: раніше тут стояло
  // жорстке 4, і видалення групи «Сумки» валило перевірку, хоча файл
  // лишався коректним. Важливо, що групи є і що в кожної є ключ.
  check("групи на місці", raw.groups.length>0 && raw.groups.every(g=>g.key),
        raw.groups.map(g=>g.key).join(","));
}

console.log("\n[2] Завантажувач розуміє обидві форми");
async function load(payload){
  const dom=new JSDOM("",{runScripts:"outside-only"});
  const {window}=dom;
  const cs=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  installBrowserStubs(window);
  window.eval("window.FALLBACK_SIZE_GROUPS = "+cs.match(/const FALLBACK_SIZE_GROUPS = (\[[\s\S]*?\n\]);\n/)[1]+";");
  window.eval(cs.match(/let sizeGroupsPromise[\s\S]*?\n}\n/)[0]
      .replace("FALLBACK_SIZE_GROUPS","window.FALLBACK_SIZE_GROUPS"));
  window.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve(payload)});
  return window.loadSizeGroups();
}
{
  const real=JSON.parse(fs.readFileSync(path.join(ROOT,"data/size-groups.json"),"utf8"));
  const fromObject=await load(real);
  check("формат Decap {groups:[…]} читається повністю",
        fromObject.length===real.groups.length, fromObject.length);
  check("назви збереглись",
        fromObject.map(g=>g.title).join(",")===real.groups.map(g=>g.title).join(","),
        fromObject.map(g=>g.title).join(","));

  const fromArray=await load(real.groups);
  check("голий масив теж працює (зворотна сумісність)",
        fromArray.length===real.groups.length, fromArray.length);

  const broken=await load({});
  // Запасний набір продубльований у common.js. Він мусить збігатися з
  // файлом за складом груп — інакше при збої завантаження у фільтрі
  // зʼявиться те, чого в даних немає (саме так там лишалися «Сумки»).
  check("порожній об'єкт → запасний набір, сайт не ламається", broken.length>0, broken.length);
  check("запасний набір збігається з файлом",
        broken.map(g=>g.key).sort().join(",")===real.groups.map(g=>g.key).sort().join(","),
        broken.map(g=>g.key).join(","));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
})();
