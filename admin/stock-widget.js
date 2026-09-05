// ======================================
// Залишки на складі
//
// ЩО ЦЕ ВИРІШУЄ
// --------------
// «Під замовлення» був перемикачем: хтось мусив згадати, що сумка
// скінчилась, і піти його ввімкнути. Поки не згадав — сайт обіцяв
// доставку за 1–3 дні того, чого немає.
//
// Тут вписують числа: скільки лишилось по кожному кольору й розміру.
// Коли по всіх розмірах кольору стоїть 0 — цей колір їде на сайт як
// «під замовлення»; коли нуль у всіх кольорах — увесь товар. Правило
// одне на сайт, збірку й це поле — assets/js/stock.js.
//
// ЧОМУ ТАБЛИЦЯ НА ТОВАР, А НЕ ПОЛЕ В КОЖНОМУ КОЛЬОРІ
// ---------------------------------------------------
// Кольори в адмінці — це список, який розгортається по одному. Щоб
// побачити «чого лишилось», довелося б відкрити кожен. Тут усе
// одразу: рядок на колір, клітинка на розмір, підсумок унизу.
//
// Технічно це теж простіше: поле всередині елемента списку не бачить
// сусідніх полів того ж елемента (Decap не дає віджету його шлях), а
// поле рівня товару читає весь запис — і кольори, і розміри.
//
// ПОРОЖНЯ КЛІТИНКА — ЦЕ НЕ НУЛЬ
// ------------------------------
// Порожньо означає «не рахуємо»: товар поводиться як раніше. Інакше
// заповнення одного кольору з трьох мовчки відправило б два інші в
// «під замовлення» — помилка тиха, а коштує продажів.
// ======================================

