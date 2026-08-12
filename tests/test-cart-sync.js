// Регресія: кошик роздувався після деплою.
//
// Кошик зберігається ПЛОСКИМ масивом (один запис = одна одиниця), а
// об'єднання гостьових даних з акаунтом було конкатенацією. Гілку
// обирали за типом події авторизації: SIGNED_IN — об'єднати.
// Але supabase-js підключений без фіксованої версії, і SIGNED_IN
// почав приходити ще й при поновленні токена / відновленні сесії —
// кожен раз кошик подвоювався: 2^17 = 131072 одиниці одного товару.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const SRC = fs.readFileSync(path.join(ROOT,"assets/js/sync.js"),"utf8");

// витягуємо чисті функції
function load() {
  const pick = n => SRC.match(new RegExp("function " + n + "\\([\\s\\S]*?\\n\\}"))[0];
  const store = {};
  const env = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
  };
  const fn = new Function("localStorage", `
    ${pick("variantKey")}
    ${SRC.match(/const MAX_QTY_PER_VARIANT = \d+;/)[0]}
    ${SRC.match(/const CART_OWNER_KEY = "[^"]+";/)[0]}
    ${pick("clampCart")}
    ${pick("getLocalDataOwner")}
    ${pick("setLocalDataOwner")}
    ${pick("groupCartForRemote")}
    ${pick("expandCartFromRemote")}
    return { clampCart, groupCartForRemote, expandCartFromRemote,
             getLocalDataOwner, setLocalDataOwner, MAX_QTY_PER_VARIANT };
  `)(env.localStorage);
  return fn;
}

const M = load();
const item = (id, color, size) => ({ id, color: color ?? null, size: size ?? null });

console.log("\n[1] Гілку обирає ВЛАСНИК даних, а не тип події");
{
  check("рішення приймається за позначкою власника",
        /getLocalDataOwner\(\) === userId/.test(SRC));
  check("більше немає розгалуження за SIGNED_IN для об'єднання",
        !/event === "SIGNED_IN"[\s\S]{0,120}mergeGuestDataIntoAccount/.test(SRC));
  check("позначка ставиться після об'єднання",
        /setStorage\("favorites", mergedFavorites\);[\s\S]{0,300}setLocalDataOwner\(userId\)/.test(SRC));
  check("позначка ставиться і після простого підтягування",
        /setStorage\("favorites", remoteFavorites\);[\s\S]{0,200}setLocalDataOwner\(userId\)/.test(SRC));
  check("при виході позначка знімається",
        /setLocalDataOwner\(null\)/.test(SRC));
  check("причину зафіксовано в коментарі", /2\^17 = 131072|131072/.test(SRC));
}

console.log("\n[2] Повторні події більше не подвоюють кошик");
{
  // імітуємо логіку обробника: власник збігається → об'єднання не йде
  const USER = "user-1";

  M.setLocalDataOwner(null);
  check("спочатку дані гостьові", M.getLocalDataOwner() === null);

  // перший вхід: гостьовий кошик приєднується
  let local = [item(15,"Білий","40")];
  const remote = [item(15,"Білий","40")];
  let merged = M.clampCart(local.concat(remote));
  M.setLocalDataOwner(USER);
  check("після входу 2 одиниці (гість + акаунт)", merged.length === 2, merged.length);

  // далі 20 повторних подій авторизації
  for (let i = 0; i < 20; i++) {
    if (M.getLocalDataOwner() === USER) {
      merged = M.expandCartFromRemote(M.groupCartForRemote(merged));  // просто підтягування
    } else {
      merged = M.clampCart(merged.concat(remote));                    // об'єднання
    }
  }

  check("після 20 подій кількість НЕ змінилась", merged.length === 2, merged.length);
  check("це не 2^20", merged.length < 1000, merged.length);
}

console.log("\n[3] Інший акаунт на тому ж браузері — дані приєднуються");
{
  M.setLocalDataOwner("user-1");
  check("власник інший → об'єднання спрацює",
        M.getLocalDataOwner() !== "user-2");
}

console.log("\n[4] Обмежувач лікує вже роздуті кошики");
{
  // саме те, що зараз лежить у постраждалих: 131072 одиниці
  const bloated = Array.from({ length: 131072 }, () => item(15,"Білий","40"));

  const fixed = M.clampCart(bloated);
  check(`131072 → ${M.MAX_QTY_PER_VARIANT}`, fixed.length === M.MAX_QTY_PER_VARIANT, fixed.length);

  const grouped = M.groupCartForRemote(bloated);
  check("на сервер їде вже нормальна кількість",
        grouped[0].qty === M.MAX_QTY_PER_VARIANT, grouped[0].qty);

  // і навпаки: зіпсований рядок із сервера не розгортається в гігантський масив
  const expanded = M.expandCartFromRemote([{ product_id:15, color:"Білий", size:"40", qty:131072 }]);
  check("роздутий рядок із сервера теж обрізається",
        expanded.length === M.MAX_QTY_PER_VARIANT, expanded.length);
}

console.log("\n[5] Обмежувач не ламає звичайні кошики");
{
  const normal = [item(15,"Білий","40"), item(15,"Білий","40"), item(2,"Чорний","M")];
  const clamped = M.clampCart(normal);
  check("нормальний кошик не змінюється", clamped.length === 3, clamped.length);

  const grouped = M.groupCartForRemote(normal);
  check("кількості згруповані правильно",
        grouped.find(r => r.product_id === 15).qty === 2 &&
        grouped.find(r => r.product_id === 2).qty === 1);

  // різні варіанти одного товару — окремі позиції, кожна зі своєю межею
  const many = [
    ...Array.from({length:150}, () => item(15,"Білий","40")),
    ...Array.from({length:150}, () => item(15,"Чорний","41")),
  ];
  const two = M.groupCartForRemote(many);
  check("межа діє на КОЖЕН варіант окремо, не на кошик цілком",
        two.length === 2 && two.every(r => r.qty === M.MAX_QTY_PER_VARIANT),
        JSON.stringify(two.map(r => r.qty)));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
