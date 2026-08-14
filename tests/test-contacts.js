// Контактні дані: пошта, телефон, Telegram.
// Стежимо, щоб вони були однакові на ВСІХ сторінках і клікабельні —
// контакти легко забути в одному-двох файлах.
const fs=require("fs"), path=require("path");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const MAIL = "bestbrnd4u@proton.me";
const TG = "bestbrnd4u";
const OLD_MAIL = "info@bestbrnd4u.ua";

const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

console.log("\n[1] Стара пошта не лишилась ніде");
{
  const stale = pages.filter(f => read(f).includes(OLD_MAIL));
  check(`${OLD_MAIL} не згадується`, stale.length === 0, stale.join(", "));

  // включно зі структурованими даними для пошукових систем
  const jsonLd = pages.filter(f => /"email":\s*"[^"]*bestbrnd4u\.ua"/.test(read(f)));
  check("у JSON-LD теж нова пошта", jsonLd.length === 0, jsonLd.join(", "));
}

console.log("\n[2] Нова пошта є там, де була стара, і клікабельна");
{
  const withFooterMail = pages.filter(f => read(f).includes("mail-link"));
  check("пошта у футері на всіх сторінках", withFooterMail.length === pages.length,
        `${withFooterMail.length} з ${pages.length}`);

  const wrongHref = withFooterMail.filter(f => !read(f).includes(`href="mailto:${MAIL}"`));
  check("mailto веде на правильну адресу", wrongHref.length === 0, wrongHref.join(", "));
}

console.log("\n[3] Telegram доданий і нікуди не веде порожнім");
{
  const withTg = pages.filter(f => read(f).includes("tg-link"));
  check("Telegram у футері на всіх сторінках", withTg.length === pages.length,
        `${withTg.length} з ${pages.length}`);

  const wrongTg = withTg.filter(f => !read(f).includes(`https://t.me/${TG}`));
  check("посилання веде на правильний нік", wrongTg.length === 0, wrongTg.join(", "));

  const shownAs = pages.filter(f => read(f).includes(`>@${TG}<`));
  check("нік показаний як @нік", shownAs.length === pages.length, shownAs.length);

  // Регресія: у блоці соцмереж посилання Telegram було href="#"
  const emptyTg = pages.filter(f => /<a href="#"[^>]*aria-label="Telegram"/.test(read(f)));
  check("порожніх посилань Telegram більше немає", emptyTg.length === 0, emptyTg.join(", "));

  check("зовнішні посилання відкриваються в новій вкладці безпечно",
        withTg.every(f => {
          const m = read(f).match(/<a class="tg-link"[^>]*>/);
          return m && m[0].includes('target="_blank"') && m[0].includes('rel="noopener"');
        }));
}

console.log("\n[4] Сторінка контактів");
{
  const contacts = read("contacts.html");
  check("картка Telegram додана", /<h3>Telegram<\/h3>/.test(contacts));
  check("пошта в картці клікабельна", contacts.includes(`href="mailto:${MAIL}"`));
  check("Telegram у картці клікабельний", contacts.includes(`href="https://t.me/${TG}"`));
}

console.log("\n[5] Контакти у футері не виглядають чужорідно");
{
  const css = fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");
  check("телефон, пошта і Telegram успадковують колір футера",
        /\.footer \.phone-link,[\s\S]{0,120}\.footer \.tg-link\{[^}]*color:inherit/.test(css));
  check("підкреслення з'являється при наведенні",
        /\.footer \.tg-link:hover\{[^}]*text-decoration:underline/.test(css));
  check("посилання в картках контактів теж стилізовані",
        /\.contact-card \.contact-link\{[^}]*color:inherit/.test(css));
}

console.log("\n[6] Телефон не зламався");
{
  const withPhone = pages.filter(f => read(f).includes("phone-link"));
  check("телефон лишився на всіх сторінках", withPhone.length === pages.length,
        `${withPhone.length} з ${pages.length}`);
  check("номер відображається", read("index.html").includes("+380 73 728 82 91"));
}

