// Прибирає СТАРІ демо-товари з data/products/.
//
// НАВІЩО ОКРЕМИЙ СКРИПТ
//
// Розпакування архіву ДОДАЄ файли, але не видаляє. Тож коли ви
// розпакували новий каталог поверх старого, у теці лишились обидва
// набори — 21 демо-товар (Furla, Guess, Nike…) плюс 27 нових, і в
// каталозі стало 48 позицій.
//
// Видалити їх через адмінку можна, але це 21 окреме натискання
// «Delete entry». Цей скрипт робить те саме за один запуск.
//
// ЗАПУСК (з кореня репозиторію):
//
//     node scripts/clean-old-products.js          — показати, що буде видалено
//     node scripts/clean-old-products.js --apply  — видалити
//
// Скрипт видаляє ЛИШЕ перелічені нижче файли демо-каталогу.
// Ваші 27 товарів він не чіпає — навіть якщо запустити двічі.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "products");

// Точний перелік файлів демо-каталогу, який був у репозиторії до
// заміни. Список закритий і не містить шаблонів на кшталт «усе,
// крім…» — так неможливо випадково знести ваші товари.
const OLD_DEMO_FILES = [
    "bagvero-kids-backpack.json",
    "bagvero-kids-bag.json",
    "bagvero-man-briefcase.json",
    "bagvero-man-sling.json",
    "bagvero-unisex-tote.json",
    "calvin-klein-crossbody.json",
    "furla-metropolis.json",
    "guess-noelle-black.json",
    "import-1786031983644-1.json",
    "import-1786031983644-2.json",
    "import-1786031983644-3.json",
    "import-1786031983644-4.json",
    "import-1786031983644-5.json",
    "import-1786087720648-1.json",
    "import-1786087720648-2.json",
    "import-1786087720648-3.json",
    "import-1786087720648-4.json",
    "import-1786087720648-5.json",
    "love-moschino-heart.json",
    "michael-kors-jet-set.json",
    "tommy-hilfiger-backpack.json",
];

function main() {

    const apply = process.argv.includes("--apply");

    if (!fs.existsSync(DIR)) {
        console.error("Не знайдено теку data/products — запускайте з кореня репозиторію.");
        process.exit(1);
    }

    const present = new Set(fs.readdirSync(DIR).filter(f => f.endsWith(".json")));
    const toRemove = OLD_DEMO_FILES.filter(f => present.has(f));
    const remaining = [...present].filter(f => !OLD_DEMO_FILES.includes(f));

    if (!toRemove.length) {
        console.log("Старих демо-товарів не знайдено — усе вже чисто.");
        console.log(`У каталозі товарів: ${remaining.length}`);
        return;
    }

    console.log(`Знайдено старих демо-товарів: ${toRemove.length}\n`);
    toRemove.forEach(f => console.log("   " + f));

    console.log(`\nЗалишиться ваших товарів: ${remaining.length}`);

    if (!apply) {
        console.log("\nНічого не видалено. Щоб видалити, запустіть:");
        console.log("   node scripts/clean-old-products.js --apply");
        return;
    }

    toRemove.forEach(f => fs.unlinkSync(path.join(DIR, f)));

    console.log(`\nВидалено: ${toRemove.length}`);
    console.log("Тепер перезберіть каталог:  node scripts/build-products.js");
    console.log("Потім закомітьте зміни — і на сайті лишиться лише ваш каталог.");

}

if (require.main === module) main();

module.exports = { OLD_DEMO_FILES };
