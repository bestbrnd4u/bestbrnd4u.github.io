const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

function makeLightbox(){
  const dom=new JSDOM("<!doctype html><body></body>",{runScripts:"outside-only",pretendToBeVisual:true});
  const {window}=dom;
  window.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});
  window.eval(fs.readFileSync(path.join(ROOT,"assets/js/lightbox.js"),"utf8"));
  return window;
}

console.log("\n[1] Лайтбокс приймає відео і embed");
{
  const w=makeLightbox(); const d=w.document;
  w.openLightbox([
    {type:"image",src:"a.jpg"},
    {type:"video",src:"clip.mp4",poster:"a.jpg"},
    {type:"embed",src:"https://www.youtube-nocookie.com/embed/XYZ"}
  ],0,{brand:"Nike",title:"Sneakers"});

  const slides=d.querySelectorAll(".lightbox-slide");
  check("3 слайди", slides.length===3, slides.length);
  check("фото — <img>", !!slides[0].querySelector("img.lightbox-img"));
  check("відео — <video> з controls", !!slides[1].querySelector("video.lightbox-video[controls]"));
  check("у відео є poster (не чорний кадр)",
        slides[1].querySelector("video").getAttribute("poster")==="a.jpg");
  check("embed — <iframe>", !!slides[2].querySelector("iframe.lightbox-embed"));
  check("лічильник рахує всі слайди, включно з відео",
        d.querySelector("#lightboxTotal")?.textContent==="03",
        d.querySelector("#lightboxTotal")?.textContent);
}

console.log("\n[2] Зворотна сумісність: масив рядків");
{
  const w=makeLightbox(); const d=w.document;
  w.openLightbox(["a.jpg","b.jpg"],0,{});
  check("рядки досі працюють як фото", d.querySelectorAll("img.lightbox-img").length===2);
  check("відео не з'явилось нізвідки", d.querySelectorAll("video").length===0);
}

console.log("\n[3] Відео не грає за кадром");
{
  const w=makeLightbox(); const d=w.document;
  w.openLightbox([{type:"video",src:"clip.mp4"},{type:"image",src:"a.jpg"}],0,{});
  const video=d.querySelector("video");
  let paused=0;
  video.pause=()=>{paused++;};

  // перемикання на інший слайд
  d.querySelector(".lightbox-next, .lightbox-next-mobile")
    ?.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
  check("при перемиканні слайда відео ставиться на паузу", paused>0, paused);

  // закриття
  const before=paused;
  d.querySelector(".lightbox-close")?.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
  check("при закритті теж", paused>before, `${before} → ${paused}`);
}

console.log("\n[4] Iframe перезавантажується (звук не лишається)");
{
  const w=makeLightbox(); const d=w.document;
  const url="https://www.youtube-nocookie.com/embed/XYZ";
  w.openLightbox([{type:"embed",src:url},{type:"image",src:"a.jpg"}],0,{});
  const frame=d.querySelector("iframe");
  let reset=0;
  const orig=frame.setAttribute.bind(frame);
  frame.setAttribute=(n,v)=>{ if(n==="src") reset++; orig(n,v); };
  d.querySelector(".lightbox-close")?.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
  check("src iframe перевстановлено", reset>0, reset);
}

console.log("\n[5] Сторінка товару віддає всі слайди");
{
  const js=fs.readFileSync(path.join(ROOT,"assets/js/product.js"),"utf8");
  check("відео більше не відкидається перед лайтбоксом",
        !js.includes('if (activeSlide && activeSlide.tagName !== "IMG") return;'));
  check("VIDEO мапиться у слайд", js.includes('type: "video"'));
  check("embed мапиться у слайд", js.includes('type: "embed"'));
  // Раніше тут перевірялось одне closest("video, iframe") — обидва
  // випадки просто виходили з обробника. Тепер вони різні:
  //
  //   відео   смуги керування в галереї більше немає (вона ламала
  //           ряд із фотографіями), тож тап по кадру САМ ставить
  //           на паузу й знімає з неї;
  //   iframe  усередині власний плеєр YouTube/Vimeo — клік його.
  //
  // Спільне лишилось одне: ані те, ані те не відкриває лайтбокс.
  check("тап по відео керує відтворенням, а не відкриває лайтбокс",
        /const video = event\.target\.closest\("video"\);[\s\S]{0,200}toggleGalleryVideo\(video\); return;/.test(js));

  check("тап по iframe віддається його власному плеєру",
        js.includes('event.target.closest("iframe")'));

  check("смуги керування в галереї немає",
        !/class="gallery-slide gallery-slide-video"[\s\S]{0,400}\bcontrols\b/.test(js));

  // Повний екран для відео нікуди не дівся: у лайтбокс заходять
  // тапом по будь-якому фото, а він показує ВСІ слайди, зокрема відео.
  check("відео лишається досяжним через лайтбокс із фото",
        js.includes('type: "video"'));

  // Пауза мусить переживати перемальовку галереї: syncActiveState
  // викликається на кожен скрол треку, і без цієї позначки він
  // перемотав би відео на нуль і запустив знову — тобто паузи ніби
  // й немає.
  check("ручна пауза не збивається скролом",
        /if \(slide\.dataset\.userPaused\) return;/.test(js));

  // Продовження саме з того місця, де зупинили: currentTime у
  // перемикачі не чіпається взагалі.
  const toggle = js.slice(js.indexOf("function toggleGalleryVideo"),
                          js.indexOf("function setupGallery"));

  check("продовжує з того ж місця, а не з початку",
        toggle.length > 0 && !/currentTime/.test(toggle));

  // Рухома картинка без способу її зупинити — це WCAG 2.2.2. Смуги
  // керування немає, тож пауза мусить лишатись доступною з клавіатури.
  check("паузу можна поставити з клавіатури",
        /event\.key !== " " && event\.key !== "Enter"/.test(js)
        && js.includes('role="button"'));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
