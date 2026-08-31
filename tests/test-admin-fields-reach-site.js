// Поле, збережене в адмінці, мусить доїжджати до сайту.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Акції й добірки збираються в data/*.json за ЯВНИМ переліком полів
// (`promotions.push({ ... })`), а не копіюванням усього запису. Перелік
// доводиться доповнювати руками, і про це забували:
//
//   • «Кадрування фото» в акції — app.js кличе
//     ImageFraming.frameStyleAttr(promo.framing, src), але framing у
//     data/promotions.json не потрапляв;
//   • «Оформлення тексту і кнопки» в акції — app.js кличе
//     blockStyleClass(promo.style) на картці, слайдері й великому
//     банері, а style туди теж не потрапляв;
//   • те саме style у добірці — renderCollectionWidget() його читає.
//
// Тобто адміністратор тягнув точку кадрування чи обирав шрифт, кнопка
// «Зберегти» відповідала «збережено», і на сайті не змінювалось
// НІЧОГО. Помітити це неможливо: адмінка не має способу сказати «я
// зберегла, але це нікуди не поїде».
//
// ЩО ПЕРЕВІРЯЄМО
// ---------------
// Не «чи є framing у збірці» — таку перевірку доведеться дописувати на
// кожне нове поле, тобто рівно там, де вже помилились. Перевіряємо
// УЗГОДЖЕНІСТЬ двох боків:
//
//   сайт читає поле  ⟹  збірка мусить його передавати.
//
// Обидва боки беремо з живого коду: перелік полів — з admin/config.yml,
// вихідний об'єкт — виконанням справжнього літерала з build-*.js.
// Зустрічний бік (збірка передає, а сайт не читає) — не помилка й лише
// друкується: slug, order і active потрібні самій збірці.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const { loadYaml } = require("./helpers/yaml");

const config = loadYaml("admin/config.yml");

// Об'єкт із `<щось>.push({ ... })` — рівно той, який пише збірка.
// Дужки шукаємо балансуванням, а не регуляркою: усередині є і вкладені
// об'єкти, і тернарні оператори з фігурними дужками.
function pushedLiteral(source) {

    const start = source.indexOf(".push({");

    if (start < 0) return null;

    let i = source.indexOf("{", start);

    let depth = 0;

    for (let j = i; j < source.length; j++) {

        if (source[j] === "{") depth++;

        else if (source[j] === "}") {

            depth--;

            if (depth === 0) return source.slice(i, j + 1);

        }

    }

    return null;

}

// Заповнюємо КОЖНЕ поле адмінки — інакше умовні `...(data.x ? ...)`
// промовчали б, і перевірка нічого б не побачила.
function filledEntry(fields) {

    const data = {};

    fields.forEach(field => {

        const name = field.name;

        switch (field.widget) {

            case "boolean":
                // false, а не true: умовні спреди в збірках написані
                // саме під «вимкнено» (autoBrand, splitByColor).
                data[name] = false;
                break;

            case "number":
                data[name] = 7;
                break;

            case "list":
            case "select":
                data[name] = field.multiple || field.widget === "list"
                    ? [{ gender: "Жінкам", color: "#111827" }]
                    : "card";
                break;

            case "productPicker":
            case "sectionPicker":
                data[name] = [1, 2];
                break;

            case "object":
                data[name] = { font: "inter", uppercase: true };
                break;

            case "imageFraming":
                // Словник «ім'я файлу → кадр» (див. image-framing.js).
                data[name] = { "banner.webp": { x: 30, y: 70, zoom: 1.4 } };
                break;

            default:
                data[name] = `${name}-value`;

        }

    });

    return data;
}

// ГРУПИ ПОЛІВ, які сайт читає в межах одного файла-агрегату.
const GROUPS = [
    {
        collection: "promotions",
        script: "scripts/build-promotions.js",
        aggregate: "data/promotions.json",
        // Як називається змінна запису у фронтенді — за нею й дивимось,
        // чи поле взагалі комусь потрібне.
        accessor: "promo",
        consumers: ["assets/js/app.js", "assets/js/promo.js", "assets/js/common.js"],
        // Поле, якого сайт не читає, і чому це нормально.
        internal: {
            active: "фільтр самої збірки: вимкнена акція не потрапляє у файл",
            products: "перейменоване в productIds",
            style: null,      // читається — мусить передаватись
            framing: null
        }
    },
    {
        collection: "collections",
        script: "scripts/build-collections.js",
        aggregate: "data/collections.json",
        accessor: "collection",
        consumers: ["assets/js/app.js"],
        internal: {
            active: "фільтр самої збірки",
            products: "перейменоване в productIds"
        }
    },
    {
        collection: "promoPopups",
        script: "scripts/build-promo-popups.js",
        aggregate: "data/promo-popups.json",
        accessor: "popup",
        consumers: ["assets/js/promo-popup.js"],
        internal: {
            active: "фільтр самої збірки",
            title: "підпис запису в списку адмінки; на сайті банер — це лише фото",
            style: "фронт його не читає взагалі (банер без тексту) — мертве поле в адмінці"
        }
    }
];


