// ======================================
// common.js
// Загальна логіка сайту Bagvero
// ======================================

// -------------------------
// Забороняємо нативне "підняття" картинки (drag) —
// саме воно і показувало білу підкладку під фото при
// протягуванні пальцем. На відміну від touch-action:pan-x
// (яке ми пробували раніше і яке ламало звичайний
// вертикальний скрол сторінки), це не чіпає скрол взагалі —
// блокується лише сама дія "перетягнути картинку".
document.addEventListener("dragstart", event => {

    if (event.target.tagName === "IMG") event.preventDefault();

});

// -------------------------
// Фіксований набір кольорів/розмірів
//
// В products.json немає even даних про реально доступні
// варіанти по кожному товару окремо, тому на картці
// каталогу, в обраному і в кошику використовується той
// самий єдиний набір, що й раніше був захардкоджений на
// сторінці товару (product.js).
// -------------------------

// Розміри поки що спільні для всіх товарів (у products.json
// немає окремих даних про доступні розміри по товару) —
// на відміну від кольору, який тепер береться з product.variants.
const PRODUCT_SIZES = ["S", "M", "L"];

// -------------------------
// LocalStorage
// -------------------------

function getStorage(key) {
    return JSON.parse(localStorage.getItem(key)) || [];
}

function setStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// -------------------------
// Кеш товарів (потрібен для поп-апу міні-кошика
// на будь-якій сторінці, незалежно від того, що
// саме завантажує сама сторінка)
// -------------------------

let cachedProducts = null;

async function getProductById(id) {

    if (!cachedProducts) {

        try {

            const response = await fetch("data/products.json");

            cachedProducts = await response.json();

        } catch (error) {

            console.error(error);

            return null;

        }

    }

    return cachedProducts.find(item => Number(item.id) === Number(id));

}

async function getAllProductsCached() {

    if (!cachedProducts) {

        try {

            const response = await fetch("data/products.json");

            cachedProducts = await response.json();

        } catch (error) {

            console.error(error);

            return [];

        }

    }

    return cachedProducts;

}

// -------------------------
// Переглянуті товари
//
// Зберігаємо в localStorage лише масив id (найновіший — першим),
// самі дані товару підвантажуються через getAllProductsCached()
// при рендері віджету — це працює однаково на будь-якій сторінці
// (каталог, картка товару), незалежно від того, що саме конкретна
// сторінка вже завантажила сама.
// -------------------------

const RECENTLY_VIEWED_KEY = "bagvero_recently_viewed";
const RECENTLY_VIEWED_LIMIT = 12;

function trackRecentlyViewed(productId) {

    const id = Number(productId);

    if (!id) return;

    let ids = getStorage(RECENTLY_VIEWED_KEY).map(Number).filter(Boolean);

    ids = ids.filter(existingId => existingId !== id);

    ids.unshift(id);

    setStorage(RECENTLY_VIEWED_KEY, ids.slice(0, RECENTLY_VIEWED_LIMIT));

}

async function renderRecentlyViewed(options) {

    const {
        sectionId = "recentlyViewedSection",
        gridId = "recentlyViewedGrid",
        carouselId = "recentlyViewedCarousel",
        excludeId = null,
        limit = 8
    } = options || {};

    const section = document.getElementById(sectionId);
    const grid = document.getElementById(gridId);

    if (!section || !grid) return;

    const ids = getStorage(RECENTLY_VIEWED_KEY)
        .map(Number)
        .filter(id => id && id !== Number(excludeId));

    if (!ids.length) return;

    const allProducts = await getAllProductsCached();

    const list = ids
        .map(id => allProducts.find(item => Number(item.id) === id))
        .filter(Boolean)
        .slice(0, limit);

    if (!list.length) return;

    grid.innerHTML = list.map(product => createProductCard(product)).join("");

    if (typeof initProductCarousels === "function") initProductCarousels(grid);
    if (typeof updateFavoriteButtons === "function") updateFavoriteButtons();
    if (typeof initCarousel === "function" && carouselId) initCarousel(document.getElementById(carouselId));

    section.hidden = false;

}

// -------------------------
// Кошик
//
// Кожна позиція — об'єкт { id, color, size },
// а не просто число. Це потрібно, щоб та сама
// сумка з різним кольором/розміром зберігалася і
// показувалася як окремі рядки кошика.
//
// normalizeCartEntry залишено для зворотної
// сумісності зі старими кошиками, де лежали
// просто числа id (без кольору/розміру).
// -------------------------

function normalizeCartEntry(entry) {

    if (entry && typeof entry === "object") {

        return {
            id: Number(entry.id),
            color: entry.color || null,
            size: entry.size || null
        };

    }

    return { id: Number(entry), color: null, size: null };

}

function getCart() {
    return getStorage("cart").map(normalizeCartEntry);
}

function saveCart(cart) {
    setStorage("cart", cart);
    updateCartCounter();
}

// ключ варіанта товару — за ним групуються
// однакові id з однаковим кольором/розміром
function cartKey(entry) {
    return `${entry.id}__${entry.color || ""}__${entry.size || ""}`;
}

