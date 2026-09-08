// Підказки міст і відділень Нової пошти на сторінці оформлення.
//
// НАВІЩО
// -------
// Місто й номер відділення покупець вписував руками. Наслідки видно на
// кожному замовленні: «Відділення №45» замість «№145», «Кийв», «НП 12».
// Далі це або дзвінок покупцю, або накладна на неправильне відділення —
// і посилка, яка їде через півкраїни не туди.
//
// ЯК ЦЕ ПРАЦЮЄ
// -------------
// Питаємо не Нову пошту, а свою функцію: ключ НП дає право створювати
// накладні на рахунку магазину, тож у коді сайту йому не місце
// (supabase/functions/telegram-order-bot/nova-poshta.js).
//
// ПОРОЖНІЙ КЛЮЧ = ПОЛЕ ЯК БУЛО
// -----------------------------
// Немає ключа, функція старої версії, НП недоступна — поле лишається
// звичайним текстовим, і замовлення оформлюється, як оформлювалось.
// Магазин, який не приймає замовлення через недоступний довідник,
// гірший за магазин з одруками в адресі.

(function (root) {

    "use strict";

    // Заповнюється в init(): знайти ref міста за його назвою.
    // Потрібне тоді, коли поле заповнили не вибором із підказки.
    var useCity = function () { return Promise.resolve(""); };

    // Скільки чекати після останньої натиснутої клавіші. Запит на
    // кожну літеру — це десяток запитів на слово «Хмельницький» і
    // підказки, які стрибають під пальцями.
    var DEBOUNCE = 250;

    // Коротше двох літер не питаємо: НП віддасть півтисячі міст.
    //
    // Це правило ЛИШЕ для міста, де кожен запит іде в НП. Для
    // відділення мінімуму немає: список міста вже завантажений і
    // фільтрується на місці, а «1» — найчастіший запит узагалі
    // (перше відділення в кожному місті). Двійка там означала б, що
    // на «1» покупець бачить порожнечу й вирішує, що підказки не
    // працюють.
    var MIN_QUERY = 2;

    // Довідник НП знає назви міст лише українською: на латиницю він
    // відповідає помилкою запиту, а не порожнім списком.
    var CYRILLIC = /[\u0400-\u04FF]/;

// Доки довідник вважаємо недоступним після відмови.
//
// Спершу тут стояло `var available = true`, і відмова гасила
// довідник ДО ПЕРЕЗАВАНТАЖЕННЯ сторінки — один на всі поля. Пошук
// поштомата не вдався, і місто теж перестало шукатись, хоч воно
// щойно працювало.
//
// 20 секунд — компроміс: на кожну літеру в мережу не ходимо, але
// короткий збій НП чи таймаут не ламає всю сторінку.
var RETRY_AFTER = 20000;

var silentUntil = 0;

// Кому сказати, що довідник не відповідає. Заповнюється в attach().
var listeners = [];

function directoryDown() {

    silentUntil = Date.now() + RETRY_AFTER;

    listeners.forEach(function (fn) { fn(); });

}

    // Відповіді НП на ту саму пару «місто + запит». Покупець стирає й
    // дописує номер, повертається до поля — а мережу тривожити не
    // треба.
    var answers = {};

    function client() {

        if (typeof supabaseClient !== "undefined" && supabaseClient) return supabaseClient;

        return root.supabaseClient || null;

    }

    function ask(body) {

        var api = client();

        if (!api || !api.functions) return Promise.resolve(null);

        // Щойно відмовили — не тривожимо мережу, але й не забуваємо
        // назавжди: за 20 секунд спробуємо знову.
        if (Date.now() < silentUntil) return Promise.resolve(null);

        return api.functions.invoke("telegram-order-bot", {
            body: Object.assign({ site_action: "nova-poshta" }, body)
        }).then(function (result) {

            var data = result && result.data;

            if (!data || data.ok !== true) {

                directoryDown();

                return null;

            }

            return Array.isArray(data.items) ? data.items : [];

        }).catch(function () {

            directoryDown();

            return null;

        });

    }

    // ------------------------------------------------------------------
    // Список підказок
    // ------------------------------------------------------------------

    function buildList(input) {

        var box = document.createElement("div");

        box.className = "np-suggest";
        box.hidden = true;

        // Поле лежить у <label>, тому список кладемо поруч із самим
        // полем — інакше він з'явився б під підписом.
        var holder = input.parentElement;

        if (holder && getComputedStyle(holder).position === "static") {
            holder.style.position = "relative";
        }

        (holder || document.body).appendChild(box);

        return box;

    }

    function hide(state) {

        state.box.hidden = true;
        state.items = [];
        state.active = -1;

    }

    function render(state, items) {

        if (!items || !items.length) {
            hide(state);
            return;
        }

        state.items = items;
        state.active = -1;

        state.box.innerHTML = items.map(function (item, index) {

            return '<button type="button" class="np-suggest-item" data-index="' + index + '">'
                + escape(item.label)
                + "</button>";

        }).join("");

        state.box.hidden = false;

    }

    function escape(text) {

        return String(text == null ? "" : text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    }

    // input: поле; source(query) → обіцянка з масивом {label, value, …};
    // onPick(item) → що зробити з вибраним; min — з якої довжини
    // запиту шукати (0 = показувати список одразу на фокус).
    function attach(input, source, onPick, min) {

        if (!input) return null;

        // Двічі на одне поле не чіпляємось: інакше з'явився б другий
        // список поверх першого.
        if (input.dataset.npReady === "1") return null;

        input.dataset.npReady = "1";

        var limit = typeof min === "number" ? min : MIN_QUERY;

        var state = { box: buildList(input), items: [], active: -1 };

        // Рядок «довідник не відповідає». Створюється один раз і
        // лежить під полем прихованим: показати його треба саме тоді,
        // коли підказок немає, — а це найгірший момент, щоб щось
        // будувати.
        var notice = document.createElement("p");

        notice.className = "np-notice";
        notice.hidden = true;
        notice.textContent = "Довідник Нової пошти не відповідає."
            + " Впишіть номер відділення або поштомата вручну —"
            + " замовлення оформиться.";

        (input.parentElement || document.body).appendChild(notice);

        // Показуємо, коли довідник відмовив, і прибираємо, щойно
        // підказки знову приходять.
        listeners.push(function () { notice.hidden = false; });

        var timer = null;

        // Браузер підставляє в такі поля збережені адреси, і його
        // список накривав би наш.
        input.setAttribute("autocomplete", "off");

        function pick(index) {

            var item = state.items[index];

            if (!item) return;

            input.value = item.value;

            hide(state);

            if (onPick) onPick(item);

        }

        input.addEventListener("input", function () {

            clearTimeout(timer);

            search(input.value.trim());

        });

        function search(query) {

            clearTimeout(timer);

            if (query.length < limit) {
                hide(state);
                return;
            }

            timer = setTimeout(function () {

                source(query).then(function (items) {

                    // Прийшов масив — довідник живий, рядок про
                    // відмову більше не потрібен. null означає
                    // «відмовив»: його показує сам listener.
                    if (items) notice.hidden = true;

                    render(state, items);

                });

            }, DEBOUNCE);

        }

        // Поле без порогу показує список одразу, щойно в нього
        // поставили курсор: покупцеві не треба вгадувати, що саме
        // вводити, — він просто вибирає своє відділення.
        if (limit === 0) {

            input.addEventListener("focus", function () { search(input.value.trim()); });

        }

        // Клавіатура: стрілки й Enter. Без цього підказки марні для
        // тих, хто заповнює форму з клавіатури.
        input.addEventListener("keydown", function (event) {

            if (state.box.hidden) return;

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {

                event.preventDefault();

                var step = event.key === "ArrowDown" ? 1 : -1;

                state.active = (state.active + step + state.items.length) % state.items.length;

                Array.prototype.forEach.call(state.box.children, function (node, index) {
                    node.classList.toggle("active", index === state.active);
                });

                return;

            }

            if (event.key === "Enter" && state.active >= 0) {
                event.preventDefault();
                pick(state.active);
                return;
            }

            if (event.key === "Escape") hide(state);

        });

        state.box.addEventListener("mousedown", function (event) {

            var node = event.target.closest("[data-index]");

            if (!node) return;

            // mousedown, а не click: інакше поле встигає втратити
            // фокус, список закривається — і клік іде в порожнє місце.
            event.preventDefault();

            pick(Number(node.dataset.index));

        });

        input.addEventListener("blur", function () {
            setTimeout(function () { hide(state); }, 150);
        });

        return state;

    }

    // ------------------------------------------------------------------
    // Поля сторінки оформлення
    // ------------------------------------------------------------------

    function init() {

        var city = document.getElementById("city");

        if (!city) return;

        var branch = document.getElementById("branchNumber");
        var postomat = document.getElementById("postomatNumber");

        // Ref обраного міста. Без нього відділення не спитати — і це
        // навмисно: список відділень «усієї України» не має сенсу.
        var cityRef = "";

        // Підказка «введіть українською». Окремий рядок, а не
        // повідомлення про помилку: людина нічого не порушила,
        // просто довідник іншою мовою не вміє.
        var cityHint = document.createElement("p");

        cityHint.className = "np-notice";
        cityHint.hidden = true;
        cityHint.textContent = "Назву міста введіть українською —"
            + " довідник Нової пошти шукає лише так.";

        (city.parentElement || document.body).appendChild(cityHint);

        function showCityHint(show) { cityHint.hidden = !show; }

        attach(city, function (query) {

            // Довідник НП знає міста ЛИШЕ українською.
            //
            // На «Kyiv» він відповідає помилкою запиту, а не порожнім
            // списком — тобто покупець із латинською розкладкою бачив
            // просто мовчання. Кажемо йому це прямо й не витрачаємо
            // звернення до НП.
            //
            // Самі не перекладаємо: «Kyiv», «Kiev», «Kyyiv» — три
            // написання одного міста, і здогад тут означає посилку не
            // туди.
            if (!CYRILLIC.test(query)) {
                showCityHint(true);
                return Promise.resolve([]);
            }

            showCityHint(false);

            return ask({ method: "settlements", query: query }).then(function (items) {

                if (!items) return null;

                return items.map(function (item) {
                    return { label: item.name, value: item.name, ref: item.ref };
                });

            });

        }, function (item) {

            cityRef = item.ref || "";

            // Місто змінилось — старе відділення могло лишитись у полі
            // й поїхати в замовлення разом із новим містом.
            [branch, postomat].forEach(function (field) {
                if (field) field.value = "";
            });

        });

        // Людина може виправити місто руками після вибору — тоді Ref
        // уже не про це місто.
        city.addEventListener("input", function () { cityRef = ""; });

        // ПОШУК РОБИТЬ НОВА ПОШТА.
        //
        // Спершу тут завантажувався весь список точок міста, і фільтр
        // працював у браузері. На Києві це не працювало: точок кілька
        // тисяч, а НП віддає 500 за раз — поштомати з номерами на
        // 4xxxx у ту сотню не потрапляли ніколи. Відділення
        // знаходились, поштомати ні.
        //
        // Тепер запит іде в НП разом із текстом, і «40964» знаходиться
        // незалежно від того, скільки точок у місті.
        function warehouses(wantPostomat) {

            return function (query) {

                if (!cityRef) return Promise.resolve(null);

                var key = cityRef + "|" + (wantPostomat ? "p" : "b") + "|" + query.toLowerCase();

                if (answers[key]) return Promise.resolve(answers[key]);

                return ask({
                    method: "warehouses",
                    cityRef: cityRef,
                    query: query,
                    postomat: wantPostomat
                }).then(function (items) {

                    if (!items) return null;

                    var list = items
                        // Тип точки НП уже врахувала, але перевіряємо й
                        // тут: якщо довідник типів колись не відповість,
                        // поштомати не мусять просочитись у список
                        // відділень.
                        .filter(function (item) { return Boolean(item.postomat) === wantPostomat; })
                        .slice(0, 20)
                        .map(function (item) {
                            return { label: item.name, value: item.name };
                        });

                    answers[key] = list;

                    return list;

                });

            };

        }

        // Знайти ref за назвою міста — для випадків, коли поле
        // заповнили НЕ вибором із підказки.
        //
        // Так буває, коли підтягується збережена адреса покупця
        // (applySavedAddress у checkout.js) або коли адресу
        // підставив сам браузер. Поле виглядає заповненим, людина
        // впевнена, що місто вибране, — а ref порожній, і пошук
        // відділень навіть не робить запиту.
        //
        // Беремо ПЕРШИЙ збіг: назва в збереженій адресі прийшла з
        // цього ж довідника, тож збіг точний. Якщо НП не відповіла
        // або міста немає — лишаємо порожній ref, і поле поводиться
        // як звичайне текстове (замовлення однаково оформиться).
        useCity = function (name) {

            var query = String(name || "").trim();

            if (query.length < MIN_QUERY) return Promise.resolve("");

            return ask({ method: "settlements", query: query }).then(function (items) {

                if (!items || !items.length) return "";

                // Точний збіг кращий за перший-ліпший: «Київ» не має
                // перетворитись на «Київець».
                var exact = items.filter(function (item) {
                    return String(item.name || "").trim() === query;
                })[0];

                cityRef = (exact || items[0]).ref || "";

                return cityRef;

            });

        };

        attach(branch, warehouses(false), null, 0);
        attach(postomat, warehouses(true), null, 0);

    }

    root.NovaPoshta = {
        init: init,
        attach: attach,
        // Сторінка оформлення викликає це, коли підставляє збережену
        // адресу: без ref пошук відділень мовчки не працює.
        useCity: function (name) { return useCity(name); },
        MIN_QUERY: MIN_QUERY,
        DEBOUNCE: DEBOUNCE
    };

    if (typeof document !== "undefined") {

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", init);
        } else {
            init();
        }

    }

}(typeof window !== "undefined" ? window : globalThis));
