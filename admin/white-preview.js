// ======================================
// Білий фон: показуємо результат ДО публікації
//
// НАВІЩО ОКРЕМИЙ ФАЙЛ
// --------------------
// Заливку фону робить збірка (scripts/whiten-backgrounds.js), уже
// після того, як товар збережено. В адмінці її треба ПОКАЗАТИ — і не
// в одному місці, а в двох:
//
//   admin/image-framing-widget.js  рамка в рядку кадрування (ліворуч);
//   admin/preview-templates.js     картка каталогу і сторінка товару
//                                  (праворуч, разом із мініатюрами).
//
// Спершу заливка жила всередині віджета, і картка праворуч показувала
// файл як є. Виглядало це так: ліворуч фон білий, праворуч сірий,
// підпис виправдовується «він зміниться при публікації». Тобто прев'ю,
// яке існує рівно заради «побачити результат», результату й не
// показувало.
//
// Тому обчислення переїхали сюди. Копіювати їх у прев'ю було не можна:
// дві заливки з однаковим змістом розходяться на першій же правці — і
// тоді два вікна поруч показують різне, а котре з них правда, зʼясується
// аж після публікації.
//
// ЧОМУ НЕ В assets/js/image-framing.js
// -------------------------------------
// Той файл підключає КОЖНА сторінка сайту. Заливка потрібна лише
// адмінці — покупцю приїжджає вже оброблене фото. Класти в спільний
// файл кілограм канвасу заради двох людей із доступом до адмінки —
// платити трафіком усіх за зручність одиниць.
//
// ЩО ТУТ Є, ОКРІМ САМОЇ ЗАЛИВКИ
// ------------------------------
// plan() — рішення «що станеться з цим фото при публікації». Порядок
// перевірок повторює whiten(file) у збірці рядок у рядок: розійдуться —
// і прев'ю знову почне брехати, тільки цього разу тихо.
// ======================================

