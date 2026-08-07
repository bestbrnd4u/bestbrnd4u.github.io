// -------------------------
// Масовий імпорт товарів через Excel — повністю client-side,
// нічого нікуди не відправляється. Результат — ZIP з файлами
// товарів у форматі, який очікує scripts/build-products.js
// (id/slug там же присвоюються автоматично при наступній збірці).
// -------------------------

const GENDERS = ["Жінкам", "Чоловікам", "Унісекс", "Дітям"];
const BADGES = ["NEW", "SALE", "TOP", "HOT"];
const COLOR_SLOTS = 3;

const HEADERS = [
    "Назва товару",
    "Бренд",
    "Категорія",
    "Для кого",
    "Ціна",
    "Стара ціна",
    "Позначка (NEW/SALE/TOP/HOT)",
    "Новинка (так/ні)",
    "Розміри (через кому)",
    "Опис товару",
    "Матеріал",
    "Країна виробник",
    "Артикул",
    "Застібка",
    "Декор",
    "Габарити",
    "Опис ручки/ременя",
    "Відділення/кишені",
    "Склад матеріалу",
    "Пошукові теги (через кому)",
    "Під замовлення (так/ні)",
    "Термін виготовлення",
    "Передоплата %"
];

for (let i = 1; i <= COLOR_SLOTS; i++) {
    HEADERS.push(
        `Колір ${i} (назва)`,
        `Колір ${i} (HEX)`,
        `Колір ${i} (фото, посилання через кому)`,
        `Колір ${i} (відео, посилання)`
    );
}

let categoriesCache = null;

// -------------------------
// Фото, обрані користувачем на кроці 3 — зіставляємо з назвами
// файлів, які вказані в комірках "фото" таблиці
// -------------------------

let selectedPhotos = new Map(); // ключ: назва файлу як є (trim), значення: File
let selectedPhotosLower = new Map(); // той самий набір, ключі в нижньому регістрі — для м'якшого пошуку

function registerSelectedPhotos(fileList) {

    selectedPhotos = new Map();
    selectedPhotosLower = new Map();

    Array.from(fileList).forEach(file => {

        const name = file.name.trim();

        selectedPhotos.set(name, file);
        selectedPhotosLower.set(name.toLowerCase(), file);

    });

}

function findPhotoFile(reference) {

    const name = reference.trim();

    return selectedPhotos.get(name) || selectedPhotosLower.get(name.toLowerCase()) || null;

}

function sanitizeFilename(name) {

    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";

    const safeBase = base
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

    return (safeBase || "photo") + ext;

}

// назва файлу в архіві (може відрізнятись від оригінальної, якщо
// оригінал містив кирилицю/пробіли/тощо) — та сама мапа гарантує,
// що той самий файл, згаданий у кількох товарах, потрапить в архів
// лише один раз і під однією назвою
const filesToZip = new Map(); // ключ: оригінальна назва файлу, значення: { file, safeName }
const usedSafeNames = new Set();

function registerFileForZip(file) {

    if (filesToZip.has(file.name)) {

        return filesToZip.get(file.name).safeName;

    }

    let safeName = sanitizeFilename(file.name);

    if (usedSafeNames.has(safeName)) {

        const dot = safeName.lastIndexOf(".");
        const base = dot > 0 ? safeName.slice(0, dot) : safeName;
        const ext = dot > 0 ? safeName.slice(dot) : "";
        let counter = 2;

        while (usedSafeNames.has(`${base}-${counter}${ext}`)) counter++;

        safeName = `${base}-${counter}${ext}`;

    }

    usedSafeNames.add(safeName);
    filesToZip.set(file.name, { file, safeName });

    return safeName;

}

async function loadCategories() {

    if (categoriesCache) return categoriesCache;

    try {

        const response = await fetch("../data/categories.json");

        categoriesCache = response.ok ? await response.json() : [];

    } catch (error) {

        categoriesCache = [];

    }

    return categoriesCache;

}

// -------------------------
// Крок 1 — шаблон
// -------------------------

function buildExampleRow(values) {

    const row = {};

    HEADERS.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index] : "";
    });

    return row;

}

