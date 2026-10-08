// Сторінки «бренд × тип»: /brands/michael-kors/hodynnyky/
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// Запит про річ майже завжди з двох слів — тип і бренд: «годинники
// Michael Kors», «кросівки Lacoste», «гаманці Coach». Сторінок у
// магазину було рівно по одному слову: /brands/coach/ про весь Coach
// і /categories/hamantsi/ про гаманці всіх брендів. Під запит із
// двох слів не було нічого, і його місце займав каталог із фільтром,
// canonical якого веде на /catalog — тобто сам каже Google, що це не
// окрема сторінка.
//
// НАЙДОРОЖЧА ПОМИЛКА ТУТ — ЗАЙВА СТОРІНКА, А НЕ ВІДСУТНЯ.
//
// Нову адресу зробити легко, і спокуса зробити їх усі (21 бренд × 6
// типів = 126) велика. Але сторінка, перелік товарів якої слово в
// слово збігається з уже наявною, не додає нічого: Google зводить
// такі до однієї, сам обираючи яку, а обходить обидві. Заміряно
// 08.10.2026 на 103 товарах: із 52 можливих пар змістовними виявились
// 11, решта або замалі, або повторювали сторінку бренду чи категорії.
//
// Тому головне в цьому наборі — не «сторінки є», а ПЕРЕЛІКИ ТОВАРІВ
// НЕ ПОВТОРЮЮТЬСЯ. Три правила відбору нижче перевіряються кожне
// окремо, і разом — на справжніх даних.

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

const taxonomy = require("../scripts/build-taxonomy-pages.js");

const products = JSON.parse(read("data/products.json"));
const brandData = JSON.parse(read("data/brands.json"));
const categoryData = JSON.parse(read("data/categories.json"));

const brands = taxonomy.brandPages(products, brandData);
const categories = taxonomy.categoryPages(products, categoryData);
const departments = taxonomy.departmentPages(products, categoryData,
    taxonomy.readRecords(taxonomy.DEPARTMENTS_SRC));

const pairs = taxonomy.pairPages(products, categoryData, brandData);

const PAIR_MIN = taxonomy.PAIR_MIN;

const набір = page => page.products.map(p => p.slug).sort().join("|");


console.log("\n[1] Правило відбору: кожна з трьох умов працює");
{
    check(`пар знайдено (${pairs.length})`, pairs.length > 0);

    // 1. Замалі не беремо: з одним товаром сторінка — це картка
    //    товару, переказана своїми словами.
    const замалі = pairs.filter(p => p.products.length < PAIR_MIN);

    check(`у кожної не менше ${PAIR_MIN} товарів`, замалі.length === 0,
        замалі.map(p => `${p.name} (${p.products.length})`).join(", "));

    // 2. Пара з РОЗДІЛОМ живе, лише якщо бренд має в ньому більше
    //    однієї категорії. Інакше її перелік дослівно збігся б із
    //    категорійною парою.
    const категоріїБренду = (brand, department) => new Set(products
        .filter(p => String(p.brand || "").trim() === brand)
        .map(p => String(p.category || "").trim())
        .filter(category => (categoryData
            .find(c => c && c.name === category) || {}).department === department));

    const вузькі = pairs.filter(p => p.level === "department"
        && категоріїБренду(p.brand, p.type).size < 2);

    check("пара з розділом — тільки там, де бренд має кілька категорій",
        вузькі.length === 0, вузькі.map(p => p.name).join(", "));

    // 3. Пара не може охопити весь асортимент бренду: тоді вона —
    //    сторінка самого бренду під іншою назвою.
    const усеБренду = pairs.filter(p => {

        const brand = brands.find(b => b.name === p.brand);

        return brand && p.products.length >= brand.products.length;

    });

    check("жодна не охоплює весь асортимент свого бренду",
        усеБренду.length === 0, усеБренду.map(p => p.name).join(", "));
}


