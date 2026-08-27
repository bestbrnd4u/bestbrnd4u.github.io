// ======================================
// checkout.js
// Логіка сторінки оформлення замовлення (checkout)
// ======================================

// Адреса призначення тепер у common.js — вона спільна з формою
// «Написати нам» на сторінці контактів (див. FORMSUBMIT_TARGET).
const FORM_TARGET_EMAIL = FORMSUBMIT_TARGET;

// -------------------------
// EmailJS — лист-подяка клієнту
// (Service ID / Template ID / Public Key — з кабінету emailjs.com)
// -------------------------
const EMAILJS_PUBLIC_KEY = "FqBfPcDIs4-D4cW1n";
const EMAILJS_SERVICE_ID = "service_zxx40rn";
const EMAILJS_TEMPLATE_ID_CUSTOMER = "template_kydm37m";

const emailjsReady =
    typeof emailjs !== "undefined" &&
    !EMAILJS_PUBLIC_KEY.startsWith("ВСТАВТЕ");

if (emailjsReady) {
    emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
}

// -------------------------
// Спосіб звʼязку
//
// Раніше під заголовком завжди стояло «наш менеджер зателефонує вам»,
// незалежно від вибору. Людина обирала Telegram — і читала про дзвінок.
//
// Тепер підпис називає, КУДИ саме ми напишемо, і показує сам номер чи
// адресу. Це не просто чесніше: людина бачить те, що щойно ввела, і
// одразу помічає одруківку в номері — а помилку в номері інакше
// виявляють уже тоді, коли не можуть додзвонитись.
// -------------------------

function contactChannelValue() {

    return document.querySelector('input[name="contactChannel"]:checked')?.value
        || "Телефоном";

}

function updateContactChannelNote() {

    const note = document.getElementById("contactChannelNote");
    const telegramField = document.getElementById("telegramField");

    const channel = contactChannelValue();

    // Поле ніка потрібне лише для Telegram: телефон і email уже зібрані
    // вище, а Viber працює за номером.
    if (telegramField) telegramField.hidden = channel !== "Telegram";

    if (!note) return;

    const phone = (document.getElementById("phone")?.value || "").trim();
    const email = (document.getElementById("email")?.value || "").trim();

    // Поки поле не заповнене — не вигадуємо, а називаємо його загально.
    const where = {
        "Телефоном": phone ? `зателефонуємо на ${phone}` : "зателефонуємо вам",
        "Viber": phone ? `напишемо у Viber на ${phone}` : "напишемо у Viber на ваш номер",
        "Telegram": "напишемо в Telegram",
        "Email": email ? `напишемо на ${email}` : "напишемо на вашу пошту"
    }[channel];

    note.textContent = `Щоб підтвердити замовлення, ми ${where}.`;

}

document.addEventListener("change", event => {

    if (event.target.name === "contactChannel") updateContactChannelNote();

});

// Номер і пошту людина вводить ПІСЛЯ вибору способу звʼязку, тож підпис
// має оновлюватись і при їх зміні — інакше він назве порожнє поле.
["phone", "email"].forEach(id => {

    document.getElementById(id)?.addEventListener("input", updateContactChannelNote);

});

updateContactChannelNote();

// Склад кошика для статистики.
//
// Один помічник на дві події: begin_checkout і purchase описують той
// самий кошик, і збирати його двома різними способами означало б рано
// чи пізно отримати розбіжність у звітах.
function reportCheckout(event, detail) {

    if (!window.Analytics) return;

    const lines = getGroupedCartLines().map(line => ({
        product: findCachedProduct(line.id),
        color: line.color,
        size: line.size,
        qty: line.qty
    })).filter(x => x.product);

    if (!lines.length) return;

    const total = lines.reduce((sum, line) =>
        sum + (Number(line.product.price) || 0) * line.qty, 0);

    if (event === "purchase") {

        window.Analytics.purchase({
            id: detail,
            total: total,
            lines: lines,
            promo: appliedPromo?.code || undefined
        });

        return;

    }

    if (event === "shipping") {

        window.Analytics.addShippingInfo(lines, total, detail);

        return;

    }

    if (event === "payment") {

        window.Analytics.addPaymentInfo(lines, total, detail);

        return;

    }

    window.Analytics.beginCheckout(lines, total);

}

