// Бренд як окрема сторінка: логотип на товарі веде в каталог бренду,
// а той каталог має банер, назву бренду в заголовку й опис із
// «Детальніше».
//
// ЩО САМЕ ЦЕ ЗАКРІПЛЮЄ
//
// 1. Бренд на сторінці товару був текстом і лишається текстом, поки
//    логотип не заведено в адмінці. Тобто 20 наявних брендів працюють
//    як працювали.
//
// 2. Назва бренду не зникає з розмітки навіть під логотипом: її читає
//    програма для незрячих і бере лайтбокс (він шукає
//    .product-info .brand). Приберемо — і підпис у лайтбоксі стане
//    порожнім, причому мовчки.
//
// 3. Каталог бренду — це той самий /catalog з фільтром, а не нова
//    сторінка. Вибір статі тому не веде нікуди: людина лишається на
//    сторінці бренду, а стать дописується до заголовка.
//
// 4. Банер і опис показуються лише коли обрано РІВНО один бренд:
//    з двома у фільтрі банер одного з них брехав би про вміст.
//
// 5. promo.html підключає той самий catalog.js, але цих блоків не має
//    — і має власні хлібні крихти. Перемальовування заголовка не
//    сміє їх затерти.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const catalogJs = read("assets/js/catalog.js");
const productJs = read("assets/js/product.js");
const catalogHtml = read("catalog.html");
const promoHtml = read("promo.html");
const css = read("assets/css/style.css");
const config = read("admin/config.yml");
const buildProducts = read("scripts/build-products.js");

