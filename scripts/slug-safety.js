// Перевірка, що ім'я файлу-запису в папкових колекціях Decap CMS
// (data/products, data/promotions, data/categories, data/collections,
// data/promo-popups) можна безпечно використати як slug.
//
// НАВІЩО ЦЕ Є (реальний баг, серпень 2026):
// у data/promotions лежав файл з іменем
//   #U0431#U0456#U043b#U044c#U0448#U0435-…-#U043b#U0456#U0442#U0430.json
// Це зіпсована копія кириличного
//   більше-стилю-для-яскравого-літа.json —
// так unzip перейменовує UTF-8 імена, коли розпаковує архів у системі
// без UTF-8 локалі (кожна кирилична літера стає #U04xx). Файл потрапив
// у репозиторій і зламав адмінку:
//
//   • Decap будує адресу запису як
//     index.html#/collections/promotions/entries/<slug>.
//     У slug є свої «#», а браузер ріже адресу по ПЕРШОМУ «#», тож
//     роутер бачить порожній slug → CMS тягне неіснуючий файл →
//     JSON.parse("") → "SyntaxError: Unexpected end of JSON input"
//     (backend.js:742, json.js:3) і редактор відкривається порожнім;
//   • після «назад» у списку лишався фантомний запис без назви — «-»
//     (адреса .../entries/ з порожнім slug). Файлу такого не існує,
//     він зникає після перезавантаження сторінки, але лякає;
//   • на сайті посилання promo?id=<slug> так само обривалось на «#».
//
// Кирилиця в іменах сама по собі НЕ проблема (браузер її кодує) —
// ламають адресу саме службові символи. Тому правило нижче пропускає
// будь-які літери й цифри будь-якої мови, але забороняє символи, що
// мають спеціальне значення в URL, та характерний слід зіпсованого
// розпакування.

// характерний слід mangling'а unzip/Windows: #U0431, #U04AF тощо
const MANGLED_RE = /#U[0-9A-Fa-f]{4}/;

// дозволяємо: будь-яка літера (\p{L} — і латиниця, і кирилиця),
// будь-яка цифра, дефіс, підкреслення, крапка
const ALLOWED_CHAR_RE = /[\p{L}\p{N}._-]/u;

/**
 * Повертає текст проблеми або null, якщо зі slug усе гаразд.
 * @param {string} slug — ім'я файлу БЕЗ розширення .json
 */
function slugProblem(slug) {

    if (typeof slug !== "string" || slug === "") {
        return "порожнє ім'я файлу";
    }

    if (MANGLED_RE.test(slug)) {
        return "ім'я зіпсоване при розпакуванні ZIP — кирилиця перетворилась на послідовності #U04xx; " +
               "розпаковуйте архів з UTF-8 локаллю (unzip -O UTF-8) або скачуйте файли з GitHub напряму";
    }

    const bad = [...new Set([...slug].filter(ch => !ALLOWED_CHAR_RE.test(ch)))];

    if (bad.length) {
        const shown = bad
            .map(ch => (ch.trim() === "" ? "пробіл/переніс рядка" : `"${ch}"`))
            .join(", ");
        return `в імені є символи, які ламають адресу запису: ${shown}`;
    }

    if (slug.startsWith(".")) {
        return "ім'я починається з крапки";
    }

    if (slug.includes("..")) {
        return 'ім\'я містить ".."';
    }

    return null;

}

/**
 * Фільтрує список .json-файлів колекції, лишаючи тільки безпечні.
 * Небезпечні НЕ потрапляють у зібраний data/*.json — тобто на сайті
 * не з'явиться битого посилання, — але про кожен друкується помилка
 * в лог (і анотація GitHub Actions), щоб проблему було видно.
 *
 * @param {string[]} files — імена файлів (з .json)
 * @param {string} collection — назва колекції для повідомлення
 * @returns {{ safe: string[], skipped: {file: string, reason: string}[] }}
 */
function filterSafeEntryFiles(files, collection) {

    const safe = [];
    const skipped = [];

    files.forEach(file => {

        const slug = file.replace(/\.json$/, "");
        const reason = slugProblem(slug);

        if (reason) {

            skipped.push({ file, reason });

            // ::error:: — GitHub Actions підсвітить це в підсумку прогону
            console.error(`::error::${collection}/${file} — ${reason}. Файл пропущено, перейменуйте або видаліть його.`);
            console.error(`❌ ПРОПУЩЕНО (небезпечне ім'я): ${collection}/${file} — ${reason}`);

            return;

        }

        safe.push(file);

    });

    return { safe, skipped };

}

module.exports = { slugProblem, filterSafeEntryFiles, MANGLED_RE };
