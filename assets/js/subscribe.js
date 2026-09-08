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

    var form = document.getElementById("subscribeForm");

    if (!form) return;

    var emailEl = document.getElementById("subscribeEmail");
    var consentEl = document.getElementById("subscribeConsent");
    var buttonEl = document.getElementById("subscribeSubmit");
    var noteEl = document.getElementById("subscribeNote");

    function say(text, kind) {

        noteEl.textContent = text;
        noteEl.className = "subscribe-note subscribe-note-" + kind;
        noteEl.hidden = false;

    }

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

}());
