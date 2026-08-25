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

    // Усі фото запису — з будь-якої колекції.
    //
    // Спершу функція вміла лише варіанти товару
    // (data.variants[].images), тож в акціях і на головній не знаходила
    // нічого. Тепер обходимо дані вглиб і збираємо все, що виглядає як
    // шлях до картинки: у товару це фото кольорів, в акції — image,
    // imageMobile і пара для сторінки акції, на головній — фон банера,
    // фон блока «Нова колекція» й фото категорій.
    //
    // Підпис беремо зі шляху до поля: у товару він лишається
    // зрозумілим, а в акції одразу видно, яке саме це з чотирьох фото.
    var IMAGE_RE = /\.(webp|jpe?g|png|avif|gif)$/i;

    // Поля, де шлях до картинки трапляється всередині тексту, а не як
    // саме фото, — інакше в список лізли б посилання з опису.
    var SKIP_KEYS = { body: 1, description: 1, seoDescription: 1 };

    function collectImages(entryData) {

        var out = [];
        var seen = {};

        function walk(value, label) {

            if (value === null || value === undefined) return;

            if (typeof value.toJS === "function") value = value.toJS();

            if (typeof value === "string") {

                if (!IMAGE_RE.test(value) || seen[value]) return;

                seen[value] = true;
                out.push({ src: value, label: label });

                return;

            }

            if (Array.isArray(value)) {

                value.forEach(function (item, index) {
                    walk(item, label + " " + (index + 1));
                });

                return;

            }

            if (typeof value === "object") {

                Object.keys(value).forEach(function (key) {

                    if (SKIP_KEYS[key]) return;

                    walk(value[key], label ? label + " → " + key : key);

                });

            }

        }

        walk(entryData, "");

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
            // fitError — щоб «Підігнати» не мовчало, коли не вдалося:
            // фото цілком біле, товар і так на весь кадр або знімок із
            // чужого домену.
            return { dragging: false, fitError: null };
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

        // Крок наближення кнопками.
        //
        // Повзунок дає плавність, але влучити ним у потрібне значення
        // важко, а дрібний рух миші взагалі не дає видимого ефекту —
        // через це складається враження, що інструмент не працює.
        // Кнопки дають передбачуваний крок і одразу видимий результат.
        step: function (delta) {

            var lib = this.props.lib;
            var next = Math.round((this.props.frame.zoom + delta) * 100) / 100;

            next = Math.max(lib.MIN_ZOOM, Math.min(lib.MAX_ZOOM, next));

            if (next === this.props.frame.zoom) return;

            this.props.onChange({
                zoom: next,
                x: this.props.frame.x,
                y: this.props.frame.y
            });

        },

        // «Підігнати»: прибрати білі поля навколо товару.
        //
        // НАВІЩО
        // -------
        // Предметні фото знімають на білому тлі, і товар часто займає
        // третину кадру. У картці він виглядає дрібним, а підбирати
        // наближення повзунком доводиться навпомацки.
        //
        // ЯК
        // ---
        // Малюємо фото на canvas і шукаємо межі НЕбілих пікселів — це і
        // є межі товару. Далі рахуємо, у скільки разів його треба
        // збільшити, щоб він зайняв кадр, і де центр цих меж.
        //
        // Фото лежать на тому самому домені, що й адмінка, тож canvas
        // не «псується» і пікселі читаються. Якщо колись зʼявиться фото
        // з іншого домену — читання кине помилку, і ми просто нічого не
        // робимо, а не ламаємо віджет.
        autoFit: function () {

            var self = this;
            var url = this.props.url;

            if (!url) return;

            var img = new Image();

            img.crossOrigin = "anonymous";

            img.onload = function () {

                var bounds = self.contentBounds(img);

                if (!bounds) {
                    self.setState({ fitError: "Не вдалося визначити межі товару" });
                    return;
                }

                var lib = self.props.lib;

                // Скільки треба збільшити, щоб товар зайняв кадр. Беремо
                // менший коефіцієнт із двох — інакше по одній зі сторін
                // товар вилізе за межі.
                var zoom = Math.min(1 / bounds.w, 1 / bounds.h);

                // Трохи менше, ніж «упритул»: невелике поле навколо
                // товару виглядає навмисним, а зріз по краю — недбалим.
                zoom = Math.round(zoom * 0.88 * 100) / 100;

                // Підганяти нема чого.
                //
                // Якщо товар займає майже весь кадр, розрахунок із
                // запасом дає значення НИЖЧЕ 1×. Раніше воно просто
                // затискалось до 1 — кнопка вдавала, що спрацювала, а
                // нічого не змінювалось. Краще сказати прямо.
                if (zoom < 1.05) {
                    self.setState({ fitError: "Товар і так займає майже весь кадр" });
                    return;
                }

                zoom = Math.min(lib.MAX_ZOOM, zoom);

                self.setState({ fitError: null });

                self.props.onChange({
                    zoom: zoom,
                    x: Math.round(bounds.cx * 100),
                    y: Math.round(bounds.cy * 100)
                });

            };

            img.onerror = function () {
                self.setState({ fitError: "Фото не завантажилось" });
            };

            img.src = url;

        },

        // Межі товару у частках від розміру фото.
        contentBounds: function (img) {

            // Зменшуємо перед аналізом: 200px по довшій стороні
            // достатньо, щоб знайти межі, і в рази швидше за повний
            // розмір.
            var max = 200;
            var scale = Math.min(1, max / Math.max(img.width, img.height));

            var w = Math.max(1, Math.round(img.width * scale));
            var h = Math.max(1, Math.round(img.height * scale));

            var canvas = document.createElement("canvas");

            canvas.width = w;
            canvas.height = h;

            var ctx = canvas.getContext("2d");

            ctx.drawImage(img, 0, 0, w, h);

            var data;

            try {
                data = ctx.getImageData(0, 0, w, h).data;
            } catch (error) {
                return null;   // фото з іншого домену
            }

            // Поріг «це вже не тло». Чисто білого на фото майже не
            // буває — тіні й компресія дають 245–252, тож беремо 244.
            var LIMIT = 244;

            var minX = w;
            var minY = h;
            var maxX = -1;
            var maxY = -1;

            for (var y = 0; y < h; y++) {

                for (var x = 0; x < w; x++) {

                    var i = (y * w + x) * 4;

                    var alpha = data[i + 3];

                    // прозорий піксель — теж тло
                    if (alpha < 16) continue;

                    if (data[i] > LIMIT && data[i + 1] > LIMIT && data[i + 2] > LIMIT) continue;

                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;

                }

            }

            if (maxX < 0) return null;   // фото цілком біле

            var bw = (maxX - minX + 1) / w;
            var bh = (maxY - minY + 1) / h;

            // Товар і так на весь кадр — підганяти нічого
            if (bw > 0.95 && bh > 0.95) return null;

            return {
                w: bw,
                h: bh,
                cx: (minX + maxX + 1) / 2 / w,
                cy: (minY + maxY + 1) / 2 / h
            };

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

                    h("div", { className: "framing-zoom" },
                        h("span", null, "Наближення"),
                        h("button", {
                            type: "button",
                            className: "framing-step",
                            "aria-label": "Зменшити",
                            disabled: frame.zoom <= this.props.lib.MIN_ZOOM,
                            onClick: function () { self.step(-0.1); }
                        }, "−"),
                        h("input", {
                            type: "range",
                            min: this.props.lib.MIN_ZOOM,
                            max: this.props.lib.MAX_ZOOM,
                            step: 0.05,
                            value: frame.zoom,
                            onChange: this.handleZoom
                        }),
                        h("button", {
                            type: "button",
                            className: "framing-step",
                            "aria-label": "Збільшити",
                            disabled: frame.zoom >= this.props.lib.MAX_ZOOM,
                            onClick: function () { self.step(0.1); }
                        }, "+"),
                        h("b", null, frame.zoom.toFixed(2) + "×")
                    ),

                    // «Підігнати» — те, що потрібно найчастіше: предметні
                    // фото зняті на білому тлі, і товар займає третину
                    // кадру. Одне натискання замість підбору повзунком.
                    h("div", { className: "framing-actions" },
                        h("button", {
                            type: "button",
                            className: "framing-fit",
                            onClick: function () { self.autoFit(); }
                        }, "Підігнати по товару"),

                        h("button", {
                            type: "button",
                            className: "framing-reset",
                            disabled: !zoomed && frame.x === 50 && frame.y === 50,
                            onClick: function () { self.props.onChange(null); }
                        }, "Скинути кадр")
                    ),

                    // Підказка залежить від стану: при 1× головне —
                    // сказати, ЯК зробити товар більшим, а не те, що
                    // фото показується повністю (це й так видно).
                    h("p", { className: "framing-hint" },
                        this.state.fitError
                            ? this.state.fitError
                            : zoomed
                                ? "Точку в кадрі перетягніть — саме вона лишиться в центрі."
                                : "Товар виглядає дрібним? Натисніть «Підігнати по товару» — "
                                  + "білі поля навколо обріжуться. Або наблизьте вручну.")
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
                            color: item.label,
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
