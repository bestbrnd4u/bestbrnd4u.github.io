// ЧАТ НА САЙТІ: ПОКУПЕЦЬ ПИШЕ ТУТ, ВЛАСНИК ВІДПОВІДАЄ З TELEGRAM
//
// ЩО ТУТ НАЙВАЖЛИВІШЕ
// --------------------
// Чат — єдине місце, де сторонній може писати в нашу базу без
// замовлення й без реєстрації. Тому половина перевірок не про те, чи
// гарно він виглядає, а про те, чи не стане він діркою:
//
//   токен нитки мусить бути саме uuid, а не що завгодно в запиті;
//   чуже посилання не має потрапити в повідомлення власнику;
//   написане людиною не має стати розміткою ні на сайті, ні в Telegram;
//   без токена не віддаємо нічого.
//
// І окремо — обіцянки. Сайт і бот кажуть людині про години роботи
// кожен від себе; розійдуться — хтось із них бреше.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;

const check = (name, condition, extra) => {
    if (condition) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
};

const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

function loadModule(rel, names) {

    const src = read(rel)
        .replace(/^export\s+/gm, "")
        .concat("\nmodule.exports = { " + names.join(", ") + " };");

    const module = { exports: {} };

    new Function("module", "exports", src)(module, module.exports);

    return module.exports;

}

const CHAT = loadModule("supabase/functions/telegram-order-bot/chat.js", [
    "cleanChatBody", "cleanThreadId", "cleanChatPage", "formatChatMessage",
    "withinWorkingHours", "chatGreeting", "CHAT_LIMITS", "CHAT_HOURS"
]);

