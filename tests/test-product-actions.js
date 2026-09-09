// Дві дії в рядку під назвою товару: скопіювати артикул і поділитися.
//
// ЧОГО БРАКУВАЛО
// ---------------
// 1. АРТИКУЛ. Він стоїть під назвою («Артикул: 28-1»), ним відповідає
//    підтримка, його підставляє форма контактів — і саме за ним тепер
//    працює пошук по сайту. А взяти його з екрана було нічим: на
//    телефоні виділити «28-1» усередині рядка майже неможливо.
//
// 2. ПОДІЛИТИСЯ. Магазин живе з Instagram, а віддати посилання на
//    товар можна було лише через адресний рядок браузера.
//
// ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ
// ---------------------
// • копіюється КОД, а не рядок із підписом (вставлений у пошук
//   «Артикул: 28-1» нічого не знайде — там точний збіг);
// • перемикання кольору оновлює і напис, і код, і не стирає значки;
// • є підтвердження: буфер обміну людина не бачить;
// • є запасний шлях копіювання, коли clipboard недоступний;
// • «поділитися» віддає адресу З КОЛЬОРОМ і не вважає скасування
//   діалогу помилкою.
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

const productJs = read("assets/js/product.js");
const common = read("assets/js/common.js");
const css = read("assets/css/style.css");

console.log("\n[1] Обидві дії є в рядку під назвою");
{
    check("рядок став гнучким контейнером",
        /\.product-meta-line\{[^}]*display:flex/.test(css.replace(/\r\n/g, "\n")));

    check("кнопка копіювання", /class="meta-chip sku-copy"/.test(productJs));
    check("кнопка «поділитися»", /class="meta-chip share-product"/.test(productJs));

    // Голосом читача обидві мусять називатися: усередині лише значок і
    // короткий напис, з якого мета дії неочевидна.
    check("у копіювання є підпис для читача",
        /aria-label="Скопіювати артикул"/.test(productJs));

    check("у «поділитися» теж",
        /aria-label="Поділитися товаром"/.test(productJs));

    // Товар без артикула існує (старі дані) — кнопка тоді порожня
    // рамка зі значком, тож її ховаємо.
    check("без артикула кнопка схована",
        /data-sku="\$\{escapeHtml\(activeSku \|\| ""\)\}"\s*\n\s*aria-label="Скопіювати артикул"\s*\n\s*\$\{activeSku \? "" : "hidden"\}/
            .test(productJs.replace(/\r\n/g, "\n")));
}

console.log("\n[2] Копіюється код, а не підпис");
{
    check("значення лежить окремо від тексту",
        /data-sku="\$\{escapeHtml\(activeSku \|\| ""\)\}"/.test(productJs));

    check("текст — у власному вузлі",
        /<span data-product-sku-text>/.test(productJs));

    check("копіюємо саме data-sku",
        /copyText\(skuBtn\.dataset\.sku\)/.test(productJs));

    // Перемикання кольору змінює артикул. Якщо оновити лише напис,
    // кнопка копіювала б код попереднього кольору — найгірший
    // різновид помилки: мовчазний і правдоподібний.
    check("перемикання кольору оновлює код",
        /inlineSku\.dataset\.sku = sku \|\| ""/.test(common));

    check("…і напис",
        /label\.textContent = sku \? `Артикул: \$\{sku\}` : ""/.test(common));

    // textContent на самій кнопці стер би значки разом із розміткою.
    check("напис пишеться у вкладений вузол, не в кнопку",
        /querySelector\("\[data-product-sku-text\]"\) \|\| inlineSku/.test(common));

    // Запасний шлях потрібен старим сторінкам і тестовим стендам, які
    // кладуть порожній <span data-product-sku>.
    check("порожній span теж працює", /\|\| inlineSku;/.test(common));
}

