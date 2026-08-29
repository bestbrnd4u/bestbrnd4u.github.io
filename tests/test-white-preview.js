// Білий фон у прев'ю адмінки.
//
// ЩО ЦЕ ЗА НАБІР
// ---------------
// admin/white-preview.js — єдине місце, де рахується «яким стане фон
// після публікації». До нього ходять двоє: рядок кадрування ліворуч
// (admin/image-framing-widget.js) і картка з галереєю праворуч
// (admin/preview-templates.js).
//
// Раніше заливка жила всередині віджета, і картка показувала файл як є.
// Виглядало це так: ліворуч фон білий, праворуч сірий — тобто прев'ю,
// яке існує рівно заради «побачити результат», результату й не
// показувало.
//
// ЧОМУ ТУТ РАХУНОК, А НЕ ГРЕП
// ----------------------------
// Чиста частина модуля (borderColors, whitenPixels, plan) написана так,
// щоб виконуватись і в Node. Тож перевіряємо не «функція існує», а що
// вона робить із пікселями: на кутах біла добивка, під нею сірий фон,
// усередині — світлий «товар» і замкнена кишеня.
//
// Саме такий кадр і зламав попередню версію: детектор дивився в кути,
// бачив 255 і писав «Фон вже білий» над фото, у якого дві третини кадру
// сірі.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const WP = require("../admin/white-preview.js");

// Малюємо кадр руками: RGBA, як його віддає canvas.getImageData.
function canvas(w, h, fill) {

    const px = new Uint8ClampedArray(w * h * 4);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {

            const c = fill(x, y);
            const i = (y * w + x) * 4;

            px[i] = c[0];
            px[i + 1] = c[1];
            px[i + 2] = c[2];
            px[i + 3] = 255;

        }
    }

    return px;

}

const at = (px, w, x, y) => {
    const i = (y * w + x) * 4;
    return [px[i], px[i + 1], px[i + 2]];
};

const W = 80;
const H = 100;

// Бойовий випадок: фото приведене до 4:5, поля добиті БІЛИМ (255), фон
// самого знімка сірий (240), товар темний, а всередині нього — замкнена
// кишеня того ж сірого кольору (петля ремня).
const ПОЛЕ = 10;

function зразок(x, y) {

    // біла добивка по краях
    if (x < ПОЛЕ || x >= W - ПОЛЕ) return [255, 255, 255];

    // товар
    if (x >= 25 && x < 55 && y >= 30 && y < 70) {

        // кишеня всередині товару — того ж кольору, що фон, але ходу
        // від краю до неї немає
        if (x >= 35 && x < 45 && y >= 40 && y < 50) return [240, 240, 240];

        return [60, 50, 45];

    }

    return [240, 240, 240];

}


console.log("\n[1] Фон читається з периметра, а не з кутів");
{
    const px = canvas(W, H, зразок);

    const found = WP.borderColors(px, W, H);

    // Обидва кольори мусять знайтись: біла добивка і сірий фон знімка.
    check("знайдено обидва кольори периметра", found.colors.length === 2,
        JSON.stringify(found.colors));

    check("периметр однорідний", found.coverage >= 0.9, String(found.coverage));

    const описано = WP.describe(px, W, H);

    // ОСЬ РАДИ ЧОГО ВСЕ. Кути тут 255 — і стара версія писала «Фон вже
    // білий» над фото, у якого дві третини кадру сірі.
    check("кольором фону названо сірий, а не білу добивку",
        описано.color[0] === 240, JSON.stringify(описано.color));

    check("фото не вважається вже білим", описано.isWhite === false);

    check("фон визнано однорідним", описано.uniform === true);

    // А ось справді біле фото чіпати не треба.
    const біле = canvas(W, H, (x, y) => (x >= 25 && x < 55 && y >= 30 && y < 70)
        ? [60, 50, 45] : [255, 255, 255]);

    check("справді біле фото так і зветься", WP.describe(біле, W, H).isWhite === true);

    // Фото на моделі чи в інтерʼєрі: периметр строкатий, жоден колір не
    // набирає помітної частки — і фону тут просто немає. Далі plan()
    // відповість «лишаємо як є», бо заливка зʼїла б половину кадру.
    const строкате = canvas(W, H, (x, y) => [(x * 7 + y * 13) % 256,
        (x * 3 + y * 29) % 256, (x * 17 + y * 5) % 256]);

    check("у строкатого периметра фону не знаходиться",
        WP.describe(строкате, W, H) === null);

    check("і рішення для нього — не чіпати",
        WP.plan(null, WP.describe(строкате, W, H)).act === "keep");
}

