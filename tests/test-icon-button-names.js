// Кнопка-піктограма мусить мати назву словами.
//
// ЗАМІРЯНО НА ПРОДІ 25.09.2026
// ----------------------------
// Пройшовся по головній, кошику, обраному й пошуку і порахував, у
// скількох із 1070 керувань немає читабельного імені. Виявилось —
// у трьох, і лише одне справжнє:
//
//   ↑   кнопка «нагору» на ГОЛОВНІЙ    ← справжня помилка
//   👤  посилання на кабінет           ← хибна тривога: title
//                                        ставить updateAccountIcon(),
//                                        просто асинхронно
//   ✕   очистити пошук                 ← поруч є «Скасувати» словами
//
// Кнопка «нагору» має aria-label="Нагору" на ДВАНАДЦЯТИ сторінках і
// не мала його рівно на одній — на головній. Тобто правило в проєкті
// вже було, просто застосували його нерівно. Рівно так само злетіла
// колись білизна заголовків: [[style-keyed-to-tag-breaks-on-rename]].
//
// Читач екрана озвучує голий символ ім'ям символа й англійською:
// «upwards arrow», «multiplication x». На українській сторінці це не
// назва дії, а опис картинки.
//
// ЩО САМЕ ПЕРЕВІРЯЄМО
// -------------------
// Ім'я рахуємо так, як його рахує браузер: aria-label →
// aria-labelledby → власний текст → title → alt вкладеної картинки.
// І питаємо одне: чи є в ньому бодай одна літера або цифра. Емодзі,
// стрілка й хрестик — ні.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// Кореневі сторінки — вони ж шаблони для 227 згенерованих.
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

