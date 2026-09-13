// Заглушки, яких потребує код сайту, коли тест виконує окремий файл.
//
// НАВІЩО
// -------
// Частина тестів бере ОДИН файл (mega-menu.js, шматок product.js) і
// виконує його у своєму вікні jsdom — без common.js. У браузері такого
// не буває: common.js підключений на кожній сторінці й іде першим.
//
// Через це тести падали з «dataUrl is not defined», щойно fetch даних
// перевели на версіоновані адреси (див. scripts/apply-cache-version.js).
// Сам сайт при цьому працює правильно — ламався саме стенд.
//
// Тримати це в одному місці, а не дописувати в кожен тест: інакше
// наступний тест, який виконує окремий файл, спіткнеться так само.
function installBrowserStubs(window) {

    // Версія файлу даних. На сайті її дає common.js, підставляючи
    // відбиток із window.ASSET_VERSIONS. У тесті версій немає, тож
    // повертаємо адресу як є — саме так поводиться і сайт, якщо крок
    // збірки не виконувався.
    if (typeof window.dataUrl !== "function") {
        window.dataUrl = url => url;
    }

    // Адреса полегшеного каталогу. На сайті її дає common.js — з неї
    // беруть товари всі списки (див. scripts/build-products.js).
    if (typeof window.catalogUrl !== "function") {
        window.catalogUrl = () => "data/catalog.json";
    }

    // Спільний кеш товарів. Тести, які виконують окремий файл, самі
    // підміняють fetch — тож тут просто ходимо через нього.
    if (typeof window.getAllProductsCached !== "function") {
        window.getAllProductsCached = () => window.fetch(window.catalogUrl())
            .then(response => response.json())
            .catch(() => []);
    }

    // Показ повідомлень — у тестах не потрібен, але код його викликає.
    if (typeof window.showToast !== "function") {
        window.showToast = () => {};
    }

    // «Коли браузер звільниться». У jsdom цього немає, у браузерах є.
    //
    // Через нього меню шапки відкладає завантаження каталогу (42 КБ по
    // дроту на КОЖНІЙ сторінці) — щоб той не змагався за мережу з
    // фото товару. Без заглушки код пішов би запасним шляхом із
    // setTimeout на секунду, і тест мусив би чекати на нього дарма.
    //
    // Викликаємо на наступному такті: саме так поводиться браузер,
    // якому нічого більше робити.
    if (typeof window.requestIdleCallback !== "function") {
        window.requestIdleCallback = callback => setTimeout(() => callback({
            didTimeout: false,
            timeRemaining: () => 50
        }), 0);
    }

    // Ціна товару «прямо зараз» — ціна дня, якщо вона діє.
    //
    // НЕ ЗАГЛУШКА, А СПРАВЖНІЙ КОД. Решта цього файлу — заглушки: вони
    // імітують те, чого в jsdom немає взагалі (requestIdleCallback,
    // showToast). Тут інакше: функції існують, вони в common.js, і
    // переписати їх тут спрощено означало б, що тест перевіряє одну
    // ціну, а покупець бачить іншу. Тому беремо їх із джерела.
    //
    // Потрібні всім, хто виконує ОДИН файл сайту: mega-menu.js фільтрує
    // розділ «Акції» за відсотком знижки, ui.js малює ціну на картці,
    // catalog.js сортує за нею.
    installPriceApi(window);

    return window;

}

const PRICE_API = ["saleActive", "priceNow", "oldPriceNow", "discountPercent"];

function installPriceApi(window) {

    if (typeof window.priceNow === "function") return;

    const fs = require("fs");
    const path = require("path");

    const common = fs.readFileSync(
        path.join(__dirname, "..", "..", "assets", "js", "common.js"), "utf8");

    PRICE_API.forEach(name => {

        const found = common.match(new RegExp("function " + name + "[\\s\\S]*?\\n}\\n"));

        if (!found) throw new Error(`не знайшов ${name}() у common.js`);

        window.eval(found[0]);

    });

}

module.exports = { installBrowserStubs, installPriceApi, PRICE_API };
