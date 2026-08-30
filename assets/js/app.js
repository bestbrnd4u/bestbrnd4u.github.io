// ======================================
// app.js
// Логіка головної сторінки (index.html)
// ======================================

const productsGrid = document.getElementById("productsGrid");

async function initHome() {

    if (!productsGrid) return;

    try {

        const response = await fetch(dataUrl("data/products.json"));

        if (!response.ok) {
            throw new Error("Не вдалося завантажити товари");
        }

        const products = await response.json();

        // Показуємо товари з найвищим рейтингом
        const featured = [...products]
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 8);

        renderProducts(featured);

        initCarousel(document.getElementById("productsCarousel"));

        updateFavoriteButtons();

    } catch (error) {

        productsGrid.innerHTML = `
            <p class="error">
                Помилка завантаження товарів.
            </p>
        `;

        console.error(error);

    }

}

// -------------------------
// Контент головної сторінки з CMS (data/home.json)
//
// У HTML для кожного блоку вже є "запасний" вміст на
// випадок, якщо fetch ще не завершився або впав — ми
// просто перезаписуємо його даними з CMS, коли вони готові.
// -------------------------

async function initHomeContent() {

    try {

        const response = await fetch(dataUrl("data/home.json"));

        if (!response.ok) {
            throw new Error("Не вдалося завантажити контент головної сторінки");
        }

        const data = await response.json();

        // Вантажимо тільки ті шрифти, які справді десь обрані:
        // підключати всі шість завжди — це сотні кілобайтів на кожне
        // відкриття заради шрифту, яким може ніхто не користуватись.
        if (window.TextStyles) {
            window.TextStyles.ensureFonts([data.hero?.style, data.promo?.style]);
        }

        renderHero(data.hero, data.framing);
        renderInstagramBlock(data.instagram);
        renderCategories(data.categories);
        renderPromoBanner(data.promo, data.framing);
        renderBrands(data.brands);
        renderAdvantages(data.advantages);

        applyHomeSectionsOrder(data.sectionsOrder);

    } catch (error) {

        // Якщо не вдалося завантажити — просто лишаємо
        // запасний вміст, який вже є в HTML
        console.error(error);

    }

}

// -------------------------
// Порядок блоків на головній — редагується в адмінці
// (перетягуванням у списку), тут лише фізично переставляємо
// DOM-секції в потрібній послідовності. Hero (перший) і
// форма підписки (останній) порядком не керуються — це
// природні "рамки" сторінки.
//
// Якщо список порожній/не заданий — нічого не робимо і
// секції лишаються в тому порядку, що й у самому HTML.
// -------------------------

function applyHomeSectionsOrder(order) {

    if (!Array.isArray(order) || !order.length) return;

    const seen = new Set();

    order.forEach(item => {

        const key = typeof item === "string" ? item : item?.section;

        if (!key || seen.has(key)) return;

        seen.add(key);

        const section = document.querySelector(`[data-section="${key}"]`);

        if (!section) return;

        // якщо цей блок ще прихований службовим hidden — не займаємо
        // йому місце "пусткою": просто переносимо, приховане так і
        // лишиться прихованим до того, як власний рендер його покаже
        section.parentNode.insertBefore(section, document.querySelector(".newsletter"));

    });

}

// -------------------------
// Респонсивні кропи для hero/promo-банерів
//
// Одне й те саме фото по-різному "сідає" в широкий
// десктопний банер і у вузький мобільний — тому замість
// одного background-size:cover на всі екрани, тут
// генеруються 3 окремо обрізаних версії (Pexels вміє
// обрізати фото прямо по параметрах в URL, don't need to
// download/re-upload нічого) і підставляються під
// відповідну ширину екрана через CSS-змінну.
// -------------------------

function buildCroppedImageUrl(url, width, height) {

    try {

        const parsed = new URL(url);

        parsed.searchParams.set("auto", "compress");
        parsed.searchParams.set("cs", "tinysrgb");
        parsed.searchParams.set("fit", "crop");
        parsed.searchParams.set("w", width);
        parsed.searchParams.set("h", height);

        return parsed.toString();

    } catch (error) {

        // не Pexels або не абсолютний URL — просто показуємо як є
        return url;

    }

}

