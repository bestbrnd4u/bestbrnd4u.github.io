// Три виправлення: адреса при зміні кольору, мультивибір статі,
// заповнення кадру товаром.
const fs=require("fs"), path=require("path"), {JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
const { loadProducts } = require("./helpers/products");
const { loadYaml } = require("./helpers/yaml");

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const common = fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
const catalog = fs.readFileSync(path.join(ROOT,"assets/js/catalog.js"),"utf8");
const imp = fs.readFileSync(path.join(ROOT,"admin/import.js"),"utf8");

console.log("\n[1] Адреса оновлюється під обраний колір");
{
  // Регресія: покупець перемикав колір, копіював посилання — а воно
  // вело на той колір, з яким сторінку відкрили.
  check("колір записується в адресу", /url\.searchParams\.set\("color"/.test(common));
  // Орієнтир більше не ?id=: після переходу на статичні сторінки
  // p/<slug>/ адреса товару взагалі без параметрів, і за старою
  // умовою колір перестав би потрапляти в адресний рядок.
  check("лише на сторінці товару (є #productPage)",
        /getElementById\("productPage"\)/.test(common));
  check("replaceState, а не pushState",
        /history\.replaceState/.test(common) && !/history\.pushState\(null, "", url\)/.test(common),
        "pushState засмічував би історію — «Назад» гортав би кольори");
  check("у картці каталогу адресу НЕ чіпаємо", /if \(!cardScope && colorBtn\.dataset\.color\)/.test(common));
  check("помилка адреси не ламає перемикання кольору", /catch \(error\)[\s\S]{0,200}адресний рядок/.test(common));

  // поведінка
  // сторінка товару за новою адресою: #productPage у розмітці є,
  // ?id= немає
  const dom = new JSDOM('<!doctype html><body><div id="productPage"></div></body>',
    { url: "https://x.test/p/bag-10/?color=%D0%A1%D0%B2%D1%96%D1%82%D0%BB%D0%BE", runScripts:"outside-only" });
  const { window } = dom;
  let saved = null;
  window.history.replaceState = (a,b,u) => { saved = String(u); };
  window.eval(`
    const colorBtn = { dataset: { color: "Чорний" }, closest: () => null };
    const cardScope = null;
    ${common.match(/if \(!cardScope && colorBtn\.dataset\.color\) \{[\s\S]*?\n        \}\n/)[0]}
  `);
  check("колір у адресі змінився на обраний", saved && decodeURIComponent(saved).includes("color=Чорний"), saved);
  check("шлях до товару не зіпсовано", saved && saved.includes("/p/bag-10/"), saved);

  // а на сторінці каталогу адресу чіпати не можна
  const dom2 = new JSDOM("<!doctype html><body></body>",
    { url: "https://x.test/catalog", runScripts:"outside-only" });
  let saved2 = null;
  dom2.window.history.replaceState = (a,b,u) => { saved2 = String(u); };
  dom2.window.eval(`
    const colorBtn = { dataset: { color: "Чорний" }, closest: () => null };
    const cardScope = null;
    ${common.match(/if \(!cardScope && colorBtn\.dataset\.color\) \{[\s\S]*?\n        \}\n/)[0]}
  `);
  check("у каталозі адреса не змінюється (немає #productPage)", saved2 === null, saved2);
}

console.log("\n[2] Мультивибір статі");
{
  const cfg = loadYaml("admin/config.yml");
  const products = cfg.collections.find(c => c.name === "products");
  const gender = products.fields.find(f => f.name === "gender");
  check("в адмінці мультивибір", gender.multiple === true);
  check("лишився обов'язковим", gender.required === true);
  check("пояснено в підказці", /кілька/i.test(gender.hint || ""));

  check("є спільна функція читання статей", /function getProductGenders/.test(common));
  check("розуміє і рядок, і список", /Array\.isArray\(raw\)/.test(common));

  const fn = new Function(common.match(/function getProductGenders[\s\S]*?\n}/)[0] + "; return getProductGenders;")();
  check("рядок → список з одного", JSON.stringify(fn({gender:"Жінкам"})) === '["Жінкам"]');
  check("список лишається списком", JSON.stringify(fn({gender:["Жінкам","Унісекс"]})) === '["Жінкам","Унісекс"]');
  check("порожньо → порожній список", JSON.stringify(fn({})) === "[]");

  check("фільтр каталогу: підходить за БУДЬ-ЯКОЮ статтю",
        /getProductGenders\(product\)\.some\(g => selectedGenders\.has\(g\)\)/.test(catalog));
  check("фасети рахують усі статі товару",
        /flatMap\(p => getProductGenders\(p\)\)/.test(catalog));

  const menu = fs.readFileSync(path.join(ROOT,"assets/js/mega-menu.js"),"utf8");
  check("меню показує товар у кожному його розділі",
        /getProductGenders\(product\)\.includes\(gender\)/.test(menu));

  check("імпорт приймає кілька через кому", /splitList\(row\["Для кого"\]\)/.test(imp));
  check("перевіряє кожне значення окремо", /genderList\.filter\(g => !GENDERS\.includes\(g\)\)/.test(imp));
  check("порожній список ловиться (в JS [] — істинний!)",
        /genderList\.length === 0/.test(imp));

  // старі товари не зламані
  const bad = loadProducts().filter(p => fn(p).length === 0).map(p => p.title);
  check("у кожного наявного товару стать читається", bad.length === 0, bad.slice(0,3).join(", "));
}

console.log("\n[3] Фото нормалізовані під єдиний холст");
{
  // Раніше тут вимірювалась частка кадру. Після нормалізації товар
  // ВПИСУЄТЬСЯ в холст 4:5 із однаковим полем, тож частка кадру
  // залежить від форми товару (окуляри широкі — займають менше
  // висоти) і сама по собі вже нічого не каже.
  //
  // Що справді важливо — однакові пропорції: тоді жоден контейнер
  // не ріже фото. Це перевіряє test-images-pagination.js.
  const { execSync } = require("child_process");
  const out = execSync(`python3 -c "
from PIL import Image
import os, re
DIR='${path.join(ROOT,'assets/images/products/uploads')}'
base=[f for f in os.listdir(DIR) if f.endswith('.webp') and not re.search(r'-(600|300)\\.webp$',f)]
rs={round(Image.open(os.path.join(DIR,f)).size[0]/Image.open(os.path.join(DIR,f)).size[1],3) for f in base}
print(len(base), len(rs), sorted(rs)[0])
"`).toString().trim().split(" ");

  check("фото знайдено", Number(out[0]) > 80, out[0]);
  check("усі в одних пропорціях", Number(out[1]) === 1, out[1] + " різних");
  check("це 4:5", Number(out[2]) === 0.8, out[2]);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
