// Повторна відмова від того самого товару.
//
// ЧОМУ ЦЕЙ НАБІР ВИКОНУЄ КОД, А НЕ ШУКАЄ РЯДКИ
// ---------------------------------------------
// Сусідній набір (test-refusal-dialog) звіряє текст файлів: чи стоїть
// перевірка там, де має стояти. Він чесно проходив і тоді, коли захист
// не працював, — бо всі перевірки СПРАВДІ стояли на місці, тільки
// спирались на дані, яких не було.
//
// Дірка була в іншому: заявки читались лише для замовлень із позначкою
// orders.refusal_requested_at, а ставить її тригер у базі. Тригер не
// спрацював — рядок у order_refusals є, позначки немає, кабінет своїх
// же заявок не бачить. Кнопка «Відмова» поверталась після оновлення
// сторінки, вікно пропонувало той самий товар удруге.
//
// Такі помилки ловить лише запущений код, тож тут витягуються справжні
// функції з account.js і виконуються на підроблених даних.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const src = fs.readFileSync(path.join(ROOT, "assets/js/account.js"), "utf8");

// Витягуємо суцільні шматки файлу за початком і кінцем.
//
// Могли б завантажити account.js цілком, але він на верхньому рівні
// шукає елементи сторінки й вішає слухачі — довелось би підробляти
// півкабінету заради кількох чистих функцій.
function slice(from, to) {

    const start = src.indexOf(from);
    const end = src.indexOf(to, start);

    if (start < 0 || end < 0) throw new Error("не знайдено шматок: " + from.slice(0, 40));

    return src.slice(start, end + to.length);

}

const parts = [
    slice("function deliveryStatusLabel(order) {",
        'return order.status === "completed" ? "returned" : "cancelled";\n\n}'),
    slice("async function attachRefusals(orders) {",
        "list.forEach(order => { order.__refusals = byOrder.get(String(order.id)) || []; });\n\n}"),
    slice("const REFUSAL_DAYS = 14;", "daysPassed: days\n    };\n\n}"),
    slice("// Чому відмовитись не можна — словами для покупця.",
        "</button>${hint}`;\n\n}")
].join("\n\n");

// Підроблене сховище: у Node його немає, а слід заявок живе саме там.
function makeStorage() {

    const data = new Map();

    return {
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key),
        get size() { return data.size; }
    };

}

// Підроблений Supabase: запам'ятовує, про які замовлення питали, і
// віддає заздалегідь готову відповідь.
function makeClient(answer) {

    const asked = { ids: null };

    return {
        asked,
        from: () => ({
            select: () => ({
                in: (column, ids) => { asked.ids = ids; return Promise.resolve(answer); }
            })
        })
    };

}

function load(answer) {

    const storage = makeStorage();
    const client = makeClient(answer);

    const sandbox = {
        localStorage: storage,
        console: { warn() {}, error() {} },
        supabaseClient: client
    };

    sandbox.globalThis = sandbox;

    vm.createContext(sandbox);
    vm.runInContext(parts, sandbox);

    return { api: sandbox, storage, client };

}

const БЕЖЕВА = { title: "Сумка Marc Jacobs", color: "Бежевий", size: "ONESIZE", price: 10000, qty: 1 };
const ЧОРНА = { title: "Сумка Marc Jacobs", color: "Чорний", size: "ONESIZE", price: 10000, qty: 1 };

const КЛЮЧ_БЕЖЕВОЇ = "Сумка Marc Jacobs|Бежевий|ONESIZE";

// Те саме замовлення зі скріншота: дві однакові сумки різного кольору,
// доставлене сьогодні.
const order = () => ({
    id: 42,
    order_number: "8126866876",
    status: "completed",
    created_at: new Date().toISOString(),
    items: [{ ...БЕЖЕВА }, { ...ЧОРНА }]
});


