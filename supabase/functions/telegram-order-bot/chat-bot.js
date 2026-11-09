// Бот у чаті на сайті — без мовної моделі.
//
// РІШЕННЯ ВЛАСНИКА (09.11.2026)
// ------------------------------
//   • відповідає ОДРАЗУ на кожне повідомлення;
//   • власник бачить усю розмову в Telegram і може втрутитись — щойно
//     він відповів сам, бот у цій розмові замовкає;
//   • без платної моделі: розуміє запит за ключовими словами.
//
// ЩО ВМІЄ
// --------
//   1. Підібрати товар: тип речі, для кого, бренд, колір, бюджет — і
//      показати до чотирьох карток із каталогу. Уточнення («до 5000»,
//      «а чорна є?») доповнюють попередній запит, а не починають новий.
//   2. Відповісти на часте питання — ДОСЛІВНО текстом із сайту
//      (data/chat-bot.json → faq, його збирає scripts/build-chat-bot.js
//      із розділів «Часті питання»). Бот нічого не вигадує: чого немає на
//      сторінці, того він не скаже.
//   3. Підказати, де стан замовлення, і передати розмову менеджеру —
//      на прохання або коли не зрозумів.
//
// ЧОГО ТУТ НЕМА
// --------------
// Мережі й бази — лише чисті функції, як у chat.js: тести ганяють їх у
// Node на справжньому data/chat-bot.json.
//
// ФОРМАТ ВІДПОВІДІ В БАЗІ
// ------------------------
// Звичайний текст (його ж бачить власник у Telegram) плюс службові
// рядки, які сайт малює по-своєму, а Telegram — прибирає:
//   «• Назва — 6 500 ₴ https://…/p/slug/»  → картка товару
//   «[[chips: До 5 000 ₴ | Чорний]]»       → кнопки-підказки
//   «[[handoff]]»                          → бот передав розмову людині

export const BOT_AUTHOR = "bot";

const MAX_PRODUCTS = 4;

// Скільки останніх повідомлень покупця враховуємо, доповнюючи запит.
const CONTEXT_MESSAGES = 3;

const HOURS = { uk: "щодня 09:00–20:00", en: "daily 09:00–20:00 (Kyiv time)", ru: "ежедневно 09:00–20:00" };

// ── Тексти бота ────────────────────────────────────────────────────

const T = {
    uk: {
        hello: "Вітаю! Я бот-помічник BestBrnd4u. Підкажу щодо доставки, оплати й оригінальності або підберу річ — напишіть, що шукаєте, наприклад «жіноча сумка до 8000» чи «чоловічий годинник Tissot». Менеджер теж бачить цю розмову й підключиться, якщо треба.",
        found: "Ось що підходить:",
        foundMore: "Ось що підходить ({n} з {total}):",
        relaxed: "Точно такого зараз немає — ось найближче:",
        nothing: "На жаль, у каталозі такого зараз немає. Ми можемо привезти під замовлення — передаю менеджеру, він уточнить деталі.",
        askWhat: "Що саме шукаєте?",
        askMore: "Можу уточнити: бюджет, колір чи бренд?",
        faqMore: "Докладніше:",
        handoff: "Передаю розмову менеджеру — він відповість тут же ({hours}). Цю сторінку можна не тримати відкритою.",
        unknown: "Не впевнений, що правильно зрозумів. Я передав питання менеджеру — він відповість тут ({hours}). А поки можу підібрати річ або розповісти про доставку й оплату.",
        status: "Стан замовлення можна перевірити тут: {url} — потрібні номер замовлення й телефон. Якщо щось не так, напишіть, менеджер подивиться.",
        thanks: "Будь ласка! Якщо буде ще питання — пишіть.",
        returnsLegal: "",
        preorder: "під замовлення",
        chips: {
            menu: ["Підібрати річ", "Доставка", "Оплата", "Оригінальність", "Повернення"],
            types: ["Жіночі сумки", "Чоловічі сумки", "Годинники", "Окуляри", "Кросівки", "Гаманці"],
            budget: ["До 5 000 ₴", "До 10 000 ₴", "Від 10 000 ₴"],
            more: ["Інші варіанти", "Покликати менеджера"],
            human: "Покликати менеджера"
        }
    },
    en: {
        hello: "Hi! I'm the BestBrnd4u assistant bot. I can help with delivery, payment and authenticity or pick an item for you — tell me what you're looking for, e.g. “women's bag under 8000” or “men's Tissot watch”. A manager also sees this chat and will join if needed.",
        found: "Here's what fits:",
        foundMore: "Here's what fits ({n} of {total}):",
        relaxed: "Nothing matches exactly right now — here's the closest:",
        nothing: "Sorry, there's nothing like that in the catalog right now. We can bring it to order — I'm passing this to a manager who will clarify the details.",
        askWhat: "What exactly are you looking for?",
        askMore: "Want to narrow it down: budget, color or brand?",
        faqMore: "More details:",
        handoff: "I'm passing the chat to a manager — they will reply right here ({hours}). You don't need to keep this page open.",
        unknown: "I'm not sure I understood correctly. I've passed your question to a manager — they will reply here ({hours}). Meanwhile I can pick an item or tell you about delivery and payment.",
        status: "You can check your order status here: {url} — you'll need the order number and your phone. If something is wrong, write here and a manager will look into it.",
        thanks: "You're welcome! Write if you have more questions.",
        returnsLegal: "Return and exchange terms are on this page (in Ukrainian — that version is legally binding): {url}. A manager can explain them in English — just ask.",
        preorder: "made to order",
        chips: {
            menu: ["Pick an item", "Delivery", "Payment", "Authenticity", "Returns"],
            types: ["Women's bags", "Men's bags", "Watches", "Sunglasses", "Sneakers", "Wallets"],
            budget: ["Under 5,000 ₴", "Under 10,000 ₴", "From 10,000 ₴"],
            more: ["Other options", "Call a manager"],
            human: "Call a manager"
        }
    },
    ru: {
        hello: "Здравствуйте! Я бот-помощник BestBrnd4u. Подскажу по доставке, оплате и оригинальности или подберу вещь — напишите, что ищете, например «женская сумка до 8000» или «мужские часы Tissot». Менеджер тоже видит этот чат и подключится, если нужно.",
        found: "Вот что подходит:",
        foundMore: "Вот что подходит ({n} из {total}):",
        relaxed: "Точно такого сейчас нет — вот ближайшее:",
        nothing: "К сожалению, в каталоге такого сейчас нет. Мы можем привезти под заказ — передаю менеджеру, он уточнит детали.",
        askWhat: "Что именно ищете?",
        askMore: "Могу уточнить: бюджет, цвет или бренд?",
        faqMore: "Подробнее:",
        handoff: "Передаю разговор менеджеру — он ответит здесь же ({hours}). Эту страницу можно не держать открытой.",
        unknown: "Не уверен, что правильно понял. Я передал вопрос менеджеру — он ответит здесь ({hours}). А пока могу подобрать вещь или рассказать о доставке и оплате.",
        status: "Состояние заказа можно проверить здесь: {url} — понадобятся номер заказа и телефон. Если что-то не так, напишите, менеджер посмотрит.",
        thanks: "Пожалуйста! Если будут еще вопросы — пишите.",
        returnsLegal: "Условия возврата и обмена — на этой странице (на украинском, юридически действующей является эта версия): {url}. Менеджер может объяснить их по-русски — просто спросите.",
        preorder: "под заказ",
        chips: {
            menu: ["Подобрать вещь", "Доставка", "Оплата", "Оригинальность", "Возврат"],
            types: ["Женские сумки", "Мужские сумки", "Часы", "Очки", "Кроссовки", "Кошельки"],
            budget: ["До 5 000 ₴", "До 10 000 ₴", "От 10 000 ₴"],
            more: ["Другие варианты", "Позвать менеджера"],
            human: "Позвать менеджера"
        }
    }
};