(function () {

    if (typeof CMS === "undefined") return;

    var h = window.h || (window.React && window.React.createElement);
    var createClass = window.createClass || window.createReactClass;

    if (!h || !createClass) return;

    // Значення приходить або звичайним обʼєктом, або Immutable-мапою —
    // залежно від того, щойно його змінили чи прочитали з файлу.
    function toPlain(value) {

        if (!value) return {};

        if (typeof value.toJS === "function") value = value.toJS();

        return (value && typeof value === "object") ? JSON.parse(JSON.stringify(value)) : {};

    }

    function listOf(data, key) {

        var value = data && data.get ? data.get(key) : null;

        if (!value) return [];

        if (typeof value.toJS === "function") value = value.toJS();

        return Array.isArray(value) ? value : [];

    }

    var StockControl = createClass({

        // Поле необовʼязкове й ніколи не має блокувати збереження.
        isValid: function () { return true; },

        // -------------------------
        // Дані запису
        // -------------------------

        variants: function () {

            var data = this.props.entry && this.props.entry.get("data");

            var list = listOf(data, "variants").filter(function (variant) {
                return variant && variant.color;
            });

            // Товар без кольорів усе одно має залишок — під іменем «—».
            // Так поле не стає марним, поки кольори ще не заповнили.
            return list.length ? list : [];

        },

        sizesOf: function (variant) {

            var data = this.props.entry && this.props.entry.get("data");

            if (variant && Array.isArray(variant.sizes) && variant.sizes.length) return variant.sizes;

            return listOf(data, "sizes");

        },

        // -------------------------
        // Читання й запис
        // -------------------------

        stockOf: function (color) {

            var all = toPlain(this.props.value);
            var own = all[color];

            return (own && typeof own === "object") ? own : {};

        },

        valueOf: function (color, size) {

            var stored = this.stockOf(color)[size];

            return (stored === 0 || stored) ? String(stored) : "";

        },

        setCell: function (color, size, raw) {

            var all = toPlain(this.props.value);
            var own = (all[color] && typeof all[color] === "object") ? all[color] : {};

            var text = String(raw === null || raw === undefined ? "" : raw).trim();

            if (text === "") delete own[size];
            else {

                var number = Math.floor(Number(text));

                // Не число або відʼємне — лишаємо клітинку порожньою:
                // «мінус три сумки» не існує, а мовчки округлити до нуля
                // означало б відправити колір у «під замовлення».
                if (!isFinite(number) || number < 0) delete own[size];
                else own[size] = number;

            }

            if (Object.keys(own).length) all[color] = own;
            else delete all[color];

            this.props.onChange(all);

        },

        setColor: function (color, sizes, value) {

            var all = toPlain(this.props.value);

            if (value === null) delete all[color];
            else {

                var own = {};

                sizes.forEach(function (size) { own[size] = value; });

                all[color] = own;

            }

            this.props.onChange(all);

        },

        // -------------------------
        // Підсумки
        // -------------------------

        colorTotal: function (color, sizes) {

            var own = this.stockOf(color);

            return sizes.reduce(function (sum, size) {
                return sum + (typeof own[size] === "number" ? own[size] : 0);
            }, 0);

        },

        colorTracked: function (color, sizes) {

            var own = this.stockOf(color);

            return sizes.some(function (size) { return typeof own[size] === "number"; });

        },

        // Колір закінчився — коли по КОЖНОМУ його розміру стоїть явний
        // нуль. Те саме правило, що в assets/js/stock.js.
        colorSoldOut: function (color, sizes) {

            var own = this.stockOf(color);

            if (!this.colorTracked(color, sizes)) return false;

            return sizes.every(function (size) { return own[size] === 0; });

        },

        // -------------------------
        // Розмітка
        // -------------------------

        renderRow: function (variant, index) {

            var self = this;

            var color = variant.color;
            var sizes = this.sizesOf(variant);

            // Розмірів може не бути зовсім (їх ще не заповнили) —
            // тоді пропонуємо одну клітинку «загалом».
            var cells = sizes.length ? sizes : ["ONESIZE"];

            var soldOut = this.colorSoldOut(color, cells);
            var tracked = this.colorTracked(color, cells);

            return h("div", { className: "stock-row" + (soldOut ? " stock-row-out" : ""), key: color + index },

                h("div", { className: "stock-row-head" },

                    h("span", { className: "stock-color" },
                        variant.hex
                            ? h("i", { className: "stock-dot", style: { background: variant.hex } })
                            : null,
                        color),

                    h("span", { className: "stock-total" },
                        tracked
                            ? (soldOut ? "немає — під замовлення" : "разом " + this.colorTotal(color, cells) + " шт")
                            : "не рахуємо")

                ),

                h("div", { className: "stock-cells" }, cells.map(function (size) {

                    return h("label", { className: "stock-cell", key: size },

                        // Підпис розміру ховаємо, коли він один: «ONESIZE»
                        // над єдиним полем нічого не пояснює.
                        cells.length > 1 ? h("span", { className: "stock-size" }, size) : null,

                        h("input", {
                            type: "number",
                            min: 0,
                            step: 1,
                            inputMode: "numeric",
                            placeholder: "—",
                            value: self.valueOf(color, size),
                            onChange: function (event) { self.setCell(color, size, event.target.value); }
                        })

                    );

                })),

                h("div", { className: "stock-row-actions" },

                    h("button", {
                        type: "button",
                        className: "stock-mini",
                        onClick: function () { self.setColor(color, cells, 0); }
                    }, "Усе продано"),

                    tracked
                        ? h("button", {
                            type: "button",
                            className: "stock-mini",
                            onClick: function () { self.setColor(color, cells, null); }
                        }, "Не рахувати")
                        : null

                )

            );

        },

        render: function () {

            var self = this;
            var variants = this.variants();

            if (!variants.length) {

                return h("div", { className: "stock-widget stock-empty" },
                    "Спершу додайте хоча б один колір у «Варіанти кольору» — залишки рахуються по кольорах.");

            }

            var tracked = variants.filter(function (variant) {
                var cells = self.sizesOf(variant);
                return self.colorTracked(variant.color, cells.length ? cells : ["ONESIZE"]);
            });

            var soldOut = tracked.length === variants.length && variants.every(function (variant) {
                var cells = self.sizesOf(variant);
                return self.colorSoldOut(variant.color, cells.length ? cells : ["ONESIZE"]);
            });

            var manual = this.props.entry && this.props.entry.getIn(["data", "preOrder"]);

            return h("div", { className: "stock-widget" },

                variants.map(function (variant, index) { return self.renderRow(variant, index); }),

                h("div", { className: "stock-summary" + (soldOut ? " stock-summary-out" : "") },

                    manual
                        ? "Стоїть перемикач «Товар під замовлення» — сайт покаже «під замовлення» незалежно від залишків."
                        : !tracked.length
                            ? "Залишки не заповнені — товар показується як раніше."
                            : soldOut
                                ? "📦 Нуль по всіх кольорах — товар піде на сайт як «під замовлення»."
                                : "Кольори з нулем по всіх розмірах підуть як «під замовлення»; решта — як є."

                )

            );

        }

    });

    var StockPreview = createClass({
        render: function () { return null; }   // усе показує прев'ю товару
    });

    CMS.registerWidget("stockGrid", StockControl, StockPreview);

}());
