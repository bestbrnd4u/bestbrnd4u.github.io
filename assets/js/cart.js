// ======================================
// cart.js
// Логіка сторінки кошика (cart.html)
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

        const response = await fetch("data/products.json");

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

    const rows = lines.map(line => {

        const product = findProductById(line.id);

        if (!product) return "";

        const qty = line.qty;
        const lineTotal = product.price * qty;
        const lineTotalFull = (product.oldPrice || product.price) * qty;

        subtotal += lineTotal;
        subtotalFull += lineTotalFull;
        itemsCount += qty;

        const image = product.images?.[0] || "assets/images/no-image.png";

        const metaParts = [];

        if (line.color) metaParts.push(`Колір: ${line.color}`);
        if (line.size) metaParts.push(`Розмір: ${line.size}`);

        const variantHtml = metaParts.length
            ? `<div class="cart-item-variant">${metaParts.join(" · ")}</div>`
            : "";

        return `
            <div class="cart-item" data-id="${line.id}" data-color="${line.color || ""}" data-size="${line.size || ""}">

                <a href="product.html?id=${line.id}" class="cart-item-image">
                    <img
                        src="${image}"
                        alt="${product.title}"
                        onerror="this.src='assets/images/no-image.png'">
                </a>

                <div class="cart-item-info">
                    <div class="cart-item-brand">${product.brand || ""}</div>
                    <a href="product.html?id=${line.id}" class="cart-item-title">
                        ${product.title}
                    </a>
                    ${variantHtml}
                    <div class="cart-item-price">${formatPrice(product.price)}</div>
                </div>

                <div class="cart-item-qty">
                    <button class="qty-btn qty-minus" data-id="${line.id}" data-color="${line.color || ""}" data-size="${line.size || ""}" aria-label="Зменшити кількість">−</button>
                    <span>${qty}</span>
                    <button class="qty-btn qty-plus" data-id="${line.id}" data-color="${line.color || ""}" data-size="${line.size || ""}" aria-label="Збільшити кількість">+</button>
                </div>

                <div class="cart-item-total">${formatPrice(lineTotal)}</div>

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

    cartItemsEl.innerHTML = rows.join("");

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

cartItemsEl?.addEventListener("click", event => {

    const minus = event.target.closest(".qty-minus");
    const plus = event.target.closest(".qty-plus");
    const remove = event.target.closest(".cart-item-remove");

    const btn = minus || plus || remove;

    if (!btn) return;

    const id = Number(btn.dataset.id);
    const color = btn.dataset.color || null;
    const size = btn.dataset.size || null;

    if (minus) {

        changeQty(id, color, size, -1);

    } else if (plus) {

        changeQty(id, color, size, 1);

    } else if (remove) {

        removeCartItem(id, color, size);

    }

});

checkoutBtn?.addEventListener("click", () => {

    if (getCart().length === 0) return;

    window.location.href = "checkout.html";

});

initCart();
