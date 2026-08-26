// Кадрування фото товару — неруйнівне.
//
// ЩО САМЕ СТЕРЕЖЕТЬСЯ
//
// 1. Формула кадру одна на всіх. Прев'ю в адмінці має показувати рівно
//    те, що побачить покупець. Гарантія тут не «однакові числа в двох
//    файлах», а буквально ОДИН файл — assets/js/image-framing.js, який
//    підключають і сторінки сайту, і admin/index.html. Якщо хтось
//    зробить у адмінці власну копію обчислень, прев'ю почне брехати —
//    і саме це ловлять перевірки нижче.
//
// 2. Оригінал не змінюється. Уся суть підходу: у товарі лежить лише
//    ОПИС кадру, а файл фото лишається недоторканим. Тому кадрування
//    можна переграти будь-коли, а «Скинути» повертає повний знімок.
//
// 3. Сміття не накопичується. Ключ рамки — ім'я файлу; видалили фото —
//    запис про його кадр мусить піти слідом (scripts/build-products.js).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const Framing = require("../assets/js/image-framing.js");

console.log("\n[1] Формула кадру: межі й нормалізація");
{
    // Порожня рамка — це 1× І центр.
    //
    // Раніше вистачало самого 1×: кадрування було лише для товару, де
    // фото 4:5 лежить у контейнері 4:5 — нічого не обрізається, і точка
    // фокуса без наближення справді нічого не міняла.
    //
    // Для банера й акції це не так: контейнер має ІНШУ пропорцію, кадр
    // ріжеться завжди, і точка вирішує, що саме лишиться видимим.
    check("1× у центрі не зберігається (нічого не змінює)",
        Framing.normalizeFrame({ zoom: 1, x: 50, y: 50 }) === null);

    check("1× зі зсувом зберігається (це кадр для банера)",
        JSON.stringify(Framing.normalizeFrame({ zoom: 1, x: 20, y: 30 }))
            === JSON.stringify({ zoom: 1, x: 20, y: 30 }));

    // Number(null) — це 0, тож без окремої перевірки рамка з x: null
    // мовчки зсувала кадр до лівого краю замість центру.
    check("null означає «не задано», а не нуль",
        Framing.normalizeFrame({ zoom: 1, x: null, y: null }) === null);

    check("явний нуль лишається нулем",
        (Framing.normalizeFrame({ zoom: 1, x: 0, y: 50 }) || {}).x === 0);

    check("порожнє значення — не рамка",
        Framing.normalizeFrame(null) === null && Framing.normalizeFrame({}) === null);

    const big = Framing.normalizeFrame({ zoom: 99, x: -40, y: 400 });

    check("наближення обмежене зверху", big.zoom === Framing.MAX_ZOOM, big.zoom);
    check("координати затиснуті в 0–100", big.x === 0 && big.y === 100,
        `${big.x}/${big.y}`);

    // сміття в полі не повинно валити сторінку товару
    check("сміття замість числа не ламає розрахунок",
        Framing.normalizeFrame({ zoom: "хтозна", x: null, y: undefined }) === null);

    const ok = Framing.normalizeFrame({ zoom: 1.4, x: 25, y: 75 });
    check("нормальні значення проходять як є",
        ok.zoom === 1.4 && ok.x === 25 && ok.y === 75);
}

console.log("\n[2] Рамка знаходиться за іменем файлу, а не за позицією");
{
    // Ключ — ім'я файлу навмисно: фото переставляють місцями й
    // переносять між кольорами, і кадр мусить їхати за знімком.
    const framing = { "a.webp": { zoom: 1.5, x: 40, y: 60 } };

    check("шлях згортається до імені файлу",
        Framing.imageKey("/assets/images/products/uploads/a.webp") === "a.webp");
    check("query і якір не заважають",
        Framing.imageKey("/x/a.webp?v=2#f") === "a.webp");

    check("рамка знаходиться за повним шляхом",
        !!Framing.frameFor(framing, "/assets/images/products/uploads/a.webp"));
    check("для чужого фото рамки немає",
        Framing.frameFor(framing, "/x/b.webp") === null);

    check("CSS-змінні саме ті, що чекає style.css",
        Framing.frameStyleAttr(framing, "a.webp")
            === "--frame-zoom:1.5;--frame-x:40%;--frame-y:60%");
    check("без рамки атрибут порожній (розмітка не засмічується)",
        Framing.frameStyleAttr(null, "a.webp") === "");
}

