// Відмова від товару: вигляд вікна і доставка фото.
//
// Обидві помилки з цього набору мають спільну рису — вони НЕ схожі на
// помилки. Вікно відкривалось, лист приходив; збоїло те, що видно лише
// уважному оку: розсипана верстка й відсутнє вкладення при рядку «Фото
// додано: 1».
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Порівнюємо з КОДОМ, а не з поясненнями: у коментарях обидві колишні
// помилки названі своїми іменами, і наївний пошук по тексту знаходив би
// саме їх.
const strip = text => text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const account = strip(read("assets/js/account.js"));
const dialog = strip(read("assets/js/refusal-dialog.js"));
const css = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, "");

console.log("\n[1] Прапорець не ламає рядок товару");
{
    // Угорі style.css є правило під текстові поля:
    //     input, textarea, select { width:100%; padding:14px 16px }
    // Типу воно не розрізняє, тому діставало й прапорець у вікні: той
    // розтягувався на всю ширину рядка і видавлював фото, назву й ціну
    // в вузьку смужку праворуч.
    check("загальне правило для полів справді широке",
        /input,\s*\n?textarea,\s*\n?select\{[^}]*width:100%/.test(css));

    check("прапорець вікна має власний розмір",
        /\.refusal-item input\[type="checkbox"\]\{[^}]*width:18px/.test(css));

    // Головне: прапорець не має розтягуватись на вільне місце.
    check("прапорець не росте й не стискається",
        /\.refusal-item input\[type="checkbox"\]\{[^}]*flex:0 0 auto/.test(css));

    check("зайвий padding знято",
        /\.refusal-item input\[type="checkbox"\]\{[^}]*padding:0/.test(css));

    // Ціна лізла на назву саме тому, що місця не лишалось.
    check("ціна притиснута до правого краю",
        /\.refusal-item-sum\{[^}]*margin-left:auto/.test(css));

    check("довгі назви переносяться, а не розсувають рядок",
        /\.refusal-item-info b\{[^}]*overflow-wrap:anywhere/.test(css));
}

