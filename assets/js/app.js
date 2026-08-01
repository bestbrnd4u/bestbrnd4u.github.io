// ======================================
// app.js
// Логіка головної сторінки (index.html)
// ======================================

const productsGrid = document.getElementById("productsGrid");

async function initHome() {

    if (!productsGrid) return;

    try {

        const response = await fetch("data/products.json");

        if (!response.ok) {
            throw new Error("Не вдалося завантажити товари");
        }

        const products = await response.json();

        // Показуємо товари з найвищим рейтингом
        const featured = [...products]
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 8);

        renderProducts(featured);

        initCarousel(document.getElementById("productsCarousel"));

        updateFavoriteButtons();

    } catch (error) {

        productsGrid.innerHTML = `
            <p class="error">
                Помилка завантаження товарів.
            </p>
        `;

        console.error(error);

    }

}

// -------------------------
// Контент головної сторінки з CMS (data/home.json)
//
// У HTML для кожного блоку вже є "запасний" вміст на
// випадок, якщо fetch ще не завершився або впав — ми
// просто перезаписуємо його даними з CMS, коли вони готові.
// -------------------------

async function initHomeContent() {

    try {

        const response = await fetch("data/home.json");

        if (!response.ok) {
            throw new Error("Не вдалося завантажити контент головної сторінки");
        }

        const data = await response.json();

        renderHero(data.hero);
        renderInstagramBlock(data.instagram);
        renderCategories(data.categories);
        renderPromoBanner(data.promo);
        renderBrands(data.brands);
        renderAdvantages(data.advantages);

    } catch (error) {

        // Якщо не вдалося завантажити — просто лишаємо
        // запасний вміст, який вже є в HTML
        console.error(error);

    }

}

// -------------------------
// Респонсивні кропи для hero/promo-банерів
//
// Одне й те саме фото по-різному "сідає" в широкий
// десктопний банер і у вузький мобільний — тому замість
// одного background-size:cover на всі екрани, тут
// генеруються 3 окремо обрізаних версії (Pexels вміє
// обрізати фото прямо по параметрах в URL, don't need to
// download/re-upload нічого) і підставляються під
// відповідну ширину екрана через CSS-змінну.
// -------------------------

function buildCroppedImageUrl(url, width, height) {

    try {

        const parsed = new URL(url);

        parsed.searchParams.set("auto", "compress");
        parsed.searchParams.set("cs", "tinysrgb");
        parsed.searchParams.set("fit", "crop");
        parsed.searchParams.set("w", width);
        parsed.searchParams.set("h", height);

        return parsed.toString();

    } catch (error) {

        // не Pexels або не абсолютний URL — просто показуємо як є
        return url;

    }

}

function setResponsiveBanner(el, cssVarName, imageUrl, crops) {

    if (!el || !imageUrl) return;

    const desktopUrl = buildCroppedImageUrl(imageUrl, crops.desktop.w, crops.desktop.h);
    const tabletUrl = buildCroppedImageUrl(imageUrl, crops.tablet.w, crops.tablet.h);
    const mobileUrl = buildCroppedImageUrl(imageUrl, crops.mobile.w, crops.mobile.h);

    const mqMobile = window.matchMedia("(max-width: 600px)");
    const mqTablet = window.matchMedia("(max-width: 900px)");

    function apply() {

        let url = desktopUrl;

        if (mqMobile.matches) url = mobileUrl;
        else if (mqTablet.matches) url = tabletUrl;

        el.style.setProperty(cssVarName, `url('${url}')`);

    }

    apply();

    mqMobile.addEventListener("change", apply);
    mqTablet.addEventListener("change", apply);

}

function renderHero(hero) {

    if (!hero) return;

    const heroSection = document.getElementById("heroSection");
    const heroLabel = document.getElementById("heroLabel");
    const heroHeading = document.getElementById("heroHeading");
    const heroText = document.getElementById("heroText");
    const heroPrimaryBtn = document.getElementById("heroPrimaryBtn");
    const heroSecondaryBtn = document.getElementById("heroSecondaryBtn");

    if (hero.image && heroSection) {

        setResponsiveBanner(heroSection, "--hero-bg", hero.image, {
            desktop: { w: 1600, h: 720 },
            tablet: { w: 1024, h: 900 },
            mobile: { w: 750, h: 1000 }
        });

    }

    if (heroLabel && hero.label) heroLabel.textContent = hero.label;

    if (heroHeading && hero.heading) {
        heroHeading.innerHTML = hero.heading
            .split("\n")
            .map(line => line.trim())
            .join("<br>");
    }

    if (heroText && hero.text) heroText.textContent = hero.text;

    if (heroPrimaryBtn) {
        if (hero.primaryButtonText) heroPrimaryBtn.textContent = hero.primaryButtonText;
        if (hero.primaryButtonLink) heroPrimaryBtn.href = hero.primaryButtonLink;
    }

    if (heroSecondaryBtn) {
        if (hero.secondaryButtonText) heroSecondaryBtn.textContent = hero.secondaryButtonText;
        if (hero.secondaryButtonLink) heroSecondaryBtn.href = hero.secondaryButtonLink;
    }

}

