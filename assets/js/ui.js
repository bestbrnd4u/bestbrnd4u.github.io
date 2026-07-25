// ======================================
// ui.js
// Загальні UI-компоненти магазину
// ======================================

function formatPrice(price) {
    return new Intl.NumberFormat("uk-UA").format(price) + "\u00A0грн";
}

// -------------------------
// Карусель для "Популярні товари" / "Схожі товари"
//
// Викликати ПІСЛЯ того, як картки вже вставлені в
// .carousel-track (innerHTML) — інакше нема що виміряти.
// Однакова логіка для будь-якого блоку такого вигляду:
// <div class="carousel">
//   <button class="carousel-arrow carousel-prev">...
//   <div class="carousel-track">...картки...</div>
//   <button class="carousel-arrow carousel-next">...
// </div>
// -------------------------

function initCarousel(carouselEl) {

    if (!carouselEl) return;

    const track = carouselEl.querySelector(".carousel-track");
    const prevBtn = carouselEl.querySelector(".carousel-prev");
    const nextBtn = carouselEl.querySelector(".carousel-next");

    if (!track || !prevBtn || !nextBtn) return;

    function getStep() {

        const card = track.querySelector(".product-card");

        if (!card) return track.clientWidth;

        const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 24;

        return card.getBoundingClientRect().width + gap;

    }

    function updateArrows() {

        const maxScroll = track.scrollWidth - track.clientWidth - 2;

        const hasOverflow = track.scrollWidth > track.clientWidth + 2;

        prevBtn.disabled = !hasOverflow || track.scrollLeft <= 2;
        nextBtn.disabled = !hasOverflow || track.scrollLeft >= maxScroll;

    }

    prevBtn.addEventListener("click", () => {
        track.scrollBy({ left: -getStep(), behavior: "smooth" });
    });

    nextBtn.addEventListener("click", () => {
        track.scrollBy({ left: getStep(), behavior: "smooth" });
    });

    track.addEventListener("scroll", updateArrows);

    window.addEventListener("resize", updateArrows);

    // даємо браузеру один кадр, щоб порахувати реальні розміри
    // щойно вставлених карток
    requestAnimationFrame(updateArrows);

}

function createProductCard(product) {

    const badge = product.badge
        ? `<div class="badge">${product.badge}</div>`
        : "";

    const variants = product.variants?.length
        ? product.variants
        : [{ color: product.color || "Основний", hex: "#999", images: product.images || [] }];

    const image = variants[0].images?.[0] || product.images?.[0] || "assets/images/no-image.png";

    const brand = product.brand || "Без бренду";

    const oldPrice = product.oldPrice
        ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>`
        : "";

    const discount = product.oldPrice
        ? Math.round((1 - product.price / product.oldPrice) * 100)
        : 0;

    const sizes = product.sizes?.length ? product.sizes : PRODUCT_SIZES;

    const colorButtons = variants.map((variant, index) => `
        <button
            type="button"
            class="mini-color ${index === 0 ? "active" : ""}"
            data-color="${variant.color}"
            data-images='${JSON.stringify(variant.images || [])}'
            title="${variant.color}"
            style="background:${variant.hex}"></button>
    `).join("");

    const sizeButtons = sizes.map((size, index) => `
        <button
            type="button"
            class="mini-size ${index === 0 ? "active" : ""}">
            ${size}
        </button>
    `).join("");

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
                    class="product-main-image"
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
                <div class="product-options">
                    <div class="product-colors">
                        ${colorButtons}
                    </div>
                    <div class="product-sizes">
                        ${sizeButtons}
                    </div>
                </div>
                <div class="product-price">
                    <div class="price-wrapper">
                        ${oldPrice}
                        ${
                            discount > 0
                                ? `<span class="discount">-${discount}%</span>`
                                : ""
                        }
                        <span class="price">
                            ${formatPrice(product.price)}
                        </span>
                    </div>
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
