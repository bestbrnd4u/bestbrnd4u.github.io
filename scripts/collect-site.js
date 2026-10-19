// Збирає теку, яку виливаємо на GitHub Pages.
//
// Запуск (із .github/workflows/deploy-pages.yml):
//   node scripts/collect-site.js _site
//
// НАВІЩО
// -------
// Виливка робилась із `path: .` — на Pages їхав увесь репозиторій.
// Заміряно 19.10.2026: зі 155 МБ опублікованого сайту 44 МБ не
// потрібні відвідувачу ніяк —
//
//     assets/images/_originals   16 МБ   копії фото до обробки
//     assets/images/_archive     17 МБ   зняті з сайту банери
//     scripts/                  5,4 МБ   код збірки
//     tests/                    4,0 МБ   самі тести
//     supabase/                 1,6 МБ   міграції й код функції
//
// і все це віддавалось публічно: /tests/test-oversell.js та
// /supabase/migrations/011-stock-reservation.sql повертали 200.
//
// Це не охайність. У GitHub Pages ліміт опублікованого сайту — 1 ГБ,
// а кожен товар додає близько 0,75 МБ фотографій. Третина бюджету,
// витрачена на службові файли, — це сотні товарів, яких магазин не
// зможе виставити, поки хтось не розбереться, куди поділось місце.
//
// ЧОМУ ОКРЕМИЙ СКРИПТ, А НЕ РЯДОК RSYNC У YAML
// ---------------------------------------------
// Перелік винятків — класичний спосіб тихо зламати сайт: досить
// додати рядок, і потрібний файл перестає їхати. У репозиторії він на
// місці, git чистий, сторінка відкривається — просто без картинки або
// без скрипта.
//
// Скрипт можна ВИКОНАТИ в тестах і подивитись на результат, а рядок у
// YAML можна хіба що звірити регуляркою. tests/test-published-tree.js
// саме це й робить: збирає сайт у тимчасову теку й перевіряє, що там
// є кожен файл, на який посилається розмітка.
//
// ЧОМУ НЕ ЧИСТИМО РОБОЧУ ТЕКУ
// ----------------------------
// Останній крок виливки запускає scripts/purge-cache.js — тобто
// scripts/ має лишитись на місці. Тому копіюємо в окрему теку, а не
// видаляємо зайве з наявної.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Шляхи ВІД КОРЕНЯ репозиторію. Саме від кореня, а не просто назви:
// інакше виняток «archive» вигріб би ще й assets/images/_archive за
// збігом назви, а «docs» — будь-яку теку docs усередині сайту.
const ВИНЯТКИ = [
    ".git",
    ".github",
    ".gitignore",
    ".gitattributes",
    ".claude",
    ".playwright-mcp",
    "node_modules",
    "archive",
    "docs",
    "scripts",
    "tests",
    "supabase",
    "package.json",
    "package-lock.json",
    "assets/images/_originals",
    "assets/images/_archive"
];

// Файли в корені, без яких сайт ламається або втрачає домен. У
// розмітці на них ніхто не посилається, тому їх найлегше випадково
// виключити — і найважче помітити:
//
//   .nojekyll   без нього Pages ховає все, що починається з «_»
//   CNAME       власний домен (лежить лише в гілці main)
//   robots.txt, sitemap.xml, feed.xml, llms.txt — пошук і фід
//   <32 hex>.txt — ключ IndexNow, підтверджує право надсилати адреси
const ОБОВЯЗКОВІ = [".nojekyll", "CNAME", "robots.txt", "sitemap.xml", "feed.xml", "llms.txt"];

// Збіг ТОЧНИЙ, без перевірки «чи лежить усередині».
//
// Цього досить, бо обхід нижче відсікає теку цілком і в неї не
// заходить: до файлів усередині assets/images/_originals справа
// просто не доходить. Перевірка на вкладеність тут була — і виявилась
// недосяжною: жоден злам не зміг її зачепити, бо кожен шлях, який
// сюди потрапляє, лежить рівно на один рівень глибше за вже дозволену
// теку.
//
// Звідси умова до переліку: шляхи від кореня, без кінцевої скісної.
function виключено(відносний, dest) {

    // Сама тека призначення — інакше копіювали б її в себе.
    if (відносний === dest) return true;

    return ВИНЯТКИ.includes(відносний);

}

function collect(dest, { тихо = false } = {}) {

    const ціль = path.isAbsolute(dest) ? dest : path.join(ROOT, dest);

    const маркер = path.relative(ROOT, ціль).split(path.sep).join("/");

    fs.rmSync(ціль, { recursive: true, force: true });
    fs.mkdirSync(ціль, { recursive: true });

    let файлів = 0;
    let байтів = 0;

    (function обійти(каталог) {

        for (const entry of fs.readdirSync(каталог, { withFileTypes: true })) {

            const повний = path.join(каталог, entry.name);

            const відносний = path.relative(ROOT, повний).split(path.sep).join("/");

            if (виключено(відносний, маркер)) continue;

            if (entry.isDirectory()) {

                обійти(повний);

            } else {

                const куди = path.join(ціль, відносний);

                fs.mkdirSync(path.dirname(куди), { recursive: true });
                fs.copyFileSync(повний, куди);

                файлів++;
                байтів += fs.statSync(повний).size;

            }

        }

    })(ROOT);

    // Обовʼязкові файли перевіряємо ПІСЛЯ копіювання, а не звіряємо з
    // переліком винятків: виняток — не єдиний спосіб їх загубити.
    // Головне питання одне — чи лежить файл у зібраній теці.
    const зниклі = ОБОВЯЗКОВІ
        .filter(f => fs.existsSync(path.join(ROOT, f)))
        .filter(f => !fs.existsSync(path.join(ціль, f)));

    if (зниклі.length) {
        throw new Error("У зібраному сайті немає обовʼязкових файлів: " + зниклі.join(", "));
    }

    if (!тихо) {
        console.log(`Готово: ${файлів} файлів, ${(байтів / 1048576).toFixed(1)} МБ → ${dest}`);
    }

    return { файлів, байтів, ціль };

}

if (require.main === module) {

    const dest = process.argv[2] || "_site";

    try {
        collect(dest);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

}

module.exports = { collect, ВИНЯТКИ, ОБОВЯЗКОВІ };
