// Листи покупцеві: підтвердження замовлення й зміна статусу.
//
// НАВІЩО
// -------
// Покупець із сайту досі не отримував НІ ОДНОГО повідомлення після
// листа «замовлення прийнято» (його шле сама сторінка через EmailJS).
// Замовлення поїхало, номер накладної є, статус змінився — людина про
// це не знає. Сповіщення в 003-customer-notifications.sql ідуть у
// telegram_chat_id, а він є лише в замовлень із бота.
//
// Тобто половина покупців — ті, хто замовляв на сайті, — після
// оформлення лишалась наодинці: або дзвони сам, або чекай.
//
// ОДИН КАНАЛ НА ПОКУПЦЯ
// ----------------------
// Замовлення з бота мають telegram_chat_id і не мають пошти;
// замовлення з сайту — навпаки. Тому правило просте: є чат — пишемо в
// чат, немає — пишемо листом. Двох повідомлень про одне й те саме не
// буває за побудовою.
//
// ЧОМУ ЛИСТ ЗБИРАЄТЬСЯ ТУТ, А НЕ В СЕРВІСІ РОЗСИЛОК
// --------------------------------------------------
// Щоб текст листа лежав у репозиторії поруч із текстом повідомлення в
// Telegram — і правився разом із ним. Шаблон у чужій панелі рано чи
// пізно розходиться з тим, що каже бот.
//
// ЧОМУ ДВА ПРОВАЙДЕРИ
// --------------------
// Resend і Brevo — обидва мають безкоштовний тариф, якого магазину
// вистачає з великим запасом, але вимагають різного: Resend хоче
// підтверджений домен (DNS-записи), Brevo дозволяє почати з однієї
// підтвердженої адреси. Хай власник обирає, що йому простіше; код
// однаково готовий до обох.

import { escapeHtml, money, trackingUrl, freeDeliveryApplies } from "./format.js";

// Куда приходить відповідь покупця.
//
// НАВІЩО ОКРЕМО ВІД «ВІД КОГО». Слати листи найкраще з адреси на
// підтвердженому домені — noreply@bestbrnd4u.com. Але скриньки за
// такою адресою немає й не буде: домен налаштований лише на
// ВІДПРАВКУ. Тобто покупець, який натисне «Відповісти» (а він
// натисне — це найприродніша реакція на лист про своє замовлення),
// написав би в нікуди.
//
// Тому в кожному листі стоїть Reply-To з живою скринькою. Та сама
// адреса, що в підвалі листа, — одна на файл, щоб вони не розійшлися.
export const SHOP_EMAIL = "bestbrnd4u@proton.me";

// МОВА ЛИСТА
// -----------
// Мова — та, якою покупець оформлював замовлення (orders.lang, міграція
// 044). Порожньо або щось інше — українська: так у всіх старих
// замовленнях і в замовленнях із бота.
//
// Переклад тут, а не через словник сайту: лист збирає функція в Deno і
// скрипти в GitHub Actions, і тягнути їм 400 КБ словника заради сорока
// фраз було б дорого й крихко. Назви товарів і кольорів приходять уже
// перекладеними в самому замовленні (title_local, color_local — їх
// кладе сторінка оформлення тим самим перекладачем, що й сайт).
export const MAIL_LANGS = ["uk", "en", "ru"];

export function mailLang(value) {
    const lang = String(value ?? "").trim().toLowerCase();
    return MAIL_LANGS.includes(lang) ? lang : "uk";
}

// Спосіб доставки й оплати в замовленні — українські значення зі
// сторінки оформлення (на них тримається логіка й їх читає менеджер).
// У листі — мовою покупця. Невідоме значення лишається як є.
const VALUE_TEXT = {
    "На відділення «Нова пошта»": { en: "Nova Poshta branch", ru: "В отделение «Нова пошта»" },
    "Поштомат «Нова пошта»": { en: "Nova Poshta parcel locker", ru: "Почтомат «Нова пошта»" },
    "Кур'єром «Нова пошта»": { en: "Nova Poshta courier", ru: "Курьером «Нова пошта»" },
    "Інша пошта": { en: "Another carrier", ru: "Другая почта" },
    "Банківською карткою (Visa/Mastercard)": { en: "Bank card (Visa/Mastercard)", ru: "Банковской картой (Visa/Mastercard)" },
    "Готівкою при отриманні на пошті": { en: "Cash on delivery at the post office", ru: "Наличными при получении на почте" }
};

function valueText(value, lang) {
    const v = String(value ?? "");
    return (lang !== "uk" && VALUE_TEXT[v] && VALUE_TEXT[v][lang]) || v;
}

