// Латинські адреси товарів.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Ім'я файлу товару стає slug-ом, а slug — адресою /p/<slug>/. Адмінка
// збирає ім'я з назви, назви українські — і половина каталогу жила за
// адресами на кшталт /p/%D0%B3%D0%BE%D0%B4%D0%B8%D0%BD%D0%BD%D0%B8%D0%BA-…/
//
// На сайті цього не видно: браузер показує адресу розшифрованою. Видно
// там, де її КОПІЮЮТЬ — у полі «Посилання на товар», у постах. А в
// параметрі (t.me/…?text=…) вона кодується вдруге, %25D0%25B3, і
// посилання на один годинник займає 300 символів.
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const { translit, toSlug, isLatinSlug } = require("../scripts/translit");
const { renameToLatinSlugs } = require("../scripts/build-products");


console.log("\n[1] Таблиця КМУ 2010, а не власна вигадка");
{
    // Вигадана таблиця означала б, що завтра хтось перепише її інакше —
    // і всі адреси зміняться вдруге. Беремо офіційну: постанова КМУ №55
    // від 27.01.2010, та сама, що в закордонних паспортах.
    const пари = [
        ["Київ", "Kyiv"],
        ["Харків", "Kharkiv"],
        ["Жовті Води", "Zhovti Vody"],
        ["Ґалаґан", "Galagan"],
        ["Щастя", "Shchastia"],
        ["Згорани", "Zghorany"],      // зг → zgh, інакше не відрізнити від ж
        ["Розгон", "Rozghon"],
        ["Юрій", "Yurii"],            // ю на початку → yu, й усередині → i
        ["Крюківка", "Kriukivka"],    // ю всередині → iu
        ["Яготин", "Yahotyn"],        // я на початку → ya
        ["Знам'янка", "Znamianka"],   // апостроф не передається
        ["Ніжин", "Nizhyn"],
        ["Їжакевич", "Yizhakevych"],  // ї на початку → yi
        ["Кадиївка", "Kadyivka"],     // ї всередині → i
        ["Єнакієве", "Yenakiieve"],   // є на початку → ye, всередині → ie
        ["Русь", "Rus"]               // мʼякий знак не передається
    ];

    пари.forEach(([було, стало]) => {
        check(`${було} → ${стало}`, translit(було) === стало, translit(було));
    });

    // Для slug-а регістр байдужий, але translit() беруть і в інші
    // місця — підписи, заголовки. «ЩАСТЯ» там не має ставати
    // «SHCHASTIa»: одна літера в нижньому регістрі виглядає як збій.
    check("капслок лишається капслоком",
        translit("ЩАСТЯ") === "SHCHASTIA" && translit("КИЇВ") === "KYIV",
        translit("ЩАСТЯ") + " / " + translit("КИЇВ"));

    check("латиниця й цифри проходять як є",
        translit("Marc Jacobs T129.407") === "Marc Jacobs T129.407");
}

console.log("\n[2] Slug стабільний");
{
    // Збірка проганяє через toSlug КОЖНЕ ім'я файлу на кожному запуску.
    // Найменша нестабільність перейменовувала б товари по колу, щоразу
    // міняючи адресу — а стара при кожному оберті ставала б ще одним
    // перенаправленням.
    const зразки = [
        "годинник-tissot-classic-dream-swissmatic-t129-407-22-031-00",
        "marc-jacobs-sontsezakhysni-okuliary-marc-jacobs",
        "жіночі-бежеві-кросівки-з-чорними-деталями-lacoste-lineshot-746sfa0075-1r5"
    ];

    check("двічі те саме", зразки.every(s => toSlug(toSlug(s)) === toSlug(s)));

    check("латинський slug не чіпаємо",
        toSlug("marc-jacobs-sontsezakhysni-okuliary-marc-jacobs")
        === "marc-jacobs-sontsezakhysni-okuliary-marc-jacobs");

    check("у результаті лише [a-z0-9-]",
        зразки.every(s => /^[a-z0-9-]+$/.test(toSlug(s))), зразки.map(toSlug).join(" | "));

    check("країв і подвійних дефісів не лишається",
        toSlug("  Сумка — Coach!  ") === "sumka-coach", toSlug("  Сумка — Coach!  "));

    check("isLatinSlug відрізняє одне від одного",
        isLatinSlug("sumka-coach") && !isLatinSlug("сумка-coach"));
}

