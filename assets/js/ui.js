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

        // якщо картки й так усі влазять (наприклад, у віджеті
        // лишився один товар) — гортати нема куди, тож стрілки
        // не просто дизейблимо, а прибираємо зовсім
        prevBtn.style.display = hasOverflow ? "" : "none";
        nextBtn.style.display = hasOverflow ? "" : "none";

        // поріг "ми на самому початку/кінці" зроблений з запасом
        // (не строго 0/maxScroll) — після інерційного свайпу чи
        // scroll-snap браузер іноді лишає scrollLeft у стані на
        // кілька пікселів вбік (напр. 4px), і з надто суворим
        // порогом стрілка "Попередні" лишалася активною навіть
        // на першому товарі
        prevBtn.disabled = !hasOverflow || track.scrollLeft <= 8;
        nextBtn.disabled = !hasOverflow || track.scrollLeft >= maxScroll - 6;

    }

    let settleTimer = null;

    function onScroll() {

        updateArrows();

        // на iOS фінальна корекція скролу (доводка до
        // найближчої картки через scroll-snap після інерції
        // свайпу) не завжди супроводжується ще одним "scroll"
        // подією рівно в кінцевій позиції — тому додатково
        // перевіряємо стан ще раз, коли скрол справді зупинився
        clearTimeout(settleTimer);
        settleTimer = setTimeout(updateArrows, 120);

    }

    prevBtn.addEventListener("click", () => {

        if (prevBtn.disabled) return;

        const step = getStep();
        let target = track.scrollLeft - step;

        // якщо до самого початку залишається менше кроку —
        // доскролюємо рівно до 0, щоб не "застрягти" через
        // дробові пікселі і не лишити стрілку активною
        if (target < step / 2) target = 0;

        prevBtn.disabled = target <= 0;
        nextBtn.disabled = false;

        track.scrollTo({ left: target, behavior: "smooth" });

    });

    nextBtn.addEventListener("click", () => {

        if (nextBtn.disabled) return;

        const step = getStep();
        const maxScroll = track.scrollWidth - track.clientWidth;
        let target = track.scrollLeft + step;

        // так само на кінці — доскролюємо рівно до останньої картки
        if (target > maxScroll - step / 2) target = maxScroll;

        nextBtn.disabled = target >= maxScroll;
        prevBtn.disabled = false;

        track.scrollTo({ left: target, behavior: "smooth" });

    });

    track.addEventListener("scroll", onScroll, { passive: true });

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

    function syncNav() {

        const total = track.children.length;

        const index = Math.round(track.scrollLeft / (track.clientWidth || 1));

        const prevBtn = carousel?.querySelector(".photo-nav-prev");
        const nextBtn = carousel?.querySelector(".photo-nav-next");

        if (prevBtn) prevBtn.disabled = index <= 0;
        if (nextBtn) nextBtn.disabled = index >= total - 1;

    }

    function syncDots() {

        const dots = carousel?.querySelectorAll(".photo-dot");

        const index = Math.round(track.scrollLeft / (track.clientWidth || 1));

        if (dots && dots.length) {
            dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
        }

        // якщо серед слайдів є відео — програємо його лише тоді,
        // коли користувач долистав саме до цього слайду каруселі
        // (а не коли картка просто зʼявилась на екрані); на всіх
        // інших слайдах відео ставимо на паузу
        Array.from(track.children).forEach((slide, i) => {

            if (slide.tagName !== "VIDEO") return;

            if (i === index) {
                slide.play().catch(() => {});
            } else {
                slide.pause();
            }

        });

        syncNav();

    }

    let scrollTimer = null;

    // одразу виставляємо правильний стан стрілок (перше фото —
    // "назад" вимкнена), а не тільки після першого скролу
    syncDots();

    track.addEventListener("scroll", () => {

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(syncDots, 80);

    }, { passive: true });

    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startTime = 0;
    let axis = null; // null поки не визначено, "x" або "y"
    let isSwiping = false;

    track.addEventListener("touchstart", event => {

        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        startScrollLeft = track.scrollLeft;
        startTime = Date.now();
        axis = null;
        isSwiping = false;

    }, { passive: true });

    // touchmove НЕ пасивний навмисно — інакше не можна буде
    // викликати preventDefault() лише для горизонтального жесту
    track.addEventListener("touchmove", event => {

        const dx = event.touches[0].clientX - startX;
        const dy = event.touches[0].clientY - startY;

        if (axis === null) {

            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;

            axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";

            // на час горизонтального свайпу вимикаємо CSS
            // scroll-snap — інакше браузер намагається
            // "підтягнути" позицію до найближчого фото на
            // кожному touchmove, і замість плавного руху за
            // пальцем виходить залипання з різким стрибком
            if (axis === "x") track.style.scrollSnapType = "none";

        }

        if (axis === "y") return; // вертикаль — віддаємо жест сторінці, нічого не робимо

        // горизонталь — гортаємо фото самі, забороняючи
        // браузеру одночасно намагатись скролити сторінку
        event.preventDefault();

        isSwiping = true;

        track.scrollLeft = startScrollLeft - dx;

    }, { passive: false });

    track.addEventListener("touchend", () => {

        if (axis !== "x") return;

        const width = track.clientWidth || 1;
        const baseIndex = Math.round(startScrollLeft / width);

        const dx = track.scrollLeft - startScrollLeft;
        const elapsed = Math.max(Date.now() - startTime, 1);
        const velocity = Math.abs(dx) / elapsed;

        const distanceThreshold = width * 0.12;
        const velocityThreshold = 0.3;

        let index = baseIndex;

        if (Math.abs(dx) > distanceThreshold || velocity > velocityThreshold) {
            index = baseIndex + (dx > 0 ? 1 : -1);
        }

        index = Math.max(0, Math.min(index, track.children.length - 1));

        track.scrollTo({ left: index * width, behavior: "smooth" });

        // повертаємо snap назад вже після того, як доїхали —
        // невелика затримка під тривалість smooth-скролу
        setTimeout(() => { track.style.scrollSnapType = ""; }, 400);

    });

    track.addEventListener("touchcancel", () => {

        track.style.scrollSnapType = "";

    });

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

