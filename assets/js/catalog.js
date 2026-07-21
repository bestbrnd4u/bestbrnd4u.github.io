let products = [];

const grid = document.getElementById("catalogGrid");
const search = document.getElementById("searchInput");

const sortToggle = document.getElementById("sortToggle");
const sortMenu = document.getElementById("sortMenu");
const sortLabel = document.getElementById("sortLabel");
const sortDropdown = document.getElementById("sortDropdown");

let currentSort = "";
let currentBrand = "";
let currentPrice = "";

// -------------------------
// Дропдаун «Бренд» (з пошуком)
// -------------------------

const brandDropdown = document.getElementById("brandDropdown");
const brandToggle = document.getElementById("brandToggle");
const brandMenu = document.getElementById("brandMenu");
const brandLabel = document.getElementById("brandLabel");
const brandSearchInput = document.getElementById("brandSearchInput");
const brandOptionsList = document.getElementById("brandOptionsList");
const brandNoResults = document.getElementById("brandNoResults");

// -------------------------
// Дропдаун «Ціна»
// -------------------------

const priceDropdown = document.getElementById("priceDropdown");
const priceToggle = document.getElementById("priceToggle");
const priceMenu = document.getElementById("priceMenu");
const priceLabel = document.getElementById("priceLabel");

const loader = document.getElementById("catalogLoader");
const emptyState = document.getElementById("emptyCatalog");

const productsCount = document.getElementById("productsCount");
const productsCounter = document.getElementById("productsCounter");

const resetBtn = document.getElementById("resetFilters");
const clearBtn = document.getElementById("clearSearch");

const gridViewBtn = document.getElementById("gridViewBtn");
const listViewBtn = document.getElementById("listViewBtn");

const genderFilterEl = document.getElementById("genderFilter");
const breadcrumbsList = document.getElementById("breadcrumbsList");
const catalogTitle = document.getElementById("catalogTitle");
const catalogSubtitle = document.getElementById("catalogSubtitle");

const activeFiltersBar = document.getElementById("activeFiltersBar");
const activeFiltersList = document.getElementById("activeFiltersList");

const GENDERS = ["Чоловікам", "Жінкам", "Унісекс", "Дітям"];
const SALE_MIN_DISCOUNT = 30; // % — мінімальна знижка для розділу "Акції"
const DEFAULT_BRAND_LABEL = "Усі бренди";
const DEFAULT_PRICE_LABEL = "Будь-яка ціна";

// поточний стан розділу, приходить з URL; стать — лише початкове
// значення фільтра, після завантаження сторінки завжди вільно змінюється
let currentSection = ""; // "" | "new" | "sale"
let currentGender = "";  // "" | одне з GENDERS

function readUrlState() {

    const params = new URLSearchParams(location.search);

    const section = params.get("section");
    currentSection = (section === "new" || section === "sale") ? section : "";

    const genderParam = params.get("gender");
    currentGender = GENDERS.includes(genderParam) ? genderParam : "";

}

async function initCatalog() {

    readUrlState();

    try {

        loader.hidden = false;

        const response = await fetch("data/products.json");

        if (!response.ok) {
            throw new Error("Не вдалося завантажити товари");
        }

        products = await response.json();

        fillBrands();

        applyBrandFromUrl();

        applySearchFromUrl();

        setupGenderFilter();

        renderBreadcrumbsAndTitle();

        highlightNavLink();

        render();

    } catch (error) {

        grid.innerHTML = `
            <p class="error">
                Помилка завантаження каталогу.
            </p>
        `;

        console.error(error);

    } finally {

        loader.hidden = true;

    }

}

// -------------------------
// Дропдаун «Бренд»
// -------------------------

function fillBrands() {

    const brands = [...new Set(products.map(product => product.brand))].sort();

    brands.forEach(item => {

        const option = document.createElement("button");

        option.type = "button";
        option.className = "filter-option";
        option.dataset.brand = item;
        option.textContent = item;

        option.addEventListener("click", () => selectBrand(item, item));

        brandOptionsList.appendChild(option);

    });

}

