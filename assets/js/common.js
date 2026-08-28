// ======================================
// common.js
// Загальна логіка сайту BestBrnd4u
// ======================================

// -------------------------
// Екранування тексту з товарів (назва, бренд, опис, колір тощо)
// перед вставкою в HTML.
//
// Ці поля заповнюються в адмінці або через масовий Excel-імпорт
// (admin/import.js) — тобто це не жорстко контрольований розробником
// текст, а довільний ввід. Раніше вони вставлялись у шаблони
// напряму (`${product.title}`), тож символи <, >, " у назві товару
// чи кольору ставали справжньою HTML/JS-розміткою на сторінці —
// класична stored-XSS: досить одного товару з "<script>" у назві,
// імпортованого з чужого прайс-листа, і код виконається в браузері
// кожного відвідувача сайту.
//
// escapeHtml — для тексту й атрибутів у подвійних лапках (більшість
// місць). escapeAttrSingleQuoted — додатково екранує ' для тих
// нечастих місць, де атрибут обгорнутий в одинарні лапки (наприклад
// data-images='...json...' у картці товару).
function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

}

function escapeAttrSingleQuoted(value) {

    return escapeHtml(value).replace(/'/g, "&#39;");

}

// -------------------------
// Забороняємо нативне "підняття" картинки (drag) —
// саме воно і показувало білу підкладку під фото при
// протягуванні пальцем. На відміну від touch-action:pan-x
// (яке ми пробували раніше і яке ламало звичайний
// вертикальний скрол сторінки), це не чіпає скрол взагалі —
// блокується лише сама дія "перетягнути картинку".
// -------------------------
// Телефон: клік → дзвінок
//
// href будуємо з тексту самого посилання, а не тримаємо окремо:
// номер показаний на 14 сторінках, і якби href задавався руками,
// після зміни номера частина сторінок дзвонила б на старий.
// Тепер достатньо змінити видимий текст.
// -------------------------

function syncPhoneLinks() {

    document.querySelectorAll("a.phone-link").forEach(link => {

        const digits = link.textContent.replace(/[^\d+]/g, "");

        // у номері-заглушці ("+380 XX XXX XX XX") цифр замало —
        // не робимо посилання, щоб не дзвонити в нікуди
        if (digits.replace(/\D/g, "").length < 10) {

            link.removeAttribute("href");

            return;

        }

        link.href = `tel:${digits}`;

    });

}

document.addEventListener("DOMContentLoaded", syncPhoneLinks);

// -------------------------
// Плавний скрол до якорів на сторінці з урахуванням висоти шапки.
//
// Раніше зсув задавався у CSS (scroll-padding-top + scroll-margin-top)
// підібраними під шапку 82px числами. На телефоні шапка іншої висоти,
// тож сторінка зупинялась вище за потрібний заголовок. Тепер висоту
// міряємо в момент кліку — працює на будь-якій ширині екрана.
// -------------------------

document.addEventListener("click", event => {

    const link = event.target.closest?.('a[href^="#"]');

    if (!link) return;

    const id = link.getAttribute("href").slice(1);

    if (!id) return;

    const target = document.getElementById(id);

    if (!target) return;

    event.preventDefault();

    const header = document.querySelector("header");
    const offset = (header ? header.offsetHeight : 0) + 12;

    // Цілимось у сам заголовок секції, а не в її верхній край:
    // у секцій є власний padding-top, і скрол до краю лишав помітний
    // порожній простір над рядком «Популярні товари».
    const heading = target.querySelector("h1, h2, .section-title") || target;

    // scrollIntoView + scroll-margin-top, а НЕ ручний window.scrollTo.
    //
    // Ручний варіант рахує кінцеву позицію один раз, на момент кліку.
    // На головній вище за «Популярні товари» лежать банер і стрічка
    // брендів із картинками: поки триває плавний скрол, вони
    // дозавантажуються, висота сторінки змінюється — і сторінка
    // зупиняється не там, де ціль опинилась насправді. На iPhone до
    // цього додається згортання адресного рядка, яке теж змінює
    // висоту вікна посеред анімації.
    //
    // scrollIntoView віддає розрахунок браузеру: він тримає ціль
    // із урахуванням зсувів верстки до кінця анімації.
    heading.style.scrollMarginTop = `${offset}px`;

    heading.scrollIntoView({ behavior: "smooth", block: "start" });

    // ДОГАНЯЄМО ЦІЛЬ ПІСЛЯ АНІМАЦІЇ.
    //
    // На головній вище за «Популярні товари» лежать секції, які
    // наповнюються асинхронно з JSON (акції, колекції, добірки
    // брендів — частина з них узагалі стартує з hidden). Вони
    // з'являються ВЖЕ ПІСЛЯ початку прокрутки і зсувають ціль униз,
    // тож будь-яка позиція, порахована наперед, стає застарілою —
    // саме тому сторінка зупинялась на стрічці брендів замість
    // потрібного заголовка.
    //
    // Тому кілька разів перевіряємо фактичне положення і, якщо воно
    // з'їхало, доводимо до потрібного. Перевірки припиняються, щойно
    // користувач сам почав гортати — щоб не смикати сторінку під ним.
    let userInterrupted = false;

    const stop = () => { userInterrupted = true; };

    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });

    [350, 700, 1100, 1600].forEach(delay => {

        setTimeout(() => {

            if (userInterrupted) return;

            const diff = heading.getBoundingClientRect().top - offset;

            // 2px — щоб не смикати через похибку округлення
            if (Math.abs(diff) > 2) {

                window.scrollBy({ top: diff, behavior: "smooth" });

            }

        }, delay);

    });

    setTimeout(() => {

        window.removeEventListener("wheel", stop);
        window.removeEventListener("touchstart", stop);

    }, 1800);

});

document.addEventListener("dragstart", event => {

    if (event.target.tagName === "IMG") event.preventDefault();

});

// -------------------------
// Фіксований набір кольорів/розмірів
//
// В products.json немає even даних про реально доступні
// варіанти по кожному товару окремо, тому на картці
// каталогу, в обраному і в кошику використовується той
// самий єдиний набір, що й раніше був захардкоджений на
// сторінці товару (product.js).
// -------------------------

// Розміри поки що спільні для всіх товарів (у products.json
// немає окремих даних про доступні розміри по товару) —
// на відміну від кольору, який тепер береться з product.variants.
const PRODUCT_SIZES = ["S", "M", "L"];

// -------------------------
// LocalStorage
// -------------------------

function getStorage(key) {
    return JSON.parse(localStorage.getItem(key)) || [];
}

function setStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// -------------------------
// Кеш товарів (потрібен для поп-апу міні-кошика
// на будь-якій сторінці, незалежно від того, що
// саме завантажує сама сторінка)
// -------------------------

let cachedProducts = null;

// Синхронний пошук у вже завантаженому каталозі.
//
// Потрібен там, де посилання будується в обробнику кліку і чекати на
// fetch ніколи: getProductById() асинхронний, а перехід має статись
// одразу. Якщо каталог ще не завантажився — повертаємо null, і
// productUrl() відкотиться на ?id=, який усе одно доведе до товару.
function findCachedProduct(id) {

    if (!Array.isArray(cachedProducts)) return null;

    return cachedProducts.find(item => Number(item.id) === Number(id)) || null;

}

async function getProductById(id) {

    if (!cachedProducts) {

        try {

            const response = await fetch(dataUrl("data/products.json"));

            cachedProducts = await response.json();

        } catch (error) {

            console.error(error);

            return null;

        }

    }

    return cachedProducts.find(item => Number(item.id) === Number(id));

}

async function getAllProductsCached() {

    if (!cachedProducts) {

        try {

            const response = await fetch(dataUrl("data/products.json"));

            cachedProducts = await response.json();

        } catch (error) {

            console.error(error);

            return [];

        }

    }

    return cachedProducts;

}

// -------------------------
// Переглянуті товари
//
// Зберігаємо в localStorage лише масив id (найновіший — першим),
// самі дані товару підвантажуються через getAllProductsCached()
// при рендері віджету — це працює однаково на будь-якій сторінці
// (каталог, картка товару), незалежно від того, що саме конкретна
// сторінка вже завантажила сама.
// -------------------------

// Ключ НАВМИСНО лишається зі старою назвою (bagvero_).
// Це ідентифікатор у localStorage відвідувача, він ніде не
// показується. Перейменування стерло б список нещодавно
// переглянутих товарів у всіх, хто вже був на сайті.
const RECENTLY_VIEWED_KEY = "bagvero_recently_viewed";
const RECENTLY_VIEWED_LIMIT = 12;

function trackRecentlyViewed(productId) {

    const id = Number(productId);

    if (!id) return;

    let ids = getStorage(RECENTLY_VIEWED_KEY).map(Number).filter(Boolean);

    ids = ids.filter(existingId => existingId !== id);

    ids.unshift(id);

    setStorage(RECENTLY_VIEWED_KEY, ids.slice(0, RECENTLY_VIEWED_LIMIT));

}

async function renderRecentlyViewed(options) {

    const {
        sectionId = "recentlyViewedSection",
        gridId = "recentlyViewedGrid",
        carouselId = "recentlyViewedCarousel",
        excludeId = null,
        limit = 8
    } = options || {};

    const section = document.getElementById(sectionId);
    const grid = document.getElementById(gridId);

    if (!section || !grid) return;

    const ids = getStorage(RECENTLY_VIEWED_KEY)
        .map(Number)
        .filter(id => id && id !== Number(excludeId));

    if (!ids.length) return;

    const allProducts = await getAllProductsCached();

    const list = ids
        .map(id => allProducts.find(item => Number(item.id) === id))
        .filter(Boolean)
        .slice(0, limit);

    if (!list.length) return;

    grid.innerHTML = list.map(product => createProductCard(product)).join("");

    if (typeof initProductCarousels === "function") initProductCarousels(grid);
    if (typeof updateFavoriteButtons === "function") updateFavoriteButtons();
    if (typeof initCarousel === "function" && carouselId) initCarousel(document.getElementById(carouselId));

    section.hidden = false;

}

// -------------------------
// Кошик
//
// Кожна позиція — об'єкт { id, color, size },
// а не просто число. Це потрібно, щоб та сама
// сумка з різним кольором/розміром зберігалася і
// показувалася як окремі рядки кошика.
//
// normalizeCartEntry залишено для зворотної
// сумісності зі старими кошиками, де лежали
// просто числа id (без кольору/розміру).
// -------------------------

function normalizeCartEntry(entry) {

    if (entry && typeof entry === "object") {

        return {
            id: Number(entry.id),
            color: entry.color || null,
            size: entry.size || null
        };

    }

    return { id: Number(entry), color: null, size: null };

}

function getCart() {
    return getStorage("cart").map(normalizeCartEntry);
}

function saveCart(cart) {
    setStorage("cart", cart);
    updateCartCounter();
}

// ключ варіанта товару — за ним групуються
// однакові id з однаковим кольором/розміром
function cartKey(entry) {
    return `${entry.id}__${entry.color || ""}__${entry.size || ""}`;
}

