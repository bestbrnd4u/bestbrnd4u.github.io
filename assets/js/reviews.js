// ======================================
// Відгуки на сторінці товару
//
// НАВІЩО
// -------
// У 73 товарах зі 100 стоїть рейтинг, а відгуків немає ні в одного —
// тож розмітка для Google свідомо ховає aggregateRating: рейтинг без
// жодного відгуку це пряма причина ручних санкцій. Наслідок: зірок у
// пошуку немає ні в кого.
//
// І друге, важливіше за SEO. На полиці 3 000-15 000 ₴ із логотипами
// Gucci й Prada головне заперечення покупця — «чи це не підробка».
// Відгук іншого покупця відповідає на це переконливіше за будь-який
// текст магазину.
//
// ЧОМУ ФОРМА ПРОСИТЬ НОМЕР ЗАМОВЛЕННЯ
// ------------------------------------
// Форма без перевірки покупки — запрошення для конкурентів і ботів.
// Сервер звіряє три речі: замовлення існує, телефон збігається, і цей
// товар справді був у його складі (див.
// supabase/functions/telegram-order-bot/reviews.js).
//
// У браузері таку перевірку робити безглуздо: код сторінки відкритий.
// Тому таблиця відгуків закрита від браузера повністю, а пише в неї
// функція — після перевірки.
//
// ЧОМУ ВІДГУК НЕ З'ЯВЛЯЄТЬСЯ ОДРАЗУ
// ----------------------------------
// Кожен проходить модерацію: власник тисне «Показати» або «Відхилити»
// в Telegram. Відгук, який з'являється на сайті сам, рано чи пізно
// принесе або спам, або чужу лайку.
// ======================================

