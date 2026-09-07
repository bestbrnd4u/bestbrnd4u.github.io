// Відгуки: від форми до зірок у пошуку.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. ВІДГУК ЛИШЕ ВІД ТОГО, ХТО КУПУВАВ. Форма без перевірки покупки —
//    запрошення для конкурентів і ботів. Перевіряються ТРИ речі:
//    замовлення існує, телефон збігається, і цей товар справді був у
//    його складі. Третя не менш важлива за другу: без неї той, хто
//    купив гаманець за 3 800, написав би відгук про сумку за 15 000.
//
// 2. ПЕРЕВІРКА НА СЕРВЕРІ. У браузері вона нічого не варта: код
//    сторінки відкритий, запит можна надіслати без сторінки. Тому
//    таблиця закрита від браузера повністю, а пише в неї функція.
//
// 3. ОДНА ВІДПОВІДЬ НА ВСІ «НЕ ЗІЙШЛОСЬ». Інакше форма стала б
//    способом дізнатись, що людина купувала.
//
// 4. ВІДГУК НЕ З'ЯВЛЯЄТЬСЯ САМ. Кожен проходить модерацію: власник
//    тисне кнопку в Telegram. Відгук, який публікується автоматично,
//    рано чи пізно принесе спам.
//
// 5. ЗІРКИ ВМИКАЮТЬСЯ САМІ. Розмітка вже вміє aggregateRating і
//    свідомо ховає його, поки відгуків нуль (рейтинг без відгуків —
//    пряма причина ручних санкцій Google). Щойно з'явиться перший
//    опублікований відгук, зірки з'являться без жодного перемикача.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

function loadModule(rel, names) {

    const src = read(rel)
        .replace(/^export\s+/gm, "")
        .concat("\nmodule.exports = { " + names.join(", ") + " };");

    const module = { exports: {} };

    new Function("module", "exports", src)(module, module.exports);

    return module.exports;

}

const rev = loadModule("supabase/functions/telegram-order-bot/reviews.js", [
    "REVIEW_LIMITS", "MIN_BODY", "reviewPhoneKey", "reviewPhoneMatches",
    "cleanReview", "orderHasProduct", "stars", "reviewCard", "reviewKeyboard",
    "parseReviewAction", "reviewVerdictLine",
]);

const migration = read("supabase/migrations/019-reviews.sql");
const indexTs = read("supabase/functions/telegram-order-bot/index.ts");
const pageJs = read("assets/js/reviews.js");
const page = read("product.html");

const good = {
    product_id: 20,
    order_number: "4821507392",
    phone: "+380 73 728 82 91",
    author: "Ірина",
    rating: 5,
    body: "Сумка саме така, як на фото. Шкіра щільна, фурнітура важка.",
};

console.log("\n[1] Відгук лише від того, хто купував");
{
    check("правильний відгук проходить", rev.cleanReview(good).ok === true,
        rev.cleanReview(good).reason);

    check("без номера замовлення — ні",
        rev.cleanReview({ ...good, order_number: "" }).ok === false);

    check("без телефону — ні",
        rev.cleanReview({ ...good, phone: "" }).ok === false);

    check("короткий телефон — ні",
        rev.cleanReview({ ...good, phone: "1234" }).ok === false);

    check("оцінка поза межами — ні",
        rev.cleanReview({ ...good, rating: 0 }).ok === false
        && rev.cleanReview({ ...good, rating: 6 }).ok === false
        && rev.cleanReview({ ...good, rating: 4.5 }).ok === false);

    check("без імені — ні", rev.cleanReview({ ...good, author: "  " }).ok === false);

    // «ок» і «+» не кажуть нічого ні покупцеві, ні Google.
    check("занадто короткий текст — ні",
        rev.cleanReview({ ...good, body: "ок" }).ok === false);

    check("є мінімум тексту", rev.MIN_BODY >= 10, String(rev.MIN_BODY));

    check("довгий текст обрізається",
        rev.cleanReview({ ...good, body: "я".repeat(5000) }).review.body.length
        === rev.REVIEW_LIMITS.body);

    // ТРЕТЯ ПЕРЕВІРКА, без якої дві перші нічого не варті.
    const order = { items: [{ id: 34, title: "Гаманець" }] };

    check("товару немає в замовленні — не проходить",
        rev.orderHasProduct(order, 20) === false);

    check("товар у замовленні — проходить",
        rev.orderHasProduct(order, 34) === true);

    check("id рядком теж збігається",
        rev.orderHasProduct({ items: [{ id: "34" }] }, 34) === true);

    check("порожнє замовлення нічого не підтверджує",
        rev.orderHasProduct({}, 34) === false
        && rev.orderHasProduct(null, 34) === false);
}

