// Акордеони: стрілка мусить розвертатись у КОЖНОМУ з них.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// «Часті запитання» на байєр-сервісі розгортались, а стрілка вперто
// дивилась униз. Причина в одному селекторі: правило повороту слухало
// тільки .accordion-item.open (характеристики товару), а FAQ позначає
// відкритий пункт класом .bayer-faq-item.open.
//
// Тобто єдина позначка «відкрито / закрито» показувала неправду. Той
// самий блок стоїть на ЧОТИРЬОХ сторінках — байєр-сервіс, доставка,
// повернення, політика, — тож помилка була видна скрізь.
//
// ЧОМУ САМЕ ТАКА ПЕРЕВІРКА
// -------------------------
// Шукати рядок «bayer-faq-item» у CSS було б безглуздо: завтра
// зʼявиться пʼятий акордеон із власним класом, і все повториться.
// Тому перевіряємо ЗВʼЯЗОК: беремо класи, на яких JS реально вмикає
// .open, і для кожного, у чиїй розмітці є стрілка, вимагаємо правило
// повороту.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

// Сторінки й скрипти, де живуть акордеони. Згенеровані сторінки
// товарів (p/**) не чіпаємо: вони збираються з product.html.
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));
const scripts = fs.readdirSync(path.join(ROOT, "assets/js")).filter(f => f.endsWith(".js"));

const sources = pages.map(f => [f, read(f)])
    .concat(scripts.map(f => ["assets/js/" + f, read("assets/js/" + f)]));

const css = read("assets/css/style.css");


console.log("\n[1] Класи, на яких вмикається .open");

// closest(".щось")… classList.toggle/add("open") — саме так позначають
// відкритий пункт і в товарі, і в FAQ.
const РЕ = /closest\("\.([\w-]+)"\)[\s\S]{0,260}?classList\.(?:toggle|add)\("open"\)/g;

const items = new Map();

sources.forEach(([file, text]) => {

    let m;

    while ((m = РЕ.exec(text)) !== null) {

        if (!items.has(m[1])) items.set(m[1], new Set());

        items.get(m[1]).add(file);

    }

});

check("акордеони знайдено", items.size > 0, [...items.keys()].join(", "));

// Той самий блок стоїть на кількох сторінках — саме тому одна помилка
// в селекторі коштувала чотирьох сторінок одразу.
check("FAQ знайдено на всіх сторінках, де він є",
    (items.get("bayer-faq-item") || new Set()).size >= 4,
    [...(items.get("bayer-faq-item") || [])].join(", "));


console.log("\n[2] У кожного акордеона зі стрілкою стрілка розвертається");
{
    // Правило повороту — те, що ставить transform:rotate(180deg)
    // елементу .accordion-chevron.
    const поворот = css.match(/([^{}]*\.accordion-chevron\s*)\{[^}]*transform:\s*rotate\(180deg\)/);

    check("правило повороту існує", !!поворот);

    const селектор = поворот ? поворот[1] : "";

    items.forEach((files, cls) => {

        // Стрілка є не в кожного акордеона: у мобільних блоках
        // характеристик вона одна, а, скажімо, випадні списки
        // фільтрів обходяться без неї. Вимагаємо поворот лише там,
        // де стрілка справді стоїть у розмітці.
        const зіСтрілкою = [...files].some(file => {

            const text = sources.find(s => s[0] === file)[1];

            return text.includes("accordion-chevron");

        });

        if (!зіСтрілкою) return;

        check(`.${cls}.open розвертає стрілку`,
            new RegExp(`\\.${cls}\\.open\\s+\\.accordion-chevron`).test(селектор),
            селектор.trim().replace(/\s+/g, " "));

    });
}


