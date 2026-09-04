// Пошук товару за артикулом у списку «Товари».
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Власник вводив у пошук списку товарів «20» — і товар з артикулом 20
// не знаходився. Причина не в налаштуваннях: вбудований пошук Decap
// зіставляє запит нечітко, а потім відкидає все, що набрало не більше
// п'яти балів. Бали залежать від ДОВЖИНИ ЗАПИТУ:
//
//     1 символ  →  максимум 1        3 символи →  11
//     2 символи →  максимум 4        4 символи →  26
//
// Тобто запит із одного-двох символів не проходить порогу НІКОЛИ, і
// артикули з 1 по 99 були недосяжні всі до одного. Порог є і в
// найсвіжішій версії рушія, тож оновлення не допомогло б.
//
// Друга частина тієї ж історії: артикул кольору («20-1») вбудований
// пошук не знайде навіть довшим запитом — його немає в тексті, за яким
// той шукає (виведена назва плюс змінні з summary).
//
// ГОЛОВНІ ВИМОГИ, ЯКІ СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// --------------------------------------------
// 1. Артикул товару й артикул кольору знаходяться ТОЧНО, без нечіткості.
// 2. Заводський код постачальника за артикул не сприймається — для
//    нього вбудований пошук працює, і дублювати його не потрібно.
// 3. Смужка з'являється лише в списку товарів і лише на запит-артикул.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const src = read("admin/article-search.js");
const adminIndex = read("admin/index.html");
const configYml = read("admin/config.yml");
const products = JSON.parse(read("data/products.json"));

// Беремо САМІ функції з коду, а не їхні копії.
const env = new Function("hashRef", `
    var location = { get hash() { return hashRef.value; } };
    ${src.match(/var ARTICLE = [^\n]+/)[0]}
    ${src.match(/function onProductsList\(\)[\s\S]*?\n    \}/)[0]}
    ${src.match(/function findByArticle\([\s\S]*?\n    \}/)[0]}
    ${src.match(/function editUrl\([\s\S]*?\n    \}/)[0]}
    return { ARTICLE: ARTICLE, onProductsList: onProductsList, findByArticle: findByArticle, editUrl: editUrl };
`);

const hashRef = { value: "" };
const api = env(hashRef);

console.log("\n[1] Що вважається артикулом");
{
    const артикули = ["1", "20", "95", "100", "20-1", "20-12", "123456"];
    const не = ["", "H153L01SP22-002", "MK7558", "сумка", "20-", "-1", "20-1-2", "1234567", "20 1"];

    const промах = артикули.filter(t => !api.ARTICLE.test(t));
    check("номер товару й номер кольору — артикули", промах.length === 0, промах.join(", "));

    // Заводський код постачальника НЕ артикул: він довгий, і вбудований
    // пошук його знаходить сам.
    const зайве = не.filter(t => api.ARTICLE.test(t));
    check("заводський код і текст за артикул не сприймаються", зайве.length === 0, зайве.join(", "));
}

console.log("\n[2] Працює лише в списку товарів");
{
    const так = ["#/collections/products", "#/collections/products/", "#/collections/products/search/20"];
    const ні = [
        "#/collections/promotions",
        "#/collections/products/entries/some-slug",   // це вже редактор товару
        "#/collections/products/new",
        "#/search/20",                                 // загальний пошук по всіх колекціях
        ""
    ];

    const промах = так.filter(h => { hashRef.value = h; return !api.onProductsList(); });
    check("у списку товарів — так", промах.length === 0, промах.join(", "));

    const зайве = ні.filter(h => { hashRef.value = h; return api.onProductsList(); });
    check("в інших місцях — ні", зайве.length === 0, зайве.join(", "));
}

console.log("\n[3] Точне попадання на СПРАВЖНІХ даних");
{
    // Товар 20 узятий не навмання: саме його артикул власник шукав.
    const товар20 = products.find(p => p.id === 20);
    check("товар з артикулом 20 існує", !!товар20 && String(товар20.article) === "20",
        товар20 && товар20.article);

    const заТоваром = api.findByArticle(products, "20");
    check("артикул товару знаходить рівно один товар",
        заТоваром.length === 1 && заТоваром[0].product.id === 20,
        заТоваром.map(h => h.product.id).join(", "));
    check("колір при цьому не вказаний", заТоваром[0] && заТоваром[0].color === "");

    const заКольором = api.findByArticle(products, "20-1");
    check("артикул кольору знаходить той самий товар",
        заКольором.length === 1 && заКольором[0].product.id === 20,
        заКольором.map(h => h.product.id).join(", "));
    check("і називає колір", заКольором[0] && !!заКольором[0].color, заКольором[0] && заКольором[0].color);

    check("неіснуючий артикул не дає нічого",
        api.findByArticle(products, "999999").length === 0);

    // Пошук ТОЧНИЙ: «2» не мусить приводити товар 20.
    check("пошук точний, а не за початком номера",
        api.findByArticle(products, "2").every(h => String(h.article) === "2"));

    // Посилання мусить вести в редактор саме цього товару.
    check("посилання веде в редактор товару",
        api.editUrl(товар20) === "#/collections/products/entries/" + encodeURIComponent(товар20.slug),
        api.editUrl(товар20));
}

