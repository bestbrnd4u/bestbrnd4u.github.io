// Вирізання товару нейромережею.
//
// НАВІЩО ЦЕ ПОРУЧ ІЗ ЗАЛИВКОЮ, А НЕ ЗАМІСТЬ НЕЇ
// ----------------------------------------------
// Заливка (scripts/whiten-backgrounds.js) вміє лише однотонний фон,
// зате точно до пікселя: іде від країв і зупиняється на товарі, тінь
// лишає, ланцюжок і тонкий ремінець не чіпає.
//
// Мережа працює на будь-якому фоні, але тінь вважає фоном і з'їдає, а
// тонкі деталі тримає гірше. Тому вона не автоматична: її вмикають
// кнопкою на конкретне фото.
//
// Набір ганяє САМУ МОДЕЛЬ на справжньому фото каталогу: перевірка
// «функція існує» тут нічого не варта — важливо, що маска не порожня і
// не покриває весь кадр.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const cutout = require("../scripts/cutout");

const UPLOADS = path.join(ROOT, "assets/images/products/uploads");


async function main() {

    console.log("\n[1] Модель на місці й самодостатня");
    {
        check("файл моделі в репозиторії", fs.existsSync(cutout.MODEL));

        const size = fs.existsSync(cutout.MODEL) ? fs.statSync(cutout.MODEL).size : 0;

        // u2netp — полегшена версія U²-Net. Повна важить 176 МБ, і в
        // репозиторії їй не місце; полегшена дає ту саму якість на
        // предметних фото.
        check(`розмір розумний (${(size / 1024 / 1024).toFixed(1)} МБ)`,
            size > 1e6 && size < 20e6);

        // Качати модель під час збірки означало б залежати від чужого
        // сервера в момент, коли магазин публікує товар.
        const script = fs.readFileSync(path.join(ROOT, "scripts/cutout.js"), "utf8");

        check("модель не качається під час збірки",
            !/https?:\/\//.test(script.replace(/\/\/[^\n]*/g, "")));

        // onnxruntime важкий (близько 300 МБ). Підключати його на
        // кожній збірці, де вирізати нічого, — марно.
        check("onnxruntime підключається лише за потреби",
            /require\("onnxruntime-node"\)/.test(script)
            && /function getSession/.test(script));

        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

        check("залежність оголошена", !!pkg.devDependencies["onnxruntime-node"]);
    }

    console.log("\n[2] Маска на справжньому фото");
    {
        const file = fs.readdirSync(UPLOADS)
            .filter(f => /^ca173_svvfq_a0\.webp$/.test(f))[0]
            || fs.readdirSync(UPLOADS).filter(f => f.endsWith(".webp") && !/-\d+\.webp$/.test(f))[0];

        const full = path.join(UPLOADS, file);

        const t0 = Date.now();
        const cut = await cutout.cutoutToWhite(full);
        const ms = Date.now() - t0;

        check(`${file}: розмір збережено`, cut.width > 0 && cut.height > 0
            && cut.data.length === cut.width * cut.height * 3);

        // Порожня маска означала б стерте фото, повна — що нічого не
        // вирізалось. Обидва випадки треба ловити, а не публікувати.
        check(`товар займає розумну частку (${(cut.share * 100).toFixed(1)}%)`,
            cut.share > 0.02 && cut.share < 0.9, String(cut.share));

        check(`встигає за розумний час (${ms} мс)`, ms < 15000, String(ms));

        // Кути кадру мусять стати білими — інакше фон не прибрано.
        const px = (x, y) => {
            const i = (y * cut.width + x) * 3;
            return [cut.data[i], cut.data[i + 1], cut.data[i + 2]];
        };

        const corners = [px(2, 2), px(cut.width - 3, 2),
            px(2, cut.height - 3), px(cut.width - 3, cut.height - 3)];

        check("кути стали білими",
            corners.every(c => Math.min(c[0], c[1], c[2]) >= 250),
            JSON.stringify(corners));

        // А в центрі мусить лишитись товар, а не біле полотно.
        const middle = px(Math.round(cut.width / 2), Math.round(cut.height * 0.62));

        check("у центрі лишився товар, а не біле",
            Math.min(middle[0], middle[1], middle[2]) < 240, JSON.stringify(middle));
    }

    console.log("\n[3] Рішення з адмінки доходить до збірки");
    {
        const script = fs.readFileSync(path.join(ROOT, "scripts/whiten-backgrounds.js"), "utf8");
        const widget = fs.readFileSync(path.join(ROOT, "admin/image-framing-widget.js"), "utf8");
        const lib = fs.readFileSync(path.join(ROOT, "assets/js/image-framing.js"), "utf8");

        check("кадр товару зберігає рішення «cutout»", /"cutout"/.test(lib));

        check("в адмінці є кнопка", /Вирізати товар/.test(widget));

        check("збірка збирає це рішення", /bg === "cutout"/.test(script));

        check("вирізання ніколи не вмикається саме",
            /decided === "cutout"/.test(script));

        // Порожня маска — не привід записати біле полотно поверх фото.
        check("порожня маска не публікується",
            /cut\.share < 0\.01/.test(script));

        // Оригінал зберігається так само, як і при заливці: результат
        // необоротний для файлу.
        // Межі гілки — за структурою коду, а не «плюс 1600 символів».
        // Фіксована довжина ламається від будь-якого дописаного
        // коментаря: так і сталося, коли в гілці зʼявилось пояснення
        // про запис через тимчасовий файл.
        const branchStart = script.indexOf('decided === "cutout"');
        const branch = script.slice(branchStart, script.indexOf("Запобіжник 2", branchStart));

        check("оригінал кладеться в _originals", /copyFileSync\(full, backup\)/.test(branch));

        // Немає onnxruntime — фото лишається як є, збірка не падає:
        // один знімок не має валити публікацію всього каталогу.
        check("відсутність рантайму не валить збірку",
            /вирізання недоступне/.test(branch));
    }

    console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);

    process.exit(failures === 0 ? 0 : 1);

}

main().catch(error => {
    console.log("  ✗ набір упав:", error && error.message);
    process.exit(1);
});
