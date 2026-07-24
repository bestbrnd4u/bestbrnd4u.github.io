let products = [];

const grid = document.getElementById("catalogGrid");
const search = document.getElementById("searchInput");

const sortToggle = document.getElementById("sortToggle");
const sortMenu = document.getElementById("sortMenu");
const sortLabel = document.getElementById("sortLabel");
const sortDropdown = document.getElementById("sortDropdown");

let currentSort = "";
let selectedBrands = new Set();
let selectedColors = new Set();
let selectedCategories = new Set();
let selectedPrices = new Set();
let selectedSizes = new Set(); // елементи виду "group:size", напр. "bags:S"

// колір товару (для фільтра) — беремо прямо з variants,
// де hex вже заданий в адмінці; це й головне джерело правди
// для свотчів у фільтрі "Колір"
function getProductColors(product) {

    const colors = new Map(); // назва -> hex

    (product.variants || []).forEach(variant => {

        if (variant.color && !colors.has(variant.color)) {
            colors.set(variant.color, variant.hex || null);
        }

    });

    if (product.color && !colors.has(product.color)) {
        colors.set(product.color, null);
    }

    return colors;

}

const SIZE_GROUPS = [
    {
        key: "bags",
        title: "Сумки",
        categories: ["Жіночі сумки", "Чоловічі сумки", "Унісекс сумки", "Дитячі сумки"],
        sizes: ["XS", "S", "M", "L"]
    },
    {
        key: "backpacks",
        title: "Рюкзаки",
        categories: ["Рюкзаки", "Дитячі рюкзаки"],
        sizes: ["S", "M", "L", "XL"]
    },
    {
        key: "clothes",
        title: "Одяг",
        // заповнюється в initCatalog() з даних data/categories.json
        categories: [],
        sizes: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"]
    },
    {
        key: "shoes",
        title: "Взуття",
        // заповнюється в initCatalog() з даних data/categories.json
        categories: [],
        sizes: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"]
    }
];

// підтягує актуальний список категорій одягу/взуття з адмінки
// (data/categories.json) у відповідні групи розмірів
function applyCategoryDataToSizeGroups(categoryDepartments) {

    const clothesGroup = SIZE_GROUPS.find(g => g.key === "clothes");
    const shoesGroup = SIZE_GROUPS.find(g => g.key === "shoes");

    const clothesDept = categoryDepartments.find(d => d.title === "Одяг");
    const shoesDept = categoryDepartments.find(d => d.title === "Взуття");

    if (clothesGroup) clothesGroup.categories = clothesDept ? clothesDept.categories : [];
    if (shoesGroup) shoesGroup.categories = shoesDept ? shoesDept.categories : [];

}

// завантажує дерево категорій з адмінки (data/categories.json,
// зібраного зі списку окремих файлів data/categories/*.json)
// і групує його за розділами — у форматі, який очікують
// fillCategories() та applyCategoryDataToSizeGroups()
async function loadCategoryDepartments() {

    try {

        const response = await fetch("data/categories.json");

        if (!response.ok) return [];

        const categories = await response.json();

        const byDepartment = new Map();

        categories.forEach(category => {

            if (!byDepartment.has(category.department)) {
                byDepartment.set(category.department, { title: category.department, categories: [] });
            }

            byDepartment.get(category.department).categories.push(category.name);

        });

        return [...byDepartment.values()];

    } catch (error) {

        console.warn("Не вдалося завантажити категорії:", error);

        return [];

    }

}

function matchesSizeKey(product, key) {

    const [groupKey, size] = key.split(":");

    const group = SIZE_GROUPS.find(g => g.key === groupKey);

    if (!group) return false;

    return group.categories.includes(product.category) && (product.sizes || []).includes(size);

}

const categoryDropdown = document.getElementById("categoryDropdown");
const categoryToggle = document.getElementById("categoryToggle");
const categoryMenu = document.getElementById("categoryMenu");
const categoryLabel = document.getElementById("categoryLabel");
const categorySearchInput = document.getElementById("categorySearchInput");
const categoryOptionsList = document.getElementById("categoryOptionsList");
const categoryNoResults = document.getElementById("categoryNoResults");

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
// Дропдаун «Колір»
// -------------------------

