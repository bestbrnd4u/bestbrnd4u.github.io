// Поля розмітки товару, яких просив Search Console (Merchant listings).
//
// ЩО ПРОСИЛИ ВИПРАВИТИ
//   • Invalid value in field "sku"
//   • Missing field "hasMerchantReturnPolicy" (in "offers")
//   • Missing field "shippingDetails" (in "offers")
//
// ГОЛОВНЕ ПРАВИЛО ЦЬОГО НАБОРУ: значення в розмітці мусять збігатися з
// тим, що написано на сторінках умов. Розмітка, яка обіцяє більше за
// реальні умови, — це не «оптимізація», а неправдива інформація для
// покупця, і Google за таке знімає rich-результати.
//
// Окремо стежимо за рейтингом: aggregateRating без жодного відгуку —
// пряма причина санкцій. Чотири товари мають rating: 5 при reviews: 0,
// і в розмітку такий блок потрапляти не має.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const products = fs.readdirSync(path.join(ROOT, "data/products"))
    .filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "data/products", f), "utf8")))
    .filter(p => typeof p.id === "number" && p.slug);

const schemaOf = slug => {
    const file = path.join(ROOT, "p", slug, "index.html");
    if (!fs.existsSync(file)) return null;
    const html = fs.readFileSync(file, "utf8");
    const m = html.match(/id="productSchema">([\s\S]*?)<\/script>/);
    return m ? JSON.parse(m[1]) : null;
};

const schemas = products.map(p => ({ p, ld: schemaOf(p.slug) })).filter(x => x.ld);

// Генератор схлопує пробіли в артикулі, тож порівнюємо нормалізовано:
// інакше виправлений пробіл виглядав би як «артикул не з варіанта».
// Порівнюємо артикули ЗА ТИМ САМИМ правилом, яке застосовує збірка.
//
// Google забороняє пробіли в sku, тож збірка замінює їх на дефіс:
// «NENA/S 807 51» → «NENA/S-807-51». Порівняння «як є» після цього
// завжди хибне — тест падав не через дані, а через власну наївність.
const normalizeSku = value => String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "-")
    .replace(/-{2,}/g, "-");

const sameSku = (a, b) => normalizeSku(a) === normalizeSku(b);

console.log("\n[1] Артикул є в кожного товару");
{
    check(`сторінок з розміткою — ${schemas.length}`, schemas.length === products.length,
        `${schemas.length} з ${products.length}`);

    const bad = schemas.filter(x => !x.ld.sku || !String(x.ld.sku).trim());
    check("жодного товару без sku", bad.length === 0,
        bad.map(x => x.p.id).join(", "));

    // sku — АРТИКУЛ КАТАЛОГУ, і його ставить система.
    //
    // Раніше в sku йшов заводський код, який заповнювали руками: у
    // годинника MK7558 (id=95) його не було ні в товарі, ні в кольорі,
    // поле не потрапляло в розмітку, і Search Console писав «Invalid
    // value in field "sku"». Порожнього артикула тепер не буває —
    // номер видає збірка з id (scripts/build-products.js).
    // article у вихідних файлах не лежить (він вичислюється зі id при
    // збірці, див. build-products.js), тож очікуване значення беремо
    // так само — з id.
    const очікуванийSku = product => String(product.id);

    check("sku — це номер каталогу, а не заводський код",
        schemas.every(x => String(x.ld.sku) === очікуванийSku(x.p)),
        schemas.filter(x => String(x.ld.sku) !== очікуванийSku(x.p))
            .slice(0, 3).map(x => `id=${x.p.id}: ${x.ld.sku} ≠ ${очікуванийSku(x.p)}`).join("; "));

    // Заводський код не зник — він переїхав у mpn, бо саме так Google
    // розрізняє «позначка товару в магазині» і «код виробника».
    const зКодом = schemas.filter(x => x.p.sku);

    check(`код виробника доїжджає в mpn (${зКодом.length} товарів)`,
        зКодом.every(x => x.ld.mpn && sameSku(x.ld.mpn, x.p.sku)),
        зКодом.filter(x => !x.ld.mpn || !sameSku(x.ld.mpn, x.p.sku))
            .slice(0, 3).map(x => `id=${x.p.id}: ${x.ld.mpn} ≠ ${x.p.sku}`).join("; "));

    // Порожнє поле не має ставати «mpn»: "" Google теж вважає невалідним.
    check("без коду виробника mpn просто немає",
        schemas.filter(x => !x.p.sku).every(x => x.ld.mpn === undefined),
        schemas.filter(x => !x.p.sku && x.ld.mpn !== undefined)
            .slice(0, 3).map(x => `id=${x.p.id}`).join(", "));
}

