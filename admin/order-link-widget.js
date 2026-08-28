// ======================================
// Посилання на товар — для постів у Telegram
//
// ЩО ЦЕ ВИРІШУЄ
// --------------
// Щоб написати пост про товар, потрібне посилання на нього. Адреса
// збирається з slug-а («/p/<slug>/»), а slug генерується збіркою — в
// адмінці його ніде не видно. Доводилось або шукати товар на сайті й
// копіювати з адресного рядка, або складати адресу вручну.
//
// Поле нічого не зберігає. Воно лише показує готові посилання й дає
// кнопку «Скопіювати» — значення в JSON товару не пишеться взагалі.
//
// ДВА ПОСИЛАННЯ, І ОБИДВА ПОТРІБНІ
// ---------------------------------
//   1) На сторінку товару — це те, що кладуть у пост. Людина
//      натискає, бачить фото, ціну, розміри.
//   2) «Замовити в Telegram» — відкриває чат із уже набраним
//      повідомленням: назва товару й посилання на нього. Покупцю
//      лишається натиснути «надіслати», а вам одразу видно, про що
//      мова, без «а це яка саме сумка?».
//
// ЧОМУ АДРЕСА ЗАВЖДИ БОЙОВА
// --------------------------
// Посилання будується на productionUrl із site.config.json, а не на
// поточному хості. Інакше, редагуючи товар у дев-адмінці, ви
// скопіювали б у пост адресу dev.bestbrnd4u.com — сайту, закритого від
// індексації, з тестовими даними. Помилку помітили б не одразу, а вже
// по скаргах покупців.
// ======================================

