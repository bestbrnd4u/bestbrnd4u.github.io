// Перевіряє, що під КОЖНИМ полем-картинкою в адмінці є підказка з
const { loadYaml } = require("./helpers/yaml");
// точними розмірами (з razmery-kartinok.md), а не лише під новими
// полями акцій.
const fs=require("fs"),path=require("path"),{execSync}=require("child_process");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

// Рекурсивний обхід усіх полів схеми — шукаємо кожен widget:"image",
// щоб перевірити, що під ним є підказка з розмірами.
function collectImageFields(fields, prefix, out) {
    (fields || []).forEach(f => {
        if (!f || typeof f !== "object") return;
        const p = prefix + "/" + (f.name || "?");
        if (f.widget === "image") {
            out.push({ path: p, label: f.label, hint: f.hint || "" });
        }
        if (f.fields) collectImageFields(f.fields, p, out);
        if (f.field && typeof f.field === "object") collectImageFields([f.field], p, out);
    });
    return out;
}

const _cfg = loadYaml("admin/config.yml");
const _found = [];
_cfg.collections.forEach(c => {
    (c.files || [c]).forEach(entry => {
        collectImageFields(entry.fields, c.name + "/" + (entry.name || ""), _found);
    });
});
const out = JSON.stringify(_found);

const images = JSON.parse(out);

console.log(`\n[1] Знайдено ${images.length} полів-картинок в адмінці\n`);
images.forEach(img => console.log(`  · ${img.path} (${img.label})`));

console.log("\n[2] У КОЖНОГО поля-картинки є підказка з розмірами");
images.forEach(img => {
  const hasHint = img.hint && img.hint.trim().length > 0;
  const hasDimensions = /\d+\s*[×x]\s*\d+/.test(img.hint || "");
  check(`${img.label} (${img.path}): є підказка з пікселями`,
        hasHint && hasDimensions, JSON.stringify(img.hint).slice(0,80));
});

console.log("\n[3] Точкові перевірки конкретних розмірів (звірка з razmery-kartinok.md)");
{
  const byPath = p => images.find(i => i.path.includes(p));
  check("Hero — 2400×1600", /2400\s*[×x]\s*1600/.test(byPath("hero")?.hint||""));
  check("Категорії — 800×660", /800\s*[×x]\s*660/.test(byPath("categories")?.hint||""));
  check("Промо-банер — 2000×1600", /2000\s*[×x]\s*1600/.test(byPath("promo/image")?.hint||""));
  check("Спливаючий банер — 800×800", /800\s*[×x]\s*800/.test(byPath("promoPopups")?.hint||""));
  check("Добірки — 1200×900", /1200\s*[×x]\s*900/.test(byPath("collections")?.hint||""));
  check("Фото товару — 1200×1500", /1200\s*[×x]\s*1500/.test(byPath("products")?.hint||""));
  check("Акції (тизер) згадує усі 4 типи показу",
        /1000.*1160[\s\S]*1800.*900[\s\S]*800.*1000/.test(byPath("promotions/promotions/image")?.hint||"") ||
        /card[\s\S]*hint/.test(""), // допоміжна заглушка, реальна перевірка нижче
        "перевірка нижче");
  const promoTeaser = images.find(i => i.path.endsWith("/image") && i.path.includes("promotions"));
  check("Акції (тизер) — згадані розміри всіх способів показу",
        /1200.*1500/.test(promoTeaser?.hint||"") &&
        /1800.*900/.test(promoTeaser?.hint||"") &&
        /800.*1000/.test(promoTeaser?.hint||""));
  check("Акції — нове поле банера сторінки, 1920×600",
        /1920\s*[×x]\s*600/.test(byPath("promoPageImage")?.hint||""));
  check("Акції — мобільний банер сторінки, 1080×1400",
        /1080\s*[×x]\s*1400/.test(byPath("promoPageImageMobile")?.hint||""));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
