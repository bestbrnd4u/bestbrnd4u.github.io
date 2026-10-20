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
    // КАДР — НА ФОТО, А НЕ НА ОБГОРТЦІ.
    //
    // Тут стояв вираз по готовій розмітці
    // (class="gallery-photo"…style="${galleryFrameStyle"), і він
    // розсипався, щойно розмітку винесли у функцію фотоРозмітка():
    // клас став аргументом, а не літералом поруч зі стилем.
    //
    // Питання те саме, тому дивимось туди, де тепер живе відповідь:
    // у тілі будівника стиль мусить стояти в <img> і не мусить — на
    // <picture>, інакше масштаб кадрування обрізало б не те.
    const будівник = (product.match(/function фотоРозмітка\([\s\S]*?\n\}/) || [])[0] || "";

    check("будівник розмітки фото знайдено", Boolean(будівник));

    // Стиль мусить бути в наборі атрибутів, який іде ТІЛЬКИ в <img>,
    // а відкривний <picture> — лишатись без атрибутів.
    //
    // Перша версія цієї перевірки питала «чи немає galleryFrameStyle
    // одразу після <picture>» — і мовчала, коли стиль переносили на
    // саму обгортку: там зʼявлявся «<picture style=…», тобто вже не
    // «<picture>», і вираз просто не збігався. Пастка та сама, що й
    // скрізь: шукати відсутність легко не там.
    const спільне = (будівник.match(/const спільне = [\s\S]*?;\n/) || [])[0] || "";

    check("кадр застосовується до фото, не до обгортки",
        /style="\$\{galleryFrameStyle\(img\)\}"/.test(спільне)
        && /`<picture>`/.test(будівник),
        спільне ? "обгортка з атрибутами або стиль не в <img>" : "набір атрибутів не знайдено");

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

    // Розмітка тут така сама, як її будує фотоРозмітка(): фото
    // обгорнуте в <picture>, у src копія, оригінал — у data-full.
    const dom = new JSDOM(`
        <div class="main-photo"><div class="gallery-track" id="t">
          <div class="gallery-slide gallery-slide-photo"><picture>
            <source type="image/avif" srcset="/a/one-600.avif 600w">
            <img class="gallery-photo" src="/a/one-600.webp" data-full="/a/one.webp" style="--frame-zoom:2.98"></picture></div>
          <div class="gallery-slide gallery-slide-photo"><picture>
            <source type="image/avif" srcset="/a/two-600.avif 600w">
            <img class="gallery-photo" src="/a/two-600.webp" data-full="/a/two.webp" style="--frame-zoom:3"></picture></div>
          <div class="gallery-slide gallery-slide-photo">
            <img class="gallery-photo" src="/a/three.webp" data-full="/a/three.webp"></div>
        </div></div>`, { pretendToBeVisual: true });

    const slides = [...dom.window.document.getElementById("t").children];

    // та сама логіка, що в product.js
    const lightbox = slides.map(slide => {

        if (slide.tagName === "VIDEO") return { type: "video", src: slide.getAttribute("src") };
        if (slide.classList.contains("gallery-slide-embed")) return { type: "embed" };

        const photo = slide.tagName === "IMG" ? slide : slide.querySelector("img");

        return { type: "image", src: (photo && (photo.dataset.full || photo.src)) || "" };

    }).filter(x => x.src);

    check("усі фото доходять до лайтбокса", lightbox.length === slides.length,
        `${lightbox.length} з ${slides.length}`);

    // ОРИГІНАЛИ, А НЕ КОПІЇ. Якби лайтбокс і далі брав img.src, тут
    // були б one-600.webp — тобто зум показував би копію 600px.
    check("порядок збережено, і це оригінали",
        lightbox.map(x => x.src.split("/").pop()).join(",") === "one.webp,two.webp,three.webp",
        lightbox.map(x => x.src.split("/").pop()).join(","));

    // Обгортка не повинна заважати дістатись фото.
    check("фото знаходиться і крізь <picture>",
        slides[0].querySelector("img") !== null);

    // Кадр живе на зображенні, а не на слайді
    check("масштаб на зображенні",
        slides[0].querySelector("img").getAttribute("style").includes("--frame-zoom"));
    check("на обгортці кадру немає", !slides[0].getAttribute("style"));
}

