// Доставка: магазин за неї не бере, і способів більше ніж три.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ДОСТАВКИ НЕМАЄ В СУМІ ЗАМОВЛЕННЯ. Покупець платить перевізнику
//    при отриманні, за його тарифом. Раніше в кошик додавалось «від 60
//    грн» — сума була вигаданою: ні магазин цих грошей не отримував,
//    ні покупець стільки не платив.
//
// 2. САЙТ І БОТ РАХУЮТЬ ОДНАКОВО. Якби бот далі додавав доставку, та
//    сама сумка коштувала б у Telegram на 60 грн більше. Дві ціни на
//    один товар — найгірше, що можна показати покупцеві.
//
// 3. НУЛЯ В РОЗМІТЦІ ДЛЯ GOOGLE НЕ БУВАЄ. Магазин не бере, але
//    покупець платить — «безкоштовна доставка» в Google Shopping була
//    б обіцянкою, якої магазин не виконує.
//
// 4. МОЖНА ВИБРАТИ ІНШУ ПОШТУ. Сторінка «Оплата і доставка» обіцяє й
//    Укрпошту, а обрати її було неможливо: усі способи — Нова пошта.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const checkout = read("assets/js/checkout.js");
const page = read("checkout.html");

const flow = require("../supabase/functions/telegram-order-bot/order-flow.js");