const МОДУЛЬ = read("assets/js/contact-buttons.js");
const ФУНКЦІЯ = read("supabase/functions/telegram-order-bot/_index.src.ts");
const CSS = read("assets/css/style.css").replace(/\/\*[\s\S]*?\*\//g, " ");
const МІГРАЦІЯ = read("supabase/migrations/039-site-chat.sql");


console.log("\n[1] Текст повідомлення чистимо, але не калічимо");
{
    const { cleanChatBody, CHAT_LIMITS } = CHAT;

    check("звичайний текст проходить",
        cleanChatBody("Чи є 38 розмір?") === "Чи є 38 розмір?");

    // Переноси рядків людина ставить свідомо — у питанні про кілька
    // товарів вони і є структурою.
    check("переноси рядків зберігаються",
        cleanChatBody("перше\nдруге") === "перше\nдруге");

    check("CRLF зводиться до LF", cleanChatBody("перше\r\nдруге") === "перше\nдруге");

    check("порожнє відкидається", cleanChatBody("") === null);
    check("самі пробіли відкидаються", cleanChatBody("   \n\t ") === null);
    check("відсутнє відкидається", cleanChatBody(undefined) === null);

    // Вставлене з месенджера часто тягне керівні символи; у Telegram
    // вони ламають розмітку.
    check("керівні символи вирізаються",
        cleanChatBody("а\u0000б\u0007в") === "абв");

    const довге = "я".repeat(CHAT_LIMITS.body + 500);

    check("довге ріжеться по межі",
        cleanChatBody(довге).length === CHAT_LIMITS.body);
}


console.log("\n[2] Токен нитки — тільки uuid");
{
    const { cleanThreadId } = CHAT;

    const добрий = "2f1c8a3e-5b4d-4e6f-9a0b-1c2d3e4f5a6b";

    check("справжній uuid проходить", cleanThreadId(добрий) === добрий);

    check("великі літери зводяться до малих",
        cleanThreadId(добрий.toUpperCase()) === добрий);

    // ЦЕ ЙДЕ В ЗАПИТ ДО БАЗИ. Без перевірки сюди можна покласти що
    // завгодно — фільтр PostgREST, зайве поле, кому з новим правилом.
    check("довільний рядок відкидається", cleanThreadId("1 or 1=1") === null);
    check("фільтр PostgREST відкидається", cleanThreadId("eq.1&select=*") === null);
    check("порожнє відкидається", cleanThreadId("") === null);
    check("число відкидається", cleanThreadId(42) === null);
    check("майже uuid відкидається", cleanThreadId(добрий.slice(0, -1)) === null);
}


console.log("\n[3] Сторінка в повідомленні власнику — тільки своя");
{
    const { cleanChatPage } = CHAT;

    check("свій шлях проходить", cleanChatPage("/p/gucci-sumka/") === "/p/gucci-sumka/");
    check("з параметрами проходить", cleanChatPage("/catalog?section=new") === "/catalog?section=new");

    // Та сама пастка, що в зворотному дзвінку: «//evil.example» теж
    // починається зі скісної, а Telegram підсвічує схоже на домен
    // посиланням.
    check("протокол-відносна відкидається", cleanChatPage("//evil.example") === "");
    check("чужа адреса відкидається", cleanChatPage("https://evil.example") === "");
    check("розмітка відкидається", cleanChatPage('/x"><b>') === "");
}


console.log("\n[4] Те, що написала людина, не стає розміткою");
{
    const { formatChatMessage } = CHAT;

    const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const текст = formatChatMessage('<b>жирним</b> і <a href="x">посилання</a>',
        { page: "/catalog", first: true }, esc);

    check("теги екрановано", !/<b>жирним<\/b>/.test(текст), текст.slice(0, 80));
    check("посилання екрановано", !/<a href="x">/.test(текст));

    // Власна розмітка картки лишається: заголовок має бути жирним.
    check("розмітка самої картки ціла", /<b>/.test(текст));

    check("перше повідомлення позначене як нове", /Нове питання/.test(текст));

    check("наступні — без «нове»",
        !/Нове питання/.test(formatChatMessage("ще", { page: "", first: false }, esc)));

    // БЕЗ ЦЬОГО РЯДКА ЧАТ НЕ ПРАЦЮЄ ВЗАГАЛІ: власник не здогадається,
    // що відповідати треба саме реплаєм, і напише звичайним
    // повідомленням у порожнечу.
    check("картка каже, що відповідати треба реплаєм", /реплаєм/.test(текст));

    check("сторінка в картці є", /\/catalog/.test(текст));
}


console.log("\n[5] Робочі години: сайт і бот кажуть одне");
{
    const { withinWorkingHours, chatGreeting, CHAT_HOURS } = CHAT;

    check("о 10 ранку — робочий час", withinWorkingHours(10) === true);
    check("о 9 рівно — уже робочий", withinWorkingHours(9) === true);
    check("о 19:xx — ще робочий", withinWorkingHours(19) === true);
    check("о 20 рівно — уже ні", withinWorkingHours(20) === false);
    check("о 3 ночі — ні", withinWorkingHours(3) === false);

    // Невідому годину вважаємо робочою: краще не лякати людину
    // «неробочим часом» через збій Intl у її браузері.
    check("невідома година не лякає", withinWorkingHours(NaN) === true);

    // ТА САМА ОБІЦЯНКА В ДВОХ МІСЦЯХ.
    //
    // Сайт рахує годину сам (Intl, Europe/Kyiv) і має сказати те
    // саме, що сказав би сервер. Розійдуться — панель обіцятиме
    // відповідь за кілька хвилин о другій ночі.
    const вНочі = chatGreeting(3);
    const вДень = chatGreeting(12);

    check("сайт має обидва тексти привітання",
        МОДУЛЬ.includes(вНочі) && МОДУЛЬ.includes(вДень),
        `нічний: ${МОДУЛЬ.includes(вНочі)}, денний: ${МОДУЛЬ.includes(вДень)}`);

    // Межі теж мусять збігатись, бо в браузері вони написані числами.
    const межіВМодулі = МОДУЛЬ.match(/г >= (\d+) && г < (\d+)/);

    check("межі годин у сайті ті самі, що на сервері",
        !!межіВМодулі
        && Number(межіВМодулі[1]) === CHAT_HOURS.from
        && Number(межіВМодулі[2]) === CHAT_HOURS.to,
        межіВМодулі ? `${межіВМодулі[1]}–${межіВМодулі[2]} проти ${CHAT_HOURS.from}–${CHAT_HOURS.to}` : "не знайшов");

    check("час беремо київський, а не годинник відвідувача",
        /timeZone:\s*"Europe\/Kyiv"/.test(МОДУЛЬ));
}


console.log("\n[6] Панель чату на справжньому DOM");

function підняти() {

    const dom = new JSDOM("<!doctype html><body></body>", {
        runScripts: "outside-only",
        url: "https://bestbrnd4u.com/catalog"
    });

    const { window } = dom;

    if (!window.requestAnimationFrame) {
        window.requestAnimationFrame = cb => window.setTimeout(cb, 0);
    }

    // matchMedia у jsdom немає, а модуль питає про тип вказівника.
    if (!window.matchMedia) {
        window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
    }

    window.eval(МОДУЛЬ);

    return window;

}

{
    const window = підняти();
    const d = window.document;

    check("стрічка листування створена", !!d.getElementById("chatLog"));
    check("поле повідомлення створене", !!d.getElementById("chatInput"));
    check("форма створена", !!d.getElementById("chatForm"));

    const log = d.getElementById("chatLog");

    // Читалка мусить озвучити відповідь, коли вона приходить. Без
    // цього чат для незрячого — поле, у яке пишеш у порожнечу.
    check("стрічка озвучується читалкою",
        log.getAttribute("role") === "log" && log.getAttribute("aria-live") === "polite",
        `role=${log.getAttribute("role")} aria-live=${log.getAttribute("aria-live")}`);

    check("стрічка підписана", !!log.getAttribute("aria-label"));

    const поле = d.getElementById("chatInput");

    check("поле має підпис для читалки",
        !!d.querySelector('label[for="chatInput"]'));

    check("довжина обмежена тією самою межею",
        Number(поле.getAttribute("maxlength")) === CHAT.CHAT_LIMITS.body,
        поле.getAttribute("maxlength"));

    check("кнопка надсилання підписана",
        !!d.querySelector(".chat-send[aria-label]"));
}


console.log("\n[7] Написане людиною не стає розміткою на сторінці");
{
    // Відповідь приходить із сервера, а туди — з Telegram. Якщо
    // стрічка малюється через innerHTML, достатньо надіслати тег, щоб
    // зіпсувати сторінку тому, хто чекає відповіді.
    const window = підняти();
    const d = window.document;

    // Вмикаємо панель і підсовуємо власну відповідь замість мережі.
    const шматок = МОДУЛЬ.match(/function домалювати\(повідомлення\)\s*\{[\s\S]*?\n    \}/);

    check("функцію малювання знайдено", !!шматок);

    window.eval((шматок || [""])[0]
        + "\nwindow.__draw = домалювати;"
        + "\nwindow.__log = document.getElementById('chatLog');");

    // Функція спирається на зовнішні змінні — перевіряємо інакше:
    // просто вимагаємо, щоб у ній не було innerHTML із тілом.
    const тіло = (шматок || [""])[0];

    check("тіло повідомлення ставиться через textContent",
        /textContent\s*=\s*повідомлення\.body/.test(тіло), тіло.slice(0, 120));

    check("innerHTML для тіла не використовується",
        !/innerHTML\s*=\s*повідомлення\.body/.test(тіло));

    // Довге слово без пробілів не має розсувати панель, а переноси
    // мають лишатись переносами.
    //
    // ШУКАЄМО В ПРАВИЛІ, А НЕ У ВСЬОМУ ФАЙЛІ. overflow-wrap:anywhere
    // стоїть у стилях ще чотири рази, у геть інших місцях, — і
    // перевірка «чи є таке десь» лишалась зеленою, коли я навмисно
    // прибрав її з чату. Зловив на власному ж сценарії.
    const правилоТіла = (CSS.match(/\.chat-msg-body\{([^}]*)\}/) || [, ""])[1];

    check("правило тіла повідомлення знайдено", !!правилоТіла.trim());

    check("переноси зберігаються у вигляді",
        /white-space\s*:\s*pre-wrap/.test(правилоТіла), правилоТіла.replace(/\s+/g, " "));

    check("довге слово не розсуває панель",
        /overflow-wrap\s*:\s*anywhere/.test(правилоТіла), правилоТіла.replace(/\s+/g, " "));
}


