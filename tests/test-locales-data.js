// Мовні версії, етап 3: переклад того, що пише власник в адмінці
// (товари, бренди, розділи, акції), і складених рядків.
//
// Як це влаштовано — scripts/build-locales.js, «ПЕРЕКЛАДИ З ДАНИХ»:
// поруч із полем лежить "i18n": { "en": {поле: …}, "ru": {…} }, і
// українське значення стає ключем словника. Тут — що ця схема не
// губить дорогою і що ядро (assets/js/i18n-core.js) не віддає
// мішанину мов там, де перекласти вдалось лише частину.
const fs = require("fs");
const path = require("path");
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

console.log("\n[1] Переклад поруч із полем → словник");
{
    const out = {};
    Locales.collectDataTranslations({
        title: "Сумка   Coach\nTabby",
        material: "Шкіра",
        i18n: { en: { title: "Coach Tabby bag", material: "" }, ru: { title: "Сумка Coach Tabby" } },
        variants: [{ description: "Опис варіанта", i18n: { en: { description: "Variant text" } } }]
    }, out);
    check("ключ — нормалізоване українське значення", out["Сумка Coach Tabby"] && out["Сумка Coach Tabby"].en === "Coach Tabby bag", JSON.stringify(out));
    check("обидві мови в одному записі", out["Сумка Coach Tabby"] && out["Сумка Coach Tabby"].ru === "Сумка Coach Tabby");
    check("порожній переклад не потрапляє (лишиться українською)", !out["Шкіра"]);
    check("вкладені об'єкти теж (варіанти товару)", out["Опис варіанта"] && out["Опис варіанта"].en === "Variant text");
}

console.log("\n[2] Багаторядковий опис: абзаци окремими ключами");
{
    // Опис бренду сторінка ділить на <p> за переносом — кожен абзац
    // окремий вузол, ключ на весь текст там не збігся б.
    const node = { description: "Перший абзац.\n\nДругий абзац.", i18n: { en: { description: "First.\n\nSecond." } } };
    const withLines = {};
    Locales.collectDataTranslations(node, withLines);
    check("абзаци — окремі ключі", withLines["Перший абзац."]?.en === "First." && withLines["Другий абзац."]?.en === "Second.", JSON.stringify(withLines));
    check("і цілий текст теж", withLines["Перший абзац. Другий абзац."]?.en === "First.\n\nSecond.");

    // Товарам — без абзаців: опис товару стоїть одним вузлом, а словник
    // для браузера качає кожна сторінка /en/.
    const noLines = {};
    Locales.collectDataTranslations(node, noLines, { lines: false });
    check("lines:false — лише цілий текст", Object.keys(noLines).length === 1, Object.keys(noLines).join(" | "));

    const mismatch = {};
    Locales.collectDataTranslations({ description: "Один.\nДва.", i18n: { en: { description: "One and two." } } }, mismatch);
    check("різна кількість абзаців — абзаців не вигадуємо", Object.keys(mismatch).length === 1);
}

console.log("\n[3] Заглушки з адмінки: {строк}, {дата}");
{
    const out = {};
    Locales.collectDataTranslations({
        withDays: "Якщо його купують, наступний веземо {строк}.",
        i18n: { en: { withDays: "If it sells, the next one arrives in {строк}." } }
    }, out);
    const key = "Якщо його купують, наступний веземо {*}.";
    check("у ключі заглушка стає {*}", out[key] !== undefined, Object.keys(out).join(" | "));
    check("у перекладі — {1}", out[key] && out[key].en === "If it sells, the next one arrives in {1}.", out[key] && out[key].en);
    const t = Core.createTranslator(Object.assign(out, { "{#}–{#} робочих днів": { en: "{#}–{#} business days" } }), "en");
    check("на сторінці (заглушку вже замінено) — перекладається",
        t("Якщо його купують, наступний веземо 10–14 робочих днів.") === "If it sells, the next one arrives in 10–14 business days.",
        t("Якщо його купують, наступний веземо 10–14 робочих днів."));
}

