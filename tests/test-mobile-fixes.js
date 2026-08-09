const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

console.log("\n[1] Тапи в картці на мобільному");
{
  const css=fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");
  // Селектор більше НЕ прив'язаний до #catalogGrid — рядок опцій
  // тепер прокручується скрізь, де є .product-card (список каталогу,
  // "Акції", каруселі), а не лише в самому каталозі.
  const m=css.match(/\.product-card \.product-options\{([^}]*)\}/);
  check("правило рядка опцій знайдено (тепер universal, без #catalogGrid)", !!m);
  // прибираємо коментарі — слово pan-x згадується в поясненні,
  // нас цікавить лише жива декларація
  const decls=m[1].replace(/\/\*[\s\S]*?\*\//g,"");
  check("touch-action:pan-x прибрано (він гасив кліки по кольору/розміру)",
        !/touch-action\s*:\s*pan-x/.test(decls), decls.match(/touch-action[^;]*/)?.[0]);
  check("горизонтальна прокрутка лишилась", /overflow-x\s*:\s*auto/.test(m[1]));
}

console.log("\n[2] Телефон — клік дзвонить");
{
  const pages=fs.readdirSync(ROOT).filter(f=>f.endsWith(".html"));
  const withPhone=pages.filter(f=>fs.readFileSync(path.join(ROOT,f),"utf8").includes("+380 XX XXX XX XX"));
  const linked=withPhone.filter(f=>fs.readFileSync(path.join(ROOT,f),"utf8").includes('class="phone-link"'));
  check("номер оформлено посиланням на всіх сторінках, де він є",
        linked.length===withPhone.length, `${linked.length} з ${withPhone.length}`);

  const dom=new JSDOM('<a class="phone-link" href="tel:+380000000000">+380 44 585 50 40</a>'+
                      '<a class="phone-link" href="tel:+380000000000">+380 XX XXX XX XX</a>',
                      {runScripts:"outside-only"});
  const {window}=dom;
  window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8")
    .match(/function syncPhoneLinks[\s\S]*?\n}\n/)[0]);
  window.syncPhoneLinks();
  const links=window.document.querySelectorAll("a.phone-link");
  check("справжній номер → href tel: з цифрами з тексту",
        links[0].getAttribute("href")==="tel:+380445855040", links[0].getAttribute("href"));
  check("номер-заглушка не стає посиланням у нікуди",
        links[1].getAttribute("href")===null, links[1].getAttribute("href"));
}

console.log("\n[3] Скрол до «Популярні товари»");
{
  const dom=new JSDOM('<header></header><div style="height:2000px"></div>'+
                      '<section id="products"><div class="section-title"><h2>Популярні товари</h2></div></section>',
                      {runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom; const d=window.document;
  Object.defineProperty(d.querySelector("header"),"offsetHeight",{value:64,configurable:true});

  const heading=d.querySelector(".section-title");
  let opts=null;
  heading.scrollIntoView=o=>{opts=o;};

  window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8")
    .match(/document\.addEventListener\("click", event => \{\n\n    const link = event\.target\.closest\?\.\('a\[href\^="#"\]'\);[\s\S]*?\n\}\);\n/)[0]);

  const a=d.createElement("a"); a.href="#products"; d.body.appendChild(a);
  a.dispatchEvent(new window.MouseEvent("click",{bubbles:true,cancelable:true}));

  check("скрол іде до заголовка, а не до краю секції", opts!==null);
  check("плавно і до верху", opts && opts.behavior==="smooth" && opts.block==="start", JSON.stringify(opts));
  check("зсув = висота шапки + 12 (рахується, а не зашитий)",
        heading.style.scrollMarginTop==="76px", heading.style.scrollMarginTop);
}

console.log("\n[4] Старі фіксовані зсуви прибрано з CSS");
{
  const css=fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8")
      .replace(/\/\*[\s\S]*?\*\//g,"");
  check("немає global scroll-padding-top:100px", !/scroll-padding-top\s*:\s*100px/.test(css));
  check("немає магічного scroll-margin-top:-58px", !/scroll-margin-top\s*:\s*-58px/.test(css));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
