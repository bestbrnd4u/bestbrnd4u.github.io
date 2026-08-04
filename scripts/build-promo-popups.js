// Збирає data/promo-popups/*.json (окремі файли спливаючих банерів,
// якими керує адмінка Decap CMS) в один data/promo-popups.json —
// саме його завантажує сайт через fetch(), щоб вирішити, чи показувати
// банер на поточній сторінці.
//
// У підсумковий файл потрапляють лише банери з active !== false
// і заповненими обов'язковими полями (title/image/promoSlug/pages).
//
// Запускається автоматично через GitHub Actions при будь-якій
// зміні в data/promo-popups/**.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const POPUPS_DIR = path.join(ROOT, "data", "promo-popups");
const OUTPUT_FILE = path.join(ROOT, "data", "promo-popups.json");

function main() {

    if (!fs.existsSync(POPUPS_DIR)) {
        console.log("Немає папки data/promo-popups — записуємо порожній список");
        fs.writeFileSync(OUTPUT_FILE, "[]\n", "utf8");
        return;
    }

    const files = fs.readdirSync(POPUPS_DIR).filter(f => f.endsWith(".json"));

    const popups = [];

    files.forEach(file => {

        const filePath = path.join(POPUPS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const slug = file.replace(/\.json$/, "");

        if (!data.title || !data.image || !data.promoSlug || !Array.isArray(data.pages) || data.pages.length === 0) {

            console.log(`⏭  ПРОПУЩЕНО (не заповнено обов'язкові поля): ${file}`);

            return;

        }

        if (data.active === false) {

            console.log(`⏭  ПРОПУЩЕНО (вимкнено): ${file}`);

            return;

        }

        popups.push({
            slug,
            image: data.image,
            promoSlug: data.promoSlug,
            pages: data.pages,
            delaySeconds: typeof data.delaySeconds === "number" ? data.delaySeconds : 60
        });

    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(popups, null, 2) + "\n", "utf8");

    console.log(`Готово: ${popups.length} банерів → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

main();