// Друга частина текстів: про товар, на сторінці якого пише людина,
// контакти, промокоди, неробочий час.
const T2 = {
    uk: {
        offHours: " Зараз неробочий час — менеджер відповість після 09:00.",
        contacts: "Звʼязатися з нами можна так:",
        phone: "Телефон", telegram: "Telegram", instagram: "Instagram", email: "Пошта",
        contactsHours: "Працюємо {hours}.",
        promo: "Промокод вводиться в полі «Маєте промокод?» на сторінці оформлення замовлення — знижка порахується одразу. Діючі акції — на сторінці «Акції»: {url}",
        about: "Про «{title}»:",
        price: "Ціна — {price}.",
        priceSale: "Ціна зараз — {price} (було {old}).",
        colors: "Кольори: {list}.",
        colorOne: "Колір: {list}.",
        sizesIn: "Розміри в наявності: {list}.",
        sizesPre: "Під замовлення: {list}.",
        sizesNone: "Зараз усі розміри — під замовлення.",
        inStock: "Є в наявності. Відправляємо за {h} робочі дні, доставка Новою поштою — ще {t} дні.",
        preOrder: "Цей товар — під замовлення: {days}.",
        preOrderNoDays: "Цей товар — під замовлення; строк уточнить менеджер.",
        colorPre: "Колір «{color}» — під замовлення.",
        material: "Матеріал: {value}.",
        dimensions: "Розміри: {value}.",
        noInfo: "Цього в картці товару не вказано — передаю питання менеджеру.",
        authentic: "Так, це оригінал — у каталозі немає реплік і копій. Докладніше: {url}"
    },
    en: {
        offHours: " It's outside working hours now — a manager will reply after 09:00 (Kyiv time).",
        contacts: "You can reach us:",
        phone: "Phone", telegram: "Telegram", instagram: "Instagram", email: "Email",
        contactsHours: "We work {hours}.",
        promo: "Enter a promo code in the “Have a promo code?” field at checkout — the discount is applied right away. Current sales: {url}",
        about: "About “{title}”:",
        price: "Price — {price}.",
        priceSale: "Price now — {price} (was {old}).",
        colors: "Colors: {list}.",
        colorOne: "Color: {list}.",
        sizesIn: "Sizes in stock: {list}.",
        sizesPre: "Made to order: {list}.",
        sizesNone: "All sizes are made to order right now.",
        inStock: "In stock. We ship within {h} business days, Nova Poshta delivery takes {t} more days.",
        preOrder: "This item is made to order: {days}.",
        preOrderNoDays: "This item is made to order; a manager will confirm the timing.",
        colorPre: "The “{color}” color is made to order.",
        material: "Material: {value}.",
        dimensions: "Dimensions: {value}.",
        noInfo: "That isn't listed on the product page — I'm passing your question to a manager.",
        authentic: "Yes, it's authentic — there are no replicas or copies in our catalog. More: {url}"
    },
    ru: {
        offHours: " Сейчас нерабочее время — менеджер ответит после 09:00.",
        contacts: "Связаться с нами можно так:",
        phone: "Телефон", telegram: "Telegram", instagram: "Instagram", email: "Почта",
        contactsHours: "Работаем {hours}.",
        promo: "Промокод вводится в поле «Есть промокод?» на странице оформления заказа — скидка посчитается сразу. Действующие акции — на странице «Акции»: {url}",
        about: "О «{title}»:",
        price: "Цена — {price}.",
        priceSale: "Цена сейчас — {price} (было {old}).",
        colors: "Цвета: {list}.",
        colorOne: "Цвет: {list}.",
        sizesIn: "Размеры в наличии: {list}.",
        sizesPre: "Под заказ: {list}.",
        sizesNone: "Сейчас все размеры — под заказ.",
        inStock: "Есть в наличии. Отправляем за {h} рабочих дня, доставка Новой почтой — еще {t} дня.",
        preOrder: "Этот товар — под заказ: {days}.",
        preOrderNoDays: "Этот товар — под заказ; срок уточнит менеджер.",
        colorPre: "Цвет «{color}» — под заказ.",
        material: "Материал: {value}.",
        dimensions: "Размеры: {value}.",
        noInfo: "Этого в карточке товара не указано — передаю вопрос менеджеру.",
        authentic: "Да, это оригинал — в каталоге нет реплик и копий. Подробнее: {url}"
    }
};

const T3 = {
    uk: {
        colorYes: "Так, є: {list}.",
        colorNo: "Такого кольору в цієї моделі немає. Є: {list}.",
        brandOther: "{what} {brand} зараз немає, але є інші речі {brand}:"
    },
    en: {
        colorYes: "Yes, available: {list}.",
        colorNo: "This model doesn't come in that color. Available: {list}.",
        brandOther: "No {what} from {brand} right now, but here are other {brand} items:"
    },
    ru: {
        colorYes: "Да, есть: {list}.",
        colorNo: "Такого цвета у этой модели нет. Есть: {list}.",
        brandOther: "{what} {brand} сейчас нет, но есть другие вещи {brand}:"
    }
};

// Назви типів для фрази «Сумок Prada зараз немає».
const TYPE_WORDS = {
    uk: { bags: "Сумок", watches: "Годинників", glasses: "Окулярів", sneakers: "Кросівок", wallets: "Гаманців" },
    en: { bags: "bags", watches: "watches", glasses: "sunglasses", sneakers: "sneakers", wallets: "wallets" },
    ru: { bags: "Сумок", watches: "Часов", glasses: "Очков", sneakers: "Кроссовок", wallets: "Кошельков" }
};