// згруповані рядки кошика: [{id, color, size, qty}]
function getGroupedCartLines() {

    const groups = {};

    getCart().forEach(entry => {

        const key = cartKey(entry);

        if (!groups[key]) {

            groups[key] = {
                id: entry.id,
                color: entry.color,
                size: entry.size,
                qty: 0
            };

        }

        groups[key].qty += 1;

    });

    return Object.values(groups);

}

async function addToCart(id, options = {}) {

    const { color = null, size = null } = options;

    const cart = getCart();

    cart.push({ id: Number(id), color, size });

    saveCart(cart);

    const product = await getProductById(id);

    if (product) {

        // Статистика: подія йде лише після згоди — модуль сам це
        // перевіряє (assets/js/analytics.js).
        window.Analytics?.addToCart(product, { color, size });

        showCartPopup(product, { color, size });

    } else {

        showToast("Товар додано в кошик");

    }

}

function updateCartCounter() {

    const counter = document.getElementById("cartCount");

    if (!counter) return;

    counter.textContent = getCart().length;

}

// -------------------------
// Міні-кошик (поп-ап під іконкою кошика)
// -------------------------

function getCartSummary() {

    const cart = getCart();

    let subtotal = 0;

    cart.forEach(entry => {

        const product = cachedProducts?.find(item => Number(item.id) === entry.id);

        if (product) {

            subtotal += product.price;

        }

    });

    return { itemsCount: cart.length, subtotal };

}

function showCartPopup(product, selection = {}) {

    const popup = document.getElementById("cartPopup");

    if (!popup) {

        showToast("Товар додано в кошик");

        return;

    }

    const { itemsCount, subtotal } = getCartSummary();

    const image = product.images?.[0] || "assets/images/no-image.png";

    const metaParts = [];

    if (selection.color) metaParts.push(`Колір: ${selection.color}`);
    if (selection.size) metaParts.push(`Розмір: ${selection.size}`);

    const metaHtml = metaParts.length
        ? `<div class="cart-popup-item-meta">${metaParts.join(" · ")}</div>`
        : "";

    popup.innerHTML = `
        <div class="cart-popup-header">
            Товар додано в кошик
            <span>${itemsCount}</span>
        </div>

        <div class="cart-popup-item">
            <img
                src="${image}"
                alt="${escapeHtml(product.title)}"
                onerror="this.src='assets/images/no-image.png'">
            <div class="cart-popup-item-info">
                ${product.brand ? `<div class="cart-popup-item-brand">${escapeHtml(product.brand)}</div>` : ""}
                <div class="cart-popup-item-title">${escapeHtml(product.title)}</div>
                ${metaHtml}
                <div class="cart-popup-item-price">${formatPrice(product.price)}</div>
            </div>
        </div>

        <div class="cart-popup-total">
            <span>Сума замовлення</span>
            <span>${formatPrice(subtotal)}</span>
        </div>

        <a href="checkout" class="btn">Оформити замовлення</a>
        <a href="cart" class="cart-popup-link">Перейти до кошика</a>
    `;

    popup.hidden = false;

    requestAnimationFrame(() => popup.classList.add("show"));

    clearTimeout(window.cartPopupTimer);

    window.cartPopupTimer = setTimeout(hideCartPopup, 4500);

}

function hideCartPopup() {

    const popup = document.getElementById("cartPopup");

    if (!popup) return;

    popup.classList.remove("show");

    setTimeout(() => {

        popup.hidden = true;

    }, 250);

}

// закриття по кліку поза поп-апом
document.addEventListener("click", event => {

    const popup = document.getElementById("cartPopup");

    if (!popup || popup.hidden) return;

    const wrap = event.target.closest(".cart-icon-wrap");

    if (!wrap) {

        hideCartPopup();

    }

});

// -------------------------
// Обране
//
// Кожен запис — об'єкт { id, color, size }, як і в
// кошику: колір/розмір, обрані на картці чи сторінці
// товару в момент кліку на ❤, зберігаються разом з
// товаром і можуть бути змінені пізніше на сторінці
// "Обране". На відміну від кошика, тут один товар —
// один запис (серце просто вкл/викл для товару,
// а не для конкретного варіанта).
//
// normalizeFavoriteEntry залишено для зворотної
// сумісності зі старим обраним, де лежали просто
// числа id (без кольору/розміру).
// -------------------------

function normalizeFavoriteEntry(entry) {

    if (entry && typeof entry === "object") {

        return {
            id: Number(entry.id),
            color: entry.color || null,
            size: entry.size || null
        };

    }

    return { id: Number(entry), color: null, size: null };

}

function getFavorites() {

    return getStorage("favorites").map(normalizeFavoriteEntry);

}

function saveFavorites(list) {

    setStorage("favorites", list);

    updateFavoriteCounter();

}

function isFavorite(id, color = null, size = null) {

    return getFavorites().some(entry =>
        entry.id === Number(id) &&
        entry.color === color &&
        entry.size === size
    );

}

function toggleFavorite(id, options = {}) {

    const { color = null, size = null } = options;

    let favorites = getFavorites();

    const alreadyFavorite = favorites.some(entry =>
        entry.id === Number(id) &&
        entry.color === color &&
        entry.size === size
    );

    if (alreadyFavorite) {

        favorites = favorites.filter(entry =>
            !(entry.id === Number(id) && entry.color === color && entry.size === size)
        );

        showToast("Видалено з обраного");

    } else {

        favorites.push({ id: Number(id), color, size });

        // Статистика: що додають в обране, показує, чого бракує в
        // магазині — люди відкладають те, що хочуть, але поки не беруть.
        const cached = findCachedProduct(Number(id));

        if (cached) window.Analytics?.addToWishlist(cached, { color, size });

        showToast("Додано в обране");

    }

    saveFavorites(favorites);

    updateFavoriteButtons();

}

// ВИДАЛЕННЯ, а не перемикання.
//
// ЧОМУ ОКРЕМА ФУНКЦІЯ
// --------------------
// На сторінці «Обране» кнопка «✕ Видалити з обраного» означає рівно
// одне: прибрати рядок. Раніше вона кликала toggleFavorite() — а це
// перемикач. Достатньо було, щоб рядок лишився на екрані на секунду
// довше (наприклад, поки відкрите вікно підтвердження), і другий клац
// по тій самій кнопці ДОДАВАВ товар назад: у списку його вже не було,
// тож перемикач працював у зворотний бік.
//
// Видалення мусить бути ідемпотентним: другий, третій, десятий виклик
// не може нічого повернути. Повертаємо true/false — чи справді щось
// прибрали, щоб не показувати «Видалено» на порожню дію.
function removeFavorite(id, options = {}) {

    const { color = null, size = null } = options;

    const favorites = getFavorites();

    const rest = favorites.filter(entry =>
        !(entry.id === Number(id) && entry.color === color && entry.size === size)
    );

    if (rest.length === favorites.length) return false;

    saveFavorites(rest);

    updateFavoriteButtons();

    return true;

}

// зміна кольору/розміру вже доданого в обране товару.
// На відміну від кошика, тут кожен запис унікальний за
// (id, колір, розмір) — тож якщо користувач перемикає
// варіант на той, що вже окремо є в обраному, просто
// прибираємо старий запис замість дубля.
function changeFavoriteVariant(id, oldColor, oldSize, field, value) {

    let favorites = getFavorites();

    const index = favorites.findIndex(entry =>
        entry.id === Number(id) &&
        (entry.color || null) === (oldColor || null) &&
        (entry.size || null) === (oldSize || null)
    );

    if (index === -1) return;

    const updated = { ...favorites[index], [field]: value };

    const duplicateIndex = favorites.findIndex((entry, i) =>
        i !== index &&
        entry.id === updated.id &&
        (entry.color || null) === (updated.color || null) &&
        (entry.size || null) === (updated.size || null)
    );

    // Такий варіант уже є у списку — НЕ змінюємо.
    //
    // Раніше тут стояло favorites.splice(index, 1): рядок, який
    // редагували, мовчки зникав. Ззовні це виглядало як «два товари
    // обʼєднались в один», хоча насправді один із них видалявся —
    // і людина не просила його видаляти, вона лише перемикала колір.
    //
    // Відмовити чесніше: обидва рядки лишаються на місці, а причина
    // називається вголос. Список зберігає рівно те, що в нього клали.
    if (duplicateIndex !== -1) return false;

    favorites[index] = updated;

    saveFavorites(favorites);

    return true;

}

function updateFavoriteButtons() {

    document.querySelectorAll(".favorite").forEach(button => {

        const id = Number(button.dataset.id);

        const scope = button.closest("#productPage")
            || button.closest(".product-card, .favorite-row");

        const { color, size } = getSelectedVariant(scope);

        button.classList.toggle("active", isFavorite(id, color, size));

    });

}

// лічильник ❤ в шапці — працює так само, як #cartCount
function updateFavoriteCounter() {

    const counter = document.getElementById("favCount");

    if (!counter) return;

    counter.textContent = getFavorites().length;

}

// -------------------------
// Toast
// -------------------------

// -------------------------
// Підтвердження перед видаленням
//
// Видалити товар із кошика чи обраного можна було одним випадковим
// дотиком — кнопка «✕» стоїть поруч із кількістю, а повернути
// видалене нічим. Тому питаємо.
//
// Свій діалог, а не вбудований confirm(): вбудований на телефоні
// виглядає системним вікном браузера з адресою сайту, ламає стиль і
// на iOS блокує сторінку цілком.
// -------------------------

function askConfirm(options) {

    const {
        title = "Видалити товар?",
        text = "Цю дію не можна скасувати.",
        confirmLabel = "Видалити",
        cancelLabel = "Скасувати"
    } = options || {};

    return new Promise(resolve => {

        const overlay = document.createElement("div");

        overlay.className = "confirm-overlay";
        overlay.innerHTML = `
            <div class="confirm-box" role="dialog" aria-modal="true"
                 aria-labelledby="confirmTitle">
                <h3 class="confirm-title" id="confirmTitle">${escapeHtml(title)}</h3>
                <p class="confirm-text">${escapeHtml(text)}</p>
                <div class="confirm-actions">
                    <button type="button" class="btn btn-outline" data-confirm="no">
                        ${escapeHtml(cancelLabel)}
                    </button>
                    <button type="button" class="btn confirm-danger" data-confirm="yes">
                        ${escapeHtml(confirmLabel)}
                    </button>
                </div>
            </div>`;

        // Куди повернути фокус після закриття: інакше людина, що
        // ходить клавіатурою, опиниться на початку сторінки.
        const returnTo = document.activeElement;

        function close(answer) {

            document.removeEventListener("keydown", onKey);
            overlay.remove();
            document.body.classList.remove("confirm-open");

            if (returnTo && document.contains(returnTo)) returnTo.focus();

            resolve(answer);

        }

        function onKey(event) {

            if (event.key === "Escape") close(false);

            // Tab по колу всередині вікна: без цього фокус іде на
            // сторінку під діалогом, і незрозуміло, де ти зараз.
            if (event.key === "Tab") {

                const items = [...overlay.querySelectorAll("button")];

                if (!items.length) return;

                const first = items[0];
                const last = items[items.length - 1];

                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }

            }

        }

        overlay.addEventListener("click", event => {

            const answer = event.target.closest("[data-confirm]");

            // клац повз вікно = скасувати
            if (event.target === overlay) return close(false);

            if (answer) close(answer.dataset.confirm === "yes");

        });

        document.addEventListener("keydown", onKey);
        document.body.classList.add("confirm-open");
        document.body.appendChild(overlay);

        // Фокус на «Скасувати», а не на «Видалити»: випадковий Enter
        // одразу після відкриття не має нічого стирати.
        overlay.querySelector('[data-confirm="no"]')?.focus();

    });

}

