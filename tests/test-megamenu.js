const fs = require("fs");
const { JSDOM } = require("jsdom");
const ROOT = require("path").join(__dirname, "..");

let failures = 0;
const check = (n,c,e) => { if(c) console.log("  ✓",n); else { console.log("  ✗",n,e!==undefined?"→ "+e:""); failures++; } };

const CATEGORIES = [
  { name:"Жіночі сумки", department:"Сумки" },
  { name:"Рюкзаки",      department:"Сумки" },
  { name:"Кросівки",     department:"Взуття" },
  { name:"Годинники",    department:"Аксесуари" }
];

const PRODUCTS = [
  { title:"A", brand:"Furla", gender:"Жінкам",   category:"Жіночі сумки", price:100, isNew:true },
  { title:"B", brand:"Furla", gender:"Жінкам",   category:"Рюкзаки",      price:200 },
  { title:"C", brand:"Guess", gender:"Чоловікам",category:"Кросівки",     price:300, isNew:true },
  { title:"D", brand:"Casio", gender:"Унісекс",  category:"Годинники",    price:400 },
  { title:"E", brand:"Nike",  gender:"Дітям",    category:"Кросівки",     price:500,
    oldPrice:1000 },                                    // -50% → акція
  { title:"F", brand:"Zara",  gender:"Жінкам",   category:"Жіночі сумки", price:950,
    oldPrice:1000 }                                     // -5%  → НЕ акція
];

async function build() {
  const html = fs.readFileSync(ROOT + "/catalog.html", "utf8");
  const dom = new JSDOM(html, { runScripts:"outside-only", pretendToBeVisual:true, url:"https://x.test/catalog" });
  const { window } = dom;
  window.escapeHtml = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  // mega-menu.js читає статі через спільну функцію з common.js
  window.getProductGenders = p => Array.isArray(p?.gender) ? p.gender.filter(Boolean) : (p?.gender ? [p.gender] : []);
  window.fetch = url => Promise.resolve({
    ok:true,
    json: () => Promise.resolve(String(url).includes("categories") ? CATEGORIES : PRODUCTS)
  });
  window.eval(fs.readFileSync(ROOT + "/assets/js/mega-menu.js", "utf8"));
  await new Promise(r => setTimeout(r, 60));
  return window;
}

