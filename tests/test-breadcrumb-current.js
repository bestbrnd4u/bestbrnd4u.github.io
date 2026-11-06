// Поточна ланка хлібних крихт видна на телефоні.
//
// ЩО БУЛО
// --------
// Заміряно в браузері на 375px:
//
//   - «Головна – Кошик – Оформлення замовлення» не влазила на 33px, і
//     рядок обрізався посеред слова: «Оформлення замовленн». Остання
//     ланка на сторінках, написаних руками, була голим <span> — без
//     crumb-current, тож ні трьох крапок, ні жирного, як на решті
//     сайту.
//   - На сторінках категорій, брендів і розділів доріжка не влазила
//     (на 320–375px — у 49 вимірах із 68), а показувалась із
//     ПОЧАТКУ: назва сторінки, де людина стоїть, була цілком за
//     правим краєм. На товарі це давно лікує product.js, а
//     згенерованих сторінок не торкалось ніщо.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Сторінки з доріжкою: корінь (руками) і згенеровані теки.
function pagesWithTrail() {

    const out = [];

    fs.readdirSync(ROOT).filter(f => f.endsWith(".html")).forEach(f => out.push(f));

    ["p", "brands", "categories", "departments", "promo"].forEach(dir => {
        const full = path.join(ROOT, dir);
        if (!fs.existsSync(full)) return;
        fs.readdirSync(full).forEach(sub => {
            const page = path.join(dir, sub, "index.html");
            if (fs.existsSync(path.join(ROOT, page))) out.push(page);
        });
    });

    return out.filter(rel => /<section class="breadcrumbs">/.test(read(rel)));

}

console.log("\n[1] Остання ланка доріжки — crumb-current на кожній сторінці");
{
    const pages = pagesWithTrail();

    check("сторінок із доріжкою знайдено", pages.length > 100, pages.length);

    const without = pages.filter(rel => {
        const block = read(rel).match(/<section class="breadcrumbs">([\s\S]*?)<\/section>/)[1];
        const spans = [...block.matchAll(/<span(?![^>]*crumb-sep)([^>]*)>/g)]
            // стрілка кнопки «Назад» — span усередині посилання, не ланка
            .filter(m => !/aria-hidden/.test(m[1]));
        const last = spans[spans.length - 1];
        return !last || !/crumb-current/.test(last[1]);
    });

    check("без crumb-current — жодної", without.length === 0, without.slice(0, 5).join(", "));
}

console.log("\n[2] Коротка доріжка стискає назву, а не обрізає її");
{
    const css = read("assets/css/style.css")
        .replace(/\/\*[\s\S]*?\*\//g, "");

    const rule = css.match(/\.breadcrumbs \.container:not\(#breadcrumbsList\) > \.crumb-current\{([^}]*)\}/);

    check("правило для сторінок, написаних руками, є", Boolean(rule));

    if (rule) {
        check("ланка може стискатись", /flex:0 1 auto/.test(rule[1]));
        // Без min-width:0 flex-елемент не стискається нижче ширини тексту.
        check("min-width:0", /min-width:0/.test(rule[1]));
        // 60vw від загального правила лишало б ту саму обрізку: на
        // 375px це 225px, а місця після «Головна – Кошик –» — 174px.
        check("загальне обмеження 60vw знято", /max-width:none/.test(rule[1]));
    }

    // Товари й каталог прокручуються свідомо: стиснення там з'їло б
    // назву до нуля, бо решта ланок не стискається.
    // Шукаємо будь-яке правило для crumb-current, що дозволяє
    // стискатись, — і кожне мусить обходити #breadcrumbsList.
    const shrinking = [...css.matchAll(/([^{}]*crumb-current[^{}]*)\{([^}]*)\}/g)]
        .filter(m => /flex:0 1|flex-shrink:\s*[1-9]/.test(m[2]))
        .map(m => m[1].trim());

    check("доріжки з прокруткою (#breadcrumbsList) не зачеплено",
        shrinking.length > 0 && shrinking.every(sel => /:not\(#breadcrumbsList\)/.test(sel)),
        shrinking.join(" | "));
}

console.log("\n[3] Доріжка, що не влазить, показується з кінця");
{
    // Без браузера ширин немає, тому підставляємо смуги з готовими
    // розмірами й дивимось, куди файл їх прокрутить.
    const host = (scrollWidth, clientWidth, touched) => ({
        scrollWidth, clientWidth, scrollLeft: 0,
        dataset: touched ? { trailTouched: "1" } : {}
    });

    const wide = host(500, 365);
    const fits = host(300, 365);
    const touched = host(500, 365, true);

    const listeners = {};

    global.document = {
        readyState: "complete",
        addEventListener: (type, fn) => { listeners[type] = fn; },
        querySelectorAll: sel => sel === ".breadcrumbs .container" ? [wide, fits, touched] : []
    };

    delete require.cache[require.resolve("../assets/js/breadcrumbs.js")];
    require("../assets/js/breadcrumbs.js");

    check("довгу доріжку прокручено до кінця", wide.scrollLeft === 500, wide.scrollLeft);
    check("ту, що влазить, не чіпаємо", fits.scrollLeft === 0, fits.scrollLeft);
    check("доріжку, яку людина вже гортала, не відбираємо", touched.scrollLeft === 0, touched.scrollLeft);
    check("дотик позначає доріжку як займану", typeof listeners.touchstart === "function");

    // Документ ще вантажиться — чекаємо DOMContentLoaded, а не мовчимо.
    const late = host(500, 365);
    global.document = {
        readyState: "loading",
        addEventListener: (type, fn) => { listeners[type] = fn; },
        querySelectorAll: () => [late]
    };
    delete require.cache[require.resolve("../assets/js/breadcrumbs.js")];
    require("../assets/js/breadcrumbs.js");

    check("до DOMContentLoaded не прокручує", late.scrollLeft === 0);
    if (listeners.DOMContentLoaded) listeners.DOMContentLoaded();
    check("після DOMContentLoaded прокручує", late.scrollLeft === 500, late.scrollLeft);

    delete global.document;

    // Файл підключено там, де доріжка прокручується.
    const pages = ["categories", "brands", "departments"].map(dir => {
        const sub = fs.readdirSync(path.join(ROOT, dir))
            .find(s => fs.existsSync(path.join(ROOT, dir, s, "index.html")));
        return path.join(dir, sub, "index.html");
    });

    pages.forEach(rel => check(rel.split(path.sep)[0] + ": breadcrumbs.js підключено",
        /assets\/js\/breadcrumbs\.js/.test(read(rel))));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
