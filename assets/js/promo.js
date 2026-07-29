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

function updatePromoSeoMetadata(promo) {

    const pageUrl = `${SITE_URL}/promo?id=${promo.slug}`;

    const title = `${promo.title} | Bagvero`;

    const description = truncateForMeta(promo.text || `Акція ${promo.title} в інтернет-магазині Bagvero`);

    setMetaByName("description", description);

    setCanonical(pageUrl);

    setMetaByProperty("og:type", "website");
    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", description);
    setMetaByProperty("og:image", promo.image);
    setMetaByProperty("og:url", pageUrl);

}

function renderPromoHero(promo) {

    document.getElementById("pageTitle").textContent = `${promo.title} | Bagvero`;
    document.getElementById("breadcrumbTitle").textContent = promo.title;

    updatePromoSeoMetadata(promo);

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

let promoBaseProducts = [];
const promoState = { brand: "", color: "", sort: "" };

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

    if (curated.length === 0) return;

    promoBaseProducts = curated;

    setupPromoFilters();

    renderPromoGrid();

    section.hidden = false;

}

// -------------------------
// Фільтри/сортування/вигляд — лише серед товарів цієї акції
// -------------------------

function getPromoFilteredSorted() {

    let list = promoBaseProducts.filter(product => {

        if (promoState.brand && product.brand !== promoState.brand) return false;

        if (promoState.color) {

            const colorNames = [...getProductColors(product).keys()];

            if (!colorNames.includes(promoState.color)) return false;

        }

        return true;

    });

    list = [...list];

    switch (promoState.sort) {

        case "new":
            list.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
            break;

        case "top":
            list.sort((a, b) => (b.badge === "TOP" ? 1 : 0) - (a.badge === "TOP" ? 1 : 0));
            break;

        case "priceAsc":
            list.sort((a, b) => a.price - b.price);
            break;

        case "priceDesc":
            list.sort((a, b) => b.price - a.price);
            break;

        case "discount":
            list.sort((a, b) => getDiscountPercent(b) - getDiscountPercent(a));
            break;

    }

    return list;

}

function renderPromoGrid() {

    const grid = document.getElementById("promoProductsGrid");
    const countEl = document.getElementById("promoProductsCount");

    const list = getPromoFilteredSorted();

    countEl.textContent = list.length;

    grid.innerHTML = list.map(product => createProductCard(product)).join("");

    initProductCarousels(grid);

    updateFavoriteButtons();

}