console.log("\n[4] Ядро: складені рядки — або все, або нічого");
{
    const dict = {
        "Бренди: {*}": { en: "Brands: {1}", ru: "Бренды: {1}" },
        "Категорії: {*}": { en: "Categories: {1}", ru: "Категории: {1}" },
        "{*} {*} у наявності та під замовлення": { en: "{1} {2} in stock and on pre-order", ru: "{1} {2} в наличии и под заказ" },
        "{*} у каталозі BestBrnd4u.": { en: "{1} in the BestBrnd4u catalog.", ru: "{1} в каталоге BestBrnd4u." },
        "{#} моделей": { en: "{#} {#:model|models}", ru: "{#} {#:модель|модели|моделей}" },
        "моделей": { en: "models", ru: "моделей" },
        "Ціни від {*} до {*}": { en: "Prices from {1} to {2}", ru: "Цены от {1} до {2}" },
        "Товари": { en: "Products", ru: "Товары" },
        "Сумки": { en: "Bags", ru: "Сумки" },
        "Гаманці": { en: "Wallets", ru: "Кошельки" },
        "Чорний": { en: "Black", ru: "Черный" },
        "жовтий": { en: "yellow", ru: "желтый" },
        "Купити": { en: "Buy", ru: "Купить" },
        "Дивитись усі товари": { en: "View all products", ru: "Смотреть все товары" }
    };
    const en = Core.createTranslator(dict, "en");
    const ru = Core.createTranslator(dict, "ru");

    const summary = "9 моделей у наявності та під замовлення. Ціни від 4 000 ₴ до 8 600 ₴. Бренди: Armani Exchange, Coach.";
    check("підсумок сторінки — за реченнями", en(summary) === "9 models in stock and on pre-order. Prices from 4 000 ₴ to 8 600 ₴. Brands: Armani Exchange, Coach.", en(summary));
    check("перелік через кому", en("Сумки, Гаманці") === "Bags, Wallets", en("Сумки, Гаманці"));
    check("ru: однакове слово («Сумки») — не вада перекладу", ru("Сумки, Гаманці") === "Сумки, Кошельки", ru("Сумки, Гаманці"));
    check("складений колір через « / »", en("Чорний / жовтий") === "Black / yellow", en("Чорний / жовтий"));
    check("«підпис: значення» (підказка групи кольорів)", en("Чорний: Чорний, Чорний / жовтий") === "Black: Black, Black / yellow", en("Чорний: Чорний, Чорний / жовтий"));
    check("кнопка картки «Купити: назва»", en("Купити: Coach Tabby") === "Buy: Coach Tabby", en("Купити: Coach Tabby"));
    check("стрілка в кінці", en("Дивитись усі товари →") === "View all products →", en("Дивитись усі товари →"));

    // Речення, з якого перекладено лише частину, лишається українським
    // ЦІЛКОМ: мішанину не прочитає ні людина, ні перекладач браузера.
    const half = "Сумки, які ми привозимо під замовлення.";
    check("en: речення з невідомою частиною — без змін", en(half) === half, en(half));
    const mixed = "Товари, що нещодавно зʼявились у каталозі BestBrnd4u.";
    check("ru: «що нещодавно зʼявились» (без і/ї/є/ґ) — теж не мішанина", ru(mixed) === mixed, ru(mixed));
    check("en: те саме", en(mixed) === mixed, en(mixed));
}

console.log("\n[5] Ядро: обрізаний опис (meta description)");
{
    const full = "Стильні повсякденні кросівки Lacoste L003 — сучасна модель із виразним спортивним дизайном, натхненним тенісною класикою.\nВерх із текстилю й шкіри, щільна підошва.";
    const dict = { [Core.normalize(full)]: { en: "Stylish everyday Lacoste L003 sneakers — a modern model with a bold athletic design inspired by tennis classics.\nTextile and leather upper, dense sole." } };
    const en = Core.createTranslator(dict, "en");
    // Обидва способи обрізати, що є на сайті: збірки (склеює пробіли)
    // і product.js (ріже як є). Обидва мусять перекластись.
    const cutBuild = Core.normalize(full).slice(0, 100).replace(/\s+\S*$/, "") + "…";
    const cutRuntime = full.slice(0, 100).replace(/\s+\S*$/, "") + "…";
    [["збірки", cutBuild], ["product.js", cutRuntime]].forEach(([who, cut]) => {
        const out = en(cut);
        check(`обрізка ${who}: перекладено`, !/[а-яіїєґ]/i.test(out), out);
        check(`обрізка ${who}: закінчується «…» і не довша за оригінал`, out.endsWith("…") && out.length <= cut.length + 1, `${out.length} / ${cut.length}`);
    });
    check("короткий рядок із «…» не шукається серед описів", en("Далі…") === "Далі…");
}

console.log("\n[6] Пари «тип × бренд»");
{
    const base = { "Чоловічі сумки": { en: "Men's bags", ru: "Мужские сумки" }, "Сумки": { en: "Bags", ru: "Сумки" } };
    const pairs = Locales.pairDictionary(base);
    check("«Чоловічі сумки Coach» → «Coach men's bags»", pairs["Чоловічі сумки Coach"] && pairs["Чоловічі сумки Coach"].en === "Coach men's bags", JSON.stringify(pairs["Чоловічі сумки Coach"]));
    check("ru: тип першим", pairs["Чоловічі сумки Coach"] && pairs["Чоловічі сумки Coach"].ru === "Мужские сумки Coach");
    check("розділ із категорії (у товарі його немає): «Сумки Coach»", pairs["Сумки Coach"] && pairs["Сумки Coach"].en === "Coach bags");
    check("лише пари, які є серед товарів", !pairs["Чоловічі сумки Gucci"]);
}

