// ПІСЛЯ УСПІШНОЇ ВІДПРАВКИ ФОРМИ БІЛЬШЕ НЕМАЄ
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Замовив зворотний дзвінок — поле й кнопка «Передзвоніть мені»
// лишились на місці, а про успіх сказав лише зелений рядок під ними.
// Те саме з підпискою.
//
// Поки на екрані стоїть кнопка, яку щойно натиснули, людина не певна,
// чи спрацювало. Природна реакція — натиснути ще раз. Для власника це
// другий дзвінок у Telegram на той самий номер; для людини —
// відчуття, що сайт її не почув.
//
// У формі відгуку це було зроблено ПРАВИЛЬНО з самого початку:
// formBox.hidden = true, doneEl.hidden = false. Тобто правило в
// проєкті існувало — просто застосоване в одному місці з трьох.
//
// ЧОМУ ПЕРЕВІРКА САМЕ ТАКА
// -------------------------
// Не «чи є слово Готово» — текст перепишуть завтра. Питаємо ЗВ'ЯЗОК:
// у кожної форми, що щось надсилає на сервер, має бути стан «готово»,
// і на успіху форма мусить ховатись, а він — показуватись.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const CSS = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, " ");

// Форми, які НАДСИЛАЮТЬ щось людині назовні й де «чи дійшло?» —
// справжнє питання. Форми входу, фільтрів і пошуку сюди не належать:
// там результат видно одразу й без підтверджень.
const ФОРМИ = [
    {
        назва: "зворотний дзвінок",
        файл: "assets/js/contact-buttons.js",
        форма: "форма",
        готово: "готово",
        клас: "dock-done"
    },
    {
        назва: "підписка на листи",
        файл: "assets/js/subscribe.js",
        форма: "form",
        готово: "doneEl",
        клас: "subscribe-done"
    },
    {
        назва: "відгук про товар",
        файл: "assets/js/reviews.js",
        форма: "formBox",
        готово: "doneEl",
        клас: "review-done"
    }
];


console.log("\n[1] У кожної форми є стан «готово», і він ховає форму");
{
    ФОРМИ.forEach(ф => {

        const код = read(ф.файл);

        // Ховаємо форму.
        const ховаємо = new RegExp(`${ф.форма}\\.hidden\\s*=\\s*true`);

        // Показуємо підтвердження.
        const показуємо = new RegExp(`${ф.готово}\\.hidden\\s*=\\s*false`);

        check(`${ф.назва}: форма ховається`, ховаємо.test(код), ф.файл);

        check(`${ф.назва}: підтвердження показується`, показуємо.test(код), ф.файл);

        // ОБИДВА РЯДКИ В ОДНОМУ МІСЦІ. Інакше легко лишити стан, у
        // якому на екрані немає ні форми, ні підтвердження.
        const поруч = new RegExp(
            `${ф.форма}\\.hidden\\s*=\\s*true;?\\s*\\n?\\s*${ф.готово}\\.hidden\\s*=\\s*false`);

        check(`${ф.назва}: ховаємо й показуємо разом`, поруч.test(код), ф.файл);

    });
}


console.log("\n[2] Сховане справді ховається");
{
    // У кожного з цих блоків є власний display, тож атрибут hidden
    // без явного правила програє йому — те саме вже ловили на .loader,
    // де спінер крутився вічно.
    const потребуютьПравила = [
        ".dock-done", ".dock-form", ".subscribe-done", ".subscribe",
        // Чат теж міняє форму на підсумок — коли власник завершив
        // розмову командою /chatdone.
        ".chat-form", ".chat-again"
    ];

    потребуютьПравила.forEach(клас => {

        const правило = new RegExp(
            `\\${клас}\\[hidden\\]\\{[^}]*display\\s*:\\s*none`);

        check(`${клас}[hidden] → display:none`, правило.test(CSS));

    });
}


