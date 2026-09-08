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

// Хто саме шле лист-подяку покупцеві.
//
// Досі це робила сторінка через EmailJS: ключі відкриті в коді, ліміт
// 200 листів на місяць, і лист залежить від того, чи не закрив покупець
// вкладку. Тепер те саме вміє Edge Function — та сама, що пише власнику
// в Telegram (docs/ЛИСТИ-ПОКУПЦЮ.md).
//
// Поки в адмінці не ввімкнули «листи надсилає сервер», лист шле
// сторінка — як робила завжди. Після вмикання перестає: інакше
// покупець отримає два однакових листи про одне замовлення.
//
// Налаштування читаємо ОБІЦЯНКОЮ, а не в фоні: якщо людина натисне
// кнопку раніше, ніж приїде файл, вибір мусить бути вже відомий.
let notificationsRequest = null;

function notificationsConfig() {

    if (!notificationsRequest) {

        notificationsRequest = fetch(dataUrl("data/notifications.json"))
            .then(response => (response.ok ? response.json() : {}))
            .catch(() => ({}));

    }

    return notificationsRequest;

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

// -------------------------
// Незавершене оформлення: щоб гостю було куди нагадати
//
// НАВІЩО
// -------
// Кошик авторизованого покупця лежить у базі, і про нього є
// нагадування (scripts/remind-carts.js). Кошик ГОСТЯ живе тільки в
// localStorage його браузера — нагадати нема куди, хоча гості
// становлять більшість замовлень.
//
// Пошта гостя вперше з'являється саме тут. Людина заповнила її й не
// натиснула кнопку — це найгарячіша втрата, яка в магазині буває.
//
// ЩО НАДСИЛАЄМО
// --------------
// Пошту й склад кошика. Ні імені, ні телефону, ні адреси доставки:
// для листа «ви не завершили замовлення» вони не потрібні.
//
// ЛИШЕ ГОСТЯМ. Для авторизованого те саме зробить нагадування про
// кошик — а два листи про один кошик гірше за жоден.
//
// КОЛИ. Коли людина ЗАКІНЧИЛА вводити пошту (blur), а не на кожну
// натиснуту літеру: інакше ми надіслали б двадцять запитів і половину
// з них — з недописаною адресою.
// -------------------------

let draftSent = "";
let draftIsGuest = null;

async function guestForDraft() {

    if (draftIsGuest !== null) return draftIsGuest;

    try {
        draftIsGuest = typeof getCurrentUser === "function" ? !(await getCurrentUser()) : true;
    } catch (error) {
        // Не змогли спитати — вважаємо гостем. Помилка тут означала б
        // мовчазну втрату можливості; повторний лист гість не отримає
        // однаково (перевірка є і в базі: abandoned_checkouts не бере
        // адрес, що є в auth.users).
        draftIsGuest = true;
    }

    return draftIsGuest;

}

async function saveCheckoutDraft() {

    const email = (document.getElementById("email")?.value || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const items = typeof getGroupedCartLines === "function" ? getGroupedCartLines() : [];

    if (!items.length) return;

    // Той самий кошик і та сама пошта — надсилати вдруге нічого.
    const mark = `${email}|${items.map(l => `${l.id}:${l.color || ""}:${l.size || ""}:${l.qty}`).join(",")}`;

    if (mark === draftSent) return;

    if (!(await guestForDraft())) return;

    if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") return;

    draftSent = mark;

    try {

        // keepalive: людина може закрити вкладку тієї ж миті — саме
        // цей випадок ми й намагаємось не втратити.
        await fetch(`${SUPABASE_URL}/functions/v1/telegram-order-bot`, {
            method: "POST",
            keepalive: true,
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
            },
            body: JSON.stringify({
                site_action: "checkout-draft",
                email,
                items: items.map(line => ({
                    product_id: line.id,
                    color: line.color || "",
                    size: line.size || "",
                    qty: line.qty
                }))
            })
        });

    } catch (error) {

        // Тиша навмисно: людина зараз оформлює замовлення, і
        // повідомлення про збій допоміжної можливості їй тільки
        // зашкодить. Наступний blur спробує ще раз.
        draftSent = "";

    }

}

document.getElementById("email")?.addEventListener("blur", saveCheckoutDraft);

// І коли сторінку залишають, не виходячи з поля.
//
// Саме цей випадок ми й намагаємось не втратити: людина дописала
// пошту й закрила вкладку. Події blur тоді може не бути зовсім.
//
// visibilitychange, а не beforeunload: на мобільних Safari й Chrome
// beforeunload при закритті вкладки не спрацьовує, а перехід у
// hidden — спрацьовує завжди. Повторний виклик нічого не коштує:
// той самий кошик і пошта вдруге не надсилаються (draftSent).
document.addEventListener("visibilitychange", () => {

    if (document.visibilityState === "hidden") saveCheckoutDraft();

});

// Склад кошика для статистики.
//
// Один помічник на дві події: begin_checkout і purchase описують той
// самий кошик, і збирати його двома різними способами означало б рано
// чи пізно отримати розбіжність у звітах.
function reportCheckout(event, detail) {

    if (!window.Analytics) return;

    // getCartLines(), а не своя збірка через findCachedProduct.
    //
    // ЧОМУ ЦЕ ВАЖЛИВО. На сторінці оформлення товари шукаються
    // findProductById() — вона дивиться в allProducts, які тут
    // завантажені. Кеш каталогу (findCachedProduct) на цій сторінці
    // порожній, тож усі рядки відпадали на filter(x => x.product) — і
    // події begin_checkout та purchase не надсилались ЗОВСІМ.
    //
    // Помітити це було майже неможливо: у звітах просто не було
    // покупок, а виглядало як «ще ніхто не замовляв».
    const lines = getCartLines();

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

// Промокоди тепер живуть у базі (supabase/migrations/014).
//
// ЧОМУ ПЕРЕЇХАЛИ. Хеш ховав сам код, але не відсоток: підмінити
// знижку в браузері це не заважало. Тепер відсоток каже база — і той
// самий список читає перевірка суми при створенні замовлення.
//
// СПИСОК НИЖЧЕ — ЗАПАСНИЙ ВАРІАНТ, а не джерело правди. Поки міграція
// не виконана (або база недоступна), промокоди працюють, як працювали
// досі. Коли 014 буде на місці всюди, цей блок можна прибрати —
// перевірка суми на сервері від нього не залежить.
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

// Скільки дає промокод: питаємо базу, а список у коді лишається
// запасним варіантом.
//
// У базу йде ХЕШ, а не сам код: так код не з'являється ні в запиті, ні
// в логах — рівно та причина, з якої він і був хешем.
async function promoPercent(hash) {

    if (typeof supabaseClient !== "undefined" && supabaseClient) {

        try {

            const { data, error } = await supabaseClient.rpc("promo_check", { p_hash: hash });

            // Немає функції (міграція ще не виконана) або база не
            // відповіла — відкочуємось на список у коді. Мовчки
            // відмовити в чинній знижці гірше, ніж дати її за старим
            // списком: суму все одно перевірить сервер.
            if (!error) return Number(data) || 0;

            console.warn("Перевірка промокоду в базі недоступна:", error.message);

        } catch (error) {

            console.warn("Перевірка промокоду в базі недоступна:", error && error.message);

        }

    }

    return PROMO_CODE_HASHES[hash] || 0;

}

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

    // Те саме, що в applySavedAddress: заповнене поле міста без ref
    // означає, що пошук відділень мовчки не працюватиме.
    const cityField = document.getElementById("city");

    if (cityField && cityField.value && window.NovaPoshta && window.NovaPoshta.useCity) {
        window.NovaPoshta.useCity(cityField.value);
    }

}

// -------------------------
// Збережені адреси доставки — підтягуємо в чекаут,
// щоб не вводити їх заново кожного разу
// -------------------------

function applySavedAddress(address) {

    document.getElementById("city").value = address.city || "";

    // Ref міста для довідника Нової пошти.
    //
    // Поле заповнене — і людина впевнена, що місто вибране. Але ref
    // ставиться лише при виборі з підказки, тож пошук відділень
    // мовчки не робив запиту взагалі: список порожній, пояснення
    // немає. Ззовні це виглядало як «не знаходить поштомат за
    // номером».
    if (address.city && window.NovaPoshta && window.NovaPoshta.useCity) {
        window.NovaPoshta.useCity(address.city);
    }

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

        allProducts = await loadCatalog();

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

    // Інший перевізник: покупець пише сам і назву пошти, і адресу —
    // довідника Укрпошти чи Meest у нас немає, а обмежувати людину
    // трьома способами Нової пошти означало б втрачати замовлення
    // там, де НП просто не працює.
    if (delivery.label === "Інша пошта") {
        return document.getElementById("otherCarrier")?.value.trim() || null;
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

    // ДОСТАВКА НЕ ВХОДИТЬ У СУМУ ЗАМОВЛЕННЯ.
    //
    // Магазин її не бере: покупець платить перевізнику при отриманні,
    // за його тарифом. Раніше сюди додавалось «від 60 грн» — тобто
    // сума в кошику була вигаданою: ні магазин цих грошей не отримував,
    // ні покупець стільки не платив (тариф залежить від ваги й
    // габаритів, які до пакування невідомі).
    const total = priceTotal - promoDiscount;

    orderSubtotalEl.textContent = formatPrice(subtotal);

    if (totalDiscount > 0) {
        orderDiscountRowEl.hidden = false;
        orderDiscountEl.textContent = "-" + formatPrice(totalDiscount);
    } else {
        orderDiscountRowEl.hidden = true;
    }

    orderDeliveryPriceEl.textContent = delivery
        ? "за тарифом перевізника"
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

    const percent = await promoPercent(hash);

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

// Поля, обов'язкові для замовлення. Перелік один на дві перевірки —
// при виході з поля й при надсиланні форми.
const REQUIRED_FIELDS = ["firstName", "lastName", "email", "phone", "city"];

// Одне поле — одне правило.
//
// ЧОМУ ОКРЕМОЮ ФУНКЦІЄЮ. Правила лежали всередині validateForm, і
// перевірка при виході з поля означала б їхню другу копію — тобто
// рано чи пізно розходження між «що сказали одразу» і «що сказали
// при надсиланні». Тепер джерело одне.
//
// Повертає true, якщо поле в порядку.
function validateField(id) {

    const field = document.getElementById(id);

    if (!field) return true;

    clearFieldError(id);

    const value = field.value.trim();

    if (!value) {
        setFieldError(id, "Обов'язкове поле.");
        return false;
    }

    if (id === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setFieldError(id, "Некоректний email.");
        return false;
    }

    if (id === "phone" && field.value.replace(/\D/g, "").length < 10) {
        setFieldError(id, "Некоректний номер телефону.");
        return false;
    }

    return true;

}

function validateForm() {

    let isValid = true;

    REQUIRED_FIELDS.forEach(id => {
        if (!validateField(id)) isValid = false;
    });

    clearFieldError("deliveryMethod");

    if (!getSelectedDelivery()) {
        setFieldError("deliveryMethod", "Оберіть спосіб доставки");
        isValid = false;
    }

    return isValid;

}

REQUIRED_FIELDS.forEach(id => {

    const field = document.getElementById(id);

    if (!field) return;

    // Помилку прибираємо, щойно людина почала виправляти: тримати
    // червоне поле, поки в ньому вже правильне значення, — це
    // сваритись на те, що вже виправлено.
    field.addEventListener("input", () => clearFieldError(id));

    // А показуємо — коли з поля пішли.
    //
    // ЧОМУ НЕ НА КОЖНУ ЛІТЕРУ. Бо тоді порожнє поле, у яке людина
    // щойно поставила курсор, одразу стає червоним, а «і@» на шляху
    // до «ірина@пошта» — «некоректним email». Сваритись на
    // недописане — найшвидший спосіб змусити закрити сторінку.
    //
    // ЧОМУ ЧІПАЄМО Й ПОРОЖНЄ, ЯКОГО НЕ ТОРКАЛИСЬ. Спершу тут стояла
    // умова «лише якщо щось уводили»: щоб прохід формою через Tab не
    // засвітив одразу п'ять червоних полів. На практиці вийшло гірше:
    // людина проминає «Прізвище», не бачить жодного знаку, що воно
    // обов'язкове, і дізнається про це аж у кінці довгої форми.
    //
    // Обов'язкове поле мусить показувати, що воно обов'язкове, —
    // саме тоді, коли його проминули.
    //
    // По батькові при цьому мовчить завжди: його немає в
    // REQUIRED_FIELDS.
    field.addEventListener("blur", () => validateField(id));

});

// -------------------------
// Формування тексту замовлення для листа
// -------------------------

// Склад замовлення для листа покупцеві — у вигляді HTML-таблиці.
//
// НАВІЩО
// -------
// Раніше в лист ішов один рядок тексту на товар: «Michael Kors —
// Сумочка …, колір: …, розмір: …, кількість: 1, ціна за од.: 8 500 грн,
// сума: 8 500 грн». Усе правда, але читати це важко: суцільний абзац
// без пробілів для ока, і немає головного — фото. Людина щойно
// вибирала річ очима, а в підтвердженні бачить опис словами.
//
// ЧОМУ ТАБЛИЦЯ, А НЕ FLEXBOX
// ---------------------------
// Пошта — не браузер. Gmail вирізає теги <style> цілком, Outlook
// рендерить через Word і не розуміє flexbox та grid. Працює надійно
// лише те, що працювало в 2005-му: таблиці й СТИЛІ ПРЯМО В АТРИБУТАХ.
// Тому тут table, а не div, і style="" на кожному елементі.
//
// ЧОМУ АДРЕСИ ФОТО АБСОЛЮТНІ
// ---------------------------
// У листі відносний шлях нема від чого відкладати: почтовик не знає
// адреси сайту й показує заглушку. absoluteUrl() уже застосовано в
// buildOrderItemsSnapshot(), тут просто беремо готове.
function buildOrderCompositionHtml() {

    const items = buildOrderItemsSnapshot();

    if (!items.length) return "";

    const rows = items.map(item => {

        const meta = [
            item.color ? `Колір: ${escapeHtml(item.color)}` : "",
            item.size ? `Розмір: ${escapeHtml(item.size)}` : ""
        ].filter(Boolean).join(" · ");

        const lineSum = (Number(item.price) || 0) * (Number(item.qty) || 1);

        // Кількість показуємо лише коли її більше однієї: «× 1» нічого
        // не додає, а рядок захаращує.
        const qtyLine = Number(item.qty) > 1
            ? `<div style="font-size:13px;color:#6b7280;margin-top:3px;">`
              + `${item.qty} × ${escapeHtml(formatPrice(item.price))}</div>`
            : "";

        return `
            <tr>
                <td width="72" valign="top" style="padding:12px 12px 12px 0;">
                    <img src="${escapeHtml(item.image || "")}" width="64" height="80"
                         alt=""
                         style="display:block;width:64px;height:80px;object-fit:cover;
                                border-radius:8px;border:1px solid #e5e7eb;background:#fff;">
                </td>
                <td valign="top" style="padding:12px 0;font-family:Arial,Helvetica,sans-serif;">
                    ${item.brand ? `<div style="font-size:11px;letter-spacing:1px;
                        text-transform:uppercase;color:#9ca3af;">${escapeHtml(item.brand)}</div>` : ""}
                    <div style="font-size:15px;font-weight:bold;color:#111827;
                                line-height:1.35;margin-top:2px;">${escapeHtml(item.title)}</div>
                    ${meta ? `<div style="font-size:13px;color:#6b7280;
                        margin-top:3px;">${meta}</div>` : ""}
                    ${qtyLine}
                </td>
                <td width="90" valign="top" align="right"
                    style="padding:12px 0;font-family:Arial,Helvetica,sans-serif;
                           font-size:15px;font-weight:bold;color:#111827;white-space:nowrap;">
                    ${escapeHtml(formatPrice(lineSum))}
                </td>
            </tr>`;

    }).join("");

    // border-collapse в атрибутах теж: Outlook інакше додає власні
    // відступи між клітинками.
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="border-collapse:collapse;width:100%;">${rows}</table>`;

}

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

    // Без доставки — див. коментар в updateTotals(). deliveryPrice
    // лишається нулем: його читають лист і рядок замовлення, і
    // «0» там означає рівно те, що є — магазин за доставку не бере.
    const deliveryPrice = 0;

    const total = Math.max(priceTotal - promoDiscount, 0);

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
        ? `${delivery.label} — оплата при отриманні`
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
        // Два варіанти складу замовлення.
        //
        // order_items_html — таблиця з фото, для {{{order_items_html}}}
        //   у шаблоні EmailJS (три дужки: інакше HTML екранується й
        //   покупець побачить теги).
        // order_items — той самий склад текстом. Лишається як запас:
        //   поки шаблон не оновлено, лист приходить як раніше, а не
        //   порожнім.
        order_items_html: buildOrderCompositionHtml(),
        order_items: buildOrderCompositionText(),
        order_subtotal: formatPrice(subtotal),
        order_discount: totalDiscount > 0 ? `-${formatPrice(totalDiscount)}` : "0 грн",
        order_delivery_price: delivery ? "за тарифом перевізника" : "—",
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
// Замовлення через функцію — там, де стоїть перевірка «ви людина».
//
// ЧОМУ НЕ ПРЯМО В БАЗУ. Токен Turnstile нічого не вартий, доки його не
// звірили з Cloudflare секретним ключем; секрет у коді сайту лежати не
// може. Тому запис іде через функцію, яка спершу звіряє токен, а вже
// потім пише службовим ключем.
//
// Повертає true, якщо замовлення збережене. false означає «спробуй
// звичайним шляхом» — і це нормальний, очікуваний варіант: перевірка
// не налаштована, функція старої версії, Cloudflare мовчить.
async function placeOrderThroughFunction(order) {

    if (!window.Turnstile || !window.Turnstile.enabled()) return false;

    const token = window.Turnstile.token();

    if (!token) return false;

    try {

        const { data, error } = await supabaseClient.functions.invoke("telegram-order-bot", {
            body: { site_action: "place-order", turnstile_token: token, order }
        });

        // Токен одноразовий: після спроби віджет треба скинути,
        // інакше повторне оформлення піде з використаним токеном.
        window.Turnstile.reset();

        if (!error && data && data.ok) return true;

        console.warn("Замовлення через функцію не пройшло:", error || data);

    } catch (failure) {

        console.warn("Функція замовлення недоступна:", failure && failure.message);

        window.Turnstile.reset();

    }

    return false;

}

// -------------------------
// Серверна конверсія Meta
//
// НАВІЩО ЩЕ ОДИН ВИКЛИК, ЯКЩО ПІКСЕЛЬ УЖЕ НАДІСЛАВ PURCHASE
// ----------------------------------------------------------
// Бо піксель доїжджає не завжди. Блокувальники вирізають
// connect.facebook.net цілком, Safari й iOS обмежують сторонні
// скрипти, а частина людей закриває вкладку швидше, ніж скрипт
// устигає надіслати. Meta ж оптимізує показ реклами саме за
// конверсіями: бачить половину покупок — навчається на половині.
//
// Тому ту саму покупку надсилає ще й сервер (Conversions API). Його
// не блокує ніщо в браузері. Дві події зводяться в одну за eventID —
// див. supabase/functions/telegram-order-bot/meta-capi.js.
//
// ЩО САМЕ ЙДЕ НА СЕРВЕР
// ----------------------
// Тільки номер замовлення, згода й куки пікселя. Ні суми, ні складу,
// ні контактів: усе це сервер бере з рядка в базі. Інакше сторонній
// запит міг би записати Meta покупку на будь-яку суму й зіпсувати
// оптимізацію реклами.
//
// ЧОМУ KEEPALIVE
// ---------------
// Одразу після цього рядка сторінка переходить на «Дякуємо», а
// браузер обриває незавершені запити при переході. keepalive — це
// прямий дозвіл запиту дожити до кінця; без нього подія губилася б
// саме тоді, коли все спрацювало.
function requestServerPurchase(orderId) {

    // Немає згоди на рекламу — немає події. Серверна подія не може
    // бути винятком: інакше магазин надсилав би в Meta дані саме тих
    // людей, які рекламу відхилили.
    if (!window.Analytics || !window.Analytics.adsAllowed()) return;

    if (!orderId) return;

    // Ключі проєкту оголошені в assets/js/supabase-client.js, який
    // підключений раніше на кожній сторінці.
    if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") return;

    const ids = window.Analytics.browserIds();

    try {

        fetch(`${SUPABASE_URL}/functions/v1/telegram-order-bot`, {
            method: "POST",
            keepalive: true,
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
            },
            body: JSON.stringify({
                site_action: "meta-purchase",
                order_number: orderId,
                consent: true,
                fbp: ids.fbp,
                fbc: ids.fbc,
                source_url: window.location.href
            })
        }).catch(() => {

            // Тиша навмисна. Незалікована конверсія — неприємно, але
            // це не має жодного стосунку до покупця: замовлення вже
            // збережене, і сторінка подяки мусить відкритись однаково.

        });

    } catch (error) {

        console.warn("Серверну конверсію не надіслано:", error && error.message);

    }

}

// Повертає true, якщо замовлення справді збережене. Від цього
// залежить, що побачить покупець, — тому «не вдалося» тут мусить бути
// відрізнимим від «зберегли».
async function saveOrderToSupabase(orderId) {

    if (!supabaseClient) return false;

    const user = await getCurrentUser();

    const { subtotal, totalDiscount, delivery, total } = computeOrderTotals();

    const order = {
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
    };

    // Якщо на сторінці стоїть перевірка «ви людина» — замовлення йде
    // через функцію, бо підтвердити токен можна тільки на сервері.
    //
    // Не вийшло (функція не оновлена, Cloudflare не відповів) —
    // зберігаємо звичайним шляхом. Втратити захист від потоку
    // неприємно; втратити замовлення — інша категорія подій. Від
    // потоку в базі лишається власна межа (міграція 015).
    if (await placeOrderThroughFunction(order)) return;

    const { error } = await supabaseClient.from("orders").insert({
        user_id: user ? user.id : null,
        ...order
    });

    if (!error) return true;

    console.warn("Не вдалося зберегти замовлення:", error);

    // У журнал помилок: інакше про це не дізнається ніхто. Замовлення,
    // яке не доїхало до бази, не побачить ні панель, ні бот — а покупець
    // при цьому вважає, що замовив.
    if (window.ErrorReport) {
        window.ErrorReport.report("js_error",
            "Замовлення не збереглось у базі: " + (error.message || error.code || "невідомо"), "");
    }

    return false;

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

    // Перевірка «ви людина» ще не пройдена. Turnstile зазвичай
    // проходить сам за секунду, тож сюди потрапляють ті, у кого вона
    // не встигла або не завантажилась.
    //
    // Не блокуємо намертво: якщо віджет узагалі не з'явився,
    // enabled() поверне false — і оформлення піде як завжди. Магазин,
    // який не продає через недоступний Cloudflare, гірший за магазин
    // без перевірки.
    if (window.Turnstile && window.Turnstile.enabled() && !window.Turnstile.token()) {

        const box = document.getElementById("turnstileBox");

        box?.scrollIntoView({ behavior: "smooth", block: "center" });

        if (typeof showToast === "function") {
            showToast("Підтвердіть, що ви не робот");
        }

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

    // 2) лист-подяка клієнту з деталями його замовлення
    const customerThankYou = notificationsConfig().then(config => {

        // Сервер уже вміє це сам — сторінка не дублює.
        if (config && config.serverEmail === true) return { skipped: true };

        if (!emailjsReady) throw new Error("EmailJS не налаштовано");

        return emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID_CUSTOMER,
            buildEmailTemplateParams(orderId, orderDate)
        );

    });

    // 3) саме замовлення — у базу. Разом із ним працюють Telegram,
    //    панель замовлень, перевірка залишків і перевірка суми.
    const orderSaved = saveOrderToSupabase(orderId);

    Promise.allSettled([ownerNotification, customerThankYou, orderSaved])
        .then(([ownerResult, customerResult, savedResult]) => {

        if (customerResult.status === "rejected") {

            console.warn("Лист клієнту не надіслано:", customerResult.reason);

            // У журнал помилок — інакше про зламану пошту дізнаються
            // від покупця, який не отримав підтвердження.
            if (window.ErrorReport) {
                window.ErrorReport.report("js_error",
                    "Лист покупцю не надіслано: " + (customerResult.reason && customerResult.reason.text
                        || customerResult.reason && customerResult.reason.message || "невідомо"), "");
            }

        }

        const saved = savedResult.status === "fulfilled" && savedResult.value === true;

        const ownerNotified = ownerResult.status === "fulfilled" && ownerResult.value.ok;

        if (!ownerNotified && window.ErrorReport) {
            window.ErrorReport.report("js_error", "Лист про замовлення не дійшов до магазину", "");
        }

        // ЗАМОВЛЕННЯ ОФОРМЛЕНЕ, ЯКЩО ВОНО ДЕСЬ Є.
        //
        // ЩО БУЛО НЕ ТАК. Успіх визначався ВИКЛЮЧНО відповіддю
        // FormSubmit — чужого безкоштовного сервісу, адреса якого
        // лежить у коді сайту. Він недоступний, змінив умови або хтось
        // вичерпав його ліміт — і магазин відповідає «не вдалося
        // надіслати замовлення», хоча база, бот і панель працюють.
        //
        // Гірше: збереження в базу стояло В ГІЛЦІ УСПІХУ. Тобто збій
        // пошти означав не «замовлення без листа», а замовлення, якого
        // не існує ніде.
        //
        // Тепер достатньо, щоб замовлення дійшло хоч одним шляхом:
        // у базу (а звідти в Telegram і в панель) або листом власнику.
        if (saved || ownerNotified) {

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

            // Товари беремо з ГОТОВОГО знімка замовлення.
            //
            // ЧОМУ НЕ СВОЯ ЗБІРКА
            // --------------------
            // Спершу я збирав список тут же: getGroupedCartLines() плюс
            // findCachedProduct(line.id). Виявилось, що на сторінці
            // оформлення товари шукаються ІНШОЮ функцією —
            // findProductById(), яка дивиться в allProducts. Кеш
            // каталогу тут не заповнений, тож findCachedProduct
            // повертала undefined: у списку стояло «Товар», «0 грн» і
            // порожні картинки.
            //
            // buildOrderItemsSnapshot() уже робить саме те, що потрібно,
            // і робить це правильно — тим самим шляхом, яким склад
            // замовлення йде в базу й у лист. Дві незалежні збірки того
            // самого списку рано чи пізно розійшлися б; тепер джерело
            // одне.
            const items = buildOrderItemsSnapshot().map(item => ({
                // id потрібен, щоб із «Дякуємо» можна було відкрити
                // сторінку товару. Раніше він тут відкидався, і фото з
                // назвою на останньому екрані замовлення були мертві:
                // покупець бачить товар, хоче перевірити колір або
                // характеристики — і не має куди натиснути.
                id: item.id,
                title: item.title,
                brand: item.brand,
                image: item.image || "",
                color: item.color || "",
                size: item.size || "",
                qty: item.qty,
                sum: (Number(item.price) || 0) * (Number(item.qty) || 1)
            }));

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

            // Та сама покупка, але надіслана сервером — щоб її не
            // з'їли блокувальники. Тільки якщо замовлення справді
            // лягло в БАЗУ: сервер шукає його там за номером, і якщо
            // дійшов лише лист власнику, шукати нічого.
            if (saved) requestServerPurchase(orderId);

            saveCart([]);

            window.location.href = "thanks";

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
