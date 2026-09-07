// Нагадування про брошений кошик.
//
// НАВІЩО
// -------
// Кошик авторизованого покупця вже лежить у базі — його синхронізує
// сайт, щоб людина бачила ті самі товари на телефоні й на комп'ютері.
// Але далі з ним не відбувалось нічого: наповнив кошик, закрив вкладку
// — і все.
//
// Лист «ви залишили щось у кошику» — найдешевший спосіб повернути
// людину, яка вже все обрала: вона прийшла сама, товар обрала сама,
// лишилось нагадати.
//
// ЧОМУ ЦЕ КРОК У ГІТХАБІ, А НЕ ТРИГЕР У БАЗІ
// -------------------------------------------
// Тут потрібні НАЗВИ, ЦІНИ Й ФОТО товарів, а вони живуть у зібраному
// каталозі (data/catalog.json), не в базі. У базі лежить тільки
// product_id. Крок у GitHub Actions має і те, і те: базу через ключ і
// каталог із репозиторію.
//
// КОГО НАГАДУВАТИ — ВИРІШУЄ БАЗА
// -------------------------------
// Умови (кошик не торкались 4 години, замовлень після цього не було,
// про цей склад ще не писали) перевіряє функція abandoned_carts —
// див. supabase/migrations/016-abandoned-carts.sql. Скрипт лише
// збирає лист і надсилає.
//
// ЛИШЕ ДЛЯ АВТОРИЗОВАНИХ. У гостя ми не знаємо пошти, доки він не
// оформить замовлення — а тоді нагадувати вже нічого.
//
// ЗАПУСК
//   node scripts/remind-carts.js              знайти й надіслати
//   node scripts/remind-carts.js --dry-run    показати, кому б надіслав
//   node scripts/remind-carts.js --idle=1h    інший строк «тиші»

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const { cartLetter, mailRequest } = require("../supabase/functions/telegram-order-bot/mail.js");

const DRY = process.argv.includes("--dry-run");

function arg(name, fallback) {

    const found = process.argv.find(a => a.startsWith(`--${name}=`));

    return found ? found.split("=").slice(1).join("=") : fallback;
}

// Скільки кошик мусить полежати без змін. Чотири години — це «людина
// справді пішла», а не «пішла на кухню».
const IDLE = arg("idle", "4 hours").replace(/^(\d+)h$/, "$1 hours");

const LIMIT = Number(arg("limit", "50")) || 50;

function supabaseUrl() {

    if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/+$/, "");

    const client = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-client.js"), "utf8");

    const match = client.match(/https:\/\/[a-z0-9]+\.supabase\.co/i);

    if (!match) throw new Error("Не знайшов адресу Supabase у assets/js/supabase-client.js");

    return match[0];

}

function siteUrl() {

    const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));

    return (config.production && config.production.url) || "";

}

// Каталог для назв, цін і фото. Той самий файл, який вантажить сайт.
function catalog() {

    const file = path.join(ROOT, "data", "catalog.json");

    if (!fs.existsSync(file)) throw new Error("Немає data/catalog.json — спершу зберіть каталог");

    const map = new Map();

    JSON.parse(fs.readFileSync(file, "utf8")).forEach(product => {
        map.set(Number(product.id), product);
    });

    return map;

}

// Позиція кошика → позиція листа.
//
// Фото беремо того кольору, який людина поклала в кошик: у листі про
// «Чорний» має бути чорна сумка, а не перша з каталогу.
function buildItems(rows, products, site) {

    return (Array.isArray(rows) ? rows : []).map(row => {

        const product = products.get(Number(row.product_id));

        if (!product) return null;

        const variant = (product.variants || []).find(v => v.color === row.color)
            || (product.variants || [])[0]
            || {};

        const image = (variant.images || product.images || [])[0] || "";

        return {
            title: product.title || "",
            brand: product.brand || "",
            price: Number(product.price) || 0,
            qty: Number(row.qty) || 1,
            color: row.color || "",
            size: row.size || "",
            // Адреса мусить бути абсолютною: у листі відносний шлях
            // нема від чого відкладати.
            image: image ? `${site}/${String(image).replace(/^\/+/, "")}` : ""
        };

    }).filter(Boolean);

}

async function rest(url, key, pathname, init) {

    const response = await fetch(`${url}/rest/v1/${pathname}`, {
        ...init,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            ...((init && init.headers) || {})
        }
    });

    if (!response.ok) {

        const text = await response.text();

        throw new Error(`${pathname} → ${response.status}: ${text.slice(0, 200)}`);

    }

    return response;

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
        console.log("Немає SUPABASE_SERVICE_ROLE_KEY — нагадування пропускаю");
        return;
    }

    // Без розсилки нема чого й починати: інакше крок щогодини
    // перебирав би ті самі кошики й писав у лог одні й ті самі пошти.
    if (!DRY && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
        console.log("Немає ключа розсилки — нагадування пропускаю (див. docs/БРОШЕНИЙ-КОШИК.md)");
        return;
    }

    if (!DRY && !process.env.MAIL_FROM) {
        console.log("Немає MAIL_FROM — нагадування пропускаю");
        return;
    }

    const url = supabaseUrl();
    const site = siteUrl();

    let carts;

    try {

        const response = await rest(url, key, "rpc/abandoned_carts", {
            method: "POST",
            body: JSON.stringify({ p_idle: IDLE, p_limit: LIMIT })
        });

        carts = await response.json();

    } catch (error) {

        // Немає міграції — це не помилка, а «ще не налаштовано».
        if (/PGRST202|does not exist|Could not find/i.test(error.message)) {
            console.log("Функції abandoned_carts ще немає — виконайте міграцію 016");
            return;
        }

        throw error;

    }

    if (!carts.length) {
        console.log("✅ Брошених кошиків немає");
        return;
    }

    const products = catalog();

    console.log(`Брошених кошиків: ${carts.length}\n`);

    let sent = 0;

    for (const cart of carts) {

        const items = buildItems(cart.items, products, site);

        const letter = cartLetter(items, site);

        // Кошик із товарів, яких уже немає в каталозі, — нагадувати
        // нічим. Позначаємо як опрацьований, щоб не перебирати щогодини.
        if (!letter) {
            console.log(`   — ${cart.email}: товарів уже немає в каталозі`);
        } else {
            console.log(`   • ${cart.email}: ${items.length} поз. — ${letter.subject}`);
        }

        if (DRY) continue;

        const ok = letter ? await send(letter, cart.email) : false;

        if (ok) sent++;

        // Позначку ставимо і тоді, коли лист не пішов через відсутній
        // товар: інакше цей кошик перебирався б щогодини вічно. А от
        // помилку розсилки НЕ позначаємо — наступний запуск спробує ще.
        if (ok || !letter) {

            await rest(url, key, "cart_reminders", {
                method: "POST",
                headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
                body: JSON.stringify({
                    user_id: cart.user_id,
                    fingerprint: cart.fingerprint,
                    sent_at: new Date().toISOString()
                })
            });

        }

    }

    console.log(DRY ? "\n--dry-run: нічого не надіслано" : `\nНадіслано листів: ${sent}`);

}

if (require.main === module) {

    main().catch(error => {
        console.error("Нагадування не відпрацювали:", error.message);
        process.exit(1);
    });

}

module.exports = { buildItems };
