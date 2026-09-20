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

    // Набори полів, до яких довідник причеплений, за ключем.
    //
    // Їх два, і живуть вони на різних сторінках: "checkout" — поля
    // оформлення замовлення, "address" — вікно «Нова адреса» в
    // кабінеті. Кожен набір тримає СВІЙ ref обраного міста: спільний
    // на двох означав би, що місто, вибране в кабінеті, підставляє
    // свої відділення в замовлення.
    var bound = {};

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

    // ПІДКАЗКИ, ЯКИХ НЕ ЧУТИ
    //
    // Стрілки й Enter у списку працюють давно (див. keydown нижче) —
    // тобто з клавіатури місто вибрати можна. Але екранний читач про
    // список не знає нічого: між полем і <div> із підказками не було
    // жодного звʼязку. Людина друкує «Льв», під полем беззвучно
    // зʼявляються девʼять варіантів, вона тисне стрілку — і чує
    // тишу. На сторінці оформлення, де кожне замовлення проходить
    // саме через це поле.
    //
    // Тому поле стає справжнім combobox: воно каже, що список
    // розкрито, скільки в ньому пунктів і який зараз обрано. Це
    // стандартна зв'язка ARIA, а не вигадка: role=combobox на полі,
    // role=listbox на контейнері, role=option на пунктах і
    // aria-activedescendant, який вказує на поточний.
    //
    // ФОКУС ПРИ ЦЬОМУ ЛИШАЄТЬСЯ В ПОЛІ. Пункти — <button>, тобто
    // самі собою вони потрапляли в таб-порядок: щоб дійти від міста
    // до наступного поля, довелось би протиснути Tab девʼять разів.
    // tabindex="-1" прибирає їх звідти, не чіпаючи ні вигляду, ні
    // натискання мишею.
    var listCount = 0;

    function buildList(input) {

        var box = document.createElement("div");

        box.className = "np-suggest";
        box.hidden = true;

        listCount += 1;

        box.id = "np-suggest-" + listCount;
        box.setAttribute("role", "listbox");

        // -1 НА САМОМУ СПИСКУ — НЕ ЗАЙВИЙ РЯДОК.
        //
        // Список має max-height і overflow-y:auto, тобто це смуга з
        // прокруткою. Chrome від 127-ї версії сам робить такі смуги
        // зупинкою таба, якщо всередині немає нічого фокусованого, —
        // щоб їх можна було прокрутити з клавіатури. Доки пункти
        // були звичайними <button>, умова не виконувалась. Щойно ми
        // прибрали їх із таб-порядку (tabindex=-1 нижче), Tab почав
        // потрапляти в порожній контейнер: зупинка є, озвучувати
        // нічого. Явний -1 цю поведінку вимикає.
        //
        // Спіймано в браузері після першої ж правки: у розмітці все
        // виглядало правильно.
        box.setAttribute("tabindex", "-1");

        input.setAttribute("role", "combobox");
        input.setAttribute("aria-autocomplete", "list");
        input.setAttribute("aria-expanded", "false");
        input.setAttribute("aria-controls", box.id);

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

        if (state.input) {
            state.input.setAttribute("aria-expanded", "false");
            state.input.removeAttribute("aria-activedescendant");
        }

    }

    // Який пункт зараз «під стрілкою». Читач озвучує його саме через
    // aria-activedescendant: фокус лишається в полі, а «обраність»
    // мандрує по пунктах.
    function markActive(state) {

        Array.prototype.forEach.call(state.box.children, function (node, index) {

            var on = index === state.active;

            node.classList.toggle("active", on);
            node.setAttribute("aria-selected", on ? "true" : "false");

        });

        var current = state.box.children[state.active];

        if (state.input && current) state.input.setAttribute("aria-activedescendant", current.id);
        else if (state.input) state.input.removeAttribute("aria-activedescendant");

    }

    function render(state, items) {

        if (!items || !items.length) {
            hide(state);
            return;
        }

        state.items = items;
        state.active = -1;

        state.box.innerHTML = items.map(function (item, index) {

            return '<button type="button" class="np-suggest-item"'
                + ' id="' + state.box.id + "-" + index + '"'
                + ' role="option" aria-selected="false" tabindex="-1"'
                + ' data-index="' + index + '">'
                + escape(item.label)
                + "</button>";

        }).join("");

        state.box.hidden = false;

        if (state.input) {
            state.input.setAttribute("aria-expanded", "true");
            state.input.removeAttribute("aria-activedescendant");
        }

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

        var state = { input: input, box: buildList(input), items: [], active: -1 };

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

                markActive(state);

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
    // Причепити довідник до трійки полів «місто → відділення/поштомат»
    //
    // Раніше ці ідентифікатори стояли прямо в коді, бо поля були лише
    // на оформленні замовлення. Тепер така сама трійка є й у вікні
    // «Нова адреса» в кабінеті: покупець зберігає адресу заздалегідь,
    // і номер відділення там мусить бути такий самий справжній, як на
    // оформленні. Тому поля приходять аргументом, а все решта —
    // спільне.
    // ------------------------------------------------------------------

    function bind(fields) {

        var city = fields && fields.city;

        if (!city) return null;

        var branch = fields.branch;
        var postomat = fields.postomat;

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
        function resolveCity(name) {

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

        }

        attach(branch, warehouses(false), null, 0);
        attach(postomat, warehouses(true), null, 0);

        return { useCity: resolveCity };

    }

    // ------------------------------------------------------------------
    // Де саме на сайті лежать такі трійки полів
    // ------------------------------------------------------------------

    function init() {

        bound.checkout = bind({
            city: document.getElementById("city"),
            branch: document.getElementById("branchNumber"),
            postomat: document.getElementById("postomatNumber")
        });

        // Вікно «Нова адреса» в кабінеті. Воно сховане, але в DOM
        // лежить від завантаження сторінки, тож чіплятись можна
        // одразу — перший показ нічого не мусить доналаштовувати.
        bound.address = bind({
            city: document.getElementById("addressCity"),
            branch: document.getElementById("addressBranchNumber"),
            postomat: document.getElementById("addressPostomatNumber")
        });

    }

    root.NovaPoshta = {
        init: init,
        attach: attach,
        bind: bind,
        // Викликається, коли поле міста заповнили НЕ вибором із
        // підказки: сторінка оформлення так підставляє збережену
        // адресу, кабінет — так відкриває адресу на редагування. Без
        // ref пошук відділень мовчки не працює.
        //
        // which: "checkout" (за замовчуванням) або "address".
        useCity: function (name, which) {

            var handle = bound[which || "checkout"];

            return handle ? handle.useCity(name) : Promise.resolve("");

        },
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
