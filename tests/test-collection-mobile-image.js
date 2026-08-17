// Окреме фото добірки для мобільної версії.
//
// НАВІЩО ОКРЕМЕ ПОЛЕ
// -------------------
// Блок добірки на десктопі й на мобільному має ЗОВСІМ різну геометрію.
// На десктопі це сітка minmax(260px,38%) + 1fr: фото стоїть вузькою
// вертикальною колонкою зліва й тягнеться на всю висоту товарів. До
// 900px сітка стає в один стовпчик, а .collection-image отримує
// aspect-ratio:16/9 — тобто фото перетворюється на широку смугу над
// товарами.
//
// Одне фото в обидва формати не вкладається: вертикальний кадр у
// смузі 16:9 показує лише вузький шматок посередині. Тому в добірках
// зʼявилось поле imageMobile — так само, як воно давно є в акцій.
//
// Підстановку робить <picture> + <source media>, а не JS: браузер
// вибирає файл ще до завантаження скриптів і не тягне зайву картинку.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const appJs = fs.readFileSync(path.join(ROOT, "assets/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");
const config = fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8");
const builder = fs.readFileSync(path.join(ROOT, "scripts/build-collections.js"), "utf8");

console.log("\n[1] Поле є в адмінці й підказки не брешуть про розміри");
{
    const block = config.slice(config.indexOf('- name: "collections"'),
                               config.indexOf('- name: "categories"'));

    check("поле imageMobile додано", /name: "imageMobile"/.test(block));
    check("воно необовʼязкове (старі добірки не ламаються)",
        /name: "imageMobile"[\s\S]{0,120}required: false/.test(block));

    check("десктопна підказка — вертикальна колонка 3:4",
        /900\s*[×x]\s*1200/.test(block), "очікував 900×1200");
    check("мобільна підказка — широка смуга 16:9",
        /1600\s*[×x]\s*900/.test(block), "очікував 1600×900");

    // саме ця цифра була неправильною: слот на десктопі не 4:3
    check("стара помилкова підказка 1200×900 прибрана",
        !/1200\s*[×x]\s*900/.test(block));
}

console.log("\n[2] Значення доходить до фронта");
{
    check("збірка кладе imageMobile у data/collections.json",
        /imageMobile:\s*data\.imageMobile\s*\|\|\s*""/.test(builder));

    const built = path.join(ROOT, "data/collections.json");

    if (fs.existsSync(built)) {

        const list = JSON.parse(fs.readFileSync(built, "utf8"));

        check("поле присутнє в кожній зібраній добірці",
            list.every(c => Object.prototype.hasOwnProperty.call(c, "imageMobile")),
            JSON.stringify(list.map(c => c.slug)));

        // якщо шлях заповнений — файл має існувати
        const missing = list
            .filter(c => c.imageMobile)
            .filter(c => !fs.existsSync(path.join(ROOT, decodeURIComponent(c.imageMobile).replace(/^\//, ""))));

        check("усі вказані мобільні фото існують на диску",
            missing.length === 0, missing.map(c => c.imageMobile).join(", "));

    }
}

console.log("\n[3] Розмітка перемикає фото сама, без JS");
{
    check("використовується <picture>", /<picture>/.test(appJs));
    check("<source> зі своїм media", /<source[\s\S]{0,200}media="\(max-width: 900px\)"/.test(appJs));

    // 900px — саме та точка, де сітка блоку перебудовується;
    // інше значення дало б розсинхрон розмітки й стилів
    const mobileBlock = css.slice(css.indexOf("@media(max-width:900px)"));
    check("той самий поріг 900px є і в CSS добірки",
        /\.collection-image\{[\s\S]{0,120}aspect-ratio:16\/9/.test(mobileBlock));

    check("без мобільного фото <source> не додається (немає порожнього srcset)",
        /collection\.imageMobile \?/.test(appJs));

    check("десктопне фото лишається у <img> як запасне",
        /<img[\s\S]{0,200}src="\$\{collection\.image\}"/.test(appJs));

    check("<picture> розтягнутий стилями, інакше object-fit не працює",
        /\.collection-image picture\{[\s\S]{0,120}height:100%/.test(css));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
