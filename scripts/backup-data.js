// Резервна копія того, що живе ЛИШЕ в базі.
//
// НАВІЩО
// -------
// Supabase на безкоштовному тарифі не робить резервних копій узагалі.
// Це не «сім днів» і не «обмежено» — їхня власна документація радить
// безкоштовним проєктам «регулярно експортувати дані самостійно».
//
// А в базі лежить усе, чого немає більше ніде: історія замовлень,
// відмови, відгуки, акаунти покупців, їхні адреси й кошики. Товари,
// ціни й сторінки відновляться з git за хвилину — замовлення не
// відновляться нізвідки.
//
// ЧОГО ТУТ НЕМАЄ, І ЦЕ ВАЖЛИВО ЗНАТИ
// -----------------------------------
// Акаунтів як таких. Пошта й пароль покупця лежать у схемі auth, а
// PostgREST віддає тільки public — дістати їх цим шляхом неможливо.
// Копія покриває ДАНІ магазину, а не входи в кабінет: якщо проєкт
// зникне, замовлення й відгуки повернуться, а людям доведеться
// зареєструватись заново.
//
// Профілі (public.profiles) сюди входять — там ім'я й телефон, тобто
// саме те, що потрібно, щоб зв'язати замовлення з людиною.
//
// ЧОГО НЕ КОПІЮЄМО НАВМИСНО
// --------------------------
//   stock, prices        — знімки з репозиторію, перезбираються самі
//   *_throttle, salt      — лічильники, які нічого не означають поза
//                           своєю годиною
//   bot_sessions          — недописані чернетки замовлень у боті
//
// Копіювати те, що відновлюється однією командою, означає роздувати
// архів і плутати себе ж при відновленні.
//
// ЗАПУСК
//   node scripts/backup-data.js --out=<тека>
//   node scripts/backup-data.js --dry-run     тільки порахувати рядки

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

// Що копіюємо. Порядок такий, щоб при відновленні спершу з'явились
// ті, на які посилаються інші.
const TABLES = [
    "profiles",
    "addresses",
    "orders",
    "order_refusals",
    "reviews",
    "review_requests",
    "cart_items",
    "favorites",
    "promo_codes",
    "site_issues",
];

// Скільки рядків за один запит. PostgREST має власну стелю, і
// вивантажувати 10 000 замовлень одним запитом однаково не вийде.
const PAGE = 1000;

const DRY = process.argv.includes("--dry-run");

function arg(name) {

    const hit = process.argv.find(value => value.startsWith(`--${name}=`));

    return hit ? hit.slice(name.length + 3) : "";

}

function supabaseUrl() {

    if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/+$/, "");

    const client = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-client.js"), "utf8");

    const match = client.match(/https:\/\/[a-z0-9]+\.supabase\.co/i);

    return match ? match[0] : "";

}

// Одна таблиця цілком, сторінками. Повертає масив або null, якщо
// таблиці немає.
async function dump(url, key, table) {

    const rows = [];

    for (let from = 0; ; from += PAGE) {

        const response = await fetch(
            `${url}/rest/v1/${table}?select=*&order=id.asc&limit=${PAGE}&offset=${from}`,
            {
                headers: {
                    apikey: key,
                    Authorization: `Bearer ${key}`,
                    Accept: "application/json",
                },
            }
        );

        if (response.status === 404) return null;

        if (!response.ok) {

            const detail = await response.text();

            // Не в кожної таблиці є колонка id (напр. review_requests
            // має первинним ключем order_number). Пробуємо без сортування.
            if (/column .*id.* does not exist|42703/.test(detail)) {

                return await dumpUnordered(url, key, table);

            }

            throw new Error(`${table}: HTTP ${response.status} ${detail.slice(0, 160)}`);

        }

        const page = await response.json();

        if (!Array.isArray(page)) throw new Error(`${table}: відповідь не масив`);

        rows.push(...page);

        if (page.length < PAGE) break;

    }

    return rows;

}

async function dumpUnordered(url, key, table) {

    const rows = [];

    for (let from = 0; ; from += PAGE) {

        const response = await fetch(
            `${url}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${from}`,
            { headers: { apikey: key, Authorization: `Bearer ${key}` } }
        );

        if (!response.ok) {
            throw new Error(`${table}: HTTP ${response.status}`);
        }

        const page = await response.json();

        rows.push(...page);

        if (page.length < PAGE) break;

    }

    return rows;

}

async function main() {

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {

        console.log("SUPABASE_SERVICE_ROLE_KEY не заданий — копію не роблю");

        return;

    }

    const url = supabaseUrl();

    if (!url) {

        console.log("Не знайшов адресу Supabase — копію не роблю");

        return;

    }

    const out = arg("out") || path.join(ROOT, "backup");

    if (!DRY) fs.mkdirSync(out, { recursive: true });

    const summary = {};

    let total = 0;

    for (const table of TABLES) {

        let rows;

        try {

            rows = await dump(url, key, table);

        } catch (error) {

            // Одна таблиця не мусить рятувати чи валити всю копію:
            // краще неповний архів із чесним переліком, ніж нічого.
            console.log(`  ⚠ ${table}: ${error.message}`);

            summary[table] = "помилка";

            continue;

        }

        if (rows === null) {

            console.log(`  – ${table}: таблиці немає`);

            summary[table] = "немає";

            continue;

        }

        summary[table] = rows.length;

        total += rows.length;

        console.log(`  ✓ ${table}: ${rows.length}`);

        if (DRY) continue;

        fs.writeFileSync(
            path.join(out, `${table}.json`),
            JSON.stringify(rows, null, 1) + "\n",
            "utf8"
        );

    }

    if (DRY) {

        console.log(`Це був звіт: рядків ${total}`);

        return;

    }

    // Опис копії поруч із даними. Через рік ніхто не згадає, звідки
    // взявся архів і чого в ньому немає.
    fs.writeFileSync(path.join(out, "README.txt"), [
        "Резервна копія даних магазину BestBrnd4u",
        "",
        `Знято: ${new Date().toISOString()}`,
        `Проєкт: ${url}`,
        "",
        "Що всередині — по одному файлу на таблицю схеми public:",
        ...TABLES.map(table => `  ${table}.json — ${summary[table]}`),
        "",
        "ЧОГО ТУТ НЕМАЄ:",
        "  • акаунтів покупців (пошта й пароль лежать у схемі auth,",
        "    а цей експорт бачить лише public);",
        "  • залишків і цін (це знімки з репозиторію — перезбираються",
        "    командою npm run build);",
        "  • лічильників звернень і чернеток замовлень у боті.",
        "",
        "ЯК ВІДНОВИТИ:",
        "  Порядок файлів у переліку вище — це порядок вставки:",
        "  спершу profiles і addresses, потім orders, і вже потім те,",
        "  що на них посилається.",
        "",
        "  Найпростіше — Supabase → Table Editor → Import data from CSV",
        "  (JSON доведеться перегнати) або через PostgREST службовим",
        "  ключем.",
        ""
    ].join("\n"), "utf8");

    console.log(`Готово: ${total} рядків → ${path.relative(ROOT, out)}`);

}

if (require.main === module) {

    main().catch(error => {

        console.error("Резервна копія не відпрацювала:", error.message);

        process.exit(1);

    });

}

module.exports = { TABLES, PAGE };
