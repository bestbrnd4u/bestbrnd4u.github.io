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

    return window;

}

module.exports = { installBrowserStubs };
