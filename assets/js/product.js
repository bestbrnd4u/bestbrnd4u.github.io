const params = new URLSearchParams(location.search);

// Сторінку товару тепер віддає статичний файл p/<slug>/index.html,
// який генерує scripts/build-product-pages.js. Такий файл сам
// оголошує, який це товар (window.PRODUCT_SLUG / PRODUCT_ID), тож
// шукати нічого не треба.
//
// Стара адреса /product?id=<число> лишається робочою — на неї ведуть
// уже проіндексовані посилання й адреси, якими встигли поділитись, —
// але з неї ми одразу перекидаємо на канонічну, щоб Google не тримав
// в індексі дві копії одного товару.
const pathSlug = decodeURIComponent(
    (location.pathname.match(/\/p\/([^/]+)\/?$/) || [])[1] || ""
);

const productSlug = (typeof window.PRODUCT_SLUG === "string" && window.PRODUCT_SLUG)
    || pathSlug
    || "";

const productId = Number(params.get("id")) || Number(window.PRODUCT_ID) || 0;

const isLegacyUrl = !pathSlug && params.has("id");

function findRequestedProduct(list) {

    if (productSlug) {
        const bySlug = list.find(p => p.slug === productSlug);
        if (bySlug) return bySlug;
    }

    if (productId) {
        return list.find(p => p.id === productId);
    }

    return undefined;

}

let products=[];

async function init(){

try {

const response=await fetch("/data/products.json");

if (!response.ok) throw new Error("Не вдалося завантажити товари");

products=await response.json();

const product=findRequestedProduct(products);

if(!product){

// м'який 404: сторінка віддає 200 OK, тож без цього Google
// проіндексував би /product?id=<неіснуючий> і /product без id
// як ще одну копію шаблону
markProductPageNotFound();

document.getElementById("productPage").innerHTML="<h2>Товар не знайдено</h2>";

return;

}

// стара адреса → канонічна, зі збереженням обраних кольору й розміру
if (isLegacyUrl && product.slug) {

    location.replace(productUrl(product, {
        color: params.get("color"),
        size: params.get("size")
    }));

    return;

}

renderProduct(product);

renderSimilar(product);

updateFavoriteButtons();

trackRecentlyViewed(product.id);

renderRecentlyViewed({ excludeId: product.id });

} catch (error) {

console.error(error);

document.getElementById("productPage").innerHTML = `
    <p class="error">Помилка завантаження товару. Спробуйте оновити сторінку.</p>
`;

}

}

// Умови повернення й доставки для розмітки товару — ті самі, що в
// scripts/build-product-pages.js (статичні сторінки) і ті самі, що
// написані на сторінках return-warranty і delivery-payment. Search
// Console просив ці поля в offers (розділ Merchant listings).
// Докладні пояснення до кожного значення — у генераторі сторінок.
const RETURN_POLICY = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "UA",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility"
};

const FREE_SHIPPING_FROM = 3500;

function shippingDetailsFor(price) {

    const details = {
        "@type": "OfferShippingDetails",
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "UA" },
        deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
            transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" }
        }
    };

    // ставку 0 ставимо лише коли доставка справді безкоштовна
    if (Number(price) >= FREE_SHIPPING_FROM) {
        details.shippingRate = { "@type": "MonetaryAmount", value: 0, currency: "UAH" };
    }

    return details;

}

// Сторінка без товару не повинна потрапляти в індекс: адреса без id
// або з неіснуючим id віддає той самий шаблон, і для Google це дубль.
function markProductPageNotFound() {

    document.title = "Товар не знайдено | BestBrnd4u";

    setMetaByName("robots", "noindex,follow");

    setMetaByName("description", "Такого товару немає в каталозі BestBrnd4u.");

}

