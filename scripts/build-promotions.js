// Збирає data/promotions/*.json (окремі файли акцій, якими керує
// адмінка Decap CMS) в один data/promotions.json, який реально
// вантажить сайт через fetch() — для розділу «Акції» на головній.
//
// У підсумковий файл потрапляють тільки акції з active !== false,
// відсортовані за полем order (менше число — вище), а далі за назвою.
//
// Запускається автоматично через GitHub Actions при будь-якій
// зміні в data/promotions/**.

const fs = require("fs");
const path = require("path");
// не даємо файлам зі зламаним ім'ям потрапити в зібраний JSON
// (див. коментар у scripts/slug-safety.js)
const { filterSafeEntryFiles } = require("./slug-safety");
// кирилиця в імені файлу → латиниця в адресі (див. коментар у файлі)
const { planLatinRenames } = require("./translit");

const ROOT = path.join(__dirname, "..");
const PROMOTIONS_DIR = path.join(ROOT, "data", "promotions");
const POPUPS_DIR = path.join(ROOT, "data", "promo-popups");
const OUTPUT_FILE = path.join(ROOT, "data", "promotions.json");

// Кирилиця в імені файлу акції → латиниця в адресі.
//
// Те саме, що з товарами (див. renameToLatinSlugs у build-products.js):
// ім'я файлу стає slug-ом, а slug — адресою /promo?id=<slug>. Поки в
// імені кирилиця, посилання на акцію виглядає як
// /promo?id=%D0%B1%D1%96%D0%BB%D1%8C%D1%88%D0%B5-… — 130 символів, які
// не вставиш ні в пост, ні в сторіс.
//
// ЧИМ ЦЕ СКЛАДНІШЕ ЗА ТОВАРИ
// ---------------------------
// На товар посилаються за id, а на акцію — САМЕ ЗА SLUG: спливні
// вікна тримають його в полі promoSlug. Перейменувати файл і не
// поправити їх означало б, що банер веде в нікуди — і помітили б це
// не одразу, бо вікно показується не на кожній сторінці.
//
// Тому перейменування й правка посилань — одна операція, а не дві.
//
// СТАРІ АДРЕСИ НЕ ВМИРАЮТЬ
// -------------------------
// Попереднє ім'я лишається в legacySlugs, і сторінка акції знаходить
// акцію й за ним (див. assets/js/promo.js), після чого підміняє адресу
// в рядку браузера на канонічну.
// Дата з адмінки — у придатний для браузера вигляд.
//
// Реалізація одна на дві збірки й лежить у scripts/promo-deals.js:
// ту саму дату читає збірка товарів, коли проставляє ціну дня. Дві
// копії однієї нормалізації розійшлись би на першому ж граничному
// випадку — а тут межа це буквально секунда початку сейлу.
const { promoDate } = require("./promo-deals");

// Дозволені розкладки накладки на банері. Той самий перелік стоїть в
// admin/config.yml і в CSS (.promo-hero-banner[data-layout]); тест
// tests/test-promo-banner-layout.js звіряє всі три.
// Де показувати бейдж і де стоять товари «Ціни дня». Ті самі переліки
// стоять в admin/config.yml; звіряє їх tests/test-promo-banner-layout.js.
const BADGE_PLACES = ["both", "home", "promo", "none"];

const DEAL_ALIGNS = ["left", "center", "right"];

const LAYOUTS = [
    "left-top", "left-middle", "left-bottom",
    "center-top", "center-middle", "center-bottom",
    "right-top", "right-middle", "right-bottom",
    // Окремий випадок: банер лишається самою картинкою. Заголовок і
    // опис при цьому НЕ порожніють — вони далі потрібні блоку на
    // головній і рядку у видачі Google.
    "hidden"
];

function renameToLatinSlugs(files, dirs) {

    const promotionsDir = (dirs && dirs.promotions) || PROMOTIONS_DIR;
    const popupsDir = (dirs && dirs.popups) || POPUPS_DIR;

    const plan = planLatinRenames(files.map(f => f.replace(/\.json$/, "")));

    if (!plan.size) return files;

    plan.forEach((wanted, current) => {

        const from = path.join(promotionsDir, `${current}.json`);
        const to = path.join(promotionsDir, `${wanted}.json`);

        const data = JSON.parse(fs.readFileSync(from, "utf8"));

        const legacy = Array.isArray(data.legacySlugs) ? data.legacySlugs : [];

        data.legacySlugs = [...new Set([...legacy, current])];

        fs.writeFileSync(to, JSON.stringify(data, null, 2) + "\n", "utf8");
        fs.rmSync(from, { force: true });

        console.log(`✎ ${current}.json → ${wanted}.json`);

    });

    retargetPopups(plan, popupsDir);

    console.log(`   адрес акцій перекладено на латиницю: ${plan.size}`);

    return files.map(file => {

        const current = file.replace(/\.json$/, "");

        return plan.has(current) ? `${plan.get(current)}.json` : file;

    });

}

