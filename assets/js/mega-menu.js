// ======================================
// mega-menu.js
// Наповнює випадаючі меню в шапці — «Каталог», «Новинки», «Акції» —
// колонками за статтю (Жінкам / Чоловікам / Унісекс / Дітям), де під
// кожною статтю перелічені категорії, у яких реально є товари, плюс
// окрема колонка брендів.
//
// Меню шукаються структурно (усі .has-mega у шапці), а розділ
// визначається з href самого пункту — тому файл працює на всіх
// сторінках сайту без правок розмітки і без окремих id.
//
// Дані: data/categories.json (порядок розділів і категорій, як в
// адмінці) + data/products.json (що реально є в наявності).
//
// Якщо щось піде не так (немає мережі, порожні файли) — меню
// лишається таким, як закладено в самій розмітці сторінки, сайт
// не ламається.
// ======================================

(async function initHeaderMegaMenus() {

    const megaItems = document.querySelectorAll(".has-mega");

    if (!megaItems.length) return;

    const GENDER_ORDER = ["Жінкам", "Чоловікам", "Унісекс", "Дітям"];

    // має збігатися з SALE_MIN_DISCOUNT у assets/js/catalog.js —
    // інакше в меню «Акції» потраплять не ті самі товари, що і в
    // самому розділі
    const SALE_MIN_DISCOUNT = 30;

    const MAX_BRANDS = 8;

    function isSaleProduct(product) {

        if (!product.oldPrice) return false;

        return (1 - product.price / product.oldPrice) * 100 >= SALE_MIN_DISCOUNT;

    }

    // розділ визначаємо з посилання самого пункту меню:
    // "catalog?section=new" → "new", "catalog" → ""
    function sectionFromHref(href) {

        const match = /[?&]section=(new|sale)\b/.exec(href || "");

        return match ? match[1] : "";

    }

    function scopeProducts(products, section) {

        if (section === "new") return products.filter(p => p.isNew);

        if (section === "sale") return products.filter(isSaleProduct);

        return products;

    }

    function buildQuery(section, extra) {

        const parts = [];

        if (section) parts.push(`section=${section}`);

        extra.forEach(([key, value]) => parts.push(`${key}=${encodeURIComponent(value)}`));

        return parts.length ? `catalog?${parts.join("&")}` : "catalog";

    }

    // Меню лежить усередині nav li.has-mega (position:relative), тож
    // його left/right відлічуються від вузького пункту меню. Щоб
    // панель займала всю ширину екрана, зсуваємо її вліво рівно на
    // відступ пункту від краю вікна і задаємо ширину вікна.
    // clientWidth (а не innerWidth) — щоб не залізти під вертикальний
    // скролбар і не породити горизонтальний.
    const builtMenus = [];

    function stretchToViewport(menu, item) {

        const rect = item.getBoundingClientRect();

        menu.style.left = `${-rect.left}px`;
        menu.style.width = `${document.documentElement.clientWidth}px`;

    }

    let resizeScheduled = false;

    window.addEventListener("resize", () => {

        if (resizeScheduled) return;

        resizeScheduled = true;

        requestAnimationFrame(() => {

            resizeScheduled = false;

            builtMenus.forEach(({ menu, item }) => stretchToViewport(menu, item));

        });

    });

    try {

        const [categoriesRes, productsRes] = await Promise.all([
            fetch(dataUrl("data/categories.json")),
            fetch(dataUrl("data/products.json"))
        ]);

        if (!categoriesRes.ok || !productsRes.ok) return;

        const categories = await categoriesRes.json();
        const products = await productsRes.json();

        if (!Array.isArray(products) || products.length === 0) return;

        // порядок категорій беремо з довідника, щоб у меню він був
        // такий самий, як в адмінці, а не випадковий
        const categoryOrder = new Map();

        (Array.isArray(categories) ? categories : []).forEach((category, index) => {

            categoryOrder.set(category.name, index);

        });

        function sortCategories(names) {

            return names.sort((a, b) => {

                const ia = categoryOrder.has(a) ? categoryOrder.get(a) : Infinity;
                const ib = categoryOrder.has(b) ? categoryOrder.get(b) : Infinity;

                // категорії, яких немає в довіднику (довільне значення
                // з Excel-імпорту), не губляться — просто йдуть у кінці
                if (ia !== ib) return ia - ib;

                return a.localeCompare(b, "uk");

            });

        }

        megaItems.forEach(item => {

            const link = item.querySelector("a");
            const menu = item.querySelector(".mega-menu");

            if (!link || !menu) return;

            const section = sectionFromHref(link.getAttribute("href"));
            const scoped = scopeProducts(products, section);

            // порожній розділ — лишаємо запасну розмітку, щоб меню
            // не виявилось порожньою білою плямою
            if (!scoped.length) return;

            const genderColumns = GENDER_ORDER.map(gender => {

                const items = scoped.filter(product => getProductGenders(product).includes(gender));

                if (!items.length) return "";

                const names = sortCategories(
                    [...new Set(items.map(product => product.category).filter(Boolean))]
                );

                const links = names.map(name => `
                    <a href="${buildQuery(section, [["gender", gender], ["category", name]])}">${escapeHtml(name)}</a>
                `).join("");

                return `
                    <div class="mega-col">
                        <a class="mega-col-title mega-col-title-link"
                           href="${buildQuery(section, [["gender", gender]])}">${escapeHtml(gender)}</a>
                        ${links}
                    </div>
                `;

            }).join("");

            // бренди — за кількістю товарів у цьому ж розділі
            const brandCounts = new Map();

            scoped.forEach(product => {

                if (!product.brand) return;

                brandCounts.set(product.brand, (brandCounts.get(product.brand) || 0) + 1);

            });

            const topBrands = [...brandCounts.entries()]
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "uk"))
                .slice(0, MAX_BRANDS)
                .map(([brand]) => brand);

            const brandColumn = topBrands.length ? `
                <div class="mega-col">
                    <div class="mega-col-title">Бренди</div>
                    ${topBrands.map(brand => `
                        <a href="${buildQuery(section, [["brand", brand]])}">${escapeHtml(brand)}</a>
                    `).join("")}
                    <a class="mega-col-all" href="${buildQuery(section, [])}">Усі бренди</a>
                </div>
            ` : "";

            if (!genderColumns && !brandColumn) return;

            menu.classList.add("mega-menu-columns");
            menu.innerHTML = `<div class="mega-inner">${genderColumns}${brandColumn}</div>`;

            builtMenus.push({ menu, item });

            stretchToViewport(menu, item);

        });

    } catch (error) {

        console.warn("Не вдалося побудувати меню шапки, лишено запасний варіант:", error);

    }

})();
