let products = [];

const grid = document.getElementById("catalogGrid");
const search = document.getElementById("searchInput");

// плавний скрол до першого товару в каталозі — викликається
// після застосування фільтрів (мобільна шторка "Всі фільтри"
// та десктопні випадаючі списки), щоб користувач одразу бачив
// оновлений результат
// "Захисне вікно" часу, протягом якого автоприховування при скролі
// (і sticky-панелі фільтрів, і відкритого дропдауна) має ігнорувати
// напрямок скролу. Потрібне через те, що scrollToFirstProduct()
// сама викликає window.scrollTo({behavior:"smooth"}) — а для логіки
// автоприховування це виглядає як звичайний скрол users вниз, і
// панель/список ховаються рівно в момент, коли товари щойно
// з'явились на екрані (класичний сценарій: стояли зверху сторінки,
// застосували фільтр — і фільтри одразу зникають).
let autoScrollGuardUntil = 0;

function isAutoScrollGuardActive() {

    return Date.now() < autoScrollGuardUntil;

}

function armAutoScrollGuard(durationMs) {

    autoScrollGuardUntil = Date.now() + durationMs;

    // 'scrollend' підтримують усі сучасні браузери (Chrome/Edge/
    // Firefox з 2023, Safari з 17) — знімаємо захист достроково,
    // щойно сама анімація скролу реально завершилась, а не чекаємо
    // повний таймаут. Для браузерів без підтримки просто спрацює
    // таймаут нижче.
    if ("onscrollend" in window) {

        window.addEventListener("scrollend", () => {
            autoScrollGuardUntil = 0;
        }, { once: true });

    }

}

// Позиція, на якій починаються результати каталогу — рядок
// ".catalog-top" ("Знайдено N товарів" + сортування), а не сама
// перша картка: так одразу видно і кількість знайдених товарів,
// і початок першої картки під ним. Винесено окремо, бо цю ж
// позицію перевіряє обробник поля пошуку.
function getResultsScrollTop() {

    if (!grid) return 0;

    const catalogTop = document.querySelector(".catalog-top");
    const firstCard = grid.querySelector(".product-card");
    const target = catalogTop || firstCard || grid;

    const headerEl = document.querySelector("header");
    const mobileBar = document.querySelector(".mobile-filter-bar");
    const desktopBar = document.querySelector(".catalog-filters-bar");

    let offset = headerEl ? headerEl.offsetHeight : 0;

    if (mobileBar && getComputedStyle(mobileBar).display !== "none") {
        offset += mobileBar.offsetHeight;
    }

    // на десктопі панель фільтрів теж sticky — без цього запасу
    // вона накриє собою рядок "Знайдено N товарів"
    if (desktopBar && getComputedStyle(desktopBar).display !== "none") {
        offset += desktopBar.offsetHeight;
    }

    offset += 16;

    return Math.max(target.getBoundingClientRect().top + window.scrollY - offset, 0);

}

function scrollToFirstProduct() {

    if (!grid) return;

    const top = getResultsScrollTop();

    // захист озброюємо лише якщо реально є куди скролити — інакше
    // (ціль уже на екрані) 'scrollend' не спрацює жодного разу і
    // прапорець завис би увімкненим назавжди, блокуючи приховування
    // панелі при звичайному подальшому скролі користувача
    if (Math.abs(top - window.scrollY) > 4) {

        // 900ms — з запасом понад типову тривалість плавного скролу
        // на дистанції в межах каталогу; 'scrollend' зазвичай знімає
        // захист набагато раніше цього таймауту
        armAutoScrollGuard(900);

    }

    window.scrollTo({ top, behavior: "smooth" });

}

// застосування будь-якого фільтра: перемальовуємо каталог і
// одразу підкручуємо сторінку до результатів
function applyFilterChange() {

    // Будь-яка зміна фільтра повертає на першу сторінку: інакше
    // користувач, стоячи на 3-й сторінці, звузив би вибірку до двох
    // товарів і побачив порожнечу замість результату.
    currentPage = 1;

    render();

    // у мобільній шторці "Всі фільтри" скрол не потрібен — там
    // результат застосовує кнопка "Показати N товарів", яка сама
    // викликає scrollToFirstProduct() після закриття шторки
    if (document.body.classList.contains("mobile-filters-open")) return;

    scrollToFirstProduct();

}

const sortToggle = document.getElementById("sortToggle");
const sortMenu = document.getElementById("sortMenu");
const sortLabel = document.getElementById("sortLabel");
const sortDropdown = document.getElementById("sortDropdown");

let currentSort = "";
let selectedBrands = new Set();
let selectedColors = new Set();
let selectedCategories = new Set();

// Відділ («Аксесуари», «Сумки») — рівень над категорією. Окремий стан,
// а не розгортання у список категорій: інакше посилання з хлібних
// крихт виглядало б як catalog?category=<десять назв через кому> —
// 700 символів, які ще й змінюються щоразу, коли в адмінці додають
// категорію. З ним у крихтах стоїть коротке catalog?department=Аксесуари.
let selectedDepartments = new Set();
let departmentByCategory = new Map();
// фільтр ціни — діапазон "від / до" (повзунок + два поля вводу).
// null означає "ще не ініціалізовано" — межі підставляються з
// реальних цін каталогу після його завантаження
let priceRange = { min: null, max: null };
let priceBounds = { min: 0, max: 0 };
let selectedSizes = new Set(); // елементи виду "group:size", напр. "bags:S"

// колір товару (для фільтра) — беремо прямо з variants,
// де hex вже заданий в адмінці; це й головне джерело правди
// для свотчів у фільтрі "Колір"
// Групи розмірів приходять з адмінки (розділ «Розміри» →
// data/size-groups.json). До завантаження працює вбудований
// запасний набір з common.js, тож фільтр не ламається.
let SIZE_GROUPS = FALLBACK_SIZE_GROUPS.map(group => ({ ...group }));

