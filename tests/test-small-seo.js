// Три дрібниці, яких бракувало: фото в sitemap, llms.txt і живий
// телефон у розмітці.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ФОТО ТОВАРІВ ЗАЯВЛЕНІ. Галерея малюється скриптом: у статичній
//    сторінці немає ані одного <img> із фото товару. Тобто sitemap —
//    єдиний надійний шлях, яким Google Images про них дізнається.
//
// 2. ОДНА АДРЕСА НА ОДНУ КАРТИНКУ. У даних кольору фото лежать із
//    відбитком кеша (…webp?v=d024…), у JSON-LD — без нього. Дві форми
//    однієї картинки Google вважав би різними файлами.
//
// 3. llms.txt НЕ ВІДСТАЄ ВІД САЙТУ. Бренди й категорії з'являються в
//    адмінці; написаний руками файл почав би обіцяти моделям те, чого
//    немає.
//
// 4. ТЕЛЕФОН У РОЗМІТЦІ СПРАВЖНІЙ. Стояла заглушка
//    tel:+380000000000, а працювало це лише завдяки скрипту, який
//    будує href із видимого тексту. HTML читають і без JS.
//
// 5. НОМЕР ЖИВЕ В ДАНИХ. Раніше він лежав у розмітці 149 сторінок, а
//    поле «телефон» в адмінці керувало однією.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const sitemapSrc = read("scripts/build-sitemap.js");
const legalSrc = read("scripts/build-legal.js");
const legal = JSON.parse(read("data/legal.json"));

console.log("\n[1] Фото товарів у sitemap");
{
    const sitemap = require("../scripts/build-sitemap.js");

    check("простір імен для фото оголошений",
        /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/.test(sitemapSrc));

    // Без простору імен теги image:* — просто невідома розмітка, і
    // Google мовчки пропустить усі фото.
    check("і саме в urlset", /<urlset xmlns="http[^"]*sitemap\/0\.9"/.test(sitemapSrc));

    const entry = sitemap.urlEntry("https://x/p/y/", "weekly", "0.8",
        [{ loc: "https://x/a.webp", title: "Бренд Назва" }]);

    check("фото потрапляє в запис", /<image:image>/.test(entry) && /<image:loc>https:\/\/x\/a\.webp<\/image:loc>/.test(entry));
    check("підпис теж", /<image:title>Бренд Назва<\/image:title>/.test(entry));

    // Порожній тег гірший за відсутній.
    const noTitle = sitemap.urlEntry("https://x/p/y/", "weekly", "0.8",
        [{ loc: "https://x/a.webp", title: "" }]);

    check("порожнього підпису не буває", !/<image:title>/.test(noTitle));

    // Сторінки без фото лишаються як були.
    check("сторінка без фото не отримує порожніх тегів",
        !/image:/.test(sitemap.urlEntry("https://x/catalog", "daily", "0.9")));

    check("є межа на кількість фото",
        Number.isInteger(sitemap.MAX_IMAGES) && sitemap.MAX_IMAGES > 0,
        sitemap.MAX_IMAGES);

    // Модуль не має писати файл при читанні: sitemap.xml перезбирає
    // CI, і require() із тесту не повинен його чіпати.
    check("модуль читається без запису", /require\.main === module/.test(sitemapSrc));
}

console.log("\n[2] Одна адреса на одну картинку");
{
    const sitemap = require("../scripts/build-sitemap.js");

    const product = {
        images: ["assets/images/a.webp", "/assets/images/b.webp"],
        variants: [
            { color: "Чорний", images: ["assets/images/a.webp?v=123", "assets/images/c.webp?v=456"] },
            { color: "Білий", images: [] },
            null
        ]
    };

    const list = sitemap.productImages(product, "https://shop.test");

    check("відбиток кеша прибраний", !list.some(url => url.includes("?v=")),
        list.join(", "));

    check("однакові фото не дублюються", new Set(list).size === list.length,
        list.join(", "));

    check("адреси абсолютні", list.every(url => url.startsWith("https://shop.test/")),
        list.join(", "));

    // «assets/…» і «/assets/…» — обидві форми трапляються в даних.
    check("обидві форми шляху дають одну адресу",
        list.includes("https://shop.test/assets/images/a.webp")
        && list.includes("https://shop.test/assets/images/b.webp"));

    check("фото кольорів теж заявлені",
        list.includes("https://shop.test/assets/images/c.webp"));

    check("порожній товар не ламає добір",
        sitemap.productImages({}, "https://shop.test").length === 0);

    check("більше межі не віддає",
        sitemap.productImages(
            { images: Array.from({ length: 20 }, (v, i) => `assets/${i}.webp`) },
            "https://shop.test"
        ).length === sitemap.MAX_IMAGES);

    // Абсолютні адреси будує той самий помічник, що й фід: друга
    // реалізація цього правила колись розійшлася б із першою.
    check("помічник спільний із фідом", /require\("\.\/build-feed"\)/.test(sitemapSrc));
}

