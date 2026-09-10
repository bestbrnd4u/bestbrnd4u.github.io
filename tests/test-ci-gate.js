// Тести мусять запускатись на тому, що справді їде на прод.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Заміряно 10 вересня: останній прогон набору був 5 вересня, а 9
// вересня на прод поїхало вісім комітів. Жоден із них тестів не
// проходив.
//
// Причин дві, і обидві тихі:
//
//   1. У тригері tests.yml стояв лише main, а вся робота йде в dev.
//   2. Пуш у main робить сам Sync branches вбудованим GITHUB_TOKEN, а
//      такий пуш НЕ породжує подію push — GitHub так захищається від
//      нескінченних ланцюжків workflow. Той самий workflow цю пастку
//      вже знає: через неї він вручну запускає deploy-pages. Для
//      тестів обходу не було.
//
// Тобто ворота перед продом були намальовані, але не зачинялись.
//
// ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ
// ---------------------
// 1. Набір ганяється на обох гілках.
// 2. Sync branches проганяє його САМ — і саме перед пушем, після
//    злиття й перезбірки: перевіряти треба той стан файлів, який
//    поїде, а не той, що був до злиття.
// 3. Обхід для деплою лишився на місці (він тримається на тій самій
//    особливості GITHUB_TOKEN).
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// js-yaml читає `on:` як булеве true — це давня особливість YAML 1.1.
const load = rel => {
    const doc = yaml.load(read(rel));
    return { ...doc, on: doc.on ?? doc[true] };
};

console.log("\n[1] Набір ганяється на обох гілках");
{
    const tests = load(".github/workflows/tests.yml");

    const push = tests.on.push.branches || [];

    check("на пуш у main", push.includes("main"), push.join(", "));
    check("і на пуш у dev — саме там іде робота", push.includes("dev"), push.join(", "));

    // Серія правок в адмінці не має давати серію прогонів.
    check("зайві прогони гасяться",
        tests.concurrency && tests.concurrency["cancel-in-progress"] === true);
}

console.log("\n[2] Sync branches сам перевіряє те, що поїде");
{
    const sync = load(".github/workflows/sync-branches.yml");

    const steps = Object.values(sync.jobs)[0].steps;

    const names = steps.map(s => s.name || "");

    const at = needle => names.findIndex(n => n.includes(needle));

    const build = at("Перенести і перезібрати");
    const test = steps.findIndex(s => String(s.run || "").trim() === "npm test");
    const push = steps.findIndex(s => /git push origin/.test(String(s.run || "")));
    const deploy = at("Trigger deploy");

    check("крок перенесення є", build >= 0);
    check("набір ганяється", test >= 0);
    check("пуш винесений окремим кроком", push >= 0);

    // ПОРЯДОК — це і є суть воріт.
    check("тести ПІСЛЯ перезбірки: перевіряємо те, що поїде, а не те, що було",
        test > build, `перезбірка ${build}, тести ${test}`);

    check("тести ДО пуша: червоні не пускають реліз",
        test < push, `тести ${test}, пуш ${push}`);

    check("деплой після пуша", deploy > push, `пуш ${push}, деплой ${deploy}`);

    // Обхід GITHUB_TOKEN для деплою тримається на тій самій
    // особливості. Приберуть його — сайт лишиться на старій збірці.
    check("деплой і далі запускається вручну",
        /gh workflow run deploy-pages\.yml/.test(String(steps[deploy].run || "")));

    // Середовище для тестів — те, під яке щойно зібрали. Без цього
    // на main-to-dev перевірялась би не та збірка.
    check("тести бачать середовище гілки-приймача",
        steps[test].env && /steps\.pick\.outputs\.env/.test(String(steps[test].env.SITE_ENV)));
}

console.log("\n[3] Пуш і коміт не сплутані");
{
    const sync = read(".github/workflows/sync-branches.yml");

    // Коміт мусить лишатись у кроці перезбірки, а пуш — окремо.
    // Якщо їх знову зліпити, тести опиняться після пуша й ворота
    // перестануть бути воротами.
    const merge = sync.slice(
        sync.indexOf("Перенести і перезібрати"),
        sync.indexOf("ВОРОТА ПЕРЕД ПРОДОМ"));

    check("у кроці перезбірки пуша немає",
        !/git push/.test(merge), "git push лишився в кроці злиття");

    check("коміт лишився там, де злиття", /git commit -m "chore:/.test(merge));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
