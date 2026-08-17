// Статична розмітка index.html має збігатися з data/home.json.
//
// ЧОМУ ЦЕ ВАЖЛИВО
// ----------------
// index.html містить готову розмітку головної, а app.js після
// завантаження перемальовує її з даних. Поки скрипт не відпрацював,
// браузер показує — і встигає докачати — те, що зашите в HTML. Якщо
// там стара картинка, вона блимає на частку секунди при кожному
// оновленні сторінки.
//
// Так було двічі: спершу з головним банером (запасна картинка в CSS),
// потім з «Популярними категоріями» (чотири старі фото прямо в
// розмітці). Вписати актуальні шляхи руками — рішення на один раз:
// блимання повертається, щойно фото поміняють в адмінці.
//
// Тому розмітку генерує scripts/build-home-static.js, а цей набір
// стежить, щоб вона не розійшлася з даними знову.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const home = JSON.parse(fs.readFileSync(path.join(ROOT, "data/home.json"), "utf8"));

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

console.log("\n[1] Жодних зовнішніх картинок у розмітці головної");
{
    // саме вони й блимали: чужий хост, який до того ж треба чекати
    const external = html.match(/(?:src|content)="https?:\/\/(?!bestbrnd4u)[^"]+\.(?:jpe?g|png|webp)[^"]*"/gi) || [];

    check("немає посилань на сторонні фото", external.length === 0,
        external.slice(0, 3).join(" | "));

    check("немає pexels", !/pexels/i.test(html));
}

console.log("\n[2] Категорії в розмітці = категорії в даних");
{
    const items = (home.categories && home.categories.items) || [];

    check(`категорій у даних — ${items.length}`, items.length > 0);

    const grid = html.slice(html.indexOf('id="categoriesGrid"'));
    const block = grid.slice(0, grid.indexOf("</div>"));

    items.forEach(item => {
        check(`«${item.label}» — те саме фото, що в даних`,
            !item.image || block.includes(item.image),
            item.image);
        check(`«${item.label}» — те саме посилання`,
            !item.link || block.includes(item.link));
    });
}

console.log("\n[3] Банери в розмітці = банери в даних");
{
    if (home.hero && home.hero.image) {
        check("фон головного банера прописаний у розмітці",
            html.includes(`--hero-bg:url('${home.hero.image}')`), home.hero.image);
    }

    if (home.promo && home.promo.image) {
        check("фон банера «Нова колекція» прописаний у розмітці",
            html.includes(`--promo-bg:url('${home.promo.image}')`), home.promo.image);
    }

    check("og:image веде на власний домен",
        /og:image" content="https:\/\/bestbrnd4u\.github\.io\//.test(html));
}

console.log("\n[4] Бренди й випадаюче меню теж не застаріли");
{
    const brands = (home.brands && home.brands.items) || [];

    brands.forEach(b => {
        check(`бренд ${b.name} є в розмітці`, html.includes(b.link), b.link);
    });

    // у меню ті самі статі, що й у плитках категорій
    const byGender = {};
    ((home.categories && home.categories.items) || []).forEach(i => {
        const m = String(i.link || "").match(/gender=([^&]+)/);
        if (m && i.image) byGender[decodeURIComponent(m[1])] = i.image;
    });

    const menu = html.match(/<a class="mega-item"[^>]*>[\s\S]*?<\/a>/g) || [];

    check(`пунктів меню зі статтю — ${menu.length}`, menu.length > 0);

    const stale = menu.filter(a => {
        const g = a.match(/gender=([^"&]+)/);
        if (!g) return false;
        const want = byGender[decodeURIComponent(g[1])];
        return want && !a.includes(want);
    });

    check("усі фото в меню взяті з даних категорій", stale.length === 0,
        stale.slice(0, 2).map(a => a.slice(0, 80)).join(" | "));
}

console.log("\n[5] Крок вбудований у збірку, а не разова правка");
{
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    check("build викликає build-home-static.js",
        pkg.scripts.build.includes("build-home-static.js"));

    const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/build-products.yml"), "utf8");
    check("workflow викликає його теж", wf.includes("build-home-static.js"));
    check("оновлений index.html комітиться", /git add[\s\S]{0,200}index\.html/.test(wf));

    // порядок: спершу дані, потім розмітка з них
    check("крок іде після збірки даних",
        wf.indexOf("build-products.js") < wf.indexOf("build-home-static.js"));
}

console.log("\n[6] Усі згадані в розмітці локальні фото існують");
{
    const local = [...new Set((html.match(/src="(\/assets\/images\/[^"]+)"/g) || [])
        .map(s => s.slice(5, -1)))];

    const missing = local.filter(p => !fs.existsSync(path.join(ROOT, decodeURIComponent(p).replace(/^\//, ""))));

    check(`локальних фото в розмітці — ${local.length}`, local.length > 0);
    check("жодного биті посилання", missing.length === 0, missing.join(", "));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
