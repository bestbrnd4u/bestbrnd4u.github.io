// Латиниця в адресі фільтра каталогу.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Фільтр клав у адресу значення як є:
//
//   ?color=Чорний&gender=Жінкам&category=Жіночі сумки
//
// Браузер кодує кирилицю відсотками — девʼять символів на літеру:
//
//   ?color=%D0%A7%D0%BE%D1%80%D0%BD%D0%B8%D0%B9&gender=%D0%96%D1%96…
//
// В адресному рядку видно розшифроване, а от скрізь, де посилання
// СКОПІЮВАТИ (пост, повідомлення, лист), вилазить саме ця борода. А в
// параметрі (t.me/…?text=…) вона кодується вдруге й стає втричі
// довшою за сам фільтр.
//
// Адреси товарів і акцій латиницею стали раніше; тепер те саме для
// фільтрів, тим самим перетворювачем.
//
// ЧОМУ ПЕРЕВІРКИ САМЕ ТАКІ
// -------------------------
// Головне тут не «в коді є виклик toSlug», а ЗАМКНЕНЕ КОЛО: значення
// пішло в адресу латиницею і повернулося тим самим значенням. Тому
// перевіряємо круговий обхід на справжніх даних каталогу, а не рядки
// у файлі.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const { toSlug } = require("../assets/js/translit.js");

const catalog = read("assets/js/catalog.js");

const all = JSON.parse(read("data/products.json"));
const products = Array.isArray(all) ? all : (all.products || []);


