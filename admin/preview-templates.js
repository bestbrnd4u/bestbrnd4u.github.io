// ======================================
// Власні прев'ю для адмінки (Decap CMS)
//
// НАВІЩО: типове прев'ю Decap просто вивалює список полів
// ("Бренд: Nike", далі маркований список розмірів тощо). З нього
// неможливо зрозуміти, як товар виглядатиме на сайті — а саме це
// й потрібно перед публікацією.
//
// Тут ми малюємо ту саму розмітку і тими самими класами, що й
// справжня картка на сайті, а через registerPreviewStyle
// підвантажуємо реальний assets/css/style.css — тож прев'ю виглядає
// як готова картка, а не як дамп даних. Під візуалом — повний
// перелік решти полів, щоб нічого не загубилось.
//
// ВАЖЛИВО про картинки: у прев'ю шляхи до щойно завантажених файлів
// ще не існують на сайті, тому їх треба резолвити через getAsset(),
// який Decap передає в шаблон. Прямий src="/assets/..." показав би
// «биту» картинку.
// ======================================

(function () {

    if (typeof CMS === "undefined") return;

    // -------------------------
    // Спільні дрібниці
    // -------------------------

    // ВАЖЛИВО: приймаємо ДОВІЛЬНУ кількість дітей через arguments.
    // Перша версія була написана як h(tag, props, children) — і
    // передавала далі лише ПЕРШУ дитину, тож у прев'ю потрапляв
    // тільки підказковий рядок, а вся картка мовчки зникала.
    var h = function (tag, props) {

        var children = Array.prototype.slice.call(arguments, 2);
        var create = (typeof window !== "undefined" && window.h) ? window.h
                   : (typeof React !== "undefined" ? React.createElement : null);

        if (!create) return null;

        return create.apply(null, [tag, props].concat(children));

    };

    // -------------------------
    // Картинка, яка вміє дочекатись файлу
    //
    // ЯК getAsset() ПОВОДИТЬСЯ НАСПРАВДІ
    // -----------------------------------
    // Не «віддає адресу або нічого». Поки файл не прочитаний, Decap
    // повертає ЗАГЛУШКУ — проксі з path «empty.svg» і адресою blob на
    // порожній <svg></svg>. Тобто адреса цілком справжня, картинка
    // валідна, просто в ній нічого немає:
    //
    //     if (isLoading) return emptyAsset;
    //     return asset || (dispatch(loadAsset(key)), emptyAsset);
    //
    // Через це компонент бачив непорожній рядок, вважав справу
    // зробленою й більше нічого не питав. У картці лишалося порожнє
    // місце — БЕЗ підпису «завантажується», бо формально адреса є.
    //
    // Лікувалось лише руками: перемкнути вкладку «Сторінка товару» і
    // назад. Перемикання РОЗМОНТОВУЄ компонент, новий екземпляр питає
    // адресу заново — і на цей раз файл уже прочитаний.
    //
    // Тому тепер заглушку розпізнаємо (assetReady нижче) і питаємо
    // далі: одразу на кожній перемальовці прев'ю — Decap перемальовує
    // його, коли завантажив файл, — і додатково за таймером, як
    // страховка, якщо перемальовки не сталося.
    // -------------------------

    var AssetImage = createClass({

        getInitialState: function () {
            return { url: "", failed: false, white: null };
        },

        componentDidMount: function () {
            this.resolve();
            this.applyWhite();
        },

        componentDidUpdate: function (prevProps) {

            if (prevProps.path !== this.props.path) {

                // замінили фото — пробуємо наново, з чистого аркуша
                this.attempt = 0;
                this.clearRetry();
                this.whiteFor = null;
                this.setState({ failed: false, white: null });
                this.resolve();

                return;

            }

            // Прев'ю перемальовується, коли Decap завантажив файл, —
            // саме тут ми про це й дізнаємось. Якщо адреси досі немає,
            // питаємо знову: цього разу заглушки вже може не бути.
            if (!this.state.url && !this.state.failed && !this.retryTimer) {
                this.resolve();
                return;
            }

            // Адреса могла щойно розвʼязатись, а рішення про фон —
            // змінитись («Не чіпати» замість «Зробити білим»). І те, і
            // те приходить сюди.
            this.applyWhite();

        },

        componentWillUnmount: function () {
            this.gone = true;
            this.clearRetry();
        },

        clearRetry: function () {
            if (this.retryTimer) {
                clearTimeout(this.retryTimer);
                this.retryTimer = null;
            }
        },

        // Чи це справжнє фото, а не заглушка Decap.
        //
        // Заглушку пізнаємо за path: у неї він завжди «empty.svg».
        // Порівнювати саму адресу не можна — це blob, унікальний
        // щоразу.
        assetReady: function (asset) {

            if (!asset) return false;

            if (asset.path === "empty.svg") return false;

            return String(asset) !== "";

        },

        // Фон таким, яким він стане після публікації.
        //
        // ЩО БУЛО НЕ ТАК
        // ---------------
        // Картка показувала файл як є. Виглядало це так: у рядку
        // кадрування ліворуч фон уже білий, а тут, у картці, — той
        // самий сірий, що й був. Підпис під кнопкою виправдовувався
        // («у картці праворуч фон ще старий»), і власник справедливо
        // читав це як «нічого не працює».
        //
        // Прев'ю існує рівно заради «побачити, як буде». Показувати в
        // ньому те, чого після публікації вже не буде, — гірше, ніж не
        // показувати нічого.
        //
        // Рахує не цей файл, а admin/white-preview.js: тим самим
        // алгоритмом, що й збірка, і з тим самим кешем, що й віджет
        // кадрування. Тобто одне фото обробляється ОДИН раз на всю
        // адмінку, скільки б місць його не просило — тут їх до восьми:
        // рядок кадрування, велике фото картки, мініатюра під ним і те
        // саме на вкладці «Сторінка товару».
        applyWhite: function () {

            var self = this;
            var url = this.state.url;

            if (!this.props.whiten || !url || !window.WhitePreview) return;

            // Ключ — адреса ПЛЮС рішення: те саме фото з «Не чіпати»
            // має інший результат.
            var key = url + "|" + ((this.props.frame && this.props.frame.bg) || "авто");

            if (this.whiteFor === key) return;

            this.whiteFor = key;

            window.WhitePreview.resolve(url, this.props.frame, function (result) {

                if (self.gone || self.whiteFor !== key) return;

                self.setState({ white: result.url });

            });

        },

        resolve: function () {

            var self = this;
            var path = this.props.path;

            if (!path) { this.setState({ url: "" }); return; }

            var asset;

            try {
                asset = this.props.getAsset(path);
            } catch (error) {
                this.setState({ url: "", failed: true });
                return;
            }

            // Decap може повернути або готовий обʼєкт, або обіцянку —
            // приймаємо обидва варіанти
            if (asset && typeof asset.then === "function") {

                asset.then(function (resolved) {
                    if (!self.gone) self.setState({ url: String(resolved || "") });
                }).catch(function () {
                    if (!self.gone) self.setState({ url: "", failed: true });
                });

                return;

            }

            if (this.assetReady(asset)) {

                this.attempt = 0;

                this.setState({ url: String(asset), failed: false });

                return;

            }

            // Заглушка або порожньо — файл ще читається. Головна надія
            // на перемальовку прев'ю (див. componentDidUpdate), а це
            // страховка: якщо перемальовки не буде, спитаємо самі.
            //
            // Пауза наростає: перші спроби часті, щоб фото зʼявилось
            // без затримки, далі рідші, щоб не крутитись даремно.
            // Разом близько семи секунд — довше за будь-яке читання
            // файлу з бекенда.
            var ПАУЗИ = [100, 150, 250, 400, 600, 900, 1300, 1800, 2500];

            this.attempt = this.attempt || 0;

            if (this.attempt < ПАУЗИ.length) {

                var пауза = ПАУЗИ[this.attempt];

                this.attempt++;

                this.clearRetry();

                this.retryTimer = setTimeout(function () {
                    self.retryTimer = null;
                    if (!self.gone) self.resolve();
                }, пауза);

                // Лишаємо підпис «завантажується» — тепер він і справді
                // зʼявляється, а не порожнє місце.
                this.setState({ url: "" });

                return;

            }

            this.setState({ url: "", failed: true });

        },

        render: function () {

            if (!this.state.url) {

                var text = !this.props.path ? "фото не завантажено"
                    : this.state.failed ? "не вдалося показати фото"
                    : "фото завантажується…";

                return h("div", { className: "cms-preview-nophoto" }, text);

            }

            return h("img", {
                src: this.state.white || this.state.url,
                className: this.props.className,
                // кадрування: ті самі CSS-змінні, що на сайті
                style: this.props.style || null,
                alt: "",
            });

        },

    });

    function esc(value) {
        return value === undefined || value === null ? "" : String(value);
    }

    function formatPrice(value) {
        var n = Number(value);
        if (!isFinite(n)) return "";
        return new Intl.NumberFormat("uk-UA").format(n) + "\u00A0грн";
    }

    // список полів під візуалом: показуємо ВСЕ, що заповнено,
    // щоб прев'ю не приховувало даних
    function detailsList(rows) {

        var visible = rows.filter(function (r) {
            return r[1] !== undefined && r[1] !== null && String(r[1]).trim() !== "";
        });

        if (!visible.length) return null;

        return h("div", { className: "cms-preview-details" },
            visible.map(function (r, i) {
                return h("div", { className: "cms-preview-row", key: i },
                    h("span", { className: "cms-preview-label" }, r[0]),
                    h("span", { className: "cms-preview-value" }, String(r[1]))
                );
            })
        );

    }

    function section(title, node) {
        if (!node) return null;
        return h("div", { className: "cms-preview-section" },
            h("h4", { className: "cms-preview-heading" }, title),
            node
        );
    }

    // -------------------------
    // Галерея прев'ю
    //
    // Раніше тут показувалось лише images[0], тож перевірити решту
    // знімків можна було тільки після публікації. Тепер видно всі:
    // стрілки, крапки й мініатюри — і кожне фото вже з накладеною
    // рамкою кадрування, тобто рівно так, як його побачить покупець.
    // -------------------------

    function frameStyleFor(framing, src) {

        if (!window.ImageFraming) return null;

        var style = window.ImageFraming.frameStyleObject(framing, src);

        return Object.keys(style).length ? style : null;

    }

    // Рішення про фон цього фото — «зробити білим», «не чіпати»,
    // «вирізати» або порожньо (як вирішить збірка). Лежить у тому
    // самому кадрі, тож дістаємо тією ж бібліотекою, що й наближення.
    function frameFor(framing, src) {

        return window.ImageFraming ? window.ImageFraming.frameFor(framing, src) : null;

    }

    // Та сама подія, що й у admin/image-framing-widget.js — там же
    // пояснення, навіщо саме подія, а не спільний стан.
    var ACTIVE_EVENT = "bb4u:framing-active";

    function sameImage(a, b) {

        var name = function (v) {
            return String(v || "").split("?")[0].split("#")[0].split("/").pop();
        };

        return !!a && !!b && name(a) === name(b);

    }

    var PreviewGallery = createClass({

        getInitialState: function () {
            return { index: 0 };
        },

        // Перегортаємо картку на те фото, яке правлять у віджеті
        // кадрування.
        //
        // НАВІЩО. Ви налаштовуєте третє фото, а картка показує перше —
        // і побачити, що вийшло, можна лише окремо догортавши сюди
        // стрілками, здогадавшись, яке з пʼяти відповідає вашому рядку.
        // Заради цього прев'ю й існує, тож хай воно саме йде за роботою.
        componentDidMount: function () {

            var self = this;

            this.onActive = function (event) {

                var images = self.props.images || [];

                for (var i = 0; i < images.length; i++) {

                    if (!sameImage(images[i], event.detail)) continue;

                    if (self.state.index !== i) self.setState({ index: i });

                    return;

                }

            };

            window.addEventListener(ACTIVE_EVENT, this.onActive);

        },

        componentWillUnmount: function () {
            if (this.onActive) window.removeEventListener(ACTIVE_EVENT, this.onActive);
        },

        // Звʼязок у зворотний бік: перегорнули картку — підсвітився
        // потрібний рядок у кадруванні.
        //
        // Розсилаємо ЛИШЕ зі своїх обробників кліку, а не з відповіді
        // на подію: інакше два компоненти ганяли б її по колу.
        announce: function (index) {

            var images = this.props.images || [];

            if (!images[index] || typeof window.CustomEvent !== "function") return;

            window.dispatchEvent(new CustomEvent(ACTIVE_EVENT, {
                detail: String(images[index])
            }));

        },

        // Фото могли видалити або переставити, поки прев'ю відкрите:
        // тримаємо індекс у межах списку, інакше галерея показала б
        // порожнечу замість останнього знімка.
        clampIndex: function (total) {
            var i = this.state.index;
            return total ? Math.max(0, Math.min(total - 1, i)) : 0;
        },

        step: function (delta, total) {

            if (!total) return;

            var next = (this.clampIndex(total) + delta + total) % total;

            this.setState({ index: next });
            this.announce(next);

        },

        render: function () {

            var self = this;
            var images = this.props.images || [];
            var framing = this.props.framing;
            var getAsset = this.props.getAsset;

            if (!images.length) {
                return h(AssetImage, { path: null, getAsset: getAsset,
                                       className: this.props.imageClass });
            }

            var index = this.clampIndex(images.length);
            var many = images.length > 1;

            return h("div", { className: "cms-preview-gallery" },

                h("div", { className: "cms-preview-stage" },

                    h(AssetImage, {
                        key: images[index],
                        path: images[index],
                        getAsset: getAsset,
                        className: this.props.imageClass,
                        style: frameStyleFor(framing, images[index]),
                        // Фон вирівнює лише збірка фото товарів
                        // (scripts/whiten-backgrounds.js обходить
                        // assets/images/products/uploads), тож прапорець
                        // стоїть саме тут, а не в самому AssetImage:
                        // банер акції чи фото добірки ніхто не відбілює.
                        whiten: true,
                        frame: frameFor(framing, images[index])
                    }),

                    many ? h("button", {
                        type: "button",
                        className: "cms-preview-nav cms-preview-prev",
                        onClick: function () { self.step(-1, images.length); },
                        "aria-label": "Попереднє фото"
                    }, "\u2039") : null,

                    many ? h("button", {
                        type: "button",
                        className: "cms-preview-nav cms-preview-next",
                        onClick: function () { self.step(1, images.length); },
                        "aria-label": "Наступне фото"
                    }, "\u203A") : null,

                    many ? h("div", { className: "cms-preview-counter" },
                        (index + 1) + " / " + images.length) : null
                ),

                many ? h("div", { className: "cms-preview-thumbs" },
                    images.map(function (src, i) {
                        return h("button", {
                            key: src + i,
                            type: "button",
                            className: "cms-preview-thumb" + (i === index ? " is-active" : ""),
                            onClick: function () { self.setState({ index: i }); self.announce(i); },
                            title: String(src).split("/").pop()
                        }, h(AssetImage, {
                            path: src,
                            getAsset: getAsset,
                            className: "cms-preview-thumb-img",
                            style: frameStyleFor(framing, src),
                            whiten: true,
                            frame: frameFor(framing, src)
                        }));
                    })
                ) : null
            );

        }

    });

    // -------------------------
    // ТОВАР — справжня картка каталогу
    // -------------------------

    var ProductPreview = createClass({

        getInitialState: function () {
            // "card" — картка в каталозі, "page" — сторінка товару
            return { view: "card" };
        },

        render: function () {

            var self = this;

            // getInitialState виконує React, але прев'ю рендерять і
            // напряму (tests/test-admin-preview.js викликає render з
            // підставним this). Без запасного значення такий виклик
            // падав на this.state.view — а мовчазне падіння прев'ю в
            // адмінці виглядало б як «редактор зламався».
            var view = (this.state && this.state.view) || "card";

            var e = this.props.entry.get("data");
            var getAsset = this.props.getAsset;

            var variants = e.get("variants");
            var variantList = variants && variants.toJS ? variants.toJS() : [];
            var first = variantList[0] || {};

            var images = first.images || [];

            var price = e.get("price");
            var oldPrice = e.get("oldPrice");

            var discount = (oldPrice && price && Number(oldPrice) > Number(price))
                ? Math.round((1 - Number(price) / Number(oldPrice)) * 100)
                : 0;

            // розміри активного (першого) кольору — так само, як на сайті:
            // свої розміри кольору мають пріоритет над загальними
            var sizes = (first.sizes && first.sizes.length)
                ? first.sizes
                : (e.get("sizes") ? e.get("sizes").toJS() : []);

            var card = h("div", { className: "product-card cms-preview-card" },

                h("div", { className: "product-image" },

                    h("div", { className: "badge-stack" },
                        e.get("badge") ? h("div", { className: "badge" }, e.get("badge")) : null,
                        discount > 0 ? h("div", { className: "badge badge-discount" }, "-" + discount + "%") : null,
                        e.get("preOrder") ? h("div", { className: "badge badge-preorder" }, "📦") : null
                    ),

                    h(PreviewGallery, {
                        images: images,
                        framing: e.get("framing"),
                        getAsset: getAsset,
                        imageClass: "cms-preview-cover"
                    })
                ),

                h("div", { className: "product-info" },

                    h("div", { className: "product-category-row" },
                        h("span", { className: "product-category" }, esc(e.get("brand")))
                    ),

                    h("h3", { className: "product-title" }, esc(e.get("title"))),

                    h("div", { className: "product-meta-row" },

                        h("div", { className: "product-options" },

                            h("div", { className: "product-colors" },
                                variantList.map(function (v, i) {
                                    return h("button", {
                                        key: i,
                                        type: "button",
                                        className: "mini-color" + (i === 0 ? " active" : ""),
                                        style: { background: v.hex || "#ccc" },
                                        title: v.color
                                    });
                                })
                            ),

                            h("div", { className: "product-sizes" },
                                sizes.map(function (s, i) {
                                    return h("button", { key: i, type: "button", className: "mini-size" }, s);
                                })
                            )
                        ),

                        h("div", { className: "product-price" },
                            h("span", { className: "price" }, formatPrice(price)),
                            oldPrice ? h("span", { className: "old-price" }, formatPrice(oldPrice)) : null
                        )
                    ),

                    h("button", { className: "buy-btn", type: "button" },
                        e.get("preOrder") ? "Замовити" : "Купити")
                )
            );

            // повний перелік кольорів з їх власними розмірами/артикулами
            var variantsBlock = variantList.length
                ? h("div", { className: "cms-preview-variants" },
                    variantList.map(function (v, i) {
                        return h("div", { className: "cms-preview-variant", key: i },
                            h("span", {
                                className: "cms-preview-swatch",
                                style: { background: v.hex || "#ccc" }
                            }),
                            h("span", { className: "cms-preview-variant-name" }, esc(v.color)),
                            h("span", { className: "cms-preview-variant-meta" },
                                [
                                    v.sku ? "арт. " + v.sku : null,
                                    (v.sizes && v.sizes.length) ? "розміри: " + v.sizes.join(", ") : null,
                                    (v.images && v.images.length) ? v.images.length + " фото" : "без фото",
                                    v.video ? "+ відео" : null
                                ].filter(Boolean).join(" · ")
                            )
                        );
                    })
                )
                : null;

            // ---- сторінка товару ----
            //
            // Раніше прев'ю показувало лише картку каталогу, і як товар
            // виглядає на власній сторінці, було видно тільки після
            // публікації. Верстка нижче повторює галерею сторінки
            // товару: великий кадр із мініатюрами збоку.
            var pageView = h("div", { className: "cms-preview-page" },

                h("div", { className: "cms-preview-page-gallery" },
                    h(PreviewGallery, {
                        images: images,
                        framing: e.get("framing"),
                        getAsset: getAsset,
                        imageClass: "cms-preview-page-image"
                    })
                ),

                h("div", { className: "cms-preview-page-info" },
                    h("div", { className: "cms-preview-page-brand" }, esc(e.get("brand"))),
                    h("h2", { className: "cms-preview-page-title" }, esc(e.get("title"))),
                    h("div", { className: "cms-preview-page-price" },
                        price ? formatPrice(price) : "",
                        oldPrice
                            ? h("s", { className: "cms-preview-page-old" }, formatPrice(oldPrice))
                            : null
                    ),
                    e.get("description")
                        ? h("p", { className: "cms-preview-page-desc" }, e.get("description"))
                        : null
                )
            );

            var tabs = [["card", "Картка в каталозі"], ["page", "Сторінка товару"]];

            return h("div", { className: "cms-preview" },

                h("div", { className: "cms-preview-tabs" },
                    tabs.map(function (tab) {
                        return h("button", {
                            key: tab[0],
                            type: "button",
                            className: "cms-preview-tab"
                                + (view === tab[0] ? " is-active" : ""),
                            onClick: function () { self.setState({ view: tab[0] }); }
                        }, tab[1]);
                    })
                ),

                h("div", { className: "cms-preview-hint" },
                    view === "card"
                        ? "Так товар виглядатиме в каталозі. Гортайте фото стрілками."
                        : "Так виглядатиме сторінка товару. Нижче — решта даних."),

                h("div", { className: "cms-preview-stage" },
                    view === "card" ? card : pageView),

                section("Кольори та їх варіанти", variantsBlock),

                section("Основне", detailsList([
                    ["Категорія", e.get("category")],
                    ["Для кого", e.get("gender")],
                    ["Артикул (загальний)", e.get("sku")],
                    ["Загальні розміри", e.get("sizes") ? e.get("sizes").toJS().join(", ") : ""],
                    ["Ціна", price ? formatPrice(price) : ""],
                    ["Стара ціна", oldPrice ? formatPrice(oldPrice) : ""],
                    ["Знижка", discount > 0 ? "-" + discount + "%" : ""],
                    ["Бейдж", e.get("badge")],
                    ["Новинка", e.get("isNew") ? "так" : ""],
                    ["Під замовлення", e.get("preOrder") ? "так" : ""],
                    ["Термін виготовлення", e.get("preOrderDays")],
                    ["Передоплата, %", e.get("preOrderPrepayment")]
                ])),

                section("Опис", e.get("description")
                    ? h("p", { className: "cms-preview-text" }, e.get("description")) : null),

                section("Характеристики", detailsList([
                    ["Матеріал", e.get("material")],
                    ["Країна", e.get("country")],
                    ["Застібка", e.get("closure")],
                    ["Декор", e.get("decor")],
                    ["Габарити", e.get("dimensions")],
                    ["Ремінь", e.get("strap")],
                    ["Відділення", e.get("compartments")],
                    ["Склад", e.get("composition")]
                ])),

                section("Службове", detailsList([
                    ["Instagram-блок", e.get("instagramBlock")],
                    ["Посилання на Reels", e.get("instagramReels")],
                    ["Слова для пошуку", e.get("searchKeywords")
                        ? e.get("searchKeywords").toJS().join(", ") : ""],
                    ["Публікувати попри неповні дані", e.get("forcePublish") ? "так" : ""]
                ]))
            );

        }

    });

    // -------------------------
    // АКЦІЯ
    // -------------------------

    var PromotionPreview = createClass({

        render: function () {

            var e = this.props.entry.get("data");
            var getAsset = this.props.getAsset;

            var teaser = e.get("image");
            var pageImg = e.get("promoPageImage");

            var products = e.get("products");
            var productList = products && products.toJS ? products.toJS() : [];

            // банер сторінки акції — той самий вигляд, що на promo.html
            // Банер малюємо картинкою під текстом, а не фоном: фон не
            // вміє дочекатись щойно завантаженого файлу, а AssetImage вміє.
            var banner = h("div", { className: "cms-preview-promo-banner" },
                h("div", { className: "cms-preview-promo-bg" },
                    h(AssetImage, { path: pageImg || teaser, getAsset: getAsset })),
                e.get("badge") ? h("span", { className: "cms-preview-promo-badge" }, e.get("badge")) : null,
                h("h2", { className: "cms-preview-promo-title" }, esc(e.get("title"))),
                e.get("text") ? h("p", { className: "cms-preview-promo-text" }, e.get("text")) : null,
                h("span", { className: "btn cms-preview-promo-btn" }, esc(e.get("buttonText") || "Дивитись усі товари"))
            );

            return h("div", { className: "cms-preview" },

                h("div", { className: "cms-preview-hint" },
                    pageImg
                        ? "Банер на сторінці акції (окреме фото)."
                        : "Банер на сторінці акції. Окреме фото не задане — узято прев'ю з головної, воно може обрізатись."),

                h("div", { className: "cms-preview-stage" }, banner),

                section("Прев'ю на головній", teaser
                    ? h(AssetImage, { path: teaser, getAsset: getAsset, className: "cms-preview-teaser" })
                    : null),

                section("Налаштування", detailsList([
                    ["Показувати на сайті", e.get("active") === false ? "ні" : "так"],
                    ["Спосіб показу", e.get("displayType")],
                    ["Порядок показу", e.get("order")],
                    ["Бейдж", e.get("badge")],
                    ["Бренд акції", e.get("brand")],
                    ["Знижка за замовчуванням, %", e.get("discountPercent")],
                    ["Посилання кнопки", e.get("link")],
                    ["Товарів обрано вручну", productList.length || ""]
                ]))
            );

        }

    });

    // -------------------------
    // ДОБІРКА
    // -------------------------

    var CollectionPreview = createClass({

        render: function () {

            var e = this.props.entry.get("data");
            var getAsset = this.props.getAsset;

            var img = e.get("image");

            var products = e.get("products");
            var productList = products && products.toJS ? products.toJS() : [];

            var block = h("div", { className: "cms-preview-collection" },

                h(AssetImage, {
                    path: img,
                    getAsset: getAsset,
                    className: "cms-preview-collection-img",
                }),

                h("div", { className: "cms-preview-collection-body" },
                    e.get("eyebrow") ? h("span", { className: "cms-preview-eyebrow" }, e.get("eyebrow")) : null,
                    h("h3", { className: "cms-preview-collection-title" }, esc(e.get("title"))),
                    e.get("text") ? h("p", { className: "cms-preview-text" }, e.get("text")) : null,
                    h("span", { className: "cms-preview-count" },
                        productList.length ? "Товарів у добірці: " + productList.length : "Товари ще не обрані")
                )
            );

            return h("div", { className: "cms-preview" },

                h("div", { className: "cms-preview-hint" },
                    "Добірка на головній: велике фото зліва, товари справа з гортанням."),

                h("div", { className: "cms-preview-stage" }, block),

                section("Налаштування", detailsList([
                    ["Показувати на сайті", e.get("active") === false ? "ні" : "так"],
                    ["Порядок", e.get("order")],
                    ["Надпис над заголовком", e.get("eyebrow")],
                    ["Текст-опис фото (alt)", e.get("imageAlt")],
                    ["Товарів обрано", productList.length || ""]
                ]))
            );

        }

    });

    // -------------------------
    // СПЛИВАЮЧИЙ БАНЕР
    // -------------------------

    var PopupPreview = createClass({

        render: function () {

            var e = this.props.entry.get("data");
            var img = e.get("image");

            return h("div", { className: "cms-preview" },

                h("div", { className: "cms-preview-hint" },
                    "Спливаючий банер у кутку екрана."),

                h("div", { className: "cms-preview-stage" },
                    h("div", { className: "cms-preview-popup" },
                        h(AssetImage, { path: img, getAsset: this.props.getAsset })
                    )
                ),

                section("Налаштування", detailsList([
                    ["Показувати", e.get("active") === false ? "ні" : "так"],
                    ["Назва (службова)", e.get("name")],
                    ["Веде на акцію", e.get("promoSlug")]
                ]))
            );

        }

    });

    // -------------------------
    // Реєстрація
    // -------------------------

    // справжні стилі сайту — щоб картка виглядала точно як у каталозі
    // Стилі прев'ю — БЕЗ кешу.
    //
    // Decap тягне ці файли у свій iframe звичайним запитом, тож браузер
    // кешує їх нарівні зі статикою сайту. На практиці це виглядало так:
    // preview-templates.js уже новий і малює галерею з вкладками, а
    // preview-styles.css лишається старим — вкладки злипаються в один
    // рядок тексту, стрілки й лічильник без оформлення. Виглядає як
    // «прев'ю зламалось», хоча зламався тільки кеш.
    //
    // Адмінкою користуються одиниці, файли невеликі, тож постійне
    // перезавантаження тут дешевше за плутанину.
    var noCache = "?v=" + Date.now();

    CMS.registerPreviewStyle("../assets/css/style.css" + noCache);
    CMS.registerPreviewStyle("preview-styles.css" + noCache);

    CMS.registerPreviewTemplate("products", ProductPreview);
    CMS.registerPreviewTemplate("promotions", PromotionPreview);
    CMS.registerPreviewTemplate("collections", CollectionPreview);
    CMS.registerPreviewTemplate("promoPopups", PopupPreview);

})();
