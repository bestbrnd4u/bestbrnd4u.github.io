// Сторінка про оригінальність: /authenticity
//
// НАВІЩО ВОНА Є
// --------------
// На полиці 3 000–25 000 ₴ із логотипами Coach і Marc Jacobs головне
// заперечення покупця одне: «чи це не підробка». Сайт на нього
// відповідав — але ЛИШЕ ствердженнями, розкиданими по трьох сторінках:
// «гарантуємо оригінальність», «оригінальний, а не репліка».
//
// Ствердження нічого не доводить і нічого не пояснює. Для ШІ-пошуку
// воно ще й не придатне до цитування: ChatGPT і Perplexity цитують
// пояснення, а не обіцянки. Заміряно 08.10.2026: жодної сторінки, яка
// розповідає, ЗВІДКИ береться річ.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. Сторінка існує, описує себе й доступна з кожної сторінки сайту.
// 2. Факти на ній ТІ САМІ, що в решти сайту: розійдуться — і сторінка
//    з відповіддю на головне заперечення почне йому ж і суперечити.
// 3. Питання винесені розміткою FAQPage — саме її беруть і Google, і
//    ШІ-пошук.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = rel => fs.existsSync(path.join(ROOT, rel));

const { treeSiteEnv } = require("./helpers/tree-env");
const { SITE_URL } = treeSiteEnv();

const PAGE = exists("authenticity.html") ? read("authenticity.html") : "";


console.log("\n[1] Сторінка є й описує себе");
{
    check("файл на місці", PAGE.length > 0);

    const свій = re => ((PAGE.match(re) || [])[1] || "").trim();

    check("canonical на себе",
        свій(/<link rel="canonical" href="([^"]+)"/) === `${SITE_URL}/authenticity`,
        свій(/<link rel="canonical" href="([^"]+)"/));

    const title = свій(/<title>([^<]*)<\/title>/);

    check("у заголовку є слово, яким це питають",
        /оригінальн/i.test(title), title);

    check("заголовок не переріс 65 символів", title.length <= 65, String(title.length));

    check("h1 свій і один",
        (PAGE.match(/<h1>/g) || []).length === 1
        && /<h1>Чому речі в каталозі оригінальні<\/h1>/.test(PAGE));

    check("опис для пошуку є й не порожній",
        свій(/<meta name="description" content="([^"]*)"/).length > 60);

    check("картка для месенджера своя",
        свій(/<meta property="og:url" content="([^"]+)"/) === `${SITE_URL}/authenticity`
        && /property="og:image"/.test(PAGE));
}


console.log("\n[2] Питання винесені розміткою, а не тільки текстом");
{
    // Розмітку питань scripts/build-faq-schema.js пише БЕЗ id —
    // шукаємо її за типом, а не за іменем.
    let faq = null;

    for (const m of PAGE.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
        try {
            const d = JSON.parse(m[1]);
            if (d && d["@type"] === "FAQPage") faq = d;
        } catch (error) { /* не наша */ }
    }

    check("FAQPage є і читається", Boolean(faq && faq["@type"] === "FAQPage"));

    const питання = (faq && faq.mainEntity) || [];

    check(`питань у розмітці: ${питання.length}`, питання.length >= 5);

    // Розмітку наповнює scripts/build-faq-schema.js із ВИДИМОГО тексту.
    // Якщо вони розійдуться, Search Console назве це невідповідністю
    // розмітки вмісту — тож звіряємо з кнопками на сторінці.
    // У кнопки є ще й aria-expanded — атрибути мусять поміститись.
    const видимі = [...PAGE.matchAll(/<button[^>]*class="bayer-faq-question"[^>]*>\s*([^<]+?)\s*</g)]
        .map(m => m[1].trim());

    check("стільки ж питань видно на сторінці", видимі.length === питання.length,
        `${видимі.length} видимих проти ${питання.length} у розмітці`);

    const розбіжні = питання.filter((q, i) => q.name !== видимі[i]);

    check("і це ті самі питання", розбіжні.length === 0,
        розбіжні.slice(0, 2).map(q => q.name).join(" | "));

    // Головне питання сторінки мусить бути серед них.
    check("серед питань є «звідки ви привозите речі»",
        питання.some(q => /звідки/i.test(q.name)),
        питання.map(q => q.name.slice(0, 24)).join(" | "));
}


