const params = new URLSearchParams(location.search);

const productId = Number(params.get("id"));

let products=[];

async function init(){

try {

const response=await fetch("data/products.json");

if (!response.ok) throw new Error("Не вдалося завантажити товари");

products=await response.json();

const product=products.find(p=>p.id===productId);

if(!product){

document.getElementById("productPage").innerHTML="<h2>Товар не знайдено</h2>";

return;

}

renderProduct(product);

renderSimilar(product);

updateFavoriteButtons();

} catch (error) {

console.error(error);

document.getElementById("productPage").innerHTML = `
    <p class="error">Помилка завантаження товару. Спробуйте оновити сторінку.</p>
`;

}

}

// Виправляє головний SEO-баг сторінки товару: раніше document.title
// і meta description ніколи не оновлювались, тож усі товари мали
// однаковий заголовок у видачі Google. Тепер кожен товар отримує
// власні title/description/canonical/OG + структуровані дані.
function updateProductSeoMetadata(product) {

    const pageUrl = `${SITE_URL}/product?id=${product.id}`;

    const priceText = `${new Intl.NumberFormat("uk-UA").format(product.price)} грн`;

    const title = `${product.title} — купити за ${priceText} | Bagvero`;

    const description = truncateForMeta(
        product.description ||
        `${product.title} від ${product.brand} — купити в інтернет-магазині Bagvero. Ціна ${priceText}.`
    );

    const image = product.images?.[0] || "";

    document.title = title;

    setMetaByName("description", description);

    setCanonical(pageUrl);

    setMetaByProperty("og:type", "product");
    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", description);
    setMetaByProperty("og:image", image);
    setMetaByProperty("og:url", pageUrl);

    setJsonLd("productSchema", {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        image: product.images || [],
        description,
        sku: product.sku,
        brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
        offers: {
            "@type": "Offer",
            url: pageUrl,
            priceCurrency: "UAH",
            price: product.price,
            availability: "https://schema.org/InStock"
        },
        aggregateRating: product.rating ? {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: product.reviews || 0
        } : undefined
    });

    setJsonLd("breadcrumbSchema", {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Головна", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Каталог", item: `${SITE_URL}/catalog` },
            { "@type": "ListItem", position: 3, name: product.title, item: pageUrl }
        ]
    });

}

function renderProduct(product) {

    document.getElementById("breadTitle").textContent = product.title;

    updateProductSeoMetadata(product);

    const variants = product.variants?.length
        ? product.variants
        : [{ color: product.color || "Основний", hex: "#999", images: product.images || [] }];

    const activeVariant = variants[0];
    const galleryImages = activeVariant.images?.length ? activeVariant.images : (product.images || []);

    const colorButtons = variants.map((variant, index) => {

        const swatchImage = variant.images?.[0];

        const swatchStyle = swatchImage
            ? `background-image:url('${swatchImage}')`
            : `background-color:${variant.hex || "#999"}`;

        return `
        <button
            class="color ${index === 0 ? "active" : ""}"
            data-color="${variant.color}"
            data-images='${JSON.stringify(variant.images || [])}'
            title="${variant.color}"
            aria-label="Колір: ${variant.color}"
            style="${swatchStyle}"></button>
    `;

    }).join("");

    const sizes = product.sizes?.length ? product.sizes : PRODUCT_SIZES;

    const sizeButtons = sizes.map((size, index) => `
        <button class="size ${index === 0 ? "active" : ""}">
            ${size}
        </button>
    `).join("");

    document.getElementById("productPage").innerHTML = `

<div class="product-wrapper">

    <div class="product-gallery">

    <div class="thumbs-vertical" id="thumbsVertical">

        ${galleryImages.map((img,index)=>`

            <img
                src="${img}"
                class="thumb ${index===0?"active":""}"
                alt="${product.title}">

        `).join("")}

    </div>

    <div class="main-photo">

        ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}

        <div class="zoom-container gallery-track" id="mainGalleryTrack">

            ${(galleryImages.length ? galleryImages : ["assets/images/no-image.png"]).map(img => `
                <img class="gallery-slide" src="${img}" alt="${product.title}" draggable="false">
            `).join("")}

        </div>

        ${galleryImages.length > 1 ? `
        <div class="gallery-dots" id="mainGalleryDots">
            ${galleryImages.map((_, index) => `<span class="gallery-dot ${index === 0 ? "active" : ""}"></span>`).join("")}
        </div>` : ""}

    </div>

</div>

    <div class="product-info">

        <a class="brand" href="catalog?brand=${encodeURIComponent(product.brand)}">

            ${product.brand}

        </a>

        <h1>

            ${product.title}

        </h1>

        <div class="product-meta-line">
            ${product.brand}${product.sku ? ` · ${product.sku}` : ""}
        </div>

        <div class="price-box">

            ${product.oldPrice ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>` : ""}

            <span class="price">

                ${formatPrice(product.price)}

            </span>

        </div>
        <div class="option-group">

    <label>Колір: <span id="selectedColorLabel">${activeVariant.color}</span></label>

    <div class="color-options">

        ${colorButtons}

    </div>

