// Що сайт малює ПОВЕРХ банера акції — і чи можна це прибрати.
//
// НАВІЩО ЦЕ ЗРОБЛЕНО
// -------------------
// Банер часто малюють уже з текстом: назва акції, ціна, товар. А
// сайт зверху клав свій заголовок, свій опис, таймер і кнопку — і
// чужий напис лягав на намальований. Плюс темна заливка на 55%,
// потрібна лише для читабельності білого тексту, приглушувала фото,
// яке для того й завантажували, щоб його було видно.
//
// ЩО ТУТ ЗАКРІПЛЕНО
// ------------------
// 1. КОЖЕН ЕЛЕМЕНТ НАКЛАДКИ ПРИБИРАЄТЬСЯ. Заголовок, опис і кнопка —
//    порожнім полем, таймер — перемикачем. Без «майже»: якщо хоч
//    один лишиться, сенс зникає — він однаково закриє картинку.
//
// 2. НАКЛАДКУ МОЖНА ПОСУНУТИ. Дев'ять позицій — вільний кут є майже
//    на будь-якому фото.
//
// 3. ПОРОЖНІ ПОЛЯ НЕ ЛАМАЮТЬ SEO. Напис на банері прибрати можна,
//    вкладку браузера й рядок у видачі Google — ні.
//
// 4. ТАЙМЕР ЦОКАЄ РІВНО ТАК ЧАСТО, ЯК МІНЯЄТЬСЯ. Між годиною й добою
//    він показував секунди, а оновлювався раз на хвилину — виглядало
//    як зламаний годинник, і власник саме так це й прочитав.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const { loadYaml } = require("./helpers/yaml");

const config = loadYaml("admin/config.yml");
const promoFields = config.collections.find(c => c.name === "promotions").fields;
const field = name => promoFields.find(f => f.name === name);

const common = read("assets/js/common.js");
const promoJs = read("assets/js/promo.js");
const appJs = read("assets/js/app.js");
const css = read("assets/css/style.css");
const build = read("scripts/build-promotions.js");


console.log("\n[1] Накладку на банері можна прибрати повністю");
{
    // Кнопка без напису — не кнопка. Окремого перемикача навмисно
    // немає: два способи прибрати те саме рано чи пізно розійдуться.
    ["title", "text", "buttonText", "link", "image"].forEach(name =>
        check(`«${field(name).label}» не обовʼязкове`, field(name).required === false,
            String(field(name).required)));

    check("таймер має власний перемикач",
        field("hideCountdown") && field("hideCountdown").widget === "boolean");

    // ПЕРЕМИКАЧ САМЕ «ПРИХОВАТИ», А НЕ «ПОКАЗУВАТИ».
    //
    // Decap малює булеве поле вимкненим, коли його в записі немає, — а
    // немає його в усіх акціях, створених до появи перемикача.
    // «Показувати таймер» у вимкненому стані читалось би як «таймера
    // немає», хоча він показується: власник бачив би одне, покупець
    // інше. Заміряно в живій адмінці на локальному backend.
    check("вимкнений стан перемикача = таймер на місці",
        field("hideCountdown").default === false);

    // ЯВНИЙ true, а не «немає поля»: інакше всі вже опубліковані акції
    // разом втратили б відлік.
    check("приховання таймера — саме true, а не порожнє поле",
        /hideCountdown === true/.test(promoJs) && /hideCountdown === true/.test(appJs));

    check("збірка переносить прихований таймер",
        /data\.hideCountdown === true \? \{ hideCountdown: true \}/.test(build));

    check("порожній заголовок ховає h1", /titleEl\.hidden = !hasTitle/.test(promoJs));

    check("порожній текст кнопки ховає кнопку", /linkEl\.hidden = !hasButton/.test(promoJs));

    // Заливка існує рівно заради читабельності білого тексту. Немає
    // тексту — немає причини приглушувати фото.
    check("без напису зникає й темна заливка",
        /hasOverlay\s*\?[\s\S]{0,120}linear-gradient[\s\S]{0,80}:\s*""/.test(promoJs));

    check("порожній банер тримає висоту сам",
        /promo-hero-bare/.test(promoJs) && /\.promo-hero-banner\.promo-hero-bare/.test(css)
        && /aspect-ratio/.test(css.slice(css.indexOf(".promo-hero-banner.promo-hero-bare"))));
}


