const params = new URLSearchParams(location.search);

// Сторінку товару тепер віддає статичний файл p/<slug>/index.html,
// який генерує scripts/build-product-pages.js. Такий файл сам
// оголошує, який це товар (window.PRODUCT_SLUG / PRODUCT_ID), тож
// шукати нічого не треба.
//
// Стара адреса /product?id=<число> лишається робочою — на неї ведуть
// уже проіндексовані посилання й адреси, якими встигли поділитись, —
// але з неї ми одразу перекидаємо на канонічну, щоб Google не тримав
// в індексі дві копії одного товару.
const pathSlug = decodeURIComponent(
    (location.pathname.match(/\/p\/([^/]+)\/?$/) || [])[1] || ""
);

const productSlug = (typeof window.PRODUCT_SLUG === "string" && window.PRODUCT_SLUG)
    || pathSlug
    || "";

const productId = Number(params.get("id")) || Number(window.PRODUCT_ID) || 0;

// Назва товару як запасний спосіб його знайти.
//
// НАВІЩО. Склад замовлення зберігається знімком (buildOrderItemsSnapshot
// у checkout.js), і в замовленнях, оформлених раніше, поля id у ньому
// немає — тільки назва. Щоб фото й назва в історії замовлень вели куди
// слід і в таких записах, приймаємо ще й ?title=.
//
// Це саме запасний шлях: назви не унікальні й змінюються, тож для нових
// посилань завжди id або slug.
const productTitle = (params.get("title") || "").trim();

const isLegacyUrl = !pathSlug && (params.has("id") || params.has("title"));

function findRequestedProduct(list) {

    if (productSlug) {
        const bySlug = list.find(p => p.slug === productSlug);
        if (bySlug) return bySlug;
    }

    if (productId) {
        return list.find(p => p.id === productId);
    }

    if (productTitle) {

        const wanted = productTitle.toLowerCase();

        return list.find(p => String(p.title || "").trim().toLowerCase() === wanted);

    }

    return undefined;

}

let products=[];

async function init(){

try {

const response=await fetch(dataUrl("/data/products.json"));

if (!response.ok) throw new Error("Не вдалося завантажити товари");

products=await response.json();

const product=findRequestedProduct(products);

if(!product){

// м'який 404: сторінка віддає 200 OK, тож без цього Google
// проіндексував би /product?id=<неіснуючий> і /product без id
// як ще одну копію шаблону
markProductPageNotFound();

renderProductNotFound();

// Переглянуті товари лишаємо: людина, яка прийшла за знятим з продажу
// товаром, найчастіше шукає щось на нього схоже — а це саме те, що
// вона щойно дивилась. Порожній екран був би найгіршим варіантом
// сторінки помилки.
renderRecentlyViewed();

return;

}

// стара адреса → канонічна, зі збереженням обраних кольору й розміру
if (isLegacyUrl && product.slug) {

    // СПЕРШУ розмітка, лише потім перехід.
    //
    // Раніше редірект стояв першим рядком, і сторінка /product?id=…
    // віддавала порожню оболонку: ні canonical, ні JSON-LD, заголовок
    // «Товар | BestBrnd4u». Людина цього не бачить — браузер одразу
    // йде далі, — але пошуковий робот переходу по location.replace не
    // виконує. Через це Search Console на перевірці виправлень
    // (Validate fix) знаходив стару адресу без потрібних полів і
    // зупиняв перевірку з «Affected pages were found».
    //
    // Тепер робот отримує повну розмітку і canonical на /p/<slug>/,
    // тобто бачить і виправлені поля, і те, куди веде справжня
    // адреса товару. Для людини нічого не змінюється: перехід
    // відбувається тим самим рядком нижче.
    updateProductSeoMetadata(product);

    location.replace(productUrl(product, {
        color: params.get("color"),
        size: params.get("size")
    }));

    return;

}

renderProduct(product);

renderSimilar(product);

updateFavoriteButtons();

trackRecentlyViewed(product.id);

renderRecentlyViewed({ excludeId: product.id });

} catch (error) {

console.error(error);

document.getElementById("productPage").innerHTML = `
    <p class="error">Помилка завантаження товару. Спробуйте оновити сторінку.</p>
`;

}

}

// Умови повернення й доставки для розмітки товару — ті самі, що в
// scripts/build-product-pages.js (статичні сторінки) і ті самі, що
// написані на сторінках return-warranty і delivery-payment. Search
// Console просив ці поля в offers (розділ Merchant listings).
// Докладні пояснення до кожного значення — у генераторі сторінок.
const RETURN_POLICY = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "UA",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 14,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility"
};

const FREE_SHIPPING_FROM = 3500;

// Артикул для розмітки — ті самі межі, що в scripts/build-product-pages.js.
//
// Search Console: «Invalid value in field "sku"». У даних лежала назва
// товару з Amazon замість артикула, а getVariantSku може повернути й
// порожній рядок — JSON.stringify прибирає тільки undefined, тож
// "sku": "" пішло б у розмітку як є. Пояснення до меж — у генераторі.
const SKU_MAX_LENGTH = 50;
const SKU_MAX_WORDS = 4;

function sanitizeSku(value) {

    const raw = String(value === undefined || value === null ? "" : value)
        .replace(/\s+/g, " ")
        .trim();

    if (!raw) return "";

    if (raw.length > SKU_MAX_LENGTH) return "";

    if (raw.split(" ").length > SKU_MAX_WORDS) return "";

    // Пробіли Google в артикулі забороняє — замінюємо на дефіс.
    // Пояснення до правила — у генераторі.
    return raw.replace(/ /g, "-").replace(/-{2,}/g, "-");

}

// sku для розмітки — АРТИКУЛ КАТАЛОГУ («95»).
//
// Для Google sku — це позначка товару в НАШОМУ магазині, а не код
// виробника (для того є mpn). Номер ставить система, тож поле є завжди,
// і «Invalid value in field "sku"» більше не може повернутись через
// незаповнений артикул — саме через це його й переробили.
//
// Далі — старий порядок (код постачальника з товару, потім з кольорів):
// потрібен, якщо сторінка малюється на даних, зібраних до появи
// article.
function schemaSku(product) {

    const article = String(product.article || "").trim();

    if (article) return article;

    const own = sanitizeSku(product.sku);

    if (own) return own;

    for (const variant of product.variants || []) {

        const fromVariant = sanitizeSku(variant && variant.sku);

        if (fromVariant) return fromVariant;

    }

    return "";

}

function shippingDetailsFor(price) {

    const details = {
        "@type": "OfferShippingDetails",
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "UA" },
        deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
            transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" }
        }
    };

    // ставку 0 ставимо лише коли доставка справді безкоштовна
    if (Number(price) >= FREE_SHIPPING_FROM) {
        details.shippingRate = { "@type": "MonetaryAmount", value: 0, currency: "UAH" };
    }

    return details;

}

// Сторінка «такого товару немає».
//
// ЧОМУ ЦЕ ВАЖЛИВО. Сюди приходять не з нізвідки: з історії замовлень
// (товар зняли з продажу), зі збереженого посилання, з обраного, зі
// старої розсилки. Раніше на всіх цих шляхах людина бачила один рядок
// «Товар не знайдено» посеред білого екрана — без пояснення й без
// жодного виходу, окрім кнопки «Назад».
//
// Тому тут три речі: що сталося, чому (товар міг бути розпроданий або
// знятий з продажу — це найчастіша причина, і вона не схожа на помилку
// сайту) і куди йти далі.
function renderProductNotFound() {

    const page = document.getElementById("productPage");

    if (!page) return;

    // Що саме шукали — показуємо, якщо знаємо. Так видно, що сайт
    // зрозумів запит, а не просто зламався.
    const wanted = productTitle
        ? `<p class="empty-state-note">Ми шукали: «${escapeHtml(productTitle)}»</p>`
        : "";

    page.innerHTML = `
        <div class="empty-state product-not-found">
            <h2>🔍</h2>
            <h3>Товар не знайдено</h3>
            <p>
                Можливо, його вже розпродано або знято з продажу,
                а посилання застаріло. Схожі моделі майже завжди є —
                напишіть нам, і ми підберемо заміну.
            </p>
            ${wanted}
            <a href="/catalog" class="btn">Перейти в каталог</a>
            <a href="/contacts" class="btn btn-outline">Написати нам</a>
        </div>`;

}

