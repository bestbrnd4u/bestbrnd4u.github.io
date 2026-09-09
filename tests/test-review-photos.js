// Фото у відгуках.
//
// НАВІЩО
// -------
// Головне заперечення покупця на полиці 3 000-15 000 ₴ із логотипами
// брендів — «чи це не підробка». Знімок покупця відповідає на це
// переконливіше за будь-який текст магазину: він показує саме ту річ
// при звичайному світлі, а не в студії. Заодно закриває «а який він
// насправді на колір» і «а як він сидить».
//
// ГОЛОВНІ НЕБЕЗПЕКИ, ЯКІ ТУТ СТЕРЕЖУТЬСЯ
// ---------------------------------------
// 1. ВІДРО, ВІДКРИТЕ НА ЗАПИС. Ключ anon лежить у коді сторінки, тож
//    право писати у сховище з браузера = право писати в нього для
//    всіх. Файли кладе функція службовим ключем, після перевірки
//    покупки.
// 2. ЧУЖА АДРЕСА В МАСИВІ ФОТО. Сторінка товару вантажила б картинку
//    з невідомого сайту — і витік адрес відвідувачів, і готовий
//    спосіб підмінити зображення вже після модерації.
// 3. ВІДХИЛЕНЕ ФОТО, ЯКЕ ЛИШИЛОСЬ ДОСТУПНИМ. Відро публічне на
//    читання; без прибирання знімок жив би за прямим посиланням
//    вічно — саме той, заради якого відгук і відхилили.
// 4. МЕГАБАЙТИ З ТЕЛЕФОНА. Знімок важить 3-5 МБ; три таких на
//    мобільному інтернеті — це хвилина очікування й обрив.
// 5. МОВЧАЗНА ОБІЦЯНКА ПРИВАТНОСТІ. Форма писала «буде видно лише
//    ім'я, оцінку й текст». З фото це вже неправда.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");

let failures = 0;
const check = (n, c, e) => {
    if (c) console.log("  ✓", n);
    else { console.log("  ✗", n, e !== undefined ? "→ " + e : ""); failures++; }
};

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

const migration = read("supabase/migrations/024-review-photos.sql");
const bundle = read("supabase/functions/telegram-order-bot/index.ts");
const source = read("supabase/functions/telegram-order-bot/_index.src.ts");
const reviewsJs = read("assets/js/reviews.js");
const adminJs = read("admin/reviews.js");
const productHtml = read("product.html");
const css = read("assets/css/style.css").replace(/\r\n/g, "\n");

// Модуль перевірок — виконуємо САМ файл функції, а не його переказ.
const reviewsModule = (() => {

    const src = read("supabase/functions/telegram-order-bot/reviews.js")
        .replace(/^export /gm, "");

    return new Function(src
        + "; return { PHOTO_LIMITS, parseReviewPhoto, cleanReviewPhotos,"
        + " reviewPhotoName, reviewPhotoUrl, reviewPhotoPath, cleanReview, reviewCard };")();

})();

const tinyJpeg = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
    + "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUB";

const dataUrl = "data:image/jpeg;base64," + tinyJpeg;

console.log("\n[1] Файли кладе функція, а не браузер");
{
    // Політик запису для anon немає — без політики RLS не пускає
    // нікого, крім службового ключа.
    check("відро оголошене в міграції",
        /insert into storage\.buckets/.test(migration)
        && /'review-photos'/.test(migration));

    check("читати може будь-хто", /for select/.test(migration));

    check("політик запису для anon немає",
        !/for insert/i.test(migration) && !/for update/i.test(migration));

    // Дублювання навмисне: перевірка у функції захищає від помилки в
    // даних, перевірка у відрі — від помилки в самій функції.
    check("відро саме обмежує розмір", /file_size_limit/.test(migration));

    check("і типи файлів",
        /allowed_mime_types/.test(migration) && /image\/jpeg/.test(migration));

    // Ключ службовий — і він НЕ в коді сайту.
    check("сторінка не має ключа сховища",
        !/SERVICE_ROLE|service_role/.test(reviewsJs));

    check("функція вантажить файли службовим ключем",
        /storage\/v1\/object\/review-photos/.test(source)
        && /apikey: SERVICE_ROLE_KEY/.test(source));
}

