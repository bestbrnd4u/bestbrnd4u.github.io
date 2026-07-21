// ======================================
// common.js
// Загальна логіка сайту Bagvero
// ======================================

// -------------------------
// Фіксований набір кольорів/розмірів
//
// В products.json немає even даних про реально доступні
// варіанти по кожному товару окремо, тому на картці
// каталогу, в обраному і в кошику використовується той
// самий єдиний набір, що й раніше був захардкоджений на
// сторінці товару (product.js).
// -------------------------

const PRODUCT_COLORS = [
    { name: "Чорний", hex: "#000" },
    { name: "Коричневий", hex: "#8b5e3c" },
    { name: "Бежевий", hex: "#d9c7a1" }
];

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

        <a href="checkout.html" class="btn">Оформити замовлення</a>
        <a href="cart.html" class="cart-popup-link">Перейти до кошика</a>
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

function isFavorite(id) {

    return getFavorites().some(entry => entry.id === Number(id));

}

function toggleFavorite(id, options = {}) {

    const { color = null, size = null } = options;

    let favorites = getFavorites();

    if (favorites.some(entry => entry.id === Number(id))) {

        favorites = favorites.filter(entry => entry.id !== Number(id));

        showToast("Видалено з обраного");

    } else {

        favorites.push({ id: Number(id), color, size });

        showToast("Додано в обране");

    }

    saveFavorites(favorites);

    updateFavoriteButtons();

}

// зміна кольору/розміру вже доданого в обране товару
function changeFavoriteVariant(id, field, value) {

    const favorites = getFavorites();

    const entry = favorites.find(item => item.id === Number(id));

    if (!entry) return;

    entry[field] = value;

    saveFavorites(favorites);

}

function updateFavoriteButtons() {

    const favorites = getFavorites();

    document.querySelectorAll(".favorite").forEach(button => {

        const id = Number(button.dataset.id);

        button.classList.toggle(
            "active",
            favorites.some(entry => entry.id === id)
        );

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

                        <a href="catalog.html?gender=Чоловікам" class="search-promo-banner" style="background-image:linear-gradient(rgba(15,23,41,.35),rgba(15,23,41,.55)),url('https://images.pexels.com/photos/7869755/pexels-photo-7869755.jpeg?auto=compress&cs=tinysrgb&w=600')">
                            <span>Чоловікам</span>
                        </a>

                        <a href="catalog.html?gender=Жінкам" class="search-promo-banner" style="background-image:linear-gradient(rgba(15,23,41,.35),rgba(15,23,41,.55)),url('https://images.pexels.com/photos/932401/pexels-photo-932401.jpeg?auto=compress&cs=tinysrgb&w=600')">
                            <span>Жінкам</span>
                        </a>

                        <a href="catalog.html?section=new" class="search-promo-banner search-promo-new">
                            <span>Новинки</span>
                        </a>

                        <a href="catalog.html?section=sale" class="search-promo-banner search-promo-sale">
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
                        <a href="catalog.html" id="searchSeeAll" class="search-see-all" hidden>
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

    const haystack = `${product.title} ${product.brand} ${product.category}`.toLowerCase();

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
            <a href="product.html?id=${product.id}" class="search-result-card">
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
    seeAllEl.href = `catalog.html?search=${encodeURIComponent(query.trim())}`;

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

                window.location.href = `catalog.html?search=${encodeURIComponent(input.value.trim())}`;

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

        const { color, size } = getSelectedVariant(scope);

        addToCart(Number(buy.dataset.id), { color, size });

        return;

    }

    const colorBtn = event.target.closest(".mini-color");

    if (colorBtn) {

        const group = colorBtn.closest(".product-colors");

        group?.querySelectorAll(".mini-color").forEach(b => b.classList.remove("active"));

        colorBtn.classList.add("active");

        return;

    }

    const sizeBtn = event.target.closest(".mini-size");

    if (sizeBtn) {

        const group = sizeBtn.closest(".product-sizes");

        group?.querySelectorAll(".mini-size").forEach(b => b.classList.remove("active"));

        sizeBtn.classList.add("active");

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

        window.location.href = `product.html?id=${id}`;

    }

});
