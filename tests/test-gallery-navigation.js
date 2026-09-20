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

console.log("\n[3b] Повноекранний перегляд відкривається з клавіатури");
{
    // ЩО БУЛО НЕ ТАК. Лайтбокс із зумом відкривався ЛИШЕ кліком по
    // фото, а фото — звичайна картинка: ні ролі, ні tabindex. Тобто
    // збільшити знімок з клавіатури було неможливо взагалі. Самі
    // фото на сторінці видно, тож втрата не смертельна — але
    // «мишею можна, клавіатурою ні» саме те, чого не має бути.
    check("слайд-фото — кнопка", /class="gallery-slide gallery-slide-photo"[\s\S]{0,120}role="button"/.test(code));

    // Читач має сказати не «що зображено», а «що станеться».
    check("і називає, що станеться",
        /aria-label="Фото \$\{index \+ 1\} з \$\{images\.length\}\. Натисніть, щоб відкрити на весь екран"/.test(code));

    check("Enter і Пробіл відкривають перегляд",
        /\.gallery-slide-photo"\);[\s\S]{0,140}openGalleryLightbox\(\)/.test(code));

    // Пробіл за замовчуванням гортає сторінку — галерея поїхала б
    // з-під людини.
    check("Пробіл не гортає сторінку",
        /const photo = event\.target\.closest\?\.\(".gallery-slide-photo"\);[\s\S]{0,120}event\.preventDefault\(\)/.test(code));

    // ОДИН ШЛЯХ НА КЛІК І НА ENTER. Збирання переліку слайдів довге
    // (відео, вбудовування, обгортки фото) — друга копія розійшлася
    // б із першою.
    check("клік і клавіатура йдуть одним шляхом",
        (code.match(/openGalleryLightbox\(\)/g) || []).length >= 3);

    check("збирання переліку не роздвоїлось",
        (code.match(/window\.openLightbox\(/g) || []).length === 1);
}

console.log("\n[3c] Зупинка таба одна, а не по числу знімків");
{
    // Знімків у товару буває шість-сім. Сім зупинок таба поспіль на
    // одній і тій самій картинці гірше, ніж жодної: людина довго
    // тисне Tab і не розуміє, куди потрапляє. Тому фокус приймає
    // лише показаний слайд.
    //
    // Сховані слайди самі собою з таб-порядку НЕ випадуть: це
    // scroll-snap-карусель, вони просто збоку, а не display:none.
    check("у розмітці нуль лише в першого",
        /tabindex="\$\{index === 0 \? "0" : "-1"\}"/.test(code));

    check("відео теж у черзі, а не завжди першим",
        /tabindex="\$\{images\.length === 0 \? "0" : "-1"\}"/.test(code));

    // Перемикає той самий код, що вже рахує активний слайд для
    // крапок, мініатюр і відео, — окремий обхід розійшовся б із ним.
    check("перемикає syncActiveState",
        /function syncActiveState[\s\S]{0,2600}slide\.tabIndex = i === index \? 0 : -1/.test(code));

    // Вбудоване відео (YouTube/Vimeo) не чіпаємо: усередині iframe
    // свій таб-порядок, і -1 на обгортці його не стосується.
    check("чіпаємо лише ті слайди, у яких tabindex уже є",
        /if \(!slide\.hasAttribute\("tabindex"\)\) return;/.test(code));

    // Фокус мусить бути видно: слайд несе role="button", і на нього
    // діє спільне правило фокуса з test-accessibility-floor [2].
    check("спільне правило фокуса покриває слайд",
        /\[role="button"\]:focus-visible/.test(css));

    // …але саме воно й робило кільце невидимим.
    //
    // ЗАМІРЯНО: слайд заповнює смугу галереї рівно, край у край
    // (0 px запасу з усіх боків), а смуга має overflow:auto hidden
    // заради гортання. Спільне правило малює кільце з
    // outline-offset:2px, тобто ЗА межами слайда — і його зрізало
    // повністю. Фокусований елемент без видимого фокуса це те саме,
    // що фокуса немає.
    check("кільце фокуса малюється всередину слайда",
        /\.gallery-track \.gallery-slide:focus-visible\{[^}]*outline-offset:-3px/.test(css));

    // Через предка, а не сам .gallery-slide: у спільного правила
    // така сама специфічність, і воно нижче за текстом на вісім
    // тисяч рядків — тобто перемагало б.
    check("правило важить більше за спільне",
        !/^\.gallery-slide:focus-visible\{/m.test(css));
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

console.log("\n[N] Масштаб не виходить за межі свого слайда");
{
    // СИМПТОМ
    // --------
    // Обрано перше фото — мітка й точка це підтверджують, — а
    // показується друге. Порядок фото в даних при цьому правильний.
    //
    // ЧОМУ
    // -----
    // Кадрування застосовувалось transform:scale() прямо на <img>, і
    // сам img був слайдом. transform не обрізається елементом: при 3×
    // фото візуально займає три ширини смуги, зокрема місце сусідів.
    // Слайди йдуть підряд, тож той, що пізніше в розмітці, малюється
    // ЗВЕРХУ — фото №2 накривало фото №1.
    //
    // Помітно стало лише тепер: доти масштаб майже ніде не перевищував
    // 1×, і виходити за межі було нічому.
    const product = read("assets/js/product.js");
    // Прибираємо комментарі: інакше пояснення всередині правила
    // «розтягують» його, і перевірки на кшталт [\s\S]{0,300} падають
    // не через код, а через довжину коментаря.
    const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");

    // Слайд — обгортка, масштабується вміст.
    check("слайд фото — обгортка",
        /<div class="gallery-slide gallery-slide-photo">/.test(product));
    check("фото всередині має власний клас",
        /<img class="gallery-photo"/.test(product));
    check("кадр застосовується до фото, не до обгортки",
        /class="gallery-photo"[^>]*style="\$\{galleryFrameStyle/.test(product));

    // Головне: обгортка мусить ОБРІЗАТИ вміст.
    check("обгортка обрізає масштабоване фото",
        /\.gallery-slide-photo\{[\s\S]{0,200}overflow:hidden/.test(css));

    // Обгортка успадкувала масштаб від .gallery-slide — без скидання
    // вийшло б подвійне збільшення.
    // transform:none тепер стоїть у тому самому правилі, що й
    // overflow і aspect-ratio — раніше це були два блоки поспіль,
    // і дубль селектора трималось лише на порядку рядків.
    check("подвійного масштабу немає",
        /\.gallery-slide-photo\{[\s\S]{0,300}transform:none/.test(css));

    // Обгортці потрібна висота: єдиний вміст усередині — звичайне
    // зображення, і без пропорції слайд склався б.
    check("обгортка має пропорцію",
        /\.gallery-slide-photo\{[\s\S]{0,200}aspect-ratio:4\/5/.test(css));

    // Побічний ефект, який легко пропустити: лайтбокс брав slide.src, а
    // в <div> його немає — фото зникло б із повноекранного перегляду.
    check("лайтбокс шукає вкладене зображення",
        /slide\.tagName === "IMG"\s*\n?\s*\? slide\s*\n?\s*: slide\.querySelector\("img"\)/.test(product));

    // srcset теж перебирає фото, а не обгортки
    check("srcset перебирає фото",
        /querySelectorAll\("\.gallery-photo"\)/.test(product));
}

console.log("\n[N2] Смуга слайдів — на живому DOM");
{
    const { JSDOM } = require("jsdom");

    const dom = new JSDOM(`
        <div class="main-photo"><div class="gallery-track" id="t">
          <div class="gallery-slide gallery-slide-photo">
            <img class="gallery-photo" src="/a/one.webp" style="--frame-zoom:2.98"></div>
          <div class="gallery-slide gallery-slide-photo">
            <img class="gallery-photo" src="/a/two.webp" style="--frame-zoom:3"></div>
          <div class="gallery-slide gallery-slide-photo">
            <img class="gallery-photo" src="/a/three.webp"></div>
        </div></div>`, { pretendToBeVisual: true });

    const slides = [...dom.window.document.getElementById("t").children];

    // та сама логіка, що в product.js
    const lightbox = slides.map(slide => {

        if (slide.tagName === "VIDEO") return { type: "video", src: slide.getAttribute("src") };
        if (slide.classList.contains("gallery-slide-embed")) return { type: "embed" };

        const photo = slide.tagName === "IMG" ? slide : slide.querySelector("img");

        return { type: "image", src: photo && photo.src };

    }).filter(x => x.src);

    check("усі фото доходять до лайтбокса", lightbox.length === slides.length,
        `${lightbox.length} з ${slides.length}`);

    check("порядок збережено",
        lightbox.map(x => x.src.split("/").pop()).join(",") === "one.webp,two.webp,three.webp",
        lightbox.map(x => x.src.split("/").pop()).join(","));

    // Кадр живе на зображенні, а не на слайді
    check("масштаб на зображенні",
        slides[0].querySelector("img").getAttribute("style").includes("--frame-zoom"));
    check("на обгортці кадру немає", !slides[0].getAttribute("style"));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
