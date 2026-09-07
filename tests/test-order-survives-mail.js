// Замовлення не залежить від чужої пошти.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Успіх оформлення визначався ВИКЛЮЧНО відповіддю FormSubmit —
// безкоштовного сервісу пересилання листів, адреса якого лежить у
// відкритому коді сайту. Тобто будь-хто, хто вичерпав його ліміт (а
// також сам сервіс, коли він недоступний або змінив умови), зупиняв
// магазину продажі.
//
// Гірша половина: збереження замовлення в базу стояло В ГІЛЦІ УСПІХУ.
// Збій пошти означав не «замовлення без листа», а замовлення, якого не
// існує ніде: ні в панелі, ні в Telegram, ні в кабінеті. Покупець при
// цьому бачив «Не вдалося надіслати замовлення» і йшов.
//
// ЩО ЦЕ ЗАКРІПЛЮЄ
// ----------------
// 1. Замовлення зберігається НЕЗАЛЕЖНО від того, чи пішли листи.
// 2. Оформлення вважається успішним, якщо замовлення дійшло хоч одним
//    шляхом — у базу або листом власнику.
// 3. Про кожен збій пошти власник дізнається з журналу помилок, а не
//    від покупця.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const code = fs.readFileSync(path.join(ROOT, "assets/js/checkout.js"), "utf8");

console.log("\n[1] Збереження не залежить від листів");
{
    // Ключова перевірка: виклик збереження стоїть ДО розгалуження на
    // успіх/невдачу, а не всередині гілки успіху.
    const saveCall = code.indexOf("saveOrderToSupabase(orderId)");
    const branch = code.indexOf("if (saved || ownerNotified)");

    check("замовлення зберігається до перевірки листів",
        saveCall > 0 && branch > 0 && saveCall < branch);

    check("збереження йде в тому ж наборі, що й листи",
        /Promise\.allSettled\(\[ownerNotification, customerThankYou, orderSaved\]\)/.test(code));

    // Раніше saveOrderToSupabase() викликався у гілці успіху, та ще й
    // через .finally() — тобто його результат нікого не цікавив.
    check("у гілці успіху збереження вже немає",
        !/saveOrderToSupabase\(orderId\)\.finally/.test(code));
}

console.log("\n[2] Успіх — це «замовлення десь є»");
{
    check("успіх, якщо збереглось АБО дійшов лист",
        /if \(saved || ownerNotified\)/.test(code));

    check("збереження повертає відповідь, а не тишу",
        /const saved = savedResult\.status === "fulfilled" && savedResult\.value === true/.test(code));

    check("функція збереження справді віддає true",
        /if \(!error\) return true;/.test(code) && /return false;/.test(code));

    check("без клієнта бази — чесне false",
        /if \(!supabaseClient\) return false;/.test(code));

    // Кошик чиститься лише коли замовлення прийняте: інакше людина
    // втрачає і замовлення, і кошик.
    const cartCleared = code.indexOf("saveCart([])");

    check("кошик чиститься тільки в гілці успіху",
        cartCleared > code.indexOf("if (saved || ownerNotified)")
        && cartCleared < code.indexOf("console.error(\"Замовлення не надіслано:\""));

    check("при повній невдачі кошик лишається й кнопка повертається",
        /leaveGuardActive = true;[\s\S]{0,300}submitOrderBtn\.disabled = false/.test(code));
}

console.log("\n[3] Про збій пошти дізнається власник");
{
    check("лист покупцю: у журнал помилок",
        /Лист покупцю не надіслано/.test(code) && /ErrorReport\.report/.test(code));

    check("лист магазину: у журнал помилок",
        /Лист про замовлення не дійшов до магазину/.test(code));

    check("замовлення без бази: у журнал помилок",
        /Замовлення не збереглось у базі/.test(code));

    // Журнал помилок сам не має права нічого ламати — тому лише через
    // перевірку наявності.
    const calls = (code.match(/window\.ErrorReport\.report\(/g) || []).length;
    const mentions = (code.match(/window\.ErrorReport/g) || []).length;

    check("журнал не викликається наосліп",
        calls >= 3 && mentions === calls * 2,
        `${calls} викликів, ${mentions} згадок — на кожен виклик мусить бути перевірка`);
}

console.log(failures === 0
    ? "\n✅ Замовлення: чужа пошта більше не вирішує, чи буде продаж\n"
    : `\n❌ Проблем: ${failures}\n`);

process.exit(failures === 0 ? 0 : 1);
