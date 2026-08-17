// Фото акцій на мобільному має бути видно ПОВНІСТЮ.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Слоти під фото акції мали жорстко задану висоту:
//   .brand-teaser-image      — aspect-ratio:4/3
//   .brand-campaign-image    — min-height:420px
//   .promo-hero-slide-image  — min-height:280px
// Разом з object-fit:cover це означало, що фото інших пропорцій
// обрізається. Вертикальний кадр 1200×1500 у слоті 4:3 показував лише
// ~60% площі — вузьку смугу посередині.
//
// Виправлення: на мобільному висота слота не задається, а береться від
// самого фото. Кадр видно цілком, і порожніх полів не з'являється —
// на відміну від object-fit:contain у слоті фіксованої висоти.
//
// Перевірка тут саме про ПОРЯДОК правил: перебити висоту, задану вище
// в кількох різних медіа-запитах, можна лише тим, що нове правило йде
// пізніше. Якщо хтось додасть свій блок після нього — фото знову
// почне обрізатись, і цей набір впаде.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const SLOTS = [
    ".promo-hero-slide-image",
    ".brand-campaign-image",
    ".brand-teaser-image",
    ".promo-card-image"
];

console.log("\n[1] Блок для мобільного існує");
{
    check("є пояснювальний коментар", css.includes("Фото акцій на мобільному"));

    const at = css.indexOf("Фото акцій на мобільному");
    const tail = css.slice(at);

    check("правила під максимальну ширину 768px",
        /@media\(max-width:768px\)/.test(tail));

    SLOTS.forEach(sel => {
        check(`${sel} згаданий у блоці`, tail.includes(sel), "немає");
    });
}

console.log("\n[2] Висота слота більше не нав'язується");
{
    const at = css.indexOf("Фото акцій на мобільному");
    const tail = css.slice(at);

    check("aspect-ratio знято", /aspect-ratio:auto/.test(tail));
    check("min-height знято", /min-height:0/.test(tail));
    check("max-height знято", /max-height:none/.test(tail));
    check("висота від фото (height:auto)", /height:auto/.test(tail));
    check("object-fit більше не cover", /object-fit:contain/.test(tail));
    check("<picture> теж відпущений по висоті",
        /picture\{[\s\S]{0,60}height:auto/.test(tail));
    check("слот не розтягується під висоту сусіда в сітці",
        /align-self:start/.test(tail));
}

console.log("\n[3] Правила йдуть ПІЗНІШЕ за ті, що задавали висоту");
{
    // саме порядком, без !important, перебиваються попередні медіа-блоки
    const fixAt = css.indexOf("Фото акцій на мобільному");

    const earlier = [
        [".brand-teaser-image", "aspect-ratio:4/3"],
        [".brand-campaign-image", "min-height:420px"],
        [".promo-hero-slide-image", "min-height:280px"]
    ];

    earlier.forEach(([sel, decl]) => {

        // шукаємо саме правило цього селектора з цією висотою
        let idx = -1;
        let from = 0;

        for (;;) {
            const hit = css.indexOf(sel + "{", from);
            if (hit === -1) break;
            const body = css.slice(hit, hit + 200);
            if (body.includes(decl)) idx = hit;
            from = hit + 1;
        }

        check(`${sel} (${decl}) оголошений ДО виправлення`,
            idx !== -1 && idx < fixAt,
            idx === -1 ? "правила не знайдено" : `${idx} проти ${fixAt}`);

    });

    check("після виправлення немає нових правил висоти для цих слотів",
        !SLOTS.some(sel => {
            const after = css.slice(fixAt + 2000);
            const hit = after.indexOf(sel + "{");
            if (hit === -1) return false;
            return /aspect-ratio:\s*\d|min-height:\s*[1-9]/.test(after.slice(hit, hit + 200));
        }));
}

console.log("\n[4] Дані: мобільні фото акцій існують і не порожні");
{
    const dir = path.join(ROOT, "data/promotions");
    const problems = [];
    let count = 0;

    fs.readdirSync(dir).filter(f => f.endsWith(".json")).forEach(f => {

        const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

        ["imageMobile", "promoPageImageMobile"].forEach(k => {
            if (!d[k]) return;
            count++;
            const p = path.join(ROOT, decodeURIComponent(d[k]).replace(/^\//, ""));
            if (!fs.existsSync(p)) problems.push(`${f}:${k}`);
            else if (fs.statSync(p).size < 1024) problems.push(`${f}:${k} — файл підозріло малий`);
        });

    });

    check(`мобільних фото прописано — ${count}`, count > 0);
    check("усі існують і не порожні", problems.length === 0, problems.join(" | "));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
