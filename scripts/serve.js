// Локальний перегляд зібраного сайту й адмінки.
//
// НАВІЩО
// -------
// Сайт статичний, але відкрити його з файлової системи (file://) не
// вийде: браузер забороняє fetch до сусідніх файлів, а на ньому тримається
// все — каталог, акції, кошик. Потрібен звичайний http.
//
// Друга причина важливіша: ЛОКАЛЬНА АДМІНКА. У admin/config.yml є
// local_backend: true — з ним Decap працює з файлами цього репозиторію
// напряму, без GitHub і без пароля. Але адмінку теж треба чимось
// віддати, і саме цим.
//
// ЗАПУСК
//   npm run build          зібрати
//   npm run serve          цей сервер
//   http://localhost:8100/       сайт
//   http://localhost:8100/admin/ адмінка
//
// Для адмінки в сусідньому вікні має крутитись `npx decap-server` —
// це вона стукає на localhost:8081 і саме через нього пише у файли.
//
// ЧОГО ЦЕЙ СЕРВЕР НЕ ВДАЄ
// ------------------------
// Заголовків кешу з проду (max-age=7200) тут немає — і це навмисно:
// локально потрібно бачити щойно зібране, а не вчорашнє. Тобто
// перевірити ТУТ поведінку кеша не можна, для цього є дев.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const PORT = Number(process.env.PORT) || 8100;

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".yml": "text/yaml; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".mp4": "video/mp4"
};

function resolve(url) {

    // Виходити за межі теки не даємо: сервер локальний, але ".." у
    // шляху — це звичка, яку не варто заводити.
    const safe = path.normalize(url).replace(/^(\.\.[/\\])+/, "");

    let file = path.join(ROOT, safe === "/" ? "index.html" : safe);

    if (!file.startsWith(ROOT)) return null;

    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        file = path.join(file, "index.html");
    }

    // Адреси сайту без .html: /catalog, /checkout, /promo.
    if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";

    return fs.existsSync(file) ? file : null;

}

http.createServer((req, res) => {

    const url = decodeURIComponent(req.url.split("?")[0]);

    const file = resolve(url);

    if (!file) {
        res.writeHead(404, { "Content-Type": TYPES[".txt"] });
        res.end("404: " + url);
        return;
    }

    res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        // Нічого не кешуємо: локально дивляться щойно зібране.
        "Cache-Control": "no-store"
    });

    fs.createReadStream(file).pipe(res);

}).listen(PORT, () => {

    console.log(`Сайт:    http://localhost:${PORT}/`);
    console.log(`Адмінка: http://localhost:${PORT}/admin/   (потрібен ще npx decap-server)`);

});
