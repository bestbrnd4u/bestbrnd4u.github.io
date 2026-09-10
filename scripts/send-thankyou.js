// «Дякуємо за покупку» з персональним промокодом — через місяць
// після «Виконано».
//
// НАВІЩО
// -------
// Найдешевший покупець — той, що вже один раз заплатив: він знає
// магазин, отримав річ і переконався, що вона справжня. Але після
// «Виконано» магазин із ним більше не говорив ніколи.
//
// Уся машинерія вже стояла: промокоди зі строком і межею використань
// (міграція 025), розсилка, розклад, шаблони листів. Бракувало самого
// кроку.
//
// ЧОМУ ЧЕРЕЗ МІСЯЦЬ, А НЕ ЧЕРЕЗ ТИЖДЕНЬ
// --------------------------------------
// На сьомий день іде прохання про відгук (scripts/request-reviews.js).
// Два листи поспіль — це вже розсилка, а не увага. Плюс покласти
// знижку поруч із проханням про відгук означало б запропонувати
// гроші за відгук: воно виглядало б саме так, незалежно від того, що
// код дається безумовно.
//
// ЧОМУ КОД ОДНОРАЗОВИЙ І ЗІ СТРОКОМ
// ----------------------------------
// Персональний код, який жив би вічно й спрацьовував будь-кому, за
// тиждень опиниться в чаті «промокоди всіх магазинів». max_uses = 1 і
// дата закінчення роблять його саме персональним.
//
// ЗАПУСК
//   node scripts/send-thankyou.js
//   node scripts/send-thankyou.js --dry-run       показати й не слати
//   node scripts/send-thankyou.js --days=45       інший строк
//   node scripts/send-thankyou.js --percent=15    інша знижка

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Попередження «не налаштовано» так, щоб його було видно на
// сторінці запуску (див. пояснення в scripts/site-env.js).
const { notConfigured } = require("./site-env");

const ROOT = path.join(__dirname, "..");

const { thankYouLetter, mailRequest } = require("../supabase/functions/telegram-order-bot/mail.js");

const { promoRandomCode } = require("../supabase/functions/telegram-order-bot/promo-admin.js");

const DRY = process.argv.includes("--dry-run");

function arg(name, fallback) {

    const hit = process.argv.find(value => value.startsWith(`--${name}=`));

    return hit ? hit.slice(name.length + 3) : fallback;

}

// Налаштування з адмінки. Аргументи командного рядка мають перевагу —
// вони потрібні для перевірок і разових запусків.
function settings() {

    let saved = {};

    try {
        saved = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "notifications.json"), "utf8"));
    } catch (error) {
        saved = {};
    }

    const number = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };

    return {
        enabled: saved.thankYou === true,
        days: number(arg("days", saved.thankYouDays), 30),
        percent: number(arg("percent", saved.thankYouPercent), 10),
        life: number(arg("life", saved.thankYouLife), 30),
        limit: number(arg("limit", null), 20),
    };

}

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

    const config = settings();

    if (!config.enabled) {

        console.log("«Дякуємо за покупку» вимкнено в адмінці — пропускаю");

        return;

    }

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {

        console.log("SUPABASE_SERVICE_ROLE_KEY не заданий — пропускаю");

        return;

    }

    if (!DRY && !process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {

        notConfigured("Немає ключа розсилки — «дякуємо за покупку» пропускаю");

        return;

    }

    if (!DRY && !process.env.MAIL_FROM) {

        notConfigured("Немає MAIL_FROM — «дякуємо за покупку» пропускаю");

        return;

    }

    const url = supabaseUrl();

    if (!url) {

        console.log("Не знайшов адресу Supabase — пропускаю");

        return;

    }

    const response = await rest(url, key, "rpc/thankyou_candidates", {
        method: "POST",
        body: JSON.stringify({ p_days: config.days, p_limit: config.limit }),
    });

    if (response.status === 404) {

        console.log("Функції thankyou_candidates немає — застосуйте міграцію 026-thank-you.sql");

        return;

    }

    if (!response.ok) {

        console.log(`Не вдалося отримати перелік: HTTP ${response.status}`);

        return;

    }

    const rows = await response.json();

    if (!Array.isArray(rows) || !rows.length) {

        console.log("Немає кому дякувати");

        return;

    }

    console.log(`Замовлень для листа: ${rows.length}`);

    const site = siteUrl();

    const expiresAt = new Date(Date.now() + config.life * 24 * 60 * 60 * 1000);

    let sent = 0;

    for (const row of rows) {

        // Код прив'язаний до замовлення лише в нашій таблиці, а не в
        // самому коді: «BB-3098816532» видавав би номер чужого
        // замовлення кожному, кому код перешлють.
        const code = promoRandomCode("BB", crypto.randomBytes(6));

        const promo = {
            code,
            percent: config.percent,
            expiresAt: expiresAt.toISOString(),
        };

        const letter = thankYouLetter(row, promo, site);

        if (DRY) {

            console.log(`   → ${row.email}: ${code} (-${config.percent}%, до ${expiresAt.toISOString().slice(0, 10)})`);

            sent++;

            continue;

        }

        // Спершу код, потім лист. Навпаки не можна: людина отримала б
        // код, якого не існує, — а це гірше, ніж не отримати нічого.
        const saved = await rest(url, key, "rpc/promo_admin_save", {
            method: "POST",
            body: JSON.stringify({
                p_code: code,
                p_percent: config.percent / 100,
                p_active: true,
                p_starts_at: null,
                p_expires_at: promo.expiresAt,
                p_max_uses: 1,
                p_product_ids: null,
                p_min_total: null,
                p_note: `дякуємо за замовлення ${row.order_number}`,
            }),
        });

        if (!saved.ok) {

            console.log(`   ⚠ не вдалося створити код для ${row.order_number}: HTTP ${saved.status}`);

            continue;

        }

        await saved.text();

        const ok = await send(letter, row.email);

        if (!ok) continue;

        // Позначаємо ЛИШЕ після успішної відправки: інакше збій пошти
        // означав би, що людину викинули з переліку назавжди.
        const mark = await rest(url, key, "thankyou_sent", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({ order_number: row.order_number, code }),
        });

        if (!mark.ok) {

            console.log(`   ⚠ не позначилось ${row.order_number}: HTTP ${mark.status}`);

        } else {

            await mark.text();

        }

        console.log(`   ✓ ${row.email} (${row.order_number}) → ${code}`);

        sent++;

    }

    console.log(DRY ? `Показано: ${sent}` : `Надіслано: ${sent}`);

}

main().catch(error => {

    console.error("Помилка:", error.message);

    process.exit(1);

});
