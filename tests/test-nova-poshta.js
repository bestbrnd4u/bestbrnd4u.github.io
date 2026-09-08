// Підказки Нової пошти: місто й відділення вибирають, а не вписують.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. КЛЮЧ НП НЕ ПОПАДАЄ В БРАУЗЕР. Він дає право створювати накладні
//    на рахунку магазину — у коді сайту йому не місце.
//
// 2. ПРОКСІ ВМІЄ ЛИШЕ ЧИТАТИ ДОВІДНИК. Дві операції, і жодного
//    створення накладних: інакше відкритий проксі став би способом
//    оформлювати відправлення від імені магазину.
//
// 3. БЕЗ ДОВІДНИКА ЗАМОВЛЕННЯ ОФОРМЛЮЄТЬСЯ. Немає ключа, НП не
//    відповіла — поле лишається звичайним текстовим.
//
// 4. ВІДДІЛЕННЯ — ТІЛЬКИ ВИБРАНОГО МІСТА. Список «усієї України» не
//    має сенсу, а старе відділення з іншого міста в замовленні —
//    гірше за порожнє поле.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const np = require("../supabase/functions/telegram-order-bot/nova-poshta.js");

const src = read("supabase/functions/telegram-order-bot/_index.src.ts");
const built = read("supabase/functions/telegram-order-bot/index.ts");
const page = read("assets/js/nova-poshta.js");
const checkout = read("checkout.html");

const CITY_REF = "8d5a980d-391c-11dd-90d9-001a92567626";

