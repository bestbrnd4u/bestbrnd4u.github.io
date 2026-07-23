let products = [];

const grid = document.getElementById("catalogGrid");
const search = document.getElementById("searchInput");

const sortToggle = document.getElementById("sortToggle");
const sortMenu = document.getElementById("sortMenu");
const sortLabel = document.getElementById("sortLabel");
const sortDropdown = document.getElementById("sortDropdown");

let currentSort = "";
let selectedBrands = new Set();
let selectedPrices = new Set();

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
const activeFiltersChips = document.getElementById("activeFiltersChips");

let activeFiltersExpanded = false;

const GENDERS = ["Чоловікам", "Жінкам", "Унісекс", "Дітям"];
const SALE_MIN_DISCOUNT = 30; // % — мінімальна знижка для розділу "Акції"
const DEFAULT_BRAND_LABEL = "Усі бренди";
const DEFAULT_PRICE_LABEL = "Будь-яка ціна";

const PRICE_RANGE_LABELS = {
    "0-2000": "до 2 000 ₴",
    "2000-5000": "2 000 – 5 000 ₴",
    "5000-8000": "5 000 – 8 000 ₴",
    "8000": "від 8 000 ₴"
};

function matchesPriceRange(product, rangeKey) {

    switch (rangeKey) {

        case "0-2000":
            return product.price <= 2000;

        case "2000-5000":
            return product.price >= 2000 && product.price <= 5000;

        case "5000-8000":
            return product.price >= 5000 && product.price <= 8000;

        case "8000":
            return product.price >= 8000;

        default:
            return false;

    }

}

// формує підпис кнопки-дропдауна залежно від кількості обраних значень
function getMultiSelectLabel(selectedSet, defaultLabel, noun, labelForValue) {

    if (selectedSet.size === 0) return defaultLabel;

    const toLabel = labelForValue || (value => value);

    if (selectedSet.size === 1) return toLabel([...selectedSet][0]);

    return `${noun} (${selectedSet.size})`;

}

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
// Дропдаун «Бренд» (мультиселект)
// -------------------------

function fillBrands() {

    const brands = [...new Set(products.map(product => product.brand))].sort();

    brands.forEach(item => {

        const option = document.createElement("button");

        option.type = "button";
        option.className = "filter-option";
        option.dataset.brand = item;
        option.innerHTML = `<span class="filter-checkbox"></span>${item}`;

        option.addEventListener("click", () => toggleBrand(item));

        brandOptionsList.appendChild(option);

    });

}

function toggleBrand(value) {

    if (selectedBrands.has(value)) {

        selectedBrands.delete(value);

    } else {

        selectedBrands.add(value);

    }

    updateBrandUI();

    render();

}

function clearBrands() {

    selectedBrands.clear();

    updateBrandUI();

    closeAllDropdowns();

    render();

}

