// Прев'ю в адмінці неможливо перевірити «на око» без браузера, але
// можна перевірити головне: що шаблони реєструються на потрібні
// колекції і що вони РЕНДЕРЯТЬСЯ на справжніх даних товару без
// помилок, видаючи саме розмітку картки сайту, а не дамп полів.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
const { findProductById } = require("./helpers/products");
const { loadYaml } = require("./helpers/yaml");

let failures=0;
const results=[];
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
  // imageClass — це className, який картка передає галереї прев'ю
  // (PreviewGallery ставить його вже своєму <img>). У поверхневому
  // дереві вкладений рендер не виконується, тож клас видно лише тут.
  walk(tree, n=>{
    if (!n.props) return;
    if (n.props.className) out.push(n.props.className);
    if (n.props.imageClass) out.push(n.props.imageClass);
  });
  return out.join(" ");
}
function textOf(tree){
  const out=[];
  walk(tree, n=>{ (n.children||[]).forEach(c=>{ if (typeof c==="string"||typeof c==="number") out.push(String(c)); }); });
  return out.join(" ");
}

console.log("\n[3] Товар рендериться СПРАВЖНЬОЮ карткою на реальних даних");
{
  // Прев'ю перевіряємо на ВЛАСНОМУ наборі з усіма полями: сенс тесту —
  // чи малюється картка, а не чи існує конкретний товар у каталозі.
  // Раніше тест спирався на демо-товар id=15 і впав при заміні каталогу.
  const p = {
    id: 999, title: "Тестовий товар", brand: "Test Brand",
    category: "Жіночі сумки", gender: "Жінкам",
    price: 4299, oldPrice: 4799, badge: "SALE",
    sizes: ["S","M","L"], material: "Шкіра", country: "Італія",
    description: "Опис тестового товару для перевірки прев'ю в адмінці.",
    variants: [
      { color:"Білий", hex:"#ffffff", images:["a.webp"], sku:"T-1" },
      { color:"Чорний", hex:"#000000", images:["b.webp"], sku:"T-2", sizes:["S"] },
    ],
  };
  check("набір даних готовий", !!p.variants.length);

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
    // Фото тепер малює окремий компонент AssetImage — у дереві він
    // присутній як вузол, а заглушку («фото не завантажено») видає
    // вже сам компонент при відсутньому шляху. Це перевірено в блоці
    // [7], тут достатньо переконатись, що місце під фото є.
    // JSON.stringify відкидає функції, тож шукати ключ getAsset марно —
    // орієнтуємось на клас, який компонент отримує від картки.
    const hasImageSlot = classesOf(tree).includes("cms-preview-cover") ||
                         classesOf(tree).includes("cms-preview-nophoto");
    check("місце під фото є навіть без завантаженого файлу", hasImageSlot);
  } catch(err){ ok=false; check("рендер не впав", false, err.message); }
}

