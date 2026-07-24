// Збирає data/products/*.json (окремі файли товарів, якими керує
// адмінка Decap CMS) в один data/products.json, який реально
// вантажить сайт через fetch().
//
// Заодно:
// - гарантує, що у кожного товару є стабільний числовий "id"
//   (якщо його ще немає — присвоює наступний вільний і
//   дописує назад у файл товару, щоб він більше не змінювався);
// - синхронізує поле "slug" з назвою файлу.
//
// Запускається автоматично через GitHub Actions при будь-якій
// зміні в data/products/**.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PRODUCTS_DIR = path.join(ROOT, "data", "products");
const OUTPUT_FILE = path.join(ROOT, "data", "products.json");

// Перевіряє, чи заповнені всі поля, обов'язкові для показу на сайті.
// Список свідомо дублює required:true поля з admin/config.yml.
function getMissingFields(data) {

    const missing = [];

    if (!data.title) missing.push("title (Назва товару)");
    if (!data.brand) missing.push("brand (Бренд)");
    if (!data.category) missing.push("category (Категорія)");
    if (!data.gender) missing.push("gender (Для кого)");
    if (typeof data.price !== "number") missing.push("price (Ціна)");
    if (!data.description) missing.push("description (Опис товару)");

    const hasVariants = Array.isArray(data.variants) && data.variants.length > 0;

    if (!hasVariants) {

        missing.push("variants (Варіанти кольору)");

    } else {

        const [firstVariant] = data.variants;

        if (!firstVariant.color) missing.push("variants[0].color (Колір першого варіанту)");
        if (!firstVariant.hex) missing.push("variants[0].hex (HEX першого варіанту)");
        if (!Array.isArray(firstVariant.images) || firstVariant.images.length === 0) {
            missing.push("variants[0].images (Фотографії першого варіанту)");
        }

    }

    return missing;

}

function main() {

    if (!fs.existsSync(PRODUCTS_DIR)) {
        console.error(`Не знайдено папку ${PRODUCTS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith(".json"));

    if (files.length === 0) {
        console.error("У data/products немає жодного файлу товару");
        process.exit(1);
    }

    const parsed = files.map(file => {

        const filePath = path.join(PRODUCTS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

        return { file, filePath, data };

    });

    let maxId = 0;

    parsed.forEach(({ data }) => {

        if (typeof data.id === "number" && data.id > maxId) {
            maxId = data.id;
        }

    });

    const products = [];

    parsed.forEach(({ file, filePath, data }) => {

        const slug = file.replace(/\.json$/, "");

        let changed = false;

        if (data.slug !== slug) {
            data.slug = slug;
            changed = true;
        }

        if (typeof data.id !== "number") {
            maxId += 1;
            data.id = maxId;
            changed = true;
        }

        // color/images верхнього рівня — це завжди перший варіант
        // кольору. Якщо в CMS відредагували variants, ці поля
        // підтягуються автоматично — не треба заповнювати двічі.
        if (Array.isArray(data.variants) && data.variants.length > 0) {

            const [firstVariant] = data.variants;

            if (data.color !== firstVariant.color) {
                data.color = firstVariant.color;
                changed = true;
            }

            if (JSON.stringify(data.images) !== JSON.stringify(firstVariant.images)) {
                data.images = firstVariant.images;
                changed = true;
            }

        }

        if (changed) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
            console.log(`оновлено ${file}: id=${data.id}, slug=${data.slug}`);
        }

        const missing = getMissingFields(data);

        if (missing.length > 0 && !data.forcePublish) {

            console.log(
                `⏭  ПРОПУЩЕНО (не потрапить на сайт): ${file} — ` +
                `не заповнено: ${missing.join(", ")}. ` +
                `Щоб все одно показати товар — увімкніть "Опублікувати попри неповні дані" в адмінці.`
            );

            return;

        }

        if (missing.length > 0 && data.forcePublish) {

            console.log(
                `⚠  Опубліковано попри неповні дані: ${file} — не заповнено: ${missing.join(", ")}`
            );

        }

        products.push(data);

    });

    products.sort((a, b) => a.id - b.id);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(products, null, 2) + "\n", "utf8");

    console.log(`Готово: ${products.length} товарів → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

main();
