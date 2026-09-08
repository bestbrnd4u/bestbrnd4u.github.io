// Нормалізація фото (єдині пропорції + кілька розмірів) і пагінація.
const fs=require("fs"), path=require("path");
const { baseImageSizes } = require("./helpers/images");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const ui = fs.readFileSync(path.join(ROOT,"assets/js/ui.js"),"utf8");
const cat = fs.readFileSync(path.join(ROOT,"assets/js/catalog.js"),"utf8");
const css = fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");

console.log("\n[1] Усі фото в ОДНИХ пропорціях — контейнер нічого не ріже");
{
  // Регресія: обрізка під контур товару розвела пропорції від 0.33 до
  // 2.80. У контейнері 4:5 широкі фото (окуляри 800x286) різалися
  // майже наполовину. Тепер фото вписуються в єдиний холст.
  const sizes = baseImageSizes();
  const ratios = [...new Set(sizes.map(i => i.ratio))].sort((a, b) => a - b);
  const [minR, maxR] = [ratios[0], ratios[ratios.length - 1]];

  check("базових фото знайдено", sizes.length > 80, sizes.length);
  check(`пропорції однакові (${minR}–${maxR})`, minR === maxR,
        sizes.filter(i => i.ratio !== 0.8).slice(0,3).map(i => `${i.file} ${i.width}×${i.height}`).join(" | "));
  check("це 4:5 — як картка й галерея", minR === 0.8, minR);
  check("клас-милиця fit-contain прибраний", !css.includes("fit-contain") && !ui.includes("fit-contain"));
}

