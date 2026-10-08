// Розділи каталогу мусять бути в підвалі кожної сторінки.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Сторінки розділів і категорій зроблені рівно для того, щоб магазин
// знаходили за «сумки купити» чи «гаманці Coach». Вони є, у sitemap
// вони є, вміст у них є.
//
// А посилань на них на самому сайті майже не було. Заміряно
// 08.10.2026 у браузері, головна ПІСЛЯ рендеру:
//
//     на /categories/<slug>/   10   (мега-меню, малює скрипт)
//     на /departments/<slug>/   2
//     на /catalog?<фільтри>    39
//
// А в сирому HTML усіх 159 сторінок: на розділи 11, на категорії 12,
// на catalog із фільтром — 2935, з них 2862 у наскрізній навігації.
// Тобто майже вся вага посилань ішла на адресу, яка канонізується в
// /catalog, а сторінки, зроблені для пошуку, не діставали нічого.
//
// ЧОМУ САМЕ ПІДВАЛ. Він статичний — його бачить і робот, що не
// виконує JavaScript (мега-меню такий робот не бачить зовсім), — і
// він на кожній сторінці. А розділ веде далі в свої категорії, тож
// одне посилання тягне за собою весь рівень.
//
// Після правки: на розділи 488 посилань, із них 477 наскрізних.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const { departmentPages, readRecords, DEPARTMENTS_SRC } = require("../scripts/build-taxonomy-pages");
const { START, END } = require("../scripts/build-footer-sections");

const readJson = file => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")); }
    catch (error) { return []; }
};

const departments = departmentPages(
    readJson("data/products.json"),
    readJson("data/categories.json"),
    readRecords(DEPARTMENTS_SRC));

function pages(dir, found) {
    const list = found || [];
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        if (["node_modules", ".git", ".claude", "archive", "admin",
            ".playwright-mcp", "supabase"].includes(entry.name)) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) pages(full, list);
        else if (entry.name.endsWith(".html")) list.push(full);
    });
    return list;
}

const усі = pages(ROOT, []).filter(f =>
    !/http-equiv="refresh"/.test(fs.readFileSync(f, "utf8")));


console.log("\n[1] Розділи є в підвалі кожної сторінки");
{
    check("розділи знайдено", departments.length > 0, String(departments.length));

    const без = усі.filter(f => {
        const html = fs.readFileSync(f, "utf8");
        return !html.includes(START) || !html.includes(END);
    });

    check(`мітка є на всіх ${усі.length} сторінках`, без.length === 0,
        без.slice(0, 4).map(f => path.relative(ROOT, f)).join(", "));

    const порожні = усі.filter(f => {
        const html = fs.readFileSync(f, "utf8");
        const блок = (html.match(new RegExp(START + "([\\s\\S]*?)" + END)) || [])[1] || "";
        return !/\/departments\//.test(блок);
    });

    check("і всюди вона наповнена", порожні.length === 0,
        порожні.slice(0, 4).map(f => path.relative(ROOT, f)).join(", "));
}


console.log("\n[2] У підвалі саме ті розділи, що існують");
{
    // Підвал, вписаний руками, перестав би збігатися з дійсністю
    // мовчки: розділи заводяться в адмінці. Тому звіряємо з даними.
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

    const блок = (html.match(new RegExp(START + "([\\s\\S]*?)" + END)) || [])[1] || "";

    const уПідвалі = [...блок.matchAll(/href="\/departments\/([^/"]+)\//g)].map(m => m[1]);

    const очікувані = departments.map(p => p.slug);

    check(`у підвалі ${уПідвалі.length} розділів, у даних ${очікувані.length}`,
        уПідвалі.length === очікувані.length, уПідвалі.join(", "));

    const зайві = уПідвалі.filter(s => !очікувані.includes(s));
    const бракує = очікувані.filter(s => !уПідвалі.includes(s));

    check("жодного зайвого", зайві.length === 0, зайві.join(", "));
    check("жодного не бракує", бракує.length === 0, бракує.join(", "));

    // Назва теж із даних, а не вигадана: у підвалі людина читає те
    // саме слово, що й на самій сторінці розділу.
    const назви = departments.every(p => блок.includes(">" + p.name + "<"));

    check("назви ті самі, що на сторінках розділів", назви,
        departments.map(p => p.name).join(", "));
}


console.log("\n[3] Посилання стоять саме в підвалі, і адреси абсолютні");
{
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

    const підвал = (html.match(/<footer[\s\S]*?<\/footer>/) || [""])[0];

    check("мітка лежить усередині <footer>", підвал.includes(START),
        підвал ? "мітки в підвалі немає" : "підвалу не знайдено");

    const блок = (html.match(new RegExp(START + "([\\s\\S]*?)" + END)) || [])[1] || "";

    // Від кореня, а не відносно: ті самі сторінки лежать і в /p/, і в
    // /brands/<slug>/, і відносний шлях вів би звідти в нікуди.
    check("адреси від кореня", /href="\/departments\//.test(блок)
        && !/href="departments\//.test(блок), блок.replace(/\s+/g, " ").slice(0, 80));
}


console.log("\n[4] Крок стоїть у збірці після генераторів сторінок");
{
    // Якщо запустити його раніше, згенеровані сторінки ще зроблені зі
    // старих шаблонів і мітки в них немає — саме так він і впав під
    // час першої спроби.
    const chain = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"))
        .scripts.build.split("&&").map(s => s.trim());

    const місце = chain.findIndex(s => s.includes("build-footer-sections.js"));

    check("крок у ланцюжку збірки є", місце >= 0, String(місце));

    ["build-product-pages.js", "build-taxonomy-pages.js", "build-promo-pages.js"]
        .forEach(генератор => {
            const i = chain.findIndex(s => s.includes(генератор));
            check(`після ${генератор}`, i >= 0 && i < місце, `${i} < ${місце}`);
        });
}


console.log(failures === 0
    ? `\n✅ ${departments.length} розділів у підвалі ${усі.length} сторінок\n`
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