function renderInstagramBlock(instagram) {

    if (!instagram) return;

    const titleEl = document.getElementById("instagramTitle");
    const textEl = document.getElementById("instagramText");
    const btnEl = document.getElementById("instagramBtn");

    if (titleEl && instagram.title) titleEl.textContent = instagram.title;
    if (textEl && instagram.text) textEl.textContent = instagram.text;

    if (btnEl) {
        if (instagram.buttonText) btnEl.textContent = instagram.buttonText;
        if (instagram.link) btnEl.href = instagram.link;
    }

}

function renderCategories(categories) {

    if (!categories) return;

    const titleEl = document.getElementById("categoriesTitle");
    const gridEl = document.getElementById("categoriesGrid");

    if (titleEl && categories.title) titleEl.textContent = categories.title;

    if (gridEl && Array.isArray(categories.items)) {

        gridEl.innerHTML = categories.items.map(item => `
            <a href="${item.link || "catalog"}" class="category">
                <img
                    src="${item.image || "assets/images/no-image.png"}"
                    alt="${item.label || ""}"
                    onerror="this.src='assets/images/no-image.png'">
                <h3>${item.label || ""}</h3>
            </a>
        `).join("");

    }

}

function renderPromoBanner(promo) {

    if (!promo) return;

    const bannerEl = document.getElementById("promoBanner");
    const labelEl = document.getElementById("promoLabel");
    const headingEl = document.getElementById("promoHeading");
    const textEl = document.getElementById("promoText");
    const btnEl = document.getElementById("promoBtn");

    if (promo.image && bannerEl) {

        setResponsiveBanner(bannerEl, "--promo-bg", promo.image, {
            desktop: { w: 1600, h: 640 },
            tablet: { w: 1024, h: 800 },
            mobile: { w: 750, h: 900 }
        });

    }

    if (labelEl && promo.label) labelEl.textContent = promo.label;
    if (headingEl && promo.heading) headingEl.textContent = promo.heading;
    if (textEl && promo.text) textEl.textContent = promo.text;

    if (btnEl) {
        if (promo.buttonText) btnEl.textContent = promo.buttonText;
        if (promo.buttonLink) btnEl.href = promo.buttonLink;
    }

}

function renderBrands(brands) {

    if (!brands) return;

    const titleEl = document.getElementById("brandsTitle");
    const gridEl = document.getElementById("brandsGrid");

    if (titleEl && brands.title) titleEl.textContent = brands.title;

    if (gridEl && Array.isArray(brands.items)) {

        gridEl.innerHTML = brands.items.map(item => `
            <a href="${item.link || "catalog"}" class="brand-card">${item.name || ""}</a>
        `).join("");

    }

}

function renderAdvantages(advantages) {

    const gridEl = document.getElementById("advantagesGrid");

    if (!gridEl || !Array.isArray(advantages)) return;

    gridEl.innerHTML = advantages.map(item => `
        <div>
            <p>${item.icon || ""}</p>
            <h3>${item.title || ""}</h3>
            <p>${item.text || ""}</p>
        </div>
    `).join("");

}

initHome();
initHomeContent();
initPromotions();

// -------------------------
// Розділ "Акції" на головній (data/promotions.json —
// окремий файл, зібраний із data/promotions/*.json)
// -------------------------

