// Повідомляє пошуковики про нові й змінені адреси — протокол IndexNow.
//
// НАВІЩО
// -------
// Новий товар з адмінки з'являється в sitemap одразу, але пошуковик
// про це не знає, поки сам не зайде — а в нового домену без вхідних
// посилань обхід рідкий, тобто дні або тижні. IndexNow перевертає це:
// сайт САМ стукає в пошуковик, і адреса потрапляє в чергу на обхід за
// хвилини.
//
// Одного запиту на api.indexnow.org достатньо: він роздає адреси всім
// учасникам протоколу — Bing, Yandex, Seznam, Naver. Bing-ом заодно
// живиться Copilot.
//
// GOOGLE IndexNow НЕ ПІДТРИМУЄ. Для нього лишається sitemap.xml і
// «Проверка URL» у Search Console — це руками, і цей скрипт тут не
// допоможе. Ніякої «половини роботи» він не робить: просто пошуковиків
// два типи, і другий обслуговується інакше.
//
// ЩО САМЕ НАДСИЛАЄМО
// -------------------
// ЛИШЕ те, що змінилось, а не весь sitemap. Протокол просить саме так,
// і це не формальність: сайт, який щодня надсилає всі свої сто адрес,
// швидко перестають слухати.
//
// Зміну шукаємо у двох місцях:
//   1. НОВІ адреси в sitemap.xml проти попереднього коміту — це нові
//      товари й акції;
//   2. товари та акції, чиї ДАНІ змінились — ціна, фото, назва. Адреса
//      лишилась та сама, але сторінку варто перечитати.
//
// Друге без першого не працює: у зміненого товару адреса вже була в
// sitemap, тож різниця списків його не побачить.
//
// БЕЗПЕКА ЗБІРКИ
// ---------------
// Скрипт НІКОЛИ не валить збірку. Пошуковик недоступний, ключ не
// заповнений, гілка не та — він пише причину й виходить нулем. Сайт
// уже викладений; ненадісланий пінг означає лише те, що адресу
// знайдуть звичайним обходом, як було до цього скрипта.
//
// ЗАПУСК
//   node scripts/ping-indexnow.js              # порівняти з HEAD~1 і надіслати
//   node scripts/ping-indexnow.js --dry-run    # показати, що надіслалось би
//   node scripts/ping-indexnow.js --all        # надіслати ВСІ адреси з sitemap
//
// --all потрібен раз: коли сайт щойно відкрили для пошуку і в індексі
// немає нічого. Далі — тільки зміни.

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

const { SITE_URL, INDEXABLE, ENV_NAME, INDEXNOW_KEY } = require("./site-env");

const ENDPOINT = "https://api.indexnow.org/indexnow";

// Протокол дозволяє 10 000 адрес на запит. Каталог у це вміщається з
// величезним запасом, але межу тримаємо явно: інакше одна помилка в
// порівнянні перетворилась би на запит на кілька мегабайтів.
const MAX_URLS = 10000;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ALL = args.includes("--all");


function say(message) {
    console.log(message);
}

// Адреси з тексту sitemap.xml.
function urlsFrom(xml) {

    if (!xml) return [];

    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

}

// Файл із попереднього коміту. Немає коміту, немає файлу, немає git —
// повертаємо null, і виклична сторона вирішує сама.
function fromPreviousCommit(file) {

    try {

        return execFileSync("git", ["show", `HEAD~1:${file}`],
            { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

    } catch {

        return null;

    }

}

// Записи, чий вміст змінився між комітами, за ключем.
//
// Порівнюємо СЕРІАЛІЗОВАНИЙ запис, а не окремі поля: інакше кожне нове
// поле в адмінці доводилось би додавати ще й сюди, і про це б забували.
function changedEntries(file, keyOf) {

    const previous = fromPreviousCommit(file);

    if (previous === null) return null;      // порівнювати нема з чим

    let before, after;

    try {

        before = JSON.parse(previous);
        after = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));

    } catch {

        return null;

    }

    if (!Array.isArray(before) || !Array.isArray(after)) return null;

    const was = new Map(before.map(item => [keyOf(item), JSON.stringify(item)]));

    return after
        .filter(item => was.get(keyOf(item)) !== JSON.stringify(item))
        .map(keyOf);

}

