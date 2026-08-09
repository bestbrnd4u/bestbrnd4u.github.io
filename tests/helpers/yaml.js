// Читання YAML-конфігів (admin/config.yml, .github/dependabot.yml)
// для тестів.
//
// Раніше тести робили це через `python3 -c "import yaml..."`. У моїй
// пісочниці python з PyYAML був завжди, але для CI це крихко:
// покладатись на те, що на runner'і стоїть саме потрібний модуль
// python, — зайва зовнішня умова. js-yaml іде явною devDependency,
// тож поведінка однакова і локально, і в GitHub Actions.
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const ROOT = path.join(__dirname, "..", "..");

function loadYaml(relPath) {
    return yaml.load(fs.readFileSync(path.join(ROOT, relPath), "utf8"));
}

module.exports = { ROOT, loadYaml };
