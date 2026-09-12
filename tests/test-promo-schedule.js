// Акція з розкладом: анонс → іде → зникла.
//
// НАВІЩО ЦЕ ЗРОБЛЕНО
// -------------------
// Досі акція жила, поки її не приберуть руками. «Нічний сейл на 12
// годин» так не зробити: треба прийти опівночі й увімкнути, а вранці
// вимкнути. Тепер в акції можуть бути дати початку й кінця.
//
// ЩО ТУТ ЗАКРІПЛЕНО
// ------------------
// 1. Акція БЕЗ дат поводиться точно як раніше. Це головне: чотири вже
//    опубліковані акції не мають нічого помітити.
//
// 2. Анонсована акція видима, але БЕЗ перекреслених цін. Це не
//    косметика: намалювати «було 14 300» за тиждень до початку —
//    значить видати обіцянку за факт. Покупець, який прийде по ній
//    сьогодні, заплатить повну ціну.
//
//    Заміряно на живій сторінці (11.09.2026, локальний сервер): та
//    сама акція зі знижкою 20% і 19 товарами показує 4 перекреслені
//    ціни в стані «анонс» (це товари з власною знижкою) і 19 у стані
//    «йде».
//
// 3. Завершена зникає сама — і з головної, і зі своєї сторінки.
//
// 4. Стан рахує БРАУЗЕР, а не збірка. Збірка знає лише час свого
//    запуску: сейл почався б не опівночі, а під час наступної збірки,
//    тобто будь-коли.
//
// ЧОГО ЦЕ НЕ ВМІЄ І НЕ МАЄ ВМІТИ
// -------------------------------
// Годинник у браузері можна перевести. Таймер тут — ОФОРМЛЕННЯ, а не
// замок: справжню знижку дає промокод, і вікно дії перевіряє база
// (starts_at/expires_at, міграція 025).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const common = read("assets/js/common.js");
const admin = read("admin/config.yml");

// Живі функції з common.js — перевіряємо поведінку, а не текст файлу.
const api = (() => {

    const parts = [
        /const MINUTE_MS[^\n]*\n/,
        /const DAY_MS[^\n]*\n/,
        /function promoMoment[\s\S]*?\n}\n/,
        /function promoState[\s\S]*?\n}\n/,
        /function promoTiming[\s\S]*?\n}\n/,
        /function promoVisible[\s\S]*?\n}\n/,
        /function promoDiscountActive[\s\S]*?\n}\n/,
        /function promoCountdown[\s\S]*?\n}\n/,
        /function promoTickMs[\s\S]*?\n}\n/
    ].map(pattern => {

        const found = common.match(pattern);

        if (!found) throw new Error("не знайшов у common.js: " + pattern);

        return found[0];

    });

    return new Function(parts.join("\n") + `
        return { promoState, promoTiming, promoVisible, promoDiscountActive,
                 promoCountdown, promoTickMs };`)();

})();

const NOW = Date.parse("2026-09-15T12:00:00Z");
const at = shift => new Date(NOW + shift).toISOString();

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

console.log("\n[1] Акція без дат нічого не помічає");
{
    // ЧОТИРИ ВЖЕ ОПУБЛІКОВАНІ АКЦІЇ. Якби розклад мав значення за
    // замовчуванням, вони б зникли з сайту в день виливки.
    check("без дат — вважається живою", api.promoState({}, NOW) === "live");

    check("без дат — видима", api.promoVisible({}, NOW) === true);

    check("без дат — знижка показується",
        api.promoDiscountActive({ discountPercent: 20 }, NOW) === true);

    check("без дат — відлічувати нема чого",
        api.promoTiming({}, NOW).until === null);

    const live = JSON.parse(read("data/promotions.json"));

    check(`жодна з ${live.length} опублікованих акцій не зникла`,
        live.every(promo => api.promoVisible(promo, NOW)),
        live.filter(promo => !api.promoVisible(promo, NOW)).map(p => p.slug).join(", "));
}

console.log("\n[2] Три стани");
{
    const announced = { startsAt: at(2 * DAY), endsAt: at(3 * DAY) };
    const live = { startsAt: at(-HOUR), endsAt: at(2 * HOUR) };
    const ended = { startsAt: at(-2 * DAY), endsAt: at(-DAY) };

    check("до початку — анонс", api.promoState(announced, NOW) === "announced");
    check("між датами — йде", api.promoState(live, NOW) === "live");
    check("після кінця — завершена", api.promoState(ended, NOW) === "ended");

    // Межі. Секунда до початку — ще анонс; рівно початок — уже йде.
    check("рівно на початку вже йде",
        api.promoState({ startsAt: at(0) }, NOW) === "live");

    check("за секунду до початку ще анонс",
        api.promoState({ startsAt: at(1000) }, NOW) === "announced");

    // Рівно кінець — уже завершена: інакше остання секунда акції
    // лишалася б живою нескінченно довго при рівності.
    check("рівно в кінці вже завершена",
        api.promoState({ endsAt: at(0) }, NOW) === "ended");

    check("лише початок, без кінця — йде без відліку",
        api.promoState({ startsAt: at(-DAY) }, NOW) === "live"
        && api.promoTiming({ startsAt: at(-DAY) }, NOW).until === null);

    check("завершена зникає", api.promoVisible(ended, NOW) === false);
    check("анонсована лишається", api.promoVisible(announced, NOW) === true);
}