console.log("\n[2] Телефон збігається в будь-якому записі");
{
    const stored = "+380 73 728 82 91";

    ["0737288291", "380737288291", "80737288291", "737288291"]
        .forEach(typed => check(`«${typed}»`, rev.reviewPhoneMatches(stored, typed)));

    check("інший номер — ні", rev.reviewPhoneMatches(stored, "0501112233") === false);

    // Порожній ключ не збігається ні з чим — включно з іншим порожнім.
    check("порожній проти порожнього — ні", rev.reviewPhoneMatches("", "") === false);

    check("ключ — 9 цифр", rev.reviewPhoneKey(stored) === "737288291");

    // Те саме правило, що на сторінці «Де моє замовлення»: у базі
    // лежить те, що набрали при оформленні.
    const lookup = loadModule("supabase/functions/telegram-order-bot/order-lookup.js", ["phoneKey"]);

    check("правило те саме, що в перевірці замовлення",
        rev.reviewPhoneKey(stored) === lookup.phoneKey(stored));
}

console.log("\n[3] Перевірка на сервері, а не в браузері");
{
    check("сервер звіряє телефон",
        /reviewPhoneMatches\(order\.phone, review\.phone\)/.test(indexTs));

    check("сервер звіряє склад замовлення",
        /orderHasProduct\(order, review\.productId\)/.test(indexTs));

    check("і це одна гілка з однією відповіддю",
        /if \(!order[\s\S]{0,220}?error: "not_verified"/.test(indexTs));

    // Таблиця закрита від браузера повністю.
    check("RLS увімкнено, політик немає",
        /alter table public\.reviews enable row level security/.test(migration)
        && !/create policy[\s\S]*on public\.reviews/.test(migration));

    check("додавання доступне лише службовому ключу",
        /grant execute on function public\.add_review\([^)]*\) to service_role/.test(migration)
        && /revoke all on function public\.add_review\([^)]*\) from anon, authenticated/.test(migration));

    // Читання — можна всім, але ЛИШЕ опублікованих.
    check("читання опублікованих доступне відвідувачу",
        /grant execute on function public\.product_reviews\(bigint\) to anon, authenticated/.test(migration));

    check("функція читання віддає тільки published",
        /product_reviews[\s\S]{0,600}?status = 'published'/.test(migration));

    // Дивимось саме на ПЕРЕЛІК КОЛОНОК функції, а не на текст навколо:
    // у коментарі над нею order_number згадується навмисно — там
    // написано, чого ми не віддаємо. Правило про код, а не про
    // розповідь про код.
    const columns = (migration.match(
        /create or replace function public\.product_reviews[\s\S]*?returns table \(([\s\S]*?)\)/) || [])[1] || "";

    check(`віддає тільки ${columns.split(",").length} потрібні колонки`,
        Boolean(columns) && !/order_number|status|id/.test(columns),
        columns.replace(/\s+/g, " ").trim());

    // Межа звернень — та сама, що на сторінці перевірки замовлення.
    check("є межа звернень", /lookupAllowed\(clientIp\(request\)\)/.test(
        (indexTs.match(/async function handleAddReview[\s\S]{0,2000}/) || [""])[0]));

    check("база теж перевіряє, що замовлення існує",
        /add_review[\s\S]{0,1400}?from public\.orders[\s\S]{0,120}?order_number = p_order_number/.test(migration));
}

