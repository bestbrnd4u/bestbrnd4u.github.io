// Мовні версії сайту (/en/, /ru/) — каркас.
//
// Рішення власника 2026-11-06: окремі адреси для англійської й
// російської, українська — основна. Перемикач — випадним списком.
// Тут — кінцевий стан після повної збірки (scripts/build-locales.js)
// і правила ядра (assets/js/i18n-core.js), спільного для збірки й
// браузера.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const Core = require("../assets/js/i18n-core.js");
const Locales = require("../scripts/build-locales.js");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

console.log("\n[1] Ядро: переклад");
{
    const dict = {
        "Кошик": { en: "Cart", ru: "Корзина" },
        "Знайдено {#} товари": { en: "Found {#} {#:item|items}", ru: "Найдено {#} {#:товар|товара|товаров}" },
        "Знайдено {#} товарів": { en: "Found {#} {#:item|items}", ru: "Найдено {#} {#:товар|товара|товаров}" }
    };
    const en = Core.createTranslator(dict, "en");
    const ru = Core.createTranslator(dict, "ru");
    const uk = Core.createTranslator(dict, "uk");

    check("точний збіг", en("Кошик") === "Cart");
    check("пробіли довкола зберігаються", en("  Кошик\n") === "  Cart\n", JSON.stringify(en("  Кошик\n")));
    check("число й англійська множина", en("Знайдено 92 товари") === "Found 92 items", en("Знайдено 92 товари"));
    check("однина: 1 item", en("Знайдено 1 товари") === "Found 1 item");
    check("російські форми: 2 товара / 5 товаров / 21 товар",
        ru("Знайдено 2 товари") === "Найдено 2 товара" && ru("Знайдено 5 товарів") === "Найдено 5 товаров"
        && ru("Знайдено 21 товарів") === "Найдено 21 товар", [ru("Знайдено 2 товари"), ru("Знайдено 5 товарів"), ru("Знайдено 21 товарів")].join(" / "));
    check("11–14 — завжди «товаров»", ru("Знайдено 12 товари") === "Найдено 12 товаров", ru("Знайдено 12 товари"));
    check("частини заголовка через « | »", en("Кошик | BestBrnd4u") === "Cart | BestBrnd4u", en("Кошик | BestBrnd4u"));
    check("невідоме лишається як є (а не порожнім)", en("Щось нове") === "Щось нове");
    check("латиниця не чіпається", en("Coach") === "Coach");
    check("українська — без змін", uk("Кошик") === "Кошик");
}

console.log("\n[1b] Ядро: підстановки {*}");
{
    // Рядки з коду, складені з частин: ${назва}, ${сума}.
    const dict = {
        "Товар додано в кошик: {*}. Сума замовлення {*}.": { en: "Added to cart: {1}. Order total {2}.", ru: "Товар добавлен в корзину: {1}. Сумма заказа {2}." },
        "Знайдено {*} {*}": { en: "Found {1} {#:item|items}", ru: "Найдено {1} {#:товар|товара|товаров}" },
        "{*} {*}": { en: "ПАСТКА", ru: "ПАСТКА" },
        "Чоловічі сумки": { en: "Men's bags", ru: "Мужские сумки" },
        "У категорії {*}": { en: "In {1}", ru: "В категории {1}" },
        "Від {*} до {*}": { en: "To {2} from {1}", ru: "От {1} до {2}" }
    };
    const en = Core.createTranslator(dict, "en");
    const ru = Core.createTranslator(dict, "ru");

    // Назва латиницею й ціна без «грн» — підстановки, що не лишаються
    // українськими (українську назву правило нижче не пропустить).
    check("дві підстановки на місцях",
        en("Товар додано в кошик: Coach Studio 20. Сума замовлення 6 000.") === "Added to cart: Coach Studio 20. Order total 6 000.",
        en("Товар додано в кошик: Coach Studio 20. Сума замовлення 6 000."));
    check("форма слова за числом із підстановки", ru("Знайдено 92 товари") === "Найдено 92 товара" && en("Знайдено 1 товар") === "Found 1 item",
        ru("Знайдено 92 товари") + " / " + en("Знайдено 1 товар"));
    check("порядок підстановок можна міняти", en("Від 100 до 200") === "To 200 from 100", en("Від 100 до 200"));
    check("підставлене теж перекладається", en("У категорії Чоловічі сумки") === "In Men's bags", en("У категорії Чоловічі сумки"));
    // Ключ без власних слів «перекладав» би будь-який рядок із пробілом.
    check("«{*} {*}» не спрацьовує на чуже", en("Привіт світ") === "Привіт світ", en("Привіт світ"));
    check("has() бачить і шаблони", en.has("Знайдено 5 товарів") && !en.has("Привіт світ"));

    // Мішанина мов в одному реченні гірша за цілий український рядок.
    const mix = Core.createTranslator({ "Знижка {*}": { en: "Discount {1}", ru: "Скидка {1}" }, "Кошик": { en: "Cart", ru: "Корзина" } }, "en");
    check("шаблон не лишає українську підстановку («Discount стосується…»)",
        mix("Знижка стосується самої речі") === "Знижка стосується самої речі", mix("Знижка стосується самої речі"));
    check("а з перекладеною — спрацьовує", mix("Знижка Кошик") === "Discount Cart", mix("Знижка Кошик"));
    check("частини заголовка — або всі, або жодна",
        mix("Невідома назва — Кошик") === "Невідома назва — Кошик" && mix("Кошик | BestBrnd4u") === "Cart | BestBrnd4u",
        mix("Невідома назва — Кошик"));
    const mixRu = Core.createTranslator({ "Знижка {*}": { en: "Discount {1}", ru: "Скидка {1}" } }, "ru");
    check("російська: однакові слова («Каталог») — не мішанина", mixRu("Знижка Каталог") === "Скидка Каталог", mixRu("Знижка Каталог"));
}

