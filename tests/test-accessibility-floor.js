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

console.log("\n[10] Фокус заходить у вікно й повертається з нього");
{
    // ЩО БУЛО НЕ ТАК. Вікно відкривається, а курсор лишається там,
    // де був: на кнопці «Таблиця розмірів», на «Додати адресу». Далі
    // Tab веде не по вікну, а по сторінці ПІД ним — по посиланнях,
    // які затулені затемненням і яких людина не бачить. Для
    // екранного читача вікна ніби й не з'явилось.
    //
    // А коли вікно закривається, курсор має повернутись туди, звідки
    // його відкрили, — інакше обхід сторінки починається спочатку.
    const { JSDOM } = require("jsdom");

    const common = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8");

    const grab = name =>
        (common.match(new RegExp("function " + name + "\\([\\s\\S]*?\\n}\\n")) || [""])[0];

    ["openModalFocus", "closeModalFocus", "trapModalTab", "focusablesIn", "isShown"]
        .forEach(name => check(`${name} знайдено`, grab(name).length > 0));

    // offsetParent порожній НЕ ЛИШЕ в схованого: у position:fixed
    // його немає ніколи. Хрестик «Закрити» в лайтбоксі саме fixed —
    // і випадав із переліку, а фокус ставав на стрілку «Наступне
    // фото». Спіймано на живому лайтбоксі, не в jsdom.
    check("видимість рахується не через offsetParent",
        !/offsetParent/.test(grab("focusablesIn") + grab("isShown") + grab("closeModalFocus")),
        "offsetParent повернувся");

    // Спостерігач за hidden — щоб не правити чотири місця, які
    // відкривають вікна (product.js, account.js ×2, checkout.js).
    check("стан вікна ловиться спостерігачем, а не правками по місцях",
        /attributeFilter: \["hidden"\]/.test(common));

    const dom = new JSDOM(`<!doctype html><body>
        <button id="opener">Таблиця розмірів</button>
        <a href="/somewhere" id="behind">Посилання на сторінці під вікном</a>
        <div id="m" class="modal-overlay" hidden>
            <div class="modal-card">
                <div class="modal-header">
                    <h3>Таблиця розмірів</h3>
                    <button class="modal-close" id="x">✕</button>
                </div>
                <a href="/inside" id="inner">Посилання у вікні</a>
            </div>
        </div>
        </body>`, { runScripts: "outside-only" });

    const { window } = dom;
    const doc = window.document;

    // jsdom не рахує розкладку: getClientRects() там завжди
    // порожній. Підміняємо чесним правилом «предок не hidden» — саме
    // те, що в браузері дає справжня розкладка.
    window.eval(`
        window.HTMLElement.prototype.getClientRects = function () {
            return this.closest("[hidden]") ? [] : [{ width: 10, height: 10 }];
        };
    `);

    // Усе одним eval: функції спираються на FOCUSABLE і
    // modalFocusReturn, а const із сусіднього eval їм не видно.
    // Обидва оголошення беремо з ФАЙЛУ, а не переписуємо сюди —
    // інакше перевірка жила б зі своєю копією переліку фокусованих
    // елементів і не помітила б, якби в справжньому щось загубилось.
    const decl = re => (common.match(re) || [""])[0].replace(/^const /, "var ");

    window.eval([
        decl(/const FOCUSABLE = [\s\S]*?;\n/),
        decl(/const modalFocusReturn = [^\n]*\n/),
        decl(/const openDialogs = \[\];\n/),
        grab("isShown"),
        grab("focusablesIn"),
        grab("openModalFocus"),
        grab("closeModalFocus"),
        grab("trapModalTab"),
        "window.__trap = trapModalTab;",
        "window.__openModal = function (m) { m.hidden = false; openModalFocus(m); };",
        "window.__closeModal = function (m) { m.hidden = true; closeModalFocus(m); };"
    ].join("\n"));

    check("перелік фокусованих елементів узято з файла",
        /const FOCUSABLE = /.test(common) && /a\[href\]/.test(decl(/const FOCUSABLE = [\s\S]*?;\n/)));

    const modal = doc.getElementById("m");

    doc.getElementById("opener").focus();

    check("до відкриття курсор на кнопці, що відкриває",
        doc.activeElement.id === "opener", doc.activeElement.id);

    window.__openModal(modal);

    check("вікно назвалось діалогом", modal.getAttribute("role") === "dialog");
    check("і саме модальним", modal.getAttribute("aria-modal") === "true");
    check("у діалога є назва",
        modal.getAttribute("aria-labelledby") === modal.querySelector("h3").id
        && Boolean(modal.querySelector("h3").id));

    check("курсор зайшов усередину вікна",
        modal.contains(doc.activeElement), doc.activeElement.id);
    check("і став саме на «Закрити», а не на дію",
        doc.activeElement.id === "x", doc.activeElement.id);

    window.__closeModal(modal);

    check("після закриття курсор повернувся туди, звідки прийшов",
        doc.activeElement.id === "opener", doc.activeElement.id);

    // Tab по колу: з останнього — на перший і навпаки.
    window.__openModal(modal);

    const inner = doc.getElementById("inner");

    inner.focus();

    const tab = shift => {
        const event = new window.KeyboardEvent("keydown",
            { key: "Tab", shiftKey: Boolean(shift), bubbles: true, cancelable: true });
        Object.defineProperty(event, "target", { value: doc.activeElement });
        window.__trap(event);
        return event.defaultPrevented;
    };

    check("з останнього Tab повертає на перший",
        tab(false) && doc.activeElement.id === "x", doc.activeElement.id);

    check("і Shift+Tab із першого — на останній",
        tab(true) && doc.activeElement.id === "inner", doc.activeElement.id);

    // Найголовніше: сторінка під вікном лишається недосяжною.
    check("посилання під вікном у коло не потрапило",
        doc.activeElement.id !== "behind");

    // ВІКНА БЕЗ КЛАСУ .modal-overlay — лайтбокс і мобільне меню.
    //
    // Вони так само накривають сторінку, замикають прокрутку й
    // закриваються по Escape, але спостерігач за .modal-overlay їх
    // не бачить: лайтбокс створюється на льоту, меню перемикається
    // класом .open, а не hidden. Тому кажуть про себе самі.
    check("є спільний вхід для вікон без класу",
        /window\.DialogFocus = \{/.test(common));

    // Верхнє вікно для Tab береться зі СТОСУ, а не пошуком по класу
    // — інакше лайтбокс і меню в нього не потрапили б.
    //
    // Саме в trapModalTab: closeTopModal (обробник Escape) і далі
    // питає .modal-overlay, і правильно робить — у лайтбокса й меню
    // свої Escape, і закривати їх звідси означало б закрити двічі.
    check("верхнє вікно для Tab береться зі стосу",
        /const modal = openDialogs\[openDialogs\.length - 1\];/.test(grab("trapModalTab")));

    check("а Escape і далі стосується лише .modal-overlay",
        /\.modal-overlay:not\(\[hidden\]\)/.test(grab("closeTopModal")));

    const lightbox = fs.readFileSync(path.join(ROOT, "assets/js/lightbox.js"), "utf8");

    check("лайтбокс забирає фокус до себе",
        /DialogFocus\?\.open\(root\)/.test(lightbox));
    check("і повертає при закритті",
        /DialogFocus\?\.close\(root\)/.test(lightbox));

    // Повернути фокус треба ДО того, як вікно сховали: у схованому
    // фокусувати вже нічого, і браузер кидає курсор на початок.
    check("лайтбокс повертає фокус до того, як сховатись",
        lightbox.indexOf("DialogFocus?.close(root)") < lightbox.indexOf("root.hidden = true"));

    check("мобільне меню теж забирає фокус",
        /DialogFocus\?\.open\(mobileNavEl\)/.test(common));
    check("і повертає його на бургер",
        /DialogFocus\?\.close\(mobileNavEl\)/.test(common));

    // Панель фільтрів на телефоні — четверте таке вікно: накриває
    // екран, замикає прокрутку, а класу .modal-overlay не має.
    const catalogJs = fs.readFileSync(path.join(ROOT, "assets/js/catalog.js"), "utf8");

    check("панель фільтрів забирає фокус",
        /DialogFocus\?\.open\(mobileFiltersModal\)/.test(catalogJs));
    check("і повертає його на кнопку «Фільтри»",
        /DialogFocus\?\.close\(mobileFiltersModal\)/.test(catalogJs));

    check("панель фільтрів повертає фокус до того, як сховатись",
        catalogJs.indexOf("DialogFocus?.close(mobileFiltersModal)")
        < catalogJs.indexOf("mobileFiltersModal.hidden = true"));

    // Два рівні — два кроки назад. Зі списку брендів Escape має
    // повертати до переліку фільтрів, а не закривати все: інакше
    // губиться те, що людина щойно вибирала.
    check("Escape у фільтрах спершу веде назад, потім закриває",
        /if \(mobileFiltersSub && !mobileFiltersSub\.hidden\)[\s\S]{0,140}backToMobileFiltersMain\(\)[\s\S]{0,140}closeMobileFilters\(\)/.test(catalogJs));

    check("у панелі фільтрів є назва для читача",
        /id="mobileFiltersModal"[^>]*aria-label="Фільтри"/.test(
            fs.readFileSync(path.join(ROOT, "catalog.html"), "utf8")));

    // П'яте таке вікно — накладка пошуку в шапці.
    //
    // Курсор у поле вона ставила й сама, і це головне. А от далі Tab
    // вів по сторінці ПІД нею: заміряно на головній — дванадцятий Tab
    // від поля, і фокус на кнопці «Меню», якої за накладкою не видно.
    check("накладка пошуку забирає фокус",
        /DialogFocus\?\.open\(searchOverlayEl\)/.test(common));
    check("і повертає його на 🔍",
        /DialogFocus\?\.close\(searchOverlayEl\)/.test(common));

    // Порядок важливий: DialogFocus ставить курсор на перший елемент
    // накладки, а потрібне саме поле, у яке одразу друкують.
    check("поле лишається останнім словом",
        common.indexOf("DialogFocus?.open(searchOverlayEl)")
        < common.indexOf("setTimeout(() => input.focus(), 50)"));

    check("у накладки пошуку є назва для читача",
        /overlay\.setAttribute\("aria-label", "Пошук по каталогу"\)/.test(common));

    // role="dialog" без назви читач оголошує просто «діалог».
    check("у меню є назва для читача",
        /nav\.setAttribute\("aria-label", "Меню"\)/.test(common));

    // ДРУГА СПРОБА ФОКУСА — НЕ ПЕРЕСТРАХОВКА.
    //
    // .modal-overlay зʼявляється миттєво (знімається hidden), а
    // мобільне меню виїжджає переходом: visibility транзиціює 250 мс,
    // і в мить виклику focus() меню для браузера ще
    // visibility:hidden. У схованому елементі фокус не ставиться
    // МОВЧКИ — курсор лишався на бургері, Tab вів по сторінці під
    // меню. На живому сайті це й спіймалось; у jsdom і на
    // .modal-overlay усе «працювало».
    check("фокус пробується ще раз наступним кадром",
        /if \(document\.activeElement !== target\) \{[\s\S]{0,200}requestAnimationFrame/.test(common));

    check("і не б'ється з вікном, яке встигли закрити",
        /requestAnimationFrame\([\s\S]{0,160}modalFocusReturn\.has\(modal\)/.test(common));
}

console.log("\n[11] Меню в шапці розкривається з клавіатури");
{
    // Панель відкривалась лише по :hover. Хто веде сторінку табом,
    // доходив до «Каталог» і йшов далі: прихований вміст із
    // таб-порядку випадає, тож категорій у шапці для нього не
    // існувало.
    const js = fs.readFileSync(path.join(ROOT, "assets/js/mega-menu.js"), "utf8");

    check("стан меню тримає атрибут", /data-mega-open|megaOpen/.test(js));

    // :focus-within тут не підходить принципово: Escape мусить
    // закривати панель, а фокус при цьому лишається на «Каталог» —
    // тобто в тому ж li, — і панель відкрилась би назад.
    check("відкриття описане в стилях через атрибут",
        /nav li\.has-mega\[data-mega-open\] \.mega-menu\{/.test(css));

    check("варіант із колонками теж",
        /nav li\.has-mega\[data-mega-open\] \.mega-menu\.mega-menu-columns\{/.test(css));

    // Поза @media (hover:hover): та обгортка боронить від дотику
    // пальцем, а клавіатура є й там, де миші немає.
    const hoverBlocks = [...raw.matchAll(/@media \(hover:hover\) and \(pointer:fine\)\{([\s\S]*?)\n\}/g)]
        .map(m => m[1]).join("\n");

    check("правило не замкнене в медіазапиті про мишу",
        !/\[data-mega-open\]/.test(hoverBlocks));

    check("відкриваємо лише клавіатурний фокус",
        /matches\(":focus-visible"\)/.test(js));

    check("Escape закриває", /event\.key !== "Escape"/.test(js));

    check("і повертає курсор на пункт меню",
        /megaDismissed[\s\S]{0,400}link\.focus\(\)/.test(js));

    // Без позначки Escape виглядав би зламаним: фокус повертається
    // на посилання, це знову focusin на тому самому li — і панель
    // відкрилась би тієї ж миті.
    check("відмова запам'ятовується, поки фокус не піде з пункту",
        /if \(item\.dataset\.megaDismissed\) return;/.test(js)
        && /delete item\.dataset\.megaDismissed/.test(js));

    check("клавіатуру вмикають одразу, а не після завантаження даних",
        js.indexOf("setupMegaKeyboard(megaItems);") < js.indexOf("await new Promise"));

    // :focus-visible не абсолютний суддя: браузер вважає фокус
    // клавіатурним ще якийсь час після останнього Tab, тож клац по
    // пункту міг лишити атрибут висіти — і панель не сховалась би,
    // коли курсор піде (focusout не настане, фокус же на посиланні).
    // Поки курсор над пунктом, панель показує :hover — саме той
    // механізм, який і має відповідати за мишу.
    check("миша знімає клавіатурний стан",
        /item\.addEventListener\("pointerdown", close\);/.test(js));
}

console.log("\n[12] Відповідь форми не лише видно, а й чутно");
{
    // ЩО БУЛО.
    //
    // П'ять місць на сайті відповідають на дію рядком тексту, який
    // просто з'являється. Фокус нікуди не йде, сторінка не
    // перезавантажується, більше не змінюється нічого. Той, хто не
    // бачить екрана, після натискання не дізнається НІЧОГО:
    //
    //   • підписка на листи — форма в підвалі КОЖНОЇ сторінки:
    //     «Перевірте адресу пошти», «Потрібна згода», «Готово!
    //     Перевірте пошту»;
    //   • «Де моє замовлення» — «Замовлення не знайдено», «Забагато
    //     спроб»;
    //   • відгук про товар;
    //   • заявка на відмову від замовлення;
    //   • тост — тридцять різних повідомлень по всьому сайту, від
    //     «Товар додано в кошик» до «Оберіть розмір».
    //
    // Заміряно на проді 21.09.2026: у #lookupError і .subscribe-note
    // не було ні role, ні aria-live.
    //
    // ЧОМУ РОЛЬ СТАВИТЬСЯ НАПЕРЕД, А НЕ В МИТЬ ПОКАЗУ.
    // Читалка екрана оголошує зміну в живій області лише якщо знала
    // про неї ДО зміни. Повісити роль і текст одним заходом — це для
    // неї поява готового блока, а не подія.
    const file = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

    const cases = [
        ["assets/js/subscribe.js", 'noteEl.setAttribute("role", "status")', "підписка на листи"],
        ["assets/js/order-status.js", 'errorEl.setAttribute("role", "alert")', "«Де моє замовлення»"],
        ["assets/js/reviews.js", 'errorEl.setAttribute("role", "alert")', "відгук про товар"],
        ["assets/js/common.js", 'toast.setAttribute("role", "status")', "тост"],
    ];

    cases.forEach(([rel, needle, label]) => {

        // Коментарі геть: у них самих трапляються ті самі слова.
        const js = file(rel)
            .replace(/\/\/[^\n]*/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");

        check(`${label}: відповідь оголошується`, js.includes(needle), rel);

    });

    // Вікно відмови будується рядком, тому роль стоїть у самій
    // розмітці.
    check("заявка на відмову: відповідь оголошується",
        /class="refusal-error" role="alert"/.test(file("assets/js/refusal-dialog.js")));

    // Сторінка підтвердження підписки — окремий випадок: людина
    // нічого не натискала, вона просто прийшла з листа. Заголовок
    // каже «Підтверджуємо підписку… Секунду», а за частку секунди
    // міняється на справжню відповідь — коли читалка перший варіант
    // уже прочитала. Єдине, заради чого сторінка існує, лишалось
    // непочутим.
    const confirmJs = file("assets/js/newsletter-confirm.js")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");

    check("підтвердження підписки: відповідь оголошується",
        /board\.setAttribute\("role", "status"\)/.test(confirmJs)
        && /board\.setAttribute\("aria-live", "polite"\)/.test(confirmJs));

    // Область на всьому блоці, бо міняються ОБИДВА вузли — заголовок
    // і пояснення. «Посилання застаріло» без «підпишіться ще раз»
    // не каже, що робити далі.
    check("і охоплює весь блок, а не сам заголовок",
        /heading\.closest\("\.confirm-page"\)/.test(confirmJs));

    // А смайлик із неї виведений: у живій області читалка озвучила б
    // і його — «конверт» перед відповіддю.
    check("смайлик у ній не озвучується",
        /id="confirmIcon" aria-hidden="true"/.test(file("newsletter-confirm.html")));

    // alert проти status — різниця не косметична.
    //
    // alert перебиває те, що читалка говорить зараз. Для помилки це
    // доречно: людина щойно натиснула кнопку й чекає саме відповіді.
    // Для тоста й підписки — ні: там і успіх, і невдача одним
    // каналом, а перебивати читання через «Товар додано в кошик»
    // нечемно.
    const subscribeJs = file("assets/js/subscribe.js");

    check("у підписки — ввічливе status, а не alert",
        /noteEl\.setAttribute\("aria-live", "polite"\)/.test(subscribeJs)
        && !/noteEl\.setAttribute\("role", "alert"\)/.test(subscribeJs));

    // Знайдене замовлення — не рядок, а ціла картка: статус, склад,
    // сума, накладна. Оголошувати її живою областю означало б
    // вивалити все це поверх того, що читалка говорить. Тому інакше:
    // фокус іде на картку, і читалка читає її сама, а Tab далі веде
    // всередину — до посилання на відстеження, — а не з початку
    // сторінки.
    const lookupJs = file("assets/js/order-status.js");

    check("знайдене замовлення приймає фокус",
        /resultEl\.setAttribute\("tabindex", "-1"\)/.test(lookupJs));

    check("і фокус туди справді йде",
        /resultEl\.focus\(\{ preventScroll: true \}\)/.test(lookupJs));

    // Прокрутка лишається: preventScroll саме для того, щоб фокус не
    // сперечався з нею.
    check("прокрутка до картки нікуди не поділась",
        /resultEl\.scrollIntoView/.test(lookupJs));
    // «ОБЕРІТЬ РОЗМІР» — ЄДИНИЙ ВИПАДОК, ЯКИЙ ЖИВОЮ ОБЛАСТЮ НЕ
    // ЛІКУЄТЬСЯ.
    //
    // Текст помилки тут сталий: він лежить у розмітці сторінки товару
    // (<div class="size-error" id="sizeError" hidden>) і лише
    // розховується. Для читалки екрана це не зміна змісту; а на
    // другому натисканні «Купити» поспіль не змінюється взагалі
    // нічого — і сказати їй буде нíчого.
    //
    // Тому фокус: він веде рівно на те, що треба вибрати, і працює
    // хоч удесяте. Заразом виручає клавіатуру — інакше до розмірів
    // довелось би вертатись Shift+Tab через пів сторінки.
    const commonJs = file("assets/js/common.js")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");

    const flag = commonJs.match(/function flagSizeRequired[\s\S]*?\n}\n/);

    check("flagSizeRequired знайдено", Boolean(flag));

    check("розмір, який треба обрати, отримує фокус",
        /\.find\(isShown\)/.test(flag ? flag[0] : "")
        && /firstSize\.focus\(\{ preventScroll: true \}\)/.test(flag ? flag[0] : ""));

    // isShown обов'язковий: у картці каталогу блоків розмірів ДВА, і
    // один із них схований. Фокус на схованому не спрацьовує й ніяк
    // про це не повідомляє — так уже ламалась накладка меню.
    check("схований блок розмірів фокус не перехоплює",
        /querySelectorAll\("\.size, \.mini-size"\)\]\.find\(isShown\)/.test(flag ? flag[0] : ""));
}

console.log("\n[13] Заголовки складаються у зміст без дірок");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    // ---------------
    // Диктор дає незрячому список заголовків як зміст сторінки, і
    // рівні в ньому — це вкладеність. h3 одразу після h1 читається
    // як «десь загубився цілий розділ».
    //
    // Заміряно 24.09.2026: перескок на 106 сторінках зі 154. Причина
    // була не в одному місці, а в трьох — блок Instagram, картки
    // контактів і колонки підвалу, — і кожне окремо виглядало
    // невинно. Побачити це можна лише перевіркою по всьому сайту,
    // тому вона тут.
    //
    // Дві сторінки при цьому не мали h1 зовсім: головним заголовком
    // стояв h2, і зміст у диктора починався з підвалу.
    const pages = [];

    const walk = (dir, rel) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
        .forEach(entry => {
            if (["node_modules", ".git", "supabase", "admin"].includes(entry.name)) return;
            const next = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(path.join(dir, entry.name), next);
            else if (entry.name.endsWith(".html")) pages.push(next);
        });

    walk(".", "");

    const noH1 = [];
    const manyH1 = [];
    const jumps = [];

    let looked = 0;

    pages.forEach(rel => {

        const raw = fs.readFileSync(path.join(ROOT, rel), "utf8");

        // Сторінки-перенаправлення заголовків не мають і не мусять.
        if (/http-equiv=["']refresh["']/i.test(raw)) return;

        // product.html — оболонка, яку заповнює генератор; заголовок
        // у неї підставляється на збірці, тож порожня вона законно.
        if (rel === "product.html") return;

        // Без <script>: там лежать шаблони, яких на сторінці може й
        // не бути, і рахувати їх як розмітку неправильно.
        const html = raw
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<!--[\s\S]*?-->/g, " ");

        looked += 1;

        const levels = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map(m => +m[1]);

        const first = levels.filter(l => l === 1).length;

        if (first === 0) noH1.push(rel);
        if (first > 1) manyH1.push(`${rel} (${first})`);

        for (let i = 1; i < levels.length; i += 1) {
            if (levels[i] - levels[i - 1] > 1) {
                jumps.push(`${rel}: h${levels[i - 1]} → h${levels[i]}`);
                break;
            }
        }

    });

    check(`сторінок перевірено — ${looked}`, looked > 100, looked);

    check("у кожної сторінки є h1", noH1.length === 0, noH1.slice(0, 4).join(", "));

    check("і рівно один", manyH1.length === 0, manyH1.slice(0, 4).join(", "));

    check("жодного перескоку через рівень",
        jumps.length === 0, jumps.slice(0, 4).join("; "));

    // ВИГЛЯД ЗАЛЕЖИТЬ ВІД ТЕГУ, А НЕ ВІД КЛАСУ — і це та пастка, у
    // яку легко втрапити наступного разу. Загальні правила для h2 і
    // h3 різні (24px/700 проти 42px/800 і center), тож там, де тег
    // змінили заради структури, старий вигляд повернуто явно.
    // css оголошено вище в цьому наборі — там уже вирізано коментарі.
    [".footer h2", ".instagram-text h2", ".contact-card h2"].forEach(selector => {

        const block = css.match(
            new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}"));

        check(`${selector}: вигляд задано явно, не успадковано від h2`,
            Boolean(block) && /font-size/.test(block[1]) && /font-weight/.test(block[1])
            && /text-align/.test(block[1]),
            block ? block[1].replace(/\s+/g, " ").trim().slice(0, 60) : "правила немає");

    });
}

console.log("\n[14] Кружечки кольору: зона натискання дорівнює кроку");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    // ---------------
    // У картці каталогу на мобільному кружечків кольору буває шість-
    // сім, тому намальовані вони маленькими — 16px. Мішень при цьому
    // росте невидимою зоною ::before.
    //
    // Тут стикаються три числа, і жодне не можна рухати окремо:
    //
    //   крок  = ширина кружечка + проміжок рядка
    //   зона  = padding-бокс кружечка + 2 × inset
    //   норма = 24 (WCAG 2.2, 2.5.8 — виняток за відстанню: коло
    //           діаметром 24 на кожній цілі не перетинає сусіднє)
    //
    // Зона БІЛЬША за крок — сусідні зони перекриваються, і натискання
    // дістається чужому кольору. МЕНША — між ними мертвий проміжок,
    // де не відбувається нічого. Правильно рівно одне: зона = крок.
    //
    // Заміряно 25.09.2026: було 16px, проміжок 7px → крок 23, зона 22.
    // Тобто і норму не добирали на піксель, і між зонами лишалась
    // щілина. Стало 8px → крок 24, зона 24.
    const num = re => {
        const hit = css.match(re);
        return hit ? parseFloat(hit[1]) : null;
    };

    // .product-colors { gap: Npx }
    const gap = num(/\.product-colors\{[^}]*gap:(\d+(?:\.\d+)?)px/);

    // .product-card .mini-color { width: Npx }
    const dot = num(/\.product-card \.mini-color\{[^}]*width:(\d+(?:\.\d+)?)px/);

    // .mini-color { border: Npx ... } — базове правило
    const border = num(/\.mini-color\{[^}]*border:(\d+(?:\.\d+)?)px/);

    // .product-card .mini-color::before { inset: Vpx Hpx }
    const inset = css.match(
        /\.product-card \.mini-color::before\{[^}]*inset:-(\d+(?:\.\d+)?)px -(\d+(?:\.\d+)?)px/);

    check("усі чотири числа знайдено в CSS",
        gap !== null && dot !== null && border !== null && Boolean(inset),
        `gap=${gap} dot=${dot} border=${border} inset=${inset ? inset[1] + "/" + inset[2] : "—"}`);

    if (gap !== null && dot !== null && border !== null && inset) {

        const step = dot + gap;
        const padding = dot - border * 2;          // box-sizing:border-box
        const zone = padding + parseFloat(inset[2]) * 2;

        check(`крок між центрами ${step}px — не менший за 24`, step >= 24, step);

        check(`зона натискання ${zone}px дорівнює кроку`, zone === step, `${zone} ≠ ${step}`);

        // Вертикаль окремо: її ріже overflow-y:hidden батька, тож вона
        // законно менша. Але не менша за намальований кружечок —
        // інакше зона була б вужчою за те, що видно.
        const zoneY = padding + parseFloat(inset[1]) * 2;

        check(`по вертикалі ${zoneY}px — більша за сам кружечок`, zoneY > dot, `${zoneY} ≤ ${dot}`);

    }

    // Причина записана в коді, а не лише тут.
    check("у CSS пояснено, чому саме ці числа",
        /зони стикаються без щілин і без перекриття/.test(raw));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
