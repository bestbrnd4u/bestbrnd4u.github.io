// ======================================
// «Колір для фільтра» — вибрати зі списку АБО вписати свою позначку
//
// ЩО ЦЕ ВИРІШУЄ
// --------------
// Фільтр у каталозі показує не назви кольорів, а СІМʼЇ: одна позначка
// «Білий» замість Chalk, Ivory, Off-white, Optic White. Сімʼю зазвичай
// вгадує сам сайт — за словом у назві, а якщо слова немає, за кружечком
// кольору (colorFamily() в assets/js/common.js).
//
// Вгадує добре, але не завжди: «Chalk» англійською нічого не каже, а
// свотч #e6e1e1 світлий рівно настільки, щоб залежати від межі між
// «Білий» і «Сірий». Живий приклад із каталогу — «Maple» (#771e1e):
// автоматика відносить його до червоних, хоча це коричневий.
//
// ЧОМУ НЕ ПРОСТО SELECT
// ----------------------
// Спершу тут і стояв select із пʼятнадцяти вбудованих сімей. Але список
// сімей — не константа світу: завтра зʼявиться бірюзова лінійка, і
// покласти її буде нікуди, поки хтось не полізе правити config.yml.
//
// Тому те саме рішення, що й у розмірів (admin/size-widget.js): поле
// показує підказку з уже вживаними позначками і водночас приймає
// будь-яку нову.
//
// ЗВІДКИ ПІДКАЗКИ
// ----------------
//   1. пʼятнадцять вбудованих — ті, які сайт розрізняє сам;
//   2. усе, що вже дописали в інших товарах — зі зібраного
//      data/products.json.
//
// Другий пункт і робить позначку спільною: дописали «Бірюзовий» одному
// товару — і в наступному він уже в підказці, а не набирається наосліп
// удруге з іншим написанням.
//
// Свіжо доданий товар зʼявиться в підказках після того, як відпрацює
// збірка, — так само, як він зʼявляється в каталозі.
// ======================================

(function () {

    if (typeof CMS === "undefined") return;

    var h = window.h || (window.React && window.React.createElement);
    var createClass = window.createClass || window.createReactClass;

    if (!h || !createClass) return;

    // Вбудовані сімʼї. Копія списку з COLOR_FAMILIES у
    // assets/js/common.js — там вони лежать разом із правилами
    // вгадування (ключові слова, межі за відтінком), і тягти сюди весь
    // той файл заради пʼятнадцяти рядків ні до чого.
    //
    // Щоб копія не розійшлася з оригіналом, її звіряє тест
    // (tests/test-color-unification.js): розійдуться — впаде.
    var BUILT_IN = [
        "Чорний", "Білий", "Сірий", "Бежевий", "Коричневий",
        "Синій", "Зелений", "Червоний", "Рожевий", "Помаранчевий",
        "Жовтий", "Фіолетовий", "Золотий", "Мультиколір", "Інші"
    ];

    // Каталог тягнемо один раз на всю адмінку: поле стоїть у кожному
    // варіанті кольору, а варіантів у товарі буває пʼять.
    var cache = null;

    function usedFamilies() {

        if (cache) return cache;

        cache = fetch("../data/products.json")
            .then(function (r) { return r.ok ? r.json() : []; })
            .then(function (list) {

                var seen = [];

                (Array.isArray(list) ? list : []).forEach(function (product) {

                    (product.variants || []).forEach(function (variant) {

                        var value = variant && variant.colorFamily;

                        if (typeof value !== "string") return;

                        value = value.trim();

                        if (!value || seen.indexOf(value) !== -1) return;

                        seen.push(value);

                    });

                });

                return seen;

            })
            .catch(function () { return []; });

        return cache;

    }

    var ColorFamilyControl = createClass({

        getInitialState: function () {
            return { options: BUILT_IN };
        },

        componentDidMount: function () {

            var self = this;

            this.alive = true;

            usedFamilies().then(function (used) {

                if (self.alive === false) return;

                // Дописані йдуть ПІСЛЯ вбудованих: у випадному списку
                // спершу звичні пʼятнадцять, далі те, що завели самі.
                var extra = used.filter(function (name) {
                    return BUILT_IN.indexOf(name) === -1;
                });

                if (extra.length) self.setState({ options: BUILT_IN.concat(extra) });

            });

        },

        componentWillUnmount: function () {
            this.alive = false;
        },

        // Порожнє поле означає «вирішуй сам» — саме тому очищення має
        // приводити значення до undefined, а не до порожнього рядка:
        // інакше в товарі осідало б "colorFamily": "" і чиста автоматика
        // виглядала б як зроблений вибір.
        set: function (value) {

            var clean = String(value === undefined || value === null ? "" : value).trim();

            this.props.onChange(clean || undefined);

        },

        // Валідність не залежить від ref-а: поле необовʼязкове й ніколи
        // не має блокувати збереження товару (та сама пастка, що описана
        // в admin/image-framing-widget.js).
        isValid: function () {
            return true;
        },

        render: function () {

            var self = this;

            var value = this.props.value === undefined || this.props.value === null
                ? ""
                : String(this.props.value);

            var listId = (this.props.forID || "colorFamily") + "-list";

            var known = this.state.options.indexOf(value.trim()) !== -1;

            return h("div", { className: this.props.classNameWrapper },

                h("input", {
                    id: this.props.forID,
                    type: "text",
                    value: value,
                    list: listId,
                    placeholder: "Порожньо — сайт вирішить сам",
                    onChange: function (e) { self.set(e.target.value); },
                    // Enter у формі адмінки інакше спробував би зберегти
                    // запис — так само, як у полі розмірів.
                    onKeyDown: function (e) {
                        if (e.key === "Enter") e.preventDefault();
                    },
                    style: {
                        width: "100%", padding: "8px 10px", borderRadius: "6px",
                        border: "1px solid #dfdfe3", font: "14px/1.4 Inter, sans-serif"
                    }
                }),

                h("datalist", { id: listId },
                    this.state.options.map(function (name) {
                        return h("option", { key: name, value: name });
                    })
                ),

                // Нова позначка — це нормально, але сказати про це варто:
                // одруківка в «Бірюзовй» тихо створила б у фільтрі другий
                // пункт поруч зі справжнім.
                value.trim() && !known
                    ? h("p", {
                        style: {
                            margin: "6px 0 0", font: "12px/1.5 Inter, sans-serif",
                            color: "#b45309"
                        }
                    }, "Нова позначка «" + value.trim() + "» — у фільтрі зʼявиться "
                        + "окремим пунктом. Перевірте написання: схожі, але різні "
                        + "назви стануть двома пунктами.")
                    : null
            );

        }

    });

    var ColorFamilyPreview = createClass({

        render: function () {

            var value = this.props.value;

            return value ? h("span", null, String(value)) : null;

        }

    });

    CMS.registerWidget("colorFamily", ColorFamilyControl, ColorFamilyPreview);

}());