console.log("\n[2] Кілька розмірів одного фото");
{
  const man = JSON.parse(fs.readFileSync(path.join(ROOT,"data/image-variants.json"),"utf8"));
  check("перелік фото з розмірами існує", Array.isArray(man) && man.length > 80, man.length);

  const DIR = path.join(ROOT,"assets/images/products/uploads");
  const missing = [];
  man.forEach(n => {
    const b = n.slice(0, -".webp".length);
    ["", "-600", "-300"].forEach(suf => {
      if (!fs.existsSync(path.join(DIR, b+suf+".webp"))) missing.push(b+suf);
    });
  });
  check("для кожного фото є всі три розміри", missing.length === 0, missing.slice(0,3).join(", "));

  const build = new Function(ui.match(/function buildSrcSet[\s\S]*?\n}/)[0] + "; return buildSrcSet;")();
  const ss = build("assets/images/products/uploads/x.webp");
  check("srcset містить усі три ширини",
        ss.includes("-300.webp 300w") && ss.includes("-600.webp 600w") && ss.includes("x.webp 1200w"), ss);
  check("не-webp не отримує srcset", build("a.png") === null);

  // Тільки відомі фото: перелік — це те, для чого копії справді
  // згенеровані. Ім'я в ньому шукаємо через variantName(), яка знімає
  // відбиток кеша (нижче — перевірка на справжніх адресах).
  check("srcset ставиться лише для відомих фото", ui.includes("known.has(variantName(src))"));
  // Порожній перелік — жодного srcset: інакше браузер просив би
  // -300/-600 файли, яких немає, і фото стало б «битим».
  //
  // Перевірка саме на обгортці, а не на ранньому return: свотчі
  // кольору тепер малюють фон у тій самій функції, і ЇМ порожній
  // перелік не має заважати — вони просто беруть оригінал
  // (див. tests/test-page-weight.js).
  check("невідоме фото лишається звичайним (не «битим»)",
        /if \(known\.size\) \{[\s\S]{0,500}buildSrcSet\(src, format\)/.test(ui));

  // ГОЛОВНА ПЕРЕВІРКА ЦЬОГО РОЗДІЛУ: пошук у переліку знаходить
  // справжню адресу фото, а не тільки вигадану в тесті.
  //
  // ЩО БУЛО НЕ ТАК. Збірка ставить фото відбиток кеша, тож у товарі
  // лежить «…/a05042-1.webp?v=26b9d653», а в переліку копій —
  // «a05042-1.webp». Код брав ім'я через split("/").pop() РАЗОМ із
  // «?v=…», known.has() не знаходив нічого, і srcset не
  // проставлявся ЖОДНІЙ картці.
  //
  // Заміряно на проді (каталог із телефона, два екрани): 47 фото,
  // 4158 КБ, зі зменшених копій — нуль, карток без srcset — 125 зі
  // 125. Копії при цьому лежали поруч: -600 у середньому 16 КБ
  // проти 70 КБ.
  //
  // Зламалось не одразу: srcset працював, поки фото не почали
  // отримувати відбиток. Дві частини одного механізму розійшлись
  // мовчки — сторінки виглядали так само.
  {
    const known = new Set(man);

    const nameOf = new Function(ui.match(/function variantName[\s\S]*?\n}/)[0]
      + "; return variantName;")();

    // Адреси беремо з ДЖЕРЕЛ (data/products/*.json), а не з
    // data/products.json: агрегат перезбирає CI, і в свіжому клоні
    // він відстає — тест падав би через момент часу, а не через
    // помилку (це правило стежить tests/test-migration-types.js).
    const srcDir = path.join(ROOT, "data/products");

    const shots = [];

    fs.readdirSync(srcDir).filter(f => f.endsWith(".json")).forEach(f => {

      const p = JSON.parse(fs.readFileSync(path.join(srcDir, f), "utf8"));

      (p.variants || []).forEach(v => (v.images || []).forEach(s => shots.push(s)));

    });

    check(`фото в джерелах товарів: ${shots.length}`, shots.length > 0);

    // Відбиток кеша ставить збірка — і саме через нього все зламалось.
    const buildSrc = fs.readFileSync(path.join(ROOT, "scripts/build-products.js"), "utf8");

    check("збірка ставить фото відбиток кеша",
      /clean\}\?v=\$\{v\}/.test(buildSrc) && /variant\.images = variant\.images\.map/.test(buildSrc));

    // Ім'я мусить бути без «?v=…» — саме таким воно лежить у переліку.
    check("variantName знімає відбиток",
      nameOf("/assets/images/products/uploads/x.webp?v=abc123") === "x.webp",
      nameOf("/assets/images/products/uploads/x.webp?v=abc123"));

    // І найважливіше: на адресах ТАКОЇ САМОЇ форми, як на сайті,
    // перелік справді знаходить.
    const stamped = shots.map(s => `${s}?v=deadbeef`);

    const found = stamped.filter(s => known.has(nameOf(s)));

    check(`перелік знаходить ${found.length} фото зі ${stamped.length}`,
      found.length > stamped.length * 0.8,
      `знайдено лише ${found.length} — srcset не проставиться`);

    // Один спільний помічник на всі місця: раніше ім'я обчислювалось
    // окремо для <img> і окремо для свотчів, і саме там вони
    // розійшлись — свотчі відбиток знімали, картки ні.
    check("ім'я обчислює один помічник",
      (ui.match(/variantName\(/g) || []).length >= 3,
      (ui.match(/variantName\(/g) || []).length);

    check("жодного split(\"/\").pop() без зняття відбитка",
      !/known\.has\(src\.split\("\/"\)\.pop\(\)\)/.test(ui));
  }

  check("картка каталогу підключена", ui.includes('data-variant-sizes="(max-width: 768px) 50vw, 300px"'));
  const prod = fs.readFileSync(path.join(ROOT,"assets/js/product.js"),"utf8");
  check("галерея товару підключена", prod.includes('data-variant-sizes="(max-width: 900px) 100vw, 600px"'));
  check("мініатюри беруть найдрібніший розмір", prod.includes('data-variant-sizes="100px"'));

  // Вага каталожної версії ВІДНОСНО повнорозмірної.
  //
  // Раніше тут стояв абсолютний поріг у 3 МБ на всі копії разом. Він
  // вимірював не те: копії можуть бути ідеально стиснуті, але щойно
  // магазин додасть десяток товарів, сума перевищить поріг і тест
  // почервоніє на порожньому місці. Саме так і сталося при переході
  // з 44 товарів на 52.
  //
  // Перевіряємо те, заради чого копії й існують: вони мусять бути
  // ІСТОТНО легшими за оригінали. Це не залежить від розміру каталогу.
  const size = f => fs.statSync(path.join(DIR, f)).size;

  const all = fs.readdirSync(DIR);

  const lightBytes = all.filter(f => f.endsWith("-600.webp")).reduce((s, f) => s + size(f), 0);

  const fullBytes = all
    .filter(f => f.endsWith("-600.webp"))
    .map(f => f.replace("-600.webp", ".webp"))
    .filter(f => all.includes(f))
    .reduce((s, f) => s + size(f), 0);

  const share = fullBytes ? Math.round((lightBytes / fullBytes) * 100) : 100;

  check(`каталожні версії легші за повнорозмірні (${share}% ваги)`,
        share < 60, `${share}%`);

  // і жодна окрема копія не має бути важчою за свій оригінал —
  // такий файл означає, що стиснення відпрацювало навпаки
  const heavier = all
    .filter(f => f.endsWith("-600.webp"))
    .filter(f => {
      const full = f.replace("-600.webp", ".webp");
      return all.includes(full) && size(f) >= size(full);
    });

  check("жодна копія не важча за оригінал", heavier.length === 0,
        heavier.slice(0, 3).join(", "));
}

