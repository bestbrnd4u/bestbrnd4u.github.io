// Довідник Нової пошти: міста й відділення.
//
// НАВІЩО
// -------
// Місто й номер відділення покупець вписував руками. Наслідки видно на
// кожному замовленні: «Відділення №45» замість «№145», «Кийв», «НП 12»
// — і власник перед відправкою мусить вгадувати, що саме мали на увазі,
// або дзвонити й перепитувати.
//
// ЧОМУ ЧЕРЕЗ ФУНКЦІЮ, А НЕ ПРЯМО З БРАУЗЕРА
// ------------------------------------------
// Ключ API Нової пошти дає право не лише читати довідник, а й
// СТВОРЮВАТИ накладні на вашому рахунку. У коді сайту він лежати не
// може — тому браузер питає нашу функцію, а вона вже ходить у НП зі
// секретним ключем.
//
// ЩО В ЦЬОМУ ФАЙЛІ
// -----------------
// Тільки чиста логіка: зібрати запит і обрізати відповідь до того, що
// потрібно сторінці. Мережа — у _index.src.ts, тому це можна ганяти
// тестами в Node.
//
// ЧОМУ ВІДПОВІДЬ ОБРІЗАЄТЬСЯ
// ---------------------------
// НП на один запит віддає десятки полів на кожне відділення (графік,
// координати, обмеження ваги, номери телефонів). Сторінці потрібні
// назва й номер. Решта — це кілобайти, які поїхали б у браузер
// кожного покупця й нічого йому не дали.

// Обидва методи — тільки читання довідника. Жодного створення
// накладних: перелік навмисно закритий, щоб через проксі не можна
// було зробити нічого, крім пошуку адреси.
export const NP_METHODS = {

    settlements: {
        modelName: "Address",
        calledMethod: "searchSettlements"
    },

    warehouses: {
        modelName: "AddressGeneral",
        calledMethod: "getWarehouses"
    },

    // Типи точок: «Відділення», «Поштомат», «Пункт приймання-видачі».
    // Потрібні, щоб просити в НП саме потрібний тип, а не відсіювати
    // його в себе — див. коментар про 500 рядків нижче.
    types: {
        modelName: "Address",
        calledMethod: "getWarehouseTypes"
    }

};

// Скільки міст показувати в підказці. Більше нікому не потрібно: якщо
// потрібного немає в перших десяти, людина допише ще літеру.
export const SETTLEMENT_LIMIT = 12;

export function npRequest(apiKey, action) {

    const spec = NP_METHODS[action?.method];

    if (!spec || !apiKey) return null;

    if (action.method === "settlements") {

        const query = String(action.query || "").trim();

        // Одна літера дає півтисячі міст і жодної користі.
        if (query.length < 2) return null;

        return {
            apiKey,
            modelName: spec.modelName,
            calledMethod: spec.calledMethod,
            // Limit і Page — ЧИСЛАМИ.
            //
            // Тут стояло String(SETTLEMENT_LIMIT), і searchSettlements
            // відмовляв, тоді як getWarehouseTypes на тій самій моделі
            // Address працював. Опис методу в SDK називає обидва
            // параметри числами; getWarehouses рядок приймає, але
            // поблажливість одного методу нічого не обіцяє про інший.
            //
            // ЦЕ ГІПОТЕЗА, не доведена причина: точну скаже рядок
            // «Нова пошта відмовила» — він тепер іде і в щоденний звіт
            // (різновид np_directory).
            methodProperties: {
                CityName: query.slice(0, 60),
                Limit: SETTLEMENT_LIMIT,
                Page: 1
            }
        };

    }

    if (action.method === "types") {

        return {
            apiKey,
            modelName: spec.modelName,
            calledMethod: spec.calledMethod,
            methodProperties: {}
        };

    }

    const cityRef = String(action.cityRef || "").trim();

    // Ref міста — це UUID від НП. Перевіряємо форму, щоб проксі не
    // перетворився на спосіб передавати в НП що завгодно.
    if (!/^[0-9a-f-]{36}$/i.test(cityRef)) return null;

    const query = String(action.query || "").trim();
    const typeRef = String(action.typeRef || "").trim();

    // ЧОМУ ПОШУК ВІДДАЄМО НОВІЙ ПОШТІ
    //
    // Спершу тут стояв простий запит «усі точки міста, Limit 500», а
    // фільтрував уже браузер. На Києві це не працювало: точок там
    // кілька тисяч, у перші 500 потрапляють відділення (номери 1-500),
    // а поштомати мають номери на 4xxxx — тобто в список вони не
    // входили ніколи. Відділення знаходились, поштомати — ні.
    //
    // FindByString шукає по номеру й адресі на боці НП, тому «40964» і
    // «Хрещатик» знаходяться незалежно від кількості точок у місті.
    const properties = {
        CityRef: cityRef,
        Limit: query ? "50" : "500",
        Page: "1"
    };

    if (query) properties.FindByString = query.slice(0, 60);

    // Тип точки теж просимо в НП, а не відсіюємо в себе: інакше з 50
    // знайдених могли б прийти лише відділення, і поштоматів у списку
    // знову не було б.
    if (/^[0-9a-f-]{36}$/i.test(typeRef)) properties.TypeOfWarehouseRef = typeRef;

    return {
        apiKey,
        modelName: spec.modelName,
        calledMethod: spec.calledMethod,
        methodProperties: properties
    };

}

