let products = [];

const grid = document.getElementById("catalogGrid");
const search = document.getElementById("searchInput");
const brand = document.getElementById("brandFilter");

const sortToggle = document.getElementById("sortToggle");
const sortMenu = document.getElementById("sortMenu");
const sortLabel = document.getElementById("sortLabel");
const sortDropdown = document.getElementById("sortDropdown");

let currentSort = "";

const priceFilter = document.getElementById("priceFilter");

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

const GENDERS = ["Чоловікам", "Жінкам", "Унісекс", "Дітям"];
const SALE_MIN_DISCOUNT = 30; // % — мінімальна знижка для розділу "Акції"

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

function fillBrands() {

    const brands = [...new Set(products.map(product => product.brand))];

    brands.sort();

    brands.forEach(item => {

        brand.insertAdjacentHTML(
            "beforeend",
            `<option value="${item}">${item}</option>`
        );

    });

}

function applyBrandFromUrl() {

    const params = new URLSearchParams(location.search);

    const currentBrand = params.get("brand");

    if (currentBrand) {

        brand.value = currentBrand;

    }

}

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

    if (brand.value) {

        list = list.filter(product =>
            product.brand === brand.value
        );

    }

    if (priceFilter && priceFilter.value) {

        switch (priceFilter.value) {

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

}

function resetAllFilters() {

    search.value = "";

    brand.value = "";

    currentSort = "";

    if (sortLabel) sortLabel.textContent = "За замовчуванням";

    sortMenu?.querySelectorAll(".sort-option").forEach(o => {
        o.classList.toggle("active", o.dataset.sort === "");
    });

    if (priceFilter) {

        priceFilter.value = "";

    }

    currentGender = "";

    genderFilterEl?.querySelectorAll(".gender-pill").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.gender === "");
    });

    render();

}

resetBtn?.addEventListener("click", resetAllFilters);

clearBtn?.addEventListener("click", resetAllFilters);

search.addEventListener("input", render);

brand.addEventListener("change", render);

priceFilter?.addEventListener("change", render);

// -------------------------
// Кастомний дропдаун сортування
// -------------------------

sortToggle?.addEventListener("click", event => {

    event.stopPropagation();

    sortMenu.hidden = !sortMenu.hidden;

    sortDropdown?.classList.toggle("open", !sortMenu.hidden);

});

sortMenu?.querySelectorAll(".sort-option").forEach(option => {

    option.addEventListener("click", () => {

        currentSort = option.dataset.sort;

        sortLabel.textContent = option.dataset.label;

        sortMenu.querySelectorAll(".sort-option").forEach(o => o.classList.toggle("active", o === option));

        sortMenu.hidden = true;

        sortDropdown?.classList.remove("open");

        render();

    });

});

document.addEventListener("click", event => {

    if (sortMenu && !sortMenu.hidden && !event.target.closest("#sortDropdown")) {

        sortMenu.hidden = true;

        sortDropdown?.classList.remove("open");

    }

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
