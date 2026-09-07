// Серверні конверсії Meta (Conversions API).
//
// НАВІЩО
// -------
// Досі про покупку Meta дізнавалась ЛИШЕ з браузера: піксель на
// сторінці подяки надсилав Purchase. Проблема в тому, що цей піксель
// доїжджає не завжди:
//
//   • блокувальники рекламних скриптів вирізають connect.facebook.net цілком;
//   • Safari й iOS обмежують сторонні скрипти та куки;
//   • людина закриває вкладку швидше, ніж скрипт устигає надіслати.
//
// Це не «трохи менше статистики». Meta оптимізує показ реклами за
// конверсіями: якщо вона бачить половину покупок, вона й навчається на
// половині — і шукає схожих людей за неповною картиною. Тобто гроші за
// рекламу витрачаються гірше, ніж могли б.
//
// Conversions API — той самий Purchase, але надісланий СЕРВЕРОМ. Його
// не блокує ніщо в браузері: запит іде з нашої функції в Meta.
//
// ЧОМУ НЕ ДУБЛЮЄТЬСЯ
// -------------------
// Meta склеює браузерну й серверну подію, якщо в них однакові
// event_name і event_id. Тому event_id тут будується з НОМЕРА
// ЗАМОВЛЕННЯ — те саме значення, що браузер кладе в eventID пікселя
// (див. assets/js/analytics.js). Одне замовлення = один event_id, хоч
// скільки разів його надішли.
//
// Додатково кладемо order_id: для Purchase Meta вміє склеювати ще й за
// ним. Два незалежні способи — бо порахувати покупку двічі гірше, ніж
// не порахувати взагалі: подвоєна конверсія бреше про ціну залучення.
//
// ЧОМУ ТІЛЬКИ PURCHASE
// ---------------------
// ViewContent і AddToCart — це подія на кожен перегляд товару, тобто
// запит до Meta з сервера на кожен клік. Оптимізація ж будується на
// покупці. Тож серверна тут одна, найдорожча подія; решта лишається
// браузерною.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі й хешування. У цьому файлі лише чисті функції — щоб їх можна
// було ганяти тестами в Node, без Deno й без справжніх запитів у Meta.
// Хешує й надсилає _index.src.ts.

// Версія Graph API. Пін навмисний: Meta ламає сумісність між версіями,
// і «остання» колись стане несумісною сама собою.
export const GRAPH_VERSION = "v21.0";

// Скільки живе подія. Meta відкидає старші за 7 днів, і немає сенсу
// намагатись надіслати вчорашнє замовлення повторно.
export const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;


// -------------------------
// Нормалізація перед хешуванням
//
// Meta хешує не те, що ви прислали, а те, що ЇЇ нормалізатор зробив із
// даних користувача на її боці. Якщо ми нормалізуємо інакше — хеші не
// зійдуться, і збіг не знайдеться: подія долетить, але припишеться
// нікому. Тому правила нижче — дослівно за документацією Meta.
// -------------------------

// Пошта: обрізати, у нижній регістр. Усе.
export function normalizeEmail(value) {

    const clean = String(value ?? "").trim().toLowerCase();

    // Без «@» це не пошта, а описка. Хеш від описки — сміття, яке
    // тільки псує показник якості збігів у Events Manager.
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) ? clean : "";

}

// Телефон: лише цифри, обов'язково з кодом країни, без «+».
//
// ЧОМУ ЦЕ НЕ ОДИН replace. Той самий український номер люди пишуть
// щонайменше чотирма способами, і всі чотири мусять дати ОДИН хеш —
// інакше та сама людина виглядає для Meta як чотири різні:
//
//   +380 73 728 82 91  →  380737288291
//   0737288291         →  380737288291
//   80737288291        →  380737288291
//   737288291          →  380737288291
export function normalizePhone(value) {

    let digits = String(value ?? "").replace(/\D/g, "");

    if (!digits) return "";

    // «80…» — старий міжміський формат, який досі пишуть у візитках.
    if (digits.length === 11 && digits.startsWith("80")) {
        digits = "3" + digits;
    }

    // «0…» — місцевий запис: прибираємо нуль, ставимо код країни.
    if (digits.length === 10 && digits.startsWith("0")) {
        digits = "38" + digits;
    }

    // Дев'ять цифр — номер без жодного префікса.
    if (digits.length === 9) {
        digits = "380" + digits;
    }

    // Довжина поза межами телефонного номера — швидше описка або
    // вставлений не той рядок. Порожнє краще за неправильний хеш.
    if (digits.length < 11 || digits.length > 15) return "";

    return digits;

}