// Типи точок НП: {ref, name}. Нам потрібен лише той, у назві якого є
// «поштомат» — решту просимо як «усе інше».
export function parseTypes(payload) {

    const list = payload && Array.isArray(payload.data) ? payload.data : [];

    return list.map(item => ({
        ref: String(item?.Ref || "").trim(),
        name: String(item?.Description || "").trim()
    })).filter(item => item.ref && item.name);

}

// Ref типу «Поштомат» із довідника типів.
export function postomatTypeRef(types) {

    const list = (Array.isArray(types) ? types : [])
        .filter(item => /поштомат/i.test(String(item?.name || "")));

    if (!list.length) return "";

    // ЧОМУ НЕ ПРОСТО ПЕРШИЙ ЗБІГ.
    //
    // У довіднику НП «поштоматів» ДВА, і чужий стоїть раніше:
    //
    //     Поштомат ПриватБанку
    //     Поштомат
    //
    // find() брав перший — тобто пошук поштоматів Нової пошти
    // фільтрувався за типом ПриватБанку й повертав порожній список
    // ЗАВЖДИ. Ззовні це виглядало як «не знаходить поштомат за
    // номером», і жодної помилки при цьому не було: НП чесно
    // відповідала «нічого не знайдено».
    const exact = list.find(item =>
        String(item.name).trim().toLowerCase() === "поштомат");

    if (exact) return exact.ref || "";

    // Точного немає — беремо НАЙКОРОТШУ назву: чужі бренди додають
    // слова («ПриватБанку»), а власний тип НП зветься одним словом.
    // Це запас на випадок, якщо НП колись перейменує тип.
    const shortest = list.slice().sort((a, b) =>
        String(a.name).length - String(b.name).length)[0];

    return shortest ? (shortest.ref || "") : "";

}

// Міста з відповіді НП.
//
// Структура в них незвична: data — масив з ОДНОГО елемента, у якому
// лежить Addresses. Пишемо обережно: зміниться формат — отримаємо
// порожній список, а не помилку на сторінці оформлення.
export function parseSettlements(payload) {

    const first = payload && Array.isArray(payload.data) ? payload.data[0] : null;

    const list = first && Array.isArray(first.Addresses) ? first.Addresses : [];

    return list.map(item => ({

        // «Київ, Київська обл.» — саме те, що варто показати людині:
        // однойменних сіл в Україні десятки.
        name: String(item?.Present || item?.MainDescription || "").trim(),

        // Ref, за яким далі просять відділення. У НП це окреме поле:
        // Ref — це населений пункт, DeliveryCity — місто доставки.
        ref: String(item?.DeliveryCity || "").trim()

    })).filter(item => item.name && item.ref);

}

// Відділення міста, розділені на звичайні та поштомати.
export function parseWarehouses(payload) {

    const list = payload && Array.isArray(payload.data) ? payload.data : [];

    return list.map(item => ({

        name: String(item?.Description || "").trim(),

        number: String(item?.Number || "").trim(),

        // Поштомат і відділення — різні способи доставки на сторінці,
        // і мішати їх в одному списку означало б показувати людині
        // те, чого вона не обирала.
        postomat: String(item?.CategoryOfWarehouse || "") === "Postomat"

    })).filter(item => item.name);

}

// Що з відповіді НП вважати помилкою.
//
// НП відповідає HTTP 200 навіть на невдалий запит — успіх лежить у
// полі success, а причина в errors. Без цього «немає такого міста» і
// «ключ недійсний» виглядали б однаково: порожній список.
export function npError(payload) {

    if (!payload) return "порожня відповідь";

    if (payload.success === true) return null;

    const errors = Array.isArray(payload.errors) ? payload.errors.filter(Boolean) : [];

    return errors.length ? errors.join("; ") : "запит не пройшов";

}