function updateBrandUI() {

    brandLabel.textContent = getMultiSelectLabel(selectedBrands, DEFAULT_BRAND_LABEL, "Бренди");

    brandOptionsList.querySelectorAll(".filter-option").forEach(o => {
        o.classList.toggle("active", selectedBrands.has(o.dataset.brand));
    });

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

    const urlBrand = params.get("brand");

    if (urlBrand) {

        const match = [...brandOptionsList.querySelectorAll(".filter-option")]
            .find(o => o.dataset.brand === urlBrand);

        if (match) {

            selectedBrands.add(urlBrand);

            updateBrandUI();

        }

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

document.querySelector("[data-clear-brand]")?.addEventListener("click", clearBrands);

function filterBrandOptions(query) {

    const q = query.trim().toLowerCase();
    let visibleCount = 0;

    brandOptionsList.querySelectorAll(".filter-option").forEach(option => {

        const matches = option.dataset.brand.toLowerCase().includes(q);

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
// Дропдаун «Ціна» (мультиселект)
// -------------------------

priceMenu?.querySelectorAll(".filter-option").forEach(option => {

    option.addEventListener("click", () => {

        togglePrice(option.dataset.price);

    });

});

function togglePrice(value) {

    if (selectedPrices.has(value)) {

        selectedPrices.delete(value);

    } else {

        selectedPrices.add(value);

    }

    updatePriceUI();

    render();

}

function clearPrices() {

    selectedPrices.clear();

    updatePriceUI();

    closeAllDropdowns();

    render();

}

function updatePriceUI() {

    priceLabel.textContent = getMultiSelectLabel(
        selectedPrices,
        DEFAULT_PRICE_LABEL,
        "Ціна",
        value => PRICE_RANGE_LABELS[value]
    );

    priceMenu.querySelectorAll(".filter-option").forEach(o => {
        o.classList.toggle("active", selectedPrices.has(o.dataset.price));
    });

}

document.querySelector("[data-clear-price]")?.addEventListener("click", clearPrices);

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

    if (selectedBrands.size) {

        list = list.filter(product =>
            selectedBrands.has(product.brand)
        );

    }

    if (selectedPrices.size) {

        list = list.filter(product =>
            [...selectedPrices].some(range => matchesPriceRange(product, range))
        );

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

    if (!activeFiltersBar || !activeFiltersChips) return;

    const chips = [];

    const text = search.value.trim();

    if (text) {

        chips.push({ type: "search", label: `Пошук: «${text}»` });

    }

    if (currentGender) {

        chips.push({ type: "gender", label: currentGender });

    }

    selectedBrands.forEach(brand => {

        chips.push({ type: "brand", value: brand, label: brand });

    });

    selectedPrices.forEach(range => {

        chips.push({ type: "price", value: range, label: PRICE_RANGE_LABELS[range] });

    });

    if (chips.length === 0) {

        activeFiltersBar.hidden = true;
        activeFiltersChips.innerHTML = "";
        activeFiltersExpanded = false;

        return;

    }

    activeFiltersBar.hidden = false;

    activeFiltersChips.innerHTML = chips.map(chip => `
        <button type="button" class="filter-chip" data-clear="${chip.type}" data-value="${chip.value || ""}">
            ${chip.label}
            <span class="filter-chip-x">✕</span>
        </button>
    `).join("");

    layoutActiveFilters();

}

// -------------------------
// Обмежуємо активні фільтри двома рядками,
// решту ховаємо за кнопкою "+N фільтрів"
// -------------------------

function pluralizeFilters(n) {

    const mod10 = n % 10;
    const mod100 = n % 100;

    if (mod10 === 1 && mod100 !== 11) return "фільтр";
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "фільтри";

    return "фільтрів";

}

function layoutActiveFilters() {

    if (!activeFiltersChips) return;

    const label = document.querySelector(".active-filters-label");
    const chipButtons = Array.from(activeFiltersChips.querySelectorAll(".filter-chip"));

    const existingMore = activeFiltersChips.querySelector(".filter-more-chip");
    if (existingMore) existingMore.remove();

    chipButtons.forEach(el => el.classList.remove("filter-chip-hidden"));

    if (chipButtons.length === 0) return;

    const measureItems = [label, ...chipButtons].filter(Boolean);
    const rowTops = [...new Set(measureItems.map(el => el.offsetTop))];

    const overflowChips = rowTops.length > 2
        ? chipButtons.filter(el => el.offsetTop > rowTops[1])
        : [];

    if (overflowChips.length === 0) return;

    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "filter-chip filter-more-chip";

    if (activeFiltersExpanded) {

        moreBtn.textContent = "Згорнути ▴";

    } else {

        overflowChips.forEach(el => el.classList.add("filter-chip-hidden"));

        moreBtn.textContent = `+${overflowChips.length} ${pluralizeFilters(overflowChips.length)}`;

    }

    activeFiltersChips.appendChild(moreBtn);

}

window.addEventListener("resize", debounce(() => {

    if (activeFiltersBar && !activeFiltersBar.hidden) layoutActiveFilters();

}, 200));

function debounce(fn, delay) {

    let timer = null;

    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };

}

activeFiltersList?.addEventListener("click", event => {

    const moreBtn = event.target.closest(".filter-more-chip");

    if (moreBtn) {

        activeFiltersExpanded = !activeFiltersExpanded;
        layoutActiveFilters();

        return;

    }

    const chip = event.target.closest(".filter-chip");

    if (!chip || chip.classList.contains("filter-more-chip")) return;

    clearOneFilter(chip.dataset.clear, chip.dataset.value);

});

function clearOneFilter(type, value) {

    if (type === "search") {

        search.value = "";

    } else if (type === "gender") {

        currentGender = "";

        genderFilterEl?.querySelectorAll(".gender-pill").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.gender === "");
        });

    } else if (type === "brand") {

        selectedBrands.delete(value);

        updateBrandUI();

    } else if (type === "price") {

        selectedPrices.delete(value);

        updatePriceUI();

    }

    render();

}

function resetAllFilters() {

    search.value = "";

    selectedBrands.clear();
    updateBrandUI();

    selectedPrices.clear();
    updatePriceUI();

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
