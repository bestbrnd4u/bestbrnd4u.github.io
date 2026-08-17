// ======================================
// Поле «Товари» — вибір товарів зі СТРОГИМ пошуком
//
// НАВІЩО СВОЄ ПОЛЕ
// -----------------
// Стандартний relation у Decap шукає ПІДПОСЛІДОВНІСТЮ: збігом
// вважається будь-який рядок, у якому літери запиту трапляються в
// потрібному порядку, хай і врозкид. Тому на запит «coach» у списку
// зʼявлялись Armani Exchange, Marc Jacobs, Michael Kors — у
// «Чоловіча сумка Armani Exchange Crossbody Bag Black» справді є
// c…o…a…c…h. Порогом схожості це не налаштовується, поведінка
// зашита в саму бібліотеку пошуку.
//
// Тут пошук простий і передбачуваний: шукаємо ПІДРЯДОК (як Ctrl+F).
// Якщо збігів немає — так і пишемо, а не показуємо весь каталог.
//
// ЩО ЩЕ ВРАХОВАНО
//   • пошук за назвою, брендом, категорією, артикулом і id;
//   • кілька слів через пробіл — потрібні ВСІ (як «coach tabby»);
//   • регістр і українська «і» / латинська «i» не заважають;
//   • вибрані товари показані чипсами, порядок = порядок додавання,
//     бо саме в ньому вони виводяться на сайті.
//
// ЗВІДКИ БЕРУТЬСЯ ТОВАРИ
// Зі зібраного data/products.json — того самого файлу, яким живе сам
// сайт. Тобто в списку рівно те, що зараз опубліковано. Свіжо
// доданий товар зʼявиться тут після того, як відпрацює збірка
// (кілька хвилин) — так само, як він зʼявляється в каталозі.
// ======================================

