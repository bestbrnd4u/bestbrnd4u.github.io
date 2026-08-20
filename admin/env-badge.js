// Смуга-індикатор середовища у шапці адмінки.
//
// НАВІЩО
// -------
// Адмінок дві — по одній на середовище, і кожна комітить у СВОЮ гілку:
//   bestbrnd4u.com/admin/      → гілка main → бойовий сайт
//   dev.bestbrnd4u.com/admin/  → гілка dev  → тестовий
//
// Виглядають вони абсолютно однаково. Тобто відкриті поруч дві вкладки
// нічим не відрізняються, і «спробую на тесті» легко перетворюється на
// правку бойового каталогу. Помітити це можна вже після публікації.
//
// Смуга нижче прибирає саме цю неоднозначність: видно назву середовища,
// домен і гілку, у яку підуть коміти. Бойове — червоне, тестове —
// зелене; колір читається швидше за текст.
//
// Значення підставляє scripts/apply-site-env.js під час збірки: тут
// нічого не зашито, тож смуга не збреше після зміни домену.

// ЧОМУ НЕ ВИСТАЧАЄ body { padding-top }
// --------------------------------------
// Смуга висить у position: fixed, і спершу її компенсували відступом
// зверху в <body>. Це не працювало: два ключові елементи Decap живуть
// поза потоком body і на її padding не реагують —
//
//   • шапка (<header>, AppHeader) — position: sticky; top: 0.
//     Sticky липне до верху ВЬЮПОРТА, а не до padding-box body, тож
//     при скролі шапка заїжджала під смугу;
//
//   • редактор запису (EditorContainer) — position: absolute; top: 0;
//     height: 100% без позиціонованого предка, тобто прив'язаний до
//     initial containing block. Саме тому в редакторі товару смуга
//     перекривала кнопку Publish і напис UNSAVED CHANGES.
//
// Тому зсуваємо ці два елементи напряму. Кнопки Publish серед правил
// немає навмисно: її ToolbarContainer лежить ВСЕРЕДИНІ EditorContainer,
// тож їде разом із ним — окреме правило зсунуло б її двічі.
//
// Стиль кладемо в <head>, а не в style самого <body>: Decap перемальовує
// <body> цілком, і інлайновий відступ доводилось би повертати щоразу.

(function () {

    var env = window.SITE_ENVIRONMENT;

    // якщо збірка чомусь не проставила дані — краще нічого не малювати,
    // ніж показати неправильну гілку
    if (!env || !env.name) return;

    var isProd = env.name === "production";

    var PALETTE = isProd
        ? { bg: "#b91c1c", text: "#fff", label: "БОЙОВИЙ САЙТ" }
        : { bg: "#047857", text: "#fff", label: "ТЕСТОВЕ СЕРЕДОВИЩЕ" };

    // Один стиль на всю адмінку. Висота — через змінну: смуга з
    // flex-wrap на вузькому екрані переноситься у два рядки, і зашиті
    // 34px там збрехали б.
    function injectStyles() {

        if (document.getElementById("envBadgeStyles")) return;

        var style = document.createElement("style");

        style.id = "envBadgeStyles";
        style.textContent = [
            ":root { --env-badge-h: 34px; }",
            "body { padding-top: var(--env-badge-h) !important; }",
            // шапка адмінки: position: sticky; top: 0
            "#nc-root header { top: var(--env-badge-h) !important; }",
            // редактор запису: position: absolute; top: 0; height: 100%
            '#nc-root [class*="EditorContainer"] {',
            "    top: var(--env-badge-h) !important;",
            "    height: calc(100% - var(--env-badge-h)) !important;",
            "}"
        ].join("\n");

        (document.head || document.documentElement).appendChild(style);

    }

    // Реальна висота смуги → в змінну, щоб від неї рахувались і відступ
    // body, і зсув шапки, і власне меню адмінки (admin/index.html).
    function syncHeight(bar) {

        var height = Math.ceil(bar.getBoundingClientRect().height);

        if (!height) return;

        document.documentElement.style.setProperty("--env-badge-h", height + "px");
        document.documentElement.style.setProperty("scroll-padding-top", height + "px");

    }

    function build() {

        injectStyles();

        if (document.getElementById("envBadge")) return;

        var bar = document.createElement("div");

        bar.id = "envBadge";
        bar.setAttribute("role", "status");

        bar.style.cssText = [
            "position:fixed", "top:0", "left:0", "right:0", "z-index:100000",
            "background:" + PALETTE.bg, "color:" + PALETTE.text,
            "font:600 13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
            "padding:6px 14px", "display:flex", "gap:14px", "flex-wrap:wrap",
            "align-items:center", "justify-content:center",
            "letter-spacing:.02em", "pointer-events:none"
        ].join(";");

        var parts = [
            PALETTE.label,
            env.host || location.hostname,
            "коміти → гілка " + (env.branch || "?")
        ];

        parts.forEach(function (text, i) {

            if (i) {
                var dot = document.createElement("span");
                dot.textContent = "•";
                dot.style.opacity = ".55";
                bar.appendChild(dot);
            }

            var span = document.createElement("span");
            span.textContent = text;
            if (i === 0) span.style.letterSpacing = ".08em";
            bar.appendChild(span);

        });

        document.body.appendChild(bar);

        syncHeight(bar);

        // висота змінюється при звуженні вікна — смуга переноситься
        // в два рядки; тоді відступ мусить поїхати за нею
        if (typeof ResizeObserver === "function") {
            new ResizeObserver(function () { syncHeight(bar); }).observe(bar);
        } else {
            window.addEventListener("resize", function () { syncHeight(bar); });
        }

    }

    // Decap перемальовує <body> цілком, коли завантажує інтерфейс, —
    // тим самим прийомом, що й меню вище, повертаємо смугу на місце
    function keep() {
        build();
        new MutationObserver(build).observe(document.body, { childList: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", keep);
    } else {
        keep();
    }

    // назва вкладки: коли відкрито дві адмінки, у списку вкладок теж
    // має бути видно, де яка
    document.title = (isProd ? "PROD" : "DEV") + " — BestBrnd4u адмінка";

})();
