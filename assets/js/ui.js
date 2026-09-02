// ======================================
// ui.js
// Загальні UI-компоненти магазину
// ======================================

function formatPrice(price) {
    return new Intl.NumberFormat("uk-UA").format(price) + "\u00A0грн";
}

// -------------------------
// Карусель для "Популярні товари" / "Схожі товари"
//
// Викликати ПІСЛЯ того, як картки вже вставлені в
// .carousel-track (innerHTML) — інакше нема що виміряти.
// Однакова логіка для будь-якого блоку такого вигляду:
// <div class="carousel">
//   <button class="carousel-arrow carousel-prev">...
//   <div class="carousel-track">...картки...</div>
//   <button class="carousel-arrow carousel-next">...
// </div>
// -------------------------

function initCarousel(carouselEl) {

    if (!carouselEl) return;

    const track = carouselEl.querySelector(".carousel-track");
    const prevBtn = carouselEl.querySelector(".carousel-prev");
    const nextBtn = carouselEl.querySelector(".carousel-next");

    if (!track || !prevBtn || !nextBtn) return;

    function getStep() {

        const card = track.querySelector(".product-card");

        if (!card) return track.clientWidth;

        const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 24;

        return card.getBoundingClientRect().width + gap;

    }

    function updateArrows() {

        const maxScroll = track.scrollWidth - track.clientWidth - 2;

        const hasOverflow = track.scrollWidth > track.clientWidth + 2;

        // якщо картки й так усі влазять (наприклад, у віджеті
        // лишився один товар) — гортати нема куди, тож стрілки
        // не просто дизейблимо, а прибираємо зовсім
        prevBtn.style.display = hasOverflow ? "" : "none";
        nextBtn.style.display = hasOverflow ? "" : "none";

        // поріг "ми на самому початку/кінці" зроблений з запасом
        // (не строго 0/maxScroll) — після інерційного свайпу чи
        // scroll-snap браузер іноді лишає scrollLeft у стані на
        // кілька пікселів вбік (напр. 4px), і з надто суворим
        // порогом стрілка "Попередні" лишалася активною навіть
        // на першому товарі
        prevBtn.disabled = !hasOverflow || track.scrollLeft <= 8;
        nextBtn.disabled = !hasOverflow || track.scrollLeft >= maxScroll - 6;

    }

    let settleTimer = null;

    function onScroll() {

        updateArrows();

        // на iOS фінальна корекція скролу (доводка до
        // найближчої картки через scroll-snap після інерції
        // свайпу) не завжди супроводжується ще одним "scroll"
        // подією рівно в кінцевій позиції — тому додатково
        // перевіряємо стан ще раз, коли скрол справді зупинився
        clearTimeout(settleTimer);
        settleTimer = setTimeout(updateArrows, 120);

    }

    prevBtn.addEventListener("click", () => {

        if (prevBtn.disabled) return;

        const step = getStep();
        let target = track.scrollLeft - step;

        // якщо до самого початку залишається менше кроку —
        // доскролюємо рівно до 0, щоб не "застрягти" через
        // дробові пікселі і не лишити стрілку активною
        if (target < step / 2) target = 0;

        prevBtn.disabled = target <= 0;
        nextBtn.disabled = false;

        track.scrollTo({ left: target, behavior: "smooth" });

    });

    nextBtn.addEventListener("click", () => {

        if (nextBtn.disabled) return;

        const step = getStep();
        const maxScroll = track.scrollWidth - track.clientWidth;
        let target = track.scrollLeft + step;

        // так само на кінці — доскролюємо рівно до останньої картки
        if (target > maxScroll - step / 2) target = maxScroll;

        nextBtn.disabled = target >= maxScroll;
        prevBtn.disabled = false;

        track.scrollTo({ left: target, behavior: "smooth" });

    });

    track.addEventListener("scroll", onScroll, { passive: true });

    window.addEventListener("resize", updateArrows);

    // даємо браузеру один кадр, щоб порахувати реальні розміри
    // щойно вставлених карток
    requestAnimationFrame(updateArrows);

}

// -------------------------
// Карусель фото на картці товару (каталог/подборки) —
// scroll-snap трек + крапки-індикатори. Стрілки та крапки
// обробляються делегуванням в common.js (щоб не навішувати
// обробники повторно при перебудові треку через зміну кольору),
// тут лише синхронізуємо активну крапку зі скролом і гасимо
// клік по картці одразу після свайпу.
// -------------------------

