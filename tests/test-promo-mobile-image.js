// Мобільне фото акції на ГОЛОВНІЙ сторінці.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Поле «Фото для мобільної версії» існувало в адмінці й доходило до
// data/promotions.json, але читав його лише assets/js/promo.js —
// тобто сама сторінка акції. На головній усі способи показу малювали
// звичайний <img src="${promo.image}"> і мобільний кадр ігнорували.
// Ззовні це виглядало так, ніби поле зламане: його міняли, чекали
// деплой — і на мобільній верстці нічого не змінювалось.
//
// Тепер кожен блок віддає <picture> з <source media>. Підміну робить
// браузер, а не JS: файл обирається ще до виконання скриптів, зайвий
// кадр не викачується.
//
// Найкрихкіше тут — ТОЧКИ ПЕРЕЛОМУ. У кожного блоку вона своя, і має
// збігатися з тією, на якій його верстка перебудовується в CSS.
// Інакше картинка міняється не там, де змінюється розкладка.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const appJs = fs.readFileSync(path.join(ROOT, "assets/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

console.log("\n[1] Спільний помічник, а не копіпаст у кожному блоці");
{
    check("promoPicture існує", /function promoPicture\(promo, breakpoint/.test(appJs));
    check("віддає <picture> з <source media>",
        /<source media="\(max-width: \$\{breakpoint\}px\)" srcset="\$\{promo\.imageMobile\}"/.test(appJs));
    check("без мобільного фото <source> не додається",
        /promo\.imageMobile\s*\?/.test(appJs));
    check("десктопне фото лишається у <img> як запасне",
        /<picture>[\s\S]{0,200}src="\$\{promo\.image\}"/.test(appJs));
    // Перевіряємо ТІЛО функції, а не відстань у символах: попередній
    // варіант шукав no-image.png у межах 600 знаків від назви функції
    // й ламався щоразу, коли всередині зʼявлявся коментар.
    const body = (appJs.match(/function promoPicture\([\s\S]*?\n\}/) || [""])[0];

    // Формат запасної не прибитий цвяхами: 03.11.2026 переупаковка
    // перевела no-image.png у .webp, і перевірка впала, хоч нічого не
    // зламалось. Стережемо наявність запасної, а не її розширення.
    check("збережено запасну картинку при помилці завантаження",
        /no-image\.[a-z0-9]+/.test(body), body ? "" : "функцію не знайдено");

    // А ОСЬ ЦЕ СТАРА ПЕРЕВІРКА НЕ ВМІЛА.
    //
    // Збіг рядка нічого не каже про те, чи файл існує: описка на
    // кшталт no-image.wepb лишалась би зеленою доти, доки хтось не
    // побачить на сайті зламану картинку замість запасної. А її й
    // показують саме тоді, коли все інше вже пішло не так.
    const запасні = [...new Set(
        (appJs.match(/assets\/images\/no-image\.[a-z0-9]+/g) || []))];

    check("кожна згадана запасна картинка існує на диску",
        запасні.length > 0
        && запасні.every(rel => fs.existsSync(path.join(ROOT, rel))),
        запасні.filter(rel => !fs.existsSync(path.join(ROOT, rel))).join(", ")
            || (запасні.length ? "" : "посилань на запасну не знайдено"));
}

console.log("\n[2] Усі блоки акцій на головній переведені");
{
    const calls = appJs.match(/\$\{promoPicture\(promo, \d+\)\}/g) || [];
    // ЧОТИРИ — НИЖНЯ МЕЖА, А НЕ ТОЧНЕ ЧИСЛО.
    //
    // Спершу тут стояло === 4, і набір червонів щоразу, коли на
    // головній зʼявлявся ще один блок із фото акції — саме так сталося
    // з банером у блоці «Ціна дня». Важить інше: жоден блок не малює
    // фото повз помічника, а це перевіряють рядки нижче.
    check(`викликів promoPicture — ${calls.length}`, calls.length >= 4, calls.join(", "));

    // жоден блок не має лишитись зі старою розміткою
    //
    // МЕЖУ ПОМІЧНИКА ШУКАЄМО ПО КОДУ, А НЕ ВІДЛІЧУЄМО РЯДКИ.
    //
    // Доти тут стояло «пропустити 30 рядків після function
    // promoPicture» — на око, скільки займає тіло. 03.11.2026 у
    // помічника дописали пояснення, тіло переросло 30 рядків, і його
    // власний <img> потрапив у вибірку: перевірка почервоніла на
    // коментарі.
    const післяПомічника = appJs.split("function promoPicture")[1] || "";
    const кінець = післяПомічника.indexOf("\n}\n");
    const raw = кінець === -1 ? післяПомічника : післяПомічника.slice(кінець);
    check("не лишилось сирих <img src=\"${promo.image}\"> у блоках",
        !/<img\s+\n?\s*src="\$\{promo\.image\}"/.test(raw));

    [["promo-hero-slide-image", 768],
     ["brand-campaign-image", 700],
     ["brand-teaser-image", 700],
     ["promo-card-image", 700]].forEach(([cls, bp]) => {
        const at = appJs.indexOf(cls);
        const near = at === -1 ? "" : appJs.slice(at, at + 400);
        // Третій аргумент (атрибути завантаження) необов'язковий:
        // герой передає ним loading="eager", решта мовчить і дістає
        // типове відкладення.
        check(`${cls} → promoPicture з порогом ${bp}`,
            new RegExp(`promoPicture\\(promo, ${bp}[,)]`).test(near),
            at === -1 ? "блок не знайдено" : "порогу немає поруч");
    });
}

console.log("\n[3] Пороги збігаються з CSS, а не вигадані");
{
    // Якщо хтось змінить брейкпойнт у стилях, а тут ні — картинка
    // перемкнеться не там, де перебудується блок.
    //
    // @media(max-width:768px) у файлі кілька, тому шукаємо не перший,
    // а той блок, ВСЕРЕДИНІ якого справді лежить потрібне правило:
    // перша версія тесту брала перший і показувала неіснуючу помилку.
    const chunks = css.split("@media").slice(1);

    // Блок може мати правила в КІЛЬКОХ медіа-запитах (наприклад
    // .brand-teaser-image є і в 768px, і в 700px). Тому перевіряємо не
    // «єдиний брейкпойнт», а що поріг із JS справді існує в стилях для
    // цього блоку — саме це й потрібно, щоб картинка перемикалась там,
    // де перебудовується розкладка.
    const breakpointsOf = selector => {
        const found = [];
        chunks.forEach(chunk => {
            const own = chunk.split("@media")[0];
            if (own.indexOf(selector + "{") === -1) return;
            const m = own.match(/^\s*\(max-width:\s*(\d+)px\)/);
            if (m) found.push(Number(m[1]));
        });
        return found;
    };

    [[".brand-teaser-image", 700],
     [".brand-campaign-image", 700],
     [".promo-hero-slide-image", 768]].forEach(([sel, expected]) => {
        const bps = breakpointsOf(sel);
        check(`${sel}: поріг ${expected}px є в стилях`, bps.includes(expected),
            bps.length ? `у CSS лише ${bps.join(", ")}px` : "правил у @media немає");
    });

    check("brand-teaser-image на мобільному стає 4:3 (горизонтальним)",
        /@media\(max-width:700px\)[\s\S]{0,600}\.brand-teaser-image\{[\s\S]{0,140}aspect-ratio:4\/3/.test(css));
}

console.log("\n[4] <picture> розтягнутий стилями");
{
    // інлайновий <picture> не заповнює слот, і object-fit у <img>
    // не спрацьовує — картинка з'їжджає
    ["promo-hero-slide-image", "brand-campaign-image", "brand-teaser-image"].forEach(cls => {
        check(`${cls} picture розтягнутий`,
            new RegExp(`\\.${cls} picture`).test(css));
    });
}

console.log("\n[5] Дані: вказані мобільні фото існують");
{
    const dir = path.join(ROOT, "data/promotions");
    const missing = [];
    let withMobile = 0;

    fs.readdirSync(dir).filter(f => f.endsWith(".json")).forEach(f => {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        ["imageMobile", "promoPageImageMobile"].forEach(k => {
            if (!d[k]) return;
            withMobile++;
            const p = path.join(ROOT, decodeURIComponent(d[k]).replace(/^\//, ""));
            if (!fs.existsSync(p)) missing.push(`${f}:${k} → ${d[k]}`);
        });
    });

    check(`мобільних фото прописано — ${withMobile}`, withMobile >= 0);
    check("усі вони існують на диску", missing.length === 0, missing.join(" | "));

    const built = path.join(ROOT, "data/promotions.json");
    if (fs.existsSync(built)) {
        const list = JSON.parse(fs.readFileSync(built, "utf8"));
        check("imageMobile доходить до зібраного файлу",
            list.every(p => Object.prototype.hasOwnProperty.call(p, "imageMobile")));
    }
}

console.log("\n[6] Кадр акції чекає, поки до нього дійдуть");
{
    // ЩО ЦЕ ЗАКРИВАЄ
    // ---------------
    // ЗАМІРЯНО 03.11.2026 на проді, телефон 390×844: головна тягнула
    // 1388 КБ картинок, а на екрані була ОДНА. Найважчі лежали за
    // три-п'ять тисяч пікселів униз — mob009.webp 247 КБ у
    // brand-campaigns, 02marc-jacobs_banner 192 КБ і
    // 4coachsmall_card 173 КБ у brand-teasers. Усі негайні.
    //
    // Виправлення не в тому, щоб дописати lazy у чотирьох місцях, а в
    // тому, щоб зробити відкладення ТИПОВИМ: мовчазний виклик
    // відкладає, негайність просять вголос. Тоді новий рекламний блок
    // у майбутньому не потягне кадр наперед, і про це не треба
    // пам'ятати.
    //
    // ВИКОНУЄМО САМ ПОМІЧНИК. Інакше перевірка стерегла б текст, а не
    // поведінку, — і не побачила б, скажімо, що умову перевернули.
    const тіло = (appJs.match(/function promoPicture[\s\S]*?\n\}/) || [])[0] || "";

    check("помічник вийнято з app.js", Boolean(тіло));

    if (тіло) {

        const зробити = new Function("window", "promo", "breakpoint", "extraAttrs",
            тіло + "\nreturn promoPicture(promo, breakpoint, extraAttrs);");

        const вікно = { ImageFraming: { frameStyleAttr: () => "" } };
        const акція = { image: "/a/banner.webp", title: "Акція" };

        const мовчки = зробити(вікно, акція, 700, undefined);

        check("мовчазний виклик відкладає", /loading="lazy"/.test(мовчки), мовчки.slice(0, 120));

        check("і просить асинхронне декодування", /decoding="async"/.test(мовчки));

        const негайно = зробити(вікно, акція, 768, 'loading="eager" fetchpriority="high"');

        check("просьбу про негайність не перебиваємо",
            /loading="eager"/.test(негайно) && !/loading="lazy"/.test(негайно),
            негайно.slice(0, 140));

        check("і вагу теж лишаємо", /fetchpriority="high"/.test(негайно));

        // Запасна картинка мусить уціліти в обох випадках: атрибути
        // дописуються одним рядком, і зайвий пробіл з'їдав би сусіда.
        // Розширення не стережемо — його міняє переупаковка.
        check("запасна картинка на місці в обох",
            /no-image\.[a-z0-9]+/.test(мовчки) && /no-image\.[a-z0-9]+/.test(негайно));

    }

    // ПЕРШИЙ СЛАЙД ГЕРОЯ — ЄДИНИЙ, ХТО ПРОСИТЬ НЕГАЙНІСТЬ.
    //
    // Він і є головне зображення сторінки, кандидат на LCP.
    check("герой просить негайність для першого слайда",
        /index === 0[\s\S]{0,120}loading="eager"/.test(appJs),
        "перший слайд відклали б разом з усіма");

    // І ВАГУ — ТЕЖ У САМОМУ ГЕРОЇ.
    //
    // Перевірка вище («і вагу теж лишаємо») питає ПОМІЧНИКА, і
    // fetchpriority їй передає сам тест — тож вона лишалась зеленою,
    // коли атрибут прибирали з виклику героя. Дірку видно було лише
    // зламом.
    check("і вагу для нього теж",
        /index === 0[\s\S]{0,120}fetchpriority="high"/.test(appJs),
        "головне зображення змагалося б за чергу нарівні з усім");

    // ПЛИТКИ КАТЕГОРІЙ — У ДВОХ МІСЦЯХ.
    //
    // Розмітка свідомо продубльована: статична збірка малює перший
    // показ, app.js перемальовує після завантаження даних. Копії
    // мусять лишатись однаковими, інакше перша показувала б одне, а
    // друга інше.
    const статична = fs.readFileSync(path.join(ROOT, "scripts/build-home-static.js"), "utf8");

    const плиткаLazy = джерело =>
        /class="category">[\s\S]{0,260}loading="lazy"/.test(джерело);

    check("плитки категорій відкладені в app.js", плиткаLazy(appJs));

    check("і так само в build-home-static.js", плиткаLazy(статична),
        "копії розійшлись");
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
