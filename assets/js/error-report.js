// Помилки сайту: розповісти власнику, що зламалось у покупця.
//
// НАВІЩО
// -------
// Поламана сторінка нічого не показує. Кнопка «Купити» не спрацювала,
// каталог не намалювався — людина закриває вкладку й іде. Досі про це
// дізнавались від покупця, якщо покупець узагалі писав.
//
// Тепер браузер сам надсилає: адресу, текст помилки, файл і рядок.
// Плюс адреси, яких немає (сторінка 404) — саме так знаходяться биті
// посилання, поставлені колись у рекламі чи в описі профілю.
//
// ЩО СЮДИ НЕ ПОТРАПЛЯЄ
// ---------------------
// Нічого особистого: ні імені, ні пошти, ні кошика. Тільки шлях
// сторінки (без параметрів запиту), текст помилки й рядок браузера.
// Параметри відрізаються навмисно: у них буває пошуковий запит.
//
// ОДИН СВІДОМИЙ ВИНЯТОК — searchMiss()
// -------------------------------------
// Пошук, який не знайшов НІЧОГО, записується разом із самим запитом.
// Магазин додає товари руками, і «що шукали й не знайшли» — це те,
// чого не видно більше нізвідки: чи то товару немає, чи то він є, але
// зветься інакше.
//
// Умови, за яких це лишається журналом сайту, а не спостереженням за
// людиною, — у самій searchMiss(): згода на статистику, нуль
// результатів, ніяких пошт і чисел, і лише дописаний запит.
//
// ЩО БУДЕ, ЯКЩО БАЗА НЕДОСТУПНА
// ------------------------------
// Нічого. Журнал помилок не має права зламати сторінку, з якої його
// покликали, — тому кожен виклик обгорнутий і жодного разу не чекає
// на відповідь.