// Картинка акції з окремим кадром для вузьких екранів.
//
// НАВІЩО: поле «Фото для мобільної версії» довго читав ЛИШЕ promo.js —
// тобто сама сторінка акції. На головній усі три способи показу
// (слайдер, великий банер з товарами, компактний тизер) малювали
// звичайний <img src="${promo.image}"> і мобільне фото ігнорували.
// Ззовні це виглядало так, ніби поле не працює: його міняли, чекали
// деплой — і нічого не змінювалось.
//
// <picture> замість підміни через JS свідомо: браузер обирає файл ще
// до виконання скриптів і не викачує зайвий кадр. Кожен спосіб показу
// має СВОЮ точку перелому — саме ту, на якій його блок перебудовується
// в CSS, інакше картинка й розмітка розʼїдуться.
function promoPicture(promo, breakpoint, extraAttrs) {

    // Рамка кадрування акції. Картка й банер ріжуть знімок під свою
    // пропорцію, тож object-position вирішує, що саме лишиться видимим.
    // Мобільне фото має власну рамку — ключ словника це ім'я файлу.
    const frameFor = src => (window.ImageFraming
        && window.ImageFraming.frameStyleAttr(promo.framing, src)) || "";

    const mobile = promo.imageMobile
        ? `<source media="(max-width: ${breakpoint}px)" srcset="${promo.imageMobile}">`
        : "";

    return `
        <picture>
            ${mobile}
            <img
                src="${promo.image}"
                style="${frameFor(promo.image)}"
                alt="${promo.title}"
                ${extraAttrs || ""}
                onerror="this.src='assets/images/no-image.png'">
        </picture>`;

}

// Оформлення текстового блока з адмінки (assets/js/text-styles.js).
//
// Клас has-style ставиться ЛИШЕ коли щось справді задано. Без цього
// правила з .has-style взагалі не спрацьовують — тобто блок, який
// ніхто не налаштовував, не може змінитись від цієї функції ніяк.
//
// Повертає рядок для атрибута style або порожній рядок.
function blockStyleAttr(style) {

    return (window.TextStyles && window.TextStyles.styleAttr(style)) || "";

}

function blockStyleClass(style) {

    return blockStyleAttr(style) ? " has-style" : "";

}

// Ставить оформлення на вже наявний елемент (для блоків, які не
// збираються рядком, а лежать у статичній розмітці).
function applyBlockStyle(el, style) {

    if (!el || !window.TextStyles) return;

    const vars = window.TextStyles.styleVars(style);
    const keys = Object.keys(vars);

    el.classList.toggle("has-style", keys.length > 0);

    keys.forEach(name => el.style.setProperty(name, vars[name]));

}

// Рамка кадрування для фонових банерів.
//
// У товару кадр задається через transform: scale — там фото і контейнер
// однієї пропорції, обрізати нічого, треба лише наблизити. Банер інший:
// смуга 1600×720 на десктопі й 750×1000 на телефоні, а завантажене фото
// майже завжди третьої пропорції. Кадр ріжеться завжди, і питання не
// «наскільки наблизити», а «яку частину лишити» — це background-position.
//
// Числа ті самі, що в товарах (assets/js/image-framing.js), тож рамка,
// виставлена в адмінці, працює скрізь однаково.
function applyFraming(el, framing, imageUrl) {

    if (!el || !window.ImageFraming) return;

    const frame = window.ImageFraming.frameFor(framing, imageUrl);

    if (!frame) {
        el.style.removeProperty("--frame-x");
        el.style.removeProperty("--frame-y");
        el.style.removeProperty("--frame-zoom");
        return;
    }

    el.style.setProperty("--frame-x", frame.x + "%");
    el.style.setProperty("--frame-y", frame.y + "%");
    el.style.setProperty("--frame-zoom", String(frame.zoom));

}