// Тексти листів. {name} — підстановки; значення в них уже екрановані
// там, де збираються (номер замовлення, сума, адреса).
const TEXT = {
    uk: {
        hours: "Пн–Нд 09:00–20:00",
        subtotal: "Сума товарів", discount: "Знижка", delivery: "Доставка", total: "Разом",
        freeDelivery: "безкоштовно",
        method: "Спосіб", city: "Місто", branch: "Відділення", payment: "Оплата",
        yourOrder: "Ваше замовлення",
        lookup: "Стан замовлення можна перевірити будь-коли: {link} — потрібні номер {number} і ваш телефон.",
        lookupLink: "Де моє замовлення",
        orderTitle: "Замовлення прийнято 🎉",
        orderSubject: "Замовлення {number} прийнято",
        orderIntro: "Дякуємо за замовлення <b>{number}</b>! Ми вже його бачимо й найближчим часом зв'яжемось, щоб підтвердити деталі.",
        track: "Відстежити посилку",
        processingSubject: "Замовлення {number} прийнято в роботу",
        processingTitle: "Замовлення в роботі 👌",
        processingText: "Ваше замовлення <b>{number}</b> прийнято в роботу. Ми зв'яжемось із вами найближчим часом, щоб підтвердити деталі.",
        shippedSubject: "Замовлення {number} відправлено",
        shippedTitle: "Замовлення відправлено 📦",
        shippedText: "Замовлення <b>{number}</b> вже в дорозі.",
        ttn: "Номер накладної: <b>{ttn}</b>",
        ttnLater: "Номер накладної надішлемо окремо.",
        completedSubject: "Замовлення {number} виконано",
        completedTitle: "Замовлення виконано 🎉",
        completedText: "Замовлення <b>{number}</b> виконано. Дякуємо за покупку — будемо раді бачити вас знову!",
        cancelledSubject: "Замовлення {number} скасовано",
        cancelledTitle: "Замовлення скасовано",
        cancelledText: "Замовлення <b>{number}</b> скасовано. Якщо це помилка — просто напишіть нам, ми все виправимо.",
        reviewSubject: "Як вам покупка? Замовлення {number}",
        reviewTitle: "Дякуємо за покупку 💬",
        reviewWrite: "Написати відгук →",
        reviewIntro: "Дякуємо за замовлення <b>{number}</b>! Сподіваємось, усе підійшло.",
        reviewAsk: "Якщо у вас є хвилина — напишіть кілька слів про покупку. Це найкорисніше, що можна зробити для наступного покупця: він бачить ту саму річ, але не може її потримати.",
        reviewNote: "Знадобиться номер замовлення <b>{number}</b> і ваш телефон — так ми відрізняємо відгуки покупців від чужих. Відгук з'явиться на сайті після того, як ми його прочитаємо.",
        thanksSubject: "Ваша персональна знижка {percent}% — код {code}",
        thanksTitle: "Дякуємо за покупку 🎁",
        thanksHello: "{name}, дякуємо за покупку!",
        thanksHelloAnon: "Дякуємо за покупку!",
        thanksWish: " Сподіваємось, річ вам служить.",
        thanksOffer: "Ось персональна знижка на наступне замовлення — тільки ваша, для одного використання.",
        thanksPercent: "знижка {percent}%",
        thanksUntil: " · діє до {date}",
        thanksButton: "Подивитись новинки",
        thanksHow: "Код вводиться в полі «Маєте промокод?» на сторінці оформлення.",
        months: ["січня", "лютого", "березня", "квітня", "травня", "червня",
            "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"],
        subscribeSubject: "Підтвердіть підписку на новинки BestBrnd4u",
        subscribeTitle: "Залишився один крок ✉️",
        subscribeIntro: "Ви залишили цю адресу на bestbrnd4u.com, щоб отримувати листи про новинки та акції. Лишилось підтвердити, що скринька ваша.",
        subscribeButton: "Підтвердити підписку",
        copyLink: "Кнопка не працює? Скопіюйте адресу:",
        subscribeNote: "Посилання діє тиждень. Листи приходять не частіше ніж кілька разів на місяць, і відписатись можна з будь-якого — посилання внизу кожного.",
        subscribeIgnore: "Якщо це були не ви — просто видаліть лист. Без переходу за посиланням ми на цю адресу нічого не надсилатимемо."
    },
    en: {
        hours: "Mon–Sun 09:00–20:00 (Kyiv time)",
        subtotal: "Items", discount: "Discount", delivery: "Delivery", total: "Total",
        freeDelivery: "free",
        method: "Method", city: "City", branch: "Branch", payment: "Payment",
        yourOrder: "Your order",
        lookup: "You can check your order status any time: {link} — you will need the number {number} and your phone.",
        lookupLink: "Where is my order",
        orderTitle: "Order received 🎉",
        orderSubject: "Order {number} received",
        orderIntro: "Thank you for your order <b>{number}</b>! We have already got it and will contact you shortly to confirm the details.",
        track: "Track parcel",
        processingSubject: "Order {number} is being processed",
        processingTitle: "Order in progress 👌",
        processingText: "Your order <b>{number}</b> is being processed. We will contact you shortly to confirm the details.",
        shippedSubject: "Order {number} has been shipped",
        shippedTitle: "Order shipped 📦",
        shippedText: "Order <b>{number}</b> is on its way.",
        ttn: "Tracking number: <b>{ttn}</b>",
        ttnLater: "We will send the tracking number separately.",
        completedSubject: "Order {number} completed",
        completedTitle: "Order completed 🎉",
        completedText: "Order <b>{number}</b> is completed. Thank you for shopping with us — we will be glad to see you again!",
        cancelledSubject: "Order {number} cancelled",
        cancelledTitle: "Order cancelled",
        cancelledText: "Order <b>{number}</b> has been cancelled. If this is a mistake, just write to us and we will fix it.",
        reviewSubject: "How do you like your purchase? Order {number}",
        reviewTitle: "Thank you for your purchase 💬",
        reviewWrite: "Write a review →",
        reviewIntro: "Thank you for your order <b>{number}</b>! We hope everything fits.",
        reviewAsk: "If you have a minute, write a few words about your purchase. It is the most useful thing you can do for the next buyer: they see the same item but cannot hold it.",
        reviewNote: "You will need the order number <b>{number}</b> and your phone — this is how we tell buyers' reviews from others. The review will appear on the site after we read it.",
        thanksSubject: "Your personal {percent}% discount — code {code}",
        thanksTitle: "Thank you for your purchase 🎁",
        thanksHello: "{name}, thank you for your purchase!",
        thanksHelloAnon: "Thank you for your purchase!",
        thanksWish: " We hope you enjoy it.",
        thanksOffer: "Here is a personal discount on your next order — just for you, single use.",
        thanksPercent: "{percent}% off",
        thanksUntil: " · valid until {date}",
        thanksButton: "See new arrivals",
        thanksHow: "Enter the code in the “Have a promo code?” field at checkout.",
        months: ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"],
        subscribeSubject: "Confirm your BestBrnd4u newsletter subscription",
        subscribeTitle: "One step left ✉️",
        subscribeIntro: "You left this address on bestbrnd4u.com to get emails about new arrivals and sales. Please confirm that the mailbox is yours.",
        subscribeButton: "Confirm subscription",
        copyLink: "Button not working? Copy the link:",
        subscribeNote: "The link is valid for a week. We write no more than a few times a month, and you can unsubscribe from any email — the link is at the bottom of each one.",
        subscribeIgnore: "If this wasn't you, just delete this email. Unless the link is opened, we will send nothing to this address."
    },
    ru: {
        hours: "Пн–Вс 09:00–20:00",
        subtotal: "Сумма товаров", discount: "Скидка", delivery: "Доставка", total: "Итого",
        freeDelivery: "бесплатно",
        method: "Способ", city: "Город", branch: "Отделение", payment: "Оплата",
        yourOrder: "Ваш заказ",
        lookup: "Состояние заказа можно проверить в любой момент: {link} — понадобятся номер {number} и ваш телефон.",
        lookupLink: "Где мой заказ",
        orderTitle: "Заказ принят 🎉",
        orderSubject: "Заказ {number} принят",
        orderIntro: "Спасибо за заказ <b>{number}</b>! Мы уже его видим и в ближайшее время свяжемся, чтобы подтвердить детали.",
        track: "Отследить посылку",
        processingSubject: "Заказ {number} принят в работу",
        processingTitle: "Заказ в работе 👌",
        processingText: "Ваш заказ <b>{number}</b> принят в работу. Мы свяжемся с вами в ближайшее время, чтобы подтвердить детали.",
        shippedSubject: "Заказ {number} отправлен",
        shippedTitle: "Заказ отправлен 📦",
        shippedText: "Заказ <b>{number}</b> уже в пути.",
        ttn: "Номер накладной: <b>{ttn}</b>",
        ttnLater: "Номер накладной пришлем отдельно.",
        completedSubject: "Заказ {number} выполнен",
        completedTitle: "Заказ выполнен 🎉",
        completedText: "Заказ <b>{number}</b> выполнен. Спасибо за покупку — будем рады видеть вас снова!",
        cancelledSubject: "Заказ {number} отменен",
        cancelledTitle: "Заказ отменен",
        cancelledText: "Заказ <b>{number}</b> отменен. Если это ошибка — просто напишите нам, мы все исправим.",
        reviewSubject: "Как вам покупка? Заказ {number}",
        reviewTitle: "Спасибо за покупку 💬",
        reviewWrite: "Написать отзыв →",
        reviewIntro: "Спасибо за заказ <b>{number}</b>! Надеемся, все подошло.",
        reviewAsk: "Если у вас есть минута — напишите несколько слов о покупке. Это самое полезное, что можно сделать для следующего покупателя: он видит ту же вещь, но не может ее подержать.",
        reviewNote: "Понадобится номер заказа <b>{number}</b> и ваш телефон — так мы отличаем отзывы покупателей от чужих. Отзыв появится на сайте после того, как мы его прочитаем.",
        thanksSubject: "Ваша персональная скидка {percent}% — код {code}",
        thanksTitle: "Спасибо за покупку 🎁",
        thanksHello: "{name}, спасибо за покупку!",
        thanksHelloAnon: "Спасибо за покупку!",
        thanksWish: " Надеемся, вещь вам служит.",
        thanksOffer: "Вот персональная скидка на следующий заказ — только ваша, для одного использования.",
        thanksPercent: "скидка {percent}%",
        thanksUntil: " · действует до {date}",
        thanksButton: "Посмотреть новинки",
        thanksHow: "Код вводится в поле «Есть промокод?» на странице оформления.",
        months: ["января", "февраля", "марта", "апреля", "мая", "июня",
            "июля", "августа", "сентября", "октября", "ноября", "декабря"],
        subscribeSubject: "Подтвердите подписку на новинки BestBrnd4u",
        subscribeTitle: "Остался один шаг ✉️",
        subscribeIntro: "Вы оставили этот адрес на bestbrnd4u.com, чтобы получать письма о новинках и акциях. Осталось подтвердить, что ящик ваш.",
        subscribeButton: "Подтвердить подписку",
        copyLink: "Кнопка не работает? Скопируйте адрес:",
        subscribeNote: "Ссылка действует неделю. Письма приходят не чаще нескольких раз в месяц, и отписаться можно из любого — ссылка внизу каждого.",
        subscribeIgnore: "Если это были не вы — просто удалите письмо. Без перехода по ссылке мы на этот адрес ничего не будем отправлять."
    }
};

