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

        grid.innerHTML = promotions.map(promo => `
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

    } catch (error) {

        console.error(error);

    }

}
