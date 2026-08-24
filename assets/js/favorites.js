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
    const activeSize = favEntry.size || (sizes.length === 1 ? sizes[0] : null);

    const activeVariant = variants.find(v => v.color === activeColor) || variants[0];

    const image = activeVariant.images?.[0] || product.images?.[0] || "assets/images/no-image.png";

    // Кольори, які вже лежать в обраному окремими рядками, позначаємо
    // одразу — щоб людина не тицяла в них і не отримувала відмову.
    const takenColors = new Set(
        getFavorites()
            .filter(entry => entry.id === product.id
                && (entry.size || null) === (activeSize || null)
                && (entry.color || null) !== (activeColor || null))
            .map(entry => entry.color)
    );

    const colorButtons = variants.map(variant => {

        const taken = takenColors.has(variant.color);

        return `
        <button
            type="button"
            class="mini-color ${variant.color === activeColor ? "active" : ""}${taken ? " is-taken" : ""}"
            data-color="${escapeHtml(variant.color)}"
            data-images='${escapeAttrSingleQuoted(JSON.stringify(variant.images || []))}'
            title="${escapeHtml(variant.color)}${taken ? " — уже окремим рядком в обраному" : ""}"
            style="background:${escapeHtml(variant.hex)}"></button>
    `;

    }).join("");

    const sizeButtons = sizes.map(size => `
        <button
            type="button"
            class="mini-size ${size === activeSize ? "active" : ""}">
            ${size}
        </button>
    `).join("");
    // Посилання веде на ТОЙ САМИЙ колір і розмір, що в обраному.
    // Раніше стояв productUrl(product) без параметрів — з обраного
    // завжди відкривався перший колір товару.
    const rowUrl = productUrl(product, { color: activeColor, size: activeSize });

    // Кружечки кольорів не підписані, тож назву показуємо окремо.
    const colorLabel = activeColor
        ? `<div class="favorite-row-color">Колір: <b>${escapeHtml(activeColor)}</b></div>`
        : "";


    return `
        <div class="favorite-row" data-id="${product.id}" data-color="${favEntry.color || ""}" data-size="${favEntry.size || ""}">

            <a href="${rowUrl}" class="favorite-row-image">
                <img
                    src="${image}"
                    alt="${escapeHtml(product.title)}"
                    onerror="this.src='assets/images/no-image.png'">
            </a>

            <div class="favorite-row-info">
                <div class="favorite-row-brand">
                    ${product.brand || "Без бренду"}
                </div>
                <a href="${rowUrl}" class="favorite-row-title">
                    ${escapeHtml(product.title)}
                </a>
                ${colorLabel}
                <div class="product-options">
<div class="product-colors-wrap">
                        <button type="button" class="colors-arrow colors-arrow-left" aria-label="Попередні кольори" tabindex="-1">‹</button>
                        <div class="product-colors">
                            ${colorButtons}
                        </div>
                        <button type="button" class="colors-arrow colors-arrow-right" aria-label="Наступні кольори" tabindex="-1">›</button>
                    </div>
                    <div class="product-sizes-wrap">
                        <button type="button" class="sizes-arrow sizes-arrow-left" aria-label="Попередні розміри" tabindex="-1">‹</button>
                        <div class="product-sizes">
                            ${sizeButtons}
                        </div>
                        <button type="button" class="sizes-arrow sizes-arrow-right" aria-label="Наступні розміри" tabindex="-1">›</button>
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

    // changeFavoriteVariant повертає false, якщо такий варіант уже є
    // у списку. Тоді нічого не змінюється — і про це треба сказати,
    // інакше виглядає, ніби кнопка не працює.
    let applied = true;

    if (colorBtn) {

        applied = changeFavoriteVariant(id, oldColor, oldSize, "color", colorBtn.dataset.color);

    } else if (sizeBtn) {

        applied = changeFavoriteVariant(id, oldColor, oldSize, "size", sizeBtn.textContent.trim());

    }

    if (applied === false) {

        showToast("Цей варіант уже є в обраному");

        return;

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
