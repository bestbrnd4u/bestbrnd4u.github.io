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

console.log("\n[4] Перезбірка дева справді виїжджає");
{
    const dev = read(".github/workflows/build-dev.yml");

    // Дев публікує Cloudflare Pages, стежачи за гілкою. Він читає ту
    // саму позначку пропуску, що й GitHub Actions, — і з нею жодна
    // перезбірка на дев не виїжджала: сайт показував стан
    // ПОПЕРЕДНЬОГО коміту, тобто правка з адмінки з'являлась аж після
    // наступної правки. Виглядало як «правка не зберігається».
    const skips = dev.match(/git commit -m "[^"]*"/g) || [];

    check("коміт перезбірки без позначки пропуску CI",
        skips.every(line => !/\[\s*(skip|no)[\s-]*ci\s*\]|\[\s*ci[\s-]*(skip|no)\s*\]/i.test(line)),
        skips.join(" | "));

    // Позначка тут і не потрібна: пуш зроблено вбудованим
    // GITHUB_TOKEN, а такий пуш не породжує події push. Якщо колись
    // з'явиться свій токен — самозапуск повернеться, і позначку
    // доведеться замінити чимось іншим, а не повертати.
    check("пуш робиться вбудованим токеном",
        !/persist-credentials:\s*false/.test(dev)
        && !/token:\s*\$\{\{\s*secrets\./.test(dev));

    check("сказано, чому позначки немає",
        /Cloudflare Pages/.test(dev) && /GITHUB_TOKEN/.test(dev));
}

console.log("\n[5] Джерело виграє й там, де воно файл видалило");
{
    // ЩО СТАЛОСЬ 05.10.2026. Прод не виїхав: перевірка архіву
    // показала картинку, якої немає в маніфесті.
    //
    // Ланцюг такий. Плановий воркфлоу архівації працював на main і
    // переніс там файл з медіатеки в архів — для git це
    // ПЕРЕЙМЕНУВАННЯ. На dev той самий файл прибрали. Виходить
    // конфлікт rename/delete.
    //
    // Маніфест при цьому злився без конфлікту й узяв версію dev,
    // тобто БЕЗ запису про цей файл. А сам файл лишився: `git
    // checkout --theirs` на конфлікт типу UD («ми змінили, джерело
    // видалило») не діє — сторони «theirs» у нього просто немає.
    //
    // Вийшов файл в архіві без запису в маніфесті, тобто такий, який
    // --restore уже не поверне.
    const sync = read(".github/workflows/sync-branches.yml");

    const вирішення = sync.slice(
        sync.indexOf("git merge --no-edit -X theirs"),
        sync.indexOf("npm run build"));

    check("блок розвʼязання конфліктів знайдено", вирішення.length > 50);

    // Питаємо прямо: чи є цей шлях у джерелі.
    check("перевіряється, чи шлях узагалі є в джерелі",
        /git cat-file -e "origin\/\$\{\{ steps\.pick\.outputs\.from \}\}:\$file"/.test(вирішення),
        вирішення.replace(/\s+/g, " ").slice(0, 120));

    check("чого немає в джерелі — прибирається",
        /git rm -f -q -- "\$file"/.test(вирішення));

    check("решта й далі береться з джерела",
        /git checkout --theirs -- "\$file"/.test(вирішення));

    // Старий блок складався з одного рядка `git checkout --theirs .`
    // і саме тому пропускав видалення. Якщо колись повернеться —
    // маємо дізнатись одразу, а не з червоного прода.
    check("однієї лише --theirs уже не досить",
        /git cat-file -e/.test(вирішення),
        "повернувся старий варіант без перевірки наявності");

    // ЖОДНОГО КОНВЕЄРА МІЖ git diff І ТІЛОМ ЦИКЛУ.
    //
    // `git diff` оновлює кеш індексу й бере .git/index.lock. У
    // конвеєрі він працює ОДНОЧАСНО з git rm у тілі циклу, і крок
    // падає з «Unable to create index.lock». Локально це гонка, яку
    // на короткому списку щастить пройти, — я так і проґавив її,
    // а на раннері вона впала з першого разу.
    check("список конфліктів читається з файлу, а не з конвеєра",
        /git diff --name-only --diff-filter=U -z > "\$\w+"/.test(вирішення)
        && !/--diff-filter=U[^\n]*\|\s*while/.test(вирішення),
        (вирішення.match(/git diff --name-only[^\n]*/) || ["немає"])[0]);

    // Файл зі списком мусить лежати ПОЗА робочою текою: усередині
    // його підхопив би git add -A нижче й поклав би в коміт.
    check("список лежить поза робочою текою",
        /RUNNER_TEMP/.test(вирішення),
        (вирішення.match(/conflicts=[^\n]*/) || ["немає"])[0]);

    // ІМЕНА ЗМІННИХ У BASH — ЛИШЕ ЛАТИНИЦЯ.
    //
    // Кириличний ідентифікатор це синтаксична помилка, крок падає
    // цілком. Перевірка спершу дивилась тільки на змінну циклу — і я
    // тут-таки вписав кириличну в ІНШОМУ рядку. Тепер дивимось на всі
    // присвоєння й на всі `read`.
    const імена = [
        ...(вирішення.match(/^\s*([^\s=]+)=/gm) || []).map(с => с.trim().replace(/=$/, "")),
        ...(вирішення.match(/read -r -d '' ([^\s;]+)/g) || []).map(с => с.replace(/.*'' /, ""))
    ];

    check("імена змінних у bash латиницею",
        імена.length > 0 && імена.every(і => /^[A-Za-z_][A-Za-z0-9_]*$/.test(і)),
        імена.filter(і => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(і)).join(", ") || (імена.length ? "" : "змінних не знайдено"));

    // workflow_dispatch бере файл воркфлоу з тієї гілки, на якій його
    // запустили. Поки правка самого воркфлоу не доїхала до main,
    // запускати доводиться з dev — і тоді «перейти на гілку-приймач»
    // уже не порожня дія. Беремо її явно з origin, а не покладаємось
    // на здогадку git про віддалену гілку.
    check("гілка-приймач береться явно з origin",
        /git checkout -B "\$\{\{ steps\.pick\.outputs\.to \}\}" "origin\/\$\{\{ steps\.pick\.outputs\.to \}\}"/.test(sync),
        (sync.match(/git checkout[^\n]*outputs\.to[^\n]*/) || ["немає"])[0]);
}

console.log("\n[6] Архівація картинок працює там, де картинки");
{
    // Картинки приходять з адмінки, а вона комітить у ту гілку, що
    // вказана в admin/config.yml. Поки архівація працювала на
    // типовій гілці (main), її зміни на dev не потрапляли НІКОЛИ —
    // гілки їздять лише в один бік. Звідси й розбіжність, через яку
    // став прод.
    const archive = read(".github/workflows/archive-unused-images.yml");
    const cms = read("admin/config.yml");

    const гілкаАдмінки = (cms.match(/^\s*branch:\s*(\S+)/m) || [])[1];

    check("гілку адмінки прочитано", Boolean(гілкаАдмінки), гілкаАдмінки);

    check("архівація бере ту саму гілку, що й адмінка",
        new RegExp(`ref:\\s*${гілкаАдмінки}\\b`).test(archive),
        (archive.match(/ref:\s*\S+/) || ["ref не заданий — отже, типова гілка"])[0]);

    check("і пушить саме туди",
        new RegExp(`git push origin HEAD:${гілкаАдмінки}\\b`).test(archive),
        (archive.match(/git push[^\n]*/) || ["немає"])[0]);

    // Без явного ref actions/checkout бере типову гілку — тобто main.
    check("типова гілка більше не підставляється мовчки",
        /ref:/.test(archive.slice(archive.indexOf("name: Checkout"),
                                  archive.indexOf("name: Setup Node"))));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