console.log("\n[2] Переліки товарів не повторюються ніде");
{
    // Ось заради чого всі три правила вище. Беремо ВСІ сторінки
    // таксономії разом — бренди, категорії, розділи й пари — і
    // дивимось, чи немає двох із однаковим набором товарів.
    const усі = [
        ...brands.map(p => ["бренд", p]),
        ...categories.map(p => ["категорія", p]),
        ...departments.map(p => ["розділ", p]),
        ...pairs.map(p => ["пара", p])
    ];

    const за = new Map();

    усі.forEach(([вид, page]) => {

        const key = набір(page);

        if (!за.has(key)) за.set(key, []);

        за.get(key).push(`${вид} ${page.name}`);

    });

    // Збіг «категорія Кросівки == розділ Взуття» існував і до пар:
    // у взутті поки сам лише один тип. Він зникне, щойно зʼявляться
    // черевики, і жодна з цих сторінок не створена заради іншої —
    // тому він тут названий, а не прихований мовчазним винятком.
    const ВІДОМІ = ["категорія Кросівки == розділ Взуття"];

    const збіги = [...за.values()]
        .filter(список => список.length > 1)
        .map(список => список.join(" == "))
        .filter(рядок => !ВІДОМІ.includes(рядок));

    check("жодні дві сторінки таксономії не показують той самий товар у товар",
        збіги.length === 0, збіги.join(" | "));

    const titles = [...brands, ...categories, ...departments, ...pairs].map(p => p.title);

    const повтори = titles.filter((t, i) => titles.indexOf(t) !== i);

    check("і заголовки вкладки в усіх різні", повтори.length === 0,
        [...new Set(повтори)].join(" | "));
}


console.log("\n[3] Сторінка описує саме себе");
{
    const проблеми = [];

    pairs.forEach(page => {

        const rel = `brands/${page.brandSlug}/${page.slug}/index.html`;

        if (!exists(rel)) { проблеми.push(`${page.name}: немає файлу`); return; }

        const html = read(rel);

        const свій = шукати => (html.match(шукати) || [])[1];

        // Canonical на себе, а не на бренд: інакше сторінка сама
        // просить Google показувати замість неї іншу.
        if (свій(/<link rel="canonical" href="([^"]+)"/) !== page.url) {
            проблеми.push(`${page.name}: canonical ${свій(/<link rel="canonical" href="([^"]+)"/)}`);
        }

        const title = свій(/<title>([^<]*)<\/title>/);

        if (!title || !title.includes(page.type) || !title.includes(page.brand)) {
            проблеми.push(`${page.name}: у заголовку немає типу або бренду — ${title}`);
        }

        const h1 = свій(/id="catalogTitle">([^<]*)</);

        if (h1 !== page.heading) проблеми.push(`${page.name}: h1 = ${h1}`);

        if (свій(/<meta property="og:url" content="([^"]+)"/) !== page.url) {
            проблеми.push(`${page.name}: og:url не свій`);
        }

        // Картка для месенджера мусить бути повноцінна: без
        // twitter:card посилання розгортається голим текстом.
        if (!/name="twitter:card" content="summary_large_image"/.test(html)) {
            проблеми.push(`${page.name}: немає twitter:card`);
        }

        if (!/<meta property="og:image"/.test(html)) {
            проблеми.push(`${page.name}: немає og:image`);
        }

        // Банер бренду мусить доїхати й сюди. catalog.js на
        // сторінках із фільтром hero не перемальовує — він довіряє
        // генератору, — тож без цього перехід «Coach → Жіночі сумки»
        // губив би смугу Coach на півдорозі.
        const brand = brands.find(b => b.name === page.brand);

        if (brand && (brand.banner || brand.logo)) {

            const hero = (html.match(/id="brandHero">([\s\S]*?)<\/div>/) || [])[1] || "";

            if (!/<img/.test(hero)) проблеми.push(`${page.name}: немає банера бренду`);

            // Підпис описує картинку — смугу бренду, — а не сторінку.
            if (hero && !hero.includes(`alt="${page.brand}"`)) {
                проблеми.push(`${page.name}: підпис банера не про бренд`);
            }

        }
    });

    check("canonical, заголовок, h1, картка й банер — свої в кожної",
        проблеми.length === 0, проблеми.slice(0, 3).join(" | "));
}


