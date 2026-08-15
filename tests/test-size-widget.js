// Власне поле розмірів: вибрати наявний АБО вписати свій.
//
// Стандартний select дозволяв лише вибір із закритого переліку —
// додати ONESIZE чи 39.5 було неможливо. Звичайний list дозволяв би
// будь-що, але без підказок легко наплодити різнобій («ONESIZE»,
// «onesize», «One Size» — три різні розміри у фільтрі).
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
const { loadYaml } = require("./helpers/yaml");

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const SRC = fs.readFileSync(path.join(ROOT,"admin/size-widget.js"),"utf8");
const INDEX = fs.readFileSync(path.join(ROOT,"admin/index.html"),"utf8");

console.log("\n[1] Віджет зареєстрований і підключений");
{
  check("реєструється як sizeTags", /CMS\.registerWidget\("sizeTags"/.test(SRC));
  check("підключений в адмінці", INDEX.includes("size-widget.js"));
  check("підключений ДО побудови форми (після decap-cms.js)",
        INDEX.indexOf("decap-cms") < INDEX.indexOf("size-widget.js"));
  check("не падає, якщо CMS ще немає", /if \(typeof CMS === "undefined"\) return;/.test(SRC));
}

console.log("\n[2] Схема адмінки використовує його");
{
  const cfg = loadYaml("admin/config.yml");
  const products = cfg.collections.find(c => c.name === "products");
  const top = products.fields.find(f => f.name === "sizes");
  const variants = products.fields.find(f => f.name === "variants");
  const inner = variants.fields.find(f => f.name === "sizes");

  check("загальні розміри товару", top.widget === "sizeTags", top.widget);
  check("розміри кольору", inner.widget === "sizeTags", inner.widget);
  check("закритий перелік прибрано з обох",
        !("options" in top) && !("options" in inner));
  check("обидва лишились необов'язковими",
        top.required === false && inner.required === false);
  check("у підказці сказано, що можна вписати своє",
        /впишіть свій/i.test(top.hint) && /впишіть свій/i.test(inner.hint));
}

console.log("\n[3] Поведінка поля");
{
  // Витягуємо лише сам клас і те, від чого він залежить, — обгортку
  // IIFE брати не можна: обрізана, вона лишає незакриту дужку.
  const parts = [
    SRC.match(/var FALLBACK = \[[\s\S]*?\];/)[0],
    "var knownSizes = null;",
    SRC.match(/function loadKnownSizes\(\) \{[\s\S]*?\n    \}/)[0],
    SRC.match(/function toArray\(value\) \{[\s\S]*?\n    \}/)[0],
    SRC.match(/var SizeTagsControl = createClass\(\{[\s\S]*?\n    \}\);/)[0],
    "return SizeTagsControl;",
  ].join("\n");

  const spec = new Function("createClass","h","fetch", parts)(
    x => x,
    (t,p,c) => ({ tag:t, props:p||{}, children:c }),
    () => Promise.resolve({ ok:false })
  );

  function make(value) {
    const i = Object.create(spec);
    let committed = value || [];
    i.props = { value, forID:"f1", classNameWrapper:"w",
                onChange: v => { committed = v; } };
    i.state = spec.getInitialState.call(i);
    i.setState = o => Object.assign(i.state, o);
    i.get = () => committed;
    return i;
  }

  // читання значення в різних форматах
  const fromArray = make(["S","M"]);
  check("масив читається", spec.values.call(fromArray).join(",") === "S,M");

  const fromImmutable = make({ toJS: () => ["L"] });
  check("Immutable-список читається", spec.values.call(fromImmutable).join(",") === "L");

  check("порожнє значення не ламає", spec.values.call(make(null)).length === 0);

  // додавання
  let i = make(["S"]);
  spec.add.call(i, "ONESIZE");
  check("вписаний власний розмір додається", i.get().join(",") === "S,ONESIZE", i.get().join(","));

  i = make(["S"]);
  spec.add.call(i, "M, L , XL");
  check("кілька через кому — окремими розмірами", i.get().join(",") === "S,M,L,XL", i.get().join(","));

  i = make(["S"]);
  spec.add.call(i, "  ");
  check("порожній ввід ігнорується", i.get().join(",") === "S");

  // дублі — головна причина різнобою у фільтрі
  i = make(["S"]);
  spec.add.call(i, "s");
  check("дубль в іншому регістрі не додається", i.get().join(",") === "S", i.get().join(","));

  i = make(["S","M"]);
  spec.add.call(i, "M");
  check("точний дубль не додається", i.get().join(",") === "S,M");

  // видалення
  i = make(["S","M","L"]);
  spec.remove.call(i, "M");
  check("розмір прибирається", i.get().join(",") === "S,L");

  // Backspace у порожньому полі
  i = make(["S","M"]);
  i.state.input = "";
  spec.onKeyDown.call(i, { key:"Backspace", preventDefault(){} });
  check("Backspace прибирає останній", i.get().join(",") === "S", i.get().join(","));

  // Enter не має відправляти форму
  i = make([]);
  i.state.input = "42";
  let prevented = false;
  spec.onKeyDown.call(i, { key:"Enter", preventDefault(){ prevented = true; } });
  check("Enter перехоплено (інакше адмінка спробувала б зберегти)", prevented);
  check("і розмір додано", i.get().join(",") === "42");
}

console.log("\n[4] Підказки беруться з розділу «Розміри»");
{
  check("читає data/size-groups.json", SRC.includes("size-groups.json"));
  check("є запасний перелік, якщо файл недоступний", /FALLBACK/.test(SRC));
  check("підказка не пропонує вже додані", /indexOf\(o\) === -1/.test(SRC));
  check("не оновлює стан після зникнення поля", /self\.gone/.test(SRC));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