// Адреса файлу даних із версією.
//
// Файли data/*.json тягне fetch, і кеш зберігає їх за адресою — так
// само, як скрипти. Тобто після викладки новий товар міг не зʼявитись
// іще довго, хоча сам файл на сервері вже оновився.
//
// Версії кладе в HTML крок збірки scripts/apply-cache-version.js:
//
//     window.ASSET_VERSIONS = { "data/products.json": "9b2e01", ... }
//
// Тут ми просто дописуємо потрібну до адреси. Змінився файл —
// змінилась версія — змінилась адреса — кеш іде по нову копію.
// Не змінився — адреса та сама, і файл береться з кеша, як і має бути.
//
// Якщо версій чомусь немає (сторінку відкрили без цього кроку збірки),
// повертаємо адресу як є: гірше, ніж могло б бути, але точно не зламано.
function dataUrl(url) {

    // Ключі у списку версій без початкового «/» (data/products.json),
    // а в коді трапляється й абсолютний шлях (/data/products.json —
    // сторінки товарів лежать у /p/<slug>/, тож відносний туди не
    // веде). Шукаємо за обома формами, інакше саме той файл лишився б
    // без версії й протухав би в кеші.
    const key = String(url).replace(/^\//, "");

    const version = window.ASSET_VERSIONS && window.ASSET_VERSIONS[key];

    return version ? `${url}?v=${version}` : url;

}

// Куди йдуть листи з форм сайту.
//
// ЧОМУ ТУТ ЯВНА АДРЕСА, А НЕ ТОКЕН
// ---------------------------------
// Раніше стояв токен FormSubmit — «b8e2e26d…». Такий псевдонім сервіс
// видає під конкретну пошту, і саме в цьому була проблема: токен
// лишався з часів налаштування й вів на особистий gmail. У коді ніякої
// адреси не було, тож знайти причину пошуком по проєкту не вдавалося —
// листи просто приходили не туди.
//
// Токен існує, щоб не світити адресу збирачам спаму. Але тут він цього
// не дає: bestbrnd4u@proton.me відкрито напечатана на сторінці
// контактів, у підвалі й у політиці конфіденційності. Ховати її в
// одному місці, показуючи в трьох інших, — самообман, за який платимо
// тим, що не видно, куди насправді йдуть листи.
//
// Явна адреса натомість видна відразу: помилку в ній помітно при
// першому ж читанні коду.
//
// Константа тут, а не в checkout.js, бо форм дві — оформлення
// замовлення і «Написати нам» у контактах. Дві копії рано чи пізно
// розійшлися б, і одна з форм почала б слати листи в нікуди.
const FORMSUBMIT_TARGET = "bestbrnd4u@proton.me";

function sendViaFormSubmit(payload) {

    return fetch(`https://formsubmit.co/ajax/${FORMSUBMIT_TARGET}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify(payload)
    });

}

function showToast(text) {

    let toast = document.getElementById("toast");

    if (!toast) {

        toast = document.createElement("div");

        toast.id = "toast";

        toast.className = "toast";

        document.body.appendChild(toast);

    }

    toast.textContent = text;

    toast.classList.add("show");

    clearTimeout(window.toastTimer);

    window.toastTimer = setTimeout(() => {

        toast.classList.remove("show");

    }, 2500);

}

// -------------------------
// Пошук (шапка сайту)
// -------------------------

// -------------------------
// Глобальний пошук (оверлей у стилі Nike)
// -------------------------

const POPULAR_SEARCHES = ["Guess", "Michael Kors", "Рюкзаки", "Жіночі сумки", "Чоловічі сумки", "Furla"];
const RECENT_SEARCHES_KEY = "recentSearches";
const MAX_RECENT_SEARCHES = 6;
const MAX_SEARCH_RESULTS = 6;

let searchOverlayEl = null;
let searchDebounceTimer = null;

// -------------------------
// Блокування скролу без "стрибка" верстки
//
// document.body.style.overflow = "hidden" прибирає смугу
// прокрутки, і сторінка (а разом з нею fixed-хедер) стає
// трохи ширшою — все "стрибає" на ширину смуги прокрутки.
// Компенсуємо це padding-right на body І на хедері (він
// position:fixed і сам по собі padding body не бачить).
// -------------------------

function lockPageScroll() {

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {

        document.body.style.paddingRight = `${scrollbarWidth}px`;

        const headerEl = document.querySelector("header");

        if (headerEl) headerEl.style.paddingRight = `${scrollbarWidth}px`;

    }

}

function unlockPageScroll() {

    document.body.style.overflow = "";
    document.body.style.paddingRight = "";

    const headerEl = document.querySelector("header");

    if (headerEl) headerEl.style.paddingRight = "";

}

function getRecentSearches() {
    return getStorage(RECENT_SEARCHES_KEY);
}

function saveRecentSearch(term) {

    const clean = term.trim();

    if (!clean) return;

    let list = getRecentSearches().filter(item => item.toLowerCase() !== clean.toLowerCase());

    list.unshift(clean);

    list = list.slice(0, MAX_RECENT_SEARCHES);

    setStorage(RECENT_SEARCHES_KEY, list);

}

function removeRecentSearch(term) {

    const list = getRecentSearches().filter(item => item !== term);

    setStorage(RECENT_SEARCHES_KEY, list);

}

function buildSearchOverlay() {

    const overlay = document.createElement("div");

    overlay.id = "searchOverlay";
    overlay.className = "search-overlay";
    overlay.hidden = true;

    overlay.innerHTML = `
        <div class="search-overlay-panel">

            <div class="search-overlay-bar container">
                <div class="search-overlay-input-wrap">
                    <span class="search-overlay-icon">🔍</span>
                    <input type="text" id="globalSearchInput" placeholder="Пошук товарів..." autocomplete="off">
                    <button type="button" id="globalSearchClear" class="search-overlay-clear" hidden>✕</button>
                </div>
                <button type="button" id="globalSearchCancel" class="search-overlay-cancel">Скасувати</button>
            </div>

            <div class="search-overlay-body container">

                <div id="searchIdleState" class="search-idle">

                    <div class="search-idle-main">

                        <div class="search-section">
                            <div class="search-section-title">Популярні запити</div>
                            <div id="searchPopular" class="search-chip-list"></div>
                        </div>

                        <div class="search-section" id="searchRecentSection" hidden>
                            <div class="search-section-title">Останні пошуки</div>
                            <div id="searchRecent" class="search-recent-list"></div>
                        </div>

                    </div>

                    <div class="search-promo-banners">

                        <a href="catalog?gender=Чоловікам" class="search-promo-banner" data-banner="men">
                            <span>Чоловікам</span>
                        </a>

                        <a href="catalog?gender=Жінкам" class="search-promo-banner" data-banner="women">
                            <span>Жінкам</span>
                        </a>

                        <a href="catalog?section=new" class="search-promo-banner search-promo-new" data-banner="new">
                            <span>Новинки</span>
                        </a>

                        <a href="catalog?section=sale" class="search-promo-banner search-promo-sale" data-banner="sale">
                            <span>Акції</span>
                        </a>

                    </div>

                </div>

                <div id="searchResultsState" class="search-results" hidden>

                    <div class="search-suggestions">
                        <div class="search-section-title">Підказки</div>
                        <div id="searchSuggestions" class="search-suggestion-list"></div>
                    </div>

                    <div class="search-results-main">
                        <div class="search-section-title">Товари</div>
                        <div id="searchResultsGrid" class="search-results-grid"></div>
                        <p id="searchNoResults" class="search-no-results" hidden>
                            Нічого не знайдено. Спробуйте інший запит.
                        </p>
                        <a href="catalog" id="searchSeeAll" class="search-see-all" hidden>
                            Показати всі результати →
                        </a>
                    </div>

                </div>

            </div>

        </div>
        <div class="search-overlay-backdrop"></div>
    `;

    document.body.appendChild(overlay);

    applySearchBanners(overlay);

    return overlay;

}

// Картинки плиток «Чоловікам» / «Жінкам» у вікні пошуку.
//
// Адреси лежать у data/search-banners.json і редагуються в адмінці
// (розділ «Сторінки» → «Картинки в пошуку»), тому в розмітці їх немає —
// елемент несе лише data-banner="men|women".
//
// Кожній плитці ставимо дві CSS-змінні: --banner-lg для комп'ютера і
// --banner-sm для телефона. Перемикання між ними — у медіазапиті в
// style.css: адреси задає адміністратор, тож двома готовими правилами
// це не опишеш.
//
// Якщо файл не приїде або в ньому нічого не вибрано, плитка лишиться
// темною (background-color) з читабельним білим підписом — краще так,
// ніж порожній світлий прямокутник із невидимим текстом.
const SEARCH_BANNERS_URL = "data/search-banners.json";

let searchBannersPromise = null;

function loadSearchBanners() {

    if (!searchBannersPromise) {

        searchBannersPromise = fetch(SEARCH_BANNERS_URL)
            .then(response => response.ok ? response.json() : {})
            .catch(() => ({}));

    }

    return searchBannersPromise;

}

function applySearchBanners(root) {

    const tiles = (root || document).querySelectorAll("[data-banner]");

    if (!tiles.length) return;

    loadSearchBanners().then(config => {

        tiles.forEach(tile => {

            const entry = (config || {})[tile.dataset.banner] || {};

            const set = (name, value) => {
                if (value) tile.style.setProperty(name, `url('${encodeURI(value)}')`);
                else tile.style.removeProperty(name);
            };

            set("--banner-lg", entry.desktop);
            set("--banner-sm", entry.mobile);

            // Підпис на картинці вже є — свій не малюємо.
            //
            // Картинки, намальовані під ці плитки, часто вже містять
            // напис («WOMEN», «SALE»). Якщо поверх нього покласти ще й
            // підпис сайту, на плитці виявиться два тексти одночасно.
            // Вибір лишається за адміністратором: у нього може бути й
            // фото без напису, і тоді підпис потрібен.
            const label = tile.querySelector("span");

            if (label) label.hidden = !!entry.hideLabel;

        });

    });

}

// Тримає таймер відкладеного надсилання пошукового запиту.
function reportSearch() {}

function matchesQuery(product, q) {

    const haystack = [
        product.title,
        product.brand,
        product.category,
        product.description,
        ...(product.searchKeywords || [])
    ].filter(Boolean).join(" ").toLowerCase();

    return haystack.includes(q);

}

async function runGlobalSearch(query) {

    const idleState = document.getElementById("searchIdleState");
    const resultsState = document.getElementById("searchResultsState");
    const clearBtn = document.getElementById("globalSearchClear");

    const q = query.trim().toLowerCase();

    clearBtn.hidden = q.length === 0;

    if (!q) {

        idleState.hidden = false;
        resultsState.hidden = true;

        return;

    }

    idleState.hidden = true;
    resultsState.hidden = false;

    await getProductById(-1); // гарантовано підвантажує cachedProducts

    const matches = (cachedProducts || []).filter(product => matchesQuery(product, q));

    // Статистика: що шукають і чи знаходять.
    //
    // Найцінніше тут — запити з нулем результатів: це прямий список
    // того, чого в магазині бракує, сказаний словами покупців.
    //
    // Надсилаємо із затримкою: людина набирає по літері, і без неї
    // у звіт полетіли б «с», «су», «сум», «сумк», «сумка».
    clearTimeout(reportSearch.timer);

    reportSearch.timer = setTimeout(function () {
        window.Analytics?.search(q, matches.length);
    }, 900);

    const suggestionsEl = document.getElementById("searchSuggestions");
    const gridEl = document.getElementById("searchResultsGrid");
    const noResultsEl = document.getElementById("searchNoResults");
    const seeAllEl = document.getElementById("searchSeeAll");

    // підказки — унікальні назви товарів, що збігаються
    const suggestions = [...new Set(matches.map(p => p.title))].slice(0, 6);

    suggestionsEl.innerHTML = suggestions.length
        ? suggestions.map(title => `<button type="button" class="search-suggestion-item">${title}</button>`).join("")
        : `<p class="search-no-suggestions">Немає підказок</p>`;

    suggestionsEl.querySelectorAll(".search-suggestion-item").forEach(btn => {

        btn.addEventListener("click", () => {

            const input = document.getElementById("globalSearchInput");

            input.value = btn.textContent;

            runGlobalSearch(btn.textContent);

        });

    });

    gridEl.innerHTML = matches.slice(0, MAX_SEARCH_RESULTS).map(product => {

        const image = product.images?.[0] || "assets/images/no-image.png";

        return `
            <a href="${productUrl(product)}" class="search-result-card">
                <div class="search-result-image">
                    <img src="${image}" alt="${escapeHtml(product.title)}" onerror="this.src='assets/images/no-image.png'">
                </div>
                <div class="search-result-brand">${escapeHtml(product.brand)}</div>
                <div class="search-result-title">${escapeHtml(product.title)}</div>
                <div class="search-result-price">${formatPrice(product.price)}</div>
            </a>
        `;

    }).join("");

    gridEl.querySelectorAll(".search-result-card").forEach(card => {

        card.addEventListener("click", () => saveRecentSearch(query));

    });

    noResultsEl.hidden = matches.length !== 0;

    seeAllEl.hidden = matches.length === 0;
    seeAllEl.href = `catalog?search=${encodeURIComponent(query.trim())}`;

}

function renderSearchIdleLists() {

    const popularEl = document.getElementById("searchPopular");
    const recentSection = document.getElementById("searchRecentSection");
    const recentEl = document.getElementById("searchRecent");

    popularEl.innerHTML = POPULAR_SEARCHES.map(term =>
        `<button type="button" class="search-chip">${term}</button>`
    ).join("");

    popularEl.querySelectorAll(".search-chip").forEach(chip => {

        chip.addEventListener("click", () => {

            const input = document.getElementById("globalSearchInput");

            input.value = chip.textContent;

            runGlobalSearch(chip.textContent);

        });

    });

    const recent = getRecentSearches();

    recentSection.hidden = recent.length === 0;

    recentEl.innerHTML = recent.map(term => `
        <div class="search-recent-item" data-term="${term}">
            <span class="search-recent-term">${term}</span>
            <button type="button" class="search-recent-remove" aria-label="Видалити">✕</button>
        </div>
    `).join("");

    recentEl.querySelectorAll(".search-recent-item").forEach(item => {

        const term = item.dataset.term;

        item.querySelector(".search-recent-term").addEventListener("click", () => {

            const input = document.getElementById("globalSearchInput");

            input.value = term;

            runGlobalSearch(term);

        });

        item.querySelector(".search-recent-remove").addEventListener("click", event => {

            event.stopPropagation();

            removeRecentSearch(term);

            renderSearchIdleLists();

        });

    });

}

function openSearchOverlay() {

    if (!searchOverlayEl) {

        searchOverlayEl = buildSearchOverlay();

        const input = document.getElementById("globalSearchInput");
        const clearBtn = document.getElementById("globalSearchClear");
        const cancelBtn = document.getElementById("globalSearchCancel");
        const backdrop = searchOverlayEl.querySelector(".search-overlay-backdrop");

        input.addEventListener("input", () => {

            clearTimeout(searchDebounceTimer);

            searchDebounceTimer = setTimeout(() => runGlobalSearch(input.value), 150);

        });

        input.addEventListener("keydown", event => {

            if (event.key === "Enter" && input.value.trim()) {

                saveRecentSearch(input.value);

                window.location.href = `catalog?search=${encodeURIComponent(input.value.trim())}`;

            } else if (event.key === "Escape") {

                closeSearchOverlay();

            }

        });

        clearBtn.addEventListener("click", () => {

            input.value = "";

            input.focus();

            runGlobalSearch("");

        });

        cancelBtn.addEventListener("click", closeSearchOverlay);
        backdrop.addEventListener("click", closeSearchOverlay);

    }

    renderSearchIdleLists();

    searchOverlayEl.hidden = false;

    requestAnimationFrame(() => searchOverlayEl.classList.add("open"));

    lockPageScroll();

    const input = document.getElementById("globalSearchInput");

    input.value = "";

    runGlobalSearch("");

    setTimeout(() => input.focus(), 50);

}

function closeSearchOverlay() {

    if (!searchOverlayEl) return;

    searchOverlayEl.classList.remove("open");

    unlockPageScroll();

    setTimeout(() => {

        if (searchOverlayEl) searchOverlayEl.hidden = true;

    }, 200);

}

document.addEventListener("keydown", event => {

    if (event.key === "Escape" && searchOverlayEl && !searchOverlayEl.hidden) {

        closeSearchOverlay();

    }

});

const searchBtn = document.getElementById("searchBtn");

searchBtn?.addEventListener("click", openSearchOverlay);

// -------------------------
// Мобільне меню
//
// На вузьких екранах <nav> в хедері повністю ховається
// (див. nav{display:none} у style.css), а заміни йому не було —
// з хедера неможливо було потрапити в Каталог/Новинки/Акції
// та інші розділи. Кнопку-гамбургер і саму панель генеруємо тут
// і додаємо в усі сторінки одразу (як і поп-ап пошуку вище) —
// це той самий набір посилань, що й у десктопному <nav>.
// -------------------------

let mobileNavEl = null;
let mobileNavBackdropEl = null;

const mobileMenuBtn = (() => {

    const headerIcons = document.querySelector(".header-icons");

    if (!headerIcons) return null;

    const btn = document.createElement("button");

    btn.type = "button";
    btn.id = "mobileMenuBtn";
    btn.className = "mobile-menu-btn";
    btn.setAttribute("aria-label", "Меню");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "<span></span><span></span><span></span>";

    headerIcons.prepend(btn);

    return btn;

})();

// -------------------------
// Мобільний хедер: гамбургер + пошук + лого одним кластером
// ліворуч, обране/кошик — праворуч (обліковий запис на
// мобільному ховається через CSS, див. style.css). На десктопі
// лишаємо все як було раніше — переносимо елементи лише в межах
// того самого брейкпоинту, на якому й так ховається <nav>.
// -------------------------

(() => {

    const headerRow = document.querySelector("header .header");
    const logo = headerRow?.querySelector(".logo");
    const headerIcons = document.querySelector(".header-icons");

    if (!headerRow || !logo || !headerIcons) {
        headerRow?.classList.add("header-ready");
        return;
    }

    const mobileQuery = window.matchMedia("(max-width:768px)");

    function applyLayout(isMobile) {

        let headerLeft = document.querySelector(".header-left");

        if (isMobile) {

            if (headerLeft) return; // вже перебудовано

            headerLeft = document.createElement("div");
            headerLeft.className = "header-left";

            headerRow.insertBefore(headerLeft, logo);

            if (mobileMenuBtn) headerLeft.appendChild(mobileMenuBtn);
            if (searchBtn) headerLeft.appendChild(searchBtn);

        } else {

            if (!headerLeft) return; // і так у десктопному вигляді

            if (searchBtn) headerIcons.prepend(searchBtn);
            if (mobileMenuBtn) headerIcons.prepend(mobileMenuBtn);

            headerLeft.remove();

        }

    }

    applyLayout(mobileQuery.matches);

    mobileQuery.addEventListener("change", event => applyLayout(event.matches));

    // до цього моменту рядок шапки був прихований (visibility:hidden
    // в CSS), щоб уникнути "стрибка" — тепер розкладка вже фінальна,
    // можна показувати
    headerRow.classList.add("header-ready");

})();

function buildMobileNav() {

    const backdrop = document.createElement("div");

    backdrop.id = "mobileNavBackdrop";
    backdrop.className = "mobile-nav-backdrop";

    const nav = document.createElement("div");

    nav.id = "mobileNav";
    nav.className = "mobile-nav";

    nav.innerHTML = `
        <ul class="mobile-nav-list">
            <li><a href="/">Головна</a></li>
            <li><a href="catalog">Каталог</a></li>
            <li><a href="catalog?section=new">Новинки</a></li>
            <li><a href="catalog?section=sale" class="sale-text">Акції</a></li>
            <li><a href="bayer-service">Байєр-сервіс</a></li>
            <li><a href="contacts">Контакти</a></li>
            <li><a href="account">Особистий кабінет</a></li>
        </ul>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(nav);

    backdrop.addEventListener("click", closeMobileNav);

    nav.querySelectorAll("a").forEach(link => {

        link.addEventListener("click", closeMobileNav);

    });

    return { nav, backdrop };

}

function openMobileNav() {

    if (!mobileNavEl) {

        const built = buildMobileNav();

        mobileNavEl = built.nav;
        mobileNavBackdropEl = built.backdrop;

    }

    mobileMenuBtn.classList.add("open");
    mobileMenuBtn.setAttribute("aria-expanded", "true");

    mobileNavEl.classList.add("open");
    mobileNavBackdropEl.classList.add("open");

    lockPageScroll();

}

function closeMobileNav() {

    if (!mobileNavEl || !mobileNavEl.classList.contains("open")) return;

    mobileMenuBtn.classList.remove("open");
    mobileMenuBtn.setAttribute("aria-expanded", "false");

    mobileNavEl.classList.remove("open");
    mobileNavBackdropEl.classList.remove("open");

    unlockPageScroll();

}

mobileMenuBtn?.addEventListener("click", () => {

    if (mobileNavEl?.classList.contains("open")) {

        closeMobileNav();

    } else {

        openMobileNav();

    }

});

document.addEventListener("keydown", event => {

    if (event.key === "Escape") closeMobileNav();

});

// закриваємо мобільне меню, якщо екран розширили за брейкпоінт
// (наприклад, повернули телефон/склали складачку) — інакше
// панель могла лишитись відкритою поверх десктопного <nav>
window.matchMedia("(min-width:769px)").addEventListener("change", event => {

    if (event.matches) closeMobileNav();

});

// -------------------------
// Підписка на новини — тепер повністю на боці MailerLite
// (universal-скрипт у <head> + віджет .ml-embedded на сторінці)
// -------------------------

// -------------------------
// Scroll Top
// -------------------------

const scrollTopBtn = document.getElementById("scrollTop");

if (scrollTopBtn) {

    window.addEventListener("scroll", () => {

        scrollTopBtn.classList.toggle(
            "show",
            window.scrollY > 400
        );

    });

    scrollTopBtn.addEventListener("click", () => {

        window.scrollTo({

            top: 0,

            behavior: "smooth"

        });

    });

}

// -------------------------
// Плавний підйом до фото товару при зміні кольору
// -------------------------

// Хедер зафіксований зверху (position:fixed), тому при скролі
// до фото додаємо невеликий відступ, щоб верх фото не ховався під ним.
const PRODUCT_IMAGE_SCROLL_OFFSET = 96;

function scrollProductImageIntoView() {

    const mainPhoto = document.querySelector(".main-photo");

    if (!mainPhoto) return;

    const rect = mainPhoto.getBoundingClientRect();

    // якщо верх фото й так вже видно під хедером — нікуди не скролимо,
    // щоб не смикати сторінку зайвий раз
    if (rect.top >= PRODUCT_IMAGE_SCROLL_OFFSET) return;

    const targetY = Math.max(
        window.scrollY + rect.top - PRODUCT_IMAGE_SCROLL_OFFSET,
        0
    );

    window.scrollTo({

        top: targetY,

        behavior: "smooth"

    });

}

// -------------------------
// Делегування подій
// -------------------------

// -------------------------
// Обраний варіант (колір/розмір) у зоні картки/сторінки товару
// -------------------------

function getSelectedVariant(scope) {

    if (!scope) return { color: null, size: null };

    const color = scope.querySelector(".color.active")?.dataset.color
        || scope.querySelector(".mini-color.active")?.dataset.color
        || null;

    const size = scope.querySelector(".size.active")?.textContent.trim()
        || scope.querySelector(".mini-size.active")?.textContent.trim()
        || null;

    return { color, size };

}

// Розмір обов'язковий тільки якщо у товару реально є вибір
// (більше одного варіанту) — якщо розмір один-єдиний, він уже
// проставлений активним автоматично і нічого обирати не треба.
function isSizeSatisfied(scope) {

    const sizesWrap = scope.querySelector(".sizes, .product-sizes");

    if (!sizesWrap) return true;

    const options = sizesWrap.querySelectorAll(".size, .mini-size");

    if (options.length <= 1) return true;

    return !!sizesWrap.querySelector(".size.active, .mini-size.active");

}

// Підсвічуємо, що розмір треба обрати. На сторінці товару є
// місце під постійний текст помилки — показуємо його і
// прокручуємо до розмірів. У компактній картці каталогу/віджета
// такого місця немає, тож обмежуємось стряскою по рядку
// розмірів і спливаючим повідомленням.
//
// У картці каталогу тепер може бути ДВА блоки .product-sizes —
// прихована на мобільному hover-панель (десктоп, при наведенні)
// і завжди видимий блок нижче. Раніше підсвічувався лише
// ПЕРШИЙ знайдений в DOM (hover-панель) — на мобільному вона
// прихована, тож підсвітки ніхто не бачив. Тепер підсвічуємо
// ОБИДВА, щоб працювало незалежно від того, яка версія картки
// зараз видима користувачу.
function flagSizeRequired(scope) {

    const sizeWraps = scope.querySelectorAll(".sizes, .product-sizes");

    if (!sizeWraps.length) return;

    sizeWraps.forEach(sizesWrap => {

        sizesWrap.classList.remove("size-shake");

        void sizesWrap.offsetWidth;

        sizesWrap.classList.add("size-shake");

    });

    const errorEl = scope.querySelector(".size-error");

    if (errorEl) {

        errorEl.hidden = false;

        sizeWraps[0].scrollIntoView({ behavior: "smooth", block: "center" });

    } else {

        showToast("Будь ласка, оберіть розмір");

    }

}

document.addEventListener("click", event => {

    const favorite = event.target.closest(".favorite");

    if (favorite) {

        const scope = favorite.closest("#productPage")
            || favorite.closest(".product-card, .favorite-row");

        const { color, size } = getSelectedVariant(scope);

        const id = Number(favorite.dataset.id);

        // На сторінці «Обране» ця сама кнопка не перемикає, а ВИДАЛЯЄ
        // рядок зі списку.
        //
        // Раніше тут стояло вікно «Видалити з обраного?» і toggleFavorite
        // у відповіді. Два наслідки, обидва погані:
        //
        //   1. Перемикач у ролі видалення. Товар уже прибрано, рядок ще
        //      на екрані — другий клац ДОДАВАВ його назад.
        //   2. Питання перед дією, яку легко скасувати після неї. Діалог
        //      зупиняє людину на кожному видаленні, хоча в 99 випадках
        //      зі 100 відповідь відома.
        //
        // Тепер навпаки: видаляємо одразу, але не миттєво — 5 секунд
        // рядок лишається на місці з кнопкою «Залишити товар». Не встиг
        // або не хотів — товар зникає сам. Дію видно, скасувати її можна
        // одним дотиком, і жодне повторне натискання нічого не повертає:
        // прибирає завжди removeFavorite(), а він працює в один бік.
        if (favorite.classList.contains("favorite-row-remove")) {

            if (typeof startFavoriteRemoval === "function") {

                startFavoriteRemoval(favorite.closest(".favorite-row"), id, { color, size });

            } else {

                // сторінки без цього сценарію (раптом кнопка опиниться
                // деінде) — просто прибираємо, без вікна очікування
                removeFavorite(id, { color, size });

            }

            return;

        }

        toggleFavorite(id, { color, size });

        return;

    }

    const buy = event.target.closest(".buy-btn");

    if (buy) {

        const scope = buy.closest("#productPage") || buy.closest(".product-card, .favorite-row");

        if (scope && !isSizeSatisfied(scope)) {

            flagSizeRequired(scope);

            return;

        }

        const { color, size } = getSelectedVariant(scope);

        addToCart(Number(buy.dataset.id), { color, size });

        return;

    }

    const colorBtn = event.target.closest(".mini-color, .color");

    if (colorBtn) {

        // картка каталогу (.product-card) може мати два набори свотчів
        // (звичайний під фото + дублікат у hover-панелі поверх фото на
        // десктопі) — синхронізуємо їх за кольором у межах ЦІЄЇ картки.
        // Поза каталожною карткою (сторінка товару, кошик, обране)
        // свотчі й так одні — лишаємо стару вузьку синхронізацію в
        // межах найближчої групи, щоб не чіпати сусідні незалежні картки
        const cardScope = colorBtn.closest(".product-card");

        if (cardScope) {

            cardScope.querySelectorAll(".mini-color, .color").forEach(b => {
                b.classList.toggle("active", b.dataset.color === colorBtn.dataset.color);
            });

        } else {

            const group = colorBtn.closest(".product-colors, .color-options");

            group?.querySelectorAll(".mini-color, .color").forEach(b => b.classList.remove("active"));

            colorBtn.classList.add("active");

        }

        // перемикаємо фото товару на фото цього кольору
        // (шукаємо картинку в межах картки каталогу, рядка
        // кошика/обраного або самої сторінки товару)
        const scope = colorBtn.closest(".product-card, .favorite-row, .cart-item, #productPage");

        // Оновлюємо адресу сторінки під обраний колір.
        //
        // Раніше в URL лишався колір, з яким сторінку відкрили, тож
        // покупець перемикав на чорний, копіював посилання — а воно
        // вело на світло-сірий. replaceState, а не pushState: інакше
        // кожне перемикання кольору додавало б крок в історію, і
        // «Назад» замість повернення в каталог гортало б кольори.
        if (!cardScope && colorBtn.dataset.color) {

            try {

                const url = new URL(window.location.href);

                // Раніше умовою було наявність ?id= — на нових
                // статичних адресах /p/<slug>/ його немає, і колір
                // перестав би потрапляти в адресний рядок. Орієнтир
                // тепер сама сторінка товару, а не форма її адреси.
                if (document.getElementById("productPage")) {

                    url.searchParams.set("color", colorBtn.dataset.color);
                    window.history.replaceState(null, "", url);

                }

            } catch (error) {

                // адресний рядок — не критично, мовчки лишаємо як є

            }

        }

        // Артикул теж свій у кожного кольору — оновлюємо підпис під
        // назвою товару і рядок у характеристиках. data-sku порожній →
        // артикула немає взагалі, тоді просто чистимо текст.
        if (scope && colorBtn.dataset.sku !== undefined) {

            const sku = colorBtn.dataset.sku;

            const inlineSku = scope.querySelector("[data-product-sku]");

            if (inlineSku) inlineSku.textContent = sku ? ` · ${sku}` : "";

            const specSku = scope.querySelector("[data-spec-sku]");

            if (specSku) specSku.textContent = sku;

        }

        // Розміри можуть відрізнятись у різних кольорів (напр. чорні
        // кросівки 40–46, білі 36–39) — при перемиканні кольору
        // перемальовуємо список розмірів під обраний варіант.
        // data-sizes порожній → у цього кольору власних розмірів
        // немає, лишаємо те, що вже показано (загальні розміри).
        if (scope && colorBtn.dataset.sizes) {

            try {

                const variantSizes = JSON.parse(colorBtn.dataset.sizes);

                if (Array.isArray(variantSizes) && variantSizes.length) {

                    scope.querySelectorAll(".product-sizes, .sizes").forEach(list => {

                        const isMini = list.classList.contains("product-sizes");

                        list.innerHTML = variantSizes.map((size, index) => `
                            <button type="button"
                                class="${isMini ? "mini-size" : "size"} ${variantSizes.length === 1 && index === 0 ? "active" : ""}"
                                data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>
                        `).join("");

                    });

                }

            } catch (error) {

                // зіпсований JSON у data-sizes — просто лишаємо
                // поточний список, нічого не ламаємо

            }

        }

        const carousel = scope?.querySelector(".product-carousel");
        const carouselTrack = carousel?.querySelector(".photo-track");

        if (carouselTrack) {

            // картка каталогу з каруселлю фото — перебудовуємо
            // весь трек і крапки під фото нового кольору
            try {

                const images = JSON.parse(colorBtn.dataset.images || "[]");

                if (images.length) {

                    // Слайд — обгортка, фото всередині.
                    //
                    // Кадрування масштабує фото через transform, а той
                    // не обрізається елементом: при 3× знімок займає
                    // три ширини смуги, накриваючи сусідні слайди.
                    // Обгортка з overflow:hidden тримає масштаб у межах
                    // свого слайда (див. .photo-slide-photo у style.css).
                    carouselTrack.innerHTML = images.map(img => `
                        <div class="photo-slide photo-slide-photo">
                            <img
                                class="product-main-image"
                                src="${img}"
                                alt=""
                                loading="lazy"
                                onerror="this.src='assets/images/no-image.png'">
                        </div>
                    `).join("");

                    carouselTrack.scrollLeft = 0;

                    const dotsWrap = carousel.querySelector(".photo-dots");

                    if (dotsWrap) {

                        dotsWrap.innerHTML = images.length > 1
                            ? images.map((_, i) => `<span class="photo-dot ${i === 0 ? "active" : ""}"></span>`).join("")
                            : "";

                    }

                }

            } catch (error) {

                console.warn("Не вдалося оновити карусель для кольору", error);

            }

        } else {

            const targetImg = scope?.querySelector(".product-main-image, .cart-item-image img, .favorite-row-image img");

            if (targetImg) {

                try {

                    const images = JSON.parse(colorBtn.dataset.images || "[]");

                    if (images[0]) targetImg.src = images[0];

                } catch (error) {

                    console.warn("Не вдалося розібрати images для кольору", error);

                }

            }

        }

        // на сторінці товару додатково перемикаємо всю галерею
        if (scope?.id === "productPage" && typeof updateGalleryForColor === "function") {

            try {

                const images = JSON.parse(colorBtn.dataset.images || "[]");

                updateGalleryForColor(images, colorBtn.dataset.video || "");

            } catch (error) {

                console.warn("Не вдалося оновити галерею", error);

            }

            // перебудова галереї (інша кількість мініатюр тощо) могла
            // зсунути вміст сторінки, і сторінка ніби "стрибала".
            // Замість цього плавно піднімаємо сторінку так, щоб було
            // видно верх фото з новим кольором — але тільки якщо фото
            // й так вже не в зоні видимості під хедером, щоб зайвий раз
            // не смикати сторінку, якщо воно й так видно.
            scrollProductImageIntoView();

        }

        updateFavoriteButtons();

        return;

    }

    const sizeBtn = event.target.closest(".mini-size");

    if (sizeBtn) {

        // та сама причина, що й для кольору вище: у картці каталогу
        // тепер може бути два набори розмірів (звичайний +
        // дублікат у hover-панелі) — синхронізуємо в межах картки
        const cardScope = sizeBtn.closest(".product-card");
        const group = sizeBtn.closest(".product-sizes");

        if (cardScope) {

            const label = sizeBtn.textContent.trim();

            cardScope.querySelectorAll(".mini-size").forEach(b => {
                b.classList.toggle("active", b.textContent.trim() === label);
            });

        } else {

            group?.querySelectorAll(".mini-size").forEach(b => b.classList.remove("active"));

            sizeBtn.classList.add("active");

        }

        updateFavoriteButtons();

        group?.classList.remove("size-shake");

        const scope = sizeBtn.closest(".product-card, .favorite-row");
        const errorEl = scope?.querySelector(".size-error");

        if (errorEl) errorEl.hidden = true;

        return;

    }

});

// -------------------------
// Init
// -------------------------

updateCartCounter();

updateFavoriteButtons();

updateFavoriteCounter();

// ======================================
// Загальний обробник кліків
// ======================================

document.addEventListener("click", function (e) {

    // Стрілки каруселі фото на картці товару
    const carouselNav = e.target.closest(".photo-nav-prev, .photo-nav-next");

    if (carouselNav) {

        e.preventDefault();

        const track = carouselNav.closest(".product-carousel")?.querySelector(".photo-track");

        if (track) {

            const dir = carouselNav.classList.contains("photo-nav-prev") ? -1 : 1;

            track.scrollBy({ left: dir * track.clientWidth, behavior: "smooth" });

        }

        return;

    }

    // Крапки-індикатори каруселі фото на картці товару
    const carouselDot = e.target.closest(".photo-dot");

    if (carouselDot) {

        e.preventDefault();

        const dotsWrap = carouselDot.parentElement;
        const track = carouselDot.closest(".product-carousel")?.querySelector(".photo-track");

        if (track && dotsWrap) {

            const index = [...dotsWrap.children].indexOf(carouselDot);

            track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });

        }

        return;

    }

    // Кнопка "Купити"
    if (e.target.closest(".buy-btn")) {
        return;
    }

    // Кнопка "Обране"
    if (e.target.closest(".favorite")) {
        return;
    }

    // Вибір кольору/розміру на картці
    if (e.target.closest(".product-options")) {
        return;
    }

    // Рядок обраного, який зараз чекає видалення (йде 5-секундний
    // відлік). Клац по ньому не має вести на сторінку товару: людина
    // тягнеться до «Залишити товар», а не до самого товару, і промах
    // мимо кнопки не мусить забирати її зі сторінки — інакше відлік
    // добіжить у неї за спиною.
    if (e.target.closest(".favorite-row.is-removing")) {
        return;
    }

    // Картка товару
    const card = e.target.closest(".product-card, .favorite-row");

    if (card) {

        const id = card.dataset.id;

        // якщо на картці вже обрані колір/розмір — переносимо їх
        // на сторінку товару, щоб не обирати заново
        const { color, size } = getSelectedVariant(card);

        // Статистика: клац по картці в списку.
        //
        // Разом із view_item_list це дає найкорисніше зіставлення —
        // які картки показуються часто, а натискають на них рідко.
        // Саме там зазвичай проблема з фото або ціною.
        const clicked = findCachedProduct(Number(id));

        if (clicked) {
            window.Analytics?.selectItem(clicked, "Каталог", { color, size });
        }

        // картка знає лише id; slug дістаємо з кешу каталогу, щоб піти
        // одразу на канонічну адресу, а не через редірект
        window.location.href = productUrl(
            findCachedProduct(Number(id)) || Number(id),
            { color, size }
        );

    }

});

