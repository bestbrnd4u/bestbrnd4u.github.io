// Переклад у браузері: те, що JS домальовує на сторінках /en/ і /ru/.
//
// Статичний текст цих сторінок уже перекладено на збірці
// (scripts/build-locales.js). А кошик, картки, підказки, повідомлення
// малює JS — українськими рядками з коду. Переписати кожен рядок у
// двадцяти файлах на виклик перекладу означало б сотні правок і стільки
// ж місць, де його забудуть наступного разу. Тому тут стежимо за самою
// сторінкою: щойно JS вставив чи змінив текст — перекладаємо його тим
// самим ядром і словником, що й збірка (assets/js/i18n-core.js).
//
// Так само з посиланнями: JS будує «/p/…», «catalog?…» — тут вони
// отримують мовний префікс, щоб людина не випадала на українську.
// Переходи через location.href у коді обгорнуто в I18N.href().
//
// Українська версія: перекладати нічого, I18N.href повертає як є.
(function () {

    "use strict";

    var Core = window.I18nCore;

    if (!Core) return;

    var lang = Core.langFromPath(location.pathname);

    var api = {
        lang: lang,
        href: function (href) { return Core.localizeHref(href, lang); },
        t: function (text) { return text; }
    };

    window.I18N = api;

    // Випадний список мов (<details>): відкривається сам, а закривається
    // ще й кліком поза ним та Escape — як решта меню сайту.
    document.addEventListener("click", function (event) {
        document.querySelectorAll(".lang-switch-menu[open]").forEach(function (menu) {
            if (!menu.contains(event.target)) menu.removeAttribute("open");
        });
    });

    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;
        document.querySelectorAll(".lang-switch-menu[open]").forEach(function (menu) {
            menu.removeAttribute("open");
            var summary = menu.querySelector("summary");
            if (summary && menu.contains(document.activeElement)) summary.focus();
        });
    });

    if (lang === Core.DEFAULT_LANG) return;

    var translate = null;
    var queue = [];

    var ATTRS = ["placeholder", "title", "aria-label", "alt"];

    function skipped(el) {
        return !el || el.closest("script, style, noscript, [translate='no'], [data-no-i18n], .lang-switch");
    }

    function translateText(node) {
        if (!node.parentElement || skipped(node.parentElement)) return;
        var before = node.nodeValue;
        if (!/[а-яіїєґ]/i.test(before)) return;
        // «131» + «товар» окремими вузлами — форму слова вирішує число.
        var number = /^\s*\S+\s*$/.test(before) ? Core.numberBefore(node) : null;
        var counted = number ? translate.counted(number, before) : null;
        var after = counted ? before.match(/^\s*/)[0] + counted + before.match(/\s*$/)[0] : translate(before);
        if (after !== before) node.nodeValue = after;
    }

    // product.js після завантаження переписує опис і заголовок для
    // соцмереж українською — збірка їх уже переклала, а скрипт затирав.
    var META = /^(description|og:title|og:description|twitter:title|twitter:description)$/;

    // canonical, og:url і розмітку schema.org скрипти теж ставлять уже в
    // браузері — від адреси без мови й українськими рядками. canonical
    // на українську сторінку оголошував англійську її копією.
    function fixCanonical(link) {
        var href = link.getAttribute("href");
        var next = Core.localizeAbsolute(href, lang, location.origin);
        if (next !== href) link.setAttribute("href", next);
    }

    // Що ми самі записали в кожен блок — щоб не перекладати власну заміну.
    var ldDone = typeof WeakMap === "function" ? new WeakMap() : null;

    function translateLd(script) {
        var text = script.textContent;
        if (!text || (ldDone && ldDone.get(script) === text)) return;
        try {
            var data = JSON.parse(text);
            var local = Core.localizeJsonLd(data, translate, lang, location.origin);
            if (JSON.stringify(local) !== JSON.stringify(data)) script.textContent = JSON.stringify(local);
            if (ldDone) ldDone.set(script, script.textContent);
        } catch (error) { /* зіпсований JSON — лишаємо як є */ }
    }

    function special(el) {
        if (el.tagName === "LINK" && el.getAttribute("rel") === "canonical") { fixCanonical(el); return true; }
        if (el.tagName === "SCRIPT" && el.type === "application/ld+json") { translateLd(el); return true; }
        return false;
    }

    function translateMeta(el) {
        var key = el.getAttribute("name") || el.getAttribute("property") || "";
        if (key === "og:url") {
            var url = el.getAttribute("content");
            var local = Core.localizeAbsolute(url, lang, location.origin);
            if (local !== url) el.setAttribute("content", local);
            return;
        }
        if (!META.test(key)) return;
        var v = el.getAttribute("content");
        if (v && /[а-яіїєґ]/i.test(v)) {
            var after = translate(v);
            if (after !== v) el.setAttribute("content", after);
        }
    }

    function translateAttrs(el) {
        if (el.tagName === "META") { translateMeta(el); return; }
        if (skipped(el)) return;
        for (var i = 0; i < ATTRS.length; i++) {
            var v = el.getAttribute(ATTRS[i]);
            if (v && /[а-яіїєґ]/i.test(v)) {
                var after = translate(v);
                if (after !== v) el.setAttribute(ATTRS[i], after);
            }
        }
    }

    function fixLink(a) {
        if (a.closest(".lang-switch")) return;
        var href = a.getAttribute("href");
        var next = Core.localizeHref(href, lang);
        if (next !== href) a.setAttribute("href", next);
    }

    function walk(root) {
        if (root.nodeType === 3) { translateText(root); return; }
        if (root.nodeType !== 1) return;
        if (special(root)) return;
        if (root.tagName === "A" && root.hasAttribute("href")) fixLink(root);
        translateAttrs(root);
        if (skipped(root)) return;
        var tw = document.createTreeWalker(root, 1 | 4);
        for (var n = tw.nextNode(); n; n = tw.nextNode()) {
            if (n.nodeType === 3) translateText(n);
            else {
                if (n.tagName === "A" && n.hasAttribute("href")) fixLink(n);
                translateAttrs(n);
            }
        }
        // Обхід вище в <script> не заходить (skipped) — розмітку окремо.
        var lds = root.querySelectorAll ? root.querySelectorAll('script[type="application/ld+json"], link[rel="canonical"]') : [];
        for (var k = 0; k < lds.length; k++) special(lds[k]);
    }

    function handle(records) {
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (r.type === "childList") {
                // setJsonLd міняє textContent наявного <script>: це запис
                // про сам скрипт, а не про доданий елемент.
                if (r.target.nodeType === 1 && special(r.target)) continue;
                for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
            } else if (r.type === "characterData") {
                if (r.target.parentElement && special(r.target.parentElement)) continue;
                translateText(r.target);
            } else if (r.type === "attributes") {
                if (special(r.target)) continue;
                if (r.attributeName === "href" && r.target.tagName === "A") fixLink(r.target);
                else translateAttrs(r.target);
            }
        }
    }

    // Спостерігаємо одразу — до того, як інші скрипти почнуть малювати.
    // Поки словник не приїхав, записи складаємо в чергу.
    var observer = new MutationObserver(function (records) {
        if (!translate) { queue.push.apply(queue, records); return; }
        observer.disconnect();
        handle(records);
        observe();
    });

    function observe() {
        observer.observe(document.documentElement, {
            subtree: true, childList: true, characterData: true,
            attributes: true, attributeFilter: ATTRS.concat(["href", "content"])
        });
    }

    observe();

    var versions = window.ASSET_VERSIONS || {};
    var file = "data/i18n-" + lang + ".json";
    var url = "/" + file + (versions[file] ? "?v=" + versions[file] : "");

    fetch(url).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }).then(function (dict) {
        translate = Core.createTranslator(dict, lang);
        api.t = translate;
        observer.disconnect();
        // Усе, що встигли намалювати до словника, — одним проходом.
        walk(document.documentElement);
        queue = [];
        observe();
    });

}());
