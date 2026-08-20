// Чи збережеться те, що вже лежить у репозиторії.
//
// ІСТОРІЯ, ЗАРАДИ ЯКОЇ ЦЕЙ НАБІР ІСНУЄ
// -------------------------------------
// 26 із 38 товарів раптом перестали публікуватись з адмінки. Decap
// відповідав «Oops, you've missed a required field. Please complete
// before saving.» і не показував, яке саме поле винне — прапорець
// стояв далеко внизу форми й на око виглядав заповненим.
//
// Причина — у двох правилах Decap, які накладаються одне на одне:
//
//   1. поле вважається обов'язковим, якщо required НЕ вказано явно:
//        const isRequired = field.get("required", true)
//   2. default застосовується ЛИШЕ при створенні нового запису
//      (createEmptyDraftData), а не при відкритті вже збереженого.
//
// Тобто варто додати в config.yml нове поле з default і без
// required: false — і всі записи, збережені ДО цього, стають
// неredагованими. Дані при цьому цілі; ламається саме збереження.
//
// Перевірка нижче свідомо йде від ДАНИХ, а не від конфіга: вона
// відкриває кожен існуючий запис і питає, чи пройде він валідацію
// Decap. Це ловить і майбутні поля, про які ще ніхто не думав.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { loadYaml } = require("./helpers/yaml");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const config = loadYaml("admin/config.yml");

// Повторює isEmpty() з decap-cms: порожньо — це null/undefined,
// порожній рядок, порожній список. Але НЕ false: вимкнений прапорець
// є повноцінним значенням і валідацію проходить.
function isEmptyForDecap(value) {

    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value === "";
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "object") return Object.keys(value).length === 0;

    return false;

}

const collections = (config.collections || []).filter(c => c.folder && c.fields);

console.log("\n[1] Кожен збережений запис можна відкрити й зберегти знову");
{
    const blocked = [];

    collections.forEach(collection => {

        const dir = path.join(ROOT, collection.folder);

        if (!fs.existsSync(dir)) return;

        // required не вказано → Decap читає його як true
        const required = collection.fields.filter(f => f.required !== false);

        fs.readdirSync(dir).filter(f => f.endsWith(".json")).forEach(file => {

            const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));

            required.forEach(field => {
                if (isEmptyForDecap(data[field.name])) {
                    blocked.push(`${collection.name}/${file} → «${field.label || field.name}»`);
                }
            });

        });

    });

    check(`жоден запис не блокується (перевірено колекцій: ${collections.length})`,
        blocked.length === 0,
        blocked.length ? `${blocked.length} шт., напр.: ${blocked.slice(0, 3).join("; ")}` : "");
}

console.log("\n[2] Поля з default мусять мати явний required");
{
    // Саме ця пара — default без required — і створює пастку:
    // нові записи виглядають нормально, старі перестають зберігатись.
    const risky = [];

    const scan = (collectionName, fields, prefix) => {

        (fields || []).forEach(field => {

            if (field.default !== undefined && field.required === undefined) {
                risky.push(`${collectionName}: ${prefix}${field.name}`);
            }

            // вкладені поля (list/object) перевіряємо теж
            if (field.fields) scan(collectionName, field.fields, `${prefix}${field.name}.`);

        });

    };

    (config.collections || []).forEach(c => scan(c.name, c.fields, ""));

    check("немає полів з default без явного required", risky.length === 0,
        risky.slice(0, 5).join("; "));
}

console.log("\n[3] Прапорці, через які все й почалось");
{
    const products = collections.find(c => c.name === "products");
    const byName = name => (products.fields || []).find(f => f.name === name);

    ["forcePublish", "isNew"].forEach(name => {

        const field = byName(name);

        check(`«${name}» позначений необов'язковим`, field && field.required === false,
            field ? String(field.required) : "поля немає");

    });

    // вимкнений прапорець — це значення, а не порожнеча
    check("false не вважається порожнім", !isEmptyForDecap(false));
    check("undefined вважається порожнім", isEmptyForDecap(undefined));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