console.log("\n[1c] Справжній словник: місця, де переклад уже ламався");
{
    const dict = JSON.parse(read("data/i18n/strings.json"));
    const en = Core.createTranslator(dict, "en");
    const ru = Core.createTranslator(dict, "ru");

    // Значок перед текстом — шаблон прив'язаний до початку рядка.
    check("🚚 + доставка з датою",
        en("🚚 Орієнтовно у відділенні 11–14 листопада") === "🚚 Estimated at the branch November 11–14",
        en("🚚 Орієнтовно у відділенні 11–14 листопада"));
    // Місяць — лише після ЧИСЕЛ: «{*} листопада» колись захопив увесь рядок.
    check("дата через межу місяця",
        ru("🚚 Орієнтовно у відділенні 30 листопада – 2 грудня") === "🚚 Ориентировочно в отделении 30 ноября – 2 декабря",
        ru("🚚 Орієнтовно у відділенні 30 листопада – 2 грудня"));
    check("підпис із двокрапкою: «Бренд:»", en("Бренд:") === "Brand:" && ru("Розміри:") === "Размеры:", en("Бренд:"));
    // ₴, а не «UAH»: у картці каталогу на 375px «14 300 UAH» обрізалось.
    check("ціна англійською — зі знаком ₴", en("14 300 грн") === "14 300 ₴", en("14 300 грн"));
    check("«Склад» на сторінці товару — Composition", en("Склад") === "Composition", en("Склад"));

    // <span>131</span><span>товар</span>: «товар» саме по собі — однина.
    check("131 товар → items", en.counted("131", "товар") === "items", en.counted("131", "товар"));
    check("1 товар → item", en.counted("1", "товар") === "item", en.counted("1", "товар"));
    check("2 товари → товара, 5 товарів → товаров",
        ru.counted("2", "товари") === "товара" && ru.counted("5", "товарів") === "товаров",
        ru.counted("2", "товари") + " / " + ru.counted("5", "товарів"));

    const { document } = new JSDOM('<p><span>131</span>\n<!-- слово окремим вузлом -->\n<span id="w">товар</span></p><p>Без <b id="x">числа</b></p>').window;
    check("число перед словом знаходиться крізь пробіли й коментар", Core.numberBefore(document.getElementById("w").firstChild) === "131");
    check("а там, де числа немає, — null", Core.numberBefore(document.getElementById("x").firstChild) === null);

    // Кнопки на кожній картці — їх губив перелік (лапки всередині ${…}).
    ["Купити", "В обране", "Замовити", "В наявності", "Пошук товарів..."].forEach(s =>
        check(`«${s}» у словнику`, Boolean(dict[s] && dict[s].en && dict[s].ru)));
}