// Вихідні файли товарів, а не згенерований агрегат: у свіжому клоні
// data/products.json відстає від джерел до перезбірки, і тест падав би
// не через помилку, а через момент часу (правило з test-migration-types).
const файли = fs.readdirSync(path.join(ROOT, "data/products"))
    .filter(f => f.endsWith(".json"));

const каталог = файли.map(f =>
    JSON.parse(fs.readFileSync(path.join(ROOT, "data/products", f), "utf8")));


console.log("\n[3] У каталозі не лишилось кирилиці в адресах");
{
    const кириличні = файли.filter(f => !isLatinSlug(f.replace(/\.json$/, "")));

    check("імена файлів товарів латинські", кириличні.length === 0,
        кириличні.slice(0, 3).join(", "));

    const погані = каталог.filter(p => !/^[a-z0-9-]+$/.test(p.slug || ""));

    check("slug у товарах латинські", погані.length === 0,
        погані.slice(0, 3).map(p => p.slug).join(", "));

    // Ім'я файлу й slug — одна річ, а не дві. На цьому тримається і
    // перевірка slug-safety, і адреса запису в адмінці.
    const імена = new Set(файли.map(f => f.replace(/\.json$/, "")));

    check("slug збігається з іменем файлу",
        каталог.every(p => імена.has(p.slug)));
}

console.log("\n[4] Старі адреси не вмерли");
{
    // Адреси вже пішли в пости, в повідомлення покупцям і в пошуковий
    // індекс. Змінити slug без перенаправлення означало б перетворити
    // кожне з тих посилань на 404.
    const переїхали = каталог.filter(p => (p.legacySlugs || []).length);

    check("перейменовані товари памʼятають стару адресу", переїхали.length > 0,
        String(переїхали.length));

    const без = [];
    const биті = [];

    переїхали.forEach(product => {

        product.legacySlugs.forEach(old => {

            const file = path.join(ROOT, "p", old, "index.html");

            if (!fs.existsSync(file)) { без.push(old); return; }

            const html = fs.readFileSync(file, "utf8");

            const веде = html.includes(`/p/${product.slug}/`);
            const канонічна = /<link rel="canonical"/.test(html);
            const оновлення = /http-equiv="refresh"/.test(html);
            const скрипт = /location\.replace/.test(html);

            if (!(веде && канонічна && оновлення && скрипт)) биті.push(old);

        });

    });

    check("на кожну стару адресу є сторінка", без.length === 0, без.slice(0, 3).join(", "));

    // Три способи, і кожен для свого: canonical переносить вагу на нову
    // адресу, refresh рятує браузер без JS, replace не лишає стару
    // адресу в історії.
    check("перенаправлення повне — canonical, refresh і replace",
        биті.length === 0, биті.slice(0, 3).join(", "));

    // Сторінка товару лежить за новою адресою й не має бути
    // перенаправленням сама на себе.
    const приклад = переїхали[0];

    if (приклад) {

        const нова = fs.readFileSync(
            path.join(ROOT, "p", приклад.slug, "index.html"), "utf8");

        check("нова адреса віддає сам товар, а не редирект",
            !/http-equiv="refresh"/.test(нова) && нова.includes("productPage"));

    }
}