console.log("\n[2] Заливка робить те, що обіцяє");
{
    const px = canvas(W, H, зразок);

    const found = WP.describe(px, W, H);

    const painted = WP.whitenPixels(px, W, H, found.colors);

    check("сірий фон став білим", at(px, W, 15, 15).join() === "255,255,255",
        at(px, W, 15, 15).join());

    check("товар лишився товаром", at(px, W, 30, 50).join() === "60,50,45",
        at(px, W, 30, 50).join());

    // Кишеня — те, куди заливці від краю немає ходу: всередині петлі
    // ремня, під ручкою. Без другого кроку тут лишався б сірий
    // острівець, якого в опублікованому фото вже не буде.
    check("замкнена кишеня теж побіліла", at(px, W, 40, 45).join() === "255,255,255",
        at(px, W, 40, 45).join());

    check("залито не весь кадр", painted / (W * H) < 0.9,
        String(painted / (W * H)));

    // Однорідність — запобіжник: без неї світла підкладка з фактурою
    // всередині сумки стала б білою дірою.
    const зФактурою = canvas(W, H, (x, y) => {

        if (x < ПОЛЕ || x >= W - ПОЛЕ) return [255, 255, 255];

        if (x >= 25 && x < 55 && y >= 30 && y < 70) {

            // підкладка: той самий рівень яскравості, але з фактурою
            if (x >= 35 && x < 45 && y >= 40 && y < 50) {
                return (x + y) % 2 ? [246, 246, 246] : [232, 232, 232];
            }

            return [60, 50, 45];

        }

        return [240, 240, 240];

    });

    const кольори = WP.describe(зФактурою, W, H).colors;

    WP.whitenPixels(зФактурою, W, H, кольори);

    check("підкладка з фактурою не стала білою дірою",
        at(зФактурою, W, 40, 45).join() !== "255,255,255",
        at(зФактурою, W, 40, 45).join());
}

console.log("\n[3] Рішення те саме, що прийме збірка");
{
    // plan() повторює порядок перевірок у whiten(file) зі збірки.
    // Розійдуться — і прев'ю почне показувати не те, що вийде, тільки
    // тихо.
    const сірий = { colors: [[240, 240, 240]], uniform: true, isWhite: false };
    const білий = { colors: [[255, 255, 255]], uniform: true, isWhite: true };
    const строкатий = { colors: [[10, 20, 30]], uniform: false, isWhite: false };

    check("сірий однорідний фон вирівнюється сам",
        WP.plan(null, сірий).act === "white");

    check("«Не чіпати» сильніше за автоматику",
        WP.plan({ bg: "keep" }, сірий).act === "keep");

    check("«Вирізати» — окремий інструмент, не заливка",
        WP.plan({ bg: "cutout" }, сірий).act === "cutout");

    check("уже білий фон не чіпаємо",
        WP.plan(null, білий).act === "keep");

    // Заради цього кнопка «Зробити білим» і потрібна: фон 250 формально
    // білий, а поруч із чисто білою карткою виглядає сірим.
    check("«Зробити білим» обходить перевірку «фон уже білий»",
        WP.plan({ bg: "white" }, білий).act === "white");

    // Цей запобіжник не обходиться навіть примусово: там «фоном»
    // слугує сам знімок, і заливка зʼїла б половину кадру.
    check("неоднорідний фон не обходиться навіть примусово",
        WP.plan({ bg: "white" }, строкатий).act === "keep");

    check("нечитане фото не вигадує собі фон",
        WP.plan(null, null).act === "keep");

    // Мовчазне «нічого не змінилось» — саме те, через що кнопка одного
    // разу вже виглядала зламаною.
    ["keep", "cutout"].concat([null]).forEach(bg => {

        const found = bg === null ? строкатий : сірий;
        const decision = WP.plan(bg === null ? null : { bg: bg }, found);

        if (decision.act === "white") return;

        check(`причина названа (${bg || "неоднорідний"})`,
            typeof decision.why === "string" && decision.why.length > 0,
            JSON.stringify(decision));

    });
}