(function (root) {

    "use strict";

    // Скільки повідомлень з однієї сторінки. Поламаний цикл дає сотні
    // однакових помилок за секунду; трьох досить, щоб зрозуміти, що
    // саме впало.
    var PER_PAGE = 3;

    var sent = 0;
    var seen = {};

    // Клієнт Supabase оголошений як top-level const і властивістю
    // window НЕ стає — читати треба через typeof (та сама пастка, що
    // з живим залишком).
    function supabase() {

        if (typeof supabaseClient !== "undefined" && supabaseClient) return supabaseClient;

        return root.supabaseClient || null;

    }

    // Шлях без параметрів запиту: у ?search= буває те, що людина
    // шукала, а це вже не технічні дані.
    function page() {

        try {
            return String(root.location.pathname || "").slice(0, 300);
        } catch (error) {
            return "";
        }

    }

    // Власне відправка. Окремо від report(), бо в неї свій облік:
    // пошук, який нічого не знайшов, не має витрачати ліміт помилок
    // (і навпаки).
    function send(kind, message, source) {

        var key = kind + "|" + message;

        if (seen[key]) return;

        seen[key] = true;

        var client = supabase();

        if (!client || !client.rpc) return;

        try {

            client.rpc("report_issue", {
                p_kind: kind,
                p_page: page(),
                p_message: String(message).slice(0, 500),
                p_source: String(source || "").slice(0, 300),
                p_agent: String(root.navigator && root.navigator.userAgent || "").slice(0, 300)
            }).then(function () { /* відповідь не потрібна */ },
                function () { /* не записалось — і добре */ });

        } catch (error) {

            // Навіть невдалий виклик не має нічого ламати.

        }

    }

    function report(kind, message, source) {

        if (!message || sent >= PER_PAGE) return;

        sent++;

        send(kind, message, source);

    }

    // ------------------------------------------------------------------
    // Пошук, який нічого не знайшов
    // ------------------------------------------------------------------

    // Скільки запитів з однієї сторінки. Людина, яка шукає п'яте
    // поспіль і не знаходить, уже все сказала.
    var SEARCH_PER_PAGE = 5;

    // Скільки чекати, поки людина допише. Каталог перемальовується на
    // кожну натиснуту літеру, тож без цієї паузи в журнал ішло б
    // «л», «ла», «лак», «лако»…
    var SEARCH_SETTLE_MS = 2000;

    var searchSent = 0;
    var searchTimer = null;
    var searchPending = "";

    // Запит → те, що можна записати. Порожній рядок означає «не
    // записуємо».
    //
    // Пошта, @нік і телефон — це вже не «що шукали»: у пошук іноді
    // вставляють те, що збиралися ввести в інше поле. Такий запит
    // пропускаємо ЦІЛКОМ, а не вирізаємо з нього частину: обрізок
    // однаково нічого не скаже про попит.
    //
    // ЯК ВІДРІЗНИТИ ТЕЛЕФОН ВІД АРТИКУЛА. Спершу тут стояло «п'ять
    // цифр підряд — не пишемо», і це відкидало «coach 73995» —
    // тобто саме найцінніший запис у журналі: людина шукала
    // конкретну модель і не знайшла. А номер картки, написаний
    // групами по чотири, при цьому проходив.
    //
    // Різниця не в кількості цифр, а в ЛІТЕРАХ: в артикулі вони є
    // («mk 4903», «t129.407.22.031.00»), у телефоні й картці — ні.
    function cleanQuery(text) {

        var query = String(text || "").trim().replace(/\s+/g, " ");

        if (query.length < 2) return "";

        if (query.indexOf("@") >= 0) return "";

        var digits = query.replace(/\D/g, "");

        if (digits.length >= 6 && !/\p{L}/u.test(query)) return "";

        return query.slice(0, 100);

    }

    function searchMiss(text) {

        // Вміст, який набрала людина, — за тією самою згодою, що й
        // решта статистики. Немає Consent (стара сторінка) — питати
        // нема в кого, тож пишемо.
        if (root.Consent && !root.Consent.has("analytics")) return;

        if (searchSent >= SEARCH_PER_PAGE) return;

        var query = cleanQuery(text);

        if (!query) return;

        searchPending = query;

        if (searchTimer) clearTimeout(searchTimer);

        searchTimer = setTimeout(function () {

            searchTimer = null;

            searchSent++;

            send("search_miss", searchPending, "");

        }, SEARCH_SETTLE_MS);

    }

    // Помилки зі скриптів чужого походження браузер віддає як
    // «Script error.» без жодних подробиць — записувати нічого.
    function isOpaque(message, source) {
        return !source && /^script error/i.test(String(message || ""));
    }

    // Чужі скрипти, без яких магазин працює.
    //
    // Аналітика й телеметрія: їх ріже кожен другий блокувальник
    // реклами, а пошукові роботи не вантажать зовсім. Ні замовлення,
    // ні кошик, ні залишки від них не залежать.
    //
    // ТУТ НЕМАЄ cdn.jsdelivr.net — і це навмисно. Звідти йде клієнт
    // Supabase: без нього не працюють ні замовлення, ні живі
    // залишки, ні відгуки. Про його падіння знати треба обов'язково.
    var OPTIONAL_HOSTS = [
        "connect.facebook.net",
        "www.googletagmanager.com",
        "www.google-analytics.com",
        "static.cloudflareinsights.com",
        "assets.mailerlite.com",
        "www.google.com"
    ];

    function optional(address) {

        var text = String(address || "");

        for (var i = 0; i < OPTIONAL_HOSTS.length; i++) {

            // Саме «//хост/» — щоб «evil.com/www.googletagmanager.com»
            // не проскочило як своє.
            if (text.indexOf("//" + OPTIONAL_HOSTS[i] + "/") !== -1) return true;

        }

        return false;

    }

    root.addEventListener("error", function (event) {

        // Подія «error» прилітає і від файлів, які не завантажились.
        // Для них event.message порожній, а ціль — сам елемент.
        if (event && event.target && event.target !== root && !event.message) {

            var el = event.target;
            var tag = String(el.tagName || "").toLowerCase();

            // Скрипт або стиль, якого немає, — це зламана виливка:
            // саме той випадок, коли сторінка «просто не працює», а
            // в консолі власника все гаразд, бо в нього кеш. Картинки
            // пропускаємо: одне зникле фото сторінку не ламає.
            if (tag === "script" || tag === "link") {

                var address = el.src || el.href || tag;

                // ЧУЖИЙ ТРЕКЕР, ЯКОГО НЕ ПУСТИВ БРАУЗЕР, — НЕ НАША
                // ПОЛОМКА.
                //
                // Заміряно 10.09.2026: усі 20 останніх записів у
                // журналі були про це — fbevents.js, gtag/js і
                // beacon.min.js, майже всі з iPhone Safari та від
                // пошукових роботів. Тобто це блокувальники рекламних
                // скриптів і краулери, а не зламаний сайт.
                //
                // Ціна такого шуму не нульова: js_error вважається
                // поломкою, тобто щоденний звіт від нього червонів і
                // GitHub надсилав листа. Власник швидко привчився б
                // не читати звіт — разом зі справжніми помилками.
                //
                // ЧОМУ ПЕРЕЛІК, А НЕ «ВСЕ ЧУЖЕ». Без cdn.jsdelivr.net
                // не працює клієнт Supabase, тобто ні замовлення, ні
                // залишки, ні відгуки. Про його падіння знати треба
                // обов'язково. Тому мовчимо лише про те, від чого
                // магазин не залежить: аналітику й телеметрію.
                if (!optional(address)) {
                    report("js_error", "Не завантажився файл: " + address, "");
                }

            }

            return;

        }

        var message = event && event.message ? event.message : "";
        var source = event && event.filename
            ? event.filename + ":" + (event.lineno || 0)
            : "";

        if (isOpaque(message, source)) return;

        report("js_error", message, source);

    }, true);

    root.addEventListener("unhandledrejection", function (event) {

        var reason = event && event.reason;

        var message = reason && reason.message ? reason.message : String(reason || "");

        report("js_error", "Unhandled promise: " + message, reason && reason.stack
            ? String(reason.stack).split("\n")[1] || ""
            : "");

    });

    root.ErrorReport = {
        report: report,
        searchMiss: searchMiss,
        cleanQuery: cleanQuery,
        // Для тесту: правило «про що мовчимо» перевіряється
        // поведінкою, а не регуляркою по тексту цього файлу.
        optional: optional,
        OPTIONAL_HOSTS: OPTIONAL_HOSTS,
        PER_PAGE: PER_PAGE,
        SEARCH_PER_PAGE: SEARCH_PER_PAGE,
        SEARCH_SETTLE_MS: SEARCH_SETTLE_MS
    };

}(typeof window !== "undefined" ? window : globalThis));
