// Посилання для Instagram: t.me/<бот>?start=product_<id>
//
// НАВІЩО ЦЕ Є
// ------------
// Instagram не дає клікабельних посилань у підписах, тож єдиний шлях
// із профілю в магазин — шапка, стікер у сторіс і директ. Посилання
// виду t.me/<бот>?start=product_15 відкриває бота ОДРАЗУ на потрібному
// товарі: з фото, ціною й кнопкою «Замовити».
//
// Скрипт, що їх складає, був — але вимагав логін бота аргументом і
// друкував усе в консоль. Тобто щоб дістати одне посилання, треба було
// відкрити термінал. Тепер перелік складає збірка після кожної зміни
// каталогу, а копіюють його з admin/instagram.html.
//
// ЩО ТУТ НАЙВАЖЛИВІШЕ
// --------------------
// Формат посилання знає ще й САМ БОТ — він розбирає «/start product_15»
// у supabase/functions/telegram-order-bot/format.js. Розійдуться —
// посилання з профілю приведуть людину до бота, який покаже привітання
// замість товару. Ні помилки, ні 404: просто не той екран.
//
// Тому набір не звіряє два рядки, а БЕРЕ розбирач бота й пропускає
// через нього справжні посилання зі згенерованого файлу.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = rel => fs.existsSync(path.join(ROOT, rel));

const links = require("../scripts/telegram-links.js");


console.log("\n[1] Перелік складає збірка, а не руки");
{
    const chain = JSON.parse(read("package.json")).scripts.build.split("&&").map(s => s.trim());

    const місце = chain.findIndex(s => s.includes("telegram-links.js"));

    check("крок є в ланцюжку збірки", місце >= 0, String(місце));

    // Після build-products.js: той переписує data/products/, і перелік
    // мусить бачити вже оновлені товари.
    const товари = chain.findIndex(s => s.includes("build-products.js"));

    check("і стоїть після збірки товарів", товари >= 0 && товари < місце,
        `${товари} < ${місце}`);

    // Логін бота — з адмінки, а не аргументом: збірку ніхто не
    // запускає руками, і спитати в неї нікого.
    check("логін бота береться з data/telegram.json",
        /data", "telegram\.json"/.test(read("scripts/telegram-links.js")));

    const telegram = JSON.parse(read("data/telegram.json"));

    check("логін бота заданий", Boolean(String(telegram.botUsername || "").trim()),
        telegram.botUsername);
}


console.log("\n[2] У переліку всі товари, і в кожного своє посилання");
{
    check("файл згенеровано", exists("data/instagram-links.json"));

    const data = JSON.parse(read("data/instagram-links.json"));

    const товарів = fs.readdirSync(path.join(ROOT, "data", "products"))
        .filter(f => f.endsWith(".json")).length;

    check(`товарів у переліку: ${data.products.length}, у каталозі ${товарів}`,
        data.products.length === товарів);

    const бот = JSON.parse(read("data/telegram.json")).botUsername.replace(/^@/, "");

    check("бот у файлі той самий, що в адмінці", data.bot === бот,
        `${data.bot} проти ${бот}`);

    const без = data.products.filter(p => !p.link || !p.id || !p.title);

    check("у кожного є посилання, номер і назва", без.length === 0,
        без.slice(0, 3).map(p => p.id).join(", "));

    const адреси = data.products.map(p => p.link);

    const повтори = адреси.filter((a, i) => адреси.indexOf(a) !== i);

    check("усі посилання різні", повтори.length === 0, повтори.slice(0, 3).join(", "));

    // Спершу новинки: постять те, що щойно приїхало, і шукати його в
    // кінці списку незручно.
    const перші = data.products.slice(0, data.products.filter(p => p.isNew).length);

    check("новинки стоять першими", перші.every(p => p.isNew),
        перші.filter(p => !p.isNew).length + " не новинок на початку");
}


console.log("\n[3] Бот розуміє саме ці посилання");
{
    // ГОЛОВНА ПЕРЕВІРКА НАБОРУ.
    //
    // Формат знає і скрипт, і бот. Звіряти їх регуляркою означало б
    // закріпити форму запису; тому беремо РОЗБИРАЧ бота й проганяємо
    // через нього справжні посилання.
    const src = read("supabase/functions/telegram-order-bot/format.js");

    const тіло = (src.match(/export function parseStartPayload\(text\)[\s\S]*?\n}/) || [])[0];

    check("розбирач бота знайшовся", Boolean(тіло));

    const parse = new Function(
        (тіло || "").replace("export function", "function") + "\nreturn parseStartPayload;")();

    const data = JSON.parse(read("data/instagram-links.json"));

    const зламані = data.products.filter(p => {

        // Telegram віддає боту «/start <payload>» — саме це й збираємо
        // з адреси, як це робить сам месенджер.
        const payload = (String(p.link).split("?start=")[1] || "");

        const result = parse("/start " + payload);

        return !result || result.type !== "product" || result.id !== p.id;

    });

    check(`бот упізнає всі ${data.products.length} посилань`, зламані.length === 0,
        зламані.slice(0, 3).map(p => p.link).join(", "));

    // І навпаки: формат складає ОДНЕ місце. Якщо посилання почнуть
    // будувати ще й у браузері, третя копія розійдеться першою.
    check("адресу складає лише scripts/telegram-links.js",
        /function linkFor\(username, id\)/.test(read("scripts/telegram-links.js"))
        && !/\?start=product_/.test(read("admin/instagram.html")));
}


console.log("\n[4] Сторінка в адмінці показує перелік");
{
    check("сторінка існує", exists("admin/instagram.html"));

    const page = read("admin/instagram.html");

    // Службова сторінка: у пошуку їй нічого робити.
    check("закрита від індексації", /name="robots" content="noindex, nofollow"/.test(page));

    check("читає згенерований файл", /data\/instagram-links\.json/.test(page));

    check("має пошук", /id="q"/.test(page) && /type="search"/.test(page));

    // Буфер обміну людина не бачить: без підтвердження клац виглядає
    // так, ніби нічого не сталося.
    check("після копіювання підтверджує", /Скопійовано/.test(page));

    // navigator.clipboard існує лише в захищеному контексті й може
    // відмовити — потрібен запасний шлях.
    check("є запасний шлях копіювання", /execCommand\("copy"\)/.test(page));

    check("є в меню адмінки",
        /href: "instagram\.html"/.test(read("admin/index.html")));
}


console.log("\n[5] Повторна збірка не дає порожнього коміту");
{
    // У файлі є дата оновлення — вона міняється щоразу. Якби крок
    // писав файл без порівняння, кожна збірка давала б коміт на
    // порожньому місці, і в історії репозиторію стало б удвічі більше
    // шуму.
    const до = read("data/instagram-links.json");

    links.writeList();

    const після = read("data/instagram-links.json");

    check("другий запуск поспіль нічого не змінює", до === після);

    check("порівняння свідомо ігнорує дату",
        /updated.*\[\^"\]\*/.test(read("scripts/telegram-links.js")));
}


console.log(failures === 0
    ? "\n✅ Посилання для Instagram: перелік свіжий, бот їх розуміє\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
