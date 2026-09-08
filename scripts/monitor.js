// Чи живий сайт і чи не зламала його остання збірка.
//
// НАВІЩО
// -------
// Сайт статичний, тобто «впасти» в звичному сенсі не може — але може
// виїхати зламаним. Порожній каталог, robots.txt із дев-середовища,
// сторінка товару, яка більше не відкривається: усе це публікується
// автоматично й нікому нічого не каже. Досі про таке дізнавались від
// покупця.
//
// Цей крок раз на пів години відкриває сайт ззовні — так само, як це
// зробив би покупець, — і перевіряє, що магазин на місці. Впала хоч
// одна перевірка — GitHub надсилає лист про провалений workflow.
//
// НАЙВАЖЛИВІШІ ПЕРЕВІРКИ ТУТ — НЕ «ЧИ ВІДКРИЄТЬСЯ»
// --------------------------------------------------
// Сторінка, що віддає 200 з порожнім каталогом, гірша за сторінку,
// яка не відкрилась: другу видно одразу. Тому перевіряється ще й
// вміст: скільки товарів у каталозі, що robots.txt не забороняє
// індексацію (це буквально зникнення з пошуку) і що адреси в sitemap
// ведуть на цей самий домен, а не на дев.
//
// ЗАПУСК
//   node scripts/monitor.js                перевірити прод
//   node scripts/monitor.js --env=development     перевірити дев
//   node scripts/monitor.js --url=https://…       довільна адреса

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));

function arg(name) {

    const found = process.argv.find(a => a.startsWith(`--${name}=`));

    return found ? found.split("=").slice(1).join("=") : "";

}

const ENV = arg("env") || process.env.SITE_ENV || "production";

const SITE = (arg("url") || (config[ENV] && config[ENV].url) || "").replace(/\/+$/, "");

if (!SITE) {
    console.error(`Не знаю адреси середовища «${ENV}»`);
    process.exit(1);
}

const INDEXABLE = arg("url") ? ENV === "production" : Boolean(config[ENV] && config[ENV].indexable);

const results = [];