function generateOrderId() {

    // 10-значний цифровий номер замовлення: останні 7 цифр
    // поточної мітки часу (мс) + 3 випадкові цифри — унікальний,
    // без жодної літери, легко продиктувати телефоном
    const timePart = Date.now().toString().slice(-7);
    const randomPart = Math.floor(100 + Math.random() * 900);

    return timePart.toString() + randomPart.toString();

}

function getFormattedOrderDate() {

    const now = new Date();

    const datePart = now.toLocaleDateString("uk-UA", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

    const timePart = now.toLocaleTimeString("uk-UA", {
        hour: "2-digit",
        minute: "2-digit"
    });

    return `${datePart}, ${timePart}`;

}

// демо-промокоди: у коді зберігаються НЕ самі коди, а їх SHA-256 хеші,
// щоб коди не було видно у вихідному коді / вкладці Network через F12.
// Порівняння відбувається так: хешуємо те, що ввів користувач, і звіряємо
// з хешем у списку нижче.
const PROMO_CODE_HASHES = {
    "c9e488ab31fa759d6b8fab82285ea82e2c2bde7055560b03a60242e0e3512819": 0.05,
    "52d409d2e035f5b361fecd6c952ee4a1ad00cec281f1fb94405c91aae35d3307": 0.05,
    "2e8d6035d09c520891c8b018695a31f8ec903d0a972a823a57050f2a05d5b7e7": 0.05,
    "dd0bf242e212c7176713e48a193b9b135eeb12f1974be00303a5b8d094d3da5a": 0.05,
    "389df058d4010a10d167664d06f93c6816be73742dae54c4941af2a4041c8d8b": 0.05,
    "e860bea6d6326683355ec709f44bceddc8545eefd7c7cc9429a1176ba5d81164": 0.10,
    "f8bfba274811113169369a01408fd10d8406a9f13c59fed2e3fb378d1f3c97f2": 0.10,
    "307d71cefd74a418f98ca149646ff244688e6c8a06a7519a65598b86d4a0d182": 0.10,
    "f1908dcd504cdf1ea8dcac9169f5182e4fcb9b6ca90ceea06d405a155f4366ff": 0.10,
    "184806b2107cb6a666a29ad6a4dad4477ab85342b1ea390345ae5cf3eaba78cb": 0.10
};

async function sha256Hex(text) {

    const bytes = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

}

let allProducts = [];
let appliedPromo = null; // { code, percent }

const checkoutEmptyEl = document.getElementById("checkoutEmpty");
const checkoutLayoutEl = document.getElementById("checkoutLayout");

const orderSummaryItemsEl = document.getElementById("orderSummaryItems");
const orderSubtotalEl = document.getElementById("orderSubtotal");
const orderDiscountRowEl = document.getElementById("orderDiscountRow");
const orderDiscountEl = document.getElementById("orderDiscount");
const orderDeliveryPriceEl = document.getElementById("orderDeliveryPrice");
const orderTotalEl = document.getElementById("orderTotal");

const promoInput = document.getElementById("promoInput");
const applyPromoBtn = document.getElementById("applyPromo");
const promoMessageEl = document.getElementById("promoMessage");

const toggleSummaryBtn = document.getElementById("toggleSummary");

const checkoutForm = document.getElementById("checkoutForm");
const submitOrderBtn = document.getElementById("submitOrderBtn");

// якщо клієнт авторизований і вже заповнював «Мої дані» в кабінеті —
// підставляємо ці дані в форму оформлення замовлення автоматично.
// Best-effort: якщо щось піде не так, форма просто лишається порожньою.
async function prefillFromProfile() {

    if (!supabaseClient) return;

    const user = await getCurrentUser();

    if (!user) return;

    const emailField = document.getElementById("email");

    if (emailField && !emailField.value) {
        emailField.value = user.email;
    }

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    if (error || !data) return;

    const fill = (id, value) => {
        const field = document.getElementById(id);
        if (field && !field.value && value) field.value = value;
    };

    fill("firstName", data.first_name);
    fill("lastName", data.last_name);
    fill("middleName", data.middle_name);
    fill("phone", data.phone);
    fill("city", data.city);

}

// -------------------------
// Збережені адреси доставки — підтягуємо в чекаут,
// щоб не вводити їх заново кожного разу
// -------------------------

function applySavedAddress(address) {

    document.getElementById("city").value = address.city || "";

    const radio = document.querySelector(
        `input[name="deliveryMethod"][value="${CSS.escape(address.delivery_method)}"]`
    );

    if (radio) {

        radio.checked = true;
        radio.dispatchEvent(new Event("change"));

    }

    if (address.branch_number) {
        document.getElementById("branchNumber").value = address.branch_number;
    }

    if (address.postomat_number) {
        document.getElementById("postomatNumber").value = address.postomat_number;
    }

    if (address.courier_address) {
        document.getElementById("courierAddress").value = address.courier_address;
    }

    clearFieldError("city");
    clearFieldError("deliveryMethod");

    document.querySelectorAll(".saved-address-chip").forEach(chip => {
        chip.classList.toggle("active", Number(chip.dataset.id) === address.id);
    });

}

async function loadSavedAddressesForCheckout() {

    if (!supabaseClient) return;

    const user = await getCurrentUser();

    if (!user) return;

    const { data, error } = await supabaseClient
        .from("addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

    if (error || !data || data.length === 0) return;

    const block = document.getElementById("savedAddressesBlock");
    const list = document.getElementById("savedAddressesList");

    list.innerHTML = data.map(address => `
        <button type="button" class="saved-address-chip" data-id="${address.id}">
            <span class="saved-address-chip-title">${address.label ? `${address.label} · ` : ""}${address.city}</span>
            <span class="saved-address-chip-meta">${address.delivery_method}</span>
        </button>
    `).join("");

    list.querySelectorAll(".saved-address-chip").forEach(chip => {

        chip.addEventListener("click", () => {

            const address = data.find(a => a.id === Number(chip.dataset.id));

            if (address) applySavedAddress(address);

        });

    });

    block.hidden = false;

    // якщо є адреса за замовчуванням і форма ще порожня — підставляємо одразу
    const defaultAddress = data.find(a => a.is_default) || data[0];

    if (defaultAddress && !document.getElementById("city").value) {

        applySavedAddress(defaultAddress);

    }

}

async function initCheckout() {

    if (!checkoutLayoutEl) return;

    if (getCart().length === 0) {
        checkoutEmptyEl.hidden = false;
        checkoutLayoutEl.hidden = true;
        return;
    }

    try {

        const response = await fetch(dataUrl("data/products.json"));

        if (!response.ok) {
            throw new Error("Не вдалося завантажити товари");
        }

        allProducts = await response.json();

        renderOrderSummary();

        prefillFromProfile();

        loadSavedAddressesForCheckout();

    } catch (error) {

        orderSummaryItemsEl.innerHTML = `<p class="error">Помилка завантаження замовлення.</p>`;

        console.error(error);

    }

}

function getCartLines() {

    return getGroupedCartLines()
        .map(line => {

            const product = findProductById(line.id);

            if (!product) return null;

            return {
                product,
                qty: line.qty,
                color: line.color,
                size: line.size
            };

        })
        .filter(Boolean);

}

function findProductById(id) {

    return allProducts.find(item => Number(item.id) === Number(id));

}

function getSelectedDelivery() {

    const checked = document.querySelector('input[name="deliveryMethod"]:checked');

    if (!checked) return null;

    return {
        label: checked.value,
        price: Number(checked.dataset.price) || 0
    };

}

function getSelectedPayment() {

    const checked = document.querySelector('input[name="paymentMethod"]:checked');

    return checked ? checked.value : null;

}

// поле-деталь доставки (номер відділення / поштомату / адреса
// кур'єра — залежно від обраного способу), одним рядком —
// саме так воно потрапляє в кабінет і в лист
function getDeliveryDetailValue() {

    const delivery = getSelectedDelivery();

    if (!delivery) return null;

    if (delivery.label === "На відділення «Нова пошта»") {
        return document.getElementById("branchNumber")?.value.trim() || null;
    }

    if (delivery.label === "Поштомат «Нова пошта»") {
        return document.getElementById("postomatNumber")?.value.trim() || null;
    }

    if (delivery.label === "Кур'єром «Нова пошта»") {
        return document.getElementById("courierAddress")?.value.trim() || null;
    }

    return null;

}

function renderOrderSummary() {

    const lines = getCartLines();

    if (lines.length === 0) {
        checkoutEmptyEl.hidden = false;
        checkoutLayoutEl.hidden = true;
        return;
    }

    checkoutEmptyEl.hidden = true;
    checkoutLayoutEl.hidden = false;

    orderSummaryItemsEl.innerHTML = lines.map(({ product, qty, color, size }) => {

        const image = product.images?.[0] || "assets/images/no-image.png";

        const oldPriceHtml = product.oldPrice
            ? `<span class="order-item-oldprice">${formatPrice(product.oldPrice)}</span>`
            : "";

        const metaParts = [];

        if (color) metaParts.push(`Колір: ${color}`);
        if (size) metaParts.push(`Розмір: ${size}`);

        metaParts.push(`Кількість: ${qty}`);

        return `
            <div class="order-item">

                <a href="${productUrl(product)}" class="order-item-image">
                    <img src="${image}" alt="${escapeHtml(product.title)}" onerror="this.src='assets/images/no-image.png'">
                </a>

                <div class="order-item-info">
                    <a href="${productUrl(product)}" class="order-item-title">${escapeHtml(product.title)}</a>
                    <span class="order-item-meta">
                        ${metaParts.join(" · ")}
                    </span>
                    <span class="order-item-price">
                        ${oldPriceHtml}${formatPrice(product.price)}
                    </span>
                </div>

            </div>
        `;

    }).join("");

    updateTotals();

}

function updateTotals() {

    const lines = getCartLines();

    const subtotal = lines.reduce((sum, { product, qty }) => {
        return sum + (product.oldPrice || product.price) * qty;
    }, 0);

    const priceTotal = lines.reduce((sum, { product, qty }) => {
        return sum + product.price * qty;
    }, 0);

    const productDiscount = subtotal - priceTotal;

    const promoDiscount = appliedPromo
        ? Math.round(priceTotal * appliedPromo.percent)
        : 0;

    const totalDiscount = productDiscount + promoDiscount;

    const delivery = getSelectedDelivery();
    const deliveryPrice = delivery ? delivery.price : 0;

    const total = priceTotal - promoDiscount + deliveryPrice;

    orderSubtotalEl.textContent = formatPrice(subtotal);

    if (totalDiscount > 0) {
        orderDiscountRowEl.hidden = false;
        orderDiscountEl.textContent = "-" + formatPrice(totalDiscount);
    } else {
        orderDiscountRowEl.hidden = true;
    }

    orderDeliveryPriceEl.textContent = delivery
        ? `від ${formatPrice(deliveryPrice)}`
        : "Оберіть спосіб";

    orderTotalEl.textContent = formatPrice(Math.max(total, 0));

}

// -------------------------
// Способи доставки
// -------------------------

// Статистика: крок «оплата».
//
// Свого обробника на вибір оплати не було — нічого, крім статистики,
// тут і не потрібно. Разом із кроком доставки це ділить проміжок між
// «почав оформлення» і «замовив» навпіл: видно, на якому саме кроці
// людина передумала.
document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {

    radio.addEventListener("change", () => {
        reportCheckout("payment", radio.value);
    });

});

document.querySelectorAll('input[name="deliveryMethod"]').forEach(radio => {

    radio.addEventListener("change", () => {

        document.querySelectorAll(".delivery-detail").forEach(detail => {
            detail.classList.toggle("show", detail.dataset.detailFor === radio.value);
        });

        clearFieldError("deliveryMethod");

        updateTotals();

        // Статистика: крок «доставка». Разом із begin_checkout і purchase
        // показує, чи не втрачаємо людей саме на виборі доставки.
        reportCheckout("shipping", radio.value);

    });

});

// -------------------------
// Промокод
// -------------------------

applyPromoBtn?.addEventListener("click", async () => {

    const code = promoInput.value.trim().toUpperCase();

    if (!code) {
        promoMessageEl.textContent = "Введіть промокод";
        promoMessageEl.className = "promo-message error";
        return;
    }

    applyPromoBtn.disabled = true;

    let hash;

    try {
        hash = await sha256Hex(code);
    } catch (error) {
        console.error("Не вдалося перевірити промокод:", error);
        promoMessageEl.textContent = "Не вдалося перевірити промокод. Спробуйте ще раз.";
        promoMessageEl.className = "promo-message error";
        applyPromoBtn.disabled = false;
        return;
    }

    const percent = PROMO_CODE_HASHES[hash];

    applyPromoBtn.disabled = false;

    if (percent) {

        appliedPromo = { code, percent };

        promoMessageEl.textContent = `Промокод «${code}» застосовано (-${percent * 100}%)`;
        promoMessageEl.className = "promo-message success";

    } else {

        appliedPromo = null;

        promoMessageEl.textContent = "Такого промокоду не існує";
        promoMessageEl.className = "promo-message error";

    }

    updateTotals();

});

// -------------------------
// Приховати / показати склад замовлення
// -------------------------

toggleSummaryBtn?.addEventListener("click", () => {

    const hidden = orderSummaryItemsEl.classList.toggle("hidden");

    toggleSummaryBtn.textContent = hidden ? "Показати" : "Приховати";

});

// -------------------------
// Валідація форми
// -------------------------

function setFieldError(fieldId, message) {

    const errorEl = document.querySelector(`[data-error-for="${fieldId}"]`);
    const fieldEl = document.getElementById(fieldId);

    if (errorEl) errorEl.textContent = message;

    if (fieldEl) fieldEl.classList.toggle("invalid", Boolean(message));

}

function clearFieldError(fieldId) {

    setFieldError(fieldId, "");

}

function validateForm() {

    let isValid = true;

    const requiredFields = [
        { id: "firstName" },
        { id: "lastName" },
        { id: "email" },
        { id: "phone" },
        { id: "city" }
    ];

    requiredFields.forEach(({ id }) => {

        const field = document.getElementById(id);

        clearFieldError(id);

        if (!field.value.trim()) {
            setFieldError(id, "Обов'язкове поле.");
            isValid = false;
            return;
        }

        if (id === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim())) {
            setFieldError(id, "Некоректний email.");
            isValid = false;
        }

        if (id === "phone" && field.value.replace(/\D/g, "").length < 10) {
            setFieldError(id, "Некоректний номер телефону.");
            isValid = false;
        }

    });

    clearFieldError("deliveryMethod");

    if (!getSelectedDelivery()) {
        setFieldError("deliveryMethod", "Оберіть спосіб доставки");
        isValid = false;
    }

    return isValid;

}

