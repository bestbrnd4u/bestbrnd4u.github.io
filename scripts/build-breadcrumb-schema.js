// Розмітка BreadcrumbList для сторінок, які написані руками.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Доріжку «Головна → Каталог» бачить людина, а Google — ні. Заміряно
// 25.09.2026: з 11 індексованих сторінок у корені розмітку мала
// ЖОДНА, хоч видима доріжка є на десяти.
//
// При цьому 130+ згенерованих сторінок — товари, бренди, категорії,
// розділи — її мають: їх збирають build-product-pages.js і
// build-taxonomy-pages.js, і обидва кличуть Breadcrumbs.toJsonLd().
// Тобто діра рівно там, де сторінку пише людина, а не скрипт.
//
// Сам модуль assets/js/breadcrumbs.js у коментарі прямо називає
// розмітку третім своїм призначенням — але в рантаймі її ніхто не
// вставляє, лише збірка.
//
// ЧОМУ БЕРЕМО ДОРІЖКУ З РОЗМІТКИ, А НЕ ПИШЕМО ОКРЕМО
// ---------------------------------------------------
// Другий перелік ланок розійшовся б із видимим — і Google показував
// би шлях, якого на сторінці немає. Саме цього боїться коментар у
// breadcrumbs.js. Тому джерело одне: ті самі <a> і <span>, які
// бачить людина.
//
// ЗАПУСК
//   node scripts/build-breadcrumb-schema.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const { SITE_URL } = require("./site-env");
const Breadcrumbs = require("../assets/js/breadcrumbs.js");

// Доріжка лежить або в <section class="breadcrumbs">, або в
// контейнері з id="breadcrumbsList" (каталог, товар, акція —
// там її ще й перемальовує JS).
const BLOCKS = [
    /<section class="breadcrumbs">([\s\S]*?)<\/section>/i,
    /id="breadcrumbsList"[^>]*>([\s\S]*?)<\/div>/i
];

const TAG_START = '<script type="application/ld+json" id="breadcrumbSchema">';

function trailOf(html) {

    let block = null;

    for (const re of BLOCKS) {
        const hit = html.match(re);
        if (hit) { block = hit[1]; break; }
    }

    if (!block) return null;

    const trail = [];

    // Посилання — проміжні ланки.
    [...block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].forEach(m => {

        const label = m[2]
            .replace(/<[^>]+>/g, " ")
            // Сутності теж прибираємо: у кнопки «Назад» текст
            // «&lsaquo; Назад», і порівняння з голим «Назад» його не
            // ловило — стрілка потрапляла в доріжку першою ланкою.
            .replace(/&[a-z]+;|&#\d+;/gi, " ")
            .replace(/\s+/g, " ")
            .trim();

        // Кнопка «Назад» — не ланка доріжки, а навігація. Шукаємо
        // слово, а не точний рядок: поруч із ним стоїть стрілка.
        if (!label || /Назад/i.test(label)) return;

        trail.push({ label, href: m[1].replace(/^\//, "") || "/" });

    });

    // Остання ланка — поточна сторінка, вона без посилання.
    const spans = [...block.matchAll(/<span(?![^>]*crumb-sep)[^>]*>([\s\S]*?)<\/span>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean);

    const current = spans[spans.length - 1];

    if (current) trail.push({ label: current, current: true });

    return trail.length >= 2 ? trail : null;

}

function main() {

    const pages = fs.readdirSync(ROOT).filter(file => file.endsWith(".html"));

    let written = 0;
    let same = 0;
    let noTrail = 0;

    pages.forEach(file => {

        const full = path.join(ROOT, file);
        const html = fs.readFileSync(full, "utf8");

        // Власний robots — ОСТАННІЙ: перший додає dev-збірка, і за ним
        // усі сторінки виглядали б закритими від індексації.
        const robots = [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map(m => m[1]);
        const own = robots.length ? robots[robots.length - 1] : "index,follow";

        if (/noindex/.test(own)) { noTrail += 1; return; }

        const trail = trailOf(html);

        if (!trail) { noTrail += 1; return; }

        const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1]
            || `${SITE_URL}/${file.replace(/\.html$/, "")}`;

        const ld = Breadcrumbs.toJsonLd(trail, SITE_URL, canonical);

        const block = `${TAG_START}\n${JSON.stringify(ld, null, 2)}\n</script>`;

        // Стару версію прибираємо: без цього повторна збірка дала б
        // другий такий самий тег, а Google при двох BreadcrumbList
        // не показує жодного.
        let next = html.replace(
            /\s*<script type="application\/ld\+json" id="breadcrumbSchema">[\s\S]*?<\/script>/,
            "");

        // Ставимо перед </head> — поруч із рештою розмітки сторінки.
        next = next.replace(/<\/head>/i, `${block}\n</head>`);

        // Однакова розмітка — не переписуємо файл: інакше кожна
        // збірка міняла б час зміни і смітила б у git.
        if (next === html) { same += 1; return; }

        fs.writeFileSync(full, next, "utf8");

        written += 1;

    });

    console.log("Готово: розмітка доріжки — "
        + `оновлено ${written}, вже правильних ${same}, без доріжки ${noTrail}`);

}

if (require.main === module) main();

module.exports = { trailOf };
