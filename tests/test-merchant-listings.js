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

console.log("\n[1] Артикул є в кожного товару");
{
    check(`сторінок з розміткою — ${schemas.length}`, schemas.length === products.length,
        `${schemas.length} з ${products.length}`);

    const bad = schemas.filter(x => !x.ld.sku || !String(x.ld.sku).trim());
    check("жодного товару без sku", bad.length === 0,
        bad.map(x => x.p.id).join(", "));

    // артикул може бути не в товара, а у варіанта — саме через це
    // в одного товару поле раніше не потрапляло в розмітку
    const fromVariant = schemas.filter(x => !x.p.sku && x.ld.sku);
    check(`артикул підхвачено з варіанта там, де його немає в товарі (${fromVariant.length})`,
        fromVariant.every(x => (x.p.variants || []).some(v => v && v.sku === x.ld.sku)),
        fromVariant.map(x => x.p.id).join(", "));
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
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
