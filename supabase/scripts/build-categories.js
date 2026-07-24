// Збирає data/categories/*.json (окремі файли категорій, якими керує
// адмінка Decap CMS) в один data/categories.json, який реально
// вантажить сайт через fetch() — для меню сайту та фільтра «Категорія»
// в каталозі.
//
// Результат сортується за розділом (у порядку DEPARTMENT_ORDER нижче),
// а всередині розділу — за назвою категорії (українська локаль).
//
// Запускається автоматично через GitHub Actions при будь-якій
// зміні в data/categories/**.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CATEGORIES_DIR = path.join(ROOT, "data", "categories");
const OUTPUT_FILE = path.join(ROOT, "data", "categories.json");

const DEPARTMENT_ORDER = ["Сумки", "Одяг", "Взуття", "Аксесуари", "Білизна", "Спорт"];

function main() {

    if (!fs.existsSync(CATEGORIES_DIR)) {
        console.error(`Не знайдено папку ${CATEGORIES_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(CATEGORIES_DIR).filter(f => f.endsWith(".json"));

    if (files.length === 0) {
        console.error("У data/categories немає жодного файлу категорії");
        process.exit(1);
    }

    const categories = [];

    files.forEach(file => {

        const filePath = path.join(CATEGORIES_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

        if (!data.name || !data.department) {

            console.log(`⏭  ПРОПУЩЕНО (не заповнено): ${file}`);

            return;

        }

        if (!DEPARTMENT_ORDER.includes(data.department)) {

            console.log(`⚠  Невідомий розділ "${data.department}" у ${file} — категорію додано в кінець списку`);

        }

        categories.push({ name: data.name, department: data.department });

    });

    categories.sort((a, b) => {

        const deptDiff = DEPARTMENT_ORDER.indexOf(a.department) - DEPARTMENT_ORDER.indexOf(b.department);

        if (deptDiff !== 0) return deptDiff;

        return a.name.localeCompare(b.name, "uk");

    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(categories, null, 2) + "\n", "utf8");

    console.log(`Готово: ${categories.length} категорій → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

main();
