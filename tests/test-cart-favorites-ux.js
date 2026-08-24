// Кошик і обране: колір, посилання, підтвердження видалення.
//
// ЧОТИРИ СИМПТОМИ
//
// 1. Кружечки кольорів не підписані — у кошику доводилось згадувати
//    по памʼяті, який саме це відтінок.
// 2. Клац по товару в кошику відкривав ПЕРШИЙ колір, а не той, що
//    лежить у кошику: людина клацала коричневу сумку, а бачила
//    світло-сіру. Колір при цьому зберігався — його просто не
//    передавали в посилання.
// 3. Видалити можна було одним випадковим дотиком: «✕» стоїть поруч
//    із кількістю, а повернути видалене нічим.
// 4. Опис товару виводився двічі — угорі й у розділі «Опис» нижче.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Порівнюємо з КОДОМ, а не з поясненнями: у коментарях обидві
// колишні помилки названі своїми іменами — productUrl(product) і
// confirm(), — і наївний пошук по тексту знаходив би саме їх.
const strip = text => text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const cart = strip(read("assets/js/cart.js"));
const favorites = strip(read("assets/js/favorites.js"));
const common = strip(read("assets/js/common.js"));
const product = strip(read("assets/js/product.js"));
const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[1] Назва кольору видима");
{
    check("у кошику є підпис кольору", /class="cart-item-color"/.test(cart));
    check("в обраному теж", /class="favorite-row-color"/.test(favorites));

    check("назва екранується", /escapeHtml\(line\.color\)/.test(cart)
        && /escapeHtml\(activeColor\)/.test(favorites));

    // без кольору підпис не показуємо — порожній рядок «Колір:»
    // виглядав би як недороблене
    check("без кольору підпису немає",
        /line\.color\s*\n?\s*\?/.test(cart) && /activeColor\s*\n?\s*\?/.test(favorites));

    check("є стилі підпису", /\.cart-item-color,[\s\S]{0,120}\.favorite-row-color\{/.test(css));
}

console.log("\n[2] Посилання веде на обраний колір");
{
    // productUrl уміє приймати параметри — їх просто не передавали
    check("productUrl приймає параметри", /function productUrl\(product, params\)/.test(common));

    check("кошик рахує адресу з кольором і розміром",
        /productUrl\(product, \{ color: line\.color, size: line\.size \}\)/.test(cart));
    check("обране теж",
        /productUrl\(product, \{ color: activeColor, size: activeSize \}\)/.test(favorites));

    // обидва посилання рядка — і фото, і назва — мусять вести туди само
    check("у кошику обидва посилання оновлені",
        (cart.match(/href="\$\{lineUrl\}"/g) || []).length === 2,
        (cart.match(/href="\$\{lineUrl\}"/g) || []).length);
    check("в обраному обидва посилання оновлені",
        (favorites.match(/href="\$\{rowUrl\}"/g) || []).length === 2,
        (favorites.match(/href="\$\{rowUrl\}"/g) || []).length);

    check("старих посилань без параметрів не лишилось",
        !/productUrl\(product\)/.test(cart) && !/productUrl\(product\)/.test(favorites));
}

console.log("\n[3] Підтвердження перед видаленням");
{
    check("є спільний діалог", /function askConfirm/.test(common));

    // Вбудований confirm() на телефоні показує системне вікно з
    // адресою сайту, ламає стиль і на iOS блокує сторінку цілком.
    check("не використовується вбудований confirm()",
        !/\bwindow\.confirm\(|[^.\w]confirm\(/.test(common.replace(/askConfirm/g, "")));

    check("кошик питає перед видаленням",
        /askConfirm\(\{[\s\S]{0,160}кошика\?/.test(cart));
    check("обране питає перед видаленням",
        /askConfirm\(\{[\s\S]{0,160}обраного\?/.test(common));

    // На картці й сторінці товару те саме сердечко просто перемикає —
    // питати там означало б заважати.
    check("питаємо тільки на сторінці обраного",
        /classList\.contains\("favorite-row-remove"\)/.test(common));

    // Випадковий Enter одразу після відкриття не має нічого стирати.
    check("фокус на «Скасувати», а не на «Видалити»",
        /querySelector\('\[data-confirm="no"\]'\)\?\.focus\(\)/.test(common));
    check("Escape закриває", /event\.key === "Escape"/.test(common));
    check("клац повз вікно скасовує", /event\.target === overlay/.test(common));
    check("Tab не тікає під діалог", /event\.key === "Tab"/.test(common));
    check("фокус повертається туди, звідки прийшли", /returnTo\.focus\(\)/.test(common));

    check("сторінка під діалогом не гортається",
        /body\.confirm-open\{[\s\S]{0,60}overflow:hidden/.test(css));
    check("небезпечна кнопка виділена кольором", /\.confirm-danger\{/.test(css));
}

console.log("\n[4] Опис товару не дублюється");
{
    const renders = (product.match(/product\.description \|\| "Стильна сумка/g) || []).length;

    check("опис виводиться один раз", renders === 1, renders);
    check("лишився саме розгортайний блок",
        /class="spec-plain">\$\{product\.description/.test(product));
    check("верхнього дубля немає", !/class="product-short"/.test(product));
}

console.log("\n[5] Відступ під мобільною кнопкою «Купити»");
{
    const rule = (css.match(/\.mobile-sticky-cart\{[\s\S]*?\}/g) || []).join("\n");

    // Відступ знизу дорівнює верхньому — 12px, без додавання
    // безпечної зони.
    //
    // Історія в двох кроках. Спершу тут стояв max(20px, …) — жорсткий
    // поріг додавався навіть там, де вирізу немає. Замінили на
    // calc(12px + env(safe-area-inset-bottom)) — і на iPhone смуга все
    // одно лишилась удвічі вищою за потрібну: Safari повідомляє інсет
    // ≈34px навіть коли його власна нижня панель видима й уже відсуває
    // вміст. Виходила панель браузера плюс наш порожній білий відступ
    // над нею.
    check("відступ знизу дорівнює верхньому",
        /\.mobile-sticky-cart\{[\s\S]{0,200}padding:12px 16px;/.test(css));

    check("порога 20px немає", !/max\(20px, calc\(12px \+ env/.test(css));
    check("безпечна зона більше не додається до відступу",
        !/padding:12px 16px calc\(12px \+ env\(safe-area/.test(css));

    // Порожнього місця під кнопкою не лишається саме тому, що смуга
    // прибита до низу вікна: її тло доходить до краю.
    check("смуга прибита до низу вікна",
        /\.mobile-sticky-cart\{[\s\S]{0,160}bottom:0/.test(css));
}

console.log("\n[6] Dependabot цілиться в dev");
{
    const yaml = read(".github/dependabot.yml");

    // sync-branches мержить із -X theirs: при розходженні перемагає
    // гілка-джерело. Тож апдейт, влитий у main, найближчий Sync
    // dev → main просто відкотив би.
    const blocks = (yaml.match(/target-branch:\s*"dev"/g) || []).length;

    check("обидва блоки цілять у dev", blocks === 2, blocks);

    check("причина зафіксована в конфізі", /-X theirs/.test(yaml));
}

console.log("\n[7] Однакові варіанти не зливаються");
{
    // СИМПТОМ: додали товар у білому й у чорному, зайшли в обране й
    // перемкнули білий на чорний — і один рядок зник. Ззовні це
    // виглядало як «товари обʼєднались», а насправді один із них
    // видалявся, хоча людина просила лише змінити колір.
    //
    // У кошику те саме проявлялось інакше: рядки групуються за
    // id + колір + розмір, тож два однакові зливались в один із
    // кількістю 2 — тобто мовчки мінялось замовлення.
    check("обране більше не видаляє рядок при збігу",
        !/favorites\.splice\(index, 1\)/.test(common));
    check("обране відмовляє замість зміни",
        /if \(duplicateIndex !== -1\) return false/.test(common));
    check("кошик перевіряє збіг ДО зміни",
        /const collides = cart\.some/.test(cart)
        && cart.indexOf("const collides") < cart.indexOf("cart.forEach(entry => { if (matches(entry))"));

    // Мовчазна відмова виглядає як «кнопка не працює».
    check("обране повідомляє причину", /Цей варіант уже є в обраному/.test(favorites));
    check("кошик повідомляє причину", /Такий варіант уже є в кошику/.test(cart));

    // Краще показати межу до дії, ніж пояснювати після.
    check("зайняті кольори позначені в кошику", /is-taken/.test(cart));
    check("зайняті кольори позначені в обраному", /is-taken/.test(favorites));
    check("підказка пояснює, чому колір недоступний",
        /уже окремим рядком у кошику/.test(cart)
        && /уже окремим рядком в обраному/.test(favorites));
    check("є стилі позначки", /\.mini-color\.is-taken\{/.test(css));

    // Позначаємо лише кольори ТОГО САМОГО розміру: у різних розмірів
    // це різні рядки, і перемикання між ними конфлікту не створює.
    check("збіг рахується в межах одного розміру",
        /\(other\.size \|\| null\) === \(line\.size \|\| null\)/.test(cart)
        && /\(entry\.size \|\| null\) === \(activeSize \|\| null\)/.test(favorites));
}

console.log("\n[7b] Поведінка обраного — на живих даних");
{
    // Перевіряємо саму логіку, а не текст: важливо, що після спроби
    // перемкнути колір у списку лишаються ОБИДВА товари.
    const src = common.match(/function changeFavoriteVariant[\s\S]*?\n\}/)[0];

    let store = [
        { id: 7, color: "Білий", size: "Onesize" },
        { id: 7, color: "Чорний", size: "Onesize" }
    ];

    const sandbox = {
        getFavorites: () => store.map(x => ({ ...x })),
        saveFavorites: list => { store = list; }
    };

    const fn = new Function("getFavorites", "saveFavorites",
        src + "; return changeFavoriteVariant;")(sandbox.getFavorites, sandbox.saveFavorites);

    // спроба перемкнути білий на чорний — чорний уже є
    const result = fn(7, "Білий", "Onesize", "color", "Чорний");

    check("зміна відхилена", result === false, String(result));
    check("обидва товари лишились", store.length === 2, store.length);
    check("кольори не змінились",
        store.map(x => x.color).sort().join(",") === "Білий,Чорний",
        store.map(x => x.color).join(","));

    // а перемикання на вільний колір має працювати як раніше
    const ok = fn(7, "Білий", "Onesize", "color", "Червоний");

    check("вільний колір застосовується", ok === true);
    check("список не виріс", store.length === 2, store.length);
    check("колір справді змінився",
        store.some(x => x.color === "Червоний") && !store.some(x => x.color === "Білий"),
        store.map(x => x.color).join(","));
}

console.log("\n[8] Мінус при останньому примірнику теж питає");
{
    // Мінус при кількості 1 — це видалення рядка, просто інакше названа
    // кнопка. Раніше воно відбувалось мовчки: людина зменшувала
    // кількість, а товар зникав із кошика без попередження.
    check("перед видаленням останнього питаємо",
        /line && line\.qty <= 1/.test(cart) && /askConfirm\(\{[\s\S]{0,140}останній примірник/.test(cart));

    // При кількості 2+ товар лишається в кошику, і підтвердження там
    // тільки заважало б.
    check("при кількості 2+ не питаємо",
        cart.indexOf("changeQty(id, color, size, -1);") > cart.indexOf("line.qty <= 1"));
}

console.log("\n[9] Спосіб звʼязку в оформленні");
{
    const checkoutJs = strip(read("assets/js/checkout.js"));
    const checkoutHtml = read("checkout.html");

    // Раніше під заголовком завжди стояло «менеджер зателефонує вам» —
    // і людина, яка обрала Telegram, усе одно читала про дзвінок.
    check("підпис більше не статичний",
        !/Наш менеджер зателефонує вам, щоб підтвердити/.test(checkoutHtml));
    check("підпис оновлюється при виборі", /function updateContactChannelNote/.test(checkoutJs));
    check("реагує на зміну способу",
        /event\.target\.name === "contactChannel"/.test(checkoutJs));

    // Номер і пошту вводять ПІСЛЯ вибору способу — інакше підпис
    // назве порожнє поле.
    check("оновлюється і при введенні номера чи пошти",
        /\["phone", "email"\]\.forEach/.test(checkoutJs));

    // Поле ніка потрібне лише для Telegram: телефон і email уже зібрані
    // вище, Viber працює за номером.
    check("є поле для ніка Telegram", /name="Telegram"/.test(checkoutHtml));
    check("сховане за замовчуванням", /id="telegramField" hidden/.test(checkoutHtml));
    check("показується лише для Telegram",
        /telegramField\.hidden = channel !== "Telegram"/.test(checkoutJs));
    check("поле необовʼязкове", !/name="Telegram"[^>]*required/.test(checkoutHtml));

    // Сказано, що станеться, якщо нік не вказати.
    check("пояснено запасний шлях без ніка",
        /напишемо на номер, який ви ввели вище/.test(checkoutHtml));

    // Підпис називає конкретний номер чи адресу: людина бачить те, що
    // щойно ввела, і помічає одруківку до того, як їй не додзвоняться.
    ["Viber", "Telegram", "Email"].forEach(channel =>
        check(`названо спосіб «${channel}»`, new RegExp(`"${channel}":`).test(checkoutJs)));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