console.log("\n[5] Повторне збереження не робить дубля");
{
    // ЯК ЦЕ ВИХОДИТЬ. Товар створили, збірка перейменувала файл — але
    // вкладка адмінки лишилась на старій сторінці. Наступне «Зберегти»
    // пише за СТАРОЮ адресою й відтворює кириличний файл. Наївна
    // збірка вирішила б, що товарів два, і дала б другому «-2».
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bb4u-slug-"));

    const запис = (name, data) => {
        const filePath = path.join(dir, name);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
        return { file: name, filePath, data };
    };

    const parsed = [
        запис("tovar.json", { id: 5, slug: "tovar", title: "старе" }),
        запис("товар.json", { id: 5, title: "нове" })
    ];

    renameToLatinSlugs(parsed, dir);

    const лишилось = fs.readdirSync(dir).sort();

    check("файл лишився один", лишилось.length === 1, лишилось.join(", "));

    check("і саме під латинським іменем", лишилось[0] === "tovar.json");

    check("адреси з «-2» не зʼявилось", !лишилось.includes("tovar-2.json"));

    check("виграла свіжіша версія",
        JSON.parse(fs.readFileSync(path.join(dir, "tovar.json"), "utf8")).title === "нове");

    check("розбір теж лишився один", parsed.length === 1, String(parsed.length));

    // А от РІЗНІ товари з однаковою транслітерацією мусять розійтись.
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "bb4u-slug2-"));

    const запис2 = (name, data) => {
        const filePath = path.join(dir2, name);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
        return { file: name, filePath, data };
    };

    const parsed2 = [
        запис2("sumka.json", { id: 1, slug: "sumka", title: "перша" }),
        запис2("сумка.json", { id: 2, title: "друга" })
    ];

    renameToLatinSlugs(parsed2, dir2);

    const обидва = fs.readdirSync(dir2).sort();

    check("різні товари не з'їдають одне одного",
        обидва.length === 2 && обидва.includes("sumka-2.json"), обидва.join(", "));

    check("стару адресу другого записано",
        (parsed2.find(e => e.data.id === 2).data.legacySlugs || []).includes("сумка"));

    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dir2, { recursive: true, force: true });
}

