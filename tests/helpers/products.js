// Читання товарів для тестів.
//
// ВАЖЛИВО: беремо ДЖЕРЕЛО (data/products/*.json — окремі файли, якими
// керує адмінка), а НЕ data/products.json.
//
// data/products.json — згенерований файл: його перезбирає GitHub
// Actions після кожної зміни в data/products/**. У свіжому клоні та
// в CI до першої перезбірки він містить застарілі дані, і тести,
// прив'язані до нього, падали не через помилку в коді, а через те,
// що агрегат ще не оновився. Джерельні файли завжди актуальні —
// вони і є те, що редагує користувач.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DIR = path.join(ROOT, "data", "products");

function loadProducts() {

    if (!fs.existsSync(DIR)) return [];

    return fs.readdirSync(DIR)
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));

}

function findProductById(id) {

    return loadProducts().find(p => p.id === id) || null;

}

module.exports = { loadProducts, findProductById };

// Категорії — так само з ДЖЕРЕЛ (data/categories/*.json), а не з
// згенерованого data/categories.json: агрегат перезбирає GitHub
// Actions, і в CI до перезбірки він відстає від джерел.
function loadCategories() {

    const dir = path.join(ROOT, "data", "categories");

    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir)
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")))
        .filter(c => c && c.name && c.department);

}

module.exports.loadCategories = loadCategories;


// Вибір товару за ПОТРІБНОЮ ВЛАСТИВІСТЮ, а не за конкретним id.
//
// Раніше тести шукали товар id=15 («Urban Sneakers», 15 кольорів) —
// демо-товар, який жив у каталозі. Щойно каталог замінили справжнім,
// половина тестів упала, хоча код сайту не змінювався. Тест не має
// залежати від вмісту каталогу — лише від наявності товару з
// потрібними ознаками.
function pickProduct(predicate) {
    return loadProducts().filter(predicate)[0] || null;
}

// Товар із найбільшою кількістю кольорів — саме на такому видно
// переповнення рядка кольорів.
function productWithMostColors() {
    const all = loadProducts().filter(p => Array.isArray(p.variants) && p.variants.length);
    if (!all.length) return null;
    return all.sort((a, b) => b.variants.length - a.variants.length)[0];
}

module.exports.pickProduct = pickProduct;
module.exports.productWithMostColors = productWithMostColors;
