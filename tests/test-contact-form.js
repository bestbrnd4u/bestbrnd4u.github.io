// Форма «Написати нам» на сторінці контактів.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Обробник робив рівно три речі: скасовував відправку, показував
// «Повідомлення надіслано!» і чистив поля. Листа не існувало взагалі.
// Людина бачила підтвердження і йшла чекати відповіді, якої не буде.
//
// Це гірше за неробочу кнопку: неробочу видно одразу, а тут збій
// непомітний з обох боків — покупець вважає, що написав, магазин не
// знає, що його питали.
//
// Головне, що стережуть ці перевірки: сайт не має казати «надіслано»,
// поки лист справді не пішов.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const contacts = read("contacts.html");
const common = read("assets/js/common.js");

// останній інлайновий скрипт сторінки — обробник форми
const code = [...contacts.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).pop();

console.log("\n[1] Форма справді надсилає");
{
    check("є виклик відправки", /sendViaFormSubmit\(/.test(code));
    check("порожнього обробника більше немає",
        !/showToast\("Повідомлення надіслано[\s\S]{0,60}this\.reset\(\);\s*\n\s*\}\);/.test(code));

    // Адреса одна на дві форми: оформлення замовлення й контакти.
    // Дві копії рано чи пізно розійшлися б, і одна форма почала б
    // слати листи в нікуди.
    check("адреса призначення спільна", /const FORMSUBMIT_TARGET/.test(common));
    check("оформлення замовлення бере ту саму",
        /FORM_TARGET_EMAIL = FORMSUBMIT_TARGET/.test(read("assets/js/checkout.js")));

    // Токен, а не адреса: відкритий bestbrnd4u@proton.me у коді зібрали б
    // спамери.
    check("у коді немає відкритої адреси призначення",
        !/formsubmit\.co\/ajax\/[a-z0-9._%-]+@/i.test(common));
}

console.log("\n[2] Поведінка на живому DOM");
{
    const run = fetchImpl => {

        const dom = new JSDOM(
            `<form id="contactForm">
                <input name="name"><input name="contact">
                <textarea name="message"></textarea>
                <button type="submit">Надіслати</button>
             </form>`,
            { runScripts: "outside-only", pretendToBeVisual: true });

        const w = dom.window;
        const toasts = [];
        const box = { sent: null };

        w.showToast = t => toasts.push(t);
        w.sendViaFormSubmit = payload => { box.sent = payload; return fetchImpl(); };
        w.console.error = () => {};

        w.eval(code);

        return { w, toasts, box };

    };

    const fire = t => t.w.document.getElementById("contactForm")
        .dispatchEvent(new t.w.Event("submit"));

    const fill = t => {
        t.w.document.querySelector("[name=name]").value = "Ілля";
        t.w.document.querySelector("[name=contact]").value = "a@b.com";
        t.w.document.querySelector("[name=message]").value = "Питання";
    };

    // 1. порожня форма — не надсилаємо: відповісти на такий лист усе
    //    одно нема куди
    const empty = run(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

    fire(empty);

    check("порожня форма не надсилається", empty.box.sent === null);
    check("і про це сказано", /Заповніть усі поля/.test(empty.toasts[0] || ""), empty.toasts[0]);

    // 2. успіх
    const ok = run(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

    fill(ok);
    fire(ok);

    // 3. збій мережі
    const bad = run(() => Promise.reject(new Error("offline")));

    fill(bad);
    fire(bad);

    // 4. відповідь із помилкою HTTP — теж не успіх
    const http = run(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));

    fill(http);
    fire(http);

    return new Promise(resolve => setTimeout(() => {

        check("лист сформовано", !!ok.box.sent);
        check("у листі всі три поля",
            ["Ім'я", "Звʼязок", "Повідомлення"].every(k => k in (ok.box.sent || {})),
            Object.keys(ok.box.sent || {}).join(", "));
        check("тема листа зрозуміла", /Запитання з сайту/.test((ok.box.sent || {})._subject || ""));
        check("після успіху сказано «надіслано»",
            /надіслано/i.test(ok.toasts[0] || ""), ok.toasts[0]);

        // ГОЛОВНЕ: не брехати про результат
        check("при збої мережі НЕ кажемо «надіслано»",
            !bad.toasts.some(t => /надіслано!/i.test(t)), bad.toasts.join(" | "));
        check("при помилці сервера теж НЕ кажемо «надіслано»",
            !http.toasts.some(t => /надіслано!/i.test(t)), http.toasts.join(" | "));

        // і одразу даємо запасний шлях, щоб людина не лишилась ні з чим
        check("при збої підказано, куди писати",
            /proton\.me/.test(bad.toasts.join(" ")) && /Telegram/.test(bad.toasts.join(" ")));

        // кнопку треба розблокувати в будь-якому разі, інакше після
        // збою повторити спробу вже не вийде
        check("кнопка розблокована після збою",
            !bad.w.document.querySelector("button").disabled);
        check("кнопка розблокована після успіху",
            !ok.w.document.querySelector("button").disabled);

        console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
        process.exit(failures === 0 ? 0 : 1);

    }, 50));
}