// Сторінка без товару не повинна потрапляти в індекс: адреса без id
// або з неіснуючим id віддає той самий шаблон, і для Google це дубль.
function markProductPageNotFound() {

    document.title = "Товар не знайдено | BestBrnd4u";

    setMetaByName("robots", "noindex,follow");

    setMetaByName("description", "Такого товару немає в каталозі BestBrnd4u.");

}

// Виправляє головний SEO-баг сторінки товару: раніше document.title
// і meta description ніколи не оновлювались, тож усі товари мали
// однаковий заголовок у видачі Google. Тепер кожен товар отримує
// власні title/description/canonical/OG + структуровані дані.
function updateProductSeoMetadata(product) {

    const pageUrl = SITE_URL + productUrl(product);

    const priceText = `${new Intl.NumberFormat("uk-UA").format(product.price)} грн`;

    const title = `${product.title} — купити за ${priceText} | BestBrnd4u`;

    const description = truncateForMeta(
        product.description ||
        `${product.title} від ${product.brand} — купити в інтернет-магазині BestBrnd4u. Ціна ${priceText}.`
    );

    // OG і schema.org вимагають абсолютних адрес — відносний
    // "assets/…" Google мовчки ігнорує (див. absoluteUrl у common.js)
    const images = (product.images || []).map(absoluteUrl).filter(Boolean);

    const image = images[0] || "";

    document.title = title;

    setMetaByName("description", description);

    setCanonical(pageUrl);

    setMetaByProperty("og:type", "product");
    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", description);
    setMetaByProperty("og:image", image);
    setMetaByProperty("og:url", pageUrl);

    setJsonLd("productSchema", {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.title,
        image: images,
        description,
        // Раніше тут стояв getVariantSku() першого варіанта: він віддає
        // значення як є і може повернути порожній рядок — обидва випадки
        // Search Console позначає як «Invalid value in field "sku"».
        sku: schemaSku(product) || undefined,
        // Код виробника — це mpn, а не sku: саме так їх розрізняє
        // Google. Заповнений руками й буває порожнім, тож лишається
        // необов'язковим і проходить ту саму перевірку довжини.
        mpn: sanitizeSku(product.sku) || undefined,
        brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
        offers: {
            "@type": "Offer",
            url: pageUrl,
            priceCurrency: "UAH",
            price: product.price,
            // товар "під замовлення" — це PreOrder, а не InStock;
            // невідповідність розмітки реальному стану — привід для
            // Google зняти rich-результат товару
            availability: product.preOrder
                ? "https://schema.org/PreOrder"
                : "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
            hasMerchantReturnPolicy: RETURN_POLICY,
            shippingDetails: shippingDetailsFor(product.price)
        },
        // Рейтинг — ЛИШЕ якщо за ним стоять справжні відгуки.
        // Раніше умовою було саме product.rating, і в чотирьох товарів
        // із rating: 5, reviews: 0 у розмітку йшов reviewCount: 0 —
        // оцінка без жодного відгуку. Google такий блок або відкидає,
        // або (гірше) розцінює як накрутку рейтингу.
        aggregateRating: (product.rating && Number(product.reviews) > 0) ? {
            "@type": "AggregateRating",
            ratingValue: product.rating,
            reviewCount: Number(product.reviews)
        } : undefined
    });

    setJsonLd("breadcrumbSchema", {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "Головна", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Каталог", item: `${SITE_URL}/catalog` },
            { "@type": "ListItem", position: 3, name: product.title, item: pageUrl }
        ]
    });

}

// Галерея товару: побудова мініатюр / головних слайдів / крапок
// з масиву фото + необов'язкового відео обраного кольору.
// Відео завжди йде останнім слайдом і позначається значком ▶
// на мініатюрі (саме відео там не програється — просто "обкладинка").
// -------------------------

// Розпізнає посилання на відео: пряме посилання на файл (.mp4 тощо)
// відтворюємо як звичайний <video>, а YouTube/Vimeo — вбудовуємо
// через iframe. Це важливо саме для відео з iPhone: пряме .mov/.mp4
// знято на iPhone часто в кодеку HEVC, який грає лише в Safari — не
// в Chrome/Firefox. YouTube/Vimeo самі перекодовують відео при
// завантаженні у сумісний формат, який працює в будь-якому браузері.
function parseVideoEmbed(url) {

    if (!url) return null;

    const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);

    if (youtubeMatch) {

        const id = youtubeMatch[1];

        return {
            type: "embed",
            embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
            thumbUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`
        };

    }

    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);

    if (vimeoMatch) {

        return {
            type: "embed",
            embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
            thumbUrl: ""
        };

    }

    return { type: "file", videoUrl: url };

}

// Рамка кадрування → інлайновий style для ГАЛЕРЕЇ сторінки товару.
//
// Бере framing з currentFraming, а не з аргументу: галерею перемальовує
// ще й updateGalleryForColor(), у якої товару під рукою вже немає.
// Префікс gallery- розводить її з cardFrameStyle() в ui.js — обидва
// файли підключені на цій сторінці одночасно.
// Хлібні крихти: повний шлях замість «Головна – Каталог – Назва».
//
// Статичні сторінки p/<slug>/ уже приходять із готовою доріжкою від
// генератора — тут ми або підтверджуємо те саме, або будуємо її для
// product.html?id=…, де розмітки немає.
//
// Будівник спільний із генератором і з розміткою BreadcrumbList
// (assets/js/breadcrumbs.js): якби кожне місце збирало доріжку саме,
// Google рано чи пізно показував би шлях, якого на сторінці немає.
let departmentByCategory = null;

async function loadDepartmentMap() {

    if (departmentByCategory) return departmentByCategory;

    departmentByCategory = new Map();

    try {

        const response = await fetch(dataUrl("data/categories.json"));

        if (response.ok) {
            (await response.json()).forEach(row => {
                if (row && row.name && row.department) departmentByCategory.set(row.name, row.department);
            });
        }

    } catch (error) {

        // без переліку категорій ланка відділу просто не зʼявиться

    }

    return departmentByCategory;

}

// Кнопка «Назад» у хлібних крихтах.
//
// Робить те саме, що кнопка «назад» у браузері: повертає в каталог із
// тими самими фільтрами і на ту саму картку, де людина спинилась
// (assets/js/catalog.js → restoreCatalogPosition).
//
// АЛЕ НЕ ЗАВЖДИ. Якщо сторінку товару відкрили напряму — з пошуку
// Google, із месенджера, за збереженим посиланням — попередньої
// сторінки просто немає, і history.back() виніс би людину ЗІ САЙТУ.
// Тому перевіряємо, чи попередня сторінка була нашою. Якщо ні —
// лишаємо звичайний перехід у каталог, який і так прописаний у href.
//
// Обробник на документі, а не на кнопці: доріжка перемальовується
// при зміні кольору, і слухач на самій кнопці довелось би навішувати
// щоразу заново.
document.addEventListener("click", event => {

    const back = event.target.closest("[data-crumb-back]");

    if (!back) return;

    let sameSite = false;

    try {

        sameSite = !!document.referrer
            && new URL(document.referrer).origin === location.origin;

    } catch (error) {

        sameSite = false;

    }

    // history.length > 1 сам по собі не показник: у новій вкладці він
    // теж буває більшим за одиницю.
    if (!sameSite) return;   // працює як звичайне посилання на каталог

    event.preventDefault();

    history.back();

});

function paintBreadcrumbs(product, map) {

    const host = document.getElementById("breadcrumbsList");

    if (!host || !window.Breadcrumbs) {

        // запасний шлях: хоча б назва товару, як було раніше
        const title = document.getElementById("breadTitle");

        if (title) title.textContent = product.title;

        return;

    }

    const trail = window.Breadcrumbs.buildTrail(product, {
        departmentOf: name => (map && map.get(name)) || ""
    });

    host.innerHTML = window.Breadcrumbs.BACK_HTML + trail
        .map(crumb => crumb.current
            ? `<span class="crumb-current" id="breadTitle">${escapeHtml(crumb.label)}</span>`
            : `<a href="${escapeHtml(crumb.href)}">${escapeHtml(crumb.label)}</a>`)
        .join('<span class="crumb-sep">–</span>');

}

// На телефоні доріжку показуємо з КІНЦЯ — з назви товару.
//
// Шлях тепер довгий: Головна → Каталог → Стать → Відділ → Категорія →
// Бренд → Назва. У вузький екран він не влазить, і за замовчуванням
// видно початок — «Головна – Каталог», тобто найменш корисне. Людина
// щойно відкрила товар і хоче бачити, ДЕ вона зараз, а не звідки
// прийшла. Хто захоче вище — прокрутить вліво.
//
// Кнопка «Назад» при цьому лишається на місці: вона прилипла до лівого
// краю (.crumb-back у style.css), інакше прокрутка вправо ховала б
// саме те, чим найчастіше користуються.
function scrollBreadcrumbsToEnd() {

    const host = document.getElementById("breadcrumbsList");

    if (!host) return;

    // тільки якщо доріжка справді не влазить
    if (host.scrollWidth <= host.clientWidth) return;

    host.scrollLeft = host.scrollWidth;

}

function renderBreadcrumbs(product) {

    // одразу малюємо те, що можна без мережі, а відділ додаємо, коли
    // приїде перелік категорій — щоб доріжка не блимала порожньою
    paintBreadcrumbs(product, departmentByCategory);
    scrollBreadcrumbsToEnd();

    loadDepartmentMap().then(map => {
        paintBreadcrumbs(product, map);
        scrollBreadcrumbsToEnd();
    });

}

// Заглушка відео → плеєр.
//
// Клац по ній вмикає ЦЕ відео, а не змінює загальну згоду: людина
// погодилась подивитись конкретний ролик, і робити з цього постійний
// дозвіл для всього сайту було б підміною її рішення. Загальний вибір
// змінюється лише в банері.
document.addEventListener("click", event => {

    const btn = event.target.closest(".video-consent-btn");

    if (!btn) return;

    const box = btn.closest(".video-consent");

    if (!box) return;

    const iframe = document.createElement("iframe");

    iframe.src = box.dataset.embedUrl;
    iframe.title = box.dataset.embedTitle || "";
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");

    box.classList.remove("video-consent");
    box.innerHTML = "";
    box.appendChild(iframe);

});

// Якщо згоду дали в банері вже після того, як сторінку намальовано, —
// заглушки перетворюються на плеєри самі, без перезавантаження.
document.addEventListener("consent:change", event => {

    if (!event.detail?.embeds) return;

    document.querySelectorAll(".video-consent .video-consent-btn")
        .forEach(btn => btn.click());

});

function galleryFrameStyle(src) {

    return (window.ImageFraming
        && window.ImageFraming.frameStyleAttr(currentFraming, src)) || "";

}

// framing поточного товару; проставляється при рендері сторінки
let currentFraming = null;

function buildThumbsMarkup(images, video, altText) {

    const imageThumbs = images.map((img, index) => `
        <div class="thumb ${index === 0 ? "active" : ""}">
            <img
                src="${img}"
                style="${galleryFrameStyle(img)}"
                data-variant-src="${img}"
                data-variant-sizes="100px"
                alt="${altText}"
                onerror="this.onerror=null;this.src='assets/images/no-image.png'">
        </div>
    `).join("");

    const media = parseVideoEmbed(video);

    let videoThumb = "";

    if (media?.type === "file") {

        // мініатюра — це фото (poster), а не сам відеотег: так
        // завжди видно нормальну картинку зверху, а не порожній/
        // чорний кадр, поки браузер ще не підвантажив відео
        const poster = images[0] || "assets/images/no-image.png";

        videoThumb = `
        <div class="thumb thumb-video ${images.length === 0 ? "active" : ""}" style="background-image:url('${poster}');background-size:cover;background-position:center">
            <span class="thumb-play" aria-hidden="true">▶</span>
        </div>
    `;

    } else if (media?.type === "embed") {

        const bgStyle = media.thumbUrl
            ? `background-image:url('${media.thumbUrl}');background-size:cover;background-position:center`
            : `background:#111827`;

        videoThumb = `
        <div class="thumb thumb-video ${images.length === 0 ? "active" : ""}" style="${bgStyle}">
            <span class="thumb-play" aria-hidden="true">▶</span>
        </div>
    `;

    }

    return imageThumbs + videoThumb;

}