console.log("\n[1] Ключ НП лишається на сервері");
{
    check("ключ читається з секретів",
        /NOVAPOSHTA_API_KEY = Deno\.env\.get\("NOVAPOSHTA_API_KEY"\)/.test(src));

    // Найважливіша перевірка цього файлу: у коді сайту не має бути ні
    // ключа, ні прямого звернення до НП. Назва модуля (NovaPoshta) —
    // це не те й не інше, тому шукаємо саме адресу API й ім'я секрета.
    const site = page.replace(/\/\/.*$/gm, "");

    check("прямих запитів до НП із браузера немає",
        !/novaposhta\.ua/.test(site), "знайдено звернення до api.novaposhta.ua");

    check("ключа в коді сайту немає",
        !/NOVAPOSHTA_API_KEY/.test(site) && !/apiKey/.test(site));

    check("браузер питає нашу функцію",
        /functions\.invoke\("telegram-order-bot"/.test(page)
        && /site_action: "nova-poshta"/.test(page));

    check("описано в інструкції по секретах",
        /NOVAPOSHTA_API_KEY/.test(read("supabase/README-telegram-bot.md")));

    check("є покрокова документація",
        fs.existsSync(path.join(ROOT, "docs/НОВА-ПОШТА.md")));
}

console.log("\n[2] Проксі вміє тільки довідник");
{
    // Не кількість, а СУТЬ: кожен дозволений метод — це читання
    // довідника. Третій (types) додався, коли з'ясувалось, що тип
    // точки мусить фільтрувати НП, а не ми; правило від цього не
    // змінилось.
    const methods = Object.values(np.NP_METHODS).map(m => m.calledMethod);

    check("методи лише на читання: " + methods.join(", "),
        methods.every(name => /^(search|get)/.test(name)));

    check("є пошук міста, перелік точок і довідник типів",
        np.NP_METHODS.settlements.calledMethod === "searchSettlements"
        && np.NP_METHODS.warehouses.calledMethod === "getWarehouses"
        && np.NP_METHODS.types.calledMethod === "getWarehouseTypes");

    check("чужий метод не проходить",
        np.npRequest("KEY", { method: "save", query: "x" }) === null);

    check("створення накладних не згадується в коді проксі",
        !/InternetDocument|save|delete/i.test(read("supabase/functions/telegram-order-bot/nova-poshta.js")
            .replace(/\/\/.*$/gm, "")));

    // Ref міста підставляється в запит до НП — форму треба перевіряти.
    check("сміття замість ref не проходить",
        np.npRequest("KEY", { method: "warehouses", cityRef: "'; drop" }) === null);

    check("справжній ref проходить",
        np.npRequest("KEY", { method: "warehouses", cityRef: CITY_REF }).methodProperties.CityRef === CITY_REF);

    // Одна літера — це півтисячі міст і жодної користі.
    check("одна літера не йде в НП",
        np.npRequest("KEY", { method: "settlements", query: "К" }) === null);

    check("дві вже йдуть",
        np.npRequest("KEY", { method: "settlements", query: "Ки" }).methodProperties.CityName === "Ки");

    check("довгий запит обрізається",
        np.npRequest("KEY", { method: "settlements", query: "х".repeat(200) })
            .methodProperties.CityName.length === 60);

    check("без ключа запиту немає",
        np.npRequest("", { method: "settlements", query: "Київ" }) === null);
}

console.log("\n[3] Відповідь НП розбирається обережно");
{
    const cities = np.parseSettlements({
        data: [{ Addresses: [
            { Present: "м. Київ, Київська обл.", DeliveryCity: CITY_REF },
            { Present: "с. Київець", DeliveryCity: "" }
        ] }]
    });

    check("місто з назвою й ref", cities.length === 1 && cities[0].ref === CITY_REF);

    check("місто без ref відкидається (відділень не спитати)",
        !cities.some(c => c.name === "с. Київець"));

    // Формат НП може змінитись — це не має валити сторінку оформлення.
    [null, {}, { data: [] }, { data: [{}] }, { data: "щось" }].forEach((shape, i) => {
        check(`несподівана відповідь #${i} не валить розбір`,
            Array.isArray(np.parseSettlements(shape)) && np.parseSettlements(shape).length === 0);
    });

    const houses = np.parseWarehouses({ data: [
        { Description: "Відділення №1: вул. Хрещатик, 1", Number: "1", CategoryOfWarehouse: "Branch" },
        { Description: "Поштомат №1234", Number: "1234", CategoryOfWarehouse: "Postomat" },
        { Description: "", Number: "9" }
    ] });

    check("відділення й поштомат розрізняються",
        houses.length === 2 && houses[0].postomat === false && houses[1].postomat === true);

    check("рядок без назви відкидається", !houses.some(h => h.name === ""));

    // НП відповідає HTTP 200 навіть на невдалий запит: успіх лежить у
    // полі success. Без цього «недійсний ключ» виглядав би як «немає
    // такого міста».
    check("відмова НП розпізнається",
        np.npError({ success: false, errors: ["API key expired"] }) === "API key expired");

    check("успіх розпізнається", np.npError({ success: true }) === null);

    check("порожня відповідь — теж відмова", Boolean(np.npError(null)));
}

console.log("\n[2b] Латиниця в назві міста — тупик, і про це сказано");
{
    // ЩО ЗМІРЯНО живими запитами до нашої ж функції:
    //
    //     Київ, Одеса, Львів, Харків  → знаходяться
    //     Kyiv                        → novaposhta_failed
    //
    // А в журналі сайту (різновид np_directory):
    //
    //     settlements: CityName has invalid characters
    //
    // Тобто НП приймає назву міста ЛИШЕ кирилицею, а латиницю вважає
    // зіпсованим запитом — не «нічого не знайдено», а помилкою.
    //
    // Для покупця з латинською розкладкою це було мовчання: підказок
    // немає, причини не видно.
    check("кирилиця йде в НП",
        np.npRequest("KEY", { method: "settlements", query: "Київ" }) !== null);

    check("латиниця не йде: НП відкине її помилкою",
        np.npRequest("KEY", { method: "settlements", query: "Kyiv" }) === null);

    check("самі цифри теж не йдуть",
        np.npRequest("KEY", { method: "settlements", query: "12345" }) === null);

    // Змішане написання лишаємо: у ньому є кирилиця, тож НП запит
    // прийме, а що знайде — її справа.
    check("змішане написання не відкидаємо",
        np.npRequest("KEY", { method: "settlements", query: "Кyiv" }) !== null);

    // ЩО НЕ РОБИМО: не перекладаємо самі. «Kyiv», «Kiev», «Kyyiv» —
    // три написання одного міста, і здогад тут означає посилку не
    // туди. Тому в коді не має бути таблиці зворотної транслітерації.
    check("зворотної транслітерації немає — не вгадуємо місто за людину",
        !/Kyiv["']?\s*:/.test(page) && !/kiev/i.test(page.replace(/\/\/.*$/gm, "")));

    // Браузер мусить сказати це ДО запиту: інакше людина бачить
    // мовчання й не знає, що робити.
    check("браузер попереджає до запиту",
        /CYRILLIC\.test\(query\)/.test(page) && /showCityHint/.test(page));

    check("текст підказки називає причину",
        /українською/.test(page));

    // І це не «помилка людини»: вона нічого не порушила.
    check("підказка не червона, а попереджувальна",
        /cityHint\.className = "np-notice"/.test(page));
}

console.log("\n[3b] Тип «Поштомат» — саме НП, а не чужий бренд");
{
    // ЦЕ СПРАВЖНЯ ВІДПОВІДЬ НОВОЇ ПОШТИ, знята живим запитом до
    // нашої ж функції (site_action: nova-poshta, method: types).
    //
    // «Поштоматів» у ній ДВА, і чужий стоїть РАНІШЕ:
    //
    //     Поштомат ПриватБанку
    //     Поштомат
    //
    // postomatTypeRef брала перший збіг за /поштомат/i — тобто пошук
    // поштоматів Нової пошти фільтрувався за типом ПриватБанку й
    // повертав порожній список ЗАВЖДИ. Помилки при цьому не було:
    // НП чесно відповідала «нічого не знайдено», і ззовні це
    // виглядало як «не знаходить поштомат за номером».
    const REAL_TYPES = [
        { name: "Поштове відділення з обмеження", ref: "limited" },
        { name: "Поштове(ий)", ref: "branch" },
        { name: "Поштомат ПриватБанку", ref: "privat" },
        { name: "Вантажне(ий)", ref: "cargo" },
        { name: "Поштомат", ref: "np" }
    ];

    check("береться поштомат НП, а не ПриватБанку",
        np.postomatTypeRef(REAL_TYPES) === "np",
        np.postomatTypeRef(REAL_TYPES));

    // Порядок не має рятувати: якщо НП колись поміняє рядки місцями,
    // правило мусить лишитись правильним.
    check("порядок у відповіді нічого не вирішує",
        np.postomatTypeRef(REAL_TYPES.slice().reverse()) === "np");

    // Запас на перейменування: чужі бренди додають слова, власний
    // тип НП зветься одним.
    check("без точного збігу береться найкоротша назва",
        np.postomatTypeRef([
            { name: "Поштомат ПриватБанку", ref: "privat" },
            { name: "Поштомати НП", ref: "np2" }
        ]) === "np2");

    check("немає поштоматів — немає й ref",
        np.postomatTypeRef([{ name: "Вантажне(ий)", ref: "cargo" }]) === ""
        && np.postomatTypeRef([]) === ""
        && np.postomatTypeRef(null) === "");

}

console.log("\n[4] Сторінка не залежить від довідника");
{
    check("модуль підключено", /assets\/js\/nova-poshta\.js/.test(checkout));

    check("без ключа функція відповідає «недоступно»",
        /novaposhta_unavailable/.test(src));

    // Головне: відповідь 200, а не помилка. Помилка в консолі на
    // сторінці оформлення виглядає як «магазин зламався».
    check("відмова не виглядає як поломка",
        /novaposhta_unavailable", items: \[\] \}, 200/.test(src));

    // ПАУЗА, А НЕ ВІЧНИЙ ЗАСУВ.
    //
    // Тут стояло `available = false` — і перевірка це схвалювала.
    // Задум був «не ходити в мережу по ту саму відмову на кожну
    // літеру», але вийшло інше: один засув на ВСІ поля й до
    // перезавантаження сторінки. Пошук поштомата не вдався — і місто
    // перестало шукатись, хоч щойно працювало. Саме це й побачив
    // покупець: вводить місто заново, а запиту немає зовсім.
    check("відмова гасить довідник НА ЧАС, а не назавжди",
        /RETRY_AFTER/.test(page) && /silentUntil/.test(page)
        && !/available = false/.test(page));

    check("пауза розумної довжини (щоб і мережу не мучити, і не мовчати хвилинами)",
        (() => {
            const ms = Number((page.match(/RETRY_AFTER = (\d+)/) || [])[1]);
            return ms >= 5000 && ms <= 60000;
        })(),
        (page.match(/RETRY_AFTER = (\d+)/) || [])[1]);

    // І покупець мусить дізнатись, що робити далі. Раніше поле просто
    // перестало б підказувати, і людина не знала, чи це вона щось
    // робить не так, чи сайт зламався. Номер можна вписати руками —
    // але про це ніде не було сказано.
    check("покупцеві сказано, що номер можна вписати вручну",
        /np-notice/.test(page) && /вручну/.test(page));

    check("і цей рядок має вигляд у стилях",
        /\.np-notice\{/.test(fs.readFileSync(
            path.join(ROOT, "assets/css/style.css"), "utf8")));

    // Причина відмови мусить доїжджати до власника: журнал Edge
    // Functions ніхто не читає щодня, і саме тому «не знаходить
    // поштомат» з'ясувалось лише зі скарги.
    check("причина відмови йде в щоденний звіт",
        /reportServerIssue\("np_directory"/.test(src));

    check("різновид дозволений у базі",
        /'np_directory'/.test(fs.readFileSync(
            path.join(ROOT, "supabase/migrations/023-np-directory-issues.sql"), "utf8")));

    check("недоступна НП не ламає оформлення",
        /catch/.test(page) && /return null/.test(page));

    check("поля лишились звичайними полями",
        /id="city"/.test(checkout) && /id="branchNumber"/.test(checkout));
}

console.log("\n[4b] Місто, підставлене НЕ з підказки, теж працює");
{
    // ЩО БУЛО НЕ ТАК. applySavedAddress() ставить у поле назву міста
    // зі збереженої адреси покупця. Поле виглядає заповненим — а
    // cityRef порожній, бо він ставиться лише при виборі з підказки.
    // Далі warehouses() виходить на `if (!cityRef)` і не робить
    // запиту ВЗАГАЛІ: список порожній, пояснення немає.
    //
    // Ззовні це не відрізнити від «не знаходить поштомат за номером».
    const checkoutJs = read("assets/js/checkout.js");

    check("модуль уміє знайти ref за назвою", /useCity/.test(page));

    check("і віддає це назовні", /useCity:\s*function/.test(page));

    check("збережена адреса просить ref", 
        /applySavedAddress[\s\S]{0,700}?NovaPoshta\.useCity/.test(checkoutJs));

    check("дані з профілю — теж",
        /fill\("city", data\.city\)[\s\S]{0,600}?NovaPoshta\.useCity/.test(checkoutJs));

    // «Київ» не має перетворитись на «Київець»: серед підказок НП
    // однойменних сіл десятки.
    check("береться точний збіг назви, а не перший-ліпший",
        /=== query/.test(page) && /exact/.test(page));

    // Якщо НП не відповіла — поле мусить лишитись звичайним, а не
    // зламати сторінку.
    check("без відповіді ref лишається порожнім",
        /if \(!items \|\| !items\.length\) return ""/.test(page));
}

console.log("\n[5] Відділення — тільки вибраного міста");
{
    check("без міста відділення не питаються",
        /if \(!cityRef\) return Promise\.resolve\(null\)/.test(page));

    // Людина виправила місто руками після вибору — ref уже не про це
    // місто, і старе відділення поїхало б у замовлення з новим містом.
    check("зміна міста скидає ref", /cityRef = "";/.test(page));

    check("і чистить поле відділення",
        /\[branch, postomat\]\.forEach/.test(page));

    check("поштомати не змішані з відділеннями",
        /Boolean\(item\.postomat\) === wantPostomat/.test(page));

    // ЩО БУЛО НЕ ТАК. Спершу сторінка вантажила весь список точок
    // міста й фільтрувала його сама. На Києві це не працювало: точок
    // кілька тисяч, НП віддає 500 за раз, а поштомати мають номери на
    // 4xxxx — у ту сотню вони не потрапляли ніколи. Відділення
    // знаходились, поштомати ні.
    const proxy = read("supabase/functions/telegram-order-bot/nova-poshta.js");

    check("текст пошуку йде в НП, а не фільтрується на місці",
        /query: query/.test(page) && !/indexOf\(needle\)/.test(page));

    check("НП шукає і за номером, і за адресою", /FindByString/.test(proxy));

    // Тип точки теж мусить фільтрувати НП: інакше з 50 знайдених могли
    // б прийти лише відділення, і поштоматів у списку знову не було б.
    check("тип точки просимо в НП",
        /TypeOfWarehouseRef/.test(proxy) && /postomat: wantPostomat/.test(page));

    // Ref типу беремо з довідника НП, а не зашиваємо в код: зашитий
    // GUID колись перестане існувати, і ніхто не зрозуміє чому.
    check("ref поштомату з довідника, а не з коду",
        /getWarehouseTypes/.test(proxy) && /поштомат/i.test(proxy));

    // Покупець стирає й дописує номер, повертається до поля — ту саму
    // відповідь тривожити мережею не треба.
    check("та сама відповідь не питається двічі",
        /if \(answers\[key\]\) return Promise\.resolve\(answers\[key\]\)/.test(page));

    check("кеш розрізняє місто, тип точки й запит",
        /cityRef \+ "\|" \+ \(wantPostomat \? "p" : "b"\) \+ "\|" \+ query/.test(page));
}

console.log("\n[6] Підказки придатні для клавіатури");
{
    check("стрілки", /ArrowDown/.test(page) && /ArrowUp/.test(page));
    check("Enter вибирає", /event\.key === "Enter"/.test(page));
    check("Escape закриває", /event\.key === "Escape"/.test(page));

    // mousedown, а не click: інакше поле встигає втратити фокус,
    // список закривається — і клік іде в порожнє місце.
    check("клік по підказці спрацьовує", /mousedown/.test(page));

    check("запит не на кожну літеру", /DEBOUNCE = 250/.test(page));

    // Поріг у дві літери має сенс ЛИШЕ для міста, де кожен запит іде в
    // НП. У полі відділення список уже завантажений, а «1» — найчастіший
    // запит узагалі (перше відділення в кожному місті). Із порогом на
    // «1» покупець бачив порожнечу й вирішував, що підказки не працюють
    // — саме це й показала перевірка в браузері.
    check("у відділенні порогу немає",
        /attach\(branch, warehouses\(false\), null, 0\)/.test(page)
        && /attach\(postomat, warehouses\(true\), null, 0\)/.test(page));

    check("місто лишається з порогом",
        /var limit = typeof min === "number" \? min : MIN_QUERY/.test(page));

    // Список на фокус: покупцеві не треба вгадувати, що вводити.
    check("список видно одразу, щойно поставили курсор",
        /if \(limit === 0\)/.test(page) && /addEventListener\("focus"/.test(page));

    // Двічі на одне поле чіплятись не можна: другий список ліг би
    // поверх першого.
    check("двічі на поле не чіпляємось", /npReady/.test(page));

    check("автозаповнення браузера не накриває список",
        /setAttribute\("autocomplete", "off"\)/.test(page));

    // Назви приходять із чужого API — вставляти їх у розмітку як є
    // не можна.
    check("назви екрануються", /function escape\(text\)/.test(page)
        && /replace\(\/</.test(page));

    check("список не розсовує форму", /position:absolute/.test(read("assets/css/style.css")));

    check("зібрана функція не застаріла",
        built.includes("api.novaposhta.ua/v2.0/json/") && built.includes("nova-poshta"));
}

console.log(failures === 0
    ? "\n✅ Нова пошта: адресу вибирають зі довідника, ключ лишається на сервері\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
