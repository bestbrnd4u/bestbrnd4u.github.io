// Скрипти не тримають показ сторінки.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Клієнт Supabase підключався в <head> звичайним тегом:
//
//     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3">
//
// 53 КБ стиснутого коду з ЧУЖОГО домену — і поки браузер не
// зʼєднається з jsdelivr, не завантажить і не розбере їх, він не малює
// нічого. На всіх 17 сторінках.
//
// ЩО ТЕПЕР
// ---------
// defer на всіх зовнішніх скриптах. Показ їх більше не чекає, а
// порядок виконання зберігається: відкладені виконуються після
// розбору сторінки, у тому порядку, у якому написані.
//
// ЧИМ ЗА ЦЕ ДОВОДИТЬСЯ ПЛАТИТИ
// -----------------------------
// Інлайновий скрипт виконується ТАМ, ДЕ НАПИСАНИЙ, тобто РАНІШЕ за
// будь-який відкладений. Через це блок у thanks.html перестав бачити
// window.Translit — і замість /brands/coach/ мовчки ставив довге
// /catalog?brand=Coach. Лікується обгорткою DOMContentLoaded.
//
// Саме за цим тут і стежимо: додати defer легко, а от помітити, що
// через нього щось тихо з'їхало, — ні.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

// Теги зі src, як вони написані.
const tagsWithSrc = html =>
    [...html.matchAll(/<script[^>]*\ssrc="[^"]*"[^>]*>/g)].map(m => m[0]);

console.log("\n[1] Жоден скрипт не тримає показ");
{
    const blocking = [];

    pages.forEach(page => {

        tagsWithSrc(read(page))
            .filter(tag => !/\s(defer|async)\b/.test(tag))
            .forEach(tag => blocking.push(`${page}: ${tag.slice(0, 70)}`));

    });

    check(`усі скрипти на ${pages.length} сторінках відкладені`,
        blocking.length === 0, blocking.slice(0, 4).join(" | "));

    // Найдорожчий із них — окремо й поіменно: саме він і був причиною.
    const home = read("index.html");

    check("клієнт Supabase більше не блокує показ",
        /<script[^>]*supabase-js[^>]*\sdefer[^>]*>/.test(home)
        || /<script[^>]*\sdefer[^>]*supabase-js[^>]*>/.test(home),
        (home.match(/<script[^>]*supabase-js[^>]*>/) || [""])[0]);

    // Згенеровані сторінки успадковують розмітку шаблонів — але
    // перевіряємо це, а не припускаємо.
    ["p/sumka-kros-bodi-marc-jacobs-the-snapshot/index.html",
     "brands/coach/index.html"].forEach(generated => {

        if (!fs.existsSync(path.join(ROOT, generated))) return;

        const bad = tagsWithSrc(read(generated))
            .filter(tag => !/\s(defer|async)\b/.test(tag));

        check(`${generated.split("/")[0]}/…: defer доїхав у згенероване`,
            bad.length === 0, bad.slice(0, 2).join(" | "));

    });
}

console.log("\n[2] Порядок виконання збережено");
{
    // defer виконує скрипти в порядку документа, тож достатньо, щоб
    // порядок у розмітці лишався правильним: спершу бібліотека,
    // потім те, що її вживає.
    const home = read("index.html");

    const lib = home.indexOf("supabase-js@");
    const client = home.indexOf("assets/js/supabase-client.js");
    const common = home.indexOf("assets/js/common.js");
    const app = home.indexOf("assets/js/app.js");

    check("бібліотека раніше за свого клієнта", lib >= 0 && lib < client);
    check("common.js раніше за app.js, який ним користується",
        common >= 0 && common < app);

    // async зламав би саме це: він виконує, щойно завантажилось.
    const anyAsync = pages.filter(p => /<script[^>]*\sasync\b[^>]*\ssrc=/.test(read(p)));

    check("async ніде не вжито — він ламає порядок",
        anyAsync.length === 0, anyAsync.join(", "));
}

console.log("\n[3] Інлайнові скрипти не покладаються на відкладені");
{
    // document.write у відкладеному скрипті стирає сторінку цілком.
    const withWrite = [];

    pages.forEach(p => { if (/document\.write\b/.test(read(p))) withWrite.push(p); });

    fs.readdirSync(path.join(ROOT, "assets/js"))
        .filter(f => f.endsWith(".js"))
        .forEach(f => {
            if (/document\.write\b/.test(read(`assets/js/${f}`))) withWrite.push(f);
        });

    check("document.write ніде немає", withWrite.length === 0, withWrite.join(", "));

    // Блок на сторінці подяки — той самий, що з'їхав. Він вживає
    // window.Translit, тож мусить чекати на DOMContentLoaded.
    const thanks = read("thanks.html");

    const block = thanks.match(/<script>\s*\/\/ Дані про щойно[\s\S]*?<\/script>/);

    check("блок на сторінці подяки знайдено", Boolean(block));

    if (block) {

        check("він чекає на DOMContentLoaded",
            /addEventListener\("DOMContentLoaded"/.test(block[0]));

        check("і саме там, де вживає Translit",
            /window\.Translit/.test(block[0]));

        // Синтаксис: обгортка міняє дужки в кінці, і зайва «)» тут
        // валить усю сторінку подяки мовчки.
        const body = block[0].replace(/^<script>/, "").replace(/<\/script>$/, "");

        let ok = true;
        try { new Function(body); } catch (error) { ok = false; }

        check("блок синтаксично цілий", ok);

    }

    // Решта інлайнових блоків мусить лишатись оголошеннями даних:
    // вони виконуються раніше за все інше.
    const risky = [];

    pages.forEach(page => {

        [...read(page).matchAll(/<script(?![^>]*src)(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)]
            .forEach(m => {

                const code = m[1];

                if (/DOMContentLoaded/.test(code)) return;

                // Оголошення window.X = … нікого не чіпають.
                if (/^\s*window\.[A-Z_]+\s*=/.test(code)) return;

                // Виклик чогось із відкладених файлів — ось це небезпечно.
                if (/\bwindow\.(Translit|Analytics|Stock|ProductOffer|LiveStock|NovaPoshta)\b/.test(code)) {
                    risky.push(`${page}: ${code.trim().slice(0, 50)}`);
                }

            });

    });

    check("жоден інший інлайновий блок не кличе відкладені файли",
        risky.length === 0, risky.join(" | "));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
