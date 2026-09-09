// Відгуки: перевірка й картка для модерації.
//
// НАВІЩО ПЕРЕВІРКА ПОКУПКИ
// -------------------------
// Форма відгуку без перевірки — запрошення для конкурентів і ботів.
// Тому відгук приймається лише разом із номером замовлення й
// телефоном, і сервер звіряє три речі:
//
//   1. замовлення з таким номером існує;
//   2. телефон збігається з тим, що в замовленні;
//   3. цей товар справді є в його складі.
//
// Третя перевірка не менш важлива за другу: без неї той, хто купив
// гаманець, міг би написати відгук про будь-яку сумку з каталогу.
//
// ЧОМУ НА СЕРВЕРІ
// ----------------
// У браузері будь-яка така перевірка нічого не варта: код сторінки
// відкритий, і запит можна надіслати без сторінки взагалі. Тому
// таблиця відгуків закрита від браузера повністю (RLS без політик), а
// пише в неї функція службовим ключем — після перевірки.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі й бази. Лише чисті функції — щоб перевірялись тестами в Node.

// Межі тексту. Не обмеження магазину, а стеля здорового глузду: відгук
// на дві тисячі знаків читає лише той, хто його написав.
export const REVIEW_LIMITS = {
    author: 80,
    body: 2000,
    orderNumber: 40,
};

// Скільки знаків тексту досить, щоб це був відгук, а не «ок».
//
// Не заборона, а фільтр очевидного сміття: «+», «норм», «1» не кажуть
// нічого ні наступному покупцеві, ні Google.
export const MIN_BODY = 10;

// Фото у відгуку.
//
// ТРИ — бо стільки поміщається в один рядок під відгуком і стільки
// людина реально знімає: коробка, річ, деталь. Четверте вже ніхто не
// роздивляється.
//
// ПІВТОРА МЕГАБАЙТА — стеля на файл ПІСЛЯ стиснення в браузері
// (сторінка зменшує знімок до 1400 px і пише JPEG, звідки виходить
// 150-400 КБ). Межа тут — не бажаний розмір, а захист від того, хто
// надішле запит повз сторінку.
//
// ТИПИ — рівно ті, що вміє віддавати <canvas> і приймає відро
// сховища. Формати без стиснення (bmp, tiff) і векторні (svg) тут
// зайві, а svg ще й може містити скрипт.
export const PHOTO_LIMITS = {
    count: 3,
    bytes: 1_500_000,
    types: ["image/jpeg", "image/png", "image/webp"],
};

// Розширення файлу за типом. Сховище віддає файл із тим Content-Type,
// який ми поставили, але правильне розширення потрібне Telegram і
// збереженню «як є».
export const PHOTO_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

// Розбір одного знімка з data-URL.
//
// Сторінка надсилає фото рядком «data:image/jpeg;base64,…» — так воно
// їде разом з рештою відгуку одним запитом, без окремого сховища
// напівзавантажених файлів.
//
// Повертає { type, base64, bytes } або null. null означає «не годиться»
// й не пояснює чому: пояснювати нема кому, це не інтерфейс, а межа.
export function parseReviewPhoto(value) {

    const match = String(value ?? "").match(/^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/);

    if (!match) return null;

    const type = match[1];
    const base64 = match[2];

    if (!PHOTO_LIMITS.types.includes(type)) return null;

    // Довжина base64 → довжина файлу. Рахуємо саме так, а не
    // декодуванням: декодувати мегабайтний рядок лише для того, щоб
    // дізнатись, що він завеликий, — марна робота.
    const padding = base64.endsWith("==") ? 2 : (base64.endsWith("=") ? 1 : 0);
    const bytes = Math.floor(base64.length / 4) * 3 - padding;

    if (bytes <= 0 || bytes > PHOTO_LIMITS.bytes) return null;

    return { type: type, base64: base64, bytes: bytes };

}

// Усі знімки відгуку. Зайві мовчки відрізаються, непридатні
// пропускаються — відгук через фото не пропадає.
export function cleanReviewPhotos(value) {

    if (!Array.isArray(value)) return [];

    return value
        .map(parseReviewPhoto)
        .filter(Boolean)
        .slice(0, PHOTO_LIMITS.count);

}

// Ім'я файлу у сховищі.
//
// Випадкове, а не за номером відгуку: відро публічне на читання, і
// передбачуване ім'я дало б змогу подивитись фото ще до модерації,
// просто підставивши наступний номер.
export function reviewPhotoName(type, random) {

    const extension = PHOTO_EXTENSIONS[type] || "jpg";

    const key = String(random ?? "").replace(/[^a-z0-9]/gi, "").slice(0, 32);

    return `${key || "photo"}.${extension}`;

}

// Адреса, за якою фото віддається сайту.
export function reviewPhotoUrl(supabaseUrl, name) {

    return `${String(supabaseUrl ?? "").replace(/\/+$/, "")}`
        + `/storage/v1/object/public/review-photos/${name}`;

}

// Ім'я файлу з адреси — щоб видалити його при відхиленні.
//
// Повертає null для будь-чого, що не веде у власне відро: команда на
// видалення не має права ходити за чужими шляхами.
export function reviewPhotoPath(url) {

    const match = String(url ?? "")
        .match(/\/storage\/v1\/object\/public\/review-photos\/([A-Za-z0-9._-]+)$/);

    return match ? match[1] : null;

}


// -------------------------
// Телефон
// -------------------------

// Ключ порівняння — останні 9 цифр.
//
// Те саме правило, що на сторінці «Де моє замовлення»
// (phoneKey в order-lookup.js), і з тієї самої причини: у базі лежить
// те, що людина набрала при оформленні, а тут вона набере те, що
// згадає.
//
// Назва інша навмисно: у зібраному файлі всі модули лежать поруч, і
// дві функції з однією назвою тихо перекрили б одна одну.
export function reviewPhoneKey(value) {

    const digits = String(value ?? "").replace(/\D/g, "");

    return digits.length >= 9 ? digits.slice(-9) : "";

}