function bindProductCarousel(track) {

    if (!track || track.dataset.carouselBound) return;

    track.dataset.carouselBound = "1";

    const carousel = track.closest(".product-carousel");

    function syncNav() {

        const total = track.children.length;

        const index = Math.round(track.scrollLeft / (track.clientWidth || 1));

        const prevBtn = carousel?.querySelector(".photo-nav-prev");
        const nextBtn = carousel?.querySelector(".photo-nav-next");

        if (prevBtn) prevBtn.disabled = index <= 0;
        if (nextBtn) nextBtn.disabled = index >= total - 1;

    }

    function syncDots() {

        const dots = carousel?.querySelectorAll(".photo-dot");

        const index = Math.round(track.scrollLeft / (track.clientWidth || 1));

        if (dots && dots.length) {
            dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
        }

        // якщо серед слайдів є відео — програємо його лише тоді,
        // коли користувач долистав саме до цього слайду каруселі
        // (а не коли картка просто зʼявилась на екрані); на всіх
        // інших слайдах відео ставимо на паузу
        Array.from(track.children).forEach((slide, i) => {

            if (slide.tagName !== "VIDEO") return;

            if (i === index) {

                // slide.paused означає, що це саме повернення до
                // відео (щойно долистали), а не повторний виклик
                // syncDots() поки воно вже й так грає — інакше відео
                // почало б стрибати на початок просто під час перегляду.
                // Без цього скидання відео після паузи продовжувало б
                // йти з того місця, де його залишили минулого разу,
                // замість того щоб почати спочатку
                if (slide.paused) slide.currentTime = 0;

                slide.play().catch(() => {});

            } else {
                slide.pause();
            }

        });

        syncNav();

    }

    let scrollTimer = null;

    // одразу виставляємо правильний стан стрілок (перше фото —
    // "назад" вимкнена), а не тільки після першого скролу
    syncDots();

    track.addEventListener("scroll", () => {

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(syncDots, 80);

    }, { passive: true });

    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startTime = 0;
    let axis = null; // null поки не визначено, "x" або "y"
    let isSwiping = false;

    track.addEventListener("touchstart", event => {

        startX = event.touches[0].clientX;
        startY = event.touches[0].clientY;
        startScrollLeft = track.scrollLeft;
        startTime = Date.now();
        axis = null;
        isSwiping = false;

    }, { passive: true });

    // touchmove НЕ пасивний навмисно — інакше не можна буде
    // викликати preventDefault() лише для горизонтального жесту
    track.addEventListener("touchmove", event => {

        const dx = event.touches[0].clientX - startX;
        const dy = event.touches[0].clientY - startY;

        if (axis === null) {

            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;

            axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";

            // на час горизонтального свайпу вимикаємо CSS
            // scroll-snap — інакше браузер намагається
            // "підтягнути" позицію до найближчого фото на
            // кожному touchmove, і замість плавного руху за
            // пальцем виходить залипання з різким стрибком
            if (axis === "x") track.style.scrollSnapType = "none";

        }

        if (axis === "y") return; // вертикаль — віддаємо жест сторінці, нічого не робимо

        // горизонталь — гортаємо фото самі, забороняючи
        // браузеру одночасно намагатись скролити сторінку
        event.preventDefault();

        isSwiping = true;

        track.scrollLeft = startScrollLeft - dx;

    }, { passive: false });

    track.addEventListener("touchend", () => {

        if (axis !== "x") return;

        const width = track.clientWidth || 1;
        const baseIndex = Math.round(startScrollLeft / width);

        const dx = track.scrollLeft - startScrollLeft;
        const elapsed = Math.max(Date.now() - startTime, 1);
        const velocity = Math.abs(dx) / elapsed;

        const distanceThreshold = width * 0.12;
        const velocityThreshold = 0.3;

        let index = baseIndex;

        if (Math.abs(dx) > distanceThreshold || velocity > velocityThreshold) {
            index = baseIndex + (dx > 0 ? 1 : -1);
        }

        index = Math.max(0, Math.min(index, track.children.length - 1));

        track.scrollTo({ left: index * width, behavior: "smooth" });

        // повертаємо snap назад вже після того, як доїхали —
        // невелика затримка під тривалість smooth-скролу
        setTimeout(() => { track.style.scrollSnapType = ""; }, 400);

    });

    track.addEventListener("touchcancel", () => {

        track.style.scrollSnapType = "";

    });

    // якщо це був свайп, а не тап — гасимо клік, щоб картка
    // не перекинула на сторінку товару одразу після гортання фото
    track.addEventListener("click", event => {

        if (isSwiping) {
            event.preventDefault();
            event.stopPropagation();
        }

    });

}

