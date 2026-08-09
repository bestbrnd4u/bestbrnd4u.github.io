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
