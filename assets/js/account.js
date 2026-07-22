// ======================================
// account.js
// Логіка сторінки особистого кабінету (account.html):
// вхід, реєстрація, вихід, історія замовлень.
// ======================================

const authLoader = document.getElementById("authLoader");
const authCard = document.getElementById("authCard");
const accountDashboard = document.getElementById("accountDashboard");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const loginError = document.getElementById("loginError");
const signupError = document.getElementById("signupError");

const accountEmailEl = document.getElementById("accountEmail");
const logoutBtn = document.getElementById("logoutBtn");

const ordersLoader = document.getElementById("ordersLoader");
const emptyOrders = document.getElementById("emptyOrders");
const ordersListEl = document.getElementById("ordersList");

const profileForm = document.getElementById("profileForm");
const profileEmailEl = document.getElementById("profileEmail");
const profileMessageEl = document.getElementById("profileMessage");
const changePasswordBtn = document.getElementById("changePasswordBtn");

// -------------------------
// Глазок "показати/приховати пароль"
//
// Огортає КОЖНЕ поле type="password" всередині .auth-form —
// на вході, реєстрації і на формі відновлення пароля.
// Нові поля (наприклад, форма скидання пароля нижче)
// підхоплюються автоматично, без ручної розмітки для кожного.
// -------------------------

const EYE_OPEN_SVG = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_SVG = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.22 4.44M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

function initPasswordToggles() {

    document.querySelectorAll('.auth-form input[type="password"]').forEach(input => {

        if (input.closest(".password-field")) return; // вже обгорнуто раніше

        const wrapper = document.createElement("div");

        wrapper.className = "password-field";

        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const toggle = document.createElement("button");

        toggle.type = "button";
        toggle.className = "password-toggle";
        toggle.setAttribute("aria-label", "Показати пароль");
        toggle.innerHTML = EYE_OPEN_SVG;

        wrapper.appendChild(toggle);

    });

}

initPasswordToggles();

document.addEventListener("click", event => {

    const toggle = event.target.closest(".password-toggle");

    if (!toggle) return;

    const input = toggle.parentElement.querySelector('input');

    if (!input) return;

    const willShow = input.type === "password";

    input.type = willShow ? "text" : "password";

    toggle.innerHTML = willShow ? EYE_OFF_SVG : EYE_OPEN_SVG;
    toggle.setAttribute("aria-label", willShow ? "Приховати пароль" : "Показати пароль");

});

// -------------------------
// Перемикання вкладок "Увійти" / "Реєстрація"
// -------------------------

document.querySelectorAll(".auth-tab").forEach(tab => {

    tab.addEventListener("click", () => {

        document.querySelectorAll(".auth-tab").forEach(t => t.classList.toggle("active", t === tab));

        const isLogin = tab.dataset.tab === "login";

        loginForm.hidden = !isLogin;
        signupForm.hidden = isLogin;

        loginError.textContent = "";
        signupError.textContent = "";

    });

});

// -------------------------
// Реєстрація
// -------------------------

signupForm?.addEventListener("submit", async event => {

    event.preventDefault();

    signupError.textContent = "";

    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;

    if (password.length < 6) {
        signupError.textContent = "Пароль має містити щонайменше 6 символів";
        return;
    }

    const submitBtn = document.getElementById("signupSubmit");

    submitBtn.disabled = true;
    submitBtn.textContent = "Реєструємо...";

    const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: name }
        }
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Зареєструватися";

    if (error) {

        signupError.textContent = translateAuthError(error);
        return;

    }

    showToast("Реєстрація успішна! Перевірте пошту, якщо потрібне підтвердження.");

    await renderAuthState();

});

// -------------------------
// Вхід
// -------------------------

loginForm?.addEventListener("submit", async event => {

    event.preventDefault();

    loginError.textContent = "";

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const submitBtn = document.getElementById("loginSubmit");

    submitBtn.disabled = true;
    submitBtn.textContent = "Входимо...";

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    submitBtn.disabled = false;
    submitBtn.textContent = "Увійти";

    if (error) {

        loginError.textContent = translateAuthError(error);
        return;

    }

    await renderAuthState();

});

