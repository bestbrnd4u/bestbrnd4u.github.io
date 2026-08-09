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
    sizes_options_len: (sizes.options || []).length,
    sizes_options_is_list: Array.isArray(sizes.options),
    sizes_required: sizes.required !== undefined ? sizes.required : true,
    preorder_required: (() => {
        const p = products.fields.find(f => f.name === "preOrder");
        return p.required !== undefined ? p.required : true;
    })()
});

const info = JSON.parse(out);

check("варіант кольору має рівно 6 полів (не 20+ від зіпсованого options)",
      info.variant_fields.length === 6, JSON.stringify(info.variant_fields));
check("порядок полів: color, hex, sku, sizes, images, video",
      info.variant_fields.join(",") === "color,hex,sku,sizes,images,video", info.variant_fields.join(","));
check("options дійсно масив (а не рядок/об'єкт)", info.sizes_options_is_list === true);
check("у options рівно 20 розмірів", info.sizes_options_len === 20, info.sizes_options_len);
check("розміри кольору не обов'язкові", info.sizes_required === false, info.sizes_required);
check("«Товар під замовлення» не обов'язковий (звідси й падала публікація)",
      info.preorder_required === false, info.preorder_required);

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
