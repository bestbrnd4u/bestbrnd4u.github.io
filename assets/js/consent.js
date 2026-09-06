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
// КАТЕГОРІЇ. Їх три, і кожна — окрема мета, а не відтінок однієї:
//
//   necessary — кошик, обране, вхід. Без них магазин не працює,
//               вимкнути не можна, і згоди вони не потребують: це не
//               стеження, а пам'ять самої сторінки.
//   embeds    — відео YouTube/Vimeo у картці товару. До згоди на
//               місці відео показується заглушка.
//   analytics — Google Analytics: які товари дивляться, що шукають.
//               Без згоди скрипт Google не завантажується взагалі.
//   ads       — піксель Meta: він показує Facebook та Instagram, що
//               людина робила на сайті, щоб потім показати їй рекламу
//               саме тих товарів.
//
// ЧОМУ РЕКЛАМА — ОКРЕМА КАТЕГОРІЯ, А НЕ ЧАСТИНА АНАЛІТИКИ
// --------------------------------------------------------
// Це різні цілі, і згода на одну не є згодою на іншу. Статистика
// відповідає магазину на питання «чого бракує в каталозі» й далі
// нікуди не йде. Піксель віддає дані рекламній компанії, яка
// використає їх, щоб наздогнати людину оголошенням в іншому місці.
// Заховати друге під галочкою першого — саме той випадок, коли згода
// формально є, а насправді її не питали.
//
// Шрифти Google лишаються поза вибором свідомо: без них зламається
// вигляд усього сайту, а не одного блока. Це чесно назване в політиці,
// але не подане як перемикач, якого насправді немає.