// підтягує актуальний список категорій одягу/взуття з адмінки
// (data/categories.json) у відповідні групи розмірів
function applyCategoryDataToSizeGroups(categoryDepartments) {

    // У групі можна або перелічити категорії вручну, або вказати
    // розділ — тоді підхоплюються ВСІ його категорії, включно з
    // тими, які додадуть в адмінку пізніше.
    SIZE_GROUPS.forEach(group => {

        group.categories = resolveGroupCategories(group, categoryDepartments);

    });

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

    // розміри можуть бути задані окремо для кожного кольору —
    // товар підходить, якщо потрібний розмір є хоча б в одному
    return group.categories.includes(product.category)
        && getAllProductSizes(product).includes(size);

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
const DEFAULT_BRAND_LABEL = "Бренд";
const DEFAULT_COLOR_LABEL = "Колір";
const DEFAULT_CATEGORY_LABEL = "Категорія";
const DEFAULT_PRICE_LABEL = "Ціна";
const DEFAULT_SIZE_LABEL = "Розмір";

// Ціна без копійок і з розділювачем тисяч, БЕЗ "грн" — тільки для
// підписів повзунка ціни ("850 — 31 990 грн").
//
// НАЗВА НАВМИСНО ІНША, НЕ formatPrice.
// ui.js і catalog.js — звичайні <script>, не модулі, тож
// оголошення верхнього рівня в обох потрапляють в один спільний
// window. catalog.js підключається ПІСЛЯ ui.js (див. catalog.html),
// і якби тут теж була function formatPrice(...), вона мовчки
// ПЕРЕЗАПИСАЛА б версію з ui.js (та сама форматує ціну картки
// товару, з "грн" в кінці) — картки каталогу лишились би зовсім
// без валюти. Саме так і сталось: ця колізія — справжня причина
// "нема грн", а не CSS.
function formatPriceShort(value) {

    return Math.round(value).toLocaleString("uk-UA").replace(/\u00A0/g, " ");

}

// фільтр вважається активним, тільки якщо користувач реально
// звузив діапазон відносно меж каталогу
function priceFilterActive() {

    if (priceRange.min === null || priceRange.max === null) return false;

    return priceRange.min > priceBounds.min || priceRange.max < priceBounds.max;

}

function priceRangeLabel() {

    const from = priceRange.min !== null ? priceRange.min : priceBounds.min;
    const to = priceRange.max !== null ? priceRange.max : priceBounds.max;

    return `${formatPriceShort(from)} – ${formatPriceShort(to)} грн`;

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
let selectedGenders = new Set(); // підмножина GENDERS

// Читання множинного параметра: "a,b,c" → Set.
// allowed передаємо там, де значення заздалегідь відомі (стать), —
// щоб підроблена адреса не заводила в фільтр сміття. Для брендів,
// категорій і кольорів список приходить з даних, тож там перевірка
// відбувається пізніше, коли ці дані вже завантажені.
function readSetParam(params, key, allowed) {

    const raw = params.get(key);

    if (!raw) return new Set();

    const values = raw.split(",").map(v => v.trim()).filter(Boolean);

    return new Set(allowed ? values.filter(v => allowed.includes(v)) : values);

}

// Число з адреси або null, якщо параметра немає.
//
// ПАСТКА, ЧЕРЕЗ ЯКУ КАТАЛОГ ВІДКРИВАВСЯ ПОРОЖНІМ
// -----------------------------------------------
// Спершу тут стояло просто Number(params.get(key)). Коли параметра в
// адресі немає, get() повертає null, а Number(null) — це 0, і перевірка
// isFinite && >= 0 його спокійно пропускала.
//
// Тобто на КОЖНОМУ чистому відкритті каталогу priceRange.max ставав
// нулем. Далі setupPriceRange() затискав діапазон межами асортименту:
//   min = Math.max(0, 4000) = 4000
//   max = Math.min(0, 9000) = 0
// Виходив діапазон «4 000 – 0 грн», під який не підходить жоден товар,
// — каталог, новинки й акції показували «Знайдено 0 товарів». А
// syncStateToUrl() бачив max, що не дорівнює межі, вважав його
// зміненим вручну й закріплював у адресі як ?priceMax=0.
//
// Тому порожній параметр перевіряємо ДО перетворення в число.
function readNumberParam(params, key) {

    const raw = params.get(key);

    if (raw === null || raw.trim() === "") return null;

    const value = Number(raw);

    return Number.isFinite(value) && value >= 0 ? value : null;

}

function readUrlState() {

    const params = new URLSearchParams(location.search);

    const section = params.get("section");
    currentSection = (section === "new" || section === "sale") ? section : "";

    selectedGenders = readSetParam(params, "gender", GENDERS);

    // Решта фільтрів раніше з адреси не читалась зовсім (крім brand і
    // category, і то лише поодинокими значеннями). Через це скопійоване
    // посилання відкривалось із порожнім фільтром.
    selectedDepartments = readSetParam(params, "department");
    selectedColors = readSetParam(params, "color");
    selectedSizes = readSetParam(params, "size");

    const sort = params.get("sort");
    currentSort = sort || "";

    const min = readNumberParam(params, "priceMin");
    const max = readNumberParam(params, "priceMax");

    if (min !== null) priceRange.min = min;
    if (max !== null) priceRange.max = max;

}

async function initCatalog() {

    // сторінка з адреси — щоб надіслане посилання відкривалось там,
    // де його скопіювали, і «Назад» повертав на ту саму сторінку
    // через readNumberParam, а не Number(...): тут 0 не шкодив лише
    // тому, що не проходив умову > 1 — але тримати ще одну копію
    // тієї самої пастки поруч не варто (див. readNumberParam)
    const pageParam = readNumberParam(new URLSearchParams(location.search), "page");

    if (pageParam !== null && pageParam > 1) currentPage = pageParam;


    readUrlState();

    try {

        loader.hidden = false;

        const response = await fetch("data/products.json");

        if (!response.ok) {
            throw new Error("Не вдалося завантажити товари");
        }

        products = await response.json();

        const categoryDepartments = await loadCategoryDepartments();

        // групи розмірів з адмінки — до побудови фільтра «Розмір»
        SIZE_GROUPS = (await loadSizeGroups()).map(group => ({ ...group }));

        applyCategoryDataToSizeGroups(categoryDepartments);

        // мапа «категорія → відділ» для фільтра department
        departmentByCategory = new Map();
        categoryDepartments.forEach(group => {
            (group.categories || []).forEach(name => departmentByCategory.set(name, group.title));
        });

        // відділ з адреси лишаємо, лише якщо він справді існує:
        // застаріле посилання інакше давало б порожній каталог
        [...selectedDepartments].forEach(name => {
            if (![...departmentByCategory.values()].includes(name)) selectedDepartments.delete(name);
        });

        fillBrands();

        applyBrandFromUrl();

        fillColors();

        fillCategories(categoryDepartments);

        fillCatalogSidebar(categoryDepartments);

        applyCategoryFromUrl();

        fillSizeGroups();

        applySearchFromUrl();

        setupGenderFilter();

        // Колір, розмір і сортування readUrlState() уже поклав у стан,
        // але вигляд фільтрів будується пізніше — після fillColors() і
        // fillSizeGroups(). Без цього кроку товари відфільтровані, а
        // самі фільтри виглядають незайманими: людина не розуміє, чому
        // видно лише частину каталогу, і не має що скинути.
        applyUiFromUrlState();

        renderBreadcrumbsAndTitle();

        highlightNavLink();

        render();

        bindCatalogReturnTracking();

        // після першого рендера — сітка вже існує, є куди прокручувати
        restoreCatalogPosition();

        renderRecentlyViewed();

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

    applyFilterChange();

}

function clearBrands() {

    selectedBrands.clear();

    updateBrandUI();

    closeAllDropdowns();

    applyFilterChange();

}

// -------------------------
// «Звужувальні» фільтри (facets)
//
// Після вибору будь-якого фільтра в решті лишаються тільки ті
// значення, які реально ще можна знайти. Наприклад, обрали
// категорію «Кросівки» — у розмірах зникають розміри сумок,
// у кольорах лишаються лише кольори кросівок.
//
// Для кожного виміру рахуємо доступні значення на товарах,
// відфільтрованих усіма ІНШИМИ вимірами (filterProducts(skip)) —
// інакше, наприклад, у списку кольорів лишився б рівно один,
// уже обраний, колір.
// -------------------------

function availableFacets() {

    const forBrands = filterProducts("brands");
    const forColors = filterProducts("colors");
    const forSizes = filterProducts("sizes");
    const forGenders = filterProducts("gender");
    const forCategories = filterProducts("categories");

    const colors = new Set();

    forColors.forEach(product => {

        getProductColors(product).forEach((hex, name) => colors.add(name));

    });

    const sizes = new Set();

    forSizes.forEach(product => {

        SIZE_GROUPS.forEach(group => {

            if (!group.categories.includes(product.category)) return;

            getAllProductSizes(product).forEach(size => sizes.add(`${group.key}:${size}`));

        });

    });

    return {
        brands: new Set(forBrands.map(p => p.brand).filter(Boolean)),
        colors,
        sizes,
        genders: new Set(forGenders.flatMap(p => getProductGenders(p))),
        categories: new Set(forCategories.map(p => p.category).filter(Boolean))
    };

}

// Позначаємо недоступні варіанти. Уже обраний варіант ніколи не
// ховаємо — інакше його неможливо було б зняти.
function markAvailability(element, isAvailable, isSelected) {

    element.classList.toggle("unavailable", !isAvailable && !isSelected);

}

function updateBrandUI() {

    brandLabel.textContent = getMultiSelectLabel(selectedBrands, DEFAULT_BRAND_LABEL, "Бренди");

    const available = availableFacets();

    brandOptionsList.querySelectorAll(".filter-option").forEach(o => {

        const selected = selectedBrands.has(o.dataset.brand);

        o.classList.toggle("active", selected);

        markAvailability(o, available.brands.has(o.dataset.brand), selected);

    });

}

function applySearchFromUrl() {

    const params = new URLSearchParams(location.search);

    const urlSearch = params.get("search");

    if (urlSearch) {

        search.value = urlSearch;

    }

}

// Бренди з адреси. Раніше бралось лише ОДНЕ значення (?brand=Guess),
// тож посилання з кількома брендами відкривалось із першим або взагалі
// без фільтра. Тепер читаємо список і лишаємо тільки ті, що справді
// існують у завантажених даних — інакше в активних фільтрах висів би
// бренд, якого немає, і скинути його було б нічим.
function applyBrandFromUrl() {

    const wanted = readSetParam(new URLSearchParams(location.search), "brand");

    if (!wanted.size) return;

    const known = new Set([...brandOptionsList.querySelectorAll(".filter-option")]
        .map(o => o.dataset.brand));

    let added = false;

    wanted.forEach(brand => {
        if (known.has(brand)) { selectedBrands.add(brand); added = true; }
    });

    if (added) updateBrandUI();

}

brandToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = brandMenu.hidden;

    closeAllDropdowns();

    if (willOpen) {

        openDropdownMenu(brandDropdown, brandMenu);
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

    applyFilterChange();

}

function clearColors() {

    selectedColors.clear();

    updateColorUI();

    closeAllDropdowns();

    applyFilterChange();

}

function updateColorUI() {

    colorLabel.textContent = getMultiSelectLabel(selectedColors, DEFAULT_COLOR_LABEL, "Кольори");

    const available = availableFacets();

    colorOptionsList.querySelectorAll(".filter-option").forEach(o => {

        const selected = selectedColors.has(o.dataset.color);

        o.classList.toggle("active", selected);

        markAvailability(o, available.colors.has(o.dataset.color), selected);

    });

}

document.querySelector("[data-clear-color]")?.addEventListener("click", clearColors);

colorToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = colorMenu.hidden;

    closeAllDropdowns();

    if (willOpen) openDropdownMenu(colorDropdown, colorMenu);

});

// -------------------------
// Дропдаун «Категорія» (з пошуком, згруповано по розділах)
// -------------------------

// Спільне дерево «розділ → категорії з кількістю товарів» для
// дропдауна фільтра і бокового меню каталогу.
//
// Головні правила:
// - показуються ЛИШЕ категорії, у яких зараз є хоча б один товар
//   (з'явився товар нової категорії — пункт додається сам, зник
//   останній — пункт ховається);
// - розділи без жодної непорожньої категорії не виводяться взагалі;
// - категорії, яких немає в довіднику data/categories.json (напр.,
//   довільне значення з Excel-імпорту), не губляться — вони
//   збираються в окрему групу «Інше», щоб товар завжди можна було
//   знайти через навігацію.
// Товари в межах поточного розділу сторінки: Новинки, Акції або
// весь каталог. Саме на цьому наборі мають будуватись бокове меню,
// список у дропдауні «Категорія» і межі повзунка ціни — інакше на
// /catalog?section=new вони показують весь каталог (21 товар і
// категорії, у яких новинок немає), хоча в сітці лише 8 новинок.
function sectionProducts() {

    if (currentSection === "new") {

        return products.filter(product => product.isNew);

    }

    if (currentSection === "sale") {

        return products.filter(product => {

            if (!product.oldPrice) return false;

            return (1 - product.price / product.oldPrice) * 100 >= SALE_MIN_DISCOUNT;

        });

    }

    return products;

}

function buildCategoryTree(categoryDepartments, sourceProducts) {

    const counts = new Map();

    (sourceProducts || products).forEach(product => {

        if (!product.category) return;

        counts.set(product.category, (counts.get(product.category) || 0) + 1);

    });

    const known = new Set();
    const tree = [];

    (categoryDepartments || []).forEach(department => {

        const categories = department.categories
            .filter(name => {
                known.add(name);
                return counts.has(name);
            })
            .map(name => ({ name, count: counts.get(name) }));

        if (categories.length) tree.push({ title: department.title, categories });

    });

    const unknown = [...counts.keys()]
        .filter(name => !known.has(name))
        .sort((a, b) => a.localeCompare(b, "uk"))
        .map(name => ({ name, count: counts.get(name) }));

    if (unknown.length) tree.push({ title: "Інше", categories: unknown });

    return tree;

}

function fillCategories(categoryDepartments) {

    if (!categoryOptionsList) return;

    buildCategoryTree(categoryDepartments, sectionProducts()).forEach(department => {

        const groupTitle = document.createElement("div");
        groupTitle.className = "filter-option-group-title";
        groupTitle.textContent = department.title;

        categoryOptionsList.appendChild(groupTitle);

        department.categories.forEach(({ name }) => {

            const option = document.createElement("button");

            option.type = "button";
            option.className = "filter-option";
            option.dataset.category = name;
            option.innerHTML = `<span class="filter-checkbox"></span>${escapeHtml(name)}`;

            option.addEventListener("click", () => toggleCategory(name));

            categoryOptionsList.appendChild(option);

        });

    });

}

// -------------------------
// Бокове дерево категорій зліва від сітки (лише десктоп) —
// той самий buildCategoryTree, але у вигляді постійно видимого
// меню зі счетчиками, як у великих магазинів
// -------------------------

const catalogSidebar = document.getElementById("catalogSidebar");

function fillCatalogSidebar(categoryDepartments) {

    if (!catalogSidebar) return;

    const scoped = sectionProducts();

    const tree = buildCategoryTree(categoryDepartments, scoped);

    if (!tree.length) {

        catalogSidebar.hidden = true;

        return;

    }

    const totalCount = scoped.length;

    let html = `
        <nav class="sidebar-tree" aria-label="Категорії каталогу">
            <button type="button" class="sidebar-all" data-sidebar-all>
                Всі товари
                <span class="sidebar-count">${totalCount}</span>
            </button>
    `;

    const expanded = readExpandedGroups();

    tree.forEach(department => {

        // За замовчуванням усі групи ЗГОРНУТІ (показують «+») —
        // розгортаються або кліком користувача (запам'ятовується),
        // або примусово, якщо всередині є обрана категорія: інакше
        // після переходу за посиланням з меню фільтр був би
        // застосований, а звідки він узявся — у меню не видно.
        const hasActive = department.categories.some(({ name }) => selectedCategories.has(name));
        const isCollapsed = !hasActive && !expanded.has(department.title);

        html += `<div class="sidebar-group${isCollapsed ? " collapsed" : ""}" data-sidebar-group="${escapeHtml(department.title)}">
            <button type="button" class="sidebar-group-title"
                    data-sidebar-group-toggle
                    aria-expanded="${isCollapsed ? "false" : "true"}">
                <span>${escapeHtml(department.title)}</span>
                <span class="sidebar-group-icon" aria-hidden="true"></span>
            </button>
            <div class="sidebar-group-body">`;

        department.categories.forEach(({ name, count }) => {

            html += `
                <button type="button" class="sidebar-category" data-sidebar-category="${escapeHtml(name)}">
                    ${escapeHtml(name)}
                    <span class="sidebar-count">${count}</span>
                </button>
            `;

        });

        html += `</div></div>`;

    });

    html += `</nav>`;

    catalogSidebar.innerHTML = html;
    catalogSidebar.hidden = false;

    catalogSidebar.querySelector("[data-sidebar-all]").addEventListener("click", () => {

        selectedCategories.clear();

        updateCategoryUI();

        applyFilterChange();

    });

    catalogSidebar.querySelectorAll("[data-sidebar-category]").forEach(button => {

        button.addEventListener("click", () => toggleCategory(button.dataset.sidebarCategory));

    });

    catalogSidebar.querySelectorAll("[data-sidebar-group-toggle]").forEach(button => {

        button.addEventListener("click", () => {

            const group = button.closest(".sidebar-group");
            const nowCollapsed = group.classList.toggle("collapsed");

            button.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");

            const saved = readExpandedGroups();

            if (nowCollapsed) {
                saved.delete(group.dataset.sidebarGroup);
            } else {
                saved.add(group.dataset.sidebarGroup);
            }

            saveExpandedGroups(saved);

        });

    });

    updateSidebarActive();

}

// Які групи бокового меню користувач РОЗГОРНУВ. Зберігаємо між
// сторінками, щоб вибір не скидався при кожному переході в каталозі.
//
// Ключ навмисно новий (…-expanded замість …-collapsed): у попередній
// версії за замовчуванням усе було розгорнуто і зберігався
// протилежний набір — згорнуті групи. Якби ключ лишився той самий,
// старе збережене значення прочиталось би навпаки.
// Ключ НАВМИСНО лишається зі старою назвою (bagvero:).
// Це ідентифікатор у localStorage відвідувача — він ніде не
// показується. Перейменування скинуло б збережений стан у всіх, хто
// вже заходив на сайт: розгорнуті групи в сайдбарі поїхали б за
// замовчуванням. Користі — нуль, тож не чіпаємо.
const SIDEBAR_EXPANDED_KEY = "bagvero:sidebar-expanded";

function readExpandedGroups() {

    try {

        const raw = localStorage.getItem(SIDEBAR_EXPANDED_KEY);

        return new Set(raw ? JSON.parse(raw) : []);

    } catch (error) {

        // приватний режим або зіпсоване значення — не критично,
        // просто лишаємо все згорнутим
        return new Set();

    }

}

function saveExpandedGroups(groups) {

    try {

        localStorage.setItem(SIDEBAR_EXPANDED_KEY, JSON.stringify([...groups]));

    } catch (error) {

        // сховище недоступне — стан просто не переживе перезавантаження

    }

}

// Перерахунок лічильників у боковому меню під поточні фільтри.
//
// Саме меню будується один раз із усіх категорій розділу (щоб при
// знятті фільтра було що показати назад), а тут лише оновлюються
// числа й ховаються категорії, у яких за поточних фільтрів нічого
// не лишилось. Раніше меню враховувало лише розділ і після вибору
// статі «Чоловікам» показувало «Всі товари 21» та жіночі категорії,
// хоча в сітці було 2 товари.
//
// База — filterProducts("categories"), тобто ВСІ фільтри, крім
// вибору самої категорії: інакше після кліку по категорії меню
// схлопнулось би до єдиного пункту і перемкнутись було б нікуди.
function refreshSidebarCounts() {

    if (!catalogSidebar || catalogSidebar.hidden) return;

    const base = filterProducts("categories");

    const counts = new Map();

    base.forEach(product => {

        if (!product.category) return;

        counts.set(product.category, (counts.get(product.category) || 0) + 1);

    });

    const allButton = catalogSidebar.querySelector("[data-sidebar-all] .sidebar-count");

    if (allButton) allButton.textContent = base.length;

    catalogSidebar.querySelectorAll("[data-sidebar-category]").forEach(button => {

        const name = button.dataset.sidebarCategory;
        const count = counts.get(name) || 0;
        const selected = selectedCategories.has(name);

        const countEl = button.querySelector(".sidebar-count");

        if (countEl) countEl.textContent = count;

        // обрану категорію не ховаємо навіть при нулі — інакше її
        // неможливо було б зняти
        button.classList.toggle("unavailable", count === 0 && !selected);

    });

    // група ховається цілком, якщо в ній не лишилось жодної категорії
    catalogSidebar.querySelectorAll(".sidebar-group").forEach(group => {

        const items = [...group.querySelectorAll("[data-sidebar-category]")];

        group.classList.toggle(
            "unavailable",
            items.length > 0 && items.every(item => item.classList.contains("unavailable"))
        );

    });

}

function updateSidebarActive() {

    if (!catalogSidebar) return;

    const allButton = catalogSidebar.querySelector("[data-sidebar-all]");

    if (allButton) allButton.classList.toggle("active", selectedCategories.size === 0);

    catalogSidebar.querySelectorAll("[data-sidebar-category]").forEach(button => {

        const isActive = selectedCategories.has(button.dataset.sidebarCategory);

        button.classList.toggle("active", isActive);

        // якщо категорію обрали не з бокового меню (дропдаун, чіп,
        // посилання з шапки) — розгортаємо групу, щоб підсвічений
        // пункт не лишився захованим усередині згорнутої групи
        if (isActive) {

            const group = button.closest(".sidebar-group");

            if (group?.classList.contains("collapsed")) {

                group.classList.remove("collapsed");
                group.querySelector("[data-sidebar-group-toggle]")?.setAttribute("aria-expanded", "true");

            }

        }

    });

}

function toggleCategory(value) {

    if (selectedCategories.has(value)) {

        selectedCategories.delete(value);

    } else {

        selectedCategories.add(value);

    }

    updateCategoryUI();

    applyFilterChange();

}

function clearCategories() {

    selectedCategories.clear();

    updateCategoryUI();

    closeAllDropdowns();

    applyFilterChange();

}

function updateCategoryUI() {

    categoryLabel.textContent = getMultiSelectLabel(selectedCategories, DEFAULT_CATEGORY_LABEL, "Категорії");

    const available = availableFacets();

    categoryOptionsList.querySelectorAll(".filter-option").forEach(o => {

        const selected = selectedCategories.has(o.dataset.category);

        o.classList.toggle("active", selected);

        markAvailability(o, available.categories.has(o.dataset.category), selected);

    });

    // бокове дерево категорій підсвічує той самий вибір
    updateSidebarActive();

}

// Показати в інтерфейсі те, що прийшло з адреси.
//
// readUrlState() виконується на самому початку, ще до того, як
// побудовані списки кольорів і розмірів, тож підсвітити вибране там
// нема де. Викликаємо це після заповнення фільтрів.
//
// Заразом викидаємо значення, яких у даних немає: у посиланні міг
// лишитись колір знятого з продажу товару, і тоді каталог показував би
// порожньо без жодного видимого фільтра.
function applyUiFromUrlState() {

    const keepKnown = (set, nodes, attr) => {

        if (!set.size || !nodes) return false;

        const known = new Set([...nodes].map(node => node.dataset[attr]));

        [...set].forEach(value => { if (!known.has(value)) set.delete(value); });

        return true;

    };

    if (keepKnown(selectedColors, colorOptionsList?.querySelectorAll(".filter-option"), "color")) {
        updateColorUI();
    }

    if (selectedSizes.size) {
        updateSizeUI();
    }

    if (currentSort) {

        const option = sortMenu?.querySelector(`.sort-option[data-sort="${CSS.escape(currentSort)}"]`);

        if (option) {

            if (sortLabel) sortLabel.textContent = option.dataset.label;

            sortMenu.querySelectorAll(".sort-option")
                .forEach(o => o.classList.toggle("active", o === option));

        } else {

            currentSort = "";   // невідоме сортування з підробленої адреси

        }

    }

}

// Категорії з адреси — так само списком, а не одним значенням.
// Це те саме бічне меню каталогу: воно керує selectedCategories, тож
// вибір розділу тепер теж переживає копіювання посилання й «Назад».
function applyCategoryFromUrl() {

    const wanted = readSetParam(new URLSearchParams(location.search), "category");

    if (!wanted.size) return;

    const known = new Set([...categoryOptionsList.querySelectorAll(".filter-option")]
        .map(o => o.dataset.category));

    let added = false;

    wanted.forEach(category => {
        if (known.has(category)) { selectedCategories.add(category); added = true; }
    });

    if (added) updateCategoryUI();

}

categoryToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = categoryMenu.hidden;

    closeAllDropdowns();

    if (willOpen) {

        openDropdownMenu(categoryDropdown, categoryMenu);
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
// Дропдаун «Ціна» — повзунок діапазону "від / до"
//
// Розмітка повзунка будується тут, у JS, а не в catalog.html /
// promo.html — щоб обидві сторінки автоматично отримали однаковий
// фільтр, а межі діапазону підставились з реальних цін каталогу.
// -------------------------

let priceUI = null;

// крок повзунка підбираємо під розмах цін, щоб ручка рухалась
// плавно, але значення лишались "круглими"
function priceStep(span) {

    if (span > 20000) return 100;
    if (span > 5000) return 50;
    if (span > 1000) return 10;

    return 1;

}

function buildPriceUI() {

    if (!priceMenu) return;

    const clearBtn = priceMenu.querySelector("[data-clear-price]");

    priceMenu.innerHTML = "";

    if (clearBtn) priceMenu.appendChild(clearBtn);

    const box = document.createElement("div");

    box.className = "price-range";

    box.innerHTML = `
        <div class="price-range-slider">
            <div class="price-range-track"></div>
            <div class="price-range-fill"></div>
            <input type="range" class="price-range-input price-range-min" aria-label="Ціна від">
            <input type="range" class="price-range-input price-range-max" aria-label="Ціна до">
        </div>
        <div class="price-range-fields">
            <label class="price-range-field">
                <input type="text" inputmode="numeric" class="price-range-number price-range-number-min" aria-label="Ціна від">
                <span class="price-range-suffix">грн</span>
            </label>
            <span class="price-range-dash">—</span>
            <label class="price-range-field">
                <input type="text" inputmode="numeric" class="price-range-number price-range-number-max" aria-label="Ціна до">
                <span class="price-range-suffix">грн</span>
            </label>
        </div>
    `;

    priceMenu.appendChild(box);

    priceUI = {
        box,
        fill: box.querySelector(".price-range-fill"),
        rangeMin: box.querySelector(".price-range-min"),
        rangeMax: box.querySelector(".price-range-max"),
        numberMin: box.querySelector(".price-range-number-min"),
        numberMax: box.querySelector(".price-range-number-max")
    };

    // клік усередині повзунка не має закривати дропдаун
    box.addEventListener("click", event => event.stopPropagation());

    // тягнемо ручку — числа під повзунком оновлюються миттєво,
    // а сам каталог перемальовується вже на відпусканні, щоб не
    // рендерити сітку на кожен піксель руху
    [priceUI.rangeMin, priceUI.rangeMax].forEach(input => {

        input.addEventListener("input", () => {

            readPriceSliders();
            paintPriceUI();

        });

        input.addEventListener("change", () => {

            readPriceSliders();
            updatePriceUI();
            applyFilterChange();

        });

    });

    [priceUI.numberMin, priceUI.numberMax].forEach(input => {

        input.addEventListener("change", commitPriceNumbers);

        input.addEventListener("keydown", event => {

            if (event.key === "Enter") {

                event.preventDefault();

                input.blur();

            }

        });

    });

}

function readPriceSliders() {

    if (!priceUI) return;

    let min = Number(priceUI.rangeMin.value);
    let max = Number(priceUI.rangeMax.value);

    // ручки не мають "перестрибувати" одна одну — та, за яку
    // зараз тягнуть, штовхає другу перед собою
    if (min > max) {

        if (document.activeElement === priceUI.rangeMin) {
            max = min;
        } else {
            min = max;
        }

    }

    priceRange.min = min;
    priceRange.max = max;

}

function parsePriceInput(value, fallback) {

    const digits = String(value).replace(/[^\d]/g, "");

    if (!digits) return fallback;

    return Number(digits);

}

function commitPriceNumbers() {

    if (!priceUI) return;

    let min = parsePriceInput(priceUI.numberMin.value, priceBounds.min);
    let max = parsePriceInput(priceUI.numberMax.value, priceBounds.max);

    min = Math.min(Math.max(min, priceBounds.min), priceBounds.max);
    max = Math.min(Math.max(max, priceBounds.min), priceBounds.max);

    // ввели "від" більше за "до" — просто міняємо місцями,
    // це майже завжди саме те, що людина мала на увазі
    if (min > max) {

        const swap = min;

        min = max;
        max = swap;

    }

    priceRange.min = min;
    priceRange.max = max;

    updatePriceUI();

    applyFilterChange();

}

// перемальовує сам повзунок і поля під ним під поточний стан
function paintPriceUI() {

    if (!priceUI) return;

    const min = priceRange.min !== null ? priceRange.min : priceBounds.min;
    const max = priceRange.max !== null ? priceRange.max : priceBounds.max;

    priceUI.rangeMin.value = min;
    priceUI.rangeMax.value = max;

    // поле, яке зараз редагують, не чіпаємо — інакше форматування
    // з'їдало б цифри прямо під час набору
    if (document.activeElement !== priceUI.numberMin) {
        priceUI.numberMin.value = formatPriceShort(min);
    }

    if (document.activeElement !== priceUI.numberMax) {
        priceUI.numberMax.value = formatPriceShort(max);
    }

    const span = priceBounds.max - priceBounds.min || 1;

    const left = ((min - priceBounds.min) / span) * 100;
    const right = ((max - priceBounds.min) / span) * 100;

    priceUI.fill.style.left = left + "%";
    priceUI.fill.style.width = Math.max(right - left, 0) + "%";

    // коли обидві ручки зійшлись у правому краї, верхня перекриває
    // нижню — піднімаємо ту, за яку ще реально можна взятись
    priceUI.rangeMin.style.zIndex = min >= priceBounds.max ? 5 : 3;

}

// межі беремо з реальних цін каталогу один раз, після його
// завантаження — далі вони не залежать від інших фільтрів,
// інакше повзунок "стрибав" би після кожного вибору
function setupPriceRange() {

    if (!priceMenu || !products.length) return;

    const prices = sectionProducts()
        .map(product => Number(product.price))
        .filter(value => Number.isFinite(value));

    if (!prices.length) return;

    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);

    const step = priceStep(rawMax - rawMin);

    priceBounds.min = Math.floor(rawMin / step) * step;
    priceBounds.max = Math.ceil(rawMax / step) * step;

    if (priceBounds.max === priceBounds.min) priceBounds.max = priceBounds.min + step;

    if (!priceUI) buildPriceUI();

    [priceUI.rangeMin, priceUI.rangeMax].forEach(input => {

        input.min = priceBounds.min;
        input.max = priceBounds.max;
        input.step = step;

    });

    // якщо межі ще не чіпали — розтягуємо діапазон на весь каталог
    if (priceRange.min === null) priceRange.min = priceBounds.min;
    if (priceRange.max === null) priceRange.max = priceBounds.max;

    priceRange.min = Math.max(priceRange.min, priceBounds.min);
    priceRange.max = Math.min(priceRange.max, priceBounds.max);

    updatePriceUI();

}

// Скидання діапазону ціни до повного.
//
// Якщо межі ще невідомі (товари не завантажились), НЕ ставимо 0–0:
// priceFilterActive() вважав би такий діапазон звуженим (0 < max),
// фільтр відкинув би геть усі товари, і каталог показав би порожньо.
// Лишаємо null — setupPriceRange() потім виставить справжні межі.
function resetPriceRange() {

    if (priceBounds.max > priceBounds.min) {

        priceRange.min = priceBounds.min;
        priceRange.max = priceBounds.max;

    } else {

        priceRange.min = null;
        priceRange.max = null;

    }

}

function clearPrices() {

    resetPriceRange();

    updatePriceUI();

    closeAllDropdowns();

    applyFilterChange();

}

function updatePriceUI() {

    if (priceLabel) {

        priceLabel.textContent = priceFilterActive() ? priceRangeLabel() : DEFAULT_PRICE_LABEL;

    }

    paintPriceUI();

}

// кнопка "Скинути вибір ціни" живе всередині priceMenu, який
// перебудовується при ініціалізації повзунка — тому обробник
// делегований на саме меню, а не на кнопку
priceMenu?.addEventListener("click", event => {

    if (event.target.closest("[data-clear-price]")) clearPrices();

});

priceToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = priceMenu.hidden;

    closeAllDropdowns();

    if (willOpen) openDropdownMenu(priceDropdown, priceMenu);

});

