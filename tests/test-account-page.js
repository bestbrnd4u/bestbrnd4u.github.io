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
const js = read("assets/js/account.js");
const css = read("assets/css/style.css");
const subscribe = read("assets/js/subscribe.js");

// Тіло правила з style.css за точним селектором.
const ruleBody = selector => {

    const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}");

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
    ["orders", "addresses", "profile", "newsletter"].forEach(name => {

        check(`вкладка ${name} є в розмітці`,
            new RegExp(`data-tab="${name}"`).test(html));

        check(`  і панель ${name}Panel теж`,
            new RegExp(`id="${name}Panel"`).test(html));

    });

    // Перемикач мусить знати про всі панелі. Раніше він перелічував
    // три айдішники рядками — четверта вкладка відкривалась би поверх
    // третьої.
    check("перемикач іде переліком, а не трьома рядками",
        /\["orders", "addresses", "profile", "newsletter"\]/.test(js),
        "нова вкладка не сховає попередню лише якщо перелік спільний");
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
}

console.log("\n[5] Зміну пошти видно й вона чесно пояснена");
{
    check("посилання «Змінити email» є", /id="changeEmailBtn"/.test(html));

    check("поле нової адреси сховане до натискання",
        /id="emailChangeBox"[^>]*hidden/.test(html));

    check("міняємо через Supabase Auth",
        /supabaseClient\.auth\.updateUser\(\{ email \}\)/.test(js));

    // Кнопка каже «Надіслати лист», а не «Зберегти»: інакше людина
    // закриє сторінку в упевненості, що адресу вже змінено.
    check("кнопка каже про лист, а не про збереження",
        /Надіслати лист/.test(html));

    check("і поруч написано, що зміна — після переходу за посиланням",
        /лише після переходу за посиланням/.test(html));

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

console.log("\n[7] Підписка працює на обох формах");
{
    // Форма в кабінеті — той самий клас, що у футері, тож логіка одна.
    check("форма в кабінеті має клас .subscribe",
        /<form class="subscribe subscribe-account"/.test(html));

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

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
