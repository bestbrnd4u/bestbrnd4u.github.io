// Обраний колір і розмір чутно читалці — хоч би який шаблон їх малював.
//
// ЩО БУЛО
// --------
// Кружечки кольору й маленькі кнопки розміру показують вибір лише
// обводкою (клас active). Читалка на кружечку казала «Чорний, кнопка»,
// не кажучи, чи він обраний. Малюють їх чотири шаблони (картка
// каталогу, сторінка товару, кошик, обране), перемикає — інший
// обробник. Тому правило одне — за самою ознакою active.
//
// Тут — справжній блок із common.js у JSDOM.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const common = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8");
const block = (common.match(/const PRESSABLE = [\s\S]*?\n\}\n(?=\s*(?:\/\/[^\n]*\n)*\s*function getVariantSizes)/) || [""])[0];

console.log("\n[1] Блок на місці");
check("знайдено", block.length > 0);

// Усі чотири шаблони малюють саме ці кнопки — інакше правило їх не
// побачить.
for (const [file, cls] of [["assets/js/ui.js", "mini-color"], ["assets/js/ui.js", "mini-size"], ["assets/js/cart.js", "mini-color"],
    ["assets/js/cart.js", "mini-size"], ["assets/js/favorites.js", "mini-color"], ["assets/js/favorites.js", "mini-size"],
    ["assets/js/product.js", "color "], ["assets/js/product.js", "size "]]) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    check(`${file}: <button … class="${cls.trim()}`, new RegExp(`<button[^>]*?class="${cls}`).test(src));
}

async function run() {

    const dom = new JSDOM(`<!doctype html><body>
        <div class="product-card">
            <button class="mini-color active" data-color="Бежевий"></button>
            <button class="mini-color" data-color="Чорний"></button>
            <button class="mini-size">38</button>
        </div>
        <span class="color active">не кнопка — не чіпаємо</span>
    </body>`, { runScripts: "outside-only" });

    const { window } = dom;
    const tick = () => new Promise(r => window.setTimeout(r, 0));

    window.eval(block);
    await tick();

    const $ = s => window.document.querySelector(s);
    const pressed = el => el.getAttribute("aria-pressed");

    console.log("\n[2] Те, що вже на сторінці");
    check("обраний колір — true", pressed($('[data-color="Бежевий"]')) === "true");
    check("необраний — false", pressed($('[data-color="Чорний"]')) === "false");
    check("розмір без вибору — false", pressed($(".mini-size")) === "false");
    check("не кнопку з класом color не чіпаємо", $("span.color").getAttribute("aria-pressed") === null);

    console.log("\n[3] Вибір змінився — стан теж");
    $('[data-color="Бежевий"]').classList.remove("active");
    $('[data-color="Чорний"]').classList.add("active");
    await tick();
    check("Чорний — true", pressed($('[data-color="Чорний"]')) === "true");
    check("Бежевий — false", pressed($('[data-color="Бежевий"]')) === "false");

    console.log("\n[4] Нове, домальоване пізніше (кошик, обране, «Показати ще»)");
    const row = window.document.createElement("div");
    row.innerHTML = `<button class="mini-color active" data-color="Зелений"></button><button class="mini-size">M</button><button class="size active">40</button>`;
    window.document.body.appendChild(row);
    await tick();
    check("вкладений кружечок — true", pressed(row.querySelector(".mini-color")) === "true");
    check("вкладений розмір — false", pressed(row.querySelector(".mini-size")) === "false");
    check("велика кнопка розміру — true", pressed(row.querySelector(".size")) === "true");

    const lone = window.document.createElement("button");
    lone.className = "color";
    window.document.body.appendChild(lone);
    await tick();
    check("кнопка, додана сама по собі — false", pressed(lone) === "false");

    console.log("\n[5] Зайвих змін немає");
    // Кожна зміна атрибута — ще одна мутація; писати те саме значення
    // вдруге — зайва робота на кожному кадрі анімацій каталогу.
    check("не переписує, якщо значення вже правильне", /if \(el\.getAttribute\("aria-pressed"\) !== value\)/.test(block));
    check("стежить лише за class, а не за всіма атрибутами", /attributeFilter: \["class"\]/.test(block));

}

run().then(() => {
    console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
    process.exit(failures === 0 ? 0 : 1);
}).catch(error => { console.log("  ✗ виняток:", error.message); process.exit(1); });