// ======================================
// Українські підказки валідації форм
// (замість англійських системних тултипів
// браузера на required/email/minlength полях)
// ======================================

function ukrainianValidationMessage(field) {

    const v = field.validity;

    if (v.valueMissing) {

        return field.type === "checkbox"
            ? "Це поле обов'язкове"
            : "Будь ласка, заповніть це поле";

    }

    if (v.typeMismatch) {

        if (field.type === "email") {
            return "Введіть коректну електронну адресу, наприклад name@example.com";
        }

        return "Значення введено в неправильному форматі";

    }

    if (v.tooShort) {
        return `Мінімум ${field.minLength} символів (зараз ${field.value.length})`;
    }

    if (v.tooLong) {
        return `Максимум ${field.maxLength} символів`;
    }

    if (v.patternMismatch) {
        return "Значення не відповідає очікуваному формату";
    }

    if (v.rangeUnderflow) {
        return `Значення має бути не менше ${field.min}`;
    }

    if (v.rangeOverflow) {
        return `Значення має бути не більше ${field.max}`;
    }

    return "Перевірте правильність заповнення цього поля";

}

// Вішає обробники на всі поля форми: скидають кастомне
// повідомлення при введенні і виставляють українське замість
// дефолтного англійського, коли поле недійсне.
function applyUkrainianValidation(form) {

    if (!form || form.dataset.ukValidationBound) return;

    form.dataset.ukValidationBound = "true";

    form.querySelectorAll("input, select, textarea").forEach(field => {

        field.addEventListener("invalid", () => {

            field.setCustomValidity(ukrainianValidationMessage(field));

        });

        field.addEventListener("input", () => field.setCustomValidity(""));
        field.addEventListener("change", () => field.setCustomValidity(""));

    });

}