// mobileImage — окреме фото для вузького екрана.
//
// НАВІЩО ВОНО ПОТРІБНЕ
// ---------------------
// buildCroppedImageUrl нижче вміє різати кадр лише для абсолютних
// адрес із параметрами (так колись працювали фото з Pexels). Усі наші
// фото локальні, тож для них функція повертає адресу БЕЗ ЗМІН — тобто
// «десктопний», «планшетний» і «мобільний» варіанти були одним і тим
// самим файлом, а різав його вже background-size:cover.
//
// Для банера це означало, що з широкої смуги 1600×720 на телефоні
// лишалась вузька середина: текст опинявся просто на товарі, а сам
// товар було не роздивитись. Тому мобільний кадр тепер окремий файл —
// з іншою композицією, а не тим самим знімком іншого розміру.
function setResponsiveBanner(el, cssVarName, imageUrl, crops, framing, mobileImage) {

    if (!el || !imageUrl) return;

    const mobileSource = mobileImage || imageUrl;

    const desktopUrl = buildCroppedImageUrl(imageUrl, crops.desktop.w, crops.desktop.h);
    const tabletUrl = buildCroppedImageUrl(imageUrl, crops.tablet.w, crops.tablet.h);
    const mobileUrl = buildCroppedImageUrl(mobileSource, crops.mobile.w, crops.mobile.h);

    const mqMobile = window.matchMedia("(max-width: 600px)");
    const mqTablet = window.matchMedia("(max-width: 900px)");

    function apply() {

        let url = desktopUrl;
        let source = imageUrl;

        if (mqMobile.matches) { url = mobileUrl; source = mobileSource; }
        else if (mqTablet.matches) url = tabletUrl;

        el.style.setProperty(cssVarName, `url('${url}')`);

        // Рамка кадрування прив'язана до ІМЕНІ ФАЙЛУ, а на телефоні
        // файл інший — тож перечитуємо її разом зі зміною картинки.
        applyFraming(el, framing, source);

    }

    apply();

    mqMobile.addEventListener("change", apply);
    mqTablet.addEventListener("change", apply);

}

// framing — спільний для всієї головної словник «файл → рамка»
// (лежить на верхньому рівні home.json, бо одне фото може
// використовуватись і в банері, і в категорії)
function renderHero(hero, framing) {

    if (!hero) return;

    const heroSection = document.getElementById("heroSection");

    // оформлення з адмінки — на корінь блока
    applyBlockStyle(heroSection, hero.style);
    const heroLabel = document.getElementById("heroLabel");
    const heroHeading = document.getElementById("heroHeading");
    const heroText = document.getElementById("heroText");
    const heroPrimaryBtn = document.getElementById("heroPrimaryBtn");
    const heroSecondaryBtn = document.getElementById("heroSecondaryBtn");

    if (hero.image && heroSection) {

        setResponsiveBanner(heroSection, "--hero-bg", hero.image, {
            desktop: { w: 1600, h: 720 },
            tablet: { w: 1024, h: 900 },
            mobile: { w: 750, h: 1000 }
        }, framing, hero.imageMobile);

    }

    if (heroLabel && hero.label) heroLabel.textContent = hero.label;

    if (heroHeading && hero.heading) {
        heroHeading.innerHTML = hero.heading
            .split("\n")
            .map(line => line.trim())
            .join("<br>");
    }

    if (heroText && hero.text) heroText.textContent = hero.text;

    if (heroPrimaryBtn) {
        if (hero.primaryButtonText) heroPrimaryBtn.textContent = hero.primaryButtonText;
        if (hero.primaryButtonLink) heroPrimaryBtn.href = hero.primaryButtonLink;
    }

    if (heroSecondaryBtn) {
        if (hero.secondaryButtonText) heroSecondaryBtn.textContent = hero.secondaryButtonText;
        if (hero.secondaryButtonLink) heroSecondaryBtn.href = hero.secondaryButtonLink;
    }

}

function renderInstagramBlock(instagram) {

    if (!instagram) return;

    const titleEl = document.getElementById("instagramTitle");
    const textEl = document.getElementById("instagramText");
    const btnEl = document.getElementById("instagramBtn");

    if (titleEl && instagram.title) titleEl.textContent = instagram.title;
    if (textEl && instagram.text) textEl.textContent = instagram.text;

    if (btnEl) {
        if (instagram.buttonText) btnEl.textContent = instagram.buttonText;
        if (instagram.link) btnEl.href = instagram.link;
    }

}

function renderCategories(categories) {

    if (!categories) return;

    const titleEl = document.getElementById("categoriesTitle");
    const gridEl = document.getElementById("categoriesGrid");

    if (titleEl && categories.title) titleEl.textContent = categories.title;

    if (gridEl && Array.isArray(categories.items)) {

        gridEl.innerHTML = categories.items.map(item => `
            <a href="${item.link || "catalog"}" class="category">
                <img
                    src="${item.image || "assets/images/no-image.png"}"
                    alt="${item.label || ""}"
                    onerror="this.src='assets/images/no-image.png'">
                <h3>${item.label || ""}</h3>
            </a>
        `).join("");

    }

}

