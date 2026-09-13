// Ціна дня: акція, яка на певний час справді міняє ціну товару.
//
// НАВІЩО ОКРЕМИЙ МОДУЛЬ
// ----------------------
// Ціну дня задають в АКЦІЇ, а читати її треба в ТОВАРІ — у каталозі,
// на картці, в кошику, в оформленні, у фіді. Збірка товарів іде
// раніше за збірку акцій (крок 5 проти 8 у npm run build), тож вона
// не може взяти готовий data/promotions.json.
//
// Тому вихідні файли акцій читаються тут, і цей самий модуль
// використовують обидві збірки. Одна реалізація — один результат.
//
// ЧОМУ ЦІНА, А НЕ ВІДСОТОК
// -------------------------
// Власник думає «продам цю сумку за 8600», а не «мінус 4,44%».
// Відсоток довелося б підбирати, і 4,44% від 9000 — це 8599,6, тобто
// ще й округлення в трьох місцях по-різному.
//
// ЩО ЦЕ НЕ ВИРІШУЄ САМЕ ПО СОБІ
// ------------------------------
// Суму замовлення перераховує база (тригер із міграції 014) за
// власною копією цін. Якщо сайт покаже 8600, а база рахуватиме 9000,
// кожне таке замовлення отримає позначку «розбіжність» — ту саму,
// якою ловлять підміну ціни в консолі. Тому вікно й ціна дня мусять
// доїхати і в базу теж (scripts/push-prices.js).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "promotions");

// Дата з адмінки — у ISO. Порожнє поле й сміття дають "".
//
// СМІТТЯ ВІДКИДАЄМО МОВЧКИ: крива дата в одній акції не має валити
// збірку всього сайту. Акція просто лишиться без розкладу.
function promoDate(value) {

    const text = String(value ?? "").trim();

    if (!text) return "";

    const time = new Date(text).getTime();

    return Number.isFinite(time) ? new Date(time).toISOString() : "";

}

function positivePrice(value) {

    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;

}

// Усі ціни дня: id товару → { price, from, to }.
//
// from/to можуть бути порожні: «ціна дня без дат» означає знижку, яка
// діє, поки акцію не приберуть. Це законно — власник може хотіти
// просто знижену ціну без таймера.
function readDeals(dir) {

    const from = dir || DIR;

    if (!fs.existsSync(from)) return { deals: {}, warnings: [] };

    const deals = {};
    const warnings = [];

    fs.readdirSync(from)
        .filter(name => name.endsWith(".json"))
        .sort()
        .forEach(name => {

            let data;

            try {
                data = JSON.parse(fs.readFileSync(path.join(from, name), "utf8"));
            } catch (error) {
                warnings.push(`${name}: не читається (${error.message})`);
                return;
            }

            // Вимкнена акція ціни не міняє — так само, як не
            // потрапляє в data/promotions.json.
            if (data.active === false) return;

            const price = positivePrice(data.dealPrice);

            if (!price) return;

            const ids = Array.isArray(data.products) ? data.products.map(Number) : [];

            if (!ids.length) {
                warnings.push(`${name}: ціна дня є, а товарів не вибрано`);
                return;
            }

            const deal = {
                price,
                from: promoDate(data.startsAt),
                to: promoDate(data.endsAt),
                promo: String(data.title || name),
                // Плашку «-4%» власник вимикає в самій акції. ЯВНИЙ
                // true, а не «поле є»: акції, зроблені до появи
                // перемикача, поля не мають і мусять показувати
                // плашку, як показували.
                noBadge: data.hideDealBadge === true
            };

            ids.forEach(id => {

                if (!Number.isFinite(id)) return;

                // ОДИН ТОВАР — ОДНА ЦІНА ДНЯ.
                //
                // Дві акції на ту саму сумку — це помилка власника, і
                // мовчки взяти котрусь означало б показувати ціну, якої
                // він не задавав. Беремо першу за іменем файлу й
                // кажемо про це вголос: збірка не падає, але в журналі
                // видно, що саме розійшлось.
                if (deals[id]) {
                    warnings.push(
                        `товар ${id}: ціна дня є у двох акціях — «${deals[id].promo}» `
                        + `і «${deal.promo}». Узято першу (${deals[id].price} ₴)`);
                    return;
                }

                deals[id] = deal;

            });

        });

    return { deals, warnings };

}

// Чи діє ціна дня в заданий момент.
//
// ТА САМА ЛОГІКА, ЩО В promoTiming() у assets/js/common.js: до
// початку — ще ні, після кінця — вже ні, без дат — завжди. Розійтись
// вони не можуть: тест звіряє обидві на тих самих межах.
function dealActive(deal, now) {

    if (!deal || !deal.price) return false;

    const moment = Number.isFinite(now) ? now : Date.now();

    if (deal.from) {
        const starts = new Date(deal.from).getTime();
        if (Number.isFinite(starts) && moment < starts) return false;
    }

    if (deal.to) {
        const ends = new Date(deal.to).getTime();
        if (Number.isFinite(ends) && moment >= ends) return false;
    }

    return true;

}

module.exports = { readDeals, dealActive, promoDate, DIR };
