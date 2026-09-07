// Піксель Meta: реклама у Facebook та Instagram бачить дії на сайті.
//
// ГОЛОВНЕ, ЩО СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// -----------------------------------
// 1. БЕЗ ЗГОДИ — НІЧОГО. І згода саме на рекламу, а не на статистику:
//    це різні цілі, і галочка «статистика» пікселя не вмикає.
//
// 2. ID ТОВАРУ ЗБІГАЄТЬСЯ З ФІДОМ. Це та єдина річ, від якої залежить,
//    чи працює динамічний ретаргетинг. Піксель каже «людина дивилася
//    товар X», Meta шукає X у каталозі — і якщо формули ідентифікатора
//    розійшлись, вона не знаходить нічого. Помилка мовчазна: події
//    їдуть, реклама показується, але не та.
//
// 3. НАЗВИ ПОДІЙ — СТАНДАРТНІ. Своя назва для Meta означає подію, на
//    яку не можна оптимізувати показ: вона просто лежить у звіті.
//
// 4. ПЕРСОНАЛЬНІ ДАНІ НЕ ЙДУТЬ. Ім'я, телефон, пошта й адреса довірені
//    магазину, а не рекламній компанії.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const analytics = read("assets/js/analytics.js");
const code = analytics.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const consent = read("assets/js/consent.js").replace(/\/\/[^\n]*/g, "");

console.log("\n[1] Без згоди на РЕКЛАМУ піксель не завантажується");
{
    check("заборона виставляється одразу, до завантаження",
        /fb\("consent", "revoke"\)/.test(code)
        && code.indexOf('fb("consent", "revoke")') < code.indexOf("function loadMetaScript"));

    check("згода на рекламу — окрема від статистики",
        /function adsAllowed\(\)[\s\S]{0,120}Consent\.has\("ads"\)/.test(code));

    check("скрипт Meta вантажиться лише через adsAllowed",
        /if \(pixelId && adsAllowed\(\)\) enableAds\(\)/.test(code));

    check("галочка «статистика» пікселя НЕ вмикає",
        !/analytics[\s\S]{0,40}enableAds/.test(code)
        && /detail\.ads && pixelId\) enableAds/.test(code));

    check("кожна подія перевіряє згоду на рекламу",
        /function metaSend\([\s\S]{0,160}!adsAllowed\(\)\) return/.test(code));

    // Згоду можна відкликати посиланням «Налаштування даних» —
    // скрипти вже на сторінці, і сказати їм про це треба прямо.
    check("відкликання згоди гасить піксель",
        /function disable\(\)[\s\S]{0,200}fb\("consent", "revoke"\)/.test(code));

    check("порожній ідентифікатор = піксель вимкнений",
        /if \(metaLoaded \|\| !pixelId\) return/.test(code));

    // Черга тримає проміжок «згода є, скрипт ще вантажиться» — на
    // сторінці товару це реальні пів секунди, і саме в них стається
    // view_item. Події ДО згоди в чергу не потрапляють зовсім:
    // metaSend() виходить раніше (перевірка вище).
    check("своя черга на час завантаження скрипта",
        /var pendingMeta = \[\]/.test(code)
        && /if \(pendingMeta\.length < 40\) pendingMeta\.push/.test(code));

    check("черга дозаливається після завантаження",
        /pendingMeta\.splice\(0\)\.forEach[\s\S]{0,120}metaSend\(item\.name, item\.params\)/.test(code));

    // Дві системи — дві черги. З однією подія, віддана в GA4, зникала
    // б для пікселя.
    check("черги роздільні", /var pending = \[\]/.test(code) && /var pendingMeta = \[\]/.test(code));

    // Категорія мусить існувати в самому модулі згоди, інакше
    // Consent.has("ads") завжди повертав би true (як для necessary).
    check("категорія «ads» заведена в consent.js",
        /var OPTIONAL = \["embeds", "analytics", "ads"\]/.test(consent));
}

console.log("\n[2] Ідентифікатор товару збігається з фідом");
{
    // Формула з analytics.js — витягуємо й виконуємо саму функцію, а не
    // перевіряємо її текст: збіг має бути фактичним.
    const source = analytics.match(/function metaContentId\(product, extra\) \{[\s\S]*?\n    \}\n/);

    check("функція metaContentId знайдена", Boolean(source));

    const root = { Translit: require("../assets/js/translit.js") };

    // eslint-disable-next-line no-new-func
    const metaContentId = new Function("root", `${source[0]}; return metaContentId;`)(root);

    const feed = require("../scripts/build-feed.js");
    const Stock = require("../assets/js/stock.js");
    const products = JSON.parse(read("data/products.json"));

    const mismatch = [];
    let compared = 0;

    products.forEach(product => {
        (product.variants || []).forEach((variant, index) => {

            const sizes = Stock.sizesOf(product, variant)
                .filter(size => size && size !== "ONESIZE");

            const rows = sizes.length ? sizes : [null];

            rows.forEach(size => {

                const inFeed = feed.itemId(product, variant, index, size);

                // Так це бачить картка каталогу — справжня назва кольору.
                const byName = metaContentId(product, { color: variant.color, size: size });

                // А так — сторінка товару: колір приїхав з адреси, тобто
                // латиницею.
                const slug = root.Translit.toSlug(variant.color || "");
                const bySlug = metaContentId(product, { color: slug, size: size });

                compared++;

                if (byName !== inFeed) mismatch.push(`${inFeed} ← назва дала ${byName}`);
                if (bySlug !== inFeed) mismatch.push(`${inFeed} ← slug дав ${bySlug}`);

            });
        });
    });

    check(`порівняно ${compared} позицій`, compared > 100, compared);

    check("id пікселя = id фіда (і за назвою кольору, і за slug-ом)",
        mismatch.length === 0, mismatch.slice(0, 3).join(" | "));

    // Найчастіший спосіб зламати збіг — почати надсилати product.id.
    check("це не product.id",
        metaContentId({ id: 7, variants: [{ color: "Чорний", article: "7-1" }] }, {}) === "7-1");

    check("ONESIZE у ідентифікатор не потрапляє",
        metaContentId({ id: 7, variants: [{ color: "Чорний", article: "7-1" }] },
            { size: "ONESIZE" }) === "7-1");

    check("справжній розмір потрапляє",
        metaContentId({ id: 7, variants: [{ color: "Чорний", article: "7-1" }] },
            { size: "38" }) === "7-1-38");
}

