// ======================================
// ui.js
// Загальні UI-компоненти магазину
// ======================================

function formatPrice(price) {
    return new Intl.NumberFormat("uk-UA").format(price) + " ₴";
}

function createProductCard(product) {

    const badge = product.badge
        ? `<div class="badge">${product.badge}</div>`
        : "";

    const image = product.images?.[0] || "assets/images/no-image.png";

    const rating = product.rating ?? 0;
    const reviews = product.reviews ?? 0;
    const brand = product.brand || "Без бренду";

    const oldPrice = product.oldPrice
        ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>`
        : "";

    const discount = product.oldPrice
        ? Math.round((1 - product.price / product.oldPrice) * 100)
        : 0;

    return `
        <div class="product-card" data-id="${product.id}">
            <div class="product-image">
                ${badge}
                <button
                    class="favorite"
                    data-id="${product.id}"
                    title="Додати в обране">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 21s-6.7-4.4-9.3-8.3C.9 9.6 1.7 5.9 5.1 4.9c2-.6 4 .2 5.2 1.9l1.7 2.3 1.7-2.3c1.2-1.7 3.2-2.5 5.2-1.9 3.4 1 4.2 4.7 2.4 7.8C18.7 16.6 12 21 12 21z"/>
                    </svg>
                </button>
                <img
                    src="${image}"
                    alt="${product.title}"
                    loading="lazy"
                    onerror="this.src='assets/images/no-image.png'">
            </div>
            <div class="product-info">
                <div class="product-category">
                    ${brand}
                </div>
                <div class="product-title">
                    ${product.title}
                </div>
                <div class="product-rating">
                    ⭐ ${rating}
                    (${reviews})
                </div>
                <div class="product-price">
                    <div class="price-wrapper">
                        ${oldPrice}
                        <span class="price">
                            ${formatPrice(product.price)}
                        </span>
                    </div>
                    ${
                        discount > 0
                            ? `<span class="discount">-${discount}%</span>`
                            : ""
                    }
                </div>
                <button
                    class="btn buy-btn"
                    data-id="${product.id}">
                    Купити
                </button>
            </div>
        </div>
    `;

}
