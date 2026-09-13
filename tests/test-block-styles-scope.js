// Кольори з адмінки: куди вони доходять і куди НЕ мусять доходити.
//
// ЩО БУЛО НЕ ТАК — ДВІ РІЗНІ ПОМИЛКИ З ОДНИМ КОРЕНЕМ
// ---------------------------------------------------
// Корінь один: запасне значення в var() — це НЕ «як було».
//
//     background:var(--blk-btn-bg, inherit)
//
// Коли змінна не задана, це означає не «правило не діє», а
// «background:inherit», тобто взяти тло батька. Правило з .has-style
// важить більше за власне правило елемента, тож воно перемагає й
// підставляє inherit замість рідного кольору.
//
// 1. НА САЙТІ. «Ціна дня» і «Добірка» тримають картки товарів
//    усередині оформленого блока, а .has-style .btn і .has-style
//    .badge не розрізняли, де чия кнопка. Досить було задати ОДИН
//    колір — у акції це був колір цифр таймера — і кнопка «Купити»
//    ставала прозорою, а плашка «-10%» зникала.
//
//    Заміряно в браузері на головній:
//      кнопка в блоці rgba(0, 0, 0, 0), поруч rgb(37, 99, 235);
//      плашка  в блоці rgba(0, 0, 0, 0), поруч rgb(239, 68, 68).
//
// 2. У ПРЕВ'Ю АДМІНКИ. Прев'ю має власну розмітку (cms-preview-*), а
//    правила оформлення написані під класи сайту. Змінна доїжджала до
//    прев'ю за 75 мс, і там її ніхто не читав — колір таймера був
//    зашитий як #fff. Ззовні: «міняю колір, а в прев'ю нічого не
//    фарбується».
//
// ЧОМУ ТЕСТ, А НЕ ПРОСТО ПРАВКА
// ------------------------------
// Обидві помилки мовчазні. Нічого не падає, нічого не червоніє —
// просто колір не той, і помітно це лише на живій сторінці. Тому тут
// пари «правило сайту ↔ правило прев'ю» тримаються разом: якщо одне
// змінять, а друге ні, набір скаже про це одразу.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const site = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");
const preview = fs.readFileSync(path.join(ROOT, "admin/preview-styles.css"), "utf8");
const templates = fs.readFileSync(path.join(ROOT, "admin/preview-templates.js"), "utf8");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// Коментарі прибираємо першими: у них повно фігурних дужок і назв
// селекторів, і без цього розбір ловив би пояснення замість правил.
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, "");