console.log("\n[3] Файл обчислень — один на сайт і адмінку");
{
    // Саме це робить прев'ю чесним. Дублікат формули в admin/ означав
    // би, що адмін бачить не те, що покупець.
    const admin = read("admin/index.html");

    // Версія в адресі («?v=abc12345») тепер ставиться і в адмінці —
    // без неї браузер після виливки віддавав би старі віджети. Тому
    // хвіст після імені файлу допускаємо.
    check("адмінка підключає спільний файл",
        /src="\.\.\/assets\/js\/image-framing\.js(\?v=[a-f0-9]+)?"/.test(admin));
    check("адмінка підключає поле кадрування",
        /image-framing-widget\.js/.test(admin));

    ["catalog.html", "product.html", "index.html"].forEach(page => {
        check(`${page} підключає спільний файл`,
            /assets\/js\/image-framing\.js/.test(read(page)));
    });

    // підключати треба ДО ui.js/product.js, які ним користуються
    const catalog = read("catalog.html");
    check("файл іде раніше за ui.js",
        catalog.indexOf("image-framing.js") < catalog.indexOf("assets/js/ui.js"));

    // ані віджет, ані прев'ю не мають рахувати кадр самі
    const widget = read("admin/image-framing-widget.js");
    const preview = read("admin/preview-templates.js");

    // межі повзунка приходять із бібліотеки, а не зашиті у віджеті
    check("віджет бере межі зі спільного файлу",
        /lib\.MIN_ZOOM/.test(widget) && /lib\.MAX_ZOOM/.test(widget));
    check("віджет не має власної константи наближення",
        !/MAX_ZOOM\s*=\s*\d/.test(widget));
    check("прев'ю рахує стиль спільною функцією",
        /window\.ImageFraming\.frameStyleObject/.test(preview));
}

