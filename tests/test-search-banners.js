// Банери в панелі пошуку: свої файли й передбачуваний кроп.
//
// ДВА СИМПТОМИ
//
// 1. Фото обрізало людям голови. Плитка мала фіксовану height:130px
//    при гумовій ширині, тож на десктопі виходило 348×130 (2.68:1), а
//    на телефоні 160×130 (1.23:1). Одна картинка мусила пережити і
//    широку смугу, і майже квадрат — background-size:cover різав її
//    по-різному, і підготувати кадр наперед було неможливо.
//
// 2. Плитки тягнули знімки з images.pexels.com прямо в style. Чуже
//    фото на комерційній вітрині — питання ліцензії, а зовнішній хост —
//    ще й запит до чужого сервера при кожному відкритті пошуку.
//    Головна сторінка від таких посилань уже очищена (перевірка
//    «немає pexels» у test-home-static-sync.js), панель пошуку —
//    ні: про неї та перевірка не знала.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Порівнюємо з КОДОМ, а не з поясненнями: у коментарях і до правила,
// і до скриптів обидві проблеми названі своїми іменами — «height:130px»
// та «pexels», — і наївний пошук по тексту знаходив би саме їх.
const stripCss = text => text.replace(/\/\*[\s\S]*?\*\//g, "");

const css = stripCss(read("assets/css/style.css"));
const common = read("assets/js/common.js");

console.log("\n[1] Кроп однаковий на всіх екранах");
{
    const rule = (css.match(/\.search-promo-banner\{[\s\S]*?\}/) || [""])[0];

    check("плитка задана пропорцією, а не фіксованою висотою",
        /aspect-ratio:\s*2\s*\/\s*1/.test(rule) && !/height:130px/.test(rule));
    check("є нижня межа висоти на вузькому екрані", /min-height:/.test(rule));

    // якщо файл банера колись не завантажиться, білий підпис не має
    // зникнути на білому тлі
    check("під фото лежить темне тло", /background-color:#0f1729/.test(rule));
}

console.log("\n[2] Банери свої, а не з чужого хоста");
{
    // Адреси більше не зашиті в розмітку: їх задає адміністратор, тож
    // плитка несе лише позначку, а картинку підставляє JS.
    check("плитка «Чоловікам» позначена", /class="search-promo-banner" data-banner="men"/.test(common));
    check("плитка «Жінкам» позначена", /class="search-promo-banner" data-banner="women"/.test(common));

    const code = common.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

    check("у панелі пошуку не лишилось зовнішніх фото",
        !/images\.pexels\.com/.test(code) && !/unsplash/.test(code));

    // мега-меню тягнуло ті самі знімки — 157 посилань на 13 сторінках
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));
    const dirty = pages.filter(f => /images\.pexels\.com|unsplash/.test(read(f)));

    check(`жодна сторінка не тягне чуже фото (перевірено ${pages.length})`,
        dirty.length === 0, dirty.join(", "));

    ["mega-men.webp", "mega-women.webp", "mega-unisex.webp", "mega-kids.webp"].forEach(name => {
        check(`${name} існує`, fs.existsSync(path.join(ROOT, "assets/images/banners", name)));
    });
}