// -------------------------
// Захист від "захоплення" колеса миші горизонтальною
// каруссю (scroll-snap-type:x). Без цього, навівши мишку на
// фото і покрутивши колесо (звичний вертикальний скрол
// сторінки), браузer іноді трактує це як команду "гортати
// слайди" — сторінка при цьому не скролиться. Тут ми самі
// вирішуємо: вертикальний жест — завжди скрол сторінки,
// горизонтальний (трекпад-свайп) — гортання каруселі.
// -------------------------

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

    // відео беремо з активного (першого) варіанту кольору —
    // саме його фото/колір показані на картці за замовчуванням
    const video = variants[0].video || "";

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

    const sizeButtons = sizes.map(size => `
        <button
            type="button"
            class="mini-size ${sizes.length === 1 ? "active" : ""}">
            ${size}
        </button>
    `).join("");

    const preOrderBadge = product.preOrder
        ? `<div class="badge badge-preorder"><span class="badge-preorder-icon">📦</span><span class="badge-preorder-text">Під замовлення</span></div>`
        : "";

    return `
        <div class="product-card" data-id="${product.id}">
            <div class="product-image">
                <div class="badge-stack">
                    ${badge}
                    ${preOrderBadge}
                </div>
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
                        ${video ? `
                            <video
                                class="photo-slide product-video-slide"
                                src="${video}"
                                poster="${images[0]}"
                                muted
                                loop
                                playsinline
                                preload="metadata"></video>
                        ` : ""}
                    </div>
                    ${(images.length + (video ? 1 : 0)) > 1 ? `
                    <button type="button" class="photo-nav photo-nav-prev" aria-label="Попереднє фото">‹</button>
                    <button type="button" class="photo-nav photo-nav-next" aria-label="Наступне фото">›</button>
                    <div class="photo-dots">
                        ${images.map((_, index) => `<span class="photo-dot ${index === 0 ? "active" : ""}"></span>`).join("")}
                        ${video ? `<span class="photo-dot"></span>` : ""}
                    </div>` : ""}
                </div>

                <!-- З'являється лише при наведенні на десктопі (сітка
                     каталогу/карусель) — дублює колір/розмір/кнопку
                     нижче, щоб фото картки лишалось чистим за
                     замовчуванням. На мобільному й у режимі "список"
                     не показується — там працює звичайний блок нижче. -->
                <div class="product-hover-panel">
                    ${discount > 0 ? `<span class="discount">-${discount}%</span>` : ""}
                    <div class="product-options">
                        <div class="product-colors">
                            ${colorButtons}
                        </div>
                        <div class="product-sizes">
                            ${sizeButtons}
                        </div>
                    </div>
                    <button
                        class="btn buy-btn"
                        data-id="${product.id}">
                        ${product.preOrder ? "Замовити" : "Купити"}
                    </button>
                </div>
            </div>
            <div class="product-info">
                <div class="product-category-row">
                    <div class="product-category">
                        ${brand}
                    </div>
                    ${product.preOrder ? `<span class="preorder-inline">📦 Під замовлення</span>` : ""}
                </div>
                <div class="product-title">
                    ${product.title}
                </div>
                <div class="product-meta-row">
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
                    <div class="product-options">
                        <div class="product-colors">
                            ${colorButtons}
                        </div>
                        <div class="product-sizes">
                            ${sizeButtons}
                        </div>
                    </div>
                </div>
                ${product.description ? `<div class="product-desc">${product.description}</div>` : ""}
                ${product.preOrder ? `<div class="preorder-row">📦 Під замовлення</div>` : ""}
                <button
                    class="btn buy-btn"
                    data-id="${product.id}">
                    ${product.preOrder ? "Замовити" : "Купити"}
                </button>
            </div>
        </div>
    `;

}
