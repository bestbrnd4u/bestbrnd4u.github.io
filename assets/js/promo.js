// ======================================
// promo.js
// Логіка сторінки окремої акції (promo?id=<slug>).
//
// Товари для акції визначаються так:
//   1. Ті, що вручну обрані в адмінці (поле "Товари цієї акції")
//   2. + усі товари вказаного бренду (поле "Бренд"), якщо він заданий
// Якщо акція не знайдена — переходимо на загальний каталог.
// ======================================

async function initPromoPage() {

    const params = new URLSearchParams(location.search);
    const slug = params.get("id");

    const loader = document.getElementById("promoLoader");

    if (!slug) {
        location.href = "catalog";
        return;
    }

    try {

        const [promoRes, productsRes] = await Promise.all([
            fetch("data/promotions.json"),
            fetch("data/products.json")
        ]);

        if (!promoRes.ok || !productsRes.ok) {
            throw new Error("Не вдалося завантажити дані");
        }

        const promotions = await promoRes.json();
        const allProducts = await productsRes.json();

        const promo = Array.isArray(promotions)
            ? promotions.find(p => p.slug === slug)
            : null;

        loader.hidden = true;

        if (!promo) {
            showPromoNotFound();
            return;
        }

        renderPromoHero(promo);
        renderPromoProducts(promo, allProducts);

    } catch (error) {

        console.error("Не вдалося завантажити акцію:", error);

        loader.hidden = true;

        showPromoNotFound();

    }

}

function showPromoNotFound() {

    document.getElementById("promoNotFound").hidden = false;

}

function renderPromoHero(promo) {

    document.getElementById("pageTitle").textContent = `${promo.title} | Bagvero`;
    document.getElementById("breadcrumbTitle").textContent = promo.title;

    const heroSection = document.getElementById("promoHero");
    const banner = document.getElementById("promoHeroBanner");
    const badgeEl = document.getElementById("promoHeroBadge");
    const titleEl = document.getElementById("promoHeroTitle");
    const textEl = document.getElementById("promoHeroText");
    const linkEl = document.getElementById("promoHeroLink");
    const linkTextEl = document.getElementById("promoHeroLinkText");

    banner.style.backgroundImage =
        `linear-gradient(rgba(17,24,39,.55), rgba(17,24,39,.55)), url('${promo.image}')`;

    if (promo.badge) {
        badgeEl.textContent = promo.badge;
        badgeEl.hidden = false;
    }

    titleEl.textContent = promo.title;

    if (promo.text) {
        textEl.textContent = promo.text;
        textEl.hidden = false;
    }

    if (promo.link) linkEl.href = promo.link;
    if (promo.buttonText) linkTextEl.textContent = promo.buttonText;

    heroSection.hidden = false;

}

function renderPromoProducts(promo, allProducts) {

    const productIds = new Set(promo.productIds || []);

    let curated = allProducts.filter(product =>
        productIds.has(product.id) ||
        (promo.brand && product.brand === promo.brand)
    );

    // якщо для товару не задана власна знижка (oldPrice), але в акції
    // є відсоток за замовчуванням — рахуємо "стару" ціну лише для показу
    // на цій сторінці, сам товар у каталозі це не змінює
    curated = curated.map(product => {

        if (product.oldPrice || !promo.discountPercent) return product;

        const syntheticOldPrice = Math.round(product.price / (1 - promo.discountPercent / 100));

        return { ...product, oldPrice: syntheticOldPrice };

    });

    const section = document.getElementById("promoProductsSection");
    const grid = document.getElementById("promoProductsGrid");
    const countEl = document.getElementById("promoProductsCount");

    if (curated.length === 0) return;

    countEl.textContent = curated.length;

    grid.innerHTML = curated.map(product => createProductCard(product)).join("");

    initProductCarousels(grid);

    updateFavoriteButtons();

    section.hidden = false;

}

initPromoPage();
