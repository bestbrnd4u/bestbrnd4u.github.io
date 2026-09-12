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
// Запускач справжнього літерала збірки.
//
// ПОМІЧНИКИ, ЯКІ ЛІТЕРАЛ КЛИЧЕ ВСЕРЕДИНІ, подаємо сюди ж — і саме
// їхньою справжньою реалізацією зі скрипта збірки, а не заглушкою.
// Інакше перевірка або впаде на ReferenceError (так і сталось, коли в
// акції з'явились дати початку й кінця), або — що гірше — перевірятиме
// не той код, що працює.
//
// Кожен новий помічник дописується в HELPERS. Незручність помітна, але
// вона краща за тиху: забули — тест червоніє одразу, а не мовчки
// перевіряє порожнечу.
//
// ШУКАЄМО НЕ ЛИШЕ У САМІЙ ЗБІРЦІ. promoDate() переїхав у
// scripts/promo-deals.js (ті самі дати читає збірка ТОВАРІВ заради
// ціни дня, а вона йде раніше за збірку акцій). Поки запускач дивився
// тільки у власний файл збірки, він не знаходив помічника й тихо
// підставляв заглушку — після чого «поле не доїжджає до сайту»
// повідомлялось про цілком робочий код.
const HELPERS = ["promoDate"];

const HELPER_SOURCES = ["scripts/promo-deals.js", "scripts/letter-schedule.js"]
    .filter(rel => fs.existsSync(path.join(ROOT, rel)))
    .map(rel => fs.readFileSync(path.join(ROOT, rel), "utf8"));

