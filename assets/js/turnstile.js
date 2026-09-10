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

    // Код помилки від Cloudflare, якщо він її взагалі повідомив, і
    // чи ми ще чекаємо на ширину контейнера. Обидва потрібні лише
    // для журналу: коли замовлення йде повз перевірку, сторінка
    // мусить сказати ЧОМУ, а не «не вийшло».
    //
    // НАВІЩО ЦЕ ОКРЕМО. Причину «віджет не зʼявився» я двічі пояснив
    // неправильно — спершу «домен не в списку хостів», потім
    // «нульова ширина контейнера». Обидва рази виправлення виїжджало
    // на прод, і обидва рази наступне замовлення знову йшло повз
    // перевірку. Кожна така помилка коштує власнику тестового
    // замовлення й пів дня. Тому тепер сторінка розповідає свій стан
    // повністю, і гадати більше не треба.
    var lastError = "";
    var waiting = false;

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

    // Як часто перепитувати ширину там, де немає ResizeObserver, і
    // скільки взагалі чекати. Стеля потрібна, щоб на сторінці, де
    // блок так і не з'явиться, таймер не жив вічно.
    var POLL_MS = 150;
    var WAIT_LIMIT_MS = 20000;

    // Малюємо ЛИШЕ тоді, коли контейнер справді має ширину.
    //
    // НАЙДОРОЖЧА ПОМИЛКА В ЦІЙ ПЕРЕВІРЦІ — І НАЙТИХІША.
    //
    // Тут стояв просто render(), а target.hidden = false — після
    // нього. Виявилось, що в момент малювання контейнер має нульову
    // ширину, і то з двох незалежних причин:
    //
    //   1. сам блок оголошений у розмітці як hidden, а в стилях сайту
    //      стоїть [hidden]{display:none !important};
    //
    //   2. і головне — увесь #checkoutLayout лишається hidden, доки
    //      checkout.js не дочитає каталог (await loadCatalog()) і не
    //      побудує підсумок замовлення.
    //
    // Тобто це ПЕРЕГОНИ ДВОХ СКРИПТІВ. Turnstile малює одразу, щойно
    // завантажився скрипт Cloudflare; checkout.js показує layout
    // помітно пізніше. Хто перший — той і вирішує, чи буде віджет.
    //
    // Розмір "flexible" — це «100% ширини контейнера, мінімум 300px»
    // (developers.cloudflare.com/turnstile). Виміряти нема чого:
    // віджет створює свою обгортку з прихованим полем
    // cf-turnstile-response, а кадр — ні. Ні помилки, ні зворотного
    // виклику — просто порожній блок 0×0, не відрізнити від
    // «домен не дозволений». Саме так я його спершу й пояснив.
    //
    // ЗАМІРЯНО 10.09.2026 на bestbrnd4u.com: у власника віджет то
    // з'являвся («Успіх!» на екрані), то ні — три справжніх
    // замовлення в Chrome пішли повз перевірку, у журналі «скрипт є,
    // кадру немає, 19 с від відкриття». Секунди тут ні до чого:
    // шкода стається в першу секунду й лишається назавжди.
    function whenWide(target, draw) {

        if (target.getBoundingClientRect().width > 0) {
            draw();
            return;
        }

        var observer = null;
        var timer = null;
        var waited = 0;

        waiting = true;

        function stop() {
            waiting = false;
            if (observer) observer.disconnect();
            if (timer) root.clearInterval(timer);
        }

        function ready() {

            if (target.getBoundingClientRect().width <= 0) return;

            stop();
            draw();

        }

        if (typeof root.ResizeObserver === "function") {
            observer = new root.ResizeObserver(ready);
            observer.observe(target);
        }

        // Опитування — і запасний шлях там, де ResizeObserver немає,
        // і стеля очікування. Читання розміру раз на 150 мс нічого не
        // коштує; чекати вічно — коштувало б.
        timer = root.setInterval(function () {

            waited += POLL_MS;

            if (waited > WAIT_LIMIT_MS) {
                stop();
                return;
            }

            ready();

        }, POLL_MS);

    }

    function render() {

        var target = box();

        if (!target || widgetId !== null || !root.turnstile) return;

        // Спершу показуємо блок, потім чекаємо на ширину — інакше
        // ResizeObserver ніколи не спрацює: у display:none немає
        // навіть нульового боксу.
        target.hidden = false;

        whenWide(target, function () { draw(target); });

    }

    function draw(target) {

        if (widgetId !== null) return;

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
                lastError = String(code || "без коду");

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

        if (!target) return false;

        if (target.querySelector("iframe")) return true;

        // Кадр може лежати в shadow DOM — querySelector туди не
        // заглядає. Заміряно 10.09.2026: віджет був на екрані й
        // пройдений, а querySelector("iframe") нічого не знаходив.
        //
        // Це мірило лишилось ТІЛЬКИ для підказки покупцеві («зачекайте,
        // перевірка ще не пройдена»). Рішення, чи слати замовлення
        // через функцію, більше від нього не залежить: там питають
        // токен (checkout.js). Тобто помилка тут коштує підказки, а
        // не замовлення.
        var inner = target.querySelectorAll("*");

        for (var i = 0; i < inner.length; i++) {

            var shadow = inner[i].shadowRoot;

            if (shadow && shadow.querySelector("iframe")) return true;

        }

        return false;

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

    // Повний стан перевірки — для журналу подій.
    //
    // Коли замовлення йде повз перевірку, сторінка мусить сказати
    // ЧОМУ саме, а не «не вийшло». Кожне неправильне пояснення
    // коштує власнику тестового замовлення й половини дня, і таких
    // уже було два.
    //
    // Читається так:
    //   ключ немає         — у data/security.json порожньо
    //   скрипта немає      — Cloudflare не завантажився (блокувальник)
    //   не малювали        — render() ще не викликали
    //   чекаємо ширини     — контейнер нульовий, стежимо за ним
    //   помилка: <код>     — Cloudflare сам повідомив про відмову
    //   малювали, кадру немає — Cloudflare мовчки відмовив: оце і є
    //                        випадок, коли дивитись треба в кабінет
    function state() {

        var target = box();
        var width = -1;

        try {
            if (target) width = Math.round(target.getBoundingClientRect().width);
        } catch (error) {
            width = -1;
        }

        return {
            key: Boolean(siteKey),
            script: typeof root.turnstile !== "undefined",
            drawn: widgetId !== null,
            waiting: waiting,
            failed: failed,
            error: lastError,
            hidden: target ? Boolean(target.hidden) : null,
            width: width,
            iframe: Boolean(target && target.querySelector("iframe"))
        };

    }

    root.Turnstile = {
        init: init,
        enabled: enabled,
        token: token,
        reset: reset,
        state: state
    };

    if (typeof document !== "undefined") {

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", init);
        } else {
            init();
        }

    }

}(typeof window !== "undefined" ? window : globalThis));