console.log("\n[2] Фото доїжджає до магазину");
{
    // Було: FormData на /ajax/-адресу. Лист приходив з усіма полями й
    // рядком «Фото додано: 1» — але без самого фото.
    check("фото більше не йдуть на /ajax/",
        !/formsubmit\.co\/ajax\/\$\{FORMSUBMIT_TARGET\}`,\s*\{\s*method: "POST",\s*headers: \{ Accept/.test(account));

    check("надсилається справжня форма",
        /form\.enctype = "multipart\/form-data"/.test(account));

    // Сторінка при цьому нікуди не переходить.
    check("форма йде в прихований iframe",
        /form\.target = frameName/.test(account) && /frame\.style\.display = "none"/.test(account));

    // FormSubmit чекає на поле attachment — «Фото 1» він не розпізнає.
    check("перше поле зветься attachment",
        /index === 0 \? "attachment" : `attachment\$\{index \+ 1\}`/.test(account));

    // Кілька файлів під одним іменем звичайний бекенд лишає лише
    // останнім, тому кожен знімок окремим полем.
    check("кожен знімок окремим полем",
        /new DataTransfer\(\)/.test(account) && /data\.items\.add\(file\)/.test(account));

    // Без цього FormSubmit показує капчу замість прийому — а в
    // прихованому iframe її ніхто не побачить і не пройде.
    check("капча вимкнена", /hidden\("_captcha", "false"\)/.test(account));

    // Файли беруться з того самого поля, у яке їх обрали.
    check("вікно віддає поле з файлами вузлом",
        /fileInput: fileInput/.test(dialog));

    check("поле забирається з вікна до його знищення",
        /fileInput\.remove\(\);[\s\S]{0,200}close\(\{/.test(dialog));
}

console.log("\n[3] Мовчазної втрати листа бути не може");
{
    // Якщо форма не дійшла, магазин мусить хоча б дізнатись про
    // відмову: людина вже бачить «менеджер зв'яжеться» і чекає.
    check("є запасний шлях", /if \(sent\) return;/.test(account));

    check("запасний лист чесно каже про фото",
        /НЕ долетіли, попросіть у покупця окремо/.test(account));

    // Прибирати форму до відповіді означало б обірвати запит.
    check("форма живе до відповіді",
        /frame\.addEventListener\("load", \(\) => finish\(true\), \{ once: true \}\)/.test(account));

    check("є межа очікування", /setTimeout\(\(\) => finish\(false\), 30000\)/.test(account));

    // Порожній iframe теж викликає load одразу після вставки — якби
    // слухач стояв раніше, «відповідь» прийшла б до надсилання.
    check("load слухаємо вже після надсилання",
        /form\.submit\(\);[\s\S]{0,200}frame\.addEventListener\("load"/.test(account));
}

console.log("\n[4] Статус замовлення після відмови");
{
    const sql = read("supabase/migrations/006-refusal-items-and-status.sql");

    // Було: покупець відмовився, під товаром «✓ Відмову надіслано» — а
    // бейдж замовлення далі каже «Нове». Виглядає так, ніби відмову не
    // почули. Те саме бачив магазин у списку замовлень.
    check("статус рахується з урахуванням відмови",
        /function displayOrderStatus/.test(account)
        && /order-status-\$\{displayStatus\}/.test(account));

    check("повна відмова → скасовано",
        /return order\.status === "completed" \? "returned" : "cancelled"/.test(account));

    // Часткова відмова замовлення не скасовує: решта товарів їде як
    // їхала, і назвати таке замовлення скасованим означало б збрехати.
    check("часткова відмова статус не міняє",
        /if \(!isOrderFullyRefused\(order\)\) return order\.status \|\| "new";/.test(account));

    check("для часткової відмови окремий текст",
        /решта замовлення лишається/.test(account));

    // Скасувати можна те, що ще не виконали. Доставлене — повертають, і
    // це інша робота: прийняти посилку, оглянути товар, віддати гроші.
    check("доставлене замовлення не «скасовується»",
        /returned: "Повернення"/.test(account)
        && /when full_ref and status <> 'completed' then 'cancelled'/.test(sql));

    check("бейдж повернення має свій вигляд",
        /\.order-status-returned\{/.test(css));
}

console.log("\n[5] База знає, від чого саме відмова");
{
    const sql = read("supabase/migrations/006-refusal-items-and-status.sql");

    // Раніше заявка зберігала лише order_id і user_id: перелік позицій
    // і причина жили тільки в листі, тобто в пошті, а не в системі.
    check("перелік позицій зберігається", /add column if not exists items jsonb/.test(sql));

    check("причина зберігається", /note: reason \|\| null/.test(account));

    // Міграції тут застосовують руками. Поки цього не зробили, запит із
    // невідомою колонкою відхиляється ЦІЛКОМ — тобто нове поле могло б
    // зламати саму відмову.
    check("невідома колонка не ламає відмову",
        /unknownColumn/.test(account)
        && /insert\(\{ \.\.\.base, note: reason \|\| null \}\)/.test(account));

    // Позначка мусить стояти на ТОМУ товарі, від якого відмовились:
    // інакше від решти вже не можна відмовитись, хоча про них ніхто не
    // говорив.
    check("позначка на конкретному товарі",
        /if \(isItemRefused\(order, item\)\)/.test(account));

    // Номер у списку прив'язаний до порядку, а він може змінитись —
    // тоді відмова «переїхала» б на сусідній товар.
    check("позиції звіряються за назвою й варіантом, а не за номером",
        /function orderItemKey/.test(account)
        && /item\.title, item && item\.color, item && item\.size/.test(account));

    // Заявка створювалась одразу по натисканню — закрив вікно, а
    // відмова вже в базі й менеджеру пішло сповіщення про те, чого не
    // було.
    const dialogAt = account.indexOf("RefusalDialog.ask");
    const saveAt = account.indexOf("await saveRefusal");

    check("заявка створюється після вікна, а не до нього",
        dialogAt > 0 && saveAt > 0 && dialogAt < saveAt);
}

console.log("\n[6] Повторна заявка на той самий товар неможлива");
{
    // Після надісланої заявки кнопка під тим товаром зникала — але
    // картка не перемальовувалась, і вікно, відкрите з СУСІДНЬОГО
    // товару, показувало повний склад із усіма галочками. Відмітити
    // щойно відмовлений товар удруге ніщо не заважало: летів другий лист
    // і друге сповіщення менеджеру про те саме повернення.
    check("вікно знає, що вже відмовлено",
        /RefusalDialog\.ask\(order, itemIndex, alreadyRefused\)/.test(account));

    check("відмовлену позицію не можна відмітити",
        /alreadySent \? ' disabled' : ''/.test(dialog));

    check("і вона не позначається наперед",
        /index === preselectedIndex && !alreadySent/.test(dialog));

    // Рядок лишається в списку: вікно показує СКЛАД замовлення, і зникла
    // позиція читалась би як помилка.
    check("рядок лишається видимим із поясненням",
        /Заявку вже надіслано/.test(dialog) && /\.refusal-item-sent\{/.test(css));

    // disabled знімається інструментами розробника — тому ще одна
    // перевірка вже після вибору.
    check("вибір перевіряється ще раз",
        /return !refused\.has\(itemKey\(item\)\); \}\)/.test(dialog));

    // Стан беремо з бази, а не зі сторінки: вкладка, відкрита зі вчора,
    // про сьогоднішню заявку не знає.
    const attachAt = account.indexOf("await attachRefusals([order])");
    const askAt = account.indexOf("RefusalDialog.ask(order, itemIndex, alreadyRefused)");

    check("стан звіряється з базою перед вікном",
        attachAt > 0 && askAt > 0 && attachAt < askAt,
        `attach=${attachAt}, ask=${askAt}`);

    check("клац по вже відмовленому товару нічого не надсилає",
        /Заявку на цей товар уже надіслано/.test(account));

    // Між відкриттям вікна й «Надіслати» минає час — заявку могли подати
    // з іншої вкладки.
    check("перед надсиланням список фільтрується ще раз",
        /choice\.items = \(choice\.items \|\| \[\]\)[\s\S]{0,120}!alreadyRefused\.has/.test(account));

    check("порожній список не надсилається",
        /Заявку на ці товари вже надіслано/.test(account));

    // Після заявки міняється не лише кнопка: позначка на товарі, статус
    // замовлення, рядок про часткову відмову.
    check("картка перемальовується цілком",
        /await refreshOrderCard\(button, order\)/.test(account));

    check("розгорнута картка лишається розгорнутою",
        /rebuilt\.classList\.add\("expanded"\)/.test(account)
        && /details\.hidden = false/.test(account));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