console.log("\n[3] Знижку показуємо лише коли вона справді діє");
{
    // НАЙВАЖЛИВІШЕ ПРАВИЛО ТУТ.
    //
    // Перекреслена стара ціна — це твердження про сьогодні. В
    // анонсованій акції знижки ще немає: покупець, який прийде по
    // такій ціні за тиждень до початку, заплатить повну.
    const announced = { startsAt: at(DAY), discountPercent: 20 };
    const live = { endsAt: at(DAY), discountPercent: 20 };
    const ended = { endsAt: at(-DAY), discountPercent: 20 };

    check("в анонсі знижки ще немає",
        api.promoDiscountActive(announced, NOW) === false);

    check("поки йде — є", api.promoDiscountActive(live, NOW) === true);

    check("після кінця — немає", api.promoDiscountActive(ended, NOW) === false);

    check("без відсотка нічого не малюємо",
        api.promoDiscountActive({ endsAt: at(DAY) }, NOW) === false);

    // І сторінка акції мусить питати САМЕ це, а не голий
    // discountPercent — інакше правило лишиться на папері.
    const promoJs = read("assets/js/promo.js");

    check("сторінка акції питає правило, а не відсоток",
        /!promoDiscountActive\(promo\)/.test(promoJs)
        && !/!promo\.discountPercent\)/.test(promoJs));

    check("і завершена акція не відкривається",
        /!promo \|\| !promoVisible\(promo\)/.test(promoJs));
}

console.log("\n[4] Відлік читається людиною");
{
    check("дні окремо від годин, але із секундами",
        api.promoCountdown(NOW + 6 * DAY + 4 * HOUR + 12 * 60000, NOW) === "6 дн. 04:12:00",
        api.promoCountdown(NOW + 6 * DAY + 4 * HOUR + 12 * 60000, NOW));

    check("під добу — годинник із секундами",
        api.promoCountdown(NOW + 2 * HOUR + 5000, NOW) === "02:00:05",
        api.promoCountdown(NOW + 2 * HOUR + 5000, NOW));

    check("остання година — хвилини й секунди",
        api.promoCountdown(NOW + 5 * 60000 + 7000, NOW) === "05:07",
        api.promoCountdown(NOW + 5 * 60000 + 7000, NOW));

    check("час вийшов — порожньо", api.promoCountdown(NOW - 1, NOW) === "");

    // КРОК ГОДИННИКА = ЯК ЧАСТО МІНЯЄТЬСЯ РЯДОК, і не інакше.
    //
    // Тут стояло «2 години → раз на хвилину» — і це закріплювало
    // помилку, а не правило. Рядок за дві години до кінця виглядає як
    // «02:00:00»: секунди на екрані є, а оновлювались вони раз на
    // хвилину. Власник побачив завмерлий годинник і саме так це й
    // описав: «таймер не идет, секунды не тикают».
    //
    // Тоді межу поставили на добу. Не допомогло: акція йшла шість діб,
    // і власник побачив той самий нерухомий рядок — тепер уже «6 дн.
    // 05:26». Написав удруге, окремо про головну й окремо про
    // сторінку акції.
    //
    // Межі більше немає. Секунди в рядку завжди, крок завжди
    // секунда, а батарею бережемо зупинкою годинника на прихованій
    // вкладці — це перевіряє [4b] у test-promo-banner-layout.js.
    [["дві години", 2 * HOUR], ["три доби", 3 * 24 * HOUR],
     ["хвилина", 60000], ["тиждень", 7 * 24 * HOUR]].forEach(([name, shift]) =>
        check(`${name} до кінця — крок одна секунда`,
            api.promoTickMs(NOW + shift, NOW) === 1000,
            `${api.promoCountdown(NOW + shift, NOW)} / ${api.promoTickMs(NOW + shift, NOW)} мс`));
}

