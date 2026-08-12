// ======================================
// sync.js
// Синхронізація кошика й обраного між пристроями,
// коли клієнт увійшов у свій акаунт.
//
// Логіка:
// - Гість (не залогінений) — все як і було, працює тільки
//   localStorage, нічого з цього файлу не втручається.
// - У localStorage лежать ГОСТЬОВІ дані (позначки власника нема) —
//   те, що клієнт накидав до входу, ОБ'ЄДНУЄМО з тим, що вже є в
//   акаунті, і зберігаємо результат локально й на сервері.
// - У localStorage лежить КОПІЯ цього ж акаунту (позначка власника
//   збігається) — просто підтягуємо серверні дані, БЕЗ об'єднання.
//   Інакше кількість товарів подвоювалась би при кожному
//   спрацюванні події авторизації.
//
//   Гілку обираємо саме за позначкою власника, а не за типом події
//   (SIGNED_IN / INITIAL_SESSION): supabase-js підключений без
//   фіксованої версії, і склад подій змінюється між релізами.
// - Клієнт вийшов з акаунту (SIGNED_OUT) — чистимо локальний
//   кошик/обране, щоб дані одного акаунту не "перетекли" в
//   наступну гостьову сесію чи інший акаунт на цьому браузері.
//
// Кошик зберігається в localStorage як ПЛОСКИЙ масив — один
// запис на одну одиницю товару (див. common.js). Завдяки
// цьому об'єднання кошиків — це просто конкатенація масивів
// (кількості додаються самі собою через повторення записів).
// Обране — це МНОЖИНА (унікальні id+колір+розмір), тому там
// об'єднання — це union з відкиданням дублів.
// ======================================

function variantKey(entry) {

    return `${entry.id}__${entry.color || ""}__${entry.size || ""}`;

}

function dedupeFavoriteEntries(list) {

    const map = new Map();

    list.forEach(entry => {

        const key = variantKey(entry);

        if (!map.has(key)) {

            map.set(key, { id: entry.id, color: entry.color || null, size: entry.size || null });

        }

    });

    return [...map.values()];

}

// -------------------------
// Перетворення "плаский масив кошика" <-> рядки в Supabase
// (там кошик зберігається згорнутим, з колонкою qty)
// -------------------------

// -------------------------
// Захист від роздування кошика
//
// Кошик зберігається плоским масивом (один запис = одна одиниця),
// тож помилка в об'єднанні множиться дуже швидко: 2^17 = 131072
// записів за 17 повторів. Такий масив ще й розгортається в пам'яті
// при кожному читанні.
//
// Тому обмежуємо кількість однієї позиції розумною межею. Це
// одночасно ЛІКУЄ вже роздуті кошики: при наступному завантаженні
// зайве відрізається й на сервер їде вже нормальна кількість.
// -------------------------

const MAX_QTY_PER_VARIANT = 99;

function clampCart(flatCart) {

    const counts = new Map();
    const result = [];

    (flatCart || []).forEach(entry => {

        const key = variantKey(entry);
        const seen = counts.get(key) || 0;

        if (seen >= MAX_QTY_PER_VARIANT) return;

        counts.set(key, seen + 1);
        result.push(entry);

    });

    return result;

}

// -------------------------
// Кому належить локальний кошик
//
// Без цієї позначки неможливо відрізнити дві різні ситуації:
//   • у localStorage лежать ГОСТЬОВІ товари — їх треба приєднати
//     до акаунту;
//   • у localStorage лежить КОПІЯ кошика цього ж акаунту — тоді
//     приєднувати нічого не можна, інакше кількість подвоїться.
//
// Раніше їх розрізняли за типом події авторизації: SIGNED_IN —
// об'єднати, INITIAL_SESSION — просто підтягнути. Але supabase-js
// підключений без фіксованої версії (@supabase/supabase-js@2), і
// SIGNED_IN почав приходити не лише при справжньому вході, а й при
// поновленні токена та відновленні сесії. Кожен такий випадок
// подвоював кошик.
//
// Позначка власника не залежить від того, яка подія прийшла, —
// тому логіка стала стійкою до змін у бібліотеці.
// -------------------------