async function initPromotions() {

    const section = document.getElementById("promotionsSection");
    const grid = document.getElementById("promotionsGrid");

    if (!section || !grid) return;

    try {

        const response = await fetch("data/promotions.json");

        if (!response.ok) {
            throw new Error("Не вдалося завантажити акції");
        }

        const promotions = await response.json();

        if (!Array.isArray(promotions) || promotions.length === 0) {
            return;
        }

        const regular = promotions.filter(promo => promo.displayType === "card");
        const bannersWithProducts = promotions.filter(promo => promo.displayType === "banner_products");
        const sideBanners = promotions.filter(promo => promo.displayType === "banner_side");
        const compactBanners = promotions.filter(promo => promo.displayType === "banner_compact");

        if (regular.length) {

            grid.innerHTML = regular.map(promo => `
                <a href="promo?id=${encodeURIComponent(promo.slug)}" class="promo-card">

                    <div class="promo-card-image">
                        <img
                            src="${promo.image}"
                            alt="${promo.title}"
                            onerror="this.src='assets/images/no-image.png'">
                        ${promo.badge ? `<span class="promo-card-badge">${promo.badge}</span>` : ""}
                    </div>

                    <div class="promo-card-info">
                        <h3>${promo.title}</h3>
                        ${promo.text ? `<p>${promo.text}</p>` : ""}
                        <span class="promo-card-link">${promo.buttonText || "Дивитись усі товари"} →</span>
                    </div>

                </a>
            `).join("");

            section.hidden = false;

        }

        let allProducts = [];

        if (bannersWithProducts.length || sideBanners.length) {

            try {

                const productsResponse = await fetch("data/products.json");

                if (productsResponse.ok) allProducts = await productsResponse.json();

            } catch (error) {

                console.error(error);

            }

        }

        if (bannersWithProducts.length) {
            renderFeaturedPromotions(bannersWithProducts, allProducts);
        }

        if (sideBanners.length) {
            renderSideCampaigns(sideBanners, allProducts);
        }

        if (compactBanners.length) {
            renderCompactPromotions(compactBanners);
        }

    } catch (error) {

        console.error(error);

    }

}

// -------------------------
// Повноширинні банери акцій (featured: true) — фото + текст
// на всю ширину сторінки, а під ним ряд товарів цієї акції,
// як банер бренду на md-fashion.ua
// -------------------------

async function renderFeaturedPromotions(featuredPromotions, allProducts) {

    const section = document.getElementById("brandCampaignsSection");

    if (!section) return;

    section.innerHTML = featuredPromotions.map(promo => {

        const productIds = new Set(promo.productIds || []);

        const curated = allProducts
            .filter(product =>
                productIds.has(product.id) ||
                (promo.brand && product.brand === promo.brand)
            )
            .slice(0, 4);

        return `
            <div class="brand-campaign">

                <div class="container">

                    <div class="brand-campaign-banner">

                        <div class="brand-campaign-image">
                            <img
                                src="${promo.image}"
                                alt="${promo.title}"
                                onerror="this.src='assets/images/no-image.png'">
                        </div>

                        <div class="brand-campaign-content">

                            ${promo.badge ? `<span class="brand-campaign-eyebrow">${promo.badge}</span>` : ""}

                            <h2>${promo.title}</h2>

                            ${promo.text ? `<p>${promo.text}</p>` : ""}

                            <a href="promo?id=${encodeURIComponent(promo.slug)}" class="btn">
                                ${promo.buttonText || "Дивитись усі товари"}
                            </a>

                        </div>

                    </div>

                    ${curated.length ? `

                    <div class="brand-campaign-products">
                        ${curated.map(product => createProductCard(product)).join("")}
                    </div>

                    <div class="brand-campaign-more">
                        <a href="promo?id=${encodeURIComponent(promo.slug)}" class="btn btn-outline">
                            ${promo.buttonText || "Дивитись усі товари"}
                        </a>
                    </div>

                    ` : ""}

                </div>

            </div>
        `;

    }).join("");

    if (typeof initProductCarousels === "function") initProductCarousels(section);
    if (typeof updateFavoriteButtons === "function") updateFavoriteButtons();

}

// -------------------------
// Банер зліва + карусель товарів справа (displayType: "banner_side") —
// фото акції зліва на всю висоту, а справа лічильник "01/05",
// стрілки та невелика горизонтальна карусель карток товару,
// за зразком блоку акцій на md-fashion.ua
// -------------------------

function renderSideCampaigns(sideBanners, allProducts) {

    const section = document.getElementById("sideCampaignsSection");

    if (!section) return;

    section.innerHTML = sideBanners.map((promo, campaignIndex) => {

        const productIds = new Set(promo.productIds || []);

        const curated = allProducts
            .filter(product =>
                productIds.has(product.id) ||
                (promo.brand && product.brand === promo.brand)
            )
            .slice(0, 8);

        if (!curated.length) return "";

        const trackId = `sideCampaignTrack${campaignIndex}`;
        const counterId = `sideCampaignCounter${campaignIndex}`;
        const total = String(curated.length).padStart(2, "0");

        return `
            <div class="container">

                <div class="side-campaign">

                    <div class="side-campaign-head">
                        <div>
                            <span class="side-campaign-eyebrow">${promo.badge || "Акції"}</span>
                            <h2>${promo.title}</h2>
                        </div>
                        <div class="side-campaign-nav">
                            <span class="side-campaign-counter">
                                <span id="${counterId}">01</span>/${total}
                            </span>
                            <button type="button" class="side-campaign-arrow" data-dir="-1" data-track="${trackId}" aria-label="Попередній товар">←</button>
                            <button type="button" class="side-campaign-arrow" data-dir="1" data-track="${trackId}" aria-label="Наступний товар">→</button>
                        </div>
                    </div>

                    <div class="side-campaign-layout">

                        <a href="promo?id=${encodeURIComponent(promo.slug)}" class="side-campaign-image">
                            <img
                                src="${promo.image}"
                                alt="${promo.title}"
                                onerror="this.src='assets/images/no-image.png'">
                            ${promo.text ? `<span class="side-campaign-image-caption">${promo.text}</span>` : ""}
                        </a>

                        <div class="side-campaign-products">

                            <div class="side-campaign-track" id="${trackId}" data-counter="${counterId}">

                                ${curated.map(product => createSideCampaignCard(product)).join("")}

                            </div>

                        </div>

                    </div>

                </div>

            </div>
        `;

    }).join("");

    setupSideCampaignCarousels();

    if (typeof updateFavoriteButtons === "function") updateFavoriteButtons();

}

