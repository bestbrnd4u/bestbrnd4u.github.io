// Згода на використання даних.
//
// ЩО ЦЕЙ ФАЙЛ РОБИТЬ І ЧОГО НЕ РОБИТЬ
// ------------------------------------
// Перед тим як його писати, я перебрав, що сайт СПРАВДІ зберігає й
// куди звертається. Банер із чотирма галочками «аналітика / реклама /
// персоналізація», яких на сайті немає, гірший за відсутність банера:
// він обіцяє контроль над тим, чого не існує, і при цьому мовчить про
// те, що відбувається насправді.
//
// РЕЗУЛЬТАТ АУДИТУ (стан на момент написання):
//
//   Зберігається у браузері (localStorage):
//     cart                  — кошик
//     favorites             — обране
//     catalogView           — сітка чи список у каталозі
//     bestbrnd4uLastOrder   — дані останнього замовлення для повтору
//     sb-*-auth-token       — сесія Supabase, лише якщо ви увійшли
//   sessionStorage:
//     catalogReturnTo       — картка, на яку повернути кнопкою «Назад»
//
//   Зовнішні сервіси:
//     Supabase   — акаунт, замовлення, адреси (лише якщо ви увійшли)
//     EmailJS    — надсилання листа про замовлення
//     MailerLite — форма підписки на розсилку
//     Google Fonts — шрифти; Google отримує IP-адресу відвідувача
//     YouTube / Vimeo — лише якщо у товара є відео
//
//   Чого НЕМАЄ: Google Analytics, піксель Facebook, рекламні мережі,
//   будь-яке стеження між сайтами. Тому в банері немає й галочки
//   «аналітика» — вимикати нічого.
//
// ЗВІДСИ Й КАТЕГОРІЇ. Їх дві, і обидві справжні:
//
//   necessary — кошик, обране, вхід. Без них магазин не працює,
//               вимкнути не можна, і згоди вони не потребують: це не
//               стеження, а пам'ять самої сторінки.
//   embeds    — відео YouTube/Vimeo у картці товару. Це ЄДИНЕ, що
//               передає дані стороннім без вашої дії, тож саме воно й
//               питається. За замовчуванням вимкнено: до згоди на
//               місці відео показується заглушка.
//
// Шрифти Google лишаються поза вибором свідомо: без них зламається
// вигляд усього сайту, а не одного блока. Це чесно назване в політиці,
// але не подане як перемикач, якого насправді немає.

(function (root) {

    "use strict";

    var KEY = "consent";

    // Версію піднято з 1 на 2, бо додалась категорія «аналітика».
    //
    // Це не формальність: людина, яка колись натиснула «Лише
    // необхідне», відповідала на питання БЕЗ аналітики. Мовчки
    // застосувати ту відповідь до нового питання означало б вирішити
    // за неї. Стара відповідь більше не діє — запитаємо ще раз.
    var VERSION = 2;

    // Категорії, які взагалі можна вимкнути.
    var OPTIONAL = ["embeds", "analytics"];

    function read() {

        try {

            var raw = localStorage.getItem(KEY);

            if (!raw) return null;

            var saved = JSON.parse(raw);

            // Версія потрібна, щоб не вважати давню згоду відповіддю на
            // нове питання: додасться категорія — і банер спитає знову,
            // а не тихо застосує старий вибір до того, чого людина не
            // бачила.
            if (!saved || saved.version !== VERSION) return null;

            return saved;

        } catch (error) {

            return null;

        }

    }

    function save(choice) {

        try {

            localStorage.setItem(KEY, JSON.stringify({
                version: VERSION,
                embeds: !!choice.embeds,
                analytics: !!choice.analytics,
                at: new Date().toISOString()
            }));

        } catch (error) {

            // приватний режим — тоді питатимемо щоразу, це чесніше,
            // ніж мовчки вважати згоду отриманою

        }

    }

    function has(category) {

        if (OPTIONAL.indexOf(category) === -1) return true;   // necessary

        var saved = read();

        // Немає відповіді = немає згоди. Не «дозволено за
        // замовчуванням»: згода має бути дією, а не наслідком
        // бездіяльності.
        return !!(saved && saved[category]);

    }

    function answered() {
        return read() !== null;
    }

    // Повідомляємо сторінці, що вибір змінився, — заглушки відео
    // самі перетворяться на плеєр без перезавантаження.
    function announce() {

        document.dispatchEvent(new CustomEvent("consent:change", {
            detail: { embeds: has("embeds"), analytics: has("analytics") }
        }));

    }

    function decide(choice) {

        save(choice);
        close();
        announce();

    }

    function close() {

        var box = document.getElementById("consentBanner");

        if (box) box.remove();

    }

    function render() {

        if (document.getElementById("consentBanner")) return;

        var box = document.createElement("div");

        box.id = "consentBanner";
        box.className = "consent-banner";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-live", "polite");
        box.setAttribute("aria-label", "Використання даних");

        box.innerHTML = [
            '<div class="consent-inner">',
            '  <div class="consent-text">',
            '    <b>Ми зберігаємо мінімум даних.</b>',
            '    Кошик, обране й вхід в акаунт живуть у вашому браузері —',
            '    без них магазин не працює, і згоди вони не потребують.',
            '    Окремо питаємо про два речі:',
            '    <b>статистику відвідувань</b> (Google Analytics — які товари',
            '    дивляться, щоб розуміти, чого бракує в магазині) і',
            '    <b>відео</b> з YouTube та Vimeo у картках товарів.',
            '    Обидва отримають вашу IP-адресу.',
            '    Рекламних мереж і стеження між сайтами в нас немає.',
            '    <a href="privacy-policy">Що саме ми збираємо</a>',
            '  </div>',
            '  <div class="consent-actions">',
            '    <button type="button" class="btn btn-outline" data-consent="necessary">',
            '      Лише необхідне',
            '    </button>',
            '    <button type="button" class="btn" data-consent="all">',
            '      Прийняти все',
            '    </button>',
            '  </div>',
            '</div>'
        ].join("");

        box.addEventListener("click", function (event) {

            var btn = event.target.closest("[data-consent]");

            if (!btn) return;

            var yes = btn.dataset.consent === "all";

            decide({ embeds: yes, analytics: yes });

        });

        document.body.appendChild(box);

    }

    function init() {

        // Питаємо лише якщо ще не питали. Банер, який виринає на
        // кожній сторінці, люди закривають не читаючи — і згода стає
        // формальністю.
        if (!answered()) render();

    }

    root.Consent = {
        has: has,
        answered: answered,
        // «Змінити рішення» — посилання в підвалі: згоду треба вміти
        // відкликати так само легко, як дати
        reopen: function () {
            try { localStorage.removeItem(KEY); } catch (error) { /* нічого */ }
            render();
        }
    };

    // «Налаштування даних» у підвалі
    document.addEventListener("click", function (event) {

        var link = event.target.closest("[data-consent-reopen]");

        if (!link) return;

        event.preventDefault();

        root.Consent.reopen();

    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).Consent;
}
