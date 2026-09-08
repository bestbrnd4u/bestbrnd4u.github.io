// Чи доїхали зміни на dev — одна команда замість трьох перевірок.
//
// НАВІЩО ЦЕ ПОТРІБНО
// -------------------
// Між `git push` і видимою зміною на dev.bestbrnd4u.com стоять три
// кроки: перезбірка в GitHub Actions, публікація в Cloudflare Pages і
// кеш на краю Cloudflare. Кожен зі своїм часом, і поки хоч один не
// відпрацював, сторінка виглядає незміненою.
//
// Через це «зміни не поїхали» майже завжди означає одне з трьох:
//
//   1. збірка ще йде (або впала);
//   2. Pages ще не опублікував;
//   3. край віддає сторінку з кеша — а Ctrl+F5 його не чіпає, бо кеш
//      стоїть НЕ в браузері.
//
// Розрізнити їх на око неможливо, тому скрипт питає прямо: який
// відбиток збірки лежить на dev, який у гілці, і що каже край.
//
// ЗАПУСК
//   npm run check:dev
//   npm run check:dev -- --prod     (те саме про бестбренд основний)
//
// Мережа тут потрібна, тож у тестах цей файл не запускається — його
// перевіряють читанням (tests/test-cache.js).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const PROD = process.argv.includes("--prod");

const HOST = PROD ? "bestbrnd4u.com" : "dev.bestbrnd4u.com";

// Сторінка для перевірки: каталог є в обох середовищах і в ньому є
// і стилі, і скрипти з відбитками.
const PAGE = "/catalog";

// Випадковий параметр дає ІНШИЙ ключ кеша, тож відповідь приходить із
// джерела навіть тоді, коли на краю лежить стара копія. Саме тому
// перевірка відбитка й перевірка кеша — два окремі запити.
const BUST = "x=" + Date.now();

function say(line) {
    console.log(line);
}

// Відбиток, який збірка проставила стилям (scripts/apply-cache-version.js).
function stampOf(html) {

    const found = String(html).match(/style\.css\?v=([a-f0-9]+)/);

    return found ? found[1] : "";

}

async function fetchText(url) {

    const response = await fetch(url, { redirect: "follow" });

    return { status: response.status, headers: response.headers, body: await response.text() };

}

async function main() {

    const localFile = path.join(ROOT, "catalog.html");

    if (!fs.existsSync(localFile)) {
        say("Не знайшов catalog.html — запускати треба з теки проєкту.");
        process.exit(1);
    }

    const local = stampOf(fs.readFileSync(localFile, "utf8"));

    say("");
    say(`Перевіряю ${HOST}${PAGE}`);
    say("");

    let fresh;

    try {

        fresh = await fetchText(`https://${HOST}${PAGE}?${BUST}`);

    } catch (error) {

        say(`  ✗ не відповідає: ${error.message}`);
        say("");
        say("    Якщо це dev — гляньте Cloudflare → Workers & Pages →");
        say("    проєкт dev → Deployments: можливо, публікація ще йде.");
        process.exit(1);

    }

    const remote = stampOf(fresh.body);

    say(`  відбиток збірки в гілці:  ${local || "не знайшов"}`);
    say(`  відбиток збірки на сайті: ${remote || "не знайшов"}`);
    say("");

    if (remote && local && remote === local) {

        say("  ✓ збірка доїхала — на сайті те саме, що в гілці");

    } else if (!remote) {

        say("  ✗ на сторінці немає відбитка стилів — щось із збіркою");

    } else {

        say("  ⏳ збірка ще не доїхала");
        say("");
        say("     Порядок такий: GitHub → Actions → «Build dev environment»");
        say("     (2–4 хв, і вона робить ДРУГИЙ коміт у гілку), потім");
        say("     Cloudflare Pages публікує його (1–2 хв).");

    }

    // А тепер те саме БЕЗ обходу кеша — щоб побачити, що віддають людям.
    say("");

    const asIs = await fetchText(`https://${HOST}${PAGE}`);

    const cache = asIs.headers.get("cf-cache-status") || "—";
    const age = asIs.headers.get("age");
    const control = asIs.headers.get("cache-control") || "—";

    say(`  край віддає:  cf-cache-status: ${cache}` + (age ? `, вік ${age} с` : ""));
    say(`  cache-control: ${control}`);

    const cachedStamp = stampOf(asIs.body);

    if (cache === "HIT" && cachedStamp && remote && cachedStamp !== remote) {

        say("");
        say("  ⚠️  Край віддає СТАРУ сторінку з кеша, хоч на джерелі вже нова.");
        say(`      У кеші відбиток ${cachedStamp}, на джерелі ${remote}.`);
        say("");

        if (PROD) {
            say("      На проді кеш чиститься сам після виливки");
            say("      (scripts/purge-cache.js). Якщо не почистився —");
            say("      гляньте крок «Purge Cloudflare cache» у Actions.");
        } else {
            say("      Dev ніхто не чистить: правило кешу Cloudflare діє на");
            say("      всю зону. Щоб цього не було, додайте у Правило 2");
            say("      умову домену — див. docs/КЕШ.md:");
            say("");
            say('          and (http.host eq "bestbrnd4u.com")');
        }

        say("");
        say(`      Подивитись свіже просто зараз: https://${HOST}${PAGE}?x=1`);

    } else if (cache === "HIT") {

        say("");
        say("  ✓ у кеші лежить та сама сторінка, що на джерелі");

    }

    say("");

}

if (require.main === module) {
    main().catch(error => {
        console.error("Не вдалося перевірити:", error.message);
        process.exit(1);
    });
}

module.exports = { stampOf };
