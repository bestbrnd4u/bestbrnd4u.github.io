// Плаваючі кнопки (чат, дзвінок, «нагору») не накривають низ сторінки
// і не стрибають над невидимою смугою.
//
// ЩО БУЛО
// --------
// Заміряно в браузері на 320–1280px:
//
//   1. Догорнули до кінця — і під кнопками назавжди лишались копірайт,
//      години роботи, а на головній і товарі — посилання підвалу
//      («Оплата», «Всі товари»). Під копірайтом було 30px, а док
//      займає 108px висоти плюс свій відступ від низу.
//   2. На комп'ютері (1024, 1280) на сторінці товару док і стрілка
//      «нагору» підскакували з 30 до 100px, щойно основна «Купити»
//      їхала вгору: правило підйому над мобільною смугою стояло поза
//      медіазапитом, а сама смуга на комп'ютері display:none.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

// Розбір із вкладеністю: кожне правило знає, в якому @media воно стоїть.
function rules(text) {

    const out = [];
    const stack = [];
    let i = 0, start = 0;

    while (i < text.length) {
        const ch = text[i];
        if (ch === "{") {
            const head = text.slice(start, i).trim();
            if (head.startsWith("@")) { stack.push(head); start = i + 1; }
            else {
                const end = text.indexOf("}", i);
                out.push({ selector: head, body: text.slice(i + 1, end), media: stack.filter(h => h.startsWith("@media")).join(" ") });
                i = end; start = end + 1;
            }
        } else if (ch === "}") {
            stack.pop(); start = i + 1;
        }
        i++;
    }

    return out;

}

const all = rules(css);

const px = (body, prop) => {
    const m = body.match(new RegExp(`(?:^|;|\\s)${prop}:\\s*(\\d+)px`));
    return m ? Number(m[1]) : null;
};

const MOBILE = /max-width:\s*768px/;

// Розмір дока — з самого CSS, а не з голови: зміняться кнопки — і
// очікуване місце зміниться разом із ними.
const dock = all.find(r => r.selector === ".contact-dock" && !r.media);
const GAP = dock ? px(dock.body, "gap") : null;
const BUTTON = 48;
const DOCK_H = BUTTON * 2 + (GAP || 0);
const AIR = 12;

console.log("\n[1] Розміри дока прочитано");
check("gap між кнопками є", GAP !== null, GAP);
check("док прибитий через --dock-bottom", dock && /bottom:var\(--dock-bottom/.test(dock.body));

const liftDesktop = 30;
const liftMobile = (() => {
    const r = all.find(r => r.selector === "body" && MOBILE.test(r.media) && /--dock-lift:\s*16px/.test(r.body));
    return r ? 16 : null;
})();
const liftSticky = (() => {
    const r = all.find(r => r.selector === "body:has(.mobile-sticky-cart.show)" && /--dock-lift/.test(r.body));
    const m = r && r.body.match(/--dock-lift:\s*calc\((\d+)px/);
    return m ? Number(m[1]) : null;
})();

check("підйом на телефоні — 16px", liftMobile === 16, liftMobile);
check("підйом над смугою «Купити» знайдено", liftSticky !== null, liftSticky);

console.log("\n[2] Під копірайтом вистачає місця для дока");
{
    const base = all.find(r => r.selector === ".copyright" && !r.media);
    const basePad = base && (px(base.body, "padding-bottom")
        || (base.body.match(/padding:\s*\d+px\s+\d+(?:px)?\s+(\d+)px/) || [])[1] * 1 || null);

    const need = liftDesktop + DOCK_H + AIR;
    check(`комп'ютер: ≥ ${need}px`, basePad >= need, basePad);

    const mobile = all.find(r => r.selector === ".copyright" && MOBILE.test(r.media));
    const mobilePad = mobile && px(mobile.body, "padding-bottom");
    const needM = liftMobile + DOCK_H + AIR;
    check(`телефон: ≥ ${needM}px`, mobilePad >= needM, mobilePad);

    const sticky = all.find(r => r.selector === "body:has(.mobile-sticky-cart) .copyright" && MOBILE.test(r.media));
    const stickyPad = sticky && px(sticky.body, "padding-bottom");
    const needS = liftSticky + DOCK_H + AIR;
    check(`телефон зі смугою «Купити»: ≥ ${needS}px`, stickyPad >= needS, stickyPad);

    // Місце резервується сталим числом, а не з --dock-lift: той міняється
    // з банером згоди й смугою, і низ сторінки «дихав» би під пальцем.
    const breathing = all.filter(r => /\.copyright/.test(r.selector) && /padding[^;]*var\(--dock/.test(r.body));
    check("резерв не залежить від --dock-lift / --dock-bottom", breathing.length === 0,
        breathing.map(r => r.selector).join(", "));
}

console.log("\n[3] Підйом над смугою «Купити» — лише там, де смуга є");
{
    // Смуга показується лише в @media(max-width:768px) …
    const shown = all.filter(r => r.selector === ".mobile-sticky-cart" && /display:\s*block/.test(r.body));
    check("смуга видима тільки на телефоні", shown.length > 0 && shown.every(r => MOBILE.test(r.media)),
        shown.map(r => r.media || "без медіазапиту").join(", "));

    // … тож і кожне правило, що підіймає док через неї, мусить бути там.
    const lifting = all.filter(r => /mobile-sticky-cart\.show/.test(r.selector) && /--dock-lift/.test(r.body));
    check("правила підйому знайдено", lifting.length >= 2, lifting.length);

    const outside = lifting.filter(r => !MOBILE.test(r.media));
    check("жодне не діє на комп'ютері", outside.length === 0, outside.map(r => r.selector).join(" | "));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