(function () {

    "use strict";

    // Скільки відгуків показуємо одразу. Решта — за кнопкою: сторінка
    // товару й так довга, а десять відгуків підряд відтісняють
    // характеристики за межі екрана.
    var VISIBLE = 3;

    var section = document.getElementById("productReviews");

    if (!section) return;

    var listEl = document.getElementById("reviewsList");
    var summaryEl = document.getElementById("reviewsSummary");
    var moreBtn = document.getElementById("reviewsMore");
    var formEl = document.getElementById("reviewForm");
    var errorEl = document.getElementById("reviewError");
    var doneEl = document.getElementById("reviewDone");
    var openBtn = document.getElementById("reviewOpen");
    var formBox = document.getElementById("reviewFormBox");

    function escapeHtml(value) {

        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    }

    function stars(rating) {

        var value = Math.min(Math.max(Math.round(Number(rating) || 0), 0), 5);

        return "★".repeat(value) + "☆".repeat(5 - value);

    }

    function dateLabel(iso) {

        var date = new Date(iso);

        if (!iso || isNaN(date.getTime())) return "";

        return date.toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" });

    }

    // Фото покупця під відгуком.
    //
    // НАВІЩО. Головне заперечення на полиці 3 000-15 000 ₴ із
    // логотипами брендів — «чи це не підробка». Знімок покупця
    // відповідає на це переконливіше за будь-який текст магазину, бо
    // показує саме ту річ при звичайному світлі.
    //
    // Адреси приходять із бази й ведуть у власне сховище (за цим
    // стежить і сама база — див. міграцію 024), але однаково
    // екрануємо: у розмітку вони йдуть рядком.
    //
    // loading="lazy" тут обов'язковий: галерея стоїть унизу сторінки,
    // і без нього три знімки вантажились би разом із фото товару,
    // змагаючись із ними за канал.
    function photosHtml(photos) {

        var list = Array.isArray(photos) ? photos.filter(Boolean) : [];

        if (!list.length) return "";

        return "<div class=\"review-photos\">"
            + list.map(function (url, index) {

                return "<a class=\"review-photo\" href=\"" + escapeHtml(url) + "\""
                    + " target=\"_blank\" rel=\"noopener nofollow\">"
                    + "<img src=\"" + escapeHtml(url) + "\""
                    + " alt=\"Фото покупця " + (index + 1) + "\""
                    + " loading=\"lazy\" decoding=\"async\">"
                    + "</a>";

            }).join("")
            + "</div>";

    }

    // -------------------------
    // Показ
    // -------------------------

    function render(rows) {

        if (!rows.length) {

            // Порожній блок ховаємо цілком. «Відгуків поки немає» під
            // кожним із ста товарів — це сто повідомлень про те, що
            // магазин новий.
            //
            // Але кнопку «написати відгук» лишаємо: перший відгук
            // мусить звідкись узятись.
            listEl.innerHTML = "";
            summaryEl.hidden = true;
            moreBtn.hidden = true;
            section.hidden = false;

            return;

        }

        var sum = rows.reduce(function (acc, row) { return acc + (Number(row.rating) || 0); }, 0);

        var average = Math.round((sum / rows.length) * 10) / 10;

        summaryEl.innerHTML = "<span class=\"reviews-stars\">" + stars(average) + "</span>"
            + "<b>" + average.toFixed(1) + "</b>"
            + "<span class=\"reviews-count\">" + rows.length + " "
            + (rows.length === 1 ? "відгук" : (rows.length < 5 ? "відгуки" : "відгуків")) + "</span>";

        summaryEl.hidden = false;

        listEl.innerHTML = rows.map(function (row, index) {

            return "<article class=\"review" + (index >= VISIBLE ? " review-hidden" : "") + "\">"
                + "<div class=\"review-head\">"
                + "<span class=\"reviews-stars\">" + stars(row.rating) + "</span>"
                + "<b>" + escapeHtml(row.author) + "</b>"
                + "<span class=\"review-date\">" + escapeHtml(dateLabel(row.created_at)) + "</span>"
                + "</div>"
                + "<p class=\"review-body\">" + escapeHtml(row.body) + "</p>"
                + photosHtml(row.photos)
                // Відповідь магазину. Саме вона показує, що відгуки
                // читають, — і робить це переконливіше за будь-який
                // рекламний рядок.
                + (row.reply
                    ? "<p class=\"review-reply\"><b>BestBrnd4u:</b> " + escapeHtml(row.reply) + "</p>"
                    : "")
                + "</article>";

        }).join("");

        moreBtn.hidden = rows.length <= VISIBLE;

        if (!moreBtn.hidden) {
            moreBtn.textContent = "Показати всі " + rows.length;
        }

        section.hidden = false;

    }

    moreBtn && moreBtn.addEventListener("click", function () {

        listEl.querySelectorAll(".review-hidden").forEach(function (node) {
            node.classList.remove("review-hidden");
        });

        moreBtn.hidden = true;

    });

    // -------------------------
    // Завантаження
    // -------------------------

    function productId() {

        // Той самий шлях, яким сторінка товару дізнається про себе:
        // вбудований у розмітку record (див. build-product-pages.js).
        if (window.PRODUCT_DATA && window.PRODUCT_DATA.id) return Number(window.PRODUCT_DATA.id);

        var param = new URLSearchParams(window.location.search).get("id");

        return param ? Number(param) : 0;

    }

    async function load() {

        var id = productId();

        if (!id) return;

        if (typeof supabaseClient === "undefined" || !supabaseClient) return;

        try {

            var result = await supabaseClient.rpc("product_reviews", { p_product_id: id });

            if (result.error) {

                // Міграцію ще не застосували — блок просто не
                // з'являється. Сторінка товару працює як раніше.
                console.warn("Відгуки недоступні:", result.error.message);

                return;

            }

            render(Array.isArray(result.data) ? result.data : []);

        } catch (error) {

            console.warn("Відгуки недоступні:", error && error.message);

        }

    }

    // -------------------------
    // Форма
    // -------------------------

    openBtn && openBtn.addEventListener("click", function () {

        formBox.hidden = !formBox.hidden;

        if (!formBox.hidden) {

            formBox.scrollIntoView({ behavior: "smooth", block: "nearest" });

            var first = formBox.querySelector("input, textarea");

            first && first.focus();

        }

    });

    function showError(text) {

        errorEl.textContent = text;
        errorEl.hidden = false;

    }

    // -------------------------
    // Фото до відгуку
    // -------------------------
    //
    // ЧОМУ СТИСКАЄМО В БРАУЗЕРІ. Знімок сучасного телефона важить 3-5
    // МБ. Три таких — це 15 МБ на мобільному інтернеті, тобто хвилина
    // очікування й цілком імовірний обрив. Після зменшення до 1400 px
    // і JPEG виходить 150-400 КБ — різниця в тридцять разів, а на
    // екрані під відгуком її не видно.
    //
    // ЧОМУ САМЕ 1400. Галерея показує знімок у кілька сотень пікселів,
    // а по кліку відкривається на весь екран. 1400 покриває і
    // повноекранний показ на телефоні з подвійною щільністю, і
    // збільшення пальцями.
    var PHOTO_MAX_SIDE = 1400;
    var PHOTO_MAX_COUNT = 3;
    var PHOTO_QUALITY = 0.75;

    // Межа ДО стиснення: захист від того, хто вибере 80-мегабайтний
    // файл. Читати такий у пам'ять браузера, щоб потім його
    // відкинути, — вірний спосіб покласти вкладку на слабкому
    // телефоні.
    var PHOTO_MAX_INPUT = 25 * 1024 * 1024;

    var photos = [];

    var photosInput = document.getElementById("reviewPhotos");
    var photosAddBtn = document.getElementById("reviewPhotosAdd");
    var photosPreview = document.getElementById("reviewPhotosPreview");

    function renderPhotos() {

        if (!photosPreview) return;

        photosPreview.innerHTML = photos.map(function (photo, index) {

            return "<div class=\"review-photo-item\">"
                + "<img src=\"" + photo.dataUrl + "\" alt=\"\">"
                + "<button type=\"button\" class=\"review-photo-remove\""
                + " data-index=\"" + index + "\" aria-label=\"Прибрати фото\">✕</button>"
                + "</div>";

        }).join("");

        // Кнопка зникає на третьому знімку: пояснювати «більше не
        // можна» нічим не краще, ніж не пропонувати неможливого.
        if (photosAddBtn) {
            photosAddBtn.hidden = photos.length >= PHOTO_MAX_COUNT;
        }

    }

    photosPreview && photosPreview.addEventListener("click", function (event) {

        var btn = event.target.closest(".review-photo-remove");

        if (!btn) return;

        photos.splice(Number(btn.dataset.index), 1);

        renderPhotos();

    });

    photosAddBtn && photosAddBtn.addEventListener("click", function () {
        photosInput && photosInput.click();
    });

    // Зменшення через <canvas>.
    //
    // Повертає data-URL або null, якщо файл не картинка. Саме
    // data-URL, а не Blob: відгук їде одним запитом JSON, і файл у
    // ньому мусить бути рядком.
    function shrinkPhoto(file) {

        return new Promise(function (resolve) {

            if (!file || file.size > PHOTO_MAX_INPUT) return resolve(null);

            var url = URL.createObjectURL(file);
            var image = new Image();

            image.onload = function () {

                URL.revokeObjectURL(url);

                var scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(image.width, image.height));

                var canvas = document.createElement("canvas");

                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));

                var context = canvas.getContext("2d");

                // Біле тло: у PNG із прозорістю вона стала б чорною
                // після переведення в JPEG.
                context.fillStyle = "#ffffff";
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);

                try {
                    resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
                } catch (error) {
                    resolve(null);
                }

            };

            image.onerror = function () {

                URL.revokeObjectURL(url);

                resolve(null);

            };

            image.src = url;

        });

    }

    photosInput && photosInput.addEventListener("change", async function () {

        var files = Array.from(photosInput.files || []);

        // Скидаємо одразу: інакше вибір того самого файлу вдруге не
        // дасть події change.
        photosInput.value = "";

        if (!files.length) return;

        var free = PHOTO_MAX_COUNT - photos.length;

        if (free <= 0) return;

        errorEl.hidden = true;

        photosAddBtn.disabled = true;
        photosAddBtn.textContent = "Готуємо фото...";

        var skipped = 0;

        for (var i = 0; i < files.length && photos.length < PHOTO_MAX_COUNT; i++) {

            var dataUrl = await shrinkPhoto(files[i]);

            if (dataUrl) photos.push({ dataUrl: dataUrl });
            else skipped++;

        }

        photosAddBtn.disabled = false;
        photosAddBtn.textContent = "Додати фото";

        renderPhotos();

        // Мовчки з'їдений файл виглядає як помилка сторінки.
        if (skipped) {
            showError(skipped === 1
                ? "Один файл не вдалося додати: потрібне зображення до 25 МБ."
                : skipped + " файли не вдалося додати: потрібні зображення до 25 МБ.");
        }

    });

    formEl && formEl.addEventListener("submit", async function (event) {

        event.preventDefault();

        errorEl.hidden = true;

        var order = document.getElementById("reviewOrder").value.trim();
        var phone = document.getElementById("reviewPhone").value.trim();
        var author = document.getElementById("reviewAuthor").value.trim();
        var body = document.getElementById("reviewBody").value.trim();

        var checked = formEl.querySelector("input[name=\"reviewRating\"]:checked");

        if (!checked) return showError("Поставте оцінку від 1 до 5 зірок.");

        if (!/^[0-9A-Za-z-]{4,40}$/.test(order)) {
            return showError("Номер замовлення — це 10 цифр із листа або смс.");
        }

        if (phone.replace(/\D/g, "").length < 9) {
            return showError("Вкажіть телефон, який ви залишили при оформленні.");
        }

        if (!author) return showError("Як вас підписати?");

        if (body.length < 10) return showError("Напишіть хоч кілька слів про товар.");

        var button = document.getElementById("reviewSubmit");

        button.disabled = true;
        button.textContent = "Надсилаємо...";

        try {

            if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
                throw new Error("no_client");
            }

            var response = await fetch(SUPABASE_URL + "/functions/v1/telegram-order-bot", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    apikey: SUPABASE_PUBLISHABLE_KEY,
                    Authorization: "Bearer " + SUPABASE_PUBLISHABLE_KEY
                },
                body: JSON.stringify({
                    site_action: "add-review",
                    product_id: productId(),
                    order_number: order,
                    phone: phone,
                    author: author,
                    rating: Number(checked.value),
                    body: body,
                    // Уже стиснуті: 150-400 КБ кожне замість 3-5 МБ
                    // з телефона. Сервер однаково перевірить розмір і
                    // тип — тут не захист, а економія каналу.
                    photos: photos.map(function (photo) { return photo.dataUrl; })
                })
            });

            if (response.status === 429) {
                showError("Забагато спроб. Спробуйте за годину або напишіть нам у Telegram.");
                return;
            }

            var data = await response.json();

            if (data && data.ok) {

                // Відгук лежить невідмодерованим — і про це треба
                // сказати прямо, інакше людина оновить сторінку й
                // вирішить, що відгук зник.
                formBox.hidden = true;
                doneEl.hidden = false;

                return;

            }

            // ОДНА відповідь на всі «не зійшлось»: немає замовлення, не
            // той телефон, немає цього товару в складі. Інакше форма
            // стала б способом дізнатись, що людина купувала.
            showError("Не змогли підтвердити покупку. Перевірте номер замовлення й телефон — "
                + "відгук можна залишити на товар, який ви замовляли.");

        } catch (error) {

            console.warn("Відгук не надіслано:", error && error.message);

            showError("Не вдалося надіслати відгук. Спробуйте ще раз або напишіть нам у Telegram.");

        } finally {

            button.disabled = false;
            button.textContent = "Надіслати відгук";

        }

    });

    // -------------------------
    // Номер замовлення з листа
    //
    // Лист-прохання веде сюди адресою вигляду
    //   /p/<slug>/?order=4821507392#productReviews
    // — щоб людині лишилось ввести телефон, а не переписувати десять
    // цифр. Переписувати вона й не стане.
    // -------------------------

    function prefillFromLink() {

        var fromLink = new URLSearchParams(window.location.search).get("order");

        if (!fromLink || !/^[0-9A-Za-z-]{4,40}$/.test(fromLink.trim())) return;

        var field = document.getElementById("reviewOrder");

        if (!field) return;

        field.value = fromLink.trim();

        // Форма прихована за кнопкою — розкриваємо: людина прийшла
        // саме писати відгук, і ще один клік тут зайвий.
        if (formBox) formBox.hidden = false;

        var phone = document.getElementById("reviewPhone");

        if (phone) phone.focus();

    }

    function start() {

        load();
        prefillFromLink();

    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }

}());
