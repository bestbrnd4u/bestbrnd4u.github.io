// Картка входу перед оформленням замовлення.
//
// НАВІЩО ВОНА Є
// --------------
// Магазин навмисно продає без реєстрації: змусити завести кабінет
// заради однієї покупки — найпростіший спосіб втратити покупця. Але й
// мовчати не варто: у того, хто ввійшов, контакти й адреса
// підставляться самі, а замовлення знайдеться в кабінеті.
//
// ЩО ТУТ ЗАКРІПЛЕНО НАЗАВЖДИ
// ---------------------------
// 1. ТРИ ВИХОДИ, І ВСІ ВЕДУТЬ ДО ФОРМИ. Увійти поштою, увійти чужим
//    акаунтом, продовжити без реєстрації. Картка — пропозиція, а не
//    ворота: варіант «нікуди не подітись» тут неприпустимий.
//
// 2. ЗАМОВЛЕННЯ ВИДНО ПОРУЧ. Саме це й робить картку пропозицією:
//    людина бачить, що купує, поки вирішує, входити чи ні. Тому картка
//    стоїть у ЛІВІЙ колонці разом із формою, а не окремим рядком над
//    сіткою.
//
// 3. ВІДМОВУ ЧУЮТЬ З ПЕРШОГО РАЗУ. Натиснув «продовжити» — картка не
//    повертається до кінця візиту. Друге те саме вікно читається як
//    «мене не почули».
//
// 4. ЛОГІКА ВХОДУ ОДНА НА ДВІ СТОРІНКИ. Вхід через Telegram — півтори
//    сотні рядків із опитуванням і одноразовим токеном; двома копіями
//    він прожив би до першої правки.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const html = read("checkout.html");
const js = read("assets/js/checkout-auth.js");
const widget = read("assets/js/auth-widget.js");
const css = read("assets/css/style.css");

console.log("\n[1] Три виходи, і всі ведуть до форми");
{
    check("картка є в розмітці", /id="checkoutAuth"/.test(html));

    // Схована до відповіді: показувати її тому, хто вже ввійшов, —
    // те саме, що не знати про нього нічого.
    check("схована, поки не з'ясували, хто це",
        /id="checkoutAuth"[^>]*hidden/.test(html));

    check("вихід 1 — пошта й пароль",
        /id="loginForm"/.test(html) && /id="loginEmail"/.test(html) && /id="loginPassword"/.test(html));

    check("вихід 2 — чужий акаунт",
        /data-provider="google"/.test(html) && /id="telegramLoginBtn"/.test(html));

    check("вихід 3 — без реєстрації", /id="checkoutGuest"/.test(html));

    // Найважливіше: жоден із виходів не мусить лишати людину на місці.
    check("вхід поштою веде далі",
        /await signedIn\(\);/.test(js) && /async function signedIn/.test(js));

    check("чужий акаунт веде далі", /authBindTelegram\(signedIn\)/.test(js));

    check("«продовжити» веде далі",
        /getElementById\("checkoutGuest"\)\?\.addEventListener[\s\S]{0,200}hideCard\(\)/.test(js));

    // Заради цього вхід тут і пропонується.
    check("після входу дані підставляються у форму",
        /typeof prefillFromProfile === "function"/.test(js));

    // Підстановка — зручність, а не умова покупки.
    check("невдала підстановка не ламає оформлення",
        /catch \(error\)[\s\S]{0,200}Не вдалося підставити дані профілю/.test(js));
}

