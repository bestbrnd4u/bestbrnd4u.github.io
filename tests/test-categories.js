const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = require("path").join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "catalog.html"), "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://x.test/catalog" });
const { window } = dom;

global.window = window;
global.document = window.document;

window.CATALOG_SKIP_AUTO_INIT = true;
window.createProductCard = p => `<div class="product-card">${p.title}</div>`;
window.initProductCarousels = () => {};
window.updateFavoriteButtons = () => {};
window.renderRecentlyViewed = () => {};
window.scrollTo = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
window.fetch = () => Promise.resolve({ ok: false });
window.requestAnimationFrame = cb => cb();

// escapeHtml із common.js — catalog.js тепер його використовує
window.eval(fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8").match(
    /function escapeHtml[\s\S]*?\n}\n/
)[0]);
// availableFacets() використовує getProductColors з common.js —
// на сайті цей файл підключений повністю, у тесті підвантажуємо явно
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getProductColors[\s\S]*?\n}\n/)[0]);
// сім'ї кольорів — фільтр «Колір» працює ними (див. хелпер)
require(require("path").join(__dirname,"helpers/color-families")).installColorFamilies(window);
// getVariantSizes/getAllProductSizes теж живуть у common.js —
// на сайті файл підключений повністю, у тесті додаємо явно
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getVariantSizes[\s\S]*?\n}\n/)[0]);
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getAllProductSizes[\s\S]*?\n}\n/)[0]);
// catalog.js тепер стартує з FALLBACK_SIZE_GROUPS з common.js
// (групи розмірів приходять з адмінки), плюс хелпери груп
const _cs = fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
// const з окремого window.eval не видно наступним викликам
// (jsdom не ділить прив'язання) — привласнюємо прямо у window
window.eval("window.FALLBACK_SIZE_GROUPS = " +
    _cs.match(/const FALLBACK_SIZE_GROUPS = (\[[\s\S]*?\n\]);\n/)[1] + ";");
