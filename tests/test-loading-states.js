// Ознаки завантаження: що бачить людина на поганому звʼязку.
//
// ЗВІДКИ ВЗЯЛОСЬ
// ---------------
// Власник прислав чотири скріни з повільного інтернету: каталог —
// голий текстовий перелік без жодної ознаки руху; сторінка товару —
// сира, без каруселі, без розмірів, без кнопки «Купити»; секція
// «Схожі товари» — порожнеча між заголовком і двома стрілками.
// Жодного спінера, жодної смуги. Сайт виглядав зламаним.
//
// ЦІКАВО, ЩО ЗАВАНТАЖУВАЧ БУВ НА МІСЦІ Й ПРАЦЮВАВ.
// #catalogLoader є на кожній сторінці каталогу, catalog.js чесно його
// показує й ховає. Тільки видимим вмістом у ньому були плашки-каркаси
// — а коли в сітку поклали справжній перелік товарів для роботів,
// каркас прибрали збіркою (SKELETON_RE у build-taxonomy-pages.js).
// Лишився порожній div і напис, схований clip'ом для читалки екрана.
// Тобто перевірка «завантажувач є» була б зеленою весь той час, поки
// людина дивилась на нерухомий екран.
//
// Саме тому тут перевіряється не наявність блока, а те, що в ньому є
// ЩО ПОБАЧИТИ, і що воно доживає до згенерованих сторінок.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Локально файли лежать із CRLF, у CI — з LF. Вирази нижче писані з
// переносом рядка, тож читаємо розмітку вже зведеною до одного
// вигляду: інакше indexOf повертав би -1, slice віддавав би весь
// файл, і перевірки зеленіли б не тому, що все гаразд.
const readN = rel => read(rel).replace(/\r\n/g, "\n");

const css = read("assets/css/style.css").replace(/\r\n/g, "\n");
const commonJs = read("assets/js/common.js").replace(/\r\n/g, "\n");
const catalogJs = read("assets/js/catalog.js").replace(/\r\n/g, "\n");
const productJs = read("assets/js/product.js").replace(/\r\n/g, "\n");

// Тіло правила за селектором: далі питаємо не «чи є десь рядок», а
// «чи є він саме в цьому правилі».
const rule = selector => {
    const i = css.indexOf(selector + "{");
    return i === -1 ? "" : css.slice(i, css.indexOf("}", i));
};

// Усі блоки «кому анімація заважає» — у файлі їх кілька.
const reducedMotion = css.split("@media (prefers-reduced-motion:reduce){")
    .slice(1).map(part => part.slice(0, 500));

const безАнімації = selector => reducedMotion.some(block =>
    block.includes(selector + "{") && /animation:none/.test(block.slice(block.indexOf(selector + "{"))));

// Обхід дерева замість переліку тек: перелік у коді застаріває мовчки
// — нова тека просто не потрапляє в перевірку (так уже було з
// apply-cache-version.js).
const SKIP = new Set(["node_modules", ".git", ".claude", "archive", ".playwright-mcp",
    "supabase", "assets", "data", "tests", "scripts", "admin"]);

function allPages(dir = ROOT, out = []) {

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {

        if (entry.isDirectory()) {
            if (!SKIP.has(entry.name)) allPages(path.join(dir, entry.name), out);
        } else if (entry.name.endsWith(".html")) {
            out.push(path.join(dir, entry.name));
        }

    }

    return out;

}

const pages = allPages().map(f => ({
    rel: path.relative(ROOT, f).replace(/\\/g, "/"),
    html: fs.readFileSync(f, "utf8")
}));