async function downloadTemplate() {

    const categories = await loadCategories();

    const example1 = buildExampleRow([
        "Metropolis Mini", "Furla", "Жіночі сумки", "Жінкам", 10999, 11999,
        "TOP", "ні", "XS, S",
        "Компактна сумка з італійської шкіри з металевим декором-пряжкою.",
        "Натуральна шкіра", "Італія", "FR-MP-4004", "магніт із пряжкою", "металева пряжка",
        "20x16x8 см", "Один незнімний ремінь довжиною 110 см", "одне основне відділення", "100% шкіра",
        "клатч, міні сумка, вечірня сумка", "ні", "", "",
        "Бежевий", "#d9c7a1", "https://example.com/foto1.jpg, https://example.com/foto2.jpg", "",
        "Чорний", "#1a1a1a", "https://example.com/foto3.jpg, https://example.com/foto4.jpg", "",
        "", "", "", ""
    ]);

    const example2 = buildExampleRow([
        "Urban Backpack", "Tommy Hilfiger", "Рюкзаки", "Унісекс", 4599, "",
        "", "так", "",
        "Місткий рюкзак для щоденного використання з відділенням для ноутбука.",
        "Поліестер", "В'єтнам", "TH-UB-1102", "блискавка", "логотип",
        "30x20x12 см", "", "одне відділення для ноутбука, дві бічні кишені", "100% поліестер",
        "рюкзак, для ноутбука", "так", "10–14 робочих днів", "50",
        "Чорний", "#111111", "https://example.com/backpack-1.jpg", "",
        "", "", "", "",
        "", "", "", ""
    ]);

    const ws = XLSX.utils.json_to_sheet([example1, example2], { header: HEADERS });

    ws["!cols"] = HEADERS.map(h => ({ wch: Math.max(18, Math.min(38, h.length + 4)) }));

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Товари");

    const genderRows = [["Для кого — допустимі значення"]].concat(GENDERS.map(g => [g]));
    const wsGender = XLSX.utils.aoa_to_sheet(genderRows);
    wsGender["!cols"] = [{ wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsGender, "Довідник - Для кого");

    const categoryRows = [["Розділ", "Категорія (точна назва)"]]
        .concat(categories.map(c => [c.department || "", c.name || ""]));
    const wsCategories = XLSX.utils.aoa_to_sheet(categoryRows);
    wsCategories["!cols"] = [{ wch: 20 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsCategories, "Довідник категорій");

    XLSX.writeFile(wb, "bagvero-shablon-tovariv.xlsx");

}

// -------------------------
// Крок 2 — розбір і перевірка завантаженого файлу
// -------------------------

function readNumber(value) {

    if (value === "" || value === null || value === undefined) return undefined;

    const n = Number(String(value).replace(",", "."));

    return Number.isNaN(n) ? undefined : n;

}

function readBool(value) {

    const s = String(value || "").trim().toLowerCase();

    return s === "так" || s === "yes" || s === "true" || s === "1";

}

function splitList(value) {

    return String(value || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

}

function escapeHtml(str) {

    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

function rowToProduct(row, rowNumber, validCategoryNames) {

    const errors = [];
    const warnings = [];

    const title = String(row["Назва товару"] || "").trim();
    const brand = String(row["Бренд"] || "").trim();
    const category = String(row["Категорія"] || "").trim();
    const gender = String(row["Для кого"] || "").trim();
    const price = readNumber(row["Ціна"]);
    const description = String(row["Опис товару"] || "").trim();

    if (!title) errors.push("не вказана назва товару");
    if (!brand) errors.push("не вказаний бренд");
    if (!category) errors.push("не вказана категорія");

    if (!gender) {
        errors.push("не вказано поле «Для кого»");
    } else if (!GENDERS.includes(gender)) {
        errors.push(`поле «Для кого» має бути точно одним з: ${GENDERS.join(", ")} (зараз: «${gender}»)`);
    }

    if (price === undefined) errors.push("не вказана або нечислова ціна");
    if (!description) errors.push("не вказаний опис товару");

    if (category && validCategoryNames && validCategoryNames.length && !validCategoryNames.includes(category)) {
        warnings.push(`категорію «${category}» не знайдено в довіднику — перевірте точний напис на листі «Довідник категорій» (регістр і пробіли важливі)`);
    }

    const variants = [];

    for (let i = 1; i <= COLOR_SLOTS; i++) {

        const color = String(row[`Колір ${i} (назва)`] || "").trim();
        const hex = String(row[`Колір ${i} (HEX)`] || "").trim();
        const photoRefs = splitList(row[`Колір ${i} (фото, посилання через кому)`]);
        const video = String(row[`Колір ${i} (відео, посилання)`] || "").trim();

        // порожній слот кольору — просто пропускаємо, це нормально
        if (!color && !hex && photoRefs.length === 0) continue;

        if (!color) errors.push(`Колір ${i}: не вказана назва кольору`);
        if (!hex) errors.push(`Колір ${i}: не вказаний HEX-код кольору`);
        if (photoRefs.length === 0) errors.push(`Колір ${i}: не вказано жодного фото (посилання або назви файлу)`);

        const images = [];

        photoRefs.forEach(ref => {

            if (/^https?:\/\//i.test(ref)) {

                images.push(ref);
                return;

            }

            const file = findPhotoFile(ref);

            if (!file) {

                errors.push(`Колір ${i}: файл «${ref}» не знайдено серед завантажених фото (крок 3) — або вкажіть посилання https://…, або завантажте файл із такою назвою`);
                return;

            }

            const safeName = registerFileForZip(file);

            images.push(`assets/images/products/uploads/${safeName}`);

        });

        if (color && hex && photoRefs.length > 0 && images.length === photoRefs.length) {

            const variant = { color, hex, images };

            if (video) variant.video = video;

            variants.push(variant);

        }

    }

    if (variants.length === 0) {
        errors.push("не заповнено жодного кольору (мінімум потрібен «Колір 1»: назва, HEX і хоча б одне фото)");
    }

    if (errors.length > 0) {

        return { ok: false, row: rowNumber, title: title || "(без назви)", errors, warnings };

    }

    const product = { title, brand, category, gender, price, description, variants };

    const oldPrice = readNumber(row["Стара ціна"]);
    if (oldPrice !== undefined) product.oldPrice = oldPrice;

    const badge = String(row["Позначка (NEW/SALE/TOP/HOT)"] || "").trim().toUpperCase();
    if (BADGES.includes(badge)) product.badge = badge;

    product.isNew = readBool(row["Новинка (так/ні)"]);

    const sizes = splitList(row["Розміри (через кому)"]);
    if (sizes.length) product.sizes = sizes;

    const textFields = {
        "Матеріал": "material",
        "Країна виробник": "country",
        "Артикул": "sku",
        "Застібка": "closure",
        "Декор": "decor",
        "Габарити": "dimensions",
        "Опис ручки/ременя": "strapInfo",
        "Відділення/кишені": "compartments",
        "Склад матеріалу": "composition"
    };

    Object.keys(textFields).forEach(header => {

        const value = String(row[header] || "").trim();

        if (value) product[textFields[header]] = value;

    });

    const searchKeywords = splitList(row["Пошукові теги (через кому)"]);
    if (searchKeywords.length) product.searchKeywords = searchKeywords;

    if (readBool(row["Під замовлення (так/ні)"])) {

        product.preOrder = true;

        const preOrderDays = String(row["Термін виготовлення"] || "").trim();
        if (preOrderDays) product.preOrderDays = preOrderDays;

        const preOrderPrepayment = readNumber(row["Передоплата %"]);
        if (preOrderPrepayment !== undefined) product.preOrderPrepayment = preOrderPrepayment;

    }

    return { ok: true, row: rowNumber, title, product, warnings };

}

// -------------------------
// Перевірка на дублі (крок 4–5)
//
// Товар вважається дублем, якщо збігається:
//   - артикул (SKU) — найнадійніша ознака, або
//   - пара «бренд + назва» — коли артикул не заповнений.
//
// Перевіряємо у двох напрямках:
//   1) проти товарів, які ВЖЕ є на сайті (data/products.json);
//   2) всередині самого файлу — той самий товар двічі в одній
//      таблиці теж не має залитись двома копіями.
// -------------------------

let existingProductsCache = null;

async function loadExistingProducts() {

    if (existingProductsCache) return existingProductsCache;

    try {

        // ?t= — щоб не отримати застарілий список з кешу браузера
        // одразу після попередньої публікації
        const response = await fetch(`../data/products.json?t=${Date.now()}`);

        existingProductsCache = response.ok ? await response.json() : [];

    } catch (error) {

        // немає мережі / файлу — не блокуємо імпорт, просто не
        // зможемо попередити про дублі
        existingProductsCache = [];

    }

    return existingProductsCache;

}

// зводимо рядок до порівнюваного вигляду: регістр, апострофи,
// подвійні пробіли й розділові знаки не повинні заважати
// побачити, що "Furla  Metropolis" і "furla metropolis" — одне й те саме
function normalizeKey(value) {

    return String(value ?? "")
        .toLowerCase()
        .replace(/[\u2019'`"]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();

}

function skuKey(product) {

    return product.sku ? normalizeKey(product.sku) : "";

}

function nameKey(product) {

    return `${normalizeKey(product.brand)}|${normalizeKey(product.title)}`;

}

async function detectDuplicates(okResults) {

    const existing = await loadExistingProducts();

    const catalogBySku = new Map();
    const catalogByName = new Map();

    existing.forEach(product => {

        const sk = skuKey(product);
        const nk = nameKey(product);

        if (sk && !catalogBySku.has(sk)) catalogBySku.set(sk, product);
        if (nk !== "|" && !catalogByName.has(nk)) catalogByName.set(nk, product);

    });

    const batchBySku = new Map();
    const batchByName = new Map();

    okResults.forEach(result => {

        const product = result.product;

        const sk = skuKey(product);
        const nk = nameKey(product);

        result.duplicate = null;

        if (sk && batchBySku.has(sk)) {

            result.duplicate = { scope: "file", by: "артикулом", ref: `рядок ${batchBySku.get(sk)}` };

        } else if (batchByName.has(nk)) {

            result.duplicate = { scope: "file", by: "брендом і назвою", ref: `рядок ${batchByName.get(nk)}` };

        } else if (sk && catalogBySku.has(sk)) {

            result.duplicate = { scope: "catalog", by: "артикулом", ref: catalogBySku.get(sk).title };

        } else if (nk !== "|" && catalogByName.has(nk)) {

            result.duplicate = { scope: "catalog", by: "брендом і назвою", ref: catalogByName.get(nk).title };

        }

        if (sk && !batchBySku.has(sk)) batchBySku.set(sk, result.row);
        if (!batchByName.has(nk)) batchByName.set(nk, result.row);

    });

}

// товари, які реально підуть у публікацію/архів: дублі
// пропускаємо, якщо користувач явно не поставив галочку
function productsToPublish() {

    const includeDuplicates = document.getElementById("includeDuplicates")?.checked;

    return importedProducts.filter(result => includeDuplicates || !result.duplicate);

}

function renderDuplicateBox() {

    const box = document.getElementById("duplicateBox");

    if (!box) return;

    const duplicates = importedProducts.filter(result => result.duplicate);

    if (duplicates.length === 0) {

        box.hidden = true;
        box.innerHTML = "";

        return;

    }

    box.hidden = false;

    box.innerHTML = `
        <div class="dup-title">⚠ Знайдено дублі: ${duplicates.length}</div>
        <ul class="dup-list">
            ${duplicates.map(result => `
                <li>
                    Рядок ${result.row} (${escapeHtml(result.title)}) —
                    збігається ${escapeHtml(result.duplicate.by)}
                    ${result.duplicate.scope === "catalog"
                        ? `з товаром на сайті «${escapeHtml(result.duplicate.ref)}»`
                        : `з ${escapeHtml(result.duplicate.ref)} цього ж файлу`}
                </li>
            `).join("")}
        </ul>
        <label class="dup-check">
            <input type="checkbox" id="includeDuplicates">
            Все одно завантажити дублі (створяться окремі товари)
        </label>
    `;

    box.querySelector("#includeDuplicates").addEventListener("change", refreshPublishButton);

}

function refreshPublishButton() {

    const publishBtnEl = document.getElementById("publishBtn");

    if (!publishBtnEl) return;

    const count = productsToPublish().length;
    const skipped = importedProducts.length - count;

    publishBtnEl.disabled = count === 0;
    publishBtnEl.textContent = count === 0
        ? "Немає що публікувати"
        : `🚀 Опублікувати на сайт (${count})${skipped ? ` · пропустити дублів: ${skipped}` : ""}`;

}

function renderReport(okResults, badResults) {

    const el = document.getElementById("report");

    let html = "";

    if (okResults.length > 0) {

        const duplicates = okResults.filter(r => r.duplicate);
        const fresh = okResults.length - duplicates.length;

        html += `<div class="ok-line">✅ ${fresh} товар(ів) готово до завантаження</div>`;

        if (duplicates.length > 0) {

            html += `<div class="warn-line">⚠ ${duplicates.length} з них — дублі, за замовчуванням вони НЕ будуть завантажені (деталі на кроці 5):</div><ul class="warn-list">`;

            duplicates.forEach(r => {

                html += `<li>Рядок ${r.row} (${escapeHtml(r.title)}) — збігається ${escapeHtml(r.duplicate.by)} ${
                    r.duplicate.scope === "catalog"
                        ? `з товаром на сайті «${escapeHtml(r.duplicate.ref)}»`
                        : `з ${escapeHtml(r.duplicate.ref)} цього ж файлу`
                }</li>`;

            });

            html += "</ul>";

        }

        const withWarnings = okResults.filter(r => r.warnings.length > 0);

        if (withWarnings.length > 0) {

            html += `<div class="warn-line">⚠ Звернути увагу (не блокує імпорт):</div><ul class="warn-list">`;

            withWarnings.forEach(r => {

                r.warnings.forEach(w => {
                    html += `<li>Рядок ${r.row} (${escapeHtml(r.title)}): ${escapeHtml(w)}</li>`;
                });

            });

            html += "</ul>";

        }

    }

    if (badResults.length > 0) {

        html += `<div class="err-line">✕ ${badResults.length} рядк(ів) з помилками — виправте їх у файлі й завантажте ще раз:</div><ul class="err-list">`;

        badResults.forEach(r => {

            html += `<li>Рядок ${r.row} (${escapeHtml(r.title)}): ${r.errors.map(escapeHtml).join("; ")}</li>`;

        });

        html += "</ul>";

    }

    if (okResults.length === 0 && badResults.length === 0) {

        html = "<p>У файлі не знайдено жодного заповненого рядка товару.</p>";

    }

    el.innerHTML = html;

}

let importedProducts = [];

async function processFile(file) {

    filesToZip.clear();
    usedSafeNames.clear();

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    const sheetName = workbook.SheetNames.find(name => name.toLowerCase().includes("товар")) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const categories = await loadCategories();
    const validCategoryNames = categories.map(c => c.name);

    const results = rows
        .map((row, index) => ({ row, rowNumber: index + 2 }))
        .filter(({ row }) => Object.values(row).some(v => String(v).trim() !== ""))
        .map(({ row, rowNumber }) => rowToProduct(row, rowNumber, validCategoryNames));

    const okResults = results.filter(r => r.ok);
    const badResults = results.filter(r => !r.ok);

    // позначаємо дублі ДО звіту, щоб одразу показати їх користувачу
    await detectDuplicates(okResults);

    renderReport(okResults, badResults);

    importedProducts = okResults;

    document.getElementById("downloadCard").hidden = okResults.length === 0;

    renderDuplicateBox();
    refreshPublishButton();

    const publishStatusEl = document.getElementById("publishStatus");

    if (publishStatusEl) {

        publishStatusEl.hidden = true;
        publishStatusEl.innerHTML = "";

    }

}

async function downloadZip() {

    const zip = new JSZip();
    const productsFolder = zip.folder("data").folder("products");
    const stamp = Date.now();

    // запасний ZIP підкоряється тому самому вибору щодо дублів,
    // що й публікація одним кліком
    const publishing = productsToPublish();

    publishing.forEach((result, index) => {

        const filename = `import-${stamp}-${index + 1}.json`;

        productsFolder.file(filename, JSON.stringify(result.product, null, 2) + "\n");

    });

    const usedImages = new Set();

    publishing.forEach(result => {

        (result.product.variants || []).forEach(variant => {

            (variant.images || []).forEach(src => usedImages.add(src));

        });

    });

    if (filesToZip.size > 0) {

        const uploadsFolder = zip.folder("assets").folder("images").folder("products").folder("uploads");

        filesToZip.forEach(({ file, safeName }) => {

            if (!usedImages.has(`assets/images/products/uploads/${safeName}`)) return;

            uploadsFolder.file(safeName, file);

        });

    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "bagvero-import-tovariv.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

}

// -------------------------
// Пряма публікація на сайт (без GitHub Desktop)
//
// Той самий набір файлів, що йшов у ZIP, але замість завантаження
// архіву комітимо його прямо в репозиторій через GitHub API —
// вхід переиспользуємо той самий, що і в адмінці (OAuth Netlify).
// -------------------------

function collectFilesForPublish() {

    const files = [];
    const stamp = Date.now();

    const publishing = productsToPublish();

    publishing.forEach((result, index) => {

        files.push({
            path: `data/products/import-${stamp}-${index + 1}.json`,
            text: JSON.stringify(result.product, null, 2) + "\n"
        });

    });

    // фото вантажимо лише ті, на які реально посилаються товари,
    // що публікуються — інакше пропущені дублі тягли б за собою
    // купу непотрібних файлів у репозиторій
    const usedImages = new Set();

    publishing.forEach(result => {

        (result.product.variants || []).forEach(variant => {

            (variant.images || []).forEach(src => usedImages.add(src));

        });

    });

    filesToZip.forEach(({ file, safeName }) => {

        if (!usedImages.has(`assets/images/products/uploads/${safeName}`)) return;

        files.push({
            path: `assets/images/products/uploads/${safeName}`,
            file
        });

    });

    return files;

}

const publishBtn = document.getElementById("publishBtn");
const publishStatus = document.getElementById("publishStatus");

function setPublishStatus(html, kind) {

    if (!publishStatus) return;

    publishStatus.hidden = !html;
    publishStatus.className = "publish-status" + (kind ? " publish-status-" + kind : "");
    publishStatus.innerHTML = html || "";

}

async function publishToGitHub() {

    const publishing = productsToPublish();

    if (publishing.length === 0) return;

    const files = collectFilesForPublish();

    publishBtn.disabled = true;
    publishBtn.textContent = "Публікую…";

    setPublishStatus("Підключаюсь до GitHub…", "progress");

    try {

        // якщо в адмінці ще не логінились — відкриється те саме
        // вікно входу через GitHub, що й у самій адмінці
        if (!GitHubPublisher.hasStoredToken()) {

            setPublishStatus("Відкрилось вікно входу через GitHub — підтвердіть доступ у ньому.", "progress");

        }

        const productWord = publishing.length === 1 ? "товар" : "товарів";

        const skipped = importedProducts.length - publishing.length;

        const result = await GitHubPublisher.publishFiles(
            files,
            `Імпорт товарів з адмінки (${publishing.length} ${productWord})`,
            text => setPublishStatus(text, "progress")
        );

        // Щойно опубліковані товари одразу враховуємо як існуючі:
        // data/products.json перезбереться лише через 1–2 хвилини,
        // тож без цього повторний імпорт того самого файлу в цій же
        // вкладці не побачив би їх і створив дублі
        publishing.forEach(result => existingProductsCache?.push(result.product));

        setPublishStatus(
            `✅ Опубліковано ${publishing.length} ${productWord}` +
            (skipped ? `, пропущено дублів: ${skipped}` : "") + `. ` +
            `Через 1–2 хвилини товари з'являться на сайті та в адмінці — ` +
            `каталог перезбирається автоматично.<br>` +
            `<a href="${result.actionsUrl}" target="_blank" rel="noopener">Стежити за збіркою</a> · ` +
            `<a href="${result.commitUrl}" target="_blank" rel="noopener">Переглянути коміт</a>`,
            "ok"
        );

        publishBtn.textContent = "✅ Опубліковано";

        return;

    } catch (error) {

        console.error(error);

        setPublishStatus(
            `✕ Не вдалося опублікувати: ${escapeHtml(error.message || String(error))}. ` +
            `Можна спробувати ще раз або скористатись запасним варіантом — завантажити ZIP нижче.`,
            "err"
        );

        publishBtn.disabled = false;
        publishBtn.textContent = "🚀 Опублікувати на сайт";

    }

}

publishBtn?.addEventListener("click", () => {

    // синхронно, ДО будь-якого await — інакше браузер вважає жест
    // користувача витраченим і заблокує вікно входу
    GitHubPublisher.preopenAuthWindow();

    publishToGitHub();

});

// -------------------------
// Прив'язка до кнопок
// -------------------------

document.getElementById("downloadTemplateBtn").addEventListener("click", () => {

    downloadTemplate();

});

const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const photosInput = document.getElementById("photosInput");
const photosSummary = document.getElementById("photosSummary");

photosInput.addEventListener("change", () => {

    registerSelectedPhotos(photosInput.files);

    if (selectedPhotos.size > 0) {

        photosSummary.hidden = false;
        photosSummary.textContent = `Обрано файлів: ${selectedPhotos.size}. У таблиці вказуйте їх точні назви (з розширенням), наприклад: ${Array.from(selectedPhotos.keys()).slice(0, 2).join(", ")}${selectedPhotos.size > 2 ? "…" : ""}`;

    } else {

        photosSummary.hidden = true;

    }

});

fileInput.addEventListener("change", () => {

    processBtn.disabled = fileInput.files.length === 0;

    document.getElementById("report").innerHTML = "";
    document.getElementById("downloadCard").hidden = true;

});

processBtn.addEventListener("click", () => {

    const file = fileInput.files[0];

    if (!file) return;

    processBtn.disabled = true;
    processBtn.textContent = "Обробляю…";

    processFile(file).finally(() => {

        processBtn.disabled = false;
        processBtn.textContent = "Перевірити та обробити файл";

    });

});

document.getElementById("downloadZipBtn").addEventListener("click", () => {

    downloadZip();

});
