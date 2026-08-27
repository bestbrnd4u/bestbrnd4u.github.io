// ======================================
// account.js
// Логіка сторінки особистого кабінету (account):
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
// Переклад стандартних підказок браузера (валідація полів) —
// інакше при required/minlength браузер показує їх англійською
// -------------------------

function localizeValidationMessages(form) {

    form?.querySelectorAll("input").forEach(input => {

        const setMessage = () => {

            if (input.validity.valueMissing) {
                input.setCustomValidity("Заповніть це поле");
            } else if (input.validity.tooShort) {
                input.setCustomValidity(`Мінімум ${input.minLength} символів (зараз ${input.value.length})`);
            } else if (input.validity.typeMismatch && input.type === "email") {
                input.setCustomValidity("Введіть коректну email-адресу");
            } else {
                input.setCustomValidity("");
            }

        };

        input.addEventListener("invalid", setMessage);
        input.addEventListener("input", () => input.setCustomValidity(""));

    });

}

document.querySelectorAll(".auth-form").forEach(localizeValidationMessages);

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

    if (!validateFormUk(signupForm)) return;

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

    if (!validateFormUk(loginForm)) return;

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

    loginError.textContent = "";

    // Перевіряємо, чи взагалі є такий email у системі —
    // без цього Supabase мовчки "надсилає лист" навіть
    // для незареєстрованої пошти (це навмисний захист від
    // email enumeration, детальніше — у email-exists-function.sql)
    const { data: emailExists, error: checkError } = await supabaseClient.rpc(
        "email_exists",
        { check_email: email }
    );

    if (checkError) {
        loginError.textContent = translateAuthError(checkError);
        return;
    }

    if (!emailExists) {
        loginError.textContent = "Такої пошти немає в системі. Зареєструйте акаунт, щоб увійти.";
        return;
    }

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/account`
    });

    if (error) {
        loginError.textContent = translateAuthError(error);
        return;
    }

    showTopNotice("Лист для відновлення пароля надіслано на " + email);

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

    if (!validateFormUk(resetPasswordForm)) return;

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
    const code = error?.code || "";

    if (code === "same_password" || msg.includes("different from the old password")) {
        return "Новий пароль повинен відрізнятися від поточного";
    }

    if (msg.includes("Invalid login credentials")) return "Невірний email або пароль";
    if (msg.includes("User already registered")) return "Користувач із таким email вже зареєстрований";
    if (msg.includes("Password should be")) return "Пароль надто короткий (мінімум 6 символів)";
    if (msg.includes("rate limit")) return "Забагато спроб. Спробуйте трохи пізніше";

    return "Сталася помилка. Спробуйте ще раз";

}

// -------------------------
// Історія замовлень
// -------------------------

// Стан саме ДОСТАВКИ — формулювання інші, ніж у статусі замовлення.
//
// Колонка delivery_status у базі є, але її ніхто не заповнює, тож у
// кабінеті там завжди стояв прочерк — навіть коли замовлення вже
// відправлене з накладною. Тепер: якщо колонку колись почнуть
// заповнювати (напр. з API Нової пошти) — показуємо її, інакше
// виводимо стан, виведений зі статусу замовлення.
function deliveryStatusLabel(order) {

    if (order.delivery_status) return order.delivery_status;

    const labels = {
        new: "Очікує обробки",
        processing: "Готується до відправлення",
        shipped: "Передано в доставку",
        completed: "Доставлено",
        cancelled: "Скасовано"
    };

    return labels[order.status] || "Очікує обробки";

}

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

        if (item.size) metaParts.push(`Розмір: ${item.size}`);
        if (item.color) metaParts.push(`Колір: ${item.color}`);
        if (Number(item.qty) > 1) metaParts.push(`Кількість: ${item.qty}`);

        return `
            <div class="order-item">

                <div class="order-item-image">
                    <img src="${item.image || "assets/images/no-image.png"}" alt="${item.title}" onerror="this.src='assets/images/no-image.png'">
                </div>

                <div class="order-item-info">
                    ${item.brand ? `<span class="order-item-brand">${item.brand}</span>` : ""}
                    <span class="order-item-title">${item.title}</span>
                    <span class="order-item-meta">${metaParts.join("&nbsp;&nbsp;&nbsp;")}</span>
                    ${refusalMarkup(order)}
                </div>

            </div>
        `;

    }).join("");

    const fullName = [order.last_name, order.first_name].filter(Boolean).join(" ") || "—";

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
                        <span class="order-card-date">Дата замовлення: ${date}</span>
                        <span class="order-card-chevron">⌄</span>
                    </div>

                </div>

                <div class="order-card-brief">
                    ${briefParts.join('<span class="order-card-brief-dot">·</span>')}
                </div>

            </button>

            <div class="order-card-details" hidden>

                <div class="order-detail-columns">

                    <div class="order-detail-block">
                        <h3>Контактні дані</h3>
                        <p>${fullName}</p>
                        ${order.email ? `<p>${order.email}</p>` : ""}
                        ${order.phone ? `<p>${order.phone}</p>` : ""}
                    </div>

                    <div class="order-detail-block">
                        <h3>Доставка</h3>
                        <p>${order.delivery_method || "—"}</p>
                        <p>${[order.delivery_city, order.delivery_detail].filter(Boolean).join(" ") || "—"}</p>
                        <p><strong>Статус доставки:</strong> ${escapeHtml(deliveryStatusLabel(order))}</p>
                        <p><strong>ТТН:</strong> ${
                            order.tracking_number
                                ? `<a href="https://novaposhta.ua/tracking/?cargo_number=${encodeURIComponent(order.tracking_number)}" target="_blank" rel="noopener">${escapeHtml(order.tracking_number)}</a>`
                                : "—"
                        }</p>
                        ${order.refusal_requested_at ? `
                        <p class="order-refusal-note"><strong>Відмова:</strong> запит надіслано, менеджер зв'яжеться</p>
                        ` : ""}
                    </div>

                </div>

                <div class="order-detail-block order-detail-payment">
                    <h3>Оплата</h3>
                    <p>${order.payment_method || "—"}</p>
                </div>

                <hr class="order-detail-divider">

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
// -------------------------
// Відмова від товару
//
// Раніше кнопка лише показувала напис «менеджер зв'яжеться» — нічого
// не зберігалось і нікого не сповіщало, тобто клієнту обіцяли те,
// чого не відбувалось.
//
// Тепер створюється заявка в order_refusals. Тригер у базі ставить
// позначку на замовленні й надсилає магазину повідомлення в Telegram.
// Клієнт не може змінювати саме замовлення — лише створити заявку на
// своє (див. міграцію 005).
// -------------------------

// Лист магазину про відмову.
//
// Склад листа продиктований тим, що потрібно менеджеру, щоб одразу
// зателефонувати й не шукати нічого: номер замовлення, ім'я, телефон,
// пошта, спосіб доставки й ТТН. Без ТТН неясно, чи посилка вже в
// покупця.
async function notifyRefusal(order, orderNumber) {

    if (typeof sendViaFormSubmit !== "function") return;

    const window = refusalWindow(order);

    const items = (order.items || [])
        .map(item => {

            const parts = [item.title];

            if (item.color) parts.push("колір " + item.color);
            if (item.size) parts.push("розмір " + item.size);
            if (item.qty > 1) parts.push(item.qty + " шт.");

            return "• " + parts.join(", ");

        })
        .join("\n");

    await sendViaFormSubmit({
        _subject: `Відмова від замовлення ${orderNumber}`,
        _template: "table",
        "Замовлення": orderNumber,
        "Дата замовлення": order.created_at
            ? new Date(order.created_at).toLocaleDateString("uk-UA")
            : "—",
        "Клієнт": [order.first_name, order.last_name].filter(Boolean).join(" ") || "—",
        "Телефон": order.phone || "—",
        "Пошта": order.email || "—",
        "Доставка": [order.delivery_method, order.delivery_city, order.delivery_detail]
            .filter(Boolean).join(", ") || "—",
        // deliveryStatusLabel(), а не колонка напряму: вона порожня, і
        // менеджер отримав би прочерк саме там, де важливо розуміти —
        // посилка вже в покупця чи ще їде.
        "Статус доставки": deliveryStatusLabel(order),
        // tracking_number, а не ttn: старе поле лишилось у базі, але
        // не заповнюється — і в листі ТТН був би порожнім саме тоді,
        // коли він потрібен найбільше.
        "ТТН": order.tracking_number || "—",
        // Спосіб оплати вирішує, що робити далі: при оплаті карткою
        // гроші треба повернути, при оплаті на пошті — просто
        // скасувати відправлення.
        "Оплата": order.payment_method || "—",
        // formatPrice, а не склеювання: «4359 грн» проти «4 359 грн».
        // Дрібниця, але менеджер читає це в поспіху, і розділені
        // тисячі помітно швидше сприймаються.
        "Сума": order.total ? formatPrice(order.total) : "—",
        "Товари": items || "—",
        // Скільки днів минуло — щоб менеджер бачив, чи заявка в строку.
        "Днів після доставки": window.started ? String(window.daysPassed) : "ще не доставлено"
    });

}

// Скільки днів на відмову лишилось.
//
// ЗВІДКИ 14 ДНІВ
// ---------------
// Закон України про захист прав споживачів: товар належної якості
// можна повернути протягом 14 днів. Строк рахується від ОТРИМАННЯ, а
// не від оформлення — тому за точку відліку беремо дату доставки, і
// лише якщо її немає, дату замовлення.
//
// Це не педантизм: замовлення могло чекати у відділенні тиждень, і
// рахунок від оформлення забрав би в покупця половину строку.
const REFUSAL_DAYS = 14;

function refusalWindow(order) {

    // Доставлено — рахуємо від доставки. Поки не доставлено, строк ще
    // не почався, і відмовитись можна будь-коли.
    //
    // Ознаку беремо з deliveryStatusLabel(), а не з order.delivery_status
    // напряму. Причина: цю колонку ніхто не заповнює — статус
    // виводиться з order.status. Перевірка «доставлено» по порожній
    // колонці ніколи не спрацювала б, і строк відмови не закінчувався
    // б НІКОЛИ. Та сама функція, що показує статус клієнту, — щоб
    // видиме й обчислене не розходились.

    const delivered = /доставлен/i.test(deliveryStatusLabel(order));

    if (!delivered) return { allowed: true, started: false };

    const from = order.delivered_at || order.created_at;

    if (!from) return { allowed: true, started: false };

    const days = Math.floor((Date.now() - new Date(from).getTime()) / 86400000);

    return {
        allowed: days < REFUSAL_DAYS,
        started: true,
        daysLeft: Math.max(0, REFUSAL_DAYS - days),
        daysPassed: days
    };

}

// Підпис під товаром: кнопка, залишок днів або «строк минув».
function refusalMarkup(order) {

    // Заявку вже надіслано — кнопка ні до чого.
    if (order.refusal_requested_at) {

        return `<span class="order-item-refuse-done">✓ Відмову надіслано</span>`;

    }

    const window = refusalWindow(order);

    if (!window.allowed) {

        // Кажемо ПРЯМО, що строк минув, а не просто ховаємо кнопку.
        //
        // Схована кнопка виглядає як поломка сайту: покупець пам'ятає,
        // що вона була, і починає шукати, куди зникла. Пояснення знімає
        // питання й заодно нагадує правило.
        return `<span class="order-item-refuse-expired"
                      title="Строк відмови рахується від дати доставки">
                    Строк відмови (${REFUSAL_DAYS} днів) минув
                </span>`;

    }

    // Останні дні показуємо окремо: людина може не пам'ятати, коли
    // отримала посилку.
    const hint = window.started && window.daysLeft <= 5
        ? ` <span class="order-item-refuse-left">лишилось ${window.daysLeft} дн.</span>`
        : "";

    return `<button type="button" class="order-item-refuse" data-order="${order.order_number}">
                ↩ Відмова
            </button>${hint}`;

}

async function requestRefusal(button) {

    const orderNumber = button.dataset.order;

    if (!supabaseClient || !orderNumber) {

        showToast("Не вдалося надіслати запит. Зателефонуйте нам, будь ласка");

        return;

    }

    // захист від подвійного натискання, поки летить запит
    if (button.dataset.sending === "1") return;

    button.dataset.sending = "1";

    try {

        const user = await getCurrentUser();

        if (!user) {

            showToast("Увійдіть в акаунт, щоб оформити відмову");

            return;

        }

        // Тягнемо ВСІ поля, потрібні для листа, а не лише id.
        //
        // ЩО БУЛО НЕ ТАК
        // ---------------
        // Тут стояло .select("id") — цього досить, щоб створити заявку
        // в базі. Але той самий об'єкт я передав у лист магазину, і в
        // ньому не було нічого, крім id: менеджер отримував таблицю з
        // прочерками замість імені, телефону й складу замовлення.
        //
        // Тобто лист приходив — і був марним. Гірше за відсутність
        // листа: створює відчуття, що все працює.
        const { data: order, error: orderError } = await supabaseClient
            .from("orders")
            //
            // select("*"), а не перелік полів. Перелік довелося б
            // доповнювати щоразу, коли в листі знадобиться ще щось —
            // і про це неминуче забули б, отримавши черговий прочерк.
            // Той самий select("*") робить основний список замовлень.
            .select("*")
            .eq("order_number", orderNumber)
            .maybeSingle();

        if (orderError || !order) {

            showToast("Замовлення не знайдено. Зателефонуйте нам, будь ласка");

            return;

        }

        const { error } = await supabaseClient
            .from("order_refusals")
            .insert({ order_id: order.id, user_id: user.id });

        // Лист магазину — НЕЗАЛЕЖНО від того, чи спрацював тригер у базі.
        //
        // ЧОМУ ТАК
        // ---------
        // Сповіщення в Telegram надсилає тригер у Supabase. Якщо він не
        // розгорнутий, зламався або впав ліміт — заявка тихо лягає в
        // таблицю, і магазин про неї не дізнається. Покупець при цьому
        // бачить «менеджер зв'яжеться» і чекає.
        //
        // Лист іде тим самим шляхом, що й замовлення (FormSubmit), і не
        // залежить від бази взагалі. Два незалежні канали замість
        // одного — бо ціна пропущеної відмови це не помилка в логах, а
        // людина, якій ніхто не відповів.
        //
        // Надсилаємо ДО перевірки помилки: навіть якщо запис у базу не
        // вдався, магазин мусить дізнатись про відмову.
        notifyRefusal(order, orderNumber).catch(() => {});

        if (error) {

            console.error("Заявка на відмову:", error);

            // Запис не вдався, але лист пішов — кажемо правду: заявку
            // прийнято, хоча в акаунті вона не відобразиться.
            showToast("Запит надіслано менеджеру. Він зв'яжеться з вами найближчим часом");

            button.textContent = "✓ Відмову надіслано";
            button.disabled = true;

            return;

        }

        // Показуємо результат на самій кнопці, а не тільки тостом:
        // інакше після перемальовування списку не видно, що заявку
        // вже надіслано, і клієнт тисне повторно.
        button.textContent = "✓ Відмову надіслано";
        button.disabled = true;

        showToast("Запит на відмову надіслано. Менеджер зв'яжеться з вами найближчим часом");

    } finally {

        button.dataset.sending = "";

    }

}

// делегування на список, бо картки перемальовуються динамічно
ordersListEl?.addEventListener("click", event => {

    const refuseBtn = event.target.closest(".order-item-refuse");

    if (refuseBtn) {

        requestRefusal(refuseBtn);

        return;

    }

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

    if (accountEmailEl) accountEmailEl.textContent = buildAccountGreeting(data?.first_name);

}

// -------------------------
// Пояснювальний текст під заголовком "Особистий кабінет"
// -------------------------

function buildAccountGreeting() {

    return "У особистому кабінеті ви можете переглянути історію замовлень, оновити контактні дані, керувати списком обраних товарів.";

}

profileForm?.addEventListener("submit", async event => {

    event.preventDefault();

    if (!validateFormUk(profileForm)) return;

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
        redirectTo: `${window.location.origin}/account`
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

// -------------------------
// Видалення акаунту
//
// Тут видаляємо власні дані користувача (профіль, адреси,
// обране) і завершуємо сесію — на це вистачає прав звичайного
// користувача (RLS дозволяє видаляти власні рядки). Сам обліковий
// запис у Supabase Auth лишається — щоб видалити саме його,
// потрібен виклик admin-API з service-role ключем, а це можна
// робити тільки на бекенді (Edge Function), не з клієнтського
// JS напряму. Якщо потрібна повна фізична видаленість акаунту —
// сюди варто додати виклик такої функції.
// -------------------------

const deleteAccountModal = document.getElementById("deleteAccountModal");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");
const deleteAccountYes = document.getElementById("deleteAccountYes");
const deleteAccountNo = document.getElementById("deleteAccountNo");
const deleteAccountClose = document.getElementById("deleteAccountClose");

function openDeleteAccountModal() {
    deleteAccountModal.hidden = false;
}

function closeDeleteAccountModal() {
    deleteAccountModal.hidden = true;
}

deleteAccountBtn?.addEventListener("click", openDeleteAccountModal);
deleteAccountNo?.addEventListener("click", closeDeleteAccountModal);
deleteAccountClose?.addEventListener("click", closeDeleteAccountModal);

deleteAccountModal?.addEventListener("click", event => {
    if (event.target === deleteAccountModal) closeDeleteAccountModal();
});

deleteAccountYes?.addEventListener("click", async () => {

    deleteAccountYes.disabled = true;
    deleteAccountYes.textContent = "Видаляємо...";

    const user = await getCurrentUser();

    if (!user) {
        closeDeleteAccountModal();
        return;
    }

    await supabaseClient.from("favorites").delete().eq("user_id", user.id);
    await supabaseClient.from("addresses").delete().eq("user_id", user.id);

    const { error } = await supabaseClient.from("profiles").delete().eq("id", user.id);

    deleteAccountYes.disabled = false;
    deleteAccountYes.textContent = "Так, видалити";

    if (error) {
        closeDeleteAccountModal();
        showToast("Не вдалося видалити акаунт");
        return;
    }

    closeDeleteAccountModal();

    await supabaseClient.auth.signOut();

    window.location.href = "/";

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

    if (!validateFormUk(addressForm)) return;

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

        accountEmailEl.textContent = buildAccountGreeting();

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

// -------------------------
// Помітне повідомлення зверху сторінки (під іконкою
// профілю в шапці) — використовується для важливих
// підтверджень на цій сторінці, які легко пропустити,
// якщо показувати їх звичайним тостом знизу
// -------------------------

function showTopNotice(text) {

    let notice = document.getElementById("topNotice");

    if (!notice) {

        notice = document.createElement("div");

        notice.id = "topNotice";

        notice.className = "top-notice";

        document.body.appendChild(notice);

    }

    notice.textContent = text;

    notice.classList.add("show");

    clearTimeout(window.topNoticeTimer);

    window.topNoticeTimer = setTimeout(() => {

        notice.classList.remove("show");

    }, 5000);

}