console.log("\n[8] Сервер: без токена не віддаємо нічого");
{
    // handleChatPoll мусить спершу знайти нитку й лише потім читати
    // повідомлення. Інакше запит без токена поверне чужу переписку.
    const poll = (ФУНКЦІЯ.match(/async function handleChatPoll[\s\S]*?\n}/) || [""])[0];

    check("обробник опитування знайдено", poll.length > 0);

    const нитка = poll.indexOf("loadThread");
    const читання = poll.indexOf("chat_messages?thread_id");

    check("нитка перевіряється ДО читання повідомлень",
        нитка > -1 && читання > -1 && нитка < читання,
        `loadThread на ${нитка}, читання на ${читання}`);

    check("без нитки повертається порожньо, а не помилка",
        /if \(!thread\)[\s\S]{0,200}messages: \[\]/.test(poll));

    // loadThread сам чистить токен — саме там стоїть єдина перевірка.
    check("токен чиститься в loadThread",
        /async function loadThread[\s\S]{0,200}cleanThreadId/.test(ФУНКЦІЯ));
}


console.log("\n[9] Сервер: відповідь власника знаходить свою нитку");
{
    const reply = (ФУНКЦІЯ.match(/async function handleChatReply[\s\S]*?\n}/) || [""])[0];

    check("обробник відповіді знайдено", reply.length > 0);

    // ЧУЖИЙ РЕПЛАЙ НЕ МАЄ ПОТРАПИТИ В ЧАТ. У боті реплаєм
    // відповідають і на картку замовлення, і на відгук.
    check("відповідає лише власник", /isOwner\(message\?\.chat\?\.id\)/.test(reply));

    check("без реплаю обробник пропускає далі",
        /if \(!replyTo\) return false/.test(reply));

    check("реплай на чуже повідомлення пропускається далі",
        /if \(!threadId\) return false/.test(reply));

    check("нитка шукається за tg_message_id",
        /tg_message_id=eq\./.test(reply));

    // Власник мусить знати, що відповідь пішла. Інакше він вважає,
    // що відповів, а людина не отримала нічого.
    check("порожня відповідь не мовчить", /Порожню відповідь не надсилаю/.test(reply));
    check("збій запису не мовчить", /Не вдалося зберегти відповідь/.test(reply));

    check("є спосіб заблокувати настирливого", /chatblock/.test(reply));

    // Порядок у handleMessage: найточніший обробник перший.
    const порядок = ФУНКЦІЯ.indexOf("handleChatReply(message)");
    const замовлення = ФУНКЦІЯ.indexOf("handleOrderText(message)");

    check("перевіряється ДО кроків оформлення",
        порядок > -1 && замовлення > -1 && порядок < замовлення,
        `чат на ${порядок}, оформлення на ${замовлення}`);
}


