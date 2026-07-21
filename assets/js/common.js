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

const searchBtn = document.getElementById("searchBtn");

if (searchBtn) {

    searchBtn.addEventListener("click", () => {

        if (window.location.pathname.endsWith("catalog.html")) {

            document.getElementById("searchInput")?.focus();

        } else {

            window.location.href = "catalog.html";

        }

    });

}

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
