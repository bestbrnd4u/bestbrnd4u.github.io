// Сторінка товару: типографіка й ритм відступів.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// 1. Заголовки блоків характеристик успадковували глобальний h3 —
//    24px, тоді як значення під ними 14.5px. «Артикул» виглядав
//    важливішим за сам артикул.
// 2. Між блоками стояло margin-top:22px ПЛЮС padding-top:22px — 45px
//    пустоти з лінією посередині, що читалось як зайвий порожній рядок.
// 3. Два сусідні .similar по padding:80px 0 давали 160px між
//    каруселлю й «Переглянуті товари» — майже екран нічого.
// 4. Мобільних правил для сторінки майже не було: h1 лишався 40px, а
//    ціна 38px, і на 375px кнопка «Купити» опинялась за згином.
//
// Перевірки нижче стежать за двома речами: що значення не повернулись,
// і що нові правила справді перемагають у каскаді — вони спираються на
// порядок у файлі, а не на специфічність, тож переставляння блоків
// зламало б усе безшумно.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");

// межа нового блока: усе, що після неї, перекриває правила вище
const MARKER = "СТОРІНКА ТОВАРУ: типографіка й ритм";
const markerAt = css.indexOf(MARKER);

const newBlock = markerAt >= 0 ? css.slice(markerAt) : "";
const mobileAt = newBlock.indexOf("@media(max-width:768px)");

const desktopPart = mobileAt >= 0 ? newBlock.slice(0, mobileAt) : newBlock;
const mobilePart = mobileAt >= 0 ? newBlock.slice(mobileAt) : "";

const valueIn = (text, selector, prop) => {

    const rule = new RegExp(
        selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{[^}]*\\}", "g");

    let match;
    let last = null;

    while ((match = rule.exec(text))) {

        const found = new RegExp(prop + ":\\s*([^;]+)").exec(match[0]);

        if (found) last = found[1].trim();

    }

    return last;

};

console.log("\n[1] Новий блок стоїть після старих правил");
{
    check("блок є у файлі", markerAt > 0);

    // Порядок — єдине, що дає йому перевагу: специфічність у частини
    // правил однакова.
    [
        ["h3 24px (глобальний)", "h3{\n    font-size:24px"],
        ["h1 товару 40px", ".product-wrapper .product-info h1{\n    font-size:40px"],
        ["ціна 38px", ".price-box .price{\n    font-size:38px"],
        [".similar 80px", ".similar{\n    padding:80px 0"],
        [".spec-block 22px", ".spec-block{\n    margin-top:22px"]
    ].forEach(([label, snippet]) => {

        const at = css.indexOf(snippet);

        check(`${label} — вище нового блока`, at >= 0 && at < markerAt, at);

    });

    // мобільна частина нового блока мусить бути ПІСЛЯ старої
    check("мобільні правила теж перекривають старі",
        mobileAt >= 0 && css.indexOf("@media(max-width:768px)") < markerAt + mobileAt);
}

console.log("\n[2] Ієрархія розмірів");
{
    const h1 = parseFloat(valueIn(desktopPart, ".product-wrapper .product-info h1", "font-size"));
    const h3 = parseFloat(valueIn(desktopPart, ".spec-block-header h3", "font-size"));
    const row = parseFloat(valueIn(desktopPart, ".specifications .spec-row", "font-size"));
    const price = parseFloat(valueIn(desktopPart, ".price-box .price", "font-size"));

    check("усі розміри задані", [h1, h3, row, price].every(Number.isFinite),
        `${h1}/${h3}/${row}/${price}`);

    // Заголовок блока мусить бути ПОМІТНО меншим за назву товару й
    // помітно більшим за значення в рядку — інакше рівні зливаються.
    check("заголовок блока менший за назву товару", h3 < h1 - 8, `${h3} проти ${h1}`);
    check("і більший за значення в рядку", h3 > row, `${h3} проти ${row}`);

    // Саме через це «Артикул» виглядав важливішим за артикул.
    check("розрив заголовок/значення не надто великий", h3 - row <= 4, h3 - row);

    // Ціна не має перебивати назву, але й не тонути
    check("ціна співмірна з назвою", Math.abs(price - h1) <= 6, `${price} проти ${h1}`);
}

console.log("\n[3] Порожні смуги прибрані");
{
    // 22+22 давали 45px з лінією посередині
    check("подвійного відступу між блоками немає",
        valueIn(desktopPart, ".specifications .spec-block", "margin-top") === "0");

    const pad = parseFloat(valueIn(desktopPart, ".specifications .spec-block", "padding-top"));

    check("відступ до заголовка помірний", pad > 0 && pad <= 20, pad);

    // перший блок без лінії — інакше під шапкою карточки зайва смуга
    check("перший блок без лінії",
        /\.specifications \.spec-block:first-child\{[^}]*border-top:0/.test(desktopPart));

    // 80+80 давали 160px між однаковими розділами
    check("стик однакових розділів не подвоюється",
        /\.similar \+ \.similar\{[^}]*padding-top:0/.test(desktopPart));

    const similar = parseFloat(valueIn(desktopPart, ".similar", "padding"));

    check("відступ розділу зменшено", similar < 80, similar);
}

console.log("\n[4] Телефон");
{
    const h1 = parseFloat(valueIn(mobilePart, ".product-wrapper .product-info h1", "font-size"));
    const price = parseFloat(valueIn(mobilePart, ".price-box .price", "font-size"));
    const h3 = parseFloat(valueIn(mobilePart, ".spec-block-header h3", "font-size"));
    const row = parseFloat(valueIn(mobilePart, ".specifications .spec-row", "font-size"));

    check("назва зменшена", Number.isFinite(h1) && h1 <= 26, h1);
    check("ціна зменшена", Number.isFinite(price) && price <= 28, price);

    // Зменшуємо саме великі елементи: дрібний текст мусить лишитись
    // читабельним, інакше економія обертається проти покупця.
    check("дрібний текст не менший за 14px", Number.isFinite(row) && row >= 14, row);
    check("заголовок блока лишився помітним", Number.isFinite(h3) && h3 >= 14, h3);
    check("і більшим за значення", h3 >= row, `${h3} проти ${row}`);

    const similar = parseFloat(valueIn(mobilePart, ".similar", "padding"));

    check("відступ розділів на телефоні менший", similar > 0 && similar <= 48, similar);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
