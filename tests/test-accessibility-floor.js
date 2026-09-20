// Якісний мінімум: рух і фокус.
//
// ЧОМУ ЦЕ ОКРЕМИЙ НАБІР
// ----------------------
// Це не про смак і не про «гарніше». Це про те, чи можна сайтом
// користуватись, якщо ви не тримаєте мишу або якщо рух на екрані
// викликає нудоту. Такі речі легко відкладати — вони не видні на
// скріншотах і на них не скаржаться, бо люди просто йдуть.
//
// ЩО БУЛО ЗМІРЯНО ДО ВИПРАВЛЕННЯ
// -------------------------------
//   130 переходів і 11 анімацій у стилях
//   prefers-reduced-motion покривав РІВНО ОДНЕ правило
//   :focus-visible — чотири правила на весь сайт
//   12 разів outline:none, з них двічі без жодної заміни
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const raw = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[1] Системну настройку «менше руху» враховано");
{
    // Люди вмикають її не з примхи: рух на екрані викликає нудоту при
    // вестибулярних розладах, мігрені, після сотрясіння.
    const blocks = [...raw.matchAll(/@media \(prefers-reduced-motion: reduce\)\{([\s\S]*?)\n\}/g)]
        .map(m => m[1]);

    check("блок є", blocks.length > 0);

    const global = blocks.find(b => /\*,/.test(b) && /\*::before/.test(b));

    check("покриває ВСІ елементи, а не окремі правила", !!global);

    check("прибирає переходи", /transition-duration:\.01ms !important/.test(global || ""));
    check("прибирає анімації", /animation-duration:\.01ms !important/.test(global || ""));

    // Плавна прокрутка теж рух: автоскрол до результатів фільтра
    // смикає екран сильніше за будь-яку анімацію.
    check("прибирає плавну прокрутку", /scroll-behavior:auto !important/.test(global || ""));

    // 0.01ms, а не 0: на transitionend і animationend тримається
    // частина логіки, і з нулем вона зависла б.
    check("не нуль, щоб події спрацьовували",
        !/transition-duration:0s !important/.test(global || ""));
}

console.log("\n[2] Фокус із клавіатури видно");
{
    // :focus-visible, а не :focus: рамка з'являється при керуванні
    // клавіатурою й не з'являється при клацанні мишею. Саме через це
    // старий :focus і прибирали через outline:none — він шумів.
    const base = raw.match(/a:focus-visible,[\s\S]{0,400}?\}/);

    check("є базове правило", !!base);

    const body = base ? base[0] : "";

    ["a", "button", "input", "select", "textarea", "summary"].forEach(tag =>
        check(`${tag} покритий`, new RegExp(`${tag}:focus-visible`).test(body)));

    check("самописні кнопки теж", /\[role="button"\]:focus-visible/.test(body));
    check("рамка помітна", /outline:3px solid/.test(body));
    check("рамка не притиснута до краю", /outline-offset:2px/.test(body));

    // На темних смугах синя рамка тоне.
    check("на темному тлі рамка світла",
        /\.footer a:focus-visible[\s\S]{0,200}outline-color:#fff/.test(raw));
}

console.log("\n[3] Прибраний фокус завжди чимось замінений");
{
    // outline:none сам по собі не порушення — його ставлять, щоб
    // намалювати свою рамку. Порушення це коли заміни немає: людина
    // натискає Tab і не бачить, де вона.
    const stripped = [...css.matchAll(/([^{}]+)\{([^}]*outline:\s*none[^}]*)\}/g)];

    check(`правил з outline:none — ${stripped.length}`, stripped.length > 0);

    // Прийнятні заміни: своя рамка, тінь або колір межі.
    const naked = stripped
        .filter(m => !/box-shadow|border-color|border-bottom-color|border:/.test(m[2]))
        .map(m => m[1].trim().replace(/\s+/g, " "));

    // Два винятки, перевірені вручну:
    //   .search-overlay-input-wrap input — рамку малює обгортка через
    //     :focus-within, тож на самому полі вона зайва;
    //   .lightbox-video — відео, фокус на ньому не веде нікуди.
    const known = [
        ".search-overlay-input-wrap input:focus",
        ".lightbox-video"
    ];

    const unexpected = naked.filter(sel => !known.some(k => sel.startsWith(k)));

    check("немає елементів без видимого фокуса", unexpected.length === 0,
        unexpected.slice(0, 3).join(", "));

    // Виняток мусить бути справжнім: обгортка справді малює рамку.
    check("обгортка пошуку показує фокус",
        /\.search-overlay-input-wrap:focus-within\{[\s\S]{0,200}(border-color|box-shadow)/.test(css));
}

