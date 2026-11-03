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
  // ВЕРСІЮ ШУКАЄМО В ОБОХ ВИГЛЯДАХ.
  //
  // Доти бралася лише адреса CDN («@supabase/supabase-js@2.112.3»).
  // 03.11.2026 бібліотеки переїхали до себе, і версія тепер в імені
  // файлу: /assets/js/vendor/supabase-js-2.112.3.js.
  //
  // Перевірка лишається про те саме — «одна й та сама версія на всіх
  // сторінках», — просто вигляд посилання більше не визначає, чи
  // вона її побачить.
  const versions = new Map();

  files.forEach(f => {

    const src = read(f);

    [...src.matchAll(/(@[\w@/.-]+?)@(\d+\.\d+\.\d+)/g)].forEach(m => додати(m[1], m[2]));

    [...src.matchAll(/\/assets\/js\/vendor\/([\w.-]+?)-(\d+\.\d+\.\d+)\.js/g)]
      .forEach(m => додати(m[1], m[2]));

    function додати(lib, v) {
      if (!versions.has(lib)) versions.set(lib, new Map());
      const byV = versions.get(lib);
      byV.set(v, (byV.get(v) || 0) + 1);
    }

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

  // Правило, а не число: бібліотека мусить бути на КОЖНІЙ сторінці
  // сайту. Так перевірка ловить те, заради чого існує (нову сторінку
  // зробили копіюванням, а підключення не доїхало) і не падає щоразу,
  // коли сторінок стає більше.
  //
  // Адмінка сюди не входить: у неї свій набір скриптів.
  const site = files.filter(f => !f.startsWith("admin/"));

  const without = site.filter(f => !pages.includes(f));

  check(`підключений на всіх ${site.length} сторінках сайту`,
        without.length === 0, without.join(", "));

  const unpinned = pages.filter(f => /supabase-js@2["'/]/.test(read(f)));
  check("немає жодного @2 без уточнення", unpinned.length === 0, unpinned.join(", "));

  // Точна версія — в адресі CDN або в імені свого файлу.
  const pinned = pages.filter(f => /supabase-js[@-]\d+\.\d+\.\d+/.test(read(f)));
  check("закріплений на всіх сторінках", pinned.length === pages.length,
        `${pinned.length} з ${pages.length}`);

  // І ГОЛОВНЕ, ЗАРАДИ ЧОГО ПЕРЕЇЗД.
  //
  // Точна версія в адресі CDN — це обіцянка CDN, а не факт. Заміряно
  // 03.11.2026: те, що jsdelivr віддає за @2.112.3, не збігається
  // байт-у-байт із пакетом тієї ж версії (207,2 проти 206,9 КБ).
  // Тобто артефакт там свій, і ніщо не заважає йому змінитись — а
  // одне таке мовчазне оновлення вже коштувало подвоєння кошика.
  const зCdn = pages.filter(f => /jsdelivr|unpkg/.test(read(f)));

  check("бібліотека своя, а не з чужого CDN", зCdn.length === 0,
        зCdn.join(", "));
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
    // ЩО ПРО DEPENDABOT СКАЗАНО — ЗМІНИЛОСЬ ПО СУТІ.
    //
    // Доти перевірялось, що в документі написано «Dependabot їх не
    // бачить»: бібліотеки були прямими посиланнями в HTML.
    //
    // 03.11.2026 supabase-js і @emailjs/browser переїхали до себе й
    // стали залежностями npm — тепер він їх БАЧИТЬ, і це була окрема
    // вигода переїзду. А три адмінські лишились на CDN, тож документ
    // мусить розрізняти ці два випадки.
    check("у документі сказано, що свої бібліотеки Dependabot бачить",
          /Dependabot/i.test(doc) && /бачить/i.test(doc));

    check("і що адмінські він і далі не бачить",
          /адмінськ[^\n]*не бачить|не бачить[^\n]*адмінськ/i.test(doc));

    check("сказано, що після оновлення потрібен npm run vendor",
          /npm run vendor/.test(doc));

    // версії в документі мусять збігатися з реальними
    const supabaseInCode = read("index.html").match(/supabase-js[@-](\d+\.\d+\.\d+)/)[1];
    check(`версія supabase-js у документі збігається з кодом (${supabaseInCode})`,
          doc.includes(supabaseInCode), supabaseInCode);
  }
}

console.log("\n[5] Свої копії не розходяться з пакетами");
{
  // ЩО ЦЕ ЗАКРИВАЄ
  // ---------------
  // Версія стоїть у трьох місцях: package.json (що ставить npm),
  // ім'я файлу в assets/js/vendor і адреса в тегу на 173 сторінках.
  // Розійдуться — сторінка попросить файл, якого немає, і магазин
  // лишиться без клієнта Supabase.
  //
  // Найімовірніший шлях до цього: Dependabot оновив package.json, PR
  // злили, а `npm run vendor` не виконали.
  const vendor = require("../scripts/vendor-libs.js");

  const ТЕКА = path.join(ROOT, "assets", "js", "vendor");

  check("тека своїх бібліотек є", fs.existsSync(ТЕКА));

  const наДиску = fs.existsSync(ТЕКА)
    ? fs.readdirSync(ТЕКА).filter(f => f.endsWith(".js")) : [];

  check(`файлів у vendor: ${наДиску.length}`, наДиску.length === vendor.БІБЛІОТЕКИ.length,
        наДиску.join(", "));

  vendor.БІБЛІОТЕКИ.forEach(({ пакет, звідки, імʼя }) => {

    const версія = vendor.версіяПакета(пакет);
    const файл = імʼя(версія);

    check(`${пакет}@${версія} лежить у vendor`,
          fs.existsSync(path.join(ТЕКА, файл)), файл);

    // Байт-у-байт із пакетом: саме цим своя копія й відрізняється
    // від обіцянки CDN.
    const джерело = path.join(ROOT, "node_modules", пакет, звідки);

    if (fs.existsSync(джерело) && fs.existsSync(path.join(ТЕКА, файл))) {
      check(`${пакет}: копія збігається з пакетом байт-у-байт`,
            fs.readFileSync(джерело).equals(fs.readFileSync(path.join(ТЕКА, файл))));
    }

    // І сторінки просять саме цей файл.
    const просять = files.filter(f => read(f).includes(`/assets/js/vendor/${файл}`));

    check(`${пакет}: сторінки просять саме цю версію (${просять.length})`,
          просять.length > 0);

  });

  // КРОК НЕ В npm run build — збірка не сміє залежати від того, чи
  // поставлені devDependencies.
  check("vendor-libs не стоїть у npm run build",
        !/vendor-libs\.js/.test(JSON.parse(read("package.json")).scripts.build || ""));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
