// Перевірка «ви людина» на оформленні замовлення (Cloudflare Turnstile).
//
// НАВІЩО
// -------
// Замовлення в базу кладе браузер — публічним ключем із коду сайту.
// Отже, надіслати замовлення може будь-хто й скільки завгодно разів,
// не відкриваючи сайту взагалі. Сотня підроблених рядків це сотня
// повідомлень у Telegram і — найгірше — зайняті залишки: перевірка
// «останній екземпляр» вважає кожне відкрите замовлення зайнятою
// одиницею, тож фальшивий потік прибрав би з продажу реальні товари.
//
// ЧОМУ САМЕ TURNSTILE
// --------------------
// Він не показує головоломок: у переважній більшості випадків людина
// бачить рамку з галочкою й нічого не робить. Капча, яку треба
// розгадувати, на кроці оплати коштує продажів.
//
// ПОРОЖНІЙ КЛЮЧ = НІЧОГО НЕ ЗМІНЮЄТЬСЯ
// -------------------------------------
// Поки ключ не заданий (data/security.json), цей модуль не завантажує
// жодного стороннього скрипта й не малює нічого. Магазин працює точно
// так, як працював.
//
// ЩО ЦЕ НЕ ВИРІШУЄ САМЕ ПО СОБІ
// ------------------------------
// Токен, отриманий тут, нічого не вартий, доки його не звірили з
// Cloudflare секретним ключем — а це можливо лише на сервері
// (supabase/functions/telegram-order-bot/place-order.js). Перевірка в
// браузері — це ввічливе прохання, а не захист.