console.log("\n[4] Наведення не «залипає» на дотику");
{
    // На тачскріні :hover лишається після дотику, доки не торкнешся
    // чогось іншого. Ефекти, обгорнуті в @media (hover:hover), цього
    // не роблять.
    const guarded = (css.match(/@media \(hover:hover\)/g) || []).length;

    check(`ефектів наведення в медіазапиті — ${guarded}`, guarded > 50);

    // Найпомітніші місця: картка товару й кнопки.
    check("збільшення фото в картці — лише для миші",
        /@media \(hover:hover\)[\s\S]{0,600}\.product-card:hover/.test(css)
        || /@media \(hover:hover\) and \(pointer:fine\)[\s\S]{0,900}scale/.test(css));
}

console.log("\n[5] Селектори не роздвоюються");
{
    // ЧОМУ ЦЕ ВАЖЛИВО
    // ----------------
    // Правки зручно дописувати в кінець файлу: нове правило перекриває
    // старе позицією, і нічого не треба шукати. Але так селектор
    // виявляється оголошеним двічі, і працює це ЛИШЕ доки порядок
    // рядків не змінився. Переставили блок, відсортували файл,
    // зібрали інструментом — і сайт тихо повертається до старих
    // значень, без жодної помилки в консолі.
    //
    // За час роботи так накопичилось 12 роздвоєних селекторів, з них
    // два — дослівні копії. Тепер значення живуть там, де селектор
    // оголошений.
    //
    // Рахуємо по позиції в рядку: селектор без відступу — поза
    // медіазапитом (усередині @media правила зсунуті вправо).
    // Дубль сам по собі ще не поломка: два правила можуть описувати
    // РІЗНІ властивості одного елемента — тоді порядок не має значення.
    // Небезпечний лише той, що перевизначає ТЕ САМЕ: він працює
    // позицією і зникне при першому ж переміщенні блока.
    const blocks = new Map();

    // Вирізаємо медіазапити ЗА ДУЖКАМИ, а не за відступом.
    //
    // Спершу я відрізняв «поза медіа» по відсутності відступу — і
    // отримав хибне срабатывание: частина правил усередині @media
    // записана без відступу, і перевірка вважала їх дублями
    // зовнішніх.
    const outside = (() => {

        let out = "";
        let depth = 0;
        let inMedia = 0;

        for (let i = 0; i < raw.length; i++) {

            const ch = raw[i];

            if (raw.startsWith("@media", i) && depth === 0) inMedia = 1;

            if (ch === "{") depth++;

            if (ch === "}") {

                depth--;

                if (inMedia && depth === 0) { inMedia = 0; continue; }

            }

            if (!inMedia) out += ch;

        }

        return out;

    })();

    const rule = /^([.#][A-Za-z][^{@\n]*?)\s*\{([^}]*)\}/gm;

    let m;

    while ((m = rule.exec(outside))) {

        const sel = m[1].trim();

        const props = [...m[2].replace(/\/\*[\s\S]*?\*\//g, "")
            .matchAll(/([a-z-]+)\s*:/g)].map(x => x[1]);

        if (!blocks.has(sel)) blocks.set(sel, []);

        blocks.get(sel).push(new Set(props));

    }

    const declared = [...blocks.entries()].filter(([, list]) => list.length > 1);

    check(`селекторів у файлі — ${blocks.size}`, blocks.size > 300);

    // Перетин властивостей між оголошеннями одного селектора.
    const clashing = declared.filter(([, list]) => {

        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                for (const prop of list[i]) {
                    if (list[j].has(prop)) return true;
                }
            }
        }

        return false;

    });

    check("жодне правило не перевизначає себе позицією",
        clashing.length === 0,
        clashing.slice(0, 5).map(([s]) => s).join(", "));

    // Дублі без перетину лишаємо: вони неохайні, але безпечні —
    // ламати робочу верстку заради косметики файлу не варто.
    check(`дублів без конфлікту — ${declared.length - clashing.length} (не поломка)`,
        true);
}

console.log("\n[6] Усі змінні кольорів існують");
{
    // СИМПТОМ
    // --------
    // Кнопку «Показати ще» не було видно — вона зʼявлялась лише при
    // наведенні. Виглядало як помилка стилів наведення, а насправді
    // навпаки: ЗВИЧАЙНИЙ стан не малювався.
    //
    // ПРИЧИНА
    // --------
    // background:var(--dark), а змінної --dark не існувало. Браузер не
    // знаходить значення й не малює нічого: фон лишався прозорим, а
    // текст білим — біле на білому. При наведенні фон ставав #fff, а
    // текст var(--dark) → теж не малювався, але сама рамка й тінь
    // робили кнопку помітною.
    //
    // Помилки в консолі при цьому НЕМАЄ: невідома змінна для CSS —
    // нормальна ситуація, а не збій. Тому перевірка потрібна тут.
    const declared = new Set();

    [...raw.matchAll(/:root\{([\s\S]*?)\n\}/g)].forEach(block => {
        [...block[1].matchAll(/(--[a-z0-9-]+)\s*:/g)].forEach(m => declared.add(m[1]));
    });

    check(`оголошено змінних — ${declared.size}`, declared.size > 10);

    // Частина змінних задається з JavaScript (кадрування фото, стилі
    // блоків з адмінки, картинки банерів) — їх у :root і не буде.
    const fromCode = new Set();

    const jsDir = path.join(ROOT, "assets/js");

    fs.readdirSync(jsDir).filter(f => f.endsWith(".js")).forEach(file => {
        [...fs.readFileSync(path.join(jsDir, file), "utf8")
            .matchAll(/(--[a-z0-9-]+)/g)].forEach(m => fromCode.add(m[1]));
    });

    // Коментарі не рахуємо: у них згадуються змінні як приклади того,
    // чого робити не варто.
    // Збираємо ЛИШЕ ті, у яких немає запасного значення.
    //
    // var(--bg-soft, #f7f7f9) — коректний запис: якщо змінної немає,
    // береться колір після коми. Такі вжитки не ламаються, і ругати
    // за них не варто. Небезпечний саме var(--x) без запасу: браузер
    // не знаходить значення й не малює НІЧОГО, без жодної помилки в
    // консолі. Саме так зникла кнопка «Показати ще».
    // ЗМІННА, ОГОЛОШЕНА В ТОМУ САМОМУ ПРАВИЛІ, ЗНИКНУТИ НЕ МОЖЕ.
    //
    // Так написані розміри заголовків: правило поруч оголошує власну
    // базу й тут-таки множить її на множник з адмінки —
    //
    //     .deal-head-text h2{
    //         --blk-title-base:30px;
    //         font-size:calc(var(--blk-title-base) * var(--blk-title-scale, 1));
    //     }
    //
    // Запасне значення тут було б ГІРШЕ за його відсутність: саме
    // запасне значення 1em і ховало помилку, через яку заголовок
    // акції падав із 42px до 16px. Хай краще правило зламається
    // помітно, ніж мовчки покаже не той розмір.
    const broken = new Set();

    [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].forEach(rule => {

        const body = rule[2];

        const own = new Set(
            [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));

        [...body.matchAll(/var\((--[a-z0-9-]+)\s*([,)])/g)].forEach(m => {

            if (m[2] !== ")") return;
            if (own.has(m[1]) || declared.has(m[1]) || fromCode.has(m[1])) return;

            broken.add(m[1]);

        });

    });

    check("жодна змінна не втрачена", broken.size === 0, [...broken].join(", "));

    // Окремо про --dark: саме на ній зламалась кнопка.
    check("--dark оголошено", declared.has("--dark"));

    // І кнопка мусить мати видимий фон.
    const button = (raw.match(/\.pagination-more\{[^}]*\}/) || [""])[0];

    check("у кнопки є фон", /background:var\(--dark\)/.test(button));
    check("і контрастний текст", /color:#fff/.test(button));
}

console.log("\n[7] Текст у полі видно на тому тлі, де поле стоїть");
{
    // ЩО БУЛО НЕ ТАК — І ЧОМУ ЦЕ РАХУЄТЬСЯ, А НЕ ВИЧИТУЄТЬСЯ.
    //
    // Поле підписки в темній смузі мало color:inherit. Решта його
    // правил писались під темну поверхню: рамка напівпрозоро-біла,
    // підказка rgba(255,255,255,.45). А колір тексту лишили
    // успадкованим — тобто залежним від того, чи задасть його
    // предок. Ні .newsletter, ні footer кольору не задають (обидва
    // лише фарбують тло), тож inherit доходив до body й давав
    // --dark: rgb(17,24,39) на тлі rgb(17,24,39).
    //
    // Контраст один до одного. Не «темнувато» — введеного не видно
    // ВЗАГАЛІ. Підказку було видно, бо їй колір заданий, і поле
    // виглядало робочим рівно доти, доки в нього не почнуть писати.
    //
    // Очима таке не ловиться: щоб побачити, треба саме ввести текст.
    // Тому тут рахується справжній контраст за WCAG, а не шукається
    // рядок у файлі.
    const hex = name => {

        const found = raw.match(new RegExp("\\" + name + ":\\s*(#[0-9a-f]{3,8})", "i"));

        return found ? found[1] : null;

    };

    const rgb = value => {

        let text = String(value || "").trim().replace("#", "");

        if (text.length === 3) text = text.split("").map(c => c + c).join("");

        return [0, 2, 4].map(i => parseInt(text.slice(i, i + 2), 16));

    };

    // Напівпрозоре тло поля лежить НА кольорі смуги — для контрасту
    // важливий саме результат накладання, а не значення в файлі.
    const over = (top, alpha, bottom) =>
        top.map((c, i) => Math.round(c * alpha + bottom[i] * (1 - alpha)));

    const relative = channel => {

        const v = channel / 255;

        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

    };

    const luminance = color =>
        0.2126 * relative(color[0]) + 0.7152 * relative(color[1]) + 0.0722 * relative(color[2]);

    const ratio = (a, b) => {

        const light = Math.max(luminance(a), luminance(b));
        const dark = Math.min(luminance(a), luminance(b));

        return (light + 0.05) / (dark + 0.05);

    };

    const primary = hex("--primary");

    check("колір темної смуги знайдено", Boolean(primary), primary);

    const body = (raw.match(/\n\.subscribe-row input\{([^}]*)\}/) || [])[1] || "";

    check("правило поля підписки знайдено", Boolean(body));

    const declared = (body.match(/(?:^|;)\s*color:\s*([^;]+)/) || [])[1];

    // inherit тут — не колір, а відмова від рішення: значення
    // прийде звідкись, і звідки саме — залежить від сторінки.
    check("колір тексту заданий, а не успадкований",
        Boolean(declared) && declared.trim() !== "inherit",
        declared);

    if (primary && declared && declared.trim() !== "inherit") {

        const band = rgb(primary);

        const fillAlpha = Number((body.match(/background:rgba\(255,255,255,([\d.]+)\)/) || [])[1] || 0);

        const field = over([255, 255, 255], fillAlpha, band);

        const text = rgb(declared.trim());

        const value = ratio(text, field);

        // 4.5:1 — поріг WCAG AA для звичайного тексту. Введена
        // пошта — саме звичайний текст, і перечитують її уважно:
        // одна помилкова літера означає лист, який не прийде.
        check(`контраст тексту в полі ${value.toFixed(1)}:1`, value >= 4.5,
            `${declared.trim()} на ${field.join(",")}`);

    }

    // Те саме правило для всього файлу: колір поля форми не мусить
    // залежати від того, що задасть предок.
    const inheriting = [...raw.matchAll(/\n([^{}\n]*input[^{}\n]*)\{([^}]*)\}/g)]
        .filter(m => /(?:^|;)\s*color:\s*inherit/.test(m[2]))
        .map(m => m[1].trim());

    check("жодне поле не успадковує колір тексту",
        inheriting.length === 0, inheriting.join(" | "));
}

