// Пошуки, які нічого не знайшли: журнал попиту, а не спостереження.
//
// НАВІЩО ЦЕ ВЗАГАЛІ Є
// --------------------
// Магазин додає товари руками. «Що шукали й не знайшли» — єдине місце,
// де видно попит, якого асортимент не покриває, і його не видно більше
// нізвідки: ні в замовленнях (їх не було), ні у статистиці відвідувань
// (там сторінки, а не запити).
//
// Причин рівно дві, і дії різні: або товару немає (варто завезти), або
// він Є, але зветься інакше — тоді досить дописати написання в пошук.
//
// ДЕ ТУТ МЕЖА (і чому половина файлу про неї)
// --------------------------------------------
// Сам assets/js/error-report.js писав: «Параметри відрізаються
// навмисно: у них буває пошуковий запит». Тепер запит записується — і
// це свідомий виняток, а не забуте правило. Тест стежить за умовами,
// які роблять його прийнятним:
//
//   • нуль результатів (успішний пошук не пишемо);
//   • згода на статистику;
//   • ні пошти, ні @ніка, ні довгого числа — такий запит не пишемо
//     ЦІЛКОМ;
//   • лише дописаний запит (каталог перемальовується на кожну літеру);
//   • не більше п'яти на сторінку.
//
// І окремо: пустий пошук НЕ робить щоденний звіт червоним. Це
// нормальна поведінка покупця; якби через неї приходив лист «помилки
// сайту», власник швидко привчився б його не читати.

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

const reportSrc = read("assets/js/error-report.js");
const catalogSrc = read("assets/js/catalog.js");
const migration = read("supabase/migrations/021-search-miss.sql");

// Живий ErrorReport у власному вікні: перевіряємо поведінку, а не
// текст файлу.
function sandbox(options) {

    const opts = options || {};

    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
        url: "https://bestbrnd4u.com/catalog?search=%D1%81%D1%83%D0%BC%D0%BA%D0%B0",
        runScripts: "outside-only"
    });

    const { window } = dom;

    const calls = [];

    window.supabaseClient = {
        rpc: (name, args) => {
            calls.push({ name, args });
            return Promise.resolve({});
        }
    };

    if (opts.consent !== undefined) {
        window.Consent = { has: () => opts.consent };
    }

    window.eval(reportSrc);

    return { window, calls };

}