console.log("\n[4b] Прев'ю показує всі фото і сторінку товару");
{
  // Раніше прев'ю малювало лише images[0]: решту знімків можна було
  // перевірити тільки після публікації. І сторінки товару в прев'ю не
  // було взагалі.
  const tpl = registered["products"];

  const data = {
    title: "Окуляри", brand: "Jimmy Choo", price: 8600,
    framing: { "b.webp": { zoom: 1.4, x: 50, y: 40 } },
    variants: [{ color: "Nero", hex: "#000", images: ["a.webp", "b.webp", "c.webp"] }],
  };

  const renderAs = view => tpl.render.call({
    state: { view },
    props: { entry: { get: () => Immutable(data) }, getAsset: v => ({ toString: () => v }) }
  });

  const card = renderAs("card");

  // галерея отримує ВЕСЬ список, а не перший елемент
  let gallery = null;
  walk(card, n => {
    if (n.props && Array.isArray(n.props.images) && n.props.framing !== undefined) gallery = n.props;
  });

  check("картка віддає галереї всі фото", !!gallery && gallery.images.length === 3,
        gallery ? gallery.images.length : "галереї немає");
  check("галерея знає про кадрування", !!gallery && !!gallery.framing);

  check("є перемикач вигляду", classesOf(card).includes("cms-preview-tabs"));
  check("за замовчуванням — картка каталогу", classesOf(card).includes("product-card"));

  const page = renderAs("page");

  check("режим сторінки товару малює свою верстку",
        classesOf(page).includes("cms-preview-page"));
  check("у режимі сторінки картки каталогу вже немає",
        !classesOf(page).includes("product-card"));
  check("на сторінці видно назву й бренд",
        textOf(page).includes("Окуляри") && textOf(page).includes("Jimmy Choo"));

  // без стану (як рендерить тест напряму) прев'ю не має падати
  let survived = true;
  try { tpl.render.call({ props: { entry: { get: () => Immutable(data) },
                                   getAsset: v => ({ toString: () => v }) } }); }
  catch (e) { survived = false; }
  check("рендер без ініціалізованого стану не падає", survived);
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

console.log("\n[6] Щойно завантажене фото показується одразу");
{
  // Регресія: getAsset() віддає вже збережені фото миттєво, а щойно
  // завантажені — ні (файл спершу читається в памʼяті браузера).
  // Прев'ю малювалось один раз і не перемальовувалось, тому нове фото
  // лишалось «битим», хоча старі показувались нормально.
  const src = fs.readFileSync(path.join(ROOT,"admin/preview-templates.js"),"utf8");

  check("є компонент, що чекає на файл", /var AssetImage = createClass/.test(src));
  check("перемальовується, коли адреса зʼявилась", /componentDidMount/.test(src));
  check("реагує на заміну фото", /componentDidUpdate/.test(src));
  check("не оновлює стан після зникнення", /componentWillUnmount/.test(src) && /self\.gone/.test(src));
  check("жодного прямого getAsset(...).toString()",
        !/getAsset\([^)]*\)\.toString\(\)/.test(src));

  const body = src.match(/var AssetImage = createClass\(\{[\s\S]*?\n    \}\);/)[0];
  const spec = new Function("createClass","h",
    "return " + body.replace("var AssetImage = createClass(","createClass(").replace(/;$/,""))(
      s => s, (t,p,c) => ({ tag:t, props:p, children:c }));

  const run = (getAsset, p2) => new Promise(res => {
    const i = Object.create(spec);
    i.props = { path: p2, getAsset };
    i.state = spec.getInitialState.call(i);
    i.setState = o => Object.assign(i.state, o);
    spec.componentDidMount.call(i);
    setTimeout(() => res(spec.render.call(i)), 400);
  });

}

console.log("\n[7] Поведінка на всіх станах файлу");
{
  const src = fs.readFileSync(path.join(ROOT,"admin/preview-templates.js"),"utf8");
  const body = src.match(/var AssetImage = createClass\(\{[\s\S]*?\n    \}\);/)[0];
  const spec = new Function("createClass","h",
    "return " + body.replace("var AssetImage = createClass(","createClass(").replace(/;$/,""))(
      x => x, (t,p,c) => ({ tag:t, props:p, children:c }));

  const run = (getAsset, p2) => {
    const i = Object.create(spec);
    i.props = { path: p2, getAsset };
    i.state = spec.getInitialState.call(i);
    i.setState = o => Object.assign(i.state, o);
    spec.componentDidMount.call(i);
    return new Promise(res => setTimeout(() => res(spec.render.call(i)), 350));
  };

  results.push(run(() => "blob:ready", "a.webp").then(o =>
    check("готова адреса — картинка одразу", o.tag === "img" && o.props.src === "blob:ready")));

  results.push(run(() => Promise.resolve("blob:later"), "a.webp").then(o =>
    check("адреса приходить пізніше — теж картинка", o.tag === "img" && o.props.src === "blob:later")));

  let n = 0;
  results.push(run(() => (++n < 2 ? "" : "blob:retry"), "a.webp").then(o =>
    check("порожньо з першого разу — пробує ще (нове фото)", o.tag === "img")));

  results.push(run(() => "", null).then(o =>
    check("фото не обрано — так і написано", String(o.children).includes("не завантажено"))));

  results.push(run(() => { throw new Error("x"); }, "a.webp").then(o =>
    check("помилка відрізняється від очікування", String(o.children).includes("не вдалося"))));
}

Promise.all(results).then(() => {
  console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
  process.exit(failures===0?0:1);
});
