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
