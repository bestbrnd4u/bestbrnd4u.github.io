// Шторка фільтрів на телефоні: курсор не губиться, кількість чутно.
//
// ЩО БУЛО (пройдено в браузері на 375px)
// ----------------------------------------
//   - «Бренд →» відкривав розділ, а сама кнопка ховалась разом із
//     переліком фільтрів — фокус падав на <body>, на початок сторінки
//     під шторкою. «Назад» і Escape робили те саме.
//   - Тап по фільтру міняв «Показати 131 товар» на «Показати 92
//     товари» лише для ока: читалка мовчала.
//
// Після правки в браузері: у розділі фокус на «Бренд», «Назад» і Escape
// повертають на «Бренд →» / «Колір →», три швидкі тапи — одне «Знайдено
// 38 товарів». Тут — те, на чому це тримається.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const code = fs.readFileSync(path.join(ROOT, "assets/js/catalog.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter(line => !/^\s*\/\//.test(line)).join("\n");

const body = name => (code.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`)) || [""])[0];

console.log("\n[1] Розділ відкрили — курсор на його назві");
{
    const open = body("openMobileFilterSection");
    check("функцію знайдено", open.length > 0);

    const shown = open.indexOf("mobileFiltersSub.hidden = false");
    const focus = open.indexOf("mobileFiltersSubTitle.focus(");
    check("назва стає фокусованою (tabindex=-1)", /mobileFiltersSubTitle\.setAttribute\("tabindex", "-1"\)/.test(open));
    // Фокус у схований вузол не стає — тому після того, як розділ показано.
    check("фокус — ПІСЛЯ того, як розділ показано", shown !== -1 && focus > shown);
    check("запам'ятовуємо, звідки зайшли", /lastSection = key/.test(open));
}

console.log("\n[2] Назад — на той самий рядок");
{
    const back = body("backToMobileFiltersMain");
    check("функцію знайдено", back.length > 0);

    const shown = back.indexOf("mobileFiltersMain.hidden = false");
    const focus = back.indexOf("row?.focus()");
    check("шукаємо рядок за lastSection", /data-target="\$\{lastSection\}"/.test(back));
    check("фокус — ПІСЛЯ того, як перелік показано", shown !== -1 && focus > shown);

    // Escape з розділу йде через ту саму функцію — і отримує те саме.
    check("Escape з розділу — через backToMobileFiltersMain",
        /if \(mobileFiltersSub && !mobileFiltersSub\.hidden\) \{\s*backToMobileFiltersMain\(\);/.test(code));
}

console.log("\n[3] Кількість — словами, усередині шторки, після паузи");
{
    check("жива область — у самій шторці (вона aria-modal)",
        /mobileFiltersModal\.appendChild\(mfLive\)/.test(code));
    check("aria-live=polite", /mfLive\.setAttribute\("aria-live", "polite"\)/.test(code));
    check("схована класом sr-announce", /mfLive\.className = "sr-announce"/.test(code));

    const say = body("sayCount");
    check("sayCount знайдено", say.length > 0);
    // Кожен новий виклик скасовує попередній — інакше по оголошенню на тап.
    check("пауза: попередній таймер скасовується", /clearTimeout\(countTimer\)[\s\S]*countTimer = setTimeout/.test(say));
    check("те саме число вдруге не повторюється", /if \(n === spokenCount\) return;/.test(say));
    check("відмінювання — «92 товари»", /pluralProducts\(Number\(n\) \|\| 0\)/.test(say));

    // Говоримо на ЗМІНУ, а не на відкриття: при відкритті число вже на
    // кнопці, і запам'ятовуємо його як сказане.
    const open = body("openMobileFilters");
    check("відкриття не оголошує — запам'ятовує поточне", /spokenCount = productsCount/.test(open));
    check("перемальовування при відкритій шторці — оголошує",
        /if \(!mobileFiltersModal\.hidden\) \{[\s\S]*?sayCount\(\);/.test(code));

    check("закриття гасить недоказане", /function closeMobileFilters\(\) \{[\s\S]*?clearTimeout\(countTimer\)/.test(code));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