async function main() {

    console.log("\n[1] Відмова читається без позначки на замовленні");
    {
        // Саме та поломка зі скріншота: рядок у order_refusals є,
        // orders.refusal_requested_at порожній.
        const { api, client } = load({ data: [{ order_id: 42, items: [БЕЖЕВА] }], error: null });

        const o = order();

        o.refusal_requested_at = null;

        await api.attachRefusals([o]);

        check("про замовлення без позначки теж запитали",
            Array.isArray(client.asked.ids) && client.asked.ids.includes(42),
            JSON.stringify(client.asked.ids));

        check("відмовлений товар позначено", api.isItemRefused(o, o.items[0]));

        check("сусідній товар лишається доступним", !api.isItemRefused(o, o.items[1]));

        check("замовлення не вважається відмовленим цілком", !api.isOrderFullyRefused(o));

        check("часткова відмова статус не міняє",
            api.displayOrderStatus(o) === "completed", api.displayOrderStatus(o));
    }

    console.log("\n[2] id замовлення рядком і числом — це той самий id");
    {
        // bigint приїжджає з PostgREST то числом, то рядком; Map такої
        // різниці не пробачає.
        const { api } = load({ data: [{ order_id: "42", items: [БЕЖЕВА] }], error: null });

        const o = order();

        await api.attachRefusals([o]);

        check("рядковий order_id зіставився з числовим id",
            api.isItemRefused(o, o.items[0]));
    }

    console.log("\n[3] Запит не вдався — не вдаємо, що відмов не було");
    {
        const { api } = load({ data: null, error: { message: "network" } });

        const зПозначкою = order();
        const безПозначки = order();

        зПозначкою.refusal_requested_at = new Date().toISOString();

        await api.attachRefusals([зПозначкою, безПозначки]);

        // Позначка каже, що заявка була; від чого саме — не дізнались.
        // Читаємо як відмову від усього: зайвий раз не дати
        // відмовитись дешевше, ніж надіслати магазину другу заявку про
        // те саме.
        check("замовлення з позначкою читається як повністю відмовлене",
            api.isOrderFullyRefused(зПозначкою));

        check("замовлення без позначки лишається вільним",
            !api.isItemRefused(безПозначки, безПозначки.items[0]));
    }

    console.log("\n[4] Слід у браузері, коли база заявку не прийняла");
    {
        const { api, storage } = load({ data: [], error: null });

        const o = order();

        await api.attachRefusals([o]);

        check("до заявки товар вільний", !api.isItemRefused(o, o.items[0]));

        api.rememberRefusal(o, [o.items[0]]);

        check("слід збережено", storage.size === 1);

        check("після сліду товар позначено", api.isItemRefused(o, o.items[0]));

        check("сусідній товар лишається доступним", !api.isItemRefused(o, o.items[1]));

        // Головне: слід переживає перечитування сторінки — саме те,
        // чого не робив підмінений підпис кнопки.
        const свіже = order();

        await api.attachRefusals([свіже]);

        check("після перечитування з бази слід не загубився",
            api.isItemRefused(свіже, свіже.items[0]));

        check("а від другого товару все ще можна відмовитись",
            !api.isItemRefused(свіже, свіже.items[1]));
    }

    console.log("\n[5] Слід не вічний");
    {
        const { api, storage } = load({ data: [], error: null });

        const o = order();

        const давно = new Date(Date.now() - 61 * 86400000).toISOString();

        storage.setItem("bb4u:refusals", JSON.stringify({
            "8126866876": { [КЛЮЧ_БЕЖЕВОЇ]: давно }
        }));

        await api.attachRefusals([o]);

        check("запис старший за 60 днів кнопку не блокує",
            !api.isItemRefused(o, o.items[0]));

        api.rememberRefusal(o, [o.items[1]]);

        const ledger = JSON.parse(storage.getItem("bb4u:refusals"));

        check("прострочений ключ прибрано зі сховища",
            !Object.keys(ledger["8126866876"] || {}).includes(КЛЮЧ_БЕЖЕВОЇ),
            storage.getItem("bb4u:refusals"));
    }

    console.log("\n[6] Строк відмови — 14 днів");
    {
        const { api } = load({ data: [], error: null });

        const свіже = order();

        свіже.created_at = new Date(Date.now() - 13 * 86400000).toISOString();

        check("на 13-й день відмовитись можна", api.refusalWindow(свіже).allowed);

        const пізно = order();

        пізно.created_at = new Date(Date.now() - 15 * 86400000).toISOString();

        check("на 15-й день — уже ні", !api.refusalWindow(пізно).allowed);

        // Строк рахується від ОТРИМАННЯ. Поки не доставлено — не почався.
        const вдорозі = order();

        вдорозі.status = "shipped";
        вдорозі.created_at = new Date(Date.now() - 40 * 86400000).toISOString();

        check("недоставлене замовлення строком не обмежене",
            api.refusalWindow(вдорозі).allowed && !api.refusalWindow(вдорозі).started);

        // Кнопку малює refusalMarkup, але надсилання перевіряє строк ще
        // раз: сторінка могла бути відкрита два тижні тому.
        const askAt = src.indexOf("RefusalDialog.ask(order, itemIndex, alreadyRefused)");
        const periodAt = src.indexOf("const period = refusalWindow(order);");

        check("строк перевіряється перед вікном, а не лише при малюванні",
            periodAt > 0 && periodAt < askAt, `period=${periodAt}, ask=${askAt}`);
    }

    console.log("\n[7] Скасоване замовлення відмови не приймає");
    {
        // ЩО БУЛО НЕ ТАК
        //
        // Під товарами СКАСОВАНОГО замовлення кнопка «Відмова»
        // лишалась активною. Причина — у тому, як рахується строк:
        // скасоване замовлення не доставляють, тож перевірка
        // «доставлено» вважала, що 14 днів ще не почались, і кнопка
        // висіла там назавжди.
        //
        // Для магазину це заявка, з якою нічого не зробиш: подзвонити,
        // з'ясувати, що замовлення скасували ще тиждень тому, і
        // закрити її ні з чим. Для покупця — обіцянка дії, якої немає.
        const { api } = load({ data: [], error: null });

        const скасоване = order();

        скасоване.status = "cancelled";

        const period = api.refusalWindow(скасоване);

        check("відмова не дозволена", period.allowed === false);
        check("причина названа", period.reason === "cancelled", period.reason);

        // Саме та комбінація зі скріншота: скасоване й недоставлене.
        скасоване.created_at = new Date(Date.now() - 40 * 86400000).toISOString();

        check("давність не робить відмову можливою",
            api.refusalWindow(скасоване).allowed === false);

        const markup = api.refusalMarkup(скасоване, 1);

        check("кнопки під товаром немає", !/<button/.test(markup), markup);

        // Пояснення, а не приховування: схована кнопка виглядає як
        // поломка сайту — покупець пам'ятає, що вона була.
        check("замість неї — пояснення, а не порожнє місце",
            /Замовлення скасовано/.test(markup), markup);
        check("пояснення оформлене як підпис", /order-item-refuse-void/.test(markup), markup);

        // Уже надіслана заявка нікуди не зникає: її справді надіслали,
        // і сказати інакше означало б збрехати.
        const зчастковою = order();

        зчастковою.status = "cancelled";
        зчастковою.__refusals = [{ items: [БЕЖЕВА] }];

        check("на відмовленому товарі лишається «Відмову надіслано»",
            /Відмову надіслано/.test(api.refusalMarkup(зчастковою, 0)),
            api.refusalMarkup(зчастковою, 0));
        check("а на решті — все одно не кнопка",
            !/<button/.test(api.refusalMarkup(зчастковою, 1)));

        // Не зламали звичайний випадок.
        const живе = order();

        check("у незакритому замовленні кнопка на місці",
            /<button/.test(api.refusalMarkup(живе, 0))
            && /↩ Відмова/.test(api.refusalMarkup(живе, 0)));

        // Дві причини відмови в доступі не мусять плутатись.
        const прострочене = order();

        прострочене.created_at = new Date(Date.now() - 40 * 86400000).toISOString();

        check("прострочене й далі каже саме про строк",
            /Строк відмови \(14 днів\) минув/.test(api.refusalMarkup(прострочене, 0)),
            api.refusalMarkup(прострочене, 0));

        // Кнопка — не єдиний шлях: замовлення міг скасувати менеджер
        // уже після того, як покупець відкрив кабінет. Тому перед
        // надсиланням стан читається з бази й перевіряється ще раз, а
        // текст причини в обох місцях один.
        check("текст причини — спільний для підпису й повідомлення",
            /function refusalBlockedText/.test(src)
            && /showToast\(refusalBlockedText\(period\)\)/.test(src));

        const selectAt = src.indexOf('.eq("order_number", orderNumber)');
        const periodAt = src.indexOf("const period = refusalWindow(order);");

        check("перевіряється замовлення з бази, а не зі сторінки",
            selectAt > 0 && periodAt > selectAt, `select=${selectAt}, period=${periodAt}`);

        const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");

        check("для пояснення є стиль", /\.order-item-refuse-void\{/.test(css));

        // Той самий рядок «Відмова: …» у деталях замовлення. Для
        // часткової відмови він обіцяв, що «решта замовлення
        // лишається», — і стояв прямо під бейджем «Скасовано»,
        // сперечаючись із ним у тій самій картці.
        const частковаЖива = order();

        частковаЖива.__refusals = [{ items: [БЕЖЕВА] }];

        check("у живому замовленні решта справді лишається",
            /решта замовлення лишається/.test(api.refusalNoteText(частковаЖива)),
            api.refusalNoteText(частковаЖива));

        const частковаСкасована = order();

        частковаСкасована.status = "cancelled";
        частковаСкасована.__refusals = [{ items: [БЕЖЕВА] }];

        check("у скасованому нічого не «лишається»",
            !/лишається/.test(api.refusalNoteText(частковаСкасована)),
            api.refusalNoteText(частковаСкасована));
        check("натомість — що заявку прийняли",
            /менеджер зв'яжеться/.test(api.refusalNoteText(частковаСкасована)),
            api.refusalNoteText(частковаСкасована));
    }

    console.log("\n[8] Повна відмова міняє статус");
    {
        const { api } = load({ data: [{ order_id: 42, items: [БЕЖЕВА, ЧОРНА] }], error: null });

        const o = order();

        await api.attachRefusals([o]);

        check("обидві позиції позначено",
            api.isItemRefused(o, o.items[0]) && api.isItemRefused(o, o.items[1]));

        check("замовлення відмовлене цілком", api.isOrderFullyRefused(o));

        // Скасувати можна те, що ще не виконали. Доставлене — повертають.
        check("доставлене стає «Повернення», а не «Скасовано»",
            api.displayOrderStatus(o) === "returned", api.displayOrderStatus(o));
    }

    console.log("\n[9] Саме вікно: відмовлену позицію не відмітити");
    {
        // Те, що на скріншоті: вікно відкрите з другого товару, а
        // перший — той, на який заявка вже пішла.
        const { JSDOM } = require("jsdom");

        const dom = new JSDOM("<body></body>", { runScripts: "outside-only" });

        dom.window.eval(fs.readFileSync(path.join(ROOT, "assets/js/refusal-dialog.js"), "utf8"));

        const doc = dom.window.document;

        const o = order();

        const обрано = dom.window.RefusalDialog.ask(o, 1, new Set([КЛЮЧ_БЕЖЕВОЇ]));

        const boxes = [...doc.querySelectorAll('.refusal-item input[type="checkbox"]')];

        check("обидві позиції лишились у списку", boxes.length === 2);

        check("відмовлену відмітити не можна", boxes[0].disabled === true);

        check("і вона не позначена наперед", boxes[0].checked === false);

        check("під нею пояснення, а не порожнє місце",
            /Заявку вже надіслано/.test(doc.querySelector(".refusal-item").textContent));

        check("товар, з якого відкрили вікно, доступний і відмічений",
            boxes[1].disabled === false && boxes[1].checked === true);

        // disabled знімається інструментами розробника за п'ять секунд,
        // тому вибір перевіряється ще раз уже після натискання.
        boxes[0].disabled = false;
        boxes[0].checked = true;
        boxes[1].checked = false;

        doc.querySelector("textarea").value = "не підійшов розмір, замалий";

        doc.querySelector('[data-refusal="send"]').click();

        check("сама лише відмовлена позиція нічого не надсилає",
            doc.querySelector(".refusal-overlay") !== null
            && doc.querySelector(".refusal-error").hidden === false);

        // А з нормальною позицією вікно закривається й віддає ТІЛЬКИ її.
        boxes[1].checked = true;

        doc.querySelector('[data-refusal="send"]').click();

        const choice = await обрано;

        check("надсилається лише та позиція, на яку заявки ще не було",
            choice && choice.items.length === 1 && choice.items[0].color === "Чорний",
            choice && JSON.stringify(choice.items.map(i => i.color)));
    }

    console.log("\n[10] База: сповіщення не має права скасувати заявку");
    {
        // Знайдено в бою на замовленні 8126866876: лист магазину
        // прийшов, у order_refusals — порожньо, refusal_requested_at
        // порожній, у Telegram тиша. Тобто INSERT відхилили, і покупець
        // міг відмовитись від того самого товару ще раз.
        //
        // Тригер виконується в одній транзакції зі вставкою: будь-яка
        // помилка всередині відкочує сам рядок. Збій СПОВІЩЕННЯ знищував
        // ЗАЯВКУ — цінніше приносилось у жертву дешевшому.
        const sql = fs.readFileSync(
            path.join(ROOT, "supabase/migrations/007-refusal-write-reliability.sql"), "utf8");

        const post = sql.indexOf("perform net.http_post");

        check("сповіщення надсилається", post > 0);

        const хвіст = sql.slice(post);

        check("збій сповіщення перехоплюється, а не валить транзакцію",
            /exception[\s\S]{0,200}when others/.test(хвіст));

        check("причина падіння йде в лог, а не в тишу",
            (sql.match(/raise warning/g) || []).length >= 2);

        check("позначка на замовленні теж не тягне заявку за собою",
            sql.slice(0, post).includes("exception"));

        check("рядок доживає до кінця тригера", /return new;/.test(хвіст));

        // pg_net не перевіряє адресу під час виклику — незамінений
        // плейсхолдер не дав би жодної помилки, запит просто тихо не
        // дійшов би. Найімовірніша поломка була б найнепомітнішою.
        check("незамінений плейсхолдер помічається сам",
            /hook_url like '%<PROJECT_REF>%'/.test(sql)
            && /hook_secret like '%<HOOK_SECRET>%'/.test(sql));

        // Друга можлива причина відмови INSERT — права. Перестворюємо
        // їх, щоб не з'ясовувати, яка саме спрацювала.
        check("політика на вставку перестворюється",
            /create policy "refusals_insert_own"[\s\S]{0,400}for insert/.test(sql));

        check("політика на читання перестворюється",
            /create policy "refusals_select_own"[\s\S]{0,300}for select/.test(sql));

        check("грант для authenticated виданий явно",
            /grant select, insert on public\.order_refusals to authenticated/.test(sql));

        check("оновлювати й видаляти заявки клієнту не дають",
            !/grant[^\n]*(update|delete)[^\n]*order_refusals/i.test(sql));

        check("тригер створюється, якщо його не було",
            /create trigger trg_notify_telegram_refusal/.test(sql));

        // Головна пастка цих файлів: вони замінюють функцію цілком, і
        // незамінений плейсхолдер затирає робочу адресу неробочою.
        check("у шапці 007 попередження про плейсхолдери",
            /ПЕРЕД ЗАПУСКОМ замініть <PROJECT_REF>/.test(sql.slice(0, 1200)));

        const шість = fs.readFileSync(
            path.join(ROOT, "supabase/migrations/006-refusal-items-and-status.sql"), "utf8");

        check("006 попереджає, що її заміщує 007",
            /міграція 007|міграцію 007/.test(шість.slice(0, 1200)));

        // Друга половина тієї ж пастки: <PROJECT_REF> замінили,
        // <HOOK_SECRET> — ні. Секрет лежить у змінних оточення Edge
        // Function, а звідти його вже не подивишся, тож 008 бере і
        // адресу, і секрет із тригера замовлень, який працює.
        const вісім = fs.readFileSync(
            path.join(ROOT, "supabase/migrations/008-refusal-hook-secret.sql"), "utf8");

        check("008 читає робочий тригер замовлень",
            /notify_telegram_new_order/.test(вісім)
            && /pg_get_functiondef/.test(вісім));

        check("008 бере і адресу, і секрет",
            /@@URL@@/.test(вісім) && /@@SECRET@@/.test(вісім)
            && /replace\(replace\(template, '@@URL@@', hook_url\), '@@SECRET@@', hook_secret\)/.test(вісім));

        // Секрет може містити апостроф — тоді в тілі функції він
        // записаний як ''. Забираємо його в тому ж екранованому
        // вигляді, інакше зібрана функція просто не скомпілюється.
        check("секрет копіюється екранованим",
            /\(\?:\[\^'\]\|''\)\*/.test(вісім));

        check("008 нічого не друкує — секрет не виходить за межі бази",
            !/raise (notice|warning|exception)[^\n]*\bhook_secret\b/.test(вісім));

        check("008 не мовчить, якщо копіювати нема звідки",
            (вісім.match(/raise exception/g) || []).length >= 3);

        // РЕГРЕСІЯ, на якій ми обпеклись: перевірка шукала будь-яку
        // кутову дужку. Робочий секрет її містив — і сповіщення
        // глушилось на правильному значенні, а в лог ішла порада
        // замінити те, що вже замінено.
        // Звіряємо з КОДОМ, а не з поясненнями: у коментарях стара
        // перевірка названа своїм іменем, і наївний пошук знаходив би
        // саме її.
        const безКоментарів = text => text.replace(/^\s*--[^\n]*$/gm, "");

        check("плейсхолдер шукається за токеном, а не за символом '<'",
            !/like '%<%'/.test(безКоментарів(sql))
            && !/like '%<%'/.test(безКоментарів(вісім)));

        // Тіло функції в 008 — шаблон у доларових лапках; переплутані
        // теги дали б синтаксичну помилку вже в SQL Editor.
        const tpl = вісім.split("$tpl$");

        check("шаблон функції закритий тим самим тегом", tpl.length === 3);

        check("внутрішні лапки тіла не конфліктують із зовнішніми",
            (tpl[1].match(/\$fn\$/g) || []).length === 2
            && !tpl[1].includes("$tpl$") && !tpl[1].includes("$do$"));

        check("мітки підставляються рівно по разу",
            (tpl[1].match(/@@URL@@/g) || []).length === 1
            && (tpl[1].match(/@@SECRET@@/g) || []).length === 1);

        // SQL Editor не показує notice, тож від міграції видно лише
        // «Success. No rows returned». Хай останнім кроком буде
        // таблиця: інакше єдиний доказ успіху — відсутність помилки.
        const живаПеревірка = text => text.split("\n").some(line =>
            !line.trim().startsWith("--") && /as\s+секрет_не_замінено/.test(line));

        check("007 закінчується видимою перевіркою", живаПеревірка(sql));

        check("008 закінчується видимою перевіркою", живаПеревірка(вісім));

        // Токен <HOOK_SECRET> тепер згадується в тілі функції ще й у
        // самій перевірці на плейсхолдер. Пошук простого підрядка не
        // відрізняв би підставлене значення від згадки про нього —
        // саме на цьому діагностика збрехала.
        check("перевірка секрету шукає токен у лапках, а не будь-яку згадку",
            /like '%''<HOOK_SECRET>''%'/.test(sql)
            && /like '%''<HOOK_SECRET>''%'/.test(вісім));
    }

    console.log("\n[11] Вибір фото говорить українською");
    {
        // Голий <input type="file"> малює браузер мовою свого
        // інтерфейсу: у Chrome з російською це «Выбрать файлы / Файл не
        // выбран» посеред українського вікна. З розмітки той текст не
        // міняється ніяк — його немає в документі.
        const { JSDOM } = require("jsdom");

        const dom = new JSDOM("<body></body>", { runScripts: "outside-only" });

        dom.window.eval(fs.readFileSync(path.join(ROOT, "assets/js/refusal-dialog.js"), "utf8"));

        const doc = dom.window.document;
        const D = dom.window.RefusalDialog;

        const обрано = D.ask(order(), 0, new Set());

        const pick = doc.querySelector(".refusal-file-pick");
        const input = doc.querySelector('.refusal-file-pick input[type="file"]');
        const state = doc.querySelector(".refusal-file-state");

        check("кнопку вибору малюємо самі", pick !== null && /Обрати фото/.test(pick.textContent));

        check("справжнє поле лишається всередині — інакше нічого не відкриється",
            input !== null);

        check("початковий підпис український", state.textContent === "Фото не вибрано");

        // Коду з файлу потрібні лише name і size, тож підставляємо їх
        // напряму: справжні File на вісім мегабайтів у тесті ні до чого.
        const підставити = files => {
            Object.defineProperty(input, "files", { value: files, configurable: true });
            input.dispatchEvent(new dom.window.Event("change"));
        };

        підставити([{ name: "IMG_2841.jpg", size: 307200 }]);

        check("один знімок названий на ім'я і в кілобайтах",
            state.textContent === "IMG_2841.jpg · 300 КБ", state.textContent);

        check("обране виділяється", state.classList.contains("is-chosen"));

        підставити([
            { name: "a.jpg", size: 1048576 },
            { name: "b.jpg", size: 1048576 },
            { name: "c.jpg", size: 1048576 }
        ]);

        check("кілька знімків рахуються з правильним відмінком",
            state.textContent === "3 знімки · 3,0 МБ", state.textContent);

        // Українською дробову частину відділяють комою.
        check("десятковий роздільник український", !/\d\.\d/.test(state.textContent));

        // Вісім мегабайтів перебирається трьома фото з телефона, і
        // раніше про це ставало відомо аж на «Надіслати».
        підставити([
            { name: "a.jpg", size: 5 * 1024 * 1024 },
            { name: "b.jpg", size: 5 * 1024 * 1024 }
        ]);

        check("перевищення ваги видно одразу",
            /більше за 8,0 МБ/.test(state.textContent) && state.classList.contains("is-over"),
            state.textContent);

        підставити(Array.from({ length: 6 }, (v, i) => ({ name: `${i}.jpg`, size: 1024 })));

        check("перевищення кількості видно одразу",
            /6 знімків/.test(state.textContent) && /більше за 5/.test(state.textContent),
            state.textContent);

        check("причина названа словами, а не самим лише кольором",
            /більше за/.test(state.textContent));

        // Поле мусить лишитись рухомим: лист із фото збирається з нього
        // ж, переставленого в приховану форму.
        підставити([{ name: "a.jpg", size: 1024 }]);

        doc.querySelector("textarea").value = "не підійшов розмір, замалий";
        doc.querySelector('[data-refusal="send"]').click();

        const choice = await обрано;

        check("поле з файлами віддається вузлом і вже поза вікном",
            choice.fileInput === input && input.isConnected === false);

        // Приховуємо, але не display:none — інакше поле випадає з
        // таблиці фокусування й обрати фото з клавіатури неможливо.
        const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");

        check("поле сховане, але лишається доступним",
            /\.refusal-file-pick input\[type="file"\]\{[^}]*clip-path:inset\(50%\)/.test(css)
            && !/\.refusal-file-pick input\[type="file"\]\{[^}]*display:none/.test(css));

        check("фокус з клавіатури видно на кнопці",
            /\.refusal-file-pick:has\(input:focus-visible\)\{[^}]*outline:/.test(css));

        check("кнопка вибору зроблена в мові сайту",
            /\.refusal-file-pick\{[^}]*border-radius:50px/.test(css));
    }

    console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);

    process.exit(failures === 0 ? 0 : 1);

}

main().catch(error => {

    console.log("  ✗ набір упав:", error && error.message);

    process.exit(1);

});
