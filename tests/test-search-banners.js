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

    // Плиток чотири: «Чоловікам», «Жінкам», «Новинки», «Акції».
    // Останні дві історично малювались градієнтом — тепер їм теж можна
    // вибрати фото, а без фото градієнт лишається (див. блок [2c]).
    const tiles = (entry && entry.fields) || [];

    check("налаштовуються всі чотири плитки", tiles.length === 4,
        tiles.map(t => t.label).join(", "));

    tiles.forEach(gender => {

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

    ["men", "women", "new", "sale"].forEach(key => {

        const paths = data[key] || {};

        check(`${key}: запис є в даних`, !!data[key]);

        ["desktop", "mobile"].forEach(size => {

            const rel = String(paths[size] || "").replace(/^\//, "");

            // Порожньо — це нормальна відповідь: «Новинки» й «Акції»
            // без фото лишаються градієнтними. Але якщо шлях указано,
            // файл мусить існувати, інакше плитка буде порожньою.
            if (!rel) {
                check(`${key}.${size}: без фото (лишається колір)`, true);
                return;
            }

            check(`${key}.${size} веде на наявний файл`,
                fs.existsSync(path.join(ROOT, rel)), paths[size]);

        });

    });

    check("сайт читає налаштування", /data\/search-banners\.json/.test(common));
    check("телефонна версія перемикається медіазапитом",
        /--banner-sm,var\(--banner-lg,none\)/.test(css));
    check("без картинки плитка не ламається",
        /background-image:var\(--banner-lg,none\)/.test(css));
}

console.log("\n[2c] «Новинки» й «Акції» без фото лишаються кольоровими");
{
    // Ці дві плитки історично малювались градієнтом. Тепер їм теж можна
    // вибрати фото — але поки не вибрали, має лишатись колір.
    //
    // Тому градієнт записаний ЗАПАСНИМ значенням у background-image:
    //   var(--banner-lg, linear-gradient(...))
    // Якби він стояв окремо в background-color, вибране фото перекрило б
    // його, а порожня змінна лишила б плитку голою.
    check("плитки позначені для JS",
        /class="search-promo-banner search-promo-new" data-banner="new"/.test(common)
        && /class="search-promo-banner search-promo-sale" data-banner="sale"/.test(common));

    check("градієнт «Новинок» — запасне значення змінної",
        /\.search-promo-new\{[\s\S]{0,140}background-image:var\(--banner-lg, linear-gradient/.test(css));
    check("градієнт «Акцій» теж",
        /\.search-promo-sale\{[\s\S]{0,140}background-image:var\(--banner-lg, linear-gradient/.test(css));

    // Загальне мобільне правило закінчується на none — без окремих
    // рядків ці дві плитки стали б на телефоні порожніми.
    check("на телефоні градієнт теж зберігається",
        /max-width:768px\)\{[\s\S]*?\.search-promo-new\{[\s\S]{0,180}linear-gradient/.test(css));

    // Порожній рядок має ПРИБИРАТИ змінну, а не ставити url('') —
    // інакше запасне значення не спрацює й плитка буде порожньою.
    check("порожнє значення прибирає змінну",
        /if \(value\) tile\.style\.setProperty[\s\S]{0,120}else tile\.style\.removeProperty\(name\)/
            .test(common));
}

console.log("\n[3] Файли банерів існують і мають потрібний розмір");
{
    // 800×400 — це 2:1 із запасом на retina: найширша плитка на
    // десктопі 348 CSS-пікселів, тобто 696 фізичних
    const expect = { width: 800, height: 400 };

    // Імена беремо З ДАНИХ, а не зашиваємо: файли перейменовувались
    // (search-men.webp → search-tile-men.webp), і жорсткий список
    // червонів би при кожній заміні картинки.
    const fromData = Object.values(JSON.parse(read("data/search-banners.json")))
        .flatMap(tile => [tile.desktop, tile.mobile])
        .filter(Boolean)
        .map(p => String(p).split("/").pop());

    fromData.forEach(name => {

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
    // Плитки пошуку скрипт БІЛЬШЕ НЕ ГЕНЕРУЄ.
    //
    // Раніше він збирав їх колажем із фото товарів. Тепер під них є
    // справжні знімки, які задаються в адмінці, — і якби завдання
    // лишилось, черговий `npm run banners` мовчки перезаписав би
    // готові картинки колажами.
    check("генератор не чіпає плитки пошуку",
        !/search-men\.webp|search-women\.webp|search-tile/.test(builder));
    check("мега-меню й фони головної генеруються далі",
        /width: 200, height: 200/.test(builder) && /home-hero/.test(builder));
    check("мега-меню теж збирається", /width: 200, height: 200/.test(builder));
    check("розділ без товарів не лишає порожній <img>",
        /без фото \(немає товарів/.test(builder));
}

console.log("\n[6] Плитки не розповзаються на телефоні");
{
    // .search-idle-main і .search-promo-banners мають flex:1 1 380px і
    // flex:1 1 320px — це писалося для РЯДКА, де basis означає ширину.
    // У медіазапиті напрямок міняється на column, і та сама basis стає
    // мінімальною ВИСОТОЮ, а flex-grow ще й розтягує блок. Через це між
    // плитками зʼявлялися пусті провали у пів екрана.
    const mobile = css.slice(css.indexOf("max-width:768px"));

    check("flex скинутий у колонковій розкладці",
        /\.search-idle-main,\s*\n\s*\.search-promo-banners\{\s*\n\s*flex:0 0 auto/.test(mobile));

    check("рядки сітки не розтягуються", /align-content:start/.test(mobile));

    // напрямок справді міняється — інакше перевірка вище безпредметна
    check("на телефоні розкладка колонкою",
        /\.search-idle\{[\s\S]{0,80}flex-direction:column/.test(mobile));
}

console.log("\n[7] Підпис не дублює текст на картинці");
{
    // Картинки під ці плитки часто вже містять напис («WOMEN», «SALE»).
    // Якщо поверх покласти ще й підпис сайту — на плитці два тексти.
    const { loadYaml } = require("./helpers/yaml");
    const entry = loadYaml("admin/config.yml").collections
        .find(c => c.name === "pages").files.find(f => f.name === "searchBanners");

    (entry.fields || []).forEach(tile => {

        const flag = (tile.fields || []).find(f => f.name === "hideLabel");

        check(`«${tile.label}»: є перемикач підпису`, !!flag);
        check(`«${tile.label}»: вимкнений за замовчуванням`,
            flag && flag.default === false);

    });

    check("сайт ховає підпис за прапорцем",
        /label\.hidden = !!entry\.hideLabel/.test(common));

    // Вибір лишається за адміністратором: у нього може бути й фото без
    // напису, і тоді підпис потрібен.
    check("прапорець необовʼязковий",
        (entry.fields || []).every(t =>
            (t.fields || []).find(f => f.name === "hideLabel")?.required === false));
}

console.log("\n[8] Скрипт не може затерти картинки з адмінки");
{
    // Це та сама пастка, що ледь не спрацювала: build-banners.js
    // генерував плитки пошуку колажем із товарів під тими самими
    // іменами файлів, які тепер займають справжні знімки. Один запуск
    // `npm run banners` — і картинки «самі повертались назад».
    const builder = read("scripts/build-banners.js");
    const data = JSON.parse(read("data/search-banners.json"));

    const used = Object.values(data)
        .flatMap(tile => [tile.desktop, tile.mobile])
        .filter(Boolean)
        .map(p => String(p).split("/").pop());

    const clashes = used.filter(name => builder.includes(name));

    check("жоден файл із адмінки не згадується в генераторі",
        clashes.length === 0, clashes.join(", "));

    // Імена мусять відрізнятись від тих, що були раніше: браузер
    // кешує картинку за адресою, і перезапис під тим самим іменем
    // показував людям стару версію (саме через це на dev плитки
    // «Новинки» й «Акції» оновились, а «Чоловікам» і «Жінкам» — ні:
    // у перших двох імена були новими).
    check("імена файлів не збігаються зі старими",
        !used.some(name => /^search-(men|women)(-sm)?\.webp$/.test(name)),
        used.join(", "));
}

console.log("\n[9] Плитки не наїжджають одна на одну");
{
    // aspect-ratio і min-height разом — це конфлікт. Ширина приходить
    // із колонки сітки (на телефоні ~160px), пропорція дає висоту 80px,
    // а min-height піднімає її до 104. Браузер може розвʼязати це,
    // ПЕРЕРАХУВАВШИ ШИРИНУ: 104 × 2 = 208px. Плитка вилазить за свою
    // колонку й лягає на сусідню — саме це й було видно на iPhone.
    const rule = (css.match(/\.search-promo-banner\{[\s\S]*?\n\}/) || [""])[0];

    check("пропорція задана", /aspect-ratio:2 \/ 1/.test(rule));
    check("нижня межа висоти теж", /min-height:104px/.test(rule));

    // Ширина мусить бути визначеною НАПЕРЕД — тоді пропорції лишається
    // порахувати лише висоту, і розсунути колонку вона не може.
    check("ширина задана явно", /width:100%/.test(rule), rule.slice(0, 60));
    check("вміст не розсуває колонку", /min-width:0/.test(rule));

    // 1fr за замовчуванням не вужчий за свій вміст: якщо плитка
    // вимагає більше місця, колонка розтягується, і сітка стає ширшою
    // за контейнер.
    const grid = (css.match(/\.search-promo-banners\{[\s\S]*?\n\}/) || [""])[0];

    check("колонки можуть стискатись",
        /minmax\(0, 1fr\) minmax\(0, 1fr\)/.test(grid), grid.slice(0, 120));
    check("між плитками є проміжок", /gap:14px/.test(grid));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
