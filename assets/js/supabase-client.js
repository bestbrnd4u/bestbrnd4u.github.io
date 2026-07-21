// ======================================
// supabase-client.js
// Підключення до Supabase: авторизація клієнтів
// та історія їхніх замовлень.
//
// Публікований (publishable) ключ нижче — безпечний
// для показу в клієнтському коді за задумом Supabase:
// він не дає прав в обхід RLS-політик бази даних.
// ======================================

const SUPABASE_URL = "https://hyfodsznpeeecgtgffub.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_imbIdZ0a4I14x1rftMKRLQ_nn9FJmy6";

const supabaseClient = window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

if (!supabaseClient) {
    console.error("Supabase SDK не завантажився — перевірте підключення скрипта в <head>.");
}

// -------------------------
// Поточний користувач
// -------------------------

async function getCurrentUser() {

    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient.auth.getUser();

    if (error) return null;

    return data?.user || null;

}

// -------------------------
// Іконка "Кабінет" у шапці сайту —
// присутня на всіх сторінках однаково
// -------------------------

async function updateAccountIcon() {

    const link = document.getElementById("accountLink");

    if (!link) return;

    const user = await getCurrentUser();

    link.classList.toggle("logged-in", Boolean(user));
    link.title = user ? user.email : "Увійти або зареєструватися";

}

updateAccountIcon();

supabaseClient?.auth.onAuthStateChange(() => {

    updateAccountIcon();

});
