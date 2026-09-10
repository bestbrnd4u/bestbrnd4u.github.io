// ======================================
// Панель «Промокоди» в адмінці.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Промокоди були списком «код → відсоток», який можна змінити лише
// запитом у SQL Editor. Через це не було найпотрібнішого:
//
//   • тимчасових кодів — таких, що самі перестають діяти в дату;
//   • кодів на певні товари — знижка йшла на весь кошик;
//   • одноразових — код розлітався по чатах і жив вічно;
//   • видимості — хто скористався, скільки лишилось.
//
// ЧОМУ НЕ ФАЙЛ В АДМІНЦІ (Decap)
// -------------------------------
// Репозиторій публічний. Файл із промокодами був би опублікований
// разом із сайтом — тобто будь-хто читав би всі коди, включно з
// персональними. Тому вони живуть у базі, а ця сторінка ходить до них
// через Edge Function, яка спершу перевіряє право запису в
// репозиторій (той самий вхід, що в панелях замовлень і відгуків).
//
// ЩО ТУТ НЕ РАХУЄТЬСЯ
// --------------------
// Стан коду («діє», «скінчився», «вичерпаний») приходить із бази
// готовим. Друга копія цього правила тут неминуче розійшлася б із
// тією, за якою знижку підтверджує тригер замовлення, — і панель
// показувала б «діє» на коді, який уже не спрацьовує.
// ======================================