const colorDropdown = document.getElementById("colorDropdown");
const colorToggle = document.getElementById("colorToggle");
const colorMenu = document.getElementById("colorMenu");
const colorLabel = document.getElementById("colorLabel");
const colorOptionsList = document.getElementById("colorOptionsList");

// -------------------------
// Дропдаун «Ціна»
// -------------------------

const priceDropdown = document.getElementById("priceDropdown");
const priceToggle = document.getElementById("priceToggle");
const priceMenu = document.getElementById("priceMenu");
const priceLabel = document.getElementById("priceLabel");

// -------------------------
// Дропдаун «Розмір»
// -------------------------

const sizeDropdown = document.getElementById("sizeDropdown");
const sizeToggle = document.getElementById("sizeToggle");
const sizeMenu = document.getElementById("sizeMenu");
const sizeLabel = document.getElementById("sizeLabel");

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
const DEFAULT_COLOR_LABEL = "Усі кольори";
const DEFAULT_CATEGORY_LABEL = "Усі категорії";
const DEFAULT_PRICE_LABEL = "Будь-яка ціна";
const DEFAULT_SIZE_LABEL = "Розмір";

const PRICE_RANGE_LABELS = {
    "0-2000": "до 2 000 грн",
    "2000-5000": "2 000 – 5 000 грн",
    "5000-8000": "5 000 – 8 000 грн",
    "8000": "від 8 000 грн"
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

        const categoryDepartments = await loadCategoryDepartments();

        applyCategoryDataToSizeGroups(categoryDepartments);

        fillBrands();

        applyBrandFromUrl();

        fillColors();

        fillCategories(categoryDepartments);

        applyCategoryFromUrl();

        fillSizeGroups();

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
// Дропдаун «Колір» (мультиселект, свотчі з даних товару)
// -------------------------

function fillColors() {

    if (!colorOptionsList) return;

    const colorSwatches = new Map(); // назва -> hex

    products.forEach(product => {

        getProductColors(product).forEach((hex, name) => {

            if (!colorSwatches.has(name) || (!colorSwatches.get(name) && hex)) {
                colorSwatches.set(name, hex);
            }

        });

    });

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

            option.addEventListener("click", () => toggleColor(name));

            colorOptionsList.appendChild(option);

        });

}

function toggleColor(value) {

    if (selectedColors.has(value)) {

        selectedColors.delete(value);

    } else {

        selectedColors.add(value);

    }

    updateColorUI();

    render();

}

function clearColors() {

    selectedColors.clear();

    updateColorUI();

    closeAllDropdowns();

    render();

}

function updateColorUI() {

    colorLabel.textContent = getMultiSelectLabel(selectedColors, DEFAULT_COLOR_LABEL, "Кольори");

    colorOptionsList.querySelectorAll(".filter-option").forEach(o => {
        o.classList.toggle("active", selectedColors.has(o.dataset.color));
    });

}

document.querySelector("[data-clear-color]")?.addEventListener("click", clearColors);

colorToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = colorMenu.hidden;

    closeAllDropdowns();

    if (willOpen) {

        colorMenu.hidden = false;
        colorDropdown.classList.add("open");

    }

});

// -------------------------
// Дропдаун «Категорія» (з пошуком, згруповано по розділах)
// -------------------------

function fillCategories(categoryDepartments) {

    if (!categoryOptionsList || !Array.isArray(categoryDepartments)) return;

    const presentCategories = new Set(products.map(product => product.category));

    categoryDepartments.forEach(department => {

        const categoriesHere = department.categories.filter(c => presentCategories.has(c));

        if (categoriesHere.length === 0) return;

        const groupTitle = document.createElement("div");
        groupTitle.className = "filter-option-group-title";
        groupTitle.textContent = department.title;

        categoryOptionsList.appendChild(groupTitle);

        categoriesHere.forEach(category => {

            const option = document.createElement("button");

            option.type = "button";
            option.className = "filter-option";
            option.dataset.category = category;
            option.innerHTML = `<span class="filter-checkbox"></span>${category}`;

            option.addEventListener("click", () => toggleCategory(category));

            categoryOptionsList.appendChild(option);

        });

    });

}

