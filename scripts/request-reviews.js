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
const { blockedEmails, allowedToWrite } = require("./blocked");

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

// ЧОМУ НІКОМУ НЕ ПИШЕМО.
//
// «Немає кому писати» — чесна відповідь, але вона нічого не каже
// власникові. А сказати є що: заміряно 08.10.2026, цей крок повторює
// той самий рядок щодня з 30.09, тобто місяць поспіль, і за весь час
// не пішло жодного прохання. Відгуків у магазині при цьому нуль, і
// зірки в пошуку не вмикаються саме через це.
//
// Причина майже завжди одна й та сама, і вона не в коді: прохання
// йдуть лише по замовленнях у стані «Виконано», а замовлення
// лишаються у «Відправлено», бо кнопку в боті ніхто не натиснув.
//
// Тому замість одного рядка показуємо, де саме обірвався ланцюжок.
// Якщо в «Відправлено» щось стоїть довше за строк прохання — це вже
// не стан справ, а пропущений крок, і його видно попередженням на
// сторінці запуску.
const СТАНИ = {
    "new": "Нове",
    processing: "В обробці",
    shipped: "Відправлено",
    completed: "Виконано",
    cancelled: "Скасовано"
};

// Скільки рядків підпадає під умову. PostgREST віддає число в
// Content-Range, якщо попросити count=exact, — тож тіло не читаємо
// зовсім.
async function скільки(url, key, query) {

    try {

        const response = await rest(url, key, `orders?${query}`, {
            method: "HEAD",
            headers: { Prefer: "count=exact", Range: "0-0" }
        });

        if (!response.ok && response.status !== 206) return null;

        const range = response.headers.get("content-range") || "";

        const total = Number(String(range).split("/")[1]);

        return Number.isFinite(total) ? total : null;

    } catch (error) {

        return null;

    }

}

// Сам текст пояснення — окремо від запитів до бази: інакше його
// нічим перевірити, і єдиний рядок, який власник побачить, лишився б
// неперевіреним.
//
// Повертає { рядок, попередження } — друге є лише тоді, коли справді
// пропущено крок, а не просто немає нових замовлень.
function пояснення(за, застоялись, days) {

    const перелік = Object.keys(СТАНИ)
        .filter(стан => Number.isFinite(за && за[стан]))
        .map(стан => `${СТАНИ[стан]} ${за[стан]}`)
        .join(", ");

    const рядок = `Немає кому писати${перелік ? ". Стан замовлень: " + перелік : ""}`;

    // Відправлені, яким давно час бути виконаними, — це пропущений
    // крок, і саме через нього магазин може не мати жодного відгуку.
    const попередження = застоялись > 0
        ? `Замовлень у стані «Відправлено» старших за ${days} дн.: ${застоялись}. `
            + "Прохання написати відгук ідуть лише по «Виконано» — "
            + "позначте їх у боті, і листи підуть наступного ранку."
        : "";

    // Виконані є, але всі вже отримали прохання або вже написали
    // відгук — тоді все гаразд, чекаємо на наступне замовлення.
    const спокій = !попередження && за && за.completed > 0
        ? "   Виконані замовлення вже отримали прохання або мають відгук."
        : "";

    return { рядок, попередження, спокій };

}

async function поясни(url, key) {

    const межа = new Date(Date.now() - DAYS * 86400000).toISOString();

    const за = {};

    for (const стан of Object.keys(СТАНИ)) {
        за[стан] = await скільки(url, key, `status=eq.${стан}&select=order_number`);
    }

    const застоялись = await скільки(url, key,
        `status=eq.shipped&created_at=lt.${межа}&select=order_number`);

    const що = пояснення(за, застоялись, DAYS);

    console.log(що.рядок);

    if (що.спокій) console.log(що.спокій);

    if (що.попередження) notConfigured(що.попередження);

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

    const all = await response.json();

    // Заблокованим не пишемо. Замовлення, зроблені до блокування,
    // нікуди не діваються — саме за ними цей крок і пише листи.
    const blocked = await blockedEmails(url, key);

    const rows = (Array.isArray(all) ? all : [])
        .filter(row => allowedToWrite(blocked, row && row.email));

    if (!rows.length) {

        await поясни(url, key);

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

module.exports = { slugById, пояснення, СТАНИ };