// -------------------------
// Забули пароль
// -------------------------

document.getElementById("forgotPasswordBtn")?.addEventListener("click", async () => {

    const email = document.getElementById("loginEmail").value.trim();

    if (!email) {
        loginError.textContent = "Спочатку введіть email у полі вище";
        return;
    }

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/account.html`
    });

    if (error) {
        loginError.textContent = translateAuthError(error);
        return;
    }

    loginError.textContent = "";

    showToast("Лист для відновлення пароля надіслано на " + email);

});

// -------------------------
// Вихід
// -------------------------

logoutBtn?.addEventListener("click", async () => {

    await supabaseClient.auth.signOut();

    await renderAuthState();

});

// -------------------------
// Відновлення пароля (перехід за посиланням з листа)
//
// Supabase після переходу за посиланням сама відновлює
// сесію з токена в URL і надсилає подію PASSWORD_RECOVERY.
// Перевірку самого URL робимо додатково і одразу — щоб не
// було миготіння звичайної форми входу до того, як подія
// встигне спрацювати.
// -------------------------

const resetPasswordCard = document.getElementById("resetPasswordCard");
const resetPasswordForm = document.getElementById("resetPasswordForm");
const resetPasswordError = document.getElementById("resetPasswordError");

let isPasswordRecovery =
    window.location.hash.includes("type=recovery") ||
    window.location.search.includes("type=recovery");

supabaseClient?.auth.onAuthStateChange((event) => {

    if (event === "PASSWORD_RECOVERY") {

        isPasswordRecovery = true;

        renderAuthState();

    }

});

resetPasswordForm?.addEventListener("submit", async event => {

    event.preventDefault();

    resetPasswordError.textContent = "";

    const password = document.getElementById("newPassword").value;
    const passwordConfirm = document.getElementById("newPasswordConfirm").value;

    if (password.length < 6) {
        resetPasswordError.textContent = "Пароль має містити щонайменше 6 символів";
        return;
    }

    if (password !== passwordConfirm) {
        resetPasswordError.textContent = "Паролі не збігаються";
        return;
    }

    const submitBtn = document.getElementById("resetPasswordSubmit");

    submitBtn.disabled = true;
    submitBtn.textContent = "Зберігаємо...";

    const { error } = await supabaseClient.auth.updateUser({ password });

    submitBtn.disabled = false;
    submitBtn.textContent = "Зберегти новий пароль";

    if (error) {

        resetPasswordError.textContent = translateAuthError(error);
        return;

    }

    isPasswordRecovery = false;

    // прибираємо токен відновлення з адресного рядка
    window.history.replaceState({}, document.title, window.location.pathname);

    showToast("Пароль успішно змінено!");

    await renderAuthState();

});

// -------------------------
// Переклад типових помилок Supabase Auth
// -------------------------

function translateAuthError(error) {

    const msg = error?.message || "";

    if (msg.includes("Invalid login credentials")) return "Невірний email або пароль";
    if (msg.includes("User already registered")) return "Користувач із таким email вже зареєстрований";
    if (msg.includes("Password should be")) return "Пароль надто короткий (мінімум 6 символів)";
    if (msg.includes("rate limit")) return "Забагато спроб. Спробуйте трохи пізніше";

    return "Сталася помилка. Спробуйте ще раз";

}

// -------------------------
// Історія замовлень
// -------------------------

function orderStatusLabel(status) {

    const labels = {
        new: "Нове",
        processing: "В обробці",
        shipped: "Відправлено",
        completed: "Виконано",
        cancelled: "Скасовано"
    };

    return labels[status] || "Нове";

}

async function loadOrders(userId) {

    ordersLoader.hidden = false;
    emptyOrders.hidden = true;
    ordersListEl.innerHTML = "";

    const { data, error } = await supabaseClient
        .from("orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    ordersLoader.hidden = true;

    if (error) {

        console.error("Не вдалося завантажити замовлення:", error);

        ordersListEl.innerHTML = `<p class="error">Не вдалося завантажити історію замовлень.</p>`;

        return;

    }

    if (!data || data.length === 0) {

        emptyOrders.hidden = false;

        return;

    }

    ordersListEl.innerHTML = data.map(renderOrderCard).join("");

}

function renderOrderCard(order) {

    const date = new Date(order.created_at).toLocaleDateString("uk-UA", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

    const items = Array.isArray(order.items) ? order.items : [];

    const itemsHtml = items.map(item => {

        const metaParts = [];

        if (item.color) metaParts.push(`Колір: ${item.color}`);
        if (item.size) metaParts.push(`Розмір: ${item.size}`);

        metaParts.push(`Кількість: ${item.qty}`);

        return `
            <div class="order-item">

                <div class="order-item-image">
                    <img src="${item.image || "assets/images/no-image.png"}" alt="${item.title}" onerror="this.src='assets/images/no-image.png'">
                </div>

                <div class="order-item-info">
                    <span class="order-item-title">${item.title}</span>
                    <span class="order-item-meta">${metaParts.join(" · ")}</span>
                    <span class="order-item-price">${formatPrice(item.price)}</span>
                </div>

            </div>
        `;

    }).join("");

    const deliveryLine = order.delivery_method
        ? `${order.delivery_method}${order.delivery_city ? " · " + order.delivery_city : ""}`
        : "—";

    const hasDiscount = Number(order.discount) > 0;

    const discountLine = hasDiscount
        ? `-${formatPrice(order.discount)}${order.promo_code ? ` (промокод: ${order.promo_code})` : ""}`
        : null;

    const deliveryPriceText = Number(order.delivery_price) > 0
        ? `Від ${formatPrice(order.delivery_price)}`
        : "Безкоштовно";

    // компактний рядок-зведення, видимий у згорнутому стані картки
    const briefParts = [
        deliveryLine,
        `Сума товарів ${formatPrice(order.subtotal)}`
    ];

    if (hasDiscount) {
        briefParts.push(`<span class="order-card-brief-discount">Знижка ${discountLine}</span>`);
    }

    briefParts.push(`Доставка ${deliveryPriceText}`);
    briefParts.push(`<span class="order-card-brief-total">Разом ${formatPrice(order.total)}</span>`);

    return `
        <div class="order-card">

            <button type="button" class="order-card-toggle">

                <div class="order-card-header">

                    <div class="order-card-title-group">
                        <span class="order-card-number">Замовлення ${order.order_number}</span>
                        <span class="order-status order-status-${order.status || "new"}">${orderStatusLabel(order.status)}</span>
                    </div>

                    <div class="order-card-header-right">
                        <span class="order-card-date">${date}</span>
                        <span class="order-card-chevron">⌄</span>
                    </div>

                </div>

                <div class="order-card-brief">
                    ${briefParts.join('<span class="order-card-brief-dot">·</span>')}
                </div>

            </button>

            <div class="order-card-details" hidden>

                <div class="order-card-items">
                    ${itemsHtml}
                </div>

                <div class="order-card-summary">

                    <div class="order-card-summary-row">
                        <span>Сума товарів</span>
                        <span>${formatPrice(order.subtotal)}</span>
                    </div>

                    ${hasDiscount ? `
                    <div class="order-card-summary-row order-card-summary-discount">
                        <span>Знижка</span>
                        <span>${discountLine}</span>
                    </div>
                    ` : ""}

                    <div class="order-card-summary-row">
                        <span>Доставка</span>
                        <span>${deliveryPriceText}</span>
                    </div>

                    <div class="order-card-summary-row order-card-summary-total">
                        <span>Разом</span>
                        <span>${formatPrice(order.total)}</span>
                    </div>

                </div>

            </div>

        </div>
    `;

}

// розгортання / згортання картки замовлення —
// делегування на список, бо картки перемальовуються динамічно
ordersListEl?.addEventListener("click", event => {

    const toggle = event.target.closest(".order-card-toggle");

    if (!toggle) return;

    const card = toggle.closest(".order-card");
    const details = card.querySelector(".order-card-details");

    const isOpen = card.classList.toggle("expanded");

    details.hidden = !isOpen;

});

// -------------------------
// Перемикання вкладок "Історія замовлень" / "Мої дані"
// -------------------------

document.querySelectorAll(".account-tab").forEach(tab => {

    tab.addEventListener("click", () => {

        document.querySelectorAll(".account-tab").forEach(t => t.classList.toggle("active", t === tab));

        const target = tab.dataset.tab;

        document.getElementById("ordersPanel").hidden = target !== "orders";
        document.getElementById("addressesPanel").hidden = target !== "addresses";
        document.getElementById("profilePanel").hidden = target !== "profile";

        if (target === "addresses" && !addressesLoadedOnce) {
            loadAddresses();
        }

    });

});

// -------------------------
// "Мої дані" — завантаження та збереження профілю
// -------------------------

async function loadProfile(user) {

    profileEmailEl.textContent = user.email;

    const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        console.warn("Не вдалося завантажити профіль:", error);
        return;
    }

    document.getElementById("profileFirstName").value = data?.first_name || "";
    document.getElementById("profileLastName").value = data?.last_name || "";
    document.getElementById("profileMiddleName").value = data?.middle_name || "";
    document.getElementById("profilePhone").value = data?.phone || "";
    document.getElementById("profileCity").value = data?.city || "";

}

profileForm?.addEventListener("submit", async event => {

    event.preventDefault();

    profileMessageEl.textContent = "";

    const user = await getCurrentUser();

    if (!user) return;

    const submitBtn = document.getElementById("profileSubmit");

    submitBtn.disabled = true;
    submitBtn.textContent = "Зберігаємо...";

    const { error } = await supabaseClient.from("profiles").upsert({
        id: user.id,
        first_name: document.getElementById("profileFirstName").value.trim(),
        last_name: document.getElementById("profileLastName").value.trim(),
        middle_name: document.getElementById("profileMiddleName").value.trim(),
        phone: document.getElementById("profilePhone").value.trim(),
        city: document.getElementById("profileCity").value.trim(),
        updated_at: new Date().toISOString()
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Зберегти зміни";

    if (error) {

        console.error("Не вдалося зберегти профіль:", error);

        profileMessageEl.textContent = "Не вдалося зберегти дані. Спробуйте ще раз";

        return;

    }

    showToast("Дані збережено");

});

changePasswordBtn?.addEventListener("click", async () => {

    const user = await getCurrentUser();

    if (!user) return;

    changePasswordBtn.disabled = true;

    const { error } = await supabaseClient.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/account.html`
    });

    changePasswordBtn.disabled = false;

    if (error) {
        showToast("Не вдалося надіслати лист. Спробуйте ще раз");
        return;
    }

    showToast("Лист для зміни пароля надіслано на " + user.email);

});