// згруповані рядки кошика: [{id, color, size, qty}]
function getGroupedCartLines() {

    const groups = {};

    getCart().forEach(entry => {

        const key = cartKey(entry);

        if (!groups[key]) {

            groups[key] = {
                id: entry.id,
                color: entry.color,
                size: entry.size,
                qty: 0
            };

        }

        groups[key].qty += 1;

    });

    return Object.values(groups);

}

async function addToCart(id, options = {}) {

    const { color = null, size = null } = options;

    const cart = getCart();

    cart.push({ id: Number(id), color, size });

    saveCart(cart);

    const product = await getProductById(id);

    if (product) {

        showCartPopup(product, { color, size });

    } else {

        showToast("Товар додано в кошик");

    }

}

function updateCartCounter() {

    const counter = document.getElementById("cartCount");

    if (!counter) return;

    counter.textContent = getCart().length;

}

// -------------------------
// Міні-кошик (поп-ап під іконкою кошика)
// -------------------------

function getCartSummary() {

    const cart = getCart();

    let subtotal = 0;

    cart.forEach(entry => {

        const product = cachedProducts?.find(item => Number(item.id) === entry.id);

        if (product) {

            subtotal += product.price;

        }

    });

    return { itemsCount: cart.length, subtotal };

}

function showCartPopup(product, selection = {}) {

    const popup = document.getElementById("cartPopup");

    if (!popup) {

        showToast("Товар додано в кошик");

        return;

    }

    const { itemsCount, subtotal } = getCartSummary();

    const image = product.images?.[0] || "assets/images/no-image.png";

    const metaParts = [];

    if (selection.color) metaParts.push(`Колір: ${selection.color}`);
    if (selection.size) metaParts.push(`Розмір: ${selection.size}`);

    const metaHtml = metaParts.length
        ? `<div class="cart-popup-item-meta">${metaParts.join(" · ")}</div>`
        : "";

    popup.innerHTML = `
        <div class="cart-popup-header">
            Товар додано в кошик
            <span>${itemsCount}</span>
        </div>

        <div class="cart-popup-item">
            <img
                src="${image}"
                alt="${product.title}"
                onerror="this.src='assets/images/no-image.png'">
            <div class="cart-popup-item-info">
                ${product.brand ? `<div class="cart-popup-item-brand">${product.brand}</div>` : ""}
                <div class="cart-popup-item-title">${product.title}</div>
                ${metaHtml}
                <div class="cart-popup-item-price">${formatPrice(product.price)}</div>
            </div>
        </div>

        <div class="cart-popup-total">
            <span>Сума замовлення</span>
            <span>${formatPrice(subtotal)}</span>
        </div>

        <a href="checkout" class="btn">Оформити замовлення</a>
        <a href="cart" class="cart-popup-link">Перейти до кошика</a>
    `;

    popup.hidden = false;

    requestAnimationFrame(() => popup.classList.add("show"));

    clearTimeout(window.cartPopupTimer);

    window.cartPopupTimer = setTimeout(hideCartPopup, 4500);

}

function hideCartPopup() {

    const popup = document.getElementById("cartPopup");

    if (!popup) return;

    popup.classList.remove("show");

    setTimeout(() => {

        popup.hidden = true;

    }, 250);

}

// закриття по кліку поза поп-апом
document.addEventListener("click", event => {

    const popup = document.getElementById("cartPopup");

    if (!popup || popup.hidden) return;

    const wrap = event.target.closest(".cart-icon-wrap");

    if (!wrap) {

        hideCartPopup();

    }

});

// -------------------------
// Обране
//
// Кожен запис — об'єкт { id, color, size }, як і в
// кошику: колір/розмір, обрані на картці чи сторінці
// товару в момент кліку на ❤, зберігаються разом з
// товаром і можуть бути змінені пізніше на сторінці
// "Обране". На відміну від кошика, тут один товар —
// один запис (серце просто вкл/викл для товару,
// а не для конкретного варіанта).
//
// normalizeFavoriteEntry залишено для зворотної
// сумісності зі старим обраним, де лежали просто
// числа id (без кольору/розміру).
// -------------------------

function normalizeFavoriteEntry(entry) {

    if (entry && typeof entry === "object") {

        return {
            id: Number(entry.id),
            color: entry.color || null,
            size: entry.size || null
        };

    }

    return { id: Number(entry), color: null, size: null };

}

function getFavorites() {

    return getStorage("favorites").map(normalizeFavoriteEntry);

}

function saveFavorites(list) {

    setStorage("favorites", list);

    updateFavoriteCounter();

}

function isFavorite(id, color = null, size = null) {

    return getFavorites().some(entry =>
        entry.id === Number(id) &&
        entry.color === color &&
        entry.size === size
    );

}

function toggleFavorite(id, options = {}) {

    const { color = null, size = null } = options;

    let favorites = getFavorites();

    const alreadyFavorite = favorites.some(entry =>
        entry.id === Number(id) &&
        entry.color === color &&
        entry.size === size
    );

    if (alreadyFavorite) {

        favorites = favorites.filter(entry =>
            !(entry.id === Number(id) && entry.color === color && entry.size === size)
        );

        showToast("Видалено з обраного");

    } else {

        favorites.push({ id: Number(id), color, size });

        showToast("Додано в обране");

    }

    saveFavorites(favorites);

    updateFavoriteButtons();

}

