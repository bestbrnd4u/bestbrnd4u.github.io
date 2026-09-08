// Незавершене оформлення замовлення: нагадування, яке доходить до гостя.
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Нагадування про брошений кошик працювало ЛИШЕ для авторизованих:
// їхній кошик синхронізується в базу, а пошта лежить у auth.users.
// Кошик гостя живе в localStorage браузера — у базі його немає, і
// нагадати нема куди. А замовлення з user_id = null у нас більшість.
//
// Пошта гостя вперше з'являється на сторінці оформлення. Заповнив і
// не натиснув кнопку — найгарячіша втрата, яка в магазині буває.
//
// ДЕ ТУТ МЕЖА (і чому половина цього файлу про неї)
// --------------------------------------------------
// Лист про незавершене замовлення — це про угоду, яку людина почала
// сама. Але це НЕ згода на розсилку, і технічно різниця між одним і
// другим — один рядок коду. Тому тест стежить саме за межею:
//
//   • адреса не потрапляє ні в MailerLite, ні в жоден список;
//   • лист один, і не частіше разу на 30 днів;
//   • запис зникає, щойно замовлення оформлено, і сам через 30 днів;
//   • у політиці конфіденційності це написано.
//
// І за тим, щоб допоміжна можливість не могла зашкодити оформленню:
// усе фейлиться в бік «нічого не зробили», а не «зламали покупку».

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const migration = read("supabase/migrations/020-checkout-drafts.sql");
const handlers = read("supabase/functions/telegram-order-bot/_index.src.ts");
const bundle = read("supabase/functions/telegram-order-bot/index.ts");
const checkoutSrc = read("assets/js/checkout.js");
const remindSrc = read("scripts/remind-carts.js");

console.log("\n[1] Що саме приймає маршрут");
{
    const src = read("supabase/functions/telegram-order-bot/checkout-draft.js");

    // Модуль ESM — перевіряємо текстом, як інші тести бота.
    check("пошта нормалізується (одна адреса — один рядок)",
        /trim\(\)\.toLowerCase\(\)/.test(src));

    check("пошта перевіряється тим самим правилом, що на сторінці",
        /\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$/.test(src));

    check("кількість обмежена", /MAX_DRAFT_QTY = 10/.test(src));

    check("позиції обмежені", /MAX_DRAFT_ITEMS = 40/.test(src));

    // Зберігаємо ЛИШЕ посилання на товар: ні імені, ні телефону, ні
    // адреси доставки. Для листа «ви не завершили» вони не потрібні.
    check("зберігаємо тільки посилання на товар",
        /product_id: id,\s*\n\s*color:[\s\S]{0,80}size:[\s\S]{0,80}qty,/.test(src));

    check("ні імені, ні телефону, ні адреси доставки",
        !/first_name|last_name|\bphone\b|delivery_/.test(src),
        (src.match(/first_name|last_name|\bphone\b|delivery_\w+/) || [])[0]);
}

console.log("\n[2] Маршрут підключений і зібраний");
{
    check("маршрут checkout-draft є",
        /body\.site_action === "checkout-draft"/.test(handlers));

    check("обробник на місці", /async function handleCheckoutDraft/.test(handlers));

    // РЕГРЕСІЯ, ЯКУ ЦЕ ЛОВИТЬ: новий модуль забули додати в MODULES
    // збирача — і в зібраному index.ts його функцій немає, а маршрут
    // падає на невідомому імені. Мовчки: локально все працює.
    check("модуль потрапив у зібраний файл", /function cleanDraft\(body\)/.test(bundle));

    check("модуль зареєстрований у збирачі",
        /"checkout-draft\.js"/.test(read("scripts/build-edge-function.js")));

    // Відповідь ЗАВЖДИ 200: сторінка оформлення не має чого робити з
    // цією помилкою, а червоне повідомлення посеред покупки шкодить.
    check("невдача не стає помилкою для сторінки",
        /handleCheckoutDraft[\s\S]{0,2000}\{ ok: true, saved: false \}, 200/.test(handlers));

    check("є межа звернень (інакше маршрут наповнив би базу вигаданими адресами)",
        /handleCheckoutDraft[\s\S]{0,1200}lookupAllowed\(clientIp\(request\)\)/.test(handlers));
}