// -------------------------
// Адреси доставки
// -------------------------

const addressesLoader = document.getElementById("addressesLoader");
const emptyAddresses = document.getElementById("emptyAddresses");
const addressesListEl = document.getElementById("addressesList");

const addressModal = document.getElementById("addressModal");
const addressModalTitle = document.getElementById("addressModalTitle");
const addressForm = document.getElementById("addressForm");
const addressFormError = document.getElementById("addressFormError");

const addressMethodSelect = document.getElementById("addressMethod");
const addressBranchField = document.getElementById("addressBranchField");
const addressPostomatField = document.getElementById("addressPostomatField");
const addressCourierField = document.getElementById("addressCourierField");

let addressesLoadedOnce = false;
let cachedAddresses = [];

function toggleAddressMethodFields() {

    const value = addressMethodSelect.value;

    addressBranchField.hidden = value !== "На відділення «Нова пошта»";
    addressPostomatField.hidden = value !== "Поштомат «Нова пошта»";
    addressCourierField.hidden = value !== "Кур'єром «Нова пошта»";

}

addressMethodSelect?.addEventListener("change", toggleAddressMethodFields);

function openAddressModal(address) {

    addressForm.reset();
    addressFormError.textContent = "";

    document.getElementById("addressId").value = address?.id || "";
    document.getElementById("addressLabel").value = address?.label || "";
    document.getElementById("addressCity").value = address?.city || "";
    addressMethodSelect.value = address?.delivery_method || "На відділення «Нова пошта»";
    document.getElementById("addressBranchNumber").value = address?.branch_number || "";
    document.getElementById("addressPostomatNumber").value = address?.postomat_number || "";
    document.getElementById("addressCourierAddress").value = address?.courier_address || "";
    document.getElementById("addressIsDefault").checked = Boolean(address?.is_default);

    toggleAddressMethodFields();

    addressModalTitle.textContent = address ? "Редагувати адресу" : "Нова адреса";

    addressModal.hidden = false;

}