function buildTrackMarkup(images, video, altText) {

    const imageSlides = images.map(img => `
        <div class="gallery-slide gallery-slide-photo">
            <img class="gallery-photo" src="${img}" style="${galleryFrameStyle(img)}" data-variant-src="${img}" data-variant-sizes="(max-width: 900px) 100vw, 600px" alt="${altText}" draggable="false" onerror="this.onerror=null;this.src='assets/images/no-image.png'">
        </div>
    `).join("");

    const media = parseVideoEmbed(video);

    let videoSlide = "";

    if (media?.type === "file") {

        // poster — щоб на слайді відразу було видно фото товару,
        // а не порожній/чорний кадр, поки відео ще не почало
        // програватись; muted — без цього автозапуск при свайпі
        // (нижче, в setupGallery) заблокував би сам браузер
        //
        // БЕЗ controls — НАВМИСНО
        // ------------------------
        // У галереї відео стоїть у ряд із фотографіями й має читатись
        // як «живе фото», а не як окремий плеєр. Смуга керування знизу
        // (пауза, гучність, повний екран, три крапки) ламала цей ряд:
        // на четвертому слайді фото, на пʼятому раптом чорна панель
        // поверх товару.
        //
        // Керування нікуди не зникло:
        //
        //   тап по відео        пауза / продовження з того ж місця
        //                       (setupGallery нижче);
        //   тап по будь-якому   лайтбокс, а там відео вже зі
        //   фото поруч         справжнім плеєром і повним екраном
        //                       (assets/js/lightbox.js).
        //
        // Так само зроблено у швидкому перегляді картки
        // (assets/js/ui.js) — щоб відео поводилось однаково скрізь,
        // де воно стоїть поруч із фото.
        //
        // tabindex і role — щоб пауза лишалась доступною з клавіатури:
        // рухома картинка без способу її зупинити це WCAG 2.2.2.
        videoSlide = `
            <video
                class="gallery-slide gallery-slide-video"
                src="${media.videoUrl}"
                poster="${images[0] || "assets/images/no-image.png"}"
                muted
                playsinline
                loop
                preload="metadata"
                disablepictureinpicture
                tabindex="0"
                role="button"
                aria-label="Відео товару. Натисніть, щоб зупинити або продовжити"></video>
        `;

    } else if (media?.type === "embed") {

        // Відео вантажиться ЛИШЕ після згоди (assets/js/consent.js).
        //
        // iframe YouTube чи Vimeo звертається до чужого сервера одразу
        // при відкритті сторінки — тобто ці сервіси дізнаються
        // IP-адресу відвідувача ще до того, як він щось натиснув.
        // Саме через це в банері й питається окремо про відео: якби
        // ми вставляли iframe одразу, згода була б декоративною.
        //
        // До згоди на місці плеєра — заглушка з обкладинкою й прямим
        // текстом про те, що станеться після натискання.
        const allowed = !window.Consent || window.Consent.has("embeds");

        videoSlide = allowed
            ? `
            <div class="gallery-slide gallery-slide-embed">
                <iframe
                    src="${media.embedUrl}"
                    title="${altText}"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowfullscreen
                    loading="lazy"></iframe>
            </div>
        `
            : `
            <div class="gallery-slide gallery-slide-embed video-consent"
                 data-embed-url="${escapeHtml(media.embedUrl)}"
                 data-embed-title="${escapeHtml(altText)}"
                 ${media.thumbUrl ? `style="--embed-thumb:url('${escapeHtml(media.thumbUrl)}')"` : ""}>
                <button type="button" class="video-consent-btn">
                    <span class="video-consent-play" aria-hidden="true">▶</span>
                    <span class="video-consent-title">Показати відео</span>
                    <span class="video-consent-note">
                        Завантажиться з ${media.embedUrl.includes("vimeo") ? "Vimeo" : "YouTube"}.
                        Сервіс отримає вашу IP-адресу.
                    </span>
                </button>
            </div>
        `;

    }

    return imageSlides + videoSlide
        || `<div class="gallery-slide gallery-slide-photo">
                <img class="gallery-photo" src="assets/images/no-image.png" alt="${altText}">
            </div>`;

}

function buildDotsMarkup(images, video) {

    const total = images.length + (video ? 1 : 0);

    if (total <= 1) return "";

    // <button>, а не <span>.
    //
    // На точки вже був навішаний обробник кліку, але виглядали вони як
    // декорація: курсор над ними лишався стрілкою, з клавіатури до них
    // не дійти, і зчитувач екрана не називав їх кнопками. Плюс 7×7px —
    // це надто мала мішень; збільшуємо її прозорим падінгом у CSS,
    // не змінюючи вигляду самої крапки.
    return Array.from({ length: total }, (_, index) => `
        <button type="button"
                class="gallery-dot ${index === 0 ? "active" : ""}"
                aria-label="Фото ${index + 1} з ${total}"
                ${index === 0 ? 'aria-current="true"' : ""}></button>`).join("");

}

