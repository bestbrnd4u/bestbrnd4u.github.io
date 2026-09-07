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
//   purchase         — оформлене замовлення (дублюється серверною
//                      подією Meta; склеюються за eventID)
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
    var pixelId = null;
    var loaded = false;
    var metaLoaded = false;
    var pending = [];      // події, що сталися до завантаження GA4
    var pendingMeta = [];  // те саме для пікселя Meta

    // ЧОМУ ЧЕРГИ ДВІ, А НЕ ОДНА
    // --------------------------
    // Системи вмикаються НЕЗАЛЕЖНО: згода на статистику й згода на
    // рекламу — різні галочки, та й налаштування вантажаться не
    // синхронно. Спільна черга спорожнилась би на першій із них, і
    // друга не отримала б нічого — тобто перший view_item сесії
    // (найцінніший для ретаргетингу) зник би тихо.

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

    // ------------------------------------------------------------------
    // Піксель Meta
    //
    // ЧОМУ ТУТ, А НЕ ОКРЕМИМ ФАЙЛОМ
    // ------------------------------
    // Події магазину вже проходять через одну воронку — send() нижче.
    // Другий модуль означав би другий набір викликів у product.js,
    // common.js і checkout.js, і рано чи пізно подію додали б в одне
    // місце, а в інше забули. Тут таке неможливе: обидві системи
    // бачать рівно те саме.
    //
    // ЧОМУ НЕ ОФІЦІЙНИЙ СНІПЕТ META
    // ------------------------------
    // Той сніпет — один мінімізований рядок, у якому не видно ні
    // порядку викликів, ні що він робить зі згодою. Нижче те саме,
    // тільки читабельно: fbq складає виклики в чергу, поки
    // fbevents.js не завантажився й не підмінив її своєю реалізацією.
    // ------------------------------------------------------------------
    if (!root.fbq) {

        var queue = function () {
            queue.callMethod
                ? queue.callMethod.apply(queue, arguments)
                : queue.queue.push(arguments);
        };

        queue.push = queue;
        queue.loaded = true;
        queue.version = "2.0";
        queue.queue = [];

        root.fbq = queue;
        root._fbq = root._fbq || queue;

    }

    function fb() {
        if (root.fbq) root.fbq.apply(null, arguments);
    }

    // Заборона одразу, ще до завантаження скрипта — та сама причина,
    // що в gtag вище: якщо fbevents.js колись з'явиться на сторінці
    // іншим шляхом, він застане «revoke», а не почне збирати.
    fb("consent", "revoke");

    function allowed() {
        return !root.Consent || root.Consent.has("analytics");
    }

    // Реклама — ОКРЕМА згода, не та сама, що статистика.
    //
    // Статистика відповідає магазину, чого бракує в каталозі. Піксель
    // віддає дані рекламній компанії, щоб та наздогнала людину
    // оголошенням в іншому місці. Це різні цілі, тож і галочки різні
    // (див. коментар до категорій в assets/js/consent.js).
    function adsAllowed() {
        return !root.Consent || root.Consent.has("ads");
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

        // Що тут насправді дозаливається.
        //
        // НЕ події «до згоди» — тих немає взагалі: gaSend() виходить
        // на !allowed() ще до черги, тобто без згоди нічого не
        // збирається навіть у пам'ять. У черзі лежить інший проміжок:
        // згода вже є, а data/analytics.json (і скрипт Google) ще
        // вантажаться. На сторінці товару це реальні пів секунди, і
        // саме в них стається view_item.
        pending.splice(0).forEach(function (item) {
            gtag("event", item.name, item.params);
        });

    }

    function loadMetaScript() {

        if (metaLoaded || !pixelId) return;

        metaLoaded = true;

        var script = document.createElement("script");

        script.async = true;
        script.src = "https://connect.facebook.net/en_US/fbevents.js";

        document.head.appendChild(script);

        fb("consent", "grant");
        fb("init", pixelId);

        // PageView — базова подія пікселя: без неї Meta не бачить
        // навіть того, що людина була на сайті.
        fb("track", "PageView");

        // Той самий проміжок, що в GA4 вище: згода є, скрипт ще ні.
        // Події до згоди сюди не потрапляють — metaSend() виходить на
        // !adsAllowed() раніше за чергу.
        pendingMeta.splice(0).forEach(function (item) {
            metaSend(item.name, item.params);
        });

    }

    function enable() {

        gtag("consent", "update", { analytics_storage: "granted" });

        loadScript();

    }

    function enableAds() {
        loadMetaScript();
    }

    // Згоду можна не лише дати, а й відкликати — посиланням
    // «Налаштування даних» у підвалі. Тоді мало перестати надсилати
    // події: скрипти вже на сторінці, і сказати їм про це треба прямо.
    function disable() {

        gtag("consent", "update", { analytics_storage: "denied" });

        fb("consent", "revoke");

    }

    // ------------------------------------------------------------------
    // Опис товару у форматі GA4
    // ------------------------------------------------------------------

    // Ідентифікатор товару в термінах каталогу Meta.
    //
    // НАВІЩО ОКРЕМИЙ ВІД item_id
    // ---------------------------
    // Динамічний ретаргетинг («людина дивилася цю сумку — покажемо їй
    // саме її») працює ЛИШЕ коли id з пікселя збігається з id у фіді. А
    // у фіді рядок — це колір і розмір (scripts/build-feed.js), тобто
    // «9-1» і «34-1-38», а не «9» і «34».
    //
    // item_id для GA4 лишаємо як був: там за ним уже зібрана історія
    // звітів, і зміна id розірвала б її навпіл.
    //
    // ЧОМУ КОЛІР ШУКАЄМО І ЗА НАЗВОЮ, І ЗА SLUG-ОМ
    // ---------------------------------------------
    // Сторінка товару бере колір з адреси, а там він латиницею
    // («temno-siryi»); картка каталогу передає справжню назву
    // («Темно-сірий»). Обидва мусять знайти той самий варіант.
    //
    // За збігом цієї формули з формулою фіда стежить
    // tests/test-meta-pixel.js — розійдуться, і ретаргетинг мовчки
    // перестане знаходити товари.
    function metaContentId(product, extra) {

        if (!product) return "";

        var variants = Array.isArray(product.variants) ? product.variants : [];
        var wanted = extra && extra.color ? String(extra.color).trim().toLowerCase() : "";

        var index = 0;

        if (wanted) {

            for (var i = 0; i < variants.length; i++) {

                var name = String(variants[i].color || "").trim().toLowerCase();
                var slug = root.Translit ? root.Translit.toSlug(name) : "";

                if (name === wanted || (slug && slug === wanted)) {
                    index = i;
                    break;
                }

            }

        }

        var variant = variants[index];

        var base = variant && variant.article
            ? String(variant.article)
            : String(product.id || "") + "-1";

        var size = extra && extra.size ? String(extra.size).trim() : "";

        // ONESIZE — наша заглушка для товарів без розмірів, і у фіді її
        // теж немає.
        return (size && size !== "ONESIZE") ? base + "-" + size : base;

    }

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

        // Ідентифікатор для пікселя їде разом із товаром.
        //
        // GA4 таке зайве поле просто ігнорує (це item-scoped
        // параметр), а send() нижче бере його для Meta. Складати
        // другий, паралельний список товарів заради цього означало б
        // мати два описи того самого кошика — рівно те, чого cartItems
        // вище й позбувся.
        item.content_id = metaContentId(product, extra);

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

    // Одна подія магазину — дві адресати, кожен зі своєю згодою.
    //
    // Раніше тут стояло одне «if (!allowed()) return» на все. Це
    // означало, що галочка «статистика» вирішує й за рекламу: людина,
    // яка дозволила рекламу й заборонила статистику, не давала пікселю
    // жодної події. Тепер кожна система питає своє.
    function send(name, params) {

        gaSend(name, params);
        metaSend(name, params);

    }

    function gaSend(name, params) {

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

    // Назви подій Meta для наших подій GA4.
    //
    // Тут лише ті, у яких є СТАНДАРТНИЙ відповідник: саме на них Meta
    // будує оптимізацію й динамічну рекламу. Решту (view_item_list,
    // select_item, view_cart, remove_from_cart, кроки доставки й
    // оплати, акції) не переливаємо власними назвами — це був би шум,
    // який нікуди не підключений і нічого не оптимізує.
    var META_EVENTS = {
        view_item: "ViewContent",
        add_to_cart: "AddToCart",
        add_to_wishlist: "AddToWishlist",
        begin_checkout: "InitiateCheckout",
        add_payment_info: "AddPaymentInfo",
        purchase: "Purchase",
        search: "Search"
    };

    function metaSend(name, params) {

        if (!adsAllowed()) return;    // немає згоди на рекламу — нічого

        var event = META_EVENTS[name];

        if (!event) return;

        // Скрипт ще не завантажився (або згоду щойно дали) — у чергу,
        // з тим самим запобіжником на розмір, що в GA4.
        if (!pixelId || !metaLoaded) {

            if (pendingMeta.length < 40) pendingMeta.push({ name: name, params: params });

            return;

        }

        if (name === "search") {

            fb("track", "Search", { search_string: params.search_term });

            return;

        }

        var items = params.items || [];

        var payload = {
            content_type: "product",
            content_ids: items.map(function (item) { return item.content_id; })
                .filter(Boolean),
            // contents — багатша форма того самого: Meta бере з неї
            // кількість і ціну кожного рядка, а не лише перелік id.
            contents: items.map(function (item) {
                return {
                    id: item.content_id,
                    quantity: item.quantity || 1,
                    item_price: Number(item.price) || 0
                };
            }),
            currency: params.currency || "UAH",
            value: Number(params.value) || 0
        };

        if (items.length === 1 && items[0].item_name) {
            payload.content_name = items[0].item_name;
        }

        if (items.length > 1 || name === "purchase") {
            payload.num_items = items.reduce(function (sum, item) {
                return sum + (item.quantity || 1);
            }, 0);
        }

        // Номер замовлення — один із двох ключів склеювання з
        // серверною подією (Conversions API). Meta вміє зводити
        // покупки за order_id.
        if (name === "purchase" && params.transaction_id) {
            payload.order_id = params.transaction_id;
        }

        // Другий, головний ключ склеювання — eventID.
        //
        // НАВІЩО ДВА. Ту саму покупку тепер надсилають ДВІЧІ: піксель
        // із браузера й наша функція з сервера (див.
        // supabase/functions/telegram-order-bot/meta-capi.js). Так
        // зроблено навмисно — браузерний піксель вирізають
        // блокувальники й обмежує iOS, і без серверної копії
        // конверсія просто зникає.
        //
        // Але дві події про одну покупку — це подвоєна конверсія в
        // звітах, тобто вдвічі занижена ціна залучення. Meta зводить
        // їх в одну, якщо збігаються event_name і event_id. Тому
        // рядок нижче будується з номера замовлення — рівно так само,
        // як на сервері (purchaseEventId у meta-capi.js).
        var options = (name === "purchase" && params.transaction_id)
            ? { eventID: "purchase." + params.transaction_id }
            : undefined;

        if (options) {
            fb("track", event, payload, options);
        } else {
            fb("track", event, payload);
        }

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

        },

        // ------------------------------------------------------------------
        // Для серверної конверсії Meta
        //
        // Сторінка оформлення після збереження замовлення просить нашу
        // функцію надіслати Purchase з сервера. Функції потрібні дві
        // речі, які знає лише браузер: чи дана згода на рекламу і які
        // куки поставив піксель.
        // ------------------------------------------------------------------

        // Чи дозволено рекламну статистику.
        //
        // Серверна подія не може бути винятком зі згоди: інакше
        // магазин надсилав би в Meta дані саме тих людей, які рекламу
        // відхилили.
        adsAllowed: function () {
            return adsAllowed();
        },

        // Куки пікселя: _fbp ставить сам піксель, _fbc — це
        // збережений fbclid із рекламного переходу.
        //
        // Обидві різко піднімають якість збігів. Якщо піксель
        // заблокований, їх просто немає — тоді на сервері лишаються
        // хеші пошти й телефону, і цього досить.
        browserIds: function () {

            var jar = {};

            String(document.cookie || "").split(";").forEach(function (part) {

                var eq = part.indexOf("=");

                if (eq < 1) return;

                jar[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();

            });

            return { fbp: jar._fbp || "", fbc: jar._fbc || "" };

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
                pixelId = String((data && data.metaPixelId) || "").trim();

                // Порожній ідентифікатор = вимкнено. Жодного запиту до
                // Google чи Meta не буде навіть за наявності згоди.
                if (!measurementId && !pixelId) {

                    // Черги накопичених подій більше ні до чого — і
                    // тримати їх у пам'яті всю сесію теж ні до чого.
                    pending.length = 0;
                    pendingMeta.length = 0;

                    return;

                }

                if (measurementId && allowed()) enable();
                if (pixelId && adsAllowed()) enableAds();

            });

    }

    // Згоду можуть дати вже після завантаження сторінки — тоді
    // вмикаємось на місці, без перезавантаження.
    document.addEventListener("consent:change", function (event) {

        var detail = event.detail || {};

        if (detail.analytics && measurementId) enable();
        if (detail.ads && pixelId) enableAds();

        // Відкликали — гасимо обидві системи на місці.
        if (!detail.analytics && !detail.ads) disable();

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