export function reviewPhoneMatches(stored, typed) {

    const a = reviewPhoneKey(stored);
    const b = reviewPhoneKey(typed);

    return Boolean(a) && a === b;

}


// -------------------------
// Що прислала сторінка
// -------------------------

// Розбір і чистка. Повертає { ok: true, review } або { ok: false, reason }.
//
// reason іде в логи функції, а не покупцеві: йому досить «не вдалося
// зберегти відгук».
export function cleanReview(payload) {

    if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "порожній запит" };
    }

    const productId = Number(payload.product_id);

    if (!Number.isFinite(productId) || productId <= 0) {
        return { ok: false, reason: "немає товару" };
    }

    const orderNumber = String(payload.order_number ?? "").trim();

    // Те саме правило, що при оформленні (place-order.js) і при
    // перевірці замовлення: цифри й латиниця, 4-40 символів.
    if (!/^[0-9A-Za-z-]{4,40}$/.test(orderNumber)) {
        return { ok: false, reason: "номер не схожий на номер" };
    }

    const phone = String(payload.phone ?? "").trim();

    if (!reviewPhoneKey(phone)) {
        return { ok: false, reason: "телефон коротший за 9 цифр" };
    }

    const rating = Number(payload.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return { ok: false, reason: "оцінка поза межами 1-5" };
    }

    const author = String(payload.author ?? "").trim().slice(0, REVIEW_LIMITS.author);

    if (!author) {
        return { ok: false, reason: "немає імені" };
    }

    const body = String(payload.body ?? "").trim().slice(0, REVIEW_LIMITS.body);

    if (body.length < MIN_BODY) {
        return { ok: false, reason: "текст коротший за мінімум" };
    }

    // Фото не обов'язкові й не можуть завалити відгук: непридатний
    // знімок мовчки пропускається, а текст усе одно доїде.
    const photos = cleanReviewPhotos(payload.photos);

    return {
        ok: true,
        review: { productId, orderNumber, phone, rating, author, body, photos },
    };

}

// Чи є цей товар у складі замовлення.
//
// БЕЗ ЦІЄЇ ПЕРЕВІРКИ той, хто купив гаманець за 3 800, міг би написати
// відгук про сумку за 15 000 — номер і телефон у нього справжні.
//
// Порівнюємо за id. У складі замовлення він може лежати числом або
// рядком (знімок кладе браузер), тож зводимо обидва до числа.
export function orderHasProduct(order, productId) {

    const items = Array.isArray(order?.items) ? order.items : [];

    const want = Number(productId);

    return items.some(item => Number(item?.id) === want);

}


// -------------------------
// Картка для модерації
// -------------------------

// Зірки словом і значком: у Telegram «4/5» читається гірше за «★★★★☆».
export function stars(rating) {

    const value = Math.min(Math.max(Math.trunc(Number(rating) || 0), 0), 5);

    return "★".repeat(value) + "☆".repeat(5 - value);

}

// Назва навмисно не escapeHtml(): у зібраному файлі всі модулі лежать
// поруч, і така функція там уже є (format.js). Дві функції з однією
// назвою тихо перекрили б одна одну — саме це й ловить
// tests/test-no-function-collisions.js.
function escapeReview(text) {

    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

// Повідомлення власнику про новий відгук.
//
// Показуємо все, що потрібно для рішення: товар, оцінку, текст і те,
// за яким замовленням він написаний. Останнє важливе: якщо відгук
// виглядає дивно, номер дає змогу подивитись саму покупку.
export function reviewCard(review, productTitle) {

    const photos = Array.isArray(review.photos) ? review.photos.length : 0;

    const lines = [
        `💬 <b>Новий відгук</b> ${stars(review.rating)}`,
        "",
        productTitle ? `<b>${escapeReview(productTitle)}</b>` : `Товар #${review.productId}`,
        "",
        escapeReview(review.body),
        "",
        `👤 ${escapeReview(review.author)}`,
        `🧾 замовлення <code>${escapeReview(review.orderNumber)}</code>`,
    ];

    // Знімки приходять окремими повідомленнями слідом. Рядок тут
    // потрібен на випадок, коли вони не доїхали: інакше власник не
    // знав би, що фото взагалі були, і опублікував би відгук із
    // порожньою галереєю.
    if (photos) {
        lines.push(`📷 фото: ${photos}`);
    }

    return lines.join("\n");

}

// Кнопки під карткою.
//
// Дві дії й нічого більше: показати або відхилити. Відгук лежить
// невідмодерованим, поки власник не натиснув, — і це навмисно: відгук,
// який з'являється на сайті сам, рано чи пізно принесе або спам, або
// чужу лайку.
export function reviewKeyboard(id) {

    return {
        inline_keyboard: [[
            { text: "✅ Показати на сайті", callback_data: `rev:${id}:pub` },
            { text: "🚫 Відхилити", callback_data: `rev:${id}:rej` },
        ]],
    };

}

// Розбір натискання. Повертає { id, status } або null.
export function parseReviewAction(data) {

    const match = String(data ?? "").match(/^rev:(\d+):(pub|rej)$/);

    if (!match) return null;

    return {
        id: Number(match[1]),
        status: match[2] === "pub" ? "published" : "rejected",
    };

}

// Що показати власнику після натискання — замість кнопок.
export function reviewVerdictLine(status) {

    return status === "published"
        ? "✅ Відгук показано на сайті"
        : "🚫 Відгук відхилено";

}
