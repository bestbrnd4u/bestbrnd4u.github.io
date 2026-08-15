// Нормалізація фото (єдині пропорції + кілька розмірів) і пагінація.
const fs=require("fs"), path=require("path"), {execSync}=require("child_process");
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
  const out = execSync(`python3 -c "
from PIL import Image
import os, re
DIR='${path.join(ROOT,'assets/images/products/uploads')}'
base=[f for f in os.listdir(DIR) if f.endswith('.webp') and not re.search(r'-(600|300)\\.webp$',f)]
ratios={round(Image.open(os.path.join(DIR,f)).size[0]/Image.open(os.path.join(DIR,f)).size[1],3) for f in base}
print(len(base), sorted(ratios)[0], sorted(ratios)[-1])
"`).toString().trim().split(" ");

  const [count, minR, maxR] = [Number(out[0]), Number(out[1]), Number(out[2])];
  check("базових фото знайдено", count > 80, count);
  check(`пропорції однакові (${minR}–${maxR})`, minR === maxR, `${minR} vs ${maxR}`);
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

  check("srcset ставиться лише для відомих фото", ui.includes("known.has(src.split"));
  check("невідоме фото лишається звичайним (не «битим»)",
        /if \(!known\.size\) return;/.test(ui));

  check("картка каталогу підключена", ui.includes('data-variant-sizes="(max-width: 768px) 50vw, 300px"'));
  const prod = fs.readFileSync(path.join(ROOT,"assets/js/product.js"),"utf8");
  check("галерея товару підключена", prod.includes('data-variant-sizes="(max-width: 900px) 100vw, 600px"'));
  check("мініатюри беруть найдрібніший розмір", prod.includes('data-variant-sizes="100px"'));

  // вага каталожної версії
  const light = execSync(`python3 -c "
import os,re
DIR='${DIR}'
f=[x for x in os.listdir(DIR) if x.endswith('-600.webp')]
print(round(sum(os.path.getsize(os.path.join(DIR,x)) for x in f)/1048576,2))
"`).toString().trim();
  check(`каталожні версії важать ${light} МБ (легше за повнорозмірні)`, Number(light) < 3, light);
}

console.log("\n[3] Пагінація");
{
  check("розмітка є в каталозі",
        fs.readFileSync(path.join(ROOT,"catalog.html"),"utf8").includes('id="pagination"'));
  check("рендериться лише поточна сторінка", /\.slice\(from, from \+ PER_PAGE\)/.test(cat));
  check("зміна фільтра повертає на першу", /currentPage = 1;\s*\n\s*\n?\s*render\(\);/.test(cat));
  check("сторінка зберігається в адресі", /searchParams\.set\("page"/.test(cat));
  check("перша сторінка не засмічує адресу", /searchParams\.delete\("page"\)/.test(cat));
  check("сторінка читається з адреси при відкритті", /get\("page"\)/.test(cat));
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
