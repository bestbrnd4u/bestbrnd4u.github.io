// Відгук на натискання: чи взагалі спрацьовує :active.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Reset на початку style.css прибирає системний сірий блик на тапі
// (-webkit-tap-highlight-color:transparent) з коментарем, що замість
// нього будуть власні :active. Довго їх не було: на весь файл :active
// стояв у восьми місцях, і перевірка поведінкою на головній показала,
// що з 18 видів натискальних елементів відгук дають ДВА.
//
// Помітно саме на телефоні, де всі :hover вимкнені media-запитом: палець
// тисне, екран не змінюється — і поки йде перехід, це читається як «не
// спрацювало».
//
// ГОЛОВНА ВИМОГА, ЯКУ СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// -------------------------------------------
// Мало ДОДАТИ :active — треба, щоб він справді діяв. Тут два класи
// помилок, на кожен з яких уже наступали:
//
//   1. :active і :hover мають ОДНАКОВУ специфічність, тож між ними
//      вирішує порядок у файлі. У .brand-card :active стояв ВИЩЕ за свій
//      :hover — і натискання не діяло взагалі: працювало лише на тапі,
//      де ховера немає. Лікується окремим правилом :hover:active, у
//      якому ховерний зсув повторено.
//
//   2. Якщо елемент уже має transform у базовому правилі (наприклад
//      translateY(-50%) для центрування круглої стрілки), :active мусить
//      його ПОВТОРИТИ. Інакше при натисканні кнопка не просто присідає,
//      а зʼїжджає на пів своєї висоти.
const fs = require("fs");
const path = require("path");
const csstree = require("css-tree");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8")
    .replace(/\r\n/g, "\n");

// Ключ елемента: селектор без :hover/:active. Правила про один елемент
// у різних станах отримують однаковий ключ.
const key = s => s.replace(/:(hover|active)/g, "").replace(/\s+/g, " ").trim();

// Розбити список селекторів по комах, НЕ зачіпаючи коми всередині
// дужок. Наївний split(",") на правилі картки товару
// (:not(:has(button:active, a:active, …))) різав селектор на шматки й
// створював фантомні ключі «a» та «input».
const розділити = s => {
    const out = [];
    let depth = 0, cur = "";
    for (const ch of s) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
        cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim()).filter(Boolean);
};

const ast = csstree.parse(css, { positions: true });

// Тривалість переходу в БАЗОВОМУ правилі елемента (без станів). Потрібна
// блоку [4]: правило :active може не задавати свою, якщо база вже швидка.
const базоваТривалість = new Map();
csstree.walk(csstree.parse(css), {
    visit: "Rule",
    enter(node) {
        const selText = csstree.generate(node.prelude);
        if (/:(hover|active|focus)/.test(selText)) return;
        csstree.walk(node.block, {
            visit: "Declaration",
            enter(d) {
                if (d.property !== "transition" && d.property !== "transition-duration") return;
                const v = csstree.generate(d.value);
                for (const sel of розділити(selText)) базоваТривалість.set(key(sel), v);
            }
        });
    }
});

// Збираємо ВСІ правила, що задають transform, за ключем елемента
const заTransform = new Map();
csstree.walk(ast, {
    visit: "Rule",
    enter(node) {
        const selText = csstree.generate(node.prelude);
        if (/^(from|to|\d+%)/.test(selText)) return;   // кадри @keyframes

        let transform = null;
        csstree.walk(node.block, {
            visit: "Declaration",
            enter(d) { if (d.property === "transform") transform = csstree.generate(d.value); }
        });
        if (!transform) return;

        // Чи лежить правило всередині @media (hover:hover). Це важливо:
        // :active у такому блоці діє ЛИШЕ з мишею, тому його значення
        // автор пише відносно ховерного стану, а не спокою.
        const вХоверМедіа = !!(this.atrule &&
            /hover\s*:\s*hover/.test(csstree.generate(this.atrule.prelude || { type: "Raw", value: "" })));

        for (const sel of розділити(selText)) {
            const k = key(sel);
            if (!k) continue;
            const запис = заTransform.get(k) ||
                { base: null, hover: null, active: null, hoverActive: null, activeInHover: null };
            const ховер = /:hover/.test(sel), актив = /:active/.test(sel);
            const дані = { sel, transform, line: node.loc.start.line };
            if (ховер && актив) запис.hoverActive = дані;
            else if (ховер) запис.hover = дані;
            else if (актив) { if (вХоверМедіа) запис.activeInHover = дані; else запис.active = дані; }
            else запис.base = дані;
            заTransform.set(k, запис);
        }
    }
});

