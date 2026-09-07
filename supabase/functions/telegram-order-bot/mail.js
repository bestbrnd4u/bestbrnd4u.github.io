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

import { escapeHtml, money, trackingUrl } from "./format.js";

// Загальний вигляд листа.
//
// Верстка навмисно проста й inline: клієнти пошти вирізають <style>,
// не знають flex і по-різному розуміють майже все інше. Лист, який
// зламався в Outlook, гірший за лист без оформлення.
function letterShell(title, bodyHtml, siteUrl) {

    const site = String(siteUrl || "").replace(/\/+$/, "");

    return [
        '<div style="margin:0;padding:24px;background:#f3f4f6;',
        'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">',
        '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">',
        `<div style="font-size:20px;font-weight:700;letter-spacing:-.01em;margin-bottom:18px">${escapeHtml(title)}</div>`,
        bodyHtml,
        '<div style="margin-top:26px;padding-top:18px;border-top:1px solid #e5e7eb;',
        'font-size:13px;line-height:1.6;color:#6b7280">',
        site ? `<a href="${escapeHtml(site)}" style="color:#111827">BestBrnd4u</a> · ` : "BestBrnd4u · ",
        '<a href="https://t.me/bestbrnd4u" style="color:#111827">Telegram</a> · ',
        '<a href="mailto:bestbrnd4u@proton.me" style="color:#111827">bestbrnd4u@proton.me</a>',
        '<br>Пн–Нд 09:00–20:00',
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
function row(label, value, strong) {

    const labelStyle = strong
        ? "padding:8px 0 0;font-size:14px;font-weight:700"
        : "padding:4px 0;color:#6b7280;font-size:14px";

    const valueStyle = strong
        ? "padding:8px 0 0;text-align:right;font-size:14px;font-weight:700"
        : "padding:4px 0;text-align:right;font-size:14px";

    return `<tr>`
        + `<td style="${labelStyle}">${escapeHtml(label)}</td>`
        + `<td style="${valueStyle}">${value}</td>`
        + `</tr>`;

}

function itemsTable(items) {

    const list = Array.isArray(items) ? items : [];

    if (!list.length) return "";

    const rows = list.map(item => {

        const variant = [item.color, item.size].filter(Boolean).join(" / ");

        return `<tr><td style="padding:8px 0;border-top:1px solid #e5e7eb;font-size:14px">`
            + `${escapeHtml(item.title || "")}`
            + (item.brand ? `<br><span style="color:#6b7280">${escapeHtml(item.brand)}</span>` : "")
            + (variant ? `<br><span style="color:#6b7280">${escapeHtml(variant)}</span>` : "")
            + `</td><td style="padding:8px 0;border-top:1px solid #e5e7eb;text-align:right;font-size:14px;white-space:nowrap">`
            + `${item.qty ?? 1} × ${escapeHtml(money(item.price))}`
            + `</td></tr>`;

    }).join("");

    return `<table style="width:100%;border-collapse:collapse;margin:14px 0">${rows}</table>`;

}

// Лист «замовлення прийнято».
export function orderLetter(order, siteUrl) {

    const number = String(order?.order_number ?? "");

    const totals = [
        Number(order?.subtotal) > 0 ? row("Сума товарів", escapeHtml(money(order.subtotal))) : "",
        Number(order?.discount) > 0 ? row("Знижка", "−" + escapeHtml(money(order.discount))) : "",
        Number(order?.delivery_price) > 0 ? row("Доставка", escapeHtml(money(order.delivery_price))) : "",
        row("Разом", escapeHtml(money(order?.total)), true)
    ].join("");

    const delivery = [
        // Не «Доставка»: цей блок і так називається «Доставка», а
        // рядок «Доставка / Доставка: Нова пошта» читається як помилка.
        order?.delivery_method ? row("Спосіб", escapeHtml(order.delivery_method)) : "",
        order?.delivery_city ? row("Місто", escapeHtml(order.delivery_city)) : "",
        order?.delivery_detail ? row("Відділення", escapeHtml(order.delivery_detail)) : "",
        order?.payment_method ? row("Оплата", escapeHtml(order.payment_method)) : ""
    ].join("");

    const body = [
        `<div style="font-size:15px;line-height:1.6">`,
        `Дякуємо за замовлення <b>${escapeHtml(number)}</b>! Ми вже його бачимо `,
        `й найближчим часом зв'яжемось, щоб підтвердити деталі.`,
        `</div>`,
        itemsTable(order?.items),
        `<table style="width:100%;border-collapse:collapse">${totals}</table>`,
        delivery
            ? `<div style="margin-top:18px;font-weight:600;font-size:14px">Доставка</div>`
                + `<table style="width:100%;border-collapse:collapse">${delivery}</table>`
            : ""
    ].join("");

    return {
        subject: `Замовлення ${number} прийнято`,
        html: letterShell("Замовлення прийнято 🎉", body, siteUrl)
    };

}

// Лист про зміну статусу. Текст той самий, що бачить покупець із бота
// (customerStatusMessage у format.js) — інакше два канали розповідали
// б різне.
export function statusLetter(order, status, siteUrl) {

    const number = String(order?.order_number ?? "");
    const ttn = order?.tracking_number;

    const url = trackingUrl(ttn);

    const button = url
        ? `<div style="margin-top:20px"><a href="${escapeHtml(url)}" `
            + `style="display:inline-block;background:#111827;color:#fff;text-decoration:none;`
            + `padding:12px 20px;border-radius:8px;font-size:14px">Відстежити посилку</a></div>`
        : "";

    switch (String(status || "").toLowerCase()) {

        case "processing":
            return {
                subject: `Замовлення ${number} прийнято в роботу`,
                html: letterShell("Замовлення в роботі 👌",
                    `<div style="font-size:15px;line-height:1.6">Ваше замовлення <b>${escapeHtml(number)}</b> `
                    + `прийнято в роботу. Ми зв'яжемось із вами найближчим часом, щоб підтвердити деталі.</div>`,
                    siteUrl)
            };

        case "shipped":
            return {
                subject: `Замовлення ${number} відправлено`,
                html: letterShell("Замовлення відправлено 📦",
                    `<div style="font-size:15px;line-height:1.6">Замовлення <b>${escapeHtml(number)}</b> вже в дорозі.`
                    + (ttn
                        ? `<br><br>Номер накладної: <b>${escapeHtml(ttn)}</b>`
                        : `<br><br>Номер накладної надішлемо окремо.`)
                    + `</div>${button}`,
                    siteUrl)
            };

        case "completed":
            return {
                subject: `Замовлення ${number} виконано`,
                html: letterShell("Замовлення виконано 🎉",
                    `<div style="font-size:15px;line-height:1.6">Замовлення <b>${escapeHtml(number)}</b> виконано. `
                    + `Дякуємо за покупку — будемо раді бачити вас знову!</div>`,
                    siteUrl)
            };

        case "cancelled":
            return {
                subject: `Замовлення ${number} скасовано`,
                html: letterShell("Замовлення скасовано",
                    `<div style="font-size:15px;line-height:1.6">Замовлення <b>${escapeHtml(number)}</b> скасовано. `
                    + `Якщо це помилка — просто напишіть нам, ми все виправимо.</div>`,
                    siteUrl)
            };

        default:
            // «Нове» покупцеві не повідомляють: він щойно оформив
            // замовлення й уже отримав лист-підтвердження.
            return null;

    }

}

// Запит до сервісу розсилки.
//
// Повертає null, якщо надсилати нічим або нікуди — тоді функція просто
// не шле листа. Магазин без листів працює; магазин, який падає через
// недоступну пошту, — ні.
export function mailRequest(config, letter) {

    const to = String(config?.to || "").trim();
    const from = String(config?.from || "").trim();

    if (!to || !from || !letter || !letter.subject) return null;

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
                subject: letter.subject,
                htmlContent: letter.html
            }
        };

    }

    return null;

}
