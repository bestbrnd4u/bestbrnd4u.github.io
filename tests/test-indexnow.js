// IndexNow: сайт сам повідомляє пошуковики про нові адреси.
//
// ЩО ТУТ ГОЛОВНЕ
// ---------------
// Дві речі, які легко зламати тихо:
//
//   1. НАДСИЛАЄ ЛИШЕ ПРОД. На dev усе закрите robots.txt-ом
//      (Disallow: /). Запросити пошуковик на закриту сторінку — це
//      «Submitted URL blocked by robots.txt» у звітах, тобто гірше, ніж
//      не запрошувати взагалі.
//
//   2. НАДСИЛАЄМО ЛИШЕ ЗМІНЕНЕ. Сайт, який щодня шле всі свої сто
//      адрес, перестають слухати. А оскільки різниця списків не бачить
//      ЗМІНЕНОГО товару (його адреса вже була в sitemap), потрібні
//      обидва джерела — нові адреси і змінені дані.
//
// Плюс ключ: без файла /<ключ>.txt пошуковик відповідає 403, і це
// видно лише в логах через тиждень.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const config = JSON.parse(read("site.config.json"));

const KEY = config.indexNowKey;

const script = read("scripts/ping-indexnow.js");


console.log("\n[1] Ключ і файл перевірки");
{
    check("ключ є в site.config.json", typeof KEY === "string" && KEY.length > 0);

    // Протокол: 8–128 символів, лише a-zA-Z0-9 і дефіс.
    check("ключ відповідає протоколу (8–128, a-zA-Z0-9-)",
        /^[a-zA-Z0-9-]{8,128}$/.test(KEY || ""), KEY);

    const keyFile = path.join(ROOT, `${KEY}.txt`);

    check(`файл ${KEY}.txt лежить у корені`, fs.existsSync(keyFile));

    // Пошуковик читає файл БАЙТ У БАЙТ: усередині має бути сам ключ і
    // нічого більше.
    if (fs.existsSync(keyFile)) {

        const body = fs.readFileSync(keyFile, "utf8");

        check("у файлі рівно ключ, без зайвого", body.trim() === KEY,
            JSON.stringify(body.slice(0, 60)));

    }

    // Файл мусить бути ВІДСТЕЖУВАНИМ: незакомічений — і сторінки
    // GitHub Pages його не віддадуть, а пошуковик відповість 403.
    const tracked = execFileSync("git", ["ls-files", `${KEY}.txt`],
        { cwd: ROOT, encoding: "utf8" }).trim();

    check("файл із ключем закомічений", tracked !== "", "git його не бачить");
}

console.log("\n[2] Надсилає лише індексоване середовище");
{
    const run = env => execFileSync(process.execPath,
        ["scripts/ping-indexnow.js", "--dry-run"],
        { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });

    const dev = run({ SITE_ENV: "development" });

    check("на dev відмовляється надсилати",
        /закрите від пошуку/.test(dev), dev.trim().split("\n")[0]);

    check("і не доходить до складання списку",
        !/до надсилання/.test(dev));

    // Прод не має спотикатись — конкретний список залежить від того,
    // що змінилось у робочому дереві, тож перевіряємо лише те, що
    // скрипт доходить до кінця без падіння.
    const prod = run({ SITE_ENV: "production" });

    check("на проді працює без помилок", typeof prod === "string");

    check("нічого не надсилає в режимі --dry-run",
        !/надіслано/.test(prod) || /--dry-run/.test(prod));
}