function renderPromoBanner(promo, framing) {

    if (!promo) return;

    const bannerEl = document.getElementById("promoBanner");

    applyBlockStyle(bannerEl, promo.style);
    const labelEl = document.getElementById("promoLabel");
    const headingEl = document.getElementById("promoHeading");
    const textEl = document.getElementById("promoText");
    const btnEl = document.getElementById("promoBtn");

    if (promo.image && bannerEl) {

        setResponsiveBanner(bannerEl, "--promo-bg", promo.image, {
            desktop: { w: 1600, h: 640 },
            tablet: { w: 1024, h: 800 },
            mobile: { w: 750, h: 900 }
        }, framing, promo.imageMobile);

    }

    if (labelEl && promo.label) labelEl.textContent = promo.label;
    if (headingEl && promo.heading) headingEl.textContent = promo.heading;
    if (textEl && promo.text) textEl.textContent = promo.text;

    if (btnEl) {
        if (promo.buttonText) btnEl.textContent = promo.buttonText;
        if (promo.buttonLink) btnEl.href = promo.buttonLink;
    }

}

function renderBrands(brands) {

    if (!brands) return;

    const titleEl = document.getElementById("brandsTitle");
    const gridEl = document.getElementById("brandsGrid");

    if (titleEl && brands.title) titleEl.textContent = brands.title;

    if (gridEl && Array.isArray(brands.items)) {

        gridEl.innerHTML = brands.items.map(item => `
            <a href="${item.link || "catalog"}" class="brand-card">${item.name || ""}</a>
        `).join("");

    }

}

function renderAdvantages(advantages) {

    const gridEl = document.getElementById("advantagesGrid");

    if (!gridEl || !Array.isArray(advantages)) return;

    gridEl.innerHTML = advantages.map(item => `
        <div>
            <p>${item.icon || ""}</p>
            <h3>${item.title || ""}</h3>
            <p>${item.text || ""}</p>
        </div>
    `).join("");

}

initHome();
initHomeContent();
initPromotions();
initCollections();

// -------------------------
// Розділ "Акції" на головній (data/promotions.json —
// окремий файл, зібраний із data/promotions/*.json)
// -------------------------

async function initPromotions() {

    const section = document.getElementById("promotionsSection");
    const grid = document.getElementById("promotionsGrid");

    if (!section || !grid) return;

    try {

        const response = await fetch(dataUrl("data/promotions.json"));

        if (!response.ok) {
            throw new Error("Не вдалося завантажити акції");
        }

        const promotions = await response.json();

        if (!Array.isArray(promotions) || promotions.length === 0) {
            return;
        }

        // шрифти, обрані в акціях (вантажаться лише ті, що справді є)
        if (window.TextStyles) {
            window.TextStyles.ensureFonts(promotions.map(p => p.style));
        }

        // Статистика: акції на головній.
        //
        // Для банерів ми зробили кадрування, стилі й окремі картинки під
        // телефон — але досі не знали, чи на них узагалі натискають.
        // Тепер видно і показ, і переходи.
        //
        // Клац ловимо одним обробником на весь документ, а не в кожному
        // з чотирьох типів банерів: типів може стати більше, і кожного
        // разу згадувати про статистику ніхто не буде.
        promotions.forEach((promo, index) =>
            window.Analytics?.viewPromotion(promo, promo.displayType + " #" + (index + 1)));

        document.addEventListener("click", event => {

            const link = event.target.closest('a[href^="promo?id="]');

            if (!link) return;

            const slug = decodeURIComponent(link.getAttribute("href").split("id=")[1] || "");
            const promo = promotions.find(p => p.slug === slug);

            if (promo) window.Analytics?.selectPromotion(promo, promo.displayType);

        });

        const regular = promotions.filter(promo => promo.displayType === "card");
        const heroSliderPromos = promotions.filter(promo => promo.displayType === "hero_slider");
        const bannersWithProducts = promotions.filter(promo => promo.displayType === "banner_products");
        const compactBanners = promotions.filter(promo => promo.displayType === "banner_compact");

        if (regular.length) {

            grid.innerHTML = regular.map(promo => `
                <a href="promo?id=${encodeURIComponent(promo.slug)}" class="promo-card${blockStyleClass(promo.style)}" style="${blockStyleAttr(promo.style)}">

                    <div class="promo-card-image">
                        ${promoPicture(promo, 700)}
                        ${promo.badge ? `<span class="promo-card-badge">${promo.badge}</span>` : ""}
                    </div>

                    <div class="promo-card-info">
                        <h3>${promo.title}</h3>
                        ${promo.text ? `<p>${promo.text}</p>` : ""}
                        <span class="promo-card-link">${promo.buttonText || "Дивитись усі товари"} →</span>
                    </div>

                </a>
            `).join("");

            section.hidden = false;

        }

        if (heroSliderPromos.length) {
            renderHeroSliderPromotions(heroSliderPromos);
        }

        if (bannersWithProducts.length) {
            renderFeaturedPromotions(bannersWithProducts);
        }

        if (compactBanners.length) {
            renderCompactPromotions(compactBanners);
        }

    } catch (error) {

        console.error(error);

    }

}