function toggleCategory(value) {

    if (selectedCategories.has(value)) {

        selectedCategories.delete(value);

    } else {

        selectedCategories.add(value);

    }

    updateCategoryUI();

    render();

}

function clearCategories() {

    selectedCategories.clear();

    updateCategoryUI();

    closeAllDropdowns();

    render();

}

function updateCategoryUI() {

    categoryLabel.textContent = getMultiSelectLabel(selectedCategories, DEFAULT_CATEGORY_LABEL, "Категорії");

    categoryOptionsList.querySelectorAll(".filter-option").forEach(o => {
        o.classList.toggle("active", selectedCategories.has(o.dataset.category));
    });

}

function applyCategoryFromUrl() {

    const params = new URLSearchParams(location.search);

    const urlCategory = params.get("category");

    if (urlCategory) {

        const match = [...categoryOptionsList.querySelectorAll(".filter-option")]
            .find(o => o.dataset.category === urlCategory);

        if (match) {

            selectedCategories.add(urlCategory);

            updateCategoryUI();

        }

    }

}

categoryToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = categoryMenu.hidden;

    closeAllDropdowns();

    if (willOpen) {

        categoryMenu.hidden = false;
        categoryDropdown.classList.add("open");
        categorySearchInput.value = "";
        filterCategoryOptions("");
        categorySearchInput.focus();

    }

});

document.querySelector("[data-clear-category]")?.addEventListener("click", clearCategories);

function filterCategoryOptions(query) {

    const q = query.trim().toLowerCase();
    let visibleCount = 0;

    categoryOptionsList.querySelectorAll(".filter-option-group-title").forEach(title => {
        title.hidden = false;
    });

    categoryOptionsList.querySelectorAll(".filter-option").forEach(option => {

        const matches = option.dataset.category.toLowerCase().includes(q);

        option.hidden = !matches;

        if (matches) visibleCount++;

    });

    // ховаємо заголовки розділів, у яких після пошуку не лишилось жодної категорії
    let currentGroup = null;

    categoryOptionsList.querySelectorAll(".filter-option-group-title, .filter-option").forEach(el => {

        if (el.classList.contains("filter-option-group-title")) {

            if (currentGroup) currentGroup.hidden = currentGroup.hasVisible ? false : true;

            currentGroup = el;
            currentGroup.hasVisible = false;

        } else if (currentGroup && !el.hidden) {

            currentGroup.hasVisible = true;

        }

    });

    if (currentGroup) currentGroup.hidden = currentGroup.hasVisible ? false : true;

    if (categoryNoResults) categoryNoResults.hidden = q === "" || visibleCount !== 0;

}

categorySearchInput?.addEventListener("input", () => {

    filterCategoryOptions(categorySearchInput.value);

});

categorySearchInput?.addEventListener("click", event => event.stopPropagation());

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

// -------------------------
// Дропдаун «Розмір» (мультиселект, з групами)
// -------------------------

const sizeGroupsList = document.getElementById("sizeGroupsList");

function fillSizeGroups() {

    if (!sizeGroupsList) return;

    const presentCategories = new Set(products.map(product => product.category));

    sizeGroupsList.innerHTML = SIZE_GROUPS
        .filter(group => group.categories.some(c => presentCategories.has(c)))
        .map(group => `
            <div class="filter-size-group">
                <div class="filter-size-group-title">${group.title}</div>
                <div class="filter-size-chips">
                    ${group.sizes.map(size => `
                        <button type="button" class="filter-size-chip" data-group="${group.key}" data-size="${size}">${size}</button>
                    `).join("")}
                </div>
            </div>
        `)
        .join("");

}

sizeGroupsList?.addEventListener("click", event => {

    const chip = event.target.closest(".filter-size-chip");

    if (!chip) return;

    toggleSize(`${chip.dataset.group}:${chip.dataset.size}`);

});

function toggleSize(key) {

    if (selectedSizes.has(key)) {

        selectedSizes.delete(key);

    } else {

        selectedSizes.add(key);

    }

    updateSizeUI();

    render();

}

function clearSizes() {

    selectedSizes.clear();

    updateSizeUI();

    closeAllDropdowns();

    render();

}

