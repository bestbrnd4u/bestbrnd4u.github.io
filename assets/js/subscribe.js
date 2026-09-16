// ======================================
// Підписка на листи магазину
//
// ЩО БУЛО НЕ ТАК
// ---------------
// На кожній сторінці вантажився universal.js MailerLite — 52 КБ і
// з'єднання зі стороннім доменом. І не було ЖОДНОЇ форми підписки:
// акаунт підключений, скрипт їде, користі нуль.
//
// Тепер навпаки: скрипта немає, а форма є. Додати людину в список
// можна одним запитом до їхнього API — його робить наша функція, бо
// ключ MailerLite дає право правити весь список підписників, і в коді
// сайту йому місця немає.
//
// ЧОМУ ЗГОДА ОКРЕМОЮ ГАЛОЧКОЮ
// ----------------------------
// Додати людину в рекламну розсилку без явної згоди — те саме, що
// спам. За це блокують акаунти розсилки, і це правильно.
//
// Галочка не проставлена заздалегідь навмисно: «згода», яку людина не
// ставила, згодою не є.
// ======================================

(function () {

    "use strict";

    // ФОРМ НА СТОРІНЦІ МОЖЕ БУТИ КІЛЬКА.
    //
    // Була одна — у футері, і шукали її за id. Потім та сама підписка
    // знадобилась у кабінеті, вкладкою «Розсилки». Другий id означав
    // би другу копію всієї логіки: перевірки адреси, згоди, і —
    // найважливіше — п'яти різних відповідей про стан підписки.
    //
    // Тому шукаємо за класом і всередині кожної форми беремо поля
    // відносно неї. Розмітка футера не змінилась: у неї той самий
    // клас .subscribe, що був.
    var forms = [].slice.call(document.querySelectorAll("form.subscribe"));

    if (!forms.length) return;

    // Що сказати людині після натискання кнопки.
    //
    // Раніше тут було дві відповіді на всі випадки, і обидві часто
    // були неправдою: підписаний давно читав «перевірте пошту, там
    // лист» — а листа не надсилали, бо в списку він уже був.
    //
    // Найважливіший рядок тут — про НЕПІДТВЕРДЖЕНУ підписку. Це
    // відповідь на найчастіше «я ж підписувався, чому листів немає»:
    // лист підтвердження надіслали, але його не відкрили, і поки
    // цього не сталося, розсилка не йде.
    function subscribeMessage(state) {

        if (state === "active") {
            return "Ця пошта вже підписана — дякуємо, що з нами!";
        }

        if (state === "unconfirmed") {
            return "Ця пошта вже в списку, але підписку ще не підтверджено."
                + " Перевірте пошту (і теку «Спам») — там лист із посиланням.";
        }

        if (state === "already") {
            return "Ця пошта вже в списку.";
        }

        // "new" і "again": в обох випадках лист підтвердження щойно
        // пішов, тож і сказати треба те саме.
        return "Готово! Перевірте пошту: там лист із підтвердженням.";

    }

    forms.forEach(function (form) {

    var emailEl = form.querySelector("input[type=email]");
    var consentEl = form.querySelector(".subscribe-consent input[type=checkbox]");
    var buttonEl = form.querySelector("button[type=submit], button:not([type])");
    var noteEl = form.querySelector(".subscribe-note");

    if (!emailEl || !consentEl || !buttonEl || !noteEl) return;

    function say(text, kind) {

        noteEl.textContent = text;
        noteEl.className = "subscribe-note subscribe-note-" + kind;
        noteEl.hidden = false;

    }

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        noteEl.hidden = true;

        var email = emailEl.value.trim();

        // Перевірка навмисно проста. Складна регулярка для пошти
        // відкидає справжні адреси й однаково не доводить, що скринька
        // існує — це доводить лист підтвердження.
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
            return say("Перевірте адресу пошти.", "error");
        }

        if (!consentEl.checked) {
            return say("Потрібна згода на отримання листів.", "error");
        }

        if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
            return say("Підписка зараз не працює. Напишіть нам у Telegram.", "error");
        }

        buttonEl.disabled = true;

        var label = buttonEl.textContent;

        buttonEl.textContent = "Підписуємо...";

        try {

            var response = await fetch(SUPABASE_URL + "/functions/v1/telegram-order-bot", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY
                },
                body: JSON.stringify({
                    site_action: "subscribe",
                    email: email,
                    consent: true
                })
            });

            if (response.status === 429) {
                return say("Забагато спроб. Спробуйте за годину.", "error");
            }

            var data = await response.json().catch(function () { return null; });

            if (data && data.ok) {

                say(subscribeMessage(data.state), "ok");

                form.reset();

                return;

            }

            if (data && data.error === "not_configured") {
                return say("Підписка ще не налаштована. Напишіть нам у Telegram.", "error");
            }

            say("Не вдалося підписати. Спробуйте ще раз або напишіть нам у Telegram.", "error");

        } catch (error) {

            console.warn("Підписка не вдалася:", error && error.message);

            say("Не вдалося підписати. Спробуйте ще раз або напишіть нам у Telegram.", "error");

        } finally {

            buttonEl.disabled = false;
            buttonEl.textContent = label;

        }

    });

    });

    // ==========================================
    // ПІДПИСАНОМУ НЕ ПРОПОНУЄМО ПІДПИСАТИСЬ
    //
    // Блок «Новинки й акції на пошту» стоїть на шести сторінках, а
    // форма у футері — на вісімнадцяти. Той, хто вже підписаний,
    // бачив пропозицію підписатись на кожній із них. Це не просто
    // зайве: воно змушує сумніватись, чи підписка взагалі спрацювала.
    //
    // ЧОМУ ПИТАЄМО ФУНКЦІЮ, А НЕ ДИВИМОСЬ САМІ. Список підписників
    // живе в MailerLite, а ключ до нього — у секретах функції. У
    // браузері знати про підписку нізвідки.
    //
    // ЧОМУ ЛИШЕ ДЛЯ ТИХ, ХТО ВВІЙШОВ. Функція відповідає про власника
    // токена сесії й ні про кого іншого: маршрут, який каже «так/ні»
    // про довільну адресу, був би способом перевіряти чужі пошти.
    // ==========================================

    // Скільки віримо відповіді. Доба: за цей час людина встигає
    // підтвердити підписку з листа, а помилитись тут дорого лише в
    // один бік — зайвий раз показати форму не страшно.
    var REMEMBER_HOURS = 24;

    var MEMORY_KEY = "bb4u:subscribed";

    // Форму в кабінеті (вкладка «Розсилки») не чіпаємо: це місце, де
    // підпискою КЕРУЮТЬ, і сховати її означало б забрати єдиний
    // спосіб підписатись у того, хто передумав.
    function offers() {

        return forms
            .filter(function (form) { return !form.classList.contains("subscribe-account"); })
            .map(function (form) { return form.closest("section.newsletter") || form; });

    }

    function hideOffers() {

        offers().forEach(function (node) { node.hidden = true; });

    }

    function showOffers() {

        offers().forEach(function (node) { node.hidden = false; });

    }

    function remembered(email) {

        try {

            var saved = JSON.parse(window.localStorage.getItem(MEMORY_KEY) || "null");

            if (!saved || saved.email !== email) return null;

            if (Date.now() - Number(saved.at) > REMEMBER_HOURS * 3600000) return null;

            return saved.state;

        } catch (error) {

            // Приватне вікно або заборонені дані сайту — просто
            // спитаємо функцію ще раз.
            return null;

        }

    }

    function remember(email, state) {

        try {
            window.localStorage.setItem(MEMORY_KEY, JSON.stringify({
                email: email,
                state: state,
                at: Date.now(),
            }));
        } catch (error) { /* див. вище */ }

    }

    // ЩОБ БЛОК НЕ БЛИМНУВ.
    //
    // Відповідь функції приходить через мережу, а сесію Supabase теж
    // віддає не одразу. Якби ми чекали на це, підписаний бачив би
    // «Підпишіться!» частку секунди на КОЖНІЙ сторінці — тобто рівно
    // те, від чого ми його позбавляємо, тільки блимаюче.
    //
    // Тому ховаємо одразу, якщо вчорашня відповідь ще жива. Помилитись
    // тут можна лише в одному разі: у цьому браузері ввійшла інша
    // людина. Перевірка нижче це побачить і поверне блок на місце.
    var guessed = false;

    (function () {

        try {

            var saved = JSON.parse(window.localStorage.getItem(MEMORY_KEY) || "null");

            if (!saved || saved.state !== "active") return;

            if (Date.now() - Number(saved.at) > REMEMBER_HOURS * 3600000) return;

            guessed = true;

            hideOffers();

        } catch (error) { /* приватне вікно — просто спитаємо функцію */ }

    }());

    async function hideIfSubscribed() {

        // Сторінка без клієнта Supabase або без його адрес — тут
        // просто нема кого й нема в кого питати.
        if (typeof supabaseClient === "undefined" || !supabaseClient) return;

        if (typeof SUPABASE_URL === "undefined"
            || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") return;

        var session = await supabaseClient.auth.getSession().catch(function () { return null; });

        var token = session && session.data && session.data.session
            ? session.data.session.access_token
            : "";

        var email = session && session.data && session.data.session
            ? String(session.data.session.user.email || "").toLowerCase()
            : "";

        // Здогадка була, а людини немає або вона інша — повертаємо
        // блок на місце, поки не з'ясуємо стан саме цієї людини.
        if (!token || !email) {
            if (guessed) showOffers();
            return;
        }

        var known = remembered(email);

        if (known === "active") {
            hideOffers();
            return;
        }

        if (known) {
            if (guessed) showOffers();
            return;
        }

        var response = await fetch(SUPABASE_URL + "/functions/v1/telegram-order-bot", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ site_action: "subscribe-status", accessToken: token }),
        }).catch(function () { return null; });

        if (!response || !response.ok) {
            if (guessed) showOffers();
            return;
        }

        var data = await response.json().catch(function () { return null; });

        if (!data || !data.state) {
            if (guessed) showOffers();
            return;
        }

        // «unknown» не запам'ятовуємо: це збій мережі чи MailerLite, а
        // не стан людини. Запам'ятати його означало б на добу
        // сховати форму (або не сховати) через випадкову невдачу.
        if (data.state !== "unknown") remember(email, data.state);

        if (data.state === "active") hideOffers();
        else if (guessed) showOffers();

    }

    hideIfSubscribed();

}());