// Керування, яким ім'я дає JS уже після завантаження. Їх НЕ
// пропускаємо мовчки: для кожного перевіряємо, що той, хто його
// називає, на місці. Інакше пропуск перетворився б на дірку, крізь
// яку колись поїде безіменна кнопка.
const NAMED_AT_RUNTIME = [
    ["accountLink", "assets/js/supabase-client.js", /link\.title = user/],
    ["cartIconLink", "assets/js/common.js", /link\.setAttribute\("aria-label",\s*\n?\s*count === 0/],
    ["favIconLink", "assets/js/common.js", /aria-label/],
    // Порожні в розмітці й наповнюються з даних товару: назва
    // залежить від того, є в товару Reels чи ні, і скільки всього
    // відгуків. Ставити щось у розмітку означало б другу правду.
    ["productInstagramBtn", "assets/js/product.js", /getElementById\("productInstagramBtn"\)/],
    ["reviewsMore", "assets/js/reviews.js", /moreBtn\.textContent = "Показати всі "/]
];

const READABLE = /[\p{L}\p{N}]/u;

function accName(doc, el) {

    const label = el.getAttribute("aria-label");
    if (label && label.trim()) return label.trim();

    const by = el.getAttribute("aria-labelledby");
    if (by) {
        const text = by.split(/\s+/)
            .map(id => doc.getElementById(id))
            .filter(Boolean)
            .map(e => e.textContent.trim())
            .join(" ");
        if (text.trim()) return text.trim();
    }

    const own = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (own) return own;

    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim();

    const img = el.querySelector("img[alt]");
    if (img && img.getAttribute("alt").trim()) return img.getAttribute("alt").trim();

    return "";

}

const runtimeIds = new Set(NAMED_AT_RUNTIME.map(([id]) => id));

const безімені = [];
let керувань = 0;

PAGES.forEach(rel => {

    const doc = new JSDOM(fs.readFileSync(path.join(ROOT, rel), "utf8")).window.document;

    doc.querySelectorAll("button, a[href], [role=button]").forEach(el => {

        // Сховане від читача екрана або вийняте з обходу клавішею —
        // не керування, а оздоба.
        if (el.getAttribute("aria-hidden") === "true") return;
        if (el.getAttribute("tabindex") === "-1") return;

        керувань++;

        if (runtimeIds.has(el.id)) return;

        if (!READABLE.test(accName(doc, el))) {
            безімені.push(`${rel}: ${el.tagName.toLowerCase()}` +
                `${el.id ? "#" + el.id : ""}` +
                `${el.className ? "." + String(el.className).split(/\s+/)[0] : ""}` +
                ` «${(el.textContent || "").trim().slice(0, 10)}»`);
        }

    });

});

console.log("\n[1] Кожне керування назване словами");
{
    console.log(`  · перевірено керувань: ${керувань} на ${PAGES.length} сторінках`);

    check("є що перевіряти", керувань > 100, String(керувань));

    check("немає керувань без читабельного імені",
        безімені.length === 0, безімені.slice(0, 8).join("; "));
}

console.log("\n[2] Ті, кого називає JS, справді мають, кому їх назвати");
{
    NAMED_AT_RUNTIME.forEach(([id, file, re]) => {

        const src = fs.readFileSync(path.join(ROOT, file), "utf8");

        check(`${id} — ім'я ставить ${path.basename(file)}`, re.test(src),
            "якщо код перейменували, пропуск у [1] став дірою");

    });
}

console.log("\n[3] Кнопка «нагору» названа на ВСІХ сторінках, де вона є");
{
    // Окремо, бо саме цей випадок і знайшовся: правило діяло на 12
    // сторінках із 13. Перевірка [1] це ловить, але назвати симптом
    // прямо — означає, що наступного разу причина буде видна одразу.
    const має = PAGES.filter(f =>
        fs.readFileSync(path.join(ROOT, f), "utf8").includes('id="scrollTop"'));

    const без = має.filter(f => {
        const doc = new JSDOM(fs.readFileSync(path.join(ROOT, f), "utf8")).window.document;
        const btn = doc.getElementById("scrollTop");
        return btn && !READABLE.test(accName(doc, btn));
    });

    check(`кнопка є на ${має.length} сторінках і скрізь названа`,
        без.length === 0, без.join(", "));
}

console.log("\n[4] Кнопки, які малює JS, — теж названі");
{
    // СЛІПА ПЛЯМА ПЕРШОЇ ВЕРСІЇ ЦЬОГО НАБОРУ.
    //
    // Розділ [1] розбирає готові сторінки — і не бачить нічого, що
    // з'являється вже в браузері. Саме там і сидів «✕» у накладці
    // пошуку: кнопку малює common.js, у жодному .html її немає.
    // Знайшов я його не тестом, а руками на проді.
    //
    // Тут інакше не можна: щоб побачити цю кнопку в DOM, треба
    // відкрити накладку. Тому дивимось на шаблони в коді — і питаємо
    // те саме, що й розділ [1]: чи є в імені літера або цифра.
    const DIR = path.join(ROOT, "assets/js");

    const BUTTON = /<button\b([^>]*)>([\s\S]{0,200}?)<\/button>/g;

    let кнопок = 0;
    const безімені = [];

    fs.readdirSync(DIR).filter(f => f.endsWith(".js")).forEach(file => {

        const src = fs.readFileSync(path.join(DIR, file), "utf8");

        BUTTON.lastIndex = 0;

        let m;

        while ((m = BUTTON.exec(src)) !== null) {

            кнопок++;

            const attrs = m[1];

            if (/aria-label\s*=|aria-labelledby\s*=|title\s*=/.test(attrs)) continue;

            // Підпис підставляється — значить, там слова з даних.
            if (m[2].includes("${")) continue;

            const text = m[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

            if (!READABLE.test(text)) безімені.push(`${file}: «${text}» ${attrs.trim().slice(0, 50)}`);

        }

    });

    console.log(`  · кнопок у шаблонах JS: ${кнопок}`);

    check("є що перевіряти", кнопок > 20, String(кнопок));

    check("жодна не лишилась без імені",
        безімені.length === 0, безімені.slice(0, 5).join("; "));
}

console.log("\n[5] Підказка в полі — не назва поля");
{
    // Placeholder зникає, щойно людина почала друкувати, а частина
    // читачів екрана не озвучує його взагалі. Для головного поля
    // пошуку на сайті цього замало — воно мусить називатись саме.
    const common = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8");

    const input = (common.match(/<input[^>]*id="globalSearchInput"[\s\S]{0,200}?>/) || [""])[0];

    check("поле пошуку знайдено в накладці", Boolean(input));

    check("поле пошуку має власну назву, а не лише підказку",
        /aria-label\s*=\s*"[^"]*[\p{L}\p{N}]/u.test(input),
        input.replace(/\s+/g, " ").slice(0, 100));

    // Саму накладку теж мусить бути як назвати: вікно без назви читач
    // оголошує просто «діалог».
    check("накладка пошуку названа",
        /overlay\.setAttribute\("aria-label"/.test(common));
}

console.log(failures ? `\n✗ Провалено: ${failures}` : "\n✓ Усе зелено");
process.exit(failures ? 1 : 0);
