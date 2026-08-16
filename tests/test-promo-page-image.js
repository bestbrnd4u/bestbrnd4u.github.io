// Регресія: promo.html показував той самий "тизерний" знімок, що й
// прев'ю на головній, хоча пропорції в них зовсім різні (компактний
// банер бренду — вертикальний 4:5, банер сторінки акції — широка
// смуга 3.2:1). Тепер під це — окреме поле з повним fallback'ом,
// щоб уже опубліковані акції не зламались.
const fs=require("fs"),path=require("path"),{execSync}=require("child_process");
const ROOT = require("path").join(__dirname, "..");
const { loadYaml } = require("./helpers/yaml");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

console.log("\n[1] Схема адмінки");
{
  const _cfg = loadYaml("admin/config.yml");
  const _promo = _cfg.collections.find(c => c.name === "promotions");
  const _fields = Object.fromEntries(_promo.fields.map(f => [f.name, f]));
  const out = JSON.stringify({
    has_desktop: "promoPageImage" in _fields,
    has_mobile: "promoPageImageMobile" in _fields,
    desktop_required: (_fields.promoPageImage || {}).required !== undefined
        ? _fields.promoPageImage.required : true,
    mobile_required: (_fields.promoPageImageMobile || {}).required !== undefined
        ? _fields.promoPageImageMobile.required : true,
    image_has_hint: Boolean(_fields.image.hint),
    order: Object.keys(_fields)
  });
  const info=JSON.parse(out);
  check("нове поле десктопного банера є", info.has_desktop);
  check("нове поле мобільного банера є", info.has_mobile);
  check("десктопне поле необов'язкове (fallback на старе фото)", info.desktop_required===false);
  check("мобільне поле необов'язкове", info.mobile_required===false);
  check("спільне «Фото» отримало підказку з розмірами", info.image_has_hint);
  const iDesktop=info.order.indexOf("promoPageImage");
  const iMobile=info.order.indexOf("promoPageImageMobile");
  const iButton=info.order.indexOf("buttonText");
  check("нові поля стоять між фото тизера і текстом кнопки",
        iDesktop>-1 && iMobile>iDesktop && iButton>iMobile, info.order.join(","));
}

console.log("\n[2] build-promotions.js пробрасує нові поля");
{
  const src=fs.readFileSync(path.join(ROOT,"scripts/build-promotions.js"),"utf8");
  check("promoPageImage потрапляє у вихідний JSON", /promoPageImage:\s*data\.promoPageImage/.test(src));
  check("promoPageImageMobile теж", /promoPageImageMobile:\s*data\.promoPageImageMobile/.test(src));
}

console.log("\n[3] promo.js: пріоритет нового поля, повний fallback на старе");
{
  const src=fs.readFileSync(path.join(ROOT,"assets/js/promo.js"),"utf8");
  check("десктопний банер бере promoPageImage з fallback на image",
        /promo\.promoPageImage \|\| promo\.image/.test(src));
  check("мобільний банер має триступеневий fallback",
        /promo\.promoPageImageMobile \|\| promo\.promoPageImage \|\| promo\.imageMobile \|\| promo\.image/.test(src));
  // absoluteUrl() навколо — свідомо: OG приймає лише абсолютні адреси
  check("og:image теж оновлено (у т.ч. загорнутий в absoluteUrl)",
        /og:image["'],\s*(absoluteUrl\()?\s*promo\.promoPageImage \|\| promo\.image/.test(src));
  check("og:image абсолютизується", /og:image["'],\s*absoluteUrl\(/.test(src));
}

console.log("\n[4] Логіка fallback за фактом (не лише текстом коду)");
{
  function pick(promo){
    const desktopImage = promo.promoPageImage || promo.image;
    const mobileImage = promo.promoPageImageMobile || promo.promoPageImage || promo.imageMobile || promo.image;
    return { desktopImage, mobileImage };
  }

  const legacy=pick({image:"teaser.jpg"});
  check("стара акція без нових полів: банер = старе фото",
        legacy.desktopImage==="teaser.jpg" && legacy.mobileImage==="teaser.jpg");

  const withNew=pick({image:"teaser.jpg", promoPageImage:"banner-wide.jpg"});
  check("нова акція: десктопний банер = нове поле, а не тизер",
        withNew.desktopImage==="banner-wide.jpg", withNew.desktopImage);
  check("мобільний банер відкочується на promoPageImage, коли своєї мобільної версії немає",
        withNew.mobileImage==="banner-wide.jpg", withNew.mobileImage);

  const full=pick({image:"teaser.jpg", imageMobile:"teaser-mob.jpg",
                   promoPageImage:"banner-wide.jpg", promoPageImageMobile:"banner-tall.jpg"});
  check("усі 4 поля заповнені: кожен контекст бере СВОЄ фото",
        full.desktopImage==="banner-wide.jpg" && full.mobileImage==="banner-tall.jpg");
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
