// Коментар до замовлення.
//
// ЧОГО БРАКУВАЛО
// ---------------
// У формі оформлення було десять полів і жодного, куди покупець міг
// би написати те, що в них не влазить:
//
//   «подзвоніть перед відправкою»
//   «це подарунок — не кладіть чек у коробку»
//   «мене не буде до п'ятниці, відправте в понеділок»
//
// Усе це йшло в Instagram окремим повідомленням, і магазин звіряв
// його із замовленням руками. Тобто найризикованіша частина
// замовлення — та, де є прохання, — жила не в замовленні.
//
// ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ
// ---------------------
// Що коментар доходить УСЮДИ, де власник дивиться замовлення:
// в базу, в картку Telegram і в панель адмінки. Дійти в базу й не
// показатись — це те саме, що не дійти зовсім.
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

const checkoutHtml = read("checkout.html");
const checkoutJs = read("assets/js/checkout.js");
const migration = read("supabase/migrations/027-order-comment.sql");
const ordersPanel = read("admin/orders.js");

const format = (() => {

    const src = read("supabase/functions/telegram-order-bot/format.js")
        .replace(/^export /gm, "");

    return new Function(src + "; return { formatOrder: typeof formatOrder === 'function' ? formatOrder : null };")();

})();

console.log("\n[1] Поле є у формі");
{
    const dom = new JSDOM(checkoutHtml);

    const field = dom.window.document.getElementById("orderComment");

    check("поле знайдено", Boolean(field));

    if (field) {

        check("це саме текстове поле, а не рядок", field.tagName === "TEXTAREA");

        // Необов'язкове: більшість замовлень жодних прохань не має, і
        // обов'язкове поле тут лише додало б кроків.
        check("необов'язкове", !field.required);

        check("довжина обмежена", field.getAttribute("maxlength") === "500");

        // Порожнє поле нічого не підказує. Приклад показує, що сюди
        // взагалі можна писати.
        check("є приклад того, що сюди писати",
            /подзвоніть|подарунок|18:00/i.test(field.getAttribute("placeholder") || ""),
            field.getAttribute("placeholder"));

    }

    check("у власного блоку є заголовок", /Побажання до замовлення/.test(checkoutHtml));
}

console.log("\n[2] Коментар доїжджає до сервера");
{
    check("сторінка кладе його в замовлення",
        /comment: \(document\.getElementById\("orderComment"\)/.test(checkoutJs));

    // maxlength не рятує від вставки з буфера — ріжемо ще й тут.
    check("довжина ріжеться і на сторінці", /\.slice\(0, 500\)/.test(checkoutJs));

    const src = read("supabase/functions/telegram-order-bot/place-order.js");

    check("сервер знає про поле", /comment: 500,/.test(src));

    check("і кладе його в запис", /comment: text\(payload\.comment, TEXT_LIMITS\.comment\)/.test(src));

    check("колонка є в базі",
        /add column if not exists comment text/.test(migration));
}

console.log("\n[3] Власник його побачить");
{
    // Дійти в базу й не показатись — те саме, що не дійти.
    check("картка в Telegram показує коментар", format.formatOrder !== null);

    if (format.formatOrder) {

        const card = format.formatOrder({
            order_number: "1", total: 100, items: [],
            comment: "подзвоніть перед відправкою",
        });

        check("текст у картці", /подзвоніть перед відправкою/.test(card), card.slice(0, 200));

        // Серед однорядкових реквізитів прохання легко пропустити
        // очима — відділяємо порожнім рядком.
        check("відділений порожнім рядком", /\n\n📝/.test(card));

        const without = format.formatOrder({ order_number: "1", total: 100, items: [] });

        check("без коментаря рядка немає", !/📝/.test(without));

        // Текст пише покупець — у ньому може бути що завгодно.
        const evil = format.formatOrder({
            order_number: "1", total: 100, items: [],
            comment: "<b>жирний</b> <script>alert(1)</script>",
        });

        check("текст екранується", !/<script>/.test(evil) && /&lt;script&gt;/.test(evil));

    }

    check("панель адмінки просить колонку",
        /comment: order\?\.comment/.test(read("supabase/functions/telegram-order-bot/admin-api.js")));

    // Окремим розділом, а не рядком серед реквізитів доставки: це
    // єдине місце замовлення, де людина написала щось своїми словами.
    check("панель показує його окремим розділом",
        /<h3>Побажання покупця<\/h3>/.test(ordersPanel));

    check("і екранує", /esc\(order\.comment\)/.test(ordersPanel));

    check("без коментаря розділу немає",
        /\$\{order\.comment \? `/.test(ordersPanel));

    check("є помітний вигляд", /\.comment\{/.test(read("admin/orders.html")));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
