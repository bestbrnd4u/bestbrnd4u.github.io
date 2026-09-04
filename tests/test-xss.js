const fs = require("fs");
const { JSDOM } = require("jsdom");

const ROOT = require("path").join(__dirname, "..") + "/";

let failures = 0;
function check(name, cond, extra) {
    if (cond) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
}

const dom = new JSDOM("<!doctype html><body><div id='root'></div></body>", { runScripts: "outside-only" });
const { window } = dom;

// та сама функція, що вантажиться common.js на кожній сторінці
window.eval(fs.readFileSync(ROOT + "assets/js/common.js", "utf8").match(
    /function escapeHtml[\s\S]*?\n}\n\nfunction escapeAttrSingleQuoted[\s\S]*?\n}\n/
)[0]);
// createProductCard тепер використовує ще й розмірні хелпери
const commonSrc = fs.readFileSync(ROOT + "assets/js/common.js", "utf8");
window.eval(commonSrc.match(/function getVariantSizes[\s\S]*?\n}\n/)[0]);
window.eval(commonSrc.match(/function getAllProductSizes[\s\S]*?\n}\n/)[0]);
window.eval(commonSrc.match(/function getProductColors[\s\S]*?\n}\n/)[0]);
// сім'ї кольорів — фільтр «Колір» працює ними (див. хелпер)
require(require("path").join(__dirname,"helpers/color-families")).installColorFamilies(window);
// Перевизначення полів кольором: коли колір має власну назву, ціну
// чи позначку, createProductCard кладе на свотч готовий вигляд —
// і питає саме ці три функції.
window.eval(commonSrc.match(/function colorOverrides[\s\S]*?\n}\n/)[0]);
window.eval(commonSrc.match(/function applyColorOverrides[\s\S]*?\n}\n/)[0]);
window.eval(commonSrc.match(/function baseProduct[\s\S]*?\n}\n/)[0]);
// назва в картці тепер посилання — createProductCard кличе productUrl
window.eval(commonSrc.match(/function productUrl[\s\S]*?\n}\n/)[0]);
window.eval(fs.readFileSync(ROOT + "assets/js/ui.js", "utf8").replace(
    "function createProductCard(product) {",
    "window.PRODUCT_SIZES = window.PRODUCT_SIZES || ['S','M','L'];\n" +
    "window.formatPrice = window.formatPrice || (v => v + ' грн');\n" +
    "function createProductCard(product) {"
));

console.log("\n[1] Зловмисне поле товару не виконується як HTML/JS");

const evilProduct = {
    id: 1,
    title: `Сумка"><img src=x onerror=alert(1)>`,
    brand: `Furla</div><script>window.__pwned = true<\/script>`,
    description: `<svg onload=alert(2)>Опис`,
    price: 1000,
    variants: [{
        color: `Чорний"><script>alert(3)<\/script>`,
        hex: `red;--x:url('javascript:alert(4)')`,
        images: [`x.jpg" onerror="alert(5)`]
    }]
};

window.__pwned = false;
const html = window.createProductCard(evilProduct);

window.document.getElementById("root").innerHTML = html;

check("вихідний HTML не містить живого <script>", !/<script/i.test(html));
check("лапка в назві не розірвала атрибут (немає onerror= поза текстом)",
      !/onerror=alert/.test(html.replace(/&quot;/g, '"')) || !html.includes('onerror=alert(1)>'));
check("window.__pwned лишився false — inline-скрипт не спрацював", window.__pwned === false);
check("назва товару видима як текст (escape, не видалення)", html.includes("Сумка") && html.includes("&quot;"));
check("бренд не зламав розмітку картки (закрито &lt;/div&gt;)", html.includes("&lt;/div&gt;") || !html.includes("</div><script>"));

const imgEl = window.document.querySelector("#root img.product-main-image");
check("зображення відрендерилось як звичайний <img>, а не виконало onerror", !!imgEl);

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
