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

        const [promoRes, products, categoryDepartments, departmentOf] = await Promise.all([
            fetch(dataUrl("data/promotions.json")),
            loadCatalog(),
            loadCategoryDepartments(),
            // «категорія → розділ»: щоб розгорнути розділ, указаний в
            // автопідхопленні акції, у перелік його категорій
            loadDepartmentOf()
        ]);

        if (!promoRes.ok) {
            throw new Error("Не вдалося завантажити дані");
        }

        const promotions = await promoRes.json();
        const allProducts = products;

        const list = Array.isArray(promotions) ? promotions : [];

        // Спершу за поточною адресою, потім — за старими.
        //
        // НАВІЩО ДРУГА СПРОБА. Адреси акцій перекладено з кирилиці на
        // латиницю (див. scripts/translit.js), а посилання на стару вже
        // пішли в пости й сторіс. Без цього рядка кожне з них
        // показувало б «акцію не знайдено» — на сторінці, яка
        // насправді існує.
        const promo = list.find(p => p.slug === slug)
            || list.find(p => Array.isArray(p.legacySlugs) && p.legacySlugs.includes(slug))
            || null;

        loader.hidden = true;

        // Завершена акція поводиться як неіснуюча — і текст у блоці
        // «не знайдено» це вже передбачає слово в слово: «Цю акцію не
        // знайдено або її вже завершено».
        //
        // Окремий стан тут був би гіршим: на сторінці, де все одно
        // нічого не купиш, різниця між «не було» і «скінчилось»
        // покупцю нічого не дає, а посилання в каталог дає.
        if (!promo || !promoVisible(promo)) {
            showPromoNotFound();
            return;
        }

        // Прийшли за старою адресою — тихо міняємо її на канонічну.
        //
        // replaceState, а не редирект: сторінка вже намальована, і
        // перезавантажувати її заради адреси означало б зайве
        // мигання. У історії лишається один запис, тож «назад»
        // повертає туди, звідки прийшли, а не по колу.
        if (promo.slug !== slug) {

            const canonical = `${location.pathname}?id=${encodeURIComponent(promo.slug)}`;

            history.replaceState(null, "", canonical + location.hash);

        }

        renderPromoHero(promo);
        setupPromoCatalog(promo, allProducts, categoryDepartments, departmentOf);

    } catch (error) {

        console.error("Не вдалося завантажити акцію:", error);

        loader.hidden = true;

        showPromoNotFound();

    }

}

function showPromoNotFound() {

    document.getElementById("promoNotFound").hidden = false;

}

// Відлік на сторінці акції.
//
// ЧОМУ ТАЙМЕР ПЕРЕРАХОВУЄ СТАН, А НЕ ПРОСТО ЦИФРУ
// ------------------------------------------------
// Сторінку можуть відкрити за хвилину до опівночі й дивитись, як
// відлік добігає нуля. Якби ми лише зменшували число, о 00:00
// покупець побачив би «почнеться через 00:00» і нічого більше.
// Тому на кожному кроці питаємо стан заново: анонс сам стає
// «лишилось», а кінець — ховає відлік і перезавантажує сторінку, щоб
// зникли ціни зі знижкою.
//
// ПЕРЕЗАВАНТАЖЕННЯ ЛИШЕ В КІНЦІ І ЛИШЕ ОДИН РАЗ. Смикати сторінку під
// читачем неввічливо, але показувати перекреслені ціни акції, яка вже
// скінчилась, — гірше: це вже не оформлення, а неправдива ціна.
function startPromoCountdown(promo) {

    const box = document.getElementById("promoCountdown");
    const labelEl = document.getElementById("promoCountdownLabel");
    const valueEl = document.getElementById("promoCountdownValue");

    if (!box || !labelEl || !valueEl) return;

    // Вимкнений в адмінці — блок не показуємо й годинник не заводимо.
    //
    // ЯВНИЙ false, а не «немає поля»: акції, створені до появи
    // перемикача, поля не мають — і мусять показувати відлік, як
    // показували.
    if (promo.showCountdown === false) {
        box.hidden = true;
        return;
    }

    let timer = null;

    // Стан, у якому сторінку намалювали. Усе інше на ній — ціни зі
    // знижкою, набір товарів — зібране саме під нього.
    const drawnState = promoTiming(promo).state;

    function draw() {

        const timing = promoTiming(promo);

        // СТАН ЗМІНИВСЯ ПРЯМО ПІД ЧИТАЧЕМ — перемальовуємо сторінку.
        //
        // Обидва переходи важать, і обидва міняють не лише напис:
        //
        //   анонс → іде   з'являються перекреслені старі ціни
        //   іде → кінець  акції більше немає, ціни зі знижкою стають
        //                 неправдою
        //
        // Підмінити тут самі лише цифри означало б лишити сторінку в
        // стані, якого вже немає. Смикати читача неввічливо, але
        // показувати неправдиву ціну — гірше. Трапляється це щонайбільше
        // двічі за життя сторінки, рівно на межі.
        if (timing.state !== drawnState) {

            if (timer) clearTimeout(timer);

            location.reload();

            return;

        }

        // Немає до чого відлічувати — акція без дат або без кінця.
        // Ховаємо блок і зупиняємось: мінятись нема чому.
        if (!timing.until) {
            box.hidden = true;
            return;
        }

        labelEl.textContent = timing.state === "announced" ? "Почнеться через" : "Лишилось";
        valueEl.textContent = promoCountdown(timing.until);

        box.dataset.state = timing.state;
        box.hidden = false;

        timer = setTimeout(draw, promoTickMs(timing.until));

    }

    draw();

}

