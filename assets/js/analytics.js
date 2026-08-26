// ======================================
// Статистика відвідувань (Google Analytics 4)
//
// ГОЛОВНЕ ПРАВИЛО: без згоди — жодного запиту
// --------------------------------------------
// Скрипт Google не завантажується, поки людина не натисне «Прийняти
// все» в банері. Це не перестраховка: у політиці конфіденційності
// сказано, що ми питаємо про статистику окремо, і «спитати, а потім
// усе одно завантажити» зробило б це твердження неправдивим.
//
// Технічно це називають Consent Mode: спершу оголошуємо, що згоди
// НЕМАЄ, і лише потім, якщо людина погодилась, змінюємо на «є». Google
// у такому режимі не ставить власних ідентифікаторів і не збирає
// рекламних сигналів.
//
// ЩО МИ ВІДПРАВЛЯЄМО
// -------------------
// Стандартний набір подій електронної комерції GA4 — саме ті назви, які
// Google очікує, інакше звіти лишаться порожніми:
//
//   view_item_list   — показ списку товарів (каталог, добірка)
//   select_item      — клац по картці в списку
//   view_item        — перегляд сторінки товару
//   add_to_cart      — додавання в кошик
//   remove_from_cart — видалення з кошика
//   view_cart        — перегляд кошика
//   begin_checkout   — початок оформлення
//   add_to_wishlist  — додавання в обране
//   purchase         — оформлене замовлення
//   search           — пошук по сайту
//
// ЧОГО МИ НЕ ВІДПРАВЛЯЄМО
// ------------------------
// Нічого, що дозволяє впізнати конкретну людину: ні імені, ні телефону,
// ні пошти, ні адреси доставки. Google це й забороняє, але важливіше
// інше — покупець довірив ці дані магазину, а не рекламній компанії.
// У покупці йде тільки номер замовлення, сума й склад кошика.
// ======================================