console.log("\n[1] Основні органи керування мають відгук на натискання");
{
    // Список навмисно перелічений, а не виведений: це рішення «тут
    // натискання мусить бути видно», і воно має ламатись, якщо правило
    // приберуть або перейменують клас.
    const МУСЯТЬ = [
        ".btn", ".brand-teaser-btn", ".category", ".brand-card",
        ".carousel-arrow", ".collection-arrow", ".promo-hero-arrow",
        ".scroll-top", ".photo-nav", ".favorite",
        ".mini-color", ".mini-size", ".color", ".size",
        ".product-card .buy-btn"
    ];
    const без = МУСЯТЬ.filter(k => !(заTransform.get(k) || {}).active);
    check("кожен із перелічених елементів присідає при натисканні",
        без.length === 0, без.join(", "));

    // Картка товару — окремо: у неї :active із запобіжником :has(), тож
    // ключ виглядає інакше.
    check("картка товару теж має відгук",
        /\.product-card:active:not\(:has\(/.test(css));
}

console.log("\n[2] Натискання не скасовує ховерний зсув");
{
    // Якщо є і :hover з transform, і :active з transform — мусить бути
    // :hover:active, інакше з мишею одне з двох просто не діє.
    const прогалини = [];
    for (const [k, з] of заTransform) {
        if (!з.hover || !(з.active || з.activeInHover)) continue;
        // рух у ховері — це саме зсув/масштаб, а не, скажімо, нічого
        if (!/translate|scale|rotate/.test(з.hover.transform)) continue;
        // Годиться будь-який із двох способів: окреме :hover:active,
        // або :active всередині @media (hover:hover) — там значення вже
        // написане відносно ховера (так зроблено в .promo-hero-quicklinks).
        if (з.hoverActive || з.activeInHover) continue;
        прогалини.push(`${k} (:hover рядок ${з.hover.line}, :active рядок ${з.active.line})`);
    }
    check("натискання з мишею не втрачає ховерний зсув",
        прогалини.length === 0, prettify(прогалини));

    // І сам зсув у :hover:active мусить бути ПОВТОРЕНИЙ — інакше кнопка
    // при натисканні впаде на місце.
    const втрачені = [];
    for (const [k, з] of заTransform) {
        if (!з.hoverActive || !з.hover) continue;
        const функції = (з.hover.transform.match(/(translate[XY]?|scale[XY]?|rotate)\([^)]*\)/g) || []);
        for (const f of функції) {
            const назва = f.split("(")[0];
            if (!new RegExp(назва + "\\(").test(з.hoverActive.transform))
                втрачені.push(`${k}: у :hover є ${f}, у :hover:active — ні (рядок ${з.hoverActive.line})`);
        }
    }
    check("ховерний зсув повторено в :hover:active",
        втрачені.length === 0, prettify(втрачені));
}

console.log("\n[3] Натискання не зсуває елемент з місця");
{
    // Базовий transform (найчастіше translateY(-50%) для центрування)
    // мусить бути повторений в :active — інакше кнопка поїде.
    const зсунуті = [];
    for (const [k, з] of заTransform) {
        if (!з.base || !з.active) continue;
        const функції = (з.base.transform.match(/(translate[XY]?|scale[XY]?|rotate)\([^)]*\)/g) || []);
        for (const f of функції) {
            const назва = f.split("(")[0];
            // scale у базі — це кадрування фото (--frame-zoom), не центрування
            if (назва.startsWith("scale")) continue;
            if (!new RegExp(назва + "\\(").test(з.active.transform))
                зсунуті.push(`${k}: базовий ${f} не повторено в :active (рядок ${з.active.line})`);
        }
    }
    check("базовий transform повторено в :active",
        зсунуті.length === 0, prettify(зсунуті));
}

