// Сім'ї кольорів для тестів, які виконують catalog.js у jsdom.
//
// НАВІЩО ОКРЕМИЙ ХЕЛПЕР
// ----------------------
// Тести відкривають catalog.html у своєму вікні jsdom і підкладають
// туди лише ті функції common.js, які потрібні. У браузері common.js
// підключений повністю й іде першим, тож там такої проблеми немає.
//
// Фільтр «Колір» тепер працює сім'ями кольорів (colorFamily та компанія
// в common.js), і без них catalog.js падає на fillColors() з
// «getProductColorFamilies is not defined». Дев'ять тестів підкладали
// той самий набір рядків — тому набір живе в одному місці.
//
// Код беремо з САМОГО common.js, а не копіюємо: копія розійшлася б із
// оригіналом, і тест почав би перевіряти не те, що на сайті.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

function installColorFamilies(window) {

    const common = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8");

    // const з окремого window.eval не видно наступним викликам
    // (jsdom не ділить прив'язання) — кладемо прямо у window.
    window.eval("window.COLOR_FAMILIES = "
        + common.match(/const COLOR_FAMILIES = (\[[\s\S]*?\n\]);\n/)[1] + ";");

    window.eval("window.COLOR_FAMILY_ORDER = COLOR_FAMILIES.map(family => family.name);");

    [
        /function hexToRgb[\s\S]*?\n}\n/,
        /function rgbToHsl[\s\S]*?\n}\n/,
        /function colorFamilyByHex[\s\S]*?\n}\n/,
        /function colorFamily\(name, hex\)[\s\S]*?\n}\n/,
        // Рішення про сімʼю з адмінки — getProductColorFamilies кличе
        // його першим рядком, і без нього стенд падав із
        // ReferenceError ще на розкладці фільтрів.
        /function chosenColorFamily[\s\S]*?\n}\n/,
        // Порядок сімей у фільтрі — fillColors() кличе його щоразу.
        /function orderColorFamilies[\s\S]*?\n}\n/,
        /function getProductColorFamilies[\s\S]*?\n}\n/
    ].forEach(pattern => window.eval(common.match(pattern)[0]));

}

module.exports = { installColorFamilies };
