// Банер акції: орієнтація фото мусить збігатися зі слотом.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// На сторінці акції «Колекція Marc Jacobs» банер показував вузьку
// горизонтальну смужку замість фото. У полі «Фото на сторінці акції»
// лежав ВЕРТИКАЛЬНИЙ знімок 1080×1400 (той, що призначався телефону),
// а слот на десктопі — смуга 1326×420, тобто 3.2:1.
//
// background-size:cover масштабує фото, доки воно не накриє слот: щоб
// накрити 1326 px ширини, портрет 1080×1400 розтягується до висоти
// ≈1719 px, з яких видно 420. Тобто на екрані лишається смужка з
// середини кадру — «картинка не влазить».
//
// ЧОМУ ПЕРЕВІРЯЄМО ОРІЄНТАЦІЮ, А НЕ РОЗМІР
// -----------------------------------------
// Точний розмір вимагати не варто: у слот 3.2:1 цілком нормально
// покласти 1800×900 (2:1) — кадр обріжеться з боків, але виглядає
// пристойно, і в акціях так і зроблено. А от ПОРТРЕТ у широкій смузі
// зламаний завжди, незалежно від розмірів, і навпаки — широке фото у
// вертикальному слоті теж.
//
// Це саме та помилка, яку легко зробити й неможливо помітити з
// адмінки: у медіатеці лежать усі чотири файли акції, назви схожі, а
// підказка з потрібним розміром стосується кожного поля окремо.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

// Слоти, у яких орієнтація однозначна.
//
// Прев'ю на головній (image/imageMobile) тут немає навмисно: його
// пропорція залежить від «Способу показу» — від 4:5 у компактного
// банера до 2:1 у великого, — і жодного правила «завжди широке» чи
// «завжди вертикальне» для нього не існує.
const SLOTS = {
    promoPageImage: {
        label: "Фото на сторінці акції",
        ratio: 1920 / 600,          // широка смуга
        want: "горизонтальне"
    },
    promoPageImageMobile: {
        label: "Фото на сторінці акції для мобільної версії",
        ratio: 1080 / 1400,         // портрет
        want: "вертикальне"
    }
};

// Розмір беремо через sharp — і В ЦЬОМУ Ж процесі, а не через
// `node -e`, як робить tests/test-search-banners.js: у шляху на
// Windows є зворотні слеші й двокрапка диска, і рядок, зібраний для
// оболонки, розсипався ще до запуску.
//
// Немає sharp — перевірка перетворюється на «файл не порожній», а не
// на падіння: тест не має вимагати нативного модуля.
async function imageSize(file) {

    try {

        const sharp = require("sharp");

        const meta = await sharp(file).metadata();

        return (meta.width && meta.height)
            ? { width: meta.width, height: meta.height }
            : null;

    } catch (error) {

        return null;

    }

}


console.log("\n[1] Файли банерів акцій існують");

const promos = fs.readdirSync(path.join(ROOT, "data/promotions"))
    .filter(f => f.endsWith(".json"))
    .map(f => ({ file: f, data: JSON.parse(read(`data/promotions/${f}`)) }));

check(`акції знайдено (${promos.length})`, promos.length > 0);

const перевірити = [];

promos.forEach(({ file, data }) => {

    Object.keys(SLOTS).forEach(field => {

        const src = data[field];

        if (!src) return;      // поле необовʼязкове, є відкат на інші фото

        const onDisk = path.join(ROOT, String(src).replace(/^\//, ""));

        check(`${data.title || file} → ${field}: файл є`, fs.existsSync(onDisk), src);

        if (fs.existsSync(onDisk)) перевірити.push({ file, data, field, onDisk, src });

    });

});

async function перевіритиОрієнтацію() {

    console.log("\n[2] Орієнтація фото збігається зі слотом");

    let зміряно = 0;

    for (const { data, field, onDisk, src } of перевірити) {

        const size = await imageSize(onDisk);

        if (!size) {

            check(`${field}: файл не порожній`, fs.statSync(onDisk).size > 1000, src);

            continue;

        }

        зміряно++;

        const slot = SLOTS[field];

        const ratio = size.width / size.height;

        const слотШирокий = slot.ratio > 1.5;

        // Портрет у широку смугу — та сама помилка, з якої все почалось.
        const портретУСмугу = слотШирокий && ratio < 1;

        // І навпаки: широке фото у вертикальний слот покаже смужку з
        // середини по висоті.
        const широкеУПортрет = !слотШирокий && ratio > 1.5;

        const name = `${data.title}: «${slot.label}» ${slot.want}`;

        check(`${name} (${size.width}×${size.height})`,
            !портретУСмугу && !широкеУПортрет,
            портретУСмугу
                ? `це портрет ${ratio.toFixed(2)}:1 у слоті ${slot.ratio.toFixed(2)}:1 — на сайті буде смужка з середини кадру`
                : `це ${ratio.toFixed(2)}:1 у слоті ${slot.ratio.toFixed(2)}:1`);

    }

    check(`розміри справді зміряно (${зміряно} з ${перевірити.length})`,
        зміряно > 0 || перевірити.length === 0,
        "sharp недоступний — перевірили лише наявність файлів");

}

function перевіритиПідказки() {

console.log("\n[3] Слот описаний у підказках адмінки");
{
    // Помилку робили саме через підказку: у полях чотири різні
    // потрібні розміри, і сплутати їх легко. Підказка мусить казати
    // розмір прямо.
    const { loadYaml } = require("./helpers/yaml");

    const fields = (loadYaml("admin/config.yml").collections
        .find(c => c.name === "promotions").fields || []);

    const desktop = fields.find(f => f.name === "promoPageImage");
    const mobile = fields.find(f => f.name === "promoPageImageMobile");

    check("у десктопного поля вказано 1920×600",
        /1920×600/.test(String(desktop && desktop.hint)));

    check("у мобільного вказано 1080×1400",
        /1080×1400/.test(String(mobile && mobile.hint)));

    // Обидва необовʼязкові: без них сторінка відкатується на прев'ю з
    // головної (див. assets/js/promo.js).
    check("поля лишаються необовʼязковими",
        desktop && desktop.required === false && mobile && mobile.required === false);

    check("сторінка акції має відкат, якщо поле порожнє",
        /promo\.promoPageImage \|\| promo\.image/.test(read("assets/js/promo.js")));
}

}

// Блок [2] асинхронний (sharp читає файли), тож і підсумок, і блок
// після нього — у ланцюжку: інакше тест звітував би про успіх до
// самих перевірок, а вивід ішов би не в порядку блоків.
перевіритиОрієнтацію().then(() => {

    перевіритиПідказки();

    console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);

    process.exit(failures === 0 ? 0 : 1);

});
