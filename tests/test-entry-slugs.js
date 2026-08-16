// Імена файлів-записів у папкових колекціях Decap мають бути безпечними
// для адреси.
//
// Історія: у data/promotions лежав файл
//   #U0431#U0456#U043b#U044c#U0448#U0435-…-#U043b#U0456#U0442#U0430.json —
// зіпсована при розпакуванні ZIP копія "більше-стилю-для-яскравого-літа".
// Через «#» у slug адмінка відкривала акцію порожньою
// ("Unexpected end of JSON input" у backend.js), а в списку після
// «назад» з'являвся фантомний запис «-». Тест ловить такі файли ще
// в CI, до того як вони зламають адмінку.
//
// Список колекцій НЕ захардкоджений — береться з admin/config.yml,
// тож нова папкова колекція автоматично потрапляє під перевірку.
const fs = require("fs");
const path = require("path");
const { ROOT, loadYaml } = require("./helpers/yaml");
const { slugProblem, filterSafeEntryFiles, MANGLED_RE } = require("../scripts/slug-safety");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const config = loadYaml("admin/config.yml");
const folderCollections = config.collections.filter(c => c.folder);

console.log("\n[1] Правило впізнає биті імена й пропускає нормальні");
{
    check("звичайний латинський slug — ок", slugProblem("summer-sale") === null);
    check("кирилиця дозволена (браузер її кодує сам)",
        slugProblem("більше-стилю-для-яскравого-літа") === null,
        slugProblem("більше-стилю-для-яскравого-літа"));
    check("цифровий slug з конфіга акцій — ок", slugProblem("20260816103000") === null);
    check("підкреслення й крапки — ок", slugProblem("a_b.c-1") === null);

    check("реальне зіпсоване ім'я з багу — відхилено",
        slugProblem("#U0431#U0456#U043b#U044c#U0448#U0435-#U043b#U0456#U0442#U0430") !== null);
    check("у причині згадано ZIP-розпакування",
        /ZIP/.test(slugProblem("#U0431#U0456#U043b#U044c") || ""));
    check("одинокий «#» відхилено (саме він ріже адресу)", slugProblem("promo#1") !== null);
    check("«?» відхилено (обриває slug у promo?id=)", slugProblem("promo?x") !== null);
    check("«%» відхилено (подвійне кодування)", slugProblem("promo%20a") !== null);
    check("«/» відхилено (зайвий сегмент шляху)", slugProblem("a/b") !== null);
    check("«\\» відхилено", slugProblem("a\\b") !== null);
    check("пробіл відхилено", slugProblem("summer sale") !== null);
    check("порожнє ім'я відхилено", slugProblem("") !== null);
    check("ім'я з крапки відхилено", slugProblem(".hidden") !== null);
    check('".." відхилено', slugProblem("a..b") !== null);
}

console.log("\n[2] У жодній папковій колекції немає битих імен");
{
    check("папкові колекції знайдені в config.yml", folderCollections.length >= 4,
        folderCollections.length);

    folderCollections.forEach(col => {

        const dir = path.join(ROOT, col.folder);

        if (!fs.existsSync(dir)) {
            check(`${col.folder} — папка існує`, false, "немає");
            return;
        }

        const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
        const broken = files
            .map(f => ({ f, reason: slugProblem(f.replace(/\.json$/, "")) }))
            .filter(x => x.reason);

        check(`${col.folder} — усі ${files.length} імен безпечні`,
            broken.length === 0,
            broken.map(x => `${x.f}: ${x.reason}`).join(" | "));

    });
}

console.log("\n[3] Немає дублів-«привидів» після зіпсованого розпакування");
{
    // зіпсована копія й оригінал живуть поруч і виглядають як дві різні
    // акції; розкодовуємо #U04xx назад і шукаємо збіги
    const decode = s => s.replace(/#U([0-9A-Fa-f]{4})/g,
        (_, hex) => String.fromCharCode(parseInt(hex, 16)));

    folderCollections.forEach(col => {

        const dir = path.join(ROOT, col.folder);
        if (!fs.existsSync(dir)) return;

        const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
        const seen = new Map();
        const dups = [];

        files.forEach(f => {
            const key = decode(f).toLowerCase();
            if (seen.has(key)) dups.push(`${seen.get(key)} ↔ ${f}`);
            else seen.set(key, f);
        });

        check(`${col.folder} — немає пар «оригінал + зіпсована копія»`,
            dups.length === 0, dups.join(" | "));

    });
}

console.log("\n[4] Сторожа вбудована в сборщики, а не лише в тест");
{
    const builders = [
        "build-promotions.js",
        "build-products.js",
        "build-categories.js",
        "build-collections.js",
        "build-promo-popups.js"
    ];

    builders.forEach(b => {
        const src = fs.readFileSync(path.join(ROOT, "scripts", b), "utf8");
        check(`${b} використовує filterSafeEntryFiles`,
            src.includes("filterSafeEntryFiles("), "не підключено");
    });

    // биті файли не потрапляють у зібраний JSON, але про них є ::error::
    const logs = [];
    const origErr = console.error;
    console.error = m => logs.push(String(m));
    const { safe, skipped } = filterSafeEntryFiles(
        ["ok-one.json", "#U0431#U0456.json", "bad name.json"], "data/test");
    console.error = origErr;

    check("нормальний файл лишився", safe.length === 1 && safe[0] === "ok-one.json", safe.join(","));
    check("обидва биті пропущені", skipped.length === 2, skipped.length);
    check("є анотація ::error:: для GitHub Actions",
        logs.some(l => l.startsWith("::error::")), logs.length);
}

console.log("\n[5] Зібрані data/*.json не тягнуть битих slug");
{
    const aggregates = [
        "data/promotions.json",
        "data/collections.json",
        "data/promo-popups.json",
        "data/products.json"
    ];

    aggregates.forEach(rel => {

        const p = path.join(ROOT, rel);
        if (!fs.existsSync(p)) return;

        const raw = JSON.parse(fs.readFileSync(p, "utf8"));
        const items = Array.isArray(raw) ? raw : (raw.products || raw.items || []);
        const bad = items
            .filter(x => x && typeof x.slug === "string" && slugProblem(x.slug));

        check(`${rel} — усі slug безпечні`, bad.length === 0,
            bad.map(x => x.slug).join(" | "));

        check(`${rel} — немає слідів #U04xx`,
            !MANGLED_RE.test(fs.readFileSync(p, "utf8")));

    });
}

console.log("\n[6] Посилання на акцію будуються з кодуванням slug");
{
    const promoJs = fs.readFileSync(path.join(ROOT, "assets/js/promo.js"), "utf8");
    const sitemapJs = fs.readFileSync(path.join(ROOT, "scripts/build-sitemap.js"), "utf8");
    const appJs = fs.readFileSync(path.join(ROOT, "assets/js/app.js"), "utf8");

    const rawUse = /promo\?id=\$\{(?!encodeURIComponent)/;

    check("promo.js: canonical-адреса кодує slug", !rawUse.test(promoJs),
        (promoJs.match(/promo\?id=\$\{[^}]*\}/g) || []).join(" | "));
    check("build-sitemap.js: адреса в sitemap кодує slug", !rawUse.test(sitemapJs),
        (sitemapJs.match(/promo\?id=\$\{[^}]*\}/g) || []).join(" | "));
    check("app.js: усі посилання кодують slug", !rawUse.test(appJs));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
