// Збірка не мусить падати через файл, зайнятий на мить.
//
// СИМПТОМ
// --------
// `npm run build` падає посеред дороги на випадковому файлі:
//
//   Error: EBUSY: resource busy or locked, open '…\index.html'
//       at …\scripts\apply-cache-version.js:157:23
//
// Наступний запуск тієї самої збірки — без єдиної зміни в коді —
// проходить. Заміряно 24.09.2026 двічі: у звичайній збірці (код
// UNKNOWN) і в наборі тестів, де через це впав test-static-product-
// pages.js — рівно на двох перевірках розділу [8], які просто не
// встигли надрукуватись.
//
// ПРИЧИНА
// --------
// На Windows файл можна відкрити монопольно, і поки хтось його так
// тримає, будь-яке інше відкриття падає — навіть на читання. Так
// поводяться антивірус, індексатор пошуку, відкритий редактор.
//
// ЧОМУ ЦЕ НЕ ПРОСТО «ВПАЛА ЗБІРКА»
// ---------------------------------
// Збірники пишуть сотні файлів по черзі. Виняток посеред дороги
// лишає дерево напівзібраним: частина сторінок зі свіжим штампом
// версії, частина зі старим. Саме так у гілці опинилось 227
// проштампованих сторінок замість 228.
//
// ЩО САМЕ ЗАКРІПЛЮЄ ЦЕЙ НАБІР
// ----------------------------
// Повтор мусить бути вибірковим. Повторювати все підряд — гірше за
// відсутність повтору: тоді збірка на зламаних даних мовчки чекає
// секунду й падає тим самим, лише пізніше й незрозуміліше.
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const safe = require(path.join(ROOT, "scripts/fs-retry.js"));

// Підміняємо саму функцію fs, а не файли на диску: замок, який
// відпускають рівно після N спроб, інакше не відтворити надійно.
// Модуль кличе fs.readFileSync у момент виклику, тож підміна діє.
const realRead = fs.readFileSync;
const realWrite = fs.writeFileSync;

function withFakeRead(fn, impl) {
    fs.readFileSync = impl;
    try { return fn(); } finally { fs.readFileSync = realRead; }
}

const err = code => {
    const e = new Error(`${code}: підробка для тесту`);
    e.code = code;
    return e;
};

console.log("\n[1] Тимчасовий замок переживаємо");
{
    let calls = 0;

    const got = withFakeRead(
        () => safe.readFileSync("будь-що"),
        () => { calls += 1; if (calls < 3) throw err("EBUSY"); return "вміст"; }
    );

    check("після двох відмов читання таки вдається", got === "вміст", got);
    check("спроб рівно стільки, скільки треба", calls === 3, calls);
}

console.log("\n[2] Кожен код тимчасового замку враховано");
{
    // EBUSY дає монопольне відкриття, EPERM і EACCES — права на
    // мить забрані, UNKNOWN видає антивірус. Лікування одне.
    ["EBUSY", "EPERM", "EACCES", "UNKNOWN"].forEach(code => {

        let calls = 0;

        const got = withFakeRead(
            () => safe.readFileSync("будь-що"),
            () => { calls += 1; if (calls < 2) throw err(code); return "вміст"; }
        );

        check(`${code}: чекаємо й пробуємо ще раз`, got === "вміст" && calls === 2);

    });
}

console.log("\n[3] Справжню помилку не ховаємо");
{
    // Немає файлу, немає місця, не той шлях — повтор нічого не
    // змінить. Чекати тут означає лише пізніше показати ту саму
    // помилку, ще й приховавши, скільки разів вона сталась.
    ["ENOENT", "ENOSPC", "EISDIR", "ENOTDIR"].forEach(code => {

        let calls = 0;
        let thrown = null;

        try {
            withFakeRead(
                () => safe.readFileSync("будь-що"),
                () => { calls += 1; throw err(code); }
            );
        } catch (error) {
            thrown = error;
        }

        check(`${code}: падаємо одразу, з першої спроби`,
            thrown && thrown.code === code && calls === 1, `спроб: ${calls}`);

    });
}

console.log("\n[4] Замок, який не відпускають, збірку валить");
{
    // Пропустити файл було б найгіршим із варіантів: дерево лишилось
    // би напівзібраним, і ніхто б про це не дізнався.
    let calls = 0;
    let thrown = null;

    const started = Date.now();

    try {
        withFakeRead(
            () => safe.readFileSync("будь-що"),
            () => { calls += 1; throw err("EBUSY"); }
        );
    } catch (error) {
        thrown = error;
    }

    const spent = Date.now() - started;

    check("зрештою кидає помилку, а не мовчить",
        thrown !== null && thrown.code === "EBUSY");

    check(`спроб рівно ${safe.DELAYS.length + 1} — перша плюс повтори`,
        calls === safe.DELAYS.length + 1, calls);

    // Чекати довго теж не можна: збірка пише сотні файлів, і якби
    // кожен чекав по 10 с, зламані права перетворили б збірку на
    // півгодинне мовчання.
    const budget = safe.DELAYS.reduce((a, b) => a + b, 0);

    check(`здається приблизно за ${budget} мс, а не висить`,
        spent >= budget * 0.5 && spent < budget * 3, `витрачено ${spent} мс`);
}

console.log("\n[5] Збірники справді ним користуються");
{
    // Модуль без застосування — мертвий код. Ці два пишуть найбільше
    // файлів: штампувальник читає всі сторінки й переписує змінені,
    // генератор переписує всі 176 сторінок товарів.
    [
        "scripts/apply-cache-version.js",
        "scripts/build-product-pages.js"
    ].forEach(rel => {

        const code = read(rel);

        check(`${path.basename(rel)}: підключає fs-retry`,
            /require\("\.\/fs-retry"\)/.test(code));

        // Прямий виклик в обхід — та сама діра, тільки непомітна.
        const bare = (code.match(/\bfs\.(read|write)FileSync\(/g) || []);

        check(`${path.basename(rel)}: не читає й не пише повз нього`,
            bare.length === 0, bare.join(", "));

    });
}

console.log("\n[6] Пауза не крутить процесор");
{
    // Синхронна пауза мусить бути саме очікуванням. Порожній цикл
    // while (Date.now() - t < ms) з'їдав би ядро на кожен файл, і на
    // 176 сторінках це відчутно.
    const src = read("scripts/fs-retry.js");

    check("чекаємо через Atomics.wait, а не порожнім циклом",
        /Atomics\.wait\(/.test(src) && !/while\s*\([^)]*Date\.now\(\)/.test(src));

    check("повторюємо лише вибрані коди, не все підряд",
        /TRANSIENT\.has\(error\.code\)/.test(src));
}

// Про всяк випадок: якщо якийсь розділ підмінив fs і не повернув,
// далі посиплються сусідні набори, а причину шукати будуть довго.
check("fs повернуто на місце",
    fs.readFileSync === realRead && fs.writeFileSync === realWrite);

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