console.log("\n[4] Присідання швидке");
{
    // Ця перевірка НЕСЕ НАВАНТАЖЕННЯ, а не просто наглядає.
    //
    // Базові тривалості на сайті — 200…500ms: наведення на картку чи
    // наїзд фото навмисно плавні. Але натискання так тривати не може:
    // відповідь на дію мусить бути негайною, інакше кнопка «думає».
    // Тому кожне правило :active перебиває тривалість власною,
    // короткою. Забудеш її — присідання поїде 350ms і відчуття
    // «кнопка не слухається» повернеться.
    const МЕЖА = 200;
    const повільні = [];
    const ast2 = csstree.parse(css, { positions: true });
    csstree.walk(ast2, {
        visit: "Rule",
        enter(node) {
            const sel = csstree.generate(node.prelude);
            if (!/:active/.test(sel)) return;
            let transform = null, duration = null, transition = null;
            csstree.walk(node.block, {
                visit: "Declaration",
                enter(d) {
                    const v = csstree.generate(d.value);
                    if (d.property === "transform") transform = v;
                    if (d.property === "transition-duration") duration = v;
                    if (d.property === "transition") transition = v;
                }
            });
            if (!transform) return;
            // :hover:active бере тривалість від сусіднього :active тієї ж
            // основи — там вона вже перевірена, дублювати не потрібно
            if (/:hover/.test(sel)) return;

            // Діє або власна тривалість правила :active, або та, що вже
            // стоїть у базовому правилі елемента. Друге теж годиться:
            // у бігунка ціни база — 150ms, і перебивати нічого не треба.
            const джерело = duration || transition ||
                базоваТривалість.get(розділити(sel).map(key)[0]);
            if (!джерело) { повільні.push(`${sel} (рядок ${node.loc.start.line}): тривалість ніде не задана`); return; }
            const m = джерело.match(/(\d*\.?\d+)(ms|s)\b/);
            const ms = m ? (m[2] === "s" ? parseFloat(m[1]) * 1000 : parseFloat(m[1])) : null;
            if (ms === null || ms > МЕЖА)
                повільні.push(`${sel} (рядок ${node.loc.start.line}): ${ms}ms`);
        }
    });
    check(`кожне :active має власну тривалість не довшу за ${МЕЖА}ms`,
        повільні.length === 0, prettify(повільні));
}

console.log("\n[5] Присідання можна побачити");
{
    // transform без переходу — це стрибок. Правило :active мусить мати
    // transform у списку переходу свого елемента.
    const безПереходу = [];
    for (const [k, з] of заTransform) {
        if (!з.active) continue;
        // шукаємо transition для цього ж ключа
        const re = new RegExp(escape(k) + "\\s*(,[^{]*)?\\{[^}]*transition:([^;}]*)", "");
        const m = css.match(re);
        if (!m) continue;                    // переходу немає взагалі — окрема тема
        if (!/\btransform\b/.test(m[2])) безПереходу.push(k);
    }
    check("у переході елемента названо transform",
        безПереходу.length === 0, безПереходу.join(", "));

    // Масштаб мусить бути помітним, але не карикатурним. І головне:
    // присідання відлічується від того стану, в якому елемент ЗАРАЗ.
    // Якщо ховер уже збільшив до 1.04, то 1.01 — це рух ВСЕРЕДИНУ, а не
    // зростання. Саме тут перевірка спершу дала фальшиву тривогу на
    // .promo-hero-quicklinks a.
    const дивні = [];
    for (const [k, з] of заTransform) {
        // Хват повзунка ціни навпаки ЗБІЛЬШУЄ бігунок — так легше
        // тягнути пальцем. Це інший приём, і теж правильний.
        if (/::-webkit-slider-thumb|::-moz-range-thumb/.test(k)) continue;

        const ховерScale = (() => {
            const m = з.hover && з.hover.transform.match(/scale\(([\d.]+)\)/);
            return m ? parseFloat(m[1]) : 1;
        })();

        // Правило для ТАПУ відлічується від спокою (ховера немає),
        // правило для МИШІ — від ховерного стану. Порівнювати тапне
        // значення з ховерним масштабом неправильно: саме так перевірка
        // спершу дала фальшиву тривогу на .favorite (scale .9 проти 1.08).
        const пари = [
            [з.active, 1, ":active"],
            [з.activeInHover, ховерScale, ":active у @media(hover)"],
            [з.hoverActive, ховерScale, ":hover:active"]
        ];
        for (const [правило, відлік, підпис] of пари) {
            if (!правило) continue;
            const m = правило.transform.match(/scale\(([\d.]+)\)/);
            if (!m) continue;
            const v = parseFloat(m[1]);
            if (v >= відлік || v < відлік * 0.85)
                дивні.push(`${k} ${підпис}: scale(${v}) при відліку ${відлік} (рядок ${правило.line})`);
        }
    }
    check("натискання зменшує елемент відносно свого стану відліку",
        дивні.length === 0, prettify(дивні));
}

function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function prettify(list) {
    if (!list.length) return undefined;
    return "\n      " + list.join("\n      ");
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");
process.exit(failures ? 1 : 0);
