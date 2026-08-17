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

(function () {

    var env = window.SITE_ENVIRONMENT;

    // якщо збірка чомусь не проставила дані — краще нічого не малювати,
    // ніж показати неправильну гілку
    if (!env || !env.name) return;

    var isProd = env.name === "production";

    var PALETTE = isProd
        ? { bg: "#b91c1c", text: "#fff", label: "БОЙОВИЙ САЙТ" }
        : { bg: "#047857", text: "#fff", label: "ТЕСТОВЕ СЕРЕДОВИЩЕ" };

    function build() {

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

        // зсуваємо саму адмінку, щоб смуга нічого не перекривала
        document.documentElement.style.setProperty("scroll-padding-top", "34px");
        document.body.style.paddingTop = "34px";

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