function closeAddressModal() {

    addressModal.hidden = true;

}

document.getElementById("addAddressBtn")?.addEventListener("click", () => openAddressModal(null));
document.getElementById("emptyAddAddressBtn")?.addEventListener("click", () => openAddressModal(null));
document.getElementById("addressCancelBtn")?.addEventListener("click", closeAddressModal);
document.getElementById("addressModalClose")?.addEventListener("click", closeAddressModal);

addressModal?.addEventListener("click", event => {
    if (event.target === addressModal) closeAddressModal();
});

function renderAddressCard(address) {

    const methodIcon = {
        "На відділення «Нова пошта»": "📦",
        "Поштомат «Нова пошта»": "🏤",
        "Кур'єром «Нова пошта»": "🚚"
    }[address.delivery_method] || "📍";

    const detail = address.delivery_method === "На відділення «Нова пошта»"
        ? address.branch_number
        : address.delivery_method === "Поштомат «Нова пошта»"
            ? address.postomat_number
            : address.courier_address;

    return `
        <div class="address-card" data-id="${address.id}">

            <div class="address-card-icon">${methodIcon}</div>

            <div class="address-card-info">
                <div class="address-card-title">
                    ${address.label ? `${address.label} · ` : ""}${address.city}
                    ${address.is_default ? `<span class="address-default-badge">За замовчуванням</span>` : ""}
                </div>
                <div class="address-card-detail">
                    ${address.delivery_method}${detail ? `, ${detail}` : ""}
                </div>
            </div>

            <div class="address-card-actions">
                <button type="button" class="address-edit-btn" data-id="${address.id}">Редагувати</button>
                <button type="button" class="address-remove-btn" data-id="${address.id}">✕ Видалити</button>
            </div>

        </div>
    `;

}