(function () {

    // ⚠️ Та сама адреса, що в admin/orders.js, admin/reviews.js і
    // assets/js/supabase-client.js. Копія навмисна: адмінка не
    // підключає скриптів сайту. Щоб копії не розійшлися, їх звіряє тест.
    const SUPABASE_URL = "https://hyfodsznpeeecgtgffub.supabase.co";

    const ENDPOINT = `${SUPABASE_URL}/functions/v1/telegram-order-bot`;

    // НЕ Authorization: його на шляху до функції розбирає сам Supabase,
    // шукаючи там свій JWT.
    const TOKEN_HEADER = "x-admin-token";

    const el = id => document.getElementById(id);

    const gate = el("gate");
    const panel = el("panel");

    const state = {
        filter: "",          // порожньо = усі
        promos: [],
        counts: {},
        states: [],
        chosen: [],          // товари для форми: { id, title }
        editingHash: "",     // порожньо = створюємо новий
        products: null,      // каталог для пошуку товарів
        openUses: "",        // під яким кодом зараз розкрито список
    };

    function esc(value) {

        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    }

    function dateLabel(iso, withTime) {

        if (!iso) return "";

        const date = new Date(iso);

        if (Number.isNaN(date.getTime())) return "";

        return date.toLocaleString("uk-UA", withTime
            ? { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }
            : { day: "2-digit", month: "2-digit", year: "numeric" });

    }

    // Мить → значення для <input type="datetime-local">.
    //
    // Поле не розуміє ні ISO з Z, ні зсуву: йому потрібен МІСЦЕВИЙ час
    // без часового поясу. Через це «діє до 23:59» після повторного
    // відкриття форми ставало «21:59» — і власник, зберігши, тихо
    // скорочував строк на дві години.
    function toLocalInput(iso) {

        if (!iso) return "";

        const date = new Date(iso);

        if (Number.isNaN(date.getTime())) return "";

        const pad = n => String(n).padStart(2, "0");

        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
            + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;

    }

    function money(value) {

        return `${Math.round(Number(value) || 0).toLocaleString("uk-UA")} ₴`;

    }

    function showMessage(box, text, kind) {

        if (!text) { box.innerHTML = ""; return; }

        box.innerHTML = `<div class="msg msg-${kind === "ok" ? "ok" : "error"}">${esc(text)}</div>`;

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
            const error = new Error((payload && payload.error) || "Немає доступу до промокодів.");
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
        // після будь-якого await браузер вважає жест користувача
        // витраченим і блокує спливаюче вікно.
        window.GitHubPublisher.preopenAuthWindow();

        el("gateBtn").disabled = true;

        load({ interactive: true }).finally(() => { el("gateBtn").disabled = false; });

    });

    // -------------------------
    // Товари для форми
    // -------------------------

    // Каталог беремо з файлу сайту, а не з бази: у базі товарів немає,
    // вони живуть у репозиторії. Вантажимо один раз і лише коли форму
    // справді відкрили.
    async function products() {

        if (state.products) return state.products;

        try {

            const response = await fetch("../data/catalog.json", { cache: "no-store" });

            const rows = await response.json();

            state.products = Array.isArray(rows) ? rows : [];

        } catch (error) {

            state.products = [];

        }

        return state.products;

    }

    function renderChosen() {

        el("promoChosen").innerHTML = state.chosen.map(item =>
            `<span class="chip">${esc(item.title)}`
            + `<button type="button" data-drop="${esc(item.id)}" aria-label="Прибрати">✕</button>`
            + "</span>").join("");

    }

    el("promoChosen").addEventListener("click", event => {

        const btn = event.target.closest("[data-drop]");

        if (!btn) return;

        state.chosen = state.chosen.filter(item => String(item.id) !== btn.dataset.drop);

        renderChosen();

    });

    el("promoProductSearch").addEventListener("input", async () => {

        const query = el("promoProductSearch").value.trim().toLowerCase();

        const found = el("promoFound");

        if (query.length < 2) { found.innerHTML = ""; return; }

        const list = await products();

        // Шукаємо і за назвою, і за артикулом: у розсилці про товар
        // зазвичай пишуть артикулом.
        const matches = list.filter(item =>
            String(item.title || "").toLowerCase().includes(query)
            || String(item.article || "").toLowerCase() === query
            || String(item.id) === query).slice(0, 20);

        found.innerHTML = matches.map(item =>
            `<div class="picker-row" data-add="${esc(item.id)}" data-title="${esc(item.title)}">`
            + `<span>${esc(item.title)}</span>`
            + `<span class="muted">${esc(item.brand || "")} · ${money(item.price)}</span>`
            + "</div>").join("")
            || '<div class="picker-row muted">Нічого не знайшлось</div>';

    });

    el("promoFound").addEventListener("click", event => {

        const row = event.target.closest("[data-add]");

        if (!row) return;

        const id = Number(row.dataset.add);

        if (!state.chosen.some(item => item.id === id)) {
            state.chosen.push({ id, title: row.dataset.title });
        }

        el("promoProductSearch").value = "";
        el("promoFound").innerHTML = "";

        renderChosen();

    });

    // -------------------------
    // Форма
    // -------------------------

    function openEditor(promo) {

        state.editingHash = promo ? promo.hash : "";
        state.chosen = [];

        el("editorTitle").textContent = promo ? `Код ${promo.code}` : "Новий промокод";
        el("editorHint").textContent = promo
            ? "Код змінити не можна — створіть новий."
            : "";

        el("promoCode").value = promo ? promo.code : "";
        el("promoCode").disabled = Boolean(promo);

        el("promoPercent").value = promo ? promo.percent : "";
        el("promoStarts").value = promo ? toLocalInput(promo.startsAt) : "";
        el("promoExpires").value = promo ? toLocalInput(promo.expiresAt) : "";
        el("promoMaxUses").value = promo && promo.maxUses ? promo.maxUses : "";
        el("promoMinTotal").value = promo && promo.minTotal ? promo.minTotal : "";
        el("promoNote").value = promo ? promo.note : "";
        el("promoActive").checked = promo ? promo.active : true;

        el("promoProductSearch").value = "";
        el("promoFound").innerHTML = "";

        showMessage(el("editorMsg"), "", "ok");

        el("editor").hidden = false;

        // Назви обраних товарів — з каталогу, щоб у чіпах були слова,
        // а не номери.
        if (promo && promo.productIds.length) {

            products().then(list => {

                state.chosen = promo.productIds.map(id => {
                    const item = list.find(x => Number(x.id) === Number(id));
                    return { id: Number(id), title: item ? item.title : `Товар #${id}` };
                });

                renderChosen();

            });

        } else {

            renderChosen();

        }

        el("promoCode").focus();

    }

    el("newBtn").addEventListener("click", () => openEditor(null));

    el("cancelBtn").addEventListener("click", () => { el("editor").hidden = true; });

    el("saveBtn").addEventListener("click", async () => {

        const code = el("promoCode").value.trim().toUpperCase();

        showMessage(el("editorMsg"), "", "ok");

        el("saveBtn").disabled = true;

        try {

            await call("promo-save", {
                code,
                percent: el("promoPercent").value,
                active: el("promoActive").checked,
                starts_at: el("promoStarts").value,
                expires_at: el("promoExpires").value,
                max_uses: el("promoMaxUses").value,
                min_total: el("promoMinTotal").value,
                product_ids: state.chosen.map(item => item.id),
                note: el("promoNote").value,
            });

            el("editor").hidden = true;

            showMessage(el("listMsg"), `Код ${code} збережено.`, "ok");

            await load();

        } catch (error) {

            showMessage(el("editorMsg"), error.message, "error");

        } finally {

            el("saveBtn").disabled = false;

        }

    });

    // -------------------------
    // Список
    // -------------------------

    function renderTabs() {

        const total = state.promos.length;

        const tabs = [{ key: "", label: "Усі", count: total }]
            .concat(state.states.map(item => ({
                key: item.key,
                label: item.label,
                count: state.counts[item.key] || 0,
            })));

        el("tabs").innerHTML = tabs.map(tab =>
            `<button class="tab${tab.key === state.filter ? " on" : ""}" role="tab"`
            + ` data-filter="${esc(tab.key)}">${esc(tab.label)}`
            + `<span class="count">${tab.count}</span></button>`).join("");

    }

    el("tabs").addEventListener("click", event => {

        const tab = event.target.closest(".tab");

        if (!tab) return;

        state.filter = tab.dataset.filter;

        renderTabs();
        renderList();

    });

    function limits(promo) {

        const parts = [];

        if (promo.startsAt) parts.push(`з ${dateLabel(promo.startsAt)}`);
        if (promo.expiresAt) parts.push(`до ${dateLabel(promo.expiresAt)}`);

        if (!parts.length) parts.push("безстроковий");

        return parts.join(" ");

    }

    function promoCard(promo) {

        const uses = promo.maxUses
            ? `${promo.used} з ${promo.maxUses}`
            : `${promo.used}`;

        const products = promo.productIds.length
            ? `на ${promo.productIds.length} ${promo.productIds.length === 1 ? "товар" : "товари"}`
            : "на весь кошик";

        return `<article class="card" data-hash="${esc(promo.hash)}">`

            + '<div class="card-head">'
            + (promo.legacy
                ? `<span class="code legacy">код невідомий · ${esc(promo.hash.slice(0, 8))}…</span>`
                : `<span class="code">${esc(promo.code)}</span>`)
            + `<span class="off">−${esc(promo.percent)}%</span>`
            + `<span class="badge badge-${esc(promo.state)}">${esc(promo.stateBadge)}</span>`
            + "</div>"

            + '<div class="facts">'
            + `<span>${esc(limits(promo))}</span>`
            + `<span>використань: <b>${esc(uses)}</b></span>`
            + `<span>${esc(products)}</span>`
            + (promo.minTotal ? `<span>від <b>${esc(money(promo.minTotal))}</b></span>` : "")
            + (promo.note ? `<span>${esc(promo.note)}</span>` : "")
            + "</div>"

            + '<div class="actions">'
            + `<button class="btn btn-ghost btn-sm" data-act="toggle">`
            + (promo.active ? "Вимкнути" : "Увімкнути") + "</button>"
            + (promo.legacy
                ? ""
                : '<button class="btn btn-ghost btn-sm" data-act="edit">Змінити</button>')
            + (promo.used
                ? '<button class="btn btn-ghost btn-sm" data-act="uses">Хто скористався</button>'
                : "")
            + '<button class="btn btn-no btn-sm" data-act="delete">Видалити</button>'
            + "</div>"

            + (state.openUses === promo.hash
                ? `<div class="uses" id="uses-${esc(promo.hash)}">Завантажую…</div>`
                : "")

            + "</article>";

    }

    function renderList() {

        const list = state.filter
            ? state.promos.filter(promo => promo.state === state.filter)
            : state.promos;

        if (!list.length) {

            el("list").innerHTML = '<div class="empty">'
                + (state.promos.length
                    ? "У цьому стані кодів немає."
                    : "Кодів ще немає. Створіть перший — кнопка «Новий код» вище.")
                + "</div>";

            return;

        }

        el("list").innerHTML = list.map(promoCard).join("");

    }

    // -------------------------
    // Дії над кодом
    // -------------------------

    el("list").addEventListener("click", async event => {

        const btn = event.target.closest("[data-act]");

        if (!btn) return;

        const card = btn.closest(".card");
        const hash = card.dataset.hash;
        const promo = state.promos.find(item => item.hash === hash);

        if (!promo) return;

        if (btn.dataset.act === "edit") { openEditor(promo); return; }

        if (btn.dataset.act === "uses") {

            state.openUses = state.openUses === hash ? "" : hash;

            renderList();

            if (!state.openUses) return;

            try {

                const payload = await call("promo-uses", { code: promo.code });

                const box = el(`uses-${hash}`);

                if (!box) return;

                box.innerHTML = payload.uses.length
                    ? "<table><tr><th>Замовлення</th><th>Коли</th><th>Хто</th>"
                        + "<th>Сума</th><th>Знижка</th><th>Стан</th></tr>"
                        + payload.uses.map(use =>
                            `<tr><td>${esc(use.orderNumber)}</td>`
                            + `<td>${esc(dateLabel(use.createdAt, true))}</td>`
                            + `<td>${esc(use.customer || use.email)}</td>`
                            + `<td>${esc(money(use.total))}</td>`
                            + `<td>${esc(money(use.discount))}</td>`
                            + `<td>${esc(use.status)}</td></tr>`).join("")
                        + "</table>"
                    : '<span class="muted">Замовлень із цим кодом немає.</span>';

            } catch (error) {

                showMessage(el("listMsg"), error.message, "error");

            }

            return;

        }

        if (btn.dataset.act === "toggle") {

            // Перемикач шлемо повним збереженням: інакше довелося б
            // тримати другу дію в функції, яка вміє змінювати одне
            // поле, — а це другий шлях до тих самих даних.
            if (promo.legacy) {

                showMessage(el("listMsg"),
                    "Цей код перенесено зі старого списку — самого коду ми не знаємо, "
                    + "тож змінити його не можна. Його можна лише видалити.", "error");

                return;

            }

            btn.disabled = true;

            try {

                await call("promo-save", {
                    code: promo.code,
                    percent: promo.percent,
                    active: !promo.active,
                    starts_at: promo.startsAt || "",
                    expires_at: promo.expiresAt || "",
                    max_uses: promo.maxUses || "",
                    min_total: promo.minTotal || "",
                    product_ids: promo.productIds,
                    note: promo.note,
                });

                await load();

            } catch (error) {

                showMessage(el("listMsg"), error.message, "error");

                btn.disabled = false;

            }

            return;

        }

        if (btn.dataset.act === "delete") {

            const label = promo.legacy ? "цей старий код" : promo.code;

            if (!window.confirm(`Видалити ${label}? Замовлення, у яких він стоїть, лишаться як є.`)) {
                return;
            }

            btn.disabled = true;

            try {

                await call("promo-delete", { hash });

                showMessage(el("listMsg"), "Код видалено.", "ok");

                await load();

            } catch (error) {

                showMessage(el("listMsg"), error.message, "error");

                btn.disabled = false;

            }

        }

    });

    el("refreshBtn").addEventListener("click", () => {
        showMessage(el("listMsg"), "", "ok");
        load();
    });

    // -------------------------
    // Завантаження
    // -------------------------

    async function load(options = {}) {

        try {

            const payload = await call("promo-list", {}, options);

            state.promos = payload.promos;
            state.counts = payload.counts;
            state.states = payload.states;

            el("boot").hidden = true;
            gate.hidden = true;
            panel.hidden = false;

            renderTabs();
            renderList();

        } catch (error) {

            if (error.needsLogin) {
                showGate("Потрібен вхід",
                    "Промокоди бачить лише той, хто має право запису в репозиторій сайту.");
                return;
            }

            if (error.forbidden) {
                showGate("Немає доступу", error.message);
                return;
            }

            el("boot").hidden = true;
            panel.hidden = false;

            showMessage(el("listMsg"), error.message, "error");

        }

    }

    load();

}());
