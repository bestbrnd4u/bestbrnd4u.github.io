// Те, чого не видно, не має ловити кліки.
//
// ЩО СТАЛОСЬ
// -----------
// Тост («Товар додано в кошик», «Оберіть розмір» — тридцять різних
// повідомлень) ховався прозорістю: opacity:0. Око його не бачить,
// миша — бачить. Елемент лишався на місці: position:fixed у правому
// нижньому куті, z-index 9999, тобто над усім на сторінці.
//
// Створюється він при ПЕРШОМУ повідомленні (showToast у common.js) і
// далі живе в сторінці до кінця візиту. Тобто після будь-якого
// «Товар додано в кошик» куток екрана мовчки переставав натискатись —
// і нічого на екрані цього не пояснювало.
//
// Заміряно на проді 21.09.2026, вікно 1280×900: elementFromPoint у
// центрі схованого тоста віддавав сам тост, а під ним була картка
// товару в каталозі. На телефоні 375 px тост завширшки 219 px — це
// 58% ширини екрана просто над липкою кнопкою «Купити».
//
// ЧОМУ НАБІР ПЕРЕВІРЯЄ ПРАВИЛО, А НЕ ОДИН СЕЛЕКТОР
// -------------------------------------------------
// Таких накладок у стилях сім, і шість із них зроблені правильно —
// причому .top-notice стоїть у файлі ПРЯМО ПІД .toast і має все, чого
// тому бракувало. Тобто це не задум, а недогляд, і повторити його
// легко. Тому тут закріплене саме правило, а не полагоджений випадок.
//
// ПРАВИЛО
// --------
// Якщо елемент position:fixed ховається через opacity:0, він мусить
// ще й вийти з-під миші — одним із трьох способів:
//
//   1. pointer-events:none — лишається на місці, але прозорий для
//      натискань (так роблять .toast, .top-notice, .scroll-top);
//   2. visibility:hidden — браузер не перевіряє його при натисканні
//      (так робить .mobile-nav-backdrop, і там це ще й потрібно для
//      плавного згасання);
//   3. окреме правило [hidden]{display:none} — елемент зникає з
//      розкладки цілком (так робить .lightbox).
//
// Будь-який із трьох годиться. Жодного — і на сторінці з'являється
// невидима пляма, яка їсть натискання.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const raw = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");

// Коментарі геть: у них самих трапляється і «opacity:0», і
// «pointer-events» — саме через це подібні набори вже раз червоніли
// на власному тексті.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(m => ({ sel: m[1].trim().replace(/\s+/g, " "), body: m[2] }));


console.log("\n[1] Стилі взагалі розібрались");
{
    check(`правил знайдено — ${rules.length}`, rules.length > 500, rules.length);

    // Якщо розбір раптом перестане знаходити накладки, набір стане
    // зеленим і порожнім — найгірший стан для тесту.
    check("серед них є position:fixed",
        rules.some(r => /position\s*:\s*fixed/.test(r.body)));
}


console.log("\n[2] Жодна прозора накладка не ловить кліки");
{
    const invisible = rules.filter(r =>
        /position\s*:\s*fixed/.test(r.body)
        && /opacity\s*:\s*0\s*[;}]/.test(r.body));

    // Сім накладок на 21.09.2026. Число не закріплюємо — нових
    // додаватимуть; закріплюємо те, що вони знайдені.
    check(`накладок, схованих прозорістю — ${invisible.length}`,
        invisible.length >= 5, invisible.length);

    const offenders = invisible.filter(rule => {

        if (/pointer-events\s*:\s*none/.test(rule.body)) return false;
        if (/visibility\s*:\s*hidden/.test(rule.body)) return false;

        // Третій спосіб — сусіднє правило, яке прибирає елемент із
        // розкладки. Шукаємо його за першим селектором групи.
        const base = rule.sel.split(",")[0].trim();

        return !rules.some(other =>
            other.sel.startsWith(base + "[hidden]")
            && /display\s*:\s*none/.test(other.body));

    });

    check("кожна або не ловить кліки, або зникає з розкладки",
        offenders.length === 0,
        offenders.map(r => r.sel).join(", "));
}


console.log("\n[3] Сам тост — той, з якого все почалось");
{
    const toast = rules.find(r => r.sel === ".toast");

    check("правило .toast на місці", Boolean(toast));

    check("тост не ловить кліки", /pointer-events\s*:\s*none/.test(toast ? toast.body : ""));

    // none і в показаному стані теж — на відміну від сусіднього
    // .top-notice, якому pointer-events повертають у .show.
    //
    // Причина проста: у тості немає нічого, на що можна натиснути, —
    // сам лише текст (showToast ставить textContent і більше нічого,
    // жодного обробника на #toast у коді немає). А от перекрити він
    // може багато: чотири секунди показу — це рівно той час, коли
    // людина тягнеться до кнопки, яку тост і затуляє.
    const shown = rules.find(r => r.sel === ".toast.show");

    check("і в показаному стані теж не ловить",
        !shown || !/pointer-events\s*:\s*auto/.test(shown.body),
        shown && shown.body.replace(/\s+/g, " ").trim());

    // Якщо на тост колись повісять обробник, перевірка вище стане
    // неправильною — і краще дізнатись про це тут.
    const js = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");

    check("на тост ніхто не вішає обробник",
        !/toast\.addEventListener/.test(js));
}


console.log("\n[4] Сусіди, з яких треба було брати приклад");
{
    // .top-notice лежить у файлі одразу під .toast і робить усе як
    // треба. Якщо це колись приберуть, набір має сказати.
    [".top-notice", ".scroll-top"].forEach(name => {

        const rule = rules.find(r => r.sel === name);

        check(`${name}: прозорий стан не ловить кліки`,
            rule && /pointer-events\s*:\s*none/.test(rule.body),
            rule ? "немає pointer-events" : "правила немає");

    });

    const lightbox = rules.find(r => r.sel === ".lightbox[hidden]");

    check(".lightbox[hidden] прибирає елемент із розкладки",
        lightbox && /display\s*:\s*none/.test(lightbox.body));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
