// ======================================
// Кадрування фото товару прямо в адмінці
//
// ЩО ЦЕ ВИРІШУЄ
// --------------
// Картка каталогу і галерея товару — контейнери 4:5. Збірка вписує
// (fit: contain) будь-який знімок у холст 1200×1500, тож нічого не
// обрізається — але широке фото після цього лежить смужкою посередині
// з великими полями зверху й знизу, і товар у картці виглядає дрібним.
//
// Раніше єдиним способом це виправити було перезняти чи переобрізати
// фото у сторонньому редакторі й перезалити. Тепер кадр задається тут:
// повзунок наближення + перетягування точки фокуса, і поруч одразу
// видно, як картка виглядатиме в каталозі.
//
// НЕРУЙНІВНО
// -----------
// Сам файл не змінюється. Зберігається лише опис кадру
// (див. assets/js/image-framing.js):
//
//     framing: { "фото.webp": { zoom: 1.35, x: 50, y: 42 } }
//
// Тобто кадрування можна переграти будь-коли, а кнопка «Скинути»
// повертає повний кадр. Жоден піксель не втрачається.
//
// ЧОМУ ПРЕВ'Ю НЕ БРЕШЕ
// ---------------------
// Обчислення кадру — не в цьому файлі, а в assets/js/image-framing.js,
// який підключають і сайт, і адмінка. Одна формула на всіх: розійтись
// нема чому.
//
// ЧОМУ ПОЛЕ НА РІВНІ ТОВАРУ, А НЕ КОЛЬОРУ
// ----------------------------------------
// Ключ — ім'я файлу, а не позиція в списку. Тому кадр їде за фото:
// переставили знімки місцями чи перенесли фото в інший колір — рамка
// лишається при ньому. Плюс віджету видно ВСІ фото товару одразу
// (this.props.entry), і адмін кадрує їх в одному місці, а не пірнаючи
// в кожен колір окремо.
// ======================================