function sizeKeyLabel(key) {

    const [groupKey, size] = key.split(":");

    const group = SIZE_GROUPS.find(g => g.key === groupKey);

    return group ? `${group.title} · ${size}` : size;

}

function updateSizeUI() {

    sizeLabel.textContent = getMultiSelectLabel(selectedSizes, DEFAULT_SIZE_LABEL, "Розмір", sizeKeyLabel);

    sizeMenu.querySelectorAll(".filter-size-chip").forEach(chip => {

        const key = `${chip.dataset.group}:${chip.dataset.size}`;

        chip.classList.toggle("active", selectedSizes.has(key));

    });

}

document.querySelector("[data-clear-size]")?.addEventListener("click", clearSizes);

sizeToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = sizeMenu.hidden;

    closeAllDropdowns();

    if (willOpen) {

        sizeMenu.hidden = false;
        sizeDropdown.classList.add("open");

    }

});

function closeAllDropdowns() {

    [sortDropdown, brandDropdown, colorDropdown, categoryDropdown, priceDropdown, sizeDropdown].forEach(dropdown => {

        if (!dropdown) return;

        const menu = dropdown.querySelector(".filter-menu, .sort-menu");

        if (menu) menu.hidden = true;

        dropdown.classList.remove("open");

    });

}

document.addEventListener("click", event => {

    if (event.target.closest("#sortDropdown, #brandDropdown, #colorDropdown, #categoryDropdown, #priceDropdown, #sizeDropdown")) return;

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

        crumbs.push(`<span class="crumb-sep">→</span>`, `<a href="catalog.html?section=new">Новинки</a>`);
        title = "Новинки";
        subtitle = "Останні надходження до каталогу Bagvero";

    } else if (currentSection === "sale") {

        crumbs.push(`<span class="crumb-sep">→</span>`, `<span class="sale-text">Акції</span>`);
        title = `<span class="sale-text">Акції</span>`;
        subtitle = `Знижки від ${SALE_MIN_DISCOUNT}% на сумки, рюкзаки та аксесуари`;

    } else {

        crumbs.push(`<span class="crumb-sep">→</span>`, `<a href="catalog.html">Каталог</a>`);

    }

    if (currentGender) {

        crumbs.push(`<span class="crumb-sep">→</span>`, `<span>${currentGender}</span>`);
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

    if (selectedColors.size) {

        list = list.filter(product => {

            const productColorNames = new Set(getProductColors(product).keys());

            return [...selectedColors].some(color => productColorNames.has(color));

        });

    }

    if (selectedCategories.size) {

        list = list.filter(product =>
            selectedCategories.has(product.category)
        );

    }

    if (selectedPrices.size) {

        list = list.filter(product =>
            [...selectedPrices].some(range => matchesPriceRange(product, range))
        );

    }

    if (selectedSizes.size) {

        list = list.filter(product =>
            [...selectedSizes].some(key => matchesSizeKey(product, key))
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

    selectedColors.forEach(color => {

        chips.push({ type: "color", value: color, label: color });

    });

    selectedCategories.forEach(category => {

        chips.push({ type: "category", value: category, label: category });

    });

    selectedPrices.forEach(range => {

        chips.push({ type: "price", value: range, label: PRICE_RANGE_LABELS[range] });

    });

    selectedSizes.forEach(key => {

        chips.push({ type: "size", value: key, label: sizeKeyLabel(key) });

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

    } else if (type === "color") {

        selectedColors.delete(value);

        updateColorUI();

    } else if (type === "category") {

        selectedCategories.delete(value);

        updateCategoryUI();

    } else if (type === "price") {

        selectedPrices.delete(value);

        updatePriceUI();

    } else if (type === "size") {

        selectedSizes.delete(value);

        updateSizeUI();

    }

    render();

}

function resetAllFilters() {

    search.value = "";

    selectedBrands.clear();
    updateBrandUI();

    selectedColors.clear();
    updateColorUI();

    selectedCategories.clear();
    updateCategoryUI();

    selectedPrices.clear();
    updatePriceUI();

    selectedSizes.clear();
    updateSizeUI();

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