console.log("\n[2a] Дві змінні з одним іменем в одній функції");
{
    // ЩО ЦЕ ЛОВИТЬ. Модуль contact-buttons.js — одна велика функція.
    // Коли в неї дописали розділ чату, там зʼявилось друге
    // `var поле` — і оскільки var не створює нового звʼязку, воно
    // ПЕРЕЗАПИСАЛО поле форми зворотного дзвінка.
    //
    // Форма дзвінка після цього читала значення з текстового поля
    // чату, тобто завжди порожнє, і на будь-який номер відповідала
    // «Введіть номер у форматі…». Кнопка виглядала цілою.
    //
    // Жодна перевірка цього не бачила: нормалізатор номера
    // перевірявся ОКРЕМО від модуля й працював бездоганно.
    //
    // Шукаємо лише верхній рівень IIFE (рівно чотири пробіли
    // відступу): глибше var в різних функціях — це різні змінні, і
    // однакові імена там нормальні.
    ["assets/js/contact-buttons.js", "assets/js/subscribe.js"].forEach(файл => {

        const оголошення = new Map();

        read(файл).split("\n").forEach((рядок, i) => {

            const m = рядок.match(/^    var\s+([\p{L}_][\p{L}\p{N}_]*)/u);

            if (!m) return;

            if (!оголошення.has(m[1])) оголошення.set(m[1], []);

            оголошення.get(m[1]).push(i + 1);

        });

        const повтори = [...оголошення].filter(([, рядки]) => рядки.length > 1);

        check(`${файл}: кожне імʼя оголошене один раз`,
            повтори.length === 0,
            повтори.map(([имʼя, рядки]) => `${имʼя} → рядки ${рядки.join(", ")}`).join("; "));

    });
}


console.log("\n[3] Зворотний дзвінок: справжній DOM");
{
    const МОДУЛЬ = read("assets/js/contact-buttons.js");

    const dom = new JSDOM("<!doctype html><body></body>", {
        runScripts: "outside-only",
        url: "https://bestbrnd4u.com/catalog"
    });

    const { window } = dom;

    if (!window.requestAnimationFrame) window.requestAnimationFrame = cb => window.setTimeout(cb, 0);
    if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });

    window.eval('var SUPABASE_URL = "https://example.test"; var SUPABASE_PUBLISHABLE_KEY = "test";');

    let надіслано = null;

    window.fetch = function (url, opt) {
        надіслано = JSON.parse((opt && opt.body) || "{}");
        return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) });
    };

    window.eval(МОДУЛЬ);

    const d = window.document;

    d.getElementById("dockCall").dispatchEvent(new window.Event("click", { bubbles: true }));

    const форма = d.getElementById("dockCallForm");
    const готово = d.getElementById("dockCallDone");

    check("спочатку видно форму, не підтвердження",
        форма.hidden === false && готово.hidden === true);

    const поле = d.getElementById("dockPhone");

    поле.value = "073 728 82 91";

    форма.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

    return new Promise(done => window.setTimeout(done, 80)).then(() => {

        check("номер пішов на сервер", надіслано && надіслано.phone === "+380737288291",
            надіслано && надіслано.phone);

        check("форми більше немає", форма.hidden === true);
        check("на її місці підтвердження", готово.hidden === false);

        // Номер у підтвердженні — щоб людина одразу побачила, якщо
        // помилилась цифрою.
        check("у підтвердженні видно номер",
            /\+380737288291/.test(готово.textContent), готово.textContent.replace(/\s+/g, " "));

        // Фокус на елементі, якого вже не видно, — це фокус у
        // нікуди: наступний Tab почне з початку сторінки.
        check("фокус не лишився на схованій кнопці",
            d.activeElement !== d.querySelector(".dock-submit"),
            d.activeElement ? (d.activeElement.className || d.activeElement.tagName) : "нічого");

        check("фокус на «замовити ще один»",
            d.activeElement === готово.querySelector(".dock-done-again"),
            d.activeElement ? (d.activeElement.className || d.activeElement.tagName) : "нічого");

        // Повернення до форми — для того, хто помилився цифрою.
        готово.querySelector(".dock-done-again")
            .dispatchEvent(new window.Event("click", { bubbles: true }));

        check("можна повернутись до форми",
            форма.hidden === false && готово.hidden === true);

        check("поле очищено", поле.value === "");

        check("фокус повернувся в поле", d.activeElement === поле,
            d.activeElement ? (d.activeElement.id || d.activeElement.tagName) : "нічого");

        // І ще раз відкрити панель після успіху: фокус не має їхати
        // на сховане поле.
        поле.value = "073 728 82 91";
        форма.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));

        return new Promise(r => window.setTimeout(r, 80)).then(() => {

            const кнопка = d.getElementById("dockCall");

            кнопка.dispatchEvent(new window.Event("click", { bubbles: true }));  // закрили
            кнопка.dispatchEvent(new window.Event("click", { bubbles: true }));  // відкрили

            check("після повторного відкриття підтвердження на місці",
                готово.hidden === false && форма.hidden === true);

            check("фокус не поїхав на сховане поле", d.activeElement !== поле,
                d.activeElement ? (d.activeElement.id || d.activeElement.className) : "нічого");

            console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
            process.exit(failures === 0 ? 0 : 1);

        });

    });
}