console.log("\n[1] Перетворювач один на сайт і збірку");
{
    // Копія в браузері розійшлася б із цією за тиждень, а розходження
    // тут означає адреси, які відкриваються з порожнім фільтром.
    check("модуль лежить у assets/js", fs.existsSync(path.join(ROOT, "assets/js/translit.js")));

    check("старий шлях у scripts/ веде на нього ж",
        /require\("\.\.\/assets\/js\/translit\.js"\)/.test(read("scripts/translit.js")));

    // Той самий файл мусить працювати і в Node (збірка), і в браузері.
    const module_ = read("assets/js/translit.js");

    check("модуль дволикий: window і module.exports",
        /window\.Translit = \{/.test(module_)
        && /typeof module !== "undefined" && module\.exports/.test(module_));

    check("каталог його підключає", /assets\/js\/translit\.js/.test(read("catalog.html")));

    // Збірка досі користується старим шляхом — він мусить працювати.
    check("збірка не зламалась",
        typeof require("../scripts/translit.js").toSlug === "function");
}

console.log("\n[2] Адреса будується латиницею");
{
    check("значення фільтра проходять через транслітерацію",
        /\[\.\.\.set\]\.map\(latinParam\)\.join\(","\)/.test(catalog));

    check("перетворювач один — window.Translit",
        /window\.Translit \? window\.Translit\.toSlug\(value\)/.test(catalog));

    // Немає перетворювача (не підключився) — краще борода в адресі,
    // ніж мовчазно зламаний фільтр.
    check("без перетворювача значення лишається як є",
        /return slug \|\| String\(value/.test(catalog));

    // Кому ми ж і обрали роздільником заради читабельності —
    // кодувати її означає втратити половину зиску.
    check("кома лишається комою",
        /url\.search\.replace\(\/%2C\/gi, ","\)/.test(catalog));
}

console.log("\n[3] Замкнене коло на справжніх даних");
{
    // Беремо те, що реально лежить у каталозі, і проганяємо
    // «значення → адреса → значення».
    const собери = key => {

        const out = new Set();

        products.forEach(product => {

            const value = product[key];

            if (Array.isArray(value)) value.forEach(item => item && out.add(item));
            else if (value) out.add(value);

        });

        return [...out];

    };

    const набори = {
        "категорії": собери("category"),
        "бренди": собери("brand"),
        "стать": собери("gender"),
        "розміри": собери("sizes")
    };

    Object.entries(набори).forEach(([назва, значення]) => {

        check(`${назва}: у каталозі щось є`, значення.length > 0, String(значення.length));

        // Порожній slug означає адресу без значення — фільтр мовчки
        // не застосується.
        const порожні = значення.filter(v => !toSlug(v));

        check(`${назва}: у кожного є що покласти в адресу`,
            порожні.length === 0, порожні.join(", "));

        // Зіткнення означає, що з адреси не відновити, яке саме
        // значення мали на увазі: «?brand=coach» вело б у два бренди.
        const зайняті = new Map();
        const зіткнення = [];

        значення.forEach(v => {

            const slug = toSlug(v);

            if (зайняті.has(slug)) зіткнення.push(`${зайняті.get(slug)} = ${v} (${slug})`);
            else зайняті.set(slug, v);

        });

        check(`${назва}: два значення не дають один slug`,
            зіткнення.length === 0, зіткнення.slice(0, 3).join("; "));

        // І головне: латиниця, а не відсотки.
        const зКирилицею = значення.filter(v => encodeURIComponent(toSlug(v)) !== toSlug(v));

        check(`${назва}: адреса лишається читабельною`,
            зКирилицею.length === 0, зКирилицею.slice(0, 3).join(", "));

    });

    // Сімʼї кольорів — окремо: вони не поле товару, а результат
    // зведення, і саме вони лежать у ?color=.
    const families = [
        "Чорний", "Білий", "Сірий", "Бежевий", "Коричневий",
        "Синій", "Зелений", "Червоний", "Рожевий", "Помаранчевий",
        "Жовтий", "Фіолетовий", "Золотий", "Мультиколір", "Інші"
    ];

    const slugs = families.map(toSlug);

    check("кольори: кожен дає непорожній slug", slugs.every(Boolean), slugs.join(","));

    check("кольори: slug-и не збігаються між собою",
        new Set(slugs).size === slugs.length, slugs.join(","));

    check("кольори: приклад читається",
        toSlug("Чорний") === "chornyi" && toSlug("Мультиколір") === "multykolir",
        `${toSlug("Чорний")} / ${toSlug("Мультиколір")}`);
}

console.log("\n[4] Старі посилання не ламаються");
{
    // Кирилиця з уже розісланих і проіндексованих адрес дає той самий
    // slug, що й латиниця, — тож обидві форми ведуть в одне місце.
    check("кирилиця і латиниця дають один ключ",
        toSlug("Жіночі сумки") === toSlug("zhinochi-sumky")
        && toSlug("Чорний") === toSlug("chornyi"),
        `${toSlug("Жіночі сумки")} / ${toSlug("zhinochi-sumky")}`);

    // Зіставлення за slug-ом мусить стояти в УСІХ трьох місцях, де
    // каталог читає значення з адреси: колір і стать разом, бренд і
    // категорія — окремо й пізніше.
    check("спільний покажчик існує", /function slugIndex\(known\)/.test(catalog));

    ["applyBrandFromUrl", "applyCategoryFromUrl"].forEach(fn => {

        const тіло = catalog.slice(catalog.indexOf("function " + fn),
            catalog.indexOf("function " + fn) + 1400);

        check(`${fn} зіставляє за slug-ом`,
            /slugIndex\(/.test(тіло)
            && /bySlug\.get\(token\) \|\| bySlug\.get\(latinParam\(token\)\)/.test(тіло));

    });

    // Стать — закритий перелік, і відсіювати чуже можна лише ПІСЛЯ
    // перекладу: інакше «zhinkam» відкинули б ще на читанні адреси.
    check("стать відсіюється після перекладу, а не до нього",
        /selectedGenders = readSetParam\(params, "gender"\);/.test(catalog)
        && /if \(!GENDERS\.includes\(value\)\) selectedGenders\.delete\(value\)/.test(catalog));
}

console.log("\n[5] Розділ: адреса, яку каталог пише, він мусить і читати");
{
    // ЩО БУЛО НЕ ТАК
    // ---------------
    // «?department=aksesuary» відкривало ПОВНИЙ каталог: параметр
    // зникав з адреси, фільтр не застосовувався. При цьому латиницю в
    // адресу пише сам каталог, тож посилання, скопійоване з власного
    // адресного рядка, не працювало. Власник наткнувся на це, коли
    // ставив таке посилання в «Популярні категорії» на головній.
    //
    // Причина: переклад латиниці робився по переліку значень із
    // ТОВАРІВ (fieldValues("department")), а поля department у товарі
    // немає — розділ лежить у довіднику категорій. Перелік був
    // порожній, переклад не відбувався, і сторож прибирав розділ як
    // невідомий.
    //
    // ЧОМУ ЦЬОГО НЕ ЛОВИВ ТЕСТ. Блок [3] вище перевіряє замкнене коло
    // на полях товару — і про розділ не знав з тієї самої причини, що
    // й код. Тому джерело значень тут інше: data/categories.json.
    const categories = JSON.parse(read("data/categories.json"));

    const departments = [...new Set(categories.map(c => c && c.department).filter(Boolean))];

    check(`розділи в довіднику є (${departments.length})`, departments.length > 0);

    check("у кожного розділу є що покласти в адресу",
        departments.every(d => toSlug(d)),
        departments.filter(d => !toSlug(d)).join(", "));

    const slugs = departments.map(toSlug);

    check("два розділи не дають один slug",
        new Set(slugs).size === slugs.length, slugs.join(","));

    check("адреса лишається читабельною",
        slugs.every(s => encodeURIComponent(s) === s), slugs.join(","));

    // Беремо СПРАВЖНІЙ блок перекладу з catalog.js, а не його опис
    // регуляркою: саме розбіжність копії й оригіналу тут і сховалась.
    const початок = catalog.indexOf("const departmentBySlug = slugIndex(");
    const кінець = catalog.indexOf("realDepartments.forEach(name => selectedDepartments.add(name));");

    check("блок перекладу розділу знайдено", початок > 0 && кінець > початок);

    const переклади = tokens => {

        const selectedDepartments = new Set(tokens);

        const departmentByCategory = new Map(
            categories.filter(c => c && c.name && c.department).map(c => [c.name, c.department]));

        new Function("window", "selectedDepartments", "departmentByCategory",
            catalog.match(/function latinParam[\s\S]*?\n\}/)[0]
            + catalog.match(/function slugIndex\(known\)[\s\S]*?\n\}/)[0]
            + catalog.slice(початок, кінець)
            + "realDepartments.forEach(name => selectedDepartments.add(name));"
        )({ Translit: { toSlug } }, selectedDepartments, departmentByCategory);

        return [...selectedDepartments];

    };

    // ГОЛОВНЕ: рівно та адреса, яку каталог пише сам.
    departments.forEach(department => {

        check(`«${department}» відкривається за ?department=${toSlug(department)}`,
            переклади([toSlug(department)]).join(",") === department,
            переклади([toSlug(department)]).join(",") || "фільтр зник");

    });

    // Кирилиця з уже розісланих посилань мусить працювати й далі.
    check("кирилиця зі старого посилання ще працює",
        переклади(["Аксесуари"]).join(",") === "Аксесуари",
        переклади(["Аксесуари"]).join(",") || "фільтр зник");

    // Кілька розділів через кому — так каталог пише мультивибір.
    check("кілька розділів через кому",
        переклади(["aksesuary", "vzuttia"]).sort().join(",") === ["Аксесуари", "Взуття"].sort().join(","),
        переклади(["aksesuary", "vzuttia"]).join(","));

    // Невідомий розділ і далі відкидається: застаріле посилання має
    // показати каталог, а не порожнечу.
    check("невідомий розділ відкидається", переклади(["nemaje-takoho"]).length === 0);

    check("невідомий не тягне за собою відомий",
        переклади(["nemaje-takoho", "vzuttia"]).join(",") === "Взуття",
        переклади(["nemaje-takoho", "vzuttia"]).join(","));

    // І сторож проти повернення: перелік розділів мусить приходити з
    // довідника категорій, а не з полів товару.
    check("переклад більше не питає товари про розділ",
        !/fieldValues\("department"\)\s*\)/.test(catalog.replace(/\/\/.*$/gm, "")));

    check("перелік розділів беруть із довідника категорій",
        /slugIndex\(new Set\(departmentByCategory\.values\(\)\)\)/.test(catalog));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
