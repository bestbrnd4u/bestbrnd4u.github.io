// Вкладка мусить казати, що вона обрана.
//
// ЗАМІРЯНО НА ПРОДІ 25.09.2026, сторінка «Особистий кабінет»
// ----------------------------------------------------------
// «Яка вкладка зараз» несла сама тільки позначка active у класі —
// тобто колір. Сім кнопок:
//
//     гість    Увійти | Реєстрація
//     кабінет  Історія замовлень | Адреси | Мої дані |
//              Розсилки | Змінити пароль
//
// Жодного role="tab", жодного aria-selected. Хто не бачить екрана,
// чув сім однакових кнопок і після натискання не отримував НІЧОГО,
// що підтвердило б зміну. WCAG 4.1.2 «Ім'я, роль, значення», рівень A.
//
// Та сама порода, що й сердечко в картці товару: стан жив у кольорі
// й більше ніде.
//
// І знову нерівність: вкладки в адмінці (admin/orders.js) мали
// aria-selected від початку, а сусідні — люди, акції, відгуки — ні.
// Тобто правило в проєкті вже було, просто застосували його не всюди.
//
// ЩО ПЕРЕВІРЯЄМО
//   [1] розмітку: кожна вкладка названа, має стан і веде на панель;
//   [2] поведінку: виконуємо справжні selectTab() і wireTabKeys()
//       з account.js над підставленим DOM — пошук по тексту пройшов
//       би й на функції, яку ніхто не викликає;
//   [3] що жодна смуга вкладок не лишилась поза правилом.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// Сторінки покупця і сторінки адмінки: правило одне на всіх.
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"))
    .concat(fs.readdirSync(path.join(ROOT, "admin"))
        .filter(f => f.endsWith(".html")).map(f => "admin/" + f));

console.log("\n[1] Розмітка вкладок повна");
{
    let смуг = 0;
    let вкладок = 0;

    const безНазви = [];
    const безСтану = [];
    const безПанелі = [];
    const незбалансовані = [];

    PAGES.forEach(rel => {

        const doc = new JSDOM(fs.readFileSync(path.join(ROOT, rel), "utf8")).window.document;

        doc.querySelectorAll('[role="tablist"]').forEach(list => {

            смуг++;

            // Смуга вкладок без назви — «список вкладок» і все.
            const name = list.getAttribute("aria-label")
                || (list.getAttribute("aria-labelledby") || "")
                    .split(/\s+/).map(id => doc.getElementById(id)?.textContent).filter(Boolean).join(" ");

            if (!name || !name.trim()) безНазви.push(`${rel}: ${list.id || list.className}`);

            const tabs = [...list.querySelectorAll('[role="tab"]')];

            // Порожня смуга — вкладки малює JS, розмітку не перевіряємо.
            if (!tabs.length) return;

            вкладок += tabs.length;

            tabs.forEach(tab => {

                const state = tab.getAttribute("aria-selected");

                if (state !== "true" && state !== "false") {
                    безСтану.push(`${rel}: «${tab.textContent.trim().slice(0, 24)}»`);
                }

                const controls = tab.getAttribute("aria-controls");

                // aria-controls не обов'язковий, але якщо є — мусить
                // вести в наявну панель, а не в порожнечу.
                if (controls && !doc.getElementById(controls)) {
                    безПанелі.push(`${rel}: «${tab.textContent.trim().slice(0, 24)}» → #${controls}`);
                }

            });

            const обраних = tabs.filter(t => t.getAttribute("aria-selected") === "true").length;

            if (обраних !== 1) незбалансовані.push(`${rel}: обраних ${обраних} з ${tabs.length}`);

        });

    });

    console.log(`  · смуг вкладок: ${смуг}, вкладок у розмітці: ${вкладок}`);

    check("смуги вкладок узагалі є", смуг > 0);
    check("кожна смуга названа", безНазви.length === 0, безНазви.join("; "));
    check("кожна вкладка має aria-selected", безСтану.length === 0, безСтану.slice(0, 5).join("; "));
    check("aria-controls веде в наявну панель", безПанелі.length === 0, безПанелі.slice(0, 3).join("; "));
    check("обрана рівно одна вкладка в смузі", незбалансовані.length === 0, незбалансовані.join("; "));
}

console.log("\n[2] Перемикання справді міняє стан, а не лише клас");
{
    const src = fs.readFileSync(path.join(ROOT, "assets/js/account.js"), "utf8");

    const selectFn = src.match(/function selectTab\(tabs, active\)[\s\S]*?\n}\n/);
    const keysFn = src.match(/function wireTabKeys\(tabs\)[\s\S]*?\n}\n/);

    check("selectTab знайдено в account.js", !!selectFn);
    check("wireTabKeys знайдено в account.js", !!keysFn);

    if (selectFn && keysFn) {

        const dom = new JSDOM(`<!doctype html><body>
            <div role="tablist" aria-label="Проба">
                <button class="auth-tab active" role="tab" aria-selected="true" id="t1">Один</button>
                <button class="auth-tab" role="tab" aria-selected="false" id="t2" tabindex="-1">Два</button>
                <button class="auth-tab" role="tab" aria-selected="false" id="t3" tabindex="-1">Три</button>
            </div></body>`, { runScripts: "outside-only", pretendToBeVisual: true });

        const { window } = dom;

        window.eval(selectFn[0]);
        window.eval(keysFn[0]);

        const tabs = [...window.document.querySelectorAll(".auth-tab")];

        window.tabs = tabs;
        window.eval("wireTabKeys(tabs)");

        // Клац по другій
        window.eval("selectTab(tabs, tabs[1])");

        const стан = () => tabs.map(t => `${t.getAttribute("aria-selected")}/${t.tabIndex}/${t.classList.contains("active")}`);

        check("обрана вкладка позначена, решта — ні",
            стан().join(" ") === "false/-1/false true/0/true false/-1/false", стан().join(" "));

        // Стрілка вправо з другої веде на третю
        tabs[1].focus();
        tabs[1].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));

        check("стрілка переводить фокус на наступну",
            window.document.activeElement === tabs[2],
            window.document.activeElement && window.document.activeElement.id);

        // По колу: з останньої вправо — на першу
        tabs[2].focus();
        tabs[2].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));

        check("з останньої стрілка веде на першу",
            window.document.activeElement === tabs[0],
            window.document.activeElement && window.document.activeElement.id);

        tabs[1].focus();
        tabs[1].dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));

        check("End веде на останню", window.document.activeElement === tabs[2],
            window.document.activeElement && window.document.activeElement.id);

        // Чужа клавіша нічого не робить
        const before = window.document.activeElement;
        tabs[2].dispatchEvent(new window.KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));

        check("звичайна літера фокус не рухає", window.document.activeElement === before);

    }
}

console.log("\n[3] Жодна смуга вкладок не лишилась поза правилом");
{
    // Кнопка, яку назвали вкладкою в класі, мусить бути вкладкою і
    // для читача. Саме так і було: клас .auth-tab / .account-tab /
    // .tab був, а ролі не було.
    const поза = [];

    PAGES.forEach(rel => {

        const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
        const doc = new JSDOM(html).window.document;

        doc.querySelectorAll("button").forEach(btn => {

            const cls = String(btn.className || "");

            if (!/(^|[\s-])tab(\s|$|-)/.test(cls)) return;
            if (btn.getAttribute("role") === "tab") return;

            поза.push(`${rel}: «${btn.textContent.trim().slice(0, 24)}» class="${cls}"`);

        });

    });

    check("кнопка-вкладка завжди має role=\"tab\"",
        поза.length === 0, поза.slice(0, 5).join("; "));
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
