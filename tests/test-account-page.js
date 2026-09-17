// Особистий кабінет: підсумок замовлення, вкладки, пошта, згода.
//
// ЩО ТУТ ЗАКРІПЛЕНО
// ------------------
// 1. ПІДСУМОК ЗАМОВЛЕННЯ ЧИТАЄТЬСЯ ОДНИМ ПОГЛЯДОМ. Рядки «Сума
//    товарів … 14 300 грн» розтягувались на всю ширину картки: на
//    широкому екрані між підписом і числом лишалось понад тисячу
//    пікселів порожнечі, і очі бігали від краю до краю.
//
// 2. ВИДАЛЕННЯ АКАУНТУ НЕМАЄ. Кнопка обіцяла «видалити назавжди», а
//    стирала лише профіль, адреси й обране: сам обліковий запис у
//    Supabase Auth лишався, бо для нього потрібен service-role ключ.
//    Обіцянка, яку код не виконує, гірша за її відсутність.
//
// 3. ПОШТУ МОЖНА ЗМІНИТИ, АЛЕ ЛИШЕ ЧЕРЕЗ ЛИСТ. Пошта — це логін і
//    адреса для листів про замовлення. Помилка в ній відрізає людину
//    від акаунту, тому Supabase міняє її тільки після переходу за
//    посиланням із листа на НОВУ адресу.
//
// 4. ЗГОДА НА ОБРОБКУ ДАНИХ — ГАЛОЧКА Й ПОСИЛАННЯ, А НЕ ДРІБНИЙ
//    ТЕКСТ. І вона не проставлена заздалегідь: згода, якої людина не
//    ставила, згодою не є.
//
// 5. ПІДПИСКА ПРАЦЮЄ НА ДВОХ ФОРМАХ. Одна у футері, друга в кабінеті.
//    Шукати їх за id означало б дві копії логіки — разом із п'ятьма
//    різними відповідями про стан підписки.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const html = read("account.html");

// КАРТКА ВХОДУ ЖИВЕ У ДВОХ ФАЙЛАХ.
//
// Спільну поведінку (провайдери, Telegram, переклад помилок) винесено
// в assets/js/auth-widget.js: та сама картка стоїть ще й на оформленні
// замовлення, і двома копіями цей код прожив би до першої правки.
//
// Перевірки нижче — про те, що поведінка ІСНУЄ, а не про те, у якому
// файлі вона лежить. Тому читаємо обидва разом.
const js = read("assets/js/account.js")
    + read("assets/js/auth-widget.js");
const css = read("assets/css/style.css");
const subscribe = read("assets/js/subscribe.js");

