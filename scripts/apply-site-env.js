// Розкладає налаштування середовища (site.config.json) по файлах, де
// адреса сайту зашита в готовий текст.
//
// НАВІЩО
// -------
// Частину адрес не можна порахувати в рантаймі — вони мають лежати в
// розмітці готовими:
//   • canonical і og:url у кожній статичній сторінці — саме їх читає
//     пошуковий робот на першому проході;
//   • SITE_URL в assets/js/common.js — з нього будуються canonical
//     сторінок товарів і акцій;
//   • Sitemap: у robots.txt;
//   • CNAME — файл, яким GitHub Pages дізнається про власний домен;
//   • branch в admin/config.yml — на dev адмінка має комітити в dev,
//     інакше правки з тестового сайту поїдуть у бойовий.
//
// Раніше домен був зашитий у восьми місцях. Переїзд на bestbrnd4u.com
// вручну означав би правку кожного з них — і майже гарантовану
// забуту сторінку, яка потім показувала б Google canonical на старий
// домен.
//
// ЗАПУСК
//   node scripts/apply-site-env.js                 → продакшн
//   SITE_ENV=development node scripts/apply-site-env.js → дев
//
// В CI викликається ПЕРШИМ кроком збірки: усе, що генерується далі
// (сторінки товарів, sitemap, статична розмітка головної), уже бере
// правильний домен через scripts/site-env.js.

const fs = require("fs");
const path = require("path");

const { SITE_URL, BRANCH, INDEXABLE, CNAME, ENV_NAME, ALL } = require("./site-env");

const ROOT = path.join(__dirname, "..");

// усі відомі адреси сайту — щоб перемикатись між середовищами в обидва боки
const KNOWN_HOSTS = [
    "https://bestbrnd4u.github.io",
    ...Object.values(ALL)
        .filter(e => e && e.url)
        .map(e => e.url.replace(/\/+$/, ""))
];

function swapHost(text) {

    let out = text;

    KNOWN_HOSTS.forEach(host => {
        if (host === SITE_URL) return;
        out = out.split(host).join(SITE_URL);
    });

    // Домен трапляється і просто текстом — у темі листа на checkout і в
    // політиці конфіденційності. Там немає https://, тож заміна вище їх
    // не бачить, і сторінки лишались зі старою назвою сайту.
    //
    // ОБЕРЕЖНО: "bestbrnd4u/bestbrnd4u.github.io" — це шлях до
    // РЕПОЗИТОРІЯ (admin/config.yml, посилання на GitHub в
    // admin/access.html). Його чіпати не можна: репозиторій так і
    // називається, і після перейменування домену він не змінюється.
    // Тому пропускаємо входження, перед якими стоїть "/".
    const bareHost = SITE_URL.replace(/^https?:\/\//, "");

    KNOWN_HOSTS.forEach(host => {
        const bare = host.replace(/^https?:\/\//, "");
        if (bare === bareHost) return;
        out = out.replace(
            new RegExp(`(^|[^/\\w.-])${bare.replace(/\./g, "\\.")}`, "g"),
            (all, prefix) => prefix + bareHost
        );
    });

    return out;

}

const changed = [];

function rewrite(rel, fn) {

    const full = path.join(ROOT, rel);

    if (!fs.existsSync(full)) return;

    const before = fs.readFileSync(full, "utf8");
    const after = fn(before);

    if (after !== before) {
        fs.writeFileSync(full, after, "utf8");
        changed.push(rel);
    }

}

// ---- 1. статичні сторінки: canonical, og:url, og:image, JSON-LD ----
fs.readdirSync(ROOT)
    .filter(f => f.endsWith(".html"))
    .forEach(f => rewrite(f, swapHost));

// ---- 2. фронтенд ----
rewrite("assets/js/common.js", text =>
    text.replace(/const SITE_URL = "[^"]*";/, `const SITE_URL = "${SITE_URL}";`));

// ---- 3. robots.txt ----
rewrite("robots.txt", text => {

    let out = swapHost(text);

    // Дев не повинен потрапляти в пошук: інакше в індексі опиняться
    // дві копії магазину, і Google сам вирішуватиме, яку показувати.
    const devBlock = "\n# Тестове середовище — повністю закрите від пошуку\nUser-agent: *\nDisallow: /\n";

    out = out.replace(/\n# Тестове середовище[\s\S]*?Disallow: \/\n/, "");

    if (!INDEXABLE) out = devBlock + "\n" + out.replace(/^User-agent: \*[\s\S]*?(?=\nSitemap:|$)/m, "");

    return out;

});

// ---- 4. CNAME (лише там, де сайт віддає GitHub Pages) ----
{
    const full = path.join(ROOT, "CNAME");

    if (CNAME) {
        const before = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
        if (before.trim() !== CNAME) {
            fs.writeFileSync(full, CNAME + "\n", "utf8");
            changed.push("CNAME");
        }
    } else if (fs.existsSync(full)) {
        // на дев-середовищі файл зайвий: домен там дає Cloudflare Pages,
        // а зайвий CNAME збиває GitHub Pages з пантелику
        fs.rmSync(full);
        changed.push("CNAME (прибрано)");
    }
}

// ---- 5. адмінка: у яку гілку комітити ----
rewrite("admin/config.yml", text => {

    // site_domain і repo — НЕ адреси сайту, а ключі GitHub і Netlify.
    // Заміна домену їх зіпсувала б: site_domain перестав би збігатися з
    // зареєстрованим у Netlify (і вхід в адмінку відвалився б), а repo
    // вказав би на неіснуючий репозиторій.
    const KEEP = /^(\s*(?:site_domain|repo):\s*).+$/gm;
    const saved = [];

    let out = text.replace(KEEP, m => {
        saved.push(m);
        return `@@KEEP${saved.length - 1}@@`;
    });

    out = swapHost(out).replace(/^(\s*branch:\s*).+$/m, `$1${BRANCH}`);

    return out.replace(/@@KEEP(\d+)@@/g, (all, i) => saved[Number(i)]);

});

// ---- 6. заборона індексації дев-середовища в самій розмітці ----
// robots.txt рятує не завжди: якщо на дев хтось поставить посилання,
// Google може показати сторінку в результатах і без обходу. Мета-тег
// такого не допускає.
{
    const NOINDEX = '<meta name="robots" content="noindex,nofollow">';

    fs.readdirSync(ROOT)
        .filter(f => f.endsWith(".html"))
        .forEach(f => rewrite(f, text => {

            const stripped = text
                .replace(/\s*<meta name="robots" content="noindex,nofollow">/g, "");

            if (INDEXABLE) return stripped;

            return stripped.replace(/<head>/i, `<head>\n    ${NOINDEX}`);

        }));
}

console.log(`Середовище: ${ENV_NAME} → ${SITE_URL} (гілка ${BRANCH}, `
    + `${INDEXABLE ? "індексується" : "закрите від пошуку"})`);

console.log(changed.length
    ? `Оновлено файлів: ${changed.length}\n  ${changed.join("\n  ")}`
    : "Файли вже відповідають середовищу");