console.log("\n[3] Події — стандартні для Meta");
{
    const map = analytics.match(/var META_EVENTS = \{([\s\S]*?)\};/);

    check("перелік подій знайдено", Boolean(map));

    const pairs = [...map[1].matchAll(/(\w+):\s*"(\w+)"/g)].map(m => [m[1], m[2]]);

    // Ті самі назви, що приймає Meta. Помилка в одній літері дає подію,
    // на яку не можна оптимізувати показ.
    const expected = {
        view_item: "ViewContent",
        add_to_cart: "AddToCart",
        add_to_wishlist: "AddToWishlist",
        begin_checkout: "InitiateCheckout",
        add_payment_info: "AddPaymentInfo",
        purchase: "Purchase",
        search: "Search"
    };

    Object.keys(expected).forEach(ga => {
        const hit = pairs.find(p => p[0] === ga);
        check(`${ga} → ${expected[ga]}`, hit && hit[1] === expected[ga], hit && hit[1]);
    });

    // Події без стандартного відповідника краще не переливати власними
    // назвами: це шум, який нікуди не підключений.
    ["view_item_list", "select_item", "view_cart", "remove_from_cart"].forEach(ga => {
        check(`${ga} у Meta не йде`, !pairs.some(p => p[0] === ga));
    });

    check("покупка везе номер замовлення для склейки з серверними подіями",
        /name === "purchase" && params\.transaction_id[\s\S]{0,80}order_id/.test(code));

    check("товари їдуть і як content_ids, і як contents",
        /content_ids: items\.map/.test(code) && /contents: items\.map/.test(code));
}

console.log("\n[4] Персональні дані в піксель не йдуть");
{
    // У payload мусять бути лише товари, сума й валюта.
    ["email", "phone", "customer_name", "address"].forEach(field => {
        check(`немає поля ${field}`, !new RegExp(field).test(code));
    });

    // «Розширений збіг» (advanced matching) — це третій аргумент
    // fbq("init", id, {em, ph}): туди кладуть хеш пошти й телефона, щоб
    // Meta впізнала людину. Ми його не передаємо, і перевіряти треба
    // саме форму виклику: шукати «em:» текстом безглуздо — воно
    // знаходиться у власних назвах на кшталт view_item.
    check("init без розширеного збігу (без пошти й телефона)",
        /fb\("init", pixelId\);/.test(code));

    // Замість пошуку окремих слів — повний перелік звернень до пікселя.
    // Так видно ВСЕ, що модуль йому каже: з'явиться зайвий виклик (хоч
    // із хешем пошти, хоч із чимось іншим) — тест його покаже.
    // [^)]+ — з аргументами: так у перелік не потрапляє сам опис
    // function fb() {…}.
    const calls = [...code.matchAll(/fb\(([^)]+)\)/g)]
        .map(m => m[1].replace(/\s+/g, " ").trim());

    const allowed = [
        '"consent", "revoke"',
        '"consent", "grant"',
        '"init", pixelId',
        '"track", "PageView"',
        '"track", "Search", { search_string: params.search_term }',
        '"track", event, payload',

        // Той самий track, але з четвертим аргументом { eventID }.
        //
        // З'явився разом із серверними конверсіями (Conversions API):
        // ту саму покупку тепер надсилають браузер і сервер, і Meta
        // зводить їх в одну лише за однаковим event_id. Без цього
        // аргумента конверсія рахувалась би двічі — тобто ціна
        // залучення виглядала б удвічі нижчою, ніж вона є.
        //
        // Персональних даних тут немає: eventID — це «purchase.» плюс
        // номер замовлення. Див. docs/КОНВЕРСІЇ-META.md.
        '"track", event, payload, options'
    ];

    const extra = calls.filter(call => allowed.indexOf(call) === -1);

    check(`звернень до пікселя — ${calls.length}, усі відомі`,
        extra.length === 0, extra.join(" | "));

    check("у покупці — лише номер, сума й склад",
        /payload\.order_id = params\.transaction_id/.test(code)
        && !/order\.(name|phone|email)/.test(code));
}

console.log("\n[5] Налаштування живе в адмінці, а не в коді");
{
    const config = JSON.parse(read("data/analytics.json"));

    check("ідентифікатор пікселя в data/analytics.json",
        /^\d{15,16}$/.test(String(config.metaPixelId || "")), config.metaPixelId);

    check("у коді ідентифікатора немає",
        !/1837932737651247/.test(analytics));

    const admin = read("admin/config.yml");

    check("поле є в адмінці", /name: "metaPixelId"/.test(admin));

    check("формат перевіряється в адмінці",
        /\^\(\[0-9\]\{15,16\}\)\?\$/.test(admin));
}

console.log(failures === 0
    ? "\n✅ Піксель: згода окрема, id збігається з фідом\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
