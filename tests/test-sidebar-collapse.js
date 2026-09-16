const fs=require("fs"),path=require("path"),{JSDOM}=require("jsdom");
const ROOT = require("path").join(__dirname, "..");
const dom=new JSDOM(fs.readFileSync(path.join(ROOT,"catalog.html"),"utf8"),
  {runScripts:"outside-only",pretendToBeVisual:true,url:"https://x.test/catalog"});
const {window}=dom;
global.window=window; global.document=window.document;
window.CATALOG_SKIP_AUTO_INIT=true;
window.createProductCard=p=>`<div class="product-card">${p.title}</div>`;
window.initProductCarousels=()=>{};window.updateFavoriteButtons=()=>{};
window.renderRecentlyViewed=()=>{};window.scrollTo=()=>{};
window.matchMedia=window.matchMedia||(()=>({matches:false,addEventListener(){},addListener(){}}));
window.fetch=()=>Promise.resolve({ok:false});
window.requestAnimationFrame=cb=>cb();
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function escapeHtml[\s\S]*?\n}\n/)[0]);
// plural()/pluralProducts() теж у common.js: на сайті файл
// підключений повністю, у тесті додаємо явно — без них лічильник
// товарів у catalog.js падає з ReferenceError.
window.eval(fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8").match(/function plural\(count[\s\S]*?\n}\n/)[0]);
window.eval(fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8").match(/function pluralProducts[\s\S]*?\n}\n/)[0]);
// availableFacets() використовує getProductColors з common.js —
// на сайті цей файл підключений повністю, у тесті підвантажуємо явно
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getProductColors[\s\S]*?\n}\n/)[0]);
// сім'ї кольорів — фільтр «Колір» працює ними (див. хелпер)
require(require("path").join(__dirname,"helpers/color-families")).installColorFamilies(window);
// getVariantSizes/getAllProductSizes теж живуть у common.js —
// на сайті файл підключений повністю, у тесті додаємо явно
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getVariantSizes[\s\S]*?\n}\n/)[0]);
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getAllProductSizes[\s\S]*?\n}\n/)[0]);
// catalog.js тепер стартує з FALLBACK_SIZE_GROUPS з common.js
// (групи розмірів приходять з адмінки), плюс хелпери груп
const _cs = fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
// const з окремого window.eval не видно наступним викликам
// (jsdom не ділить прив'язання) — привласнюємо прямо у window
window.eval("window.FALLBACK_SIZE_GROUPS = " +
    _cs.match(/const FALLBACK_SIZE_GROUPS = (\[[\s\S]*?\n\]);\n/)[1] + ";");