// Знаходить варіант за кольором з адреси.
//
// В адресі лежить латиниця («bezhevyi»), а у варіанті — справжня
// назва («Бежевий»), тож просте порівняння тут не працює.
//
// СТАРІ ПОСИЛАННЯ ПРАЦЮЮТЬ. До переходу на латиницю адреси писались
// кирилицею, і такі вже розіслані в постах і збережені в закладках.
// Тому пробуємо ТРИ зіставлення: точний збіг (кирилиця зі старого
// посилання), збіг за slug-ом (нова латиниця) і збіг без урахування
// регістру. Не знайшли — -1, і виклична сторона відкриє перший колір,
// як робила завжди.
function findVariantByColor(variants, requested) {

    if (!requested) return -1;

    const exact = variants.findIndex(variant => variant.color === requested);

    if (exact >= 0) return exact;

    const wanted = String(requested).toLowerCase();

    return variants.findIndex(variant => {

        const color = String(variant.color || "");

        if (color.toLowerCase() === wanted) return true;

        // Translit може не підключитись — тоді лишається лише точний
        // збіг вище, і сторінка просто відкриється на першому кольорі.
        if (!window.Translit) return false;

        return window.Translit.toSlug(color) === window.Translit.toSlug(requested);

    });

}

// Готовий вигляд СТОРІНКИ ТОВАРУ в одному кольорі — для перемикача.
//
// Розмітку збирає саме product.js, а не спільний помічник: на сторінці
// товару вона своя (h1, .price-box, .product-badge), і якби її збирало
// щось спільне з карткою каталогу, одна з двох розкладок рано чи пізно
// розійшлася б із власним шаблоном. Кожна поверхня описує себе сама.
function pageColorView(base, variant) {

    const view = applyColorOverrides(base, variant);

    const oldPrice = view.oldPrice
        ? `<span class="old-price">${formatPrice(view.oldPrice)}</span>`
        : "";

    return {
        title: view.title || "",
        badge: view.badge || "",
        priceBox: `${oldPrice}<span class="price">${formatPrice(view.price)}</span>`,
        description: view.description || "",
        // Стан наявності саме цього кольору: чи він «під замовлення» і
        // яких розмірів немає. Перемикач кольору застосовує це до
        // сторінки, не перемальовуючи її цілком (див. common.js).
        preOrder: Boolean(variant && variant.preOrder),
        soldOutSizes: soldOutSizes(base, variant)
    };

}

// Наявність на сторінці: позначка, текст кнопки й блок умов.
//
// ЧОМУ ОКРЕМА ФУНКЦІЯ, А НЕ ШАБЛОН
// ---------------------------------
// «Під замовлення» тут залежить від ДВОХ речей, і обидві міняються без
// перемальовки сторінки: обраного кольору (у нього свій залишок) і
// обраного розміру (39-го може не бути, коли 40-й лежить на складі).
// Тому обидва блоки — умови замовлення й доставка — завжди в розмітці,
// а показ перемикається тут.
//
// Викликає це і сторінка (клік по розміру), і спільний перемикач
// кольору в common.js — щоб відповідь була одна.
function refreshAvailability() {

    const page = document.getElementById("productPage");

    if (!page) return;

    const preOrder = page.dataset.colorPreorder === "1"
        || Boolean(page.querySelector(".size.active[data-out]"));

    const tag = page.querySelector(".preorder-tag");

    if (tag) tag.hidden = !preOrder;

    const buy = page.querySelector(".buy-btn");

    if (buy) buy.textContent = preOrder ? "📦 Замовити" : "🛒 Купити";

    const box = page.querySelector(".preorder-box");

    if (box) box.hidden = !preOrder;

    const delivery = page.querySelector(".delivery-box");

    if (delivery) delivery.hidden = preOrder;

}

// Розміри цього кольору, яких немає в наявності.
//
// Саме розміру, а не товару: у кросівок 39-го може не бути, а 40-й
// лежить на складі. Порожній перелік = або залишки не рахують, або все є.
function soldOutSizes(product, variant) {

    const stock = window.Stock;

    if (!stock || !variant) return [];

    const map = stock.variantStock(product, variant);

    if (!stock.tracked(map)) return [];

    return getVariantSizes(product, variant).filter(size => stock.sizeSoldOut(map, size));

}

