const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = require("path").join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "catalog.html"), "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://x.test/catalog.html" });
const { window } = dom;

global.window = window;
global.document = window.document;

// заглушки замість інших скриптів сайту
window.CATALOG_SKIP_AUTO_INIT = true;
window.createProductCard = p => `<div class="product-card">${p.title}</div>`;
window.initProductCarousels = () => {};
window.updateFavoriteButtons = () => {};
window.renderRecentlyViewed = () => {};
window.scrollTo = () => { window.__scrolled = true; };
window.matchMedia = window.matchMedia || (q => ({ matches: false, addEventListener() {}, addListener() {} }));
window.fetch = () => Promise.resolve({ ok: false });

// у справжньому браузері requestAnimationFrame спрацьовує на
// наступному кадрі; у jsdom — асинхронно й недетерміновано (не
// прив'язано навіть до setTimeout(0)). Код каталогу навмисно
// відкладає обробку scroll-подій через rAF (щоб не рахувати на
// кожен піксель скролу) — робимо викликк синхронним, інакше
// перевірки в тесті виконувались би до того, як обробник встиг
// відпрацювати.
window.requestAnimationFrame = cb => cb();

// availableFacets() (звужувальні фільтри) використовує escapeHtml і
// getProductColors з common.js — на сайті цей файл підключений
// повністю, у тесті підвантажуємо потрібні функції явно
const commonSrc = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8");
window.eval(commonSrc.match(/function escapeHtml[\s\S]*?\n}\n/)[0]);
window.eval(commonSrc.match(/function getProductColors[\s\S]*?\n}\n/)[0]);
// getVariantSizes/getAllProductSizes теж живуть у common.js —
// на сайті файл підключений повністю, у тесті додаємо явно
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getVariantSizes[\s\S]*?\n}\n/)[0]);
window.eval(fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8").match(/function getAllProductSizes[\s\S]*?\n}\n/)[0]);
// catalog.js тепер стартує з FALLBACK_SIZE_GROUPS з common.js
// (групи розмірів приходять з адмінки), плюс хелпери груп
const _cs = fs.readFileSync(path.join(ROOT,"assets/js/common.js"),"utf8");
// const з окремого window.eval не видно наступним викликам
// (jsdom не ділить прив'язання) — привласнюємо прямо у window
window.eval("window.FALLBACK_SIZE_GROUPS = " +
    _cs.match(/const FALLBACK_SIZE_GROUPS = (\[[\s\S]*?\n\]);\n/)[1] + ";");
window.eval(_cs.match(/function resolveGroupCategories[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function findSizeGroupForCategory[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function getProductGenders[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/function getProductGenderLabel[\s\S]*?\n}\n/)[0]);
window.eval(_cs.match(/let sizeGroupsPromise[\s\S]*?\n}\n/)[0]);

let code = fs.readFileSync(path.join(ROOT, "assets/js/catalog.js"), "utf8");

// let/const у скрипті не стають властивостями window — пробрасываем
// потрібне для тесту через явний хук
code += `
window.__t = {
    get priceBounds() { return priceBounds; },
    get priceRange() { return priceRange; },
    get priceUI() { return priceUI; },
    setProducts(list) { products = list; }
};
`;

window.eval(code);

let failures = 0;
function check(name, cond, extra) {
    if (cond) { console.log("  ✓", name); }
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
}

// ---------------------------------------------
console.log("\n[1] Повзунок ціни: межі з реальних цін каталогу");
// ---------------------------------------------

window.__t.setProducts([
    { title: "A", price: 790, brand: "X", category: "Жіночі сумки", gender: "Жінкам", variants: [] },
    { title: "B", price: 4599, brand: "Y", category: "Рюкзаки", gender: "Унісекс", variants: [] },
    { title: "C", price: 10999, brand: "Z", category: "Жіночі сумки", gender: "Жінкам", variants: [] },
    { title: "D", price: 31990, brand: "Z", category: "Жіночі сумки", gender: "Жінкам", variants: [] }
]);

window.render();

const bounds = window.__t.priceBounds;
check("нижня межа округлена вниз (790 → 700, крок 100)", bounds.min === 700, JSON.stringify(bounds));
check("верхня межа покриває найдорожчий товар", bounds.max >= 31990, JSON.stringify(bounds));

const ui = window.__t.priceUI;
check("розмітку повзунка побудовано", !!ui && !!ui.rangeMin && !!ui.rangeMax);
check("два числові поля створено", !!ui.numberMin && !!ui.numberMax);
check("суфікс 'грн' присутній", document.querySelectorAll(".price-range-suffix").length === 2);
check("старі чекбокси діапазонів прибрано", document.querySelectorAll("#priceMenu [data-price]").length === 0);
check("кнопка скидання збереглась", !!document.querySelector("#priceMenu [data-clear-price]"));

check("поля показують межі з розділювачем тисяч", ui.numberMax.value.includes(" ") || ui.numberMax.value.length >= 5, ui.numberMax.value);
check("фільтр спочатку неактивний", window.priceFilterActive() === false);
check("підпис кнопки — 'Ціна'", document.getElementById("priceLabel").textContent === "Ціна");

// ---------------------------------------------
console.log("\n[2] Звуження діапазону фільтрує товари");
// ---------------------------------------------

ui.rangeMin.value = 4000;
ui.rangeMax.value = 12000;
ui.rangeMin.dispatchEvent(new window.Event("change", { bubbles: true }));

check("фільтр став активним", window.priceFilterActive() === true);
check("підпис кнопки показує діапазон", /–/.test(document.getElementById("priceLabel").textContent),
      document.getElementById("priceLabel").textContent);

const shown = [...document.querySelectorAll("#catalogGrid .product-card")].map(el => el.textContent);
check("залишились лише B і C", shown.join(",") === "B,C", shown.join(","));
check("лічильник 'Знайдено' оновився", document.getElementById("productsCount").textContent === "2");
check("автоскрол спрацював", window.__scrolled === true);

const chips = [...document.querySelectorAll('#activeFiltersChips [data-clear="price"]')];
check("рівно один чіп ціни (а не чотири)", chips.length === 1, chips.length);

// ---------------------------------------------
console.log("\n[3] Введення чисел у поля");
// ---------------------------------------------

ui.numberMin.value = "20 000";
ui.numberMax.value = "5000";
ui.numberMin.dispatchEvent(new window.Event("change", { bubbles: true }));

check("'від' > 'до' міняються місцями", window.__t.priceRange.min === 5000 && window.__t.priceRange.max === 20000,
      JSON.stringify(window.__t.priceRange));
check("пробіл-розділювач розпарсено", window.__t.priceRange.max === 20000, window.__t.priceRange.max);

ui.numberMax.value = "999999";
ui.numberMax.dispatchEvent(new window.Event("change", { bubbles: true }));
check("значення понад межу обрізається", window.__t.priceRange.max === bounds.max, window.__t.priceRange.max);

// ---------------------------------------------
console.log("\n[4] Скидання");
// ---------------------------------------------

document.querySelector("#priceMenu [data-clear-price]").dispatchEvent(new window.Event("click", { bubbles: true }));
check("clearPrices повертає повний діапазон", window.priceFilterActive() === false, JSON.stringify(window.__t.priceRange));
check("усі 4 товари повернулись", document.getElementById("productsCount").textContent === "4");

window.__t.priceRange.min = 4000;
window.__t.priceRange.max = 9000;
window.updatePriceUI();
window.resetAllFilters();
check("resetAllFilters скидає ціну", window.priceFilterActive() === false);

// ---------------------------------------------
console.log("\n[5] Баг з випадаючим списком при скролі");
// ---------------------------------------------

const priceMenu = document.getElementById("priceMenu");
const priceDropdown = document.getElementById("priceDropdown");
const filtersBar = document.querySelector(".catalog-filters-bar");

// відтворюємо стан ПІСЛЯ скролу вниз у старій версії:
// меню було закрито, але лишився візуальний клас scroll-hidden
priceMenu.classList.add("scroll-hidden");
priceMenu.hidden = true;
priceDropdown.classList.remove("open");
filtersBar.classList.add("is-hidden");

document.getElementById("priceToggle").dispatchEvent(new window.Event("click", { bubbles: true }));

check("меню відкрилось", priceMenu.hidden === false);
check("залишковий scroll-hidden знято (раніше меню було невидиме)",
      priceMenu.classList.contains("scroll-hidden") === false);
check("дропдаун позначено як відкритий", priceDropdown.classList.contains("open"));
check("панель фільтрів повернуто під шапку", filtersBar.classList.contains("is-hidden") === false);

// закриття прибирає обидва стани
window.closeAllDropdowns();
check("після закриття hidden = true", priceMenu.hidden === true);
check("після закриття scroll-hidden теж знято", priceMenu.classList.contains("scroll-hidden") === false);

// ---------------------------------------------
console.log("\n[6] Автоскрол на інших фільтрах");
// ---------------------------------------------

window.__scrolled = false;
window.toggleBrand("Z");
check("вибір бренду викликає автоскрол", window.__scrolled === true);
check("бренд відфільтрував товари", document.getElementById("productsCount").textContent === "2",
      document.getElementById("productsCount").textContent);

window.__scrolled = false;
document.body.classList.add("mobile-filters-open");
window.toggleBrand("Y");
check("у відкритій мобільній шторці автоскролу немає", window.__scrolled === false);
document.body.classList.remove("mobile-filters-open");

console.log("\n[7] Баг зі скролллю: фільтри не мають ховатись під час власного автоскролу");

// Емулюємо стан "стоїмо зверху сторінки, застосовуємо фільтр" —
// scrollY зростає програмно (як робить window.scrollTo у
// scrollToFirstProduct), а не через реальний скрол користувача.
// window.scrollTo в jsdom нічого не анімує, тож імітуємо ефект
// самостійно: одразу підставляємо нове значення scrollY і руками
// стріляємо той самий 'scroll' listener, який слухає код каталогу.
function simulateScrollTo(newY) {
    Object.defineProperty(window, "scrollY", { value: newY, configurable: true });
    window.dispatchEvent(new window.Event("scroll"));
}

// jsdom не підвантажує style.css і не рахує справжню розкладку,
// тож getComputedStyle(filtersBar).top для "position:sticky;top:82px"
// повертає не "82px", а порожнє значення → stickyTop у коді
// каталогу рахується як 0. Щоб isStuck (rect.top <= stickyTop+1)
// був істинним — як і буде в реальному браузері, коли панель вже
// прилипла під шапкою — мокаємо rect.top значенням 0, а не 82.
// (filtersBar, priceDropdown, priceMenu вже оголошені у блоці [5])

const catalogTopEl = document.querySelector(".catalog-top");

filtersBar.getBoundingClientRect = () => ({ top: 0 });

// теж мок розкладки: без нього ціль скролу має
// getBoundingClientRect().top === 0, дистанція скролу виходить 0px,
// і armAutoScrollGuard() у коді каталогу просто не викликається.
//
// Ціллю тепер може бути панель активних фільтрів — саме її треба
// показати після застосування фільтра, а не рядок «Знайдено N».
// Мокаємо обидві, щоб тест не залежав від того, яка з них видима.
catalogTopEl.getBoundingClientRect = () => ({ top: 640 });

const activeFiltersBarEl = document.getElementById("activeFiltersBar");

if (activeFiltersBarEl) {
    activeFiltersBarEl.getBoundingClientRect = () => ({ top: 640 });
}

{
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    window.dispatchEvent(new window.Event("scroll"));
    filtersBar.classList.remove("is-hidden");

    // відкриваємо дропдаун ціни напряму викликом функції каталогу
    // (а не кліком по кнопці) — надійніше, ніж покладатись на
    // toggle-семантику клікабельної кнопки в тестовому сценарії
    window.eval("closeAllDropdowns(); openDropdownMenu(priceDropdown, priceMenu);");
    check("перед тестом дропдаун ціни відкрито", priceDropdown.classList.contains("open"));

    // сам виклик, який відтворює баг з репорту: стоїмо зверху,
    // застосовуємо фільтр (тут — бренд), спрацьовує applyFilterChange
    // → scrollToFirstProduct() → window.scrollTo (в jsdom мокнутий,
    // нічого реально не скролить — тож саму анімацію імітуємо
    // нижче через simulateScrollTo)
    window.__scrolled = false;

    window.toggleBrand("Z");

    check("автоскрол викликано", window.__scrolled === true);
    check("захисне вікно активне одразу після toggleBrand",
          window.eval("isAutoScrollGuardActive()") === true);

    // імітуємо саму анімацію скролу вниз, яку запустив scrollToFirstProduct
    simulateScrollTo(40);
    simulateScrollTo(90);
    simulateScrollTo(140);

    check("sticky-панель фільтрів НЕ схована під час автоскролу",
          filtersBar.classList.contains("is-hidden") === false);
    check("відкритий дропдаун ціни НЕ схований під час автоскролу",
          priceMenu.classList.contains("scroll-hidden") === false);
}

{
    // контрольний сценарій: звичайний, СПРАВЖНІЙ скрол users вниз
    // (не через applyFilterChange) — сюди захист не мав би втручатись,
    // панель і дропдаун повинні ховатись як і раніше.
    //
    // Захисне вікно з попереднього сценарію — це проміжок часу
    // (900ms), а не окремий стан, що скидається явно; у реальному
    // використанні між двома кліками користувача завжди проходить
    // більше часу. Тут — навмисна синхронна пауза, що чекає, поки
    // цей проміжок реально мине (спроба скинути внутрішню let-змінну
    // через окремий window.eval() виявилась ненадійною: у jsdom
    // окремі викликки window.eval() не гарантовано пишуть у те саме
    // прив'язання, яке читає вже визначена функція з попереднього
    // eval — а це саме той механізм, який тестуємо, тож краще не
    // залежати від його внутрішньої поведінки).
    {
        const deadline = Date.now() + 950;
        while (Date.now() < deadline) { /* навмисне блокуюче очікування */ }
    }

    // дропдаун зараз відкритий (з попереднього сценарію) — перевідкриваємо
    // напряму, той самий надійний спосіб, що й вище
    window.eval("closeAllDropdowns(); openDropdownMenu(priceDropdown, priceMenu);");
    filtersBar.classList.remove("is-hidden");

    simulateScrollTo(300);
    simulateScrollTo(360);
    simulateScrollTo(420);

    check("звичайний скрол користувача все ще ховає sticky-панель",
          filtersBar.classList.contains("is-hidden") === true);
    check("звичайний скрол користувача все ще ховає відкритий дропдаун",
          priceMenu.classList.contains("scroll-hidden") === true);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено перевірок: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
