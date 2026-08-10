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

const FORMAT = path.join(DIR, "format.js");
const SOURCE = path.join(DIR, "_index.src.ts");
const OUTPUT = path.join(DIR, "index.ts");

function build() {

    const format = fs.readFileSync(FORMAT, "utf8");
    const source = fs.readFileSync(SOURCE, "utf8");

    // прибираємо ключове слово export — усе стає локальним у межах
    // одного файлу
    const inlined = format.replace(/^export\s+/gm, "");

    // прибираємо рядок імпорту: те, що він імпортував, тепер лежить
    // прямо тут, вище за викликами
    const handlers = source.replace(
        /^import\s*\{[^}]*\}\s*from\s*["']\.\/format\.js["'];?\s*$/m,
        "",
    );

    const header = [
        "// ⚠️ ЦЕЙ ФАЙЛ ЗГЕНЕРОВАНО АВТОМАТИЧНО — НЕ РЕДАГУЙТЕ ВРУЧНУ.",
        "//",
        "// Джерела:",
        "//   supabase/functions/telegram-order-bot/format.js      (чиста логіка)",
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
