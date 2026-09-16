// ======================================
// Картка входу: спільна поведінка
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Тих самих кнопок стало два місця: кабінет і оформлення замовлення.
// Вхід через Telegram — це півтори сотні рядків із опитуванням,
// таймером і одноразовим токеном; двома копіями він прожив би рівно
// до першої правки, після чого одна сторінка входила б, а друга ні —
// і помітили б це не одразу.
//
// Тому логіка тут, а розмітка на сторінках своя. Ідентифікатори
// елементів у обох картках однакові навмисно: разом на одній сторінці
// вони не зустрічаються, а однакові імена рятують від переліку
// параметрів, у якому легко помилитись.
//
// ЧОГО ТУТ НЕМАЄ
// ---------------
// Рішення, що робити ПІСЛЯ входу. Кабінет перемальовує себе,
// оформлення ховає картку й підставляє дані в форму — це різні речі,
// і кожна сторінка вирішує їх сама, через onSignedIn.
// ======================================

// Виклик нашої функції, який НІКОЛИ НЕ КИДАЄ ВИНЯТКІВ.
//
// Це не обережність, а виправлена помилка. Спершу тут стояв голий
// fetch. Коли функція недоступна (стара версія без цього маршруту,
// відсутній CORS, обірвана мережа), fetch відхиляється — і обробник
// кліку тихо вмирає посеред себе:
//
//     Uncaught (in promise) TypeError: Failed to fetch
//
// Зовні це «кнопка не працює»: ні екрана очікування, ні повідомлення,
// ні сліду. Перевірено кліком — саме так воно й поводилось.
//
// Тепер відмова мережі приходить як звичайна відповідь зі status 0, і
// кожен, хто цим користується, однаково показує людині рядок.
async function authCallFunction(body) {

    try {

        const response = await fetch(`${SUPABASE_URL}/functions/v1/telegram-order-bot`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
            },
            body: JSON.stringify(body)
        });

        return { status: response.status, data: await response.json().catch(() => null) };

    } catch (error) {

        console.warn("Функція недоступна:", error && error.message);

        return { status: 0, data: null };

    }

}

// Блок і розділювач з'являються, щойно є хоч одна робоча кнопка.
//
// Жодної — картка виглядає так само, як до всього цього: вкладки й
// форма. Порожня рамка з написом «або» була б гірша за її відсутність.
function authShowSocialBlock() {

    const box = document.getElementById("authSocial");
    const divider = document.getElementById("authDivider");

    if (!box) return;

    const shown = [...box.querySelectorAll(".auth-social-btn")]
        .filter(button => !button.hidden).length;

    box.hidden = shown === 0;

    if (divider) divider.hidden = shown === 0;

}

// ПОКАЗУЄМО ЛИШЕ ТІ СПОСОБИ, ЯКІ СПРАВДІ УВІМКНЕНІ.
//
// ЩО СТАЄТЬСЯ БЕЗ ЦЬОГО. signInWithOAuth не повертає помилку в код —
// він ОДРАЗУ переводить браузер на /auth/v1/authorize. Якщо провайдер
// у проєкті не увімкнений, Supabase віддає туди голий JSON:
//
//     {"code":400,"error_code":"validation_failed",
//      "msg":"Unsupported provider: provider is not enabled"}
//
// Тобто людина замість входу бачить білу сторінку з англійським
// машинним текстом і кнопкою «назад». Перевірено в браузері — саме
// так воно й виглядало, а обробник помилки не встигав виконатись
// узагалі.
//
// Тому питаємо Supabase заздалегідь. /auth/v1/settings — відкритий
// маршрут, він перелічує увімкнені провайдери й нічого не розкриває
// (це той самий список, що видно в панелі).
//
// Наслідок, який важливіший за саму помилку: кнопка з'являється сама
// в той момент, коли провайдера увімкнуть у панелі. Нічого не
// перезбирати й не правити в коді.
async function authShowEnabledProviders() {

    const box = document.getElementById("authSocial");

    if (!box) return;

    let enabled = {};

    try {

        const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
            headers: { apikey: SUPABASE_PUBLISHABLE_KEY }
        });

        if (!response.ok) return;

        enabled = (await response.json())?.external || {};

    } catch (error) {

        // Не дісталися — лишаємо як є: вхід поштою працює завжди, і
        // недоступність цього запиту не привід ламати сторінку.
        console.warn("Не вдалося дізнатись способи входу:", error && error.message);

        return;

    }

    // Тільки [data-provider]: кнопка Telegram теж лежить у цьому
    // блоці, але провайдером Supabase не є, і питати про неї
    // /auth/v1/settings безглуздо — вона працює через нашу власну
    // функцію й вмикається окремо.
    box.querySelectorAll("[data-provider]").forEach(button => {
        button.hidden = enabled[button.dataset.provider] !== true;
    });

    authShowSocialBlock();

}