console.log("\n[3] Різниця списків: нові адреси");
{
    // Розгортаємо справжній репозиторій у тимчасовій теці: скрипт
    // порівнює sitemap із HEAD~1, тож без двох комітів перевіряти
    // нічого. Так само працює й CI.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "indexnow-"));

    const git = (...args) => execFileSync("git", args,
        { cwd: tmp, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

    try {

        execFileSync("git", ["init", "-q", tmp], { encoding: "utf8" });

        git("config", "user.email", "t@t");
        git("config", "user.name", "t");

        fs.mkdirSync(path.join(tmp, "scripts"));
        fs.mkdirSync(path.join(tmp, "data"));

        fs.copyFileSync(path.join(ROOT, "scripts/ping-indexnow.js"),
            path.join(tmp, "scripts/ping-indexnow.js"));
        fs.copyFileSync(path.join(ROOT, "scripts/site-env.js"),
            path.join(tmp, "scripts/site-env.js"));
        fs.writeFileSync(path.join(tmp, "site.config.json"), read("site.config.json"));
        fs.writeFileSync(path.join(tmp, `${KEY}.txt`), KEY);

        const SITE = config.production.url;

        const sitemap = urls => '<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n'
            + urls.map(u => `  <url>\n    <loc>${u}</loc>\n  </url>`).join("\n")
            + "\n</urlset>\n";

        const product = (slug, price) => ({ slug, price, title: slug });

        // Коміт 1: два товари.
        fs.writeFileSync(path.join(tmp, "sitemap.xml"),
            sitemap([`${SITE}/`, `${SITE}/catalog`, `${SITE}/p/one/`, `${SITE}/p/two/`]));

        fs.writeFileSync(path.join(tmp, "data/products.json"),
            JSON.stringify([product("one", 100), product("two", 200)]));

        fs.writeFileSync(path.join(tmp, "data/promotions.json"), "[]");

        git("add", "-A");
        git("commit", "-qm", "1");

        // Коміт 2: додали third, і змінили ціну в one.
        fs.writeFileSync(path.join(tmp, "sitemap.xml"),
            sitemap([`${SITE}/`, `${SITE}/catalog`, `${SITE}/p/one/`,
                `${SITE}/p/two/`, `${SITE}/p/three/`]));

        fs.writeFileSync(path.join(tmp, "data/products.json"),
            JSON.stringify([product("one", 999), product("two", 200), product("three", 300)]));

        git("add", "-A");
        git("commit", "-qm", "2");

        const out = execFileSync(process.execPath,
            ["scripts/ping-indexnow.js", "--dry-run"],
            { cwd: tmp, encoding: "utf8", env: { ...process.env, SITE_ENV: "production" } });

        check("новий товар потрапив у список", out.includes(`${SITE}/p/three/`), out);

        // Ціна змінилась — сторінку варто перечитати, хоч адреса й не нова.
        check("товар зі зміненою ціною теж", out.includes(`${SITE}/p/one/`));

        // Незмінений товар турбувати не треба.
        check("незмінений товар НЕ надсилаємо", !out.includes(`${SITE}/p/two/`));

        check("головна і каталог додаються, бо каталог змінився",
            out.includes(`${SITE}/catalog`));

        check("у режимі --dry-run запит не йде", /--dry-run/.test(out));

        // Коміт 3: нічого не змінили — надсилати нічого.
        git("commit", "-qm", "3", "--allow-empty");

        const quiet = execFileSync(process.execPath,
            ["scripts/ping-indexnow.js", "--dry-run"],
            { cwd: tmp, encoding: "utf8", env: { ...process.env, SITE_ENV: "production" } });

        check("без змін не надсилає нічого",
            /надсилати нічого/.test(quiet), quiet.trim().split("\n").pop());

        // --all — свідомий повний прогін, потрібен раз після відкриття
        // сайту для пошуку.
        const all = execFileSync(process.execPath,
            ["scripts/ping-indexnow.js", "--dry-run", "--all"],
            { cwd: tmp, encoding: "utf8", env: { ...process.env, SITE_ENV: "production" } });

        check("--all бере всі адреси з sitemap", /всі 5 адрес/.test(all), all.trim().split("\n")[0]);

        // Сторож середовища: sitemap під іншим доменом — відмова.
        fs.writeFileSync(path.join(tmp, "sitemap.xml"),
            sitemap([`${config.development.url}/`, `${config.development.url}/p/one/`]));

        const mismatch = execFileSync(process.execPath,
            ["scripts/ping-indexnow.js", "--dry-run"],
            { cwd: tmp, encoding: "utf8", env: { ...process.env, SITE_ENV: "production" } });

        check("sitemap під чужим доменом — відмова",
            /зібраний під інший домен/.test(mismatch), mismatch.trim().split("\n")[0]);

    } finally {

        fs.rmSync(tmp, { recursive: true, force: true });

    }
}

console.log("\n[4] Скрипт не може зламати випуск");
{
    // Пінг — прискорювач обходу. Недоступний пошуковик, зіпсований
    // ключ, відсутній git — усе це причина написати рядок у лог, а не
    // зробити випуск червоним.
    check("помилка запиту не кидається далі", /request\.on\("error"/.test(script));

    check("є обмеження часу очікування", /timeout: \d+/.test(script));

    check("несподівана помилка перехоплюється", /main\(\)\.catch\(/.test(script));

    check("немає process.exit(1)", !/process\.exit\(1\)/.test(script));

    // Межа протоколу — 10 000 адрес на запит.
    check("список обмежений 10 000 адрес", /MAX_URLS = 10000/.test(script)
        && /slice\(0, MAX_URLS\)/.test(script));
}

console.log("\n[5] Підключено до збірок, які випускають прод");
{
    const prod = read(".github/workflows/build-products.yml");
    const sync = read(".github/workflows/sync-branches.yml");

    check("прод-збірка повідомляє пошуковики", /ping-indexnow\.js/.test(prod));

    // Товар з адмінки їде dev → main саме перенесенням, тож без цього
    // кроку про нього не дізнався б жоден пошуковик.
    check("перенесення dev → main теж", /ping-indexnow\.js/.test(sync));

    check("обидва кроки не валять збірку",
        (prod.match(/continue-on-error: true/g) || []).length >= 1
        && (sync.match(/continue-on-error: true/g) || []).length >= 1);

    // Дев-збірка НЕ має цього кроку: там усе закрите від пошуку.
    check("дев-збірка пошуковики не турбує",
        !/ping-indexnow/.test(read(".github/workflows/build-dev.yml")));

    // Пінг не в npm run build: збірка ходить і локально, і на dev.
    check("не в ланцюжку npm run build",
        !/ping-indexnow/.test(read("package.json")));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