console.log("\n[10] Сервер: чат не стає діркою в базі");
{
    const send = (ФУНКЦІЯ.match(/async function handleChatSend[\s\S]*?\n}\n\n\/\/ САЙТ ПИТАЄ/) || [""])[0];

    check("обробник надсилання знайдено", send.length > 0);

    // МЕЖА НА ОБОХ ШЛЯХАХ, А НЕ ЛИШЕ НА СТВОРЕННІ НИТКИ.
    //
    // Так було спершу: нову нитку рахували по IP, а далі — тільки по
    // нитці, 30 на годину. Отже, створивши двадцять ниток, можна було
    // надіслати 620 повідомлень у Telegram за годину з однієї адреси.
    //
    // Перевірка стоїть ДО розгалуження «нова / наявна», тобто одна на
    // обидва випадки.
    const межа = send.indexOf("contactAllowed(request,");
    const розгалуження = send.indexOf("if (!thread) {");

    check("звернення обмежене на обох шляхах", межа > -1 && межа < розгалуження,
        `межа на ${межа}, розгалуження на ${розгалуження}`);

    check("нова нитка й повідомлення рахуються окремо",
        /перше \? "chat-new" : "chat-msg"/.test(send));

    // Друга межа, по самій нитці. Потрібні обидві: межа по IP не знає
    // про /chatblock, а межа по нитці обходиться новою ниткою.
    check("наявна нитка обмежена ще й по нитці", /rpc\/chat_allowed/.test(send));

    check("сторінка чиститься перед записом", /cleanChatPage\(body\.page\)/.test(send));
    check("текст чиститься перед записом", /cleanChatBody\(body\.body\)/.test(send));

    // Якщо Telegram не прийняв — власник не дізнається, а людина
    // чекає. Це поломка, і про неї має бути запис.
    check("відмова Telegram потрапляє в журнал",
        /reportServerIssue\("site_chat"/.test(send));

    // Таблиці закриті геть для всіх, крім службового ключа.
    check("RLS увімкнено на обох таблицях",
        /alter table public\.chat_threads\s+enable row level security/.test(МІГРАЦІЯ)
        && /alter table public\.chat_messages enable row level security/.test(МІГРАЦІЯ));

    check("політик RLS немає жодної",
        !/create policy/i.test(МІГРАЦІЯ));

    check("межу не можна покликати з браузера",
        /revoke execute on function public\.chat_allowed\(uuid\) from anon/.test(МІГРАЦІЯ));
}


