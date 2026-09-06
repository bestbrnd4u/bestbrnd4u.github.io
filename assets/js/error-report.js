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

    function report(kind, message, source) {

        if (!message || sent >= PER_PAGE) return;

        var key = kind + "|" + message;

        if (seen[key]) return;

        seen[key] = true;
        sent++;

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

    // Помилки зі скриптів чужого походження браузер віддає як
    // «Script error.» без жодних подробиць — записувати нічого.
    function isOpaque(message, source) {
        return !source && /^script error/i.test(String(message || ""));
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
                report("js_error", "Не завантажився файл: " + (el.src || el.href || tag), "");
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
        PER_PAGE: PER_PAGE
    };

}(typeof window !== "undefined" ? window : globalThis));