console.log("\n[2] Замовлення видно поруч із карткою");
{
    // Сітка оформлення — дві колонки: ліворуч форма, праворуч «Ваше
    // замовлення». Картка мусить стояти в ЛІВІЙ разом із формою.
    // Прямим нащадком сітки вона поїхала б у другу колонку й
    // виштовхнула замовлення вниз — тобто зникло б саме те, що робить
    // її пропозицією, а не воротами.
    check("ліва колонка — один нащадок сітки", /<div class="checkout-main">/.test(html));

    const layout = html.slice(html.indexOf('id="checkoutLayout"'), html.indexOf("</section>", html.indexOf('id="checkoutLayout"')));

    check("картка й форма — в одній колонці",
        layout.indexOf('class="checkout-main"') < layout.indexOf('id="checkoutAuth"')
        && layout.indexOf('id="checkoutAuth"') < layout.indexOf('id="checkoutForm"'));

    check("замовлення лишилось другим нащадком сітки",
        layout.indexOf('class="order-summary"') > layout.indexOf('id="checkoutForm"'));

    check("колонка має розкладку", /\.checkout-main\{/.test(css));

    // ПРАВЕ ПОЛЕ НА ТЕЛЕФОНІ. Заміряно на 375px ДО цієї правки, на
    // живому проді: сітка 335px, а форма й «Ваше замовлення» — 377.
    // Обидва блоки вилазили за контейнер, і праворуч не лишалось
    // відступу взагалі. Нащадок сітки за замовчуванням не звужується
    // вужче за свій min-content.
    check("нащадки сітки можуть звузитись",
        /\.checkout-main,\s*\n\.checkout-form,\s*\n\.order-summary\{\s*\n\s*min-width:0;/.test(css));
}

console.log("\n[3] Відмову чують з першого разу");
{
    // sessionStorage, а не localStorage: «куплю без кабінету» сказано
    // про цю покупку, а не назавжди.
    // Коментарі не рахуємо: там localStorage згаданий саме як те,
    // чого тут робити не можна.
    const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    check("вибір пам'ятається до кінця візиту",
        /sessionStorage/.test(code) && !/localStorage/.test(code));

    check("і саме він вирішує, чи показувати картку",
        /if \(skipped\(\)\) return;/.test(js));

    // Приватне вікно або заборонені дані сайту не мусять ламати
    // оформлення.
    check("недоступне сховище не ламає сторінку",
        (js.match(/catch \(error\)/g) || []).length >= 3);

    check("тому, хто вже ввійшов, картки немає",
        /const user = await getCurrentUser\(\);\s*\n\s*if \(user\) return;/.test(js));
}

console.log("\n[4] Логіка входу одна на дві сторінки");
{
    check("спільний модуль існує", /function authBindTelegram/.test(widget));

    // У самій картці оформлення не мусить бути ні опитування, ні
    // токенів: це рівно те, що жило б двома копіями.
    check("картка оформлення не має власного Telegram",
        !/setInterval/.test(js) && !/verifyOtp/.test(js) && !/telegram-login-start/.test(js));

    check("і власного перекладу помилок",
        /translateAuthError\(error\)/.test(js) && !/Invalid login credentials/.test(js));

    // Порядок підключення: auth-widget перед checkout-auth, а
    // checkout.js — раніше за обидва, бо в нього просять
    // prefillFromProfile.
    // Шукаємо саме теги, а не згадки: обидва файли названі ще й у
    // коментарі нагорі сторінки, і пошук по імені знаходив його
    // першим — тест червонів на поясненні, а не на порядку.
    const order = ["assets/js/checkout.js", "assets/js/auth-widget.js", "assets/js/checkout-auth.js"]
        .map(src => html.indexOf(`<script src="${src}`));

    check("скрипти підключені в правильному порядку",
        order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2],
        order.join(" < "));

    // ПОВЕРТАТИСЬ ТРЕБА ДО ПОКУПКИ, А НЕ В КАБІНЕТ. Інакше вхід через
    // Google посеред оформлення губить кошик із поля зору.
    check("після чужого акаунту повертаємось до оформлення",
        /authBindProviders\(window\.location\.origin \+ "\/checkout"\)/.test(js));
}

console.log("\n[5] Один увімкнений провайдер не виглядає недомальованим");
{
    // Сітка розрахована на дві кнопки поруч — Facebook і Google. Поки
    // Facebook не під'єднаний, Google лишався сам у лівій половині
    // рядка, з порожнечею праворуч.
    //
    // Порахувати видимі кнопки самим CSS не можна: схована лишається
    // дочірнім елементом, тож :only-child не спрацює.
    check("клас ставиться з коду",
        /classList\.toggle\("auth-social-one", providers === 1\)/.test(widget));

    check("і рахує саме провайдерів, а не Telegram",
        /querySelectorAll\("\.auth-social-btn\[data-provider\]"\)/.test(widget));

    check("стиль на нього є", /\.auth-social-one\{\s*\n\s*grid-template-columns:1fr;/.test(css));
}

console.log(failures === 0
    ? "\n✅ Картка входу: три виходи, замовлення поруч, логіка спільна\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