console.log("\n[2] Що приймається як фото");
{
    const limits = reviewsModule.PHOTO_LIMITS;

    check("не більше трьох", limits.count === 3);

    check("тільки растрові типи, без svg",
        !limits.types.includes("image/svg+xml")
        && limits.types.includes("image/jpeg"),
        limits.types.join(", "));

    check("справжній data-URL приймається",
        Boolean(reviewsModule.parseReviewPhoto(dataUrl)));

    check("чужий тип відкидається",
        reviewsModule.parseReviewPhoto("data:image/svg+xml;base64," + tinyJpeg) === null);

    // Посилання замість файлу — спроба змусити сервер піти на чужу
    // адресу.
    check("посилання замість файлу відкидається",
        reviewsModule.parseReviewPhoto("https://example.com/a.jpg") === null);

    check("сміття замість base64 відкидається",
        reviewsModule.parseReviewPhoto("data:image/jpeg;base64,<script>") === null);

    // Розмір рахується з довжини base64, без декодування: декодувати
    // мегабайтний рядок лише щоб його відкинути — марна робота.
    const huge = "data:image/jpeg;base64," + "A".repeat(4_000_000);

    check("завеликий файл відкидається", reviewsModule.parseReviewPhoto(huge) === null);

    check("зайві знімки відрізаються",
        reviewsModule.cleanReviewPhotos([dataUrl, dataUrl, dataUrl, dataUrl, dataUrl]).length === 3);

    // Непридатний знімок не має валити весь відгук: текст цінніший.
    const mixed = reviewsModule.cleanReviewPhotos(["сміття", dataUrl]);

    check("непридатний знімок не валить відгук", mixed.length === 1);

    check("не масив — просто немає фото",
        reviewsModule.cleanReviewPhotos("фото").length === 0
        && reviewsModule.cleanReviewPhotos(undefined).length === 0);

    // Відгук без фото мусить проходити так само, як і раніше.
    const clean = reviewsModule.cleanReview({
        product_id: 1, order_number: "1234567890", phone: "+380671234567",
        rating: 5, author: "Іван", body: "Дуже гарна сумка, приїхала швидко",
    });

    check("відгук без фото приймається", clean.ok === true);
    check("і має порожній масив, а не undefined",
        Array.isArray(clean.review.photos) && clean.review.photos.length === 0);
}

console.log("\n[3] Імена файлів і адреси");
{
    // Ім'я випадкове: відро публічне на читання, і передбачуване ім'я
    // дало б змогу подивитись фото ще до модерації, підставивши
    // наступний номер.
    const name = reviewsModule.reviewPhotoName("image/jpeg", "abc123def456");

    check("розширення за типом", name.endsWith(".jpg"), name);

    check("webp лишається webp",
        reviewsModule.reviewPhotoName("image/webp", "x1").endsWith(".webp"));

    // Ім'я йде в шлях запиту — стороннім символам там не місце.
    check("небезпечні символи вирізаються",
        !/[^a-z0-9.]/i.test(reviewsModule.reviewPhotoName("image/jpeg", "../../etc/passwd")),
        reviewsModule.reviewPhotoName("image/jpeg", "../../etc/passwd"));

    check("ім'я не буває порожнім",
        reviewsModule.reviewPhotoName("image/jpeg", "").length > 4);

    const url = reviewsModule.reviewPhotoUrl("https://x.supabase.co/", "abc.jpg");

    check("адреса без подвійного слеша",
        url === "https://x.supabase.co/storage/v1/object/public/review-photos/abc.jpg", url);

    // Зворотний розбір потрібен для видалення. Чужий шлях не має
    // повертати нічого: команда на видалення не ходить за чужими
    // адресами.
    check("своя адреса розбирається", reviewsModule.reviewPhotoPath(url) === "abc.jpg");

    check("чужа адреса не розбирається",
        reviewsModule.reviewPhotoPath("https://evil.com/storage/v1/object/public/other/a.jpg") === null);

    check("вихід із теки не проходить",
        reviewsModule.reviewPhotoPath(
            "https://x.supabase.co/storage/v1/object/public/review-photos/../secret.jpg") === null);
}