// Тіло правила з style.css за точним селектором.
//
// ПРИВ'ЯЗКА ДО ПОЧАТКУ РЯДКА ОБОВ'ЯЗКОВА. Без неї пошук
// «.subscribe-consent input[type="checkbox"]» знаходив
// «.subscribe-account .subscribe-consent input[type="checkbox"]» —
// той самий рядок є підрядком довшого селектора. Тест читав тіло
// чужого правила й чесно повідомляв, що там немає ширини.
const ruleBody = selector => {

    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const re = new RegExp("(?:^|\\n)" + escaped + "\\s*\\{([^}]*)\\}");

    const found = css.replace(/\/\*[\s\S]*?\*\//g, "").match(re);

    return found ? found[1] : null;

};

console.log("\n[1] Підсумок замовлення — вузькою колонкою, не на всю картку");
{
    const body = ruleBody(".order-card-summary");

    check("правило знайдено", Boolean(body));

    // fit-content, а не кругле число: блок звужується рівно до
    // найдовшого свого рядка. Заміряно на 1600px: 240px замість 1526,
    // розрив між підписом і числом 89–123px замість ~1375.
    check("ширина по вмісту, а не на всю картку",
        Boolean(body && /width:\s*fit-content/.test(body)),
        body || "");

    check("є нижня межа, щоб рядки не злипались",
        Boolean(body && /min-width:\s*\d+px/.test(body)));

    // На телефоні картка вужча за 240px бути не може, але max-width
    // тут страхує від горизонтальної прокрутки.
    check("на вузькому екрані не вилазить за картку",
        Boolean(body && /max-width:\s*100%/.test(body)));
}

console.log("\n[2] Вкладки кабінету");
{
    const TABS = ["orders", "addresses", "profile", "newsletter", "password"];

    TABS.forEach(name => {

        check(`вкладка ${name} є в розмітці`,
            new RegExp(`data-tab="${name}"`).test(html));

        check(`  і панель ${name}Panel теж`,
            new RegExp(`id="${name}Panel"`).test(html));

    });

    // Перемикач мусить знати про ВСІ панелі. Раніше він перелічував
    // три айдішники окремими рядками — четверта вкладка відкривалась
    // би поверх третьої. Тому перелік один, і він тут звіряється з
    // розміткою: додали вкладку, а в перелік не внесли — набір скаже.
    const list = (js.match(/\[((?:"[a-z]+",?\s*)+)\]\.forEach\(name => \{\s*const panel/) || [])[1] || "";

    check(`перемикач знає всі ${TABS.length} вкладок`,
        TABS.every(name => list.includes(`"${name}"`)),
        list || "переліку не знайдено");
}

console.log("\n[3] Видалення акаунту прибрано повністю");
{
    check("кнопки немає", !/deleteAccountBtn/.test(html) && !/deleteAccountBtn/.test(js));

    check("вікна підтвердження немає", !/deleteAccountModal/.test(html));

    // Найважливіше: жодного коду, який стирає профіль «назавжди».
    check("коду видалення профілю немає",
        !/from\("profiles"\)\.delete\(\)/.test(js),
        "повернувся код, який стирає профіль, але не акаунт");
}

console.log("\n[4] «Вийти з акаунту» — поруч зі «Зберегти зміни»");
{
    const row = html.match(/<div class="profile-actions-row">[\s\S]*?<\/div>/);

    check("рядок дій існує", Boolean(row));

    check("у ньому обидві кнопки",
        Boolean(row && /profileSubmit/.test(row[0]) && /logoutBtn/.test(row[0])),
        row ? row[0].replace(/\s+/g, " ") : "");

    // Старий окремий рядок під рискою більше не потрібен.
    check("окремого рядка виходу не лишилось", !/profile-logout-row/.test(html));

    const body = ruleBody(".profile-actions-row");

    check("кнопки стоять поруч", Boolean(body && /display:\s*flex/.test(body)));

    // Червоною лишається, щоб не натиснути замість збереження.
    check("вихід лишився червоним",
        /\.profile-actions-row \.btn-outline\{[\s\S]{0,120}color:#dc2626/.test(css));

    // ОДНА ВЛАСТИВІСТЬ — ДВА РІЗНІ ЗНАЧЕННЯ, ЗАЛЕЖНО ВІД НАПРЯМКУ.
    //
    // .profile-form — колонка, і там align-self:flex-start означає
    // «до лівого краю». .profile-actions-row усередині неї — РЯДОК, і
    // там та сама властивість означає вже «до верхнього краю».
    //
    // Селектор без «>» діставав до обох, і посилання поруч із
    // кнопками («Скасувати», «Забули пароль?») висіли на 18px вище за
    // них. Дочірній комбінатор лишає правило полям самої форми.
    check("align-self не тече з колонки форми в рядки дій",
        /\.profile-form > \.auth-link\{/.test(css)
        && !/(?:^|\n)\.profile-form \.auth-link\{/.test(css),
        "селектор без «>» кладе посилання на верхній край рядка");

    check("кнопка теж не тягне align-self у рядок",
        /\.profile-form > \.btn\{/.test(css)
        && !/(?:^|\n)\.profile-form \.btn\{[^}]*align-self/.test(css));

    // Друга дія рядка — до правого краю картки: порожнеча між нею й
    // головною кнопкою і є захистом від випадкового натискання.
    check("друга дія стоїть біля правого краю",
        /\.profile-actions-row \.btn-outline,\s*\n\s*\.profile-actions-row \.auth-link,\s*\n\s*\.profile-email-change-actions \.auth-link\{\s*\n\s*margin-left:auto/.test(css));

    // На телефоні рядок не вміщається, і відсунута вправо кнопка
    // виглядала б як помилка верстки — там стовпчик на всю ширину.
    check("на вузькому екрані відступ знято",
        /@media\(max-width:600px\)[\s\S]*?\.profile-email-change-actions \.auth-link\{\s*\n\s*margin-left:0/.test(css));

    // Рамка додається до висоти навіть при border-box, бо висота
    // auto: без поправки кнопка з рамкою на 3px вища за сусідню.
    check("кнопки в рядку однакової висоти",
        /\.profile-actions-row \.btn-outline\{[\s\S]{0,700}padding:16px 40px/.test(css));
}

console.log("\n[5] Зміну пошти видно й вона чесно пояснена");
{
    check("посилання «Змінити email» є", /id="changeEmailBtn"/.test(html));

    check("поле нової адреси сховане до натискання",
        /id="emailChangeBox"[^>]*hidden/.test(html));

    // ДВА ПОЛЯ, А НЕ ОДНЕ. Помилки в пошті не видно: чужа адреса
    // виглядає як звичайна. Лист піде на неї, людина його не
    // отримає, а вхід лишиться за старою — і зрозуміти, що саме
    // сталось, буде нізвідки.
    check("адресу вводять двічі", /id="newEmailConfirm"/.test(html));

    check("розбіжність ловимо до надсилання",
        /Адреси не збігаються/.test(js));

    // ДРУГИЙ КРОК — «ЛИСТ НАДІСЛАНО». Без нього людина закриває
    // сторінку в упевненості, що пошту вже змінено.
    check("є крок «лист надіслано»",
        /id="emailChangeStepSent"/.test(html) && /id="emailChangeSentTo"/.test(html));

    check("на ньому видно, на яку саме адресу",
        /emailChangeSentTo\.textContent = email/.test(js));

    check("закриття повертає на перший крок",
        /emailChangeStepForm\.hidden = false;[\s\S]{0,120}emailChangeStepSent\.hidden = true/.test(js),
        "інакше «лист надіслано» лишиться від попередньої адреси");

    // ТРЕТІЙ ЕКРАН — ПОВЕРНЕННЯ З ЛИСТА. Без нього людина бачила б
    // просто кабінет і не знала б, чи спрацювало.
    check("є екран «Email змінено успішно»",
        /id="emailChangedCard"/.test(html) && /Email змінено успішно/.test(html));

    check("він показується за ознакою в адресі",
        /type=email_change/.test(js));

    check("міняємо через Supabase Auth",
        /supabaseClient\.auth\.updateUser\(\{ email \}\)/.test(js));

    // Кнопка першого кроку не обіцяє збереження: вона лише
    // підтверджує введену адресу. Що саме сталось, каже другий крок.
    check("кнопка першого кроку — «Підтвердити», а не «Зберегти»",
        /id="newEmailSubmit">Підтвердити</.test(html));

    check("другий крок пояснює, що зміна — після переходу за посиланням",
        /зміниться лише після переходу[\s\S]{0,40}за посиланням/.test(html));

    // Найчастіша відмова — адреса вже зайнята. «Спробуйте ще раз» тут
    // не допомагає нікому.
    check("зайняту адресу називаємо прямо",
        /вже прив'язана до іншого акаунту/.test(js));

    check("свою ж адресу не надсилаємо",
        /Це і є ваша поточна адреса/.test(js));
}

console.log("\n[6] Згода на обробку даних");
{
    const consent = html.match(/<label class="profile-consent">[\s\S]*?<\/label>/);

    check("галочка є", Boolean(consent));

    check("не проставлена заздалегідь",
        Boolean(consent && !/checked/.test(consent[0])),
        "згода, якої людина не ставила, згодою не є");

    check("посилання — всередині тексту",
        Boolean(consent && /href="privacy-policy"/.test(consent[0])),
        consent ? consent[0].replace(/\s+/g, " ") : "");

    check("без згоди не зберігаємо",
        /Потрібна згода на обробку персональних даних/.test(js));

    // Момент згоди має значення сам по собі: «так» без дати не
    // доводить нічого — політику могли змінити після.
    check("зберігаємо момент, а не прапорець",
        /row\.privacy_consent_at = new Date\(\)\.toISOString\(\)/.test(js));

    // Міграцію власник застосовує руками, і до того стовпця немає.
    // Писати його наосліп означало б «column does not exist» у всіх,
    // хто ще не застосував.
    check("пишемо лише коли стовпець існує",
        /if \(profileHasConsentColumn\) row\.privacy_consent_at/.test(js));

    check("наявність перевіряємо по рядку профілю",
        /hasOwnProperty\.call\(data, "privacy_consent_at"\)/.test(js));

    const migration = "supabase/migrations/030-privacy-consent.sql";

    check("міграція є", fs.existsSync(path.join(ROOT, migration)));

    if (fs.existsSync(path.join(ROOT, migration))) {

        const sql = read(migration);

        check("  повторний запуск безпечний", /add column if not exists/i.test(sql));

        check("  зберігає час, а не булеве", /privacy_consent_at timestamptz/i.test(sql));

    }
}

console.log("\n[5a] Зміна пароля — окрема вкладка, а не лист");
{
    // БУЛО: одна кнопка, яка надсилала лист. Тобто «змінити пароль»
    // означало «вийти з кабінету, відкрити пошту, знайти лист» — і це
    // при тому, що людина вже ввійшла й пароль пам'ятає.
    check("вкладка є", /data-tab="password"/.test(html) && /id="passwordPanel"/.test(html));

    check("старої кнопки-листа немає",
        !/id="changePasswordBtn"/.test(html) && !/changePasswordBtn\?\.addEventListener/.test(js));

    check("поля — старий і новий",
        /id="oldPassword"/.test(html) && /id="changedPassword"/.test(html));

    // СТАРИЙ ПАРОЛЬ ПИТАЄМО НЕ ДЛЯ ПОРЯДКУ.
    //
    // Supabase міняє пароль, маючи лише відкриту сесію, — старого не
    // питає взагалі. Будь-хто, хто сів за незаблокований комп'ютер,
    // міняє пароль і забирає акаунт: власник більше не ввійде.
    check("старий пароль перевіряємо входом",
        /signInWithPassword\(\{[\s\S]{0,120}password: oldPassword/.test(js),
        "без цього старе поле — просто прикраса");

    check("неправильний старий не пропускаємо",
        /Старий пароль неправильний/.test(js));

    // …АЛЕ ОДНІЄЇ ПЕРЕВІРКИ ВХОДОМ МАЛО.
    //
    // Вона вся живе в браузері. Той, хто сів за відкриту сесію, може
    // не відкривати наш кабінет узагалі: токен лежить у localStorage,
    // і запит на зміну пароля робиться до API напряму — наш код у
    // цьому обміні не бере участі.
    //
    // Тому старий пароль іде ще й у самому запиті, полем
    // current_password: там його звіряє сервер, і обійти це, минаючи
    // сторінку, вже не вийде. Вмикається перемикачем «Require current
    // password when updating» у панелі проєкту; при вимкненому сервер
    // поле просто ігнорує, тож надсилати його безпечно завжди.
    //
    // Два запити на зміну пароля в кабінеті РІЗНІ, і плутати їх не
    // можна — тому дивимось не на файл цілком, а на кожен виклик
    // окремо.
    const updateCall = from => {
        const at = js.indexOf("supabaseClient.auth.updateUser(", from);
        return at < 0 ? "" : js.slice(at, js.indexOf(");", at) + 1);
    };

    const changeCall = updateCall(js.indexOf("passwordForm?.addEventListener"));
    const resetCall = updateCall(js.indexOf("resetPasswordForm?.addEventListener"));

    check("обидва виклики знайшлись", changeCall !== "" && resetCall !== "");

    check("зміна в кабінеті несе старий пароль і на сервер",
        /current_password:\s*oldPassword/.test(changeCall),
        changeCall.replace(/\s+/g, " "));

    check("і новий — у тому самому запиті",
        /password:\s*newPassword/.test(changeCall));

    // ЗВОРОТНЯ ПОМИЛКА НЕ МЕНШ ДОРОГА. Сесію, яку відкрив лист про
    // відновлення, сервер помічає як recovery й current_password у ній
    // не питає. Додати туди це поле — значить вимагати старий пароль
    // саме в того, хто його не пам'ятає: відновлення стане неможливим.
    check("відновлення листом старого пароля не питає",
        !/current_password/.test(resetCall),
        resetCall.replace(/\s+/g, " "));

    // Відмова сервера можлива й тоді, коли вхід вище пройшов: пароль
    // могли змінити з іншого пристрою між двома запитами.
    check("відмову сервера пояснюємо тим самим текстом",
        /current_password_invalid[\s\S]{0,200}Старий пароль неправильний/.test(js));

    // Минулого разу підказка вела в розділ панелі, де перемикача вже
    // немає, і власник вирішив, що його немає взагалі. Адреса має бути
    // поруч із кодом, який на неї спирається.
    check("у коментарі сказано, де саме вмикається перевірка",
        /Require current password when updating[\s\S]{0,200}Sign In \/ Providers/.test(js),
        "без адреси перемикач шукатимуть у Emails, як минулого разу");

    // Межа 30 — не примха: Supabase відмовляє довшим за 72 байти вже
    // після натискання й англійською.
    check("довжину перевіряємо до надсилання",
        /newPassword\.length < 6 \|\| newPassword\.length > 30/.test(js));

    check("підпис поля каже ту саму межу",
        /Новий пароль \(від 6 до 30 символів\)/.test(html));

    // «Забули пароль?» лишається — але для випадку, для якого лист і
    // потрібен: коли старого пароля не пам'ятають.
    check("«Забули пароль?» поруч із кнопкою",
        /id="forgotPasswordInsideBtn"/.test(html));

    // Адреса береться із сесії, а не з поля: mail — це realEmail(user)
    // (див. [12]), тобто пошта того, хто вже увійшов. Поля вводу тут
    // немає й бути не повинно.
    check("адресу не питаємо — людина вже в кабінеті",
        /const mail = realEmail\(user\);[\s\S]{0,700}resetPasswordForEmail\(mail,/.test(js)
        && !/id="forgotEmailInput"/.test(html));

    check("є крок «посилання надіслано»",
        /id="forgotStepSent"/.test(html) && /id="forgotSentTo"/.test(html));
}

console.log("\n[6a] Прапорці згоди не розсувають текст");
{
    // КАПКАН, У ЯКИЙ Я ВСТУПИВ УДВІЧІ.
    //
    // Угорі style.css є загальне правило форм:
    //
    //     input, textarea, select{ width:100%; padding:14px 16px; … }
    //
    // Типу воно не розрізняє. Прапорець у flex-рядку отримує
    // width:100% від картки й видавлює текст згоди у вузький
    // стовпчик — по одному-два слова в рядок. Перший раз це сталося
    // з підпискою в підвалі, другий — зі згодою в кабінеті, і обидва
    // рази це бачив власник, а не тест.
    //
    // Виміряно після правки: прапорець 16×16, текст 550px в один
    // рядок замість стовпчика під правим краєм.
    [".profile-consent", ".subscribe-consent"].forEach(base => {

        const body = ruleBody(base + ' input[type="checkbox"]');

        check(`${base}: прапорець має явну ширину`,
            Boolean(body && /width:\s*\d+px/.test(body)),
            body === null ? "правила немає" : body.replace(/\s+/g, " "));

        check(`  і не тягнеться (flex:0 0 auto)`,
            Boolean(body && /flex:\s*0 0 auto/.test(body)));

        // padding із загального правила теж треба зняти: прапорцю
        // потрібен розмір позначки, а не поле навколо неї.
        check(`  і без поля навколо позначки`,
            Boolean(body && /padding:\s*0/.test(body)));

    });
}

console.log("\n[6b] Налаштування розсилки читаються на світлій картці");
{
    // ТОЙ САМИЙ КАПКАН, ЩО Й РАНІШЕ, ТІЛЬКИ В НОВІЙ РОЗМІТЦІ.
    //
    // Тут була форма підписки, і базові .subscribe-* писались під
    // ТЕМНИЙ підвал: текст згоди rgba(255,255,255,.6). На білій
    // картці кабінету він був невидимий — перевірка стояла саме через
    // це.
    //
    // Форму замінила галочка, але клас .subscribe-consent лишився той
    // самий, отже й білий текст на білому лишився б. Тому перевірка
    // не зникає, а переїжджає на нову панель.
    const body = ruleBody(".newsletter-settings .subscribe-consent");

    check("підпис галочки перефарбовано під світле тло",
        Boolean(body && /color:var\(--gray900\)/.test(body)),
        body === null ? "правила немає" : body.replace(/\s+/g, " "));

    // Базовий колір лишається для підвалу — його чіпати не можна.
    const base = ruleBody(".subscribe-consent");

    check("підвальний колір не зачепили",
        Boolean(base && /color:rgba\(255,255,255,\.6\)/.test(base)));

    check("сама панель має розкладку", Boolean(ruleBody(".newsletter-settings")));

    // «Відписано» й «перевірте пошту» — не помилки, а .field-error
    // червоний. Клас поверх нього це виправляє.
    check("гарна новина не малюється помилкою",
        /\.field-ok\{/.test(css) && /color:#047857/.test(ruleBody(".field-ok") || ""));
}

console.log("\n[7] Підписка працює на обох формах");
{
    // У кабінеті форми підписки більше немає: там налаштування з
    // галочкою. Пропонувати підписатись тому, хто вже підписаний, —
    // те саме, що не знати про нього нічого; а відписатись стара
    // форма не давала взагалі.
    check("у кабінеті — налаштування, а не форма",
        /id="newsletterSettings"/.test(html)
        && /id="newsletterWanted"/.test(html)
        && !/subscribe-account/.test(html));

    check("обробник шукає ВСІ форми, а не одну за id",
        /querySelectorAll\("form\.subscribe"\)/.test(subscribe));

    check("поля беруться всередині форми",
        /form\.querySelector\("input\[type=email\]"\)/.test(subscribe));

    check("жодного getElementById не лишилось",
        !/getElementById\("subscribe/.test(subscribe),
        "повернувся пошук за id — друга форма працювати не буде");

    // Розмітку футера не чіпали: там ті самі id, що були.
    check("футерна форма лишилась із своїми id",
        /id="subscribeForm"/.test(html) && /id="subscribeEmail"/.test(html));

    // Відписка — посиланням із листа, і про це сказано. Свого
    // «відписатись» у нас немає, і обіцяти його не можна.
    check("сказано, як відписатись",
        /Відписатись можна з будь-якого листа/.test(html));
}

console.log("\n[8] Листи входу лежать у репозиторії");
{
    // Їх надсилає САМ Supabase із власних шаблонів — узяти їх звідси
    // він не вміє. Тому тут джерело, а в панелі копія. Копія рано чи
    // пізно розходиться, і єдиний спосіб це помітити — тримати
    // оригінал там, де його видно.
    const dir = "supabase/email-templates";

    ["recovery.html", "email-change.html", "confirm-signup.html", "README.md"]
        .forEach(name => check(`${name} є`,
            fs.existsSync(path.join(ROOT, dir, name))));

    ["recovery.html", "email-change.html", "confirm-signup.html"].forEach(name => {

        const file = path.join(ROOT, dir, name);

        if (!fs.existsSync(file)) return;

        const letter = fs.readFileSync(file, "utf8");

        // Без посилання лист безглуздий — саме заради нього він і йде.
        check(`  ${name}: є посилання Supabase`,
            letter.includes("{{ .ConfirmationURL }}"));

        // Верстка inline: клієнти пошти вирізають <style>.
        check(`  ${name}: без <style>`, !/<style/i.test(letter));

        // СТРОК ДІЇ НЕ ВПИСУЄМО ЧИСЛОМ. Він задається в панелі
        // Supabase, і щойно його змінять, лист почне брехати —
        // а перевірити це нема як.
        check(`  ${name}: не обіцяє конкретних годин`,
            !/\d+\s*(годин|години|год\b)/i.test(letter),
            "строк дії посилання змінюється в панелі, а лист — ні");

    });
}

console.log("\n[7a] Вхід через Google і Facebook");
{
    // ГОЛОВНЕ, ЩО ТУТ ЗАКРІПЛЕНО: КНОПКИ, ЯКІ НЕ ПРАЦЮЮТЬ, НЕ
    // ПОКАЗУЮТЬСЯ.
    //
    // signInWithOAuth не повертає помилку в код — він ОДРАЗУ
    // переводить браузер на /auth/v1/authorize. Якщо провайдер у
    // проєкті не увімкнений, Supabase віддає туди голий JSON:
    //
    //   {"code":400,"error_code":"validation_failed",
    //    "msg":"Unsupported provider: provider is not enabled"}
    //
    // Тобто людина замість входу опиняється на білій сторінці з
    // англійським машинним текстом. Перевірено в браузері — саме так
    // воно й виглядало, і обробник помилки не встигав виконатись.
    //
    // Тому список увімкнених провайдерів питається заздалегідь, і
    // кнопка з'являється сама, коли провайдера увімкнуть у панелі.
    ["google", "facebook"].forEach(provider => {
        check(`кнопка ${provider} є`,
            new RegExp(`data-provider="${provider}"`).test(html));
    });

    // Сховані в розмітці: інакше вони встигли б блимнути до
    // відповіді Supabase — і людина клікнула б саме в цей момент.
    check("блок схований до відповіді Supabase",
        /<div class="auth-social" id="authSocial" hidden>/.test(html));

    check("розділювач «або» теж",
        /<div class="auth-divider" id="authDivider" hidden>/.test(html));

    check("список увімкнених питається у Supabase",
        /\/auth\/v1\/settings/.test(js));

    check("показуються лише увімкнені",
        /button\.hidden = enabled\[button\.dataset\.provider\] !== true/.test(js));

    // Питаємо тільки про справжніх провайдерів Supabase. Кнопка
    // Telegram лежить у тому самому блоці, але працює через нашу
    // власну функцію — у /auth/v1/settings її немає й бути не може,
    // тож широкий селектор ховав би її назавжди.
    check("Telegram не питається у Supabase",
        /box\.querySelectorAll\("\[data-provider\]"\)/.test(js));

    check("жодного увімкненого — блока немає",
        /box\.hidden = shown === 0/.test(js));

    // Недоступність цього запиту не привід ламати вхід поштою.
    check("без відповіді сторінка не ламається",
        /Не вдалося дізнатись способи входу/.test(js));

    check("вхід іде через Supabase, а не власними руками",
        /auth\.signInWithOAuth\(\{/.test(js));

    // Та сама пастка, що з листом про відновлення пароля: адреса
    // повернення мусить бути в списку дозволених, інакше Supabase
    // підставить Site URL.
    check("повертає в кабінет",
        /redirectTo: `\$\{window\.location\.origin\}\/account`/.test(js));

    // Кнопки стоять НАД вкладками: для цих двох «увійти» й
    // «зареєструватися» — та сама дія.
    check("кнопки над обома вкладками",
        html.indexOf('id="authSocial"') < html.indexOf('id="loginForm"')
        && html.indexOf('id="authSocial"') < html.indexOf('id="signupForm"'));

    // ІМ'Я З ЧУЖОГО АКАУНТУ. Профіль створюється лише при першому
    // збереженні, тож той, хто увійшов через Google, бачив би порожні
    // поля — і вписував те, що ми вже знаємо.
    const source = js.match(/function namesFromMetadata\(user\)[\s\S]*?\n\}/);

    check("ім'я береться з даних провайдера", Boolean(source));

    if (source) {

        const names = new Function(source[0] + "; return namesFromMetadata;")();

        check("Google: окремі поля імені й прізвища",
            JSON.stringify(names({ user_metadata: { given_name: "Ілля", family_name: "Півень" } }))
                === JSON.stringify({ first: "Ілля", last: "Півень" }));

        check("одне поле ділиться по першому пробілу",
            JSON.stringify(names({ user_metadata: { full_name: "Ілля Півень" } }))
                === JSON.stringify({ first: "Ілля", last: "Півень" }));

        // Складене прізвище лишається цілим, а не обрізається.
        check("складене прізвище не ріжеться",
            names({ user_metadata: { name: "Анна Марія Коваль-Шевченко" } }).last
                === "Марія Коваль-Шевченко");

        check("без даних — порожньо, а не undefined",
            JSON.stringify(names({})) === JSON.stringify({ first: "", last: "" })
            && JSON.stringify(names(null)) === JSON.stringify({ first: "", last: "" }));

    }

    // Своє збережене ім'я головніше за те, що дав провайдер.
    check("збережене ім'я не затирається",
        /data\?\.first_name \|\| fromProvider\.first/.test(js));
}

console.log("\n[8a] Розкривні блоки кабінету дихають");
{
    // ЧОМУ ВСЕРЕДИНІ БУЛО РІВНО НУЛЬ.
    //
    // .profile-email-change — колонка з gap. Але gap діє між ПРЯМИМИ
    // дітьми, а це два кроки-обгортки, з яких видно завжди лише один.
    // Усередині обгортки лишався звичайний блок без жодного відступу:
    // поле торкалось наступного підпису, кнопка — поля над нею.
    // Виміряно 0px в обох місцях, і саме це власник показав стрілкою.
    ["emailChangeStepForm", "emailChangeStepSent", "forgotStepForm", "forgotStepSent"]
        .forEach(id => check(`${id} — крок із відступами`,
            new RegExp(`id="${id}"[^>]*class="profile-email-step"`).test(html)
            || new RegExp(`class="profile-email-step"[^>]*id="${id}"`).test(html)));

    const step = ruleBody(".profile-email-step");

    check("крок — колонка", Boolean(step && /flex-direction:\s*column/.test(step)));

    check("з відступом між рядками",
        Boolean(step && /gap:\s*(\d+)px/.test(step) && Number(RegExp.$1) >= 10),
        step);

    // Кнопка, що стоїть у кроці сама («Закрити»), інакше розтягнулась
    // би на всю ширину: колонка за замовчуванням тягне дітей.
    check("поодинока кнопка не розтягується",
        /\.profile-email-step > \.btn\{[^}]*align-self:\s*flex-start/.test(css));

    // #forgotBox — сусід форми, а не її поле: .profile-card звичайний
    // блок без gap, тож між кнопкою й рамкою було 0px.
    check("блок не липне до кнопки над ним",
        /\.profile-form \+ \.profile-email-change\{[^}]*margin-top:\s*(\d+)px/.test(css)
        && Number(RegExp.$1) >= 16);

    // Картка без підзаголовка: там заголовок висів за 6px від поля.
    check("заголовок без підзаголовка має повітря",
        /\.profile-card h2 \+ \.profile-form\{[^}]*margin-top:\s*(\d+)px/.test(css)
        && Number(RegExp.$1) >= 14);

    // З'ЯВЛЕННЯ. Блок виростає на дві-три сотні пікселів по кліку —
    // без переходу це читається як збій. Ключові кадри, бо елемент
    // перемикається через hidden (display:none), а з нього переходи
    // не стартують. Анімуються лише opacity й transform: усе інше
    // перераховувало б розкладку щокадру.
    const keyframes = css.replace(/\/\*[\s\S]*?\*\//g, "")
        .match(/@keyframes profile-panel-in\{([\s\S]*?\}\s*)\}/);

    check("блок з'являється переходом", Boolean(keyframes));

    check("анімуються лише opacity й transform",
        Boolean(keyframes) && !/(?:^|[\s;{])(height|width|margin|padding|top|left)\s*:/
            .test(keyframes[1]),
        keyframes ? keyframes[1].replace(/\s+/g, " ") : "");

    check("тривалість у межах 300ms",
        /animation:profile-panel-in (\d+)ms/.test(css) && Number(RegExp.$1) <= 300,
        RegExp.$1);

    // ease-in стартує повільно саме тоді, коли на нього дивляться, —
    // і через це відчувається млявішим за ease-out тієї ж довжини.
    check("крива — ease-out, а не ease-in",
        /animation:profile-panel-in \d+ms var\(--ease-out\)/.test(css));
}

console.log("\n[8b] Токен із листа доїжджає до кабінету");
{
    // ЩО СТАЛОСЬ НАСПРАВДІ.
    //
    // У листі «Відновлення пароля» стояло
    // redirect_to=https://bestbrnd4u.github.io — тобто головна, а не
    // кабінет. Адресу повернення обирає Supabase: наш redirectTo діє
    // лише якщо він є в списку дозволених у панелі, інакше мовчки
    // береться Site URL.
    //
    // Токен при цьому живий і лежить у #-частині адреси. Клієнт
    // Supabase підхоплює його на БУДЬ-ЯКІЙ сторінці, відкриває сесію
    // й чистить адресу — екран «новий пароль» не показується вже
    // ніколи, бо посилання одноразове.
    const client = read("assets/js/supabase-client.js");

    check("службовий токен переноситься в кабінет",
        /type=\(recovery\|email_change\)/.test(client));

    // Перевірка мусить стояти ДО створення клієнта — інакше той
    // встигне забрати токен і почистити адресу.
    check("перенесення стоїть до створення клієнта",
        client.indexOf("carryAuthTokenToAccount") < client.indexOf("createClient"));

    // Без перевірки «ми вже в кабінеті» це перенаправлення саме на
    // себе, тобто нескінченне.
    check("на самому кабінеті не спрацьовує",
        /here\.endsWith\("\/account"\)/.test(client));

    // href лишав би в історії адресу з уже використаним токеном:
    // кнопка «назад» вела б у нікуди.
    check("історію не засмічує", /location\.replace\(/.test(client));

    // Код — лише страховка. Правильні Site URL і список дозволених
    // адрес у панелі потрібні все одно, і про це має бути сказано.
    check("сказано, що панель усе одно треба налаштувати",
        /Site URL/.test(client) && /дозволених/.test(client));
}

console.log("\n[9] event.currentTarget не читається після await");
{
    // ЧОМУ ЦЕ ОКРЕМА ПЕРЕВІРКА, А НЕ ДРІБНИЦЯ СТИЛЮ.
    //
    // currentTarget живе рівно стільки, скільки триває розсилання
    // події. Перший await віддає керування браузеру, розсилання
    // завершується — і властивість стає null. Наступний рядок кидає
    // TypeError, async-функція тихо відхиляється, і НЕ ВІДБУВАЄТЬСЯ
    // НІЧОГО: ні запиту, ні повідомлення про помилку, ні наступного
    // кроку. Кнопка просто не працює, а причина видна лише в консолі.
    //
    // Саме так зламалась кнопка «Відновити» у вкладці «Змінити
    // пароль»: лист не йшов і жодного напису не з'являлось.
    //
    // Помилка непомітна на очі — рядок з currentTarget виглядає
    // звичайно, а await стоїть на кілька рядків вище, — тож ловити її
    // мусить перевірка, а не уважність.
    const files = ["account.js", "app.js", "catalog.js", "checkout.js",
        "product.js", "common.js", "subscribe.js"];

    files.forEach(name => {

        const rel = "assets/js/" + name;

        if (!fs.existsSync(path.join(ROOT, rel))) return;

        const code = read(rel);

        // Обробники: async …=>{…} або async function(…){…}. Беремо
        // тіло до кінця рядка з подвійним відступом закриття — грубо,
        // але для «await раніше за currentTarget» цього досить.
        const bad = [];

        const re = /async\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g;

        let match;

        while ((match = re.exec(code))) {

            const start = match.index;

            // Кінець обробника — рядок «});» на нульовому відступі.
            const rest = code.slice(start);
            const end = rest.search(/\n\}\);/);
            const body = end === -1 ? rest : rest.slice(0, end);

            const awaitAt = body.indexOf("await ");
            const targetAt = body.indexOf("currentTarget");

            if (awaitAt !== -1 && targetAt !== -1 && targetAt > awaitAt) {
                bad.push(rel + ": " + body.slice(0, 60).replace(/\s+/g, " "));
            }

        }

        check(`${name}: currentTarget не після await`, bad.length === 0, bad[0]);

    });

    // Сама перевірка мусить ловити порушення — інакше зелений
    // результат нічого не означає.
    {
        const probe = `
async () => {
    const user = await getCurrentUser();
    const button = event.currentTarget;
});
`;
        const re = /async\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g;
        const match = re.exec(probe);
        const rest = probe.slice(match.index);
        const body = rest.slice(0, rest.search(/\n\}\);/));

        check("перевірка бачить зразок із помилкою",
            body.indexOf("currentTarget") > body.indexOf("await "));
    }
}

console.log("\n[10] Кнопка «Відновити» доходить до листа");
{
    // Обробник бере кнопку за id, а не з події: id не залежить від
    // того, скільки await-ів позаду.
    check("forgotSubmit береться за id",
        /const forgotSubmit = document\.getElementById\("forgotSubmit"\)/.test(js));

    check("лист таки надсилається",
        /forgotSubmit\?\.addEventListener[\s\S]{0,1200}resetPasswordForEmail/.test(js));

    // Мовчазний return — те саме, що й зламана кнопка: натиснув,
    // нічого не сталось, чому — невідомо.
    check("без сесії кнопка каже, що сталось",
        /forgotMessage\.textContent = "Сесія завершилась/.test(js));

    // ЛІМІТ ПОШТИ SUPABASE НЕ МІСТИТЬ СЛІВ «rate limit».
    // Він каже «you can only request this after 54 seconds», і без
    // окремої гілки це падало в загальне «спробуйте ще раз» —
    // після якого причину шукають у коді, а треба просто зачекати.
    check("ліміт пошти має власне пояснення",
        /you can only request this/.test(js)
        && /Забагато листів поспіль/.test(js));

    check("напис кнопки зміни пошти збігається з розміткою",
        html.includes('id="newEmailSubmit">Підтвердити<')
        && /newEmailSubmit\.textContent = "Підтвердити"/.test(js),
        "після невдалої спроби кнопка перейменовувалась сама собою");
}

console.log("\n[11] П'ята вкладка досяжна на телефоні");
{
    // ЩО БУЛО. Заміряно на 375px: смузі вкладок треба 402px, а має
    // вона 335. «Змінити пароль» обрізало краєм екрана — і дістатись
    // до неї не можна було ніяк: смуга не прокручувалась, а зайве
    // ховав overflow сторінки. Ціла вкладка кабінету була недоступна.
    const tabs = ruleBody(".account-tabs");
    const tab = ruleBody(".account-tab");

    check("правила знайдено", Boolean(tabs && tab));

    check("смуга вкладок прокручується",
        Boolean(tabs && /overflow-x:\s*auto/.test(tabs)), tabs || "");

    // Без цього вкладки стискаються замість того, щоб виїхати за
    // край, — текст ламається на два рядки, а прокручувати нема чого.
    check("вкладки не стискаються",
        Boolean(tab && /flex:\s*0 0 auto/.test(tab)), tab || "");

    check("назва вкладки лишається в один рядок",
        Boolean(tab && /white-space:\s*nowrap/.test(tab)), tab || "");

    // ПАСТКА, НА ЯКУ ЛЕГКО НАСТУПИТИ ДРУГИЙ РАЗ.
    //
    // overflow по одній осі робить другу теж прокручуваною. Активна
    // вкладка накривала риску контейнера через margin-bottom:-1px — і
    // в смузі з прокруткою цей піксель ставав ЗАЙВИМ ПІКСЕЛЕМ
    // ВЕРТИКАЛЬНОЇ ПРОКРУТКИ (заміряно: scrollHeight 43 при
    // clientHeight 42). Смужки не видно, а палець на вкладках
    // прокручує вже не сторінку.
    //
    // Тому риска — inset-тінь: вона малюється всередині поля й на
    // розкладку не впливає зовсім.
    check("риска під вкладками не додає другої прокрутки",
        Boolean(tabs && /box-shadow:\s*inset 0 -1px 0/.test(tabs))
        && !/border-bottom/.test(tabs || ""), tabs || "");

    check("вкладка більше не висить на від'ємному полі",
        Boolean(tab) && !/margin-bottom:\s*-/.test(tab), tab || "");

    // ПОЛЕ КОНТЕЙНЕРА Й ВИЇЗД СМУГИ МУСЯТЬ ЗБІГАТИСЬ.
    //
    // Смуга виходить за поля .container до самого краю екрана: саме
    // розрізана краєм вкладка й каже, що далі є ще. Якщо виїзд
    // більший за поле — сторінка поїде вбік, якщо менший — смуга
    // обірветься з відступом і читатиметься як поломка.
    //
    // Заміряно на 700px: смуга обрізалась за 32px до краю екрана —
    // тобто прокручувалась, але виглядала поламаною. Тому виїзд
    // починається з 900px, а не з 600: влазити вкладки перестають
    // приблизно з 780.
    //
    // Полів два: 32px до 500px завширшки і 20px нижче. ruleBody тут
    // не годиться — у медіа-запиті селектор із відступом.
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");

    // Однакових медіа-запитів у файлі кілька, і шукати від першого ж
    // означає читати чуже правило: пошук «@media(max-width:500px)»
    // знаходив блок із .container аж на початку файлу, а звідти
    // дотягувався до .account-tabs із сусіднього запиту на 600px і
    // рапортував 32 замість 20.
    //
    // Тому кожен знайдений запит обмежуємо до наступного @media — це
    // рівно його блок — і шукаємо селектор лише всередині.
    const inMedia = (query, selector) => {

        // \s+ тут теж було б помилкою: \s ловить і перенос рядка, тож
        // «\n\s+.account-tabs» знаходило БАЗОВЕ правило, перед яким
        // стоїть порожній рядок. Відступ — це пробіли або табуляція.
        const re = new RegExp("\\n[ \\t]+" + selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}");

        let from = 0;

        for (;;) {

            const at = clean.indexOf(query, from);

            if (at < 0) return null;

            const next = clean.indexOf("@media", at + query.length);

            const block = next < 0 ? clean.slice(at) : clean.slice(at, next);

            const found = block.match(re);

            if (found) return found[1];

            from = at + query.length;

        }

    };

    const wide = inMedia("@media(max-width:900px)", ".account-tabs");
    const narrow = inMedia("@media(max-width:500px)", ".account-tabs");

    const pad = body => {
        const m = body && body.match(/padding-inline:\s*(\d+)px/);
        return m ? Number(m[1]) : null;
    };

    const bleed = body => {
        const m = body && body.match(/margin-inline:\s*-(\d+)px/);
        return m ? Number(m[1]) : null;
    };

    check("смуга виїжджає за поле контейнера", bleed(wide) !== null, wide || "");

    check("виїзд дорівнює полю контейнера (32px)",
        bleed(wide) === 32 && pad(wide) === 32, `${bleed(wide)} / ${pad(wide)}`);

    // Нижче 500px .container звужує поле до 20px. Якби смуга й далі
    // виїжджала на 32, вона вилізла б за екран на 12px з кожного боку.
    const containerNarrow = inMedia("@media(max-width:500px)", ".container");

    check("нижче 500px поле контейнера — 20px",
        Boolean(containerNarrow && /padding:\s*0 20px/.test(containerNarrow)),
        containerNarrow || "");

    check("нижче 500px виїзд теж 20px",
        bleed(narrow) === 20 && pad(narrow) === 20, `${bleed(narrow)} / ${pad(narrow)}`);

    // Правило для 500px мусить стояти ПІСЛЯ правила для 600px:
    // обидва спрацьовують на вузькому екрані, і виграє останнє.
    check("вузьке правило стоїть після широкого",
        clean.lastIndexOf("margin-inline:-20px") > clean.indexOf("margin-inline:-32px"));

    // Натиснута вкладка може лишитись наполовину за краєм — тобто
    // активна, але не видно, яка саме.
    check("натиснута вкладка під'їжджає у видиме",
        /scrollIntoView\(\{[\s\S]{0,120}inline: "center"/.test(js));

    // block:"nearest" означає «по вертикалі нічого не роби». Без
    // нього сторінка стрибала б угору-вниз на кожному перемиканні.
    check("без вертикального стрибка",
        /scrollIntoView\(\{[\s\S]{0,160}block: "nearest"/.test(js));

    // scrollIntoView з явним behavior перебиває навіть
    // scroll-behavior:auto !important із блоку prefers-reduced-motion
    // наприкінці style.css — тобто системну настройку треба спитати
    // самим.
    check("плавність питає систему, а не бере силою",
        /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/.test(js)
        && /behavior: still \? "auto" : "smooth"/.test(js));
}

console.log("\n[12] Службова адреса входу через Telegram не видається за пошту");
{
    // ЗВІДКИ ВОНА. Supabase тримає користувача за поштою, а Telegram
    // її не дає — тож адреса вигадується з id і підпису
    // (telegram-login.js, telegramEmail). Скриньки за нею не існує.
    //
    // ЧОМУ ЦЕ НЕ КОСМЕТИКА. Вона підставлялась у форму замовлення й у
    // підписку: покупець бачив заповнене поле «Email», вважав, що
    // пошту вказав, — а лист про відправлення, подяка й прохання про
    // відгук їхали в нікуди.
    const client = read("assets/js/supabase-client.js");
    const checkout = read("assets/js/checkout.js");
    const login = read("supabase/functions/telegram-order-bot/telegram-login.js");

    check("є одна спільна перевірка на службову адресу",
        /function realEmail\(user\)/.test(client));

    // ДВІ КОПІЇ ДОМЕНА — ДВА РІЗНІ ДОМЕНИ ПІСЛЯ ПЕРШОГО Ж
    // ПЕРЕЙМЕНУВАННЯ. Один бік складає адресу, другий її впізнає; не
    // збігнуться — службова пошта поїде в замовлення як справжня.
    const inClient = (client.match(/TELEGRAM_EMAIL_DOMAIN = "([^"]+)"/) || [])[1];
    const inFunction = (login.match(/TELEGRAM_EMAIL_DOMAIN = "([^"]+)"/) || [])[1];

    check("домен у клієнті й у функції той самий",
        Boolean(inClient) && inClient === inFunction,
        `${inClient} проти ${inFunction}`);

    // Адресу складає telegramEmail, а впізнає isServiceEmail. Обидві
    // мусять брати домен зі сталої, а не писати його рядком: інакше
    // «одна стала» лишається лише на папері.
    // Коментарі не рахуємо: там домен наведений як приклад атаки, і
    // це не друга його копія в коді.
    const loginCode = login.replace(/^\s*\/\/.*$/gm, "");

    check("обидві функції беруть домен зі сталої",
        /\$\{TELEGRAM_EMAIL_DOMAIN\}`/.test(loginCode)
        && /endsWith\(TELEGRAM_EMAIL_DOMAIN\)/.test(loginCode)
        && (loginCode.match(/@telegram\.bestbrnd4u\.com/g) || []).length === 1,
        "домен мусить зустрічатись у коді рівно один раз");

    // Кабінет: показувати рядок із id людині безглуздо, а
    // пропонувати «змінити» — тим більше: міняти нема чого.
    check("у кабінеті показано стан, а не службовий рядок",
        /profileEmailEl\.textContent = mail \|\|/.test(js));

    check("кнопка стає «Додати email», коли пошти немає",
        /mail \? "Змінити email" : "Додати email"/.test(js));

    check("у кабінеті більше не показують user.email напряму",
        !/profileEmailEl\.textContent = user\.email/.test(js));

    // Поля «адреса для листів» у вкладці «Розсилки» більше немає:
    // адресу бере з акаунту сама панель. Службову вона не візьме —
    // realEmailOf у функції її відсіює (див. test-people-panel.js).
    check("поля для підстановки адреси вже не існує",
        !/newsletterEmail/.test(js) && !/id="newsletterEmail"/.test(html));

    // Замовлення — найдорожчий випадок: туди їдуть усі листи.
    check("оформлення замовлення не підставляє службову адресу",
        /const mail = realEmail\(user\)/.test(checkout)
        && /!emailField\.value && mail/.test(checkout)
        && !/emailField\.value = user\.email/.test(checkout));

    // Відновлення пароля: Supabase відповідає УСПІХОМ і на неіснуючу
    // адресу — екран сказав би «лист надіслано», і людина чекала б
    // його доти, доки не вирішила б, що зламався сайт.
    check("відновлення пароля не вдає, що лист пішов",
        /if \(!mail\) \{[\s\S]{0,300}надсилати посилання нема куди/.test(js)
        && /resetPasswordForEmail\(mail,/.test(js));

    // Пояснення мусить бути ДО натискання, а не після: інакше єдина
    // дія на екрані веде в глухий кут.
    check("без пошти блок відновлення пояснює це одразу",
        /id="forgotNoMail"/.test(html)
        && /Ви входите через Telegram — пароля в акаунті немає/.test(html)
        && /if \(noMail\) noMail\.hidden = Boolean\(mail\)/.test(js));

    check("і ховає кнопку, бо тиснути нема що",
        /if \(submit\) submit\.hidden = !mail/.test(js));

    // Підказка на іконці кабінету називає, ким саме ти увійшов.
    check("підказка в шапці не показує службовий рядок",
        /realEmail\(user\) \|\| "Особистий кабінет"/.test(client));
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
