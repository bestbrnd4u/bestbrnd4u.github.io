function renderProducts(list) {

    if (!productsGrid) return;

    productsGrid.innerHTML = "";

    list.forEach(product => {

        productsGrid.innerHTML += createProductCard(product);

    });

}