console.log("\n[11a] Закрили панель — опитування спиняється");
{
    // ЦЕ БУЛО ЗЛАМАНО, І ЗНАЙШЛОСЬ ЛИШЕ В БРАУЗЕРІ.
    //
    // Закриття панелі ЗАПУСКАЛО опитування замість того, щоб спинити:
    // обробник чату дивився на panel.hidden, а док знімає й ставить
    // його через 200мс, щоб панель доїхала анімацію. У тому ж кліку
    // hidden ще false — тобто «панель відкрита», — і код ішов у гілку
    // відкриття.
    //
    // Заміряно: два запити за сім секунд ПІСЛЯ закриття.
    //
    // Перевіряємо не «чи є перевірка в коді», а поведінку: ловимо
    // справжній обробник таймера й питаємо, чи він зупиниться.
    const dom = new JSDOM("<!doctype html><body></body>", {
        runScripts: "outside-only",
        url: "https://bestbrnd4u.com/catalog"
    });

    const { window } = dom;

    if (!window.requestAnimationFrame) window.requestAnimationFrame = cb => window.setTimeout(cb, 0);
    if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });

    // Підміняємо таймер ДО запуску модуля: так дістанемось до самого
    // обробника, не чекаючи пʼять секунд у тесті.
    const тики = [];
    let наступний = 1;
    const живі = new Set();

    window.setInterval = function (cb) {
        const id = наступний++;
        тики.push({ id, cb });
        живі.add(id);
        return id;
    };

    window.clearInterval = function (id) { живі.delete(id); };

    window.eval(МОДУЛЬ);

    const d = window.document;
    const кнопка = d.getElementById("dockChat");

    // Відкриваємо.
    кнопка.dispatchEvent(new window.Event("click", { bubbles: true }));

    check("після відкриття таймер заведено", тики.length > 0, String(тики.length));

    check("панель вважається відкритою",
        кнопка.getAttribute("aria-expanded") === "true");

    const тик = тики[тики.length - 1];

    check("таймер живий, поки панель відкрита", живі.has(тик.id));

    // Рахуємо ДО кліку. Рахувати після — і порівняння стає
    // порівнянням числа з самим собою; саме на цьому моя ж перевірка
    // спершу й була зелена на зламаному коді.
    const булоТиків = тики.length;

    // Закриваємо тією самою кнопкою.
    кнопка.dispatchEvent(new window.Event("click", { bubbles: true }));

    check("aria-expanded одразу false — не через 200мс",
        кнопка.getAttribute("aria-expanded") === "false");

    // Головне: панель закрита, hidden ЩЕ не знято (анімація триває).
    check("hidden ще не знято — саме тут і була пастка",
        d.getElementById("dockChatPanel").hidden === false);

    check("закриття НЕ завело новий таймер",
        тики.length === булоТиків, `${булоТиків} → ${тики.length}`);

    // А тепер хай спрацює той, що лишився.
    тик.cb();

    check("тик побачив закриту панель і спинився", !живі.has(тик.id),
        "таймер лишився живим після закриття");
}