console.log("\n[3] Готовий sitemap несе фото");
{
    // Файл згенерований, тож перевіряємо не вміст рядків, а те, що
    // збірка не зламала розмітку: битий sitemap гірший за відсутній.
    const xml = read("sitemap.xml");

    const images = (xml.match(/<image:image>/g) || []).length;
    const closed = (xml.match(/<\/image:image>/g) || []).length;

    check(`фото в sitemap: ${images}`, images > 0);
    check("усі теги закриті", images === closed, `${images} проти ${closed}`);

    const locs = [...xml.matchAll(/<image:loc>([^<]*)<\/image:loc>/g)].map(m => m[1]);

    check("кожне фото має адресу", locs.length === images);

    check("усі адреси абсолютні", locs.every(url => /^https?:\/\//.test(url)),
        locs.filter(url => !/^https?:\/\//.test(url)).slice(0, 3).join(", "));

    check("жодного відбитка кеша", !locs.some(url => url.includes("?v=")));

    // Фото мусять вести на той самий домен, що й сторінки.
    const host = (xml.match(/<loc>(https?:\/\/[^/]+)/) || [])[1];

    check(`фото з того ж домену (${host})`,
        Boolean(host) && locs.every(url => url.startsWith(host)),
        locs.filter(url => host && !url.startsWith(host)).slice(0, 2).join(", "));
}

console.log("\n[4] llms.txt");
{
    const llms = require("../scripts/build-llms.js");

    check("файл існує", fs.existsSync(path.join(ROOT, "llms.txt")));

    const text = read("llms.txt");

    check("починається з назви магазину", /^# BestBrnd4u/.test(text));

    // За форматом llms.txt суть іде цитатою одразу під заголовком.
    check("є коротка суть цитатою", /^> .{40,}/m.test(text));

    // ЧОМУ УМОВИ ПЕРШИМИ. Модель питають не «покажи каталог», а
    // «скільки йде доставка» і «чи можна повернути».
    check("умови стоять до каталогу",
        text.indexOf("## Умови") > 0 && text.indexOf("## Умови") < text.indexOf("## Каталог"));

    ["delivery-payment", "return-warranty", "offer", "privacy-policy",
        "order-status", "contacts", "catalog", "feed.xml", "sitemap.xml"]
        .forEach(page => {
            check(`веде на ${page}`, text.includes(page));
        });

    check("бренди перелічені", /### Бренди/.test(text));
    check("категорії перелічені", /### Категорії/.test(text));

    // Модель, яку не попередили, охоче вигадає «безкоштовну доставку
    // від 3500» — бо так у дев'яти магазинах із десяти.
    check("сказано, чого на сайті немає", /## Чого на сайті немає/.test(text));

    check("зокрема про безкоштовну доставку", /Безкоштовної доставки[^\n]*немає/.test(text));

    check("і про оплату частинами", /частинами[^\n]*немає/i.test(text));

    // Тут легко збрехати в обидві сторони: карта на сторінці
    // оформлення Є, а платіжного шлюзу немає.
    check("про оплату сказано точно",
        /Онлайн-форми оплати на сайті немає/.test(text)
        && !/карткою не можна/i.test(text));

    // Адреси мусять бути того самого середовища, що й решта збірки.
    const host = (read("sitemap.xml").match(/<loc>(https?:\/\/[^/]+)/) || [])[1];

    const foreign = [...text.matchAll(/\]\((https?:\/\/[^/)]+)/g)]
        .map(m => m[1])
        .filter(url => url !== host);

    check(`усі посилання на ${host}`, foreign.length === 0, [...new Set(foreign)].join(", "));

    // Файл генерується — інакше він відстане від сайту на першому ж
    // новому бренді.
    const pkg = JSON.parse(read("package.json"));

    check("build-llms.js входить у збірку", pkg.scripts.build.includes("build-llms.js"));

    check("домен береться з site.config.json",
        /require\("\.\/site-env"\)/.test(read("scripts/build-llms.js")));

    // Перелік не має розпухати: сотня посилань витісняє з уваги
    // умови доставки.
    check("є межа на кількість посилань",
        Number.isInteger(llms.MAX_LINKS) && llms.MAX_LINKS > 0, llms.MAX_LINKS);
}

console.log("\n[5] Телефон у розмітці справжній");
{
    const build = require("../scripts/build-legal.js");

    const pages = build.htmlPages(ROOT);

    const withPhone = pages.filter(file => fs.readFileSync(file, "utf8").includes("phone-link"));

    check(`сторінок із телефоном: ${withPhone.length}`, withPhone.length > 0);

    // ГОЛОВНА ПЕРЕВІРКА: заглушки не лишилось ніде.
    const stub = withPhone.filter(file =>
        fs.readFileSync(file, "utf8").includes("tel:+380000000000"));

    check("заглушки tel:+380000000000 більше немає",
        stub.length === 0,
        stub.slice(0, 3).map(f => path.relative(ROOT, f)).join(", "));

    const href = build.telHref(legal.phone);

    const wrong = withPhone.filter(file =>
        !fs.readFileSync(file, "utf8").includes(`href="tel:${href}"`));

    check(`у розмітці справжній номер (${href})`,
        wrong.length === 0,
        wrong.slice(0, 3).map(f => path.relative(ROOT, f)).join(", "));

    // Видимий текст теж із даних — інакше поле в адмінці керувало б
    // однією сторінкою з 149.
    const badText = withPhone.filter(file =>
        !fs.readFileSync(file, "utf8").includes(`>${legal.phone}</a>`));

    check("видимий номер той самий, що в data/legal.json",
        badText.length === 0,
        badText.slice(0, 3).map(f => path.relative(ROOT, f)).join(", "));

    // Згенерованим сторінкам він теж потрібен: їх 170 із 223.
    check("сторінки товарів теж полагоджені",
        withPhone.some(file => path.relative(ROOT, file).startsWith("p" + path.sep)));
}

console.log("\n[6] Правка живе у збірці, а не руками");
{
    const build = require("../scripts/build-legal.js");

    const src = '<a class="phone-link" href="tel:+380000000000">+380 00 000 00 00</a>';

    check("заглушка замінюється",
        build.syncPhoneLinks(src, "+380 73 728 82 91")
        === '<a class="phone-link" href="tel:+380737288291">+380 73 728 82 91</a>');

    // Порожнє поле не має стирати номер із усього сайту: порожній
    // підвал гірший за підстаркуватий номер.
    check("порожнє поле нічого не чіпає", build.syncPhoneLinks(src, "") === src);
    check("недописаний номер теж", build.syncPhoneLinks(src, "+380 73") === src);

    check("новий номер підхоплюється",
        /tel:\+380501112233/.test(build.syncPhoneLinks(src, "+380 (50) 111-22-33")));

    // Обхід не має заходити в робочі копії репозиторію: це ті самі
    // файли вдруге.
    const walker = read("scripts/build-legal.js");

    check("робочі копії пропускаються", /\.claude/.test(walker));
    check("node_modules теж", /node_modules/.test(walker));

    check("крок входить у збірку",
        JSON.parse(read("package.json")).scripts.build.includes("build-legal.js"));

    // Скрипт у браузері лишається — сторінка не має залежати від
    // того, чи відпрацював крок збірки.
    check("сторінка все одно синхронізує href сама",
        /function syncPhoneLinks/.test(read("assets/js/common.js")));

    check("і той самий поріг у 10 цифр",
        /length < 10/.test(read("assets/js/common.js"))
        && /length < 10/.test(legalSrc));
}

console.log("\n[7] Маніфест застосунку");
{
    // ЧОГО БРАКУВАЛО. theme-color, favicon і apple-touch-icon на
    // сторінках були, а самого маніфесту — ні. Тобто «Додати на
    // головний екран» давало ярлик без назви й без нормальної іконки,
    // а Android не пропонував встановлення взагалі.
    check("файл є", fs.existsSync(path.join(ROOT, "site.webmanifest")));

    const manifest = JSON.parse(read("site.webmanifest"));

    check("назва є", Boolean(manifest.name && manifest.short_name));

    // Довга назва не влазить під іконкою — Android бере short_name.
    check("коротка назва справді коротка",
        manifest.short_name.length <= 12, manifest.short_name);

    check("мова вказана", manifest.lang === "uk");

    // Колір мусить збігатися з <meta name="theme-color"> на
    // сторінках: інакше смуга браузера мигає при завантаженні.
    const home = read("index.html");
    const themeColor = (home.match(/name="theme-color" content="([^"]+)"/) || [])[1];

    check("колір теми той самий, що в розмітці",
        manifest.theme_color === themeColor,
        `${manifest.theme_color} проти ${themeColor}`);

    // Іконки мусять існувати й мати заявлений розмір: Android мовчки
    // відкидає маніфест, у якому жодна іконка не завантажилась.
    const iconProblems = manifest.icons.filter(icon => {

        const file = path.join(ROOT, icon.src.replace(/^\//, ""));

        if (!fs.existsSync(file)) return true;

        // Ширина й висота PNG лежать у IHDR, байти 16..23.
        const bytes = fs.readFileSync(file);

        return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` !== icon.sizes;

    });

    check("іконки на місці й потрібного розміру",
        iconProblems.length === 0,
        iconProblems.map(i => i.src).join(", "));

    check("є 192 і 512 — обидва обов'язкові для встановлення",
        manifest.icons.some(i => i.sizes === "192x192")
        && manifest.icons.some(i => i.sizes === "512x512"));

    // standalone ховає адресний рядок. Сервісного працівника в сайту
    // немає, тож офлайн людина отримала б порожню помилку у вікні без
    // жодної кнопки. minimal-ui лишає рядок і перезавантаження.
    check("вікно з адресним рядком, бо офлайн-режиму немає",
        manifest.display === "minimal-ui", manifest.display);

    // Посилання — на КОЖНІЙ сторінці: встановлюють сайт не тільки з
    // головної.
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const without = pages.filter(f => !/rel="manifest"/.test(read(f)));

    check(`посилання на всіх ${pages.length} сторінках`,
        without.length === 0, without.join(", "));

    // Адреса АБСОЛЮТНА: сторінки в теках (p/, brands/) живуть із
    // <base href="/">, і відносний шлях указував би не туди.
    check("адреса абсолютна",
        /rel="manifest" href="\/site\.webmanifest"/.test(home));

    check("і в згенерованій сторінці товару теж",
        /rel="manifest" href="\/site\.webmanifest"/.test(
            read("p/michael-kors-rose-small-top-handle-quilted-crossbody-bag/index.html")));
}

console.log("\n[8] Картинка прев'ю посилань");
{
    // ЩО БУЛО НЕ ТАК. В og:image стояв банер головної (2400×1080), і в
    // Telegram посилання на магазин виглядало як назва, опис і
    // крихітний квадратик праворуч із випадковим світлим шматком того
    // банера.
    //
    // Месенджери ріжуть картинку під СВІЙ формат: Telegram бере
    // квадрат, Facebook — 1.91:1. Широкий банер після квадратного
    // обрізання перетворюється на фрагмент.
    const cover = "assets/images/og-cover.png";

    check("обкладинка є", fs.existsSync(path.join(ROOT, cover)));

    const bytes = fs.readFileSync(path.join(ROOT, cover));

    // Ширина й висота PNG лежать у IHDR, байти 16..23.
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);

    check("розмір 1200×630 — той, що просять Facebook і Twitter",
        width === 1200 && height === 630, `${width}×${height}`);

    // ГОЛОВНА ВЛАСТИВІСТЬ: логотип мусить уміщатись у ЦЕНТРАЛЬНИЙ
    // КВАДРАТ. Саме його бере Telegram, і саме через це попередня
    // картинка й не працювала. Перевіряємо не константи скрипта, а
    // сам файл: шукаємо межі всього, що не тло.
    // Окремим процесом: sharp асинхронний, а тест — звичайний
    // послідовний скрипт. Переписувати весь набір під async заради
    // одного заміру не варто.
    const probe = require("child_process").spawnSync(process.execPath, ["-e", `
        const sharp = require(${JSON.stringify(require.resolve("sharp"))});
        sharp(${JSON.stringify(path.join(ROOT, cover))})
            .raw().toBuffer({ resolveWithObject: true })
            .then(({ data, info }) => {
                // Тло — колір лівого верхнього кута.
                const bg = [data[0], data[1], data[2]];
                let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
                for (let y = 0; y < info.height; y++) {
                    for (let x = 0; x < info.width; x++) {
                        const i = (y * info.width + x) * info.channels;
                        // Поріг 12: у тла й краю логотипа є згладжування.
                        if (Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1])
                            + Math.abs(data[i + 2] - bg[2]) <= 12) continue;
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
                console.log(JSON.stringify({ minX, minY, maxX, maxY }));
            });
    `], { encoding: "utf8" });

    const box = JSON.parse((probe.stdout || "{}").trim() || "{}");

    check("на картинці є що показати", box.maxX > 0, probe.stderr);

    if (box.maxX > 0) {

        const squareLeft = (width - height) / 2;
        const squareRight = squareLeft + height;

        check("логотип уміщається в центральний квадрат — той, що бере Telegram",
            box.minX >= squareLeft && box.maxX <= squareRight,
            `логотип ${box.minX}…${box.maxX}, квадрат ${squareLeft}…${squareRight}`);

        // Впритул до краю ставити не можна: кожен месенджер ріже
        // трохи по-своєму, і край першим і зникне.
        check("є поля з усіх боків",
            box.minY > 20 && box.maxY < height - 20,
            `по вертикалі ${box.minY}…${box.maxY} з ${height}`);

    }

    // Це та сама «B», що у вкладці браузера й на іконці застосунку.
    check("зібрана з тієї самої іконки",
        /favicon-512\.png/.test(read("scripts/build-og-cover.js")));

    // Головна мусить показувати саме її, а не банер.
    const home = read("index.html");

    check("головна показує обкладинку",
        /og:image" content="[^"]*\/assets\/images\/og-cover\.png"/.test(home));

    check("банер героя в прев'ю більше не їде",
        !/og:image" content="[^"]*banners\//.test(home));

    // Збірка головної раніше підставляла сюди фото з data/home.json —
    // тобто повернула б банер на місце при наступному запуску.
    check("збірка головної теж ставить обкладинку",
        /og:image" content="\)([^)]*)\n?[\s\S]{0,120}og-cover\.png/
            .test(read("scripts/build-home-static.js")));

    // Розміри в тегах мусять збігатися зі справжніми: Facebook бере їх
    // на віру й малює рамку ще до завантаження файлу.
    check("розміри в тегах збігаються з файлом",
        new RegExp(`og:image:width" content="${width}"`).test(home)
        && new RegExp(`og:image:height" content="${height}"`).test(home));

    // Сторінка з тегами прев'ю, але без картинки, показується самим
    // текстом — а це рівно те, з чого все почалось.
    const pagesWithOg = fs.readdirSync(ROOT)
        .filter(f => f.endsWith(".html"))
        .filter(f => /property="og:/.test(read(f)));

    const withoutImage = pagesWithOg.filter(f => !/og:image/.test(read(f)));

    check(`усі ${pagesWithOg.length} сторінок із тегами прев'ю мають картинку`,
        withoutImage.length === 0, withoutImage.join(", "));
}

console.log(failures === 0
    ? "\n✅ Фото заявлені, llms.txt свіжий, телефон справжній, маніфест і прев'ю на місці\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