// Перевіряє форму цілком; якщо є недійсні поля — показує
// українську підказку на першому з них і повертає false.
function validateFormUk(form) {

    applyUkrainianValidation(form);

    const fields = [...form.querySelectorAll("input, select, textarea")];

    let firstInvalid = null;

    fields.forEach(field => {

        field.setCustomValidity("");

        if (!field.checkValidity()) {

            field.setCustomValidity(ukrainianValidationMessage(field));

            if (!firstInvalid) firstInvalid = field;

        }

    });

    if (firstInvalid) {

        firstInvalid.reportValidity();
        firstInvalid.focus();

        return false;

    }

    return true;

}

// подключаємо одразу до всіх форм на сторінці, які досі
// покладались на нативні (англійські) підказки браузера
document.querySelectorAll("form").forEach(applyUkrainianValidation);

// Обробника форми контактів тут БІЛЬШЕ НЕМАЄ — і це навмисно.
//
// Він робив те саме, що робив колись інлайновий обробник на сторінці:
// скасовував відправку, писав «повідомлення надіслано» і чистив поля.
// Листа не існувало.
//
// Коли інлайновий полагодили, цей лишився — і зламав уже полагоджене.
// common.js підключається РАНІШЕ, тож його обробник спрацьовував
// першим: чистив форму й показував свій тост. Далі виконувався
// справжній обробник, бачив уже порожні поля й відповідав
// «Заповніть усі поля». Жодного запиту не летіло, у консолі порожньо —
// зрозуміти причину зі сторони було майже неможливо.
//
// Тепер форму обробляє одне місце: інлайновий скрипт у contacts.html.
// Він і перевіряє поля, і надсилає лист через FormSubmit.
//
// Українські підказки валідації лишаються — їх вішає
// applyUkrainianValidation() вище на всі форми сторінки.