function helperSource(name, source) {

    const pattern = new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`);

    const found = [source, ...HELPER_SOURCES]
        .map(text => text.match(pattern))
        .find(Boolean);

    // Мовчазна заглушка тут — найгірше, що можна зробити: тест
    // перевірятиме порожнечу й звинуватить у цьому збірку.
    if (!found) throw new Error(`не знайшов ${name}() ні у збірці, ні в ${HELPER_SOURCES.length} сусідніх модулях`);

    return found[0];

}

// Варіант зі списку самого поля. Decap дозволяє і рядки, і
// {label, value}.
//
// ПЕРЕБИРАЄМО ВСІ, А НЕ БЕРЕМО ПЕРШИЙ.
//
// Деякі варіанти означають «нічого не робити» — і збірка їх навмисно
// не передає: «Банер у блоці: немає», «Ніде» для бейджа. Якщо
// заповнювати поле лише першим варіантом, такий select виглядав би
// полем, яке не доїжджає до сайту, хоча він доїжджає — просто іншим
// значенням.
//
// Та сама логіка, що з перемикачами: поле вважається робочим, якщо
// його переносить ХОЧА Б ОДИН зі станів.
function optionValue(field, index) {

    const options = (field.options || []).filter(o => o !== undefined && o !== null);

    if (!options.length) return "card";

    const pick = options[(index || 0) % options.length];

    return typeof pick === "object" ? pick.value : pick;

}

// Скільки різних заповнень треба, щоб перебрати всі варіанти всіх
// списків: найдовший список і задає кількість.
function optionRounds(fields) {

    return fields.reduce((max, field) => Math.max(max,
        (field.options || []).length || 1), 1);

}

function literalRunner(source) {

    const literal = pushedLiteral(source);

    if (!literal) return null;

    const helpers = HELPERS.map(name =>
        new Function(`${helperSource(name, source)}\nreturn ${name};`)());

    // Літерал спирається не лише на функції, а й на переліки поруч із
    // ним: LAYOUTS — дозволені розкладки банера. Поки їх тут не було,
    // запускач падав на ReferenceError, і набір червонів на цілком
    // робочому коді — так уже сталося з promoDate().
    //
    // Беремо перелік із САМОГО джерела збірки: свій список тут означав
    // би, що тест перевіряє не те, що працює.
    // Перелік буває і в кілька рядків, і в один — беремо обидві форми.
    // Поки бралась лише багаторядкова, однорядковий DEAL_ALIGNS
    // лишався невідомим, і запускач падав на ReferenceError.
    const consts = [...source.matchAll(/^const ([A-Z_][A-Z0-9_]*) = (\[[\s\S]*?\]);$/gm)]
        .map(hit => ({ name: hit[1], value: new Function(`return ${hit[2]};`)() }));

    // МОДУЛІ, ЯКІ ЛІТЕРАЛ ВИМАГАЄ ЧЕРЕЗ require.
    //
    // Розкладку блока «Ціна дня» рахує спільний модуль — його читають
    // сайт, збірка й адмінка. У пісочниці require не спрацює (літерал
    // виконується у порожньому new Function), тож подаємо СПРАВЖНІЙ
    // модуль аргументом. Своя заглушка означала б, що тест перевіряє
    // не той код, який працює.
    const modules = [...source.matchAll(/^const (\w+) = require\("([^"]+)"\);$/gm)]
        .filter(hit => hit[2].startsWith("../assets/"))
        .map(hit => ({
            name: hit[1],
            value: require(path.join(ROOT, hit[2].replace("../", "")))
        }));

    const names = HELPERS.concat(consts.map(c => c.name), modules.map(m => m.name));
    const values = helpers.concat(consts.map(c => c.value), modules.map(m => m.value));

    return data => new Function("data", "slug", "genderButtons", ...names,
        `return (${literal});`)(data, "test-slug", [], ...values);

}

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
// ПЕРЕМИКАЧІ ПЕРЕВІРЯЄМО В ОБОХ СТАНАХ.
//
// Умовні спреди в збірках написані під ОДИН зі станів, і під який
// саме — залежить від поля: autoBrand і splitByColor доїжджають, коли
// вимкнені, hideCountdown — коли увімкнений. Поки тут стояло глухе
// false, набір повідомляв «поле не доїжджає до сайту» про цілком
// робочий перемикач, який просто означає протилежне.
//
// Тому запис заповнюється двічі, і поле вважається доїхавшим, якщо
// його переніс хоча б один зі станів.
function filledEntry(fields, booleans, round) {

    const data = {};

    fields.forEach(field => {

        const name = field.name;

        switch (field.widget) {

            case "boolean":
                // Значення підставляє filledEntry(fields, booleans) —
                // перемикачі перевіряються В ОБОХ станах, див. нижче.
                data[name] = booleans;
                break;

            case "number":
                data[name] = 7;
                break;

            case "list":
            case "select":
                // ЗНАЧЕННЯ БЕРЕМО З ВЛАСНИХ ВАРІАНТІВ ПОЛЯ, а не
                // однакове на всі списки.
                //
                // Тут стояло "card" — чинний «спосіб показу», але для
                // будь-якого іншого select чуже слово. Збірка такі
                // значення відкидає (вона звіряє їх із переліком), і
                // набір повідомляв «поле не доїжджає до сайту» про
                // цілком робоче поле. Так уже сталося з розкладкою
                // банера.
                data[name] = field.multiple || field.widget === "list"
                    ? [{ gender: "Жінкам", color: "#111827" }]
                    : optionValue(field, round);
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

            case "datetime":
                // СПРАВЖНЯ дата, а не рядок «startsAt-value».
                //
                // Збірка дати перевіряє (див. promoDate у
                // build-promotions.js) і сміття відкидає мовчки — тож
                // із загальною заглушкою поле «не доїжджало» до сайту,
                // і перевірка звинувачувала збірку в тому, чого та не
                // робила. Саме на цьому воно й спіймалось, коли в
                // акцію додали розклад.
                data[name] = "2026-12-31T23:00:00+02:00";
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
        // Розкладку блока «Ціна дня» читає спільний модуль, а не сам
        // app.js: у ньому поля звуться p.dealBanner. Без нього поля
        // розкладки виглядали б нікому не потрібними — хоча саме вони й
        // вирішують, що де стоїть.
        accessor: ["promo", "p"],
        consumers: ["assets/js/app.js", "assets/js/promo.js", "assets/js/common.js", "assets/js/deal-layout.js"],
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
        // Два імені, бо набір товарів добірка бере СПІЛЬНИМ правилом з
        // акціями (collectionProducts → promotionProducts у common.js),
        // і там запис зветься promo. Без другого імені поле, яке читає
        // саме правило — autoSections, productIds, — виглядало б
        // нікому не потрібним.
        accessor: ["collection", "promo"],
        consumers: ["assets/js/app.js", "assets/js/common.js"],
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

    // Виконуємо СПРАВЖНІЙ літерал: так перевіряється код збірки, а не
    // його опис регуляркою.
    const run = literalRunner(source);

    // Перебираємо ОБИДВА стани перемикачів і ВСІ варіанти списків:
    // поле вважається робочим, якщо його переносить хоча б одне
    // заповнення.
    const emitted = new Set();

    for (let round = 0; round < optionRounds(fields); round++) {

        [false, true].forEach(booleans => {

            Object.keys(run(filledEntry(fields, booleans, round)))
                .forEach(key => emitted.add(key));

        });

    }

    const consumerSource = group.consumers.map(read).join("\n");

    fields.forEach(field => {

        const name = field.name;

        // Чи звертається фронт до цього поля запису. Імен може бути
        // кілька: спільне правило набору зветься всередині promo.
        const accessors = Array.isArray(group.accessor) ? group.accessor : [group.accessor];

        const used = accessors.some(accessor =>
            new RegExp(`\\b${accessor}\\.${name}\\b`).test(consumerSource));

        const excuse = Object.prototype.hasOwnProperty.call(group.internal, name)
            ? group.internal[name]
            : undefined;

        if (used) {

            check(`«${field.label || name}» (${name}) доїжджає до сайту`,
                emitted.has(name),
                "сайт читає " + accessors.join("|") + "." + name + ", а збірка поле не передає");

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

    const build = literalRunner(source);

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