function setupPromoFilters() {

    const brandOptionsList = document.getElementById("promoBrandOptionsList");
    const colorOptionsList = document.getElementById("promoColorOptionsList");

    // -- бренди, наявні саме серед товарів цієї акції --
    const brands = [...new Set(promoBaseProducts.map(p => p.brand).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "uk"));

    brandOptionsList.innerHTML = "";

    brands.forEach(brand => {

        const option = document.createElement("button");

        option.type = "button";
        option.className = "filter-option";
        option.dataset.brand = brand;
        option.innerHTML = `<span class="filter-checkbox"></span>${brand}`;

        option.addEventListener("click", () => {
            promoState.brand = promoState.brand === brand ? "" : brand;
            updatePromoBrandUI();
            renderPromoGrid();
        });

        brandOptionsList.appendChild(option);

    });

    // -- кольори, наявні саме серед товарів цієї акції --
    const colorSwatches = new Map();

    promoBaseProducts.forEach(product => {

        getProductColors(product).forEach((hex, name) => {

            if (!colorSwatches.has(name) || (!colorSwatches.get(name) && hex)) {
                colorSwatches.set(name, hex);
            }

        });

    });

    colorOptionsList.innerHTML = "";

    [...colorSwatches.keys()]
        .sort((a, b) => a.localeCompare(b, "uk"))
        .forEach(name => {

            const hex = colorSwatches.get(name) || "#e5e7eb";

            const option = document.createElement("button");

            option.type = "button";
            option.className = "filter-option filter-option-color";
            option.dataset.color = name;
            option.innerHTML = `
                <span class="filter-checkbox"></span>
                <span class="filter-color-swatch" style="background:${hex}"></span>
                ${name}
            `;

            option.addEventListener("click", () => {
                promoState.color = promoState.color === name ? "" : name;
                updatePromoColorUI();
                renderPromoGrid();
            });

            colorOptionsList.appendChild(option);

        });

    // якщо в акції лише один бренд — нема сенсу показувати фільтр
    // з єдиним варіантом
    document.getElementById("promoBrandDropdown").hidden = brands.length < 2;

    document.querySelector("[data-clear-promo-brand]")?.addEventListener("click", () => {
        promoState.brand = "";
        updatePromoBrandUI();
        closeAllPromoDropdowns();
        renderPromoGrid();
    });

    document.querySelector("[data-clear-promo-color]")?.addEventListener("click", () => {
        promoState.color = "";
        updatePromoColorUI();
        closeAllPromoDropdowns();
        renderPromoGrid();
    });

    setupPromoDropdownToggle("promoBrandToggle", "promoBrandMenu", "promoBrandDropdown");
    setupPromoDropdownToggle("promoColorToggle", "promoColorMenu", "promoColorDropdown");
    setupPromoDropdownToggle("promoSortToggle", "promoSortMenu", "promoSortDropdown");

    document.querySelectorAll("#promoSortMenu .sort-option").forEach(btn => {

        btn.addEventListener("click", () => {

            promoState.sort = btn.dataset.sort;

            document.getElementById("promoSortLabel").textContent = btn.dataset.label;

            document.querySelectorAll("#promoSortMenu .sort-option")
                .forEach(o => o.classList.toggle("active", o === btn));

            closeAllPromoDropdowns();

            renderPromoGrid();

        });

    });

    document.getElementById("promoGridViewBtn")?.addEventListener("click", () => setPromoView("grid"));
    document.getElementById("promoListViewBtn")?.addEventListener("click", () => setPromoView("list"));

    document.addEventListener("click", () => closeAllPromoDropdowns());

}

function setupPromoDropdownToggle(toggleId, menuId, dropdownId) {

    const toggle = document.getElementById(toggleId);
    const menu = document.getElementById(menuId);
    const dropdown = document.getElementById(dropdownId);

    if (!toggle || !menu || !dropdown) return;

    toggle.addEventListener("click", event => {

        event.stopPropagation();

        const willOpen = menu.hidden;

        closeAllPromoDropdowns();

        if (willOpen) {
            menu.hidden = false;
            dropdown.classList.add("open");
        }

    });

    menu.addEventListener("click", event => event.stopPropagation());

}

function closeAllPromoDropdowns() {

    ["promoBrandMenu", "promoColorMenu", "promoSortMenu"].forEach(id => {

        const el = document.getElementById(id);

        if (el) el.hidden = true;

    });

    ["promoBrandDropdown", "promoColorDropdown", "promoSortDropdown"].forEach(id => {

        document.getElementById(id)?.classList.remove("open");

    });

}

function updatePromoBrandUI() {

    document.getElementById("promoBrandLabel").textContent = promoState.brand || "Усі бренди";

    document.querySelectorAll("#promoBrandOptionsList .filter-option")
        .forEach(o => o.classList.toggle("active", o.dataset.brand === promoState.brand));

}

function updatePromoColorUI() {

    document.getElementById("promoColorLabel").textContent = promoState.color || "Усі кольори";

    document.querySelectorAll("#promoColorOptionsList .filter-option")
        .forEach(o => o.classList.toggle("active", o.dataset.color === promoState.color));

}

function setPromoView(view) {

    document.getElementById("promoProductsGrid").classList.toggle("list-view", view === "list");
    document.getElementById("promoGridViewBtn").classList.toggle("active", view === "grid");
    document.getElementById("promoListViewBtn").classList.toggle("active", view === "list");

}

initPromoPage();
