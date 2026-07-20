// ======================================
// favorites.js
// Логіка сторінки обраного (favorites.html)
// ======================================

let allProducts = [];

const favoritesGrid = document.getElementById("favoritesGrid");
const emptyFavoritesEl = document.getElementById("emptyFavorites");

async function initFavorites() {

    if (!favoritesGrid) return;

    try {

        const response = await fetch("data/products.json");

        if (!response.ok) {
            throw new Error("Не вдалося завантажити товари");
        }

        allProducts = await response.json();

        renderFavorites();

    } catch (error) {

        favoritesGrid.innerHTML = `
            <p class="error">
                Помилка завантаження обраного.
            </p>
        `;

        console.error(error);

    }

}

function createFavoriteRow(product) {

    const image = product.images?.[0] || "assets/images/no-image.png";

    const oldPrice = product.oldPrice
        ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>`
        : "";

    return `
        <div class="favorite-row" data-id="${product.id}">

            <a href="product.html?id=${product.id}" class="favorite-row-image">
                <img
                    src="${image}"
                    alt="${product.title}"
                    onerror="this.src='assets/images/no-image.png'">
            </a>

            <div class="favorite-row-info">
                <div class="favorite-row-brand">
                    ${product.brand || "Без бренду"}
                </div>
                <a href="product.html?id=${product.id}" class="favorite-row-title">
                    ${product.title}
                </a>
                <div class="favorite-row-rating">
                    ⭐ ${product.rating ?? 0} (${product.reviews ?? 0})
                </div>
                <div class="favorite-row-price">
                    ${oldPrice}
                    <span class="price">${formatPrice(product.price)}</span>
                </div>
            </div>

            <div class="favorite-row-actions">
                <button class="btn buy-btn" data-id="${product.id}">
                    Додати в кошик
                </button>
                <button class="favorite-row-remove favorite active" data-id="${product.id}">
                    ✕ Видалити з обраного
                </button>
            </div>

        </div>
    `;

}

function renderFavorites() {

    const favorites = getFavorites();

    const list = allProducts.filter(product =>
        favorites.includes(product.id)
    );

    favoritesGrid.innerHTML = list
        .map(product => createFavoriteRow(product))
        .join("");

    favoritesGrid.hidden = list.length === 0;

    if (emptyFavoritesEl) {
        emptyFavoritesEl.hidden = list.length !== 0;
    }

    updateFavoriteButtons();

}

// Перемальовуємо список одразу після видалення з обраного
document.addEventListener("click", event => {

    if (event.target.closest(".favorite")) {

        renderFavorites();

    }

});

initFavorites();
