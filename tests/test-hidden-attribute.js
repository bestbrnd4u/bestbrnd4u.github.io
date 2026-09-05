// Атрибут hidden мусить ховати елемент. Завжди.
//
// СИМПТОМ, ЧЕРЕЗ ЯКИЙ ЦЕЙ НАБІР ІСНУЄ
// ------------------------------------
// На сторінці КОЖНОГО товару висіла плашка «📦 Під замовлення» — і в
// того, що лежить на складі, і в того, у кого перемикач «під
// замовлення» вимкнений. У розмітці при цьому стояв hidden, у даних
// preOrder: false, у коді все правильно.
//
// Причина — у пріоритеті стилів. display:none для [hidden] живе в
// стилях БРАУЗЕРА, а вони програють будь-якому нашому правилу.
// Досить класу з display:
//
//     .preorder-tag{ display:inline-flex; }
//
// і атрибут перестає щось означати. Найпідліше те, що з коду цього не
// видно: el.hidden = true спрацював, атрибут у DOM стоїть, а елемент
// на екрані.
//
// У style.css уже лежало 14 правил на кшталт .loader[hidden],
// .cart-layout[hidden], .sort-menu[hidden] — та сама пастка, яку
// латали поштучно, щоразу постфактум. Тепер її закриває одне
// глобальне правило, а цей набір стежить, щоб воно не зникло.
//
// ЧОМУ ТУТ НЕМАЄ JSDOM
// ---------------------
// Спокуса перевірити «по-справжньому» — підняти jsdom і спитати
// getComputedStyle. Так робити НЕ можна: jsdom віддає display:none
// для [hidden] завжди, навіть коли клас із display переможе в
// справжньому браузері. Тобто на цьому самому багу він каже «усе
// гаразд» — перевірено, перш ніж писати цей коментар.
//
// Тому працюємо з текстом стилів: шукаємо класи, які код ховає
// атрибутом, і серед них ті, кому style.css задає display. Кожен
// такий клас має бути прикритий — глобальним правилом або власним
// .клас[hidden].

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const css = fs.readFileSync(path.join(ROOT, "assets", "css", "style.css"), "utf8");

// Порівнюємо на копії БЕЗ коментарів: у коментарі до глобального
// правила згадується .preorder-tag{display:inline-flex}, і пошук за
// текстом знаходив саме цю згадку, а не саме правило.
const code = css.replace(/\/\*[\s\S]*?\*\//g, "");

const GLOBAL_RULE = /(^|\})\s*\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/;

console.log("\n[1] Глобальне правило на місці");
{
    check("[hidden] вимикає елемент", GLOBAL_RULE.test(code));

    // Без !important правило програє класу з display — саме тому
    // стандартного display:none від браузера й не вистачало.
    check("саме !important, інакше клас із display переможе",
        /\[hidden\]\s*\{[^}]*!important/.test(code));

    check("стоїть до решти стилів",
        code.indexOf("[hidden]") < code.indexOf(".preorder-tag"),
        `${code.indexOf("[hidden]")} проти ${code.indexOf(".preorder-tag")}`);
}

// Класи, які код ховає атрибутом hidden: шукаємо теги, всередині яких
// є слово hidden, і беремо їхній class.
function hiddenClasses() {

    const files = [
        ...fs.readdirSync(ROOT).filter(f => f.endsWith(".html")).map(f => path.join(ROOT, f)),
        ...fs.readdirSync(path.join(ROOT, "assets", "js"))
            .filter(f => f.endsWith(".js")).map(f => path.join(ROOT, "assets", "js", f))
    ];

    const classes = new Set();

    files.forEach(file => {

        const text = fs.readFileSync(file, "utf8");

        (text.match(/<[a-z][^<>]{0,400}?hidden[^<>]{0,200}?>/g) || []).forEach(tag => {

            const attr = tag.match(/class="([^"${}]+)"/);

            if (!attr) return;

            attr[1].split(/\s+/).filter(Boolean).forEach(name => classes.add(name));

        });

    });

    return [...classes].sort();

}

// Класи, яким style.css задає display (крім самих правил для
// [hidden] — вони і є ліками, а не хворобою).
function displayClasses() {

    const found = new Set();

    // селектор { … display:… … }
    const rules = code.match(/[^{}]+\{[^}]*\}/g) || [];

    rules.forEach(rule => {

        const [selector, body] = [rule.slice(0, rule.indexOf("{")), rule.slice(rule.indexOf("{"))];

        if (!/(^|[;{\s])display\s*:/.test(body)) return;
        if (/\[hidden\]/.test(selector)) return;

        (selector.match(/\.[a-zA-Z][\w-]*/g) || [])
            .forEach(name => found.add(name.slice(1)));

    });

    return found;
}

console.log("\n[2] Класи з display, які код ховає, прикриті");
{
    const hidden = hiddenClasses();
    const display = displayClasses();

    check(`класів, які код ховає, знайдено — ${hidden.length}`, hidden.length >= 10, hidden.length);

    // Плашка, з якої все почалось: вона МАЄ бути в обох списках,
    // інакше збирач зламався й тест перевіряє порожнечу.
    check("серед них плашка «Під замовлення»", hidden.includes("preorder-tag"));
    check("і style.css справді задає їй display", display.has("preorder-tag"));

    const risky = hidden.filter(name => display.has(name));

    check(`класів у зоні ризику — ${risky.length}`, risky.length > 0, risky.length);

    // Прикриття: або глобальне правило, або власне .клас[hidden].
    const unguarded = GLOBAL_RULE.test(code)
        ? []
        : risky.filter(name =>
            !new RegExp(`\\.${name}\\[hidden\\]\\s*\\{[^}]*display\\s*:\\s*none`).test(code));

    check("кожен із них справді ховається", unguarded.length === 0, unguarded.join(", "));
}

console.log("\n[3] Плашка «Під замовлення» вмикається лише даними");
{
    const product = fs.readFileSync(path.join(ROOT, "assets", "js", "product.js"), "utf8");

    check("у розмітці — hidden, поки товар не «під замовлення»",
        /<div class="preorder-tag" \$\{product\.preOrder \? "" : "hidden"\}>/.test(product));

    // Далі стан веде вибір кольору й розміру — через .hidden, тобто
    // правило з [1] і є умовою того, що це взагалі працює.
    check("далі стан веде обраний колір і розмір",
        /const preOrder = page\.dataset\.colorPreorder === "1"/.test(product)
        && /if \(tag\) tag\.hidden = !preOrder;/.test(product));
}

console.log(failures === 0
    ? "\n✅ hidden ховає\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