function selectBrand(value, label) {

    currentBrand = value;

    brandLabel.textContent = label || DEFAULT_BRAND_LABEL;

    brandOptionsList.querySelectorAll(".filter-option").forEach(o => {
        o.classList.toggle("active", (o.dataset.brand || "") === value);
    });

    closeAllDropdowns();

    render();

}

function applySearchFromUrl() {

    const params = new URLSearchParams(location.search);

    const urlSearch = params.get("search");

    if (urlSearch) {

        search.value = urlSearch;

    }

}

function applyBrandFromUrl() {

    const params = new URLSearchParams(location.search);

    if (urlBrand) {

        const match = [...brandOptionsList.querySelectorAll(".filter-option")]
            .find(o => o.dataset.brand === urlBrand);

        if (match) selectBrand(urlBrand, urlBrand);

    }

}

brandToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = brandMenu.hidden;

    closeAllDropdowns();

    if (willOpen) {

        brandMenu.hidden = false;
        brandDropdown.classList.add("open");
        brandSearchInput.value = "";
        filterBrandOptions("");
        brandSearchInput.focus();

    }

});

function filterBrandOptions(query) {

    const q = query.trim().toLowerCase();
    let visibleCount = 0;

    brandOptionsList.querySelectorAll(".filter-option").forEach(option => {

        // пункт "Усі бренди" завжди залишається на місці
        if (!option.dataset.brand) {

            option.hidden = false;

            return;

        }

        const matches = option.textContent.toLowerCase().includes(q);

        option.hidden = !matches;

        if (matches) visibleCount++;

    });

    if (brandNoResults) brandNoResults.hidden = q === "" || visibleCount !== 0;

}

brandSearchInput?.addEventListener("input", () => {

    filterBrandOptions(brandSearchInput.value);

});

brandSearchInput?.addEventListener("click", event => event.stopPropagation());

// -------------------------
// Дропдаун «Ціна»
// -------------------------

priceMenu?.querySelectorAll(".filter-option").forEach(option => {

    option.addEventListener("click", () => {

        currentPrice = option.dataset.price;

        priceLabel.textContent = option.dataset.label;

        priceMenu.querySelectorAll(".filter-option").forEach(o => o.classList.toggle("active", o === option));

        closeAllDropdowns();

        render();

    });

});

priceToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = priceMenu.hidden;

    closeAllDropdowns();

    if (willOpen) {

        priceMenu.hidden = false;
        priceDropdown.classList.add("open");

    }

});

function closeAllDropdowns() {

    [sortDropdown, brandDropdown, priceDropdown].forEach(dropdown => {

        if (!dropdown) return;

        const menu = dropdown.querySelector(".filter-menu, .sort-menu");

        if (menu) menu.hidden = true;

        dropdown.classList.remove("open");

    });

}

document.addEventListener("click", event => {

    if (event.target.closest("#sortDropdown, #brandDropdown, #priceDropdown")) return;

    closeAllDropdowns();

});

// -------------------------
// Фільтр «Стать»
// -------------------------

function setupGenderFilter() {

    if (!genderFilterEl) return;

    const buttons = [...genderFilterEl.querySelectorAll(".gender-pill")];

    buttons.forEach(btn => {

        btn.classList.toggle("active", btn.dataset.gender === currentGender);

        btn.addEventListener("click", () => {

            currentGender = btn.dataset.gender;

            buttons.forEach(b => b.classList.toggle("active", b === btn));

            render();

        });

    });

}

// -------------------------
// Хлібні крихти + заголовок
// -------------------------

