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
    check("сторінка доставки називає тариф перевізника",
        /від 60 грн/.test(page) && /перевізник/i.test(page));

    // НУЛЯ В РОЗМІТЦІ БУТИ НЕ ПОВИННО.
    //
    // Раніше товарам дорожче за 3 500 грн ішло shippingRate: 0 —
    // «безкоштовна доставка». Магазин справді не бере за доставку
    // грошей, але покупець її ПЛАТИТЬ: перевізнику при отриманні. Нуль
    // у розмітці — це нижча підсумкова ціна в Google Shopping, ніж
    // людина заплатить насправді, тобто обіцянка, якої магазин не
    // виконує.
    const zero = schemas.filter(x => {
        const rate = x.ld.offers.shippingDetails.shippingRate;
        return !rate || Number(rate.value) <= 0;
    });

    check("жоден товар не обіцяє безкоштовної доставки",
        zero.length === 0,
        zero.slice(0, 3).map(x => `${x.p.id} (${x.p.price} грн)`).join(", "));

    // Ставка однакова для всіх: доставка не залежить від ціни товару.
    const rates = new Set(schemas.map(x => Number(x.ld.offers.shippingDetails.shippingRate.value)));

    check(`ставка однакова для всіх товарів: ${[...rates].join(", ")} грн`, rates.size === 1);
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

console.log("\n[4c] Розмітка не роняє сторінку товару");
{
    // Умови продажу лежать в окремому файлі, підключеному ДО
    // product.js. Спершу виклик стояв без перевірки — і сторінка зі
    // старою розміткою (без тега модуля) плюс новий product.js дали
    //
    //     TypeError: Cannot read properties of undefined
    //     at updateProductSeoMetadata → renderProduct → init
    //
    // тобто товар не показувався зовсім. Версії в адресах від такої
    // пари захищають, але залежність усе одно надто жорстка: досить
    // блокувальника чи обірваного запиту, щоб сторінка зникла через
    // РОЗМІТКУ, яка покупцеві не потрібна.
    const productJs = fs.readFileSync(path.join(ROOT, "assets/js/product.js"), "utf8");

    check("виклик розмітки під перевіркою на модуль",
        /if \(window\.ProductOffer\) setJsonLd\("productSchema"/.test(productJs));

    // Але саме на РОЗМІТЦІ, а не на всій функції: вона ж оновлює
    // title, опис, canonical і OG — без них усі товари виглядали б у
    // пошуку однаково, а це та проблема, з якої все й починалось.
    const body = productJs.slice(
        productJs.indexOf("function updateProductSeoMetadata(product) {"),
        productJs.indexOf('setJsonLd("productSchema"'));

    check("title і OG оновлюються до перевірки", /document\.title = title/.test(body)
        && /setMetaByProperty\("og:title"/.test(body));

    check("функція не виходить раніше часу", !/^\s{4}if \(!window\.ProductOffer\) return;/m.test(body));

    // Тег модуля мусить стояти РАНІШЕ за product.js — інакше
    // перевірка спрацює на кожному завантаженні й розмітка з JS
    // ніколи не оновиться.
    const page = fs.readFileSync(path.join(ROOT, "product.html"), "utf8");

    const offerAt = page.indexOf("product-offer.js");
    const productAt = page.indexOf("js/product.js");

    check("product-offer.js підключено перед product.js",
        offerAt > 0 && productAt > 0 && offerAt < productAt,
        `модуль: ${offerAt}, product.js: ${productAt}`);

    // І в готових сторінках — там теги розставляє генератор.
    const sample = fs.readFileSync(path.join(ROOT, "p", schemas[0].p.slug, "index.html"), "utf8");

    check("і в згенерованій сторінці теж",
        sample.indexOf("product-offer.js") > 0
        && sample.indexOf("product-offer.js") < sample.indexOf("js/product.js"));
}

console.log("\n[4b] Строк дії ціни");
{
    // Google просить priceValidUntil у offers. Прострочена дата гірша
    // за відсутню: побачивши минулий строк, Google має право вважати
    // ціну застарілою і зняти rich-результат товару.
    const withDate = schemas.filter(x => x.ld.offers.priceValidUntil);

    check(`строк дії ціни в усіх ${schemas.length} сторінках`,
        withDate.length === schemas.length,
        `без строку: ${schemas.length - withDate.length}`);

    const dates = new Set(withDate.map(x => x.ld.offers.priceValidUntil));

    check("формат РРРР-ММ-ДД", [...dates].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)),
        [...dates].join(", "));

    const today = new Date();

    check("дата в майбутньому", [...dates].every(d => new Date(d) > today),
        [...dates].join(", "));

    // Запас мусить бути великий: інакше строк спливе між перезбірками
    // (а фід і сторінки перезбираються не щодня).
    const halfYear = new Date(today.getTime() + 183 * 24 * 3600 * 1000);

    check("щонайменше пів року запасу", [...dates].every(d => new Date(d) > halfYear),
        [...dates].join(", "));

    // ГОЛОВНА ПАСТКА. Дата «рік від сьогодні» змінювала б усі сто
    // сторінок при кожній перезбірці в новий день, і гілки dev та
    // main, які збираються в різні моменти, конфліктували б на
    // порожньому місці. Так уже сталося з availability_date у фіді,
    // коли він рахувався з точністю до секунди.
    const offer = require("../assets/js/product-offer.js");

    const day = 24 * 3600 * 1000;

    check("дата не залежить від дня збірки",
        offer.priceValidUntil("2026-03-05") === offer.priceValidUntil("2026-09-08")
        && offer.priceValidUntil(Date.now()) === offer.priceValidUntil(Date.now() + 30 * day),
        `${offer.priceValidUntil("2026-03-05")} vs ${offer.priceValidUntil("2026-09-08")}`);

    // Але на межі року вона таки мусить рухатись — інакше колись
    // застигне в минулому.
    check("на межі року дата зростає",
        offer.priceValidUntil("2027-01-01") > offer.priceValidUntil("2026-12-31"));

    check("сторінки зібрані тим самим правилом",
        dates.size === 1 && dates.has(offer.priceValidUntil()),
        `у сторінках: ${[...dates].join(", ")}, модуль: ${offer.priceValidUntil()}`);
}

