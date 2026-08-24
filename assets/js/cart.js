// ======================================
// cart.js
// Логіка сторінки кошика (cart)
// ======================================

let allProducts = [];

const cartItemsEl = document.getElementById("cartItems");
const cartEmptyEl = document.getElementById("cartEmpty");
const cartLayoutEl = document.getElementById("cartLayout");
const cartItemsCountEl = document.getElementById("cartItemsCount");
const cartSubtotalEl = document.getElementById("cartSubtotal");
const cartDiscountRowEl = document.getElementById("cartDiscountRow");
const cartDiscountEl = document.getElementById("cartDiscount");
const cartTotalEl = document.getElementById("cartTotal");
const checkoutBtn = document.getElementById("checkoutBtn");

async function initCart() {

    if (!cartItemsEl) return;

    try {

        const response = await fetch(dataUrl("data/products.json"));

        if (!response.ok) {
            throw new Error("Не вдалося завантажити товари");
        }

        allProducts = await response.json();

        renderCart();

    } catch (error) {

        cartItemsEl.innerHTML = `
            <p class="error">
                Помилка завантаження кошика.
            </p>
        `;

        console.error(error);

    }

}

// FIX: строге порівняння (===) не знаходило товар,
// якщо id у products.json записаний рядком, а в
// localStorage зберігається як число (або навпаки).
// Number(...) з обох боків прибирає цю
// невідповідність типів.
function findProductById(id) {

    return allProducts.find(item => Number(item.id) === Number(id));

}