export function mailText(lang, key, vars) {
    const table = TEXT[mailLang(lang)];
    const raw = key in table ? table[key] : TEXT.uk[key];
    if (typeof raw !== "string") return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name) => (vars && name in vars ? String(vars[name]) : m));
}

// Адреса сторінки сайту мовою листа: /order-status → /en/order-status.
function localPath(path, lang) {
    const p = String(path || "/");
    return lang === "uk" ? p : `/${lang}${p.startsWith("/") ? p : "/" + p}`;
}

// Сума: українською «6 500 грн», як і досі; англійською й російською —
// «6 500 ₴», як на мовних версіях сайту.
function localMoney(value, lang) {
    const text = money(value);
    return lang === "uk" ? text : text.replace(/ грн$/, " ₴");
}

// Загальний вигляд листа.
//
// Верстка навмисно проста й inline: клієнти пошти вирізають <style>,
// не знають flex і по-різному розуміють майже все інше. Лист, який
// зламався в Outlook, гірший за лист без оформлення.
function letterShell(title, bodyHtml, siteUrl, lang) {

    const l = mailLang(lang);

    const root = String(siteUrl || "").replace(/\/+$/, "");
    const site = root && l !== "uk" ? root + localPath("/", l) : root;

    return [
        '<div style="margin:0;padding:24px;background:#f3f4f6;',
        'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">',
        '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">',
        `<div style="font-size:20px;font-weight:700;letter-spacing:-.01em;margin-bottom:18px;text-align:center">${escapeHtml(title)}</div>`,
        bodyHtml,
        '<div style="margin-top:26px;padding-top:18px;border-top:1px solid #e5e7eb;',
        'font-size:13px;line-height:1.6;color:#6b7280">',
        site ? `<a href="${escapeHtml(site)}" style="color:#111827">BestBrnd4u</a> · ` : "BestBrnd4u · ",
        '<a href="https://t.me/bestbrnd4u" style="color:#111827">Telegram</a> · ',
        `<a href="mailto:${SHOP_EMAIL}" style="color:#111827">${SHOP_EMAIL}</a>`,
        `<br>${escapeHtml(mailText(l, "hours"))}`,
        "</div>",
        "</div>",
        "</div>"
    ].join("");

}

