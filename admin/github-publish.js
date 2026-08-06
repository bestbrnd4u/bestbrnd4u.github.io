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

    // Той самий OAuth-потік, що використовує Decap CMS: відкриваємо
    // вікно Netlify → воно веде на GitHub → після дозволу вікно
    // повертає токен через postMessage.
    function loginWithGitHub(config) {

        return new Promise((resolve, reject) => {

            const url = `${config.baseUrl}/${config.authEndpoint}` +
                `?provider=github&site_id=${encodeURIComponent(config.siteId)}&scope=repo`;

            const width = 960;
            const height = 720;
            const left = window.screenX + (window.outerWidth - width) / 2;
            const top = window.screenY + (window.outerHeight - height) / 2;

            const popup = window.open(
                url,
                "github-oauth",
                `width=${width},height=${height},left=${left},top=${top}`
            );

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

        const ref = await api(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
        const headSha = ref.object.sha;

        const headCommit = await api(`/repos/${owner}/${repo}/git/commits/${headSha}`);
        const baseTreeSha = headCommit.tree.sha;

        // 1. заливаємо вміст кожного файлу як blob
        const treeItems = [];

        for (let i = 0; i < files.length; i++) {

            const item = files[i];

            report(`Завантажую файли: ${i + 1} з ${files.length}…`);

            const content = item.file
                ? await fileToBase64(item.file)
                : textToBase64(item.text);

            const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
                method: "POST",
                body: JSON.stringify({ content, encoding: "base64" })
            });

            treeItems.push({
                path: item.path,
                mode: "100644",
                type: "blob",
                sha: blob.sha
            });

        }

        // 2. дерево поверх поточного стану гілки —
        // усе, чого немає в списку, лишається як було
        report("Формую коміт…");

        const tree = await api(`/repos/${owner}/${repo}/git/trees`, {
            method: "POST",
            body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems })
        });

        // 3. коміт
        const commit = await api(`/repos/${owner}/${repo}/git/commits`, {
            method: "POST",
            body: JSON.stringify({
                message,
                tree: tree.sha,
                parents: [headSha]
            })
        });

        // 4. пересуваємо гілку на новий коміт
        report("Публікую…");

        await api(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
            method: "PATCH",
            body: JSON.stringify({ sha: commit.sha, force: false })
        });

        return {
            sha: commit.sha,
            commitUrl: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
            actionsUrl: `https://github.com/${owner}/${repo}/actions`
        };

    }

    return {
        loadConfig,
        getToken,
        hasStoredToken: () => Boolean(cachedToken || readStoredToken()),
        publishFiles
    };

})();