// Вхід через чужий акаунт.
//
// ЧОМУ ЦЕ БЕЗПЕЧНІШЕ ЗА ПАРОЛЬ. Пароля ми не бачимо взагалі: його
// перевіряє Google, а до нас приходить лише підтверджена адреса. Нам
// нічого зберігати — отже, нічого й втрачати.
//
// redirectTo — та сторінка, з якої людина почала: з кабінету вона має
// повернутись у кабінет, з оформлення — до свого замовлення.
async function authSignInWithProvider(provider, button, redirectTo) {

    const box = document.getElementById("authSocialError");

    if (box) box.textContent = "";

    const label = button ? button.textContent : "";

    if (button) {
        button.disabled = true;
        button.textContent = "Відкриваємо...";
    }

    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectTo }
    });

    // Помилка тут означає, що перехід НЕ відбувся: у звичайному разі
    // сторінку вже замінив провайдер, і цей код не виконується.
    if (button) {
        button.disabled = false;
        button.textContent = label;
    }

    if (!error) return;

    console.warn(`Вхід через ${provider} не вдався:`, error.message);

    // НАЙЧАСТІША ПРИЧИНА — ПРОВАЙДЕР НЕ УВІМКНЕНИЙ У ПАНЕЛІ.
    //
    // Кнопка при цьому просто нічого не робить, і зрозуміти чому можна
    // лише в консолі. Кажемо прямо: це наша недоналаштованість, а не
    // помилка людини, і в неї є чим увійти замість цього.
    const notEnabled = /provider is not enabled|unsupported provider/i.test(error.message || "");

    if (box) {
        box.textContent = notEnabled
            ? "Цей спосіб входу ще не під'єднано. Скористайтесь поштою й паролем нижче."
            : "Не вдалося відкрити вікно входу. Спробуйте ще раз або увійдіть поштою.";
    }

}

// САМЕ [data-provider], А НЕ .auth-social-btn.
//
// Клас тут спільний — він про вигляд кнопки. Але Telegram провайдером
// Supabase не є, і в нього свій обробник нижче. З широким селектором
// натискання на Telegram теж ішло сюди, provider ставав undefined, і
// браузер їхав на /auth/v1/authorize?provider=undefined — тобто на
// сторінку з машинною помилкою. Перевірено кліком.
function authBindProviders(redirectTo) {

    document.querySelectorAll(".auth-social-btn[data-provider]").forEach(button => {

        button.addEventListener("click", () => {
            authSignInWithProvider(button.dataset.provider, button, redirectTo);
        });

    });

}

// -------------------------
// Вхід через Telegram
//
// Supabase такого провайдера не має, тож вхід іде через нашого ж
// бота. Чому саме так, а не через Login Widget, і навіщо код —
// у supabase/functions/telegram-order-bot/telegram-login.js.
//
// ЩО РОБИТЬ СТОРІНКА, А ЧОГО НЕ РОБИТЬ. Вона не перевіряє нічого й
// нічого не підписує: просить спробу входу, відкриває бота, чекає, і
// в кінці передає Supabase одноразовий токен, який видала наша
// функція. Сесію відкриває сам Supabase — своїх ми не вигадуємо.
// -------------------------

// Опитування зупиняємо звідусіль: після успіху, після скасування,
// після закриття вкладки. Незупинений таймер тут — це запит кожні дві
// секунди до кінця життя сторінки.
let authTelegramPoll = null;

function authStopTelegram() {

    clearInterval(authTelegramPoll);

    authTelegramPoll = null;

    const wait = document.getElementById("telegramWait");
    const button = document.getElementById("telegramLoginBtn");

    if (wait) wait.hidden = true;
    if (button) button.hidden = false;

}

function authTelegramSay(text) {

    const error = document.getElementById("authSocialError");

    if (error) error.textContent = text;

}