console.log("\n[2] Накладку можна посунути");
{
    const options = field("bannerLayout").options.map(o => o.value);

    const places = options.filter(v => v !== "hidden");

    check("девʼять позицій в адмінці", places.length === 9, places.length);

    // «Лише картинка» — не позиція, а окремий режим: банер лишається
    // самим фото, а заголовок з описом далі працюють на головній.
    check("плюс режим «нічого не писати»", options.includes("hidden"));

    // Перелік живе в трьох місцях — адмінка, збірка, CSS. Розійдуться
    // — і вибір в адмінці мовчки нічого не змінить на сайті.
    const inBuild = (build.match(/"(left|center|right)-(top|middle|bottom)"|"hidden"/g) || [])
        .map(v => v.replace(/"/g, ""));

    check("збірка знає рівно ті самі",
        options.every(v => inBuild.includes(v)) && inBuild.length === options.length,
        inBuild.join(", "));

    // Режим «лише картинка» мусить гасити ВСЮ накладку разом, а не
    // покладатись на порожні поля: заголовок і опис лишаються
    // заповненими заради головної.
    check("«лише картинка» гасить накладку одним прапорцем",
        /const bare = promo\.bannerLayout === "hidden"/.test(promoJs)
        && /!bare && Boolean\(promo\.title\)/.test(promoJs));

    const axes = ["-top", "-middle", "-bottom", "left-", "center-", "right-"];

    check("CSS описує всі шість напрямків",
        axes.every(a => css.includes(`[data-layout${a.startsWith("-") ? "$" : "^"}="${a}"]`)),
        axes.filter(a => !css.includes(`[data-layout${a.startsWith("-") ? "$" : "^"}="${a}"]`)).join(", "));

    check("сторінка ставить позицію на банер",
        /banner\.dataset\.layout = promo\.bannerLayout \|\| "left-middle"/.test(promoJs));

    // Порожнє поле — «як було»: саме так малювались усі акції до
    // появи вибору.
    check("порожнє поле не міняє вигляду старих акцій",
        options.includes("left-middle") && field("bannerLayout").default === "left-middle");
}


console.log("\n[2a] Напис на головній і напис на банері — різні");
{
    // ДВА МІСЦЯ — ДВІ ЗАДАЧІ. На банері сторінки акції текст часто вже
    // намальований на фото, і писати його зверху вдруге нема сенсу. А
    // в блоці «Ціна дня» на головній свого фото немає зовсім — текст
    // там єдине, що пояснює акцію.
    //
    // Поки поле було одне, вибору не існувало: чистиш банер — гасне
    // головна.
    check("є окремі поля для головної",
        field("homeTitle") && field("homeText")
        && field("homeTitle").required === false);

    check("збірка їх переносить",
        /homeTitle: String\(data\.homeTitle\)\.trim\(\)/.test(build)
        && /homeText: String\(data\.homeText\)\.trim\(\)/.test(build));

    // Порожнє поле — «як було»: уже опубліковані акції нічого не
    // помічають.
    const home = new Function("promo",
        appJs.match(/function promoHomeTitle[\s\S]*?\n}\n/)[0]
        + appJs.match(/function promoHomeText[\s\S]*?\n}\n/)[0]
        + "\nreturn [promoHomeTitle(promo), promoHomeText(promo)];");

    check("порожньо — береться загальний напис",
        home({ title: "SALE", text: "опис" }).join("|") === "SALE|опис");

    check("заповнено — береться свій",
        home({ title: "SALE", text: "опис", homeTitle: "Ціна тижня", homeText: "одна сумка" })
            .join("|") === "Ціна тижня|одна сумка");

    check("можна замінити лише заголовок",
        home({ title: "SALE", text: "опис", homeTitle: "Ціна тижня" }).join("|") === "Ціна тижня|опис");

    // ГОЛОВНИЙ ВИПАДОК, заради якого це й зроблено: на банері нічого,
    // на головній — текст.
    check("банер порожній, а головна говорить",
        home({ homeTitle: "Ціна тижня", homeText: "одна сумка" }).join("|") === "Ціна тижня|одна сумка");

    // УСІ П'ЯТЬ БЛОКІВ ГОЛОВНОЇ БЕРУТЬ НАПИС ЗВІДТИ Ж.
    //
    // Картка в сітці, слайдер, великий банер із товарами, компактний
    // тизер і «Ціна дня». Якби хоч один читав promo.title напряму,
    // окремий напис діяв би через раз — а помітити це можна лише
    // відкривши головну й порівнявши блоки очима.
    //
    // Рахуємо не рядки розмітки, а звертання: форми в них різні
    // (h2, h3, aria-label, const heading), і перелічувати кожну
    // означало б ловити саме те, що вже виправлено.
    // Дивимось тільки НИЖЧЕ помічників: саме там усі малювальники
    // акцій. Вище лежить renderPromoBanner — окремий блок головної з
    // data/home.json, у якого своя змінна promo й до акцій він не має
    // стосунку.
    const bodies = appJs.slice(appJs.indexOf("function promoHomeTitle"));

    const direct = (bodies
        .replace(/\/\/[^\n]*/g, "")
        .replace(/function promoHomeTitle[\s\S]*?\n}\n/, "")
        .replace(/function promoHomeText[\s\S]*?\n}\n/, "")
        .match(/promo\.(title|text)\b/g) || []);

    check("жоден блок головної не читає promo.title напряму",
        direct.length === 0, direct.join(", "));

    check("напис беруть усі пʼять блоків",
        (bodies.match(/promoHomeTitle\(promo\)/g) || []).length >= 5,
        (bodies.match(/promoHomeTitle\(promo\)/g) || []).length);
}


