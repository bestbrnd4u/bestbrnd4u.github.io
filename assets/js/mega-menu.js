// ======================================
// mega-menu.js
// Динамічно наповнює мегаменю під пунктом "Каталог" колонками
// розділів (дані беруться з адмінки — data/categories.json),
// але показує лише ті категорії, для яких у каталозі реально
// є хоча б один товар (data/products.json).
//
// Підключається на кожній сторінці — шапка сайту однакова всюди.
// Якщо щось піде не так (немає мережі, пусті файли тощо) —
// мегаменю просто лишається таким, яким закладено в самій
// розмітці сторінки (картки "За статтю"), сайт не ламається.
// ======================================

(async function initCatalogMegaMenu() {

    const container = document.getElementById("catalogMegaMenu");

    if (!container) return;

    try {

        const [categoriesRes, productsRes] = await Promise.all([
            fetch("data/categories.json"),
            fetch("data/products.json")
        ]);

        if (!categoriesRes.ok || !productsRes.ok) return;

        const categories = await categoriesRes.json();
        const products = await productsRes.json();

        const presentCategories = new Set(products.map(p => p.category));

        const byDepartment = new Map();

        categories.forEach(category => {

            if (!presentCategories.has(category.name)) return;

            if (!byDepartment.has(category.department)) {
                byDepartment.set(category.department, []);
            }

            byDepartment.get(category.department).push(category.name);

        });

        if (byDepartment.size === 0) return;

        const genderColumn = `
            <div class="mega-col">
                <div class="mega-col-title">За статтю</div>
                <a href="catalog.html?gender=Жінкам">Жінкам</a>
                <a href="catalog.html?gender=Чоловікам">Чоловікам</a>
                <a href="catalog.html?gender=Унісекс">Унісекс</a>
                <a href="catalog.html?gender=Дітям">Дітям</a>
            </div>
        `;

        const departmentColumns = [...byDepartment.entries()].map(([department, names]) => `
            <div class="mega-col">
                <div class="mega-col-title">${department}</div>
                ${names.map(name => `
                    <a href="catalog.html?category=${encodeURIComponent(name)}">${name}</a>
                `).join("")}
            </div>
        `).join("");

        container.classList.add("mega-menu-columns");
        container.innerHTML = genderColumn + departmentColumns;

    } catch (error) {

        console.warn("Не вдалося побудувати мегаменю каталогу, лишено запасний варіант:", error);

    }

})();