console.log("\n[5] Обидва генератори розмітки узгоджені");
{
    const productJs = fs.readFileSync(path.join(ROOT, "assets/js/product.js"), "utf8");
    const builder = fs.readFileSync(path.join(ROOT, "scripts/build-product-pages.js"), "utf8");

    // Умови продажу написані РАЗ — у assets/js/product-offer.js.
    // Обидва будівники мусять брати їх звідти, а не тримати копію.
    const offer = require("../assets/js/product-offer.js");

    check("рантайм бере пропозицію з модуля", /ProductOffer\.offerFor\(/.test(productJs));
    check("генератор бере пропозицію з модуля", /offerFor\(product, url/.test(builder));

    // І обидва передають строки доставки з адмінки. Без цього в
    // розмітці стояли б запасні числа модуля, а видимий рядок на
    // сторінці показував би змінені — знову дві обіцянки на одній
    // сторінці, тільки тепер уже між текстом і розміткою.
    check("генератор передає строки з адмінки",
        /offerFor\(product, url, undefined, productTexts\(\)\)/.test(builder));

    // Сторожити ХВІСТ виклику, а не весь його текст: у offerFor()
    // з'явився п'ятий аргумент (ціна дня), і перевірка, прибита до
    // закритої дужки після PRODUCT_TEXTS, почервоніла на цілком
    // правильному коді. Важливо тут одне — що строки з адмінки
    // справді передані.
    check("рантайм передає ті самі строки",
        /offerFor\(product, pageUrl, undefined, window\.PRODUCT_TEXTS\b/.test(productJs));

    // Дивимось на КОД: у коментарях значення згадуються навмисно.
    const bare = t => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

    check("власних копій умов продажу не лишилось",
        !/merchantReturnDays:/.test(bare(productJs))
        && !/merchantReturnDays:/.test(bare(builder))
        && !/SHIPPING_RATE_UAH = /.test(bare(productJs))
        && !/SHIPPING_RATE_UAH = /.test(bare(builder)));

    // Те, що лежить у готових сторінках, мусить збігатися з тим, що
    // видає модуль, — інакше сторінки зібрані іншим кодом.
    {
        const sample = schemas[0];
        const built = offer.offerFor(
            { price: sample.ld.offers.price, preOrder: false },
            sample.ld.offers.url);

        const same = JSON.stringify(built.hasMerchantReturnPolicy)
            === JSON.stringify(sample.ld.offers.hasMerchantReturnPolicy)
            && JSON.stringify(built.shippingDetails)
            === JSON.stringify(sample.ld.offers.shippingDetails);

        check("умови в сторінках = умови в модулі", same);
    }

    // СКЛАД ПОЛІВ. Саме цього тут не було: перелік ключів у двох
    // будівниках мусить бути однаковий. Розійдеться — JS затре те,
    // що поклав генератор, і до Google дійде менше, ніж є у файлі.
    const keysOf = (text, opener) => {

        const start = text.indexOf(opener);

        if (start < 0) return [];

        let depth = 0;
        const keys = [];

        for (let i = start + opener.length - 1; i < text.length; i++) {

            const ch = text[i];

            if (ch === "{") depth++;
            else if (ch === "}") { depth--; if (!depth) break; }

            // ключ верхнього рівня — на початку рядка, глибина 1
            if (depth === 1 && ch === "\n") {

                const line = text.slice(i + 1, text.indexOf("\n", i + 1));
                const found = line.match(/^\s{8}([a-zA-Z_$][\w$]*)\s*[:,]/);

                if (found) keys.push(found[1]);

            }

        }

        return keys;

    };

    const runtimeKeys = keysOf(productJs, 'setJsonLd("productSchema", {');
    const builderKeys = keysOf(builder, "const productLd = {");

    // Генератор дописує частину полів окремим присвоєнням після
    // літерала — productLd.aggregateRating = … Для складу розмітки це
    // те саме поле, тож зчитуємо і такі.
    (builder.match(/\bproductLd\.([a-zA-Z_$][\w$]*)\s*=/g) || []).forEach(hit => {

        const key = hit.replace(/^productLd\./, "").replace(/\s*=$/, "");

        if (!builderKeys.includes(key)) builderKeys.push(key);

    });

    check("склад полів товару зчитано", runtimeKeys.length > 5 && builderKeys.length > 5,
        `рантайм: ${runtimeKeys.length}, генератор: ${builderKeys.length}`);

    const onlyRuntime = runtimeKeys.filter(k => !builderKeys.includes(k));
    const onlyBuilder = builderKeys.filter(k => !runtimeKeys.includes(k));

    check("однакові поля в обох будівниках",
        !onlyRuntime.length && !onlyBuilder.length,
        `лише в рантаймі: ${onlyRuntime.join(", ") || "—"};`
        + ` лише в генераторі: ${onlyBuilder.join(", ") || "—"}`);

    // І окремо — поле, яке вже одного разу відпало.
    check("category є в обох", runtimeKeys.includes("category") && builderKeys.includes("category"));

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