// Спливні вікна посилаються на акцію за slug-ом — переставляємо їх
// разом із перейменуванням.
function retargetPopups(plan, dir) {

    const popupsDir = dir || POPUPS_DIR;

    if (!fs.existsSync(popupsDir)) return;

    fs.readdirSync(popupsDir)
        .filter(f => f.endsWith(".json"))
        .forEach(file => {

            const filePath = path.join(popupsDir, file);
            const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

            if (!plan.has(data.promoSlug)) return;

            const next = plan.get(data.promoSlug);

            console.log(`   ↻ ${file}: акція ${data.promoSlug} → ${next}`);

            data.promoSlug = next;

            fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");

        });

}

function main() {

    if (!fs.existsSync(PROMOTIONS_DIR)) {
        console.error(`Не знайдено папку ${PROMOTIONS_DIR}`);
        process.exit(1);
    }

    const files = filterSafeEntryFiles(
        fs.readdirSync(PROMOTIONS_DIR).filter(f => f.endsWith(".json")),
        "data/promotions"
    ).safe;

    if (files.length === 0) {
        console.error("У data/promotions немає жодного файлу акції");
        process.exit(1);
    }

    const promotions = [];

    renameToLatinSlugs(files).forEach(file => {

        const filePath = path.join(PROMOTIONS_DIR, file);
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const slug = file.replace(/\.json$/, "");

        // ЩО САМЕ РОБИТЬ АКЦІЮ ЗАПОВНЕНОЮ.
        //
        // Раніше тут вимагались заголовок, фото й посилання кнопки —
        // і це заважало рівно тому випадку, заради якого банери й
        // малюють: увесь напис уже на картинці, а сайт має лише
        // показати її, нічого не дописуючи зверху.
        //
        // Тепер вимога одна: акції має бути що показати. Порожній
        // запис (натиснули «створити» й пішли) далі пропускаємо —
        // інакше на головній зʼявився б банер нізвідки.
        const hasProducts = Array.isArray(data.products) && data.products.length > 0;

        if (!data.title && !data.text && !data.image && !hasProducts) {

            console.log(`⏭  ПРОПУЩЕНО (не заповнено): ${file}`);

            return;

        }

        // Банер без фото — окремий випадок: показувати нема чого, і
        // порожня темна смуга на всю ширину гірша за відсутність
        // блока. «Ціна дня» фото не використовує взагалі.
        if (!data.image && data.displayType !== "deal_of_day") {

            console.log(`⏭  ПРОПУЩЕНО (немає фото банера): ${file}`);

            return;

        }

        if (data.active === false) {

            console.log(`⏭  ПРОПУЩЕНО (вимкнено): ${file}`);

            return;

        }

        const validGenders = ["Жінкам", "Чоловікам", "Дітям", "Унісекс"];

        const genderButtons = Array.isArray(data.genderButtons)
            ? data.genderButtons
                .filter(btn => btn && validGenders.includes(btn.gender))
                .map(btn => ({
                    gender: btn.gender,
                    color: typeof btn.color === "string" && btn.color ? btn.color : "#111827"
                }))
            : [];

        promotions.push({
            slug,
            // Адреси, за якими акція жила раніше. Сторінка акції
            // знаходить її і за ними, тож посилання, які вже пішли в
            // пости, не перетворюються на «акцію не знайдено».
            ...(Array.isArray(data.legacySlugs) && data.legacySlugs.length
                ? { legacySlugs: data.legacySlugs }
                : {}),
            title: data.title,
            text: data.text || "",
            badge: data.badge || "",
            image: data.image,
            imageMobile: data.imageMobile || "",
            // Окреме фото для банера сторінки самої акції (promo.html) —
            // якщо не заповнене, сторінка сама відкотиться на image/
            // imageMobile (див. assets/js/promo.js), тож старі акції
            // без цього поля не ламаються.
            promoPageImage: data.promoPageImage || "",
            promoPageImageMobile: data.promoPageImageMobile || "",
            buttonText: data.buttonText || "Дивитись усі товари",
            link: data.link,
            brand: data.brand || "",
            discountPercent: typeof data.discountPercent === "number" ? data.discountPercent : null,
            // Ціна дня — щоб картка на головній могла показати саме її,
            // не заглядаючи в товари. Сама ціна доїжджає до товарів
            // окремо (scripts/promo-deals.js + build-products.js), бо
            // читати її треба в каталозі й кошику, а не лише тут.
            ...(Number(data.dealPrice) > 0 ? { dealPrice: Math.round(Number(data.dealPrice)) } : {}),
            // Розклад акції. Пишемо ЛИШЕ заповнене — щоб в акціях без
            // розкладу не з'явилось два порожніх рядки (та сама
            // причина, що в autoBrand нижче).
            //
            // Стан рахує браузер, а не збірка: збірка знає лише час
            // свого запуску, і сейл почався б не опівночі, а під час
            // наступної збірки. Пояснення — у promoTiming() в
            // assets/js/common.js.
            ...(promoDate(data.startsAt) ? { startsAt: promoDate(data.startsAt) } : {}),
            ...(promoDate(data.endsAt) ? { endsAt: promoDate(data.endsAt) } : {}),
            productIds: Array.isArray(data.products) ? data.products.map(Number) : [],
            // ПРАВИЛА набору, на відміну від productIds вище — знімка.
            //
            // autoBrand за замовчуванням увімкнене: саме так обидві
            // сторінки поводились до появи прапорця, і вже опубліковані
            // акції не мають нічого помітити. Пишемо ЛИШЕ коли вимкнено —
            // щоб у даних не з'явилось сто рядків "autoBrand": true.
            ...(data.autoBrand === false ? { autoBrand: false } : {}),
            ...(Array.isArray(data.autoSections) && data.autoSections.length
                ? { autoSections: data.autoSections.map(String) }
                : {}),
            // Розгортання товарів по кольорах (promotionCards у
            // common.js). Пишемо ЛИШЕ коли вимкнено — з тієї самої
            // причини, що й autoBrand вище: за замовчуванням
            // увімкнено, і сто рядків "splitByColor": true в даних
            // нічого не додають.
            ...(data.splitByColor === false ? { splitByColor: false } : {}),
            genderButtons,
            // Кадрування фото і оформлення тексту.
            //
            // Обидва поля вже читає головна: framing — у promoPicture()
            // через ImageFraming.frameStyleAttr(), style — у
            // blockStyleClass()/blockStyleAttr()/applyBlockStyle() на
            // картці, слайдері й великому банері. Але сюди вони не
            // потрапляли, і сайт читає САМЕ цей файл — тобто «Кадрування
            // фото» і весь розділ «Оформлення тексту і кнопки» в адмінці
            // зберігались і не робили нічого.
            //
            // Мовчки: адмінка не має способу сказати «я зберегла, але це
            // нікуди не поїде». Тому за переліком полів тепер стежить
            // tests/test-admin-fields-reach-site.js.
            ...(data.framing && typeof data.framing === "object"
                && Object.keys(data.framing).length
                ? { framing: data.framing }
                : {}),
            ...(data.style && typeof data.style === "object"
                && Object.keys(data.style).length
                ? { style: data.style }
                : {}),
            // Окремий напис для головної. Порожнє поле не пишемо:
            // інакше в кожній акції без нього зʼявилось би два
            // порожніх рядки, а сайт і так падає назад на title/text.
            ...(String(data.homeTitle || "").trim() ? { homeTitle: String(data.homeTitle).trim() } : {}),
            ...(String(data.homeText || "").trim() ? { homeText: String(data.homeText).trim() } : {}),
            // Де показувати бейдж. Порожнє поле — «і там, і там»,
            // тобто як поводились усі акції до появи вибору.
            ...(BADGE_PLACES.includes(data.badgePlaces) ? { badgePlaces: data.badgePlaces } : {}),
            // Де стоять товари в блоці «Ціна дня».
            ...(DEAL_ALIGNS.includes(data.dealAlign) ? { dealAlign: data.dealAlign } : {}),
            // Свої кольори для головної. Порожній обʼєкт не пишемо:
            // інакше в кожній акції зʼявився б рядок ні про що.
            ...(data.homeStyle && typeof data.homeStyle === "object"
                && Object.keys(data.homeStyle).length
                ? { homeStyle: data.homeStyle }
                : {}),
            // Розкладка накладки на банері. Порожнє — «як було»:
            // ліворуч посередині, саме так малювались усі акції до
            // появи цього поля.
            ...(LAYOUTS.includes(data.bannerLayout) ? { bannerLayout: data.bannerLayout } : {}),
            // Таймер прибирається ЯВНИМ true. Відсутнє поле означає
            // «показувати» — інакше всі вже опубліковані акції разом
            // втратили б відлік.
            ...(data.hideCountdown === true ? { hideCountdown: true } : {}),
            displayType: ["card", "hero_slider", "banner_products", "banner_compact", "deal_of_day"].includes(data.displayType)
                ? data.displayType
                : "card",
            order: typeof data.order === "number" ? data.order : 1
        });

    });

    promotions.sort((a, b) => {

        if (a.order !== b.order) return a.order - b.order;

        return a.title.localeCompare(b.title, "uk");

    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(promotions, null, 2) + "\n", "utf8");

    console.log(`Готово: ${promotions.length} акцій → ${path.relative(ROOT, OUTPUT_FILE)}`);

}

// Експортуємо для тестів: перейменування перевіряється на
// тимчасовій теці, а не на справжніх акціях.
module.exports = { renameToLatinSlugs };

if (require.main === module) main();
