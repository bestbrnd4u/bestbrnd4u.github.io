// Кабінет: вимога до пароля видна весь час, кнопка Google каже, що робить.
//
// ЩО БУЛО
// --------
//   - «Мінімум 6 символів» жило лише в placeholder поля пароля — і
//     зникало з першою літерою, саме тоді, коли про вимогу треба
//     пам'ятати. Читалці воно не гарантоване взагалі.
//   - Кнопка входу називалась просто «Google», а сусідня — «Увійти через
//     Telegram». Читалка казала «Google, кнопка» — без того, що вона
//     робить.
//
// Тепер під обома полями нового пароля (реєстрація й скидання) —
// видимий рядок, пов'язаний з полем через aria-describedby; поле має
// minlength — і менеджер паролів генерує достатньо довгий.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const html = fs.readFileSync(path.join(ROOT, "account.html"), "utf8");
const js = fs.readFileSync(path.join(ROOT, "assets/js/account.js"), "utf8");
const { document } = new JSDOM(html).window;

// Яке число насправді перевіряє код — з нього й беремо очікуване.
const rule = Number((js.match(/if \(password\.length < (\d+)\)/) || [])[1]);

console.log("\n[1] Правило з коду");
check("знайдено «password.length < N»", Number.isFinite(rule) && rule > 0, rule);

for (const id of ["signupPassword", "newPassword"]) {

    console.log(`\n[${id}]`);

    const input = document.getElementById(id);
    check("поле є", Boolean(input));
    if (!input) continue;

    check(`minlength = ${rule}, як у коді`, Number(input.getAttribute("minlength")) === rule, input.getAttribute("minlength"));

    const hintId = input.getAttribute("aria-describedby");
    const hint = hintId && document.getElementById(hintId);
    check("пов'язане з підказкою (aria-describedby)", Boolean(hint), hintId);

    if (hint) {
        check(`підказка називає те саме число — «${rule}»`, new RegExp(`\\b${rule}\\b`).test(hint.textContent), hint.textContent.trim());
        // Усередині <label> рядок став би частиною НАЗВИ поля:
        // «Пароль Мінімум 6 символів» — назва, а не опис.
        check("підказка поза <label>", !hint.closest("label"));
        check("і не схована", !hint.hidden && !/display\s*:\s*none/.test(hint.getAttribute("style") || ""));
    }

    const label = input.closest("label");
    const name = label ? label.textContent.replace(/\s+/g, " ").trim() : "";
    check("назва поля — просто «Пароль…», без вимоги", name && !/Мінімум/.test(name), name);
}

console.log("\n[Кнопки входу]");
{
    const google = document.querySelector(".auth-social-google");
    const telegram = document.querySelector(".auth-social-telegram");
    const text = el => el ? el.textContent.replace(/\s+/g, " ").trim() : "";

    check("Google: «Увійти через Google»", /^Увійти через Google$/.test(text(google)), text(google));
    check("Telegram: «Увійти через Telegram»", /^Увійти через Telegram$/.test(text(telegram)), text(telegram));
}

console.log("\n[Стиль підказки]");
{
    const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = (css.match(/\.auth-form \.field-hint\{([^}]*)\}/) || [])[1] || "";
    const pull = Number((rule.match(/margin-top:\s*(-?\d+)px/) || [])[1]);
    const gap = Number(((css.match(/\.auth-form\{[^}]*?gap:\s*(\d+)px/) || [])[1]));
    check("правило є", rule.length > 0);
    // Від'ємний відступ не має бути більшим за проміжок форми — інакше
    // рядок наїде на поле (та сама пастка, що з описом бренду).
    check(`підтягування (${pull}) менше за проміжок форми (${gap})`, Number.isFinite(pull) && Number.isFinite(gap) && gap + pull > 0, gap + pull);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
