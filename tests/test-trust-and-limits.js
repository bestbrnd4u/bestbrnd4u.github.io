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
// Саме тут тепер живе правило межі: common.js є на кожній
// сторінці, а cart.js — лише на кошику.
const commonJs = read("assets/js/common.js");
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

console.log("\n[3] Набрати більше, ніж є, не дає ЖОДНА кнопка");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    // ---------------
    // Перевірка межі була лише в кошику, на кнопці «+». А кнопка
    // «Купити» на сторінці товару просто робила cart.push().
    //
    // Заміряно на проді 25.09.2026: у кросівок Lacoste L003 розміру
    // 37 залишок 1. Два кліки «Купити» клали в кошик ДВІ пари без
    // єдиного слова, і лише потім кошик відмовлявся додати третю —
    // тобто ловив уже перейдену межу.
    //
    // Магазин торгує переважно одиничними екземплярами, тож це
    // замовлення, яке нічим виконати.
    check("правило живе в common.js, який є на кожній сторінці",
        /function cartLineLimit\(product, color, size\)/.test(commonJs));

    check("кошик кличе те саме правило, а не свою копію",
        /cartLineLimit\(findProductById\(id\), color, size\)/.test(cartJs)
        && !/stock\.sizeQty\(/.test(cartJs));

    // Обидві кнопки — та сама умова.
    check("плюс у кошику перевіряє межу",
        /if \(limit !== null && already >= limit\)/.test(cartJs));

    check("«Купити» на сторінці товару теж",
        /limit !== null && cartLineCount\(cart, id, color, size\) >= limit/.test(commonJs));

    // Товар мусить читатись ДО push — інакше межу нема з чого рахувати.
    // Саме тому її там і не було.
    check("товар дістається до того, як щось класти в кошик",
        /const product = await getProductById\(id\);[\s\S]{0,200}?const cart = getCart\(\);/
            .test(commonJs));

    check("і не додає рядок, коли межу досягнуто",
        /already >= limit\) \{[\s\S]{0,400}?return;/.test(cartJs)
        && />= limit\) \{[\s\S]{0,400}?return;/.test(commonJs));

    // Покупець мусить дізнатись причину на місці, а не від менеджера
    // через день — і почути те саме, звідки б не натиснув.
    ["останній екземпляр", "у наявності ${limit} шт"].forEach(text => {
        check(`текст «${text}» однаковий в обох місцях`,
            cartJs.includes(text) && commonJs.includes(text));
    });

    // Кількість беремо тим самим модулем, що сайт і адмінка.
    check("залишок читається через Stock",
        /stock\.sizeQty\(stock\.variantStock\(product, variant\)/.test(commonJs));
}

console.log("\n[3b] Про межу видно ДО натискання, а не після");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    // ---------------
    // Кнопка «+» не давала набрати більше, ніж є, — але виглядала
    // звичайною. Людина дізнавалась про межу, лише тицьнувши, а на
    // товарі, якого одна штука, це трапляється з першого ж
    // натискання. А таких товарів 80 із 87 у наявності (92%).
    //
    // Сторінка товару про це вже казала заздалегідь — блок
    // .only-one. Кошик мовчав.
    check("межа рахується там, де малюється рядок",
        /const lineMax = lineLimit\(line\.id, line\.color, line\.size\);/.test(cartJs)
        && /const atMax = lineMax !== null && qty >= lineMax;/.test(cartJs));

    check("кнопка «+» отримує ознаку межі", /qty-plus\$\{atMax \? " is-max" : ""\}/.test(cartJs));

    // ЧОМУ НЕ disabled — вимкнена кнопка мовчить: видно, що не можна,
    // і не зрозуміло чому. Тут вона лишається натискною, і клік
    // показує ту саму причину.
    check("кнопка лишається натискною, а не disabled",
        /aria-disabled="true"/.test(cartJs) && !/qty-plus[^>]*\sdisabled/.test(cartJs));

    check("причина видно й мишею, і диктору",
        /title="\$\{escapeHtml\(maxReason\)\}"/.test(cartJs)
        && /aria-label="\$\{atMax \? escapeHtml\(maxReason\)/.test(cartJs));

    // Один текст на три місця: підказка на кнопці, aria-label і тост
    // після натискання. Розійдуться — людина почує одне, а побачить
    // інше.
    check("текст той самий, що в тості",
        /const maxReason = lineMax === 1[\s\S]{0,160}?Це останній екземпляр[\s\S]{0,160}?у наявності \$\{lineMax\} шт/
            .test(cartJs));

    // Вигляд — стриманий. На 92% товарів червоне читалось би як
    // накрутка терміновості, а не як факт.
    const mark = css.match(/\.qty-btn\.is-max\{([^}]*)\}/);

    check("ознака межі описана в CSS", Boolean(mark), "правила .qty-btn.is-max немає");

    if (mark) {
        check("без червоного й вигуків — лише приглушення",
            /opacity:/.test(mark[1]) && !/color:|background:|border:/.test(mark[1]),
            mark[1].replace(/\s+/g, " ").trim());
    }

    // Мінус чіпати не можна: зменшити кількість завжди дозволено.
    check("кнопка «−» лишилась без ознаки", !/qty-minus\$\{/.test(cartJs));
}

console.log("\n[4] Межа не чіпає того, чого не має чіпати");
{
    // Усі ці винятки перевіряємо там, де тепер правило, — у common.js.
    // Доти вони стояли в cart.js, і сторінка товару про них не знала:
    // вона не знала й самої межі.

    // Возити під замовлення можна будь-яку кількість.
    check("товар під замовлення без межі",
        /if \(product\.preOrder\) return null;/.test(commonJs));

    // Порожня клітинка залишку — «не рахуємо», а не нуль
    // (див. docs/ЗАЛИШКИ.md).
    check("непорахований залишок — без межі",
        /typeof have === "number" && have > 0 \? have : null/.test(commonJs));

    check("немає модуля залишків — без межі",
        /if \(!stock \|\| !product\) return null;/.test(commonJs));

    // Правило записане в коді, а не лише в тесті.
    check("причина описана в коді",
        /возять будь-яку кількість/.test(commonJs));
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

    // ДАТА Є НЕ ЛИШЕ В ТОВАРІВ.
    //
    // 19.10.2026 заміряно на проді: lastmod мали рівно 103 адреси зі
    // 163 — тобто самі товари. Сторінки брендів, категорій, розділів і
    // пар «бренд × тип» ішли без дати, зокрема одинадцять найновіших.
    // Для сторінки, якої Google іще не бачив, це втрачений сигнал саме
    // там, де він найпотрібніший.
    //
    // Вигадувати дату не можна, але тут її й не треба: сторінка-список
    // показує товари й міняється разом із найсвіжішим із них. Беремо
    // максимум із того самого журналу.
    const записи = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map(m => m[0]);

    const адреса = запис => (запис.match(/<loc>([^<]*)<\/loc>/) || [])[1] || "";

    const списки = записи.filter(з =>
        /\/(brands|categories|departments|novynky|aktsii)\//.test(адреса(з))
        || /\/(brands|categories|departments)\/$/.test(адреса(з)));

    check(`сторінок-списків у sitemap: ${списки.length}`, списки.length >= 40,
        String(списки.length));

    const безДати = списки.filter(з => !/<lastmod>/.test(з));

    check("у кожної є дата зміни", безДати.length === 0,
        безДати.slice(0, 4).map(адреса).join(", "));

    // Дата сторінки-списку мусить дорівнювати даті НАЙСВІЖІШОГО з її
    // товарів, а не даті збірки: інакше це та сама вигадана дата, яку
    // Google ігнорує, просто записана в інший спосіб.
    check("рахується від журналу оновлень, а не від сьогодні",
        /const listLastmod = page =>/.test(sitemapSrc)
        && /\(updated\[product && product\.slug\] \|\| \{\}\)\.date/.test(sitemapSrc)
        && !/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(sitemapSrc));

    const найсвіжіша = [...dates].sort().pop();

    const зіСписків = списки
        .map(з => (з.match(/<lastmod>([^<]*)</) || [])[1])
        .filter(Boolean)
        .sort();

    check(`найсвіжіша дата списків (${зіСписків[зіСписків.length - 1]}) `
        + `збігається з найсвіжішою в журналі (${найсвіжіша})`,
        зіСписків[зіСписків.length - 1] === найсвіжіша);

    // І ПОКЛІТИННО — інакше найприродніша помилка проходить повз.
    //
    // «Узяти зі списку мінімум замість максимуму» зведені перевірки не
    // ловлять: десь у каталозі знайдеться сторінка, у якої найстаріший
    // товар і є найсвіжішим, і зведений максимум лишиться тим самим.
    // А на ділі кожна сторінка казала б, що не мінялась місяцями, хоча
    // на ній щойно зʼявився новий товар — тобто рівно той сигнал, по
    // який усе це й робилось, був би зіпсований.
    //
    // Тому беремо справжні сторінки брендів із того самого модуля, що
    // й збірка, і звіряємо дату кожної з максимумом по її товарах.
    const { brandPages } = require("../scripts/build-taxonomy-pages.js");

    const усіТовари = JSON.parse(read("data/products.json"));

    const бренди = brandPages(усіТовари, JSON.parse(read("data/brands.json")));

    const датаЗXml = url => {
        const запис = записи.find(з => адреса(з) === url);
        return запис ? ((запис.match(/<lastmod>([^<]*)</) || [])[1] || "") : "";
    };

    const розбіжні = бренди.map(page => {

        const свої = (page.products || [])
            .map(p => (log[p && p.slug] || {}).date)
            .filter(Boolean)
            .sort();

        return {
            url: page.url,
            треба: свої.length ? свої[свої.length - 1] : "",
            є: датаЗXml(page.url)
        };

    }).filter(р => р.треба !== р.є);

    check(`дата кожної з ${бренди.length} сторінок брендів — максимум по її товарах`,
        розбіжні.length === 0,
        розбіжні.slice(0, 3).map(р => `${р.url}: ${р.є} замість ${р.треба}`).join("; "));

    // Статичні сторінки й акції лишаються БЕЗ дати свідомо: у перших
    // її нема звідки взяти (git log і mtime у CI не годяться), у
    // других — у записі акції немає поля з датою правки взагалі.
    // Якби їм проставили дату збірки, Google перестав би довіряти
    // lastmod на всьому файлі, зокрема й там, де він чесний.
    const статичні = записи.filter(з => /\/(offer|contacts|authenticity|privacy-policy)$/
        .test(адреса(з)));

    check(`статичні сторінки знайдено: ${статичні.length}`, статичні.length >= 3);

    check("і дати в них свідомо немає",
        статичні.every(з => !/<lastmod>/.test(з)),
        статичні.filter(з => /<lastmod>/.test(з)).map(адреса).join(", "));
}

console.log(failures === 0
    ? "\n✅ Довіра на сторінці товару, межа в кошику, DMARC під наглядом\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
