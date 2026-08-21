// Гортання галереї на сторінці товару.
//
// СИМПТОМ
// --------
// Крапки під головним фото були клікабельні — обробник на них стояв, —
// але про це неможливо було здогадатись: курсор над ними лишався
// стрілкою, з клавіатури до них не дійти, зчитувач екрана не називав
// їх кнопками. Плюс сама мішень 7×7 пікселів: пальцем не влучити.
//
// І гортати не було чим, окрім свайпу й мініатюр — стрілок не було
// зовсім.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const js = read("assets/js/product.js");
// без коментарів: у поясненнях і <span>, і «cursor» згадуються навмисно
const code = js.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[1] Крапка виглядає і поводиться як кнопка");
{
    check("крапка — <button>, а не <span>",
        /<button type="button"\s*\n?\s*class="gallery-dot/.test(code)
        && !/<span class="gallery-dot/.test(code));

    check("курсор показує, що на неї можна натиснути",
        /\.gallery-dot\{[\s\S]{0,300}cursor:pointer/.test(css));

    // 7×7px — надто мала мішень для пальця. Розширюємо псевдоелементом:
    // падінг зсунув би сусідні крапки, а відʼємний margin наклав би
    // їхні зони одна на одну, і клік між ними потрапляв би не туди.
    check("зона натискання більша за саму крапку",
        /\.gallery-dot::after\{[\s\S]{0,200}inset:/.test(css));

    const inset = (css.match(/\.gallery-dot::after\{[\s\S]{0,200}?inset:(-?\d+)px (-?\d+)px/) || []);
    const gap = (css.match(/\.gallery-dots\{[\s\S]{0,300}?gap:(\d+)px/) || [])[1];

    check("зони сусідніх крапок не перетинаються",
        inset[2] !== undefined && gap !== undefined
        && Math.abs(Number(inset[2])) * 2 <= Number(gap),
        `розширення ${inset[2]}px при gap ${gap}px`);

    check("зчитувач екрана називає номер фото",
        /aria-label="Фото \$\{index \+ 1\} з \$\{total\}"/.test(code));
    check("активна крапка позначена для зчитувача",
        /setAttribute\("aria-current", "true"\)/.test(code)
        && /removeAttribute\("aria-current"\)/.test(code));
}

console.log("\n[2] Стрілки гортання");
{
    check("є кнопка «назад»", /id="mainGalleryPrev"/.test(code));
    check("є кнопка «вперед»", /id="mainGalleryNext"/.test(code));
    check("обидві підписані для зчитувача",
        /aria-label="Попереднє фото"/.test(code) && /aria-label="Наступне фото"/.test(code));
    check("іконка не читається зчитувачем окремо", /aria-hidden="true"/.test(code));

    check("стрілки гортають", /step\(-1\)/.test(code) && /step\(1\)/.test(code));

    // Дійшовши до краю, людина частіше хоче подивитись ще раз, ніж
    // упертись у мертву кнопку.
    check("гортання по колу", /\(currentSlideIndex\(\) \+ delta \+ total\) % total/.test(code));

    check("є стилі стрілок", /\.gallery-arrow\{/.test(css));
    check("курсор і на стрілках", /\.gallery-arrow\{[\s\S]{0,400}cursor:pointer/.test(css));
    check("стрілки над фото", /\.gallery-arrow\{[\s\S]{0,300}z-index:/.test(css));

    // На телефоні гортають пальцем, кнопки лише закривали б товар
    check("на телефоні стрілки приховані",
        /max-width:768px\)\{[\s\S]{0,400}\.gallery-arrow\{ display:none/.test(css));
}

console.log("\n[3] Клавіатура");
{
    check("гортання стрілками клавіатури", /event\.key === "ArrowLeft"/.test(code));

    // На всю сторінку вішати не можна: стрілками гортають саму
    // сторінку, і галерея забирала б це в людини.
    check("слухаємо галерею, а не весь документ",
        /photoBox\.addEventListener\("keydown"/.test(code)
        && !/document\.addEventListener\("keydown"[\s\S]{0,200}ArrowLeft/.test(code));

    check("фокус видно", /\.gallery-arrow:focus-visible/.test(css) && /\.gallery-dot:focus-visible/.test(css));
}

console.log("\n[4] Зміна кольору не ламає гортання");
{
    // updateGalleryForColor перемальовує крапки й викликає setupGallery()
    // наново. Кнопки стрілок при цьому НЕ перестворюються — вони поза
    // контейнером крапок. Без позначки на ту саму кнопку навісився б
    // другий обробник, і галерея гортала б через одне фото.
    check("обробник стрілок навішується один раз",
        /photoBox\.dataset\.arrowsBound/.test(code));
    check("позначка ставиться до навішування",
        code.indexOf('photoBox.dataset.arrowsBound = "1"')
            < code.indexOf('prevBtn?.addEventListener'));

    // у різних кольорів різна кількість фото
    check("на одному фото стрілки ховаються",
        /const single = slidesCount\(\) < 2/.test(code)
        && /btn\.hidden = single/.test(code));
}

console.log("\n[5] Крапки в картці каталогу лишились індикатором");
{
    // Там на них немає обробника кліку — це показник прокрутки, а не
    // керування. Ставити їм cursor:pointer означало б обіцяти дію,
    // якої не буде.
    const ui = read("assets/js/ui.js");

    check("у картці каталогу крапки не клікабельні",
        !/\.photo-dot[\s\S]{0,200}addEventListener\("click"/.test(ui));
    check("і не вдають із себе кнопки",
        !/\.photo-dot\{[\s\S]{0,200}cursor:pointer/.test(css));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