window.eval(_cs.match(/function resolveGroupCategories[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function findSizeGroupForCategory[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function getProductGenders[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function getProductGenderLabel[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/let sizeGroupsPromise[\s\S]*?\n}\n/)[0]);

let code = fs.readFileSync(path.join(ROOT, "assets/js/catalog.js"), "utf8");
code += `
window.__t = {
    setProducts(list) { products = list; },
    fillCategories: (d) => fillCategories(d),
    fillCatalogSidebar: (d) => fillCatalogSidebar(d),
    buildCategoryTree: (d) => buildCategoryTree(d),
    get selectedCategories() { return selectedCategories; }
};
`;
window.eval(code);

let failures = 0;
function check(name, cond, extra) {
    if (cond) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
}

// Довідник категорій, як його віддає loadCategoryDepartments()
const departments = [
    { title: "Сумки", categories: ["Жіночі сумки", "Рюкзаки", "Чоловічі сумки"] },
    { title: "Взуття", categories: ["Кросівки", "Туфлі"] },
    { title: "Одяг", categories: ["Джинси", "Футболки і поло"] }
];

// Товари: сумки і кросівки є, туфель/одягу немає; плюс товар
// з категорією, якої взагалі немає в довіднику (Excel-імпорт)
window.__t.setProducts([
    { title: "A", price: 100, category: "Жіночі сумки", brand: "X", variants: [] },
    { title: "B", price: 200, category: "Жіночі сумки", brand: "X", variants: [] },
    { title: "C", price: 300, category: "Рюкзаки", brand: "Y", variants: [] },
    { title: "D", price: 400, category: "Кросівки", brand: "Nike", variants: [] },
    { title: "E", price: 500, category: "Ремені зі шкіри пітона", brand: "Z", variants: [] }
]);

console.log("\n[1] buildCategoryTree: лише непорожні, з кількістю, «Інше» для невідомих");
{
    const tree = window.__t.buildCategoryTree(departments);
    const titles = tree.map(g => g.title);

    check("розділ «Одяг» без товарів прихований", !titles.includes("Одяг"), titles.join(","));
    check("розділи «Сумки» і «Взуття» присутні", titles.includes("Сумки") && titles.includes("Взуття"));
    check("невідома категорія потрапила в групу «Інше»", titles.includes("Інше"));

    const bags = tree.find(g => g.title === "Сумки");
    check("«Туфлі» без товарів немає у «Взутті»",
          !tree.find(g => g.title === "Взуття").categories.some(c => c.name === "Туфлі"));
    check("кількість рахується вірно (Жіночі сумки = 2)",
          bags.categories.find(c => c.name === "Жіночі сумки").count === 2);
    check("порядок категорій — як у довіднику",
          bags.categories.map(c => c.name).join(",") === "Жіночі сумки,Рюкзаки");
}

console.log("\n[2] Дропдаун «Категорія»");
{
    window.__t.fillCategories(departments);

    const labels = [...document.querySelectorAll("#categoryOptionsList .filter-option")]
        .map(o => o.dataset.category);
    const groups = [...document.querySelectorAll("#categoryOptionsList .filter-option-group-title")]
        .map(g => g.textContent);

    check("у дропдауні немає порожніх категорій", !labels.includes("Туфлі") && !labels.includes("Джинси"), labels.join(","));
    check("невідома категорія доступна в дропдауні", labels.includes("Ремені зі шкіри пітона"));
    check("група «Одяг» не виведена", !groups.includes("Одяг"), groups.join(","));
}

console.log("\n[3] Бокове дерево: побудова, клік, підсвітка");
{
    window.__t.fillCatalogSidebar(departments);

    const sidebar = document.getElementById("catalogSidebar");
    check("сайдбар більше не hidden", sidebar.hidden === false);

    const all = sidebar.querySelector("[data-sidebar-all]");
    check("«Всі товари» показує загальну кількість", all.textContent.includes("5"), all.textContent.trim());
    check("«Всі товари» активна за замовчуванням", all.classList.contains("active"));

    const cats = [...sidebar.querySelectorAll("[data-sidebar-category]")].map(b => b.dataset.sidebarCategory);
    check("порожніх категорій у сайдбарі немає", !cats.includes("Туфлі") && !cats.includes("Футболки і поло"), cats.join(","));
    check("невідома категорія є в сайдбарі", cats.includes("Ремені зі шкіри пітона"));

    const sneakers = sidebar.querySelector('[data-sidebar-category="Кросівки"]');
    check("лічильник біля «Кросівки» = 1", sneakers.textContent.includes("1"));

    // клік по категорії застосовує фільтр і підсвічує пункт
    sneakers.dispatchEvent(new window.Event("click", { bubbles: true }));

    check("фільтр категорії застосовано", window.__t.selectedCategories.has("Кросівки"));
    check("пункт підсвічено", sneakers.classList.contains("active"));
    check("«Всі товари» більше не активна", !all.classList.contains("active"));
    check("у сітці лишився лише товар D",
          document.getElementById("productsCount").textContent === "1",
          document.getElementById("productsCount").textContent);

    // повторний клік знімає фільтр
    sneakers.dispatchEvent(new window.Event("click", { bubbles: true }));
    check("повторний клік знімає фільтр", !window.__t.selectedCategories.has("Кросівки"));

    // «Всі товари» скидає вибір
    sidebar.querySelector('[data-sidebar-category="Жіночі сумки"]').dispatchEvent(new window.Event("click", { bubbles: true }));
    all.dispatchEvent(new window.Event("click", { bubbles: true }));
    check("«Всі товари» скидає вибір категорій", window.__t.selectedCategories.size === 0);
    check("показані всі 5 товарів", document.getElementById("productsCount").textContent === "5");
}

console.log("\n[4] XSS: зловмисна назва категорії не виконується");
{
    window.__t.setProducts([
        { title: "Evil", price: 1, category: `Сумки"><img src=x onerror="window.__pwned=true">`, brand: "X", variants: [] }
    ]);

    window.__pwned = false;

    document.getElementById("catalogSidebar").innerHTML = "";
    window.__t.fillCatalogSidebar(departments);

    // текст назви (включно з екранованим "onerror=...") ЛЕГІТИМНО
    // присутній як текст — перевіряємо відсутність живих елементів
    check("зловмисний <img> не став живим елементом",
          document.getElementById("catalogSidebar").querySelector("img") === null);
    check("код не виконався", window.__pwned === false);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
