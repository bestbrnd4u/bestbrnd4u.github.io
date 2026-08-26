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

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