// -------------------------
// Кольори товару (використовується в catalog.js і promo.js для
// побудови фільтра "Колір")
// -------------------------

// -------------------------
// Розміри товару
//
// Розміри можуть бути задані двома способами:
//   1) у конкретного варіанта кольору (variant.sizes) — наприклад,
//      чорні кросівки є в 40–46, а білі лише в 36–39;
//   2) загальні для товару (product.sizes) — так влаштовані всі
//      товари, додані до появи розмірів у кольорах.
//
// Обидва способи мають працювати одночасно, тому варіант без
// власних розмірів «успадковує» загальні.
// -------------------------

// -------------------------
// Групи розмірів і таблиця розмірів — з адмінки
//
// Джерело: data/size-groups.json (розділ «Розміри» в адмінці).
// Визначає, які розміри доступні для яких категорій (фільтр
// «Розмір» у каталозі) і що показувати в «Таблиці розмірів»
// на сторінці товару.
//
// Якщо файл недоступний — лишається вбудований запасний набір,
// тож сайт працює навіть за відсутності налаштувань.
// -------------------------

const FALLBACK_SIZE_GROUPS = [
    // Групи «Сумки» тут навмисно НЕМАЄ.
    //
    // Усі сумки в каталозі мають один розмір — ONESIZE, — тож фільтр
    // за розміром для них нічого не звужує: єдиний чип збігався б з
    // усіма товарами. Так само влаштовані окуляри й годинники: у них
    // теж ONESIZE і теж немає групи.
    //
    // Список продубльований у data/size-groups.json (редагується в
    // адмінці) і тут, як запасний на випадок, якщо файл не завантажиться.
    // Якщо колись повернете сумкам розміри — додавати треба В ОБИДВА
    // місця, інакше при збої завантаження фільтр покаже те, чого в
    // даних немає.
    { key: "backpacks", title: "Рюкзаки", department: "",
      categories: ["Рюкзаки", "Дитячі рюкзаки"],
      sizes: ["S", "M", "L", "XL"] },
    { key: "clothes", title: "Одяг", department: "Одяг", categories: [],
      sizes: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"] },
    { key: "shoes", title: "Взуття", department: "Взуття", categories: [],
      sizes: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"] }
];

// Розділи → категорії з data/categories.json. Потрібно, щоб група
// розмірів, задана через «Розділ каталогу», знала свої категорії.
// Живе саме тут (а не в catalog.js), бо потрібно ще й на сторінці
// товару для таблиці розмірів — catalog.js там не підключений.
let categoryTreePromise = null;

function loadCategoryTree() {

    if (categoryTreePromise) return categoryTreePromise;

    categoryTreePromise = fetch(dataUrl("data/categories.json"))
        .then(response => response.ok ? response.json() : [])
        .then(categories => {

            const byDepartment = new Map();

            (Array.isArray(categories) ? categories : []).forEach(category => {

                if (!byDepartment.has(category.department)) {

                    byDepartment.set(category.department, {
                        title: category.department,
                        categories: []
                    });

                }

                byDepartment.get(category.department).categories.push(category.name);

            });

            return [...byDepartment.values()];

        })
        .catch(() => []);

    return categoryTreePromise;

}

let sizeGroupsPromise = null;

function loadSizeGroups() {

    if (sizeGroupsPromise) return sizeGroupsPromise;

    sizeGroupsPromise = fetch(dataUrl("data/size-groups.json"))
        .then(response => response.ok ? response.json() : null)
        .then(data => {

            // Decap зберігає file-колекцію як ОБ'ЄКТ, де ключ — імʼя поля
            // ({"groups": [...]}), тому читаємо саме data.groups. Голий
            // масив теж підтримуємо — на випадок ручного редагування
            // файлу або старого формату.
            const list = Array.isArray(data) ? data : data?.groups;

            if (!Array.isArray(list) || list.length === 0) return FALLBACK_SIZE_GROUPS;

            // нормалізуємо, щоб далі не перевіряти кожне поле на існування
            return list.map(group => ({
                key: group.key || "",
                title: group.title || "",
                department: group.department || "",
                categories: Array.isArray(group.categories) ? group.categories : [],
                sizes: Array.isArray(group.sizes) ? group.sizes : [],
                guideNote: group.guideNote || "",
                guideColumns: Array.isArray(group.guideColumns) ? group.guideColumns : [],
                guideRows: Array.isArray(group.guideRows) ? group.guideRows : []
            })).filter(group => group.key && group.sizes.length);

        })
        .catch(() => FALLBACK_SIZE_GROUPS);

    return sizeGroupsPromise;

}

// Категорії групи: або перелічені вручну, або ВСІ категорії
// вибраного розділу — тоді нові категорії підхоплюються самі.
function resolveGroupCategories(group, categoryDepartments) {

    if (group.categories.length) return group.categories;

    if (!group.department) return [];

    const department = (categoryDepartments || []).find(d => d.title === group.department);

    return department ? department.categories : [];

}

// Група розмірів, до якої належить категорія товару
function findSizeGroupForCategory(groups, category, categoryDepartments) {

    return (groups || []).find(group =>
        resolveGroupCategories(group, categoryDepartments).includes(category)
    ) || null;

}

// Артикул варіанта кольору. У різних кольорів однієї моделі артикул
// зазвичай різний, тож він задається в самому кольорі; якщо там
// порожньо — береться загальний артикул товару (так влаштовані всі
// товари, додані до появи артикула в кольорах).
function getVariantSku(product, variant) {

    const variantSku = (variant?.sku || "").trim();

    return variantSku || (product?.sku || "");

}

// Стать(і) товару.
//
// Товар може належати кільком розділам одразу — наприклад, унісекс-
// сумка доречна і в «Жінкам», і в «Чоловікам». В адмінці це
// мультивибір, тож у даних лежить СПИСОК.
//
// Але товари, створені раніше, мають звичайний рядок. Тому всюди
// читаємо через цю функцію: вона однаково розуміє і рядок, і список,
// і порожнє значення. Так старі товари не ламаються, а нові
// отримують кілька розділів.
function getProductGenders(product) {

    const raw = product?.gender;

    if (Array.isArray(raw)) return raw.filter(Boolean);

    return raw ? [raw] : [];

}

// Для місць, де треба показати одне значення (картка товару,
// характеристики) — перелічуємо через кому.
function getProductGenderLabel(product) {

    const list = getProductGenders(product);

    return list.length ? list.join(", ") : "Унісекс";

}

function getVariantSizes(product, variant) {

    if (variant && Array.isArray(variant.sizes) && variant.sizes.length) {

        return variant.sizes;

    }

    return product?.sizes || [];

}

// Усі розміри товару разом (об'єднання по кольорах) — для фільтра
// в каталозі: товар підходить, якщо потрібний розмір є хоча б
// в одному з кольорів.
function getAllProductSizes(product) {

    const all = new Set();
    const variants = product?.variants || [];

    if (variants.length) {

        // ВАЖЛИВО: через getVariantSizes(), а не variant.sizes напряму.
        // Інакше в змішаному випадку (в одного кольору свої розміри, в
        // іншого — успадковані загальні) об'єднання виходило неповним:
        // напр. у товару 20 загальних розмірів, «Чорний» має лише
        // 35 і 36, а «Білий» успадковує всі 20 — старий код повертав
        // тільки {35,36}, і фільтр каталогу не знаходив товар за
        // розміром 40, хоча білий у 40 є.
        variants.forEach(variant => {

            getVariantSizes(product, variant).forEach(size => all.add(size));

        });

    } else {

        // товар без варіантів кольору — лишаються тільки загальні
        (product?.sizes || []).forEach(size => all.add(size));

    }

    return [...all];

}

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

// ======================================
// СІМ'Ї КОЛЬОРІВ
// ======================================
//
// ЗАДАЧА
// -------
// Назви кольорів у даних — це те, що написав постачальник: «Бежевий
// 1R5», «Білий White 21G», «Wht-Dk Grn 286», «Marine daphne 793»,
// «Brass/Chalk — айворі / золотистий», «Nero», «Black чорний». На 71
// товар — 83 різні написання, і у фільтрі «Колір» вони ставали 83
// пунктами: «Чорний», «Black», «Black чорний» і «Nero» окремими
// рядками. Щоб знайти чорну сумку, треба було відмітити п'ять пунктів
// і не бути певним, що не проґавив шостий.
//
// РІШЕННЯ
// --------
// Дві незалежні речі:
//
//   1. Назви на вході НОРМАЛІЗУЮТЬСЯ під час збірки
//      (scripts/normalize-colors.js) — у даних лишається чиста
//      українська назва замість артикула відтінку.
//   2. Фільтр працює не назвами, а СІМ'ЯМИ кольорів — коротким
//      списком того, як колір називає покупець.
//
// Другого мало без першого (у картці лишався б «Wht-Dk Grn 286»), а
// першого мало без другого: «Темно-сірий», «Світло-сірий» і
// «Сіро-бежевий» — усе одно три пункти на один сірий.
//
// ЯК ВИЗНАЧАЄТЬСЯ СІМ'Я
// ----------------------
// 1. Сильне слово-колір у назві. Якщо їх кілька — виграє те, що
//    СТОЇТЬ ПЕРШИМ: у «Коричнево-чорний» головний коричневий, у
//    «Чорно-бежевий» — чорний. Так само читає назву людина.
// 2. Немає сильного слова — дивимось на hex свотча. Він надійніший за
//    слова про фурнітуру: «Brass/Chalk» — це не золотий колір, це
//    золота фурнітура, а сам товар #e9e4e4, тобто майже білий.
// 3. Немає ні того, ні того — слабкі слова (brass, chalk, ivory…).
// 4. Зовсім нічого — «Інші».
// ======================================

// Порядок важливий: у фільтрі сім'ї показуються саме в ньому — від
// найчастіших до рідких. Алфавіт тут гірший: він розкидав би «Білий»,
// «Сірий» і «Чорний» по трьох кінцях списку.
const COLOR_FAMILIES = [
    {
        name: "Чорний",
        hex: "#111111",
        keywords: ["чорн", "black", "blk", "nero", "noir"]
    },
    {
        name: "Білий",
        hex: "#ffffff",
        keywords: ["біл", "white", "wht", "bianco", "blanc", "cotton", "молочн", "milk"]
    },
    {
        name: "Сірий",
        hex: "#9ca3af",
        // «сріб», а не «срібн»: у даних трапляється і «Срібний», і
        // «Сріблястий». Без спільного кореня другий не мав жодного
        // слова-кольору й визначався за свотчем — а свотчі в годинників
        // різняться на кілька відтінків, і той самий «Сріблястий»
        // розповзався між «Сірий» і «Білий». Один колір у двох пунктах
        // фільтра — саме те, від чого ми тут ішли.
        keywords: ["сір", "grey", "gray", "graphite", "графіт", "silver", "сріб", "steel", "сталев", "cement", "антрацит"]
    },
    {
        name: "Бежевий",
        hex: "#d6c3a5",
        keywords: ["беж", "beige", "tan", "camel", "кемел", "sand", "піск", "cream", "крем", "nude", "twine", "taupe", "тауп", "khaki", "хакі", "latte", "капучин", "айвор", "ivory"]
    },
    {
        name: "Коричневий",
        hex: "#8b5e3c",
        keywords: ["коричнев", "brown", "chocolate", "шокол", "mocha", "мокко", "espresso", "cognac", "коньяк", "черепахов", "tortoise"]
    },
    {
        name: "Синій",
        hex: "#2563eb",
        keywords: ["син", "блакит", "blue", "navy", "marine", "denim", "джинс", "indigo", "індиго", "cobalt", "кобальт"]
    },
    {
        name: "Зелений",
        hex: "#16a34a",
        keywords: ["зелен", "green", "grn", "olive", "олив", "mint", "м'ят", "mʼят", "emerald", "смарагд", "verde"]
    },
    {
        name: "Червоний",
        hex: "#dc2626",
        keywords: ["червон", "red", "rosso", "бордов", "bordeaux", "burgundy", "wine", "вин", "cherry", "вишн", "coral", "корал"]
    },
    {
        name: "Рожевий",
        hex: "#ec4899",
        keywords: ["рожев", "pink", "rose", "fuchsia", "фукс", "пудров"]
    },
    {
        name: "Помаранчевий",
        hex: "#f97316",
        keywords: ["помаранч", "оранж", "orange", "карамел", "терракот", "terracot", "персик", "peach", "apricot"]
    },
    {
        name: "Жовтий",
        hex: "#facc15",
        keywords: ["жовт", "yellow", "гірчич", "mustard", "lemon", "лимон"]
    },
    {
        name: "Фіолетовий",
        hex: "#7c3aed",
        keywords: ["фіолет", "purple", "violet", "лілов", "lilac", "lavender", "лаванд", "plum", "слив"]
    },
    {
        name: "Золотий",
        hex: "#c9a227",
        // Українське «золот» — сильне слово, англійські gold/brass —
        // слабкі.
        //
        // ЧОМУ ПО-РІЗНОМУ. В англійських назвах колірних схем Coach і
        // Michael Kors gold і brass майже завжди означають фурнітуру:
        // «Brass/Chalk» — це золота застібка на айворі, а не золота
        // сумка. А коли магазин пише українською «Золотистий», він
        // описує саме річ — інакше він би цього не писав.
        //
        // Без цього поділу золотий годинник потрапляв у «Жовтий»:
        // слова не було, вирішував свотч, а він у золота жовтуватий.
        keywords: ["золот"],
        weakKeywords: ["gold", "brass", "латун"]
    },
    {
        name: "Мультиколір",
        hex: "linear-gradient(135deg,#f87171,#facc15,#4ade80,#60a5fa)",
        keywords: ["мульти", "multi", "барвист", "різнокольор", "colorblock", "колорблок", "камуфляж", "camo"]
    },
    {
        name: "Інші",
        hex: "#e5e7eb",
        keywords: [],
        // сюди нічого не потрапляє за словами — лише як остання
        // відповідь, коли ні назва, ні hex нічого не сказали
        weakKeywords: ["blush", "chalk", "nickel", "pearl", "перлам"]
    }
];

const COLOR_FAMILY_ORDER = COLOR_FAMILIES.map(family => family.name);

function hexToRgb(hex) {

    const value = String(hex || "").trim().replace(/^#/, "");

    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return null;

    const full = value.length === 3
        ? value.split("").map(c => c + c).join("")
        : value;

    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16)
    };

}

// Відтінок і світлість: у них «майже чорний» і «майже білий»
// відрізняються одним числом, а в RGB — трьома й купою умов.
function rgbToHsl({ r, g, b }) {

    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;

    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    const lightness = (max + min) / 2;

    let hue = 0;
    let saturation = 0;

    if (delta) {

        saturation = lightness > 0.5
            ? delta / (2 - max - min)
            : delta / (max + min);

        if (max === rn) hue = ((gn - bn) / delta) % 6;
        else if (max === gn) hue = (bn - rn) / delta + 2;
        else hue = (rn - gn) / delta + 4;

        hue = (hue * 60 + 360) % 360;

    }

    return { h: hue, s: saturation, l: lightness };

}

function colorFamilyByHex(hex) {

    const rgb = hexToRgb(hex);

    if (!rgb) return null;

    const { h, l } = rgbToHsl(rgb);

    // ЧОМУ ТУТ ХРОМА, А НЕ НАСИЧЕНІСТЬ HSL
    // -------------------------------------
    // Насиченість у HSL ділиться на світлість, тому в дуже світлих і
    // дуже темних кольорах роздувається: #e9e4e4 — майже білий (канали
    // різняться на 5 з 255), а s виходить 0.10. На цьому спіткнувся
    // перший варіант: відтінок такого свотча обчислюється як 0°, і
    // «Brass/Chalk — айворі» потрапляв у ЧЕРВОНІ.
    //
    // Хрома (max - min) такого фокуса не робить: 5/255 = 0.02 — кольору
    // тут справді немає, хоч світлий він, хоч темний.
    const chroma = (Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b)) / 255;

    // Сіра вісь: кольору немає, лишається світлість. Межі саме такі,
    // бо «чорні» свотчі товарів реально лежать на 0.07–0.21, а не на
    // нулі, а «білі» — на 0.86–1.0.
    if (chroma < 0.1) {

        if (l < 0.22) return "Чорний";

        if (l > 0.85) return "Білий";

        return "Сірий";

    }

    // Бежевий — не окремий відтінок, а тепла пастель: мало кольору
    // плюс висока світлість. Без цього правила пісок, крем і карамель
    // розлітаються по «жовтому» й «помаранчевому».
    if (chroma < 0.28 && l > 0.62 && h >= 15 && h <= 75) return "Бежевий";

    // Той самий теплий відтінок, але темний, — це коричневий,
    // а не помаранчевий.
    if (l < 0.45 && h >= 10 && h <= 45) return "Коричневий";

    if (h < 15 || h >= 345) return "Червоний";
    if (h < 45) return "Помаранчевий";
    if (h < 70) return "Жовтий";
    if (h < 170) return "Зелений";
    if (h < 255) return "Синій";
    if (h < 290) return "Фіолетовий";

    return "Рожевий";

}