(function () {

    if (typeof CMS === "undefined") return;

    var h = window.h || (window.React && window.React.createElement);
    var createClass = window.createClass || window.createReactClass;

    if (!h || !createClass) return;

    var cache = null;

    function loadProducts() {

        if (cache) return cache;

        cache = fetch("../data/products.json")
            .then(function (r) { return r.ok ? r.json() : []; })
            .then(function (list) { return Array.isArray(list) ? list : []; })
            .catch(function () { return []; });

        return cache;

    }

    // Приводимо до вигляду, у якому порівнюємо: нижній регістр і
    // однакові на вигляд літери. Кирилична «і» та латинська «i»
    // (так само о/о, а/а, с/с, е/е, р/р, х/х) в назвах товарів
    // трапляються впереміш — без цього «coach» не знаходив би
    // «Coach» з кириличною «о».
    var LOOKALIKE = { "а": "a", "с": "c", "е": "e", "о": "o", "р": "p", "х": "x", "і": "i", "у": "y" };

    function norm(value) {

        return String(value === undefined || value === null ? "" : value)
            .toLowerCase()
            .replace(/[асеорхіу]/g, function (ch) { return LOOKALIKE[ch] || ch; });

    }

    function haystack(product) {

        return norm([
            product.title,
            product.brand,
            product.category,
            product.sku,
            product.id
        ].filter(Boolean).join(" "));

    }

    function matches(product, query) {

        var words = norm(query).split(/\s+/).filter(Boolean);

        if (!words.length) return false;

        var hay = haystack(product);

        // потрібні ВСІ слова запиту, кожне — саме підрядком
        return words.every(function (w) { return hay.indexOf(w) !== -1; });

    }

    function toIds(value) {

        if (!value) return [];
        if (typeof value.toJS === "function") value = value.toJS();
        if (!Array.isArray(value)) value = [value];

        return value.map(Number).filter(function (n) { return !isNaN(n); });

    }

    var ProductPickerControl = createClass({

        getInitialState: function () {
            return { input: "", products: [], loaded: false };
        },

        componentDidMount: function () {

            var self = this;

            loadProducts().then(function (list) {
                if (!self.gone) self.setState({ products: list, loaded: true });
            });

        },

        componentWillUnmount: function () {
            this.gone = true;
        },

        ids: function () {
            return toIds(this.props.value);
        },

        commit: function (next) {

            var seen = {};
            var clean = [];

            next.forEach(function (id) {
                if (seen[id]) return;
                seen[id] = true;
                clean.push(id);
            });

            this.props.onChange(clean);

        },

        add: function (id) {
            this.commit(this.ids().concat([Number(id)]));
            this.setState({ input: "" });
        },

        remove: function (id) {
            this.commit(this.ids().filter(function (x) { return x !== id; }));
        },

        byId: function (id) {

            var found = null;

            this.state.products.forEach(function (p) {
                if (Number(p.id) === Number(id)) found = p;
            });

            return found;

        },

        render: function () {

            var self = this;
            var ids = this.ids();
            var query = this.state.input.trim();

            var chosen = ids.map(function (id) {

                var p = self.byId(id);
                var label = p ? p.title : "id " + id + " — товар не знайдено";

                return h("span", {
                    key: id,
                    style: {
                        display: "inline-flex", alignItems: "center", gap: "6px",
                        background: p ? "#eef2ff" : "#fee2e2",
                        color: p ? "#1e3a8a" : "#991b1b",
                        border: "1px solid " + (p ? "#c7d2fe" : "#fecaca"),
                        borderRadius: "6px", padding: "4px 8px",
                        margin: "0 6px 6px 0", fontSize: "13px"
                    }
                },
                    (p && p.brand ? p.brand + " · " : "") + label,
                    h("button", {
                        type: "button",
                        onClick: function () { self.remove(id); },
                        style: {
                            border: "none", background: "transparent", cursor: "pointer",
                            fontSize: "15px", lineHeight: 1, color: "inherit", padding: 0
                        }
                    }, "×")
                );

            });

            var hits = [];

            if (query) {
                hits = this.state.products.filter(function (p) {
                    return matches(p, query) && ids.indexOf(Number(p.id)) === -1;
                }).slice(0, 12);
            }

            var dropdown = null;

            if (query && this.state.loaded) {

                dropdown = h("div", {
                    style: {
                        border: "1px solid #e5e7eb", borderRadius: "6px",
                        marginTop: "6px", maxHeight: "260px", overflowY: "auto",
                        background: "#fff"
                    }
                },
                    hits.length
                        ? hits.map(function (p) {
                            return h("button", {
                                key: p.id,
                                type: "button",
                                onClick: function () { self.add(p.id); },
                                style: {
                                    display: "block", width: "100%", textAlign: "left",
                                    padding: "8px 10px", border: "none",
                                    borderBottom: "1px solid #f3f4f6",
                                    background: "#fff", cursor: "pointer", fontSize: "13px"
                                }
                            },
                                h("strong", null, p.brand || ""),
                                (p.brand ? " · " : "") + p.title,
                                h("span", { style: { color: "#6b7280" } },
                                    "  (" + (p.category || "") + ", id " + p.id + ")")
                            );
                        })
                        // головне: НЕ показуємо весь каталог, коли збігів нема
                        : h("div", { style: { padding: "10px", color: "#6b7280", fontSize: "13px" } },
                            "Нічого не знайдено за запитом «" + query + "»")
                );

            }

            return h("div", { className: this.props.classNameWrapper },

                chosen.length ? h("div", { style: { marginBottom: "6px" } }, chosen) : null,

                h("input", {
                    type: "text",
                    value: this.state.input,
                    placeholder: this.state.loaded
                        ? "Пошук за назвою, брендом, категорією або артикулом"
                        : "Завантаження каталогу…",
                    disabled: !this.state.loaded,
                    onChange: function (e) { self.setState({ input: e.target.value }); },
                    style: {
                        width: "100%", padding: "8px 10px", fontSize: "14px",
                        border: "1px solid #d1d5db", borderRadius: "6px"
                    }
                }),

                dropdown,

                h("div", { style: { marginTop: "6px", color: "#6b7280", fontSize: "12px" } },
                    "Обрано: " + ids.length
                    + (this.state.loaded ? " · у каталозі " + this.state.products.length : ""))

            );

        }

    });

    var ProductPickerPreview = createClass({

        render: function () {

            var ids = toIds(this.props.value);

            return h("div", null, ids.length ? "Товарів обрано: " + ids.length : "—");

        }

    });

    CMS.registerWidget("productPicker", ProductPickerControl, ProductPickerPreview);

})();
