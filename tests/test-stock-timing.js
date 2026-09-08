// Наявність не тримає сторінку товару.
//
// ЩО ЗАМІРЯНО на проді (телефон 390×844):
//
//   first-contentful-paint    576 мс   ← статична розмітка вже видна
//   stock_live (Supabase)     585 → 1235 мс  (650 мс)
//   LCP                      1460 мс   ← JS перемалював після залишку
//
// Товар був на екрані на 576-й мілісекунді, фото готове з 538-ї — а
// сторінка чекала базу й перемальовувалась. Наявність коштувала
// ~900 мс LCP на кожне відкриття.
//
// І окремо: кешу знімка не було зовсім. Заміряно 7538 байт за 590 мс,
// тобто людина, яка подивилась п'ять товарів, платила ці 600 мс
// п'ять разів.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. Сторінка малюється, не чекаючи на базу.
// 2. Знімок читається з кеша СИНХРОННО — тоді наявність правильна вже
//    в першому кадрі (друга й далі сторінка за хвилину).
// 3. Свіжий знімок оновлює САМЕ наявність, а не всю сторінку: інакше
//    блимали б фото й ціна, а CLS перестав би бути нулем.
// 4. Обіцянка «не показуємо чужу наявність» лишається: оновлення
//    доходить до всіх місць, які її показують.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const productSrc = read("assets/js/product.js");
const stockSrc = read("assets/js/live-stock.js");

console.log("\n[1] Рендер не чекає на базу");
{
    const init = productSrc.slice(0, productSrc.indexOf("} catch (error) {"));

    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ: LiveStock.load() повертається в
    // Promise.all перед першим малюванням — і LCP знову виростає на
    // 900 мс, причому непомітно: сторінка виглядає так само.
    check("LiveStock.load() не в Promise.all перед рендером",
        !/Promise\.all\(\[[\s\S]{0,600}LiveStock\.load\(\)/.test(init),
        (init.match(/Promise\.all\(\[[\s\S]{0,80}/) || [])[0]);

    check("await лишився тільки на самих товарах",
        /const list = await \(embedded/.test(init));

    // Знімок із кеша — синхронно, ДО малювання: тоді наявність
    // правильна вже в першому кадрі.
    check("кеш читається синхронно перед рендером",
        /const live = window\.LiveStock && window\.LiveStock\.cached/.test(init));

    check("і застосовується до товарів",
        /if \(live && window\.LiveStock\) window\.LiveStock\.apply\(products, live\)/.test(init));

    // А свіжий — після того, як сторінка на екрані.
    check("свіжий знімок береться після рендеру",
        init.indexOf("renderProduct(product)") < init.indexOf("window.LiveStock.load().then"));

    check("і нічого не робить, якщо не змінилось",
        /const changed = window\.LiveStock\.apply\(products, fresh\)[\s\S]{0,200}if \(!changed\) return/.test(init));
}

console.log("\n[2] Оновлюється наявність, а не вся сторінка");
{
    // Повна перемальовка означала б блимання фото й ціни та CLS > 0.
    check("є націлене оновлення", /function applyLiveStockToPage\(product\)/.test(productSrc));

    const fn = productSrc.slice(
        productSrc.indexOf("function applyLiveStockToPage"),
        productSrc.indexOf("// Розміри цього кольору"));

    check("не перемальовує сторінку", !/innerHTML/.test(fn));

    check("оновлює стан кольору", /page\.dataset\.colorPreorder = preOrder \? "1" : "0"/.test(fn));

    check("оновлює перекреслені розміри", /classList\.toggle\("size-out", isOut\)/.test(fn));

    // Свотчі несуть перелік розпроданих розмірів КОЖНОГО кольору —
    // його читає перемикач кольору в common.js.
    check("оновлює дані свотчів", /swatch\.dataset\.outSizes = JSON\.stringify\(out\)/.test(fn));

    check("і data-page-view теж", /swatch\.dataset\.pageView = JSON\.stringify\(pageColorView/.test(fn));

    check("і кличе спільний перемальовувач", /refreshAvailability\(\);/.test(fn));
}

console.log("\n[3] Знімок живе між сторінками");
{
    check("є синхронне читання кеша", /function cached\(\)/.test(stockSrc));

    check("кеш пишеться після успішного запиту",
        /fetchLive\(\)\.then\(function \(map\) \{[\s\S]{0,120}remember\(map\)/.test(stockSrc));

    // sessionStorage, а не localStorage: кеш мусить померти разом із
    // вкладкою, інакше наступного дня людина побачила б учорашню
    // наявність.
    // Перевіряємо КОД, а не коментарі: слово localStorage згадується
    // в поясненні, чому його тут немає.
    const stockCode = stockSrc
        .split(String.fromCharCode(10))
        .filter(line => !line.trim().startsWith("//"))
        .join(" ");

    check("sessionStorage, не localStorage",
        /root\.sessionStorage/.test(stockCode) && !/localStorage/.test(stockCode));

    check("строк життя — хвилина", /CACHE_MS = 60000/.test(stockSrc));

    // Живий модуль: перевіряємо поведінку, а не текст.
    // runScripts потрібен, щоб window.eval виконувався в контексті
    // вікна: без нього модуль не додає LiveStock у window.
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
        url: "https://bestbrnd4u.com/",
        runScripts: "outside-only"
    });

    const { window } = dom;

    window.eval(stockSrc);

    check("без кеша повертає null", window.LiveStock.cached() === null);

    // Кладемо свіжий знімок так, як його пише сам модуль.
    window.sessionStorage.setItem("live-stock", JSON.stringify({
        at: Date.now(),
        rows: [["7|Чорний|M", true], ["7|Чорний|L", false]]
    }));

    const fresh = window.LiveStock.cached();

    check("свіжий кеш читається", fresh instanceof window.Map && fresh.size === 2,
        fresh && fresh.size);

    check("значення збереглись", fresh.get("7|Чорний|M") === true
        && fresh.get("7|Чорний|L") === false);

    // Старий знімок — це не знімок.
    window.sessionStorage.setItem("live-stock", JSON.stringify({
        at: Date.now() - 120000,
        rows: [["7|Чорний|M", true]]
    }));

    check("прострочений кеш не читається", window.LiveStock.cached() === null);

    // Зіпсований JSON не має нічого ламати: журнал наявності не
    // сильніший за саму сторінку.
    window.sessionStorage.setItem("live-stock", "{зламано");

    check("зіпсований кеш не ламає сторінку", window.LiveStock.cached() === null);
}

console.log("\n[4] «Схожі» теж бачать справжню наявність");
{
    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ: раніше сюди передавався знімок,
    // захоплений на початку init(). Тепер на першій сторінці вкладки
    // там null — і картки «схожих» показували б наявність зі збірки.
    check("знімок береться в момент показу",
        /const live = await window\.LiveStock\.load\(\)/.test(productSrc));

    check("і застосовується до каталогу",
        /showRelated[\s\S]{0,1400}window\.LiveStock\.apply\(products, live\)/.test(productSrc));

    check("захопленого знімка більше не передаємо",
        !/showRelated\(product, live\)/.test(productSrc));
}

console.log(failures ? `\n❌ Провалено: ${failures}` : "\n✅ Наявність не тримає сторінку, а знімок не питається двічі");

process.exit(failures ? 1 : 0);
