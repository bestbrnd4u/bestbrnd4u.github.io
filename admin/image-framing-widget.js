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

    // Значення поля — завжди СВІЖИЙ об'єкт, ніколи не той самий.
    //
    // ЩО БУЛО НЕ ТАК
    // ---------------
    // Останній рядок повертав value як є. Здається дрібницею, але саме
    // через нього віджет «замерзав» після першої ж зміни:
    //
    //   1. кадру ще немає → toPlain(undefined) віддає новий {} →
    //      onChange отримує нове посилання → усе перемальовується.
    //      Тому ПЕРШЕ «Підігнати» працювало;
    //   2. далі value — це вже той самий об'єкт. toPlain віддає його
    //      ж, setFrame міняє його НА МІСЦІ, і onChange приносить
    //      Decap рівно те посилання, яке там уже лежить. Для React і
    //      Redux нічого не змінилось — перемальовування немає.
    //
    // Назовні це виглядало так: «Скинути кадр» не скидає, а «Підігнати»
    // на другому фото не робить нічого. Дані при цьому мовчки
    // мінялись — розбіжність між тим, що на екрані, і тим, що
    // збережеться.
    //
    // Immutable-гілка (.toJS) копію робила завжди, тому там баг не
    // проявлявся — і на нього легко було не подумати.
    function toPlain(value) {
        if (!value) return {};
        if (typeof value.toJS === "function") return value.toJS();
        return Object.assign({}, value);
    }

    // ---------- один рядок: фото + керування ----------

    // Адреси фото: розвʼязуємо ОДИН раз і запамʼятовуємо.
    //
    // ЩО БУЛО НЕ ТАК
    // ---------------
    // getAsset(шлях) викликався прямо в render(). Віджет
    // перемальовується на кожен рух повзунка й на кожне перетягування
    // точки — десятки разів за секунду. Кожен виклик просив Decap
    // розвʼязати файл заново.
    //
    // Наслідок було видно в інструментах браузера: 1917 запитів,
    // «Wait Action timed out» триста разів, і головне — фото не
    // показувались зовсім. Розвʼязування не встигало завершитись, бо
    // його щоразу починали спочатку. Натиснеш «−» — картинка раптом
    // зʼявляється: чергова перемальовка встигла зловити готовий
    // результат. Точку перетягнути теж не виходило: адмінка була
    // зайнята запитами.
    //
    // ЯК ЗАРАЗ
    // ---------
    // Фото з репозиторію мають звичайний шлях /assets/images/..., а
    // адмінка віддається з того самого домену — такий шлях працює
    // напряму, без жодного запиту через Decap.
    //
    // getAsset лишається лише для щойно вибраного файлу, який ще не
    // залитий. Результат кладемо в кеш, тож повторно не питаємо.
    var assetCache = {};

    function publicUrl(src, getAsset) {

        var key = String(src || "");

        if (!key) return "";

        if (assetCache[key]) return assetCache[key];

        // Шлях із репозиторію — беремо як є.
        if (/^\/?assets\//.test(key)) {

            assetCache[key] = key.charAt(0) === "/" ? key : "/" + key;

            return assetCache[key];

        }

        if (!getAsset) return key;

        var asset = getAsset(key);
        var url = asset ? (asset.toString ? asset.toString() : asset) : key;

        // blob-адресу не кешуємо: вона живе лише до перезавантаження
        // сторінки, і збережена в кеші стала б битим посиланням.
        if (url && url.indexOf("blob:") !== 0) assetCache[key] = url;

        return url || key;

    }

    // ---------- фон: ті самі правила, що в збірці ----------

    // Допуск і поріг однорідності — ті самі, що в
    // scripts/whiten-backgrounds.js. Розійдуться — і передперегляд
    // почне показувати не те, що вийде після публікації.
    var TOLERANCE = 14;
    var MAX_VARIANCE = 3;

    // Кольори фону — з УСЬОГО периметра, а не з чотирьох кутів.
    //
    // ЩО БУЛО НЕ ТАК. Кути брались як єдине джерело правди. Але перед
    // публікацією фото проходить normalize-product-images.js: знімок
    // вписується в полотно 4:5, а поля добиваються БІЛИМ. У кутах
    // опиняється саме ця добивка — 255, — а фон самого знімка (240)
    // лишається непоміченим.
    //
    // Звідси й скарга: підпис казав «Фон вже білий» над фото, у якого
    // дві третини кадру сірі.
    function borderColors(px, w, h) {

        var groups = [];

        function add(x, y) {

            var i = (y * w + x) * 4;

            if (px[i + 3] < 16) return;

            for (var k = 0; k < groups.length; k++) {

                var g = groups[k];

                if (Math.abs(g.c[0] - px[i]) <= TOLERANCE
                    && Math.abs(g.c[1] - px[i + 1]) <= TOLERANCE
                    && Math.abs(g.c[2] - px[i + 2]) <= TOLERANCE) { g.n++; return; }

            }

            groups.push({ c: [px[i], px[i + 1], px[i + 2]], n: 1 });

        }

        var step = Math.max(1, Math.round(Math.min(w, h) / 100));
        var x, y;

        for (x = 0; x < w; x += step) { add(x, 0); add(x, h - 1); }
        for (y = 0; y < h; y += step) { add(0, y); add(w - 1, y); }

        var total = groups.reduce(function (s, g) { return s + g.n; }, 0) || 1;

        var kept = groups
            .filter(function (g) { return g.n / total >= 0.05; })
            .sort(function (a, b) { return b.n - a.n; });

        return {
            colors: kept.map(function (g) { return g.c; }),
            coverage: kept.reduce(function (s, g) { return s + g.n; }, 0) / total
        };

    }

    function matchesBackground(px, i, colors) {

        for (var k = 0; k < colors.length; k++) {

            if (Math.abs(px[i] - colors[k][0]) <= TOLERANCE
                && Math.abs(px[i + 1] - colors[k][1]) <= TOLERANCE
                && Math.abs(px[i + 2] - colors[k][2]) <= TOLERANCE) return true;

        }

        return false;

    }

    // ---------- звʼязок із прев'ю картки ----------

    // Праворуч у Decap стоїть прев'ю картки товару, і воно жило власним
    // життям: ви правите третє фото, а картка вперто показує перше.
    // Щоб побачити результат, доводилось окремо гортати її стрілками й
    // самому здогадуватись, яке з пʼяти фото відповідає рядку, у якому
    // ви зараз стоїте.
    //
    // Тепер обидві сторони говорять про «поточне фото» через одну
    // подію: клац по рядку — картка перегортається на це фото; клац по
    // стрілці чи мініатюрі в картці — підсвічується відповідний рядок.
    //
    // ЧОМУ ПОДІЯ, А НЕ СПІЛЬНИЙ СТАН
    // -------------------------------
    // Віджет і шаблон прев'ю — два незалежні компоненти Decap: вони не
    // мають спільного батька, і передати щось пропсами нема через кого.
    // Прев'ю малюється в окремому iframe, але САМ КОД виконується у
    // головному вікні (Decap рендерить туди порталом), тож window у них
    // спільне — цього досить.
    //
    // Порівнюємо за ІМЕНЕМ ФАЙЛУ, а не за повним шляхом: у віджеті це
    // шлях із запису, у прев'ю той самий шлях може приїхати вже
    // розвʼязаним через getAsset.
    var ACTIVE_EVENT = "bb4u:framing-active";

    function announceActive(src) {

        if (!src || typeof window.CustomEvent !== "function") return;

        window.dispatchEvent(new CustomEvent(ACTIVE_EVENT, { detail: String(src) }));

    }

    function sameImage(a, b) {

        var name = function (v) {
            return String(v || "").split("?")[0].split("#")[0].split("/").pop();
        };

        return !!a && !!b && name(a) === name(b);

    }

    var FrameEditor = createClass({

        getInitialState: function () {
            // fitError — щоб «Підігнати» не мовчало, коли не вдалося:
            // фото цілком біле, товар і так на весь кадр або знімок із
            // чужого домену.
            return {
                dragging: false,
                fitError: null,
                // фон: адреса фото, яку вже розібрали (див. detectBackground)
                bgChecked: null,
                bgColor: null,
                // усі кольори фону: біла добивка до 4:5 і фон знімка
                bgColors: null,
                bgUniform: false,
                bgIsWhite: false,
                // Пікселі розбору тут більше не тримаємо: передперегляд
                // малюється зі свого, більшого кадру, а копія ImageData
                // на кожен рядок — це мегабайти в стані ні за чим.
                //
                // відбілений передперегляд і фото, для якого його рахували
                whitePreview: null,
                whitePreviewFor: null
            };
        },

        // Розбір тла запускаємо тут.
        //
        // ЩО БУЛО НЕ ТАК. detectBackground існував, був дописаний і
        // готовий — але його ніхто не викликав. Жодного componentDidMount
        // у цьому компоненті не було, тож bgColor лишався null назавжди,
        // а весь блок про тло (кружечок кольору, підпис, три кнопки й
        // передперегляд) просто не малювався. Код був, функції не було.
        componentDidMount: function () {

            var self = this;

            this.alive = true;

            // Підсвічуємо рядок, коли картку праворуч перегорнули на
            // це фото — щоб не шукати очима, який із десяти рядків
            // зараз показаний.
            this.onActive = function (event) {

                var active = sameImage(event.detail, self.props.src);

                if (active !== self.state.active) self.setState({ active: active });

            };

            window.addEventListener(ACTIVE_EVENT, this.onActive);

            this.detectBackground();
            this.ensureWhitePreview();

        },

        // Малювання передперегляду асинхронне: рядок може зникнути
        // (прибрали фото, згорнули блок) раніше, ніж воно завершиться.
        // Без цього прапорця setState прилетів би в неживий компонент.
        componentWillUnmount: function () {
            this.alive = false;
            if (this.onActive) window.removeEventListener(ACTIVE_EVENT, this.onActive);
        },

        // Адреса фото приходить не одразу: getAsset розвʼязує файл
        // асинхронно, і на першому кадрі url ще порожній. Без цього
        // рядка розбір тла так і не стартував би для щойно доданого
        // фото — до перезавантаження сторінки.
        componentDidUpdate: function () {
            this.detectBackground();
            this.ensureWhitePreview();
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

        // Тло фото: визначаємо колір і, за потреби, показуємо, яким
        // воно стане білим.
        //
        // ЧОМУ ПОКАЗУЄМО, А НЕ ПРОСТО ПЕРЕМИКАЄМО
        // ----------------------------------------
        // Заміна тла необоротна для файлу: після збірки оригінал уже
        // перезаписаний (копія лишається в _originals, але лізти туди —
        // окрема історія). Тому рішення приймається, коли видно
        // результат, а не наосліп.
        //
        // Малюємо на canvas ту саму заливку від країв, що робить
        // збірка. Це не «схоже на результат» — це він і є, тим самим
        // алгоритмом.
        detectBackground: function () {

            var self = this;
            var url = this.props.url;

            // Запамʼятовуємо САМУ АДРЕСУ, а не «вже перевіряли».
            //
            // Прапорець-булеан означав би, що фото, підмінене в цьому ж
            // рядку (інший файл у тому самому варіанті кольору),
            // лишиться з чужим результатом розбору — кружечок покаже
            // колір попереднього знімка.
            if (!url || this.state.bgChecked === url) return;

            this.setState({ bgChecked: url });

            var img = new Image();

            img.crossOrigin = "anonymous";

            // Фото не завантажилось — блок про тло просто не зʼявиться,
            // і це правильно: краще без нього, ніж із вигаданим
            // кольором. Але слід у консолі лишаємо: мовчазна відсутність
            // цілого блоку інтерфейсу — саме те, через що його одного
            // разу вже не помітили.
            img.onerror = function () {
                console.warn("Кадрування: не вдалось прочитати фото для розбору тла:", url);
            };

            img.onload = function () {

                var max = 160;
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
                    data = ctx.getImageData(0, 0, w, h);
                } catch (error) {
                    return;   // фото з іншого домену
                }

                var found = borderColors(data.data, w, h);

                var colors = found.colors;

                if (!colors.length) return;

                // Фон знімка — це НЕбілий колір, якщо він є. Біле
                // здебільшого виявляється добивкою до 4:5, і показувати
                // її як «знайдений колір» означає брехати підписом.
                var bg = colors.filter(function (c) {
                    return Math.min(c[0], c[1], c[2]) < 250;
                })[0] || colors[0];

                self.setState({
                    bgColors: colors,
                    bgColor: bg,
                    // Однорідність міряємо покриттям периметра, а не
                    // розкидом кутів: кути після приведення до 4:5
                    // показують добивку, а не фон знімка.
                    bgUniform: found.coverage >= 0.9,
                    bgIsWhite: colors.every(function (c) {
                        return Math.min(c[0], c[1], c[2]) >= 250;
                    })
                });

            };

            img.src = url;

        },

        // Заливка від країв — та сама, що в scripts/whiten-backgrounds.js.
        //
        // Йдемо від рамки всередину й зупиняємось на першому пікселі
        // товару. Світла пряжка в центрі сумки лишається пряжкою: шлях
        // до неї перекритий самим товаром.
        // Передперегляд «як стане після публікації».
        //
        // ЩО БУЛО НЕ ТАК
        // ---------------
        // Заливку рахували на тих самих пікселях, що й РОЗБІР тла, — а
        // розбір навмисно працює на зменшеній копії 160px: йому треба
        // лише колір кутів, і читати заради цього повний файл ні до
        // чого.
        //
        // Для передперегляду ті самі 160px — це вирок. Рамка в адмінці
        // близько 145px завширшки, при наближенні 1.5× у неї
        // розтягується сотня пікселів джерела. Фото після натискання
        // «Зробити білим» помітно мутніло — і виглядало це так, ніби
        // кнопка псує знімок.
        //
        // Тому передперегляд малюємо окремо й більшим (640px по довгій
        // стороні — учетверо більше за рамку навіть на екрані з
        // подвоєною щільністю).
        //
        // І РАХУЄМО ОДИН РАЗ
        // -------------------
        // Раніше whitenedPreview() викликався прямо в render(), тобто
        // заливка всього кадру + toDataURL проганялись на кожне
        // перемальовування — а воно трапляється на кожен рух повзунка й
        // на кожен піксель перетягування точки. На 160px це просто
        // марна робота; на 640px браузер би став колом. Тому результат
        // рахується один раз на фото й лежить у стані.
        ensureWhitePreview: function () {

            var self = this;
            var url = this.props.url;

            var potribno = url && this.props.frame && this.props.frame.bg === "white";

            // Зняли «Зробити білим» — прибираємо й картинку, інакше
            // рамка показувала б відбілене фото після скасування.
            if (!potribno) {

                if (this.state.whitePreviewFor) {
                    this.setState({ whitePreview: null, whitePreviewFor: null });
                }

                return;

            }

            // Колір фону ще не порахований.
            //
            // Кнопки в цей момент і не видно — весь блок малюється лише
            // коли bgColor є. Але рішення «білим» могло бути ЗБЕРЕЖЕНЕ
            // раніше, і тоді ми приходимо сюди на самому монтуванні,
            // поки розбір ще летить. Мовчки зайняти адресу означало б
            // ніколи не намалювати передперегляд: повторної спроби вже
            // не буде. Тому просто чекаємо наступного оновлення.
            if (!this.state.bgColor) return;

            if (this.state.whitePreviewFor === url) return;

            this.setState({ whitePreviewFor: url });

            var img = new Image();

            img.crossOrigin = "anonymous";

            img.onerror = function () {
                console.warn("Кадрування: не вдалось прочитати фото для передперегляду:", url);
            };

            img.onload = function () {

                var max = 640;
                var scale = Math.min(1, max / Math.max(img.width, img.height));

                var w = Math.max(1, Math.round(img.width * scale));
                var h = Math.max(1, Math.round(img.height * scale));

                var canvas = document.createElement("canvas");

                canvas.width = w;
                canvas.height = h;

                canvas.getContext("2d").drawImage(img, 0, 0, w, h);

                var data;

                try {
                    data = canvas.getContext("2d").getImageData(0, 0, w, h);
                } catch (error) {
                    return;   // фото з іншого домену
                }

                // Кольори фону беремо з РОЗБОРУ, а не міряємо заново:
                // інакше підпис («Фон сірий або бежевий») і картинка
                // могли б розійтись на кілька одиниць і суперечити одне
                // одному.
                var colors = self.state.bgColors;

                if (!colors || !colors.length) return;

                var url_ = self.whitenPixels(data.data, w, h, colors, canvas);

                if (self.alive !== false) self.setState({ whitePreview: url_ });

            };

            img.src = url;

        },

        // Сама заливка від країв — та сама, що в збірці
        // (scripts/whiten-backgrounds.js), із тим самим допуском.
        // Це не «схоже на результат», а він і є.
        whitenPixels: function (source, w, h, colors, canvas) {

            var px = new Uint8ClampedArray(source);

            var visited = new Uint8Array(w * h);
            var queue = [];

            function push(x, y) {

                if (x < 0 || y < 0 || x >= w || y >= h) return;

                var p = y * w + x;

                if (visited[p]) return;

                var i = p * 4;

                if (px[i + 3] < 16) { visited[p] = 1; return; }

                if (!matchesBackground(px, i, colors)) return;

                visited[p] = 1;
                queue.push(p);

            }

            for (var x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
            for (var y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

            while (queue.length) {

                var p = queue.pop();
                var i = p * 4;

                px[i] = 255;
                px[i + 1] = 255;
                px[i + 2] = 255;

                var cx = p % w;
                var cy = (p - cx) / w;

                push(cx - 1, cy);
                push(cx + 1, cy);
                push(cx, cy - 1);
                push(cx, cy + 1);

            }

            // Замкнені кишені фону — те, куди заливці не було ходу:
            // всередині петлі ремня, під ручкою. Без цього кроку
            // передперегляд показував би сірий острівець, якого в
            // опублікованому фото вже не буде — і показував би неправду.
            //
            // Однорідність (розкид яскравості) — той самий запобіжник,
            // що в збірці: підкладка з фактурою фоном не вважається.
            for (var start = 0; start < w * h; start++) {

                if (visited[start] || !matchesBackground(px, start * 4, colors)) continue;

                var cells = [];
                var pocket = [start];
                var sum = 0;
                var sum2 = 0;

                visited[start] = 1;

                while (pocket.length) {

                    var q = pocket.pop();
                    var qi = q * 4;

                    cells.push(q);

                    var lum = (px[qi] + px[qi + 1] + px[qi + 2]) / 3;

                    sum += lum;
                    sum2 += lum * lum;

                    var qx = q % w;
                    var qy = (q - qx) / w;

                    [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]].forEach(function (pt) {

                        if (pt[0] < 0 || pt[1] < 0 || pt[0] >= w || pt[1] >= h) return;

                        var n = pt[1] * w + pt[0];

                        if (visited[n] || !matchesBackground(px, n * 4, colors)) return;

                        visited[n] = 1;
                        pocket.push(n);

                    });

                }

                var mean = sum / cells.length;
                var variance = Math.sqrt(Math.max(0, sum2 / cells.length - mean * mean));

                if (variance > MAX_VARIANCE) continue;

                cells.forEach(function (c) {
                    px[c * 4] = 255;
                    px[c * 4 + 1] = 255;
                    px[c * 4 + 2] = 255;
                });

            }

            canvas.getContext("2d").putImageData(new ImageData(px, w, h), 0, 0);

            return canvas.toDataURL("image/png");

        },

        setBackground: function (value) {

            this.props.onChange({
                zoom: this.props.frame.zoom,
                x: this.props.frame.x,
                y: this.props.frame.y,
                bg: value
            });

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
                y: this.props.frame.y,
                // Рішення про тло переносимо разом із кадром.
                //
                // Без цього рядка воно тихо зникало: обрали «Зробити
                // білим», потім поворухнули наближення — і фото
                // повертається під автоматику, яка вирішить, що тло 250
                // «вже біле», і лишить його сірим. Помітили б це аж на
                // сайті.
                bg: this.props.frame.bg || null
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
                    y: Math.round(bounds.cy * 100),
                    // Кадр і тло — різні рішення про те саме фото.
                    // «Підігнати» міняє кадр і не має права скасовувати
                    // вибір тла.
                    bg: self.props.frame.bg || null
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

            // Колір тла беремо З КУТІВ КАДРУ, а не з зашитого числа.
            //
            // ЧОМУ. Тут стояв поріг 244: «світліше — значить біле тло».
            // Але предметні фото знімають не тільки на білому: у Coach
            // тло 240/240/240, тобто світло-сіре. Поріг його не
            // визнавав, «не-фоном» виявлявся ВЕСЬ кадр, межі товару
            // виходили на всю картинку — і кнопка честно відповідала
            // «не вдалося визначити межі товару».
            //
            // Кольори фону беремо з усього периметра — той самий розбір,
            // що й для кнопки «Зробити білим».
            //
            // Раніше тут брались чотири кути. На фото, приведеному до
            // 4:5, у кутах лежить БІЛА ДОБИВКА, а фон знімка сірий — і
            // «межею товару» ставав край цієї добивки. Виходило, що
            // товар займає майже весь кадр, і «Підігнати» чесно
            // відповідало «підганяти нема чого», нічого не зробивши.
            var found = borderColors(data, w, h);

            if (!found.colors.length || found.coverage < 0.9) return null;

            // Свій допуск, вужчий за той, що в заливці (14).
            //
            // Тут ми шукаємо МЕЖІ товару, і кожна зайва одиниця допуску
            // з'їдає його край: тінь під сумкою чи світлий шов
            // зараховуються до фону, і кадр обрізається по живому.
            // Заливці ж запас потрібен — вона фон замінює, а не міряє.
            var TOLERANCE = 12;

            function isBackground(x, y) {

                var i = (y * w + x) * 4;

                if (data[i + 3] < 16) return true;   // прозорий — теж фон

                return found.colors.some(function (c) {
                    return Math.abs(data[i] - c[0]) <= TOLERANCE
                        && Math.abs(data[i + 1] - c[1]) <= TOLERANCE
                        && Math.abs(data[i + 2] - c[2]) <= TOLERANCE;
                });

            }

            var minX = w;
            var minY = h;
            var maxX = -1;
            var maxY = -1;

            for (var y = 0; y < h; y++) {

                for (var x = 0; x < w; x++) {

                    if (isBackground(x, y)) continue;

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

            return h("div", {

                className: "framing-row" + (this.state.active ? " is-active" : ""),

                // Клац будь-де в рядку — картка праворуч показує саме це
                // фото. Слухаємо mousedown на всьому рядку, а не окремі
                // кнопки: людина може почати з повзунка, з рамки чи з
                // «Зробити білим» — намір скрізь один.
                onMouseDown: function () { announceActive(self.props.src); }

            },

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
                        ? h("img", {
                            // Коли обрано «біле», показуємо ПЕРЕМАЛЬОВАНЕ
                            // фото, а не оригінал: рішення приймається,
                            // коли результат видно.
                            src: (frame.bg === "white" && this.state.whitePreview) || url,
                            style: imageStyle,
                            draggable: false,
                            alt: ""
                        })
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

                    // Тло фото.
                    //
                    // Показуємо, який колір знайдено, і даємо вибір. Без
                    // цього рядка людина не знає, чому одне фото
                    // автоматика вирівняла, а інше ні — і чи взагалі
                    // тут є що вирівнювати.
                    this.state.bgColor
                        ? h("div", { className: "framing-bg" },

                            h("span", { className: "framing-bg-label" },
                                h("i", {
                                    className: "framing-bg-dot",
                                    style: {
                                        background: "rgb(" + this.state.bgColor.join(",") + ")"
                                    }
                                }),
                                this.state.bgIsWhite
                                    ? "Фон вже білий"
                                    : this.state.bgUniform
                                        ? "Фон сірий або бежевий"
                                        : "Фон неоднорідний"),

                            // Неоднорідний фон не чіпаємо взагалі: це фото
                            // на моделі або в інтерʼєрі, там фоном
                            // слугує сам знімок.
                            this.state.bgUniform
                                ? h("div", { className: "framing-bg-actions" },

                                    h("button", {
                                        type: "button",
                                        className: "framing-bg-btn"
                                            + (frame.bg === "white" ? " is-active" : ""),
                                        onClick: function () { self.setBackground("white"); }
                                    }, "Зробити білим"),

                                    h("button", {
                                        type: "button",
                                        className: "framing-bg-btn"
                                            + (frame.bg === "keep" ? " is-active" : ""),
                                        onClick: function () { self.setBackground("keep"); }
                                    }, "Не чіпати"),

                                    frame.bg
                                        ? h("button", {
                                            type: "button",
                                            className: "framing-bg-btn",
                                            onClick: function () { self.setBackground(null); }
                                        }, "Автоматично")
                                        : null)
                                : null,

                            // «Вирізати» пропонуємо ЗАВЖДИ, зокрема на
                            // неоднорідному фоні — це якраз той випадок,
                            // де заливка безсила, а нейромережа дає раду.
                            h("div", { className: "framing-bg-actions" },

                                h("button", {
                                    type: "button",
                                    className: "framing-bg-btn"
                                        + (frame.bg === "cutout" ? " is-active" : ""),
                                    onClick: function () { self.setBackground("cutout"); }
                                }, "Вирізати товар"),

                                h("span", { className: "framing-hint" },
                                    frame.bg === "cutout"
                                        ? "Товар виріжеться при публікації. Тінь при цьому зникне."
                                        : "Для фото на столі чи з візерунком — там, де заливка безсила.")),

                            h("p", { className: "framing-hint" },
                                !this.state.bgUniform
                                    ? "Фото на моделі або в інтерʼєрі — фон тут замінити не можна."
                                    : frame.bg === "white"
                                        // Прямо кажемо, ДЕ дивитись. Картка
                                        // праворуч показує файл як він є —
                                        // вона про верстку, не про фон, — і
                                        // незмінене фото в ній читається як
                                        // «кнопка не спрацювала».
                                        ? "Результат видно ліворуч. У картці праворуч фон ще старий — він зміниться при публікації."
                                        : frame.bg === "keep"
                                            ? "Це фото лишиться як є."
                                            : this.state.bgIsWhite
                                                ? "Нічого робити не потрібно."
                                                : "Збірка вирівняє фон сама. «Не чіпати» — щоб залишила як є."))
                        : null,

                    // «Підігнати» — те, що потрібно найчастіше: предметні
                    // фото зняті на білому тлі, і товар займає третину
                    // кадру. Одне натискання замість підбору повзунком.
                    h("div", { className: "framing-actions" },
                        h("button", {
                            type: "button",
                            className: "framing-fit",
                            onClick: function () { self.autoFit(); }
                        }, "Підігнати по товару"),

                        // «Скинути кадр» скидає САМЕ КАДР — наближення й
                        // точку фокуса. Вибір тла лишається: для нього є
                        // своя кнопка «Автоматично», і одна кнопка, що
                        // мовчки скасовує два різні рішення, — це та
                        // сама пастка, через яку тло зникало при
                        // наближенні.
                        h("button", {
                            type: "button",
                            className: "framing-reset",
                            disabled: !zoomed && frame.x === 50 && frame.y === 50,
                            onClick: function () {
                                self.setState({ fitError: null });
                                self.props.onChange({
                                    zoom: 1, x: 50, y: 50, bg: frame.bg || null
                                });
                            }
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

                        var url = publicUrl(item.src, getAsset);

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
