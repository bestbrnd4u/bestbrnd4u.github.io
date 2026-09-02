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

        const обрані = Array.isArray(data.products) && data.products.length;

        // Розділи, підхоплені автоматично, — рівноправне джерело
        // товарів. Доки тут вимагався саме ручний перелік, добірка,
        // зібрана одним правилом, тихо не потрапляла на сайт.
        const правило = Array.isArray(data.autoSections) && data.autoSections.length;

        if (!data.title || !data.image || (!обрані && !правило)) {

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
            // Умови тут повторюються замість готових `обрані`/`правило`
            // вище НАВМИСНО: вихідний об'єкт мусить залежати лише від
            // самого запису. За переліком полів стежить
            // tests/test-admin-fields-reach-site.js — він виконує саме
            // цей літерал, і зовнішня змінна перетворила б перевірку на
            // падіння з ReferenceError.
            productIds: Array.isArray(data.products) ? data.products.map(Number) : [],
            // ПРАВИЛО набору, на відміну від productIds вище — знімка.
            // Пишемо лише коли заповнене, як у акціях: порожній масив у
            // ста добірках нічого не означає.
            ...(Array.isArray(data.autoSections) && data.autoSections.length
                ? { autoSections: data.autoSections.map(String) }
                : {}),
            // Оформлення тексту. renderCollectionWidget() у app.js його
            // вже читає (blockStyleClass/blockStyleAttr), але сюди воно
            // не потрапляло — тобто розділ «Оформлення тексту і кнопки»
            // в адмінці зберігався і не робив нічого. Та сама помилка
            // була в акціях; за переліком полів тепер стежить
            // tests/test-admin-fields-reach-site.js.
            ...(data.style && typeof data.style === "object"
                && Object.keys(data.style).length
                ? { style: data.style }
                : {}),
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
