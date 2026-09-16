// ======================================
// Картка входу перед оформленням замовлення
//
// НАВІЩО ВОНА ТУТ
// ----------------
// Магазин навмисно продає без реєстрації: змусити завести кабінет
// заради однієї покупки — найпростіший спосіб втратити покупця. Але й
// мовчати не варто: у того, хто ввійшов, контакти й адреса
// підставляться самі, а замовлення потім знайдеться в кабінеті.
//
// Тому картка — пропозиція, а не ворота. Три виходи, усі ведуть до тієї
// самої форми нижче:
//
//   увійшов поштою  → картка зникає, дані підставляються;
//   увійшов чужим акаунтом → сторінка перезавантажиться сама, і
//                            картки вже не буде;
//   «продовжити»    → картка зникає, і більше не питаємо.
//
// ЧОГО ТУТ НЕМАЄ
// ---------------
// Самої логіки входу. Вона спільна з кабінетом і живе в
// assets/js/auth-widget.js — ті самі кнопки, той самий Telegram, ті
// самі помилки. Тут лишається рівно те, що відрізняє оформлення від
// кабінету: що робити ПІСЛЯ входу.
// ======================================

(function () {

    "use strict";

    const card = document.getElementById("checkoutAuth");

    if (!card || typeof supabaseClient === "undefined" || !supabaseClient) return;

    // ВІДМОВУ ПАМ'ЯТАЄМО ДО КІНЦЯ ВІЗИТУ, А НЕ ДОВШЕ.
    //
    // sessionStorage, а не localStorage: «я зараз куплю без кабінету»
    // сказано про цю покупку, а не назавжди. Наступного разу пропозиція
    // доречна знову — а на цій покупці другого разу питати не можна:
    // людина натиснула «продовжити», перезавантажила сторінку й побачила
    // те саме вікно. Це читається як «мене не почули».
    const SKIP_KEY = "bb4u:checkout-guest";

    function skipped() {

        try {
            return window.sessionStorage.getItem(SKIP_KEY) === "1";
        } catch (error) {
            // Приватне вікно або заборонені дані сайту.
            return false;
        }

    }

    function rememberSkip() {

        try {
            window.sessionStorage.setItem(SKIP_KEY, "1");
        } catch (error) { /* див. вище */ }

    }

    function hideCard() {

        card.hidden = true;

    }

    // Після входу картка зникає, а форма отримує дані з профілю —
    // заради цього вхід тут і пропонується.
    async function signedIn() {

        hideCard();

        if (typeof prefillFromProfile === "function") {

            try {
                await prefillFromProfile();
            } catch (error) {
                // Підстановка — зручність, а не умова покупки. Не
                // вийшло — людина впише сама, форма від цього не
                // ламається.
                console.warn("Не вдалося підставити дані профілю:", error && error.message);
            }

        }

    }

    async function start() {

        // Уже ввійшов — пропонувати нема чого.
        const user = await getCurrentUser();

        if (user) return;

        if (skipped()) return;

        card.hidden = false;

        // Куди повернутись після чужого акаунту: сюди ж, до свого
        // кошика. Повернення в кабінет означало б загублену покупку.
        authBindProviders(window.location.origin + "/checkout");

        authShowEnabledProviders();

        authBindTelegram(signedIn);

    }

    document.getElementById("checkoutGuest")?.addEventListener("click", () => {

        rememberSkip();

        hideCard();

    });

    document.getElementById("loginForm")?.addEventListener("submit", async event => {

        event.preventDefault();

        const emailEl = document.getElementById("loginEmail");
        const passwordEl = document.getElementById("loginPassword");
        const errorEl = document.getElementById("loginError");
        const submitEl = document.getElementById("loginSubmit");

        if (!emailEl || !passwordEl) return;

        errorEl.textContent = "";

        const email = emailEl.value.trim();
        const password = passwordEl.value;

        if (!email || !password) {
            errorEl.textContent = "Вкажіть пошту й пароль";
            return;
        }

        submitEl.disabled = true;
        submitEl.textContent = "Входимо...";

        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

        submitEl.disabled = false;
        submitEl.textContent = "Увійти";

        if (error) {

            errorEl.textContent = translateAuthError(error);

            return;

        }

        await signedIn();

    });

    start();

}());