console.log("\n[3] Сторінка оформлення: тільки гостям і тільки з готовою поштою");
{
    check("надсилаємо на blur, а не на кожну літеру",
        /getElementById\("email"\)\?\.addEventListener\("blur", saveCheckoutDraft\)/.test(checkoutSrc));

    // ДВА ЛИСТИ ПРО ОДИН КОШИК — найгірший результат цієї роботи.
    // Авторизованого покриває нагадування про кошик.
    check("авторизованим не надсилаємо",
        /if \(!\(await guestForDraft\(\)\)\) return;/.test(checkoutSrc));

    check("порожній кошик не надсилаємо", /if \(!items\.length\) return;/.test(checkoutSrc));

    check("той самий кошик і пошта вдруге не надсилаються",
        /if \(mark === draftSent\) return;/.test(checkoutSrc));

    check("keepalive — людина може закрити вкладку тієї ж миті",
        /site_action: "checkout-draft"[\s\S]{0,600}|keepalive: true[\s\S]{0,600}checkout-draft/.test(checkoutSrc)
        && /keepalive: true/.test(checkoutSrc));

    check("збій мовчить (людина зараз купує)",
        /catch \(error\) \{[\s\S]{0,400}draftSent = "";/.test(checkoutSrc));

    // Ім'я, телефон і адреса доставки в посилку не потрапляють.
    const call = checkoutSrc.slice(
        checkoutSrc.indexOf('site_action: "checkout-draft"'),
        checkoutSrc.indexOf('site_action: "checkout-draft"') + 500);

    check("у посилці лише пошта й товари",
        !/first_name|last_name|phone|delivery/.test(call),
        (call.match(/first_name|last_name|phone|delivery\w*/) || [])[0]);
}

console.log("\n[4] База: закрита таблиця, службові права, запобіжники");
{
    check("таблиця закрита (RLS без політик)",
        /alter table public\.checkout_drafts enable row level security/.test(migration));

    check("політик для anon немає",
        !/create policy[\s\S]*checkout_drafts/.test(migration));

    ["save_checkout_draft", "abandoned_checkouts", "mark_checkout_notified"].forEach(fn => {

        check(`${fn}: лише службовому ключу`,
            new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon, authenticated`).test(migration)
            && new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`).test(migration));

    });

    check("search_path закріплений (усі функції)",
        (migration.match(/set search_path =/g) || []).length >= 4,
        (migration.match(/set search_path =/g) || []).length);

    check("запис ламається — оформлення не страдає",
        /save_checkout_draft[\s\S]*?exception[\s\S]{0,200}raise warning/.test(migration));

    check("відбиток рахує база, а не браузер",
        /select md5\(string_agg\(/.test(migration));
}

console.log("\n[5] Межа: це нагадування, а не розсилка");
{
    check("лист один і не частіше разу на 30 днів",
        /notified_at is null[\s\S]{0,200}interval '30 days'/.test(migration));

    check("замовлення після чернетки скасовує нагадування",
        /not exists \([\s\S]{0,200}public\.orders o[\s\S]{0,120}o\.created_at > d\.updated_at/.test(migration));

    // Інакше про той самий кошик прийшло б два листи: цей і від
    // abandoned_carts.
    check("зареєстрованим із цією поштою не пишемо",
        /not exists \([\s\S]{0,160}auth\.users u[\s\S]{0,120}lower\(u\.email\) = d\.email/.test(migration));

    check("запис зникає сам через 30 днів",
        /delete from public\.checkout_drafts[\s\S]{0,120}updated_at < now\(\) - interval '30 days'/.test(migration));

    // Тригер, а не рядок у коді: замовлення приходять трьома шляхами
    // (сайт, бот, панель), і один із них забули б.
    check("замовлення прибирає чернетку будь-яким шляхом",
        /create trigger orders_forget_checkout_draft[\s\S]{0,120}after insert on public\.orders/.test(migration));

    check("прибирання не може зламати вставку замовлення",
        /forget_checkout_draft[\s\S]*?exception[\s\S]{0,500}return new;/.test(migration));

    // ГОЛОВНЕ. Адреса не потрапляє в список підписників.
    check("адреса не йде в MailerLite",
        !/MAILERLITE|mailerlite|subscribeRequest/.test(
            handlers.slice(handlers.indexOf("async function handleCheckoutDraft"),
                handlers.indexOf("async function handleAdmin"))));

    check("у листі сказано, чому він прийшов",
        /залишили свою пошту на сторінці оформлення/.test(
            read("supabase/functions/telegram-order-bot/mail.js")));

    check("у листі сказано, що це не розсилка",
        /до розсилки магазину ваша[\s\S]{0,40}адреса не додана/.test(
            read("supabase/functions/telegram-order-bot/mail.js")));

    check("у політиці конфіденційності це написано",
        /Незавершене оформлення замовлення[\s\S]{0,600}не підписка/.test(read("privacy-policy.html")));

    check("у політиці сказано про строк зберігання",
        /Незавершене оформлення[\s\S]{0,900}30 днів/.test(read("privacy-policy.html")));
}

console.log("\n[6] Розсилка: інший лист, та сама обережність");
{
    const mail = read("supabase/functions/telegram-order-bot/mail.js");

    check("окремий лист для незавершеного оформлення",
        /export function checkoutLetter\(items, siteUrl\)/.test(mail));

    check("кнопка веде на оформлення, а не в кошик",
        /checkoutLetter[\s\S]{0,900}\/checkout/.test(mail));

    check("порожній склад — листа немає",
        /checkoutLetter[\s\S]{0,200}if \(!list\.length\) return null;/.test(mail));

    check("крок за розкладом бере обидва джерела",
        /remindCarts\(url, key, products, site\)/.test(remindSrc)
        && /remindCheckouts\(url, key, products, site\)/.test(remindSrc));

    check("відсутня міграція = «не налаштовано», а не збій",
        /notConfigured\(`Функції \$\{rpc\} ще немає/.test(remindSrc));

    // Позначку ставимо ЛИШЕ після успішної відправки: інакше збій
    // пошти означав би, що людину викинули з переліку назавжди.
    check("позначка «написали» — тільки після успіху",
        /remindCheckouts[\s\S]{0,1200}if \(ok \|\| !letter\) \{[\s\S]{0,300}mark_checkout_notified/.test(remindSrc));

    check("товарів уже немає в каталозі — позначаємо, щоб не перебирати вічно",
        /remindCheckouts[\s\S]{0,900}товарів уже немає в каталозі/.test(remindSrc));
}

console.log("\n[Форма] Помилки видно там, де курсор щойно був");
{
    const js = fs.readFileSync(path.join(ROOT, "assets/js/checkout.js"), "utf8");
    const css = fs.readFileSync(path.join(ROOT, "assets/css/style.css"), "utf8");

    // ЩО БУЛО НЕ ТАК. Помилки показувались лише після натискання
    // «Оформити замовлення»: людина пропускає «Прізвище», доходить до
    // кінця довгої форми — і аж там дізнається, що треба вертатись.
    check("поле перевіряється при виході з нього",
        /addEventListener\("blur"/.test(js) && /validateField/.test(js));

    // Правило одне на дві перевірки: інакше «що сказали одразу» й
    // «що сказали при надсиланні» рано чи пізно розійдуться.
    check("правила не подвоєні: validateForm ходить тим самим validateField",
        /function validateField/.test(js)
        && /REQUIRED_FIELDS\.forEach\(id => \{\s*if \(!validateField\(id\)\)/.test(js));

    // ПОРОЖНЄ ОБОВ'ЯЗКОВЕ ПОЛЕ ЧЕРВОНІЄ ОДРАЗУ.
    //
    // Спершу тут була умова «лише якщо щось уводили» — щоб прохід
    // формою через Tab не засвітив п'ять червоних полів. На живій
    // сторінці вийшло гірше: людина проминає «Прізвище», не бачить
    // жодного знаку, що воно обов'язкове, і дізнається про це аж у
    // кінці довгої форми.
    check("вихід із поля перевіряє його беззастережно",
        /addEventListener\("blur", \(\) => validateField\(id\)\)/.test(js));

    check("умови «лише якщо торкались» більше немає",
        !/dataset\.touched/.test(js));

    // По батькові — єдине необов'язкове поле блоку. Воно не має
    // червоніти ніколи, і захищає це те, що його немає в переліку.
    check("По батькові не в переліку обов'язкових",
        /REQUIRED_FIELDS = \["firstName", "lastName", "email", "phone", "city"\]/.test(js)
        && !/REQUIRED_FIELDS[^\]]*middleName/.test(js));

    // І в розмітці воно підписане як необов'язкове — інакше людина
    // однаково гадатиме.
    check("і в самій формі сказано, що воно необов'язкове",
        /id="middleName"[\s\S]{0,200}?необов/.test(
            fs.readFileSync(path.join(ROOT, "checkout.html"), "utf8"))
        || /необов[\s\S]{0,200}?id="middleName"/.test(
            fs.readFileSync(path.join(ROOT, "checkout.html"), "utf8")));

    // ВИГЛЯД. Синій на сайті означає дію — кнопки, посилання. Поле,
    // у якому просто стоїть курсор, дією не є.
    check("фокус поля темний, а не синій",
        /\.checkout-form input:focus[\s\S]{0,200}?border-color:var\(--gray900\)/.test(css));

    // Кільце робиться тінню, а не outline: тінь повторює
    // border-radius, а outline Chrome малює прямокутником — саме
    // через це кути виглядали гострими.
    check("кільце кругле (box-shadow, не outline)",
        /\.checkout-form input:focus[\s\S]{0,220}?box-shadow:0 0 0 4px/.test(css));

    check("вибраний спосіб доставки теж темний",
        /input:checked \+ \.delivery-option-card\{[^}]*border-color:var\(--gray900\)/.test(css));
}
console.log(failures ? `\n❌ Провалено: ${failures}` : "\n✅ Незавершене оформлення: нагадуємо один раз і нікого не підписуємо");

process.exit(failures ? 1 : 0);
