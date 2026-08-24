// Посилання на товар для постів у Telegram.
//
// НАВІЩО ПОЛЕ
// ------------
// Щоб написати пост про товар, потрібне посилання на нього. Адреса
// збирається зі slug-а, а slug генерує збірка — в адмінці його ніде не
// видно. Доводилось шукати товар на сайті й копіювати з адресного
// рядка.
//
// ГОЛОВНЕ, ЩО СТЕРЕЖУТЬ ЦІ ПЕРЕВІРКИ
// -----------------------------------
// Посилання мусить вести на БОЙОВИЙ домен навіть тоді, коли товар
// редагують у дев-адмінці. Інакше в пост потрапить адреса
// dev.bestbrnd4u.com — сайту з тестовими даними, закритого від
// індексації, — і помітили б це вже по скаргах покупців.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const widget = read("admin/order-link-widget.js");

console.log("\n[1] Поле підключене до товару");
{
    const { loadYaml } = require("./helpers/yaml");
    const products = loadYaml("admin/config.yml").collections
        .find(c => c.name === "products");

    const field = (products.fields || []).find(f => f.name === "orderLink");

    check("поле є", !!field);
    check("це наш віджет", field && field.widget === "orderLink");
    check("поле необовʼязкове", field && field.required === false);

    // Шукатимуть його найперше — тримаємо вгорі, а не в кінці довгої
    // форми (де свого часу загубилось кадрування фото).
    check("стоїть на початку форми",
        products.fields.findIndex(f => f.name === "orderLink") < 3,
        products.fields.findIndex(f => f.name === "orderLink") + 1);

    check("віджет підключений в адмінці",
        /order-link-widget\.js/.test(read("admin/index.html")));
}

console.log("\n[2] Бойова адреса доступна адмінці");
{
    // Без цього віджет узяв би поточний хост — і на деві видавав би
    // посилання на дев.
    check("apply-site-env віддає productionUrl",
        /productionUrl: ALL\.production\.url/.test(read("scripts/apply-site-env.js")));

    const admin = read("admin/index.html");
    const env = JSON.parse(admin.match(/window\.SITE_ENVIRONMENT = (\{[^}]*\})/)[1]);

    check("у розмітці адмінки вона є", !!env.productionUrl, JSON.stringify(env));
    check("це саме бойова адреса",
        env.productionUrl === JSON.parse(read("site.config.json")).production.url,
        env.productionUrl);

    check("віджет бере саме її", /env\.productionUrl \|\|/.test(widget));
}

console.log("\n[3] Що показує віджет — на живих даних");
{
    const registered = {};

    const sandbox = {
        CMS: { registerWidget: (name, control) => { registered[name] = control; } }
    };

    sandbox.window = sandbox;
    sandbox.navigator = {};
    sandbox.document = {
        createElement: () => ({ style: {}, select() {} }),
        body: { appendChild() {}, removeChild() {} },
        execCommand() {}
    };

    // навмисно ДЕВ-середовище: перевіряємо, що посилання все одно бойове
    sandbox.SITE_ENVIRONMENT = {
        name: "development",
        host: "dev.bestbrnd4u.com",
        productionUrl: "https://bestbrnd4u.com"
    };

    // логін бота віддаємо як із data/telegram.json
    sandbox.fetch = () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ botUsername: "BestBrnd4uBot" })
    });

    sandbox.h = (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat() });
    sandbox.createClass = spec => {
        function C(props) {
            this.props = props;
            this.state = spec.getInitialState ? spec.getInitialState.call(this) : {};
        }
        Object.assign(C.prototype, spec);
        C.prototype.setState = function (s) { Object.assign(this.state, s); };
        return C;
    };

    require("vm").createContext(sandbox);
    require("vm").runInContext(widget, sandbox);

    check("віджет зареєстровано", !!registered.orderLink);

    const Control = registered.orderLink;
    const wrap = obj => ({ get: key => obj[key] });

    const product = JSON.parse(read("data/products.json"))
        .find(p => p.slug && p.title);

    const instance = new Control({
        entry: { get: () => wrap({ id: product.id, slug: product.slug, title: product.title }) }
    });

    if (instance.componentDidMount) instance.componentDidMount();

    const rows = [];

    (function walk(node) {
        if (!node || typeof node !== "object") return;
        if (node.props && node.props.value) rows.push(node.props);
        (node.kids || []).forEach(walk);
    }(instance.render()));

    const [productRow, telegramRow] = rows;

    // ГОЛОВНЕ: бойовий домен, попри дев-середовище
    check("посилання на товар — бойове",
        productRow.value.startsWith("https://bestbrnd4u.com/p/"),
        productRow.value);
    check("дев-адреса не просочилась",
        !rows.some(r => r.value.includes("dev.bestbrnd4u.com")));

    check("адреса веде на сторінку товару",
        productRow.value.includes(encodeURIComponent(product.slug)));

    // Друге посилання відкриває чат із набраним текстом: без назви й
    // адреси незрозуміло, про який саме товар мова.
    check("друге посилання відкриває Telegram",
        telegramRow.value.startsWith("https://t.me/bestbrnd4u?text="));

    const text = decodeURIComponent(telegramRow.value.split("?text=")[1]);

    check("у повідомленні є назва товару", text.includes(product.title), text.slice(0, 60));
    check("і посилання на нього", text.includes(productRow.value));

    // Slug генерує збірка — у щойно створеного товару його ще немає, і
    // вигадувати адресу наперед не можна: збірка може дати іншу.
    const fresh = new Control({ entry: { get: () => wrap({ title: "Новий товар" }) } });

    check("без slug адресу не вигадуємо",
        /зʼявиться після/.test(JSON.stringify(fresh.render())));

    // Поле нічого не зберігає — валідність від нього залежати не має.
    check("поле завжди валідне", instance.isValid() === true);
    check("нічого не пише в товар", !/onChange/.test(widget));
}