// -------------------------
// Повноширинний слайдер-банер (displayType: "hero_slider") —
// одна велика акція за раз на всю ширину сторінки, зі стрілками
// та лічильником, як банер на md-fashion.ua
// -------------------------

function renderHeroSliderPromotions(heroPromotions) {

    const section = document.getElementById("promoHeroSliderSection");
    const track = document.getElementById("promoHeroTrack");
    const controls = document.getElementById("promoHeroControls");
    const prevBtn = document.getElementById("promoHeroPrev");
    const nextBtn = document.getElementById("promoHeroNext");
    const counterEl = document.getElementById("promoHeroCounter");

    if (!section || !track) return;

    track.innerHTML = heroPromotions.map(promo => {

        const promoLink = `promo?id=${encodeURIComponent(promo.slug)}`;

        const genderButtons = Array.isArray(promo.genderButtons) && promo.genderButtons.length
            ? promo.genderButtons
            : [
                { gender: "Жінкам", color: "#111827" },
                { gender: "Чоловікам", color: "#111827" },
                { gender: "Дітям", color: "#111827" }
            ];

        const quicklinksHtml = genderButtons.map(btn => `
            <a href="${promoLink}&gender=${encodeURIComponent(btn.gender)}" style="background:${btn.color || "#111827"}">${btn.gender}</a>
        `).join("");

        return `
        <div class="promo-hero-slide${blockStyleClass(promo.style)}" style="${blockStyleAttr(promo.style)}">

            <div class="promo-hero-slide-content">

                ${promo.badge ? `<span class="promo-hero-slide-badge">${promo.badge}</span>` : ""}

                <h2>${promo.title}</h2>

                ${promo.text ? `<p>${promo.text}</p>` : ""}

                ${genderButtons.length ? `<div class="promo-hero-quicklinks">${quicklinksHtml}</div>` : ""}

                <a href="${promoLink}" class="btn promo-hero-cta">
                    ${promo.buttonText || "Дивитись усі товари"} →
                </a>

            </div>

            <a href="${promoLink}" class="promo-hero-slide-image">
                ${promoPicture(promo, 768)}
            </a>

        </div>
    `;

    }).join("");

    section.hidden = false;

    setupPromoHeroSlider({ track, total: heroPromotions.length, prevBtn, nextBtn, counterEl, controls });

}

// Керування слайдером: стрілки + лічильник "01/03", той самий
// scroll-snap підхід, що й в інших каруселях сайту
function setupPromoHeroSlider({ track, total, prevBtn, nextBtn, counterEl, controls }) {

    if (controls) controls.hidden = total <= 1;
    if (prevBtn) prevBtn.hidden = total <= 1;
    if (nextBtn) nextBtn.hidden = total <= 1;

    if (total <= 1) return;

    function pad(n) {
        return String(n).padStart(2, "0");
    }

    function currentIndex() {
        return Math.round(track.scrollLeft / (track.clientWidth || 1));
    }

    function updateCounter() {
        if (counterEl) counterEl.textContent = `${pad(currentIndex() + 1)}/${pad(total)}`;
    }

    function goTo(index) {

        const clamped = Math.max(0, Math.min(total - 1, index));

        track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });

    }

    prevBtn?.addEventListener("click", () => goTo(currentIndex() - 1));
    nextBtn?.addEventListener("click", () => goTo(currentIndex() + 1));

    let scrollTimer = null;

    track.addEventListener("scroll", () => {

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(updateCounter, 80);

    }, { passive: true });

    window.addEventListener("resize", () => goTo(currentIndex()));

    updateCounter();

}

// -------------------------
// Повноширинні банери акцій (featured: true) — фото + текст
// на всю ширину сторінки, а під ним ряд товарів цієї акції,
// як банер бренду на md-fashion.ua
// -------------------------