console.log("\n[4] Кожен артикул у каталозі знаходиться");
{
    // Регресія навпаки: якщо збірка колись перестане ставити артикули,
    // пошук стане беззмістовним, і хочеться дізнатись про це тут.
    const без = products.filter(p => !p.article);
    check("у всіх товарів є артикул", без.length === 0, без.length + " без артикула");

    const ненайдені = products.filter(p => {
        const hits = api.findByArticle(products, String(p.article));
        return !hits.some(h => h.product.id === p.id);
    });
    check("кожен артикул товару знаходиться", ненайдені.length === 0,
        ненайдені.slice(0, 3).map(p => p.article).join(", "));

    const кольори = products.flatMap(p => (p.variants || [])
        .filter(v => v && v.article)
        .map(v => ({ id: p.id, article: v.article })));
    const ненайденіКольори = кольори.filter(v =>
        !api.findByArticle(products, v.article).some(h => h.product.id === v.id));
    check("кожен артикул кольору знаходиться",
        ненайденіКольори.length === 0,
        `${кольори.length} кольорів, не знайдено ${ненайденіКольори.length}`);
}

console.log("\n[5] Підключення в адмінці");
{
    check("файл підключений", /article-search\.js/.test(adminIndex));

    // Список товарів бере з catalog-tree.js — тож той мусить іти ВИЩЕ.
    check("підключений ПІСЛЯ catalog-tree.js",
        adminIndex.indexOf("catalog-tree.js") < adminIndex.indexOf("article-search.js"));

    check("список товарів береться з catalog-tree, а не своїм fetch",
        /window\.CatalogTree/.test(src) && !/fetch\(/.test(src));
}

console.log("\n[6] Пояснення на місці, щоб не наступити знову");
{
    // Коментар біля search_fields раніше стверджував, що саме він
    // вирішує пошук по номеру. Це неправда, і на цьому вже стояла
    // хибна впевненість — тому перевірка стежить, щоб твердження не
    // повернулось.
    check("біля search_fields більше немає хибного твердження",
        !/без цього рядка Decap шукає лише по/i.test(configYml));

    check("сказано, що для папкової колекції search_fields не читається",
        /search_fields він при цьому не читає/.test(configYml));

    // Числа в шапці файлу — це виміри, і саме вони об'ясняють причину.
    check("у файлі описано, чому короткий запит не проходить",
        /score \} \) => score > 5|score \}\) => score > 5|score > 5/.test(src) && /2 символи/.test(src));
}

console.log("\n[7] Смужка справді малюється");
(async () => {
    const { JSDOM } = require("jsdom");

    const запустити = async (hash, значенняПоля) => {
        const dom = new JSDOM(
            "<!doctype html><body><div><input type='search' placeholder='Search'></div></body>",
            { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/admin/" + hash });
        const { window } = dom;
        window.document.querySelector("input").value = значенняПоля;
        // Список товарів приходить звідти ж, звідки в адмінці.
        window.CatalogTree = { loadProducts: () => Promise.resolve(products) };
        window.eval(src);
        // refresh() асинхронний — чекаємо мікрозадачі промісу.
        await new Promise(r => window.setTimeout(r, 0));
        return window.document;
    };

    {
        const d = await запустити("#/collections/products/search/20", "20");
        const panel = d.getElementById("articleSearchPanel");
        check("на запит «20» смужка з'явилась", !!panel);

        const link = panel && panel.querySelector("a");
        check("у смужці є посилання на редактор",
            !!link && link.getAttribute("href") === "#/collections/products/entries/"
                + encodeURIComponent(products.find(p => p.id === 20).slug),
            link && link.getAttribute("href"));
        check("у підписі видно артикул і назву",
            !!link && /№20\s·/.test(link.textContent), link && link.textContent.slice(0, 50));
    }

    {
        const d = await запустити("#/collections/products/search/20-2", "20-2");
        const link = d.querySelector("#articleSearchPanel a");
        check("артикул кольору теж дає посилання", !!link);
        check("і в підписі названий колір", !!link && /колір «/.test(link.textContent),
            link && link.textContent.slice(0, 60));
    }

    {
        const d = await запустити("#/collections/products/search/999999", "999999");
        const panel = d.getElementById("articleSearchPanel");
        check("на неіснуючий артикул смужка каже, що такого немає",
            !!panel && /такого немає/.test(panel.textContent) && !panel.querySelector("a"));
    }

    {
        // Не артикул — смужки бути не мусить, щоб не мозолила очі при
        // звичайному пошуку за назвою.
        const d = await запустити("#/collections/products/search/сумка", "сумка");
        check("на текстовий запит смужки немає", !d.getElementById("articleSearchPanel"));
    }

    {
        const d = await запустити("#/collections/promotions", "20");
        check("в іншій колекції смужки немає", !d.getElementById("articleSearchPanel"));
    }

    console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");
    process.exit(failures ? 1 : 0);
})();
