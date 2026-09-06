// Сторінка 404: що показати замість зниклої адреси.
//
// НАВІЩО ТУТ ВЗАГАЛІ ЛОГІКА
// --------------------------
// Найчастіша бита адреса в магазині — це не одрук, а товар, якого
// більше немає: перемикач «🚫 Розпродано» прибирає сторінку товару
// зовсім (docs/ЗАЛИШКИ.md), а посилання на неї лишаються — у рекламі,
// у переписці, у пошуковій видачі ще на тижні.
//
// Людина за таким посиланням уже знає, чого хоче. Показати їй «сторінку
// не знайдено» і крапку — це відпустити готового покупця. Тому з адреси
// дістається назва товару й підбираються найближчі: той самий бренд,
// схожа назва.
//
// ЧОМУ НЕ ПЕРЕНАПРАВЛЯЄМО
// ------------------------
// Спокуса є: знайшли схожий товар — і одразу відкрити його. Але 404
// має лишитись 404: підміна адреси на «схоже» бреше і покупцеві (він
// думає, що відкрив те, за чим прийшов), і пошуковику (він так і не
// дізнається, що стара адреса померла). Показуємо варіанти, вибір
// лишаємо людині.

(function (root) {

    "use strict";

    var LIMIT = 8;

    // Слова, за якими шукати сенсу немає: вони є майже в кожному
    // товарі й лише розмивають збіг.
    var STOP_WORDS = [
        "zhinocha", "zhinochi", "zhinochyi", "cholovicha", "cholovichi",
        "cholovichyi", "sumka", "sumki", "krosivky", "okuliary",
        "the", "and", "for"
    ];

    // Назва товару з адреси.
    //
    // Сторінки товарів лежать за /p/<slug>/, де slug — це бренд плюс
    // назва латиницею (scripts/build-product-pages.js).
    function slugFrom(pathname) {

        var path = String(pathname || "");

        try {
            path = decodeURIComponent(path);
        } catch (error) {
            // Побита адреса з %-послідовністю — беремо як є.
        }

        var match = path.match(/\/p\/([^/]+)\/?$/);

        return match ? match[1] : "";

    }

    function words(text) {

        return String(text || "")
            .toLowerCase()
            .split(/[^a-z0-9а-яіїєґ]+/i)
            .filter(function (word) {
                return word.length >= 3 && STOP_WORDS.indexOf(word) === -1;
            });

    }

    // Схожість = скільки слів з адреси зустрілось у товарі.
    //
    // Бренд важить більше за решту: замість зниклої сумки Coach
    // найдоречніша інша сумка Coach, а не будь-яка сумка зі схожим
    // словом у назві.
    function score(product, needles) {

        if (!product) return 0;

        var haystack = words(product.slug)
            .concat(words(product.brand))
            .concat(words(product.title));

        var brandWords = words(product.brand);

        var total = 0;

        needles.forEach(function (needle) {

            if (haystack.indexOf(needle) === -1) return;

            total += brandWords.indexOf(needle) === -1 ? 1 : 3;

        });

        return total;

    }

    function rank(products, needles) {

        if (!Array.isArray(products) || !needles.length) return [];

        return products
            .map(function (product) {
                return { product: product, score: score(product, needles) };
            })
            .filter(function (item) { return item.score > 0; })
            .sort(function (a, b) { return b.score - a.score; })
            .slice(0, LIMIT)
            .map(function (item) { return item.product; });

    }

    // ------------------------------------------------------------------
    // Сторінка
    // ------------------------------------------------------------------

    function start() {

        var grid = document.getElementById("notFoundGrid");
        var section = document.getElementById("notFoundSuggestions");
        var title = document.getElementById("notFoundSuggestionsTitle");

        // Кнопка «Пошук по каталогу» відкриває ту саму панель пошуку,
        // що й лупа в шапці: другого пошуку на сайті бути не повинно.
        var searchBtn = document.getElementById("notFoundSearchBtn");

        if (searchBtn) {

            searchBtn.addEventListener("click", function () {

                if (typeof openSearchOverlay === "function") {
                    openSearchOverlay();
                    return;
                }

                window.location.href = "/catalog";

            });

        }

        function render(list, heading) {

            if (!grid || !section || !list.length) return false;

            grid.innerHTML = list.map(function (product) {
                return createProductCard(product);
            }).join("");

            if (title && heading) title.textContent = heading;

            section.hidden = false;

            // Той самий набір «оживлення» картки, що й у решті блоків:
            // гортання фото, серденько обраного, стрілки каруселі.
            if (typeof initProductCarousels === "function") initProductCarousels(grid);
            if (typeof updateFavoriteButtons === "function") updateFavoriteButtons();
            if (typeof initCarousel === "function") initCarousel(document.getElementById("notFoundCarousel"));

            return true;

        }

        if (grid && typeof getAllProductsCached === "function") {

            getAllProductsCached().then(function (products) {

                if (!Array.isArray(products) || !products.length) return;

                var found = rank(products, words(slugFrom(window.location.pathname)));

                if (render(found, "Схожі товари")) return;

                // Нічого схожого — показуємо новинки. Порожня сторінка
                // помилки без жодного товару це глухий кут, а магазин
                // великий незалежно від того, яку адресу відкрили.
                render(products.slice(0, LIMIT), "Нове в каталозі");

            }).catch(function (error) {

                // Каталог не завантажився — сторінка помилки лишається
                // сторінкою помилки з посиланнями. Другої помилки
                // поверх першої показувати не будемо.
                console.warn("Не вдалося підібрати схожі товари:", error && error.message);

            });

        }

        if (typeof renderRecentlyViewed === "function") renderRecentlyViewed();

    }

    root.NotFound = {
        slugFrom: slugFrom,
        words: words,
        score: score,
        rank: rank,
        LIMIT: LIMIT
    };

    // У Node цей файл лише читають тести — сторінки там немає.
    if (typeof document !== "undefined") start();

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).NotFound;
}
