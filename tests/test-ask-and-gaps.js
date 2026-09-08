// Три речі, яких на сайті продажів бракувало.
//
// 1. ЗАПИТАТИ ПРО ЦЕЙ ТОВАР. До футера на сторінці товару не було
//    жодного посилання, щоб написати. Питання «чи точно оригінал»,
//    «чи є в іншому кольорі», «які реальні габарити» в діапазоні
//    3 000–15 000 ₴ виникають часто — а щоб спитати, покупець мусив
//    долистати до підвалу й сам описати, про який товар мова.
//
// 2. ТАБЛИЦЯ РОЗМІРІВ ОКУЛЯРІВ. Взуття, одяг і рюкзаки її мають, а
//    окуляри — ні, хоча в них розміри 51/53/54 і для покупця це
//    просто числа.
//
// 3. НЕЗАПОВНЕНІ ПОЛЯ КАРТОЧОК. 37 товарів без габаритів, 38 без
//    матеріалу — і дізнатись про це не було звідки. Обидва поля
//    показуються покупцеві й ідуть у фід Google Shopping.
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

const productJs = read("assets/js/product.js");
const contacts = read("contacts.html");
const css = read("assets/css/style.css");

console.log("\n[1] Запитати про цей товар — просто зі сторінки товару");
{
    check("посилання є", /class="ask-about"/.test(productJs));

    // Артикул і назва підставляються в адресу — інакше покупець
    // однаково описував би товар сам.
    check("артикул іде в адресу", /about=\$\{encodeURIComponent\(activeSku/.test(productJs));

    check("назва теж", /name=\$\{encodeURIComponent\(product\.title/.test(productJs));

    // Значення екрануються: назва потрапляє в href, а там & і лапки
    // ламали б розмітку.
    check("значення закодовані", (productJs.match(/encodeURIComponent/g) || []).length >= 2);

    // ЧОМУ НЕ TELEGRAM. Параметр ?text= для звичайного акаунта (не
    // бота) більшість клієнтів Telegram ігнорує: посилання
    // відкрилося б, а повідомлення прийшло порожнім — тобто покупець
    // однаково писав би сам.
    check("веде на форму контактів, а не на t.me з текстом",
        /href="contacts\?about=/.test(productJs)
        && !/t\.me\/[^"]*\?text=/.test(productJs));

    check("причину записано в коді", /параметр \?text=/.test(productJs));

    check("є стиль", /\.ask-about\{/.test(css));

    // Це не друга кнопка: головна дія на сторінці одна — «Купити».
    check("посилання, а не кнопка", !/\.ask-about a\{[^}]*background:var\(--secondary\)/.test(css));
}

console.log("\n[2] Сторінка контактів підставляє товар");
{
    check("підстановка є", /prefillProductQuestion/.test(contacts));

    // Значення приходять з адреси, тобто це введення СТОРОННЬОГО.
    check("значення йдуть у .value, не в innerHTML",
        /field\.value = "Питання про товар: "/.test(contacts)
        && !/message[^\n]*innerHTML/.test(contacts));

    check("довжина обрізається", /slice\(0, 40\)/.test(contacts) && /slice\(0, 160\)/.test(contacts));

    // Прийменник «про» вимагає знахідного відмінка, а назва в даних
    // стоїть у називному: «Питання про Сумка крос-боді…». Двокрапка
    // знімає узгодження.
    check("текст не ламає відмінок", /Питання про товар: /.test(contacts));

    check("причину записано", /знахідного відмінка/.test(contacts));

    // Уже написане людиною не перетираємо.
    check("заповнене поле не переписується", /if \(!field \|\| field\.value\.trim\(\)\) return;/.test(contacts));

    // І піднімаємо сторінку: підстановка мусить працювати, а не лише
    // бути в тексті.
    const dom = new JSDOM(contacts, {
        runScripts: "dangerously",
        url: "https://dev.bestbrnd4u.com/contacts?about=20-2&name=" + encodeURIComponent("Сумка Marc Jacobs")
    });

    const field = dom.window.document.getElementById("contactForm").elements.message;

    check("товар справді підставився", /Сумка Marc Jacobs/.test(field.value), field.value);

    check("і артикул поруч", /20-2/.test(field.value));

    // Без параметрів поле мусить лишитись порожнім — інакше форма
    // «Написати нам» на самій сторінці контактів була б засмічена.
    const clean = new JSDOM(contacts, {
        runScripts: "dangerously",
        url: "https://dev.bestbrnd4u.com/contacts"
    });

    check("без параметрів поле порожнє",
        clean.window.document.getElementById("contactForm").elements.message.value === "");

    // Розмітка з адреси мусить лишитись текстом.
    const attack = new JSDOM(contacts, {
        runScripts: "dangerously",
        url: "https://dev.bestbrnd4u.com/contacts?name=" + encodeURIComponent("<img src=x onerror=alert(1)>")
    });

    const box = attack.window.document.getElementById("contactForm").elements.message;

    check("розмітка з адреси не виконується",
        box.value.includes("<img") && attack.window.document.querySelectorAll("img[onerror]").length === 0);
}

console.log("\n[3] Таблиця розмірів для окулярів");
{
    const groups = JSON.parse(read("data/size-groups.json")).groups;

    const eyewear = groups.find(group => group.key === "eyewear");

    check("група є", Boolean(eyewear));

    // Прив'язка САМЕ до категорії: у розділі «Аксесуари» лежать ще
    // гаманці й годинники, і таблиця окулярів їм не потрібна.
    check("прив'язана до категорії, а не до розділу",
        eyewear.categories.includes("Окуляри і оправи") && !eyewear.department);

    check("таблиця не порожня", eyewear.guideRows.length >= 3 && eyewear.guideColumns.length >= 1);

    // ЩО ОЗНАЧАЄ ЧИСЛО — перевірено по даних магазину:
    //
    //   Marc Jacobs 1011/S: розмір 53, габарити «Ширина лінзи ×
    //   місток × довжина завушника: 53 × 21 × 140 мм» — тобто 53 це
    //   ширина лінзи.
    //
    //   Ray-Ban: загальна ширина оправи 137–141 мм при лінзі
    //   50–63 мм. Отже 51–54 не можуть бути шириною «від дужки до
    //   дужки»: така оправа не налізла б на доросле обличчя.
    check("таблиця про ширину лінзи", /ширина ОДНІЄЇ лінзи/i.test(eyewear.guideNote));

    check("названо маркування, за яким людина себе перевірить",
        /□/.test(eyewear.guideNote) && /завушник/.test(eyewear.guideNote));

    check("сказано й про загальну ширину, щоб не сплутати",
        /137–141/.test(eyewear.guideNote));

    // Розміри в таблиці мусять бути ті, що справді є в товарах.
    const products = JSON.parse(read("data/products.json"));

    const real = new Set();

    products.filter(p => p.category === "Окуляри і оправи").forEach(p => {
        (p.variants || []).forEach(v => Object.keys(v.stock || {}).forEach(s => {
            if (s !== "ONESIZE") real.add(s);
        }));
    });

    const covered = new Set(eyewear.guideRows.map(r => r.size));

    check("усі справжні розміри є в таблиці",
        [...real].every(s => covered.has(s)),
        `у товарах: ${[...real].join(", ")}; у таблиці: ${[...covered].join(", ")}`);
}

console.log("\n[4] Незаповнені поля карточок видно в журналі збірки");
{
    const build = read("scripts/build-products.js");

    check("перевірка є", /function reportCardGaps/.test(build));

    check("викликається в кінці збірки", /reportCardGaps\(products\)/.test(build));

    check("перевіряються габарити й матеріал",
        /key: "dimensions"/.test(build) && /key: "material"/.test(build));

    // Розбивка за категоріями: «усі 10 кросівок» — інша задача, ніж
    // «4 годинники з 24».
    check("розбито за категоріями", /byCategory/.test(build));

    // Назва, а не артикул: «1, 2, 3» у логу нічого не каже.
    check("приклади за назвою", /product\.title \|\| product\.slug/.test(build));

    // Це НЕ помилка: у частини товарів матеріалу справді немає.
    check("не валить збірку", /console\.warn\(`::warning::без \$\{label\}/.test(build)
        && !/process\.exit\(1\)[\s\S]{0,200}reportCardGaps/.test(build));

    // І сказано, чому поле не «зайве».
    check("сказано, чому це важливо", /фід Google Shopping/.test(build));
}

console.log("\n[5] «Єдиний екземпляр» — факт, а не накрутка терміновості");
{
    // ЩО ЗМІРЯНО. 87 із 91 позиції в наявності (варіант × розмір)
    // має qty = 1: магазин викуповує речі під замовлення, і те, що
    // лежить, — одиничне. Покупець цього не знав.
    const products = JSON.parse(read("data/products.json"));

    let single = 0;
    let positions = 0;

    products.filter(p => !p.preOrder).forEach(p => {
        (p.variants || []).forEach(v => {
            Object.values(v.stock || {}).forEach(q => {
                if (typeof q !== "number") return;
                positions++;
                if (q === 1) single++;
            });
        });
    });

    check(`одиничних позицій ${single} із ${positions} — рядок доречний`,
        positions > 0 && single / positions > 0.5);

    // ЧОГО СВІДОМО НЕМАЄ: слів тиску. На 87 товарах зі 91 «остання
    // одиниця» читалась би як накрутка й підривала блок «тільки
    // оригінал».
    const onlyOneCss = (css.match(/\.only-one\{[^}]*\}/) || [""])[0];

    check("без червоного й вогників",
        !/--danger|#ef4444|#dc2626/.test(onlyOneCss) && !/🔥|⏰|⚡/.test(productJs));

    // Дивимось на ТЕКСТ ДЛЯ ПОКУПЦЯ, а не на прозу про нього: у
    // коментарях «остання одиниця» згадується навмисно — там
    // написано, ЧОМУ ми так не пишемо. Перший же такий коментар цю
    // перевірку й завалив (та сама пастка, що в test-workspace-guard).
    const bezKomentariv = productJs
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/<!--[\s\S]*?-->/g, "");

    check("жодного «поспішайте» чи «остання одиниця»",
        !/поспіш|остання одиниця|встигніть/i.test(bezKomentariv));

    // Показ прив'язаний до РЕАЛЬНОЇ кількості обраного розміру.
    check("кількість їде в атрибуті кнопки розміру",
        /data-qty="\$\{left\}"/.test(productJs) && /function sizeLeft/.test(productJs));

    check("показ за кількістю активного розміру",
        /active\.dataset\.qty !== "1"/.test(productJs));

    // Під замовлення кількості немає взагалі — рядок там означав би
    // протилежне.
    check("під замовлення рядок не показується",
        /onlyOne\.hidden = preOrder \|\|/.test(productJs));

    // ГОЛОВНА ПАСТКА, на яку я вже наступив: refreshAvailability()
    // після першого малювання не викликається — її кличуть лише клік
    // по розміру, перемикач кольору й прихід живих залишків. Тому
    // розмітка мусить народжуватись у правильному стані.
    check("початковий стан рахується при малюванні",
        /const onlyOneNow = !product\.preOrder/.test(productJs)
        && /class="only-one" \$\{onlyOneNow \? "" : "hidden"\}/.test(productJs));

    // І живі залишки мусять перескладати кількість: інакше рядок
    // лишався б від старих даних саме тоді, коли він уже неправда.
    check("живі залишки оновлюють кількість",
        /button\.dataset\.qty = String\(left\)/.test(productJs));
}

console.log("\n[6] Текст рядка редагується з адмінки");
{
    const admin = read("admin/config.yml");
    const builder = read("scripts/build-product-pages.js");

    check("файл текстів є", fs.existsSync(path.join(ROOT, "data/product-texts.json")));

    check("сторінка є в адмінці", /name: "productTexts"/.test(admin));

    check("усі три рядки редаговані",
        /name: "onlyOneTitle"/.test(admin)
        && /name: "onlyOneWithDays"/.test(admin)
        && /name: "onlyOneWithoutDays"/.test(admin));

    // Число днів НЕ дублюється в текстах: воно береться з картки
    // товару, інакше його довелося б правити у двох місцях.
    const texts = JSON.parse(read("data/product-texts.json"));

    check("строк підставляється з товару через {строк}",
        texts.onlyOneWithDays.includes("{строк}"));

    check("у файлі текстів немає власного числа днів",
        !/\d+\s*[–-]\s*\d+/.test(texts.onlyOneWithDays));

    // ВБУДОВУЄТЬСЯ, а не довантажується: рядок стоїть високо, і
    // запізнілий текст смикав би розмітку.
    check("генератор вбудовує тексти в сторінку",
        /window\.PRODUCT_TEXTS = /.test(builder));

    check("і вони справді в готовій сторінці",
        /window\.PRODUCT_TEXTS = \{/.test(read(
            "p/michael-kors-rose-small-top-handle-quilted-crossbody-bag/index.html")));

    // Сторінка мусить працювати й без файлу: стара збірка, порожня
    // адмінка.
    check("запасні формулювання лишились у коді",
        /ONLY_ONE_FALLBACK/.test(productJs));

    // Забули {строк} у тексті — термін однаково мусить дійти до
    // покупця: краще кострубато, ніж без головного числа.
    check("без {строк} термін дописується в кінці",
        /template\.includes\("\{строк\}"\)/.test(productJs)
        && /\$\{template\} \$\{days\}/.test(productJs));

    // Підказка поля терміну мусила перестати брехати: тепер воно
    // впливає на ДВА місця.
    check("підказка терміну називає обидва місця",
        /Показується у двох місцях/.test(admin));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
