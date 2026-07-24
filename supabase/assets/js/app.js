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

function renderHero(hero) {

    if (!hero) return;

    const heroSection = document.getElementById("heroSection");
    const heroLabel = document.getElementById("heroLabel");
    const heroHeading = document.getElementById("heroHeading");
    const heroText = document.getElementById("heroText");
    const heroPrimaryBtn = document.getElementById("heroPrimaryBtn");
    const heroSecondaryBtn = document.getElementById("heroSecondaryBtn");

    if (hero.image && heroSection) {
        heroSection.style.backgroundImage =
            `linear-gradient(rgba(17,24,39,.45), rgba(17,24,39,.45)), url('${hero.image}')`;
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
            <a href="${item.link || "catalog.html"}" class="category">
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
        bannerEl.style.backgroundImage =
            `linear-gradient(rgba(17,24,39,.55), rgba(17,24,39,.55)), url('${promo.image}')`;
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
            <a href="${item.link || "catalog.html"}" class="brand-card">${item.name || ""}</a>
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