</div>
<div class="option-group">

<label>Розмір</label>

<div class="sizes">

${sizeButtons}

</div>

</div>

        <div class="product-short">

            ${product.description || "Стильна сумка преміальної якості. Підходить для щоденного використання та чудово поєднується з будь-яким образом."}

        </div>

        <div class="product-actions">

            <button
                class="btn buy-btn"
                data-id="${product.id}">

                🛒 Купити

            </button>

            <button
                class="favorite-btn favorite"
                data-id="${product.id}"
                title="До обраного"
                aria-label="Додати в обране">

                <svg class="favorite-btn-icon" viewBox="0 0 24 24">
                    <path d="M12 21s-6.7-4.4-9.3-8.3C.9 9.6 1.7 5.9 5.1 4.9c2-.6 4 .2 5.2 1.9l1.7 2.3 1.7-2.3c1.2-1.7 3.2-2.5 5.2-1.9 3.4 1 4.2 4.7 2.4 7.8C18.7 16.6 12 21 12 21z"/>
                </svg>

                <span class="favorite-indicator">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 21s-6.7-4.4-9.3-8.3C.9 9.6 1.7 5.9 5.1 4.9c2-.6 4 .2 5.2 1.9l1.7 2.3 1.7-2.3c1.2-1.7 3.2-2.5 5.2-1.9 3.4 1 4.2 4.7 2.4 7.8C18.7 16.6 12 21 12 21z"/>
                    </svg>
                </span>

            </button>

        </div>

        <div class="delivery-box">

            <div>🚚 Доставка по Україні 1–3 дні</div>

            <div>💳 Оплата при отриманні або онлайн</div>

            <div>↩️ Повернення протягом 14 днів</div>

        </div>

        <div class="specifications" id="productSpecifications">

            ${product.sku ? `
            <div class="spec-block accordion-item">
                <button type="button" class="spec-block-header">
                    <h3>Артикул</h3>
                    <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="spec-block-content">
                    <div class="spec-block-inner">
                        <p class="spec-plain">${product.sku}</p>
                    </div>
                </div>
            </div>` : ""}

            <div class="spec-block accordion-item open">

                <button type="button" class="spec-block-header">
                    <h3>Інформація про товар</h3>
                    <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                <div class="spec-block-content">
                <div class="spec-block-inner">

                <div class="spec-row" id="specColorRow">
                    <span>Колір</span>
                    <strong id="specColorValue">${activeVariant.color}</strong>
                </div>

                ${product.closure ? `
                <div class="spec-row">
                    <span>Застібка</span>
                    <strong>${product.closure}</strong>
                </div>` : ""}

                ${product.decor ? `
                <div class="spec-row">
                    <span>Декор</span>
                    <strong>${product.decor}</strong>
                </div>` : ""}

                ${product.dimensions ? `
                <div class="spec-row">
                    <span>Розмір</span>
                    <strong>${product.dimensions}</strong>
                </div>` : ""}

                ${product.strapInfo ? `<p class="spec-plain">${product.strapInfo}</p>` : ""}

                ${product.compartments ? `
                <div class="spec-row">
                    <span>Відділення / кишені (зовнішні)</span>
                    <strong>${product.compartments}</strong>
                </div>` : ""}

                ${product.material ? `
                <div class="spec-row">
                    <span>Матеріал</span>
                    <strong>${product.material}</strong>
                </div>` : ""}

                <div class="spec-row">
                    <span>Бренд</span>
                    <strong>${product.brand}</strong>
                </div>

                <div class="spec-row">
                    <span>Стать</span>
                    <strong>${product.gender || "Унісекс"}</strong>
                </div>

                ${product.country ? `
                <div class="spec-row">
                    <span>Країна</span>
                    <strong>${product.country}</strong>
                </div>` : ""}

                </div>

                </div>

            </div>

            ${product.composition ? `
            <div class="spec-block accordion-item">
                <button type="button" class="spec-block-header">
                    <h3>Склад</h3>
                    <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="spec-block-content">
                    <div class="spec-block-inner">
                        <div class="spec-row">
                            <span>Склад</span>
                            <strong>${product.composition}</strong>
                        </div>
                    </div>
                </div>
            </div>` : ""}

            <div class="spec-block accordion-item">
                <button type="button" class="spec-block-header">
                    <h3>Опис</h3>
                    <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="spec-block-content">
                    <div class="spec-block-inner">
                        <p class="spec-plain">${product.description || "Стильна сумка преміальної якості. Підходить для щоденного використання та чудово поєднується з будь-яким образом."}</p>
                    </div>
                </div>
            </div>

        </div>

    </div>