// прибираємо помилку одразу після того, як користувач починає виправляти поле
["firstName", "lastName", "email", "phone", "city"].forEach(id => {

    document.getElementById(id)?.addEventListener("input", () => clearFieldError(id));

});

// -------------------------
// Формування тексту замовлення для листа
// -------------------------

function buildOrderCompositionText() {

    const lines = getCartLines();

    return lines.map(({ product, qty, color, size }) => {

        const lineTotal = product.price * qty;

        return `${product.brand ? escapeHtml(product.brand) + " — " : ""}${escapeHtml(product.title)}`
            + `${color ? `, колір: ${color}` : ""}`
            + `${size ? `, розмір: ${size}` : ""}`
            + `, кількість: ${qty}`
            + `, ціна за од.: ${formatPrice(product.price)}`
            + `, сума: ${formatPrice(lineTotal)}`;

    }).join("\n");

}

function computeOrderTotals() {

    const lines = getCartLines();

    const priceTotal = lines.reduce((sum, { product, qty }) => sum + product.price * qty, 0);

    const subtotal = lines.reduce((sum, { product, qty }) => {
        return sum + (product.oldPrice || product.price) * qty;
    }, 0);

    const promoDiscount = appliedPromo ? Math.round(priceTotal * appliedPromo.percent) : 0;

    const productDiscount = subtotal - priceTotal;
    const totalDiscount = productDiscount + promoDiscount;

    const delivery = getSelectedDelivery();
    const deliveryPrice = delivery ? delivery.price : 0;

    const total = Math.max(priceTotal - promoDiscount + deliveryPrice, 0);

    return { subtotal, priceTotal, promoDiscount, totalDiscount, delivery, deliveryPrice, total };

}

