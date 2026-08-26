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

// Стан дерева ДО тесту — щоб повернути його в кінці.
//
// НАВІЩО: цей набір перемикає середовище на ЖИВОМУ дереві (інакше не
// перевірити ні robots, ні CNAME, ні гілку адмінки). Раніше в кінці
// стояло applyEnv("production") — «хай там що, лишаємо прод». Поки
// гілка була одна, це нічого не ламало. З появою dev вийшла міна:
// після `npm test` на гілці dev у дереві лишались бойові canonical,
// файл CNAME, robots.txt без Disallow і admin/config.yml із
// branch: main. Закомітив результат — і тестова адмінка почала
// комітити в прод, а dev відкрився для індексації.
//
// Ознака середовища — блок, який пише сам apply-site-env.js.
const envBefore = (() => {

    const m = read("admin/index.html")
        .match(/window\.SITE_ENVIRONMENT = \{[^}]*"name"\s*:\s*"([a-z]+)"/);

    return m ? m[1] : "production";

})();

const restoreEnv = () => applyEnv(envBefore);

console.log("\n[1] Конфіг середовищ описаний повністю");
{
    ["production", "development"].forEach(name => {
        const e = config[name];
        check(`${name}: є в конфізі`, !!e);
        if (!e) return;
        check(`${name}: адреса з https`, /^https:\/\//.test(e.url), e.url);
        check(`${name}: вказана гілка`, !!e.branch, e.branch);
        // домен для OAuth мусить бути саме хостом цього середовища
        check(`${name}: oauthSiteId = хост середовища`,
            e.oauthSiteId === e.url.replace(/^https?:\/\//, ""),
            `${e.oauthSiteId} проти ${e.url}`);
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

    // ЦЕ ГОЛОВНА ПЕРЕВІРКА ЦЬОГО БЛОКУ.
    //
    // Netlify відправляє токен назад через postMessage на адресу того
    // домену, під яким сайт у нього зареєстрований (site_domain). Якщо
    // ця адреса не збігається з тією, де відкрита адмінка, браузер
    // повідомлення просто відкидає: вікно показує «Authorized» і
    // зависає, а в адмінку так і не заходиш.
    //
    // Спершу я прибив site_domain до bestbrnd4u.github.io — і зламав
    // вхід саме так. Тепер він мусить дорівнювати домену середовища.
    check("site_domain заданий явно", !!admin.backend.site_domain, admin.backend.site_domain);
    check("site_domain = домен цієї ж адмінки (інакше токен не дійде)",
        admin.backend.site_domain === config.development.oauthSiteId,
        `${admin.backend.site_domain}, очікував ${config.development.oauthSiteId}`);
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
    check("site_domain повернувся на бойовий домен",
        admin.backend.site_domain === config.production.oauthSiteId,
        admin.backend.site_domain);
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
            badgeDoesNotCoverHeader();
            finish();
        });
}

function badgeDoesNotCoverHeader() {

console.log("\n[5c] Смуга не перекриває шапку адмінки");
{
    // Смуга висить у position: fixed. Спершу її компенсували відступом
    // у <body> — і цього не вистачало: два елементи Decap живуть поза
    // потоком body і на її padding не реагують.
    //
    //   • <header> (AppHeader)  — position: sticky; top: 0
    //   • EditorContainer       — position: absolute; top: 0; height: 100%
    //
    // Через це в редакторі товару смуга накривала кнопку Publish
    // і напис UNSAVED CHANGES.
    const badge = read("admin/env-badge.js");

    check("відступ більше не ставиться інлайном у <body>",
        !/body\.style\.paddingTop/.test(badge));
    check("стиль кладеться в <head> окремим тегом (переживає перемальовку body)",
        /envBadgeStyles/.test(badge) && /createElement\("style"\)/.test(badge));

    check("шапку адмінки зсунуто (position: sticky; top: 0)",
        /#nc-root header\s*\{\s*top:/.test(badge));
    check("редактор запису зсунуто (position: absolute; top: 0)",
        /#nc-root \[class\*="EditorContainer"\]/.test(badge));
    check("редактору перерахована висота, інакше він вилазить за екран",
        /height:\s*calc\(100% - var\(--env-badge-h\)\)/.test(badge));

    // Кнопку Publish окремо НЕ зсуваємо: її ToolbarContainer лежить
    // усередині EditorContainer і їде разом із ним. Окреме правило
    // зсунуло б її двічі.
    check("ToolbarContainer не зсувається окремо (їде разом з редактором)",
        !/ToolbarContainer/.test(badge.replace(/\/\/[^\n]*/g, "")));

    // Висота — не константа: смуга з flex-wrap на вузькому екрані
    // переноситься у два рядки, і зашиті 34px тоді збрехали б.
    check("висота вимірюється, а не зашита числом",
        /getBoundingClientRect\(\)\.height/.test(badge));
    check("зміну висоти відстежуємо", /ResizeObserver/.test(badge));

    // Власне меню адмінки теж висіло під смугою
    const adminHtml = read("admin/index.html");

    check("кнопка «Меню» рахує відступ від смуги",
        /top:calc\(var\(--env-badge-h, ?0px\) \+ \d+px\)/.test(adminHtml.replace(/\s+/g, " ")),
        (adminHtml.match(/position:fixed;top:[^"]*/) || [""])[0]);
    check("без смуги меню лишається на місці (fallback 0px)",
        /var\(--env-badge-h, ?0px\)/.test(adminHtml));
}

console.log("\n[5d] Набір не лишає дерево в чужому середовищі");
{
    // Цей файл перемикає середовище на живому дереві — інакше не
    // перевірити robots, CNAME і гілку адмінки. Раніше в кінці стояло
    // applyEnv("production"), тобто після `npm test` на гілці dev у
    // дереві лишались бойові налаштування: адмінка з branch: main,
    // robots без Disallow і файл CNAME. Закомітив — і тестова адмінка
    // пише в прод.
    const self = read("tests/test-site-environments.js");

    check("стан середовища запам'ятовується до перевірок",
        /const envBefore =/.test(self));
    check("у кінці повертається саме він, а не зашитий production",
        /restoreEnv\(\)/.test(self) && !/applyEnv\("production"\);\s*\n\s*console\.log\(failures/.test(self));
    check("повернення працює і після падіння (catch)",
        /catch \(error\) \{\s*\n\s*restoreEnv\(\);/.test(self));

    // на момент цієї перевірки блок [4] уже переключив дерево в
    // production і назад — переконуємось, що ознака середовища жива
    check("середовище дерева читається з admin/index.html",
        ["production", "development"].includes(envBefore), envBefore);
}

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

    // КОЖЕН workflow, що пише в main, мусить сам запустити деплой.
    //
    // Пуш, зроблений вбудованим GITHUB_TOKEN, НЕ породжує події push —
    // GitHub так захищається від нескінченних ланцюжків. А
    // deploy-pages.yml слухає саме `on: push: branches: [main]`.
    //
    // build-products.yml цю пастку обходив, sync-branches.yml — ні, і
    // перенесення dev → main спрацьовувало «наполовину»: у гілці
    // лежали правильні файли, а сайт лишався на старій збірці. Ззовні
    // виглядало так, ніби товари не перенеслись, хоча перенеслось усе.
    [
        [".github/workflows/build-products.yml", "прод-збірка"],
        [".github/workflows/sync-branches.yml", "перенесення гілок"]
    ].forEach(([file, label]) => {

        const wf = read(file);

        check(`${label} сама запускає деплой`,
            /gh workflow run deploy-pages\.yml/.test(wf));

        // без actions: write крок падає з 403
        check(`${label} має право запустити деплой`,
            /permissions:[\s\S]{0,300}actions:\s*write/.test(wf));

    });

    // Умова «якщо були зміни» тут — пастка: коли файли в main уже
    // правильні, а сайт застряг на старій збірці, повторний Sync
    // нічого не переносить і деплою теж не буде.
    const syncWf = read(".github/workflows/sync-branches.yml");
    const deployStep = syncWf.slice(syncWf.indexOf("- name: Trigger deploy"));

    check("деплой після перенесення не залежить від наявності змін",
        /if:\s*steps\.pick\.outputs\.to == 'main'\s*\n/.test(deployStep)
        && !/pushed == 'true'/.test(deployStep.slice(0, 200)));
    check("прод-збірка комітить CNAME і robots",
        /git add[\s\S]{0,200}CNAME/.test(prodWf));
}

    restoreEnv();

    console.log(`\n↩ середовище дерева повернуто: ${envBefore}`);

    console.log("\n[N] Прод-збірка комітить УСІ налаштування адмінки");
{
    // СИМПТОМ, ЧЕРЕЗ ЯКИЙ ЦЕ ЗʼЯВИЛОСЬ
    // ----------------------------------
    // Вписали ідентифікатор Google Analytics, опублікували, зробили
    // реліз — а на проді «тег не знайдено». Причина не в тезі:
    // data/analytics.json просто не потрапляв у коміт. Прод-збірка
    // перелічувала файли поіменно, і перелік доповнювали не щоразу.
    //
    // Так само мовчки губились data/telegram.json (посилання в бота) і
    // data/search-banners.json (картинки в пошуку). Сайт при цьому не
    // падає — налаштування просто не діють, і причину зі сторони не
    // видно.
    const prod = read(".github/workflows/build-products.yml");
    const dev = read(".github/workflows/build-dev.yml");

    // Тека цілком, а не перелік: інакше кожен новий розділ адмінки
    // доведеться згадувати руками.
    check("прод бере теку data цілком", /git add -A data\b/.test(prod));
    check("дев теж", /git add -A data\b/.test(dev));

    // І перевіряємо по факту: кожен файл, у який пише адмінка, мусить
    // потрапляти в коміт.
    const { loadYaml } = require("./helpers/yaml");

    const pages = loadYaml("admin/config.yml").collections
        .find(c => c.name === "pages");

    const files = (pages.files || []).map(f => f.file).filter(Boolean);

    check(`розділів адмінки — ${files.length}`, files.length > 0);

    const missed = files.filter(file => {

        // або згадан поіменно, або покритий `git add -A` по своїй теці
        const dir = file.split("/")[0];

        return !prod.includes(file) && !new RegExp(`git add -A ${dir}\\b`).test(prod);

    });

    check("жодне налаштування не губиться на проді", missed.length === 0,
        missed.join(", "));
}

console.log("\n[N2] robots.txt збирається заново, а не правиться");
{
    // СИМПТОМ
    // --------
    // Файл розпух до 428 рядків: сотні порожніх, правила повторені
    // тричі й маркери конфлікту злиття посередині.
    //
    // ПРИЧИНА
    // --------
    // Скрипт середовища РЕДАГУВАВ наявний текст: вирізав блок
    // регулярним виразом і дописував інший. Порожні рядки від
    // вирізаного лишалися, правила дописувались ще раз — і так на
    // кожній збірці.
    //
    // Пошуковик такий файл читає до першої незрозумілої стрічки, тож
    // частина правил могла не діяти. Помітити це можна лише відкривши
    // файл очима — жодної помилки при цьому не виникає.
    const robots = read("robots.txt");
    const lines = robots.split("\n");

    check(`робots.txt — ${lines.length} рядків`, lines.length < 20, lines.length);

    // Маркери конфлікту в robots.txt означають, що файл зламаний.
    check("немає маркерів злиття",
        !/<<<<<<<|>>>>>>>|Updated upstream|Stashed changes/.test(robots));

    // Порожні рядки допустимі як розділювачі, але не сотнями.
    const blank = lines.filter(l => l.trim() === "").length;

    check(`порожніх рядків — ${blank}`, blank <= 3, blank);

    // Правила не мають повторюватись: тричі «Disallow: /admin/» це
    // слід накопичення, а не намір.
    const rules = lines.filter(l => /^(Allow|Disallow|User-agent|Sitemap):/i.test(l));
    const unique = new Set(rules);

    check("жодне правило не повторюється", rules.length === unique.size,
        `${rules.length} рядків, ${unique.size} унікальних`);

    // Sitemap мусить бути рівно один і вести на поточне середовище.
    const sitemaps = lines.filter(l => /^Sitemap:/i.test(l));

    check("Sitemap рівно один", sitemaps.length === 1, sitemaps.length);

    // І сам механізм: вміст не має залежати від того, що лежало у
    // файлі раніше.
    const script = read("scripts/apply-site-env.js");

    check("файл збирається з нуля",
        /rewrite\("robots\.txt", \(\) =>/.test(script));
    check("наявний текст не читається",
        !/rewrite\("robots\.txt", text =>/.test(script));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
    process.exit(failures === 0 ? 0 : 1);

}

} catch (error) {
    restoreEnv();   // хай там що — повертаємо дерево в те середовище, у якому воно було
    throw error;
}
