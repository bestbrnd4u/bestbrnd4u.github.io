// Збирає Edge Function в ОДИН самодостатній файл index.ts.
//
// Навіщо: у панелі Supabase функція з кількох файлів деплоїться
// незручно — другий файл легко не долити, і збірка падає з
// "Module not found ... format.js". Один файл цієї проблеми не має.
//
// Але тримати логіку в одному файлі теж не годиться: тоді її не
// протестуєш у Node без імітації Deno. Тому джерела лишаються
// роздільними:
//
//   format.js      — чиста логіка (її ганяють тести)
//   _index.src.ts  — мережа, база, маршрутизація
//   index.ts       — ЗГЕНЕРОВАНИЙ, саме його деплоять
//
// Так копія не може розійтися з оригіналом: index.ts завжди
// перезбирається з джерел, а тест звіряє, що він не застарів.

const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "supabase", "functions", "telegram-order-bot");

const OUTPUT = path.join(DIR, "index.ts");
const SOURCE = path.join(DIR, "_index.src.ts");

// Чисті модулі, які вклеюються у зібраний файл. Порядок — той, у
// якому їх зручно читати; на роботу він не впливає, бо всередині
// лише оголошення.
const MODULES = ["format.js", "order-flow.js", "admin-api.js"];

function build() {

    const source = fs.readFileSync(SOURCE, "utf8");

    // прибираємо ключове слово export — усе стає локальним у межах
    // одного файлу
    // модулі імпортують один з одного (order-flow.js і admin-api.js
    // беруть спільне з format.js) — у зібраному файлі все лежить
    // поруч, тож і ці імпорти прибираємо
    const inlined = MODULES
        .map(name => fs.readFileSync(path.join(DIR, name), "utf8"))
        .map(src => src.replace(/^export\s+/gm, ""))
        .map(src => src.replace(/^import\s*\{[\s\S]*?\}\s*from\s*["']\.\/[^"']+["'];?\s*$/gm, ""))
        .join("\n\n");

    // прибираємо рядок імпорту: те, що він імпортував, тепер лежить
    // прямо тут, вище за викликами
    // прибираємо ВСІ локальні імпорти: те, що вони імпортували,
    // тепер лежить прямо тут, вище за викликами
    const handlers = source.replace(
        /^import\s*\{[\s\S]*?\}\s*from\s*["']\.\/[^"']+["'];?\s*$/gm,
        "",
    );

    const header = [
        "// ⚠️ ЦЕЙ ФАЙЛ ЗГЕНЕРОВАНО АВТОМАТИЧНО — НЕ РЕДАГУЙТЕ ВРУЧНУ.",
        "//",
        "// Джерела:",
        "//   supabase/functions/telegram-order-bot/format.js      (картка замовлення)",
        "//   supabase/functions/telegram-order-bot/order-flow.js  (діалог оформлення)",
        "//   supabase/functions/telegram-order-bot/admin-api.js   (панель замовлень в адмінці)",
        "//   supabase/functions/telegram-order-bot/_index.src.ts  (мережа й база)",
        "//",
        "// Перезібрати:  node scripts/build-edge-function.js",
        "//",
        "// Саме цей файл вставляють у панель Supabase — він",
        "// самодостатній, нічого доливати не треба.",
        "",
        "",
    ].join("\n");

    return header + inlined.trimEnd() + "\n\n" + handlers.trimStart();

}

// експортуємо, щоб тест міг перевірити актуальність без запису на диск
module.exports = { build, OUTPUT };

if (require.main === module) {

    fs.writeFileSync(OUTPUT, build(), "utf8");

    console.log("Зібрано:", path.relative(process.cwd(), OUTPUT));

}