</div>

<div class="mobile-sticky-cart" id="mobileStickyCart">

    <button
        class="btn buy-btn"
        data-id="${product.id}">

        🛒 Додати в кошик

    </button>

</div>

`;

    document.querySelectorAll(".spec-block-header").forEach(header => {

        header.addEventListener("click", () => {

            header.closest(".accordion-item")?.classList.toggle("open");

        });

    });

    setupGallery();
    setupMobileStickyCart();

    document.querySelectorAll(".size").forEach(button => {

        button.addEventListener("click", function () {

            document.querySelectorAll(".size").forEach(item => item.classList.remove("active"));

            this.classList.add("active");

            updateFavoriteButtons();

        });

    });

}

// -------------------------
// Галерея товару: свайп-карусель головного фото
// (scroll-snap) синхронізована з крапками-індикаторами
// та вертикальними мініатюрами
// -------------------------

// -------------------------
// Мобільна закріплена панель "Додати в кошик" — з'являється
// знизу екрана, коли основна кнопка "Купити" йде за межі
// екрана вгору (як на md-fashion.ua)
// -------------------------

function setupMobileStickyCart() {

    const mainBuyBtn = document.querySelector(".product-actions .buy-btn");
    const stickyBar = document.getElementById("mobileStickyCart");

    if (!mainBuyBtn || !stickyBar || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {

        const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;

        stickyBar.classList.toggle("show", scrolledPast);

    }, { threshold: 0 });

    observer.observe(mainBuyBtn);

}

function setupGallery() {

    const track = document.getElementById("mainGalleryTrack");
    const dotsWrap = document.getElementById("mainGalleryDots");
    const thumbsVertical = document.getElementById("thumbsVertical");

    if (!track) return;

    if (typeof preventWheelHijack === "function") preventWheelHijack(track);

    // Блокуємо drag'а картинок для Safari/iOS
    document.querySelectorAll(".gallery-slide").forEach(img => {
        img.draggable = false;
        img.ondragstart = () => false;
    });

    function goToSlide(index) {

        const slide = track.children[index];

        if (slide) track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });

    }

    function currentSlideIndex() {

        let closest = 0;
        let minDiff = Infinity;

        [...track.children].forEach((slide, index) => {

            const diff = Math.abs(slide.offsetLeft - track.scrollLeft);

            if (diff < minDiff) {
                minDiff = diff;
                closest = index;
            }

        });

        return closest;

    }

    function syncActiveState() {

        const index = currentSlideIndex();

        dotsWrap?.querySelectorAll(".gallery-dot").forEach((dot, i) => {
            dot.classList.toggle("active", i === index);
        });

        thumbsVertical?.querySelectorAll(".thumb").forEach((thumb, i) => {
            thumb.classList.toggle("active", i === index);
        });

    }

    let scrollTimer = null;

    track.addEventListener("scroll", () => {

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(syncActiveState, 80);

    }, { passive: true });

    dotsWrap?.querySelectorAll(".gallery-dot").forEach((dot, index) => {
        dot.addEventListener("click", () => goToSlide(index));
    });

    thumbsVertical?.querySelectorAll(".thumb").forEach((thumb, index) => {

        thumb.addEventListener("click", () => goToSlide(index));

    });

    window.addEventListener("resize", () => goToSlide(currentSlideIndex()));

    if (!track.dataset.touchBound) {

        track.dataset.touchBound = "1";

        let startX = 0;
        let startY = 0;
        let startScrollLeft = 0;
        let axis = null; // null поки не визначено, "x" або "y"

        track.addEventListener("touchstart", event => {

            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
            startScrollLeft = track.scrollLeft;
            axis = null;

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
                // scroll-snap — інакше браузер тягне позицію до
                // найближчого фото на кожному touchmove, і замість
                // плавного руху за пальцем виходить залипання
                // з різким стрибком в кінці
                if (axis === "x") track.style.scrollSnapType = "none";

            }

            if (axis === "y") return; // вертикаль — віддаємо жест сторінці

            // горизонталь — гортаємо фото самі, забороняючи
            // браузеру одночасно намагатись скролити сторінку
            event.preventDefault();

            track.scrollLeft = startScrollLeft - dx;

        }, { passive: false });

        track.addEventListener("touchend", () => {

            if (axis !== "x") return;

            const index = Math.round(track.scrollLeft / (track.clientWidth || 1));

            track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });

            // повертаємо snap назад вже після того, як доїхали
            setTimeout(() => { track.style.scrollSnapType = ""; }, 400);

        });

        track.addEventListener("touchcancel", () => {

            track.style.scrollSnapType = "";

        });

        // клік/тап по фото — відкриваємо повноекранний перегляд
        // з зумом (не спрацьовує, якщо це був свайп)
        track.addEventListener("click", () => {

            if (axis === "x") return;

            if (typeof window.openLightbox !== "function") return;

            const currentImages = [...track.children]
                .map(slide => slide.src)
                .filter(Boolean);

            window.openLightbox(currentImages, currentSlideIndex());

        });

    }

}

// Викликається з common.js при кліку на колір на сторінці товару —
// повністю перебудовує галерею (мініатюри + головне фото) під
// фотографії обраного кольору.
function updateGalleryForColor(images) {

    if (!images || !images.length) return;

    const thumbsVertical = document.getElementById("thumbsVertical");
    const track = document.getElementById("mainGalleryTrack");
    const dotsWrap = document.getElementById("mainGalleryDots");

    if (!thumbsVertical || !track) return;

    thumbsVertical.innerHTML = images.map((img, index) => `
        <img
            src="${img}"
            class="thumb ${index === 0 ? "active" : ""}"
            alt="">
    `).join("");

    track.innerHTML = images.map(img => `
        <img class="gallery-slide" src="${img}" alt="" draggable="false">
    `).join("");

    track.scrollLeft = 0;

    if (dotsWrap) {

        dotsWrap.innerHTML = images.length > 1
            ? images.map((_, index) => `<span class="gallery-dot ${index === 0 ? "active" : ""}"></span>`).join("")
            : "";

    }

    setupGallery();

    // синхронізуємо назву кольору в характеристиках товару
    // і в підписі над мініатюрами ("Колір: ...")
    const colorLabel = document.querySelector(".color.active")?.dataset.color;
    const specColorValue = document.getElementById("specColorValue");
    const selectedColorLabel = document.getElementById("selectedColorLabel");

    if (colorLabel && specColorValue) specColorValue.textContent = colorLabel;
    if (colorLabel && selectedColorLabel) selectedColorLabel.textContent = colorLabel;

}

function renderSimilar(product){

    const others = products.filter(item => item.id !== product.id);

    // спочатку товари тієї ж категорії, потім — тієї ж статі,
    // і лише як останній варіант — будь-які інші, щоб блок
    // не був порожнім навіть для рідкісних категорій
    const sameCategory = others.filter(item => item.category === product.category);
    const sameGender = others.filter(item =>
        item.gender === product.gender && item.category !== product.category
    );
    const rest = others.filter(item =>
        item.category !== product.category && item.gender !== product.gender
    );

    const list = [...sameCategory, ...sameGender, ...rest].slice(0, 4);

const container=document.getElementById("similarProducts");

container.innerHTML="";

list.forEach(item=>{

container.innerHTML+=createProductCard(item);

});

updateFavoriteButtons();

initProductCarousels(container);

initCarousel(document.getElementById("similarCarousel"));

}

init();