// Товари прев'ю акції на головній: спершу ті, що адмін вручну обрав
// і розставив у полі "Товари цієї акції" — РІВНО в тому порядку,
// в якому вони там лежать (перетягування в адмінці має сенс лише
// якщо порядок реально доїжджає до сайту). Далі, якщо вказано
// бренд акції, додаються решта товарів цього бренду — тих, кого
// адмін не обирав вручну, — у порядку каталогу.
//
// Раніше тут стояв .filter(...).slice(0,4): фільтр не зберігав
// порядок productIds (сортував як завгодно, у порядку
// data/products.json), а slice(0,4) обрізав усе, що не влізло —
// разом із товарами, які адмін обрав явно. Саме тому "Urban
// Sneakers" (5-й у списку) зникав, а решта показувались не в тому
// порядку, що в адмінці.
// Правило набору переїхало в promotionProducts() (common.js): те саме
// потрібне сторінці акції, а дві копії вже встигли розійтись — тут
// порядок адмінки зберігався, там ні. Заразом звідти приходить
// підхоплення розділів, якого тут не було зовсім.
function pickPromotionProducts(promo, allProducts, departmentOf) {

    return promotionProducts(promo, allProducts, departmentOf);

}

async function renderFeaturedPromotions(featuredPromotions) {

    const section = document.getElementById("brandCampaignsSection");

    if (!section) return;

    let allProducts = [];

    // «категорія → розділ»: без нього розділ, указаний в
    // автопідхопленні акції, не розгорнувся б у свої категорії.
    let departmentOf = new Map();

    try {

        const [response, deptMap] = await Promise.all([
            fetch(dataUrl("data/products.json")),
            loadDepartmentOf()
        ]);

        if (response.ok) allProducts = await response.json();

        departmentOf = deptMap;

    } catch (error) {

        console.error(error);

    }

    section.innerHTML = featuredPromotions.map(promo => {

        const curated = pickPromotionProducts(promo, allProducts, departmentOf);

        return `
            <div class="brand-campaign">

                <div class="container">

                    <div class="brand-campaign-banner${blockStyleClass(promo.style)}" style="${blockStyleAttr(promo.style)}">

                        <a href="promo?id=${encodeURIComponent(promo.slug)}" class="brand-campaign-image">
                            ${promoPicture(promo, 700)}
                        </a>

                        <div class="brand-campaign-content">

                            ${promo.badge ? `<span class="brand-campaign-eyebrow">${promo.badge}</span>` : ""}

                            <h2>${promo.title}</h2>

                            ${promo.text ? `<p>${promo.text}</p>` : ""}

                            <a href="promo?id=${encodeURIComponent(promo.slug)}" class="btn">
                                ${promo.buttonText || "Дивитись усі товари"}
                            </a>

                        </div>

                    </div>

                    ${curated.length ? `

                    <!-- Той самий переюзаний блок каруселі, що й "Популярні
                         товари" на головній (.carousel + .carousel-track):
                         initCarousel() сам ховає стрілки, якщо всі товари
                         й так влазять без прокрутки (рівно 4 чи менше), і
                         вмикає гортання, тільки коли товарів справді
                         більше — окремої каруселі писати не знадобилось. -->
                    <div class="carousel brand-campaign-carousel">

                        <button type="button" class="carousel-arrow carousel-prev" aria-label="Попередні товари">
                            <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>

                        <div class="brand-campaign-products products-grid carousel-track">
                            ${curated.map(product => createProductCard(product)).join("")}
                        </div>

                        <button type="button" class="carousel-arrow carousel-next" aria-label="Наступні товари">
                            <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                        </button>

                    </div>

                    ` : ""}

                </div>

            </div>
        `;

    }).join("");

    section.querySelectorAll(".brand-campaign-carousel").forEach(carouselEl => {

        if (typeof initCarousel === "function") initCarousel(carouselEl);

    });

    if (typeof initProductCarousels === "function") initProductCarousels(section);
    if (typeof updateFavoriteButtons === "function") updateFavoriteButtons();

}

// -------------------------
// Компактні банери брендів (displayType: "banner_compact") —
// фото + короткий текст і кнопка, без ряду товарів під ним
// -------------------------

function renderCompactPromotions(compactPromotions) {

    const section = document.getElementById("compactPromotionsSection");

    if (!section) return;

    section.innerHTML = compactPromotions.map(promo => `
        <div class="brand-teaser">

            <div class="container">

                <div class="brand-teaser-banner">

                    <!-- Фото — посилання, як у решти акцій. Раніше це був
                         звичайний <div>: курсор над ним лишався стрілкою,
                         клац нічого не робив, і єдиним входом у акцію була
                         кнопка збоку. -->
                    <a href="promo?id=${encodeURIComponent(promo.slug)}"
                       class="brand-teaser-image"
                       aria-label="${promo.title}">
                        ${promoPicture(promo, 700)}
                    </a>

                    <div class="brand-teaser-content">

                        <p class="brand-teaser-text">${promo.title}</p>

                        <a href="promo?id=${encodeURIComponent(promo.slug)}" class="brand-teaser-btn">
                            ${promo.buttonText || "Дивитись все"}
                            <span class="brand-teaser-arrow">→</span>
                        </a>

                    </div>

                </div>

            </div>

        </div>
    `).join("");

}

