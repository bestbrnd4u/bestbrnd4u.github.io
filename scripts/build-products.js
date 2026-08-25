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
const crypto = require("crypto");
// не даємо файлам зі зламаним ім'ям потрапити в зібраний JSON
// (див. коментар у scripts/slug-safety.js)
const { filterSafeEntryFiles } = require("./slug-safety");

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

// Версія в адресі кожного фото: photo.webp?v=a1b2c3d4
//
// НАВІЩО
// -------
// Браузер і Cloudflare кешують картинку за адресою. Замінили фото
// через адмінку, лишивши імʼя, — адреса та сама, і люди ще довго
// бачать старе.
//
// ЧОМУ САМЕ ТАК, А НЕ ПЕРЕЙМЕНУВАННЯМ ФАЙЛУ
// ------------------------------------------
// Спершу я робив це перейменуванням: дописував відбиток у імʼя файлу.
// Механізм виявився надто крихким і зламався на першому бойовому
// запуску — файл переїхав, а посилання лишились на старому імені, і
// фото зникло з товару.
//
// Тут ризику немає за побудовою: імʼя файлу НЕ змінюється, версія
// живе лише в згенерованому products.json. Файл на диску й посилання
// на нього завжди збігаються. Якщо версія колись не проставиться,
// найгірше, що станеться, — картинка приїде з кеша; вона не зникне.
//
// products.json перезбирається щоразу, тож версія завжди свіжа. У
// джерельних data/products/*.json її немає — там лишаються чисті
// шляхи, з якими працює адмінка.
function stampImageVersions(products) {

    const cache = new Map();

    function version(src) {

        const clean = String(src).split("?")[0];

        if (cache.has(clean)) return cache.get(clean);

        const file = path.join(ROOT, clean.replace(/^\//, ""));

        let stamp = "";

        if (fs.existsSync(file)) {

            stamp = crypto.createHash("sha1")
                .update(fs.readFileSync(file))
                .digest("hex")
                .slice(0, 8);

        }

        cache.set(clean, stamp);

        return stamp;

    }

    function stamp(src) {

        if (!src || typeof src !== "string") return src;

        const clean = src.split("?")[0];
        const v = version(clean);

        return v ? `${clean}?v=${v}` : clean;

    }

    let count = 0;

    products.forEach(product => {

        (product.variants || []).forEach(variant => {

            if (!Array.isArray(variant.images)) return;

            variant.images = variant.images.map(src => {

                const next = stamp(src);

                if (next !== src) count++;

                return next;

            });

        });

    });

    console.log(`   версію проставлено фото: ${count}`);

}

function main() {

    if (!fs.existsSync(PRODUCTS_DIR)) {
        console.error(`Не знайдено папку ${PRODUCTS_DIR}`);
        process.exit(1);
    }

    const files = filterSafeEntryFiles(
        fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith(".json")),
        "data/products"
    ).safe;

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

        // Єдине написання «один розмір».
        //
        // У даних співіснували ONESIZE (45 товарів) і Onesize (7) —
        // заводили в адмінку в різний час. Для фільтра, кошика й
        // обраного це РІЗНІ значення: розмір порівнюється рядком, тож
        // той самий товар у кошику й на сторінці міг не збігтися.
        //
        // Зводимо до одного вигляду при збірці, а не просимо
        // адміністратора памʼятати регістр.
        const CANON_ONESIZE = "ONESIZE";

        const fixSizes = list => {

            if (!Array.isArray(list)) return { list, changed: false };

            let changed = false;

            const next = list.map(size => {

                if (typeof size === "string" && /^one\s*size$/i.test(size.trim())
                    && size !== CANON_ONESIZE) {

                    changed = true;

                    return CANON_ONESIZE;

                }

                return size;

            });

            return { list: next, changed };

        };

        const own = fixSizes(data.sizes);

        if (own.changed) { data.sizes = own.list; changed = true; }

        (data.variants || []).forEach(variant => {

            if (!variant || !variant.sizes) return;

            const fixed = fixSizes(variant.sizes);

            if (fixed.changed) { variant.sizes = fixed.list; changed = true; }

        });

        // Кадрування прибираємо разом із фото.
        //
        // framing — це словник «ім'я файлу → рамка» (див.
        // assets/js/image-framing.js). Ключі не зникають самі: видалили
        // знімок у CMS — запис про його кадр лишався б у товарі назавжди
        // і за рік перетворив би файл на смітник. Тому лишаємо тільки ті
        // ключі, для яких фото ще є хоч в одному кольорі.
        if (data.framing && typeof data.framing === "object") {

            const alive = new Set(
                (data.variants || [])
                    .flatMap(variant => (variant && variant.images) || [])
                    .map(src => String(src).split("/").pop())
            );

            const kept = {};

            Object.keys(data.framing).forEach(key => {
                if (alive.has(key)) kept[key] = data.framing[key];
            });

            if (JSON.stringify(kept) !== JSON.stringify(data.framing)) {

                const dropped = Object.keys(data.framing).length - Object.keys(kept).length;

                if (Object.keys(kept).length) data.framing = kept;
                else delete data.framing;

                console.log(`   ↻ ${file}: прибрано кадрувань без фото — ${dropped}`);

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

    stampImageVersions(products);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(products, null, 2) + "\n", "utf8");

    console.log(`Готово: ${products.length} товарів → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

main();