function initProductCarousels(root) {

    (root || document).querySelectorAll(".photo-track").forEach(bindProductCarousel);

}

// -------------------------
// Захист від "захоплення" колеса миші горизонтальною
// каруссю (scroll-snap-type:x). Без цього, навівши мишку на
// фото і покрутивши колесо (звичний вертикальний скрол
// сторінки), браузer іноді трактує це як команду "гортати
// слайди" — сторінка при цьому не скролиться. Тут ми самі
// вирішуємо: вертикальний жест — завжди скрол сторінки,
// горизонтальний (трекпад-свайп) — гортання каруселі.
// -------------------------

// Підпис кольору під назвою в картці.
//
// Джерела за спаданням певності:
//   1. cardColor — картка розгорнута по кольору, це рівно той колір,
//      фото якого показане;
//   2. колір активного (першого) варіанта — товар з одним кольором;
//   3. поле color самого товару — старі записи без variants.
//
// «Основний» відсіюємо: це заглушка з fallback-варіанта нижче, а не
// назва кольору.
function cardColorLabel(product, variants) {

    const name = product.cardColor
        || variants?.[0]?.color
        || product.color
        || "";

    if (!name || name === "Основний") return "";

    return `<div class="product-color-name">${escapeHtml(name)}</div>`;

}