(function (root) {

    "use strict";

    var CONFIG_URL = "data/analytics.json";

    var measurementId = null;
    var loaded = false;
    var pending = [];      // події, що сталися до завантаження

    // ------------------------------------------------------------------
    // Черга gtag. Оголошуємо ДО завантаження скрипта, як вимагає Google:
    // так події, що сталися раніше, не губляться.
    // ------------------------------------------------------------------
    function gtag() {

        root.dataLayer = root.dataLayer || [];
        root.dataLayer.push(arguments);

    }

    root.gtag = root.gtag || gtag;

    // Стан згоди за замовчуванням — «відмовлено».
    //
    // Виставляємо його ОДРАЗУ, ще до будь-якого завантаження: якщо
    // скрипт Google колись з'явиться на сторінці іншим шляхом, він уже
    // застане заборону, а не почне збирати.
    gtag("consent", "default", {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
        wait_for_update: 500
    });

    function allowed() {
        return !root.Consent || root.Consent.has("analytics");
    }

    function loadScript() {

        if (loaded || !measurementId) return;

        loaded = true;

        var script = document.createElement("script");

        script.async = true;
        script.src = "https://www.googletagmanager.com/gtag/js?id="
            + encodeURIComponent(measurementId);

        document.head.appendChild(script);

        gtag("js", new Date());

        gtag("config", measurementId, {
            // Адреси товарів містять колір і розмір у параметрах — вони
            // не персональні, але й у звітах ні до чого: та сама сумка
            // рахувалася б як десяток різних сторінок.
            page_location: location.origin + location.pathname,
            anonymize_ip: true
        });

        // Події, що сталися до згоди, надсилаємо тепер — вони описують
        // ту саму сесію.
        pending.splice(0).forEach(function (item) {
            gtag("event", item.name, item.params);
        });

    }

    function enable() {

        gtag("consent", "update", { analytics_storage: "granted" });

        loadScript();

    }

    // ------------------------------------------------------------------
    // Опис товару у форматі GA4
    // ------------------------------------------------------------------

    function itemOf(product, extra) {

        if (!product) return null;

        var item = {
            item_id: String(product.id || ""),
            item_name: String(product.title || ""),
            item_brand: product.brand || undefined,
            item_category: product.category || undefined,
            price: Number(product.price) || 0,
            currency: "UAH",
            quantity: 1
        };

        if (extra) {

            if (extra.color) item.item_variant = extra.color;
            if (extra.size) item.item_variant = item.item_variant
                ? item.item_variant + " / " + extra.size
                : extra.size;

            if (extra.quantity) item.quantity = extra.quantity;
            if (extra.list) item.item_list_name = extra.list;
            if (typeof extra.index === "number") item.index = extra.index;

        }

        // Знижка Google рахує окремим полем — інакше у звітах видно
        // тільки кінцеву ціну, і незрозуміло, скільки продано за акцією.
        if (product.oldPrice && product.oldPrice > product.price) {
            item.discount = Number(product.oldPrice) - Number(product.price);
        }

        return item;

    }

    // Рядки кошика → товари для GA4.
    //
    // Один помічник на view_cart, begin_checkout, add_shipping_info,
    // add_payment_info і purchase: усі вони описують той самий кошик, і
    // збирати його п'ятьма способами означало б рано чи пізно отримати
    // розбіжність між подіями однієї сесії.
    function cartItems(lines) {

        return (lines || []).map(function (line) {
            return itemOf(line.product, {
                color: line.color,
                size: line.size,
                quantity: line.qty
            });
        }).filter(Boolean);

    }

    function send(name, params) {

        if (!allowed()) return;       // немає згоди — не збираємо взагалі

        // Налаштування ще вантажаться.
        //
        // ЧОМУ ЦЕ ВАЖЛИВО. data/analytics.json тягнеться запитом, а
        // подія на сторінці товару стається одразу при відмальовці —
        // тобто РАНІШЕ. Раніше тут стояла перевірка «немає
        // measurementId → виходимо», і такі події просто зникали: у
        // звітах не було view_item, хоча сторінки товарів відкривали.
        //
        // Тепер складаємо в чергу так само, як події до згоди: якщо
        // ідентифікатор виявиться порожнім (статистика вимкнена),
        // черга просто ніколи не відправиться.
        if (!measurementId || !loaded) {

            // Ще не завантажились: складаємо подію в чергу, але не
            // безмежно — сесія без згоди не має накопичувати мегабайти.
            if (pending.length < 40) pending.push({ name: name, params: params });

            return;

        }

        gtag("event", name, params);

    }

    // ------------------------------------------------------------------
    // Події магазину
    // ------------------------------------------------------------------

    var api = {

        viewItemList: function (products, listName) {

            var items = (products || []).slice(0, 20)
                .map(function (p, i) { return itemOf(p, { list: listName, index: i }); })
                .filter(Boolean);

            if (!items.length) return;

            send("view_item_list", { item_list_name: listName, items: items });

        },

        selectItem: function (product, listName, extra) {

            var item = itemOf(product, Object.assign({ list: listName }, extra || {}));

            if (item) send("select_item", { item_list_name: listName, items: [item] });

        },

        viewItem: function (product, extra) {

            var item = itemOf(product, extra);

            if (item) send("view_item", { currency: "UAH", value: item.price, items: [item] });

        },

        addToCart: function (product, extra) {

            var item = itemOf(product, extra);

            if (item) {
                send("add_to_cart", {
                    currency: "UAH",
                    value: item.price * item.quantity,
                    items: [item]
                });
            }

        },

        removeFromCart: function (product, extra) {

            var item = itemOf(product, extra);

            if (item) {
                send("remove_from_cart", {
                    currency: "UAH",
                    value: item.price * item.quantity,
                    items: [item]
                });
            }

        },

        addToWishlist: function (product, extra) {

            var item = itemOf(product, extra);

            if (item) send("add_to_wishlist", { currency: "UAH", value: item.price, items: [item] });

        },

        viewCart: function (lines, total) {

            var items = cartItems(lines);

            if (!items.length) return;

            send("view_cart", { currency: "UAH", value: Number(total) || 0, items: items });

        },

        beginCheckout: function (lines, total) {

            var items = cartItems(lines);

            if (!items.length) return;

            send("begin_checkout", { currency: "UAH", value: Number(total) || 0, items: items });

        },

        // Крок «доставка» і крок «оплата».
        //
        // НАВІЩО САМЕ ЦІ ДВА
        // -------------------
        // begin_checkout і purchase показують лише крайні точки: скільки
        // почали оформлення й скільки завершили. Різниця між ними —
        // цифра без пояснення.
        //
        // Ці дві події ділять проміжок навпіл. Якщо люди зникають після
        // add_shipping_info, справа в доставці: не влаштовує спосіб або
        // ціна. Якщо після add_payment_info — справа в оплаті. Це вже
        // не «щось не так», а конкретне місце, куди дивитись.
        addShippingInfo: function (lines, total, method) {

            var items = cartItems(lines);

            if (!items.length) return;

            send("add_shipping_info", {
                currency: "UAH",
                value: Number(total) || 0,
                shipping_tier: method || undefined,
                items: items
            });

        },

        addPaymentInfo: function (lines, total, method) {

            var items = cartItems(lines);

            if (!items.length) return;

            send("add_payment_info", {
                currency: "UAH",
                value: Number(total) || 0,
                payment_type: method || undefined,
                items: items
            });

        },

        // Акції на головній.
        //
        // Ми зробили для банерів кадрування, стилі й окремі картинки під
        // телефон — але досі не знали, чи на них узагалі натискають.
        // view_promotion і select_promotion дають саме це: скільки разів
        // банер побачили й скільки разів по ньому пішли.
        viewPromotion: function (promo, position) {

            if (!promo) return;

            send("view_promotion", {
                promotion_id: String(promo.slug || promo.id || ""),
                promotion_name: String(promo.title || ""),
                creative_slot: position || undefined
            });

        },

        selectPromotion: function (promo, position) {

            if (!promo) return;

            send("select_promotion", {
                promotion_id: String(promo.slug || promo.id || ""),
                promotion_name: String(promo.title || ""),
                creative_slot: position || undefined
            });

        },

        purchase: function (order) {

            if (!order) return;

            var items = cartItems(order.lines);

            // Ні імені, ні телефону, ні адреси — тільки те, що потрібно
            // для звіту про продажі.
            send("purchase", {
                transaction_id: String(order.id || ""),
                currency: "UAH",
                value: Number(order.total) || 0,
                shipping: Number(order.shipping) || 0,
                coupon: order.promo || undefined,
                items: items
            });

        },

        search: function (term, resultCount) {

            if (!term) return;

            send("search", {
                search_term: String(term).slice(0, 100),
                results: Number(resultCount) || 0
            });

        }

    };

    root.Analytics = api;

    // ------------------------------------------------------------------
    // Запуск
    // ------------------------------------------------------------------

    function init() {

        fetch(CONFIG_URL, { cache: "no-store" })
            .then(function (response) { return response.ok ? response.json() : {}; })
            .catch(function () { return {}; })
            .then(function (data) {

                measurementId = String((data && data.measurementId) || "").trim();

                // Порожній ідентифікатор = статистика вимкнена. Жодного
                // запиту до Google не буде навіть за наявності згоди.
                if (!measurementId) {

                    // Черга накопичених подій більше ні до чого — і
                    // тримати її в пам'яті всю сесію теж ні до чого.
                    pending.length = 0;

                    return;

                }

                if (allowed()) enable();

            });

    }

    // Згоду можуть дати вже після завантаження сторінки — тоді
    // вмикаємось на місці, без перезавантаження.
    document.addEventListener("consent:change", function (event) {

        if (event.detail && event.detail.analytics) enable();

    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).Analytics;
}
