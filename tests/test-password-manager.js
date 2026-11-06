// Менеджер паролів знає, чий це пароль.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. У КОЖНІЙ ФОРМІ З ПАРОЛЕМ Є ПОЛЕ ІМЕНІ. Заміряно 04.11.2026: Chrome
//    писав у консоль кабінету «Password forms should have (optionally
//    hidden) username fields». Дві форми мали лише поля пароля:
//      resetPasswordForm — новий пароль після листа;
//      passwordForm      — зміна пароля в профілі.
//    Без поля імені менеджер паролів (вбудований у браузер, Keychain на
//    iPhone) не знає, до якого облікового запису прив'язати новий
//    пароль — зберігає окремий запис без імені або не пропонує оновити
//    старий. Наступного входу підставляє СТАРИЙ — і людина не входить.
//
// 2. ПОЛЕ ІМЕНІ ЗАПОВНЮЄТЬСЯ ЛИШЕ СПРАВЖНЬОЮ ПОШТОЮ. У тих, хто ввійшов
//    через Telegram, у user.email лежить службовий рядок, скриньки за
//    яким немає. Підстав його — і пароль збережеться під вигаданою
//    адресою.
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


console.log("\n[1] У кожній формі з паролем є поле імені");
{
    // Ті самі теки, що обходять кроки збірки: admin — Decap зі своєю
    // розміткою, supabase — шаблони листів.
    const ПРОПУСК = ["node_modules", ".git", ".claude", "archive", "admin",
        ".playwright-mcp", "supabase", "_site", "p", "brands", "categories"];

    const сторінки = [];
    (function обхід(d) {
        fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
            if (ПРОПУСК.includes(e.name)) return;
            const f = path.join(d, e.name);
            if (e.isDirectory()) обхід(f);
            else if (e.name.endsWith(".html")) сторінки.push(f);
        });
    })(ROOT);

    const формиЗПаролем = [];

    сторінки.forEach(f => {
        const html = fs.readFileSync(f, "utf8");
        [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].forEach(m => {
            if (!/type="password"/.test(m[0])) return;
            const id = (m[0].match(/<form\b[^>]*id="([^"]+)"/) || [])[1] || "без id";
            формиЗПаролем.push({ де: path.relative(ROOT, f) + "#" + id, html: m[0] });
        });
    });

    // Нуль форм означав би, що обхід зламався, а перевірка нижче
    // зелена ні про що.
    check(`форм із паролем знайдено: ${формиЗПаролем.length}`, формиЗПаролем.length >= 4);

    // Ім'ям вважається поле з autocomplete="username" або "email" —
    // менеджери паролів беруть обидва.
    const безІмені = формиЗПаролем
        .filter(ф => !/autocomplete="(username|email)"/.test(ф.html))
        .map(ф => ф.де);

    check("у кожної є поле імені", безІмені.length === 0, безІмені.join(", "));

    // Обидві форми, з яких усе почалось, — окремо й поіменно.
    ["account.html#resetPasswordForm", "account.html#passwordForm"].forEach(де => {
        const ф = формиЗПаролем.find(x => x.де === де);
        check(`${де}: поле імені є`,
            Boolean(ф) && /class="pm-username"[^>]*autocomplete="username"/.test(ф.html),
            ф ? "поля з класом pm-username і autocomplete=username немає" : "форму не знайдено");
    });
}


console.log("\n[2] Поле імені заповнюється лише справжньою поштою");
{
    // Беремо справжні функції з коду, а не їхні копії.
    const клієнт = read("assets/js/supabase-client.js");
    const кабінет = read("assets/js/account.js");

    const домен = (клієнт.match(/const TELEGRAM_EMAIL_DOMAIN = [^;]+;/) || [])[0];
    const справжня = (клієнт.match(/function realEmail\(user\) \{[\s\S]*?\n\}\n/) || [])[0];
    const помічник = (кабінет.match(/function підставитиІмʼяДляМенеджераПаролів\(user\) \{[\s\S]*?\n\}\n/) || [])[0];

    check("функції знайдено", Boolean(домен && справжня && помічник));

    const dom = new JSDOM(`<!doctype html><body>
        <form id="resetPasswordForm"><input class="pm-username" autocomplete="username" hidden></form>
        <form id="passwordForm"><input class="pm-username" autocomplete="username" hidden></form>
    </body>`, { runScripts: "outside-only" });

    const { window } = dom;
    window.eval(домен + "\n" + справжня + "\n" + помічник +
        "\nwindow.__підставити = підставитиІмʼяДляМенеджераПаролів;");

    const значення = () => [...window.document.querySelectorAll(".pm-username")].map(п => п.value);

    window.__підставити({ email: "olena@example.com" });
    check("справжня пошта стає іменем в обох формах",
        значення().every(v => v === "olena@example.com"), значення().join(", "));

    window.__підставити({ email: "tg_123456789@telegram.bestbrnd4u.com" });
    check("службова пошта Telegram — ні",
        значення().every(v => v === ""), значення().join(", "));

    // Порожня сесія (подія прийшла без користувача) не мусить ні
    // падати, ні лишати попереднє ім'я.
    window.__підставити({ email: "olena@example.com" });
    window.__підставити(null);
    check("без користувача поле очищується, а не падає",
        значення().every(v => v === ""), значення().join(", "));
}


console.log("\n[3] Помічник кличеться там, де користувач відомий");
{
    const кабінет = read("assets/js/account.js");

    // Після листа про відновлення: Supabase відновлює сесію з посилання
    // й надсилає PASSWORD_RECOVERY — разом із сесією.
    const відновлення = (кабінет.match(/onAuthStateChange\(\(event, session\) => \{[\s\S]*?\n\}\);/) || [])[0] || "";
    check("у події відновлення пароля",
        /PASSWORD_RECOVERY[\s\S]*підставитиІмʼяДляМенеджераПаролів\(session && session\.user\)/.test(відновлення),
        відновлення.slice(0, 80) || "обробника з (event, session) не знайдено");

    // Профіль малює loadProfile(user) — там і зміна пароля.
    const профіль = (кабінет.match(/async function loadProfile\(user\) \{[\s\S]*?\n\}\n/) || [])[0] || "";
    check("у завантаженні профілю",
        /підставитиІмʼяДляМенеджераПаролів\(user\)/.test(профіль));
}

console.log(failures === 0
    ? "\n✅ Менеджер паролів знає, чий це пароль\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
