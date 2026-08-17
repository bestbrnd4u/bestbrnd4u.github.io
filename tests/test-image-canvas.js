// Приведення фото товарів до єдиного холста 4:5.
//
// Історія: пропорції перевірялись у тестах давно, але саме приведення
// робилось разово й руками. Фото, завантажені пізніше через адмінку,
// повз нього проходили — і до серпня 2026 таких набралось 18 зі 121,
// з розкидом пропорцій від 0.667 до 1.481. Тест червонів місяцями, і
// його встигли записати в «давно зламані», хоча він ловив справжню
// проблему: у контейнері 4:5 такі знімки ріжуться.
//
// Тому тут перевіряється не лише результат, а й те, що приведення
// вбудоване в збірку — інакше історія повториться з наступним фото.
const fs = require("fs");
const path = require("path");
const { baseImageSizes, webpSize, UPLOADS } = require("./helpers/images");
const {
    findOffCanvas, TARGET_RATIO, CANVAS, VARIANT_WIDTHS
} = require("../scripts/normalize-product-images");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

(async () => {

console.log("\n[1] Читач розмірів WebP не потребує зовнішніх інструментів");
{
    // раніше пропорції рахував python3 з Pillow, якого немає на
    // раннері GitHub Actions — тест валився винятком ще до перевірок
    const sizes = baseImageSizes();

    check("розміри прочитано без Python", sizes.length > 80, sizes.length);
    check("у кожного фото додатні розміри",
        sizes.every(i => i.width > 0 && i.height > 0));

    const helper = fs.readFileSync(path.join(ROOT, "tests/helpers/images.js"), "utf8");
    check("читач розуміє всі три види WebP (VP8 / VP8L / VP8X)",
        ["VP8 ", "VP8L", "VP8X"].every(k => helper.includes(k)));

    let threw = false;
    try { webpSize(Buffer.from("не картинка взагалі........")); } catch (e) { threw = true; }
    check("сміття замість файлу — зрозуміла помилка, а не тиха нуль-відповідь", threw);
}

console.log("\n[2] Усі базові фото приведені до 4:5");
{
    const sizes = baseImageSizes();
    const off = sizes.filter(i => i.ratio !== TARGET_RATIO);

    check(`жодного фото поза пропорціями (перевірено ${sizes.length})`,
        off.length === 0,
        off.slice(0, 5).map(i => `${i.file} ${i.width}×${i.height}`).join(" | "));

    check("холст саме 1200×1500", CANVAS.width === 1200 && CANVAS.height === 1500);
    check("холст справді 4:5", +(CANVAS.width / CANVAS.height).toFixed(3) === TARGET_RATIO);

    // скрипт і тест мають бачити однакову картину
    const viaScript = await findOffCanvas();
    check("скрипт нормалізації теж не бачить роботи", viaScript.length === 0,
        viaScript.map(i => i.file).slice(0, 3).join(", "));
}

console.log("\n[3] У кожного фото є всі зменшені копії");
{
    const variants = JSON.parse(fs.readFileSync(path.join(ROOT, "data/image-variants.json"), "utf8"));
    const sizes = baseImageSizes();

    const notRegistered = sizes.filter(i => !variants.includes(i.file));
    check(`кожне базове фото є в image-variants.json (${sizes.length})`,
        notRegistered.length === 0, notRegistered.slice(0, 3).map(i => i.file).join(", "));

    const missing = [];

    variants.forEach(name => {
        const stem = name.slice(0, -".webp".length);
        VARIANT_WIDTHS.forEach(w => {
            if (!fs.existsSync(path.join(UPLOADS, `${stem}-${w}.webp`))) missing.push(`${stem}-${w}`);
        });
    });

    check(`копії ${VARIANT_WIDTHS.join("/")} існують для всіх`, missing.length === 0,
        missing.slice(0, 3).join(", "));

    // копії мають зберігати ті самі пропорції, інакше сітка «стрибає»
    const sample = variants.slice(0, 20);
    const wrong = [];

    sample.forEach(name => {
        const stem = name.slice(0, -".webp".length);
        VARIANT_WIDTHS.forEach(w => {
            const { width, height } = webpSize(fs.readFileSync(path.join(UPLOADS, `${stem}-${w}.webp`)));
            if (+(width / height).toFixed(2) !== +TARGET_RATIO.toFixed(2)) wrong.push(`${stem}-${w}`);
            if (width !== w) wrong.push(`${stem}-${w}: ширина ${width}`);
        });
    });

    check("зменшені копії тих самих пропорцій і заявленої ширини",
        wrong.length === 0, wrong.slice(0, 3).join(", "));
}

console.log("\n[4] Банери не потрапляють під приведення до 4:5");
{
    // Банер — широкий за задумом. Перший прогон нормалізації зачепив
    // банер 1635×1104 і перетворив його на 1200×1500 з білими полями:
    // на сайті це виглядало як зіпсована картинка. Тому банери лежать
    // окремою текою, а скрипт бачить лише фото товарів.
    const script = fs.readFileSync(path.join(ROOT, "scripts/normalize-product-images.js"), "utf8");

    check("скрипт дивиться лише в теку фото товарів",
        /const DIR = path\.join\(ROOT, "assets\/images\/products\/uploads"\)/.test(script));
    check("тека банерів у скрипті названа окремо (щоб її не переплутали)",
        script.includes("assets/images/banners"));

    const bannersDir = path.join(ROOT, "assets/images/banners");

    if (fs.existsSync(bannersDir)) {

        const banners = fs.readdirSync(bannersDir).filter(f => /\.(jpe?g|png|webp)$/i.test(f));

        check(`банери існують (${banners.length})`, banners.length > 0);


        // Раніше тут стояла перевірка «жоден банер не 4:5». Вона хибна:
        // компактний банер бренду (banner_compact) за задумом саме 4:5,
        // і чесна картинка Coach її провалювала. Справжня гарантія — не
        // пропорції окремого файлу, а те, що нормалізатор фізично не
        // бачить теку банерів.
        check("банери лежать поза текою фото товарів",
            !fs.existsSync(path.join(ROOT, "assets/images/products/uploads/banners")));

    }
}

console.log("\n[5] Приведення вбудоване в збірку, а не разова ручна дія");
{
    const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/build-products.yml"), "utf8");

    check("workflow запускає normalize-product-images.js",
        wf.includes("normalize-product-images.js"));
    check("запускається з --apply, а не лише звітом",
        /normalize-product-images\.js --apply/.test(wf));
    check("залежності ставляться (скрипту потрібен sharp)", wf.includes("npm ci"));

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    check("sharp зафіксований у devDependencies", !!pkg.devDependencies.sharp,
        Object.keys(pkg.devDependencies).join(", "));

    const commitBlock = wf.slice(wf.indexOf("git add"));
    check("перероблені фото потрапляють у коміт",
        commitBlock.includes("assets/images"));
    check("оновлений перелік копій теж комітиться",
        /git add[\s\S]{0,600}image-variants\.json/.test(wf) || wf.includes("git add -A data"));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

})();
