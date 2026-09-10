// ======================================
// Панель «Покупці й підписники».
//
// ЧОГО БРАКУВАЛО
// ---------------
// Списку людей не було ніде. Хто зареєструвався в кабінеті — видно
// лише в консолі Supabase; хто підписався на листи — лише в кабінеті
// MailerLite. Щоб відповісти на «скільки в нас покупців», доводилось
// відкривати два чужих кабінети, а зіставити одне з одним було нічим.
//
// ЧОМУ ДВА СПИСКИ, А НЕ ОДИН
// ---------------------------
// Це різні люди й різні згоди. Зареєстрований дав нам обліковий
// запис — і не давав згоди на розсилку. Підписник дав саме згоду на
// листи — і може не мати кабінету. Зліпити їх в один список означало
// б рано чи пізно написати тому, хто на це не погоджувався.
//
// ЩО ТУТ НЕ РАХУЄТЬСЯ
// --------------------
// Нічого. Зведення (скільки замовлень, на яку суму) рахує функція
// одним проходом по замовленнях — сторінка лише малює. Другий
// розрахунок тут розійшовся б із панеллю замовлень.
// ======================================

(function () {

    // ⚠️ Та сама адреса, що в решті панелей адмінки. Копія навмисна:
    // адмінка не підключає скриптів сайту. Щоб копії не розійшлися,
    // їх звіряє тест.
    const SUPABASE_URL = "https://hyfodsznpeeecgtgffub.supabase.co";

    const ENDPOINT = `${SUPABASE_URL}/functions/v1/telegram-order-bot`;

    const TOKEN_HEADER = "x-admin-token";

    const el = id => document.getElementById(id);

    const gate = el("gate");
    const panel = el("panel");

    const state = {
        kind: "buyers",
        page: 1,
        search: "",
        payload: null,
    };

    function esc(value) {

        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    }

    function dateLabel(iso) {

        if (!iso) return "—";

        const date = new Date(iso);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("uk-UA", {
            day: "2-digit", month: "2-digit", year: "numeric",
        });

    }

    function money(value) {

        return `${Math.round(Number(value) || 0).toLocaleString("uk-UA")} ₴`;

    }

    function showMessage(text, kind) {

        el("listMsg").innerHTML = text
            ? `<div class="msg msg-${kind || "error"}">${esc(text)}</div>`
            : "";

    }

    // -------------------------
    // Запити
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
            headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token },
            body: JSON.stringify({ admin_action: action, ...params }),
        });

        let payload = null;

        try { payload = await response.json(); } catch (error) { /* 500 не JSON */ }

        if (response.status === 403) {
            const error = new Error((payload && payload.error) || "Немає доступу.");
            error.forbidden = true;
            throw error;
        }

        if (!response.ok || !payload || payload.ok !== true) {
            throw new Error((payload && payload.error) || `Функція відповіла ${response.status}.`);
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
        // після будь-якого await браузер вважає жест витраченим і
        // блокує спливаюче вікно.
        window.GitHubPublisher.preopenAuthWindow();

        el("gateBtn").disabled = true;

        load({ interactive: true }).finally(() => { el("gateBtn").disabled = false; });

    });

    // -------------------------
    // Малювання
    // -------------------------

    function renderStats(payload) {

        const stats = state.kind === "buyers"
            ? [
                { n: payload.total, t: "усього кабінетів" },
                { n: payload.withOrders, t: "із замовленнями" },
            ]
            : [
                { n: payload.total, t: "усього в списку" },
                { n: payload.active, t: "підписані" },
            ];

        el("stats").innerHTML = stats.map(item =>
            `<div class="stat"><div class="n">${esc(item.n)}</div>`
            + `<div class="t">${esc(item.t)}</div></div>`).join("");

    }

    function buyersTable(people) {

        return "<div class=\"table-wrap\"><table>"
            + "<tr><th>Пошта</th><th>Ім'я</th><th>Замовлень</th><th>На суму</th>"
            + "<th>Останнє</th><th>Зареєструвався</th><th>Останній вхід</th></tr>"
            + people.map(person =>
                "<tr>"
                + `<td class="email">${esc(person.email)}`
                + (person.confirmed ? "" : ' <span class="pill pill-unconfirmed">не підтвердив</span>')
                + "</td>"
                + `<td>${esc(person.name || "—")}</td>`
                + `<td>${esc(person.orders || "—")}</td>`
                + `<td>${person.spent ? esc(money(person.spent)) : "—"}</td>`
                + `<td>${esc(dateLabel(person.lastOrderAt))}</td>`
                + `<td>${esc(dateLabel(person.createdAt))}</td>`
                + `<td>${esc(dateLabel(person.lastSignInAt))}</td>`
                + "</tr>").join("")
            + "</table></div>";

    }

    function subscribersTable(people) {

        return "<div class=\"table-wrap\"><table>"
            + "<tr><th>Пошта</th><th>Стан</th><th>Підписався</th>"
            + "<th>Відкрив листів</th><th>Клацнув</th></tr>"
            + people.map(person =>
                "<tr>"
                + `<td class="email">${esc(person.email)}</td>`
                + `<td><span class="pill pill-${esc(person.status)}">${esc(person.statusLabel)}</span></td>`
                + `<td>${esc(dateLabel(person.subscribedAt || person.createdAt))}</td>`
                + `<td>${esc(person.opens)}</td>`
                + `<td>${esc(person.clicks)}</td>`
                + "</tr>").join("")
            + "</table></div>";

    }

    function renderList(payload) {

        const people = payload.people || [];

        if (!people.length) {

            el("list").innerHTML = '<div class="empty">'
                + (state.search
                    ? "За цим запитом нікого не знайшлось."
                    : state.kind === "buyers"
                        ? "Кабінетів ще ніхто не створював."
                        : "Підписників ще немає.")
                + "</div>";

            el("pager").innerHTML = "";

            return;

        }

        el("list").innerHTML = state.kind === "buyers"
            ? buyersTable(people)
            : subscribersTable(people);

        // Гортання потрібне лише коли є що гортати.
        const pages = Math.max(1, Math.ceil((payload.total || 0) / (payload.perPage || 100)));

        el("pager").innerHTML = pages > 1
            ? `<button class="btn btn-ghost btn-sm" id="prevPage"${state.page <= 1 ? " disabled" : ""}>← Назад</button>`
                + `<span>сторінка ${state.page} з ${pages}</span>`
                + `<button class="btn btn-ghost btn-sm" id="nextPage"${state.page >= pages ? " disabled" : ""}>Далі →</button>`
            : "";

    }

    el("pager").addEventListener("click", event => {

        if (event.target.id === "prevPage") { state.page = Math.max(1, state.page - 1); load(); }
        if (event.target.id === "nextPage") { state.page += 1; load(); }

    });

    el("tabs").addEventListener("click", event => {

        const tab = event.target.closest(".tab");

        if (!tab || tab.dataset.kind === state.kind) return;

        state.kind = tab.dataset.kind;
        state.page = 1;

        [...el("tabs").querySelectorAll(".tab")].forEach(item =>
            item.classList.toggle("on", item.dataset.kind === state.kind));

        load();

    });

    // Пошук без кнопки, але й без запиту на кожну літеру: чекаємо,
    // поки людина зупиниться.
    let searchTimer = 0;

    el("search").addEventListener("input", () => {

        clearTimeout(searchTimer);

        searchTimer = setTimeout(() => {
            state.search = el("search").value.trim();
            state.page = 1;
            load();
        }, 350);

    });

    el("refreshBtn").addEventListener("click", () => { showMessage(""); load(); });

    // -------------------------
    // Завантаження
    // -------------------------

    async function load(options = {}) {

        const action = state.kind === "buyers" ? "people-buyers" : "people-subscribers";

        try {

            const payload = await call(action, {
                page: state.page,
                search: state.search,
            }, options);

            state.payload = payload;

            el("boot").hidden = true;
            gate.hidden = true;
            panel.hidden = false;

            if (state.kind === "buyers") el("countBuyers").textContent = payload.total;
            else el("countSubs").textContent = payload.total;

            // Розсилку могли не під'єднати — це не помилка, і сказати
            // про це треба саме так.
            showMessage(payload.disabled || "", "info");

            renderStats(payload);
            renderList(payload);

        } catch (error) {

            if (error.needsLogin) {
                showGate("Потрібен вхід",
                    "Список бачить лише той, хто має право запису в репозиторій сайту.");
                return;
            }

            if (error.forbidden) {
                showGate("Немає доступу", error.message);
                return;
            }

            el("boot").hidden = true;
            panel.hidden = false;

            showMessage(error.message, "error");

        }

    }

    load();

}());