function fillHiddenFields() {

    const { subtotal, totalDiscount, delivery, deliveryPrice, total } = computeOrderTotals();

    document.getElementById("orderComposition").value = buildOrderCompositionText();
    document.getElementById("orderSubtotalField").value = formatPrice(subtotal);
    document.getElementById("orderPaymentField").value = getSelectedPayment() || "—";
    document.getElementById("orderDiscountField").value = totalDiscount > 0
        ? `-${formatPrice(totalDiscount)}${appliedPromo ? ` (промокод: ${appliedPromo.code})` : ""}`
        : "0 грн";
    document.getElementById("orderPromoField").value = appliedPromo ? appliedPromo.code : "—";
    document.getElementById("orderDeliveryField").value = delivery
        ? `${delivery.label} — від ${formatPrice(deliveryPrice)}`
        : "—";
    document.getElementById("orderTotalField").value = formatPrice(total);
    document.getElementById("orderReplyTo").value = document.getElementById("email").value.trim();

}

function buildEmailTemplateParams(orderId, orderDate) {

    const { subtotal, totalDiscount, delivery, deliveryPrice, total } = computeOrderTotals();

    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    const emailValue = document.getElementById("email").value.trim();
    const phoneValue = document.getElementById("phone").value.trim();
    const cityValue = document.getElementById("city").value.trim();

    const contactChannel = document.querySelector('input[name="contactChannel"]:checked')?.value || "—";

    return {
        to_email: emailValue,
        to_name: `${firstName} ${lastName}`.trim(),
        order_id: orderId,
        order_date: orderDate,
        order_items: buildOrderCompositionText(),
        order_subtotal: formatPrice(subtotal),
        order_discount: totalDiscount > 0 ? `-${formatPrice(totalDiscount)}` : "0 грн",
        order_delivery_price: delivery ? `від ${formatPrice(deliveryPrice)}` : "—",
        order_total: formatPrice(total),
        delivery_city: cityValue,
        delivery_method: delivery ? delivery.label : "—",
        payment_method: getSelectedPayment() || "—",
        customer_phone: phoneValue,
        contact_channel: contactChannel
    };

}

