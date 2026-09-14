// Власний випадний список замість системного.
//
// НАВІЩО ЦЕ ВЗАГАЛІ З'ЯВИЛОСЬ
// ----------------------------
// Закритий <select> на сайті оформлений: своя рамка, свій шеврон,
// свій фокус. Розкритий — ні, і оформити його неможливо: список
// малює операційна система. Виходило так, що поки на поле не
// натиснули, воно частина сайту; щойно натиснули — сірий системний
// прямокутник іншим шрифтом, рівно в той момент, коли на нього
// дивляться найуважніше. Власник показав це скріншотом.
//
// ЧОМУ ЦЕ ПЕРЕВІРЯЄТЬСЯ В СПРАВЖНЬОМУ DOM, А НЕ РЕГУЛЯРКАМИ
// ----------------------------------------------------------
// Заміна системного елемента своїм — це не оформлення, а поведінка:
// значення, події, клавіатура, скидання форми. Кожен із цих
// пунктів ламається мовчки й помітний лише тому, хто натисне. Тому
// тут jsdom: список відкривається, по ньому ходять стрілками,
// форму скидають — і перевіряється результат, а не наявність рядків
// у коді.
//
// ГОЛОВНЕ, ЩО ТУТ ЗАКРІПЛЕНО
// ---------------------------
// <select> лишається джерелом істини. Усе, що читає element.value,
// слухає change або викликає form.reset(), мусить працювати так
// само, як із системним списком, — інакше це не заміна, а друга
// реальність поруч із формою.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const source = fs.readFileSync(path.join(ROOT, "assets/js/select-menu.js"), "utf8");

// Сторінка-макет: форма з одним списком, як у вікні «Нова адреса».
function build() {

    const dom = new JSDOM(`
        <form id="f">
            <label>
                Спосіб отримання
                <select id="method" data-menu>
                    <option value="a">Перший</option>
                    <option value="b">Другий</option>
                    <option value="c">Третій</option>
                </select>
            </label>
        </form>
    `, { runScripts: "outside-only" });

    dom.window.eval(source);

    // jsdom лишає document.readyState === "loading" назавжди: подія
    // DOMContentLoaded у ньому не настає сама. Тому запускаємо
    // розмітку списків руками — на справжній сторінці це робить сам
    // файл, і що він це робить, перевіряє розділ [6].
    dom.window.SelectMenu.init();

    const doc = dom.window.document;

    return {
        win: dom.window,
        doc,
        select: doc.getElementById("method"),
        form: doc.getElementById("f"),
        button: doc.querySelector(".select-menu-button"),
        list: doc.querySelector(".select-menu-list"),
        value: () => doc.querySelector(".select-menu-value").textContent,
        items: () => Array.from(doc.querySelectorAll(".select-menu-item")),
        key(name) {
            doc.querySelector(".select-menu-button").dispatchEvent(
                new dom.window.KeyboardEvent("keydown", {
                    key: name, bubbles: true, cancelable: true
                })
            );
        }
    };

}

console.log("\n[1] Заміна будується поруч, а не замість");
{
    const t = build();

    check("кнопка з'явилась", Boolean(t.button));

    check("список повторює всі варіанти", t.items().length === 3,
        t.items().length);

    check("написи взяті з <option>",
        t.items().map(n => n.textContent).join("|") === "Перший|Другий|Третій");

    // САМ <select> ЛИШАЄТЬСЯ. Він у формі, у ньому значення, на
    // ньому валідація — прибрати його означало б переписати все, що
    // з ним працює.
    check("сам <select> лишився в DOM", Boolean(t.select) && Boolean(t.select.parentNode));

    // НЕ display:none і не hidden: прихований select не отримує
    // фокус, і браузер не може показати на ньому підказку
    // «заповніть це поле» — форма мовчки не відправляється, і
    // причини не видно.
    check("сховано, але не вирвано з потоку",
        t.select.classList.contains("select-menu-native")
        && !t.select.hidden,
        t.select.className);

    const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");

    check("і саме опасністю, а не display:none",
        /\.select-menu-native\{[^}]*opacity:0/.test(css)
        && !/\.select-menu-native\{[^}]*display:none/.test(css));

    // Кнопка стоїть усередині <form>. Кнопка без типу — це кнопка
    // відправки, тобто відкриття списку відправляло б форму.
    check("кнопки не відправляють форму",
        t.button.type === "button"
        && t.items().every(node => node.type === "button"));
}