console.log("\n[2b] Картинки пошуку задаються в адмінці");
{
    const { loadYaml } = require("./helpers/yaml");
    const config = loadYaml("admin/config.yml");

    const entry = (config.collections.find(c => c.name === "pages").files || [])
        .find(f => f.name === "searchBanners");

    check("розділ «Картинки в пошуку» є", !!entry);
    check("пише в data/search-banners.json", entry && entry.file === "data/search-banners.json");

    const genders = (entry && entry.fields) || [];

    check("є обидві статі", genders.length === 2);

    genders.forEach(gender => {

        const sub = gender.fields || [];
        const desktop = sub.find(f => f.name === "desktop");
        const mobile = sub.find(f => f.name === "mobile");

        check(`«${gender.label}»: є картинка для комп'ютера`, !!desktop);
        check(`«${gender.label}»: є окрема картинка для телефона`, !!mobile);

        // Обидві необов'язкові: без них плитка лишається темною з
        // читабельним підписом, а не порожнім світлим прямокутником.
        check(`«${gender.label}»: поля необов'язкові`,
            desktop && desktop.required === false && mobile && mobile.required === false);

        // Розміри мають бути в підказці — інакше адміністратор
        // завантажить портрет і плитка знову поріже кадр.
        check(`«${gender.label}»: у підказці вказано 800×400`,
            /800×400/.test(String(desktop && desktop.hint)));
        check(`«${gender.label}»: у підказці вказано 400×200`,
            /400×200/.test(String(mobile && mobile.hint)));

    });

    // Дані мусять існувати й вести на справжні файли, інакше в адмінці
    // поле відкриється порожнім, а на сайті плитка буде без картинки.
    const data = JSON.parse(read("data/search-banners.json"));

    ["men", "women"].forEach(key => {

        const paths = data[key] || {};

        ["desktop", "mobile"].forEach(size => {
            const rel = String(paths[size] || "").replace(/^\//, "");
            check(`${key}.${size} веде на наявний файл`,
                !!rel && fs.existsSync(path.join(ROOT, rel)), paths[size]);
        });

    });

    check("сайт читає налаштування", /data\/search-banners\.json/.test(common));
    check("телефонна версія перемикається медіазапитом",
        /--banner-sm,var\(--banner-lg,none\)/.test(css));
    check("без картинки плитка не ламається",
        /background-image:var\(--banner-lg,none\)/.test(css));
}

console.log("\n[3] Файли банерів існують і мають потрібний розмір");
{
    // 800×400 — це 2:1 із запасом на retina: найширша плитка на
    // десктопі 348 CSS-пікселів, тобто 696 фізичних
    const expect = { width: 800, height: 400 };

    ["search-men.webp", "search-women.webp",
     "search-men-sm.webp", "search-women-sm.webp"].forEach(name => {

        const file = path.join(ROOT, "assets/images/banners", name);

        check(`${name} існує`, fs.existsSync(file));

        if (!fs.existsSync(file)) return;

        // розмір WebP: беремо з VP8X/VP8L заголовка через sharp,
        // якщо він доступний; інакше хоча б перевіряємо, що файл не порожній
        let size = null;

        try {
            const sharp = require("sharp");
            size = require("child_process").execSync(
                `node -e "require('sharp')('${file}').metadata().then(m=>console.log(m.width+'x'+m.height))"`,
                { encoding: "utf8" }).trim();
        } catch (error) {
            size = null;
        }

        // телефонна версія — вдвічі менша, пропорція та сама
        const want = name.endsWith("-sm.webp")
            ? { width: expect.width / 2, height: expect.height / 2 }
            : expect;

        if (size) {
            check(`${name} — ${want.width}×${want.height}`,
                size === `${want.width}x${want.height}`, size);
        } else {
            check(`${name} не порожній`, fs.statSync(file).size > 1000);
        }

    });
}

console.log("\n[4] Банери можна перезібрати");
{
    // Асортимент змінюється, і банер має оновлюватись разом з ним, а не
    // лишатись знімком позаминулого сезону.
    const pkg = JSON.parse(read("package.json"));

    check("є npm-скрипт", !!pkg.scripts.banners);
    check("скрипт на місці", fs.existsSync(path.join(ROOT, "scripts/build-banners.js")));

    const builder = read("scripts/build-banners.js");

    check("товари беруться різних категорій", /usedCategories/.test(builder));
    check("перевага контрастнішому кадру", /stdev/.test(builder));
    check("розміри збігаються з тим, що чекає верстка",
        /width: 800, height: 400/.test(builder) && /width: 400, height: 200/.test(builder));
    check("мега-меню теж збирається", /width: 200, height: 200/.test(builder));
    check("розділ без товарів не лишає порожній <img>",
        /без фото \(немає товарів/.test(builder));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
