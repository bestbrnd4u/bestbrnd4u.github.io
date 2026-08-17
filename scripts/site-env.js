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

module.exports = {
    ENV_NAME: name,
    SITE_URL: env.url.replace(/\/+$/, ""),
    BRANCH: env.branch,
    INDEXABLE: env.indexable !== false,
    CNAME: env.cname || null,
    // домен, за яким Netlify впізнає сайт і на який ВІДПРАВЛЯЄ токен
    // назад через postMessage (див. site.config.json)
    OAUTH_SITE_ID: env.oauthSiteId || env.url.replace(/^https?:\/\//, ""),
    ALL: config
};
