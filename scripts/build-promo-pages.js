// Збирає promo/<slug>/index.html — по сторінці на кожну акцію.
//
// НАВІЩО
// -------
// Акція жила за адресою /promo?id=<slug>. Один файл promo.html на всі
// акції, а назву, опис і картинку дописував скрипт уже в браузері.
//
// Для Google це працювало: він виконує JavaScript і бачив правильні
// теги. А павук месенджера — НІ. Власник кидає посилання на акцію в
// Instagram чи Telegram, і в картці стоїть:
//
//     og:title        Акції | BestBrnd4u
//     og:description  Акції та знижки BestBrnd4u
//     og:url          немає зовсім
//
// Тобто найгірше місце з усіх: посилання на акцію живе саме в
// соцмережах, і саме там воно виглядало як безлике «Акції».
//
// Заміряно 07.10.2026 curl-ом на проді, усі чотири адреси з sitemap.
//
// ЩО РОБИТЬ ЦЕЙ СКРИПТ
// ---------------------
// Той самий прийом, що й scripts/build-taxonomy-pages.js для брендів
// і категорій: бере promo.html як ШАБЛОН і пише з нього окрему
// сторінку на кожну акцію — зі своїм <title>, описом, og-тегами,
// canonical і заголовком у розмітці.
//
// Текст беремо не звідси, а з assets/js/promo-meta.js — того самого
// модуля, яким користується promo.js у браузері. Дві копії правила
// розійшлись би на першій же акції без title.
//
// СТАРІ АДРЕСИ ЛИШАЮТЬСЯ РОБОЧИМИ
// --------------------------------
// /promo?id=<slug> нікуди не дівається: ці посилання вже розійшлись
// по сторіс і в листуванні. Сторінка promo.html читає ?id як і
// раніше, але canonical тепер веде на /promo/<slug>/ — щоб дві адреси
// на один вміст указували на одну.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { SITE_URL } = require("./site-env");
const PromoMeta = require("../assets/js/promo-meta.js");

const TEMPLATE_FILE = path.join(ROOT, "promo.html");
const PROMOTIONS_FILE = path.join(ROOT, "data", "promotions.json");
const OUT_DIR = path.join(ROOT, "promo");

// Акція, що вже скінчилась, сторінки не отримує: посилання на неї
// веде в нікуди, і тримати її в індексі немає сенсу. Те саме правило,
// що в build-sitemap.js.
function ended(promo) {

    if (!promo || !promo.endsAt) return false;

    const end = new Date(promo.endsAt);

    if (Number.isNaN(end.getTime())) return false;

    return end.getTime() < Date.now();

}

function activePromos() {

    if (!fs.existsSync(PROMOTIONS_FILE)) return [];

    let list;

    try {
        list = JSON.parse(fs.readFileSync(PROMOTIONS_FILE, "utf8"));
    } catch (error) {
        throw new Error("data/promotions.json не читається: " + error.message);
    }

    if (!Array.isArray(list)) list = list.promotions || [];

    return list.filter(promo => promo && promo.slug
        && promo.active !== false && !ended(promo));

}

// Адреси сторінок — для sitemap. Свій список там означав би, що
// sitemap колись почне обіцяти сторінки, яких немає.
function promoPages() {

    return activePromos().map(promo => ({
        slug: promo.slug,
        url: SITE_URL + PromoMeta.promoPath(promo.slug)
    }));

}

const HEAD_SLOT = "<!--PROMO_HEAD-->";
const TITLE_SLOT = '<h1 id="promoHeroTitle"></h1>';

const escapeAttr = text => String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escapeText = text => String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Картинка для прев'ю — від ШИРОКОГО банера сторінки акції, а не від
// тизера з головної: саме таке фото соцмережі покажуть у картці. Те
// саме правило, що в promo.js.
function promoImage(promo) {

    const src = promo.promoPageImage || promo.image || "/assets/images/og-cover.png";

    if (/^https?:/i.test(src)) return src;

    return SITE_URL + (src.startsWith("/") ? src : "/" + src);

}

