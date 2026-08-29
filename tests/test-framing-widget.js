// Кадрування фото в адмінці: чому воно «замерзало» і куди поділось тло.
//
// ДВІ ПОЛОМКИ, ЯКІ ЛОВИТЬ ЦЕЙ НАБІР
// ----------------------------------
// 1. Після першої ж зміни віджет переставав реагувати: «Скинути кадр»
//    не скидав, «Підігнати» на другому фото не робило нічого. Дані при
//    цьому мовчки мінялись — на екрані одне, збережеться інше.
//
//    Причина в одному рядку: toPlain() віддавав те саме посилання, і
//    onChange приносив Decap рівно той об'єкт, який там уже лежав.
//
// 2. Цілий блок інтерфейсу — колір тла, підпис, три кнопки й
//    передперегляд — не малювався ніколи. detectBackground() був
//    написаний і готовий, але його ніхто не викликав: у компонента не
//    було componentDidMount.
//
// Обидві помітні лише в живій адмінці й обидві мовчазні, тому тут
// перевіряється поведінка, а не наявність рядків.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const lib = require("../assets/js/image-framing.js");

const widget = fs.readFileSync(path.join(ROOT, "admin/image-framing-widget.js"), "utf8");

// Витягуємо функцію з IIFE й виконуємо саму її: підняти віджет цілком
// означало б підняти React і половину Decap заради двох рядків логіки.
function extract(from, to) {

    const start = widget.indexOf(from);
    const end = widget.indexOf(to, start);

    if (start < 0 || end < 0) throw new Error("не знайдено: " + from);

    return widget.slice(start, end + to.length);

}

const toPlain = new Function(
    extract("function toPlain(value) {", "\n    }") + "; return toPlain;")();

const setFrame = new Function(
    "toPlain",
    extract("        setFrame: function (lib, src, frame) {", "\n        }")
        .replace("        setFrame: function", "return function")
    + ";")(toPlain);


console.log("\n[1] Кожна зміна доходить до Decap");
{
    // Модель того, як поводиться Decap: значення зберігається як є, і
    // перемальовування залежить від того, ЧИ ІНШЕ це посилання.
    const впало = [];

    const ctl = {
        props: {
            value: undefined,
            onChange: function (next) { впало.push(next); ctl.props.value = next; }
        }
    };

    setFrame.call(ctl, lib, "a.webp", { zoom: 2, x: 10, y: 20 });

    check("перша зміна збереглась", впало.length === 1 && впало[0]["a.webp"].zoom === 2);

    setFrame.call(ctl, lib, "b.webp", { zoom: 3, x: 30, y: 40 });

    // Ось на цьому все й трималось: другий onChange приносив ТОЙ САМИЙ
    // об'єкт, і для React нічого не змінилось.
    check("друге фото приходить НОВИМ об'єктом, а не тим самим",
        впало[1] !== впало[0]);

    check("і не загубило перше", впало[1]["a.webp"].zoom === 2 && впало[1]["b.webp"].zoom === 3);

    setFrame.call(ctl, lib, "a.webp", null);

    check("скидання приходить новим об'єктом", впало[2] !== впало[1]);

    check("скидання прибирає саме свій кадр",
        !("a.webp" in впало[2]) && впало[2]["b.webp"].zoom === 3,
        JSON.stringify(впало[2]));

    // Попереднє значення не має мінятись заднім числом — інакше
    // порівняти «було / стало» неможливо в принципі.
    check("минуле значення лишилось недоторканим",
        впало[1]["a.webp"] && впало[1]["a.webp"].zoom === 2);
}

