// Зведення помилок, які трапились у покупців.
//
// НАВІЩО
// -------
// Браузер надсилає помилки в базу (див. assets/js/error-report.js і
// supabase/migrations/013-site-issues.sql), але сама по собі таблиця
// нікому нічого не каже: щоб її прочитати, треба згадати, що вона є.
//
// Цей крок ходить у неї раз на день і, якщо з'явилось нове, ЗАВЕРШУЄ
// РОБОТУ ПОМИЛКОЮ. Не тому, що зламався він — а тому, що це єдиний
// безкоштовний спосіб отримати лист: GitHub сам пише власнику про
// провалений workflow. Інакше зведення лишилось би в логах, яких
// ніхто не відкриває.
//
// Кожна помилка згадується один раз: після зведення рядок
// позначається notified = true. Не полагодили — вона й далі росте
// лічильником у таблиці, але листами не докучає.
//
// ЗАПУСК
//   node scripts/report-issues.js              зведення + позначка
//   node scripts/report-issues.js --dry-run    тільки показати

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const DRY = process.argv.includes("--dry-run");

const LIMIT = 50;

// Адреса проєкту лежить у коді сайту — вона й так відкрита (той самий
// підхід, що в scripts/push-stock.js).
function supabaseUrl() {

    if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/+$/, "");

    const client = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-client.js"), "utf8");

    const match = client.match(/https:\/\/[a-z0-9]+\.supabase\.co/i);

    if (!match) throw new Error("Не знайшов адресу Supabase у assets/js/supabase-client.js");

    return match[0];

}

function when(iso) {

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) return String(iso || "");

    return date.toISOString().replace("T", " ").slice(0, 16);

}

async function main() {

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {
        console.log("Немає SUPABASE_SERVICE_ROLE_KEY — зведення помилок пропускаю");
        return;
    }

    const url = supabaseUrl();

    const headers = {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
    };

    const response = await fetch(
        `${url}/rest/v1/site_issues?notified=eq.false&order=last_seen.desc&limit=${LIMIT}`,
        { headers });

    if (response.status === 404) {
        console.log("Таблиці site_issues ще немає — виконайте supabase/migrations/013-site-issues.sql");
        return;
    }

    if (!response.ok) {
        console.error(`Не вдалося прочитати site_issues: HTTP ${response.status}`);
        console.error((await response.text()).slice(0, 300));
        process.exit(1);
    }

    const rows = await response.json();

    if (!rows.length) {
        console.log("✅ Нових помилок немає");
        return;
    }

    const errors = rows.filter(r => r.kind === "js_error");
    const missing = rows.filter(r => r.kind === "not_found");

    console.log(`\nНових записів: ${rows.length}\n`);

    if (errors.length) {

        console.log("ПОМИЛКИ JAVASCRIPT\n");

        errors.forEach(row => {
            console.log(`  ${row.page || "/"} × ${row.hits}`);
            console.log(`     ${row.message}`);
            if (row.source) console.log(`     ${row.source}`);
            console.log(`     ${when(row.first_seen)} → ${when(row.last_seen)} · ${row.agent.slice(0, 80)}`);
            console.log("");
        });

    }

    if (missing.length) {

        console.log("АДРЕСИ, ЯКИХ НЕМАЄ\n");

        missing.forEach(row => {
            console.log(`  ${row.page} × ${row.hits} — ${row.message}`);
        });

        console.log("");

    }

    if (DRY) {
        console.log("--dry-run: нічого не позначаю");
        process.exit(1);
    }

    // Позначаємо саме ті рядки, які показали: інакше помилка, що
    // прилетіла між читанням і позначкою, зникла б непоміченою.
    const ids = rows.map(r => r.id).join(",");

    const mark = await fetch(`${url}/rest/v1/site_issues?id=in.(${ids})`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ notified: true })
    });

    if (!mark.ok) {
        console.error(`Не вдалося позначити записи: HTTP ${mark.status}`);
    }

    console.log("❌ Є нові помилки сайту — подробиці вище");

    process.exit(1);

}

main().catch(error => {
    console.error("Зведення помилок не відпрацювало:", error);
    process.exit(1);
});
