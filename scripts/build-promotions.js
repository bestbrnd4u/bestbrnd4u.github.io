// Збирає data/promotions/*.json (окремі файли акцій, якими керує
// адмінка Decap CMS) в один data/promotions.json, який реально
// вантажить сайт через fetch() — для розділу «Акції» на головній.
//
// У підсумковий файл потрапляють тільки акції з active !== false,
// відсортовані за полем order (менше число — вище), а далі за назвою.
//
// Запускається автоматично через GitHub Actions при будь-якій
// зміні в data/promotions/**.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PROMOTIONS_DIR = path.join(ROOT, "data", "promotions");
const OUTPUT_FILE = path.join(ROOT, "data", "promotions.json");

function main() {

    if (!fs.existsSync(PROMOTIONS_DIR)) {
        console.error(`Не знайдено папку ${PROMOTIONS_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(PROMOTIONS_DIR).filter(f => f.endsWith(".json"));

    if (files.length === 0) {
        console.error("У data/promotions немає жодного файлу акції");
        process.exit(1);
    }

    const promotions = [];

    files.forEach(file => {

        const filePath = path.join(PROMOTIONS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const slug = file.replace(/\.json$/, "");

        if (!data.title || !data.image || !data.link) {

            console.log(`⏭  ПРОПУЩЕНО (не заповнено): ${file}`);

            return;

        }

        if (data.active === false) {

            console.log(`⏭  ПРОПУЩЕНО (вимкнено): ${file}`);

            return;

        }

        const validGenders = ["Жінкам", "Чоловікам", "Дітям", "Унісекс"];

        const genderButtons = Array.isArray(data.genderButtons)
            ? data.genderButtons
                .filter(btn => btn && validGenders.includes(btn.gender))
                .map(btn => ({
                    gender: btn.gender,
                    color: typeof btn.color === "string" && btn.color ? btn.color : "#111827"
                }))
            : [];

        const validPopupPages = ["catalog", "promo"];

        const popupPages = Array.isArray(data.popupPages)
            ? data.popupPages.filter(page => validPopupPages.includes(page))
            : [];

        promotions.push({
            slug,
            title: data.title,
            text: data.text || "",
            badge: data.badge || "",
            image: data.image,
            imageMobile: data.imageMobile || "",
            popupImage: data.popupImage || "",
            popupPages,
            buttonText: data.buttonText || "Дивитись усі товари",
            link: data.link,
            brand: data.brand || "",
            discountPercent: typeof data.discountPercent === "number" ? data.discountPercent : null,
            productIds: Array.isArray(data.products) ? data.products.map(Number) : [],
            genderButtons,
            displayType: ["card", "hero_slider", "banner_products", "banner_compact", "popup"].includes(data.displayType)
                ? data.displayType
                : "card",
            order: typeof data.order === "number" ? data.order : 1
        });

    });

    promotions.sort((a, b) => {

        if (a.order !== b.order) return a.order - b.order;

        return a.title.localeCompare(b.title, "uk");

    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(promotions, null, 2) + "\n", "utf8");

    console.log(`Готово: ${promotions.length} акцій → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

main();
