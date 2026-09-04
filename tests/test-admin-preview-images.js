// Картинки в прев'ю адмінки.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// У прев'ю картки товару фото малювалось не завжди: замість знімка
// лишалося порожнє місце. Лікувалось руками — перемкнути вкладку
// «Сторінка товару» і назад, після чого фото зʼявлялось.
//
// ПРИЧИНА. getAsset() у Decap віддає не «адресу або нічого». Поки файл
// не прочитаний, повертається ЗАГЛУШКА: проксі з path «empty.svg» і
// адресою blob на порожній <svg></svg>. Тобто адреса справжня, картинка
// валідна, тільки порожня:
//
//     if (isLoading) return emptyAsset;
//     return asset || (dispatch(loadAsset(key)), emptyAsset);
//
// Компонент бачив НЕПОРОЖНІЙ рядок, вважав справу зробленою й більше
// нічого не питав. Порожнє місце при цьому не супроводжувалось навіть
// підписом «завантажується» — формально ж адреса була.
//
// Перемикання вкладки допомагало тому, що воно РОЗМОНТОВУЄ компонент:
// новий екземпляр питав адресу заново, і на той момент файл був уже
// прочитаний.
//
// ГОЛОВНІ ВИМОГИ, ЯКІ СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// --------------------------------------------
// 1. Заглушка НЕ вважається фото.
// 2. Поки заглушка — компонент питає далі, а не здається.
// 3. Коли Decap перемалював прев'ю з готовим файлом, фото зʼявляється
//    ОДРАЗУ, без очікування таймера.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const src = fs.readFileSync(path.join(ROOT, "admin/preview-templates.js"), "utf8");

// Беремо САМ компонент із коду, а не його копію.
const body = src.match(/var AssetImage = createClass\(\{[\s\S]*?\n    \}\);/);

if (!body) {
    console.log("  ✗ не вдалося витягти AssetImage з admin/preview-templates.js");
    process.exit(1);
}

// Таймери підміняємо, щоб керувати часом, а не чекати його.
const timers = [];
const fakeSetTimeout = (fn, ms) => { timers.push({ fn: fn, ms: ms }); return timers.length; };
const fakeClearTimeout = id => { if (timers[id - 1]) timers[id - 1].cancelled = true; };
const runTimers = () => {
    const ready = timers.filter(t => !t.cancelled && !t.done);
    ready.forEach(t => { t.done = true; t.fn(); });
    return ready.length;
};

const spec = new Function(
    "createClass", "h", "window", "setTimeout", "clearTimeout",
    body[0] + "; return AssetImage;"
)(o => o, () => null, {}, fakeSetTimeout, fakeClearTimeout);

// Мінімальний каркас замість React: setState зливає стан і кличе
// componentDidUpdate — саме так поводиться справжній компонент, і саме
// цей шлях лікує помилку.
function mount(props) {
    const inst = Object.create(spec);
    inst.props = props;
    inst.state = spec.getInitialState.call(inst);
    inst.updates = 0;
    inst.setState = function (patch) {
        const prev = this.state;
        this.state = Object.assign({}, prev, patch);
        this.updates++;
        if (this.componentDidUpdate) this.componentDidUpdate(this.props, prev);
    };
    inst.componentDidMount();
    return inst;
}

// Заглушка Decap: адреса справжня, картинка порожня.
const ЗАГЛУШКА = { path: "empty.svg", toString: () => "blob:http://localhost/empty-svg" };
const ФОТО = { path: "assets/images/products/uploads/bag.webp", toString: () => "blob:http://localhost/real-photo" };

console.log("\n[1] Заглушка не вважається фото");
{
    const inst = mount({ path: "bag.webp", getAsset: () => ЗАГЛУШКА });

    check("проксі з path «empty.svg» — не фото", inst.assetReady(ЗАГЛУШКА) === false);
    check("порожній рядок — не фото", inst.assetReady({ toString: () => "" }) === false);
    check("нічого — не фото", inst.assetReady(null) === false);
    check("справжнє фото — фото", inst.assetReady(ФОТО) === true);

    // Саме це й було видно власнику: порожнє місце без підпису.
    check("адреса заглушки НЕ потрапляє в state", inst.state.url === "", inst.state.url);
}