function buildOrderItemsSnapshot() {

    return getCartLines().map(({ product, qty, color, size }) => ({
        id: product.id,
        title: product.title,
        brand: product.brand,
        price: product.price,
        // АБСОЛЮТНА адреса, а не /assets/images/…
        //
        // ЧОМУ. Цей знімок замовлення йде і в базу, і в лист. Відносний
        // шлях працює лише на сторінці сайту: у листі його нема від чого
        // відкладати, і почтовик показує заглушку замість фото. Саме це
        // й було видно в листі «дякуємо за замовлення».
        image: absoluteUrl(product.images?.[0]) || null,
        qty,
        color,
        size
    }));

}

// Зберігаємо замовлення в Supabase.
//
// Раніше тут стояв ранній вихід `if (!user) return;` — гостьові
// замовлення в базу не потрапляли взагалі, лишався тільки лист.
// Через це, зокрема, сповіщення в Telegram (воно спрацьовує на
// додавання рядка в orders) не бачило б жодної заявки від гостя,
// а таких — більшість. Тепер зберігаємо завжди: авторизованим
// проставляємо user_id, щоб замовлення було видно в «Історії
// замовлень» кабінету, гостям лишаємо null.
//
// Це best-effort: якщо збереження не вдалося, оформлення
// замовлення все одно вважається успішним (лист вже надіслано).
async function saveOrderToSupabase(orderId) {

    if (!supabaseClient) return;

    const user = await getCurrentUser();

    const { subtotal, totalDiscount, delivery, total } = computeOrderTotals();

    const { error } = await supabaseClient.from("orders").insert({
        user_id: user ? user.id : null,
        order_number: orderId,
        status: "new",
        items: buildOrderItemsSnapshot(),
        subtotal,
        discount: totalDiscount,
        delivery_price: delivery ? delivery.price : 0,
        total,
        delivery_method: delivery ? delivery.label : null,
        delivery_city: document.getElementById("city")?.value.trim() || null,
        delivery_detail: getDeliveryDetailValue(),
        payment_method: getSelectedPayment(),
        promo_code: appliedPromo ? appliedPromo.code : null,
        first_name: document.getElementById("firstName")?.value.trim() || null,
        last_name: document.getElementById("lastName")?.value.trim() || null,
        phone: document.getElementById("phone")?.value.trim() || null,
        email: document.getElementById("email")?.value.trim() || null
    });

    if (error) {
        console.warn("Не вдалося зберегти замовлення в історію кабінету:", error);
    }

}