function record(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " → " + detail : ""}`);
}

// Одна спроба нічого не доводить: GitHub Pages і Cloudflare іноді
// віддають 5xx на пару секунд під час викладки. Лист про падіння
// сайту, який насправді живий, швидко привчають ігнорувати — а тоді
// й справжній лишиться непрочитаним.
async function get(url, attempt) {

    try {

        const response = await fetch(url, {
            redirect: "follow",
            headers: { "User-Agent": "bestbrnd4u-monitor" }
        });

        const body = await response.text();

        if (response.status >= 500 && (attempt || 0) < 1) throw new Error(`HTTP ${response.status}`);

        return { status: response.status, body };

    } catch (error) {

        if ((attempt || 0) < 1) {

            await new Promise(resolve => setTimeout(resolve, 5000));

            return get(url, (attempt || 0) + 1);

        }

        return { status: 0, body: "", error: error.message };

    }

}

// Заголовки відповіді — для перевірки кешу.
//
// Окремий помічник, бо get() віддає лише статус і тіло, а тут
// потрібні саме заголовки: cache-control і cf-cache-status.
async function headers(url) {

    try {

        const response = await fetch(url, {
            method: "GET",
            redirect: "follow",
            headers: { "User-Agent": "bestbrnd4u-monitor" }
        });

        // Тіло читаємо й відкидаємо: без цього з'єднання лишається
        // висіти, і крок інколи не завершується.
        await response.text();

        const out = {};

        response.headers.forEach((value, name) => {
            out[name.toLowerCase()] = value;
        });

        return out;

    } catch (error) {

        return null;

    }

}

// Скільки секунд браузеру дозволено тримати файл.
function maxAge(value) {

    const match = /max-age=(\d+)/i.exec(String(value || ""));

    return match ? Number(match[1]) : 0;

}

// Публічний ключ проєкту беремо з коду сайту, а не дублюємо тут:
// два екземпляри одного ключа рано чи пізно розійдуться, і
// моніторинг почне падати на власній копії. Ключ публічний за
// задумом Supabase — прав в обхід політик бази він не дає.
function publicKey() {

    const src = fs.readFileSync(path.join(ROOT, "assets/js/supabase-client.js"), "utf8");

    const url = src.match(/const SUPABASE_URL = "([^"]+)"/);
    const key = src.match(/const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/);

    return url && key ? { url: url[1], key: key[1] } : null;

}

// Наявність очима відвідувача: та сама функція, яку кличе
// assets/js/live-stock.js із браузера.
async function liveStock() {

    const client = publicKey();

    if (!client) return null;

    try {

        const response = await fetch(`${client.url}/rest/v1/rpc/stock_live`, {
            method: "POST",
            headers: {
                apikey: client.key,
                Authorization: `Bearer ${client.key}`,
                "Content-Type": "application/json"
            },
            body: "{}"
        });

        if (!response.ok) return null;

        const rows = await response.json();

        return Array.isArray(rows) ? rows : null;

    } catch (error) {

        return null;

    }

}

// Чи знає розгорнута функція про маршрут.
//
// НАВІЩО. Нова можливість функції жива лише після ДВОХ дій власника:
// міграція в базі й перерозгортання функції. Пропустити друге легко —
// код у гілці є, тести зелені, а на сайті мовчок. Саме так уже було з
// відгуками: маршрут відповідав «ignored», і виявилось це випадково.
//
// Питаємо НАВМИСНО НЕПРАВИЛЬНИМИ даними: свіжа функція відповість
// зрозумілою відмовою (це й означає «маршрут є»), стара — не знатиме
// такого site_action. У базу при цьому нічого не пишеться й лічильник
// звернень не витрачається: перевірка вхідних даних стоїть першою.
async function functionRoute(action, body) {

    const client = publicKey();

    if (!client) return null;

    try {

        const response = await fetch(`${client.url}/functions/v1/telegram-order-bot`, {
            method: "POST",
            headers: {
                apikey: client.key,
                Authorization: `Bearer ${client.key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ site_action: action, ...body })
        });

        return { status: response.status, text: (await response.text()).slice(0, 200) };

    } catch (error) {

        return null;

    }

}