console.log("\n[7] Дані на сайті");
{
    const catalog = read("data/products.json");
    check("data/products.json без i18n (переклади — лише словником, не в кожному завантаженні каталогу)", !/"i18n"/.test(catalog));

    // Адмінка: поля перекладу ті самі, що збирає словник.
    const config = read("admin/config.yml");
    const block = (config.match(/name: "i18n"[\s\S]*?(?=\n {6}- label|\n {2}- name)/) || [""])[0];
    ["title", "description", "material", "dimensions", "strapInfo", "closure", "compartments", "decor", "composition", "preOrderDays"].forEach(field => {
        const count = (block.match(new RegExp(`name: "${field}"`, "g")) || []).length;
        check(`адмінка: поле перекладу ${field} — для en і ru`, count === 2, count);
    });

    // Стать у статичній сторінці товару — через «, », а не склеєний масив.
    const multi = fs.readdirSync(path.join(ROOT, "data/products")).map(f => JSON.parse(read("data/products/" + f)))
        .find(p => Array.isArray(p.gender) && p.gender.length > 1 && p.slug);
    if (multi) {
        const file = path.join(ROOT, "p", multi.slug, "index.html");
        if (fs.existsSync(file)) {
            const html = fs.readFileSync(file, "utf8");
            check(`p/${multi.slug}: стать через кому з пробілом`, html.includes(multi.gender.join(", ")) && !html.includes(multi.gender.join(",")), multi.gender.join(","));
        }
    }
}

console.log("\n[8] Зібрані /en/ і /ru/");
const built = fs.existsSync(path.join(ROOT, "en", "index.html"));
if (!built) {
    console.log("  · мовні теки не збудовано (прод без publish) — пропущено");
} else {
    // Заголовки вкладок і описи — те, що бачить пошук. Перекладено
    // мусить бути скрізь; виняток — лише те, що власник ще не переклав
    // (новий товар без полів перекладу), тож рахуємо частку, а не нуль.
    ["en", "ru"].forEach(lang => {
        const uk = lang === "en" ? /[а-яіїєґ]/i : /[іїєґ]/i;
        const pages = [];
        (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".html")) pages.push(f); }); })(path.join(ROOT, lang));
        let left = 0; const examples = [];
        pages.forEach(f => {
            const html = fs.readFileSync(f, "utf8");
            const title = (html.match(/<title>([^<]*)/) || [])[1] || "";
            if (uk.test(title)) { left++; examples.push(title.slice(0, 60)); }
        });
        check(`${lang}: заголовки вкладок перекладено (${pages.length - left}/${pages.length})`, left <= Math.ceil(pages.length * 0.05), examples.slice(0, 3).join(" | "));
    });

    const brand = new JSDOM(read("en/brands/coach/index.html")).window.document;
    const about = [...brand.querySelectorAll(".brand-about-text p, .brand-about p")].map(p => p.textContent.trim()).filter(Boolean);
    check("en: опис бренду Coach — англійською, по абзацах", about.length > 0 && about.every(p => !/[а-яіїєґ]/i.test(p)), about.find(p => /[а-яіїєґ]/i.test(p)));
}

console.log("\n[9] Речення, складені в коді з кількох рядків, перекладені цілими");
{
    // ЗНАЙДЕНО НА ПРОДІ 09.11.2026: банер cookie на /en/ і /ru/ показував
    // перше речення українською. У consent.js воно записане як
    //     "Ми використовуємо cookie … статистики" + " відвідувань, …"
    // На сторінку потрапляє ціле речення, а в словнику лежали шматки.
    // Так само ще 7 речень (підтвердження підписки, стан замовлення,
    // відгуки). Обхід сторінок їх не бачив: банер лише для нових
    // відвідувачів, решта — повідомлення про помилки.
    const dictFile = path.join(ROOT, "data/i18n-en.json");
    if (fs.existsSync(dictFile)) {
        const en = Core.createTranslator(JSON.parse(fs.readFileSync(dictFile, "utf8")), "en");
        const ru = Core.createTranslator(JSON.parse(fs.readFileSync(path.join(ROOT, "data/i18n-ru.json"), "utf8")), "ru");
        const LIT = String.raw`(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')`;
        const CHAIN = new RegExp(`${LIT}(?:\\s*\\+\\s*${LIT})+`, "g");
        const missing = [];
        let total = 0;
        fs.readdirSync(path.join(ROOT, "assets/js")).filter(f => f.endsWith(".js") && !/^i18n/.test(f)).forEach(f => {
            const src = read("assets/js/" + f).replace(/^\s*\/\/.*$/gm, "");
            for (const m of src.matchAll(CHAIN)) {
                let parts;
                try { parts = [...m[0].matchAll(new RegExp(LIT, "g"))].map(x => new Function("return " + x[0])()); }
                catch (error) { continue; }
                const text = Core.normalize(parts.join(""));
                // Шматки розмітки («" alt="…») — не речення, їх перекладає
                // обхід атрибутів уже на сторінці.
                if (!/[а-яіїєґ]/i.test(text) || /[<>{}"=]/.test(text)) continue;
                total += 1;
                const e = en(text), r = ru(text);
                if (e === text || /[а-яіїєґ]/i.test(e) || /[іїєґ]/i.test(r)) missing.push(`${f}: «${text.slice(0, 60)}»`);
            }
        });
        check(`усі ${total} складених речень є в словнику цілими (en і ru)`, total > 5 && missing.length === 0, missing.slice(0, 4).join(" | "));
    }
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