function createProductCard(product) {

    const badge = product.badge
        ? `<div class="badge">${product.badge}</div>`
        : "";

    const variants = product.variants?.length
        ? product.variants
        : [{ color: product.color || "Основний", hex: "#999", images: product.images || [] }];

    const images = variants[0].images?.length
        ? variants[0].images
        : (product.images?.length ? product.images : ["assets/images/no-image.png"]);

    // відео беремо з активного (першого) варіанту кольору —
    // саме його фото/колір показані на картці за замовчуванням
    const video = variants[0].video || "";

    const brand = product.brand || "Без бренду";

    const oldPrice = product.oldPrice
        ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>`
        : "";

    const discount = product.oldPrice
        ? Math.round((1 - product.price / product.oldPrice) * 100)
        : 0;

    // показуємо розміри ПЕРШОГО кольору (він активний за
    // замовчуванням); при перемиканні кольору список оновлює
    // обробник у common.js за data-sizes
    const firstVariantSizes = getVariantSizes(product, variants[0]);
    const sizes = firstVariantSizes.length ? firstVariantSizes : PRODUCT_SIZES;

    const colorButtons = variants.map((variant, index) => `
        <button
            type="button"
            class="mini-color ${index === 0 ? "active" : ""}"
            data-color="${escapeHtml(variant.color)}"
            data-images='${escapeAttrSingleQuoted(JSON.stringify(variant.images || []))}'
            data-sizes='${escapeAttrSingleQuoted(JSON.stringify(getVariantSizes(product, variant)))}'
            title="${escapeHtml(variant.color)}"
            style="background:${escapeHtml(variant.hex)}"></button>
    `).join("");

    const sizeButtons = sizes.map(size => `
        <button
            type="button"
            class="mini-size ${sizes.length === 1 ? "active" : ""}">
            ${size}
        </button>
    `).join("");

    // Бейдж знижки у стовпчику бейджів (під NEW/TOP). Відсоток
    // показуємо ЛИШЕ тут: унизу картки поруч із закресленою ціною
    // його більше немає — інакше рядок ціни не вміщався в один
    // рядок на вузьких картках каталогу.
    const discountBadge = discount > 0
        ? `<div class="badge badge-discount">-${discount}%</div>`
        : "";

    const preOrderBadge = product.preOrder
        ? `<div class="badge badge-preorder"><span class="badge-preorder-icon">📦</span><span class="badge-preorder-text">Під замовлення</span></div>`
        : "";

    return `
        <div class="product-card" data-id="${product.id}"${cardFramingAttr(product)}>
            <div class="product-image">
                <div class="badge-stack">
                    ${badge}
                    ${discountBadge}
                    ${preOrderBadge}
                </div>
                <button
                    class="favorite"
                    data-id="${product.id}"
                    title="Додати в обране">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 21s-6.7-4.4-9.3-8.3C.9 9.6 1.7 5.9 5.1 4.9c2-.6 4 .2 5.2 1.9l1.7 2.3 1.7-2.3c1.2-1.7 3.2-2.5 5.2-1.9 3.4 1 4.2 4.7 2.4 7.8C18.7 16.6 12 21 12 21z"/>
                    </svg>
                </button>
                <div class="product-carousel">
                    <div class="photo-track">
                        ${images.map(img => `
                            ${cardPhotoSlide(product, img)}
                        `).join("")}
                        ${video ? `
                            <video
                                class="photo-slide product-video-slide"
                                src="${video}"
                                poster="${images[0]}"
                                muted
                                loop
                                playsinline
                                preload="metadata"></video>
                        ` : ""}
                    </div>
                    ${(images.length + (video ? 1 : 0)) > 1 ? `
                    <button type="button" class="photo-nav photo-nav-prev" aria-label="Попереднє фото">‹</button>
                    <button type="button" class="photo-nav photo-nav-next" aria-label="Наступне фото">›</button>
                    <div class="photo-dots">
                        ${images.map((_, index) => `<span class="photo-dot ${index === 0 ? "active" : ""}"></span>`).join("")}
                        ${video ? `<span class="photo-dot"></span>` : ""}
                    </div>` : ""}
                </div>

                <!-- З'являється лише при наведенні на десктопі (сітка
                     каталогу/карусель) — дублює колір/розмір/кнопку
                     нижче, щоб фото картки лишалось чистим за
                     замовчуванням. На мобільному й у режимі "список"
                     не показується — там працює звичайний блок нижче. -->
                <div class="product-hover-panel">
                    <div class="product-options">
                        <div class="product-colors-wrap">
                            <button type="button" class="colors-arrow colors-arrow-left" aria-label="Попередні кольори" tabindex="-1">‹</button>
                            <div class="product-colors">
                                ${colorButtons}
                            </div>
                            <button type="button" class="colors-arrow colors-arrow-right" aria-label="Наступні кольори" tabindex="-1">›</button>
                        </div>
                        <div class="product-sizes-wrap">
                            <button type="button" class="sizes-arrow sizes-arrow-left" aria-label="Попередні розміри" tabindex="-1">‹</button>
                            <div class="product-sizes">
                                ${sizeButtons}
                            </div>
                            <button type="button" class="sizes-arrow sizes-arrow-right" aria-label="Наступні розміри" tabindex="-1">›</button>
                        </div>
                    </div>
                    <button
                        class="btn buy-btn"
                        data-id="${product.id}">
                        ${product.preOrder ? "Замовити" : "Купити"}
                    </button>
                </div>
            </div>
            <div class="product-info">
                <div class="product-category-row">
                    <div class="product-category">
                        ${escapeHtml(brand)}
                    </div>
                    ${product.preOrder ? `<span class="preorder-inline">📦 Під замовлення</span>` : ""}
                </div>
                <div class="product-title">
                    <!-- Посилання несе колір картки.
                         У каталозі кожен колір показується окремою
                         карткою (splitProductsByColor у catalog.js), тож
                         без ?color= клац по назві відкривав би перший
                         колір товару, а не той, що на картці. Клац по
                         самій картці колір переносить уже давно — тут
                         вирівнюємо поведінку. -->
                    <a href="${productUrl(product, product.cardColor ? { color: product.cardColor } : null)}"
                       class="product-title-link">${escapeHtml(product.title)}</a>
                </div>
                <!-- Назва кольору під заголовком.
                     Потрібна насамперед тому, що кожен колір — окрема
                     картка: дві картки одного товару мають однакові
                     бренд, назву й ціну, і відрізняє їх лише фото. Без
                     підпису це виглядає як дубль у каталозі, а не як
                     вибір кольору.

                     РАНІШЕ підпис показувався ЛИШЕ для розгорнутих
                     карток (умова була product.cardColor). Наслідок
                     видно на скріншоті каталогу: у сусідніх карток
                     стоїть «Карамельний» і «Світло-сірий», а в товару з
                     ОДНИМ кольором рядка немає взагалі — і читається це
                     не як «колір один», а як «колір не вказали». Ряд
                     карток стає нерівним, і найчастіше питання покупця
                     («якого воно кольору?») лишається без відповіді
                     саме там, де відповідь однозначна. -->
                ${cardColorLabel(product, variants)}
                <div class="product-meta-row">
                    <div class="product-price">
                        <span class="price">${formatPrice(product.price)}</span>
                        ${oldPrice}
                    </div>
                    <div class="product-options">
                        <div class="product-colors-wrap">
                            <button type="button" class="colors-arrow colors-arrow-left" aria-label="Попередні кольори" tabindex="-1">‹</button>
                            <div class="product-colors">
                                ${colorButtons}
                            </div>
                            <button type="button" class="colors-arrow colors-arrow-right" aria-label="Наступні кольори" tabindex="-1">›</button>
                        </div>
                        <div class="product-sizes-wrap">
                            <button type="button" class="sizes-arrow sizes-arrow-left" aria-label="Попередні розміри" tabindex="-1">‹</button>
                            <div class="product-sizes">
                                ${sizeButtons}
                            </div>
                            <button type="button" class="sizes-arrow sizes-arrow-right" aria-label="Наступні розміри" tabindex="-1">›</button>
                        </div>
                    </div>
                </div>
                ${product.description ? `<div class="product-desc">${escapeHtml(product.description)}</div>` : ""}
                ${product.preOrder ? `<div class="preorder-row">📦 Під замовлення</div>` : ""}
                <button
                    class="btn buy-btn"
                    data-id="${product.id}">
                    ${product.preOrder ? "Замовити" : "Купити"}
                </button>
            </div>
        </div>
    `;

}


// -------------------------
// Кілька розмірів одного фото
//
// Кожне фото товару лежить у трьох ширинах: 1200 (сторінка товару й
// зум), 600 (картка каталогу на retina) і 300 (мініатюри, мобільна
// сітка). Браузер сам обирає потрібний за srcset — каталог більше не
// тягне повнорозмірні знімки.
//
// Перелік фото, для яких згенеровано розміри, лежить у
// data/image-variants.json. Якщо фото додали пізніше через адмінку і
// його там немає — srcset просто не додається, показується оригінал.
// Так нове фото ніколи не перетвориться на «биту» картинку.
// -------------------------

let imageVariants = null;

function loadImageVariants() {

    if (imageVariants) return imageVariants;

    imageVariants = fetch(dataUrl("data/image-variants.json"))
        .then(r => r.ok ? r.json() : [])
        .then(list => new Set(Array.isArray(list) ? list : []))
        .catch(() => new Set());

    return imageVariants;

}

function buildSrcSet(src) {

    // Адреса може мати версію: photo.webp?v=a1b2c3d4 (її додає збірка,
    // щоб замінене фото не приїхало з кеша). Розділяємо шлях і версію,
    // інакше «відрізання .webp» від хвоста з версією дало б безглузду
    // адресу на кшталт photo.webp?v=a1b2c3-600.webp.
    const [pathPart, query] = String(src || "").split("?");

    const name = pathPart.split("/").pop();

    if (!name.endsWith(".webp")) return null;

    const base = pathPart.slice(0, -".webp".length);
    const v = query ? `?${query}` : "";

    // Версію отримують і зменшені копії: їх перезбирають разом із
    // базовим фото, тож кеш має оновитись і для них.
    return `${base}-300.webp${v} 300w, ${base}-600.webp${v} 600w, ${pathPart}${v} 1200w`;

}

// Рамка кадрування → інлайновий style для КАРТКИ каталогу.
//
// Ім'я з префіксом card- навмисно: на сторінці товару поруч
// завантажується product.js зі своєю galleryFrameStyle(), і коли обидві
// звались однаково, друга мовчки перетирала першу — при різних
// сигнатурах (див. tests/test-no-function-collisions.js).
//
// Математика спільна з адмінкою (assets/js/image-framing.js), тому
// прев'ю показує рівно те, що побачить покупець. Якщо файл чомусь не
// підключився — порожній рядок: картка малюється як раніше, без рамки.
function cardFrameStyle(framing, src) {

    return (window.ImageFraming && window.ImageFraming.frameStyleAttr(framing, src)) || "";

}

// Один слайд фото в картці товару.
//
// НАВІЩО ОКРЕМА ФУНКЦІЯ
// ----------------------
// Ця розмітка потрібна ДВІЧІ: коли картка малюється (createProductCard)
// і коли покупець перемикає колір свотчем — тоді трек фото
// перебудовується під новий колір (обробник .mini-color у common.js).
//
// Друга копія вже розійшлася з першою, і власник побачив обидва
// наслідки на скріншоті каталогу:
//
//   • у копії не було style із кадруванням. Адмін виставив для того
//     знімка наближення 2.34×, тож у щойно намальованій картці сумка
//     заповнювала кадр, а після перемикання кольору та сама сумка
//     ставала дрібною посеред білого тла — бо --frame-zoom зникав і
//     scale() падав до 1;
//   • у копії не було data-variant-src, тож зникав і srcset: замість
//     знімка на 300/600 px браузер тягнув повнорозмірний.
//
// Тепер розмітка одна. Кадрування залежить від САМОГО ФАЙЛА (словник
// «ім'я файлу → кадр»), тому фото кожного кольору отримує свій кадр
// без жодних додаткових умов.
//
// ЗВІДКИ КАДР БЕРЕ ОБРОБНИК СВОТЧА. Не з кешу товарів: на сторінці
// каталогу cachedProducts порожній (його наповнюють сторінка товару,
// кошик, обране й пошук), тож пошук по ньому повертав null і кадр
// однаково зникав. Тому словник кадрів їде в самій картці —
// data-framing на .product-card.
// Словник кадрів на самій картці — щоб обробник свотча міг дати
// новому фото той самий кадр, який виставив адмін. Немає кадрувань —
// немає й атрибута: у переважної більшості товарів його не буває, і
// data-framing="{}" у кожній картці був би просто сміттям у розмітці.
function cardFramingAttr(product) {

    const framing = product && product.framing;

    if (!framing || typeof framing !== "object" || !Object.keys(framing).length) return "";

    return ` data-framing='${escapeAttrSingleQuoted(JSON.stringify(framing))}'`;

}

// Словник кадрів картки назад із розмітки. Зіпсований JSON — не
// причина лишати покупця без фото: кадру не буде, знімок покажеться
// повністю.
function cardFramingFrom(card) {

    if (!card || !card.dataset || !card.dataset.framing) return null;

    try {

        return JSON.parse(card.dataset.framing);

    } catch (error) {

        return null;

    }

}

function cardPhotoSlide(product, img) {

    // Слайд — обгортка, фото всередині.
    //
    // Кадрування масштабує фото через transform, а той не обрізається
    // елементом: при 3× знімок займає три ширини смуги, накриваючи
    // сусідні слайди. Обгортка з overflow:hidden тримає масштаб у
    // межах свого слайда (див. .photo-slide-photo у style.css).
    return `
        <div class="photo-slide photo-slide-photo">
            <img
                class="product-main-image"
                src="${img}"
                style="${cardFrameStyle(product && product.framing, img)}"
                data-variant-src="${img}"
                data-variant-sizes="(max-width: 768px) 50vw, 300px"
                alt="${escapeHtml((product && product.title) || "")}"
                loading="lazy"
                onerror="this.src='assets/images/no-image.png'">
        </div>
    `;

}

// Проставляємо srcset уже після вставки в DOM: список фото
// підвантажується асинхронно, а картки малюються одразу.
async function applyImageVariants(root) {

    const known = await loadImageVariants();

    if (!known.size) return;

    (root || document).querySelectorAll("img[data-variant-src]").forEach(img => {

        const src = img.dataset.variantSrc;

        if (!known.has(src.split("/").pop())) return;

        const srcset = buildSrcSet(src);

        if (!srcset) return;

        img.srcset = srcset;
        img.sizes = img.dataset.variantSizes || "(max-width: 768px) 50vw, 300px";

        delete img.dataset.variantSrc;

    });

}

document.addEventListener("DOMContentLoaded", () => applyImageVariants());

new MutationObserver(() => applyImageVariants()).observe(document.documentElement, {
    childList: true, subtree: true,
});

// -------------------------
// Прокрутка розмірів і кольорів у картці товару
//
// Коли варіантів багато (розмірів — 36–46+XS–4XL, кольорів — 10+),
// вони не вміщаються в панель над фото чи в рядок метаданих. Замість
// того щоб обрізати їх, робимо рядок прокручуваним і показуємо
// стрілки з боків — але лише тоді, коли вони справді потрібні (є що
// прокручувати). Розмір і колір — однаковий механізм, різні класи,
// тому один набір слухачів обробляє обидва варіанти одразу.
//
// Обробники навішані делеговано на document, бо картки
// перемальовуються при кожній зміні фільтрів — переприв'язувати
// слухачі щоразу було б зайвим.
// -------------------------

(function initHorizontalScrollers() {

    const SCROLLERS = [
        { wrapClass: "product-sizes-wrap", listClass: "product-sizes", arrowClass: "sizes-arrow" },
        { wrapClass: "product-colors-wrap", listClass: "product-colors", arrowClass: "colors-arrow" }
    ];

    function configFor(wrap) {

        return SCROLLERS.find(s => wrap.classList.contains(s.wrapClass));

    }

    function updateArrows(wrap) {

        const config = wrap && configFor(wrap);

        if (!config) return;

        const list = wrap.querySelector(`.${config.listClass}`);

        if (!list) return;

        const overflowing = list.scrollWidth - list.clientWidth > 1;

        wrap.classList.toggle("has-overflow", overflowing);

        if (!overflowing) return;

        const left = wrap.querySelector(`.${config.arrowClass}-left`);
        const right = wrap.querySelector(`.${config.arrowClass}-right`);

        if (left) left.disabled = list.scrollLeft <= 1;
        if (right) right.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;

    }

    // Перевіряємо переповнення в момент наведення на КАРТКУ, а не на
    // сам блок розмірів/кольорів. До появи панелі вони мають нульову
    // ширину, тож порахувати заздалегідь не можна. А якщо чекати,
    // поки курсор потрапить рівно на блок, стрілки не з'являлись би
    // саме тоді, коли вони потрібні — щоб зрозуміти, що список можна
    // прокрутити.
    document.addEventListener("mouseover", event => {

        // Кошик (.cart-item) і обране (.favorite-row) використовують ті
        // самі блоки кольору/розміру, що й картка товару — тож і
        // прокрутка зі стрілками має працювати там само. Без цих двох
        // селекторів has-overflow не виставлявся, і при багатьох
        // варіантах рядок просто розпирав верстку.
        const scope = event.target.closest?.(
            ".product-card, .product-wrapper, #productPage, .cart-item, .favorite-row"
        );

        if (!scope) return;

        scope.querySelectorAll(".product-sizes-wrap, .product-colors-wrap").forEach(updateArrows);

    });

    document.addEventListener("scroll", event => {

        const list = event.target;

        if (list?.classList?.contains?.("product-sizes") || list?.classList?.contains?.("product-colors")) {

            updateArrows(list.parentElement);

        }

    }, true);

    document.addEventListener("click", event => {

        const arrow = event.target.closest?.(".sizes-arrow, .colors-arrow");

        if (!arrow) return;

        // картка реагує на кліки (вибір розміру/кольору, перехід на
        // товар) — стрілка не має нічого з цього запускати
        event.preventDefault();
        event.stopPropagation();

        const wrap = arrow.closest(".product-sizes-wrap, .product-colors-wrap");
        const config = wrap && configFor(wrap);
        const list = wrap && config && wrap.querySelector(`.${config.listClass}`);

        if (!list) return;

        const step = Math.max(list.clientWidth * 0.7, 60);
        const isLeft = arrow.classList.contains("sizes-arrow-left") || arrow.classList.contains("colors-arrow-left");

        list.scrollBy({
            left: isLeft ? -step : step,
            behavior: "smooth"
        });

    // ФАЗА ПЕРЕХОПЛЕННЯ (true) — принципово.
    // Сама картка теж слухає кліки (відкриття товару, вибір
    // кольору/розміру). Якби цей слухач працював на спливанні, він
    // спрацював би ПІСЛЯ обробників картки, і stopPropagation() вже
    // нічого б не зупинив — клік по стрілці відкривав би товар.
    }, true);

})();
