// Опис бренду не налазить на вступ над ним.
//
// ЩО БУЛО
// --------
// .brand-about підтягується до заголовка від'ємним відступом -20px,
// розрахованим на 36px під .catalog-header на комп'ютері (лишається 16).
// На телефоні під заголовком 14px, а опис мав ті самі -20: 14 − 20 = −6.
// На всіх 21 сторінці брендів із описом «Нью-йоркська марка…» залазила
// на 6px на рядок «18 моделей… Гаманці.» (заміряно на 375 і 768).
//
// Зазор = відступ під заголовком + відступ над описом. Рахуємо його з
// CSS для обох ширин і вимагаємо, щоб він був додатним.
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

// Правила з урахуванням вкладеності в @media (порядок — як у файлі).
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
        } else if (ch === "}") { stack.pop(); start = i + 1; }
        i++;
    }
    return out;
}

const all = rules(css);
const MOBILE = /max-width:\s*768px/;

// Значення властивості для селектора на ширині: останнє правило, що діє
// (вага однакова — один клас, тож вирішує порядок у файлі).
function value(selector, prop, mobile) {
    let found = null;
    for (const r of all) {
        if (r.selector !== selector) continue;
        if (r.media && !(mobile && MOBILE.test(r.media))) continue;
        // «0» пишуть і без px — інакше таке правило тихо пропускалось би,
        // і діяло б значення з комп'ютера.
        const own = r.body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*(-?\\d+)(?:px)?\\s*(?:;|$)`));
        if (own) { found = Number(own[1]); continue; }
        // margin: top right bottom — для margin-top / margin-bottom
        const short = r.body.match(/(?:^|[;\s])margin:\s*(-?\d+)(?:px)?(?:\s+(-?\d+)(?:px)?)?(?:\s+(-?\d+)(?:px)?)?/);
        if (short) {
            const [top, , bottom] = [Number(short[1]), short[2], short[3] !== undefined ? Number(short[3]) : Number(short[1])];
            if (prop === "margin-top") found = top;
            if (prop === "margin-bottom") found = bottom;
        }
    }
    return found;
}

for (const [назва, mobile] of [["комп'ютер", false], ["телефон (≤768px)", true]]) {

    console.log(`\n[${назва}]`);

    const under = value(".catalog-header", "margin-bottom", mobile);
    const pull = value(".brand-about", "margin-top", mobile);

    check("відступ під заголовком знайдено", under !== null, under);
    check("відступ над описом знайдено", pull !== null, pull);

    const gap = under + pull;
    // Не менше 4px: на око абзаци мусять читатись як два, а не злипатись.
    check(`зазор ${under} + (${pull}) = ${gap}px — не менше 4`, gap >= 4, gap);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
