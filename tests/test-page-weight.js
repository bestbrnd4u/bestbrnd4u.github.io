// Вага сторінки товару: два місця, де вантажилось те, чого не видно.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. СВОТЧІ НЕ ТЯГНУТЬ ПОВНОРОЗМІРНІ ФОТО.
//
//    Заміряно на проді (сторінка Coach Tabby, 945 КБ / 52 запити):
//    шість квадратиків вибору кольору 56×56 px завантажували
//    повнорозмірні знімки — 60, 54, 125, 82, 53 і 21 КБ, разом
//    близько 395 КБ на кожне відкриття сторінки.
//
//    Причина не в помилці, а в тому, що свотч — це CSS-фон, а фон не
//    знає про srcset: браузер бере рівно названий файл. Копії по
//    300 px при цьому вже лежали поруч і важать 3-4 КБ.
//
//    РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ: хтось повертає background-image просто
//    в style свотча (так простіше), і 395 КБ повертаються разом із
//    ним — мовчки, бо сторінка виглядає точно так само.
//
// 2. КАТАЛОГ НЕ НА КРИТИЧНОМУ ШЛЯХУ.
//
//    Сторінка чекала на data/catalog.json (близько 240 КБ
//    розпакованого JSON) перш ніж намалювати товар — хоча повний
//    запис ЦЬОГО товару лежить у самій сторінці (PRODUCT_DATA).
//    Каталог потрібен лише двом каруселям у самому низу.
//
//    РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ: getAllProductsCached() повертається в
//    Promise.all на початку init() — і сторінка знову чекає на 240 КБ
//    заради блоку, до якого половина людей не доскролює.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const productSrc = read("assets/js/product.js");
const uiSrc = read("assets/js/ui.js");

console.log("\n[1] Свотчі кольору беруть зменшену копію, а не повне фото");
{
    // Розмір квадратика — з тієї самої CSS, на яку спираються цифри
    // вище. Виросте до 300 px — цей тест доведеться переглянути
    // свідомо, а не випадково.
    const css = read("assets/css/style.css");

    const rule = css.slice(css.indexOf(".color{"), css.indexOf(".color{") + 200);

    check("свотч усе ще маленький (≤ 120 px)",
        /width:(\d+)px/.test(rule) && Number(RegExp.$1) <= 120,
        (rule.match(/width:\d+px/) || [])[0]);

    // Головне: у style свотча немає background-image.
    const block = productSrc.slice(
        productSrc.indexOf("const colorButtons"),
        productSrc.indexOf("}).join(\"\");", productSrc.indexOf("const colorButtons")));

    check("у swatchStyle немає background-image",
        !/background-image/.test(block), (block.match(/background-image[^;]*/) || [])[0]);

    check("адреса фото їде в data-swatch-bg",
        /data-swatch-bg="\$\{escapeHtml\(swatchImage\)\}"/.test(block));

    check("колір лишається підкладкою (порожнього квадрата не буде)",
        /background-color:\$\{swatchColor\}/.test(block));

    // Кадрування свотча не мусить зникнути: у каталозі чимало фото з
    // великими полями, і без кадру товар на квадратику — пляма.
    check("кадр свотча на місці",
        /frameBackgroundStyle\(currentFraming, swatchImage\)/.test(productSrc));
}

console.log("\n[2] Хто саме підставляє зменшену копію");
{
    check("ui.js вміє адресу однієї копії", /function variantUrl\(src, width\)/.test(uiSrc));

    check("копія на 300 px", /variantUrl\(src, 300\)/.test(uiSrc));

    check("версія ?v= не губиться (інакше адреса стала б безглуздою)",
        /variantUrl[\s\S]{0,400}query \? `\?\$\{query\}` : ""/.test(uiSrc));

    check("фон малюється через data-swatch-bg",
        /querySelectorAll\("\[data-swatch-bg\]"\)/.test(uiSrc));

    // ФАЙЛ-ОПЕН: копії немає (фото додали через адмінку після збірки)
    // або перелік не завантажився — ставимо оригінал. Свотч без фото
    // гірший за свотч із важким фото.
    check("немає копії — ставимо оригінал",
        /backgroundImage = cssUrl\(small \|\| src\)/.test(uiSrc));

    check("порожній перелік копій не зупиняє малювання фону",
        uiSrc.indexOf("if (known.size) {") < uiSrc.indexOf("data-swatch-bg"),
        "перевірка known.size мусить бути ЛИШЕ навколо srcset для <img>");

    // Назву файлу дає адмінка або масовий імпорт: апостроф чи лапка в
    // ній інакше розірвали б url() у CSS.
    check("лапки в назві файлу екрануються",
        uiSrc.includes('replace(/["\\\\]/g'), "cssUrl() мусить екранувати \" і \\");
}

