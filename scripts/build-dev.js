// Збірка тестового середовища — кросплатформено.
//
// Раніше в package.json стояло "SITE_ENV=development npm run build".
// Це синтаксис POSIX-оболонок: у Linux і macOS працює, а в Windows
// PowerShell (де й ведеться робота) падає з помилкою — PowerShell не
// вміє задавати змінну середовища префіксом команди.
//
// Тут змінна ставиться самим Node і передається дочірньому процесу,
// тож команда однакова скрізь.
const { spawnSync } = require("child_process");

const result = spawnSync("npm", ["run", "build"], {
    stdio: "inherit",
    shell: true,                      // потрібно, щоб npm знайшовся у Windows
    env: { ...process.env, SITE_ENV: "development" }
});

process.exit(result.status === null ? 1 : result.status);