console.log("\n[1] Каталог: у завантажувачі є що побачити");
{
    const html = readN("catalog.html");

    check("блок завантажувача на місці", /id="catalogLoader"/.test(html));

    // ОСЬ ЧОГО БРАКУВАЛО. Блок був, вмісту в ньому — ні.
    //
    // Ріжемо до закривного </div> ПІСЛЯ напису: усередині є ще один
    // div (сама смуга), і найближчий </div> — то його кінець.
    const від = html.indexOf('id="catalogLoader"');

    const блок = html.slice(від,
        html.indexOf("</div>", html.indexOf("</p>", від)));

    check("усередині нього смуга", /catalog-loader-bar/.test(блок));

    check("і напис поруч", /Завантаження товарів/.test(блок));

    // Напис ховався від очей (clip) — тоді його заміняли плашки.
    // Плашок більше немає, тож напис мусить бути видимим.
    check("напис більше не схований від очей",
        !/clip:rect/.test(rule(".catalog-loader .loader-note")),
        rule(".catalog-loader .loader-note").slice(0, 80));

    // ЧОМУ ТУТ ЯВНО ПРО align-items.
    // .catalog-loader успадковує .loader, а той центрує вміст. Смуга
    // всередині порожня, тож по центру вона стискалась рівно до нуля
    // — блок був, смуга в ньому була, а на екрані не було нічого.
    // Найгірший різновид: все «на місці» й нічого не видно.
    check(".loader центрує вміст — про це й мова",
        /align-items:center/.test(rule(".loader")));

    check("а завантажувач каталогу розтягує, інакше смуга нульової ширини",
        /align-items:stretch/.test(rule(".catalog-loader")));

    const смуга = rule(".catalog-loader-bar");

    check("у смуги задана висота", /height:\d+px/.test(смуга), смуга.slice(0, 60));

    check("і та сама хвиля, що в плашок",
        /animation:skeleton-wave/.test(смуга));

    check("кому анімація заважає — смуга без хвилі",
        безАнімації(".catalog-loader-bar"));
}


console.log("\n[2] Завантажувач з'являється і — головне — зникає");
{
    check("показується перед завантаженням",
        /loader\.hidden = false/.test(catalogJs));

    // Завантажувач, який не зникає, гірший за його відсутність:
    // сторінка назавжди лишається «в процесі». Тому ховання живе у
    // finally — і після помилки теж.
    const finallyБлок = catalogJs.slice(catalogJs.indexOf("} finally {"),
        catalogJs.indexOf("} finally {") + 600);

    check("ховається у finally, тобто й після помилки",
        /loader\.hidden = true/.test(finallyБлок),
        finallyБлок.slice(0, 60));
}


console.log("\n[3] Те саме бачать усі сторінки, народжені з catalog.html");
{
    // catalog.html — сторінка, яка ще й шаблон: із неї збірка робить
    // сторінки брендів, категорій, розділів, новинок, акцій і пар
    // «бренд × тип». Правка в ньому доходить туди лише через збірку,
    // і забути перезібрати — звична помилка.
    const зЗавантажувачем = pages.filter(p => p.html.includes('id="catalogLoader"'));

    const безСмуги = зЗавантажувачем.filter(p => !p.html.includes("catalog-loader-bar"));

    check(`сторінок каталогу знайдено: ${зЗавантажувачем.length}`,
        зЗавантажувачем.length >= 40, String(зЗавантажувачем.length));

    check("смуга є на кожній", безСмуги.length === 0,
        безСмуги.slice(0, 3).map(p => p.rel).join(", "));

    // Збірка вирізає зі згенерованих сторінок каркас .catalog-skeleton
    // (там у сітці вже лежить справжній перелік). Смуга лежить поза
    // каркасом — і це не збіг, а умова: заберуть разом із каркасом,
    // і ми повернемось рівно до скріна власника.
    const taxonomy = read("scripts/build-taxonomy-pages.js");

    check("вирізається саме каркас, а не весь завантажувач",
        /SKELETON_RE/.test(taxonomy) && !/catalog-loader-bar/.test(taxonomy));
}


