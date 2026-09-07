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

                // Про лист підтвердження треба сказати прямо: інакше
                // людина вважатиме себе підписаною й не зрозуміє, чому
                // листів немає.
                say(data.already
                    ? "Ви вже в списку — дякуємо!"
                    : "Готово! Перевірте пошту: там лист із підтвердженням.", "ok");

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