function renderProduct(product) {

    // Статистика: перегляд товару. Колір і розмір беремо з адреси —
    // саме в них людина сюди прийшла (з каталогу, з кошика, з поста).
    // Без них у звіті всі кольори злились би в один рядок.
    const seen = new URLSearchParams(location.search);

    window.Analytics?.viewItem(product, {
        color: seen.get("color") || undefined,
        size: seen.get("size") || undefined
    });


    // Активний колір визначаємо ОДРАЗУ, до першого малювання.
    //
    // ЧОМУ САМЕ ТУТ. Колір може перевизначати назву, опис, ціну, стару
    // ціну, позначку й Reels. Крихти і SEO малюються нижче — якби колір
    // визначався після них, заголовок сторінки й og:title лишились би зі
    // значеннями товару, а сама сторінка показувала б значення кольору.
    const variants = product.variants?.length
        ? product.variants
        : [{ color: product.color || "Основний", hex: "#999", images: product.images || [] }];

    // Колір, обраний ще в каталозі, приходить у ?color=... — саме він
    // має бути активним, інакше сторінка щоразу відкривалась на
    // першому кольорі і вибір користувача губився.
    const requestedColor = new URLSearchParams(location.search).get("color");

    const activeIndex = Math.max(findVariantByColor(variants, requestedColor), 0);

    const activeVariant = variants[activeIndex];

    // Товар ДО перевизначень. Потрібен, щоб зібрати вигляд КОЖНОГО
    // кольору для перемикача: накладати колір на вже перевизначені
    // значення означало б змішати два кольори — поля, яких новий колір
    // не задає, лишились би від попереднього.
    const productBase = product;

    // Далі по функції товар показується ОЧИМА активного кольору.
    // Перевизначень немає — applyColorOverrides повертає той самий обʼєкт.
    product = applyColorOverrides(product, activeVariant);

    // «Під замовлення» — теж за активним кольором.
    //
    // Залишки рахуються по кольорах (assets/js/stock.js), і збірка
    // кладе готову відповідь у кожен варіант. Без цього рядка сторінка
    // бежевої сумки, якої не лишилось, обіцяла б доставку за 1–3 дні —
    // бо чорна ще є, і товар ЗАГАЛОМ не «під замовлення».
    if (typeof activeVariant.preOrder === "boolean") {
        product = { ...product, preOrder: activeVariant.preOrder };
    }

    // Рамки кадрування діють на всю сторінку товару — і на великі
    // слайди, і на мініатюри, і після перемикання кольору
    // (updateGalleryForColor малює галерею наново вже без product).
    currentFraming = product.framing || null;

    renderBreadcrumbs(product);

    updateProductSeoMetadata(product);

    const galleryImages = activeVariant.images?.length ? activeVariant.images : (product.images || []);
    const galleryVideo = activeVariant.video || "";

    // data-page-view ставимо ЛИШЕ коли хоч один колір щось перевизначає:
    // інакше атрибут висів би на кожному свотчі й нічого не змінював.
    // Наявність теж їде в data-page-view, тож атрибут потрібен і тоді,
    // коли кольори нічого не перевизначають, але залишки рахуються:
    // інакше перемикання кольору не оновило б ні позначку «під
    // замовлення», ні перекреслені розміри.
    const hasColorViews = variants.some(v => Object.keys(colorOverrides(productBase, v)).length)
        || variants.some(v => soldOutSizes(productBase, v).length || v.preOrder);

    const colorButtons = variants.map((variant, index) => {

        const swatchImage = variant.images?.[0];
        const swatchColor = escapeAttrSingleQuoted(variant.hex || "#999");

        // колір ставимо завжди (навіть коли є фото) — це підкладка:
        // якщо фото свотча не завантажиться (бита посилання),
        // колір все одно буде видно замість порожнього квадрата
        //
        // swatchImage тут проходить через escapeAttrSingleQuoted, а не
        // просто escapeHtml: рядок опиняється одразу в ДВОХ контекстах
        // лапок — усередині style="..." (подвійні) і всередині
        // url('...') (одинарні). Це посилання на файл, завантажений
        // через адмінку/масовий імпорт, тож апостроф чи лапка в назві
        // файлу інакше розірвали б або HTML-атрибут, або CSS url().
        // Кадр застосовуємо і до свотча.
        //
        // Свотч — 40px. Якщо фото знято з великими полями (а таких у
        // каталозі чимало), товар на ньому займає кілька пікселів і
        // виглядає як пляма. Той самий кадр, що на великому фото,
        // робить його видимим — і, головне, свотч показує ТЕ САМЕ, що
        // й галерея, а не інший кадр того ж знімка.
        //
        // Для фону це не transform, а background-size/position — але
        // математика спільна (assets/js/image-framing.js).
        const swatchFrame = swatchImage && window.ImageFraming
            ? window.ImageFraming.frameBackgroundStyle(currentFraming, swatchImage)
            : "";

        const swatchStyle = swatchImage
            ? `background-color:${swatchColor};background-image:url('${escapeAttrSingleQuoted(swatchImage)}');`
              + (swatchFrame || "background-size:cover;background-position:center")
            : `background-color:${swatchColor}`;

        return `
        <button
            class="color ${index === activeIndex ? "active" : ""}"
            data-color="${escapeHtml(variant.color)}"
            data-images='${escapeAttrSingleQuoted(JSON.stringify(variant.images || []))}'
            data-sizes='${escapeAttrSingleQuoted(JSON.stringify(getVariantSizes(product, variant)))}'
            data-out-sizes='${escapeAttrSingleQuoted(JSON.stringify(soldOutSizes(productBase, variant)))}'
            data-sku="${escapeHtml(getVariantArticle(product, variant))}"
            data-supplier-sku="${escapeHtml(getVariantSku(product, variant))}"
            data-video="${escapeHtml(variant.video || "")}"
            ${hasColorViews ? `data-page-view='${escapeAttrSingleQuoted(JSON.stringify(pageColorView(productBase, variant)))}'` : ""}
            title="${escapeHtml(variant.color)}"
            aria-label="Колір: ${escapeHtml(variant.color)}"
            style="${swatchStyle}"></button>
    `;

    }).join("");

    // розміри першого (активного за замовчуванням) кольору;
    // при перемиканні кольору список оновлює common.js
    // Артикул активного (першого) кольору; при перемиканні кольору
    // його оновлює обробник у common.js за data-article.
    //
    // Показуємо артикул КАТАЛОГУ («95-2»), а не заводський код: номер
    // ставить система, тож він є завжди, і саме його покупець назве в
    // замовленні, а власник знайде в адмінці. Заводський код лишається
    // окремим рядком у характеристиках — він потрібен для замовлення в
    // постачальника, але буває порожнім.
    const activeSku = getVariantArticle(product, activeVariant);

    const supplierSku = getVariantSku(product, activeVariant);

    const firstVariantSizes = getVariantSizes(product, activeVariant);
    const sizes = firstVariantSizes.length ? firstVariantSizes : PRODUCT_SIZES;

    // якщо розмір уже був обраний на картці в каталозі —
    // він приходить сюди через ?size= і має лишитися обраним
    const requestedSize = params.get("size");

    // Розміри, яких немає в наявності. Не ховаємо їх: покупець шукає
    // свій розмір і має побачити, що він існує, — просто під
    // замовлення. Схований розмір читається як «такого не буває».
    const outOfStock = new Set(soldOutSizes(productBase, activeVariant));

    const sizeButtons = sizes.map(size => {

        const isActive = sizes.length === 1 || size === requestedSize;
        const isOut = outOfStock.has(size);

        return `
        <button type="button"
                class="size ${isActive ? "active" : ""} ${isOut ? "size-out" : ""}"
                data-size="${escapeHtml(size)}"
                ${isOut ? 'data-out="1" title="Немає в наявності — можна замовити"' : ""}>
            ${size}
        </button>
    `;

    }).join("");

    // Стан наявності КОЛЬОРУ тримаємо на самому контейнері.
    //
    // Далі його читає refreshAvailability(): чи показувати «під
    // замовлення», вирішують дві речі — колір і обраний розмір, — і
    // жодна з них не переживає перемальовку розмітки. Атрибут на
    // елементі переживає: innerHTML міняє вміст, а не сам вузол.
    document.getElementById("productPage").dataset.colorPreorder = product.preOrder ? "1" : "0";

    document.getElementById("productPage").innerHTML = `

<div class="product-wrapper">

    <div class="product-gallery">

    <div class="thumbs-vertical" id="thumbsVertical">

        ${buildThumbsMarkup(galleryImages, galleryVideo, product.title)}

    </div>

    <div class="main-photo">

        ${product.badge ? `<span class="product-badge">${product.badge}</span>` : ""}

        <div class="zoom-container gallery-track" id="mainGalleryTrack">

            ${buildTrackMarkup(galleryImages, galleryVideo, product.title)}

        </div>

        ${galleryImages.length + (galleryVideo ? 1 : 0) > 1 ? `
        <button type="button" class="gallery-arrow gallery-arrow-prev" id="mainGalleryPrev" aria-label="Попереднє фото">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="gallery-arrow gallery-arrow-next" id="mainGalleryNext" aria-label="Наступне фото">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="gallery-dots" id="mainGalleryDots">
            ${buildDotsMarkup(galleryImages, galleryVideo)}
        </div>` : ""}

    </div>

</div>

    <div class="product-info">

        <a class="brand" href="catalog?brand=${encodeURIComponent(product.brand)}">

            ${escapeHtml(product.brand)}

        </a>

        <div class="preorder-tag" ${product.preOrder ? "" : "hidden"}>📦 Під замовлення</div>

        <h1>

            ${escapeHtml(product.title)}

        </h1>

        <!-- Артикул під назвою.
             Тут стояло «Marc Jacobs · 20-1»: бренд і артикул через
             точку. Бренд у цьому рядку був ЗАЙВИЙ — він уже є вище
             окремим посиланням <a class="brand"> над заголовком, тобто
             на сторінці читався двічі підряд. Лишився артикул, і тепер
             з підписом: без нього «20-1» саме по собі нічого не казало.
             Значення оновлює обробник свотча (common.js) за
             data-product-sku — підпис він теж пише. -->
        <div class="product-meta-line">
            <span data-product-sku>${activeSku ? `Артикул: ${escapeHtml(activeSku)}` : ""}</span>
        </div>

        <div class="price-box">

            ${product.oldPrice ? `<span class="old-price">${formatPrice(product.oldPrice)}</span>` : ""}

            <span class="price">

                ${formatPrice(product.price)}

            </span>

        </div>
        <div class="option-group">

    <label>Колір: <span id="selectedColorLabel">${activeVariant.color}</span></label>

    <div class="color-options">

        ${colorButtons}

    </div>

</div>
<div class="option-group">

<div class="size-row-head">
    <label>Розмір</label>
    <button type="button" class="size-guide-link" id="sizeGuideBtn">Таблиця розмірів</button>
</div>

<div class="sizes">

${sizeButtons}

</div>

<div class="size-error" id="sizeError" hidden>Будь ласка, оберіть розмір</div>

</div>

        <!-- Опис тут НЕ дублюємо.
             Той самий текст лежить нижче, у розділі «Опис» серед
             характеристик. Два однакові абзаци на одному екрані
             відсували кнопку «Купити» за межі видимого й виглядали як
             помилка. Розгортайний блок нижче лишається єдиним місцем. -->

        <div class="product-actions">

            <button
                class="btn buy-btn"
                data-id="${product.id}">

                ${product.preOrder ? "📦 Замовити" : "🛒 Купити"}

            </button>

            <button
                class="favorite-btn favorite"
                data-id="${product.id}"
                title="До обраного"
                aria-label="Додати в обране">

                <svg class="favorite-btn-icon" viewBox="0 0 24 24">
                    <path d="M12 21s-6.7-4.4-9.3-8.3C.9 9.6 1.7 5.9 5.1 4.9c2-.6 4 .2 5.2 1.9l1.7 2.3 1.7-2.3c1.2-1.7 3.2-2.5 5.2-1.9 3.4 1 4.2 4.7 2.4 7.8C18.7 16.6 12 21 12 21z"/>
                </svg>

                <span class="favorite-indicator">
                    <svg viewBox="0 0 24 24">
                        <path d="M12 21s-6.7-4.4-9.3-8.3C.9 9.6 1.7 5.9 5.1 4.9c2-.6 4 .2 5.2 1.9l1.7 2.3 1.7-2.3c1.2-1.7 3.2-2.5 5.2-1.9 3.4 1 4.2 4.7 2.4 7.8C18.7 16.6 12 21 12 21z"/>
                    </svg>
                </span>

            </button>

        </div>

        <div class="preorder-box" ${product.preOrder ? "" : "hidden"}>

            <div class="preorder-box-title">📦 Цей товар під замовлення</div>

            <p>
                ${
                    product.preOrderNote
                        ? product.preOrderNote
                        : `Термін виготовлення та доставки: ${product.preOrderDays || "уточнюється у менеджера"}.` +
                          (product.preOrderPrepayment
                              ? ` Потрібна передоплата ${product.preOrderPrepayment}% вартості — після оформлення з вами зв'яжеться менеджер.`
                              : "")
                }
            </p>

        </div>

        <div class="delivery-box" ${product.preOrder ? "hidden" : ""}>

            <div>🚚 Доставка по Україні 1–3 дні</div>

            <div>💳 Оплата при отриманні або онлайн</div>

            <div>↩️ Повернення протягом 14 днів</div>

        </div>

        <div class="specifications" id="productSpecifications">

            ${activeSku ? `
            <div class="spec-block accordion-item">
                <button type="button" class="spec-block-header">
                    <h3>Артикул</h3>
                    <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="spec-block-content">
                    <div class="spec-block-inner">
                        <p class="spec-plain" data-spec-sku>${escapeHtml(activeSku)}</p>
                        ${supplierSku ? `
                        <p class="spec-plain spec-supplier-sku" data-spec-supplier-sku>Код виробника: ${escapeHtml(supplierSku)}</p>` : ""}
                    </div>
                </div>
            </div>` : ""}

            <div class="spec-block accordion-item open">

                <button type="button" class="spec-block-header">
                    <h3>Інформація про товар</h3>
                    <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>

                <div class="spec-block-content">
                <div class="spec-block-inner">

                <div class="spec-row" id="specColorRow">
                    <span>Колір</span>
                    <strong id="specColorValue">${activeVariant.color}</strong>
                </div>

                ${product.closure ? `
                <div class="spec-row">
                    <span>Застібка</span>
                    <strong>${escapeHtml(product.closure)}</strong>
                </div>` : ""}

                ${product.decor ? `
                <div class="spec-row">
                    <span>Декор</span>
                    <strong>${escapeHtml(product.decor)}</strong>
                </div>` : ""}

                ${product.dimensions ? `
                <div class="spec-row">
                    <span>Розмір</span>
                    <strong>${escapeHtml(product.dimensions)}</strong>
                </div>` : ""}

                ${product.strapInfo ? `<p class="spec-plain">${escapeHtml(product.strapInfo)}</p>` : ""}

                ${product.compartments ? `
                <div class="spec-row">
                    <span>Відділення / кишені (зовнішні)</span>
                    <strong>${escapeHtml(product.compartments)}</strong>
                </div>` : ""}

                ${product.material ? `
                <div class="spec-row">
                    <span>Матеріал</span>
                    <strong>${escapeHtml(product.material)}</strong>
                </div>` : ""}

                <div class="spec-row">
                    <span>Бренд</span>
                    <strong>${escapeHtml(product.brand)}</strong>
                </div>

                <div class="spec-row">
                    <span>Стать</span>
                    <strong>${escapeHtml(getProductGenderLabel(product))}</strong>
                </div>

                ${product.country ? `
                <div class="spec-row">
                    <span>Країна</span>
                    <strong>${escapeHtml(product.country)}</strong>
                </div>` : ""}

                </div>

                </div>

            </div>

            ${product.composition ? `
            <div class="spec-block accordion-item">
                <button type="button" class="spec-block-header">
                    <h3>Склад</h3>
                    <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="spec-block-content">
                    <div class="spec-block-inner">
                        <div class="spec-row">
                            <span>Склад</span>
                            <strong>${escapeHtml(product.composition)}</strong>
                        </div>
                    </div>
                </div>
            </div>` : ""}

            <div class="spec-block accordion-item">
                <button type="button" class="spec-block-header">
                    <h3>Опис</h3>
                    <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="spec-block-content">
                    <div class="spec-block-inner">
                        <p class="spec-plain" data-product-description>${product.description || "Стильна сумка преміальної якості. Підходить для щоденного використання та чудово поєднується з будь-яким образом."}</p>
                    </div>
                </div>
            </div>

        </div>

    </div>