console.log("\n[1] Доставки немає в сумі замовлення");
{
    // Головна перевірка: у підсумку не лишилось жодного додавання
    // вартості доставки.
    check("сума не містить доставки",
        !/priceTotal - promoDiscount \+ deliveryPrice/.test(checkout)
        && /const total = priceTotal - promoDiscount;/.test(checkout));

    check("і в підсумку для замовлення теж",
        /Math\.max\(priceTotal - promoDiscount, 0\)/.test(checkout));

    // У рядок замовлення йде нуль — і це правда, а не заготовка.
    check("у замовлення пишеться нуль", /const deliveryPrice = 0;/.test(checkout));

    // «Доставка: 0 грн» читалось би як «безкоштовно».
    check("у підсумку написано, хто платить",
        /"за тарифом перевізника"/.test(checkout));

    check("у листі власнику теж", /оплата при отриманні/.test(checkout));

    check("жоден спосіб не має тарифу в розмітці",
        !/data-price="[1-9]/.test(page),
        (page.match(/data-price="[^"]*"/g) || []).join(", "));

    check("на картках способів написано «оплата при отриманні»",
        (page.match(/оплата при отриманні/g) || []).length >= 4);

    // КОШИК ТЕЖ. Регресія: цей набір перевіряв оформлення й сторінки
    // умов, але не кошик — а в підсумку кошика лишалось «Доставка:
    // Безкоштовно». Тобто дві сторінки одного замовлення казали
    // протилежне, і першою людина бачила саме неправдиву.
    const cart = read("cart.html");

    check("кошик не обіцяє безкоштовної", !/>Безкоштовно</.test(cart),
        (cart.match(/>[^<]*Безкоштовно[^<]*</g) || []).join(", "));

    check("у кошику те саме формулювання", /за тарифом перевізника/.test(cart));
}

console.log("\n[2] Бот рахує так само");
{
    check("у жодного способу немає ціни",
        flow.DELIVERY_OPTIONS.every(option => option.price === 0),
        flow.DELIVERY_OPTIONS.map(o => `${o.id}=${o.price}`).join(", "));

    const totals = flow.computeTotals({ price: 1000, oldPrice: 1200 }, 2, 0);

    check("підсумок бота = товари мінус знижка",
        totals.total === 2000 && totals.delivery === 0,
        JSON.stringify(totals));

    const src = read("supabase/functions/telegram-order-bot/order-flow.js");

    check("кнопка вибору не обіцяє тарифу",
        /оплата при отриманні/.test(src) && !/\$\{option\.price\} грн/.test(src));

    check("у підсумку бота сказано, хто платить",
        /Доставка: за тарифом перевізника/.test(src));

    // Зібрана функція мусить нести те саме.
    check("зібрана функція не застаріла",
        read("supabase/functions/telegram-order-bot/index.ts")
            .includes("Доставка: за тарифом перевізника"));
}

console.log("\n[3] Розмітка для Google не обіцяє безкоштовної");
{
    const productJs = read("assets/js/product.js");
    const builder = read("scripts/build-product-pages.js");

    // Без коментарів: у них поріг згадується навмисно — там написано,
    // чому його прибрали. Правило про КОД, а не про розповідь про код.
    const code = text => text.replace(/\/\/.*$/gm, "");

    check("порогу безкоштовної доставки більше немає в коді",
        !/FREE_SHIPPING_FROM/.test(code(productJs)) && !/FREE_SHIPPING_FROM/.test(code(builder)));

    // Тариф написаний РАЗ — у assets/js/product-offer.js, і обидва
    // місця беруть його звідти. Раніше тут перевірялось, що рядок
    // «SHIPPING_RATE_UAH = 60» є і в рантаймі, і в генераторі: тобто
    // тест стежив за двома копіями одного числа замість того, щоб
    // вимагати одну.
    const offer = require("../assets/js/product-offer.js");

    check("ставка одна на всі товари", offer.SHIPPING_RATE_UAH === 60,
        offer.SHIPPING_RATE_UAH);

    check("власних копій тарифу ні в рантаймі, ні в генераторі немає",
        !/SHIPPING_RATE_UAH = /.test(productJs) && !/SHIPPING_RATE_UAH = /.test(builder));

    // Обидва мусять саме брати модуль, а не зібрати умови самотужки.
    check("обидва підключають спільний модуль",
        /product-offer/.test(productJs) && /product-offer/.test(builder));

    // Ставка мусить стояти беззастережно: умова «якщо ціна більша за
    // поріг» і була тим, що ставило нуль.
    check("ставка не залежить від ціни товару",
        !/if \(Number\(price\) >=/.test(productJs) && !/if \(Number\(price\) >=/.test(builder));

    // І в готових сторінках.
    const dir = path.join(ROOT, "p");

    const pages = fs.existsSync(dir)
        ? fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => path.join(dir, e.name, "index.html"))
            .filter(f => fs.existsSync(f))
        : [];

    const rates = new Set();

    pages.forEach(file => {

        const match = fs.readFileSync(file, "utf8")
            .match(/id="productSchema">([\s\S]*?)<\/script>/);

        if (!match) return;

        try {
            const ld = JSON.parse(match[1]);
            const rate = ld.offers && ld.offers.shippingDetails && ld.offers.shippingDetails.shippingRate;
            rates.add(rate ? Number(rate.value) : null);
        } catch (error) {
            rates.add("зіпсована розмітка");
        }

    });

    check(`у сторінках товарів одна ставка: ${[...rates].join(", ")}`,
        rates.size === 1 && rates.has(60));
}

console.log("\n[4] Можна вибрати іншу пошту");
{
    check("спосіб є в переліку",
        /value="Інша пошта"/.test(page));

    check("названо конкретних перевізників",
        /Укрпошта, Meest/.test(page));

    check("є поле для перевізника й адреси",
        /id="otherCarrier"/.test(page)
        && /data-detail-for="Інша пошта"/.test(page));

    // Без цього рядок доставки в замовленні був би порожнім, і власник
    // не знав би ні перевізника, ні відділення.
    check("значення поля доїжджає в замовлення",
        /delivery\.label === "Інша пошта"[\s\S]{0,200}otherCarrier/.test(checkout));

    check("у підказці показано приклад", /Укрпошта, відділення/.test(page));

    // І В БОТІ ТЕЖ. Раніше на сайті цей спосіб був, а в боті лишались
    // три кнопки — усі «Нова пошта». Тобто те саме замовлення через
    // Telegram оформити було неможливо, і людину доводилось вести на
    // сайт. Заміряно: 4 згадки в checkout.html проти 0 в order-flow.js.
    const other = flow.DELIVERY_OPTIONS.find(option => option.id === "other");

    check("спосіб є і в боті", !!other,
        flow.DELIVERY_OPTIONS.map(o => o.id).join(", "));

    if (other) {

        // label їде в orders.delivery_method і мусить збігатися з
        // сайтом до символу: розійдуться — і в картці замовлення буде
        // одне формулювання, а в «Історії замовлень» інше.
        check("назва в боті збігається з сайтом до символу", other.label === "Інша пошта",
            other.label);

        check("бот питає перевізника й адресу", /Перевізник/.test(other.needsDetail),
            other.needsDetail);

        check("на кнопці бота названо перевізників (сама «Інша пошта» нічого не каже)",
            /Укрпошта/.test(other.button || ""), other.button);

        check("доставку бот не додає в суму, як і сайт", other.price === 0);

        // Кнопка Telegram: 64 байти на callback_data (перевіряє
        // test-bot-order-flow.js), але й текст мусить бути осяжним.
        const button = flow.deliveryKeyboard().inline_keyboard
            .flat()
            .find(b => b.callback_data === "o:dlv:other");

        check("кнопка в боті існує", !!button, JSON.stringify(button));

        check("текст кнопки не надто довгий", !!button && button.text.length <= 64,
            button && `${button.text.length}: ${button.text}`);
    }
}

console.log("\n[5] Сторінки умов кажуть те саме");
{
    const delivery = read("delivery-payment.html");
    const offer = read("offer.html");

    check("сторінка доставки: платить покупець перевізнику",
        /оплачуєте перевізнику при отриманні/.test(delivery));

    check("сторінка доставки: у сумі замовлення доставки немає",
        /у сумі замовлення на сайті доставки немає/i.test(delivery));

    check("оферта: те саме", /оплачує Покупець/.test(offer)
        && /не включається/.test(offer));

    // Обіцянка, якої більше немає.
    check("ніде не лишилось «безкоштовної доставки»",
        !/безкоштовн/i.test(offer) && !/Безкоштовна доставка/i.test(delivery));

    // Тариф як орієнтир лишається: людині корисно знати, скільки це
    // приблизно коштуватиме.
    check("орієнтовні тарифи перевізника лишились",
        /від 60 грн/.test(delivery) && /Тариф перевізника/.test(delivery));
}

console.log(failures === 0
    ? "\n✅ Доставка: магазин не бере, покупець платить перевізнику — і так усюди\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