(function (root) {

    "use strict";

    // ---------- числа, спільні зі збіркою ----------
    //
    // Кожне з них має пару в scripts/whiten-backgrounds.js. Розійдуться —
    // і показане перестане збігатися з опублікованим. Тест звіряє їх
    // між файлами, щоб таке не проїхало непоміченим.

    // Допуск навколо кольору фону: тіні й компресія дають кілька одиниць.
    var TOLERANCE = 14;

    // Наскільки рівною має бути замкнена область, щоб вважатись фоном.
    var MAX_VARIANCE = 3;

    // Світліше за це — вважаємо, що фон уже білий.
    var ALREADY_WHITE = 250;

    // Залито майже весь кадр — щось не так із визначенням фону.
    var MAX_SHARE = 0.97;

    // Розбір кольору: треба лише периметр, повний файл читати ні до чого.
    var PROBE_MAX = 160;

    // Передперегляд: його розглядають очима, тож учетверо більший за
    // рамку в адмінці навіть на екрані з подвоєною щільністю.
    var PREVIEW_MAX = 640;

    // ---------- чиста математика (працює і в Node) ----------

    // Кольори фону — з УСЬОГО периметра, а не з чотирьох кутів.
    //
    // ЩО БУЛО НЕ ТАК. Перед публікацією фото проходить
    // normalize-product-images.js: знімок вписується в полотно 4:5, а
    // поля добиваються БІЛИМ. У кутах опиняється саме ця добивка (255),
    // а фон самого знімка (240) лишається непоміченим — і підпис казав
    // «Фон вже білий» над фото, у якого дві третини кадру сірі.
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

    // Заливка від країв + замкнені кишені. Міняє px НА МІСЦІ й повертає
    // кількість зафарбованих пікселів — саме за нею збірка вирішує, чи
    // не залилось часом усе фото.
    function whitenPixels(px, w, h, colors) {

        var visited = new Uint8Array(w * h);
        var queue = [];
        var painted = 0;

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

        var x, y;

        for (x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
        for (y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

        while (queue.length) {

            var p = queue.pop();
            var i = p * 4;

            px[i] = 255;
            px[i + 1] = 255;
            px[i + 2] = 255;

            painted++;

            var cx = p % w;
            var cy = (p - cx) / w;

            push(cx - 1, cy);
            push(cx + 1, cy);
            push(cx, cy - 1);
            push(cx, cy + 1);

        }

        // Замкнені кишені фону — те, куди заливці не було ходу:
        // всередині петлі ремня, під ручкою. Без цього кроку лишався б
        // сірий острівець, якого в опублікованому фото вже не буде.
        //
        // Однорідність — запобіжник: без неї світла підкладка всередині
        // сумки стала б білою дірою.
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

                var around = [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]];

                for (var a = 0; a < around.length; a++) {

                    var ax = around[a][0];
                    var ay = around[a][1];

                    if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;

                    var n = ay * w + ax;

                    if (visited[n] || !matchesBackground(px, n * 4, colors)) continue;

                    visited[n] = 1;
                    pocket.push(n);

                }

            }

            var mean = sum / cells.length;
            var variance = Math.sqrt(Math.max(0, sum2 / cells.length - mean * mean));

            if (variance > MAX_VARIANCE) continue;

            for (var c = 0; c < cells.length; c++) {

                px[cells[c] * 4] = 255;
                px[cells[c] * 4 + 1] = 255;
                px[cells[c] * 4 + 2] = 255;

                painted++;

            }

        }

        return painted;

    }

    // Розбір периметра → що ми знаємо про фон цього фото.
    function describe(px, w, h) {

        var found = borderColors(px, w, h);

        if (!found.colors.length) return null;

        var white = function (c) { return Math.min(c[0], c[1], c[2]) >= ALREADY_WHITE; };

        return {

            colors: found.colors,

            // Колір для кружечка в підписі — НЕбілий, якщо він є. Біле
            // здебільшого виявляється добивкою до 4:5, і показувати її
            // як «знайдений колір» означає брехати підписом.
            color: found.colors.filter(function (c) { return !white(c); })[0] || found.colors[0],

            // Однорідність міряємо покриттям периметра, а не розкидом
            // кутів: кути після приведення до 4:5 показують добивку.
            uniform: found.coverage >= 0.9,

            isWhite: found.colors.every(white)

        };

    }

    // Що станеться з фото при публікації.
    //
    // Порядок перевірок ТОЙ САМИЙ, що у whiten(file) у збірці:
    // «не чіпати» → «вирізати» → однорідність → «уже біле». Змінити
    // його тут означає почати показувати не те, що вийде.
    function plan(frame, found) {

        var chosen = (frame && frame.bg) || null;

        if (chosen === "keep") return { act: "keep", why: "лишаємо як є" };

        // Вирізання робить нейромережа під час збірки — у браузері її
        // немає, тож показати результат тут неможливо. Чесніше лишити
        // оригінал, ніж підсунути схожу картинку.
        if (chosen === "cutout") return { act: "cutout", why: "товар виріжеться при публікації" };

        if (!found) return { act: "keep", why: "не вдалось прочитати фото" };

        if (!found.colors.length || !found.uniform) {
            return { act: "keep", why: "фон неоднорідний" };
        }

        if (found.isWhite && chosen !== "white") {
            return { act: "keep", why: "фон уже білий" };
        }

        return { act: "white", why: null };

    }

    // ---------- браузерна частина ----------

    // Пікселі фото, зменшеного до max по довшій стороні.
    function pixels(url, max, done) {

        var img = new Image();

        img.crossOrigin = "anonymous";

        img.onerror = function () { done(null); };

        img.onload = function () {

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
                done(null);   // фото з іншого домену
                return;
            }

            done({ data: data.data, w: w, h: h, canvas: canvas });

        };

        img.src = url;

    }

    // Одна робота на ключ, скільки б хто її не просив.
    //
    // НАВІЩО. Те саме фото питають одночасно рядок кадрування, велике
    // фото в картці та мініатюра під ним — а на сторінці товару ще й
    // друга галерея. Без цього кроку кожен запускав би свою заливку
    // 640×800 на тому самому знімку.
    var jobs = {};

    function once(key, work, done) {

        var job = jobs[key];

        if (job && job.ready) { done(job.value); return; }

        if (job) { job.waiting.push(done); return; }

        job = jobs[key] = { ready: false, value: null, waiting: [done] };

        work(function (value) {

            job.ready = true;
            job.value = value;

            var waiting = job.waiting;

            job.waiting = [];

            waiting.forEach(function (fn) { fn(value); });

        });

    }

    function analyze(url, done) {

        once("розбір:" + url, function (finish) {

            pixels(url, PROBE_MAX, function (probe) {
                finish(probe ? describe(probe.data, probe.w, probe.h) : null);
            });

        }, done);

    }

    function whiten(url, done) {

        once("заливка:" + url, function (finish) {

            analyze(url, function (found) {

                if (!found) { finish(null); return; }

                pixels(url, PREVIEW_MAX, function (shot) {

                    if (!shot) { finish(null); return; }

                    var px = new Uint8ClampedArray(shot.data);

                    var painted = whitenPixels(px, shot.w, shot.h, found.colors);

                    // Той самий запобіжник, що в збірці: залилось майже
                    // все — значить, фон визначено неправильно, і збірка
                    // таке фото пропустить. Показувати біле полотно, яке
                    // ніколи не буде опубліковане, немає сенсу.
                    if (painted / (shot.w * shot.h) > MAX_SHARE) { finish(null); return; }

                    shot.canvas.getContext("2d")
                        .putImageData(new ImageData(px, shot.w, shot.h), 0, 0);

                    // WebP замість PNG: та сама картинка кодується в рази
                    // швидше, а фотографій тут до десятка за один вхід у
                    // товар. Не підтримується — браузер віддасть PNG сам.
                    finish(shot.canvas.toDataURL("image/webp", 0.92));

                });

            });

        }, done);

    }

    // Головна дверка для обох споживачів.
    //
    // Віддає ОБʼЄКТ, а не саму адресу: разом із картинкою потрібна
    // причина, чому її немає. Мовчазна відсутність результату — рівно
    // те, через що кнопка «Зробити білим» одного разу вже виглядала
    // зламаною.
    function resolve(url, frame, done) {

        if (!url) { done({ url: null, act: "keep", why: "фото не завантажилось" }); return; }

        var chosen = (frame && frame.bg) || null;

        // «Не чіпати» й «Вирізати» відповіді від канвасу не потребують —
        // не читаємо файл заради наперед відомого результату.
        if (chosen === "keep" || chosen === "cutout") {

            var quick = plan(frame, null);

            done({ url: null, act: quick.act, why: quick.why });

            return;

        }

        analyze(url, function (found) {

            var decision = plan(frame, found);

            if (decision.act !== "white") {
                done({ url: null, act: decision.act, why: decision.why });
                return;
            }

            whiten(url, function (painted) {

                done(painted
                    ? { url: painted, act: "white", why: null }
                    : { url: null, act: "keep", why: "залилось би майже все фото" });

            });

        });

    }

    root.WhitePreview = {

        TOLERANCE: TOLERANCE,
        MAX_VARIANCE: MAX_VARIANCE,
        ALREADY_WHITE: ALREADY_WHITE,
        MAX_SHARE: MAX_SHARE,
        PROBE_MAX: PROBE_MAX,
        PREVIEW_MAX: PREVIEW_MAX,

        borderColors: borderColors,
        matchesBackground: matchesBackground,
        whitenPixels: whitenPixels,
        describe: describe,
        plan: plan,

        analyze: analyze,
        whiten: whiten,
        resolve: resolve

    };

}(typeof window !== "undefined" ? window : globalThis));

if (typeof module !== "undefined" && module.exports) {
    module.exports = (typeof window !== "undefined" ? window : globalThis).WhitePreview;
}
