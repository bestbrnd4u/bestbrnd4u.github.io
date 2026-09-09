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

    // Строки доставки — ОДИН набір чисел на весь сайт.
    //
    // 1–2 дні на збірку (магазин пакує й передає перевізнику) + 1–3 дні
    // самої Нової пошти по Україні. Ті самі строки, що на сторінці
    // «Оплата і доставка».
    //
    // ЧОМУ ЦЕ ОДНЕ МІСЦЕ. Ці чотири числа читають одразу троє:
    // розмітка Offer (тут же, нижче), видимий рядок на сторінці товару
    // («у відділенні 11–13 вересня») і сторінка «Оплата і доставка».
    // Поки вони жили лише в розмітці, видимий рядок казав своє —
    // «Доставка по Україні 1–3 дні», тобто без днів на збірку. Дві
    // різні обіцянки на одній сторінці.
    //
    // Змінюються з адмінки: «Тексти на сторінці товару» → блок
    // «Строки доставки». Значення звідти приходять у deliveryTerms(),
    // а тут лишається запас на випадок, коли файл не завантажився.
    var DELIVERY = {
        handlingMin: 1,
        handlingMax: 2,
        transitMin: 1,
        transitMax: 3
    };

    // Числа з адмінки поверх запасних. Береться лише те, що справді
    // число більше нуля: порожнє поле в адмінці не має обнуляти строк.
    function deliveryTerms(overrides) {

        var out = {
            handlingMin: DELIVERY.handlingMin,
            handlingMax: DELIVERY.handlingMax,
            transitMin: DELIVERY.transitMin,
            transitMax: DELIVERY.transitMax
        };

        if (!overrides) return out;

        Object.keys(out).forEach(function (key) {

            var value = Number(overrides[key]);

            if (Number.isFinite(value) && value > 0) out[key] = Math.round(value);

        });

        // Переплутані місцями «від» і «до» дали б діапазон навпаки
        // («у відділенні 13–11 вересня»). Тихо міняємо, а не падаємо:
        // помилка в адмінці не має ламати сторінку товару.
        if (out.handlingMin > out.handlingMax) out.handlingMax = out.handlingMin;
        if (out.transitMin > out.transitMax) out.transitMax = out.transitMin;

        return out;

    }

    // Ставка стоїть беззастережно і від ціни товару не залежить: саме
    // умова «якщо ціна більша за поріг» і ставила колись нуль.
    function shippingDetails(overrides) {

        var terms = deliveryTerms(overrides);

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
                    minValue: terms.handlingMin,
                    maxValue: terms.handlingMax,
                    unitCode: "DAY"
                },
                transitTime: {
                    "@type": "QuantitativeValue",
                    minValue: terms.transitMin,
                    maxValue: terms.transitMax,
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

    // -------------------------
    // Коли річ буде у відділенні
    // -------------------------
    //
    // ЧОГО БРАКУВАЛО. На сторінці товару стояло «Доставка по Україні
    // 1–3 дні». Це і неточно (днів на збірку там немає), і головне —
    // покупець мусить рахувати сам, а «1–3 дні» від чого? Від
    // замовлення? Від відправки? Конкретна дата знімає це питання й
    // прибирає найпоширенішу причину написати в дірект «а коли
    // прийде?».
    //
    // ЯК РАХУЄМО. Збірка — у РОБОЧІ дні: магазин пакує з понеділка по
    // пʼятницю. Сама доставка — у КАЛЕНДАРНІ: відділення Нової пошти
    // працюють і в суботу, тож викидати вихідні з дороги означало б
    // називати дату пізнішу за справжню.
    //
    // Свят тут навмисно немає. Список державних свят треба
    // підтримувати руками, а забутий список гірший за його
    // відсутність: він тихо називає неправильні дати. Слово
    // «орієнтовно» в тексті чесніше.
    var UA_MONTHS_GENITIVE = [
        "січня", "лютого", "березня", "квітня", "травня", "червня",
        "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"
    ];

    function addWorkdays(date, days) {

        var out = new Date(date.getTime());

        var left = days;

        while (left > 0) {

            out.setDate(out.getDate() + 1);

            var weekday = out.getDay();

            // 0 — неділя, 6 — субота.
            if (weekday !== 0 && weekday !== 6) left--;

        }

        return out;

    }

    function addDays(date, days) {

        var out = new Date(date.getTime());

        out.setDate(out.getDate() + days);

        return out;

    }

    // Найраніша й найпізніша дата отримання.
    function deliveryWindow(overrides, from) {

        var terms = deliveryTerms(overrides);

        var start = from ? new Date(from) : new Date();

        return {
            from: addDays(addWorkdays(start, terms.handlingMin), terms.transitMin),
            to: addDays(addWorkdays(start, terms.handlingMax), terms.transitMax)
        };

    }

    // «11–13 вересня», «30 вересня – 2 жовтня», «11 вересня».
    //
    // Місяць пишемо словом і в родовому відмінку: «11.09–13.09»
    // читається як телефонний номер, а «11–13 вересня» — як речення.
    function formatDeliveryRange(window) {

        var from = window.from;
        var to = window.to;

        var fromDay = from.getDate();
        var toDay = to.getDate();

        var fromMonth = UA_MONTHS_GENITIVE[from.getMonth()];
        var toMonth = UA_MONTHS_GENITIVE[to.getMonth()];

        if (fromDay === toDay && fromMonth === toMonth) {
            return fromDay + " " + toMonth;
        }

        // Один місяць — назва один раз: «11–13 вересня».
        if (fromMonth === toMonth) {
            return fromDay + "–" + toDay + " " + toMonth;
        }

        // Через межу місяця — обидві назви, з пробілами навколо тире:
        // «30 вересня – 2 жовтня» без них злипається в «вересня–2».
        return fromDay + " " + fromMonth + " – " + toDay + " " + toMonth;

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
    //
    // terms — строки з адмінки (data/product-texts.json). Передають їх
    // ОБИДВА виклики, і генератор, і рантайм: інакше в розмітці стояли
    // б запасні числа, а покупець читав би змінені — тобто рівно та
    // розбіжність, заради усунення якої цей модуль і зроблено.
    function offerFor(product, url, from, terms) {

        return {
            "@type": "Offer",
            url: url,
            priceCurrency: "UAH",
            price: product.price,
            priceValidUntil: priceValidUntil(from),
            itemCondition: "https://schema.org/NewCondition",
            hasMerchantReturnPolicy: RETURN_POLICY,
            shippingDetails: shippingDetails(terms),
            availability: availabilityOf(product)
        };

    }

    root.ProductOffer = {
        RETURN_POLICY: RETURN_POLICY,
        SHIPPING_RATE_UAH: SHIPPING_RATE_UAH,
        DELIVERY: DELIVERY,
        deliveryTerms: deliveryTerms,
        deliveryWindow: deliveryWindow,
        formatDeliveryRange: formatDeliveryRange,
        shippingDetails: shippingDetails,
        priceValidUntil: priceValidUntil,
        availabilityOf: availabilityOf,
        offerFor: offerFor
    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).ProductOffer;
}
