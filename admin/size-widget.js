// ======================================
// Поле розмірів: вибрати наявний АБО вписати свій
//
// Стандартний select в адмінці вміє лише вибирати з готового
// переліку — додати «ONESIZE» чи «39.5» було неможливо. А звичайний
// список (list) навпаки: вписати можна що завгодно, але зникає
// зручність вибору, і легко наплодити різнобій — «ONESIZE», «onesize»,
// «One Size» стануть трьома різними розмірами у фільтрі каталогу.
//
// Тому власне поле: показує підказку з уже вживаними розмірами і
// водночас приймає будь-яке нове значення.
//
// Перелік підказок береться з розділу «Розміри» (data/size-groups.json).
// Тобто розмір, доданий там, одразу зʼявляється в підказці тут —
// два місця не розходяться.
// ======================================

(function () {

    if (typeof CMS === "undefined") return;

    var FALLBACK = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "ONESIZE",
                    "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"];

    var knownSizes = null;

    function loadKnownSizes() {

        if (knownSizes) return knownSizes;

        knownSizes = fetch("../data/size-groups.json")
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {

                var groups = (data && (data.groups || data)) || [];
                var out = [];

                groups.forEach(function (g) {
                    (g.sizes || []).forEach(function (s) {
                        if (s && out.indexOf(s) === -1) out.push(s);
                    });
                });

                return out.length ? out : FALLBACK;

            })
            .catch(function () { return FALLBACK; });

        return knownSizes;

    }

    // Значення від Decap приходить або масивом, або Immutable-списком
    function toArray(value) {

        if (!value) return [];
        if (Array.isArray(value)) return value.filter(Boolean);
        if (typeof value.toJS === "function") return value.toJS().filter(Boolean);

        return [String(value)];

    }

    var SizeTagsControl = createClass({

        getInitialState: function () {
            return { input: "", options: FALLBACK };
        },

        componentDidMount: function () {

            var self = this;

            loadKnownSizes().then(function (list) {
                if (!self.gone) self.setState({ options: list });
            });

        },

        componentWillUnmount: function () {
            this.gone = true;
        },

        values: function () {
            return toArray(this.props.value);
        },

        commit: function (next) {

            // прибираємо дублі, зберігаючи порядок додавання
            var seen = {};
            var clean = [];

            next.forEach(function (v) {
                var key = String(v).trim();
                if (!key || seen[key.toLowerCase()]) return;
                seen[key.toLowerCase()] = true;
                clean.push(key);
            });

            this.props.onChange(clean);

        },

        add: function (raw) {

            var parts = String(raw || "").split(",");
            var next = this.values().slice();

            parts.forEach(function (p) {
                var v = p.trim();
                if (v) next.push(v);
            });

            this.commit(next);
            this.setState({ input: "" });

        },

        remove: function (value) {

            this.commit(this.values().filter(function (v) { return v !== value; }));

        },

        onKeyDown: function (event) {

            if (event.key === "Enter" || event.key === ",") {

                // Enter у формі адмінки інакше спробував би зберегти запис
                event.preventDefault();
                this.add(this.state.input);

                return;

            }

            // Backspace у порожньому полі прибирає останній розмір —
            // звичне поводження для полів-тегів
            if (event.key === "Backspace" && !this.state.input) {

                var list = this.values();

                if (list.length) this.remove(list[list.length - 1]);

            }

        },

        render: function () {

            var self = this;
            var current = this.values();
            var listId = this.props.forID + "-sizes";

            var chips = current.map(function (value) {

                return h("span", {
                    key: value,
                    style: {
                        display: "inline-flex", alignItems: "center", gap: "6px",
                        padding: "4px 8px", margin: "0 6px 6px 0", borderRadius: "8px",
                        background: "#eef2ff", color: "#3730a3",
                        font: "600 13px/1 Inter, -apple-system, sans-serif",
                    },
                },
                    value,
                    h("button", {
                        type: "button",
                        onClick: function () { self.remove(value); },
                        title: "Прибрати розмір",
                        style: {
                            border: 0, background: "transparent", cursor: "pointer",
                            color: "#4f46e5", fontSize: "15px", lineHeight: 1, padding: 0,
                        },
                    }, "×")
                );

            });

            // Підказки — лише ті, яких ще немає у списку
            var suggestions = this.state.options.filter(function (o) {
                return current.indexOf(o) === -1;
            });

            return h("div", { className: this.props.classNameWrapper },

                h("div", { style: { marginBottom: current.length ? "4px" : 0 } }, chips),

                h("input", {
                    id: this.props.forID,
                    type: "text",
                    value: this.state.input,
                    list: listId,
                    placeholder: "Оберіть зі списку або впишіть свій і натисніть Enter",
                    onChange: function (e) { self.setState({ input: e.target.value }); },
                    onKeyDown: this.onKeyDown,
                    // вибір із випадного списку одразу додає значення
                    onInput: function (e) {

                        var v = e.target.value;

                        if (self.state.options.indexOf(v) !== -1) self.add(v);
                        else self.setState({ input: v });

                    },
                    onBlur: function () {

                        // не втрачаємо те, що людина вписала й не натиснула Enter
                        if (self.state.input.trim()) self.add(self.state.input);

                    },
                    style: {
                        width: "100%", padding: "8px 10px", borderRadius: "6px",
                        border: "1px solid #dfdfe3", font: "14px/1.4 Inter, sans-serif",
                    },
                }),

                h("datalist", { id: listId },
                    suggestions.map(function (o) {
                        return h("option", { key: o, value: o });
                    })
                )

            );

        },

    });

    var SizeTagsPreview = createClass({

        render: function () {

            var list = toArray(this.props.value);

            return h("div", null, list.length ? list.join(", ") : "—");

        },

    });

    CMS.registerWidget("sizeTags", SizeTagsControl, SizeTagsPreview);

})();