// Усі правила файлу як пари «список селекторів → тіло».
function rules(css) {

    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;

    let m;

    while ((m = re.exec(strip(css)))) {

        // @media лишає свою дужку перед першим вкладеним селектором —
        // відрізаємо її, інакше правило всередині медіа-запиту
        // виглядало б як селектор «@media(...) .foo».
        const sels = m[1]
            .split(",")
            .map(s => s.replace(/^[\s\S]*\{/, "").trim())
            .filter(Boolean);

        out.push({ sels, body: m[2] });

    }

    return out;

}

const siteRules = rules(site);
const previewRules = rules(preview);

// ЩО ЕЛЕМЕНТ ОТРИМАЄ НАСПРАВДІ, а не що написано в першому ж правилі.
//
// Один селектор трапляється в кількох правилах: спершу загальне
// (бейджі всіх блоків), потім уточнення (підпис зверху заливки не
// має). Перша версія помічника брала перше правило — і порівнювала
// не те, що побачить браузер. Тому проходимо всі правила з таким
// селектором по порядку: пізніша властивість перекриває ранішу.
const propsOf = (list, selector) => {

    const props = new Map();
    let found = false;

    list.forEach(r => {

        if (!r.sels.includes(selector)) return;

        found = true;

        r.body.split(";").forEach(decl => {

            const at = decl.indexOf(":");

            if (at === -1) return;

            props.set(decl.slice(0, at).trim(), decl.slice(at + 1).trim());

        });

    });

    return found ? props : null;

};

const bodyOf = (list, selector) => {

    const props = propsOf(list, selector);

    return props ? [...props].map(([k, v]) => k + ":" + v).join(";\n") + ";" : null;

};

// Які --blk-* змінні читає тіло правила.
const varsOf = body => [...new Set((body || "").match(/--blk-[a-z-]+/g) || [])].sort();

console.log("\n[1] Картки товарів не підкоряються оформленню блока");
{
    // Суцільний .has-style .badge ловив плашки товарів. Власні бейджі
    // блоків звуться інакше — перевірено по розмітці всіх п'яти
    // блоків, що отримують .has-style.
    check("немає суцільного правила .has-style .badge",
        bodyOf(siteRules, ".has-style .badge") === null,
        "воно знову ловитиме плашки в картках товарів");

    const buy = bodyOf(siteRules, ".has-style .product-card .btn");

    check("кнопка картки повертає собі власні кольори", buy !== null,
        "без цього .has-style .btn робить «Купити» прозорою");

    // Пара, яка не має розійтися: тут і в самій картці має стояти той
    // самий --secondary. Інакше «повернення власних значень» поверне
    // не те значення.
    const card = bodyOf(siteRules, ".product-card .buy-btn");

    check("і тут, і в .product-card .buy-btn — той самий --secondary",
        Boolean(buy && card && /background:var\(--secondary\)/.test(buy)
            && /background:var\(--secondary\)/.test(card)),
        card ? "" : "правило .product-card .buy-btn не знайдено");
}

console.log("\n[2] Запасні значення — справжні кольори, а не inherit");
{
    // background:inherit не буває правильним запасним значенням: тло
    // не успадковується, тож це завжди «зробити прозорим».
    const bad = [];

    siteRules.concat(previewRules).forEach(r => {
        if (/background(-color)?:\s*var\(--blk-[a-z-]+,\s*inherit\)/.test(r.body)) {
            bad.push(r.sels.join(", "));
        }
    });

    check("ніде немає background:var(--blk-*, inherit)", bad.length === 0, bad.join(" | "));

    const btn = bodyOf(siteRules, ".has-style .btn");

    check("кнопка блока падає на власний колір кнопки",
        Boolean(btn && /background:var\(--blk-btn-bg, var\(--secondary\)\)/.test(btn)), btn || "правила немає");

    const eyebrow = bodyOf(siteRules, ".has-style .deal-eyebrow");

    check("підпис «ЦІНА ДНЯ» лишається червоним, поки колір не задали",
        Boolean(eyebrow && /var\(--danger\)/.test(eyebrow)), eyebrow || "правила немає");

    // Поле зветься «Колір бейджа-підпису зверху» — воно й має бути
    // першим у ланцюжку, інакше поле з такою назвою не діє на підпис.
    check("підпис читає спочатку accentColor, потім badgeBg",
        Boolean(eyebrow && /var\(--blk-accent, var\(--blk-badge-bg,/.test(eyebrow)), eyebrow || "");

    const collection = bodyOf(siteRules, ".has-style .collection-eyebrow");

    check("підпис добірки не втрачає --secondary",
        Boolean(collection && /var\(--blk-accent, var\(--secondary\)\)/.test(collection)),
        collection || "правила немає");

    const outline = bodyOf(siteRules, ".has-style .btn-outline");

    check("прозора кнопка не втрачає свій колір тексту",
        Boolean(outline && /color:var\(--blk-btn-bg, var\(--primary\)\)/.test(outline)),
        outline || "правила немає");
}

console.log("\n[3] Цифри таймера фарбуються кольором таймера, а не тексту");
{
    // Цифри лежать у вкладених <span>, а .has-style span фарбує
    // будь-який span кольором ТЕКСТУ й на цих вузлах важить більше.
    const hit = siteRules.find(r => r.sels.includes(".has-style .promo-countdown span"));

    check("правило для вкладених span існує", Boolean(hit),
        "інакше «Колір цифр» перестає діяти, щойно задали «Колір тексту»");

    check("воно читає саме --blk-timer-text",
        Boolean(hit && varsOf(hit.body).includes("--blk-timer-text")),
        hit ? varsOf(hit.body).join(", ") : "");
}

console.log("\n[4] Прев'ю читає ті самі змінні, що й сайт");
{
    // Пари «що в прев'ю ↔ що на сайті». Значення можуть відрізнятись
    // (у прев'ю свої запасні кольори), а НАБІР ЗМІННИХ — ні: саме він
    // вирішує, яке поле адмінки що фарбує.
    const pairs = [
        ["таймер",
            ".cms-preview-home .cms-preview-promo-timer", preview,
            ".has-style .promo-countdown", site],
        ["підпис зверху на головній",
            ".cms-preview-home .cms-preview-home-eyebrow", preview,
            ".has-style .deal-eyebrow", site],
        ["напис-посилання під блоком",
            ".cms-preview-home .cms-preview-home-more", preview,
            ".deal-more", site]
    ];

    pairs.forEach(([name, pSel, pCss, sSel, sCss]) => {

        const a = varsOf(bodyOf(rules(pCss), pSel));
        const b = varsOf(bodyOf(rules(sCss), sSel));

        check(`${name}: ${a.join(" + ") || "нічого"} = ${b.join(" + ") || "нічого"}`,
            a.length > 0 && a.join(",") === b.join(","),
            a.length ? "набори розійшлись" : "правило в прев'ю не знайдено");

    });

    // Банер прев'ю мусить читати весь набір «Оформлення тексту і
    // кнопки»: саме його там і налаштовують.
    //
    // Перевіряємо ПОЕЛЕМЕНТНО І ПОВЛАСТИВОСТІ, а не «змінна десь
    // згадується». Перша версія рахувала згадки в усіх правилах
    // банера гуртом — і не помітила, як із заливки кнопки прибрали
    // --blk-btn-bg: змінна лишалась у сусідньому рядку про рамку.
    [[".cms-preview-promo-title", "color", "--blk-text"],
     [".cms-preview-promo-text", "color", "--blk-text"],
     [".cms-preview-promo-badge", "background", "--blk-badge-bg"],
     [".cms-preview-promo-badge", "color", "--blk-badge-text"],
     [".cms-preview-promo-btn", "background", "--blk-btn-bg"],
     [".cms-preview-promo-btn", "color", "--blk-btn-text"],
     [".cms-preview-promo-timer", "background", "--blk-timer-bg"],
     [".cms-preview-promo-timer", "color", "--blk-timer-text"]]
        .forEach(([cls, prop, variable]) => {

            const props = propsOf(previewRules, ".cms-preview-promo-banner " + cls);
            const value = props && props.get(prop);

            check(`банер прев'ю: ${cls.replace(".cms-preview-promo-", "")} ${prop} → ${variable}`,
                Boolean(value && value.includes(variable)),
                props ? `зараз ${prop}:${value}` : "правила немає");

        });
}

console.log("\n[5] Селектори кольорів у прев'ю важать більше за правила сайту");
{
    // Прев'ю живе в одному iframe зі style.css сайту, а там
    // .has-style span (0,1,1) фарбує будь-який span. Селектор з одного
    // класу (0,1,0) цьому програє — і колір мовчки не застосується.
    const weak = [];

    previewRules.forEach(r => {

        // правила, що ЗАДАЮТЬ змінну, стоять на корені блока — їм
        // вага не потрібна
        if (/^\s*--blk-/m.test(r.body.replace(/[^\n]*var\(/g, ""))) return;

        if (!/:\s*var\(--blk-/.test(r.body)) return;

        r.sels.forEach(sel => {
            if ((sel.match(/\./g) || []).length < 2) weak.push(sel);
        });

    });

    check("кожне кольорове правило прев'ю має щонайменше два класи",
        weak.length === 0, weak.join(" | "));
}

console.log("\n[6] Прев'ю ставить змінні на ОБИДВА блоки");
{
    // Досі змінні проставлялись лише на блок головної, і весь набір
    // «Оформлення тексту і кнопки» був у прев'ю невидимий.
    // Банер бере СВІЙ набір; єдине, що приходить із сусіднього, —
    // заливка й цифри таймера (inheritTimer у text-styles.js).
    check("банер бере власний набір style",
        /inheritTimer\(e\.get\("style"\), e\.get\("homeStyle"\)\)/.test(templates)
        && !/mergeStyles/.test(templates));

    check("банер отримує клас has-style",
        /hasBannerVars \? " has-style" : ""/.test(templates));

    check("банер отримує самі змінні",
        /style: hasBannerVars \? bannerVars : undefined/.test(templates));

    check("блок головної теж лишився зі своїми",
        /style: hasHomeVars \? homeVars : undefined/.test(templates));

    // Розмір заголовка — множник, і множити треба на розмір блока.
    // Розмір заголовка й опису — множник від ВЛАСНОГО розміру, як на
    // сайті. Селектор може повторюватись у файлі, тож дивимось на
    // зведене тіло, а не на перше-ліпше.
    [[".cms-preview-promo-title", "title"],
     [".cms-preview-promo-text", "text"],
     [".cms-preview-home-title", "title"],
     [".cms-preview-home-text", "text"]].forEach(([sel, kind]) => {

        const props = propsOf(previewRules, sel);
        const size = props && props.get("font-size");

        check(`${sel}: розмір — множник від власної бази`,
            Boolean(props && props.get("--blk-" + kind + "-base")
                && size && size.includes("--blk-" + kind + "-scale")),
            props ? `font-size:${size}` : "правила немає");

    });

    // На сайті заголовок блока — h2, і правила розміру/великих
    // літер/розрядки написані для h1,h2. На h3 вони не діяли.
    check("заголовок блока на головній — h2, як на сайті",
        /h\("h2", \{ className: "cms-preview-home-title" \}/.test(templates));
}

console.log("\n[6a] Розмір рахується від власного розміру блока");
{
    // ЩО БУЛО НЕ ТАК. Одне правило на всіх:
    //
    //     .has-style h1, .has-style h2{
    //         font-size:calc(var(--blk-title-base, 1em) * var(--blk-title-scale, 1));
    //     }
    //
    // Змінної --blk-title-base не було ніде, тож множили на 1em. А
    // правило з .has-style важить більше за власне правило
    // заголовка — і заголовок сторінки акції падав із 42px до 16px
    // від самого лише факту, що в блоці щось налаштували. Виміряно в
    // браузері: H1, fontSize 16px.
    //
    // Полагодити це одним числом тут було б помилкою вдруге: у
    // кожного блока свій розмір ще й на телефоні (30px замість 42,
    // 24 замість 30). Тому множник застосовує сам блок, поруч зі
    // своїм розміром, а медіа-запит міняє лише базу.
    // ПОІМЕННО, А НЕ ЧИСЛОМ.
    //
    // Спершу тут стояло «блоків із власним розміром щонайменше 10», і
    // набір лишався зеленим, коли один блок повертали на фіксований
    // font-size: решта п'ятнадцять перекривали втрату. Перевірено
    // зломом — саме так і сталося.
    const MUST_SCALE = [
        [".promo-hero-content h1", "title"],
        [".promo-hero-content p", "text"],
        [".deal-head-text h2", "title"],
        [".deal-head-text p", "text"],
        [".promo-hero-slide-content h2", "title"],
        [".promo-hero-slide-content p", "text"],
        [".brand-campaign-content h2", "title"],
        [".brand-campaign-content p", "text"],
        [".collection-head h2", "title"],
        [".promo-card-info h3", "title"],
        [".promo-card-info p", "text"]
    ];

    MUST_SCALE.forEach(([selector, kind]) => {

        const props = propsOf(siteRules, selector);
        const size = props && props.get("font-size");

        check(`${selector}: власна база × множник`,
            Boolean(props && props.get("--blk-" + kind + "-base")
                && size && size.includes("--blk-" + kind + "-scale")),
            props ? `font-size:${size}` : "правила немає");

    });

    const sizing = siteRules.filter(r => /--blk-(title|text)-base/.test(r.body));

    // Правило, що ЗАДАЄ і базу, і font-size, мусить множити.
    const wrong = sizing.filter(r => {

        const size = (r.body.match(/font-size:([^;]+);/) || [])[1];

        if (!size) return false;              // медіа-запит: лише база

        return !/var\(--blk-(title|text)-scale/.test(size);

    });

    check("кожен такий блок множить базу на множник", wrong.length === 0,
        wrong.map(r => r.sels.join(", ")).join(" | "));

    // І найголовніше: спільне правило розміру НЕ ВЕРТАЄТЬСЯ.
    const shared = propsOf(siteRules, ".has-style h2");

    check(".has-style h1,h2 більше не задає font-size",
        Boolean(shared) && !shared.has("font-size"),
        shared ? "font-size:" + shared.get("font-size") : "правила немає");

    // Пари «десктоп ↔ телефон». Медіа-запит має міняти саме базу:
    // якби він лишився з font-size, множник на телефоні зникав би.
    const mobileOnlyBase = siteRules.filter(r =>
        /--blk-title-base/.test(r.body) && !/font-size/.test(r.body));

    check(`медіа-запитів, що міняють лише базу — ${mobileOnlyBase.length}`,
        mobileOnlyBase.length >= 4,
        "мобільні розміри знову задаються через font-size");
}

console.log("\n[7] Шрифти доїжджають до iframe прев'ю");
{
    // ensureFonts() дописує <link> у голову СТОРІНКИ, а прев'ю — це
    // окремий iframe, і туди він не діє. Тому список реєструється
    // наперед через registerPreviewStyle.
    check("усі шрифти зі списку реєструються для прев'ю",
        /TextStyles\.FONTS[\s\S]{0,400}registerPreviewStyle/.test(templates),
        "інакше поле «Шрифт» у прев'ю нічого не змінює");
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