console.log("\n[6] Адмінка показує адресу, а не її кодування");
{
    const widget = fs.readFileSync(path.join(ROOT, "admin/order-link-widget.js"), "utf8");

    const код = widget.replace(/\/\/[^\n]*/g, "");

    check("slug у посиланні не кодується",
        /return base \+ "\/p\/" \+ slug \+ "\/";/.test(код));

    check("для параметра є окремий, мʼякший кодувальник",
        /function encodeForQuery/.test(код));

    // Витягуємо саму функцію й перевіряємо на справжньому рядку: за
    // RFC 3986 «:» і «/» у query дозволені, а от «#» і «&» — ні.
    const start = код.indexOf("function encodeForQuery");
    const end = код.indexOf("\n    }", start);

    const encodeForQuery = new Function(
        код.slice(start, end + 6) + "; return encodeForQuery;")();

    const адреса = "https://bestbrnd4u.com/p/hodynnyk-tissot-classic-dream/";

    check("двокрапка й слеші лишаються собою",
        encodeForQuery(адреса) === адреса, encodeForQuery(адреса));

    check("того самого %3A%2F%2F більше немає",
        !/%3A|%2F/.test(encodeForQuery(адреса)));

    // Символи, які справді ламають параметр, екрануватись мусять:
    // «#» обрізає адресу, «&» починає наступний параметр.
    check("небезпечні символи все ще екрануються",
        encodeForQuery("a#b&c d") === "a%23b%26c%20d", encodeForQuery("a#b&c d"));

    // Тут звіряємо з СИРИМ файлом: у цьому рядку є "https://t.me/", і
    // наївне вирізання коментарів по «//» з'їло б його хвіст разом із
    // самим викликом.
    check("посилання в Telegram будується цим кодувальником",
        /\?text=" \+ encodeForQuery\(link\)/.test(widget));
}

console.log("\n[7] Розкладка перейменувань");
{
    const { planLatinRenames } = require("../scripts/translit");

    // Латинські імена займають своє місце ПЕРШИМИ: інакше
    // перейменований запис міг би сісти на чуже.
    const plan = planLatinRenames(["sumka", "сумка", "інша-сумка"]);

    check("латинське ім'я лишається собою", !plan.has("sumka"));

    check("тезка отримує -2", plan.get("сумка") === "sumka-2", plan.get("сумка"));

    check("решта перекладається як є",
        plan.get("інша-сумка") === "insha-sumka", plan.get("інша-сумка"));

    // Ім'я без жодної літери й цифри: адресу з нічого не вигадаєш, і
    // мовчки давати таке ім'я «-» гірше, ніж не чіпати зовсім.
    check("порожній результат пропускається", !planLatinRenames(["!!!"]).has("!!!"));

    check("порядок не залежить від того, хто перший",
        planLatinRenames(["сумка", "sumka"]).get("сумка") === "sumka-2");
}

console.log("\n[8] Акції: адреса, банери й старі посилання");
{
    const { renameToLatinSlugs } = require("../scripts/build-promotions");

    const файлиАкцій = fs.readdirSync(path.join(ROOT, "data/promotions"))
        .filter(f => f.endsWith(".json"));

    check("імена файлів акцій латинські",
        файлиАкцій.every(f => isLatinSlug(f.replace(/\.json$/, ""))),
        файлиАкцій.filter(f => !isLatinSlug(f.replace(/\.json$/, ""))).join(", "));

    const акції = файлиАкцій.map(f => ({
        slug: f.replace(/\.json$/, ""),
        ...JSON.parse(fs.readFileSync(path.join(ROOT, "data/promotions", f), "utf8"))
    }));

    check("перейменована акція памʼятає стару адресу",
        акції.some(p => (p.legacySlugs || []).length));

    // Найнебезпечніше в цій правці: банер веде на акцію ЗА SLUG-ом.
    // Перейменувати файл і не поправити банер — це посилання в нікуди,
    // яке помітять не одразу.
    const відомі = new Set(акції.map(p => p.slug));

    const попапи = fs.readdirSync(path.join(ROOT, "data/promo-popups"))
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, "data/promo-popups", f), "utf8")));

    const висячі = попапи.filter(p => p.promoSlug && !відомі.has(p.promoSlug));

    check("жодне спливне вікно не веде на неіснуючу акцію",
        висячі.length === 0, висячі.map(p => p.promoSlug).join(", "));

    // А тепер сам механізм — на тимчасовій теці, бо в бойових даних
    // жодне вікно на перейменовану акцію не вказує.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bb4u-promo-"));
    const promotions = path.join(dir, "promotions");
    const popups = path.join(dir, "popups");

    fs.mkdirSync(promotions);
    fs.mkdirSync(popups);

    fs.writeFileSync(path.join(promotions, "знижки-літа.json"),
        JSON.stringify({ title: "Знижки літа" }), "utf8");

    fs.writeFileSync(path.join(popups, "popup.json"),
        JSON.stringify({ title: "вікно", promoSlug: "знижки-літа" }), "utf8");

    const результат = renameToLatinSlugs(["знижки-літа.json"], { promotions, popups });

    check("файл акції перейменовано",
        fs.existsSync(path.join(promotions, "znyzhky-lita.json"))
        && !fs.existsSync(path.join(promotions, "знижки-літа.json")));

    check("список файлів повертається вже новий",
        результат[0] === "znyzhky-lita.json", результат[0]);

    check("стару адресу записано в акцію",
        JSON.parse(fs.readFileSync(path.join(promotions, "znyzhky-lita.json"), "utf8"))
            .legacySlugs.includes("знижки-літа"));

    check("спливне вікно переставлено на нову адресу",
        JSON.parse(fs.readFileSync(path.join(popups, "popup.json"), "utf8"))
            .promoSlug === "znyzhky-lita");

    fs.rmSync(dir, { recursive: true, force: true });

    // Сторінка акції мусить приймати стару адресу — інакше посилання з
    // постів показували б «акцію не знайдено» на сторінці, яка є.
    const promoJs = fs.readFileSync(path.join(ROOT, "assets/js/promo.js"), "utf8");

    check("сторінка акції шукає і за старими адресами",
        /legacySlugs\)\s*&&\s*p\.legacySlugs\.includes\(slug\)/.test(promoJs));

    check("і підміняє адресу на канонічну без перезавантаження",
        /history\.replaceState/.test(promoJs) && !/location\.href = canonical/.test(promoJs));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