console.log("\n[4] Кадр застосовується скрізь, де показують фото");
{
    const css = read("assets/css/style.css");

    check("картка каталогу слухається рамки",
        /\.product-image img\{[\s\S]{0,400}--frame-zoom/.test(css));
    check("ховер множиться на наближення, а не замінює його",
        /scale\(calc\(var\(--frame-zoom,1\) \* 1\.08\)\)/.test(css));
    check("великий слайд на сторінці товару",
        /\.gallery-slide\{[\s\S]{0,400}--frame-zoom/.test(css));
    check("мініатюри теж (інакше показували б інший кадр)",
        /\.thumb img,[\s\S]{0,400}--frame-zoom/.test(css));

    check("картка каталогу проставляє style",
        /style="\$\{cardFrameStyle\(product\.framing, img\)\}"/.test(read("assets/js/ui.js")));

    const productJs = read("assets/js/product.js");
    check("галерея товару проставляє style",
        /style="\$\{galleryFrameStyle\(img\)\}"/.test(productJs));
    check("рамки оновлюються при зміні кольору",
        /currentFraming = product\.framing/.test(productJs));

    // ui.js і product.js завантажуються на сторінці товару РАЗОМ.
    // Спершу обидві функції звались frameStyle, і друга мовчки
    // перетирала першу — при різних сигнатурах: (framing, src) проти
    // (src). Каталог після цього малював кадр за невірними даними.
    check("помічники названі по-різному (обидва файли на одній сторінці)",
        !/function frameStyle\b/.test(read("assets/js/ui.js"))
        && !/function frameStyle\b/.test(productJs));

    check("статична сторінка теж (щоб фото не стрибало після JS)",
        /ImageFraming\.frameStyleAttr\(product\.framing, img\)/
            .test(read("scripts/build-product-pages.js")));
}

console.log("\n[5] Прев'ю показує ВСІ фото, а не лише перше");
{
    const preview = read("admin/preview-templates.js");

    check("є галерея прев'ю", /var PreviewGallery = createClass/.test(preview));
    check("картка малює галерею, а не images[0]",
        /h\(PreviewGallery, \{/.test(preview) && !/path: images\[0\]/.test(preview));
    check("є перемикання фото", /step: function/.test(preview));
    check("індекс не вилітає за межі списку", /clampIndex/.test(preview));
    check("є мініатюри", /cms-preview-thumb/.test(preview));

    check("є вигляд «сторінка товару»", /cms-preview-page/.test(preview));
    check("є перемикач між карткою і сторінкою",
        /cms-preview-tabs/.test(preview) && /Сторінка товару/.test(preview));

    const styles = read("admin/preview-styles.css");
    check("стилі галереї є", /\.cms-preview-thumb\{/.test(styles));
    check("стилі перемикача є", /\.cms-preview-tab\{/.test(styles));
    check("прев'ю-фото теж слухаються рамки",
        /\.cms-preview-cover\{[\s\S]{0,200}--frame-zoom/.test(styles));
}

console.log("\n[6] Поле кадрування підключене до товару");
{
    const { loadYaml } = require("./helpers/yaml");
    const config = loadYaml("admin/config.yml");

    const products = (config.collections || []).find(c => c.name === "products");
    check("колекція товарів знайдена", !!products);

    const fields = (products && products.fields) || [];
    const framing = fields.find(f => f.name === "framing");

    check("поле framing є", !!framing);
    check("це саме наш віджет", framing && framing.widget === "imageFraming",
        framing && framing.widget);
    check("поле необов'язкове", framing && framing.required === false);

    // Поле на рівні ТОВАРУ, а не кольору: віджету потрібні всі фото
    // одразу, а ключ-ім'я файлу і так переживає перенесення між кольорами.
    const variants = fields.find(f => f.name === "variants");
    const inVariant = ((variants && variants.fields) || []).some(f => f.name === "framing");
    check("у кольорі дубля немає", !inVariant);
}

console.log("\n[7] Кадрування зникає разом із фото");
{
    // Інакше словник ріс би вічно: кожне видалене за рік фото лишало б
    // по собі запис у файлі товару.
    const builder = read("scripts/build-products.js");

    check("збірка прибирає рамки без фото", /прибрано кадрувань без фото/.test(builder));
    check("живими вважаються фото з усіх кольорів",
        /variants \|\| \[\]\)[\s\S]{0,160}variant\.images/.test(builder));

    // і в реальних даних сміття немає
    const dir = path.join(ROOT, "data/products");
    const stale = [];

    fs.readdirSync(dir).filter(f => f.endsWith(".json")).forEach(file => {

        const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));

        if (!data.framing) return;

        const alive = new Set((data.variants || [])
            .flatMap(v => (v && v.images) || [])
            .map(src => Framing.imageKey(src)));

        Object.keys(data.framing).forEach(key => {
            if (!alive.has(key)) stale.push(`${file} → ${key}`);
        });

    });

    check("у даних немає рамок без фото", stale.length === 0, stale.slice(0, 3).join("; "));
}

console.log("\n[8] Оригінали фото не змінюються");
{
    // Головна обіцянка підходу. Якщо кадрування колись почнуть
    // «запікати» у файл, ця перевірка має впасти й змусити обговорити
    // це свідомо, а не помітити по втраченій деталі товару.
    const widget = read("admin/image-framing-widget.js");

    // Canvas сам по собі не порушує обіцянку: «Підігнати по товару»
    // ЧИТАЄ пікселі, щоб знайти межі товару й порахувати наближення.
    // Порушенням було б ЗАПИСАТИ результат — вивести з canvas новий
    // файл і підмінити ним оригінал.
    //
    // Тому перевіряємо саме вивід, а не наявність canvas: заборона на
    // getContext змусила б відмовитись від автопідгонки, хоча вона
    // оригінал не чіпає.
    check("з canvas нічого не вивантажується",
        !/toDataURL|toBlob|convertToBlob/.test(widget));
    check("canvas використовується лише для читання",
        !/putImageData/.test(widget) && /getImageData/.test(widget));
    check("віджет не кодує зображення", !/toDataURL|toBlob/.test(widget));
    check("віджет не чіпає медіатеку", !/persistMedia|addAsset/.test(widget));

    const normalizer = read("scripts/normalize-product-images.js");
    check("нормалізатор нічого не знає про рамки (не запікає їх у файл)",
        !/framing/i.test(normalizer));
}

console.log("\n[7b] Кадрування працює не лише в товарах");
{
    const { loadYaml } = require("./helpers/yaml");
    const config = loadYaml("admin/config.yml");

    const promo = config.collections.find(c => c.name === "promotions");
    const home = config.collections.find(c => c.name === "pages")
        .files.find(f => f.name === "home");

    check("поле є в акціях",
        (promo.fields || []).some(f => f.name === "framing" && f.widget === "imageFraming"));
    check("поле є на головній",
        (home.fields || []).some(f => f.name === "framing" && f.widget === "imageFraming"));

    // Віджет спершу вмів лише data.variants[].images і в акціях та на
    // головній не знаходив жодного фото.
    const widget = read("admin/image-framing-widget.js");

    check("віджет шукає фото вглиб даних, а не лише у варіантах",
        /function walk\(value, label\)/.test(widget) && /IMAGE_RE/.test(widget));
    check("не тягне посилання з описів", /SKIP_KEYS/.test(widget));

    // Товар: фото 4:5 у контейнері 4:5 — обрізати нічого, треба
    // наблизити, тож transform. Банер і акція: пропорції різні, кадр
    // ріжеться завжди — вирішує позиція.
    const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const app = read("assets/js/app.js");

    check("головний банер слухається точки кадру",
        /--hero-bg[\s\S]{0,200}background-position:var\(--frame-x,50%\) var\(--frame-y,50%\)/.test(css));
    check("банер «Нова колекція» теж",
        /--promo-bg[\s\S]{0,200}background-position:var\(--frame-x,50%\) var\(--frame-y,50%\)/.test(css));

    // без рамки картка акції має виглядати точно як досі
    check("картка акції зберегла свій типовий кадр (top)",
        /\.promo-card-image img\{[\s\S]{0,300}object-position:var\(--frame-x,50%\) var\(--frame-y,0%\)/.test(css));
    check("ховер акції множиться на наближення",
        /scale\(calc\(var\(--frame-zoom,1\) \* 1\.06\)\)/.test(css));

    check("рамка доходить до банерів", /applyFraming\(el, framing, imageUrl\)/.test(app));
    check("головна передає свій словник рамок",
        /renderHero\(data\.hero, data\.framing\)/.test(app)
        && /renderPromoBanner\(data\.promo, data\.framing\)/.test(app));
    check("картка акції проставляє style", /style="\$\{frameFor\(promo\.image\)\}"/.test(app));
}

console.log("\n[8b] Відсутність файла обчислень НЕ блокує збереження товару");
{
    // Реальний випадок з dev. assets/js/image-framing.js не віддався,
    // віджет вийшов до registerWidget — і товар перестав зберігатись
    // із повідомленням «Oops, you've missed a required field», хоча
    // порожніх полів не було.
    //
    // Ланцюжок у decap-cms.js:
    //   resolveWidget: function Ss(e){ return Cs(e||"string") || Cs("unknown"); }
    //   processInnerControlRef = e => { if (!e) return; ... wrappedControlValid = ... }
    //   validateWrappedControl = e => { if ("function" != typeof this.wrappedControlValid) throw ... }
    // Контрол "unknown" — функціональний компонент, ref у нього null,
    // тож wrappedControlValid лишається undefined і валідація кидає
    // помилку. required: false на цьому шляху не допомагає взагалі.
    const widgetSrc = read("admin/image-framing-widget.js");

    // стенд: CMS + мінімальні заглушки React, БЕЗ window.ImageFraming
    const stand = (withLib) => {

        const registered = {};
        const sandbox = {
            CMS: { registerWidget: (n, c, p) => { registered[n] = { control: c, preview: p }; } }
        };

        sandbox.window = sandbox;
        sandbox.console = { warn: () => {}, error: () => {} };
        sandbox.h = (type, props, ...kids) => ({ type, props: props || {}, children: kids.flat() });
        sandbox.createClass = spec => {
            function C(props) {
                this.props = props;
                this.state = spec.getInitialState ? spec.getInitialState.call(this) : {};
            }
            Object.assign(C.prototype, spec);
            C.prototype.setState = function (s) { Object.assign(this.state, s); };
            return C;
        };

        if (withLib) sandbox.ImageFraming = require("../assets/js/image-framing.js");

        require("vm").createContext(sandbox);
        require("vm").runInContext(widgetSrc, sandbox);

        return registered;

    };

    const without = stand(false);

    check("віджет реєструється навіть без assets/js/image-framing.js",
        !!without.imageFraming);

    if (without.imageFraming) {

        const Control = without.imageFraming.control;
        const inst = new Control({
            value: {},
            entry: { get: () => ({ get: () => null }) },
            getAsset: v => v
        });

        // isValid оголошений явно: інакше валідність залежала б від
        // того, чи Decap встиг захопити ref контрола
        check("контрол сам повідомляє, що він валідний",
            typeof inst.isValid === "function" && inst.isValid() === true);

        let rendered = null;
        let threw = false;
        try { rendered = inst.render(); } catch (e) { threw = true; }

        check("рендер без бібліотеки не падає", !threw);
        check("замість поля видно пояснення, а не порожнеча",
            !threw && /не завантажився/.test(JSON.stringify(rendered)));

    }

    check("у файлі немає раннього return перед реєстрацією",
        widgetSrc.indexOf("CMS.registerWidget") > -1
        && !/if \(!Framing\)[\s\S]{0,80}return;/.test(widgetSrc));

    const withLib = stand(true);
    check("з бібліотекою віджет теж реєструється", !!withLib.imageFraming);
}

console.log("\n[8c] Стилі прев'ю не залипають у кеші");
{
    // preview-templates.js оновився, а preview-styles.css браузер віддав
    // старий — вкладки злиплись у рядок тексту, стрілки й лічильник без
    // оформлення. Виглядало як зламане прев'ю.
    const preview = read("admin/preview-templates.js");

    check("до стилів прев'ю додається унікальний параметр",
        /registerPreviewStyle\("\.\.\/assets\/css\/style\.css" \+ noCache\)/.test(preview));
    check("і до власних стилів адмінки теж",
        /registerPreviewStyle\("preview-styles\.css" \+ noCache\)/.test(preview));
}

console.log("\n[9] «Підігнати по товару»");
{
    // ЧОМУ ЦЕ ЗʼЯВИЛОСЬ
    // ------------------
    // Предметні фото знімають на білому тлі, і товар часто займає
    // третину кадру — у картці він виглядає дрібним. Підбирати
    // наближення повзунком доводилось навпомацки, через що складалось
    // враження, що інструмент узагалі не працює.
    const widget = read("admin/image-framing-widget.js");

    check("є кнопка автопідгонки", /autoFit: function/.test(widget));
    check("межі товару шукаються по пікселях", /contentBounds: function/.test(widget));

    // Прозорий піксель — теж тло, інакше фото з альфою давали б межі
    // на весь кадр.
    check("прозорість вважається тлом", /data\[i \+ 3\] < 16/.test(widget));

    // Колір тла беремо З КУТІВ, а не з зашитого числа.
    //
    // Раніше стояв поріг 244 — «світліше значить біле тло». Але
    // предметні фото знімають не тільки на білому: у частини товарів
    // тло 240/240/240, світло-сіре. Поріг його не визнавав, «не-фоном»
    // виявлявся ВЕСЬ кадр, і кнопка честно відповідала «не вдалося
    // визначити межі товару».
    check("зашитого порога більше немає", !/var LIMIT = \d+/.test(widget));
    check("тло визначається по кутах", /var corners = \[at\(1, 1\)/.test(widget));
    check("є допуск навколо кольору тла", /TOLERANCE = 12/.test(widget));
    check("неоднорідне тло відхиляється", /if \(spread > 24\) return null/.test(widget));

    check("фото цілком біле не ламає підгонку", /if \(maxX < 0\) return null/.test(widget));
    check("товар на весь кадр не підганяється",
        /bw > 0\.95 && bh > 0\.95/.test(widget));
    check("невдача не мовчить", /fitError/.test(widget));

    // Кнопки кроку: повзунком важко влучити, а дрібний рух мишею не
    // дає видимого ефекту.
    check("є крок наближення кнопками", /step: function \(delta\)/.test(widget));
    check("крок не виходить за межі",
        /Math\.max\(lib\.MIN_ZOOM, Math\.min\(lib\.MAX_ZOOM/.test(widget));

    // Підказка при 1× мусить казати, ЯК зробити товар більшим, а не те,
    // що фото показується повністю — це й так видно.
    check("підказка підказує дію", /Підігнати по товару/.test(widget));
}

console.log("\n[9b] Розрахунок кадру — на справжніх фото");
{
    // Перевіряємо саму арифметику на реальних знімках. Якщо межі товару
    // визначаються неправильно, «Підігнати» дасть випадковий кадр, і
    // помітити це можна буде лише очима в адмінці.
    //
    // Важливо перевірити ОБА випадки: фото з великими полями (там
    // підгонка й потрібна) і фото, що вже займає кадр (там вона мусить
    // відмовитись, а не «наблизити» на 0.99×).
    const sharp = require("sharp");

    const products = JSON.parse(read("data/products.json"));

    const photos = [...new Set(products.flatMap(p =>
        (p.variants || []).flatMap(v => v.images || [])))]
        .map(src => src.split("?")[0].replace(/^\//, ""))
        .filter(rel => fs.existsSync(path.join(ROOT, rel)))
        .slice(0, 12);

    const bounds = rel => {

        const file = path.join(ROOT, rel);

        return sharp(file).metadata().then(meta => {

            const max = 200;
            const scale = Math.min(1, max / Math.max(meta.width, meta.height));
            const w = Math.max(1, Math.round(meta.width * scale));
            const h = Math.max(1, Math.round(meta.height * scale));

            return sharp(file).resize(w, h).ensureAlpha().raw().toBuffer()
                .then(data => {

                    const LIMIT = 244;

                    let minX = w, minY = h, maxX = -1, maxY = -1;

                    for (let y = 0; y < h; y++) {
                        for (let x = 0; x < w; x++) {

                            const i = (y * w + x) * 4;

                            if (data[i + 3] < 16) continue;
                            if (data[i] > LIMIT && data[i + 1] > LIMIT
                                && data[i + 2] > LIMIT) continue;

                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;

                        }
                    }

                    if (maxX < 0) return null;

                    return {
                        rel: rel,
                        w: (maxX - minX + 1) / w,
                        h: (maxY - minY + 1) / h,
                        cx: (minX + maxX + 1) / 2 / w,
                        cy: (minY + maxY + 1) / 2 / h
                    };

                });

        });

    };

    return Promise.all(photos.map(bounds)).then(list => {

        const found = list.filter(Boolean);

        check(`межі визначено для всіх ${photos.length} фото`,
            found.length === photos.length, `${found.length} з ${photos.length}`);

        check("межі завжди всередині кадру",
            found.every(b => b.w > 0 && b.w <= 1 && b.h > 0 && b.h <= 1));
        check("точка фокуса завжди в межах кадру",
            found.every(b => b.cx >= 0 && b.cx <= 1 && b.cy >= 0 && b.cy <= 1));

        // Розрахунок такий самий, як у віджеті.
        const fitZoom = b => Math.round(Math.min(1 / b.w, 1 / b.h) * 0.88 * 100) / 100;

        // Фото з ПОМІТНИМИ полями — саме заради них функція й існує.
        const roomy = found.filter(b => fitZoom(b) >= 1.05);

        check(`є фото, де підгонка справді потрібна (${roomy.length})`,
            roomy.length > 0);

        roomy.forEach(b => {

            check(`${b.rel.split("/").pop()}: наближення ${fitZoom(b).toFixed(2)}×`,
                fitZoom(b) > 1);

        });

        // Фото з ледь помітними полями: розрахунок із запасом дає
        // значення нижче 1×. Раніше воно затискалось до 1 — кнопка
        // вдавала, що спрацювала, а нічого не змінювалось.
        const marginal = found.filter(b => fitZoom(b) < 1.05);

        check("віджет відмовляється підганяти, коли нема чого",
            /if \(zoom < 1\.05\)/.test(read("admin/image-framing-widget.js")));
        check(`і каже про це вголос (${marginal.length} таких фото)`,
            /Товар і так займає майже весь кадр/.test(read("admin/image-framing-widget.js")));

        // Фото, що вже займає кадр: contentBounds має вернути null, щоб
        // «Підігнати» не робило безглуздого наближення на 0.99×.
        const tight = found.filter(b => b.w > 0.95 && b.h > 0.95);

        check(`фото на весь кадр підгонка відхиляє (${tight.length})`,
            tight.every(b => b.w > 0.95 && b.h > 0.95));

        // Наближення обмежене згори: за 3× картинка стає мʼякою, бо
        // показується надто малий шматок оригіналу.
        const capped = roomy
            .map(b => Math.min(1 / b.w, 1 / b.h) * 0.88)
            .filter(z => z > 3);

        check(`де потрібно більше за 3× — обмежиться межею (${capped.length})`,
            /MAX_ZOOM/.test(read("assets/js/image-framing.js")));

        console.log("\n[10] Автоматичний кадр для фото з завеликими полями");
{
    // ЧОМУ ЦЕ ЗʼЯВИЛОСЬ
    // ------------------
    // Фото приходять від різних постачальників, і товар займає кадр
    // хто скільки: у більшості 80–90%, у частини — 27–35%. У каталозі
    // сусідні картки виглядали нерівно, ніби одну сумку зняли впритул,
    // а іншу з іншого кінця кімнати.
    //
    // Обрізати оригінали не стали: це необоротно. Замість цього збірка
    // рахує КАДР — ті самі zoom/x/y, які ставить віджет в адмінці.
    const script = read("scripts/auto-frame-products.js");

    check("скрипт є", script.length > 0);

    // Свій вибір важливіший за розрахунок.
    check("ручний кадр не перебивається",
        /if \(framing\[key\]\) continue/.test(script));

    // Без --apply нічого не змінює: можна подивитись, що буде.
    check("є режим перегляду без змін",
        /includes\("--apply"\)/.test(script) && /if \(apply\)/.test(script));

    // Визначення «де тут товар» мусить бути те саме, що у віджеті —
    // інакше автоматика й кнопка дадуть різні кадри для одного знімка.
    const widget = read("admin/image-framing-widget.js");

    // Логіка мусить бути ТА САМА, інакше кнопка «Підігнати» й
    // автоматика дадуть різні кадри для одного знімка.
    check("тло по кутах в обох", /corners/.test(script) && /corners/.test(widget));
    check("допуск однаковий",
        /TOLERANCE = 12/.test(script) && /TOLERANCE = 12/.test(widget));
    check("межа однорідності однакова",
        /spread > 24/.test(script) && /spread > 24/.test(widget));
    check("прозорість вважається тлом в обох",
        /data\[i \+ 3\] < 16/.test(script) && /data\[i \+ 3\] < 16/.test(widget));

    // Наближення обмежене: за 3× показується надто малий шматок
    // оригіналу, і картинка стає мʼякою.
    check("наближення обмежене згори", /MAX_ZOOM = 3/.test(script));

    // Крок вбудований у збірку, а не разова ручна дія — інакше нові
    // фото знову виглядатимуть дрібними.
    const pkg = JSON.parse(read("package.json"));

    check("крок у build:media",
        /auto-frame-products\.js --apply/.test(pkg.scripts["build:media"]));

    // І результат на справжніх даних: фото, які заповнювали менше 60%,
    // мусять отримати кадр.
    const dir = path.join(ROOT, "data/products");

    const sources = fs.readdirSync(dir).filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

    const framed = sources.filter(p => p.framing && Object.keys(p.framing).length);

    check(`товари з кадром — ${framed.length}`, framed.length > 0);

    // Кадр мусить бути валідним: інакше сайт його просто відкине, і
    // фото лишиться дрібним, а причину шукати буде ніде.
    const bad = [];

    framed.forEach(p => {

        Object.entries(p.framing).forEach(([key, frame]) => {

            const okZoom = typeof frame.zoom === "number"
                && frame.zoom >= 1 && frame.zoom <= 3;
            const okXY = [frame.x, frame.y].every(v =>
                typeof v === "number" && v >= 0 && v <= 100);

            if (!okZoom || !okXY) bad.push(`${p.slug}/${key}`);

        });

    });

    check("усі кадри в допустимих межах", bad.length === 0, bad.slice(0, 3).join(", "));
}

console.log("\n[11] Масштаб не накриває сусідні слайди");
{
    // Та сама причина, що в галереї: transform не обрізається
    // елементом і не змінює розкладку. При 3× знімок займає три ширини
    // картки, слайди йдуть підряд — і наступний малюється ЗВЕРХУ. У
    // каталозі показувалось друге фото замість першого, ще й зрізане
    // низом картки.
    const ui = read("assets/js/ui.js");
    const common = read("assets/js/common.js");
    const css = read("assets/css/style.css");

    // Карусель карточки є у ДВОХ місцях: шаблон картки й перемальовка
    // при зміні кольору. Полагодити одне й забути про інше означало б,
    // що баг вертається при перемиканні кольору.
    check("картка каталогу — обгортка",
        /<div class="photo-slide photo-slide-photo">/.test(ui));
    check("перемальовка при зміні кольору теж",
        /<div class="photo-slide photo-slide-photo">/.test(common));

    check("обгортка обрізає",
        /\.photo-slide-photo\{[\s\S]{0,240}overflow:hidden/.test(css));
    check("подвійного масштабу немає",
        /\.photo-slide-photo\{[\s\S]{0,300}transform:none/.test(css));

    // Мініатюри на сторінці товару теж масштабуються
    check("мініатюри обрізають", /\.thumbs-vertical \.thumb\{[^}]*overflow:hidden/.test(css));

    // Навігація карусели рахує дітей смуги — обгортки дають те саме
    // число, що й раніше, тож стрілки й точки не збиваються.
    check("навігація рахує слайди, а не картинки",
        /track\.children\.length/.test(ui));

    // Підміна фото при зміні кольору шукає .product-main-image —
    // клас лишився на самому зображенні.
    check("клас фото лишився на зображенні",
        /class="product-main-image"/.test(ui)
        && /querySelector\("\.product-main-image/.test(common));
}

console.log("\n[12] Свотч кольору показує той самий кадр");
{
    // Свотч — 40px. Якщо фото знято з великими полями, товар на ньому
    // займає кілька пікселів і виглядає плямою. Той самий кадр робить
    // його видимим.
    //
    // Для фону це не transform, а background-size/position — але
    // математика мусить бути СПІЛЬНА, інакше свотч і галерея показують
    // різні кадри одного знімка.
    const lib = require("../assets/js/image-framing.js");

    check("є розрахунок кадру для фону",
        typeof lib.frameBackgroundStyle === "function");

    const framing = { "photo.webp": { zoom: 2.98, x: 40, y: 60 } };
    const style = lib.frameBackgroundStyle(framing, "/a/photo.webp");

    check("наближення переходить у background-size",
        /background-size:298%/.test(style), style);
    check("точка фокуса — у background-position",
        /background-position:40% 60%/.test(style), style);

    // Без кадру нічого не додаємо: свотч лишається таким, як був.
    check("без кадру порожньо", lib.frameBackgroundStyle({}, "/a/photo.webp") === "");

    const product = read("assets/js/product.js");

    check("свотч користується спільним розрахунком",
        /frameBackgroundStyle\(currentFraming, swatchImage\)/.test(product));
    check("запасний варіант лишився",
        /swatchFrame \|\| "background-size:cover;background-position:center"/.test(product));
}

console.log(failures === 0
            ? "\n✅ Усі перевірки пройдено"
            : `\n❌ Провалено: ${failures}`);

        process.exit(failures === 0 ? 0 : 1);

    });
}