// зміна кольору/розміру вже доданого в обране товару.
// На відміну від кошика, тут кожен запис унікальний за
// (id, колір, розмір) — тож якщо користувач перемикає
// варіант на той, що вже окремо є в обраному, просто
// прибираємо старий запис замість дубля.
function changeFavoriteVariant(id, oldColor, oldSize, field, value) {

    let favorites = getFavorites();

    const index = favorites.findIndex(entry =>
        entry.id === Number(id) &&
        (entry.color || null) === (oldColor || null) &&
        (entry.size || null) === (oldSize || null)
    );

    if (index === -1) return;

    const updated = { ...favorites[index], [field]: value };

    const duplicateIndex = favorites.findIndex((entry, i) =>
        i !== index &&
        entry.id === updated.id &&
        (entry.color || null) === (updated.color || null) &&
        (entry.size || null) === (updated.size || null)
    );

    if (duplicateIndex !== -1) {

        favorites.splice(index, 1);

    } else {

        favorites[index] = updated;

    }

    saveFavorites(favorites);

}

function updateFavoriteButtons() {

    document.querySelectorAll(".favorite").forEach(button => {

        const id = Number(button.dataset.id);

        const scope = button.closest("#productPage")
            || button.closest(".product-card, .favorite-row");

        const { color, size } = getSelectedVariant(scope);

        button.classList.toggle("active", isFavorite(id, color, size));

    });

}

// лічильник ❤ в шапці — працює так само, як #cartCount
function updateFavoriteCounter() {

    const counter = document.getElementById("favCount");

    if (!counter) return;

    counter.textContent = getFavorites().length;

}

// -------------------------
// Toast
// -------------------------

function showToast(text) {

    let toast = document.getElementById("toast");

    if (!toast) {

        toast = document.createElement("div");

        toast.id = "toast";

        toast.className = "toast";

        document.body.appendChild(toast);

    }

    toast.textContent = text;

    toast.classList.add("show");

    clearTimeout(window.toastTimer);

    window.toastTimer = setTimeout(() => {

        toast.classList.remove("show");

    }, 2500);

}

// -------------------------
// Пошук (шапка сайту)
// -------------------------

// -------------------------
// Глобальний пошук (оверлей у стилі Nike)
// -------------------------

const POPULAR_SEARCHES = ["Guess", "Michael Kors", "Рюкзаки", "Жіночі сумки", "Чоловічі сумки", "Furla"];
const RECENT_SEARCHES_KEY = "recentSearches";
const MAX_RECENT_SEARCHES = 6;
const MAX_SEARCH_RESULTS = 6;

let searchOverlayEl = null;
let searchDebounceTimer = null;

// -------------------------
// Блокування скролу без "стрибка" верстки
//
// document.body.style.overflow = "hidden" прибирає смугу
// прокрутки, і сторінка (а разом з нею fixed-хедер) стає
// трохи ширшою — все "стрибає" на ширину смуги прокрутки.
// Компенсуємо це padding-right на body І на хедері (він
// position:fixed і сам по собі padding body не бачить).
// -------------------------

function lockPageScroll() {

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {

        document.body.style.paddingRight = `${scrollbarWidth}px`;

        const headerEl = document.querySelector("header");

        if (headerEl) headerEl.style.paddingRight = `${scrollbarWidth}px`;

    }

}

function unlockPageScroll() {

    document.body.style.overflow = "";
    document.body.style.paddingRight = "";

    const headerEl = document.querySelector("header");

    if (headerEl) headerEl.style.paddingRight = "";

}

function getRecentSearches() {
    return getStorage(RECENT_SEARCHES_KEY);
}

function saveRecentSearch(term) {

    const clean = term.trim();

    if (!clean) return;

    let list = getRecentSearches().filter(item => item.toLowerCase() !== clean.toLowerCase());

    list.unshift(clean);

    list = list.slice(0, MAX_RECENT_SEARCHES);

    setStorage(RECENT_SEARCHES_KEY, list);

}

function removeRecentSearch(term) {

    const list = getRecentSearches().filter(item => item !== term);

    setStorage(RECENT_SEARCHES_KEY, list);

}