console.log("\n[2] Immutable-значення теж не ламається");
{
    // Decap тримає дані як Immutable.Map. Гілка з .toJS() працювала й
    // раніше — саме тому баг було легко не помітити.
    const впало = [];

    const immutable = { toJS: function () { return { "a.webp": { zoom: 2, x: 50, y: 50 } }; } };

    const ctl = {
        props: { value: immutable, onChange: function (n) { впало.push(n); } }
    };

    setFrame.call(ctl, lib, "b.webp", { zoom: 2.5, x: 10, y: 10 });

    check("із Immutable виходить звичайний об'єкт",
        впало[0] && впало[0]["a.webp"].zoom === 2 && впало[0]["b.webp"].zoom === 2.5,
        JSON.stringify(впало[0]));

    // Наближення понад MAX_ZOOM бібліотека затискає — віджет не має
    // права записати в товар значення, якого сайт не покаже.
    setFrame.call(ctl, lib, "c.webp", { zoom: 9, x: 10, y: 10 });

    check("завелике наближення затискається до межі",
        впало[1]["c.webp"].zoom === lib.MAX_ZOOM, JSON.stringify(впало[1]["c.webp"]));
}

console.log("\n[3] Фон: блок узагалі має зʼявлятись");
{
    const код = widget.replace(/\/\/[^\n]*/g, "");

    // Дивимось у тіло методу, а не «в межах N символів»: componentDidMount
    // ще й підписується на подію, і будь-яка відстань тут — це майбутнє
    // хибне падіння через додану поруч кнопку.
    const тіло = (name, next) => код.slice(код.indexOf(name + ": function"),
        код.indexOf(next + ": function"));

    check("розбір фону хтось викликає",
        /this\.detectBackground\(\);/.test(тіло("componentDidMount", "componentWillUnmount")));

    // Адреса фото приходить не одразу — getAsset розвʼязує файл
    // асинхронно. Без повторної спроби щойно додане фото лишалось би
    // без блоку про фон до перезавантаження сторінки.
    check("і повторює спробу, коли адреса зʼявилась",
        /this\.detectBackground\(\);/.test(тіло("componentDidUpdate", "pointTo")));

    // Адресу, за якою вже рахували, тримаємо НА КОМПОНЕНТІ, а не в
    // стані: відповідь може прийти синхронно (рішення «не чіпати»
    // відоме без читання файлу), а setState до того моменту ще не
    // застосувався — перевірка відкинула б власний же результат.
    check("памʼятаємо саме адресу, а не «вже перевіряли»",
        /this\.bgFor === url/.test(код) && /this\.bgFor = url;/.test(код));

    check("невдалий розбір не мовчить",
        /if \(!found\) \{[\s\S]{0,120}console\.warn/.test(код));

    // Три кнопки й підписи — те, заради чого все це.
    ["Зробити білим", "Не чіпати", "Автоматично",
        "Фон вже білий", "Фон сірий або бежевий", "Фон неоднорідний"].forEach(text => {
        check(`у розмітці є «${text}»`, widget.includes(text));
    });

    // «Тло» замінили на «фон» на прохання власника: у підписах має бути
    // одне слово, а не два для однієї речі.
    check("старе слово «тло» в підписах не лишилось",
        !/"[^"]*[Тт]ло[^"]*"/.test(код));

    // Неоднорідний фон — фото на моделі чи в інтерʼєрі: заливка зʼїла б
    // пів кадру. Цей запобіжник не обходиться навіть примусово.
    check("для неоднорідного фону кнопок немає",
        /this\.state\.bgUniform\s*\?\s*h\("div", \{ className: "framing-bg-actions" \}/.test(код));

    // Умови «якщо натиснуто біле» тут бути не має: збірка вирівнює фон
    // і САМА, коли він однорідний і не білий. Тобто найчастіший випадок
    // («нічого не натискав») показувався б неправдиво — у рядку сіре
    // фото, після публікації біле.
    check("передперегляд показує майбутній результат, а не «якщо натиснули»",
        /src: this\.state\.whitePreview \|\| url/.test(код));

    // Мовчазне «нічого не змінилось» — саме те, через що кнопка одного
    // разу вже виглядала зламаною.
    check("причину, чому фон лишився, видно в підказці",
        /this\.state\.bgWhy[\s\S]{0,80}Фон лишиться як є/.test(код));
}

console.log("\n[3b] Заливка одна на віджет і на картку");
{
    const код = widget.replace(/\/\/[^\n]*/g, "");

    const preview = fs.readFileSync(path.join(ROOT, "admin/preview-templates.js"), "utf8")
        .replace(/\/\/[^\n]*/g, "");

    const модуль = fs.readFileSync(path.join(ROOT, "admin/white-preview.js"), "utf8");

    // ЧОМУ ЦЕ ВАЖЛИВО. Картка праворуч показувала файл як є: ліворуч фон
    // уже білий, праворуч той самий сірий. Друга копія заливки
    // розійшлася б із першою на першій же правці — і два вікна поруч
    // показували б різне, а котре правда, зʼясувалось би аж після
    // публікації.
    check("обидва беруть результат з одного модуля",
        /window\.WhitePreview/.test(код) && /window\.WhitePreview/.test(preview));

    check("у віджеті другої копії заливки не лишилось",
        !/function whitenPixels|whitenPixels: function/.test(код));

    check("у прев'ю копії теж немає",
        !/function whitenPixels|function borderColors/.test(preview));

    // Розбір лишається дешевим, а передперегляд — великим. Раніше
    // заливку рахували на пікселях РОЗБОРУ, а він навмисно працює на
    // копії 160px: рамка в адмінці 145px, при 1.5× у неї розтягується
    // сотня пікселів джерела. Виглядало так, ніби кнопка псує знімок.
    check("розбір лишається дешевим — 160px", /PROBE_MAX = 160/.test(модуль));
    check("передперегляд малюється більшим — 640px", /PREVIEW_MAX = 640/.test(модуль));

    // Раніше заливка + toDataURL проганялись у render() — тобто на
    // кожен рух повзунка. На 640px це підвісило б браузер.
    const рендер = код.slice(код.indexOf("render: function"));

    check("у render немає ані заливки, ані toDataURL",
        !/whitenPixels|toDataURL/.test(рендер));

    // Те саме фото просять рядок кадрування, велике фото картки й
    // мініатюра під ним — і те саме на вкладці «Сторінка товару».
    check("одне фото обробляється один раз на всю адмінку",
        /function once\(key, work, done\)/.test(модуль)
        && /job\.waiting\.push\(done\)/.test(модуль));

    check("ключ кешу враховує і рішення, і адресу",
        /url \+ "\|" \+ \(\(this\.props\.frame && this\.props\.frame\.bg\)/.test(код)
        && /url \+ "\|" \+ \(\(this\.props\.frame && this\.props\.frame\.bg\)/.test(preview));

    check("асинхронний setState не летить у мертвий компонент",
        /componentWillUnmount: function \(\)[\s\S]{0,80}this\.alive = false/.test(код)
        && /self\.alive === false/.test(код)
        && /if \(self\.gone/.test(preview));

    // Числа мусять збігатися зі збіркою — інакше показане перестане
    // збігатись з опублікованим.
    const script = fs.readFileSync(path.join(ROOT, "scripts/whiten-backgrounds.js"), "utf8");

    check("допуск заливки збігається зі збіркою",
        /TOLERANCE = 14/.test(модуль) && /TOLERANCE = 14/.test(script));

    check("поріг однорідності кишень теж однаковий",
        /MAX_VARIANCE = 3/.test(модуль) && /MAX_VARIANCE = 3/.test(script));

    check("поріг «фон уже білий» однаковий",
        /ALREADY_WHITE = 250/.test(модуль) && /ALREADY_WHITE = 250/.test(script));

    check("межа «залито майже весь кадр» однакова",
        /MAX_SHARE = 0\.97/.test(модуль) && /share > 0\.97/.test(script));
}

console.log("\n[3c] Картка праворуч показує те фото, яке правлять");
{
    const код = widget.replace(/\/\/[^\n]*/g, "");

    const preview = fs.readFileSync(path.join(ROOT, "admin/preview-templates.js"), "utf8")
        .replace(/\/\/[^\n]*/g, "");

    const css = fs.readFileSync(path.join(ROOT, "admin/editor-styles.css"), "utf8");

    // Прев'ю жило власним життям: правиш третє фото, а картка вперто
    // показує перше. Щоб побачити результат, доводилось окремо гортати
    // її стрілками й здогадуватись, яке з пʼяти відповідає рядку.
    check("обидві сторони знають одну назву події",
        /ACTIVE_EVENT = "bb4u:framing-active"/.test(код)
        && /ACTIVE_EVENT = "bb4u:framing-active"/.test(preview));

    check("клац по рядку розсилає подію",
        /onMouseDown: function \(\) \{ announceActive\(self\.props\.src\); \}/.test(код));

    check("картка слухає й перегортається",
        /addEventListener\(ACTIVE_EVENT/.test(preview)
        && /setState\(\{ index: i \}\)/.test(preview));

    // Зворотний бік: перегорнули картку — підсвітився рядок.
    check("стрілки й мініатюри картки теж розсилають",
        /this\.announce\(next\)/.test(preview)
        && /self\.announce\(i\)/.test(preview));

    check("рядок підсвічується", /is-active/.test(код) && /\.framing-row\.is-active\{/.test(css));

    // Розсилати у відповідь на подію означало б ганяти її по колу між
    // двома компонентами.
    const слухач = preview.slice(preview.indexOf("this.onActive = function"),
        preview.indexOf("componentWillUnmount"));

    check("у відповідь на подію ніхто не відповідає", !/announce\(/.test(слухач));

    // Слухачі на window: без зняття кожне перевідкриття товару
    // додавало б ще один, і подія множилась би.
    check("слухачі знімаються при закритті",
        /removeEventListener\(ACTIVE_EVENT/.test(код)
        && /removeEventListener\(ACTIVE_EVENT/.test(preview));

    // У віджеті шлях із запису, у прев'ю той самий файл може приїхати
    // вже розвʼязаним через getAsset — тому порівнюємо за імʼям.
    check("порівнюємо за імʼям файлу, а не за повним шляхом",
        /function sameImage/.test(код) && /function sameImage/.test(preview));

    // Не на слово: витягуємо саме звіряння й ганяємо на тих формах
    // шляху, які реально трапляються з обох боків.
    const sameImage = new Function(
        extract("    function sameImage(a, b) {", "\n    }") + "; return sameImage;")();

    const шлях = "/assets/images/products/uploads/ca173_svvfq_a8.webp";

    check("повний шлях і саме імʼя — одне фото",
        sameImage(шлях, "ca173_svvfq_a8.webp"));

    check("версія в адресі не заважає",
        sameImage(шлях, шлях + "?v=1a2b3c4d"));

    check("різні фото не плутаються",
        !sameImage(шлях, "/assets/images/products/uploads/ca173_svvfq_a92.webp"));

    check("порожнє ні з чим не збігається",
        !sameImage("", "") && !sameImage(шлях, null));
}

console.log("\n[3d] Правка в адмінці взагалі доїжджає");
{
    // Останній крок збірки — apply-cache-version.js: він проставляє
    // ?v=<відбиток> кожному скрипту й стилю в розмітці. Поки він не
    // відпрацював, адреса файлу лишається старою, і браузер віддає з
    // кеша стару версію — хоч у гілці вже нова.
    //
    // А запускався він лише коли коміт чіпав data/**, assets/images/**,
    // site.config.json або scripts/**. Коміт, який торкався тільки
    // admin/**, збірку не запускав узагалі: файл новий, ?v= старий, в
    // адмінці працює попередня версія. Виглядає як «правка не поїхала»,
    // і зрозуміти чому майже неможливо.
    //
    // Дірку прикривало те, що більшість правок заодно чіпали data/**.
    const yaml = require("js-yaml");

    ["build-dev", "build-products"].forEach(name => {

        const cfg = yaml.load(fs.readFileSync(
            path.join(ROOT, ".github/workflows", name + ".yml"), "utf8"));

        // ключ "on" у YAML читається як булеве true — це відома
        // особливість YAML 1.1, а не помилка конфігу
        const on = cfg.on || cfg[true];
        const paths = (on && on.push && on.push.paths) || [];

        ["admin/**", "assets/**", "scripts/**", "data/**"].forEach(p => {
            check(`${name}: збірка реагує на ${p}`, paths.includes(p),
                JSON.stringify(paths));
        });

    });

    // Самі версії проставляються останнім кроком — якщо його
    // переставити вище, усе описане вище повернеться.
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const steps = pkg.scripts.build.split("&&").map(s => s.trim());

    check("apply-cache-version лишається останнім кроком збірки",
        /apply-cache-version/.test(steps[steps.length - 1]), steps[steps.length - 1]);
}

console.log("\n[4] Кадр і фон — різні рішення й не скасовують одне одного");
{
    const код = widget.replace(/\/\/[^\n]*/g, "");

    // Обрали «Зробити білим», поворухнули наближення — і вибір тихо
    // зникав. Помітили б це аж на сайті.
    const крок = код.slice(код.indexOf("step: function"), код.indexOf("autoFit: function"));

    check("наближення переносить вибір фону", /bg: this\.props\.frame\.bg \|\| null/.test(крок));

    const підгін = код.slice(код.indexOf("autoFit: function"), код.indexOf("contentBounds:"));

    check("«Підігнати» переносить вибір фону", /bg: self\.props\.frame\.bg \|\| null/.test(підгін));

    check("«Скинути кадр» лишає фон на місці",
        /className: "framing-reset"[\s\S]{0,400}zoom: 1, x: 50, y: 50, bg: frame\.bg \|\| null/.test(код));

    // Перевіряємо на самій бібліотеці: кадр «1× і центр», але з тлом,
    // мусить лишитись записом, інакше рішення нікуди не збережеться.
    check("рамка тільки з фоном не викидається",
        JSON.stringify(lib.normalizeFrame({ zoom: 1, x: 50, y: 50, bg: "white" }))
            === JSON.stringify({ zoom: 1, x: 50, y: 50, bg: "white" }),
        JSON.stringify(lib.normalizeFrame({ zoom: 1, x: 50, y: 50, bg: "white" })));

    check("а зовсім порожня — викидається",
        lib.normalizeFrame({ zoom: 1, x: 50, y: 50, bg: null }) === null);
}

console.log("\n[5] Рішення з адмінки доходить до збірки");
{
    const script = fs.readFileSync(path.join(ROOT, "scripts/whiten-backgrounds.js"), "utf8");
    const код = widget.replace(/\/\/[^\n]*/g, "");

    check("збірка читає bg саме з кадру фото",
        /framing\[name\] && framing\[name\]\.bg/.test(script));

    check("«Не чіпати» сильніше за автоматику",
        /decided === "keep"[\s\S]{0,80}return \{ skip/.test(script));

    // Заради цього кнопка «Зробити білим» і потрібна: тло 250
    // формально біле, а поруч із чисто білою карткою виглядає сірим.
    check("«Зробити білим» обходить перевірку «фон уже білий»",
        /allWhite && decided !== "white"/.test(script));

    check("неоднорідний фон не обходиться навіть примусово",
        script.indexOf("coverage < 0.9") < script.indexOf("allWhite && decided"));

    // Обидві сторони мусять читати фон однаково: інакше підпис в
    // адмінці й результат публікації розійдуться — рівно те, з чого
    // почалась ця правка.
    const модуль = fs.readFileSync(path.join(ROOT, "admin/white-preview.js"), "utf8");

    check("адмінка і збірка дивляться на весь периметр, а не на кути",
        /function borderColors/.test(модуль) && /function borderColors/.test(script));

    check("кути як єдине джерело правди більше не використовуються",
        !/at\(1, 1\), at\(w - 2, 1\)/.test(модуль)
        && !/at\(1, 1\), at\(w - 2, 1\)/.test(script));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
