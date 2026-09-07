// ======================================
// «Де моє замовлення» — перевірка за номером і телефоном
//
// НАВІЩО ЦЯ СТОРІНКА
// -------------------
// Замовити на сайті можна без реєстрації, і більшість так і робить.
// Але кабінет шукає замовлення за user_id, тобто гість не побачить
// свого замовлення НІКОЛИ. Питання «де моя посилка?» приїжджає в
// Telegram і забирає час власника на те, що сторінка може відповісти
// сама.
//
// ЧОМУ БРАУЗЕР НЕ ПИТАЄ БАЗУ НАПРЯМУ
// -----------------------------------
// Таблиця замовлень закрита політиками: гість не має права читати
// звідти нічого — і це правильно, інакше публічним ключем із коду
// сайту можна було б вивантажити всі замовлення магазину.
//
// Тому питаємо функцію. Вона читає замовлення службовим ключем,
// перевіряє телефон і віддає назад лише те, що можна показати
// (publicOrderView у supabase/functions/telegram-order-bot/
// order-lookup.js) — без пошти, без user_id, без службових полів.
// ======================================

(function () {

    const form = document.getElementById("lookupForm");

    if (!form) return;

    const orderInput = document.getElementById("lookupOrder");
    const phoneInput = document.getElementById("lookupPhone");
    const submitBtn = document.getElementById("lookupSubmit");
    const errorEl = document.getElementById("lookupError");
    const resultEl = document.getElementById("lookupResult");

    // -------------------------
    // Дрібні помічники
    // -------------------------

    function escapeHtml(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    }

    function money(value) {

        // Той самий вигляд, що на решті сайту: formatPrice живе в
        // common.js, який підключений раніше.
        if (typeof formatPrice === "function") return formatPrice(value);

        return `${Math.round(Number(value) || 0)} грн`;

    }

    function dateLabel(iso) {

        const date = new Date(iso);

        if (!iso || Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("uk-UA", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }) + ", " + date.toLocaleTimeString("uk-UA", {
            hour: "2-digit",
            minute: "2-digit"
        });

    }

    function showError(text) {

        resultEl.hidden = true;

        errorEl.textContent = text;
        errorEl.hidden = false;

    }

    function setRow(rowId, valueId, value) {

        const row = document.getElementById(rowId);
        const target = document.getElementById(valueId);

        if (!row || !target) return;

        const clean = String(value ?? "").trim();

        // Порожній рядок ховаємо цілком: «Оплата: —» не інформація,
        // а шум, який відтягує око від статусу.
        row.hidden = !clean;

        if (clean) target.textContent = clean;

    }

    // -------------------------
    // Показ замовлення
    // -------------------------

    function renderItems(items) {

        const box = document.getElementById("lookupItems");

        if (!box) return;

        if (!items || !items.length) {

            box.hidden = true;

            return;

        }

        box.innerHTML = items.map(item => {

            const details = [item.color, item.size]
                .map(part => String(part ?? "").trim())
                .filter(Boolean)
                .join(", ");

            const sum = (Number(item.price) || 0) * (Number(item.qty) || 1);

            // Фото з alt: половина людей дивиться це з телефона в
            // дорозі, і картинка може не встигнути завантажитись.
            const photo = item.image
                ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy">`
                : "";

            // Класи ТІ САМІ, що на сторінці подяки: там уже є верстка
            // рядка замовлення, і другий її варіант розійшовся б із
            // першим на першій же правці.
            return `
                <div class="order-confirm-item">
                    ${photo}
                    <div class="order-confirm-item-info">
                        ${item.brand ? `<span class="order-confirm-item-brand">${escapeHtml(item.brand)}</span>` : ""}
                        <span class="order-confirm-item-title">${escapeHtml(item.title)}</span>
                        <span class="order-confirm-item-meta">${details ? escapeHtml(details) + " · " : ""}${item.qty} шт.</span>
                    </div>
                    <span class="order-confirm-item-sum">${escapeHtml(money(sum))}</span>
                </div>
            `;

        }).join("");

        box.hidden = false;

    }

    function renderOrder(order) {

        errorEl.hidden = true;

        document.getElementById("lookupStatusLabel").textContent = order.status_label || "—";
        document.getElementById("lookupStatusNote").textContent = order.status_note || "";

        // Клас за статусом — щоб «Скасовано» не виглядало так само
        // бадьоро, як «Доставлено».
        const status = document.getElementById("lookupStatus");

        status.className = "lookup-status lookup-status-" + (order.status || "new");

        document.getElementById("lookupResultNumber").textContent = order.order_number || "—";
        document.getElementById("lookupResultDate").textContent = dateLabel(order.created_at);

        setRow("lookupDeliveryRow", "lookupResultDelivery", order.delivery);
        setRow("lookupPaymentRow", "lookupResultPayment", order.payment_method);

        renderItems(order.items);

        const discount = Number(order.discount) || 0;

        setRow("lookupDiscountRow", "lookupResultDiscount", discount > 0 ? "−" + money(discount) : "");

        document.getElementById("lookupResultTotal").textContent = money(order.total);

        // Накладна. Кнопка веде на відстеження Нової пошти — той самий
        // формат посилання, що в листі покупцеві.
        const trackingBox = document.getElementById("lookupTracking");
        const digits = String(order.tracking_number || "").replace(/\D/g, "");

        if (digits) {

            document.getElementById("lookupTrackingNumber").textContent = order.tracking_number;
            document.getElementById("lookupTrackingLink").href =
                `https://novaposhta.ua/tracking/?cargo_number=${digits}`;

            trackingBox.hidden = false;

        } else {

            trackingBox.hidden = true;

        }

        document.getElementById("lookupRefusal").hidden = !order.refusal_requested;

        resultEl.hidden = false;

        // Скролимо до результату: на телефоні картка з'являється нижче
        // згорнутої клавіатури, і люди не бачать, що щось знайшлось.
        resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });

    }

    // -------------------------
    // Запит
    // -------------------------

    // Скільки цифр має бути в телефоні. Менше — це описка, і немає
    // сенсу витрачати на неї звернення до сервера.
    const MIN_PHONE_DIGITS = 9;

    async function lookup(orderNumber, phone) {

        if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
            throw new Error("no_client");
        }

        const response = await fetch(`${SUPABASE_URL}/functions/v1/telegram-order-bot`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
            },
            body: JSON.stringify({
                site_action: "order-status",
                order_number: orderNumber,
                phone: phone
            })
        });

        // 429 — перевищена межа звернень. Це не помилка сайту, і
        // повідомлення мусить бути іншим: людина не винна, що з її
        // мережі хтось перебирав номери.
        if (response.status === 429) return { tooMany: true };

        return await response.json();

    }

    form.addEventListener("submit", async event => {

        event.preventDefault();

        const orderNumber = orderInput.value.trim();
        const phone = phoneInput.value.trim();

        if (!/^[0-9A-Za-z-]{4,40}$/.test(orderNumber)) {

            showError("Номер замовлення — це 10 цифр із листа або смс.");

            orderInput.focus();

            return;

        }

        if (phone.replace(/\D/g, "").length < MIN_PHONE_DIGITS) {

            showError("Вкажіть телефон, який ви залишили при оформленні.");

            phoneInput.focus();

            return;

        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Шукаємо...";

        errorEl.hidden = true;

        try {

            const data = await lookup(orderNumber, phone);

            if (data && data.tooMany) {

                showError("Забагато спроб. Спробуйте за годину або напишіть нам у Telegram.");

            } else if (data && data.ok && data.order) {

                renderOrder(data.order);

            } else {

                // ОДНЕ ПОВІДОМЛЕННЯ НА ДВА ВИПАДКИ — навмисно.
                //
                // Сервер не каже, чого саме не зійшлось: немає такого
                // замовлення чи не той телефон. Якби казав, сторінка
                // стала б перевіркою існування номерів — перебором
                // можна було б знайти справжні, а потім підбирати до
                // них телефони.
                showError("Замовлення з таким номером і телефоном не знайдено. "
                    + "Перевірте номер у листі — і телефон саме той, який вказували при оформленні.");

            }

        } catch (error) {

            console.warn("Перевірка замовлення не вдалася:", error && error.message);

            showError("Не вдалося перевірити замовлення. Спробуйте ще раз "
                + "або напишіть нам у Telegram — відповімо швидко.");

        } finally {

            submitBtn.disabled = false;
            submitBtn.textContent = "Перевірити";

        }

    });

    // -------------------------
    // Номер із посилання
    //
    // Лист і повідомлення бота можуть вести сюди одразу з номером:
    // /order-status?order=4821507392 — тоді людині лишається ввести
    // телефон, а не переписувати десять цифр із листа руками.
    // -------------------------

    const fromLink = new URLSearchParams(window.location.search).get("order");

    if (fromLink && /^[0-9A-Za-z-]{4,40}$/.test(fromLink.trim())) {

        orderInput.value = fromLink.trim();

        phoneInput.focus();

    }

}());