// Рядок «підпис — значення».
//
// Підпис екранується, бо це текст; значення приходить уже готовою
// розміткою (сума, посилання) — тому екранувати його треба ТАМ, де
// воно збирається. Виділення підсумку — окремим прапорцем, а не
// тегом у підписі: тег там перетворився б на видимий «<b>Разом</b>»
// (саме так і вийшло з першого разу).
// ЧОМУ ТЕКСТОВІ ЗНАЧЕННЯ ВИРІВНЮЮТЬСЯ ІНАКШЕ, НІЖ ЧИСЛА
//
// Праворуч — правильно для сум: у стовпчику вони шикуються розряд під
// розрядом, і «Разом» читається з одного погляду.
//
// Для тексту це ламається. Адреса відділення Нової пошти — це 80-120
// символів («Поштомат "Нова Пошта" №2261: вул. Михайла Драгоманова,
// 40є, під'їзд №1 (ТІЛЬКИ ДЛЯ МЕШКАНЦІВ)(77)»), вона переноситься на
// два рядки, і при правому вирівнюванні в неї рваний лівий край
// просто посеред листа. Заміряно на справжньому листі про замовлення
// 8689484479 від 10.09.2026.
//
// Тому в блока «Доставка» власне вирівнювання: підпис вузьким
// стовпчиком ліворуч, значення — теж ліворуч, і перенос лягає рівно
// під початок рядка. valign="top" тримає підпис на першому рядку, а
// не посередині двох.
function row(label, value, strong, textual) {

    const labelStyle = strong
        ? "padding:8px 0 0;font-size:14px;font-weight:700"
        : "padding:4px 0;color:#6b7280;font-size:14px"
            + (textual ? ";width:96px;white-space:nowrap" : "");

    const valueStyle = strong
        ? "padding:8px 0 0;text-align:right;font-size:14px;font-weight:700"
        : "padding:4px 0;font-size:14px"
            + (textual
                ? ";text-align:left;padding-left:12px;line-height:1.45"
                : ";text-align:right");

    // Ширина ще й атрибутом: Outlook читає саме його надійніше за style.
    const labelWidth = textual && !strong ? ` width="96"` : "";

    return `<tr>`
        + `<td valign="top"${labelWidth} style="${labelStyle}">${escapeHtml(label)}</td>`
        + `<td valign="top" style="${valueStyle}">${value}</td>`
        + `</tr>`;

}

// Рядок блока «Доставка»: значення текстові, тож ліворуч (чому — вище).
function deliveryRow(label, value) {
    return row(label, value, false, true);
}

// Склад замовлення з фотографіями.
//
// ЧОМУ ФОТО ВАЖЛИВІ САМЕ ТУТ. Лист про замовлення читають через
// тиждень, коли назва «Сумка крос-боді жіноча шкіряна Marc Jacobs The
// Snapshot» уже нічого не нагадує. Фото відповідає на питання «що це
// було» швидше за будь-який текст.
//
// АДРЕСА ФОТО МУСИТЬ БУТИ АБСОЛЮТНОЮ — і вона така: знімок замовлення
// складає assets/js/checkout.js, і там уже стоїть absoluteUrl(). У
// листі відносний шлях нема від чого відкладати, і почтовик показав би
// заглушку. Тому тут ми адресу НЕ чіпаємо, лише екрануємо.
//
// ВИСОТУ НЕ ЗАДАЄМО. Outlook не знає object-fit, тож фіксована висота
// перетворила б фото на розтягнуте. Ширина 64 + height:auto виглядає
// однаково всюди.
function itemsTable(items, lang) {

    const l = mailLang(lang);

    const list = Array.isArray(items) ? items : [];

    if (!list.length) return "";

    const cell = "padding:10px 0;border-top:1px solid #e5e7eb";

    const rows = list.map(item => {

        // ONESIZE — внутрішня заглушка для товарів без розмірів. У
        // листі вона читалась би як помилка в даних; решта проєкту її
        // так само ховає (фід, ідентифікатор для Meta).
        const size = String(item.size ?? "").trim();

        // Мовою покупця, якщо сторінка поклала переклад (title_local,
        // color_local); інакше — як у замовленні.
        const color = (l !== "uk" && item.color_local) || item.color;

        const variant = [color, size.toUpperCase() === "ONESIZE" ? "" : size]
            .filter(Boolean).join(" / ");

        const title = escapeHtml((l !== "uk" && item.title_local) || item.title || "");

        // alt на випадок, коли фото не показали: Gmail за
        // замовчуванням не вантажить картинки, а Outlook не розуміє
        // webp. Рядок мусить читатись і без них.
        const photo = item.image
            ? `<img src="${escapeHtml(item.image)}" width="64" alt="${title}"`
                + ` style="display:block;border:0;border-radius:8px;max-width:64px;height:auto">`
            : "";

        return `<tr>`
            + `<td width="64" valign="top" style="${cell};padding-right:12px;width:64px">${photo}</td>`
            + `<td valign="top" style="${cell};font-size:14px">`
            + title
            + (item.brand ? `<br><span style="color:#6b7280">${escapeHtml(item.brand)}</span>` : "")
            + (variant ? `<br><span style="color:#6b7280">${escapeHtml(variant)}</span>` : "")
            + `</td>`
            + `<td valign="top" style="${cell};text-align:right;font-size:14px;white-space:nowrap">`
            + `${item.qty ?? 1} × ${escapeHtml(localMoney(item.price, l))}`
            + `</td></tr>`;

    }).join("");

    return `<table style="width:100%;border-collapse:collapse;margin:14px 0">${rows}</table>`;

}

// Короткий склад для листів про статус: товари й підсумок.
//
// НАВІЩО. Лист «замовлення відправлено» без складу відповідає на
// питання «коли», але не на «що». Через тиждень після покупки це
// різні питання, і другого покупець не пам'ятає.
//
// Повного розкладу (знижка, доставка, спосіб оплати) тут навмисно
// немає: він уже був у листі-підтвердженні, а тут важливо не
// повторити рахунок, а нагадати товар.
function summaryBlock(order) {

    const l = mailLang(order?.lang);

    const items = itemsTable(order?.items, l);

    if (!items) return "";

    return `<div style="margin-top:24px;padding-top:6px;border-top:1px solid #e5e7eb">`
        + `<div style="font-weight:600;font-size:14px;margin-top:14px">${escapeHtml(mailText(l, "yourOrder"))}</div>`
        + items
        + `<table style="width:100%;border-collapse:collapse">`
        + row(mailText(l, "total"), escapeHtml(localMoney(order?.total, l)), true)
        + `</table></div>`;

}

