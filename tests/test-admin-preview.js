// Прев'ю в адмінці неможливо перевірити «на око» без браузера, але
// можна перевірити головне: що шаблони реєструються на потрібні
// колекції і що вони РЕНДЕРЯТЬСЯ на справжніх даних товару без
// помилок, видаючи саме розмітку картки сайту, а не дамп полів.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
const { findProductById } = require("./helpers/products");
const { loadYaml } = require("./helpers/yaml");

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

// -- мінімальні заглушки середовища Decap --
const registered = {};
const styles = [];

function Immutable(obj){
  return {
    get: k => {
      const v = obj[k];
      if (Array.isArray(v)) return { toJS: () => v, ...v };
      return v;
    },
    getIn: ks => ks.reduce((a,k)=>a&&a[k], obj)
  };
}

// найпростіший «React»: повертає дерево, яке легко обійти
function h(tag, props, ...children){
  const flat = [];
  const push = c => Array.isArray(c) ? c.forEach(push) : (c!==null && c!==undefined && flat.push(c));
  children.forEach(push);
  return { tag, props: props||{}, children: flat };
}

global.React = { createElement: h };
global.window = { h };
global.createClass = spec => spec;
global.CMS = {
  registerPreviewTemplate: (name, tpl) => { registered[name]=tpl; },
  registerPreviewStyle: s => styles.push(s)
};

require(path.join(ROOT,"admin/preview-templates.js"));

console.log("\n[1] Шаблони зареєстровані на потрібні колекції");
{
  ["products","promotions","collections","promoPopups"].forEach(name=>{
    check(`є шаблон для «${name}»`, !!registered[name]);
  });
  check("підключено справжній style.css сайту",
        styles.some(s=>s.includes("assets/css/style.css")), styles.join(", "));
  check("підключено власні стилі прев'ю",
        styles.some(s=>s.includes("preview-styles.css")));
}

console.log("\n[2] Колекції в конфізі збігаються з тими, для яких є прев'ю");
{
  const cfg = loadYaml("admin/config.yml");
  const names = cfg.collections.map(c=>c.name);
  Object.keys(registered).forEach(n=>{
    check(`«${n}» справді існує в config.yml`, names.includes(n), names.join(", "));
  });
}

// обхід дерева
function walk(node, fn){
  if (!node || typeof node!=="object") return;
  fn(node);
  (node.children||[]).forEach(c=>walk(c,fn));
}
function classesOf(tree){
  const out=[];
  walk(tree, n=>{ if (n.props && n.props.className) out.push(n.props.className); });
  return out.join(" ");
}
function textOf(tree){
  const out=[];
  walk(tree, n=>{ (n.children||[]).forEach(c=>{ if (typeof c==="string"||typeof c==="number") out.push(String(c)); }); });
  return out.join(" ");
}

console.log("\n[3] Товар рендериться СПРАВЖНЬОЮ карткою на реальних даних");
{
  const p = findProductById(15);
  check("товар 15 знайдено у джерельних файлах", !!p);

  const tpl = registered["products"];
  const tree = tpl.render.call({
    props: { entry: { get: () => Immutable(p) }, getAsset: v => ({ toString: () => v }) }
  });

  const cls = classesOf(tree);
  const txt = textOf(tree);

  check("використано клас картки сайту .product-card", cls.includes("product-card"));
  check("є блок кольорів .mini-color", cls.includes("mini-color"));
  check("є блок розмірів .mini-size", cls.includes("mini-size"));
  check("є ціна .price", /\bprice\b/.test(cls));
  check("є кнопка купівлі .buy-btn", cls.includes("buy-btn"));

  check("назва товару виведена", txt.includes(p.title), p.title);
  check("бренд виведений", txt.includes(p.brand));
  check("ціна відформатована з грн", /грн/.test(txt));

  // знижка рахується так само, як на сайті
  const expected = Math.round((1 - p.price/p.oldPrice)*100);
  check(`знижка порахована (-${expected}%)`, txt.includes("-"+expected+"%"), txt.slice(0,120));

  // під візуалом — решта даних
  check("під карткою є перелік кольорів", cls.includes("cms-preview-variants"));
  check("усі 15 кольорів перелічені",
        (cls.match(/cms-preview-swatch/g)||[]).length === p.variants.length,
        (cls.match(/cms-preview-swatch/g)||[]).length);
  check("виведено характеристики", txt.includes("Матеріал") || txt.includes("Країна"));
  check("виведено опис", p.description ? txt.includes(p.description.slice(0,20)) : true);
}

console.log("\n[4] Товар без фото і без варіантів не ламає прев'ю");
{
  const tpl = registered["products"];
  let ok = true;
  try {
    const tree = tpl.render.call({
      props: { entry:{ get: () => Immutable({ title:"Порожній", brand:"X", price:100 }) },
               getAsset: v => ({ toString: () => v }) }
    });
    check("рендер не впав", !!tree);
    check("показано заглушку замість фото", classesOf(tree).includes("cms-preview-nophoto"));
  } catch(err){ ok=false; check("рендер не впав", false, err.message); }
}

console.log("\n[5] Акція і добірка рендеряться");
{
  const promo = registered["promotions"].render.call({
    props:{ entry:{ get: () => Immutable({
      title:"SUMMER SALE", text:"Guess, Furla", badge:"-30%",
      buttonText:"Дивитись усі товари", image:"/a.jpg", displayType:"banner_products" }) },
      getAsset: v => ({ toString: () => v }) }
  });
  check("банер акції відрендерено", classesOf(promo).includes("cms-preview-promo-banner"));
  check("заголовок акції виведено", textOf(promo).includes("SUMMER SALE"));
  check("попередження про відсутнє окреме фото сторінки",
        textOf(promo).includes("Окреме фото не задане"), textOf(promo).slice(0,90));

  const coll = registered["collections"].render.call({
    props:{ entry:{ get: () => Immutable({ title:"Літня добірка", eyebrow:"ДОБІРКА", image:"/c.jpg" }) },
      getAsset: v => ({ toString: () => v }) }
  });
  check("добірка відрендерена", classesOf(coll).includes("cms-preview-collection"));
  check("заголовок добірки виведено", textOf(coll).includes("Літня добірка"));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