// Ім'я, прізвище: нижній регістр, без пробілів, цифр і пунктуації.
export function normalizeName(value) {

    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}]/gu, "");

}

// Місто: те саме, що ім'я. «м. Київ» і «Київ» мусять дати один хеш.
export function normalizeCity(value) {

    return normalizeName(value);

}

// Країна: дволітерний код у нижньому регістрі.
export const COUNTRY_CODE = "ua";


// -------------------------
// Що саме хешувати
// -------------------------

// Ключі Meta для даних людини і значення з замовлення.
//
// Повертає ЩЕ НЕ ХЕШОВАНІ значення: хешує виклик у Deno, бо
// crypto.subtle асинхронний, а цей файл має лишатись чистим.
//
// Порожні поля не потрапляють у результат зовсім. Хеш від порожнього
// рядка — це не «немає даних», а конкретний хеш, однаковий у всіх
// покупців: Meta склеїла б їх в одну людину.
export function userDataSources(order) {

    const source = {
        em: normalizeEmail(order?.email),
        ph: normalizePhone(order?.phone),
        fn: normalizeName(order?.first_name),
        ln: normalizeName(order?.last_name),
        ct: normalizeCity(order?.delivery_city),
        country: COUNTRY_CODE,
    };

    const result = {};

    Object.keys(source).forEach((key) => {
        if (source[key]) result[key] = source[key];
    });

    return result;

}

// Чи є взагалі за чим шукати людину.
//
// Meta відхиляє подію без жодного ідентифікатора. Пошта або телефон —
// найсильніші; fbp/fbc теж рахуються, але їх немає саме тоді, коли
// піксель заблокований, тобто рівно в тих випадках, для яких усе це й
// робиться.
export function hasIdentity(sources, browser) {

    if (sources && (sources.em || sources.ph)) return true;

    return Boolean(browser && (browser.fbp || browser.fbc));

}


// -------------------------
// Склад покупки
// -------------------------

// Ідентифікатор товару для Meta.
//
// МУСИТЬ збігатися з тим, що надсилає піксель і що стоїть у фіді
// (scripts/build-feed.js) — інакше динамічна реклама показує «товар не
// знайдено», а конверсія не приписується жодному товару. Формат один
// на три місця: числовий id товару рядком.
export function metaContentId(item) {

    const id = Number(item?.id);

    return Number.isFinite(id) && id > 0 ? String(Math.trunc(id)) : "";

}

// custom_data події: гроші й склад.
//
// Суму беремо з РЯДКА В БАЗІ, а не з того, що прислав браузер. Це той
// самий принцип, що в перевірці ціни (міграція 014): числа, які
// прийшли з браузера, — заявка, а не факт. Тут це ще й захист від
// накрутки: інакше сторонній запит міг би записати Meta покупку на
// мільйон і зіпсувати оптимізацію реклами.
export function customData(order) {

    const items = Array.isArray(order?.items) ? order.items : [];

    const contents = items
        .map((item) => {

            const id = metaContentId(item);

            if (!id) return null;

            const qty = Math.max(Math.trunc(Number(item.qty) || 1), 1);

            return {
                id,
                quantity: qty,
                item_price: Math.round((Number(item.price) || 0) * 100) / 100,
            };

        })
        .filter(Boolean);

    const data = {
        currency: "UAH",
        value: Math.round((Number(order?.total) || 0) * 100) / 100,
        content_type: "product",
        content_ids: contents.map((row) => row.id),
        contents,
        num_items: contents.reduce((sum, row) => sum + row.quantity, 0),
    };

    // Другий спосіб склеювання з браузерною подією.
    if (order?.order_number) data.order_id = String(order.order_number);

    return data;

}


// -------------------------
// Сама подія
// -------------------------

// Ключ склеювання. Той самий рядок будує браузер — див.
// Analytics.purchase у assets/js/analytics.js.
export function purchaseEventId(orderNumber) {

    const clean = String(orderNumber ?? "").trim();

    return clean ? `purchase.${clean}` : "";

}

