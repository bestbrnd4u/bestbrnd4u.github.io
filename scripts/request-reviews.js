// Прохання написати відгук — через тиждень після «Виконано».
//
// НАВІЩО
// -------
// Сам по собі ніхто не повертається на сторінку товару, щоб написати
// відгук. Перші відгуки в магазині з'являються тільки якщо про них
// попросити.
//
// А відгуки потрібні не лише для зірок у пошуку. На полиці
// 3 000-15 000 ₴ із логотипами Gucci й Prada головне заперечення
// покупця — «чи це не підробка», і слово іншого покупця відповідає на
// це переконливіше за будь-який текст магазину.
//
// ЧОМУ ЧЕРЕЗ ТИЖДЕНЬ
// -------------------
// Раніше — людина ще не отримала посилку або щойно розпакувала.
// Пізніше — покупка забулась, і лист виглядає як реклама.
//
// ЧОМУ ОДИН РАЗ
// --------------
// Таблиця review_requests пам'ятає, кому вже писали. Друге прохання
// про той самий відгук — це вже не прохання, а нагадування, якого
// ніхто не просив.
//
// І не пишемо тому, хто вже написав: review_candidates це враховує.
//
// ЗАПУСК
//   node scripts/request-reviews.js
//   node scripts/request-reviews.js --dry-run     показати й не слати
//   node scripts/request-reviews.js --days=14     інший строк

const fs = require("fs");
const path = require("path");

// Попередження «не налаштовано» так, щоб його було видно на
// сторінці запуску (див. пояснення в scripts/site-env.js).
const { notConfigured } = require("./site-env");

const ROOT = path.join(__dirname, "..");

const { reviewLetter, mailRequest } = require("../supabase/functions/telegram-order-bot/mail.js");

const DRY = process.argv.includes("--dry-run");

function arg(name, fallback) {

    const hit = process.argv.find(value => value.startsWith(`--${name}=`));

    return hit ? hit.slice(name.length + 3) : fallback;

}

// Скільки листів за один запуск. Не межа магазину, а обережність:
// якщо щось налаштовано не так, краще зіпсувати десять листів, ніж
// усю базу покупців.
const LIMIT = Number(arg("limit", "20")) || 20;

// Строк береться з адмінки («Листи покупцеві»), а не з коду: міняти
// його мусить власник, а не той, хто вміє правити JavaScript.
// Аргумент --days лишається для разових запусків і перевірок.
const DAYS = Number(arg("days", require("./letter-schedule").schedule().reviewDays)) || 7;

function supabaseUrl() {

    if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/+$/, "");

    const client = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-client.js"), "utf8");

    const match = client.match(/https:\/\/[a-z0-9]+\.supabase\.co/i);

    return match ? match[0] : "";

}

function siteUrl() {

    try {
        return require("./site-env").SITE_URL;
    } catch (error) {
        return "https://bestbrnd4u.com";
    }

}

// Адреси товарів. Знімок замовлення їх не містить — там лежать назва,
// фото й ціна, але не slug (див. buildOrderItemsSnapshot у
// assets/js/checkout.js). А посилання в листі мусить вести на
// конкретний товар, бо форма відгуку живе саме там.
function slugById() {

    const file = path.join(ROOT, "data", "catalog.json");

    if (!fs.existsSync(file)) return new Map();

    try {

        const raw = JSON.parse(fs.readFileSync(file, "utf8"));

        const list = Array.isArray(raw) ? raw : (raw.products || []);

        return new Map(list
            .filter(item => item && item.id && item.slug)
            .map(item => [Number(item.id), String(item.slug)]));

    } catch (error) {

        return new Map();

    }

}

async function rest(url, key, pathname, init) {

    return await fetch(`${url}/rest/v1/${pathname}`, {
        ...init,
        headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            ...(init && init.headers ? init.headers : {}),
        },
    });

}

async function send(letter, to) {

    const request = mailRequest({
        to,
        from: process.env.MAIL_FROM,
        replyTo: process.env.MAIL_REPLY_TO,
        resendKey: process.env.RESEND_API_KEY,
        brevoKey: process.env.BREVO_API_KEY,
    }, letter);

    if (!request) return false;

    const response = await fetch(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(request.body),
    });

    if (!response.ok) {

        console.log(`   ⚠ пошта відмовила: HTTP ${response.status}`);

        return false;

    }

    await response.text();

    return true;

}

async function main() {

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {

        console.log("SUPABASE_SERVICE_ROLE_KEY не заданий — прохання про відгуки пропускаю");

        return;

    }

    if (!DRY && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {

        notConfigured("Немає ключа розсилки — прохання про відгуки пропускаю");

        return;

    }

    if (!DRY && !process.env.MAIL_FROM) {

        notConfigured("Немає MAIL_FROM — прохання про відгуки пропускаю");

        return;

    }

    const url = supabaseUrl();

    if (!url) {

        console.log("Не знайшов адресу Supabase — пропускаю");

        return;

    }

    const response = await rest(url, key, "rpc/review_candidates", {
        method: "POST",
        body: JSON.stringify({ p_days: DAYS, p_limit: LIMIT }),
    });

    if (response.status === 404) {

        console.log("Функції review_candidates немає — застосуйте міграцію 019-reviews.sql");

        return;

    }

    if (!response.ok) {

        console.log(`Не вдалося отримати перелік: HTTP ${response.status}`);

        return;

    }

    const rows = await response.json();

    if (!Array.isArray(rows) || !rows.length) {

        console.log("Немає кому писати");

        return;

    }

    console.log(`Замовлень для прохання: ${rows.length}`);

    const slugs = slugById();
    const site = siteUrl();

    let sent = 0;

    for (const row of rows) {

        // Додаємо адреси товарів у знімок — без них лист покаже назви
        // без посилань, а форма відгуку живе на сторінці товару.
        const items = (Array.isArray(row.items) ? row.items : []).map(item => ({
            ...item,
            slug: slugs.get(Number(item && item.id)) || "",
        }));

        const letter = reviewLetter({ ...row, items }, site);

        if (DRY) {

            console.log(`   → ${row.email}: ${letter.subject}`);

            sent++;

            continue;

        }

        const ok = await send(letter, row.email);

        if (!ok) continue;

        // Позначаємо ЛИШЕ після успішної відправки: інакше збій пошти
        // означав би, що людину викинули з переліку назавжди й
        // прохання не отримає ніхто.
        const mark = await rest(url, key, "review_requests", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({ order_number: row.order_number }),
        });

        if (!mark.ok) {

            console.log(`   ⚠ не позначилось ${row.order_number}: HTTP ${mark.status}`);

        } else {

            await mark.text();

        }

        console.log(`   ✓ ${row.email} (${row.order_number})`);

        sent++;

    }

    console.log(DRY
        ? `Це був звіт: листів було б ${sent}`
        : `Надіслано прохань: ${sent}`);

}

if (require.main === module) {

    main().catch(error => {

        console.error("Прохання про відгуки не відпрацювали:", error);

        process.exit(1);

    });

}

module.exports = { slugById };
