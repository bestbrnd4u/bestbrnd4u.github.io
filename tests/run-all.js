// Запускає всі тести з цієї теки і друкує підсумок.
//
// Кожен тест — самостійний файл, який завершується кодом 0 (успіх)
// або 1 (провал). Раннер лише збирає їх докупи, щоб можна було
// запустити одне `npm test` і в GitHub Actions отримати єдиний
// зрозумілий результат.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DIR = __dirname;

const files = fs.readdirSync(DIR)
    .filter(f => f.startsWith("test") && f.endsWith(".js"))
    .sort();

let failed = [];
let passedChecks = 0;

console.log(`\nЗапуск ${files.length} наборів тестів\n`);

files.forEach(file => {

    const result = spawnSync("node", [path.join(DIR, file)], { encoding: "utf8" });
    const output = (result.stdout || "") + (result.stderr || "");

    // рахуємо галочки, щоб бачити реальний обсяг покриття
    passedChecks += (output.match(/✓/g) || []).length;

    if (result.status === 0) {

        console.log(`  ✅ ${file}`);

    } else {

        failed.push(file);

        console.log(`  ❌ ${file}`);

        // показуємо лише провалені перевірки, щоб лог не роздувався
        output.split("\n")
            .filter(line => line.includes("✗") || line.includes("Error"))
            .slice(0, 10)
            .forEach(line => console.log(`      ${line.trim()}`));

    }

});

console.log(`\n${"─".repeat(50)}`);
console.log(`Наборів: ${files.length}   Перевірок пройдено: ${passedChecks}`);

if (failed.length) {

    console.log(`\n❌ Провалено наборів: ${failed.length}`);
    failed.forEach(f => console.log(`   • ${f}`));
    process.exit(1);

}

console.log(`\n✅ Усі тести пройдено`);