console.log("\n[11] Опитування не б'є по функції без потреби");
{
    // Кожен запит — це виклик Edge Function. Опитування «про всяк
    // випадок» на кожній сторінці для кожного відвідувача коштувало б
    // стільки ж, скільки весь інший сайт.
    // Поведінку цієї умови перевіряє [11a] на справжньому таймері.
    // Тут — лише те, що умова взагалі стоїть У САМОМУ ТИКУ: без неї
    // опитування спиняється тільки в тих місцях, де ми не забули
    // його спинити, а забути легко — способів закрити панель чотири.
    const тик = (МОДУЛЬ.match(/таймер = window\.setInterval\(function \(\)\s*\{[\s\S]*?\}, ПЕРІОД_ОПИТУВАННЯ\);/) || [""])[0];

    check("тик сам питає, чи панель відкрита",
        /if \(!панельВідкрита\(\)\) \{ зупинитиОпитування\(\); return; \}/.test(тик),
        тик.replace(/\s+/g, " ").slice(0, 110));

    check("схована вкладка опитування спиняє",
        /visibilitychange/.test(МОДУЛЬ) && /document\.hidden\) зупинитиОпитування/.test(МОДУЛЬ));

    check("на завантаженні питаємо лише тих, у кого розмова вже є",
        /if \(нитка\) опитати\(false\)/.test(МОДУЛЬ));

    // Та перевірка не має гасити крапку: панель закрита, відповіді
    // людина ще не бачила.
    check("перевірка на завантаженні не позначає прочитаним",
        /опитати\(false\)/.test(МОДУЛЬ));

    const період = (МОДУЛЬ.match(/var ПЕРІОД_ОПИТУВАННЯ = (\d+)/) || [])[1];

    check("період опитування не частіший за 5 секунд",
        Number(період) >= 5000, період);
}




