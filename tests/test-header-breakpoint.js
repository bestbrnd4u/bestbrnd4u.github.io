// БРЕЙКПОІНТ ШАПКИ ЖИВЕ В ДВОХ ФАЙЛАХ І МУСИТЬ БУТИ ОДНИМ ЧИСЛОМ
//
// ЩО СТАЛОСЬ. Десктопна шапка — лого 245 + меню 630 + іконки 238 +
// поля 64 — потребує близько 1177px, щоб елементи лише торкнулись.
// А ховалась вона аж на 768px. У проміжку .header-icons вилазив за
// контейнер, і це не «негарно», а недосяжно: body має
// overflow-x:hidden, тож нічого не прокручується. Виміряно на
// /catalog при вікні 820px (iPad у портреті): іконки доходили до
// 1008 — кошик, обране й акаунт просто зникали з екрана.
//
// ЧОМУ ЦЕ ОКРЕМИЙ НАБІР. Число живе у ДВОХ місцях:
//
//   • style.css — @media(max-width:1140px): ховає <nav>, показує
//     гамбургер, робить шапку трьома колонками;
//   • common.js — matchMedia(...): переносить гамбургер і пошук у
//     .header-left.
//
// CSS не вміє віддати число в matchMedia, а matchMedia не вміє
// прочитати @media. Тож їх двоє, і розійтись вони можуть мовчки:
// на ширині між двома числами CSS уже сховає меню й покаже
// гамбургер, а JS ще не перенесе його ліворуч — гамбургер
// лишиться праворуч, у купі з кошиком, а лівий кут буде порожній.
// Жодна інша перевірка цього не побачить.
//
// Та сама хвороба, що з window.Stock і зі стилями на тезі: правило
// спільне, а оголошене двічі.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const CSS = read("assets/css/style.css");
const JS = read("assets/js/common.js");


console.log("\n[1] У CSS шапка має власний брейкпоінт");

// Шукаємо блок, у якому ховається <nav>. Саме він і робить шапку
// мобільною — усе інше в блоці йде за ним.
const блоки = [...CSS.matchAll(/@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)\s*\{/g)];

const зНавігацією = блоки.filter(m => {
    // тіло блоку: рахуємо дужки від відкриття
    let глиб = 0, i = m.index + m[0].length - 1, кінець = -1;
    for (; i < CSS.length; i++) {
        if (CSS[i] === "{") глиб++;
        else if (CSS[i] === "}") { глиб--; if (глиб === 0) { кінець = i; break; } }
    }
    const тіло = CSS.slice(m.index, кінець);
    return /\n\s{4}nav\{\s*\n\s*display:\s*none/.test(тіло);
});

check("блок, що ховає <nav>, знайдено рівно один",
    зНавігацією.length === 1,
    зНавігацією.map(m => m[1] + "px").join(", ") || "жодного");

const ШИРИНА_CSS = зНавігацією.length === 1 ? Number(зНавігацією[0][1]) : null;

check("цей блок ширший за загальносайтові 768px",
    ШИРИНА_CSS !== null && ШИРИНА_CSS > 768,
    String(ШИРИНА_CSS));

// Десктопна шапка торкається на ~1177px. Нижче 1100 вона вже тисне
// сусідів: на 1090 лого впритул до меню. Число нижче за це означає
// смугу ширин, де шапка знов виглядає зламаною.
check("блок достатньо широкий, щоб шапка не тиснулась (≥1100)",
    ШИРИНА_CSS !== null && ШИРИНА_CSS >= 1100,
    String(ШИРИНА_CSS));


console.log("\n[2] У common.js те саме число");

const блокШапки = JS.slice(
    JS.indexOf("Мобільний хедер: гамбургер + пошук + лого одним кластером"),
    JS.indexOf("function buildMobileNav"));

check("блок перебудови шапки знайдено", блокШапки.length > 400, String(блокШапки.length));

const збіг = блокШапки.match(/matchMedia\(\s*["']\(\s*max-width\s*:\s*(\d+)px\s*\)["']\s*\)/);

check("matchMedia зі шириною знайдено", !!збіг, збіг ? збіг[0] : "немає");

const ШИРИНА_JS = збіг ? Number(збіг[1]) : null;

check("CSS і JS називають ОДНЕ число",
    ШИРИНА_CSS !== null && ШИРИНА_CSS === ШИРИНА_JS,
    "CSS " + ШИРИНА_CSS + "px, JS " + ШИРИНА_JS + "px");

// Рахуємо РІЗНІ числа, а не згадки: те саме 1140 стоїть ще й у
// коментарі поруч, і це добре — саме там воно й пояснене.
const ширини = [...new Set((блокШапки.match(/max-width\s*:\s*(\d+)px/g) || [])
    .map(s => s.match(/\d+/)[0]))];

check("у блоці шапки не згадана ІНША ширина",
    ширини.length === 1, ширини.join(", ") || "жодної");


console.log("\n[3] Правила шапки не лишились ще й у старому блоці");

// Якби їх скопіювали, а не перенесли, два місця з часом розійшлись
// би — і ніхто б не помітив, бо на вузькому екрані діють обидва.
const блок768 = (() => {
    const m = [...CSS.matchAll(/@media\(max-width:768px\)\{/g)].find(x => {
        let глиб = 0, кінець = -1;
        for (let i = x.index; i < CSS.length; i++) {
            if (CSS[i] === "{") глиб++;
            else if (CSS[i] === "}") { глиб--; if (глиб === 0) { кінець = i; break; } }
        }
        return CSS.slice(x.index, кінець).includes("grid-template-columns:1fr auto 1fr");
    });
    return m ? "є" : "немає";
})();

check("трьох-колонкової шапки в блоці 768 більше немає", блок768 === "немає", блок768);

const скількиРазів = (CSS.match(/grid-template-columns:1fr auto 1fr/g) || []).length;

check("розкладка шапки оголошена один раз", скількиРазів === 1, String(скількиРазів));


console.log("\n[4] Гамбургер показується саме там, де ховається меню");

const блокCSS = (() => {
    const m = зНавігацією[0];
    if (!m) return "";
    let глиб = 0, кінець = -1;
    for (let i = m.index; i < CSS.length; i++) {
        if (CSS[i] === "{") глиб++;
        else if (CSS[i] === "}") { глиб--; if (глиб === 0) { кінець = i; break; } }
    }
    return CSS.slice(m.index, кінець);
})();

check("у тому ж блоці гамбургер стає видимим",
    /mobile-menu-btn\s*\{\s*\n?\s*display:\s*flex/.test(блокCSS));

check("у тому ж блоці лого стає по центру",
    /\.logo\{\s*\n\s*justify-self:\s*center/.test(блокCSS));

check("у тому ж блоці ховається акаунт",
    /#accountLink\{\s*\n\s*display:\s*none/.test(блокCSS));


console.log(failures === 0
    ? "\n✅ Брейкпоінт шапки один і той самий у CSS і в JS\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
