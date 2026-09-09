// CSP у документації не має відставати від сайту.
//
// ЩО ЦЕ ЗАКРИВАЄ
// ---------------
// Політику з docs/МОНІТОРИНГ.md власник вставляє руками в Transform
// Rule Cloudflare. Тобто вона живе поза кодом — і мовчки застаріває
// щоразу, коли сайт починає ходити на нове джерело.
//
// Наслідок буває тихий і неприємний: у режимі звітів (Report-Only)
// нічого не ламається, зате в консолі щодня сиплються попередження,
// на які перестають дивитись. А коли політику ввімкнуть по-справжньому
// — зникне рівно те, що додали останнім і забули дописати.
//
// Так уже мало не сталося з фото у відгуках: вони їдуть із
// *.supabase.co, а в `img-src` цього джерела не було.
//
// ЩО ТУТ ПЕРЕВІРЯЄТЬСЯ
// ---------------------
// Кожен зовнішній хост, на який сайт справді ходить, названий у
// політиці. Перевірка йде від КОДУ до документа, а не навпаки: зайвий
// рядок у політиці нікому не шкодить, а відсутній — шкодить.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const doc = read("docs/МОНІТОРИНГ.md");

console.log("\n[1] Політика знайдена в документації");

const policy = (doc.match(/^default-src 'self';.*$/m) || [])[0] || "";

check("рядок політики є", Boolean(policy));

check("він у режимі звітів, а не блокування",
    /Content-Security-Policy-Report-Only/.test(doc));

// Розбір політики на директиви.
const directives = new Map();

policy.split(";").forEach(part => {

    const words = part.trim().split(/\s+/).filter(Boolean);

    if (!words.length) return;

    directives.set(words[0], words.slice(1));

});

// Чи покриває директива цей хост. Зірочка в '*.supabase.co' покриває
// 'abc.supabase.co', але не 'supabase.co.evil.com'.
function allows(directive, host) {

    const list = directives.get(directive) || directives.get("default-src") || [];

    return list.some(source => {

        const clean = source.replace(/^https:\/\//, "");

        if (clean === host) return true;

        if (!clean.startsWith("*.")) return false;

        return host.endsWith(clean.slice(1));

    });

}

console.log("\n[2] Джерела картинок");
{
    // Фото у відгуках лежать у сховищі Supabase — саме те, чого в
    // політиці бракувало.
    check("сховище відгуків дозволене в img-src",
        allows("img-src", "abcdefgh.supabase.co"),
        (directives.get("img-src") || []).join(" "));

    // Прев'ю прикріплених фото — canvas.toDataURL(), тобто data:.
    check("data: дозволено — на ньому тримаються прев'ю у формі",
        (directives.get("img-src") || []).includes("data:"));

    // Обкладинки відео товарів.
    check("обкладинки YouTube дозволені",
        allows("img-src", "img.youtube.com") && allows("img-src", "i.ytimg.com"));
}

console.log("\n[3] Джерела, які сайт справді підключає");
{
    // Беремо хости з РОЗМІТКИ, а не зі списку в голові: сторінки —
    // це те, що виконає браузер.
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

    const scriptHosts = new Set();
    const styleHosts = new Set();
    const frameHosts = new Set();

    pages.forEach(page => {

        const html = read(page);

        [...html.matchAll(/<script[^>]+src="https:\/\/([^/"]+)/g)]
            .forEach(m => scriptHosts.add(m[1]));

        // Саме стилі й preconnect. <link rel="canonical"> теж має
        // href із https, але це не завантаження, а вказівка для
        // пошуку — під CSP вона не потрапляє взагалі.
        [...html.matchAll(/<link[^>]*rel="(stylesheet|preconnect)"[^>]*href="https:\/\/([^/"]+)/g)]
            .forEach(m => styleHosts.add(m[2]));

        [...html.matchAll(/<link[^>]*href="https:\/\/([^/"]+)"[^>]*rel="(stylesheet|preconnect)"/g)]
            .forEach(m => styleHosts.add(m[1]));

        [...html.matchAll(/<iframe[^>]+src="https:\/\/([^/"]+)/g)]
            .forEach(m => frameHosts.add(m[1]));

    });

    const missingScripts = [...scriptHosts].filter(host => !allows("script-src", host));

    check(`усі ${scriptHosts.size} хостів скриптів дозволені`,
        missingScripts.length === 0, missingScripts.join(", "));

    // fonts.gstatic.com приходить не з розмітки, а з самого css2 —
    // тому перевіряємо його окремо, за директивою шрифтів.
    const missingStyles = [...styleHosts]
        .filter(host => !allows("style-src", host) && !allows("font-src", host));

    check(`усі ${styleHosts.size} хостів стилів і шрифтів дозволені`,
        missingStyles.length === 0, missingStyles.join(", "));

    check("файли шрифту дозволені окремо",
        allows("font-src", "fonts.gstatic.com"));

    const missingFrames = [...frameHosts].filter(host => !allows("frame-src", host));

    check("вбудовані кадри дозволені",
        missingFrames.length === 0, missingFrames.join(", "));
}

