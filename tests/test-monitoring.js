// Моніторинг: хто перший дізнається, що магазин зламався.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ПЕРЕВІРКА ПАДАЄ, А НЕ ПИШЕ В ЛОГ. Лист від GitHub про
//    провалений запуск — єдиний канал повідомлення. Крок, який
//    завершується успішно й лише друкує проблему, не повідомляє
//    нікого.
//
// 2. ПЕРЕВІРЯЄТЬСЯ НЕ ЛИШЕ «ЧИ ВІДКРИЄТЬСЯ». Сайт із дев-налаштуваннями
//    на проді працює бездоганно і при цьому зникає з пошуку. Порожній
//    каталог теж віддає 200.
//
// 3. ЖУРНАЛ ПОМИЛОК НЕ ЛАМАЄ СТОРІНКУ. Він для того й існує, щоб
//    ловити поломки, — тому сам не має права стати поломкою.
//
// 4. У ЖУРНАЛ НЕ ПОТРАПЛЯЄ ОСОБИСТЕ. Ні пошти, ні кошика, ні
//    пошукового запиту (він буває в параметрах адреси).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const monitor = read("scripts/monitor.js");
const digest = read("scripts/report-issues.js");
const workflow = read(".github/workflows/monitor.yml");
// еталон переліку кроків збірки: розділ [3] звіряє з ним обидва CI-workflow
const pkg = JSON.parse(read("package.json"));
const client = read("assets/js/error-report.js");
const sql = read("supabase/migrations/013-site-issues.sql");

console.log("\n[1] Перевірка доступності справді перевіряє");
{
    check("падає, коли щось не так", /process\.exit\(1\)/.test(monitor));

    // Найдорожчі поломки — ті, що не видно оком.
    check("ловить robots.txt, який закриває сайт від пошуку",
        /Disallow/.test(monitor));

    check("ловить noindex на проді", /noindex/.test(monitor));

    check("ловить чужий домен у sitemap",
        /усі адреси в sitemap/.test(monitor));

    check("ловить порожній каталог",
        /products\.json/.test(monitor) && /expected \/ 2|expected\/2/.test(monitor));

    check("перевіряє сторінку товару за розміткою, а не за кнопкою",
        /productSchema/.test(monitor) && !/addToCartBtn/.test(monitor));

    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ.
    //
    // Живий залишок навмисно перекриває наявність із каталогу — база
    // знає її в мить запиту. Уся конструкція трималась на тому, що
    // знімок у базі СВІЖІШИЙ за файл.
    //
    // На гілці dev це було не так: push-stock.js запускався лише в
    // build-products.yml, тож знімок лишався з попереднього
    // прод-випуску. Власник виставив 100 штук, каталог перезібрався —
    // і три товари все одно застигли в «під замовлення», бо база
    // казала «немає». Окремо обидва джерела виглядали правильно;
    // видно було тільки в зіставленні.
    check("зіставляє живий залишок із каталогом", /stock_live/.test(monitor));

    check("порівнює саму наявність, а не кількість",
        /row\.available !== true/.test(monitor));

    // Розходження саме по собі нормальне: відкрите замовлення на
    // останню сумку і є те, для чого живий залишок існує. Ненормально,
    // коли каталог обіцяє БАГАТО, а база каже «немає».
    check("є межа довіри, а не будь-яке розходження",
        /STOCK_TRUST_FROM/.test(monitor) && /qty < STOCK_TRUST_FROM/.test(monitor));

    check("у скарзі названо товар і колір",
        /у каталозі \$\{qty\}, база каже/.test(monitor));

    // Публічний ключ не дублюємо: два екземпляри розійдуться.
    check("ключ бази береться з коду сайту",
        /supabase-client\.js/.test(monitor)
        && !/sb_publishable_/.test(monitor));

    // Недоступна база не має виглядати як зламані залишки.
    check("недоступна база — окрема скарга",
        /stock_live не відповіла/.test(monitor));

    check("перевіряє, що 404 віддає саме 404",
        /=== 404/.test(monitor));

    // Одна невдала спроба нічого не доводить: хостинг іноді віддає
    // 5xx на кілька секунд під час викладки.
    check("повторює спробу перед тим, як бити на сполох",
        /attempt/.test(monitor) && /setTimeout/.test(monitor));

    check("середовище береться з site.config.json",
        /site\.config\.json/.test(monitor));
}

