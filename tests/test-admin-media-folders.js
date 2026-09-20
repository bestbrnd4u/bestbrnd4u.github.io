// Медіатека полів в адмінці має відкриватись там, де фото реально лежать.
//
// ЩО ЗЛАМАЛОСЬ
// -------------
// Банери винесені в окрему теку assets/images/banners — у них своя,
// широка геометрія, і скрипт приведення фото товарів до 4:5 їх не
// чіпає. Але глобальний media_folder в адмінці лишився старий,
// assets/images/products/uploads. Через це діалог вибору фото для
// банерних полів відкривався не в тій теці: вже вибраний банер у ній
// не знаходився, а завантаження нового поводилось непередбачувано.
//
// Лікується полем media_folder на рівні САМОГО поля. Цей набір
// стежить, щоб теки в конфізі й реальні шляхи в даних не розʼїхались
// знову — вручну таке помітно не одразу.
const fs = require("fs");
const path = require("path");
const { ROOT, loadYaml } = require("./helpers/yaml");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const config = loadYaml("admin/config.yml");
const BANNERS = "/assets/images/banners";

// збираємо всі поля-картинки разом зі шляхом до них
function imageFields(fields, trail) {

    const out = [];

    (fields || []).forEach(f => {

        if (!f) return;

        const here = trail.concat(f.name || f.label || "?");

        if (f.widget === "image") out.push({ field: f, trail: here });

        if (f.fields) out.push(...imageFields(f.fields, here));
        if (f.field) out.push(...imageFields([f.field], here));

    });

    return out;

}

const all = [];

config.collections.forEach(col => {
    if (col.files) col.files.forEach(file => all.push(...imageFields(file.fields, [col.name, file.name])));
    if (col.fields) all.push(...imageFields(col.fields, [col.name]));
});

console.log("\n[1] Поля-картинки знайдені");
{
    check(`полів з widget: image — ${all.length}`, all.length >= 10, all.length);
    check("глобальний media_folder — тека фото товарів",
        config.media_folder === "assets/images/products/uploads", config.media_folder);
}

console.log("\n[2] Банерні поля дивляться в теку банерів");
{
    const banner = all.filter(x => String(x.field.media_folder || "").includes("banners"));

    // Було 9. Десяте — плитка розділу на головній: вона переїхала з
    // теки фото товарів разом із самими файлами (див. [3]).
    check(`полів переведено на теку банерів — ${banner.length}`, banner.length === 10, banner.length);

    check("у кожного заповнений і public_folder (з ним будується шлях у даних)",
        banner.every(x => x.field.public_folder === BANNERS),
        banner.filter(x => x.field.public_folder !== BANNERS).map(x => x.trail.join("/")).join(", "));

    check("media_folder і public_folder збігаються",
        banner.every(x => x.field.media_folder === x.field.public_folder));
}

