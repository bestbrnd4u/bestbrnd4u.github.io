// ======================================
// Панель «Відгуки» в адмінці.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Модерувати відгуки можна було лише кнопками під карткою в Telegram.
// Це працює першого дня й перестає далі:
//
//   • картка поїхала вгору чату й губиться серед замовлень;
//   • подивитись усі нові = гортати чат назад;
//   • подивитись, що вже опубліковано = ніде, такого списку не було;
//   • відповісти покупцеві під відгуком = ніяк, у бота нема кнопки,
//     хоча сайт таку відповідь показує (колонка reply);
//   • передати модерацію колезі = дати доступ до свого чату з ботом.
//
// Бот лишається як був. Це другий спосіб, а не заміна: сповіщення про
// новий відгук так само приходить у чат, а рішення, ухвалене тут,
// прибирає там кнопки й дописує в картку, що вирішили (див.
// refreshReviewCard у функції).
//
// ЯК ЦЕ ПРАЦЮЄ
// -------------
// Відгуки в Supabase закриті RLS без політик — із браузера не видно
// НІЧОГО, зокрема невідмодерованого. І правильно: інакше публічним
// ключем сайту можна було б вивантажити чужі чернетки. Тому сторінка
// не читає базу сама, а питає Edge Function: вона єдина має
// service-ключ.
//
// Право доступу підтверджується токеном GitHub, під яким людина вже
// зайшла в адмінку — той самий підхід, що в панелі замовлень.
// ======================================

