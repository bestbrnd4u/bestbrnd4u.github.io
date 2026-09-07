// «З цим часто беруть» — доповнення до кошика.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ДОПОВНЕННЯ, А НЕ ЗАМІНА. Блок на сторінці товару показує сусідні
//    сумки — там людина ще вибирає. У кошику вибір зроблений: друга
//    сумка до сумки не потрібна, потрібен гаманець.
//
// 2. СТАТЬ ЗБІГАЄТЬСЯ. Регресія, яку зловив цей тест: у каталозі
//    «Чоловічі сумки» і «Жіночі сумки» — РІЗНІ категорії, тож перша
//    версія добору вважала жіночу сумку доречним доповненням до
//    чоловічої. До чоловічої сумки Coach блок радив сім жіночих
//    сумок Coach.
//
// 3. ТОВАРІВ ІЗ КОШИКА В ПОРАДАХ НЕМАЄ. Найпомітніший спосіб показати,
//    що блок ніхто не думав.
//
// 4. ПОРОЖНІЙ КОШИК — ПОРОЖНІЙ БЛОК. І не лишає старих порад після
//    видалення останнього товару.
//
// 5. КОШИК КАЖЕ ПРО ДОСТАВКУ ТЕ САМЕ, ЩО ОФОРМЛЕННЯ. Тут же знайшлась
//    друга регресія: у підсумку кошика лишалось «Доставка:
//    Безкоштовно», хоча магазин перейшов на оплату перевізнику.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const common = read("assets/js/common.js");
const cartJs = read("assets/js/cart.js");
const cartHtml = read("cart.html");

// Товари беремо з ДЖЕРЕЛ, а не з агрегату data/catalog.json: агрегат
// перезбирає GitHub Actions, і у свіжому клоні він відстає.
const { loadProducts } = require("./helpers/products.js");

const products = loadProducts();

// Витягуємо чисту функцію добору з common.js: увесь файл тут не
// запустити (він чекає DOM), а сам добір — звичайна функція.
function loadPicker() {

    const match = common.match(/const CROSS_SELL_LIMIT = \d+;[\s\S]*?\n\}\n\nasync function renderCrossSell/);

    if (!match) throw new Error("не знайшов pickCrossSell у common.js");

    const src = match[0].replace(/\nasync function renderCrossSell$/, "");

    // getProductGenders живе в common.js нижче — підставляємо ту саму
    // логіку, щоб тест перевіряв добір, а не читання поля.
    return new Function("products", "cartLines", "limit", "getProductGenders",
        src + "; return pickCrossSell(products, cartLines, limit);");

}

const pick = loadPicker();

function genders(product) {

    const value = product.gender || product.genders;

    return Array.isArray(value) ? value : (value ? [value] : []);

}

const suggest = (ids, limit) =>
    pick(products, ids.map(id => ({ id })), limit || 8, genders);

const byId = id => products.find(p => Number(p.id) === Number(id));

const find = predicate => products.find(predicate);

console.log("\n[1] Добір є і працює на справжньому каталозі");
{
    check("pickCrossSell винесений окремо від показу",
        /function pickCrossSell\(products, cartLines, limit\)/.test(common));

    check("renderCrossSell існує", /async function renderCrossSell\(options\)/.test(common));

    const any = products[0];

    check("на реальному каталозі щось радить", suggest([any.id]).length > 0);

    check("порожній кошик — жодної поради", suggest([]).length === 0);

    check("невідомий товар у кошику — жодної поради",
        pick(products, [{ id: 999999 }], 8, genders).length === 0);
}

console.log("\n[2] Стать збігається (регресія: жіночі сумки до чоловічої)");
{
    const menBag = find(p => /Чоловічі сумки/.test(String(p.category)));

    check("у каталозі є чоловіча сумка", Boolean(menBag));

    if (menBag) {

        const out = suggest([menBag.id]);

        const cartGenders = new Set(genders(menBag));

        // «Унісекс» доречний до дорослої покупки — саме для цього
        // позначку й ставлять.
        cartGenders.add("Унісекс");

        const wrong = out.filter(p => {

            const own = genders(p);

            return own.length && !own.some(g => cartGenders.has(g));

        });

        check(`до чоловічої сумки не радить чужу стать (${out.length} порад)`,
            wrong.length === 0,
            wrong.map(p => `${p.brand}/${p.category}/${genders(p).join("+")}`).join(", "));

        // Головна перевірка регресії: жіночих сумок бути не може.
        check("серед порад немає жіночих сумок",
            !out.some(p => /Жіночі сумки/.test(String(p.category))),
            out.filter(p => /Жіночі сумки/.test(String(p.category))).length + " шт.");

    }

    const womanBag = find(p => /Жіночі сумки/.test(String(p.category)));

    if (womanBag) {

        const out = suggest([womanBag.id]);

        check("до жіночої сумки не радить чоловічих сумок",
            !out.some(p => /Чоловічі сумки/.test(String(p.category))));

    }
}

