// Порожні стани: заголовок — сам текст стану, а не смайлик.
//
// ЩО БУЛО
// --------
// У всіх семи порожніх станах (кошик, обране, оформлення, замовлення в
// кабінеті, «нічого не знайдено» в каталозі й акціях, «акцію не
// знайдено», «товар не знайдено») заголовком був значок: <h2>🛒</h2>, а
// текст стану — <p>. Хто ходить сторінкою за заголовками, чув
// «заголовок 2, візок для покупок»; «Ваш кошик поки порожній»
// заголовком не був. На «Товар не знайдено» не було й h1: блок підміняв
// увесь вміст сторінки разом із ним.
//
// Вигляд не змінився: розміри зняті з браузера до правки й після —
// збігаються до пікселя.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

// Заголовок без жодної літери чи цифри — це значок, а не заголовок.
const NO_WORDS = /<h([1-6])\b[^>]*>\s*([^<]*?)\s*<\/h\1>/gi;
const isIconOnly = text => text.length > 0 && !/[\p{L}\p{N}]/u.test(text);

const pages = [];
const walk = (dir, rel) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(entry => {
    if (["node_modules", ".git", "supabase", "admin", "tests"].includes(entry.name)) return;
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), next);
    else if (entry.name.endsWith(".html")) pages.push(next);
});
walk(".", "");

console.log("\n[1] Жодного заголовка-смайлика — ні на сторінках, ні в коді");
{
    const bad = [];
    const sources = [...pages, ...fs.readdirSync(path.join(ROOT, "assets/js")).filter(f => f.endsWith(".js")).map(f => "assets/js/" + f)];

    sources.forEach(rel => {
        const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
        for (const m of text.matchAll(NO_WORDS)) {
            if (isIconOnly(m[2])) { bad.push(`${rel}: <h${m[1]}>${m[2]}</h${m[1]}>`); break; }
        }
    });

    check(`перевірено файлів — ${sources.length}`, sources.length > 100, sources.length);
    check("заголовків без слів немає", bad.length === 0, bad.slice(0, 4).join(" | "));
}

console.log("\n[2] Кожен порожній стан: значок схований, заголовок — текст");
{
    const states = [];
    const problems = [];

    pages.forEach(rel => {
        const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
        if (!/class="empty-state[ "]/.test(html)) return;
        const { document } = new JSDOM(html).window;
        document.querySelectorAll(".empty-state").forEach(box => {
            states.push(`${rel}#${box.id}`);
            const icon = box.querySelector(".empty-state-icon");
            const heading = box.querySelector("h1, h2, h3");
            if (icon && icon.getAttribute("aria-hidden") !== "true") problems.push(`${rel}#${box.id}: значок без aria-hidden`);
            if (!heading) problems.push(`${rel}#${box.id}: заголовка немає`);
            else if (!/[\p{L}]/u.test(heading.textContent)) problems.push(`${rel}#${box.id}: заголовок без слів`);
        });
    });

    check(`порожніх станів знайдено — ${states.length}`, states.length >= 7, states.length);
    check("у всіх значок схований, а заголовок має слова", problems.length === 0, problems.slice(0, 3).join(" | "));

    // Семеро, на яких це помітили, — поіменно.
    const need = { "cart.html": "Ваш кошик поки порожній", "favorites.html": "В обраному поки нічого немає",
        "checkout.html": "Ваш кошик порожній", "account.html": "У вас поки немає замовлень",
        "catalog.html": "За вашим запитом нічого не знайдено", "promo.html": "Цю акцію не знайдено" };
    Object.entries(need).forEach(([rel, words]) => {
        const { document } = new JSDOM(fs.readFileSync(path.join(ROOT, rel), "utf8")).window;
        const found = [...document.querySelectorAll(".empty-state h2")].some(h => h.textContent.includes(words));
        check(`${rel}: «${words}…» — заголовок`, found);
    });
}

console.log("\n[3] «Товар не знайдено» — головний заголовок сторінки");
{
    const product = fs.readFileSync(path.join(ROOT, "assets/js/product.js"), "utf8");
    const block = (product.match(/<div class="empty-state product-not-found">[\s\S]*?<\/div>`/) || [""])[0];
    check("блок знайдено", block.length > 0);
    // Блок підміняє весь вміст сторінки товару, разом з її h1.
    check("<h1>Товар не знайдено</h1>", /<h1 class="empty-state-heading">Товар не знайдено<\/h1>/.test(block));
    check("значок — прикраса", /<div class="empty-state-icon" aria-hidden="true">/.test(block) || /\$\{icon\(/.test(block));
}

console.log("\n[4] Вигляд — той самий, що був");
{
    const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = sel => (css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}")) || [])[1] || "";

    // Числа зняті з браузера ДО правки (getComputedStyle на 1280px).
    const icon = rule(".empty-state-icon");
    check("значок 52px/800, відступ 10", /font-size:52px/.test(icon) && /font-weight:800/.test(icon) && /margin-bottom:10px/.test(icon));

    const title = rule(".empty-state .empty-state-title");
    check("текст-заголовок як був абзац: 17px/400, сірий, відступ 24",
        /font-size:17px/.test(title) && /font-weight:400/.test(title) && /color:var\(--gray500\)/.test(title) && /margin:0 0 24px/.test(title));

    const heading = rule(".empty-state .empty-state-heading");
    check("великий заголовок як був h3: 24px/700", /font-size:24px/.test(heading) && /font-weight:700/.test(heading));

    check("«Товар не знайдено» — свої 26px", /font-size:26px/.test(rule(".product-not-found .empty-state-heading")));
    check("старого правила для смайлика-h2 немає", !/\.empty-state h2\{/.test(css));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