const CART_OWNER_KEY = "cartOwner";

function getLocalDataOwner() {
    return localStorage.getItem(CART_OWNER_KEY) || null;
}

function setLocalDataOwner(userId) {

    if (userId) localStorage.setItem(CART_OWNER_KEY, userId);
    else localStorage.removeItem(CART_OWNER_KEY);

}

function groupCartForRemote(flatCart) {

    const map = new Map();

    clampCart(flatCart).forEach(entry => {

        const key = variantKey(entry);
        const existing = map.get(key);

        if (existing) {

            existing.qty += 1;

        } else {

            map.set(key, { product_id: entry.id, color: entry.color || "", size: entry.size || "", qty: 1 });

        }

    });

    return [...map.values()];

}

function expandCartFromRemote(rows) {

    const flat = [];

    (rows || []).forEach(row => {

        const qty = Math.min(Number(row.qty) || 0, MAX_QTY_PER_VARIANT);

        for (let i = 0; i < qty; i++) {

            flat.push({ id: row.product_id, color: row.color || null, size: row.size || null });

        }

    });

    return flat;

}

// -------------------------
// Supabase: кошик
// -------------------------

async function pullCartFromRemote(userId) {

    if (!supabaseClient) return [];

    const { data, error } = await supabaseClient
        .from("cart_items")
        .select("product_id, color, size, qty")
        .eq("user_id", userId);

    if (error) {

        console.error("Не вдалося завантажити кошик з акаунту:", error);

        return [];

    }

    return expandCartFromRemote(data);

}

async function pushCartToRemote(userId, flatCart) {

    if (!supabaseClient) return;

    const rows = groupCartForRemote(flatCart).map(row => ({ ...row, user_id: userId }));

    // найпростіший спосіб гарантовано синхронізувати —
    // повністю перезаписати серверну версію поточною
    await supabaseClient.from("cart_items").delete().eq("user_id", userId);

    if (rows.length) {

        const { error } = await supabaseClient.from("cart_items").insert(rows);

        if (error) console.error("Не вдалося зберегти кошик в акаунт:", error);

    }

}

// -------------------------
// Supabase: обране
// -------------------------

async function pullFavoritesFromRemote(userId) {

    if (!supabaseClient) return [];

    const { data, error } = await supabaseClient
        .from("favorites")
        .select("product_id, color, size")
        .eq("user_id", userId);

    if (error) {

        console.error("Не вдалося завантажити обране з акаунту:", error);

        return [];

    }

    return (data || []).map(row => ({ id: row.product_id, color: row.color || null, size: row.size || null }));

}

async function pushFavoritesToRemote(userId, list) {

    if (!supabaseClient) return;

    const rows = list.map(entry => ({
        user_id: userId,
        product_id: entry.id,
        color: entry.color || "",
        size: entry.size || ""
    }));

    await supabaseClient.from("favorites").delete().eq("user_id", userId);

    if (rows.length) {

        const { error } = await supabaseClient.from("favorites").insert(rows);

        if (error) console.error("Не вдалося зберегти обране в акаунт:", error);

    }

}

// -------------------------
// Дозаписуємо будь-яку локальну зміну кошика/обраного одразу
// в акаунт, поки клієнт залогінений — щоб на іншому пристрої
// завжди був актуальний стан, а не лише "на момент входу"
// -------------------------

let syncedUserId = null;

const baseSaveCart = saveCart;

saveCart = function (cart) {

    baseSaveCart(cart);

    if (syncedUserId) {

        pushCartToRemote(syncedUserId, getCart()).catch(err => console.error("Синхронізація кошика:", err));

    }

};

const baseSaveFavorites = saveFavorites;

saveFavorites = function (list) {

    baseSaveFavorites(list);

    if (syncedUserId) {

        pushFavoritesToRemote(syncedUserId, getFavorites()).catch(err => console.error("Синхронізація обраного:", err));

    }

};

