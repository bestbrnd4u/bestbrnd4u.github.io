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

    // Наявність питається, але БІЛЬШЕ НЕ ТРИМАЄ рендер: знімок
    // читається з кеша синхронно, а свіжий доуточнює саме наявність
    // (подробиці й заміри — tests/test-stock-timing.js).
    check("живий залишок питається, але не тримає рендер",
        /window\.LiveStock\.load\(\)/.test(init)
        && !/Promise\.all\(\[[\s\S]{0,600}LiveStock\.load\(\)/.test(init));

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

    // Вікно ширше, ніж було: у showRelated з'явилось пояснення, чому
    // знімок береться саме в момент показу, а не на початку init().
    check("залишок застосовується й до решти каталогу",
        /showRelated[\s\S]{0,1600}LiveStock\.apply\(products, live\)/.test(productSrc));
}

console.log("\n[5] Перший ряд каталогу не стоїть у черзі за lazy");
{
    // ЩО БУЛО НЕ ТАК. Усі фото карток мали loading="lazy". Для
    // карток нижче екрана це правильно. Але перший ряд каталогу
    // видно ОДРАЗУ, а lazy означає: дочекайся розкладки, подивись,
    // чи воно в полі зору, і лише тоді починай качати. Тобто
    // найголовніше фото сторінки навмисно ставало в чергу останнім —
    // і це при тому, що каталог малює картки з JS, уже після
    // data/catalog.json, тож вони й без того стартують пізно.
    const catalogSrc = read("assets/js/catalog.js");
    const commonSrc = read("assets/js/common.js");
    const appSrc = read("assets/js/app.js");

    check("слайд уміє обидва режими",
        /loading="\$\{eager \? "eager" : "lazy"\}"/.test(uiSrc));

    // Тільки ПЕРШЕ фото картки: решта — кадри каруселі, яких ніхто
    // ще не гортав.
    check("решта кадрів каруселі лишаються lazy",
        /cardPhotoSlide\(product, img, eager && index === 0\)/.test(uiSrc));

    check("каталог просить це для перших карток",
        /createProductCard\(product, index < 4\)/.test(catalogSrc));

    // ГОЛОВНЕ ОБМЕЖЕННЯ. Без другого аргумента все лишається lazy —
    // тобто головна, кошик, обране, «схожі товари» й сторінка «не
    // знайдено» нічого не змінили. Там ряди товарів лежать нижче
    // згину, і eager качав би те, чого ніхто не побачить.
    check("за замовчуванням і далі lazy",
        !/createProductCard\(product, true\)/.test(appSrc)
        && !/createProductCard\(product, true\)/.test(commonSrc));

    check("перемальовка при зміні кольору не вмикає eager",
        /cardPhotoSlide\(\{ framing, title \}, img\)/.test(commonSrc));

    // fetchpriority навмисно НЕ ставимо: він не просто прискорює
    // фото, а переставляє його попереду стилів і шрифтів, і коли з
    // цим помиляються, сторінка малюється пізніше. Перевірити це
    // можна лише польовими даними, а не здогадкою.
    //
    // Коментарі відкидаємо: пояснення вище саме містить це слово, і
    // без очищення перевірка ловила б власний текст. Ця пастка тут
    // уже спрацювала.
    const uiCode = uiSrc
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

    check("fetchpriority не додано наосліп",
        !/fetchpriority/.test(uiCode), "з'явився — чи є заміри?");
}

console.log("\n[6] Плитки мега-меню — 88×88, а не на пів екрана");
{
    // ЩО БУЛО ЗМІРЯНО (головна, performance.getEntriesByType):
    //
    //   4a5d4b88….png  2296 КБ   «Жінкам»
    //   bea2c056….png  2257 КБ   «Чоловікам»
    //   5cdd14ae….png  2012 КБ   «Унісекс»
    //   4023d633….png  2314 КБ   «Дітям»
    //   ─────────────────────────
    //                  8879 КБ   на чотири плитки 88×88 px
    //
    // І качались вони намарно: мега-меню за мить перемальовує
    // mega-menu.js, тобто ці мегабайти не встигали навіть
    // показатись. Решта сторінок сайту тим часом брали готові
    // mega-*.webp по 0,2–3,5 КБ.
    //
    // Причина — два кроки збірки, які тягли в різні боки.
    // build-banners.js малює зменшені плитки, а build-home-static.js
    // крок 5 підставляв у меню знімок категорії з home.json: там під
    // тією ж статтю лежить фото для ВЕЛИКОЇ плитки на пів екрана.
    // Головна була єдиною сторінкою, яку цей крок чіпає.
    const { MEGA_MENU_FILES, MEGA_DIR } = require("../scripts/mega-tiles.js");

    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const withMenu = pages.filter(f => read(f).includes('class="mega-item"'));

    check(`сторінок із мега-меню — ${withMenu.length}`, withMenu.length >= 8);

    // Межа не з голови: найбільша готова плитка важить 3,5 КБ, а
    // найлегший «важкий» знімок категорії — два мегабайти. Двадцять
    // кілобайтів лишають запас на кращу якість і все одно ловлять
    // повернення повнорозмірного.
    const LIMIT_KB = 20;

    const heavy = [];

    withMenu.forEach(page => {

        const html = read(page);

        [...html.matchAll(/class="mega-item"[^>]*><img src="([^"]+)"/g)].forEach(m => {

            const src = m[1].replace(/^\//, "").split("?")[0];
            const file = path.join(ROOT, src);

            if (!fs.existsSync(file)) {
                heavy.push(`${page}: ${src} — файлу немає`);
                return;
            }

            const kb = Math.round(fs.statSync(file).size / 1024);

            if (kb > LIMIT_KB) heavy.push(`${page}: ${src} — ${kb} КБ`);

        });

    });

    check(`жодна плитка не важча за ${LIMIT_KB} КБ`, heavy.length === 0,
        [...new Set(heavy)].slice(0, 6).join(" | "));

    // Головна мусить брати ТІ САМІ файли, що й решта сторінок.
    const home = read("index.html");

    Object.values(MEGA_MENU_FILES).forEach(file => {
        check(`головна бере ${file}`, home.includes(MEGA_DIR + "/" + file));
    });

    check("і жодного знімка з uploads у меню головної",
        !/class="mega-item"[^>]*><img src="[^"]*products\/uploads/.test(home));

    // Словник один на два скрипти: розійдись вони — головна тихо
    // повернеться до мегабайтів.
    const banners = read("scripts/build-banners.js");
    const homeScript = read("scripts/build-home-static.js");

    check("обидва скрипти беруть перелік зі спільного модуля",
        /require\("\.\/mega-tiles"\)/.test(banners)
        && /require\("\.\/mega-tiles"\)/.test(homeScript));

    // Спільний модуль НЕ МУСИТЬ тягти sharp: основний ланцюжок
    // збірки нативних модулів не потребує, і середовище без
    // зібраного sharp валило б усю збірку замість однієї
    // необов'язкової команди.
    //
    // Коментарі відкидаємо: у поясненні всередині самого модуля це
    // слово стоїть навмисно — там сказано, чому sharp туди не
    // тягнуть. Без очищення перевірка ловила б власний текст.
    check("спільний модуль не тягне sharp",
        !/require\("sharp"\)/.test(
            read("scripts/mega-tiles.js")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/^\s*\/\/.*$/gm, "")));

    check("головна підставляє зменшену плитку, а не знімок категорії",
        /const small = megaTile\(name\);/.test(homeScript)
        && /const img = small \|\| byGender\[name\];/.test(homeScript));
}