// -------------------------
// Дропдаун «Розмір» (мультиселект, з групами)
// -------------------------

const sizeGroupsList = document.getElementById("sizeGroupsList");

function fillSizeGroups() {

    if (!sizeGroupsList) return;

    const presentCategories = new Set(sectionProducts().map(product => product.category));

    sizeGroupsList.innerHTML = SIZE_GROUPS
        .filter(group => group.categories.some(c => presentCategories.has(c)))
        .map(group => `
            <div class="filter-size-group" data-size-group="${group.key}">
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

    applyFilterChange();

}

function clearSizes() {

    selectedSizes.clear();

    updateSizeUI();

    closeAllDropdowns();

    applyFilterChange();

}

function sizeKeyLabel(key) {

    const [groupKey, size] = key.split(":");

    const group = SIZE_GROUPS.find(g => g.key === groupKey);

    return group ? `${group.title} · ${size}` : size;

}

function updateSizeUI() {

    sizeLabel.textContent = getMultiSelectLabel(selectedSizes, DEFAULT_SIZE_LABEL, "Розмір", sizeKeyLabel);

    const available = availableFacets();

    sizeMenu.querySelectorAll(".filter-size-chip").forEach(chip => {

        const key = `${chip.dataset.group}:${chip.dataset.size}`;
        const selected = selectedSizes.has(key);

        chip.classList.toggle("active", selected);

        markAvailability(chip, available.sizes.has(key), selected);

    });

    // ховаємо і заголовок групи розмірів, якщо в ній не лишилось
    // жодного доступного розміру (напр. розміри взуття, коли обрані
    // лише сумки)
    sizeMenu.querySelectorAll("[data-size-group]").forEach(groupEl => {

        const chips = [...groupEl.querySelectorAll(".filter-size-chip")];

        groupEl.classList.toggle(
            "unavailable",
            chips.length > 0 && chips.every(chip => chip.classList.contains("unavailable"))
        );

    });

}

document.querySelector("[data-clear-size]")?.addEventListener("click", clearSizes);

sizeToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = sizeMenu.hidden;

    closeAllDropdowns();

    if (willOpen) openDropdownMenu(sizeDropdown, sizeMenu);

});

function closeAllDropdowns() {

    [sortDropdown, brandDropdown, colorDropdown, categoryDropdown, priceDropdown, sizeDropdown].forEach(dropdown => {

        if (!dropdown) return;

        const menu = dropdown.querySelector(".filter-menu, .sort-menu");

        if (menu) {

            menu.hidden = true;

            // ОБОВ'ЯЗКОВО знімаємо і суто візуальне приховування
            // від скролу. Саме залишок цього класу був причиною
            // бага "список не відкривається на середині каталогу":
            // menu.hidden ставав false і додавався .open, але меню
            // лишалось з opacity:0 та pointer-events:none — тобто
            // невидимим, і "оживало" лише після скролу вгору.
            menu.classList.remove("scroll-hidden");

        }

        dropdown.classList.remove("open");

    });

}

// єдина точка відкриття будь-якого дропдауна фільтрів: меню
// показується одразу, незалежно від того, в якому місці каталогу
// зараз користувач і що відбувалось зі скролом раніше. Панель
// фільтрів sticky, тож список з'являється рівно під шапкою.
function openDropdownMenu(dropdown, menu) {

    if (!dropdown || !menu) return;

    closeAllDropdowns();

    menu.hidden = false;
    menu.classList.remove("scroll-hidden");

    dropdown.classList.add("open");

    // якщо панель фільтрів у цей момент була відведена вгору після
    // скролу вниз — повертаємо її на місце, інакше меню відкрилось
    // би разом з нею за межами екрана
    const stickyBar = dropdown.closest(".catalog-filters-bar, .mobile-filter-bar");

    if (stickyBar) stickyBar.classList.remove("is-hidden");

}

document.addEventListener("click", event => {

    if (event.target.closest("#sortDropdown, #brandDropdown, #colorDropdown, #categoryDropdown, #priceDropdown, #sizeDropdown")) return;

    closeAllDropdowns();

});

// -------------------------
// Приховування відкритого дропдауна фільтрів при скролі
//
// Меню дропдауна (.filter-menu / .sort-menu) — position:absolute
// відносно кнопки-тригера. Через це, коли сторінку прокручують
// вниз, кнопка-тригер може виїхати за межі екрана раніше, ніж
// саме меню (воно значно вище за кнопку) — і меню лишається
// висіти "у повітрі" поверх товарів нижче, вже не прив'язане до
// жодної видимої кнопки.
//
// Тут — суто візуальне приховування на час скролу вниз (клас
// scroll-hidden), окремо від "по-справжньому закрито" (menu.hidden
// + відсутність класу .open, як і раніше керує closeAllDropdowns).
// При скролі вгору знову показуємо дропдаун, якщо користувач сам
// його не закрив (тобто якщо menu.hidden усе ще false).
(function setupDropdownScrollVisibility() {

    let lastScrollY = window.scrollY;
    let ticking = false;

    const SCROLL_THRESHOLD = 4;

    function update() {

        const currentScrollY = window.scrollY;
        const delta = currentScrollY - lastScrollY;

        if (Math.abs(delta) > SCROLL_THRESHOLD) {

            const openDropdown = [sortDropdown, brandDropdown, colorDropdown, categoryDropdown, priceDropdown, sizeDropdown]
                .find(dropdown => dropdown?.classList.contains("open"));

            const menu = openDropdown?.querySelector(".filter-menu, .sort-menu");

            if (menu && !menu.hidden) {

                // та сама причина, що й у initStickyFilterAutoHide:
                // не ховаємо відкритий дропдаун через наш власний
                // programmatic-скрол після застосування фільтра
                const hiding = delta > 0 && !isAutoScrollGuardActive();

                menu.classList.toggle("scroll-hidden", hiding);

            }

        }

        lastScrollY = currentScrollY;
        ticking = false;

    }

    window.addEventListener("scroll", () => {

        if (ticking) return;

        ticking = true;
        requestAnimationFrame(update);

    }, { passive: true });

})();

// -------------------------
// Фільтр «Стать»
// -------------------------

function updateGenderUI() {

    if (!genderFilterEl) return;

    const available = availableFacets();

    genderFilterEl.querySelectorAll(".gender-pill").forEach(btn => {

        const value = btn.dataset.gender;
        const selected = value === "" ? selectedGenders.size === 0 : selectedGenders.has(value);

        btn.classList.toggle("active", selected);

        // «Всі» доступна завжди; решту статей вимикаємо, а не ховаємо —
        // це фіксований ряд кнопок, і зникнення однієї з них
        // перебудовувало б увесь рядок
        const isAvailable = value === "" || available.genders.has(value);

        btn.classList.toggle("disabled", !isAvailable && !selected);
        btn.disabled = !isAvailable && !selected;

    });

}

function setupGenderFilter() {

    if (!genderFilterEl) return;

    updateGenderUI();

    genderFilterEl.querySelectorAll(".gender-pill").forEach(btn => {

        btn.addEventListener("click", () => {

            const value = btn.dataset.gender;

            if (value === "") {

                selectedGenders.clear();

            } else if (selectedGenders.has(value)) {

                selectedGenders.delete(value);

            } else {

                selectedGenders.add(value);

            }

            updateGenderUI();

            applyFilterChange();

        });

    });

}

// -------------------------
// Хлібні крихти + заголовок
// -------------------------

function renderBreadcrumbsAndTitle() {

    // Кожна крихта — це {label, href}, а не готовий HTML: href===null
    // означає "це поточна сторінка", і саме тому останню крихту
    // рендеримо СПАНОМ, а не посиланням — сюди все одно нікуди йти.
    // Раніше "Каталог"/"Новинки" завжди були <a href="...">, навіть
    // коли ставали останньою крихтою (плейн /catalog чи /catalog?
    // section=new без інших фільтрів) — виходило посилання саме на
    // себе, як на скріні.
    const crumbs = [{ label: "Головна", href: "/" }];

    let title = "Каталог товарів";
    let subtitle = "Сумки, одяг, взуття та аксесуари від світових брендів";

    if (currentSection === "new") {

        crumbs.push({ label: "Новинки", href: "catalog?section=new" });
        title = "Новинки";
        subtitle = "Останні надходження до каталогу BestBrnd4u";

    } else if (currentSection === "sale") {

        crumbs.push({ label: "Акції", href: "catalog?section=sale", className: "sale-text" });
        title = `<span class="sale-text">Акції</span>`;
        subtitle = `Знижки від ${SALE_MIN_DISCOUNT}% на сумки, рюкзаки та аксесуари`;

    } else {

        crumbs.push({ label: "Каталог", href: "catalog" });

    }

    if (selectedGenders.size) {

        const label = [...selectedGenders].join(", ");

        crumbs.push({ label, href: "catalog" });
        subtitle = `${subtitle} · ${label}`;

    }

    const html = crumbs.map((crumb, index) => {

        const isLast = index === crumbs.length - 1;
        const classAttr = crumb.className ? ` class="${crumb.className}"` : "";

        // остання крихта — завжди поточна сторінка, тож без href.
        // crumb-current робить її темнішою за посилання: інакше вся
        // доріжка виглядає однорідним рядком і не читається з розгону.
        const currentClass = isLast
            ? ` class="${crumb.className ? crumb.className + " " : ""}crumb-current"`
            : classAttr;

        const node = isLast
            ? `<span${currentClass}>${escapeHtml(crumb.label)}</span>`
            : `<a href="${crumb.href}"${classAttr}>${escapeHtml(crumb.label)}</a>`;

        return index === 0 ? node : `<span class="crumb-sep">→</span>\n${node}`;

    }).join("\n");

    if (breadcrumbsList) breadcrumbsList.innerHTML = html;

    if (catalogTitle) catalogTitle.innerHTML = title;
    if (catalogSubtitle) catalogSubtitle.textContent = subtitle;

    document.title = currentSection === "sale"
        ? "Акції | BestBrnd4u"
        : currentSection === "new"
            ? "Новинки | BestBrnd4u"
            : "Каталог | BestBrnd4u";

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

// skip — назва виміру, який треба ПРОПУСТИТИ під час фільтрації.
// Потрібно для «звужувальних» фільтрів: щоб порахувати, які кольори
// ще доступні, треба застосувати всі фільтри, КРІМ самого кольору —
// інакше в списку лишився б рівно один, уже обраний, колір.
function filterProducts(skip) {

    // копія обов'язкова: sectionProducts() для звичайного каталогу
    // повертає сам масив products, а нижче список сортується на місці
    let list = [...sectionProducts()];

    if (selectedGenders.size && skip !== "gender") {

        // товар підходить, якщо БУДЬ-ЯКА його стать серед обраних —
        // унісекс-товар має знаходитись і в «Жінкам», і в «Чоловікам»
        list = list.filter(product =>
            getProductGenders(product).some(g => selectedGenders.has(g)));

    }

    const text = search.value.trim().toLowerCase();

    if (text) {

        list = list.filter(product => {

            const haystack = [
                product.title,
                product.brand,
                product.category,
                product.description,
                ...(product.searchKeywords || [])
            ].filter(Boolean).join(" ").toLowerCase();

            return haystack.includes(text);

        });

    }

    if (selectedBrands.size && skip !== "brands") {

        list = list.filter(product =>
            selectedBrands.has(product.brand)
        );

    }

    if (selectedColors.size && skip !== "colors") {

        list = list.filter(product => {

            const productColorNames = new Set(getProductColors(product).keys());

            return [...selectedColors].some(color => productColorNames.has(color));

        });

    }

    if (selectedCategories.size && skip !== "categories") {

        list = list.filter(product =>
            selectedCategories.has(product.category)
        );

    }

    // Відділ звужує так само, як категорія, тільки на рівень вище.
    // Разом вони працюють як І: якщо людина прийшла з крихти «Аксесуари»
    // й додала категорію, лишаються товари, що підходять під обидві умови.
    if (selectedDepartments.size && skip !== "categories") {

        list = list.filter(product =>
            selectedDepartments.has(departmentByCategory.get(product.category))
        );

    }

    if (priceFilterActive() && skip !== "price") {

        list = list.filter(product =>
            product.price >= priceRange.min && product.price <= priceRange.max
        );

    }

    if (selectedSizes.size && skip !== "sizes") {

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

// Перерахунок доступних значень у всіх фільтрах. Викликається з
// render(), бо доступність залежить від поточного набору фільтрів,
// а не лише від того, який фільтр щойно змінили.
let refreshingFacets = false;

function refreshFacets() {

    // updateXxxUI() усередині знову викликають availableFacets(),
    // тож без цього прапорця вийшла б зайва рекурсія розрахунків
    if (refreshingFacets) return;

    refreshingFacets = true;

    try {

        updateBrandUI();
        updateColorUI();
        updateSizeUI();
        updateCategoryUI();
        updateGenderUI();

        refreshSidebarCounts();

    } finally {

        refreshingFacets = false;

    }

}

// -------------------------
// Посторінковий вивід
//
// Зі зростанням каталогу вивід усіх товарів одразу означає сотні
// карток і фото в одному документі — сторінка стає важкою навіть
// при легких зображеннях.
//
// Номер сторінки живе в адресі (?page=2), тож посилання можна
// надіслати або зберегти, а кнопка «Назад» повертає на ту саму
// сторінку, а не на першу.
// -------------------------

const PER_PAGE = 24;

let currentPage = 1;

const paginationEl = document.getElementById("pagination");

function totalPages(count) {
    return Math.max(1, Math.ceil(count / PER_PAGE));
}

function clampPage(count) {
    // після зміни фільтрів сторінки може вже не існувати
    currentPage = Math.min(Math.max(1, currentPage), totalPages(count));
    return currentPage;
}

// ==========================================================
// Повернення на те саме місце в каталозі
//
// ЗАДАЧА
// -------
// Людина гортає каталог, відкриває товар, тисне «Назад» — і має
// побачити той самий список і той самий товар, на якому спинилась,
// а не починати перегляд спочатку.
//
// ЧОМУ ОДНОГО scrollRestoration МАЛО
// -----------------------------------
// Браузер відновлює скрол одразу після повернення, а каталог на цей
// момент ще порожній: товари вантажаться з products.json і
// малюються вже після. Відновлювати нема куди — сторінка коротка,
// і скрол падає на нуль. Тому запамʼятовуємо не пікселі, а КАРТКУ:
// пікселі брешуть, щойно зміниться кількість товарів у рядку
// (інший екран, поворот телефона), а картка — ні.
//
// sessionStorage, а не localStorage: це стан однієї сесії перегляду.
// Через тиждень повертати людину на позавчорашній товар безглуздо.
// ==========================================================

const RETURN_KEY = "catalogReturnTo";

function rememberCatalogPosition(productId) {

    try {

        sessionStorage.setItem(RETURN_KEY, JSON.stringify({
            id: String(productId),
            // адреса потрібна, щоб не стрибати на картку, якщо людина
            // повернулась у КАТАЛОГ З ІНШИМИ фільтрами
            search: location.search
        }));

    } catch (error) {

        // приватний режим — просто не запамʼятаємо

    }

}

function takeCatalogReturn() {

    try {

        const raw = sessionStorage.getItem(RETURN_KEY);

        if (!raw) return null;

        // одноразово: інакше кожен наступний вхід у каталог смикав би
        // сторінку до старої картки
        sessionStorage.removeItem(RETURN_KEY);

        return JSON.parse(raw);

    } catch (error) {

        return null;

    }

}

// Клац по картці — запамʼятовуємо, куди повертатись.
// Слухаємо на сітці, а не на кожній картці: картки перемальовуються
// при кожному фільтрі, і окремі слухачі довелось би навішувати знову.
function bindCatalogReturnTracking() {

    grid?.addEventListener("click", event => {

        const card = event.target.closest(".product-card");

        if (!card || !card.dataset.id) return;

        // клац по «серденьку» чи кнопці — це не перехід у товар
        if (event.target.closest("button")) return;

        rememberCatalogPosition(card.dataset.id);

    });

}

function restoreCatalogPosition() {

    const saved = takeCatalogReturn();

    if (!saved || saved.search !== location.search) return;

    const card = grid?.querySelector(`.product-card[data-id="${CSS.escape(saved.id)}"]`);

    if (!card) return;

    // "instant": людина вже бачила цей екран, плавна прокрутка тут
    // виглядає як зайва анімація на порожньому місці
    card.scrollIntoView({ block: "center", behavior: "instant" });

    // коротка підсвітка — щоб очима знайти, де саме спинився перегляд
    card.classList.add("just-returned");

    setTimeout(() => card.classList.remove("just-returned"), 1600);

}

// ==========================================================
// Стан каталогу в адресі
//
// НАВІЩО
// -------
// Раніше в адресу потрапляли лише section, gender, page (і brand
// з category — але тільки на вхід). Через це:
//
//   • скопійоване посилання відкривалось із порожніми фільтрами —
//     людина бачила «усі товари» замість того, що надсилали;
//   • «Назад» зі сторінки товару повертав у каталог, але фільтри,
//     сортування й категорія скидались, і перегляд доводилось
//     починати спочатку.
//
// Тепер в адресі лежить ВЕСЬ стан. Побічний ефект приємний: кнопка
// «Назад» стає майже безкоштовною — браузер повертається на адресу,
// у якій уже все описано.
//
// replaceState, а не pushState: інакше кожне клацання по чекбоксу
// додавало б запис в історію, і «Назад» довелось би тиснути 15 разів,
// щоб вийти з каталогу.
// ==========================================================

// Порядок ключів фіксований — щоб дві однакові вибірки давали
// однакове посилання (і однаково кешувались, і однаково виглядали).
const URL_KEYS = {
    section: "section",
    gender: "gender",
    department: "department",
    category: "category",
    brand: "brand",
    color: "color",
    size: "size",
    priceMin: "priceMin",
    priceMax: "priceMax",
    sort: "sort",
    page: "page"
};

function setOrDelete(params, key, value) {

    if (value === null || value === undefined || value === "" ) params.delete(key);
    else params.set(key, value);

}

function syncStateToUrl() {

    try {

        const url = new URL(window.location.href);
        const p = url.searchParams;

        // множинні фільтри — через кому: читабельно в адресному рядку
        // й не роздуває посилання, як повторювані ключі
        const joinSet = set => (set && set.size) ? [...set].join(",") : "";

        setOrDelete(p, URL_KEYS.section, currentSection);
        setOrDelete(p, URL_KEYS.gender, joinSet(selectedGenders));
        setOrDelete(p, URL_KEYS.department, joinSet(selectedDepartments));
        setOrDelete(p, URL_KEYS.category, joinSet(selectedCategories));
        setOrDelete(p, URL_KEYS.brand, joinSet(selectedBrands));
        setOrDelete(p, URL_KEYS.color, joinSet(selectedColors));
        setOrDelete(p, URL_KEYS.size, joinSet(selectedSizes));

        // ціну пишемо, лише якщо людина її справді рухала: інакше
        // посилання тягло б за собою межі поточного асортименту, і
        // завтра, коли зʼявиться дорожчий товар, воно б його ховало
        const movedMin = priceRange.min !== null && priceRange.min !== priceBounds.min;
        const movedMax = priceRange.max !== null && priceRange.max !== priceBounds.max;

        setOrDelete(p, URL_KEYS.priceMin, movedMin ? priceRange.min : "");
        setOrDelete(p, URL_KEYS.priceMax, movedMax ? priceRange.max : "");

        setOrDelete(p, URL_KEYS.sort, currentSort);
        setOrDelete(p, URL_KEYS.page, currentPage > 1 ? currentPage : "");

        window.history.replaceState(null, "", url);

    } catch (error) {

        // адресний рядок — не критично

    }

}

// сумісність: стара назва лишається, бо на неї є виклики
function syncPageToUrl() {
    syncStateToUrl();
}

// Номери з трьома крапками: 1 … 4 5 6 … 12
function pageNumbers(total, current) {

    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const out = new Set([1, total, current, current - 1, current + 1]);

    if (current <= 3) [2, 3, 4].forEach(n => out.add(n));
    if (current >= total - 2) [total - 1, total - 2, total - 3].forEach(n => out.add(n));

    const pages = [...out].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    const result = [];

    pages.forEach((n, i) => {
        if (i && n - pages[i - 1] > 1) result.push("…");
        result.push(n);
    });

    return result;

}

function renderPagination(count) {

    if (!paginationEl) return;

    const total = totalPages(count);

    // одна сторінка — ховаємо блок, щоб не займав місце дарма
    paginationEl.hidden = total <= 1;

    if (total <= 1) { paginationEl.innerHTML = ""; return; }

    const buttons = pageNumbers(total, currentPage).map(n =>
        n === "…"
            ? `<span class="pagination-gap">…</span>`
            : `<button type="button" class="pagination-page${n === currentPage ? " active" : ""}"
                       data-page="${n}"${n === currentPage ? ' aria-current="page"' : ""}>${n}</button>`
    ).join("");

    paginationEl.innerHTML = `
        <button type="button" class="pagination-arrow" data-page="${currentPage - 1}"
                ${currentPage === 1 ? "disabled" : ""} aria-label="Попередня сторінка">‹</button>
        ${buttons}
        <button type="button" class="pagination-arrow" data-page="${currentPage + 1}"
                ${currentPage === total ? "disabled" : ""} aria-label="Наступна сторінка">›</button>
    `;

}

paginationEl?.addEventListener("click", event => {

    const btn = event.target.closest("[data-page]");

    if (!btn || btn.disabled) return;

    currentPage = Number(btn.dataset.page);

    render();

    // Підіймаємо до початку списку, а не до самого верху сторінки:
    // інакше після переходу користувач бачить шапку й фільтри, а не
    // товари, заради яких натискав.
    const top = grid.getBoundingClientRect().top + window.scrollY
        - ((document.querySelector("header")?.offsetHeight || 0) + 12);

    window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });

});

function render() {

    // межі повзунка ціни залежать від завантажених товарів —
    // виставляємо їх один раз, при першому рендері з даними
    // (працює і для catalog.html, і для promo.html)
    if (!priceUI && products.length) setupPriceRange();

    const list = filterProducts();

    clampPage(list.length);

    const from = (currentPage - 1) * PER_PAGE;

    grid.innerHTML = list
        .slice(from, from + PER_PAGE)
        .map(product => createProductCard(product))
        .join("");

    renderPagination(list.length);
    syncPageToUrl();

    initProductCarousels(grid);

    updateFavoriteButtons();

    productsCount.textContent = list.length;

    if (productsCounter) {

        productsCounter.textContent = `(${list.length})`;

    }

    emptyState.hidden = list.length !== 0;

    renderActiveFilters();

    refreshFacets();

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

    selectedGenders.forEach(gender => {

        chips.push({ type: "gender", value: gender, label: gender });

    });

    selectedBrands.forEach(brand => {

        chips.push({ type: "brand", value: brand, label: brand });

    });

    selectedColors.forEach(color => {

        chips.push({ type: "color", value: color, label: color });

    });

    selectedCategories.forEach(category => {

        chips.push({ type: "category", value: category, label: category });

    });

    if (priceFilterActive()) {

        chips.push({ type: "price", value: "", label: priceRangeLabel() });

    }

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

        selectedGenders.delete(value);
        updateGenderUI();

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

        resetPriceRange();

        updatePriceUI();

    } else if (type === "size") {

        selectedSizes.delete(value);

        updateSizeUI();

    }

    applyFilterChange();

}

function resetAllFilters() {

    search.value = "";

    selectedBrands.clear();
    updateBrandUI();

    selectedColors.clear();
    updateColorUI();

    selectedCategories.clear();
    updateCategoryUI();

    resetPriceRange();
    updatePriceUI();

    selectedSizes.clear();
    updateSizeUI();

    currentSort = "";

    if (sortLabel) sortLabel.textContent = "за замовчуванням";

    sortMenu?.querySelectorAll(".sort-option").forEach(o => {
        o.classList.toggle("active", o.dataset.sort === "");
    });

    selectedGenders.clear();
    updateGenderUI();

    applyFilterChange();

}

resetBtn?.addEventListener("click", resetAllFilters);

clearBtn?.addEventListener("click", resetAllFilters);

// Пошук: перемальовуємо результати і, якщо користувач зараз нижче
// за початок каталогу, піднімаємо його до рядка "Знайдено N товарів".
//
// Навмисно НЕ через applyFilterChange(): той скролить завжди, а тут
// це смикало б сторінку на кожній натиснутій клавіші. Тому підйом
// відбувається фактично один раз — на початку набору: щойно ми
// опинились угорі, умова нижче більше не виконується, і подальші
// символи вже нічого не рухають.
search.addEventListener("input", () => {

    render();

    // у мобільній шторці "Всі фільтри" скрол не потрібен
    if (document.body.classList.contains("mobile-filters-open")) return;

    // анімація підйому ще триває після попереднього символу —
    // не перезапускаємо її, інакше скрол смикався б
    if (isAutoScrollGuardActive()) return;

    if (window.scrollY > getResultsScrollTop() + 4) scrollToFirstProduct();

});

// -------------------------
// Кастомний дропдаун сортування
// -------------------------

sortToggle?.addEventListener("click", event => {

    event.stopPropagation();

    const willOpen = sortMenu.hidden;

    closeAllDropdowns();

    if (willOpen) openDropdownMenu(sortDropdown, sortMenu);

});

sortMenu?.querySelectorAll(".sort-option").forEach(option => {

    option.addEventListener("click", () => {

        currentSort = option.dataset.sort;

        sortLabel.textContent = option.dataset.label;

        sortMenu.querySelectorAll(".sort-option").forEach(o => o.classList.toggle("active", o === option));

        closeAllDropdowns();

        applyFilterChange();

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

// сторінки на кшталт promo.html підключають цей самий файл,
// щоб повністю перевикористати "двигун" фільтрів/сортування,
// але самі вирішують, які товари в нього підставити (замість
// повного каталогу) — тому виставляють цей прапорець ДО
// підключення catalog.js і викликають потрібні функції вручну
if (!window.CATALOG_SKIP_AUTO_INIT) {

    initCatalog();

}

// =====================================
// МОБІЛЬНІ ФІЛЬТРИ КАТАЛОГУ
// (закріплена панель "Фільтри/Сортування" під хедером
// + повноекранна шторка зі списком фільтрів; на відміну
// від старого мобільного вигляду (стек інпутів на всю
// ширину) реальні DOM-вузли дропдаунів просто переносяться
// в шторку і назад — без дублювання логіки фільтрації)
// =====================================

(function setupMobileFilters() {

    const mobileFilterBar = document.getElementById("mobileFilterBar");
    const mobileFiltersBtn = document.getElementById("mobileFiltersBtn");
    const mobileFiltersCount = document.getElementById("mobileFiltersCount");
    const mobileFiltersModal = document.getElementById("mobileFiltersModal");
    const mobileFiltersMain = document.getElementById("mobileFiltersMain");
    const mobileFiltersSub = document.getElementById("mobileFiltersSub");
    const mobileFiltersSubTitle = document.getElementById("mobileFiltersSubTitle");
    const mobileFiltersSubContent = document.getElementById("mobileFiltersSubContent");
    const mobileFiltersCloseBtn = document.getElementById("mobileFiltersCloseBtn");
    const mobileFiltersCloseBtn2 = document.getElementById("mobileFiltersCloseBtn2");
    const mobileFiltersBackBtn = document.getElementById("mobileFiltersBackBtn");
    const mobileFiltersResetBtn = document.getElementById("mobileFiltersResetBtn");
    const mobileFiltersApplyBtn = document.getElementById("mobileFiltersApplyBtn");
    const mobileFiltersSubApplyBtn = document.getElementById("mobileFiltersSubApplyBtn");
    const mobileFiltersRows = document.getElementById("mobileFiltersRows");
    const sortDropdownAnchor = document.getElementById("sortDropdownAnchor");
    const mfCount = document.getElementById("mfCount");
    const mfSubCount = document.getElementById("mfSubCount");

    if (!mobileFilterBar || !mobileFiltersModal) return;

    const mfRows = {
        category: document.getElementById("mfRowCategory"),
        brand: document.getElementById("mfRowBrand"),
        color: document.getElementById("mfRowColor"),
        size: document.getElementById("mfRowSize"),
        gender: document.getElementById("mfRowGender"),
        price: document.getElementById("mfRowPrice")
    };

    // реальні вузли десктопних дропдаунів, які на мобільному
    // переносяться в шторку (без клонування — з усіма їх
    // обробниками подій)
    const targets = {
        category: { el: categoryMenu, parent: categoryDropdown, title: "Категорія" },
        brand: { el: brandMenu, parent: brandDropdown, title: "Бренд" },
        color: { el: colorMenu, parent: colorDropdown, title: "Колір" },
        size: { el: sizeMenu, parent: sizeDropdown, title: "Розмір" },
        gender: { el: genderFilterEl, parent: genderFilterEl ? genderFilterEl.parentElement : null, title: "Стать" },
        price: { el: priceMenu, parent: priceDropdown, title: "Ціна" }
    };

    const mq = window.matchMedia("(max-width:768px)");

    function relocateSortDropdown() {

        if (!sortDropdown) return;

        if (mq.matches) {
            mobileFilterBar.appendChild(sortDropdown);
        } else if (sortDropdownAnchor) {
            sortDropdownAnchor.after(sortDropdown);
        }

    }

    function activeFilterCount() {

        return selectedGenders.size
            + selectedBrands.size
            + selectedColors.size
            + selectedCategories.size
            + (priceFilterActive() ? 1 : 0)
            + selectedSizes.size;

    }

    function refreshRowLabels() {

        if (mfRows.category) mfRows.category.textContent = categoryLabel ? categoryLabel.textContent : "";
        if (mfRows.brand) mfRows.brand.textContent = brandLabel ? brandLabel.textContent : "";
        if (mfRows.color) mfRows.color.textContent = colorLabel ? colorLabel.textContent : "";
        if (mfRows.size) mfRows.size.textContent = sizeLabel ? sizeLabel.textContent : "";
        if (mfRows.price) mfRows.price.textContent = priceLabel ? priceLabel.textContent : "";
        if (mfRows.gender) mfRows.gender.textContent = getMultiSelectLabel(selectedGenders, "Всі", "Стать");

        const count = activeFilterCount();

        if (mobileFiltersCount) {
            mobileFiltersCount.hidden = count === 0;
            mobileFiltersCount.textContent = count;
        }

    }

    function refreshCounts() {

        const n = productsCount ? productsCount.textContent : "0";

        if (mfCount) mfCount.textContent = n;
        if (mfSubCount) mfSubCount.textContent = n;

    }

    function returnRelocatedTargets() {

        Object.values(targets).forEach(target => {

            if (!target.el || !target.parent) return;

            if (target.el.parentElement !== target.parent) {

                target.parent.appendChild(target.el);

                if (target.el.classList.contains("filter-menu")) {
                    target.el.hidden = true;
                }

            }

        });

    }

    function openMobileFilters() {

        refreshRowLabels();
        refreshCounts();

        mobileFiltersSub.hidden = true;
        mobileFiltersMain.hidden = false;
        mobileFiltersModal.hidden = false;

        document.body.style.overflow = "hidden";
        document.body.classList.add("mobile-filters-open");

    }

    function closeMobileFilters() {

        returnRelocatedTargets();

        mobileFiltersModal.hidden = true;

        document.body.style.overflow = "";
        document.body.classList.remove("mobile-filters-open");

    }

    function openMobileFilterSection(key) {

        const target = targets[key];

        if (!target || !target.el) return;

        // скидаємо тільки текст пошуку (і показуємо знову всі
        // опції), вибрані категорія/бренд при цьому не чіпаємо —
        // інакше при поверненні в "Всі фільтри" і повторному вході
        // в розділ залишався старий текст пошуку
        if (key === "category" && categorySearchInput) {

            categorySearchInput.value = "";
            filterCategoryOptions("");

        } else if (key === "brand" && brandSearchInput) {

            brandSearchInput.value = "";
            filterBrandOptions("");

        }

        mobileFiltersSubTitle.textContent = target.title;
        mobileFiltersSubContent.innerHTML = "";
        mobileFiltersSubContent.appendChild(target.el);

        target.el.hidden = false;

        mobileFiltersMain.hidden = true;
        mobileFiltersSub.hidden = false;

        refreshCounts();

    }

    function backToMobileFiltersMain() {

        mobileFiltersSub.hidden = true;
        mobileFiltersMain.hidden = false;

        refreshRowLabels();
        refreshCounts();

    }

    mobileFiltersBtn?.addEventListener("click", openMobileFilters);
    mobileFiltersCloseBtn?.addEventListener("click", closeMobileFilters);
    mobileFiltersCloseBtn2?.addEventListener("click", closeMobileFilters);

    mobileFiltersApplyBtn?.addEventListener("click", () => {
        closeMobileFilters();
        scrollToFirstProduct();
    });

    mobileFiltersSubApplyBtn?.addEventListener("click", () => {
        closeMobileFilters();
        scrollToFirstProduct();
    });

    mobileFiltersBackBtn?.addEventListener("click", backToMobileFiltersMain);

    mobileFiltersResetBtn?.addEventListener("click", () => {

        resetAllFilters();

        refreshRowLabels();
        refreshCounts();

    });

    mobileFiltersRows?.addEventListener("click", event => {

        const row = event.target.closest(".mobile-filter-row");

        if (!row) return;

        openMobileFilterSection(row.dataset.target);

    });

    // тримаємо бейдж і лічильники товарів актуальними, поки
    // шторка відкрита і користувач одразу бачить результат тапу
    const baseRender = render;

    render = function() {

        baseRender();

        if (!mobileFiltersModal.hidden) {

            refreshCounts();

            if (!mobileFiltersMain.hidden) refreshRowLabels();

        }

    };

    function handleViewportChange() {

        relocateSortDropdown();

        if (!mq.matches && !mobileFiltersModal.hidden) {
            closeMobileFilters();
        }

    }

    relocateSortDropdown();

    if (mq.addEventListener) {
        mq.addEventListener("change", handleViewportChange);
    } else {
        mq.addListener(handleViewportChange);
    }

    // Ховаємо панель фільтрів при скролі вниз і показуємо назад
    // при скролі вгору (типова мобільна поведінка, застосовується
    // і на десктопі — та сама .catalog-filters-bar). Стежимо саме
    // за напрямком скролу, а не просто за позицією — і головне:
    // чіпаємо клас is-hidden лише коли панель вже реально "прилипла"
    // під шапкою (getBoundingClientRect().top === sticky top).
    // Це і є фікс старого бага: раніше клас перемикався завжди,
    // з самого початку — поки сторінка ще довантажувала banner
    // акції над каталогом, позиція панелі "гуляла" разом з layout
    // shift від картинки, і вона видимо "стрибала"/впиралась у
    // банер. Тепер поки панель не в прилиплому стані — ми її
    // взагалі не чіпаємо, вона просто рухається зі сторінкою як
    // завжди.
    function initStickyFilterAutoHide(el) {

        if (!el) return;

        let lastScrollY = window.scrollY;
        let ticking = false;

        const HIDE_THRESHOLD = 6; // щоб дрібний джиттер скролу не смикав панель туди-сюди
        const stickyTop = parseFloat(getComputedStyle(el).top) || 0;

        function updateVisibility() {

            const currentScrollY = window.scrollY;
            const delta = currentScrollY - lastScrollY;
            const isStuck = el.getBoundingClientRect().top <= stickyTop + 1;

            if (!isStuck) {

                el.classList.remove("is-hidden");

            } else if (Math.abs(delta) > HIDE_THRESHOLD) {

                // ховаємо тільки якщо це справжній скрол користувача
                // вниз, а не наш власний плавний scrollToFirstProduct()
                // після застосування фільтра (див. autoScrollGuardUntil
                // вище) — інакше панель зникає рівно в той момент,
                // коли щойно з'явились результати
                const hiding = delta > 0 && !isAutoScrollGuardActive();

                // При скролі вниз панель ховається трансформом
                // (translateY), а відкритий список вищий за неї, тож
                // сам зсув його повністю не прибирає. Раніше тут
                // викликався closeAllDropdowns() — список закривався
                // по-справжньому і після скролу вгору вже не
                // повертався (а через залишковий клас scroll-hidden
                // ще й не відкривався по кліку).
                //
                // Тепер список лише ховається візуально — клас
                // scroll-hidden ставить setupDropdownScrollVisibility,
                // і при скролі вгору він повертається сам, якщо
                // користувач його не закривав.
                el.classList.toggle("is-hidden", hiding);

            }

            lastScrollY = currentScrollY;
            ticking = false;

        }

        window.addEventListener("scroll", () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(updateVisibility);
        }, { passive: true });

    }

    initStickyFilterAutoHide(mobileFilterBar);

    // та сама поведінка на десктопі — для .catalog-filters-bar
    // (на вузьких екранах цей елемент display:none, тож там ця
    // ініціалізація просто нічого не робить)
    initStickyFilterAutoHide(document.querySelector(".catalog-filters-bar"));

})();
