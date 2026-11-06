// Пошук у шапці: що чує читалка і що бачить клавіатура телефона.
//
// ЩО БУЛО
// --------
//   - Результати мовчки з'являлись під полем: хто не бачить екрана, не
//     знав, чи знайдено щось узагалі.
//   - Enter у полі відкриває каталог із запитом, але клавіша на
//     телефоні була підписана «↵», а не «Пошук».
//   - Назви товарів у підказках ішли в innerHTML як є, хоч escapeHtml
//     поруч уже був.
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

const fn = (name, async) => (common.match(new RegExp(`${async ? "async " : ""}function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`)) || [""])[0];

console.log("\n[1] Поле пошуку");
{
    const input = (common.match(/<input type="text" id="globalSearchInput"[^>]*>/) || [""])[0];
    check("клавіша Enter на телефоні — «Пошук»", /enterkeyhint="search"/.test(input), input);
    check("Enter справді шукає (веде в каталог із запитом)",
        /event\.key === "Enter" && input\.value\.trim\(\)[\s\S]{0,200}catalog\?search=/.test(common));
}

function setup(products) {

    const dom = new JSDOM(`<!doctype html><body>
        <div id="searchIdleState"></div>
        <div id="searchResultsState" hidden>
            <div id="searchSuggestions"></div>
            <div id="searchResultsGrid"></div>
            <p id="searchNoResults" hidden></p>
            <a id="searchSeeAll" hidden></a>
        </div>
        <button id="globalSearchClear" hidden></button>
        <input id="globalSearchInput">
    </body>`, { runScripts: "outside-only" });

    const { window } = dom;

    let now = 0, seq = 0;
    const timers = new Map();
    window.setTimeout = (cb, ms) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), cb }); return id; };
    window.clearTimeout = id => { timers.delete(id); };
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

    window.__products = products;
    window.eval(`
        var cachedProducts = window.__products;
        var said = [];
        window.__said = said;
        function announce(t) { said.push(t); }
        async function getProductById() { return null; }
        function searchProducts(list, q) { return list.filter(p => p.title.toLowerCase().includes(q)); }
        function reportSearch() {}
        function productUrl(p) { return "p/" + p.id + "/"; }
        function formatPrice(v) { return v + " грн"; }
        function priceNow(p) { return p.price; }
        function saveRecentSearch() {}
        function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
        var MAX_SEARCH_RESULTS = 6;
        var searchOverlayEl = document.body;
        window.DialogFocus = { close() {} };
    `);

    [fn("plural"), fn("pluralProducts"), fn("runGlobalSearch", true)].forEach(src => window.eval(src));

    // Закриття беремо лише першими рядками — до роботи з анімацією,
    // яка тут ні до чого.
    const close = fn("closeSearchOverlay");
    const head = close.split("window.DialogFocus")[0] + "}";
    window.eval(head);

    window.eval("window.__run = runGlobalSearch; window.__close = closeSearchOverlay;");

    return window;

}

const PRODUCTS = [
    { id: 1, title: "Сумка Coach Tabby", brand: "Coach", price: 100, images: [] },
    { id: 2, title: "Сумка Coach Klare", brand: "Coach", price: 200, images: [] },
    { id: 3, title: "Гаманець <b>Coach</b>", brand: "Coach", price: 300, images: [] }
];

console.log("\n[2] Читалка чує, скільки знайдено");
(async () => {

    {
        const w = setup(PRODUCTS);

        await w.__run("сумка");
        check("одразу — ще мовчить (людина може друкувати далі)", w.__said.length === 0, w.__said.join(" / "));
        w.__tick(900);
        check("після паузи — «Знайдено 2 товари»", w.__said[0] === "Знайдено 2 товари", w.__said.join(" / "));
    }

    {
        const w = setup(PRODUCTS);

        // Набір по літерах: кожен виклик скасовує попереднє оголошення.
        for (const q of ["с", "су", "сум", "сумк", "сумка"]) { await w.__run(q); w.__tick(150); }
        w.__tick(900);
        check("на набір слова — одне оголошення, а не по одному на літеру",
            w.__said.length === 1, w.__said.join(" / "));
    }

    {
        const w = setup(PRODUCTS);

        await w.__run("щось інше");
        w.__tick(900);
        check("нуль — «Нічого не знайдено»", w.__said[0] === "Нічого не знайдено", w.__said.join(" / "));

        await w.__run("coach");
        w.__tick(900);
        check("відмінювання: «3 товари»", w.__said[1] === "Знайдено 3 товари", w.__said[1]);
    }

    {
        const w = setup(PRODUCTS);

        await w.__run("сумка");
        await w.__run("");
        w.__tick(900);
        check("поле очистили до паузи — оголошення скасовано", w.__said.length === 0, w.__said.join(" / "));
    }

    {
        const w = setup(PRODUCTS);

        await w.__run("сумка");
        w.__close();
        w.__tick(900);
        check("пошук закрили до паузи — оголошення скасовано", w.__said.length === 0, w.__said.join(" / "));
    }

    console.log("\n[3] Назви в підказках — текст, а не розмітка");
    {
        const w = setup(PRODUCTS);

        await w.__run("гаманець");
        const btn = w.document.querySelector("#searchSuggestions .search-suggestion-item");
        check("тег у назві не став тегом", btn && btn.querySelector("b") === null, btn && btn.innerHTML);
        check("а назва лишилась як є", btn && btn.textContent === "Гаманець <b>Coach</b>", btn && btn.textContent);
    }

    console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
    process.exit(failures === 0 ? 0 : 1);

})().catch(error => { console.log("  ✗ виняток:", error.message); process.exit(1); });