console.log("\n[1b] Артикул виглядає як артикул, а не як назва товару");
{
    // Search Console: «Invalid value in field "sku"». Значенням був
    // не порожній рядок (стара перевірка вище такий і пропускала), а
    // назва товару з Amazon разом з ASIN:
    //   "Gabbi Ruched Hobo Handbag - Grass Green  B094QT219C"
    // 51 символ і подвійний пробіл. Для Google sku — коротка позначка
    // товару, і таке значення він відкидає.
    const MAX_LENGTH = 50;
    const MAX_SPACES = 3;

    const problem = sku => {
        if (typeof sku !== "string") return `не рядок (${typeof sku})`;
        if (sku !== sku.trim()) return "пробіли по краях";
        if (/\s{2,}/.test(sku)) return "подвійний пробіл усередині";
        if (sku.length > MAX_LENGTH) return `${sku.length} символів > ${MAX_LENGTH}`;
        if ((sku.split(" ").length - 1) > MAX_SPACES) return "більше схоже на назву, ніж на артикул";
        return "";
    };

    const broken = schemas
        .map(x => ({ id: x.p.id, sku: x.ld.sku, why: problem(x.ld.sku) }))
        .filter(x => x.why);

    check("усі sku проходять перевірку", broken.length === 0,
        broken.map(x => `id=${x.id} «${x.sku}» — ${x.why}`).join("; "));

    // Слеші лишаються навмисно: "NENA/S 807 51" і "MJ 1010/S 0807/9O 54" —
    // справжні моделі Jimmy Choo і Marc Jacobs, а не сміття в даних.
    const withSlash = schemas.filter(x => /\//.test(x.ld.sku));
    check(`артикули зі слешем не поламані перевіркою (${withSlash.length})`,
        withSlash.every(x => !problem(x.ld.sku)));

    // Порожній рядок JSON.stringify не прибирає (він прибирає лише
    // undefined), тож "sku": "" спокійно потрапило б у розмітку.
    check("немає жодного порожнього sku",
        schemas.every(x => x.ld.sku === undefined || String(x.ld.sku).trim() !== ""));

    // і в даних теж не має лишатись сміття — інакше воно просто
    // мовчки випаде з розмітки при наступній збірці
    const inData = [];

    products.forEach(p => {
        [["товар", p.sku]].concat((p.variants || [])
            .map(v => [`варіант «${v.color || v.name || "?"}»`, v && v.sku]))
            .forEach(([where, sku]) => {
                if (sku && problem(String(sku))) inData.push(`id=${p.id} ${where}: «${sku}»`);
            });
    });

    check("у data/products теж немає битих артикулів", inData.length === 0,
        inData.join("; "));
}

console.log("\n[2] Умови повернення — і в розмітці, і на сайті однакові");
{
    const missing = schemas.filter(x => !x.ld.offers || !x.ld.offers.hasMerchantReturnPolicy);
    check("hasMerchantReturnPolicy є в усіх offers", missing.length === 0,
        missing.map(x => x.p.id).join(", "));

    const rp = schemas[0].ld.offers.hasMerchantReturnPolicy;

    check("строк повернення — 14 днів", rp.merchantReturnDays === 14, rp.merchantReturnDays);
    check("країна — Україна", rp.applicableCountry === "UA", rp.applicableCountry);
    check("категорія — обмежене вікно повернення",
        /MerchantReturnFiniteReturnWindow$/.test(rp.returnPolicyCategory), rp.returnPolicyCategory);
    check("спосіб — поштою", /ReturnByMail$/.test(rp.returnMethod), rp.returnMethod);

    // на сайті сказано: пересилку назад оплачує покупець
    check("пересилку назад оплачує покупець (як і написано в умовах)",
        /ReturnFeesCustomerResponsibility$/.test(rp.returnFees), rp.returnFees);
    check("не заявлено безкоштовне повернення",
        !/FreeReturn/.test(JSON.stringify(rp)));

    const page = fs.readFileSync(path.join(ROOT, "return-warranty.html"), "utf8");
    check("сторінка умов теж говорить про 14 днів", /14\s*дн/i.test(page));
}

console.log("\n[3] Доставка — і в розмітці, і на сайті однакові");
{
    const missing = schemas.filter(x => !x.ld.offers.shippingDetails);
    check("shippingDetails є в усіх offers", missing.length === 0,
        missing.map(x => x.p.id).join(", "));

    const sd = schemas[0].ld.offers.shippingDetails;

    check("доставка по Україні",
        sd.shippingDestination && sd.shippingDestination.addressCountry === "UA");
    check("збірка 1–2 дні",
        sd.deliveryTime.handlingTime.minValue === 1 && sd.deliveryTime.handlingTime.maxValue === 2);
    check("доставка 1–3 дні",
        sd.deliveryTime.transitTime.minValue === 1 && sd.deliveryTime.transitTime.maxValue === 3);

    const page = fs.readFileSync(path.join(ROOT, "delivery-payment.html"), "utf8");
    check("сторінка доставки теж говорить 1–2 дні на збірку", /1[–-]2\s*(робочих\s*)?дн/i.test(page));
    check("сторінка доставки теж говорить 1–3 дні доставки", /1[–-]3\s*дн/i.test(page));
    check("порогом безкоштовної доставки на сайті вказано 3 500 грн",
        /3\s*500/.test(page));

    // Нульова ставка — лише там, де вона правдива. Найдешевший товар
    // каталогу дорожчий за поріг, тож зараз це так для всіх.
    const wrong = schemas.filter(x => {
        const rate = x.ld.offers.shippingDetails.shippingRate;
        const free = Number(x.p.price) >= 3500;
        return free ? !(rate && rate.value === 0) : !!rate;
    });

    check("ставка 0 стоїть саме там, де доставка справді безкоштовна",
        wrong.length === 0,
        wrong.map(x => `${x.p.id} (${x.p.price} грн)`).join(", "));
}

console.log("\n[4] Рейтинг — тільки за справжніми відгуками");
{
    const fake = schemas.filter(x => {
        const ar = x.ld.aggregateRating;
        if (!ar) return false;
        return !(Number(ar.reviewCount) > 0);
    });

    check("немає жодного рейтингу з нульовою кількістю відгуків",
        fake.length === 0, fake.map(x => x.p.id).join(", "));

    const withRating = products.filter(p => p.rating);
    const withReviews = products.filter(p => p.rating && Number(p.reviews) > 0);

    console.log(`     у даних: rating у ${withRating.length} товарів, `
        + `із них справжніх відгуків у ${withReviews.length}`);

    check("товари з rating але без відгуків НЕ отримали блок рейтингу",
        products.filter(p => p.rating && !Number(p.reviews))
            .every(p => { const s = schemaOf(p.slug); return s && !s.aggregateRating; }));

    // та сама умова має бути і в клієнтському рендері
    const productJs = fs.readFileSync(path.join(ROOT, "assets/js/product.js"), "utf8");
    check("product.js теж вимагає reviews > 0",
        /product\.rating && Number\(product\.reviews\) > 0/.test(productJs));
}

console.log("\n[5] Обидва генератори розмітки узгоджені");
{
    const productJs = fs.readFileSync(path.join(ROOT, "assets/js/product.js"), "utf8");
    const builder = fs.readFileSync(path.join(ROOT, "scripts/build-product-pages.js"), "utf8");

    ["hasMerchantReturnPolicy", "shippingDetails", "MerchantReturnFiniteReturnWindow",
     "ReturnFeesCustomerResponsibility", "FREE_SHIPPING_FROM"].forEach(token => {
        check(`«${token}» є в обох`, productJs.includes(token) && builder.includes(token),
            `product.js: ${productJs.includes(token)}, генератор: ${builder.includes(token)}`);
    });

    check("поріг безкоштовної доставки однаковий",
        /FREE_SHIPPING_FROM = 3500/.test(productJs) && /FREE_SHIPPING_FROM = 3500/.test(builder));
    check("строк повернення однаковий",
        /merchantReturnDays: 14/.test(productJs) && /merchantReturnDays: 14/.test(builder));

    // Артикул чиститься у двох місцях — статичні сторінки і клієнтський
    // рендер. Розійдуться межі — Google побачить різний sku на одній
    // адресі до і після виконання JS.
    check("sanitizeSku є в обох",
        /function sanitizeSku/.test(productJs) && /function sanitizeSku/.test(builder));
    check("межа довжини артикула однакова",
        /SKU_MAX_LENGTH = 50/.test(productJs) && /SKU_MAX_LENGTH = 50/.test(builder));
    // Раніше тут перевірялась межа SKU_MAX_SPACES = 3 — тобто до трьох
    // пробілів вважались нормою. Документація Google натомість каже:
    // «The sku value must not contain any whitespace characters».
    // Тепер межа рахує СЛОВА (щоб назва товару не пролізла як артикул),
    // а самі пробіли замінюються дефісом.
    check("межа кількості слів однакова",
        /SKU_MAX_WORDS = 4/.test(productJs) && /SKU_MAX_WORDS = 4/.test(builder));
    // Дивимось на КОД: у коментарях старий поріг згадується навмисно,
    // щоб ніхто не повернув його, не прочитавши чому.
    const strip = t => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

    check("порога пробілів більше немає",
        !/SKU_MAX_SPACES/.test(strip(productJs)) && !/SKU_MAX_SPACES/.test(strip(builder)));
    check("обидва замінюють пробіли на дефіс",
        /replace\(\/ \/g, "-"\)/.test(productJs) && /replace\(\/ \/g, "-"\)/.test(builder));
    check("порожній артикул не йде в розмітку (undefined, а не \"\")",
        /schemaSku\(product\) \|\| undefined/.test(productJs)
        && /firstSku\(product\) \|\| undefined/.test(builder));
}

console.log("\n[9] Артикул без пробілів — вимога Google");
{
    // Документація merchant listings: «The sku value must not contain
    // any whitespace characters». Раніше тут стояв поріг у три
    // пробіли — я прочитав вимогу неуважно, і Search Console
    // справедливо показувала помилку на 16 товарах із 56.
    const withSpace = schemas.filter(x => x.ld.sku && /\s/.test(String(x.ld.sku)));

    check("жодного артикула з пробілом у розмітці", withSpace.length === 0,
        withSpace.map(x => `${x.p.id}: «${x.ld.sku}»`).slice(0, 3).join(", "));

    // Замінюємо на дефіс, а не склеюємо: «A05042 0037354» →
    // «A05042-0037354» лишається схожим на код постачальника, а
    // «A050420037354» злило б дві частини в одну незрозумілу.
    const raw = products.flatMap(p =>
        [p.sku, ...(p.variants || []).map(v => v && v.sku)].filter(Boolean));

    const hadSpaces = raw.filter(v => /\s/.test(String(v)));

    // Тут стояло «пробіли в даних мусять бути — інакше правило нічого
    // не доводить». Так і було, поки пробіли жили в даних, а дефіс
    // з'являвся лише на виході: у товарі одне значення, на сайті інше.
    //
    // Тепер пробілів немає вже в даних (normalizeSkus у
    // build-products.js), а адмінка нових не пропускає (pattern у
    // admin/config.yml). Вимагати їхньої наявності означало б вимагати
    // саме тієї розбіжності, від якої ми пішли.
    check("у даних теж не лишилось жодного пробілу в артикулі",
        hadSpaces.length === 0, hadSpaces.slice(0, 3).join(", "));

    // Правило все одно мусить доводити себе на реальному значенні —
    // просто інакше: беремо артикул, який дефіс уже отримав, і
    // звіряємо, що саме він дійшов до розмітки.
    const sample = raw.find(v => /-/.test(String(v)));

    check("артикули з дефісом у даних є — правило не порожнє", !!sample);

    if (sample) {

        // Заводський код тепер їде в mpn, а не в sku: у sku лежить
        // номер каталогу. Правило про дефіс від цього не змінилось —
        // змінилось лише поле, у яке дивитись.
        const rendered = schemas.map(x => x.ld.mpn).find(v => v === String(sample));

        check(`«${sample}» дійшов до розмітки як є`, !!rendered,
            "у розмітці такого значення немає");

    }

    // Два місця, які тримають правило: адмінка не дає ввести пробіл, а
    // збірка лікує те, що вже лежить у даних. Без другого старі товари
    // неможливо було б зберегти — адмінка відхиляла б їхній власний,
    // нікким не змінений артикул.
    const cfg = fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8");

    const patterns = cfg.split("\n")
        .filter(line => /pattern:\s*\["\^\\\\S\*\$"/.test(line));

    check("адмінка не приймає пробіл в артикулі (обидва поля)",
        patterns.length === 2, String(patterns.length));

    check("і пояснює, що ставити замість пробілу",
        /Замість пробілу — дефіс/.test(cfg));

    const builder = fs.readFileSync(path.join(ROOT, "scripts/build-products.js"), "utf8");

    check("збірка лікує артикули, що вже в даних",
        /function normalizeSkus/.test(builder)
        && /replace\(\/\\s\+\/g, "-"\)/.test(builder));

    check("і чіпає артикул товару, і артикули кольорів",
        /data\.sku = fix\(data\.sku\)/.test(builder)
        && /variant\.sku = fix\(variant\.sku\)/.test(builder));

    // Довгі багатослівні значення все одно відкидаємо: без пробілів
    // назва товару не стає артикулом.
    check("межа за кількістю слів лишилась",
        /SKU_MAX_WORDS/.test(
            fs.readFileSync(path.join(ROOT, "scripts/build-product-pages.js"), "utf8")));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
