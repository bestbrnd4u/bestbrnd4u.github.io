// Рік у знаку охорони прав не має старіти мовчки.
//
// ЗНАЙДЕНО 25.09.2026
// -------------------
// У розмітці 154 сторінок стояло «© 2026» — двічі на кожній: у
// видимому підвалі й у <meta name="copyright">. Жоден крок збірки його
// не чіпав. Тобто 1 січня весь сайт почав би представлятись минулим
// роком і робив би це, доки хтось не згадає.
//
// Це та сама порода помилки, від якої вже страхує priceValidUntil у
// assets/js/product-offer.js: дата, записана руками, рано чи пізно
// стає неправдою мовчки. Різниця лише в тому, що ту побачить Google,
// а цю — покупець, який вирішить, що магазин покинули.
//
// ЧОМУ ТЕСТ НЕ ПИТАЄ «ЧИ РІК ДОРІВНЮЄ ПОТОЧНОМУ»
// ----------------------------------------------
// Бо CI ганяє npm test БЕЗ збірки (див. .github/workflows/tests.yml).
// Перевірка «рік = поточний» стала б червоною 1 січня на кожному
// чужому PR, хоч код цілком справний — просто сторінки ще не
// перезібрані. Тест, який гарантовано бреше один день на рік, вчить
// не вірити тестам.
//
// Тому питаємо три інші речі, жодна з яких від дати не залежить:
//   [1] крок збірки СПРАВДІ переписує рік — перевіряємо виконанням;
//   [2] усі сторінки називають ОДИН рік — саме так злітають правила,
//       застосовані нерівно;
//   [3] рік не з майбутнього і не старіший за рік — це вже не
//       новорічне вікно, а поламаний механізм.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// Усі сторінки сайту, включно зі згенерованими: рік стоїть у підвалі,
// а підвал однаковий скрізь.
function htmlPages(dir, found = []) {

    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {

        if (entry.name === "node_modules" || entry.name === ".git") return;

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) htmlPages(full, found);
        else if (entry.name.endsWith(".html")) found.push(full);

    });

    return found;

}

const YEAR_RE = [
    ["підвал", /©\s*(\d{4})\s*bestbrnd4u/gi],
    ["meta", /<meta name="copyright" content="©\s*(\d{4})/gi]
];

console.log("\n[1] Крок збірки переписує рік, а не лише вміє його прочитати");
{
    // Виконуємо САМУ функцію з build-legal.js над зіпсованою
    // розміткою. Пошук по тексту сказав би лише «рядок про рік десь
    // є» — і пройшов би на функції, яку ніхто не викликає.
    const src = fs.readFileSync(path.join(ROOT, "scripts/build-legal.js"), "utf8");

    const fn = src.match(/function syncCopyrightYear\(html, year\)[\s\S]*?\n}\n/);

    check("syncCopyrightYear знайдено", !!fn);

    if (fn) {

        const sync = new Function(fn[0] + "; return syncCopyrightYear;")();

        const старе = `<meta name="copyright" content="© 2019 BestBrnd4u. Усі права захищено.">`
            + `<p>© 2019 bestbrnd4u. Всі права захищені.</p>`;

        const нове = sync(старе, 2031);

        check("рік у підвалі переписано", /© 2031 bestbrnd4u\./.test(нове), нове.slice(0, 120));
        check("рік у meta переписано", /content="© 2031 BestBrnd4u/.test(нове), нове.slice(0, 120));
        check("старого року не лишилось", !нове.includes("2019"), нове.slice(0, 120));

        // Повторний прогін нічого не міняє — інакше збірка щоразу
        // давала б новий коміт.
        check("повторний прогін нічого не міняє", sync(нове, 2031) === нове);

    }

    // І крок мусить бути ВИКЛИКАНИЙ, а не просто оголошений.
    check("крок викликається в main()", /syncCopyrightYear\(next, year\)/.test(src),
        "оголошена, але нікому не потрібна функція нічого не лагодить");
}

console.log("\n[2] Усі сторінки називають один рік");
{
    const pages = htmlPages(ROOT);

    const years = new Map();

    pages.forEach(file => {
        YEAR_RE.forEach(([, re]) => {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(fs.readFileSync(file, "utf8"))) !== null) {
                const y = m[1];
                if (!years.has(y)) years.set(y, []);
                years.get(y).push(path.relative(ROOT, file));
            }
        });
    });

    console.log(`  · сторінок зі знаком охорони прав: ${new Set([...years.values()].flat()).size} з ${pages.length}`);

    check("знак охорони прав узагалі є", years.size > 0);

    check("рік скрізь один",
        years.size <= 1,
        [...years.entries()].map(([y, files]) => `${y}: ${files.length} (${files[0]})`).join("; "));
}

console.log("\n[3] Рік не з майбутнього і не протух");
{
    const now = new Date().getUTCFullYear();

    const pages = htmlPages(ROOT);

    const found = new Set();

    pages.forEach(file => {
        const html = fs.readFileSync(file, "utf8");
        YEAR_RE.forEach(([, re]) => {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(html)) !== null) found.add(Number(m[1]));
        });
    });

    const роки = [...found];

    check("рік не з майбутнього", роки.every(y => y <= now), роки.join(", ") + " проти " + now);

    // Рівно один рік запасу: 1 січня сторінки ще не перезібрані, і це
    // нормально. Два роки — це вже не новорічне вікно.
    check(`рік не старіший за ${now - 1}`, роки.every(y => y >= now - 1),
        роки.join(", ") + " проти " + now);
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
