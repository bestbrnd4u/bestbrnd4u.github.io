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
    check("1× не зберігається (нічого не змінює)",
        Framing.normalizeFrame({ zoom: 1, x: 20, y: 30 }) === null);

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

    check("адмінка підключає спільний файл",
        /src="\.\.\/assets\/js\/image-framing\.js"/.test(admin));
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

    check("віджет не малює на canvas", !/getContext\(/.test(widget));
    check("віджет не кодує зображення", !/toDataURL|toBlob/.test(widget));
    check("віджет не чіпає медіатеку", !/persistMedia|addAsset/.test(widget));

    const normalizer = read("scripts/normalize-product-images.js");
    check("нормалізатор нічого не знає про рамки (не запікає їх у файл)",
        !/framing/i.test(normalizer));
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

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
