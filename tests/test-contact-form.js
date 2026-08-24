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

console.log("\n[1b] Форму обробляє РІВНО одне місце");
{
    // Саме тут крився баг, який виглядав нез'ясовним.
    //
    // Крім інлайнового обробника на сторінці, такий самий жив у
    // common.js — колишній, який нічого не надсилав, а лише чистив
    // поля. Коли інлайновий полагодили, цей лишився й зламав уже
    // полагоджене: common.js підключається РАНІШЕ, тож спрацьовував
    // першим, чистив форму, а справжній обробник бачив уже порожні
    // поля й відповідав «Заповніть усі поля».
    //
    // Назовні: жодного запиту, порожня консоль, форма ніби порожня —
    // причину зі сторони не видно.
    check("у common.js обробника більше немає",
        !/contactForm\?\.addEventListener/.test(common));
    check("і самого посилання на форму теж",
        !/getElementById\("contactForm"\)/.test(common));

    // Один обробник на всю сторінку — рахуємо по всіх скриптах, які
    // вона підключає.
    const pageScripts = [...read("contacts.html")
        .matchAll(/<script src="(assets\/js\/[^"?]+)/g)]
        .map(m => read(m[1]));

    const handlers = [...pageScripts, code]
        .join("\n")
        .match(/contactForm[\s\S]{0,40}addEventListener\("submit"/g) || [];

    check("обробник submit рівно один", handlers.length === 1, handlers.length);

    // Українські підказки валідації лишаються — вони вішаються на всі
    // форми окремо й обробником не є.
    check("українські підказки на місці", /applyUkrainianValidation/.test(common));
}

// Далі — перевірки поведінки. Обидва блоки асинхронні, тож
// виконуються послідовно, а підсумок друкується в самому кінці.

function checkBehaviour() {

console.log("\n[2] Поведінка на живому DOM");

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

    const ok = run(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

    fill(ok);
    fire(ok);

    const bad = run(() => Promise.reject(new Error("offline")));

    fill(bad);
    fire(bad);

    // відповідь із помилкою HTTP — теж не успіх
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

        // кнопку треба розблокувати в будь-якому разі
        check("кнопка розблокована після збою",
            !bad.w.document.querySelector("button").disabled);
        check("кнопка розблокована після успіху",
            !ok.w.document.querySelector("button").disabled);

        resolve();

    }, 50));

}

function checkWholePage() {

console.log("\n[3] Наскрізно: сторінка цілком, як у браузері");

    // Перевірки вище дивляться на код. Ця — на поведінку СТОРІНКИ:
    // вантажимо common.js і інлайновий скрипт у тому ж порядку, що й
    // браузер. Саме порядок і був причиною бага, і жоден тест на
    // окремий файл його б не побачив.
    const dom = new JSDOM(read("contacts.html"), {
        runScripts: "outside-only",
        pretendToBeVisual: true,
        url: "https://bestbrnd4u.com/contacts"
    });

    const w = dom.window;
    const toasts = [];

    let requests = 0;

    w.fetch = () => {
        requests++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    };

    w.showToast = t => toasts.push(t);

    // common.js спершу — як у розмітці
    try { w.eval(common); } catch (error) { /* частина потребує інших сторінок */ }

    w.showToast = t => toasts.push(t);
    w.eval(code);

    const form = w.document.getElementById("contactForm");

    form.querySelector("[name=name]").value = "Ілля";
    form.querySelector("[name=contact]").value = "test@example.com";
    form.querySelector("[name=message]").value = "Питання про товар";

    form.dispatchEvent(new w.Event("submit", { cancelable: true }));

    return new Promise(resolve => setTimeout(() => {

        // Головне: заповнена форма МУСИТЬ відправитись.
        check("запит на надсилання пішов", requests === 1, requests);

        check("тост рівно один", toasts.length === 1, toasts.join(" | "));
        check("і він про успіх", /надіслано/i.test(toasts[0] || ""), toasts[0]);

        // Саме цей тост бачив користувач замість листа
        check("не просить заповнити заповнене",
            !toasts.some(t => /Заповніть усі поля/.test(t)), toasts.join(" | "));

        // Чистити форму можна лише ПІСЛЯ успіху
        check("форму очищено після відправки",
            form.querySelector("[name=name]").value === "");

        resolve();

    }, 60));

}

checkBehaviour()
    .then(checkWholePage)
    .then(() => {

        console.log(failures === 0
            ? "\n✅ Усі перевірки пройдено"
            : `\n❌ Провалено: ${failures}`);

        process.exit(failures === 0 ? 0 : 1);

    });