console.log("\n[2] Ядро: адреси");
{
    check("мова з адреси", Core.langFromPath("/en/p/x/") === "en" && Core.langFromPath("/ru/") === "ru" && Core.langFromPath("/cart") === "uk");
    check("/en/cart → ru", Core.localizePath("/en/cart", "ru") === "/ru/cart");
    check("/ru/ → uk", Core.localizePath("/ru/", "uk") === "/");
    check("/ → en", Core.localizePath("/", "en") === "/en/");

    const cases = [
        ["catalog?gender=Жінкам", "/en/catalog?gender=Жінкам"],
        ["/p/x/", "/en/p/x/"],
        ["#top", "#top"],
        ["https://instagram.com/a", "https://instagram.com/a"],
        ["assets/a.css", "assets/a.css"],
        ["/data/x.json", "/data/x.json"],
        ["mailto:a@b.c", "mailto:a@b.c"],
        ["tel:+380", "tel:+380"],
        ["/en/cart", "/en/cart"],
        ["https://bestbrnd4u.com/cart", "/en/cart"]
    ];
    cases.forEach(([from, to]) => check(`${from} → ${to}`, Core.localizeHref(from, "en") === to, Core.localizeHref(from, "en")));
}

// Чи є мовні теки — залежить від середовища збірки. Решту перевіряємо,
// лише якщо їх збудовано (dev або publish).
const built = fs.existsSync(path.join(ROOT, "en/index.html"));