(async () => {

const W = await build();
const d = W.document;
const menus = [...d.querySelectorAll(".has-mega")];

const cols = menu => [...menu.querySelectorAll(".mega-col")].map(c => ({
  title: c.querySelector(".mega-col-title")?.textContent.trim(),
  links: [...c.querySelectorAll("a:not(.mega-col-title-link)")].map(a => a.textContent.trim()),
  hrefs: [...c.querySelectorAll("a:not(.mega-col-title-link)")].map(a => a.getAttribute("href"))
}));

console.log("\n[1] Меню «Каталог» — колонки за статтю + бренди");
{
  const menu = menus[0].querySelector(".mega-menu");
  const c = cols(menu);
  check("меню перебудовано в колонки", menu.classList.contains("mega-menu-columns"));
  check("4 статі + бренди = 5 колонок", c.length === 5, c.map(x=>x.title).join(" | "));
  check("порядок статей правильний",
        c.slice(0,4).map(x=>x.title).join(",") === "Жінкам,Чоловікам,Унісекс,Дітям", c.map(x=>x.title).join(","));
  check("Унісекс присутній (просили додати)", c.some(x => x.title === "Унісекс"));
  check("остання колонка — Бренди", c[4].title === "Бренди");
  check("у «Жінкам» лише її категорії",
        c[0].links.slice().sort().join(",") === ["Жіночі сумки","Рюкзаки"].sort().join(","), c[0].links.join(","));
  check("категорії йдуть у порядку довідника", c[0].links.join(",") === "Жіночі сумки,Рюкзаки", c[0].links.join(","));
  check("посилання несе і стать, і категорію",
        c[0].hrefs[0] === "catalog?gender=%D0%96%D1%96%D0%BD%D0%BA%D0%B0%D0%BC&category=%D0%96%D1%96%D0%BD%D0%BE%D1%87%D1%96%20%D1%81%D1%83%D0%BC%D0%BA%D0%B8",
        c[0].hrefs[0]);
  check("заголовок статі — посилання на всю стать",
        c[0].hrefs && menu.querySelector(".mega-col-title-link")?.getAttribute("href").includes("gender="));
  check("є «Усі бренди»", c[4].links.includes("Усі бренди"));
  check("бренди без section у посиланні", c[4].hrefs[0].startsWith("catalog?brand="), c[4].hrefs[0]);
}

console.log("\n[2] Меню «Новинки» — лише новинки");
{
  const menu = menus[1].querySelector(".mega-menu");
  const c = cols(menu);
  const titles = c.map(x=>x.title);
  check("тільки статі, що мають новинки", titles.join(",") === "Жінкам,Чоловікам,Бренди", titles.join(","));
  check("у «Жінкам» лише категорія новинки", c[0].links.join(",") === "Жіночі сумки", c[0].links.join(","));
  check("«Рюкзаки» (не новинка) відсутні", !c[0].links.includes("Рюкзаки"));
  check("посилання зберігає section=new", c[0].hrefs[0].startsWith("catalog?section=new&"), c[0].hrefs[0]);
  check("бренди звужені до новинок",
        c[2].links.filter(b=>b!=="Усі бренди").sort().join(",") === "Furla,Guess", c[2].links.join(","));
}

console.log("\n[3] Меню «Акції» — лише знижки від 30%");
{
  const menu = menus[2].querySelector(".mega-menu");
  const c = cols(menu);
  check("лише «Дітям» + Бренди", c.map(x=>x.title).join(",") === "Дітям,Бренди", c.map(x=>x.title).join(","));
  check("товар зі знижкою 5% не потрапив", !c.some(x => x.links.includes("Жіночі сумки")));
  check("посилання зберігає section=sale", c[0].hrefs[0].startsWith("catalog?section=sale&"), c[0].hrefs[0]);
  check("бренд лише Nike", c[1].links.filter(b=>b!=="Усі бренди").join(",") === "Nike", c[1].links.join(","));
}

console.log("\n[4] Панель на всю ширину — меню не стрибає вбік");
{
  const VIEWPORT = 1600;
  const menus2 = [...d.querySelectorAll(".has-mega")];
  // імітуємо реальну розкладку: пункти шапки на різних позиціях
  const lefts = [620, 760, 900];
  menus2.forEach((li, i) => { li.getBoundingClientRect = () => ({ left: lefts[i] }); });
  Object.defineProperty(d.documentElement, "clientWidth", { value: VIEWPORT, configurable: true });
  W.dispatchEvent(new W.Event("resize"));
  await new Promise(r => setTimeout(r, 30));

  const boxes = menus2.map(li => {
    const m = li.querySelector(".mega-menu");
    return { left: parseFloat(m.style.left), width: parseFloat(m.style.width) };
  });

  check("усі три панелі однакової ширини = ширині вікна",
        boxes.every(b => b.width === VIEWPORT), JSON.stringify(boxes));
  check("кожна зсунута рівно на відступ свого пункту",
        boxes.every((b, i) => b.left === -lefts[i]), JSON.stringify(boxes));
  check("абсолютна позиція лівого краю однакова (панель не стрибає)",
        new Set(boxes.map((b, i) => lefts[i] + b.left)).size === 1,
        boxes.map((b,i)=>lefts[i]+b.left).join(","));
  check("лівий край збігається з краєм вікна",
        (lefts[0] + boxes[0].left) === 0);
  check("колонки лежать у центрованій обгортці .mega-inner",
        menus2[0].querySelectorAll(".mega-inner > .mega-col").length === 5);
}

console.log("\n[5] Стійкість: помилка мережі не ламає шапку");
{
  const html = fs.readFileSync(ROOT + "/catalog.html", "utf8");
  const dom = new JSDOM(html, { runScripts:"outside-only", pretendToBeVisual:true, url:"https://x.test/catalog" });
  const { window } = dom;
  window.escapeHtml = v => String(v);
  window.getProductGenders = p => Array.isArray(p?.gender) ? p.gender.filter(Boolean) : (p?.gender ? [p.gender] : []);
  window.fetch = () => Promise.reject(new Error("offline"));
  window.eval(fs.readFileSync(ROOT + "/assets/js/mega-menu.js", "utf8"));
  await new Promise(r => setTimeout(r, 60));
  const menu = window.document.querySelector(".has-mega .mega-menu");
  check("запасна розмітка збереглась", menu.querySelectorAll(".mega-item").length > 0);
  check("клас колонок не додано", !menu.classList.contains("mega-menu-columns"));
}

console.log("\n[6] XSS у назві категорії");
{
  const html = fs.readFileSync(ROOT + "/catalog.html", "utf8");
  const dom = new JSDOM(html, { runScripts:"outside-only", pretendToBeVisual:true, url:"https://x.test/catalog" });
  const { window } = dom;
  window.escapeHtml = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  // mega-menu.js читає статі через спільну функцію з common.js
  window.getProductGenders = p => Array.isArray(p?.gender) ? p.gender.filter(Boolean) : (p?.gender ? [p.gender] : []);
  window.__pwned = false;
  window.fetch = url => Promise.resolve({ ok:true, json: () => Promise.resolve(
    String(url).includes("categories") ? [] :
    [{ title:"X", brand:"B", gender:"Жінкам", price:1,
       category:`Сумки"><img src=x onerror="window.__pwned=true">` }]
  )});
  window.eval(fs.readFileSync(ROOT + "/assets/js/mega-menu.js", "utf8"));
  await new Promise(r => setTimeout(r, 60));
  check("жодного живого <img> не створено", window.document.querySelector(".mega-menu-columns img") === null);
  check("код не виконався", window.__pwned === false);
}

console.log(failures===0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

})();