console.log("\n[2b] Бейдж — окремо для кожного місця");
{
    const places = field("badgePlaces").options.map(o => o.value);

    check("чотири варіанти", places.join("/") === "both/home/promo/none", places.join("/"));

    check("збірка знає ті самі",
        /const BADGE_PLACES = \["both", "home", "promo", "none"\]/.test(build));

    // Порожнє поле — «і там, і там»: саме так поводились усі акції до
    // появи вибору.
    const here = new Function("promo", "place",
        appJs.match(/function promoBadgeHere[\s\S]*?\n}\n/)[0]
        + "\nreturn promoBadgeHere(promo, place);");

    check("порожньо — показуємо скрізь",
        here({}, "home") === true && here({}, "promo") === true);

    check("тільки на головній",
        here({ badgePlaces: "home" }, "home") === true
        && here({ badgePlaces: "home" }, "promo") === false);

    check("тільки на сторінці акції",
        here({ badgePlaces: "promo" }, "promo") === true
        && here({ badgePlaces: "promo" }, "home") === false);

    check("ніде",
        here({ badgePlaces: "none" }, "home") === false
        && here({ badgePlaces: "none" }, "promo") === false);

    // Три банери головної й банер акції мусять питати однаково —
    // інакше вибір діяв би на одному й мовчки не діяв на іншому.
    check("усі блоки головної питають правило",
        (appJs.match(/promoBadgeHere\(promo, "home"\)/g) || []).length >= 3,
        (appJs.match(/promoBadgeHere\(promo, "home"\)/g) || []).length);

    // Перевіряємо, що правило ВЖИТЕ, а не просто оголошене. Перша
    // версія цієї перевірки шукала слово badgeHere будь-де у файлі — і
    // мовчала, коли його прибрали саме з рішення про бейдж, лишивши
    // оголошення вище.
    check("сторінка акції теж",
        /badgePlaces \|\| "both"/.test(promoJs)
        && /const hasBadge = !bare && badgeHere &&/.test(promoJs));
}