console.log("\n[3] Українські сторінки");
{
    const pages = Locales.pages();
    check(`сторінок знайдено — ${pages.length}`, pages.length > 100, pages.length);

    if (built) {
        const bad = [];
        pages.forEach(rel => {
            const html = read(rel);
            const own = Locales.urlPath(rel);
            const switches = (html.match(/<nav class="lang-switch"/g) || []).length;
            const hasHeader = /<div class="header-icons">/.test(html);
            const ownUk = new RegExp(`hreflang="uk" href="[^"]*${own.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(html);
            const ownEn = html.includes(`hreflang="en" href="`) && html.includes(Core.localizePath(own, "en") + '"');
            if (!ownUk || !ownEn) bad.push(rel + ": hreflang не на себе");
            else if (hasHeader && switches !== 1) bad.push(rel + ": перемикачів " + switches);
            else if (!/\/assets\/js\/i18n\.js/.test(html)) bad.push(rel + ": без i18n.js");
        });
        check("hreflang — на саму сторінку, перемикач один, скрипт є", bad.length === 0, bad.slice(0, 3).join(" | "));
    }
}

console.log("\n[4] Копії /en/ і /ru/");
if (!built) {
    console.log("  · мовні теки не збудовано (прод без publish) — пропущено");
} else {
    const sample = ["cart.html", "index.html", "catalog.html", "brands/coach/index.html"];
    const product = fs.readdirSync(path.join(ROOT, "p")).find(d => fs.existsSync(path.join(ROOT, "p", d, "index.html")) && !/[а-яіїєґ]/i.test(d));
    sample.push(`p/${product}/index.html`);

    ["en", "ru"].forEach(lang => {
        sample.forEach(rel => {
            const file = path.join(ROOT, lang, rel);
            if (!fs.existsSync(file)) { check(`${lang}/${rel} є`, false); return; }
            const { document } = new JSDOM(fs.readFileSync(file, "utf8")).window;
            const own = Locales.urlPath(rel);

            check(`${lang}/${rel}: lang="${lang}"`, document.documentElement.lang === lang);
            check(`${lang}/${rel}: <base href="/">`, document.querySelector("base")?.getAttribute("href") === "/");

            const canonical = document.querySelector('link[rel="canonical"]');
            if (canonical) check(`${lang}/${rel}: canonical на свою мову`, canonical.getAttribute("href").endsWith(Core.localizePath(own, lang)), canonical.getAttribute("href"));

            const leaked = [...document.querySelectorAll("a[href]")]
                .filter(a => !a.closest(".lang-switch"))
                .map(a => a.getAttribute("href"))
                .filter(h => Core.isPageHref(h) && !new RegExp(`^/${lang}(/|$)`).test(h) && !/^https?:/i.test(h));
            check(`${lang}/${rel}: усі посилання на сторінки — з /${lang}/`, leaked.length === 0, leaked.slice(0, 3).join(", "));

            const sw = document.querySelector("header .lang-switch");
            const current = sw && sw.querySelector("[aria-current]");
            check(`${lang}/${rel}: перемикач — поточна мова ${lang}`, current && current.getAttribute("lang") === lang);
            const toUk = sw && sw.querySelector('a[hreflang="uk"]');
            check(`${lang}/${rel}: «Українська» веде на ${own}`, toUk && toUk.getAttribute("href") === own, toUk && toUk.getAttribute("href"));

            check(`${lang}/${rel}: <details> — список, а не ряд кнопок`, Boolean(sw && sw.querySelector("details summary") && sw.querySelector("details ul")));
        });

        // Шапка й меню перекладені — без цього каркас не працює взагалі.
        const cart = new JSDOM(fs.readFileSync(path.join(ROOT, lang, "cart.html"), "utf8")).window.document;
        const navText = [...cart.querySelectorAll("header nav > ul > li > a")].map(a => a.textContent.trim());
        check(`${lang}: меню перекладено`, navText.length > 3 && !navText.some(t => /Головна|Контакти/.test(t)), navText.join(", "));
    });

    // Юридичні — українські з поміткою.
    Locales.LEGAL.forEach(rel => {
        if (!fs.existsSync(path.join(ROOT, rel))) return;
        const html = fs.readFileSync(path.join(ROOT, "en", rel), "utf8");
        check(`en/${rel}: помітка про чинну українську версію`, /class="legal-lang-note"/.test(html) && /legally binding/.test(html));
    });
}

console.log("\n[5] Повторна збірка нічого не змінює");
{
    const rel = "cart.html";
    const html = read(rel);
    const once = Locales.decorateUk(rel, Locales.stripInserts(html), true);
    const twice = Locales.decorateUk(rel, once, true);
    check("вставки в українську сторінку ідемпотентні", once === twice);
    check("рівно один блок hreflang", (twice.match(/<!-- i18n:begin -->/g) || []).length === 1);
    // Сама функція, а не вже зібраний файл: інакше зламаний генератор
    // пройшов би на старих сторінках з попередньої збірки.
    check("перемикач вставлено — рівно один, у групі значків",
        (once.match(/<nav class="lang-switch"/g) || []).length === 1
        && /<div class="header-icons">\s*<nav class="lang-switch"/.test(once));
    const off = Locales.decorateUk(rel, twice, false);
    check("вимкнено — вставок немає зовсім", !/i18n:begin|lang-switch/.test(off));
}

console.log("\n[6] Запобіжник: прод без publish — мовних версій немає");
{
    // Окрема копія, щоб не чіпати робоче дерево: копіюємо скрипти й
    // кілька сторінок у тимчасову теку і запускаємо там як прод.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "locales-"));
    try {
        fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });
        fs.mkdirSync(path.join(tmp, "assets/js"), { recursive: true });
        fs.mkdirSync(path.join(tmp, "data/i18n"), { recursive: true });
        ["build-locales.js", "site-env.js"].forEach(f => fs.copyFileSync(path.join(ROOT, "scripts", f), path.join(tmp, "scripts", f)));
        fs.copyFileSync(path.join(ROOT, "assets/js/i18n-core.js"), path.join(tmp, "assets/js/i18n-core.js"));
        ["site.config.json"].forEach(f => { if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f)); });
        fs.writeFileSync(path.join(tmp, "data/i18n/config.json"), '{ "publish": false }');
        fs.writeFileSync(path.join(tmp, "data/i18n/strings.json"), "{}");
        fs.writeFileSync(path.join(tmp, "cart.html"), read("cart.html"));
        fs.mkdirSync(path.join(tmp, "en"), { recursive: true });
        fs.writeFileSync(path.join(tmp, "en", "stale.html"), "стара копія");

        // jsdom — з node_modules проєкту: у тимчасовій теці їх немає.
        const env = { ...process.env, SITE_ENV: "production", NODE_PATH: path.join(ROOT, "node_modules") };
        let out = "";
        try { out = execFileSync("node", ["scripts/build-locales.js"], { cwd: tmp, env, encoding: "utf8" }); }
        catch (e) { out = (e.stdout || "") + (e.stderr || ""); }

        check("скрипт відпрацював", /вимкнено/.test(out), out.slice(0, 160));
        check("теку en/ прибрано", !fs.existsSync(path.join(tmp, "en")));
        const cart = fs.readFileSync(path.join(tmp, "cart.html"), "utf8");
        check("з української сторінки прибрано перемикач і hreflang", !/lang-switch|i18n:begin/.test(cart));
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

console.log("\n[7] Збірка знає про мовні версії");
{
    const pkg = JSON.parse(read("package.json"));
    const steps = pkg.scripts.build.split("&&").map(s => s.trim());
    const at = name => steps.findIndex(s => s.includes(name));
    check("build-locales у збірці", at("build-locales") !== -1);
    // Після всього, що пише сторінки, і ДО версій файлів — щоб мовні
    // копії теж отримали ?v=.
    check("після apply-season і build-breadcrumb-schema", at("build-locales") > at("apply-season") && at("build-locales") > at("build-breadcrumb-schema"));
    check("перед apply-cache-version", at("build-locales") < at("apply-cache-version"));

    const config = JSON.parse(read("data/i18n/config.json"));
    check("публікація на прод поки вимкнена (переклад не готовий)", config.publish === false, JSON.stringify(config));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