// Підключення кнопки. onSignedIn викликається, коли сесія вже відкрита.
function authBindTelegram(onSignedIn) {

    const button = document.getElementById("telegramLoginBtn");
    const wait = document.getElementById("telegramWait");

    if (!button) return;

    // Показуємо одразу, не питаючи нікого.
    //
    // На відміну від Google, тут нема чого питати: це наш власний бот
    // і наша власна функція, а не провайдер у чужій панелі. І головне —
    // відмова тут не страшна: людина побачить зрозумілий рядок під
    // кнопкою, а не білу сторінку з англійським JSON.
    button.hidden = false;

    authShowSocialBlock();

    document.getElementById("telegramCancel")?.addEventListener("click", authStopTelegram);

    button.addEventListener("click", async () => {

        authTelegramSay("");

        button.disabled = true;

        const { status, data } = await authCallFunction({ site_action: "telegram-login-start" });

        button.disabled = false;

        if (status === 429) {
            authTelegramSay("Забагато спроб. Спробуйте за годину.");
            return;
        }

        if (!data?.ok || !data.link) {
            // Не «або Google»: його може бути не увімкнено, і тоді
            // порада вказувала б на кнопку, якої на екрані немає.
            // Пошта з паролем є завжди.
            authTelegramSay("Вхід через Telegram зараз недоступний."
                + " Скористайтесь поштою й паролем нижче.");
            return;
        }

        const code = document.getElementById("telegramCode");

        if (code) code.textContent = data.code;

        button.hidden = true;

        if (wait) wait.hidden = false;

        // НОВА ВКЛАДКА, А НЕ ПЕРЕХІД.
        //
        // Ця сторінка мусить лишитись живою: саме вона чекає на
        // підтвердження й відкриває наступний крок. Пішовши з неї,
        // людина повернулась би на порожню форму входу, а підтверджена
        // спроба згоріла б.
        window.open(data.link, "_blank", "noopener");

        authWaitForTelegram(data.token, onSignedIn);

    });

}

function authWaitForTelegram(token, onSignedIn) {

    clearInterval(authTelegramPoll);

    // Дві секунди: людина підтверджує в іншій програмі, і секунда тут
    // нічого б не пришвидшила, зате подвоїла б кількість запитів.
    // Спроба живе п'ять хвилин — довше не чекаємо.
    const started = Date.now();

    authTelegramPoll = setInterval(async () => {

        if (Date.now() - started > 5 * 60 * 1000) {

            authStopTelegram();

            authTelegramSay("Час вийшов. Натисніть «Увійти через Telegram» ще раз.");

            return;

        }

        const { data } = await authCallFunction({
            site_action: "telegram-login-status",
            token
        });

        if (!data || data.state === "waiting") return;

        if (data.state !== "confirmed" || !data.tokenHash) {

            authStopTelegram();

            authTelegramSay(data.state === "expired"
                ? "Час вийшов. Спробуйте ще раз."
                : "Не вдалося завершити вхід. Спробуйте ще раз.");

            return;

        }

        clearInterval(authTelegramPoll);
        authTelegramPoll = null;

        // Сесію відкриває Supabase за одноразовим токеном, який видала
        // наша функція.
        const { error } = await supabaseClient.auth.verifyOtp({
            token_hash: data.tokenHash,
            type: "email"
        });

        if (error) {

            console.warn("Сесію не відкрито:", error.message);

            authStopTelegram();

            authTelegramSay("Не вдалося завершити вхід. Спробуйте ще раз.");

            return;

        }

        authStopTelegram();

        await onSignedIn();

    }, 2000);

}

// Переклад типових помилок Supabase Auth.
//
// Вони приходять англійською й машинними формулюваннями: «Invalid
// login credentials» нічого не каже тому, хто просто помилився в
// паролі.
//
// Жив у account.js, переїхав сюди разом із рештою входу: картка
// оформлення показує ті самі помилки, і другий переклад тих самих
// рядків розійшовся б із першим.
function translateAuthError(error) {

    const msg = error?.message || "";
    const code = error?.code || "";

    if (code === "same_password" || msg.includes("different from the old password")) {
        return "Новий пароль повинен відрізнятися від поточного";
    }

    if (msg.includes("Invalid login credentials")) return "Невірний email або пароль";
    if (msg.includes("User already registered")) return "Користувач із таким email вже зареєстрований";
    if (msg.includes("Password should be")) return "Пароль надто короткий (мінімум 6 символів)";
    if (msg.includes("rate limit")) return "Забагато спроб. Спробуйте трохи пізніше";

    return "Сталася помилка. Спробуйте ще раз";

}