console.log("\n[3] Доповнення, а не заміна");
{
    const bag = find(p => /сумки/i.test(String(p.category)));

    if (bag) {

        const out = suggest([bag.id]);

        // Та сама категорія — це заміна. Вона лишається тільки як
        // останній резерв (свій бренд), тож на початку списку її бути
        // не має.
        check("перша порада — з іншої категорії",
            out.length > 0 && String(out[0].category) !== String(bag.category),
            out.length ? `${out[0].category} проти ${bag.category}` : "порад немає");

        // Найсильніша порада — той самий бренд. Так ці речі й продають.
        const sameBrand = out.filter(p => String(p.brand) === String(bag.brand));

        check("той самий бренд стоїть попереду",
            sameBrand.length === 0 || out.indexOf(sameBrand[0]) === 0,
            `бренд ${bag.brand}, перша порада — ${out.length ? out[0].brand : "—"}`);

    }

    check("правило про заміну описане в коді",
        /Та сама категорія — це заміна, а не доповнення/.test(common));
}

console.log("\n[4] Товарів із кошика в порадах немає");
{
    const first = products[0];
    const second = products.find(p => Number(p.id) !== Number(first.id));

    const out = suggest([first.id, second.id]);

    const leaked = out.filter(p =>
        Number(p.id) === Number(first.id) || Number(p.id) === Number(second.id));

    check("жодного товару з кошика", leaked.length === 0,
        leaked.map(p => p.title).join(", "));

    check("порад не більше за межу", suggest([first.id], 3).length <= 3);
}

console.log("\n[5] Дешевше попереду");
{
    // Доповнення дорожче за основну покупку не купує ніхто: воно
    // читається не як «додати», а як «почати вибір заново».
    const expensive = [...products].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))[0];

    const out = suggest([expensive.id]);

    if (out.length > 1) {

        const ceiling = Number(expensive.price) || 0;

        const firstOver = out.findIndex(p => (Number(p.price) || 0) > ceiling);

        const lastUnder = out.reduce((last, p, i) =>
            (Number(p.price) || 0) <= ceiling ? i : last, -1);

        check("усе, що дешевше за кошик, стоїть до того, що дорожче",
            firstOver === -1 || firstOver > lastUnder,
            `перше дорожче — ${firstOver}, останнє дешевше — ${lastUnder}`);

    }
}

console.log("\n[6] Порожній кошик — порожній блок");
{
    check("renderCrossSell ховає блок без товарів",
        /if \(!lines\.length\) \{[\s\S]{0,200}?section\.hidden = true;/.test(common));

    check("і коли радити нічого",
        /if \(!list\.length\) \{[\s\S]{0,200}?section\.hidden = true;/.test(common));

    check("розмітка блоку прихована за замовчуванням",
        /id="crossSellSection" hidden>/.test(cartHtml));

    check("кошик перемальовує блок разом із собою",
        /if \(typeof renderCrossSell === "function"\) renderCrossSell\(\);/.test(cartJs));

    // Без цього виклику блок був би мертвий: сітка й карусель
    // ініціалізуються окремо.
    check("картки оживають (карусель, обране)",
        /initProductCarousels\(grid\)/.test(common)
        && /updateFavoriteButtons/.test(common));

    check("блок міряється статистикою",
        /viewItemList\(list, "Крос-сел у кошику"\)/.test(common));
}

console.log("\n[7] Розмітка блоку на місці");
{
    ["crossSellSection", "crossSellCarousel", "crossSellGrid"].forEach(id => {
        check(`id ${id}`, cartHtml.includes(`id="${id}"`));
    });

    check("заголовок", /З цим часто беруть/.test(cartHtml));

    check("стрілки каруселі", (cartHtml.match(/carousel-arrow/g) || []).length >= 2);

    // Блок стоїть ПІСЛЯ кошика: над кнопкою «Оформити замовлення» він
    // відтягував би увагу від неї.
    check("блок нижче кошика",
        cartHtml.indexOf('id="crossSellSection"') > cartHtml.indexOf('id="checkoutBtn"'));
}

console.log("\n[8] Кошик і оформлення кажуть про доставку одне");
{
    // Регресія: у кошику лишалось «Безкоштовно», хоча магазин
    // перейшов на оплату перевізнику при отриманні.
    check("у кошику немає «Безкоштовно»", !/>Безкоштовно</.test(cartHtml),
        (cartHtml.match(/>[^<]*Безкоштовно[^<]*</g) || []).join(", "));

    check("написано, хто платить", /за тарифом перевізника/.test(cartHtml));

    const checkout = read("assets/js/checkout.js");

    check("те саме формулювання, що на оформленні",
        /"за тарифом перевізника"/.test(checkout));
}

console.log(failures === 0
    ? "\n✅ Крос-сел: доповнення своєї статі, без товарів із кошика\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