function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
}

export function botLang(value) {
    return ["en", "ru"].includes(String(value ?? "").toLowerCase()) ? String(value).toLowerCase() : "uk";
}

// ── Розбір тексту ──────────────────────────────────────────────────

// Нижній регістр, апострофи до одного, «ё» → «е», без пунктуації.
export function normalizeText(text) {
    return String(text ?? "")
        .toLowerCase()
        .replace(/[’ʼ`´]/g, "'")
        .replace(/ё/g, "е")
        .replace(/[«»"“”„.,!?;:()\[\]{}…•/\\|+*_=<>~^]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function words(text) {
    return normalizeText(text).split(" ").filter(Boolean);
}

// Чи є в тексті слово, що ПОЧИНАЄТЬСЯ з одного зі стемів. Початок
// слова, а не будь-де: інакше «жін» знайшлося б у «піджінсах», а «чол»
// — у «чолці». Стеми з пробілом шукаються як фраза.
function hasStem(list, stems) {
    return stems.some(stem => stem.includes(" ")
        ? (" " + list.join(" ") + " ").includes(" " + stem)
        : list.some(w => w.startsWith(stem)));
}

// Типи речей: стеми трьома мовами → категорія чи розділ каталогу.
// Розділ (department) ширший за категорію: «сумка» — це і жіночі, і
// чоловічі, а стать тоді вирішує окреме слово.
const TYPES = [
    { key: "bags", department: "Сумки", stems: ["сумк", "сумоч", "клатч", "шопер", "тоут", "кросбоді", "крос-боді", "bag", "handbag", "purse", "tote", "clutch", "crossbody", "backpack", "рюкзак"] },
    { key: "watches", category: "Годинники", stems: ["годинник", "часы", "часов", "часик", "watch"] },
    { key: "glasses", category: "Окуляри і оправи", stems: ["окуляр", "оправ", "очки", "очков", "glasses", "sunglass", "eyewear", "frames"] },
    { key: "sneakers", category: "Кросівки", stems: ["кросівк", "кроссовк", "кеди", "кеды", "взутт", "обув", "sneaker", "trainer", "shoes"] },
    { key: "wallets", category: "Гаманці", stems: ["гаман", "кошел", "портмоне", "кардхолдер", "wallet", "cardholder", "card holder"] }
];

const GENDERS = [
    { key: "Жінкам", stems: ["жін", "жен", "дівч", "девуш", "мам", "дружин", "жена", "жене", "сестр", "доньк", "дочк", "подруг", "для неї", "для нее", "woman", "women", "female", "lady", "ladies", "her ", "wife", "girl", "mom", "mother"] },
    { key: "Чоловікам", stems: ["чолов", "мужч", "мужск", "хлопц", "парн", "тат", "пап", "муж", "син", "сын", "брат", "для нього", "для него", "man", "men", "male", "him ", "husband", "boyfriend", "dad", "father", "guy"] }
];

// Кольори: стеми → початок української назви кольору у варіантах.
const COLORS = [
    { key: "Чорн", stems: ["чорн", "черн", "black"] },
    { key: "Біл", stems: ["біл", "бел", "white", "молочн", "айвор", "ivory"] },
    { key: "Коричн", stems: ["коричн", "brown", "кемел", "camel", "карамел"] },
    { key: "Беж", stems: ["беж", "beige", "nude"] },
    { key: "Сір", stems: ["сір", "сер", "grey", "gray", "графіт"] },
    { key: "Рожев", stems: ["рожев", "розов", "pink", "пудров"] },
    { key: "Син", stems: ["синій", "синя", "синь", "синий", "синяя", "blue", "navy"] },
    { key: "Зелен", stems: ["зелен", "green", "хакі", "хаки", "khaki"] },
    { key: "Золот", stems: ["золот", "gold"] },
    { key: "Срібл", stems: ["срібл", "серебр", "silver"] },
    { key: "Червон", stems: ["червон", "красн", "red"] }
];

// Бренди, які пишуть кирилицею. Латинську назву шукаємо як є.
const BRAND_ALIASES = {
    "Coach": ["коуч", "коач"],
    "Gucci": ["гуч"],
    "Prada": ["прад"],
    "Michael Kors": ["майкл корс", "майкл корс", "корс", "mk "],
    "Marc Jacobs": ["марк джейкобс", "марк якобс", "джейкобс"],
    "Lacoste": ["лакост"],
    "Tissot": ["тісо", "тиссо", "тісот"],
    "Mathey-Tissot": ["mathey", "матей"],
    "Ray-Ban": ["ray ban", "рейбен", "рей бен", "рейбан"],
    "Burberry": ["барбер", "берберр"],
    "Balenciaga": ["баленсіаг", "баленсиаг"],
    "Saint Laurent": ["сен лоран", "ysl", "ив сен", "сен-лоран"],
    "Jimmy Choo": ["джиммі чу", "джимми чу"],
    "Tory Burch": ["торі берч", "тори берч"],
    "Love Moschino": ["moschino", "москіно", "москино"],
    "Jacquemus": ["жакмюс"],
    "Armani Exchange": ["армані", "армани", "armani"],
    "Invicta": ["інвікт", "инвикт"],
    "Alain Mikli": ["ален міклі", "ален микли"],
    "JW PEI": ["jw pei", "джей дабл"],
    "Adidas by Stella Mccartney": ["stella", "стелла", "adidas", "адідас", "адидас"]
};

// «до 8000», «до 8 тис», «under 8,000», «від 5000», «5000-8000», «8к».
export function parseBudget(text) {

    const t = normalizeText(String(text ?? "").replace(/(\d)[\s  ,.](?=\d{3}\b)/g, "$1"));

    const num = s => {
        const m = String(s).match(/^(\d+(?:[.,]\d+)?)\s*(тис|тыс|k|к)?/);
        if (!m) return null;
        const n = Number(m[1].replace(",", "."));
        return m[2] ? Math.round(n * 1000) : n;
    };

    const unit = "(\\d+(?:[.,]\\d+)?\\s*(?:тис|тыс|k|к)?)";

    const range = t.match(new RegExp(`${unit}\\s*(?:-|–|—|до|to)\\s*${unit}`));
    if (range && /^\d/.test(range[1]) && !/^(до|to)\b/.test(t.slice(range.index - 3, range.index).trim())) {
        const a = num(range[1]), b = num(range[2]);
        if (a && b && b > a && b >= 500) return { min: a, max: b };
    }

    const max = t.match(new RegExp(`(?:^|\\s)(?:до|до\\s+ціни|не дорожче|не дороже|дешевше|дешевле|under|below|up to|max|less than|within)\\s*${unit}`));
    const min = t.match(new RegExp(`(?:^|\\s)(?:від|от|from|over|above|more than|дорожче|дороже)\\s*${unit}`));

    const out = {};
    if (max) { const n = num(max[1]); if (n >= 300) out.max = n; }
    if (min) { const n = num(min[1]); if (n >= 300) out.min = n; }

    // Просто сума з валютою: «бюджет 7000 грн» — це стеля.
    if (!out.max && !out.min) {
        const plain = t.match(/(\d{4,6})\s*(?:грн|uah|₴|гривен|гривень|hryvn)|(?:бюджет|budget)\s*(\d{3,6})/);
        if (plain) out.max = Number(plain[1] || plain[2]);
    }

    return out.max || out.min ? out : null;

}

// Критерії підбору з одного повідомлення. null — це не запит на товар.
export function parseWish(text, data) {

    const list = words(text);
    const raw = " " + normalizeText(text) + " ";

    const wish = {};

    const type = TYPES.find(t => hasStem(list, t.stems));
    if (type) wish.type = type.key;

    // «Окуляри» в кнопці — це сонцезахисні й оправи разом, «Жіночі сумки»
    // — розділ і стать одразу: стать нижче це й зробить.
    const gender = GENDERS.filter(g => hasStem(list, g.stems.filter(s => !s.endsWith(" "))) || g.stems.some(s => s.endsWith(" ") && raw.includes(" " + s)));
    if (gender.length === 1) wish.gender = gender[0].key;

    const color = COLORS.find(c => hasStem(list, c.stems));
    if (color) wish.color = color.key;

    const brands = [...new Set((data && data.products || []).map(p => p.brand).filter(Boolean))];
    const brand = brands.find(b => raw.includes(" " + normalizeText(b) + " ") || raw.includes(" " + normalizeText(b).split(" ")[0] + " ") && normalizeText(b).split(" ")[0].length > 4)
        || Object.keys(BRAND_ALIASES).find(b => brands.includes(b) && BRAND_ALIASES[b].some(a => raw.includes(" " + a)));
    if (brand) wish.brand = brand;
    else {
        const fuzzy = fuzzyBrand(text, data);
        if (fuzzy) wish.brand = fuzzy;
    }

    const budget = parseBudget(text);
    if (budget) wish.budget = budget;

    if (hasStem(list, ["подар", "gift", "present"])) wish.gift = true;
    if (hasStem(list, ["новинк", "нове", "новое", "новые", "new arrival", "latest"])) wish.fresh = true;
    if (hasStem(list, ["знижк", "скидк", "акці", "акци", "sale", "discount", "дешев", "cheap"])) wish.sale = true;

    // «Інші варіанти» — показати наступні.
    if (hasStem(list, ["інші варіант", "ще варіант", "другие вариант", "еще вариант", "other option", "more option", "show more", "ще "])) wish.more = true;

    const wants = hasStem(list, ["шука", "ищу", "хочу", "хоті", "хотел", "підбер", "подбер", "підібр", "подобр", "порад", "посовет", "покаж", "что есть", "що є", "є ", "есть ", "looking", "want", "need", "recommend", "suggest", "show", "pick", "any "]);

    const criteria = ["type", "gender", "color", "brand", "budget"].filter(k => wish[k]).length;

    if (!criteria && !wish.gift && !wish.fresh && !wish.sale && !wish.more && !wants) return null;

    wish.criteria = criteria;
    wish.wants = wants;

    return wish;

}

// Ціна зараз — те саме правило, що на сайті (scripts/sections.js
// priceNow): знижка діє у своєму вікні. Імʼя інше навмисно: у зібраній
// функції всі модулі лежать в одному файлі, а priceNow уже є в
// format.js (тест test-promo-codes стежить за повторами).
export function botPriceNow(product, now) {
    const sale = product && product.sale;
    if (sale && sale.price) {
        const at = Number.isFinite(now) ? now : Date.now();
        const from = sale.from ? Date.parse(sale.from) : NaN;
        const to = sale.to ? Date.parse(sale.to) : NaN;
        if (!(Number.isFinite(from) && at < from) && !(Number.isFinite(to) && at >= to)) return Number(sale.price);
    }
    return Number(product && product.price) || 0;
}

function matches(product, wish, now, relax) {

    const type = TYPES.find(t => t.key === wish.type);

    if (type && type.department && product.department !== type.department) return false;
    if (type && type.category && product.category !== type.category) return false;

    if (wish.brand && product.brand !== wish.brand) return false;

    if (wish.gender && !relax.gender) {
        const g = product.gender || [];
        if (g.length && !g.includes(wish.gender) && !g.includes("Унісекс")) return false;
    }

    if (wish.color && !relax.color) {
        if (!(product.colors || []).some(c => String(c).toLowerCase().startsWith(wish.color.toLowerCase())
            || String(c).toLowerCase().includes(wish.color.toLowerCase()))) return false;
    }

    const price = botPriceNow(product, now);

    if (wish.budget && !relax.budget) {
        if (wish.budget.max && price > wish.budget.max) return false;
        if (wish.budget.min && price < wish.budget.min) return false;
    }

    if (wish.sale && !(botPriceNow(product, now) < (product.oldPrice || product.price) )) return false;
    if (wish.fresh && !product.isNew) return false;

    return true;

}

// Підбір: спершу точний; нічого — послаблюємо колір, потім стать,
// потім бюджет. Тип і бренд НЕ послаблюємо: показати годинник людині,
// яка шукала сумку, гірше, ніж чесно сказати «немає».
export function pickProducts(wish, data, now, offset) {

    const products = (data && data.products) || [];

    const steps = [{}, { color: true }, { color: true, gender: true }, { color: true, gender: true, budget: true }];

    for (let i = 0; i < steps.length; i++) {
        const found = products.filter(p => matches(p, wish, now, steps[i]));
        if (!found.length) continue;
        found.sort((a, b) =>
            (Number(b.inStock && !b.preOrder) - Number(a.inStock && !a.preOrder))
            || (wish.budget && wish.budget.max ? botPriceNow(b, now) - botPriceNow(a, now) : 0)
            || (Number(b.isNew) - Number(a.isNew))
            || botPriceNow(a, now) - botPriceNow(b, now));
        const start = offset && offset < found.length ? offset : 0;
        return { items: found.slice(start, start + MAX_PRODUCTS), total: found.length, start, relaxed: i > 0 };
    }

    return { items: [], total: 0, start: 0, relaxed: false };

}

// Доповнити запит попередніми: «сумка» → «до 5000» → «а чорна?».
// Поле з нового повідомлення перемагає; новий ТИП скидає колір і бренд
// попереднього (шукали чорну сумку Coach, тепер «годинник» — це вже
// не чорний годинник Coach).
export function mergeWishes(current, previous) {

    const out = Object.assign({}, current);

    for (const prev of previous) {
        if (!prev) continue;
        if (current.type && prev.type && prev.type !== current.type) break;
        ["type", "gender", "brand", "color", "budget"].forEach(k => {
            if (out[k] === undefined && prev[k] !== undefined) out[k] = prev[k];
        });
    }

    out.criteria = ["type", "gender", "color", "brand", "budget"].filter(k => out[k]).length;

    return out;

}

// ── Часті питання ──────────────────────────────────────────────────

// Теми, на які людина питає найчастіше, — словами, а не номером
// питання: «скільки йде посилка» і «коли відправите» — одне й те саме.
const TOPICS = [
    { key: "delivery-cost", stems: ["скільки кошт доставк", "вартість доставк", "ціна доставк", "сколько стоит доставк", "стоимость доставк", "delivery cost", "shipping cost", "how much delivery", "how much is delivery", "how much does delivery"], faq: /Скільки коштує доставка|How much does delivery|Сколько стоит доставка/i },
    { key: "delivery-time", stems: ["як швидко", "коли відправ", "скільки йде", "скільки їде", "термін доставк", "строк доставк", "как быстро", "когда отправ", "сколько идет", "срок доставк", "how fast", "how quickly", "when will", "how long", "ship"], faq: /Як швидко|How quickly|How fast|Как быстро/i },
    { key: "delivery", stems: ["доставк", "нова пошт", "новой почт", "новая почт", "відправк", "отправк", "delivery", "shipping", "nova poshta", "courier", "кур'єр", "курьер", "поштомат", "почтомат"], faq: /Скільки коштує доставка|How much does delivery|Сколько стоит доставка/i },
    { key: "payment", stems: ["оплат", "оплач", "карт", "готівк", "наличн", "накладен", "післяплат", "наложен", "payment", "pay ", "card", "cash", "cod"], faq: /оплатити карткою|pay by card|pay online|оплатить картой/i },
    { key: "inspect", stems: ["оглян", "огляд", "осмотр", "посмотреть перед", "inspect", "check before"], faq: /оглянути|inspect|осмотреть/i },
    { key: "fake", stems: ["оригінал", "оригинал", "підробк", "подделк", "реплік", "реплик", "фейк", "fake", "replica", "original", "authentic", "genuine", "справжн", "настоящ"], faq: /репліки|replicas|реплики/i },
    { key: "source", stems: ["звідки", "откуда", "where do you", "where from", "де купу", "где покупа"], faq: /Звідки ви привозите|Where do you|Откуда вы привозите/i },
    { key: "doubt", stems: ["сумнів", "сомнева", "doubt", "перевір оригін", "проверить оригин"], faq: /сумніваюся|doubt|сомневаюсь/i },
    { key: "returns", stems: ["поверн", "возврат", "вернут", "обмін", "обмен", "не підійш", "не подош", "не підходит", "return", "refund", "exchange", "doesn't fit", "didn't fit"], faq: /Що робити, якщо товар не підійшов|What if the item|What to do if the item|Что делать, если товар не подош/i, legal: true },
    { key: "store", stems: ["магазин", "шоурум", "showroom", "офлайн", "offline", "адрес", "address", "самовивіз", "самовывоз", "забрат", "pickup", "pick up", "приїхат", "приехать"], faq: /фізичний магазин|physical store|физический магазин/i },
    { key: "buyer", stems: ["байєр", "байер", "під замовлен", "под заказ", "привез", "немає в каталоз", "нет в каталог", "buyer", "to order", "not in the catalog", "з сша", "из сша", "from the us", "from usa"], faq: /Чи можна замовити річ, якої немає|order an item that|заказать вещь, которой нет/i }
];

const STOP = new Set(["я", "а", "і", "й", "та", "чи", "ви", "в", "у", "на", "до", "з", "із", "що", "як", "це", "є", "не", "мені", "можна", "а", "и", "в", "на", "что", "как", "это", "есть", "ли", "вы", "мне", "можно", "the", "a", "an", "is", "are", "do", "you", "i", "to", "of", "in", "on", "can", "what", "how", "my", "it", "for"]);

// Запасний шлях для питань поза темами: збіг слів (за початком на 5
// літер — грубий, але робочий стем для української й російської) з
// питаннями з сайту.
function faqByWords(text, faq) {

    const stem = w => w.slice(0, 5);
    const mine = new Set(words(text).filter(w => w.length > 2 && !STOP.has(w)).map(stem));

    if (mine.size < 2) return null;

    let best = null;

    faq.forEach(item => {
        const theirs = new Set(words(item.q).filter(w => w.length > 2 && !STOP.has(w)).map(stem));
        let score = 0;
        mine.forEach(s => { if (theirs.has(s)) score += 1; });
        const share = score / Math.max(theirs.size, 1);
        if (score >= 2 && share >= 0.4 && (!best || share > best.share)) best = { item, share };
    });

    return best ? best.item : null;

}

export function findTopic(text) {
    const list = words(text);
    return TOPICS.find(t => hasStem(list, t.stems)) || null;
}

// ── Відповідь ──────────────────────────────────────────────────────

function botMoney(n) {
    return Math.round(Number(n) || 0).toLocaleString("uk-UA").replace(/ | /g, " ") + " ₴";
}

function pageUrl(site, path, lang) {
    const base = String(site || "").replace(/\/+$/, "");
    return base + (lang === "uk" ? path : `/${lang}${path}`);
}

// ── Неробочий час ──────────────────────────────────────────────────

// Година в Києві. Функція Supabase живе в UTC, а графік магазину —
// київський; зсув літо/зима бере на себе Intl.
export function kyivHour(now) {
    try {
        return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Kyiv", hour: "numeric", hourCycle: "h23" })
            .format(new Date(Number.isFinite(now) ? now : Date.now())));
    } catch (error) {
        return 12;
    }
}

export function offHours(now) {
    const h = kyivHour(now);
    return h < 9 || h >= 20;
}

// ── Автовідповіді власника (адмінка) ───────────────────────────────

// Ключове слово — як у hasStem: початок слова або фраза. Власник
// пише «розстрочк», «частинами» — і так само ловляться «розстрочка»,
// «розстрочку».
export function ownerAnswer(text, data, lang) {
    const list = words(text);
    const answers = (data && data.answers) || [];
    for (const a of answers) {
        const keys = (a.keywords || []).map(k => normalizeText(k)).filter(Boolean);
        if (!keys.length || !hasStem(list, keys)) continue;
        const body = a.answer && a.answer[lang];
        // Немає відповіді цією мовою — не відповідаємо українською
        // людині з /en/: краще передати менеджеру.
        if (!body) return lang === "uk" ? null : { missing: true };
        return { text: body + (a.link ? "\n" + a.link : "") };
    }
    return null;
}

// ── Товар, на сторінці якого пише людина ───────────────────────────

export function productFromPage(page, data) {
    const m = String(page || "").match(/\/p\/([^/?#]+)/);
    if (!m) return null;
    let slug = m[1];
    try { slug = decodeURIComponent(slug); } catch (error) { /* як є */ }
    return ((data && data.products) || []).find(p => p.slug === slug) || null;
}

const ASK = {
    colors: ["кольор", "колір", "колор", "цвет", "цвета", "color", "colour", "чорн", "черн", "біл", "бел", "black", "white", "інш колір", "другой цвет", "other color"],
    sizes: ["розмір", "розмер", "размер", "size", "сітк", "сетк", "маломір", "маломер", "великомір", "большемер"],
    stock: ["наявн", "наличи", "in stock", "available", "availability", "є в ", "є?", "есть в ", "залиш", "остал", "коли отрима", "когда получ", "when will i get", "скільки чека", "сколько жда", "how long"],
    price: ["ціна", "ціну", "ціни", "скільки кошту", "вартість", "цена", "цену", "сколько стоит", "стоимость", "price", "cost", "how much"],
    material: ["матеріал", "материал", "шкір", "кожа", "кожан", "material", "leather", "з чого", "из чего", "made of", "склад", "состав"],
    dimensions: ["габарит", "розміри сумк", "размеры сумк", "dimension", "заввишки", "завширшки", "высот", "ширин", "how big", "влізе", "влезет", "fit"],
    authentic: ["оригінал", "оригинал", "справжн", "настоящ", "authentic", "original", "genuine", "fake", "реплік", "реплик", "підробк", "подделк"]
};

function colorName(v, lang) {
    return (v.color && (v.color[lang] || v.color.uk)) || v.colorUk || "";
}

// Відповідь про конкретний товар. null — питання не про нього (або
// людина питає про щось інше: «а сумки Coach є?» — це вже підбір).
export function productAnswer(text, product, data, lang, now, site) {

    if (!product || !product.details) return null;

    const list = words(text);
    const L = T2[lang];
    const asked = Object.keys(ASK).filter(k => hasStem(list, ASK[k]));
    // Будь-який колір зі словника («а червоний є?») — теж питання про
    // колір, не лише ті кілька, що в ASK.colors.
    if (!asked.includes("colors") && COLORS.some(c => hasStem(list, c.stems))) asked.push("colors");

    // «Є чорний?» на сторінці годинника — це питання про ЦЕЙ годинник,
    // а «чорна сумка Coach» на тій самій сторінці — підбір. Ознака
    // підбору — ІНШИЙ тип чи бренд або бюджет. Той самий тип («які
    // розміри сумки?» на сторінці сумки) — це все ще про неї.
    const wish = parseWish(text, data);
    const sameType = wish && wish.type && (() => {
        const t = TYPES.find(x => x.key === wish.type);
        return t && ((t.department && t.department === product.department) || (t.category && t.category === product.category));
    })();
    if (wish && ((wish.type && !sameType) || (wish.brand && wish.brand !== product.brand) || wish.budget)) return null;

    if (!asked.length) return null;

    const d = product.details;
    const title = (product.title && (product.title[lang] || product.title.uk)) || "";
    const lines = [fill(L.about, { title })];
    const variants = d.variants || [];
    const realSizes = variants.some(v => (v.sizes || []).some(s => String(s.size).toUpperCase() !== "ONESIZE"));
    let missing = false;

    if (asked.includes("price")) {
        const now_ = botPriceNow(product, now);
        const old = product.sale && now_ < product.price ? product.price : (product.oldPrice && product.oldPrice > now_ ? product.oldPrice : 0);
        lines.push(old ? fill(L.priceSale, { price: botMoney(now_), old: botMoney(old) }) : fill(L.price, { price: botMoney(now_) }));
    }

    // Конкретний колір («а чорний є?») — відповідь прямо: так чи ні.
    const wanted = COLORS.find(c => hasStem(list, c.stems));
    if (wanted) {
        const hit = variants.filter(v => String(v.colorUk || "").toLowerCase().includes(wanted.key.toLowerCase()));
        const L3 = T3[lang];
        if (hit.length) {
            lines.push(fill(L3.colorYes, { list: hit.map(v => colorName(v, lang) + (v.preOrder ? ` (${T[lang].preorder})` : "")).join(", ") }));
        } else {
            lines.push(fill(L3.colorNo, { list: variants.map(v => colorName(v, lang)).filter(Boolean).join(", ") }));
        }
    } else if (asked.includes("colors") || (asked.includes("stock") && variants.length > 1)) {
        const names = variants.map(v => colorName(v, lang) + (v.preOrder ? ` (${T[lang].preorder})` : "")).filter(Boolean);
        if (names.length) lines.push(fill(names.length > 1 ? L.colors : L.colorOne, { list: names.join(", ") }));
    }

    if (asked.includes("sizes")) {
        if (realSizes) {
            variants.forEach(v => {
                const inStock = (v.sizes || []).filter(s => !s.preOrder).map(s => s.size);
                const pre = (v.sizes || []).filter(s => s.preOrder).map(s => s.size);
                const prefix = variants.length > 1 ? colorName(v, lang) + ": " : "";
                if (inStock.length) lines.push(prefix + fill(L.sizesIn, { list: inStock.join(", ") }));
                if (pre.length) lines.push(prefix + (inStock.length ? fill(L.sizesPre, { list: pre.join(", ") }) : L.sizesNone));
            });
        } else if (d.dimensions && d.dimensions[lang]) {
            lines.push(fill(L.dimensions, { value: d.dimensions[lang] }));
        } else {
            missing = true;
        }
    }

    if (asked.includes("stock")) {
        const all = variants.length && variants.every(v => v.preOrder);
        if (product.preOrder || all) {
            const days = d.preOrderDays && d.preOrderDays[lang];
            lines.push(days ? fill(L.preOrder, { days }) : L.preOrderNoDays);
        } else {
            const del = data.delivery || { handlingMin: 1, handlingMax: 2, transitMin: 1, transitMax: 3 };
            lines.push(fill(L.inStock, { h: `${del.handlingMin}–${del.handlingMax}`, t: `${del.transitMin}–${del.transitMax}` }));
            variants.filter(v => v.preOrder).forEach(v => lines.push(fill(L.colorPre, { color: colorName(v, lang) })));
        }
    }

    if (asked.includes("material")) {
        if (d.material && d.material[lang]) lines.push(fill(L.material, { value: d.material[lang] }));
        else missing = true;
    }

    if (asked.includes("dimensions") && !asked.includes("sizes")) {
        if (d.dimensions && d.dimensions[lang]) lines.push(fill(L.dimensions, { value: d.dimensions[lang] }));
        else missing = true;
    }

    if (asked.includes("authentic")) {
        lines.push(fill(L.authentic, { url: pageUrl(site, "/authenticity", lang) }));
    }

    // Нічого з питаного в картці немає — чесно, і людині.
    if (lines.length === 1) {
        return { text: L.noInfo, handoff: true };
    }

    if (missing) lines.push(L.noInfo);

    return { text: lines.join("\n"), handoff: missing };

}

// ── Контакти ───────────────────────────────────────────────────────

const CONTACT_STEMS = ["контакт", "телефон", "зателефонувати", "подзвонит", "позвонит", "номер телефон", "інстаграм", "инстаграм", "instagram", "телеграм", "telegram", "вайбер", "viber", "пошт", "почт", "email", "e-mail", "мейл", "як з вами зв", "как с вами связ", "how to contact", "contact", "графік", "график", "години роботи", "часы работы", "коли працюєте", "когда работаете", "working hours", "opening hours"];

function contactsReply(data, lang) {
    const c = (data && data.contacts) || {};
    const L = T2[lang];
    const lines = [L.contacts];
    if (c.phone) lines.push(`${L.phone}: ${c.phone}`);
    if (c.telegram) lines.push(`${L.telegram}: ${c.telegram}`);
    if (c.instagram) lines.push(`${L.instagram}: ${c.instagram}`);
    if (c.email) lines.push(`${L.email}: ${c.email}`);
    lines.push(fill(L.contactsHours, { hours: HOURS[lang] }));
    return lines.join("\n");
}

// ── Опечатки в брендах ─────────────────────────────────────────────

function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = tmp;
        }
    }
    return row[b.length];
}

// «Prda» → Prada, «гучи» → Gucci, «лакосте» → Lacoste. Лише для слів від
// чотирьох літер і з однією помилкою (дві — для довгих): «coat» не має
// ставати Coach.
export function fuzzyBrand(text, data) {
    const brands = [...new Set(((data && data.products) || []).map(p => p.brand).filter(Boolean))];
    const candidates = [];
    brands.forEach(b => {
        // Найдовше слово назви, а не перше: «love» (Love Moschino) і
        // «marc» (Marc Jacobs) — звичайні слова, і «I love it» ставало б
        // запитом на бренд.
        const longest = normalizeText(b).split(" ").sort((x, y) => y.length - x.length)[0];
        candidates.push([longest, b]);
        (BRAND_ALIASES[b] || []).forEach(a => { if (!a.includes(" ")) candidates.push([a.trim(), b]); });
    });
    for (const w of words(text)) {
        if (w.length < 4) continue;
        for (const [name, brand] of candidates) {
            if (name.length < 4) continue;
            const limit = name.length >= 7 ? 2 : 1;
            if (editDistance(w, name) <= limit && w[0] === name[0]) return brand;
        }
    }
    return null;
}

// Розмова вже в людини: власник відповів або бот передав її сам.
export function botShouldStay(history) {
    return !(history || []).some(m => m && (m.author === "owner"
        || (m.author === BOT_AUTHOR && /\[\[handoff\]\]/.test(String(m.body || "")))));
}

// Головна функція. history — повідомлення нитки ДО цього (author,
// body), від старих до нових. Повертає { text, products, chips, handoff }
// або null, якщо бот має мовчати.
export function botReply(message, history, data, options) {

    const opts = options || {};
    const lang = botLang(opts.lang);
    const L = T[lang];
    const site = opts.siteUrl || "https://bestbrnd4u.com";
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();

    if (!data || data.enabled === false) return null;
    if (!botShouldStay(history)) return null;

    const text = String(message ?? "");
    const list = words(text);
    const hours = HOURS[lang];
    // Передаючи розмову вночі, кажемо, коли чекати відповіді: «відповімо
    // найближчим часом» о другій ночі — неправда.
    const late = offHours(now) ? T2[lang].offHours : "";
    const reply = (body, extra) => {
        const out = Object.assign({ text: body, products: [], chips: [], handoff: false }, extra);
        if (out.handoff && late && !out.text.includes(late.trim())) out.text += late;
        return out;
    };

    // 1. Людина просить людину.
    if (hasStem(list, ["менеджер", "оператор", "людин", "человек", "живий", "живой", "покликат", "позват", "manager", "human", "operator", "real person", "агент", "agent", "передзвон", "перезвон", "call me", "call back"])) {
        return reply(fill(L.handoff, { hours }), { handoff: true });
    }

    // 2. Де моє замовлення.
    if (hasStem(list, ["де моє замовлен", "где мой заказ", "статус замовлен", "статус заказ", "стан замовлен", "where is my order", "order status", "трек", "track", "накладн", "ттн"]) || /\b\d{8,12}\b/.test(text)) {
        return reply(fill(L.status, { url: pageUrl(site, "/order-status", lang) }), { chips: [L.chips.human] });
    }

    // 2а. Автовідповіді власника — понад усе вбудоване: власник знає
    // свій магазин краще за ключові слова в коді.
    const own = ownerAnswer(text, data, lang);
    if (own && own.missing) return reply(fill(L.handoff, { hours }), { handoff: true });
    if (own) return reply(own.text, { chips: [L.chips.human] });

    // 2б. Людина пише зі сторінки товару й питає про НЬОГО.
    const here = productFromPage(opts.page, data);
    const about = productAnswer(text, here, data, lang, now, site);
    if (about) {
        return reply(about.text, { handoff: Boolean(about.handoff), chips: about.handoff ? [] : [L.chips.human] });
    }

    // 2в. Контакти й графік.
    if (hasStem(list, CONTACT_STEMS) && !(parseWish(text, data) || {}).criteria) {
        return reply(contactsReply(data, lang), { chips: L.chips.menu.slice(0, 3) });
    }

    // 2г. Промокод.
    if (hasStem(list, ["промокод", "промо-код", "промо код", "promo code", "promocode", "coupon", "купон", "код знижки", "код скидки", "discount code"])) {
        return reply(fill(T2[lang].promo, { url: pageUrl(site, "/aktsii/", lang) }), { chips: [L.chips.human] });
    }

    // 3. Тема з частих питань.
    const topic = findTopic(text);
    const faq = (data.faq && data.faq[lang]) || [];

    if (topic && !(parseWish(text, data) || {}).criteria) {
        if (topic.legal && lang !== "uk") {
            return reply(fill(L.returnsLegal, { url: pageUrl(site, "/return-warranty", lang) }), { chips: L.chips.menu.filter(c => c !== L.chips.menu[4]) });
        }
        const item = faq.find(f => topic.faq.test(f.q)) || faqByWords(text, faq);
        if (item) {
            return reply(`${item.a}\n${L.faqMore} ${pageUrl(site, item.page, lang)}`, { chips: L.chips.menu.slice(0, 5) });
        }
    }

    // 4. Підбір товару.
    let wish = parseWish(text, data);

    // Кнопки меню без критеріїв: «Підібрати річ» — питаємо, що саме.
    if (wish && !wish.criteria && !wish.more && !wish.gift && !wish.fresh && !wish.sale) {
        return reply(L.askWhat, { chips: L.chips.types });
    }

    if (wish) {

        // Попередні запити цієї розмови — щоб «до 5000» доповнило
        // «сумку», а не шукало все дешевше п'яти тисяч.
        const previous = (history || []).filter(m => m && m.author === "visitor").slice(-CONTEXT_MESSAGES).reverse()
            .map(m => parseWish(m.body, data)).filter(Boolean);
        wish = mergeWishes(wish, previous);

        // «Інші варіанти»: скільки разів поспіль людина вже просила ще.
        // Лише її повідомлення — відповіді бота між ними не рахуються.
        let pages = 0;
        if (wish.more) {
            const visitorMsgs = (history || []).filter(m => m && m.author === "visitor").reverse();
            for (const m of visitorMsgs) { if ((parseWish(m.body, data) || {}).more) pages += 1; else break; }
        }
        const offset = wish.more ? (pages + 1) * MAX_PRODUCTS : 0;

        if (!wish.criteria && !wish.fresh && !wish.sale && !wish.gift) {
            return reply(L.askWhat, { chips: L.chips.types });
        }

        const picked = pickProducts(wish, data, now, offset);

        if (!picked.items.length) {
            // «Сумка Prada», а сумок Prada немає — показуємо, що в Prada
            // Є. Тип тут не підмінюється мовчки: фраза прямо каже, що
            // сумок немає, а це інші речі того самого бренду.
            if (wish.brand && wish.type) {
                const other = pickProducts(Object.assign({}, wish, { type: undefined, budget: undefined, color: undefined }), data, now, 0);
                if (other.items.length) {
                    const what = TYPE_WORDS[lang][wish.type] || "";
                    const text0 = fill(T3[lang].brandOther, { what, brand: wish.brand });
                    return reply(text0.charAt(0).toUpperCase() + text0.slice(1), {
                        products: other.items.map(p => ({
                            slug: p.slug,
                            title: (p.title && (p.title[lang] || p.title.uk)) || p.slug,
                            price: botPriceNow(p, now),
                            url: pageUrl(site, `/p/${p.slug}/`, lang),
                            preOrder: Boolean(p.preOrder || !p.inStock)
                        })),
                        chips: [L.chips.more[1]]
                    });
                }
            }
            return reply(L.nothing, { handoff: true });
        }

        const head = picked.relaxed ? L.relaxed
            : picked.total > MAX_PRODUCTS ? fill(L.foundMore, { n: picked.start + picked.items.length, total: picked.total })
                : L.found;

        const chips = [];
        if (!wish.budget) chips.push(...L.chips.budget);
        else if (!wish.type) chips.push(...L.chips.types.slice(0, 4));
        if (picked.total > picked.start + picked.items.length) chips.push(L.chips.more[0]);
        chips.push(L.chips.more[1]);

        const products = picked.items.map(p => ({
            slug: p.slug,
            title: (p.title && (p.title[lang] || p.title.uk)) || p.slug,
            price: botPriceNow(p, now),
            url: pageUrl(site, `/p/${p.slug}/`, lang),
            preOrder: Boolean(p.preOrder || !p.inStock)
        }));

        return reply(head, { products, chips: chips.slice(0, 5) });

    }

    // 5. Привітання й подяка.
    if (list.length <= 4 && hasStem(list, ["привіт", "вітаю", "добр", "здрав", "привет", "hello", "hi", "hey", "good morning", "good afternoon", "good evening"])) {
        return reply(L.hello, { chips: L.chips.menu });
    }

    if (list.length <= 5 && hasStem(list, ["дяку", "спасиб", "благодар", "thank", "thx"])) {
        return reply(L.thanks);
    }

    // 6. Слова збіглися з частим питанням, хоч тему не впізнали.
    const loose = faqByWords(text, faq);
    if (loose) {
        return reply(`${loose.a}\n${L.faqMore} ${pageUrl(site, loose.page, lang)}`, { chips: L.chips.menu.slice(0, 5) });
    }

    // 7. Не зрозумів — чесно кажемо й передаємо людині.
    return reply(fill(L.unknown, { hours }), { handoff: true, chips: L.chips.menu.slice(0, 3) });

}

// ── Запис у базу й показ у Telegram ────────────────────────────────

export function serializeBotReply(reply, lang) {
    const L = T[botLang(lang)];
    const lines = [String(reply.text || "")];
    (reply.products || []).forEach(p => {
        lines.push(`• ${p.title} — ${botMoney(p.price)}${p.preOrder ? " (" + L.preorder + ")" : ""} ${p.url}`);
    });
    if (reply.chips && reply.chips.length) lines.push(`[[chips: ${reply.chips.join(" | ")}]]`);
    if (reply.handoff) lines.push("[[handoff]]");
    return lines.join("\n");
}

// Для власника в Telegram: без службових рядків.
export function botTelegramText(body, threadNo, escape) {
    const esc = typeof escape === "function" ? escape : (s => s);
    const clean = String(body || "").split("\n").filter(l => !/^\[\[.*\]\]$/.test(l.trim())).join("\n");
    const handoff = /\[\[handoff\]\]/.test(String(body || ""));
    return `🤖 <b>Бот відповів</b>${threadNo ? ` · розмова #${threadNo}` : ""}\n\n${esc(clean)}`
        + (handoff ? "\n\n⚠️ <b>Бот передав розмову вам</b> — відповідайте реплаєм на повідомлення покупця." : "");
}
