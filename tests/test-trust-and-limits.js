// Блок довіри на сторінці товару і межа кількості в кошику.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. НА СТОРІНЦІ ТОВАРУ СКАЗАНО ПРО ОРИГІНАЛЬНІСТЬ. У каталозі 95
//    товарів зі 100 коштують 3 000-15 000 ₴ і несуть логотипи Gucci,
//    Prada, Coach. Головне заперечення покупця тут не ціна, а «чи це
//    не підробка» — а на сторінці товару про походження не було ані
//    слова.
//
// 2. БЛОК НЕ ОБІЦЯЄ БІЛЬШЕ, НІЖ САЙТ. Найлегший спосіб зробити гірше —
//    приписати магазину гарантію, якої він не давав: обіцянку
//    доведеться виконувати. Кожен рядок мусить збігатися з тим, що
//    магазин уже пише на «Байєр-сервісі» й «Поверненні».
//
// 3. КОШИК НЕ ДАЄ НАБРАТИ БІЛЬШЕ, НІЖ Є. Плюс просто дописував рядок,
//    тож можна було взяти п'ять штук того, чого одна. Бізнес-ризику
//    немає (база позначає це stockShort), але покупець дізнавався про
//    проблему від менеджера, а не на сайті.
//
// 4. МЕЖА НЕ ЧІПАЄ ТОВАР ПІД ЗАМОВЛЕННЯ. Возити під замовлення можна
//    будь-яку кількість — це спосіб роботи магазину, а не виняток. І
//    порожній залишок означає «не рахуємо», а не нуль.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const productJs = read("assets/js/product.js");
const cartJs = read("assets/js/cart.js");
const css = read("assets/css/style.css");

