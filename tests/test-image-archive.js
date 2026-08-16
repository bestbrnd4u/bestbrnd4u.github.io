// Архів невикористаних картинок.
//
// Ціна помилки тут несиметрична: якщо скрипт не помітить сміття —
// в медіатеці просто лишиться зайвий файл; якщо ж він помилково
// вирішить, що потрібне фото нікому не потрібне, — на сайті зникне
// картинка товару. Тому більшість перевірок нижче — саме про
// ХИБНІ СПРАСПРАЦЮВАННЯ: що живі файли не потрапляють у список.
//
// Реальний промах, який ловить [2]: перша версія скрипта шукала
// посилання регуляркою за списком розширень і оголосила невживаним
// відео товару, бо .mp4 у тому списку не було. Тепер пошук іде від
// файлу до тексту, і список розширень узагалі не потрібен.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { findUnused, MEDIA_DIR_REL, ARCHIVE_DIR_REL, ARCHIVE_AFTER_DAYS } =
    require("../scripts/archive-unused-images");

const MEDIA_DIR = path.join(ROOT, MEDIA_DIR_REL);
const { execFileSync } = require("child_process");
const SCRIPT = path.join(ROOT, "scripts/archive-unused-images.js");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const run = args => execFileSync("node", [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8" });

// прибираємо за собою навіть якщо перевірка впала
const cleanup = [];
const tempFile = (rel, content) => {
    const full = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    cleanup.push(full);
    return full;
};

try {

console.log("\n[1] Архів лежить поза медіатекою адмінки");
{
    // інакше Decap показував би заархівоване в тому самому діалозі
    // "Images", і сенс прибирання зникає
    check("тека архіву не всередині media_folder",
        !ARCHIVE_DIR_REL.startsWith(MEDIA_DIR_REL), `${ARCHIVE_DIR_REL} vs ${MEDIA_DIR_REL}`);

    const config = fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8");
    check("media_folder у конфізі збігається з тим, що читає скрипт",
        config.includes(`media_folder: "${MEDIA_DIR_REL}"`));

    check("відстрочка ненульова (фото могли завантажити наперед)",
        ARCHIVE_AFTER_DAYS > 0, ARCHIVE_AFTER_DAYS);
}

console.log("\n[2] Живі файли не потрапляють у список");
{
    const unused = new Set(findUnused());

    // відео товару — саме на ньому спіткнулась перша версія
    // вихідні файли товарів, а не згенерований агрегат
    // (правило з tests/test-migration-types.js)
    const productsDir = path.join(ROOT, "data/products");
    const products = fs.readdirSync(productsDir)
        .filter(f => f.endsWith(".json"))
        .map(f => JSON.parse(fs.readFileSync(path.join(productsDir, f), "utf8")));
    const videos = products
        .flatMap(p => (p.variants || []).map(v => v && v.video))
        .filter(Boolean)
        .map(v => path.basename(v));

    check(`відео товарів не вважається сміттям (${videos.length} шт.)`,
        videos.every(v => !unused.has(v)), videos.filter(v => unused.has(v)).join(", "));

    // усі фото з даних
    const images = products
        .flatMap(p => [...(p.images || []), ...(p.variants || []).flatMap(v => (v && v.images) || [])])
        .filter(Boolean)
        .map(i => decodeURIComponent(path.basename(i)));

    const wronglyFlagged = [...new Set(images)].filter(i => unused.has(i));
    check(`жодне фото товару не позначене невживаним (${new Set(images).size} шт.)`,
        wronglyFlagged.length === 0, wronglyFlagged.slice(0, 3).join(", "));

    // зменшені копії: у даних записана лише повна ширина
    const variants = fs.readdirSync(MEDIA_DIR).filter(f => /-(300|600)\.webp$/.test(f));
    const liveVariants = variants.filter(v => {
        const base = v.replace(/-(300|600)\.webp$/, ".webp");
        return images.includes(base);
    });

    check(`зменшені копії живих фото збережено (${liveVariants.length} шт.)`,
        liveVariants.every(v => !unused.has(v)),
        liveVariants.filter(v => unused.has(v)).slice(0, 3).join(", "));

    // акції, добірки, попапи, головна
    ["data/promotions.json", "data/collections.json", "data/promo-popups.json", "data/home.json"]
        .filter(f => fs.existsSync(path.join(ROOT, f)))
        .forEach(rel => {
            const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
            const refs = [...new Set(text.match(/uploads\/[^"]+/g) || [])]
                .map(r => decodeURIComponent(path.basename(r)));
            const bad = refs.filter(r => unused.has(r));
            check(`${rel}: картинки не позначені невживаними`, bad.length === 0, bad.join(", "));
        });
}

console.log("\n[3] Кирилиця в імені й відсоткове кодування");
{
    const name = "тест-архів-перевірка.png";
    tempFile(`${MEDIA_DIR_REL}/${name}`, "x");

    check("незгаданий кириличний файл потрапляє у список",
        findUnused().includes(name));

    // тепер посилаємось на нього ЗАКОДОВАНО, як це робить браузер
    tempFile("tmp-archive-ref-check.html",
        `<img src="/${MEDIA_DIR_REL}/${encodeURIComponent(name)}">`);

    check("закодоване посилання рахується як використання",
        !findUnused().includes(name));
}

console.log("\n[4] Скрипт не рахує власні коментарі за посилання");
{
    // перша версія знайшла в собі приклад закодованого імені
    // й вирішила, що та картинка використовується
    const self = fs.readFileSync(SCRIPT, "utf8");
    check("сам себе виключає з пошуку", /full === SELF/.test(self));

    const name = "тест-самопосилання.png";
    tempFile(`${MEDIA_DIR_REL}/${name}`, "x");
    check("файл, згаданий лише в самому скрипті, не вважається живим",
        findUnused().includes(name));
}

console.log("\n[5] Відстрочка: свіже сміття не їде в архів одразу");
{
    const name = "test-orphan-fresh.png";
    tempFile(`${MEDIA_DIR_REL}/${name}`, "x");

    const report = run([]);
    check("звіт бачить новий невживаний файл", report.includes(name));
    check("звіт нічого не переносить", fs.existsSync(path.join(MEDIA_DIR, name)));
    check("вказано, скільки чекати", /чекає ще|у архів через/.test(report));

    run(["--apply"]);
    check("--apply без --now не чіпає свіжий файл (він міг бути завантажений наперед)",
        fs.existsSync(path.join(MEDIA_DIR, name)));

    const pending = JSON.parse(
        fs.readFileSync(path.join(ROOT, ARCHIVE_DIR_REL, "pending.json"), "utf8"));
    check("файл узятий на облік у списку очікування", !!pending[name], Object.keys(pending).length);
}

console.log("\n[6] Перенесення і повернення");
{
    const name = "test-orphan-move.png";
    tempFile(`${MEDIA_DIR_REL}/${name}`, "x");

    // НЕ використовуємо --now: він змів би в архів і справжні файли
    // проєкту, а тест не має міняти стан репозиторію. Замість цього
    // "старимо" в списку очікування рівно один тестовий файл — заразом
    // це перевіряє, що відстрочка справді відлічується від дати там.
    run([]);

    const pendingFile = path.join(ROOT, ARCHIVE_DIR_REL, "pending.json");
    const pending = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
    const old = new Date(Date.now() - (ARCHIVE_AFTER_DAYS + 1) * 86400000);
    pending[name] = old.toISOString().slice(0, 10);
    fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2) + "\n");

    run(["--apply"]);

    check("файл зник з медіатеки", !fs.existsSync(path.join(MEDIA_DIR, name)));
    check("файл з'явився в архіві",
        fs.existsSync(path.join(ROOT, ARCHIVE_DIR_REL, name)));

    const manifest = JSON.parse(
        fs.readFileSync(path.join(ROOT, ARCHIVE_DIR_REL, "manifest.json"), "utf8"));
    const record = manifest.find(item => item.originalName === name);

    check("у маніфесті записано, звідки файл", record && record.from === `${MEDIA_DIR_REL}/${name}`,
        record && record.from);
    check("у маніфесті є дата", record && /^\d{4}-\d{2}-\d{2}$/.test(record.archivedAt));

    run(["--restore", name]);

    check("файл повернувся на своє місце", fs.existsSync(path.join(MEDIA_DIR, name)));
    check("з архіву зник", !fs.existsSync(path.join(ROOT, ARCHIVE_DIR_REL, name)));

    const after = JSON.parse(
        fs.readFileSync(path.join(ROOT, ARCHIVE_DIR_REL, "manifest.json"), "utf8"));
    check("запис прибрано з маніфесту", !after.some(item => item.originalName === name));
}

console.log("\n[7] Запуск за розкладом налаштований");
{
    const wf = path.join(ROOT, ".github/workflows/archive-unused-images.yml");
    check("є окремий workflow", fs.existsSync(wf));

    if (fs.existsSync(wf)) {
        const text = fs.readFileSync(wf, "utf8");
        check("за розкладом, а не на кожен пуш (щоб не чіпати файли під час редагування)",
            text.includes("schedule:") && !/^on:[\s\S]*?\n  push:/m.test(text));
        check("можна запустити руками", text.includes("workflow_dispatch"));
        check("запускається з --apply", text.includes("--apply"));
        // важливо перевіряти саме командний рядок: у коментарях
        // угорі workflow слово --now згадується як пояснення
        const runLines = (text.match(/^\s*run:.*$/gm) || []).join("\n");
        check("без --now у командному рядку — відстрочка лишається в силі",
            !runLines.includes("--now"), runLines);
    }
}

} finally {

    cleanup.reverse().forEach(f => { try { fs.rmSync(f, { force: true }); } catch (e) {} });

    // прибираємо сліди тестових файлів зі стану
    const pendingFile = path.join(ROOT, ARCHIVE_DIR_REL, "pending.json");

    if (fs.existsSync(pendingFile)) {
        const pending = JSON.parse(fs.readFileSync(pendingFile, "utf8"));
        Object.keys(pending).forEach(k => { if (k.startsWith("test-") || k.startsWith("тест-")) delete pending[k]; });
        fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2) + "\n");
    }

    const manifestFile = path.join(ROOT, ARCHIVE_DIR_REL, "manifest.json");

    if (fs.existsSync(manifestFile)) {
        const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
        const kept = manifest.filter(i => !i.originalName.startsWith("test-") && !i.originalName.startsWith("тест-"));
        kept.forEach(() => {});
        manifest.filter(i => !kept.includes(i)).forEach(i => {
            try { fs.rmSync(path.join(ROOT, ARCHIVE_DIR_REL, i.file), { force: true }); } catch (e) {}
        });
        fs.writeFileSync(manifestFile, JSON.stringify(kept, null, 2) + "\n");
    }

}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
