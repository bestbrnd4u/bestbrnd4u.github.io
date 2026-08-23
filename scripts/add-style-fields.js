// Вставляє однаковий набір «Оформлення тексту» в усі блоки, де є
// заголовок і кнопка: головний банер, промо-банер, добірки, акції,
// спливні банери.
//
// ЧОМУ СКРИПТОМ, А НЕ РУКАМИ
// ---------------------------
// Набір той самий у пʼяти місцях. Якби його копіювали руками, вони
// рано чи пізно розійшлися б: десь забули шрифт, десь інший список
// кольорів — і адміністратор бачив би різні можливості в схожих
// блоках. Скрипт гарантує байтову однаковість, а tests/test-text-styles.js
// стежить, щоб вона не зникла після ручної правки.
//
// ЧОМУ НЕ YAML-ЯКОРІ
// -------------------
// Якір довелося б оголосити ключем верхнього рівня, а Decap валідує
// конфіг за схемою й може відхилити невідомий ключ — тоді адмінка не
// відкриється взагалі. Перевірити це наживо нічим, тож обрано варіант
// без ризику.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONFIG = path.join(ROOT, "admin", "config.yml");

// Список шрифтів береться зі спільного модуля — щоб перелік в адмінці
// не розійшовся з тим, що сайт уміє показати.
const { FONTS } = require("../assets/js/text-styles.js");

function block(indent) {

    const pad = " ".repeat(indent);

    const fontOptions = FONTS
        .map(f => `${pad}      - { label: "${f.label}", value: "${f.key}" }`)
        .join("\n");

    return `${pad}# ── Оформлення тексту (однаковий набір у всіх блоках) ──
${pad}# Усе необовʼязкове. Нічого не заповнили — блок виглядає як
${pad}# зараз: правила в style.css мають значення за замовчуванням,
${pad}# і змінна просто не зʼявляється.
${pad}- label: "Оформлення тексту і кнопки"
${pad}  name: "style"
${pad}  widget: "object"
${pad}  collapsed: true
${pad}  required: false
${pad}  fields:
${pad}    - label: "Шрифт"
${pad}      name: "font"
${pad}      widget: "select"
${pad}      required: false
${pad}      options:
${fontOptions}
${pad}      hint: >
${pad}        Усі шрифти безкоштовні (ліцензія SIL Open Font License) — питань
${pad}        щодо ліцензії не виникне. Завантажується тільки той, який справді
${pad}        обрали. ПЕРЕВІРТЕ ОЧИМА українські літери «і», «ї», «є», «ґ»:
${pad}        якщо в шрифті їх немає, вони намалюються запасним Inter і
${pad}        виглядатимуть інакше за решту тексту.
${pad}    - label: "Колір тексту"
${pad}      name: "textColor"
${pad}      widget: "color"
${pad}      required: false
${pad}      allowInput: true
${pad}      hint: "Заголовок і опис блока. Порожньо — як зараз."
${pad}    - label: "Колір маленького підпису зверху"
${pad}      name: "accentColor"
${pad}      widget: "color"
${pad}      required: false
${pad}      allowInput: true
${pad}      hint: "Той дрібний рядок над заголовком (наприклад «ДОБІРКА»)."
${pad}    - label: "Колір кнопки"
${pad}      name: "buttonBg"
${pad}      widget: "color"
${pad}      required: false
${pad}      allowInput: true
${pad}    - label: "Колір тексту на кнопці"
${pad}      name: "buttonText"
${pad}      widget: "color"
${pad}      required: false
${pad}      allowInput: true
${pad}      hint: >
${pad}        Слідкуйте за контрастом: світлий текст на світлій кнопці
${pad}        читатися не буде.
${pad}    - label: "Розмір заголовка"
${pad}      name: "titleSize"
${pad}      widget: "select"
${pad}      required: false
${pad}      options:
${pad}        - { label: "Менший", value: "s" }
${pad}        - { label: "Звичайний", value: "m" }
${pad}        - { label: "Більший", value: "l" }
${pad}        - { label: "Найбільший", value: "xl" }
${pad}    - label: "Вирівнювання"
${pad}      name: "align"
${pad}      widget: "select"
${pad}      required: false
${pad}      options:
${pad}        - { label: "Ліворуч", value: "left" }
${pad}        - { label: "По центру", value: "center" }
${pad}        - { label: "Праворуч", value: "right" }
${pad}    - label: "ВЕЛИКИМИ ЛІТЕРАМИ"
${pad}      name: "uppercase"
${pad}      widget: "boolean"
${pad}      required: false
${pad}      default: false
${pad}    - label: "Розрядка між літерами"
${pad}      name: "letterSpacing"
${pad}      widget: "number"
${pad}      required: false
${pad}      value_type: "int"
${pad}      min: -5
${pad}      max: 30
${pad}      hint: >
${pad}        У сотих em. 0 — як зараз, 10–20 добре виглядає на коротких
${pad}        заголовках великими літерами. Завелика розрядка розриває слова
${pad}        на телефоні.
`;

}

// Куди вставляти: якір у файлі → відступ поля
const TARGETS = [
    { name: "головний банер", anchor: /\n(\s+)- label: "Маленький підпис зверху"\n\s+name: "label"/, nth: 1 },
    { name: "промо-банер", anchor: /\n(\s+)- label: "Маленький підпис зверху"\n\s+name: "label"/, nth: 2 }
];

function main() {

    let text = fs.readFileSync(CONFIG, "utf8");

    if (text.includes('name: "style"')) {
        console.log("Набір «Оформлення тексту» вже є — нічого не змінюю.");
        return;
    }

    // 1–2. Головна: hero і promo — вставляємо ПЕРЕД полем "Маленький
    //      підпис зверху", тобто першим у списку полів блока.
    const inner = [...text.matchAll(/\n( +)- label: "Маленький підпис зверху"\n +name: "label"/g)];

    for (let i = inner.length - 1; i >= 0; i--) {

        const m = inner[i];
        const indent = m[1].length;

        text = text.slice(0, m.index + 1) + block(indent) + text.slice(m.index + 1);

    }

    // 3–5. Колекції верхнього рівня: додаємо в кінець списку полів.
    [
        ["collections", /\n  - name: "collections"\n[\s\S]*?(?=\n  - name: ")/],
        ["promotions", /\n  - name: "promotions"\n[\s\S]*?(?=\n  - name: ")/],
        ["promoPopups", /\n  - name: "promoPopups"\n[\s\S]*?(?=\n  - name: ")/]
    ].forEach(([label, re]) => {

        const m = text.match(re);

        if (!m) throw new Error(`не знайдено колекцію ${label}`);

        const end = m.index + m[0].length;

        text = text.slice(0, end) + "\n" + block(6) + text.slice(end);

    });

    fs.writeFileSync(CONFIG, text, "utf8");

    console.log(`Додано набір «Оформлення тексту» в ${inner.length + 3} блоки`);

}

main();
