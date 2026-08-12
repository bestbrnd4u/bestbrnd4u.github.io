// ======================================
// promo.js
// Логіка сторінки окремої акції (promo?id=<slug>).
//
// Товари для акції визначаються так:
//   1. Ті, що вручну обрані в адмінці (поле "Товари цієї акції")
//   2. + усі товари вказаного бренду (поле "Бренд"), якщо він заданий
// Якщо акція не знайдена — переходимо на загальний каталог.
//
// Фільтри/сортування/вигляд сітки/мобільна шторка "Всі фільтри" —
// це той самий "двигун", що й на сторінці каталогу (catalog.js):
// той самий пошук, стать, категорія, бренд, колір, ціна, розмір.
// catalog.html і promo.html навмисно використовують однакові id
// для цих елементів, тож catalog.js працює тут без жодних змін —
// просто отримує вже звужений список товарів цієї акції замість
// повного каталогу (див. window.CATALOG_SKIP_AUTO_INIT в
// promo.html — через нього catalog.js не запускає свій власний
// initCatalog(), а чекає, поки ми самі підставимо товари нижче).
// ======================================

async function initPromoPage() {

    const params = new URLSearchParams(location.search);
    const slug = params.get("id");

    const loader = document.getElementById("promoLoader");

    if (!slug) {
        location.href = "catalog";
        return;
    }

    try {

        const [promoRes, productsRes, categoryDepartments] = await Promise.all([
            fetch("data/promotions.json"),
            fetch("data/products.json"),
            loadCategoryDepartments()
        ]);

        if (!promoRes.ok || !productsRes.ok) {
            throw new Error("Не вдалося завантажити дані");
        }

        const promotions = await promoRes.json();
        const allProducts = await productsRes.json();

        const promo = Array.isArray(promotions)
            ? promotions.find(p => p.slug === slug)
            : null;

        loader.hidden = true;

        if (!promo) {
            showPromoNotFound();
            return;
        }

        renderPromoHero(promo);
        setupPromoCatalog(promo, allProducts, categoryDepartments);

    } catch (error) {

        console.error("Не вдалося завантажити акцію:", error);

        loader.hidden = true;

        showPromoNotFound();

    }

}

function showPromoNotFound() {

    document.getElementById("promoNotFound").hidden = false;

}

function updatePromoSeoMetadata(promo) {

    const pageUrl = `${SITE_URL}/promo?id=${promo.slug}`;

    const title = `${promo.title} | BestBrnd4u`;

    const description = truncateForMeta(promo.text || `Акція ${promo.title} в інтернет-магазині BestBrnd4u`);

    setMetaByName("description", description);

    setCanonical(pageUrl);

    setMetaByProperty("og:type", "website");
    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", description);
    // теж від широкого банера цієї сторінки, а не від тизера з
    // головної — саме таке фото соцмережі покажуть у прев'ю посилання
    setMetaByProperty("og:image", promo.promoPageImage || promo.image);
    setMetaByProperty("og:url", pageUrl);

}

function renderPromoHero(promo) {

    document.getElementById("pageTitle").textContent = `${promo.title} | BestBrnd4u`;
    document.getElementById("breadcrumbTitle").textContent = promo.title;

    updatePromoSeoMetadata(promo);

    const heroSection = document.getElementById("promoHero");
    const banner = document.getElementById("promoHeroBanner");
    const badgeEl = document.getElementById("promoHeroBadge");
    const titleEl = document.getElementById("promoHeroTitle");
    const textEl = document.getElementById("promoHeroText");
    const linkEl = document.getElementById("promoHeroLink");
    const linkTextEl = document.getElementById("promoHeroLinkText");

    const overlay = "linear-gradient(rgba(17,24,39,.55), rgba(17,24,39,.55))";

    // Банер цієї сторінки — окреме поле "Фото на сторінці акції", а
    // не те саме фото, що й тизер на головній. Причина: тизер і цей
    // банер мають зовсім різні пропорції (напр. компактний банер
    // бренду на головній — вертикальний 4:5, а тут — широка смуга
    // 3.2:1), тож одне фото не могло вкластися в обидва без поганої
    // обрізки в одному з місць. Якщо нове поле не заповнене — старі
    // акції показують те саме фото, що й раніше (image/imageMobile),
    // тож нічого не ламається для вже опублікованих акцій.
    const desktopImage = promo.promoPageImage || promo.image;
    const mobileImage = promo.promoPageImageMobile || promo.promoPageImage || promo.imageMobile || promo.image;

    banner.style.setProperty("--banner-img-desktop", `${overlay}, url('${desktopImage}')`);
    banner.style.setProperty("--banner-img-mobile", `${overlay}, url('${mobileImage}')`);

    if (promo.badge) {
        badgeEl.textContent = promo.badge;
        badgeEl.hidden = false;
    }

    titleEl.textContent = promo.title;

    if (promo.text) {
        textEl.textContent = promo.text;
        textEl.hidden = false;
    }

    if (promo.link) linkEl.href = promo.link;
    if (promo.buttonText) linkTextEl.textContent = promo.buttonText;

    heroSection.hidden = false;

}

// -------------------------
// Підставляємо товари цієї акції у спільний движок фільтрів
// каталогу (catalog.js) і запускаємо ті самі функції, якими
// зазвичай керує initCatalog() на сторінці каталогу
// -------------------------

function setupPromoCatalog(promo, allProducts, categoryDepartments) {

    // без цього виклику фільтр за статтю в URL (?gender=...) ігнорувався б:
    // saveGenderFilter/selectedGenders в catalog.js заповнюються лише тут
    readUrlState();

    const productIds = new Set(promo.productIds || []);

    let curated = allProducts.filter(product =>
        productIds.has(product.id) ||
        (promo.brand && product.brand === promo.brand)
    );

    // якщо для товару не задана власна знижка (oldPrice), але в акції
    // є відсоток за замовчуванням — рахуємо "стару" ціну лише для показу
    // на цій сторінці, сам товар у каталозі це не змінює
    curated = curated.map(product => {

        if (product.oldPrice || !promo.discountPercent) return product;

        const syntheticOldPrice = Math.round(product.price / (1 - promo.discountPercent / 100));

        return { ...product, oldPrice: syntheticOldPrice };

    });

    const section = document.getElementById("promoProductsSection");

    if (curated.length === 0) {

        showPromoNotFound();

        return;

    }

    // `products` — module-рівневий масив із catalog.js; підміняємо
    // його товарами цієї акції, і весь фільтр-движок каталогу
    // (fillBrands/fillColors/fillCategories/fillSizeGroups/render/…)
    // від цього моменту працює лише в межах цієї акції
    products = curated;

    applyCategoryDataToSizeGroups(categoryDepartments);

    fillBrands();
    fillColors();
    fillCategories(categoryDepartments);
    fillSizeGroups();
    setupGenderFilter();

    render();

    section.hidden = false;

}

initPromoPage();
