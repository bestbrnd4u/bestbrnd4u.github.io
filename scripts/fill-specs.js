// Дозаповнення характеристик товару з підготовленого файлу.
//
// НАВІЩО ОКРЕМИЙ СКРИПТ, А НЕ ПРАВКА РУКАМИ
// ------------------------------------------
// Характеристик бракує в сотні товарів, і кожна — це окремий файл у
// data/products. Правити їх руками означає сто разів відкрити, знайти
// місце, не переплутати лапки й не зачепити сусіднє поле. Один із ста
// разів помилка станеться напевно.
//
// ЧОГО СКРИПТ НЕ РОБИТЬ — І ЦЕ ГОЛОВНЕ
// -------------------------------------
// Він НЕ ЧІПАЄ полів, які вже заповнені. Дані в data/products пише
// власник через адмінку, і його формулювання завжди головніше за
// будь-яке зовнішнє джерело: він тримав річ у руках, а джерело — ні.
// Скрипт лише додає туди, де порожньо.
//
// Через це запуск безпечно повторювати: другий раз не змінить нічого.
//
// ЗВІДКИ ДАНІ
// ------------
// З файлу, переданого аргументом: { "<ім'я файлу товару>": { поле:
// значення } }. Кожне значення має походити з джерела, а не з
// припущення — саме тому перелік готується окремо, а не вигадується
// тут.
//
// ЗАПУСК
//   node scripts/fill-specs.js <файл.json>           — показати, що буде
//   node scripts/fill-specs.js <файл.json> --apply   — записати
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PRODUCTS = path.join(ROOT, "data", "products");

// Поля, які цей скрипт узагалі має право чіпати.
//
// country тут НЕМАЄ навмисно: країна виробництва надрукована на бирці
// й міняється від партії до партії навіть для однієї моделі. Узяти її
// з інтернету означає зробити хибну заяву про товар, що продається, —
// і в картці, і у фіді Google Shopping.
const ALLOWED = ["material", "dimensions", "strapInfo", "compartments",
                 "composition", "closure", "decor"];

const apply = process.argv.includes("--apply");
const source = process.argv.find(a => a.endsWith(".json") && !a.includes("fill-specs"));

if (!source) {
    console.error("Вкажіть файл із даними: node scripts/fill-specs.js <файл.json> [--apply]");
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(source, "utf8"));

let touched = 0;
let added = 0;
const skipped = [];
const missing = [];

Object.entries(data).forEach(([name, fields]) => {

    const file = path.join(PRODUCTS, name);

    if (!fs.existsSync(file)) { missing.push(name); return; }

    const raw = fs.readFileSync(file, "utf8");
    const product = JSON.parse(raw);

    const changes = [];

    Object.entries(fields).forEach(([key, value]) => {

        if (!ALLOWED.includes(key)) { skipped.push(`${name}: поле ${key} чіпати не можна`); return; }

        const text = String(value || "").trim();

        if (!text) return;

        // Уже заповнене лишаємо як є — воно від власника.
        if (String(product[key] || "").trim()) {
            skipped.push(`${name}: ${key} вже заповнено`);
            return;
        }

        product[key] = text;
        changes.push(`${key} = ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`);

    });

    if (!changes.length) return;

    touched++;
    added += changes.length;

    console.log(`\n${product.title || name}`);
    changes.forEach(c => console.log("   +", c));

    if (apply) {
        // Той самий вигляд, що пише адмінка: два пробіли й переніс
        // у кінці, інакше наступне збереження з Decap дасть
        // косметичний diff на весь файл.
        fs.writeFileSync(file, JSON.stringify(product, null, 2) + "\n", "utf8");
    }

});

console.log("");
missing.forEach(n => console.log("✗ немає такого товару:", n));
if (skipped.length) console.log(`пропущено (уже заповнено або не дозволено): ${skipped.length}`);

console.log(apply
    ? `Готово: товарів ${touched}, полів дозаповнено ${added}`
    : `Буде змінено: товарів ${touched}, полів ${added} (запуск без --apply нічого не записав)`);
