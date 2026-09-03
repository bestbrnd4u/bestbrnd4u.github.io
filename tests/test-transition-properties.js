// Переходи в стилях: що саме анімується і як довго.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// У файлі стилів було 90 переходів (із 135), які анімували `all`:
// або явно, або через `transition:.35s` без назви властивості, або
// через змінну `--transition`, що розкривалась у те саме `all .35s`.
//
// `all` — не скорочення, а інша поведінка. Браузер стежить за КОЖНОЮ
// властивістю елемента й плавно тягне будь-яку, що змінилась, — зокрема
// ті, які проставляє JS, і ті, про які автор правила не думав. Через це:
//
//   * зміни, яких ніхто не замовляв, отримують анімацію (найгірше — коли
//     JS переставляє розміри чи положення: виходить «пливе» замість
//     «стало»);
//   * у переходи потрапляють властивості, що викликають layout, тобто
//     кожен кадр перераховує розкладку;
//   * чотири правила анімували ВЗАГАЛІ НІЧОГО — на самому елементі не
//     змінювалась жодна властивість, і перехід просто висів.
//
// ГОЛОВНА ВИМОГА, ЯКУ СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// -------------------------------------------
// Перехід мусить називати рівно те, що змінюється, — і називати ВСЕ,
// що змінюється. Обидві помилки однаково погані: `all` тягне зайве,
// а неповний список означає, що частина стану тепер клацає замість
// плавного переходу. Тому перевірка двобічна.
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

// ---------------------------------------------------------------
// Розбір: справжній парсер, а не регулярки. Селектори тут із
// комами, вкладеними @media і :not(...) — на регулярках це
// розсипається саме там, де важливо не помилитись.
// ---------------------------------------------------------------
const ast = csstree.parse(css, { positions: true });

// Стани — те, що ПЕРЕМИКАЄТЬСЯ. Псевдоелементи (::before/::after) сюда
// не входять навмисно: це окремий елемент зі своїм переходом, і зсипати
// його властивості в перехід батька було б помилкою.
const STATE_PSEUDO = /::?(hover|focus-within|focus-visible|focus|active|checked|disabled|target|valid|invalid|placeholder-shown)\b/g;
const STATE_ATTR = /\[(?:hidden|disabled|open|aria-[\w-]+|data-[\w-]+)(?:[~^$*|]?=[^\]]*)?\]/g;
const STATE_CLASS = /\.(open|active|is-[\w-]+|has-[\w-]+|show|shown|visible|selected|current|expanded|collapsed|loading|dragging|just-returned|in-cart|added|error|invalid|filled|sticky|scrolled|scroll-hidden|checked|on|off|disabled|dimmed|pressed|highlight|highlighted)\b/g;
// Структурні псевдокласи — НЕ стани: вони обирають підмножину елементів,
// а не інший їхній вигляд.
const STRUCTURAL = /:(nth-child|nth-of-type|nth-last-child|nth-last-of-type)\([^)]*\)|:(first|last|only)-(child|of-type)\b/g;