// -------------------------
// Відправка замовлення
// -------------------------

checkoutForm?.addEventListener("submit", event => {

    event.preventDefault();

    if (!validateForm()) {

        const firstError = checkoutForm.querySelector(".field-error:not(:empty)");

        firstError?.closest("label, .delivery-options")?.scrollIntoView({ behavior: "smooth", block: "center" });

        return;

    }

    fillHiddenFields();

    leaveGuardActive = false;

    const orderId = generateOrderId();
    const orderDate = getFormattedOrderDate();

    submitOrderBtn.disabled = true;
    submitOrderBtn.textContent = "Надсилаємо...";

    // Статистика: початок оформлення. Разом із purchase це показує,
    // скільки людей дійшли до кнопки, але замовлення не завершили.
    reportCheckout("beginCheckout");

    // 1) сповіщення нам на пошту — деталі замовлення (FormSubmit)
    const formData = new FormData(checkoutForm);
    const payload = {};
    formData.forEach((value, key) => { payload[key] = value; });
    payload["Номер замовлення"] = orderId;

    const ownerNotification = fetch(`https://formsubmit.co/ajax/${FORM_TARGET_EMAIL}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify(payload)
    });

    // 2) лист-подяка клієнту з деталями його замовлення (EmailJS)
    const customerThankYou = emailjsReady
        ? emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID_CUSTOMER,
            buildEmailTemplateParams(orderId, orderDate)
        )
        : Promise.reject(new Error("EmailJS не налаштовано"));

    Promise.allSettled([ownerNotification, customerThankYou]).then(([ownerResult, customerResult]) => {

        if (customerResult.status === "rejected") {
            console.warn("Лист клієнту не надіслано:", customerResult.reason);
        }

        if (ownerResult.status === "fulfilled" && ownerResult.value.ok) {

            leaveGuardActive = false;

            // Склад замовлення для сторінки «Дякуємо».
            //
            // ЧОМУ ТУТ БУВ ПРОЧЕРК
            // ---------------------
            // Раніше кількість рахувалась так:
            //   getCart().reduce((sum, line) => sum + line.qty, 0)
            // Але getCart() віддає ОКРЕМИЙ запис на кожну одиницю
            // товару, і поля qty в них немає. Сума виходила NaN, а
            // JSON.stringify перетворює NaN на null — на сторінці
            // з'являлось «—».
            //
            // getGroupedCartLines() групує записи й рахує qty — саме
            // те, що потрібно. Ним же користується сам кошик, тож
            // цифри на обох сторінках тепер з одного джерела.
            const lines = getGroupedCartLines();

            const itemsCount = lines.reduce((sum, line) => sum + line.qty, 0);

            // Зберігаємо й самі товари: назву, фото, кількість і суму.
            //
            // Без них сторінка підтвердження показує лише число, і
            // покупець не може перевірити, ЩО саме він замовив. А це
            // останній момент, коли помилку ще легко виправити
            // телефоном.
            const items = lines.map(line => {

                const product = findCachedProduct(line.id) || {};

                const price = Number(product.price) || 0;

                return {
                    title: product.title || "Товар",
                    brand: product.brand || "",
                    image: (product.images || [])[0]
                        || (product.variants?.[0]?.images || [])[0]
                        || "",
                    color: line.color || "",
                    size: line.size || "",
                    qty: line.qty,
                    sum: price * line.qty
                };

            });

            sessionStorage.setItem("bestbrnd4uLastOrder", JSON.stringify({
                orderId,
                orderDate,
                itemsCount,
                items,
                total: orderTotalEl.textContent,
                firstName: document.getElementById("firstName")?.value.trim() || ""
            }));

            // Статистика: оформлене замовлення. Ловимо ДО очищення
            // кошика — після saveCart([]) складу вже не дізнатись.
            //
            // Персональних даних не передаємо: тільки номер, сума й
            // склад. Ім'я, телефон і адреса лишаються в магазині.
            reportCheckout("purchase", orderId);

            saveOrderToSupabase(orderId).finally(() => {

                saveCart([]);

                window.location.href = "thanks";

            });

        } else {

            console.error("Замовлення не надіслано:", ownerResult.reason);

            leaveGuardActive = true;

            showToast("Не вдалося надіслати замовлення. Спробуйте ще раз або зателефонуйте нам.");

            submitOrderBtn.disabled = false;
            submitOrderBtn.textContent = "Оформити замовлення";

        }

    });

});

// -------------------------
// Поп-ап "Ви залишаєте сторінку замовлення"
// -------------------------

const leaveModal = document.getElementById("leaveConfirmModal");
const leaveModalConfirm = document.getElementById("leaveModalConfirm");
const leaveModalCancel = document.getElementById("leaveModalCancel");
const leaveModalClose = document.getElementById("leaveModalClose");

let leaveGuardActive = true;
let pendingLeaveUrl = null;

function openLeaveModal(url) {

    pendingLeaveUrl = url;

    if (leaveModal) leaveModal.hidden = false;

}

function closeLeaveModal() {

    if (leaveModal) leaveModal.hidden = true;

    pendingLeaveUrl = null;

}

leaveModalConfirm?.addEventListener("click", () => {

    const url = pendingLeaveUrl;

    leaveGuardActive = false;

    closeLeaveModal();

    if (url) window.location.href = url;

});

leaveModalCancel?.addEventListener("click", closeLeaveModal);
leaveModalClose?.addEventListener("click", closeLeaveModal);

leaveModal?.addEventListener("click", event => {

    if (event.target === leaveModal) closeLeaveModal();

});

document.addEventListener("keydown", event => {

    if (event.key === "Escape" && leaveModal && !leaveModal.hidden) closeLeaveModal();

});

document.addEventListener("click", event => {

    if (!leaveGuardActive) return;

    // не заважаємо, якщо кошик порожній або замовлення вже оформлено —
    // у цих станах втрачати нічого
    if (!checkoutLayoutEl || checkoutLayoutEl.hidden) return;

    const link = event.target.closest("a[href]");

    if (!link) return;

    const href = link.getAttribute("href");

    if (!href) return;
    if (href.startsWith("#")) return;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return;
    if (link.target === "_blank") return;

    event.preventDefault();

    openLeaveModal(link.href);

});

// нативне попередження при закритті вкладки / перезавантаженні
window.addEventListener("beforeunload", event => {

    if (!leaveGuardActive) return;
    if (!checkoutLayoutEl || checkoutLayoutEl.hidden) return;

    event.preventDefault();
    event.returnValue = "";

});

// якщо сторінку відновлено з bfcache (кнопка "назад" браузера) —
// перезавантажуємо, щоб форма і кнопка оформлення отримали
// актуальний стан кошика (після оформлення він уже порожній)
window.addEventListener("pageshow", event => {

    if (event.persisted) {
        location.reload();
    }

});

initCheckout();