async function loadAddresses() {

    addressesLoadedOnce = true;

    addressesLoader.hidden = false;
    emptyAddresses.hidden = true;
    addressesListEl.innerHTML = "";

    const user = await getCurrentUser();

    if (!user) {
        addressesLoader.hidden = true;
        return;
    }

    const { data, error } = await supabaseClient
        .from("addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

    addressesLoader.hidden = true;

    if (error) {

        console.error("Не вдалося завантажити адреси:", error);

        addressesListEl.innerHTML = `<p class="error">Не вдалося завантажити адреси доставки.</p>`;

        return;

    }

    cachedAddresses = data || [];

    if (cachedAddresses.length === 0) {

        emptyAddresses.hidden = false;

        return;

    }

    addressesListEl.innerHTML = cachedAddresses.map(renderAddressCard).join("");

}

const confirmDeleteModal = document.getElementById("confirmDeleteModal");
const confirmDeleteYes = document.getElementById("confirmDeleteYes");
const confirmDeleteNo = document.getElementById("confirmDeleteNo");
const confirmDeleteClose = document.getElementById("confirmDeleteClose");

let pendingDeleteId = null;

function openConfirmDeleteModal(id) {
    pendingDeleteId = id;
    confirmDeleteModal.hidden = false;
}

function closeConfirmDeleteModal() {
    confirmDeleteModal.hidden = true;
    pendingDeleteId = null;
}

confirmDeleteNo?.addEventListener("click", closeConfirmDeleteModal);
confirmDeleteClose?.addEventListener("click", closeConfirmDeleteModal);

confirmDeleteModal?.addEventListener("click", event => {
    if (event.target === confirmDeleteModal) closeConfirmDeleteModal();
});

confirmDeleteYes?.addEventListener("click", async () => {

    if (!pendingDeleteId) return;

    const idToDelete = pendingDeleteId;

    closeConfirmDeleteModal();

    const { error } = await supabaseClient
        .from("addresses")
        .delete()
        .eq("id", idToDelete);

    if (error) {
        showToast("Не вдалося видалити адресу");
        return;
    }

    showToast("Адресу видалено");

    loadAddresses();

});

addressesListEl?.addEventListener("click", async event => {

    const editBtn = event.target.closest(".address-edit-btn");
    const removeBtn = event.target.closest(".address-remove-btn");

    if (editBtn) {

        const address = cachedAddresses.find(a => String(a.id) === editBtn.dataset.id);

        if (address) openAddressModal(address);

        return;

    }

    if (removeBtn) {

        openConfirmDeleteModal(removeBtn.dataset.id);

    }

});

addressForm?.addEventListener("submit", async event => {

    event.preventDefault();

    addressFormError.textContent = "";

    const user = await getCurrentUser();

    if (!user) return;

    const id = document.getElementById("addressId").value;
    const isDefault = document.getElementById("addressIsDefault").checked;

    const submitBtn = document.getElementById("addressSubmitBtn");

    submitBtn.disabled = true;
    submitBtn.textContent = "Зберігаємо...";

    // якщо адреса стає "за замовчуванням" — знімаємо цю позначку
    // з усіх інших адрес користувача, щоб дефолтна була лише одна
    if (isDefault) {

        await supabaseClient
            .from("addresses")
            .update({ is_default: false })
            .eq("user_id", user.id);

    }

    const payload = {
        user_id: user.id,
        label: document.getElementById("addressLabel").value.trim(),
        city: document.getElementById("addressCity").value.trim(),
        delivery_method: addressMethodSelect.value,
        branch_number: document.getElementById("addressBranchNumber").value.trim(),
        postomat_number: document.getElementById("addressPostomatNumber").value.trim(),
        courier_address: document.getElementById("addressCourierAddress").value.trim(),
        is_default: isDefault
    };

    // "id" — GENERATED ALWAYS AS IDENTITY, тому його не можна
    // передавати в тілі insert/update — для редагування існуючої
    // адреси використовуємо update() за id, для нової — insert()
    const { error } = id
        ? await supabaseClient.from("addresses").update(payload).eq("id", id)
        : await supabaseClient.from("addresses").insert(payload);

    submitBtn.disabled = false;
    submitBtn.textContent = "Зберегти адресу";

    if (error) {

        console.error("Не вдалося зберегти адресу:", error);

        addressFormError.textContent = "Не вдалося зберегти адресу. Спробуйте ще раз";

        return;

    }

    closeAddressModal();

    showToast("Адресу збережено");

    loadAddresses();

});

// -------------------------
// Визначення стану авторизації на самій сторінці кабінету
// -------------------------

async function renderAuthState() {

    const user = await getCurrentUser();

    authLoader.hidden = true;

    if (isPasswordRecovery) {

        authCard.hidden = true;
        accountDashboard.hidden = true;
        resetPasswordCard.hidden = false;

        return;

    }

    resetPasswordCard.hidden = true;

    if (user) {

        authCard.hidden = true;
        accountDashboard.hidden = false;

        accountEmailEl.textContent = user.email;

        await Promise.all([
            loadOrders(user.id),
            loadAddresses(),
            loadProfile(user)
        ]);

    } else {

        authCard.hidden = false;
        accountDashboard.hidden = true;

    }

}

renderAuthState();
