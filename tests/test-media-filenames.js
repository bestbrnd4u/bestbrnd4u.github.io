// Довжина шляхів у репозиторії.
//
// Історія: `git pull` на робочій машині падав з
//   error: cannot stat 'assets/images/products/uploads/gi9qwcglkga7…_42.jpg':
//   Filename too long
// через 5 картинок з іменами по 196 символів (227 разом зі шляхом).
// Windows за замовчуванням не дає шлях довший за 260 символів разом зі
// шляхом до самої теки репозиторію, тож репозиторій ставав таким, що
// його неможливо викачати. Найпідступніше тут те, що на сайті все
// працює: GitHub Pages віддає такі файли нормально, і проблему видно
// тільки при клоні/пулі.
//
// Тому межа перевіряється в CI, а не «як згадаємо».
const fs = require("fs");
const path = require("path");
const { shortName, MAX_NAME } = require("../scripts/normalize-media-names");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// Запас під шлях до теки репозиторію на машині користувача
// (C:\Users\<user>\Documents\GitHub\bestbrnd4u.github.io\ — це вже
// близько 55 символів) плюс службові теки git.
const MAX_PATH_IN_REPO = 150;

const SKIP = new Set(["node_modules", ".git"]);

function allPaths(dir, prefix = "") {

    const out = [];

    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

        if (SKIP.has(entry.name)) return;

        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) out.push(...allPaths(path.join(dir, entry.name), rel));
        else out.push(rel);

    });

    return out;

}

const paths = allPaths(ROOT);

console.log("\n[1] Правило скорочення імені");
{
    const long = "a".repeat(196) + ".jpg";

    check("довге ім'я стає коротким", shortName(long).length <= MAX_NAME, shortName(long).length);
    check("розширення збережене", shortName(long).endsWith(".jpg"));
    check("суфікс розміру не загублено (ресайзер шукає саме його)",
        shortName("b".repeat(120) + "-600.webp").endsWith("-600.webp"),
        shortName("b".repeat(120) + "-600.webp"));

    check("варіанти одного фото мають спільний префікс",
        shortName("c".repeat(120) + "-300.webp").replace("-300", "")
        === shortName("c".repeat(120) + "-600.webp").replace("-600", ""));

    check("різні файли не зливаються в одне ім'я",
        shortName("d".repeat(60) + "1.jpg") !== shortName("d".repeat(60) + "2.jpg"));

    check("повторний запуск нічого не міняє (ідемпотентність)",
        shortName(shortName(long)) === shortName(long) || shortName(long).length <= MAX_NAME);
}

console.log("\n[2] У репозиторії немає задовгих імен і шляхів");
{
    // Межа MAX_NAME стосується саме медіа: імена картинок ми вільні
    // міняти будь-коли. Файли товарів у data/products названі за slug,
    // а slug — це частина адреси сторінки товару; вкорочувати їх
    // означало б міняти адреси й губити індексацію. Для них працює
    // загальна межа на довжину шляху нижче.
    const mediaPaths = paths.filter(p => p.startsWith("assets/images/"));

    const longNames = mediaPaths.filter(p => path.basename(p).length > MAX_NAME);
    check(`жодної картинки з іменем довшим за ${MAX_NAME} символів`,
        longNames.length === 0,
        longNames.slice(0, 3).map(p => `${path.basename(p).length}: ${path.basename(p).slice(0, 40)}…`).join(" | "));

    const longPaths = paths.filter(p => p.length > MAX_PATH_IN_REPO);
    check(`жодного шляху довшого за ${MAX_PATH_IN_REPO} символів`,
        longPaths.length === 0,
        longPaths.slice(0, 3).map(p => `${p.length}: ${p.slice(0, 50)}…`).join(" | "));

    const worst = paths.reduce((a, b) => (a.length >= b.length ? a : b), "");
    console.log(`     найдовший шлях зараз: ${worst.length} символів — ${worst.slice(0, 60)}…`);
}

console.log("\n[3] Посилання на картинки не побились після перейменування");
{
    const dataFiles = [
        "data/products.json", "data/promotions.json", "data/collections.json",
        "data/promo-popups.json", "data/home.json"
    ].filter(f => fs.existsSync(path.join(ROOT, f)));

    const broken = [];

    dataFiles.forEach(rel => {

        const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
        const refs = new Set(text.match(/assets\/images\/[\w\-./%]+\.(?:jpg|jpeg|png|webp|gif|avif)/g) || []);

        refs.forEach(ref => {
            if (!fs.existsSync(path.join(ROOT, decodeURIComponent(ref)))) broken.push(`${rel} → ${ref}`);
        });

    });

    check("усі картинки з data/ існують на диску", broken.length === 0,
        broken.slice(0, 3).join(" | "));
}

console.log("\n[4] Нормалізація вбудована в збірку, а не лише в тест");
{
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

    check("build:media запускає normalize-media-names.js",
        /normalize-media-names\.js/.test(pkg.scripts["build:media"] || ""));

    // Дев теж: у build-dev.yml цих кроків не було, тож довгі імена з
    // дев-адмінки доживали до злиття в main (див. test-image-canvas).
    [
        [".github/workflows/build-products.yml", "прод"],
        [".github/workflows/build-dev.yml", "дев"]
    ].forEach(([file, label]) => {

        const workflow = fs.readFileSync(path.join(ROOT, file), "utf8");

        check(`${label}-збірка нормалізує імена`, /npm run build:media/.test(workflow));
        check(`${label}-збірка стежить і за завантаженими картинками`,
            /paths:[\s\S]*assets\/images/.test(workflow));
        check(`${label}-збірка комітить результат`,
            /git add[\s\S]{0,400}assets\/images/.test(workflow));

    });
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