console.log("\n[3b] Заливка не з'їдає модель");
{
    // ЩО СТАЛОСЬ НА БОЙОВОМУ САЙТІ
    // -----------------------------
    // Модель у чорній сукні стоїть так, що сукня торкається краю
    // кадру. Її колір набирає понад 5% периметра, потрапляє в список
    // «кольорів фону» — і заливка, яка приймає будь-який колір зі
    // списку, розтікається по всій сукні.
    //
    //     rtlafd950301_33526729_9_v1_2x.webp
    //       255,255,255 (67%)   біла добивка до 4:5
    //       234,234,234 (29%)   справжній фон знімка
    //        21,22,26   (5%)    ЧОРНА СУКНЯ ← і її залило білим
    //
    // Від моделі лишилась половина. Відтворюємо кадр і перевіряємо,
    // що темне більше не вважається фоном.
    const темнаСмуга = canvas(W, H, (x, y) => {

        if (x < ПОЛЕ || x >= W - ПОЛЕ) return [255, 255, 255];   // добивка 4:5

        // «сукня» — темна, від низу до верху, торкається краю кадру
        if (x >= 12 && x < 30) return [21, 22, 26];

        return [234, 234, 234];                                   // фон знімка

    });

    const знайдено = WP.describe(темнаСмуга, W, H);

    check("темний колір не потрапляє у фон",
        знайдено && знайдено.colors.every(c => Math.min(c[0], c[1], c[2]) >= WP.DARK_BACKGROUND),
        JSON.stringify(знайдено && знайдено.colors));

    // І головне — заливка мусить зупинитись на сукні, а не пройти крізь неї.
    const копія = темнаСмуга.slice();

    WP.whitenPixels(копія, W, H, знайдено.colors);

    check("темна смуга лишилась на місці",
        at(копія, W, 20, 50).join() === "21,22,26", at(копія, W, 20, 50).join());

    // Другий випадок: кадр обрізає товар. Модель по пояс або
    // макрозйомка — заливка йде вздовж товару всередину.
    const обрізаний = canvas(W, H, (x, y) => {

        // «товар» широкою смугою впирається в нижню межу кадру
        if (y >= 60) return [180, 150, 130];

        return [235, 235, 235];

    });

    check("кадр, що обрізає товар, розпізнається",
        WP.describe(обрізаний, W, H).cropped === true);

    check("і рішення для нього — не чіпати",
        WP.plan(null, WP.describe(обрізаний, W, H)).act === "keep");

    // Запобіжник не обходиться навіть кнопкою: саме тут заливка
    // з'їдала моделей, і примусовий режим не має цього вмикати.
    check("«Зробити білим» цей запобіжник не обходить",
        WP.plan({ bg: "white" }, WP.describe(обрізаний, W, H)).act === "keep");

    // А нормальне предметне фото повз цей запобіжник проходить.
    const предметне = canvas(W, H, зразок);

    check("предметне фото запобіжник пропускає",
        WP.describe(предметне, W, H).cropped === false
        && WP.plan(null, WP.describe(предметне, W, H)).act === "white");
}

console.log("\n[4] Числа не розходяться зі збіркою");
{
    const script = fs.readFileSync(path.join(ROOT, "scripts/whiten-backgrounds.js"), "utf8");

    const число = (re) => {
        const m = script.match(re);
        return m ? Number(m[1]) : null;
    };

    check("допуск навколо кольору фону", WP.TOLERANCE === число(/TOLERANCE = (\d+)/));
    check("поріг однорідності кишень", WP.MAX_VARIANCE === число(/MAX_VARIANCE = (\d+)/));
    check("поріг «уже білий»", WP.ALREADY_WHITE === число(/ALREADY_WHITE = (\d+)/));
    check("межа «залито майже весь кадр»", WP.MAX_SHARE === число(/share > ([\d.]+)/));
    check("поріг «темне — не фон»", WP.DARK_BACKGROUND === число(/DARK_BACKGROUND = (\d+)/));
    check("частка сторони кадру", WP.EDGE_SHARE === число(/EDGE_SHARE = ([\d.]+)/));

    // Збірка має ще й перевірку постфактум: подивитись, ЩО саме
    // залилось. У браузері вона ні до чого — там результат видно
    // оком, — але у збірці це останній рубіж.
    check("збірка перевіряє результат заливки",
        /MAX_DARK_PAINTED/.test(script) && /заливка зачепила товар/.test(script));

    // Порядок перевірок теж мусить збігатися: «не чіпати» → «вирізати»
    // → однорідність → «уже біле».
    const модуль = fs.readFileSync(path.join(ROOT, "admin/white-preview.js"), "utf8");

    const порядок = (text, marks) => marks.map(m => text.indexOf(m));

    const уМодулі = порядок(модуль,
        ['chosen === "keep"', 'chosen === "cutout"', "!found.uniform", "found.isWhite"]);

    const уЗбірці = порядок(script,
        ['decided === "keep"', 'decided === "cutout"', "coverage < 0.9", "allWhite &&"]);

    check("порядок перевірок той самий",
        уМодулі.every((v, i) => v > 0 && (i === 0 || v > уМодулі[i - 1]))
        && уЗбірці.every((v, i) => v > 0 && (i === 0 || v > уЗбірці[i - 1])),
        JSON.stringify({ уМодулі, уЗбірці }));
}