// Обгортка async: усередині є await (пауза перед записом), а файл —
// звичайний CommonJS-тест, як решта в цій теці.
(async () => {

console.log("\n[1] Що взагалі можна записати");
{
    const { window } = sandbox({ consent: true });

    const clean = window.ErrorReport.cleanQuery;

    check("звичайний запит проходить", clean("сумка coach") === "сумка coach");

    check("пробіли стискаються", clean("  сумка   coach  ") === "сумка coach");

    // У пошук іноді вставляють те, що збиралися ввести в інше поле.
    check("пошта не пишеться", clean("ivan@example.com") === "");

    check("@нік не пишеться", clean("@bestbrnd4u") === "");

    // Телефон і картка: цифри без жодної літери.
    check("телефон не пишеться", clean("380671234567") === "");

    // Картку пишуть групами по чотири — п'яти цифр підряд там немає,
    // тому правило «цифри підряд» її й пропускало.
    check("номер картки не пишеться", clean("4111 1111 1111 1111") === "");

    // А ОСЬ ЦЕ — найцінніші записи журналу, і вони мусять проходити:
    // людина шукала конкретну модель і не знайшла.
    check("артикул проходить", clean("coach 73995") === "coach 73995");

    check("короткий номер моделі проходить", clean("mk 4903") === "mk 4903");

    check("довідковий номер годинника проходить",
        clean("t129.407.22.031.00") === "t129.407.22.031.00",
        clean("t129.407.22.031.00"));

    check("один символ не пишеться", clean("с") === "");

    check("довжина обмежена", clean("а".repeat(300)).length === 100);
}

console.log("\n[2] Згода на статистику");
{
    // Це вміст, який набрала ЛЮДИНА, а не технічні дані. Тому — за тією
    // самою згодою, що й решта вимірювань.
    const denied = sandbox({ consent: false });

    denied.window.ErrorReport.searchMiss("сумка prada");

    check("без згоди не пишемо",
        denied.calls.length === 0, JSON.stringify(denied.calls));

    const allowed = sandbox({ consent: true });

    allowed.window.ErrorReport.searchMiss("сумка prada");

    check("зі згодою — пишемо (після паузи)", allowed.calls.length === 0,
        "одразу писати не мусить");
}

console.log("\n[3] Пишемо лише дописаний запит");
{
    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ. Каталог перемальовується на КОЖНУ
    // натиснуту літеру (search.addEventListener("input", render)). Без
    // паузи в журнал ішло б «л», «ла», «лак», «лако»… — і замість
    // попиту власник побачив би чернетку набору.
    const { window, calls } = sandbox({ consent: true });

    const миті = window.ErrorReport.SEARCH_SETTLE_MS;

    check(`пауза перед записом є (${миті} мс)`, миті >= 1000);

    ["л", "ла", "лак", "лакост"].forEach(text => window.ErrorReport.searchMiss(text));

    await new Promise(resolve => setTimeout(resolve, миті + 300));

    check("з чотирьох натискань — один запис", calls.length === 1, calls.length);

    check("і записано саме дописане слово",
        calls[0] && calls[0].args.p_message === "лакост",
        calls[0] && calls[0].args.p_message);

    check("вид події — search_miss",
        calls[0] && calls[0].args.p_kind === "search_miss");

    // Сторінка без параметрів: у них і буває сам запит, тож шлях
    // лишається шляхом.
    check("у шляху немає самого запиту",
        calls[0] && calls[0].args.p_page === "/catalog",
        calls[0] && calls[0].args.p_page);
}

console.log("\n[4] Скільки записів з однієї сторінки");
{
    const { window, calls } = sandbox({ consent: true });

    check(`межа на сторінку: ${window.ErrorReport.SEARCH_PER_PAGE}`,
        window.ErrorReport.SEARCH_PER_PAGE <= 10);

    // Пишемо по одному, чекаючи паузу: інакше спрацює тільки останній.
    for (const word of ["перше", "друге", "третє", "четверте", "п'яте", "шосте", "сьоме"]) {

        window.ErrorReport.searchMiss(word);

        await new Promise(resolve => setTimeout(resolve, window.ErrorReport.SEARCH_SETTLE_MS + 60));

    }

    check(`записів не більше межі (${calls.length})`,
        calls.length <= window.ErrorReport.SEARCH_PER_PAGE, calls.length);

    // Помилки JS мають свій ліміт: пошук не має його з'їдати.
    const errors = sandbox({ consent: true });

    errors.window.ErrorReport.searchMiss("сумка");
    errors.window.ErrorReport.report("js_error", "щось зламалось", "");

    check("пошук не витрачає ліміт помилок",
        errors.calls.some(call => call.args.p_kind === "js_error"));
}

console.log("\n[5] Звідки це кличеться");
{
    // Тільки пошук, не фільтри: порожній результат після «бренд + ціна
    // до 2000» — це не «немає такого товару», а «людина звузила до
    // нуля», і в журналі це був би шум.
    check("каталог кличе при нулі результатів",
        /if \(!list\.length && window\.ErrorReport && window\.ErrorReport\.searchMiss\)/.test(catalogSrc));

    check("передає саме рядок пошуку",
        /searchMiss\(search\.value\)/.test(catalogSrc));

    check("і сказано, чому не для фільтрів",
        /ТІЛЬКИ ПОШУК, не фільтри/.test(catalogSrc));
}

console.log("\n[6] База приймає новий вид події");
{
    check("міграція додає search_miss",
        /'search_miss'/.test(migration));

    // Решта переліку мусить лишитись: міграція переписує функцію
    // цілком, і забути в ній старий вид означало б тихо вимкнути
    // журнал помилок.
    ["js_error", "not_found", "meta_capi", "stock_out", "mail_list"].forEach(kind => {
        check(`${kind} у переліку лишився`, new RegExp(`'${kind}'`).test(migration));
    });

    check("чужі види й далі не приймаються",
        /if v_kind not in \(/.test(migration));

    check("однаковий запит лише збільшує лічильник",
        /hits {6}= hits \+ 1/.test(migration));

    check("журнал не має права зламати сторінку",
        /exception when others then[\s\S]{0,300}raise warning/.test(migration));
}

console.log("\n[7] Пустий пошук — не поломка");
{
    const digest = read("scripts/report-issues.js");

    check("у звіті є окремий розділ", /ШУКАЛИ Й НЕ ЗНАЙШЛИ/.test(digest));

    check("найчастіші — перші", /sort\(\(a, b\) => \(b\.hits \|\| 0\) - \(a\.hits \|\| 0\)\)/.test(digest));

    check("сказано, що з цим робити", /або товару немає \(варто завезти\)/.test(digest));

    // ГОЛОВНЕ: не робить звіт червоним.
    //
    // ПРАВИЛО ПРО РЕЗУЛЬТАТ, А НЕ ПРО ФОРМУ КОДУ. Тут стояла
    // регулярка на `if (!errors.length && !missing.length)` — і вона
    // почервоніла, щойно перелік поломок став окремим списком
    // (10.09.2026, разом із виправленням: зведення друкувало три
    // різновиди з восьми). Поведінка при цьому не змінилась ні на
    // крок, а сторож упав. Тепер питаємо саму функцію.
    const { isBreakage } = require("../scripts/report-issues.js");

    check("сам по собі не валить звіт",
        !isBreakage({ kind: "search_miss" }));

    // Негативний контроль: якби функція завжди відповідала «ні»,
    // перевірка вище зеленіла б на зламаному звіті.
    check("а справжня помилка — валить",
        isBreakage({ kind: "js_error" }) && isBreakage({ kind: "not_found" }));

    check("рішення про червоне береться саме з неї",
        /const broken = rows\.filter\(isBreakage\)/.test(digest));

    check("і про це сказано в коді",
        /Пустий пошук — НЕ поломка/.test(digest));

    // Але позначку «показано» ставимо, інакше той самий запит їхав би
    // у звіті щодня.
    check("записи позначаються показаними",
        digest.indexOf("notified: true") > digest.indexOf("ШУКАЛИ Й НЕ ЗНАЙШЛИ"));
}

console.log("\n[8] Політика конфіденційності це описує");
{
    const policy = read("privacy-policy.html");

    check("є пункт про пошук", /Пошук, який нічого не знайшов/.test(policy));

    check("сказано про згоду", /лише<\/strong> за вашої згоди на статистику/.test(policy));

    check("сказано, що з поштою не пишемо",
        /запити з поштою, @ніком чи довгим числом не записуються/.test(policy));

    // Старе твердження мусило змінитись: воно обіцяло, що пошукового
    // запиту немає в жодному звіті.
    check("старе твердження прибрано",
        !/ні пошукового запиту в такому звіті немає/.test(policy));
}

console.log(failures ? `\n❌ Провалено: ${failures}` : "\n✅ Пустий пошук: видно попит, і нічого особистого");

process.exit(failures ? 1 : 0);

})();
