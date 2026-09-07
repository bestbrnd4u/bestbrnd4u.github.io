// Повідомлення власнику: товар закінчився.
//
// НАВІЩО
// -------
// Залишки списуються самі (apply-stock.yml), і коли замовлення забирає
// останню одиницю, товар на сайті стає «під замовлення». Це правильна
// поведінка — але власник про неї не дізнавався ніяк, тільки якщо сам
// відкрив адмінку.
//
// А дізнатись треба: закінчилось — значить або замовляти ще, або
// прибирати з продажу, або хоч знати, що цей товар більше не
// продається як «в наявності».
//
// ЯК ЦЕ ДОХОДИТЬ
// ---------------
// Через журнал подій (site_issues, міграція 013) різновидом
// stock_out. Звідти його раз на добу забирає scripts/report-issues.js
// і надсилає власнику листом.
//
// ЧОМУ НЕ ОКРЕМИЙ КАНАЛ. Бо цей уже є, працює й нічого не вимагає: ні
// нового секрету, ні нового розкладу, ні свого файлу зі станом.
// Викликати report_issue може навіть публічний ключ (журнал наповнює
// сам браузер), тож цьому кроку секрети не потрібні зовсім.
//
// ЧОМУ В ТЕКСТІ НОМЕР ЗАМОВЛЕННЯ
// -------------------------------
// Журнал склеює однакові події за відбитком «різновид|сторінка|текст»
// і про повтор більше не пише — лише збільшує лічильник. Для помилки в
// браузері це правильно, для залишків хибно: товар може закінчитись,
// доїхати й закінчитись знову, і це дві різні події.
//
// Номер замовлення робить кожен текст унікальним — і кожне
// «закінчився» доходить окремо. Заодно він відповідає на перше
// питання власника: після якої саме покупки це сталось.
//
// ЗАПУСК
//   node scripts/report-stock.js --in=<файл>     список із apply-order-stock
//   node scripts/report-stock.js --in=<файл> --dry-run

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const DRY = process.argv.includes("--dry-run");

function arg(name) {

    const hit = process.argv.find(value => value.startsWith(`--${name}=`));

    return hit ? hit.slice(name.length + 3) : "";

}

// Адреса й публічний ключ лежать у коді сайту — вони й так відкриті.
function client() {

    const source = fs.readFileSync(path.join(ROOT, "assets", "js", "supabase-client.js"), "utf8");

    const url = source.match(/const SUPABASE_URL = "([^"]+)"/);
    const key = source.match(/const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/);

    return url && key ? { url: url[1], key: key[1] } : null;

}

// Текст події. Одне повідомлення на одну клітинку залишку.
//
// Розмір не вказуємо, коли він ONESIZE: це внутрішня заглушка для
// товарів без розмірів, і покупець її ніде не бачить (див.
// order-lookup.js). У листі власнику вона теж читалась би як помилка.
function message(cell) {

    const where = [cell.color, cell.size && cell.size !== "ONESIZE" ? cell.size : ""]
        .filter(Boolean)
        .join(" / ");

    return [
        `${cell.title || cell.slug}`,
        where ? ` (${where})` : "",
        " — закінчився",
        cell.order ? `, замовлення ${cell.order}` : "",
    ].join("");

}

async function report(cells) {

    const conn = client();

    if (!conn) {

        console.log("Не знайшов ключів Supabase — про залишки не повідомляю");

        return 0;

    }

    let sent = 0;

    for (const cell of cells) {

        const text = message(cell);

        if (DRY) {

            console.log("  →", text);

            sent++;

            continue;

        }

        try {

            const response = await fetch(`${conn.url}/rest/v1/rpc/report_issue`, {
                method: "POST",
                headers: {
                    apikey: conn.key,
                    Authorization: `Bearer ${conn.key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    p_kind: "stock_out",
                    // «Сторінка» тут — адреса товару: у листі з неї
                    // одразу видно, про що йдеться, і можна відкрити.
                    p_page: cell.slug ? `/p/${cell.slug}/` : "",
                    p_message: text,
                }),
            });

            if (!response.ok) {

                console.log(`  ⚠ не записалось (HTTP ${response.status}): ${text}`);

                continue;

            }

            await response.text();

            console.log("  ✓", text);

            sent++;

        } catch (error) {

            console.log(`  ⚠ не записалось (${error.message}): ${text}`);

        }

    }

    return sent;

}

// Читає список клітинок, які щойно вийшли в нуль. Його кладе
// apply-order-stock.js під час списання.
function readCells(file) {

    if (!file || !fs.existsSync(file)) return [];

    try {

        const data = JSON.parse(fs.readFileSync(file, "utf8"));

        return Array.isArray(data) ? data : [];

    } catch (error) {

        console.log("Не зміг прочитати список:", error.message);

        return [];

    }

}

async function main() {

    const cells = readCells(arg("in"));

    if (!cells.length) {

        console.log("Нічого не закінчилось");

        return;

    }

    console.log(`Закінчилось позицій: ${cells.length}`);

    const sent = await report(cells);

    // ВАЖЛИВО: виходимо НУЛЕМ навіть коли є про що сказати.
    //
    // Лист власнику надсилає щоденне зведення (report-issues.js), а не
    // цей крок. Якби він падав, червоним став би workflow списання
    // залишків — і власник щоразу думав би, що залишки не списались.
    console.log(sent
        ? `Записано в журнал: ${sent}. Лист надійде зі щоденним зведенням.`
        : "У журнал нічого не записалось");

}

if (require.main === module) {

    main().catch(error => {

        // Списання залишків важливіше за сповіщення про них.
        console.log("Повідомлення про залишки не відпрацювало:", error.message);

    });

}

module.exports = { message, readCells };