console.log("\n[3] Стан читається не лише оком");
{
    // Стрілка — це для зрячих. Зчитувач екрана мусить дізнатись стан
    // із aria-expanded, інакше «Часті запитання» для нього просто
    // список кнопок без жодної ознаки, що щось розкрилось.
    const faqPages = [...(items.get("bayer-faq-item") || [])].filter(f => f.endsWith(".html"));

    faqPages.forEach(file => {

        const text = sources.find(s => s[0] === file)[1];

        const кнопок = (text.match(/class="bayer-faq-question"/g) || []).length;
        const зАтрибутом = (text.match(/class="bayer-faq-question" aria-expanded="/g) || []).length;

        check(`${file}: у всіх кнопок є початковий aria-expanded`,
            кнопок > 0 && кнопок === зАтрибутом, `${зАтрибутом} з ${кнопок}`);

        check(`${file}: клік оновлює aria-expanded`,
            /setAttribute\("aria-expanded", String\(open\)\)/.test(text));

    });
}

console.log("\n[4] Стрілка намальована, а не надрукована");
{
    // ЩО БУЛО НЕ ТАК
    // ---------------
    // На оферті стрілка акордеона була знаком ⌄ зі шрифту, а на
    // решті чотирьох сторінок із тим самим блоком — намальованим
    // <svg>. Клас на них однаковий, тож жодна перевірка вище цього
    // не бачила: стрілка оберталась, aria-expanded оновлювався.
    //
    // А виглядала вона іншою: колір брався з тексту (майже чорний)
    // замість сірого, товщина й форма залежали від шрифту, і сиділа
    // вона на базовій лінії — нижче за середину рядка.
    //
    // Те саме було в картках замовлень у кабінеті.
    //
    // ЧОМУ САМЕ ТАКА ПЕРЕВІРКА
    // -------------------------
    // Не «чи немає ⌄ у файлі»: цей знак має право стояти в тексті.
    // Питаємо інше — чим намальована стрілка ТАМ, ДЕ ВОНА Є. Будь-який
    // майбутній клас на -chevron потрапляє під правило сам, без
    // дописування списку.

    // Коментарі геть: фігурна дужка всередині коментаря рве розбір
    // правил навпіл. Одного разу вже коштувало хибно зеленої перевірки.
    const cssБезКоментарів = css.replace(/\/\*[\s\S]*?\*\//g, " ");

    const ЕЛЕМЕНТ_RE = /<([a-z][\w-]*)\b[^>]*\bclass="([^"]*chevron[^"]*)"/gi;

    const класи = new Set();
    const надруковані = [];
    const форми = new Map();

    sources.forEach(([file, text]) => {

        let m;
        ЕЛЕМЕНТ_RE.lastIndex = 0;

        while ((m = ЕЛЕМЕНТ_RE.exec(text)) !== null) {

            const тег = m[1].toLowerCase();

            m[2].split(/\s+/).filter(c => c.endsWith("chevron")).forEach(c => класи.add(c));

            if (тег !== "svg") надруковані.push(`${file}: <${тег}> ${m[2]}`);

        }

        // Форма стрілки — та сама полілінія в усіх. Інакше «такі самі
        // стрілки» означало б лише «теж svg».
        const SVG_RE = /<svg[^>]*\bclass="([^"]*chevron[^"]*)"[^>]*>([\s\S]*?)<\/svg>/gi;

        let s;

        while ((s = SVG_RE.exec(text)) !== null) {

            const points = (s[2].match(/points="([^"]+)"/) || [])[1] || "(без polyline)";

            if (!форми.has(points)) форми.set(points, []);

            форми.get(points).push(file);

        }

    });

    check("стрілки знайдено", класи.size > 0, [...класи].join(", "));

    check("усі стрілки намальовані тегом svg",
        надруковані.length === 0, надруковані.join("; "));

    check("форма стрілки одна на весь сайт",
        форми.size === 1,
        [...форми].map(([p, files]) => `${p} ← ${[...new Set(files)].join(", ")}`).join(" | "));

    // Знак зі шрифту фарбують через color і font-size, намальований —
    // через stroke. Якщо в CSS лишились обидва підходи, хтось із них
    // бреше про те, чим стрілка є насправді.
    класи.forEach(cls => {

        const правила = [...cssБезКоментарів.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
            .filter(r => new RegExp(`\\.${cls}(?![\\w-])`).test(r[1]))
            .map(r => r[2]);

        check(`.${cls}: колір задано через stroke`,
            правила.some(d => /stroke\s*:/.test(d)),
            правила.join(" ").trim().replace(/\s+/g, " ") || "(правил не знайшов)");

        check(`.${cls}: розмір не залежить від шрифту`,
            !правила.some(d => /font-size\s*:/.test(d)),
            правила.filter(d => /font-size\s*:/.test(d)).join(" ").trim().replace(/\s+/g, " "));

    });
}


console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
