// Перегляд фото на весь екран: назва вікна й «Фото N з M» для читалки.
//
// ЩО БУЛО
// --------
//   - Вікно мало role="dialog" і aria-modal, але без назви: DialogFocus
//     бере її з заголовка .modal-header, а в лайтбоксі такого немає.
//     Читалка казала просто «діалог».
//   - Лічильник «01/04» не озвучувався: стрілками гортали мовчки. А
//     якби до нього дійшли — почули б «нуль один, скісна, нуль чотири».
//
// Тут — справжній lightbox.js у JSDOM.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const src = fs.readFileSync(path.join(ROOT, "assets/js/lightbox.js"), "utf8");

function open(list, start, meta) {

    const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true });
    const { window } = dom;

    window.DialogFocus = { open() {}, close() {} };
    // У JSDOM немає matchMedia; лайтбокс питає лише «чи миша».
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    window.HTMLMediaElement.prototype.pause = function () {};
    window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };

    window.eval(src);
    window.openLightbox(list, start, meta);

    const root = window.document.getElementById("productLightbox");
    const live = () => (window.document.getElementById("lightboxLive") || {}).textContent;

    return { window, root, live };

}

const PHOTOS = ["a.webp", "b.webp", "c.webp", "d.webp"];

console.log("\n[1] Вікно має назву");
{
    const { root } = open(PHOTOS, 0, { brand: "Armani Exchange", title: "Чоловіча сумка Armani Exchange" });
    check("лайтбокс відкрито", root && !root.hidden);
    check("назва — з назви товару", root.getAttribute("aria-label") === "Фото: Чоловіча сумка Armani Exchange", root.getAttribute("aria-label"));

    const bare = open(PHOTOS, 0, {}).root;
    check("без назви товару — «Фото товару», а не порожньо", bare.getAttribute("aria-label") === "Фото товару", bare.getAttribute("aria-label"));
}

console.log("\n[2] Яке фото зараз — словами");
{
    const { root, live, window } = open(PHOTOS, 0, { title: "Сумка" });

    const region = window.document.getElementById("lightboxLive");
    check("жива область є", Boolean(region));
    check("вона всередині вікна (aria-modal ховає решту)", region && root.contains(region));
    check("aria-live=polite", region && region.getAttribute("aria-live") === "polite");
    check("сховано від очей класом sr-announce", region && region.classList.contains("sr-announce"));

    check("відкрили — «Фото 1 з 4»", live() === "Фото 1 з 4", live());

    root.querySelector(".lightbox-next").click();
    check("далі — «Фото 2 з 4»", live() === "Фото 2 з 4", live());

    root.querySelector(".lightbox-next-mobile").click();
    check("кнопка на телефоні теж — «Фото 3 з 4»", live() === "Фото 3 з 4", live());

    root.querySelector(".lightbox-prev").click();
    check("назад — «Фото 2 з 4»", live() === "Фото 2 з 4", live());

    const started = open(PHOTOS, 2, { title: "Сумка" });
    check("відкрили з третього — «Фото 3 з 4»", started.live() === "Фото 3 з 4", started.live());
}

console.log("\n[3] Відео називається відео");
{
    const { root, live } = open([{ type: "image", src: "a.webp" }, { type: "video", src: "v.mp4" }], 0, { title: "Сумка" });
    root.querySelector(".lightbox-next").click();
    check("«Відео 2 з 2»", live() === "Відео 2 з 2", live());
}

console.log("\n[4] Видимий лічильник — для ока, не для читалки");
{
    const { root } = open(PHOTOS, 0, { title: "Сумка" });
    const counter = root.querySelector(".lightbox-counter");
    check("лічильник на місці", Boolean(counter));
    check("і показує «01/04»", counter && counter.textContent.replace(/\s+/g, "") === "01/04", counter && counter.textContent);
    check("читалці сховано (aria-hidden)", counter && counter.getAttribute("aria-hidden") === "true");
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
