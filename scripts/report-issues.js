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

// Що з журналу вважається ПОЛОМКОЮ, а що — новиною.
//
// Різниця тут не косметична: поломка виводить крок з помилкою, і
// GitHub надсилає власнику лист. Новина просто друкується.
//
// ЧОМУ ЦЕ ОКРЕМІ СПИСКИ, А НЕ ТРИ if. Раніше зведення друкувало рівно
// три різновиди — js_error, not_found і search_miss, — а забирало з
// бази ВСІ непозначені рядки й помічало їх notified = true. Тобто
// stock_out, meta_capi, mail_list і np_directory тихо зникали: у
// таблиці вони лежали позначені як «повідомлено», а власник їх
// ніколи не бачив. Саме тому їх доводилось діставати руками
// запитом у Supabase.
//
// Тепер друкується КОЖЕН різновид: знайомі — своїм розділом, решта —
// загальним. Забути новий різновид більше не можна.
const BREAKAGE = new Set([
    "js_error",     // сторінка впала в покупця
    "not_found",    // відкрито адресу, якої немає
    "meta_capi",    // Meta не прийняла серверну конверсію
    "mail_list",    // MailerLite відмовився прийняти підписку
    "np_directory"  // Нова пошта відмовила в пошуку адреси
]);

// Не поломка: нормальна поведінка або корисний факт. Червоним не
// фарбуємо — інакше власник привчиться не читати звіт разом зі
// справжніми помилками.
const NEWS = {
    search_miss: "ШУКАЛИ Й НЕ ЗНАЙШЛИ",
    stock_out: "ТОВАР ЗАКІНЧИВСЯ",
    turnstile_skip: "ЗАМОВЛЕННЯ ПОВЗ ПЕРЕВІРКУ «ВИ ЛЮДИНА»"
};

const TITLES = {
    js_error: "ПОМИЛКИ JAVASCRIPT",
    not_found: "АДРЕСИ, ЯКИХ НЕМАЄ",
    meta_capi: "META НЕ ПРИЙНЯЛА КОНВЕРСІЮ",
    mail_list: "ПІДПИСКА НЕ ПРОЙШЛА",
    np_directory: "НОВА ПОШТА ВІДМОВИЛА",
    ...NEWS
};

// Чи фарбує цей рядок звіт червоним.
//
// Окремою функцією, щоб тест питав ПОВЕДІНКУ, а не вигляд коду. Тут
// уже була перевірка регуляркою на `if (!errors.length &&
// !missing.length)` — і вона почервоніла, щойно перелік поломок став
// списком. Поведінка при цьому не змінилась ні на крок.
function isBreakage(row) {
    return BREAKAGE.has(String(row && row.kind || ""));
}

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
    const searches = rows.filter(r => r.kind === "search_miss");

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

    if (searches.length) {

        console.log("ШУКАЛИ Й НЕ ЗНАЙШЛИ\n");

        // Найчастіші — перші: hits показує, скільком людям цього
        // бракувало.
        [...searches]
            .sort((a, b) => (b.hits || 0) - (a.hits || 0))
            .forEach(row => {
                console.log(`  «${row.message}» × ${row.hits}`);
            });

        console.log("");
        console.log("  Причин рівно дві: або товару немає (варто завезти),");
        console.log("  або він є, але зветься інакше — тоді досить дописати");
        console.log("  написання в поле «Пошук» у картці товару.");
        console.log("");

    }

    // ВСЕ РЕШТА. Три розділи вище мають власний вигляд, бо їх читають
    // по-різному; але жоден рядок не має права зникнути тільки тому,
    // що для нього не написали окремого розділу.
    const shown = new Set(["js_error", "not_found", "search_miss"]);

    const others = rows.filter(row => !shown.has(row.kind));

    if (others.length) {

        const byKind = {};

        others.forEach(row => {
            (byKind[row.kind] = byKind[row.kind] || []).push(row);
        });

        Object.keys(byKind).sort().forEach(kind => {

            console.log(`${TITLES[kind] || kind.toUpperCase()}\n`);

            byKind[kind].forEach(row => {

                console.log(`  ${row.message} × ${row.hits}`);

                if (row.page) console.log(`     ${row.page}`);

                // Браузер тут не для краси: у turnstile_skip саме він
                // відрізняє автоматику (Electron, HeadlessChrome) від
                // живого покупця, у якого перевірка не намалювалась.
                if (row.agent) console.log(`     ${row.agent.slice(0, 80)}`);

                console.log(`     ${when(row.first_seen)} → ${when(row.last_seen)}`);
                console.log("");

            });

        });

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

    // Пустий пошук — НЕ поломка.
    //
    // Це нормальна поведінка покупця, і якщо через неї щоденний звіт
    // ставав би червоним, власник швидко привчився б його не читати —
    // разом зі справжніми помилками. Тому червоним робимо лише те, що
    // справді зламалось.
    //
    // Так само не поломка stock_out (товар закінчився — це продаж) і
    // turnstile_skip (найчастіше це робот, якого перевірка й мусила
    // відсіяти). Їх видно в тексті звіту, але червоним вони не
    // фарбують.
    const broken = rows.filter(isBreakage);

    if (!broken.length) {

        console.log(`✅ Помилок немає (${rows.length} записів вище — це не поломки)`);

        return;

    }

    console.log("❌ Є нові помилки сайту — подробиці вище");

    process.exit(1);

}

// Списки різновидів експортуються для тесту: він звіряє їх із
// переліком, який приймає база. Розбіжність тут тиха — саме через неї
// чотири різновиди роками нікуди не доходили.
module.exports = { BREAKAGE, NEWS, TITLES, isBreakage };

if (require.main === module) {

    main().catch(error => {
        console.error("Зведення помилок не відпрацювало:", error);
        process.exit(1);
    });

}
