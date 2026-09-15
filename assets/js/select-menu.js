// Власний випадний список замість системного.
//
// НАВІЩО
// -------
// Закритий <select> ми оформили давно: своя рамка, свій шеврон,
// свій фокус. А розкритий — ні, і оформити його не можна: список
// малює операційна система, і ні шрифт, ні кольори, ні скруглення
// їй не передаються. Виходило так: поки на список не натиснули, він
// частина сайту; щойно натиснули — сірий системний прямокутник
// іншим шрифтом. Це помітно саме в той момент, коли на елемент
// дивляться найуважніше.
//
// ГОЛОВНЕ ПРАВИЛО: <select> ЛИШАЄТЬСЯ ДЖЕРЕЛОМ ІСТИНИ
// ---------------------------------------------------
// Ми не замінюємо його, а ставимо поруч видиму кнопку зі списком.
// Сам <select> лишається в DOM, у формі й у коді: усе, що читає
// element.value, слухає change або викликає form.reset(), працює
// так само, як працювало. Тому й підключати це до наявних форм
// безпечно — нова поведінка нічого зі старої не скасовує.
//
// І ЯКЩО ЦЕЙ ФАЙЛ НЕ ЗАВАНТАЖИВСЯ
// --------------------------------
// Системний список лишається на місці й працює. Ховаємо <select>
// ЛИШЕ після того, як своя кнопка вже побудована, — інакше збій
// цього файлу залишив би форму без способу обрати спосіб доставки
// взагалі.
//
// ДОСТУПНІСТЬ
// ------------
// Клавіатура має робити те саме, що й у системного списку:
// стрілки, Home/End, Enter, Escape. Роль listbox/option і
// aria-expanded — щоб екранний читач називав це списком, а не
// просто кнопкою з текстом.

