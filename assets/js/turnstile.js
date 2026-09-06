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
            size: "flexible"
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

    function enabled() {
        return Boolean(siteKey);
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