console.log("\n[4] Чужа адреса не потрапить у відгук");
{
    // Друга межа, у самій базі: навіть якщо функція помилиться,
    // сторінка товару не піде за картинкою на невідомий сайт.
    check("база лишає лише свої адреси",
        /url like '%\/storage\/v1\/object\/public\/review-photos\/%'/.test(migration));

    check("і не більше трьох", /limit 3/.test(migration));

    // Виправлення відгуку ЗАМІНЮЄ фото. Інакше після третього разу
    // під відгуком висіла б галерея з дев'яти знімків.
    check("повторне надсилання замінює фото, а не додає",
        /photos     = excluded\.photos/.test(migration));
}

console.log("\n[5] Відхилений знімок прибирається");
{
    check("є прибирання", /async function deleteReviewPhotos/.test(source));

    check("кнопка в Telegram прибирає",
        /if \(action\.status === "rejected"\) \{\s*await deleteReviewPhotos/
            .test(source.replace(/\r\n/g, "\n")));

    check("панель в адмінці теж прибирає",
        /if \(params\.status === "rejected"\) \{[\s\S]{0,120}deleteReviewPhotos/
            .test(source.replace(/\r\n/g, "\n")));

    // Прибирати можна лише свої файли.
    check("видаляються лише розібрані свої шляхи",
        /\.map\(\(url\) => reviewPhotoPath\(url\)\)\s*\n\s*\.filter\(Boolean\)/
            .test(source.replace(/\r\n/g, "\n")));
}

console.log("\n[6] Власник бачить фото до рішення");
{
    // Модерувати знімок наосліп неможливо — а саме знімок і буває
    // причиною відхилити.
    check("фото їдуть у Telegram", /sendMediaGroup/.test(source));

    // Не каптіоном до фото: підпис у Telegram обмежений 1024
    // знаками, а відгук буває до 2000 — текст обрізало б рівно тоді,
    // коли він найдовший.
    check("текст лишається окремим повідомленням",
        !/sendPhoto[\s\S]{0,200}caption: reviewCard/.test(source));

    check("фото відповіддю на картку",
        /sendMediaGroup[\s\S]{0,200}reply_to_message_id/.test(source));

    // Якщо знімки не доїхали, власник має знати, що вони були.
    const card = reviewsModule.reviewCard(
        { productId: 1, orderNumber: "1", rating: 5, author: "І", body: "текст", photos: ["a", "b"] },
        "Сумка");

    check("у картці сказано, скільки фото", /фото: 2/.test(card), card);

    check("без фото рядка немає",
        !/фото:/.test(reviewsModule.reviewCard(
            { productId: 1, orderNumber: "1", rating: 5, author: "І", body: "текст" }, "Сумка")));

    // Панель в адмінці показує знімки в картці.
    check("панель просить колонку photos", /"photos"/.test(
        read("supabase/functions/telegram-order-bot/review-admin.js")));

    check("панель малює знімки", /function reviewPhotos/.test(adminJs));

    check("і відкриває їх на повний розмір",
        /class="shot" href="\$\{esc\(url\)\}" target="_blank"/.test(adminJs));
}

console.log("\n[7] Сторінка: стиснення, межі, показ");
{
    // Знімок з телефона важить 3-5 МБ. Надсилати як є означало б
    // хвилину очікування на мобільному інтернеті.
    check("фото стискаються в браузері", /function shrinkPhoto/.test(reviewsJs));

    check("сторона обмежена", /PHOTO_MAX_SIDE = 1400/.test(reviewsJs));

    check("формат на виході — JPEG",
        /toDataURL\("image\/jpeg", PHOTO_QUALITY\)/.test(reviewsJs));

    // Прозорий PNG після переведення в JPEG став би чорним.
    check("прозорість заливається білим",
        /context\.fillStyle = "#ffffff"/.test(reviewsJs));

    // Захист від 80-мегабайтного файлу: читати його в пам'ять лише
    // щоб відкинути — вірний спосіб покласти вкладку.
    check("завеликий файл не читається взагалі",
        /file\.size > PHOTO_MAX_INPUT/.test(reviewsJs));

    check("не більше трьох і на сторінці", /PHOTO_MAX_COUNT = 3/.test(reviewsJs));

    check("кнопка зникає на третьому",
        /photosAddBtn\.hidden = photos\.length >= PHOTO_MAX_COUNT/.test(reviewsJs));

    // Вибір того самого файлу вдруге не дасть події change, якщо не
    // скинути value.
    check("той самий файл можна вибрати вдруге",
        /photosInput\.value = "";/.test(reviewsJs));

    check("знімок можна прибрати до надсилання",
        /review-photo-remove/.test(reviewsJs));

    check("фото їдуть разом із відгуком",
        /photos: photos\.map\(function \(photo\) \{ return photo\.dataUrl; \}\)/.test(reviewsJs));

    // Мовчки з'їдений файл виглядає як помилка сторінки.
    check("відкинутий файл пояснюється", /не вдалося додати/.test(reviewsJs));

    check("галерея під відгуком малюється", /function photosHtml/.test(reviewsJs));

    // Галерея внизу сторінки: без lazy три знімки змагались би за
    // канал із фото товару.
    check("знімки вантажаться відкладено", /loading=\\"lazy\\"/.test(reviewsJs));

    check("є стилі галереї", /\.review-photos\{/.test(css) && /\.review-photo\{/.test(css));

    check("є стилі прикріплення", /\.review-photos-preview\{/.test(css));
}

console.log("\n[8] Обіцянка приватності не бреше");
{
    const dom = new JSDOM(productHtml);
    const doc = dom.window.document;

    const privacy = doc.querySelector(".review-privacy");

    check("пояснення перед формою є", Boolean(privacy));

    // Раніше тут стояло «буде видно лише ім'я, оцінку й текст». З фото
    // це вже неправда, а на знімку речі часто видно квартиру.
    check("фото названі серед публічного",
        privacy && /фото/i.test(privacy.textContent), privacy && privacy.textContent.trim());

    check("телефон і номер замовлення й далі названі приватними",
        privacy && /не показуються/.test(privacy.textContent));

    // І біля самого поля — ще раз, коротко: пояснення на початку
    // форми людина вже прогорнула.
    const hint = doc.querySelector(".review-photos-hint");

    check("біля поля сказано те саме",
        hint && /видн/i.test(hint.textContent), hint && hint.textContent.trim());

    check("поле не обов'язкове",
        Boolean(doc.getElementById("reviewPhotos"))
        && !doc.getElementById("reviewPhotos").required);

    // Типи в accept — ті самі, що приймає сервер.
    const accept = doc.getElementById("reviewPhotos").getAttribute("accept");

    check("accept збігається з тим, що приймає сервер",
        reviewsModule.PHOTO_LIMITS.types.every(type => accept.includes(type)),
        accept);
}

console.log("\n[9] Зібраний файл функції не відстає");
{
    // Модуль потрапляє в збірку лише якщо він у списку MODULES
    // (scripts/build-edge-function.js). Забути про це — класична
    // помилка цього проєкту: функція мовчки їде без нового коду.
    check("нові функції є в зібраному файлі",
        /function cleanReviewPhotos/.test(bundle)
        && /function reviewPhotoPath/.test(bundle));

    check("завантаження теж", /async function uploadReviewPhotos/.test(bundle));

    check("і прибирання", /async function deleteReviewPhotos/.test(bundle));
}

console.log(failures ? `\n✗ провалено перевірок: ${failures}\n` : "\n✓ усі перевірки пройдено\n");

process.exit(failures ? 1 : 0);