console.log("\n[8] Escape закриває будь-яке вікно");
{
    // ЧОМУ ЦЕ ТУТ, У НАБОРІ ПРО КЛАВІАТУРУ
    //
    // Escape — єдиний спосіб вийти з вікна, не цілячись мишею. Без
    // нього лишаються хрестик у кутку й тло: на телефоні тло це
    // смужка в кілька пікселів з боків, а для вікна-підтвердження
    // («Видалити адресу?») цілитись доводиться поруч із кнопкою,
    // яка видаляє.
    //
    // ЩО БУЛО ЗМІРЯНО. Escape слухали пошук, мобільне меню,
    // кошик-попап, вибір відділення Нової пошти, причина відмови,
    // лайтбокс і випадні списки. Не слухали рівно три вікна — і всі
    // три на однаковій розмітці .modal-overlay. Тобто правило на
    // сайті було, просто не діставалось до цієї розмітки.
    const { JSDOM } = require("jsdom");

    const common = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8");

    // Вікна беремо З РЕАЛЬНИХ сторінок, а не вигадуємо розмітку:
    // інакше перевірка стерегла б макет, якого на сайті немає.
    const pages = ["product.html", "account.html", "checkout.html"];

    const modals = [];

    pages.forEach(page => {

        const html = fs.readFileSync(path.join(ROOT, page), "utf8");

        [...html.matchAll(/<div id="(\w+)" class="modal-overlay" hidden>/g)]
            .forEach(m => modals.push({ page, id: m[1] }));

    });

    check(`вікон .modal-overlay на сайті — ${modals.length}`, modals.length >= 4,
        modals.map(m => m.id).join(", "));

    // Кожне мусить мати хрестик: саме його й «натискає» Escape, щоб
    // спрацювало ВЛАСНЕ закриття вікна, а не голе hidden = true повз
    // нього (у checkout там ще скидається запам'ятоване посилання).
    modals.forEach(({ page, id }) => {

        const html = fs.readFileSync(path.join(ROOT, page), "utf8");
        const start = html.indexOf(`<div id="${id}" class="modal-overlay" hidden>`);
        const card = html.slice(start, start + 1200);

        check(`${id}: має кнопку .modal-close`, /class="modal-close"/.test(card));

    });

    const fn = common.match(/function closeTopModal\(\)[\s\S]*?\n}\n/);

    check("спільне закриття знайдено", Boolean(fn));

    check("його викликає саме Escape",
        /if \(event\.key === "Escape"\) closeTopModal\(\);/.test(common));

    // Поведінка — на справжньому DOM, з двома вікнами одразу.
    const dom = new JSDOM(`<!doctype html><body>
        <div id="first" class="modal-overlay" hidden>
            <div class="modal-card">
                <button class="modal-close">✕</button>
            </div>
        </div>
        <div id="second" class="modal-overlay" hidden>
            <div class="modal-card">
                <button class="modal-close">✕</button>
            </div>
        </div>
        <div id="noButton" class="modal-overlay" hidden><div class="modal-card"></div></div>
        </body>`, { runScripts: "outside-only" });

    const { window } = dom;
    const doc = window.document;

    window.eval(fn[0]);
    window.eval("window.__close = closeTopModal;");

    // Кожне вікно закривається СВОЇМ обробником — перевіряємо, що
    // Escape кличе саме його, а не ставить hidden повз нього.
    let clicked = [];
    doc.querySelectorAll(".modal-close").forEach(btn => {
        btn.addEventListener("click", () => {
            clicked.push(btn.closest(".modal-overlay").id);
            btn.closest(".modal-overlay").hidden = true;
        });
    });

    check("закритих вікон немає — Escape нічого не чіпає",
        window.__close() === false);

    doc.getElementById("first").hidden = false;
    window.__close();

    check("відкрите вікно закривається", doc.getElementById("first").hidden === true);
    check("і саме через власну кнопку", clicked.join(",") === "first", clicked.join(","));

    // Два одночасно — закривається верхнє, нижнє лишається.
    clicked = [];
    doc.getElementById("first").hidden = false;
    doc.getElementById("second").hidden = false;
    window.__close();

    check("з двох закривається верхнє", clicked.join(",") === "second", clicked.join(","));
    check("нижнє лишається відкритим", doc.getElementById("first").hidden === false);

    // Вікно без хрестика все одно мусить закритись: обіцянка
    // «Escape завжди виводить» не має винятків.
    doc.getElementById("first").hidden = true;
    doc.getElementById("second").hidden = true;
    doc.getElementById("noButton").hidden = false;
    window.__close();

    check("вікно без хрестика теж закривається",
        doc.getElementById("noButton").hidden === true);
}

