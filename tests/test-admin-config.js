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

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