</div>

<div class="mobile-sticky-cart" id="mobileStickyCart">

    <button
        class="btn buy-btn"
        data-id="${product.id}">

        🛒 Додати в кошик

    </button>

</div>

`;

    document.querySelectorAll(".spec-block-header").forEach(header => {

        header.addEventListener("click", () => {

            header.closest(".accordion-item")?.classList.toggle("open");

        });

    });

    setupGallery();
    setupMobileStickyCart();

    // Розміри слухаємо ДЕЛЕГОВАНО, а не навішуємо обробник на кожну
    // кнопку. Причина: при зміні кольору список розмірів
    // перемальовується (у різних кольорів вони різні — див. common.js),
    // старі кнопки зникають разом зі слухачами, і розмір переставав
    // вибиратись, доки не перезавантажиш сторінку.
    // Прапорець потрібен, бо ця функція виконується на кожен рендер,
    // а слухач має бути один.
    if (!document.body.dataset.sizeClickBound) {

        document.body.dataset.sizeClickBound = "1";

        document.addEventListener("click", event => {

            const button = event.target.closest(".size");

            if (!button || !button.closest("#productPage")) return;

            document.querySelectorAll("#productPage .size")
                .forEach(item => item.classList.remove("active"));

            button.classList.add("active");

            updateFavoriteButtons();

            button.closest(".sizes, .product-sizes")?.classList.remove("size-shake");

            const errorEl = document.getElementById("sizeError");

            if (errorEl) errorEl.hidden = true;

            // Обрали розмір, якого немає — сторінка переходить у «під
            // замовлення»: позначка, текст кнопки й умови.
            refreshAvailability();

        });

    }

    setupSizeGuideModal();
    renderSizeGuide(product);
    renderProductInstagram(product);

}

// -------------------------
// Модалка "Таблиця розмірів"
// -------------------------

// -------------------------
// Блок Instagram під товаром
//
// Режим задається в адмінці для кожного товару:
//   reels   — Reels саме цього товару
//   general — звичайна реклама акаунту (текст і посилання спільні
//             з головною, з data/home.json — щоб не дублювати
//             налаштування у двох місцях)
//   none    — не показувати
//
// За замовчуванням (поле не заповнене у старих товарах) — general,
// як і на головній.
// -------------------------

async function renderProductInstagram(product) {

    const section = document.getElementById("productInstagram");

    if (!section) return;

    const mode = product.instagramBlock || "general";

    if (mode === "none") {

        section.hidden = true;

        return;

    }

    const titleEl = document.getElementById("productInstagramTitle");
    const textEl = document.getElementById("productInstagramText");
    const btnEl = document.getElementById("productInstagramBtn");

    const reels = (product.instagramReels || "").trim();

    // Обрали Reels, але посилання не вказали — не ховаємо блок і не
    // ведемо в нікуди, а показуємо звичайну рекламу акаунту.
    if (mode === "reels" && reels) {

        titleEl.textContent = "Цей товар у Reels";
        textEl.textContent = "Подивіться, який він у русі — коротке відео в Instagram.";
        btnEl.textContent = "Дивитися Reels";
        btnEl.href = reels;

        section.hidden = false;

        return;

    }

    // спільні налаштування з головної
    let instagram = null;

    try {

        const response = await fetch(dataUrl("data/home.json"));

        if (response.ok) instagram = (await response.json()).instagram;

    } catch (error) {

        // немає файлу — нижче підставляться запасні тексти

    }

    titleEl.textContent = instagram?.title || "Стежте за нами в Instagram";
    textEl.textContent = instagram?.text || "Нові колекції, образи та акції — щодня у нашому акаунті.";
    btnEl.textContent = instagram?.buttonText || "Підписатися";
    btnEl.href = instagram?.link || "https://www.instagram.com/bestbrnd4u";

    section.hidden = false;

}

// Наповнює таблицю розмірів під групу, до якої належить категорія
// товару: у сумок свої стовпці, у взуття — свої. Дані з адмінки
// (розділ «Розміри»). Якщо для групи таблиця не заповнена —
// посилання «Таблиця розмірів» ховаємо, щоб не відкривати порожнє
// вікно.
async function renderSizeGuide(product) {

    const body = document.getElementById("sizeGuideBody");
    const openBtn = document.getElementById("sizeGuideBtn");

    if (!body) return;

    const [groups, categoryDepartments] = await Promise.all([
        loadSizeGroups(),
        loadCategoryTree()
    ]);

    const group = findSizeGroupForCategory(groups, product.category, categoryDepartments);

    if (!group || !group.guideNote || group.guideRows.length === 0) {

        body.innerHTML = "";

        if (openBtn) openBtn.hidden = true;

        return;

    }

    if (openBtn) openBtn.hidden = false;

    body.innerHTML = `
        <p class="modal-text">${escapeHtml(group.guideNote)}</p>
        <table class="size-guide-table">
            <thead>
                <tr>
                    <th>Розмір</th>
                    ${group.guideColumns.map(column => `<th>${escapeHtml(column)}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
                ${group.guideRows.map(row => `
                    <tr>
                        <td>${escapeHtml(row.size)}</td>
                        ${group.guideColumns.map((column, index) =>
                            `<td>${escapeHtml((row.values || [])[index] || "—")}</td>`
                        ).join("")}
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;

}

function setupSizeGuideModal() {

    const openBtn = document.getElementById("sizeGuideBtn");
    const modal = document.getElementById("sizeGuideModal");
    const closeBtn = document.getElementById("sizeGuideClose");

    if (!openBtn || !modal || modal.dataset.bound) return;

    modal.dataset.bound = "1";

    openBtn.addEventListener("click", () => {

        modal.hidden = false;

    });

    closeBtn?.addEventListener("click", () => {

        modal.hidden = true;

    });

    modal.addEventListener("click", event => {

        if (event.target === modal) modal.hidden = true;

    });

}

// -------------------------
// Галерея товару: свайп-карусель головного фото
// (scroll-snap) синхронізована з крапками-індикаторами
// та вертикальними мініатюрами
// -------------------------

// -------------------------
// Мобільна закріплена панель "Додати в кошик" — з'являється
// знизу екрана, коли основна кнопка "Купити" йде за межі
// екрана вгору (як на md-fashion.ua)
// -------------------------

function setupMobileStickyCart() {

    const mainBuyBtn = document.querySelector(".product-actions .buy-btn");
    const stickyBar = document.getElementById("mobileStickyCart");

    if (!mainBuyBtn || !stickyBar || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(([entry]) => {

        const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;

        stickyBar.classList.toggle("show", scrolledPast);

    }, { threshold: 0 });

    observer.observe(mainBuyBtn);

}

// Тап по відео в галереї: пауза ↔ продовження.
//
// ЧОМУ ОКРЕМА ФУНКЦІЯ, А НЕ ДВА РЯДКИ НА МІСЦІ
// ---------------------------------------------
// Її викликають із двох місць — клік мишею/пальцем і Пробіл/Enter із
// клавіатури, — і обидва мусять однаково виставляти позначку
// userPaused. Розійдуться — і пауза з клавіатури проживе до першого
// скролу (див. syncActiveState).
//
// currentTime тут не чіпається НІДЕ: у цьому й суть — продовжуємо з
// того місця, де зупинили.
function toggleGalleryVideo(video) {

    if (video.paused) {

        delete video.dataset.userPaused;

        video.play().catch(() => {});

    } else {

        video.dataset.userPaused = "1";

        video.pause();

    }

}

function setupGallery() {

    const track = document.getElementById("mainGalleryTrack");
    const dotsWrap = document.getElementById("mainGalleryDots");
    const thumbsVertical = document.getElementById("thumbsVertical");

    if (!track) return;

    // Блокуємо drag'а картинок для Safari/iOS
    // .gallery-photo, а не .gallery-slide: слайд тепер — обгортка, яка
    // обрізає масштабоване фото (див. коментар у style.css).
    document.querySelectorAll(".gallery-photo").forEach(img => {
        img.draggable = false;
        img.ondragstart = () => false;
    });

    function goToSlide(index) {

        const slide = track.children[index];

        if (slide) track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });

    }

    function currentSlideIndex() {

        let closest = 0;
        let minDiff = Infinity;

        [...track.children].forEach((slide, index) => {

            const diff = Math.abs(slide.offsetLeft - track.scrollLeft);

            if (diff < minDiff) {
                minDiff = diff;
                closest = index;
            }

        });

        return closest;

    }

    function syncActiveState() {

        const index = currentSlideIndex();

        dotsWrap?.querySelectorAll(".gallery-dot").forEach((dot, i) => {

            dot.classList.toggle("active", i === index);

            // не лише підсвітка: зчитувач екрана має розуміти, яке фото
            // показане зараз
            if (i === index) dot.setAttribute("aria-current", "true");
            else dot.removeAttribute("aria-current");

        });

        thumbsVertical?.querySelectorAll(".thumb").forEach((thumb, i) => {
            thumb.classList.toggle("active", i === index);
        });

        // відео (файлове, не YouTube/Vimeo вбудовування) — програємо
        // лише той слайд, до якого долистали свайпом/скролом, і
        // одразу ставимо на паузу решту. slide.paused перевіряємо,
        // щоб не перемотувати на початок відео, яке й так вже грає
        // (наприклад, повторний виклик під час одного й того ж
        // перегляду) — тільки при свіжому поверненні на цей слайд
        [...track.children].forEach((slide, i) => {

            if (slide.tagName !== "VIDEO") return;

            if (i === index) {

                // Людина сама зупинила відео тапом — не чіпаємо.
                //
                // Без цієї перевірки пауза жила б долі секунди:
                // syncActiveState викликається на кожен скрол треку,
                // і найближчий же виклик перемотав би відео на нуль і
                // запустив знову. Тобто кнопки паузи ніби й немає.
                if (slide.dataset.userPaused) return;

                if (slide.paused) slide.currentTime = 0;

                slide.play().catch(() => {});

            } else {

                // Пішли з цього слайда — знімаємо позначку ручної
                // паузи. Повернувшись, людина очікує знову побачити
                // «живе фото», а не завмерлий кадр, який вона
                // зупинила три слайди тому.
                delete slide.dataset.userPaused;

                slide.pause();

            }

        });

    }

    let scrollTimer = null;

    syncActiveState();

    track.addEventListener("scroll", () => {

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(syncActiveState, 80);

    }, { passive: true });

    dotsWrap?.querySelectorAll(".gallery-dot").forEach((dot, index) => {
        dot.addEventListener("click", () => goToSlide(index));
    });

    // Стрілки. Гортають по колу: з останнього фото вперед — на перше.
    // Дійшовши до краю, людина частіше хоче подивитись ще раз, ніж
    // упертись у мертву кнопку, а вимкнена стрілка на трьох фото
    // виглядає як поломка.
    const slidesCount = () => track.children.length;

    function step(delta) {

        const total = slidesCount();

        if (!total) return;

        goToSlide((currentSlideIndex() + delta + total) % total);

    }

    const prevBtn = document.getElementById("mainGalleryPrev");
    const nextBtn = document.getElementById("mainGalleryNext");
    const photoBox = track.closest(".main-photo");

    // Крапки при зміні кольору перемальовуються, а кнопки стрілок — ні:
    // вони лежать поза контейнером крапок. setupGallery() після кожної
    // зміни кольору викликається наново, тож без цієї позначки на ту
    // саму кнопку навісився б другий обробник, і галерея гортала б
    // через одне фото. Той самий прийом уже застосований нижче для
    // тач-жестів (track.dataset.touchBound).
    if (photoBox && !photoBox.dataset.arrowsBound) {

        photoBox.dataset.arrowsBound = "1";

        prevBtn?.addEventListener("click", () => step(-1));
        nextBtn?.addEventListener("click", () => step(1));

        // Стрілки на клавіатурі — лише коли фокус усередині галереї.
        // На всю сторінку вішати не можна: стрілками гортають саму
        // сторінку, і галерея забирала б це в людини.
        photoBox.addEventListener("keydown", event => {

            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

            event.preventDefault();

            step(event.key === "ArrowLeft" ? -1 : 1);

        });

    }

    // У різних кольорів буває різна кількість фото. На одному
    // гортати нема чого — ховаємо стрілки, інакше вони виглядали б
    // як зламані.
    const single = slidesCount() < 2;

    [prevBtn, nextBtn].forEach(btn => { if (btn) btn.hidden = single; });

    thumbsVertical?.querySelectorAll(".thumb").forEach((thumb, index) => {

        thumb.addEventListener("click", () => goToSlide(index));

    });

    window.addEventListener("resize", () => goToSlide(currentSlideIndex()));

    if (!track.dataset.touchBound) {

        track.dataset.touchBound = "1";

        let startX = 0;
        let startY = 0;
        let startScrollLeft = 0;
        let startTime = 0;
        let axis = null; // null поки не визначено, "x" або "y"

        track.addEventListener("touchstart", event => {

            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
            startScrollLeft = track.scrollLeft;
            startTime = Date.now();
            axis = null;

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
                // scroll-snap — інакше браузер тягне позицію до
                // найближчого фото на кожному touchmove, і замість
                // плавного руху за пальцем виходить залипання
                // з різким стрибком в кінці
                if (axis === "x") track.style.scrollSnapType = "none";

            }

            if (axis === "y") return; // вертикаль — віддаємо жест сторінці

            // горизонталь — гортаємо фото самі, забороняючи
            // браузеру одночасно намагатись скролити сторінку
            event.preventDefault();

            track.scrollLeft = startScrollLeft - dx;

        }, { passive: false });

        track.addEventListener("touchend", () => {

            if (axis !== "x") return;

            const width = track.clientWidth || 1;
            const baseIndex = Math.round(startScrollLeft / width);

            // фактичний зсув треку (додатній — свайп вліво, до наступного фото)
            const dx = track.scrollLeft - startScrollLeft;
            const elapsed = Math.max(Date.now() - startTime, 1);
            const velocity = Math.abs(dx) / elapsed; // px/мс

            // легкий свайп: досить невеликої відстані (12% ширини)
            // АБО швидкого короткого флiку — не треба тягнути картинку
            // до половини екрана, щоб вона перемкнулась
            const distanceThreshold = width * 0.12;
            const velocityThreshold = 0.3;

            let index = baseIndex;

            if (Math.abs(dx) > distanceThreshold || velocity > velocityThreshold) {
                index = baseIndex + (dx > 0 ? 1 : -1);
            }

            index = Math.max(0, Math.min(index, track.children.length - 1));

            track.scrollTo({ left: index * width, behavior: "smooth" });

            // повертаємо snap назад вже після того, як доїхали
            setTimeout(() => { track.style.scrollSnapType = ""; }, 400);

        });

        track.addEventListener("touchcancel", () => {

            track.style.scrollSnapType = "";

        });

        // Пауза з клавіатури.
        //
        // Смуги керування в галереї немає, а рухома картинка без
        // способу її зупинити — це WCAG 2.2.2. Тому відео у фокусі
        // слухає Пробіл і Enter, як звичайна кнопка (role="button"
        // на ньому вже стоїть).
        //
        // preventDefault обовʼязковий: Пробіл за замовчуванням гортає
        // сторінку, і галерея поїхала б з-під людини.
        track.addEventListener("keydown", event => {

            if (event.key !== " " && event.key !== "Enter") return;

            const video = event.target.closest?.("video.gallery-slide-video");

            if (!video) return;

            event.preventDefault();

            toggleGalleryVideo(video);

        });

        // Контекстне меню браузера на <video> пропонує «Показати
        // елементи керування» й «Зберегти відео» — тобто рівно те, що
        // ми щойно прибрали. Поруч фотографії, у яких перетягування
        // теж вимкнене, тож поводимось однаково.
        track.addEventListener("contextmenu", event => {

            if (event.target.closest("video.gallery-slide-video")) event.preventDefault();

        });

        // клік/тап по фото — відкриваємо повноекранний перегляд
        // з зумом (не спрацьовує, якщо це був свайп)
        track.addEventListener("click", event => {

            if (axis === "x") return;

            // Тап по відео керує відтворенням, а не відкриває лайтбокс.
            //
            // Смуги керування в галереї немає навмисно (див.
            // buildTrackMarkup), тож пауза тримається саме на цьому
            // тапі — і тільки на ньому. Повторний тап продовжує з того
            // ж місця: currentTime не чіпаємо взагалі.
            const video = event.target.closest("video");

            if (video) { toggleGalleryVideo(video); return; }

            // iframe (YouTube/Vimeo) має власний плеєр усередині —
            // клік туди наш, а не його.
            if (event.target.closest("iframe")) return;

            if (typeof window.openLightbox !== "function") return;

            const slides = [...track.children];
            const activeIndex = currentSlideIndex();
            const activeSlide = slides[activeIndex];

            // Лайтбокс тепер показує і відео, тож передаємо ВСІ слайди
            // галереї, а не лише фото — інакше на відео зум просто
            // не відкривався, і воно «зникало» з повноекранного
            // перегляду.
            const lightboxSlides = slides.map(slide => {

                if (slide.tagName === "VIDEO") {

                    return {
                        type: "video",
                        src: slide.getAttribute("src"),
                        poster: slide.getAttribute("poster") || ""
                    };

                }

                if (slide.classList.contains("gallery-slide-embed")) {

                    return { type: "embed", src: slide.querySelector("iframe")?.getAttribute("src") };

                }

                // Слайд-фото тепер обгортка, а не сам <img>: масштаб
                // кадрування мусить обрізатися по межах слайда, інакше
                // збільшене фото накриває сусідні (див. коментар до
                // .gallery-slide-photo у style.css).
                //
                // Тому адресу беремо з вкладеного зображення, а не з
                // самого слайда — у <div> немає src, і фото просто
                // зникло б із повноекранного перегляду.
                const photo = slide.tagName === "IMG"
                    ? slide
                    : slide.querySelector("img");

                return { type: "image", src: photo && photo.src };

            }).filter(slide => slide.src);

            const currentImages = lightboxSlides;
            const startIndex = Math.max(0, Math.min(activeIndex, lightboxSlides.length - 1));

            const brand = document.querySelector(".product-info .brand")?.textContent.trim();
            const title = document.querySelector(".product-info h1")?.textContent.trim();

            window.openLightbox(currentImages, startIndex, { brand, title });

        });

    }

}

