// Статистика відвідувань (Google Analytics 4).
//
// ГОЛОВНЕ, ЩО СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// -----------------------------------
// 1. Без згоди — жодного запиту до Google. Це не перестраховка: у
//    політиці конфіденційності сказано, що ми питаємо окремо, і
//    «спитати, а потім усе одно завантажити» зробило б цю обіцянку
//    неправдивою.
// 2. У статистику не йдуть персональні дані. Ім'я, телефон, пошта й
//    адреса доставки довірені магазину, а не Google.
// 3. Назви подій — саме ті, які очікує GA4. Своя назва означає порожній
//    звіт: Google просто не знає, що з нею робити.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const analytics = read("assets/js/analytics.js");
const code = analytics.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[1] Без згоди Google не завантажується");
{
    // Стан «відмовлено» виставляється ОДРАЗУ, ще до будь-якого
    // завантаження: якщо скрипт колись з'явиться іншим шляхом, він
    // застане заборону, а не почне збирати.
    check("згода за замовчуванням — відмовлено",
        /gtag\("consent", "default"[\s\S]{0,300}analytics_storage: "denied"/.test(code));
    check("рекламні сховища теж заборонені",
        /ad_storage: "denied"/.test(code) && /ad_personalization: "denied"/.test(code));

    check("скрипт вантажиться лише після дозволу",
        /function enable\(\)[\s\S]{0,200}consent", "update"[\s\S]{0,120}loadScript\(\)/.test(code));

    // Перевірка згоди мусить бути перед КОЖНОЮ подією, а не лише при
    // завантаженні: людина може відкликати згоду посеред сесії.
    check("кожна подія перевіряє згоду",
        /function send\([\s\S]{0,220}if \(!allowed\(\)\) return/.test(code));

    check("згода посеред сесії вмикає без перезавантаження",
        /consent:change[\s\S]{0,140}enable\(\)/.test(code));

    // Порожній ідентифікатор = вимкнено повністю. Подія при цьому не
    // «виходить одразу», а лягає в чергу — інакше губились би події,
    // що сталися до завантаження налаштувань. Черга просто ніколи не
    // відправиться і очищається.
    check("без ідентифікатора нічого не відправляється",
        /if \(!measurementId \|\| !loaded\)/.test(code));
    check("черга очищається, коли статистика вимкнена",
        /if \(!measurementId\) \{[\s\S]{0,200}pending\.length = 0/.test(code));
}

console.log("\n[2] Персональні дані не передаються");
{
    // Пряма перевірка: у модулі не має бути жодного поля з
    // персональними даними покупця.
    const forbidden = ["firstName", "lastName", "phone", "email", "address",
        "city", "warehouse", "Телефон", "Пошта"];

    const leaked = forbidden.filter(word => new RegExp(word).test(code));

    check("у модулі немає персональних полів", leaked.length === 0, leaked.join(", "));

    // У покупці — лише номер, сума й склад кошика.
    const purchase = (code.match(/purchase: function[\s\S]*?\n        \}/) || [""])[0];

    check("у покупці лише номер, сума й товари",
        /transaction_id/.test(purchase) && /value:/.test(purchase) && /items:/.test(purchase));
    check("і жодних персональних полів у ній",
        !forbidden.some(w => new RegExp(w).test(purchase)));

    // Адреси товарів містять колір і розмір — у звітах вони зайві:
    // та сама сумка рахувалася б як десяток різних сторінок.
    check("адреса сторінки без параметрів",
        /page_location: location\.origin \+ location\.pathname/.test(code));
}

console.log("\n[3] Назви подій — стандартні для GA4");
{
    // Своя назва = порожній звіт: Google не знає, що з нею робити.
    const required = [
        "view_item_list", "select_item", "view_item",
        "add_to_cart", "remove_from_cart", "view_cart",
        "begin_checkout", "add_to_wishlist", "purchase", "search"
    ];

    const missing = required.filter(name => !new RegExp(`"${name}"`).test(code));

    check(`усі ${required.length} подій електронної комерції`,
        missing.length === 0, missing.join(", "));

    // Валюта обов'язкова, інакше GA4 не порахує дохід.
    check("валюта вказана", /currency: "UAH"/.test(code));

    // Знижку Google рахує окремим полем — інакше у звітах видно лише
    // кінцеву ціну, і незрозуміло, скільки продано за акцією.
    check("знижка окремим полем", /item\.discount =/.test(code));
}

console.log("\n[4] Події розставлені в коді магазину");
{
    const places = [
        ["додавання в кошик", "assets/js/common.js", /Analytics\?\.addToCart/],
        ["додавання в обране", "assets/js/common.js", /Analytics\?\.addToWishlist/],
        ["пошук", "assets/js/common.js", /Analytics\?\.search/],
        ["видалення з кошика", "assets/js/cart.js", /Analytics\?\.removeFromCart/],
        ["перегляд кошика", "assets/js/cart.js", /Analytics\?\.viewCart/],
        ["перегляд товару", "assets/js/product.js", /Analytics\?\.viewItem/],
        ["список каталогу", "assets/js/catalog.js", /Analytics\?\.viewItemList/],
        ["початок оформлення", "assets/js/checkout.js", /reportCheckout\("beginCheckout"\)/],
        ["покупка", "assets/js/checkout.js", /reportCheckout\("purchase", orderId\)/]
    ];

    places.forEach(([label, file, pattern]) =>
        check(label, pattern.test(read(file))));

    // Видалення ловимо ДО збереження — інакше нема звідки взяти ціну.
    check("видалення ловиться до збереження",
        read("assets/js/cart.js").indexOf("Analytics?.removeFromCart")
            < read("assets/js/cart.js").indexOf("const cart = getCart().filter"));

    // Покупку — ДО очищення кошика.
    // Порівнюємо з КОДОМ: у коментарі поруч saveCart([]) згадується
    // навмисно — щоб пояснити, чому подія має бути раніше.
    const checkout = read("assets/js/checkout.js")
        .replace(/\/\/[^\n]*/g, "");

    check("покупка ловиться до очищення кошика",
        checkout.indexOf('reportCheckout("purchase"') < checkout.indexOf("saveCart([])"));

    // Пошук із затримкою: людина набирає по літері, і без неї у звіт
    // полетіли б «с», «су», «сум».
    check("пошук надсилається із затримкою",
        /clearTimeout\(reportSearch\.timer\)/.test(read("assets/js/common.js")));
}

console.log("\n[5] Ідентифікатор — налаштування, а не константа");
{
    const { loadYaml } = require("./helpers/yaml");

    const entry = loadYaml("admin/config.yml").collections
        .find(c => c.name === "pages").files.find(f => f.name === "analytics");

    check("розділ в адмінці є", !!entry);
    check("пише в data/analytics.json", entry && entry.file === "data/analytics.json");
    check("файл існує", fs.existsSync(path.join(ROOT, "data/analytics.json")));

    const field = ((entry || {}).fields || []).find(f => f.name === "measurementId");

    check("поле є", !!field);
    check("поле необовʼязкове", field && field.required === false);
    check("підказка пояснює, де взяти", /Потоки даних/.test(String(field && field.hint)));

    // Ідентифікатора в коді бути не має: він змінюється без правки коду.
    check("у модулі немає зашитого ідентифікатора", !/G-[A-Z0-9]{6,}/.test(code));
}

console.log("\n[6] Згода питає саме про статистику");
{
    const consent = read("assets/js/consent.js");

    check("категорія «аналітика» є",
        /var OPTIONAL = \["embeds", "analytics"\]/.test(consent));

    // Додалась категорія — стара відповідь більше не діє.
    check("версію згоди піднято", /var VERSION = 2/.test(consent));

    check("банер називає Google Analytics", /Google Analytics/.test(consent));

    // Політика мусить описувати те, що є насправді.
    const policy = read("privacy-policy.html");

    check("політика більше не стверджує, що аналітики немає",
        !/немає Google Analytics/.test(policy));
    check("політика називає її й умову згоди",
        /Google Analytics/.test(policy) && /ЛИШЕ після вашої/.test(policy));
}

console.log("\n[7] Подія до завантаження налаштувань не губиться");
{
    // СИМПТОМ: у звітах не було view_item, хоча сторінки товарів
    // відкривали. Причина: data/analytics.json тягнеться запитом, а
    // подія на сторінці товару стається при відмальовці — РАНІШЕ.
    // Стояла перевірка «немає measurementId → виходимо», і такі події
    // просто зникали.
    const { JSDOM } = require("jsdom");

    const run = (config, consent, delay) => {

        const dom = new JSDOM("<head></head><body></body>", {
            runScripts: "outside-only",
            url: "https://bestbrnd4u.com/p/x/"
        });

        const w = dom.window;

        w.fetch = () => new Promise(res => setTimeout(() => res({
            ok: true,
            json: () => Promise.resolve(config)
        }), delay || 0));

        w.Consent = { has: () => consent };

        w.eval(analytics);

        // подія одразу, ще до завантаження налаштувань
        w.Analytics.viewItem({ id: 9, title: "Тест", price: 100 }, { color: "Синій" });

        return new Promise(res => setTimeout(() => res({
            events: (w.dataLayer || []).filter(a => a[0] === "event").map(a => a[1]),
            script: !!w.document.querySelector("script[src*=googletagmanager]")
        }), (delay || 0) + 120));

    };

    return run({ measurementId: "G-TEST" }, true, 120).then(early => {

        check("рання подія доходить після завантаження",
            early.events.includes("view_item"), early.events.join(", "));

        return run({ measurementId: "" }, true, 0);

    }).then(off => {

        // Порожній ідентифікатор = статистика вимкнена. Черга не має
        // «прорватись» після завантаження.
        check("зі вимкненою статистикою подій немає", off.events.length === 0,
            off.events.join(", "));
        check("і скрипт Google не вантажиться", off.script === false);

        return run({ measurementId: "G-TEST" }, false, 0);

    }).then(denied => {

        check("без згоди подій немає", denied.events.length === 0);
        check("без згоди скрипт не вантажиться", denied.script === false);

        // select_item був описаний, але ніде не викликався — подія
        // «клац по картці» не відправлялась зовсім.
        check("клац по картці відправляє select_item",
            /Analytics\?\.selectItem\(clicked, "Каталог"/.test(read("assets/js/common.js")));

        // Кожна описана подія мусить десь викликатись, інакше вона
        // існує лише на папері.
        const defined = [...analytics.matchAll(/^        ([a-zA-Z]+): function/gm)]
            .map(m => m[1]);

        const wired = ["assets/js/common.js", "assets/js/cart.js", "assets/js/product.js",
            "assets/js/catalog.js", "assets/js/checkout.js"]
            .map(f => read(f)).join("\n");

        const unused = defined.filter(name =>
            !new RegExp(`Analytics\\?\\.${name}\\(`).test(wired)
            && !new RegExp(`Analytics\\.${name}\\(`).test(wired));

        check("усі описані події справді викликаються", unused.length === 0,
            unused.join(", "));

        console.log(failures === 0
            ? "\n✅ Усі перевірки пройдено"
            : `\n❌ Провалено: ${failures}`);

        process.exit(failures === 0 ? 0 : 1);

    });
}