console.log("\n[2] Зведення помилок доходить до власника");
{
    check("падає, коли є нові помилки", /process\.exit\(1\)/.test(digest));

    check("позначає показане, щоб не повторюватись",
        /notified: true/.test(digest) && /notified=eq\.false/.test(digest));

    // Без секрета крок мовчить і не червонить розклад — рівно так само
    // поводиться знімок залишків.
    check("без ключа просто нічого не робить",
        /Немає SUPABASE_SERVICE_ROLE_KEY/.test(digest));

    check("без міграції теж не падає", /404/.test(digest) && /site_issues/.test(digest));
}

console.log("\n[3] Розклад");
{
    // Знімок залишків у базі мусить оновлюватись в ОБОХ збірках.
    // Саме його відсутність у dev і зламала показ наявності: живий
    // залишок перекривав свіжий каталог старими нулями.
    ["build-products.yml", "build-dev.yml"].forEach(file => {

        const build = fs.readFileSync(path.join(ROOT, ".github/workflows", file), "utf8");

        check(`${file}: оновлює знімок залишків`, /push-stock\.js/.test(build));
        check(`${file}: оновлює знімок цін`, /push-prices\.js/.test(build));

        // Недоступна база не має робити виливку сайту червоною —
        // знімок це запобіжник, а не частина випуску.
        check(`${file}: збій знімка не ламає збірку`,
            /continue-on-error: true/.test(build));

        // ЗБІРКА В CI НЕ МАЄ РОЗХОДИТИСЬ ІЗ `npm run build`
        //
        // У build-products.yml був виписаний перелік окремих
        // `node scripts/…`, і він відстав від package.json на шість
        // кроків: build-brands.js, build-taxonomy-pages.js,
        // build-legal.js, build-feed.js, build-llms.js і
        // apply-cache-version.js.
        //
        // Найдорожчі з них — саме ті, що не видно оком.
        // build-products.js читає кириличні написання брендів із
        // data/brands.json, а той збирає build-brands.js: без нього
        // пошук по «Рей Бен» на проді не знаходив нічого, хоч на dev
        // працював. А apply-cache-version.js проставляє ?v= — без
        // нього браузер віддає з кеша старі скрипти й дані за
        // незмінною адресою, тобто правка мовчки не доїжджає.
        //
        // Рятував це Sync branches своїм повним `npm run build` —
        // тобто поломка була, але помітити її було майже неможливо.
        const chain = [...pkg.scripts.build.matchAll(/scripts\/([\w-]+)\.js/g)]
            .map(m => m[1]);

        // перелік кроків прийнятний, якщо покриває всі скрипти збірки;
        // один `npm run build` покриває їх за визначенням
        const full = /run: npm run build\s*$/m.test(build);
        const missing = chain.filter(name => !build.includes(`scripts/${name}.js`));

        check(`${file}: збірка не розходиться з npm run build`,
            full || missing.length === 0,
            missing.length ? "бракує: " + missing.join(", ") : undefined);

        // Перезібраний файл, який не потрапив у `git add`, не
        // виїжджає на сайт. Так llms.txt їхав на прод лише з
        // `git add -A` у Sync branches, хоч build-llms.js переписує
        // його кожної збірки.
        //
        // assets/js/common.js тут не випадково: у ньому лежить
        // SITE_URL, з якого сторінки будують canonical і og:url, і
        // проставляє його apply-site-env.js. Перелік покривав лише
        // assets/images, тож виправлення адреси нікуди б не поїхало.
        ["sitemap.xml", "feed.xml", "llms.txt", "assets/js/common.js"].forEach(out => {
            check(`${file}: комітить ${out}`, build.includes(out));
        });

    });

    // ПОРЯДОК КРОКІВ У `npm run build`
    //
    // Поки кроки були виписані в build-products.yml, порядок тримали
    // коментарі біля кожного («ОБОВ'ЯЗКОВО після build-products.js»
    // тощо). Тепер перелік — один рядок у package.json, коментаря
    // туди не вставити, тож умови закріплені тут.
    //
    // Кожна з них — про мовчазну поломку: переставлені кроки не
    // ламають збірку, вона просто збирає з ЩЕ НЕ ОНОВЛЕНИХ даних.
    const order = [...pkg.scripts.build.matchAll(/scripts\/([\w-]+)\.js/g)].map(m => m[1]);
    const before = (a, b) => order.indexOf(a) >= 0
        && order.indexOf(a) < order.indexOf(b);

    // кириличні написання брендів для пошуку build-products.js читає
    // з data/brands.json — його збирає build-brands.js
    check("бренди збираються до товарів", before("build-brands", "build-products"));

    // рейтинг із відгуків build-products.js кладе в дані, а звідти
    // він потрапляє в aggregateRating на сторінці товару
    check("відгуки зводяться до товарів", before("pull-reviews", "build-products"));

    // генератори читають уже зібраний data/products.json
    ["build-product-pages", "build-taxonomy-pages", "build-home-static", "build-sitemap"]
        .forEach(step => {
            check(`${step} іде після товарів`, before("build-products", step));
        });

    // ?v= проставляється ОСТАННІМ: відбиток беруть із готових файлів,
    // тож будь-який крок після нього лишає штампи від попередньої збірки
    check("штампи ?v= проставляються останніми",
        order[order.length - 1] === "apply-cache-version");

    check("є розклад доступності", /cron: "\*\/30 \* \* \* \*"/.test(workflow));

    check("є добове зведення помилок", /cron: "0 9 \* \* \*"/.test(workflow));

    // Дві роботи в одному workflow з двома розкладами: без розділення
    // зведення помилок приходило б щопівгодини.
    check("кожна робота бере свій розклад",
        (workflow.match(/github\.event\.schedule ==/g) || []).length === 2);

    check("сказано, що розклад працює лише з main",
        /ЛИШЕ ПІСЛЯ ПЕРЕНЕСЕННЯ В MAIN/.test(workflow));

    check("можна запустити руками", /workflow_dispatch/.test(workflow));

    check("ключ передається лише туди, де потрібен",
        /SUPABASE_SERVICE_ROLE_KEY/.test(workflow));
}