console.log("\n[12] Крапка «є відповідь»");
{
    // Людина написала, закрила панель, пішла дивитись каталог.
    // Відповідь прийшла — без крапки вона про це не дізнається.
    check("крапка малюється на кнопці", /\.dock-btn\.has-unread::after\{/.test(CSS));

    check("крапка ставиться з непрочитаних",
        /крапку\(!бачене && дані\.unseen > 0\)/.test(МОДУЛЬ));

    check("відкрили панель — крапка гасне", /крапку\(false\)/.test(МОДУЛЬ));

    // unseen рахує ЛИШЕ відповіді власника: своє ж повідомлення
    // крапки викликати не має.
    check("рахуються лише відповіді власника",
        /seen === false && r\.author === "owner"/.test(ФУНКЦІЯ));
}


console.log("\n[13] Токен розмови не світиться в адресі");
{
    // Адреси лишаються в історії браузера, у заголовку Referer і в
    // журналах будь-якого стороннього, до кого веде посилання. Токен
    // нитки — це ключ до всієї переписки.
    check("токен зберігається в localStorage", /localStorage\.setItem\(КЛЮЧ_НИТКИ/.test(МОДУЛЬ));

    check("токен не кладеться в адресу",
        !/history\.(pushState|replaceState)[\s\S]{0,120}нитка/.test(МОДУЛЬ)
        && !/location\.search[\s\S]{0,60}нитка/.test(МОДУЛЬ));

    // Приватне вікно й заблоковані дані сайту кидають виняток на
    // самому зверненні до localStorage.
    check("звернення до сховища в try/catch",
        /try \{ return window\.localStorage\.getItem/.test(МОДУЛЬ)
        && /try \{ window\.localStorage\.setItem/.test(МОДУЛЬ));
}


// ==================================================================
// ОСТАННІЙ БЛОК — АСИНХРОННИЙ
//
// Тут модуль сам ходить по мережі (точніше, по підміненому fetch), і
// результат приходить обіцянкою. Усе синхронне вже відпрацювало
// вище, тож підсумок друкуємо після цього блока.
// ==================================================================

console.log("\n[14] Повернувся на сайт — побачив, що відповіли");

(async function () {

    // ЦЕ НАЙВАЖЛИВІШИЙ СЦЕНАРІЙ ЧАТУ, І ЙОГО ЛЕГКО НЕ ПОМІТИТИ.
    //
    // Людина написала ввечері, закрила вкладку й пішла. Власник
    // відповів уночі. Наступного дня вона заходить на сайт — і якщо
    // крапки немає, то про відповідь дізнається, лише здогадавшись
    // відкрити панель. Тобто не дізнається.
    //
    // Перевіряємо справжній шлях: токен у сховищі, модуль
    // запускається, САМ робить одне опитування й ставить крапку.
    const dom = new JSDOM("<!doctype html><body></body>", {
        runScripts: "outside-only",
        url: "https://bestbrnd4u.com/catalog"
    });

    const { window } = dom;

    if (!window.requestAnimationFrame) window.requestAnimationFrame = cb => window.setTimeout(cb, 0);
    if (!window.matchMedia) window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });

    const ТОКЕН = "2f1c8a3e-5b4d-4e6f-9a0b-1c2d3e4f5a6b";

    window.localStorage.setItem("bb4u_chat_thread", ТОКЕН);

    // Адресу функції модуль бере з глобальних, які кладе
    // supabase-client.js. У jsdom їх немає — підкладаємо.
    window.eval('var SUPABASE_URL = "https://example.test";'
        + ' var SUPABASE_PUBLISHABLE_KEY = "test";');

    const запити = [];

    window.fetch = function (url, opt) {

        запити.push(JSON.parse((opt && opt.body) || "{}"));

        return Promise.resolve({
            json: () => Promise.resolve({
                ok: true,
                messages: [{ id: 7, author: "owner", body: "Так, є в наявності", seen: false }],
                unseen: 1
            })
        });

    };

    window.eval(МОДУЛЬ);

    // Даємо обіцянці доїхати.
    await new Promise(r => window.setTimeout(r, 60));

    const d = window.document;
    const кнопка = d.getElementById("dockChat");

    check("на завантаженні зроблено рівно одне опитування",
        запити.length === 1, JSON.stringify(запити));

    check("опитування пішло за збереженим токеном",
        !!запити[0] && запити[0].thread === ТОКЕН, запити[0] && запити[0].thread);

    // seen:false — панель закрита, людина відповіді ще не бачила.
    // Поставити true означало б погасити крапку до того, як її
    // хтось побачив.
    check("прочитаним не позначаємо",
        !!запити[0] && запити[0].seen === false, String(запити[0] && запити[0].seen));

    check("на кнопці зʼявилась крапка",
        кнопка.classList.contains("has-unread"), кнопка.className);

    check("відповідь намальована в стрічці",
        /Так, є в наявності/.test(d.getElementById("chatLog").textContent));

    // А тепер людина відкриває панель — крапка має згаснути.
    кнопка.dispatchEvent(new window.Event("click", { bubbles: true }));

    check("відкрили панель — крапка згасла",
        !кнопка.classList.contains("has-unread"), кнопка.className);

    // Друге опитування вже з seen:true — тепер побачене справді
    // побачене.
    await new Promise(r => window.setTimeout(r, 60));

    const останнє = запити[запити.length - 1];

    check("відкрита панель позначає прочитаним",
        !!останнє && останнє.seen === true, String(останнє && останнє.seen));

    // Відповідь не має продублюватись: друге опитування приносить те
    // саме повідомлення, бо since відстає на один запит.
    check("повідомлення не продублювалось",
        d.getElementById("chatLog").querySelectorAll(".chat-msg").length === 1,
        String(d.getElementById("chatLog").querySelectorAll(".chat-msg").length));

    console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
    process.exit(failures === 0 ? 0 : 1);

})();
