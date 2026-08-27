// ======================================
// favorites.js
// Логіка сторінки обраного (favorites)
// ======================================

let allProducts = [];

const favoritesGrid = document.getElementById("favoritesGrid");
const emptyFavoritesEl = document.getElementById("emptyFavorites");

async function initFavorites() {

    if (!favoritesGrid) return;

    try {

        const response = await fetch(dataUrl("data/products.json"));

        if (!response.ok) {
            throw new Error("Не вдалося завантажити товари");
        }

        allProducts = await response.json();

        renderFavorites();

    } catch (error) {

        favoritesGrid.innerHTML = `
            <p class="error">
                Помилка завантаження обраного.
            </p>
        `;

        console.error(error);

    }

}

function createFavoriteRow(product, favEntry) {

    const variants = product.variants?.length
        ? product.variants
        : [{ color: product.color || "Основний", hex: "#999", images: product.images || [] }];

    const oldPrice = product.oldPrice
        ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>`
        : "";

    const sizes = product.sizes?.length ? product.sizes : PRODUCT_SIZES;

    const activeColor = favEntry.color || variants[0].color;
    const activeSize = favEntry.size || (sizes.length === 1 ? sizes[0] : null);

    const activeVariant = variants.find(v => v.color === activeColor) || variants[0];

    const image = activeVariant.images?.[0] || product.images?.[0] || "assets/images/no-image.png";

    // Кольори, які вже лежать в обраному окремими рядками, позначаємо
    // одразу — щоб людина не тицяла в них і не отримувала відмову.
    const takenColors = new Set(
        getFavorites()
            .filter(entry => entry.id === product.id
                && (entry.size || null) === (activeSize || null)
                && (entry.color || null) !== (activeColor || null))
            .map(entry => entry.color)
    );

    const colorButtons = variants.map(variant => {

        const taken = takenColors.has(variant.color);

        return `
        <button
            type="button"
            class="mini-color ${variant.color === activeColor ? "active" : ""}${taken ? " is-taken" : ""}"
            data-color="${escapeHtml(variant.color)}"
            data-images='${escapeAttrSingleQuoted(JSON.stringify(variant.images || []))}'
            title="${escapeHtml(variant.color)}${taken ? " — уже окремим рядком в обраному" : ""}"
            style="background:${escapeHtml(variant.hex)}"></button>
    `;

    }).join("");

    const sizeButtons = sizes.map(size => `
        <button
            type="button"
            class="mini-size ${size === activeSize ? "active" : ""}">
            ${size}
        </button>
    `).join("");
    // Посилання веде на ТОЙ САМИЙ колір і розмір, що в обраному.
    // Раніше стояв productUrl(product) без параметрів — з обраного
    // завжди відкривався перший колір товару.
    const rowUrl = productUrl(product, { color: activeColor, size: activeSize });

    // Кружечки кольорів не підписані, тож назву показуємо окремо.
    const colorLabel = activeColor
        ? `<div class="favorite-row-color">Колір: <b>${escapeHtml(activeColor)}</b></div>`
        : "";


    return `
        <div class="favorite-row" data-id="${product.id}" data-color="${favEntry.color || ""}" data-size="${favEntry.size || ""}">

            <a href="${rowUrl}" class="favorite-row-image">
                <img
                    src="${image}"
                    alt="${escapeHtml(product.title)}"
                    onerror="this.src='assets/images/no-image.png'">
            </a>

            <div class="favorite-row-info">
                <div class="favorite-row-brand">
                    ${product.brand || "Без бренду"}
                </div>
                <a href="${rowUrl}" class="favorite-row-title">
                    ${escapeHtml(product.title)}
                </a>
                ${colorLabel}
                <div class="product-options">
<div class="product-colors-wrap">
                        <button type="button" class="colors-arrow colors-arrow-left" aria-label="Попередні кольори" tabindex="-1">‹</button>
                        <div class="product-colors">
                            ${colorButtons}
                        </div>
                        <button type="button" class="colors-arrow colors-arrow-right" aria-label="Наступні кольори" tabindex="-1">›</button>
                    </div>
                    <div class="product-sizes-wrap">
                        <button type="button" class="sizes-arrow sizes-arrow-left" aria-label="Попередні розміри" tabindex="-1">‹</button>
                        <div class="product-sizes">
                            ${sizeButtons}
                        </div>
                        <button type="button" class="sizes-arrow sizes-arrow-right" aria-label="Наступні розміри" tabindex="-1">›</button>
                    </div>
                </div>
                <div class="favorite-row-price">
                    ${oldPrice}
                    <span class="price">${formatPrice(product.price)}</span>
                </div>
            </div>

            <div class="favorite-row-actions">
                <button class="btn buy-btn" data-id="${product.id}">
                    Додати в кошик
                </button>
                <button class="favorite-row-remove favorite active" data-id="${product.id}">
                    ✕ Видалити з обраного
                </button>
            </div>

        </div>
    `;

}

function renderFavorites() {

    const favorites = getFavorites();

    const list = favorites
        .map(favEntry => {

            const product = allProducts.find(item => item.id === favEntry.id);

            return product ? { product, favEntry } : null;

        })
        .filter(Boolean);

    favoritesGrid.innerHTML = list
        .map(({ product, favEntry }) => createFavoriteRow(product, favEntry))
        .join("");

    favoritesGrid.hidden = list.length === 0;

    if (emptyFavoritesEl) {
        emptyFavoritesEl.hidden = list.length !== 0;
    }

    updateFavoriteButtons();

}

// зміна кольору/розміру прямо в списку обраного
favoritesGrid?.addEventListener("click", event => {

    const colorBtn = event.target.closest(".mini-color");
    const sizeBtn = event.target.closest(".mini-size");

    if (!colorBtn && !sizeBtn) return;

    const row = event.target.closest(".favorite-row");

    if (!row) return;

    // Рядок чекає видалення — перемикати в ньому колір чи розмір немає
    // сенсу: за секунду його вже не буде. Спершу «Залишити товар».
    if (row.classList.contains("is-removing")) return;

    const id = Number(row.dataset.id);
    const oldColor = row.dataset.color || null;
    const oldSize = row.dataset.size || null;

    // changeFavoriteVariant повертає false, якщо такий варіант уже є
    // у списку. Тоді нічого не змінюється — і про це треба сказати,
    // інакше виглядає, ніби кнопка не працює.
    let applied = true;

    if (colorBtn) {

        applied = changeFavoriteVariant(id, oldColor, oldSize, "color", colorBtn.dataset.color);

    } else if (sizeBtn) {

        applied = changeFavoriteVariant(id, oldColor, oldSize, "size", sizeBtn.textContent.trim());

    }

    if (applied === false) {

        showToast("Цей варіант уже є в обраному");

        return;

    }

    renderFavorites();

});

// ======================================
// Видалення з обраного з вікном на роздуми
//
// ЗАДАЧА
// -------
// Прибрати рядок зі списку — дія без сліду: повернути товар нічим,
// крім пошуку його заново. Раніше від помилки захищало питання ПЕРЕД
// дією («Видалити з обраного?»), і саме воно ламало логіку: поки вікно
// відкрите, рядок лишається на екрані, а видаляв ПЕРЕМИКАЧ — другий
// клац по тій самій кнопці додавав товар назад.
//
// РІШЕННЯ
// --------
// Замість питання до дії — вікно скасування після неї. Рядок одразу
// переходить у стан «видаляємо», 5 секунд показує зворотний відлік і
// кнопку «Залишити товар». Натиснув — рядок повертається як був; не
// натиснув — товар зникає зі списку сам.
//
// Так дія відбувається без зайвого підтвердження, але помилку видно і
// виправити її можна одним дотиком.
// ======================================

const FAVORITE_REMOVAL_DELAY = 5000;

// ключ (id|колір|розмір) -> { timer, ticker, overlay, row }
const pendingRemovals = new Map();

function favoriteKey(id, color, size) {

    return `${Number(id)}|${color || ""}|${size || ""}`;

}

// Поки хоч один рядок чекає видалення, список НЕ перемальовується
// цілком: інакше рядок із відліком замінився б на свіжий, і кнопка
// «Залишити товар» зникла б разом із ним.
function hasPendingRemovals() {

    return pendingRemovals.size > 0;

}

function buildUndoOverlay(seconds) {

    const overlay = document.createElement("div");

    overlay.className = "favorite-row-undo";

    // role="status" + aria-live: скрінрідер оголошує, що товар
    // прибирається і що це можна скасувати. Без цього людина, яка не
    // бачить екрана, дізналась би про видалення вже по факту.
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");

    overlay.innerHTML = `
        <div class="favorite-row-undo-inner">
            <span class="favorite-row-undo-spinner" aria-hidden="true"></span>
            <p class="favorite-row-undo-text">
                Видаляємо з обраного…
                <b data-undo-left>${seconds}</b> с
            </p>
            <button type="button" class="btn btn-outline favorite-row-undo-cancel">
                Залишити товар
            </button>
            <div class="favorite-row-undo-bar" aria-hidden="true">
                <span data-undo-bar style="width:100%"></span>
            </div>
        </div>`;

    return overlay;

}

function stopPendingRemoval(key) {

    const pending = pendingRemovals.get(key);

    if (!pending) return null;

    clearTimeout(pending.timer);
    clearInterval(pending.ticker);

    pendingRemovals.delete(key);

    return pending;

}

// Викликається з common.js по кліку на «✕ Видалити з обраного».
function startFavoriteRemoval(row, id, options = {}) {

    const { color = null, size = null } = options;

    // Рядок може не знайтись, якщо кнопку колись перенесуть в інше
    // місце — тоді просто прибираємо, без відліку.
    if (!row) {

        removeFavorite(id, { color, size });

        renderFavorites();

        return;

    }

    const key = favoriteKey(id, color, size);

    // Повторний клац по тій самій кнопці, поки йде відлік, НІЧОГО не
    // робить. Саме тут раніше товар додавався назад.
    if (pendingRemovals.has(key)) return;

    const seconds = Math.round(FAVORITE_REMOVAL_DELAY / 1000);

    const overlay = buildUndoOverlay(seconds);

    row.classList.add("is-removing");
    row.appendChild(overlay);

    const leftEl = overlay.querySelector("[data-undo-left]");
    const barEl = overlay.querySelector("[data-undo-bar]");

    const startedAt = Date.now();

    const ticker = setInterval(() => {

        const passed = Date.now() - startedAt;
        const left = Math.max(FAVORITE_REMOVAL_DELAY - passed, 0);

        if (leftEl) leftEl.textContent = Math.ceil(left / 1000);

        if (barEl) barEl.style.width = `${(left / FAVORITE_REMOVAL_DELAY) * 100}%`;

    }, 100);

    const timer = setTimeout(() => {

        stopPendingRemoval(key);

        // removeFavorite, а не toggleFavorite: видалення працює в один
        // бік, тож повторний виклик уже нічого не поверне.
        removeFavorite(id, { color, size });

        showToast("Видалено з обраного");

        renderFavorites();

    }, FAVORITE_REMOVAL_DELAY);

    pendingRemovals.set(key, { timer, ticker, overlay, row });

}

function cancelFavoriteRemoval(key) {

    const pending = stopPendingRemoval(key);

    if (!pending) return;

    pending.overlay.remove();
    pending.row.classList.remove("is-removing");

    showToast("Товар лишився в обраному");

    // Останній рядок із відліком зник — можна знову перемальовувати
    // список звичайним шляхом.
    if (!hasPendingRemovals()) renderFavorites();

}

// «Залишити товар» — скасування відліку.
//
// Клац по кнопці НЕ має вважатись клацом по рядку (рядок клікабельний
// і веде на сторінку товару), тому гасимо подію.
favoritesGrid?.addEventListener("click", event => {

    const cancelBtn = event.target.closest(".favorite-row-undo-cancel");

    if (!cancelBtn) return;

    event.preventDefault();
    event.stopPropagation();

    const row = cancelBtn.closest(".favorite-row");

    if (!row) return;

    cancelFavoriteRemoval(favoriteKey(
        Number(row.dataset.id),
        row.dataset.color || null,
        row.dataset.size || null
    ));

}, true);

// Пішли зі сторінки, поки йшов відлік — доводимо видалення до кінця.
// Інакше товар лишався б в обраному попри натиснуту кнопку: людина
// вважає його видаленим, а він на місці.
window.addEventListener("pagehide", () => {

    pendingRemovals.forEach((pending, key) => {

        const [id, color, size] = key.split("|");

        stopPendingRemoval(key);

        removeFavorite(Number(id), { color: color || null, size: size || null });

    });

});

// Перемальовуємо список одразу після зміни обраного.
//
// Виняток — кнопка видалення: у неї свій сценарій із відліком, і
// перемальовування стерло б рядок разом із кнопкою «Залишити товар».
document.addEventListener("click", event => {

    if (!event.target.closest(".favorite")) return;

    if (event.target.closest(".favorite-row-remove")) return;

    if (hasPendingRemovals()) return;

    renderFavorites();

});

initFavorites();