// Лист «замовлення прийнято».
// Посилання «перевірити стан замовлення».
//
// Номер підставлений в адресу, тож на сторінці лишається ввести лише
// телефон. Переписувати десять цифр із листа руками — рівно те, чого
// люди не роблять: вони пишуть у Telegram.
//
// Стилі вбудовані в атрибути: пошта не читає <style>, і будь-який
// клас тут просто нічого не робив би.
export function lookupLine(orderNumber, siteUrl, lang) {

    const l = mailLang(lang);

    const number = String(orderNumber ?? "").trim();

    if (!number) return "";

    const base = String(siteUrl ?? "").replace(/\/$/, "");

    const url = `${base}${localPath("/order-status", l)}?order=${encodeURIComponent(number)}`;

    return `<div style="margin-top:18px;font-size:13px;line-height:1.6;color:#6b7280">`
        + mailText(l, "lookup", {
            link: `<a href="${escapeHtml(url)}" style="color:#111827;font-weight:600">${escapeHtml(mailText(l, "lookupLink"))}</a>`,
            number: escapeHtml(number)
        })
        + `</div>`;

}

export function orderLetter(order, siteUrl) {

    const l = mailLang(order?.lang);

    const number = String(order?.order_number ?? "");

    const totals = [
        Number(order?.subtotal) > 0 ? row(mailText(l, "subtotal"), escapeHtml(localMoney(order.subtotal, l))) : "",
        Number(order?.discount) > 0 ? row(mailText(l, "discount"), "−" + escapeHtml(localMoney(order.discount, l))) : "",
        Number(order?.delivery_price) > 0 ? row(mailText(l, "delivery"), escapeHtml(localMoney(order.delivery_price, l))) : "",
        // Від порогу відправку оплачує магазин — це варто сказати в
        // листі прямо: інакше людина приготує гроші для пошти.
        !(Number(order?.delivery_price) > 0) && freeDeliveryApplies(order?.total)
            ? row(mailText(l, "delivery"), escapeHtml(mailText(l, "freeDelivery")))
            : "",
        row(mailText(l, "total"), escapeHtml(localMoney(order?.total, l)), true)
    ].join("");

    const delivery = [
        // Не «Доставка»: цей блок і так називається «Доставка», а
        // рядок «Доставка / Доставка: Нова пошта» читається як помилка.
        order?.delivery_method ? deliveryRow(mailText(l, "method"), escapeHtml(valueText(order.delivery_method, l))) : "",
        order?.delivery_city ? deliveryRow(mailText(l, "city"), escapeHtml(order.delivery_city)) : "",
        order?.delivery_detail ? deliveryRow(mailText(l, "branch"), escapeHtml(order.delivery_detail)) : "",
        order?.payment_method ? deliveryRow(mailText(l, "payment"), escapeHtml(valueText(order.payment_method, l))) : ""
    ].join("");

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        mailText(l, "orderIntro", { number: escapeHtml(number) }),
        `</div>`,
        itemsTable(order?.items, l),
        `<table style="width:100%;border-collapse:collapse">${totals}</table>`,
        delivery
            ? `<div style="margin-top:18px;font-weight:600;font-size:14px">${escapeHtml(mailText(l, "delivery"))}</div>`
                + `<table style="width:100%;border-collapse:collapse">${delivery}</table>`
            : "",
        lookupLine(number, siteUrl, l)
    ].join("");

    return {
        subject: mailText(l, "orderSubject", { number }),
        html: letterShell(mailText(l, "orderTitle"), body, siteUrl, l)
    };

}

// Лист про зміну статусу. Текст той самий, що бачить покупець із бота
// (customerStatusMessage у format.js) — інакше два канали розповідали
// б різне.
export function statusLetter(order, status, siteUrl) {

    const l = mailLang(order?.lang);

    const number = String(order?.order_number ?? "");

    const n = { number: escapeHtml(number) };
    const ttn = order?.tracking_number;

    const url = trackingUrl(ttn);

    const button = url
        ? `<div style="margin-top:20px"><a href="${escapeHtml(url)}" `
            + `style="display:inline-block;background:#111827;color:#fff;text-decoration:none;`
            + `padding:12px 20px;border-radius:8px;font-size:14px">${escapeHtml(mailText(l, "track"))}</a></div>`
        : "";

    switch (String(status || "").toLowerCase()) {

        case "processing":
            return {
                subject: mailText(l, "processingSubject", { number }),
                html: letterShell(mailText(l, "processingTitle"),
                    `<div style="font-size:15px;line-height:1.6">${mailText(l, "processingText", n)}</div>`
                    + summaryBlock(order),
                    siteUrl, l)
            };

        case "shipped":
            return {
                subject: mailText(l, "shippedSubject", { number }),
                html: letterShell(mailText(l, "shippedTitle"),
                    `<div style="font-size:15px;line-height:1.6">${mailText(l, "shippedText", n)}`
                    + (ttn
                        ? `<br><br>${mailText(l, "ttn", { ttn: escapeHtml(ttn) })}`
                        : `<br><br>${mailText(l, "ttnLater")}`)
                    // Порядок тут не косметика.
                    //
                    // Gmail ховає «обрізаний вміст» — те, що повторює
                    // попередній лист у тій самій темі (а власник може
                    // виправити накладну й надіслати лист удруге). Ріже
                    // він ХВІСТ. Тому найважливіше стоїть вище: номер
                    // накладної, потім склад, і лише потім кнопка з
                    // підвалом — те, що можна втратити без шкоди.
                    + `</div>` + summaryBlock(order) + button,
                    siteUrl, l)
            };

        case "completed":
            return {
                subject: mailText(l, "completedSubject", { number }),
                html: letterShell(mailText(l, "completedTitle"),
                    `<div style="font-size:15px;line-height:1.6">${mailText(l, "completedText", n)}</div>`
                    + summaryBlock(order),
                    siteUrl, l)
            };

        case "cancelled":
            return {
                subject: mailText(l, "cancelledSubject", { number }),
                html: letterShell(mailText(l, "cancelledTitle"),
                    `<div style="font-size:15px;line-height:1.6">${mailText(l, "cancelledText", n)}</div>`
                    + summaryBlock(order),
                    siteUrl, l)
            };

        default:
            // «Нове» покупцеві не повідомляють: він щойно оформив
            // замовлення й уже отримав лист-підтвердження.
            return null;

    }

}

