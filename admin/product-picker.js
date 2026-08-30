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

    // Каталог і дерево розділів — зі спільного admin/catalog-tree.js:
    // тим самим користується admin/section-picker.js, і друга копія
    // підрахунків розійшлася б із першою на першій же правці.
    var tree = window.CatalogTree || null;

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
            return { input: "", products: [], loaded: false, groups: [], open: {} };
        },

        componentDidMount: function () {

            var self = this;

            if (!tree) return;

            tree.loadGroups().then(function (data) {

                if (self.gone) return;

                self.setState({
                    products: data.products,
                    groups: data.groups,
                    loaded: true
                });

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

        // Цілим розділом. Додаємо СПИСОК ID, а не правило «всі сумки».
        //
        // ЧОМУ САМЕ ТАК. В акції зберігається перелік товарів
        // (productIds), і сайт малює рівно його. Правило довелося б
        // навчитись читати і збірці, і сторінці акції — це інша,
        // більша робота.
        //
        // Наслідок, про який варто знати: це ЗНІМОК. Товар, доданий у
        // «Сумки» завтра, сам в акцію не потрапить — треба зайти й
        // натиснути ще раз. Тому поруч і показано «12 з 45»: видно,
        // що розділ додано не цілком.
        addMany: function (list) {

            this.commit(this.ids().concat(list.map(Number)));

        },

        removeMany: function (list) {

            var drop = {};

            list.forEach(function (id) { drop[Number(id)] = true; });

            this.commit(this.ids().filter(function (id) { return !drop[id]; }));

        },

        byId: function (id) {

            var found = null;

            this.state.products.forEach(function (p) {
                if (Number(p.id) === Number(id)) found = p;
            });

            return found;

        },

        // Рядок розділу або підрозділу: назва, скільки вже додано і
        // кнопка. Коли додано все — кнопка стає «Прибрати»: інакше
        // вона просто нічого не робила б, а мертва кнопка гірша за
        // відсутню.
        groupRow: function (item, level, extra) {

            var self = this;
            var chosen = this.ids();

            var already = item.ids.filter(function (id) {
                return chosen.indexOf(id) !== -1;
            }).length;

            var all = already === item.ids.length && item.ids.length > 0;

            return h("div", {
                key: (level ? "c:" : "d:") + item.name,
                style: {
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: level ? "4px 8px 4px 26px" : "6px 8px",
                    borderTop: level ? "none" : "1px solid #f3f4f6"
                }
            },

                extra || null,

                h("span", {
                    style: {
                        flex: "1 1 auto", minWidth: 0, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                        fontSize: "13px",
                        fontWeight: level ? 400 : 600,
                        color: level ? "#374151" : "#111827"
                    }
                }, item.name),

                h("span", {
                    style: {
                        flex: "0 0 auto", fontSize: "12px",
                        color: already ? "#1e3a8a" : "#6b7280"
                    }
                }, already ? already + " з " + item.ids.length : String(item.ids.length)),

                h("button", {
                    type: "button",
                    onClick: function () {
                        if (all) self.removeMany(item.ids);
                        else self.addMany(item.ids);
                    },
                    style: {
                        flex: "0 0 auto", cursor: "pointer", fontSize: "12px",
                        padding: "3px 10px", borderRadius: "6px",
                        border: "1px solid " + (all ? "#fecaca" : "#c7d2fe"),
                        background: all ? "#fee2e2" : "#eef2ff",
                        color: all ? "#991b1b" : "#1e3a8a"
                    }
                }, all ? "Прибрати" : "Додати")
            );

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

            // Розділи. Підрозділи ховаємо під стрілкою: інакше блок
            // із десяти рядків заступав би сам пошук, яким користуються
            // частіше.
            var sections = this.state.groups.length
                ? h("div", {
                    style: {
                        border: "1px solid #e5e7eb", borderRadius: "8px",
                        marginBottom: "8px", background: "#fff", overflow: "hidden"
                    }
                },

                    h("div", {
                        style: {
                            padding: "6px 8px", fontSize: "12px", color: "#6b7280",
                            background: "#f9fafb", borderBottom: "1px solid #f3f4f6"
                        }
                    }, "Додати цілим розділом"),

                    this.state.groups.map(function (dept) {

                        var opened = !!self.state.open[dept.name];

                        var toggle = h("button", {
                            type: "button",
                            "aria-expanded": String(opened),
                            onClick: function () {

                                var open = {};

                                Object.keys(self.state.open).forEach(function (k) {
                                    open[k] = self.state.open[k];
                                });

                                open[dept.name] = !opened;

                                self.setState({ open: open });

                            },
                            style: {
                                flex: "0 0 auto", width: "18px", border: "none",
                                background: "transparent", cursor: "pointer",
                                color: "#6b7280", fontSize: "11px", padding: 0
                            }
                        }, opened ? "▾" : "▸");

                        return h("div", { key: dept.name },
                            self.groupRow(dept, 0, toggle),
                            opened
                                ? dept.cats.map(function (cat) { return self.groupRow(cat, 1); })
                                : null
                        );

                    })
                )
                : null;

            return h("div", { className: this.props.classNameWrapper },

                chosen.length ? h("div", { style: { marginBottom: "6px" } }, chosen) : null,

                sections,

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
