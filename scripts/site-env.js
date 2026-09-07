// Одне місце, де живе адреса сайту й налаштування середовища.
//
// НАВІЩО: домен був зашитий у восьми місцях — assets/js/common.js,
// три збиральні скрипти, robots.txt і canonical/og у кожній статичній
// сторінці. Переїзд на власний домен означав би ручну правку всюди,
// з гарантованим шансом щось пропустити. Тепер джерело одне —
// site.config.json, а решта читає його.
//
// Середовище обирається змінною SITE_ENV:
//   SITE_ENV=production  (за замовчуванням) — bestbrnd4u.com
//   SITE_ENV=development — dev.bestbrnd4u.com, закритий від індексації
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));

const name = process.env.SITE_ENV === "development" ? "development" : "production";

const env = config[name];

if (!env || !env.url) {
    throw new Error(`У site.config.json немає коректного середовища "${name}"`);
}

// Крок не налаштований: сказати про це так, щоб було видно.
//
// НАВІЩО. Кроки за розкладом, яким бракує ключа, виходять
// УСПІШНО — розклад не має червоніти через ненастроєну
// можливість. Але тоді в списку запусків стоїть галочка, а не
// зроблено нічого, і відрізнити одне від одного неможливо.
//
// Заміряно: нагадування про брошений кошик так і працювали —
// «success» у кожному запуску й жодного надісланого листа, бо
// ключів пошти в GitHub Actions не було взагалі (вони лежали в
// секретах Supabase — це інше сховище).
//
// ::warning:: малює жовтий рядок на сторінці запуску й не
// впливає на результат. Поза GitHub Actions пишемо звичайним
// рядком, щоб локальний запуск лишався читабельним.
function notConfigured(message) {

    if (process.env.GITHUB_ACTIONS) {
        console.log(`::warning::${message}`);
        return;
    }

    console.log(message);

}

module.exports = {
    ENV_NAME: name,
    SITE_URL: env.url.replace(/\/+$/, ""),
    BRANCH: env.branch,
    INDEXABLE: env.indexable !== false,
    CNAME: env.cname || null,
    // домен, за яким Netlify впізнає сайт і на який ВІДПРАВЛЯЄ токен
    // назад через postMessage (див. site.config.json)
    OAUTH_SITE_ID: env.oauthSiteId || env.url.replace(/^https?:\/\//, ""),
    // Ключ IndexNow — спільний на весь сайт, не на середовище: файл із
    // ним лежить у корені репозиторію, отже потрапляє в обидві гілки.
    // Надсилати адреси має право ЛИШЕ індексоване середовище — за це
    // відповідає сам scripts/ping-indexnow.js.
    INDEXNOW_KEY: config.indexNowKey || "",
    ALL: config, notConfigured };