console.log("\n[9] Іконки в шапці називають себе словами");
{
    // ЩО ЧУЄ ЛЮДИНА, ЯКА НЕ БАЧИТЬ ШАПКИ
    //
    // Іконки — голі емодзі: 🔍 👤 ❤ 🛒. Оку цього досить, а екранний
    // читач озвучує символ його ІМЕНЕМ і завжди англійською:
    // «magnifying glass tilted left», «black heart». На українській
    // сторінці це опис картинки, а не назва розділу. Біля серця й
    // візка ще й самотнє число з лічильника: «black heart 0».
    //
    // Шапка стоїть на всіх сторінках сайту, тож ціна помилки —
    // весь сайт одразу.
    const { JSDOM } = require("jsdom");

    const common = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8");

    // Вихідні сторінки; решта 136 збираються з product.html і
    // catalog.html, тож перевіряємо і їх — окремо, нижче.
    const roots = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const withHeader = roots.filter(f =>
        fs.readFileSync(path.join(ROOT, f), "utf8").includes('id="searchBtn"'));

    check(`вихідних сторінок із шапкою — ${withHeader.length}`, withHeader.length >= 18);

    const unlabelled = withHeader.filter(f => {
        const html = fs.readFileSync(path.join(ROOT, f), "utf8");
        const btn = (html.match(/<button id="searchBtn"[^>]*>/) || [""])[0];
        return !/aria-label="[^"]+"/.test(btn);
    });

    check("кнопка пошуку підписана скрізь", unlabelled.length === 0,
        unlabelled.join(", "));

    // Збірка розносить шапку по сторінках товарів і таксономії —
    // якщо шаблон підписано, підписані й вони.
    const built = ["p", "brands", "categories"]
        .map(dir => path.join(ROOT, dir))
        .filter(dir => fs.existsSync(dir))
        .flatMap(dir => fs.readdirSync(dir)
            .map(sub => path.join(dir, sub, "index.html"))
            .filter(file => fs.existsSync(file)))
        .slice(0, 12);

    const builtBad = built.filter(file => {
        const btn = (fs.readFileSync(file, "utf8").match(/<button id="searchBtn"[^>]*>/) || [""])[0];
        return btn && !/aria-label="[^"]+"/.test(btn);
    });

    check(`зібрані сторінки теж (перевірено ${built.length})`,
        built.length > 0 && builtBad.length === 0, builtBad.join(", "));

    // Лічильники: підпис мусить нести КІЛЬКІСТЬ. aria-label перебиває
    // вміст елемента, тож без числа в самому підписі воно зникло б
    // із озвучення зовсім — стало б гірше, ніж було.
    ["updateCartCounter", "updateFavoriteCounter"].forEach(name => {

        const fn = (common.match(new RegExp("function " + name + "\\(\\)[\\s\\S]*?\\n}\\n")) || [""])[0];

        check(`${name}: ставить підпис`, /setAttribute\("aria-label"/.test(fn));
        check(`${name}: у підписі є число`, /\$\{count\}/.test(fn));
        check(`${name}: слово відмінюється спільним помічником`,
            /pluralProducts\(count\)/.test(fn));

    });

    // І сама поведінка — на DOM із реальної шапки index.html.
    const header = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const icons = header.slice(header.indexOf('<div class="header-icons">'),
        header.indexOf("</header>"));

    const dom = new JSDOM(`<!doctype html><body>${icons}</body>`,
        { runScripts: "outside-only" });

    const { window } = dom;

    window.eval((common.match(/function plural\(count[\s\S]*?\n}\n/) || [""])[0]);
    window.eval((common.match(/function pluralProducts\(count[\s\S]*?\n}\n/) || [""])[0]);
    window.eval((common.match(/function updateCartCounter\(\)[\s\S]*?\n}\n/) || [""])[0]);
    window.eval("window.__cart = updateCartCounter;");

    const label = () => window.document.getElementById("cartIconLink").getAttribute("aria-label");

    [[0, "Кошик порожній"],
     [1, "Кошик, 1 товар"],
     [3, "Кошик, 3 товари"],
     [11, "Кошик, 11 товарів"],
     [21, "Кошик, 21 товар"]].forEach(([n, expected]) => {

        window.eval(`window.getCart = () => new Array(${n}).fill(0);`);
        window.__cart();

        check(`${n} → «${expected}»`, label() === expected, label());

    });
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