(function (root) {

    "use strict";

    var seq = 0;

    // Відкритий список завжди один: другий поверх першого — це вже
    // не список, а безлад.
    var openMenu = null;

    function closeOpen() {

        if (openMenu) openMenu.close();

    }

    function upgrade(select) {

        if (!select || select.dataset.menuReady === "1") return null;

        var options = Array.prototype.slice.call(select.options);

        // Порожній список нема сенсу перемальовувати.
        if (!options.length) return null;

        select.dataset.menuReady = "1";

        seq += 1;

        var id = "select-menu-" + seq;

        var wrap = document.createElement("div");

        wrap.className = "select-menu";

        var button = document.createElement("button");

        // type обов'язковий: кнопка стоїть усередині <form>, а
        // кнопка без типу — це кнопка відправки, тож відкриття
        // списку відправляло б форму.
        button.type = "button";
        button.className = "select-menu-button";
        button.setAttribute("aria-haspopup", "listbox");
        button.setAttribute("aria-expanded", "false");
        button.id = id + "-button";

        var label = document.createElement("span");

        label.className = "select-menu-value";

        var arrow = document.createElement("span");

        arrow.className = "select-menu-arrow";
        arrow.setAttribute("aria-hidden", "true");

        button.appendChild(label);
        button.appendChild(arrow);

        var list = document.createElement("div");

        list.className = "select-menu-list";
        list.setAttribute("role", "listbox");
        list.setAttribute("aria-labelledby", button.id);
        list.hidden = true;

        options.forEach(function (option, index) {

            var item = document.createElement("button");

            item.type = "button";
            item.className = "select-menu-item";
            item.setAttribute("role", "option");
            item.dataset.index = String(index);
            item.textContent = option.textContent;

            list.appendChild(item);

        });

        wrap.appendChild(button);
        wrap.appendChild(list);

        select.parentNode.insertBefore(wrap, select);

        // Тільки тепер, коли заміна вже стоїть на сторінці.
        //
        // Не hidden і не display:none: прихований select не
        // отримує фокус, і браузер не може показати на ньому
        // повідомлення про незаповнене обов'язкове поле — воно
        // мовчки не з'явилось би, а форма не відправилась.
        select.classList.add("select-menu-native");

        var active = -1;

        function paint() {

            var chosen = select.selectedIndex;

            label.textContent = chosen >= 0 ? options[chosen].textContent : "";

            Array.prototype.forEach.call(list.children, function (node, index) {

                var current = index === chosen;

                node.classList.toggle("current", current);
                node.setAttribute("aria-selected", current ? "true" : "false");

            });

        }

        function highlight(index) {

            active = index;

            Array.prototype.forEach.call(list.children, function (node, i) {
                node.classList.toggle("active", i === active);
            });

            // Підсвічений рядок може бути нижче видимої частини
            // списку: без цього стрілка вниз «зникає».
            //
            // Через перевірку, бо це прокрутка — прикраса, а не
            // робота. Там, де scrollIntoView немає (jsdom у тестах,
            // старі рушії), виняток звідси обірвав би весь
            // обробник, і список не відкрився б узагалі.
            var node = active >= 0 ? list.children[active] : null;

            if (node && typeof node.scrollIntoView === "function") {
                node.scrollIntoView({ block: "nearest" });
            }

        }

        function open() {

            if (!list.hidden) return;

            closeOpen();

            list.hidden = false;
            wrap.classList.add("open");
            button.setAttribute("aria-expanded", "true");

            highlight(select.selectedIndex);

            openMenu = api;

        }

        function close() {

            if (list.hidden) return;

            list.hidden = true;
            wrap.classList.remove("open");
            button.setAttribute("aria-expanded", "false");

            highlight(-1);

            if (openMenu === api) openMenu = null;

        }

        function choose(index) {

            if (index < 0 || index >= options.length) return;

            close();

            if (select.selectedIndex === index) return;

            select.selectedIndex = index;

            paint();

            // Саме подія, а не прямий виклик: на change уже підписані
            // обробники сторінки, і вони не мусять знати, що список
            // намальований своїми руками.
            select.dispatchEvent(new Event("change", { bubbles: true }));

        }

        button.addEventListener("click", function () {

            if (list.hidden) open();
            else close();

        });

        list.addEventListener("mousedown", function (event) {

            var node = event.target.closest("[data-index]");

            if (!node) return;

            // mousedown, а не click: інакше кнопка встигає втратити
            // фокус, список закривається — і клік летить у порожнечу.
            event.preventDefault();

            choose(Number(node.dataset.index));

        });

        list.addEventListener("mousemove", function (event) {

            var node = event.target.closest("[data-index]");

            if (node) highlight(Number(node.dataset.index));

        });

        button.addEventListener("keydown", function (event) {

            var key = event.key;

            if (key === "Escape") {
                close();
                return;
            }

            if (list.hidden) {

                if (key === "ArrowDown" || key === "ArrowUp"
                    || key === "Enter" || key === " ") {
                    event.preventDefault();
                    open();
                }

                return;

            }

            if (key === "ArrowDown" || key === "ArrowUp") {

                event.preventDefault();

                var step = key === "ArrowDown" ? 1 : -1;
                var from = active < 0 ? select.selectedIndex : active;

                highlight((from + step + options.length) % options.length);

                return;

            }

            if (key === "Home") {
                event.preventDefault();
                highlight(0);
                return;
            }

            if (key === "End") {
                event.preventDefault();
                highlight(options.length - 1);
                return;
            }

            if (key === "Enter" || key === " ") {
                event.preventDefault();
                choose(active);
            }

        });

        button.addEventListener("blur", function () {

            // Із затримкою: інакше список закривається раніше, ніж
            // спрацює вибір мишею.
            setTimeout(function () {
                if (!wrap.contains(document.activeElement)) close();
            }, 150);

        });

        // Програмна зміна value міняє <select> повз нашу кнопку —
        // напис на ній мусить це підхопити. Кабінет робить саме так:
        // відкриваючи вікно адреси, він виставляє value збереженого
        // способу доставки й повідомляє про це подією change.
        select.addEventListener("change", paint);

        // form.reset() ПОДІЇ change НЕ НАДСИЛАЄ.
        //
        // Це не дрібниця: вікно адреси відкривається саме через
        // reset(), і без цього рядка кнопка показувала спосіб
        // доставки з ПОПЕРЕДНЬОЇ адреси, тоді як у формі вже стояв
        // інший. Людина бачила «Кур'єром», зберігала — і зберігалось
        // «На відділення».
        //
        // Перемальовуємо наступним тактом: у момент події reset
        // значення ще старі, браузер скидає їх одразу після неї.
        if (select.form) {

            select.form.addEventListener("reset", function () {
                setTimeout(paint, 0);
            });

        }

        var api = { open: open, close: close, refresh: paint, select: select };

        paint();

        return api;

    }

    function init(scope) {

        var where = scope || document;

        Array.prototype.forEach.call(
            where.querySelectorAll("select[data-menu]"),
            upgrade
        );

    }

    if (typeof document !== "undefined") {

        // Клік повз відкритий список закриває його — так само, як у
        // системного.
        document.addEventListener("mousedown", function (event) {

            if (!openMenu) return;

            if (!event.target.closest(".select-menu")) closeOpen();

        });

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { init(); });
        } else {
            init();
        }

    }

    root.SelectMenu = { init: init, upgrade: upgrade };

}(typeof window !== "undefined" ? window : globalThis));