console.log("\n[2] Поки заглушка — компонент не здається");
{
    let calls = 0;
    const inst = mount({ path: "bag.webp", getAsset: () => { calls++; return ЗАГЛУШКА; } });

    check("перша спроба зроблена", calls === 1, calls);
    check("заплановано повтор", timers.some(t => !t.cancelled && !t.done));

    // Прокручуємо час: спроби мусять іти далі.
    runTimers();
    check("після паузи спитано знову", calls === 2, calls);

    // Підпис «завантажується» — а не порожнє місце.
    check("стан лишається «немає адреси»", inst.state.url === "" && inst.state.failed === false);
}

console.log("\n[3] Файл прочитався — фото зʼявляється");
{
    let ready = false;
    const inst = mount({ path: "bag.webp", getAsset: () => ready ? ФОТО : ЗАГЛУШКА });

    check("спершу порожньо", inst.state.url === "");

    ready = true;
    runTimers();

    check("після повтору адреса справжня",
        inst.state.url === "blob:http://localhost/real-photo", inst.state.url);
    check("помилки немає", inst.state.failed === false);
}

console.log("\n[4] Перемальовка прев'ю підхоплює фото ОДРАЗУ");
{
    // Головний шлях лікування. Decap перемальовує прев'ю, коли
    // завантажив файл, — компонент мусить скористатись цим, а не чекати
    // свого таймера.
    let ready = false;
    const inst = mount({ path: "bag.webp", getAsset: () => ready ? ФОТО : ЗАГЛУШКА });

    check("поки не готово — порожньо", inst.state.url === "");

    ready = true;

    // Саме те, що робить Decap: перемальовка з тим самим path.
    // Таймер при цьому ще не спрацював.
    inst.retryTimer = null;
    inst.componentDidUpdate(inst.props, inst.state);

    check("фото зʼявилось без очікування таймера",
        inst.state.url === "blob:http://localhost/real-photo", inst.state.url);
}

console.log("\n[5] Заміна фото починає все з чистого аркуша");
{
    let current = ФОТО;
    const inst = mount({ path: "bag.webp", getAsset: () => current });

    check("перше фото показано", inst.state.url === "blob:http://localhost/real-photo");

    // Власник замінив знімок — нове ще читається.
    current = ЗАГЛУШКА;
    const prevProps = { path: "bag.webp", getAsset: inst.props.getAsset };
    inst.props = { path: "other.webp", getAsset: inst.props.getAsset };
    inst.componentDidUpdate(prevProps, inst.state);

    check("показ старого фото припинено", inst.state.url === "", inst.state.url);
    check("лічильник спроб скинуто", inst.attempt === 1, inst.attempt);

    current = ФОТО;
    runTimers();
    check("нове фото зʼявилось", inst.state.url === "blob:http://localhost/real-photo");
}

console.log("\n[6] Нескінченно не крутиться");
{
    let calls = 0;
    const inst = mount({ path: "bag.webp", getAsset: () => { calls++; return ЗАГЛУШКА; } });

    // Прокручуємо всі заплановані повтори.
    for (let i = 0; i < 40; i++) if (!runTimers()) break;

    check("спроби скінчились", calls > 3 && calls < 20, calls);
    check("зрештою чесно сказано, що не вдалося", inst.state.failed === true);

    // Це важливо: якби компонент крутився вічно, кожне фото тримало б
    // таймер, а в картці їх до восьми.
    check("нових повторів більше не планується",
        !timers.some(t => !t.cancelled && !t.done));
}

console.log("\n[7] Причина зафіксована в коді");
{
    // Щоб наступний, хто відкриє файл, не «спростив» перевірку заглушки.
    check("заглушка пізнається за path «empty.svg»", /empty\.svg/.test(src));
    check("описано, чому перемикання вкладки допомагало",
        /РОЗМОНТОВУЄ/.test(src) && /Сторінка товару/.test(src));
    check("таймер прибирається при знятті компонента",
        /componentWillUnmount[\s\S]{0,120}clearRetry/.test(src));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");
process.exit(failures ? 1 : 0);
