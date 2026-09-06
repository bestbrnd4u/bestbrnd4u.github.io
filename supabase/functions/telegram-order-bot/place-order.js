// Замовлення з сайту, яке проходить через функцію.
//
// НАВІЩО
// -------
// Досі браузер клав замовлення в базу сам — публічним ключем, який
// лежить у коді сайту. Так і має бути: інакше гість не зміг би
// замовити. Але це означає, що надіслати замовлення може будь-хто, не
// відкриваючи сайту взагалі: сотня підроблених рядків це сотня
// повідомлень у Telegram і — найгірше — зайняті залишки, бо перевірка
// «останній екземпляр» вважає кожне відкрите замовлення зайнятою
// одиницею.
//
// Тепер між браузером і базою може стояти перевірка «ви людина»
// (Cloudflare Turnstile). Підтвердити її можна лише на сервері — у
// браузері будь-яка така перевірка нічого не варта.
//
// ЩО В ЦЬОМУ ФАЙЛІ
// -----------------
// Тільки чиста логіка: перевірка й чистка того, що прислали. Мережа й
// база — у _index.src.ts. Так це можна ганяти тестами в Node.
//
// ГОЛОВНЕ ПРАВИЛО: ФУНКЦІЯ ПИШЕ СЛУЖБОВИМ КЛЮЧЕМ
// -----------------------------------------------
// Тобто обмеження бази на неї не діють — вона може записати будь-що в
// будь-яку колонку. Саме тому нижче не «прибрати зайве», а БІЛИЙ
// СПИСОК: у рядок потрапляють рівно ті поля, які надсилає сторінка
// оформлення, і нічого більше. Статус завжди «new»; чиє це замовлення
// — вирішує не payload, а підтверджений токен.

// Скільки позицій може бути в замовленні. Не обмеження магазину, а
// стеля здорового глузду: більше — це вже не покупка.
export const MAX_ITEMS = 50;

// Стеля суми (₴). Захищає від «замовлення» на мільярд, яке зіпсує
// звіти й підсумки.
export const MAX_MONEY = 10000000;

const TEXT_LIMITS = {
    order_number: 40,
    delivery_method: 120,
    delivery_city: 120,
    delivery_detail: 300,
    payment_method: 120,
    promo_code: 40,
    first_name: 80,
    last_name: 80,
    phone: 40,
    email: 160,
};

function text(value, limit) {

    const clean = String(value ?? "").trim();

    return clean ? clean.slice(0, limit) : null;

}

// Число грошей: не менше нуля, не більше стелі, дві цифри після коми.
//
// Назва навмисно не money(): у зібраному файлі всі модулі лежать
// поруч, а money() там уже зайнята — це форматування суми для
// Telegram. Дві функції з однією назвою тихо перекрили б одна одну.
function amount(value) {

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0 || number > MAX_MONEY) return 0;

    return Math.round(number * 100) / 100;

}

// Позиція замовлення. Склад той самий, що кладе сторінка оформлення
// (buildOrderItemsSnapshot у assets/js/checkout.js): назва, бренд,
// ціна, фото, кількість, колір, розмір.
function item(raw) {

    if (!raw || typeof raw !== "object") return null;

    const title = text(raw.title, 200);

    if (!title) return null;

    const id = Number(raw.id);

    return {
        id: Number.isFinite(id) && id > 0 ? Math.trunc(id) : null,
        title,
        brand: text(raw.brand, 100),
        price: amount(raw.price),
        image: text(raw.image, 500),
        qty: Math.min(Math.max(Math.trunc(Number(raw.qty) || 1), 1), 100),
        color: text(raw.color, 100),
        size: text(raw.size, 50),
    };

}

// Перевірка й чистка замовлення.
//
// Повертає { ok: true, row } або { ok: false, reason } — reason іде в
// логи функції, а не покупцеві: йому досить «не вдалося оформити».
export function cleanOrder(payload) {

    if (!payload || typeof payload !== "object") {
        return { ok: false, reason: "порожній запит" };
    }

    const orderNumber = text(payload.order_number, TEXT_LIMITS.order_number);

    if (!orderNumber || !/^[0-9A-Za-z-]{4,40}$/.test(orderNumber)) {
        return { ok: false, reason: "номер замовлення не схожий на номер" };
    }

    const rawItems = Array.isArray(payload.items) ? payload.items : [];

    if (!rawItems.length) {
        return { ok: false, reason: "порожній склад замовлення" };
    }

    if (rawItems.length > MAX_ITEMS) {
        return { ok: false, reason: `позицій більше за ${MAX_ITEMS}` };
    }

    const items = rawItems.map(item).filter(Boolean);

    if (!items.length) {
        return { ok: false, reason: "жодної придатної позиції" };
    }

    // Хоч якісь контакти: замовлення, за яким неможливо зателефонувати
    // чи написати, — це не замовлення.
    const phone = text(payload.phone, TEXT_LIMITS.phone);
    const email = text(payload.email, TEXT_LIMITS.email);

    if (!phone && !email) {
        return { ok: false, reason: "немає ні телефону, ні пошти" };
    }

    return {
        ok: true,
        row: {
            order_number: orderNumber,

            // Статус НЕ з payload: нове замовлення завжди нове.
            // Інакше підроблений запит міг би одразу прикинутись
            // відправленим і проскочити повз перевірку менеджера.
            status: "new",

            items,

            subtotal: amount(payload.subtotal),
            discount: amount(payload.discount),
            delivery_price: amount(payload.delivery_price),
            total: amount(payload.total),

            delivery_method: text(payload.delivery_method, TEXT_LIMITS.delivery_method),
            delivery_city: text(payload.delivery_city, TEXT_LIMITS.delivery_city),
            delivery_detail: text(payload.delivery_detail, TEXT_LIMITS.delivery_detail),
            payment_method: text(payload.payment_method, TEXT_LIMITS.payment_method),
            promo_code: text(payload.promo_code, TEXT_LIMITS.promo_code),

            first_name: text(payload.first_name, TEXT_LIMITS.first_name),
            last_name: text(payload.last_name, TEXT_LIMITS.last_name),
            phone,
            email,
        },
    };

}

// Відповідь Cloudflare на перевірку токена.
//
// Виносимо в чисту функцію, щоб розбір відповіді перевірявся тестом:
// сам мережевий виклик у Deno не протестуєш.
export function turnstileVerdict(data) {

    if (!data || typeof data !== "object") return { ok: false, reason: "порожня відповідь" };

    if (data.success === true) return { ok: true };

    const codes = Array.isArray(data["error-codes"]) ? data["error-codes"].join(", ") : "";

    return { ok: false, reason: codes || "перевірку не пройдено" };

}