console.log("\n[4] Журнал помилок безпечний для сторінки");
{
    check("модуль підключено на сторінках",
        fs.readdirSync(ROOT).filter(f => f.endsWith(".html"))
            .every(f => read(f).includes("assets/js/error-report.js")));

    // Обробник має стояти ПЕРЕД рештою скриптів, інакше не побачить
    // їхніх падінь.
    const html = read("catalog.html");

    check("підключений раніше за решту скриптів",
        html.indexOf("error-report.js") < html.indexOf("assets/js/common.js"));

    check("сторінка не чекає на відповідь бази",
        !/await /.test(client));

    check("виклик обгорнутий", /try \{/.test(client) && /catch \(error\)/.test(client));

    check("клієнт бази читається через typeof",
        /typeof supabaseClient !== "undefined"/.test(client));

    check("більше трьох повідомлень зі сторінки не йде",
        /PER_PAGE = 3/.test(client));

    check("однакові повідомлення не дублюються", /seen\[key\]/.test(client));

    // «Script error.» від чужого скрипта не несе жодної інформації.
    check("порожні помилки чужих скриптів відкидаються", /isOpaque/.test(client));

    // А от зниклий файл коду — це саме те, заради чого все робиться.
    check("зниклий скрипт або стиль записується",
        /Не завантажився файл/.test(client));
}

console.log("\n[5] У журнал не потрапляє особисте");
{
    check("адреса без параметрів запиту",
        /location\.pathname/.test(client) && !/location\.search/.test(client),
        "у ?search= буває пошуковий запит");

    check("нічого з кошика чи форм",
        !/localStorage/.test(client) && !/getCart|email|phone/.test(client));

    check("у політиці конфіденційності це описано",
        /Звіти про помилки/.test(read("privacy-policy.html")));
}

console.log("\n[6] Таблиця журналу закрита від чужих");
{
    check("міграція є", sql.length > 0);

    check("RLS увімкнено", /enable row level security/.test(sql));

    // Політик немає навмисно: читати й писати таблицю напряму з
    // браузера не можна взагалі, лише через функцію.
    check("прямих політик немає", !/create policy/.test(sql));

    check("функція з правами власника", /security definer/.test(sql));

    check("search_path закріплений", /set search_path = public/.test(sql));

    check("сторонні різновиди не приймаються",
        /not in \('js_error', 'not_found'\)/.test(sql));

    check("тексти обрізаються в базі", /left\(coalesce\(p_message/.test(sql));

    check("однакове йде в лічильник", /hits\s*=\s*hits \+ 1/.test(sql));

    check("є стеля нових записів за годину",
        /v_recent >= 200/.test(sql) && /interval '1 hour'/.test(sql));

    check("помилка запису не валить замовлення",
        /exception when others/.test(sql));

    check("викликати може відвідувач",
        /grant execute on function public\.report_issue/.test(sql));

    // Назви параметрів у базі й у клієнті мусять збігатися: інакше
    // виклик мовчки не спрацює.
    ["p_kind", "p_page", "p_message", "p_source", "p_agent"].forEach(param => {
        check(`параметр ${param} є з обох боків`,
            new RegExp(`${param}\\s`).test(sql) && client.includes(param + ":"));
    });
}

console.log("\n[7] Власник дізнається, що товар закінчився");
{
    const migration = read("supabase/migrations/018-issue-kinds.sql");
    const script = read("scripts/report-stock.js");
    const applier = read("scripts/apply-order-stock.js");

    // ЩО ЦЕ ЗАКРІПЛЮЄ. Залишки списуються самі, і коли замовлення
    // забирає останню одиницю, товар стає «під замовлення». Власник
    // про це не дізнавався ніяк — тільки якщо сам відкрив адмінку.
    check("журнал приймає різновид stock_out",
        /'js_error', 'not_found', 'meta_capi', 'stock_out'/.test(migration));

    // МОЯ ПОМИЛКА, яку ця ж міграція виправляє: функція мовчки
    // відкидала meta_capi, тобто запобіжник проти тихого збою
    // серверних конверсій сам працював тихо.
    check("і meta_capi, який досі відкидався",
        /'meta_capi'/.test(migration)
        && /meta_capi/.test(read("supabase/functions/telegram-order-bot/index.ts")));

    // Перевірку не знято: функцію може кликати будь-який відвідувач.
    check("чужі різновиди й далі не приймаються", /if v_kind not in \(/.test(migration));

    // Подію ловить те місце, яке нуль і поставило.
    check("списання запам'ятовує, що вийшло в нуль",
        /if \(before > 0 && after === 0\)/.test(applier));

    check("і віддає список назовні", /return \{ touched, notes, emptied \};/.test(applier));

    check("список пишеться у файл", /alerts-out/.test(applier));

    // Кожне «закінчився» мусить дійти окремо. Журнал склеює однакові
    // події за відбитком і про повтор не пише — тому в тексті номер
    // замовлення.
    check("у тексті є номер замовлення", /замовлення \$\{cell\.order\}/.test(script));

    const report = require("../scripts/report-stock.js");

    const line = report.message({
        title: "Сумка Coach Tabby", color: "Чорний", size: "ONESIZE", order: "4821507392"
    });

    check("текст читається",
        /Сумка Coach Tabby/.test(line) && /Чорний/.test(line)
        && /закінчився/.test(line) && /4821507392/.test(line), line);

    // ONESIZE — внутрішня заглушка, покупець її ніде не бачить, і в
    // листі власнику вона читалась би як помилка в даних.
    check("ONESIZE у текст не потрапляє", !/ONESIZE/.test(line));

    check("справжній розмір потрапляє",
        /38/.test(report.message({ title: "Кросівки", color: "Білий", size: "38" })));

    // Сповіщення не має пофарбувати червоним саме списання.
    check("крок не падає, коли є про що сказати", !/process\.exit\(1\)/.test(script));

    const workflow = read(".github/workflows/apply-stock.yml");

    check("крок є у workflow списання", /report-stock\.js/.test(workflow));

    check("і стоїть після позначки замовлень",
        workflow.indexOf("report-stock.js") > workflow.indexOf("--mark"));

    check("він не валить workflow",
        /Повідомити, що закінчилось[\s\S]{0,300}continue-on-error: true/.test(workflow));

    // Лист надсилає щоденне зведення — те саме, що для помилок.
    check("лист іде зі щоденним зведенням", /зведення/.test(script));

    // Секрети не потрібні: журнал наповнює навіть публічний ключ.
    check("секретів не потрібно",
        !/SERVICE_ROLE/.test(script) && /SUPABASE_PUBLISHABLE_KEY/.test(script));
}

console.log("\n[8] Биті посилання видно");
{
    const notFound = read("assets/js/not-found.js");

    check("сторінка 404 повідомляє про себе",
        /ErrorReport\.report\("not_found"/.test(notFound));

    check("разом із тим, звідки прийшли", /referrer/.test(notFound));

    check("документація є", fs.existsSync(path.join(ROOT, "docs/МОНІТОРИНГ.md")));
}

console.log(failures === 0
    ? "\n✅ Моніторинг: про поломку дізнається власник, а не покупець\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