// -------------------------
// Блоки "Добірка" на головній (data/collections.json —
// зібраний із data/collections/*.json через адмінку) — велике
// фото зліва і кілька товарів справа з гортанням стрілками,
// за зразком блоків "Добірка" на md-fashion.ua
// -------------------------

async function initCollections() {

    const section = document.getElementById("collectionsSection");

    if (!section) return;

    try {

        const [collectionsResponse, productsResponse] = await Promise.all([
            fetch(dataUrl("data/collections.json")),
            fetch(dataUrl("data/products.json"))
        ]);

        if (!collectionsResponse.ok) return;

        const collections = await collectionsResponse.json();

        if (!Array.isArray(collections) || collections.length === 0) return;

        if (window.TextStyles) {
            window.TextStyles.ensureFonts(collections.map(c => c.style));
        }

        const allProducts = productsResponse.ok ? await productsResponse.json() : [];

        section.innerHTML = collections.map(collection => {

            const items = (collection.productIds || [])
                .map(id => allProducts.find(product => product.id === id))
                .filter(Boolean);

            if (!items.length) return "";

            return renderCollectionWidget(collection, items);

        }).join("");

        section.querySelectorAll(".collection-widget").forEach(setupCollectionPagination);

        if (typeof initProductCarousels === "function") initProductCarousels(section);
        if (typeof updateFavoriteButtons === "function") updateFavoriteButtons();

    } catch (error) {

        console.error(error);

    }

}

function getCollectionPageSize() {

    // на мобільному сітка добірки — 2 колонки (.collection-products-row
    // у CSS), тож 3 картки на "сторінці" лишають порожню комірку в
    // другому рядку; на мобільному показуємо 4 картки (рівно 2×2),
    // на десктопі — як і раніше 3 (там 3 колонки)
    return window.matchMedia("(max-width:640px)").matches ? 4 : 3;

}

function renderCollectionWidget(collection, items) {

    const pageSize = getCollectionPageSize();
    const pageCount = Math.ceil(items.length / pageSize);

    return `
        <div class="container">

            <div class="collection-widget${blockStyleClass(collection.style)}" style="${blockStyleAttr(collection.style)}" data-page-size="${pageSize}" data-page-count="${pageCount}" data-page="0">

                <div class="collection-image">
                    <picture>
                        ${collection.imageMobile ? `
                        <!-- до 900px блок перебудовується в один стовпчик,
                             і фото стає широкою смугою 16:9 — там потрібен
                             окремий, горизонтальний кадр -->
                        <source
                            media="(max-width: 900px)"
                            srcset="${collection.imageMobile}">` : ""}
                        <img
                            src="${collection.image}"
                            alt="${collection.imageAlt || collection.title}"
                            loading="lazy"
                            onerror="this.src='assets/images/no-image.png'">
                    </picture>
                </div>

                <div class="collection-content">

                    <div class="collection-head">

                        <div>
                            <span class="collection-eyebrow">${collection.eyebrow || "ДОБІРКА"}</span>
                            <h2>${collection.title}</h2>
                        </div>

                        ${pageCount > 1 ? `
                        <div class="collection-nav">
                            <span class="collection-page-indicator">
                                <span class="collection-page-current">01</span>/${String(pageCount).padStart(2, "0")}
                            </span>
                            <button type="button" class="collection-arrow collection-prev" aria-label="Попередні товари" disabled>←</button>
                            <button type="button" class="collection-arrow collection-next" aria-label="Наступні товари">→</button>
                        </div>` : ""}

                    </div>

                    <div class="collection-products-row products-grid">
                        ${items.map(product => createProductCard(product)).join("")}
                    </div>

                </div>

            </div>

        </div>
    `;

}

