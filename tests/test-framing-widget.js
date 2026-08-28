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

console.log("\n[3] Тло: блок узагалі має зʼявлятись");
{
    const код = widget.replace(/\/\/[^\n]*/g, "");

    check("розбір тла хтось викликає",
        /componentDidMount: function \(\) \{\s*this\.detectBackground\(\);/.test(код));

    // Адреса фото приходить не одразу — getAsset розвʼязує файл
    // асинхронно. Без повторної спроби щойно додане фото лишалось би
    // без блоку про тло до перезавантаження сторінки.
    check("і повторює спробу, коли адреса зʼявилась",
        /componentDidUpdate: function \(\) \{\s*this\.detectBackground\(\);/.test(код));

    // Прапорець-булеан лишав би на підміненому фото чужий результат
    // розбору: кружечок показував би колір попереднього знімка.
    check("памʼятаємо саме адресу, а не «вже перевіряли»",
        /this\.state\.bgChecked === url/.test(код)
        && /setState\(\{ bgChecked: url \}\)/.test(код));

    check("невдале завантаження не мовчить", /img\.onerror[\s\S]{0,200}console\.warn/.test(код));

    // Три кнопки й підписи — те, заради чого все це.
    ["Зробити білим", "Не чіпати", "Автоматично",
        "Тло вже біле", "Тло сіре або бежеве", "Тло неоднорідне"].forEach(text => {
        check(`у розмітці є «${text}»`, widget.includes(text));
    });

    // Неоднорідне тло — фото на моделі чи в інтерʼєрі: заливка зʼїла б
    //半 кадру. Цей запобіжник не обходиться навіть примусово.
    check("для неоднорідного тла кнопок немає",
        /this\.state\.bgUniform\s*\?\s*h\("div", \{ className: "framing-bg-actions" \}/.test(код));

    check("передперегляд показує саме майбутній результат",
        /frame\.bg === "white" && this\.whitenedPreview\(\)/.test(код));
}

console.log("\n[4] Кадр і тло — різні рішення й не скасовують одне одного");
{
    const код = widget.replace(/\/\/[^\n]*/g, "");

    // Обрали «Зробити білим», поворухнули наближення — і вибір тихо
    // зникав. Помітили б це аж на сайті.
    const крок = код.slice(код.indexOf("step: function"), код.indexOf("autoFit: function"));

    check("наближення переносить вибір тла", /bg: this\.props\.frame\.bg \|\| null/.test(крок));

    const підгін = код.slice(код.indexOf("autoFit: function"), код.indexOf("contentBounds:"));

    check("«Підігнати» переносить вибір тла", /bg: self\.props\.frame\.bg \|\| null/.test(підгін));

    check("«Скинути кадр» лишає тло на місці",
        /className: "framing-reset"[\s\S]{0,400}zoom: 1, x: 50, y: 50, bg: frame\.bg \|\| null/.test(код));

    // Перевіряємо на самій бібліотеці: кадр «1× і центр», але з тлом,
    // мусить лишитись записом, інакше рішення нікуди не збережеться.
    check("рамка тільки з тлом не викидається",
        JSON.stringify(lib.normalizeFrame({ zoom: 1, x: 50, y: 50, bg: "white" }))
            === JSON.stringify({ zoom: 1, x: 50, y: 50, bg: "white" }),
        JSON.stringify(lib.normalizeFrame({ zoom: 1, x: 50, y: 50, bg: "white" })));

    check("а зовсім порожня — викидається",
        lib.normalizeFrame({ zoom: 1, x: 50, y: 50, bg: null }) === null);
}

console.log("\n[5] Рішення з адмінки доходить до збірки");
{
    const script = fs.readFileSync(path.join(ROOT, "scripts/whiten-backgrounds.js"), "utf8");

    check("збірка читає bg саме з кадру фото",
        /framing\[name\] && framing\[name\]\.bg/.test(script));

    check("«Не чіпати» сильніше за автоматику",
        /decided === "keep"[\s\S]{0,80}return \{ skip/.test(script));

    // Заради цього кнопка «Зробити білим» і потрібна: тло 250
    // формально біле, а поруч із чисто білою карткою виглядає сірим.
    check("«Зробити білим» обходить перевірку «тло вже біле»",
        />= ALREADY_WHITE && decided !== "white"/.test(script));

    check("неоднорідне тло не обходиться навіть примусово",
        script.indexOf("spread > MAX_SPREAD") < script.indexOf("ALREADY_WHITE && decided"));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