function buildSearchOverlay() {

    const overlay = document.createElement("div");

    overlay.id = "searchOverlay";
    overlay.className = "search-overlay";
    overlay.hidden = true;

    overlay.innerHTML = `
        <div class="search-overlay-panel">

            <div class="search-overlay-bar container">
                <div class="search-overlay-input-wrap">
                    <span class="search-overlay-icon">🔍</span>
                    <input type="text" id="globalSearchInput" placeholder="Пошук товарів..." autocomplete="off">
                    <button type="button" id="globalSearchClear" class="search-overlay-clear" hidden>✕</button>
                </div>
                <button type="button" id="globalSearchCancel" class="search-overlay-cancel">Скасувати</button>
            </div>

            <div class="search-overlay-body container">

                <div id="searchIdleState" class="search-idle">

                    <div class="search-idle-main">

                        <div class="search-section">
                            <div class="search-section-title">Популярні запити</div>
                            <div id="searchPopular" class="search-chip-list"></div>
                        </div>

                        <div class="search-section" id="searchRecentSection" hidden>
                            <div class="search-section-title">Останні пошуки</div>
                            <div id="searchRecent" class="search-recent-list"></div>
                        </div>

                    </div>

                    <div class="search-promo-banners">

                        <a href="catalog?gender=Чоловікам" class="search-promo-banner" style="background-image:linear-gradient(rgba(15,23,41,.35),rgba(15,23,41,.55)),url('https://images.pexels.com/photos/7869755/pexels-photo-7869755.jpeg?auto=compress&cs=tinysrgb&w=600')">
                            <span>Чоловікам</span>
                        </a>

                        <a href="catalog?gender=Жінкам" class="search-promo-banner" style="background-image:linear-gradient(rgba(15,23,41,.35),rgba(15,23,41,.55)),url('https://images.pexels.com/photos/932401/pexels-photo-932401.jpeg?auto=compress&cs=tinysrgb&w=600')">
                            <span>Жінкам</span>
                        </a>

                        <a href="catalog?section=new" class="search-promo-banner search-promo-new">
                            <span>Новинки</span>
                        </a>

                        <a href="catalog?section=sale" class="search-promo-banner search-promo-sale">
                            <span>Акції</span>
                        </a>

                    </div>

                </div>

                <div id="searchResultsState" class="search-results" hidden>

                    <div class="search-suggestions">
                        <div class="search-section-title">Підказки</div>
                        <div id="searchSuggestions" class="search-suggestion-list"></div>
                    </div>

                    <div class="search-results-main">
                        <div class="search-section-title">Товари</div>
                        <div id="searchResultsGrid" class="search-results-grid"></div>
                        <p id="searchNoResults" class="search-no-results" hidden>
                            Нічого не знайдено. Спробуйте інший запит.
                        </p>
                        <a href="catalog" id="searchSeeAll" class="search-see-all" hidden>
                            Показати всі результати →
                        </a>
                    </div>

                </div>

            </div>

        </div>
        <div class="search-overlay-backdrop"></div>
    `;

    document.body.appendChild(overlay);

    return overlay;

}

function matchesQuery(product, q) {

    const haystack = [
        product.title,
        product.brand,
        product.category,
        product.description,
        ...(product.searchKeywords || [])
    ].filter(Boolean).join(" ").toLowerCase();

    return haystack.includes(q);

}

async function runGlobalSearch(query) {

    const idleState = document.getElementById("searchIdleState");
    const resultsState = document.getElementById("searchResultsState");
    const clearBtn = document.getElementById("globalSearchClear");

    const q = query.trim().toLowerCase();

    clearBtn.hidden = q.length === 0;

    if (!q) {

        idleState.hidden = false;
        resultsState.hidden = true;

        return;

    }

    idleState.hidden = true;
    resultsState.hidden = false;

    await getProductById(-1); // гарантовано підвантажує cachedProducts

    const matches = (cachedProducts || []).filter(product => matchesQuery(product, q));

    const suggestionsEl = document.getElementById("searchSuggestions");
    const gridEl = document.getElementById("searchResultsGrid");
    const noResultsEl = document.getElementById("searchNoResults");
    const seeAllEl = document.getElementById("searchSeeAll");

    // підказки — унікальні назви товарів, що збігаються
    const suggestions = [...new Set(matches.map(p => p.title))].slice(0, 6);

    suggestionsEl.innerHTML = suggestions.length
        ? suggestions.map(title => `<button type="button" class="search-suggestion-item">${title}</button>`).join("")
        : `<p class="search-no-suggestions">Немає підказок</p>`;

    suggestionsEl.querySelectorAll(".search-suggestion-item").forEach(btn => {

        btn.addEventListener("click", () => {

            const input = document.getElementById("globalSearchInput");

            input.value = btn.textContent;

            runGlobalSearch(btn.textContent);

        });

    });

    gridEl.innerHTML = matches.slice(0, MAX_SEARCH_RESULTS).map(product => {

        const image = product.images?.[0] || "assets/images/no-image.png";

        return `
            <a href="product?id=${product.id}" class="search-result-card">
                <div class="search-result-image">
                    <img src="${image}" alt="${product.title}" onerror="this.src='assets/images/no-image.png'">
                </div>
                <div class="search-result-brand">${product.brand}</div>
                <div class="search-result-title">${product.title}</div>
                <div class="search-result-price">${formatPrice(product.price)}</div>
            </a>
        `;

    }).join("");

    gridEl.querySelectorAll(".search-result-card").forEach(card => {

        card.addEventListener("click", () => saveRecentSearch(query));

    });

    noResultsEl.hidden = matches.length !== 0;

    seeAllEl.hidden = matches.length === 0;
    seeAllEl.href = `catalog?search=${encodeURIComponent(query.trim())}`;

}