// Лист «ви залишили щось у кошику».
//
// НАВІЩО. Кошик авторизованого покупця вже лежить у базі — сайт
// синхронізує його, щоб людина бачила ті самі товари на телефоні й на
// комп'ютері. Але далі з ним не відбувалось нічого: наповнив кошик,
// закрив вкладку — і все.
//
// Це найдешевший спосіб повернути людину, яка вже все обрала: вона
// прийшла сама, товар обрала сама, лишилось нагадати.
//
// ЧОМУ ЛИСТ ОДИН. Другий лист про ті самі три товари це вже не
// нагадування, а надокучання — і найкоротший шлях у спам. Тому в
// тексті прямо сказано, що він один.
export function cartLetter(items, siteUrl) {

    const list = Array.isArray(items) ? items : [];

    if (!list.length) return null;

    const site = String(siteUrl || "").replace(/\/+$/, "");

    const total = list.reduce(function (sum, item) {
        return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
    }, 0);

    const button = site
        ? `<div style="margin-top:22px"><a href="${escapeHtml(site)}/cart" `
            + `style="display:inline-block;background:#111827;color:#fff;text-decoration:none;`
            + `padding:12px 22px;border-radius:8px;font-size:14px">Повернутись до кошика</a></div>`
        : "";

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        list.length === 1
            ? "У вашому кошику лишився товар — ми його зберегли."
            : "У вашому кошику лишились товари — ми їх зберегли.",
        `</div>`,
        itemsTable(list),
        `<table style="width:100%;border-collapse:collapse">`,
        row("Разом", escapeHtml(money(total)), true),
        `</table>`,
        button,
        `<div style="margin-top:20px;font-size:13px;line-height:1.6;color:#6b7280">`,
        "Це єдине нагадування — більше про цей кошик ми не напишемо.",
        " Якщо ви передумали, просто не звертайте уваги.",
        `</div>`
    ].join("");

    return {
        subject: list.length === 1 ? "Ви залишили товар у кошику" : "Ви залишили товари у кошику",
        html: letterShell("Ваш кошик чекає 🛍", body, siteUrl)
    };

}

// Незавершене ОФОРМЛЕННЯ — не те саме, що брошений кошик.
//
// ЧОМУ ОКРЕМИЙ ЛИСТ, А НЕ cartLetter
// -----------------------------------
// Людина не просто поклала товар у кошик — вона відкрила оформлення й
// заповнила пошту. Тобто дійшла на крок далі, ніж «подивлюсь потім»,
// і лист має говорити саме про це: не «ваш кошик чекає», а «ви не
// завершили замовлення». Кнопка веде на оформлення, а не в кошик.
//
// ЧОМУ ТУТ ВЗАГАЛІ Є ПРО РОЗСИЛКУ
// --------------------------------
// Це єдиний лист магазину, який приходить людині, що НЕ реєструвалась
// і НЕ підписувалась. Тому в ньому прямо сказано, чому він прийшов і
// що адресу не додали в розсилку: людина має розуміти це з листа, а
// не здогадуватись (умови — у міграції 020).
export function checkoutLetter(items, siteUrl) {

    const list = Array.isArray(items) ? items : [];

    if (!list.length) return null;

    const site = String(siteUrl || "").replace(/\/+$/, "");

    const total = list.reduce(function (sum, item) {
        return sum + (Number(item.price) || 0) * (Number(item.qty) || 1);
    }, 0);

    const button = site
        ? `<div style="margin-top:22px"><a href="${escapeHtml(site)}/checkout" `
            + `style="display:inline-block;background:#111827;color:#fff;text-decoration:none;`
            + `padding:12px 22px;border-radius:8px;font-size:14px">Завершити замовлення</a></div>`
        : "";

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        "Ви почали оформлювати замовлення й не завершили — ",
        list.length === 1 ? "товар ми зберегли." : "товари ми зберегли.",
        " Якщо щось не вийшло, просто відповідайте на цей лист: допоможемо оформити.",
        `</div>`,
        itemsTable(list),
        `<table style="width:100%;border-collapse:collapse">`,
        row("Разом", escapeHtml(money(total)), true),
        `</table>`,
        button,
        `<div style="margin-top:20px;font-size:13px;line-height:1.6;color:#6b7280">`,
        "Ви отримали цей лист, бо залишили свою пошту на сторінці оформлення",
        " замовлення. Це єдине нагадування, і до розсилки магазину ваша",
        " адреса не додана. Якщо ви передумали — просто не звертайте уваги.",
        `</div>`
    ].join("");

    return {
        subject: "Ви не завершили замовлення",
        html: letterShell("Завершити замовлення?", body, siteUrl)
    };

}