console.log("\n[4] Копіювання працює в обох випадках");
{
    // Сучасний спосіб доступний лише в захищеному контексті. Без
    // запасного шляху кнопка мовчки нічого не робила б.
    check("основний спосіб", /navigator\.clipboard/.test(widget));
    check("перевірка контексту", /window\.isSecureContext/.test(widget));
    check("запасний спосіб", /fallbackCopy/.test(widget));
    check("запасний спрацьовує і при відмові основного",
        /writeText\(value\)\.then\(done, function \(\)/.test(widget));

    // Підпис має повертатись, інакше кнопка назавжди лишиться
    // «Скопійовано» і збиватиме з пантелику.
    check("підпис кнопки повертається", /copied: false \}\);\s*\n\s*\}, 1800\)/.test(widget));
}

console.log("\n[5] Посилання в бота — для рілсів");
{
    // Логін бота в коді НЕ зберігається: він живе в налаштуваннях
    // Supabase-функції. Вгадувати не можна — логін бота не збігається
    // з назвою, яку видно в шапці чату, і помилка означала б мертве
    // посилання в рілсі. Тому це налаштування в адмінці.
    const { loadYaml } = require("./helpers/yaml");

    const entry = loadYaml("admin/config.yml").collections
        .find(c => c.name === "pages").files.find(f => f.name === "telegram");

    check("є розділ «Telegram-бот»", !!entry);
    check("пише в data/telegram.json", entry && entry.file === "data/telegram.json");
    check("файл існує", fs.existsSync(path.join(ROOT, "data/telegram.json")));

    const field = ((entry || {}).fields || []).find(f => f.name === "botUsername");

    check("є поле логіна", !!field);
    check("поле необовʼязкове", field && field.required === false);

    // Найчастіша помилка — вписати назву з шапки чату замість логіна.
    check("підказка пояснює, де взяти логін",
        /BotFather/.test(String(field && field.hint)));
    check("підказка попереджає, що це не назва",
        /НЕ назва/.test(String(field && field.hint)));

    // @ на початку — теж часта помилка, тож приймаємо й прибираємо
    check("@ відрізається", /replace\(\/\^@\/, ""\)/.test(widget));

    check("віджет читає налаштування", /\/data\/telegram\.json/.test(widget));
    check("без логіна показано, що робити",
        /«Сторінки» → «Telegram-бот»/.test(widget));
}

function checkBotLink() {

console.log("\n[6] Формат посилання бот справді розбирає");
    // Головна перевірка: не «схоже на правду», а те, що бот на іншому
    // кінці зрозуміє саме цей рядок. Беремо його ж розбирач.
    const parserSrc = read("supabase/functions/telegram-order-bot/format.js")
        .match(/export function parseStartPayload[\s\S]*?\n\}/)[0]
        .replace("export ", "");

    const parseStartPayload = new Function(parserSrc + "; return parseStartPayload;")();

    const registered = {};

    const sandbox = {
        CMS: { registerWidget: (name, control) => { registered[name] = control; } }
    };

    sandbox.window = sandbox;
    sandbox.navigator = {};
    sandbox.document = {
        createElement: () => ({ style: {}, select() {} }),
        body: { appendChild() {}, removeChild() {} },
        execCommand() {}
    };
    sandbox.SITE_ENVIRONMENT = { productionUrl: "https://bestbrnd4u.com" };
    sandbox.fetch = () => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ botUsername: "BestBrnd4uBot" })
    });
    sandbox.h = (type, props, ...kids) => ({ type, props: props || {}, kids: kids.flat() });
    sandbox.createClass = spec => {
        function C(props) {
            this.props = props;
            this.state = spec.getInitialState ? spec.getInitialState.call(this) : {};
        }
        Object.assign(C.prototype, spec);
        C.prototype.setState = function (s) { Object.assign(this.state, s); };
        return C;
    };

    require("vm").createContext(sandbox);
    require("vm").runInContext(widget, sandbox);

    const product = JSON.parse(read("data/products.json")).find(p => p.id && p.slug);

    const instance = new registered.orderLink({
        entry: { get: () => ({ get: key => ({ id: product.id, slug: product.slug, title: product.title })[key] }) }
    });

    instance.componentDidMount();

    return new Promise(resolve => setTimeout(() => {

        const found = [];

        (function walk(node) {
            if (!node || typeof node !== "object") return;
            if (node.props && node.props.value) found.push(node.props);
            (node.kids || []).forEach(walk);
        }(instance.render()));

        const deep = found.find(r => /боті/.test(r.label));

        check("посилання в бота показано", !!deep, found.map(r => r.label).join(", "));

        if (deep) {

            check("веде на бота, а не на особистий акаунт",
                deep.value.startsWith("https://t.me/BestBrnd4uBot?start="), deep.value);

            // Telegram передасть боту саме таке повідомлення
            const payload = deep.value.split("?start=")[1];
            const parsed = parseStartPayload("/start " + payload);

            check("бот розпізнає товар", parsed && parsed.type === "product",
                JSON.stringify(parsed));
            check("і саме той, що треба", parsed && parsed.id === product.id,
                `${parsed && parsed.id} замість ${product.id}`);

            // Telegram іноді додає до команди імʼя бота
            const withName = parseStartPayload("/start@BestBrnd4uBot " + payload);

            check("працює і з іменем бота в команді",
                withName && withName.id === product.id);

        }

        resolve();

    }, 30));

}

checkBotLink().then(() => {

    console.log(failures === 0
        ? "\n✅ Усі перевірки пройдено"
        : `\n❌ Провалено: ${failures}`);

    process.exit(failures === 0 ? 0 : 1);

});