function buildTemplate() {

    let html = fs.readFileSync(TEMPLATE_FILE, "utf8");

    // <base> одразу після <head>, ДО будь-яких href/src: сторінка
    // лежить у /promo/<slug>/, а скрипти будують шляхи від кореня.
    // Без нього "data/promotions.json" перетворився б на
    // /promo/<slug>/data/promotions.json.
    html = html.replace(
        /<head>/i,
        '<head>\n\n<!-- Сторінка лежить у /promo/<slug>/, а скрипти будують шляхи\n'
        + '     як з кореня ("data/promotions.json"). Без <base> вони\n'
        + '     перетворились би на /promo/<slug>/data/…\n'
        + '     Файл згенеровано: scripts/build-promo-pages.js -->\n'
        + '<base href="/">'
    );

    // Теги шаблону геть — на їхнє місце стане власний набір акції.
    // Якщо лишити, павук візьме ПЕРШИЙ збіг, тобто загальний.
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, HEAD_SLOT);
    html = html.replace(/\n?\s*<meta name="description"[^>]*>/i, "");
    html = html.replace(/\n?\s*<link rel="canonical"[^>]*>/i, "");
    html = html.replace(/\n?\s*<meta property="og:(?:type|title|description|image|url)"[^>]*>/gi, "");

    if (!html.includes(HEAD_SLOT)) {
        throw new Error("У promo.html не знайдено <title> — шаблон змінився");
    }

    if (!html.includes(TITLE_SLOT)) {
        throw new Error('У promo.html не знайдено порожній <h1 id="promoHeroTitle">');
    }

    return html;

}

function headFor(promo) {

    const title = PromoMeta.promoTitle(promo);
    const description = PromoMeta.promoDescription(promo);
    const url = SITE_URL + PromoMeta.promoPath(promo.slug);

    return [
        // id="pageTitle" зберігаємо: promo.js пише в нього назву, коли
        // сторінку відкрили старою адресою. Без нього сторінка падала
        // з «Cannot set properties of null» — заміряно одразу після
        // першої збірки.
        '<title id="pageTitle">' + escapeText(title) + "</title>",
        '<meta name="description" content="' + escapeAttr(description) + '">',
        '<link rel="canonical" href="' + escapeAttr(url) + '">',
        '<meta property="og:type" content="website">',
        '<meta property="og:title" content="' + escapeAttr(title) + '">',
        '<meta property="og:description" content="' + escapeAttr(description) + '">',
        '<meta property="og:image" content="' + escapeAttr(promoImage(promo)) + '">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        '<meta property="og:url" content="' + escapeAttr(url) + '">',
        // Без цього Twitter і Slack показують дрібну картинку збоку
        // замість широкої зверху.
        '<meta name="twitter:card" content="summary_large_image">'
    ].join("\n");

}

function build() {

    const promos = activePromos();
    const template = buildTemplate();

    fs.mkdirSync(OUT_DIR, { recursive: true });

    // Теки акцій, яких більше немає, прибираємо: інакше сторінка
    // скасованої акції лишиться висіти й збиратиме переходи з пошуку.
    const потрібні = new Set(promos.map(p => p.slug));

    fs.readdirSync(OUT_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !потрібні.has(entry.name))
        .forEach(entry => {
            fs.rmSync(path.join(OUT_DIR, entry.name), { recursive: true, force: true });
            console.log("   прибрано:", entry.name);
        });

    promos.forEach(promo => {

        // window.PROMO_SLUG — щоб сторінка знала свою акцію без ?id=.
        // Ставимо ПЕРЕД заголовком: promo.js читає його на старті.
        const html = template
            .replace(HEAD_SLOT,
                "<script>window.PROMO_SLUG=" + JSON.stringify(promo.slug) + ";</script>\n"
                + headFor(promo))
            .replace(TITLE_SLOT,
                '<h1 id="promoHeroTitle">' + escapeText(PromoMeta.promoHeading(promo)) + "</h1>");

        const dir = path.join(OUT_DIR, promo.slug);

        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");

    });

    // promo/index.html — ЩОБ СТАРІ ПОСИЛАННЯ НЕ ВПАЛИ.
    //
    // Відколи поруч з'явилась тека promo/, адреса /promo перестала
    // вести на promo.html: статичний хостинг бачить теку й шукає в ній
    // index.html. Без цього файлу всі /promo?id=<slug>, що вже
    // розійшлись по сторіс і листуванню, віддавали б 404. Заміряно
    // одразу після першої збірки — саме так і сталось.
    //
    // Кладемо сюди той самий шаблон: він читає ?id= як і раніше, а
    // promo.js, розібравшись, яка це акція, перепише адресу в рядку
    // на /promo/<slug>/.
    fs.writeFileSync(path.join(OUT_DIR, "index.html"),
        template
            .replace(HEAD_SLOT, [
                "<!-- Стара адреса /promo?id=<slug>. Своїх тегів не має:",
                "     яка саме акція — відомо лише з ?id=, тобто вже в",
                "     браузері. Нові посилання ведуть на /promo/<slug>/,",
                "     де все це стоїть статично. -->",
                '<title id="pageTitle">Акція | BestBrnd4u</title>',
                '<meta name="description" content="Акції та знижки BestBrnd4u">',
                '<meta name="robots" content="noindex,follow">'
            ].join("\n"))
            .replace(TITLE_SLOT, TITLE_SLOT),
        "utf8");

    console.log(`Готово: ${promos.length} сторінок акцій + стара адреса → promo/`);

}

if (require.main === module) build();

module.exports = { build, promoPages, activePromos, ended };
