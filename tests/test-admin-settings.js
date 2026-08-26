// Налаштування з адмінки не мають виїжджати порожніми.
//
// ЩО СТАЛОСЯ
// -----------
// Я створив data/analytics.json із порожнім measurementId — як
// заготовку. Далі кожен архів віз цю заготовку з собою і перезаписував
// той файл, у який Ілля вписав справжній ідентифікатор через адмінку.
// Статистика мовчки вимикалась: сайт працює, запитів до Google просто
// немає, і зрозуміти чому — тільки заглянувши у файл.
//
// Це ширша проблема, ніж один файл. Усе, що редагується в адмінці, —
// це ДАНІ МАГАЗИНУ, а не код. Архів із кодом не має їх торкатися.
//
// Перевірка нижче не дасть відправити архів, у якому налаштування
// затерті порожнім значенням.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const { loadYaml } = require("./helpers/yaml");

console.log("\n[1] Налаштування адмінки заповнені");
{
    const pages = loadYaml("admin/config.yml").collections
        .find(c => c.name === "pages");

    const files = (pages.files || []);

    check(`розділів налаштувань — ${files.length}`, files.length > 0);

    files.forEach(entry => {

        const full = path.join(ROOT, entry.file);

        check(`${entry.file} існує`, fs.existsSync(full));

        if (!fs.existsSync(full)) return;

        const data = JSON.parse(fs.readFileSync(full, "utf8"));

        // Шукаємо поля, які оголошені в адмінці й лежать порожніми.
        //
        // Не всі порожні поля — помилка: «Картинка для телефона»
        // необовʼязкова, і порожньою вона означає «взяти десктопну».
        // Тому дивимось лише на ті, без яких розділ не працює взагалі.
        const critical = {
            "data/analytics.json": ["measurementId"],
            "data/telegram.json": ["botUsername"]
        }[entry.file] || [];

        critical.forEach(field => {

            const value = String(data[field] || "").trim();

            check(`${entry.file} → ${field} заповнене`, value.length > 0,
                "порожнє — налаштування не діє");

        });

    });
}

console.log("\n[2] Значення виглядають правдоподібно");
{
    // Формат перевіряємо теж: порожнє поле хоч видно, а зіпсоване
    // значення виглядає заповненим і тихо не працює.
    const analytics = JSON.parse(
        fs.readFileSync(path.join(ROOT, "data/analytics.json"), "utf8"));

    check("ідентифікатор Google має правильний вигляд",
        /^G-[A-Z0-9]{6,12}$/.test(String(analytics.measurementId || "")),
        analytics.measurementId);

    const telegram = JSON.parse(
        fs.readFileSync(path.join(ROOT, "data/telegram.json"), "utf8"));

    // Логін бота в Telegram завжди без @ і завжди закінчується на bot.
    check("логін бота без @",
        !String(telegram.botUsername || "").startsWith("@"),
        telegram.botUsername);
    check("логін бота схожий на бота",
        /bot$/i.test(String(telegram.botUsername || "")),
        telegram.botUsername);
}

console.log("\n[3] Прод-збірка не втрачає налаштування");
{
    // Окремо від вмісту: навіть заповнений файл ні до чого, якщо він не
    // потрапляє в коміт. Саме так раніше губились telegram.json і
    // search-banners.json — прод-збірка перелічувала файли поіменно.
    const prod = fs.readFileSync(
        path.join(ROOT, ".github/workflows/build-products.yml"), "utf8");

    check("прод бере теку data цілком", /git add -A data\b/.test(prod));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