console.log("\n[2c] Кольори — у двох місцях і для всього, що заливається");
{
    const styleFields = field("style").fields.map(f => f.name);
    const homeFields = field("homeStyle").fields.map(f => f.name);

    // Бейдж і таймер за замовчуванням червоні: вони мають кричати. Але
    // на пастельному банері червона пляма — єдине, що видно.
    ["badgeBg", "badgeText", "timerBg", "timerText"].forEach(name =>
        check(`колір «${name}» можна задати`, styleFields.includes(name)));

    check("для головної є свій набір кольорів",
        ["textColor", "badgeBg", "timerBg", "buttonBg"].every(n => homeFields.includes(n)),
        homeFields.join(", "));

    // Гарнітура й геометрія — спільні: різними в двох місцях мають
    // бути кольори, а не шрифт.
    check("шрифт і розмір у наборі для головної не дублюються",
        !homeFields.includes("font") && !homeFields.includes("titleSize"));

    const textStyles = read("assets/js/text-styles.js");

    check("модуль віддає змінні бейджа й таймера",
        ["--blk-badge-bg", "--blk-badge-text", "--blk-timer-bg", "--blk-timer-text"]
            .every(v => textStyles.includes(v)));

    check("CSS їх читає",
        ["--blk-badge-bg", "--blk-timer-bg", "--blk-timer-text"].every(v => css.includes(v)));

    // Червоний стан «іде» теж мусить підкорятись вибору: інакше колір
    // діяв би лише до початку акції й зникав саме тоді, коли на банер
    // дивляться.
    check("таймер акції, що йде, теж фарбується",
        /\.promo-countdown\[data-state="live"\]\{\s*background:var\(--blk-timer-bg/.test(css));

    // Злиття: що задано для головної, те й діє; решта — зі спільного.
    const merge = new Function("base", "over",
        textStyles.match(/function mergeStyles[\s\S]*?\n    }\n/)[0]
        + "\nfunction toPlain(v){ return v || {}; }\nreturn mergeStyles(base, over);");

    check("свій колір головної перекриває спільний",
        merge({ badgeBg: "#f00" }, { badgeBg: "#0f0" }).badgeBg === "#0f0");

    check("порожнє поле не скидає спільний",
        merge({ badgeBg: "#f00" }, { badgeBg: "" }).badgeBg === "#f00");

    check("блоки головної беруть злитий набір",
        /blockStyleAttr\(promoHomeStyle\(promo\)\)/.test(appJs)
        && !/blockStyleAttr\(promo\.style\)/.test(appJs));

    // Сторінка акції оформлення не читала ВЗАГАЛІ: обраний в адмінці
    // колір діяв на головній і мовчки не діяв на банері.
    check("банер акції нарешті читає оформлення",
        /TextStyles\.styleVars\(promo\.style\)/.test(promoJs)
        && /classList\.toggle\("has-style"/.test(promoJs));
}


console.log("\n[2d] Товари в блоці «Ціна дня» можна вирівняти");
{
    check("три варіанти в адмінці",
        field("dealAlign").options.map(o => o.value).join("/") === "left/center/right");

    check("збірка переносить", /const DEAL_ALIGNS = \["left", "center", "right"\]/.test(build));

    // Ознака приходить із РОЗВʼЯЗАНОЇ розкладки, а не просто з поля:
    // поруч із банером «по центру» неможливе, і сайт мусить малювати
    // те, що справді вийшло, а не те, що обрали.
    check("ряд отримує ознаку", /data-align="\$\{place\.products\}"/.test(appJs));

    // auto-FIT, а не auto-fill: fill лишає порожні колонки на всю
    // ширину, і тоді вирівнювати нічого — один товар однаково
    // притиснутий ліворуч.
    const row = css.slice(css.indexOf(".deal-products{"), css.indexOf(".deal-more"));

    check("порожні колонки згортаються", /auto-fit/.test(row), row.match(/auto-f\w+/));

    check("колонка має верхню межу",
        /minmax\(240px, 300px\)/.test(row));

    check("обидва напрямки описані",
        /\[data-align="center"\]\{ justify-content:center/.test(css)
        && /\[data-align="right"\]\{ justify-content:end/.test(css));
}


console.log("\n[2h] Розкладка блока: одне правило на трьох");
{
    const Layout = require("../assets/js/deal-layout.js");

    // ОДИН МОДУЛЬ НА САЙТ, ЗБІРКУ Й АДМІНКУ.
    //
    // Три копії розійшлися б, і прев'ю обіцяло б одне, а сайт малював
    // інше. Той самий підхід, що в image-framing.js і text-styles.js.
    check("сайт бере розкладку з модуля", /window\.DealLayout\s*\n?\s*\? window\.DealLayout\.resolve\(promo\)/.test(appJs));

    check("прев'ю бере звідти ж", /window\.DealLayout\.resolve\(\{/.test(read("admin/preview-templates.js")));

    check("збірка теж", /DealLayout = require\("\.\.\/assets\/js\/deal-layout\.js"\)/.test(build));

    check("модуль підключено і на сайті, і в адмінці",
        /deal-layout\.js/.test(read("index.html"))
        && /deal-layout\.js/.test(read("admin/index.html")));

    // ── Правила ──
    const at = p => {
        const r = Layout.resolve(p);
        return `${r.banner}/${r.products}/${r.text}/${r.timer}`;
    };

    check("порожня акція — як було", at({}) === "none/left/left/right");

    // Банер займає половину блока: «по центру» поруч із ним не існує.
    check("банер ліворуч — товари праворуч",
        at({ dealBanner: "left", dealAlign: "center" }) === "left/right/left/right");

    check("банер праворуч — товари ліворуч",
        at({ dealBanner: "right", dealAlign: "right" }) === "right/left/left/right");

    check("без банера центр працює",
        at({ dealAlign: "center" }) === "none/center/left/right");

    // Напис і таймер стоять в одному рядку.
    check("напис і таймер не стають на один бік",
        at({ dealTextAlign: "right", dealTimer: "right" }) === "none/left/right/left");

    check("напис по центру таймеру не заважає",
        at({ dealTextAlign: "center", dealTimer: "right" }) === "none/left/center/right");

    // ── Про суперечність кажуть вголос ──
    const conflicts = p => Layout.resolve(p).conflicts;

    check("суперечність описана словами",
        conflicts({ dealBanner: "left", dealAlign: "center" }).length === 1
        && /банер ліворуч/.test(conflicts({ dealBanner: "left", dealAlign: "center" })[0]));

    check("несуперечлива розкладка мовчить",
        conflicts({ dealBanner: "left", dealAlign: "right" }).length === 0);

    // Decap не вміє перевіряти поля одне проти одного, тож єдиний
    // спосіб попередити вчасно — сказати це в прев'ю й у журналі.
    check("збірка попереджає в журналі",
        /::warning::розкладка/.test(build));

    check("прев'ю показує суперечність",
        /cms-preview-home-warn/.test(read("admin/preview-templates.js"))
        && /cms-preview-home-warn/.test(read("admin/preview-styles.css")));

    // Кнопка на головній — своя: на банері акції її часто прибирають,
    // а тут вона єдиний вхід в акцію.
    check("є окрема кнопка для головної",
        field("homeButtonText") && field("homeButtonText").required === false);

    check("вона падає на загальну, коли порожня",
        /promo\.homeButtonText \|\| promo\.buttonText/.test(appJs));

    check("збірка її переносить", /homeButtonText: String\(data\.homeButtonText\)\.trim\(\)/.test(build));

    // Банер у блоці бере те саме фото, що прев'ю на головній.
    check("банер у блоці показує фото акції",
        /const bannerImage = promo\.image \|\| promo\.imageMobile/.test(appJs));

    check("без фото банера немає",
        /place\.banner !== "none" && Boolean\(bannerImage\)/.test(appJs));

    check("CSS ділить блок на дві половини",
        /\.deal-body\[data-banner="left"\]/.test(css)
        && /\.deal-body\[data-banner="right"\]/.test(css));

    check("на телефоні банер і товари в один стовпчик",
        /grid-template-columns:minmax\(0, 1fr\);/.test(
            css.slice(css.indexOf("@media(max-width:900px)"))));
}


console.log("\n[2f] Порожнє поле доходить до сайту порожнім");
{
    // ПЕРЕВІРЯЄМО ЧЕРЕЗ ЗБІРКУ, А НЕ ЛИШЕ МАЛЮВАЛЬНИК.
    //
    // Попередня перевірка дивилась тільки в promo.js — «порожній текст
    // кнопки ховає кнопку» — і була зелена. А кнопку все одно не можна
    // було прибрати: збірка вписувала напис назад
    // (data.buttonText || "Дивитись усі товари"), тож до малювальника
    // порожнє значення не доходило НІКОЛИ.
    //
    // Тобто перевірявся один поверх ланцюга замість самого ланцюга.
    const literal = build.slice(build.indexOf(".push({"));

    check("збірка не підставляє текст кнопки",
        !/buttonText: data\.buttonText \|\|/.test(build)
        && /String\(data\.buttonText \|\| ""\)\.trim\(\)/.test(literal));

    // Порожнє поле не має підмінятися ЗМІСТОВНИМ значенням.
    //
    // `data.text || ""` — це не підміна, а зведення undefined до
    // порожнього рядка; воно й лишає поле порожнім. А от
    // `data.buttonText || "Дивитись усі товари"` вписує текст, якого
    // власник не писав, і тим робить порожнє поле недосяжним.
    const substituted = [...build.matchAll(/^\s*(\w+): data\.(\w+) \|\| "([^"]+)"/gm)]
        .map(m => `${m[1]} → «${m[3]}»`);

    check("порожнє поле не підмінюється текстом",
        substituted.length === 0, substituted.join(", "));

    // Кнопку ховає КОЖЕН малювальник — інакше вона зникала б на одному
    // банері й лишалась на іншому.
    // Блок «Ціна дня» питає moreText (своя кнопка плюс запасна),
    // решта чотири — promo.buttonText. Разом пʼять місць, і жодне не
    // має малювати кнопку без напису.
    const guards = (appJs.match(/promo\.buttonText \?/g) || []).length
        + (appJs.match(/moreText\s*\?/g) || []).length;

    check("усі банери головної ховають кнопку без напису", guards >= 5, guards);

    // Порожній <a class="btn"> намалював би порожню кольорову плашку —
    // гірше за кнопку з написом. Тому кожна згадка напису мусить
    // стояти ПІД умовою, а не просто давати порожній рядок.
    const lines = appJs.split("\n");

    const unguarded = lines
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /\$\{promo\.buttonText\}/.test(line))
        // Разом із самим рядком: у картці умова й напис стоять в
        // одному рядку, і без цього перевірка звинувачувала б код,
        // який робить рівно те, що треба.
        .filter(({ i }) => !lines.slice(Math.max(0, i - 6), i + 1)
            .some(prev => /promo\.buttonText \?/.test(prev)));

    check("порожня кнопка не лишає порожньої плашки",
        unguarded.length === 0,
        unguarded.map(u => `рядок ${u.i + 1}`).join(", "));
}


console.log("\n[2g] Затемнення фото — з адмінки");
{
    check("поле є", field("bannerDim") && field("bannerDim").widget === "number");

    check("межі розумні", field("bannerDim").min === 0 && field("bannerDim").max === 80);

    check("збірка переносить", /bannerDim: Math\.max\(0, Math\.min\(80/.test(build));

    // НУЛЬ — ЦЕ ЗНАЧЕННЯ, А НЕ «НЕ ЗАДАНО».
    //
    // Найлегша помилка тут — написати data.bannerDim || 55: тоді 0
    // перетворився б на 55, і «прибрати затемнення» стало б
    // неможливим — рівно та сама пастка, що з текстом кнопки.
    check("нуль не плутається з порожнім",
        !/data\.bannerDim \|\| 55/.test(build)
        && !/promo\.bannerDim \|\| 55/.test(promoJs)
        && /Number\.isFinite\(Number\(promo\.bannerDim\)\)/.test(promoJs));

    const dim = new Function("promo",
        promoJs.match(/    const dim = [\s\S]*?: 55;/)[0]
        + "\nreturn dim;");

    check("порожньо — 55, як було", dim({}) === 55);
    check("нуль лишається нулем", dim({ bannerDim: 0 }) === 0);
    check("двадцять лишається двадцятьма", dim({ bannerDim: 20 }) === 20);
    check("завелике значення обрізається", dim({ bannerDim: 300 }) === 80);

    // Без напису затемнювати нема чого — фото для того й завантажили.
    check("без напису затемнення не застосовується",
        /const wash = hasOverlay \? dim \/ 100 : 0;/.test(promoJs));
}


console.log("\n[2e] Прев'ю в адмінці показує ОБИДВА місця");
{
    // Прев'ю існує заради одного питання: «що з цього вийде». Поки
    // воно малювало лише банер, половину полів перевірити було нічим —
    // окремий напис для головної, вирівнювання товарів, свої кольори.
    // Власник бачив результат аж на сайті.
    const preview = read("admin/preview-templates.js");

    check("є блок «на головній»", /cms-preview-home/.test(preview));

    check("бере окремий напис",
        /e\.get\("homeTitle"\) \|\| e\.get\("title"\)/.test(preview)
        && /e\.get\("homeText"\) \|\| e\.get\("text"\)/.test(preview));

    check("бере свої кольори",
        /TextStyles\.mergeStyles\(e\.get\("style"\), e\.get\("homeStyle"\)\)/.test(preview));

    check("слухається вирівнювання",
        /"data-align": place\.products/.test(preview));

    check("слухається перемикача таймера",
        /e\.get\("hideCountdown"\) !== true/.test(preview));

    // Бейдж — там, де його дозволили, і в кожному місці своє питання.
    check("бейдж питає своє поле в обох місцях",
        /badgePlaces !== "home" && badgePlaces !== "none"/.test(preview)
        && /badgePlaces !== "promo" && badgePlaces !== "none"/.test(preview));

    check("кнопка лише з написом",
        /moreText\s*\?\s*h\("span", \{ className: "cms-preview-home-more"/.test(preview));

    // Прев'ю мусить малювати ті самі правила, що сайт. Один модуль на
    // двох — саме щоб вони не розійшлися.
    check("оформлення рахує спільний модуль, а не своя копія",
        /TextStyles\.styleVars\(homeStyle\)/.test(preview));

    // STYLE — ОБ'ЄКТ, А НЕ РЯДОК.
    //
    // На сайті оформлення ставиться рядком у атрибут style, і той
    // самий рядок я передав сюди. React такого не приймає: падає з
    // помилкою #62 і замість прев'ю показує «There's been an error».
    //
    // Найгірше — КОЛИ воно падало: порожній набір давав undefined і
    // все працювало, а перший же обраний колір ламав прев'ю. Тобто
    // ламалось рівно тоді, коли прев'ю й потрібне.
    const styleProps = [...preview.matchAll(/style: ([^,\n]+)/g)].map(m => m[1].trim());

    const stringly = styleProps.filter(v => /\.join\(|Attr\b|^"/.test(v));

    check("оформлення передається обʼєктом, а не рядком",
        stringly.length === 0, stringly.join(" | "));

    const previewCss = read("admin/preview-styles.css");

    check("ряд товарів у прев'ю теж вирівнюється",
        /cms-preview-home-row\[data-align="center"\]/.test(previewCss)
        && /cms-preview-home-row\[data-align="right"\]/.test(previewCss));
}


console.log("\n[3] Порожній заголовок не ламає видачу Google");
{
    check("назва акції словами — одна функція", /function promoHeading/.test(promoJs));

    const heading = new Function("promo",
        promoJs.match(/function promoHeading[\s\S]*?\n}\n/)[0] + "\nreturn promoHeading(promo);");

    check("бере заголовок, коли він є", heading({ title: "SUMMER SALE" }) === "SUMMER SALE");

    check("без заголовка бере опис", heading({ text: "Знижки на сумки" }) === "Знижки на сумки");

    check("без опису бере бренд", heading({ brand: "Coach" }) === "Coach");

    check("зовсім порожня акція не дає « | BestBrnd4u»", heading({}) === "Акція");

    check("пробіли не вважаються заголовком", heading({ title: "   ", brand: "Prada" }) === "Prada");

    // Саме той випадок, заради якого зроблено окремий напис: на банері
    // порожньо, на головній є. Вкладка й видача Google не мають від
    // цього діставати безлике «Акція».
    check("напис із головної рятує заголовок сторінки",
        heading({ homeTitle: "Ціна тижня" }) === "Ціна тижня");

    // Вкладка, хлібні крихти й <title> для Google — з одного джерела.
    check("усі три місця беруть звідти",
        (promoJs.match(/promoHeading\(promo\)/g) || []).length >= 3);
}


console.log("\n[4] Таймер цокає так само часто, як міняється");
{
    const api = new Function([
        /const MINUTE_MS[^\n]*\n/,
        /const DAY_MS[^\n]*\n/,
        /function promoShowsSeconds[\s\S]*?\n}\n/,
        /function promoCountdown[\s\S]*?\n}\n/,
        /function promoTickMs[\s\S]*?\n}\n/
    ].map(r => common.match(r)[0]).join("\n")
        + "return { promoCountdown, promoTickMs };")();

    const now = Date.now();

    // ГОЛОВНЕ: рядок із секундами мусить оновлюватись щосекунди.
    // Саме тут і був розрив — між годиною й добою секунди стояли.
    const moments = [6 * 86400, 25 * 3600, 23 * 3600, 3 * 3600, 59 * 60, 30];

    const mismatched = moments.filter(sec => {

        const until = now + sec * 1000;
        const shown = api.promoCountdown(until, now);
        const step = api.promoTickMs(until, now);

        const hasSeconds = /:\d\d:\d\d$|^\d\d:\d\d$/.test(shown) && !/дн\./.test(shown);

        return hasSeconds !== (step === 1000);

    });

    check("скрізь, де видно секунди, крок — одна секунда",
        mismatched.length === 0,
        mismatched.map(s => `${s} с: «${api.promoCountdown(now + s * 1000, now)}» / ${api.promoTickMs(now + s * 1000, now)} мс`).join("; "));

    check("22 години — секунди й крок в секунду",
        api.promoCountdown(now + 22 * 3600 * 1000, now) === "22:00:00"
        && api.promoTickMs(now + 22 * 3600 * 1000, now) === 1000);

    // Поки лишились дні, секунд не видно — і будити телефон щосекунди
    // немає причини.
    check("шість діб — раз на хвилину",
        api.promoTickMs(now + 6 * 86400 * 1000, now) === 60000);

    check("обидві функції питають одне правило",
        /promoShowsSeconds\(left\)/.test(common)
        && (common.match(/promoShowsSeconds\(/g) || []).length >= 3);
}


console.log("\n[5] Пуста акція не стає банером нізвідки");
{
    check("зовсім порожній запис пропускається",
        /!data\.title && !data\.text && !data\.image && !hasProducts/.test(build));

    // Банер без фото — темна смуга на всю ширину, гірша за
    // відсутність блока. «Ціна дня» фото не використовує взагалі.
    check("банер без фото теж пропускається",
        /!data\.image && data\.displayType !== "deal_of_day"/.test(build));

    check("і про це сказано в журналі збірки",
        /ПРОПУЩЕНО \(немає фото банера\)/.test(build));
}


console.log(failures === 0
    ? "\n✅ Банер акції: напис можна посунути або прибрати\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
