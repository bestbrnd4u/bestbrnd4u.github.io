// ======================================
// «Артикул каталогу» — номер, який ставить система
//
// ЩО БУЛО НЕ ТАК
// ---------------
// Артикул заповнювали руками. Рано чи пізно його забували: у годинника
// Michael Kors MK7558 не було ні загального артикула, ні артикула
// кольору — і в розмітці сторінки не було sku, через що Search Console
// писав «Invalid value in field "sku"», а тест merchant-listings падав
// і блокував випуск на прод.
//
// Тепер номер видає збірка з id товару (scripts/build-products.js), а
// це поле лише ПОКАЗУЄ його. Редагувати нічого не можна — саме тому
// поле й з'явилось: заповнювати його руками більше не потрібно.
//
// ЧОМУ ВІДЖЕТ, А НЕ ЗВИЧАЙНЕ ПОЛЕ
// --------------------------------
// Decap не вміє «показати, але не давати редагувати»: string-поле
// завжди редаговане, а hidden — не видно взагалі (id так і лежав).
// Тут потрібно рівно перше: адміністратор мусить бачити номер, щоб
// назвати його покупцеві або знайти товар, і не мусить його правити.
//
// ПРО НОВИЙ ТОВАР
// ---------------
// Номер видається при збірці, тобто вже після збереження. Доки товар
// не збережений, показуємо наступний вільний номер як ОРІЄНТИР і
// прямо кажемо, що остаточний з'явиться після збереження. Вигадувати
// значення й писати його у файл не варто: два товари, створені до
// збірки, отримали б однаковий номер, а справжній усе одно видає
// збірка.
// ======================================

(function () {

    if (typeof CMS === "undefined") return;

    var h = window.h || (window.React && window.React.createElement);
    var createClass = window.createClass || window.createReactClass;

    if (!h || !createClass) return;

    // Каталог тягнемо тим самим завантажувачем, що вибір товарів і
    // розділів (admin/catalog-tree.js) — інакше та сама сторінка
    // адмінки просила б products.json двічі.
    var tree = window.CatalogTree || null;

    function variantsOf(entry) {

        if (!entry || typeof entry.getIn !== "function") return [];

        var list = entry.getIn(["data", "variants"]);

        if (!list) return [];
        if (typeof list.toJS === "function") list = list.toJS();

        return Array.isArray(list) ? list : [];

    }

    var ArticleControl = createClass({

        getInitialState: function () {

            return { next: null };

        },

        componentWillUnmount: function () {

            // Каталог приходить асинхронно, а поле могли вже закрити.
            // this.isMounted у createReactClass — це ФУНКЦІЯ, тож
            // перевірка «!== false» була завжди правдива й нічого не
            // стерегла: React лаявся на setState після відмонтування.
            this.gone = true;

        },

        componentDidMount: function () {

            // Наступний вільний номер потрібен ЛИШЕ новому товару —
            // збереженому нічого не підказуємо, у нього номер уже є.
            if (this.props.value || !tree || !tree.loadProducts) return;

            var self = this;

            tree.loadProducts().then(function (products) {

                var max = 0;

                (products || []).forEach(function (product) {
                    if (typeof product.id === "number" && product.id > max) max = product.id;
                });

                if (!self.gone) self.setState({ next: max + 1 });

            }).catch(function () {

                // каталог не приїхав — просто не показуємо орієнтир

            });

        },

        render: function () {

            var id = this.props.value;

            var box = {
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                background: "#f9fafb"
            };

            var numberStyle = {
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "18px",
                fontWeight: 600,
                color: "#111827"
            };

            var noteStyle = { marginTop: "6px", fontSize: "12px", color: "#6b7280" };

            // Товар ще не збережений: номера немає.
            if (!id) {

                return h("div", { style: box },
                    h("div", { style: { fontSize: "14px", color: "#6b7280" } },
                        "Буде призначено після збереження"),
                    h("div", { style: noteStyle },
                        this.state.next
                            ? "Найближчий вільний номер — " + this.state.next
                              + ". Остаточний видасть збірка: якщо хтось створить товар раніше, номер зсунеться."
                            : "Номер видає збірка після збереження."));

            }

            var variants = variantsOf(this.props.entry);

            // Кольори — це суфікси: «95-1», «95-2» у тому порядку, у
            // якому вони стоять у списку нижче.
            var perColor = variants
                .map(function (variant, index) {

                    if (!variant) return null;

                    return id + "-" + (index + 1)
                        + (variant.color ? " — " + variant.color : "");

                })
                .filter(Boolean);

            return h("div", { style: box },
                h("div", { style: numberStyle }, String(id)),
                perColor.length > 1
                    ? h("div", { style: noteStyle },
                        "Кольори: " + perColor.join(", ")
                        + ". За номером до дефіса шукається той самий товар у будь-якому кольорі.")
                    : h("div", { style: noteStyle },
                        perColor.length === 1
                            ? "Колір один — його артикул " + id + "-1."
                            : "Номер ставить система, змінити його не можна."));

        }

    });

    var ArticlePreview = createClass({

        render: function () {

            return this.props.value ? h("span", null, String(this.props.value)) : null;

        }

    });

    CMS.registerWidget("articleNumber", ArticleControl, ArticlePreview);

})();