function renderBreadcrumbsAndTitle() {

    const crumbs = [`<a href="index.html">Головна</a>`];

    let title = "Каталог сумок";
    let subtitle = "Понад 500 моделей від світових брендів";

    if (currentSection === "new") {

        crumbs.push(`<span>/</span>`, `<a href="catalog.html?section=new">Новинки</a>`);
        title = "Новинки";
        subtitle = "Останні надходження до каталогу Bagvero";

    } else if (currentSection === "sale") {

        crumbs.push(`<span>/</span>`, `<span class="sale-text">Акції</span>`);
        title = `<span class="sale-text">Акції</span>`;
        subtitle = `Знижки від ${SALE_MIN_DISCOUNT}% на сумки, рюкзаки та аксесуари`;

    } else {

        crumbs.push(`<span>/</span>`, `<a href="catalog.html">Каталог</a>`);

    }

    if (currentGender) {

        crumbs.push(`<span>/</span>`, `<span>${currentGender}</span>`);
        subtitle = `${subtitle} · ${currentGender}`;

    }

    if (breadcrumbsList) breadcrumbsList.innerHTML = crumbs.join("\n");

    if (catalogTitle) catalogTitle.innerHTML = title;
    if (catalogSubtitle) catalogSubtitle.textContent = subtitle;

    document.title = currentSection === "sale"
        ? "Акції | Bagvero"
        : currentSection === "new"
            ? "Новинки | Bagvero"
            : "Каталог | Bagvero";

}

function highlightNavLink() {

    const catalogLink = document.getElementById("navCatalogLink");
    const newLink = document.getElementById("navNewLink");
    const saleLink = document.getElementById("navSaleLink");

    [catalogLink, newLink, saleLink].forEach(el => el?.classList.remove("active"));

    if (currentSection === "new") {
        newLink?.classList.add("active");
    } else if (currentSection === "sale") {
        saleLink?.classList.add("active");
    } else {
        catalogLink?.classList.add("active");
    }

}

// -------------------------
// Фільтрація товарів
// -------------------------

function filterProducts() {

    let list = [...products];

    if (currentSection === "new") {

        list = list.filter(product => product.isNew);

    } else if (currentSection === "sale") {

        list = list.filter(product => {

            if (!product.oldPrice) return false;

            const discount = (1 - product.price / product.oldPrice) * 100;

            return discount >= SALE_MIN_DISCOUNT;

        });

    }

    if (currentGender) {

        list = list.filter(product => product.gender === currentGender);

    }

    const text = search.value.trim().toLowerCase();

    if (text) {

        list = list.filter(product =>
            product.title.toLowerCase().includes(text)
        );

    }

    if (currentBrand) {

        list = list.filter(product =>
            product.brand === currentBrand
        );

    }

    if (currentPrice) {

        switch (currentPrice) {

            case "0-2000":
                list = list.filter(product => product.price <= 2000);
                break;

            case "2000-5000":
                list = list.filter(product =>
                    product.price >= 2000 &&
                    product.price <= 5000
                );
                break;

            case "5000-8000":
                list = list.filter(product =>
                    product.price >= 5000 &&
                    product.price <= 8000
                );
                break;

            case "8000":
                list = list.filter(product =>
                    product.price >= 8000
                );
                break;

        }

    }

    switch (currentSort) {

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

function getDiscountPercent(product) {

    if (!product.oldPrice || product.oldPrice <= product.price) return 0;

    return Math.round((1 - product.price / product.oldPrice) * 100);

}

function render() {

    const list = filterProducts();

    grid.innerHTML = list
        .map(product => createProductCard(product))
        .join("");

    productsCount.textContent = list.length;

    if (productsCounter) {

        productsCounter.textContent = `(${list.length})`;

    }

    emptyState.hidden = list.length !== 0;

    renderActiveFilters();

}

// -------------------------
// Рядок активних фільтрів (чіпи з хрестиком)
// -------------------------

function renderActiveFilters() {

    if (!activeFiltersBar || !activeFiltersList) return;

    const chips = [];

    const text = search.value.trim();

    if (text) {

        chips.push({ type: "search", label: `Пошук: «${text}»` });

    }

    if (currentGender) {

        chips.push({ type: "gender", label: currentGender });

    }

    if (currentBrand) {

        chips.push({ type: "brand", label: currentBrand });

    }

    if (currentPrice) {

        chips.push({ type: "price", label: priceLabel.textContent });

    }

    if (chips.length === 0) {

        activeFiltersBar.hidden = true;
        activeFiltersList.innerHTML = "";

        return;

    }

    activeFiltersBar.hidden = false;

    activeFiltersList.innerHTML = chips.map(chip => `
        <button type="button" class="filter-chip" data-clear="${chip.type}">
            ${chip.label}
            <span class="filter-chip-x">✕</span>
        </button>
    `).join("");

}

activeFiltersList?.addEventListener("click", event => {

    const chip = event.target.closest(".filter-chip");

    if (!chip) return;

    clearOneFilter(chip.dataset.clear);

});

function clearOneFilter(type) {

    if (type === "search") {

        search.value = "";

    } else if (type === "gender") {

        currentGender = "";

        genderFilterEl?.querySelectorAll(".gender-pill").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.gender === "");
        });

    } else if (type === "brand") {

        selectBrand("", DEFAULT_BRAND_LABEL);

        return; // selectBrand вже викликає render()

    } else if (type === "price") {

        currentPrice = "";

        priceLabel.textContent = DEFAULT_PRICE_LABEL;

        priceMenu?.querySelectorAll(".filter-option").forEach(o => {
            o.classList.toggle("active", o.dataset.price === "");
        });

    }

    render();

}

