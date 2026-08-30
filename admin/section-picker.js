// ======================================
// «Підхоплювати розділи автоматично» — правило, а не знімок
//
// ЧИМ ВІДРІЗНЯЄТЬСЯ ВІД СПИСКУ ТОВАРІВ
// -------------------------------------
// У полі «Товари цієї акції» кнопка «Додати» кладе в акцію СПИСОК id —
// знімок на зараз. Товар, доданий у «Сумки» завтра, туди сам не
// потрапить.
//
// Це поле зберігає НАЗВУ розділу. Сайт щоразу питає каталог, що зараз
// лежить у «Сумках», — тож нові товари підхоплюються самі, а забрані з
// продажу зникають. Розгортає розділ у його категорії
// promotionProducts() в assets/js/common.js.
//
// Одне не заміняє інше: вручну обраний товар лишається в акції, навіть
// якщо завтра йому змінять категорію, а правило працює й на те, чого
// ще немає. Тому обидва поля стоять поруч.
// ======================================

(function () {

    if (typeof CMS === "undefined") return;

    var h = window.h || (window.React && window.React.createElement);
    var createClass = window.createClass || window.createReactClass;

    if (!h || !createClass) return;

    // Дерево розділів — спільне з вибором товарів (admin/catalog-tree.js).
    var tree = window.CatalogTree || null;

    function toList(value) {

        if (!value) return [];
        if (typeof value.toJS === "function") value = value.toJS();
        if (!Array.isArray(value)) value = [value];

        return value.map(String).filter(Boolean);

    }

    var SectionPickerControl = createClass({

        getInitialState: function () {
            return { groups: [], loaded: false };
        },

        componentDidMount: function () {

            var self = this;

            if (!tree) return;

            tree.loadGroups().then(function (data) {
                if (!self.gone) self.setState({ groups: data.groups, loaded: true });
            });

        },

        componentWillUnmount: function () {
            this.gone = true;
        },

        chosen: function () {
            return toList(this.props.value);
        },

        // Порожній список зберігаємо як undefined, а не як []: інакше в
        // акції осідало б "autoSections": [] і вимкнене правило
        // виглядало б у даних як зроблений вибір.
        commit: function (list) {

            var seen = {};
            var clean = [];

            list.forEach(function (name) {
                if (seen[name]) return;
                seen[name] = true;
                clean.push(name);
            });

            this.props.onChange(clean.length ? clean : undefined);

        },

        toggle: function (name, covered) {

            var chosen = this.chosen();

            if (chosen.indexOf(name) !== -1) {

                this.commit(chosen.filter(function (x) { return x !== name; }));

                return;

            }

            // Обрали розділ — прибираємо його ж категорії: вони вже
            // всередині, а два записи про те саме лише плутають.
            var drop = {};

            (covered || []).forEach(function (x) { drop[x] = true; });

            this.commit(chosen.filter(function (x) { return !drop[x]; }).concat([name]));

        },

        // Валідність не залежить від ref-а: поле необовʼязкове й ніколи
        // не має блокувати збереження акції.
        isValid: function () {
            return true;
        },

        row: function (name, count, level, parentChosen, covered) {

            var self = this;
            var chosen = this.chosen();
            var active = chosen.indexOf(name) !== -1;

            // Категорія всередині обраного розділу: підсвічена, але
            // натискати нема сенсу — вона вже в правилі.
            var inherited = !active && parentChosen;

            return h("label", {
                key: (level ? "c:" : "d:") + name,
                style: {
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: level ? "4px 8px 4px 26px" : "6px 8px",
                    borderTop: level ? "none" : "1px solid #f3f4f6",
                    cursor: inherited ? "default" : "pointer",
                    opacity: inherited ? .55 : 1
                }
            },

                h("input", {
                    type: "checkbox",
                    checked: active || inherited,
                    disabled: inherited,
                    onChange: function () { self.toggle(name, covered); },
                    style: { margin: 0, cursor: inherited ? "default" : "pointer" }
                }),

                h("span", {
                    style: {
                        flex: "1 1 auto", minWidth: 0, overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                        fontSize: "13px",
                        fontWeight: level ? 400 : 600,
                        color: level ? "#374151" : "#111827"
                    }
                }, name),

                h("span", {
                    style: { flex: "0 0 auto", fontSize: "12px", color: "#6b7280" }
                }, inherited ? "у розділі" : String(count))
            );

        },

        render: function () {

            var self = this;
            var chosen = this.chosen();

            if (!tree) {
                return h("div", { className: this.props.classNameWrapper },
                    h("p", { style: { margin: 0, fontSize: "13px", color: "#6b7280" } },
                        "Не завантажився admin/catalog-tree.js — правило задати нема з чого. "
                        + "На збереження акції це не впливає."));
            }

            return h("div", { className: this.props.classNameWrapper },

                h("div", {
                    style: {
                        border: "1px solid #e5e7eb", borderRadius: "8px",
                        background: "#fff", overflow: "hidden"
                    }
                },

                    this.state.loaded
                        ? this.state.groups.map(function (dept) {

                            var deptChosen = chosen.indexOf(dept.name) !== -1;

                            var catNames = dept.cats.map(function (c) { return c.name; });

                            return h("div", { key: dept.name },
                                self.row(dept.name, dept.ids.length, 0, false, catNames),
                                dept.cats.map(function (cat) {
                                    return self.row(cat.name, cat.ids.length, 1, deptChosen, []);
                                })
                            );

                        })
                        : h("div", { style: { padding: "10px", color: "#6b7280", fontSize: "13px" } },
                            "Завантаження каталогу…")
                ),

                h("div", { style: { marginTop: "6px", fontSize: "12px", color: "#6b7280" } },
                    chosen.length
                        ? "Підхоплюється автоматично: " + chosen.join(", ")
                        : "Нічого не обрано — акція покаже лише те, що додано вручну "
                          + "(і бренд, якщо його підхоплення увімкнене).")
            );

        }

    });

    var SectionPickerPreview = createClass({

        render: function () {

            var list = toList(this.props.value);

            return list.length ? h("span", null, list.join(", ")) : null;

        }

    });

    CMS.registerWidget("sectionPicker", SectionPickerControl, SectionPickerPreview);

}());
