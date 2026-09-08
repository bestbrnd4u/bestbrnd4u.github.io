// Пропозиція (Offer) у розмітці товару — спільний будівник.
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Умови продажу потрібні одночасно в трьох місцях:
//
//   1. статична сторінка p/<slug>/index.html — її збирає
//      scripts/build-product-pages.js, і саме її бачить робот до
//      виконання JS;
//   2. та сама сторінка після виконання JS — assets/js/product.js
//      перемальовує розмітку (на product.html?id=… вона єдина);
//   3. товарний фід feed.xml — scripts/build-feed.js.
//
// Досі кожне з трьох місць мало ВЛАСНУ копію: тариф доставки був
// написаний тричі, умови повернення й строки — двічі. І копії вже
// розійшлись: у генератора в розмітці стояло поле category, у
// рантайму — ні, тож JS затирав його. Google виконує JS, тобто бачив
// саме обрізану версію — рівно та сама історія, що колись була з
// доріжкою крихт (див. assets/js/breadcrumbs.js).
//
// Тепер джерело одне, і розійтись копії більше не можуть — саме це
// перевіряє tests/test-merchant-listings.js.
//
// ГОЛОВНЕ ПРАВИЛО
// ----------------
// Значення тут мусять збігатися з тим, що покупець прочитає на
// сторінках return-warranty і delivery-payment. Розмітка, яка обіцяє
// більше за реальні умови, — це не «оптимізація», а неправдива
// інформація, і Google за таке знімає rich-результати.

(function (root) {

    "use strict";

    // Умови повернення.
    //
    // • 14 днів — строк із Закону України «Про захист прав
    //   споживачів», саме він зазначений в умовах магазину;
    // • пересилку назад при «не підійшов розмір/колір» оплачує
    //   покупець — для цього в schema.org є значення
    //   ReturnFeesCustomerResponsibility, воно не вимагає вказувати
    //   суму (а сума й залежить від відправлення).
    var RETURN_POLICY = {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "UA",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 14,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnFeesCustomerResponsibility"
    };

    // Типовий тариф перевізника (грн).
    //
    // ЩО БУЛО НЕ ТАК. Тут стояло FREE_SHIPPING_FROM = 3500, і товарам
    // дорожче за поріг у розмітку йшло shippingRate: 0 —
    // «безкоштовна доставка». Магазин справді не бере за доставку
    // грошей, але покупець її платить: перевізнику при отриманні.
    // Тобто нуль у розмітці — обіцянка, якої магазин не виконує, а в
    // Google Shopping це ще й показує нижчу підсумкову ціну, ніж
    // людина заплатить насправді.
    //
    // Точну суму Нова пошта вважає за вагою й габаритами, яких магазин
    // не знає до пакування, — тому в розмітці типовий тариф, той
    // самий, що на сторінці «Оплата і доставка».
    var SHIPPING_RATE_UAH = 60;

    // 1–2 дні на збірку + 1–3 дні доставки Новою поштою по Україні —
    // ті самі строки, що на сторінці «Оплата і доставка».
    //
    // Ставка стоїть беззастережно і від ціни товару не залежить: саме
    // умова «якщо ціна більша за поріг» і ставила колись нуль.
    function shippingDetails() {

        return {
            "@type": "OfferShippingDetails",
            shippingDestination: {
                "@type": "DefinedRegion",
                addressCountry: "UA"
            },
            deliveryTime: {
                "@type": "ShippingDeliveryTime",
                handlingTime: {
                    "@type": "QuantitativeValue",
                    minValue: 1,
                    maxValue: 2,
                    unitCode: "DAY"
                },
                transitTime: {
                    "@type": "QuantitativeValue",
                    minValue: 1,
                    maxValue: 3,
                    unitCode: "DAY"
                }
            },
            shippingRate: {
                "@type": "MonetaryAmount",
                value: SHIPPING_RATE_UAH,
                currency: "UAH"
            }
        };

    }

    // До якої дати ціна вважається чинною.
    //
    // Google просить priceValidUntil у Offer, і прострочена дата гірша
    // за відсутню: побачивши минулий строк, Google має право вважати
    // ціну застарілою і зняти rich-результат товару.
    //
    // ЧОМУ КІНЕЦЬ НАСТУПНОГО РОКУ, А НЕ «РІК ВІД СЬОГОДНІ»
    // -----------------------------------------------------
    // Сторінки p/<slug>/index.html лежать у git. Дата «рік від
    // сьогодні» змінювала б усі сто сторінок при кожній перезбірці в
    // новий день — і гілки dev та main, які збираються в різні
    // моменти, конфліктували б на порожньому місці. Так уже сталося з
    // availability_date у фіді, коли він рахувався з точністю до
    // секунди.
    //
    // Кінець наступного року змінюється рівно раз на рік, 1 січня, і
    // при цьому завжди лишається в майбутньому щонайменше на рік —
    // прострочити його неможливо.
    function priceValidUntil(from) {

        var now = from ? new Date(from) : new Date();

        return (now.getUTCFullYear() + 1) + "-12-31";

    }

    // Товар «під замовлення» — це PreOrder, а не InStock:
    // невідповідність розмітки реальному стану — привід для Google
    // зняти rich-результат товару.
    function availabilityOf(product) {

        return (product && product.preOrder)
            ? "https://schema.org/PreOrder"
            : "https://schema.org/InStock";

    }

    // Порядок полів тут — той самий, що був у статичних сторінках, щоб
    // перехід на спільний модуль не переписав усі сто файлів заново.
    function offerFor(product, url, from) {

        return {
            "@type": "Offer",
            url: url,
            priceCurrency: "UAH",
            price: product.price,
            priceValidUntil: priceValidUntil(from),
            itemCondition: "https://schema.org/NewCondition",
            hasMerchantReturnPolicy: RETURN_POLICY,
            shippingDetails: shippingDetails(),
            availability: availabilityOf(product)
        };

    }

    root.ProductOffer = {
        RETURN_POLICY: RETURN_POLICY,
        SHIPPING_RATE_UAH: SHIPPING_RATE_UAH,
        shippingDetails: shippingDetails,
        priceValidUntil: priceValidUntil,
        availabilityOf: availabilityOf,
        offerFor: offerFor
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).ProductOffer;
}
