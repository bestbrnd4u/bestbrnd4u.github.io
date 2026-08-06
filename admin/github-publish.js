// -------------------------
// Пряма публікація файлів у GitHub-репозиторій прямо з адмінки,
// без GitHub Desktop і ручного пушу.
//
// Використовує рівно той самий вхід, що й Decap CMS: OAuth через
// безкоштовний проксі Netlify (api.netlify.com/auth) → токен GitHub
// з правами repo. Якщо користувач уже залогінений в адмінці
// (admin/index.html), токен просто береться з localStorage — тобто
// вдруге логінитись не треба. Якщо ні — відкривається те саме
// вікно входу через GitHub, що і в адмінці.
//
// Комітимо через Git Data API (blobs → tree → commit → update ref):
// усі файли (JSON товарів + фото) потрапляють у ОДИН коміт, тож
// GitHub Actions запускається один раз і збирає каталог одразу для
// всього імпорту.
// -------------------------

window.GitHubPublisher = (function () {

    const API = "https://api.github.com";

    // -------------------------
    // Конфіг репозиторію — читаємо з того самого admin/config.yml,
    // щоб не дублювати назву репо/гілку у двох місцях
    // -------------------------

    let configPromise = null;

    function loadConfig() {

        if (configPromise) return configPromise;

        configPromise = fetch("config.yml")
            .then(response => response.ok ? response.text() : "")
            .then(text => {

                function pick(key, fallback) {

                    const match = new RegExp("^\\s*" + key + ":\\s*(.+)\\s*$", "m").exec(text);

                    return match ? match[1].trim().replace(/^["']|["']$/g, "") : fallback;

                }

                return {
                    repo: pick("repo", "bestbrnd4u/bestbrnd4u.github.io"),
                    branch: pick("branch", "main"),
                    baseUrl: pick("base_url", "https://api.netlify.com"),
                    authEndpoint: pick("auth_endpoint", "auth"),
                    siteId: pick("site_domain", location.hostname)
                };

            })
            .catch(() => ({
                repo: "bestbrnd4u/bestbrnd4u.github.io",
                branch: "main",
                baseUrl: "https://api.netlify.com",
                authEndpoint: "auth",
                siteId: location.hostname
            }));

        return configPromise;

    }

    // -------------------------
    // Токен
    // -------------------------

    // Decap CMS 3.x зберігає користувача під ключем decap-cms-user,
    // старіші версії (і форки) — під netlify-cms-user. Перевіряємо
    // обидва, щоб працювало незалежно від версії CMS.
    const USER_KEYS = ["decap-cms-user", "netlify-cms-user"];

    function readStoredToken() {

        for (const key of USER_KEYS) {

            try {

                const raw = localStorage.getItem(key);

                if (!raw) continue;

                const data = JSON.parse(raw);

                if (data && data.token) return data.token;

            } catch (error) {

                // зіпсований запис у localStorage — просто ігноруємо

            }

        }

        return null;

    }

    function storeToken(token) {

        try {

            localStorage.setItem("decap-cms-user", JSON.stringify({ backendName: "github", token }));

        } catch (error) {

            // приватний режим браузера тощо — не критично,
            // токен усе одно живе в пам'яті поточної сторінки

        }

    }

    // Вікно OAuth МАЄ відкриватись синхронно, прямо в обробнику
    // кліку. Якщо перед window.open стоїть будь-який await (навіть
    // швидкий fetch конфігу), Safari і Firefox вважають, що "жест
    // користувача" вже витрачено, і блокують спливаюче вікно.
    //
    // Тому кнопка публікації спершу викликає preopenAuthWindow() —
    // вона синхронно відкриває порожнє вікно, а реальний URL
    // підставляється пізніше, коли конфіг вже завантажився.
    let pendingPopup = null;

    function preopenAuthWindow() {

        if (readStoredToken() || cachedToken) return null;

        const width = 960;
        const height = 720;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        pendingPopup = window.open(
            "about:blank",
            "github-oauth",
            `width=${width},height=${height},left=${left},top=${top}`
        );

        return pendingPopup;

    }

    function loginWithGitHub(config) {

        return new Promise((resolve, reject) => {

            const url = `${config.baseUrl}/${config.authEndpoint}` +
                `?provider=github&site_id=${encodeURIComponent(config.siteId)}&scope=repo`;

            let popup = pendingPopup;

            pendingPopup = null;

            if (popup && !popup.closed) {

                // вікно вже відкрите синхронно — просто ведемо його
                // за потрібною адресою
                popup.location.replace(url);

            } else {

                const width = 960;
                const height = 720;
                const left = window.screenX + (window.outerWidth - width) / 2;
                const top = window.screenY + (window.outerHeight - height) / 2;

                popup = window.open(
                    url,
                    "github-oauth",
                    `width=${width},height=${height},left=${left},top=${top}`
                );

            }

            if (!popup) {

                reject(new Error("Браузер заблокував вікно входу — дозвольте спливаючі вікна для цього сайту і спробуйте ще раз."));

                return;

            }

            let settled = false;

            function cleanup() {

                settled = true;

                window.removeEventListener("message", onMessage);
                clearInterval(closedTimer);

            }

            function onMessage(event) {

                if (typeof event.data !== "string") return;

                // рукостискання: вікно повідомляє, що готове —
                // відповідаємо йому тим самим повідомленням
                if (event.data.startsWith("authorizing:github")) {

                    popup.postMessage(event.data, event.origin);

                    return;

                }

                const match = /^authorization:github:(success|error):(.+)$/.exec(event.data);

                if (!match) return;

                cleanup();

                try {
                    popup.close();
                } catch (error) {
                    // вікно могли закрити вручну
                }

                if (match[1] !== "success") {

                    reject(new Error("GitHub не підтвердив вхід. Спробуйте ще раз."));

                    return;

                }

                try {

                    const payload = JSON.parse(match[2]);

                    if (!payload.token) throw new Error("no token");

                    storeToken(payload.token);

                    resolve(payload.token);

                } catch (error) {

                    reject(new Error("Не вдалося прочитати відповідь GitHub."));

                }

            }

            window.addEventListener("message", onMessage);

            const closedTimer = setInterval(() => {

                if (settled) return;

                if (popup.closed) {

                    cleanup();

                    reject(new Error("Вікно входу закрито до завершення авторизації."));

                }

            }, 700);

        });

    }

    let cachedToken = null;

    // конфіг тягнемо одразу при завантаженні сторінки, щоб на момент
    // кліку по "Опублікувати" він уже був у пам'яті і не з'їдав
    // "жест користувача" зайвим await перед відкриттям вікна входу
    loadConfig();

    async function getToken({ interactive = true } = {}) {

        if (cachedToken) return cachedToken;

        const stored = readStoredToken();

        if (stored) {

            cachedToken = stored;

            return cachedToken;

        }

        if (!interactive) return null;

        const config = await loadConfig();

        cachedToken = await loginWithGitHub(config);

        return cachedToken;

    }

    function forgetToken() {

        cachedToken = null;

    }

    // -------------------------
    // Дрібні helper'и
    // -------------------------

    async function api(path, options = {}) {

        const token = await getToken();

        const response = await fetch(API + path, {
            ...options,
            headers: {
                "Authorization": `token ${token}`,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });

        if (response.status === 401) {

            forgetToken();

            throw new Error("Сесія GitHub застаріла — увійдіть ще раз.");

        }

        if (!response.ok) {

            let detail = "";

            try {

                const body = await response.json();

                detail = body && body.message ? ` — ${body.message}` : "";

            } catch (error) {

                // тіло не JSON — обійдемось без деталей

            }

            throw new Error(`GitHub API ${response.status}${detail}`);

        }

        return response.json();

    }

    // ArrayBuffer → base64 порціями (btoa на великому рядку
    // падає в деяких браузерах на кількох мегабайтах)
    function bytesToBase64(bytes) {

        const CHUNK = 0x8000;

        let binary = "";

        for (let i = 0; i < bytes.length; i += CHUNK) {

            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));

        }

        return btoa(binary);

    }

    function textToBase64(text) {

        return bytesToBase64(new TextEncoder().encode(text));

    }

    async function fileToBase64(file) {

        const buffer = await file.arrayBuffer();

        return bytesToBase64(new Uint8Array(buffer));

    }

    // -------------------------
    // Головна функція: один коміт з усіма файлами
    //
    // files: [{ path, text }] або [{ path, file }]
    // onProgress: (текст статусу) => void
    // -------------------------

    async function publishFiles(files, message, onProgress) {

        const report = onProgress || function () {};

        const config = await loadConfig();

        const [owner, repo] = config.repo.split("/");
        const branch = config.branch;

        await getToken();

        report("Перевіряю доступ до репозиторію…");

        // 1. Заливаємо вміст кожного файлу як blob.
        //    По 4 паралельно — інакше імпорт на 30 фото перетворюється
        //    на 30 послідовних запитів і тягнеться хвилинами.
        const treeItems = new Array(files.length);

        let done = 0;
        let cursor = 0;

        async function worker() {

            while (cursor < files.length) {

                const index = cursor++;
                const item = files[index];

                const content = item.file
                    ? await fileToBase64(item.file)
                    : textToBase64(item.text);

                const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
                    method: "POST",
                    body: JSON.stringify({ content, encoding: "base64" })
                });

                treeItems[index] = {
                    path: item.path,
                    mode: "100644",
                    type: "blob",
                    sha: blob.sha
                };

                done++;

                report(`Завантажую файли: ${done} з ${files.length}…`);

            }

        }

        await Promise.all(
            Array.from({ length: Math.min(4, files.length) }, worker)
        );

        // 2. Дерево → коміт → пересування гілки.
        //
        //    Гілку в цей момент може зрушити GitHub Actions (workflow
        //    сам комітить перезібраний каталог назад у main). Тоді
        //    PATCH ref впаде з 422 "not a fast forward". Це не помилка
        //    користувача — просто гонка, тож перезбираємо дерево вже
        //    поверх нової верхівки і пробуємо ще раз. SHA блобів при
        //    цьому лишаються дійсними, заново нічого не вантажимо.
        const ATTEMPTS = 3;

        for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {

            const ref = await api(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
            const headSha = ref.object.sha;

            const headCommit = await api(`/repos/${owner}/${repo}/git/commits/${headSha}`);

            report(attempt === 1 ? "Формую коміт…" : "Гілку оновили паралельно — пробую ще раз…");

            const tree = await api(`/repos/${owner}/${repo}/git/trees`, {
                method: "POST",
                body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: treeItems })
            });

            const commit = await api(`/repos/${owner}/${repo}/git/commits`, {
                method: "POST",
                body: JSON.stringify({
                    message,
                    tree: tree.sha,
                    parents: [headSha]
                })
            });

            report("Публікую…");

            try {

                await api(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
                    method: "PATCH",
                    body: JSON.stringify({ sha: commit.sha, force: false })
                });

            } catch (error) {

                const isRace = /42[29]|not a fast forward/i.test(error.message || "");

                if (isRace && attempt < ATTEMPTS) continue;

                throw error;

            }

            return {
                sha: commit.sha,
                commitUrl: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
                actionsUrl: `https://github.com/${owner}/${repo}/actions`
            };

        }

        throw new Error("Гілку весь час оновлює хтось інший — спробуйте ще раз за хвилину.");

    }

    return {
        loadConfig,
        getToken,
        preopenAuthWindow,
        hasStoredToken: () => Boolean(cachedToken || readStoredToken()),
        publishFiles
    };

})();