console.log("\n[5] Дати задаються в адмінці й доходять до сайту");
{
    check("поле початку є", /name: "startsAt"/.test(admin));
    check("поле кінця є", /name: "endsAt"/.test(admin));

    check("обидва — вибір дати з часом",
        (admin.match(/name: "startsAt"\n\s*widget: "datetime"/) || []).length === 1
        && (admin.match(/name: "endsAt"\n\s*widget: "datetime"/) || []).length === 1);

    // Власник мусить знати, що таймер — оформлення, а замок — у
    // промокоді. Інакше він поставить дати й вирішить, що знижка
    // захищена.
    check("сказано, що замок — у промокоді",
        /відлік — це оформлення, а не замок/i.test(admin));

    const build = read("scripts/build-promotions.js");

    check("збірка переносить дати", /startsAt: promoDate\(data\.startsAt\)/.test(build)
        && /endsAt: promoDate\(data\.endsAt\)/.test(build));

    // Порожні поля НЕ пишемо: інакше в кожній акції без розкладу
    // з'явилось би два порожніх рядки.
    check("порожнє поле в дані не потрапляє",
        /\.\.\.\(promoDate\(data\.startsAt\) \? \{ startsAt/.test(build));

    // Крива дата не має валити збірку всього сайту.
    //
    // promoDate живе в scripts/promo-deals.js: ті самі дати читає й
    // збірка товарів (ціна дня), а вона йде РАНІШЕ за збірку акцій і
    // готового data/promotions.json ще не бачить.
    const promoDate = new Function("value", read("scripts/promo-deals.js")
        .match(/function promoDate[\s\S]*?\n}\n/)[0] + "\nreturn promoDate(value);");

    check("сміття відкидається мовчки",
        promoDate("не дата") === "" && promoDate("") === "" && promoDate(null) === "");

    check("справжня дата стає ISO",
        promoDate("2026-12-31T23:00:00+02:00") === "2026-12-31T21:00:00.000Z",
        promoDate("2026-12-31T23:00:00+02:00"));
}

console.log("\n[6] Головна не показує завершених");
{
    const app = read("assets/js/app.js");

    check("фільтр стоїть перед усім іншим",
        /all\.filter\(promo => promoVisible\(promo\)\)/.test(app));

    // ЧОМУ ДО СТАТИСТИКИ. Показ завершеної акції потрапляв би в
    // аналітику, і «перегляди банера» рахували б те, чого ніхто не
    // бачив.
    check("…і до статистики показів",
        app.indexOf("promoVisible(promo)") < app.indexOf("viewPromotion"));

    check("відлік малюється на банерах", /promoTimerTag\(promo\)/.test(app));

    // Один хід годинника на всі банери: п'ять окремих таймерів — це
    // п'ять пробуджень телефона замість одного.
    check("один таймер на всі банери",
        /function tickPromoTimers/.test(app)
        && (app.match(/setTimeout\(tickPromoTimers/g) || []).length === 1);
}

console.log("\n[7] Завершена акція не кличе до себе Google");
{
    const sitemap = read("scripts/build-sitemap.js");

    // Сторінка завершеної акції показує «не знайдено» й посилання в
    // каталог. Рядок на неї в sitemap — це запрошення роботу на
    // soft-404, тобто власноруч зіпсований звіт індексації.
    const ended = new Function("promo", "now",
        sitemap.match(/const ended = promo => \{[\s\S]*?\n    \};/)[0]
            .replace("const ended = promo =>", "const rule = promo =>")
        + "\nreturn rule(promo);");

    const past = { slug: "a", endsAt: "2026-01-01T00:00:00Z" };
    const future = { slug: "b", endsAt: "2030-01-01T00:00:00Z" };

    check("правило бачить завершену", ended(past, Date.now()) === true);

    check("акція, що триває, лишається", ended(future, Date.now()) === false);

    // Анонсована сторінка справжня: заради неї розклад і робився —
    // про акцію мають дізнатись ДО початку.
    check("акція без дат теж лишається", ended({ slug: "c" }, Date.now()) === false);

    check("крива дата не викидає акцію",
        ended({ slug: "d", endsAt: "не дата" }, Date.now()) === false);

    check("і правило справді ввімкнене у збірці",
        /if \(ended\(promo\)\) return;/.test(sitemap));

    // Момент — час збірки, і це все, що sitemap може знати.
    const live = JSON.parse(read("data/promotions.json"));
    const xml = read("sitemap.xml");

    const missing = live
        .filter(promo => !ended(promo, Date.now()))
        .filter(promo => !xml.includes(`promo?id=${promo.slug}`));

    check("усі чинні акції в sitemap є", missing.length === 0,
        missing.map(p => p.slug).join(", "));
}

console.log(failures
    ? `\n❌ Провалено: ${failures}\n`
    : "\n✅ Акція з розкладом: з'являється й зникає сама\n");

process.exit(failures ? 1 : 0);