console.log("\n[7] Фотографії не лежать у PNG");
{
    // ЩО БУЛО ЗМІРЯНО. Головна, 19 картинок разом на 13,7 МБ. Шість
    // із них — PNG по 1,4–2,5 МБ: банер SUMMER SALE, плитки розділів,
    // фони акцій. Поруч фотографії товарів важать 22–27 КБ.
    //
    // Різниця не в розмірі кадру (1100–2200 px — помірно), а у
    // ФОРМАТІ. PNG стискає без утрат: для скриншота чи логотипа це
    // правильно, для знімка з піском і градієнтами — ні. Той самий
    // кадр у webp важить у 10–20 разів менше.
    //
    // Конвеєр товарних фото бере ЛИШЕ .webp, тож усе завантажене
    // через адмінку як PNG лишалось нерозпакованим роками.
    const shrink = read("scripts/shrink-heavy-images.js");

    check("крок є в конвеєрі медіа",
        JSON.parse(read("package.json")).scripts["build:media"]
            .includes("shrink-heavy-images.js --apply"));

    // НАЙГОЛОВНІША ОБЕРЕЖНІСТЬ — ПРО ВИБІЛЮВАЧ ТЛА.
    //
    // whiten-backgrounds.js бере з products/uploads КОЖЕН .webp і
    // заливає йому тло білим. Для фотографії товару це його робота.
    // Але в тій же теці лежать банери й плитки розділів — адмінка
    // складає все завантажене в одне місце. Доки банер лишається
    // PNG, вибілювач його не бачить; переупакуй його на місці — і
    // наступна збірка заллє білим небо на знімку з моделлю.
    //
    // Тому фотографію товару не чіпаємо взагалі, а банер із тієї ж
    // теки ПЕРЕНОСИМО до banners — там йому й місце, і вибілювач
    // туди не заглядає. Відрізняємо за тим, чи посилається на файл
    // хоч один товар.
    check("фотографії товарів не чіпаємо",
        /if \(inUploads && isProductPhoto\)/.test(shrink)
        && /function productImages\(\)/.test(shrink));

    check("банер із теки товарів переїздить до banners",
        /const BANNERS_DIR = "assets\/images\/banners";/.test(shrink)
        && /return path\.join\(ROOT, BANNERS_DIR, path\.basename\(asWebp\)\);/.test(shrink));

    // Скрипт спіймав себе на першому ж показі: JPEG (уже стиснуті з
    // утратами) у webp ставали БІЛЬШИМИ — до 3288 КБ із 1893.
    check("замінюємо лише те, що справді полегшало",
        /const MIN_GAIN = 0\.25;/.test(shrink)
        && /result\.after > file\.size \* \(1 - MIN_GAIN\)/.test(shrink));

    // Заміна по ІМЕНІ файлу зачепила б чуже: серед банерів лежить
    // «2.png», і воно є підрядком у «photo2.png» чи «img-12.png».
    check("посилання переписуються за шляхом, а не за іменем",
        /path\.relative\(ROOT, file\.full\)/.test(shrink)
        && /path\.relative\(ROOT, result\.target\)/.test(shrink));

    // Сироти не чіпаємо: відвідувач їх не качає, а в репозиторії від
    // переупаковки стало б удвічі більше файлів.
    check("файли, на які ніхто не посилається, пропускаються",
        /if \(!refs\.has\(name\)\)/.test(shrink));

    // І власне результат.
    const dataFiles = ["data/home.json", "data/promotions.json"]
        .concat(fs.readdirSync(path.join(ROOT, "data/promotions"))
            .filter(f => f.endsWith(".json"))
            .map(f => "data/promotions/" + f));

    const heavy = [];
    const inUploads = [];

    dataFiles.forEach(rel => {

        const text = read(rel);

        [...text.matchAll(/\/(assets\/images\/[^"']+\.(?:png|jpe?g))/gi)].forEach(m => {

            const file = path.join(ROOT, m[1]);

            if (!fs.existsSync(file)) return;

            const kb = Math.round(fs.statSync(file).size / 1024);

            if (kb <= 700) return;

            const line = `${path.basename(m[1])} — ${kb} КБ`;

            if (m[1].includes("products/uploads")) inUploads.push(line);
            else heavy.push(`${rel}: ${line}`);

        });

    });

    check("поза текою товарів важких PNG у даних немає",
        heavy.length === 0, [...new Set(heavy)].slice(0, 5).join(" | "));

    // З теки товарів у дані сторінок теж більше нічого важкого не
    // світить: плитки розділів переїхали до banners і стали webp.
    //
    // Якщо тут щось з'явиться — це або новий банер, покладений в
    // теку товарів і ще не пропущений через build:media, або
    // справжня фотографія товару, яку раптом вставили в банер. Обидва
    // випадки варто побачити.
    check("у даних сторінок немає важких файлів із теки товарів",
        inUploads.length === 0, [...new Set(inUploads)].join(" | "));
}

console.log(failures ? `\n❌ Провалено: ${failures}` : "\n✅ Вага сторінки товару: зайвого не вантажимо");

process.exit(failures ? 1 : 0);
