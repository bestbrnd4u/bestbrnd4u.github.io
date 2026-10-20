// Dependabot неможливо запустити локально — він працює на боці
// GitHub. Тому перевіряємо те, що можна перевірити тут: коректність
// схеми конфігу і його відповідність РЕАЛЬНОМУ вмісту репозиторію
// (щоб конфіг не стежив за неіснуючою екосистемою і не пропускав
// наявні actions).
const fs=require("fs"),path=require("path"),{execSync}=require("child_process");
const ROOT = require("path").join(__dirname, "..");
const { loadYaml } = require("./helpers/yaml");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const _dep = loadYaml(".github/dependabot.yml");
const _actions = _dep.updates.find(u => u["package-ecosystem"] === "github-actions");
const _npm = _dep.updates.find(u => u["package-ecosystem"] === "npm");
const out = JSON.stringify({
  version: _dep.version,
  count: _dep.updates.length,
  ecosystem: _actions["package-ecosystem"],
  directory: _actions.directory,
  interval: _actions.schedule.interval,
  groups: _actions.groups || null,
  limit: _actions["open-pull-requests-limit"] ?? null,
  prefix: (_actions["commit-message"] || {}).prefix ?? null,
  labels: _actions.labels || null,
  hasNpm: Boolean(_npm),
  npmGroups: _npm ? _npm.groups : null,
  npmLimit: _npm ? _npm["open-pull-requests-limit"] : null
});

const cfg=JSON.parse(out);

console.log("\n[1] Схема конфігу коректна");
{
  check("version: 2 (обов'язково для Dependabot)", cfg.version===2, cfg.version);
  check("екосистема — github-actions", cfg.ecosystem==="github-actions");
  check("directory '/' (саме так Dependabot знаходить .github/workflows)",
        cfg.directory==="/", cfg.directory);
  check("розклад заданий", cfg.interval==="weekly", cfg.interval);
}

console.log("\n[2] Групування: усі апдейти одним PR");
{
  check("блок groups присутній", !!cfg.groups);
  check("група охоплює всі actions (patterns: *)",
        cfg.groups && cfg.groups["github-actions"]?.patterns?.includes("*"),
        JSON.stringify(cfg.groups));
  check("ліміт відкритих PR заданий", typeof cfg.limit==="number", cfg.limit);
}

console.log("\n[3] Зручність розбору в списку PR");
{
  check("є префікс комітів", !!cfg.prefix, cfg.prefix);
  check("є мітки", Array.isArray(cfg.labels) && cfg.labels.length>0, JSON.stringify(cfg.labels));
}

console.log("\n[4] Конфіг відповідає реальному репозиторію");
{
  // Раніше тут перевірялось, що package.json НЕМАЄ — і тому
  // npm-блок не потрібен. Тепер package.json з'явився (jsdom і
  // js-yaml для тестів), тож правило перевернулось: npm-блок став
  // обов'язковим. Саме ця перевірка й спіймала зміну — конфіг
  // мусить відповідати реальному вмісту репозиторію, а не
  // припущенням про нього.
  const hasPackageJson = fs.existsSync(path.join(ROOT, "package.json"));
  check("package.json існує (з'явився разом із тестами)", hasPackageJson);
  check("→ отже, npm-екосистема в конфізі обов'язкова", cfg.hasNpm, cfg.hasNpm);
  check("обидві екосистеми присутні", cfg.count === 2, cfg.count);

  // npm-залежності теж згруповані в один PR
  check("npm-оновлення теж одним PR",
        cfg.npmGroups && cfg.npmGroups["dev-dependencies"]?.patterns?.includes("*"),
        JSON.stringify(cfg.npmGroups));
  check("ліміт PR для npm заданий", typeof cfg.npmLimit === "number", cfg.npmLimit);

  // ЖОДЕН ПАКЕТ НЕ ДОЇЖДЖАЄ ДО ВІДВІДУВАЧА.
  //
  // Тут стояло `!pkg.dependencies` — «секції dependencies не мусить
  // бути взагалі». Намір був правильний: нічого з node_modules не має
  // потрапляти в браузер. Але форма виявилась завузькою, щойно
  // зʼявилась залежність, потрібна САМІЙ ВИЛИВЦІ: terser знімає
  // коментарі зі скриптів у scripts/strip-comments.js, тобто працює
  // на збірці й на сайт не їде (20.10.2026).
  //
  // Тому питаємо не «чи є секція», а те, що справді важливо:
  //   • node_modules у переліку винятків збирача — не публікується;
  //   • жоден скрипт фронтенду не тягне пакет.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  check("залежності взагалі є (інакше нема про що говорити)",
        Object.keys(pkg.dependencies || {}).length
        + Object.keys(pkg.devDependencies || {}).length > 0);

  const збирач = fs.readFileSync(path.join(ROOT, "scripts/collect-site.js"), "utf8");

  check("node_modules не публікується", /"node_modules"/.test(збирач));

  const фронт = fs.readdirSync(path.join(ROOT, "assets/js"))
    .filter(f => f.endsWith(".js"));

  const зПакетом = фронт.filter(f => {
    const код = fs.readFileSync(path.join(ROOT, "assets/js", f), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    // require("щось") і import … from "щось", де «щось» не починається
    // з крапки чи слеша — тобто саме пакет, а не сусідній файл.
    return /require\(\s*["'][a-z@]/.test(код)
      || /from\s+["'][a-z@]/.test(код);
  });

  check(`жоден скрипт фронтенду не тягне пакет (${фронт.length} файлів)`,
        зПакетом.length === 0, зПакетом.slice(0, 3).join(", "));

  // усі actions, що реально використовуються, підпадають під patterns:*
  const wfDir = path.join(ROOT, ".github/workflows");
  const uses = fs.readdirSync(wfDir)
    .flatMap(f => [...fs.readFileSync(path.join(wfDir, f), "utf8")
      .matchAll(/uses:\s*([\w-]+\/[\w-]+)@/g)].map(m => m[1]));
  const distinct = [...new Set(uses)];
  check("у workflow знайдено actions", distinct.length > 0, distinct.join(", "));
  check("їх більше за 1 — групування справді має сенс",
        distinct.length > 1, `${distinct.length} шт.`);
}

console.log("\n[lock] package.json і package-lock.json не розходяться");
{
  // РЕГРЕСІЯ, ЯКА ПОКЛАЛА CI
  //
  // Пакет поставили з --no-save, а в package.json дописали руками. У
  // локі його не з'явилось — і `npm ci` впав:
  //
  //   npm error `npm ci` can only install packages when your
  //   package.json and package-lock.json are in sync.
  //   npm error Missing: onnxruntime-node@1.29.0 from lock file
  //
  // Локально нічого не падає: там уже стоїть `npm install`, який
  // розбіжність мовчки лікує. Видно її тільки в CI, на чистій установці.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));

  const root = (lock.packages && lock.packages[""]) || {};

  const wanted = pkg.devDependencies || {};
  const mirrored = root.devDependencies || {};

  const розійшлись = Object.keys(wanted)
    .filter(name => mirrored[name] !== wanted[name])
    .map(name => `${name}: package.json ${wanted[name]}, лок ${mirrored[name] || "немає"}`);

  check("діапазони версій у локі ті самі, що в package.json",
        розійшлись.length === 0, розійшлись.join("; "));

  const безЗапису = Object.keys(wanted)
    .filter(name => !lock.packages[`node_modules/${name}`]);

  check("кожна залежність має запис у локі",
        безЗапису.length === 0, безЗапису.join(", "));
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
