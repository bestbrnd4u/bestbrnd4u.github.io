// Згода на дані: банер, блокування вбудованого відео, чесність тексту.
//
// ГОЛОВНА ВИМОГА
// ---------------
// Банер має відповідати тому, що сайт РОБИТЬ НАСПРАВДІ. Чотири галочки
// «аналітика / реклама / персоналізація», яких на сайті немає, гірші
// за відсутність банера: вони обіцяють контроль над неіснуючим і при
// цьому мовчать про справжнє.
//
// Перевірки нижче стережуть дві речі: що згода не декоративна (відео
// справді не вантажиться до неї) і що текст не розходиться з кодом.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const strip = t => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const consent = read("assets/js/consent.js");
const consentCode = strip(consent);
const product = strip(read("assets/js/product.js"));
const policy = read("privacy-policy.html");
const checkout = read("checkout.html");
const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[1] Згода — дія, а не бездіяльність");
{
    check("без відповіді згоди немає",
        /return !!\(saved && saved\[category\]\)/.test(consentCode));

    // Обов'язкове (кошик, обране, вхід) згоди не потребує: це пам'ять
    // самої сторінки, а не стеження.
    check("необхідне не питається", /OPTIONAL\.indexOf\(category\) === -1/.test(consentCode));

    // Додасться категорія — банер спитає знову, а не застосує старий
    // вибір до того, чого людина не бачила.
    check("версія згоди враховується", /saved\.version !== VERSION/.test(consentCode));

    check("банер показується лише раз", /if \(!answered\(\)\) render\(\)/.test(consentCode));

    // Згоду треба вміти відкликати так само легко, як дати.
    check("є спосіб змінити рішення", /reopen: function/.test(consentCode));
    check("посилання є в підвалі", /data-consent-reopen/.test(read("index.html")));

    // Приватний режим: чесніше питати щоразу, ніж мовчки вважати
    // згоду отриманою.
    check("збій сховища не дає мовчазної згоди",
        /catch \(error\) \{[\s\S]{0,200}\n\s*\}/.test(consentCode));
}

console.log("\n[2] Згода не декоративна: відео справді чекає");
{
    // Якби iframe вставлявся одразу, YouTube дізнавався б IP ще до
    // того, як людина щось натиснула, — і питання втрачало б сенс.
    check("iframe вставляється лише після згоди",
        /const allowed = !window\.Consent \|\| window\.Consent\.has\("embeds"\)/.test(product));
    check("до згоди — заглушка", /video-consent/.test(product));

    check("у заглушці сказано, що станеться",
        /Сервіс отримає вашу IP-адресу/.test(product));
    check("названо конкретний сервіс", /Vimeo" : "YouTube"/.test(product));

    // Клац по заглушці вмикає ЦЕ відео, а не змінює загальну згоду:
    // людина погодилась подивитись ролик, а не дозволити все назавжди.
    check("клац по заглушці не змінює загальну згоду",
        /video-consent-btn/.test(product) && !/Consent\.reopen|localStorage\.setItem/.test(product));

    check("після згоди заглушки самі стають плеєрами",
        /consent:change/.test(product) && /consent:change/.test(consentCode));

    check("є стилі заглушки", /\.video-consent\{/.test(css));
}

console.log("\n[3] Текст банера відповідає дійсності");
{
    // На сайті немає аналітики й реклами — тож і галочок про них
    // бути не повинно.
    check("немає вигаданої категорії «аналітика»",
        !/analytics|аналітик[аи]:/i.test(consentCode));
    check("категорій рівно одна необов'язкова",
        /var OPTIONAL = \["embeds"\]/.test(consentCode));

    check("сказано, що стеження немає", /не використовуємо аналітику/.test(consent));
    check("є посилання на політику", /href="privacy-policy"/.test(consent));

    // Кнопка «лише необхідне» мусить бути так само доступною, як
    // «дозволити»: інакше вибір формальний.
    check("відмова так само доступна, як згода",
        /data-consent="necessary"/.test(consentCode) && /data-consent="all"/.test(consentCode));
}

console.log("\n[4] Політика описує те, що є в коді");
{
    // Перелік у політиці має збігатися з тим, що код справді пише
    // у сховище. Розходження тут — не дрібниця: це заява, яка не
    // відповідає дійсності.
    // Скануємо ВСІ скрипти сайту: ключі розкидані по файлах
    // (bestbrnd4uLastOrder, наприклад, живе в checkout.js), і вузький
    // список давав хибне «немає в коді».
    const allScripts = fs.readdirSync(path.join(ROOT, "assets/js"))
        .filter(f => f.endsWith(".js"))
        .map(f => read(`assets/js/${f}`))
        .join("\n");

    ["cart", "favorites", "catalogView", "bestbrnd4uLastOrder", "consent", "catalogReturnTo"]
        .forEach(key => {

            const inCode = new RegExp(`["']${key}["']`).test(allScripts);

            check(`${key}: є в коді і названий у політиці`,
                inCode && policy.includes(key), inCode ? "немає в політиці" : "немає в коді");

        });

    // Сервіси, які бачать IP відвідувача, мають бути названі.
    ["Google Fonts", "EmailJS", "MailerLite", "YouTube", "Vimeo", "Supabase"]
        .forEach(name => check(`${name} названий у політиці`, policy.includes(name)));

    check("сказано, що аналітики й реклами немає",
        /немає Google Analytics/.test(policy) && /рекламних мереж/.test(policy));
}

console.log("\n[5] На сторінці оформлення сказано, які дані збираємо");
{
    // Питання «які дані ви збираєте» виникає саме тоді, коли людина
    // вже ввела телефон і адресу. Посилання на окрему сторінку тут не
    // відповідь: щоб прочитати, треба піти зі сторінки оформлення.
    check("пояснення є прямо в оформленні", /class="order-data-note"/.test(checkout));

    ["Що саме", "Навіщо", "Кому передаються"].forEach(part =>
        check(`названо «${part}»`, checkout.includes(part)));

    check("сказано, що дані картки не збираються",
        /дані картки нам\s*\n?\s*не потрапляють/.test(checkout));
    check("сказано, куди звертатись по видалення", /видалити свої дані/.test(checkout));

    // Згорнуте за замовчуванням: хто не питає — не бачить стіни тексту.
    check("блок згорнутий за замовчуванням",
        /<details class="order-data-note">/.test(checkout) && !/<details open/.test(checkout));

    check("перелічені поля збігаються з формою",
        ["Ім'я", "телефон", "email"].every(f => new RegExp(f, "i").test(checkout)));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
