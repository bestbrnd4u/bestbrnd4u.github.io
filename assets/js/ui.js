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

// -------------------------
// Карусель фото на картці товару (каталог/подборки) —
// scroll-snap трек + крапки-індикатори. Стрілки та крапки
// обробляються делегуванням в common.js (щоб не навішувати
// обробники повторно при перебудові треку через зміну кольору),
// тут лише синхронізуємо активну крапку зі скролом і гасимо
// клік по картці одразу після свайпу.
// -------------------------

function bindProductCarousel(track) {

    if (!track || track.dataset.carouselBound) return;

    track.dataset.carouselBound = "1";

    const carousel = track.closest(".product-carousel");

    function syncDots() {

        const dots = carousel?.querySelectorAll(".photo-dot");

        if (!dots || !dots.length) return;

        const index = Math.round(track.scrollLeft / (track.clientWidth || 1));

        dots.forEach((dot, i) => dot.classList.toggle("active", i === index));

    }

    let scrollTimer = null;

    track.addEventListener("scroll", () => {

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(syncDots, 80);

    }, { passive: true });

    let touchStartX = 0;
    let isSwiping = false;

    track.addEventListener("touchstart", event => {

        touchStartX = event.touches[0].clientX;
        isSwiping = false;

    }, { passive: true });

    track.addEventListener("touchmove", event => {

        if (Math.abs(event.touches[0].clientX - touchStartX) > 10) isSwiping = true;

    }, { passive: true });

    // якщо це був свайп, а не тап — гасимо клік, щоб картка
    // не перекинула на сторінку товару одразу після гортання фото
    track.addEventListener("click", event => {

        if (isSwiping) {
            event.preventDefault();
            event.stopPropagation();
        }

    });

}

function initProductCarousels(root) {

    (root || document).querySelectorAll(".photo-track").forEach(bindProductCarousel);

}

function createProductCard(product) {

    const badge = product.badge
        ? `<div class="badge">${product.badge}</div>`
        : "";

    const variants = product.variants?.length
        ? product.variants
        : [{ color: product.color || "Основний", hex: "#999", images: product.images || [] }];

    const images = variants[0].images?.length
        ? variants[0].images
        : (product.images?.length ? product.images : ["assets/images/no-image.png"]);

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
                <div class="product-carousel">
                    <div class="photo-track">
                        ${images.map(img => `
                            <img
                                class="product-main-image photo-slide"
                                src="${img}"
                                alt="${product.title}"
                                loading="lazy"
                                onerror="this.src='assets/images/no-image.png'">
                        `).join("")}
                    </div>
                    ${images.length > 1 ? `
                    <button type="button" class="photo-nav photo-nav-prev" aria-label="Попереднє фото">‹</button>
                    <button type="button" class="photo-nav photo-nav-next" aria-label="Наступне фото">›</button>
                    <div class="photo-dots">
                        ${images.map((_, index) => `<span class="photo-dot ${index === 0 ? "active" : ""}"></span>`).join("")}
                    </div>` : ""}
                </div>
            </div>
            <div class="product-info">
                <a
                    class="product-category"
                    href="catalog?brand=${encodeURIComponent(brand)}"
                    title="Усі товари бренду ${brand}">
                    ${brand}
                </a>
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
                    <span class="price">
                        ${formatPrice(product.price)}
                    </span>
                    <div class="price-meta">
                        ${oldPrice}
                        ${
                            discount > 0
                                ? `<span class="discount">-${discount}%</span>`
                                : ""
                        }
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