function renderSearchIdleLists() {

    const popularEl = document.getElementById("searchPopular");
    const recentSection = document.getElementById("searchRecentSection");
    const recentEl = document.getElementById("searchRecent");

    popularEl.innerHTML = POPULAR_SEARCHES.map(term =>
        `<button type="button" class="search-chip">${term}</button>`
    ).join("");

    popularEl.querySelectorAll(".search-chip").forEach(chip => {

        chip.addEventListener("click", () => {

            const input = document.getElementById("globalSearchInput");

            input.value = chip.textContent;

            runGlobalSearch(chip.textContent);

        });

    });

    const recent = getRecentSearches();

    recentSection.hidden = recent.length === 0;

    recentEl.innerHTML = recent.map(term => `
        <div class="search-recent-item" data-term="${term}">
            <span class="search-recent-term">${term}</span>
            <button type="button" class="search-recent-remove" aria-label="Видалити">✕</button>
        </div>
    `).join("");

    recentEl.querySelectorAll(".search-recent-item").forEach(item => {

        const term = item.dataset.term;

        item.querySelector(".search-recent-term").addEventListener("click", () => {

            const input = document.getElementById("globalSearchInput");

            input.value = term;

            runGlobalSearch(term);

        });

        item.querySelector(".search-recent-remove").addEventListener("click", event => {

            event.stopPropagation();

            removeRecentSearch(term);

            renderSearchIdleLists();

        });

    });

}

function openSearchOverlay() {

    if (!searchOverlayEl) {

        searchOverlayEl = buildSearchOverlay();

        const input = document.getElementById("globalSearchInput");
        const clearBtn = document.getElementById("globalSearchClear");
        const cancelBtn = document.getElementById("globalSearchCancel");
        const backdrop = searchOverlayEl.querySelector(".search-overlay-backdrop");

        input.addEventListener("input", () => {

            clearTimeout(searchDebounceTimer);

            searchDebounceTimer = setTimeout(() => runGlobalSearch(input.value), 150);

        });

        input.addEventListener("keydown", event => {

            if (event.key === "Enter" && input.value.trim()) {

                saveRecentSearch(input.value);

                window.location.href = `catalog?search=${encodeURIComponent(input.value.trim())}`;

            } else if (event.key === "Escape") {

                closeSearchOverlay();

            }

        });

        clearBtn.addEventListener("click", () => {

            input.value = "";

            input.focus();

            runGlobalSearch("");

        });

        cancelBtn.addEventListener("click", closeSearchOverlay);
        backdrop.addEventListener("click", closeSearchOverlay);

    }

    renderSearchIdleLists();

    searchOverlayEl.hidden = false;

    requestAnimationFrame(() => searchOverlayEl.classList.add("open"));

    lockPageScroll();

    const input = document.getElementById("globalSearchInput");

    input.value = "";

    runGlobalSearch("");

    setTimeout(() => input.focus(), 50);

}

function closeSearchOverlay() {

    if (!searchOverlayEl) return;

    searchOverlayEl.classList.remove("open");

    unlockPageScroll();

    setTimeout(() => {

        if (searchOverlayEl) searchOverlayEl.hidden = true;

    }, 200);

}

document.addEventListener("keydown", event => {

    if (event.key === "Escape" && searchOverlayEl && !searchOverlayEl.hidden) {

        closeSearchOverlay();

    }

});

const searchBtn = document.getElementById("searchBtn");

searchBtn?.addEventListener("click", openSearchOverlay);

// -------------------------
// Мобільне меню
//
// На вузьких екранах <nav> в хедері повністю ховається
// (див. nav{display:none} у style.css), а заміни йому не було —
// з хедера неможливо було потрапити в Каталог/Новинки/Акції
// та інші розділи. Кнопку-гамбургер і саму панель генеруємо тут
// і додаємо в усі сторінки одразу (як і поп-ап пошуку вище) —
// це той самий набір посилань, що й у десктопному <nav>.
// -------------------------

let mobileNavEl = null;
let mobileNavBackdropEl = null;

const mobileMenuBtn = (() => {

    const headerIcons = document.querySelector(".header-icons");

    if (!headerIcons) return null;

    const btn = document.createElement("button");

    btn.type = "button";
    btn.id = "mobileMenuBtn";
    btn.className = "mobile-menu-btn";
    btn.setAttribute("aria-label", "Меню");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "<span></span><span></span><span></span>";

    headerIcons.prepend(btn);

    return btn;

})();

