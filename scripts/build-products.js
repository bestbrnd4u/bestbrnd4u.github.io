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
// зводить написання кольорів до одного вигляду (див. коментар у файлі)
const { normalizeProductColors } = require("./normalize-colors");
// кирилиця в імені файлу → латиниця в адресі (див. коментар у файлі)
const { toSlug } = require("./translit");

// Правила залишків — той самий модуль, що працює на сайті й в адмінці.
// Своя копія арифметики тут означала б, що «під замовлення» на сайті і
// «під замовлення» в прев'ю адмінки колись розійдуться.
const Stock = require("../assets/js/stock.js");

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
// Ручний порядок: зводимо номери до 1, 2, 3… без пропусків і збігів.
//
// НАВІЩО
// -------
// Поставили новому товару 2, а двійка вже зайнята — і тепер їх дві.
// Порядок між ними випадковий, а щоб вставити товар «посередині»,
// доводиться перенумеровувати решту руками.
//
// Тепер збірка робить це сама: новий товар стає другим, колишній
// другий — третім, і далі по ланцюжку.
//
// ЧОМУ САМЕ В ЗБІРЦІ
// -------------------
// Адмінка зберігає ЛИШЕ поточний товар — чужі файли вона не чіпає, і
// перенумерувати сусідів під час збереження не може. А збірка бачить
// усі товари одразу, тож це єдине місце, де таке можливо.
//
// ЯК ВИРІШУЄТЬСЯ НІЧИЯ
// ---------------------
// Коли два товари мають однаковий номер, вище стає той, у якого
// БІЛЬШИЙ id — тобто доданий пізніше. Це відповідає наміру: ви щойно
// поставили двійку новому товару й очікуєте, що другим стане саме він,
// а не той, що там був.
//
// Оновлені номери записуємо назад у файли товарів, щоб в адмінці ви
// бачили той самий порядок, що й на сайті.
function renumberSortOrder(products) {

    const pinned = products
        .filter(p => Number.isFinite(Number(p.sortOrder)))
        .sort((a, b) =>
            Number(a.sortOrder) - Number(b.sortOrder)
            || (Number(b.id) || 0) - (Number(a.id) || 0));

    if (!pinned.length) return;

    let changed = 0;

    pinned.forEach((product, index) => {

        const next = index + 1;

        if (Number(product.sortOrder) === next) return;

        product.sortOrder = next;
        changed++;

        // Пишемо в джерело, а не лише в агрегат: інакше в адмінці
        // лишиться старий номер, і наступне збереження поверне збіг.
        const file = product.__sourceFile
            ? path.join(PRODUCTS_DIR, product.__sourceFile)
            : null;

        if (!file || !fs.existsSync(file)) return;

        const data = JSON.parse(fs.readFileSync(file, "utf8"));

        data.sortOrder = next;

        fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");

    });

    console.log(`   ручний порядок: ${pinned.length} товарів`
        + (changed ? `, перенумеровано ${changed}` : ""));

}

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

// Артикул без пробілів.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Документація Google про merchant listings каже прямо: «The sku value
// must not contain any whitespace characters». Збірка це знала й
// замінювала пробіли на дефіс уже на виході — але в самих даних вони
// лишались. Через це працював інший запобіжник: sanitizeSku рахує
// СЛОВА (щоб назва товару не пролізла замість артикула) і при більш
// ніж чотирьох просто викидає значення.
//
// На «SL 276 MICA 002 53» — справжньому коді моделі Saint Laurent із
// пʼяти слів — це й спрацювало: артикул мовчки зникав із розмітки
// товару. У логу збірки лишалось попередження, якого ніхто не читає.
//
// ЧОМУ ВИПРАВЛЯЄМО В ДАНИХ, А НЕ ПІДНІМАЄМО ПОРІГ
// ------------------------------------------------
// Поріг у словах — не про Saint Laurent, а про те, щоб у поле артикула
// не потрапила назва товару. Піднявши його до пʼяти, ми послабили б
// саме той запобіжник, який працює.
//
// Пробілів в артикулі не має бути взагалі — тоді слово одне, і поріг
// ні на що не впливає. Тому дефіс ставимо ще в даних: у товарі, в
// адмінці й у розмітці лежить те саме значення. Адмінка нових
// пробілів більше не пропустить (див. pattern у admin/config.yml).
//
// Замінюємо, а не склеюємо: «A05042 0037354» → «A05042-0037354»
// лишається схожим на код постачальника, а «A050420037354» зробив би
// з двох частин одну незрозумілу.
function normalizeSkus(data, file) {

    let changed = false;

    const fix = value => {

        if (typeof value !== "string") return value;

        const next = value.trim().replace(/\s+/g, "-");

        if (next !== value) {
            console.log(`   ↻ ${file}: артикул «${value}» → «${next}»`);
            changed = true;
        }

        return next;

    };

    if (data.sku !== undefined) data.sku = fix(data.sku);

    (Array.isArray(data.variants) ? data.variants : []).forEach(variant => {
        if (variant && variant.sku !== undefined) variant.sku = fix(variant.sku);
    });

    return changed;

}