console.log("\n[Зум двома пальцями не гортає фото]");
{
    // ЩО ОПИСАВ ВЛАСНИК: «відкрити другу картинку, двома пальцями
    // розсунути — призумувати, відпустити один із пальців, і картинка
    // перейде на третю або на першу, залежно від того, який палець
    // відпустити».
    //
    // «Залежно який» — це і є підказка. Обробник читав touches[0] і
    // ніде не питав, скільки пальців на екрані. Коли людина розводить
    // пальці, перший їде вбік — для коду це звичайний горизонтальний
    // свайп: він забирав жест у браузера, сам крутив стрічку, а на
    // відпусканні доводив її до сусіднього фото.
    const свайп = code.slice(code.indexOf("track.dataset.touchBound"),
                             code.indexOf('track.addEventListener("keydown"'));

    check("блок свайпу знайдено", свайп.length > 400, String(свайп.length));

    check("початок жесту питає, скільки пальців",
        /touchstart[\s\S]{0,200}event\.touches\.length > 1/.test(свайп));

    // Другий палець міг зʼявитись уже посеред руху — тоді touchstart
    // із двома пальцями не приходив зовсім.
    check("рух теж питає", /touchmove[\s\S]{0,300}event\.touches\.length > 1/.test(свайп));

    // САМЕ ТУТ СТРИБАЛА КАРТИНКА.
    check("після зуму нічого не доводимо",
        /touchend[\s\S]{0,400}if \(мультидотик\)/.test(свайп));

    // Прапорець має зніматись лише коли на екрані не лишилось жодного
    // пальця: до того це все ще той самий жест.
    check("прапорець знімається лише коли пальців не лишилось",
        /if \(!event\.touches\.length\) мультидотик = false;/.test(свайп));

    // Прилипання вимикається тільки на час НАШОГО свайпу — у чужому
    // жесті його треба повернути, інакше стрічка лишиться без нього.
    check("прилипання повертається, коли жест віддали",
        /віддатиЖест[\s\S]{0,200}scrollSnapType = ""/.test(свайп));

    // --- те саме в лайтбоксі, тільки на крок пізніше ---
    //
    // Там зум оброблений правильно, але коли людина відпускає ОДИН
    // палець, mode скидався в null, а другий палець продовжував рух —
    // і його зсув рахувався від СТАРОЇ початкової точки. Виходив
    // величезний «свайп».
    const lightbox = read("assets/js/lightbox.js");

    const кінець = lightbox.slice(lightbox.indexOf('track.addEventListener("touchend"'),
                                 lightbox.indexOf('track.addEventListener("touchcancel"'));

    check("лайтбокс: кінець жесту знайдено", кінець.length > 200, String(кінець.length));

    check("лайтбокс: жест не завершують, поки пальці на екрані",
        /if \(event\.touches && event\.touches\.length\)/.test(кінець));

    check("лайтбокс: жест перезапускається від пальця, що лишився",
        /startX = палець\.clientX/.test(кінець) && /startY = палець\.clientY/.test(кінець));

    // Фото наближене — значить, те, що лишилось, це перетягування, а
    // не гортання.
    check("лайтбокс: при наближеному фото це перетягування",
        /mode = scale > 1\.02 \? "pan" : null;[\s\S]{0,60}return;/.test(кінець));
}

