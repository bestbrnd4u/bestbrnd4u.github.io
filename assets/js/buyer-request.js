// ======================================
// buyer-request.js
// Заявка на байєр-сервіс (сторінка /bayer-service, блок #bayerContact).
//
// Людина лишає посилання на річ і контакт — Edge Function
// (site_action "buyer-request") надсилає власнику Telegram. Перевірка
// тут — для зручності людини; справжня — на сервері
// (supabase/functions/telegram-order-bot/buyer-request.js).
//
// Тексти — українською: на /en/ і /ru/ їх перекладає assets/js/i18n.js
// за словником data/i18n/strings.json.
// ======================================

(function () {

    "use strict";

    var form = document.getElementById("buyerRequestForm");

    if (!form) return;

    var done = document.getElementById("buyerDone");
    var status = document.getElementById("buyerStatus");
    var submit = document.getElementById("buyerSubmit");

    var fields = {
        links: document.getElementById("buyerLinks"),
        details: document.getElementById("buyerDetails"),
        delivery: document.getElementById("buyerDelivery"),
        budget: document.getElementById("buyerBudget"),
        name: document.getElementById("buyerName"),
        phone: document.getElementById("buyerPhone"),
        consent: document.getElementById("buyerConsent"),
        website: document.getElementById("buyerWebsite")
    };

    var errors = {
        item: document.getElementById("buyerItemError"),
        name: document.getElementById("buyerNameError"),
        phone: document.getElementById("buyerPhoneError"),
        consent: document.getElementById("buyerConsentError")
    };

    // Ті самі три написання номера, що приймає сервер
    // (normalizeCallBackPhone): 0XX…, 380XX…, XX… без нуля.
    function phoneOk(value) {
        var digits = String(value || "").replace(/\D/g, "");
        return (digits.length === 10 && digits.charAt(0) === "0")
            || (digits.length === 12 && digits.indexOf("380") === 0)
            || digits.length === 9;
    }

    function hasLink(value) {
        return /https?:\/\/[^\s.]+\.[^\s]+/i.test(String(value || ""));
    }

    function setError(key, field, text) {
        if (errors[key]) errors[key].textContent = text || "";
        if (field) {
            field.classList.toggle("invalid", Boolean(text));
            if (text) field.setAttribute("aria-invalid", "true");
            else field.removeAttribute("aria-invalid");
        }
    }

    function say(text, kind) {
        status.textContent = text || "";
        status.hidden = !text;
        status.className = "bayer-request-status" + (kind ? " is-" + kind : "");
    }

    // Повертає перше поле з помилкою (щоб поставити туди фокус) або null.
    function validate() {

        var first = null;

        var item = hasLink(fields.links.value) || fields.details.value.replace(/\s/g, "").length >= 3;
        setError("item", fields.details, item ? "" : "Додайте посилання на товар або опишіть, що шукаєте");
        if (!item) first = first || fields.links;

        var name = fields.name.value.trim().length > 0;
        setError("name", fields.name, name ? "" : "Як до вас звертатись?");
        if (!name) first = first || fields.name;

        var phone = phoneOk(fields.phone.value);
        setError("phone", fields.phone, phone ? "" : "Введіть номер у форматі +380 XX XXX XX XX");
        if (!phone) first = first || fields.phone;

        var consent = fields.consent.checked;
        setError("consent", null, consent ? "" : "Потрібна ваша згода, щоб ми могли відповісти");
        if (!consent) first = first || fields.consent;

        return first;

    }

    // Помилка зникає, щойно людина її виправила, — а не лише на
    // наступному «Надіслати».
    ["links", "details", "name", "phone"].forEach(function (key) {
        fields[key].addEventListener("input", function () {
            if (form.dataset.tried) validate();
        });
    });

    fields.consent.addEventListener("change", function () {
        if (form.dataset.tried) validate();
    });

    // Бюджет — лише цифри: «20 000», «20000 грн», «до 20к» зводимо до числа
    // ще в полі, щоб людина бачила, що саме піде.
    fields.budget.addEventListener("input", function () {
        var digits = fields.budget.value.replace(/\D/g, "").slice(0, 9);
        var pretty = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        if (fields.budget.value !== pretty) fields.budget.value = pretty;
    });

    function contact() {
        var checked = form.querySelector('input[name="contact"]:checked');
        return checked ? checked.value : "call";
    }

    function lang() {
        var l = window.I18N && window.I18N.lang;
        return l === "en" || l === "ru" ? l : "uk";
    }

    function showDone() {
        form.hidden = true;
        done.hidden = false;
        done.focus();
        if (typeof showToast === "function") showToast("Заявку надіслано");
    }

    document.getElementById("buyerAgain").addEventListener("click", function () {
        done.hidden = true;
        form.hidden = false;
        fields.links.focus();
    });

    var sending = false;

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        if (sending) return;

        form.dataset.tried = "1";
        say("");

        var first = validate();

        if (first) {
            first.focus();
            return;
        }

        if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
            return say("Зараз не вдається надіслати заявку. Напишіть нам у Telegram — @bestbrnd4u.", "error");
        }

        sending = true;
        submit.disabled = true;

        var label = submit.textContent;
        submit.textContent = "Надсилаємо…";

        try {

            var response = await fetch(SUPABASE_URL + "/functions/v1/telegram-order-bot", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY
                },
                body: JSON.stringify({
                    site_action: "buyer-request",
                    links: fields.links.value,
                    details: fields.details.value,
                    delivery: fields.delivery.value,
                    budget: fields.budget.value,
                    name: fields.name.value,
                    phone: fields.phone.value,
                    contact: contact(),
                    consent: fields.consent.checked,
                    website: fields.website.value,
                    lang: lang()
                })
            });

            var data = await response.json().catch(function () { return null; });

            if (data && data.ok) {
                form.reset();
                delete form.dataset.tried;
                showDone();
                return;
            }

            if (response.status === 429) {
                return say("Забагато заявок за годину. Спробуйте пізніше або напишіть нам у Telegram — @bestbrnd4u.", "error");
            }

            // Сервер перевірив і не прийняв — показуємо, що саме.
            var code = data && data.error;

            if (code === "bad_phone") { setError("phone", fields.phone, "Введіть номер у форматі +380 XX XXX XX XX"); fields.phone.focus(); return; }
            if (code === "no_item") { setError("item", fields.details, "Додайте посилання на товар або опишіть, що шукаєте"); fields.links.focus(); return; }
            if (code === "no_name") { setError("name", fields.name, "Як до вас звертатись?"); fields.name.focus(); return; }
            if (code === "no_consent") { setError("consent", null, "Потрібна ваша згода, щоб ми могли відповісти"); fields.consent.focus(); return; }

            say("Не вдалося надіслати заявку. Напишіть нам у Telegram — @bestbrnd4u.", "error");

        } catch (err) {

            // Не «перевірте інтернет»: сюди потрапляємо й тоді, коли
            // зламався наш бік (див. той самий коментар у contact-buttons.js).
            say("Не вдалося надіслати заявку. Напишіть нам у Telegram — @bestbrnd4u.", "error");

        } finally {

            sending = false;
            submit.disabled = false;
            submit.textContent = label;

        }

    });

})();
