// Середовища сайту (site.config.json) і вхід в адмінку.
//
// ДВІ РЕЧІ, ЯКІ ТУТ СТЕРЕЖУТЬСЯ
//
// 1. Домен більше не зашитий у код. Раніше він жив у восьми місцях —
//    трьох збиральних скриптах, assets/js/common.js, robots.txt і
//    canonical/og кожної статичної сторінки. Переїзд на власний домен
//    вручну майже гарантовано лишив би сторінку зі старим canonical.
//
// 2. Вхід в адмінку не залежить від домену. Netlify впізнає сайт за
//    site_id, а Decap за замовчуванням підставляє туди поточний хост.
//    Після переїзду на bestbrnd4u.com туди почав їхати новий домен,
//    якого Netlify не знає, — і вхід відвалився. Лікується site_domain,
//    але його НЕ можна переписувати разом з доменом сайту: це ключ у
//    Netlify, а не адреса. Так само repo — це шлях до репозиторію,
//    який після зміни домену лишається старим.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const { loadYaml } = require("./helpers/yaml");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));

const applyEnv = env => execFileSync("node", [path.join(ROOT, "scripts/apply-site-env.js")],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, SITE_ENV: env } });

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

console.log("\n[1] Конфіг середовищ описаний повністю");
{
    ["production", "development"].forEach(name => {
        const e = config[name];
        check(`${name}: є в конфізі`, !!e);
        if (!e) return;
        check(`${name}: адреса з https`, /^https:\/\//.test(e.url), e.url);
        check(`${name}: вказана гілка`, !!e.branch, e.branch);
    });

    check("прод і дев на різних адресах",
        config.production.url !== config.development.url);
    check("прод і дев на різних гілках",
        config.production.branch !== config.development.branch);
    check("дев закритий від індексації", config.development.indexable === false);
    check("тільки в прода є CNAME (домен дева дає Cloudflare)",
        !!config.production.cname && !config.development.cname);
}

console.log("\n[2] Домен ніде не зашитий повз конфіг");
{
    const files = ["scripts/build-sitemap.js", "scripts/build-product-pages.js",
                   "scripts/build-home-static.js"];

    files.forEach(f => {
        check(`${f} бере домен з site-env`, read(f).includes('require("./site-env")'));
        check(`${f} не тримає домен константою`,
            !/const SITE_URL = "https?:/.test(read(f)));
    });
}

// далі перемикаємо середовища по-справжньому; наприкінці повертаємо прод
try {

console.log("\n[3] Перемикання на дев змінює все, що треба");
{
    applyEnv("development");

    const dev = config.development.url;

    check("canonical головної — дев", read("index.html").includes(`canonical" href="${dev}/`));
    check("SITE_URL у common.js — дев",
        read("assets/js/common.js").includes(`const SITE_URL = "${dev}"`));
    check("у розмітку доданий noindex",
        /content="noindex,nofollow"/.test(read("index.html")));
    check("robots.txt закриває весь сайт", /Disallow: \/\s*$/m.test(read("robots.txt")));
    check("CNAME прибраний", !fs.existsSync(path.join(ROOT, "CNAME")));

    const admin = loadYaml("admin/config.yml");
    check("адмінка комітить у гілку dev", admin.backend.branch === "dev", admin.backend.branch);
}

console.log("\n[4] Вхід в адмінку переїзду не помічає");
{
    const admin = loadYaml("admin/config.yml");

    check("site_domain заданий явно", !!admin.backend.site_domain, admin.backend.site_domain);
    check("site_domain НЕ підмінений доменом дева",
        admin.backend.site_domain === "bestbrnd4u.github.io", admin.backend.site_domain);
    check("repo НЕ підмінений",
        admin.backend.repo === "bestbrnd4u/bestbrnd4u.github.io", admin.backend.repo);
    check("OAuth-проксі на місці", admin.backend.base_url === "https://api.netlify.com");

    // github-publish.js робить власний запит на той самий OAuth
    const publish = read("admin/github-publish.js");
    check("власна публікація теж читає site_domain з конфіга",
        /pick\("site_domain"/.test(publish));
}

console.log("\n[5] Повернення на прод відновлює все");
{
    applyEnv("production");

    const prod = config.production.url;

    check("canonical головної — прод", read("index.html").includes(`canonical" href="${prod}/`));
    check("noindex прибраний", !/content="noindex,nofollow"/.test(read("index.html")));
    check("CNAME на місці", fs.existsSync(path.join(ROOT, "CNAME")));
    check("у CNAME потрібний домен",
        read("CNAME").trim() === config.production.cname, read("CNAME").trim());
    check("robots.txt знову дозволяє обхід", /^Allow: \//m.test(read("robots.txt")));
    check("Sitemap у robots вказує на прод",
        read("robots.txt").includes(`Sitemap: ${prod}/sitemap.xml`));

    const admin = loadYaml("admin/config.yml");
    check("адмінка знову комітить у main", admin.backend.branch === "main");
    check("site_domain і після повернення цілий",
        admin.backend.site_domain === "bestbrnd4u.github.io");
}

console.log("\n[5b] Смуга середовища в адмінці не дає переплутати сайти");
{
    // Адмінок дві, виглядають однаково. Відкриті поруч вкладки нічим
    // не відрізняються, і «спробую на тесті» легко стає правкою
    // бойового каталогу — помітно вже після публікації.
    const { JSDOM } = require("jsdom");
    const badge = read("admin/env-badge.js");
    const adminHtml = read("admin/index.html");

    check("смуга підключена в адмінці", adminHtml.includes("env-badge.js"));
    check("дані середовища проставлені збіркою",
        /window\.SITE_ENVIRONMENT = \{[^}]*"branch"/.test(adminHtml));
    check("блок даних рівно один (не накопичується при перезбірках)",
        (adminHtml.match(/window\.SITE_ENVIRONMENT = /g) || []).length === 1);

    const show = async json => {
        const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>",
            { runScripts: "outside-only", pretendToBeVisual: true });
        dom.window.eval(`window.SITE_ENVIRONMENT = ${json};`);
        dom.window.eval(badge);
        await new Promise(r => setTimeout(r, 250));
        const bar = dom.window.document.getElementById("envBadge");
        return { text: bar ? bar.textContent : "", title: dom.window.document.title,
                 color: bar ? bar.style.background : "" };
    };

    return show('{"name":"production","host":"bestbrnd4u.com","branch":"main"}')
        .then(prod => {

            check("на боєвому написано, що він бойовий", /БОЙОВИЙ/.test(prod.text), prod.text);
            check("видно гілку, у яку підуть коміти", /main/.test(prod.text));
            check("бойове — червоне", /185, 28, 28/.test(prod.color), prod.color);
            check("у назві вкладки видно середовище", /PROD/.test(prod.title), prod.title);

            return show('{"name":"development","host":"dev.bestbrnd4u.com","branch":"dev"}');

        })
        .then(dev => {

            check("на тестовому написано, що він тестовий", /ТЕСТОВЕ/.test(dev.text), dev.text);
            check("видно гілку dev", /dev/.test(dev.text));
            check("тестове — зелене", /4, 120, 87/.test(dev.color), dev.color);
            check("вкладка позначена DEV", /DEV/.test(dev.title), dev.title);

            // краще нічого, ніж неправильна гілка
            return show("undefined");

        })
        .then(none => {
            check("без даних середовища смуга не малюється", none.text === "", none.text);
            finish();
        });
}

function finish() {

console.log("\n[6] Дев-збірка налаштована в CI");
{
    const wf = path.join(ROOT, ".github/workflows/build-dev.yml");
    check("є окремий workflow для дева", fs.existsSync(wf));

    if (fs.existsSync(wf)) {
        const text = fs.readFileSync(wf, "utf8");
        check("слухає гілку dev", /branches: \[dev\]/.test(text));
        check("збирає з SITE_ENV=development", /SITE_ENV: development/.test(text));
    }

    // Перенесення між гілками кнопкою: гілки НЕ однакові побайтно
    // (canonical, robots, CNAME, гілка адмінки різні), тож звичайний
    // merge конфліктував би щоразу. Workflow знімає це перезбіркою.
    const syncPath = path.join(ROOT, ".github/workflows/sync-branches.yml");
    check("є workflow перенесення між гілками", fs.existsSync(syncPath));

    if (fs.existsSync(syncPath)) {
        const sync = fs.readFileSync(syncPath, "utf8");
        check("запускається вручну, а не сам", /workflow_dispatch/.test(sync));
        check("обидва напрямки доступні",
            /dev-to-main/.test(sync) && /main-to-dev/.test(sync));
        check("конфлікти знімаються перевагою джерела", /-X theirs/.test(sync));
        check("після перенесення йде перезбірка під середовище приймача",
            /SITE_ENV: \$\{\{ steps\.pick\.outputs\.env \}\}/.test(sync));
        check("потрібна повна історія для merge", /fetch-depth: 0/.test(sync));
    }

    // POSIX-префікс змінної не працює в PowerShell, а робота ведеться
    // саме там — тому дев-збірка запускається через node
    const pkg2 = JSON.parse(read("package.json"));
    check("build:dev кросплатформений (без SITE_ENV=... на початку)",
        !/^SITE_ENV=/.test(pkg2.scripts["build:dev"]), pkg2.scripts["build:dev"]);
    check("build:dev іде через node-обгортку",
        /node scripts\/build-dev\.js/.test(pkg2.scripts["build:dev"]));

    const prodWf = read(".github/workflows/build-products.yml");
    check("прод-збірка застосовує середовище", prodWf.includes("apply-site-env.js"));
    check("прод-збірка комітить CNAME і robots",
        /git add[\s\S]{0,200}CNAME/.test(prodWf));
}

    applyEnv("production");

    console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
    process.exit(failures === 0 ? 0 : 1);

}

} catch (error) {
    applyEnv("production");   // хай там що — лишаємо репозиторій у продакшн-стані
    throw error;
}