console.log("\n[7] Назва магазину — BestBrnd4u");
{
  // Три групи згадок старої назви лишились НАВМИСНО. Кожна — з
  // причиною, і тест стежить, щоб до них не додалась четверта
  // непомічена.
  //
  // 1. Ключі localStorage у браузері відвідувача. Ніде не
  //    показуються; перейменування тихо скинуло б збережений стан
  //    (нещодавно переглянуті товари, розгорнуті групи сайдбара).
  // 2. slug товарів = імена файлів у data/products/. Слаг у
  //    посиланнях не використовується (товар відкривається по ?id=),
  //    а перейменування файлів через архів створило б ДУБЛІ: розпаковка
  //    додає нові файли, але не видаляє старі — у каталозі з'явилось
  //    би по два однакових товари.
  // 3. Сам цей тест — він містить рядок "bagvero" у перевірках.
  const ALLOWED = {
    "assets/js/catalog.js": "ключ localStorage + пояснення",
    "assets/js/common.js": "ключ localStorage + пояснення",
    "tests/test-contacts.js": "сам тест",
    "tests/test-sidebar-collapse.js": "перевіряє той самий ключ localStorage",
    "scripts/clean-old-products.js": "перелік СТАРИХ файлів демо-каталогу — їх треба назвати дослівно, щоб видалити",
    "tests/test-image-fit.js": "перевіряє той самий скрипт прибирання",
  };

  // ЗГЕНЕРОВАНІ файли не перевіряємо: їх перезбирає GitHub Actions
  // після коміту, тож у свіжому клоні та в CI до перезбірки вони
  // відстають від джерел. Перевіряти їх — означає ловити не помилку в
  // коді, а момент часу. Джерела (data/products/*.json) перевіряємо
  // нижче окремо.
  const GENERATED = [
    "data/products.json",
    "data/categories.json",
    "data/promotions.json",
    "data/collections.json",
    "data/promo-popups.json",
    "package-lock.json",
  ];

  const files = [];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    if (e.name === "node_modules" || e.name === ".git") return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(html|js|ts|css|json|yml|md|sql)$/.test(e.name)) {
      const rel = path.relative(ROOT, full).split(path.sep).join("/");
      if (!GENERATED.includes(rel)) files.push(full);
    }
  });
  walk(ROOT);

  const found = files
    .filter(f => /bagvero/i.test(fs.readFileSync(f, "utf8")))
    .map(f => path.relative(ROOT, f).split(path.sep).join("/"));

  // slug-и товарів — окрема група, перевіряємо їх умисність нижче
  const productSlugs = found.filter(f => f.startsWith("data/products"));
  const rest = found.filter(f => !f.startsWith("data/products"));

  const unexpected = rest.filter(f => !(f in ALLOWED));

  check("нових незадокументованих згадок старої назви немає",
        unexpected.length === 0, unexpected.join(", "));

  check("згадки лишились саме там, де очікуємо",
        rest.every(f => f in ALLOWED), rest.join(", "));

  // У ДЖЕРЕЛЬНИХ файлах товарів стара назва має лишитись тільки в
  // slug (він дорівнює імені файлу), але не в бренді чи назві.
  const badProducts = [];
  productSlugs
    .filter(rel => rel.startsWith("data/products/"))   // саме джерела, не агрегат
    .forEach(rel => {
      const data = fs.readFileSync(path.join(ROOT, rel), "utf8");
      const stripped = data.replace(/"slug":\s*"[^"]*"/g, "");
      if (/bagvero/i.test(stripped)) badProducts.push(rel);
    });

  check("у джерельних товарах стара назва лишилась тільки в slug",
        badProducts.length === 0, badProducts.join(", "));

  check("нова назва є на головній", read("index.html").includes("BestBrnd4u"));

  // ключі мусять лишитись — інакше відвідувачі втратять збережене
  const catalog = fs.readFileSync(path.join(ROOT,"assets/js/catalog.js"),"utf8");
  const common = fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
  check("ключ сайдбара не перейменований", catalog.includes("bagvero:sidebar-expanded"));
  check("ключ нещодавно переглянутих не перейменований", common.includes("bagvero_recently_viewed"));
  check("у коді пояснено, чому ключі лишились",
        /НАВМИСНО лишається зі старою назвою/.test(catalog) &&
        /НАВМИСНО лишається зі старою назвою/.test(common));

  // бренди власних товарів перейменовані
  const productFiles = fs.readdirSync(path.join(ROOT,"data/products"))
      .filter(f => f.endsWith(".json"));
  const oldBrand = productFiles.filter(f =>
      /"brand":\s*"Bagvero/.test(fs.readFileSync(path.join(ROOT,"data/products",f),"utf8")));
  check("бренди власних товарів оновлені", oldBrand.length === 0, oldBrand.join(", "));
}

console.log("\n[8] Мертвих посилань у соцмережах немає");
{
  const withFb = pages.filter(f => /Facebook/i.test(read(f)));
  check("Facebook прибраний (сторінки не існує)", withFb.length === 0, withFb.join(", "));

  // жодне посилання в блоці соцмереж не має вести в "#"
  const deadLinks = pages.filter(f => {
    const m = read(f).match(/<div class="footer-social">[\s\S]*?<\/div>/);
    return m && /href="#"/.test(m[0]);
  });
  check("усі посилання в соцмережах робочі", deadLinks.length === 0, deadLinks.join(", "));

  const withInsta = pages.filter(f => read(f).includes("instagram.com/bestbrnd4u"));
  check("Instagram лишився на всіх сторінках", withInsta.length === pages.length,
        `${withInsta.length} з ${pages.length}`);
}

console.log("\n[9] Позначки авторства (потрібні для скарги DMCA)");
{
  const withAuthor = pages.filter(f => /name="author"\s+content="BestBrnd4u"/.test(read(f)));
  check("автор указаний на всіх сторінках", withAuthor.length === pages.length,
        `${withAuthor.length} з ${pages.length}`);

  const withCopyright = pages.filter(f => /name="copyright"/.test(read(f)));
  check("копірайт у метаданих на всіх сторінках", withCopyright.length === pages.length,
        `${withCopyright.length} з ${pages.length}`);

  const withLicense = pages.filter(f => /rel="license"/.test(read(f)));
  check("посилання на ліцензію на всіх сторінках", withLicense.length === pages.length,
        `${withLicense.length} з ${pages.length}`);

  const lic = path.join(ROOT, "LICENSE");
  check("файл LICENSE існує", fs.existsSync(lic));

  if (fs.existsSync(lic)) {
    const text = fs.readFileSync(lic, "utf8");

    check("явна заборона використання", /ЗАБОРОНЕНО|PROHIBITED/.test(text));
    check("сказано, що публічність ≠ дозвіл",
          /НЕ означає дозволу/i.test(text) && /does NOT grant any/i.test(text));
    check("є контакт для скарг", text.includes("bestbrnd4u@proton.me"));
    check("згадано DMCA", /DMCA/.test(text));
    check("двомовна (укр + англ) — хостери часто англомовні",
          /УКРАЇНСЬКОЮ/.test(text) && /ENGLISH/.test(text));
    check("назва бренду актуальна", text.includes("BestBrnd4u") && !/bagvero/i.test(text));
  }
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
