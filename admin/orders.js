// ======================================
// Панель «Замовлення» в адмінці.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Керувати замовленнями можна було лише з Telegram: статус —
// кнопками під карткою, накладна — відповіддю боту. Далі кнопок не
// вистачало: знайти замовлення тижневої давнини = гортати чат,
// подивитись усі «Нові» = /orders із десятьма останніми, працювати з
// компʼютера = чат на телефоні.
//
// Бот лишається як був. Це другий спосіб, а не заміна: сповіщення
// про нові замовлення так само приходять у чат, а зміна статусу тут
// перемальовує там ту саму картку (див. refreshOwnerCard у функції).
//
// ЯК ЦЕ ПРАЦЮЄ
// -------------
// Замовлення в Supabase закриті RLS: гостьових (без реєстрації) з
// браузера не видно взагалі — і правильно, інакше публічний ключ
// сайту відкривав би чужі телефони й адреси. Тому сторінка не читає
// базу сама, а питає Edge Function (той самий telegram-order-bot):
// вона єдина має service-ключ.
//
// Право доступу підтверджується токеном GitHub, під яким людина вже
// зайшла в адмінку: функція питає в GitHub, чи має цей токен право
// запису в репозиторій сайту. Окремого пароля немає й не потрібно —
// хто може змінювати сайт, той може й вести замовлення.
// ======================================