console.log("\n[4] Фільтр сторінки заявлено обома словами");
{
    // Спершу в самому генераторі: з одним ключем сторінка показувала б
    // або весь бренд, або весь тип — тобто не те, що обіцяє адреса.
    const безДвох = pairs.filter(page => !page.preset
        || page.preset.brand !== page.brand
        || page.preset[page.level] !== page.type);

    check("фільтр пари складається з бренду І типу", безДвох.length === 0,
        безДвох.map(p => `${p.name}: ${JSON.stringify(p.preset)}`).join(" | "));

    const проблеми = [];

    pairs.forEach(page => {

        const rel = `brands/${page.brandSlug}/${page.slug}/index.html`;

        if (!exists(rel)) { проблеми.push(`${page.name}: немає файлу`); return; }

        const html = read(rel);

        const сирий = (html.match(/window\.CATALOG_PRESET = (\{[^\n]*\});/) || [])[1];

        let preset = null;

        try { preset = JSON.parse(сирий); } catch (error) { /* нижче */ }

        if (!preset) { проблеми.push(`${page.name}: preset не читається`); return; }

        // Саме ДВА ключі. З одним сторінка показувала б або весь
        // бренд, або весь тип — тобто не те, що обіцяє адреса.
        if (preset.brand !== page.brand) проблеми.push(`${page.name}: бренд у фільтрі ${preset.brand}`);

        if (preset[page.level] !== page.type) проблеми.push(`${page.name}: тип у фільтрі ${preset[page.level]}`);

        // Перелік товарів доїжджає з HTML: ШІ-краулери (GPTBot,
        // PerplexityBot) JavaScript переважно не виконують, і без
        // нього сторінка для них порожня.
        const скільки = (html.match(/<a href="\/p\//g) || []).length;

        const треба = Math.min(page.products.length, taxonomy.STATIC_LIMIT);

        if (скільки !== треба) проблеми.push(`${page.name}: товарів у розмітці ${скільки}, а треба ${треба}`);

    });

    check("у кожної і бренд, і тип, і перелік товарів без JS",
        проблеми.length === 0, проблеми.slice(0, 3).join(" | "));
}


console.log("\n[5] На кожну пару є шлях із сайту");
{
    // Рівно тим скінчились сторінки розділів: вони були, у sitemap
    // були, а посилань на них по всьому сайту знайшлось 11. Нова
    // сторінка, на яку ніхто не посилається, не існує.
    taxonomy.linkPairs(brands, categories, departments, pairs);

    const посилання = new Set();

    [...brands, ...categories, ...departments, ...pairs].forEach(page => {
        (page.insideGroups || []).forEach(group => {
            (group.links || []).forEach(link => посилання.add(link.href));
        });
    });

    const безШляху = pairs.filter(page => !посилання.has(page.href));

    check("на кожну пару веде принаймні одне посилання",
        безШляху.length === 0, безШляху.map(p => p.name).join(", "));

    // І саме зі свого бренду: він батько й за адресою.
    const безБренду = pairs.filter(page => {

        const brand = brands.find(b => b.name === page.brand);

        return !(brand && (brand.insideGroups || [])
            .some(g => g.links.some(l => l.href === page.href)));

    });

    check("і обовʼязково зі сторінки свого бренду",
        безБренду.length === 0, безБренду.map(p => p.name).join(", "));

    // Посилання мусять доїхати в розмітку, а не лишитись у памʼяті
    // збірки: саме так і виглядав би мовчазний провал.
    const уФайлі = read("brands/coach/index.html");

    const зCoach = pairs.filter(p => p.brand === "Coach");

    const немаєВHTML = зCoach.filter(p => !уФайлі.includes(`href="${p.href}"`));

    check(`усі ${зCoach.length} типи Coach стоять у розмітці його сторінки`,
        немаєВHTML.length === 0, немаєВHTML.map(p => p.name).join(", "));

    // СУСІД ПО ТИПУ — НЕ ОБОВʼЯЗКОВО ПАРА.
    //
    // Tissot возить самі годинники, тож власної пари в нього бути не
    // може — вона дослівно повторила б сторінку бренду. Але
    // /brands/tissot/ показує самі годинники й навіть зветься
    // «Годинники Tissot». Якби сусідами лічились тільки пари,
    // «Годинники Michael Kors» виявились би глухим кутом, хоч
    // годинники в магазині є в чотирьох брендів.
    const типБренду = (brand, level) => {

        const типи = new Set(products
            .filter(p => String(p.brand || "").trim() === brand)
            .map(p => {

                const category = String(p.category || "").trim();

                return level === "category" ? category
                    : (categoryData.find(c => c && c.name === category) || {}).department || "";

            }));

        return типи.size === 1 ? [...типи][0] : "";

    };

    const пропущені = [];

    pairs.forEach(page => {

        const сусіди = new Set(((page.insideGroups || [])[0] || { links: [] })
            .links.map(l => l.href));

        brands.forEach(brand => {

            if (brand.name === page.brand) return;

            if (типБренду(brand.name, page.level) !== page.type) return;

            if (!сусіди.has(`/brands/${brand.slug}/`)) {
                пропущені.push(`${page.name} ⇸ ${brand.name}`);
            }

        });

    });

    check("сусідом стає й бренд, увесь асортимент якого — цей тип",
        пропущені.length === 0, пропущені.slice(0, 4).join(", "));

    // Ширший тип — попереду своїх частин. За абеткою «Сумки» ставали
    // між «Гаманцями» і «Жіночими сумками» й читались як помилка.
    const coach = brands.find(b => b.name === "Coach");

    const порядок = ((coach.insideGroups || [])[0] || { links: [] }).links.map(l => l.name);

    check("ширший тип стоїть перед вужчими",
        порядок.indexOf("Сумки") >= 0
        && порядок.indexOf("Сумки") < порядок.indexOf("Жіночі сумки"),
        порядок.join(" → "));
}


console.log("\n[6] Пари є там, де їх шукають роботи");
{
    const sitemap = read("sitemap.xml");

    const немаєВSitemap = pairs.filter(p => !sitemap.includes(`<loc>${p.url}</loc>`));

    check("кожна пара в sitemap.xml", немаєВSitemap.length === 0,
        немаєВSitemap.map(p => p.name).join(", "));

    const llms = read("llms.txt");

    const немаєВLlms = pairs.filter(p => !llms.includes(p.url));

    check("і в llms.txt", немаєВLlms.length === 0,
        немаєВLlms.map(p => p.name).join(", "));

    check("адреси пар — усередині теки свого бренду",
        pairs.every(p => p.url === `${SITE_URL}/brands/${p.brandSlug}/${p.slug}/`));
}


console.log("\n[7] Заголовок вкладки бере слова власника");
{
    // В адмінці у бренду є поле заголовка, і власник ним користується
    // саме так, як треба пошуку: «Годинники Tissot», «Окуляри
    // Ray-Ban». Цей текст стояв у <h1> — і більше ніде, тоді як
    // Google найбільше важить саме <title>.
    //
    // Це не прикраса до пар, а їхня частина: Tissot возить самі
    // годинники, тож власної пари «Годинники Tissot» у нього бути не
    // може — вона дослівно повторила б сторінку бренду. Запит ловить
    // саме заголовок.
    const свої = brandData.filter(b => b && b.title && b.title.trim() && b.title.trim() !== b.name);

    check("у даних є бренди з власним заголовком", свої.length > 0, String(свої.length));

    const втрачені = свої.filter(запис => {

        const page = brands.find(b => b.name === запис.name);

        if (!page || page.title.startsWith(запис.title.trim())) return false;

        // Коротку форму беремо, лише коли авторська не влізла б у
        // межу. Довжину хвоста рахуємо з готового заголовка, а не
        // повторюємо шаблон другим рядком — розійшлись би.
        const хвіст = page.title.length - page.name.length;

        return запис.title.trim().length + хвіст <= 65;

    });

    check("кожен такий заголовок доїхав у <title>", втрачені.length === 0,
        втрачені.map(b => b.name).join(", "));

    // А на самій сторінці — не лише в памʼяті збірки.
    const tissot = read("brands/tissot/index.html");

    check("і стоїть у готовому файлі",
        /<title>Годинники Tissot — /.test(tissot),
        (tissot.match(/<title>([^<]*)</) || [])[1]);

    // Задовгий — беремо коротший: якщо авторський заголовок виштовхує
    // за край саму назву бренду, він програє голій назві.
    const задовгі = brands.filter(b => b.title.length > 65);

    check("жоден заголовок не переріс межу", задовгі.length === 0,
        задовгі.map(b => `${b.name} (${b.title.length})`).join(", "));
}


console.log(failures === 0
    ? `\n✅ ${pairs.length} сторінок «бренд × тип», жодного повтору переліку\n`
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