(function () {

    if (typeof CMS === "undefined") return;

    var h = window.h || (window.React && window.React.createElement);
    var createClass = window.createClass || window.createReactClass;

    if (!h || !createClass) return;

    // ЧОМУ ТУТ НЕМАЄ РАННЬОГО return
    // -------------------------------
    // Спершу цей файл виходив, якщо не знайшов window.ImageFraming, —
    // і це зробило товар НЕСОХРАНЯЄМИМ. Механізм такий:
    //
    //   1. віджет imageFraming не зареєстровано;
    //   2. resolveWidget() у Decap підставляє замість нього "unknown":
    //        function Ss(e){ return Cs(e || "string") || Cs("unknown"); }
    //   3. контрол "unknown" — функціональний компонент, тож ref у нього
    //      null, і processInnerControlRef виходить на першому рядку:
    //        processInnerControlRef = e => { if (!e) return; ... }
    //   4. через це this.wrappedControlValid лишається undefined, а
    //      validateWrappedControl на цьому КИДАЄ помилку.
    //
    // Назовні це виглядає як «Oops, you've missed a required field»,
    // хоча жодне поле не порожнє, і required: false не рятує: перевірка
    // присутності до цього місця навіть не доходить.
    //
    // Тому реєструємось ЗАВЖДИ, а відсутність файла обчислень показуємо
    // текстом усередині поля. Не працює кадрування — прикро; не
    // зберігається товар — неприпустимо.
    function framingLib() {
        return window.ImageFraming || null;
    }

    // ---------- дані ----------

    // Усі фото товару: з кожного кольору, без повторів, у порядку появи.
    function collectImages(entryData) {

        var out = [];
        var seen = {};

        var variants = entryData.get("variants");
        var list = (variants && variants.toJS) ? variants.toJS() : [];

        list.forEach(function (variant) {
            (((variant || {}).images) || []).forEach(function (src) {
                if (!src || seen[src]) return;
                seen[src] = true;
                out.push({ src: src, color: variant.color || "" });
            });
        });

        return out;

    }

    function toPlain(value) {
        if (!value) return {};
        if (typeof value.toJS === "function") return value.toJS();
        return value;
    }

    // ---------- один рядок: фото + керування ----------

    var FrameEditor = createClass({

        getInitialState: function () {
            return { dragging: false };
        },

        // Перетягування по кадру рухає точку фокуса. Рахуємо у відсотках
        // від рамки, а не в пікселях: рамка в адмінці менша за реальну
        // картку, і відсотки переносяться між ними без перерахунку.
        pointTo: function (event) {

            var box = this.frameNode && this.frameNode.getBoundingClientRect();

            if (!box || !box.width || !box.height) return;

            var point = (event.touches && event.touches[0]) || event;

            var x = ((point.clientX - box.left) / box.width) * 100;
            var y = ((point.clientY - box.top) / box.height) * 100;

            this.props.onChange({
                zoom: this.props.frame.zoom,
                x: Math.max(0, Math.min(100, Math.round(x))),
                y: Math.max(0, Math.min(100, Math.round(y)))
            });

        },

        handleDown: function (event) {
            event.preventDefault();
            this.setState({ dragging: true });
            this.pointTo(event);
        },

        handleMove: function (event) {
            if (!this.state.dragging) return;
            event.preventDefault();
            this.pointTo(event);
        },

        handleUp: function () {
            if (this.state.dragging) this.setState({ dragging: false });
        },

        handleZoom: function (event) {
            this.props.onChange({
                zoom: Number(event.target.value),
                x: this.props.frame.x,
                y: this.props.frame.y
            });
        },

        render: function () {

            var self = this;
            var frame = this.props.frame;
            var url = this.props.url;

            var zoomed = frame.zoom > 1;

            var imageStyle = {
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                transform: "scale(" + frame.zoom + ")",
                transformOrigin: frame.x + "% " + frame.y + "%"
            };

            return h("div", { className: "framing-row" },

                // ----- рамка 4:5, у ній фото і мітка фокуса -----
                h("div", {
                    className: "framing-frame",
                    ref: function (node) { self.frameNode = node; },
                    onMouseDown: this.handleDown,
                    onMouseMove: this.handleMove,
                    onMouseUp: this.handleUp,
                    onMouseLeave: this.handleUp,
                    onTouchStart: this.handleDown,
                    onTouchMove: this.handleMove,
                    onTouchEnd: this.handleUp,
                    title: "Потягніть, щоб обрати, яка частина кадру лишиться в центрі"
                },
                    url
                        ? h("img", { src: url, style: imageStyle, draggable: false, alt: "" })
                        : h("div", { className: "framing-empty" }, "фото не завантажилось"),

                    zoomed
                        ? h("span", {
                            className: "framing-dot",
                            style: { left: frame.x + "%", top: frame.y + "%" }
                        })
                        : null
                ),

                // ----- керування -----
                h("div", { className: "framing-controls" },

                    h("div", { className: "framing-name" },
                        String(this.props.src).split("/").pop(),
                        this.props.color
                            ? h("span", { className: "framing-color" }, " · " + this.props.color)
                            : null
                    ),

                    h("label", { className: "framing-zoom" },
                        h("span", null, "Наближення"),
                        h("input", {
                            type: "range",
                            min: this.props.lib.MIN_ZOOM,
                            max: this.props.lib.MAX_ZOOM,
                            step: 0.05,
                            value: frame.zoom,
                            onChange: this.handleZoom
                        }),
                        h("b", null, frame.zoom.toFixed(2) + "×")
                    ),

                    h("p", { className: "framing-hint" },
                        zoomed
                            ? "Точку в кадрі можна перетягнути — саме вона лишається на місці."
                            : "1× — фото показується повністю, як зараз."),

                    h("button", {
                        type: "button",
                        className: "framing-reset",
                        disabled: !zoomed,
                        onClick: function () { self.props.onChange(null); }
                    }, "Скинути кадр")
                )
            );

        }

    });

    // ---------- саме поле ----------

    var ImageFramingControl = createClass({

        getInitialState: function () {
            return { open: true };
        },

        frameOf: function (lib, src) {

            var stored = toPlain(this.props.value)[lib.imageKey(src)];
            var frame = lib.normalizeFrame(stored);

            return frame || { zoom: 1, x: 50, y: 50 };

        },

        setFrame: function (lib, src, frame) {

            var next = toPlain(this.props.value);
            var key = lib.imageKey(src);

            var clean = lib.normalizeFrame(frame);

            // zoom = 1 нічого не змінює — не засмічуємо файл товару
            if (clean) next[key] = clean;
            else delete next[key];

            this.props.onChange(next);

        },

        // Валідність поля не залежить від ref-а і від бібліотеки:
        // кадрування необов'язкове й ніколи не має блокувати збереження.
        isValid: function () {
            return true;
        },

        render: function () {

            var self = this;
            var lib = framingLib();

            if (!lib) {
                return h("div", { className: "framing-widget" },
                    h("p", { className: "framing-hint" },
                        "Кадрування недоступне: не завантажився "
                        + "assets/js/image-framing.js. На збереження товару це "
                        + "не впливає — уже задані рамки лишаються як є."));
            }

            var entryData = this.props.entry ? this.props.entry.get("data") : null;

            if (!entryData) {
                return h("div", { className: "framing-widget" },
                    h("p", { className: "framing-hint" }, "Дані товару ще вантажаться…"));
            }

            var images = collectImages(entryData);
            var getAsset = this.props.getAsset;

            if (!images.length) {
                return h("div", { className: "framing-widget" },
                    h("p", { className: "framing-hint" },
                        "Спершу додайте фото в блоці «Кольори та їх варіанти» — "
                        + "тоді тут з'явиться кадрування."));
            }

            return h("div", { className: "framing-widget" },

                h("button", {
                    type: "button",
                    className: "framing-toggle",
                    onClick: function () { self.setState({ open: !self.state.open }); }
                }, (this.state.open ? "▾ " : "▸ ") + "Кадрування фото (" + images.length + ")"),

                this.state.open
                    ? h("div", null, images.map(function (item, index) {

                        // getAsset розуміє і щойно вибраний файл (ще не
                        // залитий у репозиторій), і вже збережений шлях
                        var asset = getAsset ? getAsset(item.src) : null;
                        var url = asset ? (asset.toString ? asset.toString() : asset) : item.src;

                        return h(FrameEditor, {
                            key: item.src + index,
                            src: item.src,
                            color: item.color,
                            url: url,
                            lib: lib,
                            frame: self.frameOf(lib, item.src),
                            onChange: function (frame) { self.setFrame(lib, item.src, frame); }
                        });

                    }))
                    : null
            );

        }

    });

    var ImageFramingPreview = createClass({
        render: function () { return null; }   // усе показує прев'ю товару
    });

    CMS.registerWidget("imageFraming", ImageFramingControl, ImageFramingPreview);

}());
