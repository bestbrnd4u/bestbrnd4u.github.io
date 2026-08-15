// Підгонка фото під картку + прибирання старих демо-товарів.
const fs=require("fs"), path=require("path"), {JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const ui = fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8");
const css = fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");

console.log("\n[1] Підхід із fit-contain СКАСОВАНО");
{
  // Спершу я намагався рятувати ситуацію класом fit-contain: широкі
  // фото показувались повністю, але з полями — товар виглядав дрібним.
  // Правильним виявилось інше: звести ВСІ фото до єдиних пропорцій 4:5
  // (див. test-images-pagination.js). Тоді контейнер нічого не ріже, і
  // милиця не потрібна.
  check("клас fit-contain прибраний із CSS", !css.includes("fit-contain"));
  check("і з коду картки", !ui.includes("fit-contain"));
  check("натомість фото нормалізовані — перевіряє test-images-pagination.js", true);
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
