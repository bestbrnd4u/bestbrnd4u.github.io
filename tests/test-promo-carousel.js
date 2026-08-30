// Регресія: прев'ю акції на головній ігнорувало порядок з адмінки
// (.filter().slice(0,4) сортував як завгодно й обрізав усе зайве —
// товар за межею 4-го міг зникнути навіть якщо адмін обрав його
// вручну) і завжди показувало рівно 4 картки без можливості
// переглянути решту.
const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

function loadPicker(){
  const dom=new JSDOM("",{runScripts:"outside-only"});
  const {window}=dom;
  const src=fs.readFileSync(path.join(ROOT,"assets/js/app.js"),"utf8");
  // Саме правило набору переїхало в common.js: те саме потрібне
  // сторінці акції, а дві копії вже встигли розійтись (див.
  // tests/test-promo-rules.js). pickPromotionProducts лишилась
  // тонкою обгорткою, тож без цього рядка вона кличе порожнечу.
  const common=fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  window.eval(common.slice(common.indexOf("function promotionProducts"),
                           common.indexOf("function getDiscountPercent")));
  window.eval(src.match(/function pickPromotionProducts[\s\S]*?\n}\n/)[0]);
  return window.pickPromotionProducts;
}

const PRODUCTS=[
  {id:1,title:"Jet Set Travel",brand:"Michael Kors"},
  {id:2,title:"Metropolis Mini",brand:"Furla"},
  {id:3,title:"Urban Sneakers",brand:"Nike"},
  {id:4,title:"Guess Noelle Black",brand:"Guess"},
  {id:5,title:"Crossbody Bag",brand:"Calvin Klein"},
  {id:6,title:"Guess Tote",brand:"Guess"},        // бренд збігається, у ручний список НЕ входить
];

console.log("\n[1] Порядок з адмінки зберігається РІВНО як заданий");
{
  const pick=loadPicker();
  // саме такий порядок обрав адмін на скріні: Jet Set Travel,
  // Metropolis Mini, Urban Sneakers, Guess Noelle Black, Crossbody Bag
  const promo={brand:"Guess",productIds:[1,2,3,4,5]};
  const result=pick(promo,PRODUCTS).map(p=>p.id);
  check("порядок відтворено 1:1", result.slice(0,5).join(",")==="1,2,3,4,5", result.join(","));
}

console.log("\n[2] П'ятий (і далі) товар більше не зникає");
{
  const pick=loadPicker();
  const promo={brand:"",productIds:[1,2,3,4,5]};
  const result=pick(promo,PRODUCTS);
  check("усі 5 обраних товарів на місці, жоден не відкинуто",
        result.length===5 && result.map(p=>p.id).sort().join(",")==="1,2,3,4,5",
        result.map(p=>p.id).join(","));
  check("Urban Sneakers (id=3) присутній", result.some(p=>p.id===3));
}

console.log("\n[3] Товари бренду без ручного вибору додаються ПІСЛЯ, без дублів");
{
  const pick=loadPicker();
  const promo={brand:"Guess",productIds:[2,1]}; // ручний порядок: Metropolis, Jet Set
  const result=pick(promo,PRODUCTS).map(p=>p.id);
  check("ручний порядок на початку", result[0]===2 && result[1]===1, result.join(","));
  check("товари бренду Guess (4,6) додались після, у порядку каталогу",
        result.slice(2).join(",")==="4,6", result.join(","));
  check("жодних дублів", new Set(result).size===result.length);
}

console.log("\n[4] Без ручного списку — просто товари бренду, як і раніше");
{
  const pick=loadPicker();
  const promo={brand:"Guess",productIds:[]};
  const result=pick(promo,PRODUCTS).map(p=>p.id);
  check("обидва товари Guess присутні", result.join(",")==="4,6", result.join(","));
}

console.log("\n[5] Розмітка: переюзана карусель \"Популярні товари\", не нова");
{
  const src=fs.readFileSync(path.join(ROOT,"assets/js/app.js"),"utf8");
  check("є .carousel-track.products-grid для акцій",
        src.includes('class="brand-campaign-products products-grid carousel-track"'));
  check("є стрілки carousel-prev/next", src.includes("carousel-prev") && src.includes("carousel-next"));
  check("викликається спільний initCarousel(), а не окрема логіка",
        src.includes("if (typeof initCarousel === \"function\") initCarousel(carouselEl)"));
  check("немає більше жорсткого .slice(0, 4)", !src.includes(".slice(0, 4)"));
}

console.log("\n[6] CSS: колонки/прокрутку задає лише спільний клас, дублів не лишилось");
{
  const css=fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");
  const rules=[...css.matchAll(/\.brand-campaign-products\{([^}]*)\}/g)];
  check("лишилось рівно одне правило .brand-campaign-products", rules.length===1, rules.length);
  check("воно містить лише відступ, без display/grid-template-columns",
        rules[0] && /margin-bottom/.test(rules[0][1]) && !/display\s*:\s*grid/.test(rules[0][1]));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
