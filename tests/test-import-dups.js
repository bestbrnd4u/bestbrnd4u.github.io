const fs = require("fs");
const { JSDOM } = require("jsdom");
const ROOT = require("path").join(__dirname, "..");
const SRC = ROOT + "/admin/import.js";

let failures = 0;
const check = (n,c,e) => { if(c) console.log("  ✓",n); else { console.log("  ✗",n,e!==undefined?"→ "+e:""); failures++; } };

// Витягуємо чисті функції виявлення дублів (без DOM-обв'язки)
const src = fs.readFileSync(SRC, "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", url: "https://x.test/admin/import.html" });
const { window } = dom;

let EXISTING = [];
window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(EXISTING) });

const pick = name => {
  const m = src.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}\\n`));
  if (!m) throw new Error("not found: " + name);
  return m[0];
};

window.eval(`
let existingProductsCache = null;
let importedProducts = [];
${pick("loadExistingProducts")}
${pick("normalizeKey")}
${pick("skuKeys")}
${pick("nameKey")}
${pick("detectDuplicates")}
window.__t = {
  detectDuplicates,
  normalizeKey,
  reset(existing){ existingProductsCache = null; },
};
`);

const R = (row, product) => ({ row, title: product.title, product });

(async () => {

console.log("\n[1] Дубль з товаром, який вже є на сайті");
EXISTING = [{ title:"Metropolis", brand:"Furla", sku:"FUR-001" }];
{
  const batch = [
    R(2, { title:"Metropolis", brand:"Furla", sku:"FUR-001" }),
    R(3, { title:"Noelle", brand:"Guess", sku:"GU-777" })
  ];
  await window.__t.detectDuplicates(batch);
  check("збіг за артикулом визначено", batch[0].duplicate?.by === "артикулом", JSON.stringify(batch[0].duplicate));
  check("scope = catalog", batch[0].duplicate?.scope === "catalog");
  check("посилається на назву товару на сайті", batch[0].duplicate?.ref === "Metropolis");
  check("новий товар не позначено дублем", batch[1].duplicate === null);
}

console.log("\n[2] Збіг за брендом+назвою, коли артикула немає");
EXISTING = [{ title:"City Tote", brand:"Michael Kors" }]; window.__t.reset();
{
  const batch = [ R(2, { title:"  city   TOTE ", brand:"michael kors" }) ];
  await window.__t.detectDuplicates(batch);
  check("регістр і подвійні пробіли не заважають", batch[0].duplicate?.by === "брендом і назвою",
        JSON.stringify(batch[0].duplicate));
}

console.log("\n[3] Дубль усередині самого файлу");
EXISTING = []; window.__t.reset();
{
  const batch = [
    R(2, { title:"Air Max", brand:"Nike", sku:"NK-1" }),
    R(3, { title:"Air Max", brand:"Nike", sku:"NK-1" }),
    R(4, { title:"Air Max", brand:"Nike" })
  ];
  await window.__t.detectDuplicates(batch);
  check("перший рядок — не дубль", batch[1-1].duplicate === null);
  check("другий рядок позначено дублем", batch[1].duplicate?.scope === "file");
  check("вказано конкретний рядок-джерело", batch[1].duplicate?.ref === "рядок 2", batch[1].duplicate?.ref);
  check("третій ловиться за брендом+назвою", batch[2].duplicate?.by === "брендом і назвою");
}

console.log("\n[4] Різні товари одного бренду не плутаються");
EXISTING = [{ title:"Metropolis", brand:"Furla" }]; window.__t.reset();
{
  const batch = [
    R(2, { title:"Sleek", brand:"Furla" }),
    R(3, { title:"Metropolis", brand:"Guess" })
  ];
  await window.__t.detectDuplicates(batch);
  check("інша назва того ж бренду — не дубль", batch[0].duplicate === null);
  check("та сама назва іншого бренду — не дубль", batch[1].duplicate === null);
}

console.log("\n[5] Однаковий артикул важливіший за різні назви");
EXISTING = [{ title:"Стара назва", brand:"Furla", sku:"FUR-9" }]; window.__t.reset();
{
  const batch = [ R(2, { title:"Нова назва", brand:"Furla", sku:"fur-9" }) ];
  await window.__t.detectDuplicates(batch);
  check("той самий SKU у різному регістрі — дубль", batch[0].duplicate?.by === "артикулом");
}

console.log("\n[6] Порожні артикули не склеюють різні товари");
EXISTING = []; window.__t.reset();
{
  const batch = [
    R(2, { title:"A", brand:"X", sku:"" }),
    R(3, { title:"B", brand:"X", sku:"" })
  ];
  await window.__t.detectDuplicates(batch);
  check("товари з порожнім SKU не стали дублями", batch[1].duplicate === null, JSON.stringify(batch[1].duplicate));
}

console.log("\n[7] Немає мережі — імпорт не блокується");
{
  window.fetch = () => Promise.reject(new Error("offline"));
  window.__t.reset();
  const batch = [ R(2, { title:"A", brand:"X" }) ];
  let threw = false;
  try { await window.__t.detectDuplicates(batch); } catch { threw = true; }
  check("виключення не кинуто", threw === false);
  check("товар не позначено дублем", batch[0].duplicate === null);
}

console.log(failures===0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

})();