(function (root) {

    "use strict";

    var SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

    var siteKey = "";
    var widgetId = null;
    var ready = null;

    // Віджет спробували показати — і не вийшло. Далі поводимось так,
    // ніби перевірки немає зовсім (пояснення — у error-callback нижче).
    var failed = false;

    function box() {
        return document.getElementById("turnstileBox");
    }

    function loadScript() {

        if (ready) return ready;

        ready = new Promise(function (resolve, reject) {

            var existing = document.querySelector('script[data-turnstile]');

            if (existing) {
                existing.addEventListener("load", function () { resolve(); });
                existing.addEventListener("error", reject);
                return;
            }

            var script = document.createElement("script");

            script.src = SCRIPT;
            script.async = true;
            script.defer = true;
            script.setAttribute("data-turnstile", "1");

            script.onload = function () { resolve(); };
            script.onerror = function () { reject(new Error("Turnstile не завантажився")); };

            document.head.appendChild(script);

        });

        return ready;

    }

    function render() {

        var target = box();

        if (!target || widgetId !== null || !root.turnstile) return;

        widgetId = root.turnstile.render(target, {
            sitekey: siteKey,
            // Мова інтерфейсу — та сама, що на сайті.
            language: "uk",
            // Компактний вигляд: на кроці оформлення й так тісно.
            size: "flexible",

            // ДЛЯ ЧОГО ВИДАНО ТОКЕН.
            //
            // Cloudflare повертає цю позначку в siteverify, і сервер
            // її звіряє (place-order.js, TURNSTILE_ACTION). Хост
            // відповідає на питання «з нашого сайту?», дія — «з
            // нашого оформлення?».
            //
            // Зараз віджет на сайті один, тож різниці немає. Але
            // щойно перевірка з'явиться у формі відгуку чи в
            // підписці — токен звідти можна буде надіслати в
            // замовлення, і хост збігатиметься, бо форма теж наша.
            action: "checkout",

            // ВІДЖЕТ МОЖЕ НЕ З'ЯВИТИСЬ — І ЦЕ НЕ ГІПОТЕТИЧНО.
            //
            // Найчастіша причина: домен не внесений у список хостів
            // віджета в кабінеті Cloudflare. Тоді render() не падає й
            // нічого не кидає — просто лишає порожній блок 0×0.
            //
            // Саме так і сталось, коли ключ уперше поставили на деві:
            // у списку хостів були bestbrnd4u.com, localhost і
            // 127.0.0.1, а dev.bestbrnd4u.com — ні. Віджета немає,
            // токена немає, а сторінка вважала перевірку ввімкненою й
            // не давала оформити замовлення взагалі. Заміряно на
            // живому деві: enabled() = true, token() = порожньо.
            //
            // Тепер провал робить перевірку НЕДОСТУПНОЮ, а не
            // обов'язковою: магазин, який не продає через чужий збій,
            // гірший за магазин без перевірки. Сам захист від цього не
            // слабшає — токен усе одно звіряє сервер, і замовлення без
            // нього піде звичайним шляхом, як до появи Turnstile.
            "error-callback": function (code) {

                console.warn("Перевірка «ви людина» недоступна:", code);

                failed = true;

                if (target) target.hidden = true;

            },

            // Токен живе близько п'яти хвилин. Людина може заповнювати
            // форму довше — тоді Cloudflare сам просить оновитись, і
            // мовчазний прострочений токен обернувся б відмовою на
            // кнопці.
            "expired-callback": function () {

                if (root.turnstile && widgetId !== null) root.turnstile.reset(widgetId);

            }
        });

        target.hidden = false;

    }

    function token() {

        if (!siteKey || !root.turnstile || widgetId === null) return "";

        try {
            return root.turnstile.getResponse(widgetId) || "";
        } catch (error) {
            return "";
        }

    }

    // Токен одноразовий: після надсилання замовлення (чи невдалої
    // спроби) віджет треба скинути, інакше друга спроба піде з
    // використаним токеном і Cloudflare її відхилить.
    function reset() {

        if (!root.turnstile || widgetId === null) return;

        try {
            root.turnstile.reset(widgetId);
        } catch (error) {
            // Віджет міг не встигнути з'явитись — нічого страшного.
        }

    }

    // Чи справді щось намалювалось.
    //
    // ЧОМУ ЦЕ ПЕРЕВІРЯЄТЬСЯ ПО DOM, А НЕ ПО ПОДІЇ
    //
    // Заміряно на живому деві: коли домену немає в списку хостів
    // віджета, Cloudflare НЕ кличе error-callback і взагалі нічого не
    // повідомляє. render() повертає звичайний ідентифікатор, а в
    // блоці лишається порожній <div> розміром 0×0 — без жодного
    // кадру. Тобто подіям тут вірити не можна.
    //
    // Кадр — це і є віджет: усередині нього Cloudflare і показує
    // рамку, і рахує перевірку. Немає кадру — немає перевірки, і
    // чекати на токен нема від кого.
    //
    // Перевіряємо в момент запитання, а не за таймером: повільний, але
    // робочий віджет створює кадр одразу, а рахує вже в ньому. Таймер
    // же довелось би вгадувати — і на повільній мережі він вимикав би
    // справну перевірку.
    function rendered() {

        var target = box();

        return Boolean(target && target.querySelector("iframe"));

    }

    // Чи можна ВЗАГАЛІ вимагати перевірку.
    //
    // Тут стояло Boolean(siteKey) — тобто «ключ заданий». Це не те
    // саме, що «віджет працює»: коментар на сторінці оформлення
    // обіцяв, що при незʼявленому віджеті оформлення піде як завжди,
    // а насправді сторінка вимагала токен, якого нізвідки взятись, і
    // замовлення не можна було оформити взагалі.
    function enabled() {
        return Boolean(siteKey) && !failed && widgetId !== null && rendered();
    }

    function init() {

        if (!box()) return;

        // Через dataUrl(): у адресі має бути версія файлу, інакше
        // новий ключ не доїде до тих, у кого сторінка в кеші.
        fetch(typeof dataUrl === "function" ? dataUrl("data/security.json") : "data/security.json")
            .then(function (response) { return response.ok ? response.json() : {}; })
            .catch(function () { return {}; })
            .then(function (data) {

                siteKey = String((data && data.turnstileSiteKey) || "").trim();

                if (!siteKey) return;

                return loadScript().then(render);

            })
            .catch(function (error) {

                // Cloudflare недоступний — оформлення має працювати
                // далі. Замовлення тоді збережеться звичайним шляхом,
                // а від потоку лишається межа на боці бази.
                console.warn("Перевірка «ви людина» недоступна:", error && error.message);

            });

    }

    root.Turnstile = {
        init: init,
        enabled: enabled,
        token: token,
        reset: reset
    };

    if (typeof document !== "undefined") {

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", init);
        } else {
            init();
        }

    }

}(typeof window !== "undefined" ? window : globalThis));
