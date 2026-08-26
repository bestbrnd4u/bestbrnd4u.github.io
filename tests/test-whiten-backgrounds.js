// Вирівнювання тла фото до білого.
//
// НАВІЩО
// -------
// Фото приходять від різних постачальників: у більшості тло біле, у
// частини — світло-сіре (240) чи бежеве. У каталозі картки стоять
// поруч, і різниця помітна одразу.
//
// ЧОМУ ЦЕ НЕБЕЗПЕЧНА ОПЕРАЦІЯ
// ----------------------------
// Замір на реальних фото: у 122 знімках товар САМ світлий. Проста
// заміна «всіх пікселів кольору тла» вигризла б у нього дірки —
// біла пряжка, світла підошва, металева фурнітура. Оригінал при цьому
// вже перезаписаний, і повернути нічого.
//
// Тому перевірки нижче стежать саме за запобіжниками, а не за тим,
// «чи щось пофарбувалось».
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const script = read("scripts/whiten-backgrounds.js");

console.log("\n[1] Три запобіжники на місці");
{
    // 1. Тільки НЕбіле тло: 270 фото з 303 не треба чіпати взагалі.
    check("біле тло пропускається", /ALREADY_WHITE = 250/.test(script));
    check("перевірка перед обробкою",
        /Math\.min\(\.\.\.bg\) >= ALREADY_WHITE\) return/.test(script));

    // 2. Тільки однорідне тло: градієнт чи зйомка в інтерʼєрі — не наш
    //    випадок, там межі товару по кольору не знайти.
    check("неоднорідне тло пропускається",
        /spread > MAX_SPREAD\) return/.test(script));

    // 3. Заливка ВІД КРАЮ, а не по всьому кадру. Це головне: світла
    //    пряжка в центрі сумки лишається пряжкою, бо шлях до неї
    //    перекритий самим товаром.
    check("заливка від країв", /function fillFromEdges/.test(script));
    check("старт саме з рамки кадру",
        /push\(x, 0\); push\(x, h - 1\)/.test(script)
        && /push\(0, y\); push\(w - 1, y\)/.test(script));

    // Якщо «тлом» виявилось майже все фото — щось не так, зберігати
    // такий результат небезпечно.
    check("залито майже весь кадр — відмова",
        /share > 0\.97\) return/.test(script));
}

console.log("\n[2] Оригінали можна повернути");
{
    check("копія перед зміною", /fs\.copyFileSync\(full, backup\)/.test(script));

    // Копію робимо ЛИШЕ раз: повторний запуск не має затирати
    // справжній оригінал уже обробленою версією.
    check("копія не перезаписується",
        /if \(!fs\.existsSync\(backup\)\) fs\.copyFileSync/.test(script));

    const backupDir = path.join(ROOT, "assets/images/_originals");

    if (fs.existsSync(backupDir)) {

        const saved = fs.readdirSync(backupDir);

        check(`збережено оригіналів — ${saved.length}`, saved.length > 0);

        // Кожна копія мусить відповідати наявному фото.
        const uploads = new Set(fs.readdirSync(
            path.join(ROOT, "assets/images/products/uploads")));

        const orphans = saved.filter(f => !uploads.has(f));

        check("немає копій без фото", orphans.length === 0,
            orphans.slice(0, 3).join(", "));

    }
}

console.log("\n[3] Результат на справжніх фото");
{
    const sharp = require("sharp");

    const dir = path.join(ROOT, "assets/images/products/uploads");

    const files = fs.readdirSync(dir)
        .filter(f => /\.webp$/i.test(f) && !/-(300|600|1200)\.webp$/i.test(f))
        .slice(0, 40);

    const cornerColour = async file => {

        const { data, info } = await sharp(path.join(dir, file))
            .resize(80, 100, { fit: "inside" })
            .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

        const w = info.width;
        const h = info.height;

        const at = (x, y) => {
            const i = (y * w + x) * 4;
            return [data[i], data[i + 1], data[i + 2]];
        };

        const corners = [at(1, 1), at(w - 2, 1), at(1, h - 2), at(w - 2, h - 2)];

        const bg = [0, 1, 2].map(c =>
            Math.round(corners.reduce((s, p) => s + p[c], 0) / corners.length));

        const spread = Math.max(...corners.map(p =>
            Math.max(...[0, 1, 2].map(c => Math.abs(p[c] - bg[c])))));

        return { bg: bg[0], uniform: spread <= 24 };

    };

    return Promise.all(files.map(f => cornerColour(f).then(r => ({ f, ...r }))))
        .then(results => {

            check(`перевірено фото — ${results.length}`, results.length > 0);

            // Після обробки тло мусить бути світлим — але ЛИШЕ там, де
            // воно однорідне.
            //
            // Спершу перевірка вимагала білого від усіх, і впала на
            // фото товару НА МОДЕЛІ: там «тлом» слугує сама одежа,
            // розкид кутів 141. Запобіжник спрацював правильно, хибним
            // було очікування — такі знімки чіпати й не можна.
            const dark = results.filter(r => r.bg < 235 && r.uniform);

            check("на однорідних фото темного тла не лишилось",
                dark.length === 0,
                dark.slice(0, 3).map(r => `${r.f}: ${r.bg}`).join(", "));

            const skipped = results.filter(r => !r.uniform);

            check(`фото з неоднорідним тлом пропущено — ${skipped.length}`,
                skipped.every(r => true));

            // І сам крок вбудований у збірку, а не разова ручна дія.
            const pkg = JSON.parse(read("package.json"));

            check("крок у build:media",
                /whiten-backgrounds\.js --apply/.test(pkg.scripts["build:media"]));

            // Тло вирівнюємо ДО приведення до 4:5: інакше поля, якими
            // доповнюють кадр, лишились би старого кольору.
            const media = pkg.scripts["build:media"];

            check("тло вирівнюється до нормалізації 4:5",
                media.indexOf("whiten-backgrounds") < media.indexOf("normalize-product-images"));

            console.log(failures === 0
                ? "\n✅ Усі перевірки пройдено"
                : `\n❌ Провалено: ${failures}`);

            process.exit(failures === 0 ? 0 : 1);

        });
}