function collectUrls() {

    const sitemapPath = path.join(ROOT, "sitemap.xml");

    if (!fs.existsSync(sitemapPath)) {

        say("Немає sitemap.xml — нічого надсилати");

        return [];

    }

    const current = urlsFrom(fs.readFileSync(sitemapPath, "utf8"));

    if (ALL) {

        say(`--all: надсилаємо всі ${current.length} адрес із sitemap`);

        return current;

    }

    const previousXml = fromPreviousCommit("sitemap.xml");

    // Першого запуску (або поза git) порівнювати нема з чим. Тихо
    // надсилати весь каталог тут НЕ ХОЧЕМО — для цього є явний --all.
    if (previousXml === null) {

        say("Немає попереднього коміту для порівняння — пропускаємо.");
        say("Щоб надіслати все свідомо: node scripts/ping-indexnow.js --all");

        return [];

    }

    const before = new Set(urlsFrom(previousXml));

    const fresh = current.filter(url => !before.has(url));

    // Змінені дані: адреса вже була в sitemap, тож різниця списків її
    // не покаже.
    const touched = [];

    const products = changedEntries("data/products.json", p => p.slug);

    if (products) {

        products.forEach(slug => touched.push(`${SITE_URL}/p/${encodeURIComponent(slug)}/`));

    }

    const promos = changedEntries("data/promotions.json", p => p.slug);

    if (promos) {

        promos.forEach(slug => touched.push(`${SITE_URL}/promo?id=${encodeURIComponent(slug)}`));

    }

    // Головна й каталог оновлюються від будь-якої зміни каталогу —
    // варто перечитати, коли щось справді змінилось.
    const listing = (fresh.length || touched.length)
        ? [`${SITE_URL}/`, `${SITE_URL}/catalog`]
        : [];

    const inSitemap = new Set(current);

    const all = [...new Set([...fresh, ...touched, ...listing])]
        // Надсилаємо лише те, що САМІ запросили в індекс. Адреса, якої
        // немає в sitemap (видалений товар, службова сторінка), там не
        // потрібна.
        .filter(url => inSitemap.has(url));

    say(`Нових адрес: ${fresh.length}, змінених: ${touched.length} → до надсилання: ${all.length}`);

    return all.slice(0, MAX_URLS);

}

function submit(urls) {

    const body = JSON.stringify({
        host: SITE_URL.replace(/^https?:\/\//, ""),
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls
    });

    return new Promise(resolve => {

        const request = https.request(ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": Buffer.byteLength(body)
            },
            timeout: 15000
        }, response => {

            let text = "";

            response.on("data", chunk => { text += chunk; });

            response.on("end", () => resolve({ status: response.statusCode, text }));

        });

        // Недоступний пошуковик — не причина валити збірку.
        request.on("error", error => resolve({ status: 0, text: error.message }));

        request.on("timeout", () => {
            request.destroy();
            resolve({ status: 0, text: "перевищено час очікування" });
        });

        request.write(body);
        request.end();

    });

}

async function main() {

    // НАДСИЛАЄ ЛИШЕ ПРОД. На dev адреси закриті robots.txt-ом
    // (Disallow: /), і запрошувати пошуковик на закриті сторінки —
    // прямий шлях до «Submitted URL blocked by robots.txt» у звітах.
    if (!INDEXABLE) {

        say(`Середовище ${ENV_NAME} закрите від пошуку — IndexNow не надсилаємо.`);

        return;

    }

    if (!INDEXNOW_KEY) {

        say("У site.config.json немає indexNowKey — пропускаємо надсилання.");

        return;

    }

    const keyFile = path.join(ROOT, `${INDEXNOW_KEY}.txt`);

    // Без файла з ключем пошуковик відповість 403: він перевіряє право
    // надсилати саме за ним. Ловимо це тут, а не в логах через тиждень.
    if (!fs.existsSync(keyFile)) {

        say(`Немає файла ${INDEXNOW_KEY}.txt у корені — пошуковик не зможе перевірити ключ.`);

        return;

    }

    if (fs.readFileSync(keyFile, "utf8").trim() !== INDEXNOW_KEY) {

        say(`Файл ${INDEXNOW_KEY}.txt не містить того самого ключа — надсилання скасовано.`);

        return;

    }

    // ЗБІРКА МАЄ ЗБІГАТИСЬ ІЗ СЕРЕДОВИЩЕМ.
    //
    // sitemap.xml несе домен того середовища, під яке його збирали. Якщо
    // запустити скрипт на дев-збірці без SITE_ENV, він порівнював би
    // адреси прода зі списком dev-адрес: розбіжність тиха, а результат —
    // «нічого не змінилось» при будь-яких змінах.
    const sitemapPath = path.join(ROOT, "sitemap.xml");

    const first = fs.existsSync(sitemapPath)
        ? urlsFrom(fs.readFileSync(sitemapPath, "utf8"))[0]
        : null;

    if (first && !first.startsWith(SITE_URL)) {

        say(`sitemap.xml зібраний під інший домен (${new URL(first).origin}), а середовище — ${SITE_URL}.`);
        say("Спершу перезберіть: npm run build");

        return;

    }

    const urls = collectUrls();

    if (!urls.length) {

        say("Нових і змінених адрес немає — надсилати нічого.");

        return;

    }

    urls.slice(0, 20).forEach(url => say(`   → ${url}`));

    if (urls.length > 20) say(`   … і ще ${urls.length - 20}`);

    if (DRY_RUN) {

        say(`--dry-run: запит не надсилаємо (${urls.length} адрес).`);

        return;

    }

    const { status, text } = await submit(urls);

    // 200 — прийнято, 202 — прийнято на перевірку ключа. Решта — привід
    // подивитись, але не привід валити збірку.
    if (status === 200 || status === 202) {

        say(`IndexNow: надіслано ${urls.length} адрес (HTTP ${status})`);

    } else {

        say(`IndexNow не прийняв запит (HTTP ${status})${text ? ": " + text.slice(0, 200) : ""}`);
        say("Сайт уже викладений — адреси знайдуть звичайним обходом.");

    }

}

module.exports = { urlsFrom, changedEntries, collectUrls };

if (require.main === module) {

    main().catch(error => {

        // Навіть несподівана помилка не має ламати збірку: пінг —
        // прискорювач, а не частина випуску.
        say(`IndexNow: несподівана помилка — ${error.message}`);

    });

}
