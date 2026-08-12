// Типи в міграціях мусять збігатися зі справжніми схемами.
//
// Регресія: у міграціях 003 і 005 id замовлення був оголошений як
// uuid, тоді як public.orders.id — "bigint generated always as
// identity". Postgres відмовився створювати зовнішній ключ:
//   "Key columns order_id and id are of incompatible types:
//    uuid and bigint"
// А в 003 колонка створилась із неправильним типом молча — і кнопка
// «Додати ТТН» не працювала б, бо збереження id падало б.
//
// Очима я це вже пропустив, тому перевіряємо машинно.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const SUPA = path.join(ROOT, "supabase");
const MIG = path.join(SUPA, "migrations");

// --- типи первинних ключів із наявних схем ---
const schemaSql = fs.readdirSync(SUPA)
  .filter(f => f.endsWith(".sql"))
  .map(f => fs.readFileSync(path.join(SUPA, f), "utf8"))
  .join("\n");

const migrationSql = fs.readdirSync(MIG)
  .filter(f => f.endsWith(".sql"))
  .sort()
  .map(f => ({ file: f, sql: fs.readFileSync(path.join(MIG, f), "utf8") }));

const allSql = schemaSql + "\n" + migrationSql.map(m => m.sql).join("\n");

// таблиця → тип її id
function primaryKeyTypes(sql) {
  const types = {};
  [...sql.matchAll(/create table if not exists (public\.\w+)\s*\(([\s\S]*?)\n\);/gi)]
    .forEach(m => {
      const table = m[1];
      const body = m[2];
      const idLine = body.split("\n").find(l => /^\s*id\s+/.test(l));
      if (!idLine) return;
      const type = idLine.trim().split(/\s+/)[1];
      types[table] = type;
    });
  return types;
}

const pkTypes = primaryKeyTypes(allSql);

console.log("\n[1] Типи первинних ключів зчитані");
{
  check("public.orders знайдено", "public.orders" in pkTypes, JSON.stringify(pkTypes));
  check("orders.id — bigint (а не uuid)", pkTypes["public.orders"] === "bigint",
        pkTypes["public.orders"]);
}

console.log("\n[2] Кожен зовнішній ключ має тип свого цільового ключа");
{
  const refs = [...allSql.matchAll(
    /^\s*(\w+)\s+(\w+)[^\n]*references\s+(public\.\w+)\((\w+)\)/gim
  )];

  check("зовнішні ключі знайдені", refs.length > 0, `${refs.length} шт.`);

  refs.forEach(m => {
    const [, col, type, table, targetCol] = m;

    // auth.users(id) — uuid, його схеми в репозиторії немає
    if (table.startsWith("auth.")) return;

    if (targetCol !== "id") return;

    const expected = pkTypes[table];

    if (!expected) return;

    check(`${col} (${type}) → ${table}.id (${expected})`, type === expected,
          `несумісні типи: Postgres відмовиться створювати обмеження`);
  });
}

console.log("\n[3] Колонки, що зберігають id замовлення, мають бути bigint");
{
  // будь-яка колонка, у назві якої є order/ttn і яка тримає id
  const suspects = [
    ["bot_sessions.awaiting_ttn_for", /awaiting_ttn_for\s+(\w+)/],
    ["order_refusals.order_id", /order_id\s+(\w+)/],
  ];

  suspects.forEach(([name, re]) => {
    const m = allSql.match(re);
    check(`${name} — bigint`, m && m[1] === "bigint", m ? m[1] : "не знайдено");
  });

  check("ніде не лишилось uuid для id замовлення",
        !/order_id\s+uuid|awaiting_ttn_for\s+uuid/.test(allSql));
}

console.log("\n[4] Виправлення типу безпечне для вже застосованих міграцій");
{
  const m003 = migrationSql.find(m => m.file.startsWith("003"));

  // якщо колонку вже створили з неправильним типом, add column if not
  // exists її не змінить — потрібне явне видалення
  check("003 спершу прибирає стару колонку",
        /drop column if exists awaiting_ttn_for/i.test(m003.sql),
        "інакше повторний запуск не виправить тип");

  check("і лише потім додає з правильним типом",
        m003.sql.indexOf("drop column if exists awaiting_ttn_for") <
        m003.sql.indexOf("add column if not exists awaiting_ttn_for"));

  check("пояснено, чому колонку можна видаляти",
        /тимчасовий стан|втрачати нічого/i.test(m003.sql));
}

console.log("\n[5] Повторний запуск міграцій безпечний");
{
  migrationSql.forEach(({ file, sql }) => {

    const creates = [...sql.matchAll(/create table (?!if not exists)/gi)];
    check(`${file}: create table лише з if not exists`, creates.length === 0);

    const policies = [...sql.matchAll(/create policy/gi)];
    const drops = [...sql.matchAll(/drop policy if exists/gi)];
    check(`${file}: кожна політика має drop if exists`,
          policies.length === drops.length, `${policies.length} політик, ${drops.length} drop`);
  });
}

console.log("\n[6] Тести не залежать від ЗГЕНЕРОВАНИХ файлів");
{
  // Регресія (двічі): тести читали data/products.json і
  // data/categories.json — агрегати, які перезбирає GitHub Actions
  // після коміту. У свіжому клоні та в CI до перезбірки вони
  // відстають від джерел, і тест падав не через помилку в коді, а
  // через момент часу. Джерела — data/products/*.json і
  // data/categories/*.json — завжди актуальні.
  const GENERATED = [
    "data/products.json",
    "data/categories.json",
    "data/promotions.json",
    "data/collections.json",
    "data/promo-popups.json",
  ];

  const testsDir = path.join(ROOT, "tests");
  const testFiles = fs.readdirSync(testsDir).filter(f => /^test.*\.js$/.test(f));

  const offenders = [];

  testFiles.forEach(f => {
    const src = fs.readFileSync(path.join(testsDir, f), "utf8");

    GENERATED.forEach(gen => {
      // читання файлу — це readFileSync з цим шляхом; згадка в рядку
      // (напр. перевірка, що бот тягне саме цей URL) — не читання
      const reads = new RegExp(`readFileSync\\([^)]*${gen.replace(/[./]/g, "\\$&")}`);
      if (reads.test(src)) offenders.push(`${f} → ${gen}`);
    });
  });

  check("жоден тест не читає згенерований агрегат",
        offenders.length === 0, offenders.join(", "));

  // і навпаки: помічники для читання джерел існують
  const helper = fs.readFileSync(path.join(testsDir, "helpers/products.js"), "utf8");
  check("є помічник для джерельних товарів", /function loadProducts/.test(helper));
  check("є помічник для джерельних категорій", /function loadCategories/.test(helper));
  check("помічники читають саме теки джерел",
        /"data", "products"/.test(helper) && /"data", "categories"/.test(helper));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