function buildMobileNav() {

    const backdrop = document.createElement("div");

    backdrop.id = "mobileNavBackdrop";
    backdrop.className = "mobile-nav-backdrop";

    const nav = document.createElement("div");

    nav.id = "mobileNav";
    nav.className = "mobile-nav";

    nav.innerHTML = `
        <ul class="mobile-nav-list">
            <li><a href="/">Головна</a></li>
            <li><a href="catalog">Каталог</a></li>
            <li><a href="catalog?section=new">Новинки</a></li>
            <li><a href="catalog?section=sale" class="sale-text">Акції</a></li>
            <li><a href="bayer-service">Байєр-сервіс</a></li>
            <li><a href="contacts">Контакти</a></li>
        </ul>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(nav);

    backdrop.addEventListener("click", closeMobileNav);

    nav.querySelectorAll("a").forEach(link => {

        link.addEventListener("click", closeMobileNav);

    });

    return { nav, backdrop };

}

function openMobileNav() {

    if (!mobileNavEl) {

        const built = buildMobileNav();

        mobileNavEl = built.nav;
        mobileNavBackdropEl = built.backdrop;

    }

    mobileMenuBtn.classList.add("open");
    mobileMenuBtn.setAttribute("aria-expanded", "true");

    mobileNavEl.classList.add("open");
    mobileNavBackdropEl.classList.add("open");

    lockPageScroll();

}

function closeMobileNav() {

    if (!mobileNavEl || !mobileNavEl.classList.contains("open")) return;

    mobileMenuBtn.classList.remove("open");
    mobileMenuBtn.setAttribute("aria-expanded", "false");

    mobileNavEl.classList.remove("open");
    mobileNavBackdropEl.classList.remove("open");

    unlockPageScroll();

}

mobileMenuBtn?.addEventListener("click", () => {

    if (mobileNavEl?.classList.contains("open")) {

        closeMobileNav();

    } else {

        openMobileNav();

    }

});

document.addEventListener("keydown", event => {

    if (event.key === "Escape") closeMobileNav();

});

// закриваємо мобільне меню, якщо екран розширили за брейкпоінт
// (наприклад, повернули телефон/склали складачку) — інакше
// панель могла лишитись відкритою поверх десктопного <nav>
window.matchMedia("(min-width:769px)").addEventListener("change", event => {

    if (event.matches) closeMobileNav();

});

// -------------------------
// Підписка на новини — тепер повністю на боці MailerLite
// (universal-скрипт у <head> + віджет .ml-embedded на сторінці)
// -------------------------

// -------------------------
// Scroll Top
// -------------------------

const scrollTopBtn = document.getElementById("scrollTop");

if (scrollTopBtn) {

    window.addEventListener("scroll", () => {

        scrollTopBtn.classList.toggle(
            "show",
            window.scrollY > 400
        );

    });

    scrollTopBtn.addEventListener("click", () => {

        window.scrollTo({

            top: 0,

            behavior: "smooth"

        });

    });

}

// -------------------------
// Плавний підйом до фото товару при зміні кольору
// -------------------------

// Хедер зафіксований зверху (position:fixed), тому при скролі
// до фото додаємо невеликий відступ, щоб верх фото не ховався під ним.
const PRODUCT_IMAGE_SCROLL_OFFSET = 96;

function scrollProductImageIntoView() {

    const mainPhoto = document.querySelector(".main-photo");

    if (!mainPhoto) return;

    const rect = mainPhoto.getBoundingClientRect();

    // якщо верх фото й так вже видно під хедером — нікуди не скролимо,
    // щоб не смикати сторінку зайвий раз
    if (rect.top >= PRODUCT_IMAGE_SCROLL_OFFSET) return;

    const targetY = Math.max(
        window.scrollY + rect.top - PRODUCT_IMAGE_SCROLL_OFFSET,
        0
    );

    window.scrollTo({

        top: targetY,

        behavior: "smooth"

    });

}

// -------------------------
// Делегування подій
// -------------------------

// -------------------------
// Обраний варіант (колір/розмір) у зоні картки/сторінки товару
// -------------------------

function getSelectedVariant(scope) {

    if (!scope) return { color: null, size: null };

    const color = scope.querySelector(".color.active")?.dataset.color
        || scope.querySelector(".mini-color.active")?.dataset.color
        || null;

    const size = scope.querySelector(".size.active")?.textContent.trim()
        || scope.querySelector(".mini-size.active")?.textContent.trim()
        || null;

    return { color, size };

}

// Розмір обов'язковий тільки якщо у товару реально є вибір
// (більше одного варіанту) — якщо розмір один-єдиний, він уже
// проставлений активним автоматично і нічого обирати не треба.
function isSizeSatisfied(scope) {

    const sizesWrap = scope.querySelector(".sizes, .product-sizes");

    if (!sizesWrap) return true;

    const options = sizesWrap.querySelectorAll(".size, .mini-size");

    if (options.length <= 1) return true;

    return !!sizesWrap.querySelector(".size.active, .mini-size.active");

}

// Підсвічуємо, що розмір треба обрати. На сторінці товару є
// місце під постійний текст помилки — показуємо його і
// прокручуємо до розмірів. У компактній картці каталогу/віджета
// такого місця немає, тож обмежуємось стряскою по рядку
// розмірів і спливаючим повідомленням.
function flagSizeRequired(scope) {

    const sizesWrap = scope.querySelector(".sizes, .product-sizes");

    if (!sizesWrap) return;

    sizesWrap.classList.remove("size-shake");

    void sizesWrap.offsetWidth;

    sizesWrap.classList.add("size-shake");

    const errorEl = scope.querySelector(".size-error");

    if (errorEl) {

        errorEl.hidden = false;

        sizesWrap.scrollIntoView({ behavior: "smooth", block: "center" });

    } else {

        showToast("Будь ласка, оберіть розмір");

    }

}

document.addEventListener("click", event => {

    const favorite = event.target.closest(".favorite");

    if (favorite) {

        const scope = favorite.closest("#productPage")
            || favorite.closest(".product-card, .favorite-row");

        const { color, size } = getSelectedVariant(scope);

        toggleFavorite(Number(favorite.dataset.id), { color, size });

        return;

    }

    const buy = event.target.closest(".buy-btn");

    if (buy) {

        const scope = buy.closest("#productPage") || buy.closest(".product-card, .favorite-row");

        if (scope && !isSizeSatisfied(scope)) {

            flagSizeRequired(scope);

            return;

        }

        const { color, size } = getSelectedVariant(scope);

        addToCart(Number(buy.dataset.id), { color, size });

        return;

    }

    const colorBtn = event.target.closest(".mini-color, .color");

    if (colorBtn) {

        const group = colorBtn.closest(".product-colors, .color-options");

        group?.querySelectorAll(".mini-color, .color").forEach(b => b.classList.remove("active"));

        colorBtn.classList.add("active");

        // перемикаємо фото товару на фото цього кольору
        // (шукаємо картинку в межах картки каталогу, рядка
        // кошика/обраного або самої сторінки товару)
        const scope = colorBtn.closest(".product-card, .favorite-row, .cart-item, #productPage");

        const carousel = scope?.querySelector(".product-carousel");
        const carouselTrack = carousel?.querySelector(".photo-track");

        if (carouselTrack) {

            // картка каталогу з каруселлю фото — перебудовуємо
            // весь трек і крапки під фото нового кольору
            try {

                const images = JSON.parse(colorBtn.dataset.images || "[]");

                if (images.length) {

                    carouselTrack.innerHTML = images.map(img => `
                        <img
                            class="product-main-image photo-slide"
                            src="${img}"
                            alt=""
                            loading="lazy"
                            onerror="this.src='assets/images/no-image.png'">
                    `).join("");

                    carouselTrack.scrollLeft = 0;

                    const dotsWrap = carousel.querySelector(".photo-dots");

                    if (dotsWrap) {

                        dotsWrap.innerHTML = images.length > 1
                            ? images.map((_, i) => `<span class="photo-dot ${i === 0 ? "active" : ""}"></span>`).join("")
                            : "";

                    }

                }

            } catch (error) {

                console.warn("Не вдалося оновити карусель для кольору", error);

            }

        } else {

            const targetImg = scope?.querySelector(".product-main-image, .cart-item-image img, .favorite-row-image img");

            if (targetImg) {

                try {

                    const images = JSON.parse(colorBtn.dataset.images || "[]");

                    if (images[0]) targetImg.src = images[0];

                } catch (error) {

                    console.warn("Не вдалося розібрати images для кольору", error);

                }

            }

        }

        // на сторінці товару додатково перемикаємо всю галерею
        if (scope?.id === "productPage" && typeof updateGalleryForColor === "function") {

            try {

                const images = JSON.parse(colorBtn.dataset.images || "[]");

                updateGalleryForColor(images, colorBtn.dataset.video || "");

            } catch (error) {

                console.warn("Не вдалося оновити галерею", error);

            }

            // перебудова галереї (інша кількість мініатюр тощо) могла
            // зсунути вміст сторінки, і сторінка ніби "стрибала".
            // Замість цього плавно піднімаємо сторінку так, щоб було
            // видно верх фото з новим кольором — але тільки якщо фото
            // й так вже не в зоні видимості під хедером, щоб зайвий раз
            // не смикати сторінку, якщо воно й так видно.
            scrollProductImageIntoView();

        }

        updateFavoriteButtons();

        return;

    }

    const sizeBtn = event.target.closest(".mini-size");

    if (sizeBtn) {

        const group = sizeBtn.closest(".product-sizes");

        group?.querySelectorAll(".mini-size").forEach(b => b.classList.remove("active"));

        sizeBtn.classList.add("active");

        updateFavoriteButtons();

        group?.classList.remove("size-shake");

        const scope = sizeBtn.closest(".product-card, .favorite-row");
        const errorEl = scope?.querySelector(".size-error");

        if (errorEl) errorEl.hidden = true;

        return;

    }

});

// -------------------------
// Init
// -------------------------

updateCartCounter();

updateFavoriteButtons();

updateFavoriteCounter();

// ======================================
// Загальний обробник кліків
// ======================================

document.addEventListener("click", function (e) {

    // Стрілки каруселі фото на картці товару
    const carouselNav = e.target.closest(".photo-nav-prev, .photo-nav-next");

    if (carouselNav) {

        e.preventDefault();

        const track = carouselNav.closest(".product-carousel")?.querySelector(".photo-track");

        if (track) {

            const dir = carouselNav.classList.contains("photo-nav-prev") ? -1 : 1;

            track.scrollBy({ left: dir * track.clientWidth, behavior: "smooth" });

        }

        return;

    }

    // Крапки-індикатори каруселі фото на картці товару
    const carouselDot = e.target.closest(".photo-dot");

    if (carouselDot) {

        e.preventDefault();

        const dotsWrap = carouselDot.parentElement;
        const track = carouselDot.closest(".product-carousel")?.querySelector(".photo-track");

        if (track && dotsWrap) {

            const index = [...dotsWrap.children].indexOf(carouselDot);

            track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });

        }

        return;

    }

    // Кнопка "Купити"
    if (e.target.closest(".buy-btn")) {
        return;
    }

    // Кнопка "Обране"
    if (e.target.closest(".favorite")) {
        return;
    }

    // Вибір кольору/розміру на картці
    if (e.target.closest(".product-options")) {
        return;
    }

    // Картка товару
    const card = e.target.closest(".product-card, .favorite-row");

    if (card) {

        const id = card.dataset.id;

        // якщо на картці вже обраний розмір — переносимо його
        // на сторінку товару, щоб не обирати заново
        const { size } = getSelectedVariant(card);

        const query = new URLSearchParams({ id });

        if (size) query.set("size", size);

        window.location.href = `product?${query.toString()}`;

    }

});

// ======================================
// Українські підказки валідації форм
// (замість англійських системних тултипів
// браузера на required/email/minlength полях)
// ======================================

function ukrainianValidationMessage(field) {

    const v = field.validity;

    if (v.valueMissing) {

        return field.type === "checkbox"
            ? "Це поле обов'язкове"
            : "Будь ласка, заповніть це поле";

    }

    if (v.typeMismatch) {

        if (field.type === "email") {
            return "Введіть коректну електронну адресу, наприклад name@example.com";
        }

        return "Значення введено в неправильному форматі";

    }

    if (v.tooShort) {
        return `Мінімум ${field.minLength} символів (зараз ${field.value.length})`;
    }

    if (v.tooLong) {
        return `Максимум ${field.maxLength} символів`;
    }

    if (v.patternMismatch) {
        return "Значення не відповідає очікуваному формату";
    }

    if (v.rangeUnderflow) {
        return `Значення має бути не менше ${field.min}`;
    }

    if (v.rangeOverflow) {
        return `Значення має бути не більше ${field.max}`;
    }

    return "Перевірте правильність заповнення цього поля";

}

// Вішає обробники на всі поля форми: скидають кастомне
// повідомлення при введенні і виставляють українське замість
// дефолтного англійського, коли поле недійсне.
function applyUkrainianValidation(form) {

    if (!form || form.dataset.ukValidationBound) return;

    form.dataset.ukValidationBound = "true";

    form.querySelectorAll("input, select, textarea").forEach(field => {

        field.addEventListener("invalid", () => {

            field.setCustomValidity(ukrainianValidationMessage(field));

        });

        field.addEventListener("input", () => field.setCustomValidity(""));
        field.addEventListener("change", () => field.setCustomValidity(""));

    });

}

// Перевіряє форму цілком; якщо є недійсні поля — показує
// українську підказку на першому з них і повертає false.
function validateFormUk(form) {

    applyUkrainianValidation(form);

    const fields = [...form.querySelectorAll("input, select, textarea")];

    let firstInvalid = null;

    fields.forEach(field => {

        field.setCustomValidity("");

        if (!field.checkValidity()) {

            field.setCustomValidity(ukrainianValidationMessage(field));

            if (!firstInvalid) firstInvalid = field;

        }

    });

    if (firstInvalid) {

        firstInvalid.reportValidity();
        firstInvalid.focus();

        return false;

    }

    return true;

}

// подключаємо одразу до всіх форм на сторінці, які досі
// покладались на нативні (англійські) підказки браузера
document.querySelectorAll("form").forEach(applyUkrainianValidation);

const contactForm = document.getElementById("contactForm");

contactForm?.addEventListener("submit", event => {

    event.preventDefault();

    if (!validateFormUk(contactForm)) return;

    showToast("Дякуємо! Ваше повідомлення надіслано, ми зв'яжемося з вами найближчим часом.");

    contactForm.reset();

});

// -------------------------
// Кольори товару (використовується в catalog.js і promo.js для
// побудови фільтра "Колір")
// -------------------------

function getProductColors(product) {

    const colors = new Map(); // назва -> hex

    (product.variants || []).forEach(variant => {

        if (variant.color && !colors.has(variant.color)) {
            colors.set(variant.color, variant.hex || null);
        }

    });

    if (product.color && !colors.has(product.color)) {
        colors.set(product.color, null);
    }

    return colors;

}

function getDiscountPercent(product) {

    if (!product.oldPrice || product.oldPrice <= product.price) return 0;

    return Math.round((1 - product.price / product.oldPrice) * 100);

}

// -------------------------
// SEO: динамічне оновлення <title>, meta description,
// canonical, Open Graph та JSON-LD для сторінок, контент яких
// підвантажується через JS (товар, акція). Без цього кожна така
// сторінка мала б однаковий title/description для Google —
// це й був один з найкритичніших SEO-багів сайту.
// -------------------------

const SITE_URL = "https://bestbrnd4u.github.io";

function setMetaByName(name, content) {

    if (!content) return;

    let tag = document.querySelector(`meta[name="${name}"]`);

    if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
    }

    tag.setAttribute("content", content);

}

function setMetaByProperty(property, content) {

    if (!content) return;

    let tag = document.querySelector(`meta[property="${property}"]`);

    if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
    }

    tag.setAttribute("content", content);

}

function setCanonical(url) {

    let link = document.querySelector('link[rel="canonical"]');

    if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
    }

    link.setAttribute("href", url);

}

// Створює/оновлює <script type="application/ld+json"> з заданим id.
// Ключі зі значенням undefined JSON.stringify сам прибирає —
// зручно для необов'язкових полів (sku, rating тощо).
function setJsonLd(id, data) {

    let script = document.getElementById(id);

    if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = id;
        document.head.appendChild(script);
    }

    script.textContent = JSON.stringify(data);

}

// Обрізає опис до безпечної для meta description довжини,
// не розриваючи слово посередині.
function truncateForMeta(text, maxLength = 155) {

    if (!text || text.length <= maxLength) return text || "";

    return `${text.slice(0, maxLength).replace(/\s+\S*$/, "")}…`;

}