// -------------------------
// Повідомляємо сторінку, що дані підтягнулись з акаунту —
// cart.js / favorites.js перемальовують список, якщо він уже
// встиг відобразитись зі старих (гостьових) даних
// -------------------------

function notifySyncedPagesToRerender() {

    if (typeof renderCart === "function") renderCart();

    if (typeof renderFavorites === "function") renderFavorites();

    if (typeof updateFavoriteButtons === "function") updateFavoriteButtons();

    document.dispatchEvent(new CustomEvent("cartFavoritesSynced"));

}

// -------------------------
// Клієнт щойно увійшов (логін/реєстрація) — об'єднуємо
// гостьові кошик/обране на цьому пристрої з тим, що вже
// збережено в акаунті
// -------------------------

let mergeInFlight = false;

async function mergeGuestDataIntoAccount(userId) {

    if (mergeInFlight) return;

    mergeInFlight = true;

    try {

        const [remoteCart, remoteFavorites] = await Promise.all([
            pullCartFromRemote(userId),
            pullFavoritesFromRemote(userId)
        ]);

        const mergedCart = clampCart(getCart().concat(remoteCart));
        const mergedFavorites = dedupeFavoriteEntries(getFavorites().concat(remoteFavorites));

        setStorage("cart", mergedCart);
        setStorage("favorites", mergedFavorites);

        // локальні дані тепер належать цьому акаунту — повторне
        // об'єднання більше не спрацює
        setLocalDataOwner(userId);

        updateCartCounter();
        updateFavoriteCounter();

        syncedUserId = userId;

        await Promise.all([
            pushCartToRemote(userId, mergedCart),
            pushFavoritesToRemote(userId, mergedFavorites)
        ]);

        notifySyncedPagesToRerender();

    } catch (error) {

        console.error("Об'єднання кошика/обраного з акаунтом:", error);

    } finally {

        mergeInFlight = false;

    }

}

// -------------------------
// Клієнт відкрив сторінку, вже будучи залогіненим раніше —
// підтягуємо акаунтні дані як є, без об'єднання
// -------------------------

async function loadAccountDataAsIs(userId) {

    syncedUserId = userId;

    try {

        const [remoteCart, remoteFavorites] = await Promise.all([
            pullCartFromRemote(userId),
            pullFavoritesFromRemote(userId)
        ]);

        setStorage("cart", remoteCart);
        setStorage("favorites", remoteFavorites);

        // локальна копія належить цьому акаунту
        setLocalDataOwner(userId);

        updateCartCounter();
        updateFavoriteCounter();

        notifySyncedPagesToRerender();

    } catch (error) {

        console.error("Завантаження кошика/обраного з акаунту:", error);

    }

}

function clearLocalCartAndFavorites() {

    syncedUserId = null;

    setStorage("cart", []);
    setStorage("favorites", []);

    // локальні дані знову гостьові
    setLocalDataOwner(null);

    updateCartCounter();
    updateFavoriteCounter();

    notifySyncedPagesToRerender();

}

supabaseClient?.auth.onAuthStateChange((event, session) => {

    const userId = session?.user?.id;

    if (event === "SIGNED_OUT") {

        clearLocalCartAndFavorites();

        return;

    }

    if (!userId) return;

    // Гілку обираємо за ВЛАСНИКОМ локальних даних, а не за типом
    // події. supabase-js підключений без фіксованої версії, і
    // SIGNED_IN приходить не тільки при справжньому вході — а й при
    // поновленні токена та відновленні сесії. Раніше кожен такий
    // випадок запускав об'єднання, і кошик подвоювався: 2^17 = 131072
    // одиниці одного товару за 17 подій.
    if (getLocalDataOwner() === userId) {

        // локальні дані — уже копія цього акаунту, приєднувати нічого
        loadAccountDataAsIs(userId);

    } else {

        // у localStorage гостьові товари (або дані іншого акаунту) —
        // приєднуємо їх до акаунту один раз
        mergeGuestDataIntoAccount(userId);

    }

});