(function () {

    // Адреса проєкту Supabase.
    //
    // ⚠️ Та сама, що в admin/orders.js і в assets/js/supabase-client.js.
    // Копія тут навмисна: адмінка не підключає скриптів сайту. Щоб
    // копії не розійшлися, їх звіряє тест.
    const SUPABASE_URL = "https://hyfodsznpeeecgtgffub.supabase.co";

    const ENDPOINT = `${SUPABASE_URL}/functions/v1/telegram-order-bot`;

    // Заголовок з доказом доступу. НЕ Authorization: його на шляху до
    // функції розбирає сам Supabase, шукаючи там свій JWT.
    const TOKEN_HEADER = "x-admin-token";

    const PER_PAGE = 25;

    const el = id => document.getElementById(id);

    const gate = el("gate");
    const panel = el("panel");

    // Поточний стан списку.
    const state = {
        status: "new",
        offset: 0,
        total: null,
        counts: {},
        statuses: [],
        titles: {},
        reviews: [],
    };

    function esc(value) {

        return String(value === undefined || value === null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    }

    function dateLabel(iso) {

        if (!iso) return "";

        const date = new Date(iso);

        if (Number.isNaN(date.getTime())) return "";

        return date.toLocaleString("uk-UA", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

    }

    function stars(rating) {

        const n = Math.max(0, Math.min(5, Math.trunc(Number(rating) || 0)));

        return "★".repeat(n) + "☆".repeat(5 - n);

    }

    function showMessage(box, text, kind) {

        if (!text) {
            box.innerHTML = "";
            return;
        }

        box.innerHTML = `<div class="msg msg-${kind === "ok" ? "ok" : "error"}">${esc(text)}</div>`;

    }

    // -------------------------
    // Запит до функції
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
            const error = new Error((payload && payload.error) || "Немає доступу до відгуків.");
            error.forbidden = true;
            throw error;
        }

        if (!response.ok || !payload || payload.ok !== true) {

            const error = new Error(
                (payload && payload.error) || `Функція відповіла ${response.status}.`,
            );

            // 409 — рішення вже ухвалили в Telegram. Разом із помилкою
            // приходить свіжий відгук, щоб панель показала фактичний
            // стан, а не свій застарілий.
            if (payload && payload.review) error.review = payload.review;

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
    // Вкладки
    // -------------------------

    function renderTabs() {

        const tabs = el("tabs");

        tabs.innerHTML = state.statuses.map(tab => {

            const count = state.counts[tab.key];

            return `<button class="tab${tab.key === state.status ? " on" : ""}"`
                + ` role="tab" data-status="${esc(tab.key)}">`
                + esc(tab.label)
                + (typeof count === "number" ? `<span class="count">${count}</span>` : "")
                + "</button>";

        }).join("");

        tabs.querySelectorAll(".tab").forEach(button => {

            button.addEventListener("click", () => {

                if (button.dataset.status === state.status) return;

                state.status = button.dataset.status;
                state.offset = 0;

                load();

            });

        });

    }

    // -------------------------
    // Список
    // -------------------------

    // Адреса сторінки товару. У відгуку лежить лише product_id, тож
    // ведемо на каталог із фільтром — так само, як це робить лист із
    // проханням написати відгук, коли slug невідомий.
    function productHref(review) {

        return review.productId
            ? `../product?id=${encodeURIComponent(review.productId)}`
            : "";

    }

    // Фото покупця — прямо в картці модерації.
    //
    // Без них рішення довелось би ухвалювати наосліп, а знімок і буває
    // причиною відхилити: чуже фото з інтернету, випадкове селфі,
    // видно квартиру.
    //
    // Відкриваються в новій вкладці на повний розмір: у мініатюрі 96
    // px не видно ні різкості, ні того, що саме там у кутку.
    function reviewPhotos(review) {

        const list = Array.isArray(review.photos) ? review.photos.filter(Boolean) : [];

        if (!list.length) return "";

        return '<div class="shots">'
            + list.map((url, index) =>
                `<a class="shot" href="${esc(url)}" target="_blank" rel="noopener">`
                + `<img src="${esc(url)}" alt="Фото ${index + 1}" loading="lazy">`
                + "</a>").join("")
            + "</div>";

    }

    function reviewCard(review) {

        const title = state.titles[String(review.productId)] || "";

        const href = productHref(review);

        const decided = review.moderatedAt
            ? `${review.moderatedBy === "telegram" ? "у Telegram" : "в адмінці"}, ${dateLabel(review.moderatedAt)}`
            : "";

        return `<article class="card" role="listitem" data-id="${esc(review.id)}">`

            + '<div class="card-head">'
            + `<span class="stars" aria-label="Оцінка ${review.rating} з 5">${stars(review.rating)}</span>`
            + `<span class="who">${esc(review.author)}</span>`
            + `<span class="badge badge-${esc(review.status)}">${esc(review.statusBadge || review.statusLabel)}</span>`
            + `<span class="when">${esc(dateLabel(review.createdAt))}</span>`
            + "</div>"

            + (title
                ? (href
                    ? `<a class="what" href="${esc(href)}" target="_blank" rel="noopener">${esc(title)}</a>`
                    : `<span class="what">${esc(title)}</span>`)
                : `<span class="what">Товар #${esc(review.productId)}</span>`)

            + `<p class="body">${esc(review.body)}</p>`

            + reviewPhotos(review)

            + '<div class="meta">'
            // Номер замовлення не для краси: якщо відгук виглядає
            // дивно, за ним можна подивитись саму покупку.
            + `<span>замовлення <code>${esc(review.orderNumber)}</code></span>`
            + (decided ? `<span>рішення ${esc(decided)}</span>` : "")
            + "</div>"

            + '<div class="actions">'
            + (review.status === "new"
                ? '<button class="btn btn-ok btn-sm" data-act="published">✅ Показати на сайті</button>'
                    + '<button class="btn btn-no btn-sm" data-act="rejected">🚫 Відхилити</button>'
                : "")
            + "</div>"

            // Відповідь магазину показується під відгуком на сторінці
            // товару. Доступна не лише для опублікованих: відповідь
            // можна написати заздалегідь і опублікувати разом.
            + '<div class="reply">'
            + `<label for="reply-${esc(review.id)}">Відповідь магазину (видно під відгуком)</label>`
            + `<textarea id="reply-${esc(review.id)}" maxlength="1000"`
            + ' placeholder="Дякуємо за відгук! …">' + esc(review.reply) + "</textarea>"
            + '<div class="reply-row">'
            + '<button class="btn btn-ghost btn-sm" data-act="reply">Зберегти відповідь</button>'
            + '<span class="reply-hint">Порожнє поле прибирає відповідь.</span>'
            + "</div>"
            + "</div>"

            + "</article>";

    }

    function renderList() {

        const list = el("list");

        if (!state.reviews.length) {

            list.innerHTML = '<div class="empty">'
                + (state.status === "new"
                    ? "Нових відгуків немає — усе відмодеровано."
                    : "Тут поки порожньо.")
                + "</div>";

            return;

        }

        list.innerHTML = state.reviews.map(reviewCard).join("");

        list.querySelectorAll("[data-act]").forEach(button => {

            button.addEventListener("click", () => {

                const card = button.closest(".card");
                const id = card && card.dataset.id;

                if (!id) return;

                if (button.dataset.act === "reply") {

                    const field = card.querySelector("textarea");

                    act("review-reply", { id, reply: field ? field.value : "" },
                        "Відповідь збережено.", button);

                    return;

                }

                act("review-status", { id, status: button.dataset.act },
                    button.dataset.act === "published"
                        ? "Відгук показано на сайті."
                        : "Відгук відхилено.",
                    button);

            });

        });

    }

    function renderPager() {

        const pager = el("pager");

        if (state.total === null) {
            pager.innerHTML = "";
            return;
        }

        const from = state.total ? state.offset + 1 : 0;
        const to = Math.min(state.offset + PER_PAGE, state.total);

        pager.innerHTML =
            `<button class="btn btn-ghost btn-sm" id="prev"${state.offset ? "" : " disabled"}>←</button>`
            + `<span>${from}–${to} з ${state.total}</span>`
            + `<button class="btn btn-ghost btn-sm" id="next"${to >= state.total ? " disabled" : ""}>→</button>`;

        const prev = el("prev");
        const next = el("next");

        if (prev) prev.addEventListener("click", () => {
            state.offset = Math.max(0, state.offset - PER_PAGE);
            load();
        });

        if (next) next.addEventListener("click", () => {
            state.offset += PER_PAGE;
            load();
        });

    }

    // -------------------------
    // Завантаження й дії
    // -------------------------

    async function load(options = {}) {

        try {

            const payload = await call("reviews-list", {
                status: state.status,
                limit: PER_PAGE,
                offset: state.offset,
            }, options);

            state.reviews = payload.reviews || [];
            state.total = typeof payload.total === "number" ? payload.total : null;
            state.counts = payload.counts || {};
            state.statuses = payload.statuses || [];
            state.titles = payload.titles || {};

            el("boot").hidden = true;
            gate.hidden = true;
            panel.hidden = false;

            renderTabs();
            renderList();
            renderPager();

        } catch (error) {

            if (error.needsLogin) {

                showGate("Потрібен вхід через GitHub",
                    "Відгуки показуються тим, хто має право змінювати сайт. Це той самий"
                    + " вхід, що й в адмінці, — окремого пароля немає.");

                return;

            }

            if (error.forbidden) {

                showGate("Немає доступу",
                    error.message + " Попросіть власника додати вас у співавтори репозиторію.");

                return;

            }

            el("boot").hidden = true;
            panel.hidden = false;

            showMessage(el("listMsg"), error.message, "error");

        }

    }

    async function act(action, params, okText, button) {

        const buttons = button && button.closest(".card")
            ? [...button.closest(".card").querySelectorAll("button")]
            : [];

        buttons.forEach(item => { item.disabled = true; });

        try {

            await call(action, params);

            showMessage(el("listMsg"), okText, "ok");

            // Перечитуємо список: рішення міняє і кількості у вкладках,
            // і склад поточної вкладки (відмодерований відгук із «Нових»
            // зникає).
            await load();

        } catch (error) {

            showMessage(el("listMsg"), error.message, "error");

            // 409 приходить зі свіжим станом відгуку — перечитуємо, щоб
            // панель показала фактичне, а не своє застаріле.
            if (error.review) await load();
            else buttons.forEach(item => { item.disabled = false; });

        }

    }

    el("refreshBtn").addEventListener("click", () => {
        showMessage(el("listMsg"), "", "ok");
        load();
    });

    load();

}());
