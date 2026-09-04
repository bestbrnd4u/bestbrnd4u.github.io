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

console.log("\n[5] Меню в шапці адмінки");
{
  check("посилання на інструкцію є", /href: "access\.html"/.test(index));
  check("масовий імпорт є", /href: "import\.html"/.test(index));
  check("є вихід", /action: "logout"/.test(index));

  check("немає форми створення користувача",
        !/type=["']password["']/i.test(page) && !/type=["']password["']/i.test(index));
  check("у коді пояснено, чому інструкція, а не форма",
        index.includes("власної бази користувачів у CMS немає"));

  // Регресія: кнопки спершу висіли в правому нижньому куті (перекривали
  // редактор), потім у лівому меню (зникали на сторінці товару).
  check("правий нижній кут не використовується",
        !/bottom:20px;right:20px/.test(index));
  check("не залежить від класів Decap (вони генеруються автоматично)",
        !/querySelector\(['"]\.[a-z]+-[0-9a-f]{6}/.test(index));

  const dom = new JSDOM(index, { runScripts: "dangerously" });
  const w = dom.window, d = w.document;

  const root = d.getElementById("adminMenuRoot");
  const menu = d.getElementById("adminMenuList");

  check("меню створено", !!root);
  // Відступ рахується від смуги середовища (--env-badge-h з env-badge.js):
  // з жорсткими 14px кнопка опинялась ПІД смугою. Без смуги змінної
  // немає — тоді працює запасне 0px і кнопка лишається там, де була.
  check("закріплене в шапці, не в кутку",
        root.style.position === "fixed"
        && /^calc\(var\(--env-badge-h, ?0px\) \+ 14px\)$/.test(root.style.top),
        root.style.top);
  check("за замовчуванням згорнуте", menu.hidden === true);

  d.getElementById("adminMenuToggle").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  check("відкривається кліком", menu.hidden === false);
  // Перевіряємо СКЛАД меню, а не кількість пунктів: список поповнюється
  // (так до нього додалась панель замовлень), і число тут означало б
  // лише «нічого не додавали».
  const items = [...menu.children].map(item => item.textContent);

  [
    ["Замовлення", "orders.html"],
    ["Масовий імпорт", "import.html"],
    ["Доступи для колег", "access.html"],
  ].forEach(([label, href]) => {
    check(`у меню є «${label}»`,
          items.some(text => text.includes(label))
          && [...menu.children].some(item => item.getAttribute("href") === href),
          items.join(" | "));
  });

  const last = menu.children[menu.children.length - 1];

  check("вихід останній і виділений кольором",
        last.textContent.includes("Вийти") && last.style.color === "rgb(220, 38, 38)",
        `${last.textContent} / ${last.style.color}`);

  d.body.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  check("клік поза меню закриває", menu.hidden === true);

  d.getElementById("adminMenuToggle").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
  check("Esc закриває", menu.hidden === true);

  check("вихід прибирає збережений токен", /removeItem\("decap-cms-user"\)/.test(index));
  check("і другий ключ, що лишався від Netlify CMS",
        /removeItem\("netlify-cms-user"\)/.test(index));
  check("приватний режим браузера не ламає вихід", /catch \(error\)[\s\S]{0,120}приватний режим/.test(index));
}

(async () => {

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);

})();
