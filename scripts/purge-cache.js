// Скидає кеш Cloudflare після виливки сайту.
//
// НАВІЩО ЦЕ ОБОВ'ЯЗКОВО, А НЕ БАЖАНО
// -----------------------------------
// Правило кешу для HTML (див. docs/КЕШ.md) тримає сторінки на краю
// Cloudflare. Це добре для швидкості й знімає навантаження з GitHub
// Pages — але має наслідок, який видно не одразу: після виливки край
// ще ДВІ ГОДИНИ віддає стару сторінку.
//
// Саме на це й натрапили: Sync branches відпрацював, прод-збірка
// відпрацювала, у main усе на місці, файли на GitHub Pages нові — а
// на сайті змін немає. Заміряно:
//
//   cf-cache-status: HIT
//   Age: 2883            (48 хвилин у кеші)
//   Cache-Control: max-age=7200
//
// В обхід кеша (унікальна адреса) та сама сторінка приходила вже
// новою. Тобто зламаного не було нічого — просто край не знав, що
// сторінка змінилась.
//
// Без цього кроку кожна правка через адмінку доїжджала б до покупця
// із затримкою до двох годин, і власник щоразу гадав би, чи вона
// взагалі поїхала.
//
// ЧОМУ САМЕ purge_everything
// ---------------------------
// Очищення за префіксом («усе, крім /assets/») доступне лише на
// Enterprise. Очищення за переліком адрес на безкоштовному тарифі
// обмежене 30 адресами за запит, а сторінок у нас понад двісті —
// це вісім запитів і перелік, який розійдеться з сайтом.
//
// purge_everything викидає з краю й файли коду, але це майже нічого
// не коштує: вони незмінні, край візьме їх із origin по одному разу,
// а в браузерах покупців вони лишаються на рік (адреса з відбитком).
//
// ЩО БУДЕ, ЯКЩО КЛЮЧА НЕМА
// -------------------------
// Нічого. Крок скаже про це попередженням і завершиться успішно:
// сайт уже вилитий, кеш просто спорожніє сам за дві години.
//
// ЗАПУСК
//   node scripts/purge-cache.js
//   node scripts/purge-cache.js --dry-run    показати, не чистити

const { notConfigured } = require("./site-env");

const DRY = process.argv.includes("--dry-run");

const API = "https://api.cloudflare.com/client/v4";

// Розбір відповіді Cloudflare — окремою чистою функцією, щоб її
// перевіряв тест: сам мережевий виклик у тесті не зробиш.
function purgeVerdict(status, data) {

    if (status === 200 && data && data.success === true) return { ok: true };

    const errors = data && Array.isArray(data.errors)
        ? data.errors.map(e => `${e.code}: ${e.message}`).join("; ")
        : "";

    // 403 і 10000 — найчастіша причина: у токена немає права
    // Zone → Cache Purge, або він виданий на іншу зону.
    if (status === 403 || /10000/.test(errors)) {
        return { ok: false, reason: `немає прав на очищення кеша (${errors || status})` };
    }

    if (status === 404) {
        return { ok: false, reason: "зону не знайдено — перевірте CLOUDFLARE_ZONE_ID" };
    }

    return { ok: false, reason: errors || `HTTP ${status}` };

}

async function main() {

    const token = process.env.CLOUDFLARE_API_TOKEN;
    const zone = process.env.CLOUDFLARE_ZONE_ID;

    if (!token || !zone) {

        notConfigured("Немає ключа Cloudflare — кеш не чищу"
            + " (сторінки оновляться самі за дві години, див. docs/КЕШ.md)");

        return;

    }

    if (DRY) {

        console.log(`Це був звіт: скинув би кеш зони ${zone.slice(0, 6)}…`);

        return;

    }

    let response;

    try {

        response = await fetch(`${API}/zones/${zone}/purge_cache`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ purge_everything: true })
        });

    } catch (error) {

        // Cloudflare недоступний — сайт від цього не страдає.
        console.log(`::warning::Cloudflare не відповів: ${error.message}`);

        return;

    }

    const data = await response.json().catch(() => null);

    const verdict = purgeVerdict(response.status, data);

    if (!verdict.ok) {

        // Попередження, а не помилка: сторінка вже вилита, і валити
        // через кеш успішний деплой означало б червоний прапорець там,
        // де все насправді на місці.
        console.log(`::warning::Кеш не скинувся — ${verdict.reason}`);

        return;

    }

    console.log("Готово: кеш Cloudflare скинуто — сторінки оновились одразу");

}

if (require.main === module) {

    main().catch(error => {

        console.log(`::warning::Очищення кеша не відпрацювало: ${error.message}`);

    });

}

module.exports = { purgeVerdict };