function resetAllFilters() {

    search.value = "";

    currentBrand = "";
    brandLabel.textContent = DEFAULT_BRAND_LABEL;
    brandOptionsList.querySelectorAll(".filter-option").forEach(o => {
        o.classList.toggle("active", (o.dataset.brand || "") === "");
    });

    currentPrice = "";
    priceLabel.textContent = DEFAULT_PRICE_LABEL;
    priceMenu?.querySelectorAll(".filter-option").forEach(o => {
        o.classList.toggle("active", o.dataset.price === "");
    });

    currentSort = "";

    if (sortLabel) sortLabel.textContent = "За замовчуванням";

    sortMenu?.querySelectorAll(".sort-option").forEach(o => {
        o.classList.toggle("active", o.dataset.sort === "");
    });

    currentGender = "";

    genderFilterEl?.querySelectorAll(".gender-pill").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.gender === "");
    });

    render();

}

resetBtn?.addEventListener("click", resetAllFilters);

clearBtn?.addEventListener("click", resetAllFilters);

search.addEventListener("input", render);

// -------------------------
// Кастомний дропдаун сортування
// -------------------------

sortToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = sortMenu.hidden;

    closeAllDropdowns();

    if (willOpen) {

        sortMenu.hidden = false;
        sortDropdown?.classList.add("open");

    }

});

sortMenu?.querySelectorAll(".sort-option").forEach(option => {

    option.addEventListener("click", () => {

        currentSort = option.dataset.sort;

        sortLabel.textContent = option.dataset.label;

        sortMenu.querySelectorAll(".sort-option").forEach(o => o.classList.toggle("active", o === option));

        closeAllDropdowns();

        render();

    });

});

// -------------------------
// Перемикач "плитка / список"
// -------------------------

function setView(mode) {

    grid.classList.toggle("list-view", mode === "list");

    gridViewBtn?.classList.toggle("active", mode === "grid");
    listViewBtn?.classList.toggle("active", mode === "list");

    localStorage.setItem("catalogView", mode);

}

gridViewBtn?.addEventListener("click", () => setView("grid"));
listViewBtn?.addEventListener("click", () => setView("list"));

setView(localStorage.getItem("catalogView") || "grid");

initCatalog();
