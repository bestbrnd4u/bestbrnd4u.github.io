// Сторінка «Доступи для колег».
//
// ГОЛОВНЕ, що тут перевіряється: сторінка НЕ вдає, ніби в адмінці є
// власні логіни й паролі. Вхід — через GitHub (backend: github у
// config.yml), власної бази користувачів у Decap немає. Форма
// «додати користувача» нічого б не відкривала, а лише створювала
// хибне враження, що доступ видано.
const fs=require("fs"), path=require("path");
const { JSDOM } = require("jsdom");
const ROOT = require("path").join(__dirname, "..");
const { loadYaml } = require("./helpers/yaml");

let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const page = fs.readFileSync(path.join(ROOT,"admin/access.html"),"utf8");
const index = fs.readFileSync(path.join(ROOT,"admin/index.html"),"utf8");

// Текст сторінки для перевірки формулювань: без теґів і з одиночними
// пробілами. У джерелі речення розбиті переносами рядків і <strong>,
// тож дослівний пошук по HTML хибно не знаходив наявний текст.
const copy = page
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

console.log("\n[1] Спосіб входу справді GitHub — інструкція має відповідати");
{
  const cfg = loadYaml("admin/config.yml");
  check("backend: github", cfg.backend.name === "github", cfg.backend.name);
  check("немає git-gateway (він дав би вхід поштою/паролем)",
        cfg.backend.name !== "git-gateway");
  check("сторінка прямо каже, що вхід через GitHub",
        /вхід в адмінку .{0,20}це вхід через GitHub/i.test(copy),
        copy.slice(copy.indexOf("Вхід"), copy.indexOf("Вхід") + 70));
  check("сторінка попереджає, що окремих логінів і паролів немає",
        /окремих логінів і паролів для адмінки не існує/i.test(copy));
}

console.log("\n[2] Посилання ведуть на ПРАВИЛЬНИЙ репозиторій");
{
  const cfg = loadYaml("admin/config.yml");
  const repo = cfg.backend.repo;

  check("репо зчитано з конфігу", !!repo, repo);
  check(`посилання на доступи вказує на ${repo}`,
        page.includes(`github.com/${repo}/settings/access`),
        (page.match(/github\.com\/[^"]*settings\/access/) || ["—"])[0]);

  // якщо репозиторій колись переїде, посилання не має тихо застаріти
  const wrongRepos = [...page.matchAll(/github\.com\/([\w.-]+\/[\w.-]+)\//g)]
      .map(m => m[1])
      .filter(r => r !== repo && r !== "signup");

  check("немає посилань на чужі репозиторії", wrongRepos.length === 0, wrongRepos.join(", "));
}

console.log("\n[3] Інструкція повна");
{
  check("є крок про реєстрацію на GitHub", page.includes("github.com/signup"));
  check("названо кнопку Add people", page.includes("Add people"));
  // Вибору ролі в особистому репозиторії НЕМАЄ — він є лише в
  // репозиторіях організації. Інструкція мусить це говорити, інакше
  // користувач шукає крок, якого не існує (саме на цьому й спіткнувся).
  check("не обіцяє вибір ролі, якого немає",
        !/роль обираєте/i.test(copy) && !/рекомендована роль/i.test(copy),
        (copy.match(/[^.]*роль[^.]*\./i) || ["—"])[0]);
  check("пояснено, що ролей у особистого репозиторію немає",
        /ролей немає|немає вибору ролей/i.test(copy));
  check("сказано, що запрошення йде відразу",
        /запрошення йде на пошту .{0,20}відразу/i.test(copy));
  check("сказано, що запрошення треба прийняти", /приймає запрошення/i.test(copy));
  check("є адреса адмінки для колеги", page.includes("bestbrnd4u.github.io/admin/"));
  check("описано, як забрати доступ", /Remove/.test(page));
  // Найважливіше попередження: співавтор особистого репозиторію
  // отримує повний доступ, а не «тільки товари».
  check("попереджено про повний доступ співавтора",
        /повний доступ до репозиторію/i.test(copy));
  check("сказано, що обмежити «тільки товарами» неможливо",
        /обмежити .{0,40}тільки товарами.{0,20}технічно неможливо/i.test(copy));
  check("названо шлях для різних рівнів доступу (організація)",
        /організаці/i.test(copy));
}

console.log("\n[4] Варіант з поштою і паролем описаний честно");
{
  check("згадано Netlify Identity + Git Gateway",
        page.includes("Netlify Identity") && page.includes("Git Gateway"));
  check("сказано, що потрібен сайт на Netlify", /сайт на Netlify/i.test(copy));
  check("сказано, що треба міняти backend", page.includes("admin/config.yml"));
  check("попереджено про режим підтримки Netlify Identity",
        /у режим\S* підтримки/i.test(copy));
}

console.log("\n[5] Кнопка в адмінці веде на інструкцію, а не на форму");
{
  check("кнопка додається", index.includes('addLink("accessLink"'));
  check("веде на access.html", /addLink\("accessLink",\s*"access\.html"/.test(index));
  check("немає жодної форми створення користувача",
        !/type=["']password["']/i.test(page) && !/type=["']password["']/i.test(index));
  check("у коді пояснено, чому саме інструкція",
        index.includes("власної бази користувачів у CMS немає"));

  // обидві кнопки мають рендеритись і не накладатись
  const dom = new JSDOM(index, { runScripts: "dangerously" });
  const d = dom.window.document;
  const ids = [...d.querySelectorAll("a[id]")].map(a => a.id);

  check("рендеряться обидві кнопки", ids.includes("bulkImportLink") && ids.includes("accessLink"), ids.join(", "));

  const imp = d.getElementById("bulkImportLink").style;
  const acc = d.getElementById("accessLink").style;
  check("кнопки не в одній точці (не перекривають одна одну)",
        imp.right !== acc.right, `${imp.right} vs ${acc.right}`);

  // повторний виклик не має дублювати кнопки (адмінка перемальовує body)
  dom.window.document.body.appendChild(dom.window.document.createElement("div"));
  const again = [...d.querySelectorAll("#accessLink")].length;
  check("кнопка не дублюється при перемалюванні", again === 1, again);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
