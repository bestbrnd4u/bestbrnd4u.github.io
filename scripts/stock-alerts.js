// «Знову в наявності»: лист тим, хто просив повідомити.
//
// НАВІЩО
// -------
// Товар, якого немає на складі, сайт не ховає — він стає «під
// замовлення». Хто не готовий чекати 10–14 днів, лишає на сторінці
// товару пошту (кнопка «Повідомити, коли з'явиться», міграція 046).
// Цей крок щогодини перевіряє, чи з'явився саме той колір і розмір, і
// надсилає ОДИН лист.
//
// ЯК ВИРІШУЄМО «З'ЯВИВСЯ»
// ------------------------
// Тими самими правилами, що й сайт, і з тих самих джерел:
//   • data/products.json — залишки з адмінки (assets/js/stock.js);
//   • stock_live() у базі — мінус те, що вже зайняли замовлення
//     (assets/js/live-stock.js переносить це в ті самі поля).
// Без живого залишку не надсилаємо нічого: каталог міг би сказати
// «є», коли останню одиницю щойно забрали, — і лист привів би людину до
// «під замовлення».
//
// Товар «під замовлення ЗАВЖДИ» (preOrderAlways) не «з'являється»
// ніколи — такі підписки сайт і не приймає, а якщо лишились, мовчимо.
//
// ЧОГО НЕ РОБИМО
// ---------------
// Не пишемо вдруге: після листа підписка закрита (notified_at). Не
// пишемо на заблоковані адреси (scripts/blocked.js). Підписка, що
// чекає понад 180 днів, видаляється: через пів року «повідомте мене»
// вже не прохання, а сюрприз.
//
// ЗАПУСК
//   node scripts/stock-alerts.js              перевірити й надіслати
//   node scripts/stock-alerts.js --dry-run    показати, кому б надіслав

const fs = require("fs");
const path = require("path");

const { notConfigured } = require("./site-env");
const { blockedEmails, allowedToWrite } = require("./blocked");

const ROOT = path.join(__dirname, "..");

// Порядок важливий: live-stock.js бере Stock із глобального простору.
const Stock = require("../assets/js/stock.js");
const LiveStock = require("../assets/js/live-stock.js");

const { stockAlertLetter, mailRequest } = require("../supabase/functions/telegram-order-bot/mail.js");

// Назва й колір мовою підписки — тим самим перекладачем і словником, що
// й сайт (data/i18n-en.json, data/i18n-ru.json).
const I18nCore = require("../assets/js/i18n-core.js");

const translators = {};

function translator(lang) {
    if (lang !== "en" && lang !== "ru") return null;
    if (!(lang in translators)) {
        const file = path.join(ROOT, "data", `i18n-${lang}.json`);
        translators[lang] = fs.existsSync(file)
            ? I18nCore.createTranslator(JSON.parse(fs.readFileSync(file, "utf8")), lang)
            : null;
    }
    return translators[lang];
}

const DRY = process.argv.includes("--dry-run");

const EXPIRE_DAYS = 180;

// Більше за раз не шлемо: якщо щось пішло не так (скажімо, хтось
// масово обнулив і повернув залишки), шкода обмежена, а решта піде
// наступної години.
const MAX_LETTERS = 100;

function supabaseUrl() {

    if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/+$/, "");

    const client = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-client.js"), "utf8");

    const match = client.match(/https:\/\/[a-z0-9]+\.supabase\.co/i);

    if (!match) throw new Error("Не знайшов адресу Supabase у assets/js/supabase-client.js");

    return match[0];

}

function siteUrl() {

    const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));

    return ((config.production && config.production.url) || "").replace(/\/+$/, "");

}

function products() {

    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "products.json"), "utf8"));

    return Array.isArray(raw) ? raw : (raw.products || []);

}

// Чи є ЦЕЙ колір і розмір у наявності — після живого залишку.
//
// Чиста функція: тест ганяє її на зразках, не чіпаючи ні бази, ні
// пошти.
function available(product, color, size) {

    if (!product || product.preOrderAlways === true) return false;

    const variants = Array.isArray(product.variants) ? product.variants : [];

    const variant = color ? variants.find(v => v && v.color === color) : variants[0];

    if (!variant) return false;

    return size
        ? !Stock.sizePreOrder(product, variant, size)
        : !Stock.colorPreOrder(product, variant);

}

// Кому писати: підписки, чий варіант уже в наявності — після живого
// залишку. Рядки stock_live() переносяться в товари тим самим
// LiveStock.apply, що й на сайті; без них рішення не ухвалюємо (чому —
// у шапці файлу).
//
// Чиста функція, і саме вона, а не копія її кроків, перевіряється
// тестом: прибрати звідси живий залишок — тест червоніє.
function due(pending, list, liveRows) {

    if (!Array.isArray(liveRows)) throw new Error("Немає живого залишку — розсилку не починаємо");

    const live = new Map();

    liveRows.forEach(row => {
        live.set(LiveStock.cell(row.product_id, row.color, row.size), Boolean(row.available));
    });

    LiveStock.apply(list, live);

    const byId = new Map(list.map(p => [Number(p.id), p]));

    return (pending || [])
        .map(alert => ({ alert, product: byId.get(Number(alert.product_id)) }))
        .filter(x => available(x.product, x.alert.color, x.alert.size));

}