// Запит до сервісу розсилки.
//
// Повертає null, якщо надсилати нічим або нікуди — тоді функція просто
// не шле листа. Магазин без листів працює; магазин, який падає через
// недоступну пошту, — ні.
// Прохання написати відгук.
//
// items — склад замовлення (той самий знімок, що в базі). Показуємо
// його з фото: людина мусить згадати, про що йдеться, не відкриваючи
// сайт.
//
// ПОСИЛАННЯ ВЕДЕ НА СТОРІНКУ ТОВАРУ, А НЕ НА ЯКУСЬ ФОРМУ. Форма живе
// там же, під відгуками, і просить номер замовлення — тому кладемо
// його в адресу, щоб людині лишилось ввести телефон.
export function reviewLetter(order, siteUrl) {

    const l = mailLang(order?.lang);

    const number = String(order?.order_number ?? "");

    const base = String(siteUrl ?? "").replace(/\/$/, "");

    const items = Array.isArray(order?.items) ? order.items.slice(0, 6) : [];

    const rows = items.map((item) => {

        const title = escapeHtml((l !== "uk" && item?.title_local) || item?.title || "");

        // Посилання на конкретний товар: у нього ж і треба написати
        // відгук. Без slug лишається просто рядок — це нормально,
        // знімок замовлення міг бути зроблений до появи slug.
        const url = item?.slug
            ? `${base}${localPath("/p/", l)}${encodeURIComponent(item.slug)}/?order=${encodeURIComponent(number)}#productReviews`
            : "";

        const photo = item?.image
            ? `<img src="${escapeHtml(item.image)}" width="64" alt="${title}"`
                + ` style="display:block;border:0;border-radius:8px;max-width:64px;height:auto">`
            : "";

        const cell = "padding:10px 0;border-top:1px solid #e5e7eb";

        return `<tr>`
            + `<td style="${cell};width:76px">${photo}</td>`
            + `<td style="${cell}">`
            + (url
                ? `<a href="${escapeHtml(url)}" style="color:#111827;font-weight:600;text-decoration:none">${title}</a>`
                : `<b>${title}</b>`)
            + (url
                ? `<div style="margin-top:6px"><a href="${escapeHtml(url)}" style="color:#2f6fb3">${escapeHtml(mailText(l, "reviewWrite"))}</a></div>`
                : "")
            + `</td>`
            + `</tr>`;

    }).join("");

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        mailText(l, "reviewIntro", { number: escapeHtml(number) }),
        `</div>`,
        `<div style="margin-top:14px;font-size:15px;line-height:1.6">`,
        mailText(l, "reviewAsk"),
        `</div>`,
        rows ? `<table style="width:100%;border-collapse:collapse;margin-top:18px">${rows}</table>` : "",
        `<div style="margin-top:18px;font-size:13px;line-height:1.6;color:#6b7280">`,
        mailText(l, "reviewNote", { number: escapeHtml(number) }),
        `</div>`,
    ].join("");

    return {
        subject: mailText(l, "reviewSubject", { number }),
        html: letterShell(mailText(l, "reviewTitle"), body, siteUrl, l)
    };

}

// Лист «дякуємо за покупку» з персональним промокодом.
//
// НАВІЩО. Найдешевший покупець — той, що вже один раз заплатив. Після
// «Виконано» магазин з ним більше не говорив ніколи.
//
// ЧОМУ ОКРЕМО ВІД ПРОХАННЯ ПРО ВІДГУК. Покласти знижку в той самий
// лист означало б запропонувати гроші за відгук — і виглядало б саме
// так, незалежно від того, що код дається безумовно.
//
// ЩО В ЛИСТІ Є І ЧОГО НЕМАЄ. Є код, розмір знижки й дата, до якої він
// діє. Немає зворотного відліку, «залишилось 3 години» й іншого
// тиску: строк тут потрібен, щоб код не жив вічно, а не щоб квапити.
export function thankYouLetter(order, promo, siteUrl) {

    const l = mailLang(order?.lang);

    const name = String(order?.first_name ?? "").trim();

    const code = String(promo?.code ?? "").trim();

    const percent = Number(promo?.percent) || 0;

    const base = String(siteUrl ?? "").replace(/\/$/, "");

    // Дату пишемо словами: «до 12.10.2026» читається як реквізит, а
    // «до 12 жовтня» — як речення.
    const months = mailText(l, "months");

    const until = promo?.expiresAt ? new Date(promo.expiresAt) : null;

    const untilText = until && !Number.isNaN(until.getTime())
        ? (l === "en" ? `${months[until.getMonth()]} ${until.getDate()}` : `${until.getDate()} ${months[until.getMonth()]}`)
        : "";

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        name ? mailText(l, "thanksHello", { name: escapeHtml(name) }) : mailText(l, "thanksHelloAnon"),
        mailText(l, "thanksWish"),
        `</div>`,

        `<div style="margin-top:14px;font-size:15px;line-height:1.6">`,
        mailText(l, "thanksOffer"),
        `</div>`,

        // Код великим моноширинним: його переписують руками з листа в
        // поле на сайті, і саме тут люди помиляються.
        `<div style="margin:20px 0;padding:18px;border:2px dashed #d1d5db;border-radius:12px;text-align:center">`,
        `<div style="font:800 26px/1.2 ui-monospace,Menlo,Consolas,monospace;letter-spacing:2px">`,
        escapeHtml(code),
        `</div>`,
        `<div style="margin-top:8px;font-size:15px;color:#374151">`,
        mailText(l, "thanksPercent", { percent: escapeHtml(String(percent)) }),
        untilText ? mailText(l, "thanksUntil", { date: escapeHtml(untilText) }) : "",
        `</div>`,
        `</div>`,

        `<div style="text-align:center;margin-top:18px">`,
        `<a href="${escapeHtml(base)}${localPath("/catalog", l)}" style="display:inline-block;background:#111827;`,
        `color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600">`,
        escapeHtml(mailText(l, "thanksButton")),
        `</a>`,
        `</div>`,

        `<div style="margin-top:20px;font-size:13px;line-height:1.6;color:#6b7280">`,
        escapeHtml(mailText(l, "thanksHow")),
        `</div>`,
    ].join("");

    return {
        subject: mailText(l, "thanksSubject", { percent, code }),
        html: letterShell(mailText(l, "thanksTitle"), body, siteUrl, l),
    };

}

