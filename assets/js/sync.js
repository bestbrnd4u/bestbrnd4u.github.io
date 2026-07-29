// ======================================
// sync.js
// Синхронізація кошика й обраного між пристроями,
// коли клієнт увійшов у свій акаунт.
//
// Логіка:
// - Гість (не залогінений) — все як і було, працює тільки
//   localStorage, нічого з цього файлу не втручається.
// - Клієнт УВІЙШОВ (подія SIGNED_IN, тобто саме зараз ввів
//   логін/пароль або зареєструвався) — те, що встиг накидати
//   в кошик/обране як гість на ЦЬОМУ пристрої, ОБ'ЄДНУЄМО з
//   тим, що вже є в його акаунті (з інших пристроїв), і
//   зберігаємо об'єднаний результат і локально, і на сервері.
// - Клієнт ВІДКРИВ сторінку, уже будучи залогіненим раніше
//   (подія INITIAL_SESSION) — просто підтягуємо те, що
//   збережено в акаунті, і показуємо (без об'єднання: інакше
//   при кожному відкритті сторінки кількість товарів в кошику
//   подвоювалась би).
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

function groupCartForRemote(flatCart) {

    const map = new Map();

    flatCart.forEach(entry => {

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

        for (let i = 0; i < row.qty; i++) {

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

        const mergedCart = getCart().concat(remoteCart);
        const mergedFavorites = dedupeFavoriteEntries(getFavorites().concat(remoteFavorites));

        setStorage("cart", mergedCart);
        setStorage("favorites", mergedFavorites);

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

    updateCartCounter();
    updateFavoriteCounter();

    notifySyncedPagesToRerender();

}

supabaseClient?.auth.onAuthStateChange((event, session) => {

    if (event === "SIGNED_IN" && session?.user) {

        mergeGuestDataIntoAccount(session.user.id);

    } else if (event === "INITIAL_SESSION" && session?.user) {

        loadAccountDataAsIs(session.user.id);

    } else if (event === "SIGNED_OUT") {

        clearLocalCartAndFavorites();

    }

});