(function (root) {

    "use strict";

    var KEY = "consent";

    // Версію піднято 1 → 2 (додалась аналітика), 2 → 3 (додалась
    // реклама).
    //
    // Це не формальність: людина, яка натиснула «Прийняти», коли на
    // сайті не було пікселя, відповідала на ІНШЕ питання. Мовчки
    // застосувати ту відповідь до нового означало б вирішити за неї —
    // тому стара відповідь не діє, і банер спитає ще раз.
    //
    // Так, це коштує: банер знову побачать усі. Але саме за це його
    // й тримають.
    var VERSION = 3;

    // Категорії, які взагалі можна вимкнути.
    var OPTIONAL = ["embeds", "analytics", "ads"];

    // Текст першого показу. Одна стрічка — і це вимога, а не смак:
    // див. коментар про стіну тексту в render(). Тримаємо окремою
    // константою, щоб довжину можна було перевіряти тестом.
    var ASK_TEXT = "Ми використовуємо cookie для роботи магазину, статистики"
        + " відвідувань, відео в картках товарів і рекламу у Facebook та Instagram.";

    // Текст, коли банер відкрили самі — з підвалу.
    var SETTINGS_TEXT = "Оберіть, що дозволяєте. Кошик, обране й вхід працюють"
        + " завжди — без них магазин не працює.";

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
                ads: !!choice.ads,
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
            detail: {
                embeds: has("embeds"),
                analytics: has("analytics"),
                ads: has("ads")
            }
        }));

    }

    function decide(choice) {

        save(choice);
        close();
        announce();

        // Підтвердження. Банер зникає — і без жодного сліду незрозуміло,
        // чи вибір узагалі зберігся. Особливо коли його відкривали
        // навмисно, щоб щось змінити.
        if (typeof root.showToast === "function") {
            root.showToast("Налаштування збережено");
        }

    }

    function close() {

        var box = document.getElementById("consentBanner");

        if (box) box.remove();

    }

    // Перемикачі для режиму «Налаштування даних».
    //
    // ЧОМУ ВОНИ ТУТ, А НЕ В ПЕРШОМУ ПОКАЗІ
    // -------------------------------------
    // Перший банер має бути коротким: три галочки перед людиною, яка
    // щойно відкрила магазин, — це не усвідомлений вибір, а перешкода
    // (див. коментар нижче про стіну тексту).
    //
    // Але посилання в підвалі називається «Налаштування даних» — і
    // мусить давати саме налаштування. Досі воно показувало той самий
    // банер із двома кнопками: єдиним способом вимкнути рекламу було
    // вимкнути заразом статистику й відео.
    function optionsMarkup(saved) {

        var LABELS = {
            embeds: ["Відео в картках товарів", "YouTube і Vimeo. Без згоди замість відео — заглушка."],
            analytics: ["Статистика відвідувань", "Google Analytics: які товари дивляться і що шукають."],
            ads: ["Реклама у Facebook та Instagram", "Піксель Meta: показувати вам саме ті товари, які ви дивились."]
        };

        return '<div class="consent-options">'
            + OPTIONAL.map(function (name) {

                return [
                    '<label class="consent-option">',
                    '  <input type="checkbox" data-consent-option="' + name + '"',
                    saved && saved[name] ? " checked" : "", ">",
                    '  <span>',
                    '    <b>' + LABELS[name][0] + '</b>',
                    '    <i>' + LABELS[name][1] + '</i>',
                    '  </span>',
                    '</label>'
                ].join("");

            }).join("")
            + "</div>";

    }

    // mode: "ask" — перший показ, "settings" — з підвалу.
    function render(mode) {

        // Перемальовуємо завжди.
        //
        // ЩО БУЛО НЕ ТАК. Тут стояло «якщо банер уже є — вийти». Через
        // це клік по «Налаштування даних» у людини, яка ще не
        // відповіла на банер, не робив НІЧОГО видимого: банер уже
        // висів, функція мовчки поверталась. Ззовні це виглядало як
        // мертве посилання.
        close();

        var settings = mode === "settings";

        var saved = read();

        var box = document.createElement("div");

        box.id = "consentBanner";
        box.className = "consent-banner";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-live", "polite");
        box.setAttribute("aria-label", "Використання даних");

        // Коротко.
        //
        // ЩО БУЛО НЕ ТАК
        // ---------------
        // Тут стояло шість стрічок тексту: що зберігаємо, навіщо, які
        // сервіси отримають IP, чого не робимо. Усе правда, але банер
        // при першому заході займав півекрана телефона — і люди тиснули
        // «Прийняти все», не читаючи. Довгий текст не зробив вибір
        // усвідомленим, лише відтіснив магазин.
        //
        // Тепер одна стрічка й посилання. Кому цікаво — прочитає повний
        // опис у політиці; решта натисне кнопку, як робила й раніше,
        // але без стіни тексту перед очима.
        box.innerHTML = [
            '<div class="consent-inner">',
            '  <div class="consent-text">',
            "    " + (settings ? SETTINGS_TEXT : ASK_TEXT),
            '    <a href="privacy-policy">Докладніше</a>',
            settings ? optionsMarkup(saved) : "",
            '  </div>',
            '  <div class="consent-actions">',
            settings
                ? '    <button type="button" class="btn btn-outline" data-consent="save">Зберегти вибір</button>'
                : '    <button type="button" class="btn btn-outline" data-consent="necessary">Лише необхідне</button>',
            '    <button type="button" class="btn" data-consent="all">',
            settings ? "      Дозволити все" : "      Прийняти",
            '    </button>',
            '  </div>',
            '</div>'
        ].join("");

        box.addEventListener("click", function (event) {

            var btn = event.target.closest("[data-consent]");

            if (!btn) return;

            var action = btn.dataset.consent;

            if (action === "save") {

                var choice = {};

                OPTIONAL.forEach(function (name) {

                    var input = box.querySelector('[data-consent-option="' + name + '"]');

                    choice[name] = !!(input && input.checked);

                });

                decide(choice);

                return;

            }

            var yes = action === "all";

            decide({ embeds: yes, analytics: yes, ads: yes });

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
        // «Налаштування даних» — посилання в підвалі: згоду треба вміти
        // відкликати так само легко, як дати.
        //
        // САМ КЛІК НІЧОГО НЕ ЗМІНЮЄ. Раніше тут стояло
        // localStorage.removeItem(KEY) — тобто натискання вже
        // скасовувало згоду, ще до того, як людина щось обрала. Якщо
        // банер при цьому не з'являвся (а він не з'являвся, коли вже
        // висів), виходило найгірше: клік мовчки вимикав статистику,
        // відео й рекламу, а на вигляд не робив нічого.
        //
        // Тепер вибір змінюється тільки кнопкою у банері.
        reopen: function () {
            render("settings");
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
