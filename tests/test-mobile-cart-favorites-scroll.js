// Регресія: на мобільному (≤768px) рядок кольору/розміру в кошику й
// обраному не мав overflow-x. body{overflow-x:hidden} тихо обрізав
// хвіст (останні кольори/розміри) замість прокрутки — саме це видно
// на скріні з товаром id=15 (Urban Sneakers, 15 кольорів × 20
// розмірів). У картці товару в каталозі (.product-card .product-options,
// той самий мобільний медіа-блок) прокрутка вже працювала — це
// правило поширює той самий підхід на .cart-item і .favorite-row.
const fs=require("fs"),path=require("path");
const ROOT = require("path").join(__dirname, "..");
let failures=0;
const check=(n,c,e)=>{if(c)console.log("  ✓",n);else{console.log("  ✗",n,e!==undefined?"→ "+e:"");failures++;}};

const css=fs.readFileSync(path.join(ROOT,"assets/css/style.css"),"utf8");

// орієнтир — уже робоча мобільна прокрутка картки товару; нове
// правило кошика/обраного мало лягти одразу після неї, у тому самому
// медіа-блоці
const productCardFix = css.indexOf(".product-card .product-options{");
const cartFavBlock = css.slice(productCardFix, productCardFix + 4000);

console.log("\n[1] Прокрутка кольору/розміру в кошику й обраному працює і на мобільному");
{
  check(".product-card .product-options (орієнтир) знайдено", productCardFix !== -1);

  check("селектор охоплює всі 4 випадки (cart-item/favorite-row × colors/sizes)",
        /\.cart-item \.product-colors,\s*\n\s*\.cart-item \.product-sizes,\s*\n\s*\.favorite-row \.product-colors,\s*\n\s*\.favorite-row \.product-sizes\{/.test(cartFavBlock));

  check("overflow-x:auto заданий",
        /\.cart-item \.product-colors,[\s\S]{0,300}overflow-x\s*:\s*auto/.test(cartFavBlock));

  check("інерційна прокрутка на iOS (-webkit-overflow-scrolling:touch)",
        /\.cart-item \.product-colors,[\s\S]{0,300}-webkit-overflow-scrolling\s*:\s*touch/.test(cartFavBlock));

  check("смуга прокрутки прихована (scrollbar-width:none)",
        /\.cart-item \.product-colors,[\s\S]{0,300}scrollbar-width\s*:\s*none/.test(cartFavBlock));

  check("прихована й у webkit (::-webkit-scrollbar{display:none})",
        /\.cart-item \.product-colors::-webkit-scrollbar,[\s\S]{0,300}display\s*:\s*none/.test(cartFavBlock));
}

console.log("\n[2] Правило лежить саме в мобільному медіа-блоці (не десктопному 769px)");
{
  const nearestMediaBefore = css.lastIndexOf("@media", productCardFix);
  const header = css.slice(nearestMediaBefore, nearestMediaBefore + 30);
  check("найближчий @media перед правилом — max-width:768px", header.includes("max-width:768px"), header);

  // стрілки навмисно лишаються десктопними — на мобільному скролить
  // палець, тож у цьому блоці arrow-класів бути не повинно
  check("стрілки (.colors-arrow/.sizes-arrow) тут НЕ вмикаються — це десктопна фіча",
        !/\.cart-item[\s\S]{0,400}colors-arrow\{display/.test(cartFavBlock));
}

console.log("\n[3] Кружечки кольору не стискаються замість прокрутки");
{
  check("flex-shrink:0 для .mini-color в кошику і обраному",
        /\.cart-item \.mini-color,\s*\n\s*\.favorite-row \.mini-color\{[\s\S]{0,50}flex-shrink\s*:\s*0/.test(cartFavBlock));
}

console.log("\n[4] Запас під кільце активного кольору/розміру не зʼїдений прокруткою");
{
  check("padding:2px і від'ємний margin:-2px, як у десктопному правилі",
        /\.cart-item \.product-colors,[\s\S]{0,400}padding\s*:\s*2px[\s\S]{0,60}margin\s*:\s*-2px/.test(cartFavBlock));
}

console.log("\n[5] Товар id=15 (Urban Sneakers) — реальний кейс із репорту");
{
  const p15 = require("./helpers/products").productWithMostColors();
  check("є товар із кількома кольорами", !!p15 && p15.variants.length >= 2, p15 && p15.variants.length);
}

console.log(failures===0?"\n✅ Усі перевірки пройдено":`\n❌ Провалено: ${failures}`);
process.exit(failures===0?0:1);