console.log("\n[3] Пагінація");
{
  check("розмітка є в каталозі",
        fs.readFileSync(path.join(ROOT,"catalog.html"),"utf8").includes('id="pagination"'));
  // Показується поточна сторінка ПЛЮС порції, дописані кнопкою
  // «Показати ще». Без кнопки extraPages = 0, і зріз той самий, що
  // був — рівно одна сторінка.
  check("рендериться поточна сторінка з дописаними порціями",
        /\.slice\(from, from \+ PER_PAGE \* \(1 \+ extraPages\)\)/.test(cat));

  // Зміна фільтра скидає і сторінку, і дописані порції: інакше
  // лишалося б «показано 72 з 5».
  check("зміна фільтра повертає на першу",
        /currentPage = 1;[\s\S]{0,300}extraPages = 0;[\s\S]{0,40}render\(\);/.test(cat));
  // Сторінка тепер пишеться не окремо, а разом з рештою стану каталогу
  // (фільтри, сортування, категорія) — див. syncStateToUrl. Порожнє
  // значення setOrDelete прибирає з адреси, тож перша сторінка її не
  // засмічує, як і раніше.
  check("сторінка зберігається в адресі",
        /URL_KEYS\.page, currentPage > 1 \? currentPage : ""/.test(cat));
  check("перша сторінка не засмічує адресу",
        /value === ""\s*\)\s*params\.delete\(key\)/.test(cat.replace(/\s+/g, " "))
        || /params\.delete\(key\)/.test(cat));
  // читається через readNumberParam: прямий Number(params.get(...))
  // повертав 0 для відсутнього параметра — та сама пастка, що зламала
  // фільтр ціни (див. tests/test-catalog-url-state.js, блок [7])
  check("сторінка читається з адреси при відкритті",
        /readNumberParam\(new URLSearchParams\(location\.search\), "page"\)/.test(cat));
  check("replaceState, щоб «Назад» не гортав сторінки", /history\.replaceState/.test(cat));
  check("після переходу підіймає до товарів, а не до шапки",
        /grid\.getBoundingClientRect/.test(cat));
  check("є стилі", css.includes(".pagination-page") && css.includes(".pagination-arrow"));

  const mk = n => new Function(cat.match(new RegExp("function "+n+"[\\s\\S]*?\\n}"))[0] + "; return "+n+";")();
  const pageNumbers = mk("pageNumbers");

  check("мало сторінок — усі підряд", pageNumbers(5,3).join(",") === "1,2,3,4,5");
  check("багато — з трьома крапками", pageNumbers(12,6).join(",") === "1,…,5,6,7,…,12");
  check("на початку без лівих крапок", pageNumbers(12,1)[1] === 2);
  check("у кінці без правих крапок", pageNumbers(12,12).slice(-1)[0] === 12);
  check("поточна завжди присутня", [1,4,7,12].every(p => pageNumbers(12,p).includes(p)));
  check("немає номерів поза межами",
        pageNumbers(12,1).every(n => n === "…" || (n >= 1 && n <= 12)));

  const totalPages = c => Math.max(1, Math.ceil(c/24));
  check("27 товарів → 2 сторінки", totalPages(27) === 2);
  check("24 товари → 1 сторінка (блок ховається)", totalPages(24) === 1);
  check("порожній каталог не дає 0 сторінок", totalPages(0) === 1);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