console.log("\n[1] Збірка брендів (scripts/build-brands.js)");
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brands-"));

    const brandsDir = path.join(tmp, "data", "brands");
    const productsDir = path.join(tmp, "data", "products");
    const imagesDir = path.join(tmp, "assets", "images", "brands");

    [brandsDir, productsDir, imagesDir].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

    fs.writeFileSync(path.join(imagesDir, "logo.png"), "картинка");

    const write = (dir, name, data) =>
        fs.writeFileSync(path.join(dir, name), JSON.stringify(data), "utf8");

    // Хвостовий пробіл у назві — не вигадка: «Invicta » саме так
    // і лежить у даних товарів.
    write(brandsDir, "tommy.json", {
        name: "Tommy Hilfiger ",
        logo: "/assets/images/brands/logo.png",
        banner: "",
        title: "",
        description: "Про бренд."
    });

    write(brandsDir, "acme.json", { name: "Acme", logo: "", description: "" });

    write(productsDir, "a.json", { brand: "tommy hilfiger", title: "A" });
    write(productsDir, "b.json", { brand: "Tommy Hilfiger", title: "B" });

    const log = execFileSync(process.execPath,
        [path.join(ROOT, "scripts", "build-brands.js"), `--root=${tmp}`],
        { encoding: "utf8" });

    const out = JSON.parse(fs.readFileSync(path.join(tmp, "data", "brands.json"), "utf8"));

    const tommy = out.find(b => b.name === "Tommy Hilfiger");

    check("бренди зібрані в data/brands.json", out.length === 2, out.length);

    check("назва без хвостових пробілів", Boolean(tommy), out.map(b => b.name).join("|"));

    check("товари бренду порахувалися попри різний регістр",
        tommy && tommy.products === 2, tommy && tommy.products);

    check("slug для адреси каталогу",
        tommy && tommy.slug === "tommy-hilfiger", tommy && tommy.slug);

    // Логотип замінюють, лишаючи те саме імʼя файлу, — без версії
    // браузер ще довго показував би старий.
    check("логотип отримав версію в адресі",
        tommy && /^\/assets\/images\/brands\/logo\.png\?v=[0-9a-f]{8}$/.test(tommy.logo),
        tommy && tommy.logo);

    check("бренд без жодного товару — попередження в лозі",
        log.includes("Acme") && log.includes("жодного товару"));

    check("порядок за назвою", out[0].name === "Acme", out.map(b => b.name).join("|"));

    // Теки може не бути взагалі: бренди необовʼязкові.
    fs.rmSync(path.join(tmp, "data", "brands"), { recursive: true, force: true });

    execFileSync(process.execPath,
        [path.join(ROOT, "scripts", "build-brands.js"), `--root=${tmp}`],
        { encoding: "utf8" });

    check("без теки брендів — порожній список, а не падіння",
        fs.readFileSync(path.join(tmp, "data", "brands.json"), "utf8").trim() === "[]");

    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("\n[2] Логотип на сторінці товару");
{
    check("логотип показується, лише коли він заведений",
        /product\.brandLogo \? " brand-has-logo" : ""/.test(productJs)
        && /product\.brandLogo\s*\n?\s*\? `<img class="brand-logo"/.test(productJs));

    check("назва бренду лишається в розмітці під логотипом",
        /<span class="brand-name">\$\{escapeHtml\(product\.brand\)\}<\/span>/.test(productJs));

    check("у картинки порожній alt — назву вже озвучує span",
        /class="brand-logo"[^>]*alt=""/.test(productJs));

    check("логотип веде в каталог цього бренду",
        /<a class="brand\$\{[^}]+\}" href="catalog\?brand=\$\{encodeURIComponent\(product\.brand\)\}">/.test(productJs));

    // Приховуємо назву саме класами, а не видаленням з DOM.
    check("назва прибрана з очей, а не з дерева",
        /\.brand-has-logo \.brand-name\{[^}]*clip:rect\(0 0 0 0\)/.test(css));

    check("лайтбокс і далі читає назву бренду",
        /\.product-info \.brand"\)\?\.textContent/.test(productJs));

    // Статична (до-JS) версія сторінки — єдине, що бачить робот
    // пошуковика: без посилання каталог бренду лишився б без жодного
    // внутрішнього лінка.
    const staticPages = fs.existsSync(path.join(ROOT, "p"))
        ? fs.readdirSync(path.join(ROOT, "p")).slice(0, 5)
        : [];

    const linked = staticPages.filter(slug => {
        const file = path.join(ROOT, "p", slug, "index.html");
        return fs.existsSync(file)
            && /<p class="product-static-brand"><a href="\/catalog\?brand=/.test(fs.readFileSync(file, "utf8"));
    });

    check("на статичній сторінці бренд — посилання",
        staticPages.length === 0 || linked.length === staticPages.length,
        `${linked.length} з ${staticPages.length}`);

    check("logo з data/brands.json потрапляє в кожен товар",
        /data\.brandLogo = logo;/.test(buildProducts)
        && /LOGOS\.get\(String\(data\.brand \|\| ""\)\.trim\(\)\.toLowerCase\(\)\)/.test(buildProducts));

    check("бренд без логотипа не лишає старе значення в товарі",
        /else delete data\.brandLogo;/.test(buildProducts));
}

console.log("\n[3] Каталог бренду");
{
    check("банер стоїть над заголовком, опис — під ним",
        catalogHtml.indexOf('id="brandHero"') < catalogHtml.indexOf('id="catalogTitle"')
        && catalogHtml.indexOf('id="catalogTitle"') < catalogHtml.indexOf('id="brandAbout"'));

    check("обидва блоки спершу приховані",
        /<div class="brand-hero" id="brandHero" hidden><\/div>/.test(catalogHtml)
        && /<div class="brand-about" id="brandAbout" hidden><\/div>/.test(catalogHtml));

    check("бренди вантажаться до побудови заголовка",
        catalogJs.indexOf("await loadBrands();") > 0
        && catalogJs.indexOf("await loadBrands();") < catalogJs.indexOf("renderBreadcrumbsAndTitle();"));

    check("сторінка бренду — це РІВНО один обраний бренд",
        /selectedBrands\.size === 1 \? \[\.\.\.selectedBrands\]\[0\] : ""/.test(catalogJs));

    check("назва зіставляється без регістру й зайвих пробілів",
        /function brandKey\(name\) \{\s*\n\s*return String\(name \|\| ""\)\.trim\(\)\.toLowerCase\(\);/.test(catalogJs));

    check("блок перемальовується разом із товарами",
        /renderBrandHero\(\);\s*\n\s*renderActiveFilters\(\);/.test(catalogJs));

    check("немає банера — показуємо логотип",
        /brand\.banner \? "brand-hero-banner" : "brand-hero-logo"/.test(catalogJs));

    check("порожній блок ховається",
        /brandHero\.hidden = !banner;/.test(catalogJs)
        && /brandAbout\.hidden = !text;/.test(catalogJs));
}

console.log("\n[4] Стать не змінює сторінку, лише заголовок");
{
    check("«Жінкам» → «для жінок» у заголовку",
        /"Жінкам": "для жінок"/.test(catalogJs)
        && /"Чоловікам": "для чоловіків"/.test(catalogJs));

    check("своя назва з адмінки або «Товари <бренд>»",
        /const base = \(brand && brand\.title\) \|\| `Товари \$\{name\}`/.test(catalogJs));

    check("стать дописується лише коли обрана одна",
        /if \(selectedGenders\.size !== 1\) return base;/.test(catalogJs));

    check("у підзаголовку стать не дублюється",
        /if \(!brandName\) subtitle = `\$\{subtitle\} · \$\{label\}`;/.test(catalogJs));

    check("бренд стає крихтою і назвою вкладки",
        /crumbs\.push\(\{ label: brandName, href: `catalog\?brand=\$\{latinParam\(brandName\)\}` \}\)/.test(catalogJs)
        && /`\$\{brandPageTitle\(brandName\)\} \| BestBrnd4u`/.test(catalogJs));

    // У «Новинках» і «Акціях» бренд — саме фільтр, а не тема сторінки.
    check("в акціях і новинках заголовок лишається їхнім",
        /const brandName = currentSection \? "" : selectedBrandName\(\);/.test(catalogJs));
}

console.log("\n[5] Опис із «Детальніше»");
{
    check("текст екранується, абзаци робляться з порожніх рядків",
        /escapeHtml\(block\.trim\(\)\)\.replace\(\/\\n\/g, "<br>"\)/.test(catalogJs)
        && /split\(\/\\n\\s\*\\n\/\)/.test(catalogJs));

    check("довгий текст згорнутий",
        /\.brand-about-text\{[^}]*-webkit-line-clamp:2/.test(css)
        && /\.brand-about\.is-open \.brand-about-text\{[^}]*overflow:visible/.test(css));

    // Під коротким описом кнопка нічого не розкриває й виглядає
    // зламаною, тому спершу міряємо.
    check("кнопка з'являється, лише якщо текст не вміщується",
        /toggle\.hidden = textEl\.scrollHeight <= textEl\.clientHeight \+ 1;/.test(catalogJs)
        && /class="brand-about-toggle" hidden>/.test(catalogJs));

    check("кнопка перемикає підпис",
        /toggle\.textContent = open \? "Згорнути" : "Детальніше";/.test(catalogJs));
}

console.log("\n[6] promo.html не зачеплено");
{
    check("promo.html підключає той самий catalog.js",
        /assets\/js\/catalog\.js/.test(promoHtml));

    check("у promo.html блоків бренду немає",
        !promoHtml.includes('id="brandHero"') && !promoHtml.includes('id="brandAbout"'));

    // Без цього сторожа renderBrandHero() перемалював би на promo.html
    // хлібні крихти акції в «Головна → Каталог».
    check("без блоків функція виходить одразу",
        /if \(!brandHero \|\| !brandAbout\) return;/.test(catalogJs));
}

console.log("\n[7] Адмінка: колекція «Бренди»");
{
    const block = config.slice(config.indexOf('- name: "brands"\n    label: "Бренди"'));

    check("колекція заведена", block.length > 0 && /folder: "data\/brands"/.test(block));

    ["name", "logo", "banner", "title", "description"].forEach(field => {
        check(`поле ${field}`, new RegExp(`name: "${field}"`).test(block.slice(0, 3000)));
    });

    // Загальна тека — assets/images/products/uploads, а там працює
    // обробка фото товарів: вибілювання тла й вирізання предмета.
    // Логотип на прозорому тлі вона зіпсувала б.
    check("картинки бренду — в окремій теці",
        /media_folder: "\/assets\/images\/brands"/.test(block.slice(0, 3000)));

    check("збірка брендів стоїть у ланцюжку ДО збірки товарів",
        (() => {
            const scripts = JSON.parse(read("package.json")).scripts.build;
            return scripts.indexOf("build-brands.js") > 0
                && scripts.indexOf("build-brands.js") < scripts.indexOf("build-products.js");
        })());
}

console.log(failures === 0
    ? "\n✅ Бренди: усе на місці\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
