// Версії зовнішніх бібліотек мусять бути закріплені ТОЧНО.
//
// Раніше supabase-js підключався як "@supabase/supabase-js@2" —
// будь-яка версія 2.x. CDN віддавав найсвіжішу, бібліотека
// оновлювалась сама, і одне таке оновлення змінило склад подій
// авторизації: кошик почав подвоюватись при кожному поновленні
// токена (2^17 = 131072 одиниці одного товару).
//
// Діапазон означає, що поведінку сайту неможливо ні відтворити, ні
// відкотити — у репозиторії ж нічого не змінювалось.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const files = [
  ...fs.readdirSync(ROOT).filter(f => f.endsWith(".html")).map(f => f),
  ...fs.readdirSync(path.join(ROOT,"admin")).filter(f => f.endsWith(".html")).map(f => "admin/" + f),
];

const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

console.log("\n[1] Жодної незакріпленої версії");
{
  const loose = [];

  files.forEach(f => {
    const src = read(f);

    // діапазони: @2  @^3.0.0  @~1.2  @latest  @next
    const bad = [...src.matchAll(/(?:jsdelivr\.net\/npm|unpkg\.com)\/([^"']+)/g)]
      .map(m => m[1])
      .filter(url => {
        const m = url.match(/@([^/]+)(?:\/|$)/g);
        if (!m) return true;                       // версії немає взагалі
        const version = m[m.length - 1].replace(/[@/]/g, "");
        // точна версія — рівно три числа
        return !/^\d+\.\d+\.\d+$/.test(version);
      });

    bad.forEach(url => loose.push(`${f}: ${url}`));
  });

  check("усі CDN-посилання з точною версією", loose.length === 0, loose.join("\n      "));
}

console.log("\n[2] Одна й та сама версія на всіх сторінках");
{
  const versions = new Map();

  files.forEach(f => {
    [...read(f).matchAll(/(@[\w@/.-]+?)@(\d+\.\d+\.\d+)/g)].forEach(m => {
      const lib = m[1], v = m[2];
      if (!versions.has(lib)) versions.set(lib, new Map());
      const byV = versions.get(lib);
      byV.set(v, (byV.get(v) || 0) + 1);
    });
  });

  check("бібліотеки знайдені", versions.size > 0, [...versions.keys()].join(", "));

  versions.forEach((byV, lib) => {
    check(`${lib}: одна версія на всьому сайті`, byV.size === 1,
          [...byV.keys()].join(" vs "));
  });
}

console.log("\n[3] supabase-js — найважливіший випадок");
{
  const pages = files.filter(f => read(f).includes("supabase-js"));

  check("підключений там, де й був (14 сторінок)", pages.length === 14, pages.length);

  const unpinned = pages.filter(f => /supabase-js@2["'/]/.test(read(f)));
  check("немає жодного @2 без уточнення", unpinned.length === 0, unpinned.join(", "));

  const pinned = pages.filter(f => /supabase-js@\d+\.\d+\.\d+/.test(read(f)));
  check("закріплений на всіх сторінках", pinned.length === pages.length,
        `${pinned.length} з ${pages.length}`);
}

console.log("\n[4] Рішення задокументоване");
{
  const docPath = path.join(ROOT, "docs/external-libs.md");
  check("є docs/external-libs.md", fs.existsSync(docPath));

  if (fs.existsSync(docPath)) {
    const doc = fs.readFileSync(docPath, "utf8");

    check("пояснено причину закріплення", /131072|подвоюв/i.test(doc));
    check("сказано, що оновлення тепер не приходять самі",
          /не приходять самі/i.test(doc));
    check("є інструкція, що перевіряти після оновлення",
          /Що перевірити руками/i.test(doc));
    check("попереджено, що Dependabot цих бібліотек не бачить",
          /Dependabot/i.test(doc) && /не бачить/i.test(doc));

    // версії в документі мусять збігатися з реальними
    const supabaseInCode = read("index.html").match(/supabase-js@(\d+\.\d+\.\d+)/)[1];
    check(`версія supabase-js у документі збігається з кодом (${supabaseInCode})`,
          doc.includes(supabaseInCode), supabaseInCode);
  }
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