function createSideCampaignCard(product) {

    const variant = product.variants?.[0];
    const image = variant?.images?.[0] || product.images?.[0] || "assets/images/no-image.png";

    const oldPrice = product.oldPrice
        ? `<span class="side-campaign-old-price">${product.oldPrice.toLocaleString("uk-UA")} грн</span>`
        : "";

    return `
        <a href="product?id=${product.id}" class="side-campaign-card">

            <div class="side-campaign-card-image">
                <img src="${image}" alt="${product.title}" onerror="this.src='assets/images/no-image.png'">
                <button type="button" class="favorite" data-id="${product.id}" title="Додати в обране">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 21s-6.7-4.4-9.3-8.3C.9 9.6 1.7 5.9 5.1 4.9c2-.6 4 .2 5.2 1.9l1.7 2.3 1.7-2.3c1.2-1.7 3.2-2.5 5.2-1.9 3.4 1 4.2 4.7 2.4 7.8C18.7 16.6 12 21 12 21z"/>
                    </svg>
                </button>
            </div>

            <span class="side-campaign-card-brand">${product.brand || ""}</span>
            <span class="side-campaign-card-title">${product.title}</span>
            <span class="side-campaign-card-price">
                ${product.price.toLocaleString("uk-UA")} грн
                ${oldPrice}
            </span>

        </a>
    `;

}

function setupSideCampaignCarousels() {

    document.querySelectorAll(".side-campaign-track").forEach(track => {

        if (track.dataset.bound) return;

        track.dataset.bound = "1";

        const counterEl = document.getElementById(track.dataset.counter);

        const cardWidth = () => track.querySelector(".side-campaign-card")?.getBoundingClientRect().width + 16 || 200;

        function updateCounter() {

            if (!counterEl) return;

            const index = Math.round(track.scrollLeft / cardWidth());
            const clamped = Math.min(index, track.children.length - 1);

            counterEl.textContent = String(clamped + 1).padStart(2, "0");

        }

        track.addEventListener("scroll", () => {

            window.requestAnimationFrame(updateCounter);

        }, { passive: true });

    });

    document.querySelectorAll(".side-campaign-arrow").forEach(button => {

        if (button.dataset.bound) return;

        button.dataset.bound = "1";

        button.addEventListener("click", () => {

            const track = document.getElementById(button.dataset.track);

            if (!track) return;

            const card = track.querySelector(".side-campaign-card");
            const step = (card?.getBoundingClientRect().width || 200) + 16;

            track.scrollBy({ left: step * Number(button.dataset.dir), behavior: "smooth" });

        });

    });

}

// -------------------------
// Компактні банери брендів (displayType: "banner_compact") —
// фото + короткий текст і кнопка, без ряду товарів під ним
// -------------------------

function renderCompactPromotions(compactPromotions) {

    const section = document.getElementById("compactPromotionsSection");

    if (!section) return;

    section.innerHTML = compactPromotions.map(promo => `
        <div class="brand-teaser">

            <div class="container">

                <div class="brand-teaser-banner">

                    <div class="brand-teaser-image">
                        <img
                            src="${promo.image}"
                            alt="${promo.title}"
                            onerror="this.src='assets/images/no-image.png'">
                    </div>

                    <div class="brand-teaser-content">

                        <p class="brand-teaser-text">${promo.title}</p>

                        <a href="promo?id=${encodeURIComponent(promo.slug)}" class="brand-teaser-btn">
                            ${promo.buttonText || "Дивитись все"}
                            <span class="brand-teaser-arrow">→</span>
                        </a>

                    </div>

                </div>

            </div>

        </div>
    `).join("");

}
