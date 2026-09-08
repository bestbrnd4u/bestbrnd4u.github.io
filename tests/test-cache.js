// Кеш на краю Cloudflare: щоб зміни доїжджали, а залишки не застигали.
//
// ЧОМУ ЦЕ ТЕСТ, ЯКЩО ПРАВИЛА В ПАНЕЛІ
// ------------------------------------
// Самі правила справді в панелі Cloudflare, і код їх не бачить. Але
// вони СПИРАЮТЬСЯ на дві властивості сайту, які живуть у коді, і
// щойно котрась зникне — правило почне робити шкоду молча:
//
//   1. Адреси сторінок не містять точки. На цьому тримається вираз
//      правила «це сторінка, її можна кешувати на дві години».
//      З'явиться товар зі точкою в адресі — його сторінка перестане
//      кешуватись (дрібниця). А от якби вираз лишився старим
//      («будь-який шлях»), під двогодинний кеш потрапили б залишки:
//      заміряно на проді — /data/catalog.json віддавався з
//      max-age=7200, тобто розпроданий товар показувався б наявним
//      до двох годин.
//
//   2. Після виливки кеш скидається. Інакше край ще дві години
//      віддає стару сторінку — рівно на це ми й натрапили: у main
//      усе на місці, файли на Pages нові, а на сайті змін немає
//      (cf-cache-status: HIT, Age: 2883).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

console.log("\n[1] Адреси сторінок не містять точки");
{
    // Саме це відрізняє сторінку від файлу у виразі правила. Беремо
    // РЕАЛЬНІ теки сторінок — те, що покупець побачить в адресі.
    const dirs = ["p", "brands", "categories", "departments"];

    const dotted = [];
    let counted = 0;

    dirs.forEach(dir => {

        const full = path.join(ROOT, dir);

        if (!fs.existsSync(full)) return;

        fs.readdirSync(full, { withFileTypes: true }).forEach(entry => {

            if (!entry.isDirectory()) return;

            counted++;

            if (entry.name.includes(".")) dotted.push(`${dir}/${entry.name}`);

        });

    });

    check(`сторінок у теках: ${counted}`, counted > 100);

    check("жодної точки в адресі сторінки", dotted.length === 0,
        dotted.slice(0, 3).join(", "));

    // Слаги майбутніх товарів теж: перевіряємо джерела, а не збірку.
    const srcDir = path.join(ROOT, "data", "products");

    if (fs.existsSync(srcDir)) {

        const bad = fs.readdirSync(srcDir)
            .filter(f => f.endsWith(".json"))
            .map(f => {
                try {
                    return JSON.parse(fs.readFileSync(path.join(srcDir, f), "utf8")).slug || "";
                } catch (error) {
                    return "";
                }
            })
            .filter(slug => slug.includes("."));

        check("жоден slug товару не містить точки", bad.length === 0, bad.slice(0, 3).join(", "));

    }

    // А ось файли — навпаки, ЗАВЖДИ з точкою: інакше вони потраплять
    // під правило для сторінок.
    ["data/catalog.json", "data/products.json", "sitemap.xml", "feed.xml",
        "robots.txt", "llms.txt"].forEach(file => {

        check(`${file} має розширення (не потрапить під правило сторінок)`,
            path.basename(file).includes("."));

    });
}

console.log("\n[2] Документ описує правило, яке не чіпає дані");
{
    const doc = read("docs/КЕШ.md");

    check("документ є", doc.length > 500);

    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ: у першій редакції стояв вираз
    // `path contains "/"`, який збігається з УСІМ, включно з
    // /data/*.json.
    check("вираз більше не «будь-який шлях»",
        !/path contains "\/"\)/.test(doc),
        (doc.match(/path contains "\/"\)[^|]*/) || [])[0]);

    check("вираз відсікає файли за точкою",
        /not http\.request\.uri\.path contains "\."/.test(doc));

    check("і виключає адмінку",
        /starts_with\(http\.request\.uri\.path, "\/admin"\)/.test(doc));

    check("сказано, чому саме точка", /Чому вираз саме про точку в адресі/.test(doc));

    check("залишки й ціни згадані як те, що кешувати надовго не можна",
        /Не кешувати `\/data\/\*\.json` надовго/.test(doc));
}

console.log("\n[3] Після виливки кеш скидається сам");
{
    const purge = read("scripts/purge-cache.js");
    const deploy = read(".github/workflows/deploy-pages.yml");

    check("є крок очищення", /purge_cache/.test(purge));

    check("викликається у виливці", /scripts\/purge-cache\.js/.test(deploy));

    // ПОРЯДОК: очищення мусить іти ПІСЛЯ деплою, інакше край
    // покладе собі стару сторінку знову.
    check("і саме ПІСЛЯ деплою",
        deploy.indexOf("actions/deploy-pages") < deploy.indexOf("purge-cache.js"));

    // Без ключа — попередження, а не червоний деплой: сторінка вже
    // вилита, і валити через кеш успішну виливку не можна.
    check("без ключа лише попереджає",
        /notConfigured\("Немає ключа Cloudflare/.test(purge));

    check("і не падає ніколи", !/process\.exit\(1\)/.test(purge));

    check("крок не робить деплой червоним",
        /continue-on-error: true[\s\S]{0,300}purge-cache\.js/.test(deploy));

    // Права токена: рівно одне вміння.
    check("документація просить лише право Cache Purge",
        /Zone → \*\*Cache Purge\*\*/.test(read("docs/КЕШ.md")));

    check("обидва секрети названі",
        /CLOUDFLARE_API_TOKEN/.test(deploy) && /CLOUDFLARE_ZONE_ID/.test(deploy));
}

console.log("\n[4] Відповідь Cloudflare розбирається правильно");
{
    const { purgeVerdict } = require("../scripts/purge-cache.js");

    check("успіх", purgeVerdict(200, { success: true }).ok === true);

    // Найчастіша причина відмови: у токена немає права Cache Purge.
    const noRights = purgeVerdict(403, { errors: [{ code: 10000, message: "Authentication error" }] });

    check("немає прав — сказано прямо", noRights.ok === false
        && /немає прав/.test(noRights.reason), noRights.reason);

    const wrongZone = purgeVerdict(404, { errors: [] });

    check("не та зона — сказано, що перевірити", wrongZone.ok === false
        && /CLOUDFLARE_ZONE_ID/.test(wrongZone.reason), wrongZone.reason);

    check("порожня відповідь не ламає розбір", purgeVerdict(500, null).ok === false);

    check("success:false — не успіх", purgeVerdict(200, { success: false }).ok === false);
}

console.log("\n[5] Відбитки в адресах — те, на чому тримається правило 1");
{
    // Правило «файли на рік» безпечне ЛИШЕ тому, що адреса змінюється
    // разом із файлом. Зникнуть відбитки — і покупці роками сидітимуть
    // на старому коді.
    check("відбитки ставить збірка", /\?v=/.test(read("scripts/apply-cache-version.js")));

    check("і фото теж", /clean\}\?v=\$\{v\}/.test(read("scripts/build-products.js")));

    check("крок є в npm run build", /apply-cache-version\.js/.test(read("package.json")));

    // Правило діє лише на адреси з v= — фото з адмінки без відбитка
    // під нього не потрапить і оновиться як звичайно.
    check("правило обмежене адресами з відбитком",
        /http\.request\.uri\.query contains "v="/.test(read("docs/КЕШ.md")));
}

console.log(failures ? `\n❌ Провалено: ${failures}` : "\n✅ Кеш: зміни доїжджають, залишки не застигають");

process.exit(failures ? 1 : 0);
