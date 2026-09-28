// Один і той самий блок мусить лежати в одній і тій самій обгортці.
//
// ЗНАЙДЕНО 28.09.2026 — власник показав скріншот
// ----------------------------------------------
// На сторінці оферти пункти «Частих запитань» злиплись докупи, без
// жодного проміжку. На чотирьох сусідніх сторінках — байєр-сервіс,
// оплата й доставка, повернення, політика — ті самі пункти стоять із
// проміжком 12px.
//
// Причина не в стилях: проміжок дає обгортка
//
//     .bayer-faq-list { display:flex; flex-direction:column; gap:12px }
//
// а на сторінці оферти пункти лежали просто в .container. Тобто
// правило в проєкті було, просто на п'ятій сторінці його загубили.
//
// ЧОМУ ПЕРЕВІРКА САМЕ ТАКА
// ------------------------
// Вимірювати проміжки без браузера не можна — у jsdom немає верстки.
// Але можна перевірити ПРИЧИНУ: якщо однакові блоки на різних
// сторінках лежать у різних обгортках, то й виглядають вони
// по-різному. Це та сама порода, що й кнопка «нагору» без підпису на
// одній сторінці з тринадцяти: правило є, застосували нерівно.
//
// Перевірка не знає нічого про FAQ — вона порівнює ВСІ повторювані
// блоки. На 25.09.2026 таких 35, і розбіжностей лише три, кожна
// пояснена нижче.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// РІЗНІ ОБГОРТКИ, ЯКІ ТАК І ЗАДУМАНО.
//
// Кожен випадок названий поіменно, а не пропущений мовчки: якщо блок
// колись поїде в третю обгортку, перевірка все одно почервоніє.
const ДОЗВОЛЕНО = new Map([
    // Той самий підблок кабінету у двох різних картках на одній сторінці.
    ["profile-card-sub", ["newsletter-settings", "profile-email-step"]],
    // Рядок підсумку: у кошику своя картка, на оформленні своя.
    ["summary-row", ["cart-summary", "order-summary"]],
    // Картка замовлення: на сторінці подяки без модифікатора, на
    // сторінці «де моє замовлення» — з ним.
    ["order-confirm-row", ["order-confirm-card", "order-confirm-card lookup-result"]]
]);

const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

// клас блоку → Map(клас обгортки → [сторінки])
const обгортки = new Map();