// Виправляє головний SEO-баг сторінки товару: раніше document.title
// і meta description ніколи не оновлювались, тож усі товари мали
// однаковий заголовок у видачі Google. Тепер кожен товар отримує
// власні title/description/canonical/OG + структуровані дані.
function updateProductSeoMetadata(product) {

    const pageUrl = SITE_URL + productUrl(product);

    const priceText = `${new Intl.NumberFormat("uk-UA").format(product.price)} грн`;

    const title = `${product.title} — купити за ${priceText} | BestBrnd4u`;

    const description = truncateForMeta(
        product.description ||
        `${product.title} від ${product.brand} — купити в інтернет-магазині BestBrnd4u. Ціна ${priceText}.`
    );

    // OG і schema.org вимагають абсолютних адрес — відносний
    // "assets/…" Google мовчки ігнорує (див. absoluteUrl у common.js)
    const images = (product.images || []).map(absoluteUrl).filter(Boolean);

    const image = images[0] || "";

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
        image: images,
        description,
        sku: getVariantSku(product, (product.variants || [])[0]),
        brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
        offers: {
            "@type": "Offer",
            url: pageUrl,
            priceCurrency: "UAH",
            price: product.price,
            // товар "під замовлення" — це PreOrder, а не InStock;
            // невідповідність розмітки реальному стану — привід для
            // Google зняти rich-результат товару
            availability: product.preOrder
                ? "https://schema.org/PreOrder"
                : "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
            hasMerchantReturnPolicy: RETURN_POLICY,
            shippingDetails: shippingDetailsFor(product.price)
        },
        // Рейтинг — ЛИШЕ якщо за ним стоять справжні відгуки.
        // Раніше умовою було саме product.rating, і в чотирьох товарів
        // із rating: 5, reviews: 0 у розмітку йшов reviewCount: 0 —
        // оцінка без жодного відгуку. Google такий блок або відкидає,
        // або (гірше) розцінює як накрутку рейтингу.
        aggregateRating: (product.rating && Number(product.reviews) > 0) ? {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: Number(product.reviews)
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

// Галерея товару: побудова мініатюр / головних слайдів / крапок
// з масиву фото + необов'язкового відео обраного кольору.
// Відео завжди йде останнім слайдом і позначається значком ▶
// на мініатюрі (саме відео там не програється — просто "обкладинка").
// -------------------------

// Розпізнає посилання на відео: пряме посилання на файл (.mp4 тощо)
// відтворюємо як звичайний <video>, а YouTube/Vimeo — вбудовуємо
// через iframe. Це важливо саме для відео з iPhone: пряме .mov/.mp4
// знято на iPhone часто в кодеку HEVC, який грає лише в Safari — не
// в Chrome/Firefox. YouTube/Vimeo самі перекодовують відео при
// завантаженні у сумісний формат, який працює в будь-якому браузері.
function parseVideoEmbed(url) {

    if (!url) return null;

    const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);

    if (youtubeMatch) {

        const id = youtubeMatch[1];

        return {
            type: "embed",
            embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
            thumbUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`
        };

    }

    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);

    if (vimeoMatch) {

        return {
            type: "embed",
            embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
            thumbUrl: ""
        };

    }

    return { type: "file", videoUrl: url };

}

function buildThumbsMarkup(images, video, altText) {

    const imageThumbs = images.map((img, index) => `
        <div class="thumb ${index === 0 ? "active" : ""}">
            <img
                src="${img}"
                data-variant-src="${img}"
                data-variant-sizes="100px"
                alt="${altText}"
                onerror="this.onerror=null;this.src='assets/images/no-image.png'">
        </div>
    `).join("");

    const media = parseVideoEmbed(video);

    let videoThumb = "";

    if (media?.type === "file") {

        // мініатюра — це фото (poster), а не сам відеотег: так
        // завжди видно нормальну картинку зверху, а не порожній/
        // чорний кадр, поки браузер ще не підвантажив відео
        const poster = images[0] || "assets/images/no-image.png";

        videoThumb = `
        <div class="thumb thumb-video ${images.length === 0 ? "active" : ""}" style="background-image:url('${poster}');background-size:cover;background-position:center">
            <span class="thumb-play" aria-hidden="true">▶</span>
        </div>
    `;

    } else if (media?.type === "embed") {

        const bgStyle = media.thumbUrl
            ? `background-image:url('${media.thumbUrl}');background-size:cover;background-position:center`
            : `background:#111827`;

        videoThumb = `
        <div class="thumb thumb-video ${images.length === 0 ? "active" : ""}" style="${bgStyle}">
            <span class="thumb-play" aria-hidden="true">▶</span>
        </div>
    `;

    }

    return imageThumbs + videoThumb;

}

function buildTrackMarkup(images, video, altText) {

    const imageSlides = images.map(img => `
        <img class="gallery-slide" src="${img}" data-variant-src="${img}" data-variant-sizes="(max-width: 900px) 100vw, 600px" alt="${altText}" draggable="false" onerror="this.onerror=null;this.src='assets/images/no-image.png'">
    `).join("");

    const media = parseVideoEmbed(video);

    let videoSlide = "";

    if (media?.type === "file") {

        // poster — щоб на слайді відразу було видно фото товару,
        // а не порожній/чорний кадр, поки відео ще не почало
        // програватись; muted — без цього автозапуск при свайпі
        // (нижче, в setupGallery) заблокував би сам браузер
        videoSlide = `
            <video
                class="gallery-slide gallery-slide-video"
                src="${media.videoUrl}"
                poster="${images[0] || "assets/images/no-image.png"}"
                controls
                muted
                playsinline
                loop
                preload="metadata"></video>
        `;

    } else if (media?.type === "embed") {

        videoSlide = `
            <div class="gallery-slide gallery-slide-embed">
                <iframe
                    src="${media.embedUrl}"
                    title="${altText}"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowfullscreen
                    loading="lazy"></iframe>
            </div>
        `;

    }

    return imageSlides + videoSlide || `<img class="gallery-slide" src="assets/images/no-image.png" alt="${altText}">`;

}

function buildDotsMarkup(images, video) {

    const total = images.length + (video ? 1 : 0);

    if (total <= 1) return "";

    return Array.from({ length: total }, (_, index) => `<span class="gallery-dot ${index === 0 ? "active" : ""}"></span>`).join("");

}

function renderProduct(product) {

    document.getElementById("breadTitle").textContent = product.title;

    updateProductSeoMetadata(product);

    const variants = product.variants?.length
        ? product.variants
        : [{ color: product.color || "Основний", hex: "#999", images: product.images || [] }];

    // Колір, обраний ще в каталозі, приходить у ?color=... — саме він
    // має бути активним, інакше сторінка щоразу відкривалась на
    // першому кольорі і вибір користувача губився.
    const requestedColor = new URLSearchParams(location.search).get("color");

    const activeIndex = Math.max(
        variants.findIndex(variant => variant.color === requestedColor),
        0
    );

    const activeVariant = variants[activeIndex];
    const galleryImages = activeVariant.images?.length ? activeVariant.images : (product.images || []);
    const galleryVideo = activeVariant.video || "";

    const colorButtons = variants.map((variant, index) => {

        const swatchImage = variant.images?.[0];
        const swatchColor = escapeAttrSingleQuoted(variant.hex || "#999");

        // колір ставимо завжди (навіть коли є фото) — це підкладка:
        // якщо фото свотча не завантажиться (бита посилання),
        // колір все одно буде видно замість порожнього квадрата
        //
        // swatchImage тут проходить через escapeAttrSingleQuoted, а не
        // просто escapeHtml: рядок опиняється одразу в ДВОХ контекстах
        // лапок — усередині style="..." (подвійні) і всередині
        // url('...') (одинарні). Це посилання на файл, завантажений
        // через адмінку/масовий імпорт, тож апостроф чи лапка в назві
        // файлу інакше розірвали б або HTML-атрибут, або CSS url().
        const swatchStyle = swatchImage
            ? `background-color:${swatchColor};background-image:url('${escapeAttrSingleQuoted(swatchImage)}');background-size:cover;background-position:center`
            : `background-color:${swatchColor}`;

        return `
        <button
            class="color ${index === activeIndex ? "active" : ""}"
            data-color="${escapeHtml(variant.color)}"
            data-images='${escapeAttrSingleQuoted(JSON.stringify(variant.images || []))}'
            data-sizes='${escapeAttrSingleQuoted(JSON.stringify(getVariantSizes(product, variant)))}'
            data-sku="${escapeHtml(getVariantSku(product, variant))}"
            data-video="${escapeHtml(variant.video || "")}"
            title="${escapeHtml(variant.color)}"
            aria-label="Колір: ${escapeHtml(variant.color)}"
            style="${swatchStyle}"></button>
    `;

    }).join("");

    // розміри першого (активного за замовчуванням) кольору;
    // при перемиканні кольору список оновлює common.js
    // артикул активного (першого) кольору; при перемиканні кольору
    // його оновлює обробник у common.js за data-sku
    const activeSku = getVariantSku(product, activeVariant);

    const firstVariantSizes = getVariantSizes(product, activeVariant);
    const sizes = firstVariantSizes.length ? firstVariantSizes : PRODUCT_SIZES;

    // якщо розмір уже був обраний на картці в каталозі —
    // він приходить сюди через ?size= і має лишитися обраним
    const requestedSize = params.get("size");

    const sizeButtons = sizes.map(size => {

        const isActive = sizes.length === 1 || size === requestedSize;

        return `
        <button class="size ${isActive ? "active" : ""}">
            ${size}
        </button>
    `;

    }).join("");

    document.getElementById("productPage").innerHTML = `

<div class="product-wrapper">

    <div class="product-gallery">

    <div class="thumbs-vertical" id="thumbsVertical">

        ${buildThumbsMarkup(galleryImages, galleryVideo, product.title)}

    </div>

    <div class="main-photo">

        ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}

        <div class="zoom-container gallery-track" id="mainGalleryTrack">

            ${buildTrackMarkup(galleryImages, galleryVideo, product.title)}

        </div>

        ${galleryImages.length + (galleryVideo ? 1 : 0) > 1 ? `
        <div class="gallery-dots" id="mainGalleryDots">
            ${buildDotsMarkup(galleryImages, galleryVideo)}
        </div>` : ""}

    </div>

</div>

    <div class="product-info">

        <a class="brand" href="catalog?brand=${encodeURIComponent(product.brand)}">

            ${escapeHtml(product.brand)}

        </a>

        ${product.preOrder ? `<div class="preorder-tag">📦 Під замовлення</div>` : ""}

        <h1>

            ${escapeHtml(product.title)}

        </h1>

        <div class="product-meta-line">
            ${escapeHtml(product.brand)}<span data-product-sku>${activeSku ? ` · ${escapeHtml(activeSku)}` : ""}</span>
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

<div class="size-row-head">
    <label>Розмір</label>
    <button type="button" class="size-guide-link" id="sizeGuideBtn">Таблиця розмірів</button>
</div>

<div class="sizes">

${sizeButtons}

</div>

<div class="size-error" id="sizeError" hidden>Будь ласка, оберіть розмір</div>

</div>

        <div class="product-short">

            ${product.description || "Стильна сумка преміальної якості. Підходить для щоденного використання та чудово поєднується з будь-яким образом."}

        </div>

        <div class="product-actions">

            <button
                class="btn buy-btn"
                data-id="${product.id}">

                ${product.preOrder ? "📦 Замовити" : "🛒 Купити"}

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

        ${product.preOrder ? `
        <div class="preorder-box">

            <div class="preorder-box-title">📦 Цей товар під замовлення</div>

            <p>
                ${
                    product.preOrderNote
                        ? product.preOrderNote
                        : `Термін виготовлення та доставки: ${product.preOrderDays || "уточнюється у менеджера"}.` +
                          (product.preOrderPrepayment
                              ? ` Потрібна передоплата ${product.preOrderPrepayment}% вартості — після оформлення з вами зв'яжеться менеджер.`
                              : "")
                }
            </p>

        </div>
        ` : `
        <div class="delivery-box">

            <div>🚚 Доставка по Україні 1–3 дні</div>

            <div>💳 Оплата при отриманні або онлайн</div>

            <div>↩️ Повернення протягом 14 днів</div>

        </div>
        `}

        <div class="specifications" id="productSpecifications">

            ${activeSku ? `
            <div class="spec-block accordion-item">
                <button type="button" class="spec-block-header">
                    <h3>Артикул</h3>
                    <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="spec-block-content">
                    <div class="spec-block-inner">
                        <p class="spec-plain" data-spec-sku>${escapeHtml(activeSku)}</p>
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
                    <strong>${escapeHtml(product.closure)}</strong>
                </div>` : ""}

                ${product.decor ? `
                <div class="spec-row">
                    <span>Декор</span>
                    <strong>${escapeHtml(product.decor)}</strong>
                </div>` : ""}

                ${product.dimensions ? `
                <div class="spec-row">
                    <span>Розмір</span>
                    <strong>${escapeHtml(product.dimensions)}</strong>
                </div>` : ""}

                ${product.strapInfo ? `<p class="spec-plain">${escapeHtml(product.strapInfo)}</p>` : ""}

                ${product.compartments ? `
                <div class="spec-row">
                    <span>Відділення / кишені (зовнішні)</span>
                    <strong>${escapeHtml(product.compartments)}</strong>
                </div>` : ""}

                ${product.material ? `
                <div class="spec-row">
                    <span>Матеріал</span>
                    <strong>${escapeHtml(product.material)}</strong>
                </div>` : ""}

                <div class="spec-row">
                    <span>Бренд</span>
                    <strong>${escapeHtml(product.brand)}</strong>
                </div>

                <div class="spec-row">
                    <span>Стать</span>
                    <strong>${escapeHtml(getProductGenderLabel(product))}</strong>
                </div>

                ${product.country ? `
                <div class="spec-row">
                    <span>Країна</span>
                    <strong>${escapeHtml(product.country)}</strong>
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
                            <strong>${escapeHtml(product.composition)}</strong>
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

    // Розміри слухаємо ДЕЛЕГОВАНО, а не навішуємо обробник на кожну
    // кнопку. Причина: при зміні кольору список розмірів
    // перемальовується (у різних кольорів вони різні — див. common.js),
    // старі кнопки зникають разом зі слухачами, і розмір переставав
    // вибиратись, доки не перезавантажиш сторінку.
    // Прапорець потрібен, бо ця функція виконується на кожен рендер,
    // а слухач має бути один.
    if (!document.body.dataset.sizeClickBound) {

        document.body.dataset.sizeClickBound = "1";

        document.addEventListener("click", event => {

            const button = event.target.closest(".size");

            if (!button || !button.closest("#productPage")) return;

            document.querySelectorAll("#productPage .size")
                .forEach(item => item.classList.remove("active"));

            button.classList.add("active");

            updateFavoriteButtons();

            button.closest(".sizes, .product-sizes")?.classList.remove("size-shake");

            const errorEl = document.getElementById("sizeError");

            if (errorEl) errorEl.hidden = true;

        });

    }

    setupSizeGuideModal();
    renderSizeGuide(product);
    renderProductInstagram(product);

}

// -------------------------
// Модалка "Таблиця розмірів"
// -------------------------

// -------------------------
// Блок Instagram під товаром
//
// Режим задається в адмінці для кожного товару:
//   reels   — Reels саме цього товару
//   general — звичайна реклама акаунту (текст і посилання спільні
//             з головною, з data/home.json — щоб не дублювати
//             налаштування у двох місцях)
//   none    — не показувати
//
// За замовчуванням (поле не заповнене у старих товарах) — general,
// як і на головній.
// -------------------------

async function renderProductInstagram(product) {

    const section = document.getElementById("productInstagram");

    if (!section) return;

    const mode = product.instagramBlock || "general";

    if (mode === "none") {

        section.hidden = true;

        return;

    }

    const titleEl = document.getElementById("productInstagramTitle");
    const textEl = document.getElementById("productInstagramText");
    const btnEl = document.getElementById("productInstagramBtn");

    const reels = (product.instagramReels || "").trim();

    // Обрали Reels, але посилання не вказали — не ховаємо блок і не
    // ведемо в нікуди, а показуємо звичайну рекламу акаунту.
    if (mode === "reels" && reels) {

        titleEl.textContent = "Цей товар у Reels";
        textEl.textContent = "Подивіться, який він у русі — коротке відео в Instagram.";
        btnEl.textContent = "Дивитися Reels";
        btnEl.href = reels;

        section.hidden = false;

        return;

    }

    // спільні налаштування з головної
    let instagram = null;

    try {

        const response = await fetch("data/home.json");

        if (response.ok) instagram = (await response.json()).instagram;

    } catch (error) {

        // немає файлу — нижче підставляться запасні тексти

    }

    titleEl.textContent = instagram?.title || "Стежте за нами в Instagram";
    textEl.textContent = instagram?.text || "Нові колекції, образи та акції — щодня у нашому акаунті.";
    btnEl.textContent = instagram?.buttonText || "Підписатися";
    btnEl.href = instagram?.link || "https://www.instagram.com/bestbrnd4u";

    section.hidden = false;

}

// Наповнює таблицю розмірів під групу, до якої належить категорія
// товару: у сумок свої стовпці, у взуття — свої. Дані з адмінки
// (розділ «Розміри»). Якщо для групи таблиця не заповнена —
// посилання «Таблиця розмірів» ховаємо, щоб не відкривати порожнє
// вікно.
async function renderSizeGuide(product) {

    const body = document.getElementById("sizeGuideBody");
    const openBtn = document.getElementById("sizeGuideBtn");

    if (!body) return;

    const [groups, categoryDepartments] = await Promise.all([
        loadSizeGroups(),
        loadCategoryTree()
    ]);

    const group = findSizeGroupForCategory(groups, product.category, categoryDepartments);

    if (!group || !group.guideNote || group.guideRows.length === 0) {

        body.innerHTML = "";

        if (openBtn) openBtn.hidden = true;

        return;

    }

    if (openBtn) openBtn.hidden = false;

    body.innerHTML = `
        <p class="modal-text">${escapeHtml(group.guideNote)}</p>
        <table class="size-guide-table">
            <thead>
                <tr>
                    <th>Розмір</th>
                    ${group.guideColumns.map(column => `<th>${escapeHtml(column)}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
                ${group.guideRows.map(row => `
                    <tr>
                        <td>${escapeHtml(row.size)}</td>
                        ${group.guideColumns.map((column, index) =>
                            `<td>${escapeHtml((row.values || [])[index] || "—")}</td>`
                        ).join("")}
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

}

function setupSizeGuideModal() {

    const openBtn = document.getElementById("sizeGuideBtn");
    const modal = document.getElementById("sizeGuideModal");
    const closeBtn = document.getElementById("sizeGuideClose");

    if (!openBtn || !modal || modal.dataset.bound) return;

    modal.dataset.bound = "1";

    openBtn.addEventListener("click", () => {

        modal.hidden = false;

    });

    closeBtn?.addEventListener("click", () => {

        modal.hidden = true;

    });

    modal.addEventListener("click", event => {

        if (event.target === modal) modal.hidden = true;

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

        // відео (файлове, не YouTube/Vimeo вбудовування) — програємо
        // лише той слайд, до якого долистали свайпом/скролом, і
        // одразу ставимо на паузу решту. slide.paused перевіряємо,
        // щоб не перемотувати на початок відео, яке й так вже грає
        // (наприклад, повторний виклик під час одного й того ж
        // перегляду) — тільки при свіжому поверненні на цей слайд
        [...track.children].forEach((slide, i) => {

            if (slide.tagName !== "VIDEO") return;

            if (i === index) {

                if (slide.paused) slide.currentTime = 0;

                slide.play().catch(() => {});

            } else {

                slide.pause();

            }

        });

    }

    let scrollTimer = null;

    syncActiveState();

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
        let startTime = 0;
        let axis = null; // null поки не визначено, "x" або "y"

        track.addEventListener("touchstart", event => {

            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
            startScrollLeft = track.scrollLeft;
            startTime = Date.now();
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

            const width = track.clientWidth || 1;
            const baseIndex = Math.round(startScrollLeft / width);

            // фактичний зсув треку (додатній — свайп вліво, до наступного фото)
            const dx = track.scrollLeft - startScrollLeft;
            const elapsed = Math.max(Date.now() - startTime, 1);
            const velocity = Math.abs(dx) / elapsed; // px/мс

            // легкий свайп: досить невеликої відстані (12% ширини)
            // АБО швидкого короткого флiку — не треба тягнути картинку
            // до половини екрана, щоб вона перемкнулась
            const distanceThreshold = width * 0.12;
            const velocityThreshold = 0.3;

            let index = baseIndex;

            if (Math.abs(dx) > distanceThreshold || velocity > velocityThreshold) {
                index = baseIndex + (dx > 0 ? 1 : -1);
            }

            index = Math.max(0, Math.min(index, track.children.length - 1));

            track.scrollTo({ left: index * width, behavior: "smooth" });

            // повертаємо snap назад вже після того, як доїхали
            setTimeout(() => { track.style.scrollSnapType = ""; }, 400);

        });

        track.addEventListener("touchcancel", () => {

            track.style.scrollSnapType = "";

        });

        // клік/тап по фото — відкриваємо повноекранний перегляд
        // з зумом (не спрацьовує, якщо це був свайп)
        track.addEventListener("click", event => {

            if (axis === "x") return;

            if (typeof window.openLightbox !== "function") return;

            const slides = [...track.children];
            const activeIndex = currentSlideIndex();
            const activeSlide = slides[activeIndex];

            // На слайді з відео тап по самому плеєру має керувати
            // відтворенням, а не відкривати лайтбокс — інакше не
            // можна було б поставити на паузу чи перемотати.
            if (event.target.closest("video, iframe")) return;

            // Лайтбокс тепер показує і відео, тож передаємо ВСІ слайди
            // галереї, а не лише фото — інакше на відео зум просто
            // не відкривався, і воно «зникало» з повноекранного
            // перегляду.
            const lightboxSlides = slides.map(slide => {

                if (slide.tagName === "VIDEO") {

                    return {
                        type: "video",
                        src: slide.getAttribute("src"),
                        poster: slide.getAttribute("poster") || ""
                    };

                }

                if (slide.classList.contains("gallery-slide-embed")) {

                    return { type: "embed", src: slide.querySelector("iframe")?.getAttribute("src") };

                }

                return { type: "image", src: slide.src };

            }).filter(slide => slide.src);

            const currentImages = lightboxSlides;
            const startIndex = Math.max(0, Math.min(activeIndex, lightboxSlides.length - 1));

            const brand = document.querySelector(".product-info .brand")?.textContent.trim();
            const title = document.querySelector(".product-info h1")?.textContent.trim();

            window.openLightbox(currentImages, startIndex, { brand, title });

        });

    }

}

// Викликається з common.js при кліку на колір на сторінці товару —
// повністю перебудовує галерею (мініатюри + головне фото) під
// фотографії обраного кольору.
function updateGalleryForColor(images, video) {

    if (!images || !images.length) return;

    const thumbsVertical = document.getElementById("thumbsVertical");
    const track = document.getElementById("mainGalleryTrack");
    const dotsWrap = document.getElementById("mainGalleryDots");

    if (!thumbsVertical || !track) return;

    const altText = document.querySelector(".product-info h1")?.textContent.trim() || "";

    thumbsVertical.innerHTML = buildThumbsMarkup(images, video, altText);

    track.innerHTML = buildTrackMarkup(images, video, altText);

    track.scrollLeft = 0;

    if (dotsWrap) {
        dotsWrap.innerHTML = buildDotsMarkup(images, video);
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
        getProductGenders(item).some(g => getProductGenders(product).includes(g)) && item.category !== product.category
    );
    const rest = others.filter(item =>
        item.category !== product.category && !getProductGenders(item).some(g => getProductGenders(product).includes(g))
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