// Готова подія для Meta.
//
// hashed — уже похешовані значення з userDataSources (SHA-256, hex).
// Кладемо їх масивами: Meta приймає і рядок, і масив, але масив — це
// документована форма, і саме її показує їхній же приклад.
export function buildEvent({ order, hashed, browser, sourceUrl, ip, userAgent, now }) {

    const when = Number(now) || Date.now();

    const created = Date.parse(order?.created_at ?? "");

    // Час події — коли покупка сталась, а не коли ми про неї
    // розповіли. Але якщо рядок у базі старший за межу Meta, вона
    // відкине подію цілком, тож не вигадуємо: беремо поточний час.
    const eventTime = Number.isFinite(created) && when - created < MAX_EVENT_AGE_MS
        ? created
        : when;

    const userData = {};

    Object.keys(hashed || {}).forEach((key) => {
        if (hashed[key]) userData[key] = [hashed[key]];
    });

    // Ці три — НЕ хешуються. Meta вимагає їх у відкритому вигляді:
    // адреса й браузер потрібні саме для того, щоб зіставити серверну
    // подію з браузерною сесією.
    if (ip) userData.client_ip_address = ip;
    if (userAgent) userData.client_user_agent = userAgent;

    if (browser?.fbp) userData.fbp = browser.fbp;
    if (browser?.fbc) userData.fbc = browser.fbc;

    return {
        event_name: "Purchase",
        event_time: Math.floor(eventTime / 1000),
        event_id: purchaseEventId(order?.order_number),
        action_source: "website",
        ...(sourceUrl ? { event_source_url: sourceUrl } : {}),
        user_data: userData,
        custom_data: customData(order),
    };

}

// Куди і що надсилати.
//
// Токен іде в ТІЛІ запиту, а не в адресі: адреси лишаються в логах
// проксі, у метриках, у повідомленнях про помилки. Токен CAPI дає
// право писати конверсії від імені рекламного акаунта — йому там не
// місце.
export function capiRequest(pixelId, token, events, testCode) {

    const pixel = String(pixelId ?? "").trim();

    // Порожній піксель або токен = вимкнено. Жодного запиту в Meta не
    // буде — той самий принцип, що з ключами пошти й Нової пошти.
    if (!pixel || !/^\d{5,}$/.test(pixel) || !String(token ?? "").trim()) return null;

    const list = (events || []).filter((event) => event && event.event_id);

    if (!list.length) return null;

    const body = {
        data: list,
        access_token: String(token).trim(),
    };

    // Код перевірки. Поки він заданий, події видно у вкладці
    // Test Events в Events Manager і вони НЕ йдуть у звіти — саме тим
    // і перевіряють, що інтеграція жива. Після перевірки секрет
    // прибирають, інакше жодна покупка не дійде до оптимізації.
    const test = String(testCode ?? "").trim();

    if (test) body.test_event_code = test;

    return {
        url: `https://graph.facebook.com/${GRAPH_VERSION}/${pixel}/events`,
        body,
    };

}

// Розбір відповіді Meta.
//
// HTTP-код сам по собі нічого не каже: Meta відповідає 200 і на
// «прийнято 0 подій». Успіх — це events_received > 0.
export function capiVerdict(status, data) {

    if (data && data.error) {

        const error = data.error;

        return {
            ok: false,
            reason: `${error.type || "error"} ${error.code || ""}: ${error.message || "без опису"}`.trim(),
        };

    }

    if (status < 200 || status >= 300) {
        return { ok: false, reason: `HTTP ${status}` };
    }

    const received = Number(data?.events_received);

    if (!Number.isFinite(received) || received <= 0) {
        return { ok: false, reason: "Meta не прийняла жодної події" };
    }

    return { ok: true, received };

}


// -------------------------
// Що прислав браузер
// -------------------------

// Куки пікселя, які браузер передає нам сам.
//
// _fbp ставить піксель, _fbc — це збережений fbclid із рекламного
// переходу. Обидві різко піднімають якість збігів, і обидві — рівно
// ті рядки, які піксель уже надіслав би сам. Ми їх не вигадуємо: якщо
// піксель заблокований, їх просто немає.
//
// Формат жорсткий (fb.1.<час>.<число>), тому перевіряємо: у цьому
// полі не має проїхати нічого, крім куки Meta.
export function cleanBrowserIds(payload) {

    const pick = (value) => {

        const clean = String(value ?? "").trim();

        return /^fb\.[12]\.\d{10,16}\.[\w-]{1,120}$/.test(clean) ? clean : "";

    };

    return {
        fbp: pick(payload?.fbp),
        fbc: pick(payload?.fbc),
    };

}

// Адреса сторінки, з якої прийшла подія.
//
// Приймаємо тільки власні домени: event_source_url із чужого сайту в
// звітах Meta виглядав би так, ніби магазин продає деінде.
export function cleanSourceUrl(value, allowedOrigins) {

    const clean = String(value ?? "").trim();

    if (!clean) return "";

    let url;

    try {
        url = new URL(clean);
    } catch {
        return "";
    }

    const list = Array.isArray(allowedOrigins) ? allowedOrigins : [];

    return list.includes(url.origin) ? url.origin + url.pathname : "";

}