console.log("\n[4] Куди сайт стукає з коду");
{
    // fetch і XHR з наших скриптів. Шукаємо адреси в коді — те, що
    // збереться в рантаймі з частин, тут не видно, і саме тому
    // головні джерела перевіряємо ще й поіменно нижче.
    const js = fs.readdirSync(path.join(ROOT, "assets/js"))
        .filter(f => f.endsWith(".js"))
        .map(f => read(`assets/js/${f}`))
        .join("\n");

    const hosts = new Set(
        [...js.matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)].map(m => m[1].toLowerCase()));

    // Хости, на які сайт не ходить, а лише посилається текстом
    // (розмітка schema.org, посилання на novaposhta, соцмережі).
    const NOT_REQUESTS = [
        "schema.org", "www.schema.org",
        "novaposhta.ua", "www.novaposhta.ua",
        "www.instagram.com", "instagram.com", "t.me",
        "www.google.com", "developers.google.com",
        "bestbrnd4u.com", "dev.bestbrnd4u.com", "www.bestbrnd4u.com",
        "github.com", "www.w3.org", "creativecommons.org",
        "fonts.googleapis.com", "fonts.gstatic.com",
        "img.youtube.com", "i.ytimg.com",
        "youtube.com", "www.youtube.com", "youtu.be", "vimeo.com",
        "player.vimeo.com", "www.youtube-nocookie.com",
    ];

    const requested = [...hosts].filter(host => !NOT_REQUESTS.includes(host));

    const missing = requested.filter(host =>
        !allows("connect-src", host) && !allows("script-src", host)
        && !allows("frame-src", host) && !allows("img-src", host)
        && !allows("form-action", host));

    check(`усі ${requested.length} хостів із коду названі в політиці`,
        missing.length === 0, missing.join(", "));

    // Головне джерело — окремо й поіменно: адреса Supabase
    // складається в рантаймі з site.config.json, тож регулярка вище її
    // не побачить.
    check("Supabase дозволений для запитів",
        allows("connect-src", "abcdefgh.supabase.co"));
}

console.log("\n[5] Межі, які не можна послабити непомітно");
{
    // Ці три рядки й роблять політику вартою застосування. Без них
    // вона дозволяє рівно те, від чого мала б захищати.
    check("сторонні плагіни заборонені",
        (directives.get("object-src") || []).includes("'none'"),
        (directives.get("object-src") || []).join(" "));

    check("підміна base-uri заборонена",
        (directives.get("base-uri") || []).includes("'self'"));

    check("форми надсилаються лише куди треба",
        (directives.get("form-action") || []).includes("'self'"));

    // 'unsafe-eval' відкрив би виконання рядків як коду — тобто
    // головне, від чого CSP і захищає.
    check("виконання рядків як коду не дозволене",
        !/unsafe-eval/.test(policy));

    // Адмінка вантажить свій код і ходить у GitHub — під цю політику
    // вона не потрапляє, і про це в документі сказано.
    check("адмінка виключена з правила",
        /not starts_with\(http\.request\.uri\.path, "\/admin"\)/.test(doc));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
