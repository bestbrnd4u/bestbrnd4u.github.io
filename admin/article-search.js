// Пошук товару за артикулом у списку «Товари».
//
// ЧОМУ ЦЕ ОКРЕМИЙ ФАЙЛ, А НЕ НАЛАШТУВАННЯ
// ----------------------------------------
// Вбудований пошук Decap НЕ МОЖЕ знайти артикул «20». І це не помилка
// налаштувань — так працює сам рушій, і в найсвіжішій версії теж.
//
// Пошук зіставляє запит нечітко (пакет fuzzy), а потім ВІДКИДАЄ все, що
// набрало не більше 5 балів:
//
//     entries.filter(({ score }) => score > 5)
//
// Бали залежать від ДОВЖИНИ ЗАПИТУ, а не від тексту, у якому шукають.
// Максимум, який може набрати запит, виміряно тим самим пакетом:
//
//     1 символ  →  1        3 символи →  11
//     2 символи →  4        4 символи →  26
//
// Тобто будь-який запит із одного-двох символів не проходить порогу
// ніколи. Артикули з 1 по 99 — це один-два символи, і вони були
// недосяжні всі до одного. Перевірено на справжніх даних: запит «20»
// дає 33 нечітких співпадіння, товар з артикулом 20 набирає 4 бали, і
// далі список ріжеться до нуля.
//
// Ще одна деталь, яку варто знати: список полів, у яких Decap шукає,
// НЕ береться з search_fields для папкових колекцій. Він складається з
// виведеної назви плюс змінних із summary. Артикул тут узагалі
// потрапляє в пошук лише тому, що summary містить {{id}}.
//
// ЩО РОБИТЬ ЦЕЙ ФАЙЛ
// -------------------
// Нічого не ламає й не підмінює: вбудований пошук лишається як є. Поверх
// нього з'являється смужка з ТОЧНИМ попаданням за артикулом — і за
// артикулом товару («20»), і за артикулом кольору («20-1»), який
// вбудований пошук не знаходить у принципі, бо його немає в тексті, за
// яким той шукає.
(function () {

    "use strict";

    var PANEL_ID = "articleSearchPanel";

    // Артикул каталогу: номер товару або номер товару з номером кольору.
    // Обмеження на довжину — щоб довгий заводський код не сприймався за
    // артикул: для нього є вбудований пошук, і він там працює.
    var ARTICLE = /^\d{1,6}(-\d{1,3})?$/;

    function onProductsList() {
        return /^#\/collections\/products(\/search\/|\/?$)/.test(location.hash);
    }

    // Запит беремо з двох місць. З адреси — коли людина натиснула Enter
    // і Decap перейшов на свій маршрут пошуку. З самого поля — щоб
    // смужка з'являлась ще під час набору, не чекаючи Enter.
    function currentTerm() {

        var fromHash = location.hash.match(/^#\/collections\/products\/search\/([^/?]+)/);

        if (fromHash) {
            try { return decodeURIComponent(fromHash[1]).trim(); }
            catch (error) { return fromHash[1].trim(); }
        }

        var input = document.querySelector('input[type="search"], input[type="text"][placeholder]');

        return input ? String(input.value || "").trim() : "";

    }

    // Точні попадання: спершу артикул товару, потім артикули кольорів.
    function findByArticle(list, term) {

        var hits = [];

        (list || []).forEach(function (product) {

            if (!product) return;

            var own = String(product.article || product.id || "");

            if (own && own === term) hits.push({ product: product, article: own, color: "" });

            (product.variants || []).forEach(function (variant) {

                if (!variant) return;

                var art = String(variant.article || "");

                if (art && art === term) {
                    hits.push({ product: product, article: art, color: variant.color || "" });
                }

            });

        });

        return hits;

    }

    function editUrl(product) {
        return "#/collections/products/entries/" + encodeURIComponent(product.slug || "");
    }

    function removePanel() {
        var old = document.getElementById(PANEL_ID);
        if (old) old.remove();
    }

    // Куди вставляти. Класи Decap генеруються автоматично й змінюються
    // від версії до версії, тож прив'язуємось до того, що стабільне:
    // саме поле пошуку. Якщо його не знайшли — кладемо смужку зверху
    // сторінки, щоб вона не зникла зовсім.
    function mount(panel) {

        var input = document.querySelector('input[type="search"], input[type="text"][placeholder]');
        var anchor = input && input.closest("div");

        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(panel, anchor.nextSibling);
            return;
        }

        panel.style.position = "fixed";
        panel.style.top = "calc(var(--env-badge-h, 0px) + 72px)";
        panel.style.left = "16px";
        panel.style.right = "16px";
        panel.style.zIndex = "999998";

        document.body.appendChild(panel);

    }

    function render(hits, term) {

        removePanel();

        var panel = document.createElement("div");
        panel.id = PANEL_ID;
        panel.style.cssText =
            "margin:10px 0;padding:12px 14px;border-radius:12px;" +
            "background:#eff6ff;border:1px solid #bfdbfe;" +
            "font:14px/1.45 -apple-system,Inter,sans-serif;color:#111827;";

        var head = document.createElement("div");
        head.style.cssText = "font-weight:700;margin-bottom:8px;";
        head.textContent = hits.length
            ? "Артикул " + term + " — знайдено"
            : "Артикул " + term + " — такого немає";
        panel.appendChild(head);

        if (!hits.length) {

            var miss = document.createElement("div");
            miss.style.cssText = "color:#4b5563;";
            miss.textContent = "Ні в товарах, ні в кольорах товарів немає артикула " + term
                + ". Перевірте номер — артикул ставить система, і він видний у списку перед назвою.";
            panel.appendChild(miss);

        }

        hits.forEach(function (hit) {

            var row = document.createElement("a");
            row.href = editUrl(hit.product);
            row.style.cssText =
                "display:block;padding:9px 11px;margin-bottom:6px;border-radius:9px;" +
                "background:#fff;border:1px solid #dbeafe;text-decoration:none;color:#111827;";

            row.addEventListener("mouseenter", function () { row.style.background = "#f8fafc"; });
            row.addEventListener("mouseleave", function () { row.style.background = "#fff"; });

            var label = "№" + hit.article + " · " + (hit.product.title || "без назви");

            if (hit.color) label += " — колір «" + hit.color + "»";

            row.textContent = label + " → відкрити";

            panel.appendChild(row);

        });

        // Коротке пояснення, щоб смужка не виглядала загадковою: людина
        // бачить «нічого не знайдено» від вбудованого пошуку й одночасно
        // нашу картку з товаром.
        var note = document.createElement("div");
        note.style.cssText = "margin-top:2px;color:#6b7280;font-size:12.5px;";
        note.textContent = "Вбудований пошук короткі номери не знаходить, тому артикул шукається окремо.";
        panel.appendChild(note);

        mount(panel);

    }

    var lastKey = "";

    function refresh() {

        if (!onProductsList()) { lastKey = ""; removePanel(); return; }

        var term = currentTerm();

        if (!ARTICLE.test(term)) { lastKey = ""; removePanel(); return; }

        // Не перемальовуємо те саме: інакше MutationObserver нижче й
        // власна вставка ганяли б одне одного по колу.
        var key = location.hash.split("/search/")[0] + "|" + term;

        if (key === lastKey && document.getElementById(PANEL_ID)) return;

        lastKey = key;

        var products = window.CatalogTree && window.CatalogTree.loadProducts
            ? window.CatalogTree.loadProducts()
            : Promise.resolve([]);

        products.then(function (list) {

            // Поки вантажились дані, людина могла піти далі або дописати
            // ще цифру — перевіряємо, що запит усе ще той самий.
            if (!onProductsList() || currentTerm() !== term) return;

            render(findByArticle(list, term), term);

        });

    }

    window.addEventListener("hashchange", refresh);
    document.addEventListener("input", refresh);

    // Decap перемальовує інтерфейс при переходах — смужку доводиться
    // повертати. Той самий приём, що для меню в admin/index.html.
    new MutationObserver(function () {
        if (onProductsList() && ARTICLE.test(currentTerm()) && !document.getElementById(PANEL_ID)) {
            lastKey = "";
            refresh();
        }
    }).observe(document.documentElement, { childList: true, subtree: true });

    refresh();

})();