(function () {

    // Адреса проєкту Supabase.
    //
    // ⚠️ Та сама, що в assets/js/supabase-client.js. Копія тут навмисна:
    // адмінка не підключає скриптів сайту, а тягнути весь клієнт
    // Supabase заради одного рядка — зайве. Щоб копії не розійшлися,
    // їх звіряє тест (tests/test-admin-orders.js).
    const SUPABASE_URL = "https://hyfodsznpeeecgtgffub.supabase.co";

    const ENDPOINT = `${SUPABASE_URL}/functions/v1/telegram-order-bot`;

    // Заголовок з доказом доступу. НЕ Authorization: його на шляху до
    // функції розбирає сам Supabase, шукаючи там свій JWT.
    const TOKEN_HEADER = "x-admin-token";

    // Кольори статусів. Підписи приходять від функції (єдине джерело
    // правди спільне з ботом), а колір — річ суто оформлення.
    const STATUS_COLORS = {
        new: "#2563eb",
        processing: "#d97706",
        shipped: "#7c3aed",
        completed: "#059669",
        cancelled: "#dc2626",
    };

    const PAGE_SIZE = 25;

    const el = (id) => document.getElementById(id);

    const gate = el("gate");
    const panel = el("panel");
    const listBox = el("list");
    const detailBox = el("detail");
    const tabsBox = el("tabs");
    const pagerBox = el("pager");
    const listMsg = el("listMsg");
    const searchInput = el("search");

    const state = {
        status: "",
        refusal: false,
        query: "",
        offset: 0,
        statuses: {},
        statusOrder: [],
        counts: {},
        total: null,
        orders: [],
        selected: null,
        refusals: [],
        busy: false,
    };

    // -------------------------
    // Дрібні helper'и
    // -------------------------

    // Дані замовлення пише клієнт: імʼя, місто, коментар. Усе це
    // потрапляє в розмітку панелі, тож екранування тут не формальність.
    function esc(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function money(value) {
        const number = Number(value);
        return Number.isFinite(number) ? `${number.toLocaleString("uk-UA")} грн` : "—";
    }

    function dateLabel(iso) {

        if (!iso) return "";

        const date = new Date(iso);

        if (Number.isNaN(date.getTime())) return "";

        return date.toLocaleString("uk-UA", {
            day: "2-digit", month: "2-digit", year: "2-digit",
            hour: "2-digit", minute: "2-digit",
        });

    }

    function customerName(order) {
        return [order.firstName, order.lastName].filter(Boolean).join(" ");
    }

    function statusColor(status) {
        return STATUS_COLORS[status] || "#6b7280";
    }

    function statusLabel(status) {
        return (state.statuses[status] && state.statuses[status].label) || status || "";
    }

    function showMessage(box, text, kind) {

        box.innerHTML = text
            ? `<div class="msg msg-${kind === "ok" ? "ok" : "error"}">${esc(text)}</div>`
            : "";

    }

    // -------------------------
    // Звернення до функції
    // -------------------------

    async function call(action, params, options = {}) {

        const token = await window.GitHubPublisher.getToken({
            interactive: Boolean(options.interactive),
        });

        if (!token) {
            const error = new Error("Потрібен вхід через GitHub.");
            error.needsLogin = true;
            throw error;
        }

        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                [TOKEN_HEADER]: token,
            },
            body: JSON.stringify({ admin_action: action, ...params }),
        });

        let payload = null;

        try {
            payload = await response.json();
        } catch (error) {
            // 500 від Supabase приходить не JSON'ом
        }

        if (response.status === 403) {
            const error = new Error((payload && payload.error) || "Немає доступу до замовлень.");
            error.forbidden = true;
            throw error;
        }

        if (!response.ok || !payload || payload.ok !== true) {

            const error = new Error(
                (payload && payload.error) || `Функція відповіла ${response.status}.`,
            );

            // 409 — статус уже змінили в іншому місці. Разом з
            // помилкою приходить свіже замовлення, щоб панель
            // показала фактичний стан, а не свій застарілий.
            if (payload && payload.order) error.order = payload.order;

            throw error;

        }

        return payload;

    }

    // -------------------------
    // Вхід
    // -------------------------

    function showGate(title, text) {

        el("gateTitle").textContent = title;
        el("gateText").textContent = text;

        el("boot").hidden = true;
        gate.hidden = false;
        panel.hidden = true;

    }

    el("gateBtn").addEventListener("click", () => {

        // Вікно входу відкриваємо СИНХРОННО, прямо в обробнику кліку:
        // після будь-якого await браузер вважає жест користувача
        // витраченим і блокує спливаюче вікно.
        window.GitHubPublisher.preopenAuthWindow();

        el("gateBtn").disabled = true;

        load({ interactive: true }).finally(() => { el("gateBtn").disabled = false; });

    });

    // -------------------------
    // Список
    // -------------------------

    function renderTabs() {

        const tabs = [{ key: "", label: "Усі" }];

        state.statusOrder.forEach((key) => {
            tabs.push({ key, label: statusLabel(key), count: state.counts[key] });
        });

        tabs.push({ key: "refusal", label: "❗ Відмови", count: state.counts.refusal });

        tabsBox.innerHTML = tabs.map((tab) => {

            const active = tab.key === "refusal" ? state.refusal : (!state.refusal && state.status === tab.key);

            const count = Number(tab.count) > 0
                ? `<span class="count">${esc(tab.count)}</span>`
                : "";

            return `<button class="tab" role="tab" type="button" data-tab="${esc(tab.key)}" ` +
                   `aria-selected="${active ? "true" : "false"}">${esc(tab.label)}${count}</button>`;

        }).join("");

    }

    function orderRow(order) {

        // Позначки — тільки про те, де потрібна дія. «Гість» і «з
        // бота» теж корисні, але вони є в картці: якби позначка стояла
        // майже на кожному рядку, вона перестала б впадати в око.
        const marks = [];

        if (order.refusalRequestedAt) marks.push('<span class="pill pill-alarm">❗ просить відмову</span>');
        if (order.status === "shipped" && !order.trackingNumber) marks.push('<span class="pill pill-warn">без ТТН</span>');

        const line = [customerName(order), order.phone].filter(Boolean).join(" · ")
            || `${order.items.length} поз.`;

        return `
            <button class="row" type="button" role="listitem" data-id="${esc(order.id)}"
                    style="--status-color:${esc(statusColor(order.status))}"
                    aria-current="${state.selected && state.selected.id === order.id ? "true" : "false"}">
                <span class="row-top">
                    <span class="row-number">${esc(order.orderNumber || order.id)}</span>
                    <span class="row-total">${esc(money(order.total))}</span>
                </span>
                <span class="row-line">${esc(line)}</span>
                <span class="row-marks">
                    <span class="pill pill-status" style="--status-color:${esc(statusColor(order.status))}">${esc(statusLabel(order.status))}</span>
                    <span class="row-date">${esc(dateLabel(order.createdAt))}</span>
                    ${marks.join("")}
                </span>
            </button>`;

    }

    function renderList() {

        if (!state.orders.length) {

            listBox.innerHTML = `<div class="empty">${
                state.query ? "За цим запитом нічого немає." : "Замовлень поки немає."
            }</div>`;

        } else {

            listBox.innerHTML = state.orders.map(orderRow).join("");

        }

        renderPager();

    }

    function renderPager() {

        const total = state.total;
        const from = state.offset + 1;
        const to = state.offset + state.orders.length;

        if (!state.orders.length) { pagerBox.innerHTML = ""; return; }

        const label = typeof total === "number"
            ? `${from}–${to} з ${total}`
            : `${from}–${to}`;

        const hasPrev = state.offset > 0;
        const hasNext = typeof total === "number" ? to < total : state.orders.length === PAGE_SIZE;

        pagerBox.innerHTML =
            `<button class="btn btn-ghost" type="button" data-page="prev" ${hasPrev ? "" : "disabled"}>← Новіші</button>` +
            `<span>${esc(label)}</span>` +
            `<button class="btn btn-ghost" type="button" data-page="next" ${hasNext ? "" : "disabled"}>Старіші →</button>`;

    }

    // -------------------------
    // Картка замовлення
    // -------------------------

    function itemRow(item) {

        const variant = [item.color, item.size].filter(Boolean).join(" / ");
        const qty = Number(item.qty) || 1;

        return `
            <div class="item">
                <span>
                    ${item.brand ? `<span class="muted">${esc(item.brand)}</span> ` : ""}${esc(item.title || "")}
                    ${variant ? `<span class="item-variant"><br>${esc(variant)}</span>` : ""}
                </span>
                <span class="item-sum">${qty} × ${esc(money(item.price))}</span>
            </div>`;

    }

    // value — вже ГОТОВА розмітка: подекуди це посилання (tel:,
    // mailto:), тож екранує викликач, а не ця функція.
    function fact(label, value) {

        if (!value) return "";

        return `<div><div class="fact-label">${esc(label)}</div><div class="fact-value">${value}</div></div>`;

    }

    function renderDetail() {

        const order = state.selected;
        const refusals = state.refusals;

        if (!order) {
            detailBox.innerHTML = '<div class="empty">Оберіть замовлення зі списку.</div>';
            return;
        }

        const buttons = (order.transitions || []).map((key) => {

            const danger = key === "cancelled" ? " btn-danger" : "";
            const ghost = key === "processing" && (order.status === "cancelled" || order.status === "completed")
                ? " btn-ghost"
                : "";

            return `<button class="btn${danger}${ghost}" type="button" data-status="${esc(key)}">` +
                   `${esc(state.statuses[key] ? state.statuses[key].emoji : "")} ${esc(statusLabel(key))}</button>`;

        }).join("");

        const refusalNote = (refusals && refusals.length)
            ? `<div class="note note-alarm">
                   <strong>Клієнт просить відмову</strong>
                   ${refusals.map((refusal) => `
                       <div>${esc(dateLabel(refusal.createdAt))} —
                       ${refusal.items.length
                           ? esc(refusal.items.map((item) => [item.title, item.color, item.size].filter(Boolean).join(" ")).join("; "))
                           : "усе замовлення"}
                       ${refusal.note ? `<br>Причина: ${esc(refusal.note)}` : ""}</div>`).join("")}
               </div>`
            : (order.refusalRequestedAt
                ? `<div class="note note-alarm"><strong>Клієнт просить відмову</strong>${esc(dateLabel(order.refusalRequestedAt))}</div>`
                : "");

        const botNote = order.fromBot
            ? ""
            : `<div class="note">Замовлення з сайту — сповіщень у Telegram клієнт не отримує.
                   Про зміну статусу й накладну повідомте телефоном.</div>`;

        detailBox.innerHTML = `
            <button class="btn btn-ghost to-list" type="button" data-back="1">← До списку</button>

            <h2>
                <span class="pill pill-status" style="--status-color:${esc(statusColor(order.status))}">${esc(statusLabel(order.status))}</span>
                ${esc(order.orderNumber || order.id)}
            </h2>
            <p class="detail-date">${esc(dateLabel(order.createdAt))}</p>

            <div id="detailMsg"></div>

            ${refusalNote}
            ${botNote}

            <div class="actions">
                ${buttons || '<span class="muted">Статус змінити нема куди.</span>'}
            </div>

            <div class="section">
                <h3>Склад замовлення</h3>
                ${order.items.length ? order.items.map(itemRow).join("") : '<span class="muted">порожньо</span>'}
            </div>

            <div class="section totals">
                <div><span>Сума товарів</span><span>${esc(money(order.subtotal))}</span></div>
                ${order.discount > 0 ? `<div><span>Знижка</span><span>−${esc(money(order.discount))}</span></div>` : ""}
                ${order.deliveryPrice > 0 ? `<div><span>Доставка</span><span>${esc(money(order.deliveryPrice))}</span></div>` : ""}
                <div class="grand"><span>Разом</span><span>${esc(money(order.total))}</span></div>
            </div>

            <div class="section">
                <h3>Клієнт</h3>
                <div class="facts">
                    ${fact("Імʼя", esc(customerName(order)) || (order.guest ? "<span class='muted'>не вказано</span>" : ""))}
                    ${fact("Телефон", order.phone ? `<a href="tel:${esc(order.phone)}">${esc(order.phone)}</a>` : "")}
                    ${fact("Пошта", order.email ? `<a href="mailto:${esc(order.email)}">${esc(order.email)}</a>` : "")}
                    ${fact("Реєстрація", order.guest ? "гість, без кабінету" : "є кабінет")}
                </div>
            </div>

            <div class="section">
                <h3>Доставка й оплата</h3>
                <div class="facts">
                    ${fact("Спосіб", esc(order.deliveryMethod))}
                    ${fact("Місто", esc(order.deliveryCity))}
                    ${fact("Відділення / адреса", esc(order.deliveryDetail))}
                    ${fact("Оплата", esc(order.paymentMethod))}
                    ${fact("Промокод", esc(order.promoCode))}
                </div>
            </div>

            <div class="section">
                <h3>Накладна</h3>
                <div class="ttn">
                    <input id="ttnInput" type="text" inputmode="numeric" autocomplete="off"
                           value="${esc(order.trackingNumber)}" placeholder="14 цифр Нової пошти"
                           aria-label="Номер накладної">
                    <button class="btn" type="button" data-ttn="save">Зберегти</button>
                    ${order.trackingNumber ? '<button class="btn btn-ghost" type="button" data-ttn="clear">Прибрати</button>' : ""}
                </div>
                ${order.trackingUrl
                    ? `<p class="muted" style="font-size:13px;margin:8px 0 0">
                           <a href="${esc(order.trackingUrl)}" target="_blank" rel="noopener">Відстежити посилку</a>
                           ${order.fromBot ? " · клієнту вже надіслано номер" : ""}
                       </p>`
                    : ""}
            </div>`;

    }

    // -------------------------
    // Завантаження
    // -------------------------

    async function load(options = {}) {

        if (state.busy) return;

        state.busy = true;

        showMessage(listMsg, "");

        if (!state.orders.length) listBox.innerHTML = '<div class="empty">Завантажую…</div>';

        try {

            const payload = await call("list", {
                status: state.refusal ? "" : state.status,
                refusal: state.refusal,
                query: state.query,
                limit: PAGE_SIZE,
                offset: state.offset,
            }, options);

            state.statuses = payload.statuses || {};
            state.statusOrder = payload.statusOrder || [];
            state.counts = payload.counts || {};
            state.total = payload.total;
            state.orders = payload.orders || [];

            el("boot").hidden = true;
            gate.hidden = true;
            panel.hidden = false;

            renderTabs();
            renderList();

            // Відкриту картку НЕ перезаписуємо рядком зі списку.
            //
            // Список тягне не всі колонки (без пошти, розбивки сум і
            // деталей доставки — вони потрібні лише в картці), тож
            // підстановка «свіжого» рядка обнулила б половину картки.
            // Позначку поточного рядка renderList ставить сам, за id.

        } catch (error) {

            if (error.needsLogin) {

                showGate(
                    "Потрібен вхід через GitHub",
                    "Замовлення показуються тим, хто має право змінювати сайт. Це той самий вхід, що й в адмінці.",
                );

            } else if (error.forbidden) {

                showGate(
                    "Немає доступу до замовлень",
                    error.message + " Попросіть власника додати вас у співавтори репозиторію (в адмінці: Меню → Доступи для колег).",
                );

            } else {

                // Мережа або сама функція. Панель показуємо все одно:
                // у ній є кнопка «Оновити», якою можна спробувати ще.
                el("boot").hidden = true;
                panel.hidden = false;
                listBox.innerHTML = "";
                showMessage(listMsg, error.message, "error");

            }

        } finally {

            state.busy = false;

        }

    }

    async function openOrder(id) {

        document.body.classList.add("detail-open");

        detailBox.innerHTML = '<div class="empty">Завантажую…</div>';

        try {

            const payload = await call("get", { id });

            state.selected = payload.order;
            state.refusals = payload.refusals || [];

            renderDetail();
            renderList();

        } catch (error) {

            detailBox.innerHTML = "";
            showMessage(detailBox, error.message, "error");

        }

    }

    // Одна дія над замовленням: змінити статус або зберегти накладну.
    // Обидві поводяться однаково — блокуємо кнопки, показуємо
    // результат у картці, підтягуємо свіжий список (зміна статусу
    // рухає й кількості у вкладках).
    async function act(action, params, okText) {

        const buttons = detailBox.querySelectorAll("button");

        buttons.forEach((button) => { button.disabled = true; });

        try {

            const payload = await call(action, { id: state.selected.id, ...params });

            state.selected = payload.order;

            renderDetail();

            showMessage(el("detailMsg"), okText, "ok");

            // Список і кількості беремо заново: те саме замовлення
            // могло вийти з поточної вкладки.
            await load();

        } catch (error) {

            // 409: статус уже змінили в Telegram. Показуємо фактичний
            // стан, а не свій застарілий.
            if (error.order) { state.selected = error.order; renderDetail(); }
            else buttons.forEach((button) => { button.disabled = false; });

            showMessage(el("detailMsg") || detailBox, error.message, "error");

        }

    }

    // -------------------------
    // Події
    // -------------------------

    tabsBox.addEventListener("click", (event) => {

        const tab = event.target.closest("[data-tab]");

        if (!tab) return;

        const key = tab.dataset.tab;

        state.refusal = key === "refusal";
        state.status = state.refusal ? "" : key;
        state.offset = 0;
        state.orders = [];

        load();

    });

    listBox.addEventListener("click", (event) => {

        const row = event.target.closest("[data-id]");

        if (row) openOrder(row.dataset.id);

    });

    detailBox.addEventListener("click", (event) => {

        if (event.target.closest("[data-back]")) {
            document.body.classList.remove("detail-open");
            return;
        }

        const statusButton = event.target.closest("[data-status]");

        if (statusButton) {

            const key = statusButton.dataset.status;

            // Скасування — єдина дія, яку важко відкликати без
            // дзвінка клієнту, тож питаємо підтвердження.
            if (key === "cancelled"
                && !confirm(`Скасувати замовлення ${state.selected.orderNumber}?`)) return;

            act("status", { status: key }, `Статус: ${statusLabel(key)}.`);

            return;

        }

        const ttnButton = event.target.closest("[data-ttn]");

        if (ttnButton) {

            if (ttnButton.dataset.ttn === "clear") {

                if (!confirm("Прибрати номер накладної?")) return;

                act("tracking", { tracking: "" }, "Накладну прибрано.");

                return;

            }

            const value = (el("ttnInput").value || "").trim();

            act("tracking", { tracking: value }, "Накладну збережено.");

        }

    });

    pagerBox.addEventListener("click", (event) => {

        const button = event.target.closest("[data-page]");

        if (!button) return;

        state.offset = button.dataset.page === "next"
            ? state.offset + PAGE_SIZE
            : Math.max(0, state.offset - PAGE_SIZE);

        state.orders = [];

        load();

    });

    el("refreshBtn").addEventListener("click", () => load());

    let searchTimer = null;

    searchInput.addEventListener("input", () => {

        clearTimeout(searchTimer);

        searchTimer = setTimeout(() => {

            state.query = searchInput.value.trim();
            state.offset = 0;
            state.orders = [];

            load();

        }, 350);

    });

    searchInput.addEventListener("keydown", (event) => {

        if (event.key !== "Enter") return;

        clearTimeout(searchTimer);

        state.query = searchInput.value.trim();
        state.offset = 0;
        state.orders = [];

        load();

    });

    // -------------------------
    // Тестова адмінка — справжні замовлення
    //
    // Адмінок дві (bestbrnd4u.com і dev.bestbrnd4u.com), а проєкт
    // Supabase один: замовлення в них ті самі. Для товарів це не
    // страшно — там різні гілки репозиторію, — а тут кнопка
    // «Скасовано» в тестовій адмінці скасує справжнє замовлення й
    // надішле клієнту справжнє сповіщення.
    //
    // Тому на тестовому домені кажемо про це прямо. Смуга середовища
    // (env-badge.js) сюди не підходить: вона говорить про гілку
    // сайту, а не про базу.
    // -------------------------

    if (/^dev\./i.test(location.hostname)) {

        const warning = document.createElement("div");

        warning.className = "note note-alarm";
        warning.innerHTML = "<strong>Це тестова адмінка, але замовлення справжні</strong>"
            + "База замовлень одна на обидві адмінки: зміна статусу тут дійде до клієнта.";

        panel.parentNode.insertBefore(warning, panel);

    }

    // -------------------------
    // Старт
    //
    // Без взаємодії: якщо токен уже лежить у localStorage (людина
    // заходила в адмінку), список відкриється сам. Якщо ні —
    // покажемо кнопку входу, бо вікно OAuth не можна відкривати без
    // натискання.
    // -------------------------

    load();

})();