// Викликається з common.js при кліку на колір на сторінці товару —
// повністю перебудовує галерею (мініатюри + головне фото) під
// фотографії обраного кольору.
function updateGalleryForColor(images, video) {

    if (!images || !images.length) return;

    const thumbsVertical = document.getElementById("thumbsVertical");
    const track = document.getElementById("mainGalleryTrack");
    const dotsWrap = document.getElementById("mainGalleryDots");

    if (!thumbsVertical || !track) return;

    const altText = document.querySelector(".product-info h1")?.textContent.trim() || "";

    thumbsVertical.innerHTML = buildThumbsMarkup(images, video, altText);

    track.innerHTML = buildTrackMarkup(images, video, altText);

    track.scrollLeft = 0;

    if (dotsWrap) {
        dotsWrap.innerHTML = buildDotsMarkup(images, video);
    }

    setupGallery();

    // синхронізуємо назву кольору в характеристиках товару
    // і в підписі над мініатюрами ("Колір: ...")
    const colorLabel = document.querySelector(".color.active")?.dataset.color;
    const specColorValue = document.getElementById("specColorValue");
    const selectedColorLabel = document.getElementById("selectedColorLabel");

    if (colorLabel && specColorValue) specColorValue.textContent = colorLabel;
    if (colorLabel && selectedColorLabel) selectedColorLabel.textContent = colorLabel;

}

function renderSimilar(product){

    const others = products.filter(item => item.id !== product.id);

    // спочатку товари тієї ж категорії, потім — тієї ж статі,
    // і лише як останній варіант — будь-які інші, щоб блок
    // не був порожнім навіть для рідкісних категорій
    const sameCategory = others.filter(item => item.category === product.category);
    const sameGender = others.filter(item =>
        getProductGenders(item).some(g => getProductGenders(product).includes(g)) && item.category !== product.category
    );
    const rest = others.filter(item =>
        item.category !== product.category && !getProductGenders(item).some(g => getProductGenders(product).includes(g))
    );

    const list = [...sameCategory, ...sameGender, ...rest].slice(0, 4);

const container=document.getElementById("similarProducts");

container.innerHTML="";

list.forEach(item=>{

container.innerHTML+=createProductCard(item);

});

updateFavoriteButtons();

initProductCarousels(container);

initCarousel(document.getElementById("similarCarousel"));

}

init();
