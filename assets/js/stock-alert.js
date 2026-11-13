// ======================================
// stock-alert.js
// «Повідомити, коли з'явиться» на сторінці товару.
//
// Форму малює product.js усередині блока «Цей товар під замовлення»
// (form.stock-alert). Сторінка перемальовує цей блок, тому слухаємо
// документ, а не саму форму.
//
// Людина лишає пошту — Edge Function (site_action "stock-alert")
// записує підписку (міграція 046) і каже власнику, що є попит. Лист
// надсилає scripts/stock-alerts.js, щойно саме цей колір і розмір знову
// в наявності.
//
// Тексти — українською: на /en/ і /ru/ їх перекладає assets/js/i18n.js.
// ======================================

(function () {

    "use strict";

    function emailOk(value) {
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || "").trim());
    }

    function lang() {
        var l = window.I18N && window.I18N.lang;
        return l === "en" || l === "ru" ? l : null;
    }

    // Обраний ЗАРАЗ колір і розмір. Із форми — лише запас для товару
    // без вибору: інакше людина, що перемкнула розмір, підписалась би на
    // той, що стояв під час малювання сторінки.
    function selection(form) {
        var page = form.closest("#productPage") || document;
        var color = page.querySelector(".color.active");
        var size = page.querySelector(".size.active");
        return {
            color: color ? color.getAttribute("data-color") || "" : form.getAttribute("data-color") || "",
            size: size ? size.getAttribute("data-size") || "" : form.getAttribute("data-size") || ""
        };
    }

    function parts(form) {
        return {
            input: form.querySelector('input[name="email"]'),
            button: form.querySelector(".stock-alert-submit"),
            row: form.querySelector(".stock-alert-row"),
            status: form.querySelector(".stock-alert-status"),
            trap: form.querySelector('input[name="website"]')
        };
    }

    function say(form, text, kind) {
        var p = parts(form);
        p.status.textContent = text || "";
        p.status.hidden = !text;
        p.status.className = "stock-alert-status" + (kind ? " is-" + kind : "");
    }

    // Інший колір чи розмір — інша підписка: повертаємо форму до поля
    // пошти, а «готово» про попередній варіант прибираємо.
    function reset(form) {
        var p = parts(form);
        if (p.row) p.row.hidden = false;
        say(form, "");
        if (p.input) {
            p.input.classList.remove("invalid");
            p.input.removeAttribute("aria-invalid");
        }
    }

    document.addEventListener("click", function (event) {
        if (!event.target.closest(".color, .size")) return;
        document.querySelectorAll("form.stock-alert").forEach(reset);
    });

    document.addEventListener("submit", async function (event) {

        var form = event.target;

        if (!form.matches || !form.matches("form.stock-alert")) return;

        event.preventDefault();

        var p = parts(form);

        if (form.dataset.sending === "1") return;

        var email = p.input.value.trim();

        if (!emailOk(email)) {
            p.input.classList.add("invalid");
            p.input.setAttribute("aria-invalid", "true");
            p.input.focus();
            return say(form, "Введіть пошту, на яку прийде лист", "error");
        }

        p.input.classList.remove("invalid");
        p.input.removeAttribute("aria-invalid");

        if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
            return say(form, "Зараз не вдається підписатися. Напишіть нам у Telegram — @bestbrnd4u.", "error");
        }

        var chosen = selection(form);

        form.dataset.sending = "1";
        p.button.disabled = true;
        say(form, "");

        try {

            var response = await fetch(SUPABASE_URL + "/functions/v1/telegram-order-bot", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY
                },
                body: JSON.stringify({
                    site_action: "stock-alert",
                    product_id: Number(form.getAttribute("data-product-id")),
                    color: chosen.color,
                    size: chosen.size,
                    email: email,
                    website: p.trap ? p.trap.value : "",
                    lang: lang()
                })
            });

            var data = await response.json().catch(function () { return null; });

            if (data && data.ok) {
                p.row.hidden = true;
                say(form, data.already
                    ? "Ви вже чекаєте саме цей варіант — лист прийде, щойно він з'явиться."
                    : "Готово! Напишемо на " + email + ", щойно цей варіант з'явиться в наявності.", "ok");
                return;
            }

            var code = data && data.error;

            if (code === "bad_email") {
                p.input.classList.add("invalid");
                p.input.focus();
                return say(form, "Введіть пошту, на яку прийде лист", "error");
            }

            if (code === "limit") return say(form, "На цю пошту вже багато підписок. Напишіть нам у Telegram — @bestbrnd4u.", "error");

            if (response.status === 429) return say(form, "Забагато спроб за годину. Спробуйте пізніше.", "error");

            say(form, "Не вдалося підписатися. Напишіть нам у Telegram — @bestbrnd4u.", "error");

        } catch (err) {

            say(form, "Не вдалося підписатися. Напишіть нам у Telegram — @bestbrnd4u.", "error");

        } finally {

            delete form.dataset.sending;
            p.button.disabled = false;

        }

    });

})();
