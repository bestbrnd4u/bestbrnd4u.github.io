// Збирає data/collections/*.json (окремі файли добірок, якими керує
// адмінка Decap CMS) в один data/collections.json, який реально
// вантажить сайт через fetch() — для блоків "Добірка" на головній.
//
// У підсумковий файл потрапляють тільки добірки з active !== false,
// відсортовані за полем order (менше число — вище), а далі за назвою.
//
// Запускається автоматично через GitHub Actions при будь-якій
// зміні в data/collections/**.

const fs = require("fs");
const path = require("path");
// не даємо файлам зі зламаним ім'ям потрапити в зібраний JSON
// (див. коментар у scripts/slug-safety.js)
const { filterSafeEntryFiles } = require("./slug-safety");

const ROOT = path.join(__dirname, "..");
const COLLECTIONS_DIR = path.join(ROOT, "data", "collections");
const OUTPUT_FILE = path.join(ROOT, "data", "collections.json");

function main() {

    if (!fs.existsSync(COLLECTIONS_DIR)) {
        console.log("Немає папки data/collections — пропускаю, пишу порожній файл");
        fs.writeFileSync(OUTPUT_FILE, "[]\n", "utf8");
        return;
    }

    const files = filterSafeEntryFiles(
        fs.readdirSync(COLLECTIONS_DIR).filter(f => f.endsWith(".json")),
        "data/collections"
    ).safe;

    const collections = [];

    files.forEach(file => {

        const filePath = path.join(COLLECTIONS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const slug = file.replace(/\.json$/, "");

        if (!data.title || !data.image || !Array.isArray(data.products) || !data.products.length) {

            console.log(`⏭  ПРОПУЩЕНО (не заповнено): ${file}`);

            return;

        }

        if (data.active === false) {

            console.log(`⏭  ПРОПУЩЕНО (вимкнено): ${file}`);

            return;

        }

        collections.push({
            slug,
            eyebrow: data.eyebrow || "ДОБІРКА",
            title: data.title,
            image: data.image,
            // Порожній рядок, а не відсутнє поле: фронт сам відкотиться
            // на десктопне фото (див. renderCollectionWidget в app.js),
            // тож уже створені добірки без цього поля не ламаються.
            imageMobile: data.imageMobile || "",
            imageAlt: data.imageAlt || data.title,
            productIds: data.products.map(Number),
            order: typeof data.order === "number" ? data.order : 1
        });

    });

    collections.sort((a, b) => {

        if (a.order !== b.order) return a.order - b.order;

        return a.title.localeCompare(b.title, "uk");

    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collections, null, 2) + "\n", "utf8");

    console.log(`Готово: ${collections.length} добірок → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

main();