console.log("\n[4] Модерація в Telegram");
{
    check("картка показує оцінку зірками", /★/.test(rev.stars(4)), rev.stars(4));

    check("зірки не виходять за межі",
        rev.stars(9) === "★★★★★" && rev.stars(-1) === "☆☆☆☆☆");

    const card = rev.reviewCard(rev.cleanReview(good).review, "Сумка Coach Tabby 26");

    check("у картці є товар", /Сумка Coach Tabby 26/.test(card));
    check("є оцінка", /★★★★★/.test(card));
    check("є текст відгуку", /Шкіра щільна/.test(card));
    check("є автор", /Ірина/.test(card));

    // Номер потрібен, щоб подивитись саму покупку, якщо відгук
    // виглядає дивно.
    check("є номер замовлення", /4821507392/.test(card));

    // Розмітка Telegram не має ламатись від кутових дужок у тексті.
    const nasty = rev.reviewCard(
        rev.cleanReview({ ...good, author: "<b>хтось</b>", body: "текст <script>alert(1)</script> далі" }).review,
        "<i>товар</i>");

    check("розмітка екранується",
        /&lt;b&gt;/.test(nasty) && /&lt;script&gt;/.test(nasty) && /&lt;i&gt;/.test(nasty));

    const keyboard = rev.reviewKeyboard(7);

    check("дві кнопки", keyboard.inline_keyboard[0].length === 2);

    check("показати", keyboard.inline_keyboard[0][0].callback_data === "rev:7:pub");
    check("відхилити", keyboard.inline_keyboard[0][1].callback_data === "rev:7:rej");

    check("натискання розбирається",
        rev.parseReviewAction("rev:7:pub").status === "published"
        && rev.parseReviewAction("rev:7:rej").status === "rejected"
        && rev.parseReviewAction("rev:7:pub").id === 7);

    check("чуже натискання не розбирається",
        rev.parseReviewAction("o:7:pub") === null
        && rev.parseReviewAction("rev:x:pub") === null
        && rev.parseReviewAction("") === null);

    check("функція обробляє кнопку", /data\.startsWith\("rev:"\)/.test(indexTs));

    check("тільки власник може модерувати",
        /handleReviewCallback[\s\S]{0,500}?isOwner\(callback\.message/.test(indexTs));

    // Через тиждень мусить бути видно, що з відгуком зробили.
    check("рішення дописується в саме повідомлення",
        /reviewVerdictLine\(action\.status\)/.test(indexTs)
        && /editMessageText/.test(indexTs));

    check("статус за замовчуванням — не опублікований",
        /status\s+text\s+not null default 'new'/.test(migration));
}

console.log("\n[5] Зірки в розмітці вмикаються самі");
{
    const productJs = read("assets/js/product.js");
    const builder = read("scripts/build-product-pages.js");

    // Це вже було й лишається: рейтинг без жодного відгуку не
    // показуємо. Саме тому зірки й з'являться самі.
    check("розмітка вимагає відгуків",
        /product\.rating && Number\(product\.reviews\) > 0/.test(productJs));

    check("те саме в генераторі сторінок",
        /reviews/.test(builder) && /aggregateRating/.test(builder));

    // Зведення з бази переважає ручний рейтинг: у 73 товарах він
    // заповнений руками, а відгуків немає ні в одного.
    check("збірка читає зведення з бази",
        /function reviewStats\(\)/.test(read("scripts/build-products.js")));

    check("числа з бази переважають ручні",
        /product\.rating = own\.rating;[\s\S]{0,80}product\.reviews = own\.reviews;/
            .test(read("scripts/build-products.js")));

    const pull = require("../scripts/pull-reviews.js");

    check("нуль відгуків у зведення не потрапляє",
        Object.keys(pull.shape([{ product_id: 1, reviews: 0, rating: 5 }])).length === 0);

    check("оцінка поза межами не потрапляє",
        Object.keys(pull.shape([{ product_id: 1, reviews: 3, rating: 9 }])).length === 0);

    check("правильний рядок потрапляє",
        pull.shape([{ product_id: 20, reviews: 3, rating: 4.6667 }])["20"].rating === 4.7);

    check("крок у збірці стоїть до складання товарів",
        (() => {
            const build = JSON.parse(read("package.json")).scripts.build;
            return build.indexOf("pull-reviews.js") < build.indexOf("build-products.js");
        })());

    check("прод-збірка теж тягне зведення",
        /pull-reviews\.js/.test(read(".github/workflows/build-products.yml")));

    check("і збірка dev",
        /SUPABASE_SERVICE_ROLE_KEY/.test(
            (read(".github/workflows/build-dev.yml").match(/Build \(development\)[\s\S]{0,300}/) || [""])[0]));

    // Без ключа збірка не падає: відгуки це доповнення, а не умова.
    check("без ключа крок просто нічого не робить",
        /SUPABASE_SERVICE_ROLE_KEY не заданий/.test(read("scripts/pull-reviews.js")));
}

console.log("\n[6] Сторінка товару");
{
    ["productReviews", "reviewsList", "reviewsSummary", "reviewForm",
        "reviewOrder", "reviewPhone", "reviewAuthor", "reviewBody", "reviewDone"]
        .forEach(id => check(`id ${id}`, page.includes(`id="${id}"`)));

    check("скрипт підключений", /assets\/js\/reviews\.js/.test(page));

    // Блок прихований, поки міграції немає: сторінка товару мусить
    // працювати як раніше.
    check("блок прихований за замовчуванням",
        /id="productReviews" hidden>/.test(page));

    check("оцінка — звичайні радіокнопки, а не клікабельні зірочки",
        (page.match(/name="reviewRating"/g) || []).length === 5);

    // Людині треба сказати, що відгук не з'явиться одразу — інакше
    // вона оновить сторінку й вирішить, що він зник.
    check("сказано про модерацію", /опублікуємо на сторінці товару/.test(page));

    check("сторінка показує одну відповідь на «не зійшлось»",
        (pageJs.match(/showError\("Не змогли підтвердити/g) || []).length === 1);

    check("окремо повідомляє про межу звернень",
        /response\.status === 429/.test(pageJs));

    // Номер замовлення з листа.
    check("номер підхоплюється з адреси",
        /URLSearchParams\(window\.location\.search\)\.get\("order"\)/.test(pageJs));

    check("і форма одразу розкривається",
        /formBox\.hidden = false/.test(pageJs));

    check("текст відгуку показується з переносами",
        /white-space:pre-line/.test(read("assets/css/style.css")));
}

console.log("\n[7] Прохання написати відгук");
{
    const mail = read("supabase/functions/telegram-order-bot/mail.js");

    check("лист є", /export function reviewLetter/.test(mail));

    check("посилання веде на сторінку товару з номером",
        /\?order=\$\{encodeURIComponent\(number\)\}#productReviews/.test(mail));

    check("у листі є фото з alt",
        /reviewLetter[\s\S]{0,2000}?alt="\$\{title\}"/.test(mail));

    check("сказано, що знадобиться номер і телефон",
        /reviewLetter[\s\S]{0,2600}?номер замовлення/.test(mail));

    const script = read("scripts/request-reviews.js");

    check("скрипт є", fs.existsSync(path.join(ROOT, "scripts/request-reviews.js")));

    // Знімок замовлення не містить slug — його треба дібрати з
    // каталогу, інакше посилання в листі не буде.
    check("адреси товарів беруться з каталогу", /function slugById\(\)/.test(script));

    check("і додаються в склад замовлення",
        /slug: slugs\.get\(Number\(item && item\.id\)\)/.test(script));

    // Позначка ЛИШЕ після успішної відправки.
    check("позначка після відправки, а не до",
        /const ok = await send\(letter, row\.email\);[\s\S]{0,120}?if \(!ok\) continue;/.test(script));

    check("не пишемо двічі", /review_requests/.test(migration) && /review_requests/.test(script));

    check("не пишемо тому, хто вже написав",
        /review_candidates[\s\S]{0,900}?from public\.reviews r/.test(migration));

    check("строк — тиждень за замовчуванням",
        /p_days integer default 7/.test(migration));

    const workflow = read(".github/workflows/request-reviews.yml");

    check("розклад раз на добу", /cron: "0 9 \* \* \*"/.test(workflow));

    check("можна запустити руками", /workflow_dispatch/.test(workflow));

    check("без ключів нічого не робить",
        /Немає ключа розсилки/.test(script) && /Немає MAIL_FROM/.test(script));

    check("без міграції теж не падає",
        /review_candidates немає/.test(script));
}

console.log(failures === 0
    ? "\n✅ Відгуки: тільки від покупця, тільки після модерації, зірки самі\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