console.log("\n[4] Сторінка товару: смуга в статичному блоці");
{
    const generator = read("scripts/build-product-pages.js");

    check("збірка кладе смугу в статичний блок",
        /product-static-loader/.test(generator) && /catalog-loader-bar/.test(generator));

    // Блок мусить бути ВСЕРЕДИНІ .product-static-seo: product.js
    // перезаписує весь #productPage, і смуга зникає разом із ним.
    // Поставити її поруч означало б лишити «завантажуємо...» назавжди.
    const статичний = generator.slice(generator.indexOf('<div class="product-static-seo">'),
        generator.indexOf('<div class="product-static-seo">') + 900);

    check("і саме всередині блока, який потім зникає",
        /product-static-loader/.test(статичний));

    check("а зникає він тому, що product.js переписує #productPage",
        /document\.getElementById\("productPage"\)\.innerHTML = `/.test(productJs));

    check("напис у смузі видимий",
        !/clip:rect/.test(rule(".product-static-loader .loader-note")));

    const сторінкиТоварів = pages.filter(p => p.html.includes('class="product-static-seo"'));

    const безСмуги = сторінкиТоварів.filter(p => !p.html.includes("product-static-loader"));

    check(`сторінок товарів знайдено: ${сторінкиТоварів.length}`,
        сторінкиТоварів.length >= 90, String(сторінкиТоварів.length));

    check("смуга є на кожній", безСмуги.length === 0,
        безСмуги.slice(0, 3).map(p => p.rel).join(", "));
}


console.log("\n[5] «Схожі товари»: плашки замість порожнечі");
{
    const html = readN("product.html");

    const блок = html.slice(html.indexOf('id="similarProducts"'),
        html.indexOf("</div>\n\n    <button", html.indexOf('id="similarProducts"')));

    const плашок = (блок.match(/class="skeleton-card"/g) || []).length;

    check("у контейнері є плашки", плашок > 0, String(плашок));

    // СКІЛЬКИ ПЛАШОК — НЕ ДОВІЛЬНЕ ЧИСЛО.
    // showRelated() показує рівно N карток. Поставити менше плашок —
    // сітка підстрибне, коли приїдуть товари; більше — зникне зайве.
    // Тому число беремо з самого product.js, а не з голови.
    const тіло = productJs.slice(productJs.indexOf("async function showRelated"),
        productJs.indexOf('const container=document.getElementById("similarProducts")'));

    const скільки = Number((тіло.match(/\.slice\(0,\s*(\d+)\)/) || [])[1]);

    check("скільки карток покаже showRelated — видно з коду", скільки > 0, String(скільки));

    check(`плашок стільки ж, скільки буде карток: ${плашок} і ${скільки}`,
        плашок === скільки);

    // Плашки прибирати руками не треба — контейнер чиститься перед
    // малюванням. Прибрати це очищення означало б показати плашки
    // ПІСЛЯ справжніх карток.
    check("контейнер чиститься перед малюванням",
        /container\.innerHTML="";/.test(productJs));

    // КАРУСЕЛЬ — ГНУЧКИЙ КОНТЕЙНЕР.
    // Ширина в ній задана правилом на .product-card. Плашка того
    // правила не знала — і flex стискав її до нуля: чотири невидимі
    // смужки замість каркаса.
    // Правил ДВА — широкий екран і вузький. Тому й дивимось у двох
    // місцях окремо: поки перевірка шукала по всьому файлу, їй
    // вистачало одного, і друге могло мовчки лишитись без плашки.
    const межа = css.indexOf("@media(max-width:900px){");

    const СПІЛЬНЕ = /\.carousel-track\.products-grid \.product-card,\s*\n\s*\.carousel-track\.products-grid \.skeleton-card\{/;

    check("ширина в каруселі описана одним правилом на картку й плашку",
        СПІЛЬНЕ.test(css.slice(0, межа)));

    const вузько = css.slice(межа, межа + 1500);

    check("і на вузькому екрані теж", СПІЛЬНЕ.test(вузько));

    // ПЛАШКА МУСИТЬ БУТИ РІВНО ТІЄЇ САМОЇ ВИСОТИ, ЩО Й КАРТКА.
    //
    // Інакше карусель підстрибує в ту саму мить, коли приїжджають
    // товари, — тобто каркас робить те, чому мав запобігти. Перша
    // версія з трьох тонких смужок давала 484px проти 504px, і
    // стрибок на 20px було видно оком.
    //
    // Тому рядків у плашці стільки ж, скільки в .product-info, і
    // висоти в них — ті самі.
    const рядки = (блок.match(/class="skeleton-line skeleton-line-\w+"/g) || []).length / плашок;

    check(`у плашці три рядки, як у .product-info: ${рядки}`, рядки === 3);

    // Назву резервує min-height:2.6em при font-size:17px — це 44px.
    // Число в плашці не з голови: розійдуться — висота попливе.
    const назва = rule(".product-title");

    const кегль = Number((назва.match(/font-size:(\d+)px/) || [])[1]);
    const рядків = Number((назва.match(/min-height:([\d.]+)em/) || [])[1]);

    check("висота назви в картці задана в em від кегля",
        кегль > 0 && рядків > 0, `${кегль}px × ${рядків}em`);

    check(`смужка назви повторює цю висоту: ${Math.round(кегль * рядків)}px`,
        new RegExp("height:" + Math.round(кегль * рядків) + "px").test(rule(".skeleton-line-title")));

    check("і той самий відступ під нею",
        (назва.match(/margin-bottom:(\d+)px/) || [])[1]
            === (rule(".skeleton-line-title").match(/margin-bottom:(\d+)px/) || [])[1]);

    // Поля в тілі плашки й у .product-info — теж одні й ті самі.
    check("поля тіла плашки збігаються з полями .product-info",
        (rule(".skeleton-body").match(/padding:([^;]+);/) || [])[1]
            === (rule(".product-card .product-info").match(/padding:([^;]+);/) || [])[1],
        (rule(".skeleton-body").match(/padding:([^;]+);/) || [])[1]);

    const сторінки = pages.filter(p => p.html.includes('id="similarProducts"'));

    const без = сторінки.filter(p => !p.html.includes("skeleton-card"));

    check(`і те саме на всіх ${сторінки.length} сторінках товару`,
        сторінки.length >= 90 && без.length === 0,
        без.slice(0, 3).map(p => p.rel).join(", "));
}


console.log("\n[6] Фото: хвиля, поки не приїхало");
{
    const фото = rule(".product-image");

    check("під фото картки лежить хвиля",
        /animation:skeleton-wave/.test(фото) && /background-color:var\(--gray200\)/.test(фото));

    check("і гасне, коли фото приїхало",
        /background-image:none/.test(rule(".product-image.is-ready"))
        && /animation:none/.test(rule(".product-image.is-ready")));

    check("у статичному блоці товару — так само",
        /animation:skeleton-wave/.test(rule(".product-static-gallery img"))
        && /animation:none/.test(rule(".product-static-gallery img.is-ready")));

    // Мініатюри маленькі, і хвиля в кожній відбирала б увагу в
    // головного фото — досить сірої підкладки замість порожнього
    // квадрата з рамкою.
    check("у мініатюр галереї сіра підкладка",
        /background-color:var\(--gray200\)/.test(rule(".thumb")));

    check("кому анімація заважає — фото без хвилі",
        безАнімації(".product-image") && безАнімації(".product-static-gallery img"));
}


console.log("\n[7] Хвиля справді гасне — перевіряємо виконанням");
{
    // НАЙВАЖЛИВІШЕ В НАБОРІ.
    //
    // Подія load на картинці НЕ СПЛИВАЄ. Слухач на document без
    // третього аргументу true її не побачить ніколи — і хвиля під
    // кожним фото крутилась би до кінця візиту. Помилка мовчазна:
    // ні в консолі, ні на екрані (фото непрозоре й накриває хвилю),
    // лише батарея сідає.
    //
    // Тому тут не шукається рядок «true», а БЕРЕТЬСЯ справжній код і
    // проганяється на справжніх подіях.
    const хвіст = commonJs.slice(commonJs.indexOf("function markImageReady"));

    check("код позначання фото знайшовся", хвіст.length > 100);

    // ПОРОЖНІЙ ДОКУМЕНТ — І ЦЕ ВАЖЛИВО.
    //
    // Наприкінці хвоста є разовий обхід уже завантажених картинок. У
    // JSDOM <img> без src одразу complete — тобто обхід позначив би
    // геть усе, і перевірка події стала б декорацією: вона зеленіла б
    // навіть із вимкненою фазою занурення. Тому спершу запускаємо код
    // на порожньому документі, а картинки додаємо після — рівно так,
    // як їх додає каталог.
    const dom = new JSDOM("<body></body>");

    const { document: doc, Event } = dom.window;

    new Function("document", хвіст)(doc);

    doc.body.innerHTML = `
        <div class="product-image"><img id="вкартці"></div>
        <img id="статичне" class="product-static-photo">
        <div class="product-image"><img id="битe"></div>`;

    const вкартці = doc.getElementById("вкартці");

    вкартці.dispatchEvent(new Event("load"));

    check("після load позначена сама картинка",
        вкартці.classList.contains("is-ready"));

    check("і картка навколо неї",
        вкартці.closest(".product-image").classList.contains("is-ready"));

    const статичне = doc.getElementById("статичне");

    статичне.dispatchEvent(new Event("load"));

    check("фото поза карткою теж позначається",
        статичне.classList.contains("is-ready"));

    // Биті фото теж треба відпустити: інакше під ними хвиля назавжди.
    const битe = doc.getElementById("битe");

    битe.dispatchEvent(new Event("error"));

    check("битe фото теж відпускається",
        битe.classList.contains("is-ready")
        && битe.closest(".product-image").classList.contains("is-ready"));

    // ТІ, ЩО ВЖЕ ПРИЇХАЛИ.
    // common.js має defer: на повторному заході картинки з кешу вже
    // завантажені, і події load по них не буде ніколи. Без разового
    // обходу хвиля крутилась би під усіма ними.
    const другий = new JSDOM(`<body><div class="product-image"><img id="зкешу"></div></body>`);

    new Function("document", хвіст)(другий.window.document);

    check("вже завантажені фото позначаються без події",
        другий.window.document.getElementById("зкешу").classList.contains("is-ready"));
}


console.log(failures === 0
    ? "\n✅ Завантаження видно: смуга в каталозі, смуга на товарі, плашки в «схожих»\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