console.log("\n[1] Блок довіри є і стоїть там, де його читають");
{
    check("блок є в розмітці товару", /class="trust-box"/.test(productJs));

    check("стилі є", /\.trust-box\{/.test(css));

    // Одразу під смугою доставки й ДО характеристик: людина щойно
    // побачила ціну й кнопку, і саме тут виникає питання про
    // оригінальність. Нижче, під характеристиками, його не читають.
    const delivery = productJs.indexOf('class="delivery-box"');
    const trust = productJs.indexOf('class="trust-box"');
    const specs = productJs.indexOf('id="productSpecifications"');

    check("стоїть після смуги доставки", delivery > 0 && trust > delivery,
        `${delivery} → ${trust}`);

    check("і до характеристик", specs > 0 && trust < specs, `${trust} → ${specs}`);

    check("три рядки, не більше",
        (productJs.match(/class="trust-row"/g) || []).length === 3,
        String((productJs.match(/class="trust-row"/g) || []).length));

    // Значок не має переноситись окремим рядком.
    check("значок не стискається", /\.trust-icon\{[\s\S]{0,120}flex-shrink:0/.test(css));
}

console.log("\n[2] Блок не обіцяє більше, ніж сайт");
{
    const bayer = read("bayer-service.html");
    const returns = read("return-warranty.html");

    // Головна обіцянка: тільки оригінал з офіційних джерел. Те саме
    // слово в слово є на «Байєр-сервісі».
    check("сказано про оригінал", /Тільки оригінал/.test(productJs));

    check("і те саме є на сторінці байєр-сервісу",
        /офіційних сайтів брендів/.test(bayer) && /офіційних сайтів брендів/.test(productJs));

    check("згадано, що без сірого імпорту",
        /сірого імпорту/.test(productJs) && /сірого імпорту/.test(bayer));

    // Строк повернення мусить збігатися: два різні числа гірші за
    // будь-яке з них.
    check("14 днів — і тут, і на сторінці повернення",
        /14 днів/.test(productJs) && /14 днів/.test(returns));

    check("3 робочих дні на кошти — так само",
        /3 робочих дн/.test(productJs) && /3 робочих дн/.test(returns));

    // Обіцянка мусить вести туди, де вона розписана повністю.
    check("веде на байєр-сервіс", /href="bayer-service"/.test(productJs));
    check("веде на умови повернення", /href="return-warranty"/.test(productJs));

    // Чого в блоці бути НЕ повинно: вигаданих гарантій, яких магазин
    // не давав.
    check("немає вигаданих сертифікатів",
        !/сертифікат|експертиз|нотаріальн/i.test(
            (productJs.match(/class="trust-box"[\s\S]{0,1600}?<\/div>\s*`/) || [""])[0]));

    check("немає обіцянки «100%»",
        !/100%/.test((productJs.match(/class="trust-box"[\s\S]{0,1600}/) || [""])[0]));
}

console.log("\n[3] Кошик не дає набрати більше, ніж є");
{
    check("межа рахується окремою функцією",
        /function lineLimit\(id, color, size\)/.test(cartJs));

    check("плюс перевіряє межу",
        /if \(limit !== null && already >= limit\)/.test(cartJs));

    check("і не додає рядок, коли межу досягнуто",
        /already >= limit\) \{[\s\S]{0,400}?return;/.test(cartJs));

    // Покупець мусить дізнатись причину на місці, а не від менеджера
    // через день.
    check("людині кажуть, чому не додалось", /showToast/.test(
        (cartJs.match(/function changeQty[\s\S]{0,900}/) || [""])[0]));

    check("для останньої одиниці текст свій",
        /Це останній екземпляр/.test(cartJs));

    check("інакше називають число", /у наявності \$\{limit\} шт/.test(cartJs));

    // Кількість беремо тим самим модулем, що сайт і адмінка.
    check("залишок читається через Stock",
        /stock\.sizeQty\(stock\.variantStock\(product, variant\)/.test(cartJs));
}

console.log("\n[4] Межа не чіпає того, чого не має чіпати");
{
    // Возити під замовлення можна будь-яку кількість.
    check("товар під замовлення без межі",
        /if \(product\.preOrder\) return null;/.test(cartJs));

    // Порожня клітинка залишку — «не рахуємо», а не нуль
    // (див. docs/ЗАЛИШКИ.md).
    check("непорахований залишок — без межі",
        /typeof have === "number" && have > 0 \? have : null/.test(cartJs));

    check("немає модуля залишків — без межі",
        /if \(!stock\) return null;/.test(cartJs));

    check("товар не знайдено — без межі",
        /if \(!product\) return null;/.test(cartJs));

    // Правило записане в коді, а не лише в тесті.
    check("причина описана в коді",
        /возять будь-яку кількість/.test(cartJs));
}

console.log("\n[5] Підписи пошти під наглядом");
{
    const monitor = read("scripts/monitor.js");

    // З лютого 2024 Gmail і Yahoo вимагають DMARC від усіх, хто
    // розсилає листи. Магазин щойно почав писати покупцям.
    check("моніторинг перевіряє DMARC", /_dmarc\./.test(monitor));

    check("шукає саме політику", /v=DMARC1/.test(monitor));

    // DNS через HTTPS: у CI налаштування системного резолвера
    // невідомі.
    check("запит через DNS-over-HTTPS", /dns\.google\/resolve/.test(monitor));

    // «DNS не відповів» і «запису немає» — різні речі.
    check("недоступний DNS не вважається відсутнім записом",
        /if \(dmarc === null\)/.test(monitor) && /DNS не відповів/.test(monitor));

    // На dev пошта не налаштована й не має бути.
    check("перевіряється лише на проді",
        /if \(INDEXABLE\) \{[\s\S]{0,600}?_dmarc/.test(monitor));

    check("у скарзі названо потрібний запис",
        /немає TXT-запису _dmarc/.test(monitor));
}

console.log("\n[6] lastmod у sitemap");
{
    const sitemapSrc = read("scripts/build-sitemap.js");
    const productsSrc = read("scripts/build-products.js");

    check("журнал дат веде збірка товарів",
        /function stampUpdated\(products\)/.test(productsSrc));

    // У товарах немає поля з датою, а git log і mtime у CI не годяться:
    // клон поверхневий, mtime — час викачування. Тому відбиток змісту.
    check("дата рахується від відбитка змісту",
        /function contentHash\(product\)/.test(productsSrc));

    check("штампи кеша у відбиток не входять",
        /replace\(\/\\\?v=\[0-9a-f\]\+\/g, ""\)/.test(productsSrc));

    check("незмінений товар лишає давню дату",
        /before\.hash === hash/.test(productsSrc));

    check("журнал існує", fs.existsSync(path.join(ROOT, "data/products-updated.json")));

    const log = JSON.parse(read("data/products-updated.json"));

    const entries = Object.values(log);

    check(`у журналі ${entries.length} товарів`, entries.length > 0);

    check("кожен запис має відбиток і дату",
        entries.every(e => e && e.hash && /^\d{4}-\d{2}-\d{2}$/.test(e.date)));

    // Google сам пише, що ігнорує lastmod, якому не довіряє, — а
    // неточна дата гірша за відсутню.
    check("порожня дата в sitemap не пишеться",
        /lastmod \? `    <lastmod>/.test(sitemapSrc));

    const xml = read("sitemap.xml");

    const dates = [...xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map(m => m[1]);

    check(`у sitemap ${dates.length} дат`, dates.length > 0);

    check("усі дати у форматі YYYY-MM-DD",
        dates.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)),
        dates.filter(d => !/^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 3).join(", "));

    // lastmod мусить стояти після <loc> і до <changefreq> — порядок
    // тегів у схемі sitemap фіксований.
    const block = (xml.match(/<url>[\s\S]*?<\/url>/) || [""])[0];

    if (/<lastmod>/.test(block)) {
        check("порядок тегів правильний",
            block.indexOf("<loc>") < block.indexOf("<lastmod>")
            && block.indexOf("<lastmod>") < block.indexOf("<changefreq>"));
    }
}

console.log(failures === 0
    ? "\n✅ Довіра на сторінці товару, межа в кошику, DMARC під наглядом\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