console.log("\n[5] Модуль підключений і самодостатній");
{
    const html = fs.readFileSync(path.join(ROOT, "admin/index.html"), "utf8");

    check("підключений в адмінці", /white-preview\.js/.test(html));

    // Порядок важливий: обидва споживачі шукають window.WhitePreview
    // під час монтування.
    check("підключений ДО обох споживачів",
        html.indexOf("white-preview.js") < html.indexOf("image-framing-widget.js")
        && html.indexOf("white-preview.js") < html.indexOf("preview-templates.js"));

    const модуль = fs.readFileSync(path.join(ROOT, "admin/white-preview.js"), "utf8");

    // Той файл підключає КОЖНА сторінка сайту — заливка потрібна лише
    // адмінці, покупцю приїжджає вже оброблене фото.
    const site = fs.readFileSync(path.join(ROOT, "assets/js/image-framing.js"), "utf8");

    check("заливка не потрапила в спільний із сайтом файл",
        !/whitenPixels|borderColors/.test(site));

    // Віджет мусить працювати й без цього файлу: інакше товар просто не
    // збережеться (див. коментар про resolveWidget у віджеті).
    const widget = fs.readFileSync(path.join(ROOT, "admin/image-framing-widget.js"), "utf8");

    check("відсутність модуля не ламає віджет",
        /function whiteLib\(\)/.test(widget)
        && /if \(!url \|\| !white\) return;/.test(widget));

    // WebP замість PNG: та сама картинка кодується в рази швидше, а
    // фотографій тут до десятка за один вхід у товар.
    check("передперегляд кодується швидким форматом",
        /toDataURL\("image\/webp"/.test(модуль));
}

console.log("\n[6] Картка праворуч показує те саме, що рядок ліворуч");
{
    // ЗАРАДИ ЦЬОГО ВСЕ Й ЗАТІВАЛОСЬ. Ліворуч фон уже білий, праворуч
    // той самий сірий — а підпис під кнопкою виправдовувався, що «він
    // зміниться при публікації». Читалось це як «нічого не працює».
    const preview = fs.readFileSync(path.join(ROOT, "admin/preview-templates.js"), "utf8");

    const widget = fs.readFileSync(path.join(ROOT, "admin/image-framing-widget.js"), "utf8");

    check("велике фото картки бере відбілене, якщо воно є",
        /src: this\.state\.white \|\| this\.state\.url/.test(preview));

    check("рядок кадрування — так само",
        /src: this\.state\.whitePreview \|\| url/.test(widget));

    // Обидві галереї — і картка каталогу, і сторінка товару — це той
    // самий PreviewGallery, тож прапорець стоїть у двох місцях: велике
    // фото й мініатюри під ним.
    check("відбілення просять і велике фото, і мініатюри",
        (preview.match(/whiten: true/g) || []).length === 2,
        String((preview.match(/whiten: true/g) || []).length));

    check("рішення про фон доїжджає разом із прапорцем",
        (preview.match(/frame: frameFor\(framing, /g) || []).length === 2);

    // Збірка вирівнює фон лише в assets/images/products/uploads. Банер
    // акції, фото добірки і спливаючий банер вона не чіпає — прев'ю не
    // має вигадувати їм інший вигляд.
    const usages = (preview.match(/h\(AssetImage, \{/g) || []).length;

    check("банер акції та фото добірки лишаються як є", usages > 2,
        `AssetImage: ${usages}, з відбіленням: 2`);

    const script = fs.readFileSync(path.join(ROOT, "scripts/whiten-backgrounds.js"), "utf8");

    check("і збірка справді ходить лише по фото товарів",
        /DIR = path\.join\(ROOT, "assets\/images\/products\/uploads"\)/.test(script));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