const reset = r => { r.lastIndex = 0; return r; };
const hasState = s => reset(STATE_PSEUDO).test(s) || reset(STATE_ATTR).test(s) ||
                      reset(STATE_CLASS).test(s) || /:not\(/.test(s);

// «Ключ» — той самий елемент без станів. Двоє правил описують один
// елемент, якщо ключі збіглись.
const key = s => s
    .replace(reset(STATE_PSEUDO), "").replace(reset(STATE_ATTR), "")
    .replace(reset(STATE_CLASS), "").replace(reset(STRUCTURAL), "")
    .replace(/:not\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "")
    .replace(/\s+/g, " ").replace(/\s*([>+~])\s*/g, "$1").trim();

// Властивості, які не анімуються осмислено або не мають анімуватись.
const SKIP = new Set(["display", "content", "position", "overflow", "overflow-x", "overflow-y",
    "pointer-events", "cursor", "white-space", "flex-direction", "align-items", "justify-content",
    "text-align", "font-family", "list-style", "box-sizing", "user-select", "-webkit-user-select",
    "touch-action", "scroll-behavior", "animation", "animation-name", "animation-duration",
    "transition", "transition-duration", "transition-property", "transition-timing-function",
    "will-change", "z-index", "text-overflow", "transform-origin", "object-fit",
    "grid-template-columns", "flex-wrap", "appearance", "-webkit-appearance", "isolation",
    "text-decoration", "flex", "order", "scroll-snap-align", "-webkit-line-clamp",
    // Рамка фокуса — сигнал для того, хто ходить клавіатурою. Вона має
    // з'явитись негайно, тому в переходах її бути не повинно.
    "outline", "outline-offset", "outline-color", "outline-width", "outline-style",
    // Насиченість шрифту анімувати не можна: змінна ширина літер
    // перераховує розкладку тексту в КОЖНОМУ кадрі, а в невʼязкому
    // шрифті вона й так перемикається стрибком. Активна категорія в
    // сайдбарі стає жирнішою — і мусить ставати жирнішою одразу.
    "font-weight"]);

// Скорочення → те, що насправді змінюється
const NORM = { background: "background-color", border: "border-color" };
const norm = p => NORM[p] || p;

const rules = [];
csstree.walk(ast, {
    visit: "Rule",
    enter(node) {
        const selText = csstree.generate(node.prelude);
        // кадри @keyframes — не правила зі станами
        if (/^(from|to|\d+%)/.test(selText)) return;
        const decls = [];
        csstree.walk(node.block, {
            visit: "Declaration",
            enter(d) {
                decls.push({
                    prop: d.property,
                    value: csstree.generate(d.value),
                    line: d.loc.start.line
                });
            }
        });
        rules.push({ selText, sels: selText.split(",").map(s => s.trim()), decls });
    }
});

// Усі переходи разом із тим, що вони називають
const переходи = [];
for (const r of rules) {
    for (const d of r.decls) {
        if (d.prop !== "transition") continue;
        // `transition:none` — це навмисне ВІДКЛЮЧЕННЯ переходу (напр.
        // .lightbox.is-zoomed .lightbox-img, де рух веде палець і будь-яке
        // згладжування шкодить). Перевіряти в ньому нічого.
        if (/^none$/i.test(d.value.trim())) continue;
        переходи.push({
            rule: r, sel: r.selText, line: d.line, value: d.value.trim(),
            // «transform 200ms ease, opacity 200ms ease» → ["transform","opacity"]
            props: d.value.split(",").map(part => part.trim().split(/\s+/)[0]).filter(Boolean)
        });
    }
}

// Останній компонент селектора: «.products-grid .product-hover-panel»
// → «.product-hover-panel». Потрібен, бо той самий елемент часто
// описують з РІЗНИХ боків: правило вигляду через один ланцюжок
// предків, правило стану — через інший.
const хвіст = s => s.split(/[\s>+~]+/).filter(Boolean).pop() || "";

// Що змінюється в станах цього елемента
function змінюєтьсяВСтанах(t) {
    const ключі = t.rule.sels.map(key);
    const хвости = ключі.map(хвіст);
    const набір = new Set();
    for (const o of rules) {
        if (o === t.rule) continue;
        for (const s of o.sels) {
            if (!hasState(s)) continue;
            const ks = key(s);
            // Три способи впізнати той самий елемент:
            //  1) те саме правило в іншому стані   .btn:hover ↔ .btn
            //  2) стан на ПРЕДКУ                   nav li:hover .mega-menu ↔ .mega-menu
            //  3) інший ланцюжок предків           .product-card:hover .product-hover-panel
            //                                      ↔ .products-grid:not(.list-view) .product-hover-panel
            const ok = ключі.some(k => k && (ks === k ||
                    (ks.endsWith(k) && /[\s>+~]/.test(ks[ks.length - k.length - 1] || "")))) ||
                хвости.some(h => h && h.startsWith(".") && хвіст(ks) === h);
            if (!ok) continue;
            for (const od of o.decls) {
                if (SKIP.has(od.prop)) continue;
                набір.add(norm(od.prop));
            }
        }
    }
    return набір;
}

console.log("\n[1] Ніде немає transition:all");
{
    const all = переходи.filter(t =>
        /^all\b/.test(t.value) ||          // явне all
        /^\.?\d/.test(t.value) ||          // «transition:.35s» — властивість не названа
        t.value.includes("var(--transition)"));

    check("жоден перехід не анімує all",
        all.length === 0,
        all.map(t => `${t.sel} (рядок ${t.line}): ${t.value}`).join(" | "));

    // Змінна, що розкривалась у all. Її немає навмисно: поки вона
    // існує, до неї тягнеться рука, і all повертається.
    check("змінної --transition більше не існує",
        !/--transition\s*:/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")));
}

console.log("\n[2] Перехід називає ВСЕ, що змінюється в станах");
{
    // Найважливіша перевірка. Неповний список гірший за all: візуально
    // це виглядає як «анімація зникла», і знайти причину важко.
    const прогалини = [];
    for (const t of переходи) {
        const треба = змінюєтьсяВСтанах(t);
        if (!треба.size) continue;
        const названо = new Set(t.props.map(norm));
        const бракує = [...треба].filter(p => !названо.has(p) && !названо.has("all"));
        if (бракує.length) прогалини.push(`${t.sel} (рядок ${t.line}): бракує ${бракує.join(",")}`);
    }
    check("немає переходів із неповним списком властивостей",
        прогалини.length === 0, prettify(прогалини));
}

console.log("\n[3] Немає переходів, які не анімують нічого");
{
    // Перехід на елементі, у якого жоден стан нічого не змінює, — це
    // або залишок після правки, або помилка в селекторі.
    //
    // Винятки — рівно два випадки, і обидва перевірені по коду:
    // властивість ставить JS інлайном, або стан лежить на СУСІДНЬОМУ
    // класі того самого елемента. Додаючи новий запис, вкажіть, ДЕ саме
    // це відбувається: без посилання виняток за півроку стане прикриттям
    // для справжньої помилки.
    const ВИНЯТКИ = {
        ".lightbox-track": "transform ставить lightbox.js:203 інлайном — гортання фото",
        ".lightbox-img": "transform ставить lightbox.js:188 інлайном — зум і протягування",
        ".gallery-slide": "масштаб іде через --frame-zoom, який ставить app.js:263",
        ".gallery-photo": "те саме: --frame-zoom з app.js:263",
        ".favorite-row-undo-bar span": "width ставить favorites.js:298 інлайном — смужка відліку",
        ".btn-modal": "стани на сусідніх класах .btn-modal-confirm:hover / .btn-modal-cancel:hover"
    };

    const пусті = переходи
        .filter(t => !змінюєтьсяВСтанах(t).size)
        .filter(t => !ВИНЯТКИ[t.sel]);

    check("кожен перехід має що анімувати",
        пусті.length === 0,
        пусті.map(t => `${t.sel} (рядок ${t.line})`).join(" | "));

    // Той самий запобіжник, що й для тривалостей: перейменували правило —
    // запис у списку тихо перестає діяти, і перевірка вище це проґавить.
    const мертвіВинятки = Object.keys(ВИНЯТКИ)
        .filter(sel => !переходи.some(t => t.sel === sel));
    check("усі записані винятки ще існують у стилях",
        мертвіВинятки.length === 0, мертвіВинятки.join(", "));

    // І окремо — чотири правила, які тягнули all, не анімуючи НІЧОГО.
    // Вони прибрані; перевірка тримає їх прибраними.
    const БУЛИ_МЕРТВІ = ["header", ".order-item img", ".search-result-card",
        ".header-icons .mobile-menu-btn,.header-left .mobile-menu-btn"];
    const повернулись = БУЛИ_МЕРТВІ.filter(sel => переходи.some(t => t.sel === sel));
    check("прибрані порожні переходи не повернулись",
        повернулись.length === 0, повернулись.join(" | "));
}

console.log("\n[4] Тривалості вибрані, а не випадкові");
{
    // ТУТ БУЛА перевірка «не довше 300ms». Її прибрано навмисно, і це
    // варто пояснити, щоб її не завели назад.
    //
    // Загальне правило «UI-перехід під 300ms» справедливе для
    // ВІДПОВІДІ НА ДІЮ: натиснув — має відгукнутись негайно. Але
    // наведення на фото товару чи категорії — не відповідь на дію, а
    // декоративне розкриття, і там повільніше означає плавніше.
    //
    // Я один раз уже скоротив ці переходи з 450–500ms до 260ms і
    // поставив сильний ease-out. Плавність зникла: така крива проходить
    // майже весь шлях у першій четверті часу, тому наїзд читається як
    // щиглик. Тривалості й криві повернуто до тих, що на проді.
    //
    // Швидкість натискання стережеться окремо — у test-press-feedback.js,
    // де :active мусить мати власну коротку transition-duration.
    const МЕЖА = 600;
    const порушники = [];
    for (const t of переходи) {
        const часи = [...t.value.matchAll(/(\d*\.?\d+)(ms|s)\b/g)]
            .map(m => m[2] === "s" ? parseFloat(m[1]) * 1000 : parseFloat(m[1]));
        const макс = Math.max(0, ...часи);
        if (макс > МЕЖА) порушники.push(`${t.sel} (рядок ${t.line}): ${макс}ms`);
    }
    check(`жоден перехід не довший за ${МЕЖА}ms`,
        порушники.length === 0, prettify(порушники));

    // Тривалість мусить бути НАЗВАНА. `transition:transform` без часу —
    // це 0s, тобто переходу немає, хоч правило й виглядає як перехід.
    const безЧасу = переходи.filter(t => !/(\d*\.?\d+)(ms|s)\b/.test(t.value));
    check("у кожного переходу названо тривалість",
        безЧасу.length === 0, безЧасу.map(t => `${t.sel} (рядок ${t.line})`).join(", "));
}

console.log("\n[5] Рамку фокуса не анімуємо");
{
    const зOutline = переходи.filter(t => /\boutline/.test(t.value));
    check("outline не згадується в жодному переході",
        зOutline.length === 0,
        зOutline.map(t => `${t.sel} (рядок ${t.line})`).join(" | "));
}

console.log("\n[6] Обсяг: перевірка справді щось бачить");
{
    // Захист від тихого самознищення тесту. Якщо розбір зламається і
    // переходів «стане» нуль, усі перевірки вище пройдуть на порожньому
    // наборі й тест буде зеленим, нічого не перевіривши.
    check("парсер бачить стилі", rules.length > 500, `правил: ${rules.length}`);
    check("парсер бачить переходи", переходи.length > 100, `переходів: ${переходи.length}`);

    const зіСтанами = переходи.filter(t => змінюєтьсяВСтанах(t).size).length;
    check("для більшості переходів знайдено стани",
        зіСтанами > переходи.length * 0.9,
        `зі станами ${зіСтанами} із ${переходи.length}`);
}

function prettify(list) {
    if (!list.length) return undefined;
    return "\n      " + list.join("\n      ");
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");
process.exit(failures ? 1 : 0);
