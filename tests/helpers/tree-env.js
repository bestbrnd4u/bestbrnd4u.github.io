// Яке середовище зараз ЗІБРАНЕ в дереві — і як не зіпсувати його тестом.
//
// НАВІЩО ЦЕ ПОТРІБНО
// -------------------
// scripts/site-env.js читає змінну SITE_ENV, а якщо її немає — вважає
// середовищем production. Для збірки це розумний вибір за замовчуванням,
// але для тестів він виявився пасткою.
//
// Тести читають SITE_URL звідти ж і порівнюють його з тим, що реально
// лежить у файлах. На гілці dev у файлах — dev.bestbrnd4u.com, а тест
// без SITE_ENV чекає bestbrnd4u.com, тож червонів завжди.
//
// Гірше інше: test-static-product-pages запускає генератор сторінок
// дочірнім процесом (перевірка ідемпотентності). Без SITE_ENV дочірній
// процес перезбирає ВСІ 38 сторінок під production — тобто `npm test`
// на гілці dev тихо переписував canonical, og:url і хлібні крихти на
// бойову адресу. Саме так у гілку dev і потрапили сторінки з чужим
// доменом.
//
// РІШЕННЯ: питати не змінну оточення, а саме дерево. Ознаку пише
// scripts/apply-site-env.js в admin/index.html — вона є в обох гілках
// і оновлюється рівно тоді, коли середовище перемикають.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

// production | development
function treeEnvName() {

    const admin = fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8");

    const m = admin.match(/window\.SITE_ENVIRONMENT = \{[^}]*"name"\s*:\s*"([a-z]+)"/);

    return m && m[1] === "development" ? "development" : "production";

}

// Налаштування того середовища, у якому дерево зараз зібране, —
// незалежно від того, з якою (чи без якої) SITE_ENV запустили тест.
function treeSiteEnv() {

    const name = treeEnvName();

    const previous = process.env.SITE_ENV;

    process.env.SITE_ENV = name;

    // site-env.js читає SITE_ENV на момент require, тож скидаємо кеш
    delete require.cache[require.resolve("../../scripts/site-env")];

    const env = require("../../scripts/site-env");

    if (previous === undefined) delete process.env.SITE_ENV;
    else process.env.SITE_ENV = previous;

    return env;

}

// Оточення для дочірніх процесів: збірка, яку запускає тест, мусить
// іти під тим самим середовищем, що вже лежить у дереві.
function childEnv() {

    return { ...process.env, SITE_ENV: treeEnvName() };

}

module.exports = { treeEnvName, treeSiteEnv, childEnv };