// Запис DNS через HTTPS.
//
// Через HTTPS, а не системний резолвер: у CI його налаштування
// невідомі, а тут потрібна однакова відповідь незалежно від того,
// де запущено перевірку.
async function dnsTxt(name) {

    try {

        const response = await fetch(
            `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=TXT`,
            { headers: { Accept: "application/dns-json" } }
        );

        if (!response.ok) return null;

        const data = await response.json();

        // Status 3 — «такого імені немає». Це не збій запиту, це
        // відповідь: записів немає.
        if (!Array.isArray(data.Answer)) return [];

        return data.Answer.map(row => String(row.data || "").replace(/"/g, ""));

    } catch (error) {

        // Немає мережі або DNS не відповів — це не «немає запису».
        return null;

    }

}

async function main() {

    console.log(`\nПеревіряю ${SITE}\n`);

    // ---- 1. сторінки відкриваються ----

    const home = await get(`${SITE}/`);

    record("головна відкривається", home.status === 200, `HTTP ${home.status}${home.error ? " " + home.error : ""}`);

    record("головна — це магазин, а не заглушка",
        /id="cartCount"/.test(home.body) && /<footer/.test(home.body));

    const catalog = await get(`${SITE}/catalog`);

    record("каталог відкривається", catalog.status === 200, `HTTP ${catalog.status}`);

    record("каталог має куди малювати товари", /id="catalogGrid"/.test(catalog.body));

    // ---- 2. дані каталогу ----

    const data = await get(`${SITE}/data/products.json`);

    let live = [];

    try {
        live = JSON.parse(data.body);
    } catch (error) {
        live = null;
    }

    record("data/products.json — коректний JSON", Array.isArray(live),
        Array.isArray(live) ? "" : (data.status === 200 ? "не розібрався" : `HTTP ${data.status}`));

    if (Array.isArray(live)) {

        // Скільки товарів МАЄ бути — беремо з репозиторію, який
        // перевірка й так має під рукою. Жорстке число тут довелося б
        // правити щоразу, коли каталог росте.
        const expected = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "products.json"), "utf8")).length;

        // Половина — не «майже все»: це запас на те, що репозиторій
        // попереду сайту на одну збірку. Провал тут означає, що
        // каталог виїхав порожнім або майже порожнім.
        record(`товарів у каталозі: ${live.length}`, live.length >= Math.floor(expected / 2),
            `у репозиторії ${expected}`);

        record("у товарів є ціни", live.every(p => Number(p.price) > 0),
            live.filter(p => !(Number(p.price) > 0)).slice(0, 3).map(p => p.slug).join(", "));

    }

    // ---- 3. сторінка товару ----

    const sitemap = await get(`${SITE}/sitemap.xml`);

    record("sitemap.xml віддається", sitemap.status === 200, `HTTP ${sitemap.status}`);

    const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

    // Адреси в карті сайту мусять вести на ЦЕЙ домен. Якщо туди
    // потрапив дев — Google піде індексувати тестову копію.
    const foreign = locs.filter(loc => !loc.startsWith(SITE));

    record("усі адреси в sitemap — з цього домену", foreign.length === 0,
        foreign.slice(0, 2).join(", "));

    const productUrl = locs.find(loc => loc.includes("/p/"));

    if (productUrl) {

        const product = await get(productUrl);

        record("сторінка товару відкривається", product.status === 200,
            `${productUrl} → HTTP ${product.status}`);

        // Кнопку «Купити» малює JavaScript, тож її наявність у
        // відповіді нічого не доводить. А от розмітка товару
        // (schema.org) стоїть у сторінці статично — і саме її читають
        // Google, Meta й будь-хто, кому потрібна ціна. Зникла ціна
        // означає зламану збірку сторінок товарів.
        const schema = (product.body.match(
            /<script type="application\/ld\+json" id="productSchema">([\s\S]*?)<\/script>/) || [])[1];

        let parsed = null;

        try {
            parsed = JSON.parse(schema);
        } catch (error) {
            parsed = null;
        }

        record("сторінка товару несе назву й ціну",
            Boolean(parsed && parsed.name && Number(parsed.offers && parsed.offers.price) > 0),
            parsed ? `${parsed.name} · ${parsed.offers && parsed.offers.price}` : "розмітки товару немає");

    } else {
        record("у sitemap є хоч один товар", false, `знайдено адрес: ${locs.length}`);
    }

    // ---- 4. те, чого не видно оком ----

    const robots = await get(`${SITE}/robots.txt`);

    record("robots.txt віддається", robots.status === 200, `HTTP ${robots.status}`);

    // Найдорожча помилка з можливих: robots.txt дев-середовища на
    // проді прибирає магазин із пошуку цілком, і жодна сторінка при
    // цьому не виглядає зламаною.
    if (INDEXABLE) {

        record("robots.txt не забороняє індексацію",
            !/^\s*Disallow:\s*\/\s*$/mi.test(robots.body));

        record("сторінки не позначені noindex",
            !/name="robots"[^>]*content="[^"]*noindex/i.test(home.body));

    }

    const feed = await get(`${SITE}/feed.xml`);

    const items = (feed.body.match(/<item>/g) || []).length;

    record(`товарний фід: ${items} позицій`, feed.status === 200 && items > 0,
        `HTTP ${feed.status}`);

    // ---- 5. живий залишок не суперечить каталогу ----
    //
    // Скільки одиниць мусить обіцяти каталог, щоб «немає» з бази
    // читалось як застарілий знімок, а не як зайняті замовленнями
    // одиниці.
    //
    // Резерв — це відкриті замовлення на ТОЙ САМИЙ колір і розмір.
    // Одне-два бувають щодня, п'яти на одну клітинку не буває.
    const STOCK_TRUST_FROM = 5;

    const liveRows = await liveStock();

    if (!liveRows) {

        // Недоступна база — не привід кричати про залишки: сайт при
        // цьому працює, живий залишок просто не уточнює наявність.
        record("живий залишок відповідає", false, "stock_live не відповіла");

    } else {

        // Товари вже завантажені вище (data/products.json) — другий
        // раз тягнути 260 КБ ні до чого. Наявність у ньому та сама,
        // що в лайт-каталозі: variants[].stock.
        const products = Array.isArray(live) ? live : [];

        record(`є з чим порівнювати: ${products.length} товарів`, products.length > 0);

        const unavailable = new Set(liveRows
            .filter(row => row.available !== true)
            .map(row => `${row.product_id}|${row.color || ""}|${row.size || ""}`));

        const hidden = [];

        products.forEach(product => {

            (product.variants || []).forEach(variant => {

                const stock = variant && variant.stock;

                if (!stock || typeof stock !== "object") return;

                Object.keys(stock).forEach(size => {

                    const qty = Number(stock[size]);

                    if (!Number.isFinite(qty) || qty < STOCK_TRUST_FROM) return;

                    if (!unavailable.has(`${product.id}|${variant.color || ""}|${size}`)) return;

                    hidden.push(`${product.title || product.id}: ${variant.color} — у каталозі ${qty}, база каже «немає»`);

                });

            });

        });

        // ЩО ЦЕ ЛОВИТЬ. Знімок залишків у базі застарів, і живий
        // залишок ховає з продажу товар, який у каталозі є. Окремо
        // жодне джерело не виглядає зламаним — видно тільки в
        // зіставленні.
        record("живий залишок не ховає товар, якого повно в каталозі",
            hidden.length === 0,
            hidden.slice(0, 5).join("; ") + (hidden.length > 5 ? ` … і ще ${hidden.length - 5}` : ""));

    }

    // ---- 6. підписи пошти ----
    //
    // Перевіряємо лише на проді: на dev-домені пошта не
    // налаштована й не має бути.
    if (INDEXABLE) {

        const host = SITE.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

        const dmarc = await dnsTxt(`_dmarc.${host}`);

        if (dmarc === null) {

            record("DMARC перевірено", false, "DNS не відповів");

        } else {

            // З лютого 2024 Gmail і Yahoo вимагають DMARC від усіх,
            // хто розсилає листи. Без нього лист про замовлення має
            // відчутно вищий шанс піти в спам — а магазин про це не
            // дізнається: листи просто тихо не доходять.
            const policy = dmarc.find(row => /^v=DMARC1/i.test(row.trim()));

            record("DMARC налаштований", Boolean(policy),
                policy ? "" : `немає TXT-запису _dmarc.${host} — листи про замовлення ризикують піти в спам`);

        }

    }

    // ---- 6а. функція знає про незавершене оформлення ----
    //
    // Перевіряємо лише на бойовому: на деві функція та сама, і другий
    // однаковий запит нічого не додає.
    if (INDEXABLE) {

        // Порожня пошта — свідомо недійсна: функція мусить відмовити,
        // і сама ця відмова означає, що маршрут у ній є.
        const draft = await functionRoute("checkout-draft", { email: "", items: [] });

        if (draft === null) {

            record("незавершене оформлення перевірено", false, "функція не відповіла");

        } else {

            record("функція знає про незавершене оформлення",
                draft.status === 200 && /"saved"\s*:\s*false/.test(draft.text),
                draft.status === 200 && !/saved/.test(draft.text)
                    ? "функцію не перерозгорнуто після міграції 020 — нагадування гостям не працюють"
                    : `HTTP ${draft.status} ${draft.text}`);

        }

    }

    // ---- 6б. кеш на краю ----
    //
    // Тільки на бойовому: перед девом Cloudflare Pages зі своїми
    // правилами, і порівнювати їх із цими немає сенсу.
    if (INDEXABLE) {

        // Файл коду з відбитком у адресі. Беремо той, що є на кожній
        // сторінці, — і саму адресу з розмітки, щоб відбиток був
        // справжній.
        const home = await get(`${SITE}/`);

        const asset = (home.body.match(/(?:href|src)="([^"]*assets\/(?:css|js)\/[^"]*\?v=[^"]*)"/) || [])[1];

        if (asset) {

            const url = asset.startsWith("http") ? asset : `${SITE}/${asset.replace(/^\/+/, "")}`;

            const head = await headers(url);

            if (!head) {

                record("кеш файлів коду перевірено", false, "файл не відповів");

            } else {

                const age = maxAge(head["cache-control"]);

                // Місяць — з великим запасом «надовго». Адреса несе
                // відбиток, тож змінений файл однаково приїде під
                // новою адресою, і старий кеш нікому не зашкодить.
                // Деталь — ЛИШЕ при провалі: record() друкує її завжди,
                // коли вона не порожня, і на успішній перевірці вона
                // казала власнику протилежне до правди.
                record(`файли коду кешуються надовго (${age} с)`, age >= 2592000,
                    age >= 2592000
                        ? ""
                        : (age
                            ? `зараз ${Math.round(age / 3600)} год — правило кешу в Cloudflare не налаштоване (див. docs/КЕШ.md)`
                            : head["cache-control"] || "немає cache-control"));

            }

        }

        // HTML: Cloudflare або кешує його на краю, або віддає DYNAMIC —
        // тобто щоразу йде до GitHub Pages.
        const page = await headers(`${SITE}/`);

        if (page) {

            const status = String(page["cf-cache-status"] || "").toUpperCase();

            record("сторінки кешуються на краю Cloudflare",
                status !== "DYNAMIC" && status !== "",
                status === "DYNAMIC"
                    ? "DYNAMIC — правило кешу для HTML не налаштоване (див. docs/КЕШ.md)"
                    : (status || "заголовка немає"));

        }

    }

    // ---- 6в. заголовки безпеки ----
    //
    // Усі ці заголовки додаються в панелі Cloudflare (SSL/TLS для
    // HSTS і одне Transform Rule для решти) — див. docs/МОНІТОРИНГ.md.
    // GitHub Pages своїх заголовків задавати не дає, тож із коду це
    // зробити неможливо; лишається перевіряти й нагадувати.
    if (INDEXABLE) {

        const head = await headers(`${SITE}/`);

        if (head === null) {

            record("заголовки безпеки перевірено", false, "сайт не відповів");

        } else {

            // Перелік навмисно короткий: рівно те, що вмикається двома
            // діями в панелі й нічого не ламає.
            const wanted = [
                ["strict-transport-security", "HSTS: SSL/TLS → Edge Certificates"],
                ["x-content-type-options", "nosniff"],
                ["referrer-policy", "strict-origin-when-cross-origin"],
                ["x-frame-options", "SAMEORIGIN"],
                ["permissions-policy", "camera=(), microphone=(), geolocation=()"]
            ];

            const missing = wanted.filter(([name]) => !head[name]);

            record(`заголовки безпеки: ${wanted.length - missing.length} з ${wanted.length}`,
                missing.length === 0,
                missing.length
                    ? `немає: ${missing.map(([name]) => name).join(", ")} — див. docs/МОНІТОРИНГ.md`
                    : "");

        }

    }

    // ---- 7. сторінка 404 ----

    const missing = await get(`${SITE}/monitor-check-${Date.now()}`);

    record("неіснуюча адреса віддає 404", missing.status === 404, `HTTP ${missing.status}`);

    record("сторінка 404 — це магазин, а не заглушка хостингу",
        /notFoundGrid/.test(missing.body) || /Такої сторінки немає/.test(missing.body));

    // ---- підсумок ----

    const failed = results.filter(r => !r.ok);

    console.log(`\n${"─".repeat(50)}`);
    console.log(`Перевірок: ${results.length}   Провалено: ${failed.length}`);

    if (failed.length) {

        console.log(`\n❌ ${SITE} — проблеми:`);
        failed.forEach(r => console.log(`   • ${r.name}${r.detail ? " (" + r.detail + ")" : ""}`));

        process.exit(1);

    }

    console.log(`\n✅ ${SITE} — магазин на місці\n`);

}

main().catch(error => {
    console.error("Моніторинг не зміг відпрацювати:", error);
    process.exit(1);
});
