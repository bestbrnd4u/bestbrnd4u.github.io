const { execSync } = require("child_process");
const { loadYaml } = require("./helpers/yaml");

let failures = 0;
const check = (n, c, e) => { if (c) console.log("  ✓", n); else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; } };

console.log("\n[1] admin/config.yml — валідний YAML і коректна структура");

const cfg = loadYaml("admin/config.yml");
const products = cfg.collections.find(c => c.name === "products");
const variants = products.fields.find(f => f.name === "variants");
const sizes = variants.fields.find(f => f.name === "sizes");
const out = JSON.stringify({
    variant_fields: variants.fields.map(f => f.name),
    sizes_widget: sizes.widget,
    sizes_has_options: "options" in sizes,
    sizes_required: sizes.required !== undefined ? sizes.required : true,
    preorder_required: (() => {
        const p = products.fields.find(f => f.name === "preOrder");
        return p.required !== undefined ? p.required : true;
    })()
});

const info = JSON.parse(out);

// Перелік навмисно точний, а не «не менше ніж».
//
// Він стоїть тут через реальну поломку: зіпсований блок options
// розсипався в двадцять із гаком полів варіанта, і редактор кольору
// перетворювався на простирадло. Тому нове поле мусить бути додане
// сюди свідомо — інакше та сама поломка проїде непоміченою.
//
// colorFamily — «Колір для фільтра»: під якою позначкою шукати цей
// відтінок у каталозі, коли автоматика вгадує не те (Chalk, Ivory,
// Off-white — усе це один «Білий»).
//
// title…instagramReels — перевизначення для конкретного кольору. Діють,
// коли ввімкнено «Кожен колір — окрема картка в каталозі»: тоді колір
// стоїть у каталозі власною карткою, і в неї може бути своя назва,
// ціна, стара ціна, позначка, опис і Reels. Порожнє поле означає
// «взяти значення товару».
check("варіант кольору має рівно 13 полів (не 20+ від зіпсованого options)",
      info.variant_fields.length === 13, JSON.stringify(info.variant_fields));
check("порядок полів: спершу опис кольору, потім перевизначення",
      info.variant_fields.join(",") === "color,hex,colorFamily,sku,sizes,images,video,"
          + "title,description,price,oldPrice,badge,instagramReels",
      info.variant_fields.join(","));
// Регресія навпаки: раніше тут стежили за закритим переліком із 20
// розмірів. Тепер поле — власний віджет, який дозволяє і вибрати
// наявний розмір, і вписати новий (ONESIZE, 39.5 тощо).
check("розміри кольору — власний віджет, а не закритий select",
      info.sizes_widget === "sizeTags", info.sizes_widget);
check("закритого переліку більше немає", info.sizes_has_options === false);

check("розміри кольору не обов'язкові", info.sizes_required === false, info.sizes_required);
check("«Товар під замовлення» не обов'язковий (звідси й падала публікація)",
      info.preorder_required === false, info.preorder_required);

console.log("\n[2] Кожне поле дати зберігає ISO, а не те, що показує");
{
    // ЩО СТАЛОСЯ. Decap 3.15 вибирає формат ЗБЕРІГАННЯ так: якщо
    // format не заданий, а date_format і time_format задані — склеює
    // їх через «T». «DD.MM.YYYY» + «HH:mm» дало у файлі акції
    //
    //     "startsAt": "12.09.2026T17:10"
    //
    // new Date() на цьому повертає Invalid Date, а promoDate() у
    // scripts/promo-deals.js таке відкидає мовчки. Власник поставив
    // початок акції — збірка його викинула, акція стартувала одразу.
    // У products.json лишилось sale.from: "".
    //
    // Мовчазність тут навмисна (крива дата не має валити збірку), і
    // саме тому помилку не видно ніде, крім живого сайту. Тож ловимо
    // її там, де вона народжується — у налаштуваннях поля.
    const datetimes = [];

    const walk = (fields, path) => (fields || []).forEach(f => {
        const here = path + "/" + f.name;
        if (f.widget === "datetime") datetimes.push({ path: here, format: f.format });
        walk(f.fields, here);
        if (f.field) walk([f.field], here);
        (f.types || []).forEach(t => walk(t.fields, here + "/" + t.name));
    });

    cfg.collections.forEach(c => walk(c.fields, c.name));

    check(`полів дати — ${datetimes.length}`, datetimes.length > 0);

    datetimes.forEach(d => check(`${d.path}: формат зберігання ISO`,
        typeof d.format === "string" && /^YYYY-MM-DD/.test(d.format),
        d.format === undefined ? "format не заданий — Decap склеїть date_format і time_format" : d.format));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
