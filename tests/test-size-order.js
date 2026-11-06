// Розміри на сторінці товару: по порядку і зрозумілі читалці.
//
// ЩО БУЛО
// --------
//   - Розміри йшли так, як їх набрали в адмінці: у кросівок Lacoste
//     L003 — «38, 37, 39». Покупець шукає свій поглядом зліва направо.
//   - Обраний розмір було видно лише кольором: ні aria-pressed на
//     кнопці, ні назви в групи. Читалка на «38» казала просто «38,
//     кнопка» — без «Розмір» і без того, чи він обраний.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const common = read("assets/js/common.js");
const product = read("assets/js/product.js");

const fn = name => (common.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`)) || [""])[0];

const ctx = {};
vm.createContext(ctx);
// Лише getVariantSizes, без сусідів — саме так її беруть інші тести,
// і саме так CI зловив окрему допоміжну функцію поруч.
vm.runInContext(fn("getVariantSizes") + "this.sizes = getVariantSizes; this.order = list => getVariantSizes({ sizes: list }, null);", ctx);

console.log("\n[1] Числові розміри — за зростанням");
{
    const order = list => (ctx.order ? ctx.order(list) : []).join(",");

    check("функції знайдено", typeof ctx.order === "function" && typeof ctx.sizes === "function");
    check("38, 37, 39 → 37, 38, 39", order(["38", "37", "39"]) === "37,38,39", order(["38", "37", "39"]));
    check("за числом, а не за текстом: 9, 10, 8.5", order(["10", "9", "8.5"]) === "8.5,9,10", order(["10", "9", "8.5"]));
    check("кома як десяткова: 37,5", order(["38", "37,5", "37"]) === "37,37,5,38", order(["38", "37,5", "37"]));
    check("літерні — як ввели: L, S, M", order(["L", "S", "M"]) === "L,S,M", order(["L", "S", "M"]));
    check("змішані — як ввели", order(["40", "ONESIZE", "38"]) === "40,ONESIZE,38");

    // Порядок вище «вцілів» би й без запобіжника: компаратор на літерах
    // дає NaN, і V8 випадково лишає все на місці. Але це поведінка без
    // гарантії — інший рушій переставить. Тому вимагаємо, щоб нечисловий
    // список узагалі не йшов у sort: повертається той самий масив.
    const letters = ["L", "S", "M"];
    check("нечисловий список не сортується взагалі", ctx.order(letters) === letters);
    const mixed = ["40", "ONESIZE", "38"];
    check("змішаний — теж", ctx.order(mixed) === mixed);
    check("один розмір — як є", order(["ONESIZE"]) === "ONESIZE");

    // Масив належить товару в кеші: сортування на місці переставило б
    // і те, що читають далі (наявність, адмінка, кошик).
    const own = ["38", "37", "39"];
    ctx.order(own);
    check("вихідний масив не переставлено", own.join(",") === "38,37,39", own.join(","));

    // Обидва шляхи getVariantSizes — свої розміри кольору і загальні.
    check("загальні розміри товару",
        ctx.sizes({ sizes: ["39", "37"] }, null).join(",") === "37,39");
    check("розміри кольору",
        ctx.sizes({ sizes: ["1"] }, { sizes: ["42", "41"] }).join(",") === "41,42");

    // Справжній товар, на якому це помітили.
    const l003 = JSON.parse(read("data/products/krosivky-lacoste-l003.json"));
    check("Lacoste L003 показується 37, 38, 39",
        ctx.sizes(l003, null).join(",") === "37,38,39", ctx.sizes(l003, null).join(","));
}

console.log("\n[2] Обраний розмір чутно");
{
    // Сторінка товару: кнопка несе aria-pressed від народження.
    check("кнопка розміру з aria-pressed у розмітці сторінки",
        /class="size \$\{isActive \? "active" : ""\}[^`]*?aria-pressed="\$\{isActive\}"/.test(product));

    // Перемикач кольору перебудовує список рядком — і новий список теж
    // мусить нести aria-pressed (крім міні-кнопок у картках).
    check("перебудова при зміні кольору теж з aria-pressed",
        /\$\{isMini \? "" : `aria-pressed="\$\{variantSizes\.length === 1 && index === 0\}"`\}/.test(common));

    // Клік: обраний — true, решта — false.
    const click = (product.match(/const button = event\.target\.closest\("\.size"\);[\s\S]*?refreshAvailability\(\);/) || [""])[0];
    check("клік знімає aria-pressed з інших", /item\.setAttribute\("aria-pressed", "false"\)/.test(click));
    check("клік ставить aria-pressed обраному", /button\.setAttribute\("aria-pressed", "true"\)/.test(click));

    // Група з назвою, і назва справді існує.
    const group = (product.match(/<div class="sizes"[^>]*>/) || [""])[0];
    const labelledby = (group.match(/aria-labelledby="([^"]+)"/) || [])[1];
    check("розміри — група", /role="group"/.test(group), group);
    check("у групи є назва", Boolean(labelledby) && new RegExp(`id="${labelledby}"[^>]*>Розмір<`).test(product), labelledby);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