PAGES.forEach(rel => {

    const html = fs.readFileSync(path.join(ROOT, rel), "utf8");

    // Перенаправлення зі старих адрес — не сторінки.
    if (/http-equiv=["']refresh["']/i.test(html)) return;

    const doc = new JSDOM(html).window.document;

    doc.querySelectorAll("*").forEach(el => {

        const cls = String(el.className || "").trim();

        // Лише блоки з ОДНИМ класом: у складених класах друга половина
        // часто є модифікатором стану («active», «open»), і порівнювати
        // їх між сторінками немає сенсу.
        if (!cls || cls.includes(" ")) return;

        if (!el.parentElement) return;

        const сусіди = [...el.parentElement.children]
            .filter(x => String(x.className || "").trim() === cls);

        // Один блок — не список, обгортка йому не потрібна.
        if (сусіди.length < 2) return;

        // Групу рахуємо один раз, за першим її блоком.
        if (сусіди[0] !== el) return;

        const обгортка = String(el.parentElement.className || "").trim()
            || el.parentElement.tagName.toLowerCase();

        if (!обгортки.has(cls)) обгортки.set(cls, new Map());

        const за = обгортки.get(cls);

        if (!за.has(обгортка)) за.set(обгортка, []);

        за.get(обгортка).push(rel);

    });

});

console.log("\n[1] Повторювані блоки лежать в однакових обгортках");
{
    console.log(`  · повторюваних блоків: ${обгортки.size} на ${PAGES.length} сторінках`);

    check("є що порівнювати", обгортки.size > 10, String(обгортки.size));

    const розбіжності = [];

    обгортки.forEach((за, cls) => {

        if (за.size < 2) return;

        const дозволені = ДОЗВОЛЕНО.get(cls);

        if (дозволені && [...за.keys()].every(p => дозволені.includes(p))) return;

        розбіжності.push(`${cls}: ` + [...за.entries()]
            .map(([p, files]) => `«${p}» ${files.length} стор. (${files[0]})`)
            .join(" проти "));

    });

    check("жоден блок не загубив свою обгортку",
        розбіжності.length === 0, розбіжності.slice(0, 3).join("; "));
}

console.log("\n[2] Пункти «Частих запитань» — у списку, який дає проміжок");
{
    // Окремо й прямо: саме цей випадок і знайшовся. [1] його ловить,
    // але назвати симптом його іменем означає, що наступного разу
    // причина буде видна з першого рядка.
    const без = [];
    let сторінок = 0;

    PAGES.forEach(rel => {

        const html = fs.readFileSync(path.join(ROOT, rel), "utf8");

        if (!html.includes("bayer-faq-item")) return;

        сторінок++;

        const doc = new JSDOM(html).window.document;

        doc.querySelectorAll(".bayer-faq-item").forEach(item => {
            if (!item.closest(".bayer-faq-list")) {
                без.push(`${rel}: «${item.textContent.trim().slice(0, 34)}…»`);
            }
        });

    });

    console.log(`  · сторінок із питаннями: ${сторінок}`);

    check("сторінки з питаннями знайшлись", сторінок > 0);

    check("кожен пункт — усередині .bayer-faq-list",
        без.length === 0, без.slice(0, 3).join("; "));

    // І сама обгортка мусить давати проміжок, інакше вона пуста річ.
    const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");

    const правило = (css.match(/\.bayer-faq-list\s*\{[^}]*\}/) || [""])[0];

    check("у .bayer-faq-list заданий проміжок",
        /gap\s*:\s*[1-9]/.test(правило), правило.replace(/\s+/g, " ").slice(0, 80));
}

console.log("\n[3] Підписка — окремою секцією, а не в колонці футера");
{
    // ЧОМУ ЦЕ НЕ ПРО КРАСУ.
    //
    // subscribe.js ховає пропозицію підписатись тому, хто вже
    // підписаний, і ховає він ось що:
    //
    //     form.closest("section.newsletter") || form
    //
    // Тобто форма в секції — ховається СЕКЦІЯ ЦІЛКОМ, а форма в
    // футері — тільки форма, і в колонці лишається дірка. Перевірено
    // на кошику: секція 727px зникає повністю, футер під'їжджає рівно
    // на цю висоту.
    //
    // Плюс те, з чого все почалось: у вузькій колонці футера текст
    // згоди наповзав на кнопку «нагору», а заголовка не було зовсім.
    //
    // ДВІ СТОРІНКИ БЕЗ ПІДПИСКИ — НАВМИСНО. На оформленні вона тягне
    // увагу вбік від оплати, а на сторінці підтвердження людина
    // щойно підписалась: пропонувати їй підписатись знову безглуздо.
    const БЕЗ_ПІДПИСКИ = ["checkout.html", "newsletter-confirm.html"];

    const уФутері = [];
    const позаСекцією = [];
    const зайві = [];
    let зПідпискою = 0;

    PAGES.forEach(rel => {

        const html = fs.readFileSync(path.join(ROOT, rel), "utf8");

        if (/http-equiv=["']refresh["']/i.test(html)) return;

        const форм = (html.match(/<form class="subscribe"/g) || []).length;

        if (БЕЗ_ПІДПИСКИ.includes(rel)) {
            if (форм) зайві.push(`${rel}: форм ${форм}`);
            return;
        }

        if (!форм) { позаСекцією.push(`${rel}: форми немає зовсім`); return; }

        зПідпискою++;

        if (/<footer>[\s\S]*?<form class="subscribe"[\s\S]*?<\/footer>/.test(html)) {
            уФутері.push(rel);
        }

        const doc = new JSDOM(html).window.document;

        doc.querySelectorAll("form.subscribe").forEach(form => {
            if (!form.closest("section.newsletter")) позаСекцією.push(rel);
        });

    });

    console.log(`  · сторінок із підпискою: ${зПідпискою}, без неї: ${БЕЗ_ПІДПИСКИ.length}`);

    check("сторінок із підпискою достатньо", зПідпискою > 10, String(зПідпискою));

    check("у футері форми немає ніде", уФутері.length === 0, уФутері.join(", "));

    check("кожна форма — усередині section.newsletter",
        позаСекцією.length === 0, позаСекцією.join(", "));

    check("на оформленні й підтвердженні підписки немає",
        зайві.length === 0, зайві.join(", "));

    // І скрипт там теж зайвий: інших form.subscribe на цих сторінках
    // немає, а назовні subscribe.js нічого не віддає.
    const зіСкриптом = БЕЗ_ПІДПИСКИ.filter(rel =>
        /<script src="assets\/js\/subscribe\.js/.test(fs.readFileSync(path.join(ROOT, rel), "utf8")));

    check("і скрипт підписки звідти прибрано",
        зіСкриптом.length === 0, зіСкриптом.join(", "));
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
