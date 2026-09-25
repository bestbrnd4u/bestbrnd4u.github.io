// Розмітка питань мусить бути тим самим текстом, що видно на сторінці.
//
// ЗНАЙДЕНО 25.09.2026, сторінка байєр-сервісу
// -------------------------------------------
// Питання лежали ДВІЧІ: у <script type="application/ld+json"> для
// Google і у видимому акордеоні для людини. Дві копії одного тексту,
// які треба правити разом, — і вони розійшлись:
//
//   у розмітці 7 питань, на сторінці — 10
//   «…обробку замовлення магазином У США?» проти «…магазином?»
//   «на техніку ТА ДЕЯКІ аксесуари»        проти «на техніку Й аксесуари»
//   «ЧИ можна замовити товар…»             проти «Можна замовити товар…»
//   «вартість ДОСТАВКИ рахується за вагою» проти «вартість ПЕРЕВЕЗЕННЯ…»
//
// Google вимагає, щоб розмічений текст був видимий на сторінці. За
// розбіжності він має право прибрати блок питань із видачі — тобто
// розмітка, зроблена заради пошуку, обертається його втратою.
//
// ЩО ЗРОБЛЕНО. Джерело правди тепер одне — видимий акордеон, а
// розмітку збирає scripts/build-faq-schema.js. Той самий підхід, що
// в build-home-static.js і build-legal.js.
//
// ЦЕЙ НАБІР СТЕЖИТЬ ЗА ТРЬОМА РЕЧАМИ:
//   [1] розмітка й видимий текст збігаються дослівно — це наслідок;
//   [2] крок справді вміє це робити — виконуємо його на зіпсованій
//       копії, а не шукаємо рядок у коді;
//   [3] крок стоїть у npm run build — інакше він нічого не лагодить.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const step = require("../scripts/build-faq-schema.js");

const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

// Видимий текст сторінки — так, як його бачить і Google, і людина.
const текст = html => html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

console.log("\n[1] Кожне питання й відповідь є у видимому тексті");
{
    let питань = 0;
    let сторінок = 0;
    const розійшлось = [];

    PAGES.forEach(rel => {

        const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
        const plain = текст(html);

        [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
            .forEach(m => {

                let block;
                try { block = JSON.parse(m[1]); } catch { return; }

                if (block["@type"] !== "FAQPage") return;

                сторінок++;

                (block.mainEntity || []).forEach(q => {

                    питань++;

                    const назва = String(q.name || "").replace(/\s+/g, " ").trim();
                    const відповідь = String((q.acceptedAnswer || {}).text || "")
                        .replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

                    if (назва && !plain.includes(назва)) розійшлось.push(`${rel}: питання «${назва.slice(0, 55)}»`);
                    if (відповідь && !plain.includes(відповідь)) розійшлось.push(`${rel}: відповідь на «${назва.slice(0, 45)}»`);

                });

            });

    });

    console.log(`  · ${питань} питань на ${сторінок} сторінках`);

    check("питання в розмітці взагалі є", питань > 0);

    check("нічого не розійшлось", розійшлось.length === 0, розійшлось.slice(0, 4).join("; "));

    // І навпаки: розмітка не має відставати від сторінки. Саме так і
    // було — три видимі питання до Google не доїжджали взагалі.
    const видимих = PAGES.reduce((sum, rel) => {
        const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
        if (!html.includes('"@type": "FAQPage"')) return sum;
        return sum + (html.match(/class="bayer-faq-question"/g) || []).length;
    }, 0);

    check("розмітка не відстає від сторінки за кількістю",
        питань === видимих, `у розмітці ${питань}, на сторінках ${видимих}`);
}

console.log("\n[2] Крок справді збирає розмітку з видимого тексту");
{
    // Виконуємо сам крок над зіпсованою копією: перевірка має ловити
    // не наявність файлу, а те, що він працює.
    const html = `
        <div class="bayer-faq-item">
            <button type="button" class="bayer-faq-question" aria-expanded="false">
                Чи можна платити частинами?
                <svg class="accordion-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="bayer-faq-answer">
                <div class="bayer-faq-answer-inner">
                    <p>Так &mdash; про це домовляємось окремо.</p>
                </div>
            </div>
        </div>`;

    const pairs = step.readPairs(html);

    check("питання прочитано", pairs.length === 1, JSON.stringify(pairs));

    if (pairs.length === 1) {

        check("значок зі стрілкою не потрапив у питання",
            pairs[0].name === "Чи можна платити частинами?", pairs[0].name);

        check("сутності HTML розкодовано",
            pairs[0].text === "Так — про це домовляємось окремо.", pairs[0].text);

    }

    const block = step.buildBlock(pairs);

    check("зібраний блок — правильний JSON", (() => {
        try {
            const json = JSON.parse(block.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
            return json["@type"] === "FAQPage" && json.mainEntity.length === 1;
        } catch { return false; }
    })());

    // Порожня сторінка не повинна давати порожній FAQPage — на це в
    // самому кроці стоїть сторожа, яка зупиняє збірку.
    check("зі сторінки без акордеона питань не береться",
        step.readPairs("<div>нічого тут немає</div>").length === 0);
}

console.log("\n[3] Крок стоїть у збірці");
{
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

    check("build викликає build-faq-schema.js",
        /build-faq-schema\.js/.test(pkg.scripts.build || ""),
        "крок, який ніхто не запускає, нічого не лагодить");

    // Перед apply-cache-version: той проставляє версії у ВСІ сторінки,
    // і крок після нього лишив би сторінку без свіжої версії.
    const build = pkg.scripts.build || "";

    check("і робить це до простановки версій",
        build.indexOf("build-faq-schema.js") < build.indexOf("apply-cache-version.js"));
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