GROUPS.forEach(group => {

    console.log(`\n[${group.collection}] Що адмінка зберігає — те сайт і бачить`);

    const collection = config.collections.find(c => c.name === group.collection);

    const fields = collection.fields || [];

    const source = read(group.script);

    const literal = pushedLiteral(source);

    check("вихідний об'єкт збірки знайдено", !!literal,
        "не видно `.push({` у " + group.script);

    if (!literal) return;

    const data = filledEntry(fields);

    // Виконуємо СПРАВЖНІЙ літерал: так перевіряється код збірки, а не
    // його опис регуляркою.
    const built = new Function("data", "slug", "genderButtons",
        `return (${literal});`)(data, "test-slug", []);

    const emitted = new Set(Object.keys(built));

    const consumerSource = group.consumers.map(read).join("\n");

    fields.forEach(field => {

        const name = field.name;

        // Чи звертається фронт до цього поля запису.
        const used = new RegExp(`\\b${group.accessor}\\.${name}\\b`).test(consumerSource);

        const excuse = Object.prototype.hasOwnProperty.call(group.internal, name)
            ? group.internal[name]
            : undefined;

        if (used) {

            check(`«${field.label || name}» (${name}) доїжджає до сайту`,
                emitted.has(name),
                "сайт читає " + group.accessor + "." + name + ", а збірка поле не передає");

            // Виправдання для поля, яке насправді читається, — це
            // застаріле виправдання: саме так помилка й ховається.
            check(`  і не позначене як внутрішнє`, !excuse, String(excuse));

            return;

        }

        // Не читається фронтом — має бути пояснення. Без нього поле або
        // мертве в адмінці, або про нього просто забули.
        if (!emitted.has(name)) {

            check(`«${field.label || name}» (${name}) — пояснено, чому не на сайті`,
                excuse !== undefined && excuse !== null, "поясніть у internal або підключіть");

        }

    });

});

console.log("\n[framing і style в акціях — те, на чому це зловили]");
{
    const source = read("scripts/build-promotions.js");

    const literal = pushedLiteral(source);

    const build = data => new Function("data", "slug", "genderButtons",
        `return (${literal});`)(data, "s", []);

    const заповнена = build({
        title: "t", image: "i", link: "l",
        framing: { "banner.webp": { x: 20, y: 80 } },
        style: { font: "playfair", uppercase: true }
    });

    check("кадрування передається як є",
        заповнена.framing && заповнена.framing["banner.webp"].y === 80,
        JSON.stringify(заповнена.framing));

    check("оформлення передається як є",
        заповнена.style && заповнена.style.font === "playfair",
        JSON.stringify(заповнена.style));

    // Порожнє поле не має плодити "framing": {} у ста акціях — з тієї
    // самої причини, що й autoBrand поруч.
    const порожня = build({ title: "t", image: "i", link: "l" });

    check("незаповнене кадрування ключа не додає", !("framing" in порожня));
    check("незаповнене оформлення теж", !("style" in порожня));

    const пусті = build({ title: "t", image: "i", link: "l", framing: {}, style: {} });

    check("порожній об'єкт теж не пишемо",
        !("framing" in пусті) && !("style" in пусті),
        JSON.stringify(пусті.framing) + " / " + JSON.stringify(пусті.style));
}

console.log("\n[Добірки: те саме оформлення]");
{
    const literal = pushedLiteral(read("scripts/build-collections.js"));

    const build = data => new Function("data", "slug", `return (${literal});`)(data, "s");

    const базове = { title: "t", image: "i", products: [1] };

    check("оформлення добірки передається",
        build({ ...базове, style: { align: "center" } }).style.align === "center");

    check("без оформлення ключа немає",
        !("style" in build(базове)));
}

console.log("\n[Агрегати на диску лишились валідними]");
{
    // Перезбірка мусить давати той самий файл: якщо ні — у репозиторії
    // лежить не те, що збереться на CI.
    ["data/promotions.json", "data/collections.json", "data/promo-popups.json"].forEach(file => {

        const parsed = JSON.parse(read(file));

        check(`${file} читається і не порожній`, Array.isArray(parsed) && parsed.length > 0,
            String(parsed && parsed.length));

        // Жодних порожніх style/framing — інакше збірка шумить у diff.
        const шум = parsed.filter(item =>
            (item.style && !Object.keys(item.style).length)
            || (item.framing && !Object.keys(item.framing).length));

        check(`${file} без порожніх style/framing`, шум.length === 0,
            шум.map(i => i.slug).join(", "));

    });
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