console.log("\n[3] Конфіг збігається з тим, що реально в даних");
{
    // Головна перевірка набору: якщо значення поля лежить у banners,
    // то й поле має бути налаштоване на banners — інакше адмінка
    // відкриє не ту теку.
    //
    // Шукаємо поле за ПОВНИМ шляхом у конфізі, а не за голим іменем:
    // полів з name "image" тут аж чотири (банер, фото категорії, фото
    // товару…), і пошук за іменем брав випадкове з них — через це
    // перша версія тесту показувала неіснуючу помилку.
    const cfgAt = trail => {
        const hit = all.find(x => x.trail.join("/") === trail);
        return hit ? hit.field : null;
    };

    const problems = [];

    function inspect(file, obj, keys, trailPrefix) {
        keys.forEach(k => {
            const value = obj && obj[k];
            if (typeof value !== "string" || !value) return;
            const cfg = cfgAt(`${trailPrefix}/${k}`);
            if (!cfg) { problems.push(`${file}:${k} — поля немає в конфізі`); return; }
            const inBanners = value.includes("/assets/images/banners/");
            const cfgBanners = String(cfg.media_folder || "").includes("banners");
            if (inBanners !== cfgBanners) {
                problems.push(`${file}:${k} → файл ${inBanners ? "у banners" : "у uploads"}, `
                    + `а поле налаштоване на ${cfgBanners ? "banners" : "uploads"}`);
            }
        });
    }

    const KEYS = ["image", "imageMobile", "promoPageImage", "promoPageImageMobile"];

    [["data/promotions", "promotions"],
     ["data/collections", "collections"],
     ["data/promo-popups", "promoPopups"]].forEach(([dir, collection]) => {
        const full = path.join(ROOT, dir);
        if (!fs.existsSync(full)) return;
        fs.readdirSync(full).filter(f => f.endsWith(".json")).forEach(f => {
            inspect(`${dir}/${f}`, JSON.parse(fs.readFileSync(path.join(full, f), "utf8")),
                KEYS, collection);
        });
    });

    const home = JSON.parse(fs.readFileSync(path.join(ROOT, "data/home.json"), "utf8"));
    inspect("home.hero", home.hero, ["image"], "pages/home/hero");
    inspect("home.promo", home.promo, ["image"], "pages/home/promo");

    check("жодне значення не суперечить налаштуванню поля",
        problems.length === 0, problems.slice(0, 4).join(" | "));

    // Фото ТОВАРУ навмисно лишається в теці фото товарів: його
    // приводить до 4:5 збірка, а вибілювач тла чистить фон. Банерам
    // це протипоказано.
    check("фото товару лишилось у теці фото товарів",
        !cfgAt("products/variants/images/image").media_folder);

    // А ПЛИТКА РОЗДІЛУ ЗВІДТИ ПІШЛА — і це саме те, чого їй бракувало.
    //
    // Раніше вона лежала в теці товарів, і це було не рішення, а
    // випадковість: медіатека поля відкривалась там, туди й
    // завантажувалось. Ціна: вибілювач обходить ту теку цілком, тож
    // переупакувати плитку в webp означало б віддати знімок із
    // моделлю алгоритму, який заливає тло білим. Через це чотири
    // плитки роками лишались PNG по 2 МБ — 8,4 МБ на головній.
    //
    // Тепер вони в banners і важать по 130–190 КБ. Поле мусить
    // дивитись туди ж, інакше вже вибрана плитка в медіатеці не
    // знайдеться.
    const tile = cfgAt("pages/home/categories/items/image");

    check("плитка розділу дивиться в теку банерів",
        tile && tile.media_folder === BANNERS, tile && tile.media_folder);

    // Картинки брендів лежать у ТРЕТІЙ теці, і поля про це не знали
    // ще до плиток: усі 63 файли в /assets/images/brands, а медіатека
    // відкривалась на фото товарів. Вибрати наявний логотип було
    // неможливо — лишалось заливати копію.
    const BRANDS = "/assets/images/brands";

    ["logo", "banner", "bannerMobile"].forEach(name => {

        const field = cfgAt(`brands/${name}`);

        check(`бренди/${name}: медіатека в теці брендів`,
            field && field.media_folder === BRANDS && field.public_folder === BRANDS,
            field ? field.media_folder : "поля немає в конфізі");

    });

    // І файли там справді лежать — інакше ми просто перенаправили
    // медіатеку в порожнечу.
    const brandsDir = path.join(ROOT, "assets/images/brands");

    check("тека брендів не порожня",
        fs.existsSync(brandsDir) && fs.readdirSync(brandsDir).length > 0,
        fs.existsSync(brandsDir) ? "0 файлів" : "теки немає");
}

console.log("\n[4] Усі вказані банери справді існують");
{
    const missing = [];

    const walkValues = obj => {
        if (!obj || typeof obj !== "object") return;
        Object.values(obj).forEach(v => {
            if (typeof v === "string" && v.includes("/assets/images/banners/")) {
                if (!fs.existsSync(path.join(ROOT, decodeURIComponent(v).replace(/^\//, "")))) missing.push(v);
            } else if (typeof v === "object") walkValues(v);
        });
    };

    ["data/promotions", "data/collections", "data/promo-popups"].forEach(dir => {
        const full = path.join(ROOT, dir);
        if (!fs.existsSync(full)) return;
        fs.readdirSync(full).filter(f => f.endsWith(".json"))
            .forEach(f => walkValues(JSON.parse(fs.readFileSync(path.join(full, f), "utf8"))));
    });

    walkValues(JSON.parse(fs.readFileSync(path.join(ROOT, "data/home.json"), "utf8")));

    check("жодного посилання на неіснуючий банер", missing.length === 0, missing.join(", "));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
