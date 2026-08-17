const fs = require("fs");
const { JSDOM } = require("jsdom");

const ROOT = require("path").join(__dirname, "..");
const SRC = ROOT + "/admin/github-publish.js";
// домен — з site.config.json, щоб тест не ламався при переїзді
const { SITE_URL } = require("../scripts/site-env");

let failures = 0;
function check(name, cond, extra) {
    if (cond) console.log("  ✓", name);
    else { console.log("  ✗", name, extra !== undefined ? "→ " + extra : ""); failures++; }
}

function makeEnv({ token = "tok123", refConflicts = 0 } = {}) {
    const dom = new JSDOM("<!doctype html><body></body>", {
        url: `${SITE_URL}/admin/import.html`,
        runScripts: "outside-only"
    });
    const { window } = dom;

    // jsdom не додає TextEncoder/TextDecoder у window, хоча у всіх
    // браузерах вони є нативно — github-publish.js використовує
    // TextEncoder для перетворення тексту у base64. Без цієї
    // заглушки падав би тест, а не продукт.
    window.TextEncoder = TextEncoder;
    window.TextDecoder = TextDecoder;

    if (token) {
        window.localStorage.setItem("decap-cms-user", JSON.stringify({ backendName: "github", token }));
    }

    const calls = [];
    let conflictsLeft = refConflicts;
    let headSha = "head-1";

    window.fetch = (url, opts = {}) => {
        calls.push({ url: String(url), method: opts.method || "GET", headers: opts.headers || {} });
        const u = String(url);
        const json = body => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

        if (u.includes("config.yml")) {
            return Promise.resolve({
                ok: true, status: 200,
                text: () => Promise.resolve(
                    "backend:\n  name: github\n  repo: bestbrnd4u/bestbrnd4u.github.io\n" +
                    "  branch: main\n  base_url: https://api.netlify.com\n  auth_endpoint: auth\n")
            });
        }
        if (u.includes("/git/ref/heads/")) return json({ object: { sha: headSha } });
        if (u.includes("/git/commits/")) return json({ tree: { sha: "tree-of-" + headSha } });
        if (u.includes("/git/blobs")) return json({ sha: "blob-" + calls.filter(c => c.url.includes("blobs")).length });
        if (u.includes("/git/trees")) return json({ sha: "newtree" });
        if (u.endsWith("/git/commits")) return json({ sha: "commit-abc" });
        if (u.includes("/git/refs/heads/")) {
            if (conflictsLeft > 0) {
                conflictsLeft--;
                headSha = "head-moved";
                return Promise.resolve({
                    ok: false, status: 422,
                    json: () => Promise.resolve({ message: "Update is not a fast forward" })
                });
            }
            return json({ ok: true });
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ message: "nope" }) });
    };

    window.eval(fs.readFileSync(SRC, "utf8"));
    return { window, calls };
}