console.log("\n[Слайд просить копію, а не повнорозмірний знімок]");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    // ---------------
    // У <img> спершу спрацьовує src, і лише потім ui.js дописує srcset
    // із копіями. На теплому кеші він устигає раніше за браузер, на
    // холодному — ні. Тому поки в src стояв повнорозмірний знімок,
    // перший візит тягнув його з мережі, хоч показувалась копія.
    //
    // Заміряно на dev 20.10.2026, сторінка Armani Crossbody, перший
    // візит: 245 КБ повнорозмірних проти 18 КБ показаних копій.
    //
    // Перевіряємо не слово «600», а зв'язок: у src стоїть копія, у
    // data-variant-src — оригінал (з нього ui.js будує srcset, і
    // підміна зламала б і його), і ширина копії не менша за ту, в
    // якій слайд показують.
    const js = read("assets/js/product.js");

    // Розмітку обох галерей будує одна функція — тож і питаємо її, а
    // не два схожих літерали в різних місцях файлу.
    const будівник = (js.match(/function фотоРозмітка\([\s\S]*?\n\}/) || [])[0] || "";

    check("будівник розмітки фото знайдено", Boolean(будівник));

    // Виклики: слайд просить 600, мініатюра — 300.
    const виклики = [...js.matchAll(/фотоРозмітка\(img,\s*(\d+),\s*"([^"]*)"/g)]
        .map(m => ({ ширина: Number(m[1]), sizes: m[2] }));

    check("обидві галереї кличуть будівника", виклики.length >= 2,
        виклики.map(v => v.ширина).join(", "));

    check("слайд бере копію, а не оригінал",
        /src="\$\{копіяФото\(img, ширина\)\}"/.test(будівник), будівник.slice(0, 120));

    // Копія не має бути вужчою за те, в чому її показують.
    //
    // Дужки з sizes прибираємо: «(max-width: 900px) 100vw, 600px» —
    // 900px тут УМОВА екрана, а не ширина показу. Без цього перевірка
    // вимагала копію 900 там, де слайд ніколи не ширший за 600.
    виклики.forEach(({ ширина, sizes }) => {

        const безУмов = sizes.replace(/\([^)]*\)/g, "");
        const найширше = Math.max(...(безУмов.match(/(\d+)px/g) || ["0px"]).map(s => parseInt(s, 10)));

        check(`копія ${ширина} не вужча за показ (${найширше}px)`,
            ширина >= найширше, `${ширина} < ${найширше}`);

    });

    // ФОРМАТ ОБИРАЄ БРАУЗЕР, А НЕ JS.
    //
    // Поки формат підставляв ui.js після рендеру, браузер устигав
    // узяти webp зі src, а потім ще й avif зі srcset: заміряно на dev
    // 20.10.2026 — webp 59 КБ плюс avif 55 КБ, хоч показувався лише
    // avif. <source type="image/avif"> вирішує це в розмітці.
    check("avif пропонується першим", /<source type="image\/avif"/.test(будівник));
    check("webp — запасним", /<source type="image\/webp"/.test(будівник));

    check("avif стоїть ПЕРЕД webp",
        будівник.indexOf('image/avif') < будівник.indexOf('image/webp'));

    // Коли копій немає, обгортки бути не повинно — лише <img>, і з
    // data-variant-src, щоб ui.js міг доробити srcset, якщо фото
    // нормалізують уже після збірки сторінки.
    check("без копій — звичайний img із шляхом для ui.js",
        /if \(!маєКопії\(img\)\)/.test(будівник)
        && /data-variant-src="\$\{img\}"/.test(будівник));

    // ЛАЙТБОКС МУСИТЬ ВІДКРИВАТИ ОРИГІНАЛ.
    //
    // У src тепер копія 600px. Повноекранний перегляд відкривають,
    // щоб роздивитись, — там потрібен оригінал, і його тримає
    // data-full. Перевірка народилась червоною: після переведення src
    // на копії зум показував саме копію.
    check("оригінал залишено в data-full", /data-full="\$\{img\}"/.test(будівник));

    check("лайтбокс бере data-full, а не src",
        /photo\.dataset\.full \|\| photo\.src/.test(js));

    // Обгортка не має стати коробкою: .gallery-photo має height:100%,
    // і відсоток рахувався б від <picture>, у якої висота авто.
    const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");

    check("picture прибрано з розкладки (display:contents)",
        /\.gallery-slide picture,\s*\.thumb picture\{[^}]*display:contents/.test(css));

    // ПЕРЕЛІК МУСИТЬ БУТИ ВІДОМИЙ ОДРАЗУ, А НЕ ПІСЛЯ ЗАПИТУ.
    //
    // Галерея малюється миттєво з window.PRODUCT_DATA. Поки перелік
    // копій тягнули лише запитом, він до першого малювання не
    // встигав — і це не теорія: після першої спроби цієї правки на
    // dev лишалось 764 КБ повнорозмірних при 31 КБ показаних копій.
    // Тому сторінка несе свій перелік у window.PHOTO_VARIANTS.
    check("перелік береться зі сторінки, синхронно",
        /знаніКопії = new Set\(\s*Array\.isArray\(window\.PHOTO_VARIANTS\)/.test(js));

    // Запит лишається для сторінок без вбудованого переліку, але мусить
    // ДОПОВНЮВАТИ: присвоєння новим Set стерло б те, що сторінка вже
    // знала, і повернуло б повнорозмірні при перемиканні кольору.
    check("запит доповнює перелік, а не заміщає",
        /знаніКопії\.add\(/.test(js) && !/знаніКопії = new Set\(Array\.isArray\(list\)/.test(js));

    check("перелік копій береться з data/image-variants.json",
        /fetch\(dataUrl\("data\/image-variants\.json"\)\)/.test(js));

    // І найголовніше: не приїхав перелік — лишається оригінал.
    // Інакше порожній Set перетворив би галерею на биті посилання.
    //
    // Дивимось у тіло самої функції: шукати по всьому файлу означало б
    // спіткнутись об дужки всередині виклику (шлях.split("/").pop()).
    const тіло = (js.match(/function копіяФото\([\s\S]*?\n\}/) || [])[0] || "";

    check("тіло копіяФото знайдено", Boolean(тіло));

    check("без переліку підставляється оригінал",
        /знаніКопії\.has\([\s\S]*?\)\s*\)\s*return src;/.test(тіло), тіло.slice(0, 80));

    check("і для не-webp теж оригінал",
        /endsWith\("\.webp"\)\)\s*return src;/.test(тіло));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