console.log("\n[2] Вибір міняє справжнє значення");
{
    const t = build();

    let changes = 0;

    t.select.addEventListener("change", () => { changes += 1; });

    t.button.click();

    check("клік відкриває список", t.list.hidden === false);

    t.items()[2].dispatchEvent(new t.win.MouseEvent("mousedown", { bubbles: true }));

    check("значення <select> змінилось", t.select.value === "c", t.select.value);

    check("напис на кнопці теж", t.value() === "Третій", t.value());

    check("список закрився", t.list.hidden === true);

    // Подія, а не прямий виклик: на change уже підписані обробники
    // сторінки, і вони не мусять знати, що список намальований
    // своїми руками. У кабінеті на ній тримається показ поля
    // «Номер відділення» / «Номер поштомату».
    check("сторінка дізналась про зміну подією change", changes === 1, changes);

    // Повторний вибір того самого — не зміна.
    t.button.click();
    t.items()[2].dispatchEvent(new t.win.MouseEvent("mousedown", { bubbles: true }));

    check("вибір того самого пункту події не шле", changes === 1, changes);
}

console.log("\n[3] Клавіатура робить те саме, що й миша");
{
    const t = build();

    t.key("ArrowDown");

    check("стрілка відкриває список", t.list.hidden === false);

    t.key("ArrowDown");

    // Підсвічене — те, по чому ходять; обране — те, що вибрали.
    // Це різні речі: стрілкою вниз ходять, не змінюючи вибору.
    check("ходіння не міняє вибору", t.select.value === "a", t.select.value);

    check("але видно, де ти зараз",
        t.doc.querySelector(".select-menu-item.active")?.textContent === "Другий");

    t.key("Enter");

    check("Enter вибирає підсвічене", t.select.value === "b", t.select.value);

    check("і закриває список", t.list.hidden === true);

    t.key("ArrowDown");
    t.key("End");

    check("End веде в кінець",
        t.doc.querySelector(".select-menu-item.active")?.textContent === "Третій");

    t.key("Home");

    check("Home — на початок",
        t.doc.querySelector(".select-menu-item.active")?.textContent === "Перший");

    t.key("Escape");

    check("Escape закриває, нічого не змінивши",
        t.list.hidden === true && t.select.value === "b", t.select.value);
}

// Скидання форми перемальовує кнопку НАСТУПНИМ тактом: у момент
// події reset значення ще старі, браузер скидає їх одразу після неї.
// Тому решта перевірок — асинхронна.
(async function tail() {

    console.log("\n[4] Форму скидають — напис не бреше");
    {
        const t = build();

        t.button.click();
        t.items()[2].dispatchEvent(new t.win.MouseEvent("mousedown", { bubbles: true }));

        check("перед скиданням обрано третій", t.value() === "Третій");

        t.form.reset();

        // form.reset() ПОДІЇ change НЕ НАДСИЛАЄ — і саме на цьому
        // ламалось: вікно адреси відкривається через reset(), тож
        // кнопка показувала спосіб доставки з ПОПЕРЕДНЬОЇ адреси,
        // тоді як у формі вже стояв інший. Людина бачила одне,
        // зберігала інше.
        await new Promise(resolve => setTimeout(resolve, 20));

        check("значення скинулось", t.select.value === "a", t.select.value);

        check("і напис на кнопці разом із ним", t.value() === "Перший", t.value());
    }

    console.log("\n[5] Програмна зміна теж доходить до кнопки");
    {
        // Кабінет робить саме так: відкриваючи вікно адреси, він
        // виставляє value збереженого способу доставки. Присвоєння
        // події не шле — її шле лише людина, — тож сторінка мусить
        // сказати про зміну сама.
        const t = build();

        t.select.value = "b";
        t.select.dispatchEvent(new t.win.Event("change", { bubbles: true }));

        check("кнопка показує нове значення", t.value() === "Другий", t.value());

        const accountJs = fs.readFileSync(path.join(ROOT, "assets/js/account.js"), "utf8");

        check("вікно адреси про зміну повідомляє",
            /addressMethodSelect\.value = address\?\.delivery_method[\s\S]{0,700}?addressMethodSelect\.dispatchEvent\(new Event\("change"/
                .test(accountJs));
    }

    console.log("\n[6] Сам файл підключено там, де є такий список");
    {
        const accountHtml = fs.readFileSync(path.join(ROOT, "account.html"), "utf8");

        check("розмітка позначає список", /<select id="addressMethod" data-menu/.test(accountHtml));

        check("і скрипт підключено",
            /<script src="assets\/js\/select-menu\.js/.test(accountHtml));

        // Без JS системний список мусить лишитись робочим: інакше
        // збій одного файлу залишає форму без способу обрати
        // доставку взагалі.
        check("ховаємо лише після того, як заміна побудована",
            source.indexOf("insertBefore") < source.indexOf("select-menu-native"));
    }

    console.log(failures === 0
        ? "\n✅ Власний список: значення, події й клавіатура — як у системного\n"
        : `\n❌ Проблем: ${failures}\n`);

    process.exit(failures === 0 ? 0 : 1);

}());

