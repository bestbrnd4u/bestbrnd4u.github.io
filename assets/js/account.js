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

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email);

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

    return `
        <div class="order-card">

            <div class="order-card-header">

                <div>
                    <span class="order-card-number">Замовлення ${order.order_number}</span>
                    <span class="order-card-date">${date}</span>
                </div>

                <span class="order-status order-status-${order.status || "new"}">${orderStatusLabel(order.status)}</span>

            </div>

            <div class="order-card-items">
                ${itemsHtml}
            </div>

            <div class="order-card-delivery">
                <span>Доставка</span>
                <span>${deliveryLine}</span>
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
                    <span>${Number(order.delivery_price) > 0 ? formatPrice(order.delivery_price) : "Безкоштовно"}</span>
                </div>

                <div class="order-card-summary-row order-card-summary-total">
                    <span>Разом</span>
                    <span>${formatPrice(order.total)}</span>
                </div>

            </div>

        </div>
    `;

}

// -------------------------
// Визначення стану авторизації на самій сторінці кабінету
// -------------------------

async function renderAuthState() {

    const user = await getCurrentUser();

    authLoader.hidden = true;

    if (user) {

        authCard.hidden = true;
        accountDashboard.hidden = false;

        accountEmailEl.textContent = user.email;

        await loadOrders(user.id);

    } else {

        authCard.hidden = false;
        accountDashboard.hidden = true;

    }

}

renderAuthState();
