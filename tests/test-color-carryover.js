// Регресія: обраний у каталозі колір має відкриватись на сторінці
// товару, а не скидатись на перший.
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

console.log("\n[1] Каталог кладе колір у посилання");
{
  // jsdom не дає підмінити window.location (спроба присвоїти href
  // викликає справжню навігацію), тож перевіряємо дві речі окремо:
  // що обробник додає color у запит, і що getSelectedVariant справді
  // повертає ОБРАНИЙ колір, а не перший.
  const cs=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  // Адресу товару тепер збирає productUrl() — після переходу на
  // статичні сторінки p/<slug>/ обробник більше не склеює ?id=&color=
  // руками, а передає обрані колір і розмір параметрами.
  check("обробник картки передає color і size у productUrl",
        /productUrl\(\s*[\s\S]{0,120}?\{\s*color,\s*size\s*\}/.test(cs));
  check("productUrl викидає порожні параметри (щоб не було ?color=&size=)",
        /query\.get\(k\)\)\s*query\.delete\(k\)/.test(cs));

  // сама поведінка, а не лише текст коду
  const w2=new JSDOM("",{runScripts:"outside-only"}).window;
  w2.eval(cs.match(/function productUrl[\s\S]*?\n}\n/)[0]);
  check("колір і розмір потрапляють у канонічну адресу",
        w2.productUrl({id:7,slug:"bag"},{color:"Білий",size:"M"})
          === "/p/bag/?color=%D0%91%D1%96%D0%BB%D0%B8%D0%B9&size=M",
        w2.productUrl({id:7,slug:"bag"},{color:"Білий",size:"M"}));
  check("без вибору — чиста адреса без хвоста",
        w2.productUrl({id:7,slug:"bag"},{color:"",size:""}) === "/p/bag/",
        w2.productUrl({id:7,slug:"bag"},{color:"",size:""}));
  check("товар без slug — запасна стара адреса, яка потім редіректить",
        w2.productUrl({id:7},{color:"Чорний"}) === "/product?id=7&color=%D0%A7%D0%BE%D1%80%D0%BD%D0%B8%D0%B9",
        w2.productUrl({id:7},{color:"Чорний"}));

  const dom=new JSDOM(`<!doctype html><body>
    <div class="product-card" data-id="7">
      <div class="product-options">
        <button class="mini-color" data-color="Чорний"></button>
        <button class="mini-color active" data-color="Білий"></button>
        <button class="mini-size active">M</button>
      </div>
    </div></body>`,{runScripts:"outside-only"});
  const {window}=dom;
  window.eval(cs.match(/function getSelectedVariant[\s\S]*?\n}\n/)[0]);
  const picked=window.getSelectedVariant(window.document.querySelector(".product-card"));
  check("береться саме обраний колір, а не перший", picked.color==="Білий", picked.color);
  check("і обраний розмір", picked.size==="M", picked.size);
}

console.log("\n[2] Сторінка товару відкриває саме цей колір");
{
  const js=fs.readFileSync(path.join(ROOT,"assets/js/product.js"),"utf8");
  check("читає ?color з URL", js.includes('get("color")'));
  // Пошук варіанта переїхав у findVariantByColor: в адресі тепер
  // латиниця, і просте порівняння рядків там більше не працює.
  // Перевіряємо ПОВЕДІНКУ, а не текст рядка у файлі — саме дзеркало
  // тексту колись пропустило падіння пошуку в адмінці.
  const pickVariant=new Function("window",
      js.slice(js.indexOf("function findVariantByColor"),
               js.indexOf("function renderProduct(product) {"))
      + "; return findVariantByColor;")({Translit:require("../assets/js/translit.js")});
  const vs=[{color:"Чорний"},{color:"Білий"}];
  check("активний варіант шукається за кольором", pickVariant(vs,"bilyi")===1);
  check("кирилиця зі старих посилань теж знаходить", pickVariant(vs,"Білий")===1);
  check("якщо кольору немає в URL — перший (Math.max з 0)",
        pickVariant(vs,null)===-1
        && /Math\.max\(findVariantByColor\(variants, requestedColor\), 0\)/.test(js));
  check("свотч підсвічується за activeIndex", js.includes('index === activeIndex ? "active"'));
  check("галерея бере фото активного кольору", js.includes("activeVariant.images"));
  check("артикул — активного кольору", js.includes("getVariantSku(product, activeVariant)"));
  check("розміри — активного кольору", js.includes("getVariantSizes(product, activeVariant)"));
}

console.log("\n[3] Логіка вибору індексу");
{
  const dom=new JSDOM("",{runScripts:"outside-only"});
  const {window}=dom;
  window.eval(`window.pick = (variants, requestedColor) => Math.max(
      variants.findIndex(v => v.color === requestedColor), 0);`);
  const v=[{color:"Чорний"},{color:"Білий"},{color:"Бежевий"}];
  check("другий колір → індекс 1", window.pick(v,"Білий")===1);
  check("третій → 2", window.pick(v,"Бежевий")===2);
  check("невідомий колір → перший (0), а не -1", window.pick(v,"Рожевий")===0);
  check("порожній параметр → перший", window.pick(v,null)===0);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