function renderCart() {

    // рядки кошика: {id, color, size, qty} —
    // різні колір/розмір одного й того ж товару
    // це різні рядки
    const lines = getGroupedCartLines();

    if (lines.length === 0) {

        cartEmptyEl.hidden = false;
        cartLayoutEl.hidden = true;

        return;

    }

    let subtotal = 0;      // за факт. ціною (зі знижкою товару)
    let subtotalFull = 0;  // за старою ціною (якщо була знижка)
    let itemsCount = 0;
    let hasPreOrder = false;

    const rows = lines.map(line => {

        const product = findProductById(line.id);

        if (!product) return "";

        if (product.preOrder) hasPreOrder = true;

        const qty = line.qty;
        const lineTotal = product.price * qty;
        const lineTotalFull = (product.oldPrice || product.price) * qty;

        subtotal += lineTotal;
        subtotalFull += lineTotalFull;
        itemsCount += qty;

        const variants = product.variants?.length
            ? product.variants
            : [{ color: product.color || "Основний", hex: "#999", images: product.images || [] }];

        const sizes = product.sizes?.length ? product.sizes : PRODUCT_SIZES;

        const activeColor = line.color || variants[0].color;
        const activeSize = line.size || sizes[0];

        const activeVariant = variants.find(v => v.color === activeColor) || variants[0];

        const image = activeVariant.images?.[0] || product.images?.[0] || "assets/images/no-image.png";

        // Кольори, які вже лежать у кошику окремими рядками, позначаємо
        // одразу — щоб людина не тицяла в них і не отримувала відмову.
        // Краще показати межу заздалегідь, ніж пояснювати після дії.
        const takenColors = new Set(
            lines
                .filter(other => other.id === line.id
                    && (other.size || null) === (line.size || null)
                    && (other.color || null) !== (line.color || null))
                .map(other => other.color)
        );

        const colorButtons = variants.map(variant => {

            const taken = takenColors.has(variant.color);

            return `
            <button
                type="button"
                class="mini-color ${variant.color === activeColor ? "active" : ""}${taken ? " is-taken" : ""}"
                data-color="${escapeHtml(variant.color)}"
                data-images='${escapeAttrSingleQuoted(JSON.stringify(variant.images || []))}'
                title="${escapeHtml(variant.color)}${taken ? " — уже окремим рядком у кошику" : ""}"
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

        // Посилання веде на ТОЙ САМИЙ колір і розмір, що в кошику.
        //
        // Раніше тут стояв productUrl(product) без параметрів, тож із
        // кошика завжди відкривався перший колір товару — людина
        // клацала коричневу сумку, а бачила світло-сіру. productUrl
        // уміє приймати параметри, їх просто не передавали.
        const lineUrl = productUrl(product, { color: line.color, size: line.size });

        // Назва кольору поруч із кружечками: самі кружечки не
        // підписані, і в кошику «який саме це відтінок» доводилось
        // згадувати по пам'яті.
        const colorLabel = line.color
            ? `<div class="cart-item-color">Колір: <b>${escapeHtml(line.color)}</b></div>`
            : "";

        return `
            <div class="cart-item" data-id="${line.id}" data-color="${line.color || ""}" data-size="${line.size || ""}">

                <a href="${lineUrl}" class="cart-item-image">
                    <img
                        src="${image}"
                        alt="${escapeHtml(product.title)}"
                        onerror="this.src='assets/images/no-image.png'">
                </a>

                <div class="cart-item-info">
                    <div class="cart-item-brand">${product.brand || ""}</div>
                    <a href="${lineUrl}" class="cart-item-title">
                        ${escapeHtml(product.title)}
                    </a>
                    ${product.preOrder ? `<div class="preorder-tag">📦 Під замовлення</div>` : ""}
                    ${colorLabel}
                    <div class="product-options cart-item-options">
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
                    <div class="cart-item-price">
                        ${product.oldPrice ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>` : ""}
                        <span class="price">${formatPrice(product.price)}</span>
                    </div>
                </div>

                <div class="cart-item-qty">
                    <button class="qty-btn qty-minus" data-id="${line.id}" data-color="${line.color || ""}" data-size="${line.size || ""}" aria-label="Зменшити кількість">−</button>
                    <span>${qty}</span>
                    <button class="qty-btn qty-plus" data-id="${line.id}" data-color="${line.color || ""}" data-size="${line.size || ""}" aria-label="Збільшити кількість">+</button>
                </div>

                <div class="cart-item-total">
                    ${product.oldPrice ? `<span class="old-price">${formatPrice(lineTotalFull)}</span>` : ""}
                    <span class="price">${formatPrice(lineTotal)}</span>
                </div>

                <button class="cart-item-remove" data-id="${line.id}" data-color="${line.color || ""}" data-size="${line.size || ""}" aria-label="Видалити товар">✕</button>

            </div>
        `;

    });

    // якщо жоден товар не знайшовся в products.json —
    // це теж фактично порожній кошик
    if (itemsCount === 0) {

        cartEmptyEl.hidden = false;
        cartLayoutEl.hidden = true;

        return;

    }

    cartEmptyEl.hidden = true;
    cartLayoutEl.hidden = false;

    cartItemsEl.innerHTML =
        (hasPreOrder ? `
            <div class="preorder-banner">
                📦 У кошику є товари під замовлення — термін виготовлення для них довший
                за звичайну доставку. Деталі вказані під кожним таким товаром.
            </div>
        ` : "") + rows.join("");

    cartItemsCountEl.textContent = itemsCount;
    cartSubtotalEl.textContent = formatPrice(subtotalFull);

    const discount = subtotalFull - subtotal;

    if (discount > 0 && cartDiscountRowEl) {

        cartDiscountRowEl.hidden = false;
        cartDiscountEl.textContent = "−" + formatPrice(discount);

    } else if (cartDiscountRowEl) {

        cartDiscountRowEl.hidden = true;

    }

    cartTotalEl.textContent = formatPrice(subtotal);

    updateCartCounter();

}

function changeQty(id, color, size, delta) {

    const cart = getCart();

    if (delta > 0) {

        cart.push({ id, color, size });

    } else {

        const index = cart.findIndex(entry =>
            entry.id === id &&
            (entry.color || null) === (color || null) &&
            (entry.size || null) === (size || null)
        );

        if (index !== -1) cart.splice(index, 1);

    }

    saveCart(cart);

    renderCart();

}

function removeCartItem(id, color, size) {

    const cart = getCart().filter(entry => !(
        entry.id === id &&
        (entry.color || null) === (color || null) &&
        (entry.size || null) === (size || null)
    ));

    saveCart(cart);

    renderCart();

}

// зміна кольору/розміру рядка кошика — оновлює ВСІ записи
// цього варіанта (тобто всю кількість одразу, не по одному)
function changeVariant(id, oldColor, oldSize, field, value) {

    const cart = getCart();

    const matches = entry =>
        entry.id === id &&
        (entry.color || null) === (oldColor || null) &&
        (entry.size || null) === (oldSize || null);

    // Куди перемикаємо
    const target = { color: oldColor || null, size: oldSize || null };

    target[field] = value || null;

    // Такий рядок уже є в кошику — НЕ перемикаємо.
    //
    // Кошик групує позиції за id + колір + розмір і показує кількість.
    // Тому перемикання на колір, який уже лежить окремим рядком, не
    // «переносило» товар, а зливало два рядки в один із кількістю 2 —
    // тобто мовчки міняло замовлення. Людина натискала колір, а їй
    // змінювали кількість.
    //
    // Відмовляємо і називаємо причину: обидва рядки лишаються, як були.
    const collides = cart.some(entry =>
        !matches(entry) &&
        entry.id === id &&
        (entry.color || null) === target.color &&
        (entry.size || null) === target.size
    );

    if (collides) {

        showToast("Такий варіант уже є в кошику");

        return;

    }

    cart.forEach(entry => { if (matches(entry)) entry[field] = value; });

    saveCart(cart);

    renderCart();

}

cartItemsEl?.addEventListener("click", event => {

    const colorBtn = event.target.closest(".mini-color");
    const sizeBtn = event.target.closest(".mini-size");

    if (colorBtn || sizeBtn) {

        const row = event.target.closest(".cart-item");

        if (!row) return;

        const id = Number(row.dataset.id);
        const oldColor = row.dataset.color || null;
        const oldSize = row.dataset.size || null;

        if (colorBtn) {

            changeVariant(id, oldColor, oldSize, "color", colorBtn.dataset.color);

        } else {

            changeVariant(id, oldColor, oldSize, "size", sizeBtn.textContent.trim());

        }

        return;

    }

    const minus = event.target.closest(".qty-minus");
    const plus = event.target.closest(".qty-plus");
    const remove = event.target.closest(".cart-item-remove");

    const btn = minus || plus || remove;

    if (!btn) return;

    const id = Number(btn.dataset.id);
    const color = btn.dataset.color || null;
    const size = btn.dataset.size || null;

    if (minus) {

        // Мінус при кількості 1 — це видалення рядка, просто інакше
        // названа кнопка. Раніше воно відбувалось мовчки: людина
        // зменшувала кількість, а товар зникав із кошика без попередження.
        //
        // Питаємо ЛИШЕ в цьому випадку. При кількості 2 і більше товар
        // у кошику лишається, і підтвердження там тільки заважало б.
        const line = getGroupedCartLines().find(entry =>
            entry.id === id
            && (entry.color || null) === (color || null)
            && (entry.size || null) === (size || null)
        );

        if (line && line.qty <= 1) {

            askConfirm({
                title: "Видалити товар із кошика?",
                text: "Це останній примірник — товар зникне з кошика."
            }).then(yes => { if (yes) changeQty(id, color, size, -1); });

            return;

        }

        changeQty(id, color, size, -1);

    } else if (plus) {

        changeQty(id, color, size, 1);

    } else if (remove) {

        // Кнопка «✕» стоїть поруч із кількістю, а повернути видалене
        // нічим — тому питаємо.
        askConfirm({
            title: "Видалити товар із кошика?",
            text: "Товар зникне з кошика. Додати його знову можна буде з каталогу."
        }).then(yes => { if (yes) removeCartItem(id, color, size); });

    }

});

checkoutBtn?.addEventListener("click", () => {

    if (getCart().length === 0) return;

    window.location.href = "checkout";

});

initCart();