function createCollectionProductCard(product) {

    const image =
        product.images?.[0] ||
        product.variants?.[0]?.images?.[0] ||
        "assets/images/no-image.png";

    const oldPrice = product.oldPrice
        ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>`
        : "";

    return `
        <div class="collection-product">

            <div class="collection-product-image">

                <img
                    src="${image}"
                    alt="${escapeHtml(product.title)}"
                    loading="lazy"
                    onerror="this.src='assets/images/no-image.png'">

                <button class="favorite" data-id="${product.id}" title="Додати в обране">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 21s-6.7-4.4-9.3-8.3C.9 9.6 1.7 5.9 5.1 4.9c2-.6 4 .2 5.2 1.9l1.7 2.3 1.7-2.3c1.2-1.7 3.2-2.5 5.2-1.9 3.4 1 4.2 4.7 2.4 7.8C18.7 16.6 12 21 12 21z"/>
                    </svg>
                </button>

            </div>

            <div class="collection-product-info">

                <span class="collection-product-brand">${product.brand || ""}</span>

                <a href="${productUrl(product)}" class="collection-product-title">
                    ${escapeHtml(product.title)}
                </a>

                <div class="collection-product-price">
                    <span class="price">${formatPrice(product.price)}</span>
                    ${oldPrice}
                </div>

            </div>

        </div>
    `;

}

function setupCollectionPagination(widget) {

    let pageSize = Number(widget.dataset.pageSize) || getCollectionPageSize();
    let pageCount = Number(widget.dataset.pageCount) || 1;

    const cards = [...widget.querySelectorAll(".product-card")];
    const prevBtn = widget.querySelector(".collection-prev");
    const nextBtn = widget.querySelector(".collection-next");
    const indicator = widget.querySelector(".collection-page-current");
    const totalEl = widget.querySelector(".collection-page-indicator");

    const image = widget.querySelector(".collection-image");

    function render() {

        const page = Number(widget.dataset.page) || 0;

        cards.forEach((card, i) => {
            card.hidden = Math.floor(i / pageSize) !== page;
        });

        if (prevBtn) prevBtn.disabled = page <= 0;
        if (nextBtn) nextBtn.disabled = page >= pageCount - 1;
        if (indicator) indicator.textContent = String(page + 1).padStart(2, "0");

        // Підпис для зчитувача оновлюється разом зі сторінкою — інакше
        // він називав би першу сторінку навіть на останній.
        if (image && pageCount > 1) {

            image.setAttribute("aria-label",
                `Показати товари ${((page + 1) % pageCount) + 1} з ${pageCount}`
                + ` (зараз ${page + 1})`);

        }

    }

    function recalcPageSize() {

        const nextPageSize = getCollectionPageSize();

        if (nextPageSize === pageSize) return;

        pageSize = nextPageSize;
        pageCount = Math.ceil(cards.length / pageSize);

        widget.dataset.pageSize = String(pageSize);
        widget.dataset.pageCount = String(pageCount);
        widget.dataset.page = String(Math.min(Number(widget.dataset.page) || 0, pageCount - 1));

        const totalDigits = String(pageCount).padStart(2, "0");

        if (totalEl) totalEl.lastChild.textContent = `/${totalDigits}`;

        render();

    }

    window.addEventListener("resize", recalcPageSize, { passive: true });

    prevBtn?.addEventListener("click", () => {
        widget.dataset.page = String(Math.max(0, (Number(widget.dataset.page) || 0) - 1));
        render();
    });

    nextBtn?.addEventListener("click", () => {
        widget.dataset.page = String(Math.min(pageCount - 1, (Number(widget.dataset.page) || 0) + 1));
        render();
    });

    // Клац по фото добірки гортає товари ПО КОЛУ.
    //
    // Стрілки поруч зупиняються на краях (кнопка «далі» гасне на
    // останній сторінці) — це правильно для кнопки, у якої видно стан.
    // Фото стану не показує: якщо воно на останній сторінці перестане
    // реагувати, це виглядатиме як поломка, а не як «далі нічого
    // немає». Тому з останньої сторінки повертаємось на першу.
    if (image && pageCount > 1) {

        image.classList.add("is-pager");

        // Кнопка, а не посилання: перехід нікуди не веде, це керування
        // вмістом блока. Посилання без адреси не потрапляє у Tab і
        // мовчить для зчитувача екрана.
        image.setAttribute("role", "button");
        image.setAttribute("tabindex", "0");

        const step = () => {

            const page = Number(widget.dataset.page) || 0;

            widget.dataset.page = String((page + 1) % pageCount);

            render();

        };

        image.addEventListener("click", step);

        image.addEventListener("keydown", event => {

            if (event.key !== "Enter" && event.key !== " ") return;

            // пробіл інакше прокрутить сторінку
            event.preventDefault();

            step();

        });

    }

    render();

}