// Позиція для листа: назва, фото обраного кольору, ціна, посилання
// мовою підписки. Адреси абсолютні — у листі відносний шлях нема від
// чого відкладати.
function letterItem(product, alert, site) {

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variant = variants.find(v => v && v.color === alert.color) || variants[0] || {};

    const image = String((variant.images || product.images || [])[0] || "").replace(/^\/+/, "");

    const prefix = alert.lang === "en" || alert.lang === "ru" ? `/${alert.lang}` : "";

    const query = alert.color && variants.length > 1 ? `?color=${encodeURIComponent(alert.color)}` : "";

    const t = translator(alert.lang);
    const local = text => {
        const out = t && text ? t(text) : "";
        return out && out !== text ? out : "";
    };

    return {
        title: product.title || "",
        title_local: local(product.title || ""),
        color_local: local(alert.color || ""),
        brand: product.brand || "",
        price: Number(product.price) || 0,
        color: alert.color || "",
        size: alert.size || "",
        image: image ? `${site}/${image}` : "",
        url: `${site}${prefix}/p/${product.slug}/${query}`
    };

}

async function rest(url, key, pathname, init) {

    return fetch(`${url}/rest/v1/${pathname}`, {
        ...init,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            ...((init && init.headers) || {})
        }
    });

}

async function send(letter, to) {

    const request = mailRequest({
        to,
        from: process.env.MAIL_FROM,
        replyTo: process.env.MAIL_REPLY_TO,
        resendKey: process.env.RESEND_API_KEY,
        brevoKey: process.env.BREVO_API_KEY
    }, letter);

    if (!request) return false;

    const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body)
    });

    if (!response.ok) {
        console.error(`   ✗ ${to}: ${(await response.text()).slice(0, 160)}`);
        return false;
    }

    return true;

}

async function main() {

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {
        console.log("Немає SUPABASE_SERVICE_ROLE_KEY — розсилку «знову в наявності» пропускаю");
        return;
    }

    if (!DRY && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
        notConfigured("Немає ключа розсилки — листи «знову в наявності» пропускаю (див. docs/ЛИСТИ-ПОКУПЦЮ.md)");
        return;
    }

    if (!DRY && !process.env.MAIL_FROM) {
        notConfigured("Немає MAIL_FROM — листи «знову в наявності» пропускаю");
        return;
    }

    const url = supabaseUrl();
    const site = siteUrl();

    // Старі підписки — геть, до того як щось надсилати.
    if (!DRY) {
        const before = new Date(Date.now() - EXPIRE_DAYS * 86400000).toISOString();
        await rest(url, key, `stock_alerts?notified_at=is.null&created_at=lt.${encodeURIComponent(before)}`, { method: "DELETE" });
    }

    const pendingResponse = await rest(url, key,
        "stock_alerts?notified_at=is.null&select=id,product_id,color,size,email,lang&order=created_at.asc&limit=1000");

    if (!pendingResponse.ok) {

        const text = await pendingResponse.text();

        // Таблиці ще немає — «не налаштовано», а не збій.
        if (pendingResponse.status === 404 || /stock_alerts|PGRST205|42P01/.test(text)) {
            notConfigured("Немає таблиці stock_alerts — виконайте міграцію 046 (supabase/migrations/046-stock-alerts.sql)");
            return;
        }

        throw new Error(`stock_alerts → ${pendingResponse.status}: ${text.slice(0, 200)}`);

    }

    const pending = await pendingResponse.json();

    console.log(`Підписок, що чекають: ${pending.length}`);

    if (!pending.length) return;

    // Живий залишок. Без нього не шлемо нічого (чому — у шапці файлу).
    const liveResponse = await rest(url, key, "rpc/stock_live", { method: "POST", body: "{}" });

    if (!liveResponse.ok) {
        throw new Error(`stock_live → ${liveResponse.status}: ${(await liveResponse.text()).slice(0, 200)}`);
    }

    const ready = due(pending, products(), await liveResponse.json());

    console.log(`Уже в наявності: ${ready.length}`);

    const blocked = await blockedEmails(url, key);

    let sent = 0;

    for (const { alert, product } of ready) {

        if (sent >= MAX_LETTERS) break;

        if (!allowedToWrite(blocked, alert.email)) continue;

        const letter = stockAlertLetter(letterItem(product, alert, site), site, alert.lang);

        if (!letter) continue;

        if (DRY) {
            console.log(`   → ${alert.email}: ${letter.subject}`);
            sent++;
            continue;
        }

        if (!(await send(letter, alert.email))) continue;

        // Позначаємо ОДРАЗУ після листа, а не наприкінці: впаде крок на
        // сороковому — тридцять дев'ять уже надісланих не підуть удруге.
        await rest(url, key, `stock_alerts?id=eq.${Number(alert.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ notified_at: new Date().toISOString() })
        });

        console.log(`   ✓ ${letter.subject}`);

        sent++;

    }

    console.log(DRY ? `\n--dry-run: надіслав би ${sent}` : `\nНадіслано листів: ${sent}`);

}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { available, due, letterItem, EXPIRE_DAYS, MAX_LETTERS };