// Ціна дня: ціну рахує common.js, а малюють її ui.js і catalog.js.
window.eval(_cs.match(/function saleActive[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function priceNow[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function oldPriceNow[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function discountPercent[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function resolveGroupCategories[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function findSizeGroupForCategory[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function getProductGenders[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function getProductGenderLabel[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/let sizeGroupsPromise[\s\S]*?\n}\n/)[0]);
let code=fs.readFileSync(path.join(ROOT,"assets/js/catalog.js"),"utf8");
code+=`
window.__t={ setProducts(l){products=l;}, fillCatalogSidebar:d=>fillCatalogSidebar(d),
  toggleCategory:n=>toggleCategory(n), get selectedCategories(){return selectedCategories;},
  get selectedBrands(){return selectedBrands;}, refreshSidebarCounts:()=>refreshSidebarCounts(),
  fillBrandStrip:()=>fillBrandStrip(), refreshBrandStrip:()=>refreshBrandStrip() };`;
window.eval(code);

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const departments=[
  {title:"Сумки",categories:["Жіночі сумки","Рюкзаки"]},
  {title:"Взуття",categories:["Кросівки"]},
  {title:"Аксесуари",categories:["Годинники"]}
];
const PRODUCTS=[
  {title:"A",price:100,category:"Жіночі сумки",brand:"X",variants:[]},
  {title:"B",price:200,category:"Рюкзаки",brand:"X",variants:[]},
  {title:"C",price:300,category:"Кросівки",brand:"Y",variants:[]},
  {title:"D",price:400,category:"Годинники",brand:"Z",variants:[]}
];

function rebuild(){
  window.__t.setProducts(PRODUCTS.map(p=>({...p})));
  document.getElementById("catalogSidebar").innerHTML="";
  window.__t.fillCatalogSidebar(departments);
  window.render();
}
const group=t=>document.querySelector(`[data-sidebar-group="${t}"]`);
const toggleOf=t=>group(t).querySelector("[data-sidebar-group-toggle]");

console.log("\n[1] Структура: заголовок став кнопкою зі значком");
rebuild();
check("3 групи побудовано", document.querySelectorAll(".sidebar-group").length===3);
check("заголовок — кнопка", toggleOf("Сумки").tagName==="BUTTON");
check("є значок +/−", !!group("Сумки").querySelector(".sidebar-group-icon"));
check("категорії в окремому тілі групи", group("Сумки").querySelectorAll(".sidebar-group-body [data-sidebar-category]").length===2);
check("за замовчуванням ЗГОРНУТО (показує +)", group("Сумки").classList.contains("collapsed"));
check("aria-expanded=false", toggleOf("Сумки").getAttribute("aria-expanded")==="false");
check("усі групи згорнуті", [...document.querySelectorAll(".sidebar-group")].every(g=>g.classList.contains("collapsed")));

console.log("\n[2] Клік розгортає і згортає назад");
toggleOf("Сумки").dispatchEvent(new window.Event("click",{bubbles:true}));
check("група розгорнулась", !group("Сумки").classList.contains("collapsed"));
check("aria-expanded=true", toggleOf("Сумки").getAttribute("aria-expanded")==="true");
check("сусідні групи лишились згорнутими", group("Взуття").classList.contains("collapsed"));
toggleOf("Сумки").dispatchEvent(new window.Event("click",{bubbles:true}));
check("повторний клік згортає", group("Сумки").classList.contains("collapsed"));

console.log("\n[3] Стан переживає перебудову меню");
toggleOf("Взуття").dispatchEvent(new window.Event("click",{bubbles:true}));
check("збережено як розгорнуту",
      JSON.parse(window.localStorage.getItem("bagvero:sidebar-expanded")).includes("Взуття"),
      window.localStorage.getItem("bagvero:sidebar-expanded"));
rebuild();
check("після перебудови «Взуття» лишилось розгорнутим", !group("Взуття").classList.contains("collapsed"));
check("інші лишились згорнутими", group("Сумки").classList.contains("collapsed"));

console.log("\n[4] Група з обраною категорією розгортається примусово");
toggleOf("Взуття").dispatchEvent(new window.Event("click",{bubbles:true})); // згортаємо назад
check("«Взуття» знову згорнуто", group("Взуття").classList.contains("collapsed"));
window.__t.toggleCategory("Кросівки");   // всередині згорнутої групи «Взуття»
check("категорію обрано", window.__t.selectedCategories.has("Кросівки"));
check("група розгорнулась автоматично", !group("Взуття").classList.contains("collapsed"));
check("aria-expanded оновлено", toggleOf("Взуття").getAttribute("aria-expanded")==="true");
rebuild();
check("і після перебудови лишається розгорнутою", !group("Взуття").classList.contains("collapsed"));

console.log("\n[5] Згортання не ламає вибір категорії");
const before=document.getElementById("productsCount").textContent;
toggleOf("Сумки").dispatchEvent(new window.Event("click",{bubbles:true}));
check("кількість товарів не змінилась", document.getElementById("productsCount").textContent===before,
      `${before} → ${document.getElementById("productsCount").textContent}`);
check("фільтр категорії лишився", window.__t.selectedCategories.has("Кросівки"));

console.log("\n[6] Число відділу не розходиться з рештою");
{
    // ЩО БУЛО. refreshSidebarCounts() оновлював «Всі товари» й кожну
    // категорію, а число поруч із назвою відділу лишалось тим, яке
    // намалювали ОДИН РАЗ при завантаженні — по всьому розділу, без
    // жодного фільтра.
    //
    // Виглядало так (заміряно на живому деві,
    // /catalog?section=sale&brand=coach&department=sumky):
    //
    //     Всі товари      10
    //     Сумки           14      ← більше, ніж є в усьому каталозі
    //       Жіночі сумки   9
    //       Чоловічі сумки 1
    //
    // Тобто відділ обіцяв більше, ніж є, і більше, ніж сума власних
    // категорій.
    const departmentCount = title =>
        Number(group(title).querySelector("[data-sidebar-department] .sidebar-count").textContent);

    const childrenSum = title =>
        [...group(title).querySelectorAll("[data-sidebar-category] .sidebar-count")]
            .reduce((sum, el) => sum + Number(el.textContent), 0);

    const allCount = () =>
        Number(document.querySelector("[data-sidebar-all] .sidebar-count").textContent);

    rebuild();

    check("без фільтрів відділ дорівнює сумі своїх категорій",
        departmentCount("Сумки") === childrenSum("Сумки"),
        departmentCount("Сумки") + " проти " + childrenSum("Сумки"));

    // Головне: фільтр, який справді звужує вибірку. Бренд X лишає
    // тільки дві сумки з чотирьох товарів.
    window.__t.selectedBrands.add("X");
    window.__t.refreshSidebarCounts();

    check("після фільтра «Всі товари» звузились", allCount() === 2, allCount());

    check("і відділ звузився разом із категоріями",
        departmentCount("Сумки") === 2 && departmentCount("Сумки") === childrenSum("Сумки"),
        departmentCount("Сумки") + " проти " + childrenSum("Сумки"));

    // Порожній відділ мусить показати нуль, а не старе число.
    check("порожній відділ показує нуль",
        departmentCount("Взуття") === 0 && departmentCount("Аксесуари") === 0,
        departmentCount("Взуття") + " / " + departmentCount("Аксесуари"));

    // Найпростіша перевірка на здоровий глузд: жоден відділ не може
    // бути більшим за весь каталог.
    check("сума відділів дорівнює «Всі товари»",
        ["Сумки", "Взуття", "Аксесуари"].reduce((s, title) => s + departmentCount(title), 0) === allCount());

    window.__t.selectedBrands.delete("X");
}

console.log("\n[7] Смуга брендів — фільтр, а не перелік посилань");
{
    // ЩО БУЛО. Перелік брендів жив лише на /brands/, і кожна назва
    // там вела на ОКРЕМУ сторінку бренду. Обрати два бренди одразу
    // було нічим: перехід скидав усе, що обрано. А в «Новинках» і
    // «Акціях» переліку не було взагалі.
    const strip = document.getElementById("brandStrip");

    const chips = () => [...document.querySelectorAll("[data-brand-chip]")];

    const chip = name => chips().find(c => c.dataset.brandChip === name);

    // Попередні розділи лишили обрану категорію — з нею база для
    // перерахунку звузилась би, і числа в плашках були б не про те.
    window.__t.selectedCategories.clear();

    rebuild();
    window.__t.fillBrandStrip();

    check("смуга є в розмітці каталогу", Boolean(strip));

    check("плашки намальовані з товарів", chips().length === 3,
        chips().map(c => c.dataset.brandChip).join(", "));

    // Без цієї перевірки наступні рядки падають СТЕКОМ замість чесного
    // ✗, і з журналу не видно, що саме зламалось.
    if (!chip("X")) {

        check("плашки є, далі перевіряти нічого", false, "смуга порожня");

    } else {

    check("і видно, скільки чого",
        chip("X").querySelector(".brand-chip-count").textContent === "2");

    // ГОЛОВНЕ: клік фільтрує, а не веде на іншу сторінку.
    window.__t.refreshBrandStrip();

    chip("X").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    check("клік поклав бренд у фільтр", window.__t.selectedBrands.has("X"));

    check("смуга лишилась на місці", chips().length === 3);

    check("обраний бренд видно", chip("X").classList.contains("active"));

    // Другий бренд додається, а не замінює перший — заради цього все
    // й робилось.
    chip("Y").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    check("другий бренд додається до першого",
        window.__t.selectedBrands.has("X") && window.__t.selectedBrands.has("Y"),
        [...window.__t.selectedBrands].join(", "));

    // І знімається тим самим кліком.
    chip("X").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    check("повторний клік знімає бренд",
        !window.__t.selectedBrands.has("X") && window.__t.selectedBrands.has("Y"),
        [...window.__t.selectedBrands].join(", "));

    check("і плашка гасне", !chip("X").classList.contains("active"));

    // ПОСИЛАННЯ ЛИШАЄТЬСЯ СПРАВЖНІМ. Хаб брендів — головне джерело
    // внутрішніх посилань на сторінки брендів; прибрати href означало
    // б лишити їх досяжними хіба що з sitemap.
    check("плашка лишається посиланням на сторінку бренду",
        chip("Y").getAttribute("href").startsWith("/brands/"),
        chip("Y").getAttribute("href"));

    // Ctrl+клік — людина свідомо відкриває в новій вкладці.
    const before = new Set(window.__t.selectedBrands);

    const ctrl = new window.MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });

    chip("X").dispatchEvent(ctrl);

    check("Ctrl+клік не чіпає фільтр",
        window.__t.selectedBrands.size === before.size && !ctrl.defaultPrevented);

    }

    window.__t.selectedBrands.clear();

    // СМУГУ МУСИТЬ ХТОСЬ МАЛЮВАТИ Й ОНОВЛЮВАТИ.
    //
    // Перевірки вище кличуть обидві функції руками — прибери виклик зі
    // сторінки, і вони й далі зелені, а смуги на сайті немає. Тому
    // окремо звіряємо, що виклики стоять поруч із бічним меню й
    // перерахунком фасетів.
    const catalogJs = fs.readFileSync(path.join(ROOT, "assets/js/catalog.js"), "utf8");

    check("смуга малюється разом із бічним меню",
        catalogJs.includes("fillCatalogSidebar(categoryDepartments);\n        fillBrandStrip();"));

    check("і оновлюється разом із рештою фасетів",
        catalogJs.includes("refreshSidebarCounts();\n        refreshBrandStrip();"));
}

console.log("\n[8] Дві смуги поруч не малюємо");
{
    // На /brands/ перелік уже лежить у розмітці — його пише
    // build-taxonomy-pages.js, і там справжні посилання для пошукових
    // роботів. Друга така сама смуга поруч була б просто дублем.
    // Контейнера може не бути — тоді далі перевіряти нема чого, але
    // падати стеком теж не можна: з журналу не видно, що зламалось.
    const box = document.getElementById("brandStrip");

    check("контейнер смуги на місці", Boolean(box));

    if (box) {

    box.hidden = true;
    box.innerHTML = "";

    const hub = document.createElement("nav");

    hub.className = "taxonomy-hub";
    hub.innerHTML = '<ul class="taxonomy-hub-list"><li>'
        + '<a href="/brands/x/" data-brand-chip="X">X</a>'
        + '<span class="taxonomy-count">99</span></li></ul>';

    document.body.appendChild(hub);

    window.__t.fillBrandStrip();

    check("свою смугу не малюємо, якщо хаб уже є",
        document.getElementById("brandStrip").hidden === true
        && document.getElementById("brandStrip").children.length === 0);

    // Але число в хабі оновлюємо: воно згенероване без жодного
    // фільтра й після вибору бренду обіцяло б неправду.
    window.__t.refreshBrandStrip();

    check("число в хабі оновлюється",
        hub.querySelector(".taxonomy-count").textContent === "2",
        hub.querySelector(".taxonomy-count").textContent);

    // І клік по ньому теж фільтрує, а не веде на сторінку бренду.
    hub.querySelector("[data-brand-chip]")
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    check("клік у хабі теж фільтрує", window.__t.selectedBrands.has("X"));

    hub.remove();
    window.__t.selectedBrands.clear();
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
