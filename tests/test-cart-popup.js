// Поп-ап «Товар додано в кошик».
//
// ЩО БУЛО
// --------
// Поп-ап стоїть на товарі, головній і в каталозі — тобто майже скрізь,
// де купують. І саме там:
//
//   - читалка не чула нічого: жива область є лише в тості, а тост при
//     поп-апі не показується;
//   - через 4,5 с поп-ап зникав будь-що, навіть з-під курсора, який
//     уже тягнувся до «Оформити замовлення», і з-під фокусу клавіатури;
//   - Escape його не закривав.
//
// Заміряно в браузері до і після правки; тут — ті самі сценарії без
// браузера, з керованим годинником.
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

const fn = name => (common.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`)) || [""])[0];

const NAMES = ["showCartPopup", "scheduleCartPopupHide", "watchCartPopup", "announce", "hideCartPopup"];

console.log("\n[1] Функції на місці");
NAMES.forEach(name => check(name, fn(name).length > 0));

function setup() {

    const dom = new JSDOM(`<!doctype html><body>
        <button id="buy">Додати в кошик</button>
        <div id="cartPopup" class="cart-popup" hidden></div>
        <button id="elsewhere">Інше</button>
    </body>`, { runScripts: "outside-only", pretendToBeVisual: true });

    const { window } = dom;

    // Керований годинник: таймери не біжать самі, а «прокручуються».
    let now = 0, seq = 0;
    const timers = new Map();
    window.setTimeout = (cb, ms) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), cb }); return id; };
    window.clearTimeout = id => { timers.delete(id); };
    window.requestAnimationFrame = cb => window.setTimeout(cb, 16);
    window.__tick = ms => {
        const end = now + ms;
        for (;;) {
            const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            timers.delete(next[0]);
            now = next[1].at;
            next[1].cb();
        }
        now = end;
    };

    window.eval(`
        function getCartSummary() { return { itemsCount: 1, subtotal: 6000 }; }
        function formatPrice(v) { return v + " грн"; }
        function priceNow(p) { return p.price; }
        function escapeHtml(s) { return String(s); }
    `);

    NAMES.forEach(name => window.eval(fn(name)));
    window.eval("window.__show = showCartPopup;");

    const popup = window.document.getElementById("cartPopup");
    const shown = () => !popup.hidden && popup.classList.contains("show");

    return { window, popup, shown };

}

const PRODUCT = { title: "Чоловіча сумка Armani Exchange", brand: "Armani Exchange", price: 6000, images: [] };

console.log("\n[2] Читалка чує, що товар додано");
{
    const { window } = setup();

    window.__show(PRODUCT, {});
    const region = window.document.getElementById("srAnnounce");

    check("жива область створена", Boolean(region));

    if (region) {
        check("role=status", region.getAttribute("role") === "status");
        check("aria-live=polite", region.getAttribute("aria-live") === "polite");
        // Текст кладеться окремим кроком — в одну мить зі створенням
        // області частина читалок його пропускає.
        check("спершу порожня", region.textContent === "");
        window.__tick(150);
        check("потім — що саме додано і сума",
            /додано в кошик/.test(region.textContent) && region.textContent.includes(PRODUCT.title)
            && /6000 грн/.test(region.textContent), region.textContent);
        check("не видна на екрані (клас sr-announce)", region.className === "sr-announce");
    }

    const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");
    const rule = (css.match(/\.sr-announce\{([^}]*)\}/) || [])[1] || "";
    check("клас сховано, але не display:none / visibility:hidden",
        /clip-path:inset\(50%\)/.test(rule) && !/display:none|visibility:hidden/.test(rule));

    // Другий показ тієї ж фрази теж мусить прозвучати.
    window.__show(PRODUCT, {});
    check("повтор: область знову очищено перед текстом",
        window.document.getElementById("srAnnounce").textContent === "");
    window.__tick(150);
    check("повтор: фраза повернулась", /додано в кошик/.test(window.document.getElementById("srAnnounce").textContent));
    check("область одна, а не по одній на кожне додавання",
        window.document.querySelectorAll("#srAnnounce").length === 1);
}

console.log("\n[3] Сам зникає, якщо його не чіпати");
{
    const { window, shown } = setup();

    window.__show(PRODUCT, {});
    window.__tick(100);
    check("показано", shown());
    window.__tick(4000);
    check("через 4 с ще видно", shown());
    window.__tick(1000);
    check("через 5 с сховано", !shown());
}

console.log("\n[4] Під курсором не зникає");
{
    const { window, popup, shown } = setup();

    window.__show(PRODUCT, {});
    window.__tick(100);
    popup.dispatchEvent(new window.MouseEvent("mouseenter"));
    window.__tick(10000);
    check("10 с під курсором — видно", shown());

    popup.dispatchEvent(new window.MouseEvent("mouseleave"));
    window.__tick(4000);
    check("курсор пішов — ще 4 с видно", shown());
    window.__tick(1000);
    check("а потім ховається", !shown());
}

console.log("\n[5] З фокусом усередині не зникає");
{
    const { window, popup, shown } = setup();

    window.__show(PRODUCT, {});
    window.__tick(100);

    const [checkout, toCart] = popup.querySelectorAll("a");
    checkout.focus();
    window.__tick(10000);
    check("фокус на «Оформити замовлення» — видно", shown());

    // Tab між двома кнопками поп-апу не мусить запускати таймер.
    toCart.focus();
    window.__tick(10000);
    check("Tab усередині поп-апу — все ще видно", shown());

    window.document.getElementById("elsewhere").focus();
    window.__tick(5000);
    check("фокус пішов назовні — сховано", !shown());

    // Фокус усередині, а миша заїхала й поїхала геть: mouseleave не
    // має права запустити таймер, поки клавіатура ще тут.
    window.__show(PRODUCT, {});
    window.__tick(100);
    popup.querySelector("a").focus();
    popup.dispatchEvent(new window.MouseEvent("mouseenter"));
    popup.dispatchEvent(new window.MouseEvent("mouseleave"));
    window.__tick(10000);
    check("миша пішла, а фокус лишився — видно", shown());
}

console.log("\n[6] Escape закриває");
{
    const { window, shown } = setup();

    window.__show(PRODUCT, {});
    window.__tick(100);
    window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    window.__tick(300);
    check("після Escape сховано", !shown());

    // Слухачі вішаються раз, хоч показів багато.
    window.__show(PRODUCT, {});
    window.__show(PRODUCT, {});
    check("позначка «вже стежимо» одна", window.document.getElementById("cartPopup").dataset.watched === "1");
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
