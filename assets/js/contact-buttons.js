// ДВІ ПЛАВАЮЧІ КНОПКИ: ЗВОРОТНИЙ ДЗВІНОК І ЗВ'ЯЗОК
// ==================================================================
//
// ЧОМУ ЗЛІВА, А НЕ ЯК НА MD
//
// На MD дзвінок зліва, чат справа. Правий нижній кут у нас зайнятий
// утрьох: стрілка «нагору» (right:30 bottom:30), спливний банер акції
// (right:24 bottom:24) і сповіщення (right:20 bottom:20). Четвертий
// туди не влізе, не посунувши трьох. Лівий кут вільний — обидві туди,
// стовпчиком.
//
// ЧОМУ РОЗМІТКА ТУТ, А НЕ В HTML
//
// Кнопки потрібні на всіх вісімнадцяти сторінках, а catalog.html і
// product.html — ще й шаблони для 136 згенерованих. Те, що лежить у
// вісімнадцяти файлах, рано чи пізно розходиться: щойно ловив таке з
// шевроном акордеона, який на чотирьох сторінках був <svg>, а на
// пʼятій — знаком зі шрифту. Тут джерело одне.
//
// Натомість зʼявляється інший ризик: сторінка без цього файла мовчки
// лишиться без кнопок. Його стереже test-contact-buttons [1].
(function () {

    "use strict";

    // ==============================================================
    // ЗНАЧКИ
    //
    // Та сама мова, що в решти значків сайту: контур, товщина 2,
    // круглі кінці, колір від тексту. Розмір задає CSS, не атрибути,
    // — інакше кожне місце довелося б правити окремо.
    // ==============================================================

    var ЗНАЧКИ = {

        phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',

        chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20.5l1.5-5.2a8.5 8.5 0 0 1-.9-3.8 8.4 8.4 0 0 1 8.4-9 8.4 8.4 0 0 1 9 9z"/>',

        mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22 6 12 13 2 6"/>',

        instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2"/>',

        close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'

    };

    // Telegram — єдиний суцільний значок: паперовий літачок пізнають
    // саме залитим, контуром він читається як випадкова пташка.
    var ЗНАЧОК_TG = '<svg class="dock-icon dock-icon-solid" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
        + '<path d="M21.9 4.3 18.6 20c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5'
        + 'l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.1 13.7 1.2 12.2c-1-.3-1.1-1 .2-1.5l19.3-7.4'
        + 'c.9-.3 1.6.2 1.2 1z"/></svg>';

    function значок(имʼя) {

        return '<svg class="dock-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
            + ЗНАЧКИ[имʼя] + '</svg>';

    }

    // ==============================================================
    // КАНАЛИ
    //
    // Рівно ті, що на сторінці контактів і у футері. Якщо десь
    // зміниться номер чи пошта, це місце розійдеться з рештою —
    // тому test-contact-buttons [3] звіряє його з contacts.html.
    // ==============================================================

    var КАНАЛИ = [
        {
            href: "https://t.me/bestbrnd4u",
            назва: "Telegram",
            підпис: "@bestbrnd4u",
            значок: ЗНАЧОК_TG,
            зовні: true
        },
        {
            href: "https://www.instagram.com/bestbrnd4u",
            назва: "Instagram",
            підпис: "@bestbrnd4u",
            значок: значок("instagram"),
            зовні: true
        },
        {
            href: "mailto:bestbrnd4u@proton.me",
            назва: "Пошта",
            підпис: "bestbrnd4u@proton.me",
            значок: значок("mail")
        },
        {
            href: "tel:+380737288291",
            назва: "Телефон",
            підпис: "+380 73 728 82 91",
            значок: значок("phone")
        }
    ];

    // Те саме, що написано на сторінці контактів. Обіцяти менше, ніж
    // там, безглуздо; обіцяти більше — нечесно.
    var ГРАФІК = "Пн–Нд 09:00–20:00";

    // ==============================================================
    // ДОК
    // ==============================================================

    var док = document.createElement("div");

    док.className = "contact-dock";

    док.innerHTML = [

        // Чат зверху, дзвінок знизу — телефон лишається там само, де
        // його звикли шукати на MD, у самому кутку.
        //
        // Підпис у aria-label слово в слово такий, як у видимій
        // підказці. Якби вони розходились («Замовити дзвінок» на
        // екрані, «Замовити зворотний дзвінок» для читалки), голосове
        // керування не знайшло б кнопку за тим, що на ній написано
        // (WCAG 2.5.3).
        '<div class="dock-slot">',
        '  <button type="button" class="dock-btn" id="dockChat"',
        '          aria-label="Написати нам"',
        '          aria-expanded="false" aria-controls="dockChannels">',
        '    ', значок("chat"),
        '    <span class="dock-hint" aria-hidden="true">Написати нам</span>',
        '  </button>',
        '</div>',

        '<div class="dock-slot">',
        '  <button type="button" class="dock-btn" id="dockCall"',
        '          aria-label="Замовити дзвінок"',
        '          aria-expanded="false" aria-controls="dockCallback">',
        '    ', значок("phone"),
        '    <span class="dock-hint" aria-hidden="true">Замовити дзвінок</span>',
        '  </button>',
        '</div>'

    ].join("\n");

    // ==============================================================
    // ПАНЕЛЬ КАНАЛІВ
    // ==============================================================

    var панельКаналів = document.createElement("div");

    панельКаналів.className = "dock-panel";
    панельКаналів.id = "dockChannels";
    панельКаналів.hidden = true;

    панельКаналів.innerHTML = [

        '<div class="dock-panel-head">',
        '  <div>',
        '    <p class="dock-panel-title">Чим допомогти?</p>',
        '    <p class="dock-panel-note">Відповідаємо ' + ГРАФІК + '</p>',
        '  </div>',
        '  <button type="button" class="dock-panel-close" data-dock-close>',
        '    ' + значок("close"),
        '    <span class="dock-sr">Закрити</span>',
        '  </button>',
        '</div>',

        '<ul class="dock-channels">',

        КАНАЛИ.map(function (к) {

            return [
                '<li><a class="dock-channel" href="' + к.href + '"',
                к.зовні ? ' target="_blank" rel="noopener"' : '',
                '>',
                '  <span class="dock-channel-icon">' + к.значок + '</span>',
                '  <span class="dock-channel-text">',
                '    <span class="dock-channel-name">' + к.назва + '</span>',
                '    <span class="dock-channel-sub">' + к.підпис + '</span>',
                '  </span>',
                '</a></li>'
            ].join("");

        }).join(""),

        '</ul>'

    ].join("\n");

    // ==============================================================
    // ЗВОРОТНИЙ ДЗВІНОК
    //
    // Поле звичайне, type="tel", без маски — рівно як на оформленні
    // замовлення. Маска виглядає охайніше, але ламає вставку номера
    // з буфера й заважає тим, хто вводить із кодом країни.
    // ==============================================================

    var панельДзвінка = document.createElement("div");

    панельДзвінка.className = "dock-panel";
    панельДзвінка.id = "dockCallback";
    панельДзвінка.hidden = true;

    панельДзвінка.innerHTML = [

        '<div class="dock-panel-head">',
        '  <div>',
        '    <p class="dock-panel-title">Замовте зворотний дзвінок</p>',
        '    <p class="dock-panel-note">Передзвонимо протягом робочого дня, ' + ГРАФІК + '</p>',
        '  </div>',
        '  <button type="button" class="dock-panel-close" data-dock-close>',
        '    ' + значок("close"),
        '    <span class="dock-sr">Закрити</span>',
        '  </button>',
        '</div>',

        '<form class="dock-form" novalidate>',
        '  <label class="dock-field" for="dockPhone">Ваш номер телефону</label>',
        '  <input type="tel" id="dockPhone" name="phone" autocomplete="tel"',
        '         placeholder="+380 73 728 82 91" required',
        '         aria-describedby="dockPhoneHint">',
        '  <p class="dock-hint-text" id="dockPhoneHint">Формат: +380 XX XXX XX XX</p>',
        '  <p class="dock-message" role="status" aria-live="polite"></p>',
        '  <button type="submit" class="btn btn-primary dock-submit">Передзвоніть мені</button>',
        '  <p class="dock-legal">Залишаючи номер, ви погоджуєтесь з',
        '     <a href="/privacy-policy#order-data">обробкою даних</a>.</p>',
        '</form>'

    ].join("\n");

    document.body.appendChild(док);
    document.body.appendChild(панельКаналів);
    document.body.appendChild(панельДзвінка);

    // ==============================================================
    // ВІДКРИТИ / ЗАКРИТИ
    //
    // Панелі взаємно виключні: відкрив одну — друга закрилась.
    // Інакше дві картки налазять одна на одну в тому самому кутку.
    // ==============================================================

    var пари = [
        { кнопка: document.getElementById("dockChat"), панель: панельКаналів },
        { кнопка: document.getElementById("dockCall"), панель: панельДзвінка }
    ];

    function закрити(пара) {

        if (пара.панель.hidden) return;

        пара.панель.classList.remove("is-open");
        пара.кнопка.setAttribute("aria-expanded", "false");
        пара.кнопка.classList.remove("is-active");

        // Прибирати з дерева доступності треба ПІСЛЯ анімації, інакше
        // панель зникає ривком.
        window.setTimeout(function () {
            if (!пара.панель.classList.contains("is-open")) пара.панель.hidden = true;
        }, 200);

    }

    function закритиВсі(крім) {
        пари.forEach(function (п) { if (п !== крім) закрити(п); });
    }

    function відкрити(пара) {

        закритиВсі(пара);

        пара.панель.hidden = false;

        // Один кадр на те, щоб браузер побачив елемент у потоці —
        // без цього перехід не програється, бо hidden і клас
        // знімаються в одному кадрі.
        window.requestAnimationFrame(function () {
            пара.панель.classList.add("is-open");
        });

        пара.кнопка.setAttribute("aria-expanded", "true");
        пара.кнопка.classList.add("is-active");

        // Куди ставити фокус.
        //
        // Просте «перший, на кого можна стати» дає хрестик: у розмітці
        // він іде перед вмістом. Людина відкриває «замовити дзвінок» і
        // одразу стоїть на кнопці «закрити» — Enter згортає панель,
        // яку щойно відкрили.
        //
        // Тому: поле, якщо воно є; інакше перше посилання; хрестик —
        // лише коли більше нема нічого.
        var ціль = пара.панель.querySelector("input")
            || пара.панель.querySelector("a")
            || пара.панель.querySelector("button");

        if (ціль) ціль.focus({ preventScroll: true });

    }

    пари.forEach(function (пара) {

        пара.кнопка.addEventListener("click", function () {

            if (пара.панель.hidden) відкрити(пара);
            else { закрити(пара); пара.кнопка.focus(); }

        });

        пара.панель.querySelectorAll("[data-dock-close]").forEach(function (x) {

            x.addEventListener("click", function () {
                закрити(пара);
                пара.кнопка.focus();
            });

        });

    });

    // Esc закриває верхню панель і повертає фокус на кнопку — інакше
    // фокус лишається на зниклому елементі й наступний Tab починає з
    // початку сторінки.
    document.addEventListener("keydown", function (e) {

        if (e.key !== "Escape") return;

        пари.forEach(function (пара) {

            if (пара.панель.hidden) return;

            закрити(пара);
            пара.кнопка.focus();

        });

    });

    // Клік повз панель закриває її. Клік ПО доку не рахуємо: там
    // спрацює власний обробник кнопки, і панель смикнулась би двічі.
    document.addEventListener("click", function (e) {

        if (док.contains(e.target)) return;

        пари.forEach(function (пара) {
            if (!пара.панель.hidden && !пара.панель.contains(e.target)) закрити(пара);
        });

    });

    // ==============================================================
    // ВІДПРАВКА НОМЕРА
    // ==============================================================

    var форма = панельДзвінка.querySelector(".dock-form");
    var поле = панельДзвінка.querySelector("#dockPhone");
    var рядок = панельДзвінка.querySelector(".dock-message");
    var кнопкаВідправки = панельДзвінка.querySelector(".dock-submit");

    function сказати(текст, тип) {

        рядок.textContent = текст;
        рядок.className = "dock-message" + (тип ? " is-" + тип : "");

    }

    // Приймаємо і 0XX…, і +380XX…, і 380XX… — людина вводить так, як
    // звикла. Зводимо до одного вигляду вже тут, щоб у Telegram
    // прилітав номер, на який можна натиснути.
    function нормалізувати(сире) {

        var цифри = String(сире || "").replace(/\D/g, "");

        if (цифри.length === 10 && цифри.charAt(0) === "0") return "+38" + цифри;
        if (цифри.length === 12 && цифри.slice(0, 3) === "380") return "+" + цифри;
        if (цифри.length === 9) return "+380" + цифри;

        return null;

    }

    форма.addEventListener("submit", async function (e) {

        e.preventDefault();

        var номер = нормалізувати(поле.value);

        if (!номер) {

            поле.setAttribute("aria-invalid", "true");
            поле.focus();

            return сказати("Введіть номер у форматі +380 XX XXX XX XX", "error");

        }

        поле.removeAttribute("aria-invalid");

        if (typeof SUPABASE_URL === "undefined"
            || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {

            return сказати("Зараз не вдається відправити. Напишіть нам у Telegram.", "error");

        }

        кнопкаВідправки.disabled = true;

        var напис = кнопкаВідправки.textContent;

        кнопкаВідправки.textContent = "Відправляємо…";

        сказати("");

        try {

            var відповідь = await fetch(SUPABASE_URL + "/functions/v1/telegram-order-bot", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY
                },
                body: JSON.stringify({
                    site_action: "call-back",
                    phone: номер,
                    // Звідки замовили дзвінок: на сторінці товару це
                    // половина розмови.
                    page: location.pathname + location.search
                })
            });

            if (відповідь.status === 429) {
                return сказати("Забагато спроб. Спробуйте за годину.", "error");
            }

            var дані = await відповідь.json().catch(function () { return null; });

            if (дані && дані.ok) {

                форма.reset();

                сказати("Готово. Передзвонимо протягом робочого дня.", "ok");

                if (typeof showToast === "function") {
                    showToast("Замовлення дзвінка прийнято");
                }

                return;

            }

            сказати("Не вдалось відправити. Напишіть нам у Telegram.", "error");

        } catch (err) {

            // Сюди потрапляємо і тоді, коли інтернет цілий, а не
            // відповідає наш бік: скажімо, функцію не перерозгорнули
            // після випуску, і браузер відкидає відповідь без CORS.
            //
            // Писати в такому разі «перевірте інтернет» означає
            // звинуватити людину в нашій помилці — і вона піде
            // перезавантажувати роутер замість того, щоб написати.
            сказати("Не вдалось відправити. Напишіть нам у Telegram — там відповімо.", "error");

        } finally {

            кнопкаВідправки.disabled = false;
            кнопкаВідправки.textContent = напис;

        }

    });

})();
