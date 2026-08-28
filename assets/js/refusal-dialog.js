// ======================================
// Вікно відмови від товару
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Кнопка «Відмова» стояла під КОНКРЕТНИМ товаром, але надсилала
// відмову від УСЬОГО замовлення: у листі опинялись усі товари й повна
// сума. Ілля натиснув відмову на одній парі кросівок — отримав лист
// про дві речі на 25 060 грн.
//
// Причина проста: кнопка знала лише номер замовлення (data-order), а
// про товар — нічого.
//
// ЩО ТЕПЕР
// ---------
// Вікно, у якому видно склад замовлення. Товар, під яким натиснули,
// відмічений одразу — але можна додати інші або зняти. Поле причини
// обов'язкове, фото — за бажанням.
//
// НАВІЩО ПРИЧИНА Й ФОТО
// ----------------------
// «Відмова» без пояснення нічого не каже: не підійшов розмір, не той
// колір, брак, передумав — і в кожному випадку магазин діє інакше. Фото
// потрібне, коли йдеться про стан товару: словами «трохи потерта
// пряжка» не оцінити.
//
// Просимо, а не вимагаємо: фото обов'язковим не робимо, бо людина може
// відмовлятись просто через розмір, і тоді знімок ні до чого.
// ======================================

(function (root) {

    "use strict";

    // Ліміт FormSubmit — 10 МБ на всі вкладення разом. Беремо 8, щоб
    // лишити запас на текст листа: лист, який не дійшов через розмір,
    // гірший за лист без фото.
    var MAX_TOTAL_BYTES = 8 * 1024 * 1024;
    var MAX_FILES = 5;

    function bytesLabel(bytes) {

        return (bytes / 1024 / 1024).toFixed(1) + " МБ";

    }

    // Показує вікно й повертає Promise з рішенням користувача:
    // { items: [...], reason: "…", files: [File, …] } або null, якщо
    // відмовився від самої відмови.
    // refusedKeys — позиції, на які заявку вже подали. Такі рядки
    // показуємо, але відмітити їх не можна: див. коментар нижче.
    function askRefusal(order, preselectedIndex, refusedKeys) {

        return new Promise(function (resolve) {

            var items = Array.isArray(order.items) ? order.items : [];

            var overlay = document.createElement("div");

            overlay.className = "refusal-overlay";

            var refused = refusedKeys instanceof Set ? refusedKeys : new Set(refusedKeys || []);

            function itemKey(item) {

                return [item && item.title, item && item.color, item && item.size]
                    .map(function (part) { return String(part || ""); })
                    .join("|");

            }

            var rows = items.map(function (item, index) {

                var meta = [item.color, item.size, item.qty > 1 ? item.qty + " шт." : ""]
                    .filter(Boolean).join(" · ");

                var sum = (Number(item.price) || 0) * (Number(item.qty) || 1);

                // Позиція, на яку заявку вже подали.
                //
                // ЧОМУ ПОКАЗУЄМО, А НЕ ХОВАЄМО. Вікно показує СКЛАД
                // замовлення — прибрана позиція виглядала б як помилка
                // («а де друга сумка?»), та й відмітити решту було б
                // важче: список більше не збігається з тим, що в картці.
                //
                // Але відмітити її не можна: друга заявка на той самий
                // товар — це другий лист і друге сповіщення менеджеру
                // про те саме. Для магазину це виглядає як два різні
                // повернення.
                var alreadySent = refused.has(itemKey(item));

                // Товар, під яким натиснули, відмічений одразу: у
                // більшості випадків відмовляються саме від нього, і
                // зайвий клац ні до чого.
                var checked = index === preselectedIndex && !alreadySent ? " checked" : "";

                return ''
                    + '<label class="refusal-item' + (alreadySent ? ' refusal-item-sent' : '') + '">'
                    + '  <input type="checkbox" value="' + index + '"' + checked
                    + (alreadySent ? ' disabled' : '') + '>'
                    + '  <img src="' + (item.image || "assets/images/no-image.png") + '"'
                    + '       alt="" onerror="this.onerror=null;this.src=\'assets/images/no-image.png\'">'
                    + '  <span class="refusal-item-info">'
                    + '    <b>' + (item.title || "Товар") + '</b>'
                    + (meta ? '<span class="refusal-item-meta">' + meta + '</span>' : "")
                    + (alreadySent ? '<span class="refusal-item-sent-note">Заявку вже надіслано</span>' : "")
                    + '  </span>'
                    + '  <span class="refusal-item-sum">' + sum.toLocaleString("uk-UA") + ' грн</span>'
                    + '</label>';

            }).join("");

            overlay.innerHTML = ''
                + '<div class="refusal-dialog" role="dialog" aria-modal="true"'
                + '     aria-labelledby="refusalTitle">'
                + '  <h3 id="refusalTitle">Відмова від товару</h3>'
                + '  <p class="refusal-hint">Відмітьте, від чого саме відмовляєтесь.</p>'
                + '  <div class="refusal-items">' + rows + '</div>'
                + '  <label class="refusal-field">'
                + '    <span>Причина відмови</span>'
                + '    <textarea rows="3" maxlength="1000"'
                + '              placeholder="Наприклад: не підійшов розмір, замалий у плечах"></textarea>'
                + '  </label>'
                + '  <label class="refusal-field">'
                + '    <span>Фото (за бажанням)</span>'
                + '    <input type="file" accept="image/*" multiple>'
                + '    <small>Якщо йдеться про стан товару — покажіть на фото.'
                + ' До ' + MAX_FILES + ' знімків, разом до ' + bytesLabel(MAX_TOTAL_BYTES) + '.</small>'
                + '  </label>'
                + '  <p class="refusal-error" hidden></p>'
                + '  <div class="refusal-actions">'
                + '    <button type="button" class="btn btn-outline" data-refusal="cancel">Скасувати</button>'
                + '    <button type="button" class="btn" data-refusal="send">Надіслати</button>'
                + '  </div>'
                + '</div>';

            document.body.appendChild(overlay);
            document.body.classList.add("refusal-open");

            var dialog = overlay.querySelector(".refusal-dialog");
            var textarea = overlay.querySelector("textarea");
            var fileInput = overlay.querySelector('input[type="file"]');
            var errorBox = overlay.querySelector(".refusal-error");

            function fail(message) {

                errorBox.textContent = message;
                errorBox.hidden = false;

            }

            function close(result) {

                document.body.classList.remove("refusal-open");
                overlay.remove();
                document.removeEventListener("keydown", onKey);

                resolve(result);

            }

            function onKey(event) {

                // Escape закриває — звична поведінка вікна. Без цього
                // єдиний шлях назовні це кнопка, і люди тиснуть браузерну
                // «назад», втрачаючи сторінку.
                if (event.key === "Escape") close(null);

            }

            document.addEventListener("keydown", onKey);

            overlay.addEventListener("click", function (event) {

                // Клац по тлу закриває, по самому вікну — ні.
                if (event.target === overlay) { close(null); return; }

                var action = event.target.closest("[data-refusal]");

                if (!action) return;

                if (action.dataset.refusal === "cancel") { close(null); return; }

                var checked = [...overlay.querySelectorAll('input[type="checkbox"]:checked')]
                    .map(function (box) { return items[Number(box.value)]; })
                    .filter(Boolean)
                    // Ще одна перевірка вже після вибору: disabled можна
                    // зняти через інструменти розробника, а другий лист
                    // про те саме повернення магазину не потрібен.
                    .filter(function (item) { return !refused.has(itemKey(item)); });

                if (!checked.length) {
                    fail("Відмітьте хоча б один товар.");
                    return;
                }

                var reason = textarea.value.trim();

                // Причину вимагаємо: без неї магазин не знає, що робити
                // з товаром і чи можна його продати далі.
                if (reason.length < 5) {
                    fail("Опишіть причину — хоча б кількома словами.");
                    return;
                }

                var files = [...(fileInput.files || [])];

                if (files.length > MAX_FILES) {
                    fail("Не більше " + MAX_FILES + " знімків.");
                    return;
                }

                var totalBytes = files.reduce(function (sum, file) {
                    return sum + file.size;
                }, 0);

                // Перевіряємо ДО надсилання: інакше лист піде й тихо
                // не дійде, а людина побачить «надіслано».
                if (totalBytes > MAX_TOTAL_BYTES) {
                    fail("Фото разом важать " + bytesLabel(totalBytes)
                        + ". Ліміт — " + bytesLabel(MAX_TOTAL_BYTES) + ".");
                    return;
                }

                // Поле з файлами віддаємо ВУЗЛОМ, а не лише списком File.
                //
                // НАВІЩО. Лист із фото йде звичайним multipart-POST у
                // прихований iframe — так вимагає FormSubmit. Зібрати
                // такий POST найпростіше, переставивши в приховану форму
                // те саме поле, у яке людина щойно обрала знімки: файли
                // подорожують разом з ним, і нічого копіювати не треба.
                //
                // Забираємо його з вікна ДО close(): там overlay
                // видаляється разом з усім вмістом, і поле зникло б.
                fileInput.remove();

                close({
                    items: checked,
                    reason: reason,
                    files: files,
                    fileInput: fileInput
                });

            });

            // Фокус у поле причини: це головне, що тут заповнюють.
            setTimeout(function () { textarea.focus(); }, 50);

        });

    }

    root.RefusalDialog = { ask: askRefusal, MAX_FILES: MAX_FILES, MAX_TOTAL_BYTES: MAX_TOTAL_BYTES };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).RefusalDialog;
}