// Сім'я одного кольору. name — назва з даних товару, hex — його свотч.
function colorFamily(name, hex) {

    const text = String(name || "").toLowerCase();

    // 1. Сильне слово-колір. Виграє те, що стоїть у назві першим.
    let best = null;

    if (text) {

        COLOR_FAMILIES.forEach(family => {

            (family.keywords || []).forEach(keyword => {

                const at = text.indexOf(keyword);

                if (at === -1) return;

                if (!best || at < best.at) best = { name: family.name, at };

            });

        });

    }

    if (best) return best.name;

    // 2. Сам свотч.
    const byHex = colorFamilyByHex(hex);

    if (byHex) return byHex;

    // 3. Слабкі слова — про фурнітуру й обробку.
    let weak = null;

    if (text) {

        COLOR_FAMILIES.forEach(family => {

            (family.weakKeywords || []).forEach(keyword => {

                const at = text.indexOf(keyword);

                if (at === -1) return;

                if (!weak || at < weak.at) weak = { name: family.name, at };

            });

        });

    }

    return weak ? weak.name : "Інші";

}

// Сім'ї кольорів товару: сім'я -> { hex, names }.
//
// names потрібні у підказці фільтра: під пунктом «Бежевий» можуть
// лежати «Бежевий», «Тауп» і «Бежево-кремовий» — і побачити це
// корисно, інакше незрозуміло, чому товар знайшовся.
function getProductColorFamilies(product) {

    const families = new Map();

    getProductColors(product).forEach((hex, name) => {

        const family = colorFamily(name, hex);

        if (!families.has(family)) {
            families.set(family, { hex: hex || null, names: [] });
        }

        const entry = families.get(family);

        if (!entry.names.includes(name)) entry.names.push(name);

    });

    return families;

}