function updatePromoSeoMetadata(promo) {

    // slug може містити кирилицю — canonical/og:url мають бути
    // закодованими, інакше адреса в мета-тегах не збігається з тією,
    // за якою реально відкрита сторінка
    const pageUrl = `${SITE_URL}/promo?id=${encodeURIComponent(promo.slug)}`;

    const title = `${promoHeading(promo)} | BestBrnd4u`;

    const description = truncateForMeta(promo.text
        || `${promoHeading(promo)} в інтернет-магазині BestBrnd4u`);

    setMetaByName("description", description);

    setCanonical(pageUrl);

    setMetaByProperty("og:type", "website");
    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", description);
    // теж від широкого банера цієї сторінки, а не від тизера з
    // головної — саме таке фото соцмережі покажуть у прев'ю посилання
    setMetaByProperty("og:image", absoluteUrl(promo.promoPageImage || promo.image));
    setMetaByProperty("og:url", pageUrl);

}

// НАЗВА АКЦІЇ СЛОВАМИ — НЕ ТЕ САМЕ, ЩО НАПИС НА БАНЕРІ.
//
// Напис на банері можна прибрати: він часто вже намальований на
// самому фото. Але вкладка браузера, хлібні крихти й рядок у видачі
// Google порожніми бути не можуть — там зʼявилось би « | BestBrnd4u»
// і «Акція  в інтернет-магазині».
//
// Тому беремо перше, що є: заголовок, опис, бренд — і лише потім
// безлике слово «Акція».
function promoHeading(promo) {

    return [promo && promo.title, promo && promo.text, promo && promo.brand]
        .map(value => String(value || "").trim())
        .find(Boolean) || "Акція";

}