console.log("\n[3] Факти збігаються з рештою сайту");
{
    // Сторінка, яка відповідає на головне заперечення, не може
    // суперечити сусіднім сторінкам: покупець читає обидві.
    const текст = PAGE
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");

    // \w у JS — це [A-Za-z0-9_], кирилиці в ньому немає: закінчення
    // слова доводиться писати явно.
    check("сказано, що викуп іде на офіційному сайті бренду",
        /офіційн[а-яіїєґ]* (?:сайт|інтернет-магазин)[а-яіїєґ]*/i.test(текст));

    check("сказано, що це США", /США/.test(текст));

    check("сказано, що реплік немає", /реплік/i.test(текст));

    // 14 днів — число, яке вже стоїть у двох місцях сайту. Третє
    // написання мусить із ними збігатись.
    const днів = s => (s.match(/(\d+)\s+дн[а-яіїєґ]*\s+на\s+повернення/i) || [])[1]
        || (s.match(/протягом\s+(\d+)\s+дн/i) || [])[1];

    check("строк повернення той самий, що на сусідніх сторінках",
        днів(текст) === днів(read("return-warranty.html"))
        && днів(текст) === "14",
        `тут ${днів(текст)}, у поверненні ${днів(read("return-warranty.html"))}`);

    // Самовивозу немає — так написано в llms.txt, і сторінка не має
    // обіцяти протилежне.
    check("не обіцяє подивитись річ до покупки",
        /самовивоз\w* .{0,30}немає|немає .{0,30}самовивоз/i.test(текст)
        || /тільки з доставкою/i.test(текст),
        "сторінка мусить прямо сказати, що магазину немає");
}


console.log("\n[4] На сторінку є шлях із кожної сторінки сайту");
{
    // Сторінка, на яку ніхто не посилається, не існує: саме так
    // сталося зі сторінками розділів — 11 посилань на весь сайт.
    const корінь = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const без = корінь.filter(f => !/href="authenticity"/.test(read(f)));

    check(`посилання в підвалі всіх ${корінь.length} джерельних сторінок`,
        без.length === 0, без.join(", "));

    // А отже — і на всіх згенерованих, бо вони родяться з цих трьох.
    ["catalog.html", "product.html", "promo.html"].forEach(шаблон => {
        check(`${шаблон} теж посилається (з нього родяться згенеровані)`,
            /href="authenticity"/.test(read(шаблон)));
    });

    const приклад = fs.readdirSync(path.join(ROOT, "p"))
        .map(slug => `p/${slug}/index.html`)
        .find(f => exists(f) && !/http-equiv="refresh"/.test(read(f)));

    // На згенерованих сторінках адреси від кореня: build-product-pages.js
    // переписує відносні посилання, бо сторінка лежить у /p/<slug>/.
    check("і сторінка товару справді його має",
        приклад && /href="\/?authenticity"/.test(read(приклад)), приклад);
}


console.log("\n[5] Її знайдуть і роботи");
{
    check("є в sitemap.xml", read("sitemap.xml").includes(`${SITE_URL}/authenticity`));

    // llms.txt — те, що читають ШІ-пошуковики. Сторінка про
    // походження товару має бути там серед умов, а не серед каталогу.
    const llms = read("llms.txt");

    check("є в llms.txt", llms.includes(`${SITE_URL}/authenticity`));

    const умови = llms.slice(llms.indexOf("## Умови"), llms.indexOf("## Каталог"));

    check("саме в розділі «Умови»", умови.includes("/authenticity"));

    check("не закрита від індексації", !/name="robots"[^>]*noindex/.test(
        PAGE.replace('<meta name="robots" content="noindex,nofollow">', "")));
}


console.log(failures === 0
    ? "\n✅ Оригінальність: сторінка є, факти збігаються, шлях до неї є звідусіль\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
