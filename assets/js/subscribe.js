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

    // Форми може не бути зовсім, а налаштування в кабінеті — бути:
    // це вже не форма підписки, а галочка. Виходити тут означало б
    // лишити вкладку «Розсилки» мертвою, і помітили б це не одразу.
    if (!forms.length && !document.getElementById("newsletterSettings")) return;

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

    // Що саме ховати підписаному: смугу «Новинки й акції на пошту»
    // цілком, а у футері — саму форму.
    //
    // Вкладки «Розсилки» тут немає навмисно: там не форма підписки, а
    // налаштування з галочкою (див. нижче). Сховати її означало б
    // забрати єдине місце, де підпискою можна керувати.
    function offers() {

        return forms.map(function (form) {
            return form.closest("section.newsletter") || form;
        });

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

    // Хто зараз на сайті. Порожньо — значить не ввійшов.
    async function whoIsHere() {

        if (typeof supabaseClient === "undefined" || !supabaseClient) return null;

        if (typeof SUPABASE_URL === "undefined"
            || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") return null;

        var session = await supabaseClient.auth.getSession().catch(function () { return null; });

        var live = session && session.data && session.data.session;

        if (!live) return null;

        var email = String(live.user.email || "").toLowerCase();

        return email && live.access_token ? { token: live.access_token, email: email } : null;

    }

    // Один запит до функції. Повертає стан або порожньо, якщо не
    // вийшло: «не знаю» і «не підписаний» — різні речі.
    async function ask(action, token, extra) {

        var body = { site_action: action, accessToken: token };

        for (var key in (extra || {})) body[key] = extra[key];

        var response = await fetch(SUPABASE_URL + "/functions/v1/telegram-order-bot", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify(body),
        }).catch(function () { return null; });

        if (!response || !response.ok) return null;

        return await response.json().catch(function () { return null; });

    }

    // ==========================================
    // ВКЛАДКА «РОЗСИЛКИ» В КАБІНЕТІ
    //
    // Тут було те саме поле «впишіть пошту» й кнопка «Підписатись»,
    // що у футері. Підписаному це пропонувало підписатись ще раз, а
    // відписатись не давало взагалі: відписка жила лише в посиланні
    // внизу листів — тобто в тих самих листах, від яких людина й хоче
    // позбутись.
    //
    // Тепер це налаштування. Галочка показує стан і міняє його: зняв
    // і зберіг — відписався, поставив і зберіг — підписався знову.
    // ==========================================

    var settings = document.getElementById("newsletterSettings");
    var noEmailBox = document.getElementById("newsletterNoEmail");
    var wantedEl = document.getElementById("newsletterWanted");
    var whereEl = document.getElementById("newsletterWhere");
    var pendingEl = document.getElementById("newsletterPending");
    var saveEl = document.getElementById("newsletterSave");
    var messageEl = document.getElementById("newsletterMessage");

    // Стан, який зараз намальовано. Потрібен при збереженні: без нього
    // не відрізнити «зняв галочку» від «вона й так була знята».
    var shownState = "";

    function subscribed(state) {

        return state === "active" || state === "unconfirmed";

    }

    function drawSettings(state, email) {

        if (!settings) return;

        shownState = state;

        // Пошти в акаунті немає — вхід через Telegram. Підписувати
        // нема кого, тож замість галочки кажемо, з чого почати.
        if (!email) {
            settings.hidden = true;
            if (noEmailBox) noEmailBox.hidden = false;
            return;
        }

        if (noEmailBox) noEmailBox.hidden = true;

        settings.hidden = false;

        if (wantedEl) wantedEl.checked = subscribed(state);

        if (whereEl) {
            whereEl.textContent = subscribed(state)
                ? "Листи приходять на " + email
                : "Листи приходитимуть на " + email;
        }

        if (pendingEl) pendingEl.hidden = state !== "unconfirmed";

    }

    function saySettings(text, kind) {

        if (!messageEl) return;

        messageEl.textContent = text;
        messageEl.className = kind === "ok" ? "field-error field-ok" : "field-error";

    }

    if (saveEl) saveEl.addEventListener("click", async function () {

        saySettings("", "ok");

        var who = await whoIsHere();

        if (!who) return saySettings("Сесія завершилась. Увійдіть у кабінет ще раз");

        var wants = Boolean(wantedEl && wantedEl.checked);

        if (wants === subscribed(shownState)) {
            return saySettings(wants ? "Ви вже підписані" : "Ви й так не підписані");
        }

        var label = saveEl.textContent;

        saveEl.disabled = true;
        saveEl.textContent = "Зберігаємо...";

        var data = wants
            ? await ask("subscribe", who.token, { email: who.email, consent: true })
            : await ask("subscribe-off", who.token);

        saveEl.disabled = false;
        saveEl.textContent = label;

        if (!data || !data.ok) {
            return saySettings("Не вдалося зберегти. Спробуйте ще раз або напишіть нам у Telegram");
        }

        if (!wants) {

            remember(who.email, "none");

            drawSettings("none", who.email);

            showOffers();

            return saySettings("Відписано. Листи про замовлення приходитимуть як раніше", "ok");

        }

        // Підписка завжди проходить через лист підтвердження — навіть
        // повторна. Тому стан тут «не підтверджено», а не «підписаний»:
        // інакше галочка обіцяла б листи, яких ще не буде.
        var state = data.state === "active" ? "active" : "unconfirmed";

        remember(who.email, state);

        drawSettings(state, who.email);

        if (state === "active") hideOffers();

        saySettings(state === "active"
            ? "Ви підписані"
            : "Готово! Перевірте пошту: там лист із підтвердженням", "ok");

    });

    async function applyState() {

        var who = await whoIsHere();

        // Здогадка була, а людини немає або вона інша — повертаємо
        // блок на місце, поки не з'ясуємо стан саме цієї людини.
        if (!who) {
            if (guessed) showOffers();
            drawSettings("none", "");
            return;
        }

        var known = remembered(who.email);

        if (known) {

            if (known === "active") hideOffers();
            else if (guessed) showOffers();

            drawSettings(known, who.email);

            return;

        }

        var data = await ask("subscribe-status", who.token);

        if (!data || !data.state) {
            if (guessed) showOffers();
            drawSettings("none", who.email);
            return;
        }

        // «unknown» не запам'ятовуємо: це збій мережі чи MailerLite, а
        // не стан людини. Запам'ятати його означало б на добу сховати
        // форму (або не сховати) через випадкову невдачу.
        if (data.state !== "unknown") remember(who.email, data.state);

        if (data.state === "active") hideOffers();
        else if (guessed) showOffers();

        drawSettings(data.state === "unknown" ? "none" : data.state, who.email);

    }

    applyState();

}());