function renderPromoHero(promo) {

    document.getElementById("pageTitle").textContent = `${promoHeading(promo)} | BestBrnd4u`;
    document.getElementById("breadcrumbTitle").textContent = promoHeading(promo);

    updatePromoSeoMetadata(promo);

    const heroSection = document.getElementById("promoHero");
    const banner = document.getElementById("promoHeroBanner");
    const badgeEl = document.getElementById("promoHeroBadge");
    const titleEl = document.getElementById("promoHeroTitle");
    const textEl = document.getElementById("promoHeroText");
    const linkEl = document.getElementById("promoHeroLink");
    const linkTextEl = document.getElementById("promoHeroLinkText");

    // ЩО МИ ВЗАГАЛІ ПИШЕМО ПОВЕРХ ФОТО.
    //
    // Коли весь напис уже намальований на самій картинці, кожен
    // елемент згори — завада: заголовок лягає на заголовок, кнопка
    // закриває товар. Тому всі чотири прибираються порожнім полем, а
    // таймер — перемикачем.
    const hasBadge = Boolean(promo.badge);
    const hasTitle = Boolean(promo.title);
    const hasText = Boolean(promo.text);
    const hasButton = Boolean(promo.buttonText);
    const hasTimer = promo.showCountdown !== false && Boolean(promoTiming(promo).until);

    const hasOverlay = hasBadge || hasTitle || hasText || hasButton || hasTimer;

    // Темна заливка існує рівно заради читабельності білого тексту.
    // Немає тексту — немає й причини приглушувати фото на 55%: воно
    // для того й завантажене, щоб його було видно.
    const overlay = hasOverlay
        ? "linear-gradient(rgba(17,24,39,.55), rgba(17,24,39,.55))"
        : "";

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

    const layered = src => (overlay ? `${overlay}, url('${src}')` : `url('${src}')`);

    banner.style.setProperty("--banner-img-desktop", layered(desktopImage));
    banner.style.setProperty("--banner-img-mobile", layered(mobileImage));

    // Куди покласти напис. Порожнє поле — «ліворуч посередині», саме
    // так малювались усі акції до появи вибору.
    banner.dataset.layout = promo.bannerLayout || "left-middle";

    // Порожній банер не тримає висоту сам: у ньому немає вмісту, а
    // фото — фон. Без цього прапорця смуга схлопнулась би в нуль.
    banner.classList.toggle("promo-hero-bare", !hasOverlay);

    if (promo.badge) {
        badgeEl.textContent = promo.badge;
        badgeEl.hidden = false;
    }

    startPromoCountdown(promo);

    // Порожній заголовок — не пишемо нічого. Раніше сюди йшов
    // undefined і на банері зʼявлявся порожній h1 заввишки в рядок.
    titleEl.hidden = !hasTitle;

    if (hasTitle) titleEl.textContent = promo.title;

    if (hasText) {
        textEl.textContent = promo.text;
        textEl.hidden = false;
    }

    // Кнопки немає, поки немає напису на ній. Окремого перемикача не
    // робимо: кнопка без тексту й так не кнопка.
    linkEl.hidden = !hasButton;

    if (hasButton) {
        linkTextEl.textContent = promo.buttonText;
        linkEl.href = promo.link || `catalog`;
    }

    heroSection.hidden = false;

}

// -------------------------
// Підставляємо товари цієї акції у спільний движок фільтрів
// каталогу (catalog.js) і запускаємо ті самі функції, якими
// зазвичай керує initCatalog() на сторінці каталогу
// -------------------------

function setupPromoCatalog(promo, allProducts, categoryDepartments, departmentOf) {

    // без цього виклику фільтр за статтю в URL (?gender=...) ігнорувався б:
    // saveGenderFilter/selectedGenders в catalog.js заповнюються лише тут
    readUrlState();

    // Правило набору — спільне з головною (promotionCards у
    // common.js). Доки воно жило тут окремо, сторінка акції віддавала
    // товари в порядку каталогу, а головна — у порядку, у якому їх
    // перетягнув адмін.
    //
    // promotionCards, а не promotionProducts: у ту саму функцію
    // входить і розгортання по кольорах, яким акція виглядає
    // заповненою, — рівно як каталог. Вимикається прапорцем «Кожен
    // колір — окрема картка» в самій акції.
    let curated = promotionCards(promo, allProducts, departmentOf);

    // якщо для товару не задана власна знижка (oldPrice), але в акції
    // є відсоток за замовчуванням — рахуємо "стару" ціну лише для показу
    // на цій сторінці, сам товар у каталозі це не змінює
    curated = curated.map(product => {

        // promoDiscountActive, а не просто discountPercent: в
        // АНОНСОВАНІЙ акції знижки ще немає, і перекреслена стара ціна
        // за тиждень до початку — це обіцянка, видана за факт.
        // Покупець, який прийде по ній сьогодні, заплатить повну.
        // oldPriceNow, а не product.oldPrice: поки йде ціна дня,
        // перекреслювати вже є що (звичайну ціну товару), і другий
        // «старий» цінник поверх неї був би вигаданим.
        if (oldPriceNow(product) || !promoDiscountActive(promo)) return product;

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