// Кирилиця в імені файлу → латиниця в адресі.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Ім'я файлу товару стає slug-ом, а slug — адресою /p/<slug>/. Адмінка
// збирає ім'я з назви товару, а назви українські — тож половина
// каталогу жила за адресами на кшталт
//
//   /p/%D0%B3%D0%BE%D0%B4%D0%B8%D0%BD%D0%BD%D0%B8%D0%BA-tissot-…/
//
// Браузер показує таку адресу розшифрованою, і на сайті проблеми не
// видно. Вона вилазить там, де адресу КОПІЮЮТЬ: у полі «Посилання на
// товар», у постах, у повідомленнях. А коли адресу кладуть у параметр
// (t.me/…?text=…), вона кодується вдруге — %25D0%25B3 — і посилання на
// один годинник займає 300 символів.
//
// ЧОМУ ПЕРЕЙМЕНОВУЄМО ФАЙЛ, А НЕ ЛИШЕ ПИШЕМО ІНШИЙ slug
// ------------------------------------------------------
// «slug = ім'я файлу» — правило, на якому тут тримається все: і
// перевірка slug-safety, і адреса запису в адмінці
// (…/entries/<slug>), і пошук товару. Розвести їх означало б завести
// дві правди про одну річ і потім усе життя стежити, щоб вони не
// розійшлись.
//
// СТАРІ АДРЕСИ НЕ ВМИРАЮТЬ
// -------------------------
// Попереднє ім'я лишається в legacySlugs, і build-product-pages.js
// ставить на нього сторінку-перенаправлення. Інакше кожне посилання,
// яке вже пішло в пост чи в пошук, привело б покупця на 404.
function renameToLatinSlugs(parsed, dir) {

    const productsDir = dir || PRODUCTS_DIR;

    // Спершу закріплюємо за собою імена, які міняти не треба: інакше
    // перейменований товар міг би зайняти чуже місце.
    const taken = new Map();

    parsed.forEach(entry => {

        const name = entry.file.replace(/\.json$/, "");

        if (toSlug(name) === name) taken.set(name, entry);

    });

    // Записи, які виявились копією того самого товару, — див. нижче.
    const superseded = new Set();

    let renamed = 0;

    parsed.forEach(entry => {

        const current = entry.file.replace(/\.json$/, "");
        const base = toSlug(current);

        if (base === current) return;

        // Порожній результат означає ім'я без жодної літери й цифри —
        // такого не буває, але вигадувати адресу з нічого не можна.
        if (!base) {
            console.error(`::error::${entry.file}: з імені не виходить адреса — перейменуйте товар в адмінці`);
            return;
        }

        let wanted = base;
        let n = 1;

        while (taken.has(wanted)) {

            const occupant = taken.get(wanted);

            // Той самий товар, а не тезка.
            //
            // ЯК ЦЕ ВИХОДИТЬ. Ви створили товар, збірка перейменувала
            // файл — але вкладка адмінки лишилась на старій сторінці.
            // Наступне «Зберегти» пише за СТАРОЮ адресою й відтворює
            // кириличний файл. Без цієї гілки збірка вирішила б, що
            // товарів два, і дала б другому адресу з «-2»: у каталозі
            // з'явився б дубль, який ніхто не створював.
            //
            // Ознака — однаковий id. Свіжіша версія (та, яку щойно
            // зберегли) перемагає, стара просто зникає.
            if (typeof occupant.data.id === "number"
                && occupant.data.id === entry.data.id) {

                superseded.add(occupant);
                taken.delete(wanted);

                console.log(`↩ ${current}.json — повторне збереження товару id=${entry.data.id}, лишаємо одну копію`);

                break;

            }

            n += 1;
            wanted = `${base}-${n}`;

        }

        if (n > 1) {
            console.warn(`::warning::${current} → ${wanted}: адресу ${base} вже зайнято іншим товаром`);
        }

        taken.set(wanted, entry);

        const nextFile = `${wanted}.json`;
        const nextPath = path.join(productsDir, nextFile);

        // Стара адреса лишається робочою — див. коментар вище.
        const legacy = Array.isArray(entry.data.legacySlugs) ? entry.data.legacySlugs : [];

        entry.data.legacySlugs = [...new Set([...legacy, current])];
        entry.data.slug = wanted;

        fs.writeFileSync(nextPath, JSON.stringify(entry.data, null, 2) + "\n", "utf8");
        fs.rmSync(entry.filePath, { force: true });

        entry.file = nextFile;
        entry.filePath = nextPath;

        console.log(`✎ ${current}.json → ${nextFile}`);

        renamed++;

    });

    // Копії прибираємо з розбору вже після перейменувань: викидати
    // елементи з масиву, який саме обходиш, — вірний спосіб пропустити
    // сусідній.
    for (let i = parsed.length - 1; i >= 0; i--) {
        if (superseded.has(parsed[i])) parsed.splice(i, 1);
    }

    if (renamed) {
        console.log(`   адрес перекладено на латиницю: ${renamed}`);
    }

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

    const broken = [];

    const parsed = files.map(file => {

        const filePath = path.join(PRODUCTS_DIR, file);
        const raw = fs.readFileSync(filePath, "utf8");

        // Порожній або битий файл товару.
        //
        // ЧОМУ ОКРЕМА ОБРОБКА. Простий JSON.parse падає з
        // «Unexpected end of JSON input» і НЕ КАЖЕ, у якому файлі
        // проблема. Так само поводиться адмінка: показує ту саму
        // помилку в консолі й порожню форму товару, а який файл винен —
        // здогадуйся сам.
        //
        // Найчастіша причина — файл, що приїхав із зіпа з зіпсованим
        // імʼям (кирилиця перетворюється в «#U0436…») і нульовим
        // розміром. Такі копії треба просто видалити.
        if (!raw.trim()) {
            broken.push(`${file}: файл порожній`);
            return null;
        }

        let data;

        try {
            data = JSON.parse(raw);
        } catch (error) {
            broken.push(`${file}: ${error.message}`);
            return null;
        }

        return { file, filePath, data };

    }).filter(Boolean);

    if (broken.length) {

        console.error("\nБиті файли товарів — їх треба видалити або виправити:");
        broken.forEach(line => console.error("  " + line));
        console.error("");

        process.exit(1);

    }

    let maxId = 0;

    parsed.forEach(({ data }) => {

        if (typeof data.id === "number" && data.id > maxId) {
            maxId = data.id;
        }

    });

    renameToLatinSlugs(parsed);

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

        if (normalizeSkus(data, file)) changed = true;

        // Фото мусить бути оригіналом, а не зменшеною копією.
        //
        // ЧОМУ ЦЕ ТРАПЛЯЄТЬСЯ
        // --------------------
        // Медіатека Decap показує ВСІ файли теки, зокрема згенеровані
        // копії -300 і -600. Для людини це просто ще один рядок у
        // списку — і за схожою назвою легко вибрати копію замість
        // оригіналу.
        //
        // ЧИМ ЦЕ ПОГАНО
        // --------------
        // Копія 300px розтягується на сторінці товару до 750 і виглядає
        // мильною. Гірше: srcset будується дописуванням суфікса, тож із
        // «photo-300.webp» виходить «photo-300-300.webp» — адреса, якої
        // не існує, і браузер лишається без потрібного розміру.
        //
        // Прибираємо суфікс автоматично: адміністратор не має тримати в
        // голові, які файли в теці справжні, а які службові.
        const stripVariant = src => String(src)
            .replace(/-(300|600|1200)(\.[a-z0-9]+)$/i, "$2");

        const fixImageList = list => {

            if (!Array.isArray(list)) return false;

            let touched = false;

            for (let i = 0; i < list.length; i++) {

                const next = stripVariant(list[i]);

                if (next !== list[i]) { list[i] = next; touched = true; }

            }

            return touched;

        };

        if (fixImageList(data.images)) changed = true;

        (data.variants || []).forEach(variant => {
            if (variant && fixImageList(variant.images)) changed = true;
        });

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

        // Залишки прибираємо разом із кольором і розміром.
        //
        // stock — це словник «колір → розмір → скільки» (див.
        // assets/js/stock.js). Ключі не зникають самі: перейменували
        // колір або прибрали розмір — запис лишався б назавжди. Гірше
        // за смітник: «Чорний: 0» від кольору, якого вже немає, тягнув
        // би товар у «під замовлення».
        //
        // Так само влаштоване прибирання framing нижче.
        if (data.stock && typeof data.stock === "object") {

            const kept = {};

            (data.variants || []).forEach(variant => {

                if (!variant || !variant.color) return;

                const raw = data.stock[variant.color];

                if (!raw || typeof raw !== "object") return;

                const sizes = new Set(
                    (Array.isArray(variant.sizes) && variant.sizes.length
                        ? variant.sizes
                        : (data.sizes || [])).map(String)
                );

                const cleaned = {};

                Object.keys(raw).forEach(size => {

                    if (!sizes.has(String(size))) return;

                    const n = Stock.qty(raw[size]);

                    if (n !== null) cleaned[String(size)] = n;

                });

                if (Object.keys(cleaned).length) kept[variant.color] = cleaned;

            });

            if (JSON.stringify(kept) !== JSON.stringify(data.stock)) {

                if (Object.keys(kept).length) data.stock = kept;
                else delete data.stock;

                console.log(`   ↻ ${file}: залишки почищено (кольори/розміри, яких уже немає)`);

                changed = true;

            }

        }

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

        // РОЗПРОДАНО — товар не потрапляє на сайт узагалі.
        //
        // Це заміна видаленню. Раніше товар, якого більше не буде,
        // доводилось видаляти з адмінки — разом із фото, описом,
        // кадруванням і артикулом. А коли постачальник привозив те саме
        // знову, все це заводили заново.
        //
        // Тепер він лишається в адмінці як є, а з сайту зникає цілком:
        // його немає в products.json, отже немає ні в каталозі, ні в
        // пошуку, ні в добірках, ні в карті сайту, ні в боті, а
        // сторінку товару прибирає build-product-pages.js. Замовити
        // його не можна навіть під замовлення — просто нічого немає.
        //
        // ЧОМУ ВИКЛЮЧЕННЯ, А НЕ ПРАПОРЕЦЬ У ДАНИХ. Списки товарів
        // будуються в шести місцях (каталог, головна, акції, пошук,
        // переглянуті, схожі). Прапорець довелось би відфільтрувати в
        // кожному — і рано чи пізно десь забули б. Тут одне місце.
        if (data.soldOut) {

            console.log(`⏭  РОЗПРОДАНО (не показуємо на сайті): ${file}`);

            return;

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

        // АРТИКУЛ КАТАЛОГУ — номер, який ставить система.
        //
        // НАВІЩО
        // -------
        // Поле «Артикул» заповнювали руками, і рано чи пізно його
        // забували: у нового годинника (id=95) не було ні загального
        // артикула, ні артикула кольору, через що в розмітці не було
        // sku і Search Console писав «Invalid value in field "sku"».
        // Порожнього артикула тепер не буває взагалі.
        //
        // ЧОМУ ЦЕ id, А НЕ ОКРЕМА НУМЕРАЦІЯ
        // ----------------------------------
        // id уже є в кожному товарі, він видається один раз (maxId+1
        // вище), більше не змінюється й не перевикористовується після
        // видалення — рівно те, що потрібно артикулу. Друга нумерація
        // поруч означала б два номери, які можуть розійтись.
        //
        // КОЛІР — СУФІКС
        // ---------------
        // Товар — «95», його кольори — «95-1», «95-2» у тому порядку,
        // у якому вони стоять в адмінці. Так за префіксом одразу видно,
        // що це той самий товар, а суфікс каже, який саме колір.
        //
        // НЕ ЗБЕРІГАЄМО В data/products/*.json
        // -------------------------------------
        // Артикул вичислюється тут, ПІСЛЯ запису файла-джерела вище.
        // Якби він лежав і у джерелі, з'явилась би друга копія номера,
        // яка може розійтися з id — а розходження такого поля помітити
        // найважче.
        data.article = String(data.id);

        (data.variants || []).forEach((variant, index) => {
            if (variant) variant.article = `${data.id}-${index + 1}`;
        });

        // ЗАЛИШКИ → «ПІД ЗАМОВЛЕННЯ»
        //
        // В адмінці залишки редагуються одним словником на товар, за
        // назвою кольору: так їх зручно бачити таблицею. Сайту ж
        // потрібне інше — залишок поруч зі своїм варіантом, бо картку
        // каталогу, свотч і розміри малюють саме з варіанта.
        //
        // Тому тут словник роз'їжджається по варіантах. І це не лише
        // зручність: нижче normalizeProductColors() зводить назви
        // кольорів до єдиного вигляду («Black чорний» → «Чорний»), і
        // пошук залишку за назвою кольору після цього вже не знайшов
        // би нічого. Залишок, покладений у сам варіант, переїзд назви
        // переживає.
        //
        // preOrder рахується ТУТ, а не на сайті, — щоб усі споживачі
        // (картка, сторінка товару, статичні сторінки, розмітка
        // schema.org, кошик, бот у Telegram) далі читали одне поле й
        // нічого про залишки не знали.
        // Спершу відповідь по товару — з неї видно, чи є взагалі сенс
        // писати щось у варіанти.
        const productPreOrder = Stock.isPreOrder(data);

        (data.variants || []).forEach(variant => {

            if (!variant) return;

            const stock = Stock.variantStock(data, variant);

            if (Stock.tracked(stock)) {

                variant.stock = stock;
                variant.inStock = Stock.total(stock);

            }

            // Перемикач «товар під замовлення» сильніший: ним
            // позначають те, що возять під замовлення завжди.
            const colorPreOrder = Boolean(data.preOrder)
                || Stock.colorSoldOut(stock, Stock.sizesOf(data, variant));

            // Пишемо поле, ЛИШЕ коли колір відрізняється від товару.
            //
            // Відрізняється він в одному випадку: цього кольору немає, а
            // товар загалом ще продається. Решта була б «preOrder: false»
            // у кожному з 126 варіантів — 126 рядків у
            // data/products.json, які нічого не повідомляють. Споживачі
            // (картка, сторінка товару) і так відкочуються до значення
            // товару, коли поля немає.
            if (colorPreOrder !== productPreOrder) variant.preOrder = colorPreOrder;
            else delete variant.preOrder;

        });

        if (Stock.productTracked(data)) data.inStock = Stock.productTotal(data);

        data.preOrder = productPreOrder;

        // Словник за кольорами далі не потрібен: усе, що з нього
        // випливає, уже лежить у варіантах. Дві копії того самого
        // рано чи пізно розійшлися б.
        delete data.stock;

        // Запамʼятовуємо файл-джерело: перенумерація ручного порядку
        // (renumberSortOrder) пише номер назад саме туди.
        Object.defineProperty(data, "__sourceFile", {
            value: file,
            enumerable: false   // у products.json це поле не потрапить
        });

        products.push(data);

    });

    renumberSortOrder(products);

    products.sort((a, b) => a.id - b.id);

    // Назви кольорів зводимо до одного вигляду ТУТ, а не в даних.
    //
    // ЧОМУ ТУТ. Колір заповнюється руками, і кожен постачальник пише
    // по-своєму: «Black чорний», «Nero», «Бежевий 1R5», «Wht-Dk Grn
    // 286». Це не помилка заповнення — так написано в джерелі, і
    // копіювати звідти нормально. Але на сайт мусить потрапляти один
    // вигляд, інакше фільтр «Колір» перетворюється на 83 пункти на 71
    // товар, а в картці під назвою стоїть артикул відтінку.
    //
    // Виправляти дані руками означало б робити це заново після
    // кожного нового товару. Тут це робиться саме, і правило видно в
    // одному місці — scripts/normalize-colors.js.
    //
    // Файли-джерела не змінюються: в адмінці лишається те, що
    // написали, разом з артикулом постачальника.
    let renamedColors = 0;

    products.forEach(product => {

        renamedColors += normalizeProductColors(product).size;

    });

    if (renamedColors) {

        console.log(`Кольори зведено до єдиного вигляду: ${renamedColors} назв`);

    }

    stampImageVersions(products);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(products, null, 2) + "\n", "utf8");

    console.log(`Готово: ${products.length} товарів → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

// Експортуємо для тестів: перейменування адрес перевіряється на
// тимчасовій теці, а не на справжньому каталозі.
module.exports = { renameToLatinSlugs };

if (require.main === module) main();
