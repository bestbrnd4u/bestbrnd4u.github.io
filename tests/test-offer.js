// Публічна оферта: договір, за яким магазин продає.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ДОКУМЕНТ ДОСЯЖНИЙ. З підвалу будь-якої сторінки і — головне —
//    з кроку оформлення: договір укладається натисканням кнопки
//    «Оформити замовлення», і саме там на нього мусить бути посилання.
//
// 2. УМОВИ НЕ СУПЕРЕЧАТЬ РЕШТІ САЙТУ. Строк повернення, безкоштовна
//    доставка, строки відправлення — усе це вже написано на сторінках
//    доставки й повернення. Два різні числа в договорі й на сторінці
//    гірші, ніж відсутність договору.
//
// 3. РЕКВІЗИТИ ЖИВУТЬ У ДАНИХ, А НЕ В РОЗМІТЦІ. ФОП реєструють один
//    раз, і власник має вписати його в адмінці, а не в HTML.
//
// 4. ПОРОЖНЄ ПОЛЕ НЕ ЛИШАЄ ОГРИЗКА. «Юридична назва:» без назви — це
//    гірше, ніж рядка немає.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const html = read("offer.html");
const legal = JSON.parse(read("data/legal.json"));

console.log("\n[1] Сторінка існує і виглядає як решта сайту");
{
    check("offer.html лежить у корені", fs.existsSync(path.join(ROOT, "offer.html")));

    check("шапка й підвал на місці",
        /<header/.test(html) && /<footer/.test(html) && /mega-menu/.test(html));

    check("заголовок сторінки", /<title>Публічна оферта \| BestBrnd4u<\/title>/.test(html));

    check("текст оформлено як у політики конфіденційності",
        /class="legal-content"/.test(html));

    check("сторінка відкрита для пошуку", !/content="noindex"/.test(html));
}

console.log("\n[2] Документ можна знайти");
{
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const withoutLink = pages.filter(f => !/href="offer"/.test(read(f)));

    check(`посилання в підвалі всіх ${pages.length} сторінок`,
        withoutLink.length === 0, withoutLink.join(", "));

    // Договір укладається натисканням кнопки — посилання мусить бути
    // саме там, а не лише в підвалі.
    const checkout = read("checkout.html");

    check("посилання на кроці оформлення",
        /Оформлюючи замовлення[\s\S]{0,200}href="offer"/.test(checkout));

    const sitemap = read("sitemap.xml");

    check("сторінка в sitemap", /<loc>[^<]*\/offer<\/loc>/.test(sitemap));

    check("є canonical", /rel="canonical" href="[^"]*\/offer"/.test(html));
}

console.log("\n[3] Умови збігаються з рештою сайту");
{
    const delivery = read("delivery-payment.html");
    const returns = read("return-warranty.html");

    // Числа, які легко розійтись: строк повернення, поріг безкоштовної
    // доставки, строк відправлення, строк повернення коштів.
    check("14 днів на повернення — і там, і там",
        /14 днів/.test(html) && /14 днів/.test(returns));

    // ЩО ЗМІНИЛОСЬ. Раніше тут перевірявся поріг безкоштовної
    // доставки — 3 500 грн. Магазин перестав брати за доставку гроші
    // взагалі: покупець платить перевізнику при отриманні, і сума
    // замовлення доставки не містить. «Безкоштовно від 3 500» у такій
    // моделі не означає нічого, тож обіцянка прибрана з обох сторінок,
    // а перевірка стежить, щоб вона не повернулась.
    check("ні оферта, ні сторінка доставки не обіцяють безкоштовної",
        !/безкоштовн/i.test(html) && !/Безкоштовна доставка/i.test(delivery));

    check("обидві сторінки кажуть, що доставку оплачує покупець",
        /оплачує Покупець|оплачує покупець/.test(html) && /перевізник/i.test(delivery));

    check("відправлення 1–2 дні",
        /1–2 дн/.test(html) && /1–2 дн/.test(delivery));

    check("повернення коштів — 3 робочих дні",
        /3 робочих дн/.test(html) && /3 робочих дн/.test(returns));

    check("названо закон про захист прав споживачів",
        /Про захист прав споживачів/.test(html));

    check("названо статті Цивільного кодексу про оферту",
        /633/.test(html) && /641/.test(html) && /642/.test(html));

    check("сказано, коли договір вважається укладеним",
        /акцепт/i.test(html));

    check("є посилання на політику конфіденційності",
        /href="privacy-policy"/.test(html));
}

console.log("\n[4] Реквізити беруться з даних");
{
    const build = require("../scripts/build-legal.js");

    check("data/legal.json існує", fs.existsSync(path.join(ROOT, "data/legal.json")));

    check("у сторінці є місце для реквізитів",
        /<ul id="offerRequisites">/.test(html));

    check("дата редакції має своє місце",
        /id="offerRevision"/.test(html));

    // Порожнє поле не лишає ані рядка, ані двокрапки.
    const empty = build.buildRequisites({ sellerName: "BestBrnd4u", legalName: "", registrationNumber: "" });

    check("порожня юридична назва не друкується", !/Юридична назва/.test(empty), empty);

    const filled = build.buildRequisites({ legalName: "ФОП Іваненко І. І.", registrationNumber: "1234567890" });

    check("заповнена — друкується", /ФОП Іваненко І\. І\./.test(filled));
    check("реєстраційний номер друкується", /1234567890/.test(filled));

    // Розмітка не має ламатись від лапок і кутових дужок у даних.
    check("значення екрануються",
        /&lt;b&gt;/.test(build.buildRequisites({ address: "<b>Київ</b>" })));

    check("телефон для дзвінка без пробілів",
        build.telHref("+380 73 728 82 91") === "+380737288291",
        build.telHref("+380 73 728 82 91"));

    check("дата пишеться словами",
        build.formatDate("2026-09-06") === "6 вересня 2026 р.",
        build.formatDate("2026-09-06"));

    check("зіпсована дата не потрапляє на сторінку",
        build.formatDate("06.09.2026") === "" && build.formatDate("") === "");

    // Те, що лежить у файлі даних, справді стоїть на сторінці.
    if (legal.sellerName) {
        check("назва продавця зі сторінки збігається з даними",
            html.includes(`<strong>Продавець:</strong> ${legal.sellerName}`));
    }

    check("дата редакції зі сторінки збігається з даними",
        html.includes(`Редакція від ${build.formatDate(legal.revision)}`),
        build.formatDate(legal.revision));
}

console.log("\n[5] Власник може правити реквізити без коду");
{
    const yaml = require("js-yaml");

    const config = yaml.load(read("admin/config.yml"));

    const pages = config.collections.find(c => c.name === "pages");
    const entry = pages && pages.files.find(f => f.file === "data/legal.json");

    check("в адмінці є розділ для реквізитів", Boolean(entry));

    if (entry) {

        const names = entry.fields.map(f => f.name);

        ["legalName", "registrationNumber", "address", "revision"].forEach(field => {
            check(`поле ${field}`, names.includes(field), names.join(", "));
        });

        check("жодне поле не обов'язкове",
            entry.fields.every(f => f.required === false),
            entry.fields.filter(f => f.required !== false).map(f => f.name).join(", "));

    }

    // Крок збірки мусить бути в npm run build, інакше зміни з адмінки
    // ніколи не доїдуть до сторінки.
    const pkg = JSON.parse(read("package.json"));

    check("build-legal.js входить у збірку",
        pkg.scripts.build.includes("build-legal.js"));
}

console.log(failures === 0
    ? "\n✅ Оферта: документ на місці, умови збігаються з рештою сайту\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
