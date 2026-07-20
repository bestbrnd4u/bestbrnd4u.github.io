// ======================================
// app.js
// Логіка головної сторінки (index.html)
// ======================================

const productsGrid = document.getElementById("productsGrid");

async function initHome() {

    if (!productsGrid) return;

    try {

        const response = await fetch("data/products.json");

        if (!response.ok) {
            throw new Error("Не вдалося завантажити товари");
        }

        const products = await response.json();

        // Показуємо товари з найвищим рейтингом
        const featured = [...products]
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 8);

        renderProducts(featured);

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

initHome();
