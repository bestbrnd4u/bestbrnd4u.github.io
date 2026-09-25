// Будує розмітку FAQPage із ТОГО, ЩО ВИДНО НА СТОРІНЦІ.
//
// НАВІЩО (знайдено 25.09.2026)
// -----------------------------
// Питання лежали двічі: у <script type="application/ld+json"> для
// Google і у видимому акордеоні для людини. Дві копії одного тексту,
// які треба правити разом, — і вони розійшлись.
//
// На сторінці байєр-сервісу:
//
//   у розмітці 7 питань, на сторінці — 10
//   «…обробку замовлення магазином У США?»  проти  «…магазином?»
//   «на техніку ТА ДЕЯКІ аксесуари»          проти  «на техніку Й аксесуари»
//   «ЧИ можна замовити товар…»               проти  «Можна замовити товар…»
//   «вартість ДОСТАВКИ рахується за вагою»   проти  «вартість ПЕРЕВЕЗЕННЯ…»
//
// Google вимагає, щоб розмічений текст був видимий на сторінці. За
// розбіжності він має право прибрати блок питань із видачі —
// тобто «покращення» для пошуку перетворюється на його втрату.
//
// Виправляти руками безглуздо: розійдеться знову з наступною
// правкою тексту. Тому джерело правди одне — видимий акордеон, а
// розмітку збирає цей крок.
//
// ЧОМУ РЕГУЛЯРКИ, А НЕ РОЗБІР HTML
// ---------------------------------
// Так само, як у сусідніх кроках збірки: розмітка акордеона на всіх
// трьох сторінках однотипна й наша власна. Але мовчки помилитись
// тут не можна, тому нижче стоять сторожі: сторінка з блоком
// FAQPage, на якій не знайшлось жодного питання, зупиняє збірку.
const fs = require("fs");
const path = require("path");
const safe = require("./fs-retry");

const ROOT = path.join(__dirname, "..");

// Один пункт акордеона: кнопка з питанням і блок з відповіддю.
const ITEM_RE = /<div class="bayer-faq-item">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
const QUESTION_RE = /<button[^>]*class="bayer-faq-question"[^>]*>([\s\S]*?)<\/button>/;
// Закриття «або </div>, або кінець шматка»: ITEM_RE вище з'їдає всі
// три закривальні теги разом, тож усередині пункту їх уже немає — і
// перша версія цієї регулярки не знаходила жодної відповіді. Сторожа
// в main() тоді зупинила збірку замість того, щоб мовчки записати
// порожню розмітку, і саме так помилка й знайшлась.
const ANSWER_RE = /<div class="bayer-faq-answer-inner">([\s\S]*?)(?:<\/div>|$)/;

// Блок розмітки, який переписуємо. Шукаємо саме за типом: id у нього
// немає, а інші блоки на цих сторінках (BreadcrumbList) чіпати не можна.
const FAQ_BLOCK_RE = /<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema\.org",\s*"@type": "FAQPage",[\s\S]*?\n<\/script>/;

const ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–"
};

function plain(html) {

    return html
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&[a-z#0-9]+;/gi, m => ENTITIES[m.toLowerCase()] ?? m)
        .replace(/\s+/g, " ")
        .trim();

}

function readPairs(html) {

    const pairs = [];

    let m;
    ITEM_RE.lastIndex = 0;

    while ((m = ITEM_RE.exec(html)) !== null) {

        const item = m[1];

        const q = (item.match(QUESTION_RE) || [])[1];
        const a = (item.match(ANSWER_RE) || [])[1];

        if (!q || !a) continue;

        const name = plain(q);
        const text = plain(a);

        if (name && text) pairs.push({ name, text });

    }

    return pairs;

}

function buildBlock(pairs) {

    const entries = pairs.map(pair => [
        "        {",
        `            "@type": "Question",`,
        `            "name": ${JSON.stringify(pair.name)},`,
        `            "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(pair.text)} }`,
        "        }"
    ].join("\n")).join(",\n");

    return [
        `<script type="application/ld+json">`,
        "{",
        `    "@context": "https://schema.org",`,
        `    "@type": "FAQPage",`,
        `    "mainEntity": [`,
        entries,
        "    ]",
        "}",
        "</script>"
    ].join("\n");

}

function main() {

    const pages = fs.readdirSync(ROOT).filter(file => file.endsWith(".html"));

    let changed = 0;
    let checked = 0;
    let questions = 0;

    pages.forEach(file => {

        const full = path.join(ROOT, file);
        const html = safe.readFileSync(full, "utf8");

        if (!FAQ_BLOCK_RE.test(html)) return;

        checked++;

        const pairs = readPairs(html);

        // Сторожа: блок розмітки є, а питань на сторінці не знайшлось.
        // Значить, змінилась розмітка акордеона — і мовчки лишити
        // порожній FAQPage гірше, ніж зупинити збірку.
        if (!pairs.length) {
            console.error(`::error::${file}: блок FAQPage є, а питань в акордеоні не знайшлось — змінилась розмітка?`);
            process.exitCode = 1;
            return;
        }

        questions += pairs.length;

        const next = html.replace(FAQ_BLOCK_RE, () => buildBlock(pairs));

        if (next === html) return;

        safe.writeFileSync(full, next, "utf8");
        changed++;

        console.log(`  ${file}: ${pairs.length} питань`);

    });

    console.log(changed
        ? `Готово: розмітку питань оновлено на ${changed} сторінках (${questions} питань)`
        : `Готово: розмітка питань уже збігається з видимим текстом (${checked} сторінок, ${questions} питань)`);

}

module.exports = { readPairs, buildBlock, plain };

if (require.main === module) main();