console.log("\n[3] Зменшені копії справді існують на диску");
{
    const variants = JSON.parse(read("data/image-variants.json"));

    check("перелік копій не порожній", Array.isArray(variants) && variants.length > 0,
        Array.isArray(variants) ? variants.length : typeof variants);

    // Беремо перші п'ять і перевіряємо, що файл -300 лежить поруч.
    const dirs = ["assets/images/products/uploads", "assets/images/products"];

    let checked = 0, missing = [];

    variants.slice(0, 5).forEach(name => {

        const base = name.replace(/\.webp$/, "");

        const found = dirs.some(dir => fs.existsSync(path.join(ROOT, dir, `${base}-300.webp`)));

        if (found) checked++;
        else missing.push(name);

    });

    check(`копії -300 знайдено (${checked} з 5)`, missing.length === 0, missing.join(", "));

    // І що вони справді МЕНШІ. Інакше вся ця робота марна.
    const sample = variants.find(name => dirs.some(dir =>
        fs.existsSync(path.join(ROOT, dir, name.replace(/\.webp$/, "-300.webp")))));

    if (sample) {

        const dir = dirs.find(d => fs.existsSync(path.join(ROOT, d, sample)));

        if (dir) {

            const big = fs.statSync(path.join(ROOT, dir, sample)).size;
            const small = fs.statSync(path.join(ROOT, dir, sample.replace(/\.webp$/, "-300.webp"))).size;

            check(`копія легша за оригінал (${Math.round(big / 1024)} КБ → ${Math.round(small / 1024)} КБ)`,
                small < big);

        }

    }
}

console.log("\n[4] Каталог довантажується, а не тримає сторінку");
{
    const init = productSrc.slice(0, productSrc.indexOf("} catch (error) {"));

    check("вбудований запис не тягне за собою каталог",
        /\?\s*Promise\.resolve\(embeddedOnly\)/.test(init)
        && !/getAllProductsCached\(\)/.test(init),
        (init.match(/embedded[\s\S]{0,60}getAllProductsCached\(\)/) || [])[0]);

    check("живий залишок лишився на критичному шляху (наявність — головне)",
        /window\.LiveStock\.load\(\)/.test(init));

    check("«схожі» й «переглянуті» — за появою в екрані",
        /whenNearViewport\(\s*\n?\s*document\.querySelector\("section\.similar"\)/.test(productSrc));

    // Слухати треба СЕКЦІЮ, а не саму карусель: карусель до наповнення
    // порожня, а IntersectionObserver із порогом 0 не спрацьовує для
    // елемента без площі — блок так і лишився б порожнім. У секції є
    // заголовок, тож висота в неї є завжди.
    check("запасний варіант, якщо секції немає",
        /section\.similar"\) \|\| document\.getElementById\("similarCarousel"\)/.test(productSrc));

    check("позначку «переглянуто» ставимо одразу, не чекаючи скролу",
        init.indexOf("trackRecentlyViewed(product.id)") > 0
        && init.indexOf("trackRecentlyViewed(product.id)") < init.indexOf("whenNearViewport"));

    check("є запас, щоб карусель не з'являлась на очах",
        /rootMargin: "600px 0px"/.test(productSrc));

    // Без IntersectionObserver (старий браузер) або без блока — робимо
    // одразу: краще зайвий запит, ніж порожній низ сторінки.
    check("без IntersectionObserver каруселі не зникають",
        /if \(!element \|\| typeof IntersectionObserver === "undefined"\) \{\s*\n\s*run\(\);/.test(productSrc));

    check("каталог довантажується один раз (observer вимикається)",
        /observer\.disconnect\(\);/.test(productSrc));

    check("повний запис товару накриває полегшену картку з каталогу",
        /\{ \.\.\.item, \.\.\.product \}/.test(productSrc));

    check("залишок застосовується й до решти каталогу",
        /showRelated[\s\S]{0,900}LiveStock\.apply\(products, live\)/.test(productSrc));
}

console.log(failures ? `\n❌ Провалено: ${failures}` : "\n✅ Вага сторінки товару: зайвого не вантажимо");

process.exit(failures ? 1 : 0);
