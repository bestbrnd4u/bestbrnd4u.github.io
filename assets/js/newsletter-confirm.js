// Сторінка, на яку веде посилання з нашого листа про підписку.
//
// НАВІЩО ВОНА ВЗАГАЛІ Є
// ----------------------
// Лист підтвердження раніше надсилав MailerLite, і вів він на їхню
// сторінку — англійською, з їхнім оформленням. Відредагувати те й
// те на безкоштовному тарифі не можна. Тепер лист наш
// (supabase/functions/telegram-order-bot/mail.js), і сторінка теж.
//
// ЧОМУ ПІДТВЕРДЖУЄ ФУНКЦІЯ, А НЕ ЦЯ СТОРІНКА
// -------------------------------------------
// Щоб зробити підписку діючою, треба звернутись до MailerLite її ж
// ключем. Ключ дає право читати й правити ВЕСЬ список підписників —
// у коді сайту йому місця немає. Тому сторінка лише передає токен, а
// вирішує функція.
//
// ЧОТИРИ СТАНИ, А НЕ ДВА
// -----------------------
// «Готово» і «помилка» замало. Людина, яка відкрила лист удруге,
// мусить побачити «ви вже підписані», а не «недійсне посилання»:
// вона зробила все правильно, просто двічі. А той, у кого посилання
// протухло, мусить знати, що треба підписатись заново, — інакше він
// вирішить, що підписка є.

(function () {

    "use strict";

    var icon = document.getElementById("confirmIcon");
    var heading = document.getElementById("confirmHeading");
    var text = document.getElementById("confirmText");
    var actions = document.getElementById("confirmActions");

    if (!heading || !text) return;

    function show(face, title, message) {

        if (icon) icon.textContent = face;

        heading.textContent = title;
        text.textContent = message;

        if (actions) actions.hidden = false;

    }

    // Токен беремо з адреси. Формат не перевіряємо — це робить
    // функція: тут перевірка була б другим місцем, де записано те
    // саме правило, і рано чи пізно вони розійшлися б.
    var token = new URLSearchParams(window.location.search).get("token") || "";

    if (!token) {

        show("🤔", "Посилання неповне",
            "Здається, адресу скопіювали не цілком. Відкрийте лист ще раз"
            + " і натисніть кнопку в ньому.");

        return;

    }

    var STATES = {
        confirmed: ["🎉", "Підписку підтверджено",
            "Готово. Тепер листи про новинки та акції приходитимуть на цю адресу."
            + " Відписатись можна з будь-якого листа."],
        used: ["👍", "Ви вже підписані",
            "За цим посиланням уже переходили — підписка діє. Нічого робити не треба."],
        expired: ["⌛", "Посилання застаріло",
            "Воно діяло тиждень. Підпишіться ще раз унизу сторінки — надішлемо нове."],
        unknown: ["🤔", "Посилання не впізнали",
            "Можливо, адресу скопіювали не цілком. Відкрийте лист ще раз"
            + " або підпишіться заново внизу сторінки."],
        error: ["😕", "Не вдалося підтвердити",
            "Спробуйте ще раз за кілька хвилин. Якщо не вийде — напишіть нам"
            + " у Telegram, підпишемо вручну."]
    };

    function render(state) {

        var row = STATES[state] || STATES.error;

        show(row[0], row[1], row[2]);

    }

    (async function confirm() {

        try {

            var response = await fetch(SUPABASE_URL + "/functions/v1/telegram-order-bot", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY
                },
                body: JSON.stringify({
                    site_action: "subscribe-confirm",
                    token: token
                })
            });

            var data = await response.json().catch(function () { return null; });

            // Стан приходить і в успіху, і у відмові: саме він
            // розрізняє «вже підписані» й «посилання застаріло».
            render(data && data.state ? data.state : "error");

        } catch (error) {

            console.warn("Підтвердження підписки не вдалося:", error && error.message);

            render("error");

        }

    }());

}());