function getDiscountPercent(product) {

    if (!product.oldPrice || product.oldPrice <= product.price) return 0;

    return Math.round((1 - product.price / product.oldPrice) * 100);

}

// -------------------------
// SEO: динамічне оновлення <title>, meta description,
// canonical, Open Graph та JSON-LD для сторінок, контент яких
// підвантажується через JS (товар, акція). Без цього кожна така
// сторінка мала б однаковий title/description для Google —
// це й був один з найкритичніших SEO-багів сайту.
// -------------------------

const SITE_URL = "https://dev.bestbrnd4u.com";

function setMetaByName(name, content) {

    if (!content) return;

    let tag = document.querySelector(`meta[name="${name}"]`);

    if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", name);
        document.head.appendChild(tag);
    }

    tag.setAttribute("content", content);

}

function setMetaByProperty(property, content) {

    if (!content) return;

    let tag = document.querySelector(`meta[property="${property}"]`);

    if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("property", property);
        document.head.appendChild(tag);
    }

    tag.setAttribute("content", content);

}

function setCanonical(url) {

    let link = document.querySelector('link[rel="canonical"]');

    if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
    }

    link.setAttribute("href", url);

}

// Канонічна адреса сторінки товару.
//
// НАВІЩО ОКРЕМИЙ ХЕЛПЕР: до серпня 2026 товар жив за адресою
// /product?id=<число>. Таку адресу неможливо віддати статичним файлом
// на GitHub Pages, тож усі 30+ товарів віддавали ОДИН product.html з
// однаковим <title>Товар | BestBrnd4u</title>. Googlebot бачить сторінку
// двічі — спершу сирий HTML, і аж потім відрендерений, — тож на першому
// проході всі товари виглядали як копії однієї сторінки.
//
// Тепер scripts/build-product-pages.js генерує окремий файл
// p/<slug>/index.html на кожен товар, з готовими title, description,
// canonical, Open Graph і JSON-LD просто в розмітці. Ця функція —
// єдине місце, де адреса збирається, щоб посилання в каталозі, кошику,
// обраному, пошуку й sitemap не розповзлись.
//
// Запасний варіант ?id= лишається робочим: старі проіндексовані
// посилання й розшарені друзям адреси не повинні ламатись, product.js
// перекидає з них на канонічну адресу.
function productUrl(product, params) {

    const slug = product && typeof product === "object" ? product.slug : null;

    const base = slug
        ? `/p/${encodeURIComponent(slug)}/`
        : `/product?id=${typeof product === "object" ? product.id : product}`;

    const query = new URLSearchParams(params || {});

    // прибираємо порожні значення, щоб не плодити ?color=&size=
    [...query.keys()].forEach(k => { if (!query.get(k)) query.delete(k); });

    const qs = query.toString();

    if (!qs) return base;

    return base + (base.includes("?") ? "&" : "?") + qs;

}

// Робить з відносного шляху ("assets/…" або "/assets/…") повну адресу.
//
// НАВІЩО: Open Graph і schema.org приймають ЛИШЕ абсолютні URL.
// Відносний шлях у og:image або в полі image структурованих даних
// Google просто ігнорує — картинка не з'являється ні в rich-результаті
// товару, ні в прев'ю при шерінгу в месенджерах. У data/products.json
// фото лежать як "assets/images/…", в акціях — як "/assets/images/…",
// тож обидві форми треба вміти розгортати. Зовнішні посилання
// (pexels тощо) лишаємо як є.
function absoluteUrl(url) {

    if (!url) return "";

    if (/^https?:\/\//i.test(url)) return url;

    return `${SITE_URL}/${String(url).replace(/^\/+/, "")}`;

}

// Створює/оновлює <script type="application/ld+json"> з заданим id.
// Ключі зі значенням undefined JSON.stringify сам прибирає —
// зручно для необов'язкових полів (sku, rating тощо).
function setJsonLd(id, data) {

    let script = document.getElementById(id);

    if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = id;
        document.head.appendChild(script);
    }

    script.textContent = JSON.stringify(data);

}

// Обрізає опис до безпечної для meta description довжини,
// не розриваючи слово посередині.
function truncateForMeta(text, maxLength = 155) {

    if (!text || text.length <= maxLength) return text || "";

    return `${text.slice(0, maxLength).replace(/\s+\S*$/, "")}…`;

}


// Аварійний запобіжник: якщо з якоїсь причини блок вище не
// відпрацював (помилка в іншому місці файлу тощо) — шапка на
// мобільному не повинна лишитись прихованою назавжди.
setTimeout(() => {
    document.querySelector("header .header")?.classList.add("header-ready");
}, 1500);
