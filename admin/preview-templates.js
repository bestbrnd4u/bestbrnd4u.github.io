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
    // getAsset() віддає вже збережені фото ОДРАЗУ, а щойно завантажені —
    // ні: для них повертається обʼєкт, який отримує адресу згодом
    // (файл спершу треба прочитати в памʼяті браузера). Прев'ю ж
    // малювалось один раз і більше не перемальовувалось — тому нове
    // фото лишалось «битим», хоча старі показувались нормально.
    //
    // Цей компонент запитує адресу, чекає на неї й перемальовує себе,
    // коли вона зʼявиться. Плюс стежить за зміною значення: замінили
    // фото — запитує заново.
    // -------------------------

    var AssetImage = createClass({

        getInitialState: function () {
            return { url: "", failed: false };
        },

        componentDidMount: function () {
            this.resolve();
        },

        componentDidUpdate: function (prevProps) {

            if (prevProps.path === this.props.path) return;

            // замінили фото — пробуємо наново, з чистого аркуша
            this.retried = false;
            this.setState({ failed: false });
            this.resolve();

        },

        componentWillUnmount: function () {
            this.gone = true;
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

            var url = asset ? String(asset) : "";

            // Порожній рядок означає, що файл ще читається. Пробуємо
            // ще раз за мить — інакше довелося б перемикати вкладку,
            // щоб побачити щойно завантажене фото.
            if (!url && !this.retried) {

                this.retried = true;

                setTimeout(function () { if (!self.gone) self.resolve(); }, 250);

            }

            this.setState({ url: url });

        },

        render: function () {

            if (!this.state.url) {

                var text = !this.props.path ? "фото не завантажено"
                    : this.state.failed ? "не вдалося показати фото"
                    : "фото завантажується…";

                return h("div", { className: "cms-preview-nophoto" }, text);

            }

            return h("img", {
                src: this.state.url,
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

    var PreviewGallery = createClass({

        getInitialState: function () {
            return { index: 0 };
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
            this.setState({ index: (this.clampIndex(total) + delta + total) % total });
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
                        style: frameStyleFor(framing, images[index])
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
                            onClick: function () { self.setState({ index: i }); },
                            title: String(src).split("/").pop()
                        }, h(AssetImage, {
                            path: src,
                            getAsset: getAsset,
                            className: "cms-preview-thumb-img",
                            style: frameStyleFor(framing, src)
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
