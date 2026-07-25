// ======================================
// favorites.js
// Логіка сторінки обраного (favorites)
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

function createFavoriteRow(product, favEntry) {

    const variants = product.variants?.length
        ? product.variants
        : [{ color: product.color || "Основний", hex: "#999", images: product.images || [] }];

    const oldPrice = product.oldPrice
        ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>`
        : "";

    const sizes = product.sizes?.length ? product.sizes : PRODUCT_SIZES;

    const activeColor = favEntry.color || variants[0].color;
    const activeSize = favEntry.size || sizes[0];

    const activeVariant = variants.find(v => v.color === activeColor) || variants[0];

    const image = activeVariant.images?.[0] || product.images?.[0] || "assets/images/no-image.png";

    const colorButtons = variants.map(variant => `
        <button
            type="button"
            class="mini-color ${variant.color === activeColor ? "active" : ""}"
            data-color="${variant.color}"
            data-images='${JSON.stringify(variant.images || [])}'
            title="${variant.color}"
            style="background:${variant.hex}"></button>
    `).join("");

    const sizeButtons = sizes.map(size => `
        <button
            type="button"
            class="mini-size ${size === activeSize ? "active" : ""}">
            ${size}
        </button>
    `).join("");

    return `
        <div class="favorite-row" data-id="${product.id}" data-color="${favEntry.color || ""}" data-size="${favEntry.size || ""}">

            <a href="product?id=${product.id}" class="favorite-row-image">
                <img
                    src="${image}"
                    alt="${product.title}"
                    onerror="this.src='assets/images/no-image.png'">
            </a>

            <div class="favorite-row-info">
                <div class="favorite-row-brand">
                    ${product.brand || "Без бренду"}
                </div>
                <a href="product?id=${product.id}" class="favorite-row-title">
                    ${product.title}
                </a>
                <div class="product-options">
                    <div class="product-colors">
                        ${colorButtons}
                    </div>
                    <div class="product-sizes">
                        ${sizeButtons}
                    </div>
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

    const list = favorites
        .map(favEntry => {

            const product = allProducts.find(item => item.id === favEntry.id);

            return product ? { product, favEntry } : null;

        })
        .filter(Boolean);

    favoritesGrid.innerHTML = list
        .map(({ product, favEntry }) => createFavoriteRow(product, favEntry))
        .join("");

    favoritesGrid.hidden = list.length === 0;

    if (emptyFavoritesEl) {
        emptyFavoritesEl.hidden = list.length !== 0;
    }

    updateFavoriteButtons();

}

// зміна кольору/розміру прямо в списку обраного
favoritesGrid?.addEventListener("click", event => {

    const colorBtn = event.target.closest(".mini-color");
    const sizeBtn = event.target.closest(".mini-size");

    if (!colorBtn && !sizeBtn) return;

    const row = event.target.closest(".favorite-row");

    if (!row) return;

    const id = Number(row.dataset.id);
    const oldColor = row.dataset.color || null;
    const oldSize = row.dataset.size || null;

    if (colorBtn) {

        changeFavoriteVariant(id, oldColor, oldSize, "color", colorBtn.dataset.color);

    } else if (sizeBtn) {

        changeFavoriteVariant(id, oldColor, oldSize, "size", sizeBtn.textContent.trim());

    }

    renderFavorites();

});

// Перемальовуємо список одразу після видалення з обраного
document.addEventListener("click", event => {

    if (event.target.closest(".favorite")) {

        renderFavorites();

    }

});

initFavorites();