// Лист підтвердження підписки на розсилку.
//
// ЧОМУ ВІН ТУТ, А НЕ В MAILERLITE
// --------------------------------
// MailerLite шле свій — англійською, «Confirm your email address», —
// і відредагувати його на безкоштовному тарифі не можна: кнопка
// «Редагувати» в панелі закрита підказкою «доступно лише в платних
// тарифах». Людина щойно залишила пошту українському магазину й
// отримує лист чужою мовою від назви, яку бачила вперше. Такі не
// відкривають — а без відкриття підписка назавжди лишається
// «unconfirmed»: у списку є, листів не отримує.
//
// ЧОМУ ПІДТВЕРДЖЕННЯ ВЗАГАЛІ ПОТРІБНЕ
// ------------------------------------
// Поштову адресу в форму може вписати будь-хто — свою чи чужу.
// Єдине, що відрізняє згоду від чужого жарту, — перехід за
// посиланням із самої скриньки. Це ж захищає й репутацію
// відправника: листи, на які не підписувались, відмічають як спам, і
// далі не доходять уже нічиї.
//
// ЩО В ЛИСТІ Є І ЧОГО НЕМАЄ
// --------------------------
// Є одна дія й пряма адреса під кнопкою — на випадок, якщо кнопка не
// натиснеться (буває в поштових клієнтах, які ріжуть розмітку).
// Немає знижки за підтвердження, зворотного відліку й «залишилось 3
// години»: людина ще нічого нам не винна, і квапити її нема за що.
//
// Є рядок «якщо це були не ви». Без нього лист, що прийшов на чужу
// адресу, виглядає як спам від магазину — і саме так його й
// відмітять.
export function subscribeConfirmLetter(confirmUrl, siteUrl, lang) {

    const l = mailLang(lang);

    const url = String(confirmUrl ?? "").trim();

    if (!url) return null;

    const safe = escapeHtml(url);

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        mailText(l, "subscribeIntro"),
        `</div>`,

        // Кнопка таблицею, а не <a> з padding: Outlook ігнорує
        // відступи на посиланні й малює його звичайним рядком
        // тексту. Той самий прийом, що в листах входу в кабінет.
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 0">`,
        `<tr><td style="background:#111827;border-radius:10px">`,
        `<a href="${safe}" style="display:inline-block;padding:14px 28px;`,
        `font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">`,
        escapeHtml(mailText(l, "subscribeButton")),
        `</a>`,
        `</td></tr>`,
        `</table>`,

        // Адреса текстом — для клієнтів, які ріжуть кнопки, і для
        // тих, хто перед переходом дивиться, куди саме веде.
        `<div style="margin-top:18px;font-size:12px;line-height:1.5;color:#6b7280;`,
        `text-align:center;word-break:break-all">`,
        `${escapeHtml(mailText(l, "copyLink"))}<br>`,
        `<a href="${safe}" style="color:#6b7280">${safe}</a>`,
        `</div>`,

        `<div style="margin-top:22px;padding-top:18px;border-top:1px solid #e5e7eb;`,
        `font-size:13px;line-height:1.6;color:#6b7280">`,
        mailText(l, "subscribeNote"),
        `<br><br>`,
        mailText(l, "subscribeIgnore"),
        `</div>`,
    ].join("");

    return {
        subject: mailText(l, "subscribeSubject"),
        html: letterShell(mailText(l, "subscribeTitle"), body, siteUrl, l),
    };

}

// Лист «підтвердіть пошту», який надсилаємо МИ, а не Supabase.
//
// НАВІЩО СВІЙ, КОЛИ В SUPABASE Є СВІЙ
// ------------------------------------
// Бо його лист у цьому випадку не працює. Подробиці — у
// telegram-login.js, розділ про додавання пошти. Коротко: Supabase
// вимагає підтвердження ще й зі СТАРОЇ адреси, а в того, хто увійшов
// через Telegram, стара адреса службова й не існує.
//
// І текст у нього не про те. Людина не міняє пошту — вона додає її
// вперше, і лист про «зміну пошти» зі згадкою службової адреси
// пояснює рівно нічого. Цей каже, що сталось насправді.
export function addEmailLetter(confirmUrl, email, siteUrl) {

    const url = String(confirmUrl ?? "").trim();
    const mail = String(email ?? "").trim();

    if (!url || !mail) return null;

    const safe = escapeHtml(url);

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        `У кабінеті BestBrnd4u ви входите через Telegram — пошти в акаунті `,
        `не було. Ви попросили додати цю адресу: <strong>${escapeHtml(mail)}</strong>.`,
        `</div>`,

        `<div style="margin-top:12px;font-size:15px;line-height:1.6">`,
        `Лишилось підтвердити, що скринька ваша. Після цього листи про `,
        `замовлення приходитимуть сюди, а входити можна буде і через `,
        `Telegram, і за цією адресою.`,
        `</div>`,

        // Кнопка таблицею, а не <a> з padding: Outlook ігнорує
        // відступи на посиланні й малює його звичайним рядком тексту.
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto 0">`,
        `<tr><td style="background:#111827;border-radius:10px">`,
        `<a href="${safe}" style="display:inline-block;padding:14px 28px;`,
        `font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">`,
        `Підтвердити адресу`,
        `</a>`,
        `</td></tr>`,
        `</table>`,

        `<div style="margin-top:18px;font-size:12px;line-height:1.5;color:#6b7280;`,
        `text-align:center;word-break:break-all">`,
        `Кнопка не працює? Скопіюйте адресу:<br>`,
        `<a href="${safe}" style="color:#6b7280">${safe}</a>`,
        `</div>`,

        `<div style="margin-top:22px;padding-top:18px;border-top:1px solid #e5e7eb;`,
        `font-size:13px;line-height:1.6;color:#6b7280">`,
        `Посилання діє годину й спрацьовує з одного акаунту — того, з якого `,
        `адресу вписали.`,
        `<br><br>`,
        `Якщо це були не ви — просто видаліть лист. Доки за посиланням не `,
        `перейшли, у вашому акаунті нічого не змінюється.`,
        `</div>`,
    ].join("");

    return {
        subject: "Підтвердіть email для кабінету BestBrnd4u",
        html: letterShell("Підтвердіть адресу ✉️", body, siteUrl),
    };

}

export function mailRequest(config, letter) {

    const to = String(config?.to || "").trim();
    const from = String(config?.from || "").trim();

    if (!to || !from || !letter || !letter.subject) return null;

    // Відповідь покупця мусить дійти до людини, а не в noreply.
    const replyTo = String(config?.replyTo || "").trim() || SHOP_EMAIL;

    if (config?.resendKey) {

        return {
            provider: "resend",
            url: "https://api.resend.com/emails",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.resendKey}`
            },
            body: {
                from,
                to: [to],
                reply_to: replyTo,
                subject: letter.subject,
                html: letter.html
            }
        };

    }

    if (config?.brevoKey) {

        // Brevo хоче ім'я та адресу окремо. Приймаємо і «Магазин
        // <shop@example.com>», і просту адресу.
        const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);

        return {
            provider: "brevo",
            url: "https://api.brevo.com/v3/smtp/email",
            headers: {
                "Content-Type": "application/json",
                "api-key": config.brevoKey
            },
            body: {
                sender: match
                    ? { name: match[1] || "BestBrnd4u", email: match[2] }
                    : { name: "BestBrnd4u", email: from },
                to: [{ email: to }],
                replyTo: { email: replyTo },
                subject: letter.subject,
                htmlContent: letter.html
            }
        };

    }

    return null;

}
