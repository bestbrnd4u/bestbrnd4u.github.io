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
    // ТОВАР — справжня картка каталогу
    // -------------------------

    var ProductPreview = createClass({

        render: function () {

            var e = this.props.entry.get("data");
            var getAsset = this.props.getAsset;

            var variants = e.get("variants");
            var variantList = variants && variants.toJS ? variants.toJS() : [];
            var first = variantList[0] || {};

            var images = first.images || [];
            var cover = images[0] ? getAsset(images[0]).toString() : "";

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

                    cover
                        ? h("img", { src: cover, alt: "", className: "cms-preview-cover" })
                        : h("div", { className: "cms-preview-nophoto" }, "фото не завантажено")
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

            return h("div", { className: "cms-preview" },

                h("div", { className: "cms-preview-hint" },
                    "Так товар виглядатиме в каталозі. Нижче — решта даних."),

                h("div", { className: "cms-preview-stage" }, card),

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

            var teaser = e.get("image") ? getAsset(e.get("image")).toString() : "";
            var pageImg = e.get("promoPageImage") ? getAsset(e.get("promoPageImage")).toString() : "";

            var products = e.get("products");
            var productList = products && products.toJS ? products.toJS() : [];

            // банер сторінки акції — той самий вигляд, що на promo.html
            var banner = h("div", { className: "cms-preview-promo-banner",
                    style: pageImg || teaser
                        ? { backgroundImage: "linear-gradient(rgba(17,24,39,.55), rgba(17,24,39,.55)), url(" + (pageImg || teaser) + ")" }
                        : {} },
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
                    ? h("img", { src: teaser, className: "cms-preview-teaser", alt: "" }) : null),

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

            var img = e.get("image") ? getAsset(e.get("image")).toString() : "";

            var products = e.get("products");
            var productList = products && products.toJS ? products.toJS() : [];

            var block = h("div", { className: "cms-preview-collection" },

                img
                    ? h("img", { src: img, className: "cms-preview-collection-img", alt: "" })
                    : h("div", { className: "cms-preview-nophoto" }, "фото не завантажено"),

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
            var img = e.get("image") ? this.props.getAsset(e.get("image")).toString() : "";

            return h("div", { className: "cms-preview" },

                h("div", { className: "cms-preview-hint" },
                    "Спливаючий банер у кутку екрана."),

                h("div", { className: "cms-preview-stage" },
                    h("div", { className: "cms-preview-popup" },
                        img ? h("img", { src: img, alt: "" })
                            : h("div", { className: "cms-preview-nophoto" }, "фото не завантажено")
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
    CMS.registerPreviewStyle("../assets/css/style.css");
    CMS.registerPreviewStyle("preview-styles.css");

    CMS.registerPreviewTemplate("products", ProductPreview);
    CMS.registerPreviewTemplate("promotions", PromotionPreview);
    CMS.registerPreviewTemplate("collections", CollectionPreview);
    CMS.registerPreviewTemplate("promoPopups", PopupPreview);

})();