console.log("\n[3] Людина бачить, що спрацювало");
{
    // Буфер обміну не видно. Без підтвердження натискання виглядає
    // так, ніби нічого не сталося, — і людина тисне ще раз.
    check("є підтвердження", /function flashDone/.test(productJs));

    check("воно зникає саме",
        /setTimeout\(\(\) => button\.classList\.remove\("done"\), 1600\)/.test(productJs));

    // Другий клац поспіль не має обірвати підтвердження раніше часу.
    check("повторний клац продовжує підтвердження",
        /clearTimeout\(button\.doneTimer\)/.test(productJs));

    check("галочка підміняє значок",
        /\.meta-chip\.done \.meta-chip-icon\{[^}]*display:none/.test(css.replace(/\r\n/g, "\n")));

    check("і сама показується",
        /\.meta-chip\.done \.meta-chip-done\{[^}]*display:block/.test(css.replace(/\r\n/g, "\n")));
}

console.log("\n[4] Копіювання працює й там, де clipboard недоступний");
{
    // navigator.clipboard живе лише в захищеному контексті й може
    // відмовити (дозволи, фокус на іншому вікні).
    check("новий шлях під умовою",
        /navigator\.clipboard && window\.isSecureContext/.test(productJs));

    check("є запасний execCommand", /function copyTextFallback/.test(productJs));

    check("відмова нового шляху веде в запасний",
        /\.then\(\(\) => true, \(\) => copyTextFallback\(text\)\)/.test(productJs));

    // readOnly не дає клавіатурі вискочити на телефоні.
    check("тимчасове поле не викликає клавіатуру",
        /area\.setAttribute\("readonly", ""\)/.test(productJs));

    check("і прибирається за собою",
        /document\.body\.removeChild\(area\)/.test(productJs));
}

console.log("\n[5] Поділитися");
{
    check("системне вікно, якщо воно є", /if \(navigator\.share\)/.test(productJs));

    // Адреса як є: після перемикання кольору в ній уже стоїть ?color=,
    // тож посилання відкриє саме те, що людина бачить.
    check("віддається поточна адреса, з кольором",
        /const url = location\.href;/.test(productJs));

    // Скасування діалогу кидає AbortError. Без catch це «Uncaught (in
    // promise)» у консолі на кожне «передумав».
    check("скасування діалогу — не помилка",
        /navigator\.share\(\{ title: title, url: url \}\)\.catch\(\(\) => \{\}\)/.test(productJs));

    check("на десктопі посилання лягає в буфер",
        /copyText\(url\)\.then\(ok => \{ if \(ok\) flashDone\(shareBtn\); \}\)/.test(productJs));
}

console.log("\n[6] Розмітка збирається без помилок");
{
    // Рядок будується шаблонним рядком у product.js — перевіряємо, що
    // з нього виходить коректний HTML із обома кнопками.
    const block = productJs.match(/<div class="product-meta-line">[\s\S]*?<\/div>/);

    check("блок знайдено", Boolean(block));

    if (block) {

        const html = block[0]
            .replace(/\$\{escapeHtml\(activeSku \|\| ""\)\}/g, "28-1")
            .replace(/\$\{activeSku \? "" : "hidden"\}/g, "")
            .replace(/\$\{activeSku \? `Артикул: \$\{escapeHtml\(activeSku\)\}` : ""\}/g, "Артикул: 28-1");

        const dom = new JSDOM(`<body>${html}</body>`);
        const doc = dom.window.document;

        const skuBtn = doc.querySelector(".sku-copy");

        check("кнопка артикула зібралась", Boolean(skuBtn));
        check("з кодом усередині", skuBtn && skuBtn.dataset.sku === "28-1");
        check("і з написом",
            skuBtn && skuBtn.textContent.trim().startsWith("Артикул: 28-1"));

        check("кнопка «поділитися» зібралась",
            Boolean(doc.querySelector(".share-product")));

        // Обидва значки — і звичайний, і галочка — мусять бути в
        // кожній кнопці: підтвердження працює підміною.
        check("у кожної кнопки є обидва значки",
            [...doc.querySelectorAll(".meta-chip")]
                .every(b => b.querySelector(".meta-chip-icon") && b.querySelector(".meta-chip-done")));

        // Значки декоративні — читач екрана не має їх озвучувати.
        check("значки сховані від читача екрана",
            [...doc.querySelectorAll("svg")]
                .every(s => s.getAttribute("aria-hidden") === "true"));
    }
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