(async () => {

console.log("\n[1] Один коміт на весь імпорт");
{
    const { window, calls } = makeEnv();
    const files = [
        { path: "data/products/a.json", text: '{"title":"Сумка"}' },
        { path: "data/products/b.json", text: '{"title":"Рюкзак"}' },
        { path: "assets/images/products/uploads/x.webp", file: { arrayBuffer: async () => new Uint8Array([1,2,3]).buffer } }
    ];
    const res = await window.GitHubPublisher.publishFiles(files, "Імпорт", () => {});

    check("3 блоби завантажено", calls.filter(c => c.url.includes("/git/blobs")).length === 3);
    check("дерево створено один раз", calls.filter(c => c.url.includes("/git/trees")).length === 1);
    check("коміт створено один раз", calls.filter(c => c.url.endsWith("/git/commits")).length === 1);
    check("гілку зрушено один раз", calls.filter(c => c.url.includes("/git/refs/heads/")).length === 1);
    check("повернуто посилання на коміт", /commit-abc/.test(res.commitUrl), res.commitUrl);
    check("токен підставлено в заголовок", (calls.find(c => c.url.includes("/git/blobs")).headers.Authorization) === "token tok123");
    check("repo прочитано з config.yml", calls.some(c => c.url.includes("bestbrnd4u/bestbrnd4u.github.io")));
}

console.log("\n[2] UTF-8 у JSON не ламається (кирилиця)");
{
    const { window } = makeEnv();
    let sent = null;
    const origFetch = window.fetch;
    window.fetch = (url, opts) => {
        if (String(url).includes("/git/blobs")) sent = JSON.parse(opts.body);
        return origFetch(url, opts);
    };
    await window.GitHubPublisher.publishFiles(
        [{ path: "data/products/a.json", text: '{"title":"Сумка Фурла"}' }], "msg", () => {});

    check("encoding = base64", sent.encoding === "base64");
    const back = Buffer.from(sent.content, "base64").toString("utf8");
    check("кирилиця відновлюється без спотворень", back === '{"title":"Сумка Фурла"}', back);
}

console.log("\n[3] Гонка з GitHub Actions — повтор");
{
    const { window, calls } = makeEnv({ refConflicts: 1 });
    const res = await window.GitHubPublisher.publishFiles(
        [{ path: "a.json", text: "{}" }], "msg", () => {});

    check("публікація все одно вдалася", !!res.sha);
    check("гілку пробували зрушити двічі", calls.filter(c => c.url.includes("/git/refs/heads/")).length === 2);
    check("дерево перезібрано поверх нової верхівки",
          calls.filter(c => c.url.includes("/git/trees")).length === 2);
    check("блоби НЕ перезавантажувались", calls.filter(c => c.url.includes("/git/blobs")).length === 1);
}

console.log("\n[4] Нескінченна гонка не зациклюється");
{
    const { window, calls } = makeEnv({ refConflicts: 99 });
    let err = null;
    try { await window.GitHubPublisher.publishFiles([{ path: "a.json", text: "{}" }], "m", () => {}); }
    catch (e) { err = e; }
    check("зупиняється з помилкою", !!err);
    check("рівно 3 спроби", calls.filter(c => c.url.includes("/git/refs/heads/")).length === 3,
          calls.filter(c => c.url.includes("/git/refs/heads/")).length);
}

console.log("\n[5] Вікно входу відкривається синхронно");
{
    const { window } = makeEnv({ token: null });
    let openedUrl = "nope";
    window.open = url => { openedUrl = url; return { closed: false, location: { replace(){} }, close(){}, postMessage(){} }; };

    const popup = window.GitHubPublisher.preopenAuthWindow();
    check("порожнє вікно відкрито одразу", openedUrl === "about:blank", openedUrl);
    check("повернуто дескриптор вікна", !!popup);
}

console.log("\n[6] Залогінений користувач не бачить вікна входу");
{
    const { window } = makeEnv({ token: "tok123" });
    let opened = false;
    window.open = () => { opened = true; return {}; };
    window.GitHubPublisher.preopenAuthWindow();
    check("вікно не відкривається, якщо токен уже є", opened === false);
    check("hasStoredToken = true", window.GitHubPublisher.hasStoredToken() === true);
}

console.log("\n[7] Протухла сесія → зрозуміла помилка");
{
    const { window } = makeEnv();
    window.fetch = (url) => String(url).includes("config.yml")
        ? Promise.resolve({ ok: true, text: () => Promise.resolve("repo: a/b\nbranch: main\n") })
        : Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ message: "Bad credentials" }) });

    let err = null;
    try { await window.GitHubPublisher.publishFiles([{ path: "a.json", text: "{}" }], "m", () => {}); }
    catch (e) { err = e; }
    check("повідомлення українською про повторний вхід", /увійдіть ще раз/i.test(err.message), err && err.message);
}

console.log(failures === 0 ? "\n✅ Усі перевірки пройдено" : `\n❌ Провалено: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

})();