(function () {

    if (typeof CMS === "undefined") return;

    var h = window.h || (window.React && window.React.createElement);
    var createClass = window.createClass || window.createReactClass;

    if (!h || !createClass) return;

    // Нік у Telegram для особистого листування — той самий, що в
    // контактах і в підвалі сайту.
    var TELEGRAM = "bestbrnd4u";

    // Логін БОТА — інша річ, і в коді його немає: він живе в
    // налаштуваннях Supabase-функції. Тому читаємо з
    // data/telegram.json, який редагується в адмінці
    // («Сторінки» → «Telegram-бот»).
    //
    // Вгадувати не можна: логін бота не збігається з назвою, яку видно
    // в шапці чату, і помилка означала б мертве посилання в рілсі —
    // помітили б це вже по тому, що ніхто не пише.
    var botUsername = null;      // null = ще не завантажили
    var botLoaded = false;
    var botWaiters = [];

    function loadBotUsername(onReady) {

        if (botLoaded) return onReady(botUsername);

        botWaiters.push(onReady);

        if (botWaiters.length > 1) return;   // запит уже летить

        fetch("/data/telegram.json", { cache: "no-store" })
            .then(function (response) { return response.ok ? response.json() : {}; })
            .catch(function () { return {}; })
            .then(function (data) {

                botUsername = String((data && data.botUsername) || "").replace(/^@/, "").trim();
                botLoaded = true;

                botWaiters.forEach(function (fn) { fn(botUsername); });
                botWaiters = [];

            });

    }

    // Глибоке посилання в бота: t.me/<логін>?start=product_15.
    // Telegram передає його боту як звичайне «/start product_15» —
    // формат розбирає supabase/functions/telegram-order-bot/format.js.
    function botLink(id) {

        if (!botUsername || !id) return "";

        return "https://t.me/" + botUsername + "?start=product_" + id;

    }

    function siteUrl() {

        var env = window.SITE_ENVIRONMENT || {};

        // productionUrl проставляє scripts/apply-site-env.js. Запасний
        // варіант — поточний хост: краще робоче посилання на дев, ніж
        // порожнє поле.
        return (env.productionUrl || (env.host ? "https://" + env.host : "")).replace(/\/+$/, "");

    }

    function productLink(slug) {

        var base = siteUrl();

        if (!base || !slug) return "";

        // Slug НЕ кодуємо.
        //
        // Тут стояв encodeURIComponent — і поле показувало
        // /p/%D0%B3%D0%BE%D0%B4%D0%B8%D0%BD%D0%BD%D0%B8%D0%BA-tissot-…
        // замість читабельної адреси. Кодування було зайвим двічі:
        // збірка тепер робить slug латинським (див. translit.js), тож
        // кодувати нічого; а якби кирилиця й лишилась, браузер і
        // Telegram кодують адресу самі — а ось людина, яка її копіює,
        // розкодувати назад не може.
        return base + "/p/" + slug + "/";

    }

    // Кодування для значення параметра — але без фанатизму.
    //
    // encodeURIComponent екранує все підряд, зокрема «:» і «/», і
    // https://bestbrnd4u.com/p/… перетворюється на
    // https%3A%2F%2Fbestbrnd4u.com%2Fp%2F… — та сама борода, тільки з
    // іншого боку. Тим часом за RFC 3986 обидва ці символи в query
    // дозволені й екранування не потребують.
    //
    // Що справді треба екранувати — «#» (обрізає адресу), «&» (починає
    // наступний параметр) і пробіли. Це лишається.
    function encodeForQuery(value) {

        return encodeURIComponent(value)
            .replace(/%3A/g, ":")
            .replace(/%2F/g, "/");

    }

    function telegramLink(title, link) {

        // У тексті — ЛИШЕ посилання на товар.
        //
        // ЧОМУ ТАК КОРОТКО
        // -----------------
        // «Доброго дня! Хочу замовити: <назва>» — це ще півсотні
        // символів кирилиці, і кожна в параметрі стає девʼятьма. Втрати
        // немає: посилання саме показує товар, а назву ви побачите,
        // коли перейдете за ним. Привітання покупець напише сам —
        // люди й так дописують «доброго дня» перед питанням.
        //
        // Назва лишається в підписі поля, тож видно, до якого товару
        // посилання, ще до копіювання.
        return "https://t.me/" + TELEGRAM + "?text=" + encodeForQuery(link);

    }

    var Row = createClass({

        getInitialState: function () {
            return { copied: false };
        },

        copy: function () {

            var self = this;
            var value = this.props.value;

            function done() {

                self.setState({ copied: true });

                // повертаємо підпис назад, щоб кнопка не лишалась
                // «Скопійовано» назавжди й не збивала з пантелику
                setTimeout(function () {
                    if (self.alive !== false) self.setState({ copied: false });
                }, 1800);

            }

            // Сучасний спосіб працює лише в захищеному контексті (https
            // або localhost). Адмінка відкривається саме так, але
            // запасний шлях лишаємо: без нього кнопка мовчки нічого не
            // робила б, і зрозуміти чому було б важко.
            if (navigator.clipboard && window.isSecureContext) {

                navigator.clipboard.writeText(value).then(done, function () {
                    self.fallbackCopy(value, done);
                });

                return;

            }

            this.fallbackCopy(value, done);

        },

        fallbackCopy: function (value, done) {

            var area = document.createElement("textarea");

            area.value = value;
            area.style.position = "fixed";
            area.style.opacity = "0";

            document.body.appendChild(area);
            area.select();

            try { document.execCommand("copy"); } catch (error) { /* нічого */ }

            document.body.removeChild(area);

            done();

        },

        componentWillUnmount: function () {
            this.alive = false;
        },

        render: function () {

            var self = this;

            return h("div", { className: "order-link-row" },

                h("div", { className: "order-link-label" }, this.props.label),

                h("div", { className: "order-link-value" },
                    h("input", {
                        type: "text",
                        readOnly: true,
                        value: this.props.value,
                        onFocus: function (event) { event.target.select(); }
                    }),
                    h("button", {
                        type: "button",
                        className: "order-link-copy" + (this.state.copied ? " is-done" : ""),
                        onClick: function () { self.copy(); }
                    }, this.state.copied ? "Скопійовано" : "Скопіювати")
                ),

                this.props.hint
                    ? h("p", { className: "order-link-hint" }, this.props.hint)
                    : null
            );

        }

    });

    var OrderLinkControl = createClass({

        getInitialState: function () {
            return { bot: botUsername, ready: botLoaded };
        },

        componentDidMount: function () {

            var self = this;

            this.alive = true;

            loadBotUsername(function (name) {
                if (self.alive) self.setState({ bot: name, ready: true });
            });

        },

        componentWillUnmount: function () {
            this.alive = false;
        },

        // Поле нічого не зберігає, тож валідність від нього не залежить.
        isValid: function () {
            return true;
        },

        render: function () {

            var data = this.props.entry.get("data");

            var slug = data.get("slug");
            var title = data.get("title") || "товар";

            // Slug генерується збіркою з назви. У щойно створеного
            // товару його ще немає — і вигадувати адресу наперед не
            // можна: збірка може змінити її (наприклад, якщо такий slug
            // уже зайнятий).
            if (!slug) {

                return h("div", { className: "order-link-widget" },
                    h("p", { className: "order-link-hint" },
                        "Посилання зʼявиться після того, як ви збережете товар "
                        + "і збірка на сайті завершиться. До того адреса ще не "
                        + "визначена."));

            }

            var link = productLink(slug);

            if (!link) {

                return h("div", { className: "order-link-widget" },
                    h("p", { className: "order-link-hint" },
                        "Не вдалося визначити адресу сайту."));

            }

            var id = data.get("id");
            var deepLink = this.state.ready ? botLink(id) : "";

            return h("div", { className: "order-link-widget" },

                h(Row, {
                    label: "Посилання на товар",
                    value: link,
                    hint: "Це посилання кладіть у пост."
                }),

                h(Row, {
                    label: "Замовити в Telegram",
                    value: telegramLink(title, link),
                    hint: "Відкриває чат із уже вставленим посиланням на цей "
                        + "товар. Покупець допише питання й надішле — ви одразу "
                        + "побачите, про що мова."
                }),

                // Третє посилання — у бота, з відкритою карткою саме
                // цього товару. Для рілсів і шапки профілю: людина
                // натискає й одразу бачить фото, ціну й кнопку
                // «Замовити», без пошуку по каталогу.
                deepLink
                    ? h(Row, {
                        label: "Відкрити товар у боті",
                        value: deepLink,
                        hint: "Для рілсів і шапки профілю. Бот одразу покаже "
                            + "картку цього товару з кнопкою «Замовити»."
                    })
                    : h("p", { className: "order-link-hint" },
                        !this.state.ready
                            ? "Посилання в бота завантажується…"
                            : !id
                                ? "Посилання в бота зʼявиться після збереження товару."
                                : "Щоб зʼявилось посилання в бота, вкажіть його логін: "
                                  + "«Сторінки» → «Telegram-бот».")
            );

        }

    });

    var OrderLinkPreview = createClass({
        render: function () { return null; }
    });

    CMS.registerWidget("orderLink", OrderLinkControl, OrderLinkPreview);

}());
